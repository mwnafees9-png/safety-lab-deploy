/* ============================================================================
 * tools/smoke/cdp.js — a minimal Chrome DevTools Protocol client.
 * ----------------------------------------------------------------------------
 * WHY THIS EXISTS RATHER THAN `npx playwright`.
 *
 * This repo has no package.json and no bundler by design — 203 classic scripts,
 * esbuild fetched on demand. Adding Playwright to gate the deploy would put a
 * dependency and a ~150MB browser download in front of every ship, on a machine
 * we cannot inspect (device_bash runs in a Linux VM, not the Mac ship.sh runs on).
 *
 * Node 18+ ships a global WebSocket, and Chrome speaks CDP over one. That is the
 * whole dependency list: a browser you already have, and a Node you already have.
 *
 * FAIL LOUDLY, NEVER SKIP. If no browser is found or Node is too old, this throws
 * with an instruction. A gate that quietly passes when it did not run is worse
 * than no gate at all — it converts "untested" into "verified" in the ship log.
 * ==========================================================================*/
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

// Candidate browsers, most-likely first. CHROME_PATH overrides everything.
const CANDIDATES = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    '/opt/pw-browsers/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
].filter(Boolean);

function findBrowser() {
    for (const c of CANDIDATES) {
        try { if (fs.existsSync(c) && fs.statSync(c).isFile()) return c; } catch (_) {}
    }
    // /opt/pw-browsers/chromium may be a directory containing the binary
    try {
        const d = '/opt/pw-browsers';
        if (fs.existsSync(d)) {
            for (const sub of fs.readdirSync(d)) {
                for (const rel of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
                    const p = path.join(d, sub, rel);
                    if (fs.existsSync(p)) return p;
                }
            }
        }
    } catch (_) {}
    return null;
}

function freePort() {
    return new Promise((resolve, reject) => {
        const s = net.createServer();
        s.on('error', reject);
        s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
    });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function launch() {
    if (typeof WebSocket === 'undefined') {
        throw new Error(
            'This Node has no global WebSocket (needs Node 18+; 22 recommended).\n' +
            '  You are on ' + process.version + '. Upgrade Node, or set SMOKE_SKIP=1 to ship\n' +
            '  without the gate — which you should only do knowingly.');
    }
    const bin = findBrowser();
    if (!bin) {
        throw new Error(
            'No Chrome/Chromium/Edge found. The smoke gate needs a browser to open the built page in.\n' +
            '  Looked in:\n' + CANDIDATES.map(c => '    ' + c).join('\n') + '\n' +
            '  Fix: install Google Chrome, or point CHROME_PATH at a browser binary:\n' +
            '    CHROME_PATH="/path/to/Google Chrome" ./ship.sh\n' +
            '  To ship without the gate (knowingly): SMOKE_SKIP=1 ./ship.sh');
    }
    const port = await freePort();
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sla-smoke-'));
    const proc = spawn(bin, [
        '--headless=new',
        '--remote-debugging-port=' + port,
        '--user-data-dir=' + profile,
        '--no-first-run', '--no-default-browser-check', '--no-sandbox',
        '--disable-gpu', '--disable-dev-shm-usage', '--disable-extensions',
        '--disable-background-networking', '--disable-sync', '--mute-audio',
        ...(process.env.SWEEP_OFFLINE === '1' ? ['--proxy-server=direct://', '--proxy-bypass-list=*'] : []),
        'about:blank'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', d => { stderr += String(d); });

    // Poll the debugger's own HTTP endpoint rather than scraping stderr.
    let wsUrl = null;
    for (let i = 0; i < 100 && !wsUrl; i++) {
        await sleep(100);
        try {
            const r = await fetch('http://127.0.0.1:' + port + '/json/version');
            if (r.ok) wsUrl = (await r.json()).webSocketDebuggerUrl;
        } catch (_) {}
        if (proc.exitCode !== null) break;
    }
    if (!wsUrl) {
        try { proc.kill('SIGKILL'); } catch (_) {}
        throw new Error('Browser did not expose a debugging endpoint within 10s.\n  binary: ' + bin +
                        '\n  stderr: ' + stderr.split('\n').slice(0, 6).join('\n          '));
    }
    return { proc, wsUrl, bin, profile };
}

// One WebSocket, request/response by id, plus event listeners. Flat sessions:
// every command carries its sessionId, so browser and page share one socket.
class Cdp {
    constructor(ws) {
        this.ws = ws;
        this.id = 0;
        this.pending = new Map();
        this.listeners = [];
        ws.addEventListener('message', ev => {
            let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
            if (m.id && this.pending.has(m.id)) {
                const { resolve, reject } = this.pending.get(m.id);
                this.pending.delete(m.id);
                if (m.error) reject(new Error(m.error.message || JSON.stringify(m.error)));
                else resolve(m.result);
            } else if (m.method) {
                this.listeners.forEach(fn => { try { fn(m); } catch (_) {} });
            }
        });
    }
    static async connect(wsUrl) {
        const ws = new WebSocket(wsUrl);
        await new Promise((resolve, reject) => {
            ws.addEventListener('open', resolve, { once: true });
            ws.addEventListener('error', () => reject(new Error('CDP socket failed to open')), { once: true });
        });
        return new Cdp(ws);
    }
    on(fn) { this.listeners.push(fn); }
    send(method, params, sessionId) {
        const id = ++this.id;
        const msg = { id, method, params: params || {} };
        if (sessionId) msg.sessionId = sessionId;
        this.ws.send(JSON.stringify(msg));
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            setTimeout(() => {
                if (this.pending.has(id)) {
                    this.pending.delete(id);
                    reject(new Error('CDP timeout: ' + method));
                }
            }, 30000);
        });
    }
    close() { try { this.ws.close(); } catch (_) {} }
}

// Evaluate in the page and return the VALUE, not a remote handle. Anything the
// page can JSON-stringify comes back; a thrown error becomes a rejected promise
// so a broken probe reads as a broken probe rather than a failed assertion.
async function evaluate(cdp, sessionId, expression) {
    const r = await cdp.send('Runtime.evaluate', {
        expression, awaitPromise: true, returnByValue: true, allowUnsafeEvalBlockedByCSP: false
    }, sessionId);
    if (r.exceptionDetails) {
        const e = r.exceptionDetails;
        throw new Error('page threw: ' + (e.exception && (e.exception.description || e.exception.value) || e.text));
    }
    return r.result && r.result.value;
}

module.exports = { launch, Cdp, evaluate, findBrowser, freePort, sleep };
