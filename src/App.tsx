/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * EXAMINEX RANK - Personal Client-Side Web Application
 * Runs 100% in the user's browser, deployable on GitHub Pages.
 * IndexedDB local storage with auto-save and zero server dependency.
 */

import React, { useState, useEffect, useRef } from 'react';
import { HashRouter, useNavigate, useLocation } from 'react-router-dom';
import { AssessmentScheme, StudentRecord } from './types';
import { DEFAULT_ASSESSMENT_SCHEME } from './data/defaultScheme';
import { getDemoStudents } from './data/demoData';
import { Header, NavTab } from './components/Header';
import { PrivacyBanner } from './components/PrivacyBanner';
import { TargetCalculatorView } from './components/TargetCalculatorView';
import { ClassComparisonView } from './components/ClassComparisonView';
import { SchemeEditor } from './components/SchemeEditor';
import { CsvUploader } from './components/CsvUploader';
import { TestRunnerModal } from './components/TestRunnerModal';
import { BackupRestoreModal } from './components/BackupRestoreModal';
import { FeedbackProvider, useFeedback } from './components/FeedbackSystem';
import {
  saveCourse,
  loadCourse,
  listCourses,
  deleteCourse,
  saveSettings,
  loadSettings,
  createDefaultDemoCourse,
  isUsingMemoryFallback,
  requestPersistentStorage,
  deleteAllData,
  StoredCourse,
} from './storage';
import {
  ShieldCheck,
  CheckCircle2,
  Users,
  Target,
  Sliders,
  FileSpreadsheet,
  CheckSquare,
  Sparkles,
  BarChart3,
  Menu,
  X,
  Database,
  AlertTriangle,
  Plus,
  Trash2,
  FolderOpen,
  CloudOff,
  Clock,
  Layers,
} from 'lucide-react';

function AppContent() {
  const { showConfirm, showToast, showAlert } = useFeedback();
  const navigate = useNavigate();
  const location = useLocation();

  // Storage and Course state
  const [currentCourse, setCurrentCourse] = useState<StoredCourse>(() => createDefaultDemoCourse());
  const [coursesList, setCoursesList] = useState<{ id: string; courseCode: string; courseName: string; studentsCount: number }[]>([]);
  const [isLoadingStorage, setIsLoadingStorage] = useState<boolean>(true);
  const [storageLoadError, setStorageLoadError] = useState<string | null>(null);

  // Auto-save state
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('saved');
  const [saveStatusMessage, setSaveStatusMessage] = useState<string>('Saved ✓');
  const autoSaveTimerRef = useRef<any>(null);
  const isFirstMountRef = useRef<boolean>(true);

  // Backup & Privacy state
  const [showBackupModal, setShowBackupModal] = useState<boolean>(false);
  const [lastBackupTimestamp, setLastBackupTimestamp] = useState<number | undefined>(undefined);
  const [isAnonymized, setIsAnonymized] = useState<boolean>(true);
  const [isStorageBlockedBanner, setIsStorageBlockedBanner] = useState<boolean>(false);
  const [showNewCourseModal, setShowNewCourseModal] = useState<boolean>(false);
  const [newCourseCode, setNewCourseCode] = useState<string>('');
  const [newCourseName, setNewCourseName] = useState<string>('');

  // Synchronize active tab from HashRouter location
  const currentPath = location.pathname.replace(/^\//, '');
  const validTabs: NavTab[] = ['comparison', 'calculator', 'scheme', 'upload', 'tests'];
  const activeTab: NavTab = validTabs.includes(currentPath as NavTab) ? (currentPath as NavTab) : 'comparison';

  const setActiveTab = (tab: NavTab) => {
    navigate(`/${tab}`);
  };

  // 1. Initialize IndexedDB on startup
  useEffect(() => {
    async function initStorage() {
      setIsLoadingStorage(true);
      try {
        await requestPersistentStorage();
        const settings = await loadSettings();
        setLastBackupTimestamp(settings.lastBackupTimestamp);
        setIsAnonymized(settings.isAnonymized ?? true);

        const list = await listCourses();
        setCoursesList(list);

        if (list.length === 0) {
          // First launch: initialize default course
          const demo = createDefaultDemoCourse();
          await saveCourse(demo);
          setCurrentCourse(demo);
          setCoursesList([{ id: demo.id, courseCode: demo.courseCode, courseName: demo.courseName, studentsCount: demo.students.length }]);
        } else {
          // Load active course
          const active = await loadCourse(settings.activeCourseId);
          if (active) {
            setCurrentCourse(active);
          } else {
            const first = await loadCourse(list[0].id);
            if (first) setCurrentCourse(first);
          }
        }

        if (isUsingMemoryFallback()) {
          setIsStorageBlockedBanner(true);
        }
      } catch (err: unknown) {
        console.error('[STORAGE INIT ERROR]:', err);
        setStorageLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoadingStorage(false);
      }
    }

    initStorage();
  }, []);

  // 2. Auto-save with 500ms debounce whenever currentCourse or isAnonymized changes
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }
    if (isLoadingStorage) return;

    setSaveStatus('saving');

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        await saveCourse(currentCourse);
        await saveSettings({
          activeCourseId: currentCourse.id,
          isAnonymized,
        });

        const list = await listCourses();
        setCoursesList(list);

        setSaveStatus('saved');
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setSaveStatusMessage(`Saved ✓ ${timeStr}`);
      } catch (err: unknown) {
        console.error('[AUTO-SAVE ERROR]:', err);
        setSaveStatus('error');
        setSaveStatusMessage('Save failed');
      }
    }, 500);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [currentCourse, isAnonymized]);

  // Derived course values
  const scheme = currentCourse.scheme;
  const students = currentCourse.students;
  const isDemoMode = currentCourse.id === 'CSE-301' && currentCourse.students.length === 35;
  const currentMeStudent = students.find((s) => s.isMe || s.roll === currentCourse.myRoll);

  // Switch Course
  const handleSelectCourse = async (courseId: string) => {
    try {
      const course = await loadCourse(courseId);
      if (course) {
        setCurrentCourse(course);
        await saveSettings({ activeCourseId: courseId });
        showToast(`Loaded ${course.courseCode} (${course.students.length} students)`, 'info');
      }
    } catch (err) {
      showAlert('Course Load Error', 'Could not load the selected course.');
    }
  };

  // Create New Course
  const handleCreateNewCourse = async () => {
    if (!newCourseCode.trim()) {
      showAlert('Course Code Required', 'Please provide a course code (e.g. CSE 401).');
      return;
    }

    const code = newCourseCode.trim().toUpperCase();
    const id = code.replace(/\s+/g, '-');
    const newCourseScheme: AssessmentScheme = {
      ...DEFAULT_ASSESSMENT_SCHEME,
      courseCode: code,
      courseName: newCourseName.trim() || 'New Assessment Course',
    };

    const newCourse: StoredCourse = {
      id,
      courseCode: code,
      courseName: newCourseScheme.courseName,
      scheme: newCourseScheme,
      students: [],
      myRoll: '',
      useManualMarks: false,
      manualStudent: null,
      watchlist: [],
      expectationOverrides: {},
      snapshots: [],
      lastUpdated: Date.now(),
    };

    await saveCourse(newCourse);
    setCurrentCourse(newCourse);
    const list = await listCourses();
    setCoursesList(list);
    setShowNewCourseModal(false);
    setNewCourseCode('');
    setNewCourseName('');
    setActiveTab('upload');
    showToast(`Created new course: ${code}. You can now upload your class CSV.`, 'success');
  };

  // Delete Current Course
  const handleDeleteCurrentCourse = () => {
    showConfirm({
      title: `Delete ${currentCourse.courseCode}?`,
      message: `Are you sure you want to delete ${currentCourse.courseCode} and its ${students.length} classmate records? This cannot be undone.`,
      confirmLabel: 'Delete Course',
      isDestructive: true,
      onConfirm: async () => {
        await deleteCourse(currentCourse.id);
        const list = await listCourses();
        setCoursesList(list);

        if (list.length > 0) {
          const next = await loadCourse(list[0].id);
          if (next) setCurrentCourse(next);
        } else {
          const fresh = createDefaultDemoCourse();
          await saveCourse(fresh);
          setCurrentCourse(fresh);
          setCoursesList([{ id: fresh.id, courseCode: fresh.courseCode, courseName: fresh.courseName, studentsCount: fresh.students.length }]);
        }
        showToast(`Deleted ${currentCourse.courseCode}`, 'info');
      },
    });
  };

  // Toggle Demo Data
  const handleToggleDemoMode = () => {
    if (isDemoMode) {
      setCurrentCourse((prev) => ({
        ...prev,
        students: [],
        rawCsvText: undefined,
        csvFilename: undefined,
        snapshots: [],
      }));
      showToast('Switched to empty workspace for custom marks', 'info');
    } else {
      const demo = createDefaultDemoCourse();
      setCurrentCourse(demo);
      setActiveTab('comparison');
      showToast('Loaded demo university dataset (35 students)', 'success');
    }
  };

  // Toggle Anonymize
  const handleToggleAnonymize = () => {
    setIsAnonymized((prev) => {
      const next = !prev;
      showToast(next ? 'Names hidden for privacy' : 'Student names visible', 'info');
      return next;
    });
  };

  // Reset Session Data
  const handleResetData = () => {
    showConfirm({
      title: 'Reset Active Course Data',
      message: 'Are you sure you want to clear all student marks from this course? This cannot be undone.',
      confirmLabel: 'Reset Marks',
      isDestructive: true,
      onConfirm: () => {
        setCurrentCourse((prev) => ({
          ...prev,
          students: [],
          myRoll: '',
          manualStudent: null,
          useManualMarks: false,
          snapshots: [],
          rawCsvText: undefined,
        }));
        setActiveTab('upload');
        showToast('All student marks have been cleared from this course.', 'info');
      },
    });
  };

  // Data Loaded via CSV Uploader
  const handleDataLoaded = (loadedStudents: StudentRecord[], filename?: string) => {
    setCurrentCourse((prev) => ({
      ...prev,
      students: loadedStudents,
      csvFilename: filename || prev.csvFilename || 'class_data.csv',
      lastUpdated: Date.now(),
    }));
    setActiveTab('comparison');
    showToast(`Loaded ${loadedStudents.length} student records successfully!`, 'success');
  };

  // Update Assessment Scheme
  const handleUpdateScheme = (newScheme: AssessmentScheme) => {
    setCurrentCourse((prev) => ({
      ...prev,
      scheme: newScheme,
      courseCode: newScheme.courseCode,
      courseName: newScheme.courseName,
      lastUpdated: Date.now(),
    }));
    showToast('Assessment scheme updated and saved.', 'success');
  };

  // Refresh data after backup restore
  const handleDataRestored = async () => {
    const list = await listCourses();
    setCoursesList(list);
    const settings = await loadSettings();
    setLastBackupTimestamp(settings.lastBackupTimestamp);
    if (list.length > 0) {
      const active = await loadCourse(settings.activeCourseId) || await loadCourse(list[0].id);
      if (active) setCurrentCourse(active);
    }
  };

  // Days since last backup for reminder
  const daysSinceBackup = lastBackupTimestamp
    ? Math.floor((Date.now() - lastBackupTimestamp) / (1000 * 60 * 60 * 24))
    : null;

  const navItems = [
    {
      id: 'comparison' as NavTab,
      label: 'Class Comparison',
      badge: 'Main',
      icon: Users,
      description: 'Rank, competitors, radar & predictions',
    },
    {
      id: 'calculator' as NavTab,
      label: 'A+ Target Calculator',
      badge: null,
      icon: Target,
      description: 'Final exam marks needed & bounds',
    },
    {
      id: 'scheme' as NavTab,
      label: 'Assessment Scheme',
      badge: null,
      icon: Sliders,
      description: 'Weights, Best N of M & grade cutoffs',
    },
    {
      id: 'upload' as NavTab,
      label: 'CSV Data & Mapping',
      badge: null,
      icon: FileSpreadsheet,
      description: 'Upload class CSV, mapping & validation',
    },
    {
      id: 'tests' as NavTab,
      label: 'Algorithm & Storage Tests',
      badge: '23 Tests',
      icon: CheckSquare,
      description: 'Math invariants & IndexedDB proofs',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isDemoMode={isDemoMode}
        onToggleDemoMode={handleToggleDemoMode}
        isAnonymized={isAnonymized}
        onToggleAnonymize={handleToggleAnonymize}
        onResetData={handleResetData}
        hasData={students.length > 0}
        meStudentName={currentMeStudent?.name}
        saveStatus={saveStatus}
        saveStatusMessage={saveStatusMessage}
        onOpenBackup={() => setShowBackupModal(true)}
        daysSinceBackup={daysSinceBackup}
        isStorageBlocked={isStorageBlockedBanner}
      />

      {/* Storage-Blocked Banner (Private Browsing / Sandbox) */}
      {isStorageBlockedBanner && (
        <div className="bg-amber-500 text-white px-4 py-2 text-xs font-medium flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
            <CloudOff className="w-4 h-4 shrink-0" />
            <span>
              <strong>Saving is disabled in this environment</strong> (private browsing mode or sandboxed iframe). Changes remain in memory for this session. Use the <strong>Backup</strong> button to download your work, or open the published website.
            </span>
          </div>
          <button
            onClick={() => setIsStorageBlockedBanner(false)}
            className="text-white hover:text-amber-100 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 14-Day Backup Reminder Banner */}
      {daysSinceBackup !== null && daysSinceBackup >= 14 && (
        <div className="bg-indigo-900 text-indigo-100 px-4 py-2 text-xs flex items-center justify-between border-b border-indigo-800">
          <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
            <Clock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              You haven&apos;t downloaded a backup in <strong>{daysSinceBackup} days</strong>. Protect your data against browser cache wipes by making a 5-second backup.
            </span>
            <button
              onClick={() => setShowBackupModal(true)}
              className="ml-2 underline font-bold text-white hover:text-indigo-200"
            >
              Backup Now
            </button>
          </div>
        </div>
      )}

      {/* Privacy Notice Banner */}
      <PrivacyBanner
        isAnonymized={isAnonymized}
        onToggleAnonymize={handleToggleAnonymize}
        onDeleteData={handleResetData}
        hasData={students.length > 0}
      />

      {/* Main Workspace with Sidebar Navigation */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col lg:flex-row gap-6">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-64 shrink-0 space-y-4">
          {/* Navigation Links */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-3 pb-2 block">
              Navigation
            </span>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left transition-colors ${
                    isActive
                      ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                    <span className="text-xs truncate">{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                        isActive
                          ? 'bg-indigo-700 text-indigo-100'
                          : 'bg-indigo-50 text-indigo-700'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Course Switcher Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Course Library
              </span>
              <button
                onClick={() => setShowNewCourseModal(true)}
                title="Add new course"
                className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>

            {/* Course Selector Dropdown */}
            {coursesList.length > 1 && (
              <select
                value={currentCourse.id}
                onChange={(e) => handleSelectCourse(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {coursesList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.courseCode} ({c.studentsCount} students)
                  </option>
                ))}
              </select>
            )}

            <div className="font-bold text-slate-900 font-mono text-sm">
              {scheme.courseCode}
            </div>
            <p className="text-slate-600 text-[11px] line-clamp-2">
              {scheme.courseName}
            </p>

            <div className="pt-2 border-t border-slate-100 space-y-1 text-[11px] text-slate-500 font-mono">
              <div className="flex justify-between">
                <span>Total Marks:</span>
                <span className="font-bold text-slate-800">{scheme.totalMarks}</span>
              </div>
              <div className="flex justify-between">
                <span>Target Cutoff:</span>
                <span className="font-bold text-indigo-700">
                  {scheme.targetGradeName} (≥ {scheme.targetGradeThreshold})
                </span>
              </div>
              <div className="flex justify-between">
                <span>Enrolled Class:</span>
                <span className="font-bold text-slate-800">{students.length} students</span>
              </div>
            </div>

            {/* Delete Course Link */}
            {coursesList.length > 1 && (
              <div className="pt-2 border-t border-slate-100 flex justify-end">
                <button
                  onClick={handleDeleteCurrentCourse}
                  className="text-[10px] text-rose-600 hover:text-rose-800 flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Delete this course</span>
                </button>
              </div>
            )}
          </div>

          {/* Backup & Offline Info Card */}
          <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-100 text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold text-indigo-950">
              <Database className="w-4 h-4 text-indigo-600" />
              <span>Personal Data</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Saved automatically in IndexedDB. Use Backup & Restore to move between your computer and mobile browser.
            </p>
            <button
              onClick={() => setShowBackupModal(true)}
              className="w-full py-1.5 px-3 bg-white hover:bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold rounded-lg text-center transition-colors shadow-2xs text-[11px]"
            >
              Open Backup & Restore
            </button>
          </div>
        </aside>

        {/* Content Viewport */}
        <main className="flex-1 min-w-0 space-y-6">
          {/* Active Dataset Status pill banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  isDemoMode ? 'bg-indigo-500' : students.length > 0 ? 'bg-emerald-500' : 'bg-slate-300'
                }`}
              />
              <span className="font-semibold text-slate-800">
                {isDemoMode
                  ? 'Demo Mode Active'
                  : students.length > 0
                  ? 'Custom CSV Dataset Active'
                  : 'No Dataset Loaded'}
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-600 font-mono">
                {students.length > 0
                  ? `${students.length} students loaded`
                  : 'Upload CSV or click Load Demo to begin'}
              </span>
              {currentMeStudent && (
                <>
                  <span className="text-slate-400">·</span>
                  <span className="text-indigo-700 font-medium">
                    You:{' '}
                    <strong>
                      {isAnonymized ? 'Me (Student)' : currentMeStudent.name}
                    </strong>{' '}
                    <span className="font-mono text-slate-500">
                      ({currentMeStudent.roll || 'No Roll'})
                    </span>
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <span>Target: <strong className="text-indigo-700">{scheme.targetGradeThreshold} marks ({scheme.targetGradeName})</strong></span>
            </div>
          </div>

          {/* Tab: Class Comparison */}
          {activeTab === 'comparison' && (
            <ClassComparisonView
              scheme={scheme}
              students={students}
              onUpdateStudents={handleDataLoaded}
              isAnonymized={isAnonymized}
              onToggleAnonymize={handleToggleAnonymize}
              onDeleteClassData={handleResetData}
            />
          )}

          {/* Tab: A+ Target Calculator */}
          {activeTab === 'calculator' && (
            <TargetCalculatorView
              scheme={scheme}
              students={students}
              isAnonymized={isAnonymized}
              onOpenUpload={() => setActiveTab('upload')}
            />
          )}

          {/* Tab: Assessment Scheme Editor */}
          {activeTab === 'scheme' && (
            <SchemeEditor
              scheme={scheme}
              onUpdateScheme={handleUpdateScheme}
            />
          )}

          {/* Tab: CSV Data Upload & Mapping */}
          {activeTab === 'upload' && (
            <CsvUploader
              scheme={scheme}
              onDataLoaded={handleDataLoaded}
              currentStudentsCount={students.length}
              currentMeStudent={currentMeStudent}
            />
          )}

          {/* Tab: Algorithm & Storage Tests */}
          {activeTab === 'tests' && <TestRunnerModal />}
        </main>
      </div>

      {/* New Course Modal */}
      {showNewCourseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Add New Course</h3>
              <button
                onClick={() => setShowNewCourseModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Course Code:</label>
                <input
                  type="text"
                  value={newCourseCode}
                  onChange={(e) => setNewCourseCode(e.target.value)}
                  placeholder="e.g. CSE 401, MATH 201"
                  className="w-full p-2 border border-slate-300 rounded-lg font-mono font-bold uppercase text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Course Title:</label>
                <input
                  type="text"
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  placeholder="e.g. Operating Systems"
                  className="w-full p-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowNewCourseModal(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNewCourse}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
              >
                Create Course
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backup & Restore Center Modal */}
      <BackupRestoreModal
        isOpen={showBackupModal}
        onClose={() => setShowBackupModal(false)}
        onDataRestored={handleDataRestored}
        lastBackupTimestamp={lastBackupTimestamp}
      />

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 px-4 sm:px-6 text-xs text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">EXAMINEX RANK</span>
            <span>—</span>
            <span>Personal Static Web App for GitHub Pages</span>
          </div>

          <div className="flex items-center gap-4 text-slate-500 text-[11px]">
            <button
              onClick={() => setActiveTab('tests')}
              className="hover:text-slate-900 underline underline-offset-2"
            >
              Run 23 Automated Tests
            </button>
            <span className="text-slate-300">|</span>
            <button
              onClick={() => setShowBackupModal(true)}
              className="hover:text-slate-900 underline underline-offset-2 flex items-center gap-1"
            >
              <Database className="w-3.5 h-3.5" />
              Backup & Restore
            </button>
            <span className="text-slate-300">|</span>
            <span className="flex items-center gap-1 text-emerald-700">
              <ShieldCheck className="w-3.5 h-3.5" />
              100% Private (IndexedDB)
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <FeedbackProvider>
        <AppContent />
      </FeedbackProvider>
    </HashRouter>
  );
}
