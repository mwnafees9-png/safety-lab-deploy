// ============================================================================
// nav_return.js — v1.0 — THE WAY BACK (25 Aug 2026).
//
// Reviewer feedback (nav_feedback_1.pptx, slide 2): "Then you get to here and
// you can click around but to go back you have to click on the golden thread.
// I'm thinking an expanding directory tree similar to a CAD program. Or a
// safety V chart and you can go up and down and lateral. None of this has to
// be done now … Now that I know the quirk I'm ok with it, but I've been
// trained by boeing software programs to accept the quirks and forced to use
// those software programs."
//
// That last sentence is the finding. He is not describing a missing feature,
// he is describing the moment a user stops expecting the tool to be good. The
// CAD spec tree and the safety-V navigator are both real options and both are
// design rulings for another day (the CAD tree would also reverse yesterday's
// signed "no tree rows anywhere" ruling). What ships today is the smallest
// thing that removes the quirk itself: a jump from the golden thread now
// leaves a way back.
//
// HOW IT WORKS
//   · _gtvShowEco / _gtvShowEcoModal are wrapped to remember WHICH node's panel
//     is currently open — that node is the origin, not the destination.
//   · _gtvNavigateTo is wrapped: on a successful jump it records the origin and
//     paints a return chip.
//   · The chip returns to the Golden Thread AND re-opens the panel you left,
//     via a pending-key handshake that _gtvShowEco honours on the next render.
//   · Any navigation the user makes THEMSELVES (a rail row, a tab) clears the
//     chip — a return path that outlives its journey is just clutter.
//
// BORN MODULAR: new file, zero monolith edits beyond the two panel doors.
// Kill switch: window.SL_NAV_RETURN_OFF = true.
// ============================================================================
(function () {
    'use strict';

    var CHIP_ID = 'sl-nav-return';
    var _origin = null;     // {key, label, kind} — the panel we jumped FROM
    var _cur = null;        // {key, label, kind} — the panel open right now
    var _pendingKey = null; // ask the next golden-thread render to open this node
    var _fromThread = false;

    function off() { return (typeof window !== 'undefined' && window.SL_NAV_RETURN_OFF); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    function _labelOf(graph, key) {
        try {
            var n = (graph && graph.nodes || []).find(function (x) { return x.key === key; });
            return n ? { key: key, label: n.label, kind: n.kind } : { key: key, label: key, kind: '' };
        } catch (_) { return { key: key, label: key, kind: '' }; }
    }

    // ---- the chip -----------------------------------------------------------
    function hide() {
        var el = document.getElementById(CHIP_ID);
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function paint() {
        if (off()) return;
        hide();
        if (!_origin) return;
        var el = document.createElement('div');
        el.id = CHIP_ID;
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.title = 'Back to the Golden Thread, on ' + _origin.label;
        // Bottom-centre: clear of the rail on the left, clear of the Feedback
        // and ⌘K controls on the right, clear of the activity strip below.
        el.style.cssText = [
            'position:fixed', 'left:50%', 'transform:translateX(-50%)', 'bottom:46px',
            'z-index:9500', 'display:inline-flex', 'align-items:center', 'gap:9px',
            'padding:9px 16px', 'border-radius:999px', 'cursor:pointer',
            'font-size:13px', 'font-weight:600',
            'color:var(--color-text-primary)',
            'background:var(--color-surface-1,#fff)',
            'border:1px solid var(--color-border-strong,#c7ccd6)',
            'box-shadow:0 6px 22px rgba(0,0,0,.20)',
            'transition:box-shadow .12s, transform .12s'
        ].join(';');
        el.innerHTML = '<span style="font-size:15px; line-height:1;">←</span>'
            + '<span>Back to Golden Thread</span>'
            + '<span style="opacity:.34;">·</span>'
            + '<span style="font-weight:700;">' + esc(_origin.label) + '</span>';
        el.addEventListener('mouseenter', function () {
            el.style.boxShadow = '0 8px 28px rgba(0,0,0,.28)';
            el.style.transform = 'translateX(-50%) translateY(-1px)';
        });
        el.addEventListener('mouseleave', function () {
            el.style.boxShadow = '0 6px 22px rgba(0,0,0,.20)';
            el.style.transform = 'translateX(-50%)';
        });
        el.addEventListener('click', goBack);
        el.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goBack(); }
        });
        document.body.appendChild(el);
    }

    function goBack() {
        if (!_origin) { hide(); return; }
        _pendingKey = _origin.key;
        _origin = null;
        hide();
        _fromThread = true;
        try { if (typeof window.switchTab === 'function') window.switchTab('golden-thread'); } catch (_) {}
        // switchTab renders the view; if it did not, ask for the render directly.
        setTimeout(function () {
            _fromThread = false;
            try {
                if (_pendingKey && typeof window.renderGoldenThreadView === 'function') {
                    window.renderGoldenThreadView();
                }
            } catch (_) {}
        }, 60);
    }

    // ---- wrappers -----------------------------------------------------------
    function wrapEco() {
        if (typeof window._gtvShowEco !== 'function' || window._gtvShowEco._slReturnWrapped) return;
        var orig = window._gtvShowEco;
        var wrapped = function (key, graph) {
            // Honour a pending return: reopen the panel the user left, but only
            // if that node still exists in the freshly built graph.
            if (_pendingKey && graph && graph.nodes) {
                var has = graph.nodes.some(function (n) { return n.key === _pendingKey; });
                if (has) key = _pendingKey;
                _pendingKey = null;
            }
            try { _cur = _labelOf(graph, key); } catch (_) { _cur = null; }
            // NOT orig.apply(this, arguments): this module is strict, so
            // `arguments` is NOT linked to the parameters and the substituted
            // key above would be thrown away — the return handshake would
            // silently reopen the default node instead of the one you left.
            // The suite caught exactly that. Pass the resolved key explicitly.
            return orig.call(this, key, graph);
        };
        wrapped._slReturnWrapped = true;
        Object.keys(orig).forEach(function (k) { try { wrapped[k] = orig[k]; } catch (_) {} });
        window._gtvShowEco = wrapped;
    }

    function wrapEcoModal() {
        if (typeof window._gtvShowEcoModal !== 'function' || window._gtvShowEcoModal._slReturnWrapped) return;
        var orig = window._gtvShowEcoModal;
        var wrapped = function (key, graph) {
            try { _cur = _labelOf(graph, key); } catch (_) {}
            return orig.apply(this, arguments);
        };
        wrapped._slReturnWrapped = true;
        Object.keys(orig).forEach(function (k) { try { wrapped[k] = orig[k]; } catch (_) {} });
        window._gtvShowEcoModal = wrapped;
    }

    function wrapNavigate() {
        if (typeof window._gtvNavigateTo !== 'function' || window._gtvNavigateTo._slReturnWrapped) return;
        var orig = window._gtvNavigateTo;
        var wrapped = function (node) {
            var from = _cur;
            _fromThread = true;                       // suppress the clear in wrapSwitchTab
            var ok = false;
            try { ok = orig.apply(this, arguments); } finally { _fromThread = false; }
            if (ok && from && from.key) {
                // Jumping to the node you are already on is not a journey.
                if (!node || node.key !== from.key) {
                    _origin = from;
                    setTimeout(paint, 80);            // after the destination paints
                } else {
                    _origin = from;                   // the self-open door: still offer the way back
                    setTimeout(paint, 80);
                }
            }
            return ok;
        };
        wrapped._slReturnWrapped = true;
        Object.keys(orig).forEach(function (k) { try { wrapped[k] = orig[k]; } catch (_) {} });
        window._gtvNavigateTo = wrapped;
    }

    // A move the user made themselves ends the journey — drop the chip.
    function wrapSwitchTab() {
        if (typeof window.switchTab !== 'function' || window.switchTab._slReturnWrapped) return;
        var orig = window.switchTab;
        var wrapped = function (tabId) {
            if (!_fromThread) { _origin = null; hide(); }
            var r = orig.apply(this, arguments);
            if (tabId === 'golden-thread') { _origin = null; hide(); }
            return r;
        };
        wrapped._slReturnWrapped = true;
        Object.keys(orig).forEach(function (k) { try { wrapped[k] = orig[k]; } catch (_) {} });
        window.switchTab = wrapped;
    }

    function wrapAll() { wrapEco(); wrapEcoModal(); wrapNavigate(); wrapSwitchTab(); }

    if (typeof window !== 'undefined') {
        window.SL_NAV_RETURN = {
            _state: function () { return { origin: _origin, cur: _cur, pending: _pendingKey }; },
            _paint: paint, _hide: hide, _goBack: goBack, _wrap: wrapAll
        };
        wrapAll();
        // The golden-thread functions live in files that may load after this one;
        // re-attempt on a short poll, and stop once every wrapper is on.
        var tries = 0;
        var iv = setInterval(function () {
            wrapAll();
            var done = (typeof window._gtvShowEco === 'function' && window._gtvShowEco._slReturnWrapped)
                && (typeof window._gtvNavigateTo === 'function' && window._gtvNavigateTo._slReturnWrapped)
                && (typeof window.switchTab === 'function' && window.switchTab._slReturnWrapped);
            if (done || ++tries > 40) clearInterval(iv);
        }, 250);
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { _labelOf: _labelOf, CHIP_ID: CHIP_ID };
    }
})();
