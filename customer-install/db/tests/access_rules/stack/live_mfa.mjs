// Runs the REAL site/mfa.js reauthenticate against the self-hosted stack, with a live channel open.
import * as supa from '@supabase/supabase-js';
import { authenticator } from 'otplib';
import { execFileSync } from 'node:child_process'; import fs from 'node:fs'; import vm from 'node:vm';
const env = Object.fromEntries(fs.readFileSync((process.env.STACK_DIR || '/tmp/stack') + '/.env','utf8').split('\n').filter(l=>/^[A-Z_]+=/.test(l)).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
const sql=(q)=>execFileSync('docker',['exec','-e','PGPASSWORD='+env.POSTGRES_PASSWORD,'supabase-db','psql','-h','127.0.0.1','-U','postgres','-d','postgres','-At','-c',q],{encoding:'utf8',env:{...process.env,DOCKER_HOST:'unix:///tmp/docker.sock'}}).trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0, fail=0; const check=(n,c,d)=>{ if(c){pass++;console.log('  PASS  '+n);} else {fail++;console.log('  FAIL  '+n+(d?' — '+d:''));} };
const PW='Sl-proof-pass-1';
const W=sql(`select id from public.workspaces where name='Company'`).split('\n')[0]; const P=sql(`select id from public.projects where name='Freighter'`).split('\n')[0];
const topic=`slab-crdt:${W}:${P}`;
const [fid,secret]=sql(`select id||'|'||secret from auth.mfa_factors where status='verified' limit 1`).split('|');
// the app's client, with the 3 Oct listener from helpers_modules.js
function appClient(){ const c=supa.createClient('http://localhost:8000',env.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  c.auth.onAuthStateChange((event,session)=>{ if(event==='MFA_CHALLENGE_VERIFIED'&&session&&session.access_token){ try{ c.realtime.setAuth(session.access_token);}catch(_){} } }); return c; }
function loadMfa(client, source){
  const els={}; const el=id=>(els[id]=els[id]||{id,value:'',style:{},textContent:'',focus(){},remove(){}});
  const store={}; const ls={getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
  const win={getSupabaseClient:()=>client,showToast:()=>{},supabase:{createClient:supa.createClient},localStorage:ls};
  const doc={createElement:()=>({style:{},appendChild(){},setAttribute(){},remove(){},set innerHTML(v){}}),body:{appendChild(){}},getElementById:el};
  const sb={window:win,document:doc,localStorage:ls,console,setTimeout,clearTimeout,Promise,JSON,Date,String,Object,Array}; sb.globalThis=sb;
  vm.createContext(sb); vm.runInContext(source,sb,{filename:'mfa.js'});
  // the person types the code when the box appears
  const typer=setInterval(async()=>{ const g=els['mfa-ch-go']; if(g&&g.onclick&&!g._done){ g._done=true; els['mfa-ch-code'].value=authenticator.generate(secret); await g.onclick.call(g);} },50);
  return {mfa:win.SafetyLabMFA, stop:()=>clearInterval(typer)};
}
function open(c){const got=[],sts=[];const ch=c.channel(topic,{config:{private:true,broadcast:{self:false}}});ch.on('broadcast',{event:'yupdate'},m=>got.push(m.payload.who));
  const first=new Promise(res=>ch.subscribe((s)=>{sts.push(s);res(s);})); return {got,sts,ch,first};}
const real=fs.readFileSync(process.env.MFA_JS || new URL('../../../../../site/mfa.js', import.meta.url),'utf8');
const variants=[['real mfa.js',real],['MUTATION (password checked on the app session)',real.replace('cr = await chk.auth.signInWithPassword(','cr = await sb.auth.signInWithPassword(')]];
const o=appClient(); await o.auth.signInWithPassword({email:'owner@co.test',password:PW}); const jo=open(o); await jo.first;
const rv=sql(`insert into public.reviews(project_id, title, status, requested_by) values ('${P}','Live reauth','in_review','${(await o.auth.getUser()).data.user.id}') returning id`).split('\n')[0];
for (const [name,src] of variants){
  console.log('\n['+name+']');
  const e=appClient(); await e.auth.signInWithPassword({email:'editor@co.test',password:PW});
  await e.auth.mfa.challengeAndVerify({factorId:fid,code:authenticator.generate(secret)}); await sleep(300);
  const je=open(e); await je.first;
  const {mfa,stop}=loadMfa(e,src);
  const r=await mfa.reauthenticate('editor@co.test',PW); stop(); await sleep(3000);
  const tag=name.startsWith('MUT')?'MUTANT ':'';
  if(!tag){
    check('re-check with the second step succeeds', r.ok===true, JSON.stringify(r));
    check('the open co-editing channel is still joined', je.ch.state==='joined', je.ch.state+' '+je.sts);
    await jo.ch.send({type:'broadcast',event:'yupdate',payload:{who:'O'}}); await sleep(1500);
    check('and still receives the other person\'s edits', je.got.includes('O'), JSON.stringify(je.got));
    const so=await e.from('signoffs').insert({review_id:rv,project_id:P,baseline_sha256:'live',signer_user_id:(await e.auth.getUser()).data.user.id,signer_email:'x',role_at_signing:'approver',decision:'approve',auth_assurance:'session'}).select('auth_assurance');
    check('the sign-off right after is recorded as two-factor', so.data&&so.data[0]&&so.data[0].auth_assurance==='mfa', JSON.stringify(so));
    const bad=await mfa.reauthenticate('editor@co.test','wrong'); check('a wrong password is refused', bad.ok===false&&bad.reason==='password');
    const other=await mfa.reauthenticate('owner@co.test',PW); check('another account\'s password is refused', other.ok===false&&other.reason==='password', JSON.stringify(other));
    check('the app session is still the editor at aal2 after those', JSON.parse(Buffer.from((await e.auth.getSession()).data.session.access_token.split('.')[1],'base64url')).aal==='aal2');
  } else {
    check('MUTATION is caught: the channel is closed by the server', je.ch.state!=='joined', je.ch.state+' '+je.sts);
  }
  try{ e.removeAllChannels(); }catch(_){}
}
// no-factor owner: re-check on the app session, channel stays, sign-off recorded as password re-check
{
  console.log('\n[no second factor]');
  const {mfa,stop}=loadMfa(o,real); const r=await mfa.reauthenticate('owner@co.test',PW); stop(); await sleep(2500);
  check('owner re-check succeeds', r.ok===true); check('owner channel still joined', jo.ch.state==='joined', jo.ch.state);
  const so=await o.from('signoffs').insert({review_id:rv,project_id:P,baseline_sha256:'live2',signer_user_id:(await o.auth.getUser()).data.user.id,signer_email:'x',role_at_signing:'reviewer',decision:'approve',auth_assurance:'mfa'}).select('auth_assurance');
  check('owner sign-off recorded as a fresh password re-check', so.data&&so.data[0]&&so.data[0].auth_assurance==='password_reauth', JSON.stringify(so));
}
console.log('\n'+(fail?'FAIL':'PASS')+'  '+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
