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
 */
(function () {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : {};

  // Safety Lab's PUBLIC signing keys (JWK). Public keys are not secret. Add the next key
  // here BEFORE rotating so already-issued licenses keep verifying; remove old ones when
  // no license signed with them remains valid. EMPTY until the first keygen — with no
  // key, no license can verify, which fails CLOSED on customer installs.
  var PUBLIC_KEYS = [
    // { "kid": "slab-YYYY-MM-DD", "alg": "ES256", "kty": "EC", "crv": "P-256", "x": "...", "y": "..." }
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
    var out = { valid: false, reason: '', tier: null, seats: null, features: [], customer: null, id: null, expiresAt: null, bind: null, payload: null, maxSeenNext: ctx.maxSeen || 0 };
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
      customer: r.customer, id: r.id, expiresAt: r.expiresAt, bind: r.bind,
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
        console.info('[Safety Lab Aero] signed license OK — ' + result.customer + ' · ' + result.tier + ' · expires ' + String(result.expiresAt).slice(0, 10));
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
    result = { valid: r.valid, reason: r.reason, tier: r.tier, seats: r.seats, features: r.features, customer: r.customer, id: r.id, expiresAt: r.expiresAt, bind: r.bind, authoritative: customerMode() || r.valid, present: true };
    return finish();
  };
})();
