/* ============================================================================
 * regression_thread_bridge.test.js — Safety Lab on the golden thread bus.
 *
 * Locks the FIRST-PRIORITY wire and its discipline:
 *   [1] wiring — config injection file (only credential-bearing file, honors
 *       the on-prem override), thread_client v1.1 present, index.html loads
 *       config → client → bridge in order, CSP already names the bus origin.
 *   [2] publish — a single human state flip publishes 'asm-state'; a bulk
 *       change (project load) publishes NOTHING; explicit publishAsmState
 *       works and does not double-publish on the next sweep.
 *   [3] consume — foreign part-release/evidence land in the inbox ledger and
 *       NO STORE IS EVER WRITTEN (the iron rule: packets ship, humans sign).
 *   [4] auth safety — the bus client is auth-inert (persistSession:false) so
 *       it can never clobber the live tool's sign-in storage.
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; console.log('  FAIL  ' + name); }
}

const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');

// ---- [1] wiring ----------------------------------------------------------
const cfgSrc = read('labs_thread_config.js');
check('config defines window.LABS_THREAD_CONFIG with url + key + channel',
    /window\.LABS_THREAD_CONFIG\s*=/.test(cfgSrc) && /supabase\.co/.test(cfgSrc) && /channel:\s*'labs-thread'/.test(cfgSrc));
check('config honors the on-prem override (__SLAB_SUPABASE_URL__ precedence)',
    /__SLAB_SUPABASE_URL__/.test(cfgSrc) && /__SLAB_SUPABASE_KEY__/.test(cfgSrc));
check('publishable key only — no service-role key anywhere in the bus files',
    !/service_role|sb_secret/i.test(cfgSrc + read('thread_client.js') + read('thread_bridge.js')));

const idx = read('index.html');
const iCfg = idx.indexOf('labs_thread_config.js');
const iCli = idx.indexOf('thread_client.js');
const iBr = idx.indexOf('thread_bridge.js');
const iSdk = idx.indexOf('@supabase/supabase-js@2');
check('index.html loads SDK, then config → client → bridge, cache-busted',
    iSdk > -1 && iSdk < iCfg && iCfg < iCli && iCli < iBr &&
    /labs_thread_config\.js\?v=/.test(idx) && /thread_client\.js\?v=1\.1/.test(idx) && /thread_bridge\.js\?v=/.test(idx));
const worker = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
check('worker CSP already names the bus origin (https + wss)',
    /connect-src[^"]*https:\/\/fhrqkhdrwbfnizkepkch\.supabase\.co/.test(worker) &&
    /connect-src[^"]*wss:\/\/fhrqkhdrwbfnizkepkch\.supabase\.co/.test(worker));

// ---- [4] auth safety (source-level) --------------------------------------
check('bus client is auth-inert — persistSession:false, autoRefreshToken:false',
    /persistSession:\s*false/.test(read('thread_client.js')) && /autoRefreshToken:\s*false/.test(read('thread_client.js')));

// ---- behaviour harness ---------------------------------------------------
// A minimal window shim: thread_client + thread_bridge both take tolerant
// globals; loopback transport shares via window.__labsLoop.
global.window = { setTimeout, setInterval: () => 0, clearInterval: () => 0 };
// node 22 ships a real BroadcastChannel — hide it so the harness runs on
// loopback (deterministic, in-process) exactly like the browser fallback path.
global.BroadcastChannel = undefined;
delete require.cache[require.resolve('../site/thread_client.js')];
const THREAD = require('../site/thread_client.js');
global.window.THREAD = THREAD;

// stores the bridge may look at
global.window.acAssumptionsData = [
    { asmId: 'AS-041', text: 'GLA available', state: 'Proposed' },
    { asmId: 'AS-047', text: 'Flutter margin', state: 'Proposed' },
    { asmId: 'AS-101', text: 'Crossfeed 30 s', state: 'Proposed' }
];
global.window.systemsData = [];
global.window.renderACAssumptions = function () {};
global.window.renderSysAssumptions = function () {};

const BRIDGE = require('../site/thread_bridge.js');
const bridge = BRIDGE.create(global.window);
check('bridge boots on the shim and reports a live loopback', !!bridge && bridge.status().connected);

// a fake CAD Lab client on the same loopback to observe + inject
const cad = THREAD.createClient({ tool: 'cadlab', thread: 'AE-001' });
cad.addLoopback();
const seenByCad = [];
cad.onEvent(e => seenByCad.push(e));

// ---- [2] publish ---------------------------------------------------------
global.window.acAssumptionsData[0].state = 'Validated';        // one human flip
const changed = bridge.sweep();
check('single flip sweeps as exactly one change', changed.length === 1 && changed[0].id === 'AS-041');
check('flip reached the roster as asm-state Validated',
    seenByCad.some(e => e.kind === 'asm-state' && e.id === 'AS-041' && e.state === 'Validated' && e.tool === 'safetylab'));

global.window.acAssumptionsData.forEach(a => { a.state = 'Verified'; });   // bulk (3 at once... = BULK_LIMIT)
global.window.acAssumptionsData.push({ asmId: 'AS-200', state: 'Proposed' });
global.window.acAssumptionsData.push({ asmId: 'AS-201', state: 'Proposed' });
const before = seenByCad.length;
// simulate a project load: many changes + membership change in one sweep
global.window.acAssumptionsData[1].state = 'Invalidated';
global.window.acAssumptionsData[2].state = 'Invalidated';
bridge.sweep();
const bulkPublished = seenByCad.length - before;
check('bulk change (project-load scale) publishes nothing — a load is not a flip', bulkPublished === 0);

const pubRes = bridge.publishAsmState('AS-200', 'Validated');
check('explicit publishAsmState publishes', !!pubRes && seenByCad.some(e => e.id === 'AS-200' && e.state === 'Validated'));
global.window.acAssumptionsData[3].state = 'Validated';        // reflect it in the store
const after = seenByCad.filter(e => e.id === 'AS-200').length;
bridge.sweep();
check('explicit publish does not double-publish on the next sweep',
    seenByCad.filter(e => e.id === 'AS-200').length === after);

// ---- [3] consume ---------------------------------------------------------
const storeSnapshot = JSON.stringify(global.window.acAssumptionsData);
cad.publish({ kind: 'part-release', id: 'P-001', rev: 'B', hash: 'a1b2c3d4' });
cad.publish({ kind: 'evidence', id: 'EV-2026-041', state: 'ready', payload: { asmId: 'AS-041' } });
check('foreign part-release + evidence land in the inbox',
    bridge._inbox.some(e => e.kind === 'part-release' && e.id === 'P-001' && e.hash === 'a1b2c3d4') &&
    bridge._inbox.some(e => e.kind === 'evidence' && e.id === 'EV-2026-041'));
check('eventsFor(asmId) finds the evidence packet for AS-041',
    bridge.eventsFor('AS-041').some(e => e.kind === 'evidence'));
check('IRON RULE: consuming evidence wrote NO store — no assumption state moved',
    JSON.stringify(global.window.acAssumptionsData) === storeSnapshot);
check('bridge source contains no assumption store writes',
    !/acAssumptionsData\[[^\]]*\]\s*\.state\s*=/.test(read('thread_bridge.js')) &&
    !/\.state\s*=\s*env/.test(read('thread_bridge.js')));

// render hooks got wrapped
check('render hooks carry the bridge wrap guard',
    global.window.renderACAssumptions._threadBridgeWrapped === true &&
    global.window.renderSysAssumptions._threadBridgeWrapped === true);

// ---- [5] IMPACT RESOLUTION — geometry change → zonal / PRA / ZSA / FHA ----
// Stand up a small but REAL safety-case slice + the register's own resolver.
global.window.SEVERITY_RANK = { 'Catastrophic': 5, 'Hazardous': 4, 'Major': 3, 'Minor': 2, 'No Safety Effect': 1 };
global.window.acFhaData = [{ fcId: 'FC-12', severity: 'Catastrophic', assumptionIds: ['AS-041'] }];
global.window.praData = [{ praId: 'PRA-05', zones: ['Z-210'], affectedZones: ['Z-210'], mitigation: 'bird-strike load path' }];
global.window.zsaData = [{ zoneId: 'Z-210', zsaCheckpoint: 'CP-3', mitigation: 'clamp clearance holds' }];
global.window.projectConfig = { macModels: [], zonalAccepted: { 'Z-210:SPF-1': { basis: 'single-failure accepted, geometry-bounded' } } };
global.window.aiAssumptions = [];
// assumption_moat.js reads BARE globals (browser: window.x === x); in Node they
// must live on `global`. Mirror the same array/object refs so mutations stay shared.
['acAssumptionsData', 'systemsData', 'aiAssumptions', 'acFhaData', 'praData', 'zsaData', 'projectConfig', 'SEVERITY_RANK']
    .forEach(k => { global[k] = global.window[k]; });
delete require.cache[require.resolve('../site/assumption_moat.js')];
require('../site/assumption_moat.js');                 // the same where-used truth the register renders
check('assumption where-used resolver available to the bridge', typeof global.window.asmRegister === 'function');

// LOCK the production reality: Safety Lab's praData/zsaData/projectConfig are
// top-level `let` bindings — bare-visible, NOT window properties. Strip the
// window copies so the bridge is forced to read the SAME bare globals the app
// (and asmWhereUsed) use. A revert to window.praData fails right here.
['praData', 'zsaData', 'projectConfig', 'acFhaData', 'SEVERITY_RANK'].forEach(k => { try { delete global.window[k]; } catch (_) {} });

// AS-041 sits under a Catastrophic FHA and is NOT validated — the credit is not real.
global.window.acAssumptionsData.find(a => a.asmId === 'AS-041').state = 'Proposed';

// A CAD part that stands on AS-041 and occupies zone Z-210 REVISES (geometry will move).
cad.publish({ kind: 'part-revise', id: 'P-050', rev: 'B', payload: { assumptions: ['AS-041'], zones: ['Z-210'] } });
const im = bridge._inbox[bridge._inbox.length - 1]._impact;
check('part-revise resolves a non-empty impact set', !!im && im.impacts.length > 0);
check('ZONE impact — zonal acceptance covering Z-210 flagged', im.zones.some(i => i.kind === 'ZONAL' && /Z-210/.test(i.detail)));
check('PRA impact — PRA-05 footprint includes Z-210 flagged', im.pra.some(i => i.ref === 'PRA-05'));
check('ZSA impact — zone Z-210 walkthrough flagged', im.zsa.some(i => /Z-210/.test(i.detail)));
check('FHA impact via the assumption spine — FC-12 [Catastrophic]',
    (im.byKind.FHA || []).some(i => i.ref === 'FC-12' && i.severity === 'Catastrophic'));
check('worst severity rolls up to Catastrophic', im.worstSevRank === 5);
check('LOUD flag — geometry moved under a Cat/Haz claim on an unvalidated assumption',
    im.flags.length >= 1 && /AS-041/.test(im.flags[0]) && /not real/.test(im.flags[0]));

// Honest empty: a part linked to nothing and named nowhere → say so, invent nothing.
cad.publish({ kind: 'part-release', id: 'P-999', rev: 'A', hash: 'deadbeef', payload: { assumptions: [], zones: [] } });
const im2 = bridge._inbox[bridge._inbox.length - 1]._impact;
check('unlinked, unreferenced part → HONEST empty impact set (no invented impacts)',
    !!im2 && im2.impacts.length === 0 && im2.flags.length === 0);

// IRON RULE holds through impact resolution.
const snapImpact = JSON.stringify(global.window.acAssumptionsData);
bridge.impactsFor({ kind: 'part-revise', id: 'P-050', payload: { assumptions: ['AS-041'], zones: ['Z-210'] } });
check('IRON RULE — impact resolution wrote NO store', JSON.stringify(global.window.acAssumptionsData) === snapImpact);
check('bridge source names no store-write on the impact path',
    !/praData\[[^\]]*\]\s*=/.test(read('thread_bridge.js')) && !/zsaData\.push/.test(read('thread_bridge.js')));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
