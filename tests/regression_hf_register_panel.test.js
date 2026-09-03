#!/usr/bin/env node
/*
 * Regression tests for HF-2/HF-3/HF-4 — typed-assumption surfacing, the HFA
 * view, and the production authoring lane (site/hf_register_panel.js).
 *
 * Locks (source-inspection pattern, as with other UI modules):
 *   [1] AUTHORING DOCTRINE (v0.4): every mutation site lives inside the
 *       production author adapter (_productionAuthor / _findRow / _authorSave);
 *       the renderers write only via author.* hooks. The adapter mirrors the
 *       app's own update* helpers: mutate the live row, scheduleAutosave,
 *       re-sync the hand-built tables. Production self-mount and the HFA
 *       view both pass the adapter — the panel IS the authoring surface.
 *   [2] self-mount follows the moat pattern: #view-ac-asm host, own host div
 *       BELOW the moat register, switchTab wrap with an idempotency guard.
 *   [3] site-token styling (CSS variables + data-table + u-mono), no own
 *       stylesheet; namespace hfr-*.
 *   [4] reads via HF_ASSUMPTIONS resolvers only (incl. phasesNormalized and
 *       isValidated — never a raw state comparison); tolerant when absent.
 *   [5] copy guardrails: cited red-line basis; three exits; no “mark as
 *       reviewed” escape; phase strip renders only when windows exist;
 *       task ledger surfaces the no-window warning to authors.
 *   [6] task-ledger authoring: direction/crew/phase/time/basis/co-activation
 *       inputs + the 5-channel chip toggles, all routed through author.setHf;
 *       phase select is fed from phasesNormalized (windows shown inline).
 *   [7] HIDH drawer: lazy-loads hf_reference_data.js, read-only (search,
 *       cite, click-to-copy) — a preset never writes a store; the seed-never-
 *       fill discipline is stated in the UI copy.
 *   [8] wiring: index.html loads the panel after the engine, cache-busted;
 *       hfa tab registered; hf_reference_data.js present in site/ with its
 *       provenance fields and window export.
 *
 * Run:  node tests/regression_hf_register_panel.test.js
 */
'use strict';
const fs = require('fs');
const PIN = require('./lib/pinfloor.js');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}

const src = fs.readFileSync(path.join(__dirname, '..', 'site', 'hf_register_panel.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8');

// ---- [1] the authoring doctrine ----------------------------------------------
check('one adapter owns every write: _productionAuthor with the four hooks',
  /function _productionAuthor\(\)/.test(src) &&
  /setType:/.test(src) && /setState:/.test(src) && /setPosture:/.test(src) && /setHf:/.test(src));
check('adapter finds the live row across both scopes', /function _findRow\(id\)/.test(src) &&
  /acAssumptionsData/.test(src) && /systemsData/.test(src));
check('adapter saves like the app: autosave + re-sync of the hand-built tables',
  /scheduleAutosave\(\)/.test(src) && /renderACAssumptions\(\)/.test(src) && /renderSysAssumptions\(\)/.test(src));
check('renderers never mutate stores directly — no assignment into store rows outside the adapter',
  (function () {
    // every `r.x =` / `r[lane] =` assignment must sit inside the adapter block
    const adapterStart = src.indexOf('function _findRow');
    const adapterEnd = src.indexOf('function _phasesNorm');
    const outside = src.slice(0, adapterStart) + src.slice(adapterEnd);
    return !/\br\.(type|state|hf|credited|uncredited)\s*=/.test(outside) && !/\br\[lane\]\s*=/.test(outside);
  })());
check('production self-mount passes the adapter (the panel IS the authoring surface)',
  /render\(\{ mount: host, author: _productionAuthor\(\), rerender: renderProduction \}\)/.test(src));
check('the Task Analysis view authors too', /const author = _productionAuthor\(\);/.test(src) &&
  /wireTaskPanel\(view, hf, author, renderHfaTask\)/.test(src));
// HF split (22 Jul): HFA page broken into three tabs — HFA (items + HIDH drawer),
// Task Analysis, Ergonomics — each its own renderer + view.
check('HFA split into three renderers over three views',
  /function renderHfa\(\)/.test(src) && /function renderHfaTask\(\)/.test(src) && /function renderHfaErgo\(\)/.test(src) &&
  /getElementById\('view-hfa-task'\)/.test(src) && /getElementById\('view-hfa-ergo'\)/.test(src));
check('HFA tab keeps the work-items + HIDH drawer; task ledger + ergo card moved out',
  (function () {
    const hfaBody = src.slice(src.indexOf('function renderHfa()'), src.indexOf('function renderHfaTask()'));
    return /HFA work items/.test(hfaBody) && /refDrawerShell\(\)/.test(hfaBody) &&
           !/taskAnalysisPanel\(/.test(hfaBody) && !/ergoCard\(\)/.test(hfaBody);
  })());
check('the split renderers are exported + wired into the switchTab wrap',
  /renderHfaTask, renderHfaErgo/.test(src) && /tabId === 'hfa-task'/.test(src) && /tabId === 'hfa-ergo'/.test(src));
check('UI writes route through author.* only',
  /author\.setType/.test(src) && /author\.setState/.test(src) &&
  /author\.setPosture/.test(src) && /author\.setHf/.test(src) &&
  /typeof author\.setHf === 'function'/.test(src));
check('validate button carries the evidence reminder',
  /Validation credit requires evidence/.test(src));

// ---- [2] self-mount pattern ---------------------------------------------------
check('mounts on the aircraft assumptions view', /getElementById\('view-ac-asm'\)/.test(src));
check('own host div, placed after the moat register',
  /hfr-register-host/.test(src) && /asm-register-host/.test(src) && /moat\.nextSibling/.test(src));
check('switchTab wrap carries an idempotency guard',
  /_hfrWrapped/.test(src) && /window\.switchTab = wrapped/.test(src));

// ---- [3] styling discipline ---------------------------------------------------
check('uses site tokens', /var\(--color-border-strong\)/.test(src) && /var\(--color-surface-1\)/.test(src));
check('uses the site data-table class', /class="data-table hfr-table"/.test(src));
// 30 Aug 2026 — v1.1 added the site-shared Data Actions dropdown (Waqas:
// "data actions ... the same for all analysis"); its three site classes join
// the allowlist beside data-table/u-mono/header-with-export.
const SITE_CLASSES = ['data-table', 'u-mono', 'header-with-export', 'tab-dropdown', 'tab-dropbtn', 'tab-dropdown-content', 'btn-cyan'];
const classes = [...src.matchAll(/class="([a-z0-9-]+)/g)].map(m => m[1]).filter(c => SITE_CLASSES.indexOf(c) === -1);
check('own classes live under hfr-*', classes.length > 3 && classes.every(c => c.startsWith('hfr-')),
  classes.filter(c => !c.startsWith('hfr-')).join(','));
check('no standalone stylesheet injected', !/<style/.test(src));

// ---- [4] reads via resolvers --------------------------------------------------
check('reads via HF_ASSUMPTIONS resolvers',
  /asmAllTyped\(\)/.test(src) && /hfaItems\(\)/.test(src) && /inv16\(\)/.test(src) && /inv17\(\)/.test(src) &&
  /effectivePosture\(a\)/.test(src) && /phasesNormalized/.test(src));
check('validation reads go through isValidated — never a raw credited-state comparison',
  /hf\.isValidated\(/.test(src) && !/state === 'Validated'/.test(src));
check('tolerant when the engine is absent', /if \(!hf\) return;/.test(src));

// ---- [5] copy guardrails ------------------------------------------------------
check('cited red-line basis surfaces in findings', /f\.basis/.test(src) && /Parks &amp; Boucek/.test(src));
check('three exits rendered from the finding; no reviewed-escape',
  /f\.exits\.map\(/.test(src) && /mark as reviewed/.test(src));
check('phase strip renders only when windows exist',
  /phases\.filter\(p => p\.windowS\)/.test(src) && /if \(winPhases\.length\)/.test(src));
check('authors are told when the phase-workload check is silent for want of windows',
  /No phase declares a crew response window yet/.test(src) && /Flight Phases tab/.test(src));   // 3 Sep: named in words, not INV-17

// ---- [6] task-ledger authoring -------------------------------------------------
check('all six task fields are authorable',
  ['direction', 'crewmember', 'responsePhase', 'taskTimeS', 'taskTimeBasis', 'coActivation']
    .every(f => src.indexOf('data-f="' + f + '"') !== -1));
check('channel chips toggle through author.setHf',
  /hfr-ch-chip/.test(src) && /HF_CHANNELS/.test(src) && /channels: cur/.test(src));
check('phase select fed from phasesNormalized, windows shown inline',
  /phases\.map\(p =>/.test(src) && src.indexOf("p.windowS ? ' (' + p.windowS + 's)' : ''") !== -1);
check('taskTimeS parses to number, coActivation splits to list on the way in',
  /f === 'taskTimeS'/.test(src) && /f === 'coActivation'/.test(src) && /split\(','\)/.test(src));
check('elicitation discipline stated in the ledger copy',
  /presets seed estimates, they never fill a field/.test(src) && /80% time-occupancy red line/.test(src));
check('concurrency is declared, never solved (co-activation title)',
  /concurrency is an assumption, never a solver/.test(src));

// ---- [7] the HIDH drawer -------------------------------------------------------
check('drawer lazy-loads the reference library', /hf_reference_data\.js\?v=/.test(src) &&
  /_refLoad/.test(src) && /addEventListener\('toggle'/.test(src));
check('drawer is read-only: search, cite, copy — no author reference anywhere in it',
  /hfr-ref-copy/.test(src) && /navigator\.clipboard\.writeText/.test(src) &&
  (function () {
    const dStart = src.indexOf('APPLIC_COLOR'); const dEnd = src.indexOf('function renderHfa');
    return dStart !== -1 && !/author\./.test(src.slice(dStart, dEnd));
  })());
check('seed-never-fill stated at the point of use',
  /A preset never flips anything to Validated/.test(src) && /seed, never fill/.test(src));
check('provenance surfaces: printed page + verbatim quote on the row',
  src.indexOf("p.' + esc(e.page)") !== -1 && src.indexOf('title="\' + esc(e.quote') !== -1);
check('applicability honesty tags filter the list (spaceflight off by default)',
  /applic: \{ aircraft: true, general: true, spaceflight: false \}/.test(src));

// ---- [8] wiring ----------------------------------------------------------------
const iHf = indexHtml.indexOf('hf_assumptions.js?v=');
const iPanel = indexHtml.indexOf('hf_register_panel.js?v=');
check('index.html loads the panel cache-busted after the engine', iHf !== -1 && iPanel > iHf);
check('renderHfa exists and renders into view-hfa', /function renderHfa\(\)/.test(src) && /getElementById\('view-hfa'\)/.test(src));
check('HFA items table + task-analysis ledger both present',
  /HFA work items — computed, never stored/.test(src) && /Task analysis — phase-scoped crew task ledger/.test(src));
check('switchTab wrap renders hfa tab', /tabId === 'hfa'/.test(src) && /renderHfa/.test(src));
const support = fs.readFileSync(path.join(__dirname, '..', 'site', 'support_modules.js'), 'utf8');
// 2 Sep 2026 — the literal-order pin superseded: the seven HF lanes added after
// hfa-task/hfa-ergo were never in this array (regression_hf_nav records the symptom),
// and they now sit between 'hfa' and 'stpa'. What this check protects is membership,
// so it asks for membership rather than for one historical ordering.
check('hfa + hfa-task + hfa-ergo + stpa registered in the switchTab tabs array',
  (() => { const t = (support.match(/const tabs = \[([^\]]*)\];/) || ['', ''])[1];
           return ['hfa', 'hfa-task', 'hfa-ergo', 'stpa'].every(id => t.indexOf("'" + id + "'") >= 0); })());
check('nav entries for the three HF tabs wired in index.html',
  indexHtml.includes('id="snav-hfa-task"') && indexHtml.includes('id="snav-hfa-ergo"') &&
  indexHtml.includes('id="view-hfa-task"') && indexHtml.includes('id="view-hfa-ergo"') &&
  indexHtml.includes("switchTab('hfa-task')") && indexHtml.includes("switchTab('hfa-ergo')"));
// SUPERSEDED 23 Aug 2026 (Waqas: "it is its own lane"): the Rev C home (HF
// inside Analyze > Aircraft > PASA, 15 Aug) is retired. Human Factors is its
// OWN top-level lane — id asb-grp-hf, sibling of Systems and RAM, never inside
// the aircraft group and never labeled R&M. What this check guarantees: the HFA
// entry and its view container exist, and the entry sits in its own lane.
check('nav entry + view container wired in index.html (own lane: asb-grp-hf)',
  indexHtml.includes("id=\"snav-hfa\"") && indexHtml.includes('id="view-hfa"') &&
  indexHtml.includes('Human Factors Analysis (HFA)') &&
  indexHtml.indexOf('id="snav-hfa"') > indexHtml.indexOf('id="asb-grp-hf"') &&
  indexHtml.indexOf('id="asb-grp-hf"') > indexHtml.indexOf('id="asb-grp-systems"') &&
  indexHtml.indexOf('id="snav-hfa"') < indexHtml.indexOf('id="asb-grp-ram"'));
// Pinned to a FLOOR, not an exact string. An exact pin fails on every unrelated
// bump, which trains people to edit the assertion instead of thinking about it —
// and an assertion nobody reads is not defending anything. What these need to
// guarantee is that a returning browser cannot still be running a build from
// before the fix each version marks.
const _ver = (f) => PIN.pinOf(indexHtml, f + '.js');
check('panel cache-buster is at or past the register build (v0.7)',
  PIN.pinAtLeast(_ver('hf_register_panel'), '0.7'), 'found v=' + _ver('hf_register_panel'));
check('engine cache-buster is at or past the workloadBand fix (v0.6)',
  PIN.pinAtLeast(_ver('hf_assumptions'), '0.6'),
  'found v=' + _ver('hf_assumptions') + ' — before v0.6 _normHf dropped workloadBand, so an authored band never reached INV-HFW');
// the reference library ships in site/ with provenance + window export
const refPath = path.join(__dirname, '..', 'site', 'hf_reference_data.js');
check('hf_reference_data.js present in site/ with the window export',
  fs.existsSync(refPath) && /window\.HF_REFERENCE_PRESETS = HF_REFERENCE_PRESETS/.test(fs.readFileSync(refPath, 'utf8')));
const REF = require(refPath);
const refKeys = Object.keys(REF);
check('298 presets, every one carrying source + printed page + applicability + quote',
  refKeys.length === 298 && refKeys.every(k => REF[k].source && REF[k].page && REF[k].applicability && REF[k].quote));
check('applicability honesty tags are the closed set',
  refKeys.every(k => ['aircraft', 'general', 'spaceflight'].indexOf(REF[k].applicability) !== -1));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
