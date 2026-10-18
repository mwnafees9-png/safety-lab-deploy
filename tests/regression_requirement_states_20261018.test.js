/* regression_requirement_states_20261018: the live state of every generated requirement, for Sys Lab.
 *
 * Ruled 18 Oct 2026 (Sys Lab build 1): Sys Lab never judges what Safety Lab owns. The independence requirements
 * AutoReq writes for each AND-family gate are the single source of every independence claim, and the credit a
 * fault tree event earns is read from the state of its generated requirements: probability (allocated budget
 * against the verification tree), independence (compromised, and CMA substantiation for a DAL reduction) and
 * crew (the human factors assumption validated). requirement_states.js computes them with Safety Lab's own
 * code at export time and the bundle carries them as requirement-states.json.
 *
 *   [A] pure: every generated requirement is listed with its scope, generator, gate and kind; hand-written,
 *       deleted and obsolete rows are not; reasons keep AutoReq's own shape; the evidence and validation
 *       rules are Safety Lab's, passed in, never re-derived; a failing evidence call is reported, not thrown
 *   [B] in the app, on the HL-1 demo after AutoReq: the export carries requirement-states.json with the gate
 *       independence requirements (functional and physical per AND gate), the event probability requirements
 *       with Safety Lab's verification evidence, and the assumptions with their validation
 *   [C] wiring: loaded after zonal_exchange.js; the bundle writes the file; a failure never stops an export
 *
 * Run: node tests/regression_requirement_states_20261018.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? ' -- ' + String(d).slice(0, 400) : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const R = require(path.join(SITE, 'requirement_states.js'));
const J = x => JSON.stringify(x);

console.log('\n[A] pure');
{
  const g = (gen, sid, extra) => Object.assign({ internalId: Math.random(), id: 'R', text: 't ' + gen, reqSource: { generator: gen, sourceId: sid, context: { childLids: [1, 2] } } }, extra || {});
  const P = {
    acReqData: [
      g('gate-indep-and', 'ac:gate-indep:pg-a:70', { compromised: true, compromiseReasons: [{ kind: 'shared-ccf-group', detail: 'Children X, Y all belong to CCF group "g"' }, { kind: 'shared-resource-structural', structural: true, detail: 'structural' }] }),
      g('gate-indep-phys', 'ac:gate-indep-phys:pg-a:70'),
      g('gate-indep-dev', 'ac:gate-indep-dev:pg-a:70', { reqSource: { generator: 'gate-indep-dev', sourceId: 'ac:gate-indep-dev:pg-a:70', context: { cmaStatus: 'substantiated' } } }),
      g('gate-indep-or', 'ac:gate-indep:pg-a:71'),
      g('fta-event', 'ac:fta-event:7066'),
      g('hf-op-action', 'ac:hf-op-action:ASM-1', { reqSource: { generator: 'hf-op-action', sourceId: 'ac:hf-op-action:ASM-1', context: { asmId: 'ASM-1', state: 'Open' } } }),
      { internalId: 9, text: 'hand written', reqSource: null },
      g('fta-event', 'ac:fta-event:1', { deleted: true }),
      Object.assign(g('fta-event', 'ac:fta-event:2'), { reqSource: { generator: 'fta-event', sourceId: 'ac:fta-event:2', obsolete: true } })
    ],
    systemsData: [{ id: 'sys-fcs', req: [g('fta-event', 'sys-fcs:fta-event:7070')] }],
    acAssumptionsData: [{ asmId: 'ASM-1', state: 'Open', hf: {} }, { asmId: 'ASM-2', state: 'Validated' }]
  };
  const seen = [];
  const out = R.exportStates(P, { evidence: r => { seen.push(r.reqSource.sourceId); return r.reqSource.generator === 'fta-event' ? { state: 'pass', label: 'PASS', actual: 1e-9, target: 2e-9 } : null; }, isValidated: s => s === 'Validated' });
  const by = sid => out.requirements.find(r => r.sourceId === sid);
  check('format and version name the file', out.format === 'safety-lab-requirement-states' && out.version === 1);
  check('every generated requirement is listed, in both scopes (7)', out.requirements.length === 7, out.requirements.map(r => r.sourceId));
  check('hand-written, deleted and obsolete requirements are not', !out.requirements.some(r => /fta-event:(1|2)$/.test(r.sourceId)) && !out.requirements.some(r => r.text === 'hand written'));
  check('the system scope is the system id', by('sys-fcs:fta-event:7070').scope === 'sys-fcs' && by('ac:fta-event:7066').scope === 'ac');
  check('a gate requirement names its gate (page, node) and kind', J(by('ac:gate-indep:pg-a:70').gate) === J({ page: 'pg-a', node: '70' }) && by('ac:gate-indep:pg-a:70').kind === 'functional' && by('ac:gate-indep-phys:pg-a:70').kind === 'physical' && by('ac:gate-indep-dev:pg-a:70').kind === 'development' && by('ac:gate-indep:pg-a:71').kind === 'single-failure');
  check('compromised and AutoReq\'s reasons travel as they are, structural notes marked', by('ac:gate-indep:pg-a:70').compromised === true && by('ac:gate-indep:pg-a:70').reasons.length === 2 && by('ac:gate-indep:pg-a:70').reasons[1].structural === true && by('ac:gate-indep:pg-a:70').reasons[0].kind === 'shared-ccf-group');
  check('development independence carries the CMA substantiation', by('ac:gate-indep-dev:pg-a:70').substantiated === true && by('ac:gate-indep-phys:pg-a:70').substantiated === undefined);
  check('an event requirement carries its event id and Safety Lab\'s evidence', by('ac:fta-event:7066').eventLid === '7066' && by('ac:fta-event:7066').evidence.state === 'pass' && by('ac:fta-event:7066').evidence.target === 2e-9);
  check('the evidence rule is Safety Lab\'s own, called once per listed requirement', seen.length === 7);
  check('a crew requirement names its assumption', by('ac:hf-op-action:ASM-1').asmId === 'ASM-1');
  check('a generated requirement without an ID of its own is named the way Safety Lab names it, REQ-<internalId>', R.exportStates({ acReqData: [{ internalId: 42, reqSource: { generator: 'fta-event', sourceId: 'ac:fta-event:1' } }] }, {}).requirements[0].id === 'REQ-42' && by('ac:fta-event:7066').id === 'R');
  check('assumptions carry their state and Safety Lab\'s validation', J(out.assumptions.map(a => [a.asmId, a.validated, a.crew])) === J([['ASM-1', false, true], ['ASM-2', true, false]]));
  const bad = R.exportStates(P, { evidence: () => { throw new Error('boom'); } });
  check('a failing evidence call is reported on the row, never thrown', bad.requirements.every(r => r.evidence && r.evidence.state === 'error' && /boom/.test(r.evidence.detail)));
  const none = R.exportStates(P, {});
  check('without the rules the fields are empty, not guessed', none.requirements.every(r => r.evidence === null) && none.assumptions.every(a => a.validated === null));
  check('hasContent: an empty project writes no file', !R.hasContent(R.exportStates({}, {})) && R.hasContent(out));
}

console.log('\n[C] wiring');
{
  const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'), helpers = fs.readFileSync(path.join(SITE, 'helpers_modules.js'), 'utf8');
  const zi = html.indexOf('zonal_exchange.js?v='), ri = html.indexOf('requirement_states.js?v=');
  check('loaded once, right after zonal_exchange.js', ri > zi && zi > 0 && html.split('requirement_states.js?v=').length === 2);
  const fn = helpers.slice(helpers.indexOf('function _bundleZonalExtra'), helpers.indexOf('function exportProjectBundle'));
  check('the bundle writes requirement-states.json beside the project', /'requirement-states\.json'\] = JSON\.stringify\(st\)/.test(fn) && /SLReqStates/.test(fn));
  check('each file is guarded on its own, so a failure never stops an export', /try \{ var X/.test(fn) && /try \{ var R/.test(fn) && (fn.match(/catch \(e\)/g) || []).length === 2);
}

(async () => {
  console.log('\n[B] in the app, on the HL-1 demo after AutoReq');
  let chromium;
  try { chromium = require('playwright').chromium; } catch (e) { try { chromium = require('/opt/npm-tools/node_modules/playwright').chromium; } catch (_) { console.log('  SKIP  playwright is not installed'); return done(); } }
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm' };
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(SITE, p);
    if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let browser;
  try { browser = await chromium.launch(); } catch (e) { console.log('  SKIP  no Chromium'); server.close(); return done(); }
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.goto('http://127.0.0.1:' + server.address().port + '/');
    await page.waitForFunction(() => window.SLReqStates && typeof _applyProjectData === 'function' && typeof AutoReq !== 'undefined' && typeof getAutoReqVerificationEvidence === 'function', null, { timeout: 60000 });
    const B = await page.evaluate(async () => {
      const load = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
      if (!window.slDemoMirror) await load('demo_kit.js');
      if (!window.SL_SHOWCASE_HL1) await load('demo_showcase_hl1.js');
      _applyProjectData(window.SL_SHOWCASE_HL1.build());
      const scopes = ['ac'].concat((systemsData || []).map(s => 'sys-' + s.id));
      let made = 0;
      for (const sc of scopes) { const m = AutoReq.generate(undefined, sc); made += AutoReq.applyMerge(m, { acceptNew: true, acceptUpdates: true, acceptOrphanRemoval: false }); }
      const files = _bundleZonalExtra();
      const st = files['requirement-states.json'] ? JSON.parse(files['requirement-states.json']) : null;
      const andGates = []; (ftaPages || []).filter(p => p.root && !p.verifies).forEach(p => (function w(n) { if (!n) return; if (n.type === 'gate' && /^(AND|PAND|VOTING|INHIBIT)$/.test(n.gateType) && (n.children || []).length >= 2) andGates.push(p.id + ':' + n.id); (n.children || []).forEach(w); })(p.root));
      return { made, st, andGates };
    });
    const st = B.st, reqs = (st && st.requirements) || [];
    check('AutoReq ran on the demo (' + B.made + ' requirements)', B.made > 50);
    check('the export carries requirement-states.json', !!st && st.format === 'safety-lab-requirement-states');
    const fn = reqs.filter(r => r.kind === 'functional'), ph = reqs.filter(r => r.kind === 'physical');
    const gateKey = r => r.gate.page + ':' + r.gate.node;
    check('every AND gate of an allocation tree has its functional independence requirement (' + fn.length + ')', B.andGates.length > 0 && B.andGates.every(k => fn.some(r => gateKey(r) === k)), B.andGates.filter(k => !fn.some(r => gateKey(r) === k)).slice(0, 5));
    check('and its physical independence requirement (' + ph.length + ')', B.andGates.every(k => ph.some(r => gateKey(r) === k)));
    const ev = reqs.filter(r => r.generator === 'fta-event');
    check('event probability requirements carry Safety Lab\'s verification evidence (' + ev.length + ')', ev.length > 20 && ev.every(r => r.evidence && r.evidence.state && r.eventLid));
    check('some event evidence is decided (pass or fail) from the verification trees', ev.some(r => /^(pass|fail)$/.test(r.evidence.state)), [...new Set(ev.map(r => r.evidence.state))]);
    check('assumptions carry Safety Lab\'s validation', (st.assumptions || []).length > 0 && st.assumptions.every(a => typeof a.validated === 'boolean'));
    check('no page errors', errors.length === 0, errors.slice(0, 3));
  } finally { await browser.close(); server.close(); }
  done();
})();
function done() { console.log('\n' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }
