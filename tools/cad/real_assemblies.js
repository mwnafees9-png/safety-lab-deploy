#!/usr/bin/env node
/*
 * Real STEP assemblies, checked end to end (17 Oct 2026, job 2). Not in the wall: 420 MB, downloaded once.
 *
 *   node tools/cad/real_assemblies.js [cache folder]        (default ~/dev/cad-test-files)
 *
 * The files: two Voron printer assemblies exported from Fusion 360, GPL-3.0 (github.com/VoronDesign), pinned by
 * sha256. Kept OUT of the repository: their license travels with them in the download, and they are large.
 *   Voron 0.2:  2,456 placements, 1,670 placed parts, 8 levels deep, 180 MB
 *   Voron 2.4:  1,551 placements, 1,295 placed parts, 8 levels deep, 240 MB
 * For each file, with the site's own code (cad_step_struct.js, cad_import.js, cad_brep.js, our OpenCascade build):
 *   1  the assembly structure read, and its time
 *   2  the part list (the worker's path: SLCadStep.boxRes + SLCadImport.walkParts) against an independent reading
 *      of the file written here from the STEP text alone: every placed part, under every assembly above it, once
 *   3  every distinct part holds only its own solids (as OpenCascade reads that part's own file)
 *   4  every first-view box (an estimate until the shape is read) is the right size: none a metre off, none cut short
 * Prints a report and exits 1 on any failure. Open times in the browser are recorded in
 * docs/CAD_REAL_ASSEMBLIES.md (measured with the same code in Sys Lab's copy).
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), cp = require('child_process');
const SITE = path.join(__dirname, '..', '..', 'site');
const CACHE = process.argv[2] || path.join(os.homedir(), 'dev', 'cad-test-files');
const FILES = [
    { key: 'voron02', url: 'https://raw.githubusercontent.com/VoronDesign/Voron-0/Voron0.2r1/CAD/V0.2R1_Master_Assembly_STEP.zip', zipSha: 'a1cf81917dbeb55c13b23a490763297f85e4aeef5c0f2c45274a4969b5103b25', placed: 1670, license: 'GPL-3.0, VoronDesign/Voron-0' },
    { key: 'voron24', url: 'https://raw.githubusercontent.com/VoronDesign/Voron-2/Voron2.4/CAD/Voron_2.4r2_Assembly_STEP.zip', zipSha: '36c6c58e096aa89aa05a0ef22f3b49cbceedc950424332772461ab0c779cc1c6', placed: 1295, license: 'GPL-3.0, VoronDesign/Voron-2' }
];
let fails = 0;
const ok = (n, c, d) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || !d ? '' : '  -- ' + d)); };
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function fetchFile(F) {
    const dir = path.join(CACHE, F.key); fs.mkdirSync(dir, { recursive: true });
    const zip = path.join(dir, path.basename(F.url));
    if (!fs.existsSync(zip)) { console.log('downloading ' + F.url); cp.execFileSync('curl', ['-sSL', '-o', zip, F.url]); }
    if (sha(zip) !== F.zipSha) throw new Error(F.key + ': the download does not match its pinned fingerprint');
    let step = fs.readdirSync(dir).find(f => /\.ste?p$/i.test(f));
    if (!step) { cp.execFileSync('unzip', ['-o', '-q', zip, '-d', dir]); step = fs.readdirSync(dir).find(f => /\.ste?p$/i.test(f)); }
    return path.join(dir, step);
}
// the independent reading: products, definitions and NAUO links from the text, every placed leaf with its path
function independent(u8) {
    const t = Buffer.from(u8).toString('latin1'), S = "'((?:[^']|'')*)'", un = s => s.replace(/''/g, "'");
    const dec = s => un(s).replace(/[\r\n]/g, '').replace(/\\X2\\([0-9A-F]+)\\X0\\/g, (_, h) => h.match(/.{4}/g).map(c => String.fromCharCode(parseInt(c, 16))).join('')).replace(/\\X\\([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).trim();
    const prod = {}, pdf = {}, pd = {}, kids = {}, child = new Set();
    for (const m of t.matchAll(new RegExp('#(\\d+)\\s*=\\s*PRODUCT\\s*\\(\\s*' + S + '\\s*,\\s*' + S, 'g'))) prod[m[1]] = dec(m[3]);
    for (const m of t.matchAll(/#(\d+)\s*=\s*PRODUCT_DEFINITION_FORMATION(?:_WITH_SPECIFIED_SOURCE)?\s*\(\s*(?:'(?:[^']|'')*'|\$)\s*,\s*(?:'(?:[^']|'')*'|\$)\s*,\s*#(\d+)/g)) pdf[m[1]] = m[2];
    for (const m of t.matchAll(/#(\d+)\s*=\s*PRODUCT_DEFINITION\s*\(\s*(?:'(?:[^']|'')*'|\$)\s*,\s*(?:'(?:[^']|'')*'|\$)\s*,\s*#(\d+)/g)) pd[m[1]] = prod[pdf[m[2]]];
    for (const m of t.matchAll(new RegExp('#(\\d+)\\s*=\\s*NEXT_ASSEMBLY_USAGE_OCCURRENCE\\s*\\(\\s*' + S + '\\s*,\\s*' + S + "\\s*,\\s*(?:'(?:[^']|'')*'|\\$)\\s*,\\s*#(\\d+)\\s*,\\s*#(\\d+)", 'g'))) { (kids[m[4]] = kids[m[4]] || []).push(m[5]); child.add(m[5]); }
    Object.keys(kids).forEach(k => kids[k].sort((a, b) => a - b));
    const out = [];
    Object.keys(pd).filter(k => !child.has(k) && kids[k]).forEach(r => (function walk(k, trail) { if (!kids[k]) { out.push(trail.concat(['::', pd[k]]).join(' > ')); return; } kids[k].forEach(c => walk(c, trail.concat([pd[k]]))); })(r, []));
    return out;
}
(async () => {
    global.self = global;
    const S = require(path.join(SITE, 'cad_step_struct.js')); global.SLCadStep = S;
    require(path.join(SITE, 'cad_import.js')); require(path.join(SITE, 'cad_brep.js'));
    const I = global.SLCadImport;
    const FM = await require(path.join(SITE, 'vendor', 'occt-fast', 'slcad_occt.js'))({ print: () => {}, printErr: () => {} });
    const read = (u8) => {
        const p = FM._malloc(u8.length); FM.HEAPU8.set(u8, p); const lp = FM._malloc(4), o = FM._sl_read(p, u8.length, 0.001, 0.5, lp), len = FM.HEAP32[lp >> 2]; FM._free(p); FM._free(lp);
        if (!o || !len) return null;
        const buf = FM.HEAPU8.slice(o, o + len).buffer; FM._sl_free(o);
        const jl = new DataView(buf).getUint32(0, true), meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, jl)));
        let q = 4 + jl; q += (4 - q % 4) % 4; const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
        meta.protos.forEach(r => { const pos = new Float32Array(buf, q, r.v * 3); q += r.v * 12 + r.t * 12 + r.f * 8; for (let i = 0; i < pos.length; i += 3) for (let j = 0; j < 3; j++) { mn[j] = Math.min(mn[j], pos[i + j]); mx[j] = Math.max(mx[j], pos[i + j]); } });
        return { solids: meta.meshes.length, min: mn, max: mx };
    };
    for (const F of FILES) {
        console.log('\n[' + F.key + '] ' + F.license);
        const file = fetchFile(F), u8 = new Uint8Array(fs.readFileSync(file));
        let t = Date.now(); const ix = S.index(u8), st = S.structure(ix), res = S.boxRes(ix, st); const ms = Date.now() - t;
        ok('1 structure read in ' + ms + ' ms (' + (u8.length / 1e6).toFixed(0) + ' MB, ' + st.components + ' placements)', !st.unsupported && ms < 30000, st.unsupported);
        const model = I.buildModel(res, { maxTrianglesTotal: 0 }), mine = [];
        res.meshes.forEach((m, i) => { if (m.solid === 0) mine.push((m.bodies > 1 ? model.parts[i].path.slice(0, -1) : model.parts[i].path).concat(['::', String(m.product).trim()]).join(' > ')); });
        const ref = independent(u8), a = mine.slice().sort(), b = ref.slice().sort();
        ok('2 every placed part under every assembly above it, as the file says (' + mine.length + ' placed, deepest ' + Math.max(...model.parts.map(p => p.path.length)) + ' levels)', a.length === F.placed && JSON.stringify(a) === JSON.stringify(b), a.length + ' vs ' + b.length);
        // 4: the first view's boxes are estimates (the zonal engine takes no answer from them: SLCadZonal.estimatedParts);
        // they must still be of the right size: none metres off (the bug of 16 Oct 2026), none cut short by a tenth
        let solidsBad = 0, holdBad = 0, bloat = 0, worst = 0, cutWorst = 0; t = Date.now();
        res.leaves.forEach(L => {
            const tb = read(S.extract(ix, st, L.pd)), bx = L.info.box;
            if (!tb || (L.info.solids.length && tb.solids !== L.info.solids.length)) { solidsBad++; return; }
            if (!bx || !isFinite(tb.min[0])) return;
            for (let j = 0; j < 3; j++) {
                const size = tb.max[j] - tb.min[j], cut = Math.max(0, bx.min[j] - tb.min[j]) + Math.max(0, tb.max[j] - bx.max[j]), d = (bx.max[j] - bx.min[j]) - size;
                cutWorst = Math.max(cutWorst, size > 0 ? cut / size : 0); worst = Math.max(worst, d);
                if (cut > 1e-3 + 0.1 * size) holdBad++;
                if (d > 1000) bloat++;
            }
        });
        ok('3 every distinct part (' + res.leaves.length + ') holds only its own solids', solidsBad === 0, solidsBad + ' differ');
        ok('4 every first-view box is the right size: none a metre too big (largest excess ' + worst.toFixed(1) + ' mm), none cut short by a tenth (worst ' + (cutWorst * 100).toFixed(1) + '%); read in ' + Math.round((Date.now() - t) / 1000) + ' s', holdBad === 0 && bloat === 0, holdBad + ' cut short, ' + bloat + ' a metre too big');
    }
    console.log('\n' + (fails ? fails + ' failed' : 'all passed'));
    process.exit(fails ? 1 : 0);
})().catch(e => { console.log('  FAIL  crashed: ' + (e && e.stack || e)); process.exit(1); });
