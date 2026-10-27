# SageSplit — Brute-Force Protection & Expense Confirmation Plan

This update adds server-side brute-force login protection (5 failed login attempts trigger a 30-minute ban) and an interactive confirmation step before saving any expense or settlement.

## User Review & Critical Decisions

> [!IMPORTANT]
> Both requested enhancements keep the existing minimal mobile and desktop interface intact without adding extra settings or screen clutter.

- **Confirmed Decision 1 — Brute-Force Login Rate Limiting**: Tracking failed login attempts by client IP on the server. After **5 consecutive failed attempts**, the IP is locked out for **30 minutes** (`HTTP 429`) with a clear countdown message on the login screen. A successful login before the 5th failure resets the counter.
- **Confirmed Decision 2 — Pre-Save Expense Confirmation Prompt**: Clicking **Save** in the Expense modal displays a clean confirmation view summarizing the description, total dollar amount, payer, date, and each person's exact share, requiring an explicit **Confirm & Save** click (or **Back to Edit**) before submitting.

---

## 1. Overview & Core Concept

- **What It Does**: Protects self-hosted Docker deployments of SageSplit against automated password guessing and prevents accidental expense entry mistakes on phones and desktops.
- **Target Audience**: Household members, holiday travelers, and administrators accessing SageSplit from mobile phones or desktop browsers.
- **Key Value**: Stronger login security for internet-exposed containers and zero accidental expense submissions.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Brute-Force Login Protection Flow**:
     - When a user enters an incorrect username or password, the server increments the failed attempt count for their IP and returns the remaining attempts (e.g., `Invalid username or password. 3 attempts remaining before a 30-minute lockout.`).
     - Upon the 5th failed attempt, the IP is banned for 30 minutes. Subsequent attempts during the window return `429 Too Many Requests` with the remaining minutes until unlock.
  2. **Expense Confirmation Prompt Flow**:
     - User fills out the **Add Expense** or **Edit Expense** form and taps **Review & Save**.
     - The modal switches to a focused **Confirm Expense** summary card showing:
       - Description, Date, and Total Amount (`$XX.XX`)
       - Paid By member name
       - Exact dollar breakdown for each included member
     - User taps **Confirm & Save** to commit the expense to the ledger, or **Back to Edit** to adjust any field.
- **Visual Identity & Theme**:
  - Retains the clean slate-and-white (`#F8FAFC` / `#FFFFFF` / `#0F172A`) palette, `Plus Jakarta Sans` typography, and `JetBrains Mono` tabular numerals (`tabular-nums`).
  - Mobile-first bottom-sheet presentation with 44px+ touch targets.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: In-Memory + Header-Aware IP Rate Limiting**
  - *Chosen Approach*: Track failed attempts per IP (supporting `X-Forwarded-For` for reverse proxies as well as direct socket IP) in server memory with automatic expiry after 30 minutes, plus atomic disk persistence for ledger writes.
  - *Why*: Zero external database dependencies (like Redis) while protecting the `/api/auth/login` endpoint immediately out of the box in Docker.
- **Decision 2: In-Modal Confirmation Step vs. Browser `window.confirm`**
  - *Chosen Approach*: Render the confirmation prompt directly inside the Expense modal/sheet rather than using native browser `window.confirm()`.
  - *Why*: Works reliably across all mobile webviews and iframes, and clearly displays the calculated per-person dollar split before saving.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Client (Mobile & Desktop)                       │
│                                                                         │
│  ┌──────────────────────────────┐    ┌───────────────────────────────┐  │
│  │        Login Gate UI         │    │     Expense Modal / Sheet     │  │
│  │  • Displays remaining tries  │    │  Step 1: Input Form & Splits  │  │
│  │  • Shows 30-min ban timer    │    │  Step 2: Confirmation Prompt  │  │
│  └──────────────┬───────────────┘    └───────────────┬───────────────┘  │
└─────────────────┼────────────────────────────────────┼──────────────────┘
                  │ POST /api/auth/login               │ POST/PUT /api/expenses
                  ▼                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Express + WebSocket Server                       │
│                                                                         │
│  ┌──────────────────────────────┐    ┌───────────────────────────────┐  │
│  │   Brute-Force Rate Limiter   │    │   Ledger & Audit Controller   │  │
│  │  • Max 5 failures per IP     │    │  • Validates admin/user role  │  │
│  │  • 30-minute ban window      │    │  • Atomic JSON disk write     │  │
│  │  • Resets on valid login     │    │  • Broadcasts via WebSocket   │  │
│  └──────────────────────────────┘    └───────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Interactive Component & State Mapping**:
  - **Login Gate**: Submits credentials to `/api/auth/login`; surfaces attempt warnings (`401`) and lockout countdowns (`429`) in the inline alert banner.
  - **Expense Modal**: Manages `confirmingSave` boolean state; validates fields and split totals first, transitions to the summary confirmation view, and invokes `onSave` only when **Confirm & Save** is clicked.
