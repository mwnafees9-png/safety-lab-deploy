#!/usr/bin/env node
/*
 * Regression — SAE J3307 (STPA) hard-coded into the AI spine.
 *   [1] data integrity: stpa_kb_data.js exposes 23 chunks with the corpus
 *       schema {id, source, topic, text}, ids stpa-01..stpa-23 unique and
 *       contiguous, every chunk attributed to 'SAE J3307 MAR2025'.
 *   [2] doctrine: J3307 is COPYRIGHTED and none of it is stored — the module
 *       declares the discipline, carries zero normative "shall" prose, and has
 *       no RNG/Date/eval (the sora_kb_data.js posture, applied identically).
 *   [3] content lock: the facts the assistant must never get wrong are pinned
 *       — 4 steps / 14 sub-steps / 27 work products, the four UCA types, the
 *       mandated five-part UCA format and the ACTUAL-TRUE-STATE rule, 4a's six
 *       causes, 4b's ten, the five control-structure element types, the four
 *       human mental-model types, SIP NOT required, risk estimation OUT of
 *       scope, and J3307 as a method standard rather than a means of compliance.
 *   [4] the erratum lock: Table 1's 3a row is defective in the published
 *       standard; the corpus encodes 3a-1/3a-2 from the BODY clause and says so,
 *       so the assistant cannot repeat the standard's own defect.
 *   [5] wiring: ai_assistant.js merges SL_STPA_KB into the retrieval corpus,
 *       carries J3307 vocabulary in _FTAKB_SYN, injects the J3307 preamble
 *       bullet, grounds the chat surface on the last user turn with the 'chat'
 *       framing, and exposes the read-only kbRetrieve QA hook.
 *   [6] load order: ai_loader FILES lists stpa_kb_data before ai_assistant;
 *       index.html's loader cache-buster was bumped.
 *   [7] the standalone ANEM demo answers J3307 questions from encoded content,
 *       with the STPA entries ordered ahead of the aircraft entries, no chip
 *       falling through to the generic fallback, and the deploy copy in sync.
 * Run: node tests/regression_stpa_kb.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

const KB = require('../site/stpa_kb_data.js');
const ksrc = S('stpa_kb_data.js');
const asrc = S('ai_assistant.js');
const ALL = KB.chunks.map(c => c.text).join('\n');
const has = re => re.test(ALL);

// ---- [1] data integrity ----------------------------------------------------------
{
    check('exactly 23 J3307 chunks', KB.chunks.length === 23, 'got ' + KB.chunks.length);
    check('every chunk carries {id, source, topic, text} with real text',
        KB.chunks.every(c => c.id && c.source && c.topic && typeof c.text === 'string' && c.text.length > 300));
    check('ids are stpa-01..stpa-23, unique and contiguous', (function () {
        const ids = KB.chunks.map(c => c.id);
        if (new Set(ids).size !== ids.length) return false;
        return ids.every((id, i) => id === 'stpa-' + String(i + 1).padStart(2, '0'));
    })());
    check('every chunk is attributed to SAE J3307 MAR2025',
        KB.chunks.every(c => c.source === 'SAE J3307 MAR2025'));
    check('browser global is SL_STPA_KB with version + method, node export carries chunks',
        /window\.SL_STPA_KB = \{ version: 1, method: 'lexical'/.test(ksrc) && Array.isArray(KB.chunks));
}

// ---- [2] doctrine — cite and point, never paste -----------------------------------
{
    check('module declares the copyright discipline (COPYRIGHTED + original prose + never paste)',
        /COPYRIGHTED/.test(ksrc) && /ORIGINAL/.test(ksrc) && /never paste/i.test(ksrc));
    check('no normative standard prose stored — zero "shall" clauses in the corpus',
        (ALL.match(/\bshall\b/gi) || []).length === 0);
    const codeLines = ksrc.split('\n').filter(l => !/^\s*[/*]/.test(l));
    check('no RNG/Date/eval in the data module',
        codeLines.every(l => l.indexOf('Math.random') === -1 && !/\bnew Date\b|\bDate\.now\b/.test(l)) &&
        ksrc.indexOf('(0, eval)') === -1 && ksrc.indexOf('new Function') === -1);
}

// ---- [3] content lock — the facts the assistant must not get wrong ----------------
{
    check('four steps / fourteen sub-steps / twenty-seven work products',
        has(/four steps/i) && has(/fourteen sub-steps/i) && has(/twenty-seven numbered work products/i));
    check('the artifact-plus-link pattern: -1 is the artifact, -2/-3 are traceability links',
        has(/-1 is the artifact/i) && has(/-2 or -3 are the traceability links/i) && has(/roughly half the required deliverables are links/i));
    check('the traceability spine: losses ← hazards ← UCAs ← loss scenarios',
        has(/loss/i) && has(/system-level hazard/i) && has(/unsafe control action/i) && has(/loss scenario/i) &&
        !!KB.chunks.find(c => /traceability spine/i.test(c.topic)));
    check('the four UCA types are all four, with the continuous-only caveat on the fourth',
        has(/not providing the control action causes a hazard/i) &&
        has(/providing the control action causes a hazard/i) &&
        has(/too early, too late, or out of order/i) &&
        has(/stopping it too soon or applying it too long/i) &&
        has(/applies to continuous control actions and is not applicable to discrete/i));
    check('the mandated five-part UCA format is encoded (source/type/action/context/hazard link)',
        has(/five-part form: the source controller, the type from the four, the control action itself, the context/i) &&
        has(/link to the hazard/i));
    check('the ACTUAL-TRUE-STATE rule: a controller belief is a Step 4 cause, never a UCA context',
        has(/actual true state of the process, never what the controller believes/i) &&
        has(/belongs in Step 4 as a process-model flaw/i));
    check("Step 4a's six causes — four controller-side, two feedback-side, evaluate all six",
        has(/unsafe control algorithm/i) && has(/unsafe process model or mental model/i) &&
        has(/feedback that is not received at all/i) && has(/Evaluating all six/i));
    check("Step 4b exists as its own class with seven control-path + three controlled-process causes",
        has(/seven causes on the control path/i) && has(/three on the controlled process side/i) &&
        has(/most analyses omit entirely/i));
    check('the five control-structure element types, including "other inputs and outputs"',
        has(/exactly five kinds of element/i) && has(/Other inputs and outputs/i) &&
        has(/neither a control action nor feedback/i));
    check('controllers carry process models, responsibilities and authority/precedence',
        has(/process model/i) && has(/responsibilit/i) && has(/authority/i));
    check('the four human mental-model types, incl. the model of other controllers',
        has(/four distinct mental models/i) && has(/model of the other controllers/i) && has(/human-factors/i));
    check('SIP is explicitly NOT required',
        has(/Safety Improvement Process/i) && has(/explicitly noted as not required/i));
    check('risk estimation is OUT of scope — no severity, likelihood or risk index',
        has(/Risk estimation is out of scope/i) && has(/does not define severity classes, likelihood, or risk indices/i) &&
        has(/ISO 26262|MIL-STD-882E/));
    check('J3307 is a method standard, NOT an accepted means of compliance',
        has(/method standard/i) && /not (itself |on its own, )?an accepted means of compliance/i.test(ALL));
    check('STPA complements the classical spine rather than replacing FHA/FTA/FMEA',
        has(/complementary to the classical safety spine, never a replacement/i) && has(/FMEA/) && has(/FTA/));
    check('Appendix C archetypes and Appendix E abstraction levels are both covered',
        !!KB.chunks.find(c => /Appendix C/.test(c.topic)) && !!KB.chunks.find(c => /Appendix E/.test(c.topic)));
    check('clause 9 puts the burden on DEMONSTRATING fulfilment',
        !!KB.chunks.find(c => /Clause 9/i.test(c.topic)) && /demonstrate/i.test(ALL));
}

// ---- [4] the erratum lock ---------------------------------------------------------
{
    const c13 = KB.chunks.find(x => x.id === 'stpa-13');
    check('3a-1 is the UCA listing and 3a-2 is UCA→hazard traceability (the BODY clause)',
        !!c13 && /3a-1, the listing of all identified unsafe control actions/i.test(c13.text) &&
        /3a-2, traceability from each unsafe control action to the associated system-level hazards/i.test(c13.text));
    check('the published Table 1 defect is named, with "build to the body clause" stated',
        !!c13 && /published defect/i.test(c13.text) && /summary table/i.test(c13.text) &&
        /body clause of Step 3 is the correct statement/i.test(c13.text));
    check('the module header flags the erratum so a future editor cannot "fix" it back',
        /ERRATUM/i.test(ksrc) && /stpa-13/.test(ksrc));
}

// ---- [5] wiring into the AI spine -------------------------------------------------
{
    check('the retriever merges SL_STPA_KB into the same corpus as FTA + SORA',
        /window\.SL_STPA_KB && Array\.isArray\(window\.SL_STPA_KB\.chunks\)/.test(asrc) &&
        /if \(stpa\.length\) out = out\.concat\(stpa\)/.test(asrc));
    check('_FTAKB_SYN carries J3307 vocabulary (stpa, j3307, uca, controller, scenario)',
        /stpa:\s*\[/.test(asrc) && /j3307:\s*\[/.test(asrc) && /uca:\s*\[/.test(asrc) &&
        /controller:\s*\[/.test(asrc) && /scenario:\s*\[/.test(asrc));
    check('_ftaKbBlock takes a mode and gives the chat surface its own framing',
        /function _ftaKbBlock\(query, k, mode\)/.test(asrc) &&
        /mode === 'chat'/.test(asrc) &&
        /SAE J3307 STPA/.test(asrc));
    check('the FTA-tree framing is NOT what the chat surface sees',
        /NEVER copy any of it into the tree as content/.test(asrc) &&
        asrc.indexOf("mode === 'chat'") < asrc.indexOf('NEVER copy any of it into the tree as content'));
    check('the shared standards preamble carries the J3307 bullet with the exact vocabulary',
        /SAE J3307 \(MAR2025\) — the STPA standard/.test(asrc) &&
        /UNSAFE CONTROL ACTION/.test(asrc) && /CONTROLLER CONSTRAINT/.test(asrc) && /LOSS SCENARIO/.test(asrc));
    check('the preamble states the true-state rule and the risk-estimation exclusion',
        /ACTUAL TRUE process state/.test(asrc) && /risk estimation is out of its scope/i.test(asrc));
    check('the preamble refuses the compliance overclaim (method standard, not an MoC)',
        /method standard, not an accepted means of compliance/.test(asrc) && /never claim it satisfies/.test(asrc));
    check('_anemComplete grounds the chat on the LAST user turn with the chat framing',
        /_ftaKbBlock\(_lastUser\.slice\(0, 4000\), 5, 'chat'\)/.test(asrc));
    check('cross-lane damping exists: without a J3307 signal the STPA lane is damped, not removed',
        /_STPA_SIGNAL/.test(asrc) && /_STPA_DAMP = 0\.\d+/.test(asrc) &&
        /if \(damp !== 1 && \/\^stpa-\/\.test\(String\(c\.id \|\| ''\)\)\) s \*= damp;/.test(asrc));
    check('the damping signal is J3307 vocabulary only — never a classical-lane word',
        (function () {
            const m = asrc.match(/const _STPA_SIGNAL = \/(.*)\/i;/);
            if (!m) return false;
            return /stpa|j3307/.test(m[1]) && !/\bfha\b|\bfta\b|fmea|4761|hazard\b/.test(m[1]);
        })());
    check('a read-only kbRetrieve QA hook is exported (calls no model, writes nothing)',
        /kbRetrieve: function \(q, k\)/.test(asrc) && /_ftaKbRetrieve\(String\(q \|\| ''\), k \|\| 6\)/.test(asrc));
}

// ---- [6] load order + cache-busters -----------------------------------------------
{
    const m = S('ai_loader.js').match(/const FILES = \[([^\]]*)\]/);
    check('ai_loader FILES lists stpa_kb_data before ai_assistant, after the other KBs', !!m && (function () {
        const a = m[1];
        return a.indexOf('stpa_kb_data.js') !== -1 &&
            a.indexOf('sora_kb_data.js') < a.indexOf('stpa_kb_data.js') &&
            a.indexOf('stpa_kb_data.js') < a.indexOf('ai_assistant.js');
    })());
    check('the KB module and the assistant both carry a version query string', !!m &&
        /stpa_kb_data\.js\?v=/.test(m[1]) && /ai_assistant\.js\?v=/.test(m[1]));
    check('index.html loads the bumped ai_loader (a deploy without the bump is a no-op)',
        (function () {   // ≥1.8 — the HF KB wave bumped it again (1.9); the lock floats forward
            const v = S('index.html').match(/ai_loader\.js\?v=(\d+)\.(\d+)/);
            return !!v && (parseInt(v[1], 10) > 1 || parseInt(v[2], 10) >= 8);
        })());
}

// ---- [7] the standalone ANEM demo -------------------------------------------------
{
    // Portable: the ANEM demo tree lives beside the repo in the build container
    // (/root/work/anem) or on the Mac (~/Desktop/anem-chat-deploy). Resolve the
    // first that exists; if none, SKIP this section loudly rather than fail a
    // wall run on a machine that doesn't carry the demo tree.
    const _anemCandidates = ['/root/work/anem/anem-chat.html',
        path.join(__dirname, '..', '..', 'anem-chat-deploy', 'site', 'index.html')];
    const anem = _anemCandidates.find(f => { try { return fs.existsSync(f); } catch (_) { return false; } });
    const deploy = anem && anem.indexOf('/root/work/anem/') === 0
        ? '/root/work/anem/anem-chat-deploy/site/index.html' : anem;
    if (!anem) {
        console.log('  SKIP  standalone ANEM demo section — demo tree not present on this machine');
    } else {
        const h = fs.readFileSync(anem, 'utf8');
        const src = h.slice(h.indexOf('const CANNED = ['), h.indexOf('const thread ='));
        let CANNED = null, FALLBACK = null;
        try { const r = eval(src + '; ({CANNED:CANNED,FALLBACK:FALLBACK})'); CANNED = r.CANNED; FALLBACK = r.FALLBACK; } catch (_) {}
        // ------------------------------------------------------------------
        // 31 Jul 2026 — the SEVEN aircraft entries were deliberately removed.
        // The page was publicly reachable and published the AE-001 design story:
        // span, cruise L/D, block fuel, gust-load reduction, the differentiating
        // technologies. The standards knowledge base is the part worth keeping,
        // so the aircraft lane was cut rather than the whole demo deleted.
        // These checks now assert the SCRUB HOLDS — if aircraft content ever
        // comes back, the wall goes red before it can be deployed again.
        // ------------------------------------------------------------------
        const FORBIDDEN = [/AE-001/i, /ride[- ]quality/i, /19[- ]seat/i, /turboprop/i,
                           /gust/i, /flutter/i, /block fuel/i, /gapless/i, /23\.7/];
        check('no aircraft programme content has returned to the demo',
            FORBIDDEN.every(re => !re.test(h)),
            'forbidden: ' + FORBIDDEN.filter(re => re.test(h)).map(String).join(', '));
        check('the demo is marked noindex', /name="robots" content="noindex/.test(h));
        check('the demo brain parses and carries the J3307 answers',
            !!CANNED && CANNED.length >= 7 && !!FALLBACK, CANNED ? (CANNED.length + ' entries') : 'did not parse');
        // routing: each question must reach the entry that actually answers it
        const ROUTES = [
            ['What is STPA?', /four steps/i],
            ['tell me about j3307', /27 work products|four steps/i],
            ['What is an unsafe control action?', /five-part/i],
            ['What are the four UCA types?', /four UCA types/i],
            ['What is a control structure?', /five element types/i],
            ['What is a loss scenario?', /Step 4a/],
            ['How many work products does J3307 have?', /27 work products/],
            ['Does STPA replace the FHA?', /complements the ARP 4761A spine/]
        ];
        let bad = '';
        ROUTES.forEach(function (r) {
            const hit = CANNED && CANNED.find(c => c.q.test(r[0]));
            if (!hit || !r[1].test(hit.a)) bad = bad || r[0];
        });
        check('every probe question routes to the entry that answers it (specific before general)', !bad, bad);
        check('no suggestion chip falls through to the generic fallback', (function () {
            if (!CANNED) return false;
            const chips = new Set();
            CANNED.forEach(c => c.chips.forEach(x => chips.add(x)));
            FALLBACK.chips.forEach(x => chips.add(x));
            return Array.from(chips).every(c => CANNED.some(x => x.q.test(c)));
        })());
        check('the demo states the same copyright doctrine and points at the in-product KB',
            /COPYRIGHTED/.test(h) && /stpa_kb_data\.js/.test(h) && /never paste/i.test(h));
        check('the demo refuses the compliance overclaim and the risk-ranking overclaim',
            /method standard, not an accepted means of compliance/.test(h) &&
            /risk estimation<\/b> is out of its scope|risk estimation is out of its scope/i.test(h));
        check('deploy copy is byte-identical to the source mockup',
            fs.existsSync(deploy) && fs.readFileSync(deploy).equals(Buffer.from(h)));
    }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
