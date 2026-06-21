// Pure, DOM-free RSVP helpers. UMD wrapper: exports for Node tests, attaches
// window.RSVPLogic in the browser. No ES modules (keeps inline onclick working).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.RSVPLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var EVENT_NAMES = ['Sangeet', 'Wedding', 'Reception', 'Milwaukee'];
  // Friendly display labels (internal key stays short; the UI shows the label).
  var EVENT_LABELS = {
    'Sangeet': 'Sangeet',
    'Wedding': 'Wedding',
    'Reception': 'Reception',
    'Milwaukee': 'Milwaukee Meet & Greet · Sun, Apr 25'
  };

  function norm(s) { return String(s == null ? '' : s).trim(); }

  function isValidEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm(s));
  }

  function partyMembers(guest) {
    var members = [{ name: norm(guest.first + ' ' + guest.last), isPrimary: true }];
    (guest.extraNames || []).forEach(function (n) {
      if (norm(n)) members.push({ name: norm(n), isPrimary: false });
    });
    return members;
  }

  function buildPayload(state) {
    return {
      action: 'rsvp',
      password: state.password,
      email: norm(state.email),
      phone: norm(state.phone),
      note: norm(state.note),
      hp: state.hp || '',
      attendees: (state.attendees || []).map(function (a) {
        return {
          name: norm(a.name),
          isPrimary: !!a.isPrimary,
          events: (a.events || []).filter(function (e) { return EVENT_NAMES.indexOf(e) >= 0; }),
          dietary: norm(a.dietary)
        };
      })
    };
  }

  function parseNameList(s) {
    return norm(s).split(',').map(function (x) { return x.trim().toLowerCase(); })
      .filter(function (x) { return x.length > 0; });
  }

  function parseDietary(s) {
    var map = {};
    norm(s).split(';').forEach(function (part) {
      var bits = part.split('—');
      if (bits.length >= 2) {
        var name = bits[0].trim().toLowerCase();
        var diet = bits.slice(1).join('—').trim();
        if (name) map[name] = (diet === 'None' ? '' : diet);
      }
    });
    return map;
  }

  function prefillFromExisting(existing, guest) {
    var result = { email: '', phone: '', note: '', attendees: [] };
    if (!existing) return result;
    result.email = norm(existing['Email']);
    result.phone = norm(existing['Phone']);
    result.note = norm(existing['Note']);
    var diet = parseDietary(existing['Dietary']);
    var lists = {};
    EVENT_NAMES.forEach(function (ev) { lists[ev] = parseNameList(existing[ev]); });
    partyMembers(guest).forEach(function (m) {
      var key = m.name.toLowerCase();
      var events = EVENT_NAMES.filter(function (ev) { return lists[ev].indexOf(key) >= 0; });
      result.attendees.push({
        name: m.name, isPrimary: m.isPrimary, coming: events.length > 0,
        events: events, dietary: diet[key] || ''
      });
    });
    return result;
  }

  // Live-format a US phone number as the user types: 5555555555 -> (555) 555-5555.
  function formatPhone(v) {
    var d = String(v == null ? '' : v).replace(/\D/g, '').slice(0, 10);
    if (d.length < 4) return d;
    if (d.length < 7) return '(' + d.slice(0, 3) + ') ' + d.slice(3);
    return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
  }

  return {
    EVENT_NAMES: EVENT_NAMES, EVENT_LABELS: EVENT_LABELS, isValidEmail: isValidEmail, partyMembers: partyMembers,
    buildPayload: buildPayload, prefillFromExisting: prefillFromExisting,
    parseNameList: parseNameList, parseDietary: parseDietary, formatPhone: formatPhone
  };
});
