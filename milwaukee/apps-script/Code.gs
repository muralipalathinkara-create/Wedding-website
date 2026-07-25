// Google I/O wrapper for the Milwaukee Meet & Greet RSVP. Paste both lib.gs
// and Code.gs into a container-bound Apps Script project attached to a NEW,
// separate Google Sheet (not the main wedding sheet), then deploy as a Web
// App ("Execute as me", "Anyone"). Pure logic lives in lib.gs.
//
// This is an OPEN RSVP: there is no Guests tab and no password/login step.
// The upsert key is the guest's EMAIL ADDRESS (lowercased) instead.

var SPREADSHEET_ID = '';          // empty = container-bound active spreadsheet
var SUMMARY_TAB = 'RSVP Summary';
var LOG_TAB = 'RSVP Log';
var EVENT_NAME = 'Milwaukee Meet & Greet';

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
  return jsonOut_({ ok: true, service: 'milwaukee-rsvp' });
}

function doPost(e) {
  var data;
  try { data = JSON.parse(e.postData.contents); }
  catch (err) { return jsonOut_({ ok: false, error: 'bad json' }); }
  if (data.action === 'rsvp') return handleRsvp_(data);
  return jsonOut_({ ok: false, error: 'unknown action' });
}

function handleRsvp_(data) {
  if (norm(data.hp)) return jsonOut_({ ok: true });   // honeypot: silent no-op
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var valid = validateRsvp(data);
    if (!valid.ok) return jsonOut_({ ok: false, error: valid.errors.join('; ') });
    var recObj = buildRsvpRecord(data, new Date());
    appendRow_(LOG_TAB, recObj);
    upsertRow_(SUMMARY_TAB, recObj, recObj['Email']);
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

function upsertRow_(name, recObj, email) {
  var sheet = ensureSheet_(name);
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var hm = headerIndexMap(headers);
  var target = norm(email).toLowerCase();
  var row = recordToRow(recObj, headers);
  for (var i = 1; i < values.length; i++) {
    if (norm(col(values[i], hm, 'email')).toLowerCase() === target) {
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
    var subject = 'Milwaukee Meet & Greet — RSVP received' + (attending ? '' : ' (regrets)');
    MailApp.sendEmail(email, subject, buildEmailText_(recObj, attending), {
      name: 'Shivani & Murali',
      htmlBody: buildEmailHtml_(recObj, attending)
    });
  } catch (err) { /* email is non-fatal */ }
}

function escapeHtmlEmail_(s) {
  return String(s == null ? '' : s).replace(/[&<>]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
  });
}

function buildEmailText_(recObj, attending) {
  if (!attending) {
    return 'Thank you for letting us know, ' + recObj['Name'] + '. We\'ll miss you in Milwaukee!\n\n' +
      'With love,\nVinod & Raji';
  }
  var lines = 'Thank you, ' + recObj['Name'] + '!\n\n' +
    'We received your RSVP for the Milwaukee Meet & Greet (Sunday, April 25, 2027, 5:30-8:00 PM)\n' +
    'at the Crowne Plaza Milwaukee Airport, 6401 South 13th Street, Milwaukee, WI 53221.\n' +
    'Total in your party: ' + (1 + recObj['Guest Count']) + '\n';
  if (recObj['Guest Names']) lines += 'Guests: ' + recObj['Guest Names'] + '\n';
  if (recObj['Dietary']) lines += 'Dietary notes: ' + recObj['Dietary'] + '\n';
  return lines + '\nWith love,\nVinod & Raji';
}

function buildEmailHtml_(recObj, attending) {
  var FONT_HEAD = "'Playfair Display', Georgia, 'Times New Roman', serif";
  var FONT_BODY = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
  var FONT_LABEL = 'Arial, Helvetica, sans-serif';
  var name = escapeHtmlEmail_(recObj['Name']);
  var eyebrow = attending ? 'RSVP CONFIRMED' : 'RSVP RECEIVED';
  var p = 'font-family:' + FONT_BODY + ';font-size:17px;line-height:1.75;color:#3a3a3a;margin:0 0 18px;';
  var greeting = '<p style="' + p + 'font-size:19px;color:#2c2c2c;">Dear ' + name + ',</p>';
  var body;
  if (attending) {
    var total = 1 + recObj['Guest Count'];
    body = greeting +
      '<p style="' + p + '">Thank you for your reply &mdash; we can\'t wait to see you in Milwaukee! ' +
        'We have you down for <strong>' + total + '</strong> guest(s)' +
        (recObj['Guest Names'] ? ' (' + escapeHtmlEmail_(recObj['Guest Names']) + ')' : '') + '.</p>' +
      '<p style="' + p + '"><strong>Sunday, April 25, 2027</strong> &middot; 5:30 &ndash; 8:00 PM<br>' +
        'Crowne Plaza Milwaukee Airport &middot; 6401 South 13th Street, Milwaukee, WI 53221</p>';
  } else {
    body = greeting +
      '<p style="' + p + '">Thank you for letting us know. We\'ll miss celebrating with you in Milwaukee, ' +
        'but we\'re so grateful you replied.</p>';
  }
  return '' +
  '<!DOCTYPE html><html><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
    "@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400;1,500&family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&display=swap');" +
    'body{margin:0;padding:0;background:#eef4fa;}' +
  '</style></head>' +
  '<body style="margin:0;padding:0;background:#eef4fa;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef4fa;">' +
      '<tr><td align="center" style="padding:28px 12px;">' +
        '<table role="presentation" width="560" cellpadding="0" cellspacing="0" ' +
          'style="max-width:560px;width:100%;background:#ffffff;border:1px solid #dbe8f2;border-radius:4px;overflow:hidden;">' +
          '<tr><td style="height:4px;background:#2e6fb0;font-size:0;line-height:0;">&nbsp;</td></tr>' +
          '<tr><td style="padding:34px 44px 0;text-align:center;">' +
            '<div style="font-family:' + FONT_LABEL + ';font-size:11px;letter-spacing:4px;text-transform:uppercase;color:#2e6fb0;">' + eyebrow + '</div>' +
            '<div style="font-family:' + FONT_HEAD + ';font-size:30px;color:#2c2c2c;letter-spacing:.5px;padding-top:10px;line-height:1.2;">' +
              'Milwaukee <span style="font-style:italic;color:#2e6fb0;">Meet &amp; Greet</span></div>' +
            '<div style="font-family:' + FONT_BODY + ';font-style:italic;font-size:16px;color:#8a8a8a;padding-top:6px;">' +
              'Vinod &amp; Raji</div>' +
          '</td></tr>' +
          '<tr><td style="padding:24px 44px 36px;">' + body + '</td></tr>' +
          '<tr><td style="background:#2e6fb0;padding:22px 44px;text-align:center;">' +
            '<div style="font-family:' + FONT_BODY + ';font-style:italic;font-size:14px;color:#e2ecf5;">with love &amp; gratitude</div>' +
            '<div style="font-family:' + FONT_HEAD + ';font-size:18px;color:#ffffff;padding-top:4px;">Shivani &amp; Murali</div>' +
          '</td></tr>' +
        '</table>' +
      '</td></tr>' +
    '</table>' +
  '</body></html>';
}
