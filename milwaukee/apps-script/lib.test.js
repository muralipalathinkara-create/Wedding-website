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

test('validateRsvp requires name and valid email', () => {
  const lib = loadLib();
  assert.equal(lib.validateRsvp({ name: 'Avery Stone', email: 'a@b.com' }).ok, true);
  assert.equal(lib.validateRsvp({ name: '', email: 'a@b.com' }).ok, false);
  assert.equal(lib.validateRsvp({ name: 'Avery Stone', email: 'nope' }).ok, false);
});

test('buildRsvpRecord computes guest count/names and a per-attendee Dietary column', () => {
  const lib = loadLib();
  const rec = lib.buildRsvpRecord({
    name: ' Avery Stone ', email: ' a@b.com ', phone: '5551234567', attending: true,
    attendees: [
      { name: 'Avery Stone', isPrimary: true, dietary: 'Vegetarian' },
      { name: 'Blair Stone', isPrimary: false, dietary: '' },
      { name: 'Quinn Lee', isPrimary: false, dietary: 'Gluten-free' }
    ],
    note: 'Excited!'
  }, '2027-01-01T00:00:00.000Z');
  assert.equal(rec['Name'], 'Avery Stone');
  assert.equal(rec['Email'], 'a@b.com');
  assert.equal(rec['Attending?'], 'Yes');
  assert.equal(rec['Guest Count'], 2);
  assert.equal(rec['Guest Names'], 'Blair Stone, Quinn Lee');
  assert.equal(rec['Dietary'], 'Avery Stone — Vegetarian; Blair Stone — None; Quinn Lee — Gluten-free');
});

test('buildRsvpRecord zeroes out guests and dietary when not attending', () => {
  const lib = loadLib();
  const rec = lib.buildRsvpRecord({
    name: 'Avery Stone', email: 'a@b.com', attending: false,
    attendees: [{ name: 'Avery Stone', isPrimary: true, dietary: 'Vegetarian' }]
  }, 'ts');
  assert.equal(rec['Attending?'], 'No');
  assert.equal(rec['Guest Count'], 0);
  assert.equal(rec['Guest Names'], '');
  assert.equal(rec['Dietary'], '');
});

test('formatDietary lists each attendee, defaulting to "None"', () => {
  const lib = loadLib();
  const s = lib.formatDietary([{ name: 'Avery', dietary: 'Vegan' }, { name: 'Blair', dietary: '' }]);
  assert.equal(s, 'Avery — Vegan; Blair — None');
});

test('headerIndexMap tolerates parenthetical header annotations', () => {
  const lib = loadLib();
  const headers = ['Last Updated', 'Name', 'Email', 'Guest Names (separated by commas)'];
  const hm = lib.headerIndexMap(headers);
  assert.equal(lib.col(['ts', 'Avery', 'a@b.com', 'Blair, Quinn'], hm, 'guest names'), 'Blair, Quinn');
});

test('recordToRow maps a record onto arbitrary header order', () => {
  const lib = loadLib();
  const rec = { 'Name': 'Avery', 'Email': 'a@b.com' };
  const row = lib.recordToRow(rec, ['Email', 'Name', 'Phone']);
  assert.deepEqual(row, ['a@b.com', 'Avery', '']);
});
