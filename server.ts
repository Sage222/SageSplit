import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  UserAccount,
  ExpenseEntry,
  AuditLogEntry,
  AuditLogChange,
  WorkspaceSettings,
  PresenceUser,
  roundCents,
} from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'ledger-store.json');

interface PersistedDatabase {
  users: UserAccount[];
  expenses: ExpenseEntry[];
  logs: AuditLogEntry[];
  settings: WorkspaceSettings;
}

function getSeedDatabase(): PersistedDatabase {
  const now = new Date();
  const iso = (minutesAgo: number) =>
    new Date(now.getTime() - minutesAgo * 60 * 1000).toISOString();
  const dateStr = (daysAgo: number) => {
    const d = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    return d.toISOString().split('T')[0];
  };

  const users: UserAccount[] = [
    {
      id: 'usr-admin',
      username: 'admin',
      password: 'password123',
      displayName: 'Alex Rivera',
      role: 'admin',
      avatarColor: '#0F172A',
      createdAt: iso(10080),
      active: true,
    },
    {
      id: 'usr-maya',
      username: 'maya',
      password: 'maya2026',
      displayName: 'Maya Lin',
      role: 'member',
      avatarColor: '#0369A1',
      createdAt: iso(10050),
      active: true,
    },
    {
      id: 'usr-jordan',
      username: 'jordan',
      password: 'jordan2026',
      displayName: 'Jordan Vance',
      role: 'member',
      avatarColor: '#047857',
      createdAt: iso(10020),
      active: true,
    },
    {
      id: 'usr-sam',
      username: 'sam',
      password: 'sam2026',
      displayName: 'Sam Okafor',
      role: 'member',
      avatarColor: '#B45309',
      createdAt: iso(9980),
      active: true,
    },
  ];

  const expenses: ExpenseEntry[] = [
    {
      id: 'exp-101',
      title: 'Monthly Fiber Internet & Static IP',
      amount: 96.0,
      category: 'Utilities',
      paidByUserId: 'usr-admin',
      date: dateStr(6),
      createdAt: iso(8640),
      updatedAt: iso(8640),
      createdByUserId: 'usr-admin',
      updatedByUserId: 'usr-admin',
      splitMode: 'equal',
      splits: [
        { userId: 'usr-admin', amount: 24.0, shareValue: 1 },
        { userId: 'usr-maya', amount: 24.0, shareValue: 1 },
        { userId: 'usr-jordan', amount: 24.0, shareValue: 1 },
        { userId: 'usr-sam', amount: 24.0, shareValue: 1 },
      ],
      notes: 'Municipal 1Gbps fiber line — auto-billed on the 21st',
      isSettlement: false,
      revision: 1,
    },
    {
      id: 'exp-102',
      title: 'Costco Wholesale Pantry & Household Run',
      amount: 214.8,
      category: 'Groceries',
      paidByUserId: 'usr-maya',
      date: dateStr(4),
      createdAt: iso(5760),
      updatedAt: iso(4320),
      createdByUserId: 'usr-maya',
      updatedByUserId: 'usr-admin',
      splitMode: 'equal',
      splits: [
        { userId: 'usr-admin', amount: 53.7, shareValue: 1 },
        { userId: 'usr-maya', amount: 53.7, shareValue: 1 },
        { userId: 'usr-jordan', amount: 53.7, shareValue: 1 },
        { userId: 'usr-sam', amount: 53.7, shareValue: 1 },
      ],
      notes: 'Includes coffee beans, olive oil, paper goods, and detergent (receipt #4491)',
      isSettlement: false,
      revision: 2,
    },
    {
      id: 'exp-103',
      title: 'ConEd Electric & Gas Statement',
      amount: 168.4,
      category: 'Utilities',
      paidByUserId: 'usr-admin',
      date: dateStr(3),
      createdAt: iso(4100),
      updatedAt: iso(4100),
      createdByUserId: 'usr-admin',
      updatedByUserId: 'usr-admin',
      splitMode: 'percentage',
      splits: [
        { userId: 'usr-admin', amount: 50.52, shareValue: 30 },
        { userId: 'usr-maya', amount: 42.1, shareValue: 25 },
        { userId: 'usr-jordan', amount: 42.1, shareValue: 25 },
        { userId: 'usr-sam', amount: 33.68, shareValue: 20 },
      ],
      notes: 'Weighted by room square footage + home office AC usage',
      isSettlement: false,
      revision: 1,
    },
    {
      id: 'exp-104',
      title: 'Friday Thai Dinner & Dumplings',
      amount: 112.5,
      category: 'Dining',
      paidByUserId: 'usr-jordan',
      date: dateStr(2),
      createdAt: iso(2880),
      updatedAt: iso(2880),
      createdByUserId: 'usr-jordan',
      updatedByUserId: 'usr-jordan',
      splitMode: 'exact',
      splits: [
        { userId: 'usr-admin', amount: 32.5 },
        { userId: 'usr-maya', amount: 28.0 },
        { userId: 'usr-jordan', amount: 27.0 },
        { userId: 'usr-sam', amount: 25.0 },
      ],
      notes: 'Soi 44 Kitchen takeout order including tip',
      isSettlement: false,
      revision: 1,
    },
    {
      id: 'exp-105',
      title: 'Settlement: Sam Okafor → Maya Lin',
      amount: 40.0,
      category: 'Settlement',
      paidByUserId: 'usr-sam',
      date: dateStr(1),
      createdAt: iso(1440),
      updatedAt: iso(1440),
      createdByUserId: 'usr-sam',
      updatedByUserId: 'usr-sam',
      splitMode: 'exact',
      splits: [{ userId: 'usr-maya', amount: 40.0 }],
      notes: 'Partial settlement via bank transfer',
      isSettlement: true,
      revision: 1,
    },
    {
      id: 'exp-106',
      title: 'Replacement HEPA Filters & Smart Plugs',
      amount: 64.0,
      category: 'Household',
      paidByUserId: 'usr-maya',
      date: dateStr(0),
      createdAt: iso(185),
      updatedAt: iso(185),
      createdByUserId: 'usr-maya',
      updatedByUserId: 'usr-maya',
      splitMode: 'equal',
      splits: [
        { userId: 'usr-admin', amount: 16.0, shareValue: 1 },
        { userId: 'usr-maya', amount: 16.0, shareValue: 1 },
        { userId: 'usr-jordan', amount: 16.0, shareValue: 1 },
        { userId: 'usr-sam', amount: 16.0, shareValue: 1 },
      ],
      notes: 'Living room air purifier filters (2-pack)',
      isSettlement: false,
      revision: 1,
    },
  ];

  const logs: AuditLogEntry[] = [
    {
      id: 'log-206',
      timestamp: iso(185),
      actorUserId: 'usr-maya',
      actorName: 'Maya Lin',
      actorUsername: 'maya',
      action: 'EXPENSE_CREATED',
      targetId: 'exp-106',
      targetTitle: 'Replacement HEPA Filters & Smart Plugs',
      summary: 'Added expense "Replacement HEPA Filters & Smart Plugs" for $64.00 paid by Maya Lin (equal split across 4 members)',
      changes: [
        { field: 'Amount', before: '—', after: '$64.00' },
        { field: 'Paid By', before: '—', after: 'Maya Lin' },
        { field: 'Split', before: '—', after: 'Equal ($16.00 each)' },
      ],
      snapshotAfter: expenses[5],
    },
    {
      id: 'log-205',
      timestamp: iso(1440),
      actorUserId: 'usr-sam',
      actorName: 'Sam Okafor',
      actorUsername: 'sam',
      action: 'SETTLEMENT_RECORDED',
      targetId: 'exp-105',
      targetTitle: 'Settlement: Sam Okafor → Maya Lin',
      summary: 'Recorded direct settlement payment of $40.00 from Sam Okafor to Maya Lin',
      changes: [
        { field: 'Transfer', before: 'Unsettled', after: 'Sam Okafor paid Maya Lin $40.00' },
      ],
      snapshotAfter: expenses[4],
    },
    {
      id: 'log-204',
      timestamp: iso(2880),
      actorUserId: 'usr-jordan',
      actorName: 'Jordan Vance',
      actorUsername: 'jordan',
      action: 'EXPENSE_CREATED',
      targetId: 'exp-104',
      targetTitle: 'Friday Thai Dinner & Dumplings',
      summary: 'Added expense "Friday Thai Dinner & Dumplings" for $112.50 paid by Jordan Vance (exact split)',
      changes: [
        { field: 'Amount', before: '—', after: '$112.50' },
        { field: 'Paid By', before: '—', after: 'Jordan Vance' },
        { field: 'Split Mode', before: '—', after: 'Exact Amounts' },
      ],
      snapshotAfter: expenses[3],
    },
    {
      id: 'log-203',
      timestamp: iso(4100),
      actorUserId: 'usr-admin',
      actorName: 'Alex Rivera',
      actorUsername: 'admin',
      action: 'EXPENSE_CREATED',
      targetId: 'exp-103',
      targetTitle: 'ConEd Electric & Gas Statement',
      summary: 'Added expense "ConEd Electric & Gas Statement" for $168.40 paid by Alex Rivera (percentage split)',
      changes: [
        { field: 'Amount', before: '—', after: '$168.40' },
        { field: 'Split Mode', before: '—', after: 'Percentage (30% / 25% / 25% / 20%)' },
      ],
      snapshotAfter: expenses[2],
    },
    {
      id: 'log-202',
      timestamp: iso(4320),
      actorUserId: 'usr-admin',
      actorName: 'Alex Rivera',
      actorUsername: 'admin',
      action: 'EXPENSE_EDITED',
      targetId: 'exp-102',
      targetTitle: 'Costco Wholesale Pantry & Household Run',
      summary: 'Edited "Costco Wholesale Pantry & Household Run" (Revision #2): Updated amount after adding detergent receipt',
      changes: [
        { field: 'Amount', before: '$194.00', after: '$214.80' },
        {
          field: 'Member Splits',
          before: 'Alex: $48.50, Maya: $48.50, Jordan: $48.50, Sam: $48.50',
          after: 'Alex: $53.70, Maya: $53.70, Jordan: $53.70, Sam: $53.70',
        },
        {
          field: 'Notes',
          before: 'Includes coffee beans, olive oil, and paper goods',
          after: 'Includes coffee beans, olive oil, paper goods, and detergent (receipt #4491)',
        },
      ],
      snapshotBefore: {
        ...expenses[1],
        amount: 194.0,
        splits: [
          { userId: 'usr-admin', amount: 48.5, shareValue: 1 },
          { userId: 'usr-maya', amount: 48.5, shareValue: 1 },
          { userId: 'usr-jordan', amount: 48.5, shareValue: 1 },
          { userId: 'usr-sam', amount: 48.5, shareValue: 1 },
        ],
        notes: 'Includes coffee beans, olive oil, and paper goods',
        revision: 1,
      },
      snapshotAfter: expenses[1],
    },
    {
      id: 'log-201',
      timestamp: iso(8640),
      actorUserId: 'usr-admin',
      actorName: 'Alex Rivera',
      actorUsername: 'admin',
      action: 'EXPENSE_CREATED',
      targetId: 'exp-101',
      targetTitle: 'Monthly Fiber Internet & Static IP',
      summary: 'Added expense "Monthly Fiber Internet & Static IP" for $96.00 paid by Alex Rivera',
      changes: [
        { field: 'Amount', before: '—', after: '$96.00' },
        { field: 'Paid By', before: '—', after: 'Alex Rivera' },
      ],
      snapshotAfter: expenses[0],
    },
    {
      id: 'log-200',
      timestamp: iso(9980),
      actorUserId: 'usr-admin',
      actorName: 'Alex Rivera',
      actorUsername: 'admin',
      action: 'USER_CREATED',
      targetId: 'usr-sam',
      targetTitle: 'Sam Okafor (@sam)',
      summary: 'Admin Alex Rivera provisioned member account @sam (Sam Okafor)',
      changes: [
        { field: 'Username', before: '—', after: 'sam' },
        { field: 'Role', before: '—', after: 'member' },
      ],
    },
  ];

  const settings: WorkspaceSettings = {
    workspaceName: 'Maple Street Shared Ledger',
    currencyCode: 'USD',
    currencySymbol: '$',
    defaultSplitMode: 'equal',
    allowMembersToEditAll: true,
  };

  return { users, expenses, logs, settings };
}

function loadDatabase(): PersistedDatabase {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedDatabase;
      if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.expenses)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to read ledger-store.json, initializing seed database:', err);
  }
  const seed = getSeedDatabase();
  saveDatabase(seed);
  return seed;
}

function saveDatabase(db: PersistedDatabase): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist ledger-store.json:', err);
  }
}

const db: PersistedDatabase = loadDatabase();

function formatSplitsForDiff(splits: ExpenseEntry['splits'], users: UserAccount[], symbol: string): string {
  const userMap = new Map(users.map((u) => [u.id, u.displayName]));
  return splits
    .map((s) => `${userMap.get(s.userId) || s.userId}: ${symbol}${s.amount.toFixed(2)}`)
    .join(', ');
}

function findUser(userId?: string): UserAccount {
  const found = db.users.find((u) => u.id === userId);
  return (
    found ||
    db.users[0] || {
      id: 'usr-admin',
      username: 'admin',
      displayName: 'Admin',
      role: 'admin',
      avatarColor: '#0F172A',
      createdAt: new Date().toISOString(),
      active: true,
    }
  );
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  const clientPresence = new Map<WebSocket, PresenceUser>();

  function getOnlineUsers(): PresenceUser[] {
    const map = new Map<string, PresenceUser>();
    for (const p of clientPresence.values()) {
      map.set(p.userId, p);
    }
    return Array.from(map.values());
  }

  function broadcastState(eventType = 'state:updated', meta?: Record<string, unknown>) {
    const payload = JSON.stringify({
      type: eventType,
      meta,
      state: {
        users: db.users,
        expenses: db.expenses,
        logs: db.logs,
        settings: db.settings,
        onlineUsers: getOnlineUsers(),
      },
    });

    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  wss.on('connection', (ws) => {
    // Send initial authoritative state immediately upon connection
    ws.send(
      JSON.stringify({
        type: 'state:init',
        state: {
          users: db.users,
          expenses: db.expenses,
          logs: db.logs,
          settings: db.settings,
          onlineUsers: getOnlineUsers(),
        },
      })
    );

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'presence:identify' && msg.userId) {
          const user = db.users.find((u) => u.id === msg.userId);
          if (user) {
            clientPresence.set(ws, {
              userId: user.id,
              username: user.username,
              displayName: user.displayName,
              connectedAt: new Date().toISOString(),
            });
            broadcastState('presence:updated');
          }
        }
      } catch {
        // Ignore malformed socket messages
      }
    });

    ws.on('close', () => {
      if (clientPresence.has(ws)) {
        clientPresence.delete(ws);
        broadcastState('presence:updated');
      }
    });
  });

  // --- REST API ROUTES ---

  // Healthcheck for Docker container & runtime diagnostics
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      container: 'splitdock-ledger',
      uptimeSeconds: Math.floor(process.uptime()),
      storagePath: DATA_FILE,
      counts: {
        users: db.users.length,
        expenses: db.expenses.length,
        logs: db.logs.length,
      },
      timestamp: new Date().toISOString(),
    });
  });

  // Full state fetch
  app.get('/api/state', (_req, res) => {
    res.json({
      users: db.users,
      expenses: db.expenses,
      logs: db.logs,
      settings: db.settings,
      onlineUsers: getOnlineUsers(),
    });
  });

  // Authenticate with username & password
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || typeof username !== 'string') {
      res.status(400).json({ error: 'Username is required.' });
      return;
    }

    const normalized = username.trim().toLowerCase();
    const user = db.users.find((u) => u.username.toLowerCase() === normalized && u.active);

    if (!user || user.password !== password) {
      res.status(401).json({ error: 'Invalid username or password. Check credentials configured by your admin.' });
      return;
    }

    res.json({ user });
  });

  // Create new expense or settlement
  app.post('/api/expenses', (req, res) => {
    const {
      title,
      amount,
      category,
      paidByUserId,
      date,
      splitMode,
      splits,
      notes,
      isSettlement,
      actorUserId,
    } = req.body || {};

    const numAmount = roundCents(Number(amount));
    if (!title || isNaN(numAmount) || numAmount <= 0 || !paidByUserId || !Array.isArray(splits) || splits.length === 0) {
      res.status(400).json({ error: 'Valid title, positive amount, payer, and participant splits are required.' });
      return;
    }

    const actor = findUser(actorUserId);
    const payer = findUser(paidByUserId);
    const nowIso = new Date().toISOString();
    const sym = db.settings.currencySymbol;

    const newExpense: ExpenseEntry = {
      id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: String(title).trim(),
      amount: numAmount,
      category: category || (isSettlement ? 'Settlement' : 'Other'),
      paidByUserId,
      date: date || nowIso.split('T')[0],
      createdAt: nowIso,
      updatedAt: nowIso,
      createdByUserId: actor.id,
      updatedByUserId: actor.id,
      splitMode: splitMode || 'equal',
      splits: splits.map((s: { userId: string; amount: number; shareValue?: number }) => ({
        userId: s.userId,
        amount: roundCents(Number(s.amount)),
        shareValue: s.shareValue !== undefined ? Number(s.shareValue) : undefined,
      })),
      notes: notes ? String(notes).trim() : '',
      isSettlement: Boolean(isSettlement),
      revision: 1,
    };

    db.expenses.unshift(newExpense);

    const logEntry: AuditLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowIso,
      actorUserId: actor.id,
      actorName: actor.displayName,
      actorUsername: actor.username,
      action: newExpense.isSettlement ? 'SETTLEMENT_RECORDED' : 'EXPENSE_CREATED',
      targetId: newExpense.id,
      targetTitle: newExpense.title,
      summary: newExpense.isSettlement
        ? `Recorded settlement transfer of ${sym}${newExpense.amount.toFixed(2)} paid by ${payer.displayName}`
        : `Created expense "${newExpense.title}" (${sym}${newExpense.amount.toFixed(2)}) paid by ${payer.displayName}`,
      changes: [
        { field: 'Amount', before: '—', after: `${sym}${newExpense.amount.toFixed(2)}` },
        { field: 'Paid By', before: '—', after: payer.displayName },
        { field: 'Category', before: '—', after: newExpense.category },
        {
          field: 'Splits',
          before: '—',
          after: formatSplitsForDiff(newExpense.splits, db.users, sym),
        },
      ],
      snapshotAfter: structuredClone(newExpense),
    };

    db.logs.unshift(logEntry);
    saveDatabase(db);
    broadcastState('expense:created', { expenseId: newExpense.id, actorName: actor.displayName });

    res.status(201).json({ expense: newExpense, log: logEntry });
  });

  // Edit existing expense
  app.put('/api/expenses/:id', (req, res) => {
    const { id } = req.params;
    const existingIndex = db.expenses.findIndex((e) => e.id === id);
    if (existingIndex === -1) {
      res.status(404).json({ error: 'Expense entry not found.' });
      return;
    }

    const before = structuredClone(db.expenses[existingIndex]);
    const {
      title,
      amount,
      category,
      paidByUserId,
      date,
      splitMode,
      splits,
      notes,
      actorUserId,
    } = req.body || {};

    const actor = findUser(actorUserId);
    const sym = db.settings.currencySymbol;
    const nowIso = new Date().toISOString();

    const updatedAmount = amount !== undefined ? roundCents(Number(amount)) : before.amount;
    if (isNaN(updatedAmount) || updatedAmount <= 0) {
      res.status(400).json({ error: 'Amount must be greater than zero.' });
      return;
    }

    const updated: ExpenseEntry = {
      ...before,
      title: title !== undefined ? String(title).trim() : before.title,
      amount: updatedAmount,
      category: category !== undefined ? category : before.category,
      paidByUserId: paidByUserId !== undefined ? paidByUserId : before.paidByUserId,
      date: date !== undefined ? date : before.date,
      splitMode: splitMode !== undefined ? splitMode : before.splitMode,
      splits: Array.isArray(splits)
        ? splits.map((s: { userId: string; amount: number; shareValue?: number }) => ({
            userId: s.userId,
            amount: roundCents(Number(s.amount)),
            shareValue: s.shareValue !== undefined ? Number(s.shareValue) : undefined,
          }))
        : before.splits,
      notes: notes !== undefined ? String(notes).trim() : before.notes,
      updatedAt: nowIso,
      updatedByUserId: actor.id,
      revision: (before.revision || 1) + 1,
    };

    // Compute exact diff for audit log
    const changes: AuditLogChange[] = [];
    if (before.title !== updated.title) {
      changes.push({ field: 'Title', before: before.title, after: updated.title });
    }
    if (before.amount !== updated.amount) {
      changes.push({
        field: 'Amount',
        before: `${sym}${before.amount.toFixed(2)}`,
        after: `${sym}${updated.amount.toFixed(2)}`,
      });
    }
    if (before.paidByUserId !== updated.paidByUserId) {
      changes.push({
        field: 'Paid By',
        before: findUser(before.paidByUserId).displayName,
        after: findUser(updated.paidByUserId).displayName,
      });
    }
    if (before.category !== updated.category) {
      changes.push({ field: 'Category', before: before.category, after: updated.category });
    }
    if (before.date !== updated.date) {
      changes.push({ field: 'Expense Date', before: before.date, after: updated.date });
    }
    if (before.splitMode !== updated.splitMode) {
      changes.push({ field: 'Split Mode', before: before.splitMode, after: updated.splitMode });
    }

    const beforeSplitsStr = formatSplitsForDiff(before.splits, db.users, sym);
    const afterSplitsStr = formatSplitsForDiff(updated.splits, db.users, sym);
    if (beforeSplitsStr !== afterSplitsStr) {
      changes.push({
        field: 'Member Splits',
        before: beforeSplitsStr,
        after: afterSplitsStr,
      });
    }

    if (before.notes !== updated.notes) {
      changes.push({
        field: 'Notes',
        before: before.notes || '(empty)',
        after: updated.notes || '(empty)',
      });
    }

    if (changes.length === 0) {
      res.json({ expense: before, message: 'No fields changed.' });
      return;
    }

    db.expenses[existingIndex] = updated;

    const changedFieldsList = changes.map((c) => c.field).join(', ');
    const logEntry: AuditLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowIso,
      actorUserId: actor.id,
      actorName: actor.displayName,
      actorUsername: actor.username,
      action: 'EXPENSE_EDITED',
      targetId: updated.id,
      targetTitle: updated.title,
      summary: `Edited "${updated.title}" (Rev #${updated.revision}) — modified ${changedFieldsList}`,
      changes,
      snapshotBefore: before,
      snapshotAfter: structuredClone(updated),
    };

    db.logs.unshift(logEntry);
    saveDatabase(db);
    broadcastState('expense:updated', { expenseId: updated.id, actorName: actor.displayName });

    res.json({ expense: updated, log: logEntry });
  });

  // Delete expense
  app.delete('/api/expenses/:id', (req, res) => {
    const { id } = req.params;
    const actorUserId = (req.query.actorUserId as string) || req.body?.actorUserId;
    const existingIndex = db.expenses.findIndex((e) => e.id === id);

    if (existingIndex === -1) {
      res.status(404).json({ error: 'Expense entry not found.' });
      return;
    }

    const removed = structuredClone(db.expenses[existingIndex]);
    const actor = findUser(actorUserId);
    const sym = db.settings.currencySymbol;
    const nowIso = new Date().toISOString();

    db.expenses.splice(existingIndex, 1);

    const logEntry: AuditLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowIso,
      actorUserId: actor.id,
      actorName: actor.displayName,
      actorUsername: actor.username,
      action: 'EXPENSE_DELETED',
      targetId: removed.id,
      targetTitle: removed.title,
      summary: `Deleted "${removed.title}" (${sym}${removed.amount.toFixed(2)} paid by ${findUser(removed.paidByUserId).displayName})`,
      changes: [
        { field: 'Status', before: 'Active in Ledger', after: 'Deleted' },
        { field: 'Amount', before: `${sym}${removed.amount.toFixed(2)}`, after: '$0.00' },
      ],
      snapshotBefore: removed,
    };

    db.logs.unshift(logEntry);
    saveDatabase(db);
    broadcastState('expense:deleted', { expenseId: removed.id, actorName: actor.displayName });

    res.json({ deletedId: removed.id, log: logEntry });
  });

  // Restore / Revert an expense from an Audit Log entry
  app.post('/api/logs/:logId/restore', (req, res) => {
    const { logId } = req.params;
    const { actorUserId } = req.body || {};
    const logItem = db.logs.find((l) => l.id === logId);

    if (!logItem || !logItem.snapshotBefore) {
      res.status(400).json({ error: 'This log entry does not contain a restorable snapshot.' });
      return;
    }

    const actor = findUser(actorUserId);
    const nowIso = new Date().toISOString();
    const sym = db.settings.currencySymbol;
    const snapshot = structuredClone(logItem.snapshotBefore);

    const existingIdx = db.expenses.findIndex((e) => e.id === snapshot.id);
    const restoredExpense: ExpenseEntry = {
      ...snapshot,
      updatedAt: nowIso,
      updatedByUserId: actor.id,
      revision: (existingIdx !== -1 ? db.expenses[existingIdx].revision : snapshot.revision) + 1,
    };

    if (existingIdx !== -1) {
      db.expenses[existingIdx] = restoredExpense;
    } else {
      db.expenses.unshift(restoredExpense);
    }

    const restoreLog: AuditLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowIso,
      actorUserId: actor.id,
      actorName: actor.displayName,
      actorUsername: actor.username,
      action: 'EXPENSE_RESTORED',
      targetId: restoredExpense.id,
      targetTitle: restoredExpense.title,
      summary: `Restored "${restoredExpense.title}" to snapshot state (${sym}${restoredExpense.amount.toFixed(2)})`,
      changes: [
        {
          field: 'Restored State',
          before: logItem.action === 'EXPENSE_DELETED' ? 'Deleted' : 'Modified Revision',
          after: `${sym}${restoredExpense.amount.toFixed(2)} (Rev #${restoredExpense.revision})`,
        },
      ],
      snapshotAfter: structuredClone(restoredExpense),
    };

    db.logs.unshift(restoreLog);
    saveDatabase(db);
    broadcastState('expense:restored', { expenseId: restoredExpense.id });

    res.json({ expense: restoredExpense, log: restoreLog });
  });

  // Admin: Create new user with username & password
  app.post('/api/users', (req, res) => {
    const { username, password, displayName, role, avatarColor, actorUserId } = req.body || {};
    const actor = findUser(actorUserId);

    if (actor.role !== 'admin') {
      res.status(403).json({ error: 'Only admin accounts can create user credentials.' });
      return;
    }

    const cleanUsername = String(username || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '');
    const cleanDisplayName = String(displayName || '').trim();
    const cleanPassword = String(password || '').trim();

    if (!cleanUsername || !cleanDisplayName || !cleanPassword) {
      res.status(400).json({ error: 'Display name, username, and password are required.' });
      return;
    }

    if (db.users.some((u) => u.username.toLowerCase() === cleanUsername)) {
      res.status(409).json({ error: `Username "@${cleanUsername}" is already taken.` });
      return;
    }

    const nowIso = new Date().toISOString();
    const newUser: UserAccount = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      username: cleanUsername,
      password: cleanPassword,
      displayName: cleanDisplayName,
      role: role === 'admin' ? 'admin' : 'member',
      avatarColor: avatarColor || '#0F172A',
      createdAt: nowIso,
      active: true,
    };

    db.users.push(newUser);

    const logEntry: AuditLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowIso,
      actorUserId: actor.id,
      actorName: actor.displayName,
      actorUsername: actor.username,
      action: 'USER_CREATED',
      targetId: newUser.id,
      targetTitle: `${newUser.displayName} (@${newUser.username})`,
      summary: `Admin ${actor.displayName} created account @${newUser.username} (${newUser.displayName}) with role "${newUser.role}"`,
      changes: [
        { field: 'Display Name', before: '—', after: newUser.displayName },
        { field: 'Username', before: '—', after: `@${newUser.username}` },
        { field: 'Role', before: '—', after: newUser.role },
      ],
    };

    db.logs.unshift(logEntry);
    saveDatabase(db);
    broadcastState('user:created', { userId: newUser.id });

    res.status(201).json({ user: newUser, log: logEntry });
  });

  // Admin: Update user profile, username, role, or password
  app.put('/api/users/:id', (req, res) => {
    const { id } = req.params;
    const { username, password, displayName, role, avatarColor, actorUserId } = req.body || {};
    const actor = findUser(actorUserId);

    if (actor.role !== 'admin') {
      res.status(403).json({ error: 'Only admin accounts can modify user accounts and passwords.' });
      return;
    }

    const userIdx = db.users.findIndex((u) => u.id === id);
    if (userIdx === -1) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const before = structuredClone(db.users[userIdx]);
    const cleanUsername =
      username !== undefined
        ? String(username)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9._-]/g, '')
        : before.username;

    if (
      cleanUsername !== before.username &&
      db.users.some((u) => u.id !== id && u.username.toLowerCase() === cleanUsername)
    ) {
      res.status(409).json({ error: `Username "@${cleanUsername}" is already in use.` });
      return;
    }

    // Prevent demoting the last admin
    if (before.role === 'admin' && role === 'member') {
      const adminCount = db.users.filter((u) => u.role === 'admin' && u.active).length;
      if (adminCount <= 1) {
        res.status(400).json({ error: 'At least one admin account must remain active.' });
        return;
      }
    }

    const updated: UserAccount = {
      ...before,
      username: cleanUsername || before.username,
      displayName: displayName !== undefined ? String(displayName).trim() || before.displayName : before.displayName,
      password: password !== undefined && String(password).trim() !== '' ? String(password).trim() : before.password,
      role: role === 'admin' || role === 'member' ? role : before.role,
      avatarColor: avatarColor || before.avatarColor,
    };

    const changes: AuditLogChange[] = [];
    let isPasswordChange = false;

    if (before.displayName !== updated.displayName) {
      changes.push({ field: 'Display Name', before: before.displayName, after: updated.displayName });
    }
    if (before.username !== updated.username) {
      changes.push({ field: 'Username', before: `@${before.username}`, after: `@${updated.username}` });
    }
    if (before.role !== updated.role) {
      changes.push({ field: 'Role', before: before.role, after: updated.role });
    }
    if (before.password !== updated.password) {
      isPasswordChange = true;
      changes.push({ field: 'Password', before: '••••••••', after: 'Updated by Admin' });
    }

    db.users[userIdx] = updated;
    const nowIso = new Date().toISOString();

    if (changes.length > 0) {
      const logEntry: AuditLogEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: nowIso,
        actorUserId: actor.id,
        actorName: actor.displayName,
        actorUsername: actor.username,
        action: isPasswordChange && changes.length === 1 ? 'PASSWORD_UPDATED' : 'USER_UPDATED',
        targetId: updated.id,
        targetTitle: `${updated.displayName} (@${updated.username})`,
        summary: `Admin ${actor.displayName} updated account @${updated.username} (${changes.map((c) => c.field).join(', ')})`,
        changes,
      };
      db.logs.unshift(logEntry);
    }

    saveDatabase(db);
    broadcastState('user:updated', { userId: updated.id });

    res.json({ user: updated });
  });

  // Admin: Delete user account
  app.delete('/api/users/:id', (req, res) => {
    const { id } = req.params;
    const actorUserId = (req.query.actorUserId as string) || req.body?.actorUserId;
    const actor = findUser(actorUserId);

    if (actor.role !== 'admin') {
      res.status(403).json({ error: 'Only admin accounts can remove users.' });
      return;
    }

    const target = db.users.find((u) => u.id === id);
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    if (target.role === 'admin') {
      const adminCount = db.users.filter((u) => u.role === 'admin' && u.active).length;
      if (adminCount <= 1) {
        res.status(400).json({ error: 'Cannot delete the sole remaining admin account.' });
        return;
      }
    }

    db.users = db.users.filter((u) => u.id !== id);
    const nowIso = new Date().toISOString();

    const logEntry: AuditLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowIso,
      actorUserId: actor.id,
      actorName: actor.displayName,
      actorUsername: actor.username,
      action: 'USER_DELETED',
      targetId: target.id,
      targetTitle: `${target.displayName} (@${target.username})`,
      summary: `Admin ${actor.displayName} removed user account @${target.username} (${target.displayName})`,
      changes: [
        { field: 'Account Status', before: 'Active', after: 'Removed' },
      ],
    };

    db.logs.unshift(logEntry);
    saveDatabase(db);
    broadcastState('user:deleted', { userId: target.id });

    res.json({ deletedId: target.id });
  });

  // Admin: Update Workspace Settings
  app.put('/api/settings', (req, res) => {
    const { workspaceName, currencyCode, currencySymbol, defaultSplitMode, allowMembersToEditAll, actorUserId } =
      req.body || {};
    const actor = findUser(actorUserId);

    if (actor.role !== 'admin') {
      res.status(403).json({ error: 'Only admin accounts can update workspace settings.' });
      return;
    }

    const before = structuredClone(db.settings);
    const updated: WorkspaceSettings = {
      workspaceName: workspaceName !== undefined ? String(workspaceName).trim() || before.workspaceName : before.workspaceName,
      currencyCode: currencyCode || before.currencyCode,
      currencySymbol: currencySymbol || before.currencySymbol,
      defaultSplitMode: defaultSplitMode || before.defaultSplitMode,
      allowMembersToEditAll:
        allowMembersToEditAll !== undefined ? Boolean(allowMembersToEditAll) : before.allowMembersToEditAll,
    };

    const changes: AuditLogChange[] = [];
    if (before.workspaceName !== updated.workspaceName) {
      changes.push({ field: 'Workspace Name', before: before.workspaceName, after: updated.workspaceName });
    }
    if (before.currencyCode !== updated.currencyCode) {
      changes.push({
        field: 'Currency',
        before: `${before.currencyCode} (${before.currencySymbol})`,
        after: `${updated.currencyCode} (${updated.currencySymbol})`,
      });
    }
    if (before.defaultSplitMode !== updated.defaultSplitMode) {
      changes.push({ field: 'Default Split Mode', before: before.defaultSplitMode, after: updated.defaultSplitMode });
    }
    if (before.allowMembersToEditAll !== updated.allowMembersToEditAll) {
      changes.push({
        field: 'Member Edit Policy',
        before: before.allowMembersToEditAll ? 'All members can edit any entry' : 'Creator & Admin only',
        after: updated.allowMembersToEditAll ? 'All members can edit any entry' : 'Creator & Admin only',
      });
    }

    db.settings = updated;
    if (changes.length > 0) {
      db.logs.unshift({
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        actorUserId: actor.id,
        actorName: actor.displayName,
        actorUsername: actor.username,
        action: 'SETTINGS_UPDATED',
        targetId: 'workspace-settings',
        targetTitle: 'Workspace Configuration',
        summary: `Admin ${actor.displayName} updated workspace settings (${changes.map((c) => c.field).join(', ')})`,
        changes,
      });
    }

    saveDatabase(db);
    broadcastState('settings:updated');
    res.json({ settings: db.settings });
  });

  // Reset to clean sample state or import JSON snapshot
  app.post('/api/admin/reset', (req, res) => {
    const { actorUserId } = req.body || {};
    const actor = findUser(actorUserId);
    if (actor.role !== 'admin') {
      res.status(403).json({ error: 'Only admin accounts can reset ledger data.' });
      return;
    }
    const seed = getSeedDatabase();
    db.users = seed.users;
    db.expenses = seed.expenses;
    db.logs = seed.logs;
    db.settings = seed.settings;
    saveDatabase(db);
    broadcastState('state:reset');
    res.json({ ok: true });
  });

  // Vite middleware in development, static files in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`SplitDock server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
