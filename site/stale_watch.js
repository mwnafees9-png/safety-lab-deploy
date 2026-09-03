// ============================================================================
// stale_watch.js — v1.1 — + C2 (22 Aug 2026): the [fmes] watcher learns the
// DECOMPOSED shape — Σ(mode children λ) vs the group's current Σλ.
// stale_watch.js — v1.0 — A8: stale-flagging, BUILT ONCE (21 Aug 2026).
//
// The debt this closes (OPEN_ITEMS A8, owed in five places, built zero — plus
// R2): a value one artifact FROZE moves upstream, and nothing says so. One
// mechanism, six watchers, each with its own honest consistency predicate:
//
//   [ss]   a shared-strictest cap moved a budget — an ISSUED requirement
//          quotes a number the allocation has since TIGHTENED
//          (reqSource.context.prob vs the node's current allocation).
//   [asm]  a consumer assumption quotes a number that has tightened — the
//          assumption text cites a probability looser than the objective of
//          the failure condition it rides on (heuristic quote-parse, and the
//          flag says so).
//   [alpha] the verification side shifted after a design change — a mirror's
//          achieved P(top) moved in the HARDER direction since its baseline.
//   [coffe] a CoFFE case was re-classified — a grafted branch's source
//          verdict is gone or no longer YES.
//   [mac]  a MAC clause was edited — a compiled MF&MS tree or a lane tree is
//          stale against its rule fingerprint (reuses macTreeStatus /
//          SLLaneTrees.status; surfaced HERE so it cannot hide in a tab).
//   [fmes] R2 — an adopted FMES Σλ drifted: the basic event carries
//          _fmesGroup but the group's current Σλ no longer equals the
//          adopted node.lambda.
//
// THE DIRECTION RULE (A9's, kept): a number that got EASIER raises nothing;
// a number that got HARDER flags. Predicates are STATELESS where the data
// allows (recomputed every sweep — no baseline to rot); only [alpha] needs a
// baseline, stored in projectConfig.staleBaselines and re-based by ack.
//
// ACKS: a flag is quieted only by a SIGNED ack, stored with the predicate
// fingerprint it acknowledged (projectConfig.staleFlags). If the value moves
// AGAIN, the ack no longer matches and the flag returns. Acks never delete.
//
// SURFACE: a tile-row + register rendered under the dashboard's leading
// indicators (wraps updateDashboard, ux_leading pattern). Zero monolith
// edits. window.SLStaleWatch + module.exports (tests).
// ============================================================================
(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.SLStaleWatch = api;
}(this, function () {
    'use strict';

    function G(name) {
        try {
            var E = (typeof SLEnv !== 'undefined') ? SLEnv : (typeof window !== 'undefined' ? window.SLEnv : null);
            if (E && typeof E.get === 'function') { var v = E.get(name); if (v !== undefined) return v; }
        } catch (_) {}
        try { return (0, eval)('typeof ' + name + ' !== "undefined" ? ' + name + ' : undefined'); } catch (_) { return undefined; }
    }
    function pc() { return G('projectConfig') || {}; }
    function pages() { return G('ftaPages') || []; }
    function _esc(s) { try { var e = G('esc'); if (e) return e(s); } catch (_) {}
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    var TOL = 1e-3;   // relative — allocation arithmetic noise stays quiet

    function ackStore() { var p = pc(); if (!p.staleFlags) p.staleFlags = {}; return p.staleFlags; }
    function baseStore() { var p = pc(); if (!p.staleBaselines) p.staleBaselines = {}; return p.staleBaselines; }

    // ---- shared helpers -----------------------------------------------------
    function eachAllocNode(fn) {
        pages().forEach(function (p) {
            if (!p || !p.root || p.verifies || p.mode === 'bottom-up') return;
            (function walk(n) { if (!n) return; fn(n, p); (n.children || n._children || []).forEach(walk); })(p.root);
        });
    }
    function reqStores() {
        var out = [];
        var ac = G('acReqData'); if (Array.isArray(ac)) out.push({ scope: 'aircraft', reqs: ac });
        (G('systemsData') || []).forEach(function (s) { if (s && Array.isArray(s.req)) out.push({ scope: s.name || s.id, reqs: s.req }); });
        return out;
    }

    // ---- [ss] issued requirement quotes a budget the caps have tightened ----
    function sweepSharedStrictest() {
        var flags = [];
        var byLid = {};
        eachAllocNode(function (n) { if (n.type !== 'gate' && n.logicalId != null && isFinite(n.probability)) byLid[String(n.logicalId)] = n; });
        reqStores().forEach(function (st) { st.reqs.forEach(function (r) {
            if (!r || r.deleted || !r.reqSource || !r.reqSource.context) return;
            var quoted = parseFloat(r.reqSource.context.prob);
            if (!isFinite(quoted) || quoted <= 0) return;
            var sid = String(r.reqSource.sourceId || '');
            var node = null;
            Object.keys(byLid).some(function (lid) { if (sid.indexOf(lid) !== -1) { node = byLid[lid]; return true; } return false; });
            if (!node) return;
            var now = node.probability;
            if (!isFinite(now) || now <= 0) return;
            // DIRECTION RULE: flag only when the budget got HARDER than the quote.
            if (now < quoted * (1 - TOL)) {
                flags.push({ key: 'ss:' + (r.traceId || r.id || r.internalId), source: 'shared-strictest',
                    fp: now.toExponential(6),
                    msg: (r.traceId || r.id || ('REQ-' + r.internalId)) + ' (' + st.scope + ') quotes ' + quoted.toExponential(2) +
                         ' but the allocation now demands ' + now.toExponential(2) + ' on ' + (node.displayId || node.logicalId) +
                         (node._sharedStrictest ? ' (held at the strictest across trees)' : '') + ' — regenerate or re-issue.' });
            }
        }); });
        return flags;
    }

    // ---- [asm] assumption quotes a number the objective has tightened past --
    var SCI = /(\d+(?:\.\d+)?)\s*[eE]\s*[-−]\s*(\d+)/;
    function sweepAssumptions() {
        var flags = [];
        var asms = G('acAssumptionsData') || [];
        var fhas = G('acFhaData') || [];
        var getT = G('getSafetyTarget');
        if (typeof getT !== 'function') return flags;
        asms.forEach(function (a) {
            if (!a || !a.text) return;
            var m = SCI.exec(String(a.text));
            if (!m) return;
            var quoted = parseFloat(m[1]) * Math.pow(10, -parseInt(m[2], 10));
            if (!isFinite(quoted) || quoted <= 0) return;
            var holders = fhas.filter(function (f) { return f && Array.isArray(f.assumptionIds) && f.assumptionIds.indexOf(a.internalId) !== -1; });
            holders.forEach(function (f) {
                var t = null; try { t = getT(f.severity); } catch (_) {}
                if (!t || !isFinite(t.prob)) return;
                if (t.prob < quoted * (1 - TOL)) {
                    flags.push({ key: 'asm:' + a.internalId + ':' + f.internalId, source: 'assumption',
                        fp: Number(t.prob).toExponential(6),
                        msg: 'Assumption #' + (a.asmId || a.internalId) + ' on ' + (f.fcId || f.internalId) + ' quotes ' + quoted.toExponential(2) +
                             ' but the objective is now ' + Number(t.prob).toExponential(2) + ' (quote-parse heuristic — confirm on the assumption).' });
                }
            });
        });
        return flags;
    }

    // ---- [alpha] the verification side shifted after a design change --------
    function sweepAlpha() {
        var flags = [];
        var cep = G('computeExactProbability');
        if (typeof cep !== 'function') return flags;
        var bases = baseStore();
        pages().forEach(function (p) {
            if (!p || !p.verifies || !p.root) return;
            var prob = null; try { var r = cep(p.root); prob = r && r.prob; } catch (_) {}
            if (!isFinite(prob) || prob <= 0) return;
            var key = 'alpha:' + p.id;
            var fp = prob.toExponential(3);
            if (!bases[key]) { bases[key] = { fp: fp, at: new Date().toISOString() }; return; }   // first sight = baseline, never a flag
            var was = parseFloat(bases[key].fp);
            // DIRECTION RULE: achieved got WORSE (bigger P) than the baseline.
            if (isFinite(was) && prob > was * (1 + 0.1)) {
                flags.push({ key: key, source: 'alpha', fp: fp,
                    msg: (p.name || p.id) + ': achieved P(top) moved ' + was.toExponential(2) + ' → ' + prob.toExponential(2) +
                         ' since its baseline — the design change shifted the verification side. Ack re-baselines.' });
            }
        });
        return flags;
    }

    // ---- [coffe] a grafted branch's source verdict changed ------------------
    function sweepCoffe() {
        var flags = [];
        var V = (pc().coffe && pc().coffe.verdicts) || {};
        pages().forEach(function (p) {
            if (!p || !p.root) return;
            var fcKey = p.linkedFhaId != null ? String(p.linkedFhaId) : null;
            (p.root.children || p.root._children || []).forEach(function (c) {
                if (!c || !c._macGraft) return;
                var hit = null;
                if (fcKey && V[fcKey + '§' + c._macGraft]) hit = V[fcKey + '§' + c._macGraft];
                else Object.keys(V).some(function (k) { if (k.split('§')[1] === c._macGraft) { hit = V[k]; return true; } return false; });
                if (!hit || hit.verdict !== 'yes') {
                    flags.push({ key: 'coffe:' + p.id + ':' + c._macGraft, source: 'coffe', fp: hit ? hit.verdict + ':' + (hit.at || '') : 'gone',
                        msg: (p.name || p.id) + ' carries grafted branch "' + c._macGraft + '" but its CoFFE verdict is ' +
                             (hit ? 'now ' + String(hit.verdict).toUpperCase() + ' (re-classified)' : 'GONE (cleared)') + ' — remove or re-justify the branch.' });
                }
            });
        });
        return flags;
    }

    // ---- [mac] a MAC clause was edited under a compiled tree ----------------
    function sweepMac() {
        var flags = [];
        var rules = (pc().macModels || []).filter(Boolean);
        var mts = G('macTreeStatus');
        var LT = G('SLLaneTrees');
        rules.forEach(function (r) {
            try { if (typeof mts === 'function' && mts(r) === 'stale')
                flags.push({ key: 'mac:mfms:' + r.id, source: 'mac', fp: 'stale',
                    msg: 'MF&MS tree for ' + r.subId + ' is stale against its edited MAC rule — recompile (MF&MS tab).' }); } catch (_) {}
            try { if (LT && typeof LT.status === 'function') ['tl', 'pl', 'mal'].forEach(function (k) {
                if (LT.status(r.id, k) === 'stale')
                    flags.push({ key: 'mac:lane:' + r.id + ':' + k, source: 'mac', fp: 'stale',
                        msg: 'Lane tree (' + k.toUpperCase() + ') for ' + r.subId + ' is stale against its inputs — regenerate (MF&MS tab).' });
            }); } catch (_) {}
        });
        return flags;
    }

    // ---- [fmes] R2 — adopted Σλ drifted -------------------------------------
    function sweepFmes() {
        var flags = [];
        var fg = G('fmesGroups');
        if (typeof fg !== 'function') return flags;
        var groups = null; try { groups = fg().groups; } catch (_) { return flags; }
        var byKey = {}; (groups || []).forEach(function (g) { byKey[g.key] = g; });
        pages().forEach(function (p) {
            if (!p || !p.root) return;
            (function walk(n) {
                if (!n) return;
                if (n._fmesDecomposed && n.type === 'gate') {
                    // C2 — a decomposed node leaves the lambda-leaf predicate below;
                    // its honest consistency question becomes: do the mode children
                    // still sum to the group's CURRENT Σλ?
                    var gd = byKey[n._fmesDecomposed.group];
                    if (!gd) flags.push({ key: 'fmes:' + p.id + ':' + n.id, source: 'fmes', fp: 'gone',
                        msg: (n.displayId || n.id) + ' on ' + (p.name || p.id) + ' is decomposed from an FMES group that no longer exists — recompose, or re-adopt and decompose again.' });
                    else {
                        var sumKids = 0;
                        (n.children || []).forEach(function (c) { if (c && c._fmesMode) sumKids += (parseFloat(c.lambda) || 0); });
                        if (Math.abs(gd.sumRate - sumKids) > Math.abs(gd.sumRate || 1) * TOL)
                            flags.push({ key: 'fmes:' + p.id + ':' + n.id, source: 'fmes', fp: sumKids.toExponential(6) + '|' + gd.sumRate.toExponential(6),
                                msg: (n.displayId || n.id) + ' on ' + (p.name || p.id) + ': decomposed modes sum ' + sumKids.toExponential(2) + ' /h but the FMES group now sums ' + gd.sumRate.toExponential(2) + ' /h — the FMEA moved; re-decompose to refresh the modes.' });
                    }
                }
                else if (n._fmesGroup && n.inputMode === 'lambda' && isFinite(n.lambda)) {
                    var g = byKey[n._fmesGroup];
                    if (!g) flags.push({ key: 'fmes:' + p.id + ':' + n.id, source: 'fmes', fp: 'gone',
                        msg: (n.displayId || n.id) + ' on ' + (p.name || p.id) + ' adopted Σλ from an FMES group that no longer exists — re-adopt or clear.' });
                    else if (Math.abs(g.sumRate - n.lambda) > Math.abs(n.lambda) * TOL)
                        flags.push({ key: 'fmes:' + p.id + ':' + n.id, source: 'fmes', fp: g.sumRate.toExponential(6),
                            msg: (n.displayId || n.id) + ' on ' + (p.name || p.id) + ' carries adopted λ = ' + n.lambda.toExponential(2) +
                                 ' but the FMES group now sums to ' + g.sumRate.toExponential(2) + ' — re-adopt Σλ (R2).' });
                }
                (n.children || n._children || []).forEach(walk);
            })(p.root);
        });
        return flags;
    }

    // ---- the sweep + acks ---------------------------------------------------
    var SOURCES = { 'shared-strictest': sweepSharedStrictest, 'assumption': sweepAssumptions, 'alpha': sweepAlpha, 'coffe': sweepCoffe, 'mac': sweepMac, 'fmes': sweepFmes };
    function sweep() {
        var acks = ackStore();
        var all = [];
        Object.keys(SOURCES).forEach(function (s) { try { all = all.concat(SOURCES[s]() || []); } catch (_) {} });
        var active = [], quieted = 0;
        all.forEach(function (f) {
            var a = acks[f.key];
            if (a && a.ackFp === f.fp) { quieted++; return; }   // signed ack for THIS value — quiet until it moves again
            active.push(f);
        });
        var counts = {};
        active.forEach(function (f) { counts[f.source] = (counts[f.source] || 0) + 1; });
        return { flags: active, counts: counts, total: active.length, quieted: quieted };
    }
    async function ack(key) {
        var res = sweep();
        var f = res.flags.find(function (x) { return x.key === key; });
        if (!f) return false;
        var askFn = (typeof slPrompt === 'function') ? slPrompt : function (m, d) { return Promise.resolve(window.prompt(m, d)); };
        var by = (await askFn('Acknowledge this stale flag — it stays quiet until the value moves AGAIN. Sign with your name:\n\n' + f.msg,
            (typeof _signoffReviewerName === 'function' && _signoffReviewerName()) || '')) || '';
        if (!String(by).trim()) return false;
        ackStore()[key] = { ackBy: String(by).trim(), ackAt: new Date().toISOString(), ackFp: f.fp };
        if (f.source === 'alpha') { var b = baseStore(); b[key] = { fp: f.fp, at: new Date().toISOString() }; }   // ack re-baselines
        try { var c = G('commitSaveChanges'); if (typeof c === 'function') c(); } catch (_) {}
        try { renderDesk(); } catch (_) {}
        return true;
    }

    // ---- the desk (under the dashboard leading indicators) ------------------
    var LABEL = { 'shared-strictest': 'Budget quotes', 'assumption': 'Assumption quotes', 'alpha': 'Verification shifts', 'coffe': 'Re-classified CoFFE', 'mac': 'Edited MAC', 'fmes': 'FMES Σλ drift' };
    function renderDesk() {
        if (typeof document === 'undefined') return;
        var lead = document.getElementById('dash-leading');
        if (!lead || !lead.parentNode) return;
        var host = document.getElementById('dash-stale');
        if (!host) { host = document.createElement('div'); host.id = 'dash-stale'; lead.parentNode.insertBefore(host, lead.nextSibling); }
        var res = sweep();
        var html = '<div class="ckpt-row-label" style="margin-top: var(--s-4);">Stale flags — a value someone froze has moved upstream (A8' +
            (res.quieted ? ' · ' + res.quieted + ' acknowledged' : '') + ')</div>';
        if (!res.total) {
            html += '<p style="color: var(--color-text-tertiary); font-size:12.5px; margin:4px 0 0;">Nothing stale. Six watchers sweep: issued requirements vs tightened budgets · assumption quotes vs objectives · verification-side shifts · re-classified CoFFE grafts · edited MAC rules vs compiled trees · adopted FMES Σλ (R2). A number that got EASIER never flags.</p>';
        } else {
            html += '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr><th style="width:140px;">Lane</th><th>Finding</th><th style="width:80px;"></th></tr></thead><tbody>' +
                res.flags.slice(0, 30).map(function (f) {
                    return '<tr><td class="u-mono" style="font-size:11px; color:#9A6200;">' + _esc(LABEL[f.source] || f.source) + '</td>' +
                        '<td style="font-size:12px;">' + _esc(f.msg) + '</td>' +
                        '<td><button class="ckpt-m-btn" style="font-size:11px; padding:2px 8px;" onclick="SLStaleWatch.ack(\'' + _esc(f.key) + '\')">ack ✓</button></td></tr>';
                }).join('') + '</tbody></table>' +
                (res.total > 30 ? '<p style="font-size:11px; color:var(--color-text-tertiary);">' + (res.total - 30) + ' more not shown — clear the visible ones first.</p>' : '');
        }
        host.innerHTML = html;
    }
    (function wrapDash(tries) {
        if (typeof window === 'undefined') return;
        var orig = window.updateDashboard;
        if (typeof orig !== 'function') { if ((tries || 0) < 40) setTimeout(function () { wrapDash((tries || 0) + 1); }, 250); return; }
        if (orig._staleWrapped) return;
        var wrapped = function () { var r = orig.apply(this, arguments); try { renderDesk(); } catch (_) {} return r; };
        wrapped._staleWrapped = true;
        try { if (window.SLWrap && SLWrap.preserve) SLWrap.preserve(orig, wrapped); } catch (_) {}
        window.updateDashboard = wrapped;
    })(0);

    return { sweep: sweep, ack: ack, renderDesk: renderDesk,
             _sweeps: { ss: sweepSharedStrictest, asm: sweepAssumptions, alpha: sweepAlpha, coffe: sweepCoffe, mac: sweepMac, fmes: sweepFmes } };
}));
