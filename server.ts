import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  UserAccount,
  ExpenseGroup,
  ExpenseEntry,
  AuditLogEntry,
  AuditLogChange,
  roundCents,
} from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'ledger-store.json');

interface PersistedDatabase {
  users: UserAccount[];
  groups: ExpenseGroup[];
  expenses: ExpenseEntry[];
  logs: AuditLogEntry[];
}

function getSeedDatabase(): PersistedDatabase {
  const nowIso = new Date().toISOString();

  // Only the initial Admin account is created so the app starts completely clean
  const users: UserAccount[] = [
    {
      id: 'usr-admin',
      username: 'admin',
      password: 'password123',
      displayName: 'Admin',
      role: 'admin',
      avatarColor: '#0F172A',
      createdAt: nowIso,
      active: true,
    },
  ];

  return {
    users,
    groups: [],
    expenses: [],
    logs: [],
  };
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
        return {
          users: parsed.users,
          groups: Array.isArray(parsed.groups) ? parsed.groups : [],
          expenses: parsed.expenses,
          logs: Array.isArray(parsed.logs) ? parsed.logs : [],
        };
      }
    }
  } catch (err) {
    console.error('Failed to read ledger-store.json, initializing clean database:', err);
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

function formatSplitsForDiff(splits: ExpenseEntry['splits'], users: UserAccount[]): string {
  const userMap = new Map(users.map((u) => [u.id, u.displayName]));
  return splits
    .map((s) => `${userMap.get(s.userId) || s.userId}: $${s.amount.toFixed(2)}`)
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

  function broadcastState(eventType = 'state:updated') {
    const payload = JSON.stringify({
      type: eventType,
      state: {
        users: db.users,
        groups: db.groups,
        expenses: db.expenses,
        logs: db.logs,
      },
    });

    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  wss.on('connection', (ws) => {
    ws.send(
      JSON.stringify({
        type: 'state:init',
        state: {
          users: db.users,
          groups: db.groups,
          expenses: db.expenses,
          logs: db.logs,
        },
      })
    );
  });

  // Healthcheck for Docker
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      container: 'sagesplit',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // Full state fetch
  app.get('/api/state', (_req, res) => {
    res.json({
      users: db.users,
      groups: db.groups,
      expenses: db.expenses,
      logs: db.logs,
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
      res.status(401).json({ error: 'Invalid username or password.' });
      return;
    }

    res.json({ user });
  });

  // Create new Expense Group (e.g. for a holiday or trip)
  app.post('/api/groups', (req, res) => {
    const { name, actorUserId } = req.body || {};
    const cleanName = String(name || '').trim();
    if (!cleanName) {
      res.status(400).json({ error: 'Group name is required.' });
      return;
    }

    const actor = findUser(actorUserId);
    const nowIso = new Date().toISOString();

    const newGroup: ExpenseGroup = {
      id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      createdAt: nowIso,
      createdByUserId: actor.id,
    };

    db.groups.push(newGroup);

    db.logs.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      groupId: newGroup.id,
      timestamp: nowIso,
      actorUserId: actor.id,
      actorName: actor.displayName,
      actorUsername: actor.username,
      action: 'GROUP_CREATED',
      targetId: newGroup.id,
      targetTitle: newGroup.name,
      summary: `Created expense group "${newGroup.name}"`,
      changes: [{ field: 'Group Name', before: '—', after: newGroup.name }],
    });

    saveDatabase(db);
    broadcastState('group:created');
    res.status(201).json({ group: newGroup });
  });

  // Delete Expense Group
  app.delete('/api/groups/:id', (req, res) => {
    const { id } = req.params;
    const actorUserId = (req.query.actorUserId as string) || req.body?.actorUserId;
    const actor = findUser(actorUserId);

    const group = db.groups.find((g) => g.id === id);
    if (!group) {
      res.status(404).json({ error: 'Group not found.' });
      return;
    }

    db.groups = db.groups.filter((g) => g.id !== id);
    db.expenses = db.expenses.filter((e) => e.groupId !== id);

    db.logs.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      groupId: id,
      timestamp: new Date().toISOString(),
      actorUserId: actor.id,
      actorName: actor.displayName,
      actorUsername: actor.username,
      action: 'GROUP_DELETED',
      targetId: id,
      targetTitle: group.name,
      summary: `Deleted expense group "${group.name}"`,
      changes: [{ field: 'Status', before: 'Active', after: 'Deleted' }],
    });

    saveDatabase(db);
    broadcastState('group:deleted');
    res.json({ deletedId: id });
  });

  // Create new expense or settlement
  app.post('/api/expenses', (req, res) => {
    const {
      groupId,
      title,
      amount,
      paidByUserId,
      date,
      splitMode,
      splits,
      isSettlement,
      actorUserId,
    } = req.body || {};

    const numAmount = roundCents(Number(amount));
    if (
      !groupId ||
      !title ||
      isNaN(numAmount) ||
      numAmount <= 0 ||
      !paidByUserId ||
      !Array.isArray(splits) ||
      splits.length === 0
    ) {
      res
        .status(400)
        .json({ error: 'Group, title, positive amount, payer, and splits are required.' });
      return;
    }

    const actor = findUser(actorUserId);
    const payer = findUser(paidByUserId);
    const nowIso = new Date().toISOString();

    const newExpense: ExpenseEntry = {
      id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      groupId,
      title: String(title).trim(),
      amount: numAmount,
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
      isSettlement: Boolean(isSettlement),
      revision: 1,
    };

    db.expenses.unshift(newExpense);

    const logEntry: AuditLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      groupId,
      timestamp: nowIso,
      actorUserId: actor.id,
      actorName: actor.displayName,
      actorUsername: actor.username,
      action: newExpense.isSettlement ? 'SETTLEMENT_RECORDED' : 'EXPENSE_CREATED',
      targetId: newExpense.id,
      targetTitle: newExpense.title,
      summary: newExpense.isSettlement
        ? `Recorded settlement of $${newExpense.amount.toFixed(2)} paid by ${payer.displayName}`
        : `Added "${newExpense.title}" ($${newExpense.amount.toFixed(2)}) paid by ${payer.displayName}`,
      changes: [
        { field: 'Amount', before: '—', after: `$${newExpense.amount.toFixed(2)}` },
        { field: 'Paid By', before: '—', after: payer.displayName },
        {
          field: 'Splits',
          before: '—',
          after: formatSplitsForDiff(newExpense.splits, db.users),
        },
      ],
    };

    db.logs.unshift(logEntry);
    saveDatabase(db);
    broadcastState('expense:created');

    res.status(201).json({ expense: newExpense, log: logEntry });
  });

  // Edit existing expense
  app.put('/api/expenses/:id', (req, res) => {
    const { id } = req.params;
    const existingIndex = db.expenses.findIndex((e) => e.id === id);
    if (existingIndex === -1) {
      res.status(404).json({ error: 'Expense not found.' });
      return;
    }

    const before = structuredClone(db.expenses[existingIndex]);
    const { title, amount, paidByUserId, date, splitMode, splits, actorUserId } = req.body || {};

    const actor = findUser(actorUserId);
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
      updatedAt: nowIso,
      updatedByUserId: actor.id,
      revision: (before.revision || 1) + 1,
    };

    const changes: AuditLogChange[] = [];
    if (before.title !== updated.title) {
      changes.push({ field: 'Description', before: before.title, after: updated.title });
    }
    if (before.amount !== updated.amount) {
      changes.push({
        field: 'Amount',
        before: `$${before.amount.toFixed(2)}`,
        after: `$${updated.amount.toFixed(2)}`,
      });
    }
    if (before.paidByUserId !== updated.paidByUserId) {
      changes.push({
        field: 'Paid By',
        before: findUser(before.paidByUserId).displayName,
        after: findUser(updated.paidByUserId).displayName,
      });
    }
    if (before.date !== updated.date) {
      changes.push({ field: 'Date', before: before.date, after: updated.date });
    }

    const beforeSplitsStr = formatSplitsForDiff(before.splits, db.users);
    const afterSplitsStr = formatSplitsForDiff(updated.splits, db.users);
    if (beforeSplitsStr !== afterSplitsStr) {
      changes.push({
        field: 'Splits',
        before: beforeSplitsStr,
        after: afterSplitsStr,
      });
    }

    if (changes.length === 0) {
      res.json({ expense: before });
      return;
    }

    db.expenses[existingIndex] = updated;

    const logEntry: AuditLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      groupId: updated.groupId,
      timestamp: nowIso,
      actorUserId: actor.id,
      actorName: actor.displayName,
      actorUsername: actor.username,
      action: 'EXPENSE_EDITED',
      targetId: updated.id,
      targetTitle: updated.title,
      summary: `Edited "${updated.title}" (${changes.map((c) => c.field).join(', ')})`,
      changes,
    };

    db.logs.unshift(logEntry);
    saveDatabase(db);
    broadcastState('expense:updated');

    res.json({ expense: updated, log: logEntry });
  });

  // Delete expense
  app.delete('/api/expenses/:id', (req, res) => {
    const { id } = req.params;
    const actorUserId = (req.query.actorUserId as string) || req.body?.actorUserId;
    const existingIndex = db.expenses.findIndex((e) => e.id === id);

    if (existingIndex === -1) {
      res.status(404).json({ error: 'Expense not found.' });
      return;
    }

    const removed = structuredClone(db.expenses[existingIndex]);
    const actor = findUser(actorUserId);
    const nowIso = new Date().toISOString();

    db.expenses.splice(existingIndex, 1);

    const logEntry: AuditLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      groupId: removed.groupId,
      timestamp: nowIso,
      actorUserId: actor.id,
      actorName: actor.displayName,
      actorUsername: actor.username,
      action: 'EXPENSE_DELETED',
      targetId: removed.id,
      targetTitle: removed.title,
      summary: `Deleted "${removed.title}" ($${removed.amount.toFixed(2)})`,
      changes: [
        { field: 'Amount', before: `$${removed.amount.toFixed(2)}`, after: 'Deleted' },
      ],
    };

    db.logs.unshift(logEntry);
    saveDatabase(db);
    broadcastState('expense:deleted');

    res.json({ deletedId: removed.id });
  });

  // Admin: Create new user
  app.post('/api/users', (req, res) => {
    const { username, password, displayName, role, actorUserId } = req.body || {};
    const actor = findUser(actorUserId);

    if (actor.role !== 'admin') {
      res.status(403).json({ error: 'Only admin accounts can create users.' });
      return;
    }

    const cleanUsername = String(username || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '');
    const cleanDisplayName = String(displayName || '').trim();
    const cleanPassword = String(password || '').trim();

    if (!cleanUsername || !cleanDisplayName || !cleanPassword) {
      res.status(400).json({ error: 'Name, username, and password are required.' });
      return;
    }

    if (db.users.some((u) => u.username.toLowerCase() === cleanUsername)) {
      res.status(409).json({ error: `Username "${cleanUsername}" is already taken.` });
      return;
    }

    const colors = ['#0F172A', '#0369A1', '#047857', '#B45309', '#7C3AED', '#BE123C'];
    const nowIso = new Date().toISOString();
    const newUser: UserAccount = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      username: cleanUsername,
      password: cleanPassword,
      displayName: cleanDisplayName,
      role: role === 'admin' ? 'admin' : 'member',
      avatarColor: colors[db.users.length % colors.length],
      createdAt: nowIso,
      active: true,
    };

    db.users.push(newUser);

    db.logs.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowIso,
      actorUserId: actor.id,
      actorName: actor.displayName,
      actorUsername: actor.username,
      action: 'USER_CREATED',
      targetId: newUser.id,
      targetTitle: `${newUser.displayName} (@${newUser.username})`,
      summary: `Created user ${newUser.displayName} (@${newUser.username})`,
      changes: [
        { field: 'Username', before: '—', after: `@${newUser.username}` },
        { field: 'Role', before: '—', after: newUser.role },
      ],
    });

    saveDatabase(db);
    broadcastState('user:created');

    res.status(201).json({ user: newUser });
  });

  // Admin: Update user
  app.put('/api/users/:id', (req, res) => {
    const { id } = req.params;
    const { username, password, displayName, role, actorUserId } = req.body || {};
    const actor = findUser(actorUserId);

    if (actor.role !== 'admin') {
      res.status(403).json({ error: 'Only admin accounts can edit users.' });
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
      res.status(409).json({ error: `Username "${cleanUsername}" is already in use.` });
      return;
    }

    if (before.role === 'admin' && role === 'member') {
      const adminCount = db.users.filter((u) => u.role === 'admin' && u.active).length;
      if (adminCount <= 1) {
        res.status(400).json({ error: 'At least one admin account must remain.' });
        return;
      }
    }

    const updated: UserAccount = {
      ...before,
      username: cleanUsername || before.username,
      displayName:
        displayName !== undefined ? String(displayName).trim() || before.displayName : before.displayName,
      password:
        password !== undefined && String(password).trim() !== ''
          ? String(password).trim()
          : before.password,
      role: role === 'admin' || role === 'member' ? role : before.role,
    };

    const changes: AuditLogChange[] = [];
    if (before.displayName !== updated.displayName) {
      changes.push({ field: 'Name', before: before.displayName, after: updated.displayName });
    }
    if (before.username !== updated.username) {
      changes.push({ field: 'Username', before: `@${before.username}`, after: `@${updated.username}` });
    }
    if (before.role !== updated.role) {
      changes.push({ field: 'Role', before: before.role, after: updated.role });
    }
    if (before.password !== updated.password) {
      changes.push({ field: 'Password', before: '••••••', after: 'Updated' });
    }

    db.users[userIdx] = updated;

    if (changes.length > 0) {
      db.logs.unshift({
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        actorUserId: actor.id,
        actorName: actor.displayName,
        actorUsername: actor.username,
        action: 'USER_UPDATED',
        targetId: updated.id,
        targetTitle: `${updated.displayName} (@${updated.username})`,
        summary: `Updated user ${updated.displayName}`,
        changes,
      });
    }

    saveDatabase(db);
    broadcastState('user:updated');

    res.json({ user: updated });
  });

  // Admin: Delete user
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
        res.status(400).json({ error: 'Cannot delete the only admin account.' });
        return;
      }
    }

    db.users = db.users.filter((u) => u.id !== id);

    db.logs.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      actorUserId: actor.id,
      actorName: actor.displayName,
      actorUsername: actor.username,
      action: 'USER_DELETED',
      targetId: target.id,
      targetTitle: `${target.displayName} (@${target.username})`,
      summary: `Removed user ${target.displayName} (@${target.username})`,
      changes: [{ field: 'Status', before: 'Active', after: 'Removed' }],
    });

    saveDatabase(db);
    broadcastState('user:deleted');

    res.json({ deletedId: target.id });
  });

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
    console.log(`SageSplit server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
