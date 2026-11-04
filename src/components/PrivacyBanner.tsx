import React from 'react';
import { ShieldCheck, Lock, Trash2, EyeOff } from 'lucide-react';

interface PrivacyBannerProps {
  isAnonymized: boolean;
  onToggleAnonymize: () => void;
  onDeleteData: () => void;
  hasData: boolean;
}

export const PrivacyBanner: React.FC<PrivacyBannerProps> = ({
  isAnonymized,
  onToggleAnonymize,
  onDeleteData,
  hasData,
}) => {
  return (
    <div className="bg-slate-100/80 border-b border-slate-200 text-slate-700 px-4 py-2 text-xs">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            <strong>Client-Side Only:</strong> Your marks and CSV files never leave your browser session.
            Please only upload classmates&apos; marks if they have agreed to share them.
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto text-[11px]">
          <button
            onClick={onToggleAnonymize}
            className="flex items-center gap-1 text-slate-600 hover:text-slate-900 underline underline-offset-2"
          >
            <EyeOff className="w-3 h-3" />
            {isAnonymized ? 'Disable Anonymizer' : 'Anonymize Student Names'}
          </button>

          {hasData && (
            <button
              onClick={onDeleteData}
              className="flex items-center gap-1 text-rose-600 hover:text-rose-700 underline underline-offset-2"
            >
              <Trash2 className="w-3 h-3" />
              Delete All My Data
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
