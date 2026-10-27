/*
 * regression_ai_panels_20261027.test.js
 *
 * 27 Oct 2026 (customer report). The AI panels that slide out on the right:
 *   - toasts covered the Close button at the top right; Close is now red and last in the bottom row
 *     of every panel (one dock, _dockPanelClose, for every .ai-rev-panel), and the ANEM chat's Undo,
 *     Clear and Close sit in a bottom row
 *   - Accept, Accept all, Generate and "Draft ... selected" are large, bold, solid
 *   - the disclaimer stays grey; every other line is dark and legible
 *   - an ANEM-drafted card lists every field it would write (an FHA card showed no phase, no effects,
 *     no rationale)
 *
 * [A] wiring (pure)   [B] in the real app (Playwright + Chromium; skipped with a note where missing)
 * Mutation: SL_AIPANELS_MUTATE=1 serves ai_assistant.js without the dock: [B] goes red.
 * Run: node tests/regression_ai_panels_20261027.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + d + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
function fnSrc(src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return null;
    let d = 0, j = src.indexOf('{', i);
    for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
    return null;
}

console.log('\n[A] wiring');
const A = read('ai_assistant.js'), L = read('ai_loader.js');
check('ai_loader.js loads ai_assistant.js v76.91 or later', /ai_assistant\.js\?v=76\.(9[1-9]|\d{3})/.test(L));
check('one dock for every panel, installed when the module loads', /function _dockPanelClose\(p\)/.test(A) && /try \{ _installPanelCloseDock\(\); \} catch \(_\) \{\}/.test(A));
check('Close is red, last, apart from the actions', /\.ai-rev-panel \.aifh-close\{margin-left:auto;background:#dc2626/.test(A));
check('the working buttons are solid and bold', /\.ai-rev-panel \.aifh-accept,\.ai-rev-panel \.rv-accept-all\{background:#1d4ed8;color:#fff !important;border:1px solid #1e40af;font-weight:700/.test(A));
check('the disclaimer keeps the faint grey, everything else reads the dark tone', /\.aifh-disclaimer\{font-size:11px;color:var\(--aifh-faint\)/.test(A) && /dim: '#363c46', faint: '#5c6470'/.test(A));
check('the ANEM chat header has no close; its bottom row has Undo, Clear and a red Close', !/id="anem-x" title="Close \(Esc\)" style="border:none/.test(A) && /id="anem-actions"[\s\S]{0,900}id="anem-x" title="Close \(Esc\)" style="margin-left:auto;[^"]*background:#dc2626/.test(A));

// every op the action catalog offers has its fields listed
const ops = Array.from(new Set((A.match(/'- ((?:add|update|delete)_[a-z_]+|link|update|delete) \{/g) || []).map(s => s.replace(/^'- /, '').replace(/ \{$/, ''))));
const tbl = A.slice(A.indexOf('const _ANEM_CARD_FIELDS = {'), A.indexOf('const _ANEM_CARD_SKIP'));
const missing = ops.filter(o => !new RegExp("(^|\\s|')" + o + "'?:\\s*\\[").test(tbl));
check('every action in the catalog has its card fields (' + ops.length + ' ops)', ops.length >= 20 && missing.length === 0, missing.join(','));

const ctx = { _esc: s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])), _countLeaves: () => 3, _chatSysByIdOrName: () => ({ name: 'Hydraulics' }), _axisLevelsHtml: () => '<div>Levels</div>' };
vm.createContext(ctx);
const tblDecl = A.slice(A.indexOf('const _ANEM_CARD_FIELDS = {'), A.indexOf('function _anemFieldValue('));
vm.runInContext(tblDecl.replace(/^const /gm, 'var ').replace(/\n    const /g, '\n    var ') + '\n' + fnSrc(A, '_anemFieldValue') + '\n' + fnSrc(A, '_anemCardFields'), ctx);
const fha = vm.runInContext('_anemCardFields', ctx)({ op: 'add_fha', scope: 'system', systemId: 'HYD', subId: 'F1.2', srcCondId: 'FC-01', fcDesc: 'Loss of pitch', phases: ['Cruise', 'Landing'], effAc: 'Reduced margins', effCrew: 'Workload', effPax: 'None noticed', severityRationale: 'Crew recovers', severity: 'Major' }, 'add_fha', 'fcDesc');
['System:</b> Hydraulics', 'Function:</b> F1.2', 'Failure condition id:</b> FC-01', 'Flight phases:</b> Cruise, Landing', 'Aircraft effect:</b> Reduced margins', 'Crew effect:</b> Workload', 'Passenger effect:</b> None noticed', 'Severity rationale:</b> Crew recovers', 'Levels']
    .forEach(s => check('an FHA card shows ' + s.replace(/<[^>]+>/g, '').replace(/:$/, ''), fha.indexOf(s) >= 0));
check('the failure condition text is not repeated as a field', fha.indexOf('Loss of pitch') < 0);
const mac = vm.runInContext('_anemCardFields', ctx)({ op: 'add_mac', subId: 'F2', clauses: [{ min: 2, of: ['HYD-A', 'HYD-B', 'HYD-C'] }] }, 'add_mac', '');
check('a MAC clause reads in words', /at least 2 of HYD-A, HYD-B, HYD-C/.test(mac));
const unk = vm.runInContext('_anemCardFields', ctx)({ op: 'add_new_thing', widget: 'W-1', _k: 'x', confidence: 'high' }, 'add_new_thing', '');
check('an op not in the table still shows what it carries (and no bookkeeping)', /widget:<\/b> W-1/.test(unk) && !/confidence|_k/.test(unk));

// ================================================================================ [B]
let pw = null;
for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
function done() { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
if (!pw) { console.log('  note  Playwright is not installed on this machine: [B] did not run'); done(); }

const MUTATE = process.env.SL_AIPANELS_MUTATE === '1';
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };
function serve() {
    return new Promise(res => {
        const srv = http.createServer((q, r) => {
            let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(SITE, path.normalize(p));
            if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); }
            fs.readFile(f, (e, b) => {
                if (e) { r.writeHead(404); return r.end('not found'); }
                if (MUTATE && path.basename(f) === 'ai_assistant.js') b = Buffer.from(String(b).replace('try { _installPanelCloseDock(); } catch (_) {}', ''));
                r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b);
            });
        }).listen(0, '127.0.0.1', () => res(srv));
    });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
// A stand-in for the model: answers the FHA batch with three rows per failure condition it is asked for.
const STUB = `window.AiClient = Object.assign(window.AiClient || {}, { isConfigured: () => true, isPermanentError: () => false, messages: async req => {
    const u = JSON.stringify(req.messages); const m = u.match(/cover EXACTLY these failure conditions and no others: (.*?)\\. Emit/);
    const conds = m ? m[1].split('; ').map(s => { const p = s.split(' \\u2014 '); return { id: p[0], desc: p[1] }; }) : [];
    const acts = []; conds.forEach(c => ['Takeoff', 'Cruise', 'Landing'].forEach(ph => acts.push({ op: 'add_fha', scope: 'aircraft', srcCondId: c.id, fcDesc: c.desc, phases: [ph], effAc: 'Margins reduced in ' + ph, effCrew: 'Crew follows the abnormal procedure', effPax: 'Discomfort', severity: 'Major', effAcLevel: 'significant', effCrewLevel: 'significant', effPaxLevel: 'slight', severityRationale: 'The crew recovers with the procedure' })));
    return { model: 'stub', content: [{ text: JSON.stringify({ reply: 'Drafted.', actions: acts }) }] }; } });`;
const lum = c => { const m = String(c).match(/\d+(\.\d+)?/g).map(Number); const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

(async () => {
    console.log('\n[B] in the real app' + (MUTATE ? ' (MUTATION: no dock)' : ''));
    const srv = await serve();
    let browser;
    try { browser = await pw.chromium.launch(); }
    catch (e) { console.log('  note  Chromium could not start here: [B] did not run'); srv.close(); done(); }
    try {
        const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
        const errs = []; pg.on('pageerror', e => errs.push(String(e)));
        pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/?ai=1'); await sleep(3500);
        await pg.evaluate(() => {
            const g = document.getElementById('sl-auth-gate'); if (g) g.remove();
            document.documentElement.classList.remove('sl-auth-gate-blocked');
            document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; });
        });
        await pg.evaluate(async () => { await loadSampleProject(); }); await sleep(3000);
        await pg.evaluate(async () => { await window.slLoadAI(); }); await sleep(400);
        await pg.evaluate(STUB);

        const panelFacts = sel => pg.evaluate(sel => {
            const p = document.querySelector(sel); if (!p) return null;
            const foot = p.querySelector(':scope > .aifh-foot'), close = p.querySelector('.aifh-close');
            const cs = close ? getComputedStyle(close) : null;
            return {
                headClose: [...p.querySelectorAll(':scope > .aifh-head button')].filter(b => /close/i.test(b.id + b.className) || b.textContent.trim() === 'Close').length,
                closeLast: !!(foot && close && foot.lastElementChild === close),
                closeBg: cs ? cs.backgroundColor : '', closeFg: cs ? cs.color : '',
                bottom: close ? Math.round(p.getBoundingClientRect().bottom - close.getBoundingClientRect().bottom) : -1,
                bg: getComputedStyle(p).backgroundColor
            };
        }, sel);

        // ---- the "which ones?" picker
        await pg.evaluate(() => { SafetyLabAI.populateFha(); }); await sleep(1200);
        const pick = await panelFacts('#ai-scope-pick');
        check('B1 picker: no Close in the header', pick && pick.headClose === 0, JSON.stringify(pick));
        check('B1 picker: Close is last in the bottom row, red, white text', pick && pick.closeLast && pick.closeBg === 'rgb(220, 38, 38)' && pick.closeFg === 'rgb(255, 255, 255)', JSON.stringify(pick));
        const go = await pg.evaluate(() => { const b = document.querySelector('#scope-pick-go'), cs = getComputedStyle(b); return { bg: cs.backgroundColor, fw: cs.fontWeight, fs: parseFloat(cs.fontSize), h: b.getBoundingClientRect().height }; });
        check('B1 picker: "Draft FHA for selected" is solid blue, bold, larger', go.bg === 'rgb(29, 78, 216)' && Number(go.fw) >= 700 && go.fs >= 13.5 && go.h >= 32, JSON.stringify(go));

        // ---- the review panel
        await pg.evaluate(() => { document.querySelector('#scope-pick-go').click(); }); await sleep(6000);
        const rev = await panelFacts('.ai-rev-panel');
        check('B2 review: Close docked last in the bottom row, red', rev && rev.headClose === 0 && rev.closeLast && rev.closeBg === 'rgb(220, 38, 38)', JSON.stringify(rev));
        const card = await pg.evaluate(() => { const c = document.querySelector('.ai-rev-panel .aifh-card'); return c ? c.innerText : ''; });
        ['Flight phases:', 'Aircraft effect:', 'Crew effect:', 'Passenger effect:', 'Severity rationale:', 'Failure condition id:']
            .forEach(s => check('B2 review card shows ' + s.replace(':', ''), card.indexOf(s) >= 0, card.slice(0, 160)));
        const btns = await pg.evaluate(() => {
            const p = document.querySelector('.ai-rev-panel'); const acc = p.querySelector('.aifh-card .aifh-accept'), all = p.querySelector('.aifh-foot .rv-accept-all'), dis = p.querySelector('.aifh-foot .rv-dismiss-all');
            const f = b => { const cs = getComputedStyle(b); return { bg: cs.backgroundColor, fw: Number(cs.fontWeight), w: b.getBoundingClientRect().width }; };
            return { acc: f(acc), all: f(all), dis: f(dis) };
        });
        check('B2 Accept and Accept all are solid blue and bold', btns.acc.bg === 'rgb(29, 78, 216)' && btns.all.bg === 'rgb(29, 78, 216)' && btns.acc.fw >= 700 && btns.all.fw >= 700, JSON.stringify(btns));
        check('B2 Dismiss all stays a plain outlined button', btns.dis.bg !== 'rgb(29, 78, 216)' && btns.dis.bg !== 'rgb(220, 38, 38)');
        const legible = await pg.evaluate(() => {
            const p = document.querySelector('.ai-rev-panel'); const bg = getComputedStyle(p).backgroundColor;
            const out = [];
            // every element on the first three cards that carries text of its own
            const op = e => { let o = 1; for (let n = e; n && n !== p; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; };
            const ownBg = e => { for (let n = e; n && !n.classList.contains('aifh-card'); n = n.parentElement) { const b = getComputedStyle(n).backgroundColor; if (b && b !== 'rgba(0, 0, 0, 0)' && b !== 'transparent') return b; } return null; };
            [...p.querySelectorAll('.aifh-card')].slice(0, 3).forEach(card => card.querySelectorAll('*').forEach(e => {
                if (e.closest('button')) return;
                if (![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return;
                const cs = getComputedStyle(e); out.push({ c: cs.color, fs: parseFloat(cs.fontSize), o: op(e), own: ownBg(e), t: e.textContent.trim().slice(0, 30) });
            }));
            const dis = p.querySelector('.aifh-disclaimer'); return { bg, out, dis: dis ? getComputedStyle(dis).color : '' };
        });
        const plain = legible.out.filter(x => !x.own);
        const worst = plain.reduce((m, x) => Math.min(m, contrast(x.c, legible.bg)), 99);
        const small = legible.out.filter(x => x.fs < 12 || x.o < 1);
        check('B2 every line of text on a card is dark (contrast 7:1 or better)', plain.length > 3 && worst >= 7, worst.toFixed(1) + ' ' + JSON.stringify(plain.filter(x => contrast(x.c, legible.bg) < 7).slice(0, 2)));
        check('B2 and 12px or larger, fully opaque', legible.out.length > 3 && small.length === 0, JSON.stringify(small.slice(0, 3)));
        check('B2 the disclaimer stays grey', legible.dis && contrast(legible.dis, legible.bg) < 7);
        // a toast at the top right no longer covers Close
        await pg.evaluate(() => { showToast('A long notice that sits at the top right of the screen for a while', 'info', 8000); }); await sleep(400);
        const cover = await pg.evaluate(() => {
            const c = document.querySelector('.ai-rev-panel .aifh-close').getBoundingClientRect();
            const el = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
            return !!(el && el.closest && el.closest('.aifh-close'));
        });
        check('B2 with a toast showing, Close is the thing under the pointer', cover);
        await pg.evaluate(() => { document.querySelector('.ai-rev-panel .aifh-close').click(); }); await sleep(300);
        check('B2 Close still closes the panel', await pg.evaluate(() => !document.querySelector('.ai-rev-panel')));

        // ---- any panel added later docks the same way
        const later = await pg.evaluate(async () => {
            const p = document.createElement('div'); p.className = 'ai-rev-panel'; p.id = 'fws-later';
            p.innerHTML = '<div class="aifh-head"><h3>Later</h3><button type="button" id="later-close">Close</button></div><div class="aifh-body">x</div>';
            document.body.appendChild(p); await new Promise(r => setTimeout(r, 50));
            const a1 = p.querySelector(':scope > .aifh-foot > #later-close') && p.querySelector('.aifh-head button') === null;
            p.innerHTML = '<div class="aifh-head"><h3>Redrawn</h3><button type="button" class="rv-close">Close</button></div><div class="aifh-foot"><button class="aifh-accept">Go</button></div>';
            await new Promise(r => setTimeout(r, 50));
            const foot = p.querySelector(':scope > .aifh-foot'); const a2 = foot.lastElementChild.classList.contains('rv-close') && foot.lastElementChild.classList.contains('aifh-close');
            p.remove(); return { a1: !!a1, a2: !!a2 };
        });
        check('B3 a panel added later (no bottom row) gets one, with Close in it', later.a1);
        check('B3 a panel that redraws itself docks its Close again', later.a2);

        // ---- the ANEM chat
        await pg.evaluate(() => { SafetyLabAI.openChat(); }); await sleep(800);
        const anem = await pg.evaluate(() => {
            const p = document.getElementById('anem-panel'); const x = document.getElementById('anem-x'), row = document.getElementById('anem-actions');
            const pr = p.getBoundingClientRect(), xr = x.getBoundingClientRect(), cs = getComputedStyle(x);
            return { inRow: !!(row && row.contains(x) && row.contains(document.getElementById('ai-chat-undo')) && row.contains(document.getElementById('ai-chat-clear'))),
                     nearBottom: pr.bottom - xr.bottom < 80, bg: cs.backgroundColor, text: x.textContent.trim() };
        });
        check('B4 ANEM: Undo, Clear and Close share the bottom row', anem.inRow && anem.nearBottom, JSON.stringify(anem));
        check('B4 ANEM: Close is a red "Close" button', anem.bg === 'rgb(220, 38, 38)' && anem.text === 'Close', JSON.stringify(anem));
        await pg.click('#anem-x'); await sleep(300);
        check('B4 ANEM: Close closes the chat', await pg.evaluate(() => !document.getElementById('anem-panel')));
        check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
    } catch (e) {
        check('[B] ran without throwing', false, String(e && e.stack || e).slice(0, 400));
    } finally {
        try { await browser.close(); } catch (_) {}
        srv.close(); done();
    }
})();
