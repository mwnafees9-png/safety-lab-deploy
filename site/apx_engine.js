/* ============================================================================
 * apx_engine.js (SLApx v1.0, 15 Nov 2026): the math under the Interdependence, MAC and CoFFE Autopilots.
 *
 * Waqas, 15 Nov 2026: three Autopilots that ask, and a PASA that only shows, with the tables "exactly" those of the
 * ARP4761A contiguous example (Appendix Q): interdependence (Q.4-1, Q.4-2), common resource analysis (B3), CoFFE
 * (Q.4-3 to Q.4-8), the fault tree gate (Figure Q.4-1) and the common resource pairs (Q.4-9 to Q.4-11). They replace
 * today's Interdependence, MAC and CoFFE screens, "so we have to absolutely nail this". His rulings this module holds:
 *
 *   - AIRCRAFT-LEVEL MAC RULES ARE NAMED COMBINATIONS OF ASSEMBLIES, never "k of n" ("if you lose right aileron and
 *     right spoiler it will result in loss of roll control"). There is no MAC below the aircraft level: a system's
 *     fault tree is built from its architecture and linked up.
 *   - Questions stay at SUB-SYSTEM / ASSEMBLY level (brake pairs, LH and RH reversers), never items.
 *   - An UNEVEN loss is its own question. On an assembly where side matters, "one side lost" is never assumed from
 *     the answer for "both lost", in either direction (one reverser lost can be worse than both lost). The engineer
 *     is never asked "can losing more make it better" ("seems like a dumb question"): the side setting decides it.
 *   - Left and right may MIRROR each other across the aircraft: one answer covers a mix and its mirror image.
 *   - Every answer the tool fills in by itself names the engineer's answer it came from. No AI in here, and nothing
 *     is ever guessed: a mix no answer covers is asked.
 *   - "going forward math must stay at the highest standard possible": every result here is exact. A table too
 *     large to enumerate is REFUSED with its size, never sampled or approximated.
 *
 * THE MODEL
 *   A column is one assembly group that feeds the failure condition: { id, states, sided, units }.
 *     states: the states it can be in, worst first, drawn from
 *       'F' failed (total loss)         'D' degraded (partial loss, any one counts the same)
 *       'A' / 'B' degraded with the first / second unit lost (side matters)
 *       'M' malfunction (doing the wrong thing)                 'O' operational
 *     sided: true when side matters ('A'/'B' states, or 'D' on a left and right pair).
 *   A case is one state per column, written as a string in column order ("FDOO").
 *   THE ORDER (the only inference rule): case x is "no worse than" case y when, column by column,
 *       x == y, or x is 'O', or (the column is not sided, x is 'D' and y is 'F').
 *     Nothing else is comparable: 'A' with 'B', a sided 'A'/'B'/'D' with 'F', 'M' with anything but 'O'.
 *   An outcome is a level, 0 = the best. Answers are monotone in that order: a case no worse than a case answered
 *   L is at most L; a case no better than it is at least L. A case whose bounds meet is filled in, with the answer
 *   that settled it. That rule is a stated assumption in the PASA for every column it was used on.
 *
 * Pure derivation: no DOM, no storage, no side effects. window.SLApx (browser) and module.exports (node tests).
 * Tests: tests/regression_apx_engine_20261115.test.js (the book's Tables Q.4-6 to Q.4-11 row for row, and a
 * seeded property test: questions plus inference always reproduce a monotone truth exactly).
 * ==========================================================================*/
(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.SLApx = api;
}(this, function () {
    'use strict';
    var VERSION = '1.0';
    // A table is enumerated whole or not at all (the same posture as MAC_COMBO_CAP in the clause arithmetic).
    var CASE_CAP = 20000;
    var WORST_FIRST = ['F', 'D', 'A', 'B', 'M', 'O'];

    function isPartial(st) { return st === 'D' || st === 'A' || st === 'B'; }

    // ---------------------------------------------------------------- columns
    // Normalizes one column and refuses a state set the order cannot carry.
    function column(c) {
        var states = (c && c.states || []).slice().sort(function (a, b) { return WORST_FIRST.indexOf(a) - WORST_FIRST.indexOf(b); });
        states.forEach(function (s) { if (WORST_FIRST.indexOf(s) === -1) throw new Error('unknown state "' + s + '" on column ' + (c && c.id)); });
        if (states.indexOf('O') === -1) throw new Error('column ' + (c && c.id) + ' has no operational state');
        if ((states.indexOf('A') !== -1) !== (states.indexOf('B') !== -1)) throw new Error('column ' + c.id + ' needs both side states or neither');
        if (states.indexOf('D') !== -1 && states.indexOf('A') !== -1) throw new Error('column ' + c.id + ' mixes counted and sided partial states');
        var sided = !!c.sided || states.indexOf('A') !== -1;
        return { id: String(c.id), states: states, sided: sided, units: (c.units || []).slice(), label: c.label || String(c.id) };
    }
    function columns(cols) { return (cols || []).map(column); }

    function caseCount(cols) { return cols.reduce(function (n, c) { return n * c.states.length; }, cols.length ? 1 : 0); }

    // Every case, in the book's order: the first column varies slowest, each column worst state first (Table Q.4-6).
    function cases(cols) {
        var n = caseCount(cols);
        if (n > CASE_CAP) throw new Error('This table has ' + n + ' cases, over the ' + CASE_CAP + ' the tool lists whole. Split the failure condition or reduce the columns; nothing is sampled.');
        var out = [];
        (function rec(i, acc) {
            if (i === cols.length) { if (cols.length) out.push(acc); return; }
            for (var k = 0; k < cols[i].states.length; k++) rec(i + 1, acc + cols[i].states[k]);
        })(0, '');
        return out;
    }

    // ---------------------------------------------------------------- the order
    function stateLe(x, y, sided) {
        if (x === y || x === 'O') return true;
        if (sided) return false;
        return x === 'D' && y === 'F';
    }
    // a is no worse than b
    function le(a, b, cols) {
        for (var i = 0; i < cols.length; i++) if (!stateLe(a[i], b[i], cols[i].sided)) return false;
        return true;
    }

    // The mirror image: on every column with side states, the first and second unit swap.
    function mirror(c, cols) {
        var out = '';
        for (var i = 0; i < cols.length; i++) {
            var x = c[i];
            out += (cols[i].states.indexOf('A') !== -1) ? (x === 'A' ? 'B' : x === 'B' ? 'A' : x) : x;
        }
        return out;
    }
    function hasMirror(cols) { return cols.some(function (c) { return c.states.indexOf('A') !== -1; }); }

    // ---------------------------------------------------------------- inference
    // answers: { case: level }. lo, hi: the range of levels a case may take. Returns [lo, hi, loFrom, hiFrom]:
    // the tightest bounds the answers give this case, and the answered case that set each.
    function bounds(c, answers, lo, hi, cols) {
        var lf = null, hf = null;
        for (var d in answers) {
            if (!Object.prototype.hasOwnProperty.call(answers, d)) continue;
            var v = answers[d];
            if (v > lo && le(d, c, cols)) { lo = v; lf = d; }
            if (v < hi && le(c, d, cols)) { hi = v; hf = d; }
        }
        return [lo, hi, lf, hf];
    }

    // Records one answer, and its mirror image when left and right mirror each other. Returns the cases written.
    // Refuses an answer that contradicts what is already settled (the order would be broken).
    function answer(answers, c, v, cols, opts) {
        opts = opts || {};
        var lo = opts.lo == null ? 0 : opts.lo, hi = opts.hi == null ? 1 : opts.hi;
        var b = bounds(c, answers, lo, hi, cols);
        if (v < b[0] || v > b[1]) throw new Error('That answer contradicts the answer already given for ' + (v < b[0] ? b[2] : b[3]) + '.');
        var wrote = [];
        if (answers[c] !== v) { answers[c] = v; wrote.push(c); }
        if (opts.mirror && hasMirror(cols)) {
            var m = mirror(c, cols);
            if (m !== c && answers[m] !== v) {
                var bm = bounds(m, answers, lo, hi, cols);
                if (v < bm[0] || v > bm[1]) throw new Error('The mirror image of that mix was answered differently (' + (v < bm[0] ? bm[2] : bm[3]) + '). Left and right do not mirror here.');
                answers[m] = v; wrote.push(m);
            }
        }
        return wrote;
    }

    // Solves a set of cases against the answers. Each case comes back as
    //   { level, src: 'you' | 'logic', from }   or   { level: null, lo, hi } when the answers do not settle it.
    function solve(cols, answers, opts) {
        opts = opts || {};
        var lo = opts.lo == null ? 0 : opts.lo, hi = opts.hi == null ? 1 : opts.hi;
        var among = opts.among || cases(cols);
        var out = {}, open = [];
        among.forEach(function (c) {
            if (Object.prototype.hasOwnProperty.call(answers, c)) { out[c] = { level: answers[c], src: 'you', from: null }; return; }
            var b = bounds(c, answers, lo, hi, cols);
            if (b[0] === b[1]) out[c] = { level: b[0], src: 'logic', from: b[2] !== null ? b[2] : b[3] };
            else { out[c] = { level: null, lo: b[0], hi: b[1] }; open.push(c); }
        });
        return { by: out, open: open, done: open.length === 0 };
    }

    // The next case to ask: the open case that settles the most other open cases whichever way it is answered
    // (the smaller of "open cases no worse than it" and "open cases no better than it"). Ties: the book's order.
    function nextQuestion(cols, answers, opts) {
        var s = solve(cols, answers, opts);
        if (!s.open.length) return null;
        var open = s.open, best = null, bestScore = -1;
        for (var i = 0; i < open.length; i++) {
            var below = 0, above = 0;
            for (var j = 0; j < open.length; j++) {
                if (i === j) continue;
                if (le(open[j], open[i], cols)) below++;
                else if (le(open[i], open[j], cols)) above++;
            }
            var score = Math.min(below, above) * 1e6 + (below + above);
            if (score > bestScore) { bestScore = score; best = open[i]; }
        }
        return best;
    }

    // ---------------------------------------------------------------- boundary sets
    function minimal(set, cols) { return set.filter(function (c) { return !set.some(function (d) { return d !== c && le(d, c, cols); }); }); }
    function maximal(set, cols) { return set.filter(function (c) { return !set.some(function (d) { return d !== c && le(c, d, cols); }); }); }

    // The units a case has lost: [colId:unitIndex], or colId:any for a counted partial loss.
    function lostUnits(c, cols) {
        var out = [];
        for (var i = 0; i < cols.length; i++) {
            var st = c[i], n = Math.max(cols[i].units.length, 1);
            if (st === 'F') for (var k = 0; k < n; k++) out.push(cols[i].id + ':' + k);
            else if (st === 'A') out.push(cols[i].id + ':0');
            else if (st === 'B') out.push(cols[i].id + ':1');
            else if (st === 'D') out.push(cols[i].id + ':any');
            else if (st === 'M') out.push(cols[i].id + ':m');
        }
        return out;
    }
    // The named combinations to show as MAC rules: the breaking cases, less any whose lost units physically
    // contain another breaking case's (it is not a new rule), with mirror images folded into one rule.
    function rules(breaking, cols, opts) {
        opts = opts || {};
        var sets = breaking.map(function (c) { return lostUnits(c, cols); });
        var covers = function (big, small) {
            return small.every(function (u) {
                if (big.indexOf(u) !== -1) return true;
                if (u.slice(-4) !== ':any') return false;
                var col = u.slice(0, -4) + ':';
                return big.some(function (x) { return x.indexOf(col) === 0 && x.slice(-2) !== ':m'; });
            });
        };
        var kept = breaking.filter(function (c, i) {
            return !breaking.some(function (d, j) { return j !== i && sets[j].length < sets[i].length && covers(sets[i], sets[j]); });
        });
        var out = [], seen = {};
        kept.forEach(function (c) {
            if (seen[c]) return;
            var m = opts.mirror && hasMirror(cols) ? mirror(c, cols) : c;
            seen[c] = true; seen[m] = true;
            out.push({ c: c, mirror: m !== c ? m : null });
        });
        return out;
    }

    // ---------------------------------------------------------------- CoFFE summary (Tables Q.4-7, Q.4-8)
    // levels: { case: level }, 0 best. For every level above the best: the smallest cases that reach it.
    // For the best level: the most that can be lost and still be at it.
    function summary(cols, levels, topLevel) {
        var all = Object.keys(levels), out = [];
        for (var L = topLevel; L >= 1; L--) {
            var reach = all.filter(function (c) { return levels[c] >= L; });
            minimal(reach, cols).filter(function (c) { return levels[c] === L; }).forEach(function (c) { out.push({ c: c, level: L }); });
        }
        maximal(all.filter(function (c) { return levels[c] === 0; }), cols).forEach(function (c) { out.push({ c: c, level: 0 }); });
        var order = cases(cols), pos = {};
        order.forEach(function (c, i) { pos[c] = i; });
        return out.sort(function (a, b) { return b.level - a.level || pos[a.c] - pos[b.c]; });
    }

    // The fault tree gate under the failure condition (Figure Q.4-1). rows: the smallest cases that cause it.
    // When every row is one shared core plus exactly one more event, the gate is AND(core, OR(the others)):
    //   { shape: 'core-any', core: [{col, st}], any: [{col, st}] }
    // Otherwise it is the plain OR of ANDs over the rows: { shape: 'or-of-and', sets: [[{col, st}]] }.
    function gate(rows, cols) {
        var evs = rows.map(function (c) {
            var e = [];
            for (var i = 0; i < cols.length; i++) if (c[i] !== 'O') e.push({ col: cols[i].id, st: c[i] });
            return e;
        });
        var key = function (e) { return e.col + '|' + e.st; };
        if (evs.length > 1) {
            var core = evs[0].filter(function (e) { return evs.every(function (r) { return r.some(function (x) { return key(x) === key(e); }); }); });
            var rest = evs.map(function (r) { return r.filter(function (e) { return !core.some(function (x) { return key(x) === key(e); }); }); });
            if (core.length && rest.every(function (r) { return r.length === 1; })) return { shape: 'core-any', core: core, any: rest.map(function (r) { return r[0]; }) };
        }
        return { shape: 'or-of-and', sets: evs };
    }

    // Probability of the gate from the budgets given to its events (independent events, which the independence
    // principles require). Exact: core-any is P(core) * (1 - product(1 - p)); or-of-and is by inclusion-exclusion
    // over the distinct events (refused over 20 sets, never truncated).
    function gateProbability(g, p) {
        var P = function (e) { var v = p[e.col + '|' + e.st]; if (!(v >= 0 && v <= 1)) throw new Error('no budget for ' + e.col + ' ' + e.st); return v; };
        if (g.shape === 'core-any') {
            var pc = g.core.reduce(function (a, e) { return a * P(e); }, 1);
            var q = g.any.reduce(function (a, e) { return a * (1 - P(e)); }, 1);
            return { p: pc * (1 - q), core: pc, any: 1 - q };
        }
        var sets = g.sets;
        if (sets.length > 20) throw new Error('This gate has ' + sets.length + ' combinations, over the 20 the exact sum covers.');
        var total = 0;
        for (var mask = 1; mask < (1 << sets.length); mask++) {
            var seen = {}, prod = 1, bits = 0;
            for (var i = 0; i < sets.length; i++) if (mask & (1 << i)) {
                bits++;
                sets[i].forEach(function (e) { var k = e.col + '|' + e.st; if (!seen[k]) { seen[k] = true; prod *= P(e); } });
            }
            total += (bits % 2 ? 1 : -1) * prod;
        }
        return { p: total };
    }

    // ---------------------------------------------------------------- common resource pairs (Tables Q.4-9 to Q.4-11)
    // For a core-any gate with one core event: every pair (one way the core event happens, one way any other
    // event happens). A way is the system's own failure condition, or the loss of a resource that feeds it.
    //   events(e) -> { own: code, res: [{ id, code }] }   (the caller names the codes; resource order as given)
    // Order follows the book: Failure 1 lists the resource events then the system's own; Failure 2 lists each
    // resource's events across the systems (resources in the caller's Failure 2 order), then a shared resource
    // event once, then the systems' own.
    function resourcePairs(g, events, opts) {
        if (!g || g.shape !== 'core-any' || g.core.length !== 1) return null;
        opts = opts || {};
        var c = events(g.core[0]);
        var f1 = c.res.map(function (r) { return { code: r.code, res: r.id }; }).concat([{ code: c.own, res: null }]);
        var others = g.any.map(events), f2 = [];
        var order = opts.failure2Order || [];
        var resIds = [];
        others.forEach(function (o) { o.res.forEach(function (r) { if (resIds.indexOf(r.id) === -1) resIds.push(r.id); }); });
        resIds.sort(function (a, b) { var ia = order.indexOf(a), ib = order.indexOf(b); return (ia === -1 ? 1e6 : ia) - (ib === -1 ? 1e6 : ib); });
        resIds.forEach(function (rid) {
            others.forEach(function (o) {
                o.res.forEach(function (r) { if (r.id === rid && !f2.some(function (x) { return x.code === r.code; })) f2.push({ code: r.code, res: r.id }); });
            });
        });
        others.forEach(function (o) { f2.push({ code: o.own, res: null }); });
        var pairs = [];
        f1.forEach(function (a) { f2.forEach(function (b) { pairs.push({ n: pairs.length + 1, a: a, b: b, same: a.res !== null && a.res === b.res ? a.res : null }); }); });
        return pairs;
    }

    return {
        VERSION: VERSION, CASE_CAP: CASE_CAP,
        isPartial: isPartial, column: column, columns: columns, caseCount: caseCount, cases: cases,
        stateLe: stateLe, le: le, mirror: mirror, hasMirror: hasMirror,
        bounds: bounds, answer: answer, solve: solve, nextQuestion: nextQuestion,
        minimal: minimal, maximal: maximal, lostUnits: lostUnits, rules: rules,
        summary: summary, gate: gate, gateProbability: gateProbability, resourcePairs: resourcePairs
    };
}));
