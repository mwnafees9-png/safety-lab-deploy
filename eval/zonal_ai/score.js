#!/usr/bin/env node
// Offline, deterministic scorer for the zonal / particular risk AI eval (rule 29).
// Usage: node eval/zonal_ai/score.js eval/zonal_ai/recorded/<file>.json
// A recorded file is { label, source: 'model'|'handwritten', model, at, outputs: { caseId: rawText } }.
// Metrics (every one computed after the code post-check, exactly as the app shows a draft):
//   citationValidity  valid sources / all sources the answer cited
//   correctness       cases whose expected statements are present (accepted, citing the right
//                     report and page) and no trap is stated
//   hallucination     statements rejected as unsupported + accepted statements stating a trap,
//                     over all statements
//   gapDetection      cases where a gap is the right answer and the answer wrote a valid gap
'use strict';
const path = require('path'), fs = require('fs');
const Z = require(path.join(__dirname, '..', '..', 'site', 'zonal_ai.js'));
const F = require('./fixtures.js');

function citesPage(st, doc, page) {
    return (st.sources || []).some(s => s && s.type === 'report' && (s.doc === doc) && ((s.page == null ? null : parseInt(s.page, 10)) === page));
}
// a trap fires on an accepted fact that: has any of t.any, or all of t.factAll, or matches t.re (case-insensitive); and
// (15 Oct 2026) has none of t.none: a correct sentence that states the 12.4 kJ pass AND names 13.8 kJ as the design
// energy is not the trap, the trap is a sentence that claims the shield passed AT 13.8 kJ
function trapHit(t, facts) {
    const clear = s => !(t.none || []).some(w => s.text.indexOf(w) >= 0);
    if (t.any) return facts.some(s => clear(s) && t.any.some(w => s.text.indexOf(w) >= 0));
    if (t.factAll) { if (facts.some(s => clear(s) && t.factAll.every(w => s.text.indexOf(w) >= 0))) return true; if (!t.re) return false; }
    if (t.re) { const r = new RegExp(t.re, 'i'); return facts.some(s => clear(s) && r.test(s.text)); }
    return false;
}
function scoreCase(c, raw) {
    const ctx = Z.gather(c.lane, c.target, F.env());
    const v = Z.validate(raw, ctx);
    const parsed = Z.parseOutput(raw);
    let srcAll = 0, srcOk = 0;
    (parsed.statements || []).forEach(st => (st && Array.isArray(st.sources) ? st.sources : []).forEach(s => { srcAll++; if (Z.checkSource(s, ctx).ok) srcOk++; }));
    const claims = v.accepted.filter(s => s.kind === 'fact' || s.kind === 'interpretation');
    const facts = v.accepted.filter(s => s.kind === 'fact');
    const expectOk = c.expect.every(e => claims.some(s => e.all.every(w => s.text.indexOf(w) >= 0) && citesPage(s, e.doc, e.page)));
    const trapHits = [];
    c.traps.forEach(t => { if (trapHit(t, facts)) trapHits.push(t.why); });
    const gapOk = v.accepted.some(s => s.kind === 'gap');
    return { id: c.id, statements: (parsed.statements || []).length, rejected: v.rejected.length, srcAll, srcOk,
             correct: expectOk && !trapHits.length && (!c.expectGap || gapOk), expectOk, trapHits, expectGap: c.expectGap, gapOk,
             rejectedReasons: v.rejected.map(r => r.reasons.join('; ')) };
}
function score(rec) {
    const rows = F.CASES.filter(c => rec.outputs && rec.outputs[c.id] != null).map(c => scoreCase(c, rec.outputs[c.id]));
    const sum = k => rows.reduce((a, r) => a + r[k], 0);
    const stmts = sum('statements'), traps = rows.reduce((a, r) => a + r.trapHits.length, 0);
    const gapCases = rows.filter(r => r.expectGap);
    return {
        label: rec.label, source: rec.source, model: rec.model || null, cases: rows.length, of: F.CASES.length,
        citationValidity: sum('srcAll') ? sum('srcOk') / sum('srcAll') : null,
        correctness: rows.length ? rows.filter(r => r.correct).length / rows.length : null,
        hallucination: stmts ? (sum('rejected') + traps) / stmts : null,
        gapDetection: gapCases.length ? gapCases.filter(r => r.gapOk).length / gapCases.length : null,
        rows
    };
}
module.exports = { trapHit, score, scoreCase };
if (require.main === module) {
    const f = process.argv[2];
    if (!f) { console.log('usage: node eval/zonal_ai/score.js <recorded.json>'); process.exit(2); }
    const r = score(JSON.parse(fs.readFileSync(f, 'utf8')));
    const pct = x => x == null ? 'n/a' : (100 * x).toFixed(1) + '%';
    console.log(r.label + ' (' + r.source + (r.model ? ', ' + r.model : '') + '): ' + r.cases + ' of ' + r.of + ' cases');
    console.log('  citation validity ' + pct(r.citationValidity) + ', correctness ' + pct(r.correctness) + ', hallucination ' + pct(r.hallucination) + ', gap detection ' + pct(r.gapDetection));
    r.rows.forEach(x => console.log('  ' + (x.correct ? 'OK  ' : 'MISS') + ' ' + x.id + (x.trapHits.length ? '  trap: ' + x.trapHits.join('; ') : '') + (x.rejected ? '  rejected ' + x.rejected : '')));
}
