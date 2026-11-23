/* ============================================================================
 * apx_bridge.js (SLApxBridge v1.0, 15 Nov 2026): what the Interdependence, MAC and CoFFE Autopilots send, carried to the
 * PASA and to the files that read today's stores. Step 5 of 5. Behind the same switch only our team sees.
 *
 * Waqas, 15 Nov 2026: the Autopilots ask, "the PASA only shows the results"; they "will be upgrading the current
 * MAC/CoFFE and Interdependence interface and replacing them, so we have to absolutely nail this"; weighted MAC rules:
 * "Retire it, convert exactly"; "those links must not get broken".
 *
 * WHAT HAPPENS WHEN AN AUTOPILOT IS SENT (project(fc, which)). Thirty-odd files read today's three stores directly
 * (the fault tree lanes, the FCIM, the reports, the PASA Autopilot, the PRA and ZSA Autopilots and more). They are not
 * rewritten: what was sent is written into those stores in the shape they already read, marked apx so it can be told
 * apart and taken back out (unproject).
 *   Interdependence -> projectConfig.interdep.cells: a checked function is asserted, every other one is cleared (the
 *       engineer reviewed it and left it out), signed with the sender's name; the common resource analysis text goes
 *       to projectConfig.interdep.cra. What the project's own data derives is left to the derivation.
 *   MAC -> projectConfig.macModels: ONE rule for the failure condition, id apx-mac-<failure condition>, carrying its
 *       exact breach sets (rule.apx.sets), which macBreachSetsChecked returns as they are. A total loss of a whole
 *       system function is that function's id; any other loss (a partial loss, one side, one assembly group) is a
 *       degraded token of its system, named in words. The earlier rule of the same aircraft function is moved to
 *       projectConfig.apx.archive (never deleted) when the failure condition sent is the one that rule stood for.
 *   CoFFE -> projectConfig.coffe.verdicts: every single and pair of whole-system failures the full table answers.
 *
 * WHAT THE PASA SHOWS (pasa(gr)): for a failure condition whose Autopilots were sent, the PASA appendix shows the
 * ARP4761A tables (Q.4-1, Q.4-2, B3, the MAC rules, Q.4-3 to Q.4-11, the gate, the budgets and the independence
 * principles) as report tables, so they print and export with the report.
 *
 * THE OLD SCREENS. With the switch on, the MAC model tab opens the MAC Autopilot and the CoFFE tab opens the CoFFE
 * Autopilot (today's MAC page stays one click away for comparison). With the switch off nothing here runs.
 *
 * API (window.SLApxBridge): project, unproject, pasa, check. Tests: tests/regression_apx_bridge_20261115.test.js.
 * ==========================================================================*/
(function (root) {
    'use strict';
    var VERSION = '1.5';   // 1.5 23 Nov 2026: a backup whose change-over can fail on its own goes to the PASA with its two ways (build table, gate, rule.apx.inside)   // 1.4 22 Nov 2026: a sent MAC rule names every function it is stated over (rule.apx.members), for the one reading of a MAC rule in misc_fn_modules.js   // 1.2 17 Nov 2026: what was sent can be taken back out one Autopilot at a time; the PSSA shows the assemblies and the lines the aircraft level added to its system
    var A = root.SLApxAuto, X = root.SLApx, M = root.SLApxMac, C = root.SLApxCof;
    if (!A || !A.kit || !X || !M || !M.model || !C || !C.model) { if (typeof module !== 'undefined' && module.exports) module.exports = { VERSION: VERSION, missing: true }; return; }
    var K = A.kit, S = K.S, T = K.T, arr = K.arr, safe = K.safe, lc = K.lc, MM = M.model, CM = C.model, AM = A.model;
    var SEC = '§', DOT = '·', AND = '∧';

    function pc() { return K.pc(); }
    function archive() { var s = K.store(); if (!s.archive || typeof s.archive !== 'object') s.archive = {}; if (!Array.isArray(s.archive.macModels)) s.archive.macModels = []; return s.archive; }
    function sentRec(which, fc) { var p = pc(), r = p && p.apx && p.apx[which] && p.apx[which][fc.key]; return r && r.sent ? r : null; }

    // ---- Interdependence -> today's cells and common resource text ----------------------------------------------------
    function projectIdp(fc) {
        var p = pc(), r = sentRec('idp', fc); if (!p || !r) return { n: 0 };
        if (!p.interdep || typeof p.interdep !== 'object') p.interdep = { cells: {}, cra: {} };
        if (!p.interdep.cells) p.interdep.cells = {}; if (!p.interdep.cra) p.interdep.cra = {};
        var n = 0, by = r.sent.by, at = r.sent.at;
        K.allCols().forEach(function (c) {
            var x = K.cellOf(fc, c), key = fc.key + SEC + c.colId;
            // what today's derivation says (a traced function, a traced failure condition, a resource provider) is left to it
            if (x.src === 'data' || K.derived(fc, c)) { var old = p.interdep.cells[key]; if (old && old.apx) delete p.interdep.cells[key]; return; }
            p.interdep.cells[key] = x.on ? { state: 'asserted', by: by, at: at, note: 'Interdependence Autopilot: ' + (x.role === 'fails' ? (x.how === 'malfunction' ? 'causes it by doing the wrong thing' : 'causes it by failing') : 'does the job'), apx: true } : { state: 'cleared', by: by, at: at, apx: true };
            n++;
        });
        AM.effectRows(fc).forEach(function (e) { [''].concat(K.picked(fc).map(function (c) { return c.colId; })).forEach(function (cid) { var t = AM.craText(fc, e.r, e.mode, cid), ck = fc.key + SEC + e.r.key + DOT + e.mode + SEC + cid; if (!t) return; if (!r.projCra || typeof r.projCra !== 'object') r.projCra = {}; if (!(ck in r.projCra)) r.projCra[ck] = ck in p.interdep.cra ? p.interdep.cra[ck] : null; p.interdep.cra[ck] = t; }); });
        return { n: n };
    }

    // ---- MAC -> one rule with its exact breach sets -------------------------------------------------------------------------
    function wholeFunction(d, ds) { return !d.named && ds.filter(function (x) { return x.colId === d.colId; }).length === 1; }
    function degLabel(d, st) { return MM.unitWords(d, st).replace(/^.*?: /, '') + ' lost'; }
    function token(d, st, ds) { return st === 'F' && wholeFunction(d, ds) ? d.funcId : 'deg:' + S(d.sysId) + ':' + (wholeFunction(d, ds) ? '' : d.name + ': ') + (st === 'F' ? 'all lost' : degLabel(d, st)); }
    function macSets(fc) {
        var sol = MM.solved(fc); if (!sol || sol.error || !sol.done) return null;
        var sets = MM.breaking(sol).map(function (c) { var s = []; for (var i = 0; i < c.length; i++) if (c[i] !== 'O') s.push(token(sol.ds[i], c[i], sol.ds)); return s.sort(); });
        return { sol: sol, sets: sets };
    }
    function ruleId(fc) { return 'apx-mac-' + fc.key; }
    function projectMac(fc) {
        var p = pc(), r = sentRec('mac', fc); if (!p || !r) return { ok: false };
        var ms = macSets(fc); if (!ms) return { ok: false };
        if (!Array.isArray(p.macModels)) p.macModels = [];
        var degraded = [], seen = {};
        ms.sets.forEach(function (s) { s.forEach(function (tok) { if (tok.indexOf('deg:') !== 0 || seen[tok]) return; seen[tok] = 1; var rest = tok.slice(4), i = rest.indexOf(':'); degraded.push({ sysId: rest.slice(0, i), label: rest.slice(i + 1), weight: 0, apx: true }); }); });
        var clauses = ms.sets.filter(function (s) { return s.every(function (t) { return t.indexOf('deg:') !== 0; }); }).map(function (s) { return { min: 1, of: s.slice() }; });
        var st = MM.macStatus(fc);
        // 23 Nov 2026: a loss that happens more than one way (a backup whose change-over can fail on its own) carries its ways
        var inside = {}; ms.sol.ds.forEach(function (d) { var w = MM.coWays ? MM.coWays(d) : null; if (w) inside[token(d, 'F', ms.sol.ds)] = { changeOver: d.co.name, ways: w.map(function (x) { return x.parts.slice(); }) }; });
        var rule = { id: ruleId(fc), level: 0, subId: fc.subId, phase: fc.phases || 'All phases', clauses: clauses, degraded: degraded,
            substantiation: { kind: st.k === 'backed' ? 'sdd' : 'assumption', ref: st.t, by: r.sent.by, at: r.sent.at }, floor: null, contributions: [],
            apx: { fcKey: fc.key, fcId: fc.fcId, sets: ms.sets, members: ms.sol.ds.map(function (d) { return d.funcId; }).filter(function (m, i, a) { return m && a.indexOf(m) === i; }), inside: inside, status: st.k, at: r.sent.at } };
        // the earlier rule of this aircraft function is retired (kept on file) when this failure condition is the one it stood for
        var forRule = K.fn('_macFcForRule'), moved = 0;
        p.macModels = p.macModels.filter(function (old) {
            if (!old || old.apx || S(old.subId) !== S(fc.subId)) return true;
            var g = forRule ? safe(function () { return forRule(old); }, null) : null;
            if (g && S(g.fcId) !== S(fc.fcId)) return true;
            archive().macModels.push({ rule: old, at: K.now(), by: r.sent.by, replacedBy: rule.id }); moved++;
            return false;
        });
        var at = p.macModels.findIndex(function (x) { return x && x.id === rule.id; });
        if (at === -1) p.macModels.push(rule); else p.macModels[at] = rule;
        return { ok: true, rule: rule, archived: moved };
    }

    // ---- CoFFE -> today's signed verdicts (singles and pairs of whole-system failures) --------------------------------------
    function projectCof(fc) {
        var p = pc(), r = sentRec('cof', fc); if (!p || !r) return { n: 0 };
        var sol = CM.solved(fc); if (!sol || sol.error || !sol.done) return { n: 0 };
        if (!p.coffe || typeof p.coffe !== 'object') p.coffe = { verdicts: {} }; if (!p.coffe.verdicts) p.coffe.verdicts = {};
        var V = p.coffe.verdicts, pre = fc.key + SEC, n = 0;
        Object.keys(V).forEach(function (k) { if (k.indexOf(pre) === 0 && V[k] && V[k].apx) delete V[k]; });
        var perSys = {}; sol.ds.forEach(function (d) { if (!d.isM) perSys[d.sysId] = (perSys[d.sysId] || 0) + 1; });
        sol.cases.forEach(function (c) {
            var parts = [];
            for (var i = 0; i < c.length; i++) { var s = c[i], d = sol.ds[i]; if (s === 'O') continue; if (!d.isM && perSys[d.sysId] !== 1) return; parts.push(S(d.sysId) + '=' + (s === 'M' ? 'malfunction' : s === 'F' ? 'total loss' : 'partial loss')); }
            if (!parts.length || parts.length > 2) return;
            var sys = parts.map(function (x) { return x.slice(0, x.lastIndexOf('=')); }); if (sys.length === 2 && sys[0] === sys[1]) return;
            var key = pre + parts.sort().join(AND);
            // a side-specific partial loss maps to the same key twice: the worse answer stands
            var yes = sol.lvl[c] === sol.FL, old = V[key];
            if (old && !old.apx) { if (!Array.isArray(archive().verdicts)) archive().verdicts = []; archive().verdicts.push({ key: key, verdict: old, at: K.now() }); }
            if (old && old.apx && old.verdict === 'yes' && !yes) return;
            V[key] = { verdict: yes ? 'yes' : 'no', by: r.sent.by, at: r.sent.at, note: 'CoFFE Autopilot: ' + CM.levelName(fc, sol, sol.lvl[c]), apx: true }; n++;
        });
        return { n: n };
    }
    function project(fc, which) {
        if (!A.enabled()) return { ok: false, why: 'The switch is off.' };
        var out = which === 'idp' ? projectIdp(fc) : which === 'mac' ? projectMac(fc) : which === 'cof' ? projectCof(fc) : null;
        try { if (root.SLDataChange && root.SLDataChange.bump) root.SLDataChange.bump(); } catch (_) {}
        return out;
    }
    // Takes back out everything a failure condition's Autopilots wrote into today's stores, and puts the retired rule back.
    // which: 'idp', 'mac' or 'cof'; left out, all three.
    function unproject(fc, which) {
        var p = pc(); if (!p) return;
        var all = !which, ar = p.apx && p.apx.archive;
        if (all || which === 'idp') {
            if (p.interdep && p.interdep.cells) Object.keys(p.interdep.cells).forEach(function (k) { if (k.indexOf(fc.key + SEC) === 0 && p.interdep.cells[k] && p.interdep.cells[k].apx) delete p.interdep.cells[k]; });
            var ir = p.apx && p.apx.idp && p.apx.idp[fc.key];
            if (ir && ir.projCra && p.interdep && p.interdep.cra) { Object.keys(ir.projCra).forEach(function (ck) { if (ir.projCra[ck] === null) delete p.interdep.cra[ck]; else p.interdep.cra[ck] = ir.projCra[ck]; }); delete ir.projCra; }
        }
        if (all || which === 'mac') {
            if (Array.isArray(p.macModels)) p.macModels = p.macModels.filter(function (r) { return !(r && r.apx && S(r.apx.fcKey) === fc.key); });
            if (ar && Array.isArray(ar.macModels)) { ar.macModels.filter(function (x) { return x.replacedBy === ruleId(fc) && !x.restored; }).forEach(function (x) { if (!Array.isArray(p.macModels)) p.macModels = []; if (!p.macModels.some(function (r) { return r && r.id === x.rule.id; })) p.macModels.push(x.rule); x.restored = K.now(); }); }
        }
        if (all || which === 'cof') {
            if (p.coffe && p.coffe.verdicts) Object.keys(p.coffe.verdicts).forEach(function (k) { if (k.indexOf(fc.key + SEC) === 0 && p.coffe.verdicts[k] && p.coffe.verdicts[k].apx) delete p.coffe.verdicts[k]; });
            if (ar && Array.isArray(ar.verdicts) && p.coffe && p.coffe.verdicts) ar.verdicts.forEach(function (x) { if (x.key.indexOf(fc.key + SEC) === 0 && !x.restored && !p.coffe.verdicts[x.key]) { p.coffe.verdicts[x.key] = x.verdict; x.restored = K.now(); } });
        }
        try { if (root.SLDataChange && root.SLDataChange.bump) root.SLDataChange.bump(); } catch (_) {}
        K.save();
    }

    // ---- the links: checked, never removed -----------------------------------------------------------------------------------
    // Writes down every reason a link needs review, so it is on file and not only on screen. Returns how many need review.
    function check() {
        var p = pc(), n = 0; if (!p || !p.apx || !p.apx.mac) return 0;
        K.fcs().forEach(function (fc) {
            var r = p.apx.mac[fc.key]; if (!r || !r.links) return;
            var live = {}; safe(function () { MM.allEvents(fc).forEach(function (e) { live[e.k] = e; }); }, null);
            Object.keys(r.links).forEach(function (k) {
                var l = r.links[k]; if (!l) return;
                var st = live[k] ? safe(function () { return MM.linkState(fc, live[k]); }, null) : null;
                var why = st ? st.review : 'Its loss is no longer one of this failure condition\'s losses.';
                if (why && !l.review) l.review = why;
                if (l.review) n++;
            });
        });
        return n;
    }

    // ---- the PASA: the tables of the book as report tables ---------------------------------------------------------------------
    function colTitle(c) { return c.sysName + ' (' + c.funcId + ' - ' + c.fnName + ')'; }
    function uniq(names) { var seen = {}; return names.map(function (n) { var k = n, i = 2; while (seen[k]) k = n + ' (' + (i++) + ')'; seen[k] = 1; return k; }); }
    function fcOfGroup(gr) { return gr && gr.gov ? AM.fcOf(S(gr.gov.internalId)) : null; }
    function idpBlocks(fc) {
        var cols = K.picked(fc), f = fc.fcId, names = uniq(cols.map(colTitle)), b = [];
        var row = { 'AC Function': K.acFnLabel(fc), 'AC FC ID': f, 'AC FC Description': fc.desc }; names.forEach(function (n) { row[n] = 'X'; });
        b.push({ k: 'table', name: 'apx-q41-' + f, title: 'Interdependence table for ' + f + '', rows: [row], lead: '{N} is the interdependence table for ' + f + ': the system functions that do the job or cause it by failing. A function that is not shown was reviewed and left out. Signed by ' + sentRec('idp', fc).sent.by + ' on ' + S(sentRec('idp', fc).sent.at).slice(0, 10) + '. AC is aircraft; FC is failure condition.' });
        return b;
    }
    function resBlocks(fc) {
        var cols = K.picked(fc), names = uniq(cols.map(colTitle)), rs = K.resPicked(fc), f = fc.fcId, b = [];
        if (!rs.length) { b.push({ k: 'p', text: 'No shared resource was checked for ' + f + ' in the Interdependence Autopilot.' }); return b; }
        b.push({ k: 'table', name: 'apx-q42-' + f, title: 'Interdependence (common resource) table for ' + f + '', rows: rs.map(function (r, k) { var st = K.resState(fc, r), row = { 'Common sources and resources': 'R' + (k + 1) + '. ' + r.name }; cols.forEach(function (c, i) { row[names[i]] = st.feeds[c.colId] ? 'x' : '--'; }); return row; }), lead: '{N} shows which shared resource feeds which system function for ' + f + ' (x: it does; --: it does not). Status: ' + AM.resStatus(fc).t + '.' });
        var er = AM.effectRows(fc);
        if (er.length) b.push({ k: 'table', name: 'apx-b3-' + f, title: 'Common resource analysis for ' + f + '', rows: er.map(function (e) { var st = K.resState(fc, e.r), row = { 'Common resource': e.r.name, 'Failure mode': e.mode }; cols.forEach(function (c, i) { row[names[i]] = st.feeds[c.colId] ? (AM.craText(fc, e.r, e.mode, c.colId) || 'Not answered') : '--'; }); row['AC-level effect on FC'] = AM.craText(fc, e.r, e.mode, '') || 'Not answered'; return row; }), lead: '{N} is the common resource analysis: what each failure of a shared resource does to each system function it feeds, and what that adds up to for the aircraft.' });
        return b;
    }
    function macBlocks(fc) {
        var sol = MM.solved(fc), f = fc.fcId, b = []; if (!sol || sol.error || !sol.done) return b;
        var r = MM.peek(fc.key) || {}, why = r.why || {}, st = MM.macStatus(fc), rules = MM.rules(sol);
        b.push({ k: 'p', text: 'Minimum acceptable configuration for ' + f + '. Status: ' + st.t + '. Signed by ' + r.sent.by + ' on ' + S(r.sent.at).slice(0, 10) + '. Evidence for the answers: ' + (T(r.ev) || 'none given') + '.' });
        b.push({ k: 'table', name: 'apx-build-' + f, title: 'How each assembly group is built, for ' + f, rows: sol.ds.map(function (d) { var g = d.g; return { 'Assembly group': d.name + (d.named ? ' (' + d.sysName + ')' : ''), ID: g.id, Build: d.P.label, Assemblies: d.units.map(function (u, k) { var x = g.units[k] || {}; return u + (x.side && x.side !== 'C' ? ' (' + x.side + ')' : ''); }).join(', '), 'Does it matter which one is lost': d.pos === 'same' ? 'No' : d.pos === 'mirror' ? 'Left and right mirror' : 'Yes, each one', 'Can the change-over fail on its own': d.g.pattern !== 'backup' ? 'Not a backup build' : !d.co ? 'Not answered' : d.co.yes ? 'Yes: ' + d.co.name + '. Not working is both lost, or ' + d.units[0] + ' lost with it failing' : 'No', 'Where the build comes from': (g.src === 'sdd' ? 'The SDD' : g.src === 'doc' ? 'A design document, accepted by ' + g.by : g.src === 'told' ? 'The engineer\'s words through the AI, accepted by ' + g.by : 'Set by hand by ' + g.by) + (g.ref ? ': ' + g.ref : ''), 'Against the SDD': !g.sdd ? 'Not compared yet' : g.sdd.pattern === g.pattern ? 'Same' : g.resolve === 'dispute' ? 'Different: raised with the design team' : 'Different' }; }), lead: '{N} is the build each answer rests on.' });
        b.push(rules.length ? { k: 'table', name: 'apx-mac-' + f, title: 'Minimum acceptable configuration rules for ' + f, rows: rules.map(function (x) { return { 'If this is lost': MM.ruleWords(x.c, sol.ds) + (x.mirror ? '. Mirror image, same answer: ' + MM.ruleWords(x.mirror, sol.ds) : ''), Result: fc.desc, Why: T(why[x.c]) || 'Not given' }; }), lead: '{N} lists the named combinations of assemblies that break ' + f + ': the smallest mixes. Anything bigger breaks it too.' } : { k: 'p', text: 'No mix of these losses breaks ' + f + '.' });
        var alone = MM.aloneMalf(fc); if (alone.length) b.push({ k: 'p', text: 'Wrong actions that cause ' + f + ' alone: ' + MM.joinAnd(alone.map(function (m) { return m.sysName + ' (' + lc(m.fnName) + ')'; })) + '. Each is its own branch in the fault tree.' });
        var evs = MM.linkEvents(fc);
        if (evs.length) b.push({ k: 'table', name: 'apx-links-' + f, title: 'Links from the ' + f + ' rules down to the system failure conditions', rows: evs.map(function (e) { var s0 = MM.linkState(fc, e), l = s0.link; return { 'Loss in the rules': e.what, Link: l ? l.id : 'Not linked yet', 'System failure condition': l ? S(l.fcId) + (s0.target ? ' ' + T(s0.target.gov.fcDesc || '') : ' (no longer in the system FHA)') : '', 'Its fault tree': !l ? '' : !s0.tree ? 'None yet' : s0.built ? 'Built' : 'Its top event only', State: !l ? 'Open' : s0.review ? 'Needs review: ' + s0.review : 'Linked' }; }), lead: '{N} shows where each loss named in the rules is explained: a system failure condition and its fault tree. There is no MAC below the aircraft level.' });
        return b;
    }
    function caseRow(fc, sol, heads, c) { var row = {}; c.split('').forEach(function (s, i) { var d = sol.ds[i]; row[heads[i]] = (X.isPartial(s) ? 'D' : s) + (s === 'A' || s === 'B' ? ' (' + d.units[s === 'A' ? 0 : 1] + ' lost)' : ''); }); return row; }
    function cofBlocks(fc) {
        var sol = CM.solved(fc), f = fc.fcId, b = []; if (!sol || sol.error || !sol.done) return b;
        var r = CM.peek(fc.key) || {}, heads = uniq(sol.ds.map(function (d) { return CM.codeOf(d, fc); })), res = CM.resName(fc), R = CM.ffRows(fc);
        var ff = function (rows) { return rows.map(function (x) { return { 'System functional failure': x.id + ' - ' + x.text, 'Associated system failure condition (SFHA)': x.sfha || 'Not linked yet' }; }); };
        if (R.total.length) b.push({ k: 'table', name: 'apx-q43-' + f, title: 'System functional failures and SFHA failure conditions, total loss', rows: ff(R.total), lead: '{N} links each total loss to its system FHA failure condition.' });
        if (R.partial.length) b.push({ k: 'table', name: 'apx-q44-' + f, title: 'System functional failures and SFHA failure conditions, partial loss', rows: ff(R.partial), lead: '{N} links each partial loss to its system FHA failure condition.' });
        if (R.malf.length) b.push({ k: 'table', name: 'apx-q45-' + f, title: 'System functional failures and SFHA failure condition, malfunction', rows: ff(R.malf), lead: '{N} links each malfunction to its system FHA failure condition.' });
        b.push({ k: 'table', name: 'apx-q46-' + f, title: 'CoFFE table for ' + f + '', rows: sol.cases.map(function (c, i) { var row = { 'Case #': String(i + 1) }, cr = caseRow(fc, sol, heads, c); heads.forEach(function (h) { row[h] = cr[h]; }); row[res] = CM.levelName(fc, sol, sol.lvl[c]); return row; }), lead: '{N} is every mix of failed (F), degraded (D)' + (sol.ds.some(function (d) { return d.isM; }) ? ', malfunctioning (M)' : '') + ' and operational (O) with its result. Signed by ' + r.sent.by + ' on ' + S(r.sent.at).slice(0, 10) + '.' });
        var sum = CM.summary(fc, sol), srows = [];
        for (var lv = sol.FL; lv >= 0; lv--) { var rs = sum.filter(function (x) { return x.level === lv; }), con = CM.conclusions(fc, rs, lv, sol), last = ''; rs.forEach(function (x, j) { var row = caseRow(fc, sol, heads, x.c); row[res] = CM.levelName(fc, sol, lv); if (con[j] && con[j].t) last = con[j].t; row.Conclusion = lv === 0 ? '' : last; srows.push(row); }); }
        b.push({ k: 'table', name: 'apx-q47-' + f, title: 'CoFFE table summary for ' + f + '', rows: srows, lead: '{N} is the summary: for each worse outcome the smallest mixes that cause it, and for the best outcome the most that can be lost.' });
        var fr = CM.fcRows(fc, sol);
        if (fr.length) b.push({ k: 'table', name: 'apx-q48-' + f, title: 'CoFFE table result: ' + CM.outcomeName(fc, 0) + '', rows: fr.map(function (x) { var row = caseRow(fc, sol, heads, x.c); row[res] = CM.outcomeName(fc, 0); return row; }), lead: '{N} is the result for the failure condition itself.' });
        var sr = CM.shortest(fc, sol);
        b.push({ k: 'p', text: sr ? 'Shortest route to ' + lc(CM.outcomeName(fc, 0)) + ': ' + sr.order + ' failure' + (sr.order > 1 ? 's together' : ' alone') + ' (' + sr.routes.join('; or ') + '). ' + (sr.single ? 'Finding: a single failure causes a ' + fc.sev + ' failure condition. That is not allowed; the design has to change.' : sr.order === 1 ? 'A single failure causes it.' : 'No single failure causes it.') : 'No mix of these failures causes ' + lc(CM.outcomeName(fc, 0)) + '.' });
        var g = CM.gate(fc, sol), alone = MM.aloneMalf(fc);
        if (g) {
            var ev = function (e) { var d = CM.colById(sol, e.col); return CM.ffId(fc, d.isM ? d.colId : d.id, e.st) + ' ' + CM.evWords(d, e.st); };
            b.push({ k: 'p', text: 'The gate under ' + f + ': ' + f + ' happens when ' + (g.shape === 'core-any' ? MM.joinAnd(g.core.map(ev)) + ' happens together with any one of: ' + g.any.map(ev).join('; ') : 'any one of these combinations happens: ' + g.sets.map(function (s) { return s.map(ev).join(' and '); }).join('; or ')) + (alone.length ? '; or when ' + MM.joinAnd(alone.map(function (m) { return m.sysName; })) + ' does the wrong thing, alone' : '') + '.' });
            var mc = CM.mathCheck(fc, sol), bud = r.budgets || {};
            b.push({ k: 'table', name: 'apx-bud-' + f, title: 'Probability budgets for the events under ' + f, rows: CM.gateEvents(g).map(function (e) { var k = e.col + '|' + e.st; return { Event: ev(e), 'Budget per flight hour': bud[k] ? CM.fmt(bud[k]) : 'Not given yet' }; }), lead: '{N} lists the budget given to each event.' + (sol.ds.some(function (d) { return MM.coWays && MM.coWays(d); }) ? ' A loss that can happen two ways (both units lost, or the unit in use lost with its change-over failing) has one budget that covers both.' : '') + (mc && mc.p != null ? ' Together they give ' + CM.fmt(mc.p) + ' per flight hour' + (mc.target != null ? ', ' + (mc.ok ? 'within' : 'over') + ' the ' + CM.fmt(mc.target) + ' objective' : '') + ', taking the events as independent.' : ' The math is checked once every event has one.') });
            var ip = CM.indepList(fc, sol).filter(function (x) { return x.on && !x.single; });
            if (ip.length) b.push({ k: 'table', name: 'apx-ind-' + f, title: 'Independence principles for ' + f, rows: ip.map(function (x) { return { ID: 'PASA-' + x.key, Principle: x.text }; }), lead: '{N} lists the independence the gate relies on. Each goes to the common cause analyses.' });
            var P = CM.pairs(fc, sol);
            if (P && P.rows && P.rows.length) {
                var w = P.shape === 'pairs' ? 2 : P.width, prow = function (x) { var row = { Cases: String(x.n) }; for (var i = 0; i < w; i++) row['Failure ' + (i + 1)] = x.parts[i] || '--'; return row; };
                b.push({ k: 'table', name: 'apx-q49-' + f, title: 'Potential failure combinations for ' + f + '', rows: P.rows.map(prow), lead: '{N} lists every combination of failures that causes ' + f + ', with the shared resources from the interdependence table added.' });
                var n = 10; K.resPicked(fc).forEach(function (rr) { var same = P.rows.filter(function (x) { return x.same === rr.key; }); if (same.length) { b.push({ k: 'table', name: 'apx-q4' + n + '-' + f, title: rr.name + ' common source failures for ' + f + '', rows: same.map(prow), lead: '{N} lists the combinations where every failure comes from ' + lc(rr.name) + '. No single failure or event may result in the loss of all of it.' }); n++; } });
            } else if (P && P.shape === 'over') b.push({ k: 'p', text: P.why });
        }
        return b;
    }
    // What the PASA appendix shows for one failure condition: null for a part whose Autopilot was not sent.
    function pasa(gr) {
        if (!A.enabled()) return null;
        var fc = fcOfGroup(gr); if (!fc) return null;
        var out = { idp: null, res: null, mac: null, cof: null, changed: [] };
        ['idp', 'mac', 'cof'].forEach(function (w) { var p = pc(), r = p && p.apx && p.apx[w] && p.apx[w][fc.key]; if (r && !r.sent && r.changedSince) out.changed.push(w === 'idp' ? 'Interdependence' : w === 'mac' ? 'MAC' : 'CoFFE'); });
        if (sentRec('idp', fc)) { out.idp = safe(function () { return idpBlocks(fc); }, null); out.res = safe(function () { return resBlocks(fc); }, null); }
        if (sentRec('mac', fc)) out.mac = safe(function () { return macBlocks(fc); }, null);
        if (sentRec('cof', fc)) out.cof = safe(function () { return cofBlocks(fc); }, null);
        return out.idp || out.mac || out.cof || out.changed.length ? out : null;
    }
    // ---- the PSSA: what the aircraft level added to this system (apx_mac.js: the assemblies, the FHA lines) -----------------
    function linksTo(sy, fcId) {
        var p = pc(), out = []; if (!p || !p.apx || !p.apx.mac) return out;
        K.fcs().forEach(function (fc) { var r = p.apx.mac[fc.key]; if (!r || !r.links) return; Object.keys(r.links).forEach(function (k) { var l = r.links[k]; if (l && S(l.sysId) === S(sy.id) && S(l.fcId) === S(fcId)) out.push({ fc: fc, k: k, link: l }); }); });
        return out;
    }
    function pssa(sy) {
        if (!A.enabled() || !sy) return null;
        var b = [], asm = arr(sy.assemblies).filter(function (a) { return a && a.apx; }), nm = T(sy.name || sy.id);
        var fnName = function (id) { var f = arr(sy.functions).filter(function (x) { return x && S(x.funcId) === S(id); })[0]; return f ? T(f.funcName || id) : S(id); };
        if (asm.length) b.push({ k: 'table', name: 'apx-asm-' + S(sy.id), title: 'The assemblies of the ' + nm + ', as set at the aircraft level', rows: asm.map(function (a) { return { ID: a.id, Assembly: a.name, Side: a.side === 'LH' ? 'Left' : a.side === 'RH' ? 'Right' : 'Center or not sided', Group: a.group || 'The system as one group', Build: (M.PATTERNS[a.build] || {}).label || a.build, 'System function': fnName(a.funcId) }; }), lead: '{N} lists the assemblies the aircraft-level minimum acceptable configuration (MAC) was answered for. The fault trees of this system start from the same assemblies, under the same IDs.' });
        var wait = arr(sy.fha).filter(function (r) { return r && r.apx && !T(r.severity); });
        if (wait.length) b.push({ k: 'table', name: 'apx-wait-' + S(sy.id), title: 'Failure conditions added from the aircraft level, waiting to be classified', rows: wait.map(function (r) { return { ID: S(r.fcId), 'Failure condition': T(r.fcDesc), 'System function': fnName(r.sysFuncId || r.subId), 'Came from': T(r.acTrace), 'What the aircraft-level work says': T(r.effAc) || 'Nothing yet: the MAC or the CoFFE for it is not finished', Severity: 'Not classified yet' }; }), lead: '{N} lists the lines the aircraft-level work added to this system\'s FHA. The tool does not set their severity: one loss is a contributor, and what it is worth depends on what else still works. Each gets its appendix here once the system FHA classifies it Minor or above.' });
        return b.length ? { front: b } : null;
    }
    function pssaFc(sy, gr) {
        if (!A.enabled() || !sy || !gr) return null;
        var ls = linksTo(sy, gr.fcId), b = []; if (!ls.length) return null;
        ls.forEach(function (x) {
            var e = safe(function () { return MM.allEvents(x.fc).filter(function (y) { return y.k === x.k; })[0]; }, null);
            var asm = e && e.d && e.d.g ? arr(e.d.g.units).map(function (u, i) { return (u.id || '') + ' ' + (e.d.units[i] || ''); }) : [];
            b.push({ k: 'p', text: gr.fcId + ' is a loss named at the aircraft level for ' + x.fc.fcId + ' ' + x.fc.desc + ' (link ' + x.link.id + ')' + (e ? ': ' + e.what + '.' : '.') + (asm.length ? ' Its fault tree starts from these assemblies: ' + asm.join(', ') + (e.d.P ? ' (' + lc(e.d.P.label) + ').' : '.') : '') + (x.link.review ? ' The link needs review: ' + x.link.review : '') });
        });
        return b;
    }
    function state(gr) { var fc = fcOfGroup(gr); if (!fc || !A.enabled()) return null; return { key: fc.key, idp: K.apStatus('idp', fc).k, mac: K.apStatus('mac', fc).k, cof: K.apStatus('cof', fc).k }; }

    // ---- the old screens: with the switch on, the MAC and CoFFE tabs open the Autopilots ----------------------------------------
    (function wrapNav(tries) {
        if (typeof document === 'undefined') return;
        if (typeof root.switchTab !== 'function') { if (tries > 0) setTimeout(function () { wrapNav(tries - 1); }, 150); return; }
        if (root.switchTab._apxBridge) return;
        var orig = root.switchTab, w = function (tabId) {
            try { if (A.enabled() && !A._ui.old && (tabId === 'mac' || tabId === 'coffe')) { A.open(tabId === 'mac' ? 'mac' : 'cof'); return undefined; } } catch (_) {}
            var r = orig.apply(this, arguments);
            try { if (A.enabled() && tabId === 'mac') placeBack(); if (A.enabled() && (tabId === 'pasa' || tabId === 'interdep')) check(); } catch (_) {}
            return r;
        };
        w._apxBridge = true; Object.keys(orig).forEach(function (k) { try { w[k] = orig[k]; } catch (_) {} });
        root.switchTab = w;
    })(80);
    // today's MAC page (opened for comparison) carries the way back to the Autopilot
    function placeBack() {
        var v = document.getElementById('view-mac'); if (!v || v.querySelector(':scope > [data-apx-macback]')) return;
        K.style();
        var b = document.createElement('div'); b.className = 'apx'; b.setAttribute('data-apx-macback', '1');
        b.innerHTML = '<div class="apx-bar"><div class="apx-sw" role="group" aria-label="Which page"><button type="button" data-apx-macnew="1">New Autopilot (preview)</button><button type="button" class="on">Today\'s page</button></div><span style="font-size:12.5px">Only our team sees this switch.</span></div>';
        b.addEventListener('click', function (e) { var t = e.target && e.target.closest ? e.target.closest('[data-apx-macnew]') : null; if (t) A.open('mac'); });
        v.insertBefore(b, v.firstChild);
    }

    var api = { VERSION: VERSION, project: project, unproject: unproject, pssa: pssa, pssaFc: pssaFc, linksTo: linksTo, pasa: pasa, state: state, check: check, ruleId: ruleId, macSets: macSets, blocks: { idp: idpBlocks, res: resBlocks, mac: macBlocks, cof: cofBlocks } };
    try { root.SLApxBridge = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
