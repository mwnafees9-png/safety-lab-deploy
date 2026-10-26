#!/usr/bin/env node
/*
 * Regression (26 Oct 2026, Radia, desktop on Windows): a confirmed save also writes the CONFIRMED project back to the
 * .sl file it was opened from. The owner's ruling: "the file should always auto save back to where it was opened".
 * Before: "369 changes to confirm" -> Confirm all -> "Changes saved", but only inside the app; the .sl in OneDrive
 * never changed and the next open showed the old project.
 *
 * EXECUTED: the REAL site/save_state.js in a VM, with the desktop's window.slabProjectFile (the preload API) stubbed,
 * and without it (the browser).
 *   [P1] a confirmed save calls the file write with the accepted project (the .sl export) and the project's epoch;
 *        the indicator says Saved to the file.
 *   [P2] changes still waiting: only the CONFIRMED state goes to the file (acceptedSnapshot), never the waiting one.
 *   [P3] the state is taken when the save starts: a change made while the save runs is not written.
 *   [P4] a failed write: "Not saved to Radia.sl: ..." and never Saved; the window close asks; Retry and Save As work.
 *   [P5] another project opened (replaced()): a new epoch, the shell told; later saves carry the new epoch.
 *   [P6] the shell's file open: the app's loader runs, the epoch is given only once the project is on screen;
 *        a bad file and a cancelled open bind nothing.
 *   [P7] the Project menu's Load Project (the hidden file input) is the native Open in the desktop.
 *   [B]  the browser (no slabProjectFile): unchanged, nothing written, the file input left alone.
 * MUTATION PROOFS: SL_PF_MUTATE=live | late | saved | epoch | click. Each turns this red.
 * Run: node tests/regression_project_file_autosave_20261026.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + String(d).slice(0, 400) : '')); } };
const MUT = process.env.SL_PF_MUTATE || '';
const mutate = (s, a, b) => { if (s.indexOf(a) < 0) throw new Error('mutation site missing: ' + a); return s.replace(a, b); };
let SRC = fs.readFileSync(path.join(__dirname, '..', 'site', 'save_state.js'), 'utf8');
if (MUT === 'live') SRC = mutate(SRC, 'if (acc == null) json =', 'if (true) json =');
if (MUT === 'late') SRC = mutate(mutate(SRC, 'var fileJob = _fileJob(acc);', 'var fileJob = null;'), 'var ff = fileJob ? await _writeFile(fileJob) : null;', 'var ff = await _writeFile(_fileJob(acc));');
if (MUT === 'saved') SRC = mutate(SRC, '        if (ff) {\n            _stats.failures++;', '        if (false) {\n            _stats.failures++;');
if (MUT === 'epoch') SRC = mutate(SRC, '_fileEpoch++; _fileFail = null; _fileName = null;', '_fileFail = null; _fileName = null;');
if (MUT === 'click') SRC = mutate(SRC, "if (!P || typeof P.open !== 'function' || !t || t.id !== 'load-file') return;", 'return;');
const J = (v) => JSON.parse(JSON.stringify(v));
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 0));

function el() { const cl = new Set(); return { textContent: '', title: '', classList: { add: (c) => cl.add(c), remove: (...c) => c.forEach((x) => cl.delete(x)), toggle() {}, has: (c) => cl.has(c) } }; }

function boot(opts) {
    opts = opts || {};
    const model = { projectName: 'Radia P', acFhaData: [{ id: 'f1', severity: 'Major' }] };
    const ind = el(), indText = el();
    const docListeners = [], winListeners = {};
    const pf = { writes: [], replaced: [], opens: 0, saveAs: 0, answer: opts.fileAnswer || { ok: true, name: 'Radia.sl', bytes: 10 }, stateCb: null };
    const ack = { pending: false, acc: null, asked: 0 };
    const ctx = {
        console: { info() {}, warn() {}, error() {}, log() {} },
        setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, Promise, Date, JSON, Math, Object, Array, String, Number, Boolean, Error, parseInt, isFinite,
        requestAnimationFrame: (f) => f(),
        navigator: { onLine: true, userAgent: opts.desktop ? 'Electron' : 'Chrome' },
        document: {
            body: {}, getElementById: (id) => (id === 'save-indicator' ? ind : (id === 'save-indicator-text' ? indText : null)),
            querySelectorAll: () => [], querySelector: () => null,
            addEventListener: (type, fn, cap) => docListeners.push({ type, fn, cap })
        },
        addEventListener: (t, fn) => { (winListeners[t] = winListeners[t] || []).push(fn); }, dispatchEvent() { return true; },
        showToast() {}, _writeAutosave: () => true, __slAutosaveLs: true, __slAutosaveIdb: Promise.resolve(true),
        slNumberingScheme: { ac: 'FC-###' }, slNumberingStore: { seq: { FC: 7 }, map: {} },
        __slabGetProjectJSON: () => JSON.stringify(Object.assign({ numberingScheme: { ac: 'FC-###' } }, J(model)), null, 2),
        loaded: [],
        loadProject: function (event) {   // the app's file loader (helpers_modules.js): FileReader, then onLoaded
            ctx.loaded.push(event);
            const f = event.target.files[0];
            Promise.resolve(f.text ? f.text() : String(f)).then(function (txt) {
                try { const d = JSON.parse(txt); model.projectName = d.projectName; model.acFhaData = d.acFhaData; if (event.onLoaded) event.onLoaded(true); }
                catch (e) { if (event.onLoaded) event.onLoaded(false, e); }
            });
        },
        File: function (parts, name) { this.name = name; this._t = parts.join(''); this.text = () => Promise.resolve(this._t); }
    };
    ctx.SLChangeAck = {
        pending: () => ack.pending, pendingUser: () => ack.pending, count: () => (ack.pending ? 3 : 0),
        acceptedSnapshot: () => (ack.pending ? ack.acc : null), system: (f) => f(), systemAsync: (f) => f(), settle() {}, status: () => ({}),
        ask: async () => { ack.asked++; ack.pending = false; return 'confirmed'; }
    };
    if (opts.desktop) {
        ctx.slabProjectFile = {
            write: async (json, epoch) => { pf.writes.push({ json, epoch }); const a = typeof pf.answer === 'function' ? pf.answer() : pf.answer; return J(a); },
            replaced: async (e) => { pf.replaced.push(e); return { ok: true }; },
            open: async () => { pf.opens++; return { ok: true }; },
            saveAs: async () => { pf.saveAs++; return { ok: true }; },
            status: async () => ({ ok: true, name: opts.boundName || null, epoch: 0 }),
            onState: (cb) => { pf.stateCb = cb; }
        };
    }
    ctx.window = ctx; ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx, { filename: 'save_state.js' });
    const S = ctx.SLSaveState;
    const confirm = async () => { S._ackClosed({}, 'kept'); const ok = await Promise.race([S.whenSaved(), tick(4000).then(() => 'HUNG')]); await tick(5); return ok; };
    const click = (id) => { const ev = { target: { id }, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } }; docListeners.filter((l) => l.type === 'click' && l.cap).forEach((l) => l.fn(ev)); return ev; };
    return { ctx, S, model, ack, pf, ind, indText, confirm, click };
}

(async function main() {
    console.log('\n[P1] a confirmed save writes the accepted project to the file');
    let T = boot({ desktop: true, boundName: 'Radia.sl' });
    await tick(5);
    T.model.acFhaData[0].severity = 'Hazardous';               // the person's change, now confirmed
    let ok = await T.confirm();
    check('the file write is called once, with the project and its epoch', T.pf.writes.length === 1 && T.pf.writes[0].epoch === T.S.status().file.epoch, JSON.stringify(T.pf.writes.map((w) => w.epoch)));
    const w0 = T.pf.writes[0] && JSON.parse(T.pf.writes[0].json);
    check('...it is the .sl export of the confirmed project (the change is in it)', w0 && w0.projectName === 'Radia P' && w0.acFhaData[0].severity === 'Hazardous' && w0.numberingScheme, T.pf.writes[0] && T.pf.writes[0].json.slice(0, 120));
    check('Saved, and the indicator names the file', ok === true && T.S.status().state === 'saved' && /^Saved to Radia\.sl /.test(T.indText.textContent) && /to the file Radia\.sl/.test(T.ind.title), T.indText.textContent + ' | ' + T.ind.title);
    const snap = T.ctx.__slabProjectFileSnapshot();
    check('File > Save asks the page for the project with the same epoch', snap && JSON.parse(snap.json).projectName === 'Radia P' && snap.epoch === T.S.status().file.epoch);

    console.log('\n[P2] only what is CONFIRMED goes to the file');
    T = boot({ desktop: true, boundName: 'Radia.sl' });
    T.ack.pending = true;
    T.ack.acc = JSON.stringify({ projectName: 'Radia P', acFhaData: [{ id: 'f1', severity: 'Major' }] });   // confirmed state
    T.model.acFhaData[0].severity = 'UNCONFIRMED-MOVE';                                                    // still waiting
    ok = await T.confirm();
    const w1 = T.pf.writes[0] && JSON.parse(T.pf.writes[0].json);
    check('while changes still wait, the file gets the accepted state', w1 && w1.acFhaData[0].severity === 'Major', T.pf.writes[0] && T.pf.writes[0].json.slice(0, 160));
    check('...never the unconfirmed change', T.pf.writes.every((w) => w.json.indexOf('UNCONFIRMED') < 0));
    check('...with the numbering scheme and counters laid on (bookkeeping, not content)', w1 && w1.numberingScheme && w1.numberingScheme.ac === 'FC-###' && w1.numberingStore && w1.numberingStore.seq.FC === 7, JSON.stringify(w1 && w1.numberingStore));

    console.log('\n[P3] the state is taken when the save starts');
    T = boot({ desktop: true, boundName: 'Radia.sl' });
    let release; T.ctx.__slAutosaveIdb = new Promise((r) => { release = r; });
    T.model.acFhaData[0].severity = 'Hazardous';
    T.S._ackClosed({}, 'kept');
    await tick(5);
    T.model.acFhaData[0].severity = 'TYPED-WHILE-SAVING';      // a new change, not confirmed, made during the save
    release(true);
    await T.S.whenSaved(); await tick(5);
    check('the file holds what was confirmed, not what was typed while it saved', T.pf.writes.length >= 1 && JSON.parse(T.pf.writes[0].json).acFhaData[0].severity === 'Hazardous', T.pf.writes[0] && T.pf.writes[0].json.slice(0, 160));

    console.log('\n[P4] a failed write is said, and never shown as saved');
    T = boot({ desktop: true, boundName: 'Radia.sl', fileAnswer: { ok: false, code: 'EBUSY', reason: 'the file is locked by another program (OneDrive may be syncing it)', name: 'Radia.sl' } });
    T.model.acFhaData[0].severity = 'Hazardous';
    ok = await T.confirm();
    const st = T.S.status();
    check('NOT saved: the save reports false and the state is an error about the file', ok === false && st.state === 'error' && st.reasonCode === 'file' && st.file.fail && st.file.fail.name === 'Radia.sl', JSON.stringify(st));
    check('the indicator says "Not saved to Radia.sl: <why>", not Saved', /^Not saved to Radia\.sl: file locked\. Retry$/.test(T.indText.textContent) && T.ind.classList.has('error') && !/Saved/.test(T.indText.textContent), T.indText.textContent);
    check('...its hover gives the full reason and offers Save As', /Not saved to Radia\.sl: the file is locked by another program/.test(T.ind.title) && /Save As/.test(T.ind.title), T.ind.title);
    check('closing the window asks first (it is not saved)', T.ctx.__slabCanClose() === false);
    check('whenSaved stays false while the file is not written', (await T.S.whenSaved()) === false);
    T.ctx.SLChoice._setTestAnswer('saveas');
    await T.S.save();
    check('the indicator\'s Save As runs the native Save As', T.pf.saveAs === 1);
    T.pf.stateCb && T.pf.stateCb({ name: 'Copy.sl', epoch: T.S.status().file.epoch, saved: true });
    check('...and once the shell saved it there, the error clears', T.S.status().state === 'saved' && !T.S.status().file.fail && T.S.status().file.name === 'Copy.sl', JSON.stringify(T.S.status().file));
    T = boot({ desktop: true, boundName: 'Radia.sl', fileAnswer: { ok: false, code: 'ENOENT', reason: 'the file is no longer there (it was moved, renamed or deleted)', name: 'Radia.sl' } });
    await T.confirm();
    T.pf.answer = { ok: true, name: 'Radia.sl' };
    T.ctx.SLChoice._setTestAnswer('retry');
    ok = await T.S.save();
    check('Retry writes it again and then it says Saved', ok === true && T.S.status().state === 'saved' && T.pf.writes.length === 2 && /^Saved to Radia\.sl/.test(T.indText.textContent), T.indText.textContent);

    console.log('\n[P5] another project opened: a new epoch');
    T = boot({ desktop: true, boundName: 'Radia.sl' });
    const e0 = T.S.status().file.epoch;
    T.S.replaced();
    check('replaced() moves the epoch on and tells the shell', T.S.status().file.epoch === e0 + 1 && T.pf.replaced[T.pf.replaced.length - 1] === e0 + 1, JSON.stringify(T.pf.replaced));
    await T.confirm();
    check('...later saves carry the new epoch (the shell writes nothing of it into the old file)', T.pf.writes.length === 1 && T.pf.writes[0].epoch === e0 + 1);

    console.log('\n[P6] the shell\'s file open');
    T = boot({ desktop: true });
    const e1 = T.S.status().file.epoch;
    const text = JSON.stringify({ projectName: 'From file', acFhaData: [{ id: 'f9', severity: 'Minor' }] });
    let r = await T.ctx.__slabOpenProjectFile(text);
    check('the app\'s own loader runs (not the guard wrapper) and the project is on screen', T.ctx.loaded.length === 1 && T.model.projectName === 'From file');
    check('the epoch is given once it is on screen, and the shell is told', r && r.ok === true && r.epoch === e1 + 1 && T.pf.replaced.slice(-1)[0] === e1 + 1, JSON.stringify(r));
    r = await T.ctx.__slabOpenProjectFile('not json {');
    check('a file that is not a project: refused, nothing loaded, no new epoch', r.ok === false && r.reason === 'parse' && T.ctx.loaded.length === 1 && T.S.status().file.epoch === e1 + 1);
    T.pf.answer = { ok: false, code: 'EBUSY', reason: 'locked', name: 'From.sl' };
    await T.confirm();                                         // the open project's file write fails: leaving it asks
    T.ctx.SLChoice._setTestAnswer('stay');
    r = await T.ctx.__slabOpenProjectFile(text);
    check('"Stay" when the last save is not in its file: cancelled, nothing loaded', r.ok === false && r.reason === 'cancelled' && T.ctx.loaded.length === 1, JSON.stringify(r));

    console.log('\n[P7] the Project menu\'s Load Project is the native Open');
    T = boot({ desktop: true });
    let ev = T.click('load-file');
    check('a click on the hidden file input opens the native Open instead', T.pf.opens === 1 && ev.prevented === true);
    ev = T.click('something-else');
    check('...other clicks are left alone', T.pf.opens === 1 && ev.prevented === false);

    console.log('\n[B] the browser: unchanged');
    T = boot({ desktop: false });
    T.model.acFhaData[0].severity = 'Hazardous';
    ok = await T.confirm();
    check('a confirmed save is Saved as before, nothing about a file', ok === true && T.S.status().state === 'saved' && /^Saved \d/.test(T.indText.textContent) && T.S.status().file.name === null && !/file/.test(T.ind.title), T.indText.textContent + ' | ' + T.ind.title);
    ev = T.click('load-file');
    check('the file input is left alone (the browser picker opens)', ev.prevented === false);
    T.S.replaced();
    check('replaced() works without the desktop API', T.S.status().state === 'idle');

    console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? '  (mutation: ' + MUT + ')' : ''));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });
