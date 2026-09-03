#!/usr/bin/env node
/*
 * Regression — program_plan v0.1: THE PLAN DRIVES THE NAV.
 *   [1] catalogue integrity: unique ids, every gated snav/tab exists in
 *       index.html and (where owned by core nav) in switchTab's tabs array.
 *   [2] basis defaults: expected lanes on, optional off, opt-in (STPA) off
 *       EVERYWHERE — including the new specific-sora basis.
 *   [3] grandfathering: no scope record → legacy lanes ON, opt-in OFF.
 *   [4] the author path: signed tailoring REQUIRED to drop a basis-expected
 *       lane with data; free otherwise; data never touched; re-enable clears.
 *   [5] the guard: hidden lane tabs reroute to 'spp'; unknown tabs untouched.
 *   [6] wiring: index.html loads program_plan.js cache-busted, after the
 *       panels it gates; npwCreate derives scope from basis.
 * Run: node tests/regression_program_plan.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const PIN = require('./lib/pinfloor.js');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const throws = f => { try { f(); return false; } catch (_) { return true; } };

// Globals the module reads (node-side stand-ins).
global.projectConfig = { regulation: 'Part 25' };
global.ftaPages = [{ id: 'p1', root: { type: 'gate' } }, { id: 'p2', root: null }];
global.praData = [{}, {}]; global.zsaData = []; global.cmaData = [{}];
global.stpaData = { cs: { controllers: [], processes: [], actions: [], feedbacks: [] }, dispositions: {}, scopeFcIds: [] };

const PP = require('../site/program_plan.js');
const idx = S('index.html'), sup = S('support_modules.js'), src = S('program_plan.js');

// ---- [1] catalogue integrity --------------------------------------------------
const ids = PP.CATALOGUE.map(l => l.id);
// Count pinned to the reconciled catalogue (24 as of 30 Jul; was 15 when this
// suite was written on 20 Jul). Structural checks sit alongside the pin so the
// magic number is never the only thing guarding this.
// Lanes grow; the invariants are uniqueness and that every lane sits in a group
// that actually exists. Pinning the count made this fail on every addition.
{
  const groupIds = PP.GROUPS.map(g => g.id);
  check('catalogue: unique ids, every lane in a declared group',
    ids.length >= 24 && new Set(ids).size === ids.length &&
    PP.CATALOGUE.every(l => groupIds.includes(l.group)),
    'saw ' + ids.length + ' lanes / groups [' + groupIds.join(', ') + ']' +
    '; orphans: ' + PP.CATALOGUE.filter(l => !groupIds.includes(l.group)).map(l => l.id).join(', '));
  check('the four expected groups are all present',
    ['safety','ram','hf','ml'].every(g => groupIds.includes(g)), groupIds.join(', '));
}
check('every lane is well formed (id, name, group, snav[], tabs[])',
  PP.CATALOGUE.every(l => l.id && l.name && l.group && Array.isArray(l.snav) && Array.isArray(l.tabs)));

// REACHABILITY, not literal presence in index.html. Some lanes are authored in
// index.html; others self-mount at runtime (bowtie.js createElement's both its
// own `snav-bowtie` entry and its `view-bowtie` div — the moat pattern). A
// source scan of index.html alone can never see a runtime mount, and reported
// Bow-Tie as unwired while it was shipped, live and working. Assert the real
// invariant: the lane is reachable, whoever builds it.
const SITE = path.join(__dirname, '..', 'site');
const siteJs = fs.readdirSync(SITE).filter(f => f.endsWith('.js'))
  .map(f => { try { return fs.readFileSync(path.join(SITE, f), 'utf8'); } catch (_) { return ''; } }).join('\n');
const reachable = id =>
  idx.indexOf('id="' + id + '"') >= 0 ||                                   // authored in index.html
  siteJs.indexOf("'" + id + "'") >= 0 || siteJs.indexOf('"' + id + '"') >= 0;  // or mounted by a module

const tabsArr = (sup.match(/const tabs = \[([^\]]+)\]/) || [])[1] || '';
const badSnav = PP.CATALOGUE.flatMap(l => l.snav.filter(s => !reachable(s)).map(s => l.id + '→' + s));
check('every gated snav id is reachable (index.html or a self-mounting module)',
  badSnav.length === 0, badSnav.join(', '));
const badTab = PP.CATALOGUE.flatMap(l => l.tabs.filter(t =>
  tabsArr.indexOf("'" + t + "'") < 0 && !reachable('view-' + t)).map(t => l.id + '→' + t));
check('every gated tab is a real view (tabs array, view div, or self-mounted)',
  badTab.length === 0, badTab.join(', '));
check('STPA is in the catalogue as the opt-in system lane', PP.CATALOGUE.some(l => l.id === 'stpa' && l.optIn === true));
// 23 Aug 2026 — CEA gated per Waqas ("default off in the program planning and
// hidden"). It was ungated since birth; this pin keeps it opt-in forever.
check('CEA is in the catalogue as an opt-in lane, off under EVERY basis',
  PP.CATALOGUE.some(l => l.id === 'cea' && l.optIn === true && l.snav[0] === 'snav-cea' && l.tabs[0] === 'cea') &&
  PP.BASES.every(b => !PP.defaultsFor(b).cea));
// 23 Aug 2026 — SORA basis-tied per Waqas ("hidden, only visible when using
// sora"). Three faces of the same rule: defaults follow the basis; a live
// basis switch flips visibility with no scope edit; and a stale sora:true in
// the scope record (the old subLane era wrote one into every program) cannot
// resurrect the thread on a non-SORA basis.
// 23 Aug 2026 — the geometry batch: Markov & Event Trees are R&M-group lanes
// now ("RAM to contain markov and anything reliability related"), and the FMES
// rail row is gone (each system folder carries it) while the lane still gates
// the fmes tab.
check('Markov and Event Trees are catalogued under the R&M group',
  PP.CATALOGUE.some(l => l.id === 'markov' && l.group === 'ram') &&
  PP.CATALOGUE.some(l => l.id === 'eta' && l.group === 'ram'));
check('the FMES lane gates its tab but owns no rail row',
  PP.CATALOGUE.some(l => l.id === 'fmes' && l.snav.length === 0 && l.tabs[0] === 'fmes'));
check('SORA is basis-tied: default ON only under the two SORA bases',
  PP.CATALOGUE.some(l => l.id === 'sora' && l.basisLane === true && !l.subLane) &&
  PP.defaultsFor('Part 107').sora === true && PP.defaultsFor('specific-sora').sora === true &&
  PP.BASES.filter(b => b !== 'Part 107' && b !== 'specific-sora').every(b => !PP.defaultsFor(b).sora));
{
  const was = global.projectConfig.regulation;
  // The scope record lives at projectConfig.safetyProgramPlan.scope (see _store).
  const spp0 = global.projectConfig.safetyProgramPlan;
  global.projectConfig.safetyProgramPlan = { slots: {}, notes: '', scope: { sora: true } };  // the stale record, verbatim
  global.projectConfig.regulation = 'Part 25';
  const staleHidden = !PP.laneOn('sora');
  global.projectConfig.regulation = 'specific-sora';
  const soraShown = PP.laneOn('sora');
  global.projectConfig.safetyProgramPlan.scope = { sora: false };  // signed tailoring on a SORA basis
  const tailoredOut = !PP.laneOn('sora');
  if (spp0 === undefined) delete global.projectConfig.safetyProgramPlan;
  else global.projectConfig.safetyProgramPlan = spp0;
  global.projectConfig.regulation = was;
  check('a stale sora:true cannot resurrect the thread off-basis; a SORA basis shows it; signed OFF still wins on-basis',
    staleHidden && soraShown && tailoredOut);
}
check('spine is NOT gated (no FHA/functions/requirements lane in the catalogue)',
  !ids.some(id => /fha|func|req|asm/.test(id)));

// ---- [2] basis defaults -------------------------------------------------------
const p25 = PP.defaultsFor('Part 25');
check('Part 25 default program: FTA + CCA trio + HFA on', p25.fta && p25.pra && p25.zsa && p25.cma && p25.hfa);
check('Part 25 default program: Markov/ETA optional (off), STPA opt-in (off)', !p25.markov && !p25.eta && !p25.stpa);
check('specific-sora basis exists and derives a MINIMAL classical program (no FTA/CCA preselected)',
  PP.BASES.indexOf('specific-sora') >= 0 && !PP.defaultsFor('specific-sora').fta && !PP.defaultsFor('specific-sora').pra);
check('STPA off by default under EVERY basis', PP.BASES.every(b => !PP.defaultsFor(b).stpa));
check('sc-vtol expects HFA', PP.defaultsFor('sc-vtol').hfa === true);

// ---- [3] grandfathering -------------------------------------------------------
check('no scope record → legacy lanes ON, opt-in OFF', PP.scope() === null && PP.laneOn('fta') && PP.laneOn('markov') && !PP.laneOn('stpa'));
check('unknown tab ids are never gated', PP.laneOn('definitely-not-a-lane') === true);

// ---- [4] the author path ------------------------------------------------------
check('laneData counts only real work (fta pages WITH roots)', PP.laneData('fta') === 1 && PP.laneData('pra') === 2 && PP.laneData('zsa') === 0);
check('dropping an expected lane WITH data throws without rationale+signature',
  throws(() => PP.setLane('pra', false)) && throws(() => PP.setLane('pra', false, { rationale: 'short', sig: 'X' })));
check('…and the refusal changed nothing', PP.laneOn('pra') === true && global.praData.length === 2);
PP.setLane('pra', false, { rationale: 'Airframe PRA delivered by supplier under DDP-114; imported as evidence.', sig: 'W. Nafees — Head of Safety' });
check('signed tailoring lands: lane off, entry recorded, DATA UNTOUCHED',
  !PP.laneOn('pra') && PP.tailoring().some(t => t.laneId === 'pra' && t.sig.indexOf('Nafees') >= 0) && global.praData.length === 2);
check('dropping an optional/empty lane is free', !throws(() => PP.setLane('zsa', false)) && !PP.laneOn('zsa'));
PP.setLane('pra', true);
check('re-enable restores the lane and clears the tailoring entry to history',
  PP.laneOn('pra') && PP.tailoring().every(t => t.laneId !== 'pra' || t.cleared === true));
check('opting IN to STPA works (the launch path)', !throws(() => PP.setLane('stpa', true)) && PP.laneOn('stpa'));
check('scope persists inside projectConfig.safetyProgramPlan (no new top-level store)',
  global.projectConfig.safetyProgramPlan && typeof global.projectConfig.safetyProgramPlan.scope === 'object');

// ---- [5] the guard ------------------------------------------------------------
PP.setLane('zsa', false);
check('hidden lane tab reroutes to the plan page', PP._guardTab('zsa') === 'spp');
check('visible lane + unknown tabs pass through', PP._guardTab('pra') === 'pra' && PP._guardTab('dashboard') === 'dashboard');

// ---- [6] wiring ---------------------------------------------------------------
check('index.html loads program_plan.js cache-busted, AFTER stpa_panel',
  /program_plan\.js\?v=[\d.]+/.test(idx) && idx.indexOf('stpa_panel.js') < idx.indexOf('program_plan.js'));
check('switchTab wrap guard present (_ppWrapped)', /_ppWrapped/.test(src));
check('npwCreate derives scope from the chosen basis', /PROGRAM_PLAN\.initScope\(basis\)/.test(S('misc_fn_modules.js')));
check('module never mutates analysis stores (display-lane + plan-only writes)',
  !/acFhaData\s*[.=]/.test(src) && !/praData\s*=/.test(src) && !/ftaPages\s*=/.test(src) && !/stpaData\s*=/.test(src));
check('tailoring language present (a silent deselection is a hole)', /silent deselection is a hole/.test(src));
check('mockup-parity skin: slider toggles + locked SPINE row on the scope card',
  /function _slider\(/.test(src) && /role="switch"/.test(src) && src.indexOf('>SPINE</span>') >= 0 && /program spine — always on/.test(src));

// ---- [7] basis dialect normalization (the K350 lesson) ------------------------
// Live project files carry 'part-23'; the wizard writes 'Part 23'. Same program.
check('defaultsFor normalizes basis dialects (part-23 ≡ Part 23)',
  JSON.stringify(PP.defaultsFor('part-23')) === JSON.stringify(PP.defaultsFor('Part 23')) &&
  JSON.stringify(PP.defaultsFor('SC-VTOL')) === JSON.stringify(PP.defaultsFor('sc-vtol')));
global.projectConfig.regulation = 'part-23';
check('basisNow canonicalizes the live-file dialect', PP.basisNow() === 'Part 23');
check('isExpected arms under the live-file dialect (PRA expected on part-23)', PP.isExpected('pra') === true);
global.projectConfig.regulation = 'Part 25';

// ---- [8] the printed SSPP carries the scope (nav = plan = report) -------------
const rep = fs.readFileSync(path.join(__dirname, '..', 'site', 'reports.js'), 'latin1');
check('program_scope_table token registered (regex + editor list + data build)',
  rep.indexOf('|program_scope_table|') >= 0 && rep.indexOf("'program_scope_table',") >= 0 &&
  /program_scope_table:\s+_buildProgramScopeTable\(\)/.test(rep));
check('scope-table builder reads the live plan (laneOn/tailoring/basisNow)',
  /_buildProgramScopeTable/.test(rep) && /PROGRAM_PLAN\.laneOn\(l\.id\)/.test(rep) && /TAILORED OUT \(signed\)/.test(rep));
check('BOTH methodology template sections print the scope table',
  (rep.match(/\{\{program_scope_table\}\}/g) || []).length === 2);
check('spp_summary line now counts lanes in program', /analysis lanes in program/.test(rep));

// ---- [9] the intake wizard shows the lane checklist ---------------------------
const misc2 = S('misc_fn_modules.js');
check('wizard hosts the scope checklist + re-renders on basis change',
  misc2.indexOf("id=\"npw-scope\"") >= 0 && /renderWizardScope\(\\'npw-scope\\', v\)/.test(misc2));
check('npwCreate captures boxes BEFORE the modal closes, then applies', /laneSel\[b\.dataset\.lane\]/.test(misc2) && /applyWizardScope\(basis, laneSel\)/.test(misc2));
check('applyWizardScope honors explicit selections over basis defaults', (() => {
  PP.applyWizardScope('Part 25', { stpa: true, markov: true, hfa: false });
  return PP.laneOn('stpa') && PP.laneOn('markov') && !PP.laneOn('hfa') && PP.laneOn('fta');
})());

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

// ---- empty-category sweep (found live 20 Jul: "System lane" empty dropdown) ----
{
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'site', 'program_plan.js'), 'utf8');
    check('empty categories hide WITH their items (_sweepEmptyCategories in applyNav)',
        /_sweepEmptyCategories\(\);/.test(src) && /details\.asb-cat/.test(src));
    check('category sweep uses save/restore discipline, never blanks display',
        /ppcatPrev/.test(src) && /ppcatHidden/.test(src) && /cat\.style\.display = cat\.dataset\.ppcatPrev \|\| ''/.test(src));
    check('sweep reads computed item display (covers plan AND tier hiding)',
        /every\(i => i\.style\.display === 'none'\)/.test(src));
    // Pinned to an exact version this fails on every unrelated change to the
    // module, which trains people to edit the test rather than think. What it
    // needs to guarantee is that the buster moved past the build that added the
    // sweep — otherwise returning browsers keep a program_plan.js without it.
    const ppVer = PIN.pinOf(idx, 'program_plan.js');
    check('program_plan.js buster is at or past the sweep build (v0.7)',
        PIN.pinAtLeast(ppVer, '0.7'), 'found v=' + ppVer + ', expected >= 0.7');
}
