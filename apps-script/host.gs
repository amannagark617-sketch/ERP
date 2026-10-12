/**
 * Little Nap ERP – Google Apps Script host.
 * `Core` (below this file's contents in Code.gs) holds all the logic; this file only talks to Sheets / Drive.
 *
 * ONE-TIME SETUP
 *  1. Create a Google Sheet (any name). Extensions > Apps Script. Paste this whole file as Code.gs.
 *  2. Run  setupDemo()  (sample vendors + POs)  or  setup()  (clean start)  once and approve the permissions.
 *  3. Deploy > New deployment > Web app:  Execute as = Me,  Who has access = Anyone.  Copy the Web app URL.
 *  4. Paste that URL on the app's login screen.
 *
 * After changing this file later: Deploy > Manage deployments > Edit > New version (the URL stays the same).
 */

var ROOT_FOLDER_NAME = 'Little Nap ERP Files';

function _ss() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SS_ID');
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Open this script from inside the Google Sheet (Extensions > Apps Script).');
  props.setProperty('SS_ID', ss.getId());
  return ss;
}

var host = {
  now: function () { return new Date().toISOString(); },
  uuid: function () { return Utilities.getUuid(); },

  ensureSheet: function (name, headers, textHeaders) {
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

function setup() { var msg = Core.setup(host, false, Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd')); Logger.log(msg); return msg; }
function setupDemo() { var msg = Core.setup(host, true, Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd')); Logger.log(msg); return msg; }
