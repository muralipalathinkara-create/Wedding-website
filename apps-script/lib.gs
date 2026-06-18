// Pure helpers for the wedding RSVP Apps Script. No Google services referenced
// here so this file is unit-testable in Node (see lib.test.js). Code.gs holds
// the Google I/O wrappers and calls into these.

var EVENT_NAMES = ['Sangeet', 'Wedding', 'Reception'];
var RSVP_HEADERS = ['Last Updated', 'Password', 'Primary Guest', 'Email', 'Phone',
  'Attending?', 'Confirmed Count', 'Sangeet', 'Wedding', 'Reception', 'Dietary', 'Note'];

function norm(s) { return String(s == null ? '' : s).trim(); }

function splitList(s) {
  return norm(s).split(',').map(function (x) { return x.trim(); })
    .filter(function (x) { return x.length > 0; });
}

// Drop parenthetical annotations so a sheet header like
// "Names of Extra Guests (separated by commas)" still matches "names of extra guests".
function baseHeader(s) {
  return norm(s).toLowerCase().replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}

function headerIndexMap(headers) {
  var map = {};
  var i;
  // Pass 1: exact (lowercased) headers take priority.
  for (i = 0; i < headers.length; i++) {
    var full = norm(headers[i]).toLowerCase();
    if (map[full] === undefined) map[full] = i;
  }
  // Pass 2: add annotation-stripped aliases without shadowing a real header.
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

function buildGuestRecord(row, hm) {
  var extraAllowed = norm(col(row, hm, 'extra guest? (y/n)')).toLowerCase().charAt(0) === 'y';
  var extraCount = parseInt(norm(col(row, hm, 'how many guests?')), 10);
  if (isNaN(extraCount)) extraCount = 0;
  return {
    first: norm(col(row, hm, 'primary guest first name')),
    last: norm(col(row, hm, 'last name')),
    email: norm(col(row, hm, 'email address')),
    phone: norm(col(row, hm, 'phone number')),
    eventsInvited: splitList(col(row, hm, 'events invited')),
    extraAllowed: extraAllowed,
    extraCount: extraAllowed ? extraCount : 0,
    extraNames: extraAllowed ? splitList(col(row, hm, 'names of extra guests')) : [],
    password: norm(col(row, hm, 'password'))
  };
}

function findGuest(rows, headers, password) {
  var hm = headerIndexMap(headers);
  var target = norm(password).toLowerCase();
  if (!target) return { status: 'notfound' };
  var matches = [];
  for (var i = 0; i < rows.length; i++) {
    var pw = norm(col(rows[i], hm, 'password')).toLowerCase();
    if (pw && pw === target) matches.push(i);
  }
  if (matches.length === 0) return { status: 'notfound' };
  if (matches.length > 1) return { status: 'ambiguous' };
  return { status: 'ok', rowIndex: matches[0], record: buildGuestRecord(rows[matches[0]], hm) };
}

function primaryName(record) { return norm(record.first + ' ' + record.last); }

function validateRsvp(payload, record) {
  var errors = [];
  if (!payload || !Array.isArray(payload.attendees)) {
    return { ok: false, errors: ['no attendees'] };
  }
  var allowed = {};
  allowed[primaryName(record).toLowerCase()] = true;
  record.extraNames.forEach(function (n) { allowed[norm(n).toLowerCase()] = true; });
  var invited = {};
  record.eventsInvited.forEach(function (e) { invited[norm(e).toLowerCase()] = true; });
  payload.attendees.forEach(function (a) {
    if (!allowed[norm(a.name).toLowerCase()]) errors.push('unknown attendee: ' + a.name);
    (a.events || []).forEach(function (e) {
      if (!invited[norm(e).toLowerCase()]) errors.push('event not invited: ' + e);
    });
  });
  var extras = payload.attendees.filter(function (a) { return !a.isPrimary; }).length;
  if (extras > record.extraCount) errors.push('too many extra guests');
  return { ok: errors.length === 0, errors: errors };
}

function eventAttendeeNames(attendees, eventName) {
  return attendees.filter(function (a) {
    return (a.events || []).some(function (e) {
      return norm(e).toLowerCase() === eventName.toLowerCase();
    });
  }).map(function (a) { return norm(a.name); }).join(', ');
}

function formatDietary(attendees) {
  return attendees.map(function (a) {
    return norm(a.name) + ' — ' + (norm(a.dietary) || 'None');
  }).join('; ');
}

function buildRsvpRecord(payload, record, timestamp) {
  var attendees = (payload && payload.attendees) || [];
  return {
    'Last Updated': timestamp,
    'Password': record.password,
    'Primary Guest': primaryName(record),
    'Email': norm(payload.email) || record.email,
    'Phone': norm(payload.phone) || record.phone,
    'Attending?': attendees.length > 0 ? 'Yes' : 'No',
    'Confirmed Count': attendees.length,
    'Sangeet': eventAttendeeNames(attendees, 'Sangeet'),
    'Wedding': eventAttendeeNames(attendees, 'Wedding'),
    'Reception': eventAttendeeNames(attendees, 'Reception'),
    'Dietary': formatDietary(attendees),
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
    EVENT_NAMES: EVENT_NAMES, RSVP_HEADERS: RSVP_HEADERS, norm: norm, splitList: splitList,
    headerIndexMap: headerIndexMap, col: col, buildGuestRecord: buildGuestRecord,
    findGuest: findGuest, primaryName: primaryName, validateRsvp: validateRsvp,
    eventAttendeeNames: eventAttendeeNames, formatDietary: formatDietary,
    buildRsvpRecord: buildRsvpRecord, recordToRow: recordToRow
  };
}
