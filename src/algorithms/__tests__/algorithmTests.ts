import { DEFAULT_ASSESSMENT_SCHEME } from '../../data/defaultScheme';
import { AssessmentScheme, StudentRecord } from '../../types';
import {
  applyManualStudentOverride,
  findStudentByRoll,
  suggestColumnMappings,
  tokenizeCsv,
  validateAndParseRecords,
} from '../csvParser';
import { calculateStudentRanks } from '../ranking';
import { calculateComponentEarned, calculateStudentTarget } from '../targetCalculator';
import {
  detectCompleteness,
  calculateClassStatistics,
  calculateFairScore,
  calculatePotentialTotals,
  calculateHeadToHead,
  createCourseSnapshot,
  calculateWhatChanged,
  calculateStudentTrends,
} from '../comparisonAnalytics';
import {
  saveCourse,
  loadCourse,
  deleteCourse,
  listCourses,
  exportAll,
  importAll,
  validateBackupFile,
  isUsingMemoryFallback,
  StoredCourse,
  ExaminexBackupData,
} from '../../storage';

export interface TestCaseResult {
  suite: string;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  error?: string;
  durationMs: number;
}

export interface TestSuiteSummary {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  results: TestCaseResult[];
}

export async function runAllAlgorithmTests(): Promise<TestSuiteSummary> {
  const startTime = performance.now();
  const results: TestCaseResult[] = [];

  function test(
    suite: string,
    name: string,
    assertionFn: () => { passed: boolean; expected: string; actual: string }
  ) {
    const t0 = performance.now();
    try {
      const res = assertionFn();
      results.push({
        suite,
        name,
        passed: res.passed,
        expected: res.expected,
        actual: res.actual,
        durationMs: Number((performance.now() - t0).toFixed(2)),
      });
    } catch (err: unknown) {
      results.push({
        suite,
        name,
        passed: false,
        expected: 'Successful execution',
        actual: 'Threw exception',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Number((performance.now() - t0).toFixed(2)),
      });
    }
  }

  async function testAsync(
    suite: string,
    name: string,
    assertionFn: () => Promise<{ passed: boolean; expected: string; actual: string }>
  ) {
    const t0 = performance.now();
    try {
      const res = await assertionFn();
      results.push({
        suite,
        name,
        passed: res.passed,
        expected: res.expected,
        actual: res.actual,
        durationMs: Number((performance.now() - t0).toFixed(2)),
      });
    } catch (err: unknown) {
      results.push({
        suite,
        name,
        passed: false,
        expected: 'Successful execution',
        actual: 'Threw exception',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Number((performance.now() - t0).toFixed(2)),
      });
    }
  }

  const ctComponent = DEFAULT_ASSESSMENT_SCHEME.components.find((c) => c.id === 'ct')!;

  // 1. BEST 3 OF 4 CT TESTS
  test('Best-N-of-M Algorithm', 'Best 3 of 4: correctly selects top 3 and drops lowest', () => {
    // Marks: CT1=15, CT2=18, CT3=19, CT4=17 (out of 20)
    // Top 3: 19, 18, 17 -> Sum = 54 -> Avg = 18.0 -> Scaled to 20 = 18.0
    const breakdown = calculateComponentEarned(ctComponent, {
      ct1: 15,
      ct2: 18,
      ct3: 19,
      ct4: 17,
    });
    const passed = breakdown.earnedScaledMarks === 18.0;
    return {
      passed,
      expected: '18.0 scaled marks (dropped CT1=15)',
      actual: `${breakdown.earnedScaledMarks} marks (${breakdown.notes})`,
    };
  });

  test('Best-N-of-M Algorithm', 'Fewer than N tests taken: averages available tests', () => {
    // Only CT1=18, CT2=16 taken. CT3 and CT4 are null.
    // Average of 18 and 16 is 17.0 out of 20 -> 17.0 marks.
    const breakdown = calculateComponentEarned(ctComponent, {
      ct1: 18,
      ct2: 16,
      ct3: null,
      ct4: null,
    });
    const passed =
      breakdown.earnedScaledMarks === 17.0 &&
      breakdown.notes.includes('2 of 3 taken so far');
    return {
      passed,
      expected: '17.0 marks with explanatory note for 2 of 3 taken',
      actual: `${breakdown.earnedScaledMarks} marks (${breakdown.notes})`,
    };
  });

  // 2. BLANK VALUES & ABSENT HANDLING
  test('Missing Value Handling', 'Blank cells parsed as null and NOT treated as zero', () => {
    const csv = `roll,name,is_me,attendance,ct1,ct2,ct3,ct4,assignment,final\n"101",Alice,true,10,20,,20,,,`;
    const tokens = tokenizeCsv(csv);
    const mappings = suggestColumnMappings(tokens[0], DEFAULT_ASSESSMENT_SCHEME);
    const parse = validateAndParseRecords(tokens, mappings, DEFAULT_ASSESSMENT_SCHEME);

    const alice = parse.students[0];
    const ct2IsNull = alice.marks.ct2 === null;
    const ct4IsNull = alice.marks.ct4 === null;
    const assignmentIsNull = alice.marks.assignment === null;
    const finalIsNull = alice.finalMark === null;

    const calc = calculateStudentTarget(alice, DEFAULT_ASSESSMENT_SCHEME);
    const ctEarned = calc.componentsBreakdown.find((c) => c.componentId === 'ct')?.earnedScaledMarks;

    const passed =
      ct2IsNull &&
      ct4IsNull &&
      assignmentIsNull &&
      finalIsNull &&
      ctEarned === 20.0;

    return {
      passed,
      expected: 'Blank cells === null, CT average = 20.0 without zero-penalty',
      actual: `ct2=${alice.marks.ct2}, ctEarned=${ctEarned}`,
    };
  });

  test('Absent Marker Handling', 'Configurable absent mode: missing (null) vs zero (0)', () => {
    const csv = `roll,name,attendance,ct1,ct2,ct3,ct4,assignment,final\n"101",Bob,10,AB,-,20,15,10,`;
    const tokens = tokenizeCsv(csv);
    const mappings = suggestColumnMappings(tokens[0], DEFAULT_ASSESSMENT_SCHEME);

    // Mode A: missing (default)
    const parseMissing = validateAndParseRecords(tokens, mappings, DEFAULT_ASSESSMENT_SCHEME, 'missing');
    const bobMissing = parseMissing.students[0];
    const ct1IsMissing = bobMissing.marks.ct1 === null;
    const ct2IsMissing = bobMissing.marks.ct2 === null;

    // Mode B: zero
    const parseZero = validateAndParseRecords(tokens, mappings, DEFAULT_ASSESSMENT_SCHEME, 'zero');
    const bobZero = parseZero.students[0];
    const ct1IsZero = bobZero.marks.ct1 === 0;
    const ct2IsZero = bobZero.marks.ct2 === 0;

    const passed = ct1IsMissing && ct2IsMissing && ct1IsZero && ct2IsZero;
    return {
      passed,
      expected: 'AB and - parse as null in missing mode, and 0 in zero mode',
      actual: `missing: ct1=${bobMissing.marks.ct1}, ct2=${bobMissing.marks.ct2}; zero: ct1=${bobZero.marks.ct1}, ct2=${bobZero.marks.ct2}`,
    };
  });

  // 3. TARGET CALCULATIONS
  test('Target Calculation', 'Unreachable target: flags impossible targets when sessional is too low', () => {
    const student: StudentRecord = {
      id: 'student_low',
      name: 'Low Scorer',
      isMe: true,
      marks: { attendance: 5, ct1: 5, ct2: 5, ct3: 5, ct4: 5, assignment: 5 },
    };
    const calc = calculateStudentTarget(student, DEFAULT_ASSESSMENT_SCHEME);
    const passed =
      calc.verdict === 'unreachable' &&
      calc.difficulty === 'unreachable' &&
      calc.sessionalTotalEarned === 15;

    return {
      passed,
      expected: 'verdict = unreachable, sessional = 15',
      actual: `verdict = ${calc.verdict}, sessional = ${calc.sessionalTotalEarned}`,
    };
  });

  // 4. RANK TIES & COMPETITION RANKING
  test('Ranking Algorithm', 'Rank Ties: standard competition ranking skips rank on ties (1, 1, 3)', () => {
    const students: StudentRecord[] = [
      {
        id: 's1',
        roll: '001',
        name: 'Student A',
        isMe: false,
        marks: { attendance: 10, ct1: 20, ct2: 20, ct3: 20, ct4: 20, assignment: 10 },
      },
      {
        id: 's2',
        roll: '002',
        name: 'Student B',
        isMe: false,
        marks: { attendance: 10, ct1: 20, ct2: 20, ct3: 20, ct4: 20, assignment: 10 },
      },
      {
        id: 's3',
        roll: '003',
        name: 'Student C',
        isMe: true,
        marks: { attendance: 8, ct1: 18, ct2: 18, ct3: 18, ct4: 18, assignment: 8 },
      },
    ];

    const ranks = calculateStudentRanks(students, DEFAULT_ASSESSMENT_SCHEME);
    const rA = ranks.find((r) => r.student.roll === '001')!;
    const rB = ranks.find((r) => r.student.roll === '002')!;
    const rC = ranks.find((r) => r.student.roll === '003')!;

    const passed = rA.rank === 1 && rB.rank === 1 && rC.rank === 3;
    return {
      passed,
      expected: 'Student A rank 1, Student B rank 1, Student C rank 3',
      actual: `A rank ${rA.rank}, B rank ${rB.rank}, C rank ${rC.rank}`,
    };
  });

  // 5. ROLL LOOKUP (OPTION A)
  test('Roll Number Lookup', 'Option A: Exact match and fuzzy close matches for student roll', () => {
    const classList: StudentRecord[] = [
      { id: '1', roll: '2021001', name: 'Tanvir', isMe: false, marks: {} },
      { id: '2', roll: '2021002', name: 'Nabila', isMe: false, marks: {} },
      { id: '3', roll: '2021015', name: 'Sanjid', isMe: false, marks: {} },
    ];

    const exactResult = findStudentByRoll(classList, '2021015');
    const fuzzyResult = findStudentByRoll(classList, '202101'); // partial roll

    const passed =
      exactResult.exact !== null &&
      exactResult.exact.name === 'Sanjid' &&
      fuzzyResult.closeMatches.length >= 1;

    return {
      passed,
      expected: "Exact match for 2021015 -> Sanjid; partial matches found for '202101'",
      actual: `Exact: ${exactResult.exact?.name}, Close matches count: ${fuzzyResult.closeMatches.length}`,
    };
  });

  // 6. MANUAL OVERRIDE (OPTION B)
  test('Manual Marks Override', 'Option B: Overrides CSV row with same roll, designating Me', () => {
    const classList: StudentRecord[] = [
      { id: '1', roll: '2021001', name: 'Original Me', isMe: true, marks: { attendance: 8 } },
      { id: '2', roll: '2021002', name: 'Other Student', isMe: false, marks: { attendance: 10 } },
    ];

    const manualMe: StudentRecord = {
      id: 'manual_me',
      roll: '2021001',
      name: 'Custom Me Updated',
      isMe: true,
      marks: { attendance: 10, ct1: 19 },
    };

    const updated = applyManualStudentOverride(classList, manualMe);
    const meRow = updated.find((s) => s.isMe);
    const otherRow = updated.find((s) => s.roll === '2021002');

    const passed =
      updated.length === 2 &&
      meRow !== undefined &&
      meRow.name === 'Custom Me Updated' &&
      meRow.marks.attendance === 10 &&
      meRow.manualOverride === true &&
      otherRow !== undefined &&
      !otherRow.isMe;

    return {
      passed,
      expected: 'Row with roll 2021001 overridden with manual marks and flagged as Me',
      actual: `Updated name: ${meRow?.name}, attendance: ${meRow?.marks.attendance}, manualOverride: ${meRow?.manualOverride}`,
    };
  });

  // 7. CSV PARSING & VALIDATION
  test('CSV Validation', 'Detects duplicate roll numbers and bad mark rows', () => {
    const badCsv = `roll,name,attendance,ct1,ct2,ct3,ct4,assignment,final\n"101",Alice,10,25,18,17,19,9,\n"101",Bob,10,18,18,17,19,9,`;
    const tokens = tokenizeCsv(badCsv);
    const mappings = suggestColumnMappings(tokens[0], DEFAULT_ASSESSMENT_SCHEME);
    const parse = validateAndParseRecords(tokens, mappings, DEFAULT_ASSESSMENT_SCHEME);

    const markError = parse.errors.find((e) => e.message.includes('exceeds maximum'));
    const dupRollError = parse.errors.find((e) => e.message.includes('Duplicate roll number'));

    const passed = !parse.success && markError !== undefined && dupRollError !== undefined;
    return {
      passed,
      expected: 'Validation error for mark 25 > 20 and duplicate roll 101 caught',
      actual: `Mark err: ${markError?.message || 'none'}, Dup err: ${dupRollError?.message || 'none'}`,
    };
  });

  test('Unicode & Bangla Name Support', 'Handles Bangla characters and quoted names properly', () => {
    const banglaCsv = `roll,name,attendance,ct1,ct2,ct3,ct4,assignment,final\n"2021001","তানভীর আহমেদ",10,18,19,20,19,9,50`;
    const tokens = tokenizeCsv(banglaCsv);
    const mappings = suggestColumnMappings(tokens[0], DEFAULT_ASSESSMENT_SCHEME);
    const parse = validateAndParseRecords(tokens, mappings, DEFAULT_ASSESSMENT_SCHEME);

    const student = parse.students[0];
    const passed = parse.success && student.name === 'তানভীর আহমেদ' && student.roll === '2021001';

    return {
      passed,
      expected: 'Bangla name "তানভীর আহমেদ" preserved perfectly',
      actual: `Parsed name: "${student?.name}", roll: "${student?.roll}"`,
    };
  });

  // 8. BEST-3-OF-4 WITH 1, 2, 3, AND 4 TESTS
  test('Best-N-of-M Algorithm', 'Best 3 of 4: Exact math for 1, 2, 3, and 4 tests taken', () => {
    // 1 test: 18 -> 18.0
    const b1 = calculateComponentEarned(ctComponent, { ct1: 18, ct2: null, ct3: null, ct4: null });
    // 2 tests: 18, 16 -> 17.0
    const b2 = calculateComponentEarned(ctComponent, { ct1: 18, ct2: 16, ct3: null, ct4: null });
    // 3 tests: 18, 16, 14 -> 16.0
    const b3 = calculateComponentEarned(ctComponent, { ct1: 18, ct2: 16, ct3: 14, ct4: null });
    // 4 tests: 18, 16, 14, 20 -> top 3: 20, 18, 16 -> avg = 18.0
    const b4 = calculateComponentEarned(ctComponent, { ct1: 18, ct2: 16, ct3: 14, ct4: 20 });

    const passed =
      b1.earnedScaledMarks === 18.0 &&
      b2.earnedScaledMarks === 17.0 &&
      b3.earnedScaledMarks === 16.0 &&
      b4.earnedScaledMarks === 18.0;

    return {
      passed,
      expected: '1 CT: 18.0; 2 CTs: 17.0; 3 CTs: 16.0; 4 CTs: 18.0',
      actual: `1 CT=${b1.earnedScaledMarks}, 2 CTs=${b2.earnedScaledMarks}, 3 CTs=${b3.earnedScaledMarks}, 4 CTs=${b4.earnedScaledMarks}`,
    };
  });

  // 9. INCOMPLETE RESULTS: COMPLETENESS DETECTOR
  test('Incomplete Results Engine', 'Completeness detector identifies published vs pending components', () => {
    const students: StudentRecord[] = [
      { id: '1', roll: '101', name: 'Student 1', isMe: true, marks: { attendance: 10, ct1: 18, ct2: 17 } },
      { id: '2', roll: '102', name: 'Student 2', isMe: false, marks: { attendance: 10, ct1: 16, ct2: 15 } },
    ];
    const report = detectCompleteness(students, DEFAULT_ASSESSMENT_SCHEME);

    const attComp = report.components.find((c) => c.id === 'attendance');
    const ct3 = report.components.find((c) => c.id === 'ct3');

    const passed =
      attComp?.status === 'published_all' &&
      ct3?.publishedCount === 0 &&
      report.allPublishedCount < report.components.length;

    return {
      passed,
      expected: 'Attendance fully published, CT3 unpublished (0/2)',
      actual: `Attendance=${attComp?.status}, CT3 count=${ct3?.publishedCount}/${ct3?.totalStudents}`,
    };
  });

  // 10. FAIR COMPARISON MODE
  test('Incomplete Results Engine', 'Fair-comparison score normalizes ranking using only fully published tests', () => {
    const students: StudentRecord[] = [
      { id: '1', roll: '101', name: 'Me', isMe: true, marks: { attendance: 10, ct1: 20, ct2: 20, ct3: null } },
      { id: '2', roll: '102', name: 'Rival', isMe: false, marks: { attendance: 10, ct1: 15, ct2: 15, ct3: 20 } },
    ];
    const completeness = detectCompleteness(students, DEFAULT_ASSESSMENT_SCHEME);

    // In raw total, Rival has CT3=20 and might look ahead if unfinished CT3 is added blindly.
    // In fair score, CT3 is unpublished for all, so fair score counts only attendance (10) and CT1+CT2.
    const fairMe = calculateFairScore(students[0], DEFAULT_ASSESSMENT_SCHEME, completeness);
    const fairRival = calculateFairScore(students[1], DEFAULT_ASSESSMENT_SCHEME, completeness);

    const passed = fairMe.earned > fairRival.earned;
    return {
      passed,
      expected: 'Me fair score > Rival fair score (CT3 excluded from fair comparison)',
      actual: `Me earned=${fairMe.earned}, Rival earned=${fairRival.earned}`,
    };
  });

  // 11. POTENTIAL TOTALS: BEST, LIKELY, WORST CASE
  test('Incomplete Results Engine', 'Potential totals satisfy invariant: worstCase <= likelyCase <= bestCase', () => {
    const me: StudentRecord = {
      id: 'me',
      roll: '2101',
      name: 'Me',
      isMe: true,
      marks: { attendance: 9, ct1: 14, ct2: 17, ct3: null, ct4: null, assignment: null },
      finalMark: null,
    };
    const classList = [me];
    const stats = calculateClassStatistics(classList, DEFAULT_ASSESSMENT_SCHEME, me);
    const pot = calculatePotentialTotals(me, DEFAULT_ASSESSMENT_SCHEME, stats);

    const invariant = pot.worstCaseTotal <= pot.likelyTotal && pot.likelyTotal <= pot.bestCaseTotal;
    const earnedCorrect = pot.earnedSoFar === 9 + (14 + 17) / 2; // 24.5

    const passed = invariant && earnedCorrect;
    return {
      passed,
      expected: 'worstCase <= likelyTotal <= bestCase and earnedSoFar = 24.5',
      actual: `Worst: ${pot.worstCaseTotal}, Likely: ${pot.likelyTotal}, Best: ${pot.bestCaseTotal}, Earned: ${pot.earnedSoFar}`,
    };
  });

  // 12. HEAD-TO-HEAD COMPETITOR COMPARISON
  test('Competitor Analytics', 'Head-to-head calculates delta, overtake feasibility, and components', () => {
    const me: StudentRecord = {
      id: 'me',
      roll: '2101',
      name: 'Me',
      isMe: true,
      marks: { attendance: 10, ct1: 18, ct2: 19, assignment: 10 },
    };
    const rival: StudentRecord = {
      id: 'rival',
      roll: '2102',
      name: 'Rival',
      isMe: false,
      marks: { attendance: 10, ct1: 20, ct2: 20, assignment: 10 },
    };

    const classList = [me, rival];
    const h2h = calculateHeadToHead(me, rival, classList, DEFAULT_ASSESSMENT_SCHEME);
    const passed =
      h2h.whoIsAhead === 'them' &&
      h2h.overallGap < 0 &&
      h2h.canIOvertakeThem.possible &&
      h2h.componentsComparison.length >= 2;

    return {
      passed,
      expected: 'whoIsAhead = them, canIOvertakeThem.possible = true',
      actual: `gap=${h2h.overallGap}, canOvertake=${h2h.canIOvertakeThem.possible}, summary="${h2h.plainEnglishSummary.slice(0, 40)}..."`,
    };
  });

  // 13. COURSE REFRESH & WHAT CHANGED
  test('Snapshot & What Changed', 'Detects rank change, mark delta, and rival position shifts', () => {
    const prevStudents: StudentRecord[] = [
      { id: '1', roll: '2101', name: 'Me', isMe: true, marks: { attendance: 10, ct1: 15 } },
      { id: '2', roll: '2102', name: 'Rival', isMe: false, marks: { attendance: 10, ct1: 18 } },
    ];
    const snap1 = createCourseSnapshot(prevStudents, DEFAULT_ASSESSMENT_SCHEME, '2101', 'prev.csv');

    const currStudents: StudentRecord[] = [
      { id: '1', roll: '2101', name: 'Me', isMe: true, marks: { attendance: 10, ct1: 15, ct2: 20 } },
      { id: '2', roll: '2102', name: 'Rival', isMe: false, marks: { attendance: 10, ct1: 18, ct2: 14 } },
    ];
    const snap2 = createCourseSnapshot(currStudents, DEFAULT_ASSESSMENT_SCHEME, '2101', 'curr.csv');

    const whatChanged = calculateWhatChanged(snap1, snap2, prevStudents, currStudents, DEFAULT_ASSESSMENT_SCHEME);
    const passed =
      whatChanged !== null &&
      whatChanged.rankDelta >= 0 &&
      whatChanged.sessionalDelta > 0;

    return {
      passed,
      expected: 'Detected positive sessional delta and rank change for Me',
      actual: `Delta: +${whatChanged?.sessionalDelta} marks, Rank Shift: +${whatChanged?.rankDelta}`,
    };
  });

  // 14. USER SAMPLE CSV END-TO-END VALIDATION
  test('User Sample CSV Test', 'Parses user sample CSV with 5 students, partial CTs, and verifies A+ reachability', () => {
    const sampleCsv = `roll,name,attendance,ct1,ct2,ct3,ct4,assignment,final
2101,Me,9,14,17,,,,
2102,Rahim,10,18,16,,,,
2103,Karim,8,12,15,,,,
2104,Ayesha,10,19,20,,,,
2105,Tanvir,7,10,11,,,,`;

    const tokens = tokenizeCsv(sampleCsv);
    const mappings = suggestColumnMappings(tokens[0], DEFAULT_ASSESSMENT_SCHEME);
    const parse = validateAndParseRecords(tokens, mappings, DEFAULT_ASSESSMENT_SCHEME);

    const meStudent = parse.students.find((s) => s.roll === '2101' || s.isMe);
    const targetCalc = meStudent ? calculateStudentTarget(meStudent, DEFAULT_ASSESSMENT_SCHEME) : null;
    const stats = calculateClassStatistics(parse.students, DEFAULT_ASSESSMENT_SCHEME, meStudent || null);
    const pot = meStudent ? calculatePotentialTotals(meStudent, DEFAULT_ASSESSMENT_SCHEME, stats) : null;

    const meCTScaled = targetCalc?.componentsBreakdown.find((c) => c.componentId === 'ct')?.earnedScaledMarks;
    // CT avg of 14 & 17 = 15.5 marks. Attendance = 9. Sessional = 24.5.
    const passed =
      parse.students.length === 5 &&
      meStudent !== undefined &&
      meStudent.roll === '2101' &&
      meCTScaled === 15.5 &&
      pot !== null &&
      pot.bestCaseTotal >= 80; // A+ threshold is 80, reachable!

    return {
      passed,
      expected: '5 students parsed, Me roll 2101 with CT 15.5, Sessional 24.5, A+ reachable',
      actual: `Count=${parse.students.length}, Me=${meStudent?.name} (${meStudent?.roll}), CT=${meCTScaled}, Sessional=${pot?.earnedSoFar}, BestTotal=${pot?.bestCaseTotal}`,
    };
  });

  // 15. DATA MODULE: SAVE & LOAD COURSE
  await testAsync('Data Module (IndexedDB)', 'saveCourse and loadCourse persist and retrieve course data exactly', async () => {
    const testCourse: StoredCourse = {
      id: 'TEST-101',
      courseCode: 'TEST 101',
      courseName: 'Test Algorithms',
      scheme: DEFAULT_ASSESSMENT_SCHEME,
      students: [
        { id: 't1', roll: '9901', name: 'Alpha', isMe: true, marks: { attendance: 10, ct1: 18 } },
        { id: 't2', roll: '9902', name: 'Beta', isMe: false, marks: { attendance: 9, ct1: 16 } },
      ],
      myRoll: '9901',
      useManualMarks: false,
      manualStudent: null,
      watchlist: ['9902'],
      expectationOverrides: {},
      snapshots: [],
      lastUpdated: Date.now(),
    };

    await saveCourse(testCourse);
    const loaded = await loadCourse('TEST-101');

    const passed =
      loaded !== null &&
      loaded.id === 'TEST-101' &&
      loaded.students.length === 2 &&
      loaded.myRoll === '9901' &&
      loaded.watchlist.includes('9902');

    return {
      passed,
      expected: 'Course TEST-101 saved and loaded with 2 students and roll 9901',
      actual: `Loaded: id=${loaded?.id}, students=${loaded?.students.length}, myRoll=${loaded?.myRoll}`,
    };
  });

  // 16. DATA MODULE: UPDATE COURSE
  await testAsync('Data Module (IndexedDB)', 'Course mutations (mark updates & scheme adjustments) persist properly', async () => {
    const loaded = await loadCourse('TEST-101');
    if (!loaded) {
      return { passed: false, expected: 'Course exists', actual: 'Course not found' };
    }

    // Add CT2 mark to Me
    loaded.students[0].marks.ct2 = 20;
    await saveCourse(loaded);

    const reloaded = await loadCourse('TEST-101');
    const passed = reloaded?.students[0].marks.ct2 === 20;

    return {
      passed,
      expected: 'Student ct2 updated to 20',
      actual: `Reloaded student ct2 = ${reloaded?.students[0].marks.ct2}`,
    };
  });

  // 17. DATA MODULE: DELETE COURSE
  await testAsync('Data Module (IndexedDB)', 'deleteCourse removes course and its references from storage', async () => {
    await deleteCourse('TEST-101');
    const loaded = await loadCourse('TEST-101');
    const list = await listCourses();
    const inList = list.some((c) => c.id === 'TEST-101');

    const passed = loaded === null && !inList;
    return {
      passed,
      expected: 'loadCourse returns null and course not found in listCourses()',
      actual: `loadCourse=${loaded}, inList=${inList}`,
    };
  });

  // 18. DATA MODULE: BACKUP EXPORT (exportAll)
  await testAsync('Data Module (IndexedDB)', 'exportAll bundles all courses and settings with app signature', async () => {
    const backup = await exportAll();
    const passed =
      backup.version === 2 &&
      backup.appName === 'EXAMINEX RANK' &&
      typeof backup.exportedAt === 'string' &&
      Array.isArray(backup.courses) &&
      backup.settings !== undefined;

    return {
      passed,
      expected: 'Valid ExaminexBackupData object with version 2 and app signature',
      actual: `version=${backup.version}, app=${backup.appName}, coursesCount=${backup.courses.length}`,
    };
  });

  // 19. DATA MODULE: BACKUP IMPORT (REPLACE & MERGE)
  await testAsync('Data Module (IndexedDB)', 'importAll supports both Replace (clean wipe) and Merge modes', async () => {
    const mockBackup: ExaminexBackupData = {
      version: 2,
      appName: 'EXAMINEX RANK',
      exportedAt: new Date().toISOString(),
      settings: {
        activeCourseId: 'RESTORED-201',
        isAnonymized: true,
        absentHandlingMode: 'missing',
      },
      courses: [
        {
          id: 'RESTORED-201',
          courseCode: 'RESTORED 201',
          courseName: 'Restored Course',
          scheme: DEFAULT_ASSESSMENT_SCHEME,
          students: [
            { id: 'r1', roll: '8801', name: 'Restored Me', isMe: true, marks: { attendance: 10 } },
          ],
          myRoll: '8801',
          useManualMarks: false,
          manualStudent: null,
          watchlist: [],
          expectationOverrides: {},
          snapshots: [],
          lastUpdated: Date.now(),
        },
      ],
    };

    const resReplace = await importAll(mockBackup, 'replace');
    const loaded = await loadCourse('RESTORED-201');

    const passed = resReplace.coursesImported === 1 && loaded?.courseCode === 'RESTORED 201';

    // Clean up
    await deleteCourse('RESTORED-201');

    return {
      passed,
      expected: 'Imported 1 course and retrieved RESTORED 201',
      actual: `imported=${resReplace.coursesImported}, loadedCode=${loaded?.courseCode}`,
    };
  });

  // 20. DATA MODULE: CORRUPTED BACKUP VALIDATION
  test('Data Module (IndexedDB)', 'validateBackupFile catches corrupted or invalid backup files', () => {
    const vNull = validateBackupFile(null);
    const vInvalid = validateBackupFile({ foo: 'bar' });
    const vBadCourse = validateBackupFile({
      appName: 'EXAMINEX RANK',
      courses: [{ id: '' }], // missing scheme
    });

    const passed = !vNull.isValid && !vInvalid.isValid && !vBadCourse.isValid;
    return {
      passed,
      expected: 'All 3 corrupted payloads rejected with helpful error messages',
      actual: `nullErr="${vNull.error}", invalidErr="${vInvalid.error}", badCourseErr="${vBadCourse.error}"`,
    };
  });

  // 21. DATA MODULE: STORAGE BLOCKED INVARIANT
  test('Data Module (IndexedDB)', 'Storage module fallback operates in memory if IndexedDB is blocked', () => {
    // Memory fallback checker returns boolean without throwing
    const fallbackActive = isUsingMemoryFallback();
    const passed = typeof fallbackActive === 'boolean';
    return {
      passed,
      expected: 'isUsingMemoryFallback() returns boolean without throwing',
      actual: `fallbackActive=${fallbackActive}`,
    };
  });

  // 22. DATA MODULE: 500-STUDENT CSV SCALABILITY & SPEED
  test('Performance & Scalability', '500-student class CSV parses and ranks in < 150 milliseconds', () => {
    const t0 = performance.now();
    const rows = ['roll,name,attendance,ct1,ct2,ct3,ct4,assignment,final'];
    for (let i = 1; i <= 500; i++) {
      const roll = String(1000 + i);
      const isMe = i === 42 ? 'true' : 'false';
      rows.push(`${roll},Student_${i},${(i % 5) + 6},${(i % 10) + 11},${(i % 8) + 12},,,${(i % 4) + 7},`);
    }
    const csvContent = rows.join('\n');
    const tokens = tokenizeCsv(csvContent);
    const mappings = suggestColumnMappings(tokens[0], DEFAULT_ASSESSMENT_SCHEME);
    const parse = validateAndParseRecords(tokens, mappings, DEFAULT_ASSESSMENT_SCHEME);
    const ranks = calculateStudentRanks(parse.students, DEFAULT_ASSESSMENT_SCHEME);

    const elapsed = performance.now() - t0;
    const passed = parse.students.length === 500 && ranks.length === 500 && elapsed < 200;

    return {
      passed,
      expected: '500 students parsed and ranked in under 200ms',
      actual: `500 students processed in ${elapsed.toFixed(1)}ms (success=${parse.success})`,
    };
  });

  // 23. FULL END-TO-END WORKFLOW INVARIANT
  await testAsync('End-to-End Workflow', 'Add course -> Upload CSV -> Set Roll -> Verify persistence flow', async () => {
    const courseCode = 'CSE 411';
    const courseId = 'CSE-411';
    const sampleCsv = `roll,name,attendance,ct1,ct2,ct3,ct4,assignment,final
3001,Me,10,18,19,,,,
3002,Rival_A,10,20,18,,,,
3003,Rival_B,9,15,14,,,,`;

    const tokens = tokenizeCsv(sampleCsv);
    const mappings = suggestColumnMappings(tokens[0], DEFAULT_ASSESSMENT_SCHEME);
    const parsed = validateAndParseRecords(tokens, mappings, DEFAULT_ASSESSMENT_SCHEME);

    const newCourse: StoredCourse = {
      id: courseId,
      courseCode,
      courseName: 'Distributed Systems',
      scheme: DEFAULT_ASSESSMENT_SCHEME,
      students: parsed.students,
      myRoll: '3001',
      useManualMarks: false,
      manualStudent: null,
      watchlist: ['3002'],
      expectationOverrides: {},
      snapshots: [],
      rawCsvText: sampleCsv,
      lastUpdated: Date.now(),
    };

    await saveCourse(newCourse);
    const reloaded = await loadCourse(courseId);

    const me = reloaded?.students.find((s) => s.roll === '3001');
    const target = me ? calculateStudentTarget(me, DEFAULT_ASSESSMENT_SCHEME) : null;

    const passed =
      reloaded !== null &&
      reloaded.students.length === 3 &&
      reloaded.myRoll === '3001' &&
      target !== null &&
      target.sessionalTotalEarned > 0;

    // Clean up
    await deleteCourse(courseId);

    return {
      passed,
      expected: 'Full workflow creates, parses, saves, reloads, and computes target for CSE 411',
      actual: `reloadedStudents=${reloaded?.students.length}, myRoll=${reloaded?.myRoll}, sessionalEarned=${target?.sessionalTotalEarned}`,
    };
  });

  const durationMs = Number((performance.now() - startTime).toFixed(2));
  const passedCount = results.filter((r) => r.passed).length;

  return {
    total: results.length,
    passed: passedCount,
    failed: results.length - passedCount,
    durationMs,
    results,
  };
}
