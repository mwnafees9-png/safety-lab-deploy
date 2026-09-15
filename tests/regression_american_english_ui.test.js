#!/usr/bin/env node
/*
 * Regression — American English in the visible app text (R4 batch A, 13 Sep 2026).
 *
 * WHY: Waqas's rule is American English everywhere. The 11 Sep bulk sweep was reverted because
 * it renamed identifiers (CATALOGUE → PP.CATALOGUE broke 14 suites) and touched eval-gated AI
 * files. The 13 Sep pass was surgical: only string literals that read as prose (they contain a
 * space), never object keys, computed member strings, switch labels, comparison operands,
 * selector/storage/event strings, all-caps tokens outside prose, or class/id/data attribute
 * values inside HTML strings; index.html text nodes and human-facing attributes only.
 *
 * This suite keeps British spellings out of PROSE strings in every non-eval-gated site/*.js
 * and out of index.html's visible text. Bare single-word tokens ('cancelled' as a state value)
 * are deliberately out of scope: they are code, not copy. The AI-facing files are batch B and
 * are guarded by the golden eval, not here.
 *
 * Run: node tests/regression_american_english_ui.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const EVALGATED = new Set(['ai_skills.js', 'ai_assistant.js', 'cert_std_kb_data.js', 'hf_kb_data.js', 'stpa_kb_data.js', 'fta_kb_data.js', 'sora_kb_data.js', 'cert_basis_spine.js', 'program_plan.js', 'severity_rubrics.js', 'eula_modal.js', 'ac_library_kb_data.js', 'cfr_ruletext_kb_data.js']);
const BRIT = /\b(colour|colours|coloured|catalogue|catalogues|programme|programmes|behaviour|behaviours|behavioural|analyse|analysed|analysing|organisation|organisations|organise|organised|licence|licences|centre|centres|centred|metre|metres|favour|favourite|honour|modelling|modelled|labelled|labelling|cancelled|cancelling|judgement|judgements|recognise|recognised|recognises|optimise|optimised|optimisation|summarise|prioritise|realise|realised|standardise|utilise|customise|minimise|minimised|maximise|initialise|initialised|serialise|normalise|normalised|visualise|visualisation|categorise|emphasise|authorise|authorised|authorisation|finalise|synchronise|specialise|harmonise|stabilise|sanitise|randomise|grey|greyed|fulfil|defence|offence|practise|tyre|tyres|aluminium|aeroplane|enquiry|enquiries|artefact|artefacts|sceptical|manoeuvre|manoeuvres|neighbour|neighbours|neighbouring|pressurise|pressurised|pressurisation|depressurise|depressurised|vapour|characterised|generalised)\b/i;

// Minimal JS string extractor: yields the bodies of '...' "..." and `...` literals, skipping
// comments and regex-free code. Good enough for this codebase (classic scripts, no JSX).
function* strings(src) {
    let i = 0, n = src.length;
    while (i < n) {
        const c = src[i];
        if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? n : e + 1; continue; }
        if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
        if (c === '/') {   // regex literal vs division: a regex follows an operator/opening punctuation or a keyword, division follows a value
            let k = i - 1; while (k >= 0 && /\s/.test(src[k])) k--;
            const prev = k >= 0 ? src[k] : '(';
            const word = (src.slice(Math.max(0, k - 6), k + 1).match(/[A-Za-z_$]+$/) || [''])[0];
            const regexStart = '(,=:[!&|?{};+-*%<>~^'.includes(prev) || /^(return|typeof|case|do|else|in|of|new|delete|void|throw)$/.test(word);
            if (regexStart) {
                let j = i + 1, cls = false;
                while (j < n) { const d = src[j]; if (d === '\\') { j += 2; continue; } if (d === '\n') break; if (cls) { if (d === ']') cls = false; } else if (d === '[') cls = true; else if (d === '/') break; j++; }
                i = j + 1; continue;
            }
        }
        if (c === '"' || c === "'" || c === '`') {
            let j = i + 1, body = '';
            while (j < n && src[j] !== c) {
                if (src[j] === '\\') { body += src[j] + (src[j + 1] || ''); j += 2; continue; }
                if (c === '`' && src[j] === '$' && src[j + 1] === '{') {   // nested expression: recurse so its own strings are read too
                    let depth = 1, k = j + 2; while (k < n && depth) { if (src[k] === '{') depth++; else if (src[k] === '}') depth--; k++; }
                    yield* strings(src.slice(j + 2, k - 1)); j = k; body += ' '; continue;
                }
                if (c !== '`' && src[j] === '\n') break;   // unterminated (regex literal / division) — bail out of this "string"
                body += src[j++];
            }
            yield body; i = j + 1; continue;
        }
        i++;
    }
}
function proseHits(body) {
    if (!/\s/.test(body.trim())) return [];          // bare token = code
    const hits = [];
    let m; const re = new RegExp(BRIT.source, 'gi');
    while ((m = re.exec(body))) {
        const before = body[m.index - 1] || ' ';
        const q = Math.max(body.lastIndexOf('"', m.index), body.lastIndexOf("'", m.index));
        if (q >= 0 && /(class|id|data-[\w-]+|href|for|name|on\w+|style|src|rel|type|role)=\\?$/i.test(body.slice(Math.max(0, q - 24), q))) continue;   // attribute code inside an HTML string
        if ('_#['.includes(before)) continue;
        hits.push(m[0]);
    }
    return hits;
}

const files = fs.readdirSync(SITE).filter(f => f.endsWith('.js') && !EVALGATED.has(f)).sort();
let total = 0; const bad = [];
for (const f of files) {
    const src = fs.readFileSync(path.join(SITE, f), 'utf8');
    for (const s of strings(src)) { const h = proseHits(s); if (h.length) { total += h.length; bad.push(f + ': ' + h.join(',') + ' in "' + s.slice(0, 60).replace(/\n/g, ' ') + '"'); } }
}
check('no British spelling in any prose string of the ' + files.length + ' non-eval-gated site scripts', total === 0, bad.slice(0, 8).join(' | '));

// index.html: visible text nodes and human-facing attributes (comments, scripts, styles ignored)
const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
const textHits = [...html.matchAll(/>([^<]+)</g)].flatMap(m => proseHits(m[1]));
const attrHits = [...html.matchAll(/\b(title|placeholder|aria-label|alt|value|label)="([^"]*)"/g)].flatMap(m => proseHits(m[2]));
check('index.html visible text carries no British spelling', textHits.length === 0 && attrHits.length === 0, textHits.concat(attrHits).slice(0, 8).join(','));

// probe sanity: the detector sees a real one, and ignores code
check('the detector flags a prose hit and ignores a bare token / a class attribute',
    proseHits('the colour of the pill').length === 1 && proseHits('cancelled').length === 0 && proseHits('<span class="fha-judgement-badge">ok there</span>').length === 0);
check('the extractor reads single, double and template strings and skips comments',
    [...strings('a("x y") // "colour z"\n b(\'p q\') + `t ${z} u` /* "grey w" */')].join('|') === 'x y|p q|t   u');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
