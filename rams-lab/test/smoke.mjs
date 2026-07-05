// test/smoke.mjs — RAMS Lab smoke test. Two jobs:
//   1. ENFORCE THE CONSTITUTION (file ceilings, import rules) so the
//      anti-monolith rules are mechanical, not aspirational.
//   2. Verify core math, evidence chain, spine tables, module registration.
// Run: node site/rams/test/smoke.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'site');
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
    if (cond) { pass++; console.log('  ✓', name); }
    else { fail++; console.log('  ✗', name, detail || ''); }
};

// ---------------- constitution checks ----------------
console.log('CONSTITUTION');
const jsFiles = [];
(function walk(dir) {
    readdirSync(dir).forEach(f => {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) { if (f !== 'test') walk(p); }
        else if (f.endsWith('.js')) jsFiles.push(p);
    });
})(ROOT);

for (const f of jsFiles) {
    const rel = f.slice(ROOT.length + 1);
    const src = readFileSync(f, 'utf8');
    const lines = src.split('\n').length;
    ok('≤500 lines: ' + rel + ' (' + lines + ')', lines <= 500);
    if (lines > 400) console.log('    ⚠ approaching ceiling:', rel, lines);

    const imports = [...src.matchAll(/from\s+'([^']+)'/g)].map(m => m[1]);
    if (rel.startsWith('modules/')) {
        ok('no module→module import: ' + rel, !imports.some(i => i.includes('/modules/') || (i.startsWith('./') && rel !== 'modules/' + i.slice(2))),
           imports.filter(i => i.includes('modules/')).join(','));
        ok('module does not import shell: ' + rel, !imports.some(i => i.includes('ui/shell')));
    }
    if (rel.startsWith('core/')) {
        ok('core imports no modules/spine: ' + rel, !imports.some(i => i.includes('modules/') || i.includes('spine/')), imports.join(','));
    }
    if (rel.startsWith('spine/')) {
        ok('spine imports nothing: ' + rel, imports.length === 0, imports.join(','));
    }
}
const appSrc = readFileSync(join(ROOT, 'app.js'), 'utf8');
ok('only app.js composes modules', jsFiles.every(f =>
    f.endsWith('app.js') || !readFileSync(f, 'utf8').includes("register(")
    || f.includes('registry.js')));

// ---------------- headless environment ----------------
const mem = {};
globalThis.localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; }, removeItem: k => { delete mem[k]; } };

// ---------------- core math ----------------
console.log('ENGINE');
const E = await import(new URL('../site/core/engine.js', import.meta.url));
ok('P↔λ round trip', Math.abs(E.lambdaFromP(E.pFromLambda(1e-6, 1.5), 1.5) - 1e-6) < 1e-15);
ok('OR eval', Math.abs(E.evalStructure({ kind: 'or', children: [{ kind: 'event', p: 0.1 }, { kind: 'event', p: 0.2 }] }) - 0.28) < 1e-12);
ok('AND eval', Math.abs(E.evalStructure({ kind: 'and', children: [{ kind: 'event', p: 0.1 }, { kind: 'event', p: 0.2 }] }) - 0.02) < 1e-12);
// 2oo3: P(≥2 of 3 fail), p=0.1 → 3·0.01·0.9 + 0.001 = 0.028
ok('koon 2oo3 exact', Math.abs(E.evalStructure({ kind: 'koon', k: 2, children: [0.1, 0.1, 0.1].map(p => ({ kind: 'event', p })) }) - 0.028) < 1e-12);
const seriesSplit = E.apportion(1e-8, [{ weight: 1 }, { weight: 1 }, { weight: 2 }], 'or');
ok('series apportionment sums to target', Math.abs(seriesSplit.reduce((a, c) => a + c.target, 0) - 1e-8) < 1e-20);
ok('weighted share', Math.abs(seriesSplit[2].target - 5e-9) < 1e-20);
const parSplit = E.apportion(1e-6, [{ weight: 1 }, { weight: 1 }], 'and');
ok('parallel apportionment product = target', Math.abs(parSplit[0].target * parSplit[1].target - 1e-6) / 1e-6 < 1e-9);
ok('inherent availability', Math.abs(E.inherentAvailability(1e-4, 1) - (10000 / 10001)) < 1e-12);
ok('MDT decomposition', Math.abs(E.mdt({ activeRepair: 0.2, logistics: 0.1, admin: 0.05 }) - 0.35) < 1e-12);
// MIL-HDBK-781A chi-square demonstration statistics
ok('chi2 exact k=2', Math.abs(E.chi2Quantile(0.6, 2) - 1.83258146) < 1e-6);
ok('chi2 WH approx k=4', Math.abs(E.chi2Quantile(0.6, 4) - 4.0446) < 0.05);
ok('MTBF LCB zero-failure', Math.abs(E.mtbfLowerBound(3000, 0, 0.6) - 3000 / 0.91629073) < 0.5);
ok('MTBF LCB r=1', Math.abs(E.mtbfLowerBound(10000, 1, 0.6) - 2 * 10000 / E.chi2Quantile(0.6, 4)) < 1e-9);
// rate → probability → rate round trip for parallel apportionment (thr.js path)
const pP = E.pFromLambda(1e-8, 10);
const legs = E.apportion(pP, [{ weight: 1 }, { weight: 1 }], 'and').map(c => E.lambdaFromP(c.target, 10));
ok('parallel THR split dimensionally sound', Math.abs(E.pFromLambda(legs[0], 10) * E.pFromLambda(legs[1], 10) - pP) / pP < 1e-9);

// ---------------- evidence ----------------
console.log('EVIDENCE');
const V = await import(new URL('../site/core/evidence.js', import.meta.url));
const evRoot = { signoffs: [], baselines: [] };
await V.sign(evRoot, { kind: 'hazard', id: 'HZ-001' }, 'state:controlled', 'T', { a: 1 });
await V.sign(evRoot, { kind: 'srac', id: 'SRAC-001' }, 'state:accepted', 'T', { b: 2 });
ok('chain verifies', (await V.verifyChain(evRoot)).ok);
const saved = evRoot.signoffs[0].signer;
evRoot.signoffs[0].signer = 'FORGED';
ok('tampering detected', !(await V.verifyChain(evRoot)).ok);
evRoot.signoffs[0].signer = saved;
ok('chain re-verifies after restore', (await V.verifyChain(evRoot)).ok);
ok('drift detection', V.isStale(evRoot, { kind: 'hazard', id: 'HZ-001' }, { a: 2 }) === true &&
                      V.isStale(evRoot, { kind: 'hazard', id: 'HZ-001' }, { a: 1 }) === false);

// ---------------- spine ----------------
console.log('SPINE');
const { spine } = await import(new URL('../site/spine/en50126.js', import.meta.url));
ok('THR→SIL table', spine.silFromThr(1e-9) === 4 && spine.silFromThr(5e-8) === 3 && spine.silFromThr(5e-7) === 2 && spine.silFromThr(5e-6) === 1);
// EN 50129 Table A.1 boundaries: closed below, OPEN above — 1e-8 is SIL 3, not 4.
ok('SIL boundary discipline', spine.silFromThr(1e-8) === 3 && spine.silFromThr(9.9e-9) === 4 && spine.silFromThr(1e-7) === 2 && spine.silFromThr(1e-5) === 0 && spine.silFromThr(1e-12) === 4);
ok('risk matrix corners', spine.riskMatrix.cell(5, 3) === 'Intolerable' && spine.riskMatrix.cell(0, 0) === 'Negligible');
// EN 50126-1 example calibration spot checks (explicit table, not a heuristic)
ok('risk matrix example cells', spine.riskMatrix.cell(1, 3) === 'Tolerable' && spine.riskMatrix.cell(2, 2) === 'Undesirable' && spine.riskMatrix.cell(3, 3) === 'Intolerable' && spine.riskMatrix.cell(4, 1) === 'Undesirable');
ok('checklists defined', ['ph4', 'ph5', 'ph6'].every(k => spine.checklists[k].length >= 3));

// ---------------- store + modules registration + sample ----------------
console.log('MODULES');
const { store } = await import(new URL('../site/core/store.js', import.meta.url));
const { registry } = await import(new URL('../site/core/registry.js', import.meta.url));
const mods = ['dashboard', 'sample', 'hazards', 'thr', 'reliability', 'availability', 'maintainability', 'sracs', 'safetycase'];
for (const m of mods) {
    const mod = await import(new URL('../site/modules/' + m + '.js', import.meta.url));
    registry.register(mod.module);
}
ok('all modules registered', registry.all().length === mods.length);
ok('sections form', registry.sections().length >= 4);
const { sampleProject } = await import(new URL('../site/modules/sample.js', import.meta.url));
const s = sampleProject();
store.replace(s);
ok('sample loads through store', store.state.hazards.length === 5 && store.state.sracs.length === 3);
ok('sample SILs match spine', store.state.hazards.filter(h => h.thr > 0).every(h => h.sil === spine.silFromThr(h.thr)));
ok('sample THR apportionment sums', Math.abs(store.state.thr[0].children.reduce((a, c) => a + c.target, 0) - 1e-9) < 1e-18);
ok('checklist ph4 evaluates on sample', spine.checklists.ph4.filter(d => d.kind === 'auto').every(d => { try { return typeof d.eval(store.state) === 'boolean'; } catch (_) { return false; } }));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
