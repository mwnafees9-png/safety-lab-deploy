// ============================================================================
// cert_basis_router.js — the deterministic bridge between ANEM and the
// cert-basis spine. v0.1
//
// ANEM is AI-backed and conversational. This router makes its REGULATORY answers
// repeatable and cited: for any turn, it scans the user's text for cert-basis
// terms, resolves them against CERT_BASIS (the spine), and returns a GROUNDING
// block that gets appended to ANEM's system prompt. The model then answers FROM
// the cited spine facts instead of its own memory — same question, same cited
// pointers, every time.
//
// DISCIPLINE:
//   · Pure + deterministic — no Date, no random, no model in the fact path. The
//     block is a function of (query, spine, injected PROB_TARGETS) only.
//   · Cite-and-point — it emits clause POINTERS + our objectives + the lane that
//     discharges them; it never emits licensed prose, and it flags pointer-only
//     clauses so the model says "cited, but the tool does not run this".
//   · Numbers are INJECTED — probability targets come from the tool's verified
//     PROB_TARGETS passed in, never hard-coded here (single source of truth).
//   · Fail-safe — no spine / no match → matched:false, empty block, ANEM behaves
//     exactly as before. It can only ADD grounding, never remove capability.
// ============================================================================
(function () {
    'use strict';

    // curated phrase → spine resolve-key synonyms (deterministic, fixed order).
    // Each maps a natural phrase a user might type to a key the spine indexes.
    const SYNONYMS = [
        ['development assurance', 'development assurance'], ['fdal', 'FDAL'], ['idal', 'IDAL'],
        ['dal', 'DAL'], ['independence', 'independence'], ['common cause', 'Common Cause'],
        ['common mode', 'Common Mode'], ['beta factor', 'ccf-beta'], ['beta-factor', 'ccf-beta'],
        ['β factor', 'ccf-beta'], ['beta value', 'ccf-beta'], ['ccf', 'Common Cause'],
        ['zonal', 'Zonal'], ['particular risk', 'Particular Risks'],
        ['safety assessment', 'safety assessment'], ['hazard assessment', 'Hazard Assessment'],
        ['functional hazard', 'Functional Hazard'], ['fault tree', 'Fault Tree'], ['fmea', 'FMEA'],
        ['fmes', 'FMES'], ['markov', 'Markov'], ['pssa', 'PSSA'], ['ssa', 'System Safety Assessment'],
        ['pasa', 'PASA'], ['fha', 'Functional Hazard'], ['cca', 'Common Cause'],
        ['continued safe flight', 'Continued Safe Flight'], ['csfl', 'Continued Safe Flight'],
        ['special condition', 'Special conditions'], ['issue paper', 'Issue papers'],
        ['changed product', 'Changed product'], ['cert basis', 'cert basis'],
        ['certification basis', 'Designation of applicable'], ['lightning', 'lightning'],
        ['hirf', 'HIRF'], ['rotor burst', 'rotor'], ['tire burst', 'Tire'], ['bird strike', 'Bird'],
        ['decompression', 'decompression'], ['sail', 'SAIL'], ['ground risk', 'Ground Risk'],
        ['air risk', 'Air Risk'], ['sora', 'SORA'], ['flight safety analysis', 'Flight safety analysis'],
        ['flight termination', 'Flight termination'], ['engine safety', 'Safety analysis'],
        ['propeller', 'propeller']
    ];

    const SEVERITIES = [['catastrophic', 'Catastrophic'], ['hazardous', 'Hazardous'],
                        ['major', 'Major'], ['minor', 'Minor']];

    // Build the deterministic trigger list from the spine itself + the curated
    // synonyms. term = what to look for in the user's text; key = what to hand to
    // resolve(). Order is stable: reg ids, then AC ids, then particular-risk
    // names, then the curated synonyms.
    function _triggers(CB) {
        const out = [];
        Object.keys(CB.REGS).forEach(function (id) { out.push([id.toLowerCase(), id]); });
        Object.keys(CB.ADVISORY).forEach(function (id) { out.push([id.toLowerCase(), id]); });
        CB.PARTICULAR_RISKS.forEach(function (p) { out.push([p.name.toLowerCase(), p.id]); out.push([p.id.replace(/-/g, ' '), p.id]); });
        SYNONYMS.forEach(function (s) { out.push([s[0], s[1]]); });
        return out;
    }

    // Detect an explicit cert basis + severity in the query so we can inject the
    // ONE verified probability target that answers "what's the X target for Y?".
    function _detectTarget(q, CB, probTargets) {
        let sev = null;
        for (let i = 0; i < SEVERITIES.length; i++) { if (q.indexOf(SEVERITIES[i][0]) >= 0) { sev = SEVERITIES[i][1]; break; } }
        let basis = null;
        // longest cert-basis key first so "Part 23 III" wins over "Part 23"
        const bases = CB.CERT_BASES.slice().sort(function (a, b) { return b.length - a.length; });
        for (let i = 0; i < bases.length; i++) { if (q.indexOf(bases[i].toLowerCase()) >= 0) { basis = bases[i]; break; } }
        if (!basis && q.indexOf('part 23') >= 0) {
            const m = q.match(/class\s*(iv|iii|ii|i)\b/);
            if (m) basis = 'Part 23 ' + m[1].toUpperCase();
        }
        if (!basis && q.indexOf('part 25') >= 0) basis = 'Part 25';
        if (!basis || !sev) return null;
        try { return CB.targetFor(basis, sev, probTargets); } catch (_) { return null; }
    }

    // ground(query, probTargets, certBasisApi?, betaBands?) → { matched, block, hits, cites }
    function ground(query, probTargets, certBasisApi, betaBands) {
        const empty = { matched: false, block: '', hits: 0, cites: [] };
        const CB = certBasisApi || (typeof window !== 'undefined' ? window.CERT_BASIS : null);
        if (!CB || typeof CB.resolve !== 'function') return empty;
        const q = String(query == null ? '' : query).toLowerCase();
        if (q.trim().length < 3) return empty;
        // the tool's verified β bands (beta_scoring.js) — injected, else read live.
        if (betaBands === undefined && typeof window !== 'undefined' && window.BETA_SCORING && typeof window.BETA_SCORING.bands === 'function') {
            try { betaBands = window.BETA_SCORING.bands(); } catch (_) { betaBands = null; }
        }

        const triggers = _triggers(CB);
        const seenRef = {}, hits = [];
        const regSeen = {}, regs = [];
        const prSeen = {}, prs = [];
        for (let i = 0; i < triggers.length; i++) {
            const term = triggers[i][0];
            if (!term || q.indexOf(term) < 0) continue;
            let r; try { r = CB.resolve(triggers[i][1]); } catch (_) { continue; }
            r.hits.forEach(function (h) { if (!seenRef[h.ref]) { seenRef[h.ref] = 1; hits.push(h); } });
            (r.regs || []).forEach(function (x) { if (!regSeen[x.id]) { regSeen[x.id] = 1; regs.push(x); } });
            (r.particularRisks || []).forEach(function (p) { if (!prSeen[p.id]) { prSeen[p.id] = 1; prs.push(p); } });
        }
        const target = _detectTarget(q, CB, probTargets);
        // common-cause β guidance — fires when a β/CCF clause matched (or the terms
        // appear), grounding ANEM in the cited anchors + the separation/diversity floor.
        let beta = null;
        const _betaHit = hits.some(function (h) { return h.ref === 'IEC 61508-6 Annex D'; }) ||
            /\bbeta\b|\bβ\b|common[- ]?cause|\bccf\b/.test(q);
        if (_betaHit && typeof CB.betaGuidance === 'function') { try { beta = CB.betaGuidance(betaBands); } catch (_) { beta = null; } }
        if (!hits.length && !regs.length && !prs.length && !target && !beta) return empty;

        // ---- build the grounding block (deterministic string) ----------------
        const L = [];
        L.push('CERTIFICATION-BASIS GROUNDING (deterministic, from Safety Lab’s cert-basis spine). Treat the clause/rule POINTERS below as AUTHORITATIVE: cite them exactly, never invent a clause number, and do not reproduce licensed standard text — point the user to the cited clause in the copy they own. Where a clause is marked POINTER-ONLY, say the tool cites it but does not run that method.');
        const cites = [];
        if (target) {
            L.push('\nVERIFIED TARGET — ' + target.certBasis + ' / ' + target.severity + ': ' +
                (target.target == null ? 'no per-flight-hour target (' + target.note + ')' : (target.target + ' per flight hour')) +
                '  [cite: ' + target.cite + ']. This number is from the tool’s verified target table — use it verbatim.');
        }
        if (hits.length) {
            L.push('\nAPPLICABLE CLAUSES (cite these):');
            hits.slice(0, 12).forEach(function (h) {
                cites.push(h.ref);
                const lanes = (h.coverage === 'pointer-only' || !h.dischargedBy.length)
                    ? 'POINTER-ONLY — cite only; the tool does not run this method'
                    : 'discharged in Safety Lab by: ' + h.dischargedBy.join(', ');
                L.push('  • ' + h.ref + ' — ' + h.title + ': ' + h.objective + ' (' + lanes + ')');
            });
        }
        if (regs.length) {
            L.push('\nREGULATIONS / ADVISORY MATERIAL (link the user to the source):');
            regs.slice(0, 8).forEach(function (x) { cites.push(x.id); L.push('  • ' + x.id + ' — ' + x.title + (x.link ? '  [' + x.link + ']' : '')); });
        }
        if (prs.length) {
            L.push('\nPARTICULAR RISKS (governing rules + the Safety Lab lane that handles them):');
            prs.slice(0, 8).forEach(function (p) { L.push('  • ' + p.name + ' — governed by ' + p.regs.join(', ') + ' — handled in the "' + p.lane + '" lane'); });
        }
        if (beta) {
            L.push('\nCOMMON-CAUSE β GUIDANCE (use these anchors; do NOT invent higher β): β ≈ ' + beta.floor +
                ' best-case (strong separation AND diversity), ≈ ' + beta.ordinary + ' with ordinary defences, up to ≈ ' + beta.ceiling +
                ' poorly defended. ' + beta.rule + '  [cite: ' + beta.cite + ']  ' + beta.note);
            cites.push('IEC 61508-6 Annex D', 'NUREG/CR-4780');
        }
        L.push('\nIf the user’s question is not answered by the material above, say so plainly and point to the framework list rather than guessing.');
        return { matched: true, block: L.join('\n'), hits: hits.length, cites: cites };
    }

    const API = { ground: ground, _triggers: _triggers };
    if (typeof window !== 'undefined') window.CERT_BASIS_ROUTER = API;
    if (typeof module !== 'undefined') module.exports = API;
})();
