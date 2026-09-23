#!/usr/bin/env node
/*
 * Regression — the audit trail behind every AI draft (23 Sep 2026, standards
 * gap G10; position: the AI is advisory only).
 *
 *   A1  the call log: one entry per call with model, prompt version, input and
 *       output fingerprints and outcome; the raw text is kept only for the
 *       most recent calls; entries beyond the cap are counted, never silently lost
 *   A2  matching a row to the call that drafted it: by feature, by the batch's
 *       purpose (rows 'fha.populate' ← calls 'chat.edit' drafting 'fha'), latest
 *       at or before the row, failed calls never
 *   A3  per artifact: the original as drafted; every edit with who / what /
 *       from / to, replayed in order; fields the app computes are never
 *       counted as edits; a fault tree's edits are its structure, not numbers
 *   A4  a row drafted before the audit trail is labelled as such (text "as
 *       first seen"), never passed off as the AI's original
 *   A5  EXECUTED — the real Provider.complete (ai_assistant.js in a sandbox)
 *       logs a successful call and a failed one, and still throws the failure
 *   A6  EXECUTED — the real makeCRUD: editing an AI row through a worksheet
 *       form keeps every ai* field and marks it engineer-edited (it used to
 *       drop them, turning an edited AI row into a "manual" row)
 *   A7  wiring: the batch records its purpose; the provenance view shows the
 *       audit line and labels ZSA rows by zone; the module is loaded
 * Run: node tests/regression_ai_audit.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const AUD = read('ai_audit.js');

function mod(extra) {
    const sb = Object.assign({ console, Math, JSON, String, Array, Object, Date, Number, projectConfig: {}, SLAvatar: { me: () => ({ name: 'K. Lee' }) } }, extra || {});
    sb.window = sb; sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(AUD, sb, { filename: 'ai_audit.js' });
    return sb;
}

(async () => {
    // ---- A1 -----------------------------------------------------------------------------
    let M = mod();
    const A = M.SLAiAudit;
    const id1 = A.recordCall({ feature: 'pra.draft', model: 'model-x', skill: 'pra.draft@v3#abc', system: 'SYS', messages: [{ role: 'user', content: 'U1' }], text: '{"rows":[1]}', stopReason: 'end_turn' });
    const e1 = A.call(id1);
    check('A1: a call is logged with id, feature, model, prompt version, fingerprints, sizes and outcome',
        id1 === 'AIC-000001' && e1.feature === 'pra.draft' && e1.model === 'model-x' && e1.skill === 'pra.draft@v3#abc' && /^[0-9a-f]{8}$/.test(e1.inputHash) && e1.outputChars === 12 && e1.output === '{"rows":[1]}' && e1.outcome === 'ok');
    const id2 = A.recordCall({ feature: 'pra.draft', system: 'SYS', messages: [{ role: 'user', content: 'U2' }], text: 'x' });
    check('A1: a different input gives a different input fingerprint', A.call(id2).inputHash !== e1.inputHash);
    for (let i = 0; i < 40; i++) A.recordCall({ feature: 'doc.qa', text: 't' + i });
    const log = M.projectConfig.aiAuditLog;
    check('A1: raw text is kept for the most recent ' + A.KEEP_TEXT + ' calls only; older ones keep the fingerprint',
        log.filter(e => e.output != null).length === A.KEEP_TEXT && log[0].output === undefined && log[0].outputTrimmed === true && log[0].outputHash === e1.outputHash);
    M = mod();
    for (let i = 0; i < M.SLAiAudit.MAX_LOG + 7; i++) M.SLAiAudit.recordCall({ feature: 'doc.qa', text: '' });
    check('A1: beyond the cap the oldest entries are dropped and COUNTED', M.projectConfig.aiAuditLog.length === M.SLAiAudit.MAX_LOG && M.projectConfig.aiAuditDropped === 7 && M.projectConfig.aiAuditLog[0].id === 'AIC-000008');

    // ---- A2 -----------------------------------------------------------------------------
    M = mod();
    const B = M.SLAiAudit;
    const log2 = M.projectConfig.aiAuditLog = [
        { id: 'AIC-1', feature: 'zsa.draft', at: '2026-09-23T10:00:00.000Z', outcome: 'ok' },
        { id: 'AIC-2', feature: 'zsa.draft', at: '2026-09-23T11:00:00.000Z', outcome: 'ok' },
        { id: 'AIC-3', feature: 'zsa.draft', at: '2026-09-23T11:30:00.000Z', outcome: 'error' },
        { id: 'AIC-4', feature: 'chat.edit', purpose: 'fha', at: '2026-09-23T12:00:00.000Z', outcome: 'ok' },
        { id: 'AIC-5', feature: 'zsa.draft', at: '2026-09-23T13:00:00.000Z', outcome: 'ok' }
    ];
    check('A2: a row matches the latest successful call of its feature at or before it', B.matchCall({ aiFeature: 'zsa.draft', aiAt: '2026-09-23T11:45:00.000Z' }) === 'AIC-2');
    check('A2: a failed call is never the drafter', B.matchCall({ aiFeature: 'zsa.draft', aiAt: '2026-09-23T11:31:00.000Z' }) === 'AIC-2');
    check('A2: an AFHA or SFHA row matches the batch call drafting "fha"', B.matchCall({ aiFeature: 'fha.populate', aiAt: '2026-09-23T12:00:30.000Z' }) === 'AIC-4' && B.matchCall({ aiFeature: 'sfha.populate', aiAt: '2026-09-23T12:01:00.000Z' }) === 'AIC-4');
    check('A2: a row older than every call of its feature matches nothing', B.matchCall({ aiFeature: 'zsa.draft', aiAt: '2026-09-23T09:00:00.000Z' }) === null && B.matchCall({ aiFeature: 'cma.draft', aiAt: '2026-09-23T14:00:00.000Z' }) === null);
    void log2;

    // ---- A3 -----------------------------------------------------------------------------
    const row = { internalId: 'r1', zoneId: 'Z-110', desc: 'Hyd line above connector', mitigation: '', aiGenerated: true, aiFeature: 'zsa.draft', aiAt: '2026-09-23T13:00:01.000Z', aiModel: 'm' };
    check('A3: first sight keeps the original and links the call', B.observe(row) === 'new' && row.aiCallId === 'AIC-5' && row.aiOriginal.desc === 'Hyd line above connector' && !row.aiPreAudit);
    check('A3: nothing changed → nothing recorded', B.observe(row) === null && !row.aiEdits);
    row.mitigation = 'Drip shield'; row.updatedAt = '2026-09-24'; row._render = 3; row.aiBadge = 'x';
    check('A3: an edit is recorded with who, field, from and to — computed and provenance fields ignored',
        B.observe(row, { local: true }) === 'edit' && row.aiEdits.length === 1 && row.aiEdits[0].by === 'K. Lee' && JSON.stringify(row.aiEdits[0].diff) === JSON.stringify([{ field: 'mitigation', from: '', to: 'Drip shield' }]), JSON.stringify(row.aiEdits));
    row.desc = 'Hyd line relocated'; row.mitigation = 'Drip shield + clamp';
    B.observe(row, { local: true });
    check('A3: a second edit diffs against the state after the first (replayed), not the original',
        row.aiEdits.length === 2 && row.aiEdits[1].diff.length === 2 && row.aiEdits[1].diff.find(d => d.field === 'mitigation').from === 'Drip shield');
    check('A3: replaying the edits over the original reproduces the current text', JSON.stringify(B.replay(row)) === JSON.stringify(B.fields(row)));
    const s1 = B.summary(row);
    check('A3: the summary names the call, the edit count and who edited last', s1.callId === 'AIC-5' && s1.edits === 2 && s1.lastEdit.by === 'K. Lee' && s1.unchanged === false);
    const synced = { internalId: 's1', desc: 'a', aiGenerated: true, aiFeature: 'zsa.draft', aiAt: '2026-09-23T13:00:02.000Z' };
    B.observe(synced); synced.desc = 'b';
    B.observe(synced);
    check('A3: a change that arrived by sync or load is recorded WITHOUT a name, never attributed to this user', synced.aiEdits[0].by === '' && synced.aiEdits[0].via === 'sync or load');
    const tree = { id: 'p1', name: 'Pitch', aiGenerated: true, aiFeature: 'fta.synthesize', aiAt: '2026-09-23T13:00:00.000Z',
        root: { id: 1, type: 'gate', gateType: 'OR', name: 'Top', children: [{ id: 2, type: 'basic', name: 'A', probability: 1e-5, allocatedDAL: 'B' }] } };
    B.observe(tree);
    tree.root.children[0].probability = 2e-5; tree.root.children[0].allocatedDAL = 'C'; tree.root._bddExactProb = 1;
    check('A3: recomputed numbers on a fault tree are not an edit', B.observe(tree) === null);
    tree.root.children.push({ id: 3, type: 'basic', name: 'B' });
    check('A3: a structural change to the tree is recorded', B.observe(tree) === 'edit' && tree.aiEdits[0].diff[0].field === 'treeStructure');

    // ---- A4 -----------------------------------------------------------------------------
    const old = { internalId: 'o1', praId: 'PRA-1', threat: 'Tire burst', aiGenerated: true, aiFeature: 'pra.draft', aiAt: '2026-08-01T00:00:00.000Z' };
    B.observe(old);
    check('A4: a row with no call record is marked drafted-before-the-audit-trail, with the date first seen', old.aiPreAudit === true && /^\d{4}-\d{2}-\d{2}T/.test(old.aiFirstSeen) && !old.aiCallId);
    check('A4: its card says so and never claims an AI original', /Drafted before the audit trail/.test(B.cardLine(old)) && /first seen/.test(B.cardLine(old)));
    M.praData = [old]; M.zsaData = [row];
    const csv = B.csv().split('\n');
    check('A4: the export labels it too, and lists every AI row with call, model, prompt, input, edits', csv.length === 3 && /drafted before the audit trail; as first seen/.test(csv.find(l => /PRA-1/.test(l))) && /"AIC-5"/.test(csv.find(l => /Z-110/.test(l))) && /"2"/.test(csv.find(l => /Z-110/.test(l))));
    check('A4: the calls export lists every logged call', B.callsCsv().split('\n').length === M.projectConfig.aiAuditLog.length + 1);
    M.zsaData = [{ zoneId: 'manual', desc: 'no ai' }];
    check('A4: manual rows are never touched', B.sweep().rows === 1 && M.zsaData[0].aiOriginal === undefined);

    // ---- A4b: local edits are recorded right after the save, before sync ----------------
    {
        const timers = [];
        const H = mod({ setTimeout: (fn) => { timers.push(fn); return timers.length; }, zsaData: [] });
        let saves = 0; H.scheduleAutosave = function () { saves++; };
        H.SLAiAudit.hookSave();
        const zr = { internalId: 'z', desc: 'one', aiGenerated: true, aiFeature: 'zsa.draft', aiAt: '2026-09-23T13:00:00.000Z' };
        H.zsaData.push(zr);
        H.SLAiAudit.sweep({ local: true });
        check('A4b: the sweep\'s own save does not queue another sweep', timers.length === 0);
        saves = 0;
        zr.desc = 'two';
        H.scheduleAutosave();                       // the app's save after an edit
        check('A4b: a save queues one local sweep (0 ms) and still saves', timers.length === 1 && saves === 1);
        timers.shift()();
        check('A4b: the queued sweep records the edit signed by this user', zr.aiEdits && zr.aiEdits.length === 1 && zr.aiEdits[0].by === 'K. Lee' && zr.aiEdits[0].via === 'edit');
    }

    // ---- A5 EXEC ------------------------------------------------------------------------
    const store = { 'safetyLab.ai.enabled': '1' };
    let behavior = 'ok';
    const sb = { console: { log() {}, info() {}, warn() {}, error() {}, debug() {} }, URLSearchParams, setTimeout, clearTimeout, location: { search: '' },
        localStorage: { getItem: k => (store[k] != null ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
        navigator: { userAgent: 'node' },
        document: { createElement: () => ({ style: {}, appendChild() {}, setAttribute() {}, addEventListener() {} }), addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, body: { appendChild() {} } } };
    sb.window = { projectConfig: {} };
    ['localStorage', 'location', 'document', 'navigator', 'console'].forEach(k => sb.window[k] = sb[k]);
    sb.window.AiClient = { isConfigured: () => true, isProxyMode: () => true,
        messages: async () => { if (behavior === 'fail') throw new Error('proxy 502'); return { model: 'claude-test-1', stop_reason: 'end_turn', content: [{ text: 'The answer.' }] }; } };
    sb.projectConfig = sb.window.projectConfig;
    vm.createContext(sb);
    vm.runInContext('(function(window){' + AUD + '\n})(window);', sb, { filename: 'ai_audit.js' });
    vm.runInContext(read('ai_assistant.js'), sb, { filename: 'ai_assistant.js' });
    const AI = sb.window.SafetyLabAI;
    const r = await AI.complete({ feature: 'doc.qa', system: 'You answer.', messages: [{ role: 'user', content: 'Q?' }] });
    const L = sb.window.projectConfig.aiAuditLog || [];
    check('A5 EXEC: the real Provider.complete logs a successful call (feature, model, output, outcome)',
        r.text === 'The answer.' && L.length === 1 && L[0].feature === 'doc.qa' && L[0].model === 'claude-test-1' && L[0].output === 'The answer.' && L[0].outcome === 'ok' && L[0].stopReason === 'end_turn', JSON.stringify(L));
    behavior = 'fail';
    let threw = null; try { await AI.complete({ feature: 'doc.qa', system: 'S', messages: [{ role: 'user', content: 'Q2' }] }); } catch (e) { threw = e; }
    check('A5 EXEC: a failed call is logged as an error and the failure still reaches the caller', threw && /502/.test(threw.message) && L.length === 2 && L[1].outcome === 'error' && /502/.test(L[1].error));

    // ---- A6 EXEC ------------------------------------------------------------------------
    const SUP = read('support_modules.js');
    const extract = (src, name) => { const at = src.indexOf('function ' + name + '('); const open = src.indexOf('{', at); let d = 0; for (let i = open; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (d === 0) return src.slice(at, i + 1); } } };
    const els = { 'f-threat': { value: '', tagName: 'INPUT', options: [], querySelectorAll: () => [] } };
    const cs = { console, Math, JSON, Object, Array, String, Date, document: { getElementById: id => els[id] || null, querySelectorAll: () => [] },
        editStates: {}, formConfigs: {}, _CRUD_KEY_TO_KIND: {}, slAlert() {}, newRowId: () => 'n1', _slAutoNumber: (k, d) => d, _slCaptureAiEdit() {},
        _crudSurgicalEnabled: () => false, cancelEdit() {}, setEditMode() {}, scrollTo() {} };
    cs.window = cs; vm.createContext(cs);
    const store2 = [{ internalId: 'p1', threat: 'Bird strike', aiGenerated: true, aiFeature: 'pra.draft', aiModel: 'm', aiAt: '2026-09-23T10:00:00Z', aiCallId: 'AIC-9', aiOriginal: { threat: 'Bird strike' }, aiSeen: 'abc' }];
    cs.__store = store2;
    vm.runInContext(extract(SUP, 'makeCRUD') + '; globalThis.__c = makeCRUD({ key: "pra", store: () => __store, formIds: { threat: "f-threat" }, submitBtn: "b", cancelBtn: "c", defaultText: "Log", tableBody: "none" });', cs);
    cs.editStates.pra = 'p1'; els['f-threat'].value = 'Bird strike (windshield)';
    cs.__c.submit();
    const ed = store2[0];
    check('A6 EXEC: a worksheet edit of an AI row keeps every AI marker and the audit fields', ed.threat === 'Bird strike (windshield)' && ed.aiGenerated === true && ed.aiFeature === 'pra.draft' && ed.aiCallId === 'AIC-9' && ed.aiOriginal.threat === 'Bird strike' && ed.aiSeen === 'abc', JSON.stringify(ed));
    check('A6 EXEC: …and marks it engineer-edited (which counts it as reviewed)', ed.humanEdited === true && /^\d{4}-/.test(ed.humanEditedAt));

    // ---- A7 -----------------------------------------------------------------------------
    const AS = read('ai_assistant.js'), IDX = read('index.html');
    check('A7: the batch records what it drafts as the call purpose', /_auditPurpose = \(cfg && cfg\.analysis\) \|\| prev \|\| null/.test(AS) && /purpose: _auditPurpose/.test(AS));
    check('A7: the provenance view carries the row and shows the audit line; ZSA rows are labelled by zone', /out\.push\(\{ row: r, type: type/.test(AS) && /window\.SLAiAudit\.cardLine\(x\.row\)/.test(AS) && /add\(s\.zsaData, 'ZSA', function \(r\) \{ return \(r\.zoneId \|\| r\.zone/.test(AS));
    check('A7: the module is loaded by the page', /<script src="ai_audit\.js\?v=[\d.]+" defer><\/script>/.test(IDX));

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
