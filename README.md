# SageSplit

**SageSplit** is a simple, modern, Docker-ready shared expense tracker for holidays, trips, and group expenses with real-time balance calculation and full timestamped logs.

---

## Features

- **Expense Groups**: Create dedicated groups for individual holidays, trips, or events and switch between them anytime.
- **Real-Time Balancing**: Automatically calculates each person's net balance and who owes whom in real time.
- **Simple Expense Splitting**: Split expenses **Equally**, by **Exact Amounts**, or by **Percentage (`%`)**.
- **Full Timestamped Logs**: Every addition, edit, settlement, and deletion is logged with date, time, and before/after changes.
- **Admin User & Password Setup**: Create and manage user accounts and passwords directly in the **Settings** tab.

---

## Quick Start with Docker Compose

```bash
docker compose up -d --build
```

Then open **SageSplit** in your browser at:

```text
http://localhost:3044
```

---

## Initial Admin Login

SageSplit starts completely empty so all groups, users, and expenses are populated by you.

| Name | Username | Password | Role |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `password123` | **Admin** |

Use the **Settings** tab to add additional users (with their own usernames and passwords) and create expense groups.
