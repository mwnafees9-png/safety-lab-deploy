/* THE SAFETY LAB API AND MCP SERVER (27 Nov 2026).
 * Waqas, 27 Nov 2026: "API and MCP yes". The connections deck is the contract: two ways to sign in (an API client for a
 * system, a personal API key for a person's scripts); read the whole project; "what a tool sends arrives as lines an engineer
 * accepts and signs. Items another tool owns cannot be changed. No special cases." MCP reads and proposes through the same
 * gate; fault trees and requirements are made by the engine.
 * The real service (customer-install/selfhost/ai-proxy/worker.js + api_v1.js), called the way a tool calls it, over a database
 * that answers the same requests the real one does. The same checks run twice: on a stand-in database in memory (everywhere),
 * and on a real Postgres built from the customer kit when one is reachable (PGHOST/PGPORT/PGUSER), which also proves the tables'
 * own rules.
 *   0  the files: the service imports api_v1.js; the customer copy and the proxy twin are the same; the migration and the kit
 *      file are the same and the kit applies it; the customer server sends the API paths to the service
 *   A  access tokens: signed, one hour, refused when changed, expired or made on another server
 *   B  the views of a project document: the deck's failure condition shape, owners, scopes, trees, traces
 *   C  signing in: client credentials; a wrong secret, a revoked client, a made-up key
 *   D  reading: only the projects the key may read; another workspace's project does not exist for it
 *   E  sending: staged in the tool's own collection; unchanged items are not staged twice; a removed item is marked, never
 *      deleted; Safety Lab's items and items an admin made Safety Lab's are refused; failure conditions cannot be sent;
 *      a bad item writes nothing; another client cannot see the collection; the project itself is never written
 *   F  a read-only key cannot send; a personal key sees what its person sees and sends only with an editing role
 *   G  the engineer's decision is shown to the tool
 *   H  MCP: initialize, tools/list, reading, proposing (staged), refusals, no stream
 *   I  the door: an unknown browser origin is refused; health says the API is there
 * Mutations (SL_API_MUTATE): noscope (a client reads every workspace), nohash (the secret is not checked), norevoke (a revoked
 * key still works), writesl (a tool overwrites Safety Lab's items), readonlysends (a read-only key sends), expired (expired
 * tokens pass), otherclient (a client sees another client's collection).
 * Run: node tests/regression_api_mcp_20261127.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), url = require('url');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? ' (' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 900) + ')' : '')); } };
const REPO = path.join(__dirname, '..'), PROXY = path.join(REPO, 'customer-install', 'selfhost', 'ai-proxy'), MUT = process.env.SL_API_MUTATE || '', EM = '\u2014';
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8');

// ---- the service under test, with one deliberate fault when asked -------------------------------------------------
function mutated() {
    let api = fs.readFileSync(path.join(PROXY, 'api_v1.js'), 'utf8');
    const rep = (a, b) => { if (api.indexOf(a) < 0) throw new Error('mutation site missing: ' + a.slice(0, 70)); api = api.split(a).join(b); };
    if (MUT === 'noscope') rep('"/projects?workspace_id=eq." + enc(client.workspace_id) + "&deleted_at=is.null', '"/projects?deleted_at=is.null');
    if (MUT === 'nohash') rep('!sameText(hash, row.secret_hash)', 'false');
    if (MUT === 'norevoke') rep('if (row.revoked_at) return { res: fail(401, "revoked"', 'if (false) return { res: fail(401, "revoked"');
    if (MUT === 'writesl') rep('if (cur.origin === "safety-lab") { res.refused.push', 'if (false) { res.refused.push');
    if (MUT === 'readonlysends') rep('if (writing && !project.can_send)', 'if (false)');
    if (MUT === 'expired') rep('!(Number(p.e) > nowMs / 1000)', 'false');
    if (MUT === 'otherclient') rep('"&client=eq." + enc(client.id) + "&name=eq."', '"&name=eq."');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slapi-'));
    fs.readdirSync(PROXY).forEach(f => { if (/\.(js|mjs)$/.test(f)) fs.copyFileSync(path.join(PROXY, f), path.join(dir, f)); });
    fs.writeFileSync(path.join(dir, 'api_v1.js'), api);
    return dir;
}

// ---- ids ----------------------------------------------------------------------------------------------------------
const U = { owner: '00000000-0000-0000-0000-0000000000a1', editor: '00000000-0000-0000-0000-0000000000a2', viewer: '00000000-0000-0000-0000-0000000000a4', outsider: '00000000-0000-0000-0000-0000000000a5', gone: '00000000-0000-0000-0000-0000000000a6' };
const WS = '11111111-1111-1111-1111-111111111111', WS2 = '11111111-1111-1111-1111-1111111111b2';
const P1 = '22222222-2222-2222-2222-222222222222', P2 = '22222222-2222-2222-2222-2222222222b2', PDEL = '22222222-2222-2222-2222-22222222222a', POUT = '33333333-3333-3333-3333-333333333333';
const C = { tool: '66666666-6666-6666-6666-666666666601', ro: '66666666-6666-6666-6666-666666666602', scoped: '66666666-6666-6666-6666-666666666603', revoked: '66666666-6666-6666-6666-666666666604', other: '66666666-6666-6666-6666-666666666605',
            pEditor: '66666666-6666-6666-6666-666666666611', pViewer: '66666666-6666-6666-6666-666666666612', pGone: '66666666-6666-6666-6666-666666666613' };
const CID = { tool: 'slc_' + 'a'.repeat(24), ro: 'slc_' + 'b'.repeat(24), scoped: 'slc_' + 'c'.repeat(24), revoked: 'slc_' + 'd'.repeat(24), other: 'slc_' + 'e'.repeat(24) };
const SEC = { tool: 'sls_tool_secret', ro: 'sls_ro_secret', scoped: 'sls_scoped_secret', revoked: 'sls_revoked_secret', other: 'sls_other_secret' };
const KEY = { pEditor: 'slk_' + '1'.repeat(64), pViewer: 'slk_' + '2'.repeat(64), pGone: 'slk_' + '3'.repeat(64) };
// one character in the middle of the signature changed (the last character of a signature carries spare bits)
const flip = t => { const i = t.lastIndexOf('.') + 10; return t.slice(0, i) + (t[i] === 'A' ? 'B' : 'A') + t.slice(i + 1); };
const sha = t => require('crypto').createHash('sha256').update(t).digest('hex');
const TOOL_ID = 'api-' + C.tool.replace(/-/g, '').slice(0, 12);

// ---- a small project document -------------------------------------------------------------------------------------
function doc() {
    return {
        projectName: 'Freighter',
        acFunctionsData: [
            { internalId: 1, funcId: 'F-3', funcName: 'Decelerate', funcDef: 'Slow the aircraft', subId: 'F-3.2', subName: 'Decelerate on landing', subDef: 'On the runway' },
            { internalId: 2, funcId: 'F-3', funcName: 'Decelerate', funcDef: 'Slow the aircraft', subId: 'F-3.2.1', subName: 'Wheel braking', subDef: '', parentSubId: 'F-3.2' },
            { internalId: 3, funcId: 'F-9', funcName: 'From Jama', funcDef: '', subId: 'F-9.1', subName: 'Jama owned', subDef: '', fnSource: { tool: 'jama-live', remoteId: 501, key: 'PRJ-501' } },
            { internalId: 4, funcId: 'F-9', funcName: 'From Jama', funcDef: '', subId: 'F-9.2', subName: 'Taken over', subDef: '', fnSource: { tool: 'jama-live', remoteId: 502, key: 'PRJ-502' } }
        ],
        acFhaData: [
            { internalId: 1001, fcId: 'FC-07', subId: 'F-3.2', subIds: ['F-3.2'], fcDesc: 'Loss of deceleration on landing', severity: 'Catastrophic', phases: 'Landing, Rollout', effAc: 'Overrun', effCrew: '', effPax: 'Fatalities', assumptionIds: ['ASM-1'] },
            { internalId: 1002, fcId: 'FC-08', subId: 'F-3.2', fcDesc: 'Asymmetric braking', severity: 'Major', phases: 'Landing' }
        ],
        acReqData: [{ internalId: 1101, id: 'REQ-1', traceId: 'FC-07', traceIds: ['FC-07'], level: 'L1', type: 'Quantitative', text: 'Shall not exceed 1E-9 per flight hour.', rat: 'Catastrophic', verifMethod: 'Analysis', verifStatus: 'Pending' }],
        acAssumptionsData: [{ asmId: 'ASM-1', text: 'Dry runway', state: 'Assumed', type: 'Operational', origin: 'AC FHA' }],
        systemsData: [{ id: 'sys-brk', name: 'Brakes', functions: [{ internalId: 7001, funcId: 'SFN-1', funcName: 'Apply brake pressure', traceIds: ['F-3.2.1'] }],
            fha: [{ internalId: 2001, fcId: 'FC-BRK01', subId: 'SFN-1', fcDesc: 'Loss of brake pressure', severity: 'Hazardous', acTraces: [1001] }],
            req: [{ internalId: 2101, traceId: 'FC-BRK01', level: 'L2', type: 'Independence', text: 'Two hydraulic sources.' }], asm: [] }],
        ftaPages: [
            { id: 'pg-fc07', name: 'PASA FC-07', treeLevel: 'aircraft', mode: 'top-down', linkedFhaIds: [1001], targetP: 1e-9,
              root: { id: 1, displayId: 'G-1', name: 'Loss of deceleration', type: 'gate', gateType: 'AND', probability: 4e-10, allocatedDAL: 'A', children: [
                  { id: 2, displayId: 'G-2', name: 'Brakes lost', type: 'gate', gateType: 'TRANSFER', linkedPageId: 'pg-brk', probability: 2e-5, children: [] },
                  { id: 3, displayId: 'E-3', name: 'Reversers lost', type: 'basic', probability: 2e-5, lambda: 1e-5, apxBudget: 2e-5, allocatedDAL: 'B' }] } },
            { id: 'pg-brk', name: 'PSSA brakes', treeLevel: 'system', systemId: 'sys-brk', mode: 'top-down', linkedFhaIds: [2001], targetP: 2e-5, root: { id: 9, displayId: 'G-9', name: 'Brake pressure lost', type: 'gate', gateType: 'OR', children: [] } }
        ],
        projectConfig: { connections: { v: 1, owners: { 'jama:502': 'sl', [TOOL_ID + ':functions:t-owned']: 'sl' }, decisions: {}, log: [] } }
    };
}

// ---- the stand-in database: answers the requests the service makes, the way the real one does ----------------------
function parseQuery(pathAndQuery) {
    const u = new url.URL('http://db' + pathAndQuery), table = u.pathname.replace(/^\//, '');
    const filters = [], opt = { order: [], limit: null, offset: 0, onConflict: null };
    u.searchParams.forEach((v, k) => {
        if (k === 'select') return;
        if (k === 'order') { opt.order = v.split(',').map(x => x.split('.')[0]); return; }
        if (k === 'limit') { opt.limit = Number(v); return; }
        if (k === 'offset') { opt.offset = Number(v); return; }
        if (k === 'on_conflict') { opt.onConflict = v.split(','); return; }
        let m;
        if ((m = /^eq\.(.*)$/s.exec(v))) filters.push({ k, op: 'eq', v: m[1] });
        else if ((m = /^in\.\((.*)\)$/s.exec(v))) filters.push({ k, op: 'in', v: m[1].split(',') });
        else if (v === 'is.null') filters.push({ k, op: 'null' });
        else throw new Error('stand-in database: unknown filter ' + k + '=' + v);
    });
    return { table, filters, opt };
}
function memoryDb() {
    const T = { api_clients: [], api_collections: [], api_items: [], projects: [], project_documents: [], workspace_members: [] }, writes = [];
    let n = 0;
    const DEF = {
        api_collections: () => ({ id: '77777777-7777-7777-7777-' + String(++n).padStart(12, '0'), title: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
        api_items: () => ({ key: '', name: '', body: '', parent_id: null, sort: 0, origin: 'tool', changed_by: 'tool', rev: 1, modified_at: new Date().toISOString(), removed_at: null, status: 'waiting', decided_rev: null, decided_at: null, decided_by: null, decided_why: null }),
        api_clients: () => ({ can_send: false, project_ids: null, user_id: null, created_at: new Date().toISOString(), last_used_at: null, revoked_at: null })
    };
    const hit = (r, f) => f.every(x => x.op === 'eq' ? String(r[x.k]) === x.v : x.op === 'in' ? x.v.indexOf(String(r[x.k])) >= 0 : r[x.k] == null);
    async function sbFetch(env, p, o) {
        o = o || {}; const q = parseQuery(p), rows = T[q.table], method = o.method || 'GET', prefer = String((o.headers && o.headers.prefer) || '');
        if (!rows) return new Response(JSON.stringify({ message: 'no table ' + q.table }), { status: 404 });
        const back = d => new Response(prefer.indexOf('return=minimal') >= 0 ? '' : JSON.stringify(d), { status: method === 'POST' ? 201 : 200 });
        if (method === 'GET') {
            let out = rows.filter(r => hit(r, q.filters));
            out = out.slice().sort((a, b) => { for (const k of q.opt.order) { if (a[k] < b[k]) return -1; if (a[k] > b[k]) return 1; } return 0; });
            out = out.slice(q.opt.offset, q.opt.limit != null ? q.opt.offset + q.opt.limit : undefined);
            return new Response(JSON.stringify(out), { status: 200 });
        }
        writes.push(method + ' ' + q.table);
        if (method === 'POST') {
            const body = JSON.parse(o.body), list = Array.isArray(body) ? body : [body], made = [];
            for (const b of list) {
                const cur = q.opt.onConflict ? rows.filter(r => q.opt.onConflict.every(k => String(r[k]) === String(b[k])))[0] : null;
                if (cur) { Object.assign(cur, b); made.push(cur); continue; }
                if (q.table === 'api_collections' && rows.some(r => r.project_id === b.project_id && r.client === b.client && r.name === b.name)) return new Response(JSON.stringify({ message: 'duplicate key' }), { status: 409 });
                const row = Object.assign((DEF[q.table] || (() => ({})))(), b); rows.push(row); made.push(row);
            }
            return back(made);
        }
        if (method === 'PATCH') { const body = JSON.parse(o.body), out = rows.filter(r => hit(r, q.filters)); out.forEach(r => Object.assign(r, body)); return back(out); }
        return new Response(JSON.stringify({ message: 'method' }), { status: 405 });
    }
    return { name: 'stand-in database', sbFetch, writes, seed: async (table, list) => { list.forEach(r => T[table].push(Object.assign((DEF[table] || (() => ({})))(), r))); }, raw: T, close: () => {} };
}

// ---- a real Postgres, built from the customer kit, answering the same requests ------------------------------------
function pgDb() {
    if (!process.env.PGHOST || !cp.spawnSync('psql', ['--version']).stdout) return null;
    const DB = 'slapi_' + process.pid, KIT = path.join(REPO, 'customer-install', 'db'), PROOF = path.join(KIT, 'tests', 'access_rules');
    const psql = (db, args, input) => cp.spawnSync('psql', ['-v', 'ON_ERROR_STOP=1', '-q', '-At', '-d', db].concat(args), { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (psql('postgres', ['-c', 'select 1']).status !== 0) return null;
    psql('postgres', ['-c', 'drop database if exists ' + DB]); if (psql('postgres', ['-c', 'create database ' + DB]).status !== 0) return null;
    const files = [path.join(KIT, 'local_stubs.sql'), path.join(PROOF, 'proof_stubs.sql')].concat(fs.readdirSync(KIT).filter(f => /^\d\d_.*\.sql$/.test(f)).sort().map(f => path.join(KIT, f)));
    for (const f of files) { const r = psql(DB, ['-f', f]); if (r.status !== 0 && !/stubs/.test(f)) { console.log('  (kit file failed: ' + path.basename(f) + ' ' + String(r.stderr).slice(0, 300) + ')'); psql('postgres', ['-c', 'drop database ' + DB]); return null; } }
    const lit = v => v == null ? 'null' : "'" + String(v).replace(/'/g, "''") + "'";
    const where = f => f.length ? ' where ' + f.map(x => x.op === 'eq' ? x.k + '::text = ' + lit(x.v) : x.op === 'in' ? x.k + '::text in (' + x.v.map(lit).join(',') + ')' : x.k + ' is null').join(' and ') : '';
    const writes = [];
    const run = sql => { const r = psql(DB, [], sql); if (r.status !== 0) return { err: String(r.stderr).trim() }; return { text: String(r.stdout).trim() }; };
    async function sbFetch(env, p, o) {
        o = o || {}; const q = parseQuery(p), method = o.method || 'GET', prefer = String((o.headers && o.headers.prefer) || '');
        if (!/^[a-z_]+$/.test(q.table)) throw new Error('table');
        let sql;
        if (method === 'GET') {
            sql = 'select coalesce(json_agg(t), \'[]\') from (select * from public.' + q.table + where(q.filters) + (q.opt.order.length ? ' order by ' + q.opt.order.join(',') : '') + (q.opt.limit != null ? ' limit ' + q.opt.limit : '') + (q.opt.offset ? ' offset ' + q.opt.offset : '') + ') t;';
        } else {
            writes.push(method + ' ' + q.table);
            const body = JSON.parse(o.body), tag = '$slj' + Math.random().toString(36).slice(2, 8) + '$';
            if (method === 'POST') {
                const list = Array.isArray(body) ? body : [body], cols = Object.keys(list[0]);
                sql = 'with ins as (insert into public.' + q.table + ' (' + cols.join(',') + ') select ' + cols.join(',') + ' from json_populate_recordset(null::public.' + q.table + ', ' + tag + JSON.stringify(list) + tag + ')' +
                    (q.opt.onConflict ? ' on conflict (' + q.opt.onConflict.join(',') + ') do update set ' + cols.filter(c => q.opt.onConflict.indexOf(c) < 0).map(c => c + ' = excluded.' + c).join(', ') : '') + ' returning *) select coalesce(json_agg(ins), \'[]\') from ins;';
            } else if (method === 'PATCH') {
                const cols = Object.keys(body);
                sql = 'with up as (update public.' + q.table + ' set (' + cols.join(',') + ') = (select ' + cols.join(',') + ' from json_populate_record(null::public.' + q.table + ', ' + tag + JSON.stringify(body) + tag + '))' + where(q.filters) + ' returning *) select coalesce(json_agg(up), \'[]\') from up;';
            } else return new Response('{}', { status: 405 });
        }
        const r = run(sql);
        if (r.err) return new Response(JSON.stringify({ message: r.err }), { status: /duplicate key|violates/.test(r.err) ? 409 : 400 });
        return new Response(method !== 'GET' && prefer.indexOf('return=minimal') >= 0 ? '' : r.text, { status: method === 'POST' ? 201 : 200 });
    }
    const users = Object.keys(U).map(k => "(" + lit(U[k]) + ", " + lit(k + '@co.test') + ")").join(',');
    const pre = run("insert into auth.users(id, email) values " + users + "; insert into public.workspaces(id, name, owner_id, is_personal) values (" + lit(WS) + ", 'Company', " + lit(U.owner) + ", false), (" + lit(WS2) + ", 'Other company', " + lit(U.outsider) + ", false);");
    if (pre.err) { console.log('  (Postgres seed failed: ' + pre.err.slice(0, 300) + ')'); psql('postgres', ['-c', 'drop database ' + DB]); return null; }
    return { name: 'Postgres built from the customer kit', sbFetch, writes, sql: run,
        seed: async (table, list) => { for (const r of list) { const res = await sbFetch({}, '/' + table, { method: 'POST', body: JSON.stringify(r) }); if (res.status >= 300) throw new Error('seed ' + table + ': ' + await res.text()); } writes.length = 0; },
        close: () => { psql('postgres', ['-c', 'drop database if exists ' + DB]); } };
}

async function seed(db) {
    await db.seed('workspace_members', [{ workspace_id: WS, user_id: U.owner, role: 'owner' }, { workspace_id: WS, user_id: U.editor, role: 'editor' }, { workspace_id: WS, user_id: U.viewer, role: 'viewer' }, { workspace_id: WS2, user_id: U.outsider, role: 'owner' }]);
    await db.seed('projects', [{ id: P1, workspace_id: WS, name: 'Freighter', cert_basis: 'Part 25' }, { id: P2, workspace_id: WS, name: 'Tanker' }, { id: PDEL, workspace_id: WS, name: 'Deleted one', deleted_at: new Date().toISOString() }, { id: POUT, workspace_id: WS2, name: 'Outsider project' }]);
    await db.seed('project_documents', [{ project_id: P1, data: doc(), version: 7 }, { project_id: POUT, data: { projectName: 'Secret', acFhaData: [{ internalId: 1, fcId: 'FC-SECRET', fcDesc: 'Secret' }] }, version: 1 }]);
    const cl = (k, extra) => Object.assign({ id: C[k], workspace_id: WS, kind: 'client', name: k, client_id: CID[k], secret_hash: sha(SEC[k]), can_send: true, created_by: U.owner }, extra || {});
    await db.seed('api_clients', [cl('tool'), cl('ro', { can_send: false }), cl('scoped', { project_ids: [P2] }), cl('revoked', { revoked_at: new Date().toISOString() }), cl('other'),
        { id: C.pEditor, workspace_id: WS, kind: 'personal', name: 'editor script', client_id: 'slk_e', secret_hash: sha(KEY.pEditor), can_send: true, user_id: U.editor, created_by: U.editor },
        { id: C.pViewer, workspace_id: WS, kind: 'personal', name: 'viewer script', client_id: 'slk_v', secret_hash: sha(KEY.pViewer), can_send: true, user_id: U.viewer, created_by: U.viewer },
        { id: C.pGone, workspace_id: WS, kind: 'personal', name: 'left the company', client_id: 'slk_g', secret_hash: sha(KEY.pGone), can_send: true, user_id: U.gone, created_by: U.gone }]);
    db.writes.length = 0;
}

async function scenario(W, db, tag) {
    const T = n => tag + ' ' + n;
    const env = { SUPABASE_URL: 'http://db.test', SUPABASE_SERVICE_ROLE_KEY: 'service-key-one', ALLOWED_ORIGINS: 'https://app.test' };
    const realFetch = globalThis.fetch;
    // the service reaches its database with fetch(SUPABASE_URL/rest/v1/...): answer those from the database under test
    globalThis.fetch = async (u, o) => { const s = String(u); if (s.indexOf(env.SUPABASE_URL + '/rest/v1') === 0) return db.sbFetch(env, s.slice((env.SUPABASE_URL + '/rest/v1').length), o); throw new Error('unexpected outside call: ' + s); };
    const call = async (method, p, o) => {
        o = o || {}; const h = Object.assign({}, o.headers || {}); if (o.token) h.authorization = 'Bearer ' + o.token; if (o.body !== undefined && !h['content-type']) h['content-type'] = 'application/json';
        const res = await W.default.fetch(new Request('https://api.test' + p, { method, headers: h, body: o.body === undefined ? undefined : (typeof o.body === 'string' ? o.body : JSON.stringify(o.body)) }), env, { waitUntil() {} });
        const text = await res.text(); let j = null; try { j = text ? JSON.parse(text) : null; } catch (_) {}
        return { status: res.status, j, text, headers: res.headers };
    };
    const tokenFor = async k => (await call('POST', '/v1/oauth/token', { body: 'grant_type=client_credentials&client_id=' + CID[k] + '&client_secret=' + SEC[k], headers: { 'content-type': 'application/x-www-form-urlencoded' } }));
    try {
        // ---- C: signing in
        const t1 = await tokenFor('tool'); const TOK = t1.j && t1.j.access_token;
        check(T('C a client signs in with its ID and secret and gets a one-hour Bearer token'), t1.status === 200 && /^sla_/.test(TOK || '') && t1.j.token_type === 'Bearer' && t1.j.expires_in === 3600, t1.text);
        const tj = await call('POST', '/v1/oauth/token', { body: { grant_type: 'client_credentials', client_id: CID.tool, client_secret: SEC.tool } });
        const tb = await call('POST', '/v1/oauth/token', { headers: { authorization: 'Basic ' + Buffer.from(CID.tool + ':' + SEC.tool).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
        check(T('C the same sign-in works as JSON and as HTTP Basic'), tj.status === 200 && /^sla_/.test(tj.j.access_token) && tb.status === 200 && /^sla_/.test(tb.j.access_token), [tj.text, tb.text]);
        const bad = await call('POST', '/v1/oauth/token', { body: { client_id: CID.tool, client_secret: 'sls_wrong' } });
        check(T('C a wrong secret is refused, saying nothing about which part was wrong'), bad.status === 401 && bad.j.error === 'invalid_client' && !/secret is wrong|unknown client/i.test(bad.text), bad.text);
        const rv = await tokenFor('revoked');
        check(T('C a revoked client cannot sign in'), rv.status === 401 && rv.j.error === 'invalid_client', rv.text);
        const nk = await call('GET', '/v1/projects', { token: 'slk_' + '9'.repeat(64) }), no = await call('GET', '/v1/projects'), junk = await call('GET', '/v1/projects', { token: 'eyJhbGciOi.a.b' });
        check(T('C no key, a made-up key and a browser session token are each refused'), no.status === 401 && nk.status === 401 && junk.status === 401, [no.status, nk.status, junk.status]);
        const tam = await call('GET', '/v1/projects', { token: flip(TOK) });
        check(T('C a changed token is refused'), tam.status === 401, tam.text);
        const A = await import(url.pathToFileURL(path.join(W.__dir, 'api_v1.js')).href);
        const expired = await A.mintToken(env, C.tool, Date.now() - 2 * 3600 * 1000), ex = await call('GET', '/v1/projects', { token: expired });
        check(T('C an expired token is refused'), ex.status === 401, ex.text);
        const foreign = await A.mintToken({ SUPABASE_SERVICE_ROLE_KEY: 'another-servers-key' }, C.tool), fr = await call('GET', '/v1/projects', { token: foreign });
        check(T('C a token made on another server is refused'), fr.status === 401, fr.text);

        // ---- D: reading
        const pl = await call('GET', '/v1/projects', { token: TOK }), names = (pl.j.data || []).map(p => p.name);
        check(T('D a client lists the projects of its workspace: not a deleted one, not another workspace\'s'), pl.status === 200 && names.join() === 'Freighter,Tanker', names);
        const sc = (await tokenFor('scoped')).j.access_token, pls = await call('GET', '/v1/projects', { token: sc });
        check(T('D a client limited to chosen projects sees only those'), pls.j.data.length === 1 && pls.j.data[0].name === 'Tanker' && (await call('GET', '/v1/projects/' + P1, { token: sc })).status === 404, pls.text);
        const outp = await call('GET', '/v1/projects/' + POUT + '/failure-conditions', { token: TOK }), nope = await call('GET', '/v1/projects/' + '99999999-9999-9999-9999-999999999999' + '/failure-conditions', { token: TOK }), del = await call('GET', '/v1/projects/' + PDEL, { token: TOK });
        check(T('D another workspace\'s project is answered exactly like one that does not exist'), outp.status === 404 && nope.status === 404 && del.status === 404 && outp.text === nope.text && !/SECRET/.test(outp.text), [outp.status, nope.status, del.status, outp.text]);
        const fc = await call('GET', '/v1/projects/' + P1 + '/failure-conditions', { token: TOK }), f7 = (fc.j.data || []).filter(x => x.id === 'FC-07')[0] || {};
        check(T('D GET /v1/projects/{project}/failure-conditions gives the deck\'s shape: id, description, severity, function, owner'), fc.status === 200 && f7.description === 'Loss of deceleration on landing' && f7.severity === 'Catastrophic' && f7.function === 'F-3.2' && f7.owner === 'safety-lab' && fc.j.project.version === 7 && fc.j.total === 3, fc.text);
        const sum = await call('GET', '/v1/projects/' + P1, { token: TOK });
        check(T('D the project answers with its name, version and counts'), sum.j.name === 'Freighter' && sum.j.version === 7 && sum.j.counts.failureConditions === 3 && sum.j.counts.faultTrees === 2 && sum.j.systems[0].id === 'sys-brk' && sum.j.canSend === true, sum.text);
        const kinds = {}; for (const k of ['functions', 'requirements', 'assumptions', 'fault-trees', 'traces']) kinds[k] = (await call('GET', '/v1/projects/' + P1 + '/' + k, { token: TOK }));
        check(T('D functions, requirements, assumptions, fault trees and traces all answer'), Object.keys(kinds).every(k => kinds[k].status === 200 && kinds[k].j.total > 0), Object.keys(kinds).map(k => k + ':' + kinds[k].status));
        const tree = await call('GET', '/v1/projects/' + P1 + '/fault-trees/pg-fc07', { token: TOK });
        check(T('D one fault tree comes nested, with its numbers'), tree.status === 200 && tree.j.tree.gate === 'AND' && tree.j.tree.children.length === 2 && tree.j.tree.children[0].transferTo === 'pg-brk' && tree.j.tree.children[1].failureRate === 1e-5 && tree.j.failureConditions[0] === 'FC-07', tree.text);
        const pg = await call('GET', '/v1/projects/' + P1 + '/failure-conditions?limit=1&offset=1&scope=aircraft', { token: TOK });
        check(T('D paging and scope'), pg.j.data.length === 1 && pg.j.data[0].id === 'FC-08' && pg.j.total === 2 && pg.j.next === null, pg.text);
        const wr = []; for (const m of ['POST', 'PUT', 'DELETE']) wr.push((await call(m, '/v1/projects/' + P1 + '/failure-conditions', { token: TOK, body: {} })).status);
        const wt = (await call('PUT', '/v1/projects/' + P1 + '/fault-trees/pg-fc07', { token: TOK, body: {} })).status;
        check(T('D the project\'s own lists and fault trees cannot be written'), wr.every(s => s === 405) && wt === 405, [wr, wt]);

        // ---- E: sending
        const base = '/v1/projects/' + P1 + '/collections';
        const noCol = await call('POST', base + '/functions/items', { token: TOK, body: { items: [{ id: 'a', name: 'x' }] } });
        check(T('E items cannot be sent to a collection that was not made'), noCol.status === 404, noCol.text);
        const mk = await call('PUT', base + '/functions', { token: TOK, body: { kind: 'functions', title: 'Functions from the tool' } }), mk2 = await call('PUT', base + '/functions', { token: TOK, body: { kind: 'requirements' } });
        check(T('E a collection is made once; what it holds cannot change'), mk.status === 201 && mk.j.kind === 'functions' && mk2.status === 409, [mk.text, mk2.text]);
        const badName = await call('PUT', base + '/Bad Name', { token: TOK, body: { kind: 'functions' } }), badKind = await call('PUT', base + '/x', { token: TOK, body: { kind: 'fault-trees' } });
        check(T('E a bad name or an unknown kind is refused'), badName.status === 400 && badKind.status === 400, [badName.status, badKind.status]);
        const items = [{ id: 't1', key: 'TF-1', name: 'Provide thrust', text: 'On demand' }, { id: 't2', key: 'TF-2', name: 'Reverse thrust', text: '', parent: 't1' }, { id: 't-owned', key: 'TF-3', name: 'Was the tool\'s', text: '' }];
        const s1 = await call('POST', base + '/functions/items', { token: TOK, body: { items } });
        check(T('E items are staged, and the answer says an engineer must accept them'), s1.status === 200 && s1.j.created === 3 && s1.j.staged === 3 && /engineer accepts/.test(s1.j.note), s1.text);
        const s2 = await call('POST', base + '/functions/items', { token: TOK, body: { items: items.slice(0, 2) } });
        check(T('E the same items again stage nothing'), s2.j.unchanged === 2 && s2.j.staged === 0, s2.text);
        const s3 = await call('PUT', base + '/functions/items/t1', { token: TOK, body: { key: 'TF-1', name: 'Provide thrust on demand', text: 'On demand' } });
        const g1 = await call('GET', base + '/functions/items/t1', { token: TOK });
        check(T('E a changed item is a new revision, waiting'), s3.status === 200 && s3.j.changed === 1 && g1.j.revision === 2 && g1.j.status === 'waiting' && g1.j.name === 'Provide thrust on demand', [s3.text, g1.text]);
        const own = await call('PUT', base + '/functions/items/t-owned', { token: TOK, body: { name: 'Tool changes it again' } });
        check(T('E an item an admin made Safety Lab the owner of cannot be changed by the tool'), own.status === 409 && own.j.error.type === 'owned_by_safety_lab', own.text);
        await db.seed('api_items', [{ collection: (await db.sbFetch(env, '/api_collections?name=eq.functions&client=eq.' + C.tool).then(r => r.json()))[0].id, item_id: 'sl-1', key: 'FC-07', name: 'Sent by Safety Lab', body: '', origin: 'safety-lab', changed_by: 'safety-lab', status: 'accepted', sort: 9 }]);
        const sl = await call('PUT', base + '/functions/items/sl-1', { token: TOK, body: { name: 'Overwritten by the tool' } }), slAfter = await call('GET', base + '/functions/items/sl-1', { token: TOK });
        check(T('E an item Safety Lab made cannot be changed or removed by the tool'), sl.status === 409 && slAfter.j.name === 'Sent by Safety Lab' && slAfter.j.origin === 'safety-lab' && (await call('DELETE', base + '/functions/items/sl-1', { token: TOK })).status === 409, [sl.text, slAfter.text]);
        const rp = await call('POST', base + '/functions/items', { token: TOK, body: { items: [items[0]].map(x => Object.assign({}, x, { name: 'Provide thrust on demand' })), replace: true } });
        const all = await call('GET', base + '/functions/items?removed=1', { token: TOK }), t2 = all.j.data.filter(x => x.id === 't2')[0], live = await call('GET', base + '/functions/items', { token: TOK });
        check(T('E replace marks what is no longer listed as removed, never deletes it, and leaves Safety Lab\'s items alone'), rp.j.removed === 1 && t2 && t2.removed === true && all.j.data.some(x => x.id === 'sl-1' && !x.removed) && all.j.data.some(x => x.id === 't-owned' && !x.removed) && !live.j.data.some(x => x.id === 't2'), [rp.text, all.text]);
        const back = await call('PUT', base + '/functions/items/t2', { token: TOK, body: { key: 'TF-2', name: 'Reverse thrust', parent: 't1' } });
        check(T('E a removed item sent again comes back'), back.j.restored === 1, back.text);
        const dl = await call('DELETE', base + '/functions/items/t2', { token: TOK }), dl2 = await call('DELETE', base + '/functions/items/t2', { token: TOK });
        check(T('E DELETE marks one item removed, once'), dl.j.removed === 1 && dl2.j.removed === 0 && /never deletes/.test(dl.j.note), [dl.text, dl2.text]);
        const before = (await call('GET', base + '/functions/items?removed=1', { token: TOK })).text;
        const b1 = await call('POST', base + '/functions/items', { token: TOK, body: { items: [{ id: 'ok', name: 'fine' }, { id: '', name: 'no id' }] } });
        const b2 = await call('POST', base + '/functions/items', { token: TOK, body: { items: [{ id: 'd', name: 'x' }, { id: 'd', name: 'y' }] } });
        const b3 = await call('POST', base + '/functions/items', { token: TOK, body: { items: Array.from({ length: 1001 }, (_, i) => ({ id: 'n' + i, name: 'n' })) } });
        const b4 = await call('POST', base + '/functions/items', { token: TOK, body: '{not json' });
        check(T('E a bad item, a repeated id, too many items or bad JSON writes nothing'), b1.status === 400 && b2.status === 400 && b3.status === 413 && b4.status === 400 && (await call('GET', base + '/functions/items?removed=1', { token: TOK })).text === before, [b1.status, b2.status, b3.status, b4.status]);
        const fcc = await call('PUT', base + '/fcs', { token: TOK, body: { kind: 'failure-conditions' } }), fcw = await call('POST', base + '/fcs/items', { token: TOK, body: { items: [{ id: 'x', name: 'A failure condition from a tool' }] } });
        check(T('E failure conditions cannot be sent: that collection only receives what Safety Lab sends'), fcc.status === 201 && fcw.status === 409 && fcw.j.error.type === 'receives_only', [fcc.text, fcw.text]);
        const OT = (await tokenFor('other')).j.access_token;
        const oc = await call('GET', base, { token: OT }), oi = await call('GET', base + '/functions/items', { token: OT }), ow = await call('PUT', base + '/functions/items/t1', { token: OT, body: { name: 'Another client writes' } });
        check(T('E another client does not see the collection and cannot write it'), oc.j.data.length === 0 && oi.status === 404 && ow.status === 404 && (await call('GET', base + '/functions/items/t1', { token: TOK })).j.name === 'Provide thrust on demand', [oc.text, oi.status, ow.status]);
        check(T('E the project and its document were never written'), !db.writes.some(w => /project_documents|projects$|workspace/.test(w)) && db.writes.some(w => /api_items/.test(w)), db.writes.filter((w, i, a) => a.indexOf(w) === i));

        // ---- F: read-only keys and personal keys
        const RO = (await tokenFor('ro')).j.access_token;
        const r1 = await call('GET', '/v1/projects/' + P1 + '/failure-conditions', { token: RO }), r2 = await call('PUT', base + '/mine', { token: RO, body: { kind: 'requirements' } }), r3 = await call('POST', base + '/functions/items', { token: RO, body: { items: [{ id: 'z', name: 'z' }] } });
        check(T('F a read-only key reads and cannot send'), r1.status === 200 && r2.status === 403 && r3.status === 403 && r2.j.error.type === 'read_only', [r1.status, r2.status, r3.status]);
        const pe = await call('GET', '/v1/projects', { token: KEY.pEditor }), pew = await call('PUT', base + '/script', { token: KEY.pEditor, body: { kind: 'requirements' } });
        check(T('F a personal key is the Bearer token as is; an editor\'s key sends'), pe.status === 200 && pe.j.data.map(p => p.name).join() === 'Freighter,Tanker' && pe.j.data[0].canSend === true && pew.status === 201, [pe.text, pew.text]);
        const pv = await call('GET', '/v1/projects', { token: KEY.pViewer }), pvw = await call('PUT', base + '/vscript', { token: KEY.pViewer, body: { kind: 'requirements' } });
        check(T('F a viewer\'s key reads but cannot send, whatever the key says'), pv.status === 200 && pv.j.data.length === 2 && pv.j.data[0].canSend === false && pvw.status === 403, [pv.text, pvw.status]);
        const pg0 = await call('GET', '/v1/projects', { token: KEY.pGone }), pg1 = await call('GET', '/v1/projects/' + P1, { token: KEY.pGone });
        check(T('F the key of someone no longer in the workspace opens nothing'), pg0.status === 200 && pg0.j.data.length === 0 && pg1.status === 404, [pg0.text, pg1.status]);
        check(T('F a personal key does not sign in at the token endpoint'), (await call('POST', '/v1/oauth/token', { body: { client_id: 'slk_e', client_secret: KEY.pEditor } })).status === 401);

        // ---- G: the decision goes back to the tool
        const colId = (await db.sbFetch(env, '/api_collections?name=eq.functions&client=eq.' + C.tool).then(r => r.json()))[0].id;
        await db.sbFetch(env, '/api_items?collection=eq.' + colId + '&item_id=eq.t1', { method: 'PATCH', body: JSON.stringify({ status: 'accepted', decided_rev: 2, decided_at: new Date().toISOString(), decided_by: 'Ed Itor', decided_why: 'Reviewed' }) });
        const d1 = await call('GET', base + '/functions/items/t1', { token: TOK });
        await call('PUT', base + '/functions/items/t1', { token: TOK, body: { key: 'TF-1', name: 'Provide thrust on demand, v3', text: 'On demand' } });
        const d2 = await call('GET', base + '/functions/items/t1', { token: TOK });
        check(T('G the tool sees an accepted item, who signed and why; a later change waits again'), d1.j.status === 'accepted' && d1.j.decision.by === 'Ed Itor' && d1.j.decision.reason === 'Reviewed' && d2.j.status === 'waiting' && !d2.j.decision && d2.j.revision === 3, [d1.text, d2.text]);

        await db.sbFetch(env, '/api_clients?id=eq.' + C.other, { method: 'PATCH', body: JSON.stringify({ revoked_at: new Date().toISOString() }) });
        const rvk = await call('GET', '/v1/projects', { token: OT });
        check(T('G a token given before its client was revoked stops working at once'), rvk.status === 401 && rvk.j.error.type === 'revoked', rvk.text);

        // ---- H: MCP
        const mcp = (body, tok) => call('POST', '/v1/mcp', { token: tok || TOK, body });
        const init = await mcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
        check(T('H initialize answers with the protocol version, tools and what the server is for'), init.status === 200 && init.j.result.protocolVersion === '2025-06-18' && init.j.result.capabilities.tools && init.j.result.serverInfo.name === 'safety-lab' && /engineer accepts/.test(init.j.result.instructions), init.text);
        const note = await mcp({ jsonrpc: '2.0', method: 'notifications/initialized' });
        check(T('H a notification is taken with no answer'), note.status === 202 && note.text === '', [note.status, note.text]);
        const tl = await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' }), tn = (tl.j.result.tools || []).map(t => t.name);
        check(T('H tools/list: reading tools and one proposing tool; none writes a fault tree, a failure condition or a number'), ['list_projects', 'list_failure_conditions', 'get_fault_tree', 'list_requirements', 'get_traces', 'propose_items', 'get_proposal_status'].every(n => tn.indexOf(n) >= 0) && tn.filter(n => /^(propose|create|update|delete|write|set)/.test(n)).join() === 'propose_items' && tl.j.result.tools.every(t => t.inputSchema && t.inputSchema.type === 'object'), tn);
        const tc = await mcp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_failure_conditions', arguments: { project: P1, severity: 'catastrophic' } } });
        check(T('H an assistant reads failure conditions'), tc.j.result.isError === false && tc.j.result.structuredContent.items.length === 1 && tc.j.result.structuredContent.items[0].id === 'FC-07' && JSON.parse(tc.j.result.content[0].text).total === 1, tc.text);
        const tp = await mcp({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'propose_items', arguments: { project: P1, collection: 'assistant-requirements', kind: 'requirements', items: [{ id: 'ar-1', name: 'Brake pressure shall be monitored.' }] } } });
        const ps = await mcp({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'get_proposal_status', arguments: { project: P1, collection: 'assistant-requirements' } } });
        check(T('H a proposal is staged like any other change, and its status can be read'), tp.j.result.isError === false && tp.j.result.structuredContent.staged === 1 && /engineer accepts/.test(tp.j.result.structuredContent.note) && ps.j.result.structuredContent.tally.waiting === 1, [tp.text, ps.text]);
        const tf = await mcp({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'propose_items', arguments: { project: P1, collection: 'fcs2', kind: 'failure-conditions', items: [{ id: 'x', name: 'x' }] } } });
        const tr = await mcp({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'propose_items', arguments: { project: P1, collection: 'c', kind: 'requirements', items: [{ id: 'x', name: 'x' }] } } }, RO);
        const to = await mcp({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'list_failure_conditions', arguments: { project: POUT } } });
        check(T('H refusals come back as tool errors: a failure condition, a read-only key, another workspace\'s project'), tf.j.result.isError === true && tr.j.result.isError === true && to.j.result.isError === true && !/SECRET/.test(to.text), [tf.text, tr.text, to.text]);
        const un = await mcp({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'write_fault_tree', arguments: {} } }), um = await mcp({ jsonrpc: '2.0', id: 10, method: 'nope' });
        check(T('H an unknown tool or method is a JSON-RPC error'), un.j.error.code === -32602 && um.j.error.code === -32601, [un.text, um.text]);
        const batch = await mcp([{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 2, method: 'tools/list' }]);
        check(T('H a batch answers each request and no notification'), Array.isArray(batch.j) && batch.j.length === 2 && batch.j[0].id === 1 && batch.j[1].id === 2, batch.text);
        check(T('H there is no stream to open and no key means no MCP'), (await call('GET', '/v1/mcp', { token: TOK })).status === 405 && (await call('POST', '/v1/mcp', { body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } })).status === 401);

        // ---- I: the door
        const org = await call('GET', '/v1/projects', { token: TOK, headers: { origin: 'https://evil.test' } }), orgOk = await call('GET', '/v1/projects', { token: TOK, headers: { origin: 'https://app.test' } });
        check(T('I a browser on an unknown origin is refused before anything is looked up'), org.status === 403 && orgOk.status === 200, [org.status, orgOk.status]);
        const hl = await call('GET', '/v1/ai/health');
        check(T('I health says the API and MCP server are there'), hl.j.features.indexOf('api') >= 0 && hl.j.features.indexOf('mcp') >= 0, hl.text);
        const noDb = await W.default.fetch(new Request('https://api.test/v1/projects', { headers: { authorization: 'Bearer ' + TOK } }), {}, {});
        check(T('I a server with no database says the API is not available'), noDb.status === 503, noDb.status);
    } finally { globalThis.fetch = realFetch; }
}

(async () => {
    // ---- 0: the files ---------------------------------------------------------------------------------------------
    const worker = read('customer-install/selfhost/ai-proxy/worker.js'), api = read('customer-install/selfhost/ai-proxy/api_v1.js');
    check('0 the service imports api_v1.js and routes the API paths to it before the /v1/ai gate', /import \{ handleApi, isApiPath \} from "\.\/api_v1\.js";/.test(worker) && worker.indexOf('if (isApiPath(url.pathname)) return handleApi(') > 0 && worker.indexOf('if (isApiPath(url.pathname)) return handleApi(') < worker.indexOf('if (!url.pathname.startsWith("/v1/ai/"))'));
    const twin = path.join(REPO, '..', 'safety-lab-proxy-deploy');
    if (fs.existsSync(path.join(twin, 'worker.js'))) check('0 the proxy twin\'s worker.js and api_v1.js are byte-identical to the customer copy', fs.readFileSync(path.join(twin, 'worker.js'), 'utf8') === worker && fs.existsSync(path.join(twin, 'api_v1.js')) && fs.readFileSync(path.join(twin, 'api_v1.js'), 'utf8') === api);
    const mig = read('supabase/migrations/20261127a_api_clients_and_collections.sql'), kit = read('customer-install/db/30_api_clients_and_collections.sql');
    check('0 the migration and the kit file 30 are the same, and the kit applies 30', mig === kit && /29_history_keeps_fullest_versions 30_api_clients_and_collections;/.test(read('customer-install/db/apply.sh')) && /30_api_clients_and_collections\.sql/.test(read('customer-install/db/README.md')));
    const caddy = read('customer-install/selfhost/Caddyfile.template');
    check('0 the customer server sends /v1/ai, /v1/oauth, /v1/projects and /v1/mcp to the service', /@safetylab_ai path \/v1\/ai\/\* \/v1\/oauth\/\* \/v1\/projects \/v1\/projects\/\* \/v1\/mcp/.test(caddy), caddy.split('\n')[3]);
    check('0 the key table gives the app nothing, and only the hash of a secret is stored', /revoke all on public\.api_clients from public, anon, authenticated;/.test(mig) && !/grant [a-z, ]+ on public\.api_clients to authenticated/.test(mig) && /encode\(sha256\(convert_to\(v_secret, 'UTF8'\)\), 'hex'\)/.test(mig) && !/secret\s+text/.test(mig.split('create table if not exists public.api_collections')[0]));
    check('0 no em dash in the new files', [api, mig, fs.readFileSync(__filename, 'utf8'), read('docs/API_MCP_DESIGN_2026-11-27.md')].every(t => t.indexOf(EM) < 0));

    const dir = mutated();
    const W = Object.assign({}, await import(url.pathToFileURL(path.join(dir, 'worker.js')).href)); W.__dir = dir;
    const A = await import(url.pathToFileURL(path.join(dir, 'api_v1.js')).href);

    // ---- A: access tokens -----------------------------------------------------------------------------------------
    const env = { SUPABASE_SERVICE_ROLE_KEY: 'k1' }, tok = await A.mintToken(env, C.tool);
    const rd = await A.readToken(env, tok);
    check('A a token names its client and lasts one hour', rd && rd.client === C.tool && Math.abs(rd.exp - (Date.now() / 1000 + 3600)) < 5, rd);
    check('A a token is refused when changed, expired, or read with another server\'s key', (await A.readToken(env, flip(tok))) === null && (await A.readToken(env, tok, Date.now() + 3601 * 1000)) === null && (await A.readToken({ SUPABASE_SERVICE_ROLE_KEY: 'k2' }, tok)) === null && (await A.readToken(env, 'sla_x.y')) === null);
    check('A the secret itself is nowhere in a token', tok.indexOf('k1') < 0 && Buffer.from(tok.slice(4).split('.')[0], 'base64url').toString().indexOf('k1') < 0);

    // ---- B: the views ---------------------------------------------------------------------------------------------
    const d = doc(), fn = A.viewFunctions(d), byId = o => Object.fromEntries(o.map(x => [x.id + '@' + x.scope, x]));
    const F = byId(fn);
    check('B functions: the tree, levels, and who owns each (a tool, or Safety Lab once an admin took it over)', F['F-3@aircraft'].level === 1 && F['F-3.2@aircraft'].parent === 'F-3' && F['F-3.2.1@aircraft'].parent === 'F-3.2' && F['F-3.2.1@aircraft'].level === 3 && F['F-9.1@aircraft'].owner === 'jama' && F['F-9.1@aircraft'].source.key === 'PRJ-501' && F['F-9.2@aircraft'].owner === 'safety-lab' && F['SFN-1@sys-brk'].traces[0] === 'F-3.2.1' && fn.filter(x => x.id === 'F-3').length === 1, fn);
    const fcs = A.viewFailureConditions(d), FC = byId(fcs);
    check('B failure conditions: the deck\'s shape, effects, phases, and a system line\'s aircraft failure condition', JSON.stringify(Object.keys(FC['FC-07@aircraft']).slice(0, 4)) === '["id","description","severity","function"]' && FC['FC-07@aircraft'].phases.join() === 'Landing,Rollout' && FC['FC-07@aircraft'].effects.aircraft === 'Overrun' && !('crew' in FC['FC-07@aircraft'].effects) && FC['FC-BRK01@sys-brk'].aircraftFailureConditions[0] === 'FC-07' && FC['FC-BRK01@sys-brk'].system === 'Brakes', fcs);
    const rq = A.viewRequirements(d), as = A.viewAssumptions(d);
    check('B requirements and assumptions, aircraft and system; a requirement with no id still has one', rq.length === 2 && rq[0].traces[0] === 'FC-07' && rq[0].verification.method === 'Analysis' && rq[1].id === 'REQ-2101' && rq[1].scope === 'sys-brk' && as.length === 1 && as[0].state === 'Assumed', [rq, as]);
    const ft = A.viewFaultTrees(d), one = A.viewFaultTree(d, 'pg-fc07', 1);
    check('B fault trees: list, scope, numbers; depth cuts a tree and says how much was cut', ft.length === 2 && ft[0].failureConditions[0] === 'FC-07' && ft[0].top.probability === 4e-10 && ft[0].nodes === 3 && ft[1].scope === 'sys-brk' && A.viewFaultTrees(d, 'sys-brk').length === 1 && one.tree.childrenOmitted === 2 && A.viewFaultTree(d, 'nope') === null, [ft, one]);
    const tr = A.viewTraces(d), types = tr.map(t => t.type).filter((x, i, a) => a.indexOf(x) === i).sort();
    check('B traces: every kind of link', types.join() === 'failure-condition-to-assumption,failure-condition-to-fault-tree,function-to-failure-condition,requirement-to-failure-condition,system-to-aircraft-failure-condition,system-to-aircraft-function' && tr.some(t => t.type === 'system-to-aircraft-failure-condition' && t.from.id === 'FC-BRK01' && t.to.id === 'FC-07' && t.to.scope === 'aircraft'), types);
    check('B an empty or odd document answers with empty lists, never an error', A.viewFunctions({}).length === 0 && A.viewTraces({ acFhaData: [null, {}], ftaPages: [null, {}] }).length === 0 && A.viewSummary({}).counts.faultTrees === 0);
    const plan = A.planWrite([{ item_id: 'a', key: 'a', name: 'A', body: '', parent_id: null, sort: 1, rev: 4, origin: 'tool', removed_at: null }, { item_id: 's', key: 's', name: 'S', body: '', parent_id: null, sort: 2, rev: 1, origin: 'safety-lab', removed_at: null }],
        [{ id: 'a', key: 'a', name: 'A2', text: '', parent: null, sort: null }, { id: 's', key: 's', name: 'S2', text: '', parent: null, sort: null }, { id: 'n', key: 'n', name: 'N', text: '', parent: null, sort: null }], true, new Set(), 'now');
    check('B the write plan: a change is the next revision, a new item is revision 1, Safety Lab\'s item is refused and not removed', plan.res.changed === 1 && plan.res.created === 1 && plan.res.refused.length === 1 && plan.res.removed === 0 && plan.rows.filter(r => r.item_id === 'a')[0].rev === 5 && plan.rows.filter(r => r.item_id === 'n')[0].sort === 3 && !plan.rows.some(r => r.item_id === 's'), plan);
    check('B the tool id of a client is the same on the server and in the app', A.toolIdOf(C.tool) === TOOL_ID && A.slOwnedIds(d, TOOL_ID, 'functions').has('t-owned') && !A.slOwnedIds(d, TOOL_ID, 'requirements').has('t-owned') && !A.slOwnedIds(d, 'jama', '').has('502'));

    // ---- C to I: the same scenario on each database ---------------------------------------------------------------
    const mem = memoryDb(); await seed(mem); await scenario(W, mem, '[stand-in]');
    const pg = pgDb();
    if (!pg) console.log('  SKIP  the same checks on a real Postgres (no psql or no reachable server: set PGHOST, PGPORT, PGUSER)');
    else { try { await seed(pg); await scenario(W, pg, '[Postgres]'); } catch (e) { check('[Postgres] the scenario ran', false, String((e && e.stack) || e)); } finally { pg.close(); } }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? ' (mutation: ' + MUT + ')' : ''));
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
