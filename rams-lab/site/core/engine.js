// core/engine.js — vertical-agnostic math. Knows NOTHING about hazards, SILs
// or trains (Constitution rule 2): pure functions over rates, probabilities,
// structures. The spine supplies interpretation.

// ---- probability / rate primitives -----------------------------------------
export const pFromLambda = (lambda, t) => -Math.expm1(-lambda * t);   // P = 1−e^(−λt)
export const lambdaFromP = (p, t) => -Math.log1p(-p) / t;

// ---- structure evaluation (RBD / fault-tree dual) ---------------------------
// node: { kind: 'event', p } | { kind: 'and'|'or', children } | { kind: 'koon', k, children }
// AND = all fail (parallel redundancy in RBD terms); OR = any fails (series).
export function evalStructure(node) {
    if (!node) return 0;
    if (node.kind === 'event') return Math.min(Math.max(node.p || 0, 0), 1);
    const ps = (node.children || []).map(evalStructure);
    if (node.kind === 'and') return ps.reduce((a, b) => a * b, 1);
    if (node.kind === 'or') return 1 - ps.reduce((a, b) => a * (1 - b), 1);
    if (node.kind === 'koon') {
        // exact: probability that ≥k of n fail (independent, possibly unequal p)
        const n = ps.length;
        let dist = [1];                        // dist[j] = P(j failures) so far
        for (const p of ps) {
            const next = new Array(dist.length + 1).fill(0);
            for (let j = 0; j < dist.length; j++) {
                next[j] += dist[j] * (1 - p);
                next[j + 1] += dist[j] * p;
            }
            dist = next;
        }
        let sum = 0;
        for (let j = node.k; j <= n; j++) sum += dist[j] || 0;
        return sum;
    }
    return 0;
}

// ---- top-down apportionment (THR / downtime / MTTR budgets) -----------------
// Splits a parent target across children by weight; kind 'or' divides the
// budget (series — contributions add), kind 'and' takes the weighted root of
// the product (parallel).
//
// DOMAIN RULE (dimensional correctness): 'or' is valid for RATES and
// probabilities alike (both add in series, first order). 'and' is valid for
// PROBABILITIES ONLY — a product of rates is not a rate (/h² is not a unit
// of hazard). Callers apportioning a rate through a parallel structure must
// convert to probability over a stated exposure time first (P = 1−e^(−λT)),
// split, then convert back (λ = −ln(1−P)/T). See modules/thr.js.
export function apportion(target, children, kind) {
    const n = children.length;
    if (!n) return [];
    const wsum = children.reduce((a, c) => a + (c.weight || 1), 0);
    if (kind === 'and') {
        // equal-exponent split of the product: each child gets target^(w/wsum)
        return children.map(c => ({ ...c, target: Math.pow(target, (c.weight || 1) / wsum) }));
    }
    return children.map(c => ({ ...c, target: target * (c.weight || 1) / wsum }));
}

// ---- reliability rollups ----------------------------------------------------
export const mtbf = (lambda) => (lambda > 0 ? 1 / lambda : Infinity);
export const seriesLambda = (items) => items.reduce((a, it) => a + (it.lambda || 0), 0);

// ---- availability -----------------------------------------------------------
// Inherent availability from λ + MTTR (both in hours).
export function inherentAvailability(lambda, mttr) {
    const m = mtbf(lambda);
    if (!isFinite(m)) return 1;
    return m / (m + (mttr || 0));
}
// Operational availability from uptime/downtime totals.
export const operationalAvailability = (upH, downH) => (upH + downH > 0 ? upH / (upH + downH) : 1);
// Steady-state availability of a series of items (independent): product.
export const seriesAvailability = (avs) => avs.reduce((a, b) => a * b, 1);
// Expected downtime hours per year for an item.
export const annualDowntime = (lambda, mttr, opHoursPerYear) => (lambda || 0) * (opHoursPerYear || 8760) * (mttr || 0);

// ---- maintainability --------------------------------------------------------
// MDT = active repair + logistics + administrative delays.
export const mdt = (t) => (t.activeRepair || 0) + (t.logistics || 0) + (t.admin || 0);
// Fleet/mean MTTR weighted by task frequency (λ of the initiating failure).
export function meanMttr(tasks) {
    let num = 0, den = 0;
    tasks.forEach(t => { const w = t.lambda || 0; num += w * (t.mttr || 0); den += w; });
    return den > 0 ? num / den : 0;
}

// ---- reliability demonstration statistics (MIL-HDBK-781A) --------------------
// One-sided lower confidence bound on MTBF from (T hours, r failures):
//   r = 0: T / (−ln(1−C));  r > 0: 2T / χ²(C; 2r+2)  (time-terminated).
export function normInv(p) {   // Beasley–Springer rational approx (|err| < 3e-4)
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const pl = 0.02425;
    if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
    if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1-p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
    const q = p - 0.5, r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
}
export function chi2Quantile(p, k) {   // Wilson–Hilferty; exact for k=2
    if (k === 2) return -2 * Math.log(1 - p);
    const z = normInv(p), t = 2 / (9 * k);
    return k * Math.pow(1 - t + z * Math.sqrt(t), 3);
}
export function mtbfLowerBound(T, r, C) {
    if (!(T > 0) || r < 0) return null;
    if (r === 0) return T / (-Math.log(1 - C));
    return 2 * T / chi2Quantile(C, 2 * r + 2);
}

// ---- demonstrated-vs-target verdicts (two-lane check, generic) ---------------
export function laneCheck(computed, elicited, tolerance) {
    if (computed == null || elicited == null) return 'open';
    const tol = tolerance == null ? 0 : tolerance;
    if (elicited <= computed * (1 + tol)) return 'verified';
    return 'finding';
}
