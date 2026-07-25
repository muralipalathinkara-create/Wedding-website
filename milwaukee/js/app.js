// DOM wiring for the Milwaukee Meet & Greet open RSVP form (no gate/login).
// Pure logic is in js/logic.js (window.MilwaukeeRSVPLogic).
(function () {
  var L = window.MilwaukeeRSVPLogic;

  function $(id) { return document.getElementById(id); }

  async function post(payload) {
    // text/plain => CORS "simple request" => no preflight, response readable.
    var res = await fetch(window.MILWAUKEE_SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    return res.json();
  }

  // ---- Dynamic guest rows (each with its own dietary field) ----
  var guestCounter = 0;

  window.addGuestRow = function (name, dietary) {
    guestCounter++;
    var row = document.createElement('div');
    row.className = 'guest-row';
    row.innerHTML =
      '<div class="guest-row-fields">' +
        '<input type="text" class="guest-name" placeholder="Guest name" value="' + escapeAttr(name || '') + '">' +
        '<input type="text" class="guest-diet" placeholder="Dietary restrictions (optional)" value="' + escapeAttr(dietary || '') + '">' +
      '</div>' +
      '<button type="button" class="guest-remove" onclick="this.parentElement.remove()" aria-label="Remove guest">&times;</button>';
    $('guestList').appendChild(row);
  };

  function guestEntries() {
    return [].slice.call(document.querySelectorAll('.guest-row')).map(function (row) {
      return {
        name: row.querySelector('.guest-name').value,
        dietary: row.querySelector('.guest-diet').value
      };
    });
  }

  // ---- Attending toggle: hide the guest list when declining ----
  function updateAttendingUI() {
    var attending = document.querySelector('input[name="attending"]:checked').value === 'yes';
    $('guestSection').style.display = attending ? 'block' : 'none';
  }
  document.addEventListener('change', function (e) {
    if (e.target && e.target.name === 'attending') updateAttendingUI();
  });

  // ---- Submit ----
  window.submitRSVP = async function (e) {
    e.preventDefault();
    var status = $('submitStatus');
    var name = $('f_name').value.trim();
    var email = $('f_email').value.trim();
    if (!name) { status.textContent = 'Please enter your name.'; return; }
    if (!L.isValidEmail(email)) { status.textContent = 'Please enter a valid email address.'; return; }

    var btn = $('submitBtn');
    btn.disabled = true; status.textContent = 'Sending…';

    var attending = document.querySelector('input[name="attending"]:checked').value === 'yes';
    var payload = L.buildPayload({
      name: name, email: email, phone: $('f_phone').value,
      attending: attending, dietary: $('f_diet').value, guests: guestEntries(),
      note: $('f_note').value, hp: $('f_hp').value
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

  function escapeAttr(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ---- Misc UI ----
  window.addEventListener('scroll', function () {
    var nav = $('nav'); if (nav) nav.classList.toggle('scrolled', window.scrollY > 40);
  });

  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('visible'); obs.unobserve(en.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal').forEach(function (el) { obs.observe(el); });

  var phoneInput = $('f_phone');
  if (phoneInput) phoneInput.addEventListener('input', function () { this.value = L.formatPhone(this.value); });

  // ---- Lightbox gallery ----
  var lbList = [], lbIndex = 0;
  function lbRefresh() {
    lbList = Array.prototype.slice.call(document.querySelectorAll('.gallery-grid img'))
      .map(function (im) { return im.getAttribute('src'); });
  }
  window.openLightbox = function (src) {
    lbRefresh();
    lbIndex = Math.max(0, lbList.indexOf(src));
    $('lbImg').src = src;
    $('lightbox').classList.add('open');
  };
  window.closeLightbox = function () { $('lightbox').classList.remove('open'); };
  window.lbStep = function (dir) {
    if (!lbList.length) lbRefresh();
    if (!lbList.length) return;
    lbIndex = (lbIndex + dir + lbList.length) % lbList.length;
    $('lbImg').src = lbList[lbIndex];
  };
  document.addEventListener('keydown', function (e) {
    if (!$('lightbox') || !$('lightbox').classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') lbStep(-1);
    else if (e.key === 'ArrowRight') lbStep(1);
  });

  // Start with one empty guest row for convenience.
  addGuestRow();
})();
