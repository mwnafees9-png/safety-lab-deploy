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
 * v1.5, 23 Nov 2026 (Waqas, after the book's CoFFE was read through: "yes lets get this done now"):
 *   1. RESOURCE FAILURES BY WHAT THEY DO (Figure Q.4-1, Table B3). A resource failure goes under an event only when the
 *      Interdependence Autopilot says it does that to the function: a total loss under the function's total loss, a partial
 *      or total loss under its partial loss (the gate's events mean "at least this bad"), a wrong action under its
 *      malfunction column. A loss of supply is one event per function (HYD_WBS, HYD_GSS); a degraded or erroneous resource is
 *      ONE shared event under every function it reaches (AGS.MF), so a pair made of the same shared event twice is a single
 *      failure: it is listed as one, and the pairs it makes larger are dropped (not minimal). An effect not answered there
 *      is left out and the CoFFE cannot be sent until it is answered. The gate drawing shows each event's ways.
 *   2. ONE TABLE, SEVERAL FAILURE CONDITIONS. Each lesser outcome is said to be a failure condition of its own in the AFHA,
 *      or not (the book: case 27, wheel brakes alone, low-speed overrun, Hazardous, which sets FF1.1 below 1.0E-07). A linked
 *      outcome gets its own gate ("this outcome or worse") and its own math check against its failure condition, on the
 *      same budgets, so every event must meet the strictest use. That failure condition's CoFFE is this table: its CoFFE
 *      Autopilot points here, and its PASA appendix shows its part.
 *   3. EACH OUTCOME SAYS WHAT IT MEANS (the book's PASA-ASMP-01: high speed is above 30 knots); it goes to the PASA as an
 *      assumption with the MAC's state definitions and the Interdependence "no effect" reasons (apx_bridge.js).
 *   4. THE CMA LIST (Table Q.4-12): every combination that does not rest on one resource, with the independence
 *      principles it represents; kept on send in projectConfig.apx.cma[<failure condition>] for the CMA.
 *   5. BUDGETS PER FLIGHT. The gate is a product of probabilities of failures in the same flight, so each budget is a
 *      probability per flight (the book: "for a landing"), and the result is turned into a rate per flight hour by the one
 *      rule the rest of the tool uses (SLTopBasis.meets, over the failure condition's own tree) before it is compared with
 *      the objective. Before this the per-flight product was compared with the per-flight-hour objective directly.
 *   rec.outFc { i: fcKey | 'none' } (1 <= i < last), rec.outDef { i: text } (0 <= i < last)
 * v1.6, 23 Nov 2026 (Waqas, on a failure condition claimed by two tables, or claimed while it has its own table: "is there a
 * world where we show it with a note and claim that there is a more conservative use of this"; agreed: combine, name the
 * driver, check the two against each other; "ok lets get it done"):
 *   SOURCES. A failure condition's CoFFE sources are its own table (when it has one) and every other table that names it as
 *   an outcome. Each is shown with its gate and its number. Both routes cause it, so taking the bigger one alone would leave
 *   the other out: the figure checked against its objective is the SUM of the sources' probabilities per flight, never lower
 *   than the true one (exact when the routes never happen in the same flight; a combination two tables both hold is counted
 *   twice, which overstates, and the note says so). The source with the larger share is named as the driver.
 *   DISAGREEMENT. Where two sources share assembly groups, the simple cases (one failure alone, or two together, everything
 *   else working) are compared: one says it causes the failure condition, the other says it does not, that is a finding.
 *   Its own table is never shelved: a failure condition with its own answers keeps its table live; one with none is pointed
 *   to the table(s) that claim it, and can still start its own (rec.ownToo).
 *
 * API (window.SLApxCof): model, act. Tests: tests/regression_apx_coffe_20261115.test.js.
 * ==========================================================================*/
(function (root) {
    'use strict';
    var VERSION = '1.6';   // 1.6 23 Nov 2026: every CoFFE source of a failure condition shown, added together for the check, the driver named, the sources checked against each other   // 1.5 23 Nov 2026: resource failures by what they do; one table for several failure conditions; outcome definitions; the CMA list; budgets per flight   // 1.4 23 Nov 2026: a backup whose change-over can fail on its own is drawn under its loss as its two ways   // 1.3 17 Nov 2026: no ARP table or figure numbers on the captions   // 1.1 17 Nov 2026: the functional failures are the lines the tool added to each system's FHA; each line's effect on its own is written from the CoFFE table
    var A = root.SLApxAuto, X = root.SLApx, M = root.SLApxMac;
    if (!A || !A.kit || !X || !M || !M.model) { if (typeof module !== 'undefined' && module.exports) module.exports = { VERSION: VERSION, missing: true }; return; }
    var K = A.kit, E = K.E, S = K.S, T = K.T, arr = K.arr, safe = K.safe, lc = K.lc, MM = M.model, note = M.note, joinAnd = MM.joinAnd;
    var PER = 27, COMBO_CAP = 2000;

    function apx() { return K.store(); }
    function rec(fcKey) {
        var s = apx(); if (!s.cof || typeof s.cof !== 'object') s.cof = {};
        var r = s.cof[fcKey]; if (!r || typeof r !== 'object') r = s.cof[fcKey] = {};
        ['a1', 'a2', 'budgets', 'indep', 'outFc', 'outDef'].forEach(function (k) { if (!r[k] || typeof r[k] !== 'object') r[k] = {}; });
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
    // the AFHA failure condition a lesser outcome is, if any ('none': it is not a failure condition of its own)
    function outFc(fc, i) { var r = peek(fc.key) || {}, v = (r.outFc || {})[i]; return v == null ? '' : S(v); }
    function outDef(fc, i) { var r = peek(fc.key) || {}; return T((r.outDef || {})[i] || ''); }
    function linkedOutcomes(fc) {
        var o = outcomes(fc), out = [];
        for (var i = 1; i < o.length - 1; i++) { var k = outFc(fc, i); if (k && k !== 'none') { var f2 = K.fcOf(k); if (f2) out.push({ i: i, name: o[i], fc: f2 }); } }
        return out;
    }
    // the CoFFE table that covers this failure condition as one of its outcomes, if another failure condition's does
    function coveredBy(fc) {
        var hit = null;
        K.fcs().forEach(function (f) { if (hit || f.key === fc.key) return; var r = peek(f.key); if (!r || !r.outFc) return; Object.keys(r.outFc).forEach(function (i) { if (!hit && S(r.outFc[i]) === fc.key && Number(i) < outcomes(f).length - 1) hit = { fc: f, i: Number(i), name: outcomes(f)[Number(i)] }; }); });
        return hit;
    }
    // every other table that names this failure condition as one of its outcomes
    function coveredByAll(fc) {
        var out = [];
        K.fcs().forEach(function (f) { if (f.key === fc.key) return; var r = peek(f.key); if (!r || !r.outFc) return; Object.keys(r.outFc).forEach(function (i) { if (S(r.outFc[i]) === fc.key && Number(i) >= 1 && Number(i) < outcomes(f).length - 1) out.push({ fc: f, i: Number(i), name: outcomes(f)[Number(i)] }); }); });
        return out;
    }
    function ownStarted(fc) { var r = peek(fc.key); return !!(r && (r.ownToo || r.sent || r.wasSent || (r.a1 && Object.keys(r.a1).length))); }
    // The CoFFE sources of a failure condition: its own table, then each table that claims it. Each: { label, owner, i, sol,
    // g, mc, causes(case) }. onlySent: the PASA counts only what was sent.
    function sourcesFor(fc2, onlySent) {
        var out = [];
        if (ownStarted(fc2) && (!onlySent || (peek(fc2.key) || {}).sent) && named(fc2) && ready(fc2)) {
            var s0 = solved(fc2);
            if (s0 && !s0.error && s0.done) { var g0 = gate(fc2, s0); out.push({ own: true, owner: fc2, label: 'its own CoFFE table', sol: s0, g: g0, mc: g0 ? checkGate(g0, (peek(fc2.key) || {}).budgets || {}, fc2) : null, causes: function (c) { return s0.lvl[c] == null ? null : s0.lvl[c] === s0.FL; } }); }
        }
        coveredByAll(fc2).forEach(function (cb) {
            if (onlySent && !(peek(cb.fc.key) || {}).sent) return;
            var s1 = named(cb.fc) && ready(cb.fc) ? solved(cb.fc) : null; if (!s1 || s1.error || !s1.done) return;
            var g1 = linkedGate(cb.fc, s1, cb.i), L = s1.FL - cb.i;
            out.push({ own: false, owner: cb.fc, i: cb.i, name: cb.name, label: 'the outcome "' + cb.name + '" of the CoFFE table for ' + cb.fc.fcId, sol: s1, g: g1, mc: g1 ? checkGate(g1, (peek(cb.fc.key) || {}).budgets || {}, fc2) : null, causes: function (c) { return s1.lvl[c] == null ? null : s1.lvl[c] >= L; } });
        });
        return out;
    }
    // The sources added together (probabilities per flight), turned into a rate per flight hour over fc2's own tree, and the driver.
    function combined(fc2, onlySent) {
        var src = sourcesFor(fc2, onlySent); if (src.length < 2) return { sources: src, n: src.length };
        var withGate = src.filter(function (x) { return x.g; }), open = withGate.filter(function (x) { return !x.mc || x.mc.missing || x.mc.error || x.mc.p == null; });
        if (open.length) return { sources: src, n: src.length, open: open };
        var p = Math.min(1, withGate.reduce(function (a, x) { return a + x.mc.p; }, 0)), drv = withGate.slice().sort(function (a, b) { return b.mc.p - a.mc.p; })[0];
        var tg = target(fc2), TB = root.SLTopBasis, page = safe(function () { return MM.acTree(fc2); }, null), m = tg != null && TB && TB.meets ? safe(function () { return TB.meets(p, tg, page); }, null) : null;
        return { sources: src, n: src.length, p: p, driver: drv || null, share: drv && p > 0 ? drv.mc.p / p : null, target: tg, rate: m ? m.rate : null, hours: m ? m.hours : null, ok: tg == null || !m ? null : m.pass };
    }
    // Where two sources share assembly groups: the cases with one or two failures and everything else working, compared.
    function disagreements2(fc2, onlySent) {
        var src = sourcesFor(fc2, onlySent), out = [];
        for (var a = 0; a < src.length; a++) for (var b = a + 1; b < src.length; b++) {
            var A1 = src[a], B1 = src[b], ida = A1.sol.ds.map(function (d) { return d.id; }), shared = B1.sol.ds.filter(function (d) { return ida.indexOf(d.id) !== -1; });
            var statesOf = function (d) { var da = A1.sol.ds[ida.indexOf(d.id)]; return d.states.filter(function (x) { return x !== 'O' && da.states.indexOf(x) !== -1; }); };
            var caseIn = function (S1, m) { var c = S1.sol.ds.map(function (d) { return m[d.id] || 'O'; }).join(''); return S1.sol.cases.indexOf(c) === -1 ? null : c; };
            var test = function (m, words) { var ca = caseIn(A1, m), cb = caseIn(B1, m); if (!ca || !cb) return; var x = A1.causes(ca), y = B1.causes(cb); if (x == null || y == null || x === y) return; out.push({ what: words, a: A1.label, b: B1.label, aSays: x, bSays: y }); };
            var word = function (d, st) { return evWords(d, st); };
            shared.forEach(function (d, k) {
                statesOf(d).forEach(function (st) { var m = {}; m[d.id] = st; test(m, word(d, st) + ' alone'); });
                shared.slice(k + 1).forEach(function (e) { statesOf(d).forEach(function (s1) { statesOf(e).forEach(function (s2) { var m = {}; m[d.id] = s1; m[e.id] = s2; test(m, word(d, s1) + ' and ' + word(e, s2)); }); }); });
            });
        }
        return out;
    }
    function sourcesHtml(fc2) {
        var src = sourcesFor(fc2, false); if (!src.length) return '';
        var cmb = combined(fc2, false), dis = disagreements2(fc2, false), h = '';
        h += '<div class="apx-cap">The CoFFE sources of ' + E(fc2.fcId) + '</div><div class="apx-tw"><table data-sl-worksheet="1" class="apx-arp"><tr><th>Source</th><th>Probability per flight</th><th>Share</th></tr>'
            + src.map(function (x) { var p = x.mc && x.mc.p != null ? x.mc.p : null; return '<tr><td class="l">' + E(x.label.charAt(0).toUpperCase() + x.label.slice(1)) + '</td><td>' + (!x.g ? 'No mix causes it' : p == null ? 'Budgets not all given' : E(fmt(p))) + '</td><td>' + (cmb.p && p != null ? Math.round(100 * p / cmb.p) + '%' : '') + '</td></tr>'; }).join('') + '</table></div>';
        if (src.length > 1) h += note(cmb.ok === false ? 'bad' : cmb.ok ? 'good' : '', cmb.open ? E(fc2.fcId) + ' has ' + src.length + ' CoFFE sources. They are added together once each has all its budgets (' + E(joinAnd(cmb.open.map(function (x) { return x.label; }))) + ' still to give).'
            : '<b>' + E(fc2.fcId) + ' has ' + src.length + ' CoFFE sources, added together: ' + E(fmt(cmb.p)) + ' per flight' + (cmb.rate != null ? ' = ' + E(fmt(cmb.rate)) + ' per flight hour over a ' + Number(cmb.hours).toFixed(2) + ' h flight, ' + (cmb.ok ? 'within' : 'over') + ' the ' + E(fmt(cmb.target)) + ' objective' : '') + '.</b> Each source is a different route to it, so the figure is their sum: never lower than the true one, exact when the routes never happen in the same flight, and higher than the truth where two sources hold the same combination. ' + (cmb.driver ? 'The driver is ' + E(cmb.driver.label) + ' (' + Math.round(100 * cmb.share) + '%).' : ''));
        if (dis.length) h += note('bad', '<b>Finding: the sources disagree on ' + dis.length + ' case' + (dis.length > 1 ? 's' : '') + '.</b> The same failures with everything else working are answered two ways. Either the answers or the performance data need a second look.') + '<div class="apx-tw"><table data-sl-worksheet="1" class="apx-arp"><tr><th>With everything else working</th><th>Says it causes ' + E(fc2.fcId) + '</th><th>Says it does not</th></tr>' + dis.map(function (x) { return '<tr><td class="l">' + E(x.what.charAt(0).toUpperCase() + x.what.slice(1)) + '</td><td class="l">' + E(x.aSays ? x.a : x.b) + '</td><td class="l">' + E(x.aSays ? x.b : x.a) + '</td></tr>'; }).join('') + '</table></div>';
        return h;
    }
    function candidates(fc) { return K.fcs().filter(function (f) { return f.key !== fc.key; }).sort(function (a, b) { return (b.subId === fc.subId) - (a.subId === fc.subId); }); }
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
    function evWords(d, st) { return st === 'F' ? 'total loss of ' + d.name + (MM.coWays && MM.coWays(d) ? ' (both lost, or ' + d.units[0] + ' lost with the ' + lc(d.co.name) + ' failing)' : '') : st === 'M' ? 'malfunction of ' + d.sysName : 'partial loss of ' + d.name + (st === 'A' || st === 'B' ? ' (' + d.units[st === 'A' ? 0 : 1] + ' lost)' : ''); }
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
    // The gate's probability per flight from the budgets (each a probability per flight), turned into a rate per flight hour
    // over the failure condition's own tree (SLTopBasis: the flight time, then -ln(1 - P) / t) and compared with the objective.
    function checkGate(g, b, fc2) {
        var evs = gateEvents(g), missing = evs.filter(function (e) { var v = b[e.col + '|' + e.st]; return !(v > 0 && v <= 1); });
        if (missing.length) return { g: g, missing: missing.length, of: evs.length };
        var p; try { p = X.gateProbability(g, b); } catch (e) { return { g: g, error: e && e.message ? e.message : String(e) }; }
        var tg = target(fc2), TB = root.SLTopBasis, page = safe(function () { return MM.acTree(fc2); }, null), m = tg != null && TB && TB.meets ? safe(function () { return TB.meets(p.p, tg, page); }, null) : null;
        return { g: g, p: p.p, core: p.core, any: p.any, target: tg, rate: m ? m.rate : null, hours: m ? m.hours : null, source: m ? m.source : null, ok: tg == null || !m ? null : m.pass };
    }
    function mathCheck(fc, sol) { var g = gate(fc, sol); if (!g) return null; return checkGate(g, (peek(fc.key) || {}).budgets || {}, fc); }
    // each lesser outcome that is a failure condition of its own: its gate is "this outcome or worse", on the same budgets
    function linkedGate(fc, sol, i) { var L = sol.FL - i, rows = X.minimal(sol.cases.filter(function (c) { return sol.lvl[c] != null && sol.lvl[c] >= L; }), sol.cols); return rows.length ? X.gate(rows, sol.cols) : null; }
    function linkedChecks(fc, sol) {
        var b = (peek(fc.key) || {}).budgets || {};
        return linkedOutcomes(fc).map(function (o) { var g = linkedGate(fc, sol, o.i); return { i: o.i, name: o.name, fc: o.fc, g: g, mc: g ? checkGate(g, b, o.fc) : null }; });
    }
    // every event that needs a budget: the failure condition's gate, then each linked outcome's; with the failure conditions it serves
    function budgetEvents(fc, sol) {
        var out = [], add = function (e, f) { var k = e.col + '|' + e.st, x = out.filter(function (y) { return y.k === k; })[0]; if (!x) out.push(x = { k: k, e: e, fcs: [] }); if (x.fcs.indexOf(f) === -1) x.fcs.push(f); };
        gateEvents(gate(fc, sol)).forEach(function (e) { add(e, fc.fcId); });
        linkedChecks(fc, sol).forEach(function (l) { gateEvents(l.g).forEach(function (e) { add(e, l.fc.fcId); }); });
        return out;
    }
    function mathWords(mc, g, b, sev) {
        if (!mc) return '';
        var sum = (g.shape === 'core-any' ? g.core.map(function (e) { return fmt(b[e.col + '|' + e.st]); }).join(' x ') + ' x (1 - ' + g.any.map(function (e) { return '(1 - ' + fmt(b[e.col + '|' + e.st]) + ')'; }).join(' x ') + ') = ' + fmt(mc.core) + ' x ' + fmt(mc.any) + ' = ' : 'the exact sum over the ' + g.sets.length + ' combination' + (g.sets.length > 1 ? 's' : '') + ' = ') + fmt(mc.p) + ' per flight';
        if (mc.target == null) return sum + '. No objective is set for this severity.';
        if (mc.rate == null) return sum + '. The flight time is not known here, so it is not compared with the ' + fmt(mc.target) + ' per flight hour objective.';
        return sum + '. Over a ' + Number(mc.hours).toFixed(2) + ' h flight that is ' + fmt(mc.rate) + ' per flight hour, ' + (mc.ok ? 'within' : 'over') + ' the ' + fmt(mc.target) + ' per flight hour objective for ' + sev + '.';
    }
    function fmt(p) { if (!(p > 0) || !isFinite(p)) return '0'; var t = p.toExponential(3).split('e'), m = t[0].replace(/0+$/, ''), e = Number(t[1]); if (m.slice(-1) === '.') m += '0'; return m + 'E' + (e < 0 ? '-' : '+') + String(Math.abs(e)).padStart(2, '0'); }
    function colById(sol, id) { return sol.ds.filter(function (d) { return d.id === id; })[0] || null; }
    // the ways one event can happen: the system's own failure condition, or the loss of a resource that feeds it
    function ways(fc, sol, e) {
        var d = colById(sol, e.col), key = d.isM ? d.colId + '|M' : e.col + '|' + e.st, l = MM.linkOf(fc, key);
        var own = l ? S(l.fcId) : ffId(fc, d.isM ? d.colId : d.id, e.st);
        return { own: own, res: resEvents(fc, d, e.st) };
    }
    // The resource failures that do this to the function (the Interdependence Autopilot's answer for each one it feeds).
    function resEvents(fc, d, st) {
        var out = [];
        K.resPicked(fc).forEach(function (r) {
            var rs = K.resState(fc, r); if (!rs.feeds[d.colId]) return;
            rs.modes.forEach(function (m) {
                var s0 = K.craState(fc, r, m, d.colId); if (!s0) return;
                var hit = d.isM ? s0 === 'wrong' : st === 'F' ? s0 === 'total' : (s0 === 'partial' || s0 === 'total');
                if (!hit) return;
                var sh = K.craShared(m);
                out.push({ id: r.key, name: r.name, mode: m, shared: sh, state: s0, code: sh ? r.name + ' ' + lc(m) : r.name + ' ' + lc(m) + ' to ' + codeOf(d, fc) });
            });
        });
        return out;
    }
    // what each resource failure does that the Interdependence Autopilot has not answered yet, for the columns here
    function craOpen(fc) {
        var out = [], cols = cofCols(fc).filter(function (d) { return !d.isM; }), seen = {};
        K.resPicked(fc).forEach(function (r) { var rs = K.resState(fc, r); rs.modes.forEach(function (m) { cols.forEach(function (d) { var k = r.key + '|' + m + '|' + d.colId; if (seen[k] || !rs.feeds[d.colId]) return; seen[k] = 1; if (!K.craState(fc, r, m, d.colId)) out.push(r.name + ' ' + lc(m) + ' on ' + d.sysName); }); }); });
        return out;
    }
    // Every combination of ways that causes the failure condition, and the ones that rest on one resource.
    function pairs(fc, sol) {
        var g = gate(fc, sol); if (!g) return null;
        var order = K.resPicked(fc).map(function (r) { return r.key; });
        if (g.shape === 'core-any' && g.core.length === 1) {
            var ps = X.resourcePairs(g, function (e) { var w = ways(fc, sol, e); return { own: w.own, res: w.res.map(function (r) { return { id: r.id, code: r.code }; }) }; }, { failure2Order: order });
            if (ps) return finishRows({ shape: 'pairs', rows: ps.map(function (p) { return { n: p.n, parts: p.a.code === p.b.code ? [p.a.code] : [p.a.code, p.b.code], same: p.same }; }) });
        }
        var sets = g.shape === 'core-any' ? g.any.map(function (a) { return g.core.concat([a]); }) : g.sets, rows = [], over = false;
        sets.forEach(function (set) {
            var w = set.map(function (e) { var x = ways(fc, sol, e); return x.res.map(function (r) { return { code: r.code, res: r.id }; }).concat([{ code: x.own, res: null }]); });
            var count = w.reduce(function (n, x) { return n * x.length; }, 1); if (rows.length + count > COMBO_CAP) { over = true; return; }
            (function go(i, acc) { if (i === w.length) { var r0 = acc[0].res, same = r0 !== null && acc.every(function (x) { return x.res === r0; }) ? r0 : null; rows.push({ n: rows.length + 1, parts: acc.map(function (x) { return x.code; }), same: same }); return; } w[i].forEach(function (x) { go(i + 1, acc.concat([x])); }); })(0, []);
        });
        return over ? { shape: 'over', rows: [], why: 'There are over ' + COMBO_CAP + ' combinations. The tool does not list part of a table; reduce the columns or the shared resources.' } : finishRows({ shape: 'sets', rows: rows, width: Math.max.apply(null, sets.map(function (x) { return x.length; }).concat([2])) });
    }
    // A shared event that reaches two branches makes a "pair" of itself: that is ONE failure. It is listed once, as a single,
    // and every combination it makes larger is dropped (not a minimal cut set). The rest keep their order and are numbered again.
    function finishRows(P) {
        P.rows.forEach(function (r) { var u = []; r.parts.forEach(function (x) { if (u.indexOf(x) === -1) u.push(x); }); r.parts = u; });
        var singles = P.rows.filter(function (r) { return r.parts.length === 1; }).map(function (r) { return r.parts[0]; });
        if (singles.length) P.rows = P.rows.filter(function (r) { return r.parts.length === 1 ? P.rows.filter(function (q) { return q.parts.length === 1 && q.parts[0] === r.parts[0]; })[0] === r : !r.parts.some(function (x) { return singles.indexOf(x) !== -1; }); });
        P.rows.forEach(function (r, k) { r.n = k + 1; r.single = r.parts.length === 1; if (r.single) r.same = null; });
        P.singles = P.rows.filter(function (r) { return r.single; });
        return P;
    }
    // Table Q.4-12: the combinations the CMA assesses (the ones that do not rest on one resource), with the principles they stand for
    function cmaList(fc, sol) {
        var P = pairs(fc, sol); if (!P || P.shape === 'over') return null;
        return { rows: P.rows.filter(function (r) { return !r.same && !r.single; }), principles: indepList(fc, sol).filter(function (x) { return x.on && !x.single; }) };
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
            var lf = lv == null ? null : linkedOutcomes(fc).filter(function (o) { return o.i === sol.FL - lv; })[0];
            M.model.setEffect(row, fc.fcId, 'own', lv == null ? '' : 'On its own, with the other systems working: ' + lc(levelName(fc, sol, lv)) + (lf ? ', which is ' + lf.fc.fcId + (lf.fc.sev ? ' (' + lf.fc.sev + ')' : '') : lv === sol.FL ? ', which is ' + fc.fcId : '') + ' (CoFFE case ' + (sol.cases.indexOf(c) + 1) + ' of ' + fc.fcId + ').'); n++;
        });
        return n;
    }
    function status(fc) { var r = peek(fc.key) || {}; return r.sent ? { k: 'sent', by: r.sent.by, at: r.sent.at } : r.changedSince ? { k: 'changed' } : Object.keys(r.a1 || {}).length || r.sig || r.wasSent ? { k: 'started' } : { k: 'new' }; }
    function left(fc) {
        var out = [];
        if (!MM.macCols(fc).length) { out.push('No system is checked for this failure condition. Do the Interdependence Autopilot first.'); return out; }
        if (!ready(fc)) { out.push('Set how every system is built in the MAC Autopilot first.'); return out; }
        if (!named(fc)) { out.push('Name every outcome.'); return out; }
        var sol = solved(fc); if (sol.error) { out.push(sol.error); return out; }
        if (!sol.done) out.push((sol.p1done ? sol.open2.length : sol.open1.length) + ' question' + ((sol.p1done ? sol.open2.length : sol.open1.length) > 1 ? 's are' : ' is') + ' still open.');
        var o = outcomes(fc), nd = [], nl = [];
        for (var i = 0; i < o.length - 1; i++) { if (!outDef(fc, i)) nd.push(i === 0 ? (o[0] || fc.desc) : o[i]); if (i > 0 && !outFc(fc, i)) nl.push(o[i]); }
        if (nd.length) out.push('Say what ' + joinAnd(nd.map(function (x) { return '"' + x + '"'; })) + ' means (Name the outcomes), for example: above 30 knots.');
        if (nl.length) out.push('Say whether ' + joinAnd(nl.map(function (x) { return '"' + x + '"'; })) + ' is a failure condition of its own in the AFHA (Name the outcomes).');
        var co = craOpen(fc); if (co.length) out.push('Say what each resource failure does in the Interdependence Autopilot (What each failure does): ' + co.length + ' not answered, for example ' + co[0] + '.');
        return out;
    }

    // ---- actions ---------------------------------------------------------------------------------------------------------------
    var ui = { page: 0, how: false };
    function setOutcome(fc, i, text) { var r = rec(fc.key); if (r.outcomes[0] === '' && i !== 0) r.outcomes[0] = fc.desc; if (i < r.outcomes.length) r.outcomes[i] = T(text); touched(fc.key); }
    function addOutcome(fc) { var r = rec(fc.key); if (!T(r.outcomes[0])) r.outcomes[0] = fc.desc; var at = r.outcomes.length - 1; r.outcomes.splice(at, 0, ''); shiftOut(r, at, 1); sync(fc); touched(fc.key); }
    // the per-outcome answers follow their outcome when one is added or removed
    function shiftOut(r, from, by) { ['outFc', 'outDef'].forEach(function (k) { var m = r[k] || {}, n = {}; Object.keys(m).forEach(function (i) { var j = Number(i); if (by < 0 && j === from) return; n[j >= from ? j + by : j] = m[i]; }); r[k] = n; }); }
    function removeOutcome(fc, i) { var r = rec(fc.key); if (r.outcomes.length <= 2 || i <= 0 || i >= r.outcomes.length) return; r.outcomes.splice(i, 1); shiftOut(r, i, -1); sync(fc); touched(fc.key); }
    function setOutFc(fc, i, key) { var r = rec(fc.key); if (!(i >= 1 && i < r.outcomes.length - 1)) return false; if (key && key !== 'none' && (key === fc.key || !K.fcOf(key))) return false; if (key) r.outFc[i] = key; else delete r.outFc[i]; touched(fc.key); return true; }
    function setOutDef(fc, i, t) { var r = rec(fc.key); if (!(i >= 0 && i < r.outcomes.length - 1)) return false; r.outDef[i] = T(t); touched(fc.key); return true; }
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
        var sol9 = solved(fc), cm = sol9 && sol9.done ? cmaList(fc, sol9) : null, st9 = apx(); if (!st9.cma || typeof st9.cma !== 'object') st9.cma = {};
        st9.cma[fc.key] = cm ? { fcId: fc.fcId, cases: cm.rows.map(function (x) { return x.parts.slice(); }), principles: cm.principles.map(function (x) { return { id: 'PASA-' + x.key, text: x.text }; }), by: name, at: r.sent.at } : null;
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
        return one('System functional failures and SFHA failure conditions: Total loss', R.total) + one('System functional failures and SFHA failure conditions: Partial loss', R.partial) + one('System functional failures and SFHA failure condition: malfunction', R.malf) + K.abbr([['FF', 'Functional Failure'], ['SFHA', 'System Functional Hazard Assessment']]);
    }
    function tableQ46(fc, sol) {
        var pages = Math.ceil(sol.cases.length / PER) || 1; ui.page = Math.max(0, Math.min(ui.page, pages - 1));
        var slice = sol.cases.slice(ui.page * PER, ui.page * PER + PER), how = ui.how;
        return '<div class="apx-cap">CoFFE table</div><div class="apx-pager" style="justify-content:center"><button class="apx-btn" data-apx-x="page|-1"' + (ui.page === 0 ? ' disabled' : '') + '>Previous</button><b>Cases ' + (ui.page * PER + 1) + ' to ' + Math.min(sol.cases.length, ui.page * PER + PER) + ' of ' + sol.cases.length + '</b><button class="apx-btn" data-apx-x="page|1"' + (ui.page >= pages - 1 ? ' disabled' : '') + '>Next</button></div>'
            + '<div class="apx-tw"><table data-sl-worksheet="1" class="apx-arp"><tr><th>Case #</th>' + heads(fc, sol.ds) + '<th>' + E(resName(fc)) + '</th>' + (how ? '<th>Decided by</th>' : '') + '</tr>'
            + slice.map(function (c) { var n = sol.cases.indexOf(c) + 1, lv = sol.lvl[c]; return '<tr><td>' + n + '</td>' + c.split('').map(function (s, i) { return cellTd(sol.ds[i], s); }).join('') + '<td>' + E(lv == null ? '' : levelName(fc, sol, lv)) + '</td>' + (how ? '<td>' + (lv == null ? '' : sol.src[c] === 'you' ? 'You' : 'Logic') + '</td>' : '') + '</tr>'; }).join('') + '</table></div>'
            + legend(fc, sol.ds) + '<p style="text-align:center"><label style="cursor:pointer"><input type="checkbox" data-apx-xc="how"' + (how ? ' checked' : '') + '> Show who decided each case (not printed in the PASA)</label></p>';
    }
    function tableQ47(fc, sol) {
        var rows = summaryRows(fc, sol), tr = '';
        for (var lv = sol.FL; lv >= 0; lv--) { var rs = rows.filter(function (r) { return r.level === lv; }), con = conclusions(fc, rs, lv, sol); rs.forEach(function (r, j) { tr += '<tr>' + r.c.split('').map(function (s, i) { return cellTd(sol.ds[i], s); }).join('') + '<td>' + E(levelName(fc, sol, lv)) + '</td>' + (con[j] && con[j].skip ? '' : '<td class="l"' + (con[j] && con[j].span > 1 ? ' rowspan="' + con[j].span + '"' : '') + '>' + (con[j] ? E(con[j].t) : '') + '</td>') + '</tr>'; }); }
        return '<div class="apx-cap">CoFFE table summary</div><div class="apx-tw"><table data-sl-worksheet="1" class="apx-arp"><tr>' + heads(fc, sol.ds) + '<th>' + E(resName(fc)) + '</th><th>Conclusion</th></tr>' + tr + '</table></div>';
    }
    function tableQ48(fc, sol) {
        var rs = fcRows(fc, sol), con = conclusions(fc, rs, sol.FL, sol).filter(function (x) { return x && !x.skip; });
        return '<div class="apx-cap">CoFFE table result: ' + E(outcomeName(fc, 0)) + '</div><div class="apx-tw"><table data-sl-worksheet="1" class="apx-arp"><tr>' + heads(fc, sol.ds) + '<th>' + E(resName(fc)) + '</th></tr>' + (rs.length ? rs.map(function (r) { return '<tr>' + r.c.split('').map(function (s, i) { return cellTd(sol.ds[i], s); }).join('') + '<td>' + E(outcomeName(fc, 0)) + '</td></tr>'; }).join('') : '<tr><td class="l" colspan="' + (sol.ds.length + 1) + '">No mix of these failures causes it.</td></tr>') + '</table></div>'
            + (con.length ? '<p style="margin:12px 0 0">Through the CoFFE analysis it can be concluded that: ' + con.map(function (x) { return '"' + E(x.t.charAt(0).toLowerCase() + x.t.slice(1)) + '"'; }).join('; ') + '.</p>' : '');
    }
    // 23 Nov 2026: a group built as one unit backing up the other, whose change-over can fail on its own, is not working two
    // ways; both are drawn under its loss. The budget stays on the loss event: it covers both ways.
    function evInside(d, st) {
        var w = st === 'F' && MM.coWays ? MM.coWays(d) : null; if (!w) return '';
        var li = function (x) { return '<div class="apx-tli">' + x + '</div>'; };
        return ' <span class="apx-gate">OR</span><div class="apx-tul">' + li(' <span class="apx-gate">AND</span><div class="apx-tul">' + w[0].parts.map(function (x) { return li(E(x)); }).join('') + '</div>') + li(' <span class="apx-gate">AND</span><div class="apx-tul">' + w[1].parts.map(function (x) { return li(E(x)); }).join('') + '</div>') + '</div>';
    }
    function evNode(fc, sol, e) {
        var d = colById(sol, e.col), head = '<b>' + E(ffId(fc, d.isM ? d.colId : d.id, e.st)) + '</b> ' + E(evWords(d, e.st).replace(/^./, function (x) { return x.toUpperCase(); }));
        var w = ways(fc, sol, e), inside = d.isM ? '' : evInside(d, e.st);
        if (!w.res.length) return head + inside;
        var li = function (x) { return '<div class="apx-tli">' + x + '</div>'; };
        return head + ' <span class="apx-gate">OR</span><div class="apx-tul">' + li('<b>' + E(w.own) + '</b> ' + E(d.isM ? d.sysName + ' doing the wrong thing' : (e.st === 'F' ? 'Total loss of ' : 'Partial loss of ') + d.name) + inside)
            + w.res.map(function (r) { return li(E(r.code) + (r.shared ? ' <span class="apx-tag">shared</span>' : '')); }).join('') + '</div>';
    }
    function gateHtml(fc, sol) {
        var g = gate(fc, sol), alone = MM.aloneMalf(fc), li = function (x) { return '<div class="apx-tli">' + x + '</div>'; }, inner = '';
        if (g && g.shape === 'core-any') inner = ' <span class="apx-gate">AND</span><div class="apx-tul">' + g.core.map(function (e) { return li(evNode(fc, sol, e)); }).join('') + li('<b>Any one of these further failures</b><span class="apx-gate">OR</span><div class="apx-tul">' + g.any.map(function (e) { return li(evNode(fc, sol, e)); }).join('') + '</div>') + '</div>';
        else if (g) inner = ' <span class="apx-gate">OR</span><div class="apx-tul">' + g.sets.map(function (set) { return li(set.length > 1 ? ' <span class="apx-gate">AND</span><div class="apx-tul">' + set.map(function (e) { return li(evNode(fc, sol, e)); }).join('') + '</div>' : evNode(fc, sol, set[0])); }).join('') + '</div>';
        return '<div class="apx-cap">The gate under ' + E(fc.fcId) + '</div><div class="apx-tree"><div class="apx-tul"><div class="apx-tli"><b>' + E(fc.fcId) + '</b> ' + E(fc.desc) + (fc.phases ? ' (' + E(fc.phases) + ')' : '') + ' <span class="apx-gate">OR</span><div class="apx-tul">'
            + (g ? li('<b>' + E(fc.fcId) + '.CoFFE</b> Combined loss resulting in ' + E(lc(outcomeName(fc, 0))) + inner) : '') + alone.map(function (m) { return li('<b>' + E(ffId(fc, m.colId, 'M')) + '</b> ' + E(m.sysName) + ' doing the wrong thing, resulting in ' + E(lc(outcomeName(fc, 0)))); }).join('') + '</div></div></div></div>';
    }
    function tablePairs(fc, sol) {
        var P = pairs(fc, sol); if (!P) return { main: '', same: '' };
        if (P.shape === 'over') return { main: note('warn', E(P.why)), same: '' };
        var w = P.shape === 'pairs' ? 2 : P.width, hd = ''; for (var i = 1; i <= w; i++) hd += '<th>Failure ' + i + '</th>';
        var row = function (r) { var tds = ''; for (var k = 0; k < w; k++) tds += '<td class="l">' + E(r.parts[k] || (r.single && k === 1 ? 'Alone: a single failure' : '--')) + '</td>'; return '<tr><td>' + r.n + '</td>' + tds + '</tr>'; };
        var PP = 30, pages = Math.ceil(P.rows.length / PP) || 1; ui.ppage = Math.max(0, Math.min(ui.ppage || 0, pages - 1));
        var main = '<div class="apx-cap">Potential failure combinations (fault tree cut sets)</div>' + (pages > 1 ? '<div class="apx-pager" style="justify-content:center"><button class="apx-btn" data-apx-x="ppage|-1"' + (ui.ppage === 0 ? ' disabled' : '') + '>Previous</button><b>Cases ' + (ui.ppage * PP + 1) + ' to ' + Math.min(P.rows.length, ui.ppage * PP + PP) + ' of ' + P.rows.length + '</b><button class="apx-btn" data-apx-x="ppage|1"' + (ui.ppage >= pages - 1 ? ' disabled' : '') + '>Next</button></div>' : '') + '<div class="apx-tw"><table data-sl-worksheet="1" class="apx-arp"><tr><th>Cases</th>' + hd + '</tr>' + P.rows.slice(ui.ppage * PP, ui.ppage * PP + PP).map(row).join('') + '</table></div>';
        var so = 2, same = '';
        K.resPicked(fc).forEach(function (r) { var rs = P.rows.filter(function (x) { return x.same === r.key; }); if (!rs.length) return; same += '<div class="apx-cap">' + E(r.name) + ' common source failures</div><div class="apx-tw"><table data-sl-worksheet="1" class="apx-arp"><tr><th>Cases</th>' + hd + '</tr>' + rs.map(row).join('') + '</table></div>' + note('', 'Proposed requirement: no single failure or event results in the loss of all ' + E(lc(r.name)) + ', and it is extremely improbable <b>[PASA-SO-' + String(so++).padStart(2, '0') + ']</b>. ' + E(r.name) + ' should be distributed so that it also meets the independence principles. These go to the PRA, ZSA, CMA and the PSSA of the system that provides it.'); });
        var cm = cmaList(fc, sol), cma = '';
        if (cm && cm.rows.length) cma = '<div class="apx-cap">Multisystem and multifunction combinations for the CMA</div><div class="apx-tw"><table data-sl-worksheet="1" class="apx-arp"><tr><th>Cases</th>' + hd + '</tr>' + cm.rows.map(row).join('') + '</table></div>' + note('', 'These do not rest on one resource, so the Common Mode Analysis assesses them for common causes (design, specification, requirements, development process, manufacturing, installation, maintenance)' + (cm.principles.length ? ', against ' + E(joinAnd(cm.principles.map(function (x) { return 'PASA-' + x.key; }))) : '') + '.');
        return { main: main, same: same, cma: cma, rows: P.rows, singles: P.singles || [] };
    }

    // ---- the page ---------------------------------------------------------------------------------------------------------------
    var CSS = '.apx-out{display:grid;grid-template-columns:minmax(160px,1fr) minmax(0,1.4fr) minmax(0,1.4fr);gap:10px;align-items:center;padding:8px 10px;margin:0 0 8px;border:1.5px solid var(--color-border,rgba(20,23,28,.3));border-radius:10px}.apx-out.open{border-color:#B26A00;border-width:2px}@media(max-width:760px){.apx-out{grid-template-columns:1fr}}' + '.apx-tree .apx-tul{margin:6px 0 0;padding-left:22px;border-left:2px solid var(--color-border-strong,#14171C)}.apx-tree>.apx-tul{border-left:0;padding-left:0}.apx-tree .apx-tli{margin:6px 0;padding:6px 10px;border:1px solid var(--color-border,rgba(20,23,28,.3));border-radius:10px;background:var(--color-surface-1,#fff)}'
        + '.apx-gate{display:inline-block;margin-left:8px;font-size:11.5px;font-weight:700;border:1.5px solid currentColor;border-radius:6px;padding:0 6px}'
        + '.apx-case{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:8px 0 12px}.apx-st{border:1.5px solid var(--color-border,rgba(20,23,28,.3));border-radius:12px;padding:10px 12px}.apx-st b{display:block}'
        + '.apx-st.O{border-color:#0B7A3E;background:rgba(11,122,62,.1)}.apx-st.F{border-color:#B42318;background:rgba(180,35,24,.1)}.apx-st.D{border-color:#9A5B00;background:rgba(154,91,0,.1)}.apx-st.M{border-color:#6E3CBE;background:rgba(110,60,190,.1)}'
        + '.apx-btn.sug{outline:3px solid #1A6EF2;outline-offset:2px}.apx-math{display:grid;grid-template-columns:90px minmax(0,1fr) 180px auto;gap:8px 12px;align-items:center;margin:0 0 8px}@media (max-width:760px){.apx-math{grid-template-columns:1fr}}';
    function style() { M.style(); if (typeof document === 'undefined' || document.getElementById('apx-style-cof')) return; var st = document.createElement('style'); st.id = 'apx-style-cof'; st.textContent = CSS; document.head.appendChild(st); }
    function card(q, help, body) { return K.card(q, help, body); }
    function need(fc, title) {
        var cbs = coveredByAll(fc);
        if (cbs.length && !ownStarted(fc)) return card(title, E(fc.fcId) + ' is ' + E(joinAnd(cbs.map(function (cb) { return 'the outcome "' + cb.name + '" of the CoFFE table for ' + cb.fc.fcId; }))) + '. ' + (cbs.length > 1 ? 'Those tables cover it, so there is no table of its own here. Its figure is theirs added together.' : 'One table covers both, so there is no second table here. Its own math check and its PASA part come from that table.'),
            cbs.map(function (cb) { return '<button class="apx-btn p" style="margin:0 8px 8px 0" data-apx-x="gofc|' + E(cb.fc.key) + '">Open the CoFFE for ' + E(cb.fc.fcId) + '</button>'; }).join('') + '<button class="apx-btn" style="margin:0 0 8px" data-apx-x="owntoo">Give ' + E(fc.fcId) + ' a table of its own as well</button>' + sourcesHtml(fc));
        if (!MM.macCols(fc).length) return card(title, 'No system is checked for this failure condition yet. Do the Interdependence Autopilot first.', '<button class="apx-btn p" data-apx-ap="idp">Open the Interdependence Autopilot</button>');
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
    function outcomeAnswers(fc) {
        var o = outcomes(fc), cands = candidates(fc), h = '';
        for (var i = 0; i < o.length - 1; i++) {
            var nm = i === 0 ? (o[0] || fc.desc) : o[i], lk = i > 0 ? outFc(fc, i) : '', def = outDef(fc, i);
            h += '<div class="apx-out' + (!def || (i > 0 && !lk) ? ' open' : '') + '"><div><b>' + E(nm || 'Outcome ' + (i + 1)) + '</b>' + (i === 0 ? ' <span class="apx-tag">' + E(fc.fcId) + '</span>' : '') + '</div>'
                + '<input type="text" data-apx-xc="outdef|' + i + '" value="' + E(def) + '" placeholder="What it means, for example: overrun above 30 knots" aria-label="What ' + E(nm) + ' means">'
                + (i > 0 ? '<select data-apx-xc="outfc|' + i + '" aria-label="Is ' + E(nm) + ' a failure condition of its own"><option value="">Is it a failure condition of its own in the AFHA?</option><option value="none"' + (lk === 'none' ? ' selected' : '') + '>No, it is not a failure condition of its own</option>' + cands.map(function (f) { return '<option value="' + E(f.key) + '"' + (lk === f.key ? ' selected' : '') + '>' + E(f.fcId) + ' ' + E(f.desc) + (f.sev ? ' (' + E(f.sev) + ')' : '') + '</option>'; }).join('') + '</select>' : '<span style="font-size:12.5px">This is the failure condition the table is for.</span>')
                + '</div>';
        }
        return h + '<p style="font-size:12.5px;margin:6px 0 0">What each outcome means goes to the PASA as an assumption. An outcome that is a failure condition of its own gets its own math check from this table (in the book, wheel brakes alone give a low-speed overrun, which is Hazardous and sets the wheel brake budget), and its CoFFE is this table: no second one.</p>';
    }
    function stepOutcomes(fc) {
        var n = need(fc, 'What can happen? List the outcomes, worst first.'); if (n) return n;
        var o = outcomes(fc), r = peek(fc.key) || {};
        var rows = o.map(function (x, k) { return '<div class="apx-tick' + (k === 0 ? ' on' : '') + '" style="grid-template-columns:90px minmax(0,1fr) auto"><b>' + (k === 0 ? 'Worst' : k === o.length - 1 ? 'Best' : 'Next') + '</b><input type="text" data-apx-xc="out|' + k + '" value="' + E(k === 0 ? (x || fc.desc) : x) + '" placeholder="' + (k === o.length - 1 ? 'For example: no overrun' : 'For example: low-speed overrun') + '" aria-label="Outcome ' + (k + 1) + '"><span>' + (k === 0 ? 'This is the failure condition' : o.length > 2 ? '<button class="apx-btn" data-apx-x="delout|' + k + '">Remove</button>' : '') + '</span></div>'; }).join('');
        var body = '<div class="apx-eff" style="margin-bottom:14px"><div><b>Result column name</b></div><div><input type="text" data-apx-xc="resname" value="' + E(r.resultName || '') + '" placeholder="For example: Stopping Capability Result" aria-label="Result column name"></div></div><div class="apx-ticks">' + rows + '</div><button class="apx-btn" style="margin-top:10px" data-apx-x="addout">+ Add an outcome in between</button>'
            + '<h4 style="margin:18px 0 8px">What each outcome means, and whether it is a failure condition of its own</h4>' + outcomeAnswers(fc)
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
        return card('The full CoFFE table', '', note(sol.done ? 'good' : 'warn', sol.done ? 'All ' + sol.cases.length + ' cases are filled. This is the CoFFE table exactly as the PASA will show it.' : 'Some cases are still open. Go back to the questions to finish.')) + K.preview('', tableQ46(fc, sol));
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
        var g = gate(fc, sol), r = peek(fc.key) || {}, b = r.budgets || {}, mc = mathCheck(fc, sol), evs = budgetEvents(fc, sol), lk = linkedChecks(fc, sol);
        var bud = evs.map(function (x) { var e = x.e, d = colById(sol, e.col), k = x.k; return '<div class="apx-math"><b>' + E(ffId(fc, d.isM ? d.colId : d.id, e.st)) + '</b><span>' + E(evWords(d, e.st).replace(/^./, function (y) { return y.toUpperCase(); })) + (lk.length ? '<span style="display:block;font-size:12px">Used by ' + E(joinAnd(x.fcs)) + '</span>' : '') + '</span><input type="text" data-apx-xc="bud|' + E(k) + '" value="' + (b[k] ? E(fmt(b[k])) : '') + '" placeholder="For example 1E-07" aria-label="Budget"><span>per flight</span></div>'; }).join('');
        var check = !mc ? '' : mc.error ? note('bad', E(mc.error)) : mc.missing ? note('', 'Give every event a budget, as a probability per flight, and the tool checks the math against the objective' + (target(fc) != null ? ' (' + fmt(target(fc)) + ' per flight hour for ' + E(fc.sev) + ')' : '') + '. ' + mc.missing + ' of ' + mc.of + ' still to give.')
            : note(mc.ok === false ? 'bad' : mc.ok ? 'good' : '', '<b>Math check, ' + E(fc.fcId) + ':</b> ' + E(mathWords(mc, g, b, fc.sev)) + (mc.ok === false ? ' Lower one of the budgets.' : mc.ok ? ' The budgets fit.' : '') + ' The events are taken as independent, which the independence principles below must make true.');
        check += lk.map(function (l) { var oth = sourcesFor(l.fc, false).length > 1 ? note('', E(l.fc.fcId) + ' has other CoFFE sources too; its figure is all of them added together: see the CoFFE for ' + E(l.fc.fcId) + '.') : ''; return oth + (function () { var m2 = l.mc; if (!l.g) return note('', '"' + E(l.name) + '" (' + E(l.fc.fcId) + '): no mix in this table causes it.'); return !m2 || m2.missing ? note('', '<b>' + E(l.fc.fcId) + '</b> is the outcome "' + E(l.name) + '". Give its events a budget too and the tool checks it against ' + E(l.fc.fcId) + '\'s objective.') : m2.error ? note('bad', E(m2.error)) : note(m2.ok === false ? 'bad' : m2.ok ? 'good' : '', '<b>Math check, ' + E(l.fc.fcId) + ' (the outcome "' + E(l.name) + '" or worse, ' + E(l.fc.sev) + '):</b> ' + E(mathWords(m2, l.g, b, l.fc.sev)) + (m2.ok === false ? ' Lower one of its budgets: an event used by more than one failure condition must meet the strictest.' : '')); })(); }).join('');
        var ip = indepList(fc, sol).map(function (x) { return '<div class="apx-tick' + (x.on ? ' on' : '') + '" style="grid-template-columns:26px minmax(0,1fr)"><button type="button" class="apx-box" data-apx-x="ip|' + x.key + '" aria-pressed="' + x.on + '" aria-label="' + E(x.key) + '"></button><span>' + E(x.text) + ' <b>[PASA-' + x.key + ']</b></span></div>'; }).join('');
        return card('What the CoFFE feeds', 'All worked out by the tool from your answers. You give the budgets and confirm the principles.', gateHtml(fc, sol) + '<h4 style="margin:20px 0 8px">Probability budgets</h4>' + (bud || '<p>Nothing to budget: no mix causes the failure condition.</p>') + check + '<h4 style="margin:20px 0 8px">Independence principles</h4><div class="apx-ticks">' + (ip || '<p>None: no combination causes the failure condition.</p>') + '</div>');
    }
    function stepCommon(fc) {
        var n = need(fc, 'Common resource pairs, then send'); if (n) return n;
        var sol = named(fc) ? solved(fc) : null, l = left(fc), st = status(fc);
        var T9 = sol && !sol.error && sol.done ? tablePairs(fc, sol) : { main: '', same: '' };
        var body = note('', 'The tool takes the gate, adds the shared resources from your Interdependence answers, and lists every combination of failures that causes the failure condition. The ones where every failure comes from the same resource are pulled out below. Nothing to type here.') + (l.length ? note('warn', l.map(E).join('<br>')) : '');
        if (st.k === 'sent') body += '<div class="apx-sent"><b>Sent to the PASA.</b> Signed by <b>' + E(st.by) + '</b> on ' + E(S(st.at).slice(0, 10)) + '. The PASA now shows the CoFFE tables for ' + E(fc.fcId) + ', the gate, the budgets and the independence principles.</div>' + K.takeOut(fc, 'cof');
        else body += (st.k === 'changed' ? note('warn', 'Something changed since this was sent. Send it again to bring the PASA up to date.') : '')
            + '<div class="apx-eff" style="margin-top:14px"><div><b>Sign with your name</b></div><div><input type="text" data-apx-sign="1" value="' + E(K.ui.sign != null ? K.ui.sign : K.who()) + '" placeholder="One signature covers this CoFFE" aria-label="Sign with your name"></div></div>' + (K.ui.signMiss ? note('bad', E(K.ui.signMiss)) : '')
            + '<button class="apx-btn p big" style="margin-top:12px" data-apx-x="send"' + (l.length ? ' disabled' : '') + '>Send to the PASA</button>';
        if (T9.singles && T9.singles.length) body = note('bad', '<b>Finding: a single failure causes ' + E(fc.fcId) + '.</b> ' + E(joinAnd(T9.singles.map(function (r) { return r.parts[0]; }))) + (T9.singles.length > 1 ? ' each reach' : ' reaches') + ' more than one branch of the gate, so on ' + (T9.singles.length > 1 ? 'its' : 'its') + ' own it causes the failure condition. ' + (/catastrophic|hazardous/i.test(fc.sev) ? 'That is not allowed for a ' + E(fc.sev) + ' failure condition; the design has to change.' : '')) + body;
        return card('Common resource pairs, then send', '', body) + (T9.main ? K.preview('', T9.main) : '') + (T9.same ? K.preview('', T9.same) : '') + (T9.cma ? K.preview('', T9.cma) : '');
    }
    function render(i, fc) {
        style(); var h = [null, stepLinks, stepOutcomes, stepQuestions, stepFull, stepSummary, stepFeeds, stepCommon][i](fc);
        var cbs = coveredByAll(fc);
        if (cbs.length && ownStarted(fc)) h = card('This failure condition has more than one CoFFE source', E(fc.fcId) + ' has a table of its own and is also ' + E(joinAnd(cbs.map(function (cb) { return 'the outcome "' + cb.name + '" of the CoFFE table for ' + cb.fc.fcId; }))) + '. Both are kept and shown; the figure checked against its objective is their sum.', sourcesHtml(fc)) + h;
        return h;
    }
    function click(action, arg, el, fc) {
        var a;
        if (action === 'mkfc') return M.click(action, arg, el, fc);
        if (action === 'gofc') { K.ui.fc = arg; K.ui.step = 1; return true; }
        if (action === 'owntoo') { rec(fc.key).ownToo = { by: K.who(), at: K.now() }; touched(fc.key); return true; }
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
        if (action === 'outdef') { setOutDef(fc, Number(arg), el.value); return true; }
        if (action === 'outfc') { setOutFc(fc, Number(arg), el.value); return true; }
        if (action === 'how') { ui.how = !!el.checked; return true; }
        if (action === 'bud') { if (!setBudget(fc, arg, el.value)) K.toast('A budget is a probability: more than 0, at most 1 (for example 1E-07).', 'warning'); return true; }
        return false;
    }

    var api = { VERSION: VERSION,
        model: { coveredByAll: coveredByAll, ownStarted: ownStarted, sourcesFor: sourcesFor, combined: combined, disagreements2: disagreements2, sourcesHtml: sourcesHtml, resEvents: resEvents, craOpen: craOpen, finishRows: finishRows, cmaList: cmaList, outFc: outFc, outDef: outDef, linkedOutcomes: linkedOutcomes, coveredBy: coveredBy, linkedGate: linkedGate, linkedChecks: linkedChecks, budgetEvents: budgetEvents, checkGate: checkGate, mathWords: mathWords, ways: ways, colById: colById, evInside: evInside, cofCols: cofCols, ready: ready, solved: solved, next: next, outcomes: outcomes, outcomeName: outcomeName, named: named, macSays: macSays, disagreements: disagreements, caseText: caseText, codeOf: codeOf, ffId: ffId, ffRows: ffRows, summary: summaryRows, conclusions: conclusions, fcRows: fcRows, shortest: shortest, gate: gate, gateEvents: gateEvents, mathCheck: mathCheck, target: target, pairs: pairs, indepList: indepList, status: status, ownEffects: ownEffects, left: left, peek: peek, oldVerdicts: oldVerdicts, resName: resName, levelName: levelName, fmt: fmt, evWords: evWords, colById: colById },
        act: { setOutFc: setOutFc, setOutDef: setOutDef, setOutcome: setOutcome, addOutcome: addOutcome, removeOutcome: removeOutcome, setResultName: setResultName, answer: answer, undo: undo, clearAnswers: clearAnswers, setBudget: setBudget, setIndep: setIndep, send: send, convert: convert },
        tables: { q43: tableQ43, q46: tableQ46, q47: tableQ47, q48: tableQ48, gate: gateHtml, pairs: tablePairs }, _ui: ui };
    A.register('cof', { name: 'CoFFE', steps: ['Failure condition', 'The system failures and their FHA lines', 'Name the outcomes', 'Answer the quick questions', 'The full CoFFE table', 'Summary and result', 'Fault tree, budgets and independence', 'Common resource pairs and send'], render: render, click: click, change: change, status: status });
    try { root.SLApxCof = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
