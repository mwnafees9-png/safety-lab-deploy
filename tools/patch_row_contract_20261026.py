#!/usr/bin/env python3
# 26 Oct 2026 (Waqas: "lets get this fixed across the board"). The AI wrote rows with nothing in them: three AFHA
# rows with no failure condition, a function with no sub-function (AF-010 "Protect against fire", SF-025 blank), and an
# FCIM row for it with every column empty. One rule now says what each kind of row must carry to be a row at all, and it
# is checked when the AI's reply is read (an empty row never reaches the review panel), in the executor every accept
# goes through, in each writer the classic lanes call directly, and on an AI edit of an existing row. Applied once on
# top of patch_afha_fixes_20261026.py; kept for the record.
p = 'site/ai_assistant.js'; s = open(p).read()
R = [
# ---- the one rule
("""    // F1c batch (30 Aug 2026): the unified batch applies ops through these chat""",
r"""    /* 26 Oct 2026: WHAT A ROW MUST CARRY TO BE A ROW. Found on the live Aeolus run: the AI handed over rows with the part
       that makes them a row left empty (an AFHA row with no failure condition, a function with no sub-function, an FCIM
       row with no failure condition at all), and every writer saved them as blank lines. One rule per kind of row; it is
       read in four places: the AI's reply (an empty row never reaches the review panel), the executor every accept goes
       through, each writer the classic lanes call directly, and an AI edit of an existing row. Other fields may stay
       empty (an empty field is the honest answer the abstention rule asks for); these may not, because without them
       there is nothing there. */
    const _has = function (v) { return Array.isArray(v) ? v.some(function (x) { return String(x == null ? '' : x).trim() !== ''; }) : String(v == null ? '' : v).trim() !== ''; };
    const _ROW_RULES = {
        fha:         { label: 'FHA row',            need: 'a failure condition', ok: function (x) { return _has(x.fcDesc) || _has(x.srcCondId); } },
        fcim:        { label: 'FCIM row',           need: 'a failure condition (total loss, partial loss or malfunction)', ok: function (x) { return _has(x.totalLoss) || _has(x.partialLoss) || _has(x.malfunction) || _has(x.partials) || _has(x.malfunctions) || _has(x.tlDesc) || _has(x.plDesc) || _has(x.mDesc); } },
        'func.ac':   { label: 'aircraft function',  need: 'function or sub-function name', ok: function (x) { return _has(x.funcName) && _has(x.subName); } },
        'func.sys':  { label: 'system function',    need: 'function name', ok: function (x) { return _has(x.subName) || _has(x.funcName); } },
        fmea:        { label: 'FMEA row',           need: 'failure mode or effect', ok: function (x) { const item = (x.level || x._level || (x.fmeaType === 'piece-part' ? 'item' : '')) === 'item'; return (item ? (_has(x.mode) || _has(x.failureMode)) : (_has(x.funcSubId) || _has(x._funcSubId))) && (_has(x.localEffect) || _has(x.nextEffect) || _has(x.endEffect) || _has(x.effect)); } },
        zsa:         { label: 'ZSA row',            need: 'zone or finding', ok: function (x) { return (_has(x.zoneId) || _has(x.zone)) && (_has(x.desc) || _has(x.interference) || _has(x.mitigation)); } },
        pra:         { label: 'PRA row',            need: 'a threat', ok: function (x) { return _has(x.threat); } },
        cma:         { label: 'CMA row',            need: 'independence claim', ok: function (x) { return _has(x.claim) || _has(x.subject); } },
        req:         { label: 'requirement',        need: 'requirement text', ok: function (x) { return _has(x.text); } },
        item:        { label: 'item',               need: 'a name', ok: function (x) { return _has(x.name); } },
        routing:     { label: 'routing',            need: 'a name', ok: function (x) { return _has(x.name); } },
        system:      { label: 'system',             need: 'a name', ok: function (x) { return _has(x.name); } },
        mac:         { label: 'MAC rule',           need: 'the sub-function it applies to', ok: function (x) { return _has(x.subId); } },
        fta_tree:    { label: 'fault tree',         need: 'a top event', ok: function (x) { return _has(x.topEvent) || !!(x.root && _has(x.root.name)); } },
        fta_node:    { label: 'fault tree node',    need: 'a name', ok: function (x) { return !!(x.node && _has(x.node.name)); } },
        markov_state:{ label: 'Markov state',       need: 'a name', ok: function (x) { return _has(x.name); } }
    };
    const _OP_KIND = { add_fha: 'fha', add_fcim: 'fcim', add_fmea: 'fmea', add_zsa: 'zsa', add_pra: 'pra', add_cma: 'cma', add_requirement: 'req', add_item: 'item', add_routing: 'routing', add_system: 'system', add_mac: 'mac', add_fta_tree: 'fta_tree', add_fta_node: 'fta_node', add_markov_state: 'markov_state' };
    const _TABLE_KIND = { ac_fha: 'fha', sys_fha: 'fha', ac_func: 'func.ac', sys_func: 'func.sys', ac_fcim: 'fcim', sys_fcim: 'fcim', ac_req: 'req', sys_req: 'req', pra: 'pra', zsa: 'zsa', cma: 'cma', routing: 'routing', item: 'item', fmea: 'fmea' };
    function _rowKindOf(a) { if (!a) return ''; if (a.op === 'add_function') return (a.scope === 'system' && a.systemId) ? 'func.sys' : 'func.ac'; return _OP_KIND[a.op] || ''; }
    // '' when the row may be written; otherwise what is missing, in words ("an FCIM row with no failure condition ...")
    function _rowMissing(kind, x) { const r = _ROW_RULES[kind]; if (!r || !x) return ''; let ok = true; try { ok = !!r.ok(x); } catch (_) { ok = false; } return ok ? '' : ('a' + (/^[aeiouAEIOU]|^FCIM|^FHA|^FMEA/.test(r.label) ? 'n ' : ' ') + r.label + ' with no ' + r.need.replace(/^an? /, '')); }
    function _actionMissing(a) { const k = _rowKindOf(a); return k ? _rowMissing(k, a) : ''; }
    // a writer called with nothing to write: say so once, and write nothing
    function _refuseEmpty(kind, x) { const m = _rowMissing(kind, x); if (!m) return false; try { _toast('Not written: ' + m + '.', 'warning'); } catch (_) {} return true; }
    // F1c batch (30 Aug 2026): the unified batch applies ops through these chat"""),
# ---- the executor: every accept (review panel, live chat, programmatic accept)
("""            if (!a || !a.op) { results.push({ ok: false, error: 'missing op' }); return; }
            const _offLane = _opLaneBlocked(a);""",
"""            if (!a || !a.op) { results.push({ ok: false, error: 'missing op' }); return; }
            const _empty = _actionMissing(a);   // 26 Oct 2026: a row with nothing in it is never written
            if (_empty) { results.push({ ok: false, blocked: true, error: 'not written: ' + _empty }); return; }
            const _offLane = _opLaneBlocked(a);"""),
# ---- the AI's reply: empty rows never reach the review panel (replaces the FHA-only filter)
("""        let _noCond = 0;
        for (let _i = actions.length - 1; _i >= 0; _i--) {
            const _x = actions[_i];
            if (_x && (_x.op === 'add_fha') && !String(_x.fcDesc || '').trim() && !String(_x.srcCondId || '').trim()) { actions.splice(_i, 1); _noCond++; }
        }
        if (_noCond) { try { console.info('[AI] ' + _noCond + ' drafted FHA row(s) named no failure condition and were left out'); } catch (_) {} }""",
"""        // 26 Oct 2026, across the board: every kind of row, by the one rule (_ROW_RULES), not the FHA alone.
        const _emptyBy = {};
        for (let _i = actions.length - 1; _i >= 0; _i--) {
            const _x = actions[_i], _m = _actionMissing(_x);
            if (_m) { actions.splice(_i, 1); const _k = _rowKindOf(_x); _emptyBy[_k] = (_emptyBy[_k] || 0) + 1; }
        }
        const _noCond = Object.keys(_emptyBy).reduce(function (n, k) { return n + _emptyBy[k]; }, 0);
        const _emptyWords = Object.keys(_emptyBy).map(function (k) { const r = _ROW_RULES[k]; return _emptyBy[k] + ' ' + r.label + (_emptyBy[k] === 1 ? '' : 's') + ' with no ' + r.need.replace(/^an? /, ''); }).join(', ');
        if (_noCond) { try { console.info('[AI] ' + _noCond + ' drafted row(s) were empty and left out: ' + _emptyWords); } catch (_) {} }"""),
("""                     + (_noCond ? (' **' + _noCond + ' drafted row' + (_noCond === 1 ? '' : 's') + ' named no failure condition and ' + (_noCond === 1 ? 'was' : 'were') + ' left out; draft those conditions again.**') : '');""",
"""                     + (_noCond ? (' **' + _noCond + ' drafted row' + (_noCond === 1 ? ' was' : 's were') + ' empty and left out (' + _emptyWords + '); draft ' + (_noCond === 1 ? 'it' : 'them') + ' again.**') : '');"""),
# ---- the writers the classic lanes call directly
("""    function _applyFcimSuggestion(s) {
        try {""",
"""    function _applyFcimSuggestion(s) {
        if (_refuseEmpty('fcim', s)) return false;   // 26 Oct 2026: the one rule (_ROW_RULES)
        try {"""),
("""    function _applyPra(x) {
        try {""",
"""    function _applyPra(x) {
        if (_refuseEmpty('pra', x)) return false;   // 26 Oct 2026: the one rule (_ROW_RULES)
        try {"""),
("""    function _applyZsa(x) {
        try {""",
"""    function _applyZsa(x) {
        if (_refuseEmpty('zsa', x)) return false;   // 26 Oct 2026: the one rule (_ROW_RULES)
        try {"""),
("""    function _applyCma(x) {
        try {""",
"""    function _applyCma(x) {
        if (_refuseEmpty('cma', x)) return false;   // 26 Oct 2026: the one rule (_ROW_RULES)
        try {"""),
("""    function _applyFmea(x) {
        try {""",
"""    function _applyFmea(x) {
        if (_refuseEmpty('fmea', x)) return false;   // 26 Oct 2026: the one rule (_ROW_RULES)
        try {"""),
("""    function _applyReqSuggestion(rq) {
        try {""",
"""    function _applyReqSuggestion(rq) {
        if (_refuseEmpty('req', rq)) return false;   // 26 Oct 2026: the one rule (_ROW_RULES)
        try {"""),
# the chat writers (reached through the executor, which already refused; kept so no path around it writes a blank)
("""        if (typeof acFunctionsData === 'undefined') return { ok: false, error: 'functions not loaded' };
        const row = { internalId: newRowId(), funcId: '', funcName: a.funcName || '',""",
"""        if (typeof acFunctionsData === 'undefined') return { ok: false, error: 'functions not loaded' };
        { const _m = _rowMissing('func.ac', a); if (_m) return { ok: false, blocked: true, error: 'not written: ' + _m }; }   // 26 Oct 2026
        const row = { internalId: newRowId(), funcId: '', funcName: a.funcName || '',"""),
("""            if (!sysObj) return { ok: false, error: 'system not found: ' + String(a.systemId) };
            if (!Array.isArray(sysObj.functions)) sysObj.functions = [];
            const row = { internalId: newRowId(), funcId: '', funcName: a.subName || a.funcName || '',""",
"""            if (!sysObj) return { ok: false, error: 'system not found: ' + String(a.systemId) };
            { const _m = _rowMissing('func.sys', a); if (_m) return { ok: false, blocked: true, error: 'not written: ' + _m }; }   // 26 Oct 2026
            if (!Array.isArray(sysObj.functions)) sysObj.functions = [];
            const row = { internalId: newRowId(), funcId: '', funcName: a.subName || a.funcName || '',"""),
("""    function _chatAddRouting(a, model) {
        if (typeof routingData === 'undefined') return { ok: false, error: 'routing not loaded' };""",
"""    function _chatAddRouting(a, model) {
        if (typeof routingData === 'undefined') return { ok: false, error: 'routing not loaded' };
        { const _m = _rowMissing('routing', a); if (_m) return { ok: false, blocked: true, error: 'not written: ' + _m }; }   // 26 Oct 2026"""),
("""    function _chatAddItem(a, model) {
        if (typeof itemsData === 'undefined') return { ok: false, error: 'items not loaded' };""",
"""    function _chatAddItem(a, model) {
        if (typeof itemsData === 'undefined') return { ok: false, error: 'items not loaded' };
        { const _m = _rowMissing('item', a); if (_m) return { ok: false, blocked: true, error: 'not written: ' + _m }; }   // 26 Oct 2026"""),
# the function breakdown: a function with no named sub-function is not written (it used to become "(general)")
("""            const subs = g.subs.length ? g.subs : [{ subName: '(general)', subDef: '' }];
            let added = 0;""",
"""            // 26 Oct 2026 (live Aeolus: AF-010 "Protect against fire" landed with a blank sub-function, SF-025, and the
            // FCIM then had nothing to break down). A sub-function with no name is not one, and a function with none
            // left is not written: the engineer is told which, to draft it again. Before, an empty list became a
            // placeholder "(general)" sub-function the model never proposed.
            const subs = (g.subs || []).filter(function (sub) { return sub && _has(sub.subName); });
            if (!_has(g.funcName) || !subs.length) { _toast('Not written: ' + (_has(g.funcName) ? ('"' + String(g.funcName).trim() + '" has no named sub-function') : 'a function with no name') + '. Draft it again, or add its sub-functions by hand.', 'warning'); return 0; }
            let added = 0;"""),
# ---- an AI edit that would empty a row
("""        const fields = a.fields || {};
        let changed = []; let diff = [];
        Object.keys(fields).forEach(function (k) { if (k !== 'internalId' && k !== '_id' && k !== 'aiGenerated') { diff.push({ field: k, from: row[k], to: fields[k] }); row[k] = fields[k]; changed.push(k); } });""",
"""        const fields = a.fields || {};
        let changed = []; let diff = [];
        // 26 Oct 2026: an edit that would leave the row with nothing in it (by the one rule, _ROW_RULES) is refused
        { const _k = _TABLE_KIND[a.table], _after = Object.assign({}, row, fields), _m = _k ? _rowMissing(_k, _after) : ''; if (_m && !(_k && _rowMissing(_k, row))) return { ok: false, blocked: true, error: 'not changed: it would leave ' + _m }; }
        Object.keys(fields).forEach(function (k) { if (k !== 'internalId' && k !== '_id' && k !== 'aiGenerated') { diff.push({ field: k, from: row[k], to: fields[k] }); row[k] = fields[k]; changed.push(k); } });"""),
]
for a, b in R:
    assert s.count(a) == 1, a[:110]
    s = s.replace(a, b)
for a, b in [("        markov_state:{ label: 'Markov state',       need: 'a name', ok: function (x) { return _has(x.name); } }\n", "        markov_state:{ label: 'Markov state',       need: 'a name', ok: function (x) { return _has(x.name); } },\n        resource:    { label: 'resource',           need: 'a name', ok: function (x) { return _has(x.name); } }\n"), ('    function _applyResource(x) {\n        try {', "    function _applyResource(x) {\n        if (_refuseEmpty('resource', x)) return false;   // 26 Oct 2026: the one rule (_ROW_RULES)\n        try {")]:
    assert s.count(a) == 1, a[:110]
    s = s.replace(a, b)
open(p, 'w').write(s); print('ok')
