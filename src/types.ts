export type UserRole = 'admin' | 'member';

export interface UserAccount {
  id: string;
  username: string;
  password?: string;
  displayName: string;
  role: UserRole;
  avatarColor: string;
  createdAt: string;
  active: boolean;
}

export type SplitMode = 'equal' | 'exact' | 'percentage' | 'shares';

export type ExpenseCategory =
  | 'Groceries'
  | 'Utilities'
  | 'Rent & Housing'
  | 'Dining'
  | 'Travel'
  | 'Household'
  | 'Settlement'
  | 'Other';

export interface ExpenseSplit {
  userId: string;
  amount: number; // Resolved currency amount (2 decimal places)
  shareValue?: number; // Raw percentage or share weight
}

export interface ExpenseEntry {
  id: string;
  title: string;
  amount: number;
  category: ExpenseCategory;
  paidByUserId: string;
  date: string; // YYYY-MM-DD
  createdAt: string; // Full ISO timestamp
  updatedAt: string; // Full ISO timestamp
  createdByUserId: string;
  updatedByUserId: string;
  splitMode: SplitMode;
  splits: ExpenseSplit[];
  notes: string;
  isSettlement: boolean;
  revision: number;
}

export type AuditActionType =
  | 'EXPENSE_CREATED'
  | 'EXPENSE_EDITED'
  | 'EXPENSE_DELETED'
  | 'SETTLEMENT_RECORDED'
  | 'EXPENSE_RESTORED'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'PASSWORD_UPDATED'
  | 'USER_DELETED'
  | 'SETTINGS_UPDATED';

export interface AuditLogChange {
  field: string;
  before: string;
  after: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string; // Full ISO timestamp
  actorUserId: string;
  actorName: string;
  actorUsername: string;
  action: AuditActionType;
  targetId: string;
  targetTitle: string;
  summary: string;
  changes: AuditLogChange[];
  snapshotBefore?: ExpenseEntry;
  snapshotAfter?: ExpenseEntry;
}

export interface WorkspaceSettings {
  workspaceName: string;
  currencyCode: string;
  currencySymbol: string;
  defaultSplitMode: SplitMode;
  allowMembersToEditAll: boolean;
}

export interface UserBalanceSummary {
  userId: string;
  totalExpensesPaid: number; // Excluding settlement transfers
  totalExpenseShare: number; // Excluding settlement transfers
  settlementsPaid: number;
  settlementsReceived: number;
  netBalance: number; // Positive = is owed money, Negative = owes money
}

export interface SettlementTransfer {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

export interface PresenceUser {
  userId: string;
  username: string;
  displayName: string;
  connectedAt: string;
}

export interface LedgerStatePayload {
  users: UserAccount[];
  expenses: ExpenseEntry[];
  logs: AuditLogEntry[];
  settings: WorkspaceSettings;
  onlineUsers: PresenceUser[];
}

export function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function computeEqualSplits(totalAmount: number, participantUserIds: string[]): ExpenseSplit[] {
  if (participantUserIds.length === 0) return [];
  const totalCents = Math.round(totalAmount * 100);
  const count = participantUserIds.length;
  const baseCents = Math.floor(totalCents / count);
  const remainderCents = totalCents - baseCents * count;

  return participantUserIds.map((userId, index) => {
    const cents = baseCents + (index < remainderCents ? 1 : 0);
    return {
      userId,
      amount: cents / 100,
      shareValue: 1,
    };
  });
}

export function computePercentageSplits(
  totalAmount: number,
  percentages: { userId: string; percent: number }[]
): ExpenseSplit[] {
  const active = percentages.filter((p) => p.percent > 0);
  if (active.length === 0) return [];
  const totalCents = Math.round(totalAmount * 100);
  let allocatedCents = 0;

  return active.map((item, idx) => {
    if (idx === active.length - 1) {
      const remaining = totalCents - allocatedCents;
      return {
        userId: item.userId,
        amount: remaining / 100,
        shareValue: item.percent,
      };
    }
    const cents = Math.round((totalCents * item.percent) / 100);
    allocatedCents += cents;
    return {
      userId: item.userId,
      amount: cents / 100,
      shareValue: item.percent,
    };
  });
}

export function computeShareWeightSplits(
  totalAmount: number,
  shares: { userId: string; weight: number }[]
): ExpenseSplit[] {
  const active = shares.filter((s) => s.weight > 0);
  if (active.length === 0) return [];
  const totalWeight = active.reduce((acc, item) => acc + item.weight, 0);
  if (totalWeight <= 0) return [];

  const totalCents = Math.round(totalAmount * 100);
  let allocatedCents = 0;

  return active.map((item, idx) => {
    if (idx === active.length - 1) {
      const remaining = totalCents - allocatedCents;
      return {
        userId: item.userId,
        amount: remaining / 100,
        shareValue: item.weight,
      };
    }
    const cents = Math.round((totalCents * item.weight) / totalWeight);
    allocatedCents += cents;
    return {
      userId: item.userId,
      amount: cents / 100,
      shareValue: item.weight,
    };
  });
}

export function calculateRealTimeBalances(
  users: UserAccount[],
  expenses: ExpenseEntry[]
): {
  summaries: Record<string, UserBalanceSummary>;
  transfers: SettlementTransfer[];
  totalGroupSpend: number;
  totalUnsettledDebt: number;
} {
  const summaries: Record<string, UserBalanceSummary> = {};

  for (const user of users) {
    summaries[user.id] = {
      userId: user.id,
      totalExpensesPaid: 0,
      totalExpenseShare: 0,
      settlementsPaid: 0,
      settlementsReceived: 0,
      netBalance: 0,
    };
  }

  let totalGroupSpend = 0;

  for (const exp of expenses) {
    // Ensure payer exists in map even if user was later archived
    if (!summaries[exp.paidByUserId]) {
      summaries[exp.paidByUserId] = {
        userId: exp.paidByUserId,
        totalExpensesPaid: 0,
        totalExpenseShare: 0,
        settlementsPaid: 0,
        settlementsReceived: 0,
        netBalance: 0,
      };
    }

    if (exp.isSettlement) {
      summaries[exp.paidByUserId].settlementsPaid = roundCents(
        summaries[exp.paidByUserId].settlementsPaid + exp.amount
      );
      summaries[exp.paidByUserId].netBalance = roundCents(
        summaries[exp.paidByUserId].netBalance + exp.amount
      );

      for (const split of exp.splits) {
        if (!summaries[split.userId]) {
          summaries[split.userId] = {
            userId: split.userId,
            totalExpensesPaid: 0,
            totalExpenseShare: 0,
            settlementsPaid: 0,
            settlementsReceived: 0,
            netBalance: 0,
          };
        }
        summaries[split.userId].settlementsReceived = roundCents(
          summaries[split.userId].settlementsReceived + split.amount
        );
        summaries[split.userId].netBalance = roundCents(
          summaries[split.userId].netBalance - split.amount
        );
      }
    } else {
      totalGroupSpend = roundCents(totalGroupSpend + exp.amount);
      summaries[exp.paidByUserId].totalExpensesPaid = roundCents(
        summaries[exp.paidByUserId].totalExpensesPaid + exp.amount
      );
      summaries[exp.paidByUserId].netBalance = roundCents(
        summaries[exp.paidByUserId].netBalance + exp.amount
      );

      for (const split of exp.splits) {
        if (!summaries[split.userId]) {
          summaries[split.userId] = {
            userId: split.userId,
            totalExpensesPaid: 0,
            totalExpenseShare: 0,
            settlementsPaid: 0,
            settlementsReceived: 0,
            netBalance: 0,
          };
        }
        summaries[split.userId].totalExpenseShare = roundCents(
          summaries[split.userId].totalExpenseShare + split.amount
        );
        summaries[split.userId].netBalance = roundCents(
          summaries[split.userId].netBalance - split.amount
        );
      }
    }
  }

  // Greedy minimum-transfer debt simplification in integer cents
  const debtors: { userId: string; cents: number }[] = [];
  const creditors: { userId: string; cents: number }[] = [];

  Object.values(summaries).forEach((s) => {
    const cents = Math.round(s.netBalance * 100);
    if (cents < -1) {
      debtors.push({ userId: s.userId, cents: -cents });
    } else if (cents > 1) {
      creditors.push({ userId: s.userId, cents });
    }
  });

  debtors.sort((a, b) => b.cents - a.cents);
  creditors.sort((a, b) => b.cents - a.cents);

  const transfers: SettlementTransfer[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const settledCents = Math.min(debtor.cents, creditor.cents);

    if (settledCents > 0) {
      transfers.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        amount: settledCents / 100,
      });
    }

    debtor.cents -= settledCents;
    creditor.cents -= settledCents;

    if (debtor.cents === 0) i++;
    if (creditor.cents === 0) j++;
  }

  const totalUnsettledDebt = roundCents(
    transfers.reduce((acc, t) => acc + t.amount, 0)
  );

  return {
    summaries,
    transfers,
    totalGroupSpend,
    totalUnsettledDebt,
  };
}
