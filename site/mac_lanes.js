/* ============================================================================
 * mac_lanes.js — v1.1 — MAC as MINIMUM ACCEPTABLE CONFIGURATION, and the three
 * failure conditions one declaration implies.
 * ----------------------------------------------------------------------------
 * Waqas's model, 19 Aug 2026:
 *
 *   MAC is the MINIMUM ACCEPTABLE CONFIGURATION for a FUNCTION, and it is defined
 *   for CATASTROPHIC conditions only.
 *
 *   THE NAME IS A DELIBERATE SWITCH, AND v1.0 GOT IT WRONG (corrected 19 Aug 2026).
 *   The industry term is minimum acceptable CONTROL — control authority, as used in
 *   flight controls, propulsion and braking. Waqas moved off it deliberately:
 *   "minimum acceptable configuration (so it was wide ranging for systems that do
 *   not contribute to aircraft control but can impact CSFL, example ECS) is what we
 *   were going with and it was a switch from the minimum acceptable control".
 *   ECS has no control authority at all, and losing cabin pressurisation or avionics
 *   cooling is still a CSFL problem — so the question has to be "which set of
 *   equipment must remain available", which is a CONFIGURATION. That is also
 *   literally what a `min k of n` floor encodes.
 *   v1.0 of this file wrote "capability", which was neither term and drifted from
 *   the rest of the app — reports.js, bindings_modules.js, safety_lab.js, mac_fcim.js
 *   and both demo showcases have said "Minimum Acceptable Configuration" throughout.
 *
 *   MAC IS DECLARED PER FUNCTION (Waqas, 19 Aug: "make sure mac lanes are defined
 *   by function" / "per function*"). ONE MAC per function, and the three lanes are
 *   derived FOR THAT FUNCTION: total loss of it, partial loss of it, malfunction of
 *   it. `rule.subId` IS the function the floor protects — a rule whose subId does
 *   not resolve to a function is a finding.
 *
 *   The clause MEMBERS are whatever must remain available for that function, and
 *   the right kind depends on the level:
 *     · aircraft-level MAC — members are SYSTEM FUNCTIONS. ARP4761A Q.4-1/Q.4-2
 *       columns are exactly this ("F1 decelerate wheels on ground"), which is also
 *       the granularity the interdependence table needs, so the two move together.
 *     · system-level MAC — members are the redundant providers of that one function
 *       (three flight control computers supplying pitch-control computation).
 *   What a member may NEVER be is a bare SYSTEM standing in for a function. A system
 *   performs several functions with different minimums, so a system-level member
 *   cannot express a floor at all. `validateMembers()` flags those.
 *
 *     outside MAC limits  ->  TOTAL LOSS      (the catastrophic condition)
 *     within  MAC limits  ->  PARTIAL LOSS    (degraded, its own lesser condition)
 *     malfunction         ->  ITS OWN LANE, outside MAC bounds entirely
 *
 * His worked illustration — 3 flight control computers, 1 of 3 required for CSFL.
 * NOT a rule, NOT a preset, NOT a default: every programme declares its own MAC.
 *
 *   | lane         | condition              | top gate      | severity      |
 *   | total loss   | all 3 lost             | AND (3 of 3)  | Catastrophic  |
 *   | malfunction  | 2 of 3 erroneous       | VOTING, k = 2 | per the output|
 *   | partial loss | any 1 lost             | OR            | Major         |
 *
 * THREE THINGS THAT FOLLOW, and they are why this file exists.
 *
 * 1. ONE DECLARATION, THREE CONDITIONS. The lanes are three DIFFERENT failure
 *    conditions at three different severities, so they are three different TOP
 *    EVENTS — not three branches of one tree. Generating them is the headstart:
 *    a programme states "3 FCCs, min 1 of 3" and gets the AND, the OR and the
 *    voting gate without drawing any of them.
 *
 * 2. THE MALFUNCTION THRESHOLD DOES NOT COME FROM MAC. MAC gives the availability
 *    floor (1 of 3). The malfunction gate comes from how the redundancy is
 *    ARBITRATED — 2-of-3 voting means two erroneous units outvote the healthy one.
 *    A self-checking pair would passivate a single erroneous unit and need a
 *    different combination entirely. So a redundancy group carries a SECOND
 *    declaration alongside the floor: `rule.arbitration`. Undeclared is a finding,
 *    never a guess — see _NO_DEFAULTS below.
 *
 * 3. PARTIAL LOSS IS NOT "ACCEPTABLE". It is acceptable *for CSFL*. It is still a
 *    classified failure condition in its own right, with its own top event. Within
 *    MAC means "not the catastrophic condition", not "no condition".
 *
 * _NO_DEFAULTS — a standing rule for this file. The tool supplies the MACHINERY
 * (floor, weights, arbitration, lanes, gates). It NEVER supplies a suggested MAC
 * value, a default arbitration scheme or a preset k. If the tool proposes a floor,
 * people accept it without reasoning about it — and that is the one number the
 * entire catastrophic case rests on. Blank and required, not pre-filled.
 *
 * Pure derivation: no DOM, no storage, no side effects. Exposed as
 * window.SLMacLanes (browser) and module.exports (node tests).
 * ==========================================================================*/
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SLMacLanes = api;
}(this, function () {
  'use strict';

  var LANES = ['total-loss', 'partial-loss', 'malfunction'];

  // ---------------------------------------------------------------- helpers
  function isDegToken(t) { return String(t).indexOf('deg:') === 0; }
  function degSys(t) {
    if (!isDegToken(t)) return null;
    var rest = String(t).slice(4), i = rest.indexOf(':');
    return i < 0 ? rest : rest.slice(0, i);
  }
  // ------------------------------------------------------- member granularity
  // Members MUST be system functions. The caller supplies a resolver so this module
  // stays free of app globals:
  //   resolve(id) -> { kind: 'function' | 'system' | 'unknown', label, systemId }
  // A system-level member is a finding, not an error: the data exists, someone
  // authored it, and it needs re-pointing at the function it was really about.
  function validateMembers(rule, resolve) {
    var out = { ok: true, functions: [], systems: [], unknown: [], findings: [] };
    if (typeof resolve !== 'function') return out;   // no resolver -> no opinion
    members(rule).forEach(function (m) {
      var r = resolve(m) || {};
      // 'function' (aircraft-level MAC) and 'item' (system-level MAC) are both valid
      // providers. Only a bare system is too coarse to carry a floor.
      if (r.kind === 'function' || r.kind === 'item') { out.functions.push(m); return; }
      if (r.kind === 'system') {
        out.systems.push(m); out.ok = false;
        out.findings.push({ kind: 'member-not-function', member: m,
          msg: '"' + (r.label || m) + '" is a SYSTEM. MAC is declared per system FUNCTION — a ' +
               'system performs several functions and the minimum acceptable configuration differs ' +
               'for each, so a system-level member cannot express a floor. Re-point it at the ' +
               'system FUNCTION (aircraft-level MAC) or at the specific provider (system-level MAC).' });
        return;
      }
      out.unknown.push(m); out.ok = false;
      out.findings.push({ kind: 'member-unresolved', member: m,
        msg: 'Member "' + m + '" resolves to nothing — it may have been deleted or renamed.' });
    });
    return out;
  }

  function members(rule) {
    var out = [];
    (rule && rule.clauses || []).forEach(function (cl) {
      (cl && cl.of || []).forEach(function (m) { if (out.indexOf(m) === -1) out.push(m); });
    });
    return out;
  }
  function setKey(s) { return s.slice().sort().join('|'); }

  // ---------------------------------------------------------------- scoping
  // MAC is a Catastrophic-condition concept. A rule hung on a Hazardous or Major
  // condition is not an error to delete — it is a finding to surface, because the
  // data exists and someone put it there on purpose.
  // One MAC per FUNCTION. `rule.subId` is that function; a rule that does not resolve
  // to one has nothing to declare a minimum for.
  function functionOf(rule, resolve) {
    var id = rule && rule.subId;
    if (!id) return { ok: false, id: null, label: null, finding: 'This MAC declares no function (`subId` is empty). A minimum acceptable configuration is always the minimum FOR a function.' };
    if (typeof resolve !== 'function') return { ok: true, id: id, label: id, finding: null };
    var r = resolve(id) || {};
    if (r.kind === 'function') return { ok: true, id: id, label: r.label || id, finding: null };
    return { ok: false, id: id, label: r.label || id,
             finding: 'MAC is declared per function, but "' + (r.label || id) + '" resolves to ' +
                      (r.kind ? ('a ' + r.kind) : 'nothing') + '. Hang this MAC on the function whose minimum acceptable configuration it states.' };
  }

  function scope(rule, severity) {
    var sev = String(severity || '');
    if (!sev) return { inScope: false, reason: 'no failure condition found for this function — classify it first' };
    if (/Catastrophic/i.test(sev)) return { inScope: true, reason: null };
    return {
      inScope: false,
      reason: 'MAC is defined for Catastrophic conditions only; this condition is ' + sev +
              '. A minimum acceptable configuration is the floor below which the aircraft is lost — ' +
              'a lesser condition needs a different treatment, not a floor.'
    };
  }

  // ---------------------------------------------------------------- arbitration
  // Shape: { scheme: 'voting' | 'none', k: <int>, of: [members] }
  //   voting  — k erroneous units defeat the arbitration (2 of 3 outvote 1)
  //   none    — no arbitration; a single erroneous output propagates
  // Anything else, including absent, is UNDECLARED. Undeclared derives no lane and
  // reports a finding. It never falls back to a guess (_NO_DEFAULTS).
  function arbitration(rule) {
    var a = rule && rule.arbitration;
    var of = (a && Array.isArray(a.of) && a.of.length) ? a.of.slice() : members(rule);
    if (!a || !a.scheme) {
      return { declared: false, scheme: 'undeclared', k: null, of: of,
               finding: 'No arbitration scheme declared. The malfunction threshold does not come ' +
                        'from MAC — it comes from how this redundancy is arbitrated — so the ' +
                        'malfunction lane cannot be derived until it is stated.' };
    }
    if (a.scheme === 'none') return { declared: true, scheme: 'none', k: 1, of: of, finding: null };
    if (a.scheme === 'voting') {
      var k = parseInt(a.k, 10);
      if (!(k >= 1) || k > of.length) {
        return { declared: false, scheme: 'voting', k: null, of: of,
                 finding: 'Voting arbitration declared with k=' + a.k + ' over ' + of.length +
                          ' members — k must be between 1 and the member count.' };
      }
      return { declared: true, scheme: 'voting', k: k, of: of, finding: null };
    }
    return { declared: false, scheme: String(a.scheme), k: null, of: of,
             finding: 'Unrecognised arbitration scheme "' + a.scheme + '" — supported: voting, none.' };
  }

  // ---------------------------------------------------------------- the lanes
  // breachSets: the caller passes them in (macBreachSets(rule)) so this module
  // stays pure and the existing, verified clause arithmetic remains the single
  // source of truth for what "outside MAC" means.
  function lanes(rule, breachSets, severity, resolve) {
    var sc = scope(rule, severity);
    var fn = functionOf(rule, resolve);
    var mv = validateMembers(rule, resolve);
    var arb = arbitration(rule);
    var mem = members(rule);
    var breach = (breachSets || []).map(function (s) { return s.slice(); });
    var breachKeys = {};
    breach.forEach(function (s) { breachKeys[setKey(s)] = true; });

    // TOTAL LOSS — outside MAC. Exactly the breach sets; nothing new is invented.
    var totalLoss = { sets: breach, order: breach.length ? Math.min.apply(null, breach.map(function (s) { return s.length; })) : null };

    // PARTIAL LOSS — within MAC. The MINIMAL degradations that reduce the configuration
    // without breaching: any single member loss, or single degraded level, that is
    // not itself a breach set. Supersets are subsumed — if any single loss trips
    // "performance degraded", an OR over the singles is complete.
    var partialSets = [];
    mem.forEach(function (m) {
      if (!breachKeys[setKey([m])]) partialSets.push([m]);
    });
    (rule && rule.degraded || []).forEach(function (d) {
      if (!d || !d.sysId || !String(d.label || '').trim()) return;
      var tok = 'deg:' + d.sysId + ':' + d.label;
      if (!breachKeys[setKey([tok])]) partialSets.push([tok]);
    });
    var partialLoss = { sets: partialSets, gate: 'OR' };

    // MALFUNCTION — its own lane, outside MAC bounds. Derived from arbitration,
    // never from the floor.
    var malfunction = { sets: [], gate: null, k: null, of: arb.of, scheme: arb.scheme, declared: arb.declared };
    if (arb.declared) {
      malfunction.k = arb.k;
      malfunction.gate = (arb.k === 1) ? 'OR' : (arb.k === arb.of.length ? 'AND' : 'VOTING');
      malfunction.sets = combinations(arb.of, arb.k);
    }

    var findings = [];
    if (fn.finding) findings.push({ kind: 'not-per-function', msg: fn.finding });
    mv.findings.forEach(function (f) { findings.push(f); });
    if (!sc.inScope) findings.push({ kind: 'out-of-scope', msg: sc.reason });
    if (arb.finding) findings.push({ kind: 'arbitration', msg: arb.finding });
    if (!breach.length) findings.push({ kind: 'no-breach', msg: 'No breach sets — the rule has no populated clauses, so there is no MAC to be outside of.' });
    if (totalLoss.order === 1) {
      // A one-member clause is "this function is required", i.e. the architecture has
      // not been modelled yet. That is NOT the same claim as a discovered single point
      // of failure, and reporting it as one cries wolf.
      var singleMemberClause = (rule && rule.clauses || []).some(function (cl) { return (cl && cl.of || []).length <= 1; });
      findings.push(singleMemberClause
        ? { kind: 'unmodelled', msg: 'Order-1 route, but from a single-member clause — this reads "the function is required", i.e. the redundancy has not been modeled yet. Not a discovered single point of failure.' }
        : { kind: 'spf', msg: 'Order-1 route to a Catastrophic condition from a multi-member clause — a single failure reaches the condition.' });
    }

    return {
      subId: rule && rule.subId, fn: fn, inScope: sc.inScope, scopeReason: sc.reason,
      members: mem, memberCheck: mv, byFunction: mv.ok, arbitration: arb, findings: findings,
      totalLoss: totalLoss, partialLoss: partialLoss, malfunction: malfunction
    };
  }

  // All k-subsets of arr, in a stable order. Guarded — this is a combinatorial
  // enumeration and it refuses rather than approximating (same posture as
  // MAC_COMBO_CAP in the clause arithmetic).
  var COMBO_CAP = 20000;
  function combinations(arr, k) {
    var out = [];
    if (!(k >= 1) || k > arr.length) return out;
    (function pick(start, cur) {
      if (out.length > COMBO_CAP) return;
      if (cur.length === k) { out.push(cur.slice()); return; }
      for (var i = start; i < arr.length; i++) { cur.push(arr[i]); pick(i + 1, cur); cur.pop(); }
    })(0, []);
    return out;
  }

  // Project-level sweep. Caller supplies the rules with their breach sets and
  // severities already resolved, keeping this module free of app globals.
  function sweep(entries) {
    var out = { rules: 0, inScope: 0, outOfScope: 0, arbitrationUndeclared: 0, unmodelled: 0, spf: 0, byRule: [] };
    (entries || []).forEach(function (e) {
      var L = lanes(e.rule, e.breachSets, e.severity, e.resolve);
      out.rules++;
      if (!L.byFunction) out.notByFunction = (out.notByFunction || 0) + 1;
      if (L.inScope) out.inScope++; else out.outOfScope++;
      if (!L.arbitration.declared) out.arbitrationUndeclared++;
      L.findings.forEach(function (f) { if (f.kind === 'unmodelled') out.unmodelled++; if (f.kind === 'spf') out.spf++; });
      out.byRule.push(L);
    });
    return out;
  }

  return {
    LANES: LANES, lanes: lanes, arbitration: arbitration, scope: scope,
    validateMembers: validateMembers, functionOf: functionOf,
    combinations: combinations, members: members, sweep: sweep,
    isDegToken: isDegToken, degSys: degSys
  };
}));
