# Little Nap ERP – Purchase-to-Inventory

Purchase orders → approval → advance → vendor → goods receipt (stock in) → stock out → invoice → payment,
with a three-way match and a per-PO payment tracker (see the *Purchase-to-Inventory System* process design).

**ONE Google Spreadsheet holds everything** – logins, vendors, prices, POs, stock, payments. The app is the screen; the Sheet is the database.

| What | Where it lives |
|---|---|
| Screens (this React app) | this repo → deployed from Google AI Studio (or any web host) |
| **All data and logins** | **one Google Spreadsheet** (12 tabs, below) |
| Uploaded files – payment screenshots, invoice copies | Google Drive folder "Little Nap ERP Files" |
| Monthly backup of the whole spreadsheet | Google Drive folder "Little Nap ERP Backups" |
| The bridge between app and Google | a Google Apps Script web app (`apps-script/Code.gs`) |

The app starts **empty** – no sample data.

---

## The 12 tabs

Tab colours tell you what to touch: **orange = access/settings**, **green = master data**, **grey = written by the app (read-only for you)**.

| Tab | You edit? | Purpose |
|---|---|---|
| `Users` | ✏️ | Login ID, Password, Name, **Role**, Department, **Level**, Reports To, Active |
| `Roles` | ✏️ | One row per role (five to start with): its **level**, **"Approves POs above Rs"**, and a Yes/No column for each thing it may do (create POs, pay advances, receive goods, issue stock, adjust stock, accept invoices & pay, manage vendors/items/prices, manage users) |
| `Settings` | ✏️ | Company name, MSME max days (45), tax rates (`0,5,18`), invoice tolerance, how many months of settled history the app loads |
| `Vendors` | ✏️ | Name, contact, email/WhatsApp, **MSME**, **MSME type**, **Udyam No**, GSTIN, PAN, address, payment terms, bank details, Active |
| `Items` | ✏️ | Item name, unit, category, min-stock alert, Active |
| `Prices` | ✏️ | **One row per vendor + item + brand**: who sells what, in which **Brand**, at what price. Same vendor, same item, two brands = two rows |
| `PurchaseOrders`, `POLines` | app | Every PO and its items |
| `Receipts` | app | Goods received + invoice (also holds *old pending balances* as type "Opening") |
| `Payments` | app | Advances and invoice payments |
| `Stock` | app | **The stock in / out log**: IN (from goods receipts), OUT (issued), ADJUST (corrections) – each line carries the **Brand** |
| `Log` | app | Who did what, when (also the PO history shown in the app) |

Columns are matched by **header name**: you may re-order columns or add your own extra ones (notes, pivots, charts). Don't rename or delete existing headers.
Dates are `yyyy-mm-dd`. After editing the Sheet by hand press **↻ Refresh** in the app (it also notices changes by itself within ~30 s).

---

## Activate the app – step by step

You need: a Google account that will own the data (use a company account, not a personal one) and this GitHub repo. ≈ 15 minutes.

### Step 1 – Create the Sheet and open Apps Script
1. Go to <https://sheets.new>. Name the file **Little Nap ERP**.
2. **Extensions → Apps Script** (opens the script editor in a new tab).

### Step 2 – Paste the server code
1. In this repo open **`apps-script/Code.gs`** → **Raw** → select all → copy.
2. In the Apps Script editor delete the default code, paste, **Save** (💾).

### Step 3 – Run `setup` and `installBackup`
1. Choose **`setup`** in the function dropdown → **Run**. Approve the permissions
   (**Review permissions → your account → "Google hasn't verified this app" → Advanced → Go to … (unsafe) → Allow**). It's your own script.
2. The Sheet now has the 12 coloured tabs. A message shows the Sheet link.
3. Choose **`installBackup`** → **Run**. This makes a copy of the whole spreadsheet on the 1st of every month (last 12 kept) in your Drive.

### Step 4 – Set the admin password (in the Users tab)
1. Open the **Users** tab. There is one row: Login ID **`admin`**, Password **empty**. (There is no default password.)
2. Type your own password in the Password cell. At the first login the app replaces it with a secure hash.
3. Add one row per staff member: **Login ID, Password, Full Name, Role, Department, Level, Active = Yes**.
   The five roles: **`Purchase`**, **`Accounts`**, **`Inventory`**, **`Factory Head`** and **`Admin`** (see the Roles tab). **Admin does everything**: second-level approver for POs above Rs 10 Lac, vendors/items/prices, stock corrections, price queries and users. Give the CA and the head-office people an `Admin` login.
4. **Share the spreadsheet with the Admin only.** Staff use the app and never need access to the Sheet (the Users tab holds password hashes).

### Step 5 – Deploy as a web app
1. **Deploy → New deployment → ⚙ Select type → Web app**. *Execute as*: **Me**. *Who has access*: **Anyone**. → **Deploy**.
2. Copy the **Web app URL** (`https://script.google.com/macros/s/…/exec`).
   "Anyone" only means anyone can *reach* the address – every request still needs a valid Login ID + password.

### Step 6 – Give the app the URL
Put it in **`src/serverUrl.ts`**:
```ts
export const SERVER_URL = 'https://script.google.com/macros/s/…/exec';
```
Commit it (or send it to me and I will). Every user's browser then connects automatically.
(For a quick test you can instead paste the URL on the app's first screen – remembered in that browser only.)

### Step 7 – Put the app online (Google AI Studio)
1. In **Google AI Studio** create/import the app from this GitHub repo, or upload the repo as a ZIP.
2. Open the preview and check the login screen appears.
3. Use AI Studio's **Deploy** to publish and share the link with staff.
   *(Menu names change from time to time; any static host also works: `npm install && npm run build`, then upload the `dist/` folder to Netlify, Vercel, Firebase Hosting, GitHub Pages…)*

### Step 7½ (optional) – See it working with sample data first
Want something to test with? In Apps Script choose **`loadSampleData`** → **Run**. It fills the empty Sheet with only the **master data**:
7 vendors (MSME and non-MSME, with Udyam numbers), 12 items and 19 vendor prices (some items sold by 3 vendors at different prices and brands).
**No POs, receipts, payments or stock are added** – you create those yourself (PO → approval → receipt → payment → stock) to test the real flow.
It also adds four logins to try the staff roles: `demo.purchase`, `demo.factory`, `demo.accounts`, `demo.store` – password **`Demo@1234`**. Use your own `admin` login for everything the Admin does.
It only works on an empty system and never overwrites anything.
**Before real use run `clearAllDataBeforeGoingLive`** – after a confirmation box it deletes all sample vendors, items, and anything you created while testing (POs, stock…), plus the demo logins (your admin, Roles and Settings stay).
Never run that function once real data is in.

### Step 8 – First use
1. Log in as `admin` → **Items & Prices** → **+ New item**; **Vendors** → **+ New vendor** (MSME, Udyam, GSTIN, bank, and its price list).
2. Stock already in the factory? **Stock → Adjust stock** (reason "Opening stock") – one line per item. Bills from before the app? **Accounts → Add an old pending balance**.
3. Log in as Purchase → **New PO**. The flow is live.

### Updating an existing install to a newer version
(If your sheet still has the old `CA` and `HO` roles, `setup` merges them into `Admin` once: real CA/HO users become Admin, `Pending CA` POs become `Pending Admin`, and the demo.ca / demo.ho logins are removed.)

Paste the new `Code.gs` over the old one, run **`setup`** (it only *adds* what is missing: new Settings rows and columns such as *PO PDF sent*, and it tidies up settings rows that older releases created for a letterhead the PO no longer has; it never changes your data), then **Deploy → Manage deployments → ✏️ → New version → Deploy**. Re-deploy the app (AI Studio / `dist/`) too when the screens changed.

### Already ran the earlier version (two spreadsheets)?
Nothing real is lost – just start clean. Easiest (keeps your Web app URL):
1. Open the main spreadsheet and **delete every tab** except one empty tab. Delete the second "Access" spreadsheet from Drive.
2. Extensions → Apps Script: replace the whole code with the new `Code.gs`, Save, run **`setup`** (approve the new permissions) and **`installBackup`**.
3. **Deploy → Manage deployments → ✏️ → Version: New version → Deploy** (same URL). Then Step 4 above.

---

## Everyday tasks

| I want to… | Do this |
|---|---|
| **Add an item** | Items & Prices → **+ New item** (or type a row in the `Items` tab) |
| **Stop using an item** | Items & Prices → Edit → **Archive item** (hidden from new POs; old POs keep it). Items are never deleted, so history never breaks |
| **Five vendors sell the same item at different prices** | Give each vendor a price for that item (Items & Prices → Edit → *Add a vendor*, or Vendors → Edit → *Add an item*, or a row per vendor in the `Prices` tab). The item list shows them **cheapest first**; on a PO the form warns "cheaper elsewhere" |
| **Say which brand a product is** | Put it in the **Brand** column of the `Prices` tab (or in the app: Items & Prices → Edit → *Brand*, or Vendors → Edit → *Brand*). Leave it empty for items without a brand. The brand then follows the product everywhere: PO line → PO PDF → goods receipt → stock |
| **A vendor sells the same item in two brands** | Two rows in `Prices` (same vendor, same item, different Brand), each with its own price. On the PO you pick the row you want |
| **See stock of one brand** | Stock screen: an item with several brands shows one line per brand (e.g. Foam sheet 40D: ComfortPlus 215, Duraflex 30). *Issue stock* asks for the brand and only lets you issue what that brand has |
| **Change a price** | Same screen → change the number → Save. Open POs keep the price they were raised with; new POs use the new price |
| **Add / remove a vendor** | Vendors → New / Edit (set *Active = No* to retire) |
| **Get the PO as a PDF** | Open the PO → **⬇ Download PO (PDF)**. Works at every stage; until the PO is approved the PDF carries a red *DRAFT – not for issue* watermark. When you press **Mark sent**, the exact PDF is also saved in Drive and linked on the PO ("PO copy sent") |
| **Change the standard terms or the signature text on every PO** | `Settings` tab → `PoTerms` (use `|` between points) and `PoSignatory` |
| **Receive goods** | Goods Receipt → pick the PO → enter invoice → saved as **Stock IN** automatically |
| **Issue material to production** | Stock → **Issue stock** (item, qty, department/purpose). Can't issue more than is on hand |
| **Fix a stock count** | Stock → **Adjust stock** (needs a reason; only roles with *Adjust Stock*) |
| **Add a person** | Users & Access (or a row in the `Users` tab) |
| **Change who approves, or the Rs 10 Lac limit** | `Roles` tab → column *Approves POs above Rs* (Factory Head `0`, Admin `1000000`; blank = not an approver) |
| **Give a role a new power** | `Roles` tab → put **Yes** in that role's column |
| **See old settled POs** | Top bar → **Load full history** |

---

## Brand

Brand is part of the identity of a purchase line: **item + brand**. The price list, the PO line, the goods receipt, the stock ledger and "stock on hand" are all kept per brand, so

- a PO line can only use a brand that the vendor actually lists, at that brand's price (the server checks this);
- you can only receive a brand that is on the PO, up to the quantity still pending *for that brand*;
- stock is counted per brand, and an issue is limited to the stock of the brand you pick;
- "cheaper elsewhere" and the ★ cheapest mark compare the **same brand** only (a Duraflex foam is not compared with a SoftRest foam);
- the PO PDF gets a **Brand** column whenever at least one line has a brand.

Brand is optional. Upgrading an existing sheet: `setup` adds an empty **Brand** column to `Prices`, `POLines` and `Stock`; existing rows keep working with no brand. To add brands to existing prices, type them into the Brand column of `Prices` (the Key column updates itself the next time the app loads).

## The PO document

A4, one or more pages, built in your browser (nothing leaves your Google account). It is branded **Little Nap Recliners** with the logo only – no company address block:
logo and **PURCHASE ORDER** heading with the PO number in the logo's red, a vendor box (GSTIN, PAN, contact, MSME/Udyam from the vendor master), order details
(delivery date, payment terms, advance, prepared by), a dark-header items table (with a **Brand** column when any line has a brand) in Indian number format (₹ 4,80,000.00) with the order value, an **amount-in-words** band,
an **advance payment** callout when an advance is due, **special instructions** (the PO's own terms), numbered general terms, and a Prepared by / Approved by (names and dates) / authorised-signatory block.
Every page has a footer with the PO number and "Page 1 of 3"; continuation pages get a compact header. Until approval a red **DRAFT – not approved** watermark is printed.
Look and feel follow the HR screening app: white page, charcoal text, the logo's red as the single accent, **Inter** font.
To change the logo replace `public/logo.png` (PNG on white or transparent); fonts are in `public/fonts/` (Inter, SIL Open Font License).
Emailing/WhatsApp-ing the PDF is still a manual attach (a browser can't attach files to `mailto:`); an automatic "send from the app" option would need Gmail permission in the script – ask if you want it.

## Built to run for years without changes

- **Items, vendors and users are never deleted** by the app – they are archived/deactivated, so a PO from 2026 still opens in 2030. (Payments, stock movements and the log can't be edited or removed from the app either.)
- **Fast on purpose:** the app loads *open work + the last 6 months* (set `RecentMonths` in Settings). Old settled POs stay in the Sheet and load on demand. It also checks "has anything changed?" cheaply instead of re-reading the Sheet.
- **Measured** (simulated, server logic only – I can't time Google's own Sheet reads from here):

  | Volume | POs after 4 years | Default load | Server time |
  |---|---|---|---|
  | 2 POs / working day | ~2,900 | ~1 MB | ~0.2 s |
  | 8 POs / working day (very busy) | ~11,700 | ~4 MB | ~0.5 s |

  The Sheet itself stays well inside Google's 10-million-cell limit (≈ 3 M cells at the busy volume). "Load full history" gets heavy beyond ~10,000 POs – it is an occasional lookup, the Sheet remains the full record.
- **Backups:** `installBackup` copies the spreadsheet monthly (last 12 kept). You can also run `backupNow` any time. Google Sheets' own *File → Version history* works too.
- **Ownership:** the script runs as the account that deployed it. Use a company-owned Google account; if that person leaves, transfer ownership of the Sheet *and* re-deploy the script from the new owner before the old account is removed.
- **Don'ts:** don't delete or rename header cells; don't sort or filter the grey tabs in place (use a copy or a filter *view*); keep the Sheet's owner account alive.
- If Google changes something, only `apps-script/host.gs` needs touching – the business rules are separate.

## Receiving goods (partial deliveries)
Inventory opens **Goods Receipt**, picks a PO and **all its items load automatically** (ticked, with the pending quantity filled in). They type the quantity actually received per line; anything short stays **pending with the vendor**:
- The form shows *Ordered / Received before / Pending / Received now / Still pending after* and the ₹ value of what is still pending.
- Only the received quantity goes into stock, and the invoice amount (and tax) is calculated on the received quantity only.
- The PO becomes *Partially Received*, shows pending quantity **and pending value** on every line, and stays open until the balance arrives (a later receipt can complete it).
- The invoice grand total can be left blank when it equals the system total.
- Goods can be received once Purchase has marked the PO as sent (approved POs not yet sent are listed separately).

## Who can see paid / pending
- **PO list & PO page:** Payment status (Paid / Part paid / Unpaid), outstanding amount, pending quantity and pending value.
- **Accounts → Vendor-wise:** Billed, Paid, Pending to pay and Goods pending from vendor for every vendor (also on each vendor card). Visible to Admin, Accounts, Factory Head and Purchase (read-only for the last two); Inventory sees quantities only, not money.
- **Stock:** *On order (pending from vendors)* next to the stock on hand of every item and brand.

## Speed
The app is optimistic (screens update instantly, the Sheet saves in the background). On the Apps Script side each request now makes about half the Sheets calls, and the Log tab (the biggest) is no longer read on every save.

## Dates
Every date – in the app, the PO PDF and the Google Sheet – is **DD-MMM-YYYY** (e.g. `05-Oct-2026`); timestamps (Updated At, Log time) are `05-Oct-2026 15:30:12` in Indian time. In the Sheet you may type a date in any usual way (`5/10/2026`, `05-10-2026`, `5 Oct 2026`, `2026-10-05`) – day always comes first – and it is understood and rewritten in the standard form. Running `setup` once converts all existing dates in an older Sheet.

## Stock valuation – FIFO (First-In, First-Out)
- Every goods receipt line is a **batch** (date, GRN/invoice, qty, price before tax). Opening stock entered with *Adjust stock* + a **unit cost** is the first batch.
- Every issue (and every negative adjustment) is taken from the **oldest batch first**, then the next one. Each brand of an item has its own queue.
- Stock screen: **FIFO value (₹)** per item/brand = sum of remaining batch qty × that batch's price; **FIFO batches** lists what is left in each batch; the log shows the **FIFO cost** of every issue.
- It is calculated from the Stock/Receipts data (nothing extra to maintain). A red `*` / "no cost" means opening stock was entered without a unit cost – add a correcting adjustment with the cost. If only recent history is loaded, older stock counts as one batch with unknown cost until you press *Load full history*.

## What each role sees
Every login gets only the screens, dashboard tiles and figures it needs. The menu is a column in the **Roles** tab: **"Screens this role sees (comma separated, or All)"**.

| Role | Default menu | Notes |
|---|---|---|
| Admin | everything | Level 5+ always sees all screens |
| Factory Head | Dashboard, Purchase Orders, Stock | approves POs |
| Purchase | Dashboard, Purchase Orders, Stock, Vendors, Items & Prices | no bank details, no payment figures |
| Accounts | Dashboard, Purchase Orders, Accounts, Vendors | sees payment figures and vendor bank details |
| Inventory | Dashboard, Purchase Orders, Goods Receipt, Stock | no payment figures |

- To change a menu, edit that cell in the Roles tab (names: Dashboard, Purchase Orders, Goods Receipt, Stock, Accounts, Vendors, Items & Prices, Users & Access). Blank cells of the standard roles are refilled with the defaults by `setup`; your own text is never overwritten. A new custom role with a blank cell sees Dashboard + Purchase Orders only.
- Typing a hidden screen's address shows "This screen is not part of your role". Payment columns and tiles appear only for roles that see Accounts; vendor bank details are removed by the server for anyone who can neither pay nor manage vendors.
- This is a view restriction, not a security vault: the server still re-checks every action, but keep the spreadsheet itself shared with the Admin only.

## Access model
- Every screen and button follows the **Roles** tab. Approval is by *role at the current step*: a PO "Pending Admin" can be approved only by a user whose Role is `Admin`.
- The server re-checks every save: role permission, approval route (recomputed from the Roles tab), prices (must equal that vendor's price), received quantity vs pending, advance deduction, invoice total, payments (accepted invoice, not above the balance), stock issue (not below zero), no edits to past payments/stock/log, and a version check so two people can't silently overwrite each other.
- Passwords are SHA-256 hashes in the Users tab (a plain password typed there is hashed at that person's next login). 5 wrong tries lock a login for 15 minutes; sessions last 6 hours.
- **Honest limits:** an internal tool on Google Apps Script, not bank-grade. Anyone who can *edit the spreadsheet* can change anything (including passwords) – that is why only the Admin gets access. Each save takes ~1–3 s. Files must be images/PDF up to 8 MB (photos are shrunk automatically).

## Troubleshooting
| Symptom | Fix |
|---|---|
| "The Sheet is not set up yet" | Run `setup` in Apps Script, then redeploy a new version |
| "No password has been set for this login yet" | Type a password in the Users tab |
| "Cannot reach the server" / invalid data | URL wrong, or the deployment's access is not **Anyone** |
| Changed Code.gs but nothing changed | **Deploy → Manage deployments → New version** |
| A role can't see a button | Roles tab: that role's column must say **Yes** (and the Role spelling in Users must match) |
| "Someone else has just changed this record" | Normal when two people edit at once – data is reloaded, repeat the action |
| "This page could not be shown" | A row in the Sheet is incomplete (e.g. a vendor row was deleted that an old PO uses). Restore it or press Reload |

## Develop
```bash
npm install
npm run dev            # http://localhost:3000
npm run build
npm test               # server rules + generated Code.gs smoke test (test-only sample data)
npm run build:server   # regenerates apps-script/Code.gs after changing src/shared/*
node tests/scale.mjs 8 4   # simulate 4 years at 8 POs/day
```

| Change… | Edit |
|---|---|
| Sheet columns / new tab | `src/shared/schema.ts` → `npm run build:server` → re-paste `Code.gs` → new deployment version → run `setup` (adds missing columns, never overwrites) |
| Server rules, permissions, validations | `src/shared/core.ts` |
| Starter roles / settings | `src/shared/seed.ts` |
| Calculations (outstanding, due dates, stock on hand) | `src/domain.ts` |
| What the browser does for each step | `src/store.ts` |
| Screens | `src/pages/*` |
| Google Sheets / Drive adapter, backups | `apps-script/host.gs` |

## Next phase (from the process doc)
Requisition slip → PO link, BOM & customization. (Inventory out is done: Stock → Issue stock.)
