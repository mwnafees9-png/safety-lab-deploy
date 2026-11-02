/* comment_kinds.js v1.0 (31 Oct 2026): review comments on every assessment, and the rows ANEM may change.
 *
 * Waqas, 30 Oct 2026: "is our AI capable of addressing comments in the app for every single assessment" ... "lets get
 * it all done". Before this file, comments reached FHA, functions, FCIM, requirements, assumptions, PRA, ZSA, CMA,
 * FMEA, STPA scope, source documents and the HF lanes. This file adds the rest, one entry per kind:
 *   ftaPage  a whole fault tree (PASA, PSSA, SSA, ASA, Standalone)      id = page.id
 *   ftaNode  one gate or event in a tree                                 id = node.id (unique; logicalId is shared)
 *   ccmr     a latent-failure (CCMR) row                                 id = pageId|logicalId (the rows are worked out)
 *   mac      a Minimum Acceptable Configuration rule                     id = rule.id
 *   coffe    a CoFFE combination (one failure condition, one case)       id = fc internalId§caseKey
 *   resource a shared resource                                           id = internalId
 *   markov, rbd, eta   one model or diagram                              id = model id
 *   fracas   a field record                                              id = record id
 *   msg3     an MSI, or one functional failure inside it                 id = MSI id, or MSI id/FF id
 *   crewCredit  the crew credit claimed for one failure condition        id = the FHA row's internalId (+ systemId)
 *
 * Each kind knows its name in words (the review panel and summary), how to get there (jump), and what ANEM should do
 * with a comment on it (anemRef). The TABLES below are the rows ANEM may change when a comment asks for it, beyond the
 * tables ai_assistant.js already edits. The rule for every one of them: only the fields listed, only text (the
 * deterministic engine owns every number), never a status, a verdict that closes something, or a signature. A change
 * to a signed record (a MAC rule, a CoFFE verdict) comes back unsigned, marked as ANEM's proposal, for the engineer to
 * sign again. Source documents stay reply-only: the text is the customer's controlled document.
 */
(function (root) {
    'use strict';
    var VERSION = '1.0';
    function _g(n) {
        try { var E = root.SLEnv; if (E && typeof E.get === 'function') { var v = E.get(n); if (v !== undefined) return v; } } catch (_) {}
        try { return root[n]; } catch (_) { return undefined; }
    }
    function _call(n) { var f = _g(n); if (typeof f === 'function') { try { return f.apply(null, [].slice.call(arguments, 1)); } catch (_) {} } return undefined; }
    function S(v) { return String(v == null ? '' : v); }
    function _pc() { var p = _g('projectConfig'); return (p && typeof p === 'object') ? p : null; }
    function _pages() { var p = _g('ftaPages'); return Array.isArray(p) ? p : []; }
    function _systems() { var s = _g('systemsData'); return Array.isArray(s) ? s : []; }
    function _kids(n) { return (n && (n.children || n._children)) || []; }
    function _findNode(n, id) { if (!n) return null; if (String(n.id) === String(id)) return n; var k = _kids(n); for (var i = 0; i < k.length; i++) { var h = _findNode(k[i], id); if (h) return h; } return null; }
    function _findByLid(n, lid) { if (!n) return null; if (String(n.logicalId != null ? n.logicalId : n.id) === String(lid)) return n; var k = _kids(n); for (var i = 0; i < k.length; i++) { var h = _findByLid(k[i], lid); if (h) return h; } return null; }
    function _pageOfNode(id) { var ps = _pages(); for (var i = 0; i < ps.length; i++) { if (ps[i] && _findNode(ps[i].root, id)) return ps[i]; } return null; }
    function _page(id) { return _pages().find(function (p) { return p && String(p.id) === String(id); }) || null; }
    function _fha(id, sysId) {
        if (sysId) { var s = _systems().find(function (x) { return x && String(x.id) === String(sysId); }); return s ? ((s.fha || []).find(function (r) { return r && String(r.internalId) === String(id); }) || null) : null; }
        var ac = _g('acFhaData'); return Array.isArray(ac) ? (ac.find(function (r) { return r && String(r.internalId) === String(id); }) || null) : null;
    }
    function _msg3() { var p = _pc(); return (p && p.msg3 && Array.isArray(p.msg3.msis)) ? p.msg3 : { msis: [] }; }
    function _rbdModels() { var p = _pc(); return (p && p.rbd && Array.isArray(p.rbd.models)) ? p.rbd.models : []; }
    function _etaTrees() { var p = _pc(); return (p && Array.isArray(p.eventTrees)) ? p.eventTrees : []; }
    function _markov() { var p = _pc(); return (p && Array.isArray(p.markovModels)) ? p.markovModels : []; }
    function _macRules() { var p = _pc(); return (p && Array.isArray(p.macModels)) ? p.macModels : []; }
    function _fracas() { var p = _pc(); return (p && p.ram && Array.isArray(p.ram.field)) ? p.ram.field : []; }
    function _coffe() { var p = _pc(); return (p && p.coffe && typeof p.coffe === 'object') ? p.coffe : null; }
    function _resources() { var r = _g('resourcesData'); return Array.isArray(r) ? r : []; }
    function _ccmrRow(id) {
        var parts = S(id).split('|'), pg = _page(parts[0]);
        var node = pg ? _findByLid(pg.root, parts.slice(1).join('|')) : null;
        return { page: pg, node: node };
    }
    function _msg3Find(id) {
        var parts = S(id).split('/'), msi = _msg3().msis.find(function (m) { return m && String(m.id) === parts[0]; }) || null;
        var ff = (msi && parts[1]) ? ((msi.ffs || []).find(function (f) { return f && String(f.id) === parts[1]; }) || null) : null;
        return { msi: msi, ff: ff };
    }
    function _fcLabel(r) { return r ? ((r.fcId ? r.fcId + ' ' : '') + S(r.fcDesc)) : ''; }
    function _clip(s, n) { s = S(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

    // ---- the kinds ----------------------------------------------------------------------------------------------
    // title(t): the target in words. tab: where it lives. post(t): selects the model on screen once the tab is open.
    // anem(t): what ANEM is told about the comment's row (which table and _id, or which op, or that it can only reply).
    var KINDS = {
        ftaPage: {
            label: 'Fault Trees', tab: 'fta', jump: 'trace',
            title: function (t) { var p = _page(t.id); return p ? S(p.name || p.id) : S(t.id); },
            anem: function (t) { var p = _page(t.id); return p ? ('the fault tree page ' + p.id + ' "' + S(p.name) + '" (change it with add_fta_node, update_fta_node, delete_fta_node on pageId ' + p.id + ')') : ''; }
        },
        ftaNode: {
            label: 'Fault Tree Nodes', tab: 'fta', jump: 'trace',
            title: function (t) { var p = _pageOfNode(t.id), n = p ? _findNode(p.root, t.id) : null; return n ? (S(n.displayId ? n.displayId + ' ' : '') + S(n.name) + ' · in ' + S(p.name)) : S(t.id); },
            anem: function (t) { var p = _pageOfNode(t.id), n = p ? _findNode(p.root, t.id) : null; return n ? ('node ' + n.id + ' "' + S(n.name) + '" on fault tree page ' + p.id + ' (change it with update_fta_node, add_fta_node under it, or delete_fta_node: pageId ' + p.id + ', nodeId ' + n.id + ')') : ''; }
        },
        ccmr: {
            label: 'Latent Failures (CCMR)', tab: 'ccmr',
            title: function (t) { var c = _ccmrRow(t.id); return c.node ? (S(c.node.name) + ' · in ' + S(c.page.name)) : S(t.id); },
            anem: function (t) { var c = _ccmrRow(t.id); return c.node ? ('the latent event "' + S(c.node.name) + '" (node ' + c.node.id + ' on fault tree page ' + c.page.id + '); its check interval and failure rate are the engineer\'s numbers, so a change to them is answered in the reply; a change to the tree uses update_fta_node') : ''; }
        },
        mac: {
            label: 'MAC Rules', tab: 'mac',
            title: function (t) { var r = _macRules().find(function (x) { return x && String(x.id) === String(t.id); }); return r ? (S(r.subId) + ' · ' + S(r.phase || 'All phases')) : S(t.id); },
            anem: function (t) { return 'MAC rule ' + t.id + ' (change it with update_mac {id:"' + t.id + '", fields}; the changed rule comes back unsigned for the engineer to sign)'; }
        },
        coffe: {
            label: 'CoFFE', tab: 'pasa',
            post: function (t) { try { _coffeSelectedFc = S(t.id).split('§')[0]; } catch (_) {} _call('renderCoffePanel'); },
            title: function (t) { var p = S(t.id).split('§'), r = _fhaAny(p[0]); return (r ? _fcLabel(r) : p[0]) + ' · ' + _clip((p[1] || '').replace(/∧/g, ' and '), 80); },
            anem: function (t) { return 'the CoFFE case "' + t.id + '" (table coffe, _id "' + t.id + '"; fields verdict "yes"|"no" and note; it is kept as ANEM\'s proposal until the engineer signs it)'; }
        },
        resource: {
            label: 'Resources', tab: 'resources',
            title: function (t) { var r = _resources().find(function (x) { return x && String(x.internalId) === String(t.id); }); return r ? (S(r.resId) + ' · ' + S(r.name)) : S(t.id); },
            anem: function (t) { return 'table resource, _id ' + t.id; }
        },
        markov: {
            label: 'Markov Models', tab: 'markov',
            title: function (t) { var m = _markov().find(function (x) { return x && String(x.id) === String(t.id); }); return m ? S(m.name || m.id) : S(t.id); },
            anem: function (t) { return 'Markov model ' + t.id + ' (table markov, _id ' + t.id + ' for its name; states and transitions with add_markov_state, delete_markov_state, add_markov_transition, delete_markov_transition; rates are the engineer\'s)'; }
        },
        rbd: {
            label: 'Reliability Block Diagrams', tab: 'ram-rbd',
            post: function (t) { try { var el = document.getElementById('rbd-pick'); if (el && el.value !== S(t.id)) { el.value = S(t.id); el.dispatchEvent(new Event('change', { bubbles: true })); } } catch (_) {} },
            title: function (t) { var m = _rbdModels().find(function (x) { return x && String(x.id) === String(t.id); }); return m ? S(m.name || m.id) : S(t.id); },
            anem: function (t) { return 'RBD ' + t.id + ' (table rbd, _id ' + t.id + ': its name and notes; the diagram itself is drawn by the engineer)'; }
        },
        eta: {
            label: 'Event Trees', tab: 'eta',
            post: function (t) { try { if (root.SLEtaUI && typeof root.SLEtaUI.select === 'function') root.SLEtaUI.select(S(t.id)); } catch (_) {} },
            title: function (t) { var m = _etaTrees().find(function (x) { return x && String(x.id) === String(t.id); }); return m ? (S(m.id) + ' · ' + S(m.name)) : S(t.id); },
            anem: function (t) { return 'event tree ' + t.id + ' (table eta, _id ' + t.id + ': its name, initiating event and notes; frequencies are the engineer\'s)'; }
        },
        fracas: {
            label: 'FRACAS', tab: 'ram-rel',
            title: function (t) { var f = _fracas().find(function (x) { return x && String(x.id) === String(t.id); }); return f ? (S(f.id) + (f.beRef ? ' · ' + S(f.beRef) : '') + (f.item ? ' · ' + S(f.item) : '')) : S(t.id); },
            anem: function (t) { return 'FRACAS record ' + t.id + ' (table fracas, _id ' + t.id + ': its text fields; hours, counts and closure are the engineer\'s)'; }
        },
        msg3: {
            label: 'MSG-3', tab: 'ram-msg3',
            title: function (t) { var h = _msg3Find(t.id); if (h.ff) return S(h.msi.name) + ' · ' + S(h.ff.failure || h.ff.func); return h.msi ? S(h.msi.name || h.msi.id) : S(t.id); },
            anem: function (t) { return 'MSG-3 ' + (S(t.id).indexOf('/') > 0 ? 'functional failure' : 'item') + ' (table msg3, _id "' + t.id + '": its text fields; the logic answers and intervals are the engineer\'s)'; }
        },
        crewCredit: {
            label: 'Crew Credit', tab: 'ac-fha',
            title: function (t) { var r = _fha(t.id, t.systemId); return r ? ('Crew credit · ' + _fcLabel(r)) : S(t.id); },
            anem: function (t) { return 'the crew credit on FHA row ' + t.id + (t.systemId ? ' in system ' + t.systemId : '') + ' (the credit comes from the HF assumptions, the FCIM awareness and the crew alerts: change those rows; the FHA row is table ' + (t.systemId ? 'sys_fha' : 'ac_fha') + ', _id ' + t.id + ')'; }
        }
    };
    function _fhaAny(iid) { var r = _fha(iid, null); if (r) return r; var ss = _systems(); for (var i = 0; i < ss.length; i++) { var h = (ss[i].fha || []).find(function (x) { return x && String(x.internalId) === String(iid); }); if (h) return h; } return null; }
    // kinds that already take comments: what ANEM is told about their rows (the table and the _id it edits by)
    var HF_LANE = { hfTid: 'tid', hfAlloc: 'alloc', hfTask: 'tasks', hfHea: 'hea', hfAlerts: 'alerts', hfErgo: 'ergo', hfCd: 'cd', hfSa: 'sa', hfMfc: 'mfc' };
    var OLD = {
        acFha: 'ac_fha', sysFha: 'sys_fha', acFunc: 'ac_func', sysFunc: 'sys_func', acFcim: 'ac_fcim', sysFcim: 'sys_fcim',
        acReq: 'ac_req', sysReq: 'sys_req', pra: 'pra', zsa: 'zsa', cma: 'cma', fmea: 'fmea', item: 'item', routing: 'routing',
        acAsm: 'ac_asm', sysAsm: 'sys_asm', stpaScope: 'stpa_scope'
    };
    function anemRef(t) {
        if (!t || !t.kind) return '';
        if (KINDS[t.kind]) { try { return KINDS[t.kind].anem(t) || ''; } catch (_) { return ''; } }
        if (HF_LANE[t.kind]) return 'table hf_' + HF_LANE[t.kind] + ', _id ' + t.id;
        if (t.kind === 'sourceDoc') return 'the source document "' + t.id + '" (reply only: the document text is the customer\'s controlled source; name what should change and where)';
        if (OLD[t.kind]) return 'table ' + OLD[t.kind] + ', _id ' + t.id + (t.systemId ? ', systemId ' + t.systemId : '');
        return '';
    }

    // ---- the rows ANEM may change -------------------------------------------------------------------------------
    // rows(sysId): the live rows. idOf(row): its _id. fields: what may change (true = any text; an array = one of
    // these). apply(row, field, value): when the row has its own setter. del: whether delete is allowed.
    function _enum(list) { return function (v) { var hit = list.find(function (x) { return S(x).toLowerCase() === S(v).trim().toLowerCase(); }); return hit != null ? { ok: true, value: hit } : { ok: false, why: 'must be one of ' + list.join(', ') }; }; }
    function _hfApi() { return root.HF_ANALYSES || null; }
    function _hfRows(lane) { var p = _pc(); return (p && p.hf && p.hf[lane] && Array.isArray(p.hf[lane].rows)) ? p.hf[lane].rows : []; }
    var HF_ID = { tid: 'taskId', tasks: 'taskId', hea: 'heaId', alerts: 'alertId', ergo: 'ergoId', cd: 'cdId', sa: 'saId', alloc: 'key', mfc: 'key' };
    var HF_SET = { tid: 'setTid', tasks: 'setTask', hea: 'setHea', alerts: 'setAlert', ergo: 'setErgo', cd: 'setCd', sa: 'setSa' };
    var HF_RENDER = { tid: 'renderTid', tasks: 'renderTasks', hea: 'renderHea', alerts: 'renderAlerts', ergo: 'renderErgo', cd: 'renderCd', sa: 'renderSa', alloc: 'renderAlloc', mfc: 'renderMfc' };
    var NEVER = /^(internalId|_id|id|key|aiGenerated|aiModel|aiCite|status|state|verdict|by|at|signed|signedBy|approvedBy|approvedAt|closed|closedAt|closedBy|disposition|lambda|rate|probability|prob|interval|tau|hours|count|freq|frequency|level0)$/i;
    function _hfTable(lane) {
        return {
            label: 'HF ' + lane + ' row', rows: function () { return _hfRows(lane); }, idOf: function (r) { return S(r[HF_ID[lane]]); },
            fields: 'text',
            apply: function (row, field, value) {
                var A = _hfApi();
                if (lane === 'alloc' && A && typeof A.setAlloc === 'function') { A.setAlloc(row.key, field, value); return S(row[field]) === S(value) ? '' : 'that value is not allowed for ' + field; }
                if (lane === 'mfc' && A && typeof A.setMfcFn === 'function') { A.setMfcFn(row.key, field, value); return ''; }
                var fn = A && A[HF_SET[lane]], i = _hfRows(lane).indexOf(row);
                if (typeof fn !== 'function' || i < 0) { row[field] = value; return ''; }
                fn(i, field, value);
                return S(_hfRows(lane)[i] && _hfRows(lane)[i][field]) === S(value) ? '' : 'that value is not allowed for ' + field;
            },
            render: function () { var A = _hfApi(); if (A && typeof A[HF_RENDER[lane]] === 'function') try { A[HF_RENDER[lane]](); } catch (_) {} }
        };
    }
    function _asmRows(sysId) {
        if (sysId) { var s = _systems().find(function (x) { return x && (String(x.id) === String(sysId) || S(x.name).toLowerCase() === S(sysId).toLowerCase()); }); return s ? (s.asm || (s.asm = [])) : null; }
        var a = _g('acAssumptionsData'); return Array.isArray(a) ? a : null;
    }
    var TABLES = {
        ac_asm: { label: 'aircraft assumption', rows: function () { return _asmRows(null); }, idOf: function (r) { return S(r.asmId || r.internalId); }, alt: 'internalId',
                  fields: { text: true, statement: true, valStrategy: true, valArtifact: true, verArtifact: true, rationale: true }, del: true, render: function () { _call('renderACAssumptions'); _call('renderACAsm'); } },
        sys_asm: { label: 'system assumption', rows: function (sid) { return _asmRows(sid); }, idOf: function (r) { return S(r.asmId || r.internalId); }, alt: 'internalId', needsSystem: true,
                  fields: { text: true, statement: true, valStrategy: true, valArtifact: true, verArtifact: true, rationale: true }, del: true, render: function () { _call('renderSysAssumptions'); _call('renderSysAsm'); } },
        stpa_scope: { label: 'STPA scope', rows: function () { var d = _g('stpaData'); if (!d) return []; if (!d.meta) d.meta = {}; return [d.meta]; }, idOf: function () { return 'STPA-SCOPE'; },
                  fields: { mission: true, scope: true, boundary: true, abstractionLevel: true }, render: function () { _call('renderStpa'); _call('renderSTPA'); try { if (root.SLStpa && root.SLStpa.render) root.SLStpa.render(); } catch (_) {} } },
        resource: { label: 'resource', rows: function () { return _resources(); }, idOf: function (r) { return S(r.internalId); },
                  fields: { name: true, description: true, type: function (v) { var T = null; try { T = (typeof RESOURCE_TYPES !== 'undefined') ? RESOURCE_TYPES : null; } catch (_) {} return Array.isArray(T) ? _enum(T)(v) : { ok: false, why: 'the resource types are not loaded' }; } }, del: true, render: function () { _call('renderResources'); } },
        markov: { label: 'Markov model', rows: function () { return _markov(); }, idOf: function (r) { return S(r.id); }, fields: { name: true, notes: true, description: true }, render: function () { _call('renderMarkovModels'); } },
        rbd: { label: 'RBD', rows: function () { return _rbdModels(); }, idOf: function (r) { return S(r.id); }, fields: { name: true, notes: true, description: true }, render: function () { _call('renderRamRbdPage'); } },
        eta: { label: 'event tree', rows: function () { return _etaTrees(); }, idOf: function (r) { return S(r.id); }, fields: { name: true, initDesc: true, initiatingEvent: true, notes: true, description: true }, render: function () { try { if (root.SLEtaUI && root.SLEtaUI.render) root.SLEtaUI.render(); } catch (_) {} _call('renderEta'); } },
        fracas: { label: 'FRACAS record', rows: function () { return _fracas(); }, idOf: function (r) { return S(r.id); }, fields: 'text', render: function () { _call('renderRamRelPage'); } },
        msg3: { label: 'MSG-3 entry',
                rows: function () { var out = []; _msg3().msis.forEach(function (m) { if (!m) return; out.push(m); (m.ffs || []).forEach(function (f) { if (f) { try { Object.defineProperty(f, '__msi', { value: m.id, enumerable: false, configurable: true }); } catch (_) {} out.push(f); } }); }); return out; },
                idOf: function (r) { return r.__msi ? (r.__msi + '/' + S(r.id)) : S(r.id); },
                fields: { name: true, func: true, failure: true, effect: true, cause: true, note: true, notes: true }, render: function () { _call('renderMsg3Page'); } },
        // a CoFFE verdict is a signed determination: ANEM's answer is kept apart as a PROPOSAL (coffe.proposals), never in
        // coffe.verdicts, so nothing that reads verdicts (coverage, grafts, stale watch) counts it until the engineer signs
        coffe: { label: 'CoFFE case',
                 rows: function () { return []; }, find: function (id) { var c = _coffe(); if (!c) return null; return { __key: S(id), rec: (c.proposals && c.proposals[S(id)]) || null }; },
                 idOf: function (r) { return r.__key; }, fields: { verdict: _enum(['yes', 'no']), note: true },
                 write: function (r, f) {
                     var c = _coffe(); if (!c) return 'CoFFE is not set up in this project';
                     var key = r.__key, parts = key.split('§'); if (parts.length < 2 || !_fhaAny(parts[0])) return 'no CoFFE case ' + key;
                     if (!c.proposals) c.proposals = {};
                     var signed = (c.verdicts || {})[key] || null, cur = c.proposals[key] || {}, next = Object.assign({}, cur);
                     if (f.verdict != null) next.verdict = f.verdict;
                     if (f.note != null) next.note = f.note;
                     if (!next.verdict) next.verdict = signed ? signed.verdict : '';
                     if (!next.verdict) return 'a CoFFE note needs a verdict (yes or no) to propose';
                     next.by = 'ANEM'; next.at = new Date().toISOString();
                     c.proposals[key] = next; return '';
                 },
                 render: function () { _call('renderCoffePanel'); } }
    };
    Object.keys(HF_ID).forEach(function (lane) { TABLES['hf_' + lane] = _hfTable(lane); });

    function hasTable(t) { return Object.prototype.hasOwnProperty.call(TABLES, S(t)); }
    function _textFieldOk(row, k) { return !NEVER.test(k) && (row[k] == null || typeof row[k] === 'string'); }
    // update a row: {ok, summary, diff} or {ok:false, error, blocked?}
    function update(table, id, sysId, fields, model) {
        var T = TABLES[S(table)]; if (!T) return { ok: false, error: 'unknown table "' + table + '"' };
        if (T.needsSystem && !sysId) return { ok: false, error: T.label + ' needs systemId' };
        fields = (fields && typeof fields === 'object') ? fields : {};
        var row = null;
        if (T.find) row = T.find(id);
        else { var rows = T.rows(sysId) || []; row = rows.find(function (r) { return r && (T.idOf(r) === S(id) || (T.alt && S(r[T.alt]) === S(id))); }) || null; }
        if (!row) return { ok: false, error: 'no ' + T.label + ' with _id ' + id };
        var clean = {}, bad = [];
        Object.keys(fields).forEach(function (k) {
            var v = fields[k], rule = (T.fields === 'text') ? (_textFieldOk(row.rec || row, k) ? true : null) : (Object.prototype.hasOwnProperty.call(T.fields, k) ? T.fields[k] : null);
            if (!rule || NEVER.test(k) && !(T.fields !== 'text' && T.fields[k])) { bad.push(k + ' (not a field ANEM changes here)'); return; }
            if (typeof v !== 'string') { bad.push(k + ' (text only: numbers are the engineer\'s)'); return; }
            if (typeof rule === 'function') { var r = rule(v); if (!r.ok) { bad.push(k + ' (' + r.why + ')'); return; } v = r.value; }
            clean[k] = v.trim();
        });
        if (bad.length) return { ok: false, blocked: true, error: 'not changed: ' + bad.join('; ') };
        var keys = Object.keys(clean); if (!keys.length) return { ok: false, error: 'nothing to change' };
        var diff = [];
        if (T.write) { var w = T.write(row, clean); if (w) return { ok: false, error: w }; keys.forEach(function (k) { diff.push({ field: k, from: row.rec ? row.rec[k] : undefined, to: clean[k] }); }); }
        else {
            for (var i = 0; i < keys.length; i++) {
                var k = keys[i], from = row[k];
                if (T.apply) { var e = T.apply(row, k, clean[k]); if (e) return { ok: false, blocked: true, error: 'not changed: ' + e }; }
                else row[k] = clean[k];
                diff.push({ field: k, from: from, to: clean[k] });
            }
            row.aiChatEdited = true; row.aiEditedAt = new Date().toISOString(); if (model) row.aiEditModel = model;
        }
        try { T.render && T.render(); } catch (_) {}
        _call('scheduleAutosave');
        return { ok: true, summary: 'Updated ' + T.label + ' ' + id + ' (' + keys.join(', ') + ')', diff: diff };
    }
    function remove(table, id, sysId) {
        var T = TABLES[S(table)]; if (!T) return { ok: false, error: 'unknown table "' + table + '"' };
        if (!T.del) return { ok: false, blocked: true, error: 'not deleted: removing a ' + T.label + ' is the engineer\'s call; say so in the reply' };
        var rows = T.rows(sysId) || [], i = rows.findIndex(function (r) { return r && (T.idOf(r) === S(id) || (T.alt && S(r[T.alt]) === S(id))); });
        if (i < 0) return { ok: false, error: 'no ' + T.label + ' with _id ' + id };
        rows.splice(i, 1);
        try { T.render && T.render(); } catch (_) {}
        _call('scheduleAutosave');
        return { ok: true, summary: 'Deleted ' + T.label + ' ' + id };
    }

    // ---- what ANEM sees of these rows (everything, no cutoff) -------------------------------------------------
    function _textOnly(r, idKey) { var o = { _id: S(r[idKey]) }; Object.keys(r).forEach(function (k) { if (k === idKey || /^ai|^_|^model/.test(k)) return; var v = r[k]; if (typeof v === 'string' && v !== '') o[k] = v; }); return o; }
    function state() {
        var out = {};
        try { var a = _asmRows(null) || []; out.acAssumptions = a.filter(Boolean).map(function (r) { return { _id: S(r.asmId || r.internalId), text: S(r.text || r.statement), state: r.state || undefined, valStrategy: r.valStrategy || undefined, valArtifact: r.valArtifact || undefined, verArtifact: r.verArtifact || undefined }; }); } catch (_) {}
        try { out.sysAssumptions = []; _systems().forEach(function (s) { (s.asm || []).forEach(function (r) { if (r) out.sysAssumptions.push({ systemId: s.id, _id: S(r.asmId || r.internalId), text: S(r.text || r.statement), state: r.state || undefined }); }); }); } catch (_) {}
        try { var d = _g('stpaData'); if (d && d.meta) out.stpaScope = { _id: 'STPA-SCOPE', mission: S(d.meta.mission), scope: S(d.meta.scope), boundary: S(d.meta.boundary), abstractionLevel: S(d.meta.abstractionLevel) }; } catch (_) {}
        try { out.resources = _resources().filter(Boolean).map(function (r) { return { _id: S(r.internalId), resId: S(r.resId), name: S(r.name), type: S(r.type), description: S(r.description) }; }); } catch (_) {}
        try { out.hf = {}; Object.keys(HF_ID).forEach(function (lane) { var rows = _hfRows(lane); if (rows.length) out.hf[lane] = rows.filter(Boolean).map(function (r) { return _textOnly(r, HF_ID[lane]); }); }); } catch (_) {}
        try { out.rbd = _rbdModels().filter(Boolean).map(function (m) { return { _id: S(m.id), name: S(m.name), notes: m.notes || undefined }; }); } catch (_) {}
        try { out.eventTrees = _etaTrees().filter(Boolean).map(function (m) { return { _id: S(m.id), name: S(m.name), initDesc: m.initDesc || undefined }; }); } catch (_) {}
        try { out.fracas = _fracas().filter(Boolean).map(function (r) { return _textOnly(r, 'id'); }); } catch (_) {}
        try { out.msg3 = _msg3().msis.filter(Boolean).map(function (m) { return { _id: S(m.id), name: S(m.name), itemId: m.itemId || undefined, ffs: (m.ffs || []).filter(Boolean).map(function (f) { return { _id: m.id + '/' + f.id, func: S(f.func), failure: S(f.failure), effect: S(f.effect), cause: S(f.cause) }; }) }; }); } catch (_) {}
        try { var c = _coffe(); if (c && (c.verdicts || c.proposals)) { var ks = Object.keys(c.verdicts || {}); Object.keys(c.proposals || {}).forEach(function (k) { if (ks.indexOf(k) < 0) ks.push(k); }); out.coffe = ks.map(function (k) { var v = (c.verdicts || {})[k] || {}, pr = (c.proposals || {})[k]; return { _id: k, verdict: v.verdict || undefined, signedBy: v.by || undefined, note: v.note || undefined, anemProposes: pr ? pr.verdict : undefined }; }); } } catch (_) {}
        return out;
    }

    // ---- the review UI: the 💬 button, the name, the jump ----------------------------------------------------
    function button(target) {
        if (!target || target.id == null || S(target.id) === '') return '';
        try { if (typeof commentTriggerHtml === 'function' && typeof Review !== 'undefined') return commentTriggerHtml(target); } catch (_) {}
        return '';
    }
    // the Review cell (the house kebab with the 💬) for a table row; an empty cell if the review store is not there
    function cell(kind, id, sysId) {
        try { if (typeof reviewCellHtml === 'function') return reviewCellHtml(kind, id, sysId || null); } catch (_) {}
        return '<td class="review-col"></td>';
    }
    function has(kind) { return Object.prototype.hasOwnProperty.call(KINDS, S(kind)); }
    function title(t) { var k = t && KINDS[t.kind]; if (!k) return ''; try { return k.title(t) || S(t.id); } catch (_) { return S(t.id); } }
    function jump(t) {
        var k = t && KINDS[t.kind]; if (!k) return false;
        if (k.jump === 'trace' && typeof root.jumpToArtifact === 'function') {
            // the traces jumper matches ids exactly: hand it the tree's or node's own id (a node id is a number)
            var real = t.id;
            if (t.kind === 'ftaNode') { var pg = _pageOfNode(t.id), nd = pg ? _findNode(pg.root, t.id) : null; if (nd) real = nd.id; }
            else { var pp = _page(t.id); if (pp) real = pp.id; }
            root.jumpToArtifact({ kind: t.kind, id: real, tab: 'fta' }); return true;
        }
        if (t.kind === 'crewCredit') {
            if (typeof root.jumpToArtifact === 'function') root.jumpToArtifact(t.systemId ? { kind: 'sysFha', id: t.id, tab: 'sys-workspace', systemId: t.systemId, sysSubtab: 'fha' } : { kind: 'acFha', id: t.id, tab: 'ac-fha' });
            return true;
        }
        _call('switchTab', k.tab);
        setTimeout(function () {
            try { k.post && k.post(t); } catch (_) {}
            try {
                var key = t.kind + ':' + t.id, el = null;
                document.querySelectorAll('[data-comment-target]').forEach(function (b) { if (!el && b.getAttribute('data-comment-target') === key) el = b; });
                var host = el && (el.closest('tr') || el.closest('[data-ck-host]') || el);
                if (host) { host.scrollIntoView({ block: 'center', behavior: 'smooth' }); host.classList.add('artifact-flash'); setTimeout(function () { host.classList.remove('artifact-flash'); }, 1600); }
            } catch (_) {}
        }, 420);
        return true;
    }

    // register the new kinds with the review store and the traces panel (both are defined before this file loads)
    function _register() {
        try {
            var R = (typeof Review !== 'undefined') ? Review : (root.Review || null);
            if (R && R.KIND_LABELS) Object.keys(KINDS).forEach(function (k) { if (!R.KIND_LABELS[k]) R.KIND_LABELS[k] = KINDS[k].label; if (Array.isArray(R.KIND_ORDER) && R.KIND_ORDER.indexOf(k) < 0) R.KIND_ORDER.push(k); });
            var TR = (typeof Traceability !== 'undefined') ? Traceability : (root.Traceability || null);
            if (TR && TR.KIND_LABELS) Object.keys(KINDS).forEach(function (k) { if (!TR.KIND_LABELS[k]) TR.KIND_LABELS[k] = KINDS[k].label.replace(/s$/, ''); if (TR.KIND_TAB && !TR.KIND_TAB[k]) TR.KIND_TAB[k] = KINDS[k].tab; });
        } catch (_) {}
    }
    _register();

    var api = { VERSION: VERSION, KINDS: KINDS, TABLES: TABLES, has: has, title: title, jump: jump, button: button, cell: cell, anemRef: anemRef,
                hasTable: hasTable, update: update, remove: remove, state: state, _register: _register };
    try { root.SLCommentKinds = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
