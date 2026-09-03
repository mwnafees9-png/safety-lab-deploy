#!/usr/bin/env node
/*
 * Regression — A3: the provider/consumer split (22 Aug 2026).
 *   A declared common resource (node.identity.kind === 'resource') generates ONE
 *   probabilistic L3 in the PROVIDER's bucket at the STRICTEST allocated value
 *   across every consumer — not N copies — and each resolving CONSUMER system
 *   gets an L2 INTERFACE requirement pinning the assumption its own trees make.
 *   Fail-safe: a resource whose provider does not resolve keeps the legacy
 *   per-node path (requirements never silently stop generating).
 * Run: node tests/regression_resource_split.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const slice = (src, from, to, label) => {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error('slice anchors missing: ' + label);
  return src.slice(a, b);
};

globalThis.window = globalThis;
globalThis.SLEnv = { get: n => globalThis[n] };
globalThis.SLNodeIdentity = require(path.join(__dirname, '..', 'site', 'node_identity.js'));
globalThis.SEVERITY_RANK = { Minor: 2, Major: 3, Hazardous: 4, Catastrophic: 5 };

const asr = S('assurance_modules.js');
(0, eval)(slice(asr, 'function hashStr', 'function walkAllPages', 'fp'));
(0, eval)(slice(asr, 'function _pageScopeKey', 'function pageInScope', '_pageScopeKey'));
(0, eval)(slice(asr, 'function _transferTargetPage', 'function findPathTo', 'owner adapters'));
(0, eval)(slice(asr, 'function _midSentence', 'function _governingFhaForPage', 'text helpers'));
(0, eval)(slice(asr, 'function genFTAEvents', '// ----- Generator 3', 'genFTAEvents'));

// ---- app stubs -------------------------------------------------------------
globalThis.getPhaseExposureRatio = () => ({ ratio: 1, exposedHours: 1, totalHours: 1, matchedPhases: [], unmatchedPhases: [] });
globalThis._missionHoursForNormalization = () => 1;
globalThis._governingFhaForPage = () => null;
globalThis._govSafetyAccepted = () => false;
globalThis.acFhaData = [];

// ---- fixture ---------------------------------------------------------------
const resNode = (id, lid, p, extra) => Object.assign({
  id, logicalId: lid, type: 'basic', name: 'Loss of hydraulic supply pressure', probability: p,
  identity: { kind: 'resource', resourceId: 'HYD-3000', providerSystemId: 'hyd' }
}, extra || {});
const mk = () => {
  globalThis.systemsData = [
    { id: 'hyd', name: 'Hydraulic Power' },
    { id: 'fcs', name: 'Flight Control' },
    { id: 'brk', name: 'Wheel Brakes' } ];
  globalThis.ftaPages = [
    { id: 'pgA', name: 'SSA · FCS', systemId: 'fcs', root: { id: 1, type: 'gate', gateType: 'OR', children: [
        resNode(11, 'ra', 1e-6),
        { id: 12, logicalId: 'plain', type: 'basic', name: 'Servo valve jams', probability: 2e-6 } ] } },
    { id: 'pgB', name: 'SSA · Brakes', systemId: 'brk', root: { id: 2, type: 'gate', gateType: 'OR', children: [
        resNode(21, 'rb', 1e-8) ] } },
  ];
};
mk();

// ---- provider bucket -------------------------------------------------------
let hyd = genFTAEvents('sys-hyd');
const provRows = hyd.filter(r => r.reqSource.generator === 'fta-resource');
check('the provider bucket gets EXACTLY ONE row for the resource — not one per consumer',
  provRows.length === 1 && hyd.filter(r => r.reqSource.generator === 'fta-event').length === 0,
  JSON.stringify(hyd.map(r => r.reqSource.sourceId)));
const prov = provRows[0];
check('…at the STRICTEST value across consumers (1e-8 governs over 1e-6)',
  /1\.00e-8/.test(prov.text) && prov.reqSource.context.pAllocated === 1e-8, prov.text);
check('sourceId is per-resource, in the provider scope', prov.reqSource.sourceId === 'sys-hyd:fta-resource:HYD-3000');
check('rationale names EVERY consuming tree with its allocation and the governing one',
  /SSA · FCS allocates 1\.00e-6/.test(prov.rat) && /SSA · Brakes allocates 1\.00e-8/.test(prov.rat) && /strictest consumer governs \(SSA · Brakes\)/.test(prov.rat),
  prov.rat);
check('context records both consumers', prov.reqSource.context.consumers.length === 2
  && prov.reqSource.context.consumers.indexOf('Flight Control') >= 0 && prov.reqSource.context.consumers.indexOf('Wheel Brakes') >= 0);
check('it reads as a probabilistic L3 (Safety / Probabilistic / L3, one shall)',
  prov.level === 'L3' && prov.type === 'Safety' && prov.analysis === 'Probabilistic' && (prov.text.match(/shall/g) || []).length === 1);

// ---- consumer buckets ------------------------------------------------------
const fcs = genFTAEvents('sys-fcs');
const fcsIface = fcs.filter(r => r.reqSource.generator === 'fta-resource-iface');
check('the consumer bucket gets an L2 INTERFACE row pinning ITS OWN assumption (1e-6, not the provider strictest)',
  fcsIface.length === 1 && /1\.00e-6/.test(fcsIface[0].text) && fcsIface[0].level === 'L2' && fcsIface[0].type === 'Interface',
  JSON.stringify(fcsIface.map(r => r.text)));
check('…and it names the provider and cross-traces the provider row',
  /Hydraulic Power/.test(fcsIface[0].text) && fcsIface[0].reqSource.context.pairsWith === 'sys-hyd:fta-resource:HYD-3000');
check('the OTHER consumer pins its own value (1e-8)',
  (genFTAEvents('sys-brk').find(r => r.reqSource.generator === 'fta-resource-iface') || {}).reqSource.context.pAssumed === 1e-8);
check('an ordinary basic event still emits its normal fta-event (nothing else regressed)',
  fcs.some(r => r.reqSource.generator === 'fta-event' && r.reqSource.sourceId === 'sys-fcs:fta-event:plain'));
check('the resource node emits NO per-node fta-event anywhere',
  !fcs.some(r => /fta-event:ra/.test(r.reqSource.sourceId)) && !hyd.some(r => /fta-event:r[ab]/.test(r.reqSource.sourceId)));
check('aircraft scope emits no consumer interface rows (consumers are systems)',
  !genFTAEvents('ac').some(r => r.reqSource.generator === 'fta-resource-iface'));

// ---- the fail-safe ---------------------------------------------------------
mk();
delete ftaPages[0].root.children[0].identity.providerSystemId;
let noProv = genFTAEvents('sys-fcs');
check('FAIL-SAFE: a resource with NO provider keeps the legacy per-node path (page bucket, fta-event)',
  noProv.some(r => r.reqSource.sourceId === 'sys-fcs:fta-event:ra'),
  JSON.stringify(noProv.map(r => r.reqSource.sourceId)));
mk();
ftaPages[0].root.children[0].identity.providerSystemId = 'ghost';
check('FAIL-SAFE: a provider that resolves to NO known system falls back the same way',
  genFTAEvents('sys-fcs').some(r => r.reqSource.sourceId === 'sys-fcs:fta-event:ra'));

// ---- unresolved consumer ---------------------------------------------------
mk();
delete ftaPages[1].systemId;   // pgB: no system, no ancestors — consumer unresolvable
hyd = genFTAEvents('sys-hyd');
const prov2 = hyd.find(r => r.reqSource.generator === 'fta-resource');
check('an unresolvable consumer never blocks the provider row — it is named as unresolved',
  prov2 && prov2.reqSource.context.consumers.indexOf('(unresolved consumer)') >= 0,
  prov2 && JSON.stringify(prov2.reqSource.context.consumers));

// ---- direction + stability -------------------------------------------------
mk();
ftaPages[0].root.children[0].probability = 1e-9;   // FCS tightens past Brakes
const flipped = genFTAEvents('sys-hyd').find(r => r.reqSource.generator === 'fta-resource');
check('DIRECTION: the strictest use governs whichever tree holds it',
  flipped.reqSource.context.pAllocated === 1e-9 && /governs \(SSA · FCS\)/.test(flipped.rat));
mk();
const fpA = genFTAEvents('sys-hyd').find(r => r.reqSource.generator === 'fta-resource').reqSource.fingerprint;
const fpB = genFTAEvents('sys-hyd').find(r => r.reqSource.generator === 'fta-resource').reqSource.fingerprint;
ftaPages[1].root.children[0].probability = 5e-9;
const fpC = genFTAEvents('sys-hyd').find(r => r.reqSource.generator === 'fta-resource').reqSource.fingerprint;
check('fingerprint: stable across runs, churns when any use moves', fpA === fpB && fpA !== fpC);

// ---- same consumer, two uses -----------------------------------------------
mk();
ftaPages[0].root.children.push(resNode(13, 'ra2', 3e-7));
const twoUse = genFTAEvents('sys-fcs').find(r => r.reqSource.generator === 'fta-resource-iface');
check('a consumer using the resource twice pins ITS OWN strictest (3e-7 over 1e-6)',
  twoUse.reqSource.context.pAssumed === 3e-7 && twoUse.reqSource.context.uses.length === 2);

// ---- copy: verb-phrased names read as sentences (live-found 22 Aug) --------
mk();
ftaPages[0].root.children[0].name = 'Hydraulic accumulator bursts';
ftaPages[1].root.children[0].name = 'Hydraulic accumulator bursts';   // the GOVERNING (strictest) use names the provider row
const vProv = genFTAEvents('sys-hyd').find(r => r.reqSource.generator === 'fta-resource');
check('provider copy: verb-phrased name takes "probability THAT … bursts"',
  /^The probability that hydraulic accumulator bursts shall not exceed/.test(vProv.text), vProv.text);
const vIfc = genFTAEvents('sys-fcs').find(r => r.reqSource.generator === 'fta-resource-iface');
check('consumer copy: verb-phrased name reads "assume that … bursts with a probability"',
  /shall assume that hydraulic accumulator bursts with a probability no greater than/.test(vIfc.text), vIfc.text);
mk();
ftaPages[0].root.children[0].name = 'Loss of hydraulic supply pressure';
const nIfc = genFTAEvents('sys-fcs').find(r => r.reqSource.generator === 'fta-resource-iface');
check('consumer copy: failure-noun name reads "… pressure occurs with a probability"',
  /assume that loss of hydraulic supply pressure occurs with a probability/.test(nIfc.text), nIfc.text);
mk();
ftaPages[0].root.children[0].name = 'Bleed air supply';
const uIfc = genFTAEvents('sys-fcs').find(r => r.reqSource.generator === 'fta-resource-iface');
check('consumer copy: neutral name reads "failure of … occurs"',
  /assume that failure of bleed air supply occurs/.test(uIfc.text), uIfc.text);

// ---- wiring ----------------------------------------------------------------
check('orphan sweep covers the two new generators under the ftaEvent gate',
  /g === 'fta-resource' \|\| g === 'fta-resource-iface'\) && opts\.ftaEvent/.test(asr));
const idx = S('index.html');
check('pin: assurance ≥1.24 (floor, rule 12)',
  parseFloat((idx.match(/assurance_modules\.js\?v=([\d.]+)/) || [])[1]) >= 1.25);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
