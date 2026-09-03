/* crdt_gc.js — v1.0 — H-1: the CRDT IndexedDB leak.
 * ===========================================================================
 * THE LEAK. crdt_sync creates one IndexedDB database per project ever opened
 * ('slab-crdt-<projectId>') and never removes any of them. Measured on Waqas's
 * machine 31 Aug 2026: ~360 databases. Two costs — unbounded local growth, and
 * a reservoir of stale per-project state (that second one is mitigated by the
 * 66.45 adopt-model posture, not removed).
 *
 * WHY THIS IS REPORT-ONLY UNTIL DELIBERATELY ARMED. Each of those databases is
 * an OFFLINE COPY OF SOMEONE'S WORK. crdt_sync exists precisely so that edits
 * made with no network survive a reload — so a garbage collector that guesses
 * wrong does not free disk, it destroys the only copy of a day's analysis. The
 * E1 autosave defect (26 Aug) was exactly this shape: a mechanism built to
 * protect data deleting it instead. So the default is SURVEY: it enumerates,
 * classifies, and prints what it WOULD remove, and removes nothing. Arm it with
 * localStorage SLA_CRDT_GC='1' (or ?crdtgc=1) once a real survey has been read.
 *
 * WHAT MAKES A DOC SAFE TO DROP. All four must hold:
 *   1. it is not the project currently open;
 *   2. the project is not in the user's accessible project list — RLS decides
 *      that, so this means deleted or access revoked, and the local doc can
 *      never be pushed anywhere again;      ... OR ...
 *      the ledger says the server has everything this doc has (saved >= touched);
 *   3. it has not been touched for RETAIN_DAYS;
 *   4. the accessible-project query actually SUCCEEDED and came back non-empty.
 * (4) is not paranoia: a failed or empty list would otherwise classify every
 * project on the machine as inaccessible and delete the lot. A survey that
 * cannot see the project list reports "unknown" and drops nothing.
 *
 * THE LEDGER (safetyLab.crdt.docs.v1) is written by crdt_sync from today
 * onward: `t` = last local update, `s` = last successful project_crdt upsert.
 * Docs that predate the ledger have no entry and are never classified safe on
 * ledger grounds alone — only rule 2's inaccessible-project branch can retire
 * them. Absence of evidence is not evidence of a synced doc.
 * ===========================================================================
 */
(function () {
  'use strict';

  var LEDGER_KEY  = 'safetyLab.crdt.docs.v1';
  var PREFIX      = 'slab-crdt-';
  var RETAIN_DAYS = 30;
  var DAY_MS      = 86400000;

  function _armed() {
    try {
      if (/[?&]crdtgc=1/.test(location.search)) return true;
      return localStorage.getItem('SLA_CRDT_GC') === '1';
    } catch (_) { return false; }
  }
  function _ledger() {
    try { return JSON.parse(localStorage.getItem(LEDGER_KEY) || '{}') || {}; } catch (_) { return {}; }
  }
  function _writeLedger(l) {
    try { localStorage.setItem(LEDGER_KEY, JSON.stringify(l)); } catch (_) {}
  }
  // Called by crdt_sync. `field` is 't' (local update) or 's' (server save).
  function note(projectId, field) {
    if (!projectId || (field !== 't' && field !== 's')) return;
    var l = _ledger();
    if (!l[projectId]) l[projectId] = {};
    l[projectId][field] = Date.now();
    _writeLedger(l);
  }

  function _activeProject() {
    try { return (typeof window.getActiveCloudProjectId === 'function' && window.getActiveCloudProjectId()) || null; }
    catch (_) { return null; }
  }

  // Every slab-crdt-* database on this machine. indexedDB.databases() is the
  // only way to enumerate; where it is unavailable the survey reports that
  // honestly rather than assuming there is nothing to find.
  function _listDocs() {
    try {
      if (!window.indexedDB || typeof indexedDB.databases !== 'function') return Promise.resolve(null);
      return indexedDB.databases().then(function (dbs) {
        return (dbs || []).map(function (d) { return d && d.name; })
          .filter(function (n) { return typeof n === 'string' && n.indexOf(PREFIX) === 0; })
          .map(function (n) { return { db: n, project: n.slice(PREFIX.length) }; });
      }).catch(function () { return null; });
    } catch (_) { return Promise.resolve(null); }
  }

  function _accessibleProjects() {
    try {
      var c = window.getSupabaseClient && window.getSupabaseClient();
      if (!c) return Promise.resolve(null);
      return c.from('projects').select('id').then(function (res) {
        if (!res || res.error || !Array.isArray(res.data) || res.data.length === 0) return null;   // rule 4
        var s = Object.create(null);
        res.data.forEach(function (r) { if (r && r.id) s[r.id] = 1; });
        return s;
      }).catch(function () { return null; });
    } catch (_) { return Promise.resolve(null); }
  }

  // Pure, and exported for the suite: given the inputs, what happens to each doc?
  function classify(docs, accessible, ledger, activeId, now) {
    var cutoff = now - RETAIN_DAYS * DAY_MS;
    return (docs || []).map(function (d) {
      var e = (ledger && ledger[d.project]) || null;
      var touched = e && typeof e.t === 'number' ? e.t : null;
      var saved   = e && typeof e.s === 'number' ? e.s : null;

      if (d.project === activeId)  return { db: d.db, project: d.project, verdict: 'keep', why: 'the project currently open' };
      if (!accessible)             return { db: d.db, project: d.project, verdict: 'unknown', why: 'project list unavailable — nothing is classified without it' };

      var stale = touched != null && touched < cutoff;
      var covered = touched != null && saved != null && saved >= touched;

      // H-7 INTERACTION (31 Aug 2026): archiving a project makes it vanish from
      // this account's project list, because projects_member_read filters
      // deleted_at. So "inaccessible" now includes "archived, and restorable by
      // an admin at any time" — and dropping the local doc the moment someone
      // archives would quietly discard offline work that a restore is supposed
      // to bring back. Inaccessible therefore has to clear the retention window
      // too. Losing access genuinely and permanently still frees the doc; it
      // just takes RETAIN_DAYS to do it.
      if (!accessible[d.project]) {
        if (touched != null && !stale) return { db: d.db, project: d.project, verdict: 'keep', why: 'not accessible, but touched within ' + RETAIN_DAYS + ' days — may be an archived project awaiting restore' };
        return { db: d.db, project: d.project, verdict: 'drop', why: 'project is not accessible to this account — this doc can never be pushed anywhere' };
      }
      if (touched == null)        return { db: d.db, project: d.project, verdict: 'keep', why: 'predates the ledger — no evidence the server has this doc' };
      if (!covered)               return { db: d.db, project: d.project, verdict: 'keep', why: 'has local edits the server has not confirmed' };
      if (!stale)                 return { db: d.db, project: d.project, verdict: 'keep', why: 'touched within ' + RETAIN_DAYS + ' days' };
      return { db: d.db, project: d.project, verdict: 'drop', why: 'server-confirmed and untouched for over ' + RETAIN_DAYS + ' days' };
    });
  }

  function _delete(name) {
    return new Promise(function (res) {
      try {
        var r = indexedDB.deleteDatabase(name);
        r.onsuccess = function () { res(true); };
        r.onerror   = function () { res(false); };
        r.onblocked = function () { res(false); };   // another tab holds it open — try again another day
      } catch (_) { res(false); }
    });
  }

  function survey() {
    return Promise.all([_listDocs(), _accessibleProjects()]).then(function (r) {
      var docs = r[0], accessible = r[1];
      if (docs == null) return { supported: false, rows: [], armed: _armed() };
      var rows = classify(docs, accessible, _ledger(), _activeProject(), Date.now());
      return { supported: true, rows: rows, armed: _armed(),
               counts: rows.reduce(function (a, x) { a[x.verdict] = (a[x.verdict] || 0) + 1; return a; }, {}) };
    });
  }

  function run() {
    return survey().then(function (s) {
      if (!s.supported) { try { console.info('[CRDT-GC] indexedDB.databases() unavailable here — cannot survey.'); } catch (_) {} return s; }
      var drop = s.rows.filter(function (x) { return x.verdict === 'drop'; });
      try {
        console.info('[CRDT-GC] ' + s.rows.length + ' local doc(s): ' +
          JSON.stringify(s.counts) + (s.armed ? ' — ARMED' : ' — survey only (set SLA_CRDT_GC=1 to arm)'));
        drop.slice(0, 20).forEach(function (x) { console.info('[CRDT-GC]   ' + (s.armed ? 'dropping ' : 'would drop ') + x.db + ' — ' + x.why); });
        if (drop.length > 20) console.info('[CRDT-GC]   …and ' + (drop.length - 20) + ' more');
      } catch (_) {}
      if (!s.armed || !drop.length) return s;
      return Promise.all(drop.map(function (x) { return _delete(x.db); })).then(function (oks) {
        var n = oks.filter(Boolean).length;
        try { console.info('[CRDT-GC] removed ' + n + ' of ' + drop.length + ' (a doc open in another tab is skipped, not forced).'); } catch (_) {}
        s.removed = n; return s;
      });
    });
  }

  window.SafetyLabCRDTGC = { survey: survey, run: run, note: note, classify: classify,
                             _retainDays: RETAIN_DAYS, armed: _armed };

  // Boot late and once: this is housekeeping, never on the critical path.
  try {
    window.addEventListener('load', function () { setTimeout(function () { try { run(); } catch (_) {} }, 20000); });
  } catch (_) {}
})();
