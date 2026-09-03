#!/usr/bin/env node
/*
 * Regression — programme ID schemes drive numbering, manual and AI (2 Aug 2026).
 *
 * WAQAS'S RULING, encoded: Program Planning declares the FUNCTION ID scheme and
 * the FAILURE CONDITION ID scheme, at aircraft AND system level, and numbering
 * derives from those schemes everywhere — form entry and AI accepts alike.
 *
 * THE BUG THIS BURIES: the engine's own fcimMode template ({PARENT}-{MODE} —
 * the ARP4761A Q.3-2 shape, SF-02-PL) was DEAD ON EVERY PATH. The FCIM had no
 * _slAutoNumber key at all; sysFunc/sysFha were called by the AI accept paths
 * and fell through an empty switch; the AI's own allocator used the flat
 * failureCond kind with no context. A real project showed tool-minted FC-###
 * beside hand-typed SF02-PL — a human doing the engine's job by hand.
 *
 * Layers: [1] the engine, executed (it's require-able). [2] _slAutoNumber +
 * _slFillField extracted and executed against the REAL engine. [3] the AI
 * allocator speaks the same scheme (source pins — its body is executed by
 * regression_fcim_multiplicity). [4] the Program Planning card. [5] wiring.
 *
 * Run: node tests/regression_numbering_plan.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const PIN = require('./lib/pinfloor.js');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const N = require(path.join(SITE, 'numbering.js'));

// ---- [1] the engine mints the Q.3-2 shape, executed -------------------------
console.log('\n[nplan] engine: fcimMode with PARENT/MODE, executed');
{
  const st = N.newStore();
  check('DEFAULT_SCHEME fcimMode is the Q.3-2 shape {PARENT}-{MODE}',
    N.DEFAULT_SCHEME.templates.fcimMode.pattern === '{PARENT}-{MODE}');
  check('SF-02 + PL → SF-02-PL',
    N.makeId(N.DEFAULT_SCHEME, 'fcimMode', { PARENT: 'SF-02', MODE: 'PL' }, st) === 'SF-02-PL');
  check('multiplicity extras ride the same template: MODE M2 → SF-02-M2',
    N.makeId(N.DEFAULT_SCHEME, 'fcimMode', { PARENT: 'SF-02', MODE: 'M2' }, st) === 'SF-02-M2');
  check('no {SEQ} in the pattern ⇒ no counter consumed (derived kind)',
    Object.keys(st.seq).length === 0, JSON.stringify(st.seq));
}
console.log('\n[nplan] engine: {SYS} is the system-level form and collapses at aircraft level');
{
  // One template serves both levels — the ruling's "at both the system and
  // aircraft level" without two templates to keep in sync.
  const sch = N.cloneScheme(N.DEFAULT_SCHEME);
  sch.templates.failureCond = { type: 'FC', pattern: '{SYS}-{TYPE}-{SEQ:000}', counterScope: 'system' };
  sch.templates.fcimMode = { type: 'FM', pattern: '{SYS}-{PARENT}-{MODE}', counterScope: 'global', derived: true };
  const st = N.newStore();
  check('system level: SYS=FCS → FCS-FC-001',
    N.makeId(sch, 'failureCond', { SYS: 'FCS' }, st) === 'FCS-FC-001');
  check('aircraft level: SYS empty → separators collapse → FC-001',
    N.makeId(sch, 'failureCond', {}, st) === 'FC-001');
  check('counterScope system: NAV starts its own count at 001 while FCS is at 002',
    N.makeId(sch, 'failureCond', { SYS: 'NAV' }, st) === 'NAV-FC-001' &&
    N.makeId(sch, 'failureCond', { SYS: 'FCS' }, st) === 'FCS-FC-002');
  check('fcimMode with SYS: FCS-SF-02-PL / collapses to SF-02-PL at aircraft level',
    N.makeId(sch, 'fcimMode', { SYS: 'FCS', PARENT: 'SF-02', MODE: 'PL' }, st) === 'FCS-SF-02-PL' &&
    N.makeId(sch, 'fcimMode', { PARENT: 'SF-02', MODE: 'PL' }, st) === 'SF-02-PL');
  check('a derived PARENT+MODE template validates without {SEQ}; a non-derived one does not',
    N.validateTemplate('{PARENT}-{MODE}', { derived: true }).ok === true &&
    N.validateTemplate('{PARENT}-{MODE}', {}).ok === false);
}

// ---- [2] _slAutoNumber, extracted and run against the REAL engine -----------
console.log('\n[nplan] _slAutoNumber: the switch finally covers what its callers ask for');
{
  const hm = S('helpers_modules.js');
  const seg = (re) => { const m = hm.match(re); if (!m) throw new Error('extract failed: ' + re); return m[0]; };
  const src = seg(/function _slNumberCtx\(\)[\s\S]*?\n\}/) + '\n' +
              seg(/function _slAssignFuncId\(data\)[\s\S]*?\n\}/) + '\n' +
              // 31 Aug 2026 — the FHA branches now route through _slAssignFcId
              // (same-condition id reuse across flight phases, Waqas's ruling);
              // blank-desc rows still fall through to _slFillField, so every
              // expected id below is unchanged.
              seg(/function _slAssignFcId\(data, rows, ctx\)[\s\S]*?\n\}/) + '\n' +
              seg(/function _slBlank\(v\)[\s\S]*?\n\}/) + '\n' +
              seg(/function _slFillField\(kind, field, data, extraCtx[^)]*\)[\s\S]*?\n\}/) + '\n' +
              seg(/function _slAutoNumber\(key, data, ctx\)[\s\S]*?\n    return data;\n\}/);
  const mkSb = (scheme, activeSys) => {
    const sb = { console, Object, String, Array, JSON };
    sb.window = { SafetyLabNumbering: N };
    sb.slNumberingScheme = scheme; sb.slNumberingStore = N.newStore();
    sb.projectConfig = { programCode: 'AEOLUS' }; sb.acFunctionsData = [];
    sb.acFhaData = []; sb.sys = () => ({ fha: [] });   // 31 Aug — _slAssignFcId row scans
    if (activeSys !== undefined) sb.activeSystemId = activeSys;
    vm.createContext(sb);
    vm.runInContext(src + '\n; globalThis._an = _slAutoNumber;', sb);
    return sb;
  };
  // acFcim — the key that never existed. This is the screenshot bug's grave.
  const sb1 = mkSb(N.cloneScheme(N.DEFAULT_SCHEME));
  const d1 = sb1._an('acFcim', { subId: 'SF-02', tlDesc: 'total loss', plDesc: 'partial', mDesc: 'malf' });
  check('acFcim mints all three from the scheme: SF-02-TL / SF-02-PL / SF-02-M',
    d1.tlId === 'SF-02-TL' && d1.plId === 'SF-02-PL' && d1.mId === 'SF-02-M',
    [d1.tlId, d1.plId, d1.mId].join(', '));
  const d2 = sb1._an('acFcim', { subId: 'SF-03', plDesc: 'partial only', plId: 'HAND-TYPED' });
  check('manual entry respected; blank-desc cells stay blank',
    d2.plId === 'HAND-TYPED' && !d2.tlId && !d2.mId);
  const d3 = sb1._an('acFcim', { subId: 'SF-04', plDesc: 'p1', mDesc: 'm1',
    plExtra: [{ desc: 'p2' }], mExtra: [{ desc: 'm2' }, { desc: 'm3' }] });
  check('extras number after the primaries: PL2 / M2, M3 (Table A3 multiplicity)',
    d3.plExtra[0].id === 'SF-04-PL2' && d3.mExtra[0].id === 'SF-04-M2' && d3.mExtra[1].id === 'SF-04-M3',
    [d3.plExtra[0].id, d3.mExtra[0].id, d3.mExtra[1].id].join(', '));
  // sysFcim — SYS from explicit ctx, or from the open system folder.
  const schS = N.cloneScheme(N.DEFAULT_SCHEME);
  schS.templates.fcimMode = { type: 'FM', pattern: '{SYS}-{PARENT}-{MODE}', counterScope: 'global', derived: true };
  const sb2 = mkSb(schS, 'FCS');
  const d4 = sb2._an('sysFcim', { subId: 'SF-02', tlDesc: 't' });
  check('sysFcim carries SYS from the open system folder → FCS-SF-02-TL',
    d4.tlId === 'FCS-SF-02-TL', d4.tlId);
  const d5 = sb2._an('sysFcim', { subId: 'SF-02', plDesc: 'p' }, { SYS: 'NAV' });
  check('explicit ctx.SYS wins over the open folder → NAV-SF-02-PL',
    d5.plId === 'NAV-SF-02-PL', d5.plId);
  // sysFunc / sysFha — the branches whose absence made the AI calls fall through.
  const schF = N.cloneScheme(N.DEFAULT_SCHEME);
  schF.templates.failureCond = { type: 'FC', pattern: '{SYS}-{TYPE}-{SEQ:000}', counterScope: 'system' };
  const sb3 = mkSb(schF, 'FCS');
  check('sysFha no longer falls through: mints FCS-FC-001',
    sb3._an('sysFha', {}).fcId === 'FCS-FC-001');
  check('sysFunc no longer falls through: mints a funcId',
    !!sb3._an('sysFunc', {}).funcId);
  const sb4 = mkSb(N.cloneScheme(N.DEFAULT_SCHEME));
  check('acFha unchanged: FC-001 under the default scheme',
    sb4._an('acFha', {}).fcId === 'FC-001');
  check('engine absent ⇒ data returned untouched, no throw',
    (function () { const sb = mkSb(null); const d = sb._an('acFcim', { subId: 'SF-1', tlDesc: 'x' }); return d && !d.tlId; })());
}

// ---- [3] the AI allocator speaks the SAME scheme ----------------------------
console.log('\n[nplan] AI accept path: same kind, same context, same ids');
{
  const ai = S('ai_assistant.js');
  const fcid = (ai.match(/function _fcimFcId\(row, field, scanFcim, scanFha[^)]*\)[\s\S]*?\n    \}/) || [''])[0];
  check('_fcimFcId routes through _slFillField with the fcimMode kind',
    /_slFillField\('fcimMode', field, row/.test(fcid) && /typeof _slFillField === 'function'/.test(fcid));
  check('field→MODE map matches the form path: tlId/plId/mId → TL/PL/M',
    /\{ tlId: 'TL', plId: 'PL', mId: 'M' \}/.test(fcid));
  check('PARENT is the row sub-function — the {PARENT}-{MODE} shape needs it',
    /PARENT: row\.subId \|\| ''/.test(fcid));
  check('FC-### fallback survives for an absent engine',
    /'FC-' \+ String\(max \+ 1\)\.padStart\(3, '0'\)/.test(fcid));
  check('extras pass MODE PL2…/M2… through the same allocator',
    /MODE: \(k === 'plExtra' \? 'PL' : 'M'\) \+ \(i \+ 2\)/.test(ai));
  check('system-scoped accepts carry SYS into all three primaries and the extras',
    /const _sysCtx = \{ SYS: String\(s\._systemId \|\| ''\) \}/.test(ai) &&
    /_fcimFcId\(row, 'tlId', sys\.fcim, sys\.fha, _sysCtx\)/.test(ai) &&
    /_idExtras\(sys\.fcim, sys\.fha, _sysCtx\)/.test(ai));
}

// ---- [4] the Program Planning card ------------------------------------------
console.log('\n[nplan] Program Planning card: declare once, both levels previewed');
{
  const np = S('numbering_plan.js');
  check('born modular: wraps PROGRAM_PLAN.renderScopeSection (the real name), injects its own host',
    /window\.PROGRAM_PLAN && typeof window\.PROGRAM_PLAN\.renderScopeSection === 'function'/.test(np) &&
    /pp-idscheme-host/.test(np) && /_ppnWrapped/.test(np));
  // 31 Aug 2026 — SUPERSEDED: was "exactly three" (2 Aug ruling). Waqas, 31 Aug:
  // "node identities can be prescribed in the program planning by the user" —
  // the FTA node kinds (gate, basic event) join the card. The top event stays
  // OFF the card by the same-day ruling: its id IS the linked failure
  // condition's id, stated as a fixed rule, never a template.
  check('the five prescribable schemes: function, FC, FCIM cell, FTA gate, FTA basic event',
    /kind: 'subFunction'/.test(np) && /kind: 'failureCond'/.test(np) && /kind: 'fcimMode'/.test(np) &&
    /kind: 'gate'/.test(np) && /kind: 'basicEvent'/.test(np));
  check('the top-event rule is STATED, not offered as a template',
    /Top events carry no template/.test(np) && !/kind: 'topEvent'/.test(np));
  check('generateDisplayId honors the prescribed gate/basicEvent templates (the consumer exists)',
    /templates\[isGate \? 'gate' : 'basicEvent'\]/.test(S('helpers_modules.js')));
  check('preview renders BOTH levels through the engine\'s own expand()',
    /\.expand\(t\.pattern/.test(np) && /ex\(''\)/.test(np) && /ex\('FCS'\)/.test(np));
  check('apply writes through SafetyLabNumberingState and autosaves',
    /State\(\)\.setScheme\(w\)/.test(np) && /scheduleAutosave/.test(np));
  check('forward-only stated on the card; full editor still reachable',
    /existing ids never renumber/i.test(np) && /openNumberingEditor\(\)/.test(np));
  check('never a write on keystroke — input edits a working copy, only the button applies',
    /host\._working = w/.test(np) && !/addEventListener\('input'[\s\S]*?setScheme/.test(np.split("save.onclick")[0].split("addEventListener('input'")[1] || ''));
}

// ---- [5] wiring -------------------------------------------------------------
console.log('\n[nplan] wiring');
{
  const html = S('index.html'), loader = S('ai_loader.js');
  const tagAt = (re) => { const m = html.search(re); return m; };
  const planAt = tagAt(/<script src="numbering_plan\.js\?v=/);
  check('numbering_plan.js script tag present',
    planAt >= 0);
  check('…and loads AFTER program_plan.js and numbering_ui.js (it wraps the one, links the other)',
    planAt > tagAt(/<script src="program_plan\.js\?v=/) && planAt > tagAt(/<script src="numbering_ui\.js\?v=/));
  // §7.3 — floors, not literals.
  const pin = (f) => { const m = html.match(new RegExp('<script src="' + f + '\\?v=([0-9.]+)"')); return m ? m[1] : null; };
  check('helpers_modules pin bumped (≥2.24 — carries the new switch)', PIN.pinAtLeast(pin('helpers_modules.js'), '2.24'));
  check('ai_loader pin bumped (≥4.4)', PIN.pinAtLeast(pin('ai_loader.js'), '4.4'));
  const lm = loader.match(/ai_assistant\.js\?v=([0-9.]+)/);
  check('loader pulls ai_assistant ≥71.3 (carries the scheme-speaking allocator)',
    lm && PIN.pinAtLeast(lm[1], '71.3'), lm && lm[1]);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
