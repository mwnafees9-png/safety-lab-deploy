#!/usr/bin/env node
/*
 * Regression — customer-install/configure.js (self-hosted config generator, 10 Sep 2026).
 * The generator must WRITE the __SLAB_* globals AND refuse a config that would let a
 * customer install reach Safety Lab — above all the blank-AI-endpoint fallback leak.
 * Mutation at the end (drop the Safety-Lab guard) must go red by exit code.
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SRC = fs.readFileSync(path.join(__dirname, '..', 'customer-install', 'configure.js'), 'utf8');
function load(source) {
  source = String(source).replace(/^#![^\n]*\n/, '');
  const m = { exports: {} };
  new Function('module', 'exports', 'require', source)(m, m.exports, require);
  return m.exports;
}
const { buildConfig, parseEnv } = load(SRC);
const OUR = 'fhrqkhdrwbfnizkepkch.supabase.co';

console.log('[cfg] a valid self-hosted config writes the globals, points at nobody but the customer');
{
  const r = buildConfig({ mode: 'self-hosted', dbUrl: 'https://abc.supabase.co', dbKey: 'anon123', aiEndpoint: 'https://ai.acme.com/v1' });
  check('ok', r.ok, JSON.stringify(r.errors));
  check('file sets the DB url', r.file.includes('__SLAB_SUPABASE_URL__') && r.file.includes('abc.supabase.co'));
  check('file sets the DB key', r.file.includes('__SLAB_SUPABASE_KEY__') && r.file.includes('anon123'));
  check('file sets the AI endpoint', r.file.includes('__SLAB_AI_ENDPOINT__') && r.file.includes('ai.acme.com'));
  check('file names NOTHING at Safety Lab', !r.file.includes('safetylabaero') && !r.file.includes(OUR));
}

console.log('[cfg] self-hosted pointed at Safety Lab is refused (db, ai, web)');
{
  check('db at Safety Lab refused', !buildConfig({ mode: 'self-hosted', dbUrl: 'https://' + OUR, dbKey: 'k', aiEndpoint: 'https://ai.acme.com' }).ok);
  check('ai at safetylabaero refused', !buildConfig({ mode: 'self-hosted', dbUrl: 'https://abc.supabase.co', dbKey: 'k', aiEndpoint: 'https://api.safetylabaero.com/v1/ai' }).ok);
  check('web at safetylabaero refused', !buildConfig({ mode: 'self-hosted', dbUrl: 'https://abc.supabase.co', dbKey: 'k', aiEndpoint: 'https://ai.acme.com', webAppUrl: 'https://safetylabaero.com/app' }).ok);
}

console.log('[cfg] the sneaky one: blank AI in self-hosted is refused (it would fall back to Safety Lab)');
{
  const r = buildConfig({ mode: 'self-hosted', dbUrl: 'https://abc.supabase.co', dbKey: 'k' });
  check('blank AI refused', !r.ok);
  check('error explains the fallback leak', r.errors.join(' ').toLowerCase().includes('fall back'));
  const off = buildConfig({ mode: 'self-hosted', dbUrl: 'https://abc.supabase.co', dbKey: 'k', aiOff: true });
  check('AI off is allowed', off.ok);
  check('AI off writes __SLAB_AI_OFF__ and no endpoint', off.file.includes('__SLAB_AI_OFF__') && !off.file.includes('__SLAB_AI_ENDPOINT__'));
}

console.log('[cfg] missing DB key refused');
check('no key refused', !buildConfig({ mode: 'self-hosted', dbUrl: 'https://abc.supabase.co', aiEndpoint: 'https://ai.acme.com' }).ok);

console.log('[cfg] browser-only: clean ok, stray backend refused');
{
  const ok = buildConfig({ mode: 'browser-only', aiOff: true });
  check('clean browser-only ok', ok.ok);
  check('writes __SLAB_LOCAL_ONLY__ and no db', ok.file.includes('__SLAB_LOCAL_ONLY__') && !ok.file.includes('__SLAB_SUPABASE_URL__'));
  check('stray db in browser-only refused', !buildConfig({ mode: 'browser-only', dbUrl: 'https://abc.supabase.co', aiOff: true }).ok);
}

console.log('[cfg] parseEnv maps the answer keys');
{
  const a = parseEnv('MODE=self-hosted\nDB_URL=https://x.supabase.co\nDB_KEY=k\nAI_OFF=true\n# comment\n');
  check('parses MODE/DB_URL/DB_KEY/AI_OFF', a.mode === 'self-hosted' && a.dbUrl === 'https://x.supabase.co' && a.dbKey === 'k' && a.aiOff === 'true');
}

console.log('[cfg] mutation guard (drop the Safety-Lab guard -> a leak would pass)');
{
  const needle = 'return h === OUR_DB_HOST || /(^|\\.)safetylabaero\\.com$/.test(h);';
  const mutatedSrc = SRC.replace(needle, 'return false;');
  check('mutation actually changed the source', mutatedSrc !== SRC);
  const m = load(mutatedSrc);
  const leak = m.buildConfig({ mode: 'self-hosted', dbUrl: 'https://' + OUR, dbKey: 'k', aiEndpoint: 'https://ai.acme.com' });
  check('MUTATION (no guard) would let a Safety-Lab db through -> guarded here', leak.ok === true);
}

console.log('\n[cfg] ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
