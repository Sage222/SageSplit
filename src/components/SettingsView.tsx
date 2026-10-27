import React, { useState } from 'react';
import {
  UserPlus,
  KeyRound,
  Eye,
  EyeOff,
  Trash2,
  Edit3,
  Check,
  X,
  Download,
  RotateCcw,
  Copy,
  Server,
  AlertCircle,
  LogIn,
} from 'lucide-react';
import {
  UserAccount,
  UserRole,
  WorkspaceSettings,
  SplitMode,
  UserBalanceSummary,
  ExpenseEntry,
  AuditLogEntry,
} from '../types';

interface SettingsViewProps {
  users: UserAccount[];
  currentUser: UserAccount;
  settings: WorkspaceSettings;
  balances: Record<string, UserBalanceSummary>;
  expenses: ExpenseEntry[];
  logs: AuditLogEntry[];
  onCreateUser: (payload: {
    displayName: string;
    username: string;
    password: string;
    role: UserRole;
    avatarColor: string;
  }) => Promise<void>;
  onUpdateUser: (
    id: string,
    payload: {
      displayName?: string;
      username?: string;
      password?: string;
      role?: UserRole;
      avatarColor?: string;
    }
  ) => Promise<void>;
  onDeleteUser: (id: string) => Promise<void>;
  onUpdateSettings: (payload: Partial<WorkspaceSettings>) => Promise<void>;
  onSwitchUserDirect: (user: UserAccount) => void;
  onResetDemoData: () => Promise<void>;
}

const AVATAR_COLORS = [
  '#0F172A',
  '#0369A1',
  '#047857',
  '#B45309',
  '#7C3AED',
  '#BE123C',
  '#374151',
];

const CURRENCY_OPTIONS = [
  { code: 'USD', symbol: '$', label: 'US Dollar (USD $)' },
  { code: 'EUR', symbol: '€', label: 'Euro (EUR €)' },
  { code: 'GBP', symbol: '£', label: 'British Pound (GBP £)' },
  { code: 'CAD', symbol: 'CA$', label: 'Canadian Dollar (CAD CA$)' },
  { code: 'AUD', symbol: 'A$', label: 'Australian Dollar (AUD A$)' },
];

const DOCKER_COMPOSE_SNIPPET = `services:
  sagesplit:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: sagesplit
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATA_DIR=/app/data
    volumes:
      - sagesplit_data:/app/data

volumes:
  sagesplit_data:
    driver: local`;

export const SettingsView: React.FC<SettingsViewProps> = ({
  users,
  currentUser,
  settings,
  balances,
  expenses,
  logs,
  onCreateUser,
  onUpdateUser,
  onDeleteUser,
  onUpdateSettings,
  onSwitchUserDirect,
  onResetDemoData,
}) => {
  const isAdmin = currentUser.role === 'admin';

  // New user form state
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('member');
  const [newColor, setNewColor] = useState(AVATAR_COLORS[1]);
  const [userFormError, setUserFormError] = useState<string | null>(null);
  const [userFormSuccess, setUserFormSuccess] = useState<string | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);

  // Password visibility map & inline edit state
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('member');
  const [savingEditUser, setSavingEditUser] = useState(false);

  // Workspace Settings Form
  const [workspaceName, setWorkspaceName] = useState(settings.workspaceName);
  const [currencyCode, setCurrencyCode] = useState(settings.currencyCode);
  const [defaultSplitMode, setDefaultSplitMode] = useState<SplitMode>(settings.defaultSplitMode);
  const [allowMembersToEditAll, setAllowMembersToEditAll] = useState(
    settings.allowMembersToEditAll
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSavedMsg, setSettingsSavedMsg] = useState<string | null>(null);
  const [copiedCompose, setCopiedCompose] = useState(false);

  const togglePasswordVisibility = (userId: string) => {
    setVisiblePasswords((prev) => ({ ...prev, [userId]: !prev[userId] }));
  };

  const startEditingUser = (u: UserAccount) => {
    setEditingUserId(u.id);
    setEditDisplayName(u.displayName);
    setEditUsername(u.username);
    setEditPassword(u.password || '');
    setEditRole(u.role);
    setUserFormError(null);
  };

  const handleSaveUserEdit = async (userId: string) => {
    setUserFormError(null);
    setSavingEditUser(true);
    try {
      await onUpdateUser(userId, {
        displayName: editDisplayName,
        username: editUsername,
        password: editPassword,
        role: editRole,
      });
      setEditingUserId(null);
      setUserFormSuccess('Updated user credentials and logged audit event.');
      setTimeout(() => setUserFormSuccess(null), 3500);
    } catch (err: any) {
      setUserFormError(err?.message || 'Failed to update user account.');
    } finally {
      setSavingEditUser(false);
    }
  };

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserFormError(null);
    setUserFormSuccess(null);
    setCreatingUser(true);

    try {
      await onCreateUser({
        displayName: newDisplayName,
        username: newUsername,
        password: newPassword,
        role: newRole,
        avatarColor: newColor,
      });
      setNewDisplayName('');
      setNewUsername('');
      setNewPassword('');
      setNewRole('member');
      setUserFormSuccess(`Created account @${newUsername.toLowerCase()} with password authentication.`);
      setTimeout(() => setUserFormSuccess(null), 4000);
    } catch (err: any) {
      setUserFormError(err?.message || 'Failed to create user.');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleDeleteUserClick = async (u: UserAccount) => {
    setUserFormError(null);
    try {
      await onDeleteUser(u.id);
    } catch (err: any) {
      setUserFormError(err?.message || 'Failed to remove user.');
    }
  };

  const handleSaveWorkspaceSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsSavedMsg(null);
    try {
      const selectedCurrency =
        CURRENCY_OPTIONS.find((c) => c.code === currencyCode) || CURRENCY_OPTIONS[0];
      await onUpdateSettings({
        workspaceName,
        currencyCode: selectedCurrency.code,
        currencySymbol: selectedCurrency.symbol,
        defaultSplitMode,
        allowMembersToEditAll,
      });
      setSettingsSavedMsg('Workspace preferences saved.');
      setTimeout(() => setSettingsSavedMsg(null), 3000);
    } catch (err: any) {
      setUserFormError(err?.message || 'Failed to update settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleExportDatabaseJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      settings,
      users,
      expenses,
      logs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sagesplit-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyCompose = () => {
    navigator.clipboard.writeText(DOCKER_COMPOSE_SNIPPET);
    setCopiedCompose(true);
    setTimeout(() => setCopiedCompose(false), 2500);
  };

  const adminUser = users.find((u) => u.role === 'admin') || users[0];

  return (
    <div className="space-y-8">
      {/* Non-Admin Notice Banner */}
      {!isAdmin && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-amber-900">
              Signed in as Member (@{currentUser.username})
            </h3>
            <p className="text-xs text-amber-800">
              Creating new user accounts, resetting member passwords, and changing workspace
              settings require an Admin account.
            </p>
          </div>
          {adminUser && (
            <button
              type="button"
              onClick={() => onSwitchUserDirect(adminUser)}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Switch to Admin (@{adminUser.username})</span>
            </button>
          )}
        </div>
      )}

      {/* Section 1: Admin User & Password Credentials Management */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              01. User Accounts & Password Setup (Admin Directory)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Provision usernames and passwords for group participants, update credentials, or switch
              active sessions.
            </p>
          </div>
          <div className="text-xs text-slate-500 font-mono tabular-nums">
            {users.length} active accounts · {users.filter((u) => u.role === 'admin').length} admin
          </div>
        </div>

        <div className="p-6 space-y-6">
          {userFormError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{userFormError}</span>
            </div>
          )}

          {userFormSuccess && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
              <Check className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{userFormSuccess}</span>
            </div>
          )}

          {/* Existing Users Table */}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-3 px-4">Member Name</th>
                  <th className="py-3 px-4">Username</th>
                  <th className="py-3 px-4">Password</th>
                  <th className="py-3 px-4">Account Role</th>
                  <th className="py-3 px-4 text-right">Net Balance</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {users.map((u) => {
                  const isEditing = editingUserId === u.id;
                  const showPw = Boolean(visiblePasswords[u.id]);
                  const bal = balances[u.id]?.netBalance || 0;
                  const isCurrent = u.id === currentUser.id;

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Display Name */}
                      <td className="py-3 px-4">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editDisplayName}
                            onChange={(e) => setEditDisplayName(e.target.value)}
                            className="w-full max-w-[160px] rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                          />
                        ) : (
                          <div className="flex items-center gap-2.5">
                            <span
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                              style={{ backgroundColor: u.avatarColor }}
                            >
                              {u.displayName.charAt(0).toUpperCase()}
                            </span>
                            <div>
                              <span className="font-medium text-slate-900">{u.displayName}</span>
                              {isCurrent && (
                                <span className="ml-2 text-xs text-slate-500">· You</span>
                              )}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Username */}
                      <td className="py-3 px-4 font-mono text-xs text-slate-700">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editUsername}
                            onChange={(e) => setEditUsername(e.target.value)}
                            className="w-full max-w-[130px] rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-mono text-slate-900 focus:border-slate-900 focus:outline-none"
                          />
                        ) : (
                          <span>@{u.username}</span>
                        )}
                      </td>

                      {/* Password */}
                      <td className="py-3 px-4 font-mono text-xs">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            placeholder="New password"
                            className="w-full max-w-[140px] rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-mono text-slate-900 focus:border-slate-900 focus:outline-none"
                          />
                        ) : isAdmin || isCurrent ? (
                          <div className="inline-flex items-center gap-2">
                            <span className="text-slate-800">
                              {showPw ? u.password : '••••••••'}
                            </span>
                            <button
                              type="button"
                              onClick={() => togglePasswordVisibility(u.id)}
                              className="text-slate-400 hover:text-slate-700 transition-colors"
                              title={showPw ? 'Hide password' : 'Show password'}
                            >
                              {showPw ? (
                                <EyeOff className="h-3.5 w-3.5" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400">Admin restricted</span>
                        )}
                      </td>

                      {/* Role */}
                      <td className="py-3 px-4 text-xs">
                        {isEditing ? (
                          <select
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value as UserRole)}
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                          >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                          </select>
                        ) : (
                          <span
                            className={
                              u.role === 'admin'
                                ? 'font-semibold text-slate-900'
                                : 'text-slate-600'
                            }
                          >
                            {u.role === 'admin' ? 'Admin' : 'Member'}
                          </span>
                        )}
                      </td>

                      {/* Net Balance */}
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                        <span
                          className={
                            bal > 0.009
                              ? 'text-emerald-700 font-medium'
                              : bal < -0.009
                              ? 'text-red-700 font-medium'
                              : 'text-slate-500'
                          }
                        >
                          {bal > 0.009 ? '+' : bal < -0.009 ? '-' : ''}
                          {settings.currencySymbol}
                          {Math.abs(bal).toFixed(2)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                disabled={savingEditUser}
                                onClick={() => handleSaveUserEdit(u.id)}
                                className="inline-flex items-center gap-1 rounded bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
                              >
                                <Check className="h-3 w-3" />
                                <span>Save</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingUserId(null)}
                                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 whitespace-nowrap shrink-0"
                              >
                                <X className="h-3 w-3" />
                                <span>Cancel</span>
                              </button>
                            </>
                          ) : (
                            <>
                              {!isCurrent && (
                                <button
                                  type="button"
                                  onClick={() => onSwitchUserDirect(u)}
                                  className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
                                  title={`Sign in as ${u.displayName}`}
                                >
                                  Use Account
                                </button>
                              )}
                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => startEditingUser(u)}
                                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
                                >
                                  <Edit3 className="h-3 w-3" />
                                  <span>Edit</span>
                                </button>
                              )}
                              {isAdmin && users.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUserClick(u)}
                                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                  title="Remove user account"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Admin Form: Add New User with Username & Password */}
          {isAdmin && (
            <form
              onSubmit={handleCreateUserSubmit}
              className="rounded-lg border border-slate-200 bg-slate-50/70 p-5 space-y-4"
            >
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-slate-800" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Add New Member Account & Credentials
                </h3>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Full / Display Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    placeholder="e.g., Elena Rostova"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="e.g., elena"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Initial Password
                  </label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Set login password"
                      className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-2 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Access Role
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                  >
                    <option value="member">Member (Standard)</option>
                    <option value="admin">Admin (Full Control)</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={creatingUser}
                    className="w-full rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                  >
                    {creatingUser ? 'Creating...' : 'Create User Account'}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-slate-500">Avatar Accent:</span>
                {AVATAR_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewColor(color)}
                    className={`h-5 w-5 rounded-full transition-transform ${
                      newColor === color ? 'ring-2 ring-slate-900 ring-offset-2 scale-110' : ''
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`Select color ${color}`}
                  />
                ))}
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Section 2: Workspace & Ledger Configuration */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form
          onSubmit={handleSaveWorkspaceSettings}
          className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col justify-between space-y-5"
        >
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                02. Ledger & Permission Preferences
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure shared group title, currency formatting, default split method, and edit
                policies.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Group / Household Name
              </label>
              <input
                type="text"
                disabled={!isAdmin}
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 disabled:bg-slate-100 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Ledger Currency
                </label>
                <select
                  disabled={!isAdmin}
                  value={currencyCode}
                  onChange={(e) => setCurrencyCode(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100 focus:border-slate-900 focus:outline-none"
                >
                  {CURRENCY_OPTIONS.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Default Split Calculation
                </label>
                <select
                  disabled={!isAdmin}
                  value={defaultSplitMode}
                  onChange={(e) => setDefaultSplitMode(e.target.value as SplitMode)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100 focus:border-slate-900 focus:outline-none"
                >
                  <option value="equal">Equal Split</option>
                  <option value="exact">Exact Amounts</option>
                  <option value="percentage">Percentage Split (%)</option>
                  <option value="shares">Share Weights</option>
                </select>
              </div>
            </div>

            <div className="pt-1">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={allowMembersToEditAll}
                  onChange={(e) => setAllowMembersToEditAll(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                />
                <div>
                  <span className="block text-xs font-medium text-slate-900">
                    Allow all authenticated members to edit any shared expense
                  </span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    Every edit automatically logs the acting user, timestamp, and field-level diff
                    in the Audit Log.
                  </span>
                </div>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 pt-4">
            <span className="text-xs text-emerald-700 font-medium">
              {settingsSavedMsg || ''}
            </span>
            <button
              type="submit"
              disabled={!isAdmin || savingSettings}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              {savingSettings ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </form>

        {/* Section 3: Docker Container & Persistent Storage */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-slate-800" />
                <h2 className="text-base font-semibold text-slate-900">
                  03. Docker Deployment & Data Persistence
                </h2>
              </div>
              <button
                type="button"
                onClick={handleCopyCompose}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>{copiedCompose ? 'Copied compose.yml' : 'Copy docker-compose.yml'}</span>
              </button>
            </div>

            <p className="text-xs text-slate-500">
              This workspace includes a multi-stage <code className="font-mono">Dockerfile</code>{' '}
              and <code className="font-mono">docker-compose.yml</code> mounting{' '}
              <code className="font-mono">/app/data</code> for persistent ledger storage.
            </p>

            <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-900 p-3.5 text-xs font-mono text-slate-100 leading-relaxed">
              {DOCKER_COMPOSE_SNIPPET}
            </pre>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={handleExportDatabaseJson}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export Full JSON Backup</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={onResetDemoData}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset to Default Sample Ledger</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
