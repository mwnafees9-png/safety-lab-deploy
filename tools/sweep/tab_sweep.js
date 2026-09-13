#!/usr/bin/env node
/* ============================================================================
 * tools/sweep/tab_sweep.js — R19 runtime sweep (13 Sep 2026).
 * ----------------------------------------------------------------------------
 * Drives the app in a real browser (same harness and replayed CSP as the smoke
 * gate), loads the sample project, then visits EVERY tab the code knows about
 * and, on each, presses every non-destructive button it can find. It records:
 *   - uncaught exceptions and error-level console entries, per tab and per click
 *   - view STACKING: more than one view-* panel visible after a switch (the
 *     20 Jul 'interdep' defect class — a view switchTab cannot hide)
 *   - tabs whose panel is missing, hidden, or renders empty
 *   - native dialogs (alert/confirm/prompt) that a click would have opened —
 *     they are stubbed so the run cannot block, and counted
 * Nothing here is a gate; it is a finding generator. Output: a summary on stdout
 * and tools/sweep/last_sweep.json.
 *
 * Usage:  node tools/sweep/tab_sweep.js [--src] [--tabs a,b,c] [--no-clicks]
 * ==========================================================================*/
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { launch, Cdp, evaluate, freePort, sleep } = require('../smoke/cdp.js');
const ROOT = path.join(__dirname, '..', '..');
const USE_SRC = process.argv.includes('--src');
const NO_CLICKS = process.argv.includes('--no-clicks');
const ONLY = (process.argv.find(a => a.startsWith('--tabs=')) || '').slice(7).split(',').filter(Boolean);
const SERVE_DIR = path.join(ROOT, USE_SRC ? 'site' : 'dist');

function productionCsp() {
    const src = fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8');
    const m = src.match(/const CSP_POLICY = (\[[\s\S]*?\]\.join\('; '\))\s*;/);
    if (!m) throw new Error('Could not extract CSP_POLICY from worker.js');
    const full = new Function('return ' + m[1])();
    return full.split('; ').filter(d => d.trim() !== 'upgrade-insecure-requests').join('; ');
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };
function serve(dir, csp) {
    return http.createServer((req, res) => {
        const url = decodeURIComponent(req.url.split('?')[0]); const rel = url === '/' ? '/index.html' : url;
        const file = path.join(dir, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
        fs.readFile(file, (err, buf) => {
            if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
            res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Security-Policy': csp }); res.end(buf);
        });
    });
}

// every tab id the code base can navigate to (switchTab('…') literals in index.html and site/*.js)
function allTabIds() {
    const ids = new Set();
    const files = [path.join(ROOT, 'site', 'index.html'), ...fs.readdirSync(path.join(ROOT, 'site')).filter(f => f.endsWith('.js')).map(f => path.join(ROOT, 'site', f))];
    for (const f of files) { const s = fs.readFileSync(f, 'utf8'); let m; const re = /switchTab\('([a-z0-9-]+)'\)/g; while ((m = re.exec(s))) ids.add(m[1]); }
    return [...ids].sort();
}

// Buttons we never press: anything that destroys, signs out, leaves the page, or talks to the network on the user's behalf.
const DENY = /delete|remove|clear|reset|wipe|purge|sign ?out|log ?out|new project|open project|export|download|import|upload|print|save|publish|deploy|send|email|share|invite|pay|checkout|buy|subscribe|license|eula|accept|revoke|baseline|lock|takeover|reload|refresh page|restore|recover|undo|redo|discard|close project|ship|commit|push|sync now|generate|run ai|draft|ask|analy[sz]e/i;

async function run() {
    const csp = productionCsp(); const port = await freePort();
    const server = serve(SERVE_DIR, csp); await new Promise(r => server.listen(port, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + port + '/';
    const tabs = ONLY.length ? ONLY : allTabIds();
    console.log('── R19 runtime tab sweep ─────────────────────────────');
    console.log('serving : ' + path.relative(ROOT, SERVE_DIR) + '/   tabs: ' + tabs.length + (NO_CLICKS ? '   (no clicks)' : ''));
    let browser = null, cdp = null; const report = { startedAt: new Date().toISOString(), tabs: {}, boot: {} };
    try {
        browser = await launch(); cdp = await Cdp.connect(browser.wsUrl);
        const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
        let errors = [], consoleErrors = [];
        cdp.on(m => {
            if (m.sessionId !== sessionId) return;
            if (m.method === 'Runtime.exceptionThrown') { const e = m.params.exceptionDetails; errors.push(((e.exception && (e.exception.description || e.exception.value)) || e.text || 'unknown').split('\n').slice(0, 2).join(' | ')); }
            if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/https?:\/\/(?!127\.0\.0\.1)/.test(m.params.entry.url || '')) consoleErrors.push(m.params.entry.text.slice(0, 200));
            if (m.method === 'Page.javascriptDialogOpening') cdp.send('Page.handleJavaScriptDialog', { accept: false }, sessionId).catch(() => {});
        });
        await cdp.send('Runtime.enable', {}, sessionId); await cdp.send('Log.enable', {}, sessionId); await cdp.send('Page.enable', {}, sessionId);
        const loaded = new Promise(res => cdp.on(m => { if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') res(); }));
        await cdp.send('Page.navigate', { url: base }, sessionId); await Promise.race([loaded, sleep(20000)]); await sleep(2500);
        report.boot = { exceptions: errors.slice(), consoleErrors: consoleErrors.slice() }; errors = []; consoleErrors = [];
        // stub the native dialogs (counted), block navigation and new windows
        await evaluate(cdp, sessionId, `(function(){ window.__sweepDialogs = []; ['alert','confirm','prompt'].forEach(function(k){ var orig = window[k]; window[k] = function(msg){ window.__sweepDialogs.push(k + ': ' + String(msg).slice(0,80)); return k === 'confirm' ? false : (k === 'prompt' ? null : undefined); }; }); window.open = function(){ window.__sweepDialogs.push('window.open'); return null; }; window.onbeforeunload = null; return true; })()`);
        const sample = await evaluate(cdp, sessionId, `(async () => { try { await loadSampleProject(); } catch(e) { return 'ERR ' + String(e).slice(0,120); } return 'ok'; })()`);
        report.sample = sample; console.log('sample  : ' + sample + '   boot exceptions: ' + report.boot.exceptions.length + '   boot console errors: ' + report.boot.consoleErrors.length);
        errors = []; consoleErrors = [];
        if (process.env.PROBE) { console.log('probe   : ' + await evaluate(cdp, sessionId, process.env.PROBE)); return; }
        for (const tab of tabs) {
            const rec = { switchErrors: [], stacked: [], panel: null, clicks: [], dialogs: [] };
            try {
                const info = await evaluate(cdp, sessionId, `(function(){ try { switchTab('${tab}'); } catch (e) { return JSON.stringify({ threw: String(e).slice(0,160) }); }
                    var panel = document.getElementById('view-${tab}');
                    var vis = Array.prototype.filter.call(document.querySelectorAll('[id^="view-"]'), function(el){ if (el.offsetParent === null || el.getBoundingClientRect().height <= 40) return false; if (panel && (panel.contains(el) || el.contains(panel))) return false; return true; }).map(function(el){ return el.id; });
                    return JSON.stringify({ visible: vis, panel: panel ? { visible: panel.offsetParent !== null, text: (panel.innerText || '').trim().length, buttons: panel.querySelectorAll('button, [onclick], a[href="#"]').length } : null }); })()`);
                const p = JSON.parse(info);
                if (p.threw) rec.switchErrors.push(p.threw);
                rec.panel = p.panel; rec.stacked = (p.visible || []).filter(v => v !== 'view-' + tab);
            } catch (e) { rec.switchErrors.push(String(e.message || e).slice(0, 160)); }
            await sleep(600);
            try { const again = JSON.parse(await evaluate(cdp, sessionId, `(function(){ var panel = document.getElementById('view-${tab}'); return JSON.stringify(panel ? { visible: panel.offsetParent !== null, text: (panel.innerText || '').trim().length, buttons: panel.querySelectorAll('button, [onclick], a[href="#"]').length } : null); })()`)); if (again) rec.panel = again; } catch (_) {}
            rec.switchErrors.push(...errors.splice(0)); rec.switchConsole = consoleErrors.splice(0);
            if (!NO_CLICKS && rec.panel && rec.panel.visible) {
                // enumerate clickable things inside the panel, press each one that is not on the deny list
                const list = JSON.parse(await evaluate(cdp, sessionId, `(function(){ var panel = document.getElementById('view-${tab}'); var out = []; var els = panel.querySelectorAll('button, [onclick]');
                    for (var i = 0; i < els.length && out.length < 80; i++) { var el = els[i]; if (el.offsetParent === null) continue; if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') continue;
                      var label = ((el.innerText || el.value || el.title || el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('onclick') || '')).replace(/\\s+/g,' ').trim().slice(0, 90); el.setAttribute('data-sweep-idx', String(i)); out.push({ idx: i, label: label }); }
                    return JSON.stringify(out); })()`));
                for (const b of list) {
                    if (DENY.test(b.label)) continue;
                    const before = await evaluate(cdp, sessionId, `window.__sweepDialogs.length`);
                    try {
                        await evaluate(cdp, sessionId, `(function(){ var el = document.querySelector('#view-${tab} [data-sweep-idx="${b.idx}"]'); if (!el) return 'gone'; el.click(); return 'clicked'; })()`);
                    } catch (e) { errors.push('click threw: ' + String(e.message || e).slice(0, 160)); }
                    await sleep(120);
                    // close whatever opened: Escape, then remove obvious modal shells
                    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId).catch(() => {});
                    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId).catch(() => {});
                    await evaluate(cdp, sessionId, `(function(){ document.querySelectorAll('.modal-overlay, .sl-modal, .modal-backdrop, [role="dialog"], .is-modal').forEach(function(m){ if (m.id && /^view-/.test(m.id)) return; try { if (m.id) m.style.display = 'none'; else m.remove(); } catch(_){} }); return true; })()`).catch(() => {});
                    const after = await evaluate(cdp, sessionId, `window.__sweepDialogs.length`);
                    const ex = errors.splice(0), ce = consoleErrors.splice(0);
                    if (ex.length || ce.length || after > before) rec.clicks.push({ label: b.label, exceptions: ex, consoleErrors: ce, dialogs: after - before });
                    // make sure we are still on the tab (a click may have navigated)
                    await evaluate(cdp, sessionId, `(function(){ try { if (window._slCurrentTab !== '${tab}') switchTab('${tab}'); } catch(_){} return true; })()`).catch(() => {});
                    errors.splice(0); consoleErrors.splice(0);
                }
            }
            report.tabs[tab] = rec;
            const flag = rec.switchErrors.length ? 'ERR ' : rec.stacked.length ? 'STACK ' : (!rec.panel ? 'NO-PANEL ' : !rec.panel.visible ? 'HIDDEN ' : rec.panel.text === 0 ? 'EMPTY ' : '');
            const bad = rec.clicks.filter(c => c.exceptions.length || c.consoleErrors.length).length, dlg = rec.clicks.reduce((n, c) => n + c.dialogs, 0);
            console.log(('  ' + flag + tab).padEnd(28) + (rec.panel ? ('text ' + String(rec.panel.text).padStart(6) + '  buttons ' + String(rec.panel.buttons).padStart(3)) : '                          ') + (rec.stacked.length ? '  stacked with ' + rec.stacked.join(',') : '') + (bad ? '  click errors ' + bad : '') + (dlg ? '  native dialogs ' + dlg : '') + (rec.switchErrors.length ? '  ' + rec.switchErrors[0].slice(0, 90) : ''));
        }
    } finally { try { server.close(); } catch (_) {} try { if (cdp) cdp.close(); } catch (_) {} try { if (browser) browser.kill(); } catch (_) {} }
    fs.writeFileSync(path.join(__dirname, 'last_sweep.json'), JSON.stringify(report, null, 1));
    const t = Object.entries(report.tabs);
    console.log('\nsummary: ' + t.length + ' tabs · switch errors ' + t.filter(([, r]) => r.switchErrors.length).length + ' · stacked ' + t.filter(([, r]) => r.stacked.length).length + ' · missing panel ' + t.filter(([, r]) => !r.panel).length + ' · hidden ' + t.filter(([, r]) => r.panel && !r.panel.visible).length + ' · empty ' + t.filter(([, r]) => r.panel && r.panel.visible && r.panel.text === 0).length + ' · clicks with errors ' + t.reduce((n, [, r]) => n + r.clicks.filter(c => c.exceptions.length || c.consoleErrors.length).length, 0) + ' · native dialogs hit ' + t.reduce((n, [, r]) => n + r.clicks.reduce((m, c) => m + c.dialogs, 0), 0));
    console.log('missing panels: ' + t.filter(([, r]) => !r.panel).map(([k]) => k).join(', ') + '\nhidden panels : ' + t.filter(([, r]) => r.panel && !r.panel.visible).map(([k]) => k).join(', ') + '\nempty panels  : ' + t.filter(([, r]) => r.panel && r.panel.visible && r.panel.text === 0).map(([k]) => k).join(', '));
    for (const [k, r] of t) for (const c of r.clicks) if (c.exceptions.length || c.consoleErrors.length) console.log('  click error  ' + k + ' :: ' + c.label + ' :: ' + (c.exceptions[0] || c.consoleErrors[0]).slice(0, 160));
    console.log('detail : tools/sweep/last_sweep.json');
}
run().catch(e => { console.error('sweep crashed: ' + (e && e.stack || e)); process.exit(1); });
