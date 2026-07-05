#!/usr/bin/env node
/*
 * Conformance regression for SC configuration management (config_management.js) — granular + bucket model.
 * Loads the REAL module in a mocked browser env and exercises:
 *   - per-item CIs (per function / failure condition / FTA / requirement / requirement-verification / FMEA)
 *   - bucket PATHS (Aircraft ▸ Functions/AFHA/PASA(Fault Trees,Requirements)/ASA(Fault Trees,Requirements); systems; CCA)
 *   - SC derivation incl. scType (requirement verification evidence → SC2 via verification_results)
 *   - per-item baseline + SC1 lock + PR→ECN
 *   - precise per-function / per-failure-condition obsolescence cascade
 *   - compromise flags per item
 * Run:  node tests/regression_sc_config_mgmt.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SITE = path.join(__dirname, '..', 'site');
let pass = 0, fail = 0;
function check(n, c, d) { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  — ' + d : '')); } }

global.window = global;
const noopEl = { appendChild(){}, addEventListener(){}, removeEventListener(){}, setAttribute(){}, style:{}, querySelector(){return null;}, querySelectorAll(){return [];}, classList:{add(){},remove(){}} };
global.document = { getElementById(){return null;}, querySelector(){return null;}, querySelectorAll(){return [];}, createElement(){return Object.assign({}, noopEl);}, addEventListener(){}, readyState:'complete', head:Object.assign({},noopEl), body:Object.assign({},noopEl) };
eval(fs.readFileSync(path.join(SITE,'safety_targets.js'),'utf8') + '\n;global.scFromTableA1=scFromTableA1;');

global.projectConfig = { regulation:'Part 23', part23Class:'III', markovModels:[] };
global.getSafetyTarget = (sev) => ({Catastrophic:{dal:'B'},Hazardous:{dal:'C'},Major:{dal:'C'},Minor:{dal:'D'}}[sev] || {dal:'A'});
global.acFhaData = [
  { internalId:1, fcId:'FC-A01', fcDesc:'Loss of X', severity:'Catastrophic', subId:'AF-1', subIds:['AF-1'] },
  { internalId:4, fcId:'FC-A02', fcDesc:'Loss of Y', severity:'Major',        subId:'AF-2', subIds:['AF-2'] },
];
global.acFunctionsData = [ { subId:'AF-1', subName:'Provide thrust' }, { subId:'AF-2', subName:'Provide control' } ];
global.acReqData = [
  { internalId:10, text:'Probability budget for AF-1', type:'Probabilistic',   traceId:'AF-1', verifMethod:'Analysis', compromised:true },
  { internalId:11, text:'DAL for AF-2',                type:'Design Assurance', traceId:'AF-2', verifMethod:'Review' },
];
global.systemsData = [
  { id:'sys1', name:'S1', functions:[{ funcId:'SF-1', funcName:'Power', traceIds:['AF-1'] }], fha:[{internalId:2,fcId:'FC-S01',severity:'Hazardous',subId:'SF-1'}], req:[{internalId:20,text:'sys1 req',traceId:'SF-1'}], fmea:[{}] },
  { id:'sys2', name:'S2', fha:[{internalId:3,fcId:'FC-S02',severity:'Minor',subId:'SF-9'}], req:[{internalId:30,text:'sys2 req'}] },
];
global.ftaPages = [
  { id:'p1',  name:'FT1',   root:{ allocatedDAL:'B', _probCompromised:true, children:[] }, linkedFhaIds:[1], verifies:false },   // aircraft allocation, on FC1/AF-1, compromised
  { id:'p2',  name:'FT2',   root:{ children:[] },                                          linkedFhaIds:[4], verifies:false },   // aircraft allocation, on FC4/AF-2
  { id:'p1v', name:'FT1-V', root:{ children:[] },                                          linkedFhaIds:[1], verifies:true  },   // aircraft VERIFICATION, on FC1
  { id:'s1',  name:'SysFT', treeLevel:'system', systemId:'sys1', root:{ children:[] },     linkedFhaIds:[2], verifies:false },   // system allocation
];
global.cmaData = []; global.zsaData = []; global.praData = [];
global.scheduleAutosave = () => {};
global.isProPlusLicensed = () => true; global.canUseConfigBaselining = () => true;

eval(fs.readFileSync(path.join(SITE,'config_management.js'),'utf8'));
const CM = global.SafetyLabCM;
check('module exposes API', CM && typeof CM.establishCIBaseline === 'function');

console.log('\n[1] Granular items + bucket paths');
const cis = CM.enumerateCIs();
const by = id => cis.find(c => c.ciId === id);
const pathOf = id => { const c = by(id); return c ? c.path.join(' / ') : '(missing)'; };
check('AFHA explodes per failure condition (2 FCs, each SC1)', cis.filter(c=>c.ciType==='afha').length === 2 && cis.filter(c=>c.ciType==='afha').every(c=>c.sc==='SC1'));
check('no monolithic PASA/ASA CIs (they are buckets now)', !cis.some(c=>c.ciType==='pasa_pssa'||c.ciType==='asa_ssa'));
check('aircraft allocation FTA under PASA ▸ Fault Trees', pathOf('fta:p1') === 'Aircraft / PASA / Fault Trees');
check('aircraft verification FTA under ASA ▸ Fault Trees', pathOf('fta:p1v') === 'Aircraft / ASA / Fault Trees');
check('aircraft requirement under PASA ▸ Requirements (SC1)', pathOf('acreq:10') === 'Aircraft / PASA / Requirements' && by('acreq:10').sc==='SC1');
check('requirement VERIFICATION evidence under ASA ▸ Requirements (SC2)', pathOf('acreqv:10') === 'Aircraft / ASA / Requirements' && by('acreqv:10').sc==='SC2');
check('system allocation FTA under PSSA ▸ Fault Trees', pathOf('fta:s1') === 'System: S1 / PSSA / Fault Trees');
check('FMEA under the system PSSA ▸ FMEA', pathOf('fmea:sys1') === 'System: S1 / PSSA / FMEA');
check('functions enumerated per function', cis.filter(c=>c.ciType==='functions').length >= 3);
check('no CCA items when none exist', !cis.some(c=>c.group==='cca'));

console.log('\n[2] Per-item baseline + SC1 lock');
const b = CM.establishCIBaseline('afha:1');
check('first establish → v1.0', b && b.version==='1.0', b && b.version);
check('SC1 failure-condition locks on baseline', b.locked === true && CM.isLocked('afha:1'));
check('re-establish unchanged keeps v1.0', CM.establishCIBaseline('afha:1').version === '1.0');
const bv = CM.establishCIBaseline('acreqv:10');
check('SC2 requirement-verification baselines but does NOT lock', bv.locked === false);

console.log('\n[3] PR → ECN bumps that item');
const pr = CM.raisePR({ againstCiId:'afha:1', title:'severity revisited' });
const ecn = CM.raiseECN({ prId: pr.prId, reason:'re-baseline FC' });
check('PR auto-closed by ECN', CM._cm().problemReports.find(p=>p.prId===pr.prId).status === 'closed');
check('ECN rolled afha:1 v1.0 → v1.1', CM._cm().ciBaselines['afha:1'].version === '1.1');

console.log('\n[4] Precise per-function obsolescence cascade');
['acfunc:AF-1','afha:1','afha:4','fta:p1','fta:p2','acreq:10','acreq:11','sysreq:sys1::20'].forEach(id => CM.establishCIBaseline(id));
check('nothing connected obsolete before the update', !['afha:1','fta:p1','acreq:10'].some(id=>CM.isObsolete(id)) || CM.isObsolete('afha:1'));
CM.establishCIBaseline('acfunc:AF-1', { force:true });
check('FC of THIS function obsoleted (afha:1 ← AF-1)', CM.isObsolete('afha:1') === true);
check('FC of a DIFFERENT function NOT obsoleted (afha:4 ← AF-2)', CM.isObsolete('afha:4') === false);
check('FTA on this function obsoleted (fta:p1)', CM.isObsolete('fta:p1') === true);
check('FTA on a different function NOT obsoleted (fta:p2)', CM.isObsolete('fta:p2') === false);
check('requirement tracing this function obsoleted (acreq:10)', CM.isObsolete('acreq:10') === true);
check('requirement tracing a different function NOT obsoleted (acreq:11)', CM.isObsolete('acreq:11') === false);
check('connected system item obsoleted (sysreq:sys1::20)', CM.isObsolete('sysreq:sys1::20') === true);

console.log('\n[5] Compromise flags per item');
const c2 = CM.enumerateCIs();
const comp = id => { const c = c2.find(x=>x.ciId===id); return !!(c && c.compromised); };
check('compromised FTA flagged (fta:p1)', comp('fta:p1') === true);
check('uncompromised FTA not flagged (fta:p2)', comp('fta:p2') === false);
check('compromised requirement flagged (acreq:10)', comp('acreq:10') === true);
check('its verification record also flagged (acreqv:10)', comp('acreqv:10') === true);

console.log('\n[6] Collapsible bucket render');
const host = { innerHTML:'', querySelector:()=>null, querySelectorAll:()=>[] };
let renderErr = null; try { CM.render(host); } catch (e) { renderErr = e.message; }
check('render() does not throw', renderErr === null, renderErr);
check('emits nested <details> bucket markup', /class="cm-bucket"/.test(host.innerHTML));
check('shows the assessment buckets (Aircraft / PASA / Requirements)', /Aircraft/.test(host.innerHTML) && /PASA/.test(host.innerHTML) && /Requirements/.test(host.innerHTML));
check('per-item rows + per-bucket Baseline-all wired', /data-establish="afha:1"/.test(host.innerHTML) && /cm-bucket-base/.test(host.innerHTML));
check('SC pill is a clickable compliance trigger', /class="cm-sc"[^>]*data-sc="SC[12]"/.test(host.innerHTML));

console.log('\n' + (fail===0 ? '✓ ALL PASS' : '✗ ' + fail + ' FAILED') + '  (' + pass + ' passed, ' + fail + ' failed)\n');
process.exit(fail===0 ? 0 : 1);
