import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  AssessmentScheme,
  ClassStatistics,
  CompletenessReport,
  CompetitorComparisonItem,
  CourseHistorySnapshot,
  HeadToHeadReport,
  PotentialTotals,
  PredictionResult,
  RivalRuleConfig,
  StudentRecord,
  StudentTrend,
  TargetCalculation,
  AbsentHandlingMode,
  WhatChangedReport,
} from '../types';
import { calculateComponentEarned, calculateStudentTarget } from '../algorithms/targetCalculator';
import { calculateStudentRanks } from '../algorithms/ranking';
import {
  calculateClassStatistics,
  calculateCompetitorAnalysis,
  calculateFairScore,
  calculateFinalPredictions,
  calculatePotentialTotals,
  calculateStudentTrends,
  calculateWhatChanged,
  createCourseSnapshot,
  detectCompleteness,
  generateActionPlan,
} from '../algorithms/comparisonAnalytics';
import {
  applyManualStudentOverride,
  findStudentByRoll,
  suggestColumnMappings,
  tokenizeCsv,
  validateAndParseRecords,
} from '../algorithms/csvParser';
import { CSV_TEMPLATE_STRING, DEMO_CSV_STRING, downloadCsvFile } from '../data/demoData';
import { downloadReportAsPdf, copyReportToClipboard } from '../utils/pdfExport';
import { useFeedback } from './FeedbackSystem';
import { CompletenessStrip } from './CompletenessStrip';
import { HeadToHeadModal } from './HeadToHeadModal';
import { HistorySnapshotsModal } from './HistorySnapshotsModal';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
  Legend,
} from 'recharts';
import {
  Trophy,
  Target,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Download,
  Upload,
  UserCheck,
  Edit3,
  Shield,
  Trash2,
  RotateCcw,
  Printer,
  FileSpreadsheet,
  Settings,
  HelpCircle,
  Eye,
  EyeOff,
  Search,
  Check,
  Bookmark,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Copy,
  FileText,
  Play,
  Loader2,
  Star,
  RefreshCw,
  History,
  Scale,
} from 'lucide-react';

interface ClassComparisonViewProps {
  scheme: AssessmentScheme;
  students: StudentRecord[];
  onUpdateStudents: (newStudents: StudentRecord[], filename?: string) => void;
  isAnonymized: boolean;
  onToggleAnonymize: () => void;
  onDeleteClassData: () => void;
}

export const ClassComparisonView: React.FC<ClassComparisonViewProps> = ({
  scheme,
  students,
  onUpdateStudents,
  isAnonymized,
  onToggleAnonymize,
  onDeleteClassData,
}) => {
  const { showToast, showAlert, showConfirm, setGlobalError } = useFeedback();

  // A2: Loading spinner state for Analyze
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // B1: Editable Roll Number state
  const [activeRoll, setActiveRoll] = useState<string>('2021005');
  const [editingRollInput, setEditingRollInput] = useState<string>('2021005');
  const [rollMatches, setRollMatches] = useState<StudentRecord[]>([]);

  // B1: Source Mode Toggle: Use CSV Row vs Use My Manual Marks
  const [useManualMarks, setUseManualMarks] = useState<boolean>(false);
  const [savedManualMarks, setSavedManualMarks] = useState<Record<string, number | null>>({});

  // B2: Watchlist & Head-to-Head
  const [watchlist, setWatchlist] = useState<string[]>(['2021001', '2021002']);
  const [headToHeadOpponent, setHeadToHeadOpponent] = useState<StudentRecord | null>(null);
  const [showHeadToHeadModal, setShowHeadToHeadModal] = useState<boolean>(false);
  const [quickLookupQuery, setQuickLookupQuery] = useState<string>('');

  // B3: Incomplete Results & Completeness
  const [fairComparisonMode, setFairComparisonMode] = useState<boolean>(true);
  const [manualExpectations, setManualExpectations] = useState<Record<string, number>>({});
  const [dualRankSort, setDualRankSort] = useState<'earned' | 'likely'>('earned');

  // B3.7: History Snapshots
  const [snapshots, setSnapshots] = useState<CourseHistorySnapshot[]>([]);
  const [whatChangedReport, setWhatChangedReport] = useState<WhatChangedReport | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);

  // What-If Sliders (temporary simulation)
  const [whatIfActive, setWhatIfActive] = useState<boolean>(false);
  const [whatIfOverrides, setWhatIfOverrides] = useState<Record<string, number | null>>({});

  // Rival threshold settings
  const [rivalConfig, setRivalConfig] = useState<RivalRuleConfig>({
    maxGapBehind: 3,
    maxGapOverall: 6,
  });
  const [showRivalSettings, setShowRivalSettings] = useState<boolean>(false);

  // In-Module CSV Upload Modal
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [absentHandling, setAbsentHandling] = useState<AbsentHandlingMode>('missing');
  const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Identify Current "Me" student
  const meStudent = useMemo(() => {
    if (useManualMarks) {
      return {
        id: `manual_me_${activeRoll}`,
        roll: activeRoll,
        name: isAnonymized ? 'Me (Student)' : 'Sanjid (Me)',
        isMe: true,
        marks: savedManualMarks,
        manualOverride: true,
      } as StudentRecord;
    }

    const byRoll = students.find((s) => s.roll?.toLowerCase() === activeRoll.toLowerCase());
    if (byRoll) return { ...byRoll, isMe: true };

    const flagged = students.find((s) => s.isMe);
    if (flagged) return flagged;

    return students[0] || null;
  }, [students, activeRoll, useManualMarks, savedManualMarks, isAnonymized]);

  // Keep editing input synced
  useEffect(() => {
    if (meStudent?.roll && meStudent.roll !== activeRoll) {
      setActiveRoll(meStudent.roll);
      setEditingRollInput(meStudent.roll);
    }
  }, [meStudent]);

  // B1: Handle Roll Number Change
  const handleChangeRoll = () => {
    const query = editingRollInput.trim();
    if (!query) {
      showAlert('Roll Number Required', 'Please enter a valid student roll number.');
      return;
    }

    const lookup = findStudentByRoll(students, query);
    if (lookup.exact) {
      setActiveRoll(lookup.exact.roll || query);
      setRollMatches([]);
      showToast(`Designated row set to Roll ${lookup.exact.roll} (${lookup.exact.name}).`, 'success');
      runAnalysis();
    } else {
      setRollMatches(lookup.closeMatches);
      showAlert(
        'Roll Number Not Found Exactly',
        `Roll number "${query}" was not found directly in the class list. We found ${lookup.closeMatches.length} close matches below. Pick one to proceed.`
      );
    }
  };

  // Watchlist Toggle
  const handleToggleWatchlist = (studentKey: string) => {
    setWatchlist((prev) => {
      if (prev.includes(studentKey)) {
        showToast('Removed student from watchlist.', 'info');
        return prev.filter((k) => k !== studentKey);
      }
      if (prev.length >= 5) {
        showAlert('Watchlist Limit Reached', 'You can pin a maximum of 5 students to your watchlist.');
        return prev;
      }
      showToast('Pinned student to watchlist.', 'success');
      return [...prev, studentKey];
    });
  };

  // A2: Run / Re-run Analysis with Loading Spinner and Validation
  const runAnalysis = () => {
    setIsAnalyzing(true);
    setAnalysisError(null);

    setTimeout(() => {
      try {
        if (!students || students.length === 0) {
          throw new Error('No students loaded in this course. Please upload a CSV or load demo data first.');
        }
        if (!scheme || scheme.components.length === 0) {
          throw new Error('Assessment scheme is unconfigured. Please configure components in Assessment Scheme.');
        }

        setIsAnalyzing(false);
        showToast('Analysis completed successfully.', 'success');
      } catch (err: unknown) {
        setIsAnalyzing(false);
        const msg = err instanceof Error ? err.message : String(err);
        setAnalysisError(msg);
        setGlobalError(msg);
      }
    }, 250);
  };

  // Active student calculation
  const targetCalc: TargetCalculation | null = useMemo(() => {
    if (!meStudent) return null;
    return calculateStudentTarget(
      meStudent,
      scheme,
      whatIfActive ? whatIfOverrides : undefined
    );
  }, [meStudent, scheme, whatIfActive, whatIfOverrides]);

  // Baseline calculation (without what-if overrides)
  const baselineCalc: TargetCalculation | null = useMemo(() => {
    if (!meStudent) return null;
    return calculateStudentTarget(meStudent, scheme);
  }, [meStudent, scheme]);

  // Class statistics
  const classStats: ClassStatistics = useMemo(() => {
    return calculateClassStatistics(students, scheme, meStudent);
  }, [students, scheme, meStudent]);

  // Completeness detector
  const completeness = useMemo(() => {
    return detectCompleteness(students, scheme);
  }, [students, scheme]);

  // Competitor analysis
  const competitorAnalysis = useMemo(() => {
    if (!meStudent) return null;
    return calculateCompetitorAnalysis(meStudent, students, scheme, rivalConfig);
  }, [meStudent, students, scheme, rivalConfig]);

  // Trends
  const trendsAnalysis = useMemo(() => {
    return calculateStudentTrends(students, scheme);
  }, [students, scheme]);

  // Predictions (Range)
  const predictions: PredictionResult | null = useMemo(() => {
    if (!meStudent) return null;
    return calculateFinalPredictions(meStudent, students, scheme);
  }, [meStudent, students, scheme]);

  // Action plan
  const actionPlan = useMemo(() => {
    if (!meStudent || !targetCalc || !competitorAnalysis) return [];
    return generateActionPlan(
      meStudent,
      targetCalc,
      classStats,
      trendsAnalysis,
      competitorAnalysis,
      scheme
    );
  }, [meStudent, targetCalc, classStats, trendsAnalysis, competitorAnalysis, scheme]);

  // Potential Totals & Dual Ranking for class
  const potentialTotalsList = useMemo(() => {
    const list = students.map((s) =>
      calculatePotentialTotals(s, scheme, classStats, manualExpectations)
    );

    // Rank by earned
    const byEarned = [...list].sort((a, b) => b.earnedSoFar - a.earnedSoFar);
    byEarned.forEach((item, idx) => {
      item.rankEarned = idx + 1;
    });

    // Rank by likely
    const byLikely = [...list].sort((a, b) => b.likelyTotal - a.likelyTotal);
    byLikely.forEach((item, idx) => {
      item.rankLikely = idx + 1;
    });

    return list;
  }, [students, scheme, classStats, manualExpectations]);

  const myPotential = useMemo(() => {
    if (!meStudent) return null;
    return potentialTotalsList.find((p) => p.studentId === meStudent.id) || null;
  }, [potentialTotalsList, meStudent]);

  // Display Name Helper
  const getDisplayName = (st: StudentRecord, index?: number) => {
    if (st.isMe || st.roll === activeRoll) {
      return isAnonymized ? 'Me (Student)' : st.name;
    }
    if (isAnonymized) {
      const idx = index !== undefined ? index + 1 : students.findIndex((s) => s.id === st.id) + 1;
      return `Student ${idx > 0 ? idx : ''}`;
    }
    return st.name;
  };

  const getDisplayRoll = (st: StudentRecord, index?: number) => {
    if (st.isMe || st.roll === activeRoll) return st.roll || activeRoll;
    if (isAnonymized) {
      const idx = index !== undefined ? index + 1 : students.findIndex((s) => s.id === st.id) + 1;
      return `R-${String(idx).padStart(3, '0')}`;
    }
    return st.roll || 'N/A';
  };

  // A3: Export PDF via jsPDF + html2canvas
  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    showToast('Rendering high-fidelity PDF dossier...', 'info');

    const res = await downloadReportAsPdf({
      elementId: 'examinex-report-dossier',
      filename: `examinex_report_${activeRoll}.pdf`,
    });

    setIsExportingPdf(false);
    if (res.success) {
      showToast('PDF downloaded successfully.', 'success');
    } else {
      showAlert(
        'Download Restricted',
        'Your browser environment or iframe blocked direct PDF download. Click "Copy Report as Text" below, or open the deployed link in a new tab to download.'
      );
    }
  };

  // A3: Print via print stylesheet
  const handlePrint = () => {
    window.print();
  };

  // A3: Copy Report text fallback
  const handleCopyReportText = async () => {
    if (!targetCalc || !competitorAnalysis) return;
    const reportText = `
========================================
EXAMINEX RANK - ACADEMIC DOSSIER
Course: ${scheme.courseCode} - ${scheme.courseName}
Student: ${meStudent?.name} (Roll: ${activeRoll})
Rank: #${competitorAnalysis.myRank} of ${competitorAnalysis.totalStudents} (${competitorAnalysis.percentile}th percentile)
Sessional Earned: ${targetCalc.sessionalTotalEarned} / ${targetCalc.sessionalWeightTotal}
Final Exam A+ Target: ${targetCalc.neededInFinal} / ${targetCalc.finalWeight} (${targetCalc.neededPercentage}%)
Verdict: ${targetCalc.verdictMessage}
Estimated Final Range: Low ${predictions?.estimatedFinalLow} | Likely ${predictions?.estimatedFinalLikely} | High ${predictions?.estimatedFinalHigh}
Action Recommendations:
${actionPlan.map((p, i) => `${i + 1}. ${p.title} - ${p.rationale}`).join('\n')}
========================================
Generated by EXAMINEX RANK
    `.trim();

    const ok = await copyReportToClipboard(reportText);
    if (ok) {
      showToast('Report dossier copied to clipboard!', 'success');
    } else {
      showAlert('Copy Failed', 'Unable to access clipboard. Please select and copy text manually.');
    }
  };

  // A3: Download CSV using Blob
  const handleDownloadCsv = (shareSafe: boolean) => {
    if (!students || students.length === 0) return;
    const ranked = calculateStudentRanks(students, scheme);

    const headers = [
      'Rank',
      'Roll',
      'Name',
      'Sessional_Score',
      'Percentile',
      'Is_Me',
      'CT_Trend_Slope',
      'CT_Trend_Direction',
    ];

    const rows = ranked.map((r, i) => {
      const studentTrend = trendsAnalysis.trends.find((t) => t.student.id === r.student.id);
      const roll = shareSafe ? (r.isMe ? r.student.roll : `R-${String(i + 1).padStart(3, '0')}`) : r.student.roll;
      const name = shareSafe ? (r.isMe ? r.student.name : `Student ${i + 1}`) : r.student.name;
      return [
        r.rank,
        `"${roll || ''}"`,
        `"${name}"`,
        r.sessionalScore,
        r.percentile,
        r.isMe ? 'TRUE' : 'FALSE',
        studentTrend?.slope ?? '',
        studentTrend?.direction ?? '',
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    downloadCsvFile(
      csvContent,
      shareSafe ? `examinex_sharesafe_${scheme.courseCode}.csv` : `examinex_full_${scheme.courseCode}.csv`
    );
    showToast(`Downloaded ${shareSafe ? 'Share-Safe' : 'Full'} CSV.`, 'success');
  };

  // B3.7: In-Module CSV Upload & Snapshot Creation
  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const tokens = tokenizeCsv(text);
      if (tokens.length < 2) {
        setUploadErrorMsg('The uploaded file is empty or missing data rows.');
        return;
      }
      const mappings = suggestColumnMappings(tokens[0], scheme);
      const parse = validateAndParseRecords(tokens, mappings, scheme, absentHandling);

      if (!parse.success && parse.errors.length > 0) {
        setUploadErrorMsg(parse.errors.map((e) => e.message).join('; '));
        return;
      }

      // Create new snapshot
      const newSnapshot = createCourseSnapshot(parse.students, scheme, activeRoll, file.name);
      const prevSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

      const whatChanged = calculateWhatChanged(
        prevSnapshot,
        newSnapshot,
        students,
        parse.students,
        scheme
      );

      setSnapshots((prev) => [...prev, newSnapshot]);
      setWhatChangedReport(whatChanged);

      onUpdateStudents(parse.students, file.name);
      setShowUploadModal(false);
      setUploadErrorMsg(null);
      showToast(`Refreshed class with ${parse.students.length} students. Snapshot saved!`, 'success');

      if (prevSnapshot) {
        setShowHistoryModal(true);
      }
    };
    reader.readAsText(file);
  };

  // CT Line Chart Data
  const ctChartData = useMemo(() => {
    const ctComp = scheme.components.find((c) => c.type === 'best_n_of_m');
    const subs = ctComp?.subComponents || [];
    const rivalsToChart = competitorAnalysis?.topRivals.slice(0, 3) || [];

    return subs.map((sub) => {
      const dataPoint: Record<string, string | number | null> = {
        name: sub.name,
      };

      if (meStudent) {
        dataPoint['Me'] = meStudent.marks[sub.id] ?? null;
      }

      const scores = students
        .map((s) => s.marks[sub.id])
        .filter((v): v is number => v !== null && v !== undefined && !isNaN(v));
      dataPoint['Class Average'] =
        scores.length > 0 ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)) : null;

      rivalsToChart.forEach((rival, rIdx) => {
        const rivalLabel = getDisplayName(rival.student, rIdx);
        dataPoint[rivalLabel] = rival.student.marks[sub.id] ?? null;
      });

      return dataPoint;
    });
  }, [scheme, students, meStudent, competitorAnalysis, isAnonymized]);

  return (
    <div className="space-y-6">
      {/* MODULE HEADER BAR */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 font-mono">
                Class Comparison Module
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-xs text-slate-500 font-mono">
                {scheme.courseCode}: {scheme.courseName}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
              Class Rank, Competitors & Incomplete Result Engine
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Enrolled: <strong className="text-slate-800 font-mono">{students.length} students</strong>. Privacy-safe client analysis.
            </p>
          </div>

          {/* Quick Actions Strip */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* A2: Analyze Button with Loading Spinner */}
            <button
              onClick={runAnalysis}
              disabled={isAnalyzing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Run Analysis</span>
                </>
              )}
            </button>

            {/* Anonymize Toggle (Default ON) */}
            <button
              onClick={onToggleAnonymize}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                isAnonymized
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {isAnonymized ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{isAnonymized ? 'Anonymized (ON)' : 'Anonymized (OFF)'}</span>
            </button>

            {/* History Snapshot Button */}
            <button
              onClick={() => setShowHistoryModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
            >
              <History className="w-3.5 h-3.5 text-slate-500" />
              <span>Snapshot History ({snapshots.length})</span>
            </button>

            {/* Upload Class CSV */}
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-indigo-600" />
              <span>Upload Class CSV</span>
            </button>

            {/* Delete Class Data */}
            <button
              onClick={() => {
                showConfirm({
                  title: 'Delete Class Data',
                  message: 'Are you sure you want to delete this course dataset? This will clear all classmates marks from this session.',
                  confirmLabel: 'Delete Data',
                  isDestructive: true,
                  onConfirm: onDeleteClassData,
                });
              }}
              title="Delete this class data"
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* B1: PERMANENT EDITABLE ROLL NUMBER TOOLBAR */}
        <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-indigo-600 shrink-0" />
              <label className="font-bold text-slate-800">My Roll Number:</label>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={editingRollInput}
                  onChange={(e) => setEditingRollInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleChangeRoll()}
                  placeholder="e.g. 2021005"
                  className="w-28 px-2 py-1 font-mono font-bold bg-white border border-slate-300 rounded text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  onClick={handleChangeRoll}
                  className="px-2.5 py-1 font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded transition-colors"
                >
                  Change
                </button>
              </div>
            </div>

            {/* B1: Toggle "Use CSV row / Use my manual marks" */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <span className="text-slate-600">Marks Source:</span>
              <button
                onClick={() => {
                  setUseManualMarks(!useManualMarks);
                  showToast(
                    !useManualMarks
                      ? 'Switched to your manual marks override.'
                      : 'Switched to using marks directly from the CSV row.',
                    'info'
                  );
                }}
                className={`px-2.5 py-1 rounded-md font-semibold text-[11px] border transition-colors ${
                  useManualMarks
                    ? 'bg-indigo-50 text-indigo-800 border-indigo-300 font-bold'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                {useManualMarks ? 'Using Manual Marks Override' : 'Using CSV Row Marks'}
              </button>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 font-mono">
            Active: <strong className="text-slate-800">{meStudent ? meStudent.name : 'No Student Selected'}</strong>
          </div>
        </div>

        {/* Close Matches Picker if Roll not found exactly */}
        {rollMatches.length > 0 && (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-1.5">
            <span className="font-bold text-amber-900 block">
              Close Roll Matches Found in Class CSV:
            </span>
            <div className="flex flex-wrap gap-2">
              {rollMatches.map((st) => (
                <button
                  key={st.id}
                  onClick={() => {
                    setActiveRoll(st.roll || '');
                    setEditingRollInput(st.roll || '');
                    setRollMatches([]);
                    showToast(`Active roll switched to ${st.roll} (${st.name})`, 'success');
                  }}
                  className="px-2.5 py-1 bg-white hover:bg-amber-100 border border-amber-300 rounded font-mono text-slate-800"
                >
                  {st.roll} - {st.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* A2: Visible Analysis Error if failed */}
      {analysisError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-1">
          <div className="flex items-center gap-2 font-bold">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>Analysis Verification Notice:</span>
          </div>
          <p>{analysisError}</p>
        </div>
      )}

      {/* B3.1 & B3.2: COMPLETENESS DETECTOR & FAIR-COMPARISON STRIP */}
      <CompletenessStrip
        completeness={completeness}
        fairComparisonMode={fairComparisonMode}
        onToggleFairComparison={(val) => {
          setFairComparisonMode(val);
          showToast(
            val
              ? 'Fair-Comparison enabled: ranking only on tests published for everyone.'
              : 'Standard mode enabled: ranking on all earned marks.',
            'info'
          );
        }}
        manualExpectations={manualExpectations}
        onUpdateManualExpectation={(compId, val) => {
          setManualExpectations({ ...manualExpectations, [compId]: val });
          showToast(`Set expectation for ${compId} to ${val} marks.`, 'info');
        }}
        onResetManualExpectations={() => {
          setManualExpectations({});
          showToast('Cleared manual performance expectations.', 'info');
        }}
      />

      {/* B2: COMPETITOR LOOKUP & WATCHLIST BAR */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-1">
          <Search className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className="font-bold text-slate-800 shrink-0">Compare Specific Student:</span>
          <select
            value={quickLookupQuery}
            onChange={(e) => {
              setQuickLookupQuery(e.target.value);
              const found = students.find((s) => (s.roll || s.id) === e.target.value);
              if (found) {
                setHeadToHeadOpponent(found);
                setShowHeadToHeadModal(true);
              }
            }}
            className="flex-1 max-w-md px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
          >
            <option value="">-- Choose any classmate to view Head-to-Head Report --</option>
            {students
              .filter((s) => !s.isMe && s.roll !== activeRoll)
              .map((st) => (
                <option key={st.id} value={st.roll || st.id}>
                  {getDisplayName(st)} (Roll: {getDisplayRoll(st)})
                </option>
              ))}
          </select>
        </div>

        {/* Watchlist Quick Pointers */}
        {watchlist.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500">Watchlist:</span>
            {watchlist.map((rollOrId) => {
              const matched = students.find((s) => (s.roll || s.id) === rollOrId);
              if (!matched) return null;
              return (
                <button
                  key={matched.id}
                  onClick={() => {
                    setHeadToHeadOpponent(matched);
                    setShowHeadToHeadModal(true);
                  }}
                  className="px-2 py-0.5 bg-slate-100 hover:bg-indigo-50 border border-slate-200 rounded text-[11px] font-mono text-slate-700"
                >
                  {getDisplayRoll(matched)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* REPORT DOSSIER CONTAINER (TARGETED FOR CLIENT PDF & PRINT STYLESHEET) */}
      <div id="examinex-report-dossier" className="space-y-6">
        {/* 4.a) HEADLINE CARD (My Report Hero) */}
        {targetCalc && competitorAnalysis && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs relative overflow-hidden avoid-break-inside">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-indigo-600" />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-7 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-semibold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                    Individual Academic Standing
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    Roll: {getDisplayRoll(targetCalc.student)}
                  </span>
                  {fairComparisonMode && (
                    <span className="text-xs font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-semibold">
                      Fair Comparison Active
                    </span>
                  )}
                </div>

                <div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-sans">
                    {targetCalc.verdict === 'secured'
                      ? `Top ${Math.max(1, 100 - competitorAnalysis.percentile)}% · Grade ${scheme.targetGradeName} Already Secured!`
                      : targetCalc.verdict === 'reachable'
                      ? `Top ${Math.max(1, 100 - competitorAnalysis.percentile)}%. You need ${targetCalc.neededInFinal}/${targetCalc.finalWeight} (${targetCalc.neededPercentage}%) in final for ${scheme.targetGradeName}.`
                      : `Rank #${competitorAnalysis.myRank} of ${competitorAnalysis.totalStudents} · Sessional ${targetCalc.sessionalTotalEarned}/${targetCalc.sessionalWeightTotal}`}
                  </h2>
                  <p className="text-sm text-slate-600 mt-2">
                    Ranked <strong className="text-slate-900 font-mono">#{competitorAnalysis.myRank}</strong> of{' '}
                    <strong className="text-slate-900 font-mono">{competitorAnalysis.totalStudents} students</strong> with a sessional total of{' '}
                    <strong className="text-indigo-700 font-mono font-bold">{targetCalc.sessionalTotalEarned}</strong> / {targetCalc.sessionalWeightTotal} marks.
                  </p>
                </div>
              </div>

              {/* KPI Strip */}
              <div className="lg:col-span-5 grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <span className="text-[11px] font-medium text-slate-500 block">Class Rank</span>
                  <span className="text-2xl font-bold font-mono text-indigo-700 tabular-nums">
                    #{competitorAnalysis.myRank}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono block">
                    of {competitorAnalysis.totalStudents} students
                  </span>
                </div>

                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <span className="text-[11px] font-medium text-slate-500 block">Percentile</span>
                  <span className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
                    {competitorAnalysis.percentile}%
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono block">
                    Top {Math.max(1, 100 - competitorAnalysis.percentile)}% of class
                  </span>
                </div>

                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <span className="text-[11px] font-medium text-slate-500 block">
                    {fairComparisonMode ? 'Fair Score' : 'Sessional Earned'}
                  </span>
                  <span className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
                    {targetCalc.sessionalTotalEarned}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono block">
                    / {targetCalc.sessionalWeightTotal} max points
                  </span>
                </div>

                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <span className="text-[11px] font-medium text-slate-500 block">Final A+ Target</span>
                  <span className="text-2xl font-bold font-mono text-emerald-700 tabular-nums">
                    {targetCalc.neededInFinal}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono block">
                    / {targetCalc.finalWeight} in final
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4.b) A+ PLANNER (Step-by-Step CT Breakdown, Class Final Comparison & What-If) */}
        {targetCalc && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4 avoid-break-inside">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Target className="w-4 h-4 text-indigo-600" />
                  <span>A+ Target Planner & Step-by-Step CT Calculation</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Exact derivation of final marks needed for 80 (A+) with step-by-step Class Test scaling.
                </p>
              </div>

              {/* What-If Toggle */}
              <button
                onClick={() => setWhatIfActive(!whatIfActive)}
                className={`no-print flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                  whatIfActive
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{whatIfActive ? 'What-If Active' : 'Enable What-If Mode'}</span>
              </button>
            </div>

            {/* Class Final Exam Average Benchmark */}
            {classStats.finalCount > 0 && classStats.finalAverage !== null && (
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    <strong>Class Final Exam Benchmark:</strong> {classStats.finalCount} students already have final marks in the CSV. Class final average is{' '}
                    <strong className="font-mono">{classStats.finalAverage}/{targetCalc.finalWeight} ({((classStats.finalAverage / targetCalc.finalWeight) * 100).toFixed(1)}%)</strong>.
                    {targetCalc.verdict === 'reachable' && (
                      <span>
                        {' '}You need <strong className="font-mono">{targetCalc.neededInFinal}/{targetCalc.finalWeight}</strong>, which is{' '}
                        {targetCalc.neededInFinal <= classStats.finalAverage ? (
                          <span className="text-emerald-700 font-semibold">comfortably below or equal to class average!</span>
                        ) : (
                          <span className="text-amber-800 font-semibold">{(targetCalc.neededInFinal - classStats.finalAverage).toFixed(1)} marks above class average.</span>
                        )}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* Step-by-step CT derivation box */}
            {targetCalc.componentsBreakdown
              .filter((cb) => cb.subScores && cb.subScores.length > 0)
              .map((ctComp) => (
                <div key={ctComp.componentId} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      Step-by-Step Breakdown: {ctComp.name}
                    </span>
                    <span className="text-xs font-mono font-bold text-indigo-700">
                      Earned: {ctComp.earnedScaledMarks} / {ctComp.weight} marks
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {ctComp.subScores?.map((sub) => (
                      <div
                        key={sub.id}
                        className={`px-3 py-1.5 rounded-lg border flex items-center gap-2 ${
                          sub.rawScore === null
                            ? 'bg-slate-100 text-slate-400 border-dashed border-slate-300'
                            : sub.usedInBestN
                            ? 'bg-emerald-50 text-emerald-900 border-emerald-300 font-semibold'
                            : 'bg-white text-slate-500 border-slate-200 line-through'
                        }`}
                      >
                        <span>{sub.name}:</span>
                        <span className="font-mono">{sub.rawScore !== null ? `${sub.rawScore}/${sub.maxScore}` : 'Pending'}</span>
                        {sub.rawScore !== null && sub.usedInBestN && (
                          <span className="text-[10px] bg-emerald-200 text-emerald-800 px-1 rounded no-underline font-normal">
                            Counted
                          </span>
                        )}
                        {sub.rawScore !== null && !sub.usedInBestN && (
                          <span className="text-[10px] bg-slate-100 text-slate-500 px-1 rounded no-underline font-normal">
                            Dropped
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="text-[11px] text-slate-600 font-mono bg-white p-2.5 rounded-lg border border-slate-200">
                    Formula: {ctComp.notes}
                  </div>
                </div>
              ))}

            {/* What-If Sliders (if active) */}
            {whatIfActive && (
              <div className="p-4 bg-indigo-50/70 rounded-xl border border-indigo-200 space-y-3 no-print">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                    What-If Simulation Sliders (Does not overwrite stored marks)
                  </span>
                  <button
                    onClick={() => setWhatIfOverrides({})}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    Reset Overrides
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                  {scheme.components
                    .filter((c) => !c.isFinalExam)
                    .map((comp) => {
                      if (comp.type === 'single') {
                        const cur = whatIfOverrides[comp.id] ?? meStudent?.marks[comp.id] ?? 0;
                        const max = comp.maxMarks || comp.weight;
                        return (
                          <div key={comp.id} className="bg-white p-2.5 rounded-lg border border-indigo-100 space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="font-medium text-slate-700">{comp.name}</span>
                              <span className="font-mono font-bold text-indigo-700">{cur}</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max={max}
                              step="0.5"
                              value={cur}
                              onChange={(e) => setWhatIfOverrides({ ...whatIfOverrides, [comp.id]: Number(e.target.value) })}
                              className="w-full accent-indigo-600 cursor-pointer"
                            />
                          </div>
                        );
                      } else if (comp.subComponents) {
                        return comp.subComponents.map((sub) => {
                          const cur = whatIfOverrides[sub.id] ?? meStudent?.marks[sub.id] ?? 0;
                          return (
                            <div key={sub.id} className="bg-white p-2.5 rounded-lg border border-indigo-100 space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="font-medium text-slate-700">{sub.name}</span>
                                <span className="font-mono font-bold text-indigo-700">{cur}</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max={sub.maxMarks}
                                step="0.5"
                                value={cur}
                                onChange={(e) => setWhatIfOverrides({ ...whatIfOverrides, [sub.id]: Number(e.target.value) })}
                                className="w-full accent-indigo-600 cursor-pointer"
                              />
                            </div>
                          );
                        });
                      }
                      return null;
                    })}
                </div>
              </div>
            )}

            {/* Grade Targets Grid */}
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">Grade</th>
                    <th className="py-2.5 px-3">Cutoff</th>
                    <th className="py-2.5 px-3">Final Marks Needed</th>
                    <th className="py-2.5 px-3">Final % Needed</th>
                    <th className="py-2.5 px-3">Verdict</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {targetCalc.allGradeTargets.map((gt) => (
                    <tr key={gt.grade} className="hover:bg-slate-50/60">
                      <td className="py-2 px-3 font-bold text-slate-900 font-sans">
                        {gt.grade}
                      </td>
                      <td className="py-2 px-3">{gt.minMarks}</td>
                      <td className="py-2 px-3 font-bold text-indigo-700">
                        {gt.isAlreadySecured ? '0 (Secured)' : gt.isReachable ? `${gt.neededInFinal} / ${targetCalc.finalWeight}` : 'Unreachable'}
                      </td>
                      <td className="py-2 px-3">{gt.isAlreadySecured ? '0%' : `${gt.finalPercentage}%`}</td>
                      <td className="py-2 px-3 font-sans">
                        {gt.isAlreadySecured ? (
                          <span className="text-emerald-700 font-semibold">Secured</span>
                        ) : gt.isReachable ? (
                          <span className="text-blue-700 font-semibold">Achievable</span>
                        ) : (
                          <span className="text-rose-600 font-semibold">Out of Reach</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* B3.3: CURRENT VS POTENTIAL TOTALS & DUAL RANKING */}
        {myPotential && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4 avoid-break-inside">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Scale className="w-4 h-4 text-indigo-600" />
                  <span>Current vs Potential Totals (Dual Ranking)</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Compares marks earned so far with mathematically bounded potential: Best-Case (100%), Worst-Case (0%), and Likely Case.
                </p>
              </div>

              {/* Dual Rank Switcher */}
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs no-print">
                <span className="text-[11px] font-medium text-slate-500 px-1">Rank Table By:</span>
                <button
                  onClick={() => setDualRankSort('earned')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    dualRankSort === 'earned'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Earned So Far
                </button>
                <button
                  onClick={() => setDualRankSort('likely')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    dualRankSort === 'likely'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Likely Total
                </button>
              </div>
            </div>

            {/* My Potential Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <span className="text-[11px] font-medium text-slate-500 block">Earned So Far</span>
                <span className="text-xl font-bold font-mono text-slate-900">
                  {myPotential.earnedSoFar}
                </span>
                <span className="text-[10px] text-slate-400 block font-mono">
                  Rank #{myPotential.rankEarned}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <span className="text-[11px] font-medium text-slate-500 block">Marks Available</span>
                <span className="text-xl font-bold font-mono text-indigo-700">
                  {myPotential.marksAvailable}
                </span>
                <span className="text-[10px] text-slate-400 block font-mono">
                  Points left to win
                </span>
              </div>

              <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200 text-center">
                <span className="text-[11px] font-medium text-amber-800 block">Worst-Case</span>
                <span className="text-xl font-bold font-mono text-amber-900">
                  {myPotential.worstCaseTotal}
                </span>
                <span className="text-[10px] text-amber-700 block font-mono">
                  Remaining = 0%
                </span>
              </div>

              <div className="p-3 bg-indigo-50/80 rounded-xl border border-indigo-200 text-center">
                <span className="text-[11px] font-medium text-indigo-800 block">Likely Total</span>
                <span className="text-xl font-bold font-mono text-indigo-900">
                  {myPotential.likelyTotal}
                </span>
                <span className="text-[10px] text-indigo-700 block font-mono">
                  Rank #{myPotential.rankLikely}
                </span>
              </div>

              <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200 text-center">
                <span className="text-[11px] font-medium text-emerald-800 block">Best-Case</span>
                <span className="text-xl font-bold font-mono text-emerald-900">
                  {myPotential.bestCaseTotal}
                </span>
                <span className="text-[10px] text-emerald-700 block font-mono">
                  Remaining = 100%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 4.c) HOW I COMPARE (Stats Grid, Z-Scores & Distribution Histogram) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 avoid-break-inside">
          <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Component Comparison vs Class Benchmark
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Side-by-side metrics: Your score vs Class Average, Median, and Top Score.
              </p>
            </div>

            {/* Strongest & Weakest Callout */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {classStats.strongestComponent && (
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg text-xs space-y-1">
                  <span className="font-bold text-emerald-900 flex items-center gap-1">
                    <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                    Strongest: {classStats.strongestComponent.name}
                  </span>
                  <p className="text-[11px] text-emerald-800">
                    {classStats.strongestComponent.diff > 0 ? `+${classStats.strongestComponent.diff}` : classStats.strongestComponent.diff} marks (z-score: {classStats.strongestComponent.zScore} standard deviations above average).
                  </p>
                </div>
              )}

              {classStats.weakestComponent && (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs space-y-1">
                  <span className="font-bold text-amber-900 flex items-center gap-1">
                    <ArrowDownRight className="w-3.5 h-3.5 text-amber-600" />
                    Weakest: {classStats.weakestComponent.name}
                  </span>
                  <p className="text-[11px] text-amber-800">
                    {classStats.weakestComponent.diff > 0 ? `+${classStats.weakestComponent.diff}` : classStats.weakestComponent.diff} marks (z-score: {classStats.weakestComponent.zScore} relative to class).
                  </p>
                </div>
              )}
            </div>

            {/* Component Comparison Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">Component</th>
                    <th className="py-2.5 px-3">My Score</th>
                    <th className="py-2.5 px-3">Class Average</th>
                    <th className="py-2.5 px-3">Class Median</th>
                    <th className="py-2.5 px-3">Top Score</th>
                    <th className="py-2.5 px-3">Difference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {Object.entries(classStats.componentStats).map(([id, stat]) => {
                    const diff = Number((stat.myScore - stat.average).toFixed(2));
                    return (
                      <tr key={id} className="hover:bg-slate-50/60">
                        <td className="py-2.5 px-3 font-sans font-medium text-slate-900">
                          {stat.name}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-indigo-700">
                          {stat.myScore}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{stat.average}</td>
                        <td className="py-2.5 px-3 text-slate-600">{stat.median}</td>
                        <td className="py-2.5 px-3 text-slate-900 font-semibold">{stat.top}</td>
                        <td className="py-2.5 px-3">
                          <span className={`font-semibold ${diff >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {diff >= 0 ? `+${diff}` : diff}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: Distribution Histogram (5 cols) */}
          <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Class Score Distribution
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Histogram of sessional totals. Your score bin is highlighted in purple.
              </p>
            </div>

            <div className="h-56 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={classStats.distributionHistogram} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#64748B" angle={-15} textAnchor="end" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="#64748B" />
                  <Tooltip
                    formatter={(val: any) => [`${val} students`, 'Frequency']}
                    labelFormatter={(lbl) => `Marks Range: ${lbl}`}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {classStats.distributionHistogram.map((bin, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={bin.hasMe ? '#4F46E5' : '#94A3B8'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-center gap-4 text-[11px] text-slate-600 pt-1 border-t border-slate-100">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-indigo-600 inline-block" />
                <span>Your Score Bin</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-slate-400 inline-block" />
                <span>Classmates</span>
              </div>
            </div>
          </div>
        </div>

        {/* 4.d) COMPETITORS (5 Above & 5 Below, Rival Rules, Overtake Engine) */}
        {competitorAnalysis && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4 avoid-break-inside">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Direct Competitors & Rival Radar
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  The 5 students directly above you and 5 students directly below you in class standings. Click any student to open the head-to-head comparison.
                </p>
              </div>

              {/* Editable Rival Rules Button */}
              <button
                onClick={() => setShowRivalSettings(!showRivalSettings)}
                className="no-print flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
              >
                <Settings className="w-3.5 h-3.5 text-slate-500" />
                <span>Configure Rival Rules</span>
              </button>
            </div>

            {/* Rival Rule Settings Drawer */}
            {showRivalSettings && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs no-print">
                <span className="font-bold text-slate-900 block">
                  Rival Definition Rules (Editable)
                </span>
                <p className="text-slate-600 text-[11px]">
                  Default rule: Ahead of you, or up to 3 marks behind, and within 6 marks of you overall.
                </p>
                <div className="flex flex-wrap items-center gap-4 pt-1">
                  <div className="flex items-center gap-2">
                    <label className="text-slate-700">Max Marks Behind for Rival:</label>
                    <input
                      type="number"
                      min="1"
                      max="15"
                      value={rivalConfig.maxGapBehind}
                      onChange={(e) => setRivalConfig({ ...rivalConfig, maxGapBehind: Number(e.target.value) })}
                      className="w-16 px-2 py-1 font-mono text-center bg-white border border-slate-300 rounded"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-slate-700">Max Overall Gap Window:</label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={rivalConfig.maxGapOverall}
                      onChange={(e) => setRivalConfig({ ...rivalConfig, maxGapOverall: Number(e.target.value) })}
                      className="w-16 px-2 py-1 font-mono text-center bg-white border border-slate-300 rounded"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Competitors Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">Rank</th>
                    <th className="py-2.5 px-3">Roll</th>
                    <th className="py-2.5 px-3">Student Name</th>
                    <th className="py-2.5 px-3">Sessional Score</th>
                    <th className="py-2.5 px-3">Overall Gap</th>
                    <th className="py-2.5 px-3">Beats Me Most In</th>
                    <th className="py-2.5 px-3">Rival Status</th>
                    <th className="py-2.5 px-3">Overtake Potential</th>
                    <th className="py-2.5 px-3 no-print">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {/* 5 Above */}
                  {competitorAnalysis.competitorsAbove.map((c) => (
                    <tr key={c.student.id} className="hover:bg-slate-50/60 bg-amber-50/20">
                      <td className="py-2.5 px-3 font-bold text-slate-900">#{c.rank}</td>
                      <td className="py-2.5 px-3 text-slate-600">{getDisplayRoll(c.student)}</td>
                      <td className="py-2.5 px-3 font-sans font-medium text-slate-900">
                        {getDisplayName(c.student)}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{c.sessionalScore}</td>
                      <td className="py-2.5 px-3 text-amber-700 font-bold">
                        +{c.overallGap} marks
                      </td>
                      <td className="py-2.5 px-3 font-sans text-slate-700">
                        {c.beatsMeMostComponent ? (
                          <span>
                            {c.beatsMeMostComponent.componentName} (+{c.beatsMeMostComponent.gap})
                          </span>
                        ) : (
                          <span className="text-slate-400">None</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          c.rivalCategory === 'Rival'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {c.rivalCategory}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        {c.canICatchThem ? (
                          <span className="text-emerald-700 text-[11px] font-medium">
                            Can Catch (Buffer {c.maxPossibleCatchGap})
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Uncatchable</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-sans no-print">
                        <button
                          onClick={() => {
                            setHeadToHeadOpponent(c.student);
                            setShowHeadToHeadModal(true);
                          }}
                          className="text-indigo-600 hover:text-indigo-800 font-semibold"
                        >
                          Compare
                        </button>
                      </td>
                    </tr>
                  ))}

                  {/* Current Student "Me" Row */}
                  <tr className="bg-indigo-50 border-y-2 border-indigo-400 font-bold">
                    <td className="py-3 px-3 text-indigo-900">#{competitorAnalysis.myRank}</td>
                    <td className="py-3 px-3 text-indigo-900">{getDisplayRoll(meStudent!)}</td>
                    <td className="py-3 px-3 font-sans text-indigo-950 flex items-center gap-1.5">
                      <span>{getDisplayName(meStudent!)}</span>
                      <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded font-sans uppercase">
                        You
                      </span>
                    </td>
                    <td className="py-3 px-3 text-indigo-950 font-extrabold">{competitorAnalysis.mySessionalScore}</td>
                    <td className="py-3 px-3 text-indigo-900">— Baseline —</td>
                    <td className="py-3 px-3 text-indigo-900">—</td>
                    <td className="py-3 px-3 text-indigo-900">—</td>
                    <td className="py-3 px-3 text-indigo-900">—</td>
                    <td className="py-3 px-3 font-sans no-print">—</td>
                  </tr>

                  {/* 5 Below */}
                  {competitorAnalysis.competitorsBelow.map((c) => (
                    <tr key={c.student.id} className="hover:bg-slate-50/60 bg-blue-50/20">
                      <td className="py-2.5 px-3 font-bold text-slate-900">#{c.rank}</td>
                      <td className="py-2.5 px-3 text-slate-600">{getDisplayRoll(c.student)}</td>
                      <td className="py-2.5 px-3 font-sans font-medium text-slate-900">
                        {getDisplayName(c.student)}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{c.sessionalScore}</td>
                      <td className="py-2.5 px-3 text-blue-700 font-bold">
                        {c.overallGap} marks
                      </td>
                      <td className="py-2.5 px-3 font-sans text-slate-700">
                        {c.beatsMeMostComponent ? (
                          <span>
                            {c.beatsMeMostComponent.componentName} (+{c.beatsMeMostComponent.gap})
                          </span>
                        ) : (
                          <span className="text-slate-400">None</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          c.rivalCategory === 'Rival'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {c.rivalCategory}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        {c.canOvertakeMe ? (
                          <span className="text-amber-700 text-[11px] font-medium">
                            Can Overtake
                          </span>
                        ) : (
                          <span className="text-emerald-700 text-[11px] font-medium">Safe</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-sans no-print">
                        <button
                          onClick={() => {
                            setHeadToHeadOpponent(c.student);
                            setShowHeadToHeadModal(true);
                          }}
                          className="text-indigo-600 hover:text-indigo-800 font-semibold"
                        >
                          Compare
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4.e) TRENDS (CT1 - CT4 Line Chart, Most Improved & Falling Behind) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 avoid-break-inside">
          <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Class Test Trajectory (Me vs Class vs Top Rivals)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Linear performance across consecutive CTs. Visualizes momentum before finals.
              </p>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ctChartData} margin={{ top: 10, right: 20, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#64748B" />
                  <YAxis domain={[0, 20]} tick={{ fontSize: 11 }} stroke="#64748B" />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Line
                    type="monotone"
                    dataKey="Me"
                    stroke="#4F46E5"
                    strokeWidth={3}
                    activeDot={{ r: 6 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="Class Average"
                    stroke="#64748B"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    connectNulls
                  />
                  {competitorAnalysis?.topRivals.slice(0, 2).map((rival, idx) => (
                    <Line
                      key={rival.student.id}
                      type="monotone"
                      dataKey={getDisplayName(rival.student, idx)}
                      stroke={idx === 0 ? '#D97706' : '#059669'}
                      strokeWidth={1.8}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              Momentum Leaders & Trend Slopes
            </h2>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Most Improved Students
                </span>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <tbody className="divide-y divide-slate-100">
                      {trendsAnalysis.mostImproved.map((t, idx) => (
                        <tr key={t.student.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-medium text-slate-800">
                            {getDisplayName(t.student, idx)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                            +{t.slope} marks/test
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-bold text-rose-800 uppercase tracking-wider flex items-center gap-1">
                  <TrendingDown className="w-3.5 h-3.5" />
                  Falling Behind (Declining Trend)
                </span>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <tbody className="divide-y divide-slate-100">
                      {trendsAnalysis.fallingBehind.map((t, idx) => (
                        <tr key={t.student.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-medium text-slate-800">
                            {getDisplayName(t.student, idx)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-rose-600">
                            {t.slope} marks/test
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4.f) PREDICTION & ESTIMATED FINAL TOTAL (RANGE, never one single number) */}
        {predictions && targetCalc && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4 avoid-break-inside">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span>Deterministic Final Total Prediction (Estimated Range)</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Mathematical projection shown strictly as a RANGE (low, likely, high).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Method:</span>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                  {predictions.method === 'linear_regression'
                    ? `Linear Regression (${predictions.dataPointsUsed} finals)`
                    : 'Sessional Proxy with Uncertainty'}
                </span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                  predictions.confidence === 'high'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : predictions.confidence === 'medium'
                    ? 'bg-blue-50 text-blue-800 border border-blue-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}>
                  Confidence: {predictions.confidence.toUpperCase()}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center space-y-1">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Conservative (Low)
                </span>
                <div className="text-2xl font-bold font-mono text-slate-900">
                  {predictions.estimatedFinalLow} / {targetCalc.finalWeight}
                </div>
                <p className="text-[11px] text-slate-500">
                  Total with Sessional:{' '}
                  <strong className="font-mono text-slate-800">
                    {(targetCalc.sessionalTotalEarned + predictions.estimatedFinalLow).toFixed(1)}
                  </strong>
                </p>
              </div>

              <div className="p-4 bg-indigo-50/70 rounded-xl border border-indigo-200 text-center space-y-1">
                <span className="text-xs font-semibold uppercase text-indigo-700">
                  Most Likely Projection
                </span>
                <div className="text-3xl font-extrabold font-mono text-indigo-700">
                  {predictions.estimatedFinalLikely} / {targetCalc.finalWeight}
                </div>
                <p className="text-[11px] text-indigo-900 font-medium">
                  Total with Sessional:{' '}
                  <strong className="font-mono text-indigo-950 font-bold">
                    {(targetCalc.sessionalTotalEarned + predictions.estimatedFinalLikely).toFixed(1)}
                  </strong>
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center space-y-1">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Optimistic (High)
                </span>
                <div className="text-2xl font-bold font-mono text-slate-900">
                  {predictions.estimatedFinalHigh} / {targetCalc.finalWeight}
                </div>
                <p className="text-[11px] text-slate-500">
                  Total with Sessional:{' '}
                  <strong className="font-mono text-slate-800">
                    {(targetCalc.sessionalTotalEarned + predictions.estimatedFinalHigh).toFixed(1)}
                  </strong>
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
              <span className="font-semibold text-slate-800">Calculation Method & Probability:</span>
              <p className="text-slate-600 text-[11px]">{predictions.explanation}</p>
              <div className="pt-1 flex flex-wrap items-center gap-4 text-xs font-mono">
                <span>
                  Probability of A+: <strong className="text-emerald-700 font-bold">{predictions.probabilityOfAPlus}%</strong>
                </span>
                <span>·</span>
                <span>
                  Predicted Final Rank Range:{' '}
                  <strong className="text-slate-900 font-bold">
                    #{predictions.predictedRankLow} to #{predictions.predictedRankHigh}
                  </strong>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 4.g) ACTION PLAN (Rules-Based Prioritized Recommendations) */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4 avoid-break-inside">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-indigo-600" />
              <span>Tactical Action Plan</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Prioritized strategic advice generated strictly from mathematical algorithms and competitor gap analysis.
            </p>
          </div>

          <div className="space-y-2.5">
            {actionPlan.map((item, idx) => (
              <div
                key={item.id}
                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 flex items-start gap-3"
              >
                <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 font-mono">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-slate-900">{item.title}</h3>
                    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded ${
                      item.priority === 'high'
                        ? 'bg-rose-100 text-rose-800'
                        : item.priority === 'medium'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}>
                      {item.priority} Priority
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{item.rationale}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4.h) EXPORTS & REPORTS BAR */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Reports, Print & Data Exports</h2>
          <p className="text-xs text-slate-500">
            Download your PDF dossier, print with page breaks, or export clean analysis CSVs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Download PDF via jsPDF + html2canvas */}
          <button
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors"
          >
            {isExportingPdf ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Exporting PDF...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF Dossier</span>
              </>
            )}
          </button>

          {/* Print button triggering window.print() with print stylesheet */}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print View</span>
          </button>

          {/* Copy Report as Text fallback */}
          <button
            onClick={handleCopyReportText}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy as Text</span>
          </button>

          {/* Share-Safe CSV */}
          <button
            onClick={() => handleDownloadCsv(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Share-Safe CSV</span>
          </button>

          {/* Full Analysis CSV */}
          <button
            onClick={() => handleDownloadCsv(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Full CSV</span>
          </button>
        </div>
      </div>

      {/* MODAL 1: HEAD-TO-HEAD COMPARISON MODAL */}
      {showHeadToHeadModal && headToHeadOpponent && meStudent && (
        <HeadToHeadModal
          isOpen={showHeadToHeadModal}
          onClose={() => setShowHeadToHeadModal(false)}
          me={meStudent}
          selectedOpponent={headToHeadOpponent}
          onSelectOpponent={(st) => setHeadToHeadOpponent(st)}
          students={students}
          scheme={scheme}
          watchlist={watchlist}
          onToggleWatchlist={handleToggleWatchlist}
          isAnonymized={isAnonymized}
        />
      )}

      {/* MODAL 2: HISTORY SNAPSHOTS & WHAT CHANGED MODAL */}
      <HistorySnapshotsModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        snapshots={snapshots}
        whatChanged={whatChangedReport}
      />

      {/* MODAL 3: IN-MODULE CSV UPLOAD MODAL */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">
                Upload Whole Class Marks CSV
              </h2>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                Upload one CSV for this course. Expected columns: <code>roll, name (optional), attendance, ct1, ct2, ct3, ct4, assignment, final</code>.
              </p>

              {/* Absent Handling Mode */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5">
                <span className="text-xs font-bold text-slate-800 block">
                  Absent Marker Interpretation:
                </span>
                <p className="text-[11px] text-slate-500">
                  How should symbols like &quot;AB&quot;, &quot;absent&quot;, or &quot;-&quot; be treated?
                </p>
                <div className="flex items-center gap-4 text-xs pt-1">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="absentMode"
                      checked={absentHandling === 'missing'}
                      onChange={() => setAbsentHandling('missing')}
                      className="accent-indigo-600"
                    />
                    <span>Missing (Not Taken Yet) [Recommended]</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="absentMode"
                      checked={absentHandling === 'zero'}
                      onChange={() => setAbsentHandling('zero')}
                      className="accent-indigo-600"
                    />
                    <span>Zero (0 Marks)</span>
                  </label>
                </div>
              </div>

              {/* Upload Trigger Box */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-xl p-8 text-center cursor-pointer transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  onChange={handleUploadFile}
                  className="hidden"
                />
                <Upload className="w-8 h-8 text-indigo-600 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-800">
                  Click to select CSV from your computer
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Supports UTF-8 BOM, Bangla names, and Excel CSV exports
                </p>
              </div>

              {uploadErrorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                  {uploadErrorMsg}
                </div>
              )}

              <div className="pt-2 flex items-center justify-between text-xs border-t border-slate-100">
                <button
                  onClick={() => downloadCsvFile(CSV_TEMPLATE_STRING, 'examinex_class_template.csv')}
                  className="flex items-center gap-1 text-indigo-600 hover:underline"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download CSV Template
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
