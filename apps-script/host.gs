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
