// ============================================================================
// tools/perf/probe_arrive.js — v2 (23 Sep 2026) — how long does each tab take to
// arrive, at 1x / 5x / 20x / 100x the sample project?
//
// WHY v2. v1 took a per-call time limit argument and ignored it, so when one tab
// stalled on a big project the whole run hung with no answer. v2 time-boxes every
// call: if the page does not answer within the budget, the harness stops the
// running script (Runtime.terminateExecution), records TIMEOUT with the elapsed
// time, checks the page still answers, and moves on. A stalled tab becomes a
// number in the report instead of a hung run.
//
// WHAT IT MEASURES, per scale, in a FRESH page each time (no state carried over):
//   load    — loadSampleProject() + inflating acFhaData xN and systemsData xN/4
//   per tab — sync:   time inside switchTab() (the frozen part the user feels)
//             settle: time until the page next paints and is idle enough to run
//                     a timer (two animation frames + one macrotask) — catches
//                     work deferred out of switchTab
//             longest long task seen while settling
//   edit    — one FHA row severity change + re-render + autosave schedule, on
//             the FHA tab
//   profile — with --profile, a CPU profile of every tab slower than
//             --profile-over ms (timed-out tabs included: the profile is
//             stopped after the run is terminated); top functions by self time.
//   --tabs a,b,c measures only those tabs.
//
// USAGE (cloud Chromium, site copied across):
//   CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//     node tools/perf/probe_arrive.js <repo root> [--scales 1,5,20,100]
//       [--budget 20000 (max 25000)] [--profile] [--profile-over 150] [--out result.json]
// ==========================================================================*/
'use strict';
const path = require('path'), fs = require('fs'), http = require('http');

const args = process.argv.slice(2);
const ROOT = path.resolve(args[0] || '.');
function opt(name, dflt) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; }
const SCALES = String(opt('--scales', '1,5,20,100')).split(',').map(Number).filter(n => n >= 1);
const BUDGET = Math.min(25000, Number(opt('--budget', '20000')));   // stays under cdp.js's own 30 s cut-off
const PROFILE = args.includes('--profile');
const PROFILE_OVER = Number(opt('--profile-over', '150'));
const OUT = opt('--out', null);
const TABS_OPT = opt('--tabs', null);   // comma list to measure only some tabs
const IDLE = Number(opt('--idle', '0'));    // ms: after the edit, profile an idle window (background timers only)
const CALLERS = opt('--callers', null); // function-name substring: print its top caller chains

const { launch, Cdp, freePort, sleep } = require(path.join(ROOT, 'tools/smoke/cdp.js'));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(ROOT, 'site', p);
    if (!f.startsWith(path.join(ROOT, 'site')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});

const TABS_ALL = ['dashboard', 'ac-fha', 'ac-asm', 'phases', 'sys-dir', 'items', 'pasa', 'trace', 'golden-thread', 'fta', 'markov', 'review', 'arp-process', 'vv-status', 'ccmr', 'baselines', 'reqs-repo', 'moc', 'validation', 'ai'];

// Evaluate with a hard time box. Returns {ok, value, ms} or {timeout:true, ms} or {error, ms}.
async function evalBoxed(cdp, sessionId, expression, budget) {
    const t0 = Date.now();
    const call = cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
        .then(r => r.exceptionDetails
            ? { error: (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text || 'exception').slice(0, 200) }
            : { ok: true, value: r.result && r.result.value },
              // cdp.js rejects any call that has no answer after 30 s; that is a timeout too
              e => ({ timeout: true, cdpTimeout: String(e && e.message || e) }));
    const timer = sleep(budget).then(() => ({ timeout: true }));
    const r = await Promise.race([call, timer]);
    if (r.timeout) {
        // Stop whatever is running so the page is usable for the next measurement.
        try { await Promise.race([cdp.send('Runtime.terminateExecution', {}, sessionId), sleep(5000)]); } catch (_) {}
        call.catch(() => {});
    }
    r.ms = Date.now() - t0;
    return r;
}

async function alive(cdp, sessionId) {
    const r = await evalBoxed(cdp, sessionId, '1+1', 5000);
    return r.ok && r.value === 2;
}

function summarizeProfile(profile, top) {
    // self time per function, plus INCLUSIVE time for app functions (so the entry point
    // that leads to a hot native call, e.g. a forced layout, is visible too).
    const byId = new Map(profile.nodes.map(n => [n.id, n]));
    const parent = new Map();
    profile.nodes.forEach(n => (n.children || []).forEach(c => parent.set(c, n.id)));
    const keyOf = n => { const cf = n.callFrame; return (cf.functionName || '(anonymous)') + '  ' + (cf.url ? cf.url.split('/').pop().split('?')[0] : '') + ':' + (cf.lineNumber + 1); };
    const self = new Map(), incl = new Map();
    const dt = profile.timeDeltas || [];
    (profile.samples || []).forEach((id, i) => {
        const n = byId.get(id); if (!n) return;
        const ms = (dt[i] || 0) / 1000;
        self.set(keyOf(n), (self.get(keyOf(n)) || 0) + ms);
        const seen = new Set();
        for (let cur = n; cur; cur = byId.get(parent.get(cur.id))) {
            if (!cur.callFrame.url) continue;               // app code only
            const k = keyOf(cur); if (seen.has(k)) continue; seen.add(k);
            incl.set(k, (incl.get(k) || 0) + ms);
        }
    });
    const pick = m => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, ms]) => ({ fn: k, ms: Math.round(ms) }));
    const out = { self: pick(self), inclusive: pick(incl) };
    if (CALLERS) {
        // who leads to the named function: the nearest 6 app frames above it,
        // skipping the renderer wrapper chain (functions named wrapped*).
        const chains = new Map();
        (profile.samples || []).forEach((id, i) => {
            const ms = (dt[i] || 0) / 1000;
            let hit = null;
            for (let cur = byId.get(id); cur; cur = byId.get(parent.get(cur.id))) if (keyOf(cur).indexOf(CALLERS) === 0) { hit = cur; break; }
            if (!hit) return;
            const fr = [];
            for (let cur = byId.get(parent.get(hit.id)); cur && fr.length < 6; cur = byId.get(parent.get(cur.id))) {
                if (!cur.callFrame.url || /^wrapped/.test(cur.callFrame.functionName)) continue;
                fr.push(keyOf(cur));
            }
            const k = fr.join('  <  ');
            chains.set(k, (chains.get(k) || 0) + ms);
        });
        out.callers = [...chains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, ms]) => ({ chain: k, ms: Math.round(ms) }));
    }
    return out;
}

const INFLATE = scale => `(async()=>{const t0=performance.now(); await loadSampleProject(); const SCALE=${scale};
  const clone=(o,i)=>{const c=JSON.parse(JSON.stringify(o)); for (const k of ['id','internalId','fcId']) if (c[k]!=null) c[k]=String(c[k])+'_x'+i; return c;};
  const baseFha=acFhaData.slice(); for (let i=1;i<SCALE;i++) baseFha.forEach(r=>acFhaData.push(clone(r,i)));
  const baseSys=systemsData.slice(); for (let i=1;i<Math.max(1,Math.round(SCALE/4));i++) baseSys.forEach(sy=>{const c=clone(sy,i); c.name=(sy.name||'sys')+' '+i; systemsData.push(c);});
  return {ms:Math.round(performance.now()-t0), fha:acFhaData.length, systems:systemsData.length};})()`;

// sync = inside switchTab; settle = until two frames + one macrotask after it.
const SWITCH = tab => `(async()=>{
  const lt=[]; let po=null; try{ po=new PerformanceObserver(l=>l.getEntries().forEach(e=>lt.push(e.duration))); po.observe({type:'longtask'}); }catch(_){}
  const a=performance.now(); try{ switchTab(${JSON.stringify(tab)}); }catch(e){ return {error:String(e).slice(0,120)}; }
  const sync=performance.now()-a;
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,0))));
  const settle=performance.now()-a; try{ po&&po.disconnect(); }catch(_){}
  return {sync:Math.round(sync), settle:Math.round(settle), longest:Math.round(Math.max(0,...lt))};
})()`;

const EDIT = `(async()=>{ switchTab('ac-fha'); await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,0))));
  const b=performance.now(); acFhaData[0].severity = acFhaData[0].severity==='Major'?'Minor':'Major'; renderACFHA(); scheduleAutosave();
  const sync=performance.now()-b; await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,0))));
  return {sync:Math.round(sync), settle:Math.round(performance.now()-b), rows:acFhaData.length};})()`;

const TABS = TABS_OPT ? TABS_OPT.split(',') : TABS_ALL;

async function runScale(cdp, port, scale) {
    const out = { scale, tabs: {}, profiles: {} };
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Runtime.enable', {}, sessionId); await cdp.send('Page.enable', {}, sessionId);
    if (PROFILE) { await cdp.send('Profiler.enable', {}, sessionId); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }, sessionId); }
    const loaded = new Promise(res => cdp.on(m => { if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') res(); }));
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/' }, sessionId);
    await Promise.race([loaded, sleep(30000)]); await sleep(2500);

    const load = await evalBoxed(cdp, sessionId, INFLATE(scale), 25000);
    out.load = load.ok ? Object.assign({ wallMs: load.ms }, load.value) : (load.timeout ? { TIMEOUT: load.ms } : { error: load.error });
    log(`\n== scale ${scale}x  load: ${JSON.stringify(out.load)}`);
    if (!load.ok) { out.aborted = 'load failed'; await cdp.send('Target.closeTarget', { targetId }); return out; }

    for (const t of TABS) {
        const r = await evalBoxed(cdp, sessionId, SWITCH(t), BUDGET);
        let row;
        if (r.timeout) row = { TIMEOUT: r.ms, pageAlive: await alive(cdp, sessionId) };
        else if (r.error) row = { error: r.error };
        else row = r.value;
        out.tabs[t] = row;
        log(`  ${(t + ':').padEnd(16)} ${JSON.stringify(row)}`);
        const slow = row.TIMEOUT || (row.settle || 0) > PROFILE_OVER;
        if (PROFILE && slow) {
            // leave the tab, then profile a fresh arrival
            await evalBoxed(cdp, sessionId, `switchTab('dashboard');1`, BUDGET);
            await cdp.send('Profiler.start', {}, sessionId);
            await evalBoxed(cdp, sessionId, SWITCH(t), BUDGET);
            const { profile } = await cdp.send('Profiler.stop', {}, sessionId);
            out.profiles[t] = summarizeProfile(profile, 12);
            log('      self:'); out.profiles[t].self.forEach(p => log(`      ${String(p.ms).padStart(6)} ms  ${p.fn}`));
            log('      inclusive (app code):'); out.profiles[t].inclusive.forEach(p => log(`      ${String(p.ms).padStart(6)} ms  ${p.fn}`));
            if (out.profiles[t].callers) { log('      callers of ' + CALLERS + ':'); out.profiles[t].callers.forEach(p => log(`      ${String(p.ms).padStart(6)} ms  ${p.chain}`)); }
        }
    }
    if (PROFILE) await cdp.send('Profiler.start', {}, sessionId);
    const e = await evalBoxed(cdp, sessionId, EDIT, BUDGET);
    if (PROFILE && !e.timeout) {
        const { profile } = await cdp.send('Profiler.stop', {}, sessionId);
        out.profiles.edit = summarizeProfile(profile, 15);
        log('  edit profile, self:'); out.profiles.edit.self.forEach(p => log(`      ${String(p.ms).padStart(6)} ms  ${p.fn}`));
        log('  edit profile, inclusive (app code):'); out.profiles.edit.inclusive.forEach(p => log(`      ${String(p.ms).padStart(6)} ms  ${p.fn}`));
    }
    out.edit = e.ok ? e.value : (e.timeout ? { TIMEOUT: e.ms } : { error: e.error });
    log(`  edit on FHA tab: ${JSON.stringify(out.edit)}`);
    if (IDLE > 0) {
        // Nothing is evaluated during this window: whatever runs is background
        // work (timers, sweeps, observers). Long tasks are counted in-page.
        await evalBoxed(cdp, sessionId, `window.__idleLT=[];try{new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__idleLT.push(Math.round(e.duration)))).observe({type:'longtask'});}catch(_){};1`, 5000);
        await cdp.send('Profiler.enable', {}, sessionId); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }, sessionId);
        await cdp.send('Profiler.start', {}, sessionId);
        await sleep(IDLE);
        const lt = await evalBoxed(cdp, sessionId, 'window.__idleLT', 25000);
        let prof = null; try { prof = (await cdp.send('Profiler.stop', {}, sessionId)).profile; } catch (_) {}
        out.idle = { ms: IDLE, longTasks: lt.ok ? lt.value : (lt.timeout ? 'page busy > 25 s' : lt.error) };
        log(`  idle ${IDLE} ms, long tasks: ${JSON.stringify(out.idle.longTasks)}`);
        if (prof) {
            out.profiles.idle = summarizeProfile(prof, 25);
            log('  idle profile, inclusive (app code, wrappers hidden):');
            out.profiles.idle.inclusive.filter(p => !/wrapped/.test(p.fn)).forEach(p => log(`      ${String(p.ms).padStart(6)} ms  ${p.fn}`));
        }
    }
    await cdp.send('Target.closeTarget', { targetId });
    return out;
}

function log(s) { process.stdout.write(s + '\n'); }

(async () => {
    const port = await freePort();
    await new Promise(r => server.listen(port, '127.0.0.1', r));
    const browser = await launch();
    const cdp = await Cdp.connect(browser.wsUrl);
    const results = { when: new Date().toISOString(), budgetMs: BUDGET, scales: [] };
    try {
        for (const s of SCALES) results.scales.push(await runScale(cdp, port, s));
    } finally {
        if (OUT) fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
        try { browser.proc.kill("SIGKILL"); } catch (_) {}
        server.close();
    }
    process.exit(0);
})().catch(e => { console.error(String(e && e.stack || e).slice(0, 400)); process.exit(1); });
