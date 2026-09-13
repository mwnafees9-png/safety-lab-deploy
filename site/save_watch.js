/* save_watch.js — the safety net for "the project changed and nobody said so" (13 Sep 2026, R18 rebuild).
 *
 * Saving in this app hangs off ONE call, scheduleAutosave(): local save, cloud autosave,
 * the live-sync push and the dirty flag. Until 13 Sep 2026 that call depended on every
 * writer remembering to make it. Forty-odd did not (auto-requirements Accept, fault-tree
 * node editing, imports, assumption edits, ten modules calling a save function that did
 * not exist). Their rows lived only on screen until an unrelated edit saved them, and
 * the next live-sync pull deleted them. Adding the missing calls is hygiene, not safety:
 * the next writer forgets again.
 *
 * This module removes the dependency. About once a second, on an idle slice, it takes a
 * fingerprint of the synced stores (__crdtFingerprint: one stringify, no clone, no parse)
 * and compares it with the last one. Different, and no explicit save has settled it in
 * between → scheduleAutosave() — the same call the writer should have made, so the same
 * rails run. Explicit saves settle the fingerprint at the end of their burst (a microtask),
 * so an edit that DID announce itself is never saved twice, and an edit made after the
 * announcement is still caught. While a load or a sync merge has autosave suspended the
 * call is refused and the watcher simply tries again next tick.
 *
 * Out of scope, on purpose: stores the live sync does not carry (the AI assumptions
 * ledger, review comments, source documents) — their writers announce themselves and the
 * regression suite holds them to it.
 */
(function () {
  'use strict';
  var PERIOD_MS = 1000;
  var _last = null, _armed = false, _ticks = 0, _caught = 0, _refused = 0, _settleQueued = false, _lastCostMs = 0;

  function _fp() {
    try { return (typeof window.__crdtFingerprint === 'function') ? window.__crdtFingerprint() : null; } catch (_) { return null; }
  }
  function _hidden() { try { return typeof document !== 'undefined' && document.visibilityState === 'hidden'; } catch (_) { return false; } }

  // One comparison. Returns what it did: 'first' | 'same' | 'saved' | 'refused' | 'hidden' | 'nofp'.
  function tick() {
    _ticks++;
    if (_hidden()) return 'hidden';
    var t0 = Date.now();
    var fp = _fp();
    _lastCostMs = Date.now() - t0;
    if (fp == null) return 'nofp';
    if (_last === null) { _last = fp; return 'first'; }
    if (fp === _last) return 'same';
    var accepted = false;
    try { accepted = (typeof window.scheduleAutosave === 'function') && (window.scheduleAutosave() === true); } catch (_) { accepted = false; }
    if (accepted) { _last = fp; _caught++; return 'saved'; }
    _refused++; return 'refused';          // a load/merge is suspending autosave: retry next tick
  }

  // Called by scheduleAutosave: the change was announced, so take the fingerprint at the
  // END of this synchronous burst (a microtask, the same moment the local write runs) and
  // do not save it again. Edits made after that moment change the fingerprint again.
  function settle() {
    if (_settleQueued) return;
    _settleQueued = true;
    var run = function () { _settleQueued = false; var fp = _fp(); if (fp != null) _last = fp; };
    if (typeof queueMicrotask === 'function') queueMicrotask(run);
    else if (typeof Promise !== 'undefined') Promise.resolve().then(run);
    else setTimeout(run, 0);
  }

  function _loop() {
    try { tick(); } catch (_) {}
    _schedule();
  }
  function _schedule() {
    if (!_armed) return;
    if (typeof requestIdleCallback === 'function') setTimeout(function () { requestIdleCallback(_loop, { timeout: 1500 }); }, PERIOD_MS);
    else setTimeout(_loop, PERIOD_MS);
  }
  function start() { if (_armed) return; _armed = true; _schedule(); }
  function stop() { _armed = false; }
  function status() { return { armed: _armed, ticks: _ticks, caught: _caught, refused: _refused, lastCostMs: _lastCostMs, hasBaseline: _last !== null }; }

  window.SLSaveWatch = { PERIOD_MS: PERIOD_MS, tick: tick, settle: settle, start: start, stop: stop, status: status, _reset: function () { _last = null; } };
  try { window.addEventListener('load', function () { setTimeout(start, 2500); }); } catch (_) {}
})();
