// ============================================================================
// critical_gates.js — v1.0 — Q7 (26 Sep 2026): the critical AND-gate test that
// scopes the common mode analysis.
//
// The question a CMA has to answer is "which independence claims actually
// carry the safety argument?" Reviewing every AND gate is waste; skipping one
// that matters is a gap. This module answers it mechanically, per failure
// condition, from the trees and the budget check that already exist:
//
//   For every AND-family gate (AND, INHIBIT, PAND, SPARE) in the fault tree
//   linked to a failure condition, two tests against that condition's
//   probability objective (the same target the Golden Thread budget check uses):
//     (a) treat the gate as OR   — any single input now passes straight through;
//     (b) treat the gate as certain — the gate's output is taken as having occurred.
//   If the top event still meets its objective under BOTH, the gate is NOT
//   critical: independence at that gate is not what keeps the condition inside
//   its budget, so it needs no common mode review. Otherwise the gate is
//   CRITICAL and its inputs go to the CMA questionnaire (ARP4761A Appendix M;
//   ED-135 uses the same scoping idea).
//
// Pure computation, no AI. Probabilities come from the same BDD-exact engine
// the budget check uses (computeExactProbability); the tree is cloned with
// transfers inlined so the real trees are never touched. Gates are the clone's;
// leaves are the real nodes (read only), so CCF groups, beta factors,
// development-error events and exposure all carry through unchanged.
//
// Surfaces: a panel on the CMA page (per failure condition: gate, the two test
// results, verdict, whether a CMA already reviews it, one click to start one);
// a stage on the Golden Thread; INV-58 (advisory) for a critical gate with no
// common mode review. window.SLCriticalGates + module.exports (tests).
// ============================================================================
(function (root) {
    'use strict';
    var AND_FAMILY = { AND: 1, INHIBIT: 1, PAND: 1, SPARE: 1 };
    var MAX_GATES = 400;   // per tree; above this the panel says so rather than stall the page

    // App state is read through SLEnv (top-level lets are invisible on window; rule 5),
    // with a direct-identifier fallback for the test sandbox.
    function _g(name) {
        try { if (root.SLEnv && typeof root.SLEnv.get === 'function') { var v = root.SLEnv.get(name); if (v !== undefined) return v; } } catch (_) {}
        try {
            switch (name) {
                case 'ftaPages': return (typeof ftaPages !== 'undefined') ? ftaPages : root.ftaPages;
                case 'cmaData': return (typeof cmaData !== 'undefined') ? cmaData : root.cmaData;
                case 'acFhaData': return (typeof acFhaData !== 'undefined') ? acFhaData : root.acFhaData;
                case 'systemsData': return (typeof systemsData !== 'undefined') ? systemsData : root.systemsData;
            }
        } catch (_) {}
        return root[name];
    }
    function _pages() { var p = _g('ftaPages'); return Array.isArray(p) ? p : []; }
    function _cma() { var c = _g('cmaData'); return Array.isArray(c) ? c : []; }
    function _exact(node) {
        var f = (typeof computeExactProbability === 'function') ? computeExactProbability
              : (root.SLFTAEngine && root.SLFTAEngine.computeExactProbability);
        if (!f) return null;
        var r = f(node);
        return (r && typeof r.prob === 'number' && isFinite(r.prob)) ? r.prob : null;
    }
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function _exp(p) { return (p == null) ? '—' : Number(p).toExponential(2); }

    // ---- failure conditions and targets ------------------------------------
    function rows() {
        var out = [];
        (_g('acFhaData') || []).forEach(function (f) { if (f) out.push({ fha: f, sysId: null, sysName: 'Aircraft' }); });
        (_g('systemsData') || []).forEach(function (s) {
            if (s && Array.isArray(s.fha)) s.fha.forEach(function (f) { if (f) out.push({ fha: f, sysId: s.id, sysName: s.name || String(s.id) }); });
        });
        return out;
    }
    function linkedFcs(page) {
        var links = (Array.isArray(page.linkedFhaIds) && page.linkedFhaIds.length) ? page.linkedFhaIds : (page.linkedFhaId ? [page.linkedFhaId] : []);
        var set = links.map(String);
        return rows().filter(function (r) { return set.indexOf(String(r.fha.internalId)) >= 0; });
    }
    function targetFor(page) {
        var fcs = linkedFcs(page), target = null;
        fcs.forEach(function (r) {
            var t = null;
            try { t = (typeof getSafetyTarget === 'function') ? getSafetyTarget(r.fha.severity) : null; } catch (e) { t = null; }
            var p = t && t.prob != null ? Number(t.prob) : null;
            if (p != null && isFinite(p) && (target == null || p < target)) target = p;
        });
        return { target: target, fcs: fcs };
    }

    // ---- clone with transfers inlined -----------------------------------------
    function clone(rootNode, pageId) {
        var gates = [];
        function walk(node, pid, parent, visitedPages) {
            if (!node) return null;
            if (node.type !== 'gate') return node;   // leaves are the real nodes, read only
            if (node.gateType === 'TRANSFER' || node.transferOutTo) {
                var linkedId = node.transferOutTo || node.linkedPageId;
                var page = linkedId ? _pages().find(function (p) { return p && String(p.id) === String(linkedId); }) : null;
                if (!page || !page.root || visitedPages.indexOf(String(linkedId)) >= 0) {
                    return { id: 'unresolved-' + node.id, type: 'basic', probability: 0, logicalId: '__unresolved__' + node.id };
                }
                return walk(page.root, String(page.id), parent, visitedPages.concat([String(linkedId)]));
            }
            var c = { id: node.id, type: 'gate', gateType: node.gateType, votingK: node.votingK, children: [] };
            var rec = { clone: c, orig: node, pageId: pid, parent: parent };
            gates.push(rec);
            (node.children || node._children || []).forEach(function (k) { var kc = walk(k, pid, c, visitedPages); if (kc) c.children.push(kc); });
            return c;
        }
        var r = walk(rootNode, String(pageId), null, [String(pageId)]);
        return { root: r, gates: gates };
    }

    // ---- the test ---------------------------------------------------------------
    function analyzePage(page) {
        var res = { pageId: page ? page.id : null, pageName: page ? (page.name || page.title || '') : '', target: null, fcs: [], pTop: null, gates: [], skipped: null };
        if (!page || !page.root) return res;
        var t = targetFor(page); res.target = t.target; res.fcs = t.fcs;
        if (res.target == null) return res;
        var c = clone(page.root, page.id);
        if (c.gates.length > MAX_GATES) { res.skipped = 'tree has ' + c.gates.length + ' gates; the critical-gate test is capped at ' + MAX_GATES; return res; }
        res.pTop = _exact(c.root);
        c.gates.forEach(function (g) {
            var gt = g.clone.gateType;
            if (!AND_FAMILY[gt]) return;
            if (!(g.clone.children && g.clone.children.length >= 2)) return;
            g.clone.gateType = 'OR';
            var pOr = _exact(c.root);
            g.clone.gateType = gt;
            var pCert;
            if (g.parent) {
                var idx = g.parent.children.indexOf(g.clone);
                var certain = { id: 'certain-' + g.clone.id, type: 'basic', probability: 1, logicalId: '__certain__' + g.clone.id };
                g.parent.children[idx] = certain;
                pCert = _exact(c.root);
                g.parent.children[idx] = g.clone;
            } else { pCert = 1; }   // the gate is the top event: taking it as certain is P = 1
            var orBreaks = (pOr != null) && pOr > res.target;
            var certBreaks = (pCert != null) && pCert > res.target;
            res.gates.push({
                key: g.pageId + ':' + g.orig.id, pageId: g.pageId, nodeId: g.orig.id,
                displayId: g.orig.displayId || ('G-' + g.orig.id), name: g.orig.name || '', gateType: gt,
                pAsOr: pOr, pCertain: pCert, orBreaks: orBreaks, certainBreaks: certBreaks,
                critical: orBreaks || certBreaks
            });
        });
        return res;
    }
    function reviewedBy(key) {
        return _cma().filter(function (c) { return c && !c.suggested && Array.isArray(c.linkedGateIds) && c.linkedGateIds.map(String).indexOf(String(key)) >= 0; })
                     .map(function (c) { return { cmaId: c.cmaId || ('CMA ' + (c.internalId || '')), status: c.status || 'Open', internalId: c.internalId }; });
    }
    function analyzeAll() {
        var out = [];
        _pages().forEach(function (p) { if (!p || !p.root) return; var r = analyzePage(p); if (r.target != null || r.skipped) out.push(r); });
        return out;
    }
    function fcLabel(res) {
        return res.fcs.map(function (r) { return (r.fha.fcId || ('FC#' + r.fha.internalId)) + (r.sysId != null ? ' (' + r.sysName + ')' : ''); }).join(', ');
    }
    // A critical gate with no common mode review that is not suggested-only.
    function findings() {
        var out = [];
        analyzeAll().forEach(function (res) {
            res.gates.forEach(function (g) {
                if (!g.critical) return;
                var rev = reviewedBy(g.key);
                if (rev.length) return;
                out.push({ kind: 'unreviewed', key: g.key, text: fcLabel(res) + ': gate ' + g.displayId + (g.name ? ' (' + g.name + ')' : '') + ' in "' + res.pageName + '" is critical to the budget and has no common mode review' });
            });
        });
        return out;
    }
    var INV = { id: 'INV-58', sev: 'advisory',
        name: 'Every AND gate that the failure condition’s budget depends on has a common mode review (ARP4761A Appendix M scoping)',
        run: function () {
            var f = findings(); var checked = 0;
            analyzeAll().forEach(function (r) { checked += r.gates.filter(function (g) { return g.critical; }).length; });
            return { checked: checked, fails: f.slice(0, 20).map(function (x) { return x.text; }), failCount: f.length };
        } };
    (function reg(tries) {
        if (typeof root.invRegister === 'function') { try { root.invRegister(INV); } catch (_) {} return; }
        if (tries > 0 && typeof setTimeout === 'function') setTimeout(function () { reg(tries - 1); }, 50);
    })(40);

    // ---- CMA page panel ------------------------------------------------------------
    var _showAll = false;
    function panelHtml() {
        var all = analyzeAll();
        var body = '';
        var nCrit = 0, nRev = 0, nGates = 0;
        all.forEach(function (res) {
            if (res.skipped) { body += '<tr><td colspan="8" style="color:var(--color-text-secondary);">' + _esc(res.pageName) + ': ' + _esc(res.skipped) + '</td></tr>'; return; }
            res.gates.forEach(function (g) {
                nGates++;
                if (g.critical) nCrit++;
                var rev = reviewedBy(g.key);
                if (g.critical && rev.length) nRev++;
                if (!_showAll && !g.critical) return;
                var why = g.critical ? ((g.orBreaks ? 'as OR: exceeds' : 'as OR: within') + ' · ' + (g.certainBreaks ? 'as certain: exceeds' : 'as certain: within')) : 'within budget both ways';
                var revCell = rev.length
                    ? rev.map(function (r) { return _esc(r.cmaId) + ' <span style="color:var(--color-text-secondary);">(' + _esc(r.status) + ')</span>'; }).join('<br>')
                    : (g.critical ? '<span style="color:#9A6200;font-weight:600;">Needs review</span> <button type="button" class="ckpt-m-btn" style="font-size:11px;padding:2px 8px;margin-left:6px;" onclick="SLCriticalGates.startReview(\'' + _esc(g.key) + '\')">Review in CMA</button>' : '<span style="color:var(--color-text-tertiary);">not required</span>');
                body += '<tr' + (g.critical && !rev.length ? ' style="background:var(--sev-haz-bg, #FFF6E5);"' : '') + '>'
                    + '<td>' + _esc(fcLabel(res)) + '</td><td>' + _esc(res.pageName) + '</td>'
                    + '<td><b>' + _esc(g.displayId) + '</b>' + (g.name ? ' <span style="color:var(--color-text-secondary);">' + _esc(g.name) + '</span>' : '') + ' <span style="color:var(--color-text-tertiary);">' + _esc(g.gateType) + '</span></td>'
                    + '<td>' + _exp(res.target) + '</td><td>' + _exp(g.pAsOr) + '</td><td>' + _exp(g.pCertain) + '</td>'
                    + '<td>' + (g.critical ? '<span style="font-weight:700;color:var(--color-danger);">Critical</span>' : '<span style="color:var(--color-success);">Not critical</span>') + '<div style="font-size:11px;color:var(--color-text-secondary);">' + why + '</div></td>'
                    + '<td>' + revCell + '</td></tr>';
            });
        });
        if (!all.length) body = '<tr><td colspan="8" style="color:var(--color-text-secondary);">No fault tree is linked to a failure condition with a probability objective yet. Link a tree to its failure condition and the test runs here.</td></tr>';
        else if (!body) body = '<tr><td colspan="8" style="color:var(--color-text-secondary);">No critical AND gates: every failure condition stays inside its budget even if any single independence claim is lost.</td></tr>';
        var summary = nGates + ' AND gates tested · <b>' + nCrit + ' critical</b> · ' + nRev + ' of those reviewed · ' + (nCrit - nRev) + ' need a review';
        return '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:6px;">'
            + '<div><div style="font-size:14px;font-weight:700;">Which independence claims carry the budget</div>'
            + '<div style="font-size:12px;color:var(--color-text-secondary);" title="For every AND gate in a failure condition’s fault tree, the top event is recomputed twice: with the gate treated as OR (any one input passes) and with the gate taken as certain. A gate is critical when either result exceeds the condition’s probability objective. Critical gates are the ones whose independence a common mode analysis must confirm; the rest need no review.">'
            + 'Each AND gate is tested against the failure condition’s probability objective two ways: as an OR gate, and as if it had already occurred. A gate is critical when either result breaks the budget. Only critical gates need a common mode review.</div></div>'
            + '<div style="font-size:12px;color:var(--color-text-secondary);white-space:nowrap;">' + summary + ' &nbsp; <label style="font-weight:400;"><input type="checkbox" ' + (_showAll ? 'checked' : '') + ' onchange="SLCriticalGates.toggleAll(this.checked)"> show all gates</label></div></div>'
            + '<div style="overflow-x:auto;"><table style="font-size:12px;"><thead><tr><th>Failure condition</th><th>Fault tree</th><th>Gate</th><th title="Probability objective for the linked failure condition, per flight hour">Objective</th><th title="P(top) if the gate were an OR gate">If OR</th><th title="P(top) if the gate’s event had certainly occurred">If certain</th><th>Verdict</th><th>Common mode review</th></tr></thead><tbody>' + body + '</tbody></table></div>';
    }
    function renderPanel() {
        var d = root.document; if (!d) return;
        var view = d.getElementById('view-cma'); if (!view) return;
        var host = d.getElementById('critical-gates-panel');
        if (!host) {
            host = d.createElement('div'); host.id = 'critical-gates-panel';
            host.style.cssText = 'margin:0 0 var(--s-4,16px) 0;padding:var(--s-3,12px);border:1px solid var(--color-border-hair);border-left:4px solid #6d28d9;border-radius:var(--r-md,8px);background:var(--color-surface-1);';
            var table = d.getElementById('cma-table');
            var anchor = table ? table.parentNode : null;
            if (anchor && anchor.parentNode === view) view.insertBefore(host, anchor); else view.appendChild(host);
        }
        try { host.innerHTML = panelHtml(); }
        catch (e) { host.innerHTML = '<div style="color:var(--color-danger);">Critical-gate test could not run: ' + _esc(e && e.message) + '</div>'; }
    }
    function toggleAll(v) { _showAll = !!v; renderPanel(); }
    // One click: pre-select the gate in the CMA form and name the claim, so the engineer only has to answer the questionnaire.
    function startReview(key) {
        var d = root.document; if (!d) return;
        try { if (typeof populateCmaLinkedGatesDropdown === 'function') populateCmaLinkedGatesDropdown(); } catch (_) {}
        var list = d.getElementById('cma-linked-gates');
        if (list) { var cb = Array.prototype.find.call(list.querySelectorAll('input[type="checkbox"]'), function (x) { return x.value === key; }); if (cb) cb.checked = true; }
        var claim = d.getElementById('cma-claim');
        if (claim && !String(claim.value || '').trim()) {
            var g = null; analyzeAll().some(function (r) { return r.gates.some(function (x) { if (x.key === key) { g = { r: r, x: x }; return true; } return false; }); });
            if (g) claim.value = 'Inputs of ' + g.x.displayId + (g.x.name ? ' (' + g.x.name + ')' : '') + ' fail independently; the budget of ' + fcLabel(g.r) + ' depends on it';
        }
        var subj = d.getElementById('cma-subject');
        try { (subj || list).scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
        try { if (typeof showToast === 'function') showToast('Gate selected in the CMA form. Answer the questionnaire and log the entry.', 'info', 3000); } catch (_) {}
    }

    // ---- Golden Thread stage ----------------------------------------------------------
    function threadStage(fha) {
        if (!fha) return '';
        var pages = _pages().filter(function (p) {
            var links = (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length) ? p.linkedFhaIds : (p.linkedFhaId ? [p.linkedFhaId] : []);
            return links.map(String).indexOf(String(fha.internalId)) >= 0;
        });
        if (!pages.length) return '';
        var lines = [], crit = 0, unrev = 0, tested = 0;
        pages.forEach(function (p) {
            var res = analyzePage(p);
            if (res.target == null) return;
            res.gates.forEach(function (g) {
                tested++;
                if (!g.critical) return;
                crit++;
                var rev = reviewedBy(g.key);
                if (!rev.length) unrev++;
                lines.push('<b>' + _esc(g.displayId) + '</b>' + (g.name ? ' ' + _esc(g.name) : '') + ' · if OR ' + _exp(g.pAsOr) + ' · if certain ' + _exp(g.pCertain)
                    + ' · ' + (rev.length ? 'reviewed by ' + _esc(rev.map(function (r) { return r.cmaId; }).join(', ')) : '<span style="color:#9A6200;font-weight:600;">no common mode review</span>'));
            });
        });
        if (!tested) return '';
        var body = (crit ? lines.join('<br>') : 'No AND gate is critical: the budget holds if any single independence claim is lost.')
            + '<div style="font-size:11px;color:var(--color-text-secondary);margin-top:4px;">' + tested + ' AND gates tested against the objective as OR and as certain; ' + crit + ' critical, ' + unrev + ' without a review.</div>';
        var status = unrev ? 'warn' : (crit ? 'ok' : 'info');
        return (typeof _gtStage === 'function') ? _gtStage('Critical gates', body, status) : '';
    }
    function _wrapThread() {
        var orig = root._renderGoldenThread;
        if (typeof orig !== 'function' || orig._cgWrapped) return false;
        var w = function (fha, domain, highlight) {
            var html = orig.apply(this, arguments);
            try {
                var stage = threadStage(fha);
                if (stage) {
                    var i = html.indexOf('>Common cause</span>');
                    var at = i >= 0 ? html.lastIndexOf('<div style="border:1px solid var(--color-border-hair)', i) : -1;
                    html = at >= 0 ? html.slice(0, at) + stage + html.slice(at) : html + stage;
                }
            } catch (_) {}
            return html;
        };
        w._cgWrapped = true; root._renderGoldenThread = w; return true;
    }
    function _wrapCma() {
        var orig = root.renderCMA;
        if (typeof orig !== 'function' || orig._cgWrapped) return false;
        var w = function () { var r = orig.apply(this, arguments); try { renderPanel(); } catch (_) {} return r; };
        w._cgWrapped = true; root.renderCMA = w; return true;
    }
    (function hook(tries) {
        var a = _wrapThread(), b = _wrapCma();
        if ((!a || !b) && tries > 0 && typeof setTimeout === 'function') setTimeout(function () { hook(tries - 1); }, 100);
    })(50);

    var api = { rows: rows, linkedFcs: linkedFcs, targetFor: targetFor, clone: clone, analyzePage: analyzePage, analyzeAll: analyzeAll, reviewedBy: reviewedBy, findings: findings, INV: INV,
                panelHtml: panelHtml, renderPanel: renderPanel, toggleAll: toggleAll, startReview: startReview, threadStage: threadStage, _wrapThread: _wrapThread, _wrapCma: _wrapCma, AND_FAMILY: AND_FAMILY };
    try { root.SLCriticalGates = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
