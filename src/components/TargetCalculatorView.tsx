import React, { useState, useMemo } from 'react';
import { AssessmentScheme, StudentRecord, TargetCalculation } from '../types';
import { calculateStudentTarget } from '../algorithms/targetCalculator';
import {
  Trophy,
  Target,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  TrendingUp,
  Sparkles,
  ArrowRight,
  Info,
  RotateCcw,
} from 'lucide-react';

interface TargetCalculatorViewProps {
  scheme: AssessmentScheme;
  students: StudentRecord[];
  isAnonymized: boolean;
  onOpenUpload: () => void;
}

export const TargetCalculatorView: React.FC<TargetCalculatorViewProps> = ({
  scheme,
  students,
  isAnonymized,
  onOpenUpload,
}) => {
  // Find current "me" student, or default to first student
  const meStudent = useMemo(() => students.find((s) => s.isMe) || students[0], [students]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>(meStudent?.id || '');

  // Keep selected student synced if meStudent changes
  React.useEffect(() => {
    if (meStudent && !selectedStudentId) {
      setSelectedStudentId(meStudent.id);
    }
  }, [meStudent, selectedStudentId]);

  // "What-if" overrides state
  const [whatIfOverrides, setWhatIfOverrides] = useState<Record<string, number | null>>({});

  // Active inspected student
  const activeStudent = useMemo(() => {
    return students.find((s) => s.id === selectedStudentId) || meStudent;
  }, [students, selectedStudentId, meStudent]);

  // Main calculation
  const targetCalc: TargetCalculation | null = useMemo(() => {
    if (!activeStudent) return null;
    return calculateStudentTarget(activeStudent, scheme, whatIfOverrides);
  }, [activeStudent, scheme, whatIfOverrides]);

  // Baseline calculation (without what-if overrides) to show delta
  const baselineCalc: TargetCalculation | null = useMemo(() => {
    if (!activeStudent) return null;
    return calculateStudentTarget(activeStudent, scheme);
  }, [activeStudent, scheme]);

  const displayName = (student: StudentRecord, index: number) => {
    if (isAnonymized) {
      return student.isMe ? `Me (Student ${index + 1})` : `Student ${index + 1}`;
    }
    return student.name;
  };

  const handleWhatIfChange = (fieldId: string, val: number) => {
    setWhatIfOverrides((prev) => ({
      ...prev,
      [fieldId]: val,
    }));
  };

  const handleResetWhatIf = () => {
    setWhatIfOverrides({});
  };

  const hasActiveOverrides = Object.keys(whatIfOverrides).length > 0;

  if (!students || students.length === 0 || !activeStudent || !targetCalc || !baselineCalc) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 sm:p-12 text-center max-w-xl mx-auto shadow-xs space-y-4">
        <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
          <Target className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">No Student Records Loaded</h2>
        <p className="text-xs text-slate-500">
          Upload a course marks CSV file or load our sample university dataset to see the exact semester final marks needed for an A+.
        </p>
        <button
          onClick={onOpenUpload}
          className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors"
        >
          Go to CSV Ingestion
        </button>
      </div>
    );
  }

  // Visual difficulty color configurations
  const getDifficultyBadge = (difficulty: TargetCalculation['difficulty']) => {
    switch (difficulty) {
      case 'secured':
        return {
          bg: 'bg-emerald-500/10 text-emerald-800 border-emerald-300',
          indicator: 'bg-emerald-600',
          label: 'Already Secured',
          accent: 'emerald',
        };
      case 'easy':
        return {
          bg: 'bg-teal-500/10 text-teal-800 border-teal-300',
          indicator: 'bg-teal-600',
          label: 'Comfortably Achievable (≤ 50%)',
          accent: 'teal',
        };
      case 'moderate':
        return {
          bg: 'bg-blue-500/10 text-blue-800 border-blue-300',
          indicator: 'bg-blue-600',
          label: 'Moderate (50% – 75%)',
          accent: 'blue',
        };
      case 'challenging':
        return {
          bg: 'bg-amber-500/10 text-amber-800 border-amber-300',
          indicator: 'bg-amber-600',
          label: 'Challenging (75% – 90%)',
          accent: 'amber',
        };
      case 'critical':
        return {
          bg: 'bg-orange-500/10 text-orange-800 border-orange-300',
          indicator: 'bg-orange-600',
          label: 'High Pressure (90% – 100%)',
          accent: 'orange',
        };
      case 'unreachable':
      default:
        return {
          bg: 'bg-rose-500/10 text-rose-800 border-rose-300',
          indicator: 'bg-rose-600',
          label: 'Mathematically Unreachable (> 100%)',
          accent: 'rose',
        };
    }
  };

  const difficultyMeta = getDifficultyBadge(targetCalc.difficulty);

  return (
    <div className="space-y-6">
      {/* Student Selector & Target Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 font-mono">
              Target Calculator
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-xs text-slate-500 font-mono">
              {scheme.courseCode}: {scheme.courseName}
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">
            Semester Final A+ Target Requirement
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Target: <strong className="text-slate-800">{scheme.targetGradeThreshold} marks</strong> for {scheme.targetGradeName} grade out of {scheme.totalMarks} total marks.
          </p>
        </div>

        {/* Switch Student Dropdown */}
        <div className="flex items-center gap-2 shrink-0 bg-slate-50 p-2 rounded-lg border border-slate-200">
          <label className="text-xs font-medium text-slate-600 shrink-0">
            Inspecting:
          </label>
          <select
            value={selectedStudentId}
            onChange={(e) => {
              setSelectedStudentId(e.target.value);
              setWhatIfOverrides({});
            }}
            className="text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {students.map((st, idx) => (
              <option key={st.id} value={st.id}>
                {displayName(st, idx)} {st.isMe ? ' (You)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* BIG HERO VERDICT CARD */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs relative overflow-hidden">
        {/* Subtle top indicator bar */}
        <div
          className={`absolute top-0 left-0 right-0 h-1.5 ${
            targetCalc.verdict === 'secured'
              ? 'bg-emerald-500'
              : targetCalc.verdict === 'unreachable'
              ? 'bg-rose-500'
              : 'bg-indigo-600'
          }`}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Verdict Core Statement */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold border ${difficultyMeta.bg}`}
              >
                <span className={`w-2 h-2 rounded-full ${difficultyMeta.indicator}`} />
                {difficultyMeta.label}
              </span>

              {hasActiveOverrides && (
                <span className="text-xs font-mono font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                  What-If Simulation Active
                </span>
              )}
            </div>

            <div>
              {targetCalc.verdict === 'secured' ? (
                <div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-emerald-950 tracking-tight flex items-center gap-2">
                    <Trophy className="w-8 h-8 text-emerald-600 shrink-0" />
                    <span>Grade {scheme.targetGradeName} Already Secured!</span>
                  </h2>
                  <p className="text-sm text-slate-600 mt-2">
                    Your current sessional marks alone total{' '}
                    <strong className="text-slate-900 font-mono">{targetCalc.sessionalTotalEarned}</strong> marks,
                    which meets or exceeds the {targetCalc.targetTotalMarks}-mark cutoff. You do not strictly need any final exam marks to attain this grade.
                  </p>
                </div>
              ) : targetCalc.verdict === 'reachable' ? (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Required in Final Exam ({targetCalc.finalWeight} marks available)
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-1 font-mono">
                    <span className="text-indigo-600">{targetCalc.neededInFinal}</span>
                    <span className="text-slate-400 text-2xl font-normal"> / {targetCalc.finalWeight}</span>
                    <span className="text-lg font-medium text-slate-600 ml-3">
                      ({targetCalc.neededPercentage}%)
                    </span>
                  </h2>
                  <p className="text-sm text-slate-600 mt-2">
                    To achieve an <strong className="text-slate-900">{targetCalc.targetGradeName}</strong> ({targetCalc.targetTotalMarks} total marks),
                    you need at least <strong className="text-indigo-700 font-mono">{targetCalc.neededInFinal}</strong> marks in the semester final.
                  </p>
                </div>
              ) : (
                <div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-rose-950 tracking-tight flex items-center gap-2">
                    <XCircle className="w-8 h-8 text-rose-600 shrink-0" />
                    <span>Not Mathematically Reachable</span>
                  </h2>
                  <p className="text-sm text-slate-600 mt-2">
                    With your current sessional total of{' '}
                    <strong className="text-slate-900 font-mono">{targetCalc.sessionalTotalEarned}</strong>, even scoring full marks (
                    <strong className="text-slate-900 font-mono">{targetCalc.finalWeight}/{targetCalc.finalWeight}</strong>) in the final yields{' '}
                    <strong className="text-slate-900 font-mono">
                      {(targetCalc.sessionalTotalEarned + targetCalc.finalWeight).toFixed(2)}
                    </strong> marks, which falls short of {targetCalc.targetTotalMarks}. See lower grades in the table below.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Metrics KPI Strip */}
          <div className="lg:col-span-5 grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <span className="text-[11px] font-medium text-slate-500 block">Sessional Earned</span>
              <span className="text-xl font-bold font-mono text-slate-900 tabular-nums">
                {targetCalc.sessionalTotalEarned}
              </span>
              <span className="text-[11px] text-slate-400 font-mono block">
                / {targetCalc.sessionalWeightTotal} max
              </span>
            </div>

            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <span className="text-[11px] font-medium text-slate-500 block">Final Exam Weight</span>
              <span className="text-xl font-bold font-mono text-indigo-700 tabular-nums">
                {targetCalc.finalWeight}
              </span>
              <span className="text-[11px] text-slate-400 font-mono block">
                {((targetCalc.finalWeight / scheme.totalMarks) * 100).toFixed(0)}% of Course
              </span>
            </div>

            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <span className="text-[11px] font-medium text-slate-500 block">Target Threshold</span>
              <span className="text-xl font-bold font-mono text-slate-900 tabular-nums">
                {targetCalc.targetTotalMarks}
              </span>
              <span className="text-[11px] text-slate-400 font-mono block">
                Grade: {targetCalc.targetGradeName}
              </span>
            </div>

            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <span className="text-[11px] font-medium text-slate-500 block">Sessional % Achieved</span>
              <span className="text-xl font-bold font-mono text-slate-900 tabular-nums">
                {((targetCalc.sessionalTotalEarned / targetCalc.sessionalWeightTotal) * 100).toFixed(1)}%
              </span>
              <span className="text-[11px] text-slate-400 font-mono block">
                of sessional points
              </span>
            </div>
          </div>
        </div>

        {/* What-If Delta Callout if active */}
        {hasActiveOverrides && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-indigo-900 bg-indigo-50/70 p-3 rounded-lg">
            <span>
              <strong>What-If Effect:</strong> Baseline final needed was{' '}
              <span className="font-mono font-semibold">{baselineCalc.neededInFinal}</span> marks.
              With your simulated scores, it is now{' '}
              <span className="font-mono font-bold text-indigo-700">{targetCalc.neededInFinal}</span> marks{' '}
              ({(targetCalc.neededInFinal - baselineCalc.neededInFinal > 0 ? '+' : '')}
              {(targetCalc.neededInFinal - baselineCalc.neededInFinal).toFixed(2)} marks difference).
            </span>

            <button
              onClick={handleResetWhatIf}
              className="flex items-center gap-1 font-semibold text-indigo-700 hover:text-indigo-900 underline"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>
        )}
      </div>

      {/* COMPONENT BREAKDOWN & BEST/WORST CASE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Component Breakdown (8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Component-by-Component Performance
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Exact marks earned so far, scaled to weights. Untaken tests marked accordingly.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {targetCalc.componentsBreakdown.map((breakdown) => (
              <div
                key={breakdown.componentId}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2.5"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-bold text-slate-900">{breakdown.name}</span>
                    <span className="text-xs text-slate-500 font-mono ml-2">
                      ({breakdown.weight} marks weight)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Earned so far:</span>
                    <span className="text-sm font-bold font-mono text-slate-900 tabular-nums">
                      {breakdown.earnedScaledMarks} / {breakdown.weight}
                    </span>
                    <span className="text-xs font-mono text-slate-500">
                      ({((breakdown.earnedScaledMarks / breakdown.weight) * 100).toFixed(1)}%)
                    </span>
                  </div>
                </div>

                {/* Sub-components / Test Tags */}
                {breakdown.subScores && breakdown.subScores.length > 0 && (
                  <div className="pt-2 border-t border-slate-200/60 flex flex-wrap items-center gap-2">
                    {breakdown.subScores.map((sub) => {
                      const isTaken = sub.rawScore !== null;
                      return (
                        <div
                          key={sub.id}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border ${
                            !isTaken
                              ? 'bg-slate-100 text-slate-400 border-dashed border-slate-300'
                              : sub.usedInBestN
                              ? 'bg-emerald-50 text-emerald-900 border-emerald-200 font-medium'
                              : 'bg-slate-100 text-slate-500 border-slate-200 line-through'
                          }`}
                        >
                          <span>{sub.name}:</span>
                          <span className="font-mono font-bold">
                            {isTaken ? `${sub.rawScore}/${sub.maxScore}` : 'Untaken'}
                          </span>
                          {isTaken && sub.usedInBestN && (
                            <span className="text-[10px] text-emerald-700 bg-emerald-100/70 px-1 rounded font-sans no-underline">
                              Counted
                            </span>
                          )}
                          {isTaken && !sub.usedInBestN && (
                            <span className="text-[10px] text-slate-400 bg-slate-200 px-1 rounded font-sans no-underline">
                              Dropped
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{breakdown.notes}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Best Case & Worst Case Projections (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
              <span>Projections for Untaken Tests</span>
            </h2>
            <p className="text-xs text-slate-500">
              Mathematical bounds if some sessional tests remain pending before the final exam.
            </p>

            {/* Best Case Card */}
            <div className="p-3.5 rounded-lg border border-emerald-200 bg-emerald-50/50 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-900">
                <span>Best-Case Scenario</span>
                <span className="font-mono text-emerald-700">Untaken = 100%</span>
              </div>
              <p className="text-[11px] text-emerald-800">
                If you score full marks in all remaining tests:
              </p>
              <div className="pt-1 flex items-baseline justify-between text-xs">
                <span className="text-slate-600">Sessional Total:</span>
                <span className="font-mono font-bold text-slate-900">
                  {targetCalc.bestCaseSessional} / {targetCalc.sessionalWeightTotal}
                </span>
              </div>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-slate-600">Final Needed:</span>
                <span className="font-mono font-bold text-emerald-700">
                  {targetCalc.bestCaseFinalNeeded} / {targetCalc.finalWeight} (
                  {((targetCalc.bestCaseFinalNeeded / targetCalc.finalWeight) * 100).toFixed(1)}%)
                </span>
              </div>
            </div>

            {/* Worst Case Card */}
            <div className="p-3.5 rounded-lg border border-amber-200 bg-amber-50/50 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-amber-900">
                <span>Worst-Case Scenario</span>
                <span className="font-mono text-amber-700">Untaken = 0%</span>
              </div>
              <p className="text-[11px] text-amber-800">
                If remaining untaken tests score 0 marks:
              </p>
              <div className="pt-1 flex items-baseline justify-between text-xs">
                <span className="text-slate-600">Sessional Total:</span>
                <span className="font-mono font-bold text-slate-900">
                  {targetCalc.worstCaseSessional} / {targetCalc.sessionalWeightTotal}
                </span>
              </div>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-slate-600">Final Needed:</span>
                <span className="font-mono font-bold text-amber-800">
                  {targetCalc.worstCaseFinalNeeded} / {targetCalc.finalWeight} (
                  {((targetCalc.worstCaseFinalNeeded / targetCalc.finalWeight) * 100).toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>

          {/* Interactive What-If Simulator Trigger */}
          <div className="bg-indigo-50/60 rounded-xl border border-indigo-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-950 font-bold text-sm">
                <Sliders className="w-4 h-4 text-indigo-600" />
                <span>What-If Simulation</span>
              </div>
              {hasActiveOverrides && (
                <button
                  onClick={handleResetWhatIf}
                  className="text-[11px] text-indigo-700 hover:underline"
                >
                  Clear Overrides
                </button>
              )}
            </div>

            <p className="text-xs text-slate-600">
              Drag the sliders below to simulate different scores in pending or future exams and see how your required final marks change instantly.
            </p>

            <div className="space-y-3 pt-2">
              {scheme.components
                .filter((c) => !c.isFinalExam)
                .map((comp) => {
                  if (comp.type === 'single') {
                    const currentVal = whatIfOverrides[comp.id] ?? activeStudent.marks[comp.id] ?? 0;
                    const max = comp.maxMarks || comp.weight;
                    return (
                      <div key={comp.id} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium text-slate-700">{comp.name}</span>
                          <span className="font-mono font-bold text-indigo-700">
                            {currentVal} / {max}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max={max}
                          step="0.5"
                          value={currentVal}
                          onChange={(e) => handleWhatIfChange(comp.id, Number(e.target.value))}
                          className="w-full accent-indigo-600 cursor-pointer"
                        />
                      </div>
                    );
                  } else if (comp.subComponents) {
                    return (
                      <div key={comp.id} className="space-y-2 pt-1 border-t border-indigo-100">
                        <span className="text-[11px] font-semibold text-slate-700 uppercase tracking-wider block">
                          {comp.name} Sub-Tests
                        </span>
                        {comp.subComponents.map((sub) => {
                          const currentVal = whatIfOverrides[sub.id] ?? activeStudent.marks[sub.id] ?? 0;
                          return (
                            <div key={sub.id} className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-600">{sub.name}</span>
                                <span className="font-mono font-bold text-indigo-700">
                                  {currentVal} / {sub.maxMarks}
                                </span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max={sub.maxMarks}
                                step="0.5"
                                value={currentVal}
                                onChange={(e) => handleWhatIfChange(sub.id, Number(e.target.value))}
                                className="w-full accent-indigo-600 cursor-pointer"
                              />
                            </div>
                          );
                        })}
                      </div>
                    );
                  }
                  return null;
                })}
            </div>
          </div>
        </div>
      </div>

      {/* FULL GRADE THRESHOLD TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Target Requirements for All Letter Grades
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Compare final exam marks needed across every grade boundary based on your current sessional score ({targetCalc.sessionalTotalEarned}).
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-2.5 px-4">Grade</th>
                <th className="py-2.5 px-4">Threshold</th>
                <th className="py-2.5 px-4">Final Marks Needed</th>
                <th className="py-2.5 px-4">Final % Needed</th>
                <th className="py-2.5 px-4">Attainability Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {targetCalc.allGradeTargets.map((gt) => {
                const isCurrentTarget = gt.grade === scheme.targetGradeName;
                return (
                  <tr
                    key={gt.grade}
                    className={`hover:bg-slate-50/60 ${
                      isCurrentTarget ? 'bg-indigo-50/40 font-medium' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-bold text-slate-900 flex items-center gap-2">
                      <span className="w-8 py-0.5 text-center bg-slate-100 rounded text-xs font-mono">
                        {gt.grade}
                      </span>
                      {isCurrentTarget && (
                        <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-100/70 px-1.5 py-0.5 rounded">
                          Current Goal
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-slate-700">
                      {gt.minMarks} / {scheme.totalMarks}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 tabular-nums">
                      {gt.isAlreadySecured ? (
                        <span className="text-emerald-700 font-sans font-semibold">0 (Already Secured)</span>
                      ) : gt.isReachable ? (
                        `${gt.neededInFinal} / ${targetCalc.finalWeight}`
                      ) : (
                        <span className="text-rose-600 font-sans">Unreachable ({gt.neededInFinal})</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600 tabular-nums">
                      {gt.isAlreadySecured
                        ? '0.0%'
                        : gt.isReachable
                        ? `${gt.finalPercentage}%`
                        : `${gt.finalPercentage}% (Exceeds 100%)`}
                    </td>
                    <td className="py-3 px-4">
                      {gt.isAlreadySecured ? (
                        <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-semibold inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Secured
                        </span>
                      ) : gt.isReachable ? (
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-medium inline-flex items-center gap-1 ${
                            gt.difficulty === 'easy'
                              ? 'bg-teal-50 text-teal-800 border border-teal-200'
                              : gt.difficulty === 'moderate'
                              ? 'bg-blue-50 text-blue-800 border border-blue-200'
                              : gt.difficulty === 'challenging'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-orange-50 text-orange-800 border border-orange-200'
                          }`}
                        >
                          {gt.difficulty.toUpperCase()} ({gt.finalPercentage}%)
                        </span>
                      ) : (
                        <span className="text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded text-[11px] font-medium inline-flex items-center gap-1">
                          <XCircle className="w-3 h-3" /> Out of Reach
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
