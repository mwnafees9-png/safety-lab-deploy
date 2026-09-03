#!/usr/bin/env node
/*
 * Regression — the 2 Aug FCIM redo findings, all seven + doctrine.
 *
 * Everything here was caught LIVE during Waqas's HL-1 FCIM redo:
 *   1. §8 FIFTH instance — _runFcim's mapper dropped malfunctions[]/partials[].
 *   2. Derived-template id collision — aware/unaware pairs both minted SF-03-TL.
 *   3. Token starvation — 12 functions × reasoning model × 8000 maxTokens ⇒
 *      stopReason max_tokens with ZERO text.
 *   4. Thin grounding — aircraft scope carried no existing-row context, so a
 *      redo abstained on PL/M.
 *   5. numbering_plan card never rendered on a plain SPP visit (closure path).
 *   6. Rename-Detected cards went stale (slots frozen at scan time).
 *   7. The learning loop read from an empty well — 533 records, 0 edits ever,
 *      because only in-panel edits were captured and real corrections happen
 *      in the worksheet after accept-all.
 * Plus _SPEC_FCIM doctrine: implementation-agnostic wording, per-condition
 * awareness dismissal (rationale → assumptions), axis malfunction pairs.
 *
 * Run: node tests/regression_fcim_rulings.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const PIN = require('./lib/pinfloor.js');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const N = require(path.join(SITE, 'numbering.js'));
const ai = S('ai_assistant.js'), hm = S('helpers_modules.js'), sup = S('support_modules.js'),
      rg = S('rename_guard.js'), np = S('numbering_plan.js'), html = S('index.html');

// ---- [1] collision guard, executed against the REAL engine ------------------
console.log('\n[rulings] id-collision guard: aware/unaware pairs never share an id');
{
  const seg = re => { const m = hm.match(re); if (!m) throw new Error('extract failed: ' + re); return m[0]; };
  const src = seg(/function _slNumberCtx\(\)[\s\S]*?\n\}/) + '\n' +
              seg(/function _slAssignFuncId\(data\)[\s\S]*?\n\}/) + '\n' +
              seg(/function _slBlank\(v\)[\s\S]*?\n\}/) + '\n' +
              seg(/function _slFillField\(kind, field, data, extraCtx[^)]*\)[\s\S]*?\n\}/) + '\n' +
              seg(/function _slAutoNumber\(key, data, ctx\)[\s\S]*?\n    return data;\n\}/);
  const sb = { console, Object, String, Array, JSON, Set, parseInt };
  sb.window = { SafetyLabNumbering: N };
  sb.slNumberingScheme = N.cloneScheme(N.DEFAULT_SCHEME);
  sb.slNumberingStore = N.newStore();
  sb.projectConfig = { programCode: 'AEOLUS' }; sb.acFunctionsData = [];
  sb.acFcimData = [];
  vm.createContext(sb);
  vm.runInContext(src + '\n; globalThis._an = _slAutoNumber;', sb);
  // aware row lands in the store, then the unaware row of the SAME sub-function
  const aware = sb._an('acFcim', { subId: 'SF-03', tlDesc: 't', plDesc: 'p', mDesc: 'm' });
  sb.acFcimData.push(aware);
  const unaware = sb._an('acFcim', { subId: 'SF-03', tlDesc: 'undetected t', plDesc: 'latent p' });
  check('the pair that collided live now suffixes: TL2 / PL2',
    aware.tlId === 'SF-03-TL' && unaware.tlId === 'SF-03-TL2' && unaware.plId === 'SF-03-PL2',
    [aware.tlId, unaware.tlId, unaware.plId].join(', '));
  sb.acFcimData.push(unaware);
  // extras never stack digits: a PL2 collision continues PL3, not PL22
  const third = sb._an('acFcim', { subId: 'SF-03', plDesc: 'p3', plExtra: [{ desc: 'p4' }] });
  check('trailing digits continue (PL3, PL4), never stack (no PL22)',
    third.plId === 'SF-03-PL3' && third.plExtra[0].id === 'SF-03-PL4',
    [third.plId, third.plExtra[0].id].join(', '));
  check('no digit-stacked ids anywhere', ![aware, unaware, third].some(r =>
    [r.tlId, r.plId, r.mId].concat((r.plExtra||[]).map(e=>e.id)).filter(Boolean).some(id => /\d\d$/.test(id) && !/[A-Z]\d+$/.test(id))));
  // within one row nothing self-collides either
  const one = sb._an('acFcim', { subId: 'SF-09', tlDesc: 't', plDesc: 'p', mDesc: 'm', mExtra: [{ desc: 'm2' }, { desc: 'm3' }] });
  const ids = [one.tlId, one.plId, one.mId, one.mExtra[0].id, one.mExtra[1].id];
  check('one rich row: five distinct ids', ids.every(Boolean) && new Set(ids).size === 5, ids.join(', '));
  check('AI path builds the same guard: existsFn from scan arrays into _slFillField',
    /_usedNow = new Set\(\)/.test(ai) && /_slFillField\('fcimMode', field, row, Object\.assign[\s\S]{0,120}function \(id\) \{ return _usedNow\.has\(id\); \}\)/.test(ai));
}

// ---- [2] §8 fifth instance — the mapper carries the arrays ------------------
console.log('\n[rulings] _runFcim mapper: malfunctions[]/partials[] survive the panel path');
{
  const fn = (ai.match(/async function _runFcim\(scope, funcs, opts\)[\s\S]*?_makeReviewPanel\(\{/) || [''])[0];
  check('mapper passes the arrays through',
    /malfunctions: _arr\(x\.malfunctions\) \|\| undefined/.test(fn) && /partials: _arr\(x\.partials\) \|\| undefined/.test(fn));
  check('filter keeps a row whose ONLY content is an array',
    /\(_arr\(x\.malfunctions\) \|\| \[\]\)\.length \|\| \(_arr\(x\.partials\) \|\| \[\]\)\.length/.test(fn));
  check('review cards render every array entry, numbered',
    /Partial Loss ' \+ \(pi \+ 1\)/.test(ai) && /Malfunction ' \+ \(mi \+ 1\)/.test(ai));
  check('token budget raised (16000) and batch cap lowered (8) — the starvation pair',
    /maxTokens: 16000/.test(fn) && /opts\.limit \|\| 8\b/.test(fn));
  check('redo grounding: existing rows ride into the prompt, severities stripped',
    /EXISTING FCIM ROW\(S\) TO RESTATE/.test(fn) && /Catastrophic\|Hazardous\|Major\|Minor\|No safety effect/.test(fn));
  check('grounding severity-strip actually strips, executed', (function () {
    // the strip body itself contains ';' inside a character class — span to .trim()
    const m = fn.match(/const strip = (function \(s\) \{ return String[\s\S]*?\.trim\(\); \})/);
    if (!m) return false;
    const f = vm.runInNewContext('(' + m[1] + ')', { String });
    return f('Reduced roll rate — Minor, screened') === 'Reduced roll rate' && f('plain condition') === 'plain condition';
  })());
}

// ---- [3] _SPEC_FCIM doctrine — the three rulings ----------------------------
console.log('\n[rulings] _SPEC_FCIM carries the 2 Aug doctrine');
{
  const spec = (ai.match(/const _SPEC_FCIM = \[[\s\S]*?\]\.join/) || [''])[0];
  check('implementation-agnostic: component-noun ban with the live wrong/right pairs',
    /IMPLEMENTATION-AGNOSTIC WORDING/.test(spec) && /no rudder \/ spoiler \/ elevator/.test(spec) &&
    /partial loss of yaw control authority/.test(spec) && /complete loss of thrust generation/.test(spec));
  check('awareness dismissal is per-condition; rationale goes to ASSUMPTIONS, row stays Aware',
    /AWARENESS DISMISSAL IS PER-CONDITION/.test(spec) && /NEVER emit an N\/A row carrying prose rationale/.test(spec) &&
    /ASSUMPTIONS block and emit the row as Aware with an EMPTY rationale/.test(spec));
  check('axis malfunctions come in pairs (erroneous + uncommanded), unaware variants included',
    /CONTROL-AXIS MALFUNCTIONS COME IN PAIRS/.test(spec) && /erroneous response to crew command/.test(spec) &&
    /uncommanded motion with no command/.test(spec) && /also appears on the Unaware row/.test(spec));
  check('no severity words in cells, stated in the spec itself',
    /NO SEVERITY WORDS IN CELLS/.test(spec));
}

// ---- [4] worksheet-edit capture — the learning loop finally fed -------------
console.log('\n[rulings] A14b: worksheet edits of AI rows become correction deltas, executed');
{
  const m = sup.match(/function _slCaptureAiEdit\(oldRow, newRow, crudKey\)[\s\S]*?\n\}/);
  check('capture function exists and is exported for callers + tests', !!m && /window\._slCaptureAiEdit = _slCaptureAiEdit/.test(sup));
  const added = [];
  const sb = { console, Object, String, Array, Date, JSON };
  sb.window = { AiMemory: { add: r => added.push(r) }, SafetyLabAI: { memoryRefresh: () => { sb._refreshed = true; } } };
  sb.projectConfig = { isITARControlled: false };
  vm.createContext(sb);
  vm.runInContext(m[0] + '\n; globalThis._cap = _slCaptureAiEdit;', sb);
  const oldRow = { internalId: 7, aiGenerated: true, aiFeature: 'fcim.populate', subId: 'SF-02',
    tlId: 'SF-02-TL', plDesc: 'Reduced roll rate with one spoiler group inoperative', mDesc: 'Uncommanded roll' };
  const newRow = Object.assign({}, oldRow, { plDesc: 'Reduced roll control authority' });
  const rec = sb._cap(oldRow, newRow, 'acFcim');
  check('an edited AI row records a corr.v1 edit delta with the drafted→wrote diff',
    !!rec && rec.action === 'edit' && rec.kind === 'delta' && rec.feature === 'fcim.populate' &&
    rec.item.diff.length === 1 && rec.item.diff[0].field === 'plDesc' &&
    /spoiler group/.test(rec.item.diff[0].from) && rec.item.diff[0].to === 'Reduced roll control authority',
    JSON.stringify(rec && rec.item));
  check('…the exact shape _memoryExemplars retrieves (kind delta + action edit + diff[])',
    added.length === 1 && added[0].meta.schema === 'corr.v1' && added[0].meta.source === 'worksheet-edit' && added[0].meta.controlled === false);
  check('retrieval cache refreshed when the AI lane is loaded', sb._refreshed === true);
  check('id fields and ai-provenance fields never enter the diff', (function () {
    const r = sb._cap(oldRow, Object.assign({}, oldRow, { tlId: 'HAND', aiModel: 'x' }), 'acFcim');
    return r === null;
  })());
  check('a non-AI row records nothing', sb._cap({ internalId: 1, plDesc: 'a' }, { internalId: 1, plDesc: 'b' }, 'acFcim') === null);
  check('an untouched row records nothing', sb._cap(oldRow, Object.assign({}, oldRow), 'acFcim') === null);
  check('ITAR-controlled projects are tagged so retrieval can exclude them', (function () {
    const sb2 = { console, Object, String, Array, Date, JSON };
    sb2.window = { AiMemory: { add: r => sb2._rec = r } }; sb2.projectConfig = { isITARControlled: true };
    vm.createContext(sb2); vm.runInContext(m[0] + '\n; globalThis._cap = _slCaptureAiEdit;', sb2);
    sb2._cap(oldRow, newRow, 'acFcim');
    return sb2._rec && sb2._rec.meta.controlled === true;
  })());
  check('makeCRUD submit routes edits through the capture BEFORE replacing the row',
    /_slCaptureAiEdit\(arr\[idx\], data, key\)/.test(sup) &&
    sup.indexOf('_slCaptureAiEdit(arr[idx], data, key)') < sup.indexOf('if (idx >= 0) arr[idx] = data; else arr.push(data);'));
}

// ---- [5] rename guard freshness, executed -----------------------------------
console.log('\n[rulings] rename guard: apply + render re-verify against LIVE data');
{
  const sb = { console, Object, String, Array, JSON, Set, Date, setTimeout: () => 0, clearTimeout: () => 0 };
  sb.window = sb; sb.globalThis = sb;
  sb.acFhaData = []; sb.acFcimData = []; sb.acReqData = []; sb.systemsData = [];
  sb.projectConfig = {};
  vm.createContext(sb);
  vm.runInContext(rg, sb);
  // stale slots point at an object that was ALREADY fixed; the live data has a
  // DIFFERENT row still referencing the old id — fresh enumeration must find it.
  const fixedRow = { tlId: 'NEW-01' };                       // stale slot target (already clean)
  const missedRow = { tlId: 'FC-99' };                       // the reference the stale scan never saw
  sb.acFcimData.push(fixedRow, missedRow);
  const n = sb.rgApply({ kind: 'fcId', from: 'FC-99', to: 'NEW-01B', refs: [{ obj: fixedRow, field: 'tlId' }] });
  check('rgApply re-enumerates: updates the LIVE reference the stale slot list missed',
    n === 1 && missedRow.tlId === 'NEW-01B' && fixedRow.tlId === 'NEW-01', 'updated=' + n);
  check('renders prune already-clean cards instead of showing them forever',
    /_queue = _queue\.filter\(r => \{/.test(rg) && /return \(r\.refs \|\| \[\]\)\.length > 0;/.test(rg));
}

// ---- [6] numbering card renders on a plain Program Planning visit -----------
console.log('\n[rulings] numbering_plan v1.1: the card is there when the page is');
{
  check('switchTab wrapped (the internal-closure path the export wrap missed)',
    /window\.switchTab\._ppnWrapped/.test(np) && /tabId === 'spp'/.test(np));
  check('boot render attempt (early-returns until view + engine exist)',
    /setTimeout\(_render, 300\)/.test(np));
  check('the export wrap stays (external re-renders still refresh the card)',
    /renderScopeSection\._ppnWrapped/.test(np));
}

// ---- [7] wiring — floors, not literals --------------------------------------
console.log('\n[rulings] wiring');
{
  const pin = f => { const m = html.match(new RegExp('<script src="' + f + '\\?v=([0-9.]+)"')); return m ? m[1] : null; };
  check('support_modules ≥66.19 (carries the capture)', PIN.pinAtLeast(pin('support_modules.js'), '66.19'));
  check('helpers_modules ≥2.25 (carries the guard)', PIN.pinAtLeast(pin('helpers_modules.js'), '2.25'));
  check('rename_guard ≥1.2', PIN.pinAtLeast(pin('rename_guard.js'), '1.2'));
  check('numbering_plan ≥1.1', PIN.pinAtLeast(pin('numbering_plan.js'), '1.1'));
  check('ai_loader ≥4.5 pulling ai_assistant ≥71.4', PIN.pinAtLeast(pin('ai_loader.js'), '4.5') &&
    PIN.atLeast(S('ai_loader.js'), 'ai_assistant.js', '71.4'));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
