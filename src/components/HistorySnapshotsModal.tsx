import React from 'react';
import { CourseHistorySnapshot, WhatChangedReport } from '../types';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { History, TrendingUp, TrendingDown, ArrowRight, X, Calendar, CheckCircle2 } from 'lucide-react';

interface HistorySnapshotsModalProps {
  isOpen: boolean;
  onClose: () => void;
  snapshots: CourseHistorySnapshot[];
  whatChanged: WhatChangedReport | null;
}

export const HistorySnapshotsModal: React.FC<HistorySnapshotsModalProps> = ({
  isOpen,
  onClose,
  snapshots,
  whatChanged,
}) => {
  if (!isOpen) return null;

  const chartData = snapshots.map((s, idx) => ({
    name: s.dateFormatted.split(',')[0] || `Upload #${idx + 1}`,
    Rank: s.myRank,
    'Needed in Final': s.neededFinalAPlus,
  }));

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-slate-200 max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-900">
              CSV History & Snapshot Progress
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* "What Changed" Card */}
        {whatChanged && whatChanged.previousSnapshot && (
          <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-3 text-xs">
            <div className="flex items-center justify-between font-bold text-indigo-950">
              <span className="uppercase tracking-wider font-mono">
                What Changed Since Last Upload
              </span>
              <span className="font-mono text-slate-500">
                {whatChanged.previousSnapshot.dateFormatted}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 bg-white rounded-lg border border-indigo-100 text-center">
                <span className="text-[10px] text-slate-500 block">Rank Shift</span>
                <span className={`text-base font-bold font-mono ${
                  whatChanged.rankDelta > 0
                    ? 'text-emerald-700'
                    : whatChanged.rankDelta < 0
                    ? 'text-rose-600'
                    : 'text-slate-700'
                }`}>
                  {whatChanged.rankDelta > 0
                    ? `+${whatChanged.rankDelta} Ranks`
                    : whatChanged.rankDelta < 0
                    ? `${whatChanged.rankDelta} Ranks`
                    : 'No Change'}
                </span>
              </div>

              <div className="p-2.5 bg-white rounded-lg border border-indigo-100 text-center">
                <span className="text-[10px] text-slate-500 block">Sessional Marks</span>
                <span className="text-base font-bold font-mono text-indigo-700">
                  {whatChanged.sessionalDelta >= 0
                    ? `+${whatChanged.sessionalDelta}`
                    : whatChanged.sessionalDelta}{' '}
                  pts
                </span>
              </div>

              <div className="p-2.5 bg-white rounded-lg border border-indigo-100 text-center">
                <span className="text-[10px] text-slate-500 block">Newly Filled Marks</span>
                <span className="text-base font-bold font-mono text-slate-900">
                  {whatChanged.newlyFilledCellsCount} cells
                </span>
              </div>
            </div>

            {whatChanged.rivalsMoved.length > 0 && (
              <div className="space-y-1 pt-1">
                <span className="font-semibold text-indigo-950 block">Rivals who moved:</span>
                <div className="space-y-1">
                  {whatChanged.rivalsMoved.map((r, i) => (
                    <div key={i} className="flex justify-between text-[11px] bg-white px-2 py-1 rounded border border-indigo-100">
                      <span>{r.name} (Roll: {r.roll})</span>
                      <span className="font-mono font-semibold">
                        Rank #{r.prevRank} → #{r.newRank} ({r.rankDelta > 0 ? `+${r.rankDelta}` : r.rankDelta})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Snapshot Chart Over Time */}
        {snapshots.length >= 2 && (
          <div className="space-y-2 pt-1">
            <span className="text-xs font-bold text-slate-800 block">
              Rank & A+ Requirement Trend Across Uploads
            </span>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#64748B" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#64748B" />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Line type="monotone" dataKey="Rank" stroke="#4F46E5" strokeWidth={2} />
                  <Line type="monotone" dataKey="Needed in Final" stroke="#059669" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Historical Snapshots List */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <span className="text-xs font-bold text-slate-800 block">
            Saved History Snapshots ({snapshots.length})
          </span>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {snapshots.map((snap) => (
              <div
                key={snap.id}
                className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-semibold text-slate-900 block">{snap.filename}</span>
                  <span className="text-[11px] text-slate-500 font-mono">{snap.dateFormatted}</span>
                </div>
                <div className="text-right font-mono text-xs">
                  <div>Rank <strong className="text-indigo-700">#{snap.myRank}</strong> · Sessional: {snap.mySessional}</div>
                  <div className="text-[11px] text-slate-500">Needed Final: {snap.neededFinalAPlus} pts</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
