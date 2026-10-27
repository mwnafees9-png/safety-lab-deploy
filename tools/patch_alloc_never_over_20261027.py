#!/usr/bin/env python3
"""27 Oct 2026: a top-down allocation tree never adds up to more than its target.

Found by sweeping tree shapes through the real engine (tests/regression_alloc_never_over_20261027.test.js):
  - trees with a repeated event closed slightly OVER (up to 0.009%): the rebalance accepted 0.1% over
    at the start and stopped its search on whichever side of the target it happened to be.
Now: the exact close runs whenever the tree's logic makes the exact total differ from the gate-by-gate
split (a repeated event, a functional dependency or a NOT gate), and both searches finish on the side at
or under the target. Common cause stays out of the allocation (Waqas, 12 Oct 2026: the design does not
exist yet; the gates derive independence requirements instead). A tree that comes out under its target stays as it is (more margin is fine).

Run from the repo root: python3 tools/patch_alloc_never_over_20261027.py   (refuses on any missing anchor)
"""
import os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = lambda p: os.path.join(ROOT, 'site', p)
def rd(p):
    with open(p, encoding='utf-8') as f: return f.read()
def wr(p, s):
    with open(p, 'w', encoding='utf-8') as f: f.write(s)
def sub1(s, old, new, name):
    n = s.count(old)
    if n != 1: sys.exit('anchor %s found %d times' % (name, n))
    return s.replace(old, new)

h = rd(S('helpers_modules.js'))
if '_allocNeedsExactClose' in h: sys.exit('helpers_modules.js already patched')

# ---- when the exact total can differ from the split
h = sub1(h, "function mcsAwareRebalance(rootNode, targetProb) {\n",
'''// 27 Oct 2026: the tree's own logic makes the exact total of an allocation differ from its gate-by-gate
// split in three ways: a repeated event, a functional dependency, or a NOT gate. Any of them means the
// budget is closed against the exact total (mcsAwareRebalance). Common cause is deliberately not one of
// them: allocation happens before the design exists, so it carries no common cause (Waqas, 12 Oct 2026);
// its AND gates derive independence requirements instead. Follows TRANSFERs.
function _allocNeedsExactClose(rootNode) {
    if (!rootNode) return false;
    if (_hasRepeatedLogicalIds(rootNode)) return true;
    let hit = false;
    const visited = new Set();
    (function walk(n) {
        if (!n || hit) return;
        if (n.gateType === 'TRANSFER' || n.transferOutTo) {
            const linkedId = n.transferOutTo || n.linkedPageId;
            if (linkedId && !visited.has(linkedId)) {
                visited.add(linkedId);
                const linkedPage = (typeof ftaPages !== 'undefined') ? ftaPages.find(p => p.id === linkedId) : null;
                if (linkedPage && linkedPage.root) walk(linkedPage.root);
            }
            return;
        }
        if (n.type === 'gate' && (n.gateType === 'FDEP' || n.gateType === 'NOT')) { hit = true; return; }
        const kids = n.children || n._children;
        if (kids) kids.forEach(walk);
    })(rootNode);
    return hit;
}

function mcsAwareRebalance(rootNode, targetProb) {
''', 'needs close')

# ---- rebalance: no slack at the start, finish at or under the target
h = sub1(h, '''    const pAtOne = applyScaleAndEvaluate(1.0);
    if (pAtOne <= targetProb * 1.001) {
        // Naive is already feasible or under. Leave at k=1 (no rebalance needed)
        // and let any small headroom show via the divergence display.
        return true;
    }

    // Bisection on k in (0, 1]. We want to shrink rates so the dominant cutset
    // probability drops to the target. Converges in ~50 iterations.
    let kLo = 0.0, kHi = 1.0;
    let kBest = 1.0;
    const tolRel = 1e-4;
    for (let iter = 0; iter < 60; iter++) {
        const kMid = 0.5 * (kLo + kHi);
        const pMid = applyScaleAndEvaluate(kMid);
        kBest = kMid;
        if (Math.abs(pMid - targetProb) / targetProb < tolRel) break;
        if (pMid > targetProb) kHi = kMid;
        else                   kLo = kMid;
    }
    // Final state at converged k. Lambda + probability on every leaf is now
    // the MCS-aware allocated value (uniform-scaled from naive).
    applyScaleAndEvaluate(kBest);
    return true;
}''', '''    const pAtOne = applyScaleAndEvaluate(1.0);
    // 27 Oct 2026: at or under the target is closed (more margin is fine); a hair over is not. The old
    // check let a tree stand 0.1% over its target.
    if (pAtOne <= targetProb) return true;

    // Bisection on k in (0, 1]: shrink every budget by the same factor until the exact total is at or
    // under the target. 27 Oct 2026: the search keeps the largest k that is at or under the target
    // (kLo) and finishes THERE; it used to finish on whichever side its last step landed, up to 0.01% over.
    let kLo = 0.0, kHi = 1.0;
    const tolRel = 1e-4;
    for (let iter = 0; iter < 60; iter++) {
        const kMid = 0.5 * (kLo + kHi);
        const pMid = applyScaleAndEvaluate(kMid);
        if (pMid <= targetProb) {
            kLo = kMid;
            if ((targetProb - pMid) / targetProb < tolRel) break;
        } else {
            kHi = kMid;
        }
    }
    applyScaleAndEvaluate(kLo);
    return true;
}''', 'rebalance search')

h = sub1(h, '''    let kBest = 1.0;
    for (let i = 0; i < 60; i++) {
        const kMid = 0.5 * (kLo + kHi);
        const pMid = applyScale(kMid);
        kBest = kMid;
        if (Math.abs(pMid - targetProb) / targetProb < 1e-4) break;
        if (pMid > targetProb) kHi = kMid; else kLo = kMid;
    }
    applyScale(kBest);
    return true;
}''', '''    // 27 Oct 2026: finish at the largest scale whose exact total is at or under the target, never over.
    for (let i = 0; i < 60; i++) {
        const kMid = 0.5 * (kLo + kHi);
        const pMid = applyScale(kMid);
        if (pMid <= targetProb) {
            kLo = kMid;
            if ((targetProb - pMid) / targetProb < 1e-4) break;
        } else {
            kHi = kMid;
        }
    }
    applyScale(kLo);
    return true;
}''', 'importance search')
h = sub1(h, "    let pHi = applyScale(kHi);\n    while (pHi < targetProb && kHi < 1e9) { kHi *= 4; pHi = applyScale(kHi); }\n",
         "    let pHi = applyScale(kHi);\n    while (pHi <= targetProb && kHi < 1e9) { kLo = kHi; kHi *= 4; pHi = applyScale(kHi); }\n", 'importance probe')
# ---- the warning pill: over the target is a warning (should not happen any more), under is margin
h = sub1(h, """        const rel = (target !== null && target > 0) ? Math.abs(aP - target) / target : null;
        if (rel === null || rel >= 0.01) {
            const worse = target !== null && aP > target;
            const pct = rel === null ? '' : ' (' + (rel * 100).toFixed(rel < 0.1 ? 1 : 0) + '% ' + (worse ? 'over' : 'under') + ')';
            out.push({ key: worse ? 'actual-over' : 'actual-under', sev: worse ? 'warn' : 'info',
                title: worse ? 'Top event: the tree adds up to more than the target' : 'Top event: the tree adds up to less than the target',
                text: 'Actual (exact): P=' + fmt(aP) + (target !== null ? ' against the target P=' + fmt(target) + pct : '') +
                      '. The exact total of the tree as built, with repeated events and AND gates counted exactly.' });
        }
    }
""", """        // 27 Oct 2026: an allocation is closed at or under its target, so only OVER is said (beyond rounding,
        // one part in a million). Under the target is margin, which is fine, and says nothing.
        const over = (target !== null && target > 0) ? (aP - target) / target : null;
        if (over !== null && over > 1e-6) {
            const pct = ' (' + (over * 100 < 0.01 ? '<0.01' : (over * 100).toFixed(over < 0.1 ? 2 : 0)) + '% over)';
            out.push({ key: 'actual-over', sev: 'warn',
                title: 'Top event: the tree adds up to more than the target',
                text: 'Actual (exact): P=' + fmt(aP) + ' against the target P=' + fmt(target) + pct +
                      '. The exact total of the tree as built, with repeated events, common cause and AND gates counted exactly.' });
        }
    }
    // 27 Oct 2026: when the exact method had to give up on this tree (too many shared events), the budget
    // is split gate by gate and nobody can say it closes: say so rather than show nothing.
    if (isRoot && typeof ftaConfig === 'object' && ftaConfig && ftaConfig.mode === 'top-down' && node._exactCloseRefused) {
        out.push({ key: 'exact-refused', sev: 'warn',
            title: 'Exact total could not be computed for this tree',
            text: 'The exact total of this tree could not be computed (too many shared events for the exact method), so its budget is split gate by gate and is not checked against the target.' });
    }
""", 'pill actual')
h = sub1(h, "    if (node._probCompromised) {\n", """    // 27 Oct 2026: a gate whose prescribed budget is more than the share the top event gives it lets the
    // tree add up to more than its target (by the engineer's choice); it says so where it happens.
    if (node._prescribedOverallocation && isFinite(node._prescribedOverallocation.apportioned)) {
        const po = node._prescribedOverallocation;
        out.push({ key: 'prescribed-over', sev: 'warn',
            title: 'Prescribed budget is more than this gate\\'s share of the top event',
            text: 'Prescribed P=' + fmt(po.prescribed) + ' is ' + (isFinite(po.excessRatio) ? Number(po.excessRatio).toFixed(1) + ' times' : 'more than') + ' the P=' + fmt(po.apportioned) + ' this gate gets from the top event, so the tree adds up to more than its target.' });
    }
    if (node._probCompromised) {
""", 'pill prescribed')
wr(S('helpers_modules.js'), h)

# ---- the engine: close the budget whenever the exact total can differ
q = rd(S('fta_quant_modules.js'))
q = sub1(q, """            if (typeof _hasRepeatedLogicalIds === 'function'
                && _hasRepeatedLogicalIds(rootPage.root)
                && typeof mcsAwareRebalance === 'function'""",
         """            // 27 Oct 2026: not only a repeated event: an FDEP or a NOT gate also make the exact total
            // differ from the split (_allocNeedsExactClose). Common cause stays out of allocation.
            if (typeof _allocNeedsExactClose === 'function'
                && _allocNeedsExactClose(rootPage.root)
                && typeof mcsAwareRebalance === 'function'""", 'engine trigger')
q = sub1(q, """                    if (!(e && e.name === 'BDDExplosionError')) throw e;
                    rebalanced = false;   // → strictest-propagation fallback below
""", """                    if (!(e && e.name === 'BDDExplosionError')) throw e;
                    rebalanced = false;   // → strictest-propagation fallback below
                    rootPage.root._exactCloseRefused = true;   // 27 Oct 2026: the warning pill says so
""", 'refused flag')
q = sub1(q, """            let rebalanced = false;
            // 27 Oct 2026: not only a repeated event""", """            let rebalanced = false;
            delete rootPage.root._exactCloseRefused;
            // 27 Oct 2026: not only a repeated event""", 'refused clear')
wr(S('fta_quant_modules.js'), q)

x = rd(S('index.html'))
for nm in ('fta_quant_modules.js', 'helpers_modules.js'):
    m = re.search(re.escape(nm) + r'\?v=(\d+)\.(\d+)', x)
    if not m: sys.exit('no version for ' + nm)
    x = x.replace(m.group(0), '%s?v=%s.%d' % (nm, m.group(1), int(m.group(2)) + 1), 1)
wr(S('index.html'), x)
print('patched: helpers_modules.js, fta_quant_modules.js, index.html')
