#!/usr/bin/env node
/*
 * Regression: the labs thread no longer joins a public cloud channel (3 Oct 2026, batch 4).
 *
 * Every copy of the app joined the PUBLIC Realtime channel labs-thread:AE-001 for every project
 * of every customer. Anyone with the publishable key could read each assumption state change
 * as it happened and inject part-release / evidence events into every user's assumption
 * register. The cross-machine leg is now off unless LABS_THREAD_CONFIG.cloud === true (no
 * shipped build sets it), and never for an export-controlled project. Same-browser
 * BroadcastChannel is unchanged.
 *
 * Run: node tests/regression_labs_thread_closed_20261003.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const REPO = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8');
const CLI = read('site/thread_client.js'), CFG = read('site/labs_thread_config.js');

function run(cfg, pc, source) {
  const joined = [];
  const win = { LABS_THREAD_CONFIG: cfg, supabase: { createClient: () => ({ channel: (n) => { joined.push(n); const ch = { on() { return ch; }, subscribe() { return ch; }, send() {} }; return ch; } }) } };
  const sb = { window: win, console, Date, JSON, Math, Set, Map, Array, Object, String, Number, Error, setTimeout, clearTimeout };
  vm.createContext(sb);
  vm.runInContext('var projectConfig = ' + JSON.stringify(pc || {}) + ';', sb);
  vm.runInContext(source || CLI, sb);
  const T = win.THREAD; const tc = T.createClient({ tool: 'safetylab', thread: 'AE-001' });
  const r = tc.addSupabase();
  return { r, joined };
}
const base = { url: 'https://x.supabase.co', anonKey: 'sb_publishable_x', channel: 'labs-thread' };

check('the shipped config switches the cloud leg off', /cloud:\s*false/.test(CFG));
{ const t = run(base); check('without cloud === true: no channel joined', t.r === null && t.joined.length === 0); }
{ const t = run(Object.assign({}, base, { cloud: 'yes' })); check('a truthy-but-not-true flag does not count', t.joined.length === 0); }
{ const t = run(Object.assign({}, base, { cloud: true })); check('explicit cloud === true: the leg still works (for when an authorized channel exists)', t.joined.length === 1 && t.joined[0] === 'labs-thread:AE-001'); }
{ const t = run(Object.assign({}, base, { cloud: true }), { isITARControlled: true }); check('export-controlled project: never, even with the flag', t.joined.length === 0); }
{ const mut = CLI.replace('if (cfg.cloud !== true) return null;', '');
  check('mutation site present', mut !== CLI);
  const t = run(base, {}, mut); check('MUTATION: without the flag check every copy joins the public channel again', t.joined.length === 1); }

console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
