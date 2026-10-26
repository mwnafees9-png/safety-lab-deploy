#!/usr/bin/env python3
# 26 Oct 2026: the fc auto-trees browser test now serves the app with the SAME Content-Security-Policy the server
# (worker.js) and the desktop send, so a module that reads the project through eval fails here, as it did at Radia.
# Mutation SL_FC_MUTATE=eval puts the v1.2 eval read back and must turn the test red.
import os, sys
root = sys.argv[1] if len(sys.argv) > 1 else '.'
def sub(f, a, b, n=1):
    P = os.path.join(root, f); s = open(P, encoding='utf-8').read()
    if s.count(a) != n: raise SystemExit(f'{f}: expected {n} of {a[:80]!r}, found {s.count(a)}')
    open(P, 'w', encoding='utf-8').write(s.replace(a, b))
T = 'tests/regression_fc_auto_trees_20261024.test.js'
sub(T, """    if (MUT === 'worstonly') return body.replace('return !!g && g.gov === row;', 'return !!g;');
    return body;""", """    if (MUT === 'worstonly') return body.replace('return !!g && g.gov === row;', 'return !!g;');
    // the v1.2 read: eval, which the app's CSP blocks (Radia, 26 Oct 2026: no trees made at all)
    if (MUT === 'eval') return body.replace("function _g(n) {", "function _g(n) { try { return (0, eval)('typeof ' + n + ' !== \\"undefined\\" ? ' + n + ' : null'); } catch (_) { return root[n]; }");
    return body;""")
sub(T, """    const TYPES = { '.html': 'text/html',""", """    // the policy the server sends (worker.js CSP_POLICY), so the app runs here as it runs at a customer: no eval
    const CSP = (() => { const w = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8'); const m = /const CSP_POLICY = \\[([\\s\\S]*?)\\]\\.join\\('; '\\)/.exec(w); if (!m) throw new Error('worker.js CSP_POLICY not found'); return eval('[' + m[1] + ']').join('; '); })();
    check('the test serves the server\\'s CSP, and it forbids eval', /script-src [^;]*'self'/.test(CSP) && !/unsafe-eval/.test(CSP), CSP);
    const TYPES = { '.html': 'text/html',""")
sub(T, """r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });""",
       """r.writeHead(200, Object.assign({ 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }, f.endsWith('.html') ? { 'Content-Security-Policy': CSP } : {}));""")
print('fc trees CSP test applied')
