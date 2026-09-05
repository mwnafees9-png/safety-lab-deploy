/*
 * regression_spec_targeting.test.js — deterministic per-lane doc context
 * (30 Aug 2026, Waqas: "maybe a more targeted specs is the way to go").
 *
 * The rules this suite exists to hold:
 *  - CONSERVATIVE: only positively-classified chapters are dropped (today:
 *    zonal/routing chapters for the hazard/function lanes). Unclassified
 *    content, zonal lanes, and unparseable documents always get the WHOLE
 *    text — the 26 Aug no-silent-starvation ruling.
 *  - DECLARED: a targeted context says exactly what was included and omitted
 *    in the note line the model sees, and invites "say so rather than guess"
 *    if the omitted chapters seem needed.
 *  - FAIL-SAFE: a selection that would hollow the document (<40% kept, or
 *    nothing actually omitted) reverts to the full text.
 *  - A chapter carrying coded system sections is SYSTEMS even when its title
 *    says zonal (the real SDD's ch.6 "Zonal Model & System Schematics") — the
 *    coded classification wins, so system content is never zonal-dropped.
 *
 * Mutations proven red at build time: policy drops an unclassified chapter;
 * fail-safe floor removed; note line dropped; zonal lane starts targeting;
 * decompose seam loses the fallback; TEXT: marker broken (dedup probe).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SITE = path.join(__dirname, '..', 'site');
const specSrc = fs.readFileSync(path.join(SITE, 'spec_index.js'), 'utf8');
const aiSrc = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const loaderSrc = fs.readFileSync(path.join(SITE, 'ai_loader.js'), 'utf8');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('  ok   ' + name);
  else { failures++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

/* ------------------------------------------------------------------ */
console.log('1. the index + policy (executed on an SDD-shaped fixture)');

const sb = { window: {}, console, Array, Object, String, Number, RegExp };
vm.createContext(sb);
vm.runInContext(specSrc, sb);
const S = sb.window.SLABSpecIndex;
check('SLABSpecIndex attached with build/select', S && typeof S.build === 'function' && typeof S.select === 'function');

// fixture shaped like the real extracted SDD: preamble, six chapters, coded
// sections in ch.5 AND in the zonal-titled ch.6 (the class-collision case),
// run-on single-spaced lines
const FIX = [
  'AEO-SDD-0001 Aeolus HL-1 preamble text. ',
  '1 Aircraft Overview  Mission and operating concept prose. ',
  '2 System Architecture Overview  2.1 System Inventory list. 2.2 Interface Matrix rows. ',
  '3 Zonal Breakdown  zones Z-10 through Z-90 described here. ',
  '4 Zone-Spanning Routings  routing RTG-001 details. ',
  '5 System Design Descriptions  5.1 Propulsion (PRP) four turbofans. 5.2 Fuel System (FUE) tanks. 5.3 Braking (LDG) antiskid. ',
  '6 Zonal Model & System Schematics  6.1 Propulsion (PRP) schematic. 6.2 Fuel System (FUE) schematic. 6.3 Braking (LDG) schematic. ',
].join('');

sb.__fix = FIX;
const idx = vm.runInContext('window.SLABSpecIndex.build(__fix)', sb);
check('six chapters parsed with ranges', idx.chapters.length === 6 && idx.hasStructure === true);
const classes = {};
idx.chapters.forEach(c => { classes[c.num] = c.cls; });
check('classes: 1 overview, 3+4 zonal, 5 systems', classes[1] === 'overview' && classes[3] === 'zonal' && classes[4] === 'zonal' && classes[5] === 'systems', JSON.stringify(classes));
check('CODED WINS: zonal-titled ch.6 with coded sections classifies as systems (never droppable)',
  classes[6] === 'systems', classes[6]);

const fha = vm.runInContext('window.SLABSpecIndex.select(__fix, "fha.draft")', sb);
check('fha: targeted, zonal chapters 3+4 omitted', fha.targeted === true && fha.omitted.length === 2 && /Zonal Breakdown/.test(fha.omitted[0]));
check('fha: systems + overview + coded-ch.6 all kept', /Propulsion \(PRP\) four turbofans/.test(fha.text) && /schematic/.test(fha.text) && /Mission and operating/.test(fha.text));
check('fha: zonal text actually gone', !/zones Z-10/.test(fha.text) && !/RTG-001/.test(fha.text));
check('fha: preamble kept', /AEO-SDD-0001/.test(fha.text));
check('the note DECLARES included and omitted and invites say-so-not-guess',
  /included/.test(fha.note) && /Omitted/.test(fha.note) && /say so rather than guessing/.test(fha.note));
check('decompose and fcim get the same policy',
  vm.runInContext('window.SLABSpecIndex.select(__fix, "arch.decompose").targeted', sb) === true &&
  vm.runInContext('window.SLABSpecIndex.select(__fix, "fcim.populate").targeted', sb) === true);
check('zonal lane (zsa.draft) is UNTOUCHED — full text',
  vm.runInContext('window.SLABSpecIndex.select(__fix, "zsa.draft")', sb).targeted === false);
check('unknown feature -> full text', vm.runInContext('window.SLABSpecIndex.select(__fix, "doc.review")', sb).targeted === false);
check('unparseable document -> full text', vm.runInContext('window.SLABSpecIndex.select("prose with no numbered chapters at all", "fha.draft")', sb).targeted === false);

// fail-safe floor: a doc that is MOSTLY zonal must go whole rather than hollow
const MOSTLY_ZONAL = '1 Overview  x. 2 Zonal Breakdown  ' + 'zone detail '.repeat(400) + ' 3 Routings  ' + 'routing detail '.repeat(400) + ' 4 Notes  y.';
sb.__mz = MOSTLY_ZONAL;
check('fail-safe: selection that keeps <40% reverts to the whole document',
  vm.runInContext('window.SLABSpecIndex.select(__mz, "fha.draft")', sb).targeted === false);

check('determinism: same input, same output, twice',
  vm.runInContext('JSON.stringify(window.SLABSpecIndex.select(__fix, "fha.draft")) === JSON.stringify(window.SLABSpecIndex.select(__fix, "fha.draft"))', sb) === true);

/* ------------------------------------------------------------------ */
console.log('1b. TOC-bearing documents (the v1.0 live-probe defect, 30 Aug)');

// The first live probe showed v1.0 anchoring chapters at their TABLE-OF-
// CONTENTS lines: the "selection" dropped 310 chars of TOC and kept both
// zonal chapters whole. This fixture reproduces every trap the real document
// held: a date on the title page ("25 August 2026" is not chapter 25), a
// Contents block with dot leaders, body headings with exactly one space,
// a table row whose column whitespace mimics a heading, and an appendix
// back-reference that restarts numbering.
const TOCFIX = [
  'AEO-SDD-0001 Aeolus HL-1 Issue 1  25 August 2026  FICTIONAL AIRCRAFT. ',
  'Contents  1 Aircraft Overview ................ 4  2 Architecture Overview ............ 5  ',
  '3 Zonal Breakdown ................ 6  4 Routings ................ 7  5 System Design Descriptions ................ 8  5.1 Propulsion (PRP) ................ 9  ',
  '1 Aircraft Overview  Mission and operating concept prose, several sentences of it to give the chapter body real length. ',
  '2 Architecture Overview  2.1 System Inventory list. 2.2 Interface Matrix rows and rows of it. ',
  '3 Zonal Breakdown  zones Z-10 through Z-90 described here at length with equipment lists per zone. ',
  'Zone table: 620\u2013640   Engine nacelles 1\u20134   Engine, FADEC, generator loops.  ',
  '4 Routings  routing RTG-001 details drawn on the zonal model with transit lists. ',
  '5 System Design Descriptions  5.1 Propulsion (PRP) four turbofans. 5.2 Fuel System (FUE) tanks. 5.3 Braking (LDG) antiskid. ',
  'Appendix note: see 1 Aircraft Overview for the concept summary. ',
].join('');
sb.__toc = TOCFIX;
const tidx = vm.runInContext('window.SLABSpecIndex.build(__toc)', sb);
check('TOC fixture: five chapters, anchored at BODY headings (past the Contents block)',
  tidx.chapters.length === 5 && tidx.chapters[0].at > TOCFIX.indexOf('Contents'),
  JSON.stringify(tidx.chapters.map(c => c.num + '@' + c.at)));
check('no chapter 25 (a date is not a chapter)', !tidx.chapters.some(c => c.num === 25));
check('chapter ranges have real body length (not TOC-line slivers)',
  tidx.chapters.every(c => (c.end - c.start) > 60),
  JSON.stringify(tidx.chapters.map(c => c.end - c.start)));
check('the appendix back-reference to chapter 1 does not scramble the ranges (monotonic guard)',
  tidx.chapters[tidx.chapters.length - 1].num === 5 && tidx.chapters[0].num === 1);
const tfha = vm.runInContext('window.SLABSpecIndex.select(__toc, "fha.draft")', sb);
check('TOC fixture: fha targeting now drops the REAL zonal bodies',
  tfha.targeted === true && !/zones Z-10 through Z-90 described here at length/.test(tfha.text) &&
  !/RTG-001 details drawn/.test(tfha.text));
check('TOC fixture: systems + overview bodies kept, preamble (title page + Contents) kept',
  /Propulsion \(PRP\) four turbofans/.test(tfha.text) && /Mission and operating concept prose/.test(tfha.text) &&
  /FICTIONAL AIRCRAFT/.test(tfha.text));
check('TOC fixture: the omission is a MEANINGFUL slice of the document (>2% — the v1.0 no-op is dead)',
  (1 - tfha.text.length / TOCFIX.length) > 0.02,
  'kept ' + tfha.text.length + ' of ' + TOCFIX.length);

// dedicated single-trap fixtures — the mega-fixture masked these two by
// coincidence (the date sat within 120 chars of the TOC's dot leaders, and
// first-occurrence dedup swallowed the back-reference before the guard ran)
const MONTHFIX = 'Issue date 25 August 2026 stands alone on the title page. ' + 'plain filler text with no dot leaders anywhere near it '.repeat(4) +
  '1 Alpha Overview  body text one. 2 Beta Systems  body text two. 3 Gamma Design  body text three.';
sb.__mf = MONTHFIX;
const midx = vm.runInContext('window.SLABSpecIndex.build(__mf)', sb);
check('a bare date far from any TOC is still not a chapter (month filter, isolated)',
  midx.chapters.length === 3 && !midx.chapters.some(c => c.num === 25),
  JSON.stringify(midx.chapters.map(c => c.num)));

const MONOFIX = '2 Alpha Systems  body text alpha. 3 Beta Design  body text beta. 4 Gamma Zones  body text gamma. ' +
  '1 Stray Reference  a late lower-numbered heading-shaped line.';
sb.__mono = MONOFIX;
const monoIdx = vm.runInContext('window.SLABSpecIndex.build(__mono)', sb);
check('a late LOWER-numbered heading never enters the chain (monotonic guard, isolated)',
  monoIdx.chapters.map(c => c.num).join(',') === '2,3,4' &&
  monoIdx.chapters[monoIdx.chapters.length - 1].end === MONOFIX.length,
  JSON.stringify(monoIdx.chapters.map(c => c.num)));

/* ------------------------------------------------------------------ */
console.log('1c. per-system narrowing (v1.2) + per-lane policy census incl. FTA/PRA/ZSA');

// narrowing: the scope cites 5.3 (LDG). Its CODE pulls the mirror section in
// every systems chapter (5.3 brings 6.3); other systems' sections drop.
{
  const n = vm.runInContext('window.SLABSpecIndex.select(__fix, "fha.draft", ["5.3"])', sb);
  check('narrowed selection keeps the cited system in BOTH systems chapters',
    n.targeted === true && n.narrowed === true &&
    /Braking \(LDG\) antiskid/.test(n.text) && /Braking \(LDG\) schematic/.test(n.text),
    n.note);
  check('other systems\' sections are gone (deep cut is the REQUESTED behavior, floor exempt)',
    !/Propulsion \(PRP\) four turbofans/.test(n.text) && !/Fuel System \(FUE\) tanks/.test(n.text) &&
    !/Propulsion \(PRP\) schematic/.test(n.text));
  check('overview chapter and preamble still whole', /Mission and operating/.test(n.text) && /AEO-SDD-0001/.test(n.text));
  check('the note names the narrowing and the omission count',
    /NARROWED/.test(n.note) && /LDG/.test(n.note) && /other system section\(s\) omitted/.test(n.note));
  const multi = vm.runInContext('window.SLABSpecIndex.select(__fix, "fha.draft", ["5.1", "5.3"])', sb);
  check('multiple cited systems all kept', /Propulsion \(PRP\) four turbofans/.test(multi.text) && /Braking \(LDG\) antiskid/.test(multi.text) && !/Fuel System \(FUE\) tanks/.test(multi.text));
  const un = vm.runInContext('window.SLABSpecIndex.select(__fix, "fha.draft", ["9.9"])', sb);
  check('unresolvable citations -> narrowing silently off, chapter-level only (fail-safe)',
    un.narrowed !== true && /Propulsion \(PRP\) four turbofans/.test(un.text));
  const none = vm.runInContext('window.SLABSpecIndex.select(__fix, "fha.draft", null)', sb);
  check('null secs -> identical to the two-arg call', none.narrowed !== true && none.targeted === true);
  check('TOC section listings never become narrowing anchors (in-range filter)',
    vm.runInContext('window.SLABSpecIndex.build(__toc).chapters.every(c => (c.sections || []).every(x => x.at >= c.start && x.at < c.end))', sb) === true);
}

// per-lane policy census — Waqas 30 Aug: "we also need to test on fault
// trees, PRAs, ZSAs". Every lane's selection posture is pinned HERE so a
// policy change is a deliberate suite edit, never a drive-by.
{
  const posture = f => vm.runInContext('window.SLABSpecIndex.select(__fix, ' + JSON.stringify(f) + ').targeted', sb);
  check('zsa.draft: FULL document (zonal chapters are its grounding)', posture('zsa.draft') === false);
  check('pra.draft: FULL document (particular risks need zones + routings)', posture('pra.draft') === false);
  check('cma.draft: FULL document (common modes cross every boundary)', posture('cma.draft') === false);
  check('fta.synthesize: FULL document until its own eval says otherwise', posture('fta.synthesize') === false);
  check('hazard/function lanes target: decompose, fcim, fha, sfha, req',
    ['arch.decompose', 'fcim.populate', 'fha.populate', 'sfha.populate', 'req.recommend'].every(f => posture(f) === true));
}

/* ------------------------------------------------------------------ */
console.log('2. the seams in ai_assistant (wiring + fallback)');

check('_projectDocContext consults SLABSpecIndex per feature (v1.2: with the scope secs)',
  /window\.SLABSpecIndex && txt\) _sel = window\.SLABSpecIndex\.select\(txt, feature, \(opts && opts\.specSecs\) \|\| null\);/.test(aiSrc));
check("the 'TEXT:' marker survives targeting (the decompose dedup probe keys on it)",
  /parts\.push\(_sel\.note \+ '\\nTEXT:\\n' \+ _sel\.text\);/.test(aiSrc));
check('untargeted path unchanged', /else if \(txt\) parts\.push\('TEXT:\\n' \+ txt\);/.test(aiSrc));
check('_specSecsForSubIds extracts cited prefixes from the selected rows',
  /function _specSecsForSubIds\(subIds\)/.test(aiSrc) && /const re = \/\\u00a7\\s\?\(\\d\{1,2\}\\\.\\d\{1,2\}\)\/g;/.test(aiSrc));
check('FHA + FCIM scope pickers pass specSecs into the batch cfg',
  (aiSrc.match(/specSecs: _specSecsForSubIds\(picked\.map\(/g) || []).length === 3);   // FCIM + FHA-conditions + FHA-functions-fallback
check('_projectDocContext forwards opts.specSecs to the registry',
  /window\.SLABSpecIndex\.select\(txt, feature, \(opts && opts\.specSecs\) \|\| null\)/.test(aiSrc));
check('decompose seam targets via the registry with the full-text fallback inline',
  /window\.SLABSpecIndex\.select\(String\(input\.text\), 'arch\.decompose'\)/.test(aiSrc) &&
  /return 'ARCHITECTURE \/ SOURCE MATERIAL:\\n' \+ String\(input\.text\);/.test(aiSrc));

// executed: _projectDocContext with a fake registry (targeted) and with none
function extractFn(src, name) {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) return null;
  const open = src.indexOf('{', at);
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (!d) return src.slice(at, i + 1); }
  }
  return null;
}
const pdcFn = extractFn(aiSrc, '_projectDocContext');
check('_projectDocContext extracted', !!pdcFn);
if (pdcFn) {
  function pdcSandbox(registry) {
    const sbx = {
      console: { info: function () {} }, Array, String, JSON, Object,
      snapshot: function () { return { projectSourceDocs: [{ name: 'SDD.pdf', text: 'DOCTEXT-FULL with plenty of characters to pass trims' }] }; },
      window: registry ? { SLABSpecIndex: registry } : {},
    };
    vm.createContext(sbx);
    vm.runInContext(pdcFn + ';globalThis.__p = _projectDocContext;', sbx);
    return vm.runInContext('__p("fha.populate", {})', sbx);
  }
  const targeted = pdcSandbox({ select: function (txt, feature) {
    return { targeted: true, text: 'DOCTEXT-SELECTED', note: 'TARGETED EXTRACT (test): included A. Omitted B.', kept: ['A'], omitted: ['B'] };
  } });
  check('EXECUTED: targeted selection lands with its note, marker intact',
    /TARGETED EXTRACT \(test\)/.test(targeted) && /TEXT:\nDOCTEXT-SELECTED/.test(targeted) && !/DOCTEXT-FULL/.test(targeted));
  const bare = pdcSandbox(null);
  check('EXECUTED: registry absent -> full text, byte-for-byte the old shape',
    /TEXT:\nDOCTEXT-FULL/.test(bare));
  const throwing = pdcSandbox({ select: function () { throw new Error('boom'); } });
  check('EXECUTED: a throwing registry falls back to the full text',
    /TEXT:\nDOCTEXT-FULL/.test(throwing));
}

/* ------------------------------------------------------------------ */
console.log('3. pins (floors) + load order');
function pin(src, re) { const m = src.match(re); return m ? parseFloat(m[1]) : -1; }
check('spec_index pin floor >= 1.2 (per-system narrowing)', pin(indexSrc, /spec_index\.js\?v=([\d.]+)/) >= 1.2);
check('spec_index loads BEFORE ai_loader',
  indexSrc.indexOf('spec_index.js?v=') > 0 && indexSrc.indexOf('spec_index.js?v=') < indexSrc.indexOf('ai_loader.js?v='));
check('ai_loader pin floor >= 6.9', pin(indexSrc, /ai_loader\.js\?v=([\d.]+)/) >= 6.9);
check('ai_assistant pin floor >= 74.7 (inside ai_loader)', pin(loaderSrc, /ai_assistant\.js\?v=([\d.]+)/) >= 74.7);

console.log(failures ? ('FAILED — ' + failures + ' check(s)') : 'ALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
