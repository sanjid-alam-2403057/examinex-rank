/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * EXAMINEX RANK - Local Browser Storage Module (IndexedDB via idb)
 * All data lives exclusively inside the user's browser.
 * No server, no telemetry, no cloud storage, no cookies.
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import {
  AbsentHandlingMode,
  AssessmentScheme,
  CourseHistorySnapshot,
  StudentRecord,
} from '../types';
import { DEFAULT_ASSESSMENT_SCHEME } from '../data/defaultScheme';
import { getDemoStudents } from '../data/demoData';

export interface StoredCourse {
  id: string; // Unique course identifier (e.g. 'CSE-301')
  courseCode: string;
  courseName: string;
  scheme: AssessmentScheme;
  students: StudentRecord[];
  myRoll: string;
  useManualMarks: boolean;
  manualStudent: StudentRecord | null;
  watchlist: string[];
  expectationOverrides: Record<string, number>;
  snapshots: CourseHistorySnapshot[];
  rawCsvText?: string;
  csvFilename?: string;
  lastUpdated: number;
}

export interface AppSettings {
  activeCourseId: string;
  isAnonymized: boolean;
  absentHandlingMode: AbsentHandlingMode;
  lastBackupTimestamp?: number;
  storagePersisted?: boolean;
}

export interface ExaminexBackupData {
  version: 2;
  appName: 'EXAMINEX RANK';
  exportedAt: string;
  settings: AppSettings;
  courses: StoredCourse[];
}

export interface BackupValidationPreview {
  isValid: boolean;
  error?: string;
  coursesCount: number;
  csvCount: number;
  snapshotsCount: number;
  studentsCount: number;
  exportedAtFormatted?: string;
  coursesList: { code: string; name: string; studentsCount: number }[];
}

interface ExaminexDB extends DBSchema {
  courses: {
    key: string;
    value: StoredCourse;
  };
  settings: {
    key: string;
    value: any;
  };
  csv_files: {
    key: string;
    value: { courseId: string; filename: string; csvText: string; savedAt: number };
  };
}

const DB_NAME = 'examinex_rank_local_db';
const DB_VERSION = 1;

// In-memory fallback if IndexedDB is blocked (e.g. strict private browsing or iframe sandbox)
let memoryCourses: Map<string, StoredCourse> = new Map();
let memorySettings: AppSettings = {
  activeCourseId: 'CSE-301',
  isAnonymized: true,
  absentHandlingMode: 'missing',
};
let memoryCsvs: Map<string, { courseId: string; filename: string; csvText: string; savedAt: number }> = new Map();
let isMemoryFallback = false;
let dbInstancePromise: Promise<IDBPDatabase<ExaminexDB>> | null = null;

/**
 * Initializes or retrieves the IndexedDB instance.
 * Automatically falls back to memory if IndexedDB is blocked.
 */
async function getDB(): Promise<IDBPDatabase<ExaminexDB> | null> {
  if (isMemoryFallback) return null;
  if (typeof window === 'undefined' || !window.indexedDB) {
    isMemoryFallback = true;
    return null;
  }

  if (!dbInstancePromise) {
    dbInstancePromise = openDB<ExaminexDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('courses')) {
          db.createObjectStore('courses', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
        if (!db.objectStoreNames.contains('csv_files')) {
          db.createObjectStore('csv_files', { keyPath: 'courseId' });
        }
      },
    }).catch((err) => {
      console.warn('[EXAMINEX STORAGE] IndexedDB blocked or unavailable, using in-memory fallback:', err);
      isMemoryFallback = true;
      return null as any;
    });
  }

  const db = await dbInstancePromise;
  if (!db) {
    isMemoryFallback = true;
  }
  return db;
}

/**
 * Request persistent browser storage so Safari/Chrome doesn't evict local data.
 */
export async function requestPersistentStorage(): Promise<{ persisted: boolean; supported: boolean }> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      const isPersisted = await navigator.storage.persisted();
      if (isPersisted) {
        return { persisted: true, supported: true };
      }
      const granted = await navigator.storage.persist();
      return { persisted: granted, supported: true };
    }
    return { persisted: false, supported: false };
  } catch (err) {
    console.warn('[EXAMINEX STORAGE] Persistent storage request error:', err);
    return { persisted: false, supported: false };
  }
}

/**
 * Returns whether storage is currently operating in fallback in-memory mode.
 */
export function isUsingMemoryFallback(): boolean {
  return isMemoryFallback;
}

/**
 * Creates default demo course
 */
export function createDefaultDemoCourse(): StoredCourse {
  const students = getDemoStudents();
  return {
    id: 'CSE-301',
    courseCode: DEFAULT_ASSESSMENT_SCHEME.courseCode,
    courseName: DEFAULT_ASSESSMENT_SCHEME.courseName,
    scheme: DEFAULT_ASSESSMENT_SCHEME,
    students,
    myRoll: '2021001',
    useManualMarks: false,
    manualStudent: null,
    watchlist: ['2021002', '2021004'],
    expectationOverrides: {},
    snapshots: [],
    lastUpdated: Date.now(),
  };
}

/**
 * Saves or updates a course in IndexedDB.
 */
export async function saveCourse(course: StoredCourse): Promise<void> {
  const db = await getDB();
  const updatedCourse: StoredCourse = {
    ...course,
    lastUpdated: Date.now(),
  };

  if (!db || isMemoryFallback) {
    memoryCourses.set(course.id, updatedCourse);
    return;
  }

  try {
    await db.put('courses', updatedCourse);
  } catch (err) {
    console.warn('[EXAMINEX STORAGE] Error saving course to IndexedDB, saving to memory:', err);
    isMemoryFallback = true;
    memoryCourses.set(course.id, updatedCourse);
  }
}

/**
 * Loads a specific course by ID.
 */
export async function loadCourse(courseId: string): Promise<StoredCourse | null> {
  const db = await getDB();
  if (!db || isMemoryFallback) {
    return memoryCourses.get(courseId) || null;
  }

  try {
    const course = await db.get('courses', courseId);
    return course || memoryCourses.get(courseId) || null;
  } catch (err) {
    console.warn('[EXAMINEX STORAGE] Error loading course from IndexedDB:', err);
    return memoryCourses.get(courseId) || null;
  }
}

/**
 * Lists all stored courses with summary details.
 */
export async function listCourses(): Promise<
  { id: string; courseCode: string; courseName: string; studentsCount: number; lastUpdated: number }[]
> {
  const db = await getDB();
  let allCourses: StoredCourse[] = [];

  if (!db || isMemoryFallback) {
    allCourses = Array.from(memoryCourses.values());
  } else {
    try {
      allCourses = await db.getAll('courses');
    } catch (err) {
      console.warn('[EXAMINEX STORAGE] Error fetching courses:', err);
      allCourses = Array.from(memoryCourses.values());
    }
  }

  return allCourses.map((c) => ({
    id: c.id,
    courseCode: c.courseCode,
    courseName: c.courseName,
    studentsCount: c.students.length,
    lastUpdated: c.lastUpdated,
  }));
}

/**
 * Deletes a course from IndexedDB.
 */
export async function deleteCourse(courseId: string): Promise<void> {
  const db = await getDB();
  if (!db || isMemoryFallback) {
    memoryCourses.delete(courseId);
    memoryCsvs.delete(courseId);
    return;
  }

  try {
    await db.delete('courses', courseId);
    await db.delete('csv_files', courseId);
  } catch (err) {
    console.warn('[EXAMINEX STORAGE] Error deleting course:', err);
    memoryCourses.delete(courseId);
  }
}

/**
 * Saves uploaded class CSV text with course association.
 */
export async function saveClassCsv(courseId: string, csvText: string, filename: string): Promise<void> {
  const db = await getDB();
  const entry = {
    courseId,
    filename,
    csvText,
    savedAt: Date.now(),
  };

  if (!db || isMemoryFallback) {
    memoryCsvs.set(courseId, entry);
    const existing = memoryCourses.get(courseId);
    if (existing) {
      existing.rawCsvText = csvText;
      existing.csvFilename = filename;
    }
    return;
  }

  try {
    await db.put('csv_files', entry);
    const course = await db.get('courses', courseId);
    if (course) {
      course.rawCsvText = csvText;
      course.csvFilename = filename;
      course.lastUpdated = Date.now();
      await db.put('courses', course);
    }
  } catch (err) {
    console.warn('[EXAMINEX STORAGE] Error saving CSV:', err);
    memoryCsvs.set(courseId, entry);
  }
}

/**
 * Appends a history snapshot to a course.
 */
export async function saveSnapshot(courseId: string, snapshot: CourseHistorySnapshot): Promise<void> {
  const course = await loadCourse(courseId);
  if (!course) return;

  const existing = course.snapshots || [];
  // Avoid duplicate snapshot IDs
  const filtered = existing.filter((s) => s.id !== snapshot.id);
  course.snapshots = [snapshot, ...filtered].slice(0, 50); // Keep last 50 snapshots
  await saveCourse(course);
}

/**
 * Saves application settings.
 */
export async function saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings();
  const merged: AppSettings = {
    ...current,
    ...settings,
  };

  const db = await getDB();
  if (!db || isMemoryFallback) {
    memorySettings = merged;
    return merged;
  }

  try {
    await db.put('settings', merged, 'app_settings');
  } catch (err) {
    console.warn('[EXAMINEX STORAGE] Error saving settings:', err);
    memorySettings = merged;
  }

  return merged;
}

/**
 * Loads application settings.
 */
export async function loadSettings(): Promise<AppSettings> {
  const db = await getDB();
  const defaults: AppSettings = {
    activeCourseId: 'CSE-301',
    isAnonymized: true,
    absentHandlingMode: 'missing',
  };

  if (!db || isMemoryFallback) {
    return { ...defaults, ...memorySettings };
  }

  try {
    const loaded = await db.get('settings', 'app_settings');
    return loaded ? { ...defaults, ...loaded } : defaults;
  } catch (err) {
    console.warn('[EXAMINEX STORAGE] Error loading settings:', err);
    return defaults;
  }
}

/**
 * Backs up ALL local data into one portable JSON structure.
 */
export async function exportAll(): Promise<ExaminexBackupData> {
  const db = await getDB();
  let courses: StoredCourse[] = [];
  const settings = await loadSettings();

  if (!db || isMemoryFallback) {
    courses = Array.from(memoryCourses.values());
  } else {
    try {
      courses = await db.getAll('courses');
    } catch (err) {
      console.warn('[EXAMINEX STORAGE] Error during export:', err);
      courses = Array.from(memoryCourses.values());
    }
  }

  return {
    version: 2,
    appName: 'EXAMINEX RANK',
    exportedAt: new Date().toISOString(),
    settings: {
      ...settings,
      lastBackupTimestamp: Date.now(),
    },
    courses,
  };
}

/**
 * Validates a backup JSON before restoring.
 */
export function validateBackupFile(raw: any): BackupValidationPreview {
  if (!raw || typeof raw !== 'object') {
    return {
      isValid: false,
      error: 'Invalid JSON: Expected an object.',
      coursesCount: 0,
      csvCount: 0,
      snapshotsCount: 0,
      studentsCount: 0,
      coursesList: [],
    };
  }

  if (raw.appName !== 'EXAMINEX RANK' && !raw.courses && !Array.isArray(raw.courses)) {
    return {
      isValid: false,
      error: 'Unrecognized backup file: Missing EXAMINEX RANK signature or courses list.',
      coursesCount: 0,
      csvCount: 0,
      snapshotsCount: 0,
      studentsCount: 0,
      coursesList: [],
    };
  }

  const courses = Array.isArray(raw.courses) ? raw.courses : [];
  let totalSnapshots = 0;
  let totalStudents = 0;
  let csvCount = 0;
  const coursesList: { code: string; name: string; studentsCount: number }[] = [];

  for (const c of courses) {
    if (!c.id || !c.scheme) {
      return {
        isValid: false,
        error: `Corrupted course record found with missing id or scheme.`,
        coursesCount: courses.length,
        csvCount,
        snapshotsCount: totalSnapshots,
        studentsCount: totalStudents,
        coursesList,
      };
    }
    const studentLen = Array.isArray(c.students) ? c.students.length : 0;
    const snapLen = Array.isArray(c.snapshots) ? c.snapshots.length : 0;
    totalStudents += studentLen;
    totalSnapshots += snapLen;
    if (c.rawCsvText) csvCount++;
    coursesList.push({
      code: c.courseCode || c.id,
      name: c.courseName || 'Untitled Course',
      studentsCount: studentLen,
    });
  }

  const exportedAtFormatted = raw.exportedAt
    ? new Date(raw.exportedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Unknown date';

  return {
    isValid: true,
    coursesCount: courses.length,
    csvCount,
    snapshotsCount: totalSnapshots,
    studentsCount: totalStudents,
    exportedAtFormatted,
    coursesList,
  };
}

/**
 * Imports backup data into IndexedDB (Replace or Merge mode).
 */
export async function importAll(
  backup: ExaminexBackupData,
  mode: 'replace' | 'merge'
): Promise<{ coursesImported: number; snapshotsImported: number }> {
  const validation = validateBackupFile(backup);
  if (!validation.isValid) {
    throw new Error(validation.error || 'Backup validation failed.');
  }

  const db = await getDB();
  let coursesImported = 0;
  let snapshotsImported = 0;

  if (mode === 'replace') {
    if (!db || isMemoryFallback) {
      memoryCourses.clear();
      memoryCsvs.clear();
    } else {
      try {
        await db.clear('courses');
        await db.clear('csv_files');
      } catch (err) {
        console.warn('[EXAMINEX STORAGE] Clear failed:', err);
      }
    }
  }

  for (const c of backup.courses) {
    if (mode === 'merge') {
      const existing = await loadCourse(c.id);
      if (existing) {
        // Merge snapshots without duplicates
        const existingSnapIds = new Set((existing.snapshots || []).map((s) => s.id));
        const newSnaps = (c.snapshots || []).filter((s) => !existingSnapIds.has(s.id));
        c.snapshots = [...(existing.snapshots || []), ...newSnaps];
      }
    }

    await saveCourse(c);
    coursesImported++;
    snapshotsImported += (c.snapshots || []).length;

    if (c.rawCsvText && c.csvFilename) {
      await saveClassCsv(c.id, c.rawCsvText, c.csvFilename);
    }
  }

  // Restore settings
  if (backup.settings) {
    await saveSettings({
      ...backup.settings,
      lastBackupTimestamp: Date.now(),
    });
  }

  return { coursesImported, snapshotsImported };
}

/**
 * Deletes all stored data completely (Privacy wipe).
 */
export async function deleteAllData(): Promise<void> {
  const db = await getDB();
  memoryCourses.clear();
  memoryCsvs.clear();
  memorySettings = {
    activeCourseId: 'CSE-301',
    isAnonymized: true,
    absentHandlingMode: 'missing',
  };

  if (!db || isMemoryFallback) return;

  try {
    await db.clear('courses');
    await db.clear('csv_files');
    await db.clear('settings');
  } catch (err) {
    console.warn('[EXAMINEX STORAGE] Error wiping data:', err);
  }
}
