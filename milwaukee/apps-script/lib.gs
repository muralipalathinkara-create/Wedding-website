// Pure helpers for the Milwaukee Meet & Greet RSVP Apps Script. No Google
// services referenced here so this file is unit-testable in Node (see
// lib.test.js). Code.gs holds the Google I/O wrappers and calls into these.
//
// Unlike the main wedding site, this is an OPEN RSVP: no password, no
// pre-loaded guest list. Anyone with the link fills in their own name.

var RSVP_HEADERS = ['Last Updated', 'Name', 'Email', 'Phone', 'Attending?',
  'Guest Count', 'Guest Names', 'Dietary', 'Note'];

function norm(s) { return String(s == null ? '' : s).trim(); }

// Drop parenthetical annotations so a sheet header like
// "Guest Names (separated by commas)" still matches "guest names".
function baseHeader(s) {
  return norm(s).toLowerCase().replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}

function headerIndexMap(headers) {
  var map = {};
  var i;
  for (i = 0; i < headers.length; i++) {
    var full = norm(headers[i]).toLowerCase();
    if (map[full] === undefined) map[full] = i;
  }
  for (i = 0; i < headers.length; i++) {
    var b = baseHeader(headers[i]);
    if (b && map[b] === undefined) map[b] = i;
  }
  return map;
}

function col(row, headerMap, name) {
  var i = headerMap[norm(name).toLowerCase()];
  if (i === undefined) i = headerMap[baseHeader(name)];
  return i === undefined ? '' : row[i];
}

function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm(s));
}

function validateRsvp(payload) {
  var errors = [];
  if (!payload || !norm(payload.name)) errors.push('name is required');
  if (!payload || !isValidEmail(payload.email)) errors.push('valid email is required');
  return { ok: errors.length === 0, errors: errors };
}

function buildRsvpRecord(payload, timestamp) {
  var attending = !!(payload && payload.attending);
  var guestNames = attending && payload.guestNames ? payload.guestNames.map(norm).filter(function (n) { return n.length > 0; }) : [];
  return {
    'Last Updated': timestamp,
    'Name': norm(payload.name),
    'Email': norm(payload.email),
    'Phone': norm(payload.phone),
    'Attending?': attending ? 'Yes' : 'No',
    'Guest Count': guestNames.length,
    'Guest Names': guestNames.join(', '),
    'Dietary': norm(payload.dietary),
    'Note': norm(payload.note)
  };
}

function recordToRow(recordObj, headers) {
  var lowerKeys = {};
  Object.keys(recordObj).forEach(function (k) { lowerKeys[k.toLowerCase()] = recordObj[k]; });
  return headers.map(function (h) {
    var v = lowerKeys[norm(h).toLowerCase()];
    return v === undefined ? '' : v;
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    RSVP_HEADERS: RSVP_HEADERS, norm: norm, headerIndexMap: headerIndexMap, col: col,
    isValidEmail: isValidEmail, validateRsvp: validateRsvp,
    buildRsvpRecord: buildRsvpRecord, recordToRow: recordToRow
  };
}
