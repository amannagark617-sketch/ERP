// GENERATED FILE - do not edit by hand. Run `npm run build:server` after changing src/shared/*.
/**
 * Little Nap ERP - Google Apps Script host.
 * `Core` (bundled below this file's contents in Code.gs) holds all the logic; this file only talks to Sheets / Drive.
 *
 * EVERYTHING lives in ONE Google Spreadsheet: the one this script is attached to
 * (Extensions > Apps Script). Tabs, logins, data - all in that single file.
 *
 * See README.md  ->  "Activate the app"  for the step-by-step guide.
 * After changing this file later: Deploy > Manage deployments > Edit > New version (the URL stays the same).
 */

var ROOT_FOLDER_NAME = 'Little Nap ERP Files';

var _ssCache = null;
function _ss() {
  if (_ssCache) return _ssCache;
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('DATA_SS_ID');
  var ss;
  if (id) ss = SpreadsheetApp.openById(id);
  else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('Open this script from inside the Google Sheet (Extensions > Apps Script) and run setup() there.');
    props.setProperty('DATA_SS_ID', ss.getId());
  }
  _ssCache = ss;
  return ss;
}

var host = {
  now: function () { return new Date().toISOString(); },
  uuid: function () { return Utilities.getUuid(); },

  ensureSheet: function (name, headers, textHeaders, color) {
    var ss = _ss();
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
    if (color) sh.setTabColor(color);
    // Text columns stay text (so 0012 or 2026-10-12 are never auto-converted)
    textHeaders.forEach(function (h) {
      var c = existing.indexOf(h) + 1;
      if (c > 0) sh.getRange(2, c, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
    });
  },

  read: function (name) {
    var sh = _ss().getSheetByName(name);
    if (!sh || sh.getLastRow() < 1) return [];
    var tz = _ss().getSpreadsheetTimeZone();
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
  append: function (name, row) {
    var sh = _ss().getSheetByName(name);
    var idx = Math.max(sh.getLastRow(), 1) + 1;
    host._write(sh, idx, row);
    return idx;
  },
  update: function (name, idx, row) { host._write(_ss().getSheetByName(name), idx, row); },
  remove: function (name, idx) { _ss().getSheetByName(name).deleteRow(idx); },

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
  // Changes whenever anything in the spreadsheet changes (also when edited by hand) - lets the app check for news cheaply.
  stamp: function () {
    var bump = PropertiesService.getScriptProperties().getProperty('STAMP') || '0';
    var t = 0;
    try { t = DriveApp.getFileById(_ss().getId()).getLastUpdated().getTime(); } catch (e) { /* ignore */ }
    return bump + ':' + t;
  },
  bumpStamp: function () { PropertiesService.getScriptProperties().setProperty('STAMP', String(Date.now())); },
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
  var ss = _ss();
  var s1 = ss.getSheetByName('Sheet1'); // tidy: remove the empty default tab
  if (s1 && ss.getSheets().length > 1 && s1.getLastRow() === 0) ss.deleteSheet(s1);
  var out = msg + '\n\nYour spreadsheet:\n' + ss.getUrl() +
    '\n\nNEXT: open the Users tab and type a password for the "admin" row. Then Deploy > New deployment > Web app.' +
    '\nAlso run installBackup() once to get an automatic monthly backup copy in your Drive.';
  Logger.log(out);
  try { SpreadsheetApp.getUi().alert(out); } catch (e) { /* not run from a Sheet window */ }
  return out;
}

// ---------------------------------------------------------------- automatic backups
var BACKUP_KEEP = 12;     // how many monthly copies to keep
var BACKUP_FOLDER = 'Little Nap ERP Backups';

/** Copies the whole spreadsheet into a Drive folder and deletes copies older than the last BACKUP_KEEP. */
function backupNow() {
  var file = DriveApp.getFileById(_ss().getId());
  var it = DriveApp.getFoldersByName(BACKUP_FOLDER);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_FOLDER);
  var stamp = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
  file.makeCopy(file.getName() + ' - backup ' + stamp, folder);
  var files = [], f = folder.getFiles();
  while (f.hasNext()) files.push(f.next());
  files.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  for (var i = BACKUP_KEEP; i < files.length; i++) files[i].setTrashed(true);
}

/** Run once: makes a backup on the 1st of every month. */
function installBackup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'backupNow') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('backupNow').timeBased().onMonthDay(1).atHour(3).create();
  backupNow();
  Logger.log('Backup installed: a copy is made on the 1st of every month into the Drive folder "' + BACKUP_FOLDER + '" (last ' + BACKUP_KEEP + ' kept). First copy made now.');
}

// ---------------------------------------------------------------- sample data (optional)

/**
 * OPTIONAL. Fills the EMPTY business tabs with realistic sample data so you can see how everything looks and try each role:
 * 6 vendors, 12 items (several sold by 3 vendors at different prices), 10 POs at every stage, receipts, payments,
 * old pending balances, stock in/out, 2 low-stock items. Also adds 6 logins: demo.purchase, demo.factory, demo.ca,
 * demo.ho, demo.accounts, demo.store (password Demo@1234). Does nothing if the sheet already has data.
 */
function loadSampleData() {
  var msg = Core.loadSample(host, Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd'));
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* not run from a Sheet window */ }
  return msg;
}

/**
 * Run this BEFORE GOING LIVE if you loaded the sample data. Deletes every vendor, item, price, PO, receipt, payment, stock
 * movement and log row, and the demo.* logins. Keeps Users (your admin), Roles and Settings. Asks for confirmation first.
 */
function clearAllDataBeforeGoingLive() {
  var ui;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { throw new Error('Open the spreadsheet in another browser tab, then run this again so a confirmation box can be shown.'); }
  var answer = ui.alert('Delete ALL data?',
    'This permanently deletes every vendor, item, price, PO, receipt, payment, stock movement and log entry, and the demo.* logins.\n\n' +
    'Users (your admin), Roles and Settings are kept.\n\nOnly do this before real use. Continue?', ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) { Logger.log('Cancelled - nothing deleted.'); return 'Cancelled'; }
  var n = Core.clearAllData(host);
  var msg = 'Done: ' + n + ' rows deleted. The system is empty and ready for real data.';
  Logger.log(msg);
  ui.alert(msg);
  return msg;
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
    DATA_TABLES: () => DATA_TABLES,
    approversOf: () => approversOf,
    clearAllData: () => clearAllData,
    handle: () => handle,
    loadSample: () => loadSample,
    routeFor: () => routeFor,
    setup: () => setup
  });

  // src/shared/schema.ts
  var c = (key, header, type = "text", dflt = false) => ({ key, header, type, dflt });
  var SYSTEM_COLS = [c("_v", "Version", "num"), c("_at", "Updated At"), c("_by", "Updated By")];
  var ACCESS = "#e69138";
  var MASTER = "#38761d";
  var APP = "#999999";
  var TABLES = {
    // ---------- Access & settings (Admin) ----------
    users: {
      sheet: "Users",
      id: "loginId",
      kind: "config",
      color: ACCESS,
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
      color: ACCESS,
      cols: [
        c("role", "Role"),
        c("level", "Level", "num"),
        c("approvesAbove", "Approves POs above Rs (blank = not an approver)"),
        c("cPo", "Create & Send POs", "bool"),
        c("cAdvance", "Pay Advances", "bool"),
        c("cReceive", "Receive Goods (Stock In)", "bool"),
        c("cIssue", "Issue Stock (Stock Out)", "bool"),
        c("cAdjust", "Adjust Stock", "bool"),
        c("cPay", "Accept Invoices & Pay", "bool"),
        c("cMaster", "Manage Vendors, Items & Prices", "bool"),
        c("cUsers", "Manage Users", "bool")
      ]
    },
    settings: {
      sheet: "Settings",
      id: "key",
      kind: "config",
      color: ACCESS,
      cols: [c("key", "Setting"), c("value", "Value"), c("description", "Meaning")]
    },
    // ---------- Master data (HO) ----------
    vendors: {
      sheet: "Vendors",
      id: "id",
      kind: "data",
      color: MASTER,
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
        c("active", "Active (Yes/No)", "bool", true)
      ]
    },
    items: {
      sheet: "Items",
      id: "id",
      kind: "data",
      color: MASTER,
      autoId: "I",
      cols: [
        c("id", "Item ID"),
        c("name", "Item Name"),
        c("unit", "Unit"),
        c("category", "Category"),
        c("minStock", "Min Stock (low-stock alert)", "num"),
        c("active", "Active (Yes/No)", "bool", true)
      ]
    },
    prices: {
      sheet: "Prices",
      id: "id",
      kind: "data",
      color: MASTER,
      deriveId: (r) => r.vendorId && r.itemId ? `${r.vendorId}:${r.itemId}` : "",
      cols: [
        c("id", "Key (auto)"),
        c("vendorName", "Vendor Name"),
        c("itemName", "Item Name"),
        c("price", "Agreed Price (Rs)", "num"),
        c("vendorId", "Vendor ID"),
        c("itemId", "Item ID")
      ]
    },
    // ---------- Written by the app ----------
    pos: {
      sheet: "PurchaseOrders",
      id: "id",
      kind: "data",
      color: APP,
      cols: [
        c("poNo", "PO No"),
        c("date", "PO Date", "date"),
        c("vendorName", "Vendor"),
        c("status", "Status"),
        c("advanceStatus", "Advance Status"),
        c("expectedDate", "Expected Delivery", "date"),
        c("advanceRequired", "Advance Required (Yes/No)", "bool"),
        c("advanceAmount", "Advance Amount", "num"),
        c("terms", "Terms & Conditions"),
        c("route", "Approval Route"),
        c("step", "Approval Step", "num"),
        c("sentVia", "Sent Via"),
        c("sentTo", "Sent To"),
        c("poFile", "PO PDF sent (Drive ID)"),
        c("createdBy", "Created By"),
        c("department", "Department"),
        c("vendorId", "Vendor ID"),
        c("id", "PO Key")
      ]
    },
    poLines: {
      sheet: "POLines",
      id: "id",
      kind: "data",
      color: APP,
      deriveId: (r) => r.poId && r.itemId ? `${r.poId}:${r.itemId}` : "",
      cols: [
        c("poNo", "PO No"),
        c("itemName", "Item"),
        c("qty", "Quantity", "num"),
        c("price", "Price", "num"),
        c("queryNote", "Price Query to HO"),
        c("queryStatus", "Query Status"),
        c("queryBy", "Query Raised By"),
        c("poId", "PO Key"),
        c("itemId", "Item ID"),
        c("id", "Key (auto)")
      ]
    },
    receipts: {
      sheet: "Receipts",
      id: "id",
      kind: "data",
      color: APP,
      cols: [
        c("grnNo", "GRN No"),
        c("type", "Type (Invoice / Opening)"),
        c("poNo", "PO No"),
        c("vendorName", "Vendor"),
        c("invoiceNo", "Invoice No / Reference"),
        c("invoiceDate", "Invoice Date", "date"),
        c("receivedDate", "Received Date (Factory In)", "date"),
        c("subtotal", "Sub-total", "num"),
        c("taxTotal", "Tax", "num"),
        c("grandTotal", "Grand Total", "num"),
        c("advanceAdjusted", "Advance Adjusted", "num"),
        c("payable", "Payable", "num"),
        c("dueDate", "Payment Due Date", "date"),
        c("accepted", "Accepted by Accounts (Yes/No)", "bool"),
        c("acceptedDate", "Accepted Date", "date"),
        c("invoiceFile", "Invoice File (Drive ID)"),
        c("createdBy", "Created By"),
        c("poId", "PO Key"),
        c("vendorId", "Vendor ID"),
        c("id", "Receipt Key")
      ]
    },
    payments: {
      sheet: "Payments",
      id: "id",
      kind: "data",
      color: APP,
      cols: [
        c("date", "Payment Date", "date"),
        c("kind", "Type (advance / invoice)"),
        c("vendorName", "Vendor"),
        c("poNo", "PO No"),
        c("amount", "Amount", "num"),
        c("screenshot", "Screenshot (Drive ID)"),
        c("paidBy", "Paid By"),
        c("poId", "PO Key"),
        c("receiptId", "Receipt Key"),
        c("id", "Key")
      ]
    },
    stock: {
      sheet: "Stock",
      id: "id",
      kind: "data",
      color: APP,
      cols: [
        c("date", "Date", "date"),
        c("itemName", "Item"),
        c("type", "Type (IN / OUT / ADJUST)"),
        c("qty", "Quantity", "num"),
        c("toDept", "Issued To (Dept / Purpose)"),
        c("note", "Note"),
        c("grnNo", "GRN No"),
        c("price", "Price", "num"),
        c("taxRate", "Tax %", "num"),
        c("by", "By"),
        c("itemId", "Item ID"),
        c("receiptId", "Receipt Key"),
        c("id", "Key")
      ]
    },
    log: {
      sheet: "Log",
      id: "id",
      kind: "config",
      color: APP,
      cols: [c("time", "Time"), c("user", "User"), c("role", "Role"), c("action", "Action"), c("event", "Event"), c("ref", "PO Key"), c("detail", "Detail"), c("id", "Key")]
    }
  };
  var DATA_TABLES = Object.keys(TABLES).filter((k) => TABLES[k].kind === "data");
  var def = (k) => TABLES[k];
  var allCols = (d) => d.kind === "data" ? [...d.cols, ...SYSTEM_COLS] : d.cols;
  var truthy = (v) => v === true || /^(yes|y|true|1)$/i.test(String(v != null ? v : "").trim());
  function fromSheet(d, raw) {
    const e = {};
    for (const col of allCols(d)) {
      const v = raw[col.header];
      const blank = v === "" || v == null;
      if (col.type === "num") e[col.key] = blank ? 0 : Number(v) || 0;
      else if (col.type === "bool") e[col.key] = blank && col.dflt ? true : truthy(v);
      else e[col.key] = blank ? "" : String(v).trim();
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
  var caps = (...on) => Object.fromEntries(["cPo", "cAdvance", "cReceive", "cIssue", "cAdjust", "cPay", "cMaster", "cUsers"].map((k) => [k, on.includes(k)]));
  function configSeed() {
    return {
      roles: [
        { role: "Admin", level: 5, approvesAbove: "", ...caps("cPo", "cAdvance", "cReceive", "cIssue", "cAdjust", "cPay", "cMaster", "cUsers") },
        { role: "CA", level: 4, approvesAbove: "1000000", ...caps() },
        { role: "HO", level: 4, approvesAbove: "", ...caps("cMaster", "cAdjust") },
        { role: "Factory Head", level: 3, approvesAbove: "0", ...caps() },
        { role: "Purchase", level: 2, approvesAbove: "", ...caps("cPo") },
        { role: "Accounts", level: 2, approvesAbove: "", ...caps("cAdvance", "cPay") },
        { role: "Inventory", level: 1, approvesAbove: "", ...caps("cReceive", "cIssue") }
      ],
      // One starter login with NO password: the admin types one into the Users tab before first use.
      users: [{ loginId: "admin", password: "", name: "Administrator", role: "Admin", department: "Management", level: 5, reportsTo: "", active: true }],
      settings: [
        { key: "CompanyName", value: "Little Nap Recliners", description: "Shown in the app header" },
        { key: "MsmeMaxDays", value: "45", description: "Maximum payment days for MSME vendors" },
        { key: "TaxRates", value: "0,5,18", description: "Tax rates offered at goods receipt (%)" },
        { key: "InvoiceTolerance", value: "1", description: "Allowed difference (Rs) between system total and invoice total" },
        { key: "RecentMonths", value: "6", description: 'The app loads settled POs/stock from the last N months (open items always load). "Load full history" in the app shows everything' },
        { key: "CompanyLegalName", value: "Little Nap Subhav India Pvt. Ltd.", description: "Printed on the PO letterhead and footer" },
        { key: "CompanyAddress", value: "Shree Shubham Logistics Park, 27-28, AB Road Bypass|Dewas, Indore, Madhya Pradesh 455001, India", description: "Letterhead address. Use | for a new line" },
        { key: "CompanyGSTIN", value: "23AAFCL2047L1ZK", description: "Printed on the PO" },
        { key: "CompanyCIN", value: "U36999MP2022PTC063150", description: "Printed on the PO footer" },
        { key: "CompanyPhone", value: "+91 62320 05722", description: "Letterhead phone" },
        { key: "CompanyEmail", value: "inquiry@lnsindia.co.in", description: "Letterhead email" },
        { key: "CompanyWebsite", value: "www.lnsindia.co.in", description: "Letterhead website" },
        { key: "DeliverTo", value: "Little Nap Subhav Manufacturing Plant, Shree Shubham Logistics Park, 27-28, AB Road Bypass, Dewas, Madhya Pradesh 455001", description: 'The "Deliver to" address on the PO' },
        { key: "PoSignatory", value: "Authorised Signatory", description: "Text under the signature line on the PO" },
        { key: "PoTerms", value: "Please quote the PO number on every invoice, delivery challan and correspondence.|Goods are subject to inspection and acceptance at our factory. Rejected goods will be returned or replaced at the supplier's cost.|Invoices must carry GSTIN, HSN code, PO number and the vendor's bank details. Payment is released after invoice acceptance, as per the payment terms above.|MSME suppliers are paid within the period required by law (maximum 45 days).", description: "Standard terms printed on every PO. Use | between points" },
        { key: "DriveFolderId", value: "", description: "Drive folder for uploads (filled in automatically)" }
      ]
    };
  }

  // src/shared/approval.ts
  function approversOf(roles) {
    return roles.filter((r) => {
      var _a;
      return String((_a = r.approvesAbove) != null ? _a : "").trim() !== "" && Number.isFinite(Number(r.approvesAbove));
    }).map((r) => ({ role: r.role, above: Number(r.approvesAbove), level: Number(r.level) || 0 })).sort((a, b) => a.above - b.above || a.level - b.level);
  }
  function routeFor(approvers, value) {
    const out = [];
    approvers.filter((a) => value > a.above).forEach((a) => {
      if (out.indexOf(a.role) < 0) out.push(a.role);
    });
    return out;
  }

  // src/shared/sample.ts
  var SAMPLE_PASSWORD = "Demo@1234";
  var SAMPLE_USER_PREFIX = "demo.";
  var addDays = (base, n) => {
    const d = /* @__PURE__ */ new Date(base + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  var r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  function sampleUsers() {
    const u = (id, name, role, department, level) => ({ loginId: SAMPLE_USER_PREFIX + id, password: SAMPLE_PASSWORD, name, role, department, level, reportsTo: "admin", active: true });
    return [
      u("purchase", "Demo Purchase", "Purchase", "Purchase", 2),
      u("factory", "Demo Factory Head", "Factory Head", "Factory", 3),
      u("ca", "Demo CA", "CA", "Finance", 4),
      u("ho", "Demo HO", "HO", "Head Office", 4),
      u("accounts", "Demo Accounts", "Accounts", "Accounts", 2),
      u("store", "Demo Store", "Inventory", "Factory", 1)
    ];
  }
  function sampleData(t) {
    const D = (n) => addDays(t, n);
    const iso = (n) => D(n) + "T10:00:00.000Z";
    const itemSpec = [
      ["I1", "Recliner mechanism (manual)", "pcs", "Mechanism", 50, true],
      ["I2", "Recliner mechanism (motorised)", "pcs", "Mechanism", 20, true],
      ["I3", "Foam sheet 40D", "sheet", "Foam", 100, true],
      ["I4", "Leatherette fabric", "m", "Fabric", 300, true],
      ["I5", "Wooden frame set", "set", "Wood", 40, true],
      ["I6", "Packing carton", "pcs", "Packing", 100, true],
      ["I7", "Steel spring set", "set", "Hardware", 0, true],
      ["I8", "Headrest cushion", "pcs", "Foam", 0, true],
      ["I9", "Velvet fabric", "m", "Fabric", 0, true],
      ["I10", "Staples box", "pcs", "Hardware", 0, true],
      ["I11", "Adhesive 20L", "can", "Consumable", 0, true],
      ["I12", "Castor wheel set (old model)", "set", "Hardware", 0, false]
    ];
    const iName = Object.fromEntries(itemSpec.map((i) => [i[0], i[1]]));
    const vendorSpec = [
      ["V1", "Sharma Mechanisms Pvt Ltd", "Rakesh Sharma", "Delhi", "Delhi", true, "Small", 30, "HDFC Bank", "50100011112222", true],
      ["V2", "Foam & Fabric Traders", "Anita Verma", "Gurugram", "Haryana", false, "", 45, "ICICI Bank", "000405001234", true],
      ["V3", "Kailash Timber Works", "Kailash Rao", "Saharanpur", "Uttar Pradesh", true, "Micro", 15, "SBI", "30000111222", true],
      ["V4", "Bharat Foam Industries", "Mohan Lal", "Panipat", "Haryana", false, "", 30, "Axis Bank", "917020012345", true],
      ["V5", "Royal Leather House", "Sana Khan", "Agra", "Uttar Pradesh", true, "Medium", 30, "PNB", "1234002100005678", true],
      ["V6", "Delhi Hardware Mart", "Vikas Gupta", "Delhi", "Delhi", false, "", 30, "Kotak Bank", "2345678901", true],
      ["V7", "Old Supplier (not used now)", "N/A", "Jaipur", "Rajasthan", false, "", 30, "", "", false]
    ];
    const vName = Object.fromEntries(vendorSpec.map((v) => [v[0], v[1]]));
    const vendorOf = Object.fromEntries(vendorSpec.map((v) => [v[0], { msme: v[5], terms: v[7] }]));
    const priceSpec = [
      ["V1", "I1", 2400],
      ["V1", "I2", 6800],
      ["V2", "I3", 1850],
      ["V4", "I3", 1790],
      ["V6", "I3", 1880],
      ["V2", "I4", 420],
      ["V5", "I4", 395],
      ["V3", "I5", 3200],
      ["V3", "I6", 95],
      ["V6", "I6", 102],
      ["V6", "I7", 650],
      ["V4", "I8", 310],
      ["V2", "I8", 330],
      ["V5", "I9", 520],
      ["V2", "I9", 540],
      ["V6", "I10", 180],
      ["V4", "I11", 2100],
      ["V6", "I11", 2250]
    ];
    const price = (v, i) => priceSpec.find((p) => p[0] === v && p[1] === i)[2];
    const P = "Demo Purchase", F = "Demo Factory Head", C = "Demo CA", A = "Demo Accounts", S = "Demo Store", H = "Demo HO";
    const pos = [
      {
        n: 1,
        vendor: "V6",
        date: -60,
        lines: [["I6", 400]],
        status: "Sent to Vendor",
        route: ["Factory Head"],
        step: 1,
        advance: 0,
        advStatus: "Not Required",
        expected: -45,
        sent: -58,
        terms: "Delivery at factory gate.",
        events: [[-60, P, "Draft created and submitted for approval"], [-59, F, "Approved"], [-58, P, "Sent to vendor via Email"], [-55, S, "Goods received, invoice DH-221"], [-53, A, "Invoice accepted"], [-40, A, "Paid 48144 against invoice"]]
      },
      {
        n: 2,
        vendor: "V1",
        date: -48,
        lines: [["I1", 200]],
        status: "Sent to Vendor",
        route: ["Factory Head"],
        step: 1,
        advance: 1e5,
        advStatus: "Advance Paid",
        expected: -30,
        sent: -45,
        terms: "30 days credit. 50% advance.",
        events: [[-48, P, "Draft created and submitted for approval"], [-47, F, "Approved"], [-46, A, "Advance Paid: 100000"], [-45, P, "Sent to vendor via Email"], [-35, S, "Goods received, invoice SM/114 (120 of 200 pcs)"], [-33, A, "Invoice accepted"], [-20, A, "Part payment 150000 against invoice SM/114 (balance 89840 is overdue)"]]
      },
      {
        n: 3,
        vendor: "V2",
        date: -28,
        lines: [["I3", 300], ["I4", 800]],
        status: "Sent to Vendor",
        route: ["Factory Head"],
        step: 1,
        advance: 0,
        advStatus: "Not Required",
        expected: -12,
        sent: -26,
        terms: "Delivery within 15 days.",
        events: [[-28, P, "Draft created and submitted for approval"], [-27, F, "Approved"], [-26, P, "Sent to vendor via WhatsApp"], [-20, S, "Goods received, invoice FF-778"], [-18, A, "Invoice accepted"], [-8, A, "Paid 500000 against invoice"]]
      },
      {
        n: 4,
        vendor: "V3",
        date: -14,
        lines: [["I5", 100], ["I6", 500]],
        status: "Sent to Vendor",
        route: ["Factory Head"],
        step: 1,
        advance: 0,
        advStatus: "Not Required",
        expected: 3,
        sent: -12,
        terms: "Part delivery allowed.",
        events: [[-14, P, "Draft created and submitted for approval"], [-13, F, "Approved"], [-12, P, "Sent to vendor via Email"], [-2, S, "Goods received, invoice KT-5502 (60 of 100 sets)"]]
      },
      {
        n: 5,
        vendor: "V3",
        date: -7,
        lines: [["I6", 600]],
        status: "Sent to Vendor",
        route: ["Factory Head"],
        step: 1,
        advance: 0,
        advStatus: "Not Required",
        expected: 5,
        sent: -5,
        terms: "",
        events: [[-7, P, "Draft created and submitted for approval"], [-6, F, "Approved"], [-5, P, "Sent to vendor via Email"], [-1, S, "Price query raised to HO: Vendor invoice shows Rs 99 per carton, PO says Rs 95"]]
      },
      {
        n: 6,
        vendor: "V2",
        date: -6,
        lines: [["I8", 200]],
        status: "Rejected",
        route: ["Factory Head"],
        step: 0,
        advance: 0,
        advStatus: "Not Required",
        expected: 10,
        terms: "",
        events: [[-6, P, "Draft created and submitted for approval"], [-5, F, "Not approved \u2013 Bharat Foam is cheaper for headrests, please re-raise"]]
      },
      {
        n: 7,
        vendor: "V5",
        date: -4,
        lines: [["I4", 1500], ["I9", 800]],
        status: "Pending CA",
        route: ["Factory Head", "CA"],
        step: 1,
        advance: 2e5,
        advStatus: "Not Required",
        expected: 20,
        terms: "20% advance, balance 30 days.",
        events: [[-4, P, "Draft created and submitted for approval"], [-3, F, "Approved \u2013 OK to proceed, needs CA since above Rs 10 Lac"]]
      },
      {
        n: 8,
        vendor: "V6",
        date: -2,
        lines: [["I7", 100], ["I10", 50]],
        status: "Approved",
        route: ["Factory Head"],
        step: 1,
        advance: 3e4,
        advStatus: "Requested",
        expected: 12,
        terms: "Advance before dispatch.",
        events: [[-2, P, "Draft created and submitted for approval"], [-1, F, "Approved"], [-1, "System", "Advance request sent to Accounts"]]
      },
      {
        n: 9,
        vendor: "V4",
        date: -1,
        lines: [["I3", 200], ["I11", 20]],
        status: "Pending Factory Head",
        route: ["Factory Head"],
        step: 0,
        advance: 0,
        advStatus: "Not Required",
        expected: 14,
        terms: "",
        events: [[-1, P, "Draft created and submitted for approval"]]
      },
      {
        n: 10,
        vendor: "V1",
        date: 0,
        lines: [["I2", 25]],
        status: "Draft",
        route: [],
        step: 0,
        advance: 0,
        advStatus: "Not Required",
        expected: 21,
        terms: "",
        events: [[0, P, "Draft created"]]
      }
    ];
    const poNo = (n) => "PO-" + String(n).padStart(4, "0");
    const lineRows = [];
    const logRows = [];
    let lg = 0;
    const poRows = pos.map((p) => {
      p.lines.forEach(([item, qty]) => lineRows.push({
        id: `po${p.n}:${item}`,
        poId: `po${p.n}`,
        poNo: poNo(p.n),
        itemId: item,
        itemName: iName[item],
        qty,
        price: price(p.vendor, item),
        queryNote: p.n === 5 ? "Vendor invoice shows Rs 99 per carton, PO says Rs 95" : "",
        queryStatus: p.n === 5 ? "Open" : "",
        queryBy: p.n === 5 ? S : ""
      }));
      p.events.forEach(([d, who, text]) => logRows.push({ id: "lg" + ++lg, time: iso(d), user: who, role: "", action: "sample", event: text, ref: `po${p.n}`, detail: "sample data" }));
      const sentVia = p.n === 3 ? "WhatsApp" : p.sent !== void 0 ? "Email" : "";
      return {
        id: `po${p.n}`,
        poNo: poNo(p.n),
        date: D(p.date),
        vendorId: p.vendor,
        vendorName: vName[p.vendor],
        terms: p.terms,
        advanceRequired: p.advance > 0,
        advanceAmount: p.advance,
        expectedDate: D(p.expected),
        status: p.status,
        advanceStatus: p.advStatus,
        route: p.route.join(","),
        step: p.step,
        sentVia,
        sentTo: sentVia === "Email" ? p.vendor.toLowerCase() + "@example.com" : sentVia === "WhatsApp" ? "9198000000" + p.vendor.slice(1) : "",
        createdBy: P,
        department: "Purchase"
      };
    });
    const rcs = [
      { id: "r1", po: 1, grn: 1, inv: "DH-221", date: -55, lines: [["I6", 400, 18]], advAdj: 0, accepted: -53 },
      { id: "r2", po: 2, grn: 2, inv: "SM/114", date: -35, lines: [["I1", 120, 18]], advAdj: 1e5, accepted: -33 },
      { id: "r3", po: 3, grn: 3, inv: "FF-778", date: -20, lines: [["I3", 300, 18], ["I4", 800, 18]], advAdj: 0, accepted: -18 },
      { id: "r4", po: 4, grn: 4, inv: "KT-5502", date: -2, lines: [["I5", 60, 18]], advAdj: 0 }
    ];
    const receiptRows = [], stockRows = [];
    const payable = {};
    for (const r of rcs) {
      const po = pos.find((p) => p.n === r.po);
      const priced = r.lines.map(([item, qty, tax2]) => ({ item, qty, tax: tax2, price: price(po.vendor, item) }));
      const sub = r2(priced.reduce((a, l) => a + l.qty * l.price, 0));
      const tax = r2(priced.reduce((a, l) => a + l.qty * l.price * l.tax / 100, 0));
      const vi = vendorOf[po.vendor];
      payable[r.id] = r2(sub + tax - r.advAdj);
      receiptRows.push({
        id: r.id,
        grnNo: "GRN-" + String(r.grn).padStart(4, "0"),
        type: "Invoice",
        poId: `po${po.n}`,
        poNo: poNo(po.n),
        vendorId: po.vendor,
        vendorName: vName[po.vendor],
        invoiceNo: r.inv,
        invoiceDate: D(r.date),
        receivedDate: D(r.date),
        subtotal: sub,
        taxTotal: tax,
        grandTotal: r2(sub + tax),
        advanceAdjusted: r.advAdj,
        payable: payable[r.id],
        dueDate: addDays(D(r.date), vi.msme ? Math.min(vi.terms, 45) : vi.terms),
        accepted: r.accepted !== void 0,
        acceptedDate: r.accepted !== void 0 ? D(r.accepted) : "",
        invoiceFile: "",
        createdBy: S
      });
      priced.forEach((l) => stockRows.push({
        id: `${r.id}:${l.item}`,
        date: D(r.date),
        itemId: l.item,
        itemName: iName[l.item],
        type: "IN",
        qty: l.qty,
        receiptId: r.id,
        grnNo: "GRN-" + String(r.grn).padStart(4, "0"),
        price: l.price,
        taxRate: l.tax,
        toDept: "",
        note: "",
        by: S
      }));
    }
    const opening = (id, vendor, ref, amount, due) => ({
      id,
      grnNo: "",
      type: "Opening",
      poId: "",
      poNo: "",
      vendorId: vendor,
      vendorName: vName[vendor],
      invoiceNo: ref,
      invoiceDate: D(-40),
      receivedDate: D(-40),
      subtotal: amount,
      taxTotal: 0,
      grandTotal: amount,
      advanceAdjusted: 0,
      payable: amount,
      dueDate: D(due),
      accepted: true,
      acceptedDate: D(-40),
      invoiceFile: "",
      createdBy: A
    });
    receiptRows.push(opening("ob1", "V3", "Old bill KT-2291 (before this system)", 85e3, -12), opening("ob2", "V2", "Old bill FF-0912 (before this system)", 42e3, 10));
    const pay = (id, kind, poN, receiptId, amount, date, vendor) => ({
      id,
      kind,
      poId: poN ? `po${poN}` : "",
      poNo: poN ? poNo(poN) : "",
      receiptId,
      vendorName: vName[vendor],
      amount,
      date: D(date),
      screenshot: "",
      paidBy: A
    });
    const paymentRows = [
      pay("pay1", "invoice", 1, "r1", payable.r1, -40, "V6"),
      pay("pay2", "advance", 2, "", 1e5, -46, "V1"),
      pay("pay3", "invoice", 2, "r2", 15e4, -20, "V1"),
      // part payment: leaves an overdue MSME balance
      pay("pay4", "invoice", 3, "r3", 5e5, -8, "V2"),
      pay("pay5", "invoice", null, "ob2", 1e4, -3, "V2")
    ];
    const mv = (id, d, item, type, qty, toDept, note, by) => ({ id, date: D(d), itemId: item, itemName: iName[item], type, qty, receiptId: "", grnNo: "", price: 0, taxRate: 0, toDept, note, by });
    const opening60 = (id, item, qty) => mv(id, -62, item, "ADJUST", qty, "", "Opening stock", H);
    stockRows.push(
      opening60("os1", "I1", 30),
      opening60("os2", "I2", 12),
      opening60("os3", "I3", 40),
      opening60("os4", "I4", 100),
      opening60("os5", "I5", 25),
      opening60("os6", "I6", 150),
      opening60("os7", "I7", 60),
      opening60("os8", "I8", 80),
      opening60("os9", "I9", 200),
      opening60("os10", "I10", 20),
      opening60("os11", "I11", 5),
      mv("o1", -15, "I1", "OUT", 60, "Production", "Batch 14", S),
      mv("o2", -3, "I1", "OUT", 50, "Assembly", "", S),
      mv("o3", -6, "I2", "OUT", 4, "Production", "Motorised model", S),
      mv("o4", -10, "I3", "OUT", 120, "Production", "", S),
      mv("o5", -9, "I3", "ADJUST", -5, "", "Damaged in handling", H),
      mv("o6", -8, "I4", "OUT", 250, "Cutting", "Batch 14", S),
      mv("o7", -1, "I5", "OUT", 30, "Assembly", "", S),
      mv("o8", -5, "I6", "OUT", 200, "Packing", "", S),
      mv("o9", -7, "I8", "OUT", 30, "Assembly", "", S)
    );
    const sys = (rows) => rows.map((r) => ({ ...r, _v: 1, _at: iso(0), _by: "sample" }));
    return {
      items: sys(itemSpec.map((i) => ({ id: i[0], name: i[1], unit: i[2], category: i[3], minStock: i[4], active: i[5] }))),
      vendors: sys(vendorSpec.map((v) => ({
        id: v[0],
        name: v[1],
        contact: v[2],
        email: v[0].toLowerCase() + "@example.com",
        whatsapp: "9198000000" + v[0].slice(1),
        msme: v[5],
        msmeType: v[6],
        udyamNo: v[5] ? `UDYAM-${v[4].slice(0, 2).toUpperCase()}-01-000000${v[0].slice(1)}` : "",
        gstin: `07AAAAA000${v[0].slice(1)}A1Z5`,
        pan: `AAAAA000${v[0].slice(1)}A`,
        address: "Industrial Area, Plot " + v[0].slice(1),
        city: v[3],
        state: v[4],
        paymentTermsDays: v[7],
        bankName: v[8],
        accountNo: v[9],
        ifsc: "BANK0001234",
        active: v[10]
      }))),
      prices: sys(priceSpec.map(([v, i, p]) => ({ id: `${v}:${i}`, vendorId: v, vendorName: vName[v], itemId: i, itemName: iName[i], price: p }))),
      pos: sys(poRows),
      poLines: sys(lineRows),
      receipts: sys(receiptRows),
      payments: sys(paymentRows),
      stock: sys(stockRows),
      log: logRows
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
  var ADMIN_LEVEL = 5;
  var CAPS = {
    cPo: ["po.save", "po.submit", "po.send", "query.raise"],
    cAdvance: ["advance.pay"],
    cReceive: ["receipt.create", "query.raise"],
    cIssue: ["stock.issue"],
    cAdjust: ["stock.adjust"],
    cPay: ["invoice.accept", "payment.make", "opening.add"],
    cMaster: ["master.manage"],
    cUsers: ["users.manage"]
  };
  var ACTIONS = {
    "po.save": { tables: ["pos", "poLines"], edit: ["pos", "poLines"] },
    "po.submit": { tables: ["pos"], edit: ["pos"] },
    "po.approve": { tables: ["pos"], edit: ["pos"] },
    "po.reject": { tables: ["pos"], edit: ["pos"] },
    "po.send": { tables: ["pos"], edit: ["pos"] },
    "advance.pay": { tables: ["pos", "payments"], edit: ["pos"] },
    "receipt.create": { tables: ["receipts", "stock", "poLines"], edit: ["poLines"] },
    "invoice.accept": { tables: ["receipts"], edit: ["receipts"] },
    "payment.make": { tables: ["payments"], edit: [] },
    "opening.add": { tables: ["receipts"], edit: [] },
    "query.raise": { tables: ["poLines"], edit: ["poLines"] },
    "stock.issue": { tables: ["stock"], edit: [] },
    "stock.adjust": { tables: ["stock"], edit: [] },
    "master.manage": { tables: ["vendors", "items", "prices", "poLines"], edit: ["vendors", "items", "prices", "poLines"] }
  };
  var DELETABLE = { "po.save": ["poLines"], "master.manage": ["prices"] };
  var APPLY_ORDER = ["vendors", "items", "prices", "pos", "poLines", "receipts", "payments", "stock"];
  var Db = class {
    constructor(host) {
      this.host = host;
      this.cache = {};
    }
    rows(k) {
      if (!this.cache[k]) {
        const d = def(k);
        this.cache[k] = this.host.read(d.sheet).map((raw) => ({ ...fromSheet(d, raw), __row: raw.__row }));
      }
      return this.cache[k];
    }
    find(k, id) {
      return id ? this.rows(k).find((r) => r[def(k).id] === id) : void 0;
    }
    put(k, e) {
      const d = def(k);
      const rows = this.rows(k);
      const i = rows.findIndex((r) => r[d.id] === e[d.id]);
      if (i >= 0) {
        this.host.update(d.sheet, rows[i].__row, toSheet(d, e));
        rows[i] = { ...e, __row: rows[i].__row };
      } else rows.push({ ...e, __row: this.host.append(d.sheet, toSheet(d, e)) });
    }
    /** Rewrite a row that is already loaded (used to repair rows typed by hand). */
    touch(k, row) {
      this.host.update(def(k).sheet, row.__row, toSheet(def(k), row));
    }
  };
  var clean = (e) => {
    const { __row, ...rest } = e;
    return rest;
  };
  var lc = (s) => String(s != null ? s : "").trim().toLowerCase();
  var r22 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  function settingsOf(db) {
    const o = {};
    db.rows("settings").forEach((r) => {
      o[r.key] = r.value;
    });
    return o;
  }
  var hashPw = (loginId, pw) => "sha256:" + sha256(lc(loginId) + ":" + pw);
  function permissionsFor(db, role, level) {
    const r = db.rows("roles").find((x) => lc(x.role) === lc(role));
    const out = [];
    const add = (a) => a.forEach((x) => {
      if (out.indexOf(x) < 0) out.push(x);
    });
    for (const cap of Object.keys(CAPS)) if (level >= ADMIN_LEVEL || r && r[cap]) add(CAPS[cap]);
    if (r && approversOf([r]).length) add(["po.approve", "po.reject"]);
    return out;
  }
  function buildUser(db, u) {
    const roleRow = db.rows("roles").find((r) => lc(r.role) === lc(u.role));
    const level = u.level || (roleRow == null ? void 0 : roleRow.level) || 0;
    return { loginId: u.loginId, name: u.name || u.loginId, role: (roleRow == null ? void 0 : roleRow.role) || u.role, department: u.department || "", level, permissions: permissionsFor(db, u.role, level) };
  }
  function login(host, db, req) {
    var _a;
    const id = lc(req.loginId);
    const pw = String((_a = req.password) != null ? _a : "");
    if (!id || !pw) throw new ApiError("Enter Login ID and password", "AUTH");
    const failKey = "fail:" + id;
    if (Number(host.cacheGet(failKey) || 0) >= MAX_FAILS) throw new ApiError("Too many wrong attempts. Try again in 15 minutes.", "AUTH");
    const u = db.rows("users").find((r) => lc(r.loginId) === id);
    if (u && u.active && !u.password) throw new ApiError("No password has been set for this login yet. Ask the Admin to type one in the Users tab.", "AUTH");
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
    if (user.permissions.indexOf(perm) < 0) throw new ApiError(`Your role (${user.role}) is not allowed to do this (${perm})`, "FORBIDDEN");
  };
  var signed = (r) => r.type === "IN" ? r.qty : r.type === "OUT" ? -r.qty : r.qty;
  function balances(db) {
    const b = {};
    db.rows("stock").forEach((r) => {
      if (r.itemId) b[r.itemId] = r22((b[r.itemId] || 0) + signed(r));
    });
    return b;
  }
  function receivedQty(db, poId, itemId) {
    const ids = new Set(db.rows("receipts").filter((r) => r.poId === poId).map((r) => r.id));
    return db.rows("stock").filter((s) => s.type === "IN" && s.itemId === itemId && ids.has(s.receiptId)).reduce((a, s) => a + s.qty, 0);
  }
  function monthsAgo(today, n) {
    const d = /* @__PURE__ */ new Date(today + "T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() - n);
    return d.toISOString().slice(0, 10);
  }
  function repairHandTypedRows(host, db) {
    const now = host.now();
    const stamp = (r) => {
      r._v = (r._v || 0) + 1;
      r._at = now;
      r._by = "sheet";
    };
    for (const k of ["vendors", "items"]) {
      const d = def(k);
      const rows = db.rows(k);
      let n = rows.reduce((m, r) => Math.max(m, Number(String(r[d.id]).replace(/\D/g, "")) || 0), 0);
      rows.filter((r) => !r[d.id] && r.name).forEach((r) => {
        r[d.id] = d.autoId + ++n;
        stamp(r);
        db.touch(k, r);
      });
    }
    const vendors = db.rows("vendors"), items = db.rows("items");
    for (const p of db.rows("prices")) {
      let changed = false;
      if (!p.vendorId && p.vendorName) {
        const v2 = vendors.find((x) => lc(x.name) === lc(p.vendorName));
        if (v2) {
          p.vendorId = v2.id;
          changed = true;
        }
      }
      if (!p.itemId && p.itemName) {
        const i2 = items.find((x) => lc(x.name) === lc(p.itemName));
        if (i2) {
          p.itemId = i2.id;
          changed = true;
        }
      }
      const v = vendors.find((x) => x.id === p.vendorId), i = items.find((x) => x.id === p.itemId);
      if (v && p.vendorName !== v.name) {
        p.vendorName = v.name;
        changed = true;
      }
      if (i && p.itemName !== i.name) {
        p.itemName = i.name;
        changed = true;
      }
      const id = p.vendorId && p.itemId ? `${p.vendorId}:${p.itemId}` : "";
      if (id && p.id !== id) {
        p.id = id;
        changed = true;
      }
      if (changed) {
        stamp(p);
        db.touch("prices", p);
      }
    }
  }
  function bootstrap(host, db, user, all) {
    repairHandTypedRows(host, db);
    const s = settingsOf(db);
    const recent = Math.max(1, Number(s.RecentMonths) || 6);
    const cutoff = monthsAgo(host.now().slice(0, 10), recent);
    const pos = db.rows("pos").filter((r) => r.id);
    const lines = db.rows("poLines").filter((r) => r.id);
    const receipts = db.rows("receipts").filter((r) => r.id);
    const payments = db.rows("payments").filter((r) => r.id);
    const stock = db.rows("stock").filter((r) => r.id);
    const group = (rows, key) => {
      const m = /* @__PURE__ */ new Map();
      rows.forEach((r) => {
        const k = key(r);
        if (k) (m.get(k) || m.set(k, []).get(k)).push(r);
      });
      return m;
    };
    const linesByPO = group(lines, (l) => l.poId);
    const receiptsByPO = group(receipts, (r) => r.poId);
    const rcptPO = new Map(receipts.map((r) => [r.id, r.poId]));
    const inQty = /* @__PURE__ */ new Map();
    stock.forEach((x) => {
      const po = x.type === "IN" ? rcptPO.get(x.receiptId) : "";
      if (po) inQty.set(po + ":" + x.itemId, (inQty.get(po + ":" + x.itemId) || 0) + x.qty);
    });
    const paid = /* @__PURE__ */ new Map();
    payments.forEach((p) => {
      if (p.receiptId) paid.set(p.receiptId, (paid.get(p.receiptId) || 0) + p.amount);
    });
    const settledReceipt = (r) => r.accepted && (paid.get(r.id) || 0) >= r.payable - 0.01;
    const settledPO = (po) => {
      const ls = linesByPO.get(po.id) || [];
      return po.status === "Sent to Vendor" && ls.length > 0 && ls.every((l) => (inQty.get(po.id + ":" + l.itemId) || 0) >= l.qty) && (receiptsByPO.get(po.id) || []).every(settledReceipt);
    };
    const poIn = new Set(pos.filter((p) => all || p.date >= cutoff || !settledPO(p)).map((p) => p.id));
    const rcIn = new Set(receipts.filter((r) => r.poId ? poIn.has(r.poId) : all || r.invoiceDate >= cutoff || !settledReceipt(r)).map((r) => r.id));
    const stockOut = stock.filter((x) => x.type === "IN" ? rcIn.has(x.receiptId) : all || x.date >= cutoff);
    const full = balances(db);
    const shown = {};
    stockOut.forEach((x) => {
      shown[x.itemId] = r22((shown[x.itemId] || 0) + signed(x));
    });
    const stockBase = {};
    Object.keys(full).forEach((k) => {
      stockBase[k] = r22(full[k] - (shown[k] || 0));
    });
    const data = {
      items: db.rows("items").filter((r) => r.id).map(clean),
      vendors: db.rows("vendors").filter((r) => r.id).map(clean),
      prices: db.rows("prices").filter((r) => r.id).map(clean),
      pos: pos.filter((p) => poIn.has(p.id)).map(clean),
      poLines: lines.filter((l) => poIn.has(l.poId)).map(clean),
      receipts: receipts.filter((r) => rcIn.has(r.id)).map(clean),
      payments: payments.filter((p) => p.receiptId ? rcIn.has(p.receiptId) : poIn.has(p.poId)).map(clean),
      stock: stockOut.map(clean)
    };
    delete s.DriveFolderId;
    const roles = db.rows("roles").map(clean);
    return {
      user,
      config: { settings: s, roles, approvers: approversOf(roles) },
      data,
      stockBase,
      partial: !all && (poIn.size < pos.length || rcIn.size < receipts.length || stockOut.length < stock.length),
      cutoff,
      stamp: host.stamp()
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
  var View = class {
    constructor(db, ops) {
      this.db = db;
      this.ops = ops;
    }
    get(k, id) {
      for (let i = this.ops.length - 1; i >= 0; i--) {
        const o = this.ops[i];
        if (o.table !== k) continue;
        if (o.t === "delete" && o.id === id) return void 0;
        if (o.t === "upsert" && o.row[def(k).id] === id) return o.row;
      }
      return this.db.find(k, id);
    }
    ups(k) {
      return this.ops.filter((o) => o.t === "upsert" && o.table === k).map((o) => o.row);
    }
    fresh(k) {
      return this.ups(k).filter((r) => !this.db.find(k, r[def(k).id]));
    }
    lines(poId) {
      const m = /* @__PURE__ */ new Map();
      this.db.rows("poLines").filter((l) => l.poId === poId).forEach((l) => m.set(l.id, l));
      this.ops.forEach((o) => {
        if (o.table === "poLines") {
          if (o.t === "delete") m.delete(o.id);
          else if (o.row.poId === poId) m.set(o.row.id, o.row);
        }
      });
      return Array.from(m.values());
    }
  };
  var same = (a, b, keys) => keys.every((k) => a[k] === b[k]);
  var PENDING = (role) => "Pending " + role;
  var PO_FROZEN = ["vendorId", "terms", "expectedDate", "advanceRequired", "advanceAmount", "route", "date"];
  function guards(action, user, ops, db) {
    const v = new View(db, ops);
    const bad = (m, code = "FORBIDDEN") => {
      throw new ApiError(m, code);
    };
    const approvers = approversOf(db.rows("roles"));
    for (const p of v.ups("pos")) {
      const cur = db.find("pos", p.id);
      if (action === "po.save" || action === "po.submit") {
        if (cur && cur.status !== "Draft" && cur.status !== "Rejected") bad("This PO can no longer be edited");
        if (action === "po.submit" && !cur) bad("Save the PO first");
        if (!db.find("vendors", p.vendorId)) bad("Unknown vendor");
        if (p.status === "Draft" || cur && cur.status === "Rejected" && p.status === "Rejected") continue;
        const value = r22(v.lines(p.id).reduce((a, l) => a + l.qty * l.price, 0));
        const route = routeFor(approvers, value);
        const want = route.length ? PENDING(route[0]) : "Approved";
        if (p.status !== want || p.route !== route.join(",") || p.step !== 0) bad("Approval route does not match the Roles tab (Approves POs above)");
        if (!route.length && p.advanceStatus !== (p.advanceRequired ? "Requested" : "Not Required")) bad("Advance status is wrong");
      } else if (action === "po.approve" || action === "po.reject") {
        if (!cur || lc(cur.status) !== lc(PENDING(user.role))) bad(`This PO is not waiting for the ${user.role}`);
        PO_FROZEN.forEach((f) => {
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
        PO_FROZEN.forEach((f) => {
          if (cur[f] !== p[f]) bad("Only sending details can change here");
        });
      } else if (action === "advance.pay") {
        if (!cur || cur.advanceStatus !== "Requested" || ["Advance Paid", "Fully Paid"].indexOf(p.advanceStatus) < 0 || p.status !== cur.status) bad("No advance is pending for this PO");
        PO_FROZEN.forEach((f) => {
          if (cur[f] !== p[f]) bad("Only the advance status can change here");
        });
      }
    }
    if (action === "po.save") {
      for (const l of v.ups("poLines")) {
        if (l.id !== `${l.poId}:${l.itemId}`) bad("Invalid PO line");
        const cur = db.find("poLines", l.id);
        if (cur) {
          if (cur.price !== l.price || cur.itemId !== l.itemId) bad("PO price cannot be changed. Ask HO to update the vendor price.");
          continue;
        }
        const po = v.get("pos", l.poId);
        const pr = po && db.find("prices", `${po.vendorId}:${l.itemId}`);
        if (!pr || pr.price !== l.price) bad("PO price must match the vendor price list");
        if (!(l.qty > 0)) bad("Quantity must be more than zero");
      }
    }
    if (action === "advance.pay") {
      const pays = v.ups("payments");
      if (!pays.length || !v.ups("pos").length) bad("Nothing to pay");
      if (pays.some((x) => x.kind !== "advance" || !(x.amount > 0) || !db.find("pos", x.poId))) bad("Only advance payments here");
    }
    if (action === "receipt.create") {
      const rs = v.fresh("receipts");
      if (rs.length !== 1) bad("One receipt at a time");
      const r = rs[0];
      const po = db.find("pos", r.poId);
      if (!po || po.status !== "Sent to Vendor" || r.type !== "Invoice" || r.accepted || r.vendorId !== po.vendorId) bad("PO is not open for receipt");
      if (!r.invoiceNo) bad("Enter the invoice number", "ERROR");
      if (db.rows("receipts").some((x) => lc(x.invoiceNo) === lc(r.invoiceNo) && x.vendorId === r.vendorId && x.type === "Invoice")) bad("This invoice number is already booked for this vendor", "ERROR");
      const ins = v.ups("stock");
      if (!ins.length) bad("Select the items received", "ERROR");
      let sub = 0, tax = 0;
      for (const s of ins) {
        const pl = v.get("poLines", `${po.id}:${s.itemId}`);
        if (s.type !== "IN" || s.receiptId !== r.id || s.id !== `${r.id}:${s.itemId}` || !pl) bad("Invalid stock-in row");
        if (pl.price !== s.price) bad("Receipt price must equal the PO price");
        if (!(s.qty > 0) || s.qty > pl.qty - receivedQty(db, po.id, s.itemId) + 1e-9) bad("Received quantity is more than the pending PO quantity", "ERROR");
        sub += s.qty * s.price;
        tax += s.qty * s.price * s.taxRate / 100;
      }
      const tol = Number(settingsOf(db).InvoiceTolerance || 1);
      if (Math.abs(sub + tax - r.grandTotal) > Math.min(0.05, tol)) bad("Receipt total does not match its lines", "ERROR");
      const avail = Math.max(0, db.rows("payments").filter((x) => x.poId === po.id && x.kind === "advance").reduce((a, x) => a + x.amount, 0) - db.rows("receipts").filter((x) => x.poId === po.id).reduce((a, x) => a + x.advanceAdjusted, 0));
      const adj = Math.min(r.grandTotal, avail);
      if (Math.abs(r.advanceAdjusted - adj) > 0.01 || Math.abs(r.payable - (r.grandTotal - r.advanceAdjusted)) > 0.01) bad("Advance adjustment is wrong");
      for (const l of v.ups("poLines")) {
        const cur = db.find("poLines", l.id);
        if (!cur || cur.poId !== po.id || !same(cur, l, ["price", "itemId", "queryNote", "queryStatus"])) bad("Only the PO quantity may change here");
      }
    }
    if (action === "invoice.accept") {
      for (const r of v.ups("receipts")) {
        const cur = db.find("receipts", r.id);
        if (!cur || cur.accepted || !r.accepted || !same(cur, r, ["grandTotal", "payable", "poId", "vendorId", "invoiceNo", "type"])) bad("Invoice cannot be accepted");
      }
    }
    if (action === "opening.add") {
      const rs = v.ups("receipts");
      if (!rs.length) bad("Nothing to add");
      for (const r of rs) {
        if (db.find("receipts", r.id) || r.type !== "Opening" || r.poId || !r.accepted || !(r.payable > 0) || r.payable !== r.grandTotal || !r.invoiceNo || !db.find("vendors", r.vendorId)) bad("Invalid old balance", "ERROR");
      }
    }
    if (action === "payment.make") {
      for (const pay of v.ups("payments")) {
        const r = db.find("receipts", pay.receiptId);
        if (pay.kind !== "invoice" || !r || !r.accepted) bad("Accept the invoice before paying");
        if (!(pay.amount > 0)) bad("Amount must be positive", "ERROR");
        const paid = db.rows("payments").filter((x) => x.receiptId === r.id).reduce((a, x) => a + x.amount, 0);
        if (paid + pay.amount > r.payable + 0.01) bad("Payment is more than the balance payable", "ERROR");
      }
    }
    if (action === "query.raise") {
      for (const l of v.ups("poLines")) {
        const cur = db.find("poLines", l.id);
        if (!cur || !same(cur, l, ["qty", "price", "itemId", "poId"]) || l.queryStatus !== "Open" || !l.queryNote) bad("Invalid price query", "ERROR");
      }
    }
    if (action === "stock.issue" || action === "stock.adjust") {
      const bal = balances(db);
      const out = {};
      for (const s of v.ups("stock")) {
        const item = db.find("items", s.itemId);
        if (!item || !item.active) bad("Unknown or inactive item", "ERROR");
        if (!s.date) bad("Enter the date", "ERROR");
        if (action === "stock.issue") {
          if (s.type !== "OUT" || !(s.qty > 0) || !s.toDept) bad("Enter quantity and who the stock is issued to", "ERROR");
          out[s.itemId] = (out[s.itemId] || 0) + s.qty;
          if (out[s.itemId] > (bal[s.itemId] || 0) + 1e-9) bad(`Only ${bal[s.itemId] || 0} ${item.unit} of ${item.name} in stock`, "ERROR");
        } else if (s.type !== "ADJUST" || !s.qty || !s.note) bad("Adjustments need a quantity (+/-) and a reason", "ERROR");
      }
    }
    if (action === "master.manage") {
      for (const l of v.ups("poLines")) {
        const cur = db.find("poLines", l.id);
        if (!cur || !same(cur, l, ["qty", "price", "itemId", "poId", "queryNote", "queryBy"]) || l.queryStatus !== "Resolved") bad("HO can only resolve price queries here");
      }
      for (const p of v.ups("prices")) {
        if (!db.find("vendors", p.vendorId) && !v.get("vendors", p.vendorId)) bad("Unknown vendor in price list", "ERROR");
        if (!db.find("items", p.itemId) && !v.get("items", p.itemId)) bad("Unknown item in price list", "ERROR");
        if (p.id !== `${p.vendorId}:${p.itemId}` || p.price < 0) bad("Invalid price row", "ERROR");
      }
    }
  }
  function fillNames(db, k, e, v) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
    const vendor = (id) => {
      var _a2;
      return (_a2 = db.find("vendors", id) || v.get("vendors", id)) == null ? void 0 : _a2.name;
    };
    const item = (id) => {
      var _a2;
      return (_a2 = db.find("items", id) || v.get("items", id)) == null ? void 0 : _a2.name;
    };
    const po = (id) => db.find("pos", id) || v.get("pos", id);
    if ("itemName" in e || k === "stock" || k === "poLines" || k === "prices") e.itemName = (_b = (_a = item(e.itemId)) != null ? _a : e.itemName) != null ? _b : "";
    if (k === "prices") e.vendorName = (_d = (_c = vendor(e.vendorId)) != null ? _c : e.vendorName) != null ? _d : "";
    if (k === "pos") e.vendorName = (_e = vendor(e.vendorId)) != null ? _e : "";
    if (k === "poLines" || k === "receipts" || k === "payments") {
      const p = po(e.poId);
      if (p) {
        e.poNo = p.poNo || e.poNo || "";
        if (k !== "poLines") e.vendorName = (_f = vendor(p.vendorId)) != null ? _f : "";
      }
    }
    if (k === "receipts") e.vendorName = (_h = (_g = vendor(e.vendorId)) != null ? _g : e.vendorName) != null ? _h : "";
    if (k === "payments" && e.receiptId) {
      const r = db.find("receipts", e.receiptId);
      if (r) {
        e.vendorName = (_i = vendor(r.vendorId)) != null ? _i : "";
        e.poNo = e.poNo || r.invoiceNo;
      }
    }
    if (k === "stock" && e.receiptId) e.grnNo = (_k = (_j = db.find("receipts", e.receiptId) || v.get("receipts", e.receiptId)) == null ? void 0 : _j.grnNo) != null ? _k : "";
  }
  function nextNo(db, table, key, prefix) {
    const used = db.rows(table).reduce((m, r) => Math.max(m, r[key] ? Number(String(r[key]).replace(/\D/g, "")) || 0 : 0), 0);
    return prefix + String(used + 1).padStart(4, "0");
  }
  function commit(host, db, user, name, rawOps, note) {
    const spec = ACTIONS[name];
    if (!spec) throw new ApiError("Unknown action " + name);
    need(user, name);
    if (!Array.isArray(rawOps) || rawOps.length > 300) throw new ApiError("Too many changes in one request");
    const ops = rawOps.map((o) => {
      if (!(o.table in TABLES) || TABLES[o.table].kind !== "data") throw new ApiError("Unknown table " + o.table);
      return { t: o.t, table: o.table, id: o.id, row: o.row ? sanitize(o.table, o.row) : void 0 };
    });
    for (const o of ops) {
      if (spec.tables.indexOf(o.table) < 0) throw new ApiError(`${name} may not change ${o.table}`, "FORBIDDEN");
      if (o.t === "delete" && (DELETABLE[name] || []).indexOf(o.table) < 0) throw new ApiError("This cannot be deleted", "FORBIDDEN");
      if (o.t !== "upsert" && o.t !== "delete") throw new ApiError("Bad operation");
      if (o.t === "upsert" && !o.row[def(o.table).id]) throw new ApiError("Row without an ID");
    }
    for (const o of ops) {
      if (o.t !== "upsert") continue;
      const cur = db.find(o.table, o.row[def(o.table).id]);
      if (!cur) continue;
      if (spec.edit.indexOf(o.table) < 0) throw new ApiError("Existing records cannot be edited here", "FORBIDDEN");
      if (o.row._v !== void 0 && o.row._v !== (cur._v || 0)) {
        throw new ApiError("Someone else has just changed this record. The latest data has been loaded; please try again.", "CONFLICT");
      }
    }
    guards(name, user, ops, db);
    const now = host.now();
    const v = new View(db, ops);
    const applied = [];
    const deleted = [];
    for (const table of APPLY_ORDER) {
      for (const o of ops) {
        if (o.table !== table || o.t !== "upsert") continue;
        const d = def(table);
        const cur = db.find(table, o.row[d.id]);
        const e = { ...cur ? clean(cur) : {}, ...o.row };
        e._v = (cur ? cur._v || 0 : 0) + 1;
        e._at = now;
        e._by = user.loginId;
        if (table === "pos") {
          if (cur) e.poNo = cur.poNo;
          else {
            e.poNo = nextNo(db, "pos", "poNo", "PO-");
            e.createdBy = user.name;
            e.department = user.department;
          }
        }
        if (table === "receipts") {
          if (cur) e.grnNo = cur.grnNo;
          else {
            e.grnNo = e.type === "Invoice" ? nextNo(db, "receipts", "grnNo", "GRN-") : "";
            e.createdBy = user.name;
          }
        }
        if (table === "payments") e.paidBy = user.name;
        if (table === "stock") e.by = user.name;
        if (table === "poLines" && o.row.queryStatus === "Open") e.queryBy = user.name;
        fillNames(db, table, e, v);
        db.put(table, e);
        applied.push({ table, row: clean(e) });
      }
    }
    for (const o of ops) {
      if (o.t !== "delete") continue;
      const rows = db.rows(o.table);
      const i = rows.findIndex((r) => r.id === o.id);
      if (i >= 0) {
        host.remove(def(o.table).sheet, rows[i].__row);
        const gone = rows[i].__row;
        rows.splice(i, 1);
        rows.forEach((r) => {
          if (r.__row > gone) r.__row -= 1;
        });
      }
      deleted.push({ table: o.table, id: o.id });
    }
    const poRef = ops.map((o) => o.row ? o.table === "pos" ? o.row.id : o.row.poId : "").filter(Boolean)[0] || "";
    const detail = ops.map((o) => `${o.t} ${o.table}:${o.t === "upsert" ? o.row[def(o.table).id] : o.id}`).join("; ").slice(0, 1500);
    db.put("log", { id: host.uuid(), time: now, user: user.name, role: user.role, action: name, event: String(note || "").slice(0, 300), ref: poRef, detail });
    host.bumpStamp();
    return { applied, deleted, stamp: host.stamp() };
  }
  function history(db, ref) {
    return { entries: db.rows("log").filter((r) => r.ref === ref && r.event).map((r) => ({ id: r.id, time: r.time, by: r.user, text: r.event })) };
  }
  function upload(host, db, user, req) {
    if (!user.permissions.some((p) => ["advance.pay", "payment.make", "receipt.create", "po.save", "master.manage"].indexOf(p) >= 0)) throw new ApiError("Not allowed to upload", "FORBIDDEN");
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
    return { users: db.rows("users").map((u) => ({ loginId: u.loginId, name: u.name, role: u.role, department: u.department, level: u.level, reportsTo: u.reportsTo, active: u.active })), roles: db.rows("roles").map((r) => ({ role: r.role, level: r.level })) };
  }
  var text100 = (s) => {
    const v = String(s != null ? s : "").slice(0, 100);
    return /^[=+@]/.test(v) ? " " + v : v;
  };
  function usersSave(db, req) {
    const u = req.user || {};
    const id = String(u.loginId || "").trim();
    if (!/^[A-Za-z0-9._-]{3,30}$/.test(id)) throw new ApiError("Login ID: 3-30 letters, numbers, . _ -");
    if (!db.rows("roles").some((r) => lc(r.role) === lc(u.role))) throw new ApiError("Unknown role. Add it to the Roles tab first.");
    const cur = db.rows("users").find((r) => lc(r.loginId) === lc(id));
    if (!cur && !u.password) throw new ApiError("Set a password for the new user");
    if (u.password && String(u.password).length < 6) throw new ApiError("Password must be at least 6 characters");
    db.put("users", {
      loginId: cur ? cur.loginId : id,
      password: u.password ? hashPw(id, String(u.password)) : cur.password,
      name: text100(u.name),
      role: text100(u.role),
      department: text100(u.department),
      level: Number(u.level) || 0,
      reportsTo: text100(u.reportsTo),
      active: u.active !== false
    });
  }
  function changePassword(db, user, req) {
    const u = db.rows("users").find((r) => r.loginId === user.loginId);
    if (hashPw(u.loginId, String(req.oldPassword)) !== u.password && u.password !== String(req.oldPassword)) throw new ApiError("Current password is wrong");
    if (String(req.newPassword || "").length < 6) throw new ApiError("New password must be at least 6 characters");
    db.put("users", { ...u, password: hashPw(u.loginId, String(req.newPassword)) });
  }
  function handle(host, req) {
    try {
      if (!req || typeof req !== "object") throw new ApiError("Bad request");
      if (req.action === "ping") return { ok: true, pong: true };
      if (!host.read(TABLES.users.sheet).length) throw new ApiError("The Sheet is not set up yet. Run setup() in Apps Script first.", "SETUP");
      const fresh = () => new Db(host);
      switch (req.action) {
        case "login":
          return { ok: true, ...host.withLock(() => login(host, fresh(), req)) };
        case "logout":
          host.cacheRemove("sess:" + req.token);
          return { ok: true };
        case "stamp": {
          if (!host.cacheGet("sess:" + req.token)) throw new ApiError("Session expired. Please log in again.", "AUTH");
          return { ok: true, stamp: host.stamp() };
        }
        case "bootstrap":
          return { ok: true, ...host.withLock(() => {
            const d = fresh();
            return bootstrap(host, d, authenticate(host, d, req.token), !!req.all);
          }) };
        case "commit":
          return { ok: true, ...host.withLock(() => {
            const d = fresh();
            return commit(host, d, authenticate(host, d, req.token), String(req.name), req.ops, req.note);
          }) };
        case "history": {
          const d = fresh();
          authenticate(host, d, req.token);
          return { ok: true, ...history(d, String(req.ref)) };
        }
        case "upload":
          return { ok: true, ...host.withLock(() => {
            const d = fresh();
            return upload(host, d, authenticate(host, d, req.token), req);
          }) };
        case "file": {
          authenticate(host, fresh(), req.token);
          return { ok: true, ...host.readFile(String(req.fileId)) };
        }
        case "changePassword":
          return host.withLock(() => {
            const d = fresh();
            changePassword(d, authenticate(host, d, req.token), req);
            return { ok: true };
          });
        case "users.list": {
          const d = fresh();
          const u = authenticate(host, d, req.token);
          need(u, "users.manage");
          return { ok: true, ...usersList(d) };
        }
        case "users.save":
          return host.withLock(() => {
            var _a;
            const d = fresh();
            const u = authenticate(host, d, req.token);
            need(u, "users.manage");
            usersSave(d, req);
            d.put("log", { id: host.uuid(), time: host.now(), user: u.name, role: u.role, action: "users.save", event: "", ref: "", detail: "user " + String((_a = req.user) == null ? void 0 : _a.loginId) });
            host.bumpStamp();
            return { ok: true, ...usersList(d) };
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
      host.ensureSheet(d.sheet, cols.map((c2) => c2.header), cols.filter((c2) => c2.type === "text" || c2.type === "date").map((c2) => c2.header), d.color);
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
    for (const s of configSeed().settings) if (!db.find("settings", s.key)) db.put("settings", s);
    return "Setup complete.";
  }
  function loadSample(host, today) {
    const db = new Db(host);
    if (DATA_TABLES.some((k) => db.rows(k).length > 0)) return "Not loaded: the spreadsheet already has data. Sample data is only added to an empty system.";
    const data = sampleData(today);
    for (const k of Object.keys(data)) for (const r of data[k]) db.put(k, r);
    for (const u of sampleUsers()) if (!db.rows("users").some((x) => lc(x.loginId) === lc(u.loginId))) db.put("users", u);
    host.bumpStamp();
    return "Sample data loaded: 6 vendors, 12 items, 18 vendor prices, 10 POs, receipts, payments, stock movements. Log in with demo.purchase / demo.factory / demo.ca / demo.ho / demo.accounts / demo.store (password Demo@1234). Remove everything with clearAllDataBeforeGoingLive() before real use.";
  }
  function clearAllData(host) {
    let n = 0;
    const wipe = (sheet) => {
      const rows = host.read(sheet);
      rows.sort((a, b) => b.__row - a.__row).forEach((r) => {
        host.remove(sheet, r.__row);
        n++;
      });
    };
    DATA_TABLES.forEach((k) => wipe(def(k).sheet));
    wipe(def("log").sheet);
    host.read(def("users").sheet).filter((u) => lc(u[def("users").cols[0].header]).indexOf(SAMPLE_USER_PREFIX) === 0).sort((a, b) => b.__row - a.__row).forEach((u) => {
      host.remove(def("users").sheet, u.__row);
      n++;
    });
    host.bumpStamp();
    return n;
  }
  return __toCommonJS(core_exports);
})();
