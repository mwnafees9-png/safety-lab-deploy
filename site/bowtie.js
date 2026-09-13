// 13 Sep 2026 (R19 step 3): native alert/confirm/prompt replaced by the app's own dialogs (slAlert/slConfirm/slPrompt) and typed toasts; see tests/regression_native_dialogs.test.js
// ============================================================================
// bowtie.js — v1.0 — Bow-Tie Analysis: the unified FTA ↔ ETA view.
// BORN MODULAR: new file, zero monolith edits. Creates its own view + nav entry
// and wraps switchTab, exactly like event_trees.js.
//
// A bow-tie is NOT a third data store — it is a COMPILED rendering that joins two
// existing analyses around one shared "critical event":
//   · LEFT  (prevention) = a Fault Tree. Its BDD-exact top probability IS the
//     critical-event probability, and its minimal cut sets are the causal evidence.
//   · CENTRE = the critical event (FTA top = bow-tie knot = ETA initiator).
//   · RIGHT (mitigation) = an Event Tree. Its initiator frequency is SOURCED from
//     the FTA top probability (not hand-entered) → P(consequence path) =
//     P(critical event) · Π P(barrier outcome | prior).
//
// Two deterministic checks the article ("Unified FTA–ETA for Bow-Tie") calls for:
//   1. CROSS-SIDE COMMON CAUSE — a mitigation barrier that depends on a component
//      appearing in a left-side cut set is NOT independent of the cause. We
//      intersect the FTA cut-set basic events with each barrier's traced element
//      and raise a finding (ties into the Independence Principle ledger).
//   2. GENERIC-BARRIER LINT — a barrier with no trace to a requirement / component
//      / ET barrier is "named but unproven" and is flagged.
//
// Barriers are MANAGED OBJECTS (the only bow-tie-owned, editable data): side,
// name, trace {kind, ref, logicalId}, principleId, evidenceRef, note. The FTA and
// ETA structures stay edited in their own editors — single source of truth.
// ============================================================================
(function () {
    var _sevPill = function (s, o) { return (typeof sevPillHtml === 'function') ? sevPillHtml(s, o) : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }; // severity pill (helpers_modules.js); safe when helpers is not loaded (test sandboxes)
    'use strict';

    function _esc(s) { if (typeof esc === 'function') return esc(s); return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {}; }
    function _store() { const pc = _pc(); if (!Array.isArray(pc.bowties)) pc.bowties = []; return pc.bowties; }
    function _save() { try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {} }
    function _toast(m, k) { try { if (typeof showToast === 'function') showToast(m, k || 'info'); } catch (_) {} }
    function _fmt(p) { return (typeof p === 'number' && isFinite(p)) ? p.toExponential(2) : '—'; }
    let _sel = null; // selected bow-tie id

    function _ftaPages() { return (typeof ftaPages !== 'undefined' ? ftaPages : (_pc().ftaPages || [])) || []; }
    function _etaStore() { return (_pc().eventTrees || []); }

    // ---- the join: FTA top probability + causal cut sets ---------------------
    function _ftaEvidence(pageId) {
        const page = _ftaPages().find(p => p.id === pageId);
        if (!page || !page.root) return { prob: null, cutsets: [], causeLids: new Set(), spf: 0, err: 'no fault tree' };
        let prob = null;
        try { const r = window.computeExactProbability(page.root); prob = (r && typeof r.prob === 'number') ? r.prob : null; } catch (_) {}
        // minimal cut sets → the set of basic-event logicalIds that can cause the top.
        const causeLids = new Set(); let cutsets = [], spf = 0;
        try {
            const cs = window.getCutsets(page.root) || [];
            // lids normalized to STRINGS — barrier traces come from prompts (strings)
            // while tree logicalIds may be numeric; Set.has must not miss on type.
            cutsets = cs.map(set => (set || []).map(n => String(n.logicalId != null ? n.logicalId : n.id)));
            cutsets.forEach(set => { if (set.length === 1) spf++; set.forEach(l => causeLids.add(l)); });
        } catch (_) {
            // cut-set explosion or engine issue → fall back to every basic event in the tree.
            (function walk(n) { if (!n) return; if (n.type !== 'gate') causeLids.add(String(n.logicalId != null ? n.logicalId : n.id)); (n.children || []).forEach(walk); })(page.root);
        }
        return { prob: prob, cutsets: cutsets, causeLids: causeLids, spf: spf, topLabel: (page.root && (page.root.name || page.root.id)) || page.name || pageId };
    }

    // ---- which cause-side events does a barrier depend on? --------------------
    // A barrier traced to a component carries its logicalId directly. A barrier
    // the auto-builder took from an event tree carries {kind:'eta'} and NO lid —
    // which meant the cross-side common-cause check could NEVER fire on an
    // auto-built bow-tie (found live, 5 Aug: shared lock event 7128 sat in both
    // cause cut sets and two linked barriers, findings = 0). The event tree
    // already stores which fault-tree page implements the barrier
    // (etaLinkBarrier), so FOLLOW the link: the barrier depends on every basic
    // event of the page that implements it. No re-authoring demanded.
    function _barrierCauseLids(bt, b) {
        const out = new Set();
        const t = (b && b.trace) || {};
        if (t.logicalId) { out.add(String(t.logicalId)); return out; }
        if (t.kind === 'eta') {
            let pid = t.pageId || '';
            if (!pid) {
                const eta = _etaStore().find(x => x.id === (t.etaId || bt.etaId));
                const nm = String(t.ref || '').split(' · ').slice(1).join(' · ') || String(b.name || '');
                const ebar = eta && (eta.barriers || []).find(x => String(x.name) === nm);
                pid = (ebar && ebar.linkedPageId) || '';
            }
            if (pid) {
                const pg = _ftaPages().find(x => x.id === pid);
                (function walk(n) { if (!n) return;
                    if (n.type !== 'gate') out.add(String(n.logicalId != null ? n.logicalId : n.id));
                    (n.children || n._children || []).forEach(walk); })(pg && pg.root);
            }
        }
        return out;
    }

    // ---- compiled evaluation -------------------------------------------------
    function bowtieEvaluate(bt) {
        const fev = _ftaEvidence(bt.ftaPageId);
        const barriers = (bt.barriers || []);
        // right side: source the ETA initiator from P(critical event).
        let outcomes = [], etaOk = false, etaClosed = true;
        const eta = _etaStore().find(t => t.id === bt.etaId);
        if (eta && typeof window.etaEvaluate === 'function' && fev.prob != null) {
            try {
                const clone = JSON.parse(JSON.stringify(eta));
                clone.initiator = clone.initiator || {};
                clone.initiator.freq = fev.prob;           // THE JOIN — sourced, not typed
                const ev = window.etaEvaluate(clone);
                outcomes = ev.outcomes || []; etaClosed = !!ev.closed; etaOk = true;
            } catch (_) {}
        }
        // findings
        const findings = [];
        const ccLids = [];   // cause-side elements a mitigation barrier also depends on
        // 1. cross-side common cause: mitigative barrier traced to a cause cut-set element
        barriers.filter(b => b.side === 'mitigative').forEach(b => {
            const shared = [];
            _barrierCauseLids(bt, b).forEach(l => { if (fev.causeLids.has(l)) shared.push(l); });
            if (shared.length) {
                shared.forEach(l => ccLids.push(l));
                const via = (b.trace && b.trace.kind === 'eta') ? ' (followed through its event-tree barrier to the fault tree that implements it)' : '';
                findings.push({ kind: 'common-cause', sev: 'high',
                    text: 'Mitigation barrier "' + (b.name || '?') + '" depends on ' + shared.join(', ') + ', which also appears in a cause cut set' + via + '. The barrier is NOT independent of the critical event — a common-cause failure can defeat prevention and mitigation together. Auto-registered as a DEFEATED Independence Principle in the ledger.' });
            }
        });
        // 2. generic-barrier lint
        barriers.forEach(b => {
            const traced = b.trace && b.trace.kind && b.trace.kind !== 'none' && (b.trace.ref || b.trace.logicalId);
            if (!traced && !b.requirementId && !b.principleId) {
                findings.push({ kind: 'generic-barrier', sev: 'advisory',
                    text: 'Barrier "' + (b.name || '?') + '" (' + (b.side || '?') + ') has no trace to a requirement, component, or ET barrier — named but unproven.' });
            }
        });
        // two-lane knot: if this tree is paired with its allocation/verification
        // counterpart (page.verifies), surface BOTH probabilities — the budget the
        // PSSA allocated and the as-built value the SSA computed. NOT a second wing
        // of the bow-tie (both trees model the causes); it is the knot's two lanes.
        let verif = null;
        try {
            const pages = _ftaPages();
            const me = pages.find(p => p.id === bt.ftaPageId);
            const mirror = pages.find(p => p && p.verifies === bt.ftaPageId);
            const src = me && me.verifies ? pages.find(p => p.id === me.verifies) : null;
            const other = mirror || src;
            if (other && other.root && fev.prob != null) {
                const r = window.computeExactProbability(other.root);
                const pOther = (r && typeof r.prob === 'number') ? r.prob : null;
                if (pOther != null) verif = mirror
                    ? { pAllocated: fev.prob, pAchieved: pOther, otherName: other.name || other.id }
                    : { pAllocated: pOther, pAchieved: fev.prob, otherName: other.name || other.id };
            }
        } catch (_) {}
        return {
            pCritical: fev.prob, critLabel: fev.topLabel, cutsets: fev.cutsets, spf: fev.spf,
            preventive: barriers.filter(b => b.side === 'preventive'),
            mitigative: barriers.filter(b => b.side === 'mitigative'),
            outcomes: outcomes, etaOk: etaOk, etaClosed: etaClosed, etaLinked: !!eta,
            findings: findings, ccLids: ccLids, verif: verif
        };
    }

    // ---- Independence Principle ledger feed -----------------------------------
    // One hit per (mitigative barrier × colliding cause cut set), with the actual
    // cut-set NODES so ipLedger() can build members from real basic events.
    // Deterministic; consumed by ipLedger() in helpers_modules.js (source type 'bowtie').
    function _ccHits(bt) {
        const hits = [];
        const page = _ftaPages().find(p => p.id === bt.ftaPageId);
        if (!page || !page.root) return hits;
        let cs = [];
        try { cs = window.getCutsets(page.root) || []; } catch (_) { return hits; }
        (bt.barriers || []).filter(b => b.side === 'mitigative').forEach(b => {
            const lids = _barrierCauseLids(bt, b);
            if (!lids.size) return;
            cs.forEach(set => {
                const m = (set || []).find(n => lids.has(String(n.logicalId != null ? n.logicalId : n.id)));
                if (m) {
                    hits.push({ btId: bt.id, btName: bt.name || bt.id, barrierId: b.id, barrierName: b.name || b.id, pageId: bt.ftaPageId, sharedLid: String(m.logicalId != null ? m.logicalId : m.id), cutsetNodes: set });
                }
            });
        });
        return hits;
    }
    function btLedgerHits() {
        const out = [];
        try { _store().forEach(bt => { _ccHits(bt).forEach(h => out.push(h)); }); } catch (_) {}
        return out;
    }

    // ---- auto-build: compile a bow-tie from what the project already knows ----
    // Everything is derived, nothing invented:
    //   · ETA matched by linked failure condition (outcome.linkedFcId ↔ the FTA
    //     page's FHA row), falling back to initiator-description overlap.
    //   · PREVENTIVE barriers from monitor specs on this tree's events and from
    //     AND/INHIBIT gates (each is a live redundancy claim).
    //   · MITIGATIVE barriers from the linked event tree's ordered barriers.
    //   · REQUIREMENTS auto-linked: AutoReq sourceIds (…:fta-event:<lid>),
    //     traceIds, then unique text match — including Jama-imported rows
    //     (_jamaDocumentKey), so a Jama import completes the bow-tie's evidence.
    function _allReqs() {
        const pool = [];
        ((typeof acReqData !== 'undefined' ? acReqData : []) || []).forEach(r => r && pool.push(r));
        ((typeof systemsData !== 'undefined' ? systemsData : []) || []).forEach(s => (s.req || []).forEach(r => r && pool.push(r)));
        return pool;
    }
    function _reqLabel(r) { return r.id || r._jamaDocumentKey || ('REQ#' + r.internalId); }
    function _autoLinkReqs(bt) {
        const pool = _allReqs(); let linked = 0;
        (bt.barriers || []).forEach(b => {
            if (b.requirementId) return;
            const lid = b.trace && b.trace.logicalId ? String(b.trace.logicalId) : '';
            let hit = null;
            if (lid) {
                hit = pool.find(r => { const sid = r.reqSource && String(r.reqSource.sourceId || ''); return sid && (sid.slice(-(lid.length + 1)) === (':' + lid) || sid.indexOf(':' + lid + ':') !== -1); })
                    || pool.find(r => String(r.traceId || '') === lid || (Array.isArray(r.traceIds) && r.traceIds.map(String).indexOf(lid) !== -1));
            }
            // trace ref (e.g. a displayId like BE-5052 or a gate id) matching a requirement's traceId
            const ref = b.trace && b.trace.ref ? String(b.trace.ref) : '';
            if (!hit && ref) hit = pool.find(r => String(r.traceId || '') === ref || (Array.isArray(r.traceIds) && r.traceIds.map(String).indexOf(ref) !== -1));
            if (!hit && b.name && String(b.name).length >= 6) {
                const nm = String(b.name).toLowerCase().replace(/^(monitor|redundancy):\s*/i, '');
                const m = pool.filter(r => String(r.text || '').toLowerCase().indexOf(nm) !== -1);
                if (m.length === 1) hit = m[0];   // only an UNAMBIGUOUS text match counts
            }
            if (hit) { b.requirementId = _reqLabel(hit); b.reqInternalId = hit.internalId; b.reqAutoLinked = true; linked++; }
        });
        return linked;
    }
    function btAutoLinkAll() {
        let linked = 0;
        _store().forEach(bt => { linked += _autoLinkReqs(bt); });
        if (linked) { _save(); _render(); }
        return linked;
    }
    // Event-tree match through the SAME failure condition; no blind fallback —
    // an event tree is linked only when the FC or initiator text genuinely
    // matches. The machine does not guess.
    function _matchEta(page, fc) {
        const etas = _etaStore();
        // The FC bridge covers both levels: a system FC (SFHA) traces up to its
        // aircraft FC via acTrace/acTraces — an event tree linked at either level
        // matches. acTrace may hold the aircraft row's internalId or literal FC text.
        const fcIds = new Set();
        if (fc) {
            if (fc.fcId) fcIds.add(String(fc.fcId));
            const acRefs = [].concat(fc.acTrace != null && fc.acTrace !== '' ? [fc.acTrace] : [], Array.isArray(fc.acTraces) ? fc.acTraces : []);
            const acRows = (typeof acFhaData !== 'undefined' ? acFhaData : []) || [];
            acRefs.forEach(ref => {
                const row = acRows.find(f => f && (String(f.internalId) === String(ref) || String(f.fcId) === String(ref)));
                if (row && row.fcId) fcIds.add(String(row.fcId));
                (String(ref).match(/FC-[A-Za-z0-9-]+/g) || []).forEach(x => fcIds.add(x));
            });
        }
        return etas.find(t => fcIds.size && Object.keys(t.consequences || {}).some(k => t.consequences[k] && fcIds.has(String(t.consequences[k].linkedFcId || ''))))
            || etas.find(t => {
                const top = String((page.root && page.root.name) || page.name || '').toLowerCase();
                const d = String((t.initiator && t.initiator.desc) || t.name || '').toLowerCase();
                return top.length > 8 && d.length > 8 && (d.indexOf(top.slice(0, 18)) !== -1 || top.indexOf(d.slice(0, 18)) !== -1);
            })
            || null;
    }
    function _pageFc(page) {
        try { const r = (typeof _ccmrPageFha === 'function') ? _ccmrPageFha(page) : null; return (r && r.fha) || null; } catch (_) { return null; }
    }

    // Interactive picker — one click per fault tree, badges preview what will
    // auto-link (FC + severity, matched event tree, allocation⇄verification pair).
    function btAutoBuild() {
        const pages = _ftaPages(); if (!pages.length) { _toast('No fault trees to build from — the FTA is the left side.', 'warn'); return; }
        let m = document.getElementById('bt-autobuild-modal'); if (m) m.remove();
        m = document.createElement('div'); m.id = 'bt-autobuild-modal';
        m.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;';
        m.addEventListener('click', function (e) { if (e.target === m) m.remove(); });
        const chip = (txt, color) => '<span style="display:inline-block;font-size:10.5px;font-weight:600;padding:1px 8px;border-radius:999px;border:1px solid ' + color + ';color:' + color + ';margin-right:5px;">' + txt + '</span>';
        const rows = pages.map(p => {
            const fc = _pageFc(p);
            const eta = _matchEta(p, fc);
            const pair = pages.find(x => x && x.verifies === p.id) || (p.verifies ? pages.find(x => x.id === p.verifies) : null);
            const hints =
                (fc ? chip(_esc(fc.fcId), 'var(--color-text-primary)') + ' ' + _sevPill(fc.severity) : chip('no FHA link', 'var(--color-text-tertiary,#999)')) +
                (eta ? chip('⇄ ' + _esc(eta.id), 'var(--color-link,#0b57d0)') : chip('no event tree match', 'var(--color-text-tertiary,#999)')) +
                (pair ? chip('two-lane knot ✓', 'var(--color-success,#1a7f37)') : '');
            return '<button onclick="btAutoBuildFrom(\'' + _esc(p.id) + '\')" style="display:block;width:100%;text-align:left;padding:9px 12px;margin-bottom:6px;border:1px solid var(--color-border-hair,rgba(0,0,0,.15));border-radius:8px;background:var(--color-surface,#fff);cursor:pointer;">' +
                '<div style="font-weight:600;font-size:13px;color:var(--color-text,#223);margin-bottom:3px;">' + _esc(p.name || p.id) + '</div><div>' + hints + '</div></button>';
        }).join('');
        m.innerHTML = '<div style="background:var(--color-surface,#fff);border-radius:14px;padding:18px 20px;width:min(560px,92vw);max-height:80vh;overflow:auto;border:1px solid var(--color-border-hair,rgba(0,0,0,.15));box-shadow:0 30px 80px rgba(0,0,0,.4);">' +
            '<div style="font-weight:700;font-size:15px;">Auto-build a bow-tie</div>' +
            '<div style="font-size:12px;color:var(--color-text-tertiary,#888);margin:2px 0 12px;">Pick the fault tree — the event tree, barriers and requirement links compile automatically. Badges preview what will auto-link.</div>' +
            rows +
            '<div style="text-align:right;margin-top:10px;"><button onclick="document.getElementById(\'bt-autobuild-modal\').remove()" style="padding:7px 14px;border-radius:8px;border:1px solid var(--color-border-hair,rgba(0,0,0,.2));background:transparent;cursor:pointer;font-size:12.5px;">Cancel</button></div></div>';
        document.body.appendChild(m);
    }

    function btAutoBuildFrom(pageId) {
        const m = document.getElementById('bt-autobuild-modal'); if (m) m.remove();
        const page = _ftaPages().find(p => p.id === pageId);
        if (!page) { _toast('Fault tree not found.', 'warn'); return; }
        const fc = _pageFc(page);
        const eta = _matchEta(page, fc);
        const id = 'BT-' + String(_store().length + 1).padStart(3, '0');
        let seq = 0; const bid = () => 'B' + Date.now().toString(36) + (seq++);
        const bt = { id, name: (fc ? fc.fcId + ' — ' : '') + String((page.root && page.root.name) || page.name || id),
            ftaPageId: page.id, etaId: (eta && eta.id) || '', barriers: [],
            auto: { from: page.id, eta: (eta && eta.id) || '', at: new Date().toISOString() },
            by: (typeof currentUserName !== 'undefined' ? currentUserName : ''), at: new Date().toISOString() };
        // preventive — monitor specs watching this tree's events
        ((_pc().monitorSpecs) || []).filter(sp => sp.targetPageId === page.id).forEach(sp => {
            bt.barriers.push({ id: bid(), side: 'preventive', name: 'Monitor: ' + (sp.threshold ? String(sp.threshold).slice(0, 32) : sp.id),
                trace: sp.monitorLid ? { kind: 'component', ref: String(sp.monitorLid), logicalId: String(sp.monitorLid) } : { kind: 'monitor', ref: sp.id, logicalId: '' } });
        });
        // preventive — AND/INHIBIT gates are live redundancy claims
        (function walk(n, seen) {
            if (!n || seen.has(n.id)) return; seen.add(n.id);
            if (n.type === 'gate' && (n.gateType === 'AND' || n.gateType === 'INHIBIT') && (n.children || n._children || []).filter(Boolean).length >= 2) {
                bt.barriers.push({ id: bid(), side: 'preventive', name: 'Redundancy: ' + String(n.name || n.displayId || 'AND gate').slice(0, 34),
                    trace: { kind: 'gate', ref: String(n.displayId || n.name || n.id), logicalId: '' } });
            }
            (n.children || n._children || []).forEach(c => walk(c, seen));
        })(page.root, new Set());
        // mitigative — the linked event tree's ordered barriers, traces preserved
        if (eta) (eta.barriers || []).forEach(ebar => {
            // pageId carried directly so the common-cause resolver need not
            // re-match by name; the name-match path remains for older data.
            bt.barriers.push({ id: bid(), side: 'mitigative', name: String(ebar.name || 'barrier'), pFail: ebar.pFail,
                trace: { kind: 'eta', ref: eta.id + ' · ' + String(ebar.name || ''), logicalId: '', pageId: ebar.linkedPageId || '', etaId: eta.id } });
        });
        const linked = _autoLinkReqs(bt);
        _store().push(bt); _sel = id; _save(); _render();
        _toast(id + ' auto-built: ' + (page.name || page.id) + (eta ? ' ⇄ ' + eta.id : ' (no event tree matched — link one above)') + ' · ' + bt.barriers.length + ' barrier(s) · ' + linked + ' requirement link(s).', 'success');
        return id;
    }

    // ---- Jama pull: mitigations & requirements for THIS critical event --------
    // Searches the connected Jama instance for items matching the FC id and the
    // critical-event text. Each hit is classified by wording (monitor/detect →
    // preventive; procedure/recover/alert → mitigative; else plain requirement),
    // reviewable before apply. Imports dedupe by Jama document key, then the
    // standard auto-linker attaches requirements to matching barriers.
    async function btJamaPull() {
        const bt = _bt(); if (!bt) { _toast('Create or select a bow-tie first.', 'warn'); return; }
        if (typeof JamaConnect === 'undefined' || !JamaConnect.searchItems) { _toast('Jama importer not available in this build.', 'warn'); return; }
        if (JamaConnect.isConfigured && !JamaConnect.isConfigured()) { try { JamaConnect.openImportModal(); } catch (_) {} _toast('Connect to Jama first, then pull again.', 'info'); return; }
        const ev = bowtieEvaluate(bt);
        const fc = _pageFc(_ftaPages().find(p => p.id === bt.ftaPageId));
        // TIER 3 FIRST: items the program traced (in Jama) to this failure
        // condition, via the live bridge's relationship graph. Text search only
        // supplements, and its hits are marked as mere candidates.
        let items = [];
        try {
            if (typeof window.jbRelatedForFc === 'function') {
                window.jbRelatedForFc(fc).forEach(x => items.push({ id: x.jamaId, documentKey: x.documentKey, fields: { name: x.name, description: x.description }, _tier: 'relationship' }));
            }
        } catch (_) {}
        const terms = [...new Set([fc && fc.fcId, ev.critLabel].filter(Boolean).map(String))];
        if (!terms.length && !items.length) { _toast('No FC or critical-event text to search for — link a fault tree first.', 'warn'); return; }
        _toast((items.length ? items.length + ' Jama-traced item(s) from the relationship graph. ' : '') + 'Searching Jama text for ' + terms.map(t => '“' + t + '”').join(' and ') + '…', 'info');
        try { for (const t of terms) { (await JamaConnect.searchItems(t, 20)).forEach(x => { x._tier = 'candidate'; items.push(x); }); } }
        catch (e) { if (!items.length) { _toast(String((e && e.message) || e), 'warn'); return; } }
        const seen = new Set();
        items = items.filter(it => { const k = it.documentKey || it.id; if (!k || seen.has(k)) return false; seen.add(k); return true; });
        if (!items.length) { _toast('Jama returned nothing for this critical event.', 'info'); return; }
        const sideOf = t => /monitor|detect|prevent|inhibit|interlock|protect|redundan/i.test(t) ? 'preventive'
            : /procedure|crew|recover|mitigat|alert|revers|contain|isolat|annunciat/i.test(t) ? 'mitigative' : 'link';
        window._btJamaItems = items;
        let m = document.getElementById('bt-jama-modal'); if (m) m.remove();
        m = document.createElement('div'); m.id = 'bt-jama-modal';
        m.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;';
        m.addEventListener('click', function (e) { if (e.target === m) m.remove(); });
        const rows = items.map((it, i) => {
            const f = it.fields || {}; const key = it.documentKey || ('JAMA-' + it.id);
            const nm = String(f.name || '');
            const side = sideOf(nm + ' ' + String(f.description || ''));
            const prov = it._tier === 'relationship'
                ? '<span style="font-size:10px;font-weight:700;color:var(--color-success,#1a7f37);border:1px solid var(--color-success,#1a7f37);border-radius:999px;padding:0 7px;margin-right:5px;" title="The program traced this item to the failure condition in Jama — tier-3 evidence.">⛓ traced in Jama</span>'
                : '<span style="font-size:10px;color:var(--color-text-tertiary,#999);border:1px solid var(--color-border-hair,rgba(0,0,0,.2));border-radius:999px;padding:0 7px;margin-right:5px;" title="Found by text search only — a candidate, not a trace.">text match</span>';
            return '<div style="display:flex;gap:8px;align-items:flex-start;padding:7px 4px;border-bottom:1px solid var(--color-border-hair,rgba(0,0,0,.08));font-size:12.5px;">' +
                '<input type="checkbox" id="btj-' + i + '"' + (it._tier === 'relationship' ? ' checked' : '') + ' style="margin-top:3px;">' +
                '<div style="flex:1;min-width:0;">' + prov + '<span class="u-mono" style="font-size:11px;color:var(--color-text-tertiary,#888);">' + _esc(key) + '</span> ' + _esc(nm) + '</div>' +
                '<select id="btjs-' + i + '" style="font-size:11px;padding:2px 4px;border:1px solid var(--color-border-hair,rgba(0,0,0,.2));border-radius:5px;">' +
                '<option value="link"' + (side === 'link' ? ' selected' : '') + '>requirement link</option>' +
                '<option value="preventive"' + (side === 'preventive' ? ' selected' : '') + '>preventive barrier</option>' +
                '<option value="mitigative"' + (side === 'mitigative' ? ' selected' : '') + '>mitigative barrier</option></select></div>';
        }).join('');
        m.innerHTML = '<div style="background:var(--color-surface,#fff);border-radius:14px;padding:18px 20px;width:min(660px,94vw);max-height:80vh;overflow:auto;border:1px solid var(--color-border-hair,rgba(0,0,0,.15));box-shadow:0 30px 80px rgba(0,0,0,.4);">' +
            '<div style="font-weight:700;font-size:15px;">Jama — mitigations &amp; requirements for “' + _esc(ev.critLabel || bt.name) + '”</div>' +
            '<div style="font-size:12px;color:var(--color-text-tertiary,#888);margin:2px 0 10px;">' + items.length + ' item(s) matched. Barrier rows become traced barriers on the chosen side; requirement links import and auto-attach to matching barriers. Deduped by document key.</div>' +
            rows +
            '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">' +
            '<button onclick="document.getElementById(\'bt-jama-modal\').remove()" style="padding:7px 14px;border-radius:8px;border:1px solid var(--color-border-hair,rgba(0,0,0,.2));background:transparent;cursor:pointer;font-size:12.5px;">Cancel</button>' +
            '<button class="btn-cyan" onclick="btJamaApply()" style="font-size:12.5px;">Apply</button></div></div>';
        document.body.appendChild(m);
    }
    function btJamaApply() {
        const bt = _bt(); const items = window._btJamaItems || [];
        let addedReq = 0, addedBar = 0, seq2 = 0;
        const tierMap = {};
        items.forEach((it, i) => {
            const cb = document.getElementById('btj-' + i); if (!cb || !cb.checked) return;
            const side = (document.getElementById('btjs-' + i) || {}).value || 'link';
            const f = it.fields || {}; const key = it.documentKey || ('JAMA-' + it.id);
            tierMap[key] = it._tier || 'candidate';
            let req = ((typeof acReqData !== 'undefined' ? acReqData : []) || []).find(r => r && r._jamaDocumentKey === key);
            if (!req) {
                req = { internalId: (typeof newRowId === 'function' ? newRowId() : Date.now() + Math.random()), history: [], id: key, traceId: '', traceIds: [],
                    level: 'High-level', type: 'Safety',
                    text: String(f.name || '') + (f.description ? ' — ' + String(f.description).replace(/<[^>]+>/g, '').trim() : ''),
                    rationale: 'Pulled from Jama for critical event: ' + String(bt.name || ''), parent: '', children: [], comments: [],
                    valStatus: 'Open', verStatus: 'Open', _jamaId: it.id, _jamaDocumentKey: key, _jamaImportedAt: new Date().toISOString() };
                acReqData.push(req); addedReq++;
            }
            if (side !== 'link') {
                (bt.barriers = bt.barriers || []).push({ id: 'BJ' + Date.now().toString(36) + (seq2++), side, name: String(f.name || key).slice(0, 60),
                    requirementId: key, reqInternalId: req.internalId, reqTier: it._tier || 'candidate', trace: { kind: 'requirement', ref: key, logicalId: '' } });
                addedBar++;
            }
        });
        const linked = _autoLinkReqs(bt);
        // provenance follows the link: relationship-derived beats text-match
        (bt.barriers || []).forEach(b => { if (b.requirementId && tierMap[b.requirementId]) b.reqTier = tierMap[b.requirementId]; });
        const mm = document.getElementById('bt-jama-modal'); if (mm) mm.remove();
        delete window._btJamaItems;
        _save(); _render();
        try { if (typeof renderAcReq === 'function') renderAcReq(); } catch (_) {}
        _toast('Jama: ' + addedReq + ' requirement(s) imported · ' + addedBar + ' barrier(s) created · ' + linked + ' auto-link(s).', 'success');
    }

    // ---- editor actions ------------------------------------------------------
    function createBowtie(name, ftaPageId, etaId) {
        const id = 'BT-' + String(_store().length + 1).padStart(3, '0');
        _store().push({ id: id, name: String(name || 'Bow-tie ' + id).trim(), ftaPageId: ftaPageId || '', etaId: etaId || '', barriers: [], by: (typeof currentUserName !== 'undefined' ? currentUserName : ''), at: new Date().toISOString() });
        _sel = id; _save(); _render();
        return id;
    }
    function _bt() { return _store().find(b => b.id === _sel) || _store()[0] || null; }
    async function addBarrier(side) {
        const bt = _bt(); if (!bt) return;
        const name = await _ask('Barrier name (' + side + '):', ''); if (!name) return;
        const bid = 'B' + Date.now().toString(36);
        (bt.barriers = bt.barriers || []).push({ id: bid, side: side, name: String(name).trim(), trace: { kind: 'none', ref: '', logicalId: '' } });
        _save(); _render();
    }
    async function traceBarrier(bid) {
        const bt = _bt(); if (!bt) return; const b = (bt.barriers || []).find(x => x.id === bid); if (!b) return;
        const lid = await _ask('Trace "' + b.name + '" to a component / basic-event logicalId (as it appears in the fault tree). Leave blank to trace to a requirement id instead:', (b.trace && b.trace.logicalId) || '');
        if (lid) { b.trace = { kind: 'component', ref: lid, logicalId: lid }; }
        else {
            const req = await _ask('Requirement id this barrier satisfies (e.g. SR-014):', b.requirementId || '');
            if (req) { b.requirementId = req; b.trace = { kind: 'requirement', ref: req, logicalId: '' }; }
        }
        _save(); _render();
    }
    function removeBarrier(bid) { const bt = _bt(); if (!bt) return; bt.barriers = (bt.barriers || []).filter(x => x.id !== bid); _save(); _render(); }
    function _ask(m, d) { return slPrompt(m, d || ''); }

    // ---- render --------------------------------------------------------------
    function _sevColor(s) { s = String(s || '').toLowerCase(); return /cat/.test(s) ? '#F2928C' : /haz/.test(s) ? '#F5B878' : /maj/.test(s) ? '#F2DB74' : /min/.test(s) ? '#F8ECB0' : (/neg|no safety/.test(s) ? '#A6DFB4' : 'var(--color-text-tertiary,#888)'); } // 11 Sep — the app-wide severity fills

    // ---- the curved-ribbon diagram (pure SVG, compiled from the evaluation) ----
    // Left ribbons: one per minimal cut set (SPFs red, thicker). Right ribbons:
    // one per consequence path, width ∝ log(frequency), colored by severity.
    // Barrier pills stand in two vertical lanes; red ring = common-cause finding,
    // amber dash = untraced (generic). Everything is drawn from ev — no new data.
    function _svgDiagram(bt, ev) {
        const oc = ev.outcomes.slice(0, 8);
        const page = _ftaPages().find(p => p.id === bt.ftaPageId);

        // -- compile the linked FAULT TREE into a drawable model (Anzen article:
        //    "the left side should carry the evidence, not just name the causes").
        //    Gates preserved (AND vs OR is the difference between combinations and
        //    alternatives); depth/width-capped with dashed truncation marks;
        //    transfers drawn as the classic triangle.
        const MAXD = 6, MAXKIDS = 6, MAXNODES = 60;
        const tNodes = [], tLinks = [], tLeaves = [];
        (function walk(n, depth, parent) {
            if (!n || tNodes.length >= MAXNODES) return;
            const isTransfer = n.type === 'transfer' || !!n.transferTo || !!n.transferRef;
            const rec = { depth, isGate: n.type === 'gate' && !isTransfer, isTransfer,
                gateType: String(n.gateType || '').toUpperCase(),
                label: String(n.displayId || n.name || n.id || ''), full: String(n.name || n.displayId || n.id || ''),
                lid: String(n.logicalId != null ? n.logicalId : n.id), y: 0, kids: [] };
            tNodes.push(rec);
            if (parent) { parent.kids.push(rec); tLinks.push([parent, rec]); }
            const kids = (n.children || n._children || []).filter(Boolean);
            if (!rec.isGate || !kids.length || depth >= MAXD) {
                if (rec.isGate && kids.length) rec.trunc = true;
                rec.leaf = true; tLeaves.push(rec); return;
            }
            kids.slice(0, MAXKIDS).forEach(k => walk(k, depth + 1, rec));
            if (kids.length > MAXKIDS) {
                const more = { depth: depth + 1, isGate: false, label: '+' + (kids.length - MAXKIDS) + ' more', full: kids.length + ' children total — open the fault tree for the rest', lid: '', y: 0, kids: [], leaf: true, more: true };
                tNodes.push(more); tLeaves.push(more); rec.kids.push(more); tLinks.push([rec, more]);
            }
        })(page && page.root, 0, null);
        const tRoot = tNodes[0] || null;
        if (!tRoot && !oc.length) return '';
        const maxDepth = tNodes.reduce((m, n) => Math.max(m, n.depth), 0);

        // ---- geometry: adaptive horizontal allocation ----------------------
        // Per-depth columns sized by what actually lives there (gate columns
        // narrow, event columns wide, fixed clearance gap). The TREE takes the
        // width it needs (capped at 400px, then everything scales together);
        // the barrier lanes, knot and consequence fan FOLLOW it — nothing is
        // fixed where it can collide.
        const boxW = 112, boxH = 32, GAP = 28, GATE_W = 30, knotW = 148, treeLeft = 22;
        const depthW = [];
        for (let d = 0; d <= maxDepth; d++) {
            let w = GATE_W;
            tNodes.forEach(n => { if (n.depth === d && !(n.isGate && !n.leaf) && !n.isTransfer) w = Math.max(w, boxW); });
            depthW[d] = w;
        }
        const totalW = tRoot ? depthW.reduce((a, b) => a + b, 0) + GAP * maxDepth : 0;
        const tScale = tRoot ? Math.min(1, 400 / totalW) : 1;
        const treeRight = tRoot ? treeLeft + totalW * tScale : 130;
        const pbX = treeRight + 76;
        const knotX = pbX + 76 + knotW / 2;
        const mbX = knotX + knotW / 2 + 76;
        // the EVENT TREE claims the width its barrier columns need, same rule as the FTA side
        const etaObj = _etaStore().find(t => t.id === bt.etaId) || null;
        const etaBars = (etaObj && etaObj.barriers) || [];
        const W = Math.max(1000, mbX + 270, mbX + 72 + etaBars.length * 95 + 165);
        const H = Math.max(190, Math.max(tLeaves.length, 1) * 42 + 96, oc.length * 42 + 84), cy = H / 2;
        const yFor = (i, n) => n <= 1 ? cy : 44 + i * (H - 88) / (n - 1);
        const ccBarrierNames = new Set();
        ev.findings.forEach(f => { if (f.kind === 'common-cause') { const m = f.text.match(/"([^"]+)"/); if (m) ccBarrierNames.add(m[1]); } });

        // layout: leaves in vertical slots, parents at the mean of their children,
        // root beside the knot, deeper levels stepping left (mirrored tree).
        tLeaves.forEach((n, i) => { n.y = tLeaves.length <= 1 ? cy : 48 + i * (H - 96) / (tLeaves.length - 1); });
        (function place(n) { if (!n || n.leaf) return; n.kids.forEach(place); n.y = n.kids.reduce((a, k) => a + k.y, 0) / (n.kids.length || 1); })(tRoot);
        // symmetry rule (same as the FTA canvas): the top event anchors the layout —
        // shift the whole tree so the root sits level with the knot, clamped in-frame.
        if (tRoot && tNodes.length) {
            let minY = Infinity, maxY = -Infinity;
            tNodes.forEach(n => { if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y; });
            let d = cy - tRoot.y;
            d = Math.max(d, 40 - minY);
            d = Math.min(d, (H - 40) - maxY);
            tNodes.forEach(n => { n.y += d; });
        }
        const colX = []; let _cur = treeRight;
        for (let d = 0; d <= maxDepth; d++) { colX[d] = _cur - (depthW[d] * tScale) / 2; _cur -= depthW[d] * tScale + GAP * tScale; }
        const xFor = n => colX[n.depth];
        const bwOf = n => (n.isGate && !n.leaf) ? GATE_W : (n.isTransfer ? 24 : Math.min(boxW, depthW[n.depth] * tScale));
        const spfLids = new Set(); ev.cutsets.forEach(set => { if (set.length === 1) spfLids.add(String(set[0])); });
        const ccLidSet = new Set(ev.ccLids || []);

        let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block;margin:4px 0 14px;" xmlns="http://www.w3.org/2000/svg" font-family="inherit">';

        // -- draw the fault tree --
        if (tRoot) {
            const cap = (page.name || page.id || '').toUpperCase();
            s += '<text x="' + treeLeft + '" y="16" font-size="10" letter-spacing=".5" fill="var(--color-text-tertiary,#889)">FAULT TREE — ' + _esc(cap.length > 22 ? cap.slice(0, 21) + '…' : cap) + '<title>' + _esc(page.name || page.id || '') + '</title></text>';
            // IEC-style glyphs, drawn to a clean 30×26 footprint, output to the right.
            const gateGlyph = (x, y, type) => {
                if (type === 'AND' || type === 'INHIBIT')
                    return '<path d="M ' + (x - 14) + ',' + (y - 13) + ' h 12 a 13 13 0 0 1 0 26 h -12 z" fill="var(--color-surface,#fff)" stroke="#445" stroke-width="1.7" stroke-linejoin="round"/>' +
                        (type === 'INHIBIT' ? '<text x="' + (x - 4) + '" y="' + (y + 2.5) + '" text-anchor="middle" font-size="7" fill="#445">INH</text>' : '');
                return '<path d="M ' + (x - 14) + ',' + (y - 13) + ' Q ' + (x - 5) + ',' + y + ' ' + (x - 14) + ',' + (y + 13) + ' Q ' + (x + 1) + ',' + (y + 10) + ' ' + (x + 13) + ',' + y + ' Q ' + (x + 1) + ',' + (y - 10) + ' ' + (x - 14) + ',' + (y - 13) + ' z" fill="var(--color-surface,#fff)" stroke="#445" stroke-width="1.7" stroke-linejoin="round"/>';
            };
            // leader lines: child output → forward junction in the column gap →
            // parent input. Columns are strictly ordered, so lines never run back.
            tLinks.forEach(([p, c]) => {
                const px = xFor(p) - (p.isGate && !p.leaf ? 14 : bwOf(p) / 2);
                const cx2 = xFor(c) + ((c.isGate && !c.leaf) ? 13 : (c.isTransfer ? 10 : bwOf(c) / 2));
                const midX = px - (GAP * tScale) / 2;
                s += '<path d="M ' + cx2 + ',' + c.y + ' H ' + midX + ' V ' + p.y + ' H ' + px + '" fill="none" stroke="var(--color-text-tertiary,#9aa3b2)" stroke-width="1.4" stroke-linejoin="round"/>';
            });
            tNodes.forEach(n => {
                const x = xFor(n);
                const _nav = ' style="cursor:pointer;" onclick="btOpenFta(\'' + _esc(page.id) + '\')"';
                if (n.isGate && !n.leaf) {
                    s += '<g' + _nav + '>' + gateGlyph(x, n.y, n.gateType) + '<title>' + _esc((n.gateType || 'GATE') + ' — ' + n.full) + '</title></g>';
                    return;
                }
                if (n.isTransfer) {
                    s += '<g' + _nav + '><path d="M ' + (x - 10) + ',' + (n.y - 10) + ' h 20 l -10 20 z" fill="var(--color-surface,#fff)" stroke="#556" stroke-width="1.4"/><title>TRANSFER — ' + _esc(n.full) + '</title></g>';
                    return;
                }
                const spf = spfLids.has(n.lid), cc = ccLidSet.has(n.lid);
                const stroke = cc || spf ? '#b42318' : (n.more || n.trunc) ? 'var(--color-border-hair,rgba(0,0,0,.3))' : '#8892a4';
                const fill = cc ? 'rgba(180,35,24,.07)' : 'var(--color-surface,#fff)';
                const tCol = cc || spf ? '#b42318' : 'var(--color-text-secondary,#49515e)';
                const bw = bwOf(n);
                // event DESCRIPTIONS, not ids — wrapped to two lines, id in the tooltip
                const wchars = Math.max(12, Math.floor(bw / 5.3));
                const wrap2 = (t, w) => { t = String(t); if (t.length <= w) return [t]; let cut = t.lastIndexOf(' ', w); if (cut < 4) cut = w; const a = t.slice(0, cut); let b = t.slice(cut).trim(); if (b.length > w) b = b.slice(0, w - 1) + '…'; return [a, b]; };
                const lines = wrap2(n.more ? n.label : (n.full || n.label), wchars);
                const txt = lines.length === 1
                    ? '<tspan x="' + x + '" y="' + (n.y + 3) + '">' + _esc(lines[0]) + (n.trunc ? ' ▽' : '') + '</tspan>'
                    : '<tspan x="' + x + '" y="' + (n.y - 2.5) + '">' + _esc(lines[0]) + '</tspan><tspan x="' + x + '" y="' + (n.y + 8.5) + '">' + _esc(lines[1]) + (n.trunc ? ' ▽' : '') + '</tspan>';
                s += '<g' + _nav + '><rect x="' + (x - bw / 2) + '" y="' + (n.y - boxH / 2) + '" width="' + bw + '" height="' + boxH + '" rx="4" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (spf || cc ? 1.8 : 1.3) + '"' + ((n.more || n.trunc) ? ' stroke-dasharray="4 3"' : '') + '/>' +
                    '<text text-anchor="middle" font-size="8.8" fill="' + tCol + '">' + txt + '</text>' +
                    '<title>' + _esc(n.full) + (n.label && n.label !== n.full ? ' [' + _esc(n.label) + ']' : '') + (n.lid && n.lid !== n.label ? ' (' + n.lid + ')' : '') + (spf ? ' — SINGLE-POINT FAILURE' : '') + (cc ? ' — shared with a mitigation barrier (COMMON CAUSE)' : '') + (n.trunc ? ' — subtree truncated for display; open the fault tree for full depth' : '') + '</title></g>';
            });
            // root output → knot: horizontal (the symmetry shift put the root level
            // with the knot), with an elbow only if clamping moved it off-axis.
            const rx = xFor(tRoot) + ((tRoot.isGate && !tRoot.leaf) ? 13 : bwOf(tRoot) / 2);
            const kx = knotX - knotW / 2;
            s += (Math.abs(tRoot.y - cy) < 1)
                ? '<path d="M ' + rx + ',' + cy + ' H ' + kx + '" fill="none" stroke="#49515e" stroke-width="1.8"/>'
                : '<path d="M ' + rx + ',' + tRoot.y + ' H ' + ((rx + kx) / 2) + ' V ' + cy + ' H ' + kx + '" fill="none" stroke="#49515e" stroke-width="1.8" stroke-linejoin="round"/>';
        }
        // -- the EVENT TREE, drawn in the same language as the fault tree: boxes,
        //    orthogonal leader lines, one split column per barrier (✓ holds up,
        //    ✗ fails down), outcome boxes with severity + frequency.
        if (oc.length && etaBars.length) {
            const nB = etaBars.length;
            const boxW2 = 118, boxH2 = 32;
            const etaLeft = mbX + 72;
            const boxX = W - 24 - boxW2 / 2;
            const colW2 = (boxX - boxW2 / 2 - etaLeft - 14) / nB;
            // caption + barrier column headers (mirrors the FAULT TREE caption)
            etaBars.forEach((b, i) => {
                const hx = etaLeft + colW2 * i + colW2 / 2;
                const nm = String(b.name || 'barrier').toUpperCase();
                s += '<text x="' + hx + '" y="16" text-anchor="middle" font-size="9" letter-spacing=".4" fill="var(--color-text-tertiary,#889)">' + _esc(nm.length > 20 ? nm.slice(0, 19) + '…' : nm) + '<title>' + _esc(b.name || '') + (b.pFail != null ? ' — P(fail) = ' + b.pFail : '') + '</title></text>';
            });
            const byKey = {}; oc.forEach(o => { byKey[o.key] = o; });
            const leafY = i => oc.length <= 1 ? cy : 44 + i * (H - 88) / (oc.length - 1);
            // pass 1 — layout: leaves in traversal order (success first), parents at the mean
            const internals = [], leaves = [];
            let li = 0;
            (function layout(depth, mask) {
                if (depth === nB) { const y = leafY(li++); leaves.push({ mask, y }); return y; }
                const yT = layout(depth + 1, mask);
                const yB = layout(depth + 1, mask | (1 << depth));
                const y = (yT + yB) / 2;
                internals.push({ depth, y, yT, yB });
                return y;
            })(0, 0);
            const splitX = d => etaLeft + colW2 * d + colW2 / 2;
            const LN = 'fill="none" stroke="var(--color-text-tertiary,#9aa3b2)" stroke-width="1.4" stroke-linejoin="round"';
            // knot → first split
            s += '<path d="M ' + (knotX + knotW / 2) + ',' + cy + ' H ' + splitX(0) + '" ' + LN + '/>';
            // splits: vertical bar + branch stubs + ✓/✗ marks
            internals.forEach(nd => {
                const x = splitX(nd.depth), nx = (nd.depth + 1 < nB) ? splitX(nd.depth + 1) : (boxX - boxW2 / 2);
                const bar = etaBars[nd.depth];
                s += '<path d="M ' + x + ',' + nd.yT + ' V ' + nd.yB + '" ' + LN + '><title>' + _esc(String(bar && bar.name || '')) + (bar && bar.pFail != null ? ' — P(fail) = ' + bar.pFail : '') + '</title></path>';
                s += '<path d="M ' + x + ',' + nd.yT + ' H ' + nx + '" ' + LN + '/><path d="M ' + x + ',' + nd.yB + ' H ' + nx + '" ' + LN + '/>';
                s += '<text x="' + (x + 5) + '" y="' + (nd.yT - 4) + '" font-size="8" fill="var(--color-success,#1a7f37)">✓</text>' +
                     '<text x="' + (x + 5) + '" y="' + (nd.yB - 4) + '" font-size="8" fill="#b42318">✗</text>';
            });
            // outcome boxes — same box grammar as the fault-tree events
            leaves.forEach(lf => {
                const key = lf.mask.toString(2).padStart(Math.max(nB, 1), '0');
                const o = byKey[key];
                const col = _sevColor(o && o.severity);
                const sevTxt = (o && o.severity) || 'unassessed';
                const bad = /cat|haz/i.test(sevTxt);
                s += '<g style="cursor:pointer;" onclick="try{switchTab(\'eta\')}catch(e){}"><rect x="' + (boxX - boxW2 / 2) + '" y="' + (lf.y - boxH2 / 2) + '" width="' + boxW2 + '" height="' + boxH2 + '" rx="4" fill="' + (bad ? 'rgba(180,35,24,.06)' : 'var(--color-surface,#fff)') + '" stroke="' + (o && o.severity ? col : 'var(--color-border-hair,rgba(0,0,0,.3))') + '" stroke-width="' + (bad ? 1.8 : 1.3) + '"' + (o && o.severity ? '' : ' stroke-dasharray="4 3"') + '/>' +
                    '<text text-anchor="middle" font-size="8.8"><tspan x="' + boxX + '" y="' + (lf.y - 2.5) + '" fill="' + (o && o.severity ? col : 'var(--color-text-tertiary,#889)') + '">' + _esc(sevTxt) + '</tspan><tspan x="' + boxX + '" y="' + (lf.y + 8.5) + '" fill="var(--color-text-tertiary,#889)" font-family="var(--font-mono,monospace)">' + _fmt(o && o.freq) + ' /FH</tspan></text>' +
                    '<title>' + _esc(o ? o.seq.join(' → ') : key) + '</title></g>';
            });
        } else if (oc.length) {
            // outcomes without barrier structure (degenerate ETA) — plain outcome boxes
            oc.forEach((o, i) => {
                const y = yFor(i, oc.length), col = _sevColor(o.severity);
                s += '<path d="M ' + (knotX + knotW / 2) + ',' + cy + ' H ' + (mbX + 40) + ' V ' + y + ' H ' + (W - 160) + '" fill="none" stroke="var(--color-text-tertiary,#9aa3b2)" stroke-width="1.4" stroke-linejoin="round"/>';
                s += '<text x="' + (W - 152) + '" y="' + (y + 3.5) + '" font-size="9.5" fill="' + col + '">' + _esc(o.severity || 'unassessed') + ' <tspan font-family="var(--font-mono,monospace)" fill="var(--color-text-tertiary,#889)">' + _fmt(o.freq) + '</tspan></text>';
            });
        }
        // barrier lanes
        const lane = (x, list, label) => {
            let t = '<line x1="' + x + '" y1="26" x2="' + x + '" y2="' + (H - 26) + '" stroke="var(--color-border-hair,rgba(0,0,0,.18))" stroke-width="1" stroke-dasharray="3 4"/>';
            t += '<text x="' + x + '" y="16" text-anchor="middle" font-size="10" letter-spacing=".5" fill="var(--color-text-tertiary,#889)">' + label + '</text>';
            const n = list.length;
            list.forEach((b, i) => {
                const y = n <= 1 ? cy : cy + (i - (n - 1) / 2) * 34;
                const traced = (b.trace && b.trace.kind && b.trace.kind !== 'none' && (b.trace.ref || b.trace.logicalId)) || b.requirementId || b.principleId;
                const cc = ccBarrierNames.has(b.name || '');
                const stroke = cc ? '#b42318' : traced ? 'var(--color-success,#1a7f37)' : '#b7791f';
                const wPill = 118;
                t += '<g style="cursor:pointer;" onclick="btTraceBarrier(\'' + b.id + '\')"><rect x="' + (x - wPill / 2) + '" y="' + (y - 12) + '" width="' + wPill + '" height="24" rx="12" fill="var(--color-surface,#fff)" stroke="' + stroke + '" stroke-width="' + (cc ? 2.5 : 1.4) + '"' + (traced || cc ? '' : ' stroke-dasharray="4 3"') + '/>' +
                    '<text x="' + x + '" y="' + (y + 4) + '" text-anchor="middle" font-size="10.5" fill="' + (cc ? '#b42318' : 'var(--color-text-secondary,#556)') + '">' + _esc(String(b.name || '?').length > 18 ? String(b.name).slice(0, 17) + '…' : (b.name || '?')) + '</text>' +
                    '<title>' + _esc(b.name || '?') + (cc ? ' — COMMON CAUSE with a cause cut set' : traced ? ' — traced' : ' — untraced (generic)') + '</title></g>';
            });
            return t;
        };
        s += lane(pbX, ev.preventive, 'PREVENTIVE BARRIERS');
        s += lane(mbX, ev.mitigative, 'MITIGATIVE BARRIERS');
        // the knot
        if (ev.verif) {
            const exceeded = ev.verif.pAchieved > ev.verif.pAllocated;
            s += '<g><rect x="' + (knotX - knotW / 2) + '" y="' + (cy - 34) + '" width="' + knotW + '" height="68" rx="10" fill="var(--color-surface,#fff)" stroke="' + (exceeded ? '#b42318' : 'var(--color-text-secondary,#556)') + '" stroke-width="2"/>' +
                '<text x="' + knotX + '" y="' + (cy - 18) + '" text-anchor="middle" font-size="10" letter-spacing=".4" fill="var(--color-text-tertiary,#889)">CRITICAL EVENT</text>' +
                '<text x="' + knotX + '" y="' + (cy - 3) + '" text-anchor="middle" font-size="10.5" font-family="var(--font-mono,monospace)" fill="var(--color-text-secondary,#556)">alloc ' + _fmt(ev.verif.pAllocated) + '</text>' +
                '<text x="' + knotX + '" y="' + (cy + 12) + '" text-anchor="middle" font-size="10.5" font-weight="700" font-family="var(--font-mono,monospace)" fill="' + (exceeded ? '#b42318' : 'var(--color-success,#1a7f37)') + '">achieved ' + _fmt(ev.verif.pAchieved) + '</text>' +
                '<text x="' + knotX + '" y="' + (cy + 26) + '" text-anchor="middle" font-size="9" fill="var(--color-text-tertiary,#889)">/FH · BDD-exact · two-lane</text>' +
                '<title>' + _esc(ev.critLabel || bt.name) + ' — allocation vs verification (' + _esc(ev.verif.otherName) + ')' + (exceeded ? ' — ACHIEVED EXCEEDS BUDGET' : '') + '</title></g>';
        } else {
            s += '<g><rect x="' + (knotX - knotW / 2) + '" y="' + (cy - 30) + '" width="' + knotW + '" height="60" rx="10" fill="var(--color-surface,#fff)" stroke="var(--color-text-secondary,#556)" stroke-width="2"/>' +
                '<text x="' + knotX + '" y="' + (cy - 10) + '" text-anchor="middle" font-size="10" letter-spacing=".4" fill="var(--color-text-tertiary,#889)">CRITICAL EVENT</text>' +
                '<text x="' + knotX + '" y="' + (cy + 8) + '" text-anchor="middle" font-size="13" font-weight="700" fill="var(--color-text,#223)" font-family="var(--font-mono,monospace)">' + _fmt(ev.pCritical) + '</text>' +
                '<text x="' + knotX + '" y="' + (cy + 22) + '" text-anchor="middle" font-size="9" fill="var(--color-text-tertiary,#889)">/FH · BDD-exact</text>' +
                '<title>' + _esc(ev.critLabel || bt.name) + '</title></g>';
        }
        return s + '</svg>';
    }

    function _barrierCard(b, ev) {
        const traced = (b.trace && b.trace.kind && b.trace.kind !== 'none' && (b.trace.ref || b.trace.logicalId)) || b.requirementId || b.principleId;
        const cc = ev.findings.some(f => f.kind === 'common-cause' && f.text.indexOf('"' + (b.name || '') + '"') >= 0);
        const border = cc ? '#b42318' : traced ? 'var(--color-success,#1a7f37)' : 'var(--color-border-hair,rgba(0,0,0,.2))';
        // requirement-link provenance: ⛓ Jama relationship (tier 3) > signed
        // confirmation (tier 2) > text-match candidate awaiting a human (tier 1).
        const reqBadge = !b.requirementId ? '' :
            b.reqTier === 'relationship' ? ' · <span style="color:var(--color-success,#1a7f37);font-weight:600;" title="Derived from the program’s Jama relationship graph — the trace lives in their system of record.">⛓ Jama-traced</span>' :
            (b.reqConfirmed && b.reqConfirmed.by) ? ' · <span style="color:var(--color-success,#1a7f37);" title="Signed ' + _esc(b.reqConfirmed.by) + ' · ' + _esc(String(b.reqConfirmed.at || '').slice(0, 10)) + '">✍ confirmed</span>' :
            b.reqAutoLinked ? ' · <a href="#" onclick="btConfirmReqLink(\'' + b.id + '\');return false;" style="color:#b7791f;font-weight:600;" title="Text-match candidate — confirm to make it a signed trace.">candidate — confirm</a>' : '';
        return '<div style="border:1px solid ' + border + ';border-left-width:3px;border-radius:6px;padding:7px 9px;margin-bottom:6px;font-size:12px;background:var(--color-surface,#fff);">' +
            '<div style="display:flex;justify-content:space-between;gap:6px;"><strong>' + _esc(b.name) + '</strong>' +
            '<span><a href="#" onclick="btTraceBarrier(\'' + b.id + '\');return false;" style="color:var(--color-link,#0b57d0);font-size:11px;">trace</a> · <a href="#" onclick="btRemoveBarrier(\'' + b.id + '\');return false;" style="color:#b42318;font-size:11px;">×</a></span></div>' +
            '<div style="color:var(--color-text-tertiary,#888);font-size:11px;margin-top:2px;">' +
            (traced ? ('→ ' + _esc(b.trace && b.trace.logicalId ? ('component ' + b.trace.logicalId) : (b.requirementId ? ('req ' + b.requirementId) : (b.trace && b.trace.ref) || 'traced'))) : '⚠ untraced (generic)') +
            reqBadge +
            (cc ? ' · <span style="color:#b42318;font-weight:600;">common-cause with a cause cut set</span>' : '') +
            '</div></div>';
    }
    async function btConfirmReqLink(bid) {
        const bt = _bt(); if (!bt) return;
        const b = (bt.barriers || []).find(x => x.id === bid); if (!b || !b.requirementId) return;
        const by = await _ask('Confirm: barrier "' + (b.name || '?') + '" is implemented/enforced by ' + b.requirementId + '. Sign with your name:', (typeof _signoffReviewerName === 'function' && _signoffReviewerName()) || '');
        if (!by || !by.trim()) return;
        b.reqConfirmed = { by: by.trim(), at: new Date().toISOString() };
        _save(); _render();
    }

    function _render() {
        const host = document.getElementById('view-bowtie'); if (!host) return;
        const store = _store();
        const pages = _ftaPages(), etas = _etaStore();

        let head = '<div class="header-with-export"><h3>Bow-Tie Analysis <span style="font-weight:400;font-size:12px;color:var(--color-text-tertiary,#888);">— unified FTA (prevention) ↔ ETA (mitigation)</span></h3></div>';

        // selector + create
        let bar = '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0 14px;">';
        bar += '<select id="bt-select" onchange="btSelect(this.value)" style="padding:6px 8px;border:1px solid var(--color-border-hair,rgba(0,0,0,.2));border-radius:6px;">' +
            store.map(b => '<option value="' + b.id + '"' + (b.id === (_bt() && _bt().id) ? ' selected' : '') + '>' + _esc(b.id + ' · ' + b.name) + '</option>').join('') +
            (store.length ? '' : '<option>— none yet —</option>') + '</select>';
        bar += '<button class="btn-cyan" onclick="btCreate()" style="font-size:12px;">+ New bow-tie</button>';
        bar += '<button class="btn-cyan" onclick="btAutoBuild()" style="font-size:12px;" title="Compile a bow-tie from an existing fault tree: matches the event tree via the shared failure condition, derives barriers from monitor specs, AND-gate redundancy and the event tree, and auto-links requirements (incl. Jama imports).">⚡ Auto-build from fault tree</button>';
        bar += '<button onclick="btAutoLinkAll()" style="font-size:12px;padding:5px 10px;border:1px solid var(--color-border-hair,rgba(0,0,0,.2));border-radius:6px;background:transparent;cursor:pointer;" title="Re-run requirement auto-linking on every bow-tie — run after importing requirements (e.g. from Jama).">↻ Re-link requirements</button>';
        let _tcDim = ''; try { const tc = (typeof window.declaredToolchain === 'function') ? window.declaredToolchain() : null; if (tc && tc.rm && tc.rm.tool && tc.rm.tool !== 'jama') _tcDim = 'opacity:.45;'; } catch (_) {}
        bar += '<button onclick="btJamaPull()" style="font-size:12px;padding:5px 10px;border:1px solid var(--color-border-hair,rgba(0,0,0,.2));border-radius:6px;background:transparent;cursor:pointer;' + _tcDim + '" title="Pull mitigations and requirements for this critical event: relationship-traced items first (tier 3), text matches as candidates.' + (_tcDim ? ' (Declared RM toolchain is not Jama — ReqIF traces still feed tier-3 links automatically.)' : '') + '">🔗 Pull from Jama</button>';
        bar += '<button onclick="jbOpen()" style="font-size:12px;padding:5px 10px;border:1px solid var(--color-border-hair,rgba(0,0,0,.2));border-radius:6px;background:transparent;cursor:pointer;" title="The live bridge: push failure conditions into Jama as items; the program traces its requirements to them there (human act); pull the relationship graph back for tier-3 links.">🔁 Jama bridge</button></div>';

        if (!store.length) {
            host.innerHTML = head + bar + '<p style="color:var(--color-text-secondary,#666);font-size:13px;">A bow-tie joins a <strong>fault tree</strong> (how the critical event happens) to an <strong>event tree</strong> (what happens after), sharing the critical event. Click <em>New bow-tie</em>, pick a fault-tree page as the left side; the fault tree\'s exact top probability becomes the event tree\'s initiator. ' + pages.length + ' fault tree(s) and ' + etas.length + ' event tree(s) available.</p>';
            return;
        }

        const bt = _bt(), ev = bowtieEvaluate(bt);
        // link controls
        let links = '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px;font-size:12px;">';
        links += '<label>Left (fault tree): <select onchange="btSetFta(this.value)" style="padding:4px;border:1px solid var(--color-border-hair,rgba(0,0,0,.2));border-radius:5px;"><option value="">— none —</option>' + pages.map(p => '<option value="' + p.id + '"' + (p.id === bt.ftaPageId ? ' selected' : '') + '>' + _esc(p.name || p.id) + '</option>').join('') + '</select></label>';
        links += '<label>Right (event tree): <select onchange="btSetEta(this.value)" style="padding:4px;border:1px solid var(--color-border-hair,rgba(0,0,0,.2));border-radius:5px;"><option value="">— none —</option>' + etas.map(t => '<option value="' + t.id + '"' + (t.id === bt.etaId ? ' selected' : '') + '>' + _esc(t.id + ' · ' + t.name) + '</option>').join('') + '</select></label>';
        links += '</div>';

        // three columns
        const col = (title, sub, inner) => '<div style="flex:1;min-width:220px;"><div style="font-weight:700;font-size:13px;">' + title + '</div><div style="font-size:11px;color:var(--color-text-tertiary,#888);margin-bottom:8px;">' + sub + '</div>' + inner + '</div>';

        const leftInner =
            ev.preventive.map(b => _barrierCard(b, ev)).join('') +
            '<button onclick="btAddBarrier(\'preventive\')" style="font-size:11px;padding:4px 8px;border:1px dashed var(--color-border-hair,rgba(0,0,0,.3));border-radius:6px;background:transparent;cursor:pointer;">+ preventive barrier</button>' +
            '<div style="margin-top:10px;font-size:11px;color:var(--color-text-tertiary,#888);">Cut sets: ' + ev.cutsets.length + (ev.spf ? ' · <span style="color:#b42318;font-weight:600;">' + ev.spf + ' single-point</span>' : ' · no SPF') + '</div>';

        const centre =
            '<div style="text-align:center;border:2px solid var(--color-text-secondary,#666);border-radius:10px;padding:14px 10px;background:var(--color-surface,#fff);">' +
            '<div style="font-size:11px;color:var(--color-text-tertiary,#888);text-transform:uppercase;letter-spacing:.5px;">Critical event</div>' +
            '<div style="font-weight:700;font-size:13px;margin:4px 0;">' + _esc(ev.critLabel || bt.name) + '</div>' +
            '<div style="font-size:18px;font-weight:700;">' + _fmt(ev.pCritical) + '<span style="font-size:11px;font-weight:400;color:#888;"> /FH</span></div>' +
            '<div style="font-size:10px;color:#888;">from the fault tree (BDD-exact)</div>' +
            (ev.verif ? '<div style="font-size:10.5px;margin-top:6px;font-family:var(--font-mono,monospace);border-top:1px solid var(--color-border-hair,rgba(0,0,0,.1));padding-top:5px;">alloc ' + _fmt(ev.verif.pAllocated) + '<br><span style="font-weight:700;color:' + (ev.verif.pAchieved > ev.verif.pAllocated ? '#b42318' : 'var(--color-success,#1a7f37)') + ';">achieved ' + _fmt(ev.verif.pAchieved) + (ev.verif.pAchieved > ev.verif.pAllocated ? ' ✗ over budget' : ' ✓') + '</span><div style="font-size:9px;color:#888;" title="' + _esc(ev.verif.otherName) + '">allocation ⇄ verification pair</div></div>' : '') +
            '</div>';

        const rightInner =
            ev.mitigative.map(b => _barrierCard(b, ev)).join('') +
            '<button onclick="btAddBarrier(\'mitigative\')" style="font-size:11px;padding:4px 8px;border:1px dashed var(--color-border-hair,rgba(0,0,0,.3));border-radius:6px;background:transparent;cursor:pointer;">+ mitigative barrier</button>' +
            (ev.etaLinked
                ? '<div style="margin-top:10px;"><div style="font-size:11px;color:var(--color-text-tertiary,#888);margin-bottom:4px;">Consequence paths (initiator sourced from P above' + (ev.etaClosed ? '' : ' · <span style="color:#b42318;">paths do not sum to 1</span>') + '):</div>' +
                    ev.outcomes.slice(0, 6).map(o => '<div style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0;border-top:1px solid var(--color-border-hair,rgba(0,0,0,.07));">' + (o.severity ? _sevPill(o.severity) : '<span style="color:var(--color-text-tertiary);">unassessed</span>') + '<span style="font-family:var(--font-mono,monospace);">' + _fmt(o.freq) + '</span></div>').join('') +
                    (ev.outcomes.length > 6 ? '<div style="font-size:10px;color:#888;">+' + (ev.outcomes.length - 6) + ' more</div>' : '') + '</div>'
                : '<div style="margin-top:10px;font-size:11px;color:var(--color-text-tertiary,#888);">No event tree linked — pick one above to compile consequence paths.</div>');

        const rawDiagram = _svgDiagram(bt, ev);
        const diagram = rawDiagram
            ? '<div id="bt-canvas" style="position:relative;overflow:hidden;border:1px solid var(--color-border-hair,rgba(0,0,0,.08));border-radius:10px;background:var(--color-surface,#fff);">' + rawDiagram +
              '<div style="position:absolute;top:8px;right:8px;display:flex;gap:4px;">' +
              '<button onclick="_btZoom(1.25)" title="Zoom in" style="width:26px;height:26px;border:1px solid var(--color-border-hair,rgba(0,0,0,.2));border-radius:6px;background:var(--color-surface,#fff);cursor:pointer;font-size:14px;line-height:1;">+</button>' +
              '<button onclick="_btZoom(0.8)" title="Zoom out" style="width:26px;height:26px;border:1px solid var(--color-border-hair,rgba(0,0,0,.2));border-radius:6px;background:var(--color-surface,#fff);cursor:pointer;font-size:14px;line-height:1;">−</button>' +
              '<button onclick="_btZoomReset()" title="Reset view" style="width:26px;height:26px;border:1px solid var(--color-border-hair,rgba(0,0,0,.2));border-radius:6px;background:var(--color-surface,#fff);cursor:pointer;font-size:12px;line-height:1;">⟲</button></div>' +
              '</div>' +
              '<div style="font-size:10.5px;color:var(--color-text-tertiary,#999);margin:2px 0 12px;">drag to pan · ⌘/Ctrl + scroll or buttons to zoom · double-click to reset · click an event, barrier or outcome to open it</div>'
            : '';

        const cols = '<div style="display:flex;gap:14px;align-items:flex-start;">' +
            col('◀ Threats & prevention', 'fault-tree causes → barriers', leftInner) +
            '<div style="flex:0 0 200px;align-self:center;">' + centre + '</div>' +
            col('Mitigation & consequences ▶', 'barriers → event-tree outcomes', rightInner) + '</div>';

        // findings
        let findings = '';
        if (ev.findings.length) {
            findings = '<div style="margin-top:16px;border:1px solid var(--color-border-hair,rgba(0,0,0,.14));border-radius:8px;padding:12px 14px;">' +
                '<strong style="font-size:13px;">Barrier findings (' + ev.findings.length + ')</strong>' +
                ev.findings.map(f => '<div style="display:flex;gap:8px;font-size:12px;padding:6px 0;border-top:1px solid var(--color-border-hair,rgba(0,0,0,.07));"><span style="flex:0 0 auto;color:' + (f.sev === 'high' ? '#b42318' : '#b7791f') + ';font-weight:700;">' + (f.sev === 'high' ? '●' : '○') + '</span><span>' + _esc(f.text) + '</span></div>').join('') + '</div>';
        } else {
            findings = '<div style="margin-top:16px;font-size:12px;color:var(--color-success,#1a7f37);">✓ No barrier findings — every barrier traces to evidence and no mitigation shares a cause cut set.</div>';
        }

        host.innerHTML = head + bar + links + diagram + cols + findings;
        try { _initCanvas(); } catch (_) {}
    }

    // link setters
    function btSetFta(v) { const bt = _bt(); if (bt) { bt.ftaPageId = v; _save(); _render(); } }
    function btSetEta(v) { const bt = _bt(); if (bt) { bt.etaId = v; _save(); _render(); } }
    function btSelect(v) { _sel = v; _render(); }
    async function btCreate() {
        const pages = _ftaPages(); if (!pages.length) { _toast('Create a fault tree first — it is the left side of the bow-tie.', 'warn'); return; }
        const name = await _ask('Name this bow-tie (usually the critical event):', ''); if (name === null) return;
        createBowtie(name, pages[0].id, (_etaStore()[0] || {}).id || '');
    }

    // ---- page registration (born-modular; mirrors event_trees.js) ------------
    function _ensurePage() {
        if (!document.getElementById('view-bowtie')) {
            const eta = document.getElementById('view-eta');
            if (!eta || !eta.parentNode) return false;
            const v = document.createElement('div'); v.id = 'view-bowtie'; v.style.display = 'none';
            eta.parentNode.insertBefore(v, eta.nextSibling);
        }
        // 23 Aug 2026 (3) — the nav row is GONE (Waqas: tree options are TABS under
        // Fault Trees, "instead of left nav menu options"). prove_tabs.js renders
        // the Bow-Tie tab, lane-gated; only the view mounts here now.
        return true;
    }
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._btWrapped) { return; }
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-bowtie');
                if (v) v.style.display = (tabId === 'bowtie') ? 'block' : 'none';
                const s = document.getElementById('snav-bowtie');
                if (s) s.classList.toggle('snav-active', tabId === 'bowtie');
                if (tabId === 'bowtie') _render();
            } catch (_) {}
            return r;
        };
        wrapped._btWrapped = true;
        window.switchTab = wrapped;
    })();
    function _ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
    _ready(function () { let tries = 30; const t = setInterval(function () { if (_ensurePage() || --tries <= 0) clearInterval(t); }, 250); });

    // ---- canvas: click-through navigation + pan/zoom (read-only — the bow-tie
    //      stays a compiled rendering; editing lives in the FTA/ETA editors) ----
    function btOpenFta(pageId) {
        try { switchTab('fta'); } catch (_) {}
        try {
            window.activeFTAPageId = pageId;
            if (typeof renderFTASidebar === 'function') renderFTASidebar();
            if (typeof updateD3 === 'function') updateD3();
        } catch (_) {}
    }
    function _initCanvas() {
        const wrap = document.getElementById('bt-canvas'); if (!wrap) return;
        const svg = wrap.querySelector('svg'); if (!svg) return;
        const vb0 = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
        if (vb0.length !== 4 || vb0.some(isNaN)) return;
        let vb = vb0.slice();
        const apply = () => svg.setAttribute('viewBox', vb.join(' '));
        const zoomAt = (fx, fy, k) => {
            const w = vb[2] / k, h = vb[3] / k;
            vb[0] += (vb[2] - w) * fx; vb[1] += (vb[3] - h) * fy; vb[2] = w; vb[3] = h;
            if (vb[2] >= vb0[2]) vb = vb0.slice();      // zooming out past 1:1 resets the frame
            apply();
        };
        svg.style.cursor = 'grab'; svg.style.touchAction = 'none';
        svg.addEventListener('wheel', e => {
            if (!e.ctrlKey && !e.metaKey) return;       // plain scroll keeps scrolling the page
            e.preventDefault();
            const r = svg.getBoundingClientRect();
            zoomAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, e.deltaY < 0 ? 1.2 : 1 / 1.2);
        }, { passive: false });
        let drag = null;
        svg.addEventListener('pointerdown', e => {
            if (e.target && e.target.closest && e.target.closest('[onclick]')) return;   // clicks stay clicks
            drag = { x: e.clientX, y: e.clientY, vb: vb.slice() };
            try { svg.setPointerCapture(e.pointerId); } catch (_) {}
            svg.style.cursor = 'grabbing';
        });
        svg.addEventListener('pointermove', e => {
            if (!drag) return;
            const r = svg.getBoundingClientRect();
            vb[0] = drag.vb[0] - (e.clientX - drag.x) * vb[2] / r.width;
            vb[1] = drag.vb[1] - (e.clientY - drag.y) * vb[3] / r.height;
            apply();
        });
        const end = () => { drag = null; svg.style.cursor = 'grab'; };
        svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
        svg.addEventListener('dblclick', () => { vb = vb0.slice(); apply(); });
        window._btZoom = k => zoomAt(0.5, 0.5, k);
        window._btZoomReset = () => { vb = vb0.slice(); apply(); };
    }
    window.btOpenFta = btOpenFta;

    // exports
    window.bowtieEvaluate = bowtieEvaluate;
    window.btLedgerHits = btLedgerHits;
    window.btCreate = btCreate; window.btSelect = btSelect; window.btSetFta = btSetFta; window.btSetEta = btSetEta;
    window.btAutoBuild = btAutoBuild; window.btAutoBuildFrom = btAutoBuildFrom; window.btAutoLinkAll = btAutoLinkAll;
    window.btJamaPull = btJamaPull; window.btJamaApply = btJamaApply; window.btConfirmReqLink = btConfirmReqLink;
    window.btAddBarrier = addBarrier; window.btTraceBarrier = traceBarrier; window.btRemoveBarrier = removeBarrier;
    window._renderBowtie = _render;
})();
