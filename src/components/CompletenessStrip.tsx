import React, { useState } from 'react';
import { CompletenessReport, ComponentStatusItem } from '../types';
import { CheckCircle2, AlertCircle, XCircle, Sliders, Info, ChevronDown, ChevronUp } from 'lucide-react';

interface CompletenessStripProps {
  completeness: CompletenessReport;
  fairComparisonMode: boolean;
  onToggleFairComparison: (enabled: boolean) => void;
  manualExpectations: Record<string, number>;
  onUpdateManualExpectation: (componentId: string, val: number) => void;
  onResetManualExpectations: () => void;
}

export const CompletenessStrip: React.FC<CompletenessStripProps> = ({
  completeness,
  fairComparisonMode,
  onToggleFairComparison,
  manualExpectations,
  onUpdateManualExpectation,
  onResetManualExpectations,
}) => {
  const [showExpectationEditor, setShowExpectationEditor] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
      {/* Top Status Strip */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
            Completeness Detector:
          </span>
          {/* Component status pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {completeness.components.map((c) => {
              const isAll = c.status === 'published_all';
              const isSome = c.status === 'published_some';
              return (
                <span
                  key={c.id}
                  title={`${c.name}: ${c.publishedCount}/${c.totalStudents} students (${c.publishedPct}%)`}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium border ${
                    isAll
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : isSome
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-slate-100 text-slate-400 border-slate-200'
                  }`}
                >
                  <span>{c.name}</span>
                  {isAll && <span className="text-emerald-600 font-bold">✓</span>}
                  {isSome && <span className="text-amber-600 font-bold">~</span>}
                  {!isAll && !isSome && <span className="text-slate-400 font-bold">✗</span>}
                </span>
              );
            })}
          </div>
        </div>

        {/* Fair Comparison Toggle */}
        <div className="flex items-center gap-3 shrink-0">
          <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
            <span className="text-slate-600 font-medium">Fair-Comparison Mode:</span>
            <input
              type="checkbox"
              checked={fairComparisonMode}
              onChange={(e) => onToggleFairComparison(e.target.checked)}
              className="accent-indigo-600 w-4 h-4 rounded cursor-pointer"
            />
            <span
              className={`font-mono font-semibold ${
                fairComparisonMode ? 'text-indigo-600' : 'text-slate-400'
              }`}
            >
              {fairComparisonMode ? 'ON (Default)' : 'OFF'}
            </span>
          </label>

          <button
            onClick={() => setShowExpectationEditor(!showExpectationEditor)}
            className="flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-indigo-600 border border-slate-200 px-2 py-1 rounded-md transition-colors"
          >
            <Sliders className="w-3 h-3" />
            <span>Unpublished Expectations</span>
            {showExpectationEditor ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Fair Comparison Active Description Banner */}
      {fairComparisonMode ? (
        <div className="p-2.5 bg-indigo-50/70 border border-indigo-200 rounded-lg text-xs text-indigo-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>
              <strong>Fair-Comparison Active:</strong> {completeness.fairComparingLabel}. Students are currently ranked only on the results available for all of us.
            </span>
          </div>
          <span className="text-[11px] font-mono text-indigo-700 font-semibold shrink-0">
            {completeness.fairMarksAvailable} / {completeness.totalCourseMarks} marks evaluated
          </span>
        </div>
      ) : (
        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>
            Standard Mode: Ranking by total earned marks including components published for some students.
          </span>
        </div>
      )}

      {/* Unpublished Performance Expectation Overrides Drawer */}
      {showExpectationEditor && (
        <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-slate-900 block">
                Expected Performance for Unpublished Components
              </span>
              <p className="text-[11px] text-slate-500">
                Default: Your own published percentage blended with class average (weight = k / (k+2)). Override manually to test expectations:
              </p>
            </div>
            {Object.keys(manualExpectations).length > 0 && (
              <button
                onClick={onResetManualExpectations}
                className="text-xs text-indigo-600 hover:underline"
              >
                Reset Overrides
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
            {completeness.components
              .filter((c) => c.status !== 'published_all')
              .map((c) => {
                const currentOverride = manualExpectations[c.id];
                return (
                  <div key={c.id} className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-slate-700 truncate">{c.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">max {c.weight}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max={c.weight}
                        step="0.5"
                        placeholder="Blended"
                        value={currentOverride !== undefined ? currentOverride : ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? undefined : Number(e.target.value);
                          if (val !== undefined) {
                            onUpdateManualExpectation(c.id, val);
                          }
                        }}
                        className="w-full px-2 py-1 text-xs font-mono bg-slate-50 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <span className="text-[11px] text-slate-500">pts</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};
