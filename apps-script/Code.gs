// Google I/O wrapper. Paste both lib.gs and Code.gs into the container-bound
// Apps Script project for the wedding spreadsheet, then deploy as a Web App
// ("Execute as me", "Anyone"). Pure logic lives in lib.gs.

var SPREADSHEET_ID = '';          // empty = container-bound active spreadsheet
var GUESTS_TAB = 'Guests';
var SUMMARY_TAB = 'RSVP Summary';
var LOG_TAB = 'RSVP Log';
var COUPLE = 'Shivani & Murali';

function ss_() {
  return SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return jsonOut_({ ok: true, service: 'wedding-rsvp' });
}

function doPost(e) {
  var data;
  try { data = JSON.parse(e.postData.contents); }
  catch (err) { return jsonOut_({ ok: false, error: 'bad json' }); }
  if (data.action === 'login') return handleLogin_(data);
  if (data.action === 'rsvp') return handleRsvp_(data);
  return jsonOut_({ ok: false, error: 'unknown action' });
}

function handleLogin_(data) {
  var values = ss_().getSheetByName(GUESTS_TAB).getDataRange().getValues();
  var res = findGuest(values.slice(1), values[0], data.password);
  if (res.status === 'ambiguous') return jsonOut_({ ok: false, error: 'ambiguous' });
  if (res.status !== 'ok') return jsonOut_({ ok: false });
  return jsonOut_({ ok: true, guest: res.record, existing: findExistingSummary_(res.record.password) });
}

function findExistingSummary_(password) {
  var sheet = ss_().getSheetByName(SUMMARY_TAB);
  if (!sheet || sheet.getLastRow() < 2) return null;
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var hm = headerIndexMap(headers);
  var target = norm(password).toLowerCase();
  for (var i = 1; i < values.length; i++) {
    if (norm(col(values[i], hm, 'password')).toLowerCase() === target) {
      var obj = {};
      headers.forEach(function (h, idx) { obj[h] = values[i][idx]; });
      return obj;
    }
  }
  return null;
}

function handleRsvp_(data) {
  if (norm(data.hp)) return jsonOut_({ ok: true });   // honeypot: silent no-op
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var gv = ss_().getSheetByName(GUESTS_TAB).getDataRange().getValues();
    var res = findGuest(gv.slice(1), gv[0], data.password);
    if (res.status !== 'ok') return jsonOut_({ ok: false, error: 'invalid guest' });
    var valid = validateRsvp(data, res.record);
    if (!valid.ok) return jsonOut_({ ok: false, error: valid.errors.join('; ') });
    var recObj = buildRsvpRecord(data, res.record, new Date());
    appendRow_(LOG_TAB, recObj);
    upsertRow_(SUMMARY_TAB, recObj, res.record.password);
    sendConfirmation_(recObj);
    return jsonOut_({ ok: true });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function ensureSheet_(name) {
  var ss = ss_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) { sheet = ss.insertSheet(name); sheet.appendRow(RSVP_HEADERS); }
  else if (sheet.getLastRow() === 0) { sheet.appendRow(RSVP_HEADERS); }
  return sheet;
}

function appendRow_(name, recObj) {
  var sheet = ensureSheet_(name);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(recordToRow(recObj, headers));
}

function upsertRow_(name, recObj, password) {
  var sheet = ensureSheet_(name);
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var hm = headerIndexMap(headers);
  var target = norm(password).toLowerCase();
  var row = recordToRow(recObj, headers);
  for (var i = 1; i < values.length; i++) {
    if (norm(col(values[i], hm, 'password')).toLowerCase() === target) {
      sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
      return;
    }
  }
  sheet.appendRow(row);
}

function sendConfirmation_(recObj) {
  var email = recObj['Email'];
  if (!email || email.indexOf('@') < 0) return;
  try {
    var attending = recObj['Attending?'] === 'Yes';
    var subject = COUPLE + ' — RSVP received' + (attending ? '' : ' (regrets)');
    var body = attending
      ? 'Thank you, ' + recObj['Primary Guest'] + '!\n\n' +
        'We received your RSVP for ' + recObj['Confirmed Count'] + ' guest(s).\n\n' +
        'Sangeet: ' + (recObj['Sangeet'] || '—') + '\n' +
        'Wedding: ' + (recObj['Wedding'] || '—') + '\n' +
        'Reception: ' + (recObj['Reception'] || '—') + '\n\n' +
        'You can update your RSVP anytime by logging back in.\n\nWith love,\n' + COUPLE
      : 'Thank you for letting us know, ' + recObj['Primary Guest'] + '. We\'ll miss you!\n\n' +
        'With love,\n' + COUPLE;
    MailApp.sendEmail(email, subject, body);
  } catch (err) { /* email is non-fatal */ }
}
