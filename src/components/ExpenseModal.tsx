import React, { useState, useEffect, useMemo } from 'react';
import { X, Check, AlertCircle, ArrowRight } from 'lucide-react';
import {
  UserAccount,
  ExpenseEntry,
  SplitMode,
  ExpenseSplit,
  computeEqualSplits,
  computePercentageSplits,
  roundCents,
} from '../types';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: UserAccount[];
  currentUser: UserAccount;
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
    paidByUserId: string;
    date: string;
    splitMode: SplitMode;
    splits: ExpenseSplit[];
    isSettlement: boolean;
  }) => Promise<void>;
}

export const ExpenseModal: React.FC<ExpenseModalProps> = ({
  isOpen,
  onClose,
  users,
  currentUser,
  editingExpense,
  prefillSettlement,
  onSave,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];

  const [isSettlement, setIsSettlement] = useState(false);
  const [title, setTitle] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [paidByUserId, setPaidByUserId] = useState(currentUser.id);
  const [settlementReceiverId, setSettlementReceiverId] = useState(
    users.find((u) => u.id !== currentUser.id)?.id || currentUser.id
  );
  const [date, setDate] = useState(todayStr);
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');

  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(users.map((u) => u.id));
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [percentages, setPercentages] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);

    if (editingExpense) {
      setIsSettlement(editingExpense.isSettlement);
      setTitle(editingExpense.title);
      setAmountStr(editingExpense.amount.toFixed(2));
      setPaidByUserId(editingExpense.paidByUserId);
      setDate(editingExpense.date);
      setSplitMode(editingExpense.splitMode);

      if (editingExpense.isSettlement && editingExpense.splits[0]) {
        setSettlementReceiverId(editingExpense.splits[0].userId);
      }

      const activeIds = editingExpense.splits.map((s) => s.userId);
      setSelectedUserIds(activeIds.length > 0 ? activeIds : users.map((u) => u.id));

      const initExact: Record<string, string> = {};
      const initPct: Record<string, string> = {};

      users.forEach((u) => {
        const found = editingExpense.splits.find((s) => s.userId === u.id);
        initExact[u.id] = found ? found.amount.toFixed(2) : '0.00';
        initPct[u.id] =
          found && found.shareValue !== undefined
            ? String(found.shareValue)
            : found && editingExpense.amount > 0
            ? String(roundCents((found.amount / editingExpense.amount) * 100))
            : '0';
      });

      setExactAmounts(initExact);
      setPercentages(initPct);
    } else if (prefillSettlement) {
      const fromUser = users.find((u) => u.id === prefillSettlement.fromUserId);
      const toUser = users.find((u) => u.id === prefillSettlement.toUserId);
      setIsSettlement(true);
      setPaidByUserId(prefillSettlement.fromUserId);
      setSettlementReceiverId(prefillSettlement.toUserId);
      setAmountStr(prefillSettlement.amount.toFixed(2));
      setTitle(
        `Settlement: ${fromUser?.displayName || 'User'} → ${toUser?.displayName || 'User'}`
      );
      setDate(todayStr);
      setSplitMode('exact');
    } else {
      setIsSettlement(false);
      setTitle('');
      setAmountStr('');
      setPaidByUserId(currentUser.id);
      const otherUser = users.find((u) => u.id !== currentUser.id);
      setSettlementReceiverId(otherUser ? otherUser.id : currentUser.id);
      setDate(todayStr);
      setSplitMode('equal');
      setSelectedUserIds(users.map((u) => u.id));

      const defaultPct = users.length > 0 ? (100 / users.length).toFixed(1) : '0';
      const initExact: Record<string, string> = {};
      const initPct: Record<string, string> = {};

      users.forEach((u) => {
        initExact[u.id] = '0.00';
        initPct[u.id] = defaultPct;
      });
      setExactAmounts(initExact);
      setPercentages(initPct);
    }
  }, [isOpen, editingExpense, prefillSettlement, users, currentUser.id, todayStr]);

  const numericAmount = useMemo(() => {
    const val = parseFloat(amountStr);
    return isNaN(val) || val < 0 ? 0 : roundCents(val);
  }, [amountStr]);

  const computedSplits = useMemo<ExpenseSplit[]>(() => {
    if (isSettlement) {
      return [{ userId: settlementReceiverId, amount: numericAmount }];
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
    return [];
  }, [
    isSettlement,
    settlementReceiverId,
    numericAmount,
    splitMode,
    selectedUserIds,
    exactAmounts,
    percentages,
    users,
  ]);

  const splitValidation = useMemo(() => {
    if (isSettlement) {
      if (paidByUserId === settlementReceiverId) {
        return { valid: false, message: 'Payer and recipient must be different people.' };
      }
      return { valid: numericAmount > 0, message: '' };
    }

    if (numericAmount <= 0) {
      return { valid: false, message: 'Enter an amount greater than zero.' };
    }

    if (splitMode === 'equal') {
      if (selectedUserIds.length === 0) {
        return { valid: false, message: 'Select at least one person.' };
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
              ? `$${diff.toFixed(2)} left to assign`
              : `Over by $${Math.abs(diff).toFixed(2)}`,
        };
      }
      return { valid: true, message: 'Matches total' };
    }

    if (splitMode === 'percentage') {
      const totalPct = roundCents(
        users.reduce((acc, u) => acc + (parseFloat(percentages[u.id] || '0') || 0), 0)
      );
      const diff = roundCents(100 - totalPct);
      if (Math.abs(diff) > 0.1) {
        return {
          valid: false,
          message: `Total: ${totalPct.toFixed(1)}% (must equal 100%)`,
        };
      }
      return { valid: true, message: '100% allocated' };
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
    users,
    percentages,
  ]);

  if (!isOpen) return null;

  const toggleEqualParticipant = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
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
      setError('Please enter a description.');
      return;
    }

    if (!splitValidation.valid) {
      setError(splitValidation.message || 'Check split amounts.');
      return;
    }

    setSubmitting(true);
    try {
      await onSave({
        id: editingExpense?.id,
        title: finalTitle,
        amount: numericAmount,
        paidByUserId,
        date,
        splitMode: isSettlement ? 'exact' : splitMode,
        splits: computedSplits,
        isSettlement,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            {editingExpense
              ? 'Edit Expense'
              : isSettlement
              ? 'Record Settlement'
              : 'Add Expense'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!editingExpense && users.length > 1 && (
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-2.5 flex items-center gap-2">
            <div className="inline-flex rounded-lg bg-slate-200/80 p-0.5">
              <button
                type="button"
                onClick={() => {
                  setIsSettlement(false);
                  if (title.startsWith('Settlement:')) setTitle('');
                }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  !isSettlement ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Expense
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSettlement(true);
                  const fromU = users.find((u) => u.id === paidByUserId);
                  const toU = users.find((u) => u.id === settlementReceiverId);
                  setTitle(`Settlement: ${fromU?.displayName} → ${toU?.displayName}`);
                }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  isSettlement ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Settle Up
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-4 flex-1">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={isSettlement ? 'Settlement' : 'e.g. Dinner, Hotel, Groceries'}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>
          </div>

          {isSettlement ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 items-center rounded-lg border border-slate-200 bg-slate-50 p-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Paid By</label>
                <select
                  value={paidByUserId}
                  onChange={(e) => {
                    const nextPayer = e.target.value;
                    setPaidByUserId(nextPayer);
                    const fromU = users.find((u) => u.id === nextPayer);
                    const toU = users.find((u) => u.id === settlementReceiverId);
                    setTitle(`Settlement: ${fromU?.displayName} → ${toU?.displayName}`);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-center pt-4">
                <ArrowRight className="h-4 w-4 text-slate-500" />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Paid To</label>
                <select
                  value={settlementReceiverId}
                  onChange={(e) => {
                    const nextRec = e.target.value;
                    setSettlementReceiverId(nextRec);
                    const fromU = users.find((u) => u.id === paidByUserId);
                    const toU = users.find((u) => u.id === nextRec);
                    setTitle(`Settlement: ${fromU?.displayName} → ${toU?.displayName}`);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Paid By</label>
                <select
                  value={paidByUserId}
                  onChange={(e) => setPaidByUserId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Date</label>
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

          {!isSettlement && (
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-700">Split Method</label>
                <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
                  {(
                    [
                      { id: 'equal', label: 'Equal' },
                      { id: 'exact', label: 'Exact' },
                      { id: 'percentage', label: '%' },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setSplitMode(mode.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
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

              <div className="rounded-lg border border-slate-200 divide-y divide-slate-200">
                {users.map((u) => {
                  const resolvedSplit = computedSplits.find((s) => s.userId === u.id);
                  const resolvedAmt = resolvedSplit ? resolvedSplit.amount : 0;
                  const isIncludedEqual = selectedUserIds.includes(u.id);

                  return (
                    <div
                      key={u.id}
                      className="flex items-center justify-between px-3.5 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2.5">
                        {splitMode === 'equal' && (
                          <button
                            type="button"
                            onClick={() => toggleEqualParticipant(u.id)}
                            className={`flex h-4 w-4 items-center justify-center rounded border ${
                              isIncludedEqual
                                ? 'border-slate-900 bg-slate-900 text-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isIncludedEqual && <Check className="h-3 w-3" />}
                          </button>
                        )}
                        <span className="font-medium text-slate-900">{u.displayName}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {splitMode === 'exact' && (
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={exactAmounts[u.id] ?? '0.00'}
                            onChange={(e) =>
                              setExactAmounts((prev) => ({ ...prev, [u.id]: e.target.value }))
                            }
                            className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-xs font-mono tabular-nums"
                          />
                        )}

                        {splitMode === 'percentage' && (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="100"
                              value={percentages[u.id] ?? '0'}
                              onChange={(e) =>
                                setPercentages((prev) => ({ ...prev, [u.id]: e.target.value }))
                              }
                              className="w-16 rounded border border-slate-300 px-2 py-1 text-right text-xs font-mono tabular-nums"
                            />
                            <span className="text-xs text-slate-400">%</span>
                            <span className="w-16 text-right text-xs font-mono tabular-nums text-slate-600">
                              ${resolvedAmt.toFixed(2)}
                            </span>
                          </div>
                        )}

                        {splitMode === 'equal' && (
                          <span className="text-xs font-mono tabular-nums text-slate-700">
                            ${resolvedAmt.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {splitValidation.message && (
                <div className="text-right text-xs font-mono text-slate-500">
                  {splitValidation.message}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
