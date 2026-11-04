import React, { useMemo } from 'react';
import { AssessmentScheme, HeadToHeadReport, StudentRecord } from '../types';
import { calculateHeadToHead } from '../algorithms/comparisonAnalytics';
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
import {
  Users,
  Trophy,
  ArrowRight,
  TrendingUp,
  X,
  Star,
  StarOff,
  Search,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface HeadToHeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  me: StudentRecord;
  selectedOpponent: StudentRecord;
  onSelectOpponent: (student: StudentRecord) => void;
  students: StudentRecord[];
  scheme: AssessmentScheme;
  watchlist: string[]; // rolls or ids
  onToggleWatchlist: (studentRollOrId: string) => void;
  isAnonymized: boolean;
}

export const HeadToHeadModal: React.FC<HeadToHeadModalProps> = ({
  isOpen,
  onClose,
  me,
  selectedOpponent,
  onSelectOpponent,
  students,
  scheme,
  watchlist,
  onToggleWatchlist,
  isAnonymized,
}) => {
  const report: HeadToHeadReport = useMemo(() => {
    return calculateHeadToHead(me, selectedOpponent, students, scheme);
  }, [me, selectedOpponent, students, scheme]);

  // Watchlist students
  const watchlistStudents = useMemo(() => {
    return students.filter((s) => watchlist.includes(s.roll || s.id));
  }, [students, watchlist]);

  // Display Name Helper
  const getDisplayName = (st: StudentRecord) => {
    if (st.isMe) return isAnonymized ? 'Me (Student)' : st.name;
    if (isAnonymized) {
      const idx = students.findIndex((s) => s.id === st.id) + 1;
      return `Student ${idx > 0 ? idx : ''}`;
    }
    return st.name;
  };

  const getDisplayRoll = (st: StudentRecord) => {
    if (st.isMe) return st.roll || 'N/A';
    if (isAnonymized) {
      const idx = students.findIndex((s) => s.id === st.id) + 1;
      return `R-${String(idx).padStart(3, '0')}`;
    }
    return st.roll || 'N/A';
  };

  // CT Line Chart Data
  const ctChartData = useMemo(() => {
    const ctComp = scheme.components.find((c) => c.type === 'best_n_of_m');
    const subs = ctComp?.subComponents || [];

    return subs.map((sub) => {
      const meScore = me.marks[sub.id] ?? null;
      const theirScore = selectedOpponent.marks[sub.id] ?? null;

      const allScores = students
        .map((s) => s.marks[sub.id])
        .filter((v): v is number => v !== null && v !== undefined && !isNaN(v));
      const classAvg =
        allScores.length > 0 ? Number((allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1)) : null;

      return {
        name: sub.name,
        Me: meScore,
        [getDisplayName(selectedOpponent)]: theirScore,
        'Class Average': classAvg,
      };
    });
  }, [scheme, me, selectedOpponent, students, isAnonymized]);

  const opponentKey = selectedOpponent.roll || selectedOpponent.id;
  const isOpponentInWatchlist = watchlist.includes(opponentKey);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-slate-200 max-w-4xl w-full p-6 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-900">
              Head-to-Head Rival Comparison
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Watchlist Bar (Up to 5 students) */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
          <div className="flex items-center gap-2">
            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
            <span className="font-bold text-slate-700">My Watchlist ({watchlist.length}/5):</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {watchlistStudents.length === 0 ? (
                <span className="text-slate-400 text-[11px] italic">
                  No rivals pinned yet. Click &quot;Pin to Watchlist&quot; on any student.
                </span>
              ) : (
                watchlistStudents.map((st) => (
                  <button
                    key={st.id}
                    onClick={() => onSelectOpponent(st)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                      st.id === selectedOpponent.id
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {getDisplayName(st)} ({getDisplayRoll(st)})
                  </button>
                ))
              )}
            </div>
          </div>

          <button
            onClick={() => onToggleWatchlist(opponentKey)}
            className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 hover:text-indigo-600 border border-slate-200 bg-white px-2.5 py-1 rounded-md transition-colors"
          >
            {isOpponentInWatchlist ? (
              <>
                <StarOff className="w-3 h-3 text-rose-500" />
                <span>Remove from Watchlist</span>
              </>
            ) : (
              <>
                <Star className="w-3 h-3 text-amber-500" />
                <span>Pin to Watchlist</span>
              </>
            )}
          </button>
        </div>

        {/* Search / Change Opponent Dropdown */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600 shrink-0">
            Compare Against:
          </label>
          <select
            value={selectedOpponent.id}
            onChange={(e) => {
              const match = students.find((s) => s.id === e.target.value);
              if (match) onSelectOpponent(match);
            }}
            className="flex-1 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {students
              .filter((s) => !s.isMe)
              .map((st) => (
                <option key={st.id} value={st.id}>
                  {getDisplayName(st)} (Roll: {getDisplayRoll(st)})
                </option>
              ))}
          </select>
        </div>

        {/* Head-to-Head Plain English Verdict Card */}
        <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-indigo-950 uppercase tracking-wider font-mono">
              Head-to-Head Verdict & Standings
            </span>
            <span className="text-indigo-700 font-mono">
              Your Rank #{report.myRank} vs Their Rank #{report.theirRank} ({report.studentsBetween} students between you)
            </span>
          </div>
          <p className="text-sm font-medium text-indigo-950 leading-relaxed">
            {report.plainEnglishSummary}
          </p>
        </div>

        {/* Side-by-side Table */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-2.5 px-3">Component</th>
                <th className="py-2.5 px-3 font-mono">Me ({getDisplayName(me)})</th>
                <th className="py-2.5 px-3 font-mono">{getDisplayName(selectedOpponent)}</th>
                <th className="py-2.5 px-3">Lead & Gap</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {report.componentsComparison.map((row) => {
                const iLead = row.whoLeads === 'me';
                const theyLead = row.whoLeads === 'them';
                return (
                  <tr key={row.componentId} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-800">
                      {row.name}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">{row.myScore}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">{row.theirScore}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`font-bold ${
                          iLead
                            ? 'text-emerald-700'
                            : theyLead
                            ? 'text-rose-600'
                            : 'text-slate-500'
                        }`}
                      >
                        {row.gap > 0 ? `+${row.gap} (Me)` : row.gap < 0 ? `${row.gap} (Them)` : 'Tied'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      {iLead && (
                        <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-semibold">
                          You Lead
                        </span>
                      )}
                      {theyLead && (
                        <span className="text-[11px] text-rose-700 bg-rose-50 px-2 py-0.5 rounded font-semibold">
                          They Lead
                        </span>
                      )}
                      {!iLead && !theyLead && (
                        <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          Tied
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {/* Total Summary Row */}
              <tr className="bg-slate-50 font-bold border-t-2 border-slate-300">
                <td className="py-3 px-3 font-sans text-slate-900">Current Sessional Total</td>
                <td className="py-3 px-3 text-indigo-700 text-sm">{report.myTotal}</td>
                <td className="py-3 px-3 text-slate-800 text-sm">{report.theirTotal}</td>
                <td className="py-3 px-3">
                  <span
                    className={`text-sm ${
                      report.overallGap > 0
                        ? 'text-emerald-700'
                        : report.overallGap < 0
                        ? 'text-rose-600'
                        : 'text-slate-600'
                    }`}
                  >
                    {report.overallGap > 0
                      ? `+${report.overallGap} (Me)`
                      : report.overallGap < 0
                      ? `${report.overallGap} (Them)`
                      : 'Tied'}
                  </span>
                </td>
                <td className="py-3 px-3 font-sans">
                  {report.whoIsAhead === 'me'
                    ? 'You are Ahead'
                    : report.whoIsAhead === 'them'
                    ? 'They are Ahead'
                    : 'Tied'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Overtake Projections Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-1 text-xs">
            <span className="font-bold text-emerald-900 block">
              Can I Overtake Them?
            </span>
            <p className="text-emerald-800 text-[11px]">{report.canIOvertakeThem.summary}</p>
          </div>

          <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-xl space-y-1 text-xs">
            <span className="font-bold text-amber-900 block">
              Can They Overtake Me?
            </span>
            <p className="text-amber-800 text-[11px]">{report.canTheyOvertakeMe.summary}</p>
          </div>
        </div>

        {/* CT Line Chart */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <span className="text-xs font-bold text-slate-800 block">
            Class Test Comparison Trajectory
          </span>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ctChartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#64748B" />
                <YAxis domain={[0, 20]} tick={{ fontSize: 10 }} stroke="#64748B" />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Line type="monotone" dataKey="Me" stroke="#4F46E5" strokeWidth={2.5} connectNulls />
                <Line
                  type="monotone"
                  dataKey={getDisplayName(selectedOpponent)}
                  stroke="#DC2626"
                  strokeWidth={2.5}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="Class Average"
                  stroke="#94A3B8"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
