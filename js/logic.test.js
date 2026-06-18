const { test } = require('node:test');
const assert = require('node:assert');
const L = require('./logic.js');

// Fictional fixture only — no real guest data/passwords in this repo.
const GUEST = {
  first: 'Avery', last: 'Stone', email: '', phone: '',
  eventsInvited: ['Sangeet', 'Wedding', 'Reception'],
  extraAllowed: true, extraCount: 2,
  extraNames: ['Blair Stone', 'Quinn Lee'], password: 'AStone'
};

test('isValidEmail', () => {
  assert.equal(L.isValidEmail('a@b.com'), true);
  assert.equal(L.isValidEmail('nope'), false);
  assert.equal(L.isValidEmail(''), false);
});

test('partyMembers lists primary first then extras', () => {
  const m = L.partyMembers(GUEST);
  assert.deepEqual(m, [
    { name: 'Avery Stone', isPrimary: true },
    { name: 'Blair Stone', isPrimary: false },
    { name: 'Quinn Lee', isPrimary: false }
  ]);
});

test('buildPayload filters events to valid names and trims', () => {
  const p = L.buildPayload({
    password: 'AStone', email: ' a@example.com ', phone: '', note: ' hi ', hp: '',
    attendees: [{ name: ' Avery Stone ', isPrimary: true, events: ['Wedding', 'Bogus'], dietary: ' Veg ' }]
  });
  assert.equal(p.action, 'rsvp');
  assert.equal(p.email, 'a@example.com');
  assert.equal(p.note, 'hi');
  assert.deepEqual(p.attendees[0].events, ['Wedding']);
  assert.equal(p.attendees[0].name, 'Avery Stone');
  assert.equal(p.attendees[0].dietary, 'Veg');
});

test('prefillFromExisting maps summary row back to attendee state', () => {
  const existing = {
    'Email': 'a@example.com', 'Phone': '123', 'Note': 'Yay',
    'Sangeet': 'Avery Stone, Blair Stone',
    'Wedding': 'Avery Stone', 'Reception': '',
    'Dietary': 'Avery Stone — Vegetarian; Blair Stone — None'
  };
  const pre = L.prefillFromExisting(existing, GUEST);
  assert.equal(pre.email, 'a@example.com');
  const primary = pre.attendees.find(a => a.name === 'Avery Stone');
  const extra = pre.attendees.find(a => a.name === 'Blair Stone');
  const notComing = pre.attendees.find(a => a.name === 'Quinn Lee');
  assert.equal(primary.coming, true);
  assert.deepEqual(primary.events.sort(), ['Sangeet', 'Wedding']);
  assert.equal(primary.dietary, 'Vegetarian');
  assert.equal(extra.coming, true);
  assert.deepEqual(extra.events, ['Sangeet']);
  assert.equal(extra.dietary, '');
  assert.equal(notComing.coming, false);
});

test('prefillFromExisting returns empty attendees when no existing row', () => {
  const pre = L.prefillFromExisting(null, GUEST);
  assert.deepEqual(pre.attendees, []);
});

test('formatPhone formats a US number progressively and ignores non-digits', () => {
  assert.equal(L.formatPhone('5555555555'), '(555) 555-5555');
  assert.equal(L.formatPhone('55'), '55');
  assert.equal(L.formatPhone('5551234'), '(555) 123-4');
  assert.equal(L.formatPhone('(555) 555-5555'), '(555) 555-5555');
  assert.equal(L.formatPhone('555555555599'), '(555) 555-5555'); // caps at 10 digits
  assert.equal(L.formatPhone(''), '');
});
