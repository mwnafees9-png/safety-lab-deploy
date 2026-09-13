#!/usr/bin/env node
/*
 * Regression — IndexNow (12 Sep 2026).
 *
 * WHY: Bing scored 18/100 in the 8 Sep SEO report because the site had never told Bing it
 * existed. IndexNow is the push channel: a key file on the site proves ownership, and after
 * every successful deploy ship.sh posts the sitemap's page list to api.indexnow.org.
 *
 *   K1  exactly one key file site/<32 hex>.txt exists and its body is its own name
 *       (the key IS the file name; the *.txt allowlist in build.sh ships it)
 *   K2  ping.mjs finds that key and builds the payload from site/sitemap.xml: host,
 *       key, keyLocation on our host, and every sitemap URL (and only our host's)
 *   K3  the POST goes to api.indexnow.org with that JSON body (executed with a fake fetch)
 *   K4  a rejected ping reports ok:false but the script's main path exits 0 — a courtesy
 *       notification never fails a deploy
 *   K5  ship.sh calls the ping AFTER the deploy and ONLY inside the success branch
 *
 * Run: node tests/regression_indexnow.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'site');

(async function () {
    console.log('\n[K1] the key file');
    const keys = fs.readdirSync(SITE).filter(f => /^[0-9a-f]{32}\.txt$/.test(f));
    check('exactly one 32-hex key file in site/', keys.length === 1, keys.join(', ') || 'none');
    const key = keys[0] ? keys[0].slice(0, -4) : '';
    check('its body is the key (trimmed), nothing else', !!key && fs.readFileSync(path.join(SITE, keys[0]), 'utf8').trim() === key);
    const build = fs.readFileSync(path.join(ROOT, 'build.sh'), 'utf8');
    check('build.sh allowlist ships *.txt', /-name '\*\.txt'/.test(build));

    console.log('\n[K2] payload from the sitemap');
    const mod = await import(path.join(ROOT, 'tools', 'indexnow', 'ping.mjs'));
    const p = mod.payload();
    const sm = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
    const locs = [...sm.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]);
    check('host is safetylabaero.com', p.host === 'safetylabaero.com');
    check('key matches the key file', p.key === key);
    check('keyLocation is the key file on our host', p.keyLocation === 'https://safetylabaero.com/' + key + '.txt');
    check('urlList is every sitemap URL', JSON.stringify(p.urlList) === JSON.stringify(locs) && locs.length >= 10, locs.length + ' urls');
    check('every URL is on our host', p.urlList.every(u => new URL(u).host === 'safetylabaero.com'));

    // a sitemap with a foreign URL is filtered, an empty one throws
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'inx-'));
    fs.writeFileSync(path.join(tmp, key + '.txt'), key);
    fs.writeFileSync(path.join(tmp, 'sitemap.xml'), '<urlset><url><loc>https://safetylabaero.com/a</loc></url><url><loc>https://evil.example/x</loc></url></urlset>');
    check('a foreign-host URL in the sitemap is dropped from the payload', JSON.stringify(mod.payload(tmp).urlList) === JSON.stringify(['https://safetylabaero.com/a']));
    fs.writeFileSync(path.join(tmp, 'sitemap.xml'), '<urlset></urlset>');
    let threw = false; try { mod.payload(tmp); } catch (_) { threw = true; }
    check('an empty sitemap refuses (nothing to submit)', threw);
    fs.writeFileSync(path.join(tmp, 'deadbeefdeadbeefdeadbeefdeadbeef.txt'), 'deadbeefdeadbeefdeadbeefdeadbeef');
    threw = false; try { mod.findKey(tmp); } catch (_) { threw = true; }
    check('two key files refuse (one key, one owner)', threw);

    console.log('\n[K3] the POST');
    const seen = [];
    const fake = async (url, init) => { seen.push({ url, init }); return { status: 202 }; };
    const r = await mod.ping({ fetch: fake });
    check('posts to api.indexnow.org', seen.length === 1 && seen[0].url === 'https://api.indexnow.org/indexnow' && seen[0].init.method === 'POST');
    check('JSON body carries host/key/keyLocation/urlList', seen.length === 1 && (function () { const b = JSON.parse(seen[0].init.body); return b.host === 'safetylabaero.com' && b.key === key && b.keyLocation.endsWith(key + '.txt') && Array.isArray(b.urlList) && b.urlList.length === locs.length; })());
    check('202 counts as accepted', r.ok === true && r.status === 202 && r.count === locs.length);
    const r2 = await mod.ping({ fetch: async () => ({ status: 422 }) });
    check('a 422 is reported as not accepted', r2.ok === false && r2.status === 422);

    console.log('\n[K4] never fails a deploy');
    const dry = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'indexnow', 'ping.mjs'), '--dry'], { encoding: 'utf8' });
    check('--dry prints the payload and exits 0', dry.status === 0 && dry.stdout.indexOf('"keyLocation"') > 0);
    // Break the network on purpose: point fetch at nothing by running with an unreachable proxy env.
    const broken = cp.spawnSync(process.execPath, ['--input-type=module', '-e',
        'globalThis.fetch = async () => { throw new Error("network down"); }; const m = await import(process.env.PING_MOD); await m.ping().catch(e => { console.log("caught " + e.message); });'],
        { encoding: 'utf8', env: Object.assign({}, process.env, { PING_MOD: path.join(ROOT, 'tools', 'indexnow', 'ping.mjs') }) });
    check('the module surfaces a network error to its caller (main path prints it and exits 0)', /caught network down/.test(broken.stdout));
    const src = fs.readFileSync(path.join(ROOT, 'tools', 'indexnow', 'ping.mjs'), 'utf8');
    check('the main path always exits 0 (finally → process.exit(0))', /\.finally\(\(\) => process\.exit\(0\)\)/.test(src));

    console.log('\n[K5] ship.sh wiring');
    const ship = fs.readFileSync(path.join(ROOT, 'ship.sh'), 'utf8');
    const deployAt = ship.indexOf('npx wrangler deploy -c wrangler.dist.jsonc');
    const pingAt = ship.indexOf('node tools/indexnow/ping.mjs');
    const okBranch = ship.indexOf('if [ "$RC" = "0" ]; then');
    const fiAfter = ship.indexOf('\nfi', okBranch);
    check('ship.sh runs the ping', pingAt > 0);
    check('…after the deploy', deployAt > 0 && pingAt > deployAt);
    check('…inside the RC=0 success branch only', okBranch > 0 && pingAt > okBranch && pingAt < fiAfter);
    check('…exactly once', (ship.match(/^\s*node tools\/indexnow\/ping\.mjs/mg) || []).length === 1);

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  suite threw — ' + (e && e.stack || e)); process.exit(1); });
