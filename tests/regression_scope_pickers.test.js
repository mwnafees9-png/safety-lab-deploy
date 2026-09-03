#!/usr/bin/env node
/*
 * Regression — every drafting lane asks the ENGINEER what to cover.
 * (26 Aug 2026 evening, Waqas, three messages in a row:
 *   · "offer them the same scope of analysis option for FCIM for how many
 *      functions you want us to decompose the failure conditions and the FHA"
 *   · "for which failure conditions you wanna perform the FHA"
 *   · "same for PRA, ZSA CMA, which zone they wanna evaluate, which PRA they
 *      wanna perform and so on")
 *
 * The contract, shared with the synthesis FC picker (regression_synth_fc_choice):
 * every unit listed with a checkbox, ALL pre-checked — do-them-all is the
 * default, narrowing is the deliberate act — then the chosen units become the
 * chunk list, so coverage is asserted against exactly what the engineer chose.
 *
 * Per-lane units, each from the model, never invented:
 *   FHA  → the FCIM's extracted failure conditions (FCIM feeds the FHA — his
 *          ordering ruling); falls back to functions when no FCIM exists.
 *   FCIM → the aircraft functions.
 *   PRA  → the APPLICABLE risks from the deterministic applicability engine.
 *   ZSA  → zones known to the model (items, routings, existing ZSA rows).
 *   CMA  → the fault trees' AND gates (an AND gate IS an independence claim).
 * A lane whose unit list is empty runs exactly as before — a picker over
 * nothing would be a dead end.
 *
 * ALSO PINNED HERE: the fifth reachability compensation. The zonal context —
 * zones, routings, and the particular-risk applicability list — sat behind the
 * same _ANALYSIS_FEATURES gate as the specs, documents and assumptions
 * contract, and the live capture probe showed it absent from the primary
 * path's prompt. Without it, the ZSA picker's zone scoping would be inert.
 *
 * Run: node tests/regression_scope_pickers.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
const loader = fs.readFileSync(path.join(SITE, 'ai_loader.js'), 'utf8');

function block(src, startMarker) {
  const i = src.indexOf(startMarker);
  if (i < 0) return null;
  let j = src.indexOf('{', i), depth = 0, inS = null, esc = false, line = false, blk = false;
  for (let k = j; k < src.length; k++) {
    const c = src[k], n = src[k + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (blk) { if (c === '*' && n === '/') { blk = false; k++; } continue; }
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (inS) { if (c === inS) inS = null; continue; }
    if (c === '/' && n === '/') { line = true; k++; continue; }
    if (c === '/' && n === '*') { blk = true; k++; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  return null;
}

console.log('\n[generic] the shared scope picker, executed');
const pickSrc = block(ai, 'function _openScopePicker(');
check('the picker is extractable', !!pickSrc);
if (pickSrc) {
  const run = (units, cfg, drive) => {
    const els = [];
    const mkEl = () => {
      const e = { id: '', className: '', innerHTML: '', style: {}, textContent: '', disabled: false,
        onclick: null, _attrs: {}, checked: false,
        getAttribute(k) { return this._attrs[k]; }, setAttribute(k, v) { this._attrs[k] = v; },
        addEventListener() {}, appendChild() {}, remove() { e._removed = true; } };
      return e;
    };
    const root = mkEl();
    let checkboxes = null;
    const ensureBoxes = () => {
      if (checkboxes) return checkboxes;
      const inputs = root.innerHTML.match(/<input type="checkbox" class="scope-unit"[^>]*>/g) || [];
      checkboxes = inputs.map((tag, i) => {
        const b = mkEl(); b.checked = /\schecked>/.test(tag);
        b.setAttribute('data-i', String((tag.match(/data-i="(\d+)"/) || [])[1] || i)); return b;
      });
      return checkboxes;
    };
    root.querySelector = sel => { const e = mkEl(); e._sel = sel; els.push(e); return e; };
    root.querySelectorAll = sel => /scope-unit/.test(sel) ? ensureBoxes() : [];
    const doc = { getElementById: () => null, createElement: () => root, body: { appendChild() {} } };
    let picked = null;
    // 4 Sep 2026 — the picker now consults THE CAPTURE SEAM before rendering. The
    // sandbox supplies a DISARMED capture, so this whole suite is also the proof
    // that the bypass is inert in normal use: every check below drives real markup.
    const fn = new Function('document', '_ensurePanelStyles', '_applyPanelPalette', '_esc', '_capture', 'console',
      pickSrc + '\nreturn _openScopePicker;')(
      doc, () => {}, () => {},
      s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
      { armed: false }, { info() {} });
    fn(units, cfg, p => { picked = p; });
    const go = els.find(e => e._sel === '#scope-pick-go');
    if (drive) drive({ boxes: ensureBoxes(), go });
    return { picked, root, boxes: ensureBoxes(), go };
  };
  const UNITS = [{ id: 'B', label: 'bee' }, { id: 'A', label: 'ay' }, { id: 'C', label: 'sea' }];
  const CFG = { title: 't', verb: 'Analyze', sort: (a, b) => a.id.localeCompare(b.id), row: u => [u.id, u.label] };

  const all = run(UNITS, CFG, ({ go }) => { go.onclick(); });
  check('every unit is listed, ALL pre-checked (from the rendered markup, not assumed)',
    all.boxes.length === 3 && all.boxes.every(b => b.checked));
  check('Go with no clicks returns everything — do-them-all is the default',
    Array.isArray(all.picked) && all.picked.length === 3);
  check('cfg.sort orders the list', all.picked.map(u => u.id).join('') === 'ABC');
  check('cfg.row drives the columns', all.root.innerHTML.indexOf('bee') >= 0);

  const some = run(UNITS, CFG, ({ boxes, go }) => { boxes[1].checked = false; go.onclick(); });
  check('narrowing returns exactly what stayed checked',
    some.picked.length === 2 && some.picked.map(u => u.id).join('') === 'AC');
  const none = run(UNITS, CFG, ({ boxes, go }) => { boxes.forEach(b => { b.checked = false; }); go.onclick(); });
  check('nothing selected → Go does not fire', none.picked === null);
  check('unit text is HTML-escaped',
    run([{ id: '<img src=x>', label: 'x' }], CFG).root.innerHTML.indexOf('&lt;img') >= 0);
}

console.log('\n[snapshot] EVERY snapshot() read resolves to a field snapshot() returns');
// 26 Aug 2026 (batch 47) — THE CHECK THAT SHOULD HAVE EXISTED FIRST.
// The FHA scope picker read `snapshot().acExtractedFCs`. snapshot() returns a
// FIXED object literal of fourteen keys and that was not one of them, so the
// read was undefined forever and the FHA lane silently drafted per FUNCTION on
// every project with a full FCIM. Measured live: bare acExtractedFCs = 114
// conditions, snapshot().acExtractedFCs = undefined.
//
// The suite passed over it because the old check pinned the SOURCE SHAPE of the
// broken line — it asserted the bug's own text. A shape pin can only ever prove
// the code still says what it said; it cannot notice that what it says is
// wrong. This check is the structural one instead: whatever snapshot() reads
// must be something snapshot() gives.
const snapBody = block(ai, 'function snapshot(');
check('snapshot() is extractable', !!snapBody);
const SNAP_KEYS = snapBody
  ? (snapBody.match(/^\s{12}([A-Za-z_][A-Za-z0-9_]*):\s/gm) || []).map(s => s.trim().replace(/:$/, '').replace(/:\s$/, '').trim())
  : [];
check('snapshot() exposes a recognisable set of project fields', SNAP_KEYS.length >= 14,
  'parsed ' + SNAP_KEYS.length + ' keys: ' + SNAP_KEYS.join(', '));
const READS = Array.from(new Set((ai.match(/snapshot\(\)\.[A-Za-z_][A-Za-z0-9_]*/g) || [])
  .map(s => s.split('.')[1])));
const ORPHANS = READS.filter(k => SNAP_KEYS.indexOf(k) < 0);
check('no snapshot() read is an orphan — every field read is a field returned',
  ORPHANS.length === 0,
  'orphaned read(s): ' + ORPHANS.join(', ') + ' — these silently evaluate to undefined');
check('acExtractedFCs specifically is now a returned field',
  SNAP_KEYS.indexOf('acExtractedFCs') >= 0,
  'this is the field the FHA scope picker has been reading since it shipped');

console.log('\n[snapshot] _extractedFCs(), executed — the derivation matches the core');
const exSrc = block(ai, 'function _extractedFCs(');
check('_extractedFCs is extractable', !!exSrc);
if (exSrc) {
  const runEx = (bare, fcim) => new Function('acExtractedFCs', 'acFcimData',
    exSrc + '\nreturn _extractedFCs();')(bare, fcim);
  const FCIM = [{
    subId: 'SF-001',
    tlId: 'SF-001-TL', tlDesc: 'total loss',
    plId: 'SF-001-PL', plDesc: 'partial loss', plExtra: [{ id: 'SF-001-PL2', desc: 'asymmetric' }],
    mId: 'SF-001-M', mDesc: 'malfunction',
    mExtra: [{ id: 'SF-001-M2', desc: 'low' }, { id: 'SF-001-M3', desc: 'uncommanded' }]
  }];
  check('the live array wins when it has entries',
    runEx([{ id: 'X-1', desc: 'd', subId: 'S' }], FCIM).map(e => e.id).join(',') === 'X-1');
  const derived = runEx([], FCIM);
  check('an EMPTY live array falls back to deriving from the FCIM, never to nothing',
    derived.length === 6,
    'got ' + derived.length + ' — a populated FCIM beside an unbuilt array must still scope the FHA');
  check('the derivation covers primary TL/PL/M ids AND every *Extra entry',
    derived.map(e => e.id).sort().join(',') ===
    'SF-001-M,SF-001-M2,SF-001-M3,SF-001-PL,SF-001-PL2,SF-001-TL',
    'this ordering-independent set is what the core\'s _pushExtractedFCs produces; ' +
    'verified live 26 Aug — 114 derived vs 114 bare, id sets identical');
  check('each condition carries its subId back to the owning sub-function',
    derived.every(e => e.subId === 'SF-001'));
  check('an id-less row is dropped rather than becoming a blank pick',
    runEx([{ desc: 'no id' }, { id: 'ok', desc: 'y' }], []).map(e => e.id).join(',') === 'ok');
  check('no FCIM and no array → empty, so the lane falls back to functions as designed',
    runEx([], []).length === 0);
  check('an undefined binding does not throw — the guard holds',
    (() => { try { return runEx(undefined, undefined).length === 0; } catch (_) { return false; } })());
}

console.log('\n[lanes] each lane asks, from its own unit list');
check('FHA: picker over the FCIM\'s extracted conditions (FCIM feeds the FHA)',
  /const _exArr = \(snapshot\(\)\.acExtractedFCs \|\| \[\]\)\.filter/.test(ai) &&
  /which failure conditions\?'/.test(ai));
check('FHA: the model must echo srcCondId, and coverage reads it',
  /"srcCondId": the id of the failure condition it classifies/.test(ai) &&
  /if \(a\.srcCondId\) return a\.srcCondId;/.test(ai));
check('FHA: text-match fallback when the echo is missing — never a false-complete',
  /_descMap\[String\(a\.fcDesc \|\| ''\)\.replace/.test(ai));
check('FHA: no FCIM yet → falls back to picking functions, still through the picker',
  /No FCIM on file yet, so the FHA drafts per function\./.test(ai));
check('FCIM: picker over the aircraft functions',
  /AI-drafted FCIM · which functions\?'/.test(ai));
check('PRA: picker over the APPLICABLE risks from the deterministic engine',
  /window\.applicableParticularRisks\) \? window\.applicableParticularRisks\(\)/.test(ai) &&
  /which risks\?'/.test(ai));
check('PRA: coverage tolerates the model\'s wording of a risk name',
  /t\.indexOf\(_keys\[i\]\) >= 0 \|\| _keys\[i\]\.indexOf\(t\) >= 0/.test(ai),
  '"Bird strike (§25.631)" must count as covering "Bird Strike"');
check('ZSA: zones enumerated from items + routings + existing ZSA rows',
  /which zones\?'/.test(ai) && /routesThroughZones/.test(ai) &&
  /zonal: \{ onlyZones: picked \}/.test(ai));
check('CMA: units are the fault trees\' AND gates — an AND gate IS an independence claim',
  /which independence claims\?'/.test(ai) &&
  /String\(n\.gateType\)\.toUpperCase\(\) === 'AND'/.test(ai));
check('CMA: coverage scans the whole action for the gate id',
  /const blob = JSON\.stringify\(a\);/.test(ai));
check('every lane with an EMPTY unit list runs exactly as before',
  /if \(!_appl\.length\) return _anemBatch\(_FEATURE_DIRECTIVE\.pra/.test(ai) &&
  /if \(!_zones\.length\) return _anemBatch\(_FEATURE_DIRECTIVE\.zsa/.test(ai) &&
  /if \(!_gates\.length\) return _anemBatch\(_FEATURE_DIRECTIVE\.cma/.test(ai),
  'a picker over nothing is a dead end, not a scope choice');

console.log('\n[reach] the zonal context reaches the primary path (fifth compensation)');
// F2, 31 Aug 2026 — superseded in place: the fifth compensation is RETIRED
// along with the fork itself. The zonal block now lives in
// _assembleAnalysisContext (gated on _ZONAL_FEATURES[feature]), and _anemBatch
// reaches it by calling the assembler with cfg.analysis and zonal: cfg.zonal.
// Same promise as 26 Aug: PRA applicability and zones reach the primary path.
check('the assembler builds the zonal block for the CCA features',
  /_ZONAL_FEATURES\[feature\] === 1\) \{/.test(ai) &&
  /_zonalContext\(feature, opts\)/.test(ai),
  'measured absent from the live prompt — PRA applicability and zones never reached the model');
check('…and _anemBatch hands its scoping through the ONE assembler call',
  /const _sysExtra = await _assembleAnalysisContext\(cfg\.analysis \|\| ''/.test(ai) &&
  /zonal: cfg\.zonal/.test(ai));
check('…so the ZSA picker\'s onlyZones scoping is real, not decorative',
  /zonal: \{ onlyZones: picked \}/.test(ai) && /zonal: cfg\.zonal/.test(ai));

console.log('\n[pickers] it actually loads');
check('loader cache pin bumped past the fix (ai_assistant.js >= 73.4)', (() => {
  const m = loader.match(/ai_assistant\.js\?v=([\d.]+)/);
  return m && parseFloat(m[1]) >= 73.4;
})());
// 26 Aug 2026 (batch 47) — THE PIN BEHIND THE PIN, and nothing was guarding it.
// ai_loader.js carries the ai_assistant.js version inside its own FILES list, so
// bumping that pin only reaches a browser once the browser re-fetches THE LOADER.
// index.html pins the loader separately, and no suite checked it. A returning
// user on a cached ai_loader.js?v=5.5 would keep pulling ai_assistant.js?v=73.3
// — the fix deployed, and invisible, with every test green.
check('index.html\'s own pin on the loader moved too (ai_loader.js >= 5.6)', (() => {
  const m = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8').match(/ai_loader\.js\?v=([\d.]+)/);
  return m && parseFloat(m[1]) >= 5.6;
})(), 'a cached loader keeps requesting the OLD ai_assistant.js no matter what the loader now says');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
