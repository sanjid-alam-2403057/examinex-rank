import React from 'react';
import {
  Shield,
  Eye,
  EyeOff,
  RotateCcw,
  Play,
  CheckCircle2,
  Users,
  Target,
  Sliders,
  FileSpreadsheet,
  CheckSquare,
  Database,
  CloudOff,
  Check,
  Loader2,
  AlertCircle,
} from 'lucide-react';

export type NavTab = 'comparison' | 'calculator' | 'scheme' | 'upload' | 'tests';

interface HeaderProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  isDemoMode: boolean;
  onToggleDemoMode: () => void;
  isAnonymized: boolean;
  onToggleAnonymize: () => void;
  onResetData: () => void;
  hasData: boolean;
  meStudentName?: string;
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error';
  saveStatusMessage?: string;
  onOpenBackup: () => void;
  daysSinceBackup?: number | null;
  isStorageBlocked?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  isDemoMode,
  onToggleDemoMode,
  isAnonymized,
  onToggleAnonymize,
  onResetData,
  hasData,
  meStudentName,
  saveStatus = 'saved',
  saveStatusMessage = 'Saved ✓',
  onOpenBackup,
  daysSinceBackup,
  isStorageBlocked,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-4 sm:px-6 py-2.5 transition-colors">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Zone 1: Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm tracking-wider shadow-sm">
            ER
          </div>
          <div className="flex flex-col">
            <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
              EXAMINEX RANK
            </span>
            <span className="text-[10px] text-slate-500 font-medium hidden sm:inline">
              Personal Offline Grade & Rank Analyzer
            </span>
          </div>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-1 overflow-x-auto py-1 scrollbar-none">
          <button
            onClick={() => setActiveTab('comparison')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap transition-colors ${
              activeTab === 'comparison'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Class Comparison</span>
          </button>

          <button
            onClick={() => setActiveTab('calculator')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              activeTab === 'calculator'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            <span>A+ Target</span>
          </button>

          <button
            onClick={() => setActiveTab('scheme')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              activeTab === 'scheme'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Scheme</span>
          </button>

          <button
            onClick={() => setActiveTab('upload')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              activeTab === 'upload'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>CSV Data</span>
          </button>

          <button
            onClick={() => setActiveTab('tests')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              activeTab === 'tests'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>Tests</span>
          </button>
        </nav>

        {/* Zone 3: Storage & Quick Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Auto-save Status Label */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono border border-slate-200 bg-slate-50">
            {saveStatus === 'saving' && (
              <>
                <Loader2 className="w-3 h-3 text-indigo-600 animate-spin" />
                <span className="text-slate-600">Saving...</span>
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <Check className="w-3 h-3 text-emerald-600" />
                <span className="text-slate-600">{saveStatusMessage}</span>
              </>
            )}
            {saveStatus === 'error' && (
              <>
                <AlertCircle className="w-3 h-3 text-rose-600" />
                <span className="text-rose-700 font-semibold">{saveStatusMessage}</span>
              </>
            )}
            {isStorageBlocked && (
              <span className="text-amber-700 font-bold flex items-center gap-1">
                <CloudOff className="w-3 h-3" />
                Memory Mode
              </span>
            )}
          </div>

          {/* Backup & Restore Button with 14-day alert dot */}
          <button
            onClick={onOpenBackup}
            title="Backup and Restore your browser data"
            className="relative flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition-colors"
          >
            <Database className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden lg:inline">Backup</span>
            {daysSinceBackup !== null && daysSinceBackup !== undefined && daysSinceBackup >= 14 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse" />
            )}
          </button>

          {/* Anonymize Toggle (ON by default) */}
          <button
            onClick={onToggleAnonymize}
            title={isAnonymized ? 'Display original student names' : 'Anonymize names into Student 1, Student 2'}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              isAnonymized
                ? 'bg-amber-50 text-amber-800 border-amber-300'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {isAnonymized ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span className="hidden md:inline">{isAnonymized ? 'Anonymized' : 'Names Visible'}</span>
          </button>

          {/* Demo Mode Toggle */}
          <button
            onClick={onToggleDemoMode}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
              isDemoMode
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100'
            }`}
          >
            {isDemoMode ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Demo Active</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Load Demo</span>
              </>
            )}
          </button>

          {/* Reset / Delete All Data */}
          {hasData && (
            <button
              onClick={onResetData}
              title="Delete all loaded data and reset session"
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
