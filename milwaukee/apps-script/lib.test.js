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

test('buildRsvpRecord computes guest count/names and Attending?', () => {
  const lib = loadLib();
  const rec = lib.buildRsvpRecord({
    name: ' Avery Stone ', email: ' a@b.com ', phone: '5551234567', attending: true,
    guestNames: [' Blair Stone ', '', 'Quinn Lee'], dietary: 'Vegetarian', note: 'Excited!'
  }, '2027-01-01T00:00:00.000Z');
  assert.equal(rec['Name'], 'Avery Stone');
  assert.equal(rec['Email'], 'a@b.com');
  assert.equal(rec['Attending?'], 'Yes');
  assert.equal(rec['Guest Count'], 2);
  assert.equal(rec['Guest Names'], 'Blair Stone, Quinn Lee');
  assert.equal(rec['Dietary'], 'Vegetarian');
});

test('buildRsvpRecord zeroes out guests when not attending', () => {
  const lib = loadLib();
  const rec = lib.buildRsvpRecord({ name: 'Avery Stone', email: 'a@b.com', attending: false, guestNames: ['Blair'] }, 'ts');
  assert.equal(rec['Attending?'], 'No');
  assert.equal(rec['Guest Count'], 0);
  assert.equal(rec['Guest Names'], '');
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
