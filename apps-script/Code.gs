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
    var hasLogo = (typeof LOGO_B64 !== 'undefined') && LOGO_B64;
    var options = { name: COUPLE, htmlBody: buildEmailHtml_(recObj, attending, hasLogo) };
    if (hasLogo) {
      try {
        options.inlineImages = {
          weddinglogo: Utilities.newBlob(Utilities.base64Decode(LOGO_B64), 'image/png', 'logo.png')
        };
      } catch (e2) {
        // logo decode failed — fall back to the text monogram in the HTML
        options.htmlBody = buildEmailHtml_(recObj, attending, false);
      }
    }
    MailApp.sendEmail(email, subject, buildEmailText_(recObj, attending), options);
  } catch (err) { /* email is non-fatal */ }
}

function escapeHtmlEmail_(s) {
  return String(s == null ? '' : s).replace(/[&<>]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
  });
}

function buildEmailText_(recObj, attending) {
  if (!attending) {
    return 'Thank you for letting us know, ' + recObj['Primary Guest'] + '. We\'ll miss you!\n\n' +
      'With love,\n' + COUPLE;
  }
  var lines = 'Thank you, ' + recObj['Primary Guest'] + '!\n\n' +
    'We received your RSVP for ' + recObj['Confirmed Count'] + ' guest(s).\n\n' +
    'Sangeet: ' + (recObj['Sangeet'] || '—') + '\n' +
    'Wedding: ' + (recObj['Wedding'] || '—') + '\n' +
    'Reception: ' + (recObj['Reception'] || '—') + '\n';
  if (recObj['Milwaukee']) lines += 'Milwaukee Meet & Greet (Sun, Apr 25): ' + recObj['Milwaukee'] + '\n';
  return lines + '\nYou can update your RSVP anytime by logging back in.\n\nWith love,\n' + COUPLE;
}

function emailEventRows_(recObj, fontBody) {
  var rows = '';
  var EVENTS = [
    ['Sangeet', 'Sangeet'],
    ['Wedding', 'Wedding'],
    ['Reception', 'Reception'],
    ['Milwaukee', 'Milwaukee Meet &amp; Greet']
  ];
  EVENTS.forEach(function (pair) {
    var key = pair[0], label = pair[1];
    var names = recObj[key];
    if (names) {
      rows +=
        '<tr>' +
          '<td style="padding:11px 0;border-bottom:1px solid #f2ecda;font-family:Arial,Helvetica,sans-serif;' +
            'font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#a07830;width:118px;' +
            'vertical-align:middle;">' + label + '</td>' +
          '<td style="padding:11px 0;border-bottom:1px solid #f2ecda;font-family:' + fontBody + ';' +
            'font-size:17px;color:#2c2c2c;line-height:1.5;vertical-align:middle;">' + escapeHtmlEmail_(names) + '</td>' +
        '</tr>';
    }
  });
  return rows;
}

function buildEmailHtml_(recObj, attending, hasLogo) {
  // Web fonts (Playfair/Cormorant) load in clients that support them (Apple Mail,
  // iOS Mail, etc.); Gmail and Outlook ignore the @import and fall back to Georgia.
  var FONT_HEAD = "'Playfair Display', Georgia, 'Times New Roman', serif";
  var FONT_BODY = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
  var FONT_LABEL = 'Arial, Helvetica, sans-serif';
  var name = escapeHtmlEmail_(recObj['Primary Guest']);

  var header = hasLogo
    ? '<img src="cid:weddinglogo" width="120" alt="Shivani &amp; Murali" ' +
        'style="display:block;margin:0 auto;border:0;outline:none;width:120px;height:auto;">'
    : '<div style="font-family:' + FONT_HEAD + ';font-size:40px;color:#a07830;line-height:1;">' +
        'S <span style="font-style:italic;">&amp;</span> M</div>';

  var eyebrow = attending ? 'RSVP CONFIRMED' : 'RSVP RECEIVED';
  var p = 'font-family:' + FONT_BODY + ';font-size:17px;line-height:1.75;color:#3a3a3a;margin:0 0 18px;';
  var greeting = '<p style="' + p + 'font-size:19px;color:#2c2c2c;">Dear ' + name + ',</p>';
  var body;
  if (attending) {
    body = greeting +
      '<p style="' + p + '">Thank you for your reply &mdash; we are <em>overjoyed</em> that you&rsquo;ll be ' +
        'celebrating with us. We have you down for <strong>' + escapeHtmlEmail_(recObj['Confirmed Count']) +
        '</strong> guest(s):</p>' +
      '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:6px 0 22px;">' +
        emailEventRows_(recObj, FONT_BODY) +
      '</table>' +
      '<p style="' + p + 'font-size:15px;color:#8a8a8a;font-style:italic;">' +
        'Plans change &mdash; you can update your RSVP anytime by logging back in with your invitation code.</p>';
  } else {
    body = greeting +
      '<p style="' + p + '">Thank you for letting us know. We&rsquo;ll truly miss celebrating with you &mdash; ' +
        'but we&rsquo;re so grateful you replied. If anything changes, you can update your RSVP anytime by ' +
        'logging back in.</p>';
  }

  var diamond =
    '<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>' +
      '<td style="width:54px;height:9px;border-bottom:1px solid #e3d2a0;font-size:0;line-height:0;">&nbsp;</td>' +
      '<td style="padding:0 12px;font-family:' + FONT_LABEL + ';font-size:9px;color:#c9a84c;vertical-align:middle;">&#9670;</td>' +
      '<td style="width:54px;height:9px;border-bottom:1px solid #e3d2a0;font-size:0;line-height:0;">&nbsp;</td>' +
    '</tr></table>';

  return '' +
  '<!DOCTYPE html><html><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
    "@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400;1,500&family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&display=swap');" +
    'body{margin:0;padding:0;background:#f3efe6;}' +
    '@media only screen and (max-width:620px){.cardpad{padding-left:26px!important;padding-right:26px!important;}}' +
  '</style></head>' +
  '<body style="margin:0;padding:0;background:#f3efe6;">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">' +
      (attending ? 'We&rsquo;ve received your RSVP &mdash; we can&rsquo;t wait to celebrate with you.'
                 : 'We&rsquo;ve received your RSVP. We&rsquo;ll miss you!') +
      '&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;' +
    '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3efe6;">' +
      '<tr><td align="center" style="padding:28px 12px;">' +
        '<table role="presentation" width="600" cellpadding="0" cellspacing="0" ' +
          'style="max-width:600px;width:100%;background:#ffffff;border:1px solid #ece3c8;border-radius:4px;overflow:hidden;">' +
          '<tr><td style="height:4px;background:#c9a84c;font-size:0;line-height:0;">&nbsp;</td></tr>' +
          '<tr><td class="cardpad" style="padding:42px 52px 8px;text-align:center;">' + header + '</td></tr>' +
          '<tr><td class="cardpad" style="padding:14px 52px 0;text-align:center;">' +
            '<div style="font-family:' + FONT_LABEL + ';font-size:11px;letter-spacing:4px;text-transform:uppercase;color:#a07830;">' + eyebrow + '</div>' +
            '<div style="font-family:' + FONT_HEAD + ';font-size:34px;color:#2c2c2c;letter-spacing:.5px;padding-top:10px;line-height:1.2;">' +
              'Shivani <span style="font-style:italic;color:#a07830;">&amp;</span> Murali</div>' +
            '<div style="font-family:' + FONT_BODY + ';font-style:italic;font-size:17px;color:#8a8a8a;padding-top:6px;">' +
              'April 23 &ndash; 24, 2027 &middot; Downers Grove, Illinois</div>' +
          '</td></tr>' +
          '<tr><td style="padding:22px 52px 6px;">' + diamond + '</td></tr>' +
          '<tr><td class="cardpad" style="padding:10px 52px 40px;">' + body + '</td></tr>' +
          '<tr><td style="background:#3d5c3a;padding:28px 52px;text-align:center;">' +
            '<div style="font-family:' + FONT_BODY + ';font-style:italic;font-size:15px;color:#dfe6da;letter-spacing:1px;">with love &amp; gratitude</div>' +
            '<div style="font-family:' + FONT_HEAD + ';font-size:22px;color:#ffffff;padding-top:6px;">' +
              'Shivani <span style="font-style:italic;color:#e8d5a3;">&amp;</span> Murali</div>' +
            '<div style="font-family:' + FONT_LABEL + ';font-size:10px;color:#aebaa7;letter-spacing:1.5px;padding-top:14px;">' +
              'LAKES AT LACEY &middot; 3500 LACEY RD, DOWNERS GROVE, IL</div>' +
          '</td></tr>' +
        '</table>' +
      '</td></tr>' +
    '</table>' +
  '</body></html>';
}
