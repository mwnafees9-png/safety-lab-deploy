#!/usr/bin/env node
/*
 * Regression — A15 phase 1: the corpus pipeline + deterministic BM25 (4 Aug 2026).
 *
 * Rulings pinned (4 Aug, do not re-ask): R2 + Worker hosting; DETERMINISTIC
 * BM25 (no learned component in the retrieval path); ITAR block-entirely
 * (client-side gate — phase 2). This suite executes the shared scoring, runs
 * the python pipeline's selftest (chunker + index + tokenizer parity), and
 * pins the worker/scorer staying in sync.
 *
 * Run: node tests/regression_a15_pipeline.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ROOT = path.join(__dirname, '..');
const bm25 = require(path.join(ROOT, 'tools', 'a15', 'bm25.js'));
const workerSrc = fs.readFileSync(path.join(ROOT, 'tools', 'a15', 'corpus_worker.js'), 'utf8');
const bm25Src = fs.readFileSync(path.join(ROOT, 'tools', 'a15', 'bm25.js'), 'utf8');
const pySrc = fs.readFileSync(path.join(ROOT, 'tools', 'a15', 'corpus_pipeline.py'), 'utf8');

// ---- [1] the python pipeline, executed --------------------------------------
console.log('\n[a15] pipeline selftest (chunker + index + tokenizer), executed');
let py = '';
try { py = cp.execSync('python3 ' + path.join(ROOT, 'tools', 'a15', 'corpus_pipeline.py') + ' --selftest', { encoding: 'utf8' }); } catch (e) { py = String(e.stdout || '') + String(e.stderr || ''); }
check('the pipeline selftest passes (sections, ids, determinism, ref tokens)', py.includes('SELFTEST OK'), py.slice(0, 200));

// ---- [2] the shared scorer, executed ----------------------------------------
console.log('\n[a15] BM25 scoring, executed');
// fixture mini-corpus: three docs, known ranking
const docs = [
    'Equipment systems and installations must perform their intended functions under any foreseeable operating condition.',
    'The occurrence of any failure condition which would prevent continued safe flight and landing must be extremely improbable per 25.1309(b).',
    'Each pilot compartment must be arranged to give the pilots a sufficiently extensive clear view.'
];
const postings = {}, doclen = {};
docs.forEach((d, i) => {
    const toks = bm25.tokenize(d); doclen[i] = toks.length;
    const tf = {}; toks.forEach(t => tf[t] = (tf[t] || 0) + 1);
    Object.entries(tf).forEach(([t, n]) => (postings[t] = postings[t] || []).push([i, n]));
});
const index = { postings, doclen, avgdl: Object.values(doclen).reduce((a, b) => a + b) / 3, N: 3, k1: 1.2, b: 0.75 };
const r1 = bm25.score('failure condition extremely improbable', index, 3);
check('the on-point section ranks first', r1.length > 0 && r1[0].docId === 1, JSON.stringify(r1));
check('a bare section query matches the paragraph-cited text (25.1309 hits 25.1309(b))',
  (bm25.score('25.1309', index, 3)[0] || {}).docId === 1);
check('DETERMINISM: identical query twice → identical ranked ids',
  JSON.stringify(bm25.score('failure condition', index, 3)) === JSON.stringify(bm25.score('failure condition', index, 3)));
check('tie-break is stable (docId order), never Math.random', bm25Src.includes('a.docId - b2.docId') && !/Math\.random/.test(bm25Src));
check('regulatory refs survive tokenization as single tokens', bm25.tokenize('see 25.1309(b)').includes('25.1309(b)'));

// ---- [3] worker/scorer parity + posture -------------------------------------
console.log('\n[a15] worker parity and posture');
const grab = (src) => ((src.match(/const TOKEN_RE = [\s\S]*?\.slice\(0, k \|\| 8\);\n\}/) || [''])[0])
  .replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').trim();   // compare CODE, not comments/whitespace
check('the worker embeds the scorer code-identically (tokenizer + scoring = bm25.js)',
  grab(workerSrc).length > 200 && grab(workerSrc) === grab(bm25Src),
  'if these drift, the index and the endpoint disagree silently');
check('the worker serves GET /v1/corpus/search with capped k and 500-char queries',
  workerSrc.includes("'/v1/corpus/search'") && workerSrc.includes('MAX_K') && workerSrc.includes('.slice(0, 500)'));
check('CORS locked to the app origin', workerSrc.includes("ALLOW_ORIGIN = 'https://safetylabaero.com'"));
check('no learned component anywhere in the retrieval path (no embeddings, no model calls)',
  !/embed|openai|anthropic|vector/i.test(workerSrc) && !/embed|vector/i.test(bm25Src));
check('every chunk carries provenance (source, section, issueDate, retrieved)',
  pySrc.includes('"provenance"') && pySrc.includes('"issueDate"') && pySrc.includes('"retrieved"'));
check('BM25 parameters are recorded in the manifest for eternal reproducibility',
  pySrc.includes('"k1": K1') && pySrc.includes('"b": B'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
