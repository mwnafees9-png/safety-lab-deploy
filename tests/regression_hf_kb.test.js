#!/usr/bin/env node
/*
 * Regression — NASA Human Factors corpus hard-coded into the AI spine.
 *   [1] data integrity: hf_kb_data.js exposes 24 chunks with the corpus schema
 *       {id, source, topic, text}, ids hf-01..hf-24 unique and contiguous,
 *       every chunk attributed to the HF corpus source string.
 *   [2] doctrine: the SPLIT copyright posture is declared in the header —
 *       NASA documents public domain (cited quotes lawful), ISO 9241 and
 *       MIL-STD-1472 cite-and-point only. Mechanical assertion: the ISO and
 *       MIL chunks carry NO clause prose. No RNG/Date/eval.
 *   [3] content lock: the facts the assistant must never get wrong — HIDH
 *       ch.5/6/10 scope and the 298 presets, seed-never-fill, never flips
 *       VERIFIED, the applicability tag values, the 80% red line with its
 *       citation, the five channels, HFACS four tiers + 115 nanocodes +
 *       Dirty Dozen + RL/GL, the canonical-vs-trending code trap, the
 *       seven-factor taxonomy, ISO 9241 parts, Fitts' Shannon form with the
 *       cited-coefficients rule, the AC 25.1309 workload→severity band map,
 *       INV-35/36/HFW with the renumbering honesty, and the three honest
 *       limits (HIDH not MoC · HFACS not predictive · Fitts not workload).
 *   [4] wiring: ai_assistant.js merges SL_HF_KB into the retrieval corpus,
 *       carries HF vocabulary in _FTAKB_SYN, injects the HF preamble bullet,
 *       and damps the HF lane behind _HF_SIGNAL — whose vocabulary must be
 *       HF-only (asserted mechanically, as the STPA test does).
 *   [5] load order: ai_loader FILES lists hf_kb_data after stpa_kb_data and
 *       before ai_assistant; ai_assistant bumped; index.html loader bumped.
 *   [6] the standalone ANEM demo: HF probes route to HF entries, specific
 *       before general, the whole group ahead of /part 23|certif/, no chip
 *       falls through, doctrine header present, deploy copy byte-identical.
 * Run: node tests/regression_hf_kb.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

const KB = require('../site/hf_kb_data.js');
const ksrc = S('hf_kb_data.js');
const asrc = S('ai_assistant.js');
const ALL = KB.chunks.map(c => c.text).join('\n');
const has = re => re.test(ALL);

// ---- [1] data integrity ----------------------------------------------------------
{
    check('exactly 24 HF chunks', KB.chunks.length === 24, 'got ' + KB.chunks.length);
    check('every chunk carries {id, source, topic, text} with real text',
        KB.chunks.every(c => c.id && c.source && c.topic && typeof c.text === 'string' && c.text.length > 300));
    check('ids are hf-01..hf-24, unique and contiguous', (function () {
        const ids = KB.chunks.map(c => c.id);
        if (new Set(ids).size !== ids.length) return false;
        return ids.every((id, i) => id === 'hf-' + String(i + 1).padStart(2, '0'));
    })());
    check('every chunk is attributed to the HF corpus source',
        KB.chunks.every(c => /NASA HF corpus/.test(c.source)));
    check('browser global is SL_HF_KB with version + method, node export carries chunks',
        /window\.SL_HF_KB = \{ version: 1, method: 'lexical'/.test(ksrc) && Array.isArray(KB.chunks));
}

// ---- [2] doctrine — the SPLIT copyright posture -----------------------------------
{
    check('header declares the split: NASA public domain vs ISO/MIL cite-and-point',
        /PUBLIC DOMAIN/.test(ksrc) && /cite and point; never paste/i.test(ksrc) &&
        /ISO 9241/.test(ksrc) && /MIL-STD-1472/.test(ksrc) && /US Government/.test(ksrc));
    // Mechanical: the ISO and MIL chunks describe role only — no clause prose.
    // Heuristic teeth: no "shall" clauses, no clause-number quotations, and the
    // chunks themselves state the cite-and-point rule.
    const isoMil = KB.chunks.filter(c => /ISO 9241|MIL-STD-1472/.test(c.topic));
    check('ISO 9241 and MIL-STD-1472 each have a spine chunk', isoMil.length >= 2);
    check('ISO/MIL chunks carry NO clause prose — zero "shall" and no quoted clause text',
        isoMil.every(c => !/\bshall\b/i.test(c.text) && !/["“][^"”]{40,}["”]/.test(c.text)) &&
        isoMil.every(c => /cite|designation/i.test(c.text)));
    const codeLines = ksrc.split('\n').filter(l => !/^\s*[/*]/.test(l));
    check('no RNG/Date/eval in the data module',
        codeLines.every(l => l.indexOf('Math.random') === -1 && !/\bnew Date\b|\bDate\.now\b/.test(l)) &&
        ksrc.indexOf('(0, eval)') === -1 && ksrc.indexOf('new Function') === -1);
}

// ---- [3] content lock — the facts the assistant must not get wrong ----------------
{
    check('HIDH identified precisely: NASA/SP-2010-3407 Rev 1, chapters 5/6/10',
        has(/NASA\/SP-2010-3407 Rev 1/) && has(/chapter 5/i) && has(/chapter 6/i) && has(/chapter 10/i));
    check('the 298 page-cited presets with full provenance (printed page + quote fragment)',
        has(/298/) && has(/PRINTED page/i) && has(/quote fragment/i));
    check('presets SEED and never FILL; never silently supplies a human number',
        has(/SEEDS and never FILLS/i) && has(/never silently suppl/i));
    check('a preset never flips a credit or assumption to Validated/Verified',
        has(/never flips a credit or assumption to Validated or Verified/i));
    check('the applicability tag with exactly its three values, and the honesty rule',
        has(/aircraft, spaceflight, or general/i) && has(/reference point/i) && has(/NOT aircraft requirements/i));
    check('the 80% red line carries its full citation: HIDH §5.7.5.1, p.229, Parks and Boucek 1989',
        has(/5\.7\.5\.1/) && has(/page 229/i) && has(/Parks and Boucek 1989/i) && has(/80%/));
    check('the five HIDH channels — visual, auditory, cognitive, psychomotor, verbal',
        has(/visual, auditory, cognitive, psychomotor, verbal/i));
    check('duration is exposure, never a response window — the refusal is stated',
        has(/Duration is exposure, never a response window/i) && has(/refuses to infer/i));
    check('NASA-HFACS identified precisely: NASA-HDBK-8709.25 V1.4, 2023, OSMA, 115 nanocodes, four tiers',
        has(/NASA-HDBK-8709\.25/) && has(/V1\.4/) && has(/31 July 2023/) && has(/115 nanocodes/) && has(/four tiers/i));
    check('the four tiers named (Acts, Preconditions, Supervision, Organization) with tier-numbered codes',
        has(/Acts/) && has(/Preconditions/) && has(/Supervision/) && has(/Organization/) && has(/AD101/) && has(/PE201/));
    check('the FY2022 trending-code trap is encoded — trending codes are NOT the taxonomy',
        has(/FY2022/) && has(/NOT the canonical taxonomy|example trending data, NOT/i));
    check('Dirty Dozen + Red-Light/Green-Light + leading indicators all covered',
        has(/Dirty Dozen/) && has(/Red-Light/) && has(/Green-Light/) && has(/leading indicators/i));
    check('the seven-factor taxonomy with all seven classes named',
        has(/physiological/i) && has(/psychological/i) && has(/cognitive/i) && has(/environmental/i) &&
        has(/organizational/i) && has(/technological/i) && has(/procedural/i));
    check('one coarse class per causal factor; HFACS detail lives on the assumption record',
        has(/at most one/i) && has(/assumption record/i));
    check('ISO 9241 parts on the spine: -110, -112, -210, -9 with the Fitts protocol lineage',
        has(/9241-110/) && has(/9241-112/) && has(/9241-210/) && has(/9241-9/) && has(/multidirectional/i));
    check('Fitts: Shannon formulation + coefficients must be CITED, no uncited defaults',
        has(/Shannon formulation/i) && has(/refuses to run without cited values/i) && has(/guess wearing a suit/i));
    check('the AC 25.1309 workload→severity band map is encoded',
        has(/slight increase in crew workload/i) && has(/significant increase/i) && has(/cannot be relied upon/i) &&
        has(/none, slight, significant, excessive, incapacitating/i));
    check('INV-HFW: minimum plausible severity, ≥2-band gap, conservative text read, advisory only',
        has(/two or more bands/i) && has(/conservative read/i) && has(/advisory only/i));
    check('two-lane posture: Proposed → Validated → Verified, credited lane gated',
        has(/Proposed, then Validated, then Verified/i) && has(/credited lane/i));
    check('INV-35 hard + INV-36 advisory + the renumbering honesty (methods stay inv16/inv17)',
        has(/INV-35/) && has(/INV-36/) && has(/renumbered/i) && has(/inv16 and inv17 remain/i));
    check('the three honest limits: HIDH not MoC · HFACS not predictive · Fitts not workload',
        has(/design handbook, not an accepted means of compliance/i) &&
        has(/mishap-classification taxonomy, not a predictive model/i) &&
        has(/movement-time model, not a workload model/i));
    check('the STPA bridge chunk: four mental models + the HF-expertise recommendation',
        !!KB.chunks.find(c => /STPA/.test(c.topic)) && has(/four distinct mental models/i) && has(/human-factors expertise/i));
}

// ---- [4] wiring into the AI spine -------------------------------------------------
{
    check('the retriever merges SL_HF_KB into the same corpus as FTA + SORA + STPA',
        /window\.SL_HF_KB && Array\.isArray\(window\.SL_HF_KB\.chunks\)/.test(asrc) &&
        /if \(hf\.length\) out = out\.concat\(hf\)/.test(asrc));
    check('_FTAKB_SYN carries HF vocabulary (hidh, hfacs, nanocode, workload, fitts, channels)',
        /hidh:\s*\[/.test(asrc) && /hfacs:\s*\[/.test(asrc) && /nanocode:\s*\[/.test(asrc) &&
        /workload:\s*\[/.test(asrc) && /fitts:\s*\[/.test(asrc) && /channels:\s*\[/.test(asrc));
    check('the chat framing names the HF corpus alongside the other three',
        /NASA HIDH & NASA-HFACS human factors/.test(asrc));
    check('the shared standards preamble carries the HF bullet with the honest limits',
        /• HUMAN FACTORS — NASA HIDH/.test(asrc) && /SEED and never FILL/.test(asrc) &&
        /NOT aircraft requirements/.test(asrc) && /never turn nanocode frequencies into failure rates/.test(asrc) &&
        /no uncited defaults/.test(asrc));
    check('the preamble carries the invariant truth: INV-35 hard, INV-36 and INV-HFW advisory',
        /INV-35 hard, INV-36 and INV-HFW advisory/.test(asrc));
    check('cross-lane damping exists for the HF lane (damped, not removed)',
        /_HF_SIGNAL/.test(asrc) && /_HF_DAMP = 0\.\d+/.test(asrc) &&
        /if \(dampHf !== 1 && \/\^hf-\/\.test\(String\(c\.id \|\| ''\)\)\) s \*= dampHf;/.test(asrc));
    check('_HF_SIGNAL is HF-only vocabulary — never a classical-lane word (mechanical)',
        (function () {
            const m = asrc.match(/const _HF_SIGNAL = \/(.*)\/i;/);
            if (!m) return false;
            const sig = m[1];
            return /hidh/.test(sig) && /hfacs/.test(sig) && /fitts/.test(sig) &&
                !/\bfha\b|\bfta\b|fmea|4761|severity|failure|hazard\b|\bcrew\b(?! task)/.test(sig.replace(/crew task\\w\*/, ''));
        })());
    check('the damping decision is recorded (parallel pair, not a table — the STPA lock)',
        /DECISION: kept as a second explicit pair/.test(asrc));
    check('the catalogue decision is recorded: no new rows, AC 25.1309 already present',
        /DECISION \(#174, HF KB wiring/.test(S('catalogue_data.js')) &&
        /NO new catalogue rows/.test(S('catalogue_data.js')));
}

// ---- [5] load order + cache-busters -----------------------------------------------
{
    const m = S('ai_loader.js').match(/const FILES = \[([^\]]*)\]/);
    check('ai_loader FILES lists hf_kb_data after stpa_kb_data, before ai_assistant', !!m && (function () {
        const a = m[1];
        return a.indexOf('hf_kb_data.js') !== -1 &&
            a.indexOf('stpa_kb_data.js') < a.indexOf('hf_kb_data.js') &&
            a.indexOf('hf_kb_data.js') < a.indexOf('ai_assistant.js');
    })());
    check('hf_kb_data carries a version query string and ai_assistant was BUMPED (≥67.5)', !!m &&
        /hf_kb_data\.js\?v=/.test(m[1]) && (function () {
            const v = m[1].match(/ai_assistant\.js\?v=(\d+)\.(\d+)/);
            return !!v && (parseInt(v[1], 10) > 67 || (parseInt(v[1], 10) === 67 && parseInt(v[2], 10) >= 5));
        })());
    check('index.html loads the bumped ai_loader (≥1.9 — a deploy without the bump is a no-op)',
        (function () {
            const v = S('index.html').match(/ai_loader\.js\?v=(\d+)\.(\d+)/);
            return !!v && (parseInt(v[1], 10) > 1 || parseInt(v[2], 10) >= 9);
        })());
}

// ---- [6] the standalone ANEM demo -------------------------------------------------
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
        check('the demo brain parses and carries the J3307 + HF answers',
            !!CANNED && CANNED.length >= 12 && !!FALLBACK, CANNED ? (CANNED.length + ' entries') : 'did not parse');
        const ROUTES = [
            ['What is the 80% workload red line?', /80% time-occupancy red line/],
            ['What is the time occupancy saturation rule?', /80% time-occupancy red line/],
            ['How does workload relate to FHA severity?', /minimum plausible severity/],
            ['What is the HIDH?', /Human Integration Design Handbook/],
            ['What is NASA-HFACS?', /115 nanocodes/],
            ['Tell me about Fitts law', /Shannon formulation/],
            ['What is on the human-factors lane?', /human-factors lane/],
            // the exact swallow the ordering exists to prevent:
            ['Does the HF assessment satisfy certification?', /human-factors lane/],
            // the STPA lane must be untouched
            ['What is STPA?', /four steps/i],
            ['What is an unsafe control action?', /five-part/i]
        ];
        let bad = '';
        ROUTES.forEach(function (r) {
            const hit = CANNED && CANNED.find(c => c.q.test(r[0]));
            if (!hit || !r[1].test(hit.a)) bad = bad || r[0];
        });
        check('every probe routes to the entry that answers it (specific HF before general HF)', !bad, bad);
        check('plain talk about the crew/cabin still routes to the aircraft, not the HF lane',
            (function () {
                if (!CANNED) return false;
                const q = 'Tell me about the crew cabin comfort';
                const hit = CANNED.find(c => c.q.test(q));
                return !hit || !/human-factors lane/.test(hit.a);
            })());
        check('no suggestion chip falls through to the generic fallback', (function () {
            if (!CANNED) return false;
            const chips = new Set();
            CANNED.forEach(c => c.chips.forEach(x => chips.add(x)));
            FALLBACK.chips.forEach(x => chips.add(x));
            return Array.from(chips).every(c => CANNED.some(x => x.q.test(c)));
        })());
        check('FALLBACK surfaces an HF question and names the HF lane',
            FALLBACK && FALLBACK.chips.some(c => /workload|HIDH|HFACS|human factors/i.test(c)) &&
            /human-factors lane/.test(FALLBACK.a));
        check('the demo header states the SPLIT copyright doctrine (public-domain NASA vs cite-and-point ISO/MIL)',
            /#-HF/.test(h) && /PUBLIC DOMAIN/.test(h) && /hf_kb_data\.js/.test(h) &&
            /ISO 9241/.test(h) && /MIL-STD-1472/.test(h));
        check('the demo carries the three honest limits in its HF answers',
            /design handbook, not an accepted means of compliance|design handbook, <b>not an accepted means of compliance/.test(h) &&
            /mishap-classification taxonomy, not a predictive model/.test(h) &&
            /movement-time model, not a workload model/.test(h));
        check('deploy copy is byte-identical to the source mockup',
            fs.existsSync(deploy) && fs.readFileSync(deploy).equals(Buffer.from(h)));
    }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
