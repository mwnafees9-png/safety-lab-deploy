/* error_watch.js — the app's one global error catcher (13 Sep 2026, R19 step 1).
 *
 * Until now nothing in the app listened for errors. An uncaught exception in a click
 * handler, a rejected promise nobody awaited, a background fetch that died: all of them
 * went to the browser console and nowhere else. On the desktop app there is no console
 * open, so to the person using it the button simply did nothing. The R19 static sweep
 * counted 92 promise chains with no error handler and 2,700 catch blocks that swallow;
 * the runtime sweep found a button that throws on every click and nobody had noticed.
 *
 * This module does three things and nothing more:
 *   1. Listens for `error` and `unhandledrejection` on the window and keeps the last 60
 *      in a ring (`SLErrorWatch.recent()`), so a support conversation can start with
 *      "what did the app see" instead of "what did you click".
 *   2. Tells the person, once, in plain language, through the app's own toast (never a
 *      native dialog): what failed, which part of the app, and that their work is saved
 *      by the save watcher. The same error repeating within a minute is counted, not
 *      re-announced; toasts are rate-limited to one every 8 seconds.
 *   3. Offers `SLErrorWatch.report(err, where)` for catch blocks that today swallow: one
 *      line that keeps the swallow (the app keeps running) but records it.
 *
 * It never throws, never blocks, never re-dispatches, and ignores what is not ours:
 * cross-origin "Script error." stubs, third-party CDN files, and the harmless
 * "ResizeObserver loop" notice browsers emit under layout pressure.
 */
(function () {
  'use strict';
  var RING_MAX = 60, DEDUPE_MS = 60000, TOAST_GAP_MS = 8000;
  var _ring = [], _seen = {}, _lastToastAt = 0, _count = 0, _muted = false;

  function _now() { return Date.now(); }

  function _moduleOf(source) {
    try {
      if (!source) return '';
      var m = String(source).match(/([A-Za-z0-9_.-]+\.js)(?:\?[^:]*)?(?::\d+)?/);
      return m ? m[1] : '';
    } catch (_) { return ''; }
  }

  function _ours(source, message) {
    var s = String(source || ''), msg = String(message || '');
    if (/^Script error\.?$/.test(msg.trim())) return false;                 // cross-origin stub, no information in it
    if (/ResizeObserver loop/.test(msg)) return false;                      // browser layout notice, not a fault
    if (/^https?:\/\//.test(s) && !/^https?:\/\/(127\.0\.0\.1|localhost|[^/]*safetylabaero\.com|[^/]*safetylab\.aero)/i.test(s)) {
      // a script served from somewhere else (CDN); ours load from our own origin
      try { if (typeof location !== 'undefined' && location.origin && s.indexOf(location.origin) === 0) return true; } catch (_) {}
      return false;
    }
    return true;
  }

  function _describe(err, fallback) {
    try {
      if (err && typeof err === 'object') {
        var name = err.name && err.name !== 'Error' ? err.name + ': ' : '';
        return (name + (err.message || String(err))).slice(0, 300);
      }
      if (typeof err === 'string') return err.slice(0, 300);
    } catch (_) {}
    return String(fallback || 'unknown error').slice(0, 300);
  }

  function _plain(entry) {
    // Plain language for the toast. No stack, no jargon; the console has the rest.
    var where = entry.module ? entry.module.replace(/\.js$/, '').replace(/_/g, ' ') : 'the app';
    return 'Something went wrong in ' + where + ': ' + entry.message.split('\n')[0].slice(0, 140) + '. Your work is saved; the details are in the browser console.';
  }

  function _record(kind, message, source, line, col, err) {
    try {
      var module = _moduleOf(source) || _moduleOf(err && err.stack);
      var key = kind + '|' + module + '|' + String(message).slice(0, 120);
      var t = _now();
      _count++;
      var entry = { at: t, kind: kind, message: String(message), module: module, source: String(source || ''), line: line || 0, col: col || 0, stack: (err && err.stack) ? String(err.stack).slice(0, 2000) : '', repeats: 0 };
      var prev = _seen[key];
      if (prev && (t - prev.at) < DEDUPE_MS) { prev.repeats++; prev.at = t; return prev; }
      _seen[key] = entry;
      _ring.push(entry); if (_ring.length > RING_MAX) _ring.shift();
      try { console.error('[error_watch] ' + kind + ' in ' + (module || '?') + ': ' + entry.message + (entry.stack ? '\n' + entry.stack : '')); } catch (_) {}
      if (!_muted && (t - _lastToastAt) >= TOAST_GAP_MS) {
        _lastToastAt = t;
        try { if (typeof showToast === 'function') showToast(_plain(entry), 'error', 7000); } catch (_) {}
      }
      return entry;
    } catch (_) { return null; }
  }

  function onError(ev) {
    try {
      if (!ev) return;
      var msg = ev.message || (ev.error && ev.error.message) || 'error';
      var src = ev.filename || (ev.error && ev.error.stack) || '';
      if (!_ours(src, msg)) return;
      _record('error', msg, ev.filename, ev.lineno, ev.colno, ev.error);
    } catch (_) {}
  }

  function onRejection(ev) {
    try {
      if (!ev) return;
      var r = ev.reason;
      var msg = _describe(r, 'unhandled promise rejection');
      var src = (r && r.stack) || '';
      if (!_ours(src, msg)) return;
      _record('unhandledrejection', msg, '', 0, 0, (r && typeof r === 'object') ? r : null);
    } catch (_) {}
  }

  var API = {
    recent: function () { return _ring.slice(); },
    count: function () { return _count; },
    report: function (err, where) { return _record('reported', _describe(err, 'error') + (where ? ' (' + where + ')' : ''), where ? String(where) + '.js' : '', 0, 0, (err && typeof err === 'object') ? err : null); },
    mute: function (on) { _muted = !!on; },
    _reset: function () { _ring = []; _seen = {}; _lastToastAt = 0; _count = 0; _muted = false; },
    _ours: _ours, _plain: _plain
  };

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    window.SLErrorWatch = API;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
