// ============================================================================
// lod_zoom.js — v1.0 — LOD-1: semantic zoom (SLLod) — map-tile level of detail.
//
// Maps don't draw every building at country zoom; they draw tiles. Zoomed far
// out on a big tree, individual nodes are unreadable smears — so below a zoom
// threshold this module swaps the node view for AGGREGATE TILES, one per
// top-level subtree: name, event count, engine P (when computed), and the
// thermal branch share when importance heat is on. Zoom back in and the full
// node view restores exactly. Extends ENG-2 culling; same honesty rule — an
// on-canvas pill states that the view is aggregated (layout and math always
// cover the full tree).
//
// Display lane only: tiles show engine-lane values (root probabilities,
// ImportanceHeat branch shares) and counts — nothing originated here.
// Opt-out: ?lod=0 or localStorage SLA_FTA_LOD='0'.
//
// BORN MODULAR: new file; wraps updateD3 + _ftaCullOnZoom additively
// (_lodWrapped); hides mounted groups via style.display (reversible, no join
// surgery). Exports window.SLLod.
// ============================================================================
(function () {
    'use strict';

    const LOD_K = 0.35;          // engage below this zoom scale
    const LOD_MIN_NODES = 300;   // and only on big trees (matches cull threshold)
    let _on = false, _timer = null;

    function _enabled() {
        try {
            if (/[?&]lod=0/.test(location.search)) return false;
            if (localStorage.getItem('SLA_FTA_LOD') === '0') return false;
        } catch (_) {}
        return true;
    }
    function _fmt(v) { return (typeof v === 'number' && isFinite(v)) ? v.toExponential(2) : null; }
    function _count(root) { let n = 0; (function w(x) { if (!x) return; n++; (x.children || []).forEach(w); })(root); return n; }
    function _events(root) { let n = 0; (function w(x) { if (!x) return; if (x.type === 'basic' || x.type === 'undeveloped') n++; (x.children || []).forEach(w); })(root); return n; }
    function _g() { try { return document.querySelector('#fta-svg g'); } catch (_) { return null; } }
    function _k() { try { const g = _g(); return g ? d3.zoomTransform(g.parentNode).k : 1; } catch (_) { return 1; } }

    function _pill(show, n) {
        try {
            let p = document.getElementById('lod-pill');
            if (!show) { if (p) p.style.display = 'none'; return; }
            if (!p) {
                p = document.createElement('div');
                p.id = 'lod-pill';
                p.style.cssText = 'position:absolute; left:14px; top:14px; z-index:5; padding:4px 10px; font-size:10.5px; font-family:var(--font-mono,monospace); color:var(--color-text-secondary,#4A5568); background:var(--color-surface-1,#fff); border:1px solid var(--color-border-strong,#B9C2D0); border-radius:999px;';
                const host = document.getElementById('fta-svg');
                if (!host || !host.parentElement) return;
                if (getComputedStyle(host.parentElement).position === 'static') host.parentElement.style.position = 'relative';
                host.parentElement.appendChild(p);
            }
            p.style.display = 'block';
            p.textContent = 'aggregated view — ' + n + ' subtree tile(s) · zoom in for nodes · layout and math cover the full tree';
        } catch (_) {}
    }

    function _clearTiles(g) { try { (g || _g()).querySelectorAll('g.lod-tile').forEach(t => t.remove()); } catch (_) {} }
    function _setNodesVisible(g, vis) {
        try { g.querySelectorAll(':scope > g.node, :scope > path.link').forEach(el => { el.style.display = vis ? '' : 'none'; }); } catch (_) {}
    }

    function _engage(root) {
        const g = _g();
        if (!g || typeof d3 === 'undefined' || typeof treeLayout === 'undefined' || !treeLayout) return;
        const NS = 'http://www.w3.org/2000/svg';
        _setNodesVisible(g, false);
        _clearTiles(g);
        let h;
        try { h = d3.hierarchy(root); treeLayout(h); } catch (_) { _setNodesVisible(g, true); return; }
        const subs = (h.children || []);
        subs.forEach(c => {
            const n = c.data;
            const x = c.x + (n.xOffset || 0), y = c.y + (n.yOffset || 0);
            const ev = _events(n);
            const p = _fmt(n.probability);
            let fill = 'var(--color-surface-2,#F3F5F9)', stroke = 'var(--color-border-strong,#B9C2D0)';
            try {
                if (typeof ImportanceHeat !== 'undefined' && ImportanceHeat.isOn()) {
                    fill = ImportanceHeat.heatColor(ImportanceHeat._shareFor(n.id));
                    stroke = '#5A1204';
                }
            } catch (_) {}
            const tile = document.createElementNS(NS, 'g');
            tile.setAttribute('class', 'lod-tile');
            tile.setAttribute('transform', 'translate(' + x + ',' + y + ')');
            tile.innerHTML =
                '<rect x="-150" y="-60" width="300" height="120" rx="14" fill="' + fill + '" stroke="' + stroke + '" stroke-width="2.5"></rect>' +
                '<text y="-22" text-anchor="middle" font-size="20" font-weight="700" fill="var(--color-text-primary,#16213A)">' + String(n.name || n.displayId || 'subtree').slice(0, 24).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</text>' +
                '<text y="8" text-anchor="middle" font-size="16" fill="var(--color-text-secondary,#4A5568)">' + ev + ' events · ' + _count(n) + ' nodes</text>' +
                (p ? '<text y="38" text-anchor="middle" font-size="16" font-family="monospace" fill="var(--color-text-secondary,#4A5568)">P ' + p + '</text>' : '');
            g.appendChild(tile);
        });
        _pill(true, subs.length);
        _on = true;
    }
    function _disengage() {
        const g = _g();
        if (g) { _clearTiles(g); _setNodesVisible(g, true); }
        _pill(false);
        if (_on) { _on = false; try { if (typeof updateD3 === 'function') updateD3(); } catch (_) {} }
    }

    function check() {
        try {
            if (!_enabled()) { if (_on) _disengage(); return; }
            const root = (typeof getActiveFTARoot === 'function') ? getActiveFTARoot() : null;
            if (!root) { if (_on) _disengage(); return; }
            const big = _count(root) > LOD_MIN_NODES;
            const far = _k() < LOD_K;
            if (big && far) _engage(root);
            else if (_on) _disengage();
        } catch (_) {}
    }
    function _debounced() { clearTimeout(_timer); _timer = setTimeout(check, 200); }

    // ---- wiring: ride the existing render + zoom cadence, additively ----------
    (function wrapRender() {
        if (typeof window.updateD3 !== 'function' || window.updateD3._lodWrapped) { setTimeout(wrapRender, 300); return; }
        const orig = window.updateD3;
        const wrapped = function () { const r = orig.apply(this, arguments); if (typeof SLLazy !== 'undefined' && SLLazy.skipped('fta-svg')) return r; /* lazy_render.js: the original was deferred, so is this companion */ _debounced(); return r; };
        wrapped._lodWrapped = true;
        window.updateD3 = wrapped;
    })();
    (function wrapZoom() {
        if (typeof window._ftaCullOnZoom !== 'function' || window._ftaCullOnZoom._lodWrapped) { setTimeout(wrapZoom, 300); return; }
        const orig = window._ftaCullOnZoom;
        const wrapped = function () { const r = orig.apply(this, arguments); _debounced(); return r; };
        wrapped._lodWrapped = true;
        window._ftaCullOnZoom = wrapped;
    })();

    // ------------------------------------------------------------- exports
    const api = { check, LOD_K, LOD_MIN_NODES, isOn: () => _on, _engage, _disengage };
    if (typeof window !== 'undefined') window.SLLod = api;
    if (typeof globalThis !== 'undefined') globalThis.SLLod = api;
})();
