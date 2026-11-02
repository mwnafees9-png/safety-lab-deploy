/* fmea_modes.js v1.0 (2 Nov 2026): failure modes per part type, from the library, with no AI (item 48).
 *
 * Waqas, 2 Nov 2026: "yes lets get the rest done", on this scope: a new "Add modes from the library" button fills each
 * basic event's modes and rates straight from the split, imported first, built-in second; no duplicates; the engineer
 * adds the effects. ANEM names modes only where no split was loaded, and never outputs a number.
 *
 *   plan(systemId): for every basic event in that system's fault trees whose part is in the library and has a split
 *     (library_byol.js splitFor: the customer's imported split, else the built-in public table), one piece-part row per
 *     mode: linked to the event (beId) and the part (parentLibKey), share alphaFm, rate = share x the part's rate (the
 *     same rate the fault tree uses for that part), and the split's source (modeSource). A mode the event already has a
 *     row for is not planned again (the no duplicates rule), and neither is a second event with the same logical id.
 *   add(systemId): writes the plan into the FMEA, filed under the system. Effects, detection and severity stay blank
 *     for the engineer (or for ANEM's draft, which fills them in place).
 *   noSplit(systemId): the events whose part has no split: the ones ANEM may name modes for.
 *   clash(beId, mode): the piece-part row that already covers this event and mode, if any.
 * Run the test: node tests/regression_fmea_modes_20261102.test.js
 */
(function (root) {
    'use strict';
    function S(v) { return String(v == null ? '' : v).trim(); }
    function norm(v) { return S(v).replace(/\s+/g, ' ').toLowerCase(); }
    function E(v) { return S(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _rows() { try { if (typeof fmeaData !== 'undefined' && Array.isArray(fmeaData)) return fmeaData; } catch (_) {} return []; }
    function _pages() {
        try { if (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) return ftaPages.filter(function (p) { return p && p.root && !(p.integrated && p.integrated.sourcePageId != null); }); } catch (_) {}
        return [];
    }
    function _lib() { try { if (typeof getActiveLibrary === 'function') return getActiveLibrary(); } catch (_) {} return {}; }
    function _B() { return root.SLLibraryByol || null; }
    function _kids(n) { return (n && (n.children || n._children)) || []; }

    // the basic events of one system's trees, once each (by logical id when the tree repeats an event)
    function events(systemId) {
        var out = [], seen = {};
        _pages().forEach(function (p) {
            if (S(p.systemId) !== S(systemId)) return;
            (function w(n) {
                if (!n) return;
                if (n.type === 'basic' && n.id != null) {
                    var k = S(n.logicalId != null && n.logicalId !== '' ? n.logicalId : n.id);
                    if (!seen[k]) { seen[k] = 1; out.push({ node: n, page: p }); }
                }
                _kids(n).forEach(w);
            })(p.root);
        });
        return out;
    }
    function _sameEvent(row, node) {
        var b = S(row.beId); if (!b) return false;
        return b === S(node.id) || (node.logicalId != null && b === S(node.logicalId)) || (node.displayId && b === S(node.displayId));
    }
    function clash(node, mode) {
        var k = norm(mode); if (!k) return null;
        var rs = _rows();
        for (var i = 0; i < rs.length; i++) {
            var r = rs[i];
            if ((r.fmeaType || 'piece-part') !== 'piece-part') continue;
            if (_sameEvent(r, node) && norm(r.mode) === k) return r;
        }
        return null;
    }

    function plan(systemId) {
        var B = _B(), lib = _lib(), out = [], already = 0, noSplit = [];
        if (!B) return { rows: out, already: 0, noSplit: noSplit };
        events(systemId).forEach(function (ev) {
            var n = ev.node, key = S(n.libraryKey), e = key ? lib[key] : null;
            // 2 Nov 2026 (item 48, the rest): the split first; else the part's mode names (no share, no rate)
            var sp = e ? (B.modesFor ? B.modesFor(key) : B.splitFor(key)) : null;
            if (!sp) { noSplit.push(ev); return; }
            var lam = B.partLambda(key), named = sp.from === 'named';
            sp.modes.forEach(function (m) {
                if (clash(n, m.mode)) { already++; return; }
                var a = named ? null : Number(m.alphaFm);
                out.push({
                    fmeaType: 'piece-part', scope: 'system', owningSystemId: systemId,
                    beId: n.id, parentLibKey: key, part: S(n.name) || S(e.name) || key, mode: S(m.mode),
                    alphaFm: a, rate: (!named && lam > 0) ? lam * a : 0, modeSource: named ? '' : (S(m.source || sp.source) || (sp.from === 'imported' ? 'imported split' : 'built-in split')),
                    localEffect: '', nextEffect: '', endEffect: '', detection: '', severity: '', compensating: '',
                    remarks: named ? ('Mode name from the library for ' + (S(e.name) || key) + '. No share yet, so no rate: enter the shares with their source on the library part.')
                                   : ('Mode and share from the library split for ' + (S(e.name) || key) + (lam > 0 ? '' : '. The part has no rate yet, so the mode rate is blank') + '.')
                });
            });
        });
        return { rows: out, already: already, noSplit: noSplit };
    }
    function noSplit(systemId) { return plan(systemId).noSplit; }

    function _mintId() {
        var ids = {}; _rows().forEach(function (r) { if (r && r.fmeaId) ids[S(r.fmeaId)] = 1; });
        var c = 1; try { if (typeof fmeaCounter !== 'undefined') c = fmeaCounter; } catch (_) {}
        var id;
        do { id = 'FMEA-PP-' + String(c++).padStart(3, '0'); } while (ids[id]);
        try { if (typeof fmeaCounter !== 'undefined') fmeaCounter = c; } catch (_) {}   // the project's counter (bindings_modules.js), saved and synced
        return id;
    }
    function _newRowId() { try { if (typeof newRowId === 'function') return newRowId(); } catch (_) {} return 'fm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

    function add(systemId) {
        var p = plan(systemId), rs = _rows();
        var at = new Date().toISOString();
        p.rows.forEach(function (r) {
            r.internalId = _newRowId(); r.fmeaId = _mintId(); r.time = 0; r.prob = 0;
            r.fromLibrarySplit = true; r.createdAt = at;
            rs.push(r);
        });
        if (p.rows.length) {
            try { if (typeof renderFMEA === 'function') renderFMEA(); } catch (_) {}
            try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        }
        return { added: p.rows.length, already: p.already, noSplit: p.noSplit.length };
    }

    // ---- the bar on the piece-part FMEA (the FMEA is per system: the open system folder) ----
    function _activeSystem() { try { if (typeof activeSystemId !== 'undefined') return S(activeSystemId); } catch (_) {} return ''; }
    function renderBar() {
        var d = root.document; if (!d) return;
        var host = d.getElementById('fmea-lib-modes-host'); if (!host) return;
        var pp = d.getElementById('fmea-mode-piecepart');
        var sid = _activeSystem();
        var p = (pp && pp.classList.contains('active') && sid) ? plan(sid) : null;
        if (!p || (!p.rows.length && !p.already && !p.noSplit.length)) { host.style.display = 'none'; host.innerHTML = ''; return; }
        host.style.display = 'flex';
        var nEv = {}; p.rows.forEach(function (r) { nEv[S(r.beId)] = 1; });
        host.innerHTML = '<span style="font-size:12.5px;color:var(--color-text-secondary);flex:1 1 300px;">' +
            (p.rows.length ? p.rows.length + ' failure mode' + (p.rows.length === 1 ? '' : 's') + ' for ' + Object.keys(nEv).length + ' basic event' + (Object.keys(nEv).length === 1 ? '' : 's') + ' can be filled from the library split (your imported split first, then the built-in one). You add the effects.'
                           : 'Every basic event with a library split already has its modes in the FMEA.') +
            (p.noSplit.length ? ' ' + p.noSplit.length + ' basic event' + (p.noSplit.length === 1 ? ' has' : 's have') + ' no split: draft those modes with ANEM or type them.' : '') + '</span>' +
            (p.rows.length ? '<button type="button" class="action-btn btn-cyan" onclick="SLFmeaModes.ui.add()">Add modes from the library</button>' : '');
    }
    function _toast(m, k, ms) { try { if (typeof showToast === 'function') showToast(m, k || 'info', ms || 5000); } catch (_) {} }
    var ui = {
        add: function () {
            var sid = _activeSystem(); if (!sid) return;
            var r = add(sid), bits = [];
            bits.push(r.added ? r.added + ' mode row' + (r.added === 1 ? '' : 's') + ' added' : 'No new mode rows');
            if (r.already) bits.push(r.already + ' already in the FMEA, left as they are');
            if (r.noSplit) bits.push(r.noSplit + ' basic event' + (r.noSplit === 1 ? ' has' : 's have') + ' no library split: draft those modes with ANEM or type them');
            _toast(bits.join('. ') + '.', r.added ? 'success' : 'info', 7000);
            renderBar();
        }
    };

    root.SLFmeaModes = { VERSION: '1.0', events: events, plan: plan, add: add, noSplit: noSplit, clash: clash, renderBar: renderBar, ui: ui };
})(typeof window !== 'undefined' ? window : globalThis);
