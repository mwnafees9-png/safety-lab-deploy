// 13 Sep 2026 (R19 step 3): native alert/confirm/prompt replaced by the app's own dialogs (slAlert/slConfirm/slPrompt) and typed toasts; see tests/regression_native_dialogs.test.js
// ============================================================================
// monitor_spec.js — v1.0 — M7: monitor/coverage modeling (ARP4761A D.4.3.1,
// G.11.1.3.4). BORN MODULAR: new file, zero monolith edits. Creates its own
// view + nav entry next to Bow-Tie Analysis, exactly like bowtie.js.
//
// THE GAP THIS CLOSES: fault trees take MONITORING CREDIT (repairModel
// 'monitored'/'periodic') as if detection were perfect. Real monitors have a
// SPEC — threshold, cycle time, scrub interval, coverage %, independence — and
// coverage < 100% means an UNDETECTED fraction accumulates latently until the
// next scrub/inspection. G.11.1.3.4's imperfect-coverage pattern splits the
// event: detected stream c·λ (keeps the credited repair model) + undetected
// stream (1−c)·λ latent over the scrub interval.
//
// WHAT IT DOES — all deterministic, asserting nothing itself:
//   · MONITOR SPEC RECORDS (the only data this module owns, projectConfig
//     .monitorSpecs): target event (page + logicalId), threshold, cycle time,
//     scrub interval, coverage, monitor-channel logicalId, note.
//   · COVERAGE MATH — Q_true = 1−(1−Q_det)(1−Q_undet) with
//     Q_det = credited model at c·λ, Q_undet = 1−exp(−(1−c)·λ·τ_scrub).
//     Flags trees whose credited Q understates Q_true (factor > 1.05).
//   · INDEPENDENCE — a monitor channel that IS the monitored element, or that
//     appears in a cut set with it, can be defeated by what it watches.
//     Defeated claims feed the Independence Principle ledger (ipLedger source
//     type 'monitor'), same pattern as bow-tie cross-side common cause.
//   · CREDIT LINT — every credit-taking event with no spec record is flagged:
//     monitoring credit with no monitor specification is a naked claim.
//   · AutoReq — assurance_modules' fta-interval generator reads the spec via
//     monitorSpecFor() and emits the full D.4.3.1 attribute set as the
//     requirement text (threshold, cycle, coverage, scrub, independence).
// ============================================================================
(function () {
    'use strict';

    function _esc(s) { if (typeof esc === 'function') return esc(s); return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {}; }
    function _store() { const pc = _pc(); if (!Array.isArray(pc.monitorSpecs)) pc.monitorSpecs = []; return pc.monitorSpecs; }
    function _save() { try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {} }
    function _pages() { return (typeof ftaPages !== 'undefined' ? ftaPages : (_pc().ftaPages || [])) || []; }
    function _fmt(p) { return (typeof p === 'number' && isFinite(p)) ? p.toExponential(2) : '—'; }
    function _lid(n) { return String(n.logicalId != null ? n.logicalId : n.id); }

    // ---- harvest: every credit-taking basic event across all trees ----------
    function creditedEvents() {
        const out = [];
        _pages().forEach(page => {
            if (!page || !page.root) return;
            (function walk(n, seen) {
                if (!n || seen.has(n.id)) return; seen.add(n.id);
                if (n.type !== 'gate' && (n.repairModel === 'monitored' || n.repairModel === 'periodic')) {
                    out.push({ pageId: page.id, pageName: page.name || page.id, node: n, lid: _lid(n) });
                }
                (n.children || n._children || []).forEach(c => walk(c, seen));
            })(page.root, new Set());
        });
        return out;
    }

    function specFor(pageId, lid) {
        return _store().find(s => s.targetPageId === pageId && String(s.targetLid) === String(lid)) || null;
    }
    // AutoReq hook — scoped only by lid (the generator walks per-page already).
    function monitorSpecFor(lid) {
        return _store().find(s => String(s.targetLid) === String(lid)) || null;
    }

    // ---- G.11.1.3.4 imperfect-coverage evaluation ----------------------------
    // Returns null if the engines are unavailable; otherwise the full split.
    function coverageEval(pageId, node, spec) {
        if (typeof window.getEffectiveLambda !== 'function' || typeof window.effectiveProbFromLambda !== 'function') return null;
        let lambda = 0;
        try { lambda = window.getEffectiveLambda(node) || 0; } catch (_) { return null; }
        if (!(lambda > 0)) return null;
        const c = Math.max(0, Math.min(1, (spec && isFinite(+spec.coverage)) ? +spec.coverage : 1));
        const T = (typeof ftaConfig === 'object' && ftaConfig && ftaConfig.exposureTime) || 1;
        let qModeled = 0;
        try { qModeled = window.effectiveProbFromLambda(lambda, node, T); } catch (_) { return null; }
        if (c >= 1) return { lambda, c, qModeled, qDet: qModeled, qUndet: 0, qTrue: qModeled, factor: 1 };
        // detected stream keeps the credited repair model at c·λ
        let qDet = 0;
        try { qDet = window.effectiveProbFromLambda(c * lambda, node, T); } catch (_) {}
        // undetected stream is latent until the scrub interval (falls back to the
        // node's own dormancy, then mission exposure — conservative default).
        const tauScrub = (spec && isFinite(+spec.scrubFH) && +spec.scrubFH > 0) ? +spec.scrubFH
            : (isFinite(+node.dormancyInterval) && +node.dormancyInterval > 0 ? +node.dormancyInterval : T);
        const qUndet = -Math.expm1(-(1 - c) * lambda * tauScrub);
        const qTrue = 1 - (1 - qDet) * (1 - qUndet);
        return { lambda, c, qModeled, qDet, qUndet, qTrue, tauScrub, factor: qModeled > 0 ? qTrue / qModeled : Infinity };
    }

    // ---- independence: can the monitor be defeated by what it watches? -------
    // verdict: 'same-element' (hard) | 'joint-cutset' (hard) | 'same-tree' (advisory) | 'clear'
    function independenceEval(pageId, targetLid, monitorLid) {
        if (!monitorLid) return { verdict: 'unspecified' };
        if (String(monitorLid) === String(targetLid)) return { verdict: 'same-element' };
        const page = _pages().find(p => p.id === pageId);
        if (!page || !page.root) return { verdict: 'clear' };
        let inTree = false;
        (function walk(n, seen) {
            if (!n || seen.has(n.id)) return; seen.add(n.id);
            if (n.type !== 'gate' && _lid(n) === String(monitorLid)) inTree = true;
            (n.children || n._children || []).forEach(c => walk(c, seen));
        })(page.root, new Set());
        if (!inTree) return { verdict: 'clear' };
        try {
            const cs = window.getCutsets(page.root) || [];
            const joint = cs.find(set => {
                const lids = (set || []).map(_lid);
                return lids.indexOf(String(monitorLid)) !== -1 && lids.indexOf(String(targetLid)) !== -1;
            });
            if (joint) return { verdict: 'joint-cutset', cutsetNodes: joint };
        } catch (_) {}
        return { verdict: 'same-tree' };
    }

    // ---- full evaluation ------------------------------------------------------
    function monitorEval() {
        const rows = [], findings = [];
        creditedEvents().forEach(ev => {
            const spec = specFor(ev.pageId, ev.lid);
            const cov = coverageEval(ev.pageId, ev.node, spec);
            const ind = spec ? independenceEval(ev.pageId, ev.lid, spec.monitorLid) : { verdict: 'unspecified' };
            const row = { ...ev, spec, cov, ind };
            rows.push(row);
            if (!spec) {
                findings.push({ kind: 'no-spec', sev: 'advisory', pageId: ev.pageId, lid: ev.lid,
                    text: 'Event ' + (ev.node.displayId || ev.lid) + ' (' + ev.pageName + ') takes ' + ev.node.repairModel + ' credit with NO monitor specification — threshold, cycle time, coverage and independence are unstated. The credit is a naked claim.' });
            } else {
                if (cov && cov.factor > 1.05) {
                    findings.push({ kind: 'coverage-understated', sev: cov.factor > 2 ? 'high' : 'advisory', pageId: ev.pageId, lid: ev.lid,
                        text: 'Event ' + (ev.node.displayId || ev.lid) + ' (' + ev.pageName + '): coverage ' + Math.round(cov.c * 100) + '% leaves an undetected stream — true Q ' + _fmt(cov.qTrue) + ' vs modeled ' + _fmt(cov.qModeled) + ' (×' + cov.factor.toFixed(2) + '). The tree understates the event' + (cov.factor > 2 ? ' badly' : '') + '; apply the imperfect-coverage split (G.11.1.3.4).' });
                }
                if (ind.verdict === 'same-element') {
                    findings.push({ kind: 'monitor-not-independent', sev: 'high', pageId: ev.pageId, lid: ev.lid, monitorLid: spec.monitorLid,
                        text: 'Monitor for ' + (ev.node.displayId || ev.lid) + ' is traced to the SAME element it monitors (' + spec.monitorLid + ') — it fails with what it watches. Monitoring credit is invalid (D.4.3.1 independence). Registered as a defeated Independence Principle.' });
                } else if (ind.verdict === 'joint-cutset') {
                    findings.push({ kind: 'monitor-not-independent', sev: 'high', pageId: ev.pageId, lid: ev.lid, monitorLid: spec.monitorLid, cutsetNodes: ind.cutsetNodes,
                        text: 'Monitor channel ' + spec.monitorLid + ' appears in a cut set WITH the monitored event ' + (ev.node.displayId || ev.lid) + ' (' + ev.pageName + ') — one cut set defeats both. Registered as a defeated Independence Principle.' });
                } else if (ind.verdict === 'same-tree') {
                    findings.push({ kind: 'monitor-shared-tree', sev: 'advisory', pageId: ev.pageId, lid: ev.lid, monitorLid: spec.monitorLid,
                        text: 'Monitor channel ' + spec.monitorLid + ' is itself a basic event in the same tree as ' + (ev.node.displayId || ev.lid) + ' — not a joint cut set, but the monitor lives in the failure space it guards. Evaluate.' });
                }
            }
        });
        return { rows, findings };
    }

    // ---- Independence Principle ledger feed (same pattern as btLedgerHits) ----
    function monLedgerHits() {
        const out = [];
        try {
            monitorEval().findings.filter(f => f.kind === 'monitor-not-independent').forEach(f => {
                const page = _pages().find(p => p.id === f.pageId);
                let targetNode = null, monitorNode = null;
                if (page && page.root) (function walk(n, seen) {
                    if (!n || seen.has(n.id)) return; seen.add(n.id);
                    if (n.type !== 'gate') {
                        if (_lid(n) === String(f.lid)) targetNode = n;
                        if (_lid(n) === String(f.monitorLid)) monitorNode = n;
                    }
                    (n.children || n._children || []).forEach(c => walk(c, seen));
                })(page.root, new Set());
                if (!targetNode) return;
                const mon = monitorNode || { logicalId: String(f.monitorLid), displayId: '👁 MON ' + f.monitorLid };
                out.push({ pageId: f.pageId, targetNode, monitorMember: mon, lid: f.lid, monitorLid: String(f.monitorLid) });
            });
        } catch (_) {}
        return out;
    }

    // ---- dashboard stats -------------------------------------------------------
    function monitorStats() {
        try {
            const ev = monitorEval();
            const credited = ev.rows.length;
            const specd = ev.rows.filter(r => r.spec).length;
            const high = ev.findings.filter(f => f.sev === 'high').length;
            return { credited, specd, high, findings: ev.findings.length };
        } catch (_) { return { credited: 0, specd: 0, high: 0, findings: 0 }; }
    }

    // ---- editor actions ---------------------------------------------------------
    function _ask(m, d) { return slPrompt(m, d || ''); }
    async function monEditSpec(pageId, lid) {
        let s = specFor(pageId, lid);
        if (!s) {
            s = { id: 'MON-' + String(_store().length + 1).padStart(3, '0'), targetPageId: pageId, targetLid: String(lid),
                  threshold: '', cycleSec: '', scrubFH: '', coverage: 1, monitorLid: '', note: '',
                  by: (typeof currentUserName !== 'undefined' ? currentUserName : ''), at: new Date().toISOString() };
            _store().push(s);
        }
        const th = await _ask('Detection threshold (what the monitor trips on; free text, e.g. "servo current > 2.5 A for 50 ms"):', s.threshold); if (th === null) return; s.threshold = th;
        const cy = await _ask('Monitor cycle time, seconds (how often it looks):', s.cycleSec); if (cy === null) return; s.cycleSec = cy;
        const cv = await _ask('Coverage: fraction of failure modes the monitor actually detects (0–1, e.g. 0.95):', String(s.coverage)); if (cv === null) return; s.coverage = Math.max(0, Math.min(1, parseFloat(cv) || 0));
        const sc = await _ask('Scrub / inspection interval for the UNDETECTED fraction, flight hours (blank = event dormancy, then mission time):', s.scrubFH); if (sc === null) return; s.scrubFH = sc;
        const ml = await _ask('Monitor channel logicalId (the element doing the watching, used for the independence check):', s.monitorLid); if (ml === null) return; s.monitorLid = String(ml || '').trim();
        s.at = new Date().toISOString();
        _save(); _render();
        try { if (typeof _ipCache !== 'undefined') _ipCache = {}; } catch (_) {}
    }
    function monRemoveSpec(pageId, lid) {
        const pc = _pc(); pc.monitorSpecs = _store().filter(s => !(s.targetPageId === pageId && String(s.targetLid) === String(lid)));
        _save(); _render();
    }

    // ---- render --------------------------------------------------------------
    function _render() {
        const host = document.getElementById('view-monitors'); if (!host) return;
        const ev = monitorEval();
        let html = '<div class="header-with-export"><h3>Monitors &amp; Coverage <span style="font-weight:400;font-size:12px;color:var(--color-text-tertiary,#888);">— D.4.3.1 monitor specs · G.11.1.3.4 imperfect coverage</span></h3></div>';
        html += '<p class="cfg-hint" style="margin-bottom:8px;" title="Every basic event taking monitored or periodic credit is listed. A spec makes the credit real: threshold, cycle, coverage, scrub interval, and the monitor channel (checked for independence against the tree). Coverage < 100% splits the event — the undetected fraction accumulates latently until the scrub. AutoReq turns specs into requirements.">Every credit-taking event listed · spec makes the credit real · AutoReq emits the requirement.</p>';

        if (!ev.rows.length) {
            html += '<p style="color:var(--color-text-tertiary,#888);font-size:13px;">No fault-tree events take monitoring credit yet (repair model = monitored / periodic). Nothing to specify.</p>';
            host.innerHTML = html; return;
        }

        html += '<table class="data-table" style="width:100%;font-size:12px;"><thead><tr><th>Tree</th><th>Event</th><th>Credit</th><th style="text-align:right;">λ /h</th><th>Coverage</th><th style="text-align:right;">Q modeled</th><th style="text-align:right;">Q true</th><th>Factor</th><th>Monitor ch.</th><th>Independence</th><th></th></tr></thead><tbody>';
        ev.rows.forEach(r => {
            const c = r.cov;
            const fBad = c && c.factor > 1.05;
            const indColor = { 'same-element': 'var(--color-danger,#b42318)', 'joint-cutset': 'var(--color-danger,#b42318)', 'same-tree': 'var(--color-warning,#b7791f)', 'clear': 'var(--color-success,#1a7f37)', 'unspecified': 'var(--color-text-tertiary,#888)' }[r.ind.verdict] || 'inherit';
            const indLabel = { 'same-element': '✗ same element', 'joint-cutset': '✗ joint cut set', 'same-tree': '⚠ same tree', 'clear': '✓ clear', 'unspecified': '—' }[r.ind.verdict] || r.ind.verdict;
            html += '<tr' + ((!r.spec || fBad || /same-element|joint-cutset/.test(r.ind.verdict)) ? ' style="background:var(--sev-cat-bg,rgba(180,35,24,.06));"' : '') + '>' +
                '<td>' + _esc(r.pageName) + '</td>' +
                '<td class="u-mono">' + _esc(r.node.displayId || r.lid) + '</td>' +
                '<td>' + _esc(r.node.repairModel) + (r.node.repairModel === 'periodic' && r.node.tau ? ' τ=' + r.node.tau + 'h' : '') + (r.node.repairModel === 'monitored' && r.node.mu ? ' μ=' + (+r.node.mu).toExponential(1) : '') + '</td>' +
                '<td class="u-mono" style="text-align:right;">' + (c ? c.lambda.toExponential(2) : '—') + '</td>' +
                '<td>' + (r.spec ? Math.round((c ? c.c : +r.spec.coverage || 1) * 100) + '%' : '<span style="color:var(--color-warning,#b7791f);">no spec</span>') + '</td>' +
                '<td class="u-mono" style="text-align:right;">' + (c ? _fmt(c.qModeled) : '—') + '</td>' +
                '<td class="u-mono" style="text-align:right;' + (fBad ? 'color:var(--color-danger,#b42318);font-weight:600;' : '') + '">' + (c ? _fmt(c.qTrue) : '—') + '</td>' +
                '<td class="u-mono"' + (fBad ? ' style="color:var(--color-danger,#b42318);font-weight:600;"' : '') + '>' + (c && c.factor !== 1 ? '×' + c.factor.toFixed(2) : '1') + '</td>' +
                '<td class="u-mono">' + _esc(r.spec && r.spec.monitorLid || '—') + '</td>' +
                '<td style="color:' + indColor + ';font-size:11px;font-weight:600;">' + indLabel + '</td>' +
                '<td style="white-space:nowrap;"><a href="#" onclick="monEditSpec(\'' + _esc(r.pageId) + '\',\'' + _esc(r.lid) + '\');return false;" style="color:var(--color-link,#0b57d0);font-size:11px;">' + (r.spec ? 'edit' : '+ spec') + '</a>' +
                (r.spec ? ' · <a href="#" onclick="monRemoveSpec(\'' + _esc(r.pageId) + '\',\'' + _esc(r.lid) + '\');return false;" style="color:var(--color-danger,#b42318);font-size:11px;">×</a>' : '') + '</td></tr>';
        });
        html += '</tbody></table>';

        if (ev.findings.length) {
            html += '<div style="margin-top:16px;border:1px solid var(--color-border-hair,rgba(0,0,0,.14));border-radius:8px;padding:12px 14px;">' +
                '<strong style="font-size:13px;">Monitor findings (' + ev.findings.length + ')</strong>' +
                ev.findings.map(f => '<div style="display:flex;gap:8px;font-size:12px;padding:6px 0;border-top:1px solid var(--color-border-hair,rgba(0,0,0,.07));"><span style="flex:0 0 auto;color:' + (f.sev === 'high' ? 'var(--color-danger,#b42318)' : 'var(--color-warning,#b7791f)') + ';font-weight:700;">' + (f.sev === 'high' ? '●' : '○') + '</span><span>' + _esc(f.text) + '</span></div>').join('') + '</div>';
        } else {
            html += '<div style="margin-top:16px;font-size:12px;color:var(--color-success,#1a7f37);">✓ Every credit-taking event has a spec, coverage math holds, and every monitor channel is independent.</div>';
        }
        html += '<p class="cfg-hint" style="font-family:var(--font-mono,monospace);" title="Q_det applies the credited repair model at c·λ; Q_undet = 1−e^(−(1−c)·λ·τ_scrub). Specs feed AutoReq (D.4.3.1 attribute set); defeated independence feeds the IP ledger.">Q_true = 1−(1−Q_det)(1−Q_undet) · specs → AutoReq · defeats → IP ledger.</p>';
        host.innerHTML = html;
    }

    // ---- page registration (born-modular; mirrors bowtie.js) -----------------
    function _ensurePage() {
        if (!document.getElementById('view-monitors')) {
            const prev = document.getElementById('view-bowtie') || document.getElementById('view-eta');
            if (!prev || !prev.parentNode) return false;
            const v = document.createElement('div'); v.id = 'view-monitors'; v.style.display = 'none';
            prev.parentNode.insertBefore(v, prev.nextSibling);
        }
        if (!document.getElementById('snav-monitors')) {
            // 23 Aug 2026 — fallback re-pointed: Event Trees now lives in R&M, so
            // falling back to it would mount Monitors in the wrong lane. The FTA
            // group is the stable PASA anchor.
            const prevNav = document.getElementById('snav-bowtie') || document.getElementById('snav-fta');   // 23 Aug (2): row, not group
            // 23 Aug 2026 — no nav row: a Fault-trees TAB now (prove_tabs.js), label clean of clause numbers.
        }
        return true;
    }
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._monWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-monitors');
                if (v) v.style.display = (tabId === 'monitors') ? 'block' : 'none';
                const s = document.getElementById('snav-monitors');
                if (s) s.classList.toggle('snav-active', tabId === 'monitors');
                if (tabId === 'monitors') _render();
            } catch (_) {}
            return r;
        };
        wrapped._monWrapped = true;
        window.switchTab = wrapped;
    })();
    function _ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
    _ready(function () { let tries = 30; const t = setInterval(function () { if (_ensurePage() || --tries <= 0) clearInterval(t); }, 250); });

    // exports
    window.monitorEval = monitorEval;
    window.monitorSpecFor = monitorSpecFor;
    window.monLedgerHits = monLedgerHits;
    window.monitorStats = monitorStats;
    window.monEditSpec = monEditSpec;
    window.monRemoveSpec = monRemoveSpec;
    window._renderMonitors = _render;
})();
