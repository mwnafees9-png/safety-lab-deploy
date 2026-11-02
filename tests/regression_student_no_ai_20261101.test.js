/* regression_student_no_ai_20261101.test.js — university accounts: free forever, no AI at all.
 *
 * Waqas, 1 Nov 2026: "the university accounts should be comped in perpetuity, no AI available at all". Found: only a
 * .edu / .ac.* address was recognized, so students at tum.de, carleton.ca, concordia.ca, unideb.hu, hku.hk and cvut.cz
 * got the 10-day trial and were locked out; and nothing in the app stopped a student turning the AI on (?ai=1, or the
 * local flag) and running it with a pasted key.
 * Now: the server marks the account academic (public.users.academic, migration 20261101a: the .edu / .ac.* rule or the
 * world university list); the sign-in sync keeps that answer (safetyLab.server.academic); isAcademicAccount() is
 * true for it; on such an account the AI module stays off whatever the flag or URL says, AiClient.isConfigured() is
 * false and AiClient.messages() refuses before anything is sent. A comped account or a signed license (a customer's
 * own install) is never a student account.
 * MUTATION PROOFS: SL_SNA_MUTATE=flag (the AI flag still turns it on), =send (messages() sends anyway).
 * Run: node tests/regression_student_no_ai_20261101.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 800) + ')' : '')); } };
const ROOT = path.join(__dirname, '..'), SITE = path.join(ROOT, 'site');
const MUT = process.env.SL_SNA_MUTATE || '';
function mutate(file, body) {
    if (MUT === 'flag' && file === 'ai_assistant.js') return body.replace("try { if (typeof isAcademicAccount === 'function' && isAcademicAccount()) return false; } catch (_) {}\n        // Dev/override flag", "// Dev/override flag");
    if (MUT === 'send' && file === 'core_modules.js') return body.replace("if (_studentNoAI()) { const se = new Error(STUDENT_NO_AI);", "if (false) { const se = new Error(STUDENT_NO_AI);");
    return body;
}
const H = fs.readFileSync(path.join(SITE, 'helpers_modules.js'), 'utf8');
check('the sign-in sync reads users.academic and keeps the answer (a paid license or a comp is never a student account)',
    /from\('users'\)\.select\('tier,trial_ends_at,academic'\)/.test(H) && /const academic = !!\(usr && usr\.academic\) \|\|/.test(H) && /safetyLab\.server\.academic', \(academic && !activeLicense && !comped\) \? '1' : '0'/.test(H));
const MIG = path.join(ROOT, 'supabase', 'migrations', '20261101a_university_accounts.sql');
if (fs.existsSync(MIG)) {
    const m = fs.readFileSync(MIG, 'utf8');
    check('the migration loads the world university list and recognizes a university at sign-up', /create table if not exists public\.university_domains/.test(m) && (m.match(/^[a-z0-9.-]+\.[a-z]{2,}$/gm) || []).length > 3000 && /^tum\.de$/m.test(m) && /^carleton\.ca$/m.test(m) && /^unideb\.hu$/m.test(m) && /^hku\.hk$/m.test(m) && /elsif public\.is_university_email\(new\.email\) then/.test(m) && /user_academic := true;/.test(m));
    check('the expiry comes off only after the app that reads users.academic is live (a separate step)', !/set trial_ends_at = null/.test(m) && /set trial_ends_at = null where academic and tier = 'edu'/.test(fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', '20261101b_university_accounts_no_expiry.sql'), 'utf8')));
}
(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    if (!pw) { console.log('  note  Playwright is not installed'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && f.endsWith('.js')) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
    const browser = await pw.chromium.launch();
    const run = async (setup, url) => {
        const ctx = await browser.newContext();
        const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e && e.message || e)));
        await pg.addInitScript(setup);
        await pg.goto(url || base);
        await pg.waitForFunction(() => typeof isAcademicAccount === 'function' && window.AiClient, null, { timeout: 60000 });
        await new Promise(r => setTimeout(r, 1500));
        const out = await pg.evaluate(async () => {
            let sent = 0; const realFetch = window.fetch; window.fetch = function (u) { if (/anthropic|\/v1\/messages|\/ai\//.test(String(u))) sent++; return realFetch.apply(this, arguments); };
            let refusal = null;
            try { await AiClient.messages({ model: 'claude-test', system: 'x', messages: [{ role: 'user', content: 'hi' }], maxTokens: 10 }); } catch (e) { refusal = { msg: e.message, student: !!e.studentTier, permanent: AiClient.isPermanentError(e) }; }
            if (window.slLoadAI) { try { await window.slLoadAI(); } catch (_) {} }
            const ai = window.SafetyLabAI;
            return { academic: isAcademicAccount(), configured: AiClient.isConfigured(), aiOn: !!(ai && ai.enabled !== false && ai.Provider !== undefined) || !!(ai && ai.enabled === true), aiEnabledFlag: ai ? ai.enabled : 'none', refusal, sent };
        });
        await ctx.close();
        return { out, errs };
    };
    try {
        // a student at a university that is not .edu, as the server answered at sign-in, who also set the AI flag and pasted a key
        const student = await run(() => { localStorage.setItem('safetyLab.signup.email', 'akshay.test@tum.de'); localStorage.setItem('safetyLab.server.academic', '1'); localStorage.setItem('safetyLab.ai.enabled', '1'); try { localStorage.setItem('safetyLab.ai.byo.anthropic_key', 'sk-ant-test'); } catch (_) {} }, base + '?ai=1');
        check('a university account is a student account', student.out.academic === true, JSON.stringify(student.out));
        check('the AI stays off on it, even with the AI flag and ?ai=1', student.out.aiEnabledFlag === false, JSON.stringify(student.out));
        check('AiClient is not configured, and messages() refuses in plain words before anything is sent', student.out.configured === false && student.out.refusal && student.out.refusal.student && student.out.refusal.permanent && /student tier/.test(student.out.refusal.msg) && student.out.sent === 0, JSON.stringify(student.out));
        // before the first sync, a .edu address answers on its own
        const edu = await run(() => { localStorage.setItem('safetyLab.signup.email', 'pat@mit.edu'); localStorage.setItem('safetyLab.ai.enabled', '1'); });
        check('before the first sign-in sync, a .edu address is a student account on its own', edu.out.academic === true && edu.out.aiEnabledFlag === false, JSON.stringify(edu.out));
        // the server said not academic (a paid license on a university address)
        const paid = await run(() => { localStorage.setItem('safetyLab.signup.email', 'lab@mit.edu'); localStorage.setItem('safetyLab.server.academic', '0'); });
        check('a university address the server says is not a student account (a paid license) is not one', paid.out.academic === false && !(paid.out.refusal && paid.out.refusal.student), JSON.stringify(paid.out));
        // an ordinary sign-up
        const other = await run(() => { localStorage.setItem('safetyLab.signup.email', 'someone@gmail.com'); });
        check('an ordinary sign-up is not a student account', other.out.academic === false && !(other.out.refusal && other.out.refusal.student), JSON.stringify(other.out));
        check('no page errors', [student, edu, paid, other].every(x => !x.errs.length), [student, edu, paid, other].map(x => x.errs.join(' | ')).join(' || '));
    } catch (e) { check('test crashed: ' + (e && e.stack || e), false); }
    finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
