const { test } = require('node:test');
const assert = require('node:assert');
const L = require('./logic.js');

const GUEST = {
  first: 'Ritika', last: 'Punathil', email: '', phone: '',
  eventsInvited: ['Sangeet', 'Wedding', 'Reception'],
  extraAllowed: true, extraCount: 2,
  extraNames: ['Rohitha Punathil', 'Ravachandran'], password: 'RPunathil'
};

test('isValidEmail', () => {
  assert.equal(L.isValidEmail('a@b.com'), true);
  assert.equal(L.isValidEmail('nope'), false);
  assert.equal(L.isValidEmail(''), false);
});

test('partyMembers lists primary first then extras', () => {
  const m = L.partyMembers(GUEST);
  assert.deepEqual(m, [
    { name: 'Ritika Punathil', isPrimary: true },
    { name: 'Rohitha Punathil', isPrimary: false },
    { name: 'Ravachandran', isPrimary: false }
  ]);
});

test('buildPayload filters events to valid names and trims', () => {
  const p = L.buildPayload({
    password: 'RPunathil', email: ' r@x.com ', phone: '', note: ' hi ', hp: '',
    attendees: [{ name: ' Ritika Punathil ', isPrimary: true, events: ['Wedding', 'Bogus'], dietary: ' Veg ' }]
  });
  assert.equal(p.action, 'rsvp');
  assert.equal(p.email, 'r@x.com');
  assert.equal(p.note, 'hi');
  assert.deepEqual(p.attendees[0].events, ['Wedding']);
  assert.equal(p.attendees[0].name, 'Ritika Punathil');
  assert.equal(p.attendees[0].dietary, 'Veg');
});

test('prefillFromExisting maps summary row back to attendee state', () => {
  const existing = {
    'Email': 'r@x.com', 'Phone': '123', 'Note': 'Yay',
    'Sangeet': 'Ritika Punathil, Rohitha Punathil',
    'Wedding': 'Ritika Punathil', 'Reception': '',
    'Dietary': 'Ritika Punathil — Vegetarian; Rohitha Punathil — None'
  };
  const pre = L.prefillFromExisting(existing, GUEST);
  assert.equal(pre.email, 'r@x.com');
  const ritika = pre.attendees.find(a => a.name === 'Ritika Punathil');
  const rohitha = pre.attendees.find(a => a.name === 'Rohitha Punathil');
  const rav = pre.attendees.find(a => a.name === 'Ravachandran');
  assert.equal(ritika.coming, true);
  assert.deepEqual(ritika.events.sort(), ['Sangeet', 'Wedding']);
  assert.equal(ritika.dietary, 'Vegetarian');
  assert.equal(rohitha.coming, true);
  assert.deepEqual(rohitha.events, ['Sangeet']);
  assert.equal(rohitha.dietary, '');
  assert.equal(rav.coming, false);
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
