#!/usr/bin/env node
/*
 * Regression: ANEM writes what it drafts, sees the whole project, and answers review comments (28 Oct 2026).
 *
 * Customer report: "it did the correct analysis with perfect reasoning just did not populate the actual FHA"
 * ("no lines created at all"). Waqas: "there should be no cutoff at all"; "ANEM should also be able to respond
 * to review comments and address them". The AI is a stand-in here (window.AiClient), so this pins the product,
 * not a model's mood. Pinned, in the real app:
 *   [A] nothing is cut from what ANEM reads: every function of a 240-row three-tier tree, full names, review comments;
 *   [B] a `draft` hand-off runs the FHA's own drafting engine on the FCIM conditions of the named function, and
 *       Accept all writes the rows;
 *   [C] the safety net: a turn that asked for a change and wrote nothing says so, with "Add it to the analysis";
 *       a question gets no warning;
 *   [D] reply_comment files ANEM's reply under the comment, marked as ANEM's, and the comment stays open;
 *   [E] the comment engine: Address replies and proposes the change as a card; Accept writes both; still open;
 *   [F] "Ask ANEM" on an open comment and "Address all with ANEM" on the open-comments list;
 *   [G] a project too big for the AI is never cut to fit: a plain message says so.
 * MUTATE=<name> serves the old behavior for one piece; each must turn the test red.
 *
 * Run: node tests/regression_anem_writes_20261028.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 400) + ')' : '')); } };
const done = () => { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); };
const SITE = path.join(__dirname, '..', 'site');
const MUTATE = process.env.MUTATE || '';
const MUTS = {
  cap:     ["acFunctions: (s.acFunctionsData || []).map(", "acFunctions: (s.acFunctionsData || []).slice(0, 80).map("],
  draft:   ["                    case 'draft': results.push(_chatDraft(a)); break;", ""],
  net:     ["const _noEdits = !!parsed && !actions.length", "const _noEdits = false && !actions.length"],
  reply:   ["                    case 'reply_comment': results.push(_chatReplyComment(a, model)); break;", ""],
  snap:    ["            reviewCommentsData: safe(() => reviewCommentsData, []),", ""],
  big:     ["const _big = /prompt is too long", "const _big = false && /prompt is too long"]
};

console.log('\n[static] the cutoffs are gone from what ANEM reads');
const AI = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
if (!MUTATE) {
  const s0 = AI.indexOf('    function _chatProjectState() {'), s1 = AI.indexOf('    function _chatSystemPrompt() {');
  const reg = AI.slice(s0, s1);
  check('the project state has no .slice(0, N) and no _chatClip', s0 > 0 && s1 > s0 && !/\.slice\(0, \d+\)/.test(reg) && reg.indexOf('_chatClip(') < 0);
  check('the whole conversation is sent', AI.indexOf('_CHAT_MAXTURNS') < 0 && AI.indexOf('const msgs = _chatHistory.map(') > 0);
  check('attachments are not trimmed', AI.indexOf("((res && res.images) || []).slice(0, 6)") < 0 && AI.indexOf("String(txt || '').slice(0, 200000)") < 0);
}

let pw; try { pw = require('playwright'); } catch (_) { console.log('  note  Playwright is not installed here: the browser checks did not run'); done(); }
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(SITE, path.normalize(p));
      if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); }
      fs.readFile(f, (e, b) => {
        if (e) { r.writeHead(404); return r.end('not found'); }
        if (MUTATE && path.basename(f) === 'ai_assistant.js') {
          const m = MUTS[MUTATE], s = String(b);
          if (!m || s.split(m[0]).length !== 2) { console.error('mutation anchor not found: ' + MUTATE); process.exit(4); }
          b = Buffer.from(s.replace(m[0], m[1]));
        }
        r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b);
      });
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  console.log('\n[browser] the real app, a stand-in AI' + (MUTATE ? ' (MUTATION: ' + MUTATE + ')' : ''));
  const srv = await serve();
  let browser;
  try { browser = await pw.chromium.launch(); } catch (e) { console.log('  note  Chromium could not start here: the browser checks did not run'); srv.close(); done(); }
  try {
    const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    const errs = []; pg.on('pageerror', e => errs.push(String(e))); pg.on('dialog', d => d.dismiss().catch(() => {}));
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/?ai=1'); await sleep(3500);
    await pg.evaluate(() => {
      const g = document.getElementById('sl-auth-gate'); if (g) g.remove();
      document.documentElement.classList.remove('sl-auth-gate-blocked');
      document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; });
    });
    await pg.evaluate(async () => { await loadSampleProject(); }); await sleep(3000);
    await pg.evaluate(() => {
      window.__cap = []; window.__q = [];
      window.AiClient = Object.assign(window.AiClient || {}, { isConfigured: () => true, isProxyMode: () => false, messages: async (o) => {
        window.__cap.push(o); const f = window.__q.length ? window.__q.shift() : '{"reply":"(none)","actions":[]}';
        return { model: 'stub', stop_reason: 'end_turn', content: [{ text: typeof f === 'function' ? f(o) : f }] }; } });
    });
    // Accepted FHA rows can make new fault trees, and the live common cause check then asks for a decision on any
    // suspect (a modal over everything, by design). The test answers it the way an engineer would, then carries on.
    const decideCma = () => pg.evaluate(() => { const L = window.SLCmaLive; if (!L || !L.pending().length) return 0; L.pending().forEach(x => L.setChoice(x.key, 'ignore', 'test: not part of this check')); L.submitModal(); return 1; });
    const send = async (t) => { await decideCma(); await pg.evaluate(() => { if (!document.getElementById('anem-panel')) slOpenAnem(); }); await sleep(300); await pg.fill('#ai-chat-input', t); try { await pg.click('#ai-chat-send', { timeout: 5000 }); } catch (e) { const what = await pg.evaluate(() => { const b = document.getElementById('ai-chat-send').getBoundingClientRect(); const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return el ? (el.tagName + '#' + el.id + ' ' + String(el.className).slice(0, 60) + ' / ' + ((el.closest('[id]') || {}).id || '')) : 'nothing'; }); throw new Error('the Send button is covered by ' + what); } await sleep(3500); };
    const lastSys = () => pg.evaluate(() => String((window.__cap[window.__cap.length - 1] || {}).system || ''));

    // ---- [B] the hand-off (sample project: its FCIM holds failure conditions)
    const sub = await pg.evaluate(() => (acExtractedFCs || []).filter(e => e && e.id && e.desc && e.subId)[0].subId);
    await pg.evaluate((sub) => {
      const ex = acExtractedFCs.filter(e => e.subId === sub);
      window.__q.push(JSON.stringify({ reply: 'Starting the FHA for ' + sub + '.', actions: [{ op: 'draft', analysis: 'fha', scope: 'aircraft', subIds: [sub] }], choices: [], assumptions: [] }));
      window.__q.push(o => { const m = JSON.stringify(o.messages); return JSON.stringify({ reply: 'drafted', assumptions: [], actions: ex.filter(e => m.indexOf(e.id) >= 0).map(e => ({ op: 'add_fha', scope: 'aircraft', subId: sub, srcCondId: e.id, fcDesc: e.desc, phases: ['All phases'], effAc: 'Reduced margin', effCrew: 'Workload up', effPax: 'None', effAcLevel: 'MAJ', effCrewLevel: 'MAJ', effPaxLevel: 'NSE', severity: 'Major', sevBasis: 'MAJ-2', severityRationale: 'stand-in' })) }); });
      window.__nCond = ex.length;
      // 30 Oct 2026 (no duplicates): a condition already assessed for some of these phases is refused, not added twice
      window.__nHad = ex.filter(e => acFhaData.some(r => r && (r.fcId === e.id || r.sourceCondId === e.id))).length;
    }, sub);
    const f0 = await pg.evaluate(() => acFhaData.length);
    await send('Draft the FHA rows for ' + sub); await sleep(3000);
    const B = await pg.evaluate(() => { const p = document.querySelector('.ai-rev-panel'); return { line: (document.getElementById('anem-panel').innerText.match(/Drafting the FHA[^\n]*/) || [''])[0], panel: !!p, title: p ? p.innerText.slice(0, 40) : '', n: window.__nCond, had: window.__nHad }; });
    check('[B] the chat hands the FHA to its drafting engine and says so', /Drafting the FHA for .* failure condition/.test(B.line) && B.panel && /FHA/.test(B.title), JSON.stringify(B));
    await pg.evaluate(() => { const p = document.querySelector('.ai-rev-panel'); const b = p && [...p.querySelectorAll('button')].find(b => /accept all/i.test(b.textContent)); if (b) b.click(); });
    await sleep(1500);
    const f1 = await pg.evaluate(() => acFhaData.length);
    check('[B] Accept all writes one FHA row per FCIM condition of that function not yet assessed (no condition assessed twice)', f1 - f0 === B.n - B.had && B.n > 0, f0 + ' -> ' + f1 + ' (' + B.n + ' conditions, ' + B.had + ' already assessed)');
    await pg.evaluate(() => { document.querySelectorAll('.ai-rev-panel').forEach(p => p.remove()); });

    // ---- [C] the safety net
    await pg.evaluate(() => { window.__q.push(JSON.stringify({ reply: 'Here is the FHA: Loss of pitch, Major, because ...', actions: [], choices: [], assumptions: [] })); });
    await send('Draft an FHA row for ' + sub);
    const C = await pg.evaluate(() => ({ warn: document.querySelectorAll('#anem-panel .anem-noedits').length, btn: !!document.querySelector('#anem-panel .anem-write-now') }));
    check('[C] a request that wrote nothing says so, with "Add it to the analysis"', C.warn === 1 && C.btn, JSON.stringify(C));
    await pg.evaluate(() => { window.__q.push(JSON.stringify({ reply: 'An FHA classifies failure conditions.', actions: [], choices: [], assumptions: [] })); });
    await send('What is an FHA?');
    const C2 = await pg.evaluate(() => ({ warn: document.querySelectorAll('#anem-panel .anem-noedits').length, btn: !!document.querySelector('#anem-panel .anem-write-now') }));
    check('[C] a question gets no warning', C2.warn === 1 && !C2.btn, JSON.stringify(C2));

    // ---- [D] reply_comment, [A] comments reach ANEM
    const cid = await pg.evaluate(() => Review.addComment({ kind: 'acFha', id: acFhaData[0].fcId }, 'Why is this Major and not Hazardous?').commentId);
    await pg.evaluate((cid) => { window.__q.push(JSON.stringify({ reply: 'Answered.', actions: [{ op: 'reply_comment', commentId: cid, text: 'Because the crew can still land. FC-999 does not exist.' }], choices: [], assumptions: [] })); }, cid);
    await send('Answer the comment on the first FHA row');
    check('[A] review comments reach ANEM', (await lastSys()).indexOf(cid) >= 0);
    const D = await pg.evaluate((cid) => ({ root: Review.getById(cid).status, kids: reviewCommentsData.filter(c => c.parentId === cid).map(k => ({ by: k.authorName, ai: !!k.aiGenerated, st: k.status })) }), cid);
    check('[D] ANEM\'s reply is filed under the comment, marked as ANEM, and the comment stays open', D.root === 'open' && D.kids.length === 1 && D.kids[0].by === 'ANEM' && D.kids[0].ai && D.kids[0].st === 'open', JSON.stringify(D));

    // ---- [E] the comment engine
    await pg.evaluate((cid) => { const row = acFhaData[0]; window.__q.push(JSON.stringify({ reply: 'ok', assumptions: [], actions: [{ op: 'update', table: 'ac_fha', _id: row.internalId, fields: { severityRationale: 'Rationale updated per review' } }, { op: 'reply_comment', commentId: cid, text: 'Updated the rationale to explain the class.' }] })); }, cid);
    await pg.evaluate((cid) => SafetyLabAI.addressComments({ commentIds: [cid] }), cid); await sleep(3000);
    const E0 = await pg.evaluate(() => { const p = document.querySelector('.ai-rev-panel'); return p ? p.innerText : ''; });
    check('[E] the comment engine proposes the change and the reply as cards', /review comments/i.test(E0) && /Rationale updated per review/.test(E0) && /Updated the rationale/.test(E0), E0.slice(0, 300));
    check('[E] the coverage note does not claim flight phases for comments', !/flight phase/.test(E0));
    await pg.evaluate(() => { const p = document.querySelector('.ai-rev-panel'); const b = p && [...p.querySelectorAll('button')].find(b => /accept all/i.test(b.textContent)); if (b) b.click(); }); await sleep(1500);
    const E = await pg.evaluate((cid) => ({ rat: acFhaData[0].severityRationale, replies: reviewCommentsData.filter(c => c.parentId === cid).length, root: Review.getById(cid).status }), cid);
    check('[E] Accept writes the change and the reply; the comment stays open', E.rat === 'Rationale updated per review' && E.replies === 2 && E.root === 'open', JSON.stringify(E));
    await pg.evaluate(() => { document.querySelectorAll('.ai-rev-panel').forEach(p => p.remove()); });

    // ---- [F] the buttons
    const F = await pg.evaluate(() => { openReviewPanel({ kind: 'acFha', id: acFhaData[0].fcId }); const ask = document.querySelectorAll('#review-body .anem-ask').length; const all = /anem-ask-all/.test(_buildDashReviewBucket()); closeReviewPanel(); return { ask, all }; });
    check('[F] "Ask ANEM" on the open comment (not on ANEM\'s replies) and "Address all with ANEM"', F.ask === 1 && F.all, JSON.stringify(F));

    // ---- [A] a 240-row three-tier tree: every function, full names
    await pg.evaluate(() => {
      const rows = []; let n = 1;
      for (let f = 1; f <= 10; f++) for (let s = 1; s <= 4; s++) { const sid = 'AF-' + f + '.' + s; rows.push({ internalId: 'rt' + (n++), funcId: 'AF-' + f, funcName: 'Aircraft function ' + f, funcDef: 'def', subId: sid, subName: 'Sub-function ' + sid, subDef: 'Provide ' + sid, parentSubId: '' });
        for (let l = 1; l <= 5; l++) rows.push({ internalId: 'rt' + (n++), funcId: 'AF-' + f, funcName: 'Aircraft function ' + f, funcDef: 'def', subId: sid + '.' + l, subName: 'Command the control surface for the sub-sub-function numbered ' + sid + '.' + l + ' end', subDef: 'd', parentSubId: sid }); }
      acFunctionsData.length = 0; rows.forEach(r => acFunctionsData.push(r));
      window.__q.push(JSON.stringify({ reply: 'ok', actions: [], choices: [], assumptions: [] }));
    });
    await send('Tell me about AF-10.4.5');
    const sys = await lastSys();
    check('[A] the last of 240 functions reaches ANEM, with its full name', sys.indexOf('"AF-10.4.5"') >= 0 && sys.indexOf('numbered AF-10.4.5 end') >= 0, 'prompt ' + sys.length + ' chars');

    // ---- [G] too big
    await pg.evaluate(() => { window.AiClient.messages = async () => { throw new Error('prompt is too long: 250000 tokens > 200000 maximum'); }; });
    await send('Draft everything');
    const G = await pg.evaluate(() => /more than the AI can read in one go, so nothing was sent and nothing was cut/.test(document.getElementById('anem-panel').innerText));
    check('[G] too big for the AI: a plain message, nothing cut to fit', G);
    check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  } catch (e) { check('the browser run completed', false, e && e.stack); }
  finally { try { await browser.close(); } catch (_) {} srv.close(); }
  if (!MUTATE && !process.env.NOMUT) {
    console.log('\n[mutation] each piece, put back the old way, turns the test red');
    for (const k of Object.keys(MUTS)) {
      const x = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { MUTATE: k }), encoding: 'utf8', timeout: 600000 });
      const fails = (x.stdout.match(/^  FAIL  .*$/mg) || []);
      check('mutation "' + k + '" turns the test red (' + fails.length + ' failing)', x.status === 1 && fails.length > 0, x.status + ' ' + (x.stderr || '').slice(0, 300));
    }
  }
  done();
})();
