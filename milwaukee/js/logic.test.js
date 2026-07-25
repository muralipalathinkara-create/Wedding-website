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

test('buildAttendees puts the primary first with their own dietary, then named guests', () => {
  const attendees = L.buildAttendees(' Avery Stone ', ' Veg ', [
    { name: ' Blair Stone ', dietary: ' Gluten-free ' }, { name: '', dietary: 'ignored, no name' }, { name: 'Quinn Lee' }
  ]);
  assert.deepEqual(attendees, [
    { name: 'Avery Stone', isPrimary: true, dietary: 'Veg' },
    { name: 'Blair Stone', isPrimary: false, dietary: 'Gluten-free' },
    { name: 'Quinn Lee', isPrimary: false, dietary: '' }
  ]);
});

test('buildPayload trims fields and builds per-attendee dietary list', () => {
  const p = L.buildPayload({
    name: ' Avery Stone ', email: ' a@example.com ', phone: '', attending: true, dietary: 'Veg',
    guests: [{ name: 'Blair Stone', dietary: 'Gluten-free' }], note: ' hi ', hp: ''
  });
  assert.equal(p.action, 'rsvp');
  assert.equal(p.name, 'Avery Stone');
  assert.equal(p.email, 'a@example.com');
  assert.equal(p.attending, true);
  assert.deepEqual(p.attendees, [
    { name: 'Avery Stone', isPrimary: true, dietary: 'Veg' },
    { name: 'Blair Stone', isPrimary: false, dietary: 'Gluten-free' }
  ]);
  assert.equal(p.note, 'hi');
});

test('buildPayload clears attendees when not attending', () => {
  const p = L.buildPayload({ name: 'Avery Stone', email: 'a@example.com', attending: false, guests: [{ name: 'Blair' }] });
  assert.equal(p.attending, false);
  assert.deepEqual(p.attendees, []);
});

test('validatePayload requires name and a valid email', () => {
  assert.equal(L.validatePayload({ name: 'Avery', email: 'a@b.com' }).ok, true);
  assert.equal(L.validatePayload({ name: '', email: 'a@b.com' }).ok, false);
  assert.equal(L.validatePayload({ name: 'Avery', email: 'nope' }).ok, false);
});
