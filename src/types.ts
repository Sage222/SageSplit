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

export interface ExpenseGroup {
  id: string;
  name: string;
  memberUserIds: string[];
  createdAt: string;
  createdByUserId: string;
}

export type SplitMode = 'equal' | 'exact' | 'percentage';

export interface ExpenseSplit {
  userId: string;
  amount: number;
  shareValue?: number;
}

export interface ExpenseEntry {
  id: string;
  groupId: string;
  title: string;
  amount: number;
  paidByUserId: string;
  date: string; // YYYY-MM-DD
  createdAt: string; // Full ISO timestamp
  updatedAt: string; // Full ISO timestamp
  createdByUserId: string;
  updatedByUserId: string;
  splitMode: SplitMode;
  splits: ExpenseSplit[];
  isSettlement: boolean;
  revision: number;
}

export type AuditActionType =
  | 'EXPENSE_CREATED'
  | 'EXPENSE_EDITED'
  | 'EXPENSE_DELETED'
  | 'SETTLEMENT_RECORDED'
  | 'GROUP_CREATED'
  | 'GROUP_UPDATED'
  | 'GROUP_DELETED'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'PASSWORD_UPDATED'
  | 'USER_DELETED';

export interface AuditLogChange {
  field: string;
  before: string;
  after: string;
}

export interface AuditLogEntry {
  id: string;
  groupId?: string;
  timestamp: string;
  actorUserId: string;
  actorName: string;
  actorUsername: string;
  action: AuditActionType;
  targetId: string;
  targetTitle: string;
  summary: string;
  changes: AuditLogChange[];
}

export interface UserBalanceSummary {
  userId: string;
  totalExpensesPaid: number;
  totalExpenseShare: number;
  settlementsPaid: number;
  settlementsReceived: number;
  netBalance: number;
}

export interface SettlementTransfer {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

export interface LedgerStatePayload {
  users: UserAccount[];
  groups: ExpenseGroup[];
  expenses: ExpenseEntry[];
  logs: AuditLogEntry[];
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

export function calculateRealTimeBalances(
  users: UserAccount[],
  expenses: ExpenseEntry[]
): {
  summaries: Record<string, UserBalanceSummary>;
  transfers: SettlementTransfer[];
  totalGroupSpend: number;
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

  return {
    summaries,
    transfers,
    totalGroupSpend,
  };
}
