// ============================================================================
// fta_proposals.js — v1.0 — CRA structural repairs as DRAFT-AND-ACCEPT
// proposals (23 Aug 2026, Waqas's ruling: anything that edits an EXISTING
// tree needs a signature; only brand-new skeletons may appear on their own).
//
// THE DEFEAT THIS REPAIRS: the Common Resource Analysis (B.4.3.2) finds a
// resource failure mode whose consumers include two or more members of the
// same Independence-Principle claim — one bus failure quietly defeats the
// redundancy an AND gate is crediting. The CRA names the collision and, by
// its own doctrine, never edits the tree. This module carries the finding
// the last mile AS A PROPOSAL:
//
//     AND(A, B)   →   OR( AND(A, B), «Common resource — <res> · <mode>» )
//
// which is cutset-equivalent to giving every leg an OR with the resource
// ({A,B} and {R}) — the single-point defeat becomes visible, quantified once
// the user enters the resource's λ (it seeds at 0 — numbers are the user's).
//
// DISCIPLINE:
//   · the SWEEP is deterministic and idempotent (proposal id = the finding's
//     coordinates; re-sweeps never duplicate);
//   · ACCEPT is signed, and refuses if the gate changed since the proposal
//     was drawn (fingerprint of gate type + member lids) — "tree changed
//     since proposed" is a refusal, not a merge;
//   · DISMISS needs a rationale (≥10 chars) and a name, and stays visible;
//   · a proposal whose finding or gate vanished WITHDRAWS itself;
//   · an accepted wrap is provenance-marked and never re-proposed.
//
// CCF is deliberately NOT wrapped structurally: the quant engine already
// models common cause parametrically (ccfGroup + β/γ/δ on the basic events —
// a structural β branch would DOUBLE-COUNT). The existing similarity flow is
// the draft-and-accept path there; INV-50 below simply keeps its unreviewed
// backlog — and this module's open proposals — visible in the sweep.
//
// BORN MODULAR: new file, zero monolith edits. Kill switch:
// window.SL_FTA_PROPOSALS_OFF = true.
// ============================================================================
(function () {
    'use strict';

    function _pc() { return (typeof projectConfig !== 'undefined' && projectConfig) ? projectConfig : null; }
    function _store() {
        var pc = _pc(); if (!pc) return null;
        if (!pc.ftaProposals || !Array.isArray(pc.ftaProposals.items)) pc.ftaProposals = { items: [] };
        return pc.ftaProposals;
    }
    function _pages() { return (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) ? ftaPages : []; }
    function _findings() {
        try {
            var api = (typeof window !== 'undefined' && window.CRA) || (typeof CRA !== 'undefined' ? CRA : null);
            return (api && typeof api.findings === 'function') ? (api.findings() || []) : [];
        } catch (_) { return []; }
    }
    function _ledger() {
        try { return (typeof ipLedger === 'function') ? (ipLedger(true) || []) : []; } catch (_) { return []; }
    }
    function _node(pageId, nodeId) {
        var page = _pages().find(function (p) { return p && p.id === pageId; });
        if (!page || !page.root) return null;
        var hit = null;
        (function walk(n) {
            if (!n || hit) return;
            if (String(n.id) === String(nodeId)) { hit = n; return; }
            (n.children || []).forEach(walk);
        })(page.root);
        return hit;
    }
    function _isAndFamily(n) { return !!(n && n.type === 'gate' && (n.gateType === 'AND' || n.gateType === 'INHIBIT' || n.gateType === 'VOTING')); }
    function _gateFp(n) {
        if (!n) return '';
        return n.gateType + '(' + (n.children || []).map(function (c) {
            return String(c.logicalId != null ? c.logicalId : c.id);
        }).sort().join(',') + ')';
    }
    function _save() { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }

    // ---- the sweep (deterministic proposer) ---------------------------------
    function sweep() {
        if (typeof window !== 'undefined' && window.SL_FTA_PROPOSALS_OFF) return { off: true };
        var st = _store(); if (!st) return { noStore: true };
        var proposed = 0, withdrawn = 0;
        var liveIds = {};
        _findings().filter(function (f) { return f && f.principle; }).forEach(function (f) {
            var p = _ledger().find(function (x) { return x && x.key === f.principle; });
            if (!p) return;
            (p.sources || []).filter(function (s) { return s && s.type === 'gate'; }).forEach(function (s) {
                var node = _node(s.pageId, s.nodeId);
                if (!node || !_isAndFamily(node)) return;
                var sid = ['cra', f.resId, f.mode, s.pageId, s.nodeId].join('~');
                if (node._craWrapped === sid) { liveIds[sid] = 1; return; }   // applied — settled
                liveIds[sid] = 1;
                var existing = st.items.find(function (i) { return i.id === sid; });
                if (existing) {
                    if (existing.status === 'open') existing.gateFp = existing.gateFp || _gateFp(node);
                    return;                                                   // idempotent — never duplicate
                }
                st.items.push({
                    id: sid, kind: 'cra', status: 'open', at: new Date().toISOString(),
                    pageId: s.pageId, nodeId: s.nodeId,
                    resId: f.resId, mode: f.mode, principle: f.principle,
                    detail: f.detail || '', gateFp: _gateFp(node)
                });
                proposed++;
            });
        });
        // A proposal whose finding or gate is gone withdraws itself.
        st.items.forEach(function (i) {
            if (i.status !== 'open' || liveIds[i.id]) return;
            var node = _node(i.pageId, i.nodeId);
            i.status = 'withdrawn';
            i.reason = !node ? 'the gate no longer exists' :
                       !_isAndFamily(node) ? 'the gate is no longer an independence gate' :
                       'the CRA finding no longer holds';
            i.at = new Date().toISOString();
            withdrawn++;
        });
        if (proposed || withdrawn) { _save(); _renderPanel(); }
        return { proposed: proposed, withdrawn: withdrawn, open: st.items.filter(function (i) { return i.status === 'open'; }).length };
    }

    // ---- accept (signed; refuses on drift) ----------------------------------
    function accept(id, by) {
        var st = _store(); if (!st) return { ok: false, reason: 'no store' };
        var item = st.items.find(function (i) { return i.id === id; });
        if (!item || item.status !== 'open') return { ok: false, reason: 'proposal is not open' };
        if (!by || String(by).trim().length < 2) return { ok: false, reason: 'a signature is required' };
        var node = _node(item.pageId, item.nodeId);
        if (!node || !_isAndFamily(node)) return { ok: false, reason: 'the gate no longer exists as proposed' };
        if (_gateFp(node) !== item.gateFp) return { ok: false, reason: 'tree changed since proposed — re-sweep and review the fresh proposal' };
        var inner = {
            id: internalIdCounter++, logicalId: internalIdCounter,
            displayId: '', name: (node.name || 'Independent legs') + ' — independent legs',
            type: 'gate', gateType: node.gateType, probability: 0,
            children: node.children, _craProvenance: item.id
        };
        if (node.votingK != null) { inner.votingK = node.votingK; delete node.votingK; }
        var resEv = {
            id: internalIdCounter++, logicalId: internalIdCounter,
            displayId: '', name: 'Common resource — ' + item.resId + ' · ' + item.mode,
            type: 'basic', probability: 0, lambda: 0, children: [],
            _craProvenance: item.id
        };
        node.gateType = 'OR';
        node.children = [inner, resEv];
        node._craWrapped = item.id;
        item.status = 'accepted'; item.by = String(by).trim(); item.at = new Date().toISOString();
        try { if (typeof calculateAllProbabilities === 'function') calculateAllProbabilities(); } catch (_) {}
        try { if (typeof updateD3 === 'function') updateD3(); } catch (_) {}
        _save(); _renderPanel();
        return { ok: true };
    }

    function dismiss(id, by, rationale) {
        var st = _store(); if (!st) return { ok: false, reason: 'no store' };
        var item = st.items.find(function (i) { return i.id === id; });
        if (!item || item.status !== 'open') return { ok: false, reason: 'proposal is not open' };
        if (!by || String(by).trim().length < 2 || !rationale || String(rationale).trim().length < 10)
            return { ok: false, reason: 'dismissing needs a name and a rationale (≥10 chars) — a silent dismissal is a hole, not a decision' };
        item.status = 'dismissed'; item.by = String(by).trim();
        item.rationale = String(rationale).trim(); item.at = new Date().toISOString();
        _save(); _renderPanel();
        return { ok: true };
    }

    function status() {
        var st = _store(); var items = (st && st.items) || [];
        var ccfOpen = 0;
        try { ccfOpen = ((typeof ccfPairs === 'function') ? ccfPairs() : []).filter(function (p) { return p.state === 'unconfirmed'; }).length; } catch (_) {}
        return {
            open: items.filter(function (i) { return i.status === 'open'; }).length,
            accepted: items.filter(function (i) { return i.status === 'accepted'; }).length,
            dismissed: items.filter(function (i) { return i.status === 'dismissed'; }).length,
            withdrawn: items.filter(function (i) { return i.status === 'withdrawn'; }).length,
            ccfUnreviewed: ccfOpen
        };
    }

    // ---- INV-50 — the sweep flag the ruling requires ------------------------
    if (typeof invRegister === 'function') {
        invRegister({ id: 'INV-50', sev: 'advisory',
            name: 'Generated tree proposals reviewed — CRA repairs signed or dismissed; CCF pair backlog dispositioned',
            run: function () {
                try {
                    var st = _store(); var items = (st && st.items) || [];
                    var fails = [];
                    items.filter(function (i) { return i.status === 'open'; }).forEach(function (i) {
                        fails.push('CRA repair awaiting review: ' + i.resId + ' · ' + i.mode + ' defeats claim "' + i.principle + '" (Principle Ledger page → Generated repairs)');
                    });
                    var pairs = (typeof ccfPairs === 'function') ? ccfPairs() : [];
                    pairs.filter(function (p) { return p.state === 'unconfirmed'; }).forEach(function (p) {
                        fails.push('CCF candidate pair undispositioned: ' + (p.a.displayId || p.a.name) + ' + ' + (p.b.displayId || p.b.name) + ' — confirm independence or bucket into a group');
                    });
                    return { checked: items.length + pairs.length, fails: fails };
                } catch (_) { return { checked: 0, fails: [] }; }
            } });
    }

    // ---- panel on the Principle Ledger page ---------------------------------
    var _esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
    function _renderPanel() {
        if (typeof document === 'undefined') return;
        var view = document.getElementById('view-ipledger'); if (!view) return;
        var host = document.getElementById('fta-proposals-host');
        if (!host) { host = document.createElement('div'); host.id = 'fta-proposals-host'; view.appendChild(host); }
        var st = _store(); var items = (st && st.items) || [];
        var open = items.filter(function (i) { return i.status === 'open'; });
        var settled = items.filter(function (i) { return i.status !== 'open'; }).slice(-6).reverse();
        var s = status();
        var html = '<h4 style="margin-top:var(--s-5,24px);">Generated repairs — draft proposals awaiting signature</h4>';
        if (!open.length) html += '<p style="color:var(--color-text-tertiary);font-size:13px;">No open proposals. The CRA sweep proposes a structural repair whenever a shared resource defeats an independence claim; accepting is signed, and nothing enters a tree unreviewed.</p>';
        else {
            html += '<table class="data-table" style="width:100%;font-size:12.5px;"><thead><tr><th>Defeat</th><th>Repair</th><th></th></tr></thead><tbody>';
            open.forEach(function (i) {
                html += '<tr><td style="max-width:420px;">' + _esc(i.detail || (i.resId + ' · ' + i.mode + ' vs "' + i.principle + '"')) + '</td>' +
                    '<td class="u-mono" style="font-size:11px;">AND → OR(AND, common resource) · λ yours to enter</td>' +
                    '<td style="white-space:nowrap;"><button class="ckpt-m-btn" onclick="SL_PROPOSALS.uiAccept(\'' + _esc(i.id) + '\')">Accept…</button> ' +
                    '<button class="ckpt-m-btn" onclick="SL_PROPOSALS.uiDismiss(\'' + _esc(i.id) + '\')">Dismiss…</button></td></tr>';
            });
            html += '</tbody></table>';
        }
        if (s.ccfUnreviewed) html += '<p style="font-size:12px;color:var(--color-text-tertiary);">Also pending: ' + s.ccfUnreviewed + ' CCF candidate pair(s) undispositioned — reviewed in the node drawer / CCF panel (the engine quantifies groups parametrically via β; no structural branch is ever proposed, it would double-count).</p>';
        if (settled.length) {
            html += '<details style="margin-top:8px;"><summary style="font-size:12px;color:var(--color-text-tertiary);cursor:pointer;">Recent decisions (' + settled.length + ')</summary>';
            settled.forEach(function (i) {
                html += '<div style="font-size:11.5px;color:var(--color-text-tertiary);font-family:var(--font-mono);padding:2px 0;">' +
                    _esc(i.status.toUpperCase()) + ' · ' + _esc(i.resId + ' · ' + i.mode) +
                    (i.by ? ' · ' + _esc(i.by) : '') + (i.rationale ? ' — ' + _esc(i.rationale) : '') + (i.reason ? ' — ' + _esc(i.reason) : '') + '</div>';
            });
            html += '</details>';
        }
        host.innerHTML = html;
    }

    function uiAccept(id) {
        var ask = (typeof slPrompt === 'function') ? slPrompt : function (m, d) { return Promise.resolve(window.prompt(m, d)); };
        ask('Sign to accept — the gate becomes OR(existing AND, common-resource event). Your name:', '')
            .then(function (by) {
                if (by == null) return;
                var r = accept(id, by);
                try { if (typeof showToast === 'function') showToast(r.ok ? 'Repair applied — enter the resource λ on the new event.' : r.reason, r.ok ? 'success' : 'error', 4200); } catch (_) {}
            });
    }
    function uiDismiss(id) {
        var ask = (typeof slPrompt === 'function') ? slPrompt : function (m, d) { return Promise.resolve(window.prompt(m, d)); };
        ask('Rationale for dismissing this repair (≥10 chars — stays permanently visible):', '')
            .then(function (rat) {
                if (rat == null) return;
                return ask('Your name:', '').then(function (by) {
                    if (by == null) return;
                    var r = dismiss(id, by, rat);
                    try { if (typeof showToast === 'function') showToast(r.ok ? 'Dismissed — kept on the record.' : r.reason, r.ok ? 'success' : 'error', 4200); } catch (_) {}
                });
            });
    }

    // ---- wiring -------------------------------------------------------------
    if (typeof window !== 'undefined') {
        window.SL_PROPOSALS = { sweep: sweep, accept: accept, dismiss: dismiss, status: status, uiAccept: uiAccept, uiDismiss: uiDismiss };
        (function wrapNav() {
            if (typeof window.switchTab !== 'function' || window.switchTab._proposalsWrapped) return;
            var orig = window.switchTab;
            var wrapped = function (tabId) {
                var r = orig.apply(this, arguments);
                try { if (tabId === 'ipledger') { sweep(); _renderPanel(); } } catch (_) {}
                return r;
            };
            wrapped._proposalsWrapped = true;
            Object.keys(orig).forEach(function (k) { try { wrapped[k] = orig[k]; } catch (_) {} });
            window.switchTab = wrapped;
        })();
        var _tick = function () { try { sweep(); } catch (_) {} };
        if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(_tick, 3000);
        else document.addEventListener('DOMContentLoaded', function () { setTimeout(_tick, 3000); });
        setInterval(_tick, 10000);
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = { sweep: sweep, accept: accept, dismiss: dismiss, status: status };
})();
