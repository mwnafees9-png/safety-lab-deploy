/*
 * slab_config.js — THE single backend-configuration surface. (6 Sep 2026)
 *
 * Loaded FIRST, before any module that resolves a backend address. Reads every
 * override once, publishes ONE frozen window.SLConfig, and — this is the point —
 * HARD-STOPS the app if a customer-hosted install still points anything at Safety
 * Lab. Enforces Waqas's rule "I don't want their data on our cloud, at any point"
 * at startup, so a half-configured install cannot silently leak.
 *
 * Overrides it reads (back-compat with the names that were scattered across five files):
 *   window.__SLAB_SUPABASE_URL__ / __SLAB_SUPABASE_KEY__   (or window.SafetyLab.SUPABASE_URL/KEY)
 *   window.__SLAB_AI_ENDPOINT__                            (AI inference proxy)
 *   window.__SLAB_CORPUS_ENDPOINT__                        (method-corpus retrieval; empty = off)
 *   window.__SLAB_DESKTOP__                                (Electron desktop build)
 *   window.__SLAB_LOCAL_ONLY__  (or window.SafetyLab.LOCAL_ONLY)  (browser-only, door 3: no cloud at all)
 *   window.__SLAB_AI_OFF__                                 (AI switched off: no AI endpoint at all)
 *   window.__SLAB_WEB_APP_URL__                            (the WEB address of this install — the
 *                                                           desktop's "Open in web" target; a customer
 *                                                           install names its own, never ours)
 *
 * 1.1 (6 Sep 2026, desktop parity): webAppUrl + the desktop flag. A desktop install with
 * no database override is a TRIAL desktop on our demo cloud (mode 'desktop'); a desktop
 * install pointed at the customer's database is 'self-hosted' like the web and gets the
 * same leak check — the desktop is a different window onto the same install, not a
 * different set of rules.
 * 1.2 (6 Sep 2026): AI OFF (`__SLAB_AI_OFF__`) → aiEndpoint '' and no AI egress; browser-only
 * may name the customer's OWN AI endpoint (files on the machine, AI on their server) — only a
 * Safety Lab AI address is a contradiction there. Found while wiring the desktop: a blank AI
 * address used to fall through to Safety Lab's proxy in the readers (fixed in bindings/notify).
 *
 * Modes: 'hosted-demo' (our multi-tenant cloud — trials/demos/internal ONLY),
 *        'self-hosted' (customer's own database), 'browser-only' (data on this
 *        machine, no backend), 'desktop'.
 */
(function () {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : {};

  // The hosted defaults. These are Safety Lab's OWN trial/demo/internal backend.
  var HOSTED_DB  = 'https://fhrqkhdrwbfnizkepkch.supabase.co';
  var HOSTED_KEY = 'sb_publishable_ExwM8wVKnQ3chHQKPyRFOw_WMtLGfiQ';
  var HOSTED_AI  = 'https://api.safetylabaero.com/v1/ai';
  var HOSTED_WEB = 'https://safetylabaero.com/app';
  var HOSTED_CORPUS = 'https://api.safetylabaero.com';   // the method corpus, hosted demo ONLY

  function str(v) { return (v == null) ? '' : String(v); }
  function trim(u) { return str(u).replace(/\/+$/, ''); }
  function host(u) { try { return new URL(u).host.toLowerCase(); } catch (_) { return ''; } }

  var OUR_DB_HOST = host(HOSTED_DB);   // fhrqkhdrwbfnizkepkch.supabase.co
  function pointsAtSafetyLab(u) {
    if (!u) return false;
    var h = host(u);
    return h === OUR_DB_HOST || /(^|\.)safetylabaero\.com$/.test(h);
  }

  // raw overrides
  var rawDbUrl  = trim(W.__SLAB_SUPABASE_URL__ || (W.SafetyLab && W.SafetyLab.SUPABASE_URL) || '');
  var rawDbKey  = str(W.__SLAB_SUPABASE_KEY__ || (W.SafetyLab && W.SafetyLab.SUPABASE_KEY) || '');
  var rawAi     = trim(W.__SLAB_AI_ENDPOINT__ || '');
  var rawCorpus = trim(W.__SLAB_CORPUS_ENDPOINT__ || '');
  var rawWeb    = trim(W.__SLAB_WEB_APP_URL__ || '');
  var aiOff     = !!W.__SLAB_AI_OFF__;
  var isDesktop = !!W.__SLAB_DESKTOP__;
  var browserOnly = !!(W.__SLAB_LOCAL_ONLY__ || (W.SafetyLab && W.SafetyLab.LOCAL_ONLY));

  var dbOverridden = !!rawDbUrl && rawDbUrl !== HOSTED_DB;
  var selfHosted = dbOverridden && !browserOnly;

  var mode = browserOnly ? 'browser-only'
           : selfHosted  ? 'self-hosted'
           : isDesktop   ? 'desktop'
           : 'hosted-demo';

  // Effective addresses (hosted defaults fill blanks in hosted/desktop mode).
  var eff = {
    supabaseUrl: browserOnly ? '' : (rawDbUrl || HOSTED_DB),
    supabaseKey: browserOnly ? '' : (rawDbKey || HOSTED_KEY),
    aiEndpoint:  aiOff ? '' : (browserOnly ? (pointsAtSafetyLab(rawAi) ? '' : rawAi) : (rawAi || HOSTED_AI)),
    // 16 Sep 2026 — a blank corpus address is FINAL on every customer install, exactly as a blank
    // AI address became final on 6 Sep (config 1.2). corpus_retrieve.js used to default to
    // api.safetylabaero.com when this was empty, so a self-hosted install sent the first 500
    // characters of every drafting prompt to Safety Lab in a query string: a leak the hard-stop
    // could not see (the configured value is empty) and SLConfigEgress did not list. Found by the
    // first live customer-path run (R7). Hosted demo keeps the default; everything else means OFF.
    corpusEndpoint: (mode === 'hosted-demo') ? (rawCorpus || HOSTED_CORPUS) : rawCorpus,
    // Where "Open in web" goes. Hosted/trial → our site. Self-hosted → ONLY what the
    // customer named (blank = the button stays hidden; never a silent fallback to us).
    webAppUrl: selfHosted ? rawWeb : (browserOnly ? '' : (rawWeb || HOSTED_WEB))
  };

  // Egress manifest: every host the app will contact, and whether it is ours.
  var purposes = { 'database': eff.supabaseUrl, 'AI inference': eff.aiEndpoint, 'method corpus': eff.corpusEndpoint };
  var egress = [];
  Object.keys(purposes).forEach(function (k) {
    if (purposes[k]) egress.push({ purpose: k, url: purposes[k], host: host(purposes[k]), safetyLab: pointsAtSafetyLab(purposes[k]) });
  });

  // THE GUARD. On a customer install nothing may reach Safety Lab.
  var fatal = null;
  if (mode === 'browser-only') {
    // A stray backend override alongside LOCAL_ONLY is a contradiction — refuse
    // rather than silently pick one. (rawDbUrl includes our own host too.)
    var strays = [];
    if (rawDbUrl)  strays.push('database');
    if (rawAi && pointsAtSafetyLab(rawAi)) strays.push('AI inference (a Safety Lab address)');
    if (rawCorpus) strays.push('method corpus');
    if (rawWeb)    strays.push('web address');
    if (strays.length) {
      fatal = 'This install is set to browser-only (your data stays on this machine), but a backend address is still configured for: '
            + strays.join(', ') + '. Remove those settings and reload.';
    }
  } else if (mode === 'self-hosted') {
    var leaks = egress.filter(function (e) { return e.safetyLab; });
    if (rawWeb && pointsAtSafetyLab(rawWeb)) leaks = leaks.concat([{ purpose: 'web address', host: host(rawWeb) }]);
    if (leaks.length) {
      fatal = 'This install points its database at your own server, but these still point at Safety Lab: '
            + leaks.map(function (e) { return e.purpose + ' (' + e.host + ')'; }).join(', ')
            + '. Fix these so no data leaves your environment, then reload.';
    } else if (!rawDbKey) {
      fatal = 'This install points its database at your own server but no database key is configured. Set the database key and reload.';
    }
  }

  var cfg = {
    version: '1.3',
    mode: mode,
    aiOff: aiOff,
    isDesktop: isDesktop,
    desktop: isDesktop,
    webAppUrl: eff.webAppUrl,
    browserOnly: browserOnly,
    supabaseUrl: eff.supabaseUrl,
    supabaseKey: eff.supabaseKey,
    aiEndpoint: eff.aiEndpoint,
    corpusEndpoint: eff.corpusEndpoint,
    egress: egress,
    fatal: fatal,
    pointsAtSafetyLab: pointsAtSafetyLab
  };
  try { Object.freeze(cfg.egress); Object.freeze(cfg); } catch (_) {}
  W.SLConfig = cfg;

  // One-click self-test: what will this install talk to?
  W.SLConfigEgress = function () {
    try { console.table(egress.map(function (e) { return { purpose: e.purpose, host: e.host, 'points at Safety Lab': e.safetyLab }; })); }
    catch (_) { try { console.log(JSON.stringify(egress, null, 2)); } catch (__){} }
    return egress;
  };

  if (fatal) {
    W.__SLAB_CONFIG_FATAL__ = fatal;
    try { console.error('[Safety Lab Aero] CONFIG REFUSED — ' + fatal); } catch (_) {}
    var show = function () {
      try {
        var o = document.createElement('div');
        o.id = 'slab-config-fatal';
        o.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;background:#f8fafc;color:#0f172a;font:15px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;overflow:auto;');
        o.innerHTML = '<div style="max-width:640px;margin:12vh auto;padding:0 24px;">'
          + '<h1 style="font-size:20px;color:#b91c1c;margin:0 0 12px;">Safety Lab Aero did not start</h1>'
          + '<p style="margin:0 0 12px;">' + String(fatal).replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</p>'
          + '<p style="color:#475569;margin:0;">This is a safety check: an install configured for your own environment must not reach Safety Lab. Correct the configuration and reload.</p>'
          + '</div>';
        (document.body || document.documentElement).appendChild(o);
      } catch (_) {}
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else show();
  } else if (mode !== 'hosted-demo') {
    try { console.info('[Safety Lab Aero] backend mode → ' + mode + (browserOnly ? ' (data stays on this machine)' : (' · db ' + host(eff.supabaseUrl) + ' · ai ' + host(eff.aiEndpoint)))); } catch (_) {}
  }
})();
