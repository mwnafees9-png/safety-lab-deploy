// ============================================================================
// ux_leading.js — v1.0 — UX-4: leading-indicators strip on the dashboard.
//
// The posture tiles say where the program IS; this strip says where it's
// HEADED. Four early warnings, every one computed by an existing
// deterministic sweep (nothing here originates a number, verdict, or
// classification — the strip only COUNTS and ROUTES):
//
//   · Golden-thread breaks — invariant sweep hard fails + advisories
//     (invRun(), invariants.js). The single best predictor that the
//     evidence package won't assemble. → Thread Integrity.
//   · Unmodeled couplings — event-tree barrier pairs that share a CCF
//     group with no user-entered conditional pFail (etaCouplingFindings()).
//     Independence the product rule assumes but the model defeats. → Event Trees.
//   · Infeasible λ allocations — leaves whose allocated budget beats their
//     engineer-set achievable λ (the engine's _feasibilityViolation lane,
//     Phase 56.45). Physics says redesign. → Fault Trees.
//   · DAL-reduction debt — reductions claimed, CMA substantiation pending
//     (INV-05). The classic late-program surprise. → CMA workspace.
//
// invRun() is the app's own sweep and stamps projectConfig.invariantsLast
// exactly as the Thread Integrity page does on open — same designed
// behavior, so the strip THROTTLES it (one sweep per 4s at most) to keep
// dashboard refreshes from re-stamping in a tight loop.
//
// BORN MODULAR: new file; injects #dash-leading after #dash-posture, wraps
// updateDashboard additively (_leadWrapped), reuses the ckpt-tile design
// system. Exports window.LeadingIndicators for tests.
// ============================================================================
(function () {
    'use strict';

    let _lastSweep = null;      // { at:ms, inv: invRun() result }
    const SWEEP_TTL_MS = 4000;

    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ---- the four signals (counts only — every number originates elsewhere) --
    function _threadSweep() {
        const now = Date.now();
        if (_lastSweep && (now - _lastSweep.at) < SWEEP_TTL_MS) return _lastSweep.inv;
        if (typeof invRun !== 'function') return null;
        // ENG-4 (v1.1) — the sweep runs in an IDLE slice, never inside the
        // dashboard render. Render now from the cached result; when the idle
        // sweep lands, re-render the tiles with fresh counts.
        if (typeof SLIdle !== 'undefined' && SLIdle) {
            const stale = _lastSweep ? _lastSweep.inv : null;
            SLIdle.schedule('lead-sweep', function () {
                let inv = null;
                try { inv = invRun(); } catch (_) {}
                _lastSweep = { at: Date.now(), inv };
                try { render(); } catch (_) {}
            }, { timeout: 3000 });
            return stale;
        }
        let inv = null;
        try { inv = invRun(); } catch (_) {}
        _lastSweep = { at: now, inv };
        return inv;
    }
    function _couplings() {
        try { return (typeof etaCouplingFindings === 'function') ? etaCouplingFindings().length : 0; } catch (_) { return 0; }
    }
    function _infeasible() {
        let n = 0;
        try {
            ((typeof ftaPages !== 'undefined' ? ftaPages : []) || []).forEach(p => {
                (function walk(node) {
                    if (!node) return;
                    if (node.type !== 'gate' && node._feasibilityViolation) n++;
                    (node.children || []).forEach(walk);
                })(p.root);
            });
        } catch (_) {}
        return n;
    }
    function _dalDebt(inv) {
        if (!inv || !Array.isArray(inv.results)) return 0;
        const r = inv.results.find(x => x.id === 'INV-05');
        return r ? r.failCount : 0;
    }

    function compute() {
        const inv = _threadSweep();
        return {
            thread: inv ? { hard: inv.hardFails, adv: inv.advisories } : null,
            couplings: _couplings(),
            infeasible: _infeasible(),
            dalDebt: _dalDebt(inv)
        };
    }

    // ---- render (ckpt-tile design system; each tile routes to its fix-it) ---
    function _tile(label, value, sub, tone, tab, title) {
        return '<div class="ckpt-tile' + (tone ? ' ckpt-tile-' + tone : '') + '" role="button" tabindex="0"' +
            ' style="cursor:pointer;"' +
            ' onclick="switchTab(\'' + tab + '\')"' +
            ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault(); this.click();}"' +
            ' title="' + _esc(title) + '">' +
            '<div class="ckpt-tile-label">' + _esc(label) + '</div>' +
            '<div class="ckpt-tile-value">' + _esc(String(value)) + '</div>' +
            '<div class="ckpt-tile-sub">' + _esc(sub) + '</div></div>';
    }

    function render() {
        const host = document.getElementById('dash-leading');
        if (!host) return;
        const s = compute();
        let html = '<div class="ckpt-row-label" style="margin-top: var(--s-4);">Leading indicators — early warnings, click any to act</div>' +
            '<div class="ckpt-posture">';
        // Golden-thread breaks
        if (s.thread) {
            const worst = s.thread.hard > 0 ? 'danger' : (s.thread.adv > 0 ? 'warn' : 'ok');
            html += _tile('Golden-thread breaks', s.thread.hard,
                s.thread.hard ? s.thread.adv + ' advisories besides — thread at risk' : (s.thread.adv ? s.thread.adv + ' advisories — pending work' : 'sweep clean'),
                worst, 'gt-integrity',
                'Cross-artifact invariant sweep (deterministic). Hard fails are golden-thread breaks; advisories are pending-work honesty. Click for the full panel.');
        } else {
            html += _tile('Golden-thread breaks', '—', 'sweep unavailable', '', 'gt-integrity', 'Invariant sweep not loaded.');
        }
        // Unmodeled couplings
        html += _tile('Unmodeled couplings', s.couplings,
            s.couplings ? 'independence defeated — enter conditional pFail' : 'all couplings modeled or none declared',
            s.couplings ? 'danger' : 'ok', 'eta',
            'Event-tree barrier pairs sharing a CCF group with no user-entered conditional pFail — the product rule assumes an independence the model defeats.');
        // Infeasible allocations
        html += _tile('Infeasible λ allocations', s.infeasible,
            s.infeasible ? 'allocated beats achievable — architecture change' : 'all budgets physically achievable',
            s.infeasible ? 'danger' : 'ok', 'fta',
            'Basic events whose allocated failure budget exceeds their engineer-set achievable λ. Physics says the architecture must change — no component grade closes it.');
        // A9 — over-committed budgets (the completion-gate finding)
        try {
            const bs = (typeof budgetLedgerStats === 'function') ? budgetLedgerStats() : null;
            if (bs && typeof bs.overCommitted === 'number') {
                html += _tile('Over-committed budgets', bs.overCommitted,
                    bs.overCommitted ? 'constraints exceed the gate budget \u2014 decide in the ledger' : (bs.underAllocated ? bs.underAllocated + ' margin(s) held \u2014 informational' : 'all gates feasible'),
                    bs.overCommitted ? 'danger' : 'ok', 'budget',
                    'A9 \u2014 gates whose constraints (prescribed / external / shared-strictest) exceed the allocated budget. RED fails the PASA completion item; margins held are informational.');
            }
        } catch (_) {}
        // DAL-reduction debt
        html += _tile('DAL-reduction debt', s.dalDebt,
            s.dalDebt ? 'reductions await CMA substantiation' : 'all reductions substantiated',
            s.dalDebt ? 'warn' : 'ok', 'cma',
            'DAL reductions claimed under the independence predicate but not yet substantiated by CMA (INV-05) — the classic late-program surprise.');
        html += '</div>';
        host.innerHTML = html;
    }

    // ---- wiring ---------------------------------------------------------------
    function _injectHost() {
        if (document.getElementById('dash-leading')) return true;
        const posture = document.getElementById('dash-posture');
        if (!posture || !posture.parentNode) return false;
        const div = document.createElement('div');
        div.id = 'dash-leading';
        posture.parentNode.insertBefore(div, posture.nextSibling);
        return true;
    }
    (function wrapDash() {
        if (typeof window.updateDashboard !== 'function' || window.updateDashboard._leadWrapped) { setTimeout(wrapDash, 300); return; }
        const orig = window.updateDashboard;
        const wrapped = function () {
            const r = orig.apply(this, arguments);
            try { if (_injectHost()) render(); } catch (_) {}
            return r;
        };
        wrapped._leadWrapped = true;
        // 20 Aug 2026 — keep every prior wrapper's idempotence marker (see fn_wrap.js).
        try { if (window.SLWrap) SLWrap.preserve(orig, wrapped); } catch (_) {}
        window.updateDashboard = wrapped;
    })();
    function _ready(fn) { if (typeof document === 'undefined') return; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
    _ready(function () { let tries = 30; const t = setInterval(function () { if (_injectHost() || --tries <= 0) clearInterval(t); else return; if (document.getElementById('dash-leading')) render(); }, 250); });

    // ------------------------------------------------------------- exports
    if (typeof window !== 'undefined') {
        window.LeadingIndicators = { compute, render, _infeasible, _dalDebt };
    }
    if (typeof globalThis !== 'undefined') globalThis.LeadingIndicators = window.LeadingIndicators;
})();
