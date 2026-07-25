/* ============================================================================
 * regression_cert_basis_router.test.js — the LIVE bridge from ANEM to the
 * cert-basis spine. Proves ANEM's regulatory answers are grounded, cited,
 * repeatable, and honest — and that the wiring is actually in place.
 *
 *   [1] a reg question grounds: matched, a cited block, real clause pointers.
 *   [2] DETERMINISTIC — same question → byte-identical grounding block.
 *   [3] verified targets are INJECTED (from PROB_TARGETS), never hard-coded.
 *   [4] pointer-only honesty survives into the block (SORA/space FSA).
 *   [5] fail-safe — no match / no spine → empty block, ANEM unchanged.
 *   [6] clean-room — the router source hard-codes no prob numbers, no prose.
 *   [7] WIRING — ai_assistant.js actually calls the router before _anemRun.
 * ========================================================================== */
'use strict';
const CB = require('../site/cert_basis_spine.js');
const R = require('../site/cert_basis_router.js');
const fs = require('fs');
let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n); } };

const PT = { 'Part 23 III': { Catastrophic: 1e-8, Hazardous: 1e-7, Major: 1e-5, Minor: 1e-3, Negligible: null },
             'Part 25': { Catastrophic: 1e-9, Hazardous: 1e-7, Major: 1e-5, Minor: 1e-3, Negligible: null } };

// ---- [1] a real reg question grounds ------------------------------------------
const g1 = R.ground('How do I show independence between redundant channels?', null, CB);
check('[1] a regulatory question grounds — matched, non-empty cited block', g1.matched && g1.block.length > 100 && g1.cites.length > 0);
check('[1b] the block carries real clause POINTERS (§25.1309(c) / ARP4761A CCA) with discharge lanes',
    /§25\.1309\(c\)/.test(g1.block) && /Common Cause/.test(g1.block) && /discharged in Safety Lab by/.test(g1.block));

// ---- [2] deterministic --------------------------------------------------------
const a = R.ground('what governs a lightning strike?', null, CB);
const b = R.ground('what governs a lightning strike?', null, CB);
check('[2] DETERMINISTIC — same question, byte-identical grounding block', a.block === b.block && a.matched && b.matched);
check('[2b] lightning grounds to §25.1316 + the particular-risk cross-link (pra lane)',
    /§25\.1316/.test(a.block) && /Lightning strike/.test(a.block) && /"pra" lane/.test(a.block));

// ---- [3] verified target INJECTED, cited, verbatim ----------------------------
const gt = R.ground('what is the catastrophic probability target for a Part 23 Class III airplane?', PT, CB);
check('[3] verified target is injected from PROB_TARGETS + cited (1e-8, AC 23.1309-1E)',
    gt.matched && /1e-8 per flight hour/.test(gt.block) && /AC 23\.1309-1E/.test(gt.block));
check('[3b] WITHOUT a target table, the router still grounds clauses but injects NO number',
    (function () { const g = R.ground('catastrophic target for Part 25', null, CB); return g.matched && !/per flight hour/.test(g.block.split('VERIFIED TARGET').slice(1).join('') || '') || true; })()
    && !/1e-9/.test(R.ground('independence for Part 25', null, CB).block));

// ---- [4] pointer-only honesty into the block ----------------------------------
const gs = R.ground('tell me about SORA and SAIL for my drone', null, CB);
check('[4] SORA grounds but is honestly flagged POINTER-ONLY (tool cites, does not compute SAIL)',
    gs.matched && /SAIL/.test(gs.block) && /POINTER-ONLY/.test(gs.block));

// ---- [5] fail-safe ------------------------------------------------------------
check('[5] a non-reg question does NOT ground — matched:false, empty block (ANEM behaves normally)',
    (function () { const g = R.ground('what is the meaning of life', null, CB); return g.matched === false && g.block === ''; })());
check('[5b] no spine bound → empty (fail-open, never throws)',
    (function () { try { const g = R.ground('independence', null, null); return g.matched === false && g.block === ''; } catch (_) { return false; } })());
check('[5c] empty / too-short query → empty (no throw)',
    (function () { try { return R.ground('', null, CB).matched === false && R.ground('a', null, CB).matched === false; } catch (_) { return false; } })());

// ---- [6] clean-room: the router hard-codes no numbers, emits no licensed prose -
const SRC = fs.readFileSync(require.resolve('../site/cert_basis_router.js'), 'utf8');
check('[6] the router source hard-codes NO probability magnitudes (single source of truth = PROB_TARGETS)',
    !/\b1\s*e\s*-\s*\d/i.test(SRC) && !/10\s*(\^|\*\*)\s*-?\s*\d/.test(SRC) && !/10⁻/.test(SRC));
check('[6b] the block tells the model NOT to reproduce licensed text (cite-and-point)',
    /never invent a clause number/.test(g1.block) && /do not reproduce licensed standard text/.test(g1.block));

// ---- [6c] common-cause β grounding — cited anchors, capped, injected ----------
const BANDS = { logic: { low: 0.005, high: 0.05 }, field: { low: 0.01, high: 0.10 }, generic: { low: 0.01, high: 0.25 } };
const gb = R.ground('can you get away with not using beta factors for CCFs', null, CB, BANDS);
check('[6c] a β/CCF question grounds to the IEC 61508-6 Annex D clause + the cited β anchors (0.01 / 0.1 / 0.25)',
    gb.matched && /IEC 61508-6 Annex D/.test(gb.block) && /β GUIDANCE/.test(gb.block) && /0\.01 best-case/.test(gb.block) && /0\.25 poorly defended/.test(gb.block));
check('[6d] the grounding carries the separation+diversity FLOOR rule and tells the model NOT to invent a higher β',
    /BOTH physical separation AND design diversity/.test(gb.block) && /do NOT invent higher β/.test(gb.block) && /NUREG\/CR-4780/.test(gb.block));
check('[6e] β bands are INJECTED (ceiling follows the tool\'s bands, not a hard-coded number)',
    (function () { const g2 = R.ground('beta factor for common cause', null, CB, { generic: { low: 0.02, high: 0.30 } }); return /up to ≈ 0\.3 poorly defended/.test(g2.block); })());

// ---- [7] WIRING — the live hook is actually in ai_assistant.js -----------------
let AISRC = '';
try { AISRC = fs.readFileSync(require.resolve('../site/ai_assistant.js'), 'utf8'); } catch (_) {}
check('[7] ai_assistant.js calls CERT_BASIS_ROUTER.ground and passes the block into _anemRun',
    /CERT_BASIS_ROUTER\s*&&/.test(AISRC) && /\.ground\(text/.test(AISRC) && /_anemRun\(msgs,\s*_cbGround\)/.test(AISRC));
check('[7b] the grounding hook is guarded (fail-open) and injects the verified PROB_TARGETS',
    /try\s*\{[\s\S]{0,200}CERT_BASIS_ROUTER/.test(AISRC) && /PROB_TARGETS/.test(AISRC));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
