// Pure, DOM-free RSVP helpers for the Milwaukee Meet & Greet (open RSVP, no
// password gate, no guest list). UMD wrapper: exports for Node tests, attaches
// window.MilwaukeeRSVPLogic in the browser.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.MilwaukeeRSVPLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function norm(s) { return String(s == null ? '' : s).trim(); }

  function isValidEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm(s));
  }

  // Live-format a US phone number as the user types: 5555555555 -> (555) 555-5555.
  function formatPhone(v) {
    var d = String(v == null ? '' : v).replace(/\D/g, '').slice(0, 10);
    if (d.length < 4) return d;
    if (d.length < 7) return '(' + d.slice(0, 3) + ') ' + d.slice(3);
    return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
  }

  // Each attendee (the primary RSVP'er plus every guest they add) gets their
  // own name + dietary restrictions, mirroring the main wedding site's per-
  // attendee dietary model.
  function buildAttendees(name, dietary, guests) {
    var attendees = [{ name: norm(name), isPrimary: true, dietary: norm(dietary) }];
    (guests || []).forEach(function (g) {
      var gname = norm(g && g.name);
      if (gname) attendees.push({ name: gname, isPrimary: false, dietary: norm(g && g.dietary) });
    });
    return attendees;
  }

  function buildPayload(state) {
    var attending = !!state.attending;
    return {
      action: 'rsvp',
      name: norm(state.name),
      email: norm(state.email),
      phone: norm(state.phone),
      attending: attending,
      attendees: attending ? buildAttendees(state.name, state.dietary, state.guests) : [],
      note: norm(state.note),
      hp: state.hp || ''
    };
  }

  function validatePayload(payload) {
    var errors = [];
    if (!payload || !norm(payload.name)) errors.push('name is required');
    if (!payload || !isValidEmail(payload.email)) errors.push('valid email is required');
    return { ok: errors.length === 0, errors: errors };
  }

  return {
    isValidEmail: isValidEmail,
    formatPhone: formatPhone,
    buildAttendees: buildAttendees,
    buildPayload: buildPayload,
    validatePayload: validatePayload
  };
});
