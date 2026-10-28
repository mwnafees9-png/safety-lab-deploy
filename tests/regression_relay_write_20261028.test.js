#!/usr/bin/env node
/*
 * Regression: the company server's relay (/v1/ai/bridge) sends to Jama for items Safety Lab owns, and only that; the
 * public site relay (/api/bridge) still only reads (28 Oct 2026, Safety Lab Connections).
 * Pinned: [A] bridgeWriteProblem allows POST items, relationships and comments, and PATCH an item; refuses DELETE, PUT,
 * another path, a query string, a body over 2 MB and a body that is not JSON; [B] handleBridge checks the saved host
 * first (bridgeTargetProblem), then the write fence, then sends the method and the JSON body, with redirects refused;
 * POST and PATCH reach it; CORS allows PATCH; [C] the site relay still refuses every write but the Jama sign-in.
 * Each is proven by reverting the code it guards (MUTATE=<name>).
 * Run: node tests/regression_relay_write_20261028.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 400) + ')' : '')); } };
const REPO = path.join(__dirname, '..');
const MUT = process.env.MUTATE || '';
const MUTATIONS = {
  nodelete: ['  if (m !== "POST" && m !== "PATCH") return "Safety Lab only creates and changes items in Jama; it never deletes";', ''],
  paths:    ['  if (m === "POST" && !/\\/rest\\/(latest|v1)\\/(items|relationships|comments)$/.test(p)) return "only Jama items, relationships and comments are created";', ''],
  order:    ['    const wp = bridgeWriteProblem(method, chk.target, wbody);\n    if (wp) return', '    const wp = "";\n    if (wp) return'],
  route:    ['      if ((request.method === "POST" || request.method === "PATCH") && url.pathname === "/v1/ai/bridge") return handleBridge(request, env, caller, url);', '']
};
let proxy = fs.readFileSync(path.join(REPO, 'customer-install', 'selfhost', 'ai-proxy', 'worker.js'), 'utf8');
if (MUT) { const m = MUTATIONS[MUT]; if (!m) { console.error('unknown mutation'); process.exit(3); } if (proxy.indexOf(m[0]) < 0) { console.error('mutation anchor not found: ' + MUT); process.exit(4); } proxy = proxy.split(m[0]).join(m[1]); }
const site = fs.readFileSync(path.join(REPO, 'worker.js'), 'utf8');
console.log('\n[A] the write fence');
const fnSrc = (proxy.match(/const BRIDGE_WRITE_MAX = [\s\S]*?\nfunction bridgeWriteProblem[\s\S]*?\n}\n/) || [''])[0];
let wp = null; try { wp = new Function(fnSrc + '; return bridgeWriteProblem;')(); } catch (e) { check('the write fence loads', false, e.message); }
if (wp) {
  const T = u => new URL('https://example.jamacloud.com' + u);
  check('POST an item, a relationship, a comment; PATCH an item', ['', '', ''].every((_, i) => wp('POST', T(['/rest/latest/items', '/rest/latest/relationships', '/rest/v1/comments'][i]), '{}') === '') && wp('PATCH', T('/rest/latest/items/5000'), '[]') === '');
  const bad = [['DELETE', '/rest/latest/items/5', '{}'], ['PUT', '/rest/latest/items/5', '{}'], ['GET', '/rest/latest/items', ''], ['POST', '/rest/latest/users', '{}'], ['POST', '/rest/latest/items/5', '{}'],
               ['PATCH', '/rest/latest/items', '[]'], ['POST', '/rest/latest/items?project=46', '{}'], ['POST', '/rest/latest/items', 'x'.repeat(2 * 1024 * 1024 + 1)], ['POST', '/rest/latest/items', 'not json']];
  bad.forEach(([m, u, b]) => check('refused: ' + m + ' ' + u + (b.length > 100 ? ' (over 2 MB)' : (b === 'not json' ? ' (not JSON)' : '')), !!wp(m, T(u), b)));
}
console.log('\n[B] the relay');
const hb = (proxy.match(/async function handleBridge[\s\S]*?\n}\n/) || [''])[0];
const iHost = hb.indexOf('bridgeTargetProblem('), iFence = hb.indexOf('bridgeWriteProblem(method, chk.target, wbody)'), iCall = hb.indexOf('const call = (auth) =>');
check('the saved host is checked first, then the write fence, then the call', iHost > 0 && iFence > iHost && iCall > iFence);
check('a write sends its method and JSON body, redirects not followed', /method: method, redirect: "manual",\s*headers: \{ authorization: auth, accept: "application\/json", "content-type": "application\/json" \},\s*body: wbody,/.test(hb));
check('POST and PATCH reach the relay', /if \(\(request\.method === "POST" \|\| request\.method === "PATCH"\) && url\.pathname === "\/v1\/ai\/bridge"\) return handleBridge\(request, env, caller, url\);/.test(proxy));
check('CORS allows PATCH (and PUT, for Codebeamer, 28 Oct 2026)', /"access-control-allow-methods": "GET,POST,PATCH,PUT,OPTIONS"/.test(proxy));
console.log('\n[C] the public site relay still only reads');
check('the site relay refuses every write but the Jama sign-in', /read-only bridge: GET only, apart from the Jama sign-in/.test(site) && /else if \(request\.method !== 'GET'\)/.test(site) && site.indexOf('PATCH') < 0);
if (!MUT) {
  console.log('\n[mutation] each guard, reverted, turns the test red');
  for (const k of Object.keys(MUTATIONS)) {
    const x = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { MUTATE: k }), encoding: 'utf8', timeout: 60000 });
    const fails = (x.stdout.match(/^  FAIL  .*$/mg) || []);
    check('mutation "' + k + '" turns the test red (' + fails.length + ' failing)', x.status === 1 && fails.length > 0, x.status + ' ' + (x.stderr || '').slice(0, 200));
  }
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
