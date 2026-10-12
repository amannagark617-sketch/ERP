# Little Nap ERP – Purchase-to-Inventory

Purchase orders → multi-level approval → advance → vendor → goods receipt with invoice → Accounts payment,
with a three-way match and a per-PO payment tracker (see the *Purchase-to-Inventory System* process design).

**Where things live**

| What | Where |
|---|---|
| Screens (React app) | this repo – deploy via Google AI Studio / any static host |
| **All data** (POs, vendors, payments…) | **your Google Sheet** |
| **Logins, roles, permissions, approval limits, settings** | **your Google Sheet** (plain tabs – edit them like any spreadsheet) |
| Uploaded files (payment screenshots, invoice copies) | **your Google Drive** (folder "Little Nap ERP Files") |
| The glue between the two | a Google Apps Script web app (`apps-script/Code.gs`) |

## 1. Connect Google Sheets + Drive (one time, ~5 minutes)

1. Create a new Google Sheet (any name).
2. **Extensions → Apps Script**. Delete the sample code and paste the whole of [`apps-script/Code.gs`](apps-script/Code.gs). Save.
3. Choose the function **`setupDemo`** (sample vendors/POs) or **`setup`** (clean start) in the toolbar and press **Run**. Approve the permissions.
   The Sheet now has all the tabs below, plus the starter users.
4. **Deploy → New deployment → Web app** → *Execute as*: **Me**, *Who has access*: **Anyone** → Deploy. Copy the **Web app URL**.
   ("Anyone" only means anyone can *reach* the URL – every request still needs a valid Login ID + password from your Users tab.)
5. Open the app. On the first screen paste the URL → **Connect**. (Or set `VITE_API_URL` – see `.env.example`.)

If you later change `Code.gs`: **Deploy → Manage deployments → ✏️ → Version: New version → Deploy** (the URL stays the same).

### Starter logins (change them!)
`admin / admin123`, `navneet / navneet123` (Purchase), `factoryhead`, `mohit` (CA), `ho`, `accounts`, `inventory` – password is the login ID + `123`.
Passwords typed in the Sheet are replaced by a secure hash the first time that person logs in.
Reset someone's password by typing a new plain-text password into their row.

## 2. The Google Sheet tabs

**Control panel – edit freely**

| Tab | Purpose |
|---|---|
| `Users` | Login ID, Password, Name, **Role**, **Department**, **Level** (hierarchy), Reports To, Active |
| `Roles` | Role names, default level, department. Add a role here, then use it in Users |
| `Permissions` | Which **roles** (or minimum **level**) may do each action, e.g. `po.approve` → `Factory Head,CA`. Level 5 = Admin override |
| `ApprovalRules` | Approval chain by PO value: *Step 1 – Factory Head – above 0*, *Step 2 – CA – above 10,00,000*. Add rows/roles to change the chain |
| `Settings` | Company name, MSME max days (45), tax rates offered at receipt (`0,5,18`), invoice tolerance |

**Master data (HO) – also editable in the app**

| Tab | Purpose |
|---|---|
| `Vendors` | Name, contact, email/WhatsApp, **MSME**, **MSME type**, **Udyam No**, GSTIN, PAN, address, payment terms, bank details, Active |
| `VendorItems` | Vendor-wise products and agreed price |
| `Items` | Item list and unit |

**Transactions – written by the app** (read them, filter them, build charts/pivots on them): `PurchaseOrders`, `POLines`, `POHistory`,
`Receipts`, `ReceiptLines`, `Payments`, `OpeningBalances`, `PriceQueries`, `Counters`, and `AuditLog` (who did what, when).

Columns are matched by **header name**: you can re-order columns or add your own extra columns (e.g. a pivot or notes).
Don't rename existing headers. Dates are `yyyy-mm-dd`. After editing the Sheet, press **↻ Refresh** in the app (it also auto-refreshes every minute).

## 3. Access model

- Every screen and button follows the **Permissions** tab, so a new department/role needs no code: add the role, set its permissions, add users.
- Approval is by *role at the current step* – a PO "Pending CA" can only be approved by a user whose Role is `CA`.
- The server (Apps Script) re-checks every save: role permission, approval route (recomputed from `ApprovalRules`), prices (must equal the vendor price list),
  payments (accepted invoice, not above the balance), no edits to past payments/history, version check so two people can't silently overwrite each other.
- 5 wrong passwords lock a login for 15 minutes; sessions last 6 hours.

**Honest limits:** this is an internal tool on Google Apps Script, not a bank-grade system. Rules the server does *not* re-check are the softer ones
(e.g. received quantity vs pending quantity, tax-rate choice). Everything is in the AuditLog. Apps Script has daily quotas and each save takes ~1–3 s.
Files uploaded are images/PDF up to 8 MB (photos are shrunk automatically).

## 4. Develop / deploy the app

```bash
npm install
npm run dev            # http://localhost:3000
npm run build
npm test               # server rules + generated Code.gs smoke test
npm run build:server   # regenerates apps-script/Code.gs after changing src/shared/*
```

- No Sheet yet? On the first screen choose **Try offline demo** – the same server code runs in the browser with sample data (nothing saved to Google).
- Google AI Studio: import this repo, run `npm install` / `npm run dev`; deploy as usual. No API key needed.

## 5. Code map – where to change things later

| Change… | Edit |
|---|---|
| Sheet columns / new tab | `src/shared/schema.ts` (then `npm run build:server`, re-paste `Code.gs`, re-run `setup()`—it adds missing columns/tabs and never overwrites data) |
| Server rules, permissions logic, validations | `src/shared/core.ts` |
| Starter users / permissions / rules | `src/shared/seed.ts` |
| Business calculations (outstanding, due dates, pending) | `src/domain.ts` |
| Workflow steps the browser performs | `src/store.ts` |
| Screens | `src/pages/*` |
| Google Sheets / Drive adapter | `apps-script/host.gs` |

## Next phase (from the process doc)
Requisition slip → PO link, Inventory out (issue to production), BOM & customization.
