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
