import React, { useState, useEffect, useMemo } from 'react';
import { X, Check, AlertCircle, ArrowRight } from 'lucide-react';
import {
  UserAccount,
  ExpenseEntry,
  ExpenseCategory,
  SplitMode,
  ExpenseSplit,
  computeEqualSplits,
  computePercentageSplits,
  computeShareWeightSplits,
  roundCents,
} from '../types';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: UserAccount[];
  currentUser: UserAccount;
  currencySymbol: string;
  defaultSplitMode: SplitMode;
  editingExpense: ExpenseEntry | null;
  prefillSettlement?: {
    fromUserId: string;
    toUserId: string;
    amount: number;
  } | null;
  onSave: (payload: {
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
  }) => Promise<void>;
}

const CATEGORIES: ExpenseCategory[] = [
  'Groceries',
  'Utilities',
  'Rent & Housing',
  'Dining',
  'Travel',
  'Household',
  'Other',
];

export const ExpenseModal: React.FC<ExpenseModalProps> = ({
  isOpen,
  onClose,
  users,
  currentUser,
  currencySymbol,
  defaultSplitMode,
  editingExpense,
  prefillSettlement,
  onSave,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];

  const [isSettlement, setIsSettlement] = useState(false);
  const [title, setTitle] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('Groceries');
  const [paidByUserId, setPaidByUserId] = useState(currentUser.id);
  const [settlementReceiverId, setSettlementReceiverId] = useState(
    users.find((u) => u.id !== currentUser.id)?.id || currentUser.id
  );
  const [date, setDate] = useState(todayStr);
  const [splitMode, setSplitMode] = useState<SplitMode>(defaultSplitMode);
  const [notes, setNotes] = useState('');

  // Participant state for the 4 split modes
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(users.map((u) => u.id));
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [percentages, setPercentages] = useState<Record<string, string>>({});
  const [shareWeights, setShareWeights] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);

    if (editingExpense) {
      setIsSettlement(editingExpense.isSettlement);
      setTitle(editingExpense.title);
      setAmountStr(editingExpense.amount.toFixed(2));
      setCategory(editingExpense.category);
      setPaidByUserId(editingExpense.paidByUserId);
      setDate(editingExpense.date);
      setSplitMode(editingExpense.splitMode);
      setNotes(editingExpense.notes || '');

      if (editingExpense.isSettlement && editingExpense.splits[0]) {
        setSettlementReceiverId(editingExpense.splits[0].userId);
      }

      const activeIds = editingExpense.splits.map((s) => s.userId);
      setSelectedUserIds(activeIds.length > 0 ? activeIds : users.map((u) => u.id));

      const initExact: Record<string, string> = {};
      const initPct: Record<string, string> = {};
      const initShares: Record<string, string> = {};

      users.forEach((u) => {
        const found = editingExpense.splits.find((s) => s.userId === u.id);
        initExact[u.id] = found ? found.amount.toFixed(2) : '0.00';
        initPct[u.id] =
          found && found.shareValue !== undefined
            ? String(found.shareValue)
            : found && editingExpense.amount > 0
            ? String(roundCents((found.amount / editingExpense.amount) * 100))
            : '0';
        initShares[u.id] =
          found && found.shareValue !== undefined ? String(found.shareValue) : found ? '1' : '0';
      });

      setExactAmounts(initExact);
      setPercentages(initPct);
      setShareWeights(initShares);
    } else if (prefillSettlement) {
      const fromUser = users.find((u) => u.id === prefillSettlement.fromUserId);
      const toUser = users.find((u) => u.id === prefillSettlement.toUserId);
      setIsSettlement(true);
      setPaidByUserId(prefillSettlement.fromUserId);
      setSettlementReceiverId(prefillSettlement.toUserId);
      setAmountStr(prefillSettlement.amount.toFixed(2));
      setTitle(
        `Settlement: ${fromUser?.displayName || 'Member'} → ${toUser?.displayName || 'Member'}`
      );
      setCategory('Settlement');
      setDate(todayStr);
      setSplitMode('exact');
      setNotes('Direct balance settlement');
    } else {
      setIsSettlement(false);
      setTitle('');
      setAmountStr('');
      setCategory('Groceries');
      setPaidByUserId(currentUser.id);
      const otherUser = users.find((u) => u.id !== currentUser.id);
      setSettlementReceiverId(otherUser ? otherUser.id : currentUser.id);
      setDate(todayStr);
      setSplitMode(defaultSplitMode);
      setNotes('');
      setSelectedUserIds(users.map((u) => u.id));

      const defaultPct = users.length > 0 ? (100 / users.length).toFixed(1) : '0';
      const initExact: Record<string, string> = {};
      const initPct: Record<string, string> = {};
      const initShares: Record<string, string> = {};

      users.forEach((u) => {
        initExact[u.id] = '0.00';
        initPct[u.id] = defaultPct;
        initShares[u.id] = '1';
      });
      setExactAmounts(initExact);
      setPercentages(initPct);
      setShareWeights(initShares);
    }
  }, [isOpen, editingExpense, prefillSettlement, users, currentUser.id, defaultSplitMode, todayStr]);

  const numericAmount = useMemo(() => {
    const val = parseFloat(amountStr);
    return isNaN(val) || val < 0 ? 0 : roundCents(val);
  }, [amountStr]);

  const computedSplits = useMemo<ExpenseSplit[]>(() => {
    if (isSettlement) {
      return [
        {
          userId: settlementReceiverId,
          amount: numericAmount,
        },
      ];
    }

    if (splitMode === 'equal') {
      return computeEqualSplits(numericAmount, selectedUserIds);
    }

    if (splitMode === 'exact') {
      return users
        .map((u) => ({
          userId: u.id,
          amount: roundCents(parseFloat(exactAmounts[u.id] || '0') || 0),
        }))
        .filter((s) => s.amount > 0);
    }

    if (splitMode === 'percentage') {
      const items = users.map((u) => ({
        userId: u.id,
        percent: parseFloat(percentages[u.id] || '0') || 0,
      }));
      return computePercentageSplits(numericAmount, items);
    }

    if (splitMode === 'shares') {
      const items = users.map((u) => ({
        userId: u.id,
        weight: parseFloat(shareWeights[u.id] || '0') || 0,
      }));
      return computeShareWeightSplits(numericAmount, items);
    }

    return [];
  }, [
    isSettlement,
    settlementReceiverId,
    numericAmount,
    splitMode,
    selectedUserIds,
    exactAmounts,
    percentages,
    shareWeights,
    users,
  ]);

  const splitValidation = useMemo(() => {
    if (isSettlement) {
      if (paidByUserId === settlementReceiverId) {
        return { valid: false, message: 'Payer and recipient must be different members.' };
      }
      return { valid: numericAmount > 0, message: '' };
    }

    if (numericAmount <= 0) {
      return { valid: false, message: 'Enter an expense amount greater than zero.' };
    }

    if (splitMode === 'equal') {
      if (selectedUserIds.length === 0) {
        return { valid: false, message: 'Select at least one member to split this expense.' };
      }
      return { valid: true, message: '' };
    }

    if (splitMode === 'exact') {
      const sum = roundCents(computedSplits.reduce((acc, s) => acc + s.amount, 0));
      const diff = roundCents(numericAmount - sum);
      if (Math.abs(diff) > 0.009) {
        return {
          valid: false,
          message:
            diff > 0
              ? `${currencySymbol}${diff.toFixed(2)} remaining to allocate.`
              : `Over-allocated by ${currencySymbol}${Math.abs(diff).toFixed(2)}.`,
        };
      }
      return { valid: true, message: 'Exact amounts match total.' };
    }

    if (splitMode === 'percentage') {
      const totalPct = roundCents(
        users.reduce((acc, u) => acc + (parseFloat(percentages[u.id] || '0') || 0), 0)
      );
      const diff = roundCents(100 - totalPct);
      if (Math.abs(diff) > 0.1) {
        return {
          valid: false,
          message: `Percentages sum to ${totalPct.toFixed(1)}% (${
            diff > 0 ? `${diff.toFixed(1)}% left` : `${Math.abs(diff).toFixed(1)}% over`
          }).`,
        };
      }
      return { valid: true, message: 'Percentages total 100%.' };
    }

    if (splitMode === 'shares') {
      const totalShares = users.reduce(
        (acc, u) => acc + (parseFloat(shareWeights[u.id] || '0') || 0),
        0
      );
      if (totalShares <= 0) {
        return { valid: false, message: 'Assign at least 1 share weight.' };
      }
      return { valid: true, message: `${totalShares} total shares allocated.` };
    }

    return { valid: true, message: '' };
  }, [
    isSettlement,
    paidByUserId,
    settlementReceiverId,
    numericAmount,
    splitMode,
    selectedUserIds,
    computedSplits,
    currencySymbol,
    users,
    percentages,
    shareWeights,
  ]);

  if (!isOpen) return null;

  const toggleEqualParticipant = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleDistributeExactEqually = () => {
    const eq = computeEqualSplits(numericAmount, users.map((u) => u.id));
    const next: Record<string, string> = {};
    eq.forEach((s) => {
      next[s.userId] = s.amount.toFixed(2);
    });
    setExactAmounts(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const finalTitle =
      isSettlement && !title.trim()
        ? `Settlement: ${users.find((u) => u.id === paidByUserId)?.displayName} → ${
            users.find((u) => u.id === settlementReceiverId)?.displayName
          }`
        : title.trim();

    if (!finalTitle) {
      setError('Please enter a description for this entry.');
      return;
    }

    if (!splitValidation.valid) {
      setError(splitValidation.message || 'Please resolve split allocation issues.');
      return;
    }

    setSubmitting(true);
    try {
      await onSave({
        id: editingExpense?.id,
        title: finalTitle,
        amount: numericAmount,
        category: isSettlement ? 'Settlement' : category,
        paidByUserId,
        date,
        splitMode: isSettlement ? 'exact' : splitMode,
        splits: computedSplits,
        notes,
        isSettlement,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save entry.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {editingExpense
                ? `Edit Entry · Rev #${editingExpense.revision}`
                : isSettlement
                ? 'Record Balance Settlement'
                : 'Log Shared Expense'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {editingExpense
                ? 'All changes are logged with a timestamp and before/after diff.'
                : 'Balances and simplified debts recalculate across all active sessions immediately.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode Switcher (only when creating new) */}
        {!editingExpense && (
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-2.5 flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 mr-2">Entry Type:</span>
            <div className="inline-flex rounded-lg bg-slate-200/80 p-0.5">
              <button
                type="button"
                onClick={() => {
                  setIsSettlement(false);
                  if (category === 'Settlement') setCategory('Groceries');
                  if (title.startsWith('Settlement:')) setTitle('');
                }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  !isSettlement
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Shared Expense
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSettlement(true);
                  setCategory('Settlement');
                  const fromU = users.find((u) => u.id === paidByUserId);
                  const toU = users.find((u) => u.id === settlementReceiverId);
                  setTitle(`Settlement: ${fromU?.displayName} → ${toU?.displayName}`);
                }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  isSettlement
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Direct Settlement
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-5 flex-1">
          {error && (
            <div className="flex items-center gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Top Fields: Title & Amount */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Description
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  isSettlement
                    ? 'e.g., Settlement: Sam → Maya'
                    : 'e.g., Trader Joe’s Groceries, Electric Bill'
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Total Amount ({currencySymbol})
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm font-mono text-slate-500">
                  {currencySymbol}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3.5 py-2 text-sm font-mono tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Second Row: Paid By, Date, Category (or Recipient for Settlement) */}
          {isSettlement ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Paid By (Sender)
                </label>
                <select
                  value={paidByUserId}
                  onChange={(e) => {
                    const nextPayer = e.target.value;
                    setPaidByUserId(nextPayer);
                    const fromU = users.find((u) => u.id === nextPayer);
                    const toU = users.find((u) => u.id === settlementReceiverId);
                    setTitle(`Settlement: ${fromU?.displayName} → ${toU?.displayName}`);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName} (@{u.username})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col items-center justify-center pt-5">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                  <span>Transfers To</span>
                  <ArrowRight className="h-4 w-4 text-slate-700" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Received By (Recipient)
                </label>
                <select
                  value={settlementReceiverId}
                  onChange={(e) => {
                    const nextRec = e.target.value;
                    setSettlementReceiverId(nextRec);
                    const fromU = users.find((u) => u.id === paidByUserId);
                    const toU = users.find((u) => u.id === nextRec);
                    setTitle(`Settlement: ${fromU?.displayName} → ${toU?.displayName}`);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName} (@{u.username})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Paid By
                </label>
                <select
                  value={paidByUserId}
                  onChange={(e) => setPaidByUserId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName} (@{u.username})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Expense Date
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Split Breakdown Section (for non-settlement expenses) */}
          {!isSettlement && (
            <div className="space-y-3 pt-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-800">
                  Split Calculation Method
                </label>
                <div className="inline-flex rounded-lg bg-slate-100 p-1">
                  {(
                    [
                      { id: 'equal', label: 'Equal' },
                      { id: 'exact', label: 'Exact Amounts' },
                      { id: 'percentage', label: 'Percentage (%)' },
                      { id: 'shares', label: 'Shares (Weight)' },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setSplitMode(mode.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        splitMode === mode.id
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Member Split Rows */}
              <div className="rounded-lg border border-slate-200 divide-y divide-slate-200">
                {users.map((u) => {
                  const resolvedSplit = computedSplits.find((s) => s.userId === u.id);
                  const resolvedAmt = resolvedSplit ? resolvedSplit.amount : 0;
                  const isIncludedEqual = selectedUserIds.includes(u.id);

                  return (
                    <div
                      key={u.id}
                      className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-slate-50/80 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {splitMode === 'equal' && (
                          <button
                            type="button"
                            onClick={() => toggleEqualParticipant(u.id)}
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                              isIncludedEqual
                                ? 'border-slate-900 bg-slate-900 text-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isIncludedEqual && <Check className="h-3 w-3" />}
                          </button>
                        )}
                        <div className="truncate">
                          <span className="font-medium text-slate-900">{u.displayName}</span>
                          <span className="text-xs text-slate-500 ml-1.5">· @{u.username}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {splitMode === 'exact' && (
                          <div className="relative w-28">
                            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-xs font-mono text-slate-400">
                              {currencySymbol}
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={exactAmounts[u.id] ?? '0.00'}
                              onChange={(e) =>
                                setExactAmounts((prev) => ({ ...prev, [u.id]: e.target.value }))
                              }
                              className="w-full rounded border border-slate-300 bg-white pl-6 pr-2 py-1 text-right text-xs font-mono tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
                            />
                          </div>
                        )}

                        {splitMode === 'percentage' && (
                          <div className="flex items-center gap-2">
                            <div className="relative w-20">
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                value={percentages[u.id] ?? '0'}
                                onChange={(e) =>
                                  setPercentages((prev) => ({ ...prev, [u.id]: e.target.value }))
                                }
                                className="w-full rounded border border-slate-300 bg-white px-2 pr-5 py-1 text-right text-xs font-mono tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
                              />
                              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-xs font-mono text-slate-400">
                                %
                              </span>
                            </div>
                            <span className="w-20 text-right text-xs font-mono tabular-nums text-slate-600">
                              {currencySymbol}
                              {resolvedAmt.toFixed(2)}
                            </span>
                          </div>
                        )}

                        {splitMode === 'shares' && (
                          <div className="flex items-center gap-2">
                            <div className="relative w-20">
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                value={shareWeights[u.id] ?? '1'}
                                onChange={(e) =>
                                  setShareWeights((prev) => ({ ...prev, [u.id]: e.target.value }))
                                }
                                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-right text-xs font-mono tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
                              />
                            </div>
                            <span className="text-xs text-slate-400">sh</span>
                            <span className="w-20 text-right text-xs font-mono tabular-nums text-slate-600">
                              {currencySymbol}
                              {resolvedAmt.toFixed(2)}
                            </span>
                          </div>
                        )}

                        {splitMode === 'equal' && (
                          <span
                            className={`text-xs font-mono tabular-nums ${
                              resolvedAmt > 0 ? 'font-medium text-slate-900' : 'text-slate-400'
                            }`}
                          >
                            {currencySymbol}
                            {resolvedAmt.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Split Status / Helper Bar */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  {splitMode === 'exact' && numericAmount > 0 && (
                    <button
                      type="button"
                      onClick={handleDistributeExactEqually}
                      className="text-slate-600 underline hover:text-slate-900"
                    >
                      Distribute {currencySymbol}
                      {numericAmount.toFixed(2)} equally
                    </button>
                  )}
                  {splitMode === 'equal' && (
                    <span className="text-slate-500">
                      Splitting across {selectedUserIds.length} of {users.length} members
                    </span>
                  )}
                </div>
                <span
                  className={`font-mono tabular-nums ${
                    splitValidation.valid ? 'text-emerald-700' : 'text-amber-700 font-medium'
                  }`}
                >
                  {splitValidation.message}
                </span>
              </div>
            </div>
          )}

          {/* Notes Field */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Notes / Receipt Reference (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Receipt number, item breakdown, or reason for adjustment..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              {submitting
                ? 'Saving...'
                : editingExpense
                ? 'Save Changes & Log Revision'
                : isSettlement
                ? 'Record Settlement'
                : 'Add Shared Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
