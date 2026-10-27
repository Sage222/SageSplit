import React from 'react';
import { AuditLogEntry } from '../types';

interface AuditLogsViewProps {
  logs: AuditLogEntry[];
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

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({ logs }) => {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Activity Log</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Full history of additions, edits, and changes with date and time.
        </p>
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
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono tabular-nums">
                    <span>{dt.datePart}</span>
                    <span>{dt.timePart}</span>
                    <span>·</span>
                    <span className="font-sans text-slate-700">{log.actorName}</span>
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
