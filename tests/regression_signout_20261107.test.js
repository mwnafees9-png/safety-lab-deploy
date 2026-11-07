/* regression_signout_20261107.test.js: signing out from the account panel works, on this browser only, and lands on
 * the sign-in page.
 *
 * Waqas, 7 Nov 2026: "why is sign out not working on the web app". The account panel sat at z-index 2147483600 and the
 * shared confirm dialog at 2000, so "Sign out?" opened underneath the panel and its button could not be clicked; the
 * sign-out only ran after that confirm, so nothing happened. Then: "yes only the browser, and take you back to the sign
 * in page" (local scope, like the inactivity lock; the desktop app and other browsers stay signed in).
 * MUTATION PROOFS: SL_SO_MUTATE=old (the bug as reported), =under (the dialog back under the panel), =global (sign out everywhere),
 *   =nogate (no sign-in page after) must fail.
 * Run: node tests/regression_signout_20261107.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 900) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site'), MUT = process.env.SL_SO_MUTATE || '';
function mutate(file, body) {
    if (file === 'misc_fn_modules.js' && MUT === 'under') return body.replace("ov.style.zIndex = '2147483647'; if (ov.parentNode !== document.body || document.body.lastElementChild !== ov) document.body.appendChild(ov);", "if (!ov.parentNode) document.body.appendChild(ov);");
    if (MUT === 'old' && file === 'misc_fn_modules.js') return body.replace("ov.style.zIndex = '2147483647'; if (ov.parentNode !== document.body || document.body.lastElementChild !== ov) document.body.appendChild(ov);", "if (!ov.parentNode) document.body.appendChild(ov);");
    if (MUT === 'old' && file === 'helpers_modules.js') return body.replace("signout.onclick = async function(){ close(); if (!(await slConfirm(", "signout.onclick = async function(){ if (!(await slConfirm(");
    if (file === 'misc_fn_modules.js' && MUT === 'global') return body.replace("await client.auth.signOut({ scope: 'local' });", "await client.auth.signOut();");
    if (file === 'misc_fn_modules.js' && MUT === 'nogate') return body.replace("window.SafetyLab._authShowGate();", "void 0;");
    if (file === 'auth_gate.js' && MUT === 'nogate') return body.replace("        renderGate();\n      }\n    });", "      }\n    });");
    return body;
}
(async () => {
    console.log('regression_signout_20261107' + (MUT ? ' [mutation ' + MUT + ']' : ''));
    const MISC = fs.readFileSync(path.join(SITE, 'misc_fn_modules.js'), 'utf8'), HELP = fs.readFileSync(path.join(SITE, 'helpers_modules.js'), 'utf8'), SEATS = fs.readFileSync(path.join(SITE, 'slab_seats.js'), 'utf8'), SL = fs.readFileSync(path.join(SITE, 'safety_lab.js'), 'utf8');
    check('every sign-out button goes through the one sign-out (the account panel, the paywall, the seat screen)', /signout\.onclick = async function\(\)\{ close\(\);[\s\S]{0,400}await supabaseSignOut\(\)/.test(HELP) && /W\.supabaseSignOut\(\)/.test(SEATS) && /async function _signOut\(e\)[\s\S]{0,200}window\.supabaseSignOut\(\)/.test(SL));
    check('the panel closes before it asks', /signout\.onclick = async function\(\)\{ close\(\); if \(!\(await slConfirm/.test(HELP));
    let pw = null; for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!pw) { console.log('  note  Playwright is not installed: the browser part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } const ext = path.extname(f); if (ext === '.js') b = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream' }); r.end(b); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
        const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
        await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
        await page.waitForFunction(() => typeof openAccountPanel === 'function' && typeof getSupabaseClient === 'function' && window.SafetyLab && window.SafetyLab._authShowGate, null, { timeout: 60000 });
        await page.waitForTimeout(1200);
        const r = await page.evaluate(async () => {
            const wait = ms => new Promise(res => setTimeout(res, ms));
            // as if signed in: the gate down, an email known; sign-out calls recorded (the network is not reached)
            const gateEl = () => document.getElementById('sl-auth-form');
            try { window.SafetyLab._authLiftGate(); } catch (_) {}
            await wait(200);
            const c = getSupabaseClient(), calls = [];
            c.auth.signOut = async function (o) { calls.push((o && o.scope) || 'global'); try { c.auth._notifyAllSubscribers && await c.auth._notifyAllSubscribers('SIGNED_OUT', null); } catch (_) {} return { error: null }; };
            try { setSignupEmail('pilot@example.com'); } catch (_) {}
            openAccountPanel(); await wait(250);
            const btn = document.getElementById('acct-signout'); if (!btn) return { noBtn: true };
            btn.click(); await wait(400);
            const panelGone = !document.getElementById('account-panel') || getComputedStyle(document.getElementById('account-panel')).display === 'none';
            const cards = [...document.querySelectorAll('#sl-dialog-overlay .sl-dialog-card')].filter(e => e.offsetParent);
            const ok = cards.length ? [...cards[0].querySelectorAll('button')].find(x => /Sign out/.test(x.textContent)) : null;
            let onTop = false, under = '';
            if (ok) { const rc = ok.getBoundingClientRect(), el = document.elementFromPoint(rc.x + rc.width / 2, rc.y + rc.height / 2); onTop = el === ok || ok.contains(el); if (!onTop && el) { let o = el; while (o.parentElement && o.parentElement !== document.body) o = o.parentElement; under = o.id || o.className; } }
            // confirm the sign-out by clicking where a person would
            if (ok) { const rc = ok.getBoundingClientRect(); const el = document.elementFromPoint(rc.x + rc.width / 2, rc.y + rc.height / 2); el.click(); }
            await wait(900);
            // a panel opened after the dialog still cannot cover it
            const late = document.createElement('div'); late.style.cssText = 'position:fixed;inset:0;z-index:2147483646'; document.body.appendChild(late);
            const st = await (async () => { const p = slConfirm('Still on top?', { okText: 'Yes' }); await wait(200); const b2 = [...document.querySelectorAll('#sl-dialog-overlay button')].find(x => /Yes/.test(x.textContent)); if (!b2) return false; const rc = b2.getBoundingClientRect(), el = document.elementFromPoint(rc.x + rc.width / 2, rc.y + rc.height / 2); const top = el === b2 || b2.contains(el); b2.click(); await p; return top; })();
            late.remove();
            const g = gateEl(); let gp = g; while (gp && gp.parentElement && gp.parentElement !== document.body) gp = gp.parentElement;
            return { panelGone, dialog: cards.length, ok: !!ok, onTop, under, lateTop: st, calls, email: (() => { try { return getSignupEmail(); } catch (_) { return 'x'; } })(), gate: !!g && !!gp && getComputedStyle(gp).display !== 'none' && g.offsetParent !== null };
        });
        check('clicking Sign out closes the account panel and asks, with the confirm button on top where it can be clicked', !r.noBtn && r.panelGone && r.dialog === 1 && r.ok && r.onTop, JSON.stringify(r));
        check('a question is always the top layer, even over a panel opened after it', r.lateTop, JSON.stringify(r));
        check('confirming signs out this browser only (local scope), forgets the email, and shows the sign-in page', r.calls.length >= 1 && r.calls.every(x => x === 'local') && !r.email && r.gate, JSON.stringify(r));
        check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
    } finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  crashed: ' + (e && e.stack || e)); process.exit(1); });
