/**
 * Assessment Scheme & Calculation Types for EXAMINEX RANK
 */

export type ComponentType = 'single' | 'best_n_of_m';

export interface SubComponent {
  id: string;
  name: string;
  maxMarks: number;
}

export interface SchemeComponent {
  id: string;
  name: string;
  type: ComponentType;
  weight: number; // Marks contributed to course total (e.g. 10, 20, 60)
  maxMarks?: number; // Only for single type
  // For best_n_of_m type:
  subComponents?: SubComponent[];
  bestN?: number; // e.g. 3 of 4
  isFinalExam?: boolean; // The semester final exam component being targeted
}

export interface GradeThreshold {
  grade: string;
  minMarks: number;
  gpaPoint?: number;
}

export interface AssessmentScheme {
  id: string;
  courseName: string;
  courseCode: string;
  totalMarks: number; // Typically 100
  targetGradeThreshold: number; // Default 80 for A+
  targetGradeName: string; // e.g. 'A+'
  components: SchemeComponent[];
  gradeThresholds: GradeThreshold[];
}

export interface StudentRecord {
  id: string;
  roll?: string;
  name: string;
  isMe: boolean;
  marks: Record<string, number | null>; // componentId or subComponentId -> marks (null = not yet taken)
  finalMark?: number | null;
  manualOverride?: boolean;
  treatMissingAsZero?: boolean; // Per-student setting for individual missing data
}

export interface ComponentBreakdown {
  componentId: string;
  name: string;
  weight: number;
  earnedScaledMarks: number;
  maxPossibleSoFar: number;
  isCompleted: boolean;
  notes: string;
  takenCount: number;
  totalCount: number;
  subScores?: {
    id: string;
    name: string;
    rawScore: number | null;
    maxScore: number;
    usedInBestN?: boolean;
  }[];
}

export interface GradeTargetResult {
  grade: string;
  minMarks: number;
  neededInFinal: number;
  finalPercentage: number;
  isReachable: boolean;
  isAlreadySecured: boolean;
  difficulty: 'secured' | 'easy' | 'moderate' | 'challenging' | 'critical' | 'unreachable';
}

export interface TargetCalculation {
  student: StudentRecord;
  sessionalTotalEarned: number;
  sessionalWeightTotal: number;
  finalWeight: number;
  targetTotalMarks: number;
  targetGradeName: string;
  neededInFinal: number;
  neededPercentage: number;
  verdict: 'secured' | 'reachable' | 'unreachable';
  verdictMessage: string;
  difficulty: 'secured' | 'easy' | 'moderate' | 'challenging' | 'critical' | 'unreachable';
  bestCaseSessional: number; // If all untaken non-final get 100%
  worstCaseSessional: number; // If all untaken non-final get 0%
  bestCaseFinalNeeded: number;
  worstCaseFinalNeeded: number;
  componentsBreakdown: ComponentBreakdown[];
  allGradeTargets: GradeTargetResult[];
  hasPendingComponents: boolean;
}

export interface ValidationError {
  row: number; // 1-based CSV row
  column?: string;
  studentName?: string;
  studentRoll?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ColumnMapping {
  csvColumn: string;
  targetFieldId: string; // 'roll' | 'name' | 'is_me' | componentId | subComponentId
  isIgnored?: boolean;
}

export type AbsentHandlingMode = 'missing' | 'zero';

export interface ParseResult {
  success: boolean;
  students: StudentRecord[];
  errors: ValidationError[];
  warnings: ValidationError[];
  detectedColumns: string[];
  suggestedMappings: ColumnMapping[];
  unmappedColumns: string[];
  rawRowsCount: number;
  importSummary?: {
    totalRows: number;
    validStudents: number;
    skippedRows: number;
    warningCount: number;
    errorCount: number;
  };
}

export interface RivalRuleConfig {
  maxGapBehind: number; // Default 3 marks behind
  maxGapOverall: number; // Default 6 marks overall
}

export interface CompetitorComparisonItem {
  student: StudentRecord;
  rank: number;
  sessionalScore: number;
  overallGap: number; // positive = they are ahead, negative = behind
  componentGaps: Record<string, number>; // componentId -> gap (positive = they beat me)
  beatsMeMostComponent: {
    componentId: string;
    componentName: string;
    gap: number;
  } | null;
  iBeatThemMostComponent: {
    componentId: string;
    componentName: string;
    gap: number;
  } | null;
  rivalCategory: 'Rival' | 'Far Ahead' | 'Close Behind' | 'Behind';
  canOvertakeMe: boolean;
  canICatchThem: boolean;
  maxPossibleCatchGap: number;
}

export interface ClassStatistics {
  count: number;
  sessionalAverage: number;
  sessionalMedian: number;
  sessionalTop: number;
  sessionalMin: number;
  sessionalStdDev: number;
  finalAverage: number | null;
  finalCount: number;
  componentStats: Record<
    string,
    {
      name: string;
      weight: number;
      average: number;
      median: number;
      top: number;
      min: number;
      stdDev: number;
      myScore: number;
      zScore: number;
    }
  >;
  strongestComponent: { name: string; zScore: number; diff: number } | null;
  weakestComponent: { name: string; zScore: number; diff: number } | null;
  distributionHistogram: {
    binStart: number;
    binEnd: number;
    label: string;
    count: number;
    hasMe: boolean;
  }[];
}

export interface StudentTrend {
  student: StudentRecord;
  slope: number;
  direction: 'improving' | 'steady' | 'declining';
  rawScores: (number | null)[];
}

export interface PredictionResult {
  estimatedFinalLow: number;
  estimatedFinalLikely: number;
  estimatedFinalHigh: number;
  method: 'linear_regression' | 'sessional_proxy';
  confidence: 'low' | 'medium' | 'high';
  dataPointsUsed: number;
  explanation: string;
  predictedRankLow: number;
  predictedRankLikely: number;
  predictedRankHigh: number;
  probabilityOfAPlus: number; // 0 - 100%
  rSquared?: number;
}

export interface ActionPlanItem {
  id: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  rationale: string;
  impactScore: number;
}

// ============================================
// PART B: COMPLETENESS & INCOMPLETE RESULTS TYPES
// ============================================

export type ComponentPublishStatus = 'published_all' | 'published_some' | 'not_published';

export interface ComponentStatusItem {
  id: string;
  name: string;
  weight: number;
  status: ComponentPublishStatus;
  publishedCount: number;
  totalStudents: number;
  publishedPct: number;
  isSubComponent?: boolean;
  parentId?: string;
}

export interface CompletenessReport {
  components: ComponentStatusItem[];
  allPublishedCount: number;
  somePublishedCount: number;
  notPublishedCount: number;
  fairMarksAvailable: number; // Sum of weights for components published for ALL
  totalCourseMarks: number;
  fairComparingLabel: string;
}

export interface PotentialTotals {
  studentId: string;
  earnedSoFar: number;
  marksAvailable: number;
  bestCaseTotal: number;
  worstCaseTotal: number;
  likelyTotal: number;
  rankEarned: number;
  rankLikely: number;
}

export interface HeadToHeadReport {
  me: StudentRecord;
  them: StudentRecord;
  componentsComparison: {
    componentId: string;
    name: string;
    myScore: number;
    theirScore: number;
    gap: number; // positive = I lead, negative = they lead
    whoLeads: 'me' | 'them' | 'tied';
  }[];
  myTotal: number;
  theirTotal: number;
  overallGap: number; // positive = I lead, negative = they lead
  whoIsAhead: 'me' | 'them' | 'tied';
  theirRank: number;
  myRank: number;
  studentsBetween: number;
  theirBiggestLeadComponent: { name: string; gap: number } | null;
  myBiggestLeadComponent: { name: string; gap: number } | null;
  canIOvertakeThem: {
    possible: boolean;
    neededInFinalLikely: number;
    neededInFinalBest: number;
    summary: string;
  };
  canTheyOvertakeMe: {
    possible: boolean;
    neededInFinalLikely: number;
    neededInFinalBest: number;
    summary: string;
  };
  plainEnglishSummary: string;
}

export interface CourseHistorySnapshot {
  id: string;
  timestamp: number;
  dateFormatted: string;
  filename: string;
  myRoll: string;
  myRank: number;
  mySessional: number;
  neededFinalAPlus: number;
  studentsCount: number;
  publishedCount: number;
}

export interface WhatChangedReport {
  previousSnapshot: CourseHistorySnapshot | null;
  rankDelta: number; // +2 means moved up 2 ranks
  sessionalDelta: number;
  neededFinalDelta: number;
  newlyPublishedComponents: string[];
  newlyFilledCellsCount: number;
  rivalsMoved: {
    name: string;
    roll: string;
    prevRank: number;
    newRank: number;
    rankDelta: number;
  }[];
}
