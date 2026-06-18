const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadLib() {
  const code = fs.readFileSync(path.join(__dirname, 'lib.gs'), 'utf8');
  const sandbox = { module: { exports: {} } };
  vm.runInNewContext(code, sandbox);
  return sandbox.module.exports;
}

const HEADERS = [
  'Primary Guest First Name', 'Last Name', 'Email Address', 'Phone Number',
  'Events Invited', 'Extra Guest? (Y/N)', 'How many Guests?',
  'Names of Extra Guests', 'Password'
];
// Ritika: invited all 3, 2 extras allowed.
const RITIKA = ['Ritika', 'Punathil', '', '', 'Sangeet, Wedding, Reception', 'Y', '2', 'Rohitha Punathil, Ravachandran', 'RPunathil'];
const SHASHANK = ['Shashank', 'Mahesh', '', '', 'Sangeet, Wedding, Reception', 'N', '', '', 'SMahesh'];

test('findGuest matches case-insensitively and trims', () => {
  const lib = loadLib();
  const res = lib.findGuest([RITIKA, SHASHANK], HEADERS, '  rpunathil ');
  assert.equal(res.status, 'ok');
  assert.equal(res.record.first, 'Ritika');
  assert.deepEqual(res.record.extraNames, ['Rohitha Punathil', 'Ravachandran']);
  assert.equal(res.record.extraCount, 2);
  assert.equal(res.record.extraAllowed, true);
});

test('buildGuestRecord tolerates parenthetical header annotations', () => {
  const lib = loadLib();
  // Real sheet header has an annotation appended to the extra-guests column.
  const annotated = [
    'Primary Guest First Name', 'Last Name', 'Email Address', 'Phone Number',
    'Events Invited', 'Extra Guest? (Y/N)', 'How many Guests?',
    'Names of Extra Guests (spearated by commas)', 'Password'
  ];
  const res = lib.findGuest([RITIKA], annotated, 'RPunathil');
  assert.equal(res.status, 'ok');
  assert.deepEqual(res.record.extraNames, ['Rohitha Punathil', 'Ravachandran']);
  assert.equal(res.record.extraCount, 2);
});

test('findGuest returns notfound for blank/unknown', () => {
  const lib = loadLib();
  assert.equal(lib.findGuest([RITIKA], HEADERS, '').status, 'notfound');
  assert.equal(lib.findGuest([RITIKA], HEADERS, 'nope').status, 'notfound');
});

test('findGuest flags duplicate passwords as ambiguous', () => {
  const lib = loadLib();
  const dup = SHASHANK.slice(); // same password SMahesh
  const res = lib.findGuest([SHASHANK, dup], HEADERS, 'SMahesh');
  assert.equal(res.status, 'ambiguous');
});

test('guest with no extras has empty extras', () => {
  const lib = loadLib();
  const res = lib.findGuest([SHASHANK], HEADERS, 'SMahesh');
  assert.equal(res.record.extraAllowed, false);
  assert.equal(res.record.extraCount, 0);
  assert.deepEqual(res.record.extraNames, []);
});

test('validateRsvp rejects unknown attendee and uninvited event', () => {
  const lib = loadLib();
  const rec = lib.findGuest([SHASHANK], HEADERS, 'SMahesh').record; // invited all, 0 extras
  const ok = lib.validateRsvp({ attendees: [{ name: 'Shashank Mahesh', isPrimary: true, events: ['Wedding'] }] }, rec);
  assert.equal(ok.ok, true);
  const bad = lib.validateRsvp({ attendees: [{ name: 'Stranger', isPrimary: false, events: ['Wedding'] }] }, rec);
  assert.equal(bad.ok, false);
});

test('validateRsvp rejects an event the guest was not invited to', () => {
  const lib = loadLib();
  // Guest invited to Sangeet only, no extras.
  const sangeetOnly = ['Maya', 'Rao', '', '', 'Sangeet', 'N', '', '', 'MRao'];
  const rec = lib.findGuest([sangeetOnly], HEADERS, 'MRao').record;
  assert.deepEqual(rec.eventsInvited, ['Sangeet']);
  const ok = lib.validateRsvp({ attendees: [{ name: 'Maya Rao', isPrimary: true, events: ['Sangeet'] }] }, rec);
  assert.equal(ok.ok, true);
  const bad = lib.validateRsvp({ attendees: [{ name: 'Maya Rao', isPrimary: true, events: ['Reception'] }] }, rec);
  assert.equal(bad.ok, false);
});

test('validateRsvp enforces extra-guest cap', () => {
  const lib = loadLib();
  const rec = lib.findGuest([RITIKA], HEADERS, 'RPunathil').record; // cap 2
  const tooMany = lib.validateRsvp({ attendees: [
    { name: 'Ritika Punathil', isPrimary: true, events: ['Sangeet'] },
    { name: 'Rohitha Punathil', isPrimary: false, events: ['Sangeet'] },
    { name: 'Ravachandran', isPrimary: false, events: ['Sangeet'] },
    { name: 'Rohitha Punathil', isPrimary: false, events: ['Sangeet'] }
  ] }, rec);
  assert.equal(tooMany.ok, false);
});

test('buildRsvpRecord formats per-event names and dietary', () => {
  const lib = loadLib();
  const rec = lib.findGuest([RITIKA], HEADERS, 'RPunathil').record;
  const out = lib.buildRsvpRecord({
    email: 'r@x.com', phone: '', note: 'Yay',
    attendees: [
      { name: 'Ritika Punathil', isPrimary: true, events: ['Sangeet', 'Wedding'], dietary: 'Vegetarian' },
      { name: 'Rohitha Punathil', isPrimary: false, events: ['Sangeet'], dietary: '' }
    ]
  }, rec, 'TS');
  assert.equal(out['Attending?'], 'Yes');
  assert.equal(out['Confirmed Count'], 2);
  assert.equal(out['Sangeet'], 'Ritika Punathil, Rohitha Punathil');
  assert.equal(out['Wedding'], 'Ritika Punathil');
  assert.equal(out['Reception'], '');
  assert.equal(out['Dietary'], 'Ritika Punathil — Vegetarian; Rohitha Punathil — None');
  assert.equal(out['Email'], 'r@x.com');
});

test('buildRsvpRecord marks decline when nobody attends', () => {
  const lib = loadLib();
  const rec = lib.findGuest([SHASHANK], HEADERS, 'SMahesh').record;
  const out = lib.buildRsvpRecord({ attendees: [] }, rec, 'TS');
  assert.equal(out['Attending?'], 'No');
  assert.equal(out['Confirmed Count'], 0);
});

test('recordToRow aligns to header order by name', () => {
  const lib = loadLib();
  const obj = { 'Password': 'X', 'Note': 'hi' };
  assert.deepEqual(lib.recordToRow(obj, ['Note', 'Password', 'Missing']), ['hi', 'X', '']);
});
