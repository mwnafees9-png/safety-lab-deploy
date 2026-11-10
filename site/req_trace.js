// ============================================================================
// req_trace.js (SLReqTrace v1.0, 10 Nov 2026): every requirement's ID, type, level and where it is driven from.
//
// Waqas, 10 Nov 2026 (the PASA and PSSA Autopilots):
//   "Requirement derivation level is asked once per requirement type. Each answer is aircraft, system or item, and applies
//    to every failure condition in the report, with an override per failure condition." "The PSSA shows the PASA's levels
//    and lets one system override them."
//   "Every requirement carries its rationale and where it's driven from. Wherever a requirement appears (the report,
//    Aircraft requirements, the Golden Thread, Word), it shows its text, its rationale in plain words, and where it's
//    driven from (failure condition, gate or event, analysis, each ID with its name and a link)."
//   "Requirements imported through ReqIF with no rationale or source are flagged 'rationale missing', never shown blank."
//
// What this module owns:
//   TYPES          the eight requirement types, each mapped to AutoReq's existing generators (no new generator)
//   typeOf(r)      the type of a requirement (by its generator), or null for one AutoReq did not write
//   levels         projectConfig.reqLevels = { types: { <type>: 'aircraft'|'system'|'item' }, fc: { <fcId>: { <type>: lvl } },
//                  sys: { <sysId>: { <type>: lvl } } }; levelFor(type, { fcId, sysId }) applies system, then failure
//                  condition, then report-wide. setLevel(...) writes one; syncLevels() puts the level on every AutoReq row
//                  (L1 aircraft, L2 system, L3 item) so the registers, the report and Word say the same.
//   drivenFrom(r)  [{ what, id, name, tab }]: the failure condition, the gate or event, the analysis
//   ensureIds()    a requirement ID on every row that has none: REQ-AC-001 on the aircraft, REQ-<system code>-001 on a
//                  system (numbers never reused; an imported row keeps its own ID)
//   rationale(r)   { text, missing } ; source missing on an imported row with no trace
//   panelHtml(ref) the requirement on the Golden Thread panel: text, rationale, driven from
// Decorates the Aircraft and System requirements tables: the ID in the Trace cell, "Driven from" under the rationale, and
// "Rationale missing" / "Source missing" written out. Pure reads and the store above; no AI. window.SLReqTrace.
// ============================================================================
(function (root) {
    'use strict';
    var VERSION = '1.0';
    function g(n) { try { if (root.SLEnv && root.SLEnv.get) { var v = root.SLEnv.get(n); if (v !== undefined) return v; } } catch (_) {} try { return root[n]; } catch (_) { return undefined; } }
    function arr(v) { return Array.isArray(v) ? v : []; }
    function E(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function S(v) { return v == null ? '' : String(v); }
    function pc() { var p = g('projectConfig'); return p && typeof p === 'object' ? p : null; }
    function save() { try { if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {} }

    // ---- the eight types, mapped to AutoReq's generators ---------------------------------------------------------------
    var TYPES = [
        { id: 'prob', name: 'Probability', what: 'How unlikely each failure condition, event and shared resource must be.', gens: ['fha-prob', 'fta-event', 'fta-resource'] },
        { id: 'spf', name: 'No single failure', what: 'No one failure may cause a Catastrophic or Hazardous failure condition.', gens: ['gate-indep-or'] },
        { id: 'ind', name: 'Independence', what: 'What must not fail together: in function, location, development and common causes.', gens: ['gate-indep-and', 'gate-indep-dev', 'gate-indep-phys', 'gate-indep-ccf-lib', 'gate-indep-ccf-group', 'gate-indep-cma', 'cma-concern'] },
        { id: 'dal', name: 'Development assurance', what: 'The assurance level each function and item is developed to.', gens: ['fha-dal', 'dalgebra'] },
        { id: 'hid', name: 'Hidden failures and checks', what: 'How often a failure nobody would notice is checked for, and what watches for it.', gens: ['fta-interval', 'fta-interval-monitor', 'fcim-monitor'] },
        { id: 'inst', name: 'Installation and separation', what: 'How equipment is installed and kept apart against zone and particular risks.', gens: ['zsa-phys', 'zsa-separation', 'pra-zonal', 'pra-scenario'] },
        { id: 'crew', name: 'Crew and operational', what: 'What the crew must do, see and have time for, and the assumptions the analysis makes about them.', gens: ['hf-op-action', 'hf-op-info', 'hf-op-timing', 'assumption', 'usoc-info'] },
        { id: 'ifc', name: 'Interface', what: 'What one system expects of another at the interface between them.', gens: ['fta-resource-iface'] }
    ];
    var LEVELS = [{ id: 'aircraft', label: 'Aircraft', code: 'L1' }, { id: 'system', label: 'System', code: 'L2' }, { id: 'item', label: 'Item', code: 'L3' }];
    var GEN_TYPE = {}; TYPES.forEach(function (t) { t.gens.forEach(function (x) { GEN_TYPE[x] = t.id; }); });
    function genOf(r) {
        var rs = r && r.reqSource; if (!rs) return '';
        var gname = S(rs.generator);
        // genGateIndependence writes 'gate-indep' for both the AND and the OR form: the source key says which
        if (gname === 'gate-indep') return /:gate-indep:/.test(S(rs.sourceId)) && rs.context && /^(OR|XOR|VOTING)$/i.test(S(rs.context.gateType)) ? 'gate-indep-or' : 'gate-indep-and';
        return gname;
    }
    function typeOf(r) { var x = genOf(r); return x ? (GEN_TYPE[x] || (/^gate-indep/.test(x) ? 'ind' : null)) : null; }
    function typeDef(id) { return TYPES.filter(function (t) { return t.id === id; })[0] || null; }

    // ---- levels -----------------------------------------------------------------------------------------------------
    function lstore(write) {
        var p = pc(); if (!p) return { types: {}, fc: {}, sys: {} };
        if (!p.reqLevels || typeof p.reqLevels !== 'object') { if (!write) return { types: {}, fc: {}, sys: {} }; p.reqLevels = {}; }
        var L = p.reqLevels; ['types', 'fc', 'sys'].forEach(function (k) { if (!L[k] || typeof L[k] !== 'object') L[k] = {}; });
        return L;
    }
    function levelFor(type, o) {
        o = o || {}; var L = lstore(false);
        if (o.sysId != null && L.sys[S(o.sysId)] && L.sys[S(o.sysId)][type]) return { level: L.sys[S(o.sysId)][type], from: 'system' };
        if (o.fcId && L.fc[S(o.fcId)] && L.fc[S(o.fcId)][type]) return { level: L.fc[S(o.fcId)][type], from: 'failure condition' };
        if (L.types[type]) return { level: L.types[type], from: 'report' };
        return { level: null, from: null };
    }
    // where: 'types' (report wide), { fc: id }, { sys: id }; value null clears an override
    function setLevel(type, value, where) {
        if (!typeDef(type)) throw new Error('No such requirement type.');
        if (value != null && !LEVELS.some(function (l) { return l.id === value; })) throw new Error('A level is aircraft, system or item.');
        var L = lstore(true), m = !where || where === 'types' ? L.types : where.fc ? (L.fc[S(where.fc)] = L.fc[S(where.fc)] || {}) : (L.sys[S(where.sys)] = L.sys[S(where.sys)] || {});
        if (value == null) delete m[type]; else m[type] = value;
        syncLevels(); save();
        return true;
    }
    function levelLabel(id) { var l = LEVELS.filter(function (x) { return x.id === id; })[0]; return l ? l.label : ''; }
    function codeOf(id) { var l = LEVELS.filter(function (x) { return x.id === id; })[0]; return l ? l.code : ''; }

    // ---- the registers ----------------------------------------------------------------------------------------------
    function systems() { return arr(g('systemsData')).filter(function (s) { return s && s.id != null; }); }
    function stores() {
        var out = [{ scope: 'ac', sys: null, reqs: arr(g('acReqData')) }];
        systems().forEach(function (s) { out.push({ scope: 'sys-' + s.id, sys: s, reqs: arr(s.req) }); });
        return out;
    }
    function live(r) { return r && !r.deleted && r.status !== 'archived' && !(r.reqSource && r.reqSource.obsolete); }
    function sysCode(sy) {
        if (!sy) return 'AC';
        if (sy.code && /^[A-Za-z0-9]{2,6}$/.test(String(sy.code))) return String(sy.code).toUpperCase();
        var w = String(sy.name || sy.id).replace(/\([^)]*\)/g, ' ').replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(function (x) { return x && !/^(and|of|the)$/i.test(x) && !/^\d+$/.test(x); });
        var c = w.length > 1 ? w.map(function (x) { return x.charAt(0); }).join('') : (w[0] || String(sy.id)).slice(0, 3);
        return c.toUpperCase().slice(0, 5);
    }
    // a system's code, kept unique across the project (two systems that would share one get a digit)
    function codes() {
        var used = { AC: 1 }, out = {};
        systems().forEach(function (s) { var c = sysCode(s), k = c, n = 2; while (used[k]) k = c + (n++); used[k] = 1; out[S(s.id)] = k; });
        return out;
    }
    function ensureIds() {
        var cs = codes(), n = 0;
        stores().forEach(function (st) {
            var pre = 'REQ-' + (st.sys ? cs[S(st.sys.id)] : 'AC') + '-', max = 0, rx = new RegExp('^' + pre.replace(/-/g, '\\-') + '(\\d+)$');
            st.reqs.forEach(function (r) { var m = r && rx.exec(S(r.id)); if (m) max = Math.max(max, parseInt(m[1], 10)); });
            st.reqs.forEach(function (r) { if (!r || S(r.id).trim()) return; max++; r.id = pre + String(max).padStart(3, '0'); n++; });
        });
        if (n) save();
        return n;
    }
    function syncLevels() {
        var n = 0;
        stores().forEach(function (st) {
            st.reqs.forEach(function (r) {
                if (!live(r) || !r.reqSource) return;
                var t = typeOf(r); if (!t) return;
                var f = fcOf(r), lv = levelFor(t, { fcId: f ? f.fcId : null, sysId: st.sys ? st.sys.id : null }).level;
                if (!lv) return;
                var code = codeOf(lv);
                if (r.level !== code) { r.level = code; n++; }
                if (r.derivedTo !== lv) { r.derivedTo = lv; n++; }
            });
        });
        return n;
    }

    // ---- where a requirement is driven from -------------------------------------------------------------------------
    var _ix = null, _ixGen = -2;
    function index() {
        var dc = root.SLDataChange, gen = dc && dc.gen ? dc.gen() : -1;
        if (_ix && gen === _ixGen && gen !== -1) return _ix;
        var ix = { lid: {}, node: {}, page: {} };
        arr(g('ftaPages')).forEach(function (p) {
            if (!p || !p.root || p.integrated) return;
            ix.page[S(p.id)] = p;
            (function w(n) { if (!n) return; var lid = S(n.logicalId != null ? n.logicalId : n.id); if (!ix.lid[lid]) ix.lid[lid] = { page: p, node: n }; ix.node[S(p.id) + ':' + S(n.id)] = { page: p, node: n }; (n.children || n._children || []).forEach(w); })(p.root);
        });
        _ix = ix; _ixGen = gen; return ix;
    }
    function fhaRows() {
        var out = [];
        arr(g('acFhaData')).forEach(function (f) { if (f) out.push({ f: f, sys: null }); });
        systems().forEach(function (s) { arr(s.fha).forEach(function (f) { if (f) out.push({ f: f, sys: s }); }); });
        return out;
    }
    function fhaByIid(iid) { iid = S(iid).replace(/^(AC_|SYS_)/, ''); return fhaRows().filter(function (x) { return S(x.f.internalId) === iid; })[0] || null; }
    function fhaByFcId(id, sys) { return fhaRows().filter(function (x) { return S(x.f.fcId) === S(id) && (sys === undefined || (x.sys ? S(x.sys.id) : null) === (sys == null ? null : S(sys))); })[0] || null; }
    function pageFc(p) {
        if (!p) return null;
        var ids = (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length) ? p.linkedFhaIds : (p.linkedFhaId ? [p.linkedFhaId] : []);
        for (var i = 0; i < ids.length; i++) { var x = fhaByIid(ids[i]); if (x) return x; }
        return null;
    }
    function nodeLabel(n) { return n ? ((n.displayId || ('#' + n.id)) + (n.name ? ' ' + n.name : '')) : ''; }
    function fcEntry(x) { return x ? { what: (x.sys ? (x.sys.name || x.sys.id) + ' failure condition' : 'Aircraft failure condition'), id: S(x.f.fcId || ('FC#' + x.f.internalId)), name: S(x.f.fcDesc || ''), tab: x.sys ? 'sys:' + x.sys.id + ':fha' : 'ac-fha' } : null; }
    function treeEntry(p, n, word) { return { what: word || (n && n.type === 'gate' ? 'Gate' : 'Event'), id: S(n ? (n.displayId || ('#' + n.id)) : ''), name: S(n && n.name || ''), tab: 'fta:' + S(p.id) + (n ? ':' + S(n.id) : ''), tree: S(p.name || p.id) }; }
    // the failure condition a requirement belongs to (the first it is driven from)
    function fcOf(r) {
        var d = drivenFrom(r).filter(function (x) { return /failure condition$/.test(x.what); })[0];
        return d ? { fcId: d.id, name: d.name } : null;
    }
    function drivenFrom(r) {
        var rs = r && r.reqSource; if (!rs) return [];
        var gname = genOf(r), sid = S(rs.sourceId), ctx = rs.context || {}, out = [], ix = index();
        var push = function (e) { if (e && !out.some(function (y) { return y.what === e.what && y.id === e.id; })) out.push(e); };
        var parts = sid.split(':');
        var analysis = function (word, id, name, tab) { push({ what: word, id: S(id), name: S(name || ''), tab: tab || '' }); };
        if (/^fha-/.test(gname)) {
            if (gname === 'fha-prob') { push(fcEntry(fhaByIid(parts[parts.length - 1]) || (ctx.fcId ? fhaByFcId(ctx.fcId) : null))); analysis('Analysis', 'FHA', 'Functional hazard assessment', 'ac-fha'); }
            else { var sub = parts[parts.length - 1]; analysis('Function', sub, (function () { var f = arr(g('acFunctionsData')).filter(function (x) { return x && S(x.subId) === sub; })[0]; return f ? (f.subName || f.funcName || '') : ''; })(), 'ac-func'); fhaRows().filter(function (x) { return S(x.f.subId) === sub; }).slice(0, 3).forEach(function (x) { push(fcEntry(x)); }); analysis('Analysis', 'FHA', 'Functional hazard assessment', 'ac-fha'); }
        } else if (/^fta-/.test(gname)) {
            var lid = gname === 'fta-resource' || gname === 'fta-resource-iface' ? null : parts[parts.length - 1], hit = lid != null ? ix.lid[lid] : null;
            if (hit) { push(fcEntry(pageFc(hit.page))); push(treeEntry(hit.page, hit.node)); }
            if (ctx.resourceId || gname === 'fta-resource' || gname === 'fta-resource-iface') { var rid = S(ctx.resourceId || parts[parts.length - 1]), res = arr(g('resourcesData')).filter(function (x) { return x && (S(x.resId) === rid || S(x.internalId) === rid); })[0]; analysis('Shared resource', res ? res.resId || rid : rid, res ? res.name : '', 'interdep'); }
            if (ctx.fcId) push(fcEntry(fhaByFcId(ctx.fcId)));
            analysis('Analysis', 'FTA', 'Fault tree analysis', hit ? 'fta:' + S(hit.page.id) : 'fta');
        } else if (gname === 'dalgebra') {
            var pg = ix.page[parts[2]], nd = pg ? (ix.lid[parts[3]] && ix.lid[parts[3]].page === pg ? ix.lid[parts[3]].node : null) : null;
            if (pg) { push(fcEntry(pageFc(pg))); if (nd) push(treeEntry(pg, nd)); }
            analysis('Analysis', 'DAL', 'Development assurance allocation', 'dal-ref');
        } else if (/^gate-indep/.test(gname)) {
            var pid = parts[2], nid = parts[3], gh = ix.node[pid + ':' + nid];
            if (gh) { push(fcEntry(pageFc(gh.page))); push(treeEntry(gh.page, gh.node, 'Gate')); }
            if (ctx.cmaId) analysis('Common mode analysis', ctx.cmaId, '', 'cma');
            analysis('Analysis', 'FTA', 'Fault tree analysis', gh ? 'fta:' + S(gh.page.id) : 'fta');
        } else if (gname === 'cma-concern') {
            var cm = arr(g('cmaData')).filter(function (c) { return c && S(c.internalId) === parts[2]; })[0];
            analysis('Common mode analysis', ctx.cmaId || (cm && cm.cmaId) || parts[2], cm ? cm.subject || '' : '', 'cma');
            arr(ctx.gates).slice(0, 4).forEach(function (k) { var x = ix.node[S(k)]; if (x) { push(fcEntry(pageFc(x.page))); push(treeEntry(x.page, x.node, 'Gate')); } });
        } else if (gname === 'pra-zonal' || gname === 'pra-scenario') {
            var praId = parts[2]; var pr = arr(g('praData')).filter(function (x) { return x && (S(x.praId) === praId || S(x.internalId) === praId); })[0];
            analysis('Particular risk', pr ? pr.praId || praId : praId, pr ? (pr.threat || pr.desc || '') : (ctx.threat || ''), 'pra');
            arr(ctx.fcIds).forEach(function (iid) { push(fcEntry(fhaByIid(iid))); });
        } else if (/^zsa/.test(gname)) {
            var zid = S(ctx.zoneId || parts[2]), z = arr(g('zsaData')).filter(function (x) { return x && S(x.zoneId) === zid; })[0];
            analysis('Zone', zid, z ? z.desc || '' : '', 'zsa');
        } else if (/^hf-op/.test(gname) || gname === 'assumption') {
            var aid = S(ctx.asmId || parts[parts.length - 1]);
            analysis('Assumption', aid, '', 'ac-asm');
            arr(ctx.fcIds).filter(Boolean).forEach(function (f) { push(fcEntry(fhaByFcId(f))); });
        } else if (gname === 'fcim-monitor') {
            analysis('Function', ctx.subId || '', '', 'ac-fcim');
            arr(ctx.fcIds).forEach(function (f) { push(fcEntry(fhaByFcId(f))); });
        } else if (gname === 'usoc-info') {
            analysis('Unsafe operating condition', ctx.usoc || parts[parts.length - 1], '', 'usoc');
            if (ctx.fc) push(fcEntry(fhaByFcId(ctx.fc)));
        } else if (gname === 'reqif') {
            if (r.parentReqId) analysis('Parent requirement', r.parentReqId, '', '');
        }
        // failure conditions first, then the tree, then the analysis
        var rank = function (e) { return /failure condition$/.test(e.what) ? 0 : (e.what === 'Gate' || e.what === 'Event') ? 1 : 2; };
        return out.filter(Boolean).sort(function (a, b) { return rank(a) - rank(b); });
    }
    function drivenText(r) { return drivenFrom(r).map(function (e) { return e.id + (e.name ? ' ' + e.name : '') + (e.tree && (e.what === 'Gate' || e.what === 'Event') ? ' (fault tree ' + e.tree + ')' : ''); }).join('; '); }
    function rationale(r) {
        var t = S(r && r.rat).trim(), imported = !!(r && r.reqSource && r.reqSource.generator === 'reqif');
        return { text: t, missing: !t, sourceMissing: imported && !drivenFrom(r).length && !S(r.traceId).trim() };
    }
    // open where an entry points (best effort: the tool's own pages)
    function open(tab) {
        tab = S(tab); if (!tab) return false;
        try {
            if (/^fta:/.test(tab)) { var p = tab.split(':'); if (typeof root.switchFTAPage === 'function') root.switchFTAPage(p[1]); else if (typeof root.switchTab === 'function') root.switchTab('fta'); return true; }
            if (/^sys:/.test(tab)) { var q = tab.split(':'); if (typeof root.openSystemWorkspace === 'function') root.openSystemWorkspace(q[1]); if (typeof root.switchWorkspaceTab === 'function') root.switchWorkspaceTab(q[2] || 'fha'); return true; }
            if (typeof root.switchTab === 'function') { root.switchTab(tab); return true; }
        } catch (_) {}
        return false;
    }
    function linkHtml(e) { return '<a href="javascript:void(0)" data-rt-open="' + E(e.tab) + '" onclick="SLReqTrace.open(this.getAttribute(\'data-rt-open\'))">' + E(e.id) + '</a>' + (e.name ? ' ' + E(e.name) : ''); }
    function drivenHtml(r) { var d = drivenFrom(r); return d.length ? d.map(function (e) { return '<span class="rt-df"><span class="rt-dfw">' + E(e.what) + '</span> ' + linkHtml(e) + '</span>'; }).join('') : ''; }

    // ---- the Golden Thread panel ------------------------------------------------------------------------------------
    function findReq(ref) {
        ref = ref || {}; var id = S(ref.id), hit = null;
        stores().some(function (st) { return st.reqs.some(function (r) { if (r && S(r.internalId) === id) { hit = { r: r, st: st }; return true; } return false; }); });
        return hit;
    }
    function panelHtml(ref) {
        var h = findReq(ref); if (!h) return '';
        var r = h.r, ra = rationale(r), d = drivenFrom(r), t = typeDef(typeOf(r));
        return '<div class="rt-panel" data-rt-panel="' + E(r.internalId) + '" style="margin-top:10px;border-top:1px solid var(--color-border-hair);padding-top:8px;font-size:12.5px;line-height:1.45">'
            + '<div><b>' + E(r.id || r.traceId || ('REQ-' + r.internalId)) + '</b>' + (t ? ' · ' + E(t.name) : '') + (r.derivedTo ? ' · derived at ' + E(levelLabel(r.derivedTo).toLowerCase()) + ' level' : '') + '</div>'
            + '<div style="margin-top:4px">' + E(r.text || '') + '</div>'
            + '<div style="margin-top:6px"><b>Rationale:</b> ' + (ra.missing ? '<span class="rt-miss" data-rt-miss="rationale">Rationale missing</span>' : E(ra.text)) + '</div>'
            + '<div style="margin-top:6px"><b>Driven from:</b> ' + (d.length ? d.map(function (e) { return E(e.what) + ' ' + linkHtml(e); }).join('; ') : (ra.sourceMissing ? '<span class="rt-miss" data-rt-miss="source">Source missing</span>' : 'Written by hand')) + '</div></div>';
    }

    // ---- the requirements tables ------------------------------------------------------------------------------------
    function style() {
        if (typeof document === 'undefined' || document.getElementById('rt-style')) return;
        var st = document.createElement('style'); st.id = 'rt-style';
        st.textContent = '.rt-df{display:block;font-size:11.5px;line-height:1.4;margin-top:2px}.rt-dfw{font-weight:600}.rt-dfh{display:block;font-size:11.5px;font-weight:700;margin-top:6px}'
            + '.rt-miss{display:inline-block;font-size:11px;font-weight:700;padding:1px 7px;border-radius:999px;background:#FCECEC;color:#8A1C1C;border:1px solid #E7B4B4}'
            + 'body.theme-dark .rt-miss{background:#3A1E1E;color:#F5C2C2;border-color:#6B3434}.rt-id{display:block;font-weight:700}';
        document.head.appendChild(st);
    }
    function decorate(scope) {
        if (typeof document === 'undefined') return 0;
        style();
        var body = document.getElementById(scope === 'ac' ? 'ac-req-body' : 'sys-req-body'); if (!body) return 0;
        var list = scope === 'ac' ? arr(g('acReqData')) : (function () { var cs = g('currentSystemId'), sy = systems().filter(function (s) { return S(s.id) === S(cs); })[0]; return sy ? arr(sy.req) : []; })();
        var by = {}; list.forEach(function (r) { if (r) by[S(r.internalId)] = r; });
        var n = 0;
        Array.prototype.forEach.call(body.querySelectorAll('tr'), function (tr, i) {
            var iid = tr.getAttribute('data-iid');
            var r = (iid ? by[S(iid)] : null) || list[i]; if (!r) return;
            var tds = tr.querySelectorAll('td'); if (tds.length < 6) return;
            var trace = tds[1], rat = tds[5];
            if (trace && !trace.querySelector('.rt-id') && r.id) trace.insertAdjacentHTML('afterbegin', '<span class="rt-id" data-rt-id="1">' + E(r.id) + '</span>');
            if (rat && !rat.querySelector('[data-rt-df]')) {
                var ra = rationale(r);
                // "Rationale missing" itself is written by req_basis.js (one writer); this adds where it is driven from
                var dh = drivenHtml(r);
                rat.insertAdjacentHTML('beforeend', '<span data-rt-df="1">' + (dh ? '<span class="rt-dfh">Driven from</span>' + dh : (ra.sourceMissing ? ' <span class="rt-miss" data-rt-miss="source">Source missing</span>' : '')) + '</span>');
            }
            n++;
        });
        return n;
    }
    (function hook(tries) {
        if (typeof document === 'undefined') return;
        var ok = 0;
        ['renderACReq', 'renderSysReq'].forEach(function (name) {
            var f = root[name]; if (typeof f !== 'function') return; ok++;
            if (f._rtWrapped) return;
            var w = function () { var r = f.apply(this, arguments); try { decorate(name === 'renderACReq' ? 'ac' : 'sys'); } catch (_) {} return r; };
            w._rtWrapped = true; Object.keys(f).forEach(function (k) { try { w[k] = f[k]; } catch (_) {} });
            root[name] = w;
        });
        // AutoReq accepts: every new row gets its ID and its level at once
        var AR = g('AutoReq');
        if (AR && typeof AR.applyMerge === 'function' && !AR.applyMerge._rtWrapped) {
            var am = AR.applyMerge, wm = function () { var x = am.apply(this, arguments); try { ensureIds(); syncLevels(); } catch (_) {} return x; };
            wm._rtWrapped = true; AR.applyMerge = wm;
        }
        if ((ok < 2 || !AR) && tries > 0) setTimeout(function () { hook(tries - 1); }, 100);
    })(60);

    var api = { VERSION: VERSION, TYPES: TYPES, LEVELS: LEVELS, typeOf: typeOf, typeDef: typeDef, genOf: genOf, levelFor: levelFor, setLevel: setLevel, levelLabel: levelLabel,
        syncLevels: syncLevels, ensureIds: ensureIds, sysCode: function (s) { return s ? codes()[S(s.id)] || sysCode(s) : 'AC'; }, drivenFrom: drivenFrom, drivenText: drivenText, drivenHtml: drivenHtml, fcOf: fcOf,
        rationale: rationale, panelHtml: panelHtml, decorate: decorate, open: open, stores: stores };
    try { root.SLReqTrace = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
