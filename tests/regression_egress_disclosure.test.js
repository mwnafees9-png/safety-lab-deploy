#!/usr/bin/env node
/*
 * Regression — SLConfigEgress() discloses EVERY address the install contacts. (1 Oct 2026)
 *
 * SL-DG-0001 section 7.2 tells a customer that SLConfigEgress() "lists every address the
 * application will contact". Until config 1.4 that was not true on the desktop: the update
 * feed (updates.safetylabaero.com) is contacted on every desktop install and appeared in no
 * listing. SL-SUB-0001 now names it to customers in writing, so the code has to agree.
 *
 * The second half of this suite is the trap that made the fix non-obvious: the update feed is
 * a Safety Lab host on a SELF-HOSTED desktop too. Putting it in `egress` would make the
 * leak check fire and hard-stop every self-hosted desktop at boot. It therefore lives in
 * `otherContacts`, and this suite asserts BOTH: that it is disclosed, and that it is not
 * treated as a leak.
 *
 * Run: node tests/regression_egress_disclosure.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const cfgSrc = fs.readFileSync(path.join(SITE, 'slab_config.js'), 'utf8');

function runConfig(win, src) {
  const W = Object.assign({}, win);
  const printed = [];
  const doc = { readyState: 'complete', addEventListener() {}, body: { appendChild() {} },
                createElement() { return { setAttribute() {}, style: {}, set innerHTML(v) {} }; },
                documentElement: { appendChild() {} } };
  const ctx = { window: W, document: doc, URL,
                console: { info() {}, error() {}, log() {}, warn() {}, table(rows) { printed.push(rows); } } };
  ctx.window.document = doc;
  vm.createContext(ctx);
  vm.runInContext(src || cfgSrc, ctx);
  return { cfg: ctx.window.SLConfig, fatal: ctx.window.__SLAB_CONFIG_FATAL__ || null,
           egressFn: ctx.window.SLConfigEgress, printed };
}

const UPDATES = 'updates.safetylabaero.com';
const OWN = { __SLAB_SUPABASE_URL__: 'https://acme.supabase.co', __SLAB_SUPABASE_KEY__: 'anon',
              __SLAB_AI_ENDPOINT__: 'https://ai.acme.com/v1' };

console.log('\n[egress] the desktop update feed is disclosed');
{
  const r = runConfig(Object.assign({ __SLAB_DESKTOP__: true }, OWN));
  check('config version is at least 1.4', parseFloat(r.cfg.version) >= 1.4, 'got ' + r.cfg.version);
  check('otherContacts exists', Array.isArray(r.cfg.otherContacts));
  const upd = (r.cfg.otherContacts || []).filter(e => e.host === UPDATES);
  check('the update feed is listed', upd.length === 1);
  check('it is marked as carrying no project data', upd.length === 1 && upd[0].carriesProjectData === false);
  check('it carries a plain-language note', upd.length === 1 && /no project data/i.test(upd[0].note || ''));
  const rows = r.egressFn();
  check('SLConfigEgress() returns it too', rows.some(x => x.host === UPDATES));
  check('every returned row says whether it carries project data',
        rows.every(x => typeof x['carries project data'] === 'boolean'));
  check('the data paths are still there', rows.some(x => x.host === 'acme.supabase.co') && rows.some(x => x.host === 'ai.acme.com'));
}

console.log('\n[egress] THE TRAP: disclosing it must not trip the self-hosted leak check');
{
  const r = runConfig(Object.assign({ __SLAB_DESKTOP__: true }, OWN));
  check('self-hosted desktop still boots', !r.fatal, String(r.fatal));
  check('the update feed is NOT in the leak-checked egress array',
        !(r.cfg.egress || []).some(e => e.host === UPDATES));
  const web = runConfig(OWN);
  check('a self-hosted WEB install lists no other contacts', (web.cfg.otherContacts || []).length === 0);
  check('self-hosted web still boots', !web.fatal, String(web.fatal));
}

console.log('\n[egress] a real leak still hard-stops');
{
  const leak = runConfig({ __SLAB_DESKTOP__: true, __SLAB_SUPABASE_URL__: 'https://acme.supabase.co',
                           __SLAB_SUPABASE_KEY__: 'anon',
                           __SLAB_AI_ENDPOINT__: 'https://api.safetylabaero.com/v1/ai' });
  check('AI pointed at Safety Lab is still fatal', !!leak.fatal);
}

console.log('\n[egress] browser-only contacts nothing at all');
{
  const r = runConfig({ __SLAB_LOCAL_ONLY__: true, __SLAB_AI_OFF__: true });
  check('no data egress', (r.cfg.egress || []).length === 0);
  check('no other contacts', (r.cfg.otherContacts || []).length === 0);
}

console.log('\n[egress] MUTATION — removing the disclosure must go red');
{
  const mutated = cfgSrc.replace(/if \(isDesktop\) \{[\s\S]*?\n  \}\n/, 'if (false) { }\n');
  const r = runConfig(Object.assign({ __SLAB_DESKTOP__: true }, OWN), mutated);
  const gone = !(r.cfg.otherContacts || []).some(e => e.host === UPDATES);
  check('mutation proven: without the block the update feed disappears', gone);
}

console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
