import {
  AbsentHandlingMode,
  AssessmentScheme,
  ColumnMapping,
  ParseResult,
  StudentRecord,
  ValidationError,
} from '../types';

/**
 * Tokenize a CSV string into an array of rows and cells.
 * Handles UTF-8 BOM, Unicode / Bangla names, quoted strings with commas and escaped quotes, and CRLF / LF.
 */
export function tokenizeCsv(csvText: string): string[][] {
  let cleanText = csvText;
  // Strip UTF-8 BOM if present
  if (cleanText.charCodeAt(0) === 0xfeff) {
    cleanText = cleanText.slice(1);
  }

  // Detect delimiter: check first line for semicolons vs commas vs tabs
  const firstLine = cleanText.split(/\r\n|\n|\r/)[0] || '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  let delimiter = ',';
  if (semicolonCount > commaCount && semicolonCount > tabCount) {
    delimiter = ';';
  } else if (tabCount > commaCount && tabCount > semicolonCount) {
    delimiter = '\t';
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let insideQuotes = false;
  let i = 0;
  const len = cleanText.length;

  while (i < len) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (insideQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote: "" -> "
          currentCell += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          insideQuotes = false;
          i++;
          continue;
        }
      } else {
        currentCell += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
        i++;
        continue;
      } else if (char === delimiter) {
        currentRow.push(currentCell.trim());
        currentCell = '';
        i++;
        continue;
      } else if (char === '\r' || char === '\n') {
        currentRow.push(currentCell.trim());
        currentCell = '';
        if (char === '\r' && nextChar === '\n') {
          i += 2;
        } else {
          i++;
        }
        if (currentRow.some((c) => c !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        continue;
      } else {
        currentCell += char;
        i++;
        continue;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Standardize text for loose column matching
 */
function normalizeHeader(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Auto-suggest column mappings between CSV headers and the Assessment Scheme.
 * Expected columns (case-insensitive): roll, name (optional), attendance, ct1, ct2, ct3, ct4, assignment, final
 */
export function suggestColumnMappings(
  csvHeaders: string[],
  scheme: AssessmentScheme
): ColumnMapping[] {
  const targetFields: { id: string; aliases: string[] }[] = [
    { id: 'roll', aliases: ['roll', 'rollno', 'rollnumber', 'studentid', 'id', 'idno', 'registration'] },
    { id: 'name', aliases: ['name', 'studentname', 'student', 'fullname'] },
    { id: 'is_me', aliases: ['isme', 'me', 'myself', 'currentuser', 'self'] },
  ];

  for (const comp of scheme.components) {
    if (comp.type === 'single') {
      targetFields.push({
        id: comp.id,
        aliases: [
          normalizeHeader(comp.id),
          normalizeHeader(comp.name),
          ...(comp.isFinalExam ? ['final', 'semesterfinal', 'termfinal', 'finalexam', 'finals'] : []),
        ],
      });
    } else if (comp.type === 'best_n_of_m' && comp.subComponents) {
      for (const sub of comp.subComponents) {
        targetFields.push({
          id: sub.id,
          aliases: [
            normalizeHeader(sub.id),
            normalizeHeader(sub.name),
            normalizeHeader(sub.name.replace(/\s+/g, '')),
          ],
        });
      }
    }
  }

  return csvHeaders.map((header) => {
    const norm = normalizeHeader(header);
    const matched = targetFields.find(
      (tf) => tf.id.toLowerCase() === norm || tf.aliases.includes(norm)
    );

    return {
      csvColumn: header,
      targetFieldId: matched ? matched.id : 'ignore',
      isIgnored: !matched,
    };
  });
}

function parseBoolean(val: string | undefined): boolean {
  if (!val) return false;
  const s = val.trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 't' || s === 'y';
}

function isAbsentMarker(val: string): boolean {
  const s = val.trim().toLowerCase();
  return s === 'ab' || s === 'abs' || s === 'absent' || s === '-' || s === 'n/a';
}

/**
 * Validates and converts raw parsed CSV rows into typed StudentRecords.
 * Supports absentMode: 'missing' (null) vs 'zero' (0).
 * Blank cells always mean "not yet taken" (null), never zero!
 */
export function validateAndParseRecords(
  rows: string[][],
  mappings: ColumnMapping[],
  scheme: AssessmentScheme,
  absentMode: AbsentHandlingMode = 'missing'
): ParseResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (rows.length < 2) {
    return {
      success: false,
      students: [],
      errors: [
        {
          row: 1,
          message: 'The uploaded CSV file is empty or missing data rows.',
          severity: 'error',
        },
      ],
      warnings: [],
      detectedColumns: [],
      suggestedMappings: [],
      unmappedColumns: [],
      rawRowsCount: 0,
    };
  }

  const headerRow = rows[0];
  const dataRows = rows.slice(1);

  const indexToFieldMap = new Map<number, string>();
  for (let colIdx = 0; colIdx < headerRow.length; colIdx++) {
    const headerName = headerRow[colIdx];
    const mapping = mappings.find(
      (m) => m.csvColumn.toLowerCase() === headerName.toLowerCase() && !m.isIgnored
    );
    if (mapping && mapping.targetFieldId !== 'ignore') {
      indexToFieldMap.set(colIdx, mapping.targetFieldId);
    }
  }

  const mappedFieldValues = Array.from(indexToFieldMap.values());
  const hasRoll = mappedFieldValues.includes('roll');
  const hasName = mappedFieldValues.includes('name');

  if (!hasRoll && !hasName) {
    errors.push({
      row: 1,
      column: 'roll',
      message: "Required identifier missing: Please map at least 'Roll' or 'Student Name'.",
      severity: 'error',
    });
  }

  const maxMarksMap = new Map<string, { max: number; name: string }>();
  for (const comp of scheme.components) {
    if (comp.type === 'single') {
      maxMarksMap.set(comp.id, {
        max: comp.maxMarks || comp.weight,
        name: comp.name,
      });
    } else if (comp.subComponents) {
      for (const sub of comp.subComponents) {
        maxMarksMap.set(sub.id, {
          max: sub.maxMarks,
          name: `${comp.name} (${sub.name})`,
        });
      }
    }
  }

  const seenRolls = new Set<string>();
  const seenNames = new Set<string>();
  const students: StudentRecord[] = [];
  let meCount = 0;
  let skippedRowsCount = 0;

  dataRows.forEach((rowCells, rowIdx) => {
    const csvRowNum = rowIdx + 2;
    let roll: string | undefined = undefined;
    let studentName = '';
    let isMe = false;
    const marks: Record<string, number | null> = {};
    let finalMark: number | null = null;
    let rowHasData = false;

    for (let colIdx = 0; colIdx < rowCells.length; colIdx++) {
      const cellVal = rowCells[colIdx];
      const fieldId = indexToFieldMap.get(colIdx);
      if (!fieldId) continue;

      const trimmed = cellVal.trim();
      if (trimmed !== '') rowHasData = true;

      if (fieldId === 'roll') {
        roll = trimmed;
      } else if (fieldId === 'name') {
        studentName = trimmed;
      } else if (fieldId === 'is_me') {
        isMe = parseBoolean(trimmed);
      } else if (fieldId === 'final') {
        if (trimmed === '') {
          finalMark = null; // Blank = not yet taken
        } else if (isAbsentMarker(trimmed)) {
          finalMark = absentMode === 'zero' ? 0 : null;
        } else {
          const num = Number(trimmed);
          if (isNaN(num)) {
            errors.push({
              row: csvRowNum,
              column: 'final',
              studentName,
              studentRoll: roll,
              message: `Row ${csvRowNum}: Semester Final mark '${trimmed}' is non-numeric.`,
              severity: 'error',
            });
          } else if (num < 0) {
            errors.push({
              row: csvRowNum,
              column: 'final',
              studentName,
              studentRoll: roll,
              message: `Row ${csvRowNum}: Semester Final mark cannot be negative (${num}).`,
              severity: 'error',
            });
          } else {
            const finalComp = scheme.components.find((c) => c.isFinalExam);
            const maxF = finalComp?.weight || 60;
            if (num > maxF) {
              errors.push({
                row: csvRowNum,
                column: 'final',
                studentName,
                studentRoll: roll,
                message: `Row ${csvRowNum}: Semester Final mark (${num}) exceeds maximum allowed (${maxF}).`,
                severity: 'error',
              });
            } else {
              finalMark = num;
            }
          }
        }
      } else {
        // Component / Subcomponent marks
        if (trimmed === '') {
          marks[fieldId] = null; // Blank = not taken yet, never zero
        } else if (isAbsentMarker(trimmed)) {
          marks[fieldId] = absentMode === 'zero' ? 0 : null;
        } else {
          const num = Number(trimmed);
          if (isNaN(num)) {
            errors.push({
              row: csvRowNum,
              column: fieldId,
              studentName,
              studentRoll: roll,
              message: `Row ${csvRowNum}: '${trimmed}' in ${fieldId} is not a valid number.`,
              severity: 'error',
            });
          } else if (num < 0) {
            errors.push({
              row: csvRowNum,
              column: fieldId,
              studentName,
              studentRoll: roll,
              message: `Row ${csvRowNum}: Mark for ${fieldId} cannot be negative (${num}).`,
              severity: 'error',
            });
          } else {
            const rule = maxMarksMap.get(fieldId);
            if (rule && num > rule.max) {
              errors.push({
                row: csvRowNum,
                column: fieldId,
                studentName,
                studentRoll: roll,
                message: `Row ${csvRowNum}: Mark ${num} for ${rule.name} exceeds maximum allowed of ${rule.max}.`,
                severity: 'error',
              });
            } else {
              marks[fieldId] = num;
            }
          }
        }
      }
    }

    if (!rowHasData) {
      skippedRowsCount++;
      return;
    }

    // Name is optional if roll exists
    if (!studentName && roll) {
      studentName = `Roll ${roll}`;
    }

    if (!studentName && !roll) {
      errors.push({
        row: csvRowNum,
        column: 'name',
        message: `Row ${csvRowNum}: Missing both Roll and Student Name.`,
        severity: 'error',
      });
      return;
    }

    // Duplicate Roll check
    const currentRoll: string | undefined = roll;
    if (currentRoll) {
      const cleanRoll = currentRoll.toLowerCase();
      if (seenRolls.has(cleanRoll)) {
        errors.push({
          row: csvRowNum,
          column: 'roll',
          studentRoll: currentRoll,
          studentName,
          message: `Row ${csvRowNum}: Duplicate roll number '${currentRoll}'. Roll numbers must be unique.`,
          severity: 'error',
        });
      } else {
        seenRolls.add(cleanRoll);
      }
    } else if (studentName) {
      const cleanName = studentName.toLowerCase();
      if (seenNames.has(cleanName)) {
        errors.push({
          row: csvRowNum,
          column: 'name',
          studentName,
          message: `Row ${csvRowNum}: Duplicate student name '${studentName}'.`,
          severity: 'error',
        });
      } else {
        seenNames.add(cleanName);
      }
    }

    if (isMe) {
      meCount++;
    }

    students.push({
      id: roll ? `roll_${roll}` : `student_${rowIdx + 1}`,
      roll,
      name: studentName,
      isMe,
      marks,
      finalMark,
    });
  });

  if (meCount > 1) {
    errors.push({
      row: 1,
      column: 'is_me',
      message: `Multiple rows (${meCount}) marked as 'is_me = TRUE'. Exactly one student can be designated as you.`,
      severity: 'error',
    });
  } else if (meCount === 0 && students.length > 0) {
    warnings.push({
      row: 1,
      column: 'is_me',
      message: `No row designated as 'is_me = TRUE'. You can identify yourself via roll number or manual entry.`,
      severity: 'warning',
    });
  }

  const detectedColumns = headerRow;
  const unmappedColumns = headerRow.filter((h) => {
    const m = mappings.find((item) => item.csvColumn.toLowerCase() === h.toLowerCase());
    return !m || m.isIgnored;
  });

  return {
    success: errors.length === 0,
    students,
    errors,
    warnings,
    detectedColumns,
    suggestedMappings: mappings,
    unmappedColumns,
    rawRowsCount: dataRows.length,
    importSummary: {
      totalRows: dataRows.length,
      validStudents: students.length,
      skippedRows: skippedRowsCount,
      warningCount: warnings.length,
      errorCount: errors.length,
    },
  };
}

/**
 * Fuzzy / close match roll lookup
 */
export function findStudentByRoll(
  students: StudentRecord[],
  queryRoll: string
): { exact: StudentRecord | null; closeMatches: StudentRecord[] } {
  if (!queryRoll.trim()) return { exact: null, closeMatches: [] };
  const clean = queryRoll.trim().toLowerCase();

  const exact = students.find((s) => s.roll?.toLowerCase() === clean) || null;
  if (exact) {
    return { exact, closeMatches: [exact] };
  }

  // Close matches: substring or similarity
  const closeMatches = students.filter((s) => {
    if (!s.roll) return false;
    const r = s.roll.toLowerCase();
    return r.includes(clean) || clean.includes(r) || levenshteinDistance(r, clean) <= 2;
  });

  return { exact: null, closeMatches: closeMatches.slice(0, 5) };
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + 1);
      }
    }
  }

  return dp[m][n];
}

/**
 * Option B: Manual marks override helper.
 * They are added as "Me" and override any CSV row with the same roll.
 * Everyone else always comes from the CSV.
 */
export function applyManualStudentOverride(
  csvStudents: StudentRecord[],
  myManualStudent: StudentRecord
): StudentRecord[] {
  const myRoll = myManualStudent.roll?.trim().toLowerCase();
  let replaced = false;

  const result = csvStudents.map((st) => {
    const isMatchingRoll = myRoll && st.roll?.toLowerCase() === myRoll;
    if (isMatchingRoll || st.isMe) {
      if (isMatchingRoll) {
        replaced = true;
        return { ...myManualStudent, isMe: true, manualOverride: true };
      }
      return { ...st, isMe: false };
    }
    return st;
  });

  if (!replaced) {
    return [{ ...myManualStudent, isMe: true, manualOverride: true }, ...result];
  }

  return result;
}
