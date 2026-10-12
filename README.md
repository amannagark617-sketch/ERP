# Little Nap ERP – Purchase-to-Inventory

Purchase orders → multi-level approval → advance → vendor → goods receipt with invoice → Accounts payment,
with a three-way match and a per-PO payment tracker (see the *Purchase-to-Inventory System* process design).

| What | Where it lives |
|---|---|
| Screens (this React app) | this repo → deployed from Google AI Studio (or any web host) |
| **Business data** – vendors, POs, receipts, payments, audit log | **Google Spreadsheet #1: "DATA"** |
| **Logins, roles, permissions, approval limits, settings** | **Google Spreadsheet #2: "ACCESS"** (a separate file, created for you) |
| Uploaded files – payment screenshots, invoice copies | **Google Drive** folder "Little Nap ERP Files" |
| The bridge between app and Google | a Google **Apps Script** web app (`apps-script/Code.gs`) |

The app starts **empty** – no sample data. HO adds vendors/items, you add users.

---

## Activate the app – step by step

You need: a Google account (this account owns the data) and this GitHub repo. Total time ≈ 15 minutes.

### Step 1 – Create the DATA sheet and open Apps Script
1. Go to <https://sheets.new> (creates a blank Google Sheet). Name it **Little Nap ERP – Data**.
2. Menu **Extensions → Apps Script**. A script editor opens in a new tab.

### Step 2 – Paste the server code
1. In this repo open **`apps-script/Code.gs`** → click **Raw** → select all → copy.
2. In the Apps Script editor, delete everything in the default `Code.gs` file, paste, and press **Save** (💾).
   (Name the project anything, e.g. "Little Nap ERP API".)

### Step 3 – Run `setup` (creates all tabs + the ACCESS sheet)
1. In the toolbar function dropdown choose **`setup`** → press **Run**.
2. Google asks for permission: **Review permissions → choose your account → "Google hasn't verified this app" → Advanced → "Go to … (unsafe)" → Allow**.
   (This is your own script; the warning appears for every personal script.)
3. When it finishes, a message (and **View → Logs**) shows two links:
   - the **ACCESS** sheet – a new file "Little Nap ERP – Access (logins & settings)" in your Drive
   - the **DATA** sheet – the one you made
4. The DATA sheet now has the business tabs (Vendors, VendorItems, Items, PurchaseOrders, …). Nothing else is in it.

### Step 4 – Set the admin password (in the ACCESS sheet)
1. Open the **ACCESS** sheet → tab **Users**. There is one row: Login ID **`admin`**, Password **empty**.
2. Type your own password in the **Password** cell. (There is no default password.)
   The first time that person logs in, the app replaces the plain text with a secure hash.
3. Add one row per staff member: **Login ID, Password, Full Name, Role, Department, Level, Reports To, Active = Yes**.
   Roles to use: `Purchase`, `Factory Head`, `CA`, `HO`, `Accounts`, `Inventory`, `Admin` (see the Roles tab; add more there).
4. **Share the ACCESS sheet only with the Admin.** Share the DATA sheet with whoever should read the numbers.

### Step 5 – Deploy as a web app
1. In Apps Script: **Deploy → New deployment** → ⚙ **Select type → Web app**.
2. *Description*: `v1`. *Execute as*: **Me**. *Who has access*: **Anyone**. → **Deploy**.
3. Copy the **Web app URL** (`https://script.google.com/macros/s/…/exec`).
   "Anyone" only means anyone can *reach* the URL – every request still needs a valid Login ID + password.

### Step 6 – Give the app the URL
Open **`src/serverUrl.ts`** in this repo and paste the URL between the quotes:
```ts
export const SERVER_URL = 'https://script.google.com/macros/s/…/exec';
```
Commit it (or just send me the URL and I will). Now every user's browser connects automatically.
(Alternative for a quick test: leave it empty and paste the URL on the app's first screen – that is remembered in that browser only.)

### Step 7 – Put the app online (Google AI Studio)
1. In **Google AI Studio** create/import the app from this GitHub repo (branch with the code), or upload the repo as a ZIP.
2. Run it in the AI Studio preview to check the login screen appears.
3. Use AI Studio's **Deploy** option to publish it and share the link with your staff.
   *(Menu names in AI Studio change from time to time; if you can't find Deploy, any static host works too: run `npm install && npm run build` and upload the `dist/` folder to Netlify, Vercel, Firebase Hosting, GitHub Pages, etc.)*

### Step 8 – First use
1. Log in as `admin`. Open **Vendors & Prices**: add **Items**, then **+ New vendor** (MSME, Udyam, GSTIN, bank details, and the agreed price per item).
2. Open **Users & Access** to add/edit users from inside the app (or edit the Users tab).
3. Log in as Purchase (Navneet) → **New PO**. Done – the flow is live.

### When you change something later
- **Users, roles, permissions, approval limit, tax rates** → just edit the ACCESS sheet. Users see it after their next login/refresh.
- **Vendors & prices** → in the app (HO) or directly in the DATA sheet, then press **↻ Refresh**.
- **Server code changed** (I'll tell you when): replace the code in Apps Script, **Deploy → Manage deployments → ✏ → Version: New version → Deploy**. The URL stays the same. Then run `setup` again if I mention new columns (it never overwrites data).
- **App screens changed** → redeploy from AI Studio / re-upload `dist/`.

---

## The Google Sheets

**ACCESS spreadsheet – control panel (Admin only)**

| Tab | Purpose |
|---|---|
| `Users` | Login ID, Password, Name, **Role**, **Department**, **Level** (hierarchy), Reports To, Active (Yes/No) |
| `Roles` | Role names, default level and department. Add a role here, then use it in Users |
| `Permissions` | Which **roles** (or minimum **level**) may do each action, e.g. `po.approve` → `Factory Head,CA`. Level 5 = Admin override |
| `ApprovalRules` | Approval chain by PO value: *Step 1 – Factory Head – above 0*, *Step 2 – CA – above 10,00,000*. Add rows or change roles/limits |
| `Settings` | Company name, MSME max days (45), tax rates offered at receipt (`0,5,18`), invoice tolerance, Drive folder id |

**DATA spreadsheet**

| Tab | Purpose |
|---|---|
| `Vendors` | Name, contact, email/WhatsApp, **MSME**, **MSME type**, **Udyam No**, GSTIN, PAN, address, payment terms, bank details, Active |
| `VendorItems` | Vendor-wise products and agreed price |
| `Items` | Item list and unit |
| `PurchaseOrders`, `POLines`, `POHistory`, `Receipts`, `ReceiptLines`, `Payments`, `OpeningBalances`, `PriceQueries`, `Counters` | Written by the app – filter them, make pivots/charts on them |
| `AuditLog` | Who did what, when |

Columns are matched by **header name**: re-order them or add your own extra columns (notes, pivots). Don't rename existing headers.
Dates are `yyyy-mm-dd`. After editing a sheet by hand press **↻ Refresh** in the app (it also refreshes every minute).

## Access model
- Every screen and button follows the **Permissions** tab – a new department/role needs no code: add the role, set its permissions, add users.
- Approval is by *role at the current step*: a PO "Pending CA" can be approved only by a user whose Role is `CA`.
- The server re-checks every save: role permission, approval route (recomputed from `ApprovalRules`), prices (must equal the vendor price list),
  payments (accepted invoice, not above the balance), no edits to past payments/history, and a version check so two people can't silently overwrite each other.
- Passwords are stored as SHA-256 hashes in the ACCESS sheet (anyone typing a plain password there gets it hashed at next login). 5 wrong tries lock a login for 15 minutes; sessions last 6 hours.
- Logins live in a different file from the business data, so sharing the DATA sheet never exposes them.

**Honest limits:** this is an internal tool on Google Apps Script, not a bank-grade system. The server does *not* re-check the softer rules
(e.g. received quantity vs pending quantity, tax-rate choice) – those are enforced in the browser; everything is in the AuditLog.
Apps Script has daily quotas and each save takes ~1–3 s. Files must be images/PDF up to 8 MB (photos are shrunk automatically).

## Troubleshooting
| Symptom | Fix |
|---|---|
| "The Sheet is not set up yet" | Run `setup` in Apps Script (Step 3), then redeploy a new version |
| "No password has been set for this login yet" | Type a password in the Users tab (ACCESS sheet) |
| "Cannot reach the server" / invalid data | URL wrong, or deployment access is not **Anyone**; re-check Step 5/6 |
| Changed Code.gs but nothing changed | You must **Deploy → Manage deployments → New version** |
| A role can't see a button | Check the Permissions tab (Allowed Roles spelling must match the Role exactly) |
| "Someone else has just changed this record" | Normal when two people edit at once – the latest data is loaded, repeat the action |

## Develop
```bash
npm install
npm run dev            # http://localhost:3000
npm run build
npm test               # server rules + generated Code.gs smoke test (uses test-only sample data)
npm run build:server   # regenerates apps-script/Code.gs after changing src/shared/*
```

| Change… | Edit |
|---|---|
| Sheet columns / new tab | `src/shared/schema.ts` → `npm run build:server` → re-paste `Code.gs` → new deployment version → run `setup` |
| Server rules, permission logic, validations | `src/shared/core.ts` |
| Starter roles / permissions / approval rules | `src/shared/seed.ts` |
| Business calculations (outstanding, due dates, pending) | `src/domain.ts` |
| Workflow steps the browser performs | `src/store.ts` |
| Screens | `src/pages/*` |
| Google Sheets / Drive adapter | `apps-script/host.gs` |

## Next phase (from the process doc)
Requisition slip → PO link, Inventory out (issue to production), BOM & customization.
