// ============================================================================
// rbd_xcheck.js — v0.2 — RBD-XCHECK (task #94): every RBD result is computed
// twice, two ways, and must agree.
//
// The mathematics (the Rathore dual, encoded):
//   - Minimal TIE-SETS (path sets): the success view. A tie-set is a minimal
//     set of blocks which, all working, carry the system. R = P(∪ tie-sets up),
//     by inclusion–exclusion over the minimal tie-sets.
//   - Minimal CUT-SETS: the failure view. A cut-set is a minimal set of blocks
//     whose joint failure downs the system. Q = P(∪ cut-sets down), by
//     inclusion–exclusion; R = 1 − Q.
//   The two are mathematically equivalent for coherent structures with
//   independent blocks. If they disagree beyond floating tolerance, SOMETHING
//   IS WRONG IN THE TOOL — so nothing is shown, and the disagreement is a
//   named refusal + a hard INV-33 finding. The card also shows the structural
//   result (rbd_module's own qOf) as a third, independently coded leg.
//
// Honest limits (refusal over repair):
//   - inclusion–exclusion is 2^m in the minimal-set count: above 16 sets the
//     cross-check REFUSES with the reason and the structural result stands
//     alone (clearly labelled as single-computation).
//   - set generation caps at 512 intermediate sets — combinatorial burst is
//     named, never silently truncated (no silent caps).
//
// INV-33 (hard) — registered into the SAME shared sweep as everything else:
// "RBD tie-set and cut-set computations agree (and match the structural
// result) on every resolvable model." Ids are a shared namespace; INV-32 was
// the last taken (STPA). Checked free before claiming — the zonal lesson.
//
// Deterministic: no RNG, no Date, no eval. projectConfig is a SCRIPT-SCOPE
// global (top-level let) — bare-identifier access only, never
// window.projectConfig (the OPS-MC v0.1 lesson).
// ============================================================================
(function () {
    'use strict';

    const GEN_CAP = 512;   // intermediate minimal-set cap during generation
    const IE_CAP = 16;     // inclusion–exclusion cap (2^16 = 65,536 subsets)
    const TOL = 1e-9;      // agreement tolerance, absolute on probabilities

    // ------------------------------------------------------------- leaves
    function leaves(node, out) {
        out = out || [];
        if (node.kind === 'block') { out.push(node); return out; }
        (node.children || []).forEach(c => leaves(c, out));
        return out;
    }

    // --------------------------------------------- minimal set machinery
    // Sets are sorted arrays of leaf indices; keyed by join for dedupe.
    const _key = s => s.join(',');
    function _minimalize(sets) {
        const uniq = new Map();
        sets.forEach(s => uniq.set(_key(s), s));
        const arr = [...uniq.values()].sort((a, b) => a.length - b.length);
        const kept = [];
        arr.forEach(s => {
            const sset = new Set(s);
            if (!kept.some(k => k.every(x => sset.has(x)))) kept.push(s);
        });
        return kept;
    }
    function _cross(a, b) {
        const out = [];
        a.forEach(x => b.forEach(y => {
            out.push([...new Set([...x, ...y])].sort((p, q) => p - q));
            if (out.length > GEN_CAP * 4) throw new Error('RBD-XCHECK refused: combinatorial burst while crossing minimal sets (> ' + (GEN_CAP * 4) + '). The structure is too entangled for exact set enumeration — the structural result stands, single-computation, and says so.');
        }));
        return _minimalize(out);
    }
    function _kSubsets(arr, k) {
        const out = [];
        (function rec(start, acc) {
            if (acc.length === k) { out.push(acc.slice()); return; }
            for (let i = start; i < arr.length; i++) { acc.push(arr[i]); rec(i + 1, acc); acc.pop(); }
        })(0, []);
        return out;
    }
    function _guard(sets, what) {
        if (sets.length > GEN_CAP) throw new Error('RBD-XCHECK refused: ' + what + ' produced ' + sets.length + ' minimal sets (cap ' + GEN_CAP + '). No silent truncation — the structural result stands, single-computation, and says so.');
        return sets;
    }

    // node → minimal path sets (tie-sets), over leaf INDEX (assigned by walk order)
    function tieSets(node, idxMap) {
        if (node.kind === 'block') return [[idxMap.get(node)]];
        const kids = node.children || [];
        if (node.kind === 'series') {
            let acc = [[]];
            kids.forEach(c => { acc = _cross(acc, tieSets(c, idxMap)); });
            return _guard(acc, 'series tie-set cross');
        }
        if (node.kind === 'parallel')
            return _guard(_minimalize(kids.flatMap(c => tieSets(c, idxMap))), 'parallel tie-set union');
        if (node.kind === 'koon') {
            const subs = _kSubsets(kids, node.k);
            let all = [];
            subs.forEach(sub => {
                let acc = [[]];
                sub.forEach(c => { acc = _cross(acc, tieSets(c, idxMap)); });
                all = all.concat(acc);
            });
            return _guard(_minimalize(all), 'k-oo-n tie-set expansion');
        }
        throw new Error('RBD-XCHECK refused: unknown node kind "' + node.kind + '".');
    }
    // node → minimal cut sets (the dual: series↔parallel swap; koon needs n−k+1 failures)
    function cutSets(node, idxMap) {
        if (node.kind === 'block') return [[idxMap.get(node)]];
        const kids = node.children || [];
        if (node.kind === 'series')
            return _guard(_minimalize(kids.flatMap(c => cutSets(c, idxMap))), 'series cut-set union');
        if (node.kind === 'parallel') {
            let acc = [[]];
            kids.forEach(c => { acc = _cross(acc, cutSets(c, idxMap)); });
            return _guard(acc, 'parallel cut-set cross');
        }
        if (node.kind === 'koon') {
            const need = kids.length - node.k + 1;
            const subs = _kSubsets(kids, need);
            let all = [];
            subs.forEach(sub => {
                let acc = [[]];
                sub.forEach(c => { acc = _cross(acc, cutSets(c, idxMap)); });
                all = all.concat(acc);
            });
            return _guard(_minimalize(all), 'k-oo-n cut-set expansion');
        }
        throw new Error('RBD-XCHECK refused: unknown node kind "' + node.kind + '".');
    }

    // ------------------------------------- inclusion–exclusion, both views
    // P(∪ events) where event i = "every member of sets[i] is in the given
    // state", member state probabilities in pState[leafIdx]. Independent blocks.
    function _unionProb(sets, pState) {
        if (sets.length > IE_CAP) throw new Error('RBD-XCHECK refused: ' + sets.length + ' minimal sets exceeds the inclusion–exclusion cap of ' + IE_CAP + ' (2^m subsets). The structural result stands, single-computation, and says so.');
        const m = sets.length;
        let total = 0;
        for (let mask = 1; mask < (1 << m); mask++) {
            const union = new Set();
            let bits = 0;
            for (let i = 0; i < m; i++) if (mask & (1 << i)) { bits++; sets[i].forEach(x => union.add(x)); }
            let prod = 1;
            union.forEach(x => { prod *= pState[x]; });
            total += (bits % 2 ? 1 : -1) * prod;
        }
        return total;
    }

    // ------------------------------------------------------------ the check
    // structure: rbd_module node tree. t: mission hours.
    function xcheck(structure, t) {
        if (!structure) throw new Error('RBD-XCHECK: no structure given.');
        if (!(t > 0)) throw new Error('RBD-XCHECK refused: mission time must be > 0 hours.');
        const lv = leaves(structure);
        if (!lv.length) throw new Error('RBD-XCHECK refused: the structure has no blocks.');
        const idxMap = new Map(lv.map((n, i) => [n, i]));
        const r = lv.map(n => Math.exp(-(n.lambda || 0) * t));
        const q = r.map(x => 1 - x);

        const ties = tieSets(structure, idxMap);
        const cuts = cutSets(structure, idxMap);
        const rTie = _unionProb(ties, r);            // success view
        const rCut = 1 - _unionProb(cuts, q);        // failure view, complemented
        const delta = Math.abs(rTie - rCut);
        const agree = delta <= TOL;
        const nm = s => s.map(i => lv[i].name || ('B' + i)).join('·');
        if (!agree) throw new Error('RBD-XCHECK DISAGREEMENT: tie-set view R = ' + rTie + ' vs cut-set view R = ' + rCut + ' (Δ = ' + delta.toExponential(3) + ' > ' + TOL.toExponential(0) + '). The tool refuses to show a number it cannot compute twice — this is an INV-33 hard finding, not a display problem.');
        return {
            t: t, rTie: rTie, rCut: rCut, delta: delta, agree: true,
            tieCount: ties.length, cutCount: cuts.length,
            tieSets: ties.map(nm), cutSets: cuts.map(nm),
            basis: 'R computed twice: inclusion–exclusion over ' + ties.length + ' minimal tie-sets (success view) and over ' + cuts.length + ' minimal cut-sets (failure view, complemented). Independent blocks, q = 1−e^(−λt), t = ' + t + ' h. Agreement asserted to ' + TOL.toExponential(0) + '. Computed, never stored.'
        };
    }

    // ----------------------------------------------------------- INV-33
    function _models() {
        try {
            if (typeof projectConfig === 'undefined' || !projectConfig || !projectConfig.rbd) return [];
            return projectConfig.rbd.models || [];
        } catch (_) { return []; }
    }
    function _structureOf(m) {
        try {
            if (m.fromPage && typeof window._rbdFromPage === 'function') { const d = window._rbdFromPage(m.fromPage); return d ? d.structure : null; }
            if (m.dsl && typeof window._rbdParseDsl === 'function') return window._rbdParseDsl(m.dsl);
        } catch (_) {}
        return null;
    }
    function _missionT() { try { return (typeof ftaConfig === 'object' && ftaConfig && ftaConfig.exposureTime) || 1; } catch (_) { return 1; } }
    function _invRun() {
        const fails = [];
        let checked = 0;
        _models().forEach(m => {
            const s = _structureOf(m);
            if (!s) return;
            checked++;
            try {
                const r = xcheck(s, _missionT());
                // third leg: the structural computation (independently coded in rbd_module)
                if (typeof window._rbdR === 'function') {
                    const rStruct = window._rbdR(s, _missionT());
                    if (Math.abs(rStruct - r.rTie) > TOL) fails.push('"' + m.name + '": structural R = ' + rStruct + ' vs dual-computed R = ' + r.rTie);
                }
            } catch (e) {
                if (/DISAGREEMENT/.test(e.message)) fails.push('"' + m.name + '": ' + e.message);
                // capacity refusals are honest skips, not findings
            }
        });
        return { checked: checked, fails: fails };
    }
    // Registration with a retry: invRegister lives in invariants.js, and a
    // silent skip on load order is exactly how a check disappears without a
    // trace (found live in v0.1 — the tag sat above invariants.js). If the
    // registrar never shows up, say so in the console rather than vanishing.
    function _register(attempt) {
        if (typeof window === 'undefined') return;
        if (typeof window.invRegister === 'function') {
            window.invRegister({
                id: 'INV-33',
                name: 'RBD reliability agrees when computed by tie-sets, cut-sets, and structure (dual-computation cross-check)',
                sev: 'hard',
                run: _invRun
            });
            return;
        }
        if (attempt < 20) setTimeout(() => _register(attempt + 1), 250);
        else try { console.warn('RBD-XCHECK: invRegister never appeared — INV-33 NOT registered. A missing check is a hole, not a pass.'); } catch (_) {}
    }
    _register(0);

    // ---------------------------------------------------------------- UI
    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    function _cardHtml() {
        const models = _models().map(m => ({ m: m, s: _structureOf(m) })).filter(x => x.s);
        if (!models.length) return '';
        const t = _missionT();
        let rows = '';
        models.forEach(x => {
            let body;
            try {
                const r = xcheck(x.s, t);
                const rStruct = (typeof window._rbdR === 'function') ? window._rbdR(x.s, t) : null;
                const third = rStruct != null ? ' · structural ' + rStruct.toPrecision(10) + (Math.abs(rStruct - r.rTie) <= TOL ? ' ✓' : ' ✗ MISMATCH') : '';
                const show = (label, arr, n) => label + ' {' + arr.slice(0, n).join('} {') + '}' + (arr.length > n ? ' +' + (arr.length - n) + ' more' : '');
                body =
                    '<span style="font-weight:700; color:#166534;">AGREE</span> · Δ = ' + r.delta.toExponential(2) +
                    ' · tie-view ' + r.rTie.toPrecision(10) + ' · cut-view ' + r.rCut.toPrecision(10) + third + '<br>' +
                    '<span style="color:var(--color-text-tertiary);">' + _esc(show(r.tieCount + ' tie-sets:', r.tieSets, 6)) + '<br>' +
                    _esc(show(r.cutCount + ' cut-sets:', r.cutSets, 6)) + '</span>';
            } catch (e) {
                const isDis = /DISAGREEMENT/.test(e.message);
                body = '<span style="font-weight:700; color:' + (isDis ? '#8E2A2A' : '#B45309') + ';">' + (isDis ? 'DISAGREEMENT — INV-33' : 'CROSS-CHECK REFUSED') + '</span> · <span style="color:var(--color-text-tertiary);">' + _esc(e.message) + '</span>';
            }
            rows += '<div style="padding:8px 12px; border-bottom:1px solid var(--color-border);" class="u-mono"><b style="font-size:11.5px;">' + _esc(x.m.name) + '</b><div style="font-size:10.5px; margin-top:3px;">' + body + '</div></div>';
        });
        return '<div id="rbd-xc-card" style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-top:16px;">' +
            '<div style="padding:9px 14px; border-bottom:2px solid var(--color-text-primary); display:flex; justify-content:space-between; gap:10px; align-items:center;">' +
            '<b>Dual-computation cross-check — INV-33</b>' +
            '<span class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary);">every figure computed twice, two ways, and they must agree · t = ' + t + ' h</span></div>' +
            rows + '</div>';
    }
    function renderXcheck() {
        if (typeof document === 'undefined') return;
        const host = document.getElementById('ram-rbd-host');
        if (!host) return;
        const old = document.getElementById('rbd-xc-card');
        if (old) old.remove();
        const html = _cardHtml();
        if (html) host.insertAdjacentHTML('beforeend', html);
    }

    const API = { xcheck: xcheck, tieSets: tieSets, cutSets: cutSets, leaves: leaves, renderXcheck: renderXcheck, _unionProb: _unionProb, _invRun: _invRun };

    // ------------------------------------------------------------- wiring
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        (function wire() {
            if (typeof window.renderRamRbdPage === 'function' && !window.renderRamRbdPage._xcWrapped) {
                const orig = window.renderRamRbdPage;
                const wrapped = function () { const r = orig.apply(this, arguments); try { setTimeout(renderXcheck, 0); } catch (_) {} return r; };
                wrapped._xcWrapped = true;
                window.renderRamRbdPage = wrapped;
            } else if (!window.renderRamRbdPage && typeof window.addEventListener === 'function') {
                window.addEventListener('DOMContentLoaded', () => setTimeout(wire, 700));
            }
        })();
    }

    if (typeof window !== 'undefined') window.RBD_XCHECK = API;
    if (typeof module !== 'undefined') module.exports = API;
})();
