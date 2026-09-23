// Kept from the 23 Sep 2026 lazy-render session. Usage: CHROME_PATH=<chromium> node tools/perf/probe_compute.js <repo root> [scale]. Serves site/ locally, loads the sample project, prints JSON.
// Runtime map: which functions run, how often and how long, during a burst of REAL edits.
const path=require('path'),fs=require('fs'),http=require('http');const ROOT=path.resolve(process.argv[2]);
const {launch,Cdp,evaluate,freePort,sleep}=require(path.join(ROOT,'tools/smoke/cdp.js'));
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(ROOT,'site',p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(fs.readFileSync(f));});
// names of top-level functions across the app modules
const names=new Set();for(const f of fs.readdirSync(path.join(ROOT,'site'))){if(!f.endsWith('.js')||f.startsWith('__'))continue;const s=fs.readFileSync(path.join(ROOT,'site',f),'utf8');for(const m of s.matchAll(/^(?:async\s+)?function\s+([a-z_$][\w$]*)\s*\(/gm))names.add(m[1]);}
(async()=>{const port=await freePort();await new Promise(r=>server.listen(port,'127.0.0.1',r));const browser=await launch();const cdp=await Cdp.connect(browser.wsUrl);
const {targetId}=await cdp.send('Target.createTarget',{url:'about:blank'});const {sessionId}=await cdp.send('Target.attachToTarget',{targetId,flatten:true});
await cdp.send('Runtime.enable',{},sessionId);await cdp.send('Page.enable',{},sessionId);
const loaded=new Promise(res=>cdp.on(m=>{if(m.sessionId===sessionId&&m.method==='Page.loadEventFired')res();}));
await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+port+'/'},sessionId);await Promise.race([loaded,sleep(20000)]);await sleep(2500);
const NAMES=JSON.stringify([...names]); const SCALE=process.argv[3]||'1';
const out=await evaluate(cdp,sessionId,`(async()=>{
  await loadSampleProject(); switchTab('dashboard'); await new Promise(r=>setTimeout(r,500));
  // INFLATE to a large project: clone the FHA rows and the systems many times over
  const SCALE=${SCALE};
  const clone=(o,i)=>{const c=JSON.parse(JSON.stringify(o)); for (const k of ['id','internalId','fcId']) if (c[k]!=null) c[k]=String(c[k])+'_x'+i; return c;};
  const baseFha=acFhaData.slice(); for (let i=1;i<SCALE;i++) baseFha.forEach(r=>acFhaData.push(clone(r,i)));
  const baseSys=systemsData.slice(); for (let i=1;i<Math.max(1,Math.round(SCALE/4));i++) baseSys.forEach(sy=>{const c=clone(sy,i); c.name=(sy.name||'sys')+' '+i; systemsData.push(c);});
  const sizes={fha:acFhaData.length, systems:systemsData.length, sysFha:systemsData.reduce((n,s)=>n+((s.fha||[]).length),0), bytes:JSON.stringify({acFhaData,systemsData}).length};
  const names=${NAMES}; const prof={}; let wrapped=0;
  for (const n of names) { const f=window[n]; if (typeof f!=='function' || /^[A-Z]/.test(n) || n==='scheduleAutosave_' ) continue;
    const w=function(){ const t=performance.now(); try { return f.apply(this, arguments); } finally { const d=performance.now()-t; const p=prof[n]||(prof[n]={n:0,ms:0}); p.n++; p.ms+=d; } };
    try { Object.keys(f).forEach(k=>{ w[k]=f[k]; }); window[n]=w; wrapped++; } catch(_){} }
  const T0=performance.now();
  // 1. ten phase-duration edits (a real onchange handler)
  for (let i=0;i<10;i++) { try { updatePhase(1,'duration', String(5+i)); } catch(e){} }
  // 2. ten assumption text edits
  const asm=(typeof acAssumptionsData!=='undefined'&&acAssumptionsData&&acAssumptionsData[0])||null;
  for (let i=0;i<10;i++) { try { if (asm) updateACAsmText(asm.internalId||asm.id, 'text', 'edit '+i); } catch(e){} }
  // 3. ten FHA severity changes straight on the store + the change signal every editor ends with
  for (let i=0;i<10;i++) { try { acFhaData[0].severity = (i%2)?'Major':'Hazardous'; scheduleAutosave(); } catch(e){} }
  await new Promise(r=>setTimeout(r,1500));   // let microtasks, idle work and the save watcher run
  const total=performance.now()-T0;
  const rows=Object.entries(prof).filter(([n,p])=>p.ms>=2).sort((a,b)=>b[1].ms-a[1].ms).slice(0,45).map(([n,p])=>n+'  x'+p.n+'  '+p.ms.toFixed(0)+'ms');
  return JSON.stringify({wrapped, sizes, total_ms: Math.round(total), rows});
})()`);
const r=JSON.parse(out); console.log('wrapped',r.wrapped,'functions; project',JSON.stringify(r.sizes),'; burst+settle',r.total_ms,'ms (includes a 1500 ms settle wait)'); r.rows.forEach(x=>console.log('  '+x));
try{browser.close&&browser.close()}catch(_){} try{process.kill(browser.pid)}catch(_){} server.close();process.exit(0);})().catch(e=>{console.error(e);process.exit(1);});
