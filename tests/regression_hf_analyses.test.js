/*
 * regression_hf_analyses.test.js — HF'S OWN ANALYSES (30 Aug 2026, Waqas:
 * "human factors is not just about assumptions, that is one angle linking it
 * to the safety analyses").
 *
 * hf_analyses.js carries three deterministic authoring surfaces that exist
 * BEFORE anything is credited into the safety argument:
 *   - Function Allocation (crew / automation / shared, per live sub-function)
 *   - Human Error Analysis (NUREG/CR-1278 discrete error modes per crew task)
 *   - Crew Alerting inventory (25.1322 priority + modality, FC links)
 *
 * Proven here, EXECUTED in vm against golden-shaped fixtures:
 *  1. READS DON'T WRITE — rendering never creates projectConfig.hf (the
 *     ram_predict v0.1 battery lesson); only authored actions do.
 *  2. The findings have teeth: credited-but-unallocated joins the product's
 *     own links (fha.assumptionIds -> HF-typed asmId; fha.subId -> function;
 *     function.internalId -> allocation row); HEA names tasks analyzed for
 *     time but not error, rows without detection/recovery, dangling FC ids;
 *     alerts names orphans and dangling links.
 *  3. Vocabularies are the cited ones, exactly (NUREG/CR-1278 modes; 25.1322
 *     priorities/modalities) — off-vocabulary writes are refused.
 *  4. Ids never recycle after a removal.
 *  5. Exports exist for all three (data_ops cases + buttons), the views are
 *     wired (nav, view divs, script tag, switchTab wrap), pins are floors.
 *
 * Mutations proven red: render creates the store; credit check unplugged;
 * an invented error mode; export case dropped; id recycling restored.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SITE = path.join(__dirname, '..', 'site');
const src = fs.readFileSync(path.join(SITE, 'hf_analyses.js'), 'utf8');
const dataOpsSrc = fs.readFileSync(path.join(SITE, 'data_ops_modules.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('  ok   ' + name);
  else { failures++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

function fakeDoc(ids) {
  const els = {};
  ids.forEach(id => { els[id] = { id, innerHTML: '', style: {} }; });
  return { getElementById: id => els[id] || null, _els: els };
}
function sandbox(cfg, extra) {
  const doc = fakeDoc(['hfa-alloc-host', 'hfa-hea-host', 'hfa-alerts-host',
    'view-hfa-alloc', 'view-hfa-hea', 'view-hfa-alerts']);
  const sb = Object.assign({
    window: {}, document: doc, console, Array, Object, String, Number, Math, JSON, RegExp, parseInt, isNaN,
    projectConfig: cfg,
  }, extra || {});
  sb.window.switchTab = function () {};
  vm.createContext(sb);
  vm.runInContext(src, sb);
  return { sb, doc, api: sb.window.HF_ANALYSES };
}

// golden-shaped joined fixtures (field names from the real Aeolus export)
const FNS = [
  { internalId: 'i1', subId: 'SF-001', subName: 'Generate forward thrust' },
  { internalId: 'i2', subId: 'SF-002', subName: 'Decelerate on ground (wheel braking)' },
  { internalId: 'i3', subId: 'SF-003', subName: 'Pressurize the cabin' },
];
const HF_ASM = [{ asmId: 'ASM-7', statement: 'Crew responds to brake failure alert within 3 s', type: 'Human Factors', state: 'Proposed' }];
const FHA = [
  { internalId: 'f1', fcId: 'FC-01', subId: 'SF-002', fcDesc: 'Loss of wheel braking', assumptionIds: ['ASM-7'], severity: 'Hazardous' },
  { internalId: 'f2', fcId: 'FC-02', subId: 'SF-001', fcDesc: 'Loss of thrust', assumptionIds: [], severity: '' },
];

/* ------------------------------------------------------------------ */
console.log('1. reads don\'t write (the battery lesson)');
{
  const cfg = {};
  const s = sandbox(cfg, { acFunctionsData: FNS, acFhaData: FHA, acAssumptionsData: HF_ASM });
  s.api.renderAlloc(); s.api.renderHea(); s.api.renderAlerts();
  s.api.allocFindings(); s.api.heaFindings(); s.api.alertFindings();
  check('rendering + findings on a fresh project create NO projectConfig.hf', !('hf' in cfg), JSON.stringify(Object.keys(cfg)));
  s.api.setAlloc('i2', 'allocation', 'crew');
  check('an AUTHORED action creates the store and writes the row',
    cfg.hf && cfg.hf.alloc && cfg.hf.alloc.rows.length === 1 && cfg.hf.alloc.rows[0].allocation === 'crew' &&
    cfg.hf.alloc.rows[0].subId === 'SF-002');
}

/* ------------------------------------------------------------------ */
console.log('2. allocation — the credit check has teeth');
{
  const cfg = {};
  const s = sandbox(cfg, { acFunctionsData: FNS, acFhaData: FHA, acAssumptionsData: HF_ASM });
  let f = s.api.allocFindings();
  check('unallocated coverage: all functions named before any authoring', f.unallocated.length === 3);
  check('CREDITED-BUT-UNALLOCATED fires: FC-01 credits ASM-7 (HF-typed) on SF-002 with no crew/shared allocation',
    f.creditedUnallocated.length === 1 && f.creditedUnallocated[0].fcId === 'FC-01' && f.creditedUnallocated[0].subId === 'SF-002');
  check('a condition with NO HF credit never fires the check (FC-02 absent)',
    !f.creditedUnallocated.some(c => c.fcId === 'FC-02'));
  s.api.setAlloc('i2', 'allocation', 'automation');
  f = s.api.allocFindings();
  check('allocating AUTOMATION does not clear a crew-credit finding (credit needs crew or shared)',
    f.creditedUnallocated.length === 1);
  s.api.setAlloc('i2', 'allocation', 'crew');
  f = s.api.allocFindings();
  check('allocating CREW clears it', f.creditedUnallocated.length === 0 && f.unallocated.length === 2);
  check('off-vocabulary allocation is refused',
    (() => { s.api.setAlloc('i1', 'allocation', 'robot'); return !s.api._read('alloc').rows.some(r => r.allocation === 'robot'); })());
  cfg.hf.alloc.rows.push({ key: 'GONE', subId: 'SF-999', allocation: 'crew' });
  check('an allocation for a deleted function is named stale, never silently kept',
    s.api.allocFindings().stale.some(r => r.subId === 'SF-999'));
  s.api.renderAlloc();
  const html = s.doc._els['hfa-alloc-host'].innerHTML;
  check('the table renders every live function with its allocation + export button',
    /SF-001/.test(html) && /SF-003/.test(html) && /HF_Allocation/.test(html) && /1 \/ 3 allocated/.test(html));   // i2 crew; i1 row exists but off-vocab write was refused (empty); i3 untouched
  const empty = sandbox({}, { acFunctionsData: [], acFhaData: [], acAssumptionsData: [] });
  empty.api.renderAlloc();
  check('teach-on-empty explains the decision and points at the Functions lane first',
    /Who does what/.test(empty.doc._els['hfa-alloc-host'].innerHTML) && /No functions yet/.test(empty.doc._els['hfa-alloc-host'].innerHTML));
}

/* ------------------------------------------------------------------ */
console.log('3. human error analysis');
{
  const cfg = {};
  const s = sandbox(cfg, { acFunctionsData: FNS, acFhaData: FHA, acAssumptionsData: HF_ASM });
  check('cited vocabulary, exactly NUREG/CR-1278\'s five discrete modes',
    JSON.stringify(s.api.ERROR_MODES) === JSON.stringify(['omission', 'commission', 'timing', 'sequence', 'selection']));
  let f = s.api.heaFindings();
  check('a crew task with no error row is named (analyzed for time, not for error)',
    f.tasksWithoutError.length === 1 && f.tasksWithoutError[0].asmId === 'ASM-7');
  s.api.addHea();
  s.api.setHea(0, 'asmId', 'ASM-7');
  s.api.setHea(0, 'errorMode', 'omission');
  s.api.setHea(0, 'fcIds', 'FC-01, FC-99');
  f = s.api.heaFindings();
  check('covering the task clears that finding', f.tasksWithoutError.length === 0);
  check('a row with a mode but no detection/recovery stays OPEN', f.open.length === 1);
  check('a dangling FC link is named (FC-99 not on the FHA)',
    f.dangling.length === 1 && f.dangling[0].fcId === 'FC-99');
  s.api.setHea(0, 'detection', 'EICAS message'); s.api.setHea(0, 'recovery', 'manual braking reversion');
  check('detection + recovery close the open finding', s.api.heaFindings().open.length === 0);
  check('an invented error mode is refused',
    (() => { s.api.setHea(0, 'errorMode', 'confusion'); return s.api._read('hea').rows[0].errorMode === 'omission'; })());
  s.api.addHea(); s.api.removeHea(0);
  s.api.addHea();
  const ids = s.api._read('hea').rows.map(r => r.heaId);
  check('ids never recycle after a removal', new Set(ids).size === ids.length, JSON.stringify(ids));
  s.api.renderHea();
  check('render carries the taxonomy citation and the no-invented-probabilities line',
    /NUREG\/CR-1278/.test(s.doc._els['hfa-hea-host'].innerHTML) && /would be a rumor/.test(s.doc._els['hfa-hea-host'].innerHTML));
}

/* ------------------------------------------------------------------ */
console.log('4. crew alerting');
{
  const cfg = {};
  const s = sandbox(cfg, { acFunctionsData: FNS, acFhaData: FHA, acAssumptionsData: HF_ASM });
  check('25.1322 vocabularies, exactly',
    JSON.stringify(s.api.ALERT_PRIORITIES) === JSON.stringify(['Warning', 'Caution', 'Advisory']) &&
    JSON.stringify(s.api.ALERT_MODALITIES) === JSON.stringify(['visual', 'aural', 'tactile']));
  s.api.addAlert();
  s.api.setAlert(0, 'name', 'BRAKE FAIL'); s.api.setAlert(0, 'priority', 'Caution');
  let f = s.api.alertFindings();
  check('an alert no condition cites is an orphan', f.orphans.length === 1);
  s.api.setAlert(0, 'fcIds', 'FC-01, FC-77');
  f = s.api.alertFindings();
  check('linking clears the orphan; the dangling id is named',
    f.orphans.length === 0 && f.dangling.length === 1 && f.dangling[0].fcId === 'FC-77');
  check('an off-vocabulary priority is refused',
    (() => { s.api.setAlert(0, 'priority', 'Urgent'); return s.api._read('alerts').rows[0].priority === 'Caution'; })());
  s.api.renderAlerts();
  check('render: table + export + the not-certifying honesty line',
    /BRAKE FAIL/.test(s.doc._els['hfa-alerts-host'].innerHTML) && /HF_Alerts/.test(s.doc._els['hfa-alerts-host'].innerHTML) &&
    /does not certify the alerting system/.test(s.doc._els['hfa-alerts-host'].innerHTML));
}

/* ------------------------------------------------------------------ */
console.log('5. wiring — views, exports, pins');
{
  const s = sandbox({}, { acFunctionsData: FNS, acFhaData: FHA, acAssumptionsData: HF_ASM });
  s.sb.window.switchTab('hfa-hea');
  check('switchTab wrap reveals the HEA view and hides the other two',
    s.doc._els['view-hfa-hea'].style.display === 'block' && s.doc._els['view-hfa-alloc'].style.display === 'none' &&
    s.doc._els['view-hfa-alerts'].style.display === 'none');
  s.sb.window.switchTab('fha');
  check('any other tab hides all three', s.doc._els['view-hfa-hea'].style.display === 'none');

  check('all three export cases exist in data_ops (mirror-the-module, refuse-empty discipline)',
    /case 'HF_Allocation':/.test(dataOpsSrc) && /case 'HF_HEA':/.test(dataOpsSrc) && /case 'HF_Alerts':/.test(dataOpsSrc) &&
    /No error rows in the human error analysis yet/.test(dataOpsSrc));
  check('allocation export never drops unallocated functions (UNALLOCATED is a value, not a filter)',
    /UNALLOCATED/.test(dataOpsSrc));
  check('nav: the three analyses sit in the Human Factors group',
    ['hfa-alloc', 'hfa-hea', 'hfa-alerts'].every(t => new RegExp('snav-' + t).test(indexSrc)));
  check('views + hosts exist in index.html',
    ['view-hfa-alloc', 'hfa-alloc-host', 'view-hfa-hea', 'hfa-hea-host', 'view-hfa-alerts', 'hfa-alerts-host'].every(id => indexSrc.indexOf('id="' + id + '"') >= 0));
  function pin(re) { const m = indexSrc.match(re); return m ? parseFloat(m[1]) : -1; }
  check('hf_analyses.js loaded cache-busted after the register panel, floor >= 1.0',
    pin(/hf_analyses\.js\?v=([\d.]+)/) >= 1.0 &&
    indexSrc.indexOf('hf_analyses.js?v=') > indexSrc.indexOf('hf_register_panel.js?v='));
  check('data_ops pin floor >= 66.22 (three HF export cases)', pin(/data_ops_modules\.js\?v=([\d.]+)/) >= 66.22);
  check('classes live under hfx-*; no stylesheet',
    (() => {
      // Exempt list = classes the HF lanes borrow from the house ON PURPOSE. review-col is
      // the shared Review column (1 Sep 2026). The five row-action classes are the shared
      // kebab (2 Sep 2026): the HF action cell is byte-compatible with rowActionsHTML's so
      // the shared menu positioner and mass_actions.js work here unchanged — inventing
      // hfx- equivalents would break exactly the reuse they exist for.
      // The five modal classes are the house modal (2 Sep 2026, the table refactor): the HF
      // edit modal uses the same .modal-overlay/.modal/.modal-head/.modal-body/.modal-foot
      // the template editor and golden-thread panel use, and so inherits dark mode, the
      // focus ring and scroll behaviour instead of restating them under hfx- names.
      const SHARED = new Set(['u-mono', 'btn-cyan', 'data-table', 'review-col',
                              'row-actions', 'row-kebab', 'row-action-menu', 'ram-danger', 'backref-trigger',
                              'modal-overlay', 'modal', 'modal-head', 'modal-body', 'modal-foot']);
      const cls = [...src.matchAll(/class="([a-z0-9-]+)/g)].map(m => m[1]).filter(c => !SHARED.has(c));
      return cls.length > 2 && cls.every(c => c.startsWith('hfx-'));
    })() && !/<style/.test(src));
  check('module is deterministic: no model calls, no RNG, no Date in stores',
    !/Provider\.complete/.test(src) && !/Math\.random/.test(src));
}

/* ------------------------------------------------------------------ */
console.log('6. task-first task analysis + ergo register (30 Aug — "it does not start with just an assumption")');
{
  const cfg = {};
  const asm = [];
  const s = sandbox(cfg, { acFunctionsData: FNS, acFhaData: FHA, acAssumptionsData: asm, acAsmCounter: 7, renderACAssumptions: function () {} });
  s.sb.acAsmCounter = 7;
  s.api.renderTasks && s.api.renderTasks();
  check('reads don\'t write holds for the new stores too', !('hf' in cfg));
  s.api.addTask();
  s.api.setTask(0, 'phase', 'Landing');
  s.api.setTask(0, 'crewmember', 'PF');
  s.api.setTask(0, 'task', 'Apply manual wheel braking');
  s.api.setTask(0, 'timeS', '4');
  s.api.setTask(0, 'basis', 'HIDH preset');
  check('a task exists WITHOUT any assumption (primary analysis)',
    cfg.hf.tasks.rows.length === 1 && cfg.hf.tasks.rows[0].asmId === '' && asm.length === 0);
  s.api.creditTask(0);
  const t = cfg.hf.tasks.rows[0];
  check('CREDIT promotes through the product store: ASM id minted, register row typed Human Factors',
    /^ASM-AC-007$/.test(t.asmId) && asm.length === 1 && asm[0].type === 'Human Factors' && asm[0].asmId === t.asmId);
  check('the task facts carry into hf metadata (phase, crew, time + basis)',
    asm[0].hf.responsePhase === 'Landing' && asm[0].hf.crewmember === 'PF' && asm[0].hf.taskTimeS === 4 && /HIDH/.test(asm[0].hf.taskTimeBasis));
  check('crediting is idempotent (a credited task cannot mint twice)',
    (() => { s.api.creditTask(0); return asm.length === 1; })());
  check('engineer-authored: the promoted assumption carries NO ai* provenance',
    !('aiGenerated' in asm[0]) && !('aiModel' in asm[0]));
  s.api.addTask(); s.api.removeTask(1); s.api.addTask();
  const tids = cfg.hf.tasks.rows.map(r => r.taskId);
  check('task ids never recycle', new Set(tids).size === tids.length, JSON.stringify(tids));
  // ergo register
  s.api.addErgo();
  s.api.setErgo(0, 'item', 'Gear lever');
  s.api.setErgo(0, 'clause', 'ISO 9241-410');
  s.api.setErgo(0, 'finding', 'reach exceeds seated envelope');
  check('ergo row authored with Open default', cfg.hf.ergo.rows[0].status === 'Open');
  check('off-vocabulary ergo status refused',
    (() => { s.api.setErgo(0, 'status', 'Maybe'); return cfg.hf.ergo.rows[0].status === 'Open'; })());
  s.api.setErgo(0, 'status', 'Closed');
  check('Closed accepted', cfg.hf.ergo.rows[0].status === 'Closed');
  // wiring: exports + page hosts + data actions
  check('HF_Tasks + HF_Ergo export cases exist (refuse-empty discipline)',
    /case 'HF_Tasks':/.test(dataOpsSrc) && /case 'HF_Ergo':/.test(dataOpsSrc) && /No crew tasks authored yet/.test(dataOpsSrc));
  const hfrSrc = fs.readFileSync(path.join(SITE, 'hf_register_panel.js'), 'utf8');
  check('Task Analysis renders the authored-tasks host ABOVE the credited ledger',
    (() => { const fn = hfrSrc.split('function renderHfaTask()')[1].split('function ')[0]; const hostIdx = fn.indexOf('hfa-tasks-host'); const ledgerIdx = fn.indexOf('taskAnalysisPanel(hf, author)'); return hostIdx > 0 && ledgerIdx > hostIdx; })());
  check('Ergonomics page carries the register host + HF_Ergo Data Actions',
    /hfa-ergo-register-host/.test(hfrSrc) && /_hfDataActions\('HF_Ergo'\)/.test(hfrSrc));
  check('all HF pages carry the uniform Data Actions dropdown (register/task/ergo in the renderers)',
    (hfrSrc.match(/_hfDataActions\(/g) || []).length >= 3);
  // 3 Sep 2026 (Waqas: no internal language on analysis pages) — the check is named in words.
  check('the phase-workload scope honesty line is on the page (credited-only, widening gated)',
    /phase-workload red line currently sums CREDITED tasks/.test(fs.readFileSync(path.join(SITE, 'hf_analyses.js'), 'utf8')));
}

console.log('8. response time = reaction + execution; available time from the mission profile; multi-phase (3 Sep 2026)');
{
  const cfg = {}; const asm = [];
  const phases = [
    { phase: 'Takeoff', duration: '2', durationUnit: 'mins' },                    // 120 s, no window → derived
    { phase: 'Climb',   duration: '20', durationUnit: 'mins', windowS: '45' },     // authored 45 s window
    { phase: 'Cruise',  duration: '4', durationUnit: 'hours' },
  ];
  const s = sandbox(cfg, { acFunctionsData: FNS, acFhaData: FHA, acAssumptionsData: asm, acAsmCounter: 1, renderACAssumptions: function () {}, flightPhasesData: phases, parseFloat });
  s.sb.acAsmCounter = 1;
  s.api.addTask();
  s.api.setTask(0, 'phase', 'Takeoff, Climb');
  s.api.setTask(0, 'crewmember', 'PM');
  s.api.setTask(0, 'task', 'Secure the failed engine');
  s.api.setTask(0, 'reactionS', '1.5');
  s.api.setTask(0, 'execS', '12');
  s.api.setTask(0, 'basis', 'reaction: HIDH choice-reaction norm; execution: sim session S-14');
  const r = cfg.hf.tasks.rows[0];
  check('response = reaction + execution (computed, never stored)', s.api.taskResponseS(r) === 13.5 && r.responseS === undefined);
  const av = s.api.taskAvailableS(r);
  check('available time is read from the mission profile: the most constraining of the phases named (Climb window 45 s beats Takeoff 120 s)', av.s === 45 && av.src === 'response window' && av.derived === false && av.per.length === 2, JSON.stringify(av));
  check('…and a phase with no authored window falls back to its duration, marked derived', av.per.find(x => x.phase === 'Takeoff').s === 120 && av.per.find(x => x.phase === 'Takeoff').src === 'phase duration');
  check('occupancy = response ÷ available (13.5 / 45 = 30 %)', Math.round(s.api.taskOccupancy(r) * 100) === 30);
  s.api.addTask(); s.api.setTask(1, 'phase', 'All phases'); s.api.setTask(1, 'timeS', '4');
  const r2 = cfg.hf.tasks.rows[1];
  check('a legacy single time still reads as the response', s.api.taskResponseS(r2) === 4);
  check('"All phases" takes the most constraining phase of the whole profile', s.api.taskAvailableS(r2).s === 45);
  s.api.addTask(); s.api.setTask(2, 'phase', 'Cruise');
  check('no times → no response, no occupancy; available still reads (4 h = 14400 s, derived)', s.api.taskResponseS(cfg.hf.tasks.rows[2]) === null && s.api.taskOccupancy(cfg.hf.tasks.rows[2]) === null && s.api.taskAvailableS(cfg.hf.tasks.rows[2]).s === 14400);
  s.api.creditTask(0);
  const a = asm[0];
  check('credit carries the RESPONSE (sum) as the task time, plus both components, and the phase SET', a && a.hf.taskTimeS === 13.5 && a.hf.reactionS === 1.5 && a.hf.executionS === 12 && a.hf.responsePhase === 'Takeoff, Climb' && /S-14/.test(a.hf.taskTimeBasis));
  check('the Task Analysis schema splits the time: Reaction, Execution, computed Response, Available and Occupancy; Phases is a multi-select',
    (() => { const hf = fs.readFileSync(path.join(SITE, 'hf_analyses.js'), 'utf8'); return /k: 'reactionS',\s+label: 'Reaction \(s\)'/.test(hf) && /k: 'execS',\s+label: 'Execution \(s\)'/.test(hf) && /k: 'responseS',\s+label: 'Response \(s\)', ro: true/.test(hf) && /k: 'availableS',\s+label: 'Available \(s\)', ro: true/.test(hf) && /k: 'occupancy',\s+label: 'Occupancy', ro: true/.test(hf) && /k: 'phase',\s+label: 'Phases', optsFn: 'projectPhases', multi: true/.test(hf); })());
  check('the modal renders a multi-select as a checkbox group saved as a comma-separated set', /data-hf-multi-group/.test(fs.readFileSync(path.join(SITE, 'hf_analyses.js'), 'utf8')) && /querySelectorAll\('input\[type="checkbox"\]:checked'\)/.test(fs.readFileSync(path.join(SITE, 'hf_analyses.js'), 'utf8')));
  check('the phase-workload check counts a multi-phase task in every phase it names', /keys\.includes\('all phases'\) \|\| keys\.includes\(_phaseKey\(ph\.id\)\)/.test(fs.readFileSync(path.join(SITE, 'hf_assumptions.js'), 'utf8')));
  check('the HF_Tasks CSV carries Reaction / Execution / Response and imports them (simulator logs land here)', (() => { const d = fs.readFileSync(path.join(SITE, 'data_ops_modules.js'), 'utf8'); return /'Reaction \(s\)','Execution \(s\)','Response \(s\)'/.test(d) && /reactionS: getValue\(row, \['Reaction \(s\)','Reaction'\]\)/.test(d); })());
}

console.log(failures ? ('FAILED — ' + failures + ' check(s)') : 'ALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
