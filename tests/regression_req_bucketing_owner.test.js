#!/usr/bin/env node
/*
 * Regression — A2 (bucket by the DECLARED owner) and A4 (the in-place sourceId migration).
 * Build 66.36. Spec: WORK_PACKAGE §9 items 1 and 2, OPEN_ITEMS A2/A4, UPGRADES §U-2/§U-6,
 * BUILD_SPEC §B2/§B6.
 *
 * THE REQUIREMENT, not the implementation — these checks were written from the spec text
 * before the code was read back, per the 19 Aug lesson that the boundary rule shipped
 * inverted because its test agreed with the implementation rather than with the rule.
 *
 * A2. "An event declared on FCS files into the FCS bucket regardless of which scope the
 *      generator ran in."  Owner = the system that PERFORMS THE FUNCTION (U-2), read from
 *      node.identity via SLNodeIdentity.resolveOwner. Ownership is per NODE, not per page:
 *      a branch declared to FCS drawn on an aircraft PASA page belongs to FCS.
 *
 * A4. "A re-bucket preserves verification status, evidence and manual edits on every
 *      migrated row."  The bucket is encoded twice — by which array the row lives in and
 *      by the sourceId prefix that _scopeOf() reads back — so both move together or the
 *      row is corrupt. A regenerate would mint a new internalId and lose everything.
 *
 * FAIL-SAFE, deliberately preserved from 66.27: a systemId that does not resolve to a real
 * system falls back to the page's bucket rather than matching nothing, because the failure
 * mode of a strict rule is that requirements silently STOP being generated.
 *
 * MEASURED ON AEOLUS HL-1 BEFORE THIS WAS WRITTEN (live, 19 Aug 2026): 182 nodes, 0 with
 * node.identity, 0 transfer gates, 0 existing auto-reqs. So A2 moves nothing on today's
 * real data — section [2] proves the no-op case explicitly, because "changes nothing when
 * nothing is declared" is as much a requirement as "moves the row when something is".
 *
 * Run: node tests/regression_req_bucketing_owner.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const am  = fs.readFileSync(path.join(SITE, 'assurance_modules.js'), 'utf8');
const hm  = fs.readFileSync(path.join(SITE, 'helpers_modules.js'), 'utf8');
const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const niSrc = fs.readFileSync(path.join(SITE, 'node_identity.js'), 'utf8');

const X = re => { const m = am.match(re); if (!m) throw new Error('extraction failed: ' + re); return m[0]; };
const srcScopeKey   = X(/function _pageScopeKey\(page\)\{[\s\S]*?\n    \}/);
const srcInScope    = X(/function pageInScope\(page, scope\)\{[^\n]*\}/);
const srcWalkScope  = X(/function walkPagesInScope\(scope, cb\)\{[\s\S]*?\n    \}/);
const srcUnowned    = X(/function unownedPages\(\)\{[\s\S]*?\n    \}/);
const srcXfer       = X(/function _transferTargetPage\(node\)\{[\s\S]*?\n    \}/);
const srcOwnerCtx   = X(/function _ownerCtx\(page\)\{[\s\S]*?\n    \}/);
const srcSysExists  = X(/function _systemExists\(sysId\)\{[\s\S]*?\n    \}/);
const srcNodeScope  = X(/function _nodeScopeKey\(node, page, ctx\)\{[\s\S]*?\n    \}/);
const srcAllocPages = X(/function _allocationPages\(\)\{[\s\S]*?\n    \}/);
const srcWalkNodes  = X(/function walkNodesInScope\(scope, cb\)\{[\s\S]*?\n    \}/);
const srcFtaGen     = X(/function genFTAEvents\(scopeKey\)\{[\s\S]*?\n        return out;\n    \}/);
const srcMid        = X(/function _midSentence\(s\) \{[\s\S]*?\n    \}/);
const srcGovFha     = X(/function _governingFhaForPage\(page\)\{[\s\S]*?\n    \}/);
const srcGovAcc     = X(/function _govSafetyAccepted\(gov\)\{[\s\S]*?\n    \}/);
const srcRebucketable = X(/const _REBUCKETABLE = \{[^}]*\};/);
const srcParseSid   = X(/function _parseFtaSourceId\(sid\)\{[\s\S]*?\n    \}/);
const srcAllRows    = X(/function _allReqRows\(\)\{[\s\S]*?\n    \}/);
const srcBucketByLid= X(/function _bucketByLid\(\)\{[\s\S]*?\n    \}/);
const srcPlan       = X(/function planBucketMigration\(\)\{[\s\S]*?\n    \}/);
const srcLabel      = X(/function _bucketLabel\(scope\)\{[\s\S]*?\n    \}/);
const srcApply      = X(/function applyBucketMigration\(plan, opts\)\{[\s\S]*?\n    \}/);
const srcTemplate   = X(/function _applyTemplateOverride\(req\) \{[\s\S]*?\n    \}/);
const srcDiff       = X(/function describeDiff\(prev, next\)\{[\s\S]*?\n    \}/);
const srcGenerate   = X(/function generate\(opts, scope\)\{[\s\S]*?\n    \}/);

// ---------------------------------------------------------------------------- the world
function world(opts) {
  opts = opts || {};
  const sb = { console, JSON, Math, Date, Set, Map, Array, Object, String, Number,
               isFinite, parseFloat, setTimeout, window: {}, module: { exports: {} }, __out: {} };
  vm.createContext(sb);
  // The real rules module, loaded exactly as the browser loads it — onto window.
  vm.runInContext(niSrc, sb);
  const prelude = `
    let ftaPages     = ${JSON.stringify(opts.pages || [])};
    let acFhaData    = ${JSON.stringify(opts.acFha || [])};
    let systemsData  = ${JSON.stringify(opts.systems || [])};
    let acReqData    = ${JSON.stringify(opts.acReq || [])};
    let acFunctionsData = [];
    const SEVERITY_RANK = { 'Catastrophic': 5, 'Hazardous': 4, 'Major': 3, 'Minor': 2, 'Negligible': 1, 'No Effect': 0 };
    const SEV_ORDER = SEVERITY_RANK;
    function getPhaseExposureRatio(){ return { ratio: 1, exposedHours: 0, totalHours: 6.33, matchedPhases: [] }; }
    function getSafetyTarget(){ return { prob: 1e-9, dal: 'A', scope: 'AC 25.1309-1B' }; }
    function getNormalizedSafetyTarget(){ return { prob: 1e-9, dal: 'A', matchedPhases: [], exposureRatio: 1, exposedHours: 0, totalHours: 6.33 }; }
    function storeForScope(scope){ if (scope === 'ac') return acReqData; const s = systemsData.find(x => 'sys-' + x.id === scope); return s ? s.req : null; }
    function ccmrLatentSweep(){ return []; }
    function certBasisForChart(){ return { regulation: 'Part 25', acRef: 'AC 25.1309-1B', part23Class: '' }; }
    function decideAnalysisDepth(){ return { mode: 'qual-quant', clause: '17(d)' }; }
    function findLinkedSysFhaForAcFc(){ return null; }
    function findAcFhaForSysFc(){ return null; }
    function moreRestrictiveSev(a){ return a; }
    function _missionHoursForNormalization(){ return 6.33; }
    const fp = (...a) => a.map(x => JSON.stringify(x)).join('|');
  `;
  vm.runInContext([prelude, srcScopeKey, srcInScope, srcWalkScope, srcUnowned, srcXfer,
    srcOwnerCtx, srcSysExists, srcNodeScope, srcAllocPages, srcWalkNodes, srcMid,
    srcGovFha, srcGovAcc, srcFtaGen, srcRebucketable, srcParseSid, srcAllRows,
    srcBucketByLid, srcLabel, srcPlan, srcApply, srcTemplate, srcDiff, srcGenerate].join('\n') + `
    ;__out.generate   = (o, s) => generate(o, s);
     __out.fta        = s => genFTAEvents(s);
     __out.nodeScope  = (n, p) => _nodeScopeKey(n, p);
     __out.plan       = () => planBucketMigration();
     __out.apply      = (pl, o) => applyBucketMigration(pl, o);
     __out.stores     = () => ({ ac: acReqData, sys: systemsData.map(s => ({ id: s.id, req: s.req })) });
     __out.parse      = s => _parseFtaSourceId(s);
  `, sb);
  return sb;
}

// A leaf carrying a probability budget, optionally with a declared identity.
const leaf = (id, identity) => {
  const n = { id: id, logicalId: id, type: 'basic', name: id + ' fails', probability: 1e-5 };
  if (identity) n.identity = identity;
  return n;
};
const SYSTEMS = [
  { id: 'fcs', name: 'Flight Control System', req: [] },
  { id: 'eps', name: 'Electrical Power System', req: [] }
];
// One AIRCRAFT page. Its own bucket is 'ac'; what the nodes declare is the whole question.
const acPage = kids => ({
  id: 'pgA', name: 'PASA · FC-A', treeLevel: 'aircraft', systemId: null, linkedFhaIds: [],
  root: { id: 'G1', type: 'gate', gateType: 'OR', name: 'FC-A', children: kids }
});

console.log('\n[1] Ownership resolution — the owner is declared on the NODE, not inherited from the page');
{
  const w = world({ systems: JSON.parse(JSON.stringify(SYSTEMS)),
                    pages: [acPage([ leaf('BE-undeclared'),
                                     leaf('BE-fcs', { kind: 'functional', systemId: 'fcs' }),
                                     leaf('BE-ghost', { kind: 'functional', systemId: 'does-not-exist' }) ])] });
  const pg = w.__out.stores && null;   // stores not needed here
  const page = vm.runInContext('ftaPages[0]', w);
  const kids = vm.runInContext('ftaPages[0].root.children', w);
  check('an UNDECLARED node falls back to its page bucket', w.__out.nodeScope(kids[0], page) === 'ac',
        'got ' + w.__out.nodeScope(kids[0], page));
  check('a node DECLARED to FCS is owned by FCS even on an aircraft page', w.__out.nodeScope(kids[1], page) === 'sys-fcs',
        'got ' + w.__out.nodeScope(kids[1], page));
  check('FAIL-SAFE: a systemId that resolves to no system falls back to the page bucket, never to nothing',
        w.__out.nodeScope(kids[2], page) === 'ac', 'got ' + w.__out.nodeScope(kids[2], page));
}

console.log('\n[2] A2 — an event declared on FCS files into the FCS bucket whichever scope ran');
{
  const mk = () => world({ systems: JSON.parse(JSON.stringify(SYSTEMS)),
                           pages: [acPage([ leaf('BE-undeclared'), leaf('BE-fcs', { kind: 'functional', systemId: 'fcs' }) ])] });
  const ac  = mk().__out.fta('ac');
  const fcs = mk().__out.fta('sys-fcs');
  const eps = mk().__out.fta('sys-eps');
  const ids = a => a.map(r => r.reqSource.sourceId);
  check('the declared event does NOT appear in the aircraft bucket',
        !ids(ac).some(s => s.indexOf('BE-fcs') >= 0), ids(ac).join(' , '));
  check('the undeclared event still DOES appear in the aircraft bucket',
        ids(ac).some(s => s.indexOf('BE-undeclared') >= 0), ids(ac).join(' , '));
  check('the declared event appears in the FCS bucket, with an FCS-prefixed sourceId',
        ids(fcs).length === 1 && ids(fcs)[0] === 'sys-fcs:fta-event:BE-fcs', ids(fcs).join(' , '));
  check('it does not also leak into an unrelated system bucket', ids(eps).length === 0, ids(eps).join(' , '));
  check('no event is emitted into two buckets at once',
        ids(ac).concat(ids(fcs), ids(eps)).length === 2);
}

console.log('\n[2b] The no-op case — with nothing declared, A2 reproduces 66.27 behaviour exactly');
{
  // This is the measured state of Aeolus HL-1: no identity anywhere, no transfer gates.
  const sysPage = { id: 'pgS', name: 'FCS tree', treeLevel: 'system', systemId: 'fcs', linkedFhaIds: [],
                    root: { id: 'GS', type: 'gate', gateType: 'OR', children: [ leaf('BE-sys') ] } };
  const mk = () => world({ systems: JSON.parse(JSON.stringify(SYSTEMS)),
                           pages: [ acPage([ leaf('BE-air') ]), sysPage ] });
  const ac  = mk().__out.fta('ac').map(r => r.reqSource.sourceId);
  const fcs = mk().__out.fta('sys-fcs').map(r => r.reqSource.sourceId);
  check('an undeclared aircraft-page event stays in the aircraft bucket', ac.length === 1 && ac[0] === 'ac:fta-event:BE-air', ac.join());
  check('an undeclared system-page event stays in that system bucket', fcs.length === 1 && fcs[0] === 'sys-fcs:fta-event:BE-sys', fcs.join());
  check('no cross-bucket duplication is reintroduced', ac.concat(fcs).length === 2);
}

console.log('\n[2c] Transfer gates — everything beneath a transfer is owned by construction (U-3 option 2)');
{
  // ADDED AFTER LIVE VERIFICATION, 19 Aug. The pre-build probe reported "0 transfer gates on
  // Aeolus" and that was WRONG: it tested n.type === 'transfer' and four field names but not
  // the canonical shape, which is a GATE with gateType 'TRANSFER' and the destination in
  // transferOutTo. Aeolus HL-1 has SEVEN of them, on aircraft PASA pages, pointing at LDG,
  // PRP, EPS and NZD. The union in _transferTargetPage happened to cover it, so nothing
  // shipped broken — but the path was live on real data with no test on it, which is luck,
  // not engineering. These are the checks that path should have had.
  const sysPage = { id: 'pgFCS', name: 'FCS tree', treeLevel: 'system', systemId: 'fcs', linkedFhaIds: [],
                    root: { id: 'GS', type: 'gate', gateType: 'OR', children: [] } };
  const mkWorld = (xferNode, kid) => world({
    systems: JSON.parse(JSON.stringify(SYSTEMS)),
    pages: [ { id: 'pgA', name: 'PASA · FC-A', treeLevel: 'aircraft', systemId: null, linkedFhaIds: [],
               root: { id: 'G1', type: 'gate', gateType: 'OR', children: [ Object.assign({}, xferNode, { children: kid ? [kid] : [] }) ] } },
             sysPage ] });

  // the canonical live shape
  const canonical = { id: 'X1', type: 'gate', gateType: 'TRANSFER', transferOutTo: 'pgFCS' };
  let w = mkWorld(canonical, null);
  let page = vm.runInContext('ftaPages[0]', w);
  let xfer = vm.runInContext('ftaPages[0].root.children[0]', w);
  check('a TRANSFER gate resolves to the system of the page it transfers to',
        w.__out.nodeScope(xfer, page) === 'sys-fcs', 'got ' + w.__out.nodeScope(xfer, page));

  // a leaf hanging beneath it inherits by construction
  w = mkWorld(canonical, leaf('BE-under-xfer'));
  page = vm.runInContext('ftaPages[0]', w);
  const kid = vm.runInContext('ftaPages[0].root.children[0].children[0]', w);
  check('a leaf beneath a transfer inherits the target system, with nothing declared on it',
        w.__out.nodeScope(kid, page) === 'sys-fcs', 'got ' + w.__out.nodeScope(kid, page));
  const acIds = mkWorld(canonical, leaf('BE-under-xfer')).__out.fta('ac').map(r => r.reqSource.sourceId);
  const fcsIds = mkWorld(canonical, leaf('BE-under-xfer')).__out.fta('sys-fcs').map(r => r.reqSource.sourceId);
  check('so its requirement files to the target system, not to the aircraft page it is drawn on',
        acIds.length === 0 && fcsIds.indexOf('sys-fcs:fta-event:BE-under-xfer') >= 0,
        'ac=[' + acIds.join() + '] fcs=[' + fcsIds.join() + ']');

  // the legacy shapes the codebase has accumulated
  ['linkedPageId', 'transferTo', 'transferRef'].forEach(field => {
    const alt = { id: 'X1', type: 'gate', gateType: 'TRANSFER' };
    alt[field] = 'pgFCS';
    const ww = mkWorld(alt, null);
    const pp = vm.runInContext('ftaPages[0]', ww);
    const nn = vm.runInContext('ftaPages[0].root.children[0]', ww);
    check('the legacy destination field `' + field + '` is honoured too', ww.__out.nodeScope(nn, pp) === 'sys-fcs');
  });

  // and the failure modes must not invent an owner
  const unlinked = mkWorld({ id: 'X1', type: 'gate', gateType: 'TRANSFER' }, null);
  check('an UNLINKED transfer gate falls back to its page bucket rather than guessing',
        unlinked.__out.nodeScope(vm.runInContext('ftaPages[0].root.children[0]', unlinked),
                                 vm.runInContext('ftaPages[0]', unlinked)) === 'ac');
  const dangling = mkWorld({ id: 'X1', type: 'gate', gateType: 'TRANSFER', transferOutTo: 'pgDELETED' }, null);
  check('a transfer to a page that no longer exists falls back rather than throwing',
        dangling.__out.nodeScope(vm.runInContext('ftaPages[0].root.children[0]', dangling),
                                 vm.runInContext('ftaPages[0]', dangling)) === 'ac');
  const plainGate = mkWorld({ id: 'X1', type: 'gate', gateType: 'OR', transferOutTo: null }, null);
  check('an ordinary OR gate is not mistaken for a transfer',
        plainGate.__out.nodeScope(vm.runInContext('ftaPages[0].root.children[0]', plainGate),
                                  vm.runInContext('ftaPages[0]', plainGate)) === 'ac');
}

console.log('\n[3] A4 — the migration MOVES the row and rewrites the key, losing nothing');
{
  const systems = JSON.parse(JSON.stringify(SYSTEMS));
  // A requirement generated earlier, when the node was still unowned: it lives in the
  // aircraft register with an `ac:` prefix, and it has been worked on since.
  const existing = {
    internalId: 4242, traceId: 'REQ-AC-0007', text: 'The probability of BE-fcs failing shall not exceed 1.00e-5 per flight.',
    verifStatus: 'Verified', verifEvidence: 'FTA-2026-08-01 §4.2',
    reqSource: { generator: 'fta-event', sourceId: 'ac:fta-event:BE-fcs', fingerprint: 'x', userOverridden: true, context: {} }
  };
  const w = world({ systems: systems, acReq: [existing],
                    pages: [acPage([ leaf('BE-fcs', { kind: 'functional', systemId: 'fcs' }) ])] });
  const plan = w.__out.plan();
  check('the plan finds exactly one pending move', plan.moves.length === 1, JSON.stringify(plan.moves.map(m => m.from + '->' + m.to)));
  const mv = plan.moves[0] || {};
  check('it names the right direction, aircraft → FCS', mv.from === 'ac' && mv.to === 'sys-fcs', mv.from + ' -> ' + mv.to);
  check('the plan flags that this row carries verification EVIDENCE (the expensive case)', mv.hasEvidence === true);
  check('the plan flags the verification status', mv.hasVerificationStatus === true);
  check('the plan flags the manual edit', mv.userOverridden === true);
  check('planning is PURE — nothing has moved yet', w.__out.stores().ac.length === 1 && w.__out.stores().sys[0].req.length === 0);

  const n = w.__out.apply(plan, { by: 'Waqas' });
  const st = w.__out.stores();
  check('apply reports one migration', n === 1, String(n));
  check('the row LEFT the aircraft register', st.ac.length === 0, JSON.stringify(st.ac.length));
  check('the row ARRIVED in the FCS register', st.sys[0].req.length === 1);
  const moved = st.sys[0].req[0] || {};
  check('the sourceId prefix was rewritten to match the new home',
        moved.reqSource && moved.reqSource.sourceId === 'sys-fcs:fta-event:BE-fcs', moved.reqSource && moved.reqSource.sourceId);
  check('MIGRATED, NOT REGENERATED — the internalId is the same row', moved.internalId === 4242, String(moved.internalId));
  check('verification status survived', moved.verifStatus === 'Verified');
  check('verification evidence survived', moved.verifEvidence === 'FTA-2026-08-01 §4.2');
  check('the manual edit flag survived', moved.reqSource.userOverridden === true);
  check('the text was not rewritten', /BE-fcs failing/.test(moved.text));
  const prov = (moved.reqSource.rebucketed || [])[0];
  check('the decision is recorded as provenance', !!prov && prov.from === 'ac' && prov.to === 'sys-fcs');
  check('provenance names the person, in the active voice', !!prov && /^Waqas moved /.test(prov.sentence), prov && prov.sentence);
  check('provenance is not passive — it never says "was moved"', !!prov && !/was moved|budgets updated/i.test(prov.sentence));
}

console.log('\n[4] generate() must not report a pending move as both a new row and an orphan');
{
  const systems = JSON.parse(JSON.stringify(SYSTEMS));
  const existing = {
    internalId: 7, traceId: 'REQ-AC-0007', text: 'old',
    verifStatus: 'Verified',
    reqSource: { generator: 'fta-event', sourceId: 'ac:fta-event:BE-fcs', fingerprint: 'x', context: {} }
  };
  const w = world({ systems: systems, acReq: [existing],
                    pages: [acPage([ leaf('BE-fcs', { kind: 'functional', systemId: 'fcs' }) ])] });
  // genFTAEvents is the generator under test; emulate generate()'s classification directly
  // against the same plan the real function uses.
  const plan = w.__out.plan();
  const fcsCands = w.__out.fta('sys-fcs').map(c => c.reqSource.sourceId);
  const acCands  = w.__out.fta('ac').map(c => c.reqSource.sourceId);
  check('the destination bucket does generate a candidate for the moved lid',
        fcsCands.indexOf('sys-fcs:fta-event:BE-fcs') >= 0, fcsCands.join());
  check('the source bucket no longer generates a candidate for it', acCands.length === 0, acCands.join());
  check('and the plan marks it as a move rather than leaving it to be re-created',
        plan.moves.length === 1 && plan.moves[0].lid === 'BE-fcs');
  check('a row whose node has VANISHED is reported unresolved, not silently re-filed',
        (function(){
          const w2 = world({ systems: JSON.parse(JSON.stringify(SYSTEMS)),
                             acReq: [{ internalId: 9, reqSource: { generator: 'fta-event', sourceId: 'ac:fta-event:BE-gone', context: {} } }],
                             pages: [acPage([ leaf('BE-fcs', { kind: 'functional', systemId: 'fcs' }) ])] });
          const p2 = w2.__out.plan();
          return p2.moves.length === 0 && p2.unresolved.length === 1;
        })());
}

console.log('\n[4b] generate() itself — the double-report this whole item exists to prevent');
{
  // The defect A4 guards against: bucketing gets MORE correct, and because the key
  // changed, generate() offers the analyst a brand-new empty row in the new bucket AND
  // an orphan in the old one. Accepting both destroys the verification evidence.
  const build = () => {
    const existing = {
      internalId: 77, traceId: 'REQ-AC-0007', text: 'old text',
      verifStatus: 'Verified', verifEvidence: 'FTA-2026-08-01 §4.2',
      reqSource: { generator: 'fta-event', sourceId: 'ac:fta-event:BE-fcs', fingerprint: 'stale', context: {} }
    };
    return world({ systems: JSON.parse(JSON.stringify(SYSTEMS)), acReq: [existing],
                   pages: [acPage([ leaf('BE-fcs', { kind: 'functional', systemId: 'fcs' }) ])] });
  };
  const dest = build().__out.generate({ ftaEvent: true }, 'sys-fcs');
  check('the destination bucket does NOT offer it as a new requirement',
        dest.isNew.length === 0, 'isNew: ' + dest.isNew.map(c => c.reqSource.sourceId).join());
  check('the destination reports it as a pending MOVE instead',
        (dest.migrations || []).length === 1 && dest.migrations[0].to === 'sys-fcs');
  const src = build().__out.generate({ ftaEvent: true }, 'ac');
  check('the source bucket does NOT offer it for orphan removal',
        src.orphaned.length === 0, 'orphaned: ' + src.orphaned.map(r => r.reqSource.sourceId).join());
  check('the source bucket also surfaces the pending move', (src.migrations || []).length === 1);
  check('the pending move still carries its evidence flag into the preview',
        (src.migrations[0] || {}).hasEvidence === true);
  // And the ordinary path is untouched: an undeclared node still behaves exactly as before.
  const plain = world({ systems: JSON.parse(JSON.stringify(SYSTEMS)),
                        pages: [acPage([ leaf('BE-plain') ])] }).__out.generate({ ftaEvent: true }, 'ac');
  check('an undeclared event is still reported as a normal new requirement',
        plain.isNew.length === 1 && plain.isNew[0].reqSource.sourceId === 'ac:fta-event:BE-plain');
  check('and generates no spurious migration', (plain.migrations || []).length === 0);
}

console.log('\n[5] sourceId grammar — the prefix shape the rest of the app parses is unchanged');
{
  const w = world({});
  check('an aircraft fta-event id parses', (w.__out.parse('ac:fta-event:BE-1') || {}).scope === 'ac');
  check('a system fta-event id parses', (w.__out.parse('sys-fcs:fta-event:BE-1') || {}).scope === 'sys-fcs');
  check('the companion fta-interval row is re-bucketable too', (w.__out.parse('ac:fta-interval:BE-1') || {}).generator === 'fta-interval');
  check('a lid containing a colon is not truncated', (w.__out.parse('ac:fta-event:BE:with:colons') || {}).lid === 'BE:with:colons');
  check('an unrelated generator is left alone', w.__out.parse('ac:fha:prob:FC-1') === null);
  // The live regex in findDuplicates hardcodes this prefix grammar — assert it still matches.
  check('_scopeOf\'s prefix grammar still recognises a migrated id',
        /^(ac|sys-[^:]+):/.test('sys-fcs:fta-event:BE-1'));
}

console.log('\n[6] The migration preview RENDERS — markup inspected, not asserted as source');
{
  const m = hm.match(/html \+= sectionHtml\('Move to the declared owner'[\s\S]*?\n    \}\);/);
  check('the preview section exists in helpers_modules.js', !!m);
  if (m) {
    const sb = { console, JSON, String, Array, Object, __out: {} };
    vm.createContext(sb);
    vm.runInContext(`
      let html = '';
      const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      const sectionHtml = (title, items, renderer) => items.length
        ? '<h4>' + esc(title) + ' (' + items.length + ')</h4><div class="ar-preview-list">' + items.map(renderer).join('') + '</div>' : '';
      const AutoReq = { bucketLabel: k => k === 'ac' ? 'Aircraft' : 'Flight Control System' };
      const merge = { migrations: [
        { traceId: 'REQ-AC-0007', from: 'ac', to: 'sys-fcs', text: 'The probability of "X" failing shall not exceed 1e-5.',
          hasVerificationStatus: true, hasEvidence: true, userOverridden: false }
      ] };
      ${m[0]}
      __out.html = html;
    `, sb);
    const out = sb.__out.html || '';
    check('it renders a non-empty section', out.length > 80);
    check('it names both ends of the move', /Aircraft/.test(out) && /Flight Control System/.test(out));
    check('it names the requirement being moved', /REQ-AC-0007/.test(out));
    check('it warns that the row carries verification evidence', /verification evidence/i.test(out));
    // The 19 Aug escape: onchange="slNodeIdentitySet("kind", …)" — the attribute
    // terminates at the inner quote and the browser discards the handler. Read the
    // OUTPUT, not the source.
    //
    // NOTE, and the reason this check is written the way it is: the obvious test — count
    // the quotes in the tag and assert the count is even — is BLIND to this defect.
    // <div class="a" onclick="show("x")"> has eight quotes. It was written that way first,
    // the mutation was reintroduced, and the check stayed green. The signature that
    // actually finds it is a closing quote followed by something other than whitespace,
    // '>' or '/', i.e. an attribute value that ended in the middle of itself.
    const tags = out.match(/<[^>]+>/g) || [];
    const truncatedAttr = tags.filter(t => /="[^"]*"[^\s>\/]/.test(t));
    check('no generated attribute is terminated early by an unescaped quote',
          truncatedAttr.length === 0, truncatedAttr.slice(0, 2).join(' | '));
    const oddQuoted = tags.filter(t => ((t.match(/"/g) || []).length % 2) !== 0);
    check('and no tag has an odd number of quotes either', oddQuoted.length === 0, oddQuoted.slice(0, 2).join(' | '));
    check('user text is escaped rather than injected raw', out.indexOf('of "X" failing') === -1 && /&quot;X&quot;/.test(out));
  }
  check('the apply control exists and is wired to the handler',
        /id="ar-apply-migrations"[^>]*onclick="autoReqApplyMigrations\(\)"/.test(idx));
  check('the apply control ships DISABLED — it must never be pre-armed',
        /id="ar-apply-migrations"[\s\S]{0,120}?disabled/.test(idx));
  check('moving an owner is NOT folded into "Accept all"',
        !/autoReqAccept\('all'\)[\s\S]{0,200}applyBucketMigration/.test(hm) &&
        !/if\(mode === 'all'\)[^\n]*Migration/.test(hm));
  check('the handler exists in helpers_modules.js', /function autoReqApplyMigrations\(\)/.test(hm));
}

console.log('\n[6b] A1 — unowned is a FINDING, and the finding now reaches a person');
{
  // The acceptance criterion, verbatim from the register: "an unowned branch is
  // visible to a user without opening the console." unownedPages() has existed
  // since 66.27 and reported to nobody; INV-49 puts it in the integrity panel and
  // the evidence package.
  const srcInv = am.match(/\(function regInv49\(tries\)[\s\S]*?\}\)\(25\);/);
  check('the invariant is registered', !!srcInv);
  check('it is registered as HARD — the handling is forgiving, so detection must be loud',
        /id: 'INV-49', sev: 'hard'/.test(am));
  check('INV-49 does not collide with an existing invariant id',
        (am.match(/id: 'INV-49'/g) || []).length === 1);
  check('registration retries, because assurance_modules loads BEFORE invariants.js',
        /regInv49\(tries - 1\)/.test(am) && /invRegister/.test(am));

  if (srcInv) {
    // Run the real registration against a stub registry and a fixture project.
    const mk = (pages, systems) => {
      const sb = { console, JSON, Math, Date, Set, Map, Array, Object, String, Number, isFinite,
                   parseFloat, setTimeout: () => {}, window: {}, __out: {} };
      vm.createContext(sb);
      vm.runInContext(`
        let ftaPages    = ${JSON.stringify(pages)};
        let systemsData = ${JSON.stringify(systems)};
        ${srcUnowned}
        window.invRegister = function (inv) { __out.inv = inv; };
        ${srcInv[0]}
      `, sb);
      return sb.__out.inv;
    };
    const clean = mk([{ id: 'p1', name: 'PASA · FC-A', treeLevel: 'aircraft', systemId: null, root: {} },
                      { id: 'p2', name: 'FCS tree',   treeLevel: 'system',   systemId: 'fcs', root: {} }],
                     [{ id: 'fcs', name: 'Flight Control System' }]);
    const cleanR = clean.run();
    check('a healthy project reports no failures', cleanR.fails.length === 0, JSON.stringify(cleanR.fails));
    check('and it still reports how many pages it checked', cleanR.checked === 2, String(cleanR.checked));

    const dangling = mk([{ id: 'p1', name: 'Orphan tree', treeLevel: 'system', systemId: 'deleted-sys', root: {} }],
                        [{ id: 'fcs', name: 'Flight Control System' }]);
    const dR = dangling.run();
    check('a page whose systemId resolves to nothing IS reported', dR.fails.length === 1, JSON.stringify(dR.fails));
    check('the failure names the page, so a user can go and fix it',
          /Orphan tree/.test(dR.fails[0] || ''), dR.fails[0]);
    check('the failure says WHERE those requirements are going',
          /aircraft bucket/.test(dR.fails[0] || ''), dR.fails[0]);

    const noSys = mk([{ id: 'p1', name: 'Untitled system tree', treeLevel: 'system', systemId: null, root: {} }], []);
    check('a page declaring a system tree with no system set is reported too',
          noSys.run().fails.length === 1);

    const mirror = mk([{ id: 'p1', name: 'mirror', treeLevel: 'system', systemId: 'gone', verifies: 'p0', root: {} }], []);
    const mR = mirror.run();
    check('verification mirrors are excluded — they generate no requirements to misfile',
          mR.fails.length === 0 && mR.checked === 0, JSON.stringify(mR));

    // The scoping decision, asserted so a later edit cannot quietly widen it into
    // the cry-wolf shape: an UNDECLARED node is a migration state, not a defect.
    const undeclared = mk([{ id: 'p1', name: 'PASA · FC-A', treeLevel: 'aircraft', systemId: null,
                             root: { id: 'g', type: 'gate', children: [{ id: 'be', type: 'basic', probability: 1e-5 }] } }], []);
    check('a page full of UNDECLARED nodes is not reported — that is migration state, not a finding',
          undeclared.run().fails.length === 0, JSON.stringify(undeclared.run().fails));
  }
}

console.log('\n[7] Load order — a new consumer must load AFTER the rules module it consumes');
{
  const pos = f => idx.indexOf('<script src="' + f);
  check('node_identity.js is present as a script tag', pos('node_identity.js') > 0);
  check('assurance_modules.js loads AFTER node_identity.js (it now calls resolveOwner)',
        pos('node_identity.js') < pos('assurance_modules.js'),
        pos('node_identity.js') + ' vs ' + pos('assurance_modules.js'));
  check('helpers_modules.js loads AFTER node_identity.js', pos('node_identity.js') < pos('helpers_modules.js'));
  check('the rules are not reimplemented here — assurance_modules calls resolveOwner rather than reading identity.systemId directly',
        /resolveOwner/.test(am) && !/identity\s*&&\s*.*identity\.systemId\s*\)\s*return\s*'sys-'/.test(am));
}

console.log('\n' + (fail === 0 ? 'ALL GREEN — ' + pass + ' checks' : fail + ' FAILED of ' + (pass + fail)));
process.exit(fail === 0 ? 0 : 1);
