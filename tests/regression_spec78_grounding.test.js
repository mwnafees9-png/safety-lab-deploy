#!/usr/bin/env node
/*
 * Regression — spec 78 closed (8 Aug 2026): resources.draft and stpa.draft
 * wrote to stores while sitting OUTSIDE _ANALYSIS_FEATURES — no standards
 * spec, no golden-thread context, no basis clause (their _LANE_BASES entries
 * were dead data), no insufficiency guard. SL-ARC-0001 §22 named it (the STPA
 * gray bar: "the entry is data, not code"); SL-WP-0005 §13 stated it to
 * customers; the Guardrails §6.2 / AI Capabilities §13 contradiction (§3.7.2)
 * rested on exactly this.
 *
 * Both lanes are now first-class grounded analysis features. This suite pins
 * the wiring, the copyright posture (J3307: step/sub-step ids and doctrine in
 * OUR OWN words — never clause prose), and the insufficiency handling in both
 * callers (a refusal reads as a refusal, not as a parse failure).
 *
 * Run: node tests/regression_spec78_grounding.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const ai = S('ai_assistant.js'), loader = S('ai_loader.js'), html = S('index.html');

// ---- helpers: extract a block by brace/bracket matching ---------------------
function block(startRe) {
  const m = ai.match(startRe);
  if (!m) return null;
  let i = ai.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < ai.length; j++) {
    if (ai[j] === '{') depth++;
    else if (ai[j] === '}') { depth--; if (!depth) return ai.slice(i, j + 1); }
  }
  return null;
}
function constStr(name) {
  const m = ai.match(new RegExp('const ' + name + ' = \\['));
  if (!m) return null;
  const j = ai.indexOf("].join('\\n');", m.index);
  return j > 0 ? ai.slice(m.index, j) : null;
}

// ---- [1] membership — both lanes are ANALYSIS features ----------------------
console.log('\n[membership] the two lanes sit inside the grounding machinery');
{
  const feat = block(/const _ANALYSIS_FEATURES = /);
  check('_ANALYSIS_FEATURES carries resources.draft', !!feat && /'resources\.draft': 1/.test(feat));
  check('_ANALYSIS_FEATURES carries stpa.draft', !!feat && /'stpa\.draft': 1/.test(feat));
  const specs = block(/const _FEATURE_SPECS = /);
  check('_FEATURE_SPECS maps both lanes to their spec blocks', !!specs &&
    /'resources\.draft': _SPEC_RESOURCES/.test(specs) && /'stpa\.draft': _SPEC_STPA/.test(specs));
  check('_LANE_BASES entries (previously dead data) still present for both',
    /'resources\.draft':\['ARP4754B §4\.3'\]/.test(ai) && /'stpa\.draft':\s*\['SAE J3307'/.test(ai));
}

// ---- [2] the STPA spec — J3307 posture --------------------------------------
console.log('\n[stpa] the spec grounds the seed without reproducing the standard');
{
  const spec = constStr('_SPEC_STPA');
  check('_SPEC_STPA exists', !!spec);
  check('scopes the lane to the Step 1 / Step 2 SEED with sub-step ids (1a-2f)',
    !!spec && /1a/.test(spec) && /2f/.test(spec) && /SEED/.test(spec));
  check('the tool owns UCA derivation — the model never writes 3a/4a/4b',
    !!spec && /MECHANICALLY/.test(spec) && /never write UCAs/.test(spec));
  check('hazards are SYSTEM STATES, not failures or causes', !!spec && /SYSTEM STATES/.test(spec));
  check('traceability is the deliverable (lossRefs / hazardRefs demanded)',
    !!spec && /lossRefs/.test(spec) && /hazardRefs/.test(spec));
  check('no risk ranking — severity stays with the FHA lane', !!spec && /defines no severity classes/.test(spec));
  check('insufficiency contract stated', !!spec && /insufficient_information/.test(spec));
  check('copyright posture: cites J3307 by step ids, no clause prose blocks',
    !!spec && /J3307/.test(spec) && !/shall\s+be\s+performed/i.test(spec));
}

// ---- [3] the resources spec -------------------------------------------------
console.log('\n[resources] grounded enumeration, never invention');
{
  const spec = constStr('_SPEC_RESOURCES');
  check('_SPEC_RESOURCES exists, anchored on ARP4754B §4.3', !!spec && /ARP4754B §4\.3/.test(spec));
  check('grounding rule: echo given names, never invent a system', !!spec && /never invent a system/.test(spec));
  check('names the downstream stake — resource edges are common-cause candidates', !!spec && /common-cause candidates/.test(spec));
  check('insufficiency contract stated', !!spec && /insufficient_information/.test(spec));
}

// ---- [4] refusals read as refusals ------------------------------------------
console.log('\n[insufficiency] both callers detect the refusal object');
{
  const stpaRun = ai.slice(ai.indexOf('async function _runStpaDraft'), ai.indexOf('async function _runStpaDraft') + 2600);
  check('_runStpaDraft routes the insufficiency object to a named toast, before the parse check',
    /_detectInsufficient\(r\.text\)/.test(stpaRun) && /STPA seed declined — insufficient inputs/.test(stpaRun) &&
    stpaRun.indexOf('_detectInsufficient') < stpaRun.indexOf('did not parse'));
  const resRun = ai.slice(ai.indexOf('async function draftResources'), ai.indexOf('async function draftResources') + 2200);
  check('draftResources routes it the same way', /_detectInsufficient\(r\.text\)/.test(resRun) &&
    /Resources draft declined — insufficient inputs/.test(resRun));
}

// ---- [4b] token budgets — proven starved live 8 Aug (stop=max_tokens, 0 text) --
console.log('\n[budget] the grounded lanes carry reasoning-model budgets');
{
  const stpaCall = ai.slice(ai.indexOf("feature: 'stpa.draft'"), ai.indexOf("feature: 'stpa.draft'") + 400);
  const resCall = ai.slice(ai.indexOf("feature: 'resources.draft'"), ai.indexOf("feature: 'resources.draft'") + 400);
  const budget = seg => { const m = seg.match(/maxTokens: (\d+)/); return m ? parseInt(m[1], 10) : 0; };
  check('stpa.draft budget >= 16000 (floor — 6000 starved live on the reasoning model)', budget(stpaCall) >= 16000, String(budget(stpaCall)));
  check('resources.draft budget >= 16000 (floor)', budget(resCall) >= 16000, String(budget(resCall)));
  check('both callers name STARVATION honestly (max_tokens + empty text is not a parse failure)',
    /STPA draft starved/.test(ai) && /Resources draft starved/.test(ai) && (ai.match(/max_tokens/g) || []).length >= 2);
}

// ---- [5] wiring — floors, not literals (§7.3) -------------------------------
console.log('\n[wiring]');
{
  const lm = loader.match(/ai_assistant\.js\?v=([0-9.]+)/);
  check('loader carries ai_assistant ≥ 72.1', lm && parseFloat(lm[1]) >= 72.1, lm && lm[1]);
  const hm = html.match(/ai_loader\.js\?v=([0-9.]+)/);
  check('index pins ai_loader ≥ 5.1', hm && parseFloat(hm[1]) >= 5.1, hm && hm[1]);
  check('the why is written at the map (spec 78 / SL-ARC-0001 §22 named at the site)',
    /spec 78/.test(ai) && /SL-ARC-0001 §22/.test(ai));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
