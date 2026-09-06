#!/usr/bin/env node
/*
 * Regression — the single backend-config surface + hard-stop egress guard. (6 Sep 2026)
 *
 * slab_config.js is the ONE place a backend address is resolved. It must load
 * before every reader, publish window.SLConfig, and HARD-STOP the boot when a
 * customer-hosted install still points anything at Safety Lab (Waqas: "not on our
 * cloud, at any point"). This suite EXECUTES the real module under several window
 * setups and asserts the mode/fatal decision, plus checks every reader consults it.
 *
 * Run: node tests/regression_config_surface.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const cfgSrc = S('slab_config.js'), idx = S('index.html');
const PIN = require('./lib/pinfloor.js');
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
function before(hay, a, b) { const i = hay.indexOf(a), j = hay.indexOf(b); return i >= 0 && j >= 0 && i < j; }

// Run the real module against a stubbed window, return the resulting SLConfig (+ fatal flag).
function runConfig(win) {
  const W = Object.assign({}, win);
  const doc = { readyState: 'complete', addEventListener() {}, body: { appendChild() {} }, createElement() { return { setAttribute(){}, style:{}, set innerHTML(v){}, }; }, documentElement: { appendChild(){} } };
  const ctx = { window: W, document: doc, console: { info(){}, error(){}, table(){}, log(){}, warn(){} }, URL };
  ctx.window.document = doc;
  vm.createContext(ctx);
  vm.runInContext(cfgSrc, ctx);
  return { cfg: ctx.window.SLConfig, fatal: ctx.window.__SLAB_CONFIG_FATAL__ || null };
}

console.log('\n[config] loads first, and readers consult it');
check('slab_config.js exists', cfgSrc.length > 0);
check('index.html loads slab_config.js', /slab_config\.js\?v=/.test(idx));
const SREF = f => '<script src="' + f;
check('slab_config loads BEFORE fn_wrap and every backend reader',
      before(idx, SREF('slab_config.js'), SREF('fn_wrap.js')) &&
      before(idx, SREF('slab_config.js'), SREF('safety_lab.js')) &&
      before(idx, SREF('slab_config.js'), SREF('bindings_modules.js')) &&
      before(idx, SREF('slab_config.js'), SREF('helpers_modules.js')) &&
      before(idx, SREF('slab_config.js'), SREF('corpus_retrieve.js')) &&
      before(idx, SREF('slab_config.js'), SREF('labs_thread_config.js')));
check('safety_lab.js reads SLConfig.supabaseUrl/Key', /_slabCfg && _slabCfg\.supabaseUrl/.test(S('safety_lab.js')) && /_slabCfg && _slabCfg\.supabaseKey/.test(S('safety_lab.js')));
check('bindings_modules.js reads SLConfig.aiEndpoint', /window\.SLConfig && window\.SLConfig\.aiEndpoint/.test(S('bindings_modules.js')));
check('notify_agents.js reads SLConfig.aiEndpoint', /window\.SLConfig && window\.SLConfig\.aiEndpoint/.test(S('notify_agents.js')));
check('corpus_retrieve.js reads SLConfig.corpusEndpoint', /window\.SLConfig && window\.SLConfig\.corpusEndpoint/.test(S('corpus_retrieve.js')));
check('labs_thread_config.js reads SLConfig.supabaseUrl/Key', /window\.SLConfig && window\.SLConfig\.supabaseUrl/.test(S('labs_thread_config.js')));
check('_initSupabaseClient bails on the fatal flag', /__SLAB_CONFIG_FATAL__/.test(S('helpers_modules.js')) && before(strip(S('helpers_modules.js')), '__SLAB_CONFIG_FATAL__', 'createClient'));

console.log('\n[config] EXECUTED — mode resolution');
check('EXEC: no overrides → hosted-demo, not fatal', (()=>{ const r=runConfig({}); return r.cfg.mode==='hosted-demo' && !r.fatal; })());
check('EXEC: hosted-demo keeps our defaults', (()=>{ const r=runConfig({}); return /fhrqkhdrwbfnizkepkch/.test(r.cfg.supabaseUrl) && /safetylabaero\.com/.test(r.cfg.aiEndpoint); })());
check('EXEC: desktop flag → desktop mode', (()=>{ const r=runConfig({__SLAB_DESKTOP__:true}); return r.cfg.mode==='desktop' && !r.fatal; })());

console.log('\n[config] EXECUTED — the HARD-STOP guard bites');
check('EXEC: self-hosted db + AI still ours → FATAL (would leak)', (()=>{
  const r=runConfig({__SLAB_SUPABASE_URL__:'https://cust.supabase.co', __SLAB_SUPABASE_KEY__:'k'});
  return r.cfg.mode==='self-hosted' && typeof r.fatal==='string' && /AI inference/.test(r.fatal);
})());
check('EXEC: self-hosted db + AI moved to customer → NOT fatal', (()=>{
  const r=runConfig({__SLAB_SUPABASE_URL__:'https://cust.supabase.co', __SLAB_SUPABASE_KEY__:'k', __SLAB_AI_ENDPOINT__:'https://ai.cust.mil'});
  return r.cfg.mode==='self-hosted' && !r.fatal;
})());
check('EXEC: self-hosted db but NO key → FATAL', (()=>{
  const r=runConfig({__SLAB_SUPABASE_URL__:'https://cust.supabase.co', __SLAB_AI_ENDPOINT__:'https://ai.cust.mil'});
  return typeof r.fatal==='string' && /key/.test(r.fatal);
})());
check('EXEC: self-hosted with corpus still ours → FATAL', (()=>{
  const r=runConfig({__SLAB_SUPABASE_URL__:'https://cust.supabase.co', __SLAB_SUPABASE_KEY__:'k', __SLAB_AI_ENDPOINT__:'https://ai.cust.mil', __SLAB_CORPUS_ENDPOINT__:'https://corpus.safetylabaero.com'});
  return typeof r.fatal==='string' && /method corpus/.test(r.fatal);
})());
check('EXEC: browser-only + a backend still set → FATAL', (()=>{
  const r=runConfig({__SLAB_LOCAL_ONLY__:true, __SLAB_SUPABASE_URL__:'https://cust.supabase.co'});
  return r.cfg.mode==='browser-only' && typeof r.fatal==='string';
})());
check('EXEC: browser-only clean → not fatal, no cloud endpoints', (()=>{
  const r=runConfig({__SLAB_LOCAL_ONLY__:true});
  return r.cfg.mode==='browser-only' && !r.fatal && r.cfg.supabaseUrl==='' && r.cfg.aiEndpoint==='';
})());
check('EXEC: our own supabase ref counts as "ours" even if typed as the db override', (()=>{
  const r=runConfig({__SLAB_SUPABASE_URL__:'https://fhrqkhdrwbfnizkepkch.supabase.co', __SLAB_SUPABASE_KEY__:'k'});
  return r.cfg.mode==='hosted-demo' && !r.fatal;   // pointing at OUR db is not "self-hosted"
})());

console.log('\n[config] EXECUTED — egress self-test');
check('EXEC: egress manifest lists database + AI hosts', (()=>{
  const r=runConfig({});
  const p = r.cfg.egress.map(e=>e.purpose);
  return p.indexOf('database')>=0 && p.indexOf('AI inference')>=0 && r.cfg.egress.every(e=>typeof e.safetyLab==='boolean');
})());
check('the module exposes a SLConfigEgress() self-test', /SLConfigEgress = function/.test(cfgSrc));

console.log('\n[config] pins');
check('slab_config pinned in index >= 1.0 (floor; 1.1 added webAppUrl + desktop flag, 6 Sep)', PIN.atLeast(idx, 'slab_config.js', '1.0'));
check('safety_lab >= 65.51', PIN.atLeast(idx,'safety_lab.js','65.51'));
check('bindings_modules >= 1.37', PIN.atLeast(idx,'bindings_modules.js','1.37'));
check('helpers_modules >= 2.88', PIN.atLeast(idx,'helpers_modules.js','2.88'));
check('notify_agents >= 1.5', PIN.atLeast(idx,'notify_agents.js','1.5'));
check('corpus_retrieve >= 1.2', PIN.atLeast(idx,'corpus_retrieve.js','1.2'));
check('labs_thread_config >= 1.1', PIN.atLeast(idx,'labs_thread_config.js','1.1'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
