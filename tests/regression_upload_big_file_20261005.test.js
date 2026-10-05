#!/usr/bin/env node
/*
 * Regression: big-file uploads into the downloads bucket (5 Oct 2026).
 *
 * The VMware appliance is 1.7 GB, past the 300 MB a single `wrangler r2 object put` takes,
 * so it goes up through the Worker's /api/upload route with upload-doc.sh, in ~107 pieces.
 * This suite runs the REAL worker.js route and the REAL upload-doc.sh against a stand-in R2
 * bucket on localhost, and breaks pieces on purpose:
 *   A. a piece answered with a 500 and a piece whose connection drops are both sent again,
 *      and the stored file is byte-identical to the local one
 *   B. a piece that keeps failing ends the upload: it is aborted and nothing is published
 *   C. a served copy with the right size but different bytes is caught by the fingerprint
 *   D. the route and the script refuse folders outside desktop/, docs/, customer-install/
 *   E. a wrong token is refused
 * Run: node tests/regression_upload_big_file_20261005.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), crypto = require('crypto'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ROOT = path.join(__dirname, '..');
const TOKEN = crypto.randomBytes(32).toString('hex');   // random, like the real one (a word like 'token' reads as a placeholder)
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

// ---- a stand-in for the R2 bucket, with the multipart calls the route uses ----
function fakeBucket() {
  const objects = new Map(), uploads = new Map(); let n = 0; const log = [];
  return {
    objects, uploads, log,
    async createMultipartUpload(key, opts) { const id = 'up' + (++n); uploads.set(id, { key, parts: new Map(), ct: opts && opts.httpMetadata && opts.httpMetadata.contentType }); log.push('create'); return { uploadId: id, key }; },
    resumeMultipartUpload(key, id) {
      return {
        async uploadPart(num, body) {
          const u = uploads.get(id); if (!u || u.key !== key) throw new Error('no such upload');
          const buf = Buffer.from(await new Response(body).arrayBuffer());
          const etag = sha(buf).slice(0, 16); u.parts.set(num, { buf, etag }); log.push('part' + num);
          return { partNumber: num, etag };
        },
        async complete(parts) {
          const u = uploads.get(id); if (!u) throw new Error('no such upload');
          const bufs = parts.slice().sort((a, b) => a.partNumber - b.partNumber).map(p => {
            const s = u.parts.get(p.partNumber); if (!s || s.etag !== p.etag) throw new Error('bad part ' + p.partNumber); return s.buf; });
          const all = Buffer.concat(bufs); objects.set(key, all); uploads.delete(id); log.push('complete');
          return { httpEtag: '"x"', size: all.length };
        },
        async abort() { uploads.delete(id); log.push('abort'); },
      };
    },
  };
}

// ---- serve the real Worker plus a public view of the bucket on localhost ----
async function serve(bucket, faults) {
  const worker = (await import(path.join(ROOT, 'worker.js'))).default;
  const env = { DOWNLOADS: bucket, UPLOAD_TOKEN: TOKEN, ASSETS: { fetch: () => new Response('asset', { status: 200 }) } };
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/pub/')) {                       // updates.safetylabaero.com
      const o = bucket.objects.get(decodeURIComponent(u.pathname.slice(5)));
      if (!o) { res.writeHead(404); return res.end(); }
      let body = o; if (faults.tamper) { body = Buffer.from(o); body[body.length >> 1] ^= 0xff; }
      res.writeHead(200, { 'content-length': body.length }); return res.end(body);
    }
    const part = u.searchParams.get('action') === 'part' ? +u.searchParams.get('part') : 0;
    if (part && faults.parts[part] && faults.parts[part].left > 0) {   // break this piece
      faults.parts[part].left--; faults.hits.push(faults.parts[part].how + part);
      req.resume();
      if (faults.parts[part].how === 'drop') return req.socket.destroy();
      res.writeHead(500, { 'content-type': 'application/json' }); return res.end('{"error":"injected"}');
    }
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const r = await worker.fetch(new Request('https://safetylabaero.com' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env, {});
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  return srv;
}
function run(srv, file, key, extra) {
  const port = srv.address().port;
  return new Promise(ok => {
    const p = cp.spawn('bash', [path.join(ROOT, 'upload-doc.sh'), file, key], {
      env: Object.assign({}, process.env, { UPLOAD_TOKEN: TOKEN, ORIGIN: 'http://127.0.0.1:' + port, PUBLIC: 'http://127.0.0.1:' + port + '/pub', PART_MB: '1' }, extra || {}) });
    let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
    p.on('close', code => ok({ code, out }));
  });
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slup-'));
  const file = path.join(dir, 'SafetyLabAero-server-test.ova');
  const data = crypto.randomBytes(3 * 1048576 + 12345);         // 4 pieces of 1 MB, the last one short
  fs.writeFileSync(file, data);
  const KEY = 'customer-install/SafetyLabAero-server-test.ova';

  console.log('[A] broken pieces are sent again and the file arrives intact');
  { const b = fakeBucket(); const f = { parts: { 2: { how: 'http500-', left: 1 }, 3: { how: 'drop', left: 1 } }, hits: [] };
    const s = await serve(b, f); const r = await run(s, file, KEY); s.close();
    check('upload-doc.sh finishes successfully', r.code === 0, r.out.slice(-600));
    check('both injected failures really happened', f.hits.length === 2, f.hits.join(','));
    check('...and each was retried, not fatal', /part   : 2\/4 failed \(try 1 of 5\)/.test(r.out) && /part   : 3\/4 failed \(try 1 of 5\)/.test(r.out), r.out.slice(-600));
    const o = b.objects.get(KEY);
    check('the stored file is byte-identical to the local one', !!o && o.equals(data));
    check('the script compared SHA-256 fingerprints and printed the one to send', /MATCH: the published file is byte-identical/.test(r.out) && r.out.includes('Fingerprint to give the recipient (SHA-256): ' + sha(data)));
    check('no temporary copy of the file was made (pieces are cut with dd)', !/split -b/.test(fs.readFileSync(path.join(ROOT, 'upload-doc.sh'), 'utf8'))); }

  console.log('[B] a piece that keeps failing ends the upload cleanly');
  { const b = fakeBucket(); const f = { parts: { 2: { how: 'http500-', left: 99 } }, hits: [] };
    const s = await serve(b, f); const r = await run(s, file, KEY, { TRIES: '2' }); s.close();
    check('the script stops with an error', r.code !== 0);
    check('it says the piece failed and it gave up', /part 2 failed 2 times, giving up/.test(r.out), r.out.slice(-400));
    check('the half-done upload was aborted', b.log.includes('abort') && b.uploads.size === 0, b.log.join(','));
    check('nothing was published', !b.objects.has(KEY)); }

  console.log('[C] same size, different bytes: the fingerprint catches it');
  { const b = fakeBucket(); const f = { parts: {}, hits: [], tamper: true };
    const s = await serve(b, f); const r = await run(s, file, KEY); s.close();
    check('the script refuses to call it a match', r.code !== 0 && /MISMATCH/.test(r.out) && !/MATCH: the published/.test(r.out), r.out.slice(-400)); }

  console.log('[D] only the three folders');
  { const b = fakeBucket(); const s = await serve(b, { parts: {}, hits: [] }); const port = s.address().port;
    const r = await run(s, file, 'assets/evil.ova');
    check('the script refuses another folder before sending anything', r.code === 2 && b.log.length === 0);
    const w = await fetch('http://127.0.0.1:' + port + '/api/upload?action=create&key=assets/evil.ova', { method: 'POST', headers: { 'x-upload-token': TOKEN } });
    check('the website route refuses it too (400)', w.status === 400);
    console.log('[E] the token');
    const t = await fetch('http://127.0.0.1:' + port + '/api/upload?action=create&key=' + KEY, { method: 'POST', headers: { 'x-upload-token': 'wrong-token-wrong-token' } });
    check('a wrong token is refused (401)', t.status === 401 && b.log.length === 0);
    s.close(); }

  console.log('[F] a placeholder token is refused before anything is sent');
  { const b = fakeBucket(); const s = await serve(b, { parts: {}, hits: [] });
    for (const t of ['paste-the-real-token', 'YOUR-REAL-TOKEN', 'paste-it-here', '<token>', 'your token here please']) {
      const r = await run(s, file, KEY, { UPLOAD_TOKEN: t });
      check('refused: ' + t, r.code === 2 && /looks like a placeholder/.test(r.out) && b.log.length === 0, r.out.slice(-200));
    }
    s.close(); }

  console.log('[G] the script runs as ./upload-doc.sh');
  { const mode = cp.spawnSync('git', ['ls-files', '-s', 'upload-doc.sh'], { cwd: ROOT, encoding: 'utf8' }).stdout;
    check('git records it as executable (100755)', /^100755 /.test(mode), mode);
    check('...and it is executable on disk', (fs.statSync(path.join(ROOT, 'upload-doc.sh')).mode & 0o111) !== 0); }

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('  FAIL  suite crashed — ' + (e && e.stack || e)); process.exitCode = 1; });
