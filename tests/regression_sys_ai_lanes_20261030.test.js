/*
 * regression_sys_ai_lanes_20261030.test.js
 *
 * 30 Oct 2026. Waqas: "SFHAs, their respective FCIMs, and Functions do not have a human interface to run
 * it on their respective pages or through the AI assistant page"; then, confirmed: "existing actions should
 * be asking for scope otherwise the AI assistant page balloon up"; and the SFHA works from the system
 * FCIM's failure conditions, the same way the aircraft FHA works from the aircraft FCIM.
 *
 * Requirements tested (written from the rulings, not from the code):
 *   R1 each system's Functions, FCIM and FHA pages carry an AI button that drafts THAT system only
 *   R2 a system page's FCIM/SFHA button is blocked, and says so, while the system has no functions
 *   R3 the AI Assistant page keeps ONE Decompose, ONE Generate FCIM and ONE Draft FHA; they ask for the
 *      scope (aircraft, or which system, with what each system still needs) instead of adding actions
 *   R4 the aircraft pages' buttons still draft the aircraft, with no scope question
 *   R5 the system FCIM drafts the system's functions; accepted rows land in that system's FCIM only
 *   R6 the SFHA classifies the system FCIM's failure conditions (picker over them, source condition kept);
 *      accepted rows land in that system's FHA only, never the aircraft's, whatever the reply said
 *   R7 a system with no FCIM drafts its SFHA per function
 *   R8 the system prompts carry the system scope and its MAC rules
 *
 * [A] wiring (pure)   [B] in the real app (Playwright + Chromium; skipped with a note where missing)
 * Mutations: SL_SYSLANES_MUTATE=bar serves lane_ai_bar.js without the system pages wired (R1 goes red);
 *            SL_SYSLANES_MUTATE=pin serves ai_assistant.js without the scope pin (R5/R6 go red).
 * Run: node tests/regression_sys_ai_lanes_20261030.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + d + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
function fnSrc(src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return null;
    let d = 0, j = src.indexOf('{', i);
    for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
    return null;
}

console.log('\n[A] wiring');
const A = read('ai_assistant.js'), BAR = read('lane_ai_bar.js'), L = read('ai_loader.js'), IDX = read('index.html'), A11 = read('a11_sequencing.js');
check('ai_loader.js loads ai_assistant.js v76.92 or later', /ai_assistant\.js\?v=76\.(9[2-9]|\d{3})/.test(L));
check('index pins lane_ai_bar.js 1.4 or later', /lane_ai_bar\.js\?v=1\.([4-9]|\d{2})/.test(IDX));
// R3: one action per analysis, each taking the caller's scope
const launcher = fnSrc(A, '_launcherActions') || '';
['Decompose architecture → functions', 'Generate FCIM', 'Draft FHA'].forEach(function (l) {
    const n = (launcher.match(new RegExp("label: '" + l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'", 'g')) || []).length;
    check('R3 the launcher has exactly one "' + l + '"', n === 1, String(n));
});
check('R3 Decompose, Generate FCIM and Draft FHA pass the caller\'s scope through _laneScope',
    /return decompose\(_laneScope\(o\)\)/.test(launcher) && /return populateFcim\(_laneScope\(o\)\)/.test(launcher) && /return populateFha\(_laneScope\(o\)\)/.test(launcher));
check('R3 no separate system actions were added to the launcher', !/label: '[^']*(SFHA|system FCIM|System FCIM)[^']*'/.test(launcher));
// _laneScope semantics, run
const ctx = {}; vm.createContext(ctx); vm.runInContext(fnSrc(A, '_laneScope'), ctx);
const ls = vm.runInContext('_laneScope', ctx);
check('R3 run() with nothing (the AI Assistant page) asks for the scope', JSON.stringify(ls(undefined)) === '{"askScope":true}');
check('R4 an aircraft page passes the aircraft', JSON.stringify(ls({ lane: 'aircraft' })) === '{"fromLane":true}');
check('R1 a system page passes its system', (function () { const o = ls({ systemId: 'sys-fcs', systemName: 'Flight Control System' }); return o.systemId === 'sys-fcs' && o.systemName === 'Flight Control System' && !o.askScope; })());
check('R3 the FHA action is ready when either level has functions', /case 'fha':\s+return funcsN\?ok:no\('aircraft or system functions'\);/.test(A) && /needs: \{ r: 'fha', std: 'ARP4761A · 4754B'/.test(launcher));
const pf = fnSrc(A, 'populateFha') || '', pc = fnSrc(A, 'populateFcim') || '';
check('R3 populateFha / populateFcim ask for the scope first when asked to', /if \(opts\.askScope\) \{ _askScopeThen\('fha'/.test(pf) && /if \(opts\.askScope\) \{ _askScopeThen\('fcim'/.test(pc));
check('R5/R6 a named system goes to the system batch drafters', /return _draftSystemFha\(opts\)/.test(pf) && /return _draftSystemFcim\(opts\)/.test(pc));
const ask = fnSrc(A, '_askScopeThen') || '';
check('R3 the scope question offers only systems with functions, and says what each still needs', /\(sy\.functions \|\| \[\]\)\.length/.test(ask) && /metaFn: _sysFcimMeta/.test(ask) && /metaFn: _sysFhaMeta/.test(ask));
const dF = fnSrc(A, '_draftSystemFcim') || '', dH = fnSrc(A, '_draftSystemFha') || '';
check('R5 the system FCIM runs on the batch engine: slices, coverage per function, the system pinned', /_anemBatch\(_sysFcimDirective\(sy\)/.test(dF) && /noun: 'system function'/.test(dF) && /pinScope: \{ systemId: String\(sy\.id\), ops: \['add_fcim'\] \}/.test(dF));
check('R8 the system FCIM carries the system\'s MAC rules and the system thread', /_macRulesForSystemPrompt\(sy\.id\)/.test(dF) && /thread: \{ scope: 'system', systemId: sy\.id/.test(dF));
check('R6 the SFHA picks from the system FCIM\'s failure conditions', /const conds = _sysCondUnits\(sy\)/.test(dH) && /which failure conditions\?/.test(dH) && /noun: 'failure condition'/.test(dH));
check('R6 the SFHA keeps the source condition, checks phase coverage and the derived levels', /_SYS_FHA_COND_EXTRA/.test(dH) && /gapsOf:\s+function \(acts\) \{ return _fhaPhaseGaps\(picked, acts, condOf\); \}/.test(dH) && /_fhaDerivedClause\(slice, sy\.id\)/.test(dH) && /SOURCE-CONDITION TRACE/.test(A));
check('R6 an FCIM with no failure condition stops the SFHA, it does not draft per function', /identifies no failure conditions yet/.test(dH));
check('R7 no system FCIM: the SFHA drafts per function', /No FCIM on file for ' \+ name \+ ' yet, so the SFHA drafts per function/.test(dH));
check('R6 the SFHA lane is the FHA lane (judge, do not abstain), with its spec', /analysis: 'sfha'/.test(dH) && /'sfha': _SPEC_FHA/.test(A) && /"sfha": "sfha\.draft"/.test(read('ai_skills.js')));
check('R5/R6 the batch engine writes the pinned system onto every pinned row', /cfg\.pinScope && cfg\.pinScope\.systemId[\s\S]{0,260}x\.scope = 'system'; x\.systemId = String\(cfg\.pinScope\.systemId\)/.test(fnSrc(A, '_anemBatch') || ''));
// the directives, run
const dctx = {}; vm.createContext(dctx);
vm.runInContext(fnSrc(A, '_sysFcimDirective') + '\n' + fnSrc(A, '_sysFhaDirective'), dctx);
const fd = vm.runInContext('_sysFcimDirective', dctx)({ id: 'sys-fcs', name: 'Flight Control System' });
const hd = vm.runInContext('_sysFhaDirective', dctx)({ id: 'sys-fcs', name: 'Flight Control System' }, true);
check('R8 the FCIM directive names the system, Table C1, and the system scope', /SYSTEM FCIM/.test(fd) && /"Flight Control System"/.test(fd) && /Table C1/.test(fd) && /scope "system" and systemId "sys-fcs"/.test(fd) && /NO severity words/.test(fd));
check('R8 the SFHA directive classifies the FCIM\'s conditions at system scope', /SYSTEM-level FHA \(SFHA\)/.test(hd) && /Classify the failure conditions the system FCIM identifies/.test(hd) && /scope "system" and systemId "sys-fcs"/.test(hd));
// the system pages
check('R1 the bar maps the three system pages to the three launcher actions', /'Decompose architecture → functions': \{ page: 'func'/.test(BAR) && /'Generate FCIM':\s+\{ page: 'fcim'/.test(BAR) && /'Draft FHA':\s+\{ page: 'fha'/.test(BAR));
check('R1 a system page passes the system it is showing when clicked', /a\.run\(\{ systemId: String\(cur\.id\), systemName: String\(cur\.name \|\| cur\.id\) \}\)/.test(BAR));
check('R4 an aircraft page passes the aircraft when clicked', /a\.run\(\{ lane: 'aircraft' \}\)/.test(BAR));
check('R4 the aircraft FHA button keeps the aircraft gate', /var LANE_NEEDS = \{ 'ac-fha': 'afha' \}/.test(BAR));
check('R1 the bar wraps switchWorkspaceTab (not window[name] reads: SLEnv for state)', /window\.switchWorkspaceTab = wrapped/.test(BAR) && /window\.SLEnv\.get\(name\)/.test(BAR));
check('the ARP4761A workflow runs its (aircraft) steps with the aircraft scope', /action\.run\(\{ lane: 'aircraft' \}\)/.test(A11));
check('no internal codes on the buttons', !/data-sys-lane-ai[^\n]*(INV-|R\d\b)/.test(BAR));

// ================================================================================ [B]
let pw = null;
for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
function done() { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
if (!pw) { console.log('  note  Playwright is not installed on this machine: [B] did not run'); done(); }

const MUTATE = process.env.SL_SYSLANES_MUTATE || '';
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };
function serve() {
    return new Promise(res => {
        const srv = http.createServer((q, r) => {
            let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(SITE, path.normalize(p));
            if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); }
            fs.readFile(f, (e, b) => {
                if (e) { r.writeHead(404); return r.end('not found'); }
                if (MUTATE === 'bar' && path.basename(f) === 'lane_ai_bar.js') b = Buffer.from(String(b).replace('try { _wireSys(); } catch (_) {}', ''));
                if (MUTATE === 'pin' && path.basename(f) === 'ai_assistant.js') b = Buffer.from(String(b).replace("x.scope = 'system'; x.systemId = String(cfg.pinScope.systemId);", ''));
                r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b);
            });
        }).listen(0, '127.0.0.1', () => res(srv));
    });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
// A stand-in for the model. It answers FCIM turns (one row per function it is asked for) and FHA turns
// (one row per failure condition or function). It never sets a scope: the app must put the system on.
// Every request is kept, so the test can read what the prompts said.
const STUB = `window.__sysReqs = []; window.AiClient = Object.assign(window.AiClient || {}, { isConfigured: () => true, isPermanentError: () => false, messages: async req => {
    const u = JSON.stringify(req); window.__sysReqs.push(u);
    const acts = [];
    let m = u.match(/cover EXACTLY these system functions and no others: (.*?)\\. Emit/);
    if (m && /SYSTEM FCIM/.test(u)) m[1].split('; ').forEach(s => { const id = s.split(' \\u2014 ')[0]; acts.push({ op: 'add_fcim', subId: id, awareness: 'Aware', totalLoss: 'Total loss of ' + id, partialLoss: 'Partial loss of ' + id, malfunction: 'Erroneous ' + id }); });
    else if (m) m[1].split('; ').forEach(s => { const id = s.split(' \\u2014 ')[0]; acts.push({ op: 'add_fha', scope: 'aircraft', subId: id, fcDesc: 'Total loss of ' + id, phases: ['All phases'], effAc: 'Margins reduced', effCrew: 'Crew follows the abnormal procedure', effPax: 'Discomfort', severity: 'Major', effAcLevel: 'significant', effCrewLevel: 'significant', effPaxLevel: 'slight', severityRationale: 'The crew recovers with the procedure', sevBasis: 'MAJ-1' }); });
    m = u.match(/cover EXACTLY these failure conditions and no others: (.*?)\\. Emit/);
    if (m) m[1].split('; ').forEach(s => { const p = s.split(' \\u2014 '); const fn = (p[1].match(/\\(function ([^)]*)\\)$/) || [])[1] || ''; acts.push({ op: 'add_fha', scope: 'aircraft', srcCondId: p[0], subId: fn, fcDesc: p[1].replace(/ \\(function [^)]*\\)$/, ''), phases: ['All phases'], effAc: 'Margins reduced', effCrew: 'Crew follows the abnormal procedure', effPax: 'Discomfort', severity: 'Major', effAcLevel: 'significant', effCrewLevel: 'significant', effPaxLevel: 'slight', severityRationale: 'The crew recovers with the procedure', sevBasis: 'MAJ-1' }); });
    return { model: 'stub', content: [{ text: JSON.stringify({ reply: 'Drafted.', actions: acts }) }] }; } });`;

(async () => {
    console.log('\n[B] in the real app' + (MUTATE ? ' (MUTATION: ' + MUTATE + ')' : ''));
    const srv = await serve();
    let browser;
    try { browser = await pw.chromium.launch(); }
    catch (e) { console.log('  note  Chromium could not start here: [B] did not run'); srv.close(); done(); }
    try {
        const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
        const errs = []; pg.on('pageerror', e => errs.push(String(e)));
        pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/?ai=1'); await sleep(3500);
        await pg.evaluate(() => {
            const g = document.getElementById('sl-auth-gate'); if (g) g.remove();
            document.documentElement.classList.remove('sl-auth-gate-blocked');
            document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; });
        });
        await pg.evaluate(async () => { await loadSampleProject(); }); await sleep(3000);
        await pg.evaluate(async () => { await window.slLoadAI(); }); await sleep(600);
        await pg.evaluate(STUB);
        // a system with no functions yet
        await pg.evaluate(() => { SLEnv.get('systemsData').push({ id: 'sys-empty', name: 'Empty System', role: 'function', asmCounter: 1, functions: [], fcim: [], fha: [], extractedFCs: [], req: [], asm: [] }); });

        const bar = page => pg.evaluate(page => {
            const v = document.getElementById('ws-view-' + page); const b = v && v.querySelector(':scope > .slab-ai-bar');
            if (!b || getComputedStyle(v).display === 'none') return null;
            return { sys: b.getAttribute('data-sys-lane'), btns: [...b.querySelectorAll('button')].map(x => ({ t: x.textContent.trim(), dis: x.disabled })), note: (b.querySelector('.slab-ai-note') || {}).textContent || '' };
        }, page);

        // ---- R1: each system page carries its own button for that system
        await pg.evaluate(() => { openSystemWorkspace('sys-fcs'); }); await sleep(1200);
        const fb = await bar('func');
        await pg.evaluate(() => { switchWorkspaceTab('fcim'); }); await sleep(400);
        const cb = await bar('fcim');
        await pg.evaluate(() => { switchWorkspaceTab('fha'); }); await sleep(400);
        const hb = await bar('fha');
        check('R1 System Functions page: one button, "Decompose → system functions", for this system', fb && fb.sys === 'sys-fcs' && fb.btns.length === 1 && /Decompose → system functions/.test(fb.btns[0].t), JSON.stringify(fb));
        check('R1 System FCIM page: one button, "Generate system FCIM", ready', cb && cb.sys === 'sys-fcs' && cb.btns.length === 1 && cb.btns[0].t === '✨ Generate system FCIM' && !cb.btns[0].dis, JSON.stringify(cb));
        check('R1 System FHA page: one button, "Draft SFHA", ready', hb && hb.sys === 'sys-fcs' && hb.btns.length === 1 && hb.btns[0].t === '✨ Draft SFHA' && !hb.btns[0].dis, JSON.stringify(hb));
        check('R1 the bar names the system it drafts', hb && /^Flight Control System only/.test(hb.note), hb && hb.note);
        await pg.evaluate(() => { switchWorkspaceTab('asm'); }); await sleep(300);
        check('R1 a system page with no AI action shows no bar', await pg.evaluate(() => !document.querySelector('#ws-view-asm > .slab-ai-bar')));
        check('R1 the decompose button says what it needs when there is no architecture document', fb && (fb.btns[0].dis ? /needs an architecture document/.test(fb.btns[0].t) : true), JSON.stringify(fb));

        // ---- R2: a system with no functions
        await pg.evaluate(() => { openSystemWorkspace('sys-empty'); switchWorkspaceTab('fcim'); }); await sleep(600);
        const eb = await bar('fcim');
        await pg.evaluate(() => { switchWorkspaceTab('fha'); }); await sleep(300);
        const ehb = await bar('fha');
        check('R2 no functions: the FCIM button is blocked and says what it needs', eb && eb.sys === 'sys-empty' && eb.btns[0].dis && /needs this system's functions/.test(eb.btns[0].t), JSON.stringify(eb));
        check('R2 no functions: the SFHA button is blocked the same way', ehb && ehb.btns[0].dis && /needs this system's functions/.test(ehb.btns[0].t), JSON.stringify(ehb));

        // ---- R5: the system FCIM, from its page
        const before = await pg.evaluate(() => ({ acFcim: SLEnv.get('acFcimData').length, acFha: SLEnv.get('acFhaData').length, prr: (SLEnv.get('systemsData').find(s => s.id === 'sys-prr').fcim || []).length }));
        await pg.evaluate(() => { openSystemWorkspace('sys-prr'); switchWorkspaceTab('fcim'); }); await sleep(600);
        await pg.evaluate(() => { document.querySelector('#ws-view-fcim > .slab-ai-bar button').click(); }); await sleep(1000);
        const fpick = await pg.evaluate(() => { const p = document.getElementById('ai-scope-pick'); return p ? { title: p.querySelector('h3').textContent, n: p.querySelectorAll('.scope-unit').length, rows: [...p.querySelectorAll('.scope-unit')].map(b => b.parentElement.textContent) } : null; });
        check('R5 the FCIM button opens the function picker for THIS system, no scope question', fpick && /FCIM · Right Powerplant · which functions\?/.test(fpick.title) && fpick.n === 3 && !(await pg.evaluate(() => !!document.getElementById('ai-fha-scope'))), JSON.stringify(fpick));
        check('R5 the picker lists the system\'s own functions', fpick && fpick.rows.every(r => /SFN-PRR/.test(r)), JSON.stringify(fpick && fpick.rows));
        await pg.evaluate(() => { document.querySelector('#scope-pick-go').click(); }); await sleep(5000);
        const freq = await pg.evaluate(() => window.__sysReqs.filter(u => /SYSTEM FCIM/.test(u)).slice(-1)[0] || '');
        check('R8 the FCIM prompt names the system and its scope', /\\"Right Powerplant\\" system/.test(freq) && /systemId \\"sys-prr\\"/.test(freq), freq.slice(0, 200));
        check('R8 the FCIM prompt carries the system\'s MAC rules', /MAC RULES|MAC rule/.test(freq));
        check('R8 the FCIM prompt is at system altitude', /System level — author at SYSTEM-FUNCTION altitude/.test(freq));
        const frev = await pg.evaluate(() => { const p = document.querySelector('.ai-rev-panel'); return p ? { cards: p.querySelectorAll('.aifh-card').length, text: p.innerText.slice(0, 400) } : null; });
        check('R5 the review panel shows one card per function', frev && frev.cards === 3, JSON.stringify(frev));
        await pg.evaluate(() => { const b = document.querySelector('.ai-rev-panel .rv-accept-all'); if (b) b.click(); }); await sleep(1500);
        const after = await pg.evaluate(() => { const s = SLEnv.get('systemsData').find(s => s.id === 'sys-prr'); return { acFcim: SLEnv.get('acFcimData').length, prr: (s.fcim || []).length, prrEx: (s.extractedFCs || []).length, subs: (s.fcim || []).map(r => r.subId) }; });
        check('R5 accepted rows land in the system\'s FCIM', after.prr === before.prr + 3 && after.subs.every(x => /SFN-PRR/.test(x)), JSON.stringify(after));
        check('R5 and never in the aircraft FCIM', after.acFcim === before.acFcim, JSON.stringify([before, after]));
        check('R5 the accepted FCIM identifies the system\'s failure conditions', after.prrEx >= 9, String(after.prrEx));

        // ---- R6: the SFHA classifies those failure conditions, from its page
        await pg.evaluate(() => { switchWorkspaceTab('fha'); }); await sleep(500);
        await pg.evaluate(() => { document.querySelector('#ws-view-fha > .slab-ai-bar button').click(); }); await sleep(1000);
        const hpick = await pg.evaluate(() => { const p = document.getElementById('ai-scope-pick'); return p ? { title: p.querySelector('h3').textContent, n: p.querySelectorAll('.scope-unit').length } : null; });
        const exN = await pg.evaluate(() => (SLEnv.get('systemsData').find(s => s.id === 'sys-prr').extractedFCs || []).length);
        check('R6 the SFHA button opens the failure-condition picker over the system FCIM', hpick && /SFHA · Right Powerplant · which failure conditions\?/.test(hpick.title) && hpick.n === exN, JSON.stringify(hpick) + ' ex ' + exN);
        const fhaBefore = await pg.evaluate(() => ({ ac: SLEnv.get('acFhaData').length, prr: (SLEnv.get('systemsData').find(s => s.id === 'sys-prr').fha || []).length }));
        await pg.evaluate(() => { document.querySelector('#scope-pick-go').click(); }); await sleep(6000);
        const hreq = await pg.evaluate(() => window.__sysReqs.filter(u => /SYSTEM-level FHA/.test(u)).slice(-1)[0] || '');
        check('R6 the SFHA prompt asks for the source condition on every row', /SOURCE-CONDITION TRACE/.test(hreq) && /srcCondId/.test(hreq));
        check('R8 the SFHA prompt names the system scope and carries its MAC rules', /systemId \\"sys-prr\\"/.test(hreq) && /MAC RULES|MAC rule/.test(hreq));
        await pg.evaluate(() => { const b = document.querySelector('.ai-rev-panel .rv-accept-all'); if (b) b.click(); }); await sleep(1500);
        const fhaAfter = await pg.evaluate(() => { const s = SLEnv.get('systemsData').find(s => s.id === 'sys-prr'); const ex = (s.extractedFCs || []).map(e => e.id); return { ac: SLEnv.get('acFhaData').length, prr: (s.fha || []).length, linked: (s.fha || []).filter(r => ex.indexOf(r.fcId) >= 0 || ex.indexOf(r.srcCondId) >= 0).length }; });
        check('R6 accepted SFHA rows land in the system\'s FHA, one per condition', fhaAfter.prr === fhaBefore.prr + exN, JSON.stringify([fhaBefore, fhaAfter]));
        check('R6 not in the aircraft FHA, though the reply said "aircraft"', fhaAfter.ac === fhaBefore.ac, JSON.stringify([fhaBefore, fhaAfter]));
        check('R6 each accepted row keeps the FCIM condition it classifies', fhaAfter.linked >= exN, JSON.stringify(fhaAfter));

        // ---- R7: no system FCIM, the SFHA drafts per function (Left Powerplant has an FCIM; use a fresh system)
        await pg.evaluate(() => { SLEnv.get('systemsData').push({ id: 'sys-nofcim', name: 'Fuel System', functions: [{ internalId: 'x1', funcId: 'SFN-FUEL1', funcName: 'Provide fuel feed', funcDef: 'Feeds fuel to both engines', traceIds: ['SF-04'] }, { internalId: 'x2', funcId: 'SFN-FUEL2', funcName: 'Indicate fuel quantity', funcDef: 'Shows the fuel on board', traceIds: [] }], fcim: [], fha: [], extractedFCs: [], req: [], asm: [], role: 'function', asmCounter: 1 }); openSystemWorkspace('sys-nofcim'); switchWorkspaceTab('fha'); }); await sleep(700);
        await pg.evaluate(() => { document.querySelector('#ws-view-fha > .slab-ai-bar button').click(); }); await sleep(900);
        const npick = await pg.evaluate(() => { const p = document.getElementById('ai-scope-pick'); return p ? { title: p.querySelector('h3').textContent, dis: p.querySelector('.aifh-disclaimer').textContent, n: p.querySelectorAll('.scope-unit').length } : null; });
        check('R7 no system FCIM: the SFHA picks functions and says why', npick && /SFHA · Fuel System · which functions\?/.test(npick.title) && /No FCIM on file for Fuel System yet/.test(npick.dis) && npick.n === 2, JSON.stringify(npick));
        await pg.evaluate(() => { document.querySelector('#scope-pick-go').click(); }); await sleep(5000);
        await pg.evaluate(() => { const b = document.querySelector('.ai-rev-panel .rv-accept-all'); if (b) b.click(); }); await sleep(1200);
        const nf = await pg.evaluate(() => (SLEnv.get('systemsData').find(s => s.id === 'sys-nofcim').fha || []).map(r => r.subId));
        check('R7 its accepted rows land in that system\'s FHA', nf.length === 2 && nf.every(x => /SFN-FUEL/.test(x)), JSON.stringify(nf));

        // ---- R3: the AI Assistant page asks for the scope
        await pg.evaluate(() => { document.querySelectorAll('.ai-rev-panel,#ai-scope-pick,#ai-fha-scope').forEach(p => p.remove()); });
        const run = label => pg.evaluate(label => { const a = SafetyLabAI.launcherActions().find(x => x.label === label); return Promise.resolve().then(a.run).then(() => 'ok', e => 'err: ' + e.message); }, label);
        await run('Generate FCIM'); await sleep(600);
        const sp = await pg.evaluate(() => { const p = document.getElementById('ai-fha-scope'); return p ? { title: p.querySelector('h3').textContent, cards: [...p.querySelectorAll('.aifh-card')].map(c => c.innerText.replace(/\s+/g, ' ').trim()) } : null; });
        check('R3 Generate FCIM on the AI Assistant page asks: aircraft, or which system', sp && /Generate FCIM · pick the scope/.test(sp.title) && /^Aircraft FCIM/.test(sp.cards[0]), JSON.stringify(sp));
        check('R3 only systems with functions are offered', sp && !sp.cards.some(c => /Empty System/.test(c)) && sp.cards.some(c => /System FCIM · Flight Control System/.test(c)), JSON.stringify(sp && sp.cards));
        check('R3 each system card says how many functions still need an FCIM row', sp && sp.cards.some(c => /System FCIM · Flight Control System \d+ of 4 functions without an FCIM row/.test(c)), JSON.stringify(sp && sp.cards));
        await pg.evaluate(() => { [...document.querySelectorAll('#ai-fha-scope .aifh-card')].find(c => /Left Powerplant/.test(c.textContent)).click(); }); await sleep(700);
        const sp2 = await pg.evaluate(() => { const p = document.getElementById('ai-scope-pick'); return p ? p.querySelector('h3').textContent : ''; });
        check('R3 picking a system goes on to that system\'s function picker', /FCIM · Left Powerplant · which functions\?/.test(sp2), sp2);
        await pg.evaluate(() => { document.querySelectorAll('#ai-scope-pick').forEach(p => p.remove()); });
        await run('Draft FHA'); await sleep(600);
        const hp = await pg.evaluate(() => { const p = document.getElementById('ai-fha-scope'); return p ? [...p.querySelectorAll('.aifh-card')].map(c => c.innerText.replace(/\s+/g, ' ').trim()) : null; });
        check('R3 Draft FHA asks too, and each system card says what is left to classify', hp && /^Aircraft \(AFHA\)/.test(hp[0]) && hp.some(c => /SFHA · Flight Control System \d+ of 6 failure conditions from the FCIM not yet in the SFHA/.test(c)) && hp.some(c => /SFHA · Fuel System 2 functions, no system FCIM yet/.test(c)), JSON.stringify(hp));
        await pg.evaluate(() => { [...document.querySelectorAll('#ai-fha-scope .aifh-card')][0].click(); }); await sleep(700);
        const ap = await pg.evaluate(() => { const p = document.getElementById('ai-scope-pick'); return p ? p.querySelector('h3').textContent : ''; });
        check('R3 picking the aircraft goes on to the aircraft FHA picker', /AI-drafted FHA · which (failure conditions|functions)\?/.test(ap) && !/SFHA/.test(ap), ap);
        await pg.evaluate(() => { document.querySelectorAll('#ai-scope-pick,#ai-fha-scope').forEach(p => p.remove()); });
        // the AI Assistant page itself: still one Run per analysis
        const page = await pg.evaluate(() => { try { SLAiInputsPage.open(); } catch (_) {} return [...document.querySelectorAll('#aip-assist .aip-act-t')].map(x => x.textContent.trim()); });
        await sleep(400);
        check('R3 the AI Assistant page has one Generate FCIM and one Draft FHA, no system copies', page.filter(t => t === 'Generate FCIM').length === 1 && page.filter(t => t === 'Draft FHA').length === 1 && !page.some(t => /SFHA|system FCIM/i.test(t)), JSON.stringify(page));

        // ---- R4: the aircraft pages draft the aircraft, no question
        await pg.evaluate(() => { switchTab('ac-fcim'); }); await sleep(1200);
        const acb = await pg.evaluate(() => { const b = document.querySelector('#view-ac-fcim > .slab-ai-bar button'); return b ? b.textContent.trim() : null; });
        await pg.evaluate(() => { const b = document.querySelector('#view-ac-fcim > .slab-ai-bar button'); if (b) b.click(); }); await sleep(800);
        const acp = await pg.evaluate(() => ({ scope: !!document.getElementById('ai-fha-scope'), pick: (document.querySelector('#ai-scope-pick h3') || {}).textContent || '' }));
        check('R4 the Aircraft FCIM page keeps "Generate FCIM"', acb === '✨ Generate FCIM', acb);
        check('R4 and it goes straight to the aircraft functions, no scope question', !acp.scope && /AI-drafted FCIM · which functions\?/.test(acp.pick) && !/Powerplant|Flight Control System/.test(acp.pick), JSON.stringify(acp));
        await pg.evaluate(() => { document.querySelectorAll('#ai-scope-pick,#ai-fha-scope').forEach(p => p.remove()); });

        check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
    } catch (e) {
        check('[B] ran without throwing', false, String(e && e.stack || e).slice(0, 400));
    } finally {
        try { await browser.close(); } catch (_) {}
        srv.close(); done();
    }
})();
