import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Plus,
  Edit3,
  Trash2,
  ArrowRight,
  CheckCircle2,
  FolderPlus,
  ArrowLeftRight,
  Lock,
  User,
  LogOut,
  AlertCircle,
} from 'lucide-react';
import {
  UserAccount,
  ExpenseGroup,
  ExpenseEntry,
  AuditLogEntry,
  LedgerStatePayload,
  calculateRealTimeBalances,
  SplitMode,
  ExpenseSplit,
  UserRole,
} from './types';
import { ExpenseModal } from './components/ExpenseModal';
import { AuditLogsView, formatExactDateTime } from './components/AuditLogsView';
import { SettingsView } from './components/SettingsView';

type ActiveTab = 'expenses' | 'logs' | 'settings';

export default function App() {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [groups, setGroups] = useState<ExpenseGroup[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Require explicit login before accessing anything
  const [authenticatedUserId, setAuthenticatedUserId] = useState<string | null>(() => {
    return sessionStorage.getItem('sagesplit_auth_user_id') || null;
  });

  // Login screen state
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  const [activeGroupId, setActiveGroupId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('expenses');

  // Inline new group input (Admin only)
  const [creatingGroupInline, setCreatingGroupInline] = useState(false);
  const [inlineGroupName, setInlineGroupName] = useState('');

  // Expense Modal
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseEntry | null>(null);
  const [prefillSettlement, setPrefillSettlement] = useState<{
    fromUserId: string;
    toUserId: string;
    amount: number;
  } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  const applyServerState = useCallback((state: LedgerStatePayload) => {
    if (!state) return;
    setUsers(state.users || []);
    setGroups(state.groups || []);
    setExpenses(state.expenses || []);
    setLogs(state.logs || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let isMounted = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    fetch('/api/state')
      .then((r) => r.json())
      .then((data: LedgerStatePayload) => {
        if (isMounted) applyServerState(data);
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });

    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onmessage = (event) => {
        if (!isMounted) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.state) {
            applyServerState(msg.state);
          }
        } catch {
          // Ignore malformed message
        }
      };

      socket.onclose = () => {
        if (!isMounted) return;
        reconnectTimer = setTimeout(connectWebSocket, 2500);
      };
    };

    connectWebSocket();

    return () => {
      isMounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, [applyServerState]);

  const currentUser = useMemo<UserAccount | null>(() => {
    if (!authenticatedUserId) return null;
    return users.find((u) => u.id === authenticatedUserId) || null;
  }, [users, authenticatedUserId]);

  const isAdmin = currentUser?.role === 'admin';

  // Filter groups visible to the logged-in user (Admins see all groups; Members see groups they are assigned to)
  const visibleGroups = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'admin') return groups;
    return groups.filter((g) => g.memberUserIds.includes(currentUser.id));
  }, [groups, currentUser]);

  useEffect(() => {
    if (visibleGroups.length === 0) {
      setActiveGroupId('');
    } else if (!visibleGroups.some((g) => g.id === activeGroupId)) {
      setActiveGroupId(visibleGroups[0].id);
    }
  }, [visibleGroups, activeGroupId]);

  const activeGroup = useMemo(
    () => visibleGroups.find((g) => g.id === activeGroupId) || null,
    [visibleGroups, activeGroupId]
  );

  // Users assigned to the currently selected group
  const groupMembers = useMemo(() => {
    if (!activeGroup) return [];
    const assigned = users.filter((u) => activeGroup.memberUserIds.includes(u.id));
    return assigned.length > 0 ? assigned : users;
  }, [users, activeGroup]);

  const groupExpenses = useMemo(
    () => expenses.filter((e) => e.groupId === activeGroupId),
    [expenses, activeGroupId]
  );

  const balanceData = useMemo(
    () => calculateRealTimeBalances(groupMembers, groupExpenses),
    [groupMembers, groupExpenses]
  );

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  // --- Auth Handlers ---

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid username or password.');
      }
      sessionStorage.setItem('sagesplit_auth_user_id', data.user.id);
      setAuthenticatedUserId(data.user.id);
      setLoginUsername('');
      setLoginPassword('');
      setActiveTab('expenses');
    } catch (err: any) {
      setLoginError(err?.message || 'Invalid username or password.');
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('sagesplit_auth_user_id');
    setAuthenticatedUserId(null);
    setLoginError(null);
  };

  // --- API Handlers ---

  const handleCreateGroup = async (name: string) => {
    if (!currentUser) return;
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        memberUserIds: users.map((u) => u.id),
        actorUserId: currentUser.id,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create group.');
    if (data.group?.id) {
      setActiveGroupId(data.group.id);
    }
  };

  const handleInlineCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlineGroupName.trim()) return;
    await handleCreateGroup(inlineGroupName.trim());
    setInlineGroupName('');
    setCreatingGroupInline(false);
  };

  const handleDeleteGroup = async (id: string) => {
    if (!currentUser) return;
    await fetch(`/api/groups/${id}?actorUserId=${currentUser.id}`, {
      method: 'DELETE',
    });
  };

  const handleSaveExpense = async (payload: {
    id?: string;
    title: string;
    amount: number;
    paidByUserId: string;
    date: string;
    splitMode: SplitMode;
    splits: ExpenseSplit[];
    isSettlement: boolean;
  }) => {
    if (!currentUser) throw new Error('Not authenticated.');
    if (!activeGroupId) throw new Error('Please select an expense group first.');
    const isEdit = Boolean(payload.id);
    const url = isEdit ? `/api/expenses/${payload.id}` : '/api/expenses';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        groupId: activeGroupId,
        actorUserId: currentUser.id,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save.');
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!currentUser) return;
    await fetch(`/api/expenses/${expenseId}?actorUserId=${currentUser.id}`, {
      method: 'DELETE',
    });
  };

  const handleDeleteLog = async (logId: string) => {
    if (!currentUser) return;
    await fetch(`/api/logs/${logId}?actorUserId=${currentUser.id}`, {
      method: 'DELETE',
    });
  };

  const handleClearAllLogs = async () => {
    if (!currentUser) return;
    await fetch(`/api/logs?actorUserId=${currentUser.id}`, {
      method: 'DELETE',
    });
  };

  const handleCreateUser = async (payload: {
    displayName: string;
    username: string;
    password: string;
    role: UserRole;
    groupIds: string[];
  }) => {
    if (!currentUser) return;
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, actorUserId: currentUser.id }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create user.');
  };

  const handleUpdateUser = async (
    id: string,
    payload: {
      displayName?: string;
      username?: string;
      password?: string;
      role?: UserRole;
      groupIds?: string[];
    }
  ) => {
    if (!currentUser) return;
    const res = await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, actorUserId: currentUser.id }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update user.');
  };

  const handleDeleteUser = async (id: string) => {
    if (!currentUser) return;
    const res = await fetch(`/api/users/${id}?actorUserId=${currentUser.id}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to remove user.');
  };

  // --- Full-Screen Login Gate before accessing anything ---
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-5 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white shrink-0">
              <ArrowLeftRight className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-slate-900">SageSplit</h1>
              <p className="text-xs text-slate-500">Sign in to access shared expenses</p>
            </div>
          </div>

          <form onSubmit={handleLoginSubmit} className="p-6 space-y-4">
            {loginError && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{loginError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Username</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  required
                  autoFocus
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="Enter username"
                  className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3.5 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loginSubmitting}
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              {loginSubmitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-200 bg-white">
        {/* Zone 1: Brand with Icon */}
        <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
            <ArrowLeftRight className="h-4 w-4 text-emerald-400" />
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-900">SageSplit</span>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="flex items-center gap-6 text-sm font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('expenses')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'expenses'
                ? 'text-slate-900 font-semibold border-b-2 border-slate-900'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Expenses
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'logs'
                ? 'text-slate-900 font-semibold border-b-2 border-slate-900'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Logs
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'settings'
                  ? 'text-slate-900 font-semibold border-b-2 border-slate-900'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Settings
            </button>
          )}
        </nav>

        {/* Zone 3: Active User & Log Out */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-slate-600 hidden sm:inline">
            <span className="font-medium text-slate-900">{currentUser.displayName}</span>
            <span className="text-slate-400 mx-1">·</span>
            <span>{isAdmin ? 'Admin' : 'User'}</span>
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Log Out</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-6 space-y-6">
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500">
            Loading...
          </div>
        ) : (
          <>
            {/* TAB 1: EXPENSES & BALANCES */}
            {activeTab === 'expenses' && (
              <div className="space-y-6">
                {/* Group Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 mr-1">Group:</span>
                    {visibleGroups.length === 0 ? (
                      <span className="text-xs text-slate-500">
                        {isAdmin
                          ? 'No groups created yet'
                          : 'You have not been added to any expense groups yet'}
                      </span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {visibleGroups.map((g) => (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => setActiveGroupId(g.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                              activeGroupId === g.id
                                ? 'bg-slate-900 text-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {g.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {isAdmin && (
                    <div>
                      {creatingGroupInline ? (
                        <form onSubmit={handleInlineCreateGroup} className="flex items-center gap-2">
                          <input
                            type="text"
                            autoFocus
                            required
                            value={inlineGroupName}
                            onChange={(e) => setInlineGroupName(e.target.value)}
                            placeholder="Group name (e.g. Holiday)"
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-slate-900 focus:outline-none"
                          />
                          <button
                            type="submit"
                            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => setCreatingGroupInline(false)}
                            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600"
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCreatingGroupInline(true)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                        >
                          <FolderPlus className="h-3.5 w-3.5" />
                          <span>New Group</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Empty Group State */}
                {!activeGroup ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-12 text-center space-y-3">
                    <h2 className="text-base font-semibold text-slate-900">
                      {isAdmin ? 'Create your first expense group' : 'No expense groups assigned'}
                    </h2>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      {isAdmin
                        ? 'Create a group for a holiday, trip, or shared household, and add users in the Settings tab to start splitting expenses.'
                        : 'Ask your administrator to add your user account to an expense group.'}
                    </p>
                    {isAdmin && (
                      <div className="flex items-center justify-center gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setCreatingGroupInline(true)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
                        >
                          <FolderPlus className="h-3.5 w-3.5" />
                          <span>Create Expense Group</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('settings')}
                          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Manage Users & Groups
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                    {/* Left Column: Expenses List (7 cols) */}
                    <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white overflow-hidden">
                      <div className="border-b border-slate-200 px-5 py-4 flex items-center justify-between">
                        <div>
                          <h2 className="text-sm font-semibold text-slate-900">
                            {activeGroup.name} — Expenses
                          </h2>
                          <p className="text-xs text-slate-500 font-mono tabular-nums">
                            Total spent: ${balanceData.totalGroupSpend.toFixed(2)}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingExpense(null);
                            setPrefillSettlement(null);
                            setExpenseModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Add Expense</span>
                        </button>
                      </div>

                      {groupExpenses.length === 0 ? (
                        <div className="p-10 text-center text-xs text-slate-500">
                          No expenses logged in {activeGroup.name} yet.
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-200">
                          {groupExpenses.map((exp) => {
                            const payer = userMap.get(exp.paidByUserId);
                            const dt = formatExactDateTime(exp.updatedAt);
                            return (
                              <div
                                key={exp.id}
                                className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/70"
                              >
                                <div className="min-w-0 space-y-0.5">
                                  <div className="text-sm font-medium text-slate-900 truncate">
                                    {exp.title}
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    Paid by{' '}
                                    <span className="font-medium text-slate-700">
                                      {payer?.displayName || exp.paidByUserId}
                                    </span>{' '}
                                    · <span className="font-mono">{exp.date}</span>{' '}
                                    <span className="font-mono text-slate-400">{dt.timePart}</span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                  <span className="text-sm font-mono tabular-nums font-semibold text-slate-900">
                                    ${exp.amount.toFixed(2)}
                                  </span>

                                  {isAdmin && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingExpense(exp);
                                          setPrefillSettlement(null);
                                          setExpenseModalOpen(true);
                                        }}
                                        className="rounded border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                                        title="Edit"
                                      >
                                        <Edit3 className="h-3.5 w-3.5" />
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => handleDeleteExpense(exp.id)}
                                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                        title="Delete"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Right Column: Real-Time Balances & Settle Up (5 cols) */}
                    <div className="lg:col-span-5 space-y-6">
                      {/* Who Owes Whom */}
                      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                        <div className="border-b border-slate-200 px-5 py-4">
                          <h2 className="text-sm font-semibold text-slate-900">Settle Up</h2>
                          <p className="text-xs text-slate-500">
                            Real-time balances for {activeGroup.name}
                          </p>
                        </div>

                        {balanceData.transfers.length === 0 ? (
                          <div className="p-8 text-center">
                            <CheckCircle2 className="h-5 w-5 text-emerald-600 mx-auto mb-1.5" />
                            <p className="text-xs text-slate-500">All balances settled</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-200">
                            {balanceData.transfers.map((tr, idx) => {
                              const fromU = userMap.get(tr.fromUserId);
                              const toU = userMap.get(tr.toUserId);
                              return (
                                <div
                                  key={idx}
                                  className="px-5 py-3 flex items-center justify-between gap-2 text-xs"
                                >
                                  <div className="flex items-center gap-1.5 font-medium text-slate-900 truncate">
                                    <span>{fromU?.displayName || tr.fromUserId}</span>
                                    <ArrowRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                    <span>{toU?.displayName || tr.toUserId}</span>
                                  </div>

                                  <div className="flex items-center gap-2.5 shrink-0">
                                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                                      ${tr.amount.toFixed(2)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingExpense(null);
                                        setPrefillSettlement({
                                          fromUserId: tr.fromUserId,
                                          toUserId: tr.toUserId,
                                          amount: tr.amount,
                                        });
                                        setExpenseModalOpen(true);
                                      }}
                                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-colors"
                                    >
                                      Settle
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Member Net Standing */}
                      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                        <div className="border-b border-slate-200 px-5 py-3.5">
                          <h2 className="text-sm font-semibold text-slate-900">Member Balances</h2>
                        </div>
                        <div className="divide-y divide-slate-200">
                          {groupMembers.map((u) => {
                            const net = balanceData.summaries[u.id]?.netBalance || 0;
                            return (
                              <div
                                key={u.id}
                                className="px-5 py-2.5 flex items-center justify-between text-xs"
                              >
                                <span className="font-medium text-slate-900">{u.displayName}</span>
                                <span
                                  className={`font-mono tabular-nums font-semibold ${
                                    net > 0.009
                                      ? 'text-emerald-700'
                                      : net < -0.009
                                      ? 'text-red-700'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {net > 0.009 ? '+' : net < -0.009 ? '-' : ''}$
                                  {Math.abs(net).toFixed(2)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: ACTIVITY LOGS */}
            {activeTab === 'logs' && (
              <AuditLogsView
                logs={logs}
                isAdmin={isAdmin}
                onDeleteLog={handleDeleteLog}
                onClearAllLogs={handleClearAllLogs}
              />
            )}

            {/* TAB 3: SETTINGS (ADMIN ONLY) */}
            {activeTab === 'settings' && (
              <SettingsView
                users={users}
                groups={groups}
                currentUser={currentUser}
                onCreateUser={handleCreateUser}
                onUpdateUser={handleUpdateUser}
                onDeleteUser={handleDeleteUser}
                onCreateGroup={handleCreateGroup}
                onDeleteGroup={handleDeleteGroup}
              />
            )}
          </>
        )}
      </main>

      <ExpenseModal
        isOpen={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        users={groupMembers}
        currentUser={currentUser}
        editingExpense={editingExpense}
        prefillSettlement={prefillSettlement}
        onSave={handleSaveExpense}
      />
    </div>
  );
}
