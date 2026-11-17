/* ============================================================================
 * apx_coffe.js (SLApxCof v1.0, 15 Nov 2026): the CoFFE Autopilot (combined functional failure effects). Step 4 of 5 of
 * the Interdependence, MAC and CoFFE Autopilots. It registers on the page the three share (apx_autopilots.js), takes its
 * columns from the MAC Autopilot (apx_mac.js) and does its math in apx_engine.js. Behind the same switch only our team
 * sees; it saves in projectConfig.apx.cof.
 *
 * Waqas, 15 Nov 2026: "while you are at it understand the CoFFE analysis too please"; the tables are "exactly" those of
 * the ARP4761A contiguous example: Tables Q.4-3, Q.4-4 and Q.4-5 (each system functional failure against its system FHA
 * failure condition), Table Q.4-6 (every mix of F, D and O with its result), Table Q.4-7 (the summary), Table Q.4-8
 * (the result for the failure condition), Figure Q.4-1 (the gate under the failure condition) and Tables Q.4-9 to
 * Q.4-11 (the pairs of failures, and the pairs that share one resource). The engineer names the outcomes and answers
 * the questions the tool cannot work out; the table, the summary, the gate and the pairs are worked out, never typed.
 * The MAC's answer is outlined on each question; an answer that differs from it is a finding. A wrong action that only
 * matters with other failures has its own column (M); the MAC has no answer there, so the engineer answers.
 *
 * The record of one failure condition (projectConfig.apx.cof[<governing row internalId>]):
 *   sig       the columns the answers were given for; a change sets the answers aside (kept in stale)
 *   outcomes  [worst ... best]; the first is the failure condition itself;  resultName: the result column's name
 *   a1        { case: 0 | 1 }       does this mix cause the failure condition
 *   a2        { case: level }       for the mixes that do not: which lesser outcome (0 = the best)
 *   hist      [[ 'a1' | 'a2', [cases] ]]   what each answer wrote (for undo)
 *   budgets   { '<column>|<state>': probability }     indep: { key: false } an independence principle turned down
 *   sent      { by, at }
 *
 * API (window.SLApxCof): model, act. Tests: tests/regression_apx_coffe_20261115.test.js.
 * ==========================================================================*/
(function (root) {
    'use strict';
    var VERSION = '1.1';   // 1.1 17 Nov 2026: the functional failures are the lines the tool added to each system's FHA; each line's effect on its own is written from the CoFFE table
    var A = root.SLApxAuto, X = root.SLApx, M = root.SLApxMac;
    if (!A || !A.kit || !X || !M || !M.model) { if (typeof module !== 'undefined' && module.exports) module.exports = { VERSION: VERSION, missing: true }; return; }
    var K = A.kit, E = K.E, S = K.S, T = K.T, arr = K.arr, safe = K.safe, lc = K.lc, MM = M.model, note = M.note, joinAnd = MM.joinAnd;
    var PER = 27, COMBO_CAP = 2000;

    function apx() { return K.store(); }
    function rec(fcKey) {
        var s = apx(); if (!s.cof || typeof s.cof !== 'object') s.cof = {};
        var r = s.cof[fcKey]; if (!r || typeof r !== 'object') r = s.cof[fcKey] = {};
        ['a1', 'a2', 'budgets', 'indep'].forEach(function (k) { if (!r[k] || typeof r[k] !== 'object') r[k] = {}; });
        if (!Array.isArray(r.hist)) r.hist = [];
        if (!Array.isArray(r.outcomes) || r.outcomes.length < 2) r.outcomes = ['', ''];
        return r;
    }
    function peek(fcKey) { var p = K.pc(); return (p && p.apx && p.apx.cof && p.apx.cof[fcKey]) || null; }
    function touched(fcKey) { var r = rec(fcKey); if (r.sent) { r.changedSince = { at: K.now() }; r.wasSent = r.sent; delete r.sent; } K.save(); }

    // ---- columns: the MAC's loss columns, then one "doing the wrong thing" column per combined malfunction ---------------
    function cofCols(fc) {
        var ds = MM.macCols(fc).slice();
        MM.comboMalf(fc).forEach(function (m) { ds.push({ id: m.colId + '#M', colId: m.colId, gid: 'M', g: null, isM: true, sysId: m.sysId, sysName: m.sysName, fnName: m.fnName, funcId: m.funcId, named: false, name: m.sysName + ' malfunction', set: true, P: null, pos: 'same', states: ['M', 'O'], sided: false, units: [] }); });
        return ds;
    }
    function ready(fc) { var ds = cofCols(fc); return ds.length > 0 && ds.every(function (d) { return d.set; }); }
    function engineCols(ds) { return X.columns(ds.map(function (d) { return { id: d.id, states: d.states, sided: d.sided, units: d.units, label: d.name }; })); }
    function outcomes(fc) { var r = peek(fc.key); return r && Array.isArray(r.outcomes) && r.outcomes.length >= 2 ? r.outcomes.map(T) : [fc.desc, '']; }
    function outcomeName(fc, i) { var o = outcomes(fc); return i === 0 ? (o[0] || fc.desc) : o[i]; }
    function topLevel(fc) { return outcomes(fc).length - 1; }
    function named(fc) { return outcomes(fc).slice(1).every(function (x) { return !!x; }); }
    function mirrorOn(fc) { var r = MM.peek(fc.key); return !r || r.mirror !== false; }
    function sigOf(fc, ds) { return ds.map(function (d) { return d.id + ':' + d.states.join('') + ':' + (d.sided ? 1 : 0); }).join('|') + '|o' + outcomes(fc).length + '|m' + (mirrorOn(fc) ? 1 : 0); }
    function sync(fc) {
        var r0 = peek(fc.key); if (!r0 || !ready(fc)) return;
        var sg = sigOf(fc, cofCols(fc)); if (r0.sig === sg) return;
        var r = rec(fc.key), had = Object.keys(r.a1).length + Object.keys(r.a2).length > 0;
        if (r.sig && had) { r.stale = { sig: r.sig, a1: r.a1, a2: r.a2, at: K.now() }; r.a1 = {}; r.a2 = {}; r.hist = []; r.asked = 'again'; if (r.sent) { r.changedSince = { at: K.now() }; r.wasSent = r.sent; delete r.sent; } }
        r.sig = sg;
    }
    // Every case with its level: the top level is the failure condition, 0 is the best outcome.
    function solved(fc) {
        if (!ready(fc)) return null;
        sync(fc);
        var ds = cofCols(fc), cols = engineCols(ds), r = peek(fc.key) || {}, a1 = r.a1 || {}, a2 = r.a2 || {}, FL = topLevel(fc), cases, s1;
        try { cases = X.cases(cols); s1 = X.solve(cols, a1, { lo: 0, hi: 1, among: cases }); } catch (e) { return { ds: ds, cols: cols, error: e && e.message ? e.message : String(e) }; }
        var lvl = {}, src = {}, from = {}, open2 = [], sub = [];
        cases.forEach(function (c) { var x = s1.by[c]; if (x.level === 1) { lvl[c] = FL; src[c] = x.src; from[c] = x.from; } else if (x.level === 0) sub.push(c); });
        if (s1.done) {
            if (FL <= 1) sub.forEach(function (c) { lvl[c] = 0; src[c] = s1.by[c].src; from[c] = s1.by[c].from; });
            else { var s2 = X.solve(cols, a2, { lo: 0, hi: FL - 1, among: sub }); sub.forEach(function (c) { var y = s2.by[c]; if (y.level != null) { lvl[c] = y.level; src[c] = y.src === 'you' || s1.by[c].src === 'you' ? 'you' : 'logic'; from[c] = y.from; } else open2.push(c); }); }
        }
        return { ds: ds, cols: cols, cases: cases, a1: a1, a2: a2, s1: s1, sub: sub, lvl: lvl, src: src, from: from, open1: s1.open, open2: open2, p1done: s1.done, done: s1.done && open2.length === 0, FL: FL };
    }
    function next(sol) {
        if (!sol || sol.error) return null;
        if (!sol.p1done) return { phase: 1, c: X.nextQuestion(sol.cols, sol.a1, { lo: 0, hi: 1, among: sol.cases }) };
        if (sol.open2.length) return { phase: 2, c: X.nextQuestion(sol.cols, sol.a2, { lo: 0, hi: sol.FL - 1, among: sol.sub }) };
        return null;
    }
    // what the MAC says for a case: true = it breaks, false = it does not, null = the MAC has no answer (a wrong action, or an unfinished MAC)
    function macSays(fc, c, sol) {
        var ms = MM.solved(fc); if (!ms || ms.error) return null;
        var n = ms.ds.length; if (/M/.test(c.slice(n))) return null;
        var x = ms.by[c.slice(0, n)]; return x && x.level != null ? x.level === 1 : null;
    }
    function disagreements(fc, sol) { var out = []; Object.keys(sol.a1).forEach(function (c) { var m = macSays(fc, c, sol); if (m !== null && (sol.a1[c] === 1) !== m) out.push(c); }); return out; }
    function caseText(c, ds) {
        var t = [], p = [], mm = [];
        for (var i = 0; i < c.length; i++) { var s = c[i], n = ds[i].name; if (s === 'F') t.push(n); else if (s === 'D') p.push(n); else if (s === 'A' || s === 'B') p.push(n + ' (' + ds[i].units[s === 'A' ? 0 : 1] + ' lost)'); else if (s === 'M') mm.push(ds[i].sysName); }
        if (!t.length && !p.length && !mm.length) return 'Nothing lost';
        var bits = []; if (t.length) bits.push('total loss of ' + joinAnd(t)); if (p.length) bits.push('partial loss of ' + joinAnd(p)); if (mm.length) bits.push('malfunction of ' + joinAnd(mm));
        var x = bits.join(' plus '); return x.charAt(0).toUpperCase() + x.slice(1);
    }
    function codeOf(d, fc) { var ds = cofCols(fc), same = ds.filter(function (x) { return x.sysId === d.sysId && !x.isM; }).length; return d.isM ? d.sysName + ' (M)' : d.named || same > 1 ? d.name : d.sysName; }
    // FF<n>.1 total loss, .2 partial loss, .3 malfunction; n counts the systems' functions in the table's order
    function baseOf(fc, key) { key = S(key); var at = key.indexOf('#'); if (at === -1) return key; var colId = key.slice(0, at); return MM.macCols(fc).filter(function (d) { return d.colId === colId; }).length > 1 ? key : colId; }
    function ffIndex(fc) { var ids = [], add = function (k) { var b = baseOf(fc, k); if (ids.indexOf(b) === -1) ids.push(b); }; MM.macCols(fc).forEach(function (d) { add(d.id); }); MM.malfList(fc).filter(function (m) { return m.on; }).forEach(function (m) { if (!ids.some(function (x) { return x === m.colId || x.indexOf(m.colId + '#') === 0; })) ids.push(m.colId); }); return ids; }
    function ffId(fc, key, st) {
        var ids = ffIndex(fc), b = baseOf(fc, key), i = ids.indexOf(b);
        if (i === -1) i = ids.map(function (x) { return x.split('#')[0]; }).indexOf(b.split('#')[0]);
        return 'FF' + (i + 1) + '.' + (st === 'F' ? 1 : st === 'M' ? 3 : 2);
    }
    function ffText(e) { return e.st === 'M' ? e.m.sysName + ' doing the wrong thing: ' + lc(e.m.fnName) + ' (malfunction)' : (e.st === 'F' ? 'Total loss of ' : 'Partial loss of ') + e.d.name + ' function (' + lc(e.d.fnName) + ')' + (e.st === 'A' || e.st === 'B' ? ': ' + e.d.units[e.st === 'A' ? 0 : 1] + ' lost' : e.d.units.length > 1 ? ': ' + MM.unitWords(e.d, e.st).replace(/^.*?: /, '') + ' lost' : ''); }
    function ffRows(fc) {
        var evs = MM.allEvents(fc), key = function (e) { return e.st === 'M' ? e.m.colId : e.d.id; };
        var row = function (e) { var l = MM.linkOf(fc, e.k), g = l ? MM.sysGroups(l.sysId).filter(function (x) { return x.fcId === S(l.fcId); })[0] : null; return { e: e, id: ffId(fc, key(e), e.st), text: ffText(e), link: l, sfha: l ? S(l.fcId) + (g ? ' ' + T(g.gov.fcDesc || '') : ' (no longer in the system FHA)') : '' }; };
        return { total: evs.filter(function (e) { return e.st === 'F'; }).map(row), partial: evs.filter(function (e) { return X.isPartial(e.st); }).map(row), malf: evs.filter(function (e) { return e.st === 'M'; }).map(row) };
    }

    // ---- the summary, the gate, the numbers, the pairs ---------------------------------------------------------------------
    function summaryRows(fc, sol) { return sol && sol.done ? X.summary(sol.cols, sol.lvl, sol.FL) : null; }
    function evWords(d, st) { return st === 'F' ? 'total loss of ' + d.name : st === 'M' ? 'malfunction of ' + d.sysName : 'partial loss of ' + d.name + (st === 'A' || st === 'B' ? ' (' + d.units[st === 'A' ? 0 : 1] + ' lost)' : ''); }
    // The conclusion for the rows of one outcome: "X in addition to partial loss of any A, B or C functions resulting in ..."
    function conclusions(fc, rows, level, sol) {
        var ds = sol.ds, res = lc(outcomeName(fc, sol.FL - level));
        if (level === 0) return rows.map(function () { return null; });
        if (rows.length > 1) {
            var core = ds.map(function (d, i) { return rows.every(function (r) { return r.c[i] === rows[0].c[i] && r.c[i] !== 'O'; }) ? rows[0].c[i] : null; });
            var extras = rows.map(function (r) { var o = []; for (var i = 0; i < r.c.length; i++) if (core[i] == null && r.c[i] !== 'O') o.push(i); return o; });
            if (core.some(Boolean) && extras.every(function (e) { return e.length === 1; }) && rows.every(function (r, j) { return X.isPartial(r.c[extras[j][0]]); })) {
                var ct = ds.map(function (d, i) { return core[i] ? evWords(d, core[i]) : null; }).filter(Boolean).join(' and ');
                var any = []; extras.forEach(function (e) { var nm = ds[e[0]].name; if (any.indexOf(nm) === -1) any.push(nm); });
                var t = ct.charAt(0).toUpperCase() + ct.slice(1) + ' in addition to partial loss of any ' + (any.length < 2 ? any.join('') : any.slice(0, -1).join(', ') + ' or ' + any[any.length - 1]) + ' functions resulting in ' + res;
                return rows.map(function (r, j) { return j === 0 ? { t: t, span: rows.length } : { skip: true }; });
            }
        }
        return rows.map(function (r) { return { t: caseText(r.c, ds) + ' resulting in ' + res, span: 1 }; });
    }
    function fcRows(fc, sol) { var rows = summaryRows(fc, sol); return rows ? rows.filter(function (r) { return r.level === sol.FL; }) : []; }
    function shortest(fc, sol) {
        var rows = fcRows(fc, sol), alone = MM.aloneMalf(fc); if (!rows.length && !alone.length) return null;
        var ord = alone.length ? 1 : Math.min.apply(null, rows.map(function (r) { return r.c.replace(/O/g, '').length; }));
        var routes = (alone.length ? alone.map(function (m) { return m.sysName + ' doing the wrong thing'; }) : []).concat(rows.filter(function (r) { return r.c.replace(/O/g, '').length === ord; }).map(function (r) { return caseText(r.c, sol.ds); }));
        return { order: ord, routes: routes, single: ord === 1 && /catastrophic|hazardous/i.test(fc.sev) };
    }
    function gate(fc, sol) { var rows = fcRows(fc, sol); return rows.length ? X.gate(rows.map(function (r) { return r.c; }), sol.cols) : null; }
    function gateEvents(g) { if (!g) return []; var out = [], seen = {}; (g.shape === 'core-any' ? g.core.concat(g.any) : [].concat.apply([], g.sets)).forEach(function (e) { var k = e.col + '|' + e.st; if (!seen[k]) { seen[k] = 1; out.push(e); } }); return out; }
    function target(fc) { var f = K.fn('getSafetyTarget'), t = f ? safe(function () { return f(fc.sev); }, null) : null; return t && typeof t.prob === 'number' ? t.prob : null; }
    function mathCheck(fc, sol) {
        var g = gate(fc, sol); if (!g) return null;
        var b = (peek(fc.key) || {}).budgets || {}, evs = gateEvents(g), missing = evs.filter(function (e) { var v = b[e.col + '|' + e.st]; return !(v > 0 && v <= 1); });
        if (missing.length) return { g: g, missing: missing.length, of: evs.length };
        var p; try { p = X.gateProbability(g, b); } catch (e) { return { g: g, error: e && e.message ? e.message : String(e) }; }
        var tg = target(fc);
        return { g: g, p: p.p, core: p.core, any: p.any, target: tg, ok: tg == null ? null : p.p <= tg };
    }
    function fmt(p) { if (!(p > 0) || !isFinite(p)) return '0'; var t = p.toExponential(3).split('e'), m = t[0].replace(/0+$/, ''), e = Number(t[1]); if (m.slice(-1) === '.') m += '0'; return m + 'E' + (e < 0 ? '-' : '+') + String(Math.abs(e)).padStart(2, '0'); }
    function colById(sol, id) { return sol.ds.filter(function (d) { return d.id === id; })[0] || null; }
    // the ways one event can happen: the system's own failure condition, or the loss of a resource that feeds it
    function ways(fc, sol, e) {
        var d = colById(sol, e.col), key = d.isM ? d.colId + '|M' : e.col + '|' + e.st, l = MM.linkOf(fc, key);
        var own = l ? S(l.fcId) : ffId(fc, d.isM ? d.colId : d.id, e.st);
        var res = d.isM ? [] : K.resPicked(fc).filter(function (r) { return K.resState(fc, r).feeds[d.colId]; }).map(function (r) { return { id: r.key, name: r.name, code: r.name + ' to ' + codeOf(d, fc) }; });
        return { own: own, res: res };
    }
    // Every combination of ways that causes the failure condition, and the ones that rest on one resource.
    function pairs(fc, sol) {
        var g = gate(fc, sol); if (!g) return null;
        var order = K.resPicked(fc).map(function (r) { return r.key; });
        if (g.shape === 'core-any' && g.core.length === 1) {
            var ps = X.resourcePairs(g, function (e) { var w = ways(fc, sol, e); return { own: w.own, res: w.res.map(function (r) { return { id: r.id, code: r.code }; }) }; }, { failure2Order: order });
            if (ps) return { shape: 'pairs', rows: ps.map(function (p) { return { n: p.n, parts: [p.a.code, p.b.code], same: p.same }; }) };
        }
        var sets = g.shape === 'core-any' ? g.any.map(function (a) { return g.core.concat([a]); }) : g.sets, rows = [], over = false;
        sets.forEach(function (set) {
            var w = set.map(function (e) { var x = ways(fc, sol, e); return x.res.map(function (r) { return { code: r.code, res: r.id }; }).concat([{ code: x.own, res: null }]); });
            var count = w.reduce(function (n, x) { return n * x.length; }, 1); if (rows.length + count > COMBO_CAP) { over = true; return; }
            (function go(i, acc) { if (i === w.length) { var r0 = acc[0].res, same = r0 !== null && acc.every(function (x) { return x.res === r0; }) ? r0 : null; rows.push({ n: rows.length + 1, parts: acc.map(function (x) { return x.code; }), same: same }); return; } w[i].forEach(function (x) { go(i + 1, acc.concat([x])); }); })(0, []);
        });
        return over ? { shape: 'over', rows: [], why: 'There are over ' + COMBO_CAP + ' combinations. The tool does not list part of a table; reduce the columns or the shared resources.' } : { shape: 'sets', rows: rows, width: Math.max.apply(null, sets.map(function (x) { return x.length; }).concat([2])) };
    }
    function indepList(fc, sol) {
        var r = peek(fc.key) || {}, off = r.indep || {};
        return fcRows(fc, sol).map(function (row, k) {
            var key = 'INDEP-' + String(k + 1).padStart(2, '0'), parts = [];
            for (var i = 0; i < row.c.length; i++) { var s = row.c[i], d = sol.ds[i]; if (s === 'O') continue; parts.push(s === 'M' ? 'the malfunction of ' + d.sysName : (s === 'F' ? 'the complete loss of ' : 'the partial loss of ') + d.name + ' function'); }
            var t = parts.join(' and ') + (parts.length > 1 ? ' do' : ' does') + ' not result from a single failure or event';
            return { key: key, text: t.charAt(0).toUpperCase() + t.slice(1), on: off[key] !== false, single: parts.length < 2 };
        });
    }
    // v1.1: what each line does ON ITS OWN, from the table the engineer answered: the case with that one failure and
    // everything else working. Written onto the lines the Autopilot made; the severity stays the system engineer's.
    function ownEffects(fc) {
        var sol = named(fc) && ready(fc) ? solved(fc) : null; if (!sol || sol.error) return 0;
        var n = 0;
        MM.allEvents(fc).forEach(function (e) {
            var row = MM.sysFcRow(MM.linkOf(fc, e.k)); if (!row || !row.apx) return;
            var i = sol.ds.map(function (d) { return e.st === 'M' ? (d.isM && d.colId + '|M' === e.k) : (!d.isM && d.id + '|' + e.st === e.k); }).indexOf(true);
            if (i === -1) { M.model.setEffect(row, fc.fcId, 'own', ''); return; }
            var c = sol.ds.map(function (d, j) { return j === i ? e.st : 'O'; }).join(''), lv = sol.lvl[c];
            M.model.setEffect(row, fc.fcId, 'own', lv == null ? '' : 'On its own, with the other systems working: ' + lc(levelName(fc, sol, lv)) + ' (CoFFE case ' + (sol.cases.indexOf(c) + 1) + ' of ' + fc.fcId + ').'); n++;
        });
        return n;
    }
    function status(fc) { var r = peek(fc.key) || {}; return r.sent ? { k: 'sent', by: r.sent.by, at: r.sent.at } : r.changedSince ? { k: 'changed' } : Object.keys(r.a1 || {}).length || r.sig || r.wasSent ? { k: 'started' } : { k: 'new' }; }
    function left(fc) {
        var out = [];
        if (!MM.macCols(fc).length) { out.push('No system is ticked for this failure condition. Do the Interdependence Autopilot first.'); return out; }
        if (!ready(fc)) { out.push('Set how every system is built in the MAC Autopilot first.'); return out; }
        if (!named(fc)) { out.push('Name every outcome.'); return out; }
        var sol = solved(fc); if (sol.error) { out.push(sol.error); return out; }
        var n = sol.open1.length + sol.open2.length + (sol.p1done ? 0 : 0);
        if (!sol.done) out.push((sol.p1done ? sol.open2.length : sol.open1.length) + ' question' + ((sol.p1done ? sol.open2.length : sol.open1.length) > 1 ? 's are' : ' is') + ' still open.');
        return out;
    }

    // ---- actions ---------------------------------------------------------------------------------------------------------------
    var ui = { page: 0, how: false };
    function setOutcome(fc, i, text) { var r = rec(fc.key); if (r.outcomes[0] === '' && i !== 0) r.outcomes[0] = fc.desc; if (i < r.outcomes.length) r.outcomes[i] = T(text); touched(fc.key); }
    function addOutcome(fc) { var r = rec(fc.key); if (!T(r.outcomes[0])) r.outcomes[0] = fc.desc; r.outcomes.splice(r.outcomes.length - 1, 0, ''); sync(fc); touched(fc.key); }
    function removeOutcome(fc, i) { var r = rec(fc.key); if (r.outcomes.length <= 2 || i <= 0 || i >= r.outcomes.length) return; r.outcomes.splice(i, 1); sync(fc); touched(fc.key); }
    function setResultName(fc, t) { rec(fc.key).resultName = T(t); touched(fc.key); }
    function answer(fc, phase, c, v) {
        if (!named(fc)) throw new Error('Name every outcome first.');
        var sol = solved(fc); if (!sol || sol.error) throw new Error(sol && sol.error ? sol.error : 'Set how every system is built in the MAC Autopilot first.');
        if (sol.cases.indexOf(c) === -1) throw new Error('That mix is not in this table.');
        var r = rec(fc.key), wrote;
        if (phase === 1) wrote = X.answer(r.a1, c, v ? 1 : 0, sol.cols, { lo: 0, hi: 1, mirror: mirrorOn(fc) });
        else { if (!sol.p1done) throw new Error('Answer which mixes cause the failure condition first.'); if (!(v >= 0 && v <= sol.FL - 1)) throw new Error('That outcome is not one of the lesser outcomes.'); wrote = X.answer(r.a2, c, v, sol.cols, { lo: 0, hi: sol.FL - 1, mirror: mirrorOn(fc) }); }
        if (wrote.length) r.hist.push([phase === 1 ? 'a1' : 'a2', wrote]);
        delete r.asked; touched(fc.key);
        return wrote;
    }
    function undo(fc) { var r = rec(fc.key), h = r.hist.pop(); if (h) { h[1].forEach(function (c) { delete r[h[0]][c]; }); if (h[0] === 'a1') { r.a2 = {}; r.hist = r.hist.filter(function (x) { return x[0] !== 'a2'; }); } } touched(fc.key); }
    function clearAnswers(fc) { var r = rec(fc.key); if (Object.keys(r.a1).length) r.stale = { sig: r.sig, a1: r.a1, a2: r.a2, at: K.now(), cleared: true }; r.a1 = {}; r.a2 = {}; r.hist = []; touched(fc.key); }
    function setBudget(fc, k, v) { var n = Number(v), r = rec(fc.key); if (v === '' || v == null) delete r.budgets[k]; else if (n > 0 && n <= 1) r.budgets[k] = n; else return false; touched(fc.key); return true; }
    function setIndep(fc, key, on) { var r = rec(fc.key); if (on) delete r.indep[key]; else r.indep[key] = false; touched(fc.key); }
    function send(fc, name) {
        name = T(name); if (!name) return { ok: false, why: 'Type your name to sign before sending.' };
        var l = left(fc); if (l.length) return { ok: false, why: l[0] };
        var r = rec(fc.key); if (!T(r.outcomes[0])) r.outcomes[0] = fc.desc;
        M.act.ensureSysFcs(fc); ownEffects(fc);
        r.sent = { by: name, at: K.now() }; delete r.changedSince;
        try { if (root.SLApxBridge && root.SLApxBridge.project) root.SLApxBridge.project(fc, 'cof'); } catch (e) { r.bridgeError = e && e.message ? e.message : String(e); }
        K.save();
        return { ok: true };
    }
    // today's signed CoFFE verdicts for this failure condition, brought in as answers (step 5: conversion)
    function oldVerdicts(fc) {
        var p = K.pc(), V = p && p.coffe && p.coffe.verdicts, out = []; if (!V) return out;
        Object.keys(V).forEach(function (k) { if (k.indexOf(fc.key + '§') !== 0 || !V[k] || V[k].apx) return; var parts = k.slice(fc.key.length + 1).split('∧').map(function (x) { var i = x.lastIndexOf('='); return { sysId: x.slice(0, i), state: x.slice(i + 1) }; }); if (V[k].verdict === 'yes' || V[k].verdict === 'no') out.push({ key: k, parts: parts, yes: V[k].verdict === 'yes', by: V[k].by }); });
        return out;
    }
    function verdictCase(v, ds) {
        var c = ds.map(function () { return 'O'; });
        for (var j = 0; j < v.parts.length; j++) {
            var p = v.parts[j], want = p.state === 'malfunction' ? 'M' : p.state === 'partial loss' ? 'D' : 'F';
            var hits = ds.map(function (d, i) { return { d: d, i: i }; }).filter(function (x) { return S(x.d.sysId) === S(p.sysId) && (want === 'M' ? x.d.isM : !x.d.isM); });
            if (hits.length !== 1) return null;
            if (hits[0].d.states.indexOf(want) === -1) return null;
            c[hits[0].i] = want;
        }
        return c.join('');
    }
    function convert(fc) {
        var sol = solved(fc); if (!sol || sol.error) return { ok: false, why: 'Set how every system is built in the MAC Autopilot first.' };
        if (!named(fc)) return { ok: false, why: 'Name every outcome first.' };
        var r = rec(fc.key), n = 0, skipped = 0, clash = 0, wroteAll = [];
        oldVerdicts(fc).forEach(function (v) { var c = verdictCase(v, sol.ds); if (!c) { skipped++; return; } try { var w = X.answer(r.a1, c, v.yes ? 1 : 0, sol.cols, { lo: 0, hi: 1, mirror: false }); wroteAll = wroteAll.concat(w); n++; } catch (_) { clash++; } });
        if (wroteAll.length) r.hist.push(['a1', wroteAll]);
        r.converted = { n: n, skipped: skipped, clash: clash, at: K.now(), by: K.who() };
        touched(fc.key);
        return { ok: true, n: n, skipped: skipped, clash: clash };
    }

    // ---- tables --------------------------------------------------------------------------------------------------------------
    function cellTd(d, st) { var cls = X.isPartial(st) ? 'D' : st, side = st === 'A' || st === 'B' ? '<div style="font-weight:400;font-size:12px">' + E(d.units[st === 'A' ? 0 : 1]) + ' lost</div>' : ''; return '<td class="' + cls + '">' + cls + side + '</td>'; }
    function heads(fc, ds) { return ds.map(function (d) { return '<th>' + E(codeOf(d, fc)) + '</th>'; }).join(''); }
    function legend(fc, ds) { return '<div class="apx-tw" style="margin-top:10px"><table data-sl-worksheet="1" class="apx-arp" style="width:auto"><tr><td class="F" style="min-width:60px">F</td><td class="l">Failed (total loss of function)</td></tr><tr><td class="D">D</td><td class="l">Degraded (partial loss of function)</td></tr><tr><td class="O">O</td><td class="l">Operational (no loss of function)</td></tr>' + (ds.some(function (d) { return d.isM; }) ? '<tr><td class="M">M</td><td class="l">Malfunction (doing the wrong thing)</td></tr>' : '') + '</table></div>'; }
    function resName(fc) { return T((peek(fc.key) || {}).resultName) || 'Result'; }
    function levelName(fc, sol, lv) { return outcomeName(fc, sol.FL - lv); }
    function tableQ43(fc, edit) {
        var R = ffRows(fc), one = function (cap, rows) { return rows.length ? '<div class="apx-cap">' + cap + '</div><div class="apx-tw"><table data-sl-worksheet="1" class="apx-arp"><tr><th style="width:50%">System Functional Failures</th><th>Associated Sys Failure Condition (SFHA)</th></tr>' + rows.map(function (r) { return '<tr><td class="l">' + E(r.id) + ' - ' + E(r.text) + '</td><td class="l">' + (edit ? M.linkPicker(fc, r.e) : (r.sfha ? E(r.sfha) : 'Not linked yet')) + '</td></tr>'; }).join('') + '</table></div>' : ''; };
        return one('Table Q.4-3 - (PASA)<br>System functional failures and SFHA failure conditions: Total loss', R.total) + one('Table Q.4-4 - (PASA)<br>System functional failures and SFHA failure conditions: Partial loss', R.partial) + one('Table Q.4-5 - (PASA)<br>System functional failures and SFHA failure condition: malfunction', R.malf) + K.abbr([['FF', 'Functional Failure'], ['SFHA', 'System Functional Hazard Assessment']]);
    }
    function tableQ46(fc, sol) {
        var pages = Math.ceil(sol.cases.length / PER) || 1; ui.page = Math.max(0, Math.min(ui.page, pages - 1));
        var slice = sol.cases.slice(ui.page * PER, ui.page * PER + PER), how = ui.how;
        return '<div class="apx-cap">Table Q.4-6 - (PASA)<br>CoFFE table</div><div class="apx-pager" style="justify-content:center"><button class="apx-btn" data-apx-x="page|-1"' + (ui.page === 0 ? ' disabled' : '') + '>Previous</button><b>Cases ' + (ui.page * PER + 1) + ' to ' + Math.min(sol.cases.length, ui.page * PER + PER) + ' of ' + sol.cases.length + '</b><button class="apx-btn" data-apx-x="page|1"' + (ui.page >= pages - 1 ? ' disabled' : '') + '>Next</button></div>'
            + '<div class="apx-tw"><table data-sl-worksheet="1" class="apx-arp"><tr><th>Case #</th>' + heads(fc, sol.ds) + '<th>' + E(resName(fc)) + '</th>' + (how ? '<th>Decided by</th>' : '') + '</tr>'
            + slice.map(function (c) { var n = sol.cases.indexOf(c) + 1, lv = sol.lvl[c]; return '<tr><td>' + n + '</td>' + c.split('').map(function (s, i) { return cellTd(sol.ds[i], s); }).join('') + '<td>' + E(lv == null ? '' : levelName(fc, sol, lv)) + '</td>' + (how ? '<td>' + (lv == null ? '' : sol.src[c] === 'you' ? 'You' : 'Logic') + '</td>' : '') + '</tr>'; }).join('') + '</table></div>'
            + legend(fc, sol.ds) + '<p style="text-align:center"><label style="cursor:pointer"><input type="checkbox" data-apx-xc="how"' + (how ? ' checked' : '') + '> Show who decided each case (not printed in the PASA)</label></p>';
    }
    function tableQ47(fc, sol) {
        var rows = summaryRows(fc, sol), tr = '';
        for (var lv = sol.FL; lv >= 0; lv--) { var rs = rows.filter(function (r) { return r.level === lv; }), con = conclusions(fc, rs, lv, sol); rs.forEach(function (r, j) { tr += '<tr>' + r.c.split('').map(function (s, i) { return cellTd(sol.ds[i], s); }).join('') + '<td>' + E(levelName(fc, sol, lv)) + '</td>' + (con[j] && con[j].skip ? '' : '<td class="l"' + (con[j] && con[j].span > 1 ? ' rowspan="' + con[j].span + '"' : '') + '>' + (con[j] ? E(con[j].t) : '') + '</td>') + '</tr>'; }); }
        return '<div class="apx-cap">Table Q.4-7 - (PASA)<br>CoFFE table summary</div><div class="apx-tw"><table data-sl-worksheet="1" class="apx-arp"><tr>' + heads(fc, sol.ds) + '<th>' + E(resName(fc)) + '</th><th>Conclusion</th></tr>' + tr + '</table></div>';
    }
    function tableQ48(fc, sol) {
        var rs = fcRows(fc, sol), con = conclusions(fc, rs, sol.FL, sol).filter(function (x) { return x && !x.skip; });
        return '<div class="apx-cap">Table Q.4-8 - (PASA)<br>CoFFE table result: ' + E(outcomeName(fc, 0)) + '</div><div class="apx-tw"><table data-sl-worksheet="1" class="apx-arp"><tr>' + heads(fc, sol.ds) + '<th>' + E(resName(fc)) + '</th></tr>' + (rs.length ? rs.map(function (r) { return '<tr>' + r.c.split('').map(function (s, i) { return cellTd(sol.ds[i], s); }).join('') + '<td>' + E(outcomeName(fc, 0)) + '</td></tr>'; }).join('') : '<tr><td class="l" colspan="' + (sol.ds.length + 1) + '">No mix of these failures causes it.</td></tr>') + '</table></div>'
            + (con.length ? '<p style="margin:12px 0 0">Through the CoFFE analysis it can be concluded that: ' + con.map(function (x) { return '"' + E(x.t.charAt(0).toLowerCase() + x.t.slice(1)) + '"'; }).join('; ') + '.</p>' : '');
    }
    function evNode(fc, sol, e) { var d = colById(sol, e.col); return '<b>' + E(ffId(fc, d.isM ? d.colId : d.id, e.st)) + '</b> ' + E(evWords(d, e.st).replace(/^./, function (x) { return x.toUpperCase(); })); }
    function gateHtml(fc, sol) {
        var g = gate(fc, sol), alone = MM.aloneMalf(fc), li = function (x) { return '<div class="apx-tli">' + x + '</div>'; }, inner = '';
        if (g && g.shape === 'core-any') inner = ' <span class="apx-gate">AND</span><div class="apx-tul">' + g.core.map(function (e) { return li(evNode(fc, sol, e)); }).join('') + li('<b>Any one of these further failures</b><span class="apx-gate">OR</span><div class="apx-tul">' + g.any.map(function (e) { return li(evNode(fc, sol, e)); }).join('') + '</div>') + '</div>';
        else if (g) inner = ' <span class="apx-gate">OR</span><div class="apx-tul">' + g.sets.map(function (set) { return li(set.length > 1 ? ' <span class="apx-gate">AND</span><div class="apx-tul">' + set.map(function (e) { return li(evNode(fc, sol, e)); }).join('') + '</div>' : evNode(fc, sol, set[0])); }).join('') + '</div>';
        return '<div class="apx-cap">Figure Q.4-1 - (PASA)<br>The gate under ' + E(fc.fcId) + '</div><div class="apx-tree"><div class="apx-tul"><div class="apx-tli"><b>' + E(fc.fcId) + '</b> ' + E(fc.desc) + (fc.phases ? ' (' + E(fc.phases) + ')' : '') + ' <span class="apx-gate">OR</span><div class="apx-tul">'
            + (g ? li('<b>' + E(fc.fcId) + '.CoFFE</b> Combined loss resulting in ' + E(lc(outcomeName(fc, 0))) + inner) : '') + alone.map(function (m) { return li('<b>' + E(ffId(fc, m.colId, 'M')) + '</b> ' + E(m.sysName) + ' doing the wrong thing, resulting in ' + E(lc(outcomeName(fc, 0)))); }).join('') + '</div></div></div></div>';
    }
    function tablePairs(fc, sol) {
        var P = pairs(fc, sol); if (!P) return { main: '', same: '' };
        if (P.shape === 'over') return { main: note('warn', E(P.why)), same: '' };
        var w = P.shape === 'pairs' ? 2 : P.width, hd = ''; for (var i = 1; i <= w; i++) hd += '<th>Failure ' + i + '</th>';
        var row = function (r) { var tds = ''; for (var k = 0; k < w; k++) tds += '<td class="l">' + E(r.parts[k] || '--') + '</td>'; return '<tr><td>' + r.n + '</td>' + tds + '</tr>'; };
        var PP = 30, pages = Math.ceil(P.rows.length / PP) || 1; ui.ppage = Math.max(0, Math.min(ui.ppage || 0, pages - 1));
        var main = '<div class="apx-cap">Table Q.4-9 - (PASA)<br>Potential failures combinations (FT cut set)</div>' + (pages > 1 ? '<div class="apx-pager" style="justify-content:center"><button class="apx-btn" data-apx-x="ppage|-1"' + (ui.ppage === 0 ? ' disabled' : '') + '>Previous</button><b>Cases ' + (ui.ppage * PP + 1) + ' to ' + Math.min(P.rows.length, ui.ppage * PP + PP) + ' of ' + P.rows.length + '</b><button class="apx-btn" data-apx-x="ppage|1"' + (ui.ppage >= pages - 1 ? ' disabled' : '') + '>Next</button></div>' : '') + '<div class="apx-tw"><table data-sl-worksheet="1" class="apx-arp"><tr><th>Cases</th>' + hd + '</tr>' + P.rows.slice(ui.ppage * PP, ui.ppage * PP + PP).map(row).join('') + '</table></div>';
        var n = 10, so = 2, same = '';
        K.resPicked(fc).forEach(function (r) { var rs = P.rows.filter(function (x) { return x.same === r.key; }); if (!rs.length) return; same += '<div class="apx-cap">Table Q.4-' + (n++) + ' - (PASA)<br>' + E(r.name) + ' common source failures</div><div class="apx-tw"><table data-sl-worksheet="1" class="apx-arp"><tr><th>Cases</th>' + hd + '</tr>' + rs.map(row).join('') + '</table></div>' + note('', 'Proposed requirement: no single failure or event results in the loss of all ' + E(lc(r.name)) + ', and it is extremely improbable <b>[PASA-SO-' + String(so++).padStart(2, '0') + ']</b>. ' + E(r.name) + ' should be distributed so that it also meets the independence principles. These go to the PRA, ZSA, CMA and the PSSA of the system that provides it.'); });
        return { main: main, same: same, rows: P.rows };
    }

    // ---- the page ---------------------------------------------------------------------------------------------------------------
    var CSS = '.apx-tree .apx-tul{margin:6px 0 0;padding-left:22px;border-left:2px solid var(--color-border-strong,#14171C)}.apx-tree>.apx-tul{border-left:0;padding-left:0}.apx-tree .apx-tli{margin:6px 0;padding:6px 10px;border:1px solid var(--color-border,rgba(20,23,28,.3));border-radius:10px;background:var(--color-surface-1,#fff)}'
        + '.apx-gate{display:inline-block;margin-left:8px;font-size:11.5px;font-weight:700;border:1.5px solid currentColor;border-radius:6px;padding:0 6px}'
        + '.apx-case{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:8px 0 12px}.apx-st{border:1.5px solid var(--color-border,rgba(20,23,28,.3));border-radius:12px;padding:10px 12px}.apx-st b{display:block}'
        + '.apx-st.O{border-color:#0B7A3E;background:rgba(11,122,62,.1)}.apx-st.F{border-color:#B42318;background:rgba(180,35,24,.1)}.apx-st.D{border-color:#9A5B00;background:rgba(154,91,0,.1)}.apx-st.M{border-color:#6E3CBE;background:rgba(110,60,190,.1)}'
        + '.apx-btn.sug{outline:3px solid #1A6EF2;outline-offset:2px}.apx-math{display:grid;grid-template-columns:90px minmax(0,1fr) 180px auto;gap:8px 12px;align-items:center;margin:0 0 8px}@media (max-width:760px){.apx-math{grid-template-columns:1fr}}';
    function style() { M.style(); if (typeof document === 'undefined' || document.getElementById('apx-style-cof')) return; var st = document.createElement('style'); st.id = 'apx-style-cof'; st.textContent = CSS; document.head.appendChild(st); }
    function card(q, help, body) { return K.card(q, help, body); }
    function need(fc, title) {
        if (!MM.macCols(fc).length) return card(title, 'No system is ticked for this failure condition yet. Do the Interdependence Autopilot first.', '<button class="apx-btn p" data-apx-ap="idp">Open the Interdependence Autopilot</button>');
        if (!ready(fc)) return card(title, 'The CoFFE table needs to know how each system is built: that is what "partly working" means. Set the builds in the MAC Autopilot first.', '<button class="apx-btn p" data-apx-ap="mac">Open the MAC Autopilot</button>');
        return null;
    }
    function stateCard(sol, c) { return '<div class="apx-case">' + c.split('').map(function (s, i) { var d = sol.ds[i]; return '<div class="apx-st ' + (X.isPartial(s) ? 'D' : s) + '"><b>' + E(d.name) + '</b><span>' + E(d.isM ? (s === 'M' ? 'Doing the wrong thing' : 'Working') : MM.stLabel(d, s)) + '</span></div>'; }).join('') + '</div>'; }
    function stepLinks(fc) {
        var n = need(fc, 'Which system FHA failure condition matches each one?'); if (n) return n;
        var madeNow = M.act.ensureSysFcs(fc); ownEffects(fc);
        var alone = MM.aloneMalf(fc), combo = MM.comboMalf(fc);
        var body = note('', '<b>The tool added each of these to its system\'s FHA by itself</b>, keyed to the system function and traced to this failure condition, with the severity left blank for the system engineer. You can point any of them at a different line of that FHA.' + (madeNow.length ? ' ' + madeNow.length + ' line' + (madeNow.length > 1 ? 's were' : ' was') + ' added just now.' : '')) + tableQ43(fc, true)
            + (alone.length ? note('', E(joinAnd(alone.map(function (m) { return ffId(fc, m.colId, 'M'); }))) + ' causes the failure condition on its own, so it stays out of the CoFFE table. It goes to the ' + E(joinAnd(alone.map(function (m) { return m.sysName; }))) + ' PSSA and becomes its own branch in the fault tree.') : '')
            + (combo.length ? note('', E(joinAnd(combo.map(function (m) { return ffId(fc, m.colId, 'M'); }))) + ' only matters together with other failures, so it gets its own column in the CoFFE table.') : '');
        return card('The system failures, and their lines in each system FHA', 'The failures come from the builds you set in the MAC Autopilot. Each one is a line in its system\'s own FHA. These are the same links the MAC keeps: a link is never removed by the tool.', body);
    }
    function stepOutcomes(fc) {
        var n = need(fc, 'What can happen? List the outcomes, worst first.'); if (n) return n;
        var o = outcomes(fc), r = peek(fc.key) || {};
        var rows = o.map(function (x, k) { return '<div class="apx-tick' + (k === 0 ? ' on' : '') + '" style="grid-template-columns:90px minmax(0,1fr) auto"><b>' + (k === 0 ? 'Worst' : k === o.length - 1 ? 'Best' : 'Next') + '</b><input type="text" data-apx-xc="out|' + k + '" value="' + E(k === 0 ? (x || fc.desc) : x) + '" placeholder="' + (k === o.length - 1 ? 'For example: no overrun' : 'For example: low-speed overrun') + '" aria-label="Outcome ' + (k + 1) + '"><span>' + (k === 0 ? 'This is the failure condition' : o.length > 2 ? '<button class="apx-btn" data-apx-x="delout|' + k + '">Remove</button>' : '') + '</span></div>'; }).join('');
        var body = '<div class="apx-eff" style="margin-bottom:14px"><div><b>Result column name</b></div><div><input type="text" data-apx-xc="resname" value="' + E(r.resultName || '') + '" placeholder="For example: Stopping Capability Result" aria-label="Result column name"></div></div><div class="apx-ticks">' + rows + '</div><button class="apx-btn" style="margin-top:10px" data-apx-x="addout">+ Add an outcome in between</button>'
            + note('', 'Results come from performance analysis and simulation, not opinion. The worst outcome is the failure condition itself.');
        return card('What can happen? List the outcomes, worst first.', 'The first one is the failure condition. Add the lesser outcomes below it, and name the best one (nothing bad happens).', body);
    }
    function stepQuestions(fc) {
        var n = need(fc, 'Answer the quick questions'); if (n) return n;
        if (!named(fc)) return card('Answer the quick questions', 'Name every outcome first (the step before this one).', '');
        var sol = solved(fc); if (sol.error) return card('Answer the quick questions', '', note('bad', E(sol.error)));
        var r = peek(fc.key) || {}, N = sol.cases.length, asked = arr(r.hist).length, filled = sol.cases.filter(function (c) { return sol.lvl[c] != null; }).length, logic = sol.cases.filter(function (c) { return sol.lvl[c] != null && sol.src[c] === 'logic'; }).length, nq = next(sol);
        var body = '<div class="apx-prog4"><div><b>' + N + '</b>cases in the table</div><div><b>' + asked + '</b>questions you answered</div><div><b>' + logic + '</b>cases filled by logic</div><div><b>' + (N - filled) + '</b>left</div></div>';
        if (r.asked === 'again') body += note('warn', 'The columns or the outcomes changed, so the questions are asked again. The earlier answers are kept on file.');
        var ms = MM.solved(fc), macDone = !!(ms && !ms.error && ms.done);
        if (!macDone) body += note('warn', 'The MAC is not finished for this failure condition, so no answer is outlined and you answer every question yourself. Finish the MAC Autopilot to get its answers here.');
        var dis = disagreements(fc, sol); if (dis.length) body += note('bad', dis.length + ' answer' + (dis.length > 1 ? 's disagree' : ' disagrees') + ' with the MAC. That is a finding: either the MAC or the performance data needs a second look. For example: ' + E(caseText(dis[0], sol.ds)) + '.');
        var ov = !Object.keys(sol.a1).length ? oldVerdicts(fc) : [];
        if (ov.length) body += note('', '<b>This failure condition has ' + ov.length + ' signed verdict' + (ov.length > 1 ? 's' : '') + ' from today\'s CoFFE page.</b> The tool can bring them in as answers you then check. <button class="apx-btn" data-apx-x="convert" style="margin-left:6px">Bring them in</button>');
        if (r.converted) body += note('', r.converted.n + ' earlier verdict' + (r.converted.n === 1 ? ' was' : 's were') + ' brought in' + (r.converted.skipped ? '; ' + r.converted.skipped + ' could not be matched to a column here' : '') + (r.converted.clash ? '; ' + r.converted.clash + ' contradicted another answer and ' + (r.converted.clash === 1 ? 'was' : 'were') + ' left out' : '') + '.');
        if (!nq) body += note('good', '<b>All ' + N + ' cases are done.</b> You answered ' + asked + ' quick question' + (asked === 1 ? '' : 's') + '; logic filled ' + logic + ' cases.');
        else if (nq.phase === 1) {
            var m = macSays(fc, nq.c, sol), fco = lc(outcomeName(fc, 0));
            body += '<p style="font-size:17px;font-weight:700;margin:6px 0 4px">If this happens' + (fc.phases ? ' (' + E(fc.phases) + ')' : '') + ':</p>' + stateCard(sol, nq.c) + '<p style="font-size:17px;font-weight:700;margin:0 0 10px">Does it cause ' + E(fco) + '?</p>'
                + '<div class="apx-answers"><button class="apx-btn big no' + (m === true ? ' sug' : '') + '" data-apx-x="a1|' + nq.c + '|1">Yes, it causes it</button><button class="apx-btn big yes' + (m === false ? ' sug' : '') + '" data-apx-x="a1|' + nq.c + '|0">No</button></div>'
                + '<p style="margin-top:10px;font-size:13px">' + (m === null ? (macDone ? 'The MAC has no answer for this one (a wrong action is not a loss), so it is your call.' : 'No MAC answer yet, so it is your call.') : 'The outlined answer is what your MAC says. If the performance data agrees, just click it.') + '</p>';
        } else {
            var b = X.bounds(nq.c, sol.a2, 0, sol.FL - 1, sol.cols), btn = '';
            for (var v = b[1]; v >= b[0]; v--) btn += '<button class="apx-btn big" data-apx-x="a2|' + nq.c + '|' + v + '">' + E(levelName(fc, sol, v)) + '</button>';
            body += '<p style="font-size:17px;font-weight:700;margin:6px 0 4px">If this happens' + (fc.phases ? ' (' + E(fc.phases) + ')' : '') + ':</p>' + stateCard(sol, nq.c) + '<p style="font-size:17px;font-weight:700;margin:0 0 10px">It does not cause ' + E(lc(outcomeName(fc, 0))) + '. What happens instead?</p><div class="apx-answers">' + btn + '</div>';
        }
        body += '<div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap"><button class="apx-btn" data-apx-x="undo"' + (asked ? '' : ' disabled') + '>Undo last answer</button><button class="apx-btn" data-apx-x="clear"' + (asked ? '' : ' disabled') + '>Clear all answers</button></div>';
        return card('Answer the quick questions', 'The tool writes out every mix of working, partly working and not working (' + N + ' cases). You do not fill them in. It asks only the questions it cannot work out, and fills the rest by logic: if a mix is safe, a mix with fewer failures is safe too.', body) + K.preview('The CoFFE table so far', tableQ46(fc, sol));
    }
    function stepFull(fc) {
        var n = need(fc, 'The full CoFFE table'); if (n) return n;
        if (!named(fc)) return card('The full CoFFE table', 'Name every outcome first.', '');
        var sol = solved(fc); if (sol.error) return card('The full CoFFE table', '', note('bad', E(sol.error)));
        return card('The full CoFFE table', '', note(sol.done ? 'good' : 'warn', sol.done ? 'All ' + sol.cases.length + ' cases are filled. This is Table Q.4-6 exactly as the PASA will show it.' : 'Some cases are still open. Go back to the questions to finish.')) + K.preview('', tableQ46(fc, sol));
    }
    function stepSummary(fc) {
        var n = need(fc, 'Summary and result'); if (n) return n;
        var sol = named(fc) ? solved(fc) : null; if (!sol || sol.error || !sol.done) return card('Summary and result', 'Finish the questions first.', '');
        ownEffects(fc);
        var sr = shortest(fc, sol), body = '';
        if (sr) body += note(sr.single ? 'bad' : 'good', '<b>Shortest route to ' + E(lc(outcomeName(fc, 0))) + ': ' + sr.order + ' failure' + (sr.order > 1 ? 's together' : ' alone') + '</b> (' + E(sr.routes.join('; or ')) + '). ' + (sr.single ? 'Finding: a single failure causes a ' + E(fc.sev) + ' failure condition. That is not allowed; the design has to change.' : sr.order === 1 ? 'A single failure causes it.' : 'No single failure causes it.'));
        else body += note('good', 'No mix of these failures causes ' + E(lc(outcomeName(fc, 0))) + '.');
        body += note('', 'The tool works these out by math from your answers. The worse outcomes show the smallest mixes that cause them. The best outcome shows the most you can lose and still be fine.');
        return card('Summary and result', '', body) + K.preview('', tableQ47(fc, sol)) + K.preview('', tableQ48(fc, sol));
    }
    function stepFeeds(fc) {
        var n = need(fc, 'Fault tree, budgets and independence'); if (n) return n;
        var sol = named(fc) ? solved(fc) : null; if (!sol || sol.error || !sol.done) return card('Fault tree, budgets and independence', 'Finish the questions first.', '');
        var g = gate(fc, sol), r = peek(fc.key) || {}, b = r.budgets || {}, mc = mathCheck(fc, sol), evs = gateEvents(g);
        var bud = evs.map(function (e) { var d = colById(sol, e.col), k = e.col + '|' + e.st; return '<div class="apx-math"><b>' + E(ffId(fc, d.isM ? d.colId : d.id, e.st)) + '</b><span>' + E(evWords(d, e.st).replace(/^./, function (x) { return x.toUpperCase(); })) + '</span><input type="text" data-apx-xc="bud|' + E(k) + '" value="' + (b[k] ? E(fmt(b[k])) : '') + '" placeholder="For example 1E-07" aria-label="Budget"><span>per flight hour</span></div>'; }).join('');
        var check = !mc ? '' : mc.error ? note('bad', E(mc.error)) : mc.missing ? note('', 'Give every event a budget and the tool checks the math against the objective' + (target(fc) != null ? ' (' + fmt(target(fc)) + ' per flight hour for ' + E(fc.sev) + ')' : '') + '. ' + mc.missing + ' of ' + mc.of + ' still to give.')
            : note(mc.ok === false ? 'bad' : mc.ok ? 'good' : '', '<b>Math check:</b> ' + (g.shape === 'core-any' ? g.core.map(function (e) { return fmt(b[e.col + '|' + e.st]); }).join(' x ') + ' x (1 - ' + g.any.map(function (e) { return '(1 - ' + fmt(b[e.col + '|' + e.st]) + ')'; }).join(' x ') + ') = ' + fmt(mc.core) + ' x ' + fmt(mc.any) + ' = ' : 'the exact sum over the ' + g.sets.length + ' combination' + (g.sets.length > 1 ? 's' : '') + ' = ') + '<b>' + fmt(mc.p) + '</b>' + (mc.target != null ? ', which is ' + (mc.ok ? 'within' : 'over') + ' the ' + fmt(mc.target) + ' objective for ' + E(fc.sev) + '. ' + (mc.ok ? 'The budgets fit.' : 'Lower one of the budgets.') : '. No objective is set for this severity.') + ' The events are taken as independent, which the independence principles below must make true.');
        var ip = indepList(fc, sol).map(function (x) { return '<div class="apx-tick' + (x.on ? ' on' : '') + '" style="grid-template-columns:26px minmax(0,1fr)"><button type="button" class="apx-box" data-apx-x="ip|' + x.key + '" aria-pressed="' + x.on + '" aria-label="' + E(x.key) + '"></button><span>' + E(x.text) + ' <b>[PASA-' + x.key + ']</b></span></div>'; }).join('');
        return card('What the CoFFE feeds', 'All worked out by the tool from your answers. You give the budgets and confirm the principles.', gateHtml(fc, sol) + '<h4 style="margin:20px 0 8px">Probability budgets</h4>' + (bud || '<p>Nothing to budget: no mix causes the failure condition.</p>') + check + '<h4 style="margin:20px 0 8px">Independence principles</h4><div class="apx-ticks">' + (ip || '<p>None: no combination causes the failure condition.</p>') + '</div>');
    }
    function stepCommon(fc) {
        var n = need(fc, 'Common resource pairs, then send'); if (n) return n;
        var sol = named(fc) ? solved(fc) : null, l = left(fc), st = status(fc);
        var T9 = sol && !sol.error && sol.done ? tablePairs(fc, sol) : { main: '', same: '' };
        var body = note('', 'The tool takes the gate, adds the shared resources from your Interdependence answers, and lists every combination of failures that causes the failure condition. The ones where every failure comes from the same resource are pulled out below. Nothing to type here.') + (l.length ? note('warn', l.map(E).join('<br>')) : '');
        if (st.k === 'sent') body += '<div class="apx-sent"><b>Sent to the PASA.</b> Signed by <b>' + E(st.by) + '</b> on ' + E(S(st.at).slice(0, 10)) + '. The PASA now shows the CoFFE tables for ' + E(fc.fcId) + ', the gate, the budgets and the independence principles.</div>';
        else body += (st.k === 'changed' ? note('warn', 'Something changed since this was sent. Send it again to bring the PASA up to date.') : '')
            + '<div class="apx-eff" style="margin-top:14px"><div><b>Sign with your name</b></div><div><input type="text" data-apx-sign="1" value="' + E(K.ui.sign != null ? K.ui.sign : K.who()) + '" placeholder="One signature covers this CoFFE" aria-label="Sign with your name"></div></div>' + (K.ui.signMiss ? note('bad', E(K.ui.signMiss)) : '')
            + '<button class="apx-btn p big" style="margin-top:12px" data-apx-x="send"' + (l.length ? ' disabled' : '') + '>Send to the PASA</button>';
        return card('Common resource pairs, then send', '', body) + (T9.main ? K.preview('', T9.main) : '') + (T9.same ? K.preview('', T9.same) : '');
    }
    function render(i, fc) { style(); return [null, stepLinks, stepOutcomes, stepQuestions, stepFull, stepSummary, stepFeeds, stepCommon][i](fc); }
    function click(action, arg, el, fc) {
        var a;
        if (action === 'mkfc') return M.click(action, arg, el, fc);
        if (action === 'addout') { addOutcome(fc); return true; }
        if (action === 'delout') { removeOutcome(fc, Number(arg)); return true; }
        if (action === 'a1') { a = arg.split('|'); answer(fc, 1, a[0], a[1] === '1'); return true; }
        if (action === 'a2') { a = arg.split('|'); answer(fc, 2, a[0], Number(a[1])); return true; }
        if (action === 'undo') { undo(fc); return true; }
        if (action === 'clear') { clearAnswers(fc); return true; }
        if (action === 'convert') { var cr = convert(fc); if (!cr.ok) K.toast(cr.why, 'warning'); return true; }
        if (action === 'page') { ui.page += Number(arg); return true; }
        if (action === 'ppage') { ui.ppage = (ui.ppage || 0) + Number(arg); return true; }
        if (action === 'ip') { var x = indepList(fc, solved(fc)).filter(function (y) { return y.key === arg; })[0]; if (x) setIndep(fc, arg, !x.on); return true; }
        if (action === 'send') { var name = K.val('[data-apx-sign]'), res = send(fc, name); K.ui.sign = name; K.ui.signMiss = res.ok ? false : res.why; return true; }
        return false;
    }
    function change(action, arg, el, fc) {
        if (action === 'link') return M.change(action, arg, el, fc);
        if (action === 'out') { setOutcome(fc, Number(arg), el.value); return true; }
        if (action === 'resname') { setResultName(fc, el.value); return false; }
        if (action === 'how') { ui.how = !!el.checked; return true; }
        if (action === 'bud') { if (!setBudget(fc, arg, el.value)) K.toast('A budget is a probability: more than 0, at most 1 (for example 1E-07).', 'warning'); return true; }
        return false;
    }

    var api = { VERSION: VERSION,
        model: { cofCols: cofCols, ready: ready, solved: solved, next: next, outcomes: outcomes, outcomeName: outcomeName, named: named, macSays: macSays, disagreements: disagreements, caseText: caseText, codeOf: codeOf, ffId: ffId, ffRows: ffRows, summary: summaryRows, conclusions: conclusions, fcRows: fcRows, shortest: shortest, gate: gate, gateEvents: gateEvents, mathCheck: mathCheck, target: target, pairs: pairs, indepList: indepList, status: status, ownEffects: ownEffects, left: left, peek: peek, oldVerdicts: oldVerdicts, resName: resName, levelName: levelName, fmt: fmt, evWords: evWords, colById: colById },
        act: { setOutcome: setOutcome, addOutcome: addOutcome, removeOutcome: removeOutcome, setResultName: setResultName, answer: answer, undo: undo, clearAnswers: clearAnswers, setBudget: setBudget, setIndep: setIndep, send: send, convert: convert },
        tables: { q43: tableQ43, q46: tableQ46, q47: tableQ47, q48: tableQ48, gate: gateHtml, pairs: tablePairs }, _ui: ui };
    A.register('cof', { name: 'CoFFE', steps: ['Failure condition', 'The system failures and their FHA lines', 'Name the outcomes', 'Answer the quick questions', 'The full CoFFE table', 'Summary and result', 'Fault tree, budgets and independence', 'Common resource pairs and send'], render: render, click: click, change: change, status: status });
    try { root.SLApxCof = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
