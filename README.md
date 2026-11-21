# SageSplit

**SageSplit** is a simple, modern, Docker-ready shared expense tracker for holidays, trips, and group expenses with real-time balance calculation, role-based access control, and full timestamped audit logs.

---

## Features

- **Mandatory Authentication & Role-Based Permissions**:
  - Requires signing in with an Admin or Member account before accessing the application.
  - **Admins** have full control to create/edit/delete any expenses, manage expense groups, assign users to groups, manage user accounts & passwords, and clean or delete audit logs.
  - **Members** can view their assigned expense groups, record new expenses or settlements, and **edit or delete their own expenses** (where they are the submitter or payer), while other members' entries remain protected.
  - **Disabled Role** prevents login and signs out active sessions while keeping the member's profile, group memberships, and historical balances active for later reactivation.
- **Brute-Force Login Protection**:
  - Automatically rate-limits login attempts by IP address.
  - **5 consecutive failed login attempts** triggers a **30-minute temporary ban** (`HTTP 429`), with remaining attempts and lockout countdowns displayed on screen.
- **Expense Groups & User Assignments**:
  - Create dedicated expense groups for individual holidays, trips, or events.
  - Assign specific users to specific expense groups directly from the **Settings** tab.
- **Simple Expense Splitting & Pre-Save Confirmation**:
  - Split expenses **Equally** (with fair remainder-penny rotation across members), by **Exact Amounts (`$`)**, or by **Percentage (`%`)**.
  - Includes a **Confirm Before Saving** summary screen showing the payer, date, total amount, and exact per-person split breakdown before any entry is committed.
  - Displays a participant split summary on every expense row (including excluded members) and includes an **All / Expenses / Settlements** filter toggle.
- **Real-Time Balancing & Instant Sync**:
  - Automatically calculates each member's net balance and simplified "Who Owes Who" settlements in real time across connected browsers via WebSockets.
- **Full Timestamped Audit Logs & CSV Exports**:
  - Every addition, edit, settlement, and deletion is recorded with an exact timestamp (`YYYY-MM-DD HH:mm:ss`), actor, and before/after changes.
  - Export the full **Activity Log** or any group's **Expenses & Member Balances** into a formatted, Excel-ready `.csv` spreadsheet with one click.
  - Admins can delete individual log entries or clear the entire log history.
- **Mobile & Desktop Responsive**:
  - Optimized for phones and desktop browsers with touch-friendly controls and a dedicated mobile bottom navigation bar.
- **Atomic Local Persistence**:
  - Stores data in `./data/ledger-store.json` using atomic temporary-file writes (`ledger-store.json.tmp` -> `ledger-store.json`) to prevent corruption on unexpected shutdowns.

---

## Quick Start with Docker Compose

```bash
docker compose up -d --build
```

Then open **SageSplit** in your browser at:

```text
http://localhost:3044
```

### Data Storage

All application data is persisted in the `./data` folder inside your project directory (`./data:/app/data`).
- To back up your data, copy `./data/ledger-store.json`.
- To reset the application completely, stop the container and remove `./data`.

---

## Initial Admin Login

SageSplit starts with a clean ledger so all groups, users, and expenses are populated by you.

| Name | Username | Password | Role |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `password123` | **Admin** |

> **Security Tip:** After signing in for the first time, open the **Settings** tab to update the default Admin password, create user accounts, and set up your expense groups.
