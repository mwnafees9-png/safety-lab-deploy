// ============================================================================
// req_basis.js — v1.1 — Q1 + Q2 + Q3 (27 Sep 2026): the basis of a requirement.
//
// Three small hardenings from the CCA list, one module, because they share the
// requirements and assumptions pages:
//
//   Q1  Promote an assumption to a requirement. One click on an Assumptions row
//       creates a requirement that carries the assumption's ID, its source
//       analysis tag and its rationale, and links the two both ways
//       (req.reqSource.sourceId = 'asm:<id>', req.linkedAsmIds; asm.requirementIds).
//       Thread gap: a CREDITED assumption (a credited posture is written on it)
//       that is neither Verified nor backed by a requirement. INV-59, advisory.
//   Q2  Rationale is required on a safety-derived requirement. The form refuses
//       to log a Safety-class requirement with an empty rationale; the thread and
//       the wall flag any safety-derived row that already has one. INV-60, advisory.
//       The statement carries the "what"; the rationale carries the "why".
//   Q3  Source-analysis tag (FHA, PSSA, CMA, PRA, ZSA, HF) on requirements and
//       assumptions. Generated requirements are tagged from their generator;
//       authored rows carry a `sourceAnalysis` field (form select on the
//       requirement forms, a select in the assumption row). Reports show the tag
//       in the body tables and can attach a "by source analysis" appendix that
//       lists every requirement and assumption under its tag (reports.js).
//
// Pure data reads through SLEnv (rule 5), direct identifiers as fallback for the
// test sandbox. No eval. Method cited to ARP4754B §5.3.1 (requirement rationale)
// and ARP4761A Appendix M / L / K for the tag vocabulary; own words throughout.
// window.SLReqBasis + module.exports (tests).
// ============================================================================
(function (root) {
    'use strict';
    var TAGS = ['FHA', 'PSSA', 'CMA', 'PRA', 'ZSA', 'HF'];
    var TAG_LABEL = { FHA: 'Functional hazard assessment', PSSA: 'Preliminary system safety assessment', CMA: 'Common mode analysis',
                      PRA: 'Particular risk analysis', ZSA: 'Zonal safety analysis', HF: 'Human factors' };
    // generator key → tag; anything unlisted falls back to the prefix rule in tagOfGenerator.
    var GEN_TAG = { 'fha-prob': 'FHA', 'fha-dal': 'FHA', 'fha-qualitative': 'FHA', 'fha-similarity': 'FHA',
                    'gate-indep-cma': 'CMA', 'pra-zonal': 'PRA', 'pra-scenario': 'PRA', 'zsa-separation': 'ZSA', 'zsa-phys': 'ZSA',
                    'hf-op-action': 'HF', 'hf-op-timing': 'HF', 'hf-op-info': 'HF' };
    var GEN_PREFIX = [['fha', 'FHA'], ['pra', 'PRA'], ['zsa', 'ZSA'], ['hf', 'HF'], ['fta', 'PSSA'], ['dalgebra', 'PSSA'],
                      ['gate-indep', 'PSSA'], ['iface', 'PSSA'], ['fcim', 'PSSA'], ['usoc', 'PSSA']];

    function _g(name) {
        try { if (root.SLEnv && typeof root.SLEnv.get === 'function') { var v = root.SLEnv.get(name); if (v !== undefined) return v; } } catch (_) {}
        try {
            switch (name) {
                case 'acReqData': return (typeof acReqData !== 'undefined') ? acReqData : root.acReqData;
                case 'acAssumptionsData': return (typeof acAssumptionsData !== 'undefined') ? acAssumptionsData : root.acAssumptionsData;
                case 'acFhaData': return (typeof acFhaData !== 'undefined') ? acFhaData : root.acFhaData;
                case 'systemsData': return (typeof systemsData !== 'undefined') ? systemsData : root.systemsData;
                case 'activeSystemId': return (typeof activeSystemId !== 'undefined') ? activeSystemId : root.activeSystemId;
            }
        } catch (_) {}
        return root[name];
    }
    function _arr(v) { return Array.isArray(v) ? v : []; }
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function _blank(s) { return !String(s == null ? '' : s).trim(); }
    function _systems() { return _arr(_g('systemsData')).filter(function (s) { return s && s.id != null; }); }
    function _sysLabel(s) { return s ? (s.name || String(s.id)) : ''; }
    function _newId() {
        try { if (typeof newRowId === 'function') return newRowId(); } catch (_) {}
        try { if (typeof root.newRowId === 'function') return root.newRowId(); } catch (_) {}
        return Date.now() + Math.floor(Math.random() * 1000);
    }
    function reqRef(r) { return r ? (r.id || ('REQ-' + r.internalId)) : ''; }

    // ---- stores ------------------------------------------------------------------
    // scope: 'ac' or 'sys-<id>'. Each store: { scope, label, reqs, asms, fhas, sys }.
    function stores() {
        var out = [{ scope: 'ac', label: 'Aircraft', reqs: _arr(_g('acReqData')), asms: _arr(_g('acAssumptionsData')), fhas: _arr(_g('acFhaData')), sys: null }];
        _systems().forEach(function (s) {
            out.push({ scope: 'sys-' + s.id, label: _sysLabel(s), reqs: _arr(s.req), asms: _arr(s.asm), fhas: _arr(s.fha), sys: s });
        });
        return out;
    }
    function storeFor(scope) {
        if (scope === 'sys') { var a = _g('activeSystemId'); scope = a != null && a !== '' ? 'sys-' + a : 'ac'; }
        var hit = null;
        stores().some(function (st) { if (st.scope === scope) { hit = st; return true; } return false; });
        return hit;
    }
    function liveReqs(st) { return st.reqs.filter(function (r) { return r && !r.deleted && r.status !== 'archived' && !(r.reqSource && r.reqSource.obsolete); }); }

    // ---- Q3 tags -----------------------------------------------------------------
    function normTag(v) {
        var t = String(v == null ? '' : v).trim().toUpperCase();
        return TAGS.indexOf(t) >= 0 ? t : '';
    }
    function tagOfGenerator(g) {
        g = String(g || '');
        if (!g) return '';
        if (GEN_TAG[g]) return GEN_TAG[g];
        for (var i = 0; i < GEN_PREFIX.length; i++) if (g.indexOf(GEN_PREFIX[i][0]) === 0) return GEN_PREFIX[i][1];
        return '';
    }
    function tagOfAsm(a) {
        if (!a) return '';
        var t = normTag(a.sourceAnalysis); if (t) return t;
        var ty = String(a.type || '').toLowerCase();
        if (ty === 'hf' || ty.indexOf('human') >= 0 || ty.indexOf('crew') >= 0) return 'HF';
        var m = String(a.origin || '').match(/\b(FHA|PSSA|CMA|PRA|ZSA|HF)\b/i);
        return m ? m[1].toUpperCase() : '';
    }
    // reqTag(r, st): authored field first, then the generator, then (for a promoted
    // assumption) the assumption's own tag.
    function tagOfReq(r, st) {
        if (!r) return '';
        var t = normTag(r.sourceAnalysis); if (t) return t;
        var g = r.reqSource && r.reqSource.generator;
        if (g === 'assumption') {
            var asm = asmFor(r.reqSource.sourceId, st);
            return asm ? tagOfAsm(asm) : '';
        }
        t = tagOfGenerator(g); if (t) return t;
        if (String(r.analysis || '') === 'Human Factors') return 'HF';
        return '';
    }
    function tagSource(r) { return normTag(r && r.sourceAnalysis) ? 'authored' : ((r && r.reqSource && r.reqSource.generator) ? 'derived' : ''); }

    // ---- Q1 links ----------------------------------------------------------------
    function asmFor(sourceIdOrAsmId, st) {
        var id = String(sourceIdOrAsmId || '').replace(/^asm:/, '');
        if (!id) return null;
        var pool = st ? [st] : stores();
        var hit = null;
        pool.some(function (s) { return s.asms.some(function (a) { if (a && String(a.asmId) === id) { hit = a; return true; } return false; }); });
        return hit;
    }
    function reqsForAsm(asmId, st) {
        var id = String(asmId || '');
        var pool = st ? [st] : stores(), out = [];
        pool.forEach(function (s) {
            liveReqs(s).forEach(function (r) {
                var viaSource = r.reqSource && r.reqSource.generator === 'assumption' && String(r.reqSource.sourceId || '') === 'asm:' + id;
                var viaLink = _arr(r.linkedAsmIds).map(String).indexOf(id) >= 0;
                if (viaSource || viaLink) out.push({ req: r, scope: s.scope, label: s.label });
            });
        });
        return out;
    }
    function isCredited(a) { return !!a && !_blank(a.credited); }
    function isVerified(a) { return !!a && String(a.state || '') === 'Verified'; }
    function isDead(a) { return !!a && ['Invalidated', 'Retired', 'Rejected', 'Withdrawn'].indexOf(String(a.state || '')) >= 0; }
    // The gap: credited, alive, not verified, and no requirement behind it.
    function creditGaps() {
        var out = [];
        stores().forEach(function (st) {
            st.asms.forEach(function (a) {
                if (!a || !isCredited(a) || isDead(a) || isVerified(a)) return;
                if (reqsForAsm(a.asmId, null).length) return;
                out.push({ asmId: String(a.asmId), scope: st.scope, label: st.label, state: String(a.state || 'Proposed'), credited: String(a.credited),
                           text: st.label + ' assumption ' + a.asmId + ' [' + (a.state || 'Proposed') + '] is credited ("' + String(a.credited).slice(0, 60) + '") but is not verified and no requirement holds it' });
            });
        });
        return out;
    }
    function statusOfAsm(a, st) {
        if (!a) return { kind: 'none', text: '' };
        var reqs = reqsForAsm(a.asmId, null);
        if (reqs.length) return { kind: 'req', reqs: reqs, text: 'held by ' + reqs.map(function (x) { return reqRef(x.req); }).join(', ') };
        if (isVerified(a)) return { kind: 'verified', text: 'verified' };
        if (isCredited(a) && !isDead(a)) return { kind: 'gap', text: 'credited, no requirement or verification behind it' };
        return { kind: 'none', text: '' };
    }
    function firstLinkedSubId(a, st) {
        var hit = '';
        var pool = st ? [st] : stores();
        pool.some(function (s) { return s.fhas.some(function (f) { if (f && _arr(f.assumptionIds).map(String).indexOf(String(a.asmId)) >= 0) { hit = f.subId || ''; return true; } return false; }); });
        return hit;
    }
    // Build the requirement row for an assumption. Pure: returns the row, writes nothing.
    function buildPromotion(a, st) {
        var text = String(a.text || a.statement || '').trim();
        var rat = 'Promoted from assumption ' + a.asmId + (a.origin ? ' (' + a.origin + ')' : '') + '.';
        if (!_blank(a.rationale)) rat += ' ' + String(a.rationale).trim();
        if (isCredited(a)) rat += ' Credited posture: ' + String(a.credited).trim() + '.';
        if (!_blank(a.uncredited)) rat += ' Uncredited posture: ' + String(a.uncredited).trim() + '.';
        var tag = tagOfAsm(a);
        var by = '';
        try { if (typeof _signoffReviewerName === 'function') by = _signoffReviewerName() || ''; } catch (_) {}
        return {
            internalId: _newId(),
            traceId: firstLinkedSubId(a, st),
            level: st.scope === 'ac' ? 'L1' : 'L2',
            type: 'Safety', analysis: '',
            text: text, rat: rat,
            sourceAnalysis: tag,
            verifMethod: '', verifStatus: '', verifEvidence: '',
            validationMethod: '', validationStatus: '', validationEvidence: '',
            derivationType: 'derived', parentReqId: '',
            linkedAsmIds: [String(a.asmId)],
            reqSource: { generator: 'assumption', sourceId: 'asm:' + a.asmId,
                         context: { asmId: String(a.asmId), state: String(a.state || ''), credited: String(a.credited || ''), sourceAnalysis: tag },
                         fingerprint: 'asm|' + text + '|' + String(a.credited || ''),
                         promotedAt: new Date().toISOString(), promotedBy: by }
        };
    }
    // One click. Writes the requirement and the back-link; returns { req, created }.
    function promote(scope, asmId) {
        var st = storeFor(scope);
        if (!st) return null;
        var a = asmFor(asmId, st);
        if (!a) return null;
        var have = reqsForAsm(a.asmId, null);
        if (have.length) return { req: have[0].req, scope: have[0].scope, created: false };
        var row = buildPromotion(a, st);
        st.reqs.push(row);
        var ids = _arr(a.requirementIds).slice();
        ids.push(row.internalId);
        a.requirementIds = ids;
        try { if (typeof ReqHistory !== 'undefined' && ReqHistory && typeof ReqHistory.record === 'function') ReqHistory.record(row, 'auto-create', null, { note: 'assumption ' + a.asmId }); } catch (_) {}
        try { if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {}
        return { req: row, scope: st.scope, created: true };
    }
    function promoteClick(scope, asmId) {
        var res = promote(scope, asmId);
        var d = root.document;
        if (!res) { try { if (typeof root.showToast === 'function') root.showToast('Assumption not found.', 'warning', 3000); } catch (_) {} return; }
        try {
            if (res.scope === 'ac') { if (typeof root.renderACReq === 'function') root.renderACReq(); if (typeof root.renderACAssumptions === 'function') root.renderACAssumptions(); }
            else { if (typeof root.renderSysReq === 'function') root.renderSysReq(); if (typeof root.renderSysAssumptions === 'function') root.renderSysAssumptions(); }
        } catch (_) {}
        try {
            if (typeof root.showToast === 'function') root.showToast(res.created
                ? 'Requirement ' + reqRef(res.req) + ' created from assumption ' + asmId + '. Edit the statement into "shall" form on the Requirements page.'
                : 'Assumption ' + asmId + ' is already held by ' + reqRef(res.req) + '.', res.created ? 'success' : 'info', 4500);
        } catch (_) {}
        if (d) { try { var tr = d.querySelector('tr[data-iid="' + res.req.internalId + '"]'); if (tr) tr.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {} }
    }

    // ---- Q2 rationale ------------------------------------------------------------
    // Safety-derived: Safety class, or produced by an analysis generator, or tagged
    // with an analysis. A functional/performance/customer requirement is not held to it.
    function isSafetyDerived(r) {
        if (!r) return false;
        if (String(r.type || '') === 'Safety') return true;
        if (r.reqSource && r.reqSource.generator) return true;
        if (!_blank(r.analysis)) return true;
        return false;
    }
    function rationaleGaps() {
        var out = [];
        stores().forEach(function (st) {
            liveReqs(st).forEach(function (r) {
                if (!isSafetyDerived(r) || !_blank(r.rat)) return;
                out.push({ req: r, scope: st.scope, label: st.label, text: st.label + ' requirement ' + reqRef(r) + ' (' + (r.type || 'Safety') + ') has no rationale: "' + String(r.text || '').slice(0, 70) + '"' });
            });
        });
        return out;
    }
    // Form gate: called before the original submit. Returns true when the save may go on.
    function formOk(prefix) {
        var d = root.document; if (!d) return true;
        var typeEl = d.getElementById(prefix + '-type'), ratEl = d.getElementById(prefix + '-rat');
        if (!typeEl || !ratEl) return true;
        if (String(typeEl.value || '') !== 'Safety' || !_blank(ratEl.value)) return true;
        try { if (typeof root.showToast === 'function') root.showToast('A safety requirement needs a rationale: say why it exists (which hazard, target or analysis it answers). The statement carries only the "what".', 'warning', 6000); } catch (_) {}
        try { ratEl.focus(); ratEl.style.outline = '2px solid var(--color-warning)'; setTimeout(function () { ratEl.style.outline = ''; }, 2500); } catch (_) {}
        return false;
    }
    function _wrapSubmit(name, prefix) {
        var orig = root[name];
        if (typeof orig !== 'function' || orig._rbWrapped) return false;
        var w = function () { if (!formOk(prefix)) return; return orig.apply(this, arguments); };
        w._rbWrapped = true; root[name] = w; return true;
    }

    // ---- invariants --------------------------------------------------------------
    var INV_CREDIT = { id: 'INV-59', sev: 'advisory',
        name: 'Every credited assumption is verified or held by a requirement (ARP4754B §5.3.1 rationale, §6.3 validation)',
        run: function () {
            var n = 0; stores().forEach(function (st) { st.asms.forEach(function (a) { if (a && isCredited(a) && !isDead(a)) n++; }); });
            var f = creditGaps();
            return { checked: n, fails: f.slice(0, 20).map(function (x) { return x.text; }), failCount: f.length };
        } };
    var INV_RAT = { id: 'INV-60', sev: 'advisory',
        name: 'Every safety-derived requirement carries a rationale (ARP4754B §5.3.1)',
        run: function () {
            var n = 0; stores().forEach(function (st) { n += liveReqs(st).filter(isSafetyDerived).length; });
            var f = rationaleGaps();
            return { checked: n, fails: f.slice(0, 20).map(function (x) { return x.text; }), failCount: f.length };
        } };
    (function reg(tries) {
        if (typeof root.invRegister === 'function') { try { root.invRegister(INV_CREDIT); root.invRegister(INV_RAT); } catch (_) {} return; }
        if (tries > 0 && typeof setTimeout === 'function') setTimeout(function () { reg(tries - 1); }, 50);
    })(40);

    // ---- Q3 for reports: every requirement and assumption under its tag --------------
    // scopeSel: 'ac' | 'sys-<id>' | null (all). Rows are plain objects for the report tables.
    function byTag(scopeSel) {
        var groups = {}; TAGS.forEach(function (t) { groups[t] = { tag: t, label: TAG_LABEL[t], requirements: [], assumptions: [] }; });
        groups[''] = { tag: '', label: 'Untagged', requirements: [], assumptions: [] };
        stores().forEach(function (st) {
            if (scopeSel && st.scope !== scopeSel) return;
            liveReqs(st).forEach(function (r) { groups[tagOfReq(r, st)].requirements.push({ ref: reqRef(r), scope: st.label, req: r }); });
            st.asms.forEach(function (a) { if (a) groups[tagOfAsm(a)].assumptions.push({ ref: String(a.asmId || ''), scope: st.label, asm: a }); });
        });
        return groups;
    }
    function appendixRows(scopeSel) {
        var g = byTag(scopeSel), rows = [];
        TAGS.concat(['']).forEach(function (t) {
            var grp = g[t];
            grp.requirements.forEach(function (x) { rows.push({ 'Source': t || 'Untagged', 'Kind': 'Requirement', 'ID': x.ref, 'Statement': String(x.req.text || ''), 'Rationale': String(x.req.rat || ''), 'Status': String(x.req.verifStatus || x.req.vvStatus || 'Pending') }); });
            grp.assumptions.forEach(function (x) { rows.push({ 'Source': t || 'Untagged', 'Kind': 'Assumption', 'ID': x.ref, 'Statement': String(x.asm.text || x.asm.statement || ''), 'Rationale': String(x.asm.rationale || ''), 'Status': String(x.asm.state || '') + (statusOfAsm(x.asm).text ? ' · ' + statusOfAsm(x.asm).text : '') }); });
        });
        return rows;
    }

    // ---- Golden Thread stage -----------------------------------------------------
    // Per failure condition: safety requirements traced to it with no rationale, and
    // credited assumptions linked to it with nothing behind them.
    function reqsForFc(fha, st) {
        return liveReqs(st).filter(function (r) {
            if (fha.subId && r.traceId && String(r.traceId) === String(fha.subId)) return true;
            var src = r.reqSource || {};
            if (src.context && fha.fcId && String(src.context.fcId || '') === String(fha.fcId)) return true;
            if (src.sourceId && String(src.sourceId).indexOf(':' + fha.internalId) >= 0 && /:fha:/.test(String(src.sourceId))) return true;
            return false;
        });
    }
    function threadStage(fha) {
        if (!fha) return '';
        var st = null;
        stores().some(function (s) { return s.fhas.some(function (f) { if (f === fha || (f && fha.internalId != null && String(f.internalId) === String(fha.internalId) && String(f.fcId || '') === String(fha.fcId || ''))) { st = s; return true; } return false; }); });
        if (!st) return '';
        var lines = [], warn = 0, nReq = 0, nAsm = 0;
        reqsForFc(fha, st).forEach(function (r) {
            if (!isSafetyDerived(r)) return;
            nReq++;
            if (_blank(r.rat)) { warn++; lines.push('<b>' + _esc(reqRef(r)) + '</b> ' + _esc(String(r.text || '').slice(0, 80)) + ' · <span style="color:#9A6200;font-weight:600;">no rationale</span>'); }
        });
        var asmIds = _arr(fha.assumptionIds).map(String);
        st.asms.forEach(function (a) {
            if (!a || asmIds.indexOf(String(a.asmId)) < 0) return;
            nAsm++;
            var s = statusOfAsm(a, st);
            if (s.kind === 'gap') { warn++; lines.push('<b>' + _esc(a.asmId) + '</b> ' + _esc(String(a.text || '').slice(0, 80)) + ' · <span style="color:#9A6200;font-weight:600;">credited, nothing behind it</span> <a href="#" onclick="SLReqBasis.promoteClick(\'' + _esc(st.scope) + '\',\'' + _esc(a.asmId) + '\');return false;" style="font-weight:600;">promote to requirement</a>'); }
            else if (s.kind === 'req') lines.push('<b>' + _esc(a.asmId) + '</b> · ' + _esc(s.text));
        });
        if (!nReq && !nAsm) return '';
        var body = (lines.length ? lines.join('<br>') : 'Every safety requirement here carries a rationale and every credited assumption is verified or held by a requirement.')
            + '<div style="font-size:11px;color:var(--color-text-secondary);margin-top:4px;">' + nReq + ' safety requirement' + (nReq === 1 ? '' : 's') + ' and ' + nAsm + ' linked assumption' + (nAsm === 1 ? '' : 's') + ' checked.</div>';
        return (typeof _gtStage === 'function') ? _gtStage('Requirement basis', body, warn ? 'warn' : 'ok') : '';
    }
    function _wrapThread() {
        var orig = root._renderGoldenThread;
        if (typeof orig !== 'function' || orig._rbWrapped) return false;
        var w = function (fha, domain, highlight) {
            var html = orig.apply(this, arguments);
            try {
                var stage = threadStage(fha);
                if (stage) {
                    var i = html.indexOf('>Verification</span>');
                    var at = i >= 0 ? html.lastIndexOf('<div style="border:1px solid var(--color-border-hair)', i) : -1;
                    html = at >= 0 ? html.slice(0, at) + stage + html.slice(at) : html + stage;
                }
            } catch (_) {}
            return html;
        };
        w._rbWrapped = true; root._renderGoldenThread = w; return true;
    }

    // ---- page decorations --------------------------------------------------------
    function tagSelectHtml(current, onchange, title) {
        return '<select class="state-select" style="min-width:74px;font-size:11px;" title="' + _esc(title || 'Source analysis') + '" onchange="' + onchange + '">'
            + '<option value=""' + (current ? '' : ' selected') + '>source</option>'
            + TAGS.map(function (t) { return '<option value="' + t + '"' + (current === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select>';
    }
    function tagPill(tag, how) {
        if (!tag) return '';
        return '<span class="u-mono" data-rb-tag="' + tag + '" title="Source analysis' + (how === 'derived' ? ' (from the generator)' : '') + '" style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:9px;font-size:10px;font-weight:700;background:var(--color-surface-2);border:1px solid var(--color-border-hair);color:var(--color-text-secondary);">' + _esc(tag) + '</span>';
    }
    function setAsmTag(scope, asmId, val) {
        var st = storeFor(scope); var a = st && asmFor(asmId, st);
        if (!a) return;
        a.sourceAnalysis = normTag(val);
        try { if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {}
    }
    // Assumption rows: the promote button and the tag select go into the ID cell.
    function decorateAsmTable(scope) {
        var d = root.document; if (!d) return 0;
        var tbody = d.getElementById(scope === 'ac' ? 'ac-asm-body' : 'sys-asm-body'); if (!tbody) return 0;
        var st = storeFor(scope); if (!st) return 0;
        var n = 0;
        Array.prototype.forEach.call(tbody.querySelectorAll('tr'), function (tr) {
            if (tr.getAttribute('data-rb') === '1') return;
            var strong = tr.querySelector('td strong'); if (!strong) return;
            var asmId = strong.textContent.trim(); var a = asmFor(asmId, st); if (!a) return;
            var s = statusOfAsm(a, st);
            var cell = strong.parentNode;
            var html = '<div style="margin-top:4px;display:flex;align-items:center;gap:4px;flex-wrap:wrap;">'
                + (s.kind === 'req'
                    ? '<span class="u-mono" style="font-size:10px;color:#1D9E75;font-weight:700;" title="' + _esc(s.text) + '">→ ' + _esc(reqRef(s.reqs[0].req)) + '</span>'
                    : '<button type="button" class="action-btn" style="padding:1px 7px;font-size:10.5px;" title="Create a requirement that carries this assumption, its source tag and its rationale, and link the two" onclick="SLReqBasis.promoteClick(\'' + _esc(st.scope) + '\',\'' + _esc(asmId) + '\')">→ requirement</button>')
                + (s.kind === 'gap' ? '<span style="font-size:10px;color:#9A6200;font-weight:700;" title="Credited, but neither verified nor held by a requirement">● GAP</span>' : '')
                + tagSelectHtml(tagOfAsm(a), 'SLReqBasis.setAsmTag(\'' + _esc(st.scope) + '\',\'' + _esc(asmId) + '\',this.value)', 'Source analysis this assumption comes from')
                + '</div>';
            cell.insertAdjacentHTML('beforeend', html);
            tr.setAttribute('data-rb', '1'); n++;
        });
        return n;
    }
    // Requirement rows: the tag pill goes next to the Type cell.
    function decorateReqTable(scope) {
        var d = root.document; if (!d) return 0;
        var tbody = d.getElementById(scope === 'ac' ? 'ac-req-body' : 'sys-req-body'); if (!tbody) return 0;
        var st = storeFor(scope); if (!st) return 0;
        var byId = {}; st.reqs.forEach(function (r) { if (r) byId[String(r.internalId)] = r; });
        var n = 0;
        Array.prototype.forEach.call(tbody.querySelectorAll('tr'), function (tr, i) {
            if (tr.getAttribute('data-rb') === '1') return;
            var r = byId[String(tr.getAttribute('data-iid'))] || st.reqs[i]; if (!r) return;
            var tag = tagOfReq(r, st);
            tr.setAttribute('data-rb-tag', tag);
            var cells = tr.querySelectorAll('td');
            if (tag && cells.length > 3) cells[3].insertAdjacentHTML('beforeend', tagPill(tag, tagSource(r)));
            if (isSafetyDerived(r) && _blank(r.rat) && cells.length > 5) cells[5].insertAdjacentHTML('beforeend', '<span style="font-size:10px;color:#9A6200;font-weight:700;" title="A safety requirement needs a rationale">● no rationale</span>');
            tr.setAttribute('data-rb', '1'); n++;
        });
        return n;
    }
    function _wrapRender(name, fn) {
        var orig = root[name];
        if (typeof orig !== 'function' || orig._rbWrapped) return false;
        var w = function () { var r = orig.apply(this, arguments); try { fn(); } catch (_) {} return r; };
        w._rbWrapped = true; root[name] = w; return true;
    }
    // The pager and the surgical single-row patch draw rows without calling the page
    // renderer, so the wrappers alone miss pages 2+ and freshly added rows. Watch the
    // four bodies: any row that arrives undecorated is decorated on the next tick.
    var _observed = {};
    function _observe(id, fn) {
        var d = root.document; if (!d || typeof root.MutationObserver !== 'function' || _observed[id]) return false;
        var tb = d.getElementById(id); if (!tb) return false;
        var pending = false;
        var mo = new root.MutationObserver(function () {
            if (pending) return; pending = true;
            setTimeout(function () { pending = false; try { fn(); } catch (_) {} }, 0);
        });
        mo.observe(tb, { childList: true });
        _observed[id] = mo; return true;
    }
    function watchTables() {
        return [_observe('ac-asm-body', function () { decorateAsmTable('ac'); }),
                _observe('sys-asm-body', function () { decorateAsmTable('sys'); }),
                _observe('ac-req-body', function () { decorateReqTable('ac'); }),
                _observe('sys-req-body', function () { decorateReqTable('sys'); })].every(Boolean);
    }
    (function hook(tries) {
        var ok = [_wrapThread(), watchTables(),
                  _wrapRender('renderACAssumptions', function () { decorateAsmTable('ac'); }),
                  _wrapRender('renderSysAssumptions', function () { decorateAsmTable('sys'); }),
                  _wrapRender('renderACReq', function () { decorateReqTable('ac'); }),
                  _wrapRender('renderSysReq', function () { decorateReqTable('sys'); }),
                  _wrapSubmit('submitACReq', 'ac-req'), _wrapSubmit('submitSysReq', 'sys-req')];
        if (ok.some(function (x) { return !x; }) && tries > 0 && typeof setTimeout === 'function') setTimeout(function () { hook(tries - 1); }, 100);
    })(50);

    var api = { TAGS: TAGS, TAG_LABEL: TAG_LABEL, GEN_TAG: GEN_TAG, stores: stores, storeFor: storeFor, liveReqs: liveReqs, reqRef: reqRef,
                normTag: normTag, tagOfGenerator: tagOfGenerator, tagOfAsm: tagOfAsm, tagOfReq: tagOfReq, tagSource: tagSource,
                asmFor: asmFor, reqsForAsm: reqsForAsm, isCredited: isCredited, isVerified: isVerified, creditGaps: creditGaps, statusOfAsm: statusOfAsm,
                buildPromotion: buildPromotion, promote: promote, promoteClick: promoteClick,
                isSafetyDerived: isSafetyDerived, rationaleGaps: rationaleGaps, formOk: formOk,
                INV_CREDIT: INV_CREDIT, INV_RAT: INV_RAT, byTag: byTag, appendixRows: appendixRows,
                reqsForFc: reqsForFc, threadStage: threadStage, decorateAsmTable: decorateAsmTable, decorateReqTable: decorateReqTable,
                setAsmTag: setAsmTag, tagSelectHtml: tagSelectHtml, tagPill: tagPill,
                watchTables: watchTables, _observe: _observe,
                _wrapThread: _wrapThread, _wrapRender: _wrapRender, _wrapSubmit: _wrapSubmit };
    try { root.SLReqBasis = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
