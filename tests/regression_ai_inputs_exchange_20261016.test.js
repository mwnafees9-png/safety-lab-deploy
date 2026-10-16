#!/usr/bin/env node
/*
 * Regression: the shared AI inputs file, "safetylab-ai-inputs" version 1 (site/ai_inputs_exchange.js), 16 Oct 2026.
 *
 * Waqas (16 Oct 2026, confirmed): people with Safety Lab, Sys Lab and Cert Lab share their AI inputs as a file in ONE
 * format, identical in the three tools, until the tools are on one platform. Pinned here:
 *   [A] SHA-256 equals Node's crypto on edge lengths and non-ASCII text; canonical JSON sorts keys at every level
 *   [B] the file shape is exactly the agreed one (top level, every doc field, types), images only when asked
 *   [C] round trip: export, verify, preview against an empty project (all new), apply, export again: same docs and
 *       same fingerprint; text kept byte for byte, [p.N] markers and line breaks included
 *   [D] refusal: any change to a text, a hash, a field, the doc order, a duplicate id or the fingerprint refuses the
 *       whole file with the plain message; not JSON, wrong format, newer version refused with their own message
 *   [E] preview rules: identical by sha256 (whatever the name), conflict by id, conflict by name (trimmed, case
 *       ignored), new otherwise; apply: keep mine, replace (keeps this project's id, never clears controlled), keep
 *       both (fresh id and " (imported)" name)
 *   [F] facts: kind, revision rule (stored wins over detected), page count; store mapping (fromStoreDoc / toStoreDoc)
 *   [G] mutation checks: the checks above fail when the rules they pin are broken (fingerprint not checked, sha not
 *       checked, preview by name only, replace clears controlled)
 *   [H] the format document in the module header and the scratchpad copy agree on the field list
 *
 * Run: node tests/regression_ai_inputs_exchange_20261016.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..'), SITE = path.join(ROOT, 'site');
const SRC = fs.readFileSync(path.join(SITE, 'ai_inputs_exchange.js'), 'utf8');
const X = require(path.join(SITE, 'ai_inputs_exchange.js'));
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? ' - ' + d : '')); } };
const J = JSON.stringify;
const nodeSha = s => crypto.createHash('sha256').update(Buffer.from(new TextEncoder().encode(s))).digest('hex');

console.log('\n[A] hashing and canonical JSON');
const samples = ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(63), 'a'.repeat(64), 'a'.repeat(119), 'Résumé of the 漢字 ICD 😀\r\n[p.2]\tend', '\ud800 lone', 'x'.repeat(200001)];
check('SHA-256 matches Node crypto on ' + samples.length + ' edge cases (padding boundaries, UTF-8, astral, lone surrogate)', samples.every(s => X.sha256Hex(s) === nodeSha(s)));
check('the known vector for "abc"', X.sha256Hex('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
check('canonical JSON sorts keys at every level and keeps array order', X.canonical({ b: 1, a: [{ d: 2, c: 'x' }, 3], u: undefined }) === '{"a":[{"c":"x","d":2},3],"b":1}');
check('canonical JSON writes strings exactly as JSON.stringify', X.canonical({ s: 'a"\n\u2028é' }) === '{"s":' + JSON.stringify('a"\n\u2028é') + '}');

// a realistic project: a PDF with page markers, a Word file with a table and a diagram, a pasted note, a ReqIF
const PDF_TEXT = '[p.1] TR-2210 Bird Strike Test Report\nRevision C\nPrepared for the nose fairing qualification.\n\n[p.2] 4 Results\nTest 4: panel PN-NF-410 was impacted by a 4 lb bird at 250 KCAS (Vc).\nNo penetration of the panel.\n\n[p.3] Test 6: panel PN-NF-412 at 180 KCAS. PASS.';
const store = [
    { id: 'doc-1760600000000-ab12c', name: 'TR-2210 Bird Strike Test Report Rev C.pdf', addedAt: Date.parse('2026-10-14T09:12:00Z'), addedBy: 'w.engineer@example.com', text: PDF_TEXT, tables: [], images: [] },
    { id: 'doc-1760600000001-cd34e', name: 'Propulsion SDD.docx', addedAt: Date.parse('2026-10-14T10:00:00Z'), addedBy: 'Dana Ortiz', controlled: true, text: 'Propulsion System Description\nDocument SDD-PRP-001 Rev: B\nThe FADEC has two channels.', tables: [{ title: 'Table 1 Interfaces', markdown: '| From | To |\n|---|---|\n| FADEC A | EEC bus |' }], images: [{ type: 'image/png', data: 'iVBORw0KGgo=', caption: 'Figure 1' }] },
    { id: 'doc-1760600000002-ef56g', name: 'Pasted text, Oct 14, 2026', addedAt: Date.parse('2026-10-14T11:00:00Z'), text: 'The aircraft has a single hydraulic system.', tables: [] },
    { id: 'doc-1760600000003-gh78i', name: 'Flight controls requirements.reqif', addedAt: Date.parse('2026-10-14T12:00:00Z'), addedBy: 'Dana Ortiz', revision: '7', text: 'REQ-FC-001 The FCC shall ...\nRevision A of the template', tables: [] }
];
const OPT = { tool: 'safety-lab', projectName: 'Vayu V-1', projectId: 'proj-123', exportedAt: '2026-10-16T08:00:00Z' };

console.log('\n[B] the file shape');
const f1 = X.build(store, OPT);
check('top-level keys are exactly format, version, exportedAt, source, docs, fingerprint', J(Object.keys(f1)) === J(['format', 'version', 'exportedAt', 'source', 'docs', 'fingerprint']));
check('format "safetylab-ai-inputs", version 1, exportedAt ISO', f1.format === 'safetylab-ai-inputs' && f1.version === 1 && f1.exportedAt === '2026-10-16T08:00:00.000Z');
check('source = {tool, projectName, projectId}', J(f1.source) === J({ tool: 'safety-lab', projectName: 'Vayu V-1', projectId: 'proj-123' }));
const REQ = ['id', 'name', 'kind', 'addedAt', 'addedBy', 'controlled', 'revision', 'text', 'tables', 'sha256'];
check('every doc carries exactly the required fields, plus images only where there are any', f1.docs.every((d, i) => J(Object.keys(d).filter(k => k !== 'images')) === J(REQ)) && f1.docs.filter(d => d.images).length === 1 && !!f1.docs[1].images);
check('field types: strings, ISO or null, boolean, string or null, arrays, 64 hex', f1.docs.every(d => typeof d.id === 'string' && typeof d.name === 'string' && typeof d.kind === 'string' && (d.addedAt === null || /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(d.addedAt)) && (d.addedBy === null || typeof d.addedBy === 'string') && typeof d.controlled === 'boolean' && (d.revision === null || typeof d.revision === 'string') && typeof d.text === 'string' && Array.isArray(d.tables) && /^[0-9a-f]{64}$/.test(d.sha256)));
check('sha256 of each doc is the hash of its UTF-8 text', f1.docs.every(d => d.sha256 === nodeSha(d.text)));
check('fingerprint is the hash of canonical(docs)', f1.fingerprint === nodeSha(X.canonical(f1.docs)));
check('kinds: pdf, docx, text (pasted), reqif', J(f1.docs.map(d => d.kind)) === J(['pdf', 'docx', 'text', 'reqif']));
check('addedBy kept, null when not recorded; controlled kept', f1.docs[0].addedBy === 'w.engineer@example.com' && f1.docs[2].addedBy === null && f1.docs[1].controlled === true && f1.docs[0].controlled === false);
check('revision: detected C from the PDF text, B from "Rev: B", none in the note, the stored 7 wins over the detected A', J(f1.docs.map(d => d.revision)) === J(['C', 'B', null, '7']));
const fNoImg = X.build(store, Object.assign({ includeImages: false }, OPT));
check('"Include diagrams" off: no images field anywhere, and a different fingerprint', fNoImg.docs.every(d => !('images' in d)) && fNoImg.fingerprint !== f1.fingerprint);
const fSel = X.build(store, Object.assign({ ids: ['doc-1760600000003-gh78i', 'doc-1760600000000-ab12c'] }, OPT));
check('a selection exports only the ticked docs, in project order', J(fSel.docs.map(d => d.id)) === J(['doc-1760600000000-ab12c', 'doc-1760600000003-gh78i']));
check('the file name is "<project> AI inputs.slai.json" with unsafe characters removed', X.fileName('Vayu: V-1/rev*') === 'Vayu V-1 rev AI inputs.slai.json' && X.fileName('') === 'Project AI inputs.slai.json');

console.log('\n[C] round trip');
const text1 = X.serialize(f1);
const v1 = X.verify(text1);
check('the serialized file verifies', v1.ok === true, J(v1));
const pv0 = X.preview([], v1.file);
check('against an empty project every doc is new', pv0.counts.new === 4 && pv0.counts.identical === 0 && pv0.counts.conflict === 0);
const ap0 = X.apply([], pv0, {});
check('apply adds all four, ids and names kept', J(ap0.docs.map(d => d.id)) === J(store.map(d => d.id)) && J(ap0.docs.map(d => d.name)) === J(store.map(d => d.name)) && ap0.summary.added.length === 4);
check('text kept byte for byte ([p.N] markers and line breaks)', ap0.docs[0].text === PDF_TEXT && /\[p\.2\] 4 Results\nTest 4/.test(ap0.docs[0].text));
check('store docs carry addedAt as a number, addedBy, controlled, revision, tables and images', ap0.docs[0].addedAt === Date.parse('2026-10-14T09:12:00Z') && ap0.docs[1].controlled === true && ap0.docs[1].tables[0].title === 'Table 1 Interfaces' && ap0.docs[1].images[0].data === 'iVBORw0KGgo=' && ap0.docs[3].revision === '7');
const f2 = X.build(ap0.docs, Object.assign({}, OPT, { tool: 'sys-lab' }));
check('export again from the imported project: identical docs and fingerprint', J(f2.docs) === J(f1.docs) && f2.fingerprint === f1.fingerprint);
const pvSame = X.preview(ap0.docs, v1.file);
check('importing the same file again: everything identical, nothing to do', pvSame.counts.identical === 4 && X.apply(ap0.docs, pvSame, {}).summary.added.length === 0);
check('the input list is not changed by apply', J(store.map(d => d.name)) === J(['TR-2210 Bird Strike Test Report Rev C.pdf', 'Propulsion SDD.docx', 'Pasted text, Oct 14, 2026', 'Flight controls requirements.reqif']));
check('Sys Lab and Cert Lab are valid source tools; anything else is written as safety-lab', X.build([], { tool: 'cert-lab' }).source.tool === 'cert-lab' && X.build([], { tool: 'foo' }).source.tool === 'safety-lab');
check('an empty file is valid and verifies', X.verify(X.serialize(X.build([], OPT))).ok === true);

console.log('\n[D] refusing a damaged file');
const mut = fn => { const o = JSON.parse(text1); fn(o); return X.verify(JSON.stringify(o)); };
const damaged = r => r.ok === false && r.message === X.DAMAGED_MESSAGE;
check('one character of a text changed', damaged(mut(o => { o.docs[0].text = o.docs[0].text.replace('250 KCAS', '260 KCAS'); })));
check('a text changed and its sha256 recomputed, fingerprint left: refused on the fingerprint', (() => { const r = mut(o => { o.docs[0].text += ' '; o.docs[0].sha256 = nodeSha(o.docs[0].text); }); return damaged(r) && r.code === 'fingerprint'; })());
check('a field changed (controlled flipped)', damaged(mut(o => { o.docs[1].controlled = false; })));
check('a field changed (name)', damaged(mut(o => { o.docs[2].name = 'Other'; })));
check('a table changed', damaged(mut(o => { o.docs[1].tables[0].markdown += 'x'; })));
check('an image changed', damaged(mut(o => { o.docs[1].images[0].data = 'AAAA'; })));
check('two docs swapped', damaged(mut(o => { o.docs.reverse(); })));
check('a doc removed', damaged(mut(o => { o.docs.pop(); })));
check('the fingerprint changed', damaged(mut(o => { o.fingerprint = o.fingerprint.replace(/^./, c => c === 'a' ? 'b' : 'a'); })));
check('the fingerprint missing', damaged(mut(o => { delete o.fingerprint; })));
check('a duplicate id', damaged(mut(o => { o.docs[1].id = o.docs[0].id; o.fingerprint = nodeSha(X.canonical(o.docs)); })));
check('a doc without text', damaged(mut(o => { delete o.docs[2].text; })));
check('controlled not a boolean', damaged(mut(o => { o.docs[2].controlled = 'no'; o.fingerprint = nodeSha(X.canonical(o.docs)); })));
check('not JSON: its own plain message', (() => { const r = X.verify('{"format": "safetylab-ai-inputs", '); return !r.ok && r.code === 'not-json' && /not readable as JSON/.test(r.message); })());
check('another format (the zonal exchange file) refused as not an AI inputs file', (() => { const r = X.verify(J({ format: 'safetylab-zonal', version: 1 })); return !r.ok && r.code === 'format'; })());
check('a newer version refused with "update this tool"', (() => { const r = mut(o => { o.version = 2; }); return !r.ok && r.code === 'version' && /newer version/.test(r.message); })());
check('extra unknown fields are ignored (top level), extra doc fields are covered by the fingerprint', mut(o => { o.note = 'hello'; }).ok === true && damaged(mut(o => { o.docs[0].extra = 1; })));
check('an extra doc field written by a newer writer, with its fingerprint, is read', mut(o => { o.docs[0].language = 'en'; o.fingerprint = nodeSha(X.canonical(o.docs)); }).ok === true);
check('uppercase hex is accepted', mut(o => { o.fingerprint = o.fingerprint.toUpperCase(); o.docs[0].sha256 = o.docs[0].sha256.toUpperCase(); o.fingerprint = nodeSha(X.canonical(o.docs)).toUpperCase(); }).ok === true);

console.log('\n[E] preview and apply');
// the receiving project: one identical doc under another name, one same-id doc with new text, one same-name doc
// (different case and spaces) with new text, and an unrelated doc
const here = [
    { id: 'mine-1', name: 'Bird strike report (my copy).pdf', addedAt: 1, text: PDF_TEXT, tables: [] },
    { id: 'doc-1760600000001-cd34e', name: 'Propulsion SDD.docx', addedAt: 2, text: 'Propulsion System Description\nRev: A\nOld text.', tables: [], controlled: false },
    { id: 'mine-3', name: '  flight CONTROLS requirements.reqif ', addedAt: 3, text: 'old requirements', tables: [], controlled: true },
    { id: 'mine-4', name: 'Hydraulics ICD.pdf', addedAt: 4, text: 'ICD text', tables: [] }
];
const pv = X.preview(here, v1.file);
const st = pv.entries.map(e => e.status + (e.match ? ':' + e.match.by + ':' + e.match.id : ''));
check('statuses: identical by sha (other name), conflict by id, new, conflict by name', J(st) === J(['identical:sha:mine-1', 'conflict:id:doc-1760600000001-cd34e', 'new', 'conflict:name:mine-3']), J(st));
check('counts', J(pv.counts) === J({ new: 1, identical: 1, conflict: 2 }));
check('conflicts default to keep both', pv.entries.filter(e => e.status === 'conflict').every(e => e.choice === 'both'));
check('the conflict shows this project\'s revision and size for the person to compare', pv.entries[1].match.revision === 'A' && pv.entries[1].match.chars === here[1].text.length);
const keepAll = X.apply(here, pv, { 1: 'keep', 3: 'keep' });
check('keep mine on both conflicts: only the new doc is added, the conflicting docs untouched', keepAll.docs.length === 5 && keepAll.summary.added.length === 1 && J(keepAll.docs.slice(0, 4)) === J(here) && keepAll.summary.kept.length === 2);
const rep = X.apply(here, pv, { 1: 'replace', 3: 'replace' });
check('replace: same number of docs plus the new one, each replaced in its place', rep.docs.length === 5 && rep.docs[1].text === store[1].text && rep.docs[2].text === store[3].text && rep.summary.replaced.length === 2);
check('replace keeps this project\'s id (references here still point at the document)', rep.docs[1].id === 'doc-1760600000001-cd34e' && rep.docs[2].id === 'mine-3');
check('replace never clears a controlled flag: on here, off in the file, stays on', rep.docs[2].controlled === true);
check('replace takes the controlled flag from the file when it is on there', rep.docs[1].controlled === true);
check('replace takes the incoming name, revision, who and when', rep.docs[2].name === 'Flight controls requirements.reqif' && rep.docs[2].revision === '7' && rep.docs[2].addedBy === 'Dana Ortiz');
const both = X.apply(here, pv, {});
check('keep both (the default): two docs added beside the existing ones', both.docs.length === 7 && J(both.docs.slice(0, 4)) === J(here));
const bSdd = both.docs[4], bReq = both.docs[6];   // added in file order: the SDD, the pasted note (new), the requirements
check('keep both with a taken id: "doc-" + 12 hex of its sha256', bSdd.id === 'doc-' + nodeSha(store[1].text).slice(0, 12), bSdd.id);
check('keep both with a taken name: " (imported)" before the extension', bSdd.name === 'Propulsion SDD (imported).docx' && bReq.name === 'Flight controls requirements (imported).reqif', bSdd.name + ' | ' + bReq.name);
check('keep both with a free id keeps the file\'s id', bReq.id === 'doc-1760600000003-gh78i');
const twice = X.apply(both.docs, X.preview(both.docs, JSON.parse(J(Object.assign({}, v1.file, { docs: [Object.assign({}, v1.file.docs[1], { text: 'third version', sha256: nodeSha('third version') })] })))), {});
check('a third copy is named " (imported 2)" and gets a fresh id', twice.docs[7].name === 'Propulsion SDD (imported 2).docx' && /^doc-[0-9a-f]{12}$/.test(twice.docs[7].id) && twice.docs[7].id !== bSdd.id, twice.docs[7] && (twice.docs[7].name + ' ' + twice.docs[7].id));
check('deterministic: the same import twice gives the same list', J(X.apply(here, X.preview(here, v1.file), {}).docs) === J(both.docs));

console.log('\n[F] facts and the store mapping');
check('kind: lower-case extension, "text" without one', X.kindOf('A.PDF') === 'pdf' && X.kindOf('notes') === 'text' && X.kindOf('Pasted text, Oct 14, 2026') === 'text' && X.kindOf('model.xmi') === 'xmi' && X.kindOf('a.b.reqifz') === 'reqifz');
check('revision rule: same as the zonal AI review (Rev, Revision, Rev:, first 3000 characters only)', X.detectRevision('Rev. D') === 'D' && X.detectRevision('Revision 12') === '12' && X.detectRevision('x'.repeat(3001) + ' Rev C') === null && X.detectRevision('Reverse thrust') === null);
const Z = require(path.join(SITE, 'zonal_ai.js'));
check('the zonal review labels passages with the same revision', Z.passages({ id: 'd', name: 'd.pdf', text: PDF_TEXT })[0].revision === X.revisionOf({ text: PDF_TEXT }));
check('the zonal review uses a stored revision when there is one', Z.passages({ id: 'd', name: 'd.pdf', text: PDF_TEXT, revision: 'E' })[0].revision === 'E');
check('pages: distinct [p.N] markers', X.pageCount(PDF_TEXT) === 3 && X.pageCount('no pages') === 0 && X.pageCount('[p.1] a [p.1] b') === 1);
check('fromStoreDoc: an id-less doc gets "doc-" + 12 hex; a missing addedAt is null', (() => { const d = X.fromStoreDoc({ name: 'x.txt', text: 'hi' }); return d.id === 'doc-' + nodeSha('hi').slice(0, 12) && d.addedAt === null && d.addedBy === null && d.revision === null; })());

console.log('\n[G] mutation checks (break a rule, the checks catch it)');
const mutated = (from, to) => {
    if (SRC.indexOf(from) < 0) return null;
    const ctx = { module: { exports: {} }, TextEncoder, console };
    vm.runInNewContext(SRC.replace(from, to), ctx);
    return ctx.module.exports;
};
let M = mutated("if (typeof f.fingerprint !== 'string' || fingerprintOf(f.docs) !== f.fingerprint.toLowerCase()) return", 'if (false) return');
check('mutation: fingerprint not checked -> a swapped doc order would be accepted', M && (() => { const o = JSON.parse(text1); o.docs.reverse(); return M.verify(J(o)).ok === true; })());
M = mutated("if (sha256Hex(d.text) !== d.sha256.toLowerCase()) return", 'if (false) return');
check('mutation: doc sha not checked -> a changed text with the fingerprint recomputed would be accepted', M && (() => { const o = JSON.parse(text1); o.docs[0].text += 'x'; o.fingerprint = nodeSha(X.canonical(o.docs)); return M.verify(J(o)).ok === true && X.verify(J(o)).ok === false; })());
M = mutated("if (have[i2].id === _s(x.id)) m = { id: have[i2].id, name: have[i2].name, by: 'id'", "if (false) m = { id: have[i2].id, name: have[i2].name, by: 'id'");
check('mutation: no match by id -> the renamed SDD shows as new, which the preview check rejects', M && (() => { const p = M.preview([Object.assign({}, here[1], { name: 'renamed.docx' })], v1.file); return p.entries[1].status === 'new'; })());
M = mutated('doc.controlled = !!(doc.controlled || out[at].controlled);', 'doc.controlled = !!doc.controlled;');
check('mutation: replace without the controlled rule -> the flag would be cleared', M && M.apply(here, M.preview(here, v1.file), { 3: 'replace' }).docs[2].controlled === false);
M = mutated(".sort()\n            .map(function (k)", "\n            .map(function (k)");
check('mutation: canonical JSON without sorting -> a different fingerprint than the agreed one', M && M.fingerprintOf(f1.docs) !== f1.fingerprint);

console.log('\n[H] the format document');
const DOC = path.resolve(ROOT, '..', 'ai_inputs_format.md');
check('the module header documents every required doc field', REQ.every(k => new RegExp('//\\s+"' + k + '":').test(SRC)));
if (fs.existsSync(DOC)) {
    const md = fs.readFileSync(DOC, 'utf8');
    check('scratchpad/ai_inputs_format.md lists the same fields and rules', REQ.every(k => md.indexOf('"' + k + '"') >= 0) && md.indexOf('safetylab-ai-inputs') >= 0 && md.indexOf("Rev(?:ision)") >= 0 && /imported/.test(md));
} else console.log('  SKIP  scratchpad/ai_inputs_format.md is not beside this worktree');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
