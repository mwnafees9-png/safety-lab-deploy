#!/usr/bin/env node
/* Regression: one huge part split by body (cad_step_struct.js bodies / extractBody), 14 Oct 2026.
 * The NASA CRM assembly is one product holding 35 bodies (265 MB); OpenCascade reading it in one call
 * ran out of memory. Each body is cut out as its own self-contained STEP file and read on its own.
 * Fixture: tests/fixtures/cad/one_product_three_bodies.step (a part whose representation lists three solids). */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site'), SRC = fs.readFileSync(path.join(SITE, 'cad_step_struct.js'), 'utf8');
const FIX = path.join(__dirname, 'fixtures', 'cad', 'one_product_three_bodies.step');
function load(src) { const m = { exports: {} }; new Function('module', 'exports', 'globalThis', 'window', src)(m, m.exports, {}, undefined); return m.exports; }
async function scenario(src, occt) {
    const S = load(src || SRC), u8 = new Uint8Array(fs.readFileSync(FIX)), ix = S.index(u8), st = S.structure(ix), leaves = []; S.occurrences(st, o => leaves.push(o.leaf));
    let B = null; for (const pd of leaves) { const b = S.bodies(ix, st, pd); if (b) { B = b; break; } }
    const R = { B, files: B ? B.bodies.map((_, k) => new TextDecoder('latin1').decode(S.extractBody(ix, B, k))) : [] };
    R.dangling = R.files.map(t0 => { const t = t0.slice(t0.indexOf('DATA;')).replace(/'[^']*'/g, "''"); const d = new Set([...t.matchAll(/^#(\d+)=/gm)].map(m => m[1])); return [...t.matchAll(/#(\d+)/g)].map(m => m[1]).filter(x => !d.has(x)).length; });
    R.bodyCount = R.files.map(t => (t.match(/MANIFOLD_SOLID_BREP/g) || []).length);
    if (occt) R.tris = R.files.map(t => { const m = new TextEncoder().encode(t), p = occt._malloc(m.length); occt.HEAPU8.set(m, p); const lp = occt._malloc(4), out = occt._sl_read(p, m.length, 0.001, 0.5, lp), len = occt.HEAP32[lp >> 2]; occt._free(p); occt._free(lp); if (!out || !len) return 0; const buf = occt.HEAPU8.slice(out, out + len).buffer, jl = new DataView(buf).getUint32(0, true), meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, jl))); occt._sl_free(out); return meta.protos.reduce((a, q) => a + q.t, 0); });
    return R;
}
(async () => {
    const M = await require(path.join(SITE, 'vendor', 'occt-fast', 'slcad_occt.js'))({ print: () => {}, printErr: () => {} });
    const R = await scenario(null, M);
    check('bodies: the representation listing three solids is found', R.B && R.B.bodies.length === 3, R.B && JSON.stringify(R.B.bodies));
    check('each body file holds exactly one solid and no dangling reference', R.files.length === 3 && R.bodyCount.every(n => n === 1) && R.dangling.every(n => n === 0), JSON.stringify({ c: R.bodyCount, d: R.dangling }));
    check('each body file has the product, its shape and the representation context', R.files.every(t => /PRODUCT\(/.test(t) && /PRODUCT_DEFINITION_SHAPE/.test(t) && /SHAPE_DEFINITION_REPRESENTATION/.test(t) && /GEOMETRIC_REPRESENTATION_CONTEXT/.test(t)));
    check('OpenCascade (our build) reads and meshes every body file on its own', R.tris.every(n => n > 0), JSON.stringify(R.tris));
    const mut = async (name, from, to, test) => { if (SRC.indexOf(from) < 0) { check('anchor present: ' + name, false); return; } let red = false; try { red = !test(await scenario(SRC.replace(from, to), M)); } catch (e) { red = true; } check('mutation goes red: ' + name, red); };
    // 15 Oct 2026: the slicer now writes each body file straight into one buffer (add per id); same mutation, new anchor
    await mut('every body written into each file', "B.base.forEach(add); B.desc[k].forEach(add);", "B.base.forEach(add); [].concat.apply([], B.desc).forEach(add);", r => r.bodyCount.every(n => n === 1));
    console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
