#!/usr/bin/env python3
"""IGES through the real import worker in a real browser (19 Oct 2026).

The node test (regression_cad_iges_20261019.test.js) drives the readers directly; this one sends the files
through cad_import_worker.js exactly as the CAD page does: fingerprint, IGES detection, our build read in a
worker, the exact session kept, and a STEP file through the same worker for comparison. A file that is
neither is refused with the plain message, and an IGES file is never handed to the STEP-only reader.

Run: python3 tests/browser_cad_iges_20261019.py
"""
import http.server, threading, functools, os, sys, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, 'site')
FIX = os.path.join(ROOT, 'tests', 'fixtures', 'cad')
HARNESS = b"""<!doctype html><meta charset=utf-8><title>iges</title>
<script src="cad_import.js"></script><script>
async function run(name, url, keep) {
  const buf = await (await fetch(url)).arrayBuffer();
  const phases = [];
  try {
    const r = await SLCadImport.runWorker(buf, { keepSession: keep, onProgress: p => phases.push(p) }).promise;
    const m = r.model, out = { ok: true, names: m.parts.map(p => p.name), format: m.format, schema: m.schema, unit: m.sourceUnit, reader: m.reader,
      fallback: m.fallbackReason || null, colors: m.meshes.map(x => x.color), phases, kept: !!r.worker, streaming: !!m.streaming };
    if (r.worker) {
      r.worker.onmessage = null;   // the handover, as cad_exact.js does: the import's handler would stop the worker at the first answer
      const ask = (op, args) => new Promise(res => { const id = Math.random(); const f = ev => { if (ev.data && ev.data.id === id) { r.worker.removeEventListener('message', f); res(ev.data); } }; r.worker.addEventListener('message', f); r.worker.postMessage({ type: 'query', id, op, args }); });
      const pids = m.parts.map(p => p.pid);
      out.dist = (await ask('distance', [pids[0], pids[1]])).result;
      out.props = (await ask('properties', [pids[0]])).result;
      r.worker.terminate();
    }
    return out;
  } catch (e) { return { ok: false, message: e.message, phases }; }
}
</script>"""

class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.startswith('/_iges_harness.html'):
            self.send_response(200); self.send_header('Content-Type', 'text/html'); self.end_headers(); self.wfile.write(HARNESS); return
        if self.path.startswith('/_fix/'):
            p = os.path.join(FIX, self.path[len('/_fix/'):].split('?')[0])
            data = open(p, 'rb').read(); self.send_response(200); self.send_header('Content-Type', 'application/octet-stream'); self.end_headers(); self.wfile.write(data); return
        return super().do_GET()
    def guess_type(self, path):
        return 'application/wasm' if path.endswith('.wasm') else super().guess_type(path)

passed = failed = 0
def check(name, cond, detail=''):
    global passed, failed
    if cond: passed += 1; print('  PASS  ' + name)
    else: failed += 1; print('  FAIL  ' + name + (': ' + str(detail) if detail else ''))

srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(H, directory=SITE))
threading.Thread(target=srv.serve_forever, daemon=True).start()
base = 'http://127.0.0.1:%d' % srv.server_address[1]
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('crash', lambda *_: errs.append('page crashed'))
    pg.goto(base + '/_iges_harness.html')
    def ev(expr):
        # run in the page, collect the answer when it is ready (a long await inside evaluate is not relied on)
        pg.evaluate("window.__out = undefined; Promise.resolve(" + expr + ").then(v => { window.__out = v; }, e => { window.__out = { ok: false, message: 'threw: ' + e.message }; }); 0")
        pg.wait_for_function('window.__out !== undefined', timeout=120000)
        return pg.evaluate('window.__out')
    a = ev("run('mm', '/_fix/iges/two_parts_mm.igs', true)")
    check('an IGES file imports through the worker', a.get('ok'), a)
    check('read whole by our build (no structure streaming, no fallback)', a.get('reader') == 'occt-fast' and not a.get('streaming') and a.get('fallback') is None and a.get('format') == 'iges', a)
    check('names and colors from the file', a.get('names') == ['PIPE-1', 'BRACKET-2'] and a['colors'][0] and a['colors'][0][0] > 0.5 and a['colors'][1][2] > 0.5, a)
    check('IGES 5.3 in mm', a.get('schema') == 'IGES 5.3' and a.get('unit') == 'mm')
    check('progress reported while reading (fingerprint, scan, parse)', all(p in a.get('phases', []) for p in ('hash', 'scan', 'parse')), a.get('phases'))
    d = a.get('dist') or {}
    check('exact distance in the kept worker session: 100 mm', d.get('exact') is True and abs(d.get('distance', 0) - 100) < 1e-6, d)
    check('exact area in the kept session', abs((a.get('props') or {}).get('area', 0) - 13194.689144) < 1e-3, a.get('props'))
    i = ev("run('inch', '/_fix/iges/two_parts_inch_brep.igs', true)")
    check('an inch IGES file: 100 mm apart, file unit inch', i.get('ok') and i.get('unit') == 'inch' and abs((i.get('dist') or {}).get('distance', 0) - 100) < 1e-6, i)
    s = ev("run('step', '/_fix/toy_aircraft.step', false)")
    check('a STEP file through the same worker is unchanged', s.get('ok') and s.get('format') == 'step' and s.get('schema') == 'AP214' and len(s.get('names', [])) == 6, s)
    n = ev("(async () => { const r = await SLCadImport.runWorker(new TextEncoder().encode('hello, not a model').buffer, {}).promise.then(() => ({ ok: true }), e => ({ ok: false, message: e.message })); return r; })()")
    check('a file that is neither is refused with the plain message', not n['ok'] and 'not a STEP or IGES file' in n['message'], n)
    o = ev("(async () => { const buf = await (await fetch('/_fix/iges/two_parts_mm.igs')).arrayBuffer(); return SLCadImport.runWorker(buf, { reader: 'occt' }).promise.then(() => ({ ok: true }), e => ({ ok: false, message: e.message })); })()")
    check('IGES is never handed to the STEP-only reader', not o['ok'] and 'IGES files are read only by the full reader' in o['message'], o)
    check('no page errors', not errs, errs)
    b.close()
srv.shutdown()
print('\n%d passed, %d failed' % (passed, failed))
sys.exit(1 if failed else 0)
