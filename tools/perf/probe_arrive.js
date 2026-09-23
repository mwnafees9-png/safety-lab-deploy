// Kept from the 23 Sep 2026 lazy-render session. Usage: CHROME_PATH=<chromium> node tools/perf/probe_arrive2.js <repo root> [scale]. Serves site/ locally, loads the sample project, prints JSON.
const path=require('path'),fs=require('fs'),http=require('http');const ROOT=path.resolve(process.argv[2]);const SCALE=process.argv[3]||'1';
const {launch,Cdp,freePort,sleep}=require(path.join(ROOT,'tools/smoke/cdp.js'));
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(ROOT,'site',p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(fs.readFileSync(f));});
(async()=>{const port=await freePort();await new Promise(r=>server.listen(port,'127.0.0.1',r));const browser=await launch();const cdp=await Cdp.connect(browser.wsUrl);
const {targetId}=await cdp.send('Target.createTarget',{url:'about:blank'});const {sessionId}=await cdp.send('Target.attachToTarget',{targetId,flatten:true});
await cdp.send('Runtime.enable',{},sessionId);await cdp.send('Page.enable',{},sessionId);
const loaded=new Promise(res=>cdp.on(m=>{if(m.sessionId===sessionId&&m.method==='Page.loadEventFired')res();}));
await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+port+'/'},sessionId);await Promise.race([loaded,sleep(20000)]);await sleep(2500);
const ev=async(expr,ms)=>{const r=await cdp.send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true},sessionId);return r.exceptionDetails?('ERR '+(r.exceptionDetails.text||'')):(r.result&&r.result.value);};
console.log('load:', await ev(`(async()=>{const t0=performance.now(); await loadSampleProject(); const SCALE=${SCALE}; const clone=(o,i)=>{const c=JSON.parse(JSON.stringify(o)); for (const k of ['id','internalId','fcId']) if (c[k]!=null) c[k]=String(c[k])+'_x'+i; return c;};
  const baseFha=acFhaData.slice(); for (let i=1;i<SCALE;i++) baseFha.forEach(r=>acFhaData.push(clone(r,i)));
  const baseSys=systemsData.slice(); for (let i=1;i<Math.max(1,Math.round(SCALE/4));i++) baseSys.forEach(sy=>{const c=clone(sy,i); c.name=(sy.name||'sys')+' '+i; systemsData.push(c);});
  return Math.round(performance.now()-t0)+' ms, fha '+acFhaData.length+', systems '+systemsData.length;})()`, 60000));
const tabs=['dashboard','ac-fha','ac-asm','phases','sys-dir','items','pasa','trace','golden-thread','fta','markov','review','arp-process','vv-status','ccmr','baselines','reqs-repo','moc','validation','ai'];
for (const t of tabs) { const a=Date.now(); const r=await ev(`(function(){const a=performance.now(); try{switchTab('${t}');}catch(e){return 'ERR '+String(e).slice(0,60);} return Math.round(performance.now()-a);})()`, 15000); console.log((t+':').padEnd(16), r===undefined?('TIMEOUT >'+(Date.now()-a)+'ms'):r); }
console.log('edit on fha tab:', await ev(`(function(){switchTab('ac-fha'); const b=performance.now(); acFhaData[0].severity='Major'; renderACFHA(); scheduleAutosave(); return Math.round(performance.now()-b);})()`, 15000));
try{process.kill(browser.pid)}catch(_){} server.close();process.exit(0);})().catch(e=>{console.error(String(e).slice(0,200));process.exit(1);});
