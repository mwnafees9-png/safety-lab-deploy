// =============================================================================
// eval_core.js — the AI-repeatability scoring core (single source of truth).
// 30 Aug 2026: extracted VERBATIM from eval/score_run.mjs so the SAME code
// scores runs from the CLI (node eval/score_run.mjs, via require) and from
// inside the product (window.SLABEvalCore, via the runRepeatabilityCheck hook
// in ai_assistant.js). Two copies would drift; this file is the instrument.
// Editing rules: any metric/threshold change here is a scorer change — run
// eval/regression_ai_repeatability.test.js (identity + mutation-proofs run
// through the CLI and therefore through THIS file), log the change in
// eval/EXPORT_RUN.md's tightening table, bump this file's ?v= pin.
// UMD-lite: attaches window.SLABEvalCore in the browser, module.exports in Node.
// =============================================================================
(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.SLABEvalCore = api;
}(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

// --- normalization --------------------------------------------------------
const norm = s => String(s ?? '')
  .toLowerCase()
  .replace(/[‐-―‘-‟'"()\[\].,;:!?/]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const setOf = arr => new Set(arr.filter(Boolean));
function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

// --- topic lexicon (F1b) --------------------------------------------------
// Canonical aircraft-safety-function topics. Keywords are normalized
// substrings; a text can carry several topics. Calibrated against the four
// Aeolus datasets (golden v1/v2 + runs 1–3): unassigned function rate 0,
// unassigned FHA rate < 3% once parent-function context is inherited.
const TOPICS = {
  'thrust':           ['thrust', 'propulsi', 'turbofan', 'fadec', 'engine'],
  'reverse':          ['revers'],
  'flight-controls':  ['roll', 'pitch', 'yaw', 'aileron', 'elevator', 'rudder',
                       'attitude', 'primary flight', 'control surface', 'flight path',
                       'flight-path', 'flight control'],
  'high-lift':        ['high lift', 'high-lift', 'flap', 'slat', 'low speed', 'low-speed'],
  'braking':          ['brak', 'anti skid', 'anti-skid', 'antiskid'],
  'steering':         ['steer'],
  'landing-gear':     ['landing gear', 'gear'],
  'nose-door':        ['nose door', 'nose-door', 'visor', 'door', 'lock', 'latch', 'boundary'],
  'restraint':        ['restraint', 'payload', 'cargo', 'hold', 'tie down', 'tiedown', 'tension'],
  'pressurization':   ['pressur', 'outflow'],
  'air-conditioning': ['condition', 'air distribution', 'distribute air', 'bleed',
                       'pack', 'ventilat', 'temperature'],
  'ice-protection':   ['ice', 'icing', 'anti ice', 'de ice', 'inlet', 'protected surface',
                       'heated', 'heat protect', 'protection zone'],
  'probes':           ['probe', 'pitot', 'static port', 'aoa'],
  'displays':         ['display', 'flight information', 'navigation information',
                       'navigation parameter', 'flight navigation', 'instrument',
                       'parameter', 'format'],
  'alerting':         ['alert', 'caution', 'warning'],
  'fire-detect':      ['detect', 'overheat', 'monitored zone', 'monitoring'],
  'fire-extinguish':  ['extinguish', 'suppress', 'bottle'],
  'oxygen':           ['oxygen', 'mask'],
  'electrical':       ['electrical', 'generat', 'power suppl', 'bus'],
  'hydraulic':        ['hydraul', 'edp'],
  'fuel':             ['fuel'],
  'avionics':         ['avionic', 'data network', 'computing'],
};

function topicsOf(text) {
  const t = norm(text);
  const out = new Set();
  if (!t) return out;
  for (const [id, kws] of Object.entries(TOPICS)) {
    for (const kw of kws) if (t.includes(kw)) { out.add(id); break; }
  }
  return out;
}

// Failure-mode axis. Priority order matters: "undetected loss of X" is an
// erroneous-indication hazard, not a loss hazard.
const MODES = [
  ['erroneous',   ['erroneous', 'misleading', 'incorrect', 'undetected', 'false', 'wrong']],
  ['inadvertent', ['inadvertent', 'uncommanded', 'unintended', 'spurious', 'no crew command',
                   'no unlock command', 'without command']],
  ['partial',     ['partial', 'degraded', 'reduced', 'asymmetric', 'one side', 'single',
                   'incomplete', 'intermittent', 'some ', 'below full', 'one engine',
                   'one monitored', 'one independent', 'one protected']],
  ['loss',        ['loss', 'complete', 'total', 'fail', 'unable', 'jam', 'stuck', 'runaway']],
];
function modeOf(text) {
  const t = norm(text);
  for (const [mode, kws] of MODES) for (const kw of kws) if (t.includes(kw)) return mode;
  return 'other';
}

// parent-function context: subId -> that run's own function text
function subTextById(d) {
  const m = new Map();
  for (const f of d.functions) {
    const id = String(f.subId ?? '').trim();
    if (id && !m.has(id)) m.set(id, `${f.subName ?? ''} ${f.subDef ?? ''}`);
  }
  return m;
}

// A row's signatures: topic|mode for every topic the row (plus its parent
// function) carries. The mode comes from the condition text alone.
function rowSignatures(text, parentText) {
  const mode = modeOf(text);
  const topics = topicsOf(`${text} ${parentText ?? ''}`);
  const sigs = new Set();
  for (const t of topics) sigs.add(`${t}|${mode}`);
  return sigs;
}

function functionTopics(d) {
  const out = new Set();
  let unassigned = 0;
  for (const f of d.functions) {
    const ts = topicsOf(`${f.subName ?? ''} ${f.subDef ?? ''}`);
    if (!ts.size) unassigned++;
    for (const t of ts) out.add(t);
  }
  return { topics: out, unassigned };
}

function fcimSignatures(d) {
  const subs = subTextById(d);
  const out = new Set();
  for (const r of d.fcim) {
    const parent = subs.get(String(r.subId ?? '').trim()) ?? '';
    const texts = [];
    for (const k of ['tlDesc', 'plDesc', 'mDesc']) if (norm(r[k])) texts.push(r[k]);
    for (const k of ['plExtra', 'mExtra']) {
      let ex = r[k];
      if (typeof ex === 'string' && ex.trim()) { try { ex = JSON.parse(ex); } catch { ex = null; } }
      if (Array.isArray(ex)) for (const e of ex) if (norm(e && e.desc)) texts.push(e.desc);
    }
    for (const t of texts) for (const s of rowSignatures(t, parent)) out.add(s);
  }
  return out;
}

// text-level extras kept for the informational metrics
function functionNames(d) { return setOf(d.functions.map(f => norm(f.subName))); }
function topFunctionNames(d) { return setOf(d.functions.map(f => norm(f.funcName))); }
function fcimConditionTexts(d) {
  const out = [];
  for (const r of d.fcim) {
    for (const k of ['tlDesc', 'plDesc', 'mDesc']) if (norm(r[k])) out.push(norm(r[k]));
    for (const k of ['plExtra', 'mExtra']) {
      let ex = r[k];
      if (typeof ex === 'string' && ex.trim()) { try { ex = JSON.parse(ex); } catch { ex = null; } }
      if (Array.isArray(ex)) for (const e of ex) if (norm(e && e.desc)) out.push(norm(e.desc));
    }
  }
  return setOf(out);
}

const sevOf = r => String(r.severity ?? '').trim();
const SEVS = ['Catastrophic', 'Hazardous', 'Major', 'Minor', 'Negligible'];
const sevRank = s => { const i = SEVS.indexOf(s); return i < 0 ? null : i; };

function sevDist(d) {
  const dist = { NONE: 0 };
  for (const s of SEVS) dist[s] = 0;
  for (const r of d.fha) { const s = sevOf(r) || 'NONE'; dist[s] = (dist[s] || 0) + 1; }
  return dist;
}

function abstainRate(d, excludeFcIds) {
  const ex = new Set((excludeFcIds || []).map(norm));
  let n = 0, abst = 0;
  for (const r of d.fha) {
    if (ex.has(norm(r.fcId))) continue;
    n++;
    if (!sevOf(r)) abst++;
  }
  return n ? abst / n : 0;
}

function assumptionStats(d) {
  const n = d.assumptions.length;
  let cited = 0, verified = 0, citations = 0;
  for (const a of d.assumptions) {
    const cs = Array.isArray(a.citations) ? a.citations : [];
    if (cs.length) cited++;
    citations += cs.length;
    verified += cs.filter(c => c && c.verified === true).length;
  }
  return { n, citedRate: n ? cited / n : 1, verifiedRate: citations ? verified / citations : 1 };
}

// --- FHA row pairing (F1b) ------------------------------------------------
// Pass 1: exact normalized fcDesc (certain pairs — keeps identity scoring
// exact). Pass 2: greedy signature matching over the leftovers, deterministic
// by document order, best overlap wins, ties to the earliest candidate row.
function pairFhaRows(golden, cand) {
  const gSubs = subTextById(golden), cSubs = subTextById(cand);
  const gRows = golden.fha.map(r => ({ r, key: norm(r.fcDesc),
    sigs: rowSignatures(r.fcDesc, gSubs.get(String(r.subId ?? '').trim())) }));
  const cRows = cand.fha.map(r => ({ r, key: norm(r.fcDesc),
    sigs: rowSignatures(r.fcDesc, cSubs.get(String(r.subId ?? '').trim())) }));
  const pairs = [];
  const cTaken = new Array(cRows.length).fill(false);
  // pass 1 — exact text
  const cByKey = new Map();
  cRows.forEach((c, i) => { if (c.key && !cByKey.has(c.key)) cByKey.set(c.key, i); });
  const gLeft = [];
  for (const g of gRows) {
    const i = g.key ? cByKey.get(g.key) : undefined;
    if (i !== undefined && !cTaken[i]) { cTaken[i] = true; pairs.push([g, cRows[i], 'text']); }
    else gLeft.push(g);
  }
  // pass 2 — topic|mode signatures
  for (const g of gLeft) {
    if (!g.sigs.size) continue;
    let best = -1, bestOverlap = 0;
    for (let i = 0; i < cRows.length; i++) {
      if (cTaken[i] || !cRows[i].sigs.size) continue;
      let ov = 0;
      for (const s of g.sigs) if (cRows[i].sigs.has(s)) ov++;
      if (ov > bestOverlap) { bestOverlap = ov; best = i; }
    }
    if (best >= 0) { cTaken[best] = true; pairs.push([g, cRows[best], 'signature']); }
  }
  return { pairs, gTotal: gRows.length };
}

// ---------------------------------------------------------------------------
// STRICT PAIRING (4 Sep 2026, v1.7). The topic|mode pairing above is the right
// instrument for "did the runs find the same THINGS" — but it is the wrong one
// for severity: its topic lexicon puts "loss of forward thrust" and "loss of
// ground reverse thrust" in the same bucket, so it compared the severity of
// DIFFERENT conditions and reported 0.40–0.46 agreement where a strict pairing
// of the same condition gave 0.62 and zero two-class jumps (runs 2 vs 3).
// Strict = the same condition (shared id, or same loss form + the same wording)
// on the same phase group. Rows come from effects (one condition, any number
// of phase-group rows), so a pair must also agree on phases.
const LOSS_STOP = new Set(['of', 'the', 'a', 'an', 'to', 'and', 'or', 'in', 'on', 'at', 'with', 'for', 'by',
  'limits', 'limit', 'mac', 'outside', 'within', 'loss', 'total', 'partial', 'complete', 'erroneous',
  'uncommanded', 'undetected', 'detected', 'failure', 'function', 'aircraft', 'degraded', 'inadvertent']);
function lossFormOf(text) {
  const t = norm(text);
  if (/\b(total loss|complete loss|outside (the )?mac|loss of all)\b/.test(t)) return 'TL';
  if (/\b(partial loss|within (the )?mac|degraded|reduced|asymmetric|one (engine|side|channel|lane|unit))\b/.test(t)) return 'PL';
  return modeOf(text);
}
function condTokens(text) {
  return new Set(norm(text).split(' ').filter(w => w && !LOSS_STOP.has(w)));
}
function phaseKeys(r) {
  const raw = Array.isArray(r.phases) ? r.phases : String(r.phases ?? '').split(',');
  const ks = raw.map(x => String(x ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')).filter(Boolean);
  if (!ks.length || ks.indexOf('allphases') !== -1) return new Set(['*']);
  return new Set(ks);
}
function phaseOverlap(a, b, profile) {
  if (a.has('*') && b.has('*')) return 1;
  const A = a.has('*') ? profile : a, B = b.has('*') ? profile : b;
  if (!A.size || !B.size) return 0;
  return jaccard(A, B);
}
const condIdOf = r => String(r.sourceCondId ?? r.srcCondId ?? r.fcId ?? '').trim().toLowerCase();
function pairFhaRowsStrict(golden, cand) {
  const profile = new Set();
  [golden, cand].forEach(d => d.fha.forEach(r => { for (const k of phaseKeys(r)) if (k !== '*') profile.add(k); }));
  const mk = r => ({ r, key: norm(r.fcDesc), id: condIdOf(r), form: lossFormOf(r.fcDesc), toks: condTokens(r.fcDesc), ph: phaseKeys(r) });
  const gRows = golden.fha.map(mk), cRows = cand.fha.map(mk);
  const taken = new Array(cRows.length).fill(false);
  const pairs = [];
  const score = (g, c) => {
    if (c.form !== g.form) return 0;
    const same = g.id && c.id && g.id === c.id;
    const tj = jaccard(g.toks, c.toks);
    if (!same && tj < 0.5) return 0;
    const po = phaseOverlap(g.ph, c.ph, profile);
    if (po < 0.5) return 0;
    return (same ? 1 : tj) + po;
  };
  for (const g of gRows) {
    let best = -1, bs = 0;
    for (let i = 0; i < cRows.length; i++) {
      if (taken[i]) continue;
      const sc = score(g, cRows[i]);
      if (sc > bs) { bs = sc; best = i; }
    }
    if (best >= 0) { taken[best] = true; pairs.push([g, cRows[best], (g.key && g.key === cRows[best].key) ? 'text' : 'strict']); }
  }
  return { pairs, gTotal: gRows.length };
}
// Function-level worst case: one class per sub-function (the worst of its rows),
// paired by shared subId when the runs share one and the names agree, else by
// name overlap. This is the headline the engineer reads — is the worst thing
// that can happen to THIS function the same class every time?
// ---------------------------------------------------------------------------
// LEVER 4 (5 Sep 2026) — MEASURE WHAT WE ARE FIXING.
// phaseSplitAgreement: for each condition both runs drafted, did they split it into the
// same phase groups (the same set of phase sets)? Identical-input draws 2 vs 3 gave the
// same ROW COUNT on only 74 of 107 conditions; this is the honest form of that number.
// conditionFlips: per condition, what changed — split, class, or both — so a build can be
// aimed at the conditions that actually move instead of the average.
function phaseSplitAgreement(golden, cand) {
  const byCond = (d) => { const m = new Map(); d.fha.forEach(r => { const id = condIdOf(r); if (!id) return; if (!m.has(id)) m.set(id, []); m.get(id).push(r); }); return m; };
  const G = byCond(golden), C = byCond(cand);
  const setKey = (rows) => rows.map(r => [...phaseKeys(r)].sort().join('+')).sort().join(' | ');
  let paired = 0, same = 0; const flips = [];
  for (const [id, gRows] of G) {
    const cRows = C.get(id); if (!cRows) continue;
    paired++;
    const gk = setKey(gRows), ck = setKey(cRows);
    const splitSame = gk === ck;
    if (splitSame) same++;
    // class flips on strictly paired rows of THIS condition
    const gS = { fha: gRows, functions: [] }, cS = { fha: cRows, functions: [] };
    const { pairs } = pairFhaRowsStrict(gS, cS);
    const classFlips = pairs.filter(([a, b]) => sevOf(a.r) !== sevOf(b.r)).map(([a, b]) => `${[...a.ph].join('+')}: ${sevOf(a.r) || 'abstain'} → ${sevOf(b.r) || 'abstain'}`);
    if (!splitSame || classFlips.length) flips.push({ id, desc: String(gRows[0].fcDesc || '').slice(0, 60), split: splitSame ? null : { golden: gk, candidate: ck }, classFlips });
  }
  return { paired, same, rate: paired ? same / paired : 1, flips };
}
function functionWorstCase(golden, cand) {
  // rank 0 = Catastrophic … 4 = Negligible / No Safety Effect; the WORST is the LOWEST rank
  const WC_LABEL = ['Catastrophic', 'Hazardous', 'Major', 'Minor', 'Negligible'];
  const wcRank = sev => { const t = String(sev || '').trim(); if (/^no safety effect$/i.test(t)) return 4; const i = WC_LABEL.indexOf(t); return i < 0 ? null : i; };
  const worst = (d, subId) => { let m = -1; for (const r of d.fha) if (String(r.subId ?? '').trim() === subId) { const k = wcRank(sevOf(r)); if (k !== null && (m < 0 || k < m)) m = k; } return m; };
  const fnToks = f => condTokens(`${f.subName ?? ''}`);
  const cFns = cand.functions.map(f => ({ f, id: String(f.subId ?? '').trim(), toks: fnToks(f) }));
  const taken = new Array(cFns.length).fill(false);
  let paired = 0, same = 0, offByOne = 0, offMore = 0; const misses = [];
  for (const gf of golden.functions) {
    const gid = String(gf.subId ?? '').trim(), gt = fnToks(gf);
    let best = -1, bs = 0;
    for (let i = 0; i < cFns.length; i++) {
      if (taken[i]) continue;
      const nj = jaccard(gt, cFns[i].toks);
      const sc = (gid && cFns[i].id === gid && nj >= 0.4) ? 2 : (nj >= 0.4 ? nj : 0);
      if (sc > bs) { bs = sc; best = i; }
    }
    if (best < 0) continue;
    taken[best] = true;
    const wg = worst(golden, gid), wc = worst(cand, cFns[best].id);
    if (wg < 0 || wc < 0) continue;
    paired++;
    const d = Math.abs(wg - wc);
    if (d === 0) same++; else if (d === 1) offByOne++; else offMore++;
    if (d) misses.push(`${gf.subName ?? gid}: ${WC_LABEL[wg]} → ${WC_LABEL[wc]}`);
  }
  return { paired, same, offByOne, offMore, rate: paired ? same / paired : 1, misses };
}


    // --- lane-complete engine (30 Aug 2026, Waqas: "it needs to be done for
    // every single analysis, consistency will be key") ------------------------
    // ONE metric family for every analysis lane, not bespoke scorers. Row text
    // is ALL string fields concatenated (recursive, capped) — no lane's field
    // vocabulary is ever guessed (the pro-plus lesson, made structural). A lane
    // present in both runs is scored; a lane missing from either is SKIPPED and
    // NAMED in report.skippedLanes — reported, never silently ignored.
    // v1.2 (30 Aug 2026, Waqas: "what about RAM and HF analyses?") — the R&M
    // and Human-Factors lanes join the family. These stores are NESTED in the
    // project data rather than top-level arrays, so a lane may carry:
    //   alt(j)    — accessor for the raw project_documents.data shape (the
    //               in-app snapshot ALSO exports them flattened under `key`);
    //   filter(a) — row-membership rule applied to WHICHEVER source supplied
    //               the rows, so a snapshot capture and a raw-data read can
    //               never disagree about what the lane contains. The hfa
    //               filter mirrors the product's own HF_Register export
    //               (data_ops_modules.js: type || credited != null ||
    //               uncredited != null) — product-defined, not guessed;
    //   depth     — rowText recursion depth override (markov models keep
    //               their content two levels down in states/transitions).
    function _flatAsm(j) {
        var out = [];
        (Array.isArray(j.acAssumptionsData) ? j.acAssumptionsData : []).forEach(function (a) { out.push(a); });
        (Array.isArray(j.systemsData) ? j.systemsData : []).forEach(function (s) {
            ((s && Array.isArray(s.asm)) ? s.asm : []).forEach(function (a) { out.push(a); });
        });
        return out;
    }
    var LANES = {
        fta:  { key: 'ftaPages' },
        pra:  { key: 'praData' },
        zsa:  { key: 'zsaData' },
        cma:  { key: 'cmaData' },
        fmea: { key: 'fmeaData' },
        req:  { key: 'acReqData' },
        ram:    { key: 'ramParts',
                  alt: function (j) { var p = j.projectConfig; return (p && p.ram && p.ram.predict && Array.isArray(p.ram.predict.rows)) ? p.ram.predict.rows : []; } },
        markov: { key: 'markovModels', depth: 4,
                  alt: function (j) { var p = j.projectConfig; return (p && Array.isArray(p.markovModels)) ? p.markovModels : []; } },
        hfa:    { key: 'hfaRows',
                  alt: _flatAsm,
                  filter: function (a) { return !!(a && (a.type || a.credited != null || a.uncredited != null)); } },
        // v1.3 (30 Aug 2026, Waqas: "human factors is not just about
        // assumptions") — HF's own analyses join the family the day they are
        // born: function allocation, human error analysis, crew alerting
        // (hf_analyses.js stores under projectConfig.hf.*).
        hfAlloc: { key: 'hfAllocRows',
                   alt: function (j) { var h = j.projectConfig && j.projectConfig.hf; return (h && h.alloc && Array.isArray(h.alloc.rows)) ? h.alloc.rows : []; } },
        hea:     { key: 'heaRows',
                   alt: function (j) { var h = j.projectConfig && j.projectConfig.hf; return (h && h.hea && Array.isArray(h.hea.rows)) ? h.hea.rows : []; } },
        alerts:  { key: 'alertRows',
                   alt: function (j) { var h = j.projectConfig && j.projectConfig.hf; return (h && h.alerts && Array.isArray(h.alerts.rows)) ? h.alerts.rows : []; } },
        // v1.5 (30 Aug 2026) — task-first task analysis + ergonomics register
        // (Waqas: "it does not start with just an assumption") join at birth.
        tasks:   { key: 'taskRows',
                   alt: function (j) { var h = j.projectConfig && j.projectConfig.hf; return (h && h.tasks && Array.isArray(h.tasks.rows)) ? h.tasks.rows : []; } },
        ergo:    { key: 'ergoRows',
                   alt: function (j) { var h = j.projectConfig && j.projectConfig.hf; return (h && h.ergo && Array.isArray(h.ergo.rows)) ? h.ergo.rows : []; } },
        // v1.6 (2 Sep 2026) — THE INSTRUMENT CATCHES UP WITH WHAT WAS BUILT. The HF lane
        // drafters write nine stores; five were covered here and four were not, so
        // tid / cd / sa / mfc had no eval lane at all on the day their drafters shipped.
        // resources.draft shipped the same way. The rule this file has enforced since
        // 30 Aug — a lane joins the eval family the day it is born — was broken by the
        // build that most needed it, and this closes it.
        //
        // tid is the enumeration stage of the task chain (procedures -> steps); cd is the
        // §25.1302 controls-and-displays evaluation; sa the three-level situation-awareness
        // assessment; mfc the §25.1523 / Appendix D determination.
        tid:     { key: 'tidRows',
                   alt: function (j) { var h = j.projectConfig && j.projectConfig.hf; return (h && h.tid && Array.isArray(h.tid.rows)) ? h.tid.rows : []; } },
        cd:      { key: 'cdRows',
                   alt: function (j) { var h = j.projectConfig && j.projectConfig.hf; return (h && h.cd && Array.isArray(h.cd.rows)) ? h.cd.rows : []; } },
        sa:      { key: 'saRows',
                   alt: function (j) { var h = j.projectConfig && j.projectConfig.hf; return (h && h.sa && Array.isArray(h.sa.rows)) ? h.sa.rows : []; } },
        // MFC is the one lane whose row SET is fixed by the rule (six Appendix D basic
        // workload functions), so its count metric can only ever be 6/6 and says nothing.
        // What varies — and what the drafter actually writes — is the assignment and the
        // note, which the topic metric reads. The count is kept for the skip/coverage
        // bookkeeping every lane shares, not as a signal.
        mfc:     { key: 'mfcRows',
                   alt: function (j) { var h = j.projectConfig && j.projectConfig.hf; return (h && h.mfc && Array.isArray(h.mfc.rows)) ? h.mfc.rows : []; } },
        resources: { key: 'resourcesData' },
    };
    function rowText(r, depth) {
        if (depth === undefined) depth = 2;
        var out = [];
        (function walk(v, d) {
            if (out.join(' ').length > 2000) return;
            if (typeof v === 'string') { if (v.length > 1) out.push(v); return; }
            if (!v || typeof v !== 'object' || d <= 0) return;
            Object.keys(v).forEach(function (k) { if (!/^_|^ai[A-Z]/.test(k)) walk(v[k], d - 1); });
        })(r, depth);
        return out.join(' ').slice(0, 2000);
    }
    function laneTopics(rows, depth) {
        var out = new Set();
        rows.forEach(function (r) { topicsOf(rowText(r, depth)).forEach(function (t2) { out.add(t2); }); });
        return out;
    }
    // v1.2 — token fallback for lanes the topic lexicon is BLIND to. The R&M
    // parts store holds handbook part categories ("Capacitor, Ceramic"), not
    // aircraft-function language; no TOPICS entry will ever fire, so topic
    // Jaccard would score 1 trivially on empty-vs-empty and a hollowed lane
    // would pass. When NEITHER side yields a topic, compare normalized token
    // sets instead. This is NOT the F1b text-matching mistake coming back:
    // that lesson was about free AI phrasing; these stores hold enum-like
    // canonical strings (RAM categories are shipped-and-verified against the
    // staged handbook), where exact tokens ARE the content.
    function laneTokens(rows, depth) {
        var out = new Set();
        rows.forEach(function (r) {
            norm(rowText(r, depth)).split(/\s+/).forEach(function (t) { if (t.length > 2) out.add(t); });
        });
        return out;
    }
    // ---- CATEGORICAL AGREEMENT ON ID-MATCHED ROWS (HF-4, 2 Sep 2026) --------
    //
    // WHY THIS EXISTS. Any classification feature we ship inherits HFACS's best-documented
    // weakness: two trained analysts routinely code the same event differently. The
    // literature manages that by consensus reconciliation, which HIDES the disagreement.
    // We can measure it, and we are the only people in this market with the instrument to.
    //
    // THE RULER LESSON, ENFORCED STRUCTURALLY. This file published severity clsAgree 0.474
    // and called class instability a headline defect; on id-matched identical conditions
    // the same model scored 0.947. The old figure was an artifact of signature matching
    // comparing DIFFERENT conditions and scoring the difference as disagreement. So this
    // family scores ID-MATCHED ROWS ONLY — no signature fallback, no semantic pairing, no
    // exceptions. A row that cannot be matched by id is not scored and is COUNTED as
    // unmatched, because an agreement number computed over an unknown denominator is the
    // defect, not the measurement.
    //
    // ABSTENTION IS A CODE, NOT A DISAGREEMENT. The E2 result is product doctrine: the
    // 60–70% severity abstention is load-bearing — the model declines exactly the rows its
    // judgment is unstable on. Two draws that both abstain AGREE. A draw that abstains
    // against one that commits is neither agreement nor disagreement: it is a commitment
    // difference, reported on its own axis so that a candidate which "fills the column"
    // cannot buy agreement by abstaining less. That is the shape that rejected E2.
    //
    // KAPPA ALONGSIDE RAW. Raw agreement on a skewed taxonomy flatters itself — if 90% of
    // rows are one category, two coders who always guess that category score 0.9 while
    // agreeing about nothing. Cohen's kappa corrects for chance agreement and is what the
    // HFACS literature reports, so it is the number a reviewer will ask for. Both are
    // returned; neither is allowed to stand alone.
    //
    // kappa = (po - pe) / (1 - pe), po = observed agreement over scored pairs,
    // pe = sum over categories of (proportion assigned by A) x (proportion assigned by B).
    // Degenerate case: pe === 1 (both coders used exactly one category, the same one) makes
    // the denominator zero. Kappa is UNDEFINED there, not 1 and not 0 — returned as null
    // with a reason, because reporting a number for an undefined quantity is how a metric
    // starts lying.
    function agreementOn(gRows, cRows, opts) {
        opts = opts || {};
        const idOf = opts.idOf || function (r) { return r && (r.id != null ? r.id : null); };
        const codeOf = opts.codeOf || function (r) { return r && r.code; };
        const isAbstain = opts.isAbstain || function (v) { return v == null || String(v).trim() === ''; };

        const gById = new Map();
        (gRows || []).forEach(function (r) { const k = idOf(r); if (k != null && String(k) !== '') gById.set(String(k), r); });
        const seen = new Set();
        let bothCommitted = 0, agree = 0;
        let bothAbstained = 0, commitmentDiff = 0, unmatched = 0, candOnly = 0;
        const gCounts = {}, cCounts = {};

        (cRows || []).forEach(function (r) {
            const k = idOf(r);
            if (k == null || String(k) === '') { candOnly++; return; }
            const g = gById.get(String(k));
            if (!g) { candOnly++; return; }
            seen.add(String(k));
            const a = codeOf(g), b = codeOf(r);
            const aAbs = isAbstain(a), bAbs = isAbstain(b);
            if (aAbs && bAbs) { bothAbstained++; return; }
            if (aAbs !== bAbs) { commitmentDiff++; return; }
            bothCommitted++;
            const av = String(a), bv = String(b);
            gCounts[av] = (gCounts[av] || 0) + 1;
            cCounts[bv] = (cCounts[bv] || 0) + 1;
            if (av === bv) agree++;
        });
        gById.forEach(function (_v, k) { if (!seen.has(k)) unmatched++; });

        const po = bothCommitted ? agree / bothCommitted : null;
        let pe = 0;
        if (bothCommitted) {
            const cats = new Set(Object.keys(gCounts).concat(Object.keys(cCounts)));
            cats.forEach(function (cat) {
                pe += ((gCounts[cat] || 0) / bothCommitted) * ((cCounts[cat] || 0) / bothCommitted);
            });
        }
        let kappa = null, kappaNote = '';
        if (!bothCommitted) kappaNote = 'no pair where both draws committed — kappa undefined';
        else if (pe >= 1 - 1e-12) kappaNote = 'both draws used a single identical category — chance agreement is total, kappa undefined';
        else kappa = +((po - pe) / (1 - pe)).toFixed(3);

        return {
            // agreement over pairs where BOTH committed — the number that means something
            agreement: po === null ? null : +po.toFixed(3),
            kappa: kappa, kappaNote: kappaNote,
            bothCommitted: bothCommitted, agreed: agree,
            // abstention is a code: both-abstained is agreement about declining, and is
            // reported so it can never be silently folded into `agreement`
            bothAbstained: bothAbstained,
            // one committed, one did not — a COMMITMENT difference, its own axis
            commitmentDiff: commitmentDiff,
            commitmentDelta: (bothCommitted + bothAbstained + commitmentDiff)
                ? +(commitmentDiff / (bothCommitted + bothAbstained + commitmentDiff)).toFixed(3) : 0,
            // the denominator's honesty: rows that could not be id-matched, both ways
            unmatchedGolden: unmatched, unmatchedCandidate: candOnly,
            matchBasis: 'id'
        };
    }
    // Two-level agreement (a taxonomy with a level and a category within it), reported
    // SEPARATELY. Level agreement will be high on any sane taxonomy; category agreement
    // within the level is the number that matters, and averaging the two would let the
    // easy half carry the hard one.
    function agreementTwoLevel(gRows, cRows, opts) {
        opts = opts || {};
        const lvl = opts.levelOf || function (r) { return r && r.level; };
        const cat = opts.categoryOf || function (r) { return r && r.category; };
        return {
            level: agreementOn(gRows, cRows, { idOf: opts.idOf, codeOf: lvl, isAbstain: opts.isAbstain }),
            category: agreementOn(gRows, cRows, { idOf: opts.idOf, codeOf: cat, isAbstain: opts.isAbstain })
        };
    }
    function scoreLanes(golden, cand, metrics, skipped) {
        Object.keys(LANES).forEach(function (lane) {
            var L = LANES[lane];
            var g = golden[L.key] || [];
            var c = cand[L.key] || [];
            if (!g.length || !c.length) {
                if (g.length || c.length) skipped.push(lane + ' (present in only one run: golden ' + g.length + ', candidate ' + c.length + ')');
                else skipped.push(lane + ' (no data in either run)');
                return;
            }
            // v1.4 (30 Aug 2026) — per-lane granularity BANDS, fixture-owned like
            // functionCount's: the A/B found zsa drew 18/18 vs the golden's 11 —
            // zonal granularity is decompose's old disease in a new lane, and a
            // ±30% ratio around one draw institutionalises whichever draw the
            // golden happened to get. golden.meta.laneBands = { zsa: [lo, hi] }
            // judges the CANDIDATE against the band instead.
            var band = golden.meta && golden.meta.laneBands && golden.meta.laneBands[lane];
            if (Array.isArray(band) && band.length === 2) {
                metrics[lane + 'Count'] = { golden: g.length, candidate: c.length, band: band,
                    pass: c.length >= band[0] && c.length <= band[1],
                    note: 'granularity band from golden meta.laneBands — fixture-owned, tighten as draws accumulate' };
            } else {
                metrics[lane + 'Count'] = { golden: g.length, candidate: c.length,
                    pass: (g.length === 0 ? c.length === 0 : Math.abs(c.length - g.length) / g.length <= 0.30),
                    note: 'same ±30% family as every lane — tighten per lane as variance data accumulates' };
            }
            var gt = laneTopics(g, L.depth), ct = laneTopics(c, L.depth);
            if (!gt.size && !ct.size) {
                metrics[lane + 'TopicJaccard'] = { value: +jaccard(laneTokens(g, L.depth), laneTokens(c, L.depth)).toFixed(3), threshold: 0.55,
                    note: 'TOKEN fallback — topic lexicon blind to this lane\'s vocabulary; valid because the store holds enum-like canonical strings, not free phrasing' };
            } else {
                metrics[lane + 'TopicJaccard'] = { value: +jaccard(gt, ct).toFixed(3), threshold: 0.55,
                    note: 'canonical-topic overlap over ALL row text — content, not phrasing (one rule for every lane)' };
            }
        });
    }

    // --- the scorer -----------------------------------------------------------
    // golden/cand: { meta?, functions, fcim, fha, assumptions } (normalizeRun
    // accepts raw project_documents.data shapes too).
    function normalizeRun(j) {
        j = j || {};
        var out = {
            meta: j.meta || {},
            functions: j.functions || j.acFunctionsData || [],
            fcim: j.fcim || j.acFcimData || [],
            fha: j.fha || j.acFhaData || [],
            assumptions: j.assumptions || j.aiAssumptions || [],
        };
        Object.keys(LANES).forEach(function (lane) {
            var L = LANES[lane];
            // top-level key first (snapshot exports), else the raw
            // project_documents.data accessor; the membership filter applies
            // to BOTH sources so the two shapes can never disagree (v1.2)
            var rows = Array.isArray(j[L.key]) ? j[L.key] : (L.alt ? L.alt(j) : []);
            out[L.key] = L.filter ? rows.filter(L.filter) : rows;
        });
        return out;
    }

    function scoreRun(goldenRaw, candRaw) {
        const golden = normalizeRun(goldenRaw);
        const cand = normalizeRun(candRaw);
        const engineerClassified = (golden.meta && golden.meta.engineerClassified) || [];
        const engSet = new Set(engineerClassified.map(norm));
        const within = (a, b, tol) => (b === 0 ? a === 0 : Math.abs(a - b) / b <= tol);

        const { pairs, gTotal } = pairFhaRows(golden, cand);
        let textMatched = 0;
        for (const [, , how] of pairs) if (how === 'text') textMatched++;
        // v1.7 — severity is judged on STRICT pairs (same condition, same phase group); the
        // topic pairing above keeps measuring content coverage (fhaSignatureMatchRate).
        const strict = pairFhaRowsStrict(golden, cand);
        let sevAgree = 0, sevDenom = 0, severeJumps = 0;
        let clsAgree = 0, clsDenom = 0;
        for (const [g, c] of strict.pairs) {
            if (engSet.has(norm(g.r.fcId))) continue;
            sevDenom++;
            if (sevOf(g.r) === sevOf(c.r)) sevAgree++;
            const a = sevRank(sevOf(g.r)), b = sevRank(sevOf(c.r));
            if (a !== null && b !== null) {
                clsDenom++;
                if (a === b) clsAgree++;
                if (Math.abs(a - b) >= 2) severeJumps++;
            }
        }

        const gDist = sevDist(golden), cDist = sevDist(cand);
        let l1 = 0;
        for (const k of Object.keys(gDist)) l1 += Math.abs((gDist[k] || 0) - (cDist[k] || 0));
        const sevDistL1Rate = golden.fha.length ? l1 / (2 * golden.fha.length) : 0;

        const gFn = functionTopics(golden), cFn = functionTopics(cand);
        const gFcimSig = fcimSignatures(golden), cFcimSig = fcimSignatures(cand);
        const gAsm = assumptionStats(golden), cAsm = assumptionStats(cand);
        const gAbst = abstainRate(golden, engineerClassified);
        const cAbst = abstainRate(cand, engineerClassified);

        const band = Array.isArray(golden.meta.granularityBand) && golden.meta.granularityBand.length === 2
            ? golden.meta.granularityBand : null;

        const metrics = {
            functionCount: band
                ? { golden: golden.functions.length, candidate: cand.functions.length,
                    band, pass: cand.functions.length >= band[0] && cand.functions.length <= band[1],
                    note: 'granularity band from golden meta — the dominant variance axis of the 29 Aug batch' }
                : { golden: golden.functions.length, candidate: cand.functions.length,
                    pass: within(cand.functions.length, golden.functions.length, 0.15) },
            functionTopicJaccard: {
                value: +jaccard(gFn.topics, cFn.topics).toFixed(3), threshold: 0.75,
                note: 'canonical-topic overlap of the function set — content, not phrasing' },
            fcimConditionCount: {
                golden: fcimConditionTexts(golden).size, candidate: fcimConditionTexts(cand).size,
                pass: band ? true : within(fcimConditionTexts(cand).size, fcimConditionTexts(golden).size, 0.15),
                note: band ? 'informational when a granularity band governs (count follows the decompose)' : undefined },
            fcimTopicModeJaccard: {
                value: +jaccard(gFcimSig, cFcimSig).toFixed(3), threshold: 0.55,
                note: 'topic|failure-mode signature overlap of all FCIM conditions' },
            fhaRowCount: {
                golden: golden.fha.length, candidate: cand.fha.length,
                pass: band ? true : within(cand.fha.length, golden.fha.length, 0.15),
                note: band ? 'informational when a granularity band governs' : undefined },
            fhaSignatureMatchRate: {
                value: +(gTotal ? pairs.length / gTotal : 0).toFixed(3), threshold: 0.70,
                note: 'golden FHA rows with a text OR topic|mode matched candidate row' },
            severityAgreement: {
                value: +(sevDenom ? sevAgree / sevDenom : 0).toFixed(3), threshold: 0.90,
                note: 'v1.7 (4 Sep 2026): exact severity over STRICT pairs — same condition (shared id, or same loss form + wording), same phase group; bar 0.90 (Waqas: "the numbers need to be over 90 percent"). Was topic-paired at 0.50: it compared different conditions.' },
            strictPairRate: {
                value: +(strict.gTotal ? strict.pairs.length / strict.gTotal : 0).toFixed(3), informational: true,
                note: 'golden FHA rows with a strict counterpart (same condition + phase group) — the denominator the severity metrics stand on' },
            phaseSplitAgreement: (function () { const p = phaseSplitAgreement(golden, cand); return {
                value: +p.rate.toFixed(3), threshold: 0.90, paired: p.paired, same: p.same,
                flips: p.flips.slice(0, 40),
                note: 'conditions drafted by both runs whose rows split the flight into the SAME phase groups; flips lists per condition what moved — the split, the class on a paired row, or both' }; })(),
            functionWorstCaseAgreement: (function () { const w = functionWorstCase(golden, cand); return {
                value: +w.rate.toFixed(3), threshold: 0.90, paired: w.paired, same: w.same, offByOne: w.offByOne, offByTwoPlus: w.offMore, misses: w.misses.slice(0, 20),
                note: 'the worst class per aircraft sub-function is the same in both runs (the headline an engineer reads; abstraction-level differences in row counts do not move it)' }; })(),
            severityAgreementClassified: {
                value: +(clsDenom ? clsAgree / clsDenom : 1).toFixed(3), threshold: 0.35,
                note: 'agreement over STRICT pairs where BOTH sides committed to a class — cannot hide behind abstain-abstain pairs; wholesale reclassification scores 0 here' },
            severityDistL1: { value: +sevDistL1Rate.toFixed(3), thresholdMax: 0.20,
                note: 'total-variation distance of severity distributions' },
            severeJumpRate: { value: +(sevDenom ? severeJumps / sevDenom : 0).toFixed(3), thresholdMax: 0.05,
                note: 'STRICT-paired rows whose severity moved >= 2 classes — judgment changes, not wobble' },
            abstentionRateDelta: {
                golden: +gAbst.toFixed(3), candidate: +cAbst.toFixed(3),
                pass: Math.abs(gAbst - cAbst) <= 0.15,
                note: 'no-value-no-guess discipline — the most repeatable behavior of the 29 Aug batch (60–68% everywhere)' },
            assumptionCitedRate: { golden: +gAsm.citedRate.toFixed(3), candidate: +cAsm.citedRate.toFixed(3),
                pass: cAsm.citedRate >= 0.90 },
            citationVerifiedRate: { golden: +gAsm.verifiedRate.toFixed(3), candidate: +cAsm.verifiedRate.toFixed(3),
                pass: cAsm.verifiedRate >= 0.90,
                note: 'was 0.95; fable-5 observed 0.93–0.96 across the batch — 0.90 floor, tighten later' },
            functionNameJaccard: { value: +jaccard(functionNames(golden), functionNames(cand)).toFixed(3),
                informational: true, note: 'exact-text — measures phrasing; kept for trend-watching only' },
            topFunctionJaccard: { value: +jaccard(topFunctionNames(golden), topFunctionNames(cand)).toFixed(3),
                informational: true, note: 'exact-text — informational' },
            fcimConditionJaccard: { value: +jaccard(fcimConditionTexts(golden), fcimConditionTexts(cand)).toFixed(3),
                informational: true, note: 'exact-text — informational' },
            fhaTextMatchedRate: { value: +(gTotal ? textMatched / gTotal : 0).toFixed(3),
                informational: true, note: 'pass-1 exact-text pairs only — informational' },
            topicUnassignedFunctions: { golden: gFn.unassigned, candidate: cFn.unassigned,
                informational: true, note: 'lexicon blind spots — grow TOPICS if this creeps up' },
        };

        for (const m of Object.values(metrics)) {
            if (m.informational) { m.pass = true; continue; }
            if (m.pass === undefined) {
                if (m.thresholdMax !== undefined) m.pass = m.value <= m.thresholdMax;
                else m.pass = m.value >= m.threshold;
            }
        }

        const skippedLanes = [];
        scoreLanes(golden, cand, metrics, skippedLanes);
        for (const m of Object.values(metrics)) {
            if (m.pass === undefined) {
                if (m.thresholdMax !== undefined) m.pass = m.value <= m.thresholdMax;
                else if (m.threshold !== undefined) m.pass = m.value >= m.threshold;
            }
        }
        const failures = Object.entries(metrics).filter(([, m]) => !m.pass).map(([k]) => k);
        return {
            matchedFhaRows: pairs.length,
            matchedByText: textMatched,
            goldenFhaRows: gTotal,
            metrics,
            failures,
            skippedLanes,
            verdict: failures.length ? 'DRIFT' : 'REPEATABLE',
        };
    }

    return { normalizeRun, scoreRun, norm, jaccard, TOPICS, topicsOf, modeOf,
             rowSignatures, pairFhaRows, pairFhaRowsStrict, functionWorstCase, phaseSplitAgreement, lossFormOf, phaseKeys, functionTopics, fcimSignatures,
             LANES, rowText, laneTopics, laneTokens,
             agreementOn, agreementTwoLevel };   // HF-4 — categorical agreement, id-matched only
}));
