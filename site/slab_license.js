/*
 * slab_license.js — offline signed-license verification. (6 Sep 2026)
 *
 * A customer install proves it is licensed WITHOUT calling Safety Lab: the license
 * is a file Safety Lab signed (ECDSA P-256 / SHA-256, "ES256") and this module
 * verifies it locally with the browser's built-in WebCrypto against the PUBLIC keys
 * baked in below. Valid + in its time window + bound to this customer → that tier.
 * Nothing leaves the machine.
 *
 * Where the blob comes from (first found wins):
 *   window.__SLAB_LICENSE__                      — injected by a self-hosted bootstrap or the desktop preload
 *   localStorage 'safetyLab.license.signed'      — a .lic file the user loaded (browser-only / desktop)
 *
 * Blob format: base64url(payload JSON) '.' base64url(raw r||s signature over the payload bytes).
 * Payload: { v:1, alg:'ES256', issuer:'safetylabaero', kid, id, customer, tier, seats,
 *            features[], bind:{domains[], tenant, backend}, issuedAt, notBefore, notAfter }
 *
 * ROBUSTNESS: multiple public keys (rotation) · time window · backend + email-domain +
 * tenant binding · clock-tamper resistance (remember the newest issuedAt seen; refuse a
 * clock that has gone backwards past it) · versioned format · FAIL CLOSED: on a customer
 * install (self-hosted / browser-only / desktop) an absent or invalid license = 'unpaid'.
 * On the hosted demo cloud a license is optional and the existing account path applies.
 *
 * The core decision is a pure function (window.SLLicenseVerify) so the test wall can
 * execute it in Node with an ephemeral keypair.
 *
 * 1.2 (6 Sep 2026, desktop parity):
 *   · trial licenses — payload.trial:true (a normal, short-dated license Safety Lab signs
 *     for an evaluation; the app shows "Trial · N days left"). Waqas: "temp licenses for trials".
 *   · THE LICENSE SCREEN — on a customer install with no valid license this module now
 *     renders the "load your license" screen itself (file picker or paste), verifies the
 *     file with the SAME verifier, stores it, and reloads. One screen for all three doors
 *     (self-hosted web, browser-only, desktop); the desktop's native gate calls the same
 *     verifier before the window even opens. window.SLLicenseInstall(blob) is the API.
 *   · nothing is ever stored unless it verified — a bad file is refused with the reason.
 */
(function () {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : {};

  // Safety Lab's PUBLIC signing keys (JWK). Public keys are not secret. Add the next key
  // here BEFORE rotating so already-issued licenses keep verifying; remove old ones when
  // no license signed with them remains valid. With no key, no license can verify, which
  // fails CLOSED on customer installs. The file copy of each key lives in
  // tools/license/<name>.jwk.json and regression_offline_license proves this list matches it.
  var PUBLIC_KEYS = [
    { "kid": "slab-2026-09-06", "alg": "ES256", "kty": "EC", "crv": "P-256", "x": "JBEcOWNzJqwfwZIZiRbCb8PEH2CYhronJ-UuKsB-nAM", "y": "N3yo7Sbc5Gm5VYGo-IWbGHWukiPMmEJtAQIhZRgc0Ys" }
  ];

  var TIERS = { edu: 0, pro: 1, 'pro-plus': 2, enterprise: 3 };
  var CLOCK_SKEW_MS = 5 * 60 * 1000;
  var LS_SIGNED = 'safetyLab.license.signed';
  var LS_MAXSEEN = 'safetyLab.license.maxIssuedSeen';

  function b64uToBytes(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
    var bin = atob(s); var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function utf8(s) { return new TextEncoder().encode(s); }
  function host(u) { try { return new URL(u).host.toLowerCase(); } catch (_) { return ''; } }
  function emailDomain(e) { var m = /@([^@\s]+)$/.exec(String(e || '').toLowerCase()); return m ? m[1] : ''; }

  // Pure verifier. ctx = { now(ms), keys[], mode, backendHost, email, tenant, maxSeen(ms), subtle }
  // Returns { valid, reason, tier, seats, features, customer, id, expiresAt, bind, payload, maxSeenNext }
  async function verify(blob, ctx) {
    var out = { valid: false, reason: '', tier: null, seats: null, features: [], customer: null, id: null, expiresAt: null, bind: null, payload: null, maxSeenNext: ctx.maxSeen || 0, trial: false, daysLeft: null };
    try {
      if (!blob || typeof blob !== 'string') { out.reason = 'no license'; return out; }
      var parts = blob.trim().split('.');
      if (parts.length !== 2) { out.reason = 'malformed license'; return out; }
      var payloadB64 = parts[0], sigBytes = b64uToBytes(parts[1]);
      var payloadBytes = b64uToBytes(payloadB64);
      var payload; try { payload = JSON.parse(new TextDecoder().decode(payloadBytes)); } catch (_) { out.reason = 'malformed license payload'; return out; }
      out.payload = payload;
      if (payload.v !== 1 || payload.alg !== 'ES256' || payload.issuer !== 'safetylabaero') { out.reason = 'unsupported license format'; return out; }
      if (!ctx.keys || !ctx.keys.length) { out.reason = 'no public key configured'; return out; }
      // signature: try the key with the matching kid first, then the rest (rotation)
      var keys = ctx.keys.slice().sort(function (a, b) { return (a.kid === payload.kid ? -1 : 0) - (b.kid === payload.kid ? -1 : 0); });
      var sigOk = false;
      for (var i = 0; i < keys.length && !sigOk; i++) {
        try {
          var k = keys[i];
          var ck = await ctx.subtle.importKey('jwk', { kty: k.kty, crv: k.crv, x: k.x, y: k.y, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
          sigOk = await ctx.subtle.verify({ name: 'ECDSA', hash: { name: 'SHA-256' } }, ck, sigBytes, utf8(payloadB64));
        } catch (_) { sigOk = false; }
      }
      if (!sigOk) { out.reason = 'signature invalid'; return out; }
      // time window
      var now = ctx.now, nb = Date.parse(payload.notBefore), na = Date.parse(payload.notAfter), ia = Date.parse(payload.issuedAt || payload.notBefore);
      if (isNaN(nb) || isNaN(na)) { out.reason = 'license has no valid dates'; return out; }
      if (now + CLOCK_SKEW_MS < nb) { out.reason = 'license not yet valid'; return out; }
      if (now > na) { out.reason = 'license expired on ' + new Date(na).toDateString(); return out; }
      // clock tamper: the clock must not sit before the newest issuedAt we have ever seen
      var maxSeen = Math.max(ctx.maxSeen || 0, isNaN(ia) ? 0 : ia);
      if (now + CLOCK_SKEW_MS < maxSeen) { out.reason = 'system clock is earlier than a license already seen — check the clock'; return out; }
      out.maxSeenNext = maxSeen;
      // tier
      if (!TIERS.hasOwnProperty(payload.tier)) { out.reason = 'unknown tier'; return out; }
      // binding
      var bind = payload.bind || {};
      if (bind.backend && ctx.backendHost && String(bind.backend).toLowerCase() !== ctx.backendHost) { out.reason = 'license is bound to a different backend (' + bind.backend + ')'; return out; }
      if (bind.domains && bind.domains.length && ctx.email) {
        var d = emailDomain(ctx.email);
        var okDom = bind.domains.some(function (x) { x = String(x).toLowerCase(); return d === x || d.slice(-(x.length + 1)) === '.' + x; });
        if (!okDom) { out.reason = 'license is bound to ' + bind.domains.join(', ') + ' — this account (' + d + ') is not covered'; return out; }
      }
      if (bind.tenant && ctx.tenant && String(bind.tenant).toLowerCase() !== String(ctx.tenant).toLowerCase()) { out.reason = 'license is bound to a different organization'; return out; }
      out.valid = true; out.reason = 'ok';
      out.tier = payload.tier; out.seats = payload.seats == null ? null : Number(payload.seats);
      out.features = Array.isArray(payload.features) ? payload.features.slice() : [];
      out.customer = payload.customer || null; out.id = payload.id || null;
      out.expiresAt = new Date(na).toISOString(); out.bind = bind;
      out.trial = payload.trial === true;
      out.daysLeft = Math.max(0, Math.ceil((na - now) / 86400000));
      return out;
    } catch (e) { out.reason = 'verification error'; return out; }
  }
  W.SLLicenseVerify = verify;
  W.SLLicensePublicKeys = PUBLIC_KEYS;

  // ---- run at load ----
  function readBlob() {
    try { if (W.__SLAB_LICENSE__) return String(W.__SLAB_LICENSE__); } catch (_) {}
    try { var s = localStorage.getItem(LS_SIGNED); if (s) return s; } catch (_) {}
    return '';
  }
  function customerMode() {
    var m = (W.SLConfig && W.SLConfig.mode) || 'hosted-demo';
    return m === 'self-hosted' || m === 'browser-only' || m === 'desktop';
  }
  var result = { valid: false, reason: 'not checked', tier: null, authoritative: false };
  var ready = (async function () {
    var blob = readBlob();
    var isCustomer = customerMode();
    var subtle = (W.crypto && W.crypto.subtle) || null;
    if (!subtle) { result = { valid: false, reason: 'WebCrypto unavailable', tier: null, authoritative: isCustomer }; return finish(); }
    var maxSeen = 0; try { maxSeen = Number(localStorage.getItem(LS_MAXSEEN) || 0) || 0; } catch (_) {}
    var email = ''; try { email = localStorage.getItem('safetyLab.signup.email') || ''; } catch (_) {}
    var r = await verify(blob, {
      now: Date.now(), keys: PUBLIC_KEYS, subtle: subtle,
      backendHost: host((W.SLConfig && W.SLConfig.supabaseUrl) || ''),
      email: email, tenant: '', maxSeen: maxSeen
    });
    if (r.valid) { try { localStorage.setItem(LS_MAXSEEN, String(r.maxSeenNext)); } catch (_) {} }
    result = {
      valid: r.valid, reason: r.reason, tier: r.tier, seats: r.seats, features: r.features,
      customer: r.customer, id: r.id, expiresAt: r.expiresAt, bind: r.bind, trial: r.trial, daysLeft: r.daysLeft,
      // On a customer install the signed license is the ONLY authority (absent/invalid → unpaid).
      // On the hosted demo it is optional: valid → applies; absent → the account path decides.
      authoritative: isCustomer || r.valid,
      present: !!blob
    };
    return finish();
  })();
  function finish() {
    try { Object.freeze(result); } catch (_) {}
    W.SLLicense = result;
    try {
      if (result.valid) {
        localStorage.setItem('safetyLab.license.tier', result.tier);
        localStorage.setItem('safetyLab.license.source', 'signed');
        // keep the existing AI plumbing happy: a license-derived marker where the cloud
        // token used to go. The customer's own AI proxy verifies the signed license itself.
        localStorage.setItem('safetyLab.license.token', 'signed:' + (result.id || 'license'));
        console.info('[Safety Lab Aero] signed license OK — ' + result.customer + ' · ' + result.tier + (result.trial ? ' · TRIAL' : '') + ' · expires ' + String(result.expiresAt).slice(0, 10) + ' (' + result.daysLeft + ' days left)');
      } else if (result.authoritative) {
        localStorage.setItem('safetyLab.license.tier', 'unpaid');
        localStorage.setItem('safetyLab.license.source', 'signed');
        localStorage.removeItem('safetyLab.license.token');
        console.warn('[Safety Lab Aero] no valid license on this install — ' + result.reason);
      }
    } catch (_) {}
    return result;
  }
  W.__slabSignedLicenseReady = ready;
  // Re-check with the signed-in identity (auth_gate calls this once the session is known).
  W.SLLicenseCheckIdentity = async function (email, tenant) {
    var blob = readBlob(); if (!blob) return W.SLLicense;
    var subtle = (W.crypto && W.crypto.subtle) || null; if (!subtle) return W.SLLicense;
    var maxSeen = 0; try { maxSeen = Number(localStorage.getItem(LS_MAXSEEN) || 0) || 0; } catch (_) {}
    var r = await verify(blob, { now: Date.now(), keys: PUBLIC_KEYS, subtle: subtle, backendHost: host((W.SLConfig && W.SLConfig.supabaseUrl) || ''), email: email || '', tenant: tenant || '', maxSeen: maxSeen });
    result = { valid: r.valid, reason: r.reason, tier: r.tier, seats: r.seats, features: r.features, customer: r.customer, id: r.id, expiresAt: r.expiresAt, bind: r.bind, trial: r.trial, daysLeft: r.daysLeft, authoritative: customerMode() || r.valid, present: true };
    return finish();
  };

  // ---- installing a license from the app (file picker / paste / desktop gate) ----
  // Verifies FIRST with the same verifier; stores ONLY a license that verified. Returns the
  // verdict either way so the caller can show the reason. Never touches the stored license on failure.
  W.SLLicenseInstall = async function (blob) {
    blob = String(blob || '').trim();
    var subtle = (W.crypto && W.crypto.subtle) || null;
    if (!subtle) return { valid: false, reason: 'WebCrypto unavailable' };
    var maxSeen = 0; try { maxSeen = Number(localStorage.getItem(LS_MAXSEEN) || 0) || 0; } catch (_) {}
    var email = ''; try { email = localStorage.getItem('safetyLab.signup.email') || ''; } catch (_) {}
    var r = await verify(blob, { now: Date.now(), keys: PUBLIC_KEYS, subtle: subtle, backendHost: host((W.SLConfig && W.SLConfig.supabaseUrl) || ''), email: email, tenant: '', maxSeen: maxSeen });
    if (!r.valid) return { valid: false, reason: r.reason };
    try { localStorage.setItem(LS_SIGNED, blob); localStorage.setItem(LS_MAXSEEN, String(r.maxSeenNext)); } catch (_) { return { valid: false, reason: 'could not store the license on this machine' }; }
    return { valid: true, reason: 'ok', tier: r.tier, customer: r.customer, expiresAt: r.expiresAt, trial: r.trial, daysLeft: r.daysLeft, id: r.id };
  };
  W.SLLicenseRemove = function () { try { localStorage.removeItem(LS_SIGNED); } catch (_) {} };

  // ---- plain-language reasons for the screen ----
  function plainReason(reason) {
    var r = String(reason || '');
    if (r === 'no license') return 'No license has been loaded on this computer yet.';
    if (r === 'no public key configured') return 'This build cannot check licenses (no public key). Contact Safety Lab.';
    if (r === 'signature invalid') return 'This license file was altered or was not issued by Safety Lab Aero.';
    if (r === 'malformed license' || r === 'malformed license payload' || r === 'unsupported license format') return 'This is not a Safety Lab Aero license file.';
    if (/^license expired/.test(r)) return 'This ' + r.replace(/^license /, 'license ') + '. Ask Safety Lab for a renewed license.';
    if (r === 'license not yet valid') return 'This license is not valid yet (its start date is in the future).';
    if (/system clock/.test(r)) return 'This computer\'s clock is set earlier than a license already seen here. Correct the clock and try again.';
    if (/bound to a different backend/.test(r)) return 'This license was issued for a different server than the one this install uses.';
    if (/bound to/.test(r)) return 'This license does not cover this account: ' + r + '.';
    if (r === 'unknown tier') return 'This license names a plan this build does not know. Ask Safety Lab for a re-issued license.';
    return 'The license could not be verified (' + r + ').';
  }
  W.SLLicensePlainReason = plainReason;

  // ---- THE LICENSE SCREEN (customer installs only; the demo cloud never shows it) ----
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function renderLicenseScreen(res) {
    try {
      if (document.getElementById('slab-license-gate')) return;
      var o = document.createElement('div');
      o.id = 'slab-license-gate';
      o.setAttribute('style', 'position:fixed;inset:0;z-index:2147483646;background:#f8fafc;color:#0f172a;font:15px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;overflow:auto;');
      o.innerHTML = '<div style="max-width:640px;margin:10vh auto;padding:0 24px;">'
        + '<h1 style="font-size:20px;margin:0 0 6px;">Load your Safety Lab Aero license</h1>'
        + '<p id="slab-license-why" style="margin:0 0 18px;color:#b91c1c;">' + esc(plainReason(res.reason)) + '</p>'
        + '<p style="margin:0 0 12px;color:#334155;">Your license is a small file from Safety Lab (it ends in <code>.lic</code>). It is checked on this computer and never sent anywhere.</p>'
        + '<label style="display:block;margin:0 0 14px;"><span style="display:block;font-weight:600;margin-bottom:6px;">Choose the license file</span>'
        + '<input id="slab-license-file" type="file" accept=".lic,.txt,text/plain" style="font:inherit;"></label>'
        + '<div style="color:#64748b;margin:0 0 6px;">or paste its contents</div>'
        + '<textarea id="slab-license-text" rows="4" spellcheck="false" style="width:100%;box-sizing:border-box;font:13px/1.4 ui-monospace,Menlo,Consolas,monospace;padding:8px;border:1px solid #cbd5e1;border-radius:6px;"></textarea>'
        + '<div style="margin-top:12px;display:flex;gap:10px;align-items:center;">'
        + '<button id="slab-license-load" type="button" style="font:inherit;font-weight:600;padding:9px 16px;border-radius:6px;border:0;background:#0A1F44;color:#fff;cursor:pointer;">Load license</button>'
        + '<span id="slab-license-msg" style="color:#475569;"></span></div>'
        + '<p style="color:#64748b;margin:18px 0 0;font-size:13px;">Need a license or a trial? Contact Safety Lab Aero.</p>'
        + '</div>';
      (document.body || document.documentElement).appendChild(o);
      var fileEl = document.getElementById('slab-license-file'), textEl = document.getElementById('slab-license-text'), msg = document.getElementById('slab-license-msg'), why = document.getElementById('slab-license-why');
      var pending = '';
      fileEl.addEventListener('change', function () {
        var f = fileEl.files && fileEl.files[0]; if (!f) return;
        var rd = new FileReader();
        rd.onload = function () { pending = String(rd.result || '').trim(); textEl.value = pending; msg.textContent = 'File read — click Load license.'; };
        rd.onerror = function () { msg.textContent = 'Could not read that file.'; };
        rd.readAsText(f);
      });
      document.getElementById('slab-license-load').addEventListener('click', async function () {
        var blob = String(textEl.value || pending || '').trim();
        if (!blob) { msg.textContent = 'Choose a file or paste the license first.'; return; }
        msg.textContent = 'Checking…';
        var v = await W.SLLicenseInstall(blob);
        if (v.valid) {
          msg.textContent = 'License accepted for ' + (v.customer || 'your organization') + (v.trial ? ' (trial, ' + v.daysLeft + ' days left)' : '') + '. Loading…';
          setTimeout(function () { try { location.reload(); } catch (_) {} }, 600);
        } else {
          why.textContent = plainReason(v.reason); msg.textContent = 'Not accepted.';
        }
      });
    } catch (_) {}
  }
  ready.then(function (res) {
    if (!res || res.valid || !res.authoritative) return;
    if (W.__SLAB_CONFIG_FATAL__) return;          // the config screen owns a refused install
    if (!customerMode()) return;                  // never on the demo cloud
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { renderLicenseScreen(res); });
    else renderLicenseScreen(res);
  }).catch(function () {});
})();
