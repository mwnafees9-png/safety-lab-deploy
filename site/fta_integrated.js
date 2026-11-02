// fta_integrated.js: SLFtaIntegrated 1.0
//
// 1 Nov 2026 (customer checklist item 42, Waqas: "we should allow the user to create an integrated tree which is a read
// only tree"). A fault tree is often split across several pages with transfer gates. An INTEGRATED tree is the whole
// thing in one piece: the engineer picks a top event (a tree), names it, and the app follows every transfer, at any
// depth, and builds one tree with every transferred branch in place.
//
//   - read only: nothing on it can be edited (the edit buttons are refused, the canvas and the properties box are
//     locked), and every calculation rebuilds it from its sources, so it can never drift from them;
//   - refreshes itself: when any tree it is built from changes, the next calculation rebuilds it;
//   - its own results: it is an ordinary tree to the engines (cut sets, exact probability, importance), calculated
//     from the values on its sources, so it is never allocated on its own;
//   - goes into reports like any other tree (the appendix draws it whole);
//   - on the Golden Thread: linked to its source's failure conditions and to every tree it is built from;
//   - never through a circular transfer (fta_loops.js): it cannot be built through one, and when a source becomes
//     circular it shows "No result: circular transfer" until the circle is broken.
//
// An event keeps its logical identity: the same event reached through two transfers is one event, counted once.
// Every node carries sourceRef { pageId, nodeId } back to where it lives. The integrated page is a view: AutoReq,
// the cross-tree strictest pass, common cause detection and the other cross-tree checks skip it (isIntegrated), so
// nothing is generated or counted twice.
//
// Page shape: { id, name, mode: 'bottom-up', integrated: { sourcePageId, sources: [pageId], sig, rootSig, blocked,
// missing }, treeLevel, systemId, missionProfileId (copied from the source on every rebuild), root }.
//
// API (window.SLFtaIntegrated): isIntegrated(page), sourceOf(page), build(page), refresh(), create(sourceId, name),
// open() (the dialog), afterRender(), integratedOf(pageId) (the integrated trees built from or through a page),
// guard(name) (true when an edit must be refused on the open tree).
(function () {
    'use strict';
    var VERSION = '1.0';

    function _pages() { try { if (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) return ftaPages; } catch (_) {} return []; }
    function _activeId() { try { return (typeof activeFTAPageId !== 'undefined') ? activeFTAPageId : null; } catch (_) { return null; } }
    function _byId(id) { var ps = _pages(); for (var i = 0; i < ps.length; i++) if (ps[i] && String(ps[i].id) === String(id)) return ps[i]; return null; }
    function _isTransfer(n) { return !!n && (n.gateType === 'TRANSFER' || !!n.transferOutTo); }
    function _target(n) { var t = n.transferOutTo || n.linkedPageId; return t == null || t === '' ? null : t; }
    function _kids(n) { return (n && (n.children || n._children)) || []; }
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function _toast(msg, kind, ms) { try { if (typeof showToast === 'function') showToast(msg, kind || 'info', ms || 4200); } catch (_) {} }
    function _loops() { try { return (typeof window !== 'undefined' && window.SLFtaLoops) ? window.SLFtaLoops : null; } catch (_) { return null; } }

    function isIntegrated(p) { return !!(p && p.integrated && p.integrated.sourcePageId != null); }
    function sourceOf(p) { return isIntegrated(p) ? _byId(p.integrated.sourcePageId) : null; }

    // a node's own content: every field except the tree links and the values the app derives (underscore fields)
    function _own(n) {
        var o = {};
        Object.keys(n).sort().forEach(function (k) { if (k === 'children' || k === '_children' || k.charAt(0) === '_') return; o[k] = n[k]; });
        return o;
    }
    // everything the integrated tree is made of: the source tree and every tree it transfers into, as they are now
    function _sourceSig(src) {
        var parts = [], seen = new Set();
        (function walk(n, depth) {
            if (!n || seen.has(n) || depth > 5000) return; seen.add(n);
            var own = _own(n);
            if (n.type === 'gate') { delete own.probability; delete own.lambda; delete own.lambdaByPhase; }   // a gate's result is the calculation's, not an input
            parts.push(JSON.stringify(own));
            if (_isTransfer(n)) { var tp = _byId(_target(n)); parts.push('{' + (tp ? String(tp.id) + ':' + (tp.name || '') : '-') + '}'); if (tp && tp.root) walk(tp.root, depth + 1); }
            var k = _kids(n); parts.push('[' + k.length); k.forEach(function (c) { walk(c, depth + 1); }); parts.push(']');
        })(src.root, 0);
        return _hash(String(src.id) + '|' + (src.treeLevel || '') + '|' + (src.systemId || '') + '|' + (src.missionProfileId || '') + '|' + parts.join(''));
    }
    // the integrated tree's own content (an edit that slipped past the locks shows here, and is rebuilt away)
    // what an engineer could type on a node; the values the calculation writes back (gate results, DAL) are left out,
    // so a calculation never looks like an edit
    var EDITABLE = ['type', 'gateType', 'name', 'displayId', 'votingK', 'logicalId', 'eventClass', 'ccfGroup', 'beta', 'gamma', 'delta', 'inputMode', 'repairModel', 'mu', 'tau', 'dalIndependence', 'transferOutTo', 'linkedPageId'];
    function _edits(n) {
        var o = {};
        EDITABLE.forEach(function (k) { if (n[k] !== undefined) o[k] = n[k]; });
        if (n.type !== 'gate') { o.p = n.probability; o.l = n.lambda; }
        return o;
    }
    function _rootSig(root) {
        var parts = [];
        (function walk(n) { if (!n) return; parts.push(JSON.stringify(_edits(n))); var k = _kids(n); parts.push('[' + k.length); k.forEach(walk); parts.push(']'); })(root);
        return _hash(parts.join(''));
    }
    // the signatures are kept as a short hash on the page, never the content itself (the saved project stays small)
    function _hash(str) {
        var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
        for (var i = 0; i < str.length; i++) { var ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16) + ':' + str.length;
    }
    function _safe(s) { return String(s).replace(/[^A-Za-z0-9_-]/g, '_'); }
    function _clone(v) { return (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v; }

    // the whole tree in one piece: every transfer replaced by the tree it points at
    function _assemble(intPage, src) {
        var used = [], seq = new Map();
        function occ(pid) { var k = String(pid); var n = (seq.get(k) || 0) + 1; seq.set(k, n); return k + (n > 1 ? '_' + n : ''); }
        function cl(n, pageKey, pageId) {
            if (_isTransfer(n)) {
                var tp = _byId(_target(n));
                if (tp && tp.root) {
                    if (used.indexOf(String(tp.id)) === -1) used.push(String(tp.id));
                    var sub = cl(tp.root, occ(tp.id), tp.id);
                    sub.intFrom = { pageId: String(tp.id), name: tp.name || String(tp.id), viaNodeId: n.id, viaPageId: String(pageId) };
                    return sub;
                }
            }
            var c = {};
            Object.keys(n).forEach(function (k) { if (k === 'children' || k === '_children' || k.charAt(0) === '_') return; c[k] = _clone(n[k]); });
            c.id = _safe('int-' + intPage.id + '-' + pageKey + '-' + n.id);
            if (n.type !== 'gate') c.logicalId = (n.logicalId != null) ? n.logicalId : n.id;   // one event, however many transfers reach it
            c.sourceRef = { pageId: String(pageId), nodeId: n.id };
            delete c.transferOutTo; delete c.linkedPageId;
            var k = _kids(n);
            c.children = k.map(function (x) { return cl(x, pageKey, pageId); });
            return c;
        }
        var root = cl(src.root, occ(src.id), src.id);
        return { root: root, sources: [String(src.id)].concat(used) };
    }
    function _placeholder(intPage, src, why, loop) {
        // on a circle the placeholder is a transfer to the source, so the engines refuse it and fta_loops.js stamps it like any
        // tree that transfers into a circle: no number anywhere
        var r = { id: _safe('int-' + intPage.id + '-top'), type: 'gate', gateType: loop ? 'TRANSFER' : 'OR', displayId: (src && src.root && src.root.displayId) || 'TOP', name: (src && src.root && src.root.name) || intPage.name || 'Integrated tree', children: [], probability: 0 };
        if (loop) { r._circular = { loop: loop, inLoop: false }; r.transferOutTo = src.id; }
        if (why && !loop) r.intNote = why;
        return r;
    }

    // rebuild one integrated tree when its sources (or its own content) changed; returns true when it was rebuilt
    function build(p) {
        if (!isIntegrated(p)) return false;
        var I = p.integrated, src = sourceOf(p);
        if (!src || !src.root) {
            if (!I.missing) { I.missing = true; delete I.blocked; I.sig = ''; p.root = _placeholder(p, null, 'The tree this integrated tree was built from has been deleted.'); I.rootSig = _rootSig(p.root); return true; }
            return false;
        }
        var L = _loops(), loop = L ? L.loopFor(src) : null;
        if (loop) {
            var path = L.path(loop);
            if (I.blocked !== path) { I.blocked = path; delete I.missing; I.sig = ''; p.root = _placeholder(p, src, L.message(loop), loop); I.rootSig = _rootSig(p.root); return true; }
            if (p.root && !p.root._circular) p.root._circular = { loop: loop, inLoop: false };   // stamp() ran first and cleared it
            return false;
        }
        var sig = _sourceSig(src);
        if (!I.blocked && !I.missing && I.sig === sig && p.root && I.rootSig === _rootSig(p.root)) return false;
        var a = _assemble(p, src);
        p.root = a.root;
        p.mode = 'bottom-up';
        p.treeLevel = src.treeLevel || 'standalone';
        if (src.systemId != null) p.systemId = src.systemId; else delete p.systemId;
        p.missionProfileId = src.missionProfileId || '';
        I.sources = a.sources; I.sig = sig; I.rootSig = _rootSig(p.root);
        delete I.blocked; delete I.missing;
        return true;
    }
    var _busy = false;
    function refresh() {
        if (_busy) return 0;
        _busy = true;
        var n = 0;
        try { _pages().forEach(function (p) { if (isIntegrated(p)) { try { if (build(p)) n++; } catch (e) { try { if (window.SLErrorWatch) window.SLErrorWatch.report(e, 'fta_integrated'); } catch (_) {} } } }); }
        finally { _busy = false; }
        return n;
    }
    // the integrated trees built from, or through, a page
    function integratedOf(pageId) {
        var id = String(pageId);
        return _pages().filter(function (p) { return isIntegrated(p) && ((p.integrated.sources || []).indexOf(id) !== -1 || String(p.integrated.sourcePageId) === id); });
    }

    function create(sourceId, name) {
        var src = _byId(sourceId);
        if (!src || !src.root) return { ok: false, why: 'Pick the tree whose top event the integrated tree starts from.' };
        if (isIntegrated(src)) return { ok: false, why: 'That is already an integrated tree. Pick the tree it was built from.' };
        var nm = String(name || '').trim();
        if (!nm) return { ok: false, why: 'Give the integrated tree a name.' };
        if (_pages().some(function (p) { return p && String(p.name || '').trim().toLowerCase() === nm.toLowerCase(); })) return { ok: false, why: 'A tree called "' + nm + '" already exists. Pick another name.' };
        var L = _loops(), loop = L ? L.loopFor(src) : null;
        if (loop) return { ok: false, why: 'This tree cannot be integrated: it runs through a circular transfer (' + L.path(loop) + '). Break the circle first.' };
        var hasTransfer = false;
        (function w(n) { if (!n || hasTransfer) return; if (_isTransfer(n) && _byId(_target(n))) hasTransfer = true; _kids(n).forEach(w); })(src.root);
        if (!hasTransfer) return { ok: false, why: '"' + (src.name || 'This tree') + '" has no transfer gates, so it is already in one piece. There is nothing to integrate.' };
        var page = { id: 'page-int-' + Date.now() + '-' + Math.floor(Math.random() * 1e6), name: nm, mode: 'bottom-up', integrated: { sourcePageId: String(src.id) }, root: null };
        build(page);
        _pages().push(page);
        return { ok: true, page: page };
    }

    // ---- the dialog ------------------------------------------------------------------------------------------
    function _candidates() {
        return _pages().filter(function (p) {
            if (!p || !p.root || isIntegrated(p)) return false;
            var t = false; (function w(n) { if (!n || t) return; if (_isTransfer(n) && _byId(_target(n))) t = true; _kids(n).forEach(w); })(p.root);
            return t;
        });
    }
    function close() { var m = document.getElementById('sl-int-modal'); if (m) m.remove(); }
    function open(preselectId) {
        close();
        var cands = _candidates();
        var act = _byId(_activeId());
        var pre = preselectId != null ? String(preselectId) : (act && cands.indexOf(act) !== -1 ? String(act.id) : (cands[0] ? String(cands[0].id) : ''));
        var wrap = document.createElement('div');
        wrap.id = 'sl-int-modal';
        wrap.className = 'sl-int-modal';
        wrap.innerHTML = '<div class="sl-int-card" role="dialog" aria-modal="true" aria-labelledby="sl-int-title">' +
            '<h3 id="sl-int-title">New integrated tree</h3>' +
            '<p class="sl-int-help">Pick a top event. The app follows every transfer gate under it, at any depth, and builds the whole tree in one piece. It is read only and rebuilds itself whenever a tree it is built from changes.</p>' +
            (cands.length ? '' : '<p class="sl-int-none">No tree in this project has transfer gates yet, so there is nothing to integrate.</p>') +
            '<label class="sl-int-label" for="sl-int-src">Top event</label>' +
            '<select id="sl-int-src" data-int-src' + (cands.length ? '' : ' disabled') + '>' + cands.map(function (p) {
                var top = (p.root && (p.root.displayId ? p.root.displayId + ' ' : '') + (p.root.name || '')) || '';
                return '<option value="' + _esc(p.id) + '"' + (String(p.id) === pre ? ' selected' : '') + '>' + _esc((p.name || p.id) + (top ? ' : ' + top : '')) + '</option>';
            }).join('') + '</select>' +
            '<label class="sl-int-label" for="sl-int-name">Name</label>' +
            '<input id="sl-int-name" data-int-name type="text" autocomplete="off" spellcheck="false" placeholder="For example: Loss of pitch control, integrated">' +
            '<div class="sl-int-err" data-int-err role="alert"></div>' +
            '<div class="sl-int-actions"><button type="button" class="action-btn" data-int-cancel>Cancel</button><button type="button" class="action-btn btn-cyan" data-int-build' + (cands.length ? '' : ' disabled') + '>Build integrated tree</button></div>' +
            '</div>';
        document.body.appendChild(wrap);
        var sel = wrap.querySelector('[data-int-src]'), nm = wrap.querySelector('[data-int-name]'), err = wrap.querySelector('[data-int-err]');
        function suggest() { var p = _byId(sel && sel.value); if (p && !nm._typed) nm.value = (p.name || 'Tree') + ' (integrated)'; }
        if (sel) sel.addEventListener('change', suggest);
        nm.addEventListener('input', function () { nm._typed = true; });
        suggest();
        wrap.querySelector('[data-int-cancel]').onclick = close;
        wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
        wrap.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); if (e.key === 'Enter' && e.target === nm) go(); });
        function go() {
            var r = create(sel && sel.value, nm.value);
            if (!r.ok) { err.textContent = r.why; return; }
            close();
            try {
                activeFTAPageId = r.page.id;
                if (typeof syncFtaConfigFromActivePage === 'function') syncFtaConfigFromActivePage();
                if (typeof calculateAllProbabilities === 'function') calculateAllProbabilities();
                if (typeof renderFTASidebar === 'function') renderFTASidebar();
                if (typeof updateD3 === 'function') updateD3();
                if (typeof fitToScreen === 'function') setTimeout(fitToScreen, 60);
                if (typeof scheduleAutosave === 'function') scheduleAutosave();
            } catch (_) {}
            _toast('Integrated tree "' + r.page.name + '" built from ' + (r.page.integrated.sources || []).length + ' trees. It is read only and rebuilds itself when they change.', 'success', 5200);
        }
        wrap.querySelector('[data-int-build]').onclick = go;
        setTimeout(function () { try { (nm || sel).focus(); nm.select(); } catch (_) {} }, 30);
        return wrap;
    }

    // ---- read only -------------------------------------------------------------------------------------------
    function activeIsIntegrated() { return isIntegrated(_byId(_activeId())); }
    var GUARDED = ['addTopEvent', 'addSelectedGate', 'addSelectedEvent', 'pasteAsChild', 'pasteSpecial', 'transferOutSelectedGate',
        'integrateSelectedTransferredSubtree', 'deleteSelectedNode', 'updateNodeData', 'updateNodeDataInline', 'runDALAllocation',
        'createVerificationTreeFromActive'];
    var GUARDED_EDIT = ['applyEdit', 'connect', 'disconnect', 'moveFree', 'deleteFree', 'disconnectSelected', 'addFromPalette', 'setMetric', 'metricCommit', 'setItemLink', 'setSysmlRef', 'setNonCoherent'];
    var _lastRefusal = 0;
    function _refuse() {
        var now = Date.now();
        if (now - _lastRefusal > 1500) { _lastRefusal = now; _toast('This is an integrated tree: it is read only. Make the change on the tree it comes from and it rebuilds itself.', 'warning', 4200); }
        return null;
    }
    function guard() { return activeIsIntegrated(); }
    function _wrapGlobals() {
        GUARDED.forEach(function (name) {
            var f = window[name];
            if (typeof f !== 'function' || f.__slIntGuard) return;
            var w = function () { if (activeIsIntegrated()) return _refuse(); return f.apply(this, arguments); };
            w.__slIntGuard = true; w.__slIntOrig = f;
            try { window[name] = w; } catch (_) {}
        });
        var E = window.SLFtaEdit;
        if (E && !E.__slIntGuard) {
            GUARDED_EDIT.forEach(function (name) {
                var f = E[name]; if (typeof f !== 'function') return;
                E[name] = function () { if (activeIsIntegrated()) return _refuse(); return f.apply(this, arguments); };
            });
            E.__slIntGuard = true;
        }
    }
    // after every render of the canvas: the lock and the banner follow the tree on screen
    function afterRender() {
        _wrapGlobals();
        var on = activeIsIntegrated();
        try { document.body.classList.toggle('sl-fta-integrated', on); } catch (_) {}
        var bar = document.getElementById('sl-int-banner');
        if (!on) { if (bar) bar.remove(); return; }
        var p = _byId(_activeId()), src = sourceOf(p), I = p.integrated;
        var tb = document.querySelector('.fta-toolbar');
        if (!bar && tb && tb.parentNode) { bar = document.createElement('div'); bar.id = 'sl-int-banner'; bar.className = 'sl-int-banner'; tb.parentNode.insertBefore(bar, tb); }
        if (!bar) return;
        var names = (I.sources || []).map(function (id) { var x = _byId(id); return x ? (x.name || id) : id; });
        var state = I.missing ? '<b>Its source tree has been deleted.</b> Delete this integrated tree, or build a new one.'
            : I.blocked ? '<b class="sl-int-bad">No result: circular transfer (' + _esc(I.blocked) + ').</b> Break the circle and it rebuilds itself.'
            : 'Built from ' + names.length + ' trees: ' + names.map(_esc).join(', ') + '.';
        bar.innerHTML = '<span class="sl-int-pill">Integrated, read only</span> <span>' + state + ' It rebuilds itself whenever one of them changes. Edit the trees it comes from.</span>' +
            (src ? ' <button type="button" class="action-btn" data-int-goto="' + _esc(src.id) + '">Open "' + _esc(src.name || src.id) + '"</button>' : '');
        var b = bar.querySelector('[data-int-goto]');
        if (b) b.onclick = function () {
            try {
                activeFTAPageId = b.getAttribute('data-int-goto');
                if (typeof syncFtaConfigFromActivePage === 'function') syncFtaConfigFromActivePage();
                if (typeof calculateAllProbabilities === 'function') calculateAllProbabilities();
                if (typeof renderFTASidebar === 'function') renderFTASidebar();
                if (typeof updateD3 === 'function') updateD3();
            } catch (_) {}
        };
    }

    var api = { VERSION: VERSION, isIntegrated: isIntegrated, sourceOf: sourceOf, build: build, refresh: refresh, create: create, open: open, close: close, afterRender: afterRender, integratedOf: integratedOf, guard: guard, _sourceSig: _sourceSig };
    try { if (typeof window !== 'undefined') { window.SLFtaIntegrated = api; window.slIsIntegratedPage = isIntegrated; } } catch (_) {}
    try { if (typeof module !== 'undefined' && module.exports) module.exports = api; } catch (_) {}
})();
