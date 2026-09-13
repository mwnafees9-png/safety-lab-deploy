// 13 Sep 2026 (R19 step 2): every fire-and-forget promise chain in this file now ends in .catch → SLErrorWatch.report(e, module), so a failure is recorded and told to the person instead of dying in the console.
// ============================================================================
// importance_heat.js — v2.1 — UX-1: thermal importance heatmap on the FTA canvas.
//
// v2.1 (HEAT-STALE fix, 26 Jul 2026): refusal honesty. The importance sweep
//   costs two exact evaluations PER EVENT (Birnbaum needs P(top|x=1) and
//   P(top|x=0)); on oversized pages the sweep is now REFUSED with a named
//   reason — deterministic pre-flight budget below — and any engine failure is
//   surfaced the same way. Stale state (maps, FVmax) is cleared BEFORE every
//   recompute, so no page can ever wear the previous page's numbers. The
//   legend renders the refusal; nothing is painted; nothing is approximated.
//   Found live: a 298k-node page silently displayed the prior tree's FVmax.
// v2.0 (design direction from Waqas): a THERMAL rendering, not shape recolors.
//   The top event runs hot; heat flows down the same link paths the cutset
//   highlighter uses, staying hot along the channel that carries the dominant
//   risk and leaving other branches cool. FV is a cutset-derived measure, so
//   painting it in the cutset-triage visual language is the natural fit — and
//   the two compose: clicking a cutset row still flashes its exact path red
//   (.cutset-highlight is !important and wins over the thermal strokes).
// v1.1: legend at canvas top-right (bottom-right collides with app controls).
//
// Two-lane discipline: every per-event number (Fussell–Vesely, Birnbaum, rank)
// is computed by the deterministic core (computeImportanceMeasures / worker
// path via computeImportanceAsync). Branch temperature is a DISPLAY
// AGGREGATION — the sum of engine-computed FV over the branch's subtree
// events, normalized by the top event's total — computed deterministically
// here for color only and labeled as such in every tooltip. Nothing writes to
// any store; toggle off (or any failure) → one updateD3() restores stock
// rendering exactly.
//
// Visual design: thermal ramp derived from the inferno colormap (perceptually
// ordered in lightness, CVD-robust) — cold deep violet → hot amber. Identity
// is never color-alone: hover any node for exact values; the legend states
// the measure, the aggregation, and the provenance.
//
// BORN MODULAR: new file; injects its toggle into the FTA toolbar, wraps
// updateD3 + calculateAllProbabilities additively, exports
// window.ImportanceHeat for tests.
// ============================================================================
(function () {
    'use strict';

    // Thermal stops, cold → hot (inferno-derived; lightness strictly ascending).
    const STOPS = ['#1F0C48', '#57106E', '#8A226A', '#BC3754', '#E45A31', '#F98C0A', '#FCC227'];

    let _on = false;
    let _byLid = null;          // logicalId → { fv, rank, birnbaum }  (engine values)
    let _shareById = null;      // tree-node id → { share, nEvents }   (display aggregation)
    let _maxFv = 0;
    let _computeToken = 0;
    let _refusal = null;        // string reason when the sweep is refused/failed — legend renders it
    let _forRootId = null;      // root id the current maps were computed for (stale-page guard)

    // Deterministic pre-flight budget: the sweep is O(events × BDD) — two exact
    // evaluations per basic event. Past this, refuse with a named reason rather
    // than hang the page, approximate, or serve stale numbers. (The quantified
    // tree itself has no such limit — this bounds only the per-event sweep.)
    const SWEEP_BUDGET_EVENTS = 20000;
    function _countEvents(root) {
        let n = 0;
        const walk = (node) => {
            if (!node) return;
            if (node.type !== 'gate') n++;
            (node.children || []).forEach(walk);
        };
        walk(root);
        return n;
    }

    function isOn() { return _on; }

    // ---- thermal color: piecewise-linear interpolation over the stops -------
    function _hex2rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
    function _rgb2hex(r) { return '#' + r.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase(); }
    function heatColor(share) {
        const t = (typeof share === 'number' && isFinite(share)) ? Math.max(0, Math.min(1, share)) : 0;
        const u = t * (STOPS.length - 1);
        const i = Math.min(STOPS.length - 2, Math.floor(u));
        const f = u - i;
        const a = _hex2rgb(STOPS[i]), b = _hex2rgb(STOPS[i + 1]);
        return _rgb2hex([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
    }

    function _fmt(v) { return (typeof v === 'number' && isFinite(v)) ? v.toExponential(2) : '—'; }
    function _pct(v) { return (v * 100).toFixed(1) + '%'; }

    // ---- branch temperature (display aggregation over ENGINE per-event FV) --
    // share(node) = Σ FV over the node's subtree basic events / Σ FV over the
    // whole tree. Root = 1 (hot); a branch carrying no importance = 0 (cold).
    function _annotate(root) {
        const map = new Map();
        const walk = (n) => {
            if (!n) return { h: 0, c: 0 };
            const kids = n.children || [];
            let h = 0, c = 0;
            if (n.type !== 'gate') {
                const rec = _byLid && _byLid.get(String(n.logicalId != null ? n.logicalId : n.id));
                h = rec ? rec.fv : 0; c = 1;
            }
            for (const k of kids) { const r = walk(k); h += r.h; c += r.c; }
            map.set(String(n.id), { heat: h, nEvents: c });
            return { h, c };
        };
        const total = walk(root).h;
        map.forEach(rec => { rec.share = total > 0 ? Math.min(1, rec.heat / total) : 0; });
        return map;
    }
    function _shareFor(nodeId) {
        const rec = _shareById && _shareById.get(String(nodeId));
        return rec ? rec.share : 0;
    }

    // ---- compute (off-thread when the worker path is available) -------------
    // Stale state is cleared FIRST, unconditionally: from this moment until a
    // successful compute lands, there are no numbers to show — cold paint and,
    // if the sweep can't run, a refusal in the legend. Never the old page's map.
    function _recompute() {
        const token = ++_computeToken;
        _byLid = null; _shareById = null; _maxFv = 0; _refusal = null; _forRootId = null;
        const root = (typeof getActiveFTARoot === 'function') ? getActiveFTARoot() : null;
        if (!root) return Promise.resolve();
        const nEvents = _countEvents(root);
        if (nEvents > SWEEP_BUDGET_EVENTS) {
            _refusal = 'REFUSED — ' + nEvents.toLocaleString('en-US') + ' basic events exceeds the importance-sweep budget (' +
                SWEEP_BUDGET_EVENTS.toLocaleString('en-US') + '). Per-event importance costs two exact evaluations per event; ' +
                'past the budget the sweep is refused — not approximated, not served stale.';
            return Promise.resolve();
        }
        const run = (typeof computeImportanceAsync === 'function')
            ? computeImportanceAsync(root)
            : Promise.resolve(computeImportanceMeasures(root));
        return run.then(res => {
            if (token !== _computeToken) return;    // stale (tree switched / toggled)
            const map = new Map();
            const sorted = (res.measures || []).slice().sort((a, b) => (b.fv || 0) - (a.fv || 0));
            _maxFv = sorted.length ? (sorted[0].fv || 0) : 0;
            sorted.forEach((m, i) => {
                const lid = m.node && (m.node.logicalId != null ? m.node.logicalId : m.node.id);
                if (lid != null) map.set(String(lid), { fv: m.fv || 0, birnbaum: m.birnbaum || 0, rank: i + 1 });
            });
            _byLid = map;
            _shareById = _annotate(root);
            _refusal = null;
            _forRootId = String(root.id);
        }).catch(e => {
            if (token !== _computeToken) return;
            _byLid = null; _shareById = null; _maxFv = 0; _forRootId = null;
            _refusal = 'REFUSED — the engine declined the importance sweep: ' +
                ((e && e.message) ? String(e.message).slice(0, 160) : 'computation failed') +
                '. Nothing painted; no stale values.';
        });
    }
    function _refusalReason() { return _refusal; }

    // ---- paint (post-pass over MOUNTED nodes + links; culling-safe) ----------
    function _svgRoot() {
        const el = document.getElementById('fta-svg');
        if (!el) return null;
        return (el.tagName && el.tagName.toLowerCase() === 'svg') ? el : el.querySelector('svg');
    }
    function _ensureBlurFilter() {
        try {
            const svg = _svgRoot();
            if (!svg || svg.querySelector('#heat-blur')) return;
            const NS = 'http://www.w3.org/2000/svg';
            let defs = svg.querySelector('defs');
            if (!defs) { defs = document.createElementNS(NS, 'defs'); svg.insertBefore(defs, svg.firstChild); }
            const f = document.createElementNS(NS, 'filter');
            f.setAttribute('id', 'heat-blur');
            f.setAttribute('x', '-80%'); f.setAttribute('y', '-80%');
            f.setAttribute('width', '260%'); f.setAttribute('height', '260%');
            const blur = document.createElementNS(NS, 'feGaussianBlur');
            blur.setAttribute('stdDeviation', '8');
            f.appendChild(blur);
            defs.appendChild(f);
        } catch (_) {}
    }

    function _paintLinks() {
        try {
            if (!_on || !_shareById || typeof g === 'undefined' || !g) return;
            g.selectAll('.link').each(function (d) {
                const share = d && d.target ? _shareFor(d.target.data.id) : 0;
                // Thermal stroke — same visual language as the cutset path
                // highlight, temperature-graded. .cutset-highlight (!important)
                // still wins when a cutset row is clicked.
                this.style.stroke = heatColor(share);
                this.style.strokeWidth = (1.5 + 3.5 * share) + 'px';
                this.style.strokeOpacity = String(0.55 + 0.45 * share);
            });
        } catch (_) {}
    }

    let _repaintScheduled = false;
    function _paint() {
        try {
            if (!_on || !_byLid || !_shareById || typeof d3 === 'undefined' || typeof g === 'undefined' || !g) return;
            // Stale-page guard: if the active root is not the one these maps were
            // computed for (page switched without a quant pass), recompute once
            // rather than painting another tree's temperatures.
            const cur = (typeof getActiveFTARoot === 'function') ? getActiveFTARoot() : null;
            if (cur && _forRootId !== null && String(cur.id) !== _forRootId) {
                if (!_repaintScheduled) {
                    _repaintScheduled = true;
                    _recompute().then(() => { _repaintScheduled = false; _paint(); _legend(_on); }).catch(function (e) { if (window.SLErrorWatch) SLErrorWatch.report(e, 'importance_heat'); });
                }
                return;
            }
            _ensureBlurFilter();
            const NS = 'http://www.w3.org/2000/svg';
            g.selectAll('.node').each(function (d) {
                const n = d && d.data;
                if (!n) return;
                const srec = _shareById.get(String(n.id));
                const share = srec ? srec.share : 0;
                // Soft thermal glow BEHIND the stock symbol (shapes keep their
                // own colors — the glow carries the temperature).
                let glow = this.querySelector(':scope > circle.heat-glow');
                if (!glow) {
                    glow = document.createElementNS(NS, 'circle');
                    glow.setAttribute('class', 'heat-glow');
                    glow.setAttribute('filter', 'url(#heat-blur)');
                    glow.style.pointerEvents = 'none';
                    this.insertBefore(glow, this.firstChild);
                }
                let cx = 0, cy = 12, r = 34;
                try {
                    const p = this.querySelector(':scope > path');
                    if (p) { const bb = p.getBBox(); cx = bb.x + bb.width / 2; cy = bb.y + bb.height / 2; r = Math.max(bb.width, bb.height) / 2 + 14; }
                } catch (_) {}
                glow.setAttribute('cx', cx); glow.setAttribute('cy', cy);
                glow.setAttribute('r', String(r + 12 * share));
                glow.setAttribute('fill', heatColor(share));
                glow.setAttribute('opacity', String(share > 0.02 ? 0.30 + 0.45 * share : 0.12));
                // Tooltip — identity is never color-alone.
                let t = this.querySelector(':scope > title.heat-title');
                if (!t) {
                    t = document.createElementNS(NS, 'title');
                    t.setAttribute('class', 'heat-title');
                    this.appendChild(t);
                }
                if (n.type === 'gate') {
                    const nEv = srec ? srec.nEvents : 0;
                    t.textContent = 'Branch heat ' + _pct(share) + ' of top-event FV — Σ Fussell–Vesely over ' + nEv +
                        ' subtree event(s) (display aggregation; per-event FV computed BDD-exact by the engine)';
                } else {
                    const rec = _byLid.get(String(n.logicalId != null ? n.logicalId : n.id));
                    t.textContent = rec
                        ? 'Fussell–Vesely ' + _fmt(rec.fv) + ' (rank #' + rec.rank + ')  ·  Birnbaum ' + _fmt(rec.birnbaum) + '  ·  ' + _pct(share) + ' of top-event FV'
                        : 'No quantitative importance (cold)';
                }
            });
            _paintLinks();
            // The stock link render transitions stroke over 180ms and would
            // overwrite the thermal strokes mid-flight — re-assert after it lands.
            setTimeout(_paintLinks, 240);
        } catch (_) {}
    }

    function _unpaint() {
        try {
            document.querySelectorAll('#fta-svg circle.heat-glow').forEach(el => el.remove());
            document.querySelectorAll('#fta-svg title.heat-title').forEach(el => el.remove());
            if (typeof g !== 'undefined' && g) g.selectAll('.link').each(function () {
                this.style.removeProperty('stroke');
                this.style.removeProperty('stroke-width');
                this.style.removeProperty('stroke-opacity');
            });
        } catch (_) {}
    }

    // ---- legend --------------------------------------------------------------
    function _legend(show) {
        try {
            const el = document.getElementById('fta-svg');
            if (!el || !el.parentElement) return;
            let box = document.getElementById('fta-heat-legend');
            if (!show) { if (box) box.style.display = 'none'; return; }
            if (!box) {
                box = document.createElement('div');
                box.id = 'fta-heat-legend';
                box.style.cssText = 'position:absolute; right:14px; top:14px; z-index:5; padding:8px 12px; font-size:11px; font-family:var(--font-mono,monospace); color:var(--color-text-secondary,#4A5568); background:var(--color-surface-1,#fff); border:1px solid var(--color-border-strong,#B9C2D0); border-radius:4px; max-width:240px;';
                const host = el.parentElement;
                if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
                host.appendChild(box);
            }
            box.style.display = 'block';
            if (_refusal) {
                // Refusal honesty: the sweep did not run — say so, in place, with
                // the reason. No gradient, no FVmax, no stale numbers.
                box.style.borderColor = '#E5484D';
                box.innerHTML = '<div style="font-weight:700; margin-bottom:4px;">Importance heat — <span style="color:#E5484D;">unavailable</span></div>' +
                    '<div style="font-size:10px; color:var(--color-text-secondary,#4A5568);">' + _refusal + '</div>';
                return;
            }
            box.style.borderColor = '';
            box.innerHTML = '<div style="font-weight:700; margin-bottom:4px;">Importance heat — Fussell–Vesely</div>' +
                '<div style="height:10px; border-radius:2px; background:linear-gradient(to right,' + STOPS.join(',') + ');"></div>' +
                '<div style="display:flex; justify-content:space-between; font-size:10px; margin-top:2px;"><span>cold branch</span><span>hot channel</span></div>' +
                '<div style="font-size:10px; color:var(--color-text-tertiary,#7C8698); margin-top:3px;">branch temperature = share of top-event FV carried by that branch (Σ over its subtree events — display aggregation) · per-event FV computed BDD-exact by the engine · FV<sub>max</sub> ' + _fmt(_maxFv) + ' · hover any node for values</div>';
        } catch (_) {}
    }

    // ---- toggle ---------------------------------------------------------------
    function setOn(v) {
        _on = !!v;
        const btn = document.getElementById('btn-importance-heat');
        if (btn) {
            btn.style.background = _on ? '#BC3754' : '';
            btn.style.color = _on ? '#fff' : '';
        }
        if (_on) {
            _unpaint();                              // previous page's glow never survives into the compute window
            _recompute().then(() => { _paint(); _legend(true); }).catch(function (e) { if (window.SLErrorWatch) SLErrorWatch.report(e, 'importance_heat'); });
        } else {
            _byLid = null; _shareById = null;
            _legend(false);
            _unpaint();
            try { if (typeof updateD3 === 'function') updateD3(); } catch (_) {}   // stock render restored
        }
    }
    function toggle() { setOn(!_on); }

    // ---- wiring ---------------------------------------------------------------
    // Post-pass after every updateD3 (renders, cull remounts, tree switches).
    (function wrapRender() {
        if (typeof window.updateD3 !== 'function' || window.updateD3._heatWrapped) { setTimeout(wrapRender, 300); return; }
        const orig = window.updateD3;
        const wrapped = function () {
            const r = orig.apply(this, arguments);
            try { if (_on) { _paint(); } } catch (_) {}
            return r;
        };
        wrapped._heatWrapped = true;
        window.updateD3 = wrapped;
    })();
    // Recompute when the heat is on and the numbers may have moved (the same
    // recompute entry the app already funnels quantitative edits through).
    (function wrapCalc() {
        if (typeof window.calculateAllProbabilities !== 'function' || window.calculateAllProbabilities._heatWrapped) { setTimeout(wrapCalc, 300); return; }
        const orig = window.calculateAllProbabilities;
        const wrapped = function () {
            const r = orig.apply(this, arguments);
            try { if (_on) _recompute().then(_paint).catch(function (e) { if (window.SLErrorWatch) SLErrorWatch.report(e, 'importance_heat'); }); } catch (_) {}
            return r;
        };
        wrapped._heatWrapped = true;
        window.calculateAllProbabilities = wrapped;
    })();
    // Toolbar button — injected next to Auto-allocate DAL.
    function _injectButton() {
        if (document.getElementById('btn-importance-heat')) return true;
        const anchor = document.getElementById('btn-allocate-dal');
        if (!anchor || !anchor.parentNode) return false;
        const b = document.createElement('button');
        b.id = 'btn-importance-heat';
        b.type = 'button';
        b.title = 'Thermal importance overlay — the top event runs hot and the heat follows the links down to the dominant causes; cold branches stay cool. Display only; per-event Fussell–Vesely computed BDD-exact by the engine.';
        b.textContent = '🔥 Importance heat';
        b.addEventListener('click', toggle);
        anchor.parentNode.insertBefore(b, anchor.nextSibling);
        return true;
    }
    function _ready(fn) { if (typeof document === 'undefined') return; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
    _ready(function () { let tries = 30; const t = setInterval(function () { if (_injectButton() || --tries <= 0) clearInterval(t); }, 250); });

    // ------------------------------------------------------------- exports
    if (typeof window !== 'undefined') {
        window.ImportanceHeat = { toggle, setOn, isOn, heatColor, STOPS, _recompute, _paint, _shareFor, _refusalReason, SWEEP_BUDGET_EVENTS };
    }
    if (typeof globalThis !== 'undefined') globalThis.ImportanceHeat = window.ImportanceHeat;
})();
