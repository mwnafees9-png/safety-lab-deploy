/* ============================================================================
 * sl_env.js — v1.0 — read access to the app's top-level lexical globals.
 * ----------------------------------------------------------------------------
 * WHY THIS EXISTS, and it is the same lesson twice in one night.
 *
 * The app's state lives in TOP-LEVEL `let` declarations in classic scripts —
 * `let systemsData`, `let ftaPages`, `let selectedNodeData`, … Those live in the
 * GLOBAL LEXICAL ENVIRONMENT, which is NOT the same thing as `window`. A classic
 * script can read them as bare identifiers; anything reaching for
 * `window.selectedNodeData` gets `undefined` and fails SILENTLY.
 *
 * That is exactly what happened to node_identity_ui.js on 19 Aug: its lookup helper
 * used `window[name]`, so every read returned undefined, `render()` wrote an empty
 * string, and the identity block was invisible with no error anywhere. Waqas: "C1
 * didnt get shipped i didnt see a modal upon add gate/event." It HAD shipped — it
 * just could not see a single thing it needed.
 *
 * The same property is what made the earlier outage so hard to read: when
 * safety_lab.js was swallowed by a comment, `SUPABASE_PROJECT_URL` was "not defined"
 * rather than "undefined", because it too is a global lexical binding.
 *
 * `eval` would solve it and is not available — the CSP forbids `unsafe-eval`.
 * So instead: this file is a CLASSIC script loaded AFTER the declarations exist, and
 * it closes over them as bare identifiers. Read-only, no side effects, no writes back.
 * Anything needing app state calls SLEnv.get('name') and gets the live value.
 *
 * Add a name here when a module needs it. Each is individually guarded, so a binding
 * that does not exist in some build returns undefined instead of throwing.
 * ==========================================================================*/
(function () {
  'use strict';

  // One accessor per binding. try/catch per name: a missing global must degrade to
  // undefined, never take the whole bridge down.
  var READERS = {
    ftaPages:          function () { return ftaPages; },
    activeFTAPageId:   function () { return activeFTAPageId; },
    selectedNodeData:  function () { return selectedNodeData; },
    systemsData:       function () { return systemsData; },
    acFhaData:         function () { return acFhaData; },
    acFcimData:        function () { return acFcimData; },
    acFunctionsData:   function () { return acFunctionsData; },
    itemsData:         function () { return itemsData; },
    resourcesData:     function () { return resourcesData; },
    projectConfig:     function () { return projectConfig; },
    ftaConfig:         function () { return ftaConfig; },
    internalIdCounter: function () { return internalIdCounter; },
    idpContributors:   function () { return idpContributors; },
    idpCell:           function () { return idpCell; },
    esc:               function () { return esc; }
  };

  // 20 Aug 2026 — this list was hand-maintained and therefore short: acReqData and
  // fmeaData were never on it, so anything reading project state through the bridge
  // simply could not see them. project_stores.js already declares an accessor for every
  // project store, so consult it before giving up. Resolved LAZILY, at call time, because
  // sl_env.js loads first — window.SLStores does not exist while this IIFE runs.
  function fromStores(name) {
    try {
      var s = window.SLStores && window.SLStores.byKey(name);
      return s ? { ok: true, value: s.get() } : null;
    } catch (_) { return null; }
  }

  function get(name) {
    var r = READERS[name];
    if (!r) {
      var hit = fromStores(name);
      if (hit) return hit.value;
      try { return window[name]; } catch (_) { return undefined; }
    }
    try { return r(); } catch (_) {
      // Not declared in this build, or still in TDZ because this script somehow ran
      // early. Fall back to window in case it IS a window property.
      try { return window[name]; } catch (__) { return undefined; }
    }
  }

  // Which of the tracked bindings are actually reachable right now. Used by the wall
  // and worth having in the console when something renders blank for no reason.
  function report() {
    var out = {};
    Object.keys(READERS).forEach(function (k) {
      var v = get(k);
      out[k] = (v === undefined) ? 'MISSING' : (Array.isArray(v) ? 'array[' + v.length + ']' : typeof v);
    });
    return out;
  }

  var env = { get: get, report: report };
  // NAMES stays an ARRAY on read, but is computed lazily so it includes every store
  // project_stores.js declares. A static Object.keys(READERS) at load time would list
  // only the hand-maintained subset and under-report what the bridge can actually reach.
  try {
    Object.defineProperty(env, 'NAMES', {
      enumerable: true,
      get: function () {
        var names = Object.keys(READERS);
        try {
          (window.SLStores ? window.SLStores.keys() : []).forEach(function (k) {
            if (names.indexOf(k) === -1) names.push(k);
          });
        } catch (_) {}
        return names;
      }
    });
  } catch (_) { env.NAMES = Object.keys(READERS); }
  window.SLEnv = env;
}());
