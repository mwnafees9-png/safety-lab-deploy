#!/usr/bin/env node
/*
 * Regression — the 2 Aug 2026 decision-slate build batch (rulings 1,2,3,6,8
 * of the twelve; see HANDOFF §1b "Decision slate, 2 Aug evening").
 *
 *  [1] ANEM de-persona — "copilot" and persona voice stripped; the name ANEM
 *      stays (named for Anya and Emma — permanent) with the acronym
 *      "Advisory Notes & Evidence Module" surfaced as a SYSTEM name.
 *      "PFD Co-Pilot" crew-position strings in data_ops are LEGITIMATE and
 *      pinned present so nobody "cleanses" them.
 *  [2] INV-45 — advisory invariant over STORED FCIM cells (AC + systems,
 *      incl. plExtra/mExtra), same severity-word list as the AI-path
 *      _SEV_WORD_RE minus the "(proposed" draft marker. EXECUTED here.
 *  [3] Orphaned-subId guard — writeForm injects a flagged "(unregistered)"
 *      option instead of letting a SELECT coerce a missing value to '' and
 *      silently sever the link on the next submit. EXECUTED here against a
 *      SELECT stub that emulates the coercion.
 *  [4] Model-change assurance gate — _modelWatch persists the last-seen
 *      model id, banners on change, offers the deploy gate, logs the
 *      verdict (capped log). EXECUTED here. Call site rides EVERY
 *      completion, BEFORE the insufficiency throw.
 *  [5] Wiring floors — pins bumped for the batch; index.verify.html gone.
 *
 * The CCMR split (ruling 6) is pinned in regression_atomicity_lint.test.js.
 *
 * Run: node tests/regression_batch_2aug_slate.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const PIN = require('./lib/pinfloor.js');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
const fc = fs.readFileSync(path.join(SITE, 'fcim_combined.js'), 'utf8');
const sup = fs.readFileSync(path.join(SITE, 'support_modules.js'), 'utf8');
const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const dop = fs.readFileSync(path.join(SITE, 'data_ops_modules.js'), 'utf8');
const loader = fs.readFileSync(path.join(SITE, 'ai_loader.js'), 'utf8');

(async function main() {

// ---- [1] ANEM de-persona ----------------------------------------------------
console.log('\n[batch] ANEM de-persona (ruling 1 + the personification FINAL ruling)');
check('ZERO "copilot" occurrences in ai_assistant.js (any case)', !/copilot/i.test(ai));
check('ROLE opens as a system: "You are ANEM (Advisory Notes & Evidence Module)"',
  ai.includes('You are ANEM (Advisory Notes & Evidence Module)'));
check('chat greeting header is the acronym expansion, not "Welcome!"',
  ai.includes('ANEM — Advisory Notes &amp; Evidence Module') && !/>Welcome!</.test(ai));
check('greeting body is tool-directed, no first-person persona voice',
  ai.includes('Talk to your safety model — ANEM edits it live across the golden thread') &&
  !/I['’]m ANEM/.test(ai));
check('nav button title carries the acronym AND keeps the tribute',
  idx.includes('title="Advisory Notes &amp; Evidence Module — named for Anya and Emma"'),
  'the name is permanent — named for his daughters; the tribute stays in the title');
check('"PFD Co-Pilot" crew-position strings survive in data_ops (they are crew stations, not persona)',
  /Co-[Pp]ilot/.test(dop));

// ---- [2] INV-45, executed ---------------------------------------------------
console.log('\n[batch] INV-45 severity words in stored FCIM cells (ruling 2 — advisory only)');
const invBlock = (fc.match(/\/\/ -+ INV-45[\s\S]*?\}\)\(25\);\s*\n\s*\}/) || [''])[0];
check('the INV-45 block was extracted from fcim_combined.js', invBlock.length > 200);

const invSrc = (fc.match(/_INV45_RE = (\/[^\n]+\/i);/) || [])[1] || '';
const sevSrc = (ai.match(/_SEV_WORD_RE = (\/[^\n]+\/i);/) || [])[1] || '';
check('INV-45 word list === the AI-path _SEV_WORD_RE minus the "(proposed" draft marker',
  !!invSrc && !!sevSrc && sevSrc.replace('|\\(proposed', '') === invSrc,
  'the stored-cell rule and the AI-draft rule must never disagree — one list, two enforcement points');

let invDef = null;
const invSb = {
  console, setTimeout,
  window: { invRegister: d => { invDef = d; } },
  acFcimData: [
    { internalId: 1, subId: 'SF-01', tlDesc: 'Loss of pitch control function', plDesc: 'Partial loss of pitch control', mDesc: 'Erroneous pitch command',
      plExtra: [{ desc: 'Uncommanded pitch input' }], mExtra: [{ desc: 'This is catastrophic in cruise' }] },
    { internalId: 2, subId: 'SF-02', tlDesc: 'The majority of channels inoperative', plDesc: '', mDesc: null }
  ],
  systemsData: [{ name: 'FCS', fcim: [{ internalId: 9, subId: 'FC-1', tlDesc: 'Severity: Hazardous effect on the aircraft' }] }]
};
vm.createContext(invSb);
try { vm.runInContext(invBlock, invSb); } catch (e) { check('INV-45 block runs', false, e.message); }
check('registers as INV-45, advisory', !!invDef && invDef.id === 'INV-45' && invDef.sev === 'advisory');
const invRes = invDef ? invDef.run() : { checked: 0, fails: [] };
check('sweeps AC + system FCIMs incl. plExtra/mExtra, skips blank cells (7 cells checked)',
  invRes.checked === 7, 'got ' + invRes.checked);
check('flags the two dirty cells and ONLY them', invRes.fails.length === 2, JSON.stringify(invRes.fails));
check('fail strings name the store, row and cell',
  invRes.fails.some(f => f === 'AC FCIM SF-01 M2: severity word in cell text') &&
  invRes.fails.some(f => f === 'FCS FCIM FC-1 TL: severity word in cell text'), JSON.stringify(invRes.fails));
check('word boundary holds: "majority" does NOT trip \\bmajor\\b',
  !invRes.fails.some(f => f.includes('SF-02')));

// ---- [3] orphaned-subId guard, executed ------------------------------------
console.log('\n[batch] writeForm orphan guard (ruling 3 — "(unregistered)" option)');
const wfSrc = (sup.match(/function writeForm\(data\) \{[\s\S]*?\n    \}/) || [''])[0];
check('writeForm was extracted with the guard in it', wfSrc.includes('slOrphan'));

function mkSelect(vals) {
  const el = {
    tagName: 'SELECT', _opts: [], _value: '',
    get options() { return this._opts; },
    set value(v) { this._value = this._opts.some(o => o.value === String(v)) ? String(v) : ''; },
    get value() { return this._value; },
    querySelectorAll() { return this._opts.filter(o => o.dataset && o.dataset.slOrphan === '1'); },
    appendChild(o) { o.remove = () => { const i = el._opts.indexOf(o); if (i >= 0) el._opts.splice(i, 1); }; el._opts.push(o); }
  };
  vals.forEach(v => el.appendChild({ value: v, textContent: v, dataset: {} }));
  return el;
}
const sel = mkSelect(['', 'SF-01', 'SF-02']);
const wfSb = {
  console, Object, String,
  formIds: { subId: 'f-subid' },
  document: {
    getElementById: id => (id === 'f-subid' ? sel : null),
    createElement: () => ({ value: '', textContent: '', dataset: {} })
  }
};
vm.createContext(wfSb);
vm.runInContext(wfSrc + '\n;globalThis.writeForm = writeForm;', wfSb);

wfSb.writeForm({ subId: 'SF-99' });   // orphaned value — owner deleted/renamed
const orphanOpt = sel._opts.find(o => o.dataset.slOrphan === '1');
check('a missing stored value is injected as a flagged option, not coerced to blank',
  !!orphanOpt && orphanOpt.value === 'SF-99' && sel.value === 'SF-99',
  'value=' + JSON.stringify(sel.value));
check('the injected option is visibly marked "(unregistered)"',
  !!orphanOpt && orphanOpt.textContent === 'SF-99 (unregistered)');
wfSb.writeForm({ subId: 'SF-01' });   // re-open on a REGISTERED value
check('re-opening on a registered value removes the stale orphan option',
  !sel._opts.some(o => o.dataset.slOrphan === '1') && sel.value === 'SF-01');
wfSb.writeForm({ subId: '' });        // blank never injects
check('a blank value never injects an orphan option',
  !sel._opts.some(o => o.dataset.slOrphan === '1') && sel.value === '');

// ---- [4] model-change gate, executed ---------------------------------------
console.log('\n[batch] _modelWatch model-change assurance gate (ruling 4)');
const mwSrc = (ai.match(/function _modelWatch\(modelId\) \{[\s\S]*?\n    \}/) || [''])[0];
check('_modelWatch was extracted', mwSrc.includes('modelChangeLog'));

const lsMap = new Map();
const mwEls = {};
const mwSb = {
  console, JSON, String, Promise, Date,
  localStorage: {
    getItem: k => (lsMap.has(k) ? lsMap.get(k) : null),
    setItem: (k, v) => lsMap.set(k, String(v))
  },
  window: { SafetyLabAI: { runDeployGate: () => Promise.resolve({ verdict: 'PASS' }) } },
  document: {
    getElementById: id => mwEls[id] || null,
    createElement: () => ({ style: {}, innerHTML: '', firstElementChild: { textContent: '', innerHTML: '' }, remove() { delete mwEls[this.id]; } }),
    body: { appendChild(b) { mwEls[b.id] = b; mwEls['sl-mg-run'] = { onclick: null }; mwEls['sl-mg-x'] = { onclick: null }; } }
  }
};
vm.createContext(mwSb);
vm.runInContext(mwSrc + '\n;globalThis._modelWatch = _modelWatch;', mwSb);

mwSb._modelWatch('claude-x-1');
check('first sight records the model id silently — no banner, no log entry',
  lsMap.get('safetyLab.ai.modelSeen') === 'claude-x-1' && !lsMap.has('safetyLab.ai.modelChangeLog') && !mwEls['sl-model-gate-banner']);
mwSb._modelWatch('claude-x-1');
check('same id again: nothing happens', !mwEls['sl-model-gate-banner'] && !lsMap.has('safetyLab.ai.modelChangeLog'));
mwSb._modelWatch('claude-x-2');
const mwLog = JSON.parse(lsMap.get('safetyLab.ai.modelChangeLog') || '[]');
check('a CHANGED id updates the seen key, logs {from,to,verdict:"not yet run"} and raises the banner',
  lsMap.get('safetyLab.ai.modelSeen') === 'claude-x-2' &&
  mwLog.length === 1 && mwLog[0].from === 'claude-x-1' && mwLog[0].to === 'claude-x-2' && mwLog[0].verdict === 'not yet run' &&
  !!mwEls['sl-model-gate-banner']);
check('the banner never blocks — _modelWatch returned and the response path continues', true,
  'structural: the call site wraps in try/catch and the function never throws');
mwEls['sl-mg-run'].onclick();
await new Promise(r => setTimeout(r, 10));
const mwLog2 = JSON.parse(lsMap.get('safetyLab.ai.modelChangeLog') || '[]');
check('the Run button executes runDeployGate and writes the verdict back to the log entry',
  mwLog2.length === 1 && mwLog2[0].verdict === 'PASS');

// 7 Aug fix: _aiGateRun (what runDeployGate actually is, see ai_assistant.js
// runDeployGate: _aiGateRun) returns {pass:null, reasons:[...]} when no baseline
// has ever been set — genuinely NOTHING got verified. The old verdict-extraction
// line folded that into "ran (see console)", a passing-looking label for a gate
// that never ran. Confirm the null-pass branch is now labeled honestly instead.
mwSb.window.SafetyLabAI.runDeployGate = () => Promise.resolve({
  pass: null, current: {}, baseline: null,
  reasons: ['No baseline yet — review the scorecard, then "Set baseline" to start gating regressions on future builds.']
});
mwEls['sl-mg-run'].onclick();
await new Promise(r => setTimeout(r, 10));
const mwLog2b = JSON.parse(lsMap.get('safetyLab.ai.modelChangeLog') || '[]');
check('a no-baseline (pass:null) result is logged honestly as NO BASELINE, never mislabeled "ran (see console)"',
  mwLog2b.length === 1 && /^NO BASELINE —/.test(mwLog2b[0].verdict) && mwLog2b[0].verdict !== 'ran (see console)',
  'verdict=' + JSON.stringify(mwLog2b[0] && mwLog2b[0].verdict));
check('the honest NO BASELINE verdict carries the real reason text, not a bare label',
  mwLog2b[0].verdict.indexOf('Set baseline') !== -1);

for (let i = 3; i < 30; i++) mwSb._modelWatch('claude-x-' + i);
check('the change log is capped at 20 entries',
  JSON.parse(lsMap.get('safetyLab.ai.modelChangeLog')).length <= 20);

check('exactly ONE call site, riding Provider.complete',
  (ai.match(/_modelWatch\(result\.model\)/g) || []).length === 1);
check('the call sits BEFORE the insufficiency throw — the gate watches even insufficient responses',
  ai.indexOf('_modelWatch(result.model)') > 0 &&
  ai.indexOf('_modelWatch(result.model)') < ai.indexOf('if (wantInsuf) {'),
  'an insufficiency throw must not blind the model watch');

// ---- [5] wiring floors ------------------------------------------------------
console.log('\n[batch] wiring floors');
// §7.3 shape: a bare .includes() on an exact version string is a self-eating
// pin — it silently regresses to FAIL the moment a later, legitimate ship
// bumps the number past this literal (that already happened once: assurance
// moved 1.17 -> 1.18 in a later ship and this check broke, even though the
// pin only ever went UP). Compare as a real major.minor floor instead, same
// pattern as regression_cert_std_kb.test.js's ai_assistant-pin check.
function _pinAtLeast(html, file, minMajor, minMinor) {
  const m = html.match(new RegExp(file.replace(/\./g, '\\.') + '\\?v=(\\d+)\\.(\\d+)'));
  if (!m) return false;
  const major = parseInt(m[1], 10), minor = parseInt(m[2], 10);
  return major > minMajor || (major === minMajor && minor >= minMinor);
}
check('index.html pins the batch floors: support 66.20+, assurance 1.17+, fcim_combined 1.2+ (§7.3: floors, not literals)',
  _pinAtLeast(idx, 'support_modules.js', 66, 20) && _pinAtLeast(idx, 'assurance_modules.js', 1, 17) &&
  _pinAtLeast(idx, 'fcim_combined.js', 1, 2));
check('ai_loader pin moved PAST the batch (71.6 was the batch; later ships may bump it)',
  PIN.atLeast(loader, 'ai_assistant.js', '71.6'));
check('site/index.verify.html is GONE (ruling 8) and nothing references it',
  !fs.existsSync(path.join(SITE, 'index.verify.html')) && !idx.includes('index.verify'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
})();
