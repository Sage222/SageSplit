import React, { useState, useMemo } from 'react';
import { Search, RotateCcw, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { AuditLogEntry, UserAccount, AuditActionType } from '../types';

interface AuditLogsViewProps {
  logs: AuditLogEntry[];
  users: UserAccount[];
  onRestoreSnapshot: (logId: string) => Promise<void>;
}

type LogCategoryFilter = 'all' | 'edits' | 'creations' | 'deletions' | 'users';

export function formatExactDateTime(isoString: string): {
  datePart: string;
  timePart: string;
  fullFormatted: string;
} {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) {
    return { datePart: isoString, timePart: '', fullFormatted: isoString };
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  const datePart = `${year}-${month}-${day}`;
  const timePart = `${hours}:${minutes}:${seconds}`;
  return {
    datePart,
    timePart,
    fullFormatted: `${datePart} ${timePart}`,
  };
}

function getActionLabel(action: AuditActionType): { text: string; toneClass: string } {
  switch (action) {
    case 'EXPENSE_CREATED':
      return { text: 'Expense Created', toneClass: 'text-emerald-700 font-medium' };
    case 'SETTLEMENT_RECORDED':
      return { text: 'Settlement Recorded', toneClass: 'text-emerald-700 font-medium' };
    case 'EXPENSE_EDITED':
      return { text: 'Expense Edited', toneClass: 'text-amber-700 font-medium' };
    case 'EXPENSE_DELETED':
      return { text: 'Expense Deleted', toneClass: 'text-red-700 font-medium' };
    case 'EXPENSE_RESTORED':
      return { text: 'Snapshot Restored', toneClass: 'text-slate-900 font-medium' };
    case 'USER_CREATED':
      return { text: 'Account Created', toneClass: 'text-slate-800 font-medium' };
    case 'USER_UPDATED':
      return { text: 'Account Updated', toneClass: 'text-slate-800 font-medium' };
    case 'PASSWORD_UPDATED':
      return { text: 'Password Updated', toneClass: 'text-amber-700 font-medium' };
    case 'USER_DELETED':
      return { text: 'Account Removed', toneClass: 'text-red-700 font-medium' };
    case 'SETTINGS_UPDATED':
      return { text: 'Settings Updated', toneClass: 'text-slate-700 font-medium' };
    default:
      return { text: action, toneClass: 'text-slate-700' };
  }
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({
  logs,
  users,
  onRestoreSnapshot,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<LogCategoryFilter>('all');
  const [actorFilter, setActorFilter] = useState<string>('all');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const filteredLogs = useMemo(() => {
    return logs.filter((entry) => {
      if (actorFilter !== 'all' && entry.actorUserId !== actorFilter) {
        return false;
      }

      if (categoryFilter === 'edits' && entry.action !== 'EXPENSE_EDITED') {
        return false;
      }
      if (
        categoryFilter === 'creations' &&
        entry.action !== 'EXPENSE_CREATED' &&
        entry.action !== 'SETTLEMENT_RECORDED'
      ) {
        return false;
      }
      if (
        categoryFilter === 'deletions' &&
        entry.action !== 'EXPENSE_DELETED' &&
        entry.action !== 'EXPENSE_RESTORED'
      ) {
        return false;
      }
      if (
        categoryFilter === 'users' &&
        !['USER_CREATED', 'USER_UPDATED', 'PASSWORD_UPDATED', 'USER_DELETED', 'SETTINGS_UPDATED'].includes(
          entry.action
        )
      ) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesSummary = entry.summary.toLowerCase().includes(q);
        const matchesTarget = entry.targetTitle.toLowerCase().includes(q);
        const matchesActor =
          entry.actorName.toLowerCase().includes(q) ||
          entry.actorUsername.toLowerCase().includes(q);
        const matchesChanges = entry.changes.some(
          (c) =>
            c.field.toLowerCase().includes(q) ||
            c.before.toLowerCase().includes(q) ||
            c.after.toLowerCase().includes(q)
        );
        return matchesSummary || matchesTarget || matchesActor || matchesChanges;
      }

      return true;
    });
  }, [logs, actorFilter, categoryFilter, searchQuery]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({
      ...prev,
      [id]: prev[id] === undefined ? false : !prev[id],
    }));
  };

  const handleRestore = async (logId: string) => {
    setRestoringId(logId);
    try {
      await onRestoreSnapshot(logId);
    } finally {
      setRestoringId(null);
    }
  };

  const handleExportCsv = () => {
    const headers = ['Timestamp (ISO)', 'Date', 'Time', 'Actor Name', 'Username', 'Action', 'Target', 'Summary', 'Field Diffs'];
    const rows = filteredLogs.map((l) => {
      const dt = formatExactDateTime(l.timestamp);
      const diffStr = l.changes.map((c) => `${c.field}: ${c.before} -> ${c.after}`).join(' | ');
      return [
        l.timestamp,
        dt.datePart,
        dt.timePart,
        `"${l.actorName.replace(/"/g, '""')}"`,
        l.actorUsername,
        l.action,
        `"${l.targetTitle.replace(/"/g, '""')}"`,
        `"${l.summary.replace(/"/g, '""')}"`,
        `"${diffStr.replace(/"/g, '""')}"`,
      ].join(',');
    });
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sagesplit-audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Immutable Timestamped Audit Log
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Every expense creation, modification, balance settlement, and credential update is
              recorded with date, time down to the second, and field-level before/after snapshots.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV ({filteredLogs.length})</span>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="mt-4 pt-4 border-t border-slate-200 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* Interactive Segmented Filter */}
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                { id: 'all', label: 'All Events' },
                { id: 'edits', label: 'Edits & Diffs' },
                { id: 'creations', label: 'New & Settlements' },
                { id: 'deletions', label: 'Deletions & Restores' },
                { id: 'users', label: 'Admin & Accounts' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategoryFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  categoryFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <select
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 focus:border-slate-900 focus:outline-none"
            >
              <option value="all">All Users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName} (@{u.username})
                </option>
              ))}
            </select>

            <div className="relative min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search logs, amounts, fields..."
                className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Audit Log Table / Stream */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-900">No matching audit log entries</p>
            <p className="text-xs text-slate-500 mt-1">
              Try clearing your search query or switching the event filter above.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredLogs.map((log) => {
              const dt = formatExactDateTime(log.timestamp);
              const actionMeta = getActionLabel(log.action);
              // Default to expanded for edited entries so field diffs are immediately scannable
              const isExpanded =
                expandedIds[log.id] !== undefined
                  ? expandedIds[log.id]
                  : log.action === 'EXPENSE_EDITED' || log.changes.length > 0;

              return (
                <div key={log.id} className="p-5 hover:bg-slate-50/60 transition-colors">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1 min-w-0">
                      {/* Clean unboxed metadata row with typographic separators */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span className="font-mono tabular-nums font-medium text-slate-800">
                          {dt.datePart}
                        </span>
                        <span className="font-mono tabular-nums text-slate-600">
                          {dt.timePart}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className={actionMeta.toneClass}>{actionMeta.text}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-700 font-medium">{log.actorName}</span>
                        <span className="font-mono text-slate-500">@{log.actorUsername}</span>
                      </div>

                      <p className="text-sm font-medium text-slate-900">{log.summary}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {log.snapshotBefore && (
                        <button
                          type="button"
                          disabled={restoringId === log.id}
                          onClick={() => handleRestore(log.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                          title="Revert this entry to the state before this change"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>
                            {restoringId === log.id
                              ? 'Restoring...'
                              : log.action === 'EXPENSE_DELETED'
                              ? 'Restore Deleted Expense'
                              : 'Revert to Previous'}
                          </span>
                        </button>
                      )}

                      {log.changes.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(log.id)}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
                        >
                          <span>{isExpanded ? 'Hide Diff' : `View Diff (${log.changes.length})`}</span>
                          {isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Field-Level Diff Table */}
                  {isExpanded && log.changes.length > 0 && (
                    <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50/70">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500">
                            <th className="py-2 px-3 font-medium w-40">Field</th>
                            <th className="py-2 px-3 font-medium">Previous Value</th>
                            <th className="py-2 px-3 font-medium">Updated Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/70 font-mono tabular-nums">
                          {log.changes.map((change, idx) => (
                            <tr key={idx}>
                              <td className="py-2 px-3 font-sans font-medium text-slate-700">
                                {change.field}
                              </td>
                              <td className="py-2 px-3 text-slate-500">{change.before}</td>
                              <td className="py-2 px-3 text-slate-900 font-medium">
                                {change.after}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
