import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { AuditLogEntry } from '../types';

interface AuditLogsViewProps {
  logs: AuditLogEntry[];
  isAdmin: boolean;
  onDeleteLog: (id: string) => Promise<void>;
  onClearAllLogs: () => Promise<void>;
}

export function formatExactDateTime(isoString: string): {
  datePart: string;
  timePart: string;
} {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) {
    return { datePart: isoString, timePart: '' };
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return {
    datePart: `${year}-${month}-${day}`,
    timePart: `${hours}:${minutes}:${seconds}`,
  };
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({
  logs,
  isAdmin,
  onDeleteLog,
  onClearAllLogs,
}) => {
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="border-b border-slate-200 px-5 py-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Activity Log</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Full history of additions, edits, and changes with date and time.
          </p>
        </div>

        {isAdmin && logs.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            {confirmClearAll ? (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    await onClearAllLogs();
                    setConfirmClearAll(false);
                  }}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 whitespace-nowrap"
                >
                  Confirm Clear All
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(false)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 whitespace-nowrap"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClearAll(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear All Logs</span>
              </button>
            )}
          </div>
        )}
      </div>

      {logs.length === 0 ? (
        <div className="p-10 text-center text-xs text-slate-500">
          No activity logged yet.
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {logs.map((log) => {
            const dt = formatExactDateTime(log.timestamp);
            return (
              <div key={log.id} className="p-4 space-y-2 hover:bg-slate-50/60">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-900">{log.summary}</span>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono tabular-nums">
                      <span>{dt.datePart}</span>
                      <span>{dt.timePart}</span>
                      <span>·</span>
                      <span className="font-sans text-slate-700">{log.actorName}</span>
                    </div>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => onDeleteLog(log.id)}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                        title="Delete log entry"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {log.changes.length > 0 && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs font-mono tabular-nums space-y-1">
                    {log.changes.map((c, idx) => (
                      <div key={idx} className="flex flex-wrap items-center gap-2 text-slate-600">
                        <span className="font-sans font-medium text-slate-700">{c.field}:</span>
                        {c.before !== '—' && (
                          <>
                            <span className="text-slate-400 line-through">{c.before}</span>
                            <span>→</span>
                          </>
                        )}
                        <span className="text-slate-900 font-medium">{c.after}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
