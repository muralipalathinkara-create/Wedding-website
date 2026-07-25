const { test } = require('node:test');
const assert = require('node:assert');
const L = require('./logic.js');

test('isValidEmail', () => {
  assert.equal(L.isValidEmail('a@b.com'), true);
  assert.equal(L.isValidEmail('nope'), false);
  assert.equal(L.isValidEmail(''), false);
});

test('formatPhone live-formats as digits are typed', () => {
  assert.equal(L.formatPhone('555'), '555');
  assert.equal(L.formatPhone('5551234'), '(555) 123-4');
  assert.equal(L.formatPhone('5551234567'), '(555) 123-4567');
  assert.equal(L.formatPhone('555-123-4567 x9'), '(555) 123-4567'); // extra digits truncated
});

test('buildPayload trims fields and drops empty guest names', () => {
  const p = L.buildPayload({
    name: ' Avery Stone ', email: ' a@example.com ', phone: '', attending: true,
    guestNames: [' Blair Stone ', '', '  '], dietary: ' Veg ', note: ' hi ', hp: ''
  });
  assert.equal(p.action, 'rsvp');
  assert.equal(p.name, 'Avery Stone');
  assert.equal(p.email, 'a@example.com');
  assert.equal(p.attending, true);
  assert.deepEqual(p.guestNames, ['Blair Stone']);
  assert.equal(p.dietary, 'Veg');
  assert.equal(p.note, 'hi');
});

test('buildPayload clears guests when not attending', () => {
  const p = L.buildPayload({ name: 'Avery Stone', email: 'a@example.com', attending: false, guestNames: ['Blair'] });
  assert.equal(p.attending, false);
  assert.deepEqual(p.guestNames, []);
});

test('validatePayload requires name and a valid email', () => {
  assert.equal(L.validatePayload({ name: 'Avery', email: 'a@b.com' }).ok, true);
  assert.equal(L.validatePayload({ name: '', email: 'a@b.com' }).ok, false);
  assert.equal(L.validatePayload({ name: 'Avery', email: 'nope' }).ok, false);
});
