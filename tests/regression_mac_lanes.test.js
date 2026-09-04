#!/usr/bin/env node
/*
 * Regression — MAC as minimum acceptable CAPABILITY, and the three lanes one
 * declaration implies. Build 66.29.
 *
 * Waqas's model, 19 Aug 2026:
 *   outside MAC limits -> TOTAL LOSS   (the catastrophic condition)
 *   within  MAC limits -> PARTIAL LOSS (degraded — still its own lesser condition)
 *   malfunction        -> ITS OWN LANE, outside MAC bounds entirely
 * MAC is declared PER FUNCTION, and for CATASTROPHIC conditions only.
 *
 * His worked illustration — 3 flight control computers, 1 of 3 required for CSFL:
 *   total loss   all 3 lost        AND (3 of 3)   Catastrophic
 *   malfunction  2 of 3 erroneous  VOTING, k = 2  per the erroneous output
 *   partial loss any 1 lost        OR             Major
 * It is an ILLUSTRATION. Nothing here may become a preset, a default or a suggested
 * value — see the _NO_DEFAULTS section below, which is a real check, not a comment.
 *
 * The lane derivation is executed against the REAL clause arithmetic extracted from
 * misc_fn_modules.js — macBreachSetsChecked / macBreachSets — so "outside MAC" keeps
 * exactly one definition and this suite cannot drift from the engine.
 *
 * Run: node tests/regression_mac_lanes.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const L = require(path.join(SITE, 'mac_lanes.js'));
const misc = fs.readFileSync(path.join(SITE, 'misc_fn_modules.js'), 'utf8');
const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const lanesSrc = fs.readFileSync(path.join(SITE, 'mac_lanes.js'), 'utf8');

// ---- the REAL clause arithmetic, not a reimplementation ---------------------
const X = re => { const m = misc.match(re); if (!m) throw new Error('extraction failed: ' + re); return m[0]; };
const sb = { console, JSON, Math, Set, Array, Object, String, Number, isFinite, parseFloat, __o: {} };
vm.createContext(sb);
vm.runInContext('const MAC_COMBO_CAP = 50000;\n' +
  X(/function _macDegFor\(rule, sysId\) \{[\s\S]*?\n\}/) + '\n' +
  X(/function macClauseWeighted\(rule, cl\) \{[\s\S]*?\n\}/) + '\n' +
  X(/function macBreachSetsChecked\(rule\) \{[\s\S]*?\n\}/) + '\n' +
  X(/function macBreachSets\(rule\) \{[\s\S]*?\n\}/) +
  '\n;__o.bs = r => macBreachSets(r);', sb);
const breachOf = r => sb.__o.bs(r);

const RESOLVE = id => ({
  'SF-PITCH': { kind: 'function', label: 'Provide pitch control authority' },
  'SF-DECEL': { kind: 'function', label: 'Decelerate on ground' },
  fcc1: { kind: 'item', label: 'FCC 1' }, fcc2: { kind: 'item', label: 'FCC 2' }, fcc3: { kind: 'item', label: 'FCC 3' },
  f1: { kind: 'function', label: 'F1 decelerate wheels on ground' },
  f2: { kind: 'function', label: 'F2 aero brake on ground' },
  f3: { kind: 'function', label: 'F3 reverse thrust on ground' },
  'sys-fcs': { kind: 'system', label: 'Flight Control System' }
}[id] || { kind: 'unknown' });

const FCC = {
  subId: 'SF-PITCH',
  clauses: [{ of: ['fcc1', 'fcc2', 'fcc3'], min: 1 }],
  arbitration: { scheme: 'voting', k: 2 }
};
const key = s => s.slice().sort().join('+');
const keys = sets => sets.map(key).sort();

/* ========================================================================= */
console.log('\n[1] Waqas\'s illustration reproduces exactly — 3 FCCs, 1 of 3 for CSFL');
{
  const o = L.lanes(FCC, breachOf(FCC), 'Catastrophic', RESOLVE);

  check('the MAC hangs on a FUNCTION', o.fn.ok && o.fn.label === 'Provide pitch control authority');
  check('it is in scope — Catastrophic', o.inScope);

  check('TOTAL LOSS is all three — one set of order 3 (an AND of 3 of 3)',
    o.totalLoss.sets.length === 1 && o.totalLoss.order === 3 &&
    key(o.totalLoss.sets[0]) === 'fcc1+fcc2+fcc3', keys(o.totalLoss.sets).join(' '));

  check('PARTIAL LOSS is any one of the three — an OR over singles',
    o.partialLoss.gate === 'OR' && o.partialLoss.sets.length === 3 &&
    keys(o.partialLoss.sets).join(',') === 'fcc1,fcc2,fcc3', keys(o.partialLoss.sets).join(' '));

  check('MALFUNCTION is 2 of 3 — a VOTING gate at k = 2',
    o.malfunction.gate === 'VOTING' && o.malfunction.k === 2 && o.malfunction.sets.length === 3 &&
    keys(o.malfunction.sets).join(',') === 'fcc1+fcc2,fcc1+fcc3,fcc2+fcc3', keys(o.malfunction.sets).join(' '));

  check('the three lanes are DISJOINT — no set appears in two of them',
    (() => { const seen = new Set(); let dup = false;
      [o.totalLoss.sets, o.partialLoss.sets, o.malfunction.sets].forEach(g => g.forEach(s => {
        if (seen.has(key(s))) dup = true; seen.add(key(s)); })); return !dup; })());

  check('a clean declaration raises no findings', o.findings.length === 0,
    o.findings.map(f => f.kind).join(', '));
}

/* ========================================================================= */
console.log('\n[2] The malfunction threshold comes from ARBITRATION, never from the floor');
{
  const noArb = Object.assign({}, FCC, { arbitration: undefined });
  const o = L.lanes(noArb, breachOf(noArb), 'Catastrophic', RESOLVE);
  check('undeclared arbitration derives NO malfunction lane', o.malfunction.sets.length === 0);
  check('...and says why, instead of guessing a scheme',
    o.findings.some(f => f.kind === 'arbitration' && /does not come\s+from MAC|does not come from MAC/.test(f.msg)));

  // Same floor, different arbitration -> different malfunction lane. This is the
  // whole point: MAC cannot tell you what defeats the voter.
  const selfCheck = Object.assign({}, FCC, { arbitration: { scheme: 'none' } });
  const o2 = L.lanes(selfCheck, breachOf(selfCheck), 'Catastrophic', RESOLVE);
  check('scheme "none" — a single erroneous output propagates, so the gate is OR at k = 1',
    o2.malfunction.gate === 'OR' && o2.malfunction.k === 1 && o2.malfunction.sets.length === 3);
  check('the FLOOR is unchanged between the two — arbitration moved only the malfunction lane',
    keys(o2.totalLoss.sets).join(',') === keys(L.lanes(FCC, breachOf(FCC), 'Catastrophic', RESOLVE).totalLoss.sets).join(','));

  const bad = Object.assign({}, FCC, { arbitration: { scheme: 'voting', k: 9 } });
  const o3 = L.lanes(bad, breachOf(bad), 'Catastrophic', RESOLVE);
  check('k beyond the member count is refused, not clamped',
    o3.malfunction.sets.length === 0 && o3.findings.some(f => f.kind === 'arbitration'));

  const weird = Object.assign({}, FCC, { arbitration: { scheme: 'triplex-magic' } });
  check('an unrecognised scheme is refused and named',
    L.lanes(weird, breachOf(weird), 'Catastrophic', RESOLVE).findings.some(f => /triplex-magic/.test(f.msg)));
}

/* ========================================================================= */
console.log('\n[3] MAC is declared PER FUNCTION');
{
  const onSystem = { subId: 'sys-fcs', clauses: [{ of: ['sys-fcs'], min: 1 }] };
  const o = L.lanes(onSystem, breachOf(onSystem), 'Catastrophic', RESOLVE);
  check('a MAC hung on a system rather than a function is a finding',
    !o.fn.ok && o.findings.some(f => f.kind === 'not-per-function'));
  check('a bare SYSTEM member is a finding — a system has many functions with different minimums',
    !o.byFunction && o.findings.some(f => f.kind === 'member-not-function'));

  const aircraftLevel = { subId: 'SF-DECEL', clauses: [{ of: ['f1', 'f2', 'f3'], min: 2 }], arbitration: { scheme: 'none' } };
  const a = L.lanes(aircraftLevel, breachOf(aircraftLevel), 'Catastrophic', RESOLVE);
  check('aircraft-level members are SYSTEM FUNCTIONS (ARP Q.4-1 columns) and pass', a.byFunction);
  check('system-level members are the redundant providers and also pass',
    L.lanes(FCC, breachOf(FCC), 'Catastrophic', RESOLVE).byFunction);
  check('with no resolver the module holds no opinion rather than inventing one',
    L.lanes(onSystem, breachOf(onSystem), 'Catastrophic').byFunction !== false);
}

/* ========================================================================= */
console.log('\n[4] Scope — Catastrophic only');
{
  ['Hazardous', 'Major', 'Minor'].forEach(sev => {
    const o = L.lanes(FCC, breachOf(FCC), sev, RESOLVE);
    check('out of scope for ' + sev, !o.inScope && /Catastrophic conditions only/.test(o.scopeReason));
  });
  check('in scope for Catastrophic', L.lanes(FCC, breachOf(FCC), 'Catastrophic', RESOLVE).inScope);
  check('an unclassified condition is out of scope and says so',
    !L.lanes(FCC, breachOf(FCC), '', RESOLVE).inScope);
  check('out of scope still DERIVES the lanes — it is a finding, not a deletion',
    L.lanes(FCC, breachOf(FCC), 'Hazardous', RESOLVE).totalLoss.sets.length === 1,
    'the data exists and someone authored it on purpose');
}

/* ========================================================================= */
console.log('\n[5] "min 1 of 1" is NOT a single point of failure — the cry-wolf guard');
{
  // The Aeolus shape: 17 of 22 clauses are single-member. Reporting those as SPFs
  // would flag 20 of 29 CAT/HAZ conditions and train everyone to ignore the flag.
  const unmodelled = { subId: 'SF-PITCH', clauses: [{ of: ['fcc1'], min: 1 }], arbitration: { scheme: 'none' } };
  const u = L.lanes(unmodelled, breachOf(unmodelled), 'Catastrophic', RESOLVE);
  check('order 1 from a single-member clause reads as UNMODELLED architecture',
    u.totalLoss.order === 1 && u.findings.some(f => f.kind === 'unmodelled'));
  check('...and is explicitly NOT reported as a single point of failure',
    !u.findings.some(f => f.kind === 'spf'));

  const realSpf = { subId: 'SF-DECEL', clauses: [{ of: ['f1', 'f2', 'f3'], min: 3 }], arbitration: { scheme: 'none' } };
  const r = L.lanes(realSpf, breachOf(realSpf), 'Catastrophic', RESOLVE);
  check('order 1 from a MULTI-member clause IS reported as a single point of failure',
    r.totalLoss.order === 1 && r.findings.some(f => f.kind === 'spf'), keys(r.totalLoss.sets).join(' '));
}

/* ========================================================================= */
console.log('\n[6] Partial loss is derived from the same floor, and is never empty by accident');
{
  // min 2 of 3: losing one is within MAC (2 remain), losing two is outside.
  const twoOfThree = { subId: 'SF-DECEL', clauses: [{ of: ['f1', 'f2', 'f3'], min: 2 }], arbitration: { scheme: 'none' } };
  const o = L.lanes(twoOfThree, breachOf(twoOfThree), 'Catastrophic', RESOLVE);
  check('total loss is the PAIRS — order 2', o.totalLoss.order === 2 && o.totalLoss.sets.length === 3);
  check('partial loss is the SINGLES — within MAC, still a condition',
    o.partialLoss.sets.length === 3 && keys(o.partialLoss.sets).join(',') === 'f1,f2,f3');

  // min 1 of 1 — losing the only member IS the breach, so there is no within-MAC state.
  const single = { subId: 'SF-PITCH', clauses: [{ of: ['fcc1'], min: 1 }], arbitration: { scheme: 'none' } };
  const s = L.lanes(single, breachOf(single), 'Catastrophic', RESOLVE);
  check('with no redundancy there is no partial-loss state, and that is correct',
    s.partialLoss.sets.length === 0);
  check('a member that is itself a breach set never appears in the partial lane',
    !s.partialLoss.sets.some(x => key(x) === 'fcc1'));
}

/* ========================================================================= */
console.log('\n[7] _NO_DEFAULTS — the tool supplies machinery, never a suggested MAC');
{
  // Waqas: "this is just an example they will have to define their own minimal
  // acceptable configuration." A preset floor would be accepted without thought on
  // the one number the whole catastrophic case rests on.
  check('the module declares the no-defaults rule in its own header',
    /_NO_DEFAULTS/.test(lanesSrc) && /never supplies a suggested MAC|NEVER supplies a suggested MAC/i.test(lanesSrc));
  check('no default floor, min or k literal is baked in',
    !/min\s*[:=]\s*[0-9]/.test(lanesSrc.replace(/\/\*[\s\S]*?\*\//g, '')) &&
    !/floor\s*[:=]\s*[0-9]/.test(lanesSrc.replace(/\/\*[\s\S]*?\*\//g, '')));
  check('an empty rule derives nothing and reports it, rather than assuming a floor',
    (() => { const e = L.lanes({ subId: 'SF-PITCH', clauses: [] }, [], 'Catastrophic', RESOLVE);
      return e.totalLoss.sets.length === 0 && e.findings.some(f => f.kind === 'no-breach'); })());
  check('arbitration defaults to UNDECLARED, not to a scheme',
    L.arbitration({}).scheme === 'undeclared' && L.arbitration({}).declared === false);
}

/* ========================================================================= */
console.log('\n[8] Combinatorics are guarded, and the module stays pure');
{
  check('combinations refuses k > n rather than returning nonsense', L.combinations(['a', 'b'], 5).length === 0);
  check('combinations refuses k < 1', L.combinations(['a', 'b'], 0).length === 0);
  check('C(5,2) = 10', L.combinations(['a', 'b', 'c', 'd', 'e'], 2).length === 10);
  check('no DOM, storage or app globals in the module',
    !/document\.|localStorage|projectConfig|ftaPages|systemsData|showToast/.test(lanesSrc));
  check('it is loadable in node AND on window', typeof L.lanes === 'function' && /window\.SLMacLanes/.test(lanesSrc));
  check('the module is wired into index.html', /mac_lanes\.js\?v=/.test(idx));
  check('...and loads before the modules that will consume it',
    idx.indexOf('mac_lanes.js') > 0 && idx.indexOf('mac_lanes.js') < idx.indexOf('misc_fn_modules.js'));
}

/* ========================================================================= */
console.log('\n[9] The computed (MAC) lane in CoFFE — coffeComputed(), rewritten 66.29');
{
  // Rewritten to understand BOTH breach-token shapes (bare sysId = full loss,
  // 'deg:<sys>:<label>' = a named degraded level), to honour monotonicity, and to be
  // ready for a partial-loss state. It had NO test coverage before this section —
  // found while preparing to ship it.
  const sb2 = { console, JSON, Math, Set, Array, Object, String, Number, isFinite, parseFloat, __o: {} };
  vm.createContext(sb2);
  vm.runInContext('const MAC_COMBO_CAP = 50000;\nlet __RULES = [];\n' +
    'function _macStore(){ return __RULES; }\n' +
    X(/function _macDegFor\(rule, sysId\) \{[\s\S]*?\n\}/) + '\n' +
    X(/function macClauseWeighted\(rule, cl\) \{[\s\S]*?\n\}/) + '\n' +
    X(/function macBreachSetsChecked\(rule\) \{[\s\S]*?\n\}/) + '\n' +
    X(/function macBreachSets\(rule\) \{[\s\S]*?\n\}/) + '\n' +
    X(/function _coffeBreachSetsForFc\(fc\) \{[\s\S]*?\n\}/) + '\n' +
    // 4 Sep 2026 — tokens resolve to their owner system (MAC members are system functions since B6)
    'let systemsData = [];\n' +
    X(/function _coffeTokSys\(tok\) \{[\s\S]*?\n\}/) + '\n' +
    X(/function _coffeDegSys\(tok\) \{[\s\S]*?\n\}/) + '\n' +
    X(/function coffeComputed\(fc, kase\) \{[\s\S]*?\n\}/) +
    '\n;__o.setRules = r => { __RULES = r; };' +
    '\n __o.calc = parts => coffeComputed({ internalId: 1, subId: "SF-X" }, { parts, key: "k" });', sb2);

  const FC = { internalId: 1, subId: 'SF-X' };
  const P = (sys, state) => ({ sysId: sys, state });

  // A weighted clause so the breach sets contain BOTH token shapes.
  sb2.__o.setRules([{ id: 'r', subId: 'SF-X',
    clauses: [{ of: ['a', 'b', 'c'], min: 2, floor: 2, weights: { a: 1, b: 1, c: 1 } }],
    degraded: [{ sysId: 'a', label: 'half', weight: 0.5 }] }]);

  check('a total-loss pair covering a bare-token breach set computes YES',
    sb2.__o.calc([P('b', 'total loss'), P('c', 'total loss')]) === 'yes');
  check('MONOTONICITY — total loss satisfies a deg: requirement (losing it is worse than degrading it)',
    sb2.__o.calc([P('a', 'total loss'), P('b', 'total loss')]) === 'yes');
  check('a PARTIAL-loss part satisfies a deg: requirement',
    sb2.__o.calc([P('a', 'partial loss'), P('b', 'total loss')]) === 'yes');
  check('a PARTIAL-loss part does NOT satisfy a full-loss requirement',
    sb2.__o.calc([P('b', 'partial loss'), P('c', 'partial loss')]) === 'no',
    'degrading two members must not be read as losing them');
  check('a single loss that does not reach any breach set computes NO',
    sb2.__o.calc([P('b', 'total loss')]) === 'no');
  check('MALFUNCTION has no computed lane — MAC models availability, not adverse action',
    sb2.__o.calc([P('b', 'malfunction')]) === null);
  check('...even mixed with a loss', sb2.__o.calc([P('b', 'total loss'), P('c', 'malfunction')]) === null);

  sb2.__o.setRules([]);
  check('no MAC model at all — no computed lane, rather than a false NO',
    sb2.__o.calc([P('b', 'total loss')]) === null);

  // coffeShortestRoute must apply the SAME cry-wolf guard as SLMacLanes, or the two
  // disagree about the same project. Caught live on Aeolus FC-01: mac_lanes said
  // "unmodelled", coffeShortestRoute said "hard finding".
  check('coffeShortestRoute carries the single-member-clause guard',
    /out\.singleMemberClause = rules\.some/.test(misc) &&
    /out\.hard = \(out\.order === 1 \|\| out\.modelOrder === 1\) &&\s*\n\s*!out\.singleMemberClause/.test(misc));
  check('...and reports the unmodelled case separately rather than silently dropping it',
    /out\.unmodelled = \(out\.order === 1 \|\| out\.modelOrder === 1\) && out\.singleMemberClause/.test(misc));

  check('the deg: token parser survives a label containing a colon',
    (() => { const src = misc.match(/function _coffeDegSys\(tok\) \{[\s\S]*?\n\}/)[0];
      const f = new Function('_coffeTokSys', 'return ' + src)(x => x); return f('deg:sysA:lvl:2') === 'sysA'; })());
  // 4 Sep 2026 (F15) — the computed lane sees FUNCTION-member rules through the owner system.
  {
    const sb3 = { console, JSON, Math, Set, Array, Object, String, Number, isFinite, parseFloat, __o: {} };
    vm.createContext(sb3);
    vm.runInContext('const MAC_COMBO_CAP = 50000;\nlet __RULES = [];\nfunction _macStore(){ return __RULES; }\n' +
      'let systemsData = [{ id: "sys-fcs", functions: [{ funcId: "FCS-F1" }, { funcId: "FCS-F2" }] }, { id: "sys-hyd", functions: [{ funcId: "HYD-F1" }] }];\n' +
      'function _idpFnOwner(id){ for (const s of systemsData) { const f = (s.functions||[]).find(x => x.funcId === id); if (f) return { system: s, fn: f }; } return null; }\n' +
      X(/function _macDegFor\(rule, sysId\) \{[\s\S]*?\n\}/) + '\n' + X(/function macClauseWeighted\(rule, cl\) \{[\s\S]*?\n\}/) + '\n' +
      X(/function macBreachSetsChecked\(rule\) \{[\s\S]*?\n\}/) + '\n' + X(/function macBreachSets\(rule\) \{[\s\S]*?\n\}/) + '\n' +
      X(/function _coffeBreachSetsForFc\(fc\) \{[\s\S]*?\n\}/) + '\n' + X(/function _coffeTokSys\(tok\) \{[\s\S]*?\n\}/) + '\n' +
      X(/function _coffeDegSys\(tok\) \{[\s\S]*?\n\}/) + '\n' + X(/function coffeComputed\(fc, kase\) \{[\s\S]*?\n\}/) +
      '\n__RULES = [{ id: "r", subId: "SF-X", clauses: [{ min: 1, of: ["FCS-F1", "FCS-F2"] }, { min: 1, of: ["HYD-F1"] }] }];' +
      '\n__o.calc = parts => coffeComputed({ internalId: 1, subId: "SF-X" }, { parts, key: "k" });', sb3);
    check('a MAC rule whose members are system FUNCTIONS is seen by CoFFE through the owner system: total loss of Flight Control breaches "1 of [FCS-F1, FCS-F2]"',
      sb3.__o.calc([{ sysId: 'sys-fcs', state: 'total loss' }]) === 'yes');
    check('… total loss of hydraulics breaches its single-member clause', sb3.__o.calc([{ sysId: 'sys-hyd', state: 'total loss' }]) === 'yes');
    check('… and a system the rule does not name computes "no", not null', sb3.__o.calc([{ sysId: 'sys-other', state: 'total loss' }]) === 'no');
  }
}

console.log('\n' + (fail === 0 ? 'ALL GREEN — ' + pass + ' checks' : 'RED — ' + fail + ' failed, ' + pass + ' passed'));
process.exit(fail === 0 ? 0 : 1);
