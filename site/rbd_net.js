// ============================================================================
// rbd_net.js - v1.0 - the network reliability block diagram engine (IEC 61078).
// 13 Oct 2026 (v1.0): new. A reliability block diagram is now a DRAWN NETWORK, not a nested
// formula: a start node, an end node, blocks, junction points, k-out-of-n voting nodes and
// standby groups joined by links. This file is the pure math; rbd_module.js draws it on the
// one diagram editor (diagram_editor.js) and rbd_xcheck.js checks it.
//
// WHAT IT EVALUATES, EXACTLY
//   The system works when a working route leads from the start to the end. A block passes the
//   route on when its component works; a junction passes it on; a k-out-of-n node passes it on
//   when at least k of the links coming into it carry a working route. Links are one-way
//   (drawn direction) or two-way (bridges). Blocks that stand for the same component (IEC 61078
//   "repeated block": props.component holds the shared key) are ONE random variable, so a
//   component drawn in two places is never counted as two independent ones.
//   The structure function is turned into a binary decision diagram (BDD):
//     - networks without loops: built node by node in flow order (start = true, block =
//       component AND (any incoming), junction = any incoming, k-out-of-n = at least k);
//     - networks with loops (two-way links, bridges): from the minimal path sets, found by
//       walking every simple route from start to end (capped, refused by name above the cap).
//   P(system works) is read off the BDD in one pass. Exact for any structure: series,
//   parallel, k-out-of-n, bridges, general networks, repeated components.
// Component probabilities:
//   block:    R(t) = e^(-lambda t); steady availability mu / (lambda + mu)
//   standby:  one unit active, the others waiting; a waiting unit fails at dormancy x lambda
//             (0 cold, 1 hot, in between warm); each switch-over works with probability p.
//             Solved exactly as a small continuous-time Markov chain by uniformization:
//             states = spares still good (n-1 ... 0) plus failed.
//             Checks: 2 units cold, R = e^(-lt)(1 + p lt); 2 units warm, perfect switch,
//             R = e^(-lt) + (1/k)(e^(-lt) - e^(-(1+k)lt)).
// Independent second leg: bruteForce() enumerates every up/down combination of the components
// (up to 16 components) and evaluates the network by plain reachability, with no BDD at all.
// rbd_xcheck.js adds the third and fourth legs (inclusion-exclusion over minimal path sets and
// over minimal cut sets).
//
// Pure: no DOM, no project globals, deterministic. Node: module.exports. Browser: window.RBD_NET.
// Tests: tests/regression_rbd_markov_diagrams_20261013b.test.js
// ============================================================================
(function (root) {
    'use strict';
    var VERSION = '1.0';
    var PATH_CAP = 20000;      // simple routes walked in a looped network before refusing
    var SET_CAP = 4000;        // minimal path or cut sets listed before refusing
    var BRUTE_CAP = 16;        // components enumerated by the brute-force leg (2^16 = 65,536 states, a few ms per check)

    function num(v) { if (v === '' || v == null) return NaN; var n = Number(v); return isFinite(n) ? n : NaN; }
    function S(v) { return v == null ? '' : String(v); }

    // ================================================================ BDD
    function Bdd() {
        this.V = [Infinity, Infinity]; this.LO = [0, 1]; this.HI = [0, 1];
        this.uniq = new Map(); this.memo = new Map();
    }
    Bdd.prototype.mk = function (v, lo, hi) {
        if (lo === hi) return lo;
        var k = v + ',' + lo + ',' + hi, n = this.uniq.get(k);
        if (n != null) return n;
        n = this.V.length; this.V.push(v); this.LO.push(lo); this.HI.push(hi); this.uniq.set(k, n);
        return n;
    };
    Bdd.prototype.variable = function (v) { return this.mk(v, 0, 1); };
    Bdd.prototype.ite = function (f, g, h) {
        if (f === 1) return g; if (f === 0) return h;
        if (g === h) return g; if (g === 1 && h === 0) return f;
        var key = f + ',' + g + ',' + h, r = this.memo.get(key);
        if (r != null) return r;
        var V = this.V, top = Math.min(V[f], V[g], V[h]);
        var f0 = V[f] === top ? this.LO[f] : f, f1 = V[f] === top ? this.HI[f] : f;
        var g0 = V[g] === top ? this.LO[g] : g, g1 = V[g] === top ? this.HI[g] : g;
        var h0 = V[h] === top ? this.LO[h] : h, h1 = V[h] === top ? this.HI[h] : h;
        r = this.mk(top, this.ite(f0, g0, h0), this.ite(f1, g1, h1));
        this.memo.set(key, r);
        return r;
    };
    Bdd.prototype.and = function (a, b) { return this.ite(a, b, 0); };
    Bdd.prototype.or = function (a, b) { return this.ite(a, 1, b); };
    Bdd.prototype.not = function (a) { return this.ite(a, 0, 1); };
    Bdd.prototype.atLeast = function (k, fs) {
        if (k <= 0) return 1;
        if (k > fs.length) return 0;
        var C = [1]; for (var j = 1; j <= k; j++) C.push(0);
        for (var i = 0; i < fs.length; i++) for (var jj = k; jj >= 1; jj--) C[jj] = this.ite(fs[i], C[jj - 1], C[jj]);
        return C[k];
    };
    // P(f = 1) for independent variables, p[level] = P(variable is 1).
    Bdd.prototype.prob = function (f, p) {
        var memo = new Map(), self = this;
        function go(n) {
            if (n === 0) return 0; if (n === 1) return 1;
            var c = memo.get(n); if (c != null) return c;
            var q = p[self.V[n]], r = (1 - q) * go(self.LO[n]) + q * go(self.HI[n]);
            memo.set(n, r); return r;
        }
        return go(f);
    };
    Bdd.prototype.size = function (f) {
        var seen = new Set(), st = [f];
        while (st.length) { var n = st.pop(); if (n < 2 || seen.has(n)) continue; seen.add(n); st.push(this.LO[n], this.HI[n]); }
        return seen.size;
    };
    // Minimal sets: polarity 1 = path sets (variables on the high edge of each route to 1),
    // polarity 0 = cut sets (variables on the low edge of each route to 0). Exact for a
    // monotone (coherent) structure function. Refuses past the cap, never truncates.
    Bdd.prototype.minimalSets = function (f, polarity, cap) {
        cap = cap || SET_CAP;
        var target = polarity ? 1 : 0, out = [], self = this, steps = 0;
        (function walk(n, acc) {
            if (++steps > cap * 50) throw new Error('too many routes through the decision diagram to list the minimal ' + (polarity ? 'path' : 'cut') + ' sets (more than ' + (cap * 50) + ').');
            if (n === target) { out.push(acc.slice()); if (out.length > cap * 4) throw new Error('more than ' + (cap * 4) + ' candidate ' + (polarity ? 'path' : 'cut') + ' sets.'); return; }
            if (n < 2) return;
            var v = self.V[n];
            if (polarity) { walk(self.LO[n], acc); acc.push(v); walk(self.HI[n], acc); acc.pop(); }
            else { walk(self.HI[n], acc); acc.push(v); walk(self.LO[n], acc); acc.pop(); }
        })(f, []);
        out.forEach(function (s) { s.sort(function (a, b) { return a - b; }); });
        out.sort(function (a, b) { return a.length - b.length || a.join(',').localeCompare(b.join(',')); });
        var kept = [];
        out.forEach(function (s) {
            var ss = new Set(s);
            if (!kept.some(function (k) { return k.every(function (x) { return ss.has(x); }); })) kept.push(s);
        });
        if (kept.length > cap) throw new Error(kept.length + ' minimal ' + (polarity ? 'path' : 'cut') + ' sets (more than ' + cap + ').');
        return kept;
    };

    // ================================================================ standby group
    // Uniformization with log-domain Poisson weights (no underflow at any lambda t).
    function _uniformize(Q, pi0, t) {
        var n = Q.length, L = 0, i, j;
        for (i = 0; i < n; i++) L = Math.max(L, -Q[i][i]);
        if (L === 0 || t === 0) return pi0.slice();
        var P = Q.map(function (row, a) { return row.map(function (q, b) { return (a === b ? 1 : 0) + q / L; }); });
        var Lt = L * t, K = Math.ceil(Lt + 12 * Math.sqrt(Lt) + 40);
        var logLt = Math.log(Lt), logFact = 0, acc = new Array(n).fill(0), v = pi0.slice(), wsum = 0;
        for (var k = 0; k <= K; k++) {
            if (k > 0) logFact += Math.log(k);
            var w = Math.exp(-Lt + k * logLt - logFact);
            wsum += w;
            for (i = 0; i < n; i++) acc[i] += w * v[i];
            var nv = new Array(n).fill(0);
            for (i = 0; i < n; i++) { var vi = v[i]; if (!vi) continue; for (j = 0; j < n; j++) nv[j] += vi * P[i][j]; }
            v = nv;
        }
        return acc.map(function (x) { return x / wsum; });
    }
    // params: { lambda, units (>= 2), warmK (0..1), switchP (0..1) }. Returns R(t).
    function standbyR(params, t) {
        var lam = Math.max(0, num(params.lambda) || 0), n = Math.max(1, Math.round(num(params.units) || 2));
        var w = num(params.warmK); if (!(w >= 0)) w = 0;
        var p = num(params.switchP); if (!(p >= 0)) p = 1;
        if (lam === 0) return 1;
        // states 0..n-1 = spares still good (index s), state n = failed
        var N = n + 1, F = n, Q = [], s;
        for (s = 0; s < N; s++) Q.push(new Array(N).fill(0));
        for (s = 0; s <= n - 1; s++) {
            if (s >= 1) { Q[s][s - 1] += lam * p; Q[s][F] += lam * (1 - p); Q[s][s - 1] += s * w * lam; }
            else Q[s][F] += lam;
        }
        for (s = 0; s < N; s++) { var off = 0; for (var j = 0; j < N; j++) if (j !== s) off += Q[s][j]; Q[s][s] = -off; }
        var pi0 = new Array(N).fill(0); pi0[n - 1] = 1;
        var pi = _uniformize(Q, pi0, t);
        return Math.min(1, Math.max(0, 1 - pi[F]));
    }

    // ================================================================ the network
    var NODE_KINDS = { start: 1, end: 1, node: 1, block: 1, vote: 1, standby: 1 };
    function compKey(el) { var c = el.props && el.props.component; c = c == null ? '' : String(c).trim(); return c || el.id; }

    // analyze(diagram) -> { ok, errors, warnings, comps, varOf, bdd, root, method, relevant }
    function analyze(diagram) {
        var errors = [], warnings = [];
        var d = diagram || {}, els = Array.isArray(d.elements) ? d.elements : [], cns = Array.isArray(d.connectors) ? d.connectors : [];
        var byId = Object.create(null);
        els.forEach(function (e) { if (e && e.id) byId[e.id] = e; });
        var name = function (e) { return S(e.label).trim() || (e.kind === 'block' ? 'a block' : e.kind); };
        els.forEach(function (e) { if (!NODE_KINDS[e.kind]) errors.push('Unknown shape "' + e.kind + '".'); });
        var starts = els.filter(function (e) { return e.kind === 'start'; }), ends = els.filter(function (e) { return e.kind === 'end'; });
        if (starts.length !== 1) errors.push(starts.length ? 'A diagram has one start; this one has ' + starts.length + '.' : 'Add the start (where the success path begins).');
        if (ends.length !== 1) errors.push(ends.length ? 'A diagram has one end; this one has ' + ends.length + '.' : 'Add the end (where the success path finishes).');

        // components
        var comps = [], compOf = Object.create(null);
        els.forEach(function (e) {
            if (e.kind !== 'block' && e.kind !== 'standby') return;
            var p = e.props || {}, key = compKey(e), lam = num(p.lambda), mu = num(p.mu);
            if (!(lam >= 0)) errors.push('Block "' + name(e) + '" needs a failure rate (per hour, 0 or more).');
            if (S(p.mu) !== '' && !(mu >= 0)) errors.push('Block "' + name(e) + '" has a repair rate that is not a number of 0 or more.');
            var sb = null;
            if (e.kind === 'standby') {
                var u = num(p.units), wk = S(p.warmK) === '' ? 0 : num(p.warmK), sp = S(p.switchP) === '' ? 1 : num(p.switchP);
                if (!(u >= 2 && Math.round(u) === u)) errors.push('Standby group "' + name(e) + '" needs 2 or more units (a whole number).');
                if (!(wk >= 0 && wk <= 1)) errors.push('Standby group "' + name(e) + '": the dormancy factor is between 0 (cold) and 1 (hot).');
                if (!(sp >= 0 && sp <= 1)) errors.push('Standby group "' + name(e) + '": the switch success probability is between 0 and 1.');
                sb = { units: u, warmK: wk, switchP: sp };
            }
            var c = compOf[key];
            if (!c) {
                c = compOf[key] = { key: key, name: name(e), kind: e.kind, lambda: lam, mu: S(p.mu) === '' ? null : mu, standby: sb, places: [] };
                comps.push(c);
            } else {
                var same = c.kind === e.kind && (c.lambda === lam || (isNaN(c.lambda) && isNaN(lam))) && ((c.mu == null && S(p.mu) === '') || c.mu === mu) && JSON.stringify(c.standby) === JSON.stringify(sb);
                if (!same) errors.push('"' + c.name + '" is drawn in ' + (c.places.length + 1) + ' places with different values. A repeated block is one component: give every copy the same failure rate' + (c.kind === 'standby' ? ' and standby settings' : ', repair rate') + '.');
            }
            c.places.push(e.id);
        });

        // links
        var succ = Object.create(null), pred = Object.create(null);
        els.forEach(function (e) { succ[e.id] = []; pred[e.id] = []; });
        var addEdge = function (a, b) { if (succ[a].indexOf(b) < 0) { succ[a].push(b); pred[b].push(a); } };
        cns.forEach(function (c) {
            if (!c) return;
            if (!byId[c.from] || !byId[c.to]) { errors.push('A link has a missing end. Delete it or connect it again.'); return; }
            if (c.from === c.to) { errors.push('A link cannot join a shape to itself.'); return; }
            addEdge(c.from, c.to);
            if (c.kind === 'link2') addEdge(c.to, c.from);
        });
        var out = { ok: false, errors: errors, warnings: warnings, comps: comps, compOf: compOf, method: null, bdd: null, root: 0, varOf: Object.create(null) };
        if (starts.length !== 1 || ends.length !== 1) return out;
        var S0 = starts[0].id, E0 = ends[0].id;
        // relevant = reachable from start and able to reach the end
        var fwd = Object.create(null), bwd = Object.create(null), st = [S0];
        fwd[S0] = 1; while (st.length) { var x = st.pop(); succ[x].forEach(function (y) { if (!fwd[y] && y !== S0) { fwd[y] = 1; st.push(y); } }); }
        st = [E0]; bwd[E0] = 1; while (st.length) { var z = st.pop(); pred[z].forEach(function (y) { if (!bwd[y]) { bwd[y] = 1; st.push(y); } }); }
        if (!fwd[E0]) { errors.push('The end cannot be reached from the start. Join them with links through the blocks.'); return out; }
        var rel = Object.create(null), relIds = [];
        els.forEach(function (e) { if (fwd[e.id] && bwd[e.id]) { rel[e.id] = 1; relIds.push(e.id); } });
        els.forEach(function (e) { if (!rel[e.id] && e.kind !== 'start' && e.kind !== 'end') warnings.push('"' + name(e) + '" is not on any route from the start to the end, so it does not count.'); });
        var rpred = function (id) { return pred[id].filter(function (p) { return rel[p] && p !== E0; }); };
        var rsucc = function (id) { return succ[id].filter(function (s) { return rel[s] && s !== S0; }); };
        // vote nodes: k between 1 and the number of incoming routes
        relIds.forEach(function (id) {
            var e = byId[id]; if (e.kind !== 'vote') return;
            var k = num(e.props && e.props.k), n = rpred(id).length;
            if (!(k >= 1 && Math.round(k) === k && k <= n)) errors.push('The k-out-of-n node "' + name(e) + '" needs k between 1 and ' + n + ' (its incoming links); it has ' + (isFinite(k) ? k : 'none') + '.');
        });
        if (errors.length) return out;

        // flow order (Kahn) on the relevant subgraph
        var indeg = Object.create(null), order = [], q = [S0];
        relIds.forEach(function (id) { indeg[id] = id === S0 ? 0 : rpred(id).length; });
        while (q.length) { var a = q.shift(); order.push(a); if (a !== E0) rsucc(a).forEach(function (b) { if (--indeg[b] === 0) q.push(b); }); }
        var acyclic = order.length === relIds.length;
        var bdd = new Bdd(), varOf = out.varOf, nextVar = 0;
        var V = function (el) { var k = compKey(el); if (varOf[k] == null) varOf[k] = nextVar++; return bdd.variable(varOf[k]); };
        var root;
        if (acyclic) {
            var reach = Object.create(null);
            order.forEach(function (id) {
                var e = byId[id];
                if (id === S0) { reach[id] = 1; return; }
                var ins = rpred(id).map(function (p) { return reach[p]; });
                if (e.kind === 'vote') { reach[id] = bdd.atLeast(Math.round(num(e.props.k)), ins); return; }
                var any = 0; ins.forEach(function (f) { any = bdd.or(any, f); });
                reach[id] = (e.kind === 'block' || e.kind === 'standby') ? bdd.and(V(e), any) : any;
            });
            root = reach[E0];
            out.method = 'flow';
        } else {
            if (relIds.some(function (id) { return byId[id].kind === 'vote'; })) {
                errors.push('This network has a loop (two-way links) and a k-out-of-n node. Draw the k-out-of-n part with one-way links, or the loop without a k-out-of-n node.');
                return out;
            }
            var routes = 0, sets = [], onPath = Object.create(null);
            try {
                (function dfs(id, comps) {
                    if (id === E0) { if (++routes > PATH_CAP) throw new Error('cap'); sets.push(comps.slice()); return; }
                    onPath[id] = 1;
                    rsucc(id).forEach(function (nx) {
                        if (onPath[nx]) return;
                        var e2 = byId[nx], add = (e2.kind === 'block' || e2.kind === 'standby');
                        if (add) comps.push(e2);
                        dfs(nx, comps);
                        if (add) comps.pop();
                    });
                    onPath[id] = 0;
                })(S0, []);
            } catch (er) {
                if (er.message === 'cap') { errors.push('This network has more than ' + PATH_CAP + ' routes from start to end, too many to evaluate exactly here. Split it into smaller diagrams.'); return out; }
                throw er;
            }
            root = 0;
            sets.forEach(function (path) { var f = 1; path.forEach(function (e) { f = bdd.and(f, V(e)); }); root = bdd.or(root, f); });
            out.method = 'routes';
            out.routes = routes;
        }
        // components that matter get variables in the order met; the rest still get one so every
        // drawn component has a probability column (they cannot change the answer)
        comps.forEach(function (c) { if (varOf[c.key] == null) varOf[c.key] = nextVar++; });
        out.bdd = bdd; out.root = root; out.ok = true; out.relevant = rel; out.start = S0; out.end = E0;
        out.byId = byId; out.succ = succ; out.pred = pred; out.nVars = nextVar;
        return out;
    }

    // component probabilities, indexed by BDD level
    function probVector(A, pOfComp) {
        var p = new Array(A.nVars).fill(0);
        A.comps.forEach(function (c) { p[A.varOf[c.key]] = pOfComp(c); });
        return p;
    }
    function compR(c, t) { return c.kind === 'standby' ? standbyR({ lambda: c.lambda, units: c.standby.units, warmK: c.standby.warmK, switchP: c.standby.switchP }, t) : Math.exp(-(c.lambda || 0) * t); }
    function reliability(A, t) { return A.bdd.prob(A.root, probVector(A, function (c) { return compR(c, t); })); }
    // Steady-state availability with independent repair of every component.
    function availability(A) {
        var sb = A.comps.filter(function (c) { return c.kind === 'standby'; });
        if (sb.length) return { ok: false, reason: 'Availability is not worked out for standby groups here (shared repair needs its own Markov model). Use a Markov model for "' + sb[0].name + '".' };
        var missing = A.comps.filter(function (c) { return c.lambda > 0 && !(c.mu > 0); });
        if (missing.length) return { ok: false, reason: 'Availability needs a repair rate on every block that can fail; ' + missing.length + ' ' + (missing.length === 1 ? 'block has' : 'blocks have') + ' none (' + missing.slice(0, 3).map(function (c) { return c.name; }).join(', ') + (missing.length > 3 ? ', ...' : '') + ').' };
        var A0 = A.bdd.prob(A.root, probVector(A, function (c) { return c.lambda > 0 ? c.mu / (c.lambda + c.mu) : 1; }));
        return { ok: true, value: A0 };
    }
    // MTTF = integral of R(t) from 0 to infinity: composite Simpson with a doubling horizon
    // (the same rule rbd_module uses for the formula diagrams).
    function mttf(A) {
        var R = function (t) { return reliability(A, t); };
        var T = 1, guard = 0;
        while (R(T) > 1e-9 && guard++ < 60) T *= 2;
        if (R(T) > 1e-9) return Infinity;
        var n = 2048, h = T / n, s = R(0) + R(T);
        for (var i = 1; i < n; i++) s += R(i * h) * (i % 2 ? 4 : 2);
        return s * h / 3;
    }

    // ---- independent leg: brute force by reachability ----------------------
    // evaluates the drawn network directly (no BDD): least fixpoint of "reached" for every up/down
    // combination of the components.
    // compact form of the network for fast repeated evaluation: node kinds, k, component index,
    // predecessor lists (relevant only), all as arrays
    function compact(A) {
        if (A._cmp) return A._cmp;
        var ids = Object.keys(A.relevant), at = {}, ci = {};
        A.comps.forEach(function (c, i) { ci[c.key] = i; });
        ids.forEach(function (id, i) { at[id] = i; });
        var kind = new Int8Array(ids.length), kk = new Int32Array(ids.length), comp = new Int32Array(ids.length), preds = [];
        ids.forEach(function (id, i) {
            var e = A.byId[id];
            kind[i] = e.kind === 'vote' ? 2 : (e.kind === 'block' || e.kind === 'standby') ? 1 : 0;
            kk[i] = e.kind === 'vote' ? Math.round(num(e.props.k)) : 0;
            comp[i] = kind[i] === 1 ? ci[compKey(e)] : -1;
            preds.push(A.pred[id].filter(function (p) { return A.relevant[p] && p !== A.end; }).map(function (p) { return at[p]; }));
        });
        return (A._cmp = { n: ids.length, kind: kind, k: kk, comp: comp, preds: preds, s: at[A.start], e: at[A.end] });
    }
    function worksFast(K, upArr, reached) {
        reached.fill(0); reached[K.s] = 1;
        var changed = true;
        while (changed) {
            changed = false;
            for (var i = 0; i < K.n; i++) {
                if (reached[i]) continue;
                var ps = K.preds[i], cnt = 0;
                for (var j = 0; j < ps.length; j++) if (reached[ps[j]]) { cnt++; if (K.kind[i] !== 2) break; }
                var ok = K.kind[i] === 2 ? cnt >= K.k[i] : (cnt > 0 && (K.kind[i] === 0 || upArr[K.comp[i]]));
                if (ok) { reached[i] = 1; changed = true; }
            }
        }
        return reached[K.e] === 1;
    }
    function bruteForce(A, pOfComp) {
        var cs = A.comps, m = cs.length;
        if (m > BRUTE_CAP) return { ok: false, reason: m + ' components: enumerating 2^' + m + ' states is beyond the ' + BRUTE_CAP + '-component limit of this check.' };
        var p = cs.map(pOfComp), total = 0, K = compact(A), up = new Uint8Array(m), reached = new Uint8Array(K.n);
        for (var mask = 0; mask < (1 << m); mask++) {
            var pr = 1;
            for (var i = 0; i < m; i++) { var on = (mask >> i) & 1; up[i] = on; pr *= on ? p[i] : 1 - p[i]; }
            if (pr === 0) continue;
            if (worksFast(K, up, reached)) total += pr;
        }
        return { ok: true, value: total, states: 1 << m };
    }
    function pathSets(A) { return A.bdd.minimalSets(A.root, 1).map(function (s) { return s.map(function (v) { return levelComp(A, v); }); }); }
    function cutSets(A) { return A.bdd.minimalSets(A.root, 0).map(function (s) { return s.map(function (v) { return levelComp(A, v); }); }); }
    function levelComp(A, v) { if (!A._lv) { A._lv = []; A.comps.forEach(function (c) { A._lv[A.varOf[c.key]] = c; }); } return A._lv[v]; }

    // ================================================================ from a formula or a fault tree
    // structure: rbd_module node tree { kind:'block', name, lambda } | { kind:'series'|'parallel', children }
    //            | { kind:'koon', k, children }. Blocks with the same name become ONE component
    //            drawn in several places (IEC 61078 repeated block).
    // idGen(): returns a fresh id (deterministic in a live view, UUID for a stored copy).
    function fromStructure(structure, idGen) {
        var n = 0;
        idGen = idGen || function () { return 'g' + (++n); };
        var elements = [], connectors = [];
        var BW = 130, BH = 52, GAP = 44, VG = 22, J = 14, VS = 44;
        function addEl(kind, w, h, label, props) { var e = { id: idGen(), kind: kind, x: 0, y: 0, w: w, h: h, label: label || '', props: props || {} }; elements.push(e); return e; }
        function link(a, b) { connectors.push({ id: idGen(), kind: 'link', from: a, to: b, label: '', props: {} }); }
        function lay(nd) {
            if (!nd) return null;
            if (nd.kind === 'block') {
                var b = addEl('block', BW, BH, nd.label || nd.name, { lambda: nd.lambda || 0, component: S(nd.name).trim() || undefined });
                if (b.props.component === undefined) delete b.props.component;
                return { w: BW, h: BH, items: [[b, 0, 0]], entry: b.id, exit: b.id };
            }
            var kids = (nd.children || []).map(lay).filter(Boolean);
            if (!kids.length) return null;
            if (kids.length === 1 && nd.kind !== 'koon') return kids[0];
            if (nd.kind === 'series') {
                var H = Math.max.apply(null, kids.map(function (k) { return k.h; })), x = 0, items = [];
                kids.forEach(function (k, i) {
                    k.items.forEach(function (it) { items.push([it[0], it[1] + x, it[2] + (H - k.h) / 2]); });
                    if (i) link(kids[i - 1].exit, k.entry);
                    x += k.w + GAP;
                });
                return { w: x - GAP, h: H, items: items, entry: kids[0].entry, exit: kids[kids.length - 1].exit };
            }
            var W = Math.max.apply(null, kids.map(function (k) { return k.w; }));
            var Ht = kids.reduce(function (s, k) { return s + k.h; }, 0) + VG * (kids.length - 1);
            var split = addEl('node', J, J, '', {});
            var join = nd.kind === 'koon' ? addEl('vote', VS, VS, '', { k: nd.k }) : addEl('node', J, J, '', {});
            var jw = nd.kind === 'koon' ? VS : J;
            var its = [[split, 0, Ht / 2 - J / 2]], y = 0;
            kids.forEach(function (k) {
                var x0 = J + GAP + (W - k.w) / 2;
                k.items.forEach(function (it) { its.push([it[0], it[1] + x0, it[2] + y]); });
                link(split.id, k.entry); link(k.exit, join.id);
                y += k.h + VG;
            });
            its.push([join, J + GAP + W + GAP, Ht / 2 - jw / 2]);
            return { w: J + GAP + W + GAP + jw, h: Ht, items: its, entry: split.id, exit: join.id };
        }
        var s = addEl('start', 34, 34, 'Start', {}), e = addEl('end', 34, 34, 'End', {});
        var body = lay(structure);
        var H0 = body ? body.h : BH;
        var sx = 0, sy = H0 / 2 - 17, bx = 34 + GAP + 6;
        s.x = sx; s.y = sy;
        if (body) {
            body.items.forEach(function (it) { it[0].x = Math.round(it[1] + bx); it[0].y = Math.round(it[2]); });
            link(s.id, body.entry); link(body.exit, e.id);
            e.x = Math.round(bx + body.w + GAP + 6); e.y = Math.round(sy);
        } else { e.x = 160; e.y = Math.round(sy); link(s.id, e.id); }
        // the start and end first, then the drawing order
        return { elements: elements, connectors: connectors };
    }

    // ---- structure-tree BDD (for the fault tree cross-check) ---------------
    // Builds the success function of a structure tree in the SAME manager and variable map as
    // an analyzed network, so equal structure functions give the identical BDD node.
    function structureBdd(A, structure) {
        var bdd = A.bdd, varOf = A.varOf, extra = [];
        function go(nd) {
            if (!nd) return 1;
            if (nd.kind === 'block') {
                var key = S(nd.name).trim();
                if (varOf[key] == null) { varOf[key] = A.nVars++; extra.push(key); }
                return bdd.variable(varOf[key]);
            }
            var fs = (nd.children || []).map(go);
            if (nd.kind === 'series') return fs.reduce(function (a, f) { return bdd.and(a, f); }, 1);
            if (nd.kind === 'parallel') return fs.reduce(function (a, f) { return bdd.or(a, f); }, 0);
            if (nd.kind === 'koon') return bdd.atLeast(nd.k, fs);
            return 1;
        }
        return { root: go(structure), extra: extra };
    }
    function structureLeaves(nd, out) { out = out || []; if (!nd) return out; if (nd.kind === 'block') out.push(nd); else (nd.children || []).forEach(function (c) { structureLeaves(c, out); }); return out; }
    // Compare a network with the structure tree it was derived from (a fault tree's dual).
    // -> { sameStructure, rateDiffs: [{ name, here, tree }], missing: [names only in the tree], rDiagram, rTree }
    function compareWithStructure(diagram, structure, t) {
        var A = analyze(diagram);
        if (!A.ok) return { ok: false, reason: A.errors[0] };
        var keyed = Object.create(null);
        A.comps.forEach(function (c) { keyed[c.key] = c; });
        // the tree names its components by event name; a derived diagram keys blocks the same way
        var sb = structureBdd(A, structure);
        var leaves = structureLeaves(structure), rateDiffs = [], seen = Object.create(null);
        leaves.forEach(function (b) {
            var key = S(b.name).trim(); if (seen[key]) return; seen[key] = 1;
            var c = keyed[key];
            if (c && c.kind === 'block' && Math.abs((c.lambda || 0) - (b.lambda || 0)) > 1e-15 * Math.max(1, Math.abs(b.lambda || 0))) rateDiffs.push({ name: key, here: c.lambda, tree: b.lambda || 0 });
        });
        var pTree = new Array(A.nVars).fill(0);
        A.comps.forEach(function (c) { pTree[A.varOf[c.key]] = compR(c, t); });
        leaves.forEach(function (b) { var k = S(b.name).trim(); pTree[A.varOf[k]] = Math.exp(-(b.lambda || 0) * t); });
        return {
            ok: true, sameStructure: sb.root === A.root, rateDiffs: rateDiffs, missing: sb.extra,
            rDiagram: reliability(A, t), rTree: A.bdd.prob(sb.root, pTree)
        };
    }

    var API = {
        version: VERSION, Bdd: Bdd, analyze: analyze, reliability: reliability, availability: availability, mttf: mttf,
        bruteForce: bruteForce, pathSets: pathSets, cutSets: cutSets, standbyR: standbyR, compR: compR,
        fromStructure: fromStructure, compareWithStructure: compareWithStructure, structureBdd: structureBdd,
        compKey: compKey, caps: { PATH_CAP: PATH_CAP, SET_CAP: SET_CAP, BRUTE_CAP: BRUTE_CAP }
    };
    root.RBD_NET = API;
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
