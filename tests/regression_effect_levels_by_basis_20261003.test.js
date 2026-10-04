#!/usr/bin/env node
/*
 * Regression: the effect levels follow the certification basis (3 Oct 2026).
 *
 * Waqas: "it is a by cert basis update, the AI should be reading the cert basis definitions
 * before defining the effects for a particular project." And: Part 25 projects must behave
 * exactly as today.
 *
 * What this pins, EXECUTED against the real modules:
 *   1. Part 25 is byte-for-byte 1.3 (one deliberate fix: three axes level BELOW the top step no longer
 *      read "all three axes at the catastrophic step"): every reader (levelIndex, normLevel, derive,
 *      applyTerminal, rationale, terminalNote, effectsHtml) gives the same answer as the
 *      frozen 1.3 module (tests/fixtures/severity_axes_v1_3.js) over a large input corpus,
 *      on a Part 25 project and on a project with no basis set.
 *   2. Every other basis: its labels, its definitions (the same words as the page's table),
 *      where it draws the occupant line (SC-VTOL Enhanced: one fatality is Catastrophic with
 *      the aircraft intact; Part 23 / rotorcraft / SC-VTOL Basic: one fatality is Hazardous,
 *      two or more Catastrophic), and the joint top step.
 *   3. Nothing saved changes meaning: every stored (canonical) label reads back to its own
 *      step under every basis, and every basis label reads to its step under every basis.
 *   4. The EFFECT LEVELS block the prompts carry, per basis.
 *   5. What people see (the Effects cell, the CSV export) uses the basis words.
 *   6. The drafting prompts point the levels at that block; pins.
 *
 * Run: node tests/regression_effect_levels_by_basis_20261003.test.js
 * Mutation runs: SLAB_SITE=/path/to/mutated/site node tests/regression_effect_levels_by_basis_20261003.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = process.env.SLAB_SITE || path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const PIN = require('./lib/pinfloor.js');

function load(cfg, src) {
  const ctx = { console, setInterval: () => 0, clearInterval() {}, Math, String, Array, Object, Number, RegExp, JSON };
  ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  if (cfg !== undefined) vm.runInContext('var projectConfig = ' + JSON.stringify(cfg) + ';', ctx);
  vm.runInContext(S('severity_tables.js'), ctx);
  vm.runInContext(src || S('severity_axes.js'), ctx);
  return ctx.SLSeverityAxes;
}
const OLD_SRC = fs.readFileSync(path.join(__dirname, 'fixtures', 'severity_axes_v1_3.js'), 'utf8');

console.log('\n[1] Part 25 is exactly 1.3');
{
  const OLD = load({ regulation: 'Part 25' }, OLD_SRC);
  check('the fixture is the shipped 1.3 module', OLD._v === '1.3');
  const phrases = [];
  ['ac', 'crew', 'pax'].forEach(ax => { OLD.AXES[ax].levels.forEach(l => phrases.push(l, l.toUpperCase(), ' ' + l + '. ')); });
  phrases.push('', null, undefined, 0, 1, 2, 3, 4, 5, -1, 2.5, '0', '3', '4', '9', 'none', 'no effect', 'no reduction', 'Hull Loss', 'loss of the aircraft', 'loss of airplane', 'aircraft lost',
    'excessive', 'fatalities', 'fatality', 'incapacitation', 'incapacitated', 'slight inconvenience', 'inconvenience', 'minor injury', 'severe injuries', 'serious injuries', 'few fatalities',
    'serious or fatal injury', 'serious injury', 'multiple fatalities', 'one fatality', 'a fatality', 'single fatality', 'two or more fatalities', 'one or more fatalities', 'serious injury, no fatality',
    'fatal injury or incapacitation', 'serious or fatal injury to an occupant', 'serious or fatal injury to one occupant', 'incapacitation or fatal injury', 'loss of aircraft',
    'large reduction', 'significant increase', 'catastrophic', 'something else', 'loss of control', 'non fatal', 'without fatality');
  for (const cfg of [{ regulation: 'Part 25' }, undefined, {}]) {
    const NEW = load(cfg);
    const tag = cfg === undefined ? 'no project' : (cfg.regulation || 'empty config');
    const diffs = [];
    for (const ax of ['ac', 'crew', 'pax']) for (const p of phrases) {
      const a = OLD.levelIndex(ax, p), b = NEW.levelIndex(ax, p);
      // the one deliberate widening: a rotorcraft label is a level everywhere, never "unset"
      if (a !== b && !(a === -1 && /rotorcraft/.test(String(p)))) diffs.push(ax + ':' + JSON.stringify(p) + ' ' + a + '->' + b);
      if (OLD.normLevel(ax, p) !== NEW.normLevel(ax, p) && a !== -1) diffs.push('norm ' + ax + ':' + p);
    }
    check(tag + ': levelIndex / normLevel identical to 1.3 over ' + phrases.length * 3 + ' inputs', diffs.length === 0, diffs.slice(0, 5).join(' | '));
    const L = ['ac', 'crew', 'pax'].map(ax => [''].concat(OLD.AXES[ax].levels));
    let rows = 0; const rd = [];
    for (const a of L[0]) for (const c of L[1]) for (const x of L[2]) {
      const row = { effAcLevel: a, effCrewLevel: c, effPaxLevel: x, effAc: 'A', effCrew: '', effPax: 'P' }; rows++;
      const j = v => JSON.stringify(v);
      if (j(OLD.derive(row)) !== j(NEW.derive(row))) rd.push('derive ' + j(row));
      if (j(OLD.applyTerminal(row)) !== j(NEW.applyTerminal(row))) rd.push('terminal ' + j(row));
      // the one deliberate change: three level axes below the top step no longer say "catastrophic"
      const _same = [a, c, x].every(v => v) && OLD.levelIndex('ac', a) === OLD.levelIndex('crew', c) && OLD.levelIndex('crew', c) === OLD.levelIndex('pax', x) && OLD.levelIndex('ac', a) < 4;
      const _oldR = _same ? OLD.rationale(row).replace('all three axes at the catastrophic step', 'all three axes at the same step') : OLD.rationale(row);
      if (_oldR !== NEW.rationale(row)) rd.push('rationale ' + j(row));
      if (OLD.terminalNote(OLD.applyTerminal(row)) !== NEW.terminalNote(NEW.applyTerminal(row))) rd.push('note ' + j(row));
      if (OLD.effectsHtml(row) !== NEW.effectsHtml(row)) rd.push('html ' + j(row));
    }
    check(tag + ': derive, the joint top step, the rationale, the note and the Effects cell identical to 1.3 for all ' + rows + ' level combinations', rd.length === 0, rd.slice(0, 3).join(' | '));
    check(tag + ': a No Safety Effect row no longer says "all three axes at the catastrophic step"; a hull loss row still does',
      /→ No Safety Effect \(all three axes at the same step\)$/.test(NEW.rationale({ effAcLevel: 'none', effCrewLevel: 'none', effPaxLevel: 'none or slight inconvenience' })) &&
      /→ Catastrophic \(all three axes at the catastrophic step\)$/.test(NEW.rationale({ effAcLevel: 'hull loss' })) &&
      /→ Major \(all three axes at the same step\)$/.test(NEW.rationale({ effAcLevel: 'significant', effCrewLevel: 'significant', effPaxLevel: 'minor injuries' })));
    check(tag + ': the standing assumption is the 1.3 sentence', NEW.assumptionFor() === OLD.TERMINAL_ASSUMPTION && NEW.TERMINAL_ASSUMPTION === OLD.TERMINAL_ASSUMPTION);
  }
}

console.log('\n[2] every other basis: its own words and its own lines');
const BASES = {
  'Part 23':          { cfg: { regulation: 'part-23', part23Class: 'II' }, ac4: 'hull loss', crew4: 'fatal injury or incapacitation', pax3: 'serious or fatal injury to an occupant', pax4: 'multiple fatalities', top: 'all' },
  'Part 27':          { cfg: { regulation: 'Part 27', part27Class: 'II' }, ac4: 'loss of rotorcraft', crew4: 'fatalities or incapacitation', pax3: 'serious or fatal injury to one occupant', pax4: 'multiple fatalities', top: 'all' },
  'Part 29':          { cfg: { regulation: 'Part 29' }, ac4: 'loss of rotorcraft', crew4: 'fatalities or incapacitation', pax3: 'serious or fatal injury to one occupant', pax4: 'multiple fatalities', top: 'all' },
  'SC-VTOL Basic':    { cfg: { regulation: 'sc-vtol', scvtolCategory: 'Basic 2' }, ac4: 'loss of aircraft', crew4: 'incapacitation or fatal injury', pax3: 'serious or fatal injury to an occupant', pax4: 'multiple fatalities', top: 'all' },
  'SC-VTOL Enhanced': { cfg: { regulation: 'SC-VTOL', scvtolCategory: 'Enhanced' }, ac4: 'loss of aircraft', crew4: 'incapacitation or fatal injury', pax3: 'serious injury, no fatality', pax4: 'one or more fatalities', top: 'ac' }
};
const COL = { ac: 0, pax: 1, crew: 2 }, CLS = ['Negligible', 'Minor', 'Major', 'Hazardous', 'Catastrophic'];
for (const b of Object.keys(BASES)) {
  const E = BASES[b], A = load(E.cfg);
  check(b + ': the project resolves to its own basis', A.basisOf() === b, A.basisOf());
  check(b + ': top-step labels and the occupant Hazardous label', A.label('ac', 4) === E.ac4 && A.label('crew', 4) === E.crew4 && A.label('pax', 3) === E.pax3 && A.label('pax', 4) === E.pax4);
  const T = A.basisOf() && load(E.cfg).basisOf && (function () { const c = { console }; c.window = c; vm.createContext(c); vm.runInContext(S('severity_tables.js'), c); return c.SLSeverityTables.tableFor(E.cfg); })();
  let defOk = true, why = '';
  for (const ax of ['ac', 'crew', 'pax']) for (let i = 0; i < 5; i++) {
    const cell = T.rows[CLS[i]].cells[COL[ax]].replace(/\s*\(Note \d+\)/g, '');
    if (A.def(ax, i).indexOf(cell) !== 0) { defOk = false; why = ax + i + ': ' + A.def(ax, i); }
  }
  check(b + ': every level is defined in the same words as the basis table on the page', defOk, why);
  // one fatality, two fatalities
  const one = A.derive({ effAcLevel: 'significant', effCrewLevel: 'significant', effPaxLevel: 'one fatality' });
  const two = A.derive({ effAcLevel: 'significant', effCrewLevel: 'significant', effPaxLevel: 'two or more fatalities' });
  if (E.top === 'ac') {
    check(b + ': ONE fatality is Catastrophic', one && one.severity === 'Catastrophic');
    check(b + ': "serious injury, no fatality" is Hazardous and any phrase naming a fatality is Catastrophic',
      A.derive({ effPaxLevel: 'serious injury, no fatality' }).severity === 'Hazardous' && A.derive({ effPaxLevel: 'possible fatal injury to a person on the ground' }).severity === 'Catastrophic' && A.derive({ effPaxLevel: 'serious injuries' }).severity === 'Hazardous');
    const t = A.applyTerminal({ effAcLevel: 'significant', effCrewLevel: 'large', effPaxLevel: E.pax4 });
    check(b + ': an occupant fatality does NOT pull the aircraft to "lost" (the aircraft can be intact)', t.changed.length === 0 && t.levels.effAcLevel === 'significant');
    const t2 = A.applyTerminal({ effAcLevel: E.ac4 });
    check(b + ': the loss of the aircraft still carries the crew and occupants to their top steps', t2.changed.join() === 'crew,pax' && A.levelIndex('pax', t2.levels.effPaxLevel) === 4);
  } else {
    check(b + ': ONE fatality is Hazardous, two or more Catastrophic', one && one.severity === 'Hazardous' && two && two.severity === 'Catastrophic');
    const t = A.applyTerminal({ effAcLevel: 'significant', effCrewLevel: 'large', effPaxLevel: E.pax4 });
    check(b + ': the top step stays joint in every direction (multiple fatalities = the whole state)', t.changed.join() === 'ac,crew');
  }
  check(b + ': the basis\' own top labels read as the top step', A.levelIndex('ac', E.ac4) === 4 && A.levelIndex('crew', E.crew4) === 4 && A.levelIndex('pax', E.pax4) === 4 && A.levelIndex('pax', E.pax3) === 3);
  const note = A.terminalNote(A.applyTerminal({ effAcLevel: E.ac4 }));
  check(b + ': the joint-step note speaks the basis\' words, not "Hull loss ... Table A6"', note.indexOf(E.pax4) >= 0 && note.indexOf(b) >= 0 && (b === 'Part 23' || note.indexOf('Hull loss is credited') < 0));
}

console.log('\n[3] nothing saved changes meaning');
{
  const OLD = load(undefined, OLD_SRC);
  const all = Object.keys(BASES).map(b => [b, load(BASES[b].cfg)]).concat([['Part 25', load({ regulation: 'Part 25' })]]);
  const bad = [];
  for (const [b, A] of all) for (const ax of ['ac', 'crew', 'pax']) for (let i = 0; i < 5; i++) {
    if (A.levelIndex(ax, OLD.AXES[ax].levels[i]) !== i) bad.push(b + ' stored ' + ax + i);
    if (A.normLevel(ax, OLD.AXES[ax].levels[i]) !== OLD.AXES[ax].levels[i]) bad.push(b + ' norm ' + ax + i);
    for (const [b2, A2] of all) { const lab = A2.label(ax, i); if (A.levelIndex(ax, lab) !== i) bad.push(b + ' reads ' + b2 + ' "' + lab + '" as ' + A.levelIndex(ax, lab)); }
  }
  check('every stored label reads back to its own step, and every basis label reads to its step, under every basis', bad.length === 0, bad.slice(0, 4).join(' | '));
  const E = load(BASES['SC-VTOL Enhanced'].cfg);
  check('what is STORED stays canonical: an Enhanced "one or more fatalities" is saved as the step, not the words', E.normLevel('pax', 'one or more fatalities') === 'multiple fatalities' && E.display('pax', 'multiple fatalities') === 'one or more fatalities');
}

console.log('\n[4] the EFFECT LEVELS block the prompts carry');
{
  for (const b of Object.keys(BASES)) {
    const E = BASES[b], blk = load(E.cfg).effectLevelsBlock(E.cfg);
    check(b + ': names the basis, all fifteen labels, and the definitions', blk.indexOf('EFFECT LEVELS FOR THIS CERTIFICATION BASIS - ' + b) === 0 && [E.ac4, E.crew4, E.pax3, E.pax4].every(w => blk.indexOf('. ' + w + ' = ') > 0) && (blk.match(/\n  \d\. /g) || []).length === 15);
    check(b + ': states its top-step rule', E.top === 'ac' ? /do NOT imply the loss of the aircraft/.test(blk) && /including one person on the ground/.test(blk) : /one joint end state/.test(blk));
    check(b + ': no em dash in the prompt text', blk.indexOf('\u2014') < 0);
  }
  const p25 = load({ regulation: 'Part 25' }).effectLevelsBlock({ regulation: 'Part 25' });
  check('Part 25: the block lists the exact 1.3 labels with the 1.3 definitions', ['hull loss = Normally with hull loss', 'fatalities or incapacitation = Fatalities or incapacitation (Catastrophic).', 'severe injuries or few fatalities = Serious or fatal injury to a small number of persons other than the flightcrew (Hazardous).'].every(w => p25.indexOf(w) > 0));
  const p33 = load({ regulation: 'Part 33' }).effectLevelsBlock({ regulation: 'Part 33' });
  check('Part 33 (no aircraft effect table): product labels only, sent to the rubric, no borrowed Part 25 definitions', /has no aircraft-level effect table of its own/.test(p33) && p33.indexOf('Normally with hull loss') < 0);
}

console.log('\n[5] what people see uses the basis words');
{
  const E = load(BASES['SC-VTOL Enhanced'].cfg);
  const h = E.effectsHtml({ effAcLevel: 'significant', effCrewLevel: 'large', effPaxLevel: 'multiple fatalities', effPax: 'one passenger killed' });
  check('the Effects cell chip shows "one or more fatalities" on an Enhanced project', />one or more fatalities</.test(h) && !/>multiple fatalities</.test(h));
  check('the rationale names the basis level', /Occupants one or more fatalities → Catastrophic/.test(E.rationale({ effPaxLevel: 'multiple fatalities' })));
  const dops = S('data_ops_modules.js');
  check('all four FHA CSV exports write the levels in the basis words', (dops.match(/_axisShow\('ac', r\.effAcLevel\), _axisShow\('crew', r\.effCrewLevel\), _axisShow\('pax', r\.effPaxLevel\)/g) || []).length === 4 && !/r\.effAcLevel \|\| ''/.test(dops));
  const fn = dops.match(/function _axisShow\(axis, v\) \{[\s\S]*?\n\}/);
  const ctx = { window: { SLSeverityAxes: E } }; ctx.SLSeverityAxes = E; vm.createContext(ctx); vm.runInContext(fn[0] + ';globalThis.__f=_axisShow;', ctx);
  check('EXECUTED: the export helper turns the stored step into the basis words, and leaves an unreadable cell as it is', ctx.__f('pax', 'multiple fatalities') === 'one or more fatalities' && ctx.__f('ac', 'banana') === 'banana' && ctx.__f('crew', '') === '');
  const ax = S('severity_axes.js');
  check('the form pickers keep the stored value and relabel the text from the basis on every drive', /function _relabel\(prefix\)/.test(ax) && /try \{ _relabel\(prefix\); \} catch/.test(ax) && /'<option value="' \+ esc\(l\) \+ '" title="' \+ esc\(def\(ax, i\)\) \+ '">' \+ esc\(a\.label \+ ': ' \+ label\(ax, i\)\)/.test(ax));
}

console.log('\n[6] the drafting prompts point the levels at the block; pins');
{
  const ai = S('ai_assistant.js'), sk = S('ai_skills.js'), idx = S('index.html'), loader = S('ai_loader.js');
  const spec = (ai.match(/const _SPEC_FHA = \[[\s\S]*?\]\.join/) || [''])[0];
  for (const [n, t] of [['the inline FHA spec', spec], ['the registry body', sk]]) {
    check(n + ': each level is one label from the EFFECT LEVELS block, Part 25 words kept as the example', /each exactly one label from that axis in the EFFECT LEVELS block for this certification basis, written as shown there \(for a Part 25 basis: none \| slight \| significant \| large \| hull loss;/.test(t));
    check(n + ': the joint top step follows the block', /Where it says only the loss of the aircraft carries the others, an occupant or crew top step stands on its own/.test(t));
    check(n + ': no longer says the rubric is "appended"', !/rubric appended|RUBRIC appended/.test(t));
  }
  check('the classic FHA prompt, its JSON shape and the chat add_fha all send the levels to the block',
    /from the EFFECT LEVELS block for this certification basis, as the THREE EFFECT AXES rule below says/.test(ai) &&
    /"effAcLevel": "<one aircraft label from the EFFECT LEVELS block, or \\"\\">"/.test(ai) && /"effPaxLevel": "<one occupant label from the EFFECT LEVELS block, or \\"\\">"/.test(ai) &&
    /effPaxLevel \(one label per axis from the EFFECT LEVELS block for this certification basis/.test(ai) && !/hull loss, or \\"\\">"/.test(ai));
  check('fha.draft / sfha.draft v11', /'fha\.draft': 11,\s*\n\s*'sfha\.draft': 11,/.test(sk));
  check('pins: severity_axes 1.36, ai_skills 2.16, data_ops 66.49, severity_rubrics 1.4, severity_tables 1.1, ai_loader 8.69 -> ai_assistant 76.77, cert_std_kb 0.14',
    PIN.atLeast(idx, 'severity_axes.js', '1.36') && PIN.atLeast(idx, 'ai_skills.js', '2.16') && PIN.atLeast(idx, 'data_ops_modules.js', '66.49') && PIN.atLeast(idx, 'severity_rubrics.js', '1.4') &&
    PIN.atLeast(idx, 'severity_tables.js', '1.1') && PIN.atLeast(idx, 'ai_loader.js', '8.69') && PIN.atLeast(loader, 'ai_assistant.js', '76.77') && PIN.atLeast(loader, 'cert_std_kb_data.js', '0.14'));
  check('severity_tables loads before severity_axes (the definitions it reads)', idx.indexOf('severity_tables.js?v=') > 0 && idx.indexOf('severity_tables.js?v=') < idx.indexOf('severity_axes.js?v='));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
