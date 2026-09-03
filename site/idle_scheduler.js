// ============================================================================
// idle_scheduler.js — v1.0 — ENG-4: time-sliced background work (SLIdle).
//
// The game-loop discipline applied to maintenance work: jobs that don't need
// to run THIS frame (autosave serialization, integrity sweeps) run in idle
// callbacks instead of stalling an interaction. Every job carries a timeout
// backstop, so "idle" never means "maybe never" — on a busy main thread the
// job still fires within its deadline.
//
// Semantics:
//   SLIdle.schedule(name, fn, { timeout = 2000 })
//     — coalesced by name: re-scheduling an already-pending job replaces its
//       fn and re-arms (last writer wins). One name, at most one pending run.
//   SLIdle.cancel(name)      — drop a pending job.
//   SLIdle.pending(name)     — is a run pending?
//   SLIdle.flush(name)       — run a pending job NOW, synchronously (used by
//       code that must not lose the job on tab hide, e.g. autosave flush).
//
// Fallback: environments without requestIdleCallback (Safari, jsdom, Node
// harnesses, the desktop shell) use setTimeout(…, 1) — same coalescing, same
// contract, just no idle preference.
//
// BORN MODULAR: new file, no wraps, no DOM. Exports window.SLIdle.
// ============================================================================
(function () {
    'use strict';

    const _jobs = new Map();   // name → { fn, handle, isIdle }

    const _hasRIC = typeof requestIdleCallback === 'function';
    const _hasCIC = typeof cancelIdleCallback === 'function';

    function _run(name) {
        const j = _jobs.get(name);
        if (!j) return;
        _jobs.delete(name);
        try { j.fn(); } catch (_) {}
    }
    function _clear(j) {
        if (!j) return;
        if (j.isIdle && _hasCIC) { try { cancelIdleCallback(j.handle); } catch (_) {} }
        else clearTimeout(j.handle);
    }

    function schedule(name, fn, opts) {
        if (typeof fn !== 'function') return;
        const timeout = (opts && opts.timeout) || 2000;
        const existing = _jobs.get(name);
        if (existing) {
            // Coalesce: keep the pending slot, replace the work (last writer wins).
            existing.fn = fn;
            return;
        }
        const j = { fn, handle: null, isIdle: _hasRIC };
        if (_hasRIC) j.handle = requestIdleCallback(() => _run(name), { timeout });
        else j.handle = setTimeout(() => _run(name), 1);
        _jobs.set(name, j);
    }
    function cancel(name) {
        const j = _jobs.get(name);
        if (!j) return;
        _clear(j);
        _jobs.delete(name);
    }
    function pending(name) { return _jobs.has(name); }
    function flush(name) {
        const j = _jobs.get(name);
        if (!j) return false;
        _clear(j);
        _run(name);
        return true;
    }

    const api = { schedule, cancel, pending, flush };
    if (typeof window !== 'undefined') window.SLIdle = api;
    if (typeof globalThis !== 'undefined') globalThis.SLIdle = api;
})();
