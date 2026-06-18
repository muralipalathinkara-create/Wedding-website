// DOM wiring for gate login, event gating, and the two-step RSVP wizard.
// Pure logic is in js/logic.js (window.RSVPLogic). Global functions are used
// by inline onclick/onsubmit handlers in index.html.
(function () {
  var L = window.RSVPLogic;
  var guest = null;        // logged-in guest record from the server
  var prefill = null;      // prefill state from an existing RSVP (or empty)

  function $(id) { return document.getElementById(id); }

  async function post(payload) {
    // text/plain => CORS "simple request" => no preflight, response readable.
    var res = await fetch(window.SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    return res.json();
  }

  // ---- Gate login ----
  window.unlockSite = async function () {
    var input = $('sitePassword');
    var pw = input.value.trim();
    var err = $('gateError');
    var btn = document.querySelector('.gate-submit');
    if (!pw) { return showGateError('Please enter your code.'); }
    btn.disabled = true; btn.textContent = 'Checking…';
    try {
      var data = await post({ action: 'login', password: pw });
      if (!data.ok) {
        return showGateError(data.error === 'ambiguous'
          ? 'This code matches more than one guest — please contact us.'
          : 'That code doesn\'t match — please check your invitation.');
      }
      guest = data.guest;
      prefill = L.prefillFromExisting(data.existing, guest);
      revealSite();
    } catch (e) {
      showGateError('Network error — please try again.');
    } finally {
      btn.disabled = false; btn.textContent = 'Enter';
    }
  };

  function showGateError(msg) {
    var err = $('gateError'); err.textContent = msg; err.style.display = 'block';
    var inp = $('sitePassword'); inp.classList.add('error'); inp.value = ''; inp.focus();
  }

  function revealSite() {
    var inv = {};
    guest.eventsInvited.forEach(function (e) { inv[e] = true; });
    var hasFriday = !!inv.Sangeet, hasSaturday = !!inv.Wedding || !!inv.Reception;
    $('fridayBlock').style.display = hasFriday ? 'block' : 'none';
    $('saturdayBlock').style.display = hasSaturday ? 'block' : 'none';
    $('weddingCard').style.display = inv.Wedding ? '' : 'none';
    $('receptionCard').style.display = inv.Reception ? '' : 'none';
    $('accessLabel').textContent = guest.eventsInvited.join(' · ') || 'Your Invitation';
    if (prefill.email) $('f_email').value = prefill.email;
    if (prefill.phone) $('f_phone').value = prefill.phone;
    if (prefill.note) $('f_note').value = prefill.note;
    buildWhoComing();
    $('siteGate').style.display = 'none';
    $('siteContent').classList.add('unlocked');
  }

  // ---- Step 1: who's coming ----
  function buildWhoComing() {
    var grp = $('whoComingGroup');
    grp.innerHTML = '<span class="ecg-label">Who in your party is coming?</span>';
    L.partyMembers(guest).forEach(function (m, i) {
      var pre = prefill.attendees.find(function (a) { return a.name === m.name; });
      var checked = pre ? pre.coming : true;   // default everyone coming for new RSVPs
      var row = document.createElement('label');
      row.className = 'event-checkbox-row';
      row.innerHTML = '<input type="checkbox" class="who-coming" value="' + i + '"' +
        (checked ? ' checked' : '') + '><span><strong>' + escapeHtml(m.name) + '</strong>' +
        (m.isPrimary ? '' : ' (guest)') + '</span>';
      grp.appendChild(row);
    });
  }

  window.goStep2 = function () {
    var members = L.partyMembers(guest);
    var coming = [].slice.call(document.querySelectorAll('.who-coming:checked'))
      .map(function (c) { return members[parseInt(c.value, 10)]; });
    var details = $('attendeeDetails');
    details.innerHTML = '';
    if (!coming.length) {
      details.innerHTML = '<p class="rsvp-deadline">No one selected — submitting will send your regrets.</p>';
    }
    coming.forEach(function (m) {
      var pre = prefill.attendees.find(function (a) { return a.name === m.name; });
      var events = pre && pre.events.length ? pre.events : guest.eventsInvited.slice();
      var diet = pre ? pre.dietary : '';
      var box = document.createElement('div');
      box.className = 'event-card visible';
      box.style.cssText = 'padding:1.4rem 1.6rem;margin-bottom:1rem';
      box.setAttribute('data-name', m.name);
      var checks = guest.eventsInvited.map(function (ev) {
        var on = events.indexOf(ev) >= 0;
        return '<label class="event-checkbox-row"><input type="checkbox" class="att-event" value="' +
          ev + '"' + (on ? ' checked' : '') + '><span>' + ev + '</span></label>';
      }).join('');
      box.innerHTML = '<p class="event-tag">' + escapeHtml(m.name) + '</p>' +
        '<div class="events-check-group"><span class="ecg-label">Events</span>' + checks + '</div>' +
        '<div class="form-group"><label>Dietary Restrictions</label>' +
        '<input type="text" class="att-diet" placeholder="Vegetarian, gluten-free, allergies…" value="' +
        escapeAttr(diet) + '"></div>';
      details.appendChild(box);
    });
    $('rsvpStep1').style.display = 'none';
    $('rsvpStep2').style.display = 'block';
  };

  window.goStep1 = function () {
    $('rsvpStep2').style.display = 'none';
    $('rsvpStep1').style.display = 'block';
  };

  // ---- Submit ----
  window.submitRSVP = async function (e) {
    e.preventDefault();
    var status = $('submitStatus');
    var email = $('f_email').value.trim();
    if (!L.isValidEmail(email)) { status.textContent = 'Please enter a valid email address.'; return; }
    var btn = $('submitBtn');
    btn.disabled = true; status.textContent = 'Sending…';
    var attendees = [].slice.call(document.querySelectorAll('#attendeeDetails [data-name]')).map(function (box) {
      return {
        name: box.getAttribute('data-name'),
        isPrimary: L.partyMembers(guest)[0].name === box.getAttribute('data-name'),
        events: [].slice.call(box.querySelectorAll('.att-event:checked')).map(function (c) { return c.value; }),
        dietary: box.querySelector('.att-diet').value
      };
    });
    var payload = L.buildPayload({
      password: guest.password, email: email, phone: $('f_phone').value,
      note: $('f_note').value, hp: $('f_hp').value, attendees: attendees
    });
    try {
      var data = await post(payload);
      if (data && data.ok) { showSuccess(); }
      else { status.textContent = 'Something went wrong: ' + (data && data.error || 'unknown') + '. Please try again or contact us.'; btn.disabled = false; }
    } catch (err) {
      status.textContent = 'Network error — please try again or contact us directly.';
      btn.disabled = false;
    }
  };

  function showSuccess() {
    $('rsvpForm').style.display = 'none';
    $('formSuccess').style.display = 'block';
  }

  function escapeHtml(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

  // ---- Misc UI (kept from original) ----
  window.addEventListener('scroll', function () {
    var nav = $('nav'); if (nav) nav.style.boxShadow = window.scrollY > 40 ? '0 4px 20px rgba(0,0,0,.07)' : 'none';
  });
  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { if (en.isIntersecting) en.target.classList.add('visible'); });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal, .event-card').forEach(function (el) { obs.observe(el); });
  var phoneInput = $('f_phone');
  if (phoneInput) phoneInput.addEventListener('input', function () { this.value = L.formatPhone(this.value); });
  window.openLightbox = function (src) { $('lbImg').src = src; $('lightbox').classList.add('open'); };
  window.closeLightbox = function () { $('lightbox').classList.remove('open'); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLightbox(); });
})();
