// ============================================================================
// q_completeness.js — v1.0 — the App Q OUTPUT-SET HARNESS.
//
// Waqas's ruling (2 Aug, reaffirmed 4 Aug): ARP4761A Appendix Q — the
// contiguous worked example that carries ONE aircraft and ONE system through
// every analysis in the standard — is our definition of "complete". So
// completeness stops being a feeling and becomes a checklist: walk the open
// project and verdict each App Q output box as present / partial / absent,
// plus the trace edges between them. Same spirit as the invariants wall, one
// level up: document-set rather than row level.
//
// DOCTRINE
//  · PURE READS. This module writes nothing, ever — it reports on the project
//    it is given. Stores are read by BARE IDENTIFIER (the 3 Aug lesson: app
//    stores are top-level `let`, NOT on window).
//  · SCOPE-AWARE. A lane the programme never committed reads NOT IN PLAN, and
//    is never a gap — the same rule A11 follows. An UNKNOWN lane id fails safe
//    as committed, so a catalogue rename can never quietly hide a box.
//  · ADVISORY. Nothing here blocks a baseline. It reports.
//  · NOTHING IS SILENTLY OMITTED. A box excluded by ruling is rendered as
//    excluded, with the reason, rather than deleted from the map — an output
//    map that quietly drops a box is exactly the "wrong number wearing a green
//    tick" this project keeps finding.
//
// Q.7 — DEPENDENCE DIAGRAM: OUT OF SCOPE by Waqas's ruling of 4 Aug. Recorded
// because the record was wrong before: the 2 Aug deep-read card read Q.7's
// "DD" as Design Description and slate ruling #9 answered that card. Verified
// against the source: Appendix H is titled "Dependence Diagram (DD)", and Q.7
// is the BSCU dependence-diagram example, offered by the standard as an
// alternative means to the FTA for the SSA — an analysis, not an input
// document. "Design Description" appears in §G.8.2's title (a review step),
// never at Q.7. He does not want a DD lane in the picture, so the box carries
// EXCLUDED-BY-RULING and the map says so rather than pretending Q.7 is
// satisfied or that it does not exist.
// ============================================================================
(function () {
    'use strict';

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ---- store readers: BARE IDENTIFIER, never window[name] -----------------
    const R = {
        acFha:  () => (typeof acFhaData !== 'undefined' && Array.isArray(acFhaData)) ? acFhaData : [],
        acReq:  () => (typeof acReqData !== 'undefined' && Array.isArray(acReqData)) ? acReqData : [],
        sys:    () => (typeof systemsData !== 'undefined' && Array.isArray(systemsData)) ? systemsData : [],
        pages:  () => (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) ? ftaPages : [],
        fcim:   () => (typeof acFcimData !== 'undefined' && Array.isArray(acFcimData)) ? acFcimData : [],
        cma:    () => (typeof cmaData !== 'undefined' && Array.isArray(cmaData)) ? cmaData : [],
        zsa:    () => (typeof zsaData !== 'undefined' && Array.isArray(zsaData)) ? zsaData : [],
        pra:    () => (typeof praData !== 'undefined' && Array.isArray(praData)) ? praData : [],
        cfg:    () => (typeof projectConfig !== 'undefined' && projectConfig) ? projectConfig : {}
    };
    const sysFha = () => R.sys().reduce((a, s) => a.concat((s && s.fha) || []), []);
    const sysReq = () => R.sys().reduce((a, s) => a.concat((s && s.req) || []), []);
    // FMEA rows live in a GLOBAL store, NOT on systemsData[].fmea — verified
    // live 4 Aug: systems carry no fmea key at all, and the first draft of this
    // probe read one, so a project with 24 FMEA rows reported ABSENT. §8: an
    // empty result reads as "you have none", never as "I looked in the wrong
    // place". The system-scoped read is kept as a fallback, not as the truth.
    const allFmea = () => {
        const g = (typeof fmeaData !== 'undefined' && Array.isArray(fmeaData)) ? fmeaData : [];
        return g.length ? g : R.sys().reduce((a, s) => a.concat((s && s.fmea) || []), []);
    };
    // Collections in this codebase are arrays, Maps, or wrapper objects
    // ({nodes, edges} / {rows, …} / {groups, …}). Counting with `.length`
    // alone silently reports zero for the other two — which is exactly how the
    // CEA box reported ABSENT against a live 20-node graph.
    function _count(x) {
        if (!x) return 0;
        if (Array.isArray(x)) return x.length;
        if (typeof Map !== 'undefined' && x instanceof Map) return x.size;
        if (typeof Set !== 'undefined' && x instanceof Set) return x.size;
        if (typeof x === 'object') {
            for (const k of ['rows', 'groups', 'items', 'nodes', 'list']) if (x[k] != null) return _count(x[k]);
            return Object.keys(x).length;
        }
        return 0;
    }
    const isCritical = f => f && (f.severity === 'Catastrophic' || f.severity === 'Hazardous');
    const allocPages = () => R.pages().filter(p => p && p.root && !p.verifies);
    const verifPages = () => R.pages().filter(p => p && p.root && p.verifies);

    // ---- programme scope ----------------------------------------------------
    // Unknown lane ids FAIL SAFE as committed (A11's rule): never hide a
    // standard output because a lane was renamed in the catalogue.
    function laneCommitted(laneId) {
        if (!laneId) return true;
        try {
            const P = (typeof window !== 'undefined') ? window.PROGRAM_PLAN : null;
            if (!P || typeof P.laneOn !== 'function') return true;
            const v = P.laneOn(laneId);
            return (v === false) ? false : true;
        } catch (_) { return true; }
    }

    // ---- the map ------------------------------------------------------------
    // Each box: clause + title (SAE posture — number and title only), the lane
    // that governs whether it applies, and a PURE probe returning
    // { have, total, detail }. `have` false with total 0 ⇒ absent;
    // have true with a shortfall ⇒ partial.
    const MAP = [
        { id: 'Q.3', title: 'Aircraft Functional Hazard Assessment (AFHA)', lane: null,
          probe: () => { const f = R.acFha(); const cls = f.filter(x => x && x.severity).length;
                         return { have: f.length > 0, complete: f.length > 0 && cls === f.length,
                                  detail: f.length ? cls + ' of ' + f.length + ' failure conditions classified' : 'no aircraft failure conditions' }; } },

        { id: 'Q.4', title: 'Preliminary Aircraft Safety Assessment (PASA)', lane: null,
          probe: () => { const crit = R.acFha().filter(isCritical);
                         const linked = crit.filter(f => allocPages().some(p => {
                             const ids = (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length) ? p.linkedFhaIds : (p.linkedFhaId ? [p.linkedFhaId] : []);
                             return ids.indexOf(f.internalId) >= 0; })).length;
                         const reqs = R.acReq().filter(r => r && !r.deleted).length;
                         return { have: allocPages().length > 0 || reqs > 0,
                                  complete: crit.length > 0 && linked === crit.length && reqs > 0,
                                  detail: linked + ' of ' + crit.length + ' Cat/Haz allocated · ' + reqs + ' aircraft requirements' }; } },

        { id: 'Q.5', title: 'System Functional Hazard Assessment (SFHA)', lane: null,
          probe: () => { const f = sysFha(); const cls = f.filter(x => x && x.severity).length;
                         return { have: f.length > 0, complete: f.length > 0 && cls === f.length,
                                  detail: f.length ? cls + ' of ' + f.length + ' system failure conditions classified across ' + R.sys().length + ' systems' : 'no system failure conditions' }; } },

        { id: 'Q.6', title: 'Preliminary System Safety Assessment (PSSA)', lane: null,
          probe: () => { const withTrees = R.sys().filter(s => allocPages().some(p => p.systemId === s.id)).length;
                         const fcim = R.fcim().length;
                         return { have: withTrees > 0 || fcim > 0, complete: R.sys().length > 0 && withTrees === R.sys().length,
                                  detail: withTrees + ' of ' + R.sys().length + ' systems carry allocation trees · ' + fcim + ' FCIM rows' }; } },

        // Q.7 — see the header. Excluded by ruling, NAMED not deleted.
        { id: 'Q.7', title: 'Dependence Diagram (DD)', lane: null, excluded: true,
          excludedWhy: 'out of scope by ruling (Waqas, 4 Aug 2026) — the DD lane is not part of this program\'s output set. Q.7 is the standard\'s dependence-diagram example, an alternative means to the FTA for the SSA; the earlier record misread it as a Design Description.',
          probe: () => ({ have: false, complete: false, detail: 'excluded by ruling' }) },

        { id: 'Q.8', title: 'Markov Analysis (MA)', lane: 'markov',
          probe: () => { const m = (R.cfg().markovModels || []); const attached = R.pages().reduce((a, p) => {
                             let n = 0; (function w(x) { if (!x) return; if (x.markovModelId) n++; (x.children || x._children || []).forEach(w); })(p.root); return a + n; }, 0);
                         return { have: m.length > 0, complete: m.length > 0 && attached > 0,
                                  detail: m.length + ' models · ' + attached + ' attached events' }; } },

        { id: 'Q.9', title: 'Model Based Safety Analysis (MBSA)', lane: 'mbsa',
          probe: () => { let s = null; try { if (typeof macStats === 'function') s = macStats(); } catch (_) {}
                         // macStats() → { rules, combos, spf, unsub } (verified live).
                         return { have: !!(s && s.rules > 0), complete: !!(s && s.rules > 0 && !s.unsub),
                                  detail: s ? (s.rules + ' model rules · ' + (s.combos || 0) + ' combinations · ' + (s.spf || 0) + ' single-point · ' + (s.unsub || 0) + ' assumed') : 'no model layer' }; } },

        { id: 'Q.10', title: 'Failure Modes and Effects Analysis / Summary (FMEA / FMES)', lane: 'ffmea',
          probe: () => { const f = allFmea();
                         let fmes = 0; try { if (typeof fmesGroups === 'function') fmes = _count(fmesGroups()); } catch (_) {}
                         return { have: f.length > 0, complete: f.length > 0 && fmes > 0,
                                  detail: f.length + ' FMEA rows · ' + fmes + ' FMES groups' }; } },

        { id: 'Q.11', title: 'Common Mode Analysis (CMA)', lane: 'cma',
          probe: () => { const c = R.cma(); const closed = c.filter(x => x && /Closed|Mitigated/i.test(String(x.status || ''))).length;
                         let ip = 0; try { if (typeof ipLedger === 'function') ip = ipLedger().length; } catch (_) {}
                         return { have: c.length > 0 || ip > 0, complete: c.length > 0 && closed === c.length,
                                  detail: c.length + ' concerns (' + closed + ' dispositioned) · ' + ip + ' independence principles' }; } },

        { id: 'Q.12', title: 'System Safety Assessment (SSA) — Fault Tree Analysis', lane: 'fta',
          probe: () => { const v = verifPages();
                         return { have: v.length > 0, complete: v.length > 0 && v.length >= Math.min(allocPages().length, 1),
                                  detail: v.length + ' verification trees against ' + allocPages().length + ' allocation trees' }; } },

        { id: 'Q.13', title: 'System Safety Assessment (SSA)', lane: null,
          probe: () => { const r = sysReq(); const verified = r.filter(x => x && /verif|closed|complete/i.test(String(x.verifStatus || ''))).length;
                         return { have: r.length > 0, complete: r.length > 0 && verified > 0,
                                  detail: r.length + ' system requirements · ' + verified + ' with verification recorded' }; } },

        { id: 'Q.14', title: 'Zonal Safety Analysis (ZSA)', lane: 'zsa',
          probe: () => { const z = R.zsa(); const housed = z.filter(x => x && (x.housedFunctions || []).length).length;
                         return { have: z.length > 0, complete: z.length > 0 && housed > 0,
                                  detail: z.length + ' zones · ' + housed + ' with housed functions' }; } },

        { id: 'Q.15', title: 'Particular Risks Analysis (PRA)', lane: 'pra',
          probe: () => { const p = R.pra(); const scoped = p.filter(x => x && (x.affectedZones || []).length).length;
                         return { have: p.length > 0, complete: p.length > 0 && scoped > 0,
                                  detail: p.length + ' particular risks · ' + scoped + ' zone-scoped' }; } },

        { id: 'Q.16', title: 'Cascading Effects Analysis (CEA)', lane: null,
          probe: () => { let n = 0; try { if (typeof ceaFindings === 'function') n = _count(ceaFindings()); } catch (_) {}
                         let g = 0, e = 0;
                         try { if (typeof ceaGraph === 'function') { const gr = ceaGraph() || {}; g = _count(gr.nodes); e = _count(gr.edges); } } catch (_) {}
                         return { have: g > 0, complete: g > 0 && e > 0,
                                  detail: g ? (g + ' graph nodes · ' + e + ' edges · ' + n + ' findings') : 'no cascade graph' }; } },

        { id: 'Q.17', title: 'Aircraft Safety Assessment (ASA)', lane: null,
          probe: () => { let rows = 0; try { if (typeof asaMeasuredRows === 'function') rows = _count(asaMeasuredRows()); } catch (_) {}
                         return { have: rows > 0, complete: rows > 0, detail: rows ? (rows + ' measured aircraft-level rows') : 'no ASA roll-up yet' }; } }
    ];

    // ---- trace edges: the LINES of the map, not just the boxes ---------------
    // Each returns { ok, detail } from pure reads. A box set with no edges
    // between them is a pile of documents, not a thread.
    const EDGES = [
        { id: 'AFHA→PASA', label: 'every Cat/Haz aircraft FC reaches an allocation tree',
          run: () => { const crit = R.acFha().filter(isCritical);
                       const miss = crit.filter(f => !allocPages().some(p => {
                           const ids = (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length) ? p.linkedFhaIds : (p.linkedFhaId ? [p.linkedFhaId] : []);
                           return ids.indexOf(f.internalId) >= 0; }));
                       return { ok: crit.length > 0 && miss.length === 0, detail: miss.length ? miss.length + ' of ' + crit.length + ' unallocated' : crit.length + ' allocated' }; } },
        { id: 'AFHA→FCIM', label: 'aircraft FCs trace to failure-condition identification rows',
          run: () => { const f = R.acFha(); const ids = new Set(R.fcim().map(r => r && r.subId).filter(Boolean));
                       const linked = f.filter(x => x && (ids.has(x.subId) || (x.subIds || []).some(s => ids.has(s)))).length;
                       return { ok: f.length > 0 && linked === f.length, detail: linked + ' of ' + f.length + ' traced' }; } },
        { id: 'PSSA→SSA', label: 'allocation trees carry a verification mirror',
          run: () => { const a = allocPages(); const mirrored = a.filter(p => verifPages().some(v => v.verifies === p.id)).length;
                       return { ok: a.length > 0 && mirrored === a.length, detail: mirrored + ' of ' + a.length + ' mirrored' }; } },
        { id: 'FC→requirement', label: 'every Cat/Haz FC is covered by a requirement',
          run: () => { const crit = R.acFha().filter(isCritical);
                       const reqs = R.acReq().concat(sysReq()).filter(r => r && !r.deleted);
                       const covered = crit.filter(f => reqs.some(r => {
                           const t = String(r.traceId || ''); const ctx = (r.reqSource && r.reqSource.context) || {};
                           return (t && (t === f.subId || t === f.fcId)) || ctx.fcId === f.fcId; })).length;
                       return { ok: crit.length > 0 && covered === crit.length, detail: covered + ' of ' + crit.length + ' covered' }; } },
        { id: 'CCA→thread', label: 'common-cause analyses reference the model they protect',
          run: () => { const z = R.zsa().filter(x => (x.housedFunctions || []).length).length;
                       const p = R.pra().filter(x => (x.affectedZones || []).length).length;
                       const c = R.cma().filter(x => (x.linkedGateIds || x.linkedGates || []).length || String(x.cmaContext || '').indexOf('ip:') === 0).length;
                       return { ok: (z + p + c) > 0, detail: z + ' zonal · ' + p + ' particular-risk · ' + c + ' common-mode anchored' }; } }
    ];

    // ---- the harness --------------------------------------------------------
    function qCompleteness() {
        const boxes = MAP.map(b => {
            if (b.excluded) return { id: b.id, title: b.title, verdict: 'excluded', detail: b.excludedWhy, lane: b.lane };
            if (!laneCommitted(b.lane)) return { id: b.id, title: b.title, verdict: 'not-in-plan', lane: b.lane,
                detail: 'lane "' + b.lane + '" is not committed in Program Planning — not a gap' };
            let r;
            try { r = b.probe() || {}; } catch (e) { r = { have: false, complete: false, detail: 'probe error: ' + (e && e.message) }; }
            const verdict = !r.have ? 'absent' : (r.complete ? 'present' : 'partial');
            return { id: b.id, title: b.title, verdict, detail: r.detail || '', lane: b.lane };
        });
        const edges = EDGES.map(e => {
            let r; try { r = e.run() || {}; } catch (err) { r = { ok: false, detail: 'edge error: ' + (err && err.message) }; }
            return { id: e.id, label: e.label, ok: !!r.ok, detail: r.detail || '' };
        });
        const counted = boxes.filter(b => b.verdict !== 'excluded' && b.verdict !== 'not-in-plan');
        return {
            boxes, edges,
            summary: {
                inScope: counted.length,
                present: counted.filter(b => b.verdict === 'present').length,
                partial: counted.filter(b => b.verdict === 'partial').length,
                absent:  counted.filter(b => b.verdict === 'absent').length,
                notInPlan: boxes.filter(b => b.verdict === 'not-in-plan').length,
                excluded: boxes.filter(b => b.verdict === 'excluded').length,
                edgesOk: edges.filter(e => e.ok).length,
                edgesTotal: edges.length
            }
        };
    }

    // ---- render: appended to the Thread Integrity page ----------------------
    const STYLE = { present: '#1D6E3E', partial: '#B7791F', absent: '#8E2A2A', 'not-in-plan': '#8a8a8a', excluded: '#6D28D9' };
    const LABEL = { present: 'PRESENT', partial: 'PARTIAL', absent: 'ABSENT', 'not-in-plan': 'NOT IN PLAN', excluded: 'EXCLUDED' };

    function renderQMapInto(host) {
        if (!host) return;
        const r = qCompleteness();
        const s = r.summary;
        let html = '<h4 style="margin-top: var(--s-5);">App Q output set — thread completeness</h4>' +
            '<p style="font-size:11.5px; color: var(--color-text-tertiary); margin-top:0;">ARP4761A Appendix Q is the contiguous worked example: one aircraft, one system, carried through every analysis in the standard. Producing that whole output set on one project is the acceptance test — advisory, and scoped to the lanes this program committed.</p>' +
            '<div class="ckpt-posture" style="margin-top:0;">' +
            '<div class="ckpt-tile"><div class="ckpt-tile-label">Outputs present</div><div class="ckpt-tile-value">' + s.present + ' / ' + s.inScope + '</div><div class="ckpt-tile-sub">in-scope boxes complete</div></div>' +
            '<div class="ckpt-tile' + (s.partial ? ' ckpt-tile-danger' : '') + '"><div class="ckpt-tile-label">Partial</div><div class="ckpt-tile-value">' + s.partial + '</div><div class="ckpt-tile-sub">started, not complete</div></div>' +
            '<div class="ckpt-tile' + (s.absent ? ' ckpt-tile-danger' : ' ckpt-tile-ok') + '"><div class="ckpt-tile-label">Absent</div><div class="ckpt-tile-value">' + s.absent + '</div><div class="ckpt-tile-sub">' + (s.absent ? 'no artifact on file' : 'every committed box started') + '</div></div>' +
            '<div class="ckpt-tile"><div class="ckpt-tile-label">Trace edges</div><div class="ckpt-tile-value">' + s.edgesOk + ' / ' + s.edgesTotal + '</div><div class="ckpt-tile-sub">lines of the map resolving</div></div>' +
            '</div>';
        html += '<table class="data-table" style="width:100%; font-size:12.5px;"><thead><tr><th>Clause</th><th>Output</th><th>State</th><th>Detail</th></tr></thead><tbody>' +
            r.boxes.map(b => '<tr>' +
                '<td class="u-mono">' + esc(b.id) + '</td>' +
                '<td>' + esc(b.title) + '</td>' +
                '<td><span class="sla-stamp" style="color:' + (STYLE[b.verdict] || '#555') + ';">' + (LABEL[b.verdict] || b.verdict) + '</span></td>' +
                '<td style="color: var(--color-text-tertiary); font-size:11.5px;">' + esc(b.detail) + '</td></tr>').join('') +
            '</tbody></table>';
        html += '<h5 style="margin-top: var(--s-4);">Trace edges — the lines, not just the boxes</h5>' +
            '<table class="data-table" style="width:100%; font-size:12.5px;"><thead><tr><th>Edge</th><th>Claim</th><th>State</th><th>Detail</th></tr></thead><tbody>' +
            r.edges.map(e => '<tr><td class="u-mono">' + esc(e.id) + '</td><td>' + esc(e.label) + '</td>' +
                '<td><span class="sla-stamp" style="color:' + (e.ok ? STYLE.present : STYLE.partial) + ';">' + (e.ok ? 'RESOLVES' : 'GAPS') + '</span></td>' +
                '<td style="color: var(--color-text-tertiary); font-size:11.5px;">' + esc(e.detail) + '</td></tr>').join('') +
            '</tbody></table>';
        const div = document.createElement('div');
        div.id = 'qmap-section';
        div.innerHTML = html;
        const old = document.getElementById('qmap-section');
        if (old) old.remove();
        host.appendChild(div);
    }

    // Render on the Thread Integrity page. TWO nets, deliberately — verified
    // live 4 Aug that ONE is not enough:
    //
    //  (a) wrap the EXPORT (window.renderGtIntegrityPage) for direct callers;
    //  (b) wrap switchTab itself, because gt_integrity's own nav wrapper calls
    //      its INTERNAL closure, not the export — so wrapping the export alone
    //      never fires on navigation and the section simply never appeared.
    //      This is the §7.5 shape the project has now hit three times
    //      (fmeaModeInScope's window.ProgramPlan, numbering_plan v1.1's
    //      switchTab closure, and this): WRAPPING AN EXPORT ONLY WORKS IF THE
    //      PRODUCT CALLS THE EXPORT. Check what the caller actually calls.
    //
    // Both nets are idempotent and the render itself replaces its own section,
    // so firing twice is harmless.
    (function wrapRender() {
        if (typeof window === 'undefined' || typeof window.renderGtIntegrityPage !== 'function' || window.renderGtIntegrityPage._qWrapped) return;
        const orig = window.renderGtIntegrityPage;
        const wrapped = function () {
            const out = orig.apply(this, arguments);
            try { renderQMapInto(document.getElementById('gt-integrity-host')); } catch (_) {}
            return out;
        };
        wrapped._qWrapped = true;
        window.renderGtIntegrityPage = wrapped;
    })();
    (function wrapNav() {
        if (typeof window === 'undefined' || typeof window.switchTab !== 'function' || window.switchTab._qNavWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const out = orig.apply(this, arguments);
            try { if (tabId === 'gt-integrity') renderQMapInto(document.getElementById('gt-integrity-host')); } catch (_) {}
            return out;
        };
        wrapped._qNavWrapped = true;
        window.switchTab = wrapped;
    })();

    const API = { qCompleteness, MAP, EDGES, laneCommitted, renderQMapInto };
    if (typeof window !== 'undefined') {
        window.Q_COMPLETENESS = API;
        window.qCompleteness = qCompleteness;
    }
    if (typeof module !== 'undefined') module.exports = API;
})();
