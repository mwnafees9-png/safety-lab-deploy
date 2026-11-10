// ============================================================================
// load_repair.js, v1.0, 11 Nov 2026: the clean-ups run after EVERY way a whole project arrives.
//
// Live team data, 10 Nov 2026: the duplicate tree clean-up (fta_dedupe.js) and the false obsolete flag repair
// (stale_revive.js) never took effect on a shared cloud project, although the team opened and saved it dozens of
// times. Two causes, each reproduced in the real app (tests/regression_cloud_open_cleanup_20261111.test.js):
//   1. both clean-ups hooked _applyProjectData only. Opening a project from the cloud goes through
//      _restoreProjectSnapshot (misc_fn_modules.js _loadCloudProject), so neither ran;
//   2. the live shared copy is then pulled over the model (crdt_sync.js pullToModel) and replaces every tree page.
//      Nothing ran the clean-ups after that pull, so even where they had run the copies and flags came back.
// Now there is ONE place a clean-up registers, and it is run after:
//   'applied'      _applyProjectData      (a file, recovery, undo, a demo)
//   'cloud-open'   _restoreProjectSnapshot (open from the cloud, restore a saved version)
//   'live-copy'    the live shared copy pulled over a project that was just loaded (crdt_sync.js)
//   'live-update'  a teammate's change pulled in (crdt_sync.js; a short wait after the last one). This is what
//                  cleans up after a teammate whose browser still runs an older build.
// A clean-up that changed something returns true: the project is then marked changed (scheduleAutosave), so the
// change goes into the live shared copy and the saved copy. A clean-up must be safe to run twice.
//
// API (window.SLLoadRepair): on(name, fn(via), opts), run(via), last(). opts.live === false keeps a clean-up out
// of 'live-update'. Kill switch: window.SL_LOAD_REPAIR_OFF = true.
// Load: after helpers_modules.js and data_ops_modules.js, before fta_dedupe.js and stale_revive.js.
// ============================================================================
(function (root) {
    'use strict';
    var VERSION = '1.0';
    var _fns = [], _last = null, _timer = null;
    var LIVE_WAIT_MS = 1500;

    function on(name, fn, opts) {
        if (typeof fn !== 'function') return;
        _fns = _fns.filter(function (x) { return x.name !== name; });
        _fns.push({ name: String(name), fn: fn, live: !(opts && opts.live === false) });
    }
    function _markChanged() {
        var f = root.scheduleAutosave;
        try { if (typeof f !== 'function' && root.SLEnv && typeof root.SLEnv.get === 'function') f = root.SLEnv.get('scheduleAutosave'); } catch (_) {}
        try { if (typeof f === 'function') f(); } catch (_) {}
    }
    function run(via) {
        var out = { via: via, ran: [], changed: [], at: Date.now() };
        if (root.SL_LOAD_REPAIR_OFF) { out.off = true; _last = out; return out; }
        _fns.forEach(function (x) {
            if (via === 'live-update' && !x.live) return;
            out.ran.push(x.name);
            try { if (x.fn(via) === true) out.changed.push(x.name); }
            catch (e) { try { console.warn('[load_repair] ' + x.name, e); } catch (_) {} }
        });
        // the loader that called us may clear "changed" right after it returns: say it again once it has
        if (out.changed.length) { _markChanged(); setTimeout(_markChanged, 0); }
        _last = out;
        return out;
    }
    // a teammate's changes arrive in bursts: one run after the last of them
    function soon(via) {
        if (_timer) clearTimeout(_timer);
        _timer = setTimeout(function () { _timer = null; run(via || 'live-update'); }, LIVE_WAIT_MS);
    }
    function _wrap(name, via) {
        var f = root[name];
        if (typeof f !== 'function') return false;
        if (f._lrWrapped) return true;
        var wrapped = function () { var r = f.apply(this, arguments); run(via); return r; };
        wrapped._lrWrapped = true;
        Object.keys(f).forEach(function (k) { try { if (!(k in wrapped)) wrapped[k] = f[k]; } catch (_) {} });
        root[name] = wrapped;
        return true;
    }
    function _wrapAll() { var a = _wrap('_applyProjectData', 'applied'), b = _wrap('_restoreProjectSnapshot', 'cloud-open'); return a && b; }
    if (!_wrapAll() && typeof root.addEventListener === 'function') root.addEventListener('DOMContentLoaded', _wrapAll);

    var api = { VERSION: VERSION, on: on, run: run, soon: soon, last: function () { return _last; }, names: function () { return _fns.map(function (x) { return x.name; }); }, _wrapAll: _wrapAll, LIVE_WAIT_MS: LIVE_WAIT_MS };
    try { root.SLLoadRepair = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
