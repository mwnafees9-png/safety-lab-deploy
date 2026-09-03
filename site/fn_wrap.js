/* ============================================================================
 * fn_wrap.js — v1.0 — keep monkey-patch markers from erasing each other.
 * ----------------------------------------------------------------------------
 * NINE modules in this app wrap global functions by name — auth_gate,
 * avail_closedform, cloud_sync, data_ops_modules, delete_guard, notify_agents,
 * ram_ai, ram_derive, and the edit-modal block in safety_lab — plus a few
 * one-off wraps (session_resume's ring, streaming_load's switchTab, ux_leading's
 * dashboard hook). Each does the same thing:
 *
 *     var orig = window[name];
 *     if (orig._thisModuleWrapped) return;          // idempotence guard
 *     var wrapped = function () { ...; return orig.apply(this, arguments); };
 *     wrapped._thisModuleWrapped = true;
 *     window[name] = wrapped;
 *
 * The wrapper is a BRAND NEW function carrying only its OWN marker. So whoever
 * wraps last silently erases every other module's flag, and each of those
 * modules' guards then reads false. Several of them deliberately re-install on
 * timers (the edit-modal block runs at 50ms, 500ms and 2000ms), so "it only runs
 * once" is not a property anyone is maintaining.
 *
 * Measured on production, 20 Aug 2026: submitACFHA, submitSysFHA, submitPRA,
 * submitZSA, submitCMA, submitFMEA and submitItem all read as NOT wrapped for
 * undo/autosave while demonstrably still saving — the edit-modal block had
 * wrapped over the undo wrapper and dropped its marker. Behaviour survived
 * because every wrapper calls through; the GUARD did not. A second wrap pass
 * would have pushed undo twice and autosaved twice for each of those actions.
 *
 * preserve() copies the wrapped function's own marker properties across, so the
 * flags ACCUMULATE instead of replacing one another. One line per wrap site.
 * tests/regression_project_durability asserts every window[x] = wrapped site
 * calls it, so a tenth module cannot quietly reintroduce the problem.
 * ==========================================================================*/
(function () {
    'use strict';
    if (typeof window === 'undefined') return;

    // Marker convention across the codebase: an own property whose name ends in
    // "Wrapped" (_acfWrapped, _wrappedForUndo, _slEditWrapped, __slIdleWrapped …).
    // Deliberately narrow — we are copying IDEMPOTENCE FLAGS, not arbitrary state,
    // and hoovering up every own property of a function would drag along things
    // like a bound `length` override that the new wrapper should define itself.
    function isMarker(k) {
        return /Wrapped$/.test(k) || /^_wrapped/.test(k);
    }

    // Copy every marker from `orig` onto `wrapped`, without clobbering a marker
    // `wrapped` has already set for itself.
    function preserve(orig, wrapped) {
        if (typeof orig !== 'function' || typeof wrapped !== 'function') return wrapped;
        try {
            Object.getOwnPropertyNames(orig).forEach(function (k) {
                if (!isMarker(k)) return;
                if (Object.prototype.hasOwnProperty.call(wrapped, k)) return;
                try { wrapped[k] = orig[k]; } catch (_) {}
            });
        } catch (_) {}
        return wrapped;
    }

    // Which idempotence markers a function currently carries. Useful in the console
    // when something has been wrapped four times and only one flag is visible.
    function markersOn(fn) {
        if (typeof fn !== 'function') return [];
        try { return Object.getOwnPropertyNames(fn).filter(isMarker); } catch (_) { return []; }
    }

    window.SLWrap = { preserve: preserve, markersOn: markersOn, isMarker: isMarker };
}());
