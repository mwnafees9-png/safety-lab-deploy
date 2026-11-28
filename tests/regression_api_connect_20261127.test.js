/* THE SAFETY LAB API IN THE APP: KEYS, AND AN API CLIENT AS A CONNECTED TOOL (27 Nov 2026).
 * Waqas, 27 Nov 2026: "API and MCP yes". "What a tool sends arrives as lines an engineer accepts and signs. Items another tool
 * owns cannot be changed. No special cases."
 * In the real app, with a stand-in for the server's functions (the same names and answers as the migration's):
 *   0  the files: api_connect.js 1.0 after alm_engine.js 1.1 and connections.js 1.2; no em dash
 *   A  the keys card on the Connections page: the API and MCP addresses, the keys folded behind their count, who may make what
 *   B  making a key: the secret is shown once and is nowhere in the page afterwards
 *   C  an API client that keeps collections in the project is a connected tool, and says what is not linked yet
 *   D  linking: the collection's kind is offered; a check stages lines; what Safety Lab itself sent is never staged back
 *   E  nothing is in the analysis before an engineer signs
 *   F  accepted and signed: the rows are there, marked as the tool's, locked; the tool is told (accepted, who, why)
 *   G  a change in the tool is a new line; rejected, the row stays as it was and the tool is told why
 *   H  an item the tool removed is flagged as missing, never deleted
 *   I  an item an admin made Safety Lab's is sent from Ready to send at the revision last read; if the tool changed it
 *      since, it is held back
 *   J  a project kept as a file: the tool says why it cannot be reached
 *   Z  no page errors
 * Mutations (SL_APICX_MUTATE): echo (what Safety Lab sent is staged back as the tool's), notell (the tool is not told the
 * decision), norev (a send does not say which revision it read), nolabel (the tool's name is not kept with the project).
 * Run: node --no-maglev --no-concurrent-sparkplug tests/regression_api_connect_20261127.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? ' (' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 1200) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site'), MUT = process.env.SL_APICX_MUTATE || '', EM = '\u2014';
function mutate(file, body) {
    if (!MUT) return body;
    const rep = (a, b) => { if (body.indexOf(a) < 0) throw new Error('mutation site missing: ' + a.slice(0, 80)); body = body.split(a).join(b); };
    if (MUT === 'echo' && file === 'api_connect.js') rep("if (it.origin !== 'tool' || it.removed) return;", 'if (it.removed) return;');
    if (MUT === 'notell' && file === 'connections.js') { rep("_tell(rejDone, 'rejected', signer, reason);", ''); rep("_tell(byTool[tool], 'accepted', signer, reason);", ''); }
    if (MUT === 'norev' && file === 'api_connect.js') rep('p_expect_rev: now._rev', 'p_expect_rev: null');
    if (MUT === 'nolabel' && file === 'api_connect.js') rep('{ label: s.name, client: s.client }', '{ client: s.client }');
    return body;
}
function done() { console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? ' (mutation: ' + MUT + ')' : '')); process.exit(fail ? 1 : 0); }
(async () => {
    const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'), src = f => fs.readFileSync(path.join(SITE, f), 'utf8'), at = s => HTML.indexOf(s);
    check('0 api_connect.js 1.0 loads after alm_engine.js 1.2 and connections.js 1.3', at('api_connect.js?v=1.0"') > at('alm_engine.js?v=1.2"') && at('alm_engine.js?v=1.2"') > at('connections.js?v=1.3"') && at('connections.js?v=1.3"') > 0);
    check('0 no em dash in api_connect.js or this test', src('api_connect.js').indexOf(EM) < 0 && fs.readFileSync(__filename, 'utf8').indexOf(EM) < 0);
    let pw; try { pw = require('playwright'); } catch (_) { console.log('  SKIP  browser checks'); return done(); }
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
    const srv = http.createServer((q, r) => {
        let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
        const f = path.join(SITE, path.normalize(p)); let b;
        try { if (fs.statSync(f).isDirectory()) throw 0; b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); }
        const base = path.basename(f); if (/\.js$/.test(base)) b = Buffer.from(mutate(base, b.toString('utf8')));
        r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); r.end(b);
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const brw = await pw.chromium.launch(), errs = [], tick = ms => new Promise(r => setTimeout(r, ms));
    try {
        const pg = await (await brw.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
        pg.on('pageerror', e => errs.push(String(e).slice(0, 300))); pg.on('dialog', d => d.accept().catch(() => {}));
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await tick(5000);
        await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
        await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
        await pg.evaluate(async () => { await loadHL1Demo(); }); await tick(4000);

        // ---- the stand-in server: the migration's functions, by name --------------------------------------------------
        await pg.evaluate(() => {
            const CL = '66666666-6666-6666-6666-666666666601';
            const F = window.__fake = { role: 'owner', pid: 'p1', signed: true, calls: [], n: 0,
                clients: [{ id: CL, kind: 'client', name: 'Requirements tool', client_id: 'slc_aaaaaaaaaaaaaaaaaaaaaaaa', can_send: true, project_ids: null, mine: true, created_at: '2026-11-20T00:00:00Z', last_used_at: '2026-11-26T00:00:00Z', revoked_at: null },
                          { id: 'old', kind: 'client', name: 'Retired tool', client_id: 'slc_bbbbbbbbbbbbbbbbbbbbbbbb', can_send: false, project_ids: null, mine: false, created_at: '2026-10-01T00:00:00Z', last_used_at: null, revoked_at: '2026-11-01T00:00:00Z' }],
                cols: [{ id: 'col-fn', client: CL, name: 'functions', kind: 'functions', title: 'Functions from the tool' }, { id: 'col-req', client: CL, name: 'requirements', kind: 'requirements', title: '' }],
                items: [
                    { c: 'col-fn', id: 't1', key: 'TF-1', name: 'Provide ground deceleration', text: 'Top function', parentId: null, sort: 1, origin: 'tool', rev: 1, removed: false, status: 'waiting' },
                    { c: 'col-fn', id: 't2', key: 'TF-1.1', name: 'Wheel braking', text: 'Under TF-1', parentId: 't1', sort: 2, origin: 'tool', rev: 1, removed: false, status: 'waiting' },
                    { c: 'col-fn', id: 't3', key: 'TF-1.2', name: 'Thrust reversal', text: 'Under TF-1', parentId: 't1', sort: 3, origin: 'tool', rev: 1, removed: false, status: 'waiting' },
                    { c: 'col-fn', id: 'sl-9', key: 'FC-07', name: 'A failure condition Safety Lab sent', text: '', parentId: null, sort: 9, origin: 'safety-lab', rev: 1, removed: false, status: 'accepted' },
                    { c: 'col-req', id: 'r1', key: 'TR-1', name: 'Brake pressure shall be monitored.', text: 'Brake pressure shall be monitored.', parentId: null, sort: 1, origin: 'tool', rev: 1, removed: false, status: 'waiting' }]
            };
            const impl = { 
                api_client_list: () => F.clients.filter(k => F.role === 'owner' || k.mine),
                api_client_create: a => { if (a.p_kind === 'client' && F.role !== 'owner') throw new Error('only a workspace admin can make an API client'); const id = 'new' + (++F.n), row = { id, kind: a.p_kind, name: a.p_name, client_id: (a.p_kind === 'client' ? 'slc_' : 'slk_') + 'c'.repeat(24), can_send: !!a.p_can_send, project_ids: a.p_projects, mine: true, created_at: new Date().toISOString(), last_used_at: null, revoked_at: null }; F.clients.unshift(row); return [{ id, client_id: row.client_id, secret: (a.p_kind === 'client' ? 'sls_' : 'slk_') + 'SECRETSECRETSECRET' + F.n }]; },
                api_client_revoke: a => { const k = F.clients.find(x => x.id === a.p_id); k.revoked_at = new Date().toISOString(); return null; },
                api_sources: a => a.p_project !== F.pid ? [] : F.clients.filter(k => F.cols.some(c => c.client === k.id)).map(k => ({ client: k.id, name: k.name, kind: k.kind, can_send: k.can_send, revoked: !!k.revoked_at, collections: F.cols.filter(c => c.client === k.id).map(c => ({ id: c.id, name: c.name, kind: c.kind, title: c.title, items: F.items.filter(i => i.c === c.id && !i.removed && i.origin === 'tool').length })) })),
                api_collection_items: a => F.items.filter(i => i.c === a.p_collection).map(i => ({ id: i.id, key: i.key, name: i.name, text: i.text, parentId: i.parentId, sort: i.sort, origin: i.origin, changedBy: 'tool', rev: i.rev, modified: '', removed: i.removed, status: i.status })),
                api_items_decide: a => { let n = 0; F.items.forEach(i => { if (i.c === a.p_collection && a.p_ids.indexOf(i.id) >= 0) { i.status = a.p_status; i.by = a.p_by; i.why = a.p_why; n++; } }); return n; },
                api_item_send: a => { if (!a.p_item_id) { const id = 'sl-' + (++F.n); F.items.push({ c: a.p_collection, id, key: a.p_key, name: a.p_name, text: a.p_body, parentId: null, sort: 99, origin: 'safety-lab', rev: 1, removed: false, status: 'accepted' }); return { result: 'created', id, key: a.p_key, rev: 1 }; }
                    const i = F.items.find(x => x.c === a.p_collection && x.id === a.p_item_id); if (!i || i.removed) return { result: 'gone' }; if (a.p_expect_rev == null || i.rev !== a.p_expect_rev) return { result: 'held', rev: i.rev }; i.name = a.p_name; i.text = a.p_body; i.rev++; i.changedBy = 'safety-lab'; return { result: 'updated', id: i.id, rev: i.rev }; },
                api_collection_make: a => { const id = 'col-' + (++F.n); F.cols.push({ id, client: a.p_client, name: a.p_name, kind: a.p_kind, title: a.p_title }); return id; }
            };
            const E = SLApi._env;
            E.client = () => ({ rpc: async (n, a) => { F.calls.push({ n, a: JSON.parse(JSON.stringify(a || {})) }); try { if (!impl[n]) throw new Error('no function ' + n); return { data: impl[n](a || {}), error: null }; } catch (e) { return { data: null, error: { message: e.message } }; } } });
            E.projectId = () => F.pid; E.workspace = () => ({ id: 'w1', name: 'Company', myRole: F.role }); E.signedIn = () => F.signed;
        });
        const TID = 'api-666666666666';
        const page = async () => { await pg.evaluate(() => { switchTab('conn'); SLConnections.show('main'); }); await tick(900); return pg.evaluate(() => (document.getElementById('conn-host') || document.body).innerHTML); };

        // ---- A: the keys card --------------------------------------------------------------------------------------------
        let h = await page();
        const base = await pg.evaluate(() => SLApi.apiBase());
        check('A the card gives the API address and the MCP address of this install', /Safety Lab API and MCP server/.test(h) && /\/v1$/.test(base) && h.indexOf(base) > 0 && h.indexOf(base + '/mcp') > 0, base);
        check('A keys in use and revoked keys are folded lists with their counts; a revoked key has no Revoke button', /<details open=""><summary>Keys in use \(1\)<\/summary>/.test(h) && /<details><summary>Revoked keys \(1\)<\/summary>/.test(h) && /Requirements tool/.test(h) && (h.match(/SLApi\.revoke\(/g) || []).length === 1, h.slice(h.indexOf('api-card'), h.indexOf('api-card') + 1500));
        check('A an admin can make an API client or a personal key; the card says what a tool can and cannot do', /SLApi\.newKey\('client'\)/.test(h) && /SLApi\.newKey\('personal'\)/.test(h) && /waits in Incoming changes for an engineer to accept and sign/.test(h) && /Items another tool owns cannot be changed/.test(h));
        await pg.evaluate(() => { __fake.role = 'viewer'; SLApi.load(true); }); await pg.evaluate(() => new Promise(r => setTimeout(r, 100)));
        await pg.evaluate(() => { SLConnections.render(); }); await tick(300);
        const hv = await pg.evaluate(() => { SLApi.newKey('personal'); const m = document.getElementById('api-pop').innerHTML; SLApi.close(); return (document.getElementById('api-card') || {}).innerHTML + '|||' + m; });
        check('A a viewer is offered a personal key only, and it reads only', !/SLApi\.newKey\('client'\)/.test(hv.split('|||')[0]) && /SLApi\.newKey\('personal'\)/.test(hv.split('|||')[0]) && /made by a workspace admin/.test(hv) && /your key reads only/.test(hv.split('|||')[1]) && !/value="1"/.test(hv.split('|||')[1]), hv.slice(0, 600));
        await pg.evaluate(() => { __fake.role = 'owner'; }); 

        // ---- B: making a key ---------------------------------------------------------------------------------------------
        const made = await pg.evaluate(async () => {
            SLApi.newKey('client'); document.getElementById('api-name').value = 'Violet'; document.querySelector('input[name="api-send"][value="1"]').checked = true; document.getElementById('api-one').checked = true;
            await SLApi.create('client');
            const pop = document.getElementById('api-pop'), o = { shown: pop.innerHTML, secret: document.getElementById('api-secret').value, cid: document.getElementById('api-cid').value, call: __fake.calls.filter(c => c.n === 'api_client_create').pop().a };
            SLApi.close(); await new Promise(r => setTimeout(r, 400));
            o.after = document.body.innerHTML.indexOf(o.secret) >= 0; o.inProject = JSON.stringify(SLStores.snapshot()).indexOf(o.secret) >= 0; o.store = JSON.stringify(Object.assign({}, localStorage)).indexOf(o.secret) >= 0;
            o.card = document.getElementById('api-card').innerHTML;
            return o;
        });
        check('B the key is made as asked: an API client, reads and sends, this project only', made.call.p_kind === 'client' && made.call.p_name === 'Violet' && made.call.p_can_send === true && JSON.stringify(made.call.p_projects) === '["p1"]' && made.call.p_workspace === 'w1', made.call);
        check('B the client ID and the secret are shown once, with what to do with them', /^sls_/.test(made.secret) && /^slc_/.test(made.cid) && /shown once/.test(made.shown) && /\/oauth\/token/.test(made.shown) && /Authorization: Bearer/.test(made.shown));
        check('B after closing, the secret is nowhere: not on the page, not in the project, not in browser storage', made.after === false && made.inProject === false && made.store === false && /Violet/.test(made.card) && /Keys in use \(2\)/.test(made.card), [made.after, made.inProject, made.store]);
        const empty = await pg.evaluate(async () => { SLApi.newKey('personal'); await SLApi.create('personal'); const e = document.getElementById('api-err').textContent; SLApi.close(); return e; });
        check('B a key needs a name', /name/i.test(empty), empty);
        const rv = await pg.evaluate(async () => { window.slConfirm = async () => true;   /* the app's own yes/no box: answered yes */ const id = __fake.clients.find(k => k.name === 'Violet').id; await SLApi.revoke(id); await new Promise(r => setTimeout(r, 500)); return { call: __fake.calls.some(c => c.n === 'api_client_revoke' && c.a.p_id === id), card: document.getElementById('api-card').innerHTML }; });
        check('B a key is revoked from the card and moves to the revoked list', rv.call && /Keys in use \(1\)/.test(rv.card) && /Revoked keys \(2\)/.test(rv.card), rv.card.slice(0, 400));

        // ---- C: the tool appears -----------------------------------------------------------------------------------------
        await pg.evaluate(() => SLApi.load(true)); h = await page();
        const C1 = await pg.evaluate(TID => ({ tool: !!SLAlm.tool(TID), listed: SLConnections.TOOLS.filter(t => t.id === TID).map(t => t.label + '|' + t.how)[0], on: SLConnections.connected().some(t => t.id === TID), warn: SLConnections.adapter(TID).warnings(), where: SLConnections.adapter(TID).where(), kept: (projectConfig.almTools || {})[TID] }), TID);
        check('C an API client with collections in the project is a connected tool, named, on the same engine', C1.tool && C1.listed === 'Requirements tool|Safety Lab API' && C1.on && /Safety Lab API, an API client/.test(C1.where) && /<h4>Requirements tool<\/h4><span class="cx-pill ok">Connected<\/span>/.test(h), C1);
        check('C its card says which collections are not linked yet; its name is kept with the project', C1.warn.length === 2 && /Functions from the tool/.test(C1.warn[0]) && /not linked yet/.test(C1.warn[0]) && C1.kept && C1.kept.label === 'Requirements tool', C1);

        // ---- D, E: linking and staging -----------------------------------------------------------------------------------
        const D = await pg.evaluate(async TID => {
            SLConnections.browse(TID); await new Promise(r => setTimeout(r, 500));
            const rows = [...document.querySelectorAll('#alm-browse .alm-pick')], kinds = rows.map(r => r.getAttribute('data-name') + ':' + r.querySelector('.alm-kind').value);
            rows.forEach(r => { r.querySelector('.alm-on').checked = true; });
            SLAlm.ui(TID).savePicks(); await new Promise(r => setTimeout(r, 1500));
            const inc = SLConnections.incoming(TID);
            return { kinds, n: inc.length, lines: inc.map(c => c.kind + '|' + c.change + '|' + c.remoteId + '|' + c.name), before: acFunctionsData.filter(r => r.fnSource && r.fnSource.tool === TID).length + acReqData.filter(r => r.reqSource && r.reqSource.tool === TID).length, picks: SLAlm.tool(TID).cfg().picks, warn: SLConnections.adapter(TID).warnings() };
        }, TID);
        check('D choosing what is linked offers each collection with what it holds', D.kinds.join() === 'Functions from the tool:fn,requirements:req' && D.picks.length === 2, D);
        check('D a check stages the tool\'s items as lines, each known by its collection and the tool\'s own id', D.n >= 3 && D.lines.some(l => /^fn\|added\|functions:t2\|Wheel braking/.test(l)) && D.lines.some(l => /^fn\|added\|functions:t3\|/.test(l)) && D.lines.some(l => /^req\|added\|requirements:r1\|/.test(l)) && D.warn.length === 0, D.lines);
        check('D what Safety Lab itself sent to the tool is never staged back', !D.lines.some(l => /sl-9|A failure condition Safety Lab sent/.test(l)), D.lines);
        check('E nothing is in the analysis before an engineer signs', D.before === 0, D.before);

        // ---- F: accepted and signed --------------------------------------------------------------------------------------
        const Fx = await pg.evaluate(async TID => {
            const keys = SLConnections.incoming(TID).map(c => c.key), r = SLConnections.decide({ accept: keys }, 'Ed Itor', 'Reviewed with the tool owner');
            await new Promise(r2 => setTimeout(r2, 600));
            const fn = acFunctionsData.filter(x => x.fnSource && x.fnSource.tool === TID), rq = acReqData.filter(x => x.reqSource && x.reqSource.tool === TID);
            const t2 = fn.find(x => x.fnSource.remoteId === 'functions:t2');
            const told = __fake.calls.filter(c => c.n === 'api_items_decide');
            return { r, fn: fn.map(x => x.funcId + '/' + x.subId + '/' + x.subName + '/' + x.fnSource.remoteId), rq: rq.map(x => x.id + '/' + x.text + '/' + x.reqSource.remoteId), left: SLConnections.incoming(TID).length,
                lock: t2 ? SLConnections.lockOf(t2, 'fn') : null, told: told.map(c => c.a), status: __fake.items.filter(i => i.origin === 'tool').map(i => i.id + ':' + i.status + ':' + (i.by || '')),
                hist: (projectConfig.connections.log || []).filter(e => e.tool === TID && e.what === 'signed').map(e => e.signedBy + '|' + e.why)[0] };
        }, TID);
        check('F signed lines enter the analysis: functions under their parent, the requirement, each marked as the tool\'s', Fx.r.ok && Fx.left === 0 && Fx.fn.some(x => /TF-1\/TF-1\.1\/Wheel braking\/functions:t2/.test(x)) && Fx.fn.some(x => /functions:t3/.test(x)) && Fx.rq.join() === 'TR-1/Brake pressure shall be monitored./requirements:r1', Fx);
        check('F a row the tool owns is locked in Safety Lab, and says whose it is', Fx.lock && Fx.lock.tool === TID && Fx.lock.toolLabel === 'Requirements tool' && Fx.lock.fields.indexOf('subName') >= 0, Fx.lock);
        check('F the tool is told what was decided: accepted, by whom, why; and it is in History, signed', Fx.told.length >= 2 && Fx.told.every(a => a.p_status === 'accepted' && a.p_by === 'Ed Itor' && a.p_why === 'Reviewed with the tool owner') && Fx.told.some(a => a.p_collection === 'col-fn' && a.p_ids.indexOf('t2') >= 0) && Fx.told.some(a => a.p_collection === 'col-req' && a.p_ids.join() === 'r1') && Fx.status.filter(s => /:accepted:Ed Itor/.test(s)).length >= 3 && Fx.hist === 'Ed Itor|Reviewed with the tool owner', Fx);

        // ---- G: a change in the tool, rejected ---------------------------------------------------------------------------
        const G = await pg.evaluate(async TID => {
            const it = __fake.items.find(i => i.id === 't2'); it.name = 'Wheel braking, anti-skid'; it.rev = 2; it.status = 'waiting';
            await SLAlm.tool(TID).check(true); await new Promise(r => setTimeout(r, 300));
            const inc = SLConnections.incoming(TID), n0 = __fake.calls.length;
            const r = SLConnections.decide({ reject: inc.map(c => c.key) }, 'Ed Itor', 'Anti-skid is a system function'); await new Promise(r2 => setTimeout(r2, 400));
            const row = acFunctionsData.find(x => x.fnSource && x.fnSource.remoteId === 'functions:t2');
            await SLAlm.tool(TID).check(true); await new Promise(r2 => setTimeout(r2, 300));
            return { lines: inc.map(c => c.change + '|' + c.remoteId + '|' + JSON.stringify(c.after)), r, name: row.subName, told: __fake.calls.slice(n0).filter(c => c.n === 'api_items_decide').map(c => c.a), again: SLConnections.incoming(TID).length, status: it.status + ':' + it.why };
        }, TID);
        check('G a change in the tool is one line, with what it would become', G.lines.length === 1 && /^changed\|functions:t2\|/.test(G.lines[0]) && /anti-skid/.test(G.lines[0]), G.lines);
        check('G rejected: the row stays as it was, the tool is told why, and the line does not come back', G.r.ok && G.name === 'Wheel braking' && G.told.length === 1 && G.told[0].p_status === 'rejected' && G.told[0].p_why === 'Anti-skid is a system function' && G.told[0].p_ids.join() === 't2' && G.again === 0 && G.status === 'rejected:Anti-skid is a system function', G);

        // ---- H: removed in the tool --------------------------------------------------------------------------------------
        const H = await pg.evaluate(async TID => {
            __fake.items.find(i => i.id === 't3').removed = true;
            await SLAlm.tool(TID).check(true); await new Promise(r => setTimeout(r, 300));
            const inc = SLConnections.incoming(TID), n = acFunctionsData.length;
            const r = SLConnections.decide({ accept: inc.map(c => c.key) }, 'Ed Itor', 'Seen'); await new Promise(r2 => setTimeout(r2, 300));
            const row = acFunctionsData.find(x => x.fnSource && x.fnSource.remoteId === 'functions:t3');
            return { lines: inc.map(c => c.change + '|' + c.remoteId), r, still: !!row, flagged: row && row.fnSource.missingInSource === true, same: acFunctionsData.length === n };
        }, TID);
        check('H an item the tool removed is a "removed" line; signed, the row is flagged as missing and never deleted', H.lines.join() === 'removed|functions:t3' && H.r.ok && H.still && H.flagged && H.same, H);

        // ---- I: Safety Lab owns an item and sends its version ------------------------------------------------------------
        const I = await pg.evaluate(async TID => {
            const T = SLAlm.tool(TID), o = {};
            // put the tool's item back in step first (the rejected change is still the tool's version)
            const it = __fake.items.find(i => i.id === 'r1');
            o.owner = SLConnections.setOwner(TID, ['requirements:r1'], 'sl', 'Safety owns this requirement now');
            const row = acReqData.find(x => x.reqSource && x.reqSource.remoteId === 'requirements:r1');
            o.unlocked = SLConnections.lockOf(row, 'req') === null;
            SLConnections.background(() => { row.text = 'Brake pressure shall be monitored and annunciated.'; });
            await T.check(true); await new Promise(r => setTimeout(r, 300));
            const out = T.outgoing().filter(l => l.remoteId === 'requirements:r1'); o.out = out.length;
            // the tool changes the item between the check and the send: held back
            it.rev = 5; it.name = 'The tool changed it meanwhile'; it.text = it.name;
            const held = await T.send(out, 'Ed Itor', 'Send our wording'); o.held = held; o.afterHeld = it.name;
            await T.check(true); await new Promise(r => setTimeout(r, 300));
            const out2 = T.outgoing().filter(l => l.remoteId === 'requirements:r1'), n0 = __fake.calls.length;
            const sent = await T.send(out2, 'Ed Itor', 'Send our wording'); o.sent = sent;
            o.call = __fake.calls.slice(n0).filter(c => c.n === 'api_item_send').map(c => c.a)[0]; o.toolNow = it.name + '|' + it.text.split('\n')[0] + '|' + it.rev + '|' + it.changedBy;
            return o;
        }, TID);
        check('I an admin makes Safety Lab the owner: the row unlocks and its edit waits in Ready to send', I.owner.ok && I.unlocked && I.out === 1, I);
        check('I if the tool changed the item since the check, the send is held back and nothing is overwritten', I.held && I.held.sent === 0 && I.held.held.length === 1 && I.afterHeld === 'The tool changed it meanwhile', I.held);
        check('I after a fresh check the send goes through, at the revision that was read', I.sent && I.sent.sent === 1 && I.call && I.call.p_item_id === 'r1' && I.call.p_collection === 'col-req' && I.call.p_expect_rev === 5 && /annunciated/.test(I.toolNow) && /\|6\|safety-lab$/.test(I.toolNow), [I.sent, I.call, I.toolNow]);

        // ---- J: a project kept as a file ---------------------------------------------------------------------------------
        const J = await pg.evaluate(async TID => { __fake.pid = ''; let err = ''; try { await SLAlm.tool(TID).check(true); } catch (e) { err = e.message; } __fake.signed = false; SLConnections.render(); await new Promise(r => setTimeout(r, 200)); const card = document.getElementById('api-card').innerHTML; __fake.signed = true; __fake.pid = 'p1'; return { err, card, label: SLConnections.TOOLS.find(t => t.id === TID).label }; }, TID);
        check('J a project kept as a file: the tool says why it cannot be reached; signed out, the card says to sign in', /kept as a file/.test(J.err) && /Sign in to make a key/.test(J.card) && !/SLApi\.newKey/.test(J.card) && J.label === 'Requirements tool', J);
        const lbl = await pg.evaluate(TID => { const saved = SLConnections.TOOLS.splice(SLConnections.TOOLS.findIndex(t => t.id === TID), 1); const row = acFunctionsData.find(x => x.fnSource && x.fnSource.tool === TID); const l = SLConnections.lockOf(row, 'fn'); SLConnections.TOOLS.push(saved[0]); return l && l.toolLabel; }, TID);
        check('J a linked row still says whose it is when the server has not been asked (the name is kept with the project)', lbl === 'Requirements tool', lbl);
        check('Z no page errors', errs.length === 0, errs);
    } catch (e) { check('the run completed', false, String((e && e.stack) || e)); }
    await brw.close(); srv.close(); done();
})();
