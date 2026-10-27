import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  ArrowRight,
  LogOut,
  CheckCircle2,
  LayoutGrid,
  History,
  Settings,
  Handshake,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  UserAccount,
  ExpenseEntry,
  AuditLogEntry,
  WorkspaceSettings,
  PresenceUser,
  LedgerStatePayload,
  calculateRealTimeBalances,
  ExpenseCategory,
  SplitMode,
  ExpenseSplit,
  UserRole,
} from './types';
import { ExpenseModal } from './components/ExpenseModal';
import { LoginModal } from './components/LoginModal';
import { AuditLogsView, formatExactDateTime } from './components/AuditLogsView';
import { SettingsView } from './components/SettingsView';

type ActiveTab = 'ledger' | 'balances' | 'logs' | 'settings';

export default function App() {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [settings, setSettings] = useState<WorkspaceSettings>({
    workspaceName: 'Maple Street Shared Ledger',
    currencyCode: 'USD',
    currencySymbol: '$',
    defaultSplitMode: 'equal',
    allowMembersToEditAll: true,
  });
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);

  // Active authenticated user (defaults to admin on initial load so workspace is immediately usable)
  const [currentUserId, setCurrentUserId] = useState<string>(() => {
    return localStorage.getItem('splitdock_active_user_id') || 'usr-admin';
  });

  // Navigation tab
  const [activeTab, setActiveTab] = useState<ActiveTab>('ledger');

  // Ledger filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [payerFilter, setPayerFilter] = useState<string>('all');
  const [expandedExpenseIds, setExpandedExpenseIds] = useState<Record<string, boolean>>({});
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);

  // Modals
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseEntry | null>(null);
  const [prefillSettlement, setPrefillSettlement] = useState<{
    fromUserId: string;
    toUserId: string;
    amount: number;
  } | null>(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  const applyServerState = useCallback((state: LedgerStatePayload) => {
    if (!state) return;
    setUsers(state.users || []);
    setExpenses(state.expenses || []);
    setLogs(state.logs || []);
    if (state.settings) setSettings(state.settings);
    if (state.onlineUsers) setOnlineUsers(state.onlineUsers);
    setLoading(false);
  }, []);

  // Fetch initial state via HTTP and connect WebSocket for real-time updates
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

      socket.onopen = () => {
        if (!isMounted) return;
        setWsConnected(true);
        const savedUserId = localStorage.getItem('splitdock_active_user_id') || 'usr-admin';
        socket.send(
          JSON.stringify({
            type: 'presence:identify',
            userId: savedUserId,
          })
        );
      };

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
        setWsConnected(false);
        reconnectTimer = setTimeout(connectWebSocket, 2500);
      };
    };

    connectWebSocket();

    return () => {
      isMounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [applyServerState]);

  const currentUser = useMemo<UserAccount>(() => {
    const found = users.find((u) => u.id === currentUserId);
    if (found) return found;
    return (
      users[0] || {
        id: 'usr-admin',
        username: 'admin',
        displayName: 'Alex Rivera',
        role: 'admin',
        avatarColor: '#0F172A',
        createdAt: new Date().toISOString(),
        active: true,
      }
    );
  }, [users, currentUserId]);

  // Announce active user change over WebSocket
  useEffect(() => {
    localStorage.setItem('splitdock_active_user_id', currentUser.id);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'presence:identify',
          userId: currentUser.id,
        })
      );
    }
  }, [currentUser.id]);

  // Real-time balance calculation
  const balanceData = useMemo(() => {
    return calculateRealTimeBalances(users, expenses);
  }, [users, expenses]);

  const userMap = useMemo(() => {
    return new Map(users.map((u) => [u.id, u]));
  }, [users]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((exp) => {
      if (categoryFilter !== 'all' && exp.category !== categoryFilter) {
        return false;
      }
      if (payerFilter !== 'all' && exp.paidByUserId !== payerFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const payerName = userMap.get(exp.paidByUserId)?.displayName.toLowerCase() || '';
        return (
          exp.title.toLowerCase().includes(q) ||
          exp.notes.toLowerCase().includes(q) ||
          exp.category.toLowerCase().includes(q) ||
          payerName.includes(q)
        );
      }
      return true;
    });
  }, [expenses, categoryFilter, payerFilter, searchQuery, userMap]);

  // --- API Action Handlers ---

  const handleAuthenticate = async (username: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Authentication failed.');
    }
    setCurrentUserId(data.user.id);
  };

  const handleSaveExpense = async (payload: {
    id?: string;
    title: string;
    amount: number;
    category: ExpenseCategory;
    paidByUserId: string;
    date: string;
    splitMode: SplitMode;
    splits: ExpenseSplit[];
    notes: string;
    isSettlement: boolean;
  }) => {
    const isEdit = Boolean(payload.id);
    const url = isEdit ? `/api/expenses/${payload.id}` : '/api/expenses';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        actorUserId: currentUser.id,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to save entry.');
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    const res = await fetch(`/api/expenses/${expenseId}?actorUserId=${currentUser.id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setDeletingExpenseId(null);
    }
  };

  const handleRestoreSnapshot = async (logId: string) => {
    const res = await fetch(`/api/logs/${logId}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorUserId: currentUser.id }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to restore snapshot.');
    }
  };

  const handleCreateUser = async (payload: {
    displayName: string;
    username: string;
    password: string;
    role: UserRole;
    avatarColor: string;
  }) => {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, actorUserId: currentUser.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to create user.');
    }
  };

  const handleUpdateUser = async (
    id: string,
    payload: {
      displayName?: string;
      username?: string;
      password?: string;
      role?: UserRole;
      avatarColor?: string;
    }
  ) => {
    const res = await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, actorUserId: currentUser.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update user.');
    }
  };

  const handleDeleteUser = async (id: string) => {
    const res = await fetch(`/api/users/${id}?actorUserId=${currentUser.id}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to remove user.');
    }
    if (id === currentUser.id && users.length > 0) {
      const fallback = users.find((u) => u.id !== id);
      if (fallback) setCurrentUserId(fallback.id);
    }
  };

  const handleUpdateSettings = async (payload: Partial<WorkspaceSettings>) => {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, actorUserId: currentUser.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update settings.');
    }
  };

  const handleResetDemoData = async () => {
    await fetch('/api/admin/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorUserId: currentUser.id }),
    });
  };

  const canUserEditExpense = (exp: ExpenseEntry): boolean => {
    if (currentUser.role === 'admin') return true;
    if (settings.allowMembersToEditAll) return true;
    return exp.createdByUserId === currentUser.id || exp.paidByUserId === currentUser.id;
  };

  const openNewExpenseModal = () => {
    setEditingExpense(null);
    setPrefillSettlement(null);
    setExpenseModalOpen(true);
  };

  const openEditExpenseModal = (exp: ExpenseEntry) => {
    setEditingExpense(exp);
    setPrefillSettlement(null);
    setExpenseModalOpen(true);
  };

  const openSettleTransferModal = (fromUserId: string, toUserId: string, amount: number) => {
    setEditingExpense(null);
    setPrefillSettlement({ fromUserId, toUserId, amount });
    setExpenseModalOpen(true);
  };

  const myBalance = balanceData.summaries[currentUser.id]?.netBalance || 0;
  const sym = settings.currencySymbol;

  const activeTabLabel =
    activeTab === 'ledger'
      ? 'Shared Expenses & Live Balances'
      : activeTab === 'balances'
      ? 'Reconciliation & Debt Matrix'
      : activeTab === 'logs'
      ? 'Full Audit Logs'
      : 'Admin & Account Settings';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Left Sidebar Navigation (260px fixed width on desktop) */}
      <aside className="w-full lg:w-[264px] shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 bg-white flex flex-col justify-between">
        <div>
          {/* Brand Header */}
          <div className="px-6 py-5 border-b border-slate-200">
            <div className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
              SplitDock
            </div>
            <div className="text-xs text-slate-500 mt-0.5 truncate">
              {settings.workspaceName}
            </div>
          </div>

          {/* Primary Navigation */}
          <nav className="p-3 space-y-1">
            {(
              [
                {
                  id: 'ledger',
                  label: 'Shared Expenses',
                  icon: LayoutGrid,
                  count: expenses.length,
                },
                {
                  id: 'balances',
                  label: 'Real-Time Balances',
                  icon: Handshake,
                  count: balanceData.transfers.length,
                },
                {
                  id: 'logs',
                  label: 'Full Audit Logs',
                  icon: History,
                  count: logs.length,
                },
                {
                  id: 'settings',
                  label: 'Settings & Accounts',
                  icon: Settings,
                  count: users.length,
                },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </div>
                  <span
                    className={`font-mono tabular-nums text-xs ${
                      isActive ? 'text-slate-300' : 'text-slate-400'
                    }`}
                  >
                    {item.count}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Authenticated Account Box */}
        <div className="p-4 border-t border-slate-200 space-y-3 bg-slate-50/50">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: currentUser.avatarColor }}
              >
                {currentUser.displayName.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 truncate">
                  {currentUser.displayName}
                </div>
                <div className="text-xs text-slate-500 truncate">
                  @{currentUser.username} · {currentUser.role === 'admin' ? 'Admin' : 'Member'}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setLoginModalOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
              title="Sign in with a different username and password"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Switch</span>
            </button>
          </div>

          <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-500">
            <span>Sync: {wsConnected ? 'Live WebSocket' : 'Reconnecting'}</span>
            <span className="font-mono tabular-nums">{onlineUsers.length} online</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb on Left, Primary Actions on Right */}
        <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2 text-sm text-slate-500 truncate">
            <span className="font-medium text-slate-900 truncate">{settings.workspaceName}</span>
            <span aria-hidden="true">/</span>
            <span className="text-slate-600 truncate">{activeTabLabel}</span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setLoginModalOpen(true)}
              className="hidden sm:inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              Sign In / Switch User (@{currentUser.username})
            </button>
            <button
              type="button"
              onClick={openNewExpenseModal}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Shared Expense</span>
            </button>
          </div>
        </header>

        {/* Main Viewport Container */}
        <main className="flex-1 p-6 max-w-[1360px] w-full mx-auto space-y-6">
          {/* 4-Column Full-Width KPI Strip */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 rounded-xl border border-slate-200 bg-white divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
            <div className="p-5">
              <div className="text-xs text-slate-500">Total Group Spend</div>
              <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {sym}
                {balanceData.totalGroupSpend.toFixed(2)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {expenses.filter((e) => !e.isSettlement).length} shared expenses ·{' '}
                {expenses.filter((e) => e.isSettlement).length} settlements
              </div>
            </div>

            <div className="p-5">
              <div className="text-xs text-slate-500">Unsettled Net Balance</div>
              <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {sym}
                {balanceData.totalUnsettledDebt.toFixed(2)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {balanceData.transfers.length === 0
                  ? 'All members settled up'
                  : `${balanceData.transfers.length} simplified transfer${
                      balanceData.transfers.length === 1 ? '' : 's'
                    } required`}
              </div>
            </div>

            <div className="p-5">
              <div className="text-xs text-slate-500">
                Your Position ({currentUser.displayName})
              </div>
              <div
                className={`mt-1.5 text-2xl font-bold font-mono tabular-nums ${
                  myBalance > 0.009
                    ? 'text-emerald-700'
                    : myBalance < -0.009
                    ? 'text-red-700'
                    : 'text-slate-900'
                }`}
              >
                {myBalance > 0.009 ? '+' : myBalance < -0.009 ? '-' : ''}
                {sym}
                {Math.abs(myBalance).toFixed(2)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {myBalance > 0.009
                  ? 'Owed to you by group'
                  : myBalance < -0.009
                  ? 'You owe the group'
                  : 'Settled to zero'}
              </div>
            </div>

            <div className="p-5">
              <div className="text-xs text-slate-500">Audit Trail & Revisions</div>
              <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {logs.length}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {logs.filter((l) => l.action === 'EXPENSE_EDITED').length} logged edits ·{' '}
                <button
                  type="button"
                  onClick={() => setActiveTab('logs')}
                  className="underline hover:text-slate-900"
                >
                  View full logs
                </button>
              </div>
            </div>
          </section>

          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 space-y-4">
              <div className="h-5 w-48 rounded bg-slate-100 animate-pulse" />
              <div className="h-10 w-full rounded bg-slate-100 animate-pulse" />
              <div className="h-10 w-full rounded bg-slate-100 animate-pulse" />
              <div className="h-10 w-full rounded bg-slate-100 animate-pulse" />
            </div>
          ) : (
            <>
              {/* TAB 1: SHARED EXPENSES & LIVE BALANCING */}
              {activeTab === 'ledger' && (
                <div className="space-y-6">
                  {/* Live Balance Summary & Minimum-Transfer Settlement Strip */}
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                    {/* Member Net Balances Table (7 cols) */}
                    <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white overflow-hidden">
                      <div className="border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
                        <div>
                          <h2 className="text-sm font-semibold text-slate-900">
                            Real-Time Member Standing
                          </h2>
                          <p className="text-xs text-slate-500">
                            Paid vs. fair share across all active expenses and settlements
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('balances')}
                          className="text-xs font-medium text-slate-600 hover:text-slate-900 underline whitespace-nowrap shrink-0"
                        >
                          Full Breakdown
                        </button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                              <th className="py-2.5 px-4 font-medium">Member</th>
                              <th className="py-2.5 px-4 font-medium text-right">Paid</th>
                              <th className="py-2.5 px-4 font-medium text-right">Fair Share</th>
                              <th className="py-2.5 px-4 font-medium text-right">Net Balance</th>
                              <th className="py-2.5 px-4 font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {users.map((u) => {
                              const s = balanceData.summaries[u.id] || {
                                totalExpensesPaid: 0,
                                totalExpenseShare: 0,
                                settlementsPaid: 0,
                                settlementsReceived: 0,
                                netBalance: 0,
                              };
                              const net = s.netBalance;

                              return (
                                <tr key={u.id} className="hover:bg-slate-50/70">
                                  <td className="py-3 px-4">
                                    <span className="font-medium text-slate-900">
                                      {u.displayName}
                                    </span>
                                    <span className="text-slate-500 ml-1.5 font-mono">
                                      @{u.username}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                                    {sym}
                                    {s.totalExpensesPaid.toFixed(2)}
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                                    {sym}
                                    {s.totalExpenseShare.toFixed(2)}
                                  </td>
                                  <td
                                    className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${
                                      net > 0.009
                                        ? 'text-emerald-700'
                                        : net < -0.009
                                        ? 'text-red-700'
                                        : 'text-slate-500'
                                    }`}
                                  >
                                    {net > 0.009 ? '+' : net < -0.009 ? '-' : ''}
                                    {sym}
                                    {Math.abs(net).toFixed(2)}
                                  </td>
                                  <td className="py-3 px-4 text-slate-600">
                                    {net > 0.009
                                      ? 'Owed to member'
                                      : net < -0.009
                                      ? 'Owes group'
                                      : 'Settled up'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Simplified Settlement Transfers (5 cols) */}
                    <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white flex flex-col justify-between overflow-hidden">
                      <div>
                        <div className="border-b border-slate-200 px-5 py-3.5">
                          <h2 className="text-sm font-semibold text-slate-900">
                            Recommended Settlement Transfers
                          </h2>
                          <p className="text-xs text-slate-500">
                            Minimum transactions to bring every member to {sym}0.00
                          </p>
                        </div>

                        {balanceData.transfers.length === 0 ? (
                          <div className="p-8 text-center">
                            <CheckCircle2 className="h-6 w-6 text-emerald-600 mx-auto mb-2" />
                            <p className="text-sm font-medium text-slate-900">
                              All balances are settled
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              No member owes any outstanding balance right now.
                            </p>
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-200">
                            {balanceData.transfers.map((tr, idx) => {
                              const fromU = userMap.get(tr.fromUserId);
                              const toU = userMap.get(tr.toUserId);
                              return (
                                <div
                                  key={idx}
                                  className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/70"
                                >
                                  <div className="min-w-0 text-xs">
                                    <div className="flex items-center gap-1.5 font-medium text-slate-900 truncate">
                                      <span>{fromU?.displayName || tr.fromUserId}</span>
                                      <ArrowRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                      <span>{toU?.displayName || tr.toUserId}</span>
                                    </div>
                                    <div className="text-slate-500 mt-0.5">
                                      @{fromU?.username} pays @{toU?.username}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-3 shrink-0">
                                    <span className="text-sm font-mono tabular-nums font-semibold text-slate-900">
                                      {sym}
                                      {tr.amount.toFixed(2)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openSettleTransferModal(
                                          tr.fromUserId,
                                          tr.toUserId,
                                          tr.amount
                                        )
                                      }
                                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-colors whitespace-nowrap shrink-0"
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

                      <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 flex items-center justify-between text-xs text-slate-500">
                        <span>Algorithm: Greedy Minimum-Edge Netting</span>
                        <span className="font-mono tabular-nums">Real-Time</span>
                      </div>
                    </div>
                  </div>

                  {/* Shared Expense Ledger Section */}
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    {/* Table Header & Filters */}
                    <div className="border-b border-slate-200 p-5 space-y-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h2 className="text-base font-semibold text-slate-900">
                            Shared Expense & Settlement Ledger
                          </h2>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Click Edit on any row to adjust amounts, payers, or splits. Every
                            modification is recorded in the Audit Log.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5">
                          <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 focus:border-slate-900 focus:outline-none"
                          >
                            <option value="all">All Categories</option>
                            <option value="Groceries">Groceries</option>
                            <option value="Utilities">Utilities</option>
                            <option value="Rent & Housing">Rent & Housing</option>
                            <option value="Dining">Dining</option>
                            <option value="Travel">Travel</option>
                            <option value="Household">Household</option>
                            <option value="Settlement">Settlements</option>
                            <option value="Other">Other</option>
                          </select>

                          <select
                            value={payerFilter}
                            onChange={(e) => setPayerFilter(e.target.value)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 focus:border-slate-900 focus:outline-none"
                          >
                            <option value="all">Paid by Any Member</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>
                                Paid by {u.displayName}
                              </option>
                            ))}
                          </select>

                          <div className="relative min-w-[210px]">
                            <Search className="pointer-events-none absolute left-3 top-2 h-3.5 w-3.5 text-slate-400" />
                            <input
                              type="text"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              placeholder="Search title, notes, payer..."
                              className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expense Rows */}
                    {filteredExpenses.length === 0 ? (
                      <div className="p-12 text-center">
                        <p className="text-sm font-medium text-slate-900">
                          No expenses match your current filter
                        </p>
                        <p className="text-xs text-slate-500 mt-1 mb-4">
                          Log a new shared expense or clear your active search filters.
                        </p>
                        <button
                          type="button"
                          onClick={openNewExpenseModal}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Log First Expense</span>
                        </button>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                              <th className="py-3 px-4">Date & Logged Time</th>
                              <th className="py-3 px-4">Expense Description</th>
                              <th className="py-3 px-4">Paid By</th>
                              <th className="py-3 px-4">Split Breakdown</th>
                              <th className="py-3 px-4 text-right">Total Amount</th>
                              <th className="py-3 px-4 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {filteredExpenses.map((exp) => {
                              const payer = userMap.get(exp.paidByUserId);
                              const updatedBy = userMap.get(exp.updatedByUserId);
                              const dt = formatExactDateTime(exp.updatedAt);
                              const isExpanded = Boolean(expandedExpenseIds[exp.id]);
                              const canEdit = canUserEditExpense(exp);
                              const isConfirmingDelete = deletingExpenseId === exp.id;

                              return (
                                <React.Fragment key={exp.id}>
                                  <tr className="hover:bg-slate-50/75 transition-colors">
                                    {/* Date & Exact Time */}
                                    <td className="py-3.5 px-4 align-top whitespace-nowrap">
                                      <div className="font-mono tabular-nums text-xs font-medium text-slate-900">
                                        {exp.date}
                                      </div>
                                      <div className="font-mono tabular-nums text-xs text-slate-500 mt-0.5">
                                        {dt.timePart}
                                      </div>
                                    </td>

                                    {/* Title & Metadata (Zero-Pill Unboxed Text) */}
                                    <td className="py-3.5 px-4 align-top">
                                      <div className="font-medium text-slate-900">{exp.title}</div>
                                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                                        <span>{exp.category}</span>
                                        <span aria-hidden="true">·</span>
                                        <span>Rev #{exp.revision}</span>
                                        {exp.revision > 1 && updatedBy && (
                                          <>
                                            <span aria-hidden="true">·</span>
                                            <span className="text-amber-700">
                                              Edited by {updatedBy.displayName}
                                            </span>
                                          </>
                                        )}
                                      </div>
                                      {exp.notes && (
                                        <div className="text-xs text-slate-500 mt-1">
                                          {exp.notes}
                                        </div>
                                      )}
                                    </td>

                                    {/* Paid By */}
                                    <td className="py-3.5 px-4 align-top whitespace-nowrap">
                                      <div className="text-xs font-medium text-slate-900">
                                        {payer?.displayName || exp.paidByUserId}
                                      </div>
                                      <div className="text-xs font-mono text-slate-500">
                                        @{payer?.username || 'member'}
                                      </div>
                                    </td>

                                    {/* Split Breakdown */}
                                    <td className="py-3.5 px-4 align-top">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setExpandedExpenseIds((prev) => ({
                                            ...prev,
                                            [exp.id]: !prev[exp.id],
                                          }))
                                        }
                                        className="inline-flex items-center gap-1 text-xs text-slate-700 hover:text-slate-900"
                                      >
                                        <span>
                                          {exp.isSettlement
                                            ? `Direct transfer to ${
                                                userMap.get(exp.splits[0]?.userId)?.displayName ||
                                                'member'
                                              }`
                                            : `${
                                                exp.splitMode.charAt(0).toUpperCase() +
                                                exp.splitMode.slice(1)
                                              } · ${exp.splits.length} member${
                                                exp.splits.length === 1 ? '' : 's'
                                              }`}
                                        </span>
                                        {isExpanded ? (
                                          <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
                                        ) : (
                                          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                                        )}
                                      </button>

                                      {isExpanded && (
                                        <div className="mt-2 space-y-1 border-t border-slate-200 pt-2 text-xs">
                                          {exp.splits.map((s) => {
                                            const u = userMap.get(s.userId);
                                            return (
                                              <div
                                                key={s.userId}
                                                className="flex items-center justify-between gap-4 font-mono tabular-nums text-slate-600"
                                              >
                                                <span className="font-sans">
                                                  {u?.displayName || s.userId}
                                                </span>
                                                <span className="font-medium text-slate-900">
                                                  {sym}
                                                  {s.amount.toFixed(2)}
                                                </span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </td>

                                    {/* Amount */}
                                    <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                                      <span className="font-mono tabular-nums text-sm font-semibold text-slate-900">
                                        {sym}
                                        {exp.amount.toFixed(2)}
                                      </span>
                                    </td>

                                    {/* Edit / Delete Actions */}
                                    <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                                      {canEdit ? (
                                        <div className="inline-flex items-center justify-end gap-2">
                                          {isConfirmingDelete ? (
                                            <>
                                              <button
                                                type="button"
                                                onClick={() => handleDeleteExpense(exp.id)}
                                                className="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 whitespace-nowrap shrink-0"
                                              >
                                                Confirm Delete
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => setDeletingExpenseId(null)}
                                                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 whitespace-nowrap shrink-0"
                                              >
                                                Cancel
                                              </button>
                                            </>
                                          ) : (
                                            <>
                                              <button
                                                type="button"
                                                onClick={() => openEditExpenseModal(exp)}
                                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors whitespace-nowrap shrink-0"
                                              >
                                                <Edit3 className="h-3.5 w-3.5" />
                                                <span>Edit</span>
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => setDeletingExpenseId(exp.id)}
                                                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                                title="Delete entry"
                                              >
                                                <Trash2 className="h-3.5 w-3.5" />
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-xs text-slate-400">Read-only</span>
                                      )}
                                    </td>
                                  </tr>
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: DETAILED REAL-TIME BALANCES & SETTLEMENT MATRIX */}
              {activeTab === 'balances' && (
                <div className="space-y-6">
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="border-b border-slate-200 px-6 py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900">
                          Comprehensive Member Accounting Matrix
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Formula: Net Balance = (Expenses Paid + Settlements Sent) − (Fair Expense
                          Share + Settlements Received)
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={openNewExpenseModal}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Record Expense or Settlement</span>
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                            <th className="py-3 px-5">Participant</th>
                            <th className="py-3 px-5 text-right">Expenses Paid</th>
                            <th className="py-3 px-5 text-right">Fair Expense Share</th>
                            <th className="py-3 px-5 text-right">Settlements Sent</th>
                            <th className="py-3 px-5 text-right">Settlements Received</th>
                            <th className="py-3 px-5 text-right">Net Position</th>
                            <th className="py-3 px-5">Standing</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {users.map((u) => {
                            const s = balanceData.summaries[u.id] || {
                              totalExpensesPaid: 0,
                              totalExpenseShare: 0,
                              settlementsPaid: 0,
                              settlementsReceived: 0,
                              netBalance: 0,
                            };
                            const net = s.netBalance;

                            return (
                              <tr key={u.id} className="hover:bg-slate-50/75">
                                <td className="py-3.5 px-5">
                                  <div className="font-medium text-slate-900">{u.displayName}</div>
                                  <div className="text-xs font-mono text-slate-500">
                                    @{u.username} · {u.role}
                                  </div>
                                </td>
                                <td className="py-3.5 px-5 text-right font-mono tabular-nums text-xs text-slate-700">
                                  {sym}
                                  {s.totalExpensesPaid.toFixed(2)}
                                </td>
                                <td className="py-3.5 px-5 text-right font-mono tabular-nums text-xs text-slate-700">
                                  {sym}
                                  {s.totalExpenseShare.toFixed(2)}
                                </td>
                                <td className="py-3.5 px-5 text-right font-mono tabular-nums text-xs text-slate-700">
                                  {sym}
                                  {s.settlementsPaid.toFixed(2)}
                                </td>
                                <td className="py-3.5 px-5 text-right font-mono tabular-nums text-xs text-slate-700">
                                  {sym}
                                  {s.settlementsReceived.toFixed(2)}
                                </td>
                                <td
                                  className={`py-3.5 px-5 text-right font-mono tabular-nums text-sm font-semibold ${
                                    net > 0.009
                                      ? 'text-emerald-700'
                                      : net < -0.009
                                      ? 'text-red-700'
                                      : 'text-slate-600'
                                  }`}
                                >
                                  {net > 0.009 ? '+' : net < -0.009 ? '-' : ''}
                                  {sym}
                                  {Math.abs(net).toFixed(2)}
                                </td>
                                <td className="py-3.5 px-5 text-xs text-slate-600">
                                  {net > 0.009
                                    ? `Owed ${sym}${net.toFixed(2)}`
                                    : net < -0.009
                                    ? `Owes ${sym}${Math.abs(net).toFixed(2)}`
                                    : 'Settled ($0.00)'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Actionable Settlement Plan Card */}
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="border-b border-slate-200 px-6 py-4">
                      <h3 className="text-base font-semibold text-slate-900">
                        Simplified Debt Resolution Plan
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Click Record Settlement on any transfer below to log the payment and update
                        everyone’s balance in real time.
                      </p>
                    </div>

                    {balanceData.transfers.length === 0 ? (
                      <div className="p-10 text-center">
                        <CheckCircle2 className="h-7 w-7 text-emerald-600 mx-auto mb-2" />
                        <p className="text-sm font-medium text-slate-900">
                          Every member is completely settled up
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200">
                        {balanceData.transfers.map((tr, i) => {
                          const fromU = userMap.get(tr.fromUserId);
                          const toU = userMap.get(tr.toUserId);
                          return (
                            <div
                              key={i}
                              className="px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="flex items-center gap-3">
                                <span className="font-mono text-xs text-slate-400">
                                  0{i + 1}.
                                </span>
                                <div>
                                  <div className="text-sm font-medium text-slate-900 flex items-center gap-2">
                                    <span>{fromU?.displayName}</span>
                                    <span className="text-xs text-slate-400 font-normal">
                                      pays
                                    </span>
                                    <span>{toU?.displayName}</span>
                                  </div>
                                  <div className="text-xs text-slate-500 font-mono">
                                    @{fromU?.username} → @{toU?.username}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-4">
                                <span className="text-base font-mono tabular-nums font-bold text-slate-900">
                                  {sym}
                                  {tr.amount.toFixed(2)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    openSettleTransferModal(tr.fromUserId, tr.toUserId, tr.amount)
                                  }
                                  className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                                >
                                  Record Settlement
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: FULL TIMESTAMPED AUDIT LOGS */}
              {activeTab === 'logs' && (
                <AuditLogsView
                  logs={logs}
                  users={users}
                  onRestoreSnapshot={handleRestoreSnapshot}
                />
              )}

              {/* TAB 4: ADMIN & ACCOUNT SETTINGS */}
              {activeTab === 'settings' && (
                <SettingsView
                  users={users}
                  currentUser={currentUser}
                  settings={settings}
                  balances={balanceData.summaries}
                  expenses={expenses}
                  logs={logs}
                  onCreateUser={handleCreateUser}
                  onUpdateUser={handleUpdateUser}
                  onDeleteUser={handleDeleteUser}
                  onUpdateSettings={handleUpdateSettings}
                  onSwitchUserDirect={(user) => setCurrentUserId(user.id)}
                  onResetDemoData={handleResetDemoData}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Expense Create / Edit / Settlement Modal */}
      <ExpenseModal
        isOpen={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        users={users}
        currentUser={currentUser}
        currencySymbol={settings.currencySymbol}
        defaultSplitMode={settings.defaultSplitMode}
        editingExpense={editingExpense}
        prefillSettlement={prefillSettlement}
        onSave={handleSaveExpense}
      />

      {/* Username & Password Sign-In / Account Switcher Modal */}
      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        users={users}
        currentUser={currentUser}
        onAuthenticate={handleAuthenticate}
        allowDismiss={true}
      />
    </div>
  );
}
