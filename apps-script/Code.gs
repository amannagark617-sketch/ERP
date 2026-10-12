// GENERATED FILE - do not edit by hand. Run `npm run build:server` after changing src/shared/*.
/**
 * Little Nap ERP – Google Apps Script host.
 * `Core` (bundled below this file's contents in Code.gs) holds all the logic; this file only talks to Sheets / Drive.
 *
 * TWO Google Spreadsheet files are used:
 *   DATA   – the sheet this script is attached to: vendors, POs, receipts, payments, audit log …
 *   ACCESS – a separate file, created automatically by setup(): Users (Login ID + password), Roles, Permissions,
 *            ApprovalRules, Settings. Share it with the Admin only.
 *
 * See README.md  →  "Activate the app"  for the step-by-step guide.
 *
 * After changing this file later: Deploy > Manage deployments > Edit > New version (the URL stays the same).
 */

// Optional: to use an ACCESS sheet you already made, paste its ID here (the long text in its URL between /d/ and /edit).
// Leave empty and setup() will create one for you.
var ACCESS_SPREADSHEET_ID = '';

var ROOT_FOLDER_NAME = 'Little Nap ERP Files';

var _books = {};
function _ss(book) {
  if (_books[book]) return _books[book];
  var props = PropertiesService.getScriptProperties();
  var key = book === 'access' ? 'ACCESS_SS_ID' : 'DATA_SS_ID';
  var id = book === 'access' ? (ACCESS_SPREADSHEET_ID || props.getProperty(key)) : props.getProperty(key);
  var ss;
  if (id) ss = SpreadsheetApp.openById(id);
  else if (book === 'access') {
    ss = SpreadsheetApp.create('Little Nap ERP - Access (logins & settings)');
    props.setProperty(key, ss.getId());
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('Open this script from inside the Google Sheet (Extensions > Apps Script) and run setup() there.');
    props.setProperty(key, ss.getId());
  }
  _books[book] = ss;
  return ss;
}

var host = {
  now: function () { return new Date().toISOString(); },
  uuid: function () { return Utilities.getUuid(); },

  ensureSheet: function (book, name, headers, textHeaders) {
    var ss = _ss(book);
    var sh = ss.getSheetByName(name);
    if (!sh) { sh = ss.insertSheet(name); sh.setFrozenRows(1); }
    var width = Math.max(sh.getLastColumn(), 1);
    var existing = sh.getRange(1, 1, 1, width).getValues()[0].map(String);
    headers.forEach(function (h) {
      if (existing.indexOf(h) < 0) {
        var col = existing.filter(function (x) { return x !== ''; }).length + 1;
        sh.getRange(1, col).setValue(h).setFontWeight('bold').setBackground('#f3e5d8');
        existing[col - 1] = h;
      }
    });
    // Text columns stay text (so 0012 or 2026-10-12 are never auto-converted)
    textHeaders.forEach(function (h) {
      var c = existing.indexOf(h) + 1;
      if (c > 0) sh.getRange(2, c, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
    });
  },

  read: function (book, name) {
    var sh = _ss(book).getSheetByName(name);
    if (!sh || sh.getLastRow() < 1) return [];
    var tz = _ss(book).getSpreadsheetTimeZone();
    var vals = sh.getDataRange().getValues();
    var headers = vals[0].map(String);
    var out = [];
    for (var i = 1; i < vals.length; i++) {
      var empty = true, o = { __row: i + 1 };
      for (var j = 0; j < headers.length; j++) {
        var v = vals[i][j];
        if (v instanceof Date) v = Utilities.formatDate(v, tz, 'yyyy-MM-dd');
        if (v !== '' && v !== null) empty = false;
        if (headers[j]) o[headers[j]] = v;
      }
      if (!empty) out.push(o);
    }
    return out;
  },

  _write: function (sh, rowIdx, row) {
    var width = sh.getLastColumn();
    var headers = sh.getRange(1, 1, 1, width).getValues()[0].map(String);
    var range = sh.getRange(rowIdx, 1, 1, width);
    var cur = range.getValues()[0];
    headers.forEach(function (h, j) { if (h && Object.prototype.hasOwnProperty.call(row, h)) cur[j] = row[h]; });
    range.setValues([cur]);
  },
  append: function (book, name, row) {
    var sh = _ss(book).getSheetByName(name);
    var idx = Math.max(sh.getLastRow(), 1) + 1;
    host._write(sh, idx, row);
    return idx;
  },
  update: function (book, name, idx, row) { host._write(_ss(book).getSheetByName(name), idx, row); },
  remove: function (book, name, idx) { _ss(book).getSheetByName(name).deleteRow(idx); },

  withLock: function (fn) {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try { return fn(); } finally { lock.releaseLock(); }
  },

  cacheGet: function (k) { return CacheService.getScriptCache().get(k); },
  cachePut: function (k, v, ttl) { CacheService.getScriptCache().put(k, v, Math.min(ttl, 21600)); },
  cacheRemove: function (k) { CacheService.getScriptCache().remove(k); },

  saveFile: function (folderId, sub, name, mime, base64) {
    var root;
    try { root = folderId ? DriveApp.getFolderById(folderId) : null; } catch (e) { root = null; }
    if (!root) root = DriveApp.createFolder(ROOT_FOLDER_NAME);
    var it = root.getFoldersByName(sub);
    var folder = it.hasNext() ? it.next() : root.createFolder(sub);
    var blob = Utilities.newBlob(Utilities.base64Decode(base64), mime, name);
    var f = folder.createFile(blob);
    return { id: f.getId(), folderId: root.getId() };
  },
  readFile: function (id) {
    var f = DriveApp.getFileById(id);
    var blob = f.getBlob();
    return { name: f.getName(), mime: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) };
  }
};

function _json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return _json({ ok: false, error: 'Bad request' }); }
  return _json(Core.handle(host, req));
}
function doGet() { return _json({ ok: true, app: 'Little Nap ERP API', hint: 'Use POST. Paste this URL into the app.' }); }

/** Run this ONCE from the editor. Safe to run again later (adds missing tabs/columns, never overwrites data). */
function setup() {
  var msg = Core.setup(host);
  var access = _ss('access');
  var data = _ss('data');
  // Tidy: remove the empty default "Sheet1" tabs
  [data, access].forEach(function (ss) {
    var s1 = ss.getSheetByName('Sheet1');
    if (s1 && ss.getSheets().length > 1 && s1.getLastRow() === 0) ss.deleteSheet(s1);
  });
  var out = msg + '\n\nACCESS sheet (logins - share only with the Admin):\n' + access.getUrl() +
    '\n\nDATA sheet:\n' + data.getUrl() +
    '\n\nNEXT: open the ACCESS sheet > Users tab > type a password for the "admin" row. Then Deploy > New deployment > Web app.';
  Logger.log(out);
  try { SpreadsheetApp.getUi().alert(out); } catch (e) { /* not run from a Sheet window */ }
  return out;
}

// ===================== bundled server logic (src/shared) =====================
"use strict";
var Core = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/shared/core.ts
  var core_exports = {};
  __export(core_exports, {
    ApiError: () => ApiError,
    handle: () => handle,
    routeFor: () => routeFor,
    setup: () => setup
  });

  // src/shared/schema.ts
  var c = (key, header, type = "text") => ({ key, header, type });
  var SYSTEM_COLS = [c("_v", "Version", "num"), c("_at", "Updated At"), c("_by", "Updated By")];
  var TABLES = {
    // ---------- Master data (HO) ----------
    items: {
      sheet: "Items",
      id: "id",
      kind: "data",
      autoId: "I",
      cols: [c("id", "Item ID"), c("name", "Item Name"), c("unit", "Unit")]
    },
    vendors: {
      sheet: "Vendors",
      id: "id",
      kind: "data",
      autoId: "V",
      cols: [
        c("id", "Vendor ID"),
        c("name", "Vendor Name"),
        c("contact", "Contact Person"),
        c("email", "Email"),
        c("whatsapp", "WhatsApp"),
        c("msme", "MSME (Yes/No)", "bool"),
        c("msmeType", "MSME Type"),
        c("udyamNo", "Udyam Registration No"),
        c("gstin", "GSTIN"),
        c("pan", "PAN"),
        c("address", "Address"),
        c("city", "City"),
        c("state", "State"),
        c("paymentTermsDays", "Payment Terms (days)", "num"),
        c("bankName", "Bank Name"),
        c("accountNo", "Bank Account No"),
        c("ifsc", "IFSC"),
        c("active", "Active (Yes/No)", "bool")
      ]
    },
    vendorItems: {
      sheet: "VendorItems",
      id: "id",
      kind: "data",
      deriveId: (r) => `${r.vendorId}:${r.itemId}`,
      cols: [c("id", "Key (auto)"), c("vendorId", "Vendor ID"), c("itemId", "Item ID"), c("price", "Agreed Price", "num")]
    },
    // ---------- Purchase orders ----------
    pos: {
      sheet: "PurchaseOrders",
      id: "id",
      kind: "data",
      cols: [
        c("id", "PO Key"),
        c("poNo", "PO No"),
        c("date", "PO Date", "date"),
        c("vendorId", "Vendor ID"),
        c("terms", "Terms & Conditions"),
        c("advanceRequired", "Advance Required (Yes/No)", "bool"),
        c("advanceAmount", "Advance Amount", "num"),
        c("expectedDate", "Expected Delivery", "date"),
        c("status", "Status"),
        c("advanceStatus", "Advance Status"),
        c("route", "Approval Route"),
        c("step", "Approval Step", "num"),
        c("sentVia", "Sent Via"),
        c("sentTo", "Sent To"),
        c("createdBy", "Created By"),
        c("department", "Department")
      ]
    },
    poLines: {
      sheet: "POLines",
      id: "id",
      kind: "data",
      deriveId: (r) => `${r.poId}:${r.itemId}`,
      cols: [c("id", "Key (auto)"), c("poId", "PO Key"), c("itemId", "Item ID"), c("qty", "Quantity", "num"), c("price", "Price", "num")]
    },
    poHistory: {
      sheet: "POHistory",
      id: "id",
      kind: "data",
      cols: [c("id", "Key"), c("poId", "PO Key"), c("date", "Date", "date"), c("by", "By"), c("text", "Event")]
    },
    // ---------- Goods receipt ----------
    receipts: {
      sheet: "Receipts",
      id: "id",
      kind: "data",
      cols: [
        c("id", "Receipt Key"),
        c("grnNo", "GRN No"),
        c("poId", "PO Key"),
        c("invoiceNo", "Invoice No"),
        c("invoiceDate", "Invoice Date", "date"),
        c("receivedDate", "Received Date (Factory In)", "date"),
        c("subtotal", "Sub-total", "num"),
        c("taxTotal", "Tax", "num"),
        c("grandTotal", "Grand Total", "num"),
        c("advanceAdjusted", "Advance Adjusted", "num"),
        c("payable", "Payable", "num"),
        c("accepted", "Accepted by Accounts (Yes/No)", "bool"),
        c("acceptedDate", "Accepted Date", "date"),
        c("invoiceFile", "Invoice File (Drive ID)"),
        c("createdBy", "Created By")
      ]
    },
    receiptLines: {
      sheet: "ReceiptLines",
      id: "id",
      kind: "data",
      deriveId: (r) => `${r.receiptId}:${r.itemId}`,
      cols: [c("id", "Key (auto)"), c("receiptId", "Receipt Key"), c("itemId", "Item ID"), c("qty", "Quantity", "num"), c("price", "Price", "num"), c("taxRate", "Tax %", "num")]
    },
    // ---------- Payments ----------
    payments: {
      sheet: "Payments",
      id: "id",
      kind: "data",
      cols: [
        c("id", "Key"),
        c("kind", "Type"),
        c("poId", "PO Key"),
        c("receiptId", "Receipt Key"),
        c("openingId", "Opening Balance Key"),
        c("amount", "Amount", "num"),
        c("date", "Payment Date", "date"),
        c("screenshot", "Screenshot (Drive ID)"),
        c("paidBy", "Paid By")
      ]
    },
    openings: {
      sheet: "OpeningBalances",
      id: "id",
      kind: "data",
      cols: [c("id", "Key"), c("vendorId", "Vendor ID"), c("ref", "Reference"), c("amount", "Amount", "num"), c("dueDate", "Due Date", "date")]
    },
    queries: {
      sheet: "PriceQueries",
      id: "id",
      kind: "data",
      cols: [c("id", "Key"), c("poId", "PO Key"), c("itemId", "Item ID"), c("note", "Note"), c("raisedBy", "Raised By"), c("date", "Date", "date"), c("status", "Status")]
    },
    counters: {
      sheet: "Counters",
      id: "id",
      kind: "config",
      cols: [c("id", "Counter"), c("value", "Last Number", "num")]
    },
    // ---------- Access control & configuration (edit directly in the Sheet) ----------
    users: {
      sheet: "Users",
      id: "loginId",
      kind: "config",
      book: "access",
      cols: [
        c("loginId", "Login ID"),
        c("password", "Password"),
        c("name", "Full Name"),
        c("role", "Role"),
        c("department", "Department"),
        c("level", "Level", "num"),
        c("reportsTo", "Reports To (Login ID)"),
        c("active", "Active (Yes/No)", "bool")
      ]
    },
    roles: {
      sheet: "Roles",
      id: "role",
      kind: "config",
      book: "access",
      cols: [c("role", "Role"), c("level", "Default Level", "num"), c("department", "Department"), c("description", "Description")]
    },
    permissions: {
      sheet: "Permissions",
      id: "action",
      kind: "config",
      book: "access",
      cols: [c("action", "Action"), c("roles", "Allowed Roles (comma separated, * = everyone)"), c("minLevel", "Or Level At Least", "num"), c("description", "What it allows")]
    },
    approvalRules: {
      sheet: "ApprovalRules",
      id: "step",
      kind: "config",
      book: "access",
      cols: [c("step", "Step", "num"), c("fromValue", "Applies When PO Value Above", "num"), c("approverRole", "Approver Role"), c("description", "Note")]
    },
    settings: {
      sheet: "Settings",
      id: "key",
      kind: "config",
      book: "access",
      cols: [c("key", "Setting"), c("value", "Value"), c("description", "Meaning")]
    },
    audit: {
      sheet: "AuditLog",
      id: "id",
      kind: "config",
      cols: [c("id", "Key"), c("time", "Time"), c("user", "User"), c("role", "Role"), c("action", "Action"), c("detail", "Detail")]
    }
  };
  var DATA_TABLES = Object.keys(TABLES).filter((k) => TABLES[k].kind === "data");
  var def = (k) => TABLES[k];
  var bookOf = (d) => {
    var _a;
    return (_a = d.book) != null ? _a : "data";
  };
  var allCols = (d) => d.kind === "data" ? [...d.cols, ...SYSTEM_COLS] : d.cols;
  var truthy = (v) => v === true || /^(yes|y|true|1)$/i.test(String(v != null ? v : "").trim());
  function fromSheet(d, raw) {
    const e = {};
    for (const col of allCols(d)) {
      const v = raw[col.header];
      if (col.type === "num") e[col.key] = v === "" || v == null ? 0 : Number(v) || 0;
      else if (col.type === "bool") e[col.key] = truthy(v);
      else e[col.key] = v == null ? "" : String(v).trim();
    }
    if (!e[d.id] && d.deriveId) e[d.id] = d.deriveId(e);
    return e;
  }
  function toSheet(d, e) {
    const r = {};
    for (const col of allCols(d)) {
      const v = e[col.key];
      if (col.type === "bool") r[col.header] = v ? "Yes" : "No";
      else if (col.type === "num") r[col.header] = v == null || v === "" ? "" : Number(v);
      else r[col.header] = v == null ? "" : String(v);
    }
    return r;
  }

  // src/shared/sha256.ts
  var K = [
    1116352408,
    1899447441,
    3049323471,
    3921009573,
    961987163,
    1508970993,
    2453635748,
    2870763221,
    3624381080,
    310598401,
    607225278,
    1426881987,
    1925078388,
    2162078206,
    2614888103,
    3248222580,
    3835390401,
    4022224774,
    264347078,
    604807628,
    770255983,
    1249150122,
    1555081692,
    1996064986,
    2554220882,
    2821834349,
    2952996808,
    3210313671,
    3336571891,
    3584528711,
    113926993,
    338241895,
    666307205,
    773529912,
    1294757372,
    1396182291,
    1695183700,
    1986661051,
    2177026350,
    2456956037,
    2730485921,
    2820302411,
    3259730800,
    3345764771,
    3516065817,
    3600352804,
    4094571909,
    275423344,
    430227734,
    506948616,
    659060556,
    883997877,
    958139571,
    1322822218,
    1537002063,
    1747873779,
    1955562222,
    2024104815,
    2227730452,
    2361852424,
    2428436474,
    2756734187,
    3204031479,
    3329325298
  ];
  function utf8(s) {
    const out = [];
    for (let i = 0; i < s.length; i++) {
      let cp = s.charCodeAt(i);
      if (cp >= 55296 && cp < 56320 && i + 1 < s.length) cp = 65536 + (cp - 55296 << 10) + (s.charCodeAt(++i) - 56320);
      if (cp < 128) out.push(cp);
      else if (cp < 2048) out.push(192 | cp >> 6, 128 | cp & 63);
      else if (cp < 65536) out.push(224 | cp >> 12, 128 | cp >> 6 & 63, 128 | cp & 63);
      else out.push(240 | cp >> 18, 128 | cp >> 12 & 63, 128 | cp >> 6 & 63, 128 | cp & 63);
    }
    return out;
  }
  function sha256(msg) {
    const b = utf8(msg);
    const bitLen = b.length * 8;
    b.push(128);
    while (b.length % 64 !== 56) b.push(0);
    for (let i = 7; i >= 0; i--) b.push(i >= 4 ? 0 : bitLen >>> i * 8 & 255);
    const H = [1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225];
    const w = new Array(64);
    const rr = (x, n) => x >>> n | x << 32 - n;
    for (let o = 0; o < b.length; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = b[o + i * 4] << 24 | b[o + i * 4 + 1] << 16 | b[o + i * 4 + 2] << 8 | b[o + i * 4 + 3];
      for (let i = 16; i < 64; i++) {
        const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ w[i - 15] >>> 3;
        const s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ w[i - 2] >>> 10;
        w[i] = w[i - 16] + s0 + w[i - 7] + s1 | 0;
      }
      let [a, bb, c2, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + (e & f ^ ~e & g) + K[i] + w[i] | 0;
        const t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + (a & bb ^ a & c2 ^ bb & c2) | 0;
        h = g;
        g = f;
        f = e;
        e = d + t1 | 0;
        d = c2;
        c2 = bb;
        bb = a;
        a = t1 + t2 | 0;
      }
      H[0] = H[0] + a | 0;
      H[1] = H[1] + bb | 0;
      H[2] = H[2] + c2 | 0;
      H[3] = H[3] + d | 0;
      H[4] = H[4] + e | 0;
      H[5] = H[5] + f | 0;
      H[6] = H[6] + g | 0;
      H[7] = H[7] + h | 0;
    }
    return H.map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
  }

  // src/shared/seed.ts
  var PERMISSION_ROWS = [
    ["po.save", "Purchase", "Create and edit a PO (draft / rejected)"],
    ["po.submit", "Purchase", "Submit a PO for approval"],
    ["po.send", "Purchase", "Send an approved PO to the vendor"],
    ["po.approve", "Factory Head,CA", "Approve a PO that is waiting for the user's role"],
    ["po.reject", "Factory Head,CA", "Return a PO that is waiting for the user's role"],
    ["advance.pay", "Accounts", "Pay / record a PO advance"],
    ["receipt.create", "Inventory", "Record goods receipt and invoice details"],
    ["invoice.accept", "Accounts", "Accept (book) an invoice"],
    ["payment.make", "Accounts", "Record invoice / old-balance payments"],
    ["opening.add", "Accounts", "Add old pending balances"],
    ["query.raise", "Inventory,Purchase", "Refer a price difference to HO"],
    ["master.manage", "HO", "Edit vendors, vendor prices, items and resolve price queries"],
    ["users.manage", "", "Add / edit users in the app"]
  ];
  function configSeed() {
    return {
      roles: [
        { role: "Admin", level: 5, department: "Management", description: "Full control, user management" },
        { role: "CA", level: 4, department: "Finance", description: "Second-level approver for POs above the limit" },
        { role: "HO", level: 4, department: "Head Office", description: "Backend master data: vendors, items, prices" },
        { role: "Factory Head", level: 3, department: "Factory", description: "First-level PO approver" },
        { role: "Purchase", level: 2, department: "Purchase", description: "Creates POs" },
        { role: "Accounts", level: 2, department: "Accounts", description: "Advances, invoices, payments" },
        { role: "Inventory", level: 1, department: "Factory", description: "Goods receipt at the factory" }
      ],
      // One starter login with NO password: the admin types one into the Users sheet before first use.
      users: [{ loginId: "admin", password: "", name: "Administrator", role: "Admin", department: "Management", level: 5, reportsTo: "", active: true }],
      permissions: PERMISSION_ROWS.map(([action, roles, description]) => ({ action, roles, minLevel: 5, description })),
      approvalRules: [
        { step: 1, fromValue: 0, approverRole: "Factory Head", description: "Every PO" },
        { step: 2, fromValue: 1e6, approverRole: "CA", description: "POs above Rs 10 Lac also go to the CA" }
      ],
      settings: [
        { key: "CompanyName", value: "Little Nap Recliners", description: "Shown in the app header" },
        { key: "MsmeMaxDays", value: "45", description: "Maximum payment days for MSME vendors" },
        { key: "TaxRates", value: "0,5,18", description: "Tax rates offered at goods receipt (%)" },
        { key: "InvoiceTolerance", value: "1", description: "Allowed difference (Rs) between system total and invoice total" },
        { key: "DriveFolderId", value: "", description: "Drive folder for uploads (filled in automatically)" }
      ],
      counters: [{ id: "po", value: 0 }, { id: "grn", value: 0 }]
    };
  }

  // src/shared/core.ts
  var ApiError = class extends Error {
    constructor(message, code = "ERROR") {
      super(message);
      this.code = code;
    }
  };
  var SESSION_TTL = 6 * 3600;
  var MAX_FAILS = 5;
  var LOCK_SECONDS = 15 * 60;
  var MAX_FILE_BYTES = 8 * 1024 * 1024;
  var ACTION_TABLES = {
    "po.save": ["pos", "poLines", "poHistory"],
    "po.submit": ["pos", "poHistory"],
    "po.approve": ["pos", "poHistory"],
    "po.reject": ["pos", "poHistory"],
    "po.send": ["pos", "poHistory"],
    "advance.pay": ["pos", "poHistory", "payments"],
    "receipt.create": ["receipts", "receiptLines", "pos", "poLines", "poHistory"],
    "invoice.accept": ["receipts", "poHistory"],
    "payment.make": ["payments", "poHistory"],
    "opening.add": ["openings"],
    "query.raise": ["queries"],
    "master.manage": ["vendors", "vendorItems", "items", "queries"]
  };
  var Db = class {
    constructor(host) {
      this.host = host;
      this.cache = {};
    }
    rows(k) {
      if (!this.cache[k]) {
        const d = def(k);
        this.cache[k] = this.host.read(bookOf(d), d.sheet).map((raw) => ({ ...fromSheet(d, raw), __row: raw.__row }));
      }
      return this.cache[k];
    }
    find(k, id) {
      return this.rows(k).find((r) => r[def(k).id] === id);
    }
    put(k, e) {
      const d = def(k);
      const rows = this.rows(k);
      const i = rows.findIndex((r) => r[d.id] === e[d.id]);
      if (i >= 0) {
        this.host.update(bookOf(d), d.sheet, rows[i].__row, toSheet(d, e));
        rows[i] = { ...e, __row: rows[i].__row };
      } else rows.push({ ...e, __row: this.host.append(bookOf(d), d.sheet, toSheet(d, e)) });
    }
    del(k, id) {
      const d = def(k);
      const rows = this.rows(k);
      const i = rows.findIndex((r) => r[d.id] === id);
      if (i < 0) return;
      this.host.remove(bookOf(d), d.sheet, rows[i].__row);
      const gone = rows[i].__row;
      rows.splice(i, 1);
      rows.forEach((r) => {
        if (r.__row > gone) r.__row -= 1;
      });
    }
  };
  var clean = (e) => {
    const { __row, ...rest } = e;
    return rest;
  };
  var lc = (s) => String(s != null ? s : "").trim().toLowerCase();
  function settingsOf(db) {
    const o = {};
    db.rows("settings").forEach((r) => {
      o[r.key] = r.value;
    });
    return o;
  }
  var hashPw = (loginId, pw) => "sha256:" + sha256(lc(loginId) + ":" + pw);
  function permissionsFor(db, role, level) {
    const out = [];
    db.rows("permissions").forEach((p) => {
      const roles = String(p.roles).split(",").map(lc).filter(Boolean);
      if (roles.includes("*") || roles.includes(lc(role)) || p.minLevel > 0 && level >= p.minLevel) out.push(p.action);
    });
    return out;
  }
  function buildUser(db, u) {
    const roleRow = db.rows("roles").find((r) => lc(r.role) === lc(u.role));
    const level = u.level || (roleRow == null ? void 0 : roleRow.level) || 0;
    return { loginId: u.loginId, name: u.name || u.loginId, role: u.role, department: u.department || (roleRow == null ? void 0 : roleRow.department) || "", level, permissions: permissionsFor(db, u.role, level) };
  }
  function login(host, db, req) {
    var _a;
    const id = lc(req.loginId);
    const pw = String((_a = req.password) != null ? _a : "");
    if (!id || !pw) throw new ApiError("Enter Login ID and password", "AUTH");
    const pending = db.rows("users").find((r) => lc(r.loginId) === id);
    if (pending && pending.active && !pending.password) throw new ApiError("No password has been set for this login yet. Ask the Admin to type one in the Users sheet.", "AUTH");
    const failKey = "fail:" + id;
    if (Number(host.cacheGet(failKey) || 0) >= MAX_FAILS) throw new ApiError("Too many wrong attempts. Try again in 15 minutes.", "AUTH");
    const u = db.rows("users").find((r) => lc(r.loginId) === id);
    let ok = false;
    if (u && u.active && u.password) {
      if (u.password.startsWith("sha256:")) ok = u.password === hashPw(u.loginId, pw);
      else if (u.password === pw) {
        ok = true;
        db.put("users", { ...u, password: hashPw(u.loginId, pw) });
      }
    }
    if (!ok) {
      host.cachePut(failKey, String(Number(host.cacheGet(failKey) || 0) + 1), LOCK_SECONDS);
      throw new ApiError("Wrong Login ID or password, or the account is inactive", "AUTH");
    }
    host.cacheRemove(failKey);
    const token = host.uuid().replace(/-/g, "") + host.uuid().replace(/-/g, "");
    host.cachePut("sess:" + token, u.loginId, SESSION_TTL);
    return { token, user: buildUser(db, u) };
  }
  function authenticate(host, db, token) {
    const loginId = token ? host.cacheGet("sess:" + token) : null;
    const u = loginId && db.rows("users").find((r) => r.loginId === loginId);
    if (!u || !u.active) throw new ApiError("Session expired. Please log in again.", "AUTH");
    return buildUser(db, u);
  }
  var need = (user, perm) => {
    if (!user.permissions.includes(perm)) throw new ApiError(`Your role (${user.role}) is not allowed to do this (${perm})`, "FORBIDDEN");
  };
  function bootstrap(host, db, user) {
    for (const k of ["vendors", "items"]) {
      const d = def(k);
      const rows = db.rows(k);
      let n = rows.reduce((m, r) => Math.max(m, Number(String(r[d.id]).replace(/\D/g, "")) || 0), 0);
      rows.filter((r) => !r[d.id] && (r.name || r.contact)).forEach((r) => {
        r[d.id] = d.autoId + ++n;
        db.put(k, { ...r, _v: (r._v || 0) + 1, _at: host.now(), _by: "sheet" });
      });
    }
    const data = {};
    for (const k of DATA_TABLES) data[k] = db.rows(k).filter((r) => r[def(k).id]).map(clean);
    const s = settingsOf(db);
    delete s.DriveFolderId;
    return {
      user,
      config: {
        settings: s,
        roles: db.rows("roles").map(clean),
        approvalRules: db.rows("approvalRules").map(clean).sort((a, b) => a.step - b.step)
      },
      data
    };
  }
  function sanitize(k, row) {
    const d = def(k);
    const out = {};
    for (const col of d.cols) {
      const v = row[col.key];
      if (col.type === "num") out[col.key] = Number.isFinite(Number(v)) ? Number(v) : 0;
      else if (col.type === "bool") out[col.key] = v === true || v === "Yes";
      else {
        let s = v == null ? "" : String(v).slice(0, 2e3);
        if (/^[=+@]/.test(s)) s = " " + s;
        out[col.key] = s;
      }
    }
    if (d.kind === "data") out._v = row._v === void 0 || row._v === null ? void 0 : Number(row._v);
    return out;
  }
  var PENDING = (role) => "Pending " + role;
  function routeFor(rules, value) {
    const out = [];
    [...rules].sort((a, b) => a.step - b.step).filter((r) => value > r.fromValue && r.approverRole).forEach((r) => {
      if (out[out.length - 1] !== r.approverRole) out.push(r.approverRole);
    });
    return out;
  }
  function poValueOf(db, ops, poId) {
    const lines = /* @__PURE__ */ new Map();
    db.rows("poLines").filter((l) => l.poId === poId).forEach((l) => lines.set(l.id, l));
    ops.forEach((o) => {
      if (o.table !== "poLines") return;
      if (o.t === "delete") lines.delete(o.id);
      else if (o.row.poId === poId) lines.set(o.row.id, o.row);
    });
    let v = 0;
    lines.forEach((l) => {
      v += l.qty * l.price;
    });
    return Math.round(v * 100) / 100;
  }
  function guards(action, user, ops, db) {
    var _a, _b, _c;
    const ups = (k) => ops.filter((o) => o.t === "upsert" && o.table === k).map((o) => o.row);
    const rules = db.rows("approvalRules");
    const FROZEN = ["vendorId", "terms", "expectedDate", "advanceRequired", "advanceAmount", "route", "date"];
    for (const p of ups("pos")) {
      const cur = db.find("pos", p.id);
      const bad = (m) => {
        throw new ApiError(m, "FORBIDDEN");
      };
      if (action === "po.save" || action === "po.submit") {
        if (cur && cur.status !== "Draft" && cur.status !== "Rejected") bad("This PO can no longer be edited");
        if (action === "po.submit" && !cur) bad("Save the PO first");
        if (p.status === "Draft" || cur && cur.status === "Rejected" && p.status === "Rejected") continue;
        const route = routeFor(rules, poValueOf(db, ops, p.id));
        const want = route.length ? PENDING(route[0]) : "Approved";
        if (p.status !== want || p.route !== route.join(",") || p.step !== (route.length ? 0 : route.length)) bad("Approval route does not match the ApprovalRules sheet");
        if (!route.length && p.advanceStatus !== (p.advanceRequired ? "Requested" : "Not Required")) bad("Advance status is wrong");
      } else if (action === "po.approve" || action === "po.reject") {
        if (!cur || lc(cur.status) !== lc(PENDING(user.role))) bad(`This PO is not waiting for the ${user.role}`);
        FROZEN.forEach((f) => {
          if (cur[f] !== p[f]) bad("Only the approval status can change here");
        });
        if (action === "po.reject") {
          if (p.status !== "Rejected") bad("Invalid status");
          continue;
        }
        const route = String(cur.route).split(",").filter(Boolean);
        const step = (cur.step || 0) + 1;
        const want = step < route.length ? PENDING(route[step]) : "Approved";
        if (p.status !== want || p.step !== step) bad("Invalid approval step");
        if (want === "Approved" && p.advanceStatus !== (cur.advanceRequired ? "Requested" : "Not Required")) bad("Advance status is wrong");
      } else if (action === "po.send") {
        if (!cur || cur.status !== "Approved" || cur.advanceStatus === "Requested" || p.status !== "Sent to Vendor") bad("PO cannot be sent now");
        FROZEN.forEach((f) => {
          if (cur[f] !== p[f]) bad("Only sending details can change here");
        });
      } else if (action === "advance.pay") {
        if (!cur || cur.advanceStatus !== "Requested" || !["Advance Paid", "Fully Paid"].includes(p.advanceStatus) || p.status !== cur.status) bad("No advance is pending for this PO");
        FROZEN.forEach((f) => {
          if (cur[f] !== p[f]) bad("Only the advance status can change here");
        });
      } else if (action === "receipt.create") {
        if (!cur || cur.status !== "Sent to Vendor" || p.status !== cur.status || p.vendorId !== cur.vendorId || p.route !== cur.route) bad("PO is not open for receipt");
      }
    }
    if (action === "advance.pay") {
      if (ups("payments").some((x) => x.kind !== "advance")) throw new ApiError("Only advance payments here", "FORBIDDEN");
      if (!ups("pos").length) throw new ApiError("Nothing to pay");
    }
    if (action === "payment.make") {
      for (const pay of ups("payments")) {
        if (pay.kind === "advance") throw new ApiError("Use the advance flow for advances", "FORBIDDEN");
        if (pay.amount <= 0) throw new ApiError("Amount must be positive");
        if (pay.kind === "invoice") {
          const r = db.find("receipts", pay.receiptId);
          if (!r || !r.accepted) throw new ApiError("Accept the invoice before paying", "FORBIDDEN");
          const paid = db.rows("payments").filter((x) => x.receiptId === r.id).reduce((a, x) => a + x.amount, 0);
          if (paid + pay.amount > r.payable + 0.01) throw new ApiError("Payment is more than the balance payable");
        }
        if (pay.kind === "opening") {
          const o = db.find("openings", pay.openingId);
          const paid = db.rows("payments").filter((x) => x.openingId === pay.openingId).reduce((a, x) => a + x.amount, 0);
          if (!o || paid + pay.amount > o.amount + 0.01) throw new ApiError("Payment is more than the balance payable");
        }
      }
    }
    if (action === "invoice.accept") {
      for (const r of ups("receipts")) {
        const cur = db.find("receipts", r.id);
        if (!cur || cur.accepted || !r.accepted || cur.grandTotal !== r.grandTotal || cur.payable !== r.payable) throw new ApiError("Invoice cannot be accepted", "FORBIDDEN");
      }
    }
    for (const l of ups("poLines")) {
      const cur = db.find("poLines", l.id);
      if (cur) {
        if (cur.price !== l.price) throw new ApiError("PO price cannot be changed. Ask HO to update the vendor price.", "FORBIDDEN");
        continue;
      }
      const po = (_a = ups("pos").find((p) => p.id === l.poId)) != null ? _a : db.find("pos", l.poId);
      const vi = po && db.find("vendorItems", `${po.vendorId}:${l.itemId}`);
      if (!vi || vi.price !== l.price) throw new ApiError("PO price must match the vendor price list", "FORBIDDEN");
    }
    for (const l of ups("receiptLines")) {
      const rc = (_b = ups("receipts").find((r) => r.id === l.receiptId)) != null ? _b : db.find("receipts", l.receiptId);
      const pl = rc && ((_c = ups("poLines").find((x) => x.id === `${rc.poId}:${l.itemId}`)) != null ? _c : db.find("poLines", `${rc.poId}:${l.itemId}`));
      if (!pl || pl.price !== l.price) throw new ApiError("Receipt price must equal the PO price", "FORBIDDEN");
    }
    if (action === "receipt.create") {
      const tol = Number(settingsOf(db).InvoiceTolerance || 1);
      for (const r of ups("receipts")) {
        if (db.find("receipts", r.id)) throw new ApiError("Receipts cannot be edited", "FORBIDDEN");
        const lines = ups("receiptLines").filter((l) => l.receiptId === r.id);
        const sub = lines.reduce((a, l) => a + l.qty * l.price, 0);
        const tax = lines.reduce((a, l) => a + l.qty * l.price * l.taxRate / 100, 0);
        if (!lines.length || Math.abs(sub + tax - r.grandTotal) > 0.05) throw new ApiError("Receipt total does not match its lines");
      }
    }
  }
  function nextNumber(db, name, prefix) {
    const cur = db.find("counters", name);
    const used = db.rows(name === "po" ? "pos" : "receipts").reduce((m, r) => Math.max(m, Number(String(r[name === "po" ? "poNo" : "grnNo"]).replace(/\D/g, "")) || 0), 0);
    const v = Math.max((cur == null ? void 0 : cur.value) || 0, used) + 1;
    db.put("counters", { id: name, value: v });
    return prefix + String(v).padStart(4, "0");
  }
  function commit(host, db, user, name, rawOps) {
    const tables = ACTION_TABLES[name];
    if (!tables) throw new ApiError("Unknown action " + name);
    need(user, name);
    if (!Array.isArray(rawOps) || rawOps.length > 200) throw new ApiError("Too many changes in one request");
    const ops = rawOps.map((o) => ({ t: o.t, table: o.table, id: o.id, row: o.row ? sanitizeRow(o.table, o.row) : void 0 }));
    for (const o of ops) {
      if (!tables.includes(o.table)) throw new ApiError(`${name} may not change ${o.table}`, "FORBIDDEN");
      if (o.t !== "upsert" && o.t !== "delete") throw new ApiError("Bad operation");
      if (o.t === "delete" && (o.table === "poHistory" || o.table === "payments")) throw new ApiError("This cannot be deleted", "FORBIDDEN");
      if (o.t === "upsert" && !o.row[def(o.table).id]) throw new ApiError("Row without an ID");
    }
    for (const o of ops) {
      if (o.t !== "upsert") continue;
      const cur = db.find(o.table, o.row[def(o.table).id]);
      if (cur && (o.table === "payments" || o.table === "poHistory" || o.table === "receiptLines")) throw new ApiError("Existing records cannot be edited", "FORBIDDEN");
      if (cur && o.row._v !== void 0 && o.row._v !== (cur._v || 0)) {
        throw new ApiError("Someone else has just changed this record. The latest data has been loaded; please try again.", "CONFLICT");
      }
    }
    guards(name, user, ops, db);
    const now = host.now();
    const applied = [];
    const deleted = [];
    for (const o of ops) {
      if (o.t !== "upsert") continue;
      const d = def(o.table);
      const cur = db.find(o.table, o.row[d.id]);
      const e = { ...cur ? clean(cur) : {}, ...o.row };
      e._v = (cur ? cur._v || 0 : 0) + 1;
      e._at = now;
      e._by = user.loginId;
      if (o.table === "pos") {
        if (cur) e.poNo = cur.poNo;
        else {
          e.poNo = nextNumber(db, "po", "PO-");
          e.createdBy = user.name;
          e.department = user.department;
        }
      }
      if (o.table === "receipts") {
        if (cur) e.grnNo = cur.grnNo;
        else {
          e.grnNo = nextNumber(db, "grn", "GRN-");
          e.createdBy = user.name;
        }
      }
      if (o.table === "poHistory") {
        e.by = user.name;
        e.date = e.date || now.slice(0, 10);
      }
      if (o.table === "payments") e.paidBy = user.name;
      db.put(o.table, e);
      applied.push({ table: o.table, row: clean(e) });
    }
    for (const o of ops) {
      if (o.t === "delete") {
        db.del(o.table, o.id);
        deleted.push({ table: o.table, id: o.id });
      }
    }
    const detail = ops.map((o) => `${o.t} ${o.table}:${o.t === "upsert" ? o.row[def(o.table).id] : o.id}`).join("; ").slice(0, 1500);
    db.put("audit", { id: host.uuid(), time: now, user: user.loginId, role: user.role, action: name, detail });
    return { applied, deleted };
  }
  var sanitizeRow = (k, row) => {
    if (!(k in TABLES) || TABLES[k].kind !== "data") throw new ApiError("Unknown table " + k);
    return sanitize(k, row);
  };
  function upload(host, db, user, req) {
    if (!user.permissions.some((p) => ["advance.pay", "payment.make", "receipt.create", "po.save", "master.manage"].includes(p))) throw new ApiError("Not allowed to upload", "FORBIDDEN");
    const b64 = String(req.data || "");
    if (!b64 || b64.length * 0.75 > MAX_FILE_BYTES) throw new ApiError("File is empty or larger than 8 MB");
    if (!/^(image\/|application\/pdf$)/.test(String(req.mime))) throw new ApiError("Only images and PDF files are allowed");
    const safe = String(req.name || "file").replace(/[^\w.\- ]+/g, "_").slice(0, 80);
    const sub = String(req.folder || "General").replace(/[^\w.\- ]+/g, "_").slice(0, 40);
    const s = settingsOf(db);
    const f = host.saveFile(s.DriveFolderId || "", sub, `${host.now().slice(0, 10)}_${user.loginId}_${safe}`, String(req.mime), b64);
    if (f.folderId !== s.DriveFolderId) {
      const row = db.find("settings", "DriveFolderId");
      db.put("settings", { ...row || { key: "DriveFolderId", description: "" }, value: f.folderId });
    }
    return { fileId: f.id, name: safe };
  }
  function usersList(db) {
    return { users: db.rows("users").map((u) => ({ loginId: u.loginId, name: u.name, role: u.role, department: u.department, level: u.level, reportsTo: u.reportsTo, active: u.active })), roles: db.rows("roles").map(clean) };
  }
  function usersSave(db, req) {
    const u = req.user || {};
    const id = String(u.loginId || "").trim();
    if (!/^[A-Za-z0-9._-]{3,30}$/.test(id)) throw new ApiError("Login ID: 3-30 letters, numbers, . _ -");
    if (!db.rows("roles").some((r) => lc(r.role) === lc(u.role))) throw new ApiError("Unknown role. Add it to the Roles sheet first.");
    const cur = db.rows("users").find((r) => lc(r.loginId) === lc(id));
    if (!cur && !u.password) throw new ApiError("Set a password for the new user");
    if (u.password && String(u.password).length < 6) throw new ApiError("Password must be at least 6 characters");
    db.put("users", {
      loginId: cur ? cur.loginId : id,
      password: u.password ? hashPw(id, String(u.password)) : cur.password,
      name: sanitize2(u.name),
      role: sanitize2(u.role),
      department: sanitize2(u.department),
      level: Number(u.level) || 0,
      reportsTo: sanitize2(u.reportsTo),
      active: u.active !== false
    });
  }
  var sanitize2 = (s) => {
    const v = String(s != null ? s : "").slice(0, 100);
    return /^[=+@]/.test(v) ? " " + v : v;
  };
  function changePassword(host, db, user, req) {
    const u = db.rows("users").find((r) => r.loginId === user.loginId);
    if (hashPw(u.loginId, String(req.oldPassword)) !== u.password && u.password !== String(req.oldPassword)) throw new ApiError("Current password is wrong");
    if (String(req.newPassword || "").length < 6) throw new ApiError("New password must be at least 6 characters");
    db.put("users", { ...u, password: hashPw(u.loginId, String(req.newPassword)) });
  }
  function handle(host, req) {
    try {
      if (!req || typeof req !== "object") throw new ApiError("Bad request");
      const db = new Db(host);
      if (!host.read("access", TABLES.users.sheet).length && req.action !== "ping") throw new ApiError("The Sheet is not set up yet. Run setup() in Apps Script first.", "SETUP");
      switch (req.action) {
        case "ping":
          return { ok: true, pong: true };
        case "login":
          return { ok: true, ...host.withLock(() => login(host, db, req)) };
        case "logout":
          host.cacheRemove("sess:" + req.token);
          return { ok: true };
        case "bootstrap":
          return { ok: true, ...host.withLock(() => {
            const d2 = new Db(host);
            return bootstrap(host, d2, authenticate(host, d2, req.token));
          }) };
        case "commit":
          return { ok: true, ...host.withLock(() => {
            const d2 = new Db(host);
            return commit(host, d2, authenticate(host, d2, req.token), String(req.name), req.ops);
          }) };
        case "upload":
          return { ok: true, ...host.withLock(() => {
            const d2 = new Db(host);
            return upload(host, d2, authenticate(host, d2, req.token), req);
          }) };
        case "file": {
          authenticate(host, db, req.token);
          const f = host.readFile(String(req.fileId));
          return { ok: true, ...f };
        }
        case "changePassword":
          return host.withLock(() => {
            const d2 = new Db(host);
            changePassword(host, d2, authenticate(host, d2, req.token), req);
            return { ok: true };
          });
        case "users.list": {
          const u = authenticate(host, db, req.token);
          need(u, "users.manage");
          return { ok: true, ...usersList(db) };
        }
        case "users.save":
          return host.withLock(() => {
            var _a;
            const d2 = new Db(host);
            const u = authenticate(host, d2, req.token);
            need(u, "users.manage");
            usersSave(d2, req);
            d2.put("audit", { id: host.uuid(), time: host.now(), user: u.loginId, role: u.role, action: "users.save", detail: String((_a = req.user) == null ? void 0 : _a.loginId) });
            return { ok: true, ...usersList(d2) };
          });
        default:
          throw new ApiError("Unknown request");
      }
    } catch (e) {
      if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
      return { ok: false, error: "Server error: " + ((e == null ? void 0 : e.message) || e), code: "SERVER" };
    }
  }
  function setup(host, extra) {
    const keys = Object.keys(TABLES);
    for (const k of keys) {
      const d = def(k);
      const cols = allCols(d);
      host.ensureSheet(bookOf(d), d.sheet, cols.map((c2) => c2.header), cols.filter((c2) => c2.type === "text" || c2.type === "date").map((c2) => c2.header));
    }
    const db = new Db(host);
    const fill = (rows) => {
      for (const k of Object.keys(rows)) {
        if (db.rows(k).length) continue;
        for (const r of rows[k]) db.put(k, def(k).kind === "data" ? { ...r, _v: 1, _at: host.now(), _by: "setup" } : r);
      }
    };
    if (extra) fill(extra);
    fill(configSeed());
    return "Setup complete.";
  }
  return __toCommonJS(core_exports);
})();
