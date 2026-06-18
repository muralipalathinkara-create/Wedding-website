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
// Fictional fixtures only — no real guest data/passwords in this repo.
// GUEST_A: invited all 3, 2 extras allowed.
const GUEST_A = ['Avery', 'Stone', '', '', 'Sangeet, Wedding, Reception', 'Y', '2', 'Blair Stone, Quinn Lee', 'AStone'];
const GUEST_B = ['Jordan', 'Rivers', '', '', 'Sangeet, Wedding, Reception', 'N', '', '', 'JRivers'];

test('findGuest matches case-insensitively and trims', () => {
  const lib = loadLib();
  const res = lib.findGuest([GUEST_A, GUEST_B], HEADERS, '  astone ');
  assert.equal(res.status, 'ok');
  assert.equal(res.record.first, 'Avery');
  assert.deepEqual(res.record.extraNames, ['Blair Stone', 'Quinn Lee']);
  assert.equal(res.record.extraCount, 2);
  assert.equal(res.record.extraAllowed, true);
});

test('buildGuestRecord tolerates parenthetical header annotations', () => {
  const lib = loadLib();
  // Real sheets append a note to the extra-guests header; matching must ignore it.
  const annotated = [
    'Primary Guest First Name', 'Last Name', 'Email Address', 'Phone Number',
    'Events Invited', 'Extra Guest? (Y/N)', 'How many Guests?',
    'Names of Extra Guests (separated by commas)', 'Password'
  ];
  const res = lib.findGuest([GUEST_A], annotated, 'AStone');
  assert.equal(res.status, 'ok');
  assert.deepEqual(res.record.extraNames, ['Blair Stone', 'Quinn Lee']);
  assert.equal(res.record.extraCount, 2);
});

test('findGuest returns notfound for blank/unknown', () => {
  const lib = loadLib();
  assert.equal(lib.findGuest([GUEST_A], HEADERS, '').status, 'notfound');
  assert.equal(lib.findGuest([GUEST_A], HEADERS, 'nope').status, 'notfound');
});

test('findGuest flags duplicate passwords as ambiguous', () => {
  const lib = loadLib();
  const dup = GUEST_B.slice(); // same password JRivers
  const res = lib.findGuest([GUEST_B, dup], HEADERS, 'JRivers');
  assert.equal(res.status, 'ambiguous');
});

test('guest with no extras has empty extras', () => {
  const lib = loadLib();
  const res = lib.findGuest([GUEST_B], HEADERS, 'JRivers');
  assert.equal(res.record.extraAllowed, false);
  assert.equal(res.record.extraCount, 0);
  assert.deepEqual(res.record.extraNames, []);
});

test('validateRsvp rejects unknown attendee and uninvited event', () => {
  const lib = loadLib();
  const rec = lib.findGuest([GUEST_B], HEADERS, 'JRivers').record; // invited all, 0 extras
  const ok = lib.validateRsvp({ attendees: [{ name: 'Jordan Rivers', isPrimary: true, events: ['Wedding'] }] }, rec);
  assert.equal(ok.ok, true);
  const bad = lib.validateRsvp({ attendees: [{ name: 'Stranger', isPrimary: false, events: ['Wedding'] }] }, rec);
  assert.equal(bad.ok, false);
});

test('validateRsvp rejects an event the guest was not invited to', () => {
  const lib = loadLib();
  // Guest invited to Sangeet only, no extras.
  const sangeetOnly = ['Maya', 'Brooks', '', '', 'Sangeet', 'N', '', '', 'MBrooks'];
  const rec = lib.findGuest([sangeetOnly], HEADERS, 'MBrooks').record;
  assert.deepEqual(rec.eventsInvited, ['Sangeet']);
  const ok = lib.validateRsvp({ attendees: [{ name: 'Maya Brooks', isPrimary: true, events: ['Sangeet'] }] }, rec);
  assert.equal(ok.ok, true);
  const bad = lib.validateRsvp({ attendees: [{ name: 'Maya Brooks', isPrimary: true, events: ['Reception'] }] }, rec);
  assert.equal(bad.ok, false);
});

test('validateRsvp enforces extra-guest cap', () => {
  const lib = loadLib();
  const rec = lib.findGuest([GUEST_A], HEADERS, 'AStone').record; // cap 2
  const tooMany = lib.validateRsvp({ attendees: [
    { name: 'Avery Stone', isPrimary: true, events: ['Sangeet'] },
    { name: 'Blair Stone', isPrimary: false, events: ['Sangeet'] },
    { name: 'Quinn Lee', isPrimary: false, events: ['Sangeet'] },
    { name: 'Blair Stone', isPrimary: false, events: ['Sangeet'] }
  ] }, rec);
  assert.equal(tooMany.ok, false);
});

test('buildRsvpRecord formats per-event names and dietary', () => {
  const lib = loadLib();
  const rec = lib.findGuest([GUEST_A], HEADERS, 'AStone').record;
  const out = lib.buildRsvpRecord({
    email: 'a@example.com', phone: '', note: 'Yay',
    attendees: [
      { name: 'Avery Stone', isPrimary: true, events: ['Sangeet', 'Wedding'], dietary: 'Vegetarian' },
      { name: 'Blair Stone', isPrimary: false, events: ['Sangeet'], dietary: '' }
    ]
  }, rec, 'TS');
  assert.equal(out['Attending?'], 'Yes');
  assert.equal(out['Confirmed Count'], 2);
  assert.equal(out['Sangeet'], 'Avery Stone, Blair Stone');
  assert.equal(out['Wedding'], 'Avery Stone');
  assert.equal(out['Reception'], '');
  assert.equal(out['Dietary'], 'Avery Stone — Vegetarian; Blair Stone — None');
  assert.equal(out['Email'], 'a@example.com');
});

test('buildRsvpRecord marks decline when nobody attends', () => {
  const lib = loadLib();
  const rec = lib.findGuest([GUEST_B], HEADERS, 'JRivers').record;
  const out = lib.buildRsvpRecord({ attendees: [] }, rec, 'TS');
  assert.equal(out['Attending?'], 'No');
  assert.equal(out['Confirmed Count'], 0);
});

test('recordToRow aligns to header order by name', () => {
  const lib = loadLib();
  const obj = { 'Password': 'X', 'Note': 'hi' };
  assert.deepEqual(lib.recordToRow(obj, ['Note', 'Password', 'Missing']), ['hi', 'X', '']);
});
