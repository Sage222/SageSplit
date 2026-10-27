# SageSplit

**SageSplit** is a modern, self-hosted, Docker-ready shared expense tracker and real-time balance ledger for households, roommates, trips, and teams.

---

## Features

- **Real-Time Balancing & Minimum-Transfer Debt Simplification**
  - Live WebSocket synchronization across all connected browsers.
  - Tracks each participant's total paid, fair expense share, settlements sent/received, and net position (`+` owed to member, `-` owes group).
  - Computes the minimum number of transfers required to settle all debts to `$0.00`, with one-click **Settle** recording.
- **Flexible Expense Splitting**
  - **Equal Split**: Divide evenly across any subset of members (with automatic cent-remainder reconciliation).
  - **Exact Amounts**: Specify exact currency amounts per member.
  - **Percentage Split (`%`)**: Allocate expenses by percentage.
  - **Share Weights**: Split proportionally by share weights (e.g., `2` shares vs. `1` share).
- **Editable Shared Ledger**
  - Members can create, edit, and delete shared expenses or direct settlements.
  - Every edit increments the entry revision (`Rev #2`, `Rev #3`, etc.) and records a complete before/after diff.
- **Immutable Audit Logs with Date, Time & Rollback**
  - Every expense creation, edit, deletion, settlement, and account change is logged with exact date and time (`YYYY-MM-DD HH:mm:ss`) and acting user.
  - Includes field-by-field before/after comparison tables, **CSV Export**, and one-click **Revert / Restore** for edited or deleted expenses.
- **Simple Username & Password Account System (Admin Settings Tab)**
  - Built-in username and password authentication managed directly by an Admin account inside the **Settings & Accounts** tab.
  - Admins can create new users, assign or reset passwords, toggle `admin` / `member` roles, configure workspace currency (`USD`, `EUR`, `GBP`, `CAD`, `AUD`), and export full JSON backups.

---

## Quick Start with Docker Compose

1. Clone or copy the repository to your server (e.g. `/opt/SageSplit`):

```bash
cd /opt/SageSplit
docker compose up -d --build
```

2. Open **SageSplit** in your browser:

```text
http://localhost:3000
```

3. Check container health and logs:

```bash
docker compose ps
docker compose logs -f sagesplit
```

---

## Default Accounts & Credentials

Out of the box, SageSplit seeds a sample ledger with an Admin account and three member accounts. You can modify or delete these accounts and set up your own users inside the **Settings & Accounts** tab:

| Display Name | Username | Password | Role |
| :--- | :--- | :--- | :--- |
| **Alex Rivera** | `admin` | `password123` | **Admin** |
| **Maya Lin** | `maya` | `maya2026` | Member |
| **Jordan Vance** | `jordan` | `jordan2026` | Member |
| **Sam Okafor** | `sam` | `sam2026` | Member |

---

## Data Persistence & Backups

- All users, passwords, expenses, audit logs, and workspace settings are persisted to `/app/data/ledger-store.json` inside the container, backed by the `sagesplit_data` Docker volume.
- **JSON Backup**: In the app, go to **Settings & Accounts → Export Full JSON Backup** to download a complete snapshot of your ledger.
- **Audit Log CSV**: Go to **Full Audit Logs → Export CSV** to download the full timestamped history.

---

## Local Development (Without Docker)

```bash
# Install dependencies
npm install

# Start development server (Express + WebSocket + Vite on port 3000)
npm run dev

# Build production bundle
npm run build

# Start production server
npm run start
```

---

## Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | HTTP & WebSocket listening port |
| `NODE_ENV` | `production` | Runtime environment (`development` or `production`) |
| `DATA_DIR` | `/app/data` | Directory where `ledger-store.json` is persisted |
