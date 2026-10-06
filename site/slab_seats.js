/*
 * slab_seats.js: floating seats on a customer's own server (6 Oct 2026).
 *
 * When this app talks to the customer's own server (their database AND their AI service, never
 * Safety Lab's), the server holds the license and counts seats: at most N people at a time. After
 * sign-in the app asks the server for a seat, checks in every 5 minutes to keep it, and gives it
 * back on sign-out or when the window closes. A seat the app stops checking in for (closed lid,
 * lost network) frees itself on the server after 30 minutes.
 *
 * If every seat is taken, the app is covered by one screen saying so, with who holds the seats,
 * "Try again", and "Sign out". It tries again on its own every minute.
 *
 * Never blocks for anything but a definite "all seats are in use" from the server: no server
 * seat service (an older server, 404), seats off (no license or no seat count on the server), a
 * network error, an expired sign-in: in all of those the app carries on as before, and the
 * license check and sign-in do their own jobs.
 *
 * window.SLSeats = { state(), claimNow(), release() } for the test wall and the account panel.
 */
(function () {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : {};
  var RENEW_MS = 5 * 60 * 1000, RETRY_MS = 60 * 1000;
  var st = { active: false, status: 'idle', seats: null, inUse: null, holders: [], message: '' };
  var timer = null, lastToken = '', overlay = null, busy = false;

  function cfg() { return W.SLConfig || {}; }
  function base() {
    var c = cfg();
    if (!(c.mode === 'self-hosted' || c.mode === 'desktop')) return '';
    if (!c.supabaseUrl || !c.aiEndpoint) return '';
    try { if (typeof c.pointsAtSafetyLab === 'function' && (c.pointsAtSafetyLab(c.aiEndpoint) || c.pointsAtSafetyLab(c.supabaseUrl))) return ''; } catch (_) { return ''; }
    return String(c.aiEndpoint).replace(/\/+$/, '');
  }
  function token() {
    try { var s = W.getSupabaseSession && W.getSupabaseSession(); return (s && s.access_token) || ''; } catch (_) { return ''; }
  }
  function device() {
    try {
      var d = localStorage.getItem('safetyLab.seat.device');
      if (!d) { d = 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('safetyLab.seat.device', d); }
      return d;
    } catch (_) { return 'dev-unknown'; }
  }
  function schedule(ms) { if (timer) clearTimeout(timer); timer = setTimeout(function () { claimNow(); }, ms); }

  async function call(op, tok, keepalive) {
    var b = base(); if (!b || !tok) return null;
    var r = await fetch(b + '/seat/' + op, { method: op === 'status' ? 'GET' : 'POST', keepalive: !!keepalive,
      headers: { 'authorization': 'Bearer ' + tok, 'content-type': 'application/json' }, body: op === 'status' ? undefined : JSON.stringify({ device: device() }) });
    var body = null; try { body = await r.json(); } catch (_) {}
    return { status: r.status, body: body || {} };
  }

  async function claimNow() {
    if (busy) return st; busy = true;
    try {
      var tok = token();
      if (!base() || !tok) { st.active = false; st.status = 'idle'; hide(); return st; }
      lastToken = tok;
      var r;
      try { r = await call('claim', tok); } catch (_) { st.status = 'unreachable'; schedule(RETRY_MS); return st; }   // network: never block
      if (!r || r.status === 404 || r.status === 405) { st.active = false; st.status = 'no-seat-service'; hide(); return st; }
      if (r.status === 401) { st.status = 'signed-out'; hide(); return st; }
      if (r.status === 200 && r.body.enabled === false) { st.active = false; st.status = 'off'; st.message = r.body.message || ''; hide(); schedule(RENEW_MS); return st; }
      st.active = true; st.seats = r.body.seats; st.inUse = r.body.inUse; st.holders = r.body.holders || [];
      if (r.status === 200 && r.body.granted) { st.status = 'held'; hide(); schedule(RENEW_MS); }
      else if (r.status === 409) { st.status = 'full'; st.message = r.body.message || ''; show(); schedule(RETRY_MS); }
      else { st.status = 'error-' + r.status; schedule(RETRY_MS); }
      return st;
    } finally { busy = false; }
  }

  async function release(keepalive) {
    if (timer) { clearTimeout(timer); timer = null; }
    var tok = token() || lastToken;
    if (st.status === 'held' && tok) { try { await call('release', tok, keepalive); } catch (_) {} }
    st.status = 'released'; hide();
  }

  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function show() {
    if (typeof document === 'undefined' || !document.body) return;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'slab-seats-full';
      overlay.setAttribute('role', 'alertdialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-labelledby', 'slab-seats-title');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483600;background:rgba(15,23,42,.92);display:flex;align-items:center;justify-content:center;font-family:inherit';
      document.body.appendChild(overlay);
    }
    var list = (st.holders || []).map(function (h) { return '<li>' + esc(h.email) + (h.you ? ' (you)' : '') + '</li>'; }).join('');
    overlay.innerHTML = '<div style="background:#fff;color:#0f172a;max-width:460px;width:calc(100% - 32px);border-radius:12px;padding:24px;box-shadow:0 20px 50px rgba(0,0,0,.4)">' +
      '<h2 id="slab-seats-title" style="margin:0 0 8px;font-size:20px">All ' + esc(st.seats) + ' seats are in use</h2>' +
      '<p style="margin:0 0 12px;line-height:1.5">Your organization\'s license allows ' + esc(st.seats) + ' people at a time. You get in as soon as someone signs out or closes Safety Lab Aero. This screen checks again every minute.</p>' +
      '<p style="margin:0 0 4px;font-weight:600">Using it now:</p><ul style="margin:0 0 16px;padding-left:20px;line-height:1.6">' + list + '</ul>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" id="slab-seats-signout" style="padding:8px 14px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;cursor:pointer">Sign out</button>' +
      '<button type="button" id="slab-seats-retry" style="padding:8px 14px;border-radius:8px;border:0;background:#1d4ed8;color:#fff;cursor:pointer">Try again</button></div></div>';
    document.getElementById('slab-seats-retry').onclick = function () { claimNow(); };
    document.getElementById('slab-seats-signout').onclick = function () { try { var c = W.getSupabaseClient && W.getSupabaseClient(); if (c) c.auth.signOut(); } catch (_) {} };
    try { document.getElementById('slab-seats-retry').focus(); } catch (_) {}
  }
  function hide() { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); overlay = null; }

  // Follow sign-in and sign-out. The client appears once helpers_modules has started it.
  function wire() {
    var c = null; try { c = W.getSupabaseClient && W.getSupabaseClient(); } catch (_) {}
    if (!c || !c.auth || typeof c.auth.onAuthStateChange !== 'function') return false;
    c.auth.onAuthStateChange(function (event, session) {
      if (session && session.access_token) lastToken = session.access_token;
      if (event === 'SIGNED_OUT') { release(false); return; }
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') claimNow();
    });
    claimNow();
    return true;
  }
  if (base()) {
    var tries = 0, iv = setInterval(function () { if (wire() || ++tries > 120) clearInterval(iv); }, 500);
    if (typeof W.addEventListener === 'function') {
      W.addEventListener('pagehide', function () { release(true); });
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && st.status !== 'held') claimNow(); });
    }
  }
  W.SLSeats = { state: function () { return JSON.parse(JSON.stringify(st)); }, claimNow: claimNow, release: release };
})();
