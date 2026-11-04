import React, { useState, useRef, useEffect } from 'react';
import {
  Download,
  Upload,
  Copy,
  Check,
  AlertTriangle,
  HardDrive,
  ShieldCheck,
  FileText,
  X,
  RefreshCw,
  Database,
  ArrowRight,
  Info,
} from 'lucide-react';
import {
  exportAll,
  importAll,
  validateBackupFile,
  BackupValidationPreview,
  requestPersistentStorage,
  isUsingMemoryFallback,
  deleteAllData,
} from '../storage';
import { useFeedback } from './FeedbackSystem';

interface BackupRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataRestored: () => void;
  lastBackupTimestamp?: number;
}

export const BackupRestoreModal: React.FC<BackupRestoreModalProps> = ({
  isOpen,
  onClose,
  onDataRestored,
  lastBackupTimestamp,
}) => {
  const { showToast, showConfirm, showAlert } = useFeedback();
  const [activeTab, setActiveTab] = useState<'backup' | 'restore' | 'storage'>('backup');
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [pastedJson, setPastedJson] = useState('');
  const [preview, setPreview] = useState<BackupValidationPreview | null>(null);
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');
  const [copiedText, setCopiedText] = useState(false);
  const [persistedStatus, setPersistedStatus] = useState<boolean | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted) {
        navigator.storage.persisted().then((p) => setPersistedStatus(p)).catch(() => {});
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const daysSinceBackup = lastBackupTimestamp
    ? Math.floor((Date.now() - lastBackupTimestamp) / (1000 * 60 * 60 * 24))
    : null;

  const handleDownloadBackup = async () => {
    setIsExporting(true);
    try {
      const backupData = await exportAll();
      const jsonString = JSON.stringify(backupData, null, 2);
      const todayStr = new Date().toISOString().split('T')[0];
      const filename = `examinex-backup-${todayStr}.json`;

      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast(`Backup downloaded: ${filename}`, 'success');
    } catch (err: unknown) {
      console.error('Backup download error:', err);
      showAlert(
        'Download Blocked',
        'Direct download was blocked by your browser. Use the "Copy Backup as Text" button below instead.'
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyBackupText = async () => {
    try {
      const backupData = await exportAll();
      const jsonString = JSON.stringify(backupData, null, 2);
      await navigator.clipboard.writeText(jsonString);
      setCopiedText(true);
      showToast('Complete backup JSON copied to clipboard!', 'success');
      setTimeout(() => setCopiedText(false), 3000);
    } catch (err) {
      showAlert('Clipboard Error', 'Could not copy automatically. Please try the download option.');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        const val = validateBackupFile(parsed);
        setPreview(val);
        if (!val.isValid) {
          showAlert('Invalid Backup File', val.error || 'The selected file is not a valid EXAMINEX backup.');
        } else {
          showToast(`File verified: ${val.coursesCount} courses found.`, 'info');
        }
      } catch (parseErr) {
        setPreview(null);
        showAlert('JSON Syntax Error', 'Could not parse the file. Please ensure it is an uncorrupted JSON file.');
      }
    };
    reader.readAsText(file);
  };

  const handleInspectPastedText = () => {
    if (!pastedJson.trim()) return;
    try {
      const parsed = JSON.parse(pastedJson.trim());
      const val = validateBackupFile(parsed);
      setPreview(val);
      if (!val.isValid) {
        showAlert('Invalid Backup Content', val.error || 'Unrecognized backup structure.');
      } else {
        showToast(`Text verified: ${val.coursesCount} courses found.`, 'info');
      }
    } catch (err) {
      showAlert('JSON Syntax Error', 'The pasted text is not valid JSON. Please check and try again.');
    }
  };

  const handleConfirmRestore = async () => {
    if (!preview || !preview.isValid) return;

    showConfirm({
      title: importMode === 'replace' ? 'Replace All Current Data?' : 'Merge with Existing Data?',
      message:
        importMode === 'replace'
          ? 'This will overwrite your current courses and classmates with the contents of this backup file. Are you sure?'
          : 'This will add the backup courses to your library, combining snapshots without duplicates.',
      confirmLabel: importMode === 'replace' ? 'Replace Everything' : 'Merge Data',
      isDestructive: importMode === 'replace',
      onConfirm: async () => {
        setIsImporting(true);
        try {
          let rawData: any = null;
          if (pastedJson.trim()) {
            rawData = JSON.parse(pastedJson.trim());
          } else if (fileInputRef.current?.files?.[0]) {
            const text = await fileInputRef.current.files[0].text();
            rawData = JSON.parse(text);
          }

          if (!rawData) {
            throw new Error('No backup data source available.');
          }

          const res = await importAll(rawData, importMode);
          showToast(`Restored ${res.coursesImported} courses and ${res.snapshotsImported} snapshots!`, 'success');
          onDataRestored();
          onClose();
        } catch (err: unknown) {
          showAlert('Restore Failed', err instanceof Error ? err.message : String(err));
        } finally {
          setIsImporting(false);
        }
      },
    });
  };

  const handleRequestPersist = async () => {
    const res = await requestPersistentStorage();
    setPersistedStatus(res.persisted);
    if (res.persisted) {
      showToast('Persistent storage granted by browser!', 'success');
    } else {
      showAlert(
        'Persistence Not Granted',
        'Your browser denied persistent storage or is running in private browsing. Your data will remain safe as long as browser cache is not manually cleared.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Personal Data & Backup Center</h2>
              <p className="text-[11px] text-slate-500">
                Local-first IndexedDB storage — private to your browser
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 14-day Backup Warning Banner */}
        {daysSinceBackup !== null && daysSinceBackup >= 14 && (
          <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              It has been <strong>{daysSinceBackup} days</strong> since your last backup. Take 5 seconds to download a fresh backup.
            </span>
          </div>
        )}

        {/* Sub-Tabs */}
        <div className="flex border-b border-slate-200 px-5 bg-white text-xs">
          <button
            onClick={() => setActiveTab('backup')}
            className={`py-3 px-3 font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'backup'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Backup to File</span>
          </button>
          <button
            onClick={() => setActiveTab('restore')}
            className={`py-3 px-3 font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'restore'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Restore Data</span>
          </button>
          <button
            onClick={() => setActiveTab('storage')}
            className={`py-3 px-3 font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'storage'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Storage & Privacy</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* TAB 1: BACKUP */}
          {activeTab === 'backup' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-100 text-indigo-950 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  <span>One-Click Full Portable Backup</span>
                </div>
                <p className="text-[11px] text-slate-600">
                  Exports your entire library: assessment schemes, uploaded rosters, custom rolls, manual marks, watchlists, and dated snapshots into a single offline JSON file.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <button
                  onClick={handleDownloadBackup}
                  disabled={isExporting}
                  className="p-4 rounded-xl border border-indigo-200 bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex flex-col items-center justify-center gap-2 shadow-xs transition-colors"
                >
                  <Download className="w-5 h-5" />
                  <span>Download Backup JSON</span>
                  <span className="text-[10px] font-normal text-indigo-100">
                    examinex-backup-{new Date().toISOString().split('T')[0]}.json
                  </span>
                </button>

                <button
                  onClick={handleCopyBackupText}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold flex flex-col items-center justify-center gap-2 transition-colors"
                >
                  {copiedText ? <Check className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5 text-slate-600" />}
                  <span>{copiedText ? 'Copied to Clipboard!' : 'Copy Backup as Text'}</span>
                  <span className="text-[10px] font-normal text-slate-500">
                    Instant fallback if downloads are blocked
                  </span>
                </button>
              </div>

              <div className="pt-2 text-[11px] text-slate-500">
                <p>
                  💡 <strong>Tip:</strong> Keep this file on your Google Drive or USB drive. It contains no passwords or cloud keys, only your marks data.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: RESTORE */}
          {activeTab === 'restore' && (
            <div className="space-y-4">
              <p className="text-slate-600">
                Upload a previously saved <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-700">examinex-backup-*.json</code> file or paste its raw JSON text below.
              </p>

              {/* File upload picker */}
              <div className="p-4 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50/50 flex flex-col items-center justify-center gap-2 text-center">
                <input
                  type="file"
                  accept=".json,application/json"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                  id="backup-file-input"
                />
                <Upload className="w-6 h-6 text-slate-400" />
                <label
                  htmlFor="backup-file-input"
                  className="cursor-pointer font-bold text-indigo-600 hover:text-indigo-800"
                >
                  Choose Backup File
                </label>
                <span className="text-[11px] text-slate-500">
                  {fileInputRef.current?.files?.[0]?.name || 'Supports examinex-backup-*.json'}
                </span>
              </div>

              {/* Alternative: Paste text */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-700">Or paste backup text:</span>
                  {pastedJson && (
                    <button
                      onClick={handleInspectPastedText}
                      className="text-indigo-600 hover:underline font-semibold"
                    >
                      Verify Text
                    </button>
                  )}
                </div>
                <textarea
                  value={pastedJson}
                  onChange={(e) => setPastedJson(e.target.value)}
                  placeholder="Paste JSON content here..."
                  rows={3}
                  className="w-full p-2.5 font-mono text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                />
              </div>

              {/* Validation Preview Card */}
              {preview && (
                <div className={`p-3.5 rounded-xl border ${
                  preview.isValid
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    : 'bg-rose-50 border-rose-200 text-rose-950'
                } space-y-2`}>
                  <div className="font-bold flex items-center justify-between">
                    <span>{preview.isValid ? '✓ Valid Backup Verified' : '✕ Verification Failed'}</span>
                    <span className="text-[10px] opacity-75 font-mono">{preview.exportedAtFormatted}</span>
                  </div>

                  {preview.isValid ? (
                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between">
                        <span>Courses to restore:</span>
                        <strong className="font-mono">{preview.coursesCount}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Students & CSV records:</span>
                        <strong className="font-mono">{preview.studentsCount} students ({preview.csvCount} CSV files)</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Historical snapshots:</span>
                        <strong className="font-mono">{preview.snapshotsCount}</strong>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px]">{preview.error}</p>
                  )}
                </div>
              )}

              {/* Mode Selection */}
              {preview?.isValid && (
                <div className="space-y-2 pt-1">
                  <span className="font-bold text-slate-800 block">Restore Strategy:</span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setImportMode('replace')}
                      className={`p-2.5 rounded-lg border text-left transition-colors ${
                        importMode === 'replace'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-900 font-bold'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      <div>Replace All</div>
                      <div className="text-[10px] font-normal opacity-75 mt-0.5">
                        Clean wipe and replace
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportMode('merge')}
                      className={`p-2.5 rounded-lg border text-left transition-colors ${
                        importMode === 'merge'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-900 font-bold'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      <div>Merge with Existing</div>
                      <div className="text-[10px] font-normal opacity-75 mt-0.5">
                        Keep existing courses
                      </div>
                    </button>
                  </div>

                  <button
                    onClick={handleConfirmRestore}
                    disabled={isImporting}
                    className="w-full mt-2 py-2.5 px-4 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-colors flex items-center justify-center gap-2"
                  >
                    <span>Proceed with Restore</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: STORAGE & PRIVACY */}
          {activeTab === 'storage' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">Storage Engine:</span>
                  <span className="font-mono font-bold text-indigo-600">IndexedDB (idb v8)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Persistence Status:</span>
                  <span className="font-semibold">
                    {persistedStatus === true ? (
                      <span className="text-emerald-700">Persisted ✓ (Protected against eviction)</span>
                    ) : (
                      <span className="text-amber-700">Standard Browser Storage</span>
                    )}
                  </span>
                </div>
                {persistedStatus !== true && (
                  <button
                    onClick={handleRequestPersist}
                    className="w-full mt-1 py-1.5 px-3 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-slate-700 font-semibold text-[11px] transition-colors"
                  >
                    Request Persistent Storage
                  </button>
                )}
              </div>

              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl text-emerald-950 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>100% Private, Device-Only Architecture</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Your grades, classmate names, and university rosters never leave your computer.
                  No central server or third-party cloud database exists. To transfer your data between your phone and laptop, use the <strong>Backup to File</strong> feature on one device and <strong>Restore Data</strong> on the other.
                </p>
              </div>

              {/* Delete Everything Button */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <span className="font-bold text-rose-700 block">Wipe Everything</span>
                  <span className="text-[10px] text-slate-500">Deletes all local IndexedDB courses</span>
                </div>
                <button
                  onClick={() => {
                    showConfirm({
                      title: 'Delete All Local Data?',
                      message: 'This will completely wipe your local IndexedDB storage, removing all courses, uploaded CSVs, and snapshots from this browser. This cannot be undone.',
                      confirmLabel: 'Wipe Everything',
                      isDestructive: true,
                      onConfirm: async () => {
                        await deleteAllData();
                        showToast('All browser data wiped.', 'info');
                        onDataRestored();
                        onClose();
                      },
                    });
                  }}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-700 font-semibold rounded-lg transition-colors"
                >
                  Delete All Data
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
