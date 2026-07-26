/* ============================================================================
 * regression_cert_basis.test.js — the ANEM cert-basis spine, and its
 * CLEAN-ROOM guarantee. The whole point: prove we index & operationalise the
 * standard without reproducing it.
 *
 *   [1] framework metadata + reference graph present and honest.
 *   [2] clause index: every entry is a pointer + our summary + a discharge map.
 *   [3] CLEAN-ROOM (the anti-rip-off enforcement): licensed frameworks store
 *       ONLY short own-words summaries — no long-form prose, no text/body field,
 *       and every licensed framework carries a purchase link. Rip-off = FAIL.
 *   [4] deterministic resolve: same query → same cited hits; refuses empty;
 *       invents nothing on a miss.
 *   [5] facts: baseline FDAL/IDAL by severity; refusal on unknown.
 *   [6] cite() returns a pointer, never prose; discharge maps to real lanes.
 * ========================================================================== */
'use strict';
const C = require('../site/cert_basis_spine.js');
let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n); } };
const throws = f => { try { f(); return false; } catch (_) { return true; } };

// ---- [1] frameworks + references ----------------------------------------------
const fw = C.framework('ARP4754B');
check('[1] ARP4754B framework registered, licensed, with rev + publisher',
    fw && fw.licensed === true && fw.rev === 'B' && /SAE/.test(fw.publisher));
const fw61 = C.framework('ARP4761A');
check('[1d] ARP4761A framework registered, licensed, methods, ED-135 equivalent',
    fw61 && fw61.licensed === true && fw61.kind === 'methods' && (fw61.equivalents || []).indexOf('EUROCAE ED-135') >= 0);
check('[1b] reference graph carries the cross-corpus (4761A, Parts 21/23/25/33, DO-178C, CS-25)',
    ['ARP4761A', '14 CFR Part 21', '14 CFR Part 23', '14 CFR Part 25', '14 CFR Part 33', 'DO-178C', 'CS-25']
        .every(id => C.REFERENCES.some(r => r.id === id)));
check('[1c] public vs licensed correctly flagged (FARs public, SAE/RTCA licensed)',
    C.REFERENCES.find(r => r.id === '14 CFR Part 25').licensed === false &&
    C.REFERENCES.find(r => r.id === 'ARP4761A').licensed === true &&
    C.REFERENCES.find(r => r.id === 'DO-178C').licensed === true);

// ---- [2] clause index ---------------------------------------------------------
check('[2] every clause carries a short ref POINTER, a title, an objective, and a discharge map (or an honest pointer-only flag)',
    C.CLAUSES.length >= 50 && C.CLAUSES.every(c =>
        typeof c.ref === 'string' && c.ref.length >= 3 && c.ref.length <= 40 &&
        c.title && c.objective && Array.isArray(c.dischargedBy) &&
        (c.dischargedBy.length >= 1 || c.coverage === 'pointer-only')));
check('[2b] the safety-assessment spine is indexed (AFHA · PSSA · SSA · DAL)',
    ['4754B-5.1.1', '4754B-5.1.4', '4754B-5.1.5', '4754B-5.2'].every(id => C.clause(id)));
check('[2c] ARP4761A methods toolbox indexed (FHA · PASA · PSSA · SSA · ASA · FTA · Markov · FMES · CCA · ZSA · PRA · CMA · FDAL)',
    ['4761A-3.2', '4761A-3.3', '4761A-3.5', '4761A-3.6', '4761A-3.7', '4761A-4.1', '4761A-4.1-ma', '4761A-4.2', '4761A-4.3', '4761A-4.4', '4761A-4.5', '4761A-4.6', '4761A-3.9'].every(id => C.clause(id)));
check('[2e] 14 CFR + AC regulatory anchors indexed (§25.1309 · §23.2510 · §33.75 · §35.15 · AC 25.1309 · AC 23.1309 · AC 20-174)',
    ['far-25.1309b', 'far-25.1309c', 'far-23.2510', 'far-27.1309', 'far-29.1309', 'far-33.75', 'far-35.15', 'far-450.107', 'ac-25.1309', 'ac-23.1309', 'ac-20-174'].every(id => C.clause(id)));
// discharge honesty: EVERY lane EVERY clause claims to discharge to must be a
// REAL Safety Lab nav lane (no phantom lanes — the map has to be usable in-tool).
const REAL_LANES = new Set(['ac-asm','ac-fcim','ac-fha','ac-func','ac-req','ai','anem','appa','arp-process','asa','assumptions','ccmr','cea','cm','cma','dal-ref','dashboard','defs','eta','evpkg','fmes','fta','golden-thread','gt-integrity','hfa','ipledger','items','lcc','library','markov','mmel','moc','mod','msg3x','oos','pasa','phases','pr','pra','pssa','ram-alloc','ram-growth','ram-lora','ram-msg3','ram-mx','ram-pmopt','ram-rbd','ram-rel','ram-settings','ram-test','ram-tol','ram-weibull','rbd-mc','rel-frameworks','reqif','reqs-repo','review','routing','sneak','spp','ssa','sse','sora-thread','stpa','swrel','sys-dir','trace','val-matrix','validation','vv-status','ws-locks','xmi','zsa']);
const phantom = [];
C.CLAUSES.forEach(c => c.dischargedBy.forEach(l => { if (!REAL_LANES.has(l)) phantom.push(c.id + '→' + l); }));
check('[2d] ALL clauses discharge only to REAL Safety Lab lanes (no phantom lanes)' + (phantom.length ? ' — offenders: ' + phantom.join(', ') : ''),
    phantom.length === 0);

// ---- [3] CLEAN-ROOM — the anti-rip-off enforcement ----------------------------
const licensedFws = Object.values(C.FRAMEWORKS).filter(f => f.licensed);
check('[3] every LICENSED framework carries a purchase link (buy the source, don\'t copy it)',
    licensedFws.length > 0 && licensedFws.every(f => /^https?:\/\//.test(f.purchase)));
check('[3b] NO clause stores long-form prose — summaries are our own one-liners (≤ 240 chars)',
    C.CLAUSES.every(c => c.objective.length <= 240));
check('[3c] NO clause or framework carries a text/prose/body/paragraph field (structure + pointers only)',
    C.CLAUSES.every(c => c.text === undefined && c.prose === undefined && c.body === undefined && c.paragraph === undefined) &&
    Object.values(C.FRAMEWORKS).every(f => f.text === undefined && f.prose === undefined && f.body === undefined));
check('[3d] the module says so out loud: licensed text lives in the licensed copy, we cite & point',
    /Cite-and-point/.test(C.resolve('safety assessment').note));

// ---- [4] deterministic resolve ------------------------------------------------
const r1 = C.resolve('DAL'), r2 = C.resolve('DAL');
check('[4] deterministic — same query, byte-identical cited hits', JSON.stringify(r1) === JSON.stringify(r2));
check('[4b] a real topic resolves to cited clauses with the discharge lanes',
    C.resolve('safety assessment').matched >= 1 && C.resolve('safety assessment').hits[0].dischargedBy.length > 0);
check('[4c] a lane id resolves back to the objective it discharges (ssa → SSA clause)',
    C.resolve('ssa').hits.some(h => /System Safety Assessment/.test(h.title)));
check('[4d] a miss INVENTS NOTHING — empty hits + an honest note naming the frameworks',
    (function () { const r = C.resolve('quantum flux capacitor'); return r.matched === 0 && /nothing invented/i.test(r.note); })());
check('[4e] empty query refused', throws(() => C.resolve('')));

// ---- [5] facts: baseline DAL by severity --------------------------------------
check('[5] baseline FDAL by severity: Catastrophic→A, Hazardous→B, Major→C, Minor→D, NSE→E',
    C.dalFor('Catastrophic').dal === 'A' && C.dalFor('Hazardous').dal === 'B' &&
    C.dalFor('Major').dal === 'C' && C.dalFor('Minor').dal === 'D' && C.dalFor('No Safety Effect').dal === 'E');
check('[5b] the DAL fact cites the clause + flags that reduction is allowed', /ARP4754B §5.2/.test(C.dalFor('Major').basis) && /reduction/i.test(C.dalFor('Major').basis));
check('[5c] unknown severity refused (no guess)', throws(() => C.dalFor('Somewhat Bad')));

// ---- [6] cite + discharge -----------------------------------------------------
check('[6] cite() returns a clause POINTER (ref + title), never prose',
    C.cite('4754B-5.2') === 'ARP4754B §5.2 — Development Assurance Level Assignment');
check('[6b] discharge() maps an objective to real Safety Lab lanes',
    (function () { const d = C.discharge('4754B-5.1.1'); return d.dischargedBy.indexOf('ac-fha') >= 0 && /ARP4761A/.test(d.related.join(' ')); })());
check('[6c] unknown clause refused', throws(() => C.cite('4754B-9.9')) && throws(() => C.discharge('nope')));

// ---- [7] FARs + ACs: public-domain corpus + single-source-of-truth targets -----
check('[7] the FAR parts are registered (21/23/25/27/29/33/35/450/107) with eCFR links, flagged public',
    ['Part 21', 'Part 23', 'Part 25', 'Part 27', 'Part 29', 'Part 33', 'Part 35', 'Part 450', 'Part 107']
        .every(id => { const r = C.reg(id); return r && r.licensed === false && /ecfr\.gov/.test(r.link); }));
check('[7b] the AC family is registered (25.1309 · 23.1309 · 27-1B · 29-2C · 20-174 · 20-115D · 20-152A) with FAA links',
    ['AC 25.1309-1A', 'AC 23.1309-1E', 'AC 27-1B', 'AC 29-2C', 'AC 20-174', 'AC 20-115D', 'AC 20-152A']
        .every(id => { const a = C.advisory(id); return a && a.licensed === false && /faa\.gov/.test(a.link); }));
check('[7c] "part 33" and "AC 23.1309" RESOLVE to the reg/AC card (not just clauses)',
    C.resolve('part 33').regs.some(r => r.id === 'Part 33') && C.resolve('AC 23.1309').regs.some(r => r.id === 'AC 23.1309-1E'));
// SINGLE SOURCE OF TRUTH — the spine stores NO probability numbers. It looks them
// up in an INJECTED table (the tool's verified PROB_TARGETS) and cites the AC.
const STUB = { 'Part 23 III': { Catastrophic: 1e-8, Hazardous: 1e-7 }, 'Part 25': { Catastrophic: 1e-9 } };
check('[7d] targetFor injects the verified number + cites the AC (Part 23 III Catastrophic → 1e-8, AC 23.1309-1E)',
    (function () { const t = C.targetFor('Part 23 III', 'Catastrophic', STUB); return t.target === 1e-8 && /AC 23\.1309-1E/.test(t.cite); })());
check('[7e] with NO table injected, targetFor returns target:null + points at safety_targets.js (invents no number)',
    (function () { const t = C.targetFor('Part 25', 'Catastrophic'); return t.target === null && /safety_targets\.js/.test(t.note); })());
check('[7f] mission-based basis (Part 450) has a null per-FH target, honestly noted',
    (function () { const t = C.targetFor('Part 450', 'Catastrophic', { 'Part 450': { Catastrophic: null } }); return t.target === null && /mission\/SORA-based/.test(t.note); })());
check('[7g] unknown cert basis refused (no guess)', throws(() => C.targetFor('Part 99', 'Catastrophic', STUB)));
// The strongest guarantee: SCAN THE SOURCE — no probability magnitude literal is
// hard-coded anywhere in the spine, so it can never drift from the tool's table.
const SRC = require('fs').readFileSync(require.resolve('../site/cert_basis_spine.js'), 'utf8');
check('[7h] SOURCE SCAN — the spine hard-codes NO probability magnitudes (1e-7/1e-9/10^-9 …): one source of truth',
    !/\b1\s*e\s*-\s*\d/i.test(SRC) && !/10\s*(\^|\*\*|<sup>)\s*-?\s*\d/.test(SRC) && !/10−\d|10⁻/.test(SRC));

// ---- [8] SC-VTOL + Part 450 detail + tailoring layer, coverage-honest -----------
check('[8] SC-VTOL registered (EASA special condition) + its clauses indexed (CS&FL · safety objectives · methodology · severity)',
    (function () { const r = C.reg('SC-VTOL'); return r && r.authority === 'EASA' && r.kind === 'special-condition' &&
        ['scvtol-2510', 'scvtol-2511', 'scvtol-2521', 'scvtol-2526'].every(id => C.clause(id)); })());
check('[8b] Part 450 flight-safety-analysis detail indexed (safety criteria · system-safety program · FSA · FTS)',
    ['far-450.101', 'far-450.103', 'far-450.107', 'far-450.108'].every(id => C.clause(id)));
check('[8c] cert-basis TAILORING layer indexed (§21.16 special conditions · §21.17 cert basis · §21.101 changed product · issue papers)',
    ['far-21.16', 'far-21.17', 'far-21.101', 'ip-process'].every(id => C.clause(id)) &&
    C.clause('far-21.16').dischargedBy.indexOf('ipledger') >= 0 && C.clause('ip-process').dischargedBy.indexOf('ipledger') >= 0);
// HONESTY: a pointer-only clause must NOT claim any discharge lane (we cite the rule
// but never pretend the tool runs the method — e.g. Part 450 debris/casualty FSA).
check('[8d] pointer-only clauses claim ZERO discharge lanes (no overclaiming tool coverage)',
    C.CLAUSES.filter(c => c.coverage === 'pointer-only').length >= 2 &&
    C.CLAUSES.filter(c => c.coverage === 'pointer-only').every(c => c.dischargedBy.length === 0));
check('[8e] SC-VTOL is FULLY covered (its safety-assessment clauses discharge to real lanes) — not pointer-only',
    ['scvtol-2510', 'scvtol-2511', 'scvtol-2521'].every(id => { const c = C.clause(id); return (c.coverage || 'full') !== 'pointer-only' && c.dischargedBy.length >= 1; }));
check('[8f] discharge()/resolve() report coverage so ANEM can say "cited, but the tool does not run this"',
    C.discharge('far-450.107').coverage === 'pointer-only' && C.resolve('flight safety analysis').hits.some(h => h.coverage === 'pointer-only'));
check('[8g] "SC-VTOL" and "special condition" RESOLVE to the tailoring material',
    C.resolve('SC-VTOL').regs.some(r => r.id === 'SC-VTOL') && C.resolve('special condition').hits.some(h => /Special conditions/.test(h.title)));

// ---- [9] SORA (Part 107) · CS-E/CS-P equivalents · particular-risk cross-link ---
check('[9] JARUS SORA registered + GRC/SAIL COMPUTED by the SORA Thread (reconciled 26 Jul — the engine is real now); ARC partial (declared, derivation refuses)',
    C.advisory('JARUS SORA 2.5') &&
    (function () { const g = C.clause('sora-grc'), a = C.clause('sora-arc'), sl = C.clause('sora-sail');
        return g && g.coverage === 'full' && g.dischargedBy.indexOf('sora-thread') >= 0 &&
               sl && sl.coverage === 'full' && sl.dischargedBy.indexOf('sora-thread') >= 0 &&
               a && a.coverage === 'partial' && /refuses/.test(a.objective); })());
check('[9b] EASA CS-E 510 / CS-P 70 equivalents indexed, fully covered, cross-referenced to §33.75 / §35.15',
    (function () { const e = C.clause('cse-510'), p = C.clause('csp-70');
        return e && p && C.reg('CS-E') && C.reg('CS-P') &&
            e.dischargedBy.indexOf('fmes') >= 0 && /§33\.75/.test(e.related.join(' ')) && /§35\.15/.test(p.related.join(' ')); })());
check('[9c] particular-risk FARs indexed (lightning §25.1316 · HIRF §25.1317 · rotor debris §25.903(d)(1) · tire §25.734 · decompression §25.841)',
    ['far-25.1316', 'far-25.1317', 'far-25.903d1', 'far-25.734', 'far-25.841'].every(id => C.clause(id)));
check('[9d] particular-risk CROSS-LINK: "lightning" resolves to §25.1316 + the PRA lane; rotor burst routes to Routing',
    (function () { const r = C.resolve('lightning');
        return r.particularRisks.some(p => p.id === 'lightning' && p.lane === 'pra' && /§25\.1316/.test(p.regs.join(' '))) &&
            C.particularRisks().some(p => p.id === 'rotor-burst' && p.lane === 'routing'); })());
check('[9e] particularRisks() cross-link points every risk at a REAL lane and its governing rules',
    C.PARTICULAR_RISKS.length >= 6 && C.particularRisks().every(p => p.regs.length >= 1 && ['pra', 'routing', 'zsa'].indexOf(p.lane) >= 0));
check('[9f] the debris-cone risks route to the Routing (zone-spanning) lane, not PRA',
    C.particularRisks().filter(p => ['rotor-burst', 'tire-burst'].indexOf(p.id) >= 0).every(p => p.lane === 'routing'));

// ---- [10] common-cause β-factor: cited, injected, capped ----------------------
check('[10] IEC 61508-6 framework registered (licensed + purchase link) and NUREG/CR-4780/5485 in the reference graph',
    (function () { const f = C.framework('IEC 61508-6'); return f && f.licensed === true && /^https?:\/\//.test(f.purchase) &&
        ['NUREG/CR-4780', 'NUREG/CR-5485'].every(id => C.REFERENCES.some(r => r.id === id && r.licensed === false)); })());
check('[10b] the β-quantification clause is indexed and discharges to the CMA lane, cross-linked to NUREG + ARP4761A',
    (function () { const c = C.clause('ccf-beta'); return c && c.dischargedBy.indexOf('cma') >= 0 && /NUREG/.test(c.related.join(' ')) && /ARP4761A/.test(c.related.join(' ')); })());
check('[10c] betaGuidance() INJECTS the tool\'s verified bands (floor/ceiling from beta_scoring.js), ordinary = NUREG 0.1',
    (function () { const g = C.betaGuidance({ generic: { low: 0.02, high: 0.30 } }); return g.floor === 0.02 && g.ceiling === 0.30 && g.ordinary === 0.1 && /beta_scoring\.js/.test(g.note); })());
check('[10d] with NO bands injected it falls back to the NUREG published anchors (0.01 / 0.1 / 0.25), never invented',
    (function () { const g = C.betaGuidance(); return g.floor === 0.01 && g.ordinary === 0.1 && g.ceiling === 0.25 && /NUREG/.test(g.note); })());
check('[10e] the β floor RULE is stated — a low β requires BOTH separation AND diversity (NUREG/CR-4780), with IEC + NUREG citation',
    (function () { const g = C.betaGuidance(); return /separation/i.test(g.rule) && /diversity/i.test(g.rule) && /IEC 61508-6 Annex D/.test(g.cite) && /NUREG/.test(g.cite); })());

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
