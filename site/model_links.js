// ============================================================================
// model_links.js, v1.0, 13 Oct 2026: every analysis row is connected to the
// real model elements it is about.
//
// Waqas's ruling (13 Oct 2026): the table analyses keep their worksheet build,
// but every row must be connected to the real model elements it is about, the
// same way the diagrams will be. FHA row -> function + failure condition. FMEA
// row -> part/item + interface + failure mode (and the basic event it feeds).
// PRA/ZSA row -> zone + installed items. HF row -> actor/role + task + the
// function/item. R&M row -> part/item + its reliability values. No free-text
// names standing in for model elements.
//
// WHAT THIS FILE IS. One place that knows:
//   KINDS     the model elements a row can point at, read live from the stores
//             (functions, system functions, systems, items, interfaces and
//             shared resources, zones of the zonal model, failure conditions,
//             basic events, crew tasks, crew roles, ZSA zone records).
//   ANALYSES  every analysis table: where its rows live, and its SLOTS (which
//             element kinds a row links to, which are required).
//   linksOf / status / setSlot / migrate / cellHtml / open (the picker).
//
// HOW A LINK IS STORED. Two kinds of slot, never both for the same thing:
//   * a NEW slot stores element ids on the row: row.modelLinks[slot] = ['id',…]
//     (ids are the element's own internal id: item internalId, zone id,
//     function internalId, basic-event node id, system id, task id).
//   * a LEGACY slot is a link the product already kept in its own field (the
//     FHA's sub-function code, the FMEA's basic-event id, a RAM task's item
//     code…). It stays the single store for that link; this file reads it,
//     resolves it to ids, and (where the field is a plain link) writes it.
// linksOf() answers both the same way, as element ids, so the golden thread and
// the SysML v2 export see one shape.
//
// RULES.
//   * Reads never write. Rendering a badge never creates a store or a field.
//   * Typed names are never linked by guesswork. "Link typed names" links a
//     name only when it matches exactly one element's code or name; every
//     other name stays flagged on the row for the engineer.
//   * Every write goes through the save path (commitSaveChanges) and the
//     project journal, and respects the area locks (slLockState).
//   * Large projects: the element index is built once per data generation
//     (SLDataChange.gen), and the picker lists at most 200 matches at a time.
// ============================================================================
(function () {
    'use strict';
    var ROOT = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : this);

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function jsq(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
    function arr(v) { return Array.isArray(v) ? v : []; }
    function norm(s) { return String(s == null ? '' : s).replace(/[‐-―]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase(); }
    function uniq(a) { var seen = {}, out = []; a.forEach(function (x) { var k = String(x); if (!seen[k]) { seen[k] = 1; out.push(k); } }); return out; }

    // ---------------------------------------------------------------- stores
    // Direct lexical reads (the CSP forbids dynamic lookup). None of these create anything.
    function S_fn() { return (typeof acFunctionsData !== 'undefined' && Array.isArray(acFunctionsData)) ? acFunctionsData : arr(ROOT.acFunctionsData); }
    function S_fha() { return (typeof acFhaData !== 'undefined' && Array.isArray(acFhaData)) ? acFhaData : arr(ROOT.acFhaData); }
    function S_sys() { return (typeof systemsData !== 'undefined' && Array.isArray(systemsData)) ? systemsData : arr(ROOT.systemsData); }
    function S_items() { return (typeof itemsData !== 'undefined' && Array.isArray(itemsData)) ? itemsData : arr(ROOT.itemsData); }
    function S_res() { return (typeof resourcesData !== 'undefined' && Array.isArray(resourcesData)) ? resourcesData : arr(ROOT.resourcesData); }
    function S_pra() { return (typeof praData !== 'undefined' && Array.isArray(praData)) ? praData : arr(ROOT.praData); }
    function S_zsa() { return (typeof zsaData !== 'undefined' && Array.isArray(zsaData)) ? zsaData : arr(ROOT.zsaData); }
    function S_fmea() { return (typeof fmeaData !== 'undefined' && Array.isArray(fmeaData)) ? fmeaData : arr(ROOT.fmeaData); }
    function S_pages() { return (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) ? ftaPages : arr(ROOT.ftaPages); }
    function S_pc() { return (typeof projectConfig !== 'undefined' && projectConfig) ? projectConfig : (ROOT.projectConfig || null); }
    function S_activeSys() { try { return (typeof activeSystemId !== 'undefined') ? activeSystemId : ROOT.activeSystemId; } catch (_) { return null; } }
    // pcPath('ram','tasks') -> the array if it exists, else [] (never created here).
    function pcArr() {
        var cur = S_pc();
        for (var i = 0; i < arguments.length; i++) { if (!cur || typeof cur !== 'object') return []; cur = cur[arguments[i]]; }
        return arr(cur);
    }
    function hfRows(lane) { var pc = S_pc(); return arr(pc && pc.hf && pc.hf[lane] && pc.hf[lane].rows); }
    function sysName(id) { var s = S_sys().find(function (x) { return x && String(x.id) === String(id); }); return s ? (s.name || s.id) : ''; }

    // ---------------------------------------------------------------- kinds
    // Each kind lists its elements as { id, code, name, sub, lambda? }. id is the element's
    // own internal identity; code is what the engineer reads in the worksheets.
    function walkBasics(cb) {
        var seen = {};
        S_pages().forEach(function (p) {
            if (!p || !p.root) return;
            var stack = [p.root];
            while (stack.length) {
                var n = stack.pop();
                if (!n) continue;
                if (n.type === 'basic' || n.type === 'undeveloped') {
                    var k = String(n.id);
                    if (!seen[k]) { seen[k] = 1; cb(n, p); }
                }
                var ch = n.children; if (ch && ch.length) for (var i = 0; i < ch.length; i++) stack.push(ch[i]);
                var cc = n._children; if (cc && cc.length) for (var j = 0; j < cc.length; j++) stack.push(cc[j]);   // collapsed branches
            }
        });
    }
    function ifcId(x, i) { return x && x.id ? String(x.id) : (x && x.icdRef ? 'icd:' + x.icdRef : 'ifc:' + (x ? (x.fromSystemId + '>' + x.toSystemId + ':' + (x.medium || i)) : i)); }

    var KINDS = {
        'function': { label: 'Aircraft function', plural: 'Aircraft functions', list: function () {
            return S_fn().filter(Boolean).map(function (f) { return { id: String(f.internalId), code: f.subId || f.funcId || '', name: f.subName || f.funcName || '', sub: (f.funcId ? f.funcId + ' ' : '') + (f.funcName || '') }; });
        } },
        sysFunction: { label: 'System function', plural: 'System functions', list: function () {
            var out = [];
            S_sys().forEach(function (s) { arr(s && s.functions).forEach(function (f) { if (f) out.push({ id: String(f.internalId), code: f.funcId || '', name: f.funcName || '', sub: s.name || s.id, sys: s.id }); }); });
            return out;
        } },
        system: { label: 'System', plural: 'Systems', list: function () {
            return S_sys().filter(Boolean).map(function (s) { return { id: String(s.id), code: s.code || s.ata || '', name: s.name || s.id, sub: 'System' }; });
        } },
        item: { label: 'Item', plural: 'Items', list: function () {
            return S_items().filter(Boolean).map(function (i) { return { id: String(i.internalId), code: i.itemId || '', name: i.name || '', sub: sysName(i.owningSystemId) || 'Aircraft level', lambda: (Number(i.rate) > 0 ? Number(i.rate) : null) }; });
        } },
        resource: { label: 'Shared resource', plural: 'Shared resources', list: function () {
            return S_res().filter(Boolean).map(function (r) { return { id: String(r.internalId), code: r.resId || '', name: r.name || '', sub: r.type || '' }; });
        } },
        'interface': { label: 'Interface', plural: 'Interfaces', list: function () {
            return pcArr('interfaces').map(function (x, i) { return { id: ifcId(x, i), code: x.icdRef || '', name: (sysName(x.fromSystemId) || x.fromSystemId) + ' to ' + (sysName(x.toSystemId) || x.toSystemId) + (x.medium ? ' (' + x.medium + ')' : ''), sub: x.kind || '' }; });
        } },
        zone: { label: 'Zone', plural: 'Zones (zonal model)', list: function () {
            var zs = pcArr('zones');
            var byId = {}; zs.forEach(function (z) { if (z) byId[z.id] = z; });
            return zs.filter(Boolean).map(function (z) { var p = z.parentId != null ? byId[z.parentId] : null; return { id: String(z.id), code: z.code || '', name: z.name || '', sub: p ? 'in ' + (p.code || p.name) : 'Major zone' }; });
        } },
        zsaZone: { label: 'ZSA zone record', plural: 'ZSA zone records', list: function () {
            return S_zsa().filter(Boolean).map(function (z) { return { id: String(z.internalId), code: z.zoneId || '', name: z.desc || '', sub: 'Zonal safety analysis' }; });
        } },
        fc: { label: 'Aircraft failure condition', plural: 'Aircraft failure conditions', list: function () {
            return S_fha().filter(Boolean).map(function (f) { return { id: String(f.internalId), code: f.fcId || '', name: f.fcDesc || '', sub: f.severity || '' }; });
        } },
        sysFc: { label: 'System failure condition', plural: 'System failure conditions', list: function () {
            var out = [];
            S_sys().forEach(function (s) { arr(s && s.fha).forEach(function (f) { if (f) out.push({ id: String(f.internalId), code: f.fcId || '', name: f.fcDesc || '', sub: (s.name || s.id) + (f.severity ? ' · ' + f.severity : ''), sys: s.id }); }); });
            return out;
        } },
        be: { label: 'Basic event', plural: 'Basic events', list: function () {
            var out = [];
            walkBasics(function (n, p) { out.push({ id: String(n.id), code: n.displayId || ('BE-' + n.id), name: n.name || '', sub: p.name || p.id, page: p.id, lambda: (Number(n.lambda) > 0 ? Number(n.lambda) : null), alt: n.logicalId != null ? String(n.logicalId) : '' }); });
            return out;
        } },
        task: { label: 'Crew task', plural: 'Crew tasks', list: function () {
            var out = [];
            hfRows('tasks').forEach(function (r) { if (r && r.taskId) out.push({ id: String(r.taskId), code: r.taskId, name: r.task || '', sub: 'Crew task' + (r.crewmember ? ' · ' + r.crewmember : '') }); });
            hfRows('tid').forEach(function (r) { if (r && r.taskId) out.push({ id: String(r.taskId), code: r.taskId, name: r.taskName || r.procName || '', sub: 'Task identification' + (r.crew ? ' · ' + r.crew : '') }); });
            return out;
        } },
        actor: { label: 'Crew role', plural: 'Crew roles', list: function () {
            var H = ROOT.HF_ANALYSES; var roles = (H && H.TID_CREW) || ['PF', 'PM', 'Either', 'Both', 'Ground crew'];
            var defs = (H && H.TID_CREW_DEFS) || {};
            return roles.map(function (r) { return { id: String(r), code: String(r), name: defs[r] || '', sub: 'Crew role' }; });
        } }
    };

    // ---------------------------------------------------------------- index
    // Built once per data generation. byId for resolution; byKey (normalized code, name and
    // "code name") for exact-match resolution of codes and typed names.
    var _idx = {}, _idxGen = {}, _forceGen = 0;
    function _gen() {
        try { if (ROOT.SLDataChange && typeof ROOT.SLDataChange.gen === 'function') return ROOT.SLDataChange.gen() + ':' + _forceGen; } catch (_) {}
        return null;   // no generation signal: never cache (tests, headless)
    }
    function index(kind) {
        var g = _gen();
        if (g != null && _idx[kind] && _idxGen[kind] === g) return _idx[kind];
        var K = KINDS[kind]; if (!K) return { list: [], byId: {}, byKey: {}, byCode: {} };
        var list = [];
        try { list = K.list() || []; } catch (_) { list = []; }
        var byId = {}, byKey = {}, byCode = {};
        var add = function (m, k, id) { if (!k) return; (m[k] = m[k] || []); if (m[k].indexOf(id) < 0) m[k].push(id); };
        list.forEach(function (e) {
            byId[e.id] = e;
            var c = norm(e.code), n = norm(e.name);
            add(byCode, c, e.id);
            if (e.alt) add(byCode, norm(e.alt), e.id);
            add(byKey, c, e.id); add(byKey, n, e.id);
            if (c && n) { add(byKey, c + ' ' + n, e.id); add(byKey, c + ' - ' + n, e.id); add(byKey, c + ': ' + n, e.id); }
        });
        var I = { list: list, byId: byId, byKey: byKey, byCode: byCode };
        if (g != null) { _idx[kind] = I; _idxGen[kind] = g; }
        return I;
    }
    function invalidate() { _forceGen++; _idx = {}; _idxGen = {}; }
    function element(kind, id) { return index(kind).byId[String(id)] || null; }
    // The one element of this kind whose code is exactly `code` (an id passes through); '' otherwise.
    function resolveCode(kind, code) {
        var I = index(kind), c = String(code == null ? '' : code).trim();
        if (!c) return '';
        if (I.byId[c]) return c;
        var h = I.byCode[norm(c)] || [];
        return h.length === 1 ? h[0] : '';
    }

    // ------------------------------------------------------------ analyses
    // Slot fields:
    //   key, kind, label, multi, required
    //   legacy: { read(row) -> [values], by: 'code'|'id', write?(row, ids, els) , form?: true }
    //           form: true means the link is set in the row's own editor (the worksheet form),
    //           because that editor carries side effects; the picker shows it read-only there.
    //   text(row) -> string  the typed text this slot replaces (shown, and the source of
    //           "Link typed names").
    //   extra(row) -> [{id, why}] exact links that already exist elsewhere (never guesses).
    //   mirror(row, els)  keeps a legacy text field in step after a picker write.
    function codes(v) {
        if (Array.isArray(v)) return v.map(String).map(function (s) { return s.trim(); }).filter(Boolean);
        if (v == null || v === '') return [];
        return String(v).split(/[,;\n]/).map(function (s) { return s.trim(); }).filter(Boolean);
    }
    function legacyCodes(field) { return { read: function (r) { return codes(r[field]); }, by: 'code', write: function (r, ids, els) { r[field] = els.map(function (e) { return e.code; }).join(', '); } }; }
    function legacyCode1(field) { return { read: function (r) { return codes(r[field]).slice(0, 1); }, by: 'code', write: function (r, ids, els) { r[field] = els.length ? els[0].code : ''; } }; }
    function mirrorCodes(field) { return function (r, els) { r[field] = els.map(function (e) { return e.code; }).join(', '); }; }
    // L/HIRF: the protects column (read by the severity check) mirrors BOTH linked functions and FCs.
    function lhirfMirror(r) {
        var ml = r.modelLinks || {};
        var out = arr(ml['function']).map(function (id) { var e = element('function', id); return e ? e.code : ''; })
            .concat(arr(ml.fc).map(function (id) { var e = element('fc', id); return e ? e.code : ''; })).filter(Boolean);
        r.protects = out.join(', ');
    }
    function nameText(field) { return function (r) { return r[field] || ''; }; }
    function itemSlot(opts) { return Object.assign({ key: 'item', kind: 'item', label: 'Item', multi: false, required: true }, opts || {}); }
    function hfRender(fn) { return function () { try { var H = ROOT.HF_ANALYSES; if (H && typeof H[fn] === 'function') H[fn](); } catch (_) {} }; }
    function winRender(fn) { return function () { try { if (typeof ROOT[fn] === 'function') ROOT[fn](); } catch (_) {} }; }
    function callEd(fn) { return function (r) { return function () { if (typeof ROOT[fn] === 'function') ROOT[fn](r.internalId); }; }; }
    function idx0(list) { return list.map(function (r, i) { return { row: r, id: String(i) }; }); }
    function byField(list, f) { return list.filter(Boolean).map(function (r) { return { row: r, id: String(r[f]) }; }); }

    var ANALYSES = [
        // ------------------------------------------------ safety worksheets
        { key: 'acFha', group: 'Safety', label: 'Aircraft FHA', self: 'fc', area: function () { return { scope: 'ac' }; },
          rows: function () { return byField(S_fha(), 'internalId'); }, title: function (r) { return r.fcId || ('#' + r.internalId); },
          editor: callEd('editACFHA'), render: winRender('renderACFHA'),
          slots: [
            { key: 'function', kind: 'function', label: 'Function', multi: true, required: true,
              legacy: { read: function (r) { return (Array.isArray(r.subIds) && r.subIds.length) ? codes(r.subIds) : codes(r.subId); }, by: 'code', form: true } }
          ] },
        { key: 'sysFha', group: 'Safety', label: 'System FHA', self: 'sysFc',
          area: function (r, ctx) { return { scope: 'system', systemId: ctx && ctx.sysId }; },
          rows: function () { var out = []; S_sys().forEach(function (s) { arr(s && s.fha).forEach(function (f) { if (f) out.push({ row: f, id: String(f.internalId), sysId: s.id }); }); }); return out; },
          title: function (r) { return r.fcId || ('#' + r.internalId); },
          editor: callEd('editSysFHA'), render: winRender('renderSysFHA'),
          slots: [
            { key: 'sysFunction', kind: 'sysFunction', label: 'System function', multi: false, required: true,
              legacy: { read: function (r) { return codes(r.subId); }, by: 'code', form: true, alsoKind: 'function' } },
            { key: 'fc', kind: 'fc', label: 'Aircraft failure condition it traces to', multi: true, required: false,
              // acTrace holds the aircraft FC's internal id in most projects and its FC code in older ones.
              legacy: { read: function (r) { return codes(Array.isArray(r.acTraces) && r.acTraces.length ? r.acTraces : r.acTrace); }, by: 'idOrCode', form: true } }
          ] },
        { key: 'fmea', group: 'Safety', label: 'FMEA', area: function (r) { return r.scope === 'system' && r.owningSystemId ? { scope: 'system', systemId: r.owningSystemId } : null; },
          rows: function () { return byField(S_fmea(), 'internalId'); }, title: function (r) { return r.fmeaId || ('#' + r.internalId); },
          editor: callEd('editFMEA'), render: winRender('renderFMEA'),
          slots: [
            { key: 'item', kind: 'item', label: 'Part / item', multi: false, required: function (r) { return (r.fmeaType || 'piece-part') === 'piece-part'; },
              text: function (r) { return (r.fmeaType || 'piece-part') === 'piece-part' ? (r.part || '') : ''; } },
            { key: 'interface', kind: ['interface', 'resource'], label: 'Interface or shared resource (port)', multi: true, required: false },
            { key: 'be', kind: 'be', label: 'Basic event it feeds', multi: false, required: function (r) { return (r.fmeaType || 'piece-part') === 'piece-part'; },
              legacy: { read: function (r) { return (r.fmeaType || 'piece-part') === 'piece-part' && r.beId ? [String(r.beId)] : []; }, by: 'id', form: true },
              hidden: function (r) { return r.fmeaType === 'functional'; } },
            { key: 'function', kind: 'function', label: 'Function', multi: false, required: function (r) { return r.fmeaType === 'functional'; },
              legacy: { read: function (r) { return r.fmeaType === 'functional' ? codes(r.funcSubId) : []; }, by: 'code', form: true },
              hidden: function (r) { return r.fmeaType !== 'functional'; } },
            { key: 'fc', kind: 'fc', label: 'Failure condition', multi: false, required: false,
              legacy: { read: function (r) { return r.fmeaType === 'functional' ? codes(r.linkedFcId) : []; }, by: 'code', form: true },
              hidden: function (r) { return r.fmeaType !== 'functional'; } },
            { key: 'system', kind: 'system', label: 'Owning system', multi: false, required: false,
              legacy: { read: function (r) { return r.scope === 'system' && r.owningSystemId ? [String(r.owningSystemId)] : []; }, by: 'id', form: true } }
          ] },
        { key: 'pra', group: 'Safety', label: 'Particular risk analysis', area: function () { return null; },
          rows: function () { return byField(S_pra(), 'internalId'); }, title: function (r) { return r.praId || ('#' + r.internalId); },
          editor: callEd('editPRA'), render: winRender('renderPRA'),
          slots: [
            { key: 'zone', kind: 'zone', label: 'Zones exposed', multi: true, required: true,
              extra: function (r) { return zonesFromZsaCodes(r.affectedZones); } },
            { key: 'item', kind: 'item', label: 'Installed items exposed', multi: true, required: true, text: nameText('systems') },
            { key: 'system', kind: 'system', label: 'Systems exposed', multi: true, required: false, text: nameText('systems'),
              legacy: { read: function (r) { var pc = S_pc(); var tl = pc && pc.threadLinks && pc.threadLinks['pra:' + r.internalId]; return arr(tl && tl.systemIds).map(String); }, by: 'id',
                        write: function (r, ids) { var pc = S_pc(); if (!pc) return; if (!pc.threadLinks) pc.threadLinks = {}; var k = 'pra:' + r.internalId; pc.threadLinks[k] = Object.assign({}, pc.threadLinks[k] || {}, { systemIds: ids.slice() }); } } },
            { key: 'zsaZone', kind: 'zsaZone', label: 'ZSA zone records', multi: true, required: false,
              legacy: { read: function (r) { return codes(r.affectedZones); }, by: 'code', form: true } }
          ] },
        { key: 'zsa', group: 'Safety', label: 'Zonal safety analysis', area: function () { return null; },
          rows: function () { return byField(S_zsa(), 'internalId'); }, title: function (r) { return r.zoneId || ('#' + r.internalId); },
          editor: callEd('editZSA'), render: winRender('renderZSA'),
          slots: [
            { key: 'zone', kind: 'zone', label: 'Zone (zonal model)', multi: false, required: true, text: nameText('zoneId') },
            { key: 'item', kind: 'item', label: 'Installed items', multi: true, required: true, text: nameText('equip'),
              extra: function (r) { var z = norm(r.zoneId); if (!z) return []; return S_items().filter(function (i) { return i && norm(i.zoneId) === z; }).map(function (i) { return { id: String(i.internalId), why: 'registered in zone ' + r.zoneId + ' on the Items page' }; }); } },
            { key: 'function', kind: 'function', label: 'Housed functions', multi: true, required: false,
              legacy: { read: function (r) { return codes(r.housedFunctions); }, by: 'code', form: true } }
          ] },

        // ------------------------------------------------ human factors
        { key: 'hfTid', group: 'Human factors', label: 'Task identification', lane: 'tid',
          rows: function () { return byField(hfRows('tid'), 'taskId'); }, title: function (r) { return r.taskId; }, render: hfRender('renderTid'),
          slots: [
            { key: 'actor', kind: 'actor', label: 'Crew role', multi: false, required: true, legacy: { read: function (r) { return codes(r.crew); }, by: 'code', form: true } },
            { key: 'function', kind: 'function', label: 'Function the step serves', multi: true, required: true },
            { key: 'item', kind: 'item', label: 'Equipment used', multi: true, required: false }
          ] },
        { key: 'hfTasks', group: 'Human factors', label: 'Crew tasks', lane: 'tasks',
          rows: function () { return byField(hfRows('tasks'), 'taskId'); }, title: function (r) { return r.taskId; }, render: hfRender('renderTasks'),
          slots: [
            { key: 'actor', kind: 'actor', label: 'Crew role', multi: false, required: true, legacy: { read: function (r) { return codes(r.crewmember); }, by: 'code', form: true } },
            { key: 'function', kind: 'function', label: 'Function the task serves', multi: true, required: true },
            { key: 'item', kind: 'item', label: 'Equipment used', multi: true, required: false }
          ] },
        { key: 'hfHea', group: 'Human factors', label: 'Human error analysis', lane: 'hea',
          rows: function () { return byField(hfRows('hea'), 'heaId'); }, title: function (r) { return r.heaId; }, render: hfRender('renderHea'),
          slots: [
            { key: 'task', kind: 'task', label: 'Crew task', multi: false, required: true, text: nameText('task'),
              extra: function (r) { if (!r.asmId) return []; return hfRows('tasks').filter(function (t) { return t && String(t.asmId) === String(r.asmId); }).map(function (t) { return { id: String(t.taskId), why: 'the crew task credited as ' + r.asmId }; }); } },
            { key: 'actor', kind: 'actor', label: 'Crew role', multi: false, required: false },
            { key: 'fc', kind: ['fc', 'sysFc'], label: 'Failure conditions it feeds', multi: true, required: true, text: nameText('fcIds'), mirror: mirrorCodes('fcIds'), byCodeOnly: true },
            { key: 'function', kind: 'function', label: 'Function', multi: true, required: false },
            { key: 'item', kind: 'item', label: 'Equipment', multi: true, required: false }
          ] },
        { key: 'hfAlerts', group: 'Human factors', label: 'Crew alerting', lane: 'alerts',
          rows: function () { return byField(hfRows('alerts'), 'alertId'); }, title: function (r) { return r.alertId; }, render: hfRender('renderAlerts'),
          slots: [
            { key: 'fc', kind: ['fc', 'sysFc'], label: 'Failure conditions that cite it', multi: true, required: true, text: nameText('fcIds'), mirror: mirrorCodes('fcIds'), byCodeOnly: true },
            { key: 'item', kind: 'item', label: 'Alerting equipment', multi: true, required: false },
            { key: 'function', kind: 'function', label: 'Function', multi: true, required: false }
          ] },
        { key: 'hfErgo', group: 'Human factors', label: 'Ergonomics evaluation', lane: 'ergo',
          rows: function () { return byField(hfRows('ergo'), 'ergoId'); }, title: function (r) { return r.ergoId; }, render: hfRender('renderErgo'),
          slots: [
            itemSlot({ label: 'Item evaluated', multi: true, text: nameText('item') }),
            { key: 'actor', kind: 'actor', label: 'Crew role', multi: true, required: false },
            { key: 'function', kind: 'function', label: 'Function', multi: true, required: false }
          ] },
        { key: 'hfCd', group: 'Human factors', label: 'Controls and displays', lane: 'cd',
          rows: function () { return byField(hfRows('cd'), 'cdId'); }, title: function (r) { return r.cdId; }, render: hfRender('renderCd'),
          slots: [
            itemSlot({ label: 'Control or display item', multi: true, text: nameText('item') }),
            { key: 'task', kind: 'task', label: 'Task it supports', multi: true, required: false, text: nameText('supports') },
            { key: 'actor', kind: 'actor', label: 'Crew role', multi: true, required: false },
            { key: 'function', kind: 'function', label: 'Function it supports', multi: true, required: false, text: nameText('supports') }
          ] },
        { key: 'hfSa', group: 'Human factors', label: 'Situation awareness', lane: 'sa',
          rows: function () { return byField(hfRows('sa'), 'saId'); }, title: function (r) { return r.saId; }, render: hfRender('renderSa'),
          slots: [
            { key: 'function', kind: 'function', label: 'Function the element supports', multi: true, required: true, text: nameText('element') },
            { key: 'item', kind: 'item', label: 'Source item (display, sensor)', multi: true, required: false, text: nameText('element') },
            { key: 'actor', kind: 'actor', label: 'Crew role', multi: true, required: false }
          ] },
        { key: 'hfAlloc', group: 'Human factors', label: 'Function allocation', lane: 'alloc', readOnly: true,
          rows: function () { return byField(hfRows('alloc'), 'key'); }, title: function (r) { return r.subId || r.key; }, render: hfRender('renderAlloc'),
          slots: [
            { key: 'function', kind: 'function', label: 'Function', multi: false, required: true, legacy: { read: function (r) { return [String(r.key)]; }, by: 'id', form: true } }
          ] },

        // ------------------------------------------------ reliability and maintainability
        { key: 'ramTask', group: 'R&M', label: 'Maintenance tasks', rel: 'item',
          rows: function () { return byField(pcArr('ram', 'tasks'), 'id'); }, title: function (r) { return r.name || r.id; }, render: winRender('renderRamMxPage'),
          slots: [ { key: 'item', kind: 'item', label: 'Item', multi: false, required: true, legacy: legacyCode1('itemId') },
                   { key: 'be', kind: 'be', label: 'Basic event', multi: false, required: false, legacy: legacyCode1('beRef') } ] },
        { key: 'ramField', group: 'R&M', label: 'Field data (FRACAS)',
          rows: function () { return byField(pcArr('ram', 'field'), 'id'); }, title: function (r) { return r.id; }, render: winRender('renderRamRelPage'),
          slots: [ { key: 'be', kind: 'be', label: 'Basic event', multi: false, required: true, legacy: legacyCode1('beRef') },
                   itemSlot({ required: false }) ] },
        { key: 'mmel', group: 'R&M', label: 'MMEL items',
          rows: function () { return byField(pcArr('mmel', 'items'), 'id'); }, title: function (r) { return r.id + ' ' + (r.title || ''); }, render: winRender('renderMmelPage'),
          slots: [ { key: 'item', kind: 'item', label: 'Item', multi: false, required: true, legacy: legacyCode1('itemId') },
                   { key: 'be', kind: 'be', label: 'Basic event', multi: false, required: false, legacy: legacyCode1('beRef') } ] },
        { key: 'msg3Msi', group: 'R&M', label: 'MSG-3 significant items',
          rows: function () { return byField(pcArr('msg3', 'msis'), 'id'); }, title: function (r) { return r.name || r.id; }, render: winRender('renderMsg3Page'),
          slots: [ { key: 'item', kind: 'item', label: 'Item', multi: false, required: true, legacy: legacyCode1('itemId') } ] },
        { key: 'msg3Screen', group: 'R&M', label: 'MSG-3 screened items',
          rows: function () { return byField(pcArr('msg3', 'screened'), 'id'); }, title: function (r) { return r.name || r.id; }, render: winRender('renderMsg3Page'),
          slots: [ { key: 'item', kind: 'item', label: 'Item', multi: false, required: true, legacy: legacyCode1('itemId') } ] },
        { key: 'msg3Ssi', group: 'R&M', label: 'MSG-3 structural items',
          rows: function () { return byField(pcArr('msg3x', 'ssis'), 'id'); }, title: function (r) { return r.name || r.id; }, render: winRender('renderMsg3xPage'),
          slots: [ { key: 'zone', kind: 'zone', label: 'Zone', multi: true, required: true },
                   itemSlot({ required: false, multi: true, text: nameText('name') }) ] },
        { key: 'msg3Lhirf', group: 'R&M', label: 'MSG-3 lightning / HIRF',
          rows: function () { return byField(pcArr('msg3x', 'lhirf'), 'id'); }, title: function (r) { return r.name || r.id; }, render: winRender('renderMsg3xPage'),
          slots: [ { key: 'function', kind: 'function', label: 'Function protected', multi: true, required: false, text: nameText('protects'), byCodeOnly: true, mirror: lhirfMirror },
                   { key: 'fc', kind: 'fc', label: 'Failure condition protected', multi: true, required: false, text: nameText('protects'), byCodeOnly: true, mirror: lhirfMirror },
                   itemSlot({ label: 'Protected item (harness, LRU)', multi: true, required: true }) ],
          requireAny: ['function', 'fc'] },
        { key: 'lcc', group: 'R&M', label: 'Life cycle cost', rel: 'lambda',
          rows: function () { return byField(pcArr('lcc', 'items'), 'id'); }, title: function (r) { return r.name || r.id; }, render: winRender('renderLccPage'),
          slots: [ itemSlot({ text: nameText('name') }) ] },
        { key: 'relFw', group: 'R&M', label: 'Reliability frameworks', rel: 'lambdaOp',
          rows: function () { return byField(pcArr('relFw', 'entries'), 'id'); }, title: function (r) { return r.name || r.id; }, render: winRender('renderRelFwPage'),
          slots: [ itemSlot({ text: nameText('name') }) ] },
        { key: 'relAccel', group: 'R&M', label: 'Accelerated life tests',
          rows: function () { return byField(pcArr('relFw', 'accel'), 'id'); }, title: function (r) { return r.name || r.id; }, render: winRender('renderRelFwPage'),
          slots: [ itemSlot({ text: nameText('name') }) ] },
        { key: 'lifeData', group: 'R&M', label: 'Life data (Weibull)',
          rows: function () { return byField(pcArr('relAnalytics', 'lifeData'), 'id'); }, title: function (r) { return r.name || r.id; }, render: winRender('renderRamWeibullPage'),
          slots: [ itemSlot({ text: nameText('name') }) ] },
        { key: 'growth', group: 'R&M', label: 'Reliability growth',
          rows: function () { return byField(pcArr('relAnalytics', 'growth'), 'id'); }, title: function (r) { return r.name || r.id; }, render: winRender('renderRamGrowthPage'),
          slots: [ itemSlot({ required: false, multi: true, text: nameText('name') }), { key: 'system', kind: 'system', label: 'System', multi: true, required: false, text: nameText('name') } ],
          requireAny: ['item', 'system'] },
        { key: 'spares', group: 'R&M', label: 'Spares', rel: 'lambda',
          rows: function () { return byField(pcArr('relAnalytics', 'spares'), 'id'); }, title: function (r) { return r.name || r.id; }, render: winRender('renderRamAllocPage'),
          slots: [ itemSlot({ text: nameText('name') }) ] },
        { key: 'relAlloc', group: 'R&M', label: 'Reliability allocation (feasibility)',
          rows: function () { return idx0(pcArr('relAnalytics', 'alloc', 'rows')); }, title: function (r) { return r.name; }, render: winRender('renderRamAllocPage'),
          slots: [ { key: 'system', kind: 'system', label: 'System', multi: false, required: true, text: nameText('name') } ] },
        { key: 'relAgree', group: 'R&M', label: 'Reliability allocation (AGREE)',
          rows: function () { return idx0(pcArr('relAnalytics', 'agree', 'rows')); }, title: function (r) { return r.name; }, render: winRender('renderRamAllocPage'),
          slots: [ { key: 'system', kind: 'system', label: 'System', multi: false, required: true, text: nameText('name') } ] },
        { key: 'relArinc', group: 'R&M', label: 'Reliability allocation (ARINC)',
          rows: function () { return idx0(pcArr('relAnalytics', 'arinc', 'rows')); }, title: function (r) { return r.name; }, render: winRender('renderRamAllocPage'),
          slots: [ { key: 'system', kind: 'system', label: 'System', multi: false, required: true, text: nameText('name') } ] },
        { key: 'swrel', group: 'R&M', label: 'Software reliability',
          rows: function () { return byField(pcArr('swrel', 'cscis'), 'id'); }, title: function (r) { return r.name || r.id; }, render: winRender('renderSwrelPage'),
          slots: [ itemSlot({ label: 'Software item', text: nameText('name') }) ] },
        { key: 'rbdMc', group: 'R&M', label: 'RBD Monte Carlo cases',
          rows: function () { return byField(pcArr('rbdMc', 'cases'), 'id'); }, title: function (r) { return r.name || r.id; }, render: winRender('renderRbdMcPage'),
          slots: [ itemSlot({ required: false, multi: true, text: nameText('name') }), { key: 'system', kind: 'system', label: 'System', multi: true, required: false, text: nameText('name') } ],
          requireAny: ['item', 'system'] },
        { key: 'lora', group: 'R&M', label: 'Level of repair (LORA)', rel: 'lambda',
          rows: function () { return byField(pcArr('mxAnalytics', 'lora'), 'id'); }, title: function (r) { return r.name || r.id; }, render: winRender('renderRamLoraPage'),
          slots: [ itemSlot({ text: nameText('name') }) ] },
        { key: 'tolStack', group: 'R&M', label: 'Tolerance stacks',
          rows: function () { return byField(pcArr('tolDerate', 'stacks'), 'id'); }, title: function (r) { return r.name || r.id; }, render: winRender('renderRamTolPage'),
          slots: [ itemSlot({ text: nameText('name') }) ] },
        { key: 'derate', group: 'R&M', label: 'Derating',
          rows: function () { return byField(pcArr('tolDerate', 'derate'), 'id'); }, title: function (r) { return r.part || r.id; }, render: winRender('renderRamTolPage'),
          slots: [ itemSlot({ label: 'Item the part sits in', text: nameText('part') }) ] },
        { key: 'stress217', group: 'R&M', label: 'Part stress (MIL-HDBK-217F)',
          rows: function () { return byField(pcArr('stress217'), 'id'); }, title: function (r) { return r.name || r.id; }, render: winRender('st217Render'),
          slots: [ itemSlot({ label: 'Item the part sits in', text: nameText('name') }) ] }
    ];
    var BY_KEY = {}; ANALYSES.forEach(function (a) { BY_KEY[a.key] = a; });
    // The field each analysis keys its rows by (rows without one are keyed by position).
    var ID_FIELD = { acFha: 'internalId', sysFha: 'internalId', fmea: 'internalId', pra: 'internalId', zsa: 'internalId',
        hfTid: 'taskId', hfTasks: 'taskId', hfHea: 'heaId', hfAlerts: 'alertId', hfErgo: 'ergoId', hfCd: 'cdId', hfSa: 'saId', hfAlloc: 'key' };
    ANALYSES.forEach(function (a) { a.idf = ID_FIELD[a.key] || (/^rel(Alloc|Agree|Arinc)$/.test(a.key) ? null : 'id'); });
    // The worksheet forms: what the form currently holds, so the picker suggests from it.
    function _val(id) { try { var el = (typeof document !== 'undefined') && document.getElementById(id); return el ? String(el.value || '') : ''; } catch (_) { return ''; } }
    BY_KEY.pra.formText = function (b) { b.systems = _val('pra-systems'); try { if (typeof ROOT._getPraMultiSelectValues === 'function') b.affectedZones = ROOT._getPraMultiSelectValues(); } catch (_) {} };
    BY_KEY.zsa.formText = function (b) { b.zoneId = _val('zsa-zone-id'); b.equip = _val('zsa-equip'); };
    // The FMEA worksheet shows the open System Folder's rows; its banner and action work on those.
    BY_KEY.fmea.inView = function (r) {
        var a = S_activeSys(), mode = null;
        try { if (typeof _fmeaActiveMode !== 'undefined') mode = _fmeaActiveMode; } catch (_) {}
        return String(r.owningSystemId || '') === String(a || '') && (!mode || (r.fmeaType || 'piece-part') === mode);
    };
    BY_KEY.fmea.formText = function (b) { b.part = _val('fmea-part'); try { if (typeof _fmeaActiveMode !== 'undefined') b.fmeaType = _fmeaActiveMode; } catch (_) {} };
    // System scope of a row, used to resolve a code that two systems both carry.
    function sysOfRow(akey, row) {
        if (akey === 'fmea') return row.owningSystemId || null;
        if (akey === 'sysFha') { var s = S_sys().find(function (x) { return x && arr(x.fha).indexOf(row) >= 0; }); return s ? s.id : null; }
        return null;
    }

    // PRA zones from its ZSA zone codes: a ZSA record already linked to a zone carries that zone
    // across; otherwise the zone of the zonal model whose code or name is exactly the record's code.
    function zonesFromZsaCodes(list) {
        var out = [];
        codes(list).forEach(function (code) {
            var z = S_zsa().find(function (x) { return x && norm(x.zoneId) === norm(code); });
            var lz = z && z.modelLinks && arr(z.modelLinks.zone);
            if (lz && lz.length) { lz.forEach(function (id) { out.push({ id: String(id), why: 'ZSA record ' + code + ' is linked to this zone' }); }); return; }
            var hit = index('zone').byKey[norm(code)] || [];
            if (hit.length === 1) out.push({ id: hit[0], why: 'zone code ' + code + ' from the ZSA zone records' });
        });
        return out;
    }

    // ------------------------------------------------------------ resolution
    function kindsOf(slot) { return Array.isArray(slot.kind) ? slot.kind : [slot.kind].concat(slot.legacy && slot.legacy.alsoKind ? [slot.legacy.alsoKind] : []); }
    function isReq(slot, row) { return typeof slot.required === 'function' ? !!slot.required(row) : !!slot.required; }
    function isHidden(slot, row) { return typeof slot.hidden === 'function' ? !!slot.hidden(row) : !!slot.hidden; }
    function findEl(kinds, id) { for (var i = 0; i < kinds.length; i++) { var e = element(kinds[i], id); if (e) return { kind: kinds[i], el: e }; } return null; }
    function findByCode(kinds, code) {
        var hits = [];
        kinds.forEach(function (k) { (index(k).byCode[norm(code)] || []).forEach(function (id) { hits.push({ kind: k, el: index(k).byId[id] }); }); });
        return hits;
    }
    // Every link the row holds, resolved: [{slot, kind, id, code, name, ok, broken, legacy, auto, why}]
    function linksOf(akey, row) {
        var A = BY_KEY[akey]; if (!A || !row) return [];
        var out = [];
        A.slots.forEach(function (slot) {
            if (isHidden(slot, row)) return;
            var kinds = kindsOf(slot);
            if (slot.legacy) {
                slot.legacy.read(row).forEach(function (v) {
                    var f0 = slot.legacy.by === 'idOrCode' ? findEl(kinds, v) : null;
                    if (f0) { out.push({ slot: slot.key, kind: f0.kind, id: f0.el.id, code: f0.el.code, name: f0.el.name, lambda: f0.el.lambda, ok: true, legacy: true }); return; }
                    if (slot.legacy.by === 'id') {
                        var f = findEl(kinds, v);
                        out.push(f ? { slot: slot.key, kind: f.kind, id: f.el.id, code: f.el.code, name: f.el.name, lambda: f.el.lambda, ok: true, legacy: true }
                                   : { slot: slot.key, kind: kinds[0], id: String(v), code: String(v), name: '', ok: false, broken: true, legacy: true, why: 'no ' + KINDS[kinds[0]].label.toLowerCase() + ' with this id' });
                    } else {
                        var h = findByCode(kinds, v);
                        if (h.length > 1) { var sid = sysOfRow(akey, row); if (sid) { var hs = h.filter(function (x) { return x.el.sys == null || String(x.el.sys) === String(sid); }); if (hs.length) h = hs; } }
                        if (h.length === 1) out.push({ slot: slot.key, kind: h[0].kind, id: h[0].el.id, code: h[0].el.code, name: h[0].el.name, lambda: h[0].el.lambda, ok: true, legacy: true });
                        else out.push({ slot: slot.key, kind: kinds[0], id: null, code: String(v), name: '', ok: false, broken: true, legacy: true,
                                        why: h.length ? h.length + ' elements carry the code ' + v : 'no ' + KINDS[kinds[0]].label.toLowerCase() + ' has the code ' + v });
                    }
                });
                return;
            }
            var ids = arr(row.modelLinks && row.modelLinks[slot.key]);
            var auto = arr(row.modelLinksAuto);
            ids.forEach(function (id) {
                var f = findEl(kinds, id);
                if (f) out.push({ slot: slot.key, kind: f.kind, id: f.el.id, code: f.el.code, name: f.el.name, lambda: f.el.lambda, ok: true, auto: auto.indexOf(slot.key + ':' + id) >= 0 });
                else out.push({ slot: slot.key, kind: kinds[0], id: String(id), code: String(id), name: '', ok: false, broken: true, why: 'the linked ' + KINDS[kinds[0]].label.toLowerCase() + ' no longer exists' });
            });
        });
        return out;
    }

    // Typed text a slot replaces, and what exactly matches it. Pure: never writes.
    // Slots that read the SAME typed text on a row (a PRA's "Affected systems / components" names
    // both systems and items) are matched together: each name goes to the one slot whose kind it
    // matches exactly. A name that matches nothing, or more than one element, is flagged once, on
    // the first slot of the group.
    //   -> { text, tokens: [{t, ids:[{kind,id}], reason}] }  (the tokens attributed to this slot)
    function writable(slot) { return !(slot.legacy && (slot.legacy.form || !slot.legacy.write)); }
    function typedFor(A, slot, row) {
        if (!slot.text || !writable(slot)) return null;
        var text = String(slot.text(row) || '').trim();
        if (!text) return null;
        var group = A.slots.filter(function (s) { return s.text && writable(s) && !isHidden(s, row) && String(s.text(row) || '').trim() === text; });
        var match = function (t) {
            var hits = [], seen = {};
            group.forEach(function (s) {
                kindsOf(s).forEach(function (k) {
                    var I = index(k);
                    var m = s.byCodeOnly ? (I.byCode[norm(t)] || []) : (I.byKey[norm(t)] || []);
                    m.forEach(function (id) { var key = k + ':' + id; if (seen[key]) return; seen[key] = 1; hits.push({ slot: s.key, kind: k, id: id }); });
                });
            });
            return hits;
        };
        var whole = match(text);
        var tokens = (whole.length === 1) ? [{ t: text, hits: whole }] : codes(text).map(function (t) { return { t: t, hits: match(t) }; });
        var first = group.find(function (s) { return isReq(s, row); }) || group[0];
        var mine = [];
        tokens.forEach(function (x) {
            var owner = x.hits.length === 1 ? x.hits[0].slot : first.key;
            if (owner !== slot.key) return;
            mine.push({ t: x.t, ids: x.hits.map(function (h) { return { kind: h.kind, id: h.id }; }),
                reason: x.hits.length === 1 ? 'exact match' : (x.hits.length ? x.hits.length + ' elements match this name exactly; pick the one it means' : 'no element has this exact code or name') });
        });
        return mine.length ? { text: text, tokens: mine } : null;
    }
    function extraFor(slot, row) { try { return slot.extra ? arr(slot.extra(row)) : []; } catch (_) { return []; } }

    // status(akey,row) -> { state, label, missing:[labels], broken:[links], typed:[{slot,label,text,tokens}], links }
    //   state: 'ok' | 'partial' | 'none' | 'broken' | 'typed'
    function status(akey, row) {
        var A = BY_KEY[akey]; if (!A || !row) return { state: 'none', label: 'Not linked', missing: [], broken: [], typed: [], links: [] };
        var links = linksOf(akey, row);
        var broken = links.filter(function (l) { return l.broken; });
        var missing = [], typed = [], filled = {};
        links.forEach(function (l) { if (l.ok) filled[l.slot] = true; });
        A.slots.forEach(function (slot) {
            if (isHidden(slot, row)) return;
            if (filled[slot.key]) return;
            if (writable(slot)) {
                var t = typedFor(A, slot, row);
                var ex = extraFor(slot, row);
                // Typed text counts as "a name standing in for an element" when the slot is one the
                // row needs, or when the text names an element exactly; free text in an optional
                // slot that names nothing (an SSI's own title) is just a title.
                var counts = t && (isReq(slot, row) || (A.requireAny && A.requireAny.indexOf(slot.key) >= 0) || t.tokens.some(function (x) { return x.ids.length > 0; }));
                if (counts || ex.length) typed.push({ slot: slot.key, label: slot.label, text: t ? t.text : '', tokens: t ? t.tokens : [], extra: ex });
            }
            var req = isReq(slot, row);
            if (A.requireAny && A.requireAny.indexOf(slot.key) >= 0) req = false;
            if (req && !(slot.legacy && slot.legacy.read(row).length)) missing.push(slot.label);
        });
        if (A.requireAny && !A.requireAny.some(function (k) { return filled[k]; })) {
            missing.push(A.requireAny.map(function (k) { var s = A.slots.find(function (x) { return x.key === k; }); return s ? s.label : k; }).join(' or '));
        }
        var anyOk = links.some(function (l) { return l.ok; });
        var state, label;
        if (broken.length) { state = 'broken'; label = broken.length === 1 ? 'Broken link' : broken.length + ' broken links'; }
        else if (!missing.length) { state = 'ok'; label = 'Linked'; }
        else if (typed.length) { state = 'typed'; label = 'Typed name, not linked'; }
        else if (anyOk) { state = 'partial'; label = 'Partly linked'; }
        else { state = 'none'; label = 'Not linked'; }
        return { state: state, label: label, missing: missing, broken: broken, typed: typed, links: links };
    }

    // The reliability values a linked item carries, against the row's own (R&M rows).
    function relCheck(akey, row) {
        var A = BY_KEY[akey]; if (!A || !A.rel) return null;
        var items = linksOf(akey, row).filter(function (l) { return l.ok && l.kind === 'item'; });
        if (!items.length) return null;
        var it = items[0];
        if (A.rel === 'item') return { itemLambda: it.lambda, rowLambda: null };
        var own = Number(row[A.rel]);
        if (!(own > 0) || !(it.lambda > 0)) return { itemLambda: it.lambda || null, rowLambda: own > 0 ? own : null };
        var agree = Math.abs(own - it.lambda) <= 0.01 * Math.max(own, it.lambda);
        return { itemLambda: it.lambda, rowLambda: own, agree: agree };
    }

    // ------------------------------------------------------------ writes
    function rowById(akey, id) {
        var A = BY_KEY[akey]; if (!A) return null;
        var list = A.rows();
        for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) return list[i];
        return null;
    }
    function lockFor(A, hit) {
        try {
            var area = A.area ? A.area(hit.row, hit) : null;
            if (area && typeof ROOT.slLockState === 'function') {
                var st = ROOT.slLockState(area.scope, area.systemId || null);
                if (st && st.editable === false) return st;
            }
        } catch (_) {}
        return null;
    }
    function _save(summary) {
        invalidate();
        try { if (typeof ROOT.commitSaveChanges === 'function') ROOT.commitSaveChanges(); else if (typeof ROOT.scheduleAutosave === 'function') ROOT.scheduleAutosave(); } catch (_) {}
        try { if (typeof ROOT.jrnl === 'function') ROOT.jrnl('model-link', summary); } catch (_) {}
    }
    function _toast(m, k) { try { if (typeof ROOT.showToast === 'function') ROOT.showToast(m, k || 'info', 3500); } catch (_) {} }
    // A declared interface has no id of its own until one is linked: give it a permanent one
    // then (IF-n), so the link survives edits to its medium or ICD reference.
    function ensureIfcIds(ids) {
        var list = pcArr('interfaces');
        return ids.map(function (id) {
            if (!/^(icd|ifc):/.test(id)) return id;
            for (var i = 0; i < list.length; i++) {
                if (ifcId(list[i], i) === id) {
                    var pc = S_pc(); pc.interfaceSeq = Math.max(pc.interfaceSeq || 0, list.length) + 1;
                    var used = {}; list.forEach(function (x) { if (x && x.id) used[x.id] = 1; });
                    var nid = 'IF-' + pc.interfaceSeq; while (used[nid]) { pc.interfaceSeq++; nid = 'IF-' + pc.interfaceSeq; }
                    list[i].id = nid; invalidate(); return nid;
                }
            }
            return id;
        });
    }
    function _apply(A, hit, slot, ids) {
        var row = hit.row, kinds = kindsOf(slot);
        ids = uniq(arr(ids).map(String));
        if (kinds.indexOf('interface') >= 0) ids = ensureIfcIds(ids);
        if (!slot.multi && ids.length > 1) ids = ids.slice(0, 1);
        var els = ids.map(function (id) { var f = findEl(kinds, id); return f ? f.el : { id: id, code: id, name: '' }; });
        if (slot.legacy) { if (slot.legacy.write) slot.legacy.write(row, ids, els); return; }
        var ml = (row.modelLinks && typeof row.modelLinks === 'object') ? row.modelLinks : {};
        if (ids.length) ml[slot.key] = ids; else delete ml[slot.key];
        row.modelLinks = ml;
        if (Array.isArray(row.modelLinksAuto)) {
            row.modelLinksAuto = row.modelLinksAuto.filter(function (k) { return k.indexOf(slot.key + ':') !== 0; });
            if (!row.modelLinksAuto.length) delete row.modelLinksAuto;
        }
        if (slot.mirror) slot.mirror(row, els);
    }
    // setLinks(akey, rowId, {slotKey: [ids]}): one save, one journal entry.
    function setLinks(akey, rowId, map, opts) {
        opts = opts || {};
        var A = BY_KEY[akey]; if (!A) return { ok: false, err: 'unknown analysis' };
        if (A.readOnly) return { ok: false, err: 'read only' };
        var hit = rowById(akey, rowId); if (!hit) return { ok: false, err: 'row not found' };
        var lk = lockFor(A, hit);
        if (lk) { _toast('This area is ' + (lk.kind === 'baseline' ? 'baselined' : 'locked') + '; its links cannot change until it is reopened.', 'warning'); return { ok: false, err: 'locked' }; }
        var changed = [];
        Object.keys(map || {}).forEach(function (k) {
            var slot = A.slots.find(function (s) { return s.key === k; });
            if (!slot || (slot.legacy && (slot.legacy.form || !slot.legacy.write))) return;
            var before = JSON.stringify(slotIds(A, hit.row, slot));
            _apply(A, hit, slot, map[k]);
            if (JSON.stringify(slotIds(A, hit.row, slot)) !== before) changed.push(slot.label);
        });
        if (!changed.length && !opts.confirmAuto) return { ok: true, changed: 0 };
        if (opts.confirmAuto && Array.isArray(hit.row.modelLinksAuto)) delete hit.row.modelLinksAuto;
        _save(A.label + ' ' + A.title(hit.row) + ': links set (' + (changed.join(', ') || 'confirmed') + ')');
        if (!opts.noRender) { try { A.render(); } catch (_) {} }
        try { refreshCells(akey, rowId); } catch (_) {}
        _scheduleBanners();
        // Other views showing this row (an open editor) listen for this and redraw what they mirror.
        try { if (typeof document !== 'undefined' && typeof CustomEvent === 'function') document.dispatchEvent(new CustomEvent('sl-model-links-changed', { detail: { analysis: akey, rowId: String(rowId) } })); } catch (_) {}
        return { ok: true, changed: changed.length };
    }
    function slotIds(A, row, slot) {
        if (slot.legacy) return slot.legacy.read(row);
        return arr(row.modelLinks && row.modelLinks[slot.key]);
    }

    // migrate(akey|null, {apply}): link typed names that match exactly one element, and the
    // exact links that already exist elsewhere (extra). Everything else stays flagged on the row.
    function migrate(akey, opts) {
        opts = opts || {};
        var list = akey ? [BY_KEY[akey]].filter(Boolean) : ANALYSES;
        var plan = { linked: 0, rows: 0, flagged: [], skippedLocked: 0, changes: [] };
        list.forEach(function (A) {
            if (A.readOnly) return;
            A.rows().forEach(function (hit) {
                if (opts.inView && A.inView && !A.inView(hit.row)) return;
                var row = hit.row, rowChanges = [];
                A.slots.forEach(function (slot) {
                    if (!writable(slot) || isHidden(slot, row)) return;
                    if (slotIds(A, row, slot).length) return;   // never overwrite an engineer's links
                    var ids = [], kinds = kindsOf(slot);
                    extraFor(slot, row).forEach(function (x) { if (findEl(kinds, x.id)) ids.push(String(x.id)); });
                    var t = typedFor(A, slot, row);
                    if (t) t.tokens.forEach(function (tok) {
                        if (tok.ids.length === 1) ids.push(String(tok.ids[0].id));
                        else if (tok.ids.length || isReq(slot, row) || (A.requireAny && A.requireAny.indexOf(slot.key) >= 0)) plan.flagged.push({ analysis: A.key, row: A.title(row), slot: slot.label, text: tok.t, reason: tok.reason });
                    });
                    ids = uniq(ids);
                    if (!slot.multi && ids.length > 1) { plan.flagged.push({ analysis: A.key, row: A.title(row), slot: slot.label, text: t ? t.text : '', reason: ids.length + ' elements match; this link takes one' }); return; }
                    if (ids.length) rowChanges.push({ slot: slot, ids: ids });
                });
                if (!rowChanges.length) return;
                if (opts.apply && lockFor(A, hit)) { plan.skippedLocked++; return; }
                plan.rows++;
                rowChanges.forEach(function (c) {
                    plan.linked += c.ids.length;
                    plan.changes.push({ analysis: A.key, row: A.title(row), slot: c.slot.key, ids: c.ids });
                    if (opts.apply) {
                        _apply(A, hit, c.slot, c.ids);
                        var au = arr(row.modelLinksAuto).slice();
                        c.ids.forEach(function (id) { var k = c.slot.key + ':' + id; if (au.indexOf(k) < 0) au.push(k); });
                        if (!c.slot.legacy) row.modelLinksAuto = au;
                    }
                });
            });
        });
        if (opts.apply && plan.linked) {
            _save('Linked ' + plan.linked + ' typed name(s) to model elements by exact match on ' + plan.rows + ' row(s)' + (plan.flagged.length ? '; ' + plan.flagged.length + ' left for the engineer' : ''));
            if (!opts.noRender) list.forEach(function (A) { try { A.render(); } catch (_) {} });
        }
        return plan;
    }

    // The ZSA records whose zone code is not in the zonal model yet. The zonal model is where zones
    // live as elements; a project that only ever typed zone codes into the ZSA can add them there in
    // one deliberate step (never automatically), and the ZSA and PRA rows then link to them.
    function zsaZonesMissing() {
        var seen = {}, out = [];
        S_zsa().forEach(function (z) {
            var c = String((z && z.zoneId) || '').trim(); if (!c || seen[norm(c)]) return;
            seen[norm(c)] = 1;
            if (!(index('zone').byKey[norm(c)] || []).length) out.push(z);
        });
        return out;
    }
    function createZonesFromZsa() {
        var Z = ROOT.ZONES; if (!Z || typeof Z.addZone !== 'function') return { created: 0 };
        var created = 0;
        zsaZonesMissing().forEach(function (z) { var r = Z.addZone({ code: String(z.zoneId).trim(), name: z.desc || String(z.zoneId).trim() }); if (r && r.ok) created++; });
        if (created) _save('Added ' + created + ' zone(s) to the zonal model from the ZSA zone records');
        return { created: created };
    }
    function createZonesUi(keys) {
        var r = createZonesFromZsa();
        _toast(r.created ? r.created + ' zone' + (r.created === 1 ? '' : 's') + ' added to the zonal model. Link them with "Link typed names" or on each row.' : 'Every ZSA zone is already in the zonal model.', r.created ? 'success' : 'info');
        String(keys || '').split(',').filter(Boolean).forEach(function (k) { var A = BY_KEY[k]; if (A) { try { A.render(); } catch (_) {} } });
        refreshBanners();
        return r;
    }

    // Every broken link across the project (the Thread Integrity sweep and the report).
    function audit() {
        var out = { rows: 0, linked: 0, broken: [], typed: 0, unlinked: 0, byAnalysis: {} };
        ANALYSES.forEach(function (A) {
            var c = { rows: 0, linked: 0, broken: 0, typed: 0, unlinked: 0 };
            A.rows().forEach(function (hit) {
                var st = status(A.key, hit.row);
                c.rows++;
                if (st.state === 'ok') c.linked++;
                else if (st.state === 'broken') { c.broken++; st.broken.forEach(function (b) { out.broken.push({ analysis: A.label, row: A.title(hit.row), slot: b.slot, code: b.code, why: b.why }); }); }
                else if (st.state === 'typed') c.typed++;
                else c.unlinked++;
            });
            out.byAnalysis[A.key] = c;
            out.rows += c.rows; out.linked += c.linked; out.typed += c.typed; out.unlinked += c.unlinked;
        });
        return out;
    }

    // ------------------------------------------------------------ SysML v2 refs
    // The SysML v2 model (sysml_model.js, SLSysML) names elements by refs '<kind>:<id>'. This maps
    // every resolved link of a row onto that vocabulary, so the export can write one typed link per
    // model link. Zones: SLSysML names the ZSA zone records; a zonal-model zone maps to the ZSA
    // record carrying its code (the zones are created from them), else keeps its own id.
    function sysmlRefs(akey, row) {
        var out = [];
        linksOf(akey, row).forEach(function (l) {
            if (!l.ok) return;
            var e = element(l.kind, l.id) || {}, r = null;
            switch (l.kind) {
                case 'function': r = 'fn:' + l.id; break;
                case 'sysFunction': r = 'sfn:' + e.sys + '/' + l.id; break;
                case 'system': r = 'sys:' + l.id; break;
                case 'item': r = 'item:' + l.id; break;
                case 'resource': r = 'res:' + l.id; break;
                case 'interface': {
                    var list = pcArr('interfaces'), x = null;
                    for (var i = 0; i < list.length; i++) if (ifcId(list[i], i) === l.id) { x = list[i]; break; }
                    if (x && ROOT.SLSysML && typeof ROOT.SLSysML.refOf === 'function') { try { r = ROOT.SLSysML.refOf('iface', x); } catch (_) { r = null; } }
                    if (!r) r = 'iface:' + (x && x.icdRef ? x.icdRef : l.id);
                    break;
                }
                case 'zone': {
                    var z = S_zsa().find(function (zz) { return zz && norm(zz.zoneId) === norm(e.code); });
                    r = z ? 'zone:' + z.internalId : 'zone:' + l.id; break;
                }
                case 'zsaZone': r = 'zone:' + l.id; break;
                case 'fc': r = 'fc:' + (e.code || l.id); break;
                case 'sysFc': r = 'sfc:' + e.sys + '/' + (e.code || l.id); break;
                case 'be': r = 'ftn:' + e.page + '/' + l.id; break;
                case 'task': r = 'hf.task:' + l.id; break;
                case 'actor': r = 'hf.actor:' + l.id; break;
            }
            if (r) out.push({ slot: l.slot, kind: l.kind, id: l.id, ref: r });
        });
        return out;
    }

    // ------------------------------------------------------------ export / import
    // CSV cell: "item:5039=LRU-FCS-01; zone:z-1=110". kind:id is what a re-import reads; the code
    // after = is for the reader. A SysML v2 export maps kind:id straight onto the element.
    function csvCell(akey, row) {
        return linksOf(akey, row).map(function (l) { return l.ok ? (l.kind + ':' + l.id + '=' + (l.code || l.name)) : (l.kind + ':' + (l.id || '') + '=' + l.code + ' (missing)'); }).join('; ');
    }
    // Report cell: the same links in words, for the PDF tables ("Zone Z-NOSE; Item LRU-01").
    function textCell(akey, row) {
        return linksOf(akey, row).map(function (l) { return (KINDS[l.kind] ? KINDS[l.kind].label : l.kind) + ' ' + (l.code || l.name || l.id) + (l.broken ? ' (missing)' : ''); }).join('; ');
    }
    // Import: parse kind:id tokens (or kind:=code) back onto a row's NEW slots. Unknown ids are
    // kept (they show as broken) so nothing the source file said is silently dropped.
    function csvApply(akey, row, cell) {
        var A = BY_KEY[akey]; if (!A || !row || !cell) return 0;
        var by = {};
        String(cell).split(';').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (tok) {
            var m = /^([A-Za-z]+):([^=]*)(?:=(.*))?$/.exec(tok); if (!m) return;
            var kind = m[1], id = m[2].trim(), code = (m[3] || '').replace(/\s*\(missing\)\s*$/, '').trim();
            var slot = A.slots.find(function (s) { return !s.legacy && kindsOf(s).indexOf(kind) >= 0 && (!by[s.key] || s.multi); });
            if (!slot) return;
            if (!id && code) { var h = findByCode([kind], code); if (h.length === 1) id = h[0].el.id; }
            if (!id) return;
            (by[slot.key] = by[slot.key] || []).push(id);
        });
        var n = 0;
        Object.keys(by).forEach(function (k) { var slot = A.slots.find(function (s) { return s.key === k; }); _apply(A, { row: row }, slot, by[k]); n += by[k].length; });
        return n;
    }

    // ------------------------------------------------------------ UI: cell
    var CSS = '' +
        '.ml-cell{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-top:3px;}' +
        '.ml-badge{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;letter-spacing:.03em;padding:1px 7px;border-radius:var(--r-full,999px);white-space:nowrap;box-shadow:inset 0 0 0 1.5px currentColor;cursor:help;}' +
        '.ml-badge.ml-ok{color:var(--color-success,#1F7A33);}' +
        '.ml-badge.ml-partial,.ml-badge.ml-typed{color:var(--color-warning,#B26A00);}' +
        '.ml-badge.ml-none{color:var(--color-text-tertiary,#6b7280);}' +
        '.ml-badge.ml-broken{color:var(--color-danger,#C0271C);background:rgba(192,39,28,.07);}' +
        '.ml-chip{display:inline-block;font-size:10.5px;padding:1px 7px;border-radius:var(--r-full,999px);background:var(--color-surface-2,#f3f4f6);border:1px solid var(--color-border-hair,#e5e7eb);white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis;vertical-align:middle;}' +
        '.ml-chip .ml-k{font-weight:700;color:var(--color-text-tertiary,#6b7280);margin-right:3px;}' +
        '.ml-chip.ml-bad{color:var(--color-danger,#C0271C);border-color:currentColor;background:transparent;}' +
        '.ml-chip.ml-auto{border-style:dashed;}' +
        '.ml-btn{font:inherit;font-size:10.5px;font-weight:600;padding:1px 8px;border-radius:var(--r-full,999px);border:1px solid var(--color-accent,#007AFF);color:var(--color-accent,#007AFF);background:transparent;cursor:pointer;white-space:nowrap;}' +
        '.ml-btn:hover{background:var(--color-accent-soft,rgba(0,122,255,.08));}' +
        '.ml-note{display:block;font-size:10.5px;color:var(--color-text-tertiary,#6b7280);margin-top:2px;}' +
        '.ml-rel{font-size:10px;font-family:var(--font-mono,monospace);}' +
        '.ml-rel.ml-diff{color:var(--color-warning,#B26A00);font-weight:700;}' +
        '.ml-banner{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12px;padding:8px 12px;margin:0 0 10px;border:1px solid var(--color-border-hair,#e5e7eb);border-left:3px solid var(--color-warning,#B26A00);border-radius:var(--r-md,6px);background:var(--color-surface-1,#fff);}' +
        '.ml-banner.ml-bad{border-left-color:var(--color-danger,#C0271C);}' +
        '.ml-modal .modal-body{display:block;}' +
        '.ml-sec{border:1px solid var(--color-border-hair,#e5e7eb);border-radius:var(--r-md,8px);padding:10px 12px;margin-bottom:12px;}' +
        '.ml-sec h4{margin:0 0 6px;font-size:13px;display:flex;gap:8px;align-items:center;}' +
        '.ml-sec .ml-req{font-size:10px;font-weight:700;color:var(--color-warning,#B26A00);}' +
        '.ml-sec input.ml-q{width:100%;box-sizing:border-box;font:inherit;font-size:12.5px;padding:6px 9px;border:1px solid var(--color-border-strong,#d1d5db);border-radius:6px;background:var(--color-surface-2,#f9fafb);color:inherit;margin:4px 0 6px;}' +
        '.ml-list{max-height:220px;overflow:auto;border:1px solid var(--color-border-hair,#e5e7eb);border-radius:6px;}' +
        '.ml-opt{display:flex;gap:8px;align-items:flex-start;padding:5px 8px;margin:0;font-size:12.5px;font-weight:400;text-transform:none;letter-spacing:0;color:var(--color-text-primary,inherit);cursor:pointer;border-bottom:1px solid var(--color-border-hair,#eee);}' +
        '.ml-opt input{width:auto;margin:2px 0 0;flex:none;}' +
        '.ml-opt:last-child{border-bottom:none;}' +
        '.ml-opt:hover{background:var(--color-surface-2,#f3f4f6);}' +
        '.ml-opt .ml-oc{font-family:var(--font-mono,monospace);font-size:11px;font-weight:700;min-width:84px;}' +
        '.ml-opt .ml-os{font-size:10.5px;color:var(--color-text-tertiary,#6b7280);}' +
        '.ml-opt.ml-sel{background:var(--color-accent-soft,rgba(0,122,255,.08));}' +
        '.ml-hint{font-size:11.5px;color:var(--color-text-secondary,#4b5563);margin:4px 0;}' +
        '.ml-hint b{font-weight:600;}' +
        '.ml-more{font-size:11px;color:var(--color-text-tertiary,#6b7280);padding:5px 8px;}';
    function injectCss() {
        try {
            if (typeof document === 'undefined' || document.getElementById('ml-css')) return;
            var st = document.createElement('style'); st.id = 'ml-css'; st.textContent = CSS;
            (document.head || document.documentElement).appendChild(st);
        } catch (_) {}
    }
    var KSHORT = { 'function': 'Fn', sysFunction: 'Fn', system: 'Sys', item: 'Item', resource: 'Res', 'interface': 'If', zone: 'Zone', zsaZone: 'ZSA', fc: 'FC', sysFc: 'FC', be: 'BE', task: 'Task', actor: 'Role' };
    function chipHtml(l) {
        var title = (KINDS[l.kind] ? KINDS[l.kind].label : l.kind) + ' ' + (l.code || '') + (l.name ? ' · ' + l.name : '') + (l.lambda ? ' · λ ' + Number(l.lambda).toExponential(2) + ' /h' : '') +
            (l.broken ? '. ' + (l.why || 'missing') : '') + (l.auto ? '. Linked by exact name match; open the links to confirm.' : '');
        return '<span class="ml-chip' + (l.broken ? ' ml-bad' : '') + (l.auto ? ' ml-auto' : '') + '" title="' + esc(title) + '"><span class="ml-k">' + esc(KSHORT[l.kind] || l.kind) + '</span>' +
            esc(l.code || l.name || l.id) + (l.broken ? ' ⚠' : '') + '</span>';
    }
    function badgeHtml(akey, row, st) {
        st = st || status(akey, row);
        var tip = [st.label + '.'];
        if (st.missing.length) tip.push('Needs: ' + st.missing.join(', ') + '.');
        st.broken.forEach(function (b) { tip.push('Broken: ' + (b.code || b.id) + ' (' + (b.why || 'missing') + ').'); });
        st.typed.forEach(function (t) { tip.push(t.label + ' is typed text: "' + t.text + '"' + (t.tokens.length ? ' (' + t.tokens.map(function (x) { return x.t + ': ' + x.reason; }).join('; ') + ')' : '') + '.'); });
        return '<span class="ml-badge ml-' + st.state + '" data-ml-state="' + st.state + '" title="' + esc(tip.join('\n')) + '">' + (st.state === 'ok' ? '✓ ' : st.state === 'broken' ? '⚠ ' : '') + esc(st.label) + '</span>';
    }
    // cellHtml(akey, row, opts): badge + chips + Link button. opts.slots limits the chips shown,
    // opts.note shows the old typed text under it, opts.compact drops the chips (badge only).
    function cellHtml(akey, row, opts) {
        opts = opts || {};
        var A = BY_KEY[akey]; if (!A || !row) return '';
        injectCss();
        var st = status(akey, row);
        var links = st.links.filter(function (l) { return !opts.slots || opts.slots.indexOf(l.slot) >= 0; });
        var MAX = opts.max || 4;
        var chips = opts.compact ? '' : links.slice(0, MAX).map(chipHtml).join('') + (links.length > MAX ? '<span class="ml-chip" title="' + esc(links.slice(MAX).map(function (l) { return l.code; }).join(', ')) + '">+' + (links.length - MAX) + '</span>' : '');
        var rel = '';
        var rc = relCheck(akey, row);
        if (rc && rc.itemLambda) rel = '<span class="ml-rel' + (rc.agree === false ? ' ml-diff' : '') + '" title="' + esc(rc.agree === false ? 'The failure rate on this row (' + rc.rowLambda.toExponential(2) + ' /h) differs from the linked item\'s rate (' + rc.itemLambda.toExponential(2) + ' /h, Items page).' : 'Failure rate of the linked item (Items page).') + '">λ ' + rc.itemLambda.toExponential(1) + (rc.agree === false ? ' ≠ row' : '') + '</span>';
        var idv = rowIdOf(A, row);
        var editable = !A.readOnly && A.slots.some(function (sl) { return !isHidden(sl, row) && !(sl.legacy && (sl.legacy.form || !sl.legacy.write)); });
        var btn = (!editable || idv == null) ? '' : '<button type="button" class="ml-btn" data-ml-open="' + esc(akey) + '" data-ml-row="' + esc(idv) + '" onclick="SLModelLinks.open(\'' + jsq(akey) + '\',\'' + jsq(idv) + '\')" title="Link this row to the model elements it is about">' + (st.links.length ? 'Edit links' : 'Link to model') + '</button>';
        var note = (opts.note && String(opts.note).trim()) ? '<span class="ml-note" title="Text recorded on the row">' + esc(opts.note) + '</span>' : '';
        return '<div class="ml-cell" data-ml-a="' + esc(akey) + '"' + (idv != null ? ' data-ml-id="' + esc(idv) + '"' : '') + (opts.slots ? ' data-ml-slots="' + esc(opts.slots.join(',')) + '"' : '') + (opts.compact ? ' data-ml-compact="1"' : '') + '>' + badgeHtml(akey, row, st) + chips + rel + btn + '</div>' + note;
    }
    function rowIdOf(A, row) {
        if (A.idf) return row[A.idf] == null ? null : String(row[A.idf]);
        var list = A.rows();
        for (var i = 0; i < list.length; i++) if (list[i].row === row) return list[i].id;
        return null;
    }
    var TH = 'Model links';
    function thHtml(style) { return '<th class="ml-th"' + (style ? ' style="' + style + '"' : ' style="min-width:170px;"') + ' title="The model elements this row is about: items, zones, functions, failure conditions, basic events, tasks">' + TH + '</th>'; }
    function tdHtml(akey, row, opts) { return '<td class="ml-td">' + cellHtml(akey, row, opts) + '</td>'; }

    // A page banner: how many rows of this analysis are linked, broken, or hold typed names, with
    // the one action that links typed names by exact match. Empty string when every row is linked.
    function bannerHtml(akeys) {
        injectCss();
        akeys = [].concat(akeys);
        var rows = 0, ok = 0, broken = 0, typed = 0, unlinked = 0, ready = 0;
        akeys.forEach(function (k) {
            var A = BY_KEY[k]; if (!A) return;
            A.rows().forEach(function (hit) {
                if (A.inView && !A.inView(hit.row)) return;
                rows++;
                var st = status(k, hit.row);
                if (st.state === 'ok') ok++; else if (st.state === 'broken') broken++; else if (st.state === 'typed') typed++; else unlinked++;
            });
            if (!A.readOnly) ready += migrate(k, { apply: false, inView: true }).linked;
        });
        if (!rows || ok === rows) return '';
        var parts = [];
        if (broken) parts.push('<b style="color:var(--color-danger,#C0271C);">' + broken + ' with a broken link</b>');
        if (typed) parts.push(typed + ' with typed names not linked yet');
        if (unlinked) parts.push(unlinked + ' not linked yet');
        var mkZones = (akeys.indexOf('zsa') >= 0 || akeys.indexOf('pra') >= 0) && ROOT.ZONES ? zsaZonesMissing().length : 0;
        return '<div class="ml-banner' + (broken ? ' ml-bad' : '') + '" data-ml-banner="' + esc(akeys.join(',')) + '"><span><b>Model links:</b> ' + ok + ' of ' + rows + ' rows linked' + (parts.length ? '; ' + parts.join(', ') : '') + '.</span>' +
            (mkZones ? '<button type="button" class="ml-btn" onclick="SLModelLinks.createZonesUi(\'' + jsq(akeys.join(',')) + '\')" title="The zonal model is where zones live as model elements. This adds one zone for each ZSA zone code it does not have yet (code and boundary text from the ZSA record).">Add ' + mkZones + ' ZSA zone' + (mkZones === 1 ? '' : 's') + ' to the zonal model</button>' : '') +
            (ready ? '<button type="button" class="ml-btn" onclick="SLModelLinks.migrateUi(\'' + jsq(akeys.join(',')) + '\')" title="Links a typed name only when it matches exactly one element\'s code or name. Every other name stays flagged on its row.">Link ' + ready + ' typed name' + (ready === 1 ? '' : 's') + ' by exact match</button>' : '') +
            '<span style="color:var(--color-text-tertiary,#6b7280);">Use <b>Link to model</b> on a row to choose its elements.</span></div>';
    }
    function migrateUi(keys) {
        var list = String(keys || '').split(',').filter(Boolean);
        var tot = { linked: 0, rows: 0, flagged: 0, locked: 0 };
        list.forEach(function (k) { var p = migrate(k, { apply: true, inView: true }); tot.linked += p.linked; tot.rows += p.rows; tot.flagged += p.flagged.length; tot.locked += p.skippedLocked; });
        refreshBanners();
        _toast('Linked ' + tot.linked + ' typed name' + (tot.linked === 1 ? '' : 's') + ' on ' + tot.rows + ' row' + (tot.rows === 1 ? '' : 's') + ' by exact match.' + (tot.flagged ? ' ' + tot.flagged + ' name' + (tot.flagged === 1 ? '' : 's') + ' did not match exactly one element and stay flagged on the row.' : '') + (tot.locked ? ' ' + tot.locked + ' row(s) in a locked area were left alone.' : ''), tot.flagged ? 'warning' : 'success');
        return tot;
    }

    // ------------------------------------------------------------ UI: picker
    // spec = { title, subtitle, slots: [{ key, label, kinds:[{kind,label}], multi, required, readOnly, readOnlyNote,
    //          editor, selected:[{kind,id}], suggest:[{kind,id,why}], typed:{text,tokens} }], onSave(map) }
    // The picker is swappable: SLModelLinks.picker = fn(spec), or SLSysML.slotPicker(spec) (pickerFn).
    function defaultPicker(spec) {
        if (typeof document === 'undefined') return null;
        injectCss();
        closePicker();
        var state = {};
        spec.slots.forEach(function (s) { state[s.key] = s.selected.map(function (x) { return x.id; }); });
        var ov = document.createElement('div');
        ov.className = 'modal-overlay show ml-modal'; ov.id = 'ml-picker';
        var secs = spec.slots.map(function (s, si) {
            var head = '<h4>' + esc(s.label) + (s.required ? ' <span class="ml-req">required</span>' : '') + '</h4>';
            if (s.readOnly) {
                var chips = s.links.length ? s.links.map(chipHtml).join(' ') : '<span class="ml-note">Not set.</span>';
                return '<div class="ml-sec" data-ml-slot="' + esc(s.key) + '">' + head + '<div>' + chips + '</div><div class="ml-hint">' + esc(s.readOnlyNote || 'Set in the row\'s own editor.') + (s.editor ? ' <button type="button" class="ml-btn" data-ml-editor="' + si + '">Open the editor</button>' : '') + '</div></div>';
            }
            var hint = '';
            if (s.typed && s.typed.text) {
                hint += '<div class="ml-hint">The row says, in typed text: <b>' + esc(s.typed.text) + '</b>. ' +
                    s.typed.tokens.map(function (t) { return esc(t.t) + ': ' + esc(t.reason); }).join('; ') + '.' + (s.suggest.length ? ' Exact matches are ticked below; saving confirms them.' : '') + '</div>';
            }
            s.suggest.filter(function (x) { return x.why; }).forEach(function (x) { hint += '<div class="ml-hint">Ticked: ' + esc(x.why) + '.</div>'; });
            var broken = s.links.filter(function (l) { return l.broken; });
            if (broken.length) hint += '<div class="ml-hint" style="color:var(--color-danger,#C0271C);">Broken: ' + broken.map(function (b) { return esc(b.code || b.id) + ' (' + esc(b.why || 'missing') + ')'; }).join(', ') + '. Untick to remove, or pick the element it should point at.</div>';
            var kinds = s.kinds.map(function (k) { return k.label; }).join(' or ');
            return '<div class="ml-sec" data-ml-slot="' + esc(s.key) + '">' + head + hint +
                '<input class="ml-q" type="search" data-ml-q="' + si + '" placeholder="Search ' + esc(kinds.toLowerCase()) + ' by code or name" aria-label="Search ' + esc(kinds) + '">' +
                '<div class="ml-list" data-ml-list="' + si + '" role="listbox" aria-multiselectable="' + (s.multi ? 'true' : 'false') + '"></div></div>';
        }).join('');
        ov.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="ml-title" style="max-width:760px;">' +
            '<div class="modal-head"><div><h3 id="ml-title">' + esc(spec.title) + '</h3>' + (spec.subtitle ? '<div style="font-size:12px;color:var(--color-text-tertiary);margin-top:2px;">' + esc(spec.subtitle) + '</div>' : '') + '</div>' +
            '<button type="button" data-ml-x="1" aria-label="Close" style="border:none;background:transparent;font-size:23px;line-height:1;cursor:pointer;color:var(--color-text-tertiary);">×</button></div>' +
            '<div class="modal-body">' + secs + '</div>' +
            '<div class="modal-foot" style="padding:14px 22px;display:flex;gap:10px;justify-content:flex-end;">' +
            '<button type="button" class="btn-cyan" data-ml-cancel="1" style="background:var(--color-surface-2);color:inherit;">Cancel</button>' +
            '<button type="button" class="btn-cyan" data-ml-save="1">Save links</button></div></div>';
        document.body.appendChild(ov);
        function drawList(si) {
            var s = spec.slots[si]; if (s.readOnly) return;
            var host = ov.querySelector('[data-ml-list="' + si + '"]'); if (!host) return;
            var q = norm((ov.querySelector('[data-ml-q="' + si + '"]') || {}).value || '');
            var sel = state[s.key];
            var all = [];
            s.kinds.forEach(function (k) { index(k.kind).list.forEach(function (e) { all.push({ kind: k.kind, e: e }); }); });
            var selected = all.filter(function (x) { return sel.indexOf(x.e.id) >= 0; });
            var rest = all.filter(function (x) { return sel.indexOf(x.e.id) < 0 && (!q || norm(x.e.code + ' ' + x.e.name + ' ' + (x.e.sub || '')).indexOf(q) >= 0); });
            var LIMIT = 200;
            var shown = selected.concat(rest.slice(0, LIMIT));
            var missing = sel.filter(function (id) { return !all.some(function (x) { return x.e.id === id; }); });
            var name = 'ml-r-' + si;
            var html = missing.map(function (id) {
                return '<label class="ml-opt ml-sel" style="color:var(--color-danger,#C0271C);"><input type="' + (s.multi ? 'checkbox' : 'radio') + '" name="' + name + '" value="' + esc(id) + '" checked><span class="ml-oc">' + esc(id) + '</span><span>Missing element (deleted or renamed away). Untick to remove the link.</span></label>';
            }).join('') + shown.map(function (x) {
                var on = sel.indexOf(x.e.id) >= 0;
                return '<label class="ml-opt' + (on ? ' ml-sel' : '') + '"><input type="' + (s.multi ? 'checkbox' : 'radio') + '" name="' + name + '" value="' + esc(x.e.id) + '"' + (on ? ' checked' : '') + '>' +
                    '<span class="ml-oc">' + esc(x.e.code || '') + '</span><span>' + esc(x.e.name || '') + (x.e.sub || s.kinds.length > 1 ? '<br><span class="ml-os">' + esc((s.kinds.length > 1 ? KINDS[x.kind].label + ' · ' : '') + (x.e.sub || '')) + (x.e.lambda ? ' · λ ' + Number(x.e.lambda).toExponential(2) + ' /h' : '') + '</span>' : '') + '</span></label>';
            }).join('');
            if (!all.length) html = '<div class="ml-more">' + esc(emptyHint(s)) + (s.kinds[0].kind === 'zone' && typeof spec.onMakeZones === 'function' && ROOT.ZONES && zsaZonesMissing().length ? ' <button type="button" class="ml-btn" data-ml-mkzones="1">Add the ' + zsaZonesMissing().length + ' ZSA zones to the zonal model</button>' : '') + '</div>';
            else if (rest.length > LIMIT) html += '<div class="ml-more">' + (rest.length - LIMIT).toLocaleString('en-US') + ' more. Type to narrow the list.</div>';
            else if (!shown.length && !missing.length) html = '<div class="ml-more">Nothing matches "' + esc(q) + '".</div>';
            if (!s.multi) html = '<label class="ml-opt"><input type="radio" name="' + name + '" value=""' + (sel.length ? '' : ' checked') + '><span class="ml-oc"></span><span>No link</span></label>' + html;
            host.innerHTML = html;
        }
        spec.slots.forEach(function (s, si) { drawList(si); });
        var timer = null;
        ov.addEventListener('input', function (e) {
            var si = e.target && e.target.getAttribute && e.target.getAttribute('data-ml-q');
            if (si == null) return;
            clearTimeout(timer); timer = setTimeout(function () { drawList(+si); }, 120);
        });
        ov.addEventListener('change', function (e) {
            var t = e.target; if (!t || !t.name || t.name.indexOf('ml-r-') !== 0) return;
            var si = +t.name.slice(5), s = spec.slots[si];
            if (s.multi) {
                var cur = state[s.key];
                if (t.checked) { if (cur.indexOf(t.value) < 0) cur.push(t.value); } else state[s.key] = cur.filter(function (x) { return x !== t.value; });
            } else state[s.key] = t.value ? [t.value] : [];
            var lab = t.closest && t.closest('.ml-opt'); if (lab) lab.classList.toggle('ml-sel', !!t.checked && !!t.value);
            if (!s.multi) drawList(si);
        });
        var done = false;
        var cancel = function () { if (done) return; done = true; closePicker(); try { if (typeof spec.onCancel === 'function') spec.onCancel(); } catch (_) {} };
        ov.addEventListener('click', function (e) {
            var t = e.target; if (!t || !t.getAttribute) return;
            if (t === ov || t.getAttribute('data-ml-x') || t.getAttribute('data-ml-cancel')) { cancel(); return; }
            if (t.getAttribute('data-ml-save')) { done = true; var map = {}; spec.slots.forEach(function (s) { if (!s.readOnly) map[s.key] = state[s.key].slice(); }); closePicker(); spec.onSave(map); return; }
            if (t.getAttribute('data-ml-mkzones')) { done = true; closePicker(); try { spec.onMakeZones(); } catch (_) {} return; }
            var ed = t.getAttribute('data-ml-editor');
            if (ed != null) { var s = spec.slots[+ed]; done = true; closePicker(); try { if (typeof s.editor === 'function') s.editor(); } catch (_) {} }
        });
        ov.addEventListener('keydown', function (e) { if (e.key === 'Escape') cancel(); });
        try { var f = ov.querySelector('input.ml-q'); if (f) f.focus(); } catch (_) {}
        return ov;
    }
    function emptyHint(s) {
        var k = s.kinds[0] && s.kinds[0].kind;
        if (k === 'zone') return 'The zonal model has no zones yet. Add them on the Zonal Model page, then link them here.';
        if (k === 'item') return 'No items yet. Add them on the Items page, then link them here.';
        if (k === 'interface' || k === 'resource') return 'No interfaces or shared resources yet. Add them on the Architecture pages, then link them here.';
        if (k === 'be') return 'No basic events yet. Build the fault tree first, then link its events here.';
        if (k === 'task') return 'No crew tasks yet. Add them under Crew tasks or Task identification, then link them here.';
        return 'No ' + (KINDS[k] ? KINDS[k].plural.toLowerCase() : 'elements') + ' yet.';
    }
    // The picker is swappable. SLSysML.linkPicker (sysml_model.js) is a single-ref FIELD with a
    // different contract (container, ref, onPick), so it is NOT called with a slot spec; a SysML-side
    // picker that takes this spec registers as SLSysML.slotPicker, or replaces SLModelLinks.picker.
    function pickerFn() {
        if (ROOT.SLSysML && typeof ROOT.SLSysML.slotPicker === 'function') return ROOT.SLSysML.slotPicker;
        return API.picker;
    }
    function closePicker() { if (typeof document === 'undefined') return; var el = document.getElementById('ml-picker'); if (el) el.remove(); }

    // Build the picker spec for one row (or a staged form row) and open it.
    function specFor(akey, row, onSave, title) {
        var A = BY_KEY[akey];
        var links = linksOf(akey, row);
        return {
            title: title || ('Model links · ' + A.label + ' ' + A.title(row)),
            subtitle: 'Choose the model elements this row is about. Every link points at a real element; a link whose element is deleted shows as broken.',
            slots: A.slots.filter(function (s) { return !isHidden(s, row); }).map(function (s) {
                var kinds = kindsOf(s).map(function (k) { return { kind: k, label: KINDS[k].label }; });
                var mine = links.filter(function (l) { return l.slot === s.key; });
                var ro = !!(A.readOnly || (s.legacy && (s.legacy.form || !s.legacy.write)));
                var sel = mine.filter(function (l) { return l.id; }).map(function (l) { return { kind: l.kind, id: l.id }; });
                var typed = null, suggest = [];
                if (!ro && !sel.length) {
                    extraFor(s, row).forEach(function (x) { if (findEl(kindsOf(s), x.id)) suggest.push({ id: String(x.id), why: x.why }); });
                    typed = typedFor(A, s, row);
                    if (typed) typed.tokens.forEach(function (t) { if (t.ids.length === 1) suggest.push({ id: String(t.ids[0].id), why: '' }); });
                    var seen = {}; suggest = suggest.filter(function (x) { if (seen[x.id]) return false; seen[x.id] = 1; return true; });
                    if (!s.multi) suggest = suggest.length === 1 ? suggest : [];
                    sel = suggest.map(function (x) { return { id: x.id }; });
                }
                return { key: s.key, label: s.label, kinds: kinds, multi: !!s.multi, required: isReq(s, row), readOnly: ro, links: mine,
                         readOnlyNote: A.readOnly ? 'This table follows the model directly; it is linked by construction.' : 'Set in the row\'s own editor, where the rest of the row is edited.',
                         editor: (ro && A.editor) ? A.editor(row) : null,
                         selected: sel, suggest: suggest, typed: typed };
            }),
            onSave: onSave
        };
    }
    function open(akey, rowId) {
        var A = BY_KEY[akey]; if (!A) return null;
        var hit = rowById(akey, rowId); if (!hit) { _toast('That row is no longer in the project.', 'warning'); return null; }
        var spec = specFor(akey, hit.row, function (map) { setLinks(akey, rowId, map, { confirmAuto: true }); });
        spec.onMakeZones = function () { createZonesFromZsa(); open(akey, rowId); };
        var P = pickerFn();
        return P(spec);
    }

    // pickNew(akey, draft): the add flows of the R&M lanes: the new row's links are chosen in the
    // picker (never typed into a prompt). Resolves true when saved (links applied to the draft; the
    // caller stores and saves the row), false when cancelled.
    function pickNew(akey, draft, title) {
        var A = BY_KEY[akey];
        return new Promise(function (resolve) {
            if (!A || typeof document === 'undefined') { resolve(true); return; }
            var spec = specFor(akey, draft, function (map) {
                Object.keys(map).forEach(function (k) {
                    var slot = A.slots.find(function (x) { return x.key === k; });
                    if (slot && !(slot.legacy && (slot.legacy.form || !slot.legacy.write))) _apply(A, { row: draft }, slot, map[k]);
                });
                if (Array.isArray(draft.modelLinksAuto)) delete draft.modelLinksAuto;
                resolve(true);
            }, title || ('Model links · new ' + A.label + ' row' + (draft && (draft.name || draft.title) ? ' · ' + (draft.name || draft.title) : '')));
            spec.onCancel = function () { resolve(false); };
            var P = pickerFn();
            P(spec);
        });
    }
    // Redraw every open links cell of one row (the HF edit modal shows one beside the table's).
    function refreshCells(akey, id) {
        if (typeof document === 'undefined') return;
        var hit = rowById(akey, id); if (!hit) return;
        Array.prototype.forEach.call(document.querySelectorAll('.ml-cell[data-ml-a="' + akey + '"][data-ml-id="' + String(id).replace(/"/g, '') + '"]'), function (el) {
            var o = {}; var sl = el.getAttribute('data-ml-slots'); if (sl) o.slots = sl.split(','); if (el.getAttribute('data-ml-compact')) o.compact = true;
            var tmp = document.createElement('div'); tmp.innerHTML = cellHtml(akey, hit.row, o);
            var fresh = tmp.querySelector('.ml-cell'); if (fresh) el.replaceWith(fresh);
        });
    }

    // ------------------------------------------------------------ forms (staged links)
    // The worksheet forms (PRA, ZSA, FMEA) carry a Model links field. It edits a staged copy
    // until the form is submitted; the submit wrapper then lands it on the saved row.
    var _staged = {};
    function stageFor(akey, row) { _staged[akey] = { modelLinks: JSON.parse(JSON.stringify((row && row.modelLinks) || {})), _src: row || null }; drawForm(akey); }
    function stagedRow(akey) {
        var s = _staged[akey] || {};
        var base = s._src ? Object.assign({}, s._src) : {};
        // the staged values of the NEW slots stand in for the row's own links
        var A = BY_KEY[akey], ml = {};
        Object.keys(s.modelLinks || {}).forEach(function (k) { var sl = A && A.slots.find(function (x) { return x.key === k; }); if (sl && !sl.legacy) ml[k] = s.modelLinks[k]; });
        base.modelLinks = s.touched ? ml : Object.assign({}, (s._src && s._src.modelLinks) || {}, ml);
        if (s._src && s._src.modelLinksAuto) base.modelLinksAuto = s._src.modelLinksAuto;
        // the typed text the form currently holds, so the picker can suggest exact matches
        if (A && A.formText) A.formText(base);
        return base;
    }
    // The form's picker edits every slot the picker can write; a link the form itself owns (a select
    // or checkbox list in the same form) stays read-only here.
    function formOpen(akey) {
        var A = BY_KEY[akey]; if (!A) return;
        var row = stagedRow(akey), st = _staged[akey];
        var spec = specFor(akey, row, function (map) {
            var s = _staged[akey] || (_staged[akey] = { modelLinks: {}, _src: null });
            Object.keys(map).forEach(function (k) { s.modelLinks[k] = map[k].slice(); });
            s.touched = true;
            drawForm(akey);
        }, 'Model links · new or edited ' + A.label + ' row');
        spec.slots.forEach(function (sl) {
            if (sl.readOnly) sl.readOnlyNote = 'Set in this form.';
            sl.editor = null;
            if (st && st.modelLinks && st.modelLinks[sl.key]) { sl.selected = st.modelLinks[sl.key].map(function (id) { return { id: id }; }); sl.suggest = []; sl.typed = null; }
        });
        return pickerFn()(spec);
    }
    function formLinks(akey) {
        var A = BY_KEY[akey], s = _staged[akey], row = stagedRow(akey), out = [];
        A.slots.forEach(function (sl) {
            if (isHidden(sl, row) || !writable(sl)) return;
            if (s && s.modelLinks && s.modelLinks[sl.key]) {
                s.modelLinks[sl.key].forEach(function (id) { var f = findEl(kindsOf(sl), id); out.push(f ? { slot: sl.key, kind: f.kind, id: f.el.id, code: f.el.code, name: f.el.name, ok: true } : { slot: sl.key, kind: kindsOf(sl)[0], id: id, code: id, ok: false, broken: true }); });
            } else linksOf(akey, row).forEach(function (l) { if (l.slot === sl.key) out.push(l); });
        });
        return out;
    }
    function drawForm(akey) {
        if (typeof document === 'undefined') return;
        var host = document.querySelector('[data-ml-form="' + akey + '"]'); if (!host) return;
        injectCss();
        var links = formLinks(akey);
        host.innerHTML = '<label style="display:block;">Model links</label><div class="ml-cell">' +
            (links.length ? links.map(chipHtml).join('') : '<span class="ml-note" style="margin:0;">No model elements linked yet.</span>') +
            '<button type="button" class="ml-btn" onclick="SLModelLinks.formOpen(\'' + jsq(akey) + '\')">' + (links.length ? 'Edit links' : 'Link to model') + '</button></div>';
    }
    // The submit wrappers read the field BEFORE the form factory resets the form (formPeek), then
    // land it on the saved row (formCommit), or put it back when the save was refused (formRestore).
    function formPeek(akey) {
        var s = _staged[akey]; if (!s) return null;
        return { modelLinks: JSON.parse(JSON.stringify(s.modelLinks || {})), touched: !!s.touched };
    }
    function formRestore(akey, snap) {
        if (!snap) return;
        _staged[akey] = { modelLinks: snap.modelLinks, touched: snap.touched, _src: (_staged[akey] || {})._src || null };
        drawForm(akey);
    }
    function formCommit(akey, target, snap) {
        if (snap === undefined) snap = formPeek(akey);
        if (!target || !snap || !snap.touched) { formReset(akey); return false; }
        var A = BY_KEY[akey];
        A.slots.forEach(function (slot) {
            if (!writable(slot) || !Object.prototype.hasOwnProperty.call(snap.modelLinks, slot.key)) return;
            _apply(A, { row: target }, slot, arr(snap.modelLinks[slot.key]));
        });
        if (Array.isArray(target.modelLinksAuto)) delete target.modelLinksAuto;
        _save(A.label + ' ' + A.title(target) + ': links set from the form');
        formReset(akey);
        return true;
    }
    function formReset(akey) { delete _staged[akey]; drawForm(akey); }

    // The worksheet banners (PRA, ZSA, FMEA) refresh whenever their table body re-renders.
    var BANNER_BODY = { 'pra-body': 'pra', 'zsa-body': 'zsa', 'fmea-body': 'fmea' };
    function refreshBanners() {
        if (typeof document === 'undefined') return;
        Array.prototype.forEach.call(document.querySelectorAll('[data-ml-banner-for]'), function (h) {
            try { h.innerHTML = bannerHtml(h.getAttribute('data-ml-banner-for').split(',')); } catch (_) {}
        });
    }
    var _bnPending = false;
    function _scheduleBanners() {
        if (typeof document === 'undefined' || _bnPending) return; _bnPending = true;
        var run = function () { _bnPending = false; refreshBanners(); };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else setTimeout(run, 30);
    }
    function watchBodies() {
        if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
        try {
            var mo = new MutationObserver(function (muts) {
                for (var i = 0; i < muts.length; i++) { var n = muts[i].target; while (n && n !== document) { if (n.id && BANNER_BODY[n.id]) { _scheduleBanners(); return; } n = n.parentNode; } }
            });
            Object.keys(BANNER_BODY).forEach(function (id) { var el = document.getElementById(id); if (el) mo.observe(el, { childList: true, subtree: false }); });
        } catch (_) {}
    }

    // ------------------------------------------------------------ golden thread
    // threadIndex() maps each target (failure condition, function, basic event, item) to the
    // analysis rows linked to it, once per graph build. threadPass() is called by
    // _gtvBuildGraph for each failure condition and adds the rows that touch it.
    var GT_KIND = { pra: 'cca', zsa: 'cca', fmea: 'fta' };
    function threadIndex() {
        var map = {};
        var put = function (k, v) { (map[k] = map[k] || []).push(v); };
        ANALYSES.forEach(function (A) {
            if (A.key === 'acFha' || A.key === 'sysFha' || A.key === 'hfAlloc') return;   // FHA rows ARE the thread's failure conditions
            A.rows().forEach(function (hit) {
                var ls = linksOf(A.key, hit.row).filter(function (l) { return l.ok; });
                if (!ls.length) return;
                var ent = { A: A, row: hit.row, id: hit.id };
                var seen = {};
                ls.forEach(function (l) {
                    var k = l.kind + ':' + l.id; if (seen[k]) return; seen[k] = 1;
                    put(k, ent);
                });
            });
        });
        var itemsBySub = {};
        S_items().forEach(function (it) { if (!it) return; arr(it.traceIds).forEach(function (sid) { (itemsBySub[sid] = itemsBySub[sid] || []).push(String(it.internalId)); }); });
        return { map: map, itemsBySub: itemsBySub, pageBe: {} };
    }
    function _pageBeIds(idx, page) {
        var k = String(page.id); if (idx.pageBe[k]) return idx.pageBe[k];
        var ids = [], stack = [page.root];
        while (stack.length) { var n = stack.pop(); if (!n) continue; if (n.type === 'basic' || n.type === 'undeveloped') ids.push(String(n.id)); arr(n.children).forEach(function (c) { stack.push(c); }); arr(n._children).forEach(function (c) { stack.push(c); }); }
        return (idx.pageBe[k] = ids);
    }
    // ctx: { fha, domain, fn, linkedPages, fcKey, funcKey, ftaKeys }
    function threadPass(idx, ctx, addNode, addLink) {
        if (!idx || !ctx) return 0;
        var hits = [], seen = {};
        var take = function (list, via) { arr(list).forEach(function (e) { var k = e.A.key + ':' + e.id; if (seen[k]) return; seen[k] = 1; hits.push({ e: e, via: via }); }); };
        take(idx.map[(ctx.domain === 'AC' ? 'fc:' : 'sysFc:') + ctx.fha.internalId], 'fc');
        if (ctx.fn) take(idx.map['function:' + ctx.fn.internalId], 'fn');
        if (ctx.domain === 'SYS' && ctx.fn) take(idx.map['sysFunction:' + ctx.fn.internalId], 'fn');
        arr(ctx.linkedPages).forEach(function (p) { _pageBeIds(idx, p).forEach(function (bid) { take(idx.map['be:' + bid], 'be'); }); });
        if (ctx.fha.subId) arr(idx.itemsBySub[ctx.fha.subId]).forEach(function (iid) { take(idx.map['item:' + iid], 'item'); });
        hits.forEach(function (h) {
            var A = h.e.A, r = h.e.row;
            var kind = GT_KIND[A.key] || (A.group === 'Human factors' ? 'hf' : (A.group === 'R&M' ? 'ram' : 'cca'));
            var key;
            if (A.key === 'pra' || A.key === 'zsa') key = addNode('cca', A.key + ':' + r.internalId, (A.key === 'pra' ? 'PRA ' + (r.praId || '') : 'ZSA ' + (r.zoneId || '')).trim(), (A.key === 'pra' ? r.threat : r.desc) || A.label, { kind: A.key, id: r.internalId });
            else key = addNode(kind, 'ml:' + A.key + ':' + h.e.id, A.title(r), A.label, { kind: 'modelLinkRow', analysis: A.key, id: h.e.id });
            var st = status(A.key, r);
            if (st.state === 'broken') { try { var nn = addNode(kind, key.slice(kind.length + 1), '', '', null, 'stale', 'Broken model link: ' + st.broken.map(function (b) { return b.code; }).join(', ')); } catch (_) {} }
            if (kind === 'hf' && h.via === 'fn' && ctx.funcKey) { addLink(ctx.funcKey, key); addLink(key, ctx.fcKey); }
            else if ((kind === 'ram' || kind === 'fta') && ctx.ftaKeys && ctx.ftaKeys.length) {
                if (kind === 'fta') ctx.ftaKeys.forEach(function (fk) { addLink(fk, key); });
                else ctx.ftaKeys.forEach(function (fk) { addLink(key, fk); });
            }
            else if (kind === 'hf' || kind === 'ram') addLink(key, ctx.fcKey);
            else addLink(ctx.fcKey, key);
        });
        return hits.length;
    }

    // ------------------------------------------------------------ Thread Integrity sweep
    function registerInvariant() {
        if (typeof ROOT.invRegister !== 'function') return false;
        return ROOT.invRegister({
            id: 'INV-67', sev: 'advisory',
            name: 'Analysis rows link to model elements that exist (FHA, FMEA, PRA, ZSA, human factors, R&M)',
            run: function () {
                var a = audit();
                return { checked: a.rows, fails: a.broken.slice(0, 50).map(function (b) { return b.analysis + ' ' + b.row + ': ' + (b.code || '') + ' (' + (b.why || 'missing') + ')'; }), failCount: a.broken.length };
            }
        });
    }
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        var boot = function () {
            injectCss(); registerInvariant();
            ['pra', 'zsa', 'fmea'].forEach(function (k) { try { drawForm(k); } catch (_) {} });
            watchBodies(); refreshBanners();
            if (typeof ROOT.cancelEdit === 'function' && !ROOT.cancelEdit._mlWrapped) {
                var orig = ROOT.cancelEdit;
                var w = function (module) { var r = orig.apply(this, arguments); try { if (module === 'pra' || module === 'zsa' || module === 'fmea') formReset(module); } catch (_) {} return r; };
                w._mlWrapped = true; ROOT.cancelEdit = w;
            }
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
    }

    var API = {
        VERSION: '1.0',
        KINDS: KINDS, ANALYSES: ANALYSES, analysis: function (k) { return BY_KEY[k] || null; },
        index: index, element: element, resolveCode: resolveCode, invalidate: invalidate,
        linksOf: linksOf, status: status, relCheck: relCheck, typedFor: function (akey, slotKey, row) { var A = BY_KEY[akey]; var s = A && A.slots.find(function (x) { return x.key === slotKey; }); return s ? typedFor(A, s, row) : null; },
        setLinks: setLinks, migrate: migrate, migrateUi: migrateUi, audit: audit,
        zsaZonesMissing: zsaZonesMissing, createZonesFromZsa: createZonesFromZsa, createZonesUi: createZonesUi, refreshBanners: refreshBanners,
        csvCell: csvCell, csvApply: csvApply, textCell: textCell, sysmlRefs: sysmlRefs,
        cellHtml: cellHtml, badgeHtml: badgeHtml, thHtml: thHtml, tdHtml: tdHtml, bannerHtml: bannerHtml, TH: TH,
        open: open, closePicker: closePicker, picker: defaultPicker, specFor: specFor,
        pickNew: pickNew, refreshCells: refreshCells,
        stageFor: stageFor, formOpen: formOpen, formPeek: formPeek, formRestore: formRestore, formCommit: formCommit, formReset: formReset, drawForm: drawForm, _staged: _staged,
        threadIndex: threadIndex, threadPass: threadPass, registerInvariant: registerInvariant,
        _norm: norm, _codes: codes
    };
    ROOT.SLModelLinks = API;
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
