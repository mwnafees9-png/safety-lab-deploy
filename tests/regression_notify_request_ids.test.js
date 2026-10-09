#!/usr/bin/env node
/*
 * Regression: notification emails dead from 6 to 9 Oct 2026 (migration 20261009a).
 *
 * pg_net numbers its requests from 1 again after a database restart. The outbox declared
 * request_id UNIQUE, so every note after the restart collided with an old row, and because the
 * note sat in the same block as net.http_post, the failed note rolled the send back with it.
 * Proven on a local Postgres 16 with pg_net stubbed: the old function queued 0 requests after a
 * simulated restart, the fixed one queues every request, a refused note no longer cancels a
 * send, and the sweep ignores a reply recorded before the request it is matched to.
 *
 * These checks read the migrations as they will be applied (the last definition wins).
 * Run: node tests/regression_notify_request_ids.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n); } };
const DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();
const all = files.map(f => fs.readFileSync(path.join(DIR, f), 'utf8'));
const lastDef = name => { let d = ''; for (const s of all) { const re = new RegExp('create or replace function private\\.' + name + '\\s*\\([\\s\\S]*?\\$fn\\$;', 'gi'); let m; while ((m = re.exec(s))) d = m[0]; } return d; };
const strip = s => s.replace(/--[^\n]*/g, '');

console.log('\n[outbox] a request number may repeat');
const iDrop = all.findIndex(s => /drop constraint if exists notify_outbox_request_id_key/i.test(s));
check('the unique constraint on request_id is dropped', iDrop >= 0);
check('no later migration puts it back', iDrop >= 0 && !all.slice(iDrop + 1).some(s => /notify_outbox[\s\S]{0,200}unique\s*\(\s*request_id|request_id\s+bigint\s+unique/i.test(strip(s))));

console.log('\n[notify_post] the note can never cancel the send');
const post = strip(lastDef('notify_post'));
check('notify_post is defined', !!post);
const iSend = post.indexOf('net.http_post'), iNote = post.search(/insert into private\.notify_outbox \(fn, request_id\)/i);
check('the send comes before the note', iSend > 0 && iNote > iSend);
const between = post.slice(iSend, iNote);
check('the send has its own block, closed before the note', /exception when others then[\s\S]*?return;\s*end;/i.test(between));
const afterNote = post.slice(iNote);
check('the note has its own exception handler', /^[^;]*;\s*exception when others then null;\s*end;/i.test(afterNote));
check('the note sits in a block of its own (a begin right before it)', /begin\s*$/i.test(post.slice(0, iNote).trimEnd()));

console.log('\n[sweep] a reused number cannot match an old reply');
const sweep = strip(lastDef('sweep_notify_health'));
check('sweep_notify_health is defined', !!sweep);
check('a reply counts only if recorded after the request was queued', /r\.created\s*>=\s*o\.queued_at/i.test(sweep));
check('the match is still by request number', /o\.request_id\s*=\s*r\.id/i.test(sweep));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
