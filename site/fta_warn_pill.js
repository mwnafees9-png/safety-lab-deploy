// fta_warn_pill.js: SLFtaWarn 1.0
//
// 27 Oct 2026 (customer report, Waqas): the line under a fault tree node shows its probability per
// flight and per flight hour, nothing else. Every other note about the tree's nodes (strictest
// allocation, independence compromised, the dynamic gate notes, allocated stricter than achievable,
// the top event's exact total against its target) is behind a small warning pill at the bottom of the
// canvas: "I just want a small warning pill at the bottom of the canvas not a bulky bar there".
//   - the pill shows only when the tree on screen has something to say: "⚠ 2" (amber) for warnings,
//     "△ 1" (grey) when there are only information notes
//   - a click on the pill opens a short list above it, one line per finding with its node ID or "3 nodes"
//   - a click on a line highlights exactly those nodes and moves the view to them (a collapsed branch
//     is opened); the same line again, or empty canvas, clears it
//   - a click outside the list, or Esc, closes the list
//   - the node's properties box shows its notes in full
//
// The wording of every note comes from ftaNodeWarnings (helpers_modules.js), so the pill, the
// properties box and formatNodeActualLine can never disagree.
//
// Entry points:
//   SLFtaWarn.afterRender(rootNode, allDesc)  end of updateD3: refresh the pill, keep the highlight
//   SLFtaWarn.toggle(key)                      a line in the list: highlight its nodes, or clear
//   SLFtaWarn.clear()                          drop the highlight
//   SLFtaWarn.open() / close() / isOpen()      the list above the pill
//   SLFtaWarn.fillPanel(node)                  the node properties box's warnings block
//   SLFtaWarn.collect(rootNode)                [{ key, sev, title, items: [{ node, text }] }]
(function () {
    'use strict';
    var VERSION = '1.0';
    var state = { pageId: null, key: null, hits: null, sig: '', groups: [], laid: new Map(), wired: false, open: false };

    function _esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function _warningsOf(node, isRoot) {
        try { return (typeof ftaNodeWarnings === 'function') ? ftaNodeWarnings(node, isRoot) : []; } catch (_) { return []; }
    }
    function _activeRoot() {
        try { return (typeof getActiveFTARoot === 'function') ? getActiveFTARoot() : null; } catch (_) { return null; }
    }
    function _activePageId() {
        try { return (typeof activeFTAPageId !== 'undefined') ? activeFTAPageId : null; } catch (_) { return null; }
    }

    // Every note on every node of the tree on screen, collapsed branches included, grouped by finding.
    // Warnings first, then information notes, each in the order the tree first meets them.
    function collect(rootNode) {
        var groups = new Map();
        if (!rootNode) return [];
        var seen = new Set();
        (function walk(n) {
            if (!n || seen.has(n)) return;
            seen.add(n);
            _warningsOf(n, n === rootNode).forEach(function (w) {
                var gr = groups.get(w.key);
                if (!gr) { gr = { key: w.key, sev: w.sev, title: w.title, items: [] }; groups.set(w.key, gr); }
                gr.items.push({ node: n, text: w.text });
            });
            var kids = n.children || n._children;
            if (kids) kids.forEach(walk);
        })(rootNode);
        var all = Array.from(groups.values());
        return all.filter(function (g) { return g.sev === 'warn'; }).concat(all.filter(function (g) { return g.sev !== 'warn'; }));
    }

    function _label(n) { return String((n && (n.displayId || n.name || n.id)) || 'node'); }
    function _sig(groups) {
        return groups.map(function (g) {
            return g.key + ':' + g.items.map(function (it) { return String(it.node.id) + '=' + it.text; }).join('|');
        }).join('#');
    }
    function _host() { return document.getElementById('fta-warn-pill'); }

    function _render() {
        var host = _host();
        if (!host) return;
        var groups = state.groups;
        if (!groups.length) { host.innerHTML = ''; host.style.display = 'none'; state.open = false; return; }
        var nWarn = groups.filter(function (g) { return g.sev === 'warn'; }).length;
        var nInfo = groups.length - nWarn;
        var label = nWarn ? ('⚠ ' + nWarn) : ('△ ' + nInfo);
        var tip = [nWarn ? nWarn + (nWarn === 1 ? ' warning' : ' warnings') : '', nInfo ? nInfo + (nInfo === 1 ? ' note' : ' notes') : '']
            .filter(Boolean).join(' and ') + ' on this tree. Click to see them.';
        var rows = groups.map(function (g) {
            var n = g.items.length;
            var who = n === 1 ? _label(g.items[0].node) : (n + ' nodes');
            var rowTip = g.items.map(function (it) { return _label(it.node) + ': ' + it.text; }).join('\n');
            var on = state.key === g.key;
            return '<button type="button" role="menuitem" class="fwp-row fwp-' + (g.sev === 'warn' ? 'warn' : 'info') + (on ? ' is-active' : '') +
                '" data-key="' + _esc(g.key) + '" title="' + _esc(rowTip) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
                '<span class="fwp-glyph" aria-hidden="true">' + (g.sev === 'warn' ? '⚠' : '△') + '</span>' +
                '<span class="fwp-title">' + _esc(g.title) + '</span>' +
                '<span class="fwp-who">' + _esc(who) + '</span></button>';
        }).join('');
        // The button and the list are built once and updated in place: a re-render while someone is
        // clicking never swaps the element under the pointer, and keyboard focus stays on the button.
        var btn = host.querySelector('.fwp-btn'), list = host.querySelector('.fwp-list');
        if (!btn || !list) {
            host.innerHTML = '<button type="button" class="fwp-btn" aria-haspopup="true" aria-expanded="false"></button>' +
                '<div class="fwp-list" role="menu" style="display:none;"></div>';
            btn = host.querySelector('.fwp-btn'); list = host.querySelector('.fwp-list');
        }
        btn.className = 'fwp-btn ' + (nWarn ? 'fwp-has-warn' : 'fwp-only-info');
        btn.textContent = label;
        btn.title = tip;
        btn.setAttribute('aria-expanded', state.open ? 'true' : 'false');
        list.innerHTML = '<div class="fwp-hint">Click a line to highlight its nodes. Open a node for the full message.</div>' + rows;
        list.style.display = state.open ? 'flex' : 'none';
        host.style.display = '';
    }

    function _setOpen(v) {
        state.open = !!v;
        var host = _host(); if (!host) return;
        var list = host.querySelector('.fwp-list'), btn = host.querySelector('.fwp-btn');
        if (list) list.style.display = state.open ? 'flex' : 'none';
        if (btn) btn.setAttribute('aria-expanded', state.open ? 'true' : 'false');
    }
    function open() { _setOpen(true); }
    function close() { _setOpen(false); }

    function _applyHighlight() {
        try {
            if (typeof g === 'undefined' || !g || typeof g.selectAll !== 'function') return;
            var hits = state.hits;
            g.selectAll('g.node').classed('fta-warn-hit', function (d) { return !!(hits && d && hits.has(d.data)); });
        } catch (_) {}
    }

    function _wire() {
        if (state.wired) return;
        var host = _host(), svgEl = document.getElementById('fta-svg');
        if (!host || !svgEl) return;
        state.wired = true;
        // The canvas pans on mousedown: the pill and its list must not start a pan.
        ['mousedown', 'pointerdown', 'wheel', 'dblclick'].forEach(function (t) { host.addEventListener(t, function (e) { e.stopPropagation(); }); });
        host.addEventListener('click', function (e) {
            e.stopPropagation();
            var t = e.target;
            if (t && t.closest && t.closest('.fwp-btn')) { _setOpen(!state.open); return; }
            var row = t && t.closest ? t.closest('.fwp-row') : null;
            if (row) toggle(row.getAttribute('data-key'));
        });
        // A click anywhere outside the pill closes the list.
        document.addEventListener('mousedown', function (e) {
            if (!state.open) return;
            if (e.target && e.target.closest && e.target.closest('#fta-warn-pill')) return;
            close();
        }, true);
        // Capture phase: the node panel's own Esc handler must not swallow it first.
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.open) close(); }, true);
        // A click on empty canvas drops the highlight; a click on a node keeps it (it opens the node).
        svgEl.addEventListener('click', function (e) {
            if (!state.key) return;
            if (e.target && e.target.closest && e.target.closest('g.node')) return;
            clear();
        });
    }

    function afterRender(rootNode, allDesc) {
        _wire();
        var pid = _activePageId();
        if (pid !== state.pageId) { state.pageId = pid; state.key = null; state.hits = null; state.open = false; }
        state.laid = new Map();
        (allDesc || []).forEach(function (d) { if (d && d.data) state.laid.set(d.data, { x: d.x, y: d.y }); });
        state.groups = collect(rootNode);
        if (state.key) {
            var still = state.groups.find(function (gr) { return gr.key === state.key; });
            if (!still) { state.key = null; state.hits = null; }
            else state.hits = new Set(still.items.map(function (it) { return it.node; }));
        }
        var sig = _sig(state.groups) + '@' + (state.key || '');
        if (sig !== state.sig) { state.sig = sig; _render(); }
        _applyHighlight();
        // An open properties box follows its node's notes as the math changes.
        try {
            var panel = document.getElementById('node-config-panel');
            if (panel && panel.style.display !== 'none' && typeof selectedNodeData !== 'undefined' && selectedNodeData) fillPanel(selectedNodeData);
        } catch (_) {}
    }

    // Pan and zoom so every highlighted node is in view (never zooming in past 1:1).
    function _zoomTo(nodes) {
        try {
            if (typeof svg === 'undefined' || !svg || typeof zoom === 'undefined' || !zoom || typeof d3 === 'undefined') return;
            var parent = document.getElementById('svg-wrap-container');
            if (!parent) return;
            var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            nodes.forEach(function (n) {
                var p = state.laid.get(n);
                if (!p) return;
                x0 = Math.min(x0, p.x - 95); x1 = Math.max(x1, p.x + 95);
                y0 = Math.min(y0, p.y - 135); y1 = Math.max(y1, p.y + 60);
            });
            if (!isFinite(x0)) return;
            var inset = 0;
            try { var tb = document.getElementById('fta-toolbox'); if (tb && tb.offsetParent) inset = tb.offsetWidth + 16; } catch (_) {}
            var W = Math.max(200, parent.clientWidth - inset), H = Math.max(200, parent.clientHeight - 60);
            var k = Math.max(0.1, Math.min(1, (W * 0.9) / (x1 - x0), (H * 0.9) / (y1 - y0)));
            var tx = inset + W / 2 - k * (x0 + x1) / 2, ty = H / 2 - k * (y0 + y1) / 2;
            svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
        } catch (_) {}
    }

    function toggle(key) {
        if (!key || state.key === key) { clear(); return; }
        var gr = state.groups.find(function (x) { return x.key === key; });
        if (!gr) { clear(); return; }
        state.key = key;
        state.hits = new Set(gr.items.map(function (it) { return it.node; }));
        // A node inside a collapsed branch is not drawn: open the branch so it can be seen.
        var root = _activeRoot(), opened = false;
        if (root && typeof _ftaExpandPathToNode === 'function') {
            gr.items.forEach(function (it) { if (!state.laid.has(it.node) && _ftaExpandPathToNode(root, it.node)) opened = true; });
        }
        state.sig = '';
        if (opened && typeof updateD3 === 'function') updateD3();
        else { state.sig = _sig(state.groups) + '@' + state.key; _render(); _applyHighlight(); }
        _zoomTo(gr.items.map(function (it) { return it.node; }));
    }

    function clear() {
        if (!state.key && !state.hits) return;
        state.key = null; state.hits = null;
        state.sig = _sig(state.groups) + '@';
        _render();
        _applyHighlight();
    }

    function fillPanel(node) {
        var host = document.getElementById('config-node-warnings');
        if (!host) return;
        var w = node ? _warningsOf(node, node === _activeRoot()) : [];
        if (!w.length) { host.innerHTML = ''; host.style.display = 'none'; return; }
        host.innerHTML = w.map(function (x) {
            return '<div class="cnw-item cnw-' + (x.sev === 'warn' ? 'warn' : 'info') + '"><span class="cnw-glyph" aria-hidden="true">' +
                (x.sev === 'warn' ? '⚠' : '△') + '</span><span>' + _esc(x.text) + '</span></div>';
        }).join('');
        host.style.display = '';
    }

    window.SLFtaWarn = {
        VERSION: VERSION, collect: collect, afterRender: afterRender, toggle: toggle, clear: clear, fillPanel: fillPanel,
        open: open, close: close, isOpen: function () { return state.open; },
        activeKey: function () { return state.key; },
        highlighted: function () { return state.hits ? Array.from(state.hits) : []; }
    };
})();
