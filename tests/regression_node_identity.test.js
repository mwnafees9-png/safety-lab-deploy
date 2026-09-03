#!/usr/bin/env node
/*
 * Regression — structured node identity and ownership resolution. Build 66.32.
 * Spec: BUILD_SPEC_Structured_Nodes_and_Bucketing.md §A, OPEN_ITEMS C1.
 *
 * Waqas, 19 Aug 2026: "can we potentially do fault tree node event modeling in a
 * standardized way ... 1 select system, 2 select system function, 3 failure condition?"
 *
 * This is the load-bearing half: the coordinate a node carries, and — the part every
 * other open item depends on — WHO OWNS IT. Requirement bucketing has no answer until
 * a node can say which system it belongs to, which is the defect that started the
 * thread ("why are showing L3 auto req requirements at the aircraft level").
 *
 * Four rules under test, each of which was a decision made in discussion:
 *   · THE BOUNDARY RULE — a functional node is a declared failure condition exactly
 *     when it crosses an ownership boundary. Replaces "is it abstract enough", which
 *     is a judgement call and therefore untestable.
 *   · TWO OWNERS FOR A RESOURCE — the provider owns the probabilistic requirement
 *     once, at the strictest value; each consumer owns an interface requirement. One
 *     L3, not N copies.
 *   · DERIVED TEXT — the label comes from the thing the node points at, so it cannot
 *     drift from the condition it names.
 *   · FINDINGS, NEVER BLOCKS — an unstructured node is legal and must not interrupt
 *     modelling. It blocks CLOSURE. "You cannot think and fill in dropdowns at once."
 *
 * Run: node tests/regression_node_identity.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const NI = require(path.join(SITE, 'node_identity.js'));
const src = fs.readFileSync(path.join(SITE, 'node_identity.js'), 'utf8');
const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');

// ---- a small world ---------------------------------------------------------
// Aircraft PASA tree: top gate (no system) -> FCS branch -> two leaves, one of which
// is the shared 28V bus provided by electrical power and consumed by FCS.
function mk(id, identity, kids) { return { id: id, name: 'node ' + id, identity: identity || null, children: kids || [] }; }

const busLeaf   = mk('bus',  { kind: 'resource', resourceId: 'r-28vdc-1', providerSystemId: 'eps' });
const actLeaf   = mk('act',  { kind: 'item', systemId: 'fcs', itemId: 'i-act-a', effectId: 'e-no-output' });
const freeLeaf  = mk('free', null);
const fcsBranch = mk('fcs',  { kind: 'functional', systemId: 'fcs', functionId: 'fn-pitch' }, [actLeaf, busLeaf, freeLeaf]);
const acTop     = mk('top',  { kind: 'functional', functionId: 'af-pitch' }, [fcsBranch]);

const PARENT = new Map([[fcsBranch, acTop], [actLeaf, fcsBranch], [busLeaf, fcsBranch], [freeLeaf, fcsBranch]]);
const PAGE = { id: 'pg-ac', systemId: null, treeLevel: 'aircraft', verifies: null };
const CTX = {
  parentOf: n => PARENT.get(n) || null,
  pageOf: () => PAGE,
  transferTarget: () => null,
  label: (kind, id) => ({
    'failureCondition:fc-pitch-total': 'Total loss of pitch control authority',
    'function:fn-pitch': 'Provide pitch control authority',
    'function:af-pitch': 'Control pitch attitude',
    'item:i-act-a': 'Elevator actuator lane A',
    'effect:e-no-output': 'no output',
    'resource:r-28vdc-1': '28V DC bus 1'
  }[kind + ':' + id] || null)
};

/* ========================================================================= */
console.log('\n[1] The coordinate — declared, and complete or not');
{
  check('a structured node is recognised', NI.isStructured(actLeaf) && NI.kindOf(actLeaf) === 'item');
  check('a free-text node is NOT structured', !NI.isStructured(freeLeaf) && NI.kindOf(freeLeaf) === null);
  check('an unknown kind is treated as unstructured, not trusted',
    !NI.isStructured(mk('x', { kind: 'wishful-thinking' })));
  check('a complete item coordinate reports complete', NI.isComplete(actLeaf), NI.missingFields(actLeaf).join(','));
  check('a functional node without its function is incomplete, and says which field',
    NI.missingFields(mk('f', { kind: 'functional', systemId: 'fcs' })).join(',') === 'functionId');
  check('an empty string does not count as declared',
    NI.missingFields(mk('f', { kind: 'functional', systemId: 'fcs', functionId: '   ' })).join(',') === 'functionId');
  check('the qualitative kinds need nothing beyond their kind',
    NI.isComplete(mk('d', { kind: 'devError' })) && NI.isComplete(mk('u', { kind: 'undeveloped' })));
  check('development error is marked NOT quantified (ARP4761A 4.1.1.1)',
    NI.KINDS.devError.quantified === false && NI.KINDS.item.quantified === true);
}

/* ========================================================================= */
console.log('\n[2] Ownership resolution — most specific first');
{
  check('a declared system wins', NI.resolveOwner(actLeaf, CTX).systemId === 'fcs' &&
    NI.resolveOwner(actLeaf, CTX).via === 'declared');
  check('an undeclared leaf inherits from the nearest ancestor that declares one',
    NI.resolveOwner(freeLeaf, CTX).systemId === 'fcs' && NI.resolveOwner(freeLeaf, CTX).via === 'ancestor');

  const tctx = Object.assign({}, CTX, { transferTarget: n => n === freeLeaf ? { id: 'pg-eps', systemId: 'eps' } : null });
  check('a transfer gate beats the ancestor — the destination page owns what is beneath it',
    NI.resolveOwner(freeLeaf, tctx).systemId === 'eps' && NI.resolveOwner(freeLeaf, tctx).via === 'transfer-target');

  const pctx = { parentOf: () => null, pageOf: () => ({ id: 'pg-eps', systemId: 'eps' }) };
  check('with nothing else, the page owns it', NI.resolveOwner(mk('n'), pctx).systemId === 'eps' &&
    NI.resolveOwner(mk('n'), pctx).via === 'page');

  const nothing = { parentOf: () => null, pageOf: () => ({ id: 'pg-ac', systemId: null }) };
  check('nothing at all resolves to UNOWNED, not to a default bucket',
    NI.resolveOwner(mk('n'), nothing).unowned === true && NI.resolveOwner(mk('n'), nothing).systemId === null,
    'defaulting to aircraft is exactly the defect that started this');

  check('the aircraft top event has no system and does not invent one',
    NI.resolveOwner(acTop, CTX).unowned === true);

  // A cycle must not hang the walk.
  const a = mk('a'), b = mk('b');
  const cyc = { parentOf: n => (n === a ? b : a), pageOf: () => ({ systemId: null }) };
  check('a parent cycle terminates instead of hanging', NI.resolveOwner(a, cyc).unowned === true);
}

/* ========================================================================= */
console.log('\n[3] A resource has TWO owners, and they are never collapsed');
{
  const o = NI.resolveOwner(busLeaf, CTX);
  check('the PROVIDER owns the resource requirement', o.systemId === 'eps' && o.role === 'provider');
  check('the CONSUMER is resolved separately from the branch it sits in', o.consumerSystemId === 'fcs');
  check('provider and consumer are different systems here, and both survive',
    o.systemId !== o.consumerSystemId,
    'one L3 in the provider bucket + an interface requirement in the consumer bucket — not N copies');
  check('a resource with no declared provider is unowned',
    NI.resolveOwner(mk('r', { kind: 'resource', resourceId: 'r-x' }), CTX).unowned === true);
  check('a resource does NOT pass its provider down to siblings or children',
    (() => { const child = mk('c'); const p = new Map([[child, busLeaf], [busLeaf, fcsBranch], [fcsBranch, acTop]]);
      const c2 = Object.assign({}, CTX, { parentOf: n => p.get(n) || null });
      return NI.resolveOwner(child, c2).systemId === 'fcs'; })(),
    'the consuming branch owns the children, not the resource provider');
}

/* ========================================================================= */
console.log('\n[4] The boundary rule — replaces "is it abstract enough"');
{
  check('a functional node whose owner differs from its parent CROSSES a boundary',
    NI.crossesBoundary(fcsBranch, CTX) === true, 'fcs under an aircraft-level parent');

  const inner = mk('inner', { kind: 'functional', systemId: 'fcs', functionId: 'fn-pitch-inner' });
  const p2 = new Map([[inner, fcsBranch], [fcsBranch, acTop]]);
  const c2 = Object.assign({}, CTX, { parentOf: n => p2.get(n) || null });
  check('a functional node inside its own system does NOT cross — it is just logic',
    NI.crossesBoundary(inner, c2) === false);

  check('a non-functional node never crosses', NI.crossesBoundary(actLeaf, CTX) === false);
  // REGRESSION, 19 Aug: the first cut required BOTH sides to have an owner, so a system
  // branch under an aircraft-level parent (no owner) reported NO boundary — on the one
  // tree shape this rule exists for.
  check('an owner appearing where the parent had NONE is a crossing',
    NI.crossesBoundary(mk('b', { kind: 'functional', systemId: 'eps', functionId: 'fn-x' }),
      { parentOf: () => mk('p', { kind: 'functional', functionId: 'af-y' }), pageOf: () => PAGE }) === true);
  check('a node with no owner of its own cannot cross into anything',
    NI.crossesBoundary(mk('c', { kind: 'functional', functionId: 'fn-z' }),
      { parentOf: () => mk('p2', { kind: 'functional', systemId: 'eps' }), pageOf: () => PAGE }) === false);
  check('a node with no parent always declares', NI.crossesBoundary(fcsBranch, { parentOf: () => null, pageOf: () => PAGE }) === true);
}

/* ========================================================================= */
console.log('\n[5] Derived text — a label cannot drift from what it names');
{
  const fnNode = mk('fn', { kind: 'functional', systemId: 'fcs', functionId: 'fn-pitch', fcId: 'fc-pitch-total' });
  const d = NI.displayText(fnNode, CTX);
  check('a functional node reads from its FAILURE CONDITION when it has one',
    d.derived && d.text === 'Total loss of pitch control authority', d.text);
  check('...and falls back to the function when it does not',
    NI.displayText(mk('fn2', { kind: 'functional', functionId: 'fn-pitch' }), CTX).text === 'Provide pitch control authority');
  check('an item reads item + effect', NI.displayText(actLeaf, CTX).text === 'Elevator actuator lane A — no output',
    NI.displayText(actLeaf, CTX).text);
  check('a resource reads resource + consuming function',
    NI.displayText(mk('r', { kind: 'resource', resourceId: 'r-28vdc-1', providerSystemId: 'eps', functionId: 'fn-pitch' }), CTX).text ===
    '28V DC bus 1 for Provide pitch control authority');
  const ov = NI.displayText(mk('o', { kind: 'item', systemId: 'fcs', itemId: 'i-act-a', textOverride: 'Hand-written label' }), CTX);
  check('an explicit override is honoured AND marked as an override', ov.text === 'Hand-written label' && ov.overridden && !ov.derived);
  check('an unresolvable reference falls back to the stored name and says it is unresolved',
    NI.displayText(mk('bad', { kind: 'item', systemId: 'fcs', itemId: 'ghost' }), CTX).unresolved === true);
  check('a free-text node keeps its own name', NI.displayText(freeLeaf, CTX).text === 'node free');
}

/* ========================================================================= */
console.log('\n[6] Findings, never blocks — modelling is not interrupted, closure is');
{
  const f = NI.nodeFindings(freeLeaf, CTX);
  check('an unstructured node is reported', f.length === 1 && f[0].kind === 'unstructured');
  check('...and it blocks CLOSURE, not the work', f[0].severity === 'blocks-closure');
  check('a complete, owned node raises nothing', NI.nodeFindings(actLeaf, CTX).length === 0,
    NI.nodeFindings(actLeaf, CTX).map(x => x.kind).join(','));
  check('an incomplete coordinate names the missing field',
    NI.nodeFindings(mk('i', { kind: 'item', systemId: 'fcs' }), CTX)
      .some(x => x.kind === 'incomplete' && /itemId/.test(x.msg)));
  // A STRUCTURED node with nothing to inherit from. An UNSTRUCTURED one deliberately
  // reports only 'unstructured' and stops — piling findings on a node whose first
  // problem is that nobody has said what it is would just be noise.
  check('an unowned node is reported with why nothing resolved',
    NI.nodeFindings(mk('n', { kind: 'human' }), { parentOf: () => null, pageOf: () => ({ systemId: null }) })
      .some(x => x.kind === 'unowned' && /nowhere to file/.test(x.msg)));
  check('an unstructured node reports ONLY that, and does not pile on',
    NI.nodeFindings(mk('n2'), { parentOf: () => null, pageOf: () => ({ systemId: null }) }).length === 1);

  // Allocation stops at the item — modes belong on the mirror. (Waqas's ruling.)
  const withModes = mk('m', { kind: 'item', systemId: 'fcs', itemId: 'i-act-a', modeIds: ['m1', 'm2'] });
  check('failure modes on an ALLOCATION tree are a finding',
    NI.nodeFindings(withModes, CTX).some(x => x.kind === 'modes-on-allocation'));
  const mirrorCtx = Object.assign({}, CTX, { pageOf: () => ({ id: 'pg-v', verifies: 'pg-ac' }) });
  check('...and are correct on the verification mirror',
    !NI.nodeFindings(withModes, mirrorCtx).some(x => x.kind === 'modes-on-allocation'));
}

/* ========================================================================= */
console.log('\n[7] Tree sweep — the number a closure gate would read');
{
  const s = NI.sweepTree(acTop, CTX);
  check('every node is visited', s.nodes === 5, 'nodes=' + s.nodes);
  check('structured nodes are counted', s.structured === 4, 'structured=' + s.structured);
  check('the free-text leaf is listed, not just counted', s.unstructured.length === 1 && s.unstructured[0].node === freeLeaf);
  check('the aircraft top event is listed as unowned', s.unowned.some(u => u.node === acTop));
  check('blocksClosure aggregates every blocking finding', s.blocksClosure >= 2, 'blocksClosure=' + s.blocksClosure);
  check('an empty tree sweeps cleanly rather than throwing', NI.sweepTree(null, CTX).nodes === 0);
}

/* ========================================================================= */
console.log('\n[8] The module stays pure, and is wired');
{
  check('no DOM, storage or app globals',
    !/document\.|localStorage|projectConfig|ftaPages|systemsData|showToast|internalIdCounter/.test(src));
  check('loadable in node AND on window', typeof NI.resolveOwner === 'function' && /window\.SLNodeIdentity/.test(src));
  check('wired into index.html', /node_identity\.js\?v=/.test(idx));
  check('...before the modules that will consume it',
    idx.indexOf('node_identity.js') > 0 && idx.indexOf('node_identity.js') < idx.indexOf('fta_view_modules.js'));
  check('unstructured nodes are never described as blocking the WORK',
    /blocks CLOSURE rather than blocking work|blocks CLOSURE/.test(src) && !/return false; *\/\/ *block editing/.test(src));
}

console.log('\n' + (fail === 0 ? 'ALL GREEN — ' + pass + ' checks' : 'RED — ' + fail + ' failed, ' + pass + ' passed'));
process.exit(fail === 0 ? 0 : 1);
