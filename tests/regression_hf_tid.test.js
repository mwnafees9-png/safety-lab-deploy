// regression_hf_tid.test.js — the Task Identification lane (stage 1 of the task chain).
//
// WHAT THIS LOCKS. Waqas, 1 Sep 2026: "a tab for Task identification, then task
// analysis similar to how we did functions then FCIM and then hazard assessment,
// gives more directed inputs." Task Identification is the FUNCTIONS lane of the
// task chain: enumerate first, decompose second, assess third. This file pins the
// enumeration end — the store, the CRUD, the five findings, the vocabularies, and
// every wiring point the lane needs to actually appear and round-trip.
//
// The finding that matters most: a task step with no cited procedure source. An
// uncited task is a task somebody invented, and the whole point of putting the
// POH in front of the model was to stop that happening.

const fs = require('fs');
const path = require('path');
const SITE = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(SITE, f), 'utf8');

// Version pins are DOTTED VERSIONS, not decimals. parseFloat('1.10') is 1.1, which
// compares as OLDER than 1.9 — so a float comparison calls a freshly bumped module
// stale and fails the wall for no reason (hit 2 Sep 2026 when hf_analyses went 1.9 -> 1.10).
// Compare segment by segment, and compare a FLOOR: a version moves for any reason that
// touches the file, and a wall that fails on a routine bump teaches people to edit the
// test instead of reading it. The floor still catches the real error — a changed module
// shipped behind a stale pin.
function pinAtLeast(html, file, floor) {
    const m = html.match(new RegExp(file.replace(/\./g, '\\.') + '\\.js\\?v=([\\d.]+)'));
    if (!m) return false;
    const a = m[1].split('.').map(Number), b = String(floor).split('.').map(Number);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i] || 0, y = b[i] || 0;
        if (x !== y) return x > y;
    }
    return true;
}

// Header version as a FLOOR, compared segment-wise. An equality pin (or an alternation
// of the two versions that happened to exist the day it was written) fails on a correct
// bump, which teaches people to edit the test instead of reading it — and 1.10 is not
// less than 1.9, however parseFloat feels about it.
function headerAtLeast(src, file, floor) {
    const m = src.match(new RegExp(file.replace(/\./g, '\\.') + '\\.js\\s+—\\s+v([\\d.]+)'));
    if (!m) return false;
    const a = m[1].split('.').map(Number), b = String(floor).split('.').map(Number);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i] || 0, y = b[i] || 0;
        if (x !== y) return x > y;
    }
    return true;
}
let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL ' + name + (extra ? ('\n       ' + extra) : '')); }
}

console.log('\nregression_hf_tid — Task Identification lane\n');

// ---------------------------------------------------------------- module
const src = R('site/hf_analyses.js');

ok('module version at or past 1.8 (the release TID shipped in)', headerAtLeast(src, 'hf_analyses', '1.8'));
ok('TID_MODES is the four operating modes', /var TID_MODES = \['Normal', 'Non-normal', 'Emergency', 'Ground'\]/.test(src));
ok('TID_CREW carries PF/PM/Either/Both/Ground crew', /var TID_CREW = \['PF', 'PM', 'Either', 'Both', 'Ground crew'\]/.test(src));

['addTid', 'setTid', 'removeTid', 'tidFindings', 'renderTid'].forEach(fn => {
    ok('defines ' + fn, new RegExp('function ' + fn + '\\s*\\(').test(src));
});

ok('rides projectConfig.hf.tid via _ensure/_read', /_ensure\('tid'\)/.test(src) && /_read\('tid'\)/.test(src));
ok('no new top-level store', !/projectConfig\.tid/.test(src));
ok('ids are minted TSK- through the shared _nextId', /_nextId\(st\.rows, 'taskId', 'TSK-'\)/.test(src));
ok('a new row carries every authored field', /procId: '', procName: '', opsMode: 'Normal', phase: ''/.test(src) &&
    /taskName: '', taskDef: '', crew: '', trigger: '', source: '', notes: ''/.test(src));

// vocabulary guards — the lane refuses values outside its own enumerations
ok('setTid rejects an off-vocabulary opsMode', /field === 'opsMode' && TID_MODES\.indexOf\(value\) < 0\) return/.test(src));
ok('setTid rejects an off-vocabulary crew', /field === 'crew' && value && TID_CREW\.indexOf\(value\) < 0\) return/.test(src));
ok('opsMode guard has no blank escape (Normal is the default, not empty)',
    !/field === 'opsMode' && value && TID_MODES/.test(src));

// ---------------------------------------------------------------- findings
ok('findings: uncited source', /var uncited = rows\.filter\(function \(r\) \{ return !String\(r\.source \|\| ''\)\.trim\(\); \}\)/.test(src));
ok('findings: no crewmember', /var noCrew = rows\.filter/.test(src));
ok('findings: no trigger', /var noTrigger = rows\.filter/.test(src));
ok('findings: operating-mode coverage gaps', /var modeGaps = TID_MODES\.filter\(function \(m\) \{ return !covered\[m\]; \}\)/.test(src));
ok('findings: duplicate task ids', /dupes\.indexOf\(id\) < 0\) dupes\.push\(id\)/.test(src));
ok('findings return all five plus a count', /return \{ uncited: uncited, noCrew: noCrew, noTrigger: noTrigger, modeGaps: modeGaps, dupes: dupes, count: rows\.length \}/.test(src));
ok('findings are computed, never persisted', !/rows\[i\]\.findings\s*=/.test(src) && !/\.uncited\s*=\s*/.test(src));

// ---------------------------------------------------------------- render
ok('renders into hfa-tid-host', /getElementById\('hfa-tid-host'\)/.test(src));
ok('teaching card names the functions-lane mirror', /functions lane is to the failure chain/.test(src));
ok('teaching card states the uncited-step doctrine', /a step somebody invented/.test(src));
ok('uncited rows carry a visible left flag', /rowStyle: function \(r\) \{ return String\(r\.source \|\| ''\)\.trim\(\) \? '' : 'border-left:3px solid #B7791F;'; \}/.test(src));
ok('finding banner names the uncited count in bold', /cite no procedure source<\/b>/.test(src));
ok('CSV export button wired', /exportData\(\\'HF_TaskIdentification\\', \\'csv\\'\)/.test(src));
ok('CSV import button wired', /triggerCSVImport\(\\'HF_TaskIdentification\\'\)/.test(src));
// 2 Sep 2026 (table refactor) — head and cells are generated from HF_SCHEMA now; the
// review column and its binding are pinned where they live.
ok('review column head present', /\(cfg\.kind \? _revTh\(\) : ''\)/.test(src));
ok('review cell bound to hfTid + taskId', /tid: \{\s*\n\s*title: 'task step', store: 'tid', idField: 'taskId', kind: 'hfTid'/.test(src));
ok('footer disclaims judgement — identification only', /it makes no judgement about difficulty, workload, error or consequence/.test(src));

// ---------------------------------------------------------------- wiring
ok('API exports the lane', /addTid: addTid, setTid: setTid, removeTid: removeTid, renderTid: renderTid, tidFindings: tidFindings, TID_MODES: TID_MODES, TID_CREW: TID_CREW/.test(src));
ok('switchTab VIEWS routes hfa-tid first', /var VIEWS = \{ 'hfa-tid': renderTid,/.test(src));

const idx = R('site/index.html');
ok('index: side-nav entry', /id="snav-hfa-tid"[^>]*switchTab\('hfa-tid'\)/.test(idx));
ok('index: nav label reads Task Identification', /<span class="asb-lbl">Task Identification<\/span>/.test(idx));
ok('index: nav sits BEFORE Function Allocation', idx.indexOf('snav-hfa-tid') < idx.indexOf('snav-hfa-alloc'));
ok('index: view container', /<div id="view-hfa-tid"/.test(idx));
ok('index: host div', /<div id="hfa-tid-host"><\/div>/.test(idx));
// 2 Sep 2026 — the in-lane recommender button is no longer hand-placed in index.html.
// lane_ai_bar.js mounts one from a registry so all nine HF lanes and every safety lane
// share ONE mechanism instead of nine copies. The invariant is unchanged — this lane has
// a reachable AI action — so the check moved to the surface that now provides it.
ok('the tid lane is wired for an in-lane AI button', /'Task Identification':\s*'hfa-tid'/.test(R('site/lane_ai_bar.js')));
ok('index: hf_analyses cache-bust at or past 1.8', pinAtLeast(idx, 'hf_analyses', '1.8'));
ok('index: program_plan cache-bust bumped', pinAtLeast(idx, 'program_plan', '2.4'));
ok('index: assurance cache-bust at or past 1.30', pinAtLeast(idx, 'assurance_modules', '1.30'));
ok('index: helpers cache-bust at or past 2.67', pinAtLeast(idx, 'helpers_modules', '2.67'));
ok('index: data_ops cache-bust at or past 66.31', pinAtLeast(idx, 'data_ops_modules', '66.31'));

const plan = R('site/program_plan.js');
ok('program plan registers hfa-tid as an HF sub-lane', /id: 'hfa-tid',\s+group: 'hf', parent: 'hfa', subLane: true, name: 'Task Identification'/.test(plan));
ok('program plan wires its snav and tab', /snav: \['snav-hfa-tid'\],\s+tabs: \['hfa-tid'\]/.test(plan));

const asr = R('site/assurance_modules.js');
ok('review kind label registered', /hfTid: 'HF Task Identification'/.test(asr));
ok('review kind ordered before hfTask', /'hfAlloc', 'hfTid', 'hfTask'/.test(asr));

const helpers = R('site/helpers_modules.js');
ok('review subtitle resolves through the tid store', /hfTid: \['tid', 'taskId', \['taskName','opsMode'\]\]/.test(helpers));

const ops = R('site/data_ops_modules.js');
ok('CSV export case exists', /case 'HF_TaskIdentification': \{/.test(ops));
ok('export header matches the rendered table', /\['Task ID','Proc ID','Procedure','Mode','Phase','Task step','Definition','Crew','Trigger','Source','Notes'\]/.test(ops));
ok('import key maps to the tid store', /'HF_TaskIdentification':'tid'/.test(ops));
ok('import branch mints TSK- ids', /_hfId\('TSK-', i, getValue\(row, \['Task ID','ID'\]\)\)/.test(ops));
ok('import defaults an absent mode to Normal', /getValue\(row, \['Mode','Operating mode'\]\) \|\| 'Normal'/.test(ops));
ok('import re-renders the lane', /tid:'renderTid'/.test(ops));

const ai = R('site/ai_assistant.js');
ok('hf.improve knows the tid lane', /tid:\s+\{ name: 'Task Identification',\s+readKey: 'tid',\s+findings: 'tidFindings',\s+kind: 'hfTid'/.test(ai));
ok('tid lane focus names the citation check', /whether the step cites the procedure it came from/.test(ai));
ok('closed basis list gains the SOP advisory circular', /AC 120-71 standard operating procedures/.test(ai));

const loader = R('site/ai_loader.js');
ok('ai_loader pins the assistant at or past 76.18', pinAtLeast(loader, 'ai_assistant', '76.18'));

// ---------------------------------------------------------------- behaviour
// Exercise the real module against a stub projectConfig — the findings are the
// point of the lane, so they get run, not just grepped.
(function behaviour() {
    const g = global;
    g.window = undefined;
    g.document = undefined;
    g.projectConfig = { hf: {} };
    g.scheduleAutosave = function () {};
    let API;
    try {
        delete require.cache[require.resolve(path.join(SITE, 'site/hf_analyses.js'))];
        API = require(path.join(SITE, 'site/hf_analyses.js'));
    } catch (e) {
        ok('module loads headless', false, e.message);
        return;
    }
    ok('module loads headless', !!API && typeof API.addTid === 'function');

    API.addTid(); API.addTid();
    let st = API._read('tid');
    ok('two rows added', st.rows.length === 2);
    ok('ids are zero-padded TSK-001 / TSK-002', st.rows[0].taskId === 'TSK-001' && st.rows[1].taskId === 'TSK-002');
    ok('opsMode defaults to Normal', st.rows[0].opsMode === 'Normal');

    let f = API.tidFindings();
    ok('both rows start uncited', f.uncited.length === 2);
    ok('both rows start with no crew', f.noCrew.length === 2);
    ok('three operating modes uncovered with only Normal rows', f.modeGaps.length === 3);

    API.setTid(0, 'source', 'AEO-HF-0001 §A.5.3');
    API.setTid(0, 'crew', 'PM');
    API.setTid(0, 'trigger', 'Visor closed, latches driven');
    API.setTid(1, 'opsMode', 'Emergency');
    f = API.tidFindings();
    ok('citing a source clears it from the uncited finding', f.uncited.length === 1);
    ok('assigning crew clears it from the no-crew finding', f.noCrew.length === 1);
    ok('an emergency row narrows the mode gap to two', f.modeGaps.length === 2);

    API.setTid(0, 'crew', 'Astronaut');
    ok('an off-vocabulary crew value is refused', API._read('tid').rows[0].crew === 'PM');
    API.setTid(1, 'opsMode', 'Whenever');
    ok('an off-vocabulary mode is refused', API._read('tid').rows[1].opsMode === 'Emergency');

    API.setTid(1, 'taskId', 'TSK-001');
    f = API.tidFindings();
    ok('a duplicated task id is surfaced', f.dupes.length === 1 && f.dupes[0] === 'TSK-001');

    API.removeTid(1);
    ok('remove drops the row', API._read('tid').rows.length === 1);
    ok('duplicate finding clears with the row', API.tidFindings().dupes.length === 0);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
