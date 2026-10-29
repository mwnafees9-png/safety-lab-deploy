/*
 * regression_alloc_never_over_20261027.test.js
 *
 * 27 Oct 2026. A top-down allocation tree never adds up to more than its target.
 * Found by this sweep through the real engine: trees with a repeated event closed a hair over their
 * target (up to 0.009%): the close allowed 0.1% over and stopped its search on either side. Now the
 * close runs for a repeated event, an FDEP or a NOT, and finishes at or under the target. Under the
 * target is margin and stays. Common cause is not part of allocation (Waqas, 12 Oct 2026), so trees
 * carrying a common cause group are not in this sweep.
 *
 * [A] wiring (pure)  [B] the sweep in the real app (Playwright + Chromium; skipped with a note where missing)
 * Mutation: SL_ALLOC_MUTATE=1 serves a close that finishes on the over side of its search: the shared-event cases go red.
 * Run: node tests/regression_alloc_never_over_20261027.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + d + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');

console.log('\n[A] wiring');
const H = read('helpers_modules.js'), Q = read('fta_quant_modules.js');
// 28 Oct 2026: the close also runs for a common cause group counted under the gate's independence (regression_alloc_beta_20261028)
check('the engine closes the budget whenever the exact total can differ', /typeof _allocNeedsExactClose === 'function'\s*&& \(_allocNeedsExactClose\(rootPage\.root\) \|\| _ccfPlan\.counted\.length > 0\)/.test(Q));
check('an FDEP and a NOT count, as well as a repeated event', /n\.gateType === 'FDEP' \|\| n\.gateType === 'NOT'/.test(H) && /if \(_hasRepeatedLogicalIds\(rootNode\)\) return true;/.test(H));
const trig = H.slice(H.indexOf('function _allocNeedsExactClose('), H.indexOf('function mcsAwareRebalance('));
check('common cause is not part of the allocation close (12 Oct 2026 ruling)', trig.length > 100 && !/ccfGroup|beta/.test(trig.replace(/\/\/.*$/gm, '')));
check('no slack over the target at the start', /if \(pAtOne <= targetProb\) return true;/.test(H) && !/targetProb \* 1\.001/.test(H));
check('both searches finish on the side at or under the target', (H.match(/if \(pMid <= targetProb\) \{\s*kLo = kMid;/g) || []).length === 2 && /applyScaleAndEvaluate\(kLo\);/.test(H) && /applyScale\(kLo\);/.test(H));
check('a refused exact close is flagged for the warning pill', /rootPage\.root\._exactCloseRefused = true;/.test(Q) && /delete rootPage\.root\._exactCloseRefused;/.test(Q));

let pw = null;
for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
function done() { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
if (!pw) { console.log('  note  Playwright is not installed on this machine: [B] did not run'); done(); }
const MUTATE = process.env.SL_ALLOC_MUTATE === '1';
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };
function serve() {
    return new Promise(res => {
        const srv = http.createServer((q, r) => {
            let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(SITE, path.normalize(p));
            if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); }
            fs.readFile(f, (e, b) => {
                if (e) { r.writeHead(404); return r.end('not found'); }
                if (MUTATE && path.basename(f) === 'helpers_modules.js') b = Buffer.from(String(b).replace('    applyScaleAndEvaluate(kLo);\n    return true;', '    applyScaleAndEvaluate(kHi);\n    return true;').replace('    applyScale(kLo);\n    return true;', '    applyScale(kHi);\n    return true;'));
                r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b);
            });
        }).listen(0, '127.0.0.1', () => res(srv));
    });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    console.log('\n[B] the sweep in the real app' + (MUTATE ? ' (MUTATION: the close finishes over)' : ''));
    const srv = await serve();
    let browser;
    try { browser = await pw.chromium.launch(); }
    catch (e) { console.log('  note  Chromium could not start here: [B] did not run'); srv.close(); done(); }
    try {
        const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
        const errs = []; pg.on('pageerror', e => errs.push(String(e)));
        pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/'); await sleep(3500);
        await pg.evaluate(() => {
            const g = document.getElementById('sl-auth-gate'); if (g) g.remove();
            document.documentElement.classList.remove('sl-auth-gate-blocked');
            document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; });
        });
        await pg.evaluate(async () => { await loadSampleProject(); }); await sleep(3000);
        // Each case replaces the top event's inputs on a real top-down tree, runs the engine's own
        // recompute and reads the exact total (BDD, common cause and shared events included).
        const out = await pg.evaluate(async()=>{
  const page=ftaPages.find(p=>/^PASA · FC-07/.test(p.name)&&!/Verification/.test(p.name));
  openFTAPageById(page.id);calculateAllProbabilities();
  const leaves=[],gates=[];(function w(n){if(!n)return;const k=n.children||n._children;(n.type==='gate'?gates:leaves).push(n);if(k)k.forEach(w);})(page.root);
  const L0=JSON.parse(JSON.stringify(Object.assign({},leaves[0],{children:undefined}))), G0=JSON.parse(JSON.stringify(Object.assign({},gates[1]||gates[0],{children:undefined})));
  let nid=900000;
  const strip=o=>{Object.keys(o).forEach(k=>{if(k[0]==='_'||/^(probability|lambda|allocatedDAL|externalSource|identity|realizedByItemId|sysmlRef|logicalId|ccfGroup|beta|xOffset|yOffset|descBoxHeight|achievableLambda)$/.test(k))delete o[k];});return o;};
  const L=(name,lid,extra)=>Object.assign(strip(JSON.parse(JSON.stringify(L0))),{id:++nid,displayId:'BE-'+nid,name,type:'basic',logicalId:lid!=null?lid:nid},extra||{});
  const G=(gt,kids,extra)=>Object.assign(strip(JSON.parse(JSON.stringify(G0))),{id:++nid,displayId:'G-'+nid,name:gt+' '+nid,type:'gate',gateType:gt,children:kids},extra||{});
  const cases={
   S1_OR3:()=>[G('OR',[L('a'),L('b'),L('c')])],
   S2_AND2:()=>[G('AND',[L('a'),L('b')])],
   S3_OR_of_ANDs_sharedA:()=>[G('OR',[G('AND',[L('A',7001),L('b')]),G('AND',[L('A',7001),L('c')])])],
   S4_AND_of_ORs_sharedA:()=>[G('AND',[G('OR',[L('A',7002),L('b')]),G('OR',[L('A',7002),L('c')])])],
   S5_AND_sharedBoth:()=>[G('AND',[L('A',7003),G('OR',[L('A',7003),L('x')])])],
   S7_VOTING2of3:()=>[G('VOTING',[L('a'),L('b'),L('c')],{votingK:2})],
   S8_INHIBIT:()=>[G('INHIBIT',[L('a'),L('cond',null,{type:'condition'})])],
   S9_XOR:()=>[G('XOR',[L('a'),L('b')])],
   S10_PAND:()=>[G('PAND',[L('a'),L('b')])],
   S11_SPARE:()=>[G('SPARE',[L('a'),L('b')])],
   S12_deep_shared:()=>[G('OR',[G('AND',[L('P',7004),G('OR',[L('Q',7005),L('r')])]),G('AND',[L('Q',7005),L('s')]),G('AND',[L('P',7004),L('t')])])],
   S17_FDEP:()=>[G('OR',[G('AND',[L('A',7020),L('B',7021)]),G('FDEP',[L('T'),L('A',7020),L('B',7021)])])],
   S18_NOT:()=>[G('AND',[L('a'),G('NOT',[L('b')])])],
   S19_big_shared:()=>{const sh=[];for(let i=0;i<6;i++)sh.push(7100+i);const br=[];for(let i=0;i<14;i++){br.push(G('AND',[L('S'+(i%6),sh[i%6]),L('u'+i),L('v'+i)]));}return [G('OR',br)];},
   S13_OR_many:()=>[G('OR',[L('a'),L('b'),L('c'),L('d'),L('e'),L('f'),L('g'),L('h')])],
  };
  const res=[];
  for(const [name,mk] of Object.entries(cases)){
   page.root.children=mk();delete page.root._children;
   try{calculateAllProbabilities();}catch(e){res.push({name,err:String(e).slice(0,80)});continue;}
   const r=page.root;let ex=null;try{ex=computeExactProbability(r).prob;}catch(e){ex='ERR '+String(e).slice(0,40);}
   res.push({name,mode:ftaConfig.mode,target:r.probability,actual:r._bddActualProb,exact:ex,ratio:(typeof ex==='number'&&r.probability)?(ex/r.probability):null});
  }
  return res;});
        const CLOSE = ['S3_OR_of_ANDs_sharedA', 'S4_AND_of_ORs_sharedA', 'S5_AND_sharedBoth', 'S12_deep_shared', 'S17_FDEP', 'S18_NOT', 'S19_big_shared'];
        check('the sweep ran every case on a top-down tree', out.length >= 15 && out.every(o => o.mode === 'top-down' && typeof o.exact === 'number'), JSON.stringify(out.filter(o => o.err || typeof o.exact !== 'number')).slice(0, 200));
        out.forEach(o => {
            check(o.name + ': at or under its target', typeof o.ratio === 'number' && o.ratio <= 1 + 1e-9, String(o.ratio));
            if (CLOSE.indexOf(o.name) >= 0) check(o.name + ': closed tight (within 0.1% under)', o.ratio >= 0.999, String(o.ratio));
        });
        check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
    } catch (e) {
        check('[B] ran without throwing', false, String(e && e.stack || e).slice(0, 400));
    } finally {
        try { await browser.close(); } catch (_) {}
        srv.close(); done();
    }
})();
