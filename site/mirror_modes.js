// ============================================================================
// mirror_modes.js — v1.1 — C2: the allocation/verification mirror (22 Aug 2026).
// v1.1 (C2.1, live-UI-found): mode children mint displayIds (parent.M1, .M2, …) —
// the canvas badge rendered "undefined" without one.
//
// THE RULE (OPEN_ITEMS C2, three postures ruled by Waqas 22 Aug):
//   · Allocation leaf = item + EFFECT (an FMES group). It stops there — C3
//     (ruled): no mode-level targets, ever.
//   · The VERIFICATION mirror decomposes that same leaf into failure MODES:
//     an OR gate with one basic event per contributing FMEA row at
//     λ = that row's rate (α = the row's share of the group Σλ). Modes show
//     up in cutsets and importance — that is the point of a verification tree.
//   · The COORDINATE is lockstep, twin wins: the allocation side's
//     node.identity is authoritative and syncs onto the mirror twin (matched
//     by logicalId); modeIds are the ONE mirror-side field. The mirror never
//     re-declares what a thing IS.
//   · Controls live in TWO places, one mechanism: the FMES workbook (next to
//     "Apply Σλ") and the node properties panel on the mirror tree.
//
// NOTHING here invents FMEA content. The modes come from the authored FMEA
// piece-part rows that fmesGroups() already rolls up; decomposition merely
// unfolds the adoption that fmesAdopt() performed, at the same Σλ.
//
// Classic script on purpose: internalIdCounter / ftaPages / fmeaData are
// `let` script-globals (bindings_modules.js) that window/SLEnv cannot see —
// this file shares the lexical global scope like every other monolith file.
// ============================================================================
(function () {
    'use strict';

    function _pages() { return (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) ? ftaPages : []; }
    function _isMirror(p) { return !!(p && p.verifies); }
    function _twinPage(mirror) { return _pages().find(function (p) { return p && p.id === mirror.verifies; }) || null; }
    function _lidOf(n) { return n.logicalId != null ? n.logicalId : n.id; }
    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _toast(msg, kind, ms) { try { if (typeof showToast === 'function') showToast(msg, kind || 'info', ms || 3600); } catch (_) {} }
    function _fail(msg) { _toast(msg, 'warning', 4200); return false; }
    function _recalcSave() {
        try { if (typeof calculateAllProbabilities === 'function') calculateAllProbabilities(); } catch (_) {}
        try { if (typeof updateD3 === 'function') updateD3(); } catch (_) {}
        try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    }
    function _findByLid(root, lid) {
        var hit = null;
        (function walk(n) {
            if (!n || hit) return;
            if (String(_lidOf(n)) === String(lid)) { hit = n; return; }
            (n.children || n._children || []).forEach(walk);
        })(root);
        return hit;
    }
    function _findByNodeId(root, nodeId) {
        var hit = null;
        (function walk(n) {
            if (!n || hit) return;
            if (String(n.id) === String(nodeId)) { hit = n; return; }
            (n.children || n._children || []).forEach(walk);
        })(root);
        return hit;
    }
    function _group(key) {
        if (typeof fmesGroups !== 'function') return null;
        try { return (fmesGroups().groups || []).find(function (g) { return g.key === key; }) || null; } catch (_) { return null; }
    }

    // ---------------------------------------------------- lockstep (twin wins)
    // The allocation twin's identity is authoritative. modeIds stay mirror-side
    // (node_identity's own rule: modes belong to verification). Mode children
    // (synthetic §mode§ lids) have no twin and keep their own coordinate.
    function syncMirrorIdentity(mirrorPage) {
        if (!_isMirror(mirrorPage) || !mirrorPage.root) return 0;
        var src = _twinPage(mirrorPage);
        if (!src || !src.root) return 0;
        var changed = 0;
        (function walk(node) {
            if (!node) return;
            if (!node._fmesMode) {
                var twin = _findByLid(src.root, _lidOf(node));
                if (twin) {
                    if (twin.identity) {
                        var keep = (node.identity && Array.isArray(node.identity.modeIds)) ? node.identity.modeIds.slice() : null;
                        var copy = JSON.parse(JSON.stringify(twin.identity));
                        delete copy.modeIds;   // modes never live allocation-side; nothing to inherit here
                        if (keep && keep.length) copy.modeIds = keep;
                        if (JSON.stringify(copy) !== JSON.stringify(node.identity || null)) { node.identity = copy; changed++; }
                    } else if (node.identity) {
                        // Twin undeclared — the mirror follows (it cannot out-declare its twin).
                        delete node.identity; changed++;
                    }
                }
            }
            (node.children || node._children || []).forEach(walk);
        })(mirrorPage.root);
        return changed;
    }
    function syncAll() {
        var total = 0;
        _pages().forEach(function (p) { if (_isMirror(p)) total += syncMirrorIdentity(p); });
        return total;
    }

    // ------------------------------------------------------------- decompose
    function decompose(pageId, nodeId) {
        var page = _pages().find(function (p) { return p && p.id === pageId; });
        if (!page) return _fail('Page not found.');
        if (!_isMirror(page)) return _fail('Decomposition is verification-side only — the allocation tree stops at item + effect, and modes never carry targets (C3).');
        var node = _findByNodeId(page.root, nodeId);
        if (!node) return _fail('Node not found on this page.');
        if (node._fmesDecomposed) return _fail('Already decomposed — use Recompose to fold the modes back.');
        if (!node._fmesGroup) return _fail('Adopt an FMES group Σλ on this event first — the group defines the modes.');
        var g = _group(node._fmesGroup);
        if (!g) return _fail('The adopted FMES group no longer exists — re-adopt before decomposing.');
        if (!g.rows || !g.rows.length) return _fail('The FMES group has no FMEA rows.');
        // Twin wins AT THE MOMENT OF DECOMPOSITION — the mode children stamp the
        // coordinate they inherit, so it must be the twin's current one, not
        // whatever stale copy the mirror node happened to hold.
        syncMirrorIdentity(page);
        var lid = _lidOf(node);
        var kids = g.rows.map(function (r, i) {
            var rowId = String(r.fmeaId || r.internalId || ('row' + i));
            var rate = parseFloat(r.rate) || 0;
            var child = {
                id: (typeof internalIdCounter !== 'undefined') ? internalIdCounter++ : Date.now() + i,
                logicalId: String(lid) + '§mode§' + rowId,
                displayId: (node.displayId ? node.displayId : 'BE') + '.M' + (i + 1),
                type: 'basic',
                name: [r.part, r.mode].filter(Boolean).join(' — ') || ('Failure mode ' + rowId),
                lambda: rate, inputMode: 'lambda', probability: 0,
                _fmesMode: { group: g.key, row: rowId, alpha: g.sumRate > 0 ? rate / g.sumRate : 0 }
            };
            if (node.identity) {
                var idc = JSON.parse(JSON.stringify(node.identity));
                idc.modeIds = [rowId];
                child.identity = idc;
            }
            return child;
        });
        node.type = 'gate';
        node.gateType = 'OR';
        node._fmesDecomposed = { group: g.key, sumRate: g.sumRate, modes: kids.length, at: new Date().toISOString() };
        delete node.lambda;
        delete node.inputMode;
        node.probability = 0;
        node.children = kids;
        _recalcSave();
        _toast('Decomposed into ' + kids.length + ' failure mode(s), OR sum ' + g.sumRate.toExponential(3) + ' /h. Coordinate stays inherited from the allocation twin; modes live on the verification side only (C3 — never a target).', 'success', 5200);
        try { _renderPanel(); } catch (_) {}
        try { if (typeof renderFmesPage === 'function') renderFmesPage(); } catch (_) {}
        return true;
    }

    function recompose(pageId, nodeId) {
        var page = _pages().find(function (p) { return p && p.id === pageId; });
        if (!page) return _fail('Page not found.');
        var node = _findByNodeId(page.root, nodeId);
        if (!node || !node._fmesDecomposed) return _fail('This node is not decomposed.');
        var g = _group(node._fmesDecomposed.group);
        var lam = g ? g.sumRate : node._fmesDecomposed.sumRate;   // group gone → last known Σλ, honestly labelled
        node.type = 'basic';
        delete node.gateType;
        node.children = [];
        node.lambda = lam;
        node.inputMode = 'lambda';
        node.probability = 0;
        delete node._fmesDecomposed;
        _recalcSave();
        _toast(g ? 'Folded back to a single event at the group\'s current Σλ = ' + lam.toExponential(3) + ' /h.'
                 : 'Folded back at the LAST KNOWN Σλ = ' + (lam ? lam.toExponential(3) : '0') + ' /h — the FMES group no longer exists; the stale watcher will keep flagging until you re-adopt or clear.', g ? 'success' : 'warning', 5200);
        try { _renderPanel(); } catch (_) {}
        try { if (typeof renderFmesPage === 'function') renderFmesPage(); } catch (_) {}
        return true;
    }

    // ----------------------------------------------- FMES workbook cell button
    // Rendered by renderFmesPage's button cell. Only for a group whose single
    // linked BE is live-adopted on a VERIFICATION page.
    function fmesCellButton(g) {
        try {
            if (!g || !g.beIds || g.beIds.size !== 1) return '';
            if (typeof _fmesFindBe !== 'function') return '';
            var hit = _fmesFindBe(Array.from(g.beIds)[0]);
            if (!hit || !hit.page || !_isMirror(hit.page)) return '';
            if (hit.node._fmesGroup !== g.key && !(hit.node._fmesDecomposed && hit.node._fmesDecomposed.group === g.key)) return '';
            var btn = function (label, fn) {
                return ' <button class="ckpt-m-btn" style="font-size:11px; padding:2px 8px;" onclick="SLMirrorModes.' + fn + '(\'' + _esc(hit.page.id) + '\',\'' + _esc(String(hit.node.id)) + '\')">' + label + '</button>';
            };
            return hit.node._fmesDecomposed ? btn('Recompose', 'recompose') : btn('Decompose modes', 'decompose');
        } catch (_) { return ''; }
    }

    // -------------------------------------------------- node properties panel
    // Injected above the input-mode block (same host + discipline as the CCF
    // independence panel). Shown for mirror nodes that carry an adoption, a
    // decomposition, or ARE a mode child.
    function _panelHtml(node, page) {
        if (!node || !page || !_isMirror(page)) return '';
        var base = 'padding:8px 12px; font-size:12px; border-left:3px solid ';
        if (node._fmesMode) {
            var pct = Math.round((node._fmesMode.alpha || 0) * 1000) / 10;
            return '<div style="' + base + 'var(--color-info, #2f6df6);">' +
                '<b>Failure mode</b> — α = ' + pct + '% of its FMES group\'s Σλ. ' +
                'The item + effect coordinate is inherited from the allocation twin and is read-only here; the mode is this node\'s own (C2). Modes never carry targets (C3).</div>';
        }
        if (node._fmesDecomposed) {
            var d = node._fmesDecomposed;
            return '<div style="' + base + 'var(--color-success, #2e7d32);">' +
                '<b>Decomposed</b> — ' + d.modes + ' failure mode(s) from FMES group, OR sum ' + (d.sumRate ? d.sumRate.toExponential(3) : '?') + ' /h. Coordinate lockstep with the allocation twin.' +
                '<div style="margin-top:6px;"><button class="ckpt-m-btn" style="font-size:11px; padding:2px 10px;" onclick="SLMirrorModes.recompose(\'' + _esc(page.id) + '\',\'' + _esc(String(node.id)) + '\')">Recompose</button></div></div>';
        }
        if (node._fmesGroup && (node.type === 'basic' || node.type === 'undeveloped')) {
            var g = _group(node._fmesGroup);
            return '<div style="' + base + '#B7791F;">' +
                '<b>Adopted FMES Σλ</b>' + (g ? ' — ' + g.rows.length + ' contributing mode(s)' : ' — group missing') + '. ' +
                'Decompose to see each failure mode as its own event at λ×α, in cutsets and importance.' +
                '<div style="margin-top:6px;"><button class="ckpt-m-btn" style="font-size:11px; padding:2px 10px;" onclick="SLMirrorModes.decompose(\'' + _esc(page.id) + '\',\'' + _esc(String(node.id)) + '\')">Decompose into modes…</button></div></div>';
        }
        return '';
    }
    function _renderPanel(dataNode) {
        try {
            var host = document.getElementById('config-input-mode-container');
            if (!host || !host.parentNode) return;
            var div = document.getElementById('mirror-modes-panel');
            if (!div) {
                div = document.createElement('div');
                div.id = 'mirror-modes-panel';
                div.style.cssText = 'margin-top:12px;';
                host.parentNode.insertBefore(div, host);
            }
            var node = dataNode || (typeof selectedNodeData !== 'undefined' ? selectedNodeData : null);
            var page = _pages().find(function (p) { return typeof activeFTAPageId !== 'undefined' && p && p.id === activeFTAPageId; });
            var html = _panelHtml(node, page);
            if (!html) { div.style.display = 'none'; div.innerHTML = ''; return; }
            div.style.display = 'block';
            div.innerHTML = '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1);">' +
                '<div style="padding:6px 12px; border-bottom:1px solid var(--color-border-strong); font-size:11px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase;">Verification mirror (C2)</div>' +
                html + '</div>';
        } catch (_) {}
    }

    // ------------------------------------------------------------------ wiring
    // Lockstep at the moments that matter: opening a node on a mirror page, and
    // every ownership sync of a mirror from its source. Wrap-preserve discipline.
    (function wire() {
        if (typeof window === 'undefined') return;
        if (typeof window.selectNode === 'function' && !window.selectNode._c2Wrapped) {
            var orig = window.selectNode;
            var wrapped = function (dataNode) {
                var r = orig.apply(this, arguments);
                try {
                    var page = _pages().find(function (p) { return typeof activeFTAPageId !== 'undefined' && p && p.id === activeFTAPageId; });
                    if (page && _isMirror(page)) syncMirrorIdentity(page);
                    _renderPanel(dataNode);
                } catch (_) {}
                return r;
            };
            wrapped._c2Wrapped = true;
            window.selectNode = wrapped;
        }
        if (typeof window._syncMirrorOwnershipFromSource === 'function' && !window._syncMirrorOwnershipFromSource._c2Wrapped) {
            var origSync = window._syncMirrorOwnershipFromSource;
            var wrappedSync = function (sourcePage) {
                var r = origSync.apply(this, arguments);
                try {
                    var mirror = sourcePage && _pages().find(function (p) { return p && p.verifies === sourcePage.id; });
                    if (mirror) syncMirrorIdentity(mirror);
                } catch (_) {}
                return r;
            };
            wrappedSync._c2Wrapped = true;
            window._syncMirrorOwnershipFromSource = wrappedSync;
        }
    })();

    var API = {
        syncMirrorIdentity: syncMirrorIdentity, syncAll: syncAll,
        decompose: decompose, recompose: recompose,
        fmesCellButton: fmesCellButton,
        _panelHtml: _panelHtml
    };
    if (typeof window !== 'undefined') window.SLMirrorModes = API;
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
