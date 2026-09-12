// ============================================================================
// event_trees.js — v1.3 — C4: Event Tree Analysis. Sequence-consequence
// arithmetic, deterministic, reconciled against the FHA.
//
// An event tree: an INITIATOR (with a user-entered frequency) passes through
// ordered BARRIERS (each with a user-entered failure probability). Every
// success/failure path is enumerated — 2^n outcomes — with its probability
// as the exact product along the path. The user assigns each outcome a
// consequence severity and may link it to a failure condition.
//
// v1.1 adds, without changing the audited arithmetic model:
//   • a visual event-tree diagram (success up / fail down, leaves coloured by
//     severity) — the poster-style picture, generated from the same numbers;
//   • a consequence roll-up (Σ frequency by severity + worst credible outcome)
//     — the "top-event" analog, computed, not drawn;
//   • severity colour chips, inline finding highlights, tree/barrier deletion;
//   • OPTIONAL COMMON-CAUSE COUPLING: a barrier may carry a conditional
//     failure probability P(fail | an upstream barrier already failed). When
//     set, the product rule uses it once any earlier barrier on the path has
//     failed. Because each node's two branches still sum to 1, path
//     probabilities STILL sum to 1.0 × initiator frequency — the self-audit
//     is preserved. This retires the "barriers assumed independent" caveat:
//     dependence is modelled explicitly and remains machine-checked.
//
// THE DUAL-LANE RECONCILE: an outcome linked to an FC whose computed
// sequence severity disagrees with the FHA classification is a FINDING —
// either the tree's consequence call or the hazard classification is wrong,
// and the machine won't pick for you. INV-27 (advisory) names each one.
//
// Numbers are USER-ENTERED (frequencies, barrier failure probabilities) —
// consistent with the no-licensed-data, no-derived-guesses house rules.
// Prints via REG §11d. Page: Trees & models → Event Trees.
//
// v1.2 (Backlog #5) — the coupling model stops being an island:
//   • BARRIER→TREE LINKS (elicited): a barrier may declare which fault-tree
//     page implements it. A fact, user-set, journaled — never inferred.
//   • COUPLING DETECTOR (deterministic, no AI, no derived numbers): for every
//     barrier pair where both are linked, the detector intersects the linked
//     trees' declared CCF groups and shared logical events. A shared signal
//     with no pCcf on the downstream barrier is a NAMED FINDING — the core
//     demands a user-entered conditional probability; it never invents one.
//     INV-28 carries the findings.
//   • IP-LEDGER SOURCE 'eta' (etaLedgerHits): coupled barrier pairs become
//     independence principles in the cross-cutting ledger — golden thread,
//     App-M questionnaire, and the compromise cascade see them automatically.
//     Unmodeled coupling = contradicted claim (compromised until dispositioned).
//   • TWO-LANE RECONCILE: a linked barrier's elicited pFail is ANNOTATED with
//     the linked tree's BDD-exact P(top). Annotation only — the computed lane
//     never overwrites the elicited value, and no finding fires on magnitude
//     alone (pFail is per-demand; P(top) is per-FH — units are the user's call).
// ============================================================================
(function () {
    var _sevPill = function (s, o) { return (typeof sevPillHtml === 'function') ? sevPillHtml(s, o) : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }; // severity pill (helpers_modules.js); safe when helpers is not loaded (test sandboxes)
    'use strict';

    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {}; }
    function _store() { const pc = _pc(); if (!Array.isArray(pc.eventTrees)) pc.eventTrees = []; return pc.eventTrees; }
    function _jr(k, m) { try { if (typeof window.jrnl === 'function') window.jrnl(k, m); } catch (_) {} }
    function _save() { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }
    const SEVS = ['No Safety Effect', 'Minor', 'Major', 'Hazardous', 'Catastrophic'];
    // 11 Sep — the app-wide bright severity fills (see --sev-*-fill in safety_lab.css)
    const SEV_COLORS = {
        'No Safety Effect': '#A6DFB4', 'Minor': '#F8ECB0', 'Major': '#F2DB74',
        'Hazardous': '#F5B878', 'Catastrophic': '#F2928C'
    };
    function _num(v) { const x = parseFloat(v); return Number.isFinite(x) ? x : null; }
    function _clamp01(v) { return Math.min(1, Math.max(0, v)); }

    // ------------------------------------------------------------ evaluation
    // outcomes: every success/failure combination over the ordered barriers.
    // key = bitstring, bit i set ⇒ barrier i FAILED.
    // Common-cause coupling: if a barrier has a finite pCcf in [0,1], that
    // conditional probability is used in place of pFail on any path where an
    // earlier barrier has already failed. Each node's two branches still sum
    // to 1, so Σ path-probabilities remains exactly 1.
    // v1.3 — ACCEPT AN ID AS WELL AS A TREE. Every other entry point in this
    // module takes a tree id (etaAddBarrier, etaLinkBarrier, etaAssess,
    // etaDelete), so an id is the natural thing to reach for here too — and
    // passing one used to return `{outcomes:1, freq:0, closed:true, sum:1}`.
    // That is the worst possible answer: the SELF-AUDIT that exists to catch a
    // malformed tree reports CLOSED on a non-tree, with no throw and no null.
    // An unresolvable argument is now REFUSED loudly instead.
    // 2^17 = 131,072 outcomes — measured at ~0.9 s and well under 200 MB, so it stays
    // inside an interactive budget. Raising it is a decision to be made against a
    // measurement, not a preference: every extra barrier DOUBLES both time and memory.
    const ETA_MAX_BARRIERS = 17;
    const ETA_OUTCOME_BUDGET = 1 << ETA_MAX_BARRIERS;

    function etaEvaluate(tree) {
        if (typeof tree === 'string' || typeof tree === 'number') {
            const key = String(tree);
            const found = _store().find(x => x && x.id === key);
            if (!found) throw new Error('etaEvaluate: no event tree with id "' + key + '"');
            tree = found;
        }
        if (!tree || typeof tree !== 'object' || !Array.isArray(tree.barriers) || !tree.initiator)
            throw new Error('etaEvaluate: expected an event tree or a tree id — refusing to audit a value that is not one');
        const bars = tree.barriers || [];
        const freq = _num(tree.initiator && tree.initiator.freq) || 0;
        const n = bars.length;

        // OUTCOME BUDGET. An event tree enumerates 2^N paths, so this loop is
        // combinatorial in the barrier count and had NO guard — the fault-tree side
        // has refused above CUTSET_BUDGET for years while this one allocated until
        // the heap died. Measured 7 Aug 2026 on the real engine: 16 barriers = 65,536
        // outcomes in 371 ms; 18 = 262,144 in 1.7 s and +269 MB; 20 = 1,048,576 in
        // 8.2 s and +1.06 GB. Twenty barriers is a large but not absurd ETA, and it
        // took a gigabyte to say so.
        //
        // Refuse cleanly and name the number, exactly as getCutsets does. A partial
        // enumeration is NOT offered: a truncated outcome set under-reports the
        // consequences an event tree exists to enumerate, and Σp would silently stop
        // summing to 1 — the one property this evaluation is checked against.
        if (n > ETA_MAX_BARRIERS) {
            const err = new Error('This event tree has ' + n + ' barriers, which enumerates 2^' + n +
                ' = ' + Math.pow(2, n).toLocaleString() + ' outcomes — above the ' +
                ETA_OUTCOME_BUDGET.toLocaleString() + ' budget. Decompose it: model the later barriers as a ' +
                'second event tree seeded by the outcome that reaches them, or fold barriers that ' +
                'always act together into one. Nothing has been computed — a partial enumeration ' +
                'would under-report outcomes and break the Σp = 1 check.');
            err.name = 'EtaExplosionError';
            err.barriers = n;
            err.wouldEnumerate = Math.pow(2, n);
            err.budget = ETA_OUTCOME_BUDGET;
            throw err;
        }
        const outcomes = [];
        let sum = 0;
        let coupled = false;
        for (let i = 0; i < n; i++) { if (_num(bars[i].pCcf) !== null) coupled = true; }
        for (let mask = 0; mask < (1 << n); mask++) {
            let p = 1;
            const seq = [];
            let upstreamFailed = false;
            for (let i = 0; i < n; i++) {
                const base = _clamp01(_num(bars[i].pFail) || 0);
                const ccf = _num(bars[i].pCcf);
                const pf = (upstreamFailed && ccf !== null) ? _clamp01(ccf) : base;
                if (mask & (1 << i)) { p *= pf; seq.push(bars[i].name + ' FAILS'); upstreamFailed = true; }
                else { p *= (1 - pf); seq.push(bars[i].name + ' holds'); }
            }
            sum += p;
            const key = mask.toString(2).padStart(Math.max(n, 1), '0');
            const c = (tree.consequences || {})[key] || {};
            outcomes.push({ key, seq, prob: p, freq: p * freq, severity: c.severity || '', linkedFcId: c.linkedFcId || '', note: c.note || '' });
        }
        const closed = Math.abs(sum - 1) < 1e-9;
        return { outcomes, freq, closed, sum, coupled };
    }

    // roll-up: Σ frequency and count by severity, plus worst credible outcome
    function _rollup(ev) {
        const bySev = {}; let unassessed = 0, worstIdx = -1;
        ev.outcomes.forEach(o => {
            if (!o.severity) { if (o.prob > 0) unassessed++; return; }
            const b = bySev[o.severity] || (bySev[o.severity] = { count: 0, freq: 0 });
            b.count++; b.freq += o.freq;
            const idx = SEVS.indexOf(o.severity);
            if (idx > worstIdx) worstIdx = idx;
        });
        const worst = worstIdx >= 0 ? SEVS[worstIdx] : null;
        return { bySev, unassessed, worst, worstFreq: worst ? bySev[worst].freq : 0 };
    }

    function _fcSeverity(fcId) {
        const ac = (typeof acFhaData !== 'undefined' ? acFhaData : []) || [];
        let f = ac.find(x => x && x.fcId === fcId);
        if (!f) {
            (((typeof systemsData !== 'undefined' ? systemsData : []) || [])).some(s => { f = (s.fha || []).find(x => x && x.fcId === fcId); return !!f; });
        }
        return f ? (f.severity || '') : null;
    }

    function etaFindings() {
        const out = [];
        _store().forEach(t => {
            const ev = etaEvaluate(t);
            if (!ev.closed) out.push({ tree: t.id, key: null, kind: 'arithmetic', detail: 'path probabilities sum to ' + ev.sum.toPrecision(6) + ' ≠ 1 — barrier probability out of range' });
            ev.outcomes.forEach(o => {
                if (!o.linkedFcId || !o.severity) return;
                const fhaSev = _fcSeverity(o.linkedFcId);
                if (fhaSev === null) { out.push({ tree: t.id, key: o.key, kind: 'dangling', detail: 'outcome ' + o.key + ' links ' + o.linkedFcId + ' which resolves to no FHA row' }); return; }
                if (fhaSev !== o.severity) out.push({
                    tree: t.id, key: o.key, kind: 'severity-conflict',
                    detail: 'outcome ' + o.key + ' (' + o.seq.join(' → ') + ') assessed ' + o.severity + ' but ' + o.linkedFcId + ' is classified ' + fhaSev + ' in the FHA — one of them is wrong; the machine will not pick',
                });
            });
        });
        return out;
    }

    // -------------------------------------------------- v1.2 coupling model
    function _pageById(id) {
        return ((typeof ftaPages !== 'undefined' ? ftaPages : []) || []).find(p => p && p.id === id) || null;
    }
    // Declared signals of a fault-tree page: CCF groups (name, from nodes with
    // a group + user β > 0) and logical event ids of its leaves. Transfers are
    // flattened when the engine offers it, so a shared subtree counts.
    function _treeSignals(page) {
        const groups = new Set(), lids = new Set();
        if (!page || !page.root) return { groups, lids };
        let root = page.root;
        try {
            if (typeof SLFTAEngine !== 'undefined' && SLFTAEngine.flattenTransfers) {
                const f = SLFTAEngine.flattenTransfers(page.root, (typeof ftaPages !== 'undefined' ? ftaPages : []) || []);
                if (f && f.root) root = f.root;
            }
        } catch (_) { /* raw walk below */ }
        (function walk(n, seen) {
            if (!n || seen.has(n)) return;
            seen.add(n);
            if (n.type !== 'gate') {
                lids.add(String(n.logicalId != null ? n.logicalId : n.id));
                if (n.ccfGroup && (parseFloat(n.beta) || 0) > 0) groups.add(String(n.ccfGroup));
            }
            (n.children || n._children || []).forEach(c => walk(c, seen));
        })(root, new Set());
        return { groups, lids };
    }
    function _intersect(a, b) { const out = []; a.forEach(x => { if (b.has(x)) out.push(x); }); return out; }

    // BDD-exact P(top) of a linked page — the ANNOTATION lane. null when the
    // engine or tree is unavailable. Never written anywhere.
    function _linkedPTop(page) {
        try {
            if (page && page.root && typeof computeExactProbability === 'function') {
                const r = computeExactProbability(page.root);
                if (r && typeof r.prob === 'number' && isFinite(r.prob)) return r.prob;
            }
        } catch (_) {}
        return null;
    }

    // etaCoupling(tree) — every barrier pair (i<j) where BOTH are linked to a
    // fault-tree page. coupled ⇔ same page, shared CCF group, or shared
    // logical event. modeled ⇔ the downstream barrier carries a pCcf.
    // DETERMINISTIC — set intersections over user-declared facts; no numbers
    // originate here.
    function etaCoupling(tree) {
        const bars = (tree && tree.barriers) || [];
        const sig = {};   // barrier index → signals of its linked page
        bars.forEach((b, i) => { if (b && b.linkedPageId) sig[i] = _treeSignals(_pageById(b.linkedPageId)); });
        const out = [];
        for (let i = 0; i < bars.length; i++) {
            for (let j = i + 1; j < bars.length; j++) {
                const a = bars[i], b = bars[j];
                if (!a || !b || !a.linkedPageId || !b.linkedPageId) continue;
                const samePage = a.linkedPageId === b.linkedPageId;
                const sharedGroups = samePage ? [] : _intersect(sig[i].groups, sig[j].groups);
                const sharedEvents = samePage ? [] : _intersect(sig[i].lids, sig[j].lids);
                if (!samePage && !sharedGroups.length && !sharedEvents.length) continue;
                out.push({
                    treeId: tree.id, i, j, aName: a.name || ('B' + (i + 1)), bName: b.name || ('B' + (j + 1)),
                    aPageId: a.linkedPageId, bPageId: b.linkedPageId,
                    samePage, sharedGroups, sharedEvents,
                    modeled: _num(b.pCcf) !== null,
                    why: samePage
                        ? 'both barriers are implemented by the same fault tree'
                        : (sharedGroups.length ? 'linked trees share CCF group(s) ' + sharedGroups.join(', ') : '')
                          + (sharedGroups.length && sharedEvents.length ? '; ' : '')
                          + (sharedEvents.length ? 'linked trees share event(s) ' + sharedEvents.join(', ') : ''),
                });
            }
        }
        return out;
    }

    // Findings for INV-28: coupled pairs whose downstream barrier has NO pCcf.
    // The demand is always for a USER value — the machine never supplies one.
    function etaCouplingFindings() {
        const out = [];
        _store().forEach(t => {
            etaCoupling(t).forEach(c => {
                if (c.modeled) return;
                out.push({
                    tree: t.id, i: c.i, j: c.j, kind: 'coupling-unmodeled',
                    detail: t.id + ' barriers "' + c.aName + '" and "' + c.bName + '": ' + c.why +
                        ' — the independence assumed by the product rule is defeated. Enter a conditional pFail (your value) on "' + c.bName + '", or remove/justify the links.',
                });
            });
        });
        return out;
    }

    // etaLedgerHits() — the IP-ledger source (mirrors btLedgerHits). One hit
    // per coupled barrier pair; unmodeled coupling is a CONTRADICTED claim.
    function etaLedgerHits() {
        const out = [];
        _store().forEach(t => {
            etaCoupling(t).forEach(c => out.push({
                treeId: t.id, treeName: t.name || t.id,
                i: c.i, j: c.j, aName: c.aName, bName: c.bName,
                aPageId: c.aPageId, bPageId: c.bPageId,
                modeled: c.modeled, why: c.why,
            }));
        });
        return out;
    }

    // ------------------------------------------------------------ mutations
    window.etaCreate = function (name, initDesc, freq, by) {
        if (!String(name || '').trim() || !String(by || '').trim()) return { ok: false, err: 'Name and signature are required.' };
        const f = _num(freq);
        if (!(f > 0)) return { ok: false, err: 'Initiator frequency must be a positive number (your value, per flight hour).' };
        const id = 'ET-' + String(_store().length + 1).padStart(3, '0');
        _store().push({ id, name: String(name).trim(), initiator: { desc: String(initDesc || '').trim(), freq: f }, barriers: [], consequences: {}, by: String(by).trim(), at: new Date().toISOString() });
        _jr('eta', id + ' created: ' + name + ' (initiator ' + f + '/FH) — signed ' + by);
        _save();
        return { ok: true, id };
    };
    // pCcf (5th arg) optional — conditional failure probability once an upstream barrier has failed
    window.etaAddBarrier = function (treeId, name, pFail, note, pCcf) {
        const t = _store().find(x => x.id === treeId);
        if (!t) return { ok: false, err: 'Tree not found.' };
        const p = _num(pFail);
        if (!(p >= 0 && p <= 1)) return { ok: false, err: 'Barrier failure probability must be in [0, 1] (your value).' };
        if (!String(name || '').trim()) return { ok: false, err: 'Barrier name required.' };
        const bar = { name: String(name).trim(), pFail: p, note: String(note || '').trim() };
        const c = _num(pCcf);
        if (c !== null) {
            if (!(c >= 0 && c <= 1)) return { ok: false, err: 'Common-cause conditional probability must be in [0, 1].' };
            bar.pCcf = c;
        }
        t.barriers.push(bar);
        t.consequences = {};   // outcome keys change shape — assessments must be redone deliberately
        _jr('eta', treeId + ': + barrier "' + name + '" (pFail ' + p + (c !== null ? ', pCcf ' + c : '') + ') — outcome set regenerated, consequence calls reset');
        _save();
        return { ok: true };
    };
    // v1.2 — link/unlink a barrier to the fault-tree page that implements it.
    // An elicited fact: journaled, saved, and consumed by the coupling
    // detector + IP ledger. Pass a falsy pageId to unlink.
    window.etaLinkBarrier = function (treeId, barrierIndex, pageId) {
        const t = _store().find(x => x.id === treeId);
        if (!t) return { ok: false, err: 'Tree not found.' };
        const bar = (t.barriers || [])[barrierIndex];
        if (!bar) return { ok: false, err: 'Barrier not found.' };
        const pid = String(pageId || '').trim();
        if (pid) {
            if (!_pageById(pid)) return { ok: false, err: 'Fault-tree page not found.' };
            bar.linkedPageId = pid;
            _jr('eta', treeId + ': barrier "' + bar.name + '" linked to fault tree ' + pid);
        } else {
            delete bar.linkedPageId;
            _jr('eta', treeId + ': barrier "' + bar.name + '" unlinked from its fault tree');
        }
        _save();
        return { ok: true };
    };
    window.etaRemoveBarrier = function (treeId) {
        const t = _store().find(x => x.id === treeId);
        if (!t || !(t.barriers || []).length) return { ok: false, err: 'No barrier to remove.' };
        const removed = t.barriers.pop();
        t.consequences = {};
        _jr('eta', treeId + ': − barrier "' + (removed && removed.name) + '" — outcome set regenerated, consequence calls reset');
        _save();
        return { ok: true };
    };
    window.etaDelete = function (treeId) {
        const s = _store(); const i = s.findIndex(x => x.id === treeId);
        if (i < 0) return { ok: false, err: 'Tree not found.' };
        s.splice(i, 1);
        _jr('eta', treeId + ' deleted');
        _save();
        return { ok: true };
    };
    window.etaAssess = function (treeId, key, severity, linkedFcId, note, by) {
        const t = _store().find(x => x.id === treeId);
        if (!t) return { ok: false, err: 'Tree not found.' };
        if (SEVS.indexOf(severity) < 0) return { ok: false, err: 'Unknown severity.' };
        if (!String(by || '').trim()) return { ok: false, err: 'A signature is required.' };
        t.consequences[key] = { severity, linkedFcId: String(linkedFcId || '').trim(), note: String(note || '').trim(), by: String(by).trim(), at: new Date().toISOString() };
        _jr('eta', treeId + ' outcome ' + key + ' assessed ' + severity + (linkedFcId ? ' → ' + linkedFcId : '') + ' — signed ' + by);
        _save();
        return { ok: true };
    };

    // INV-27 (advisory)
    (function register() {
        function reg() {
            if (typeof window.invRegister !== 'function') return false;
            window.invRegister({
                id: 'INV-27', name: 'Event-tree outcomes agree with the FHA classifications they link (and their arithmetic closes)', sev: 'advisory',
                run: () => {
                    const f = etaFindings();
                    let checked = 0;
                    _store().forEach(t => { checked += 1 + Object.keys(t.consequences || {}).length; });
                    return { checked, fails: f.map(x => x.tree + ' [' + x.kind + ']: ' + x.detail) };
                }
            });
            return true;
        }
        if (!reg()) { let tries = 20; const t = setInterval(() => { if (reg() || --tries <= 0) clearInterval(t); }, 300); }
    })();

    // INV-28 (advisory) — v1.2: no event-tree barrier pair rests on an
    // independence the linked fault trees themselves defeat.
    (function register() {
        function reg() {
            if (typeof window.invRegister !== 'function') return false;
            window.invRegister({
                id: 'INV-28', name: 'Event-tree barrier independence is not defeated by shared common cause in the linked fault trees (unmodeled coupling)', sev: 'advisory',
                run: () => {
                    const f = etaCouplingFindings();
                    let checked = 0;
                    _store().forEach(t => { checked += etaCoupling(t).length || 0; checked += 1; });
                    return { checked, fails: f.map(x => x.detail) };
                }
            });
            return true;
        }
        if (!reg()) { let tries = 20; const t = setInterval(() => { if (reg() || --tries <= 0) clearInterval(t); }, 300); }
    })();

    // ------------------------------------------------------------ diagram
    function _sevChip(sev) {
        if (!sev) return '<span style="color:var(--color-text-tertiary); font-size:11px;">unassessed</span>';
        return _sevPill(sev);
    }
    // poster-style tree: barriers as columns, success up / fail down, leaves
    // coloured by severity. Limited to n≤5 (2^5 = 32 leaves) for readability.
    function _svgTree(t, ev) {
        const bars = t.barriers || []; const n = bars.length;
        if (n < 1 || n > 5) return '';
        const L = 1 << n;
        const rowH = n <= 3 ? 30 : (n === 4 ? 24 : 18);
        const colW = 148, leftPad = 92, rightPad = 210, topPad = 46;
        const W = leftPad + n * colW + rightPad;
        const H = topPad + L * rowH + 20;
        const yLeaf = j => topPad + j * rowH + rowH / 2;
        const nodeX = d => leftPad + d * colW;
        const nodeY = (d, k) => { const blk = L >> d; const lo = k * blk; return (yLeaf(lo) + yLeaf(lo + blk - 1)) / 2; };
        const byKey = {}; ev.outcomes.forEach(o => byKey[o.key] = o);
        let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" style="max-width:100%; height:auto; font-family:inherit;">';
        for (let i = 0; i < n; i++) {
            const cx = leftPad + i * colW + colW / 2;
            const nm = _esc(String(bars[i].name || ('B' + (i + 1))).slice(0, 18));
            const pf = _clamp01(_num(bars[i].pFail) || 0).toExponential(1);
            const cpl = _num(bars[i].pCcf) !== null ? ' · cc ' + _clamp01(_num(bars[i].pCcf)).toExponential(1) : '';
            s += '<text x="' + cx + '" y="20" text-anchor="middle" font-size="11" font-weight="700" fill="#334155">' + nm + '</text>';
            s += '<text x="' + cx + '" y="35" text-anchor="middle" font-size="9.5" fill="#94a3b8">pF ' + pf + cpl + '</text>';
        }
        const rootY = (yLeaf(0) + yLeaf(L - 1)) / 2;
        s += '<circle cx="' + leftPad + '" cy="' + rootY + '" r="5" fill="#0A84FF"/>';
        s += '<text x="' + (leftPad - 8) + '" y="' + (rootY - 9) + '" text-anchor="end" font-size="9.5" fill="#94a3b8">init</text>';
        for (let d = 1; d <= n; d++) {
            const cnt = 1 << d;
            for (let k = 0; k < cnt; k++) {
                const x1 = nodeX(d - 1), y1 = nodeY(d - 1, k >> 1);
                const x2 = nodeX(d), y2 = nodeY(d, k);
                const isFail = (k & 1) === 1;
                const col = isFail ? '#E24B4A' : '#2E9E6B';
                const mx = (x1 + x2) / 2;
                s += '<path d="M ' + x1 + ' ' + y1 + ' L ' + mx + ' ' + y1 + ' L ' + mx + ' ' + y2 + ' L ' + x2 + ' ' + y2 + '" fill="none" stroke="' + col + '" stroke-width="1.6"/>';
                s += '<text x="' + (mx + 4) + '" y="' + ((y1 + y2) / 2 - 2) + '" font-size="9" font-weight="700" fill="' + col + '">' + (isFail ? 'F' : 'S') + '</text>';
                if (d < n) s += '<circle cx="' + x2 + '" cy="' + y2 + '" r="3.4" fill="#94a3b8"/>';
            }
        }
        const leafX = nodeX(n);
        for (let j = 0; j < L; j++) {
            let mask = 0; for (let i = 0; i < n; i++) { if ((j >> (n - 1 - i)) & 1) mask |= (1 << i); }
            const key = mask.toString(2).padStart(n, '0');
            const o = byKey[key] || { prob: 0, freq: 0, severity: '' };
            const y = yLeaf(j);
            const col = o.severity ? (SEV_COLORS[o.severity] || '#64748b') : '#cbd5e1';
            s += '<rect x="' + (leafX + 6) + '" y="' + (y - 7) + '" width="14" height="14" rx="3" fill="' + col + '"/>';
            s += '<text x="' + (leafX + 26) + '" y="' + (y - 1) + '" font-size="10" fill="#1B2A44">' + _esc(o.severity || 'unassessed') + '</text>';
            s += '<text x="' + (leafX + 26) + '" y="' + (y + 10) + '" font-size="8.5" fill="#94a3b8">p ' + o.prob.toExponential(1) + ' · ' + o.freq.toExponential(1) + '/FH</text>';
        }
        s += '</svg>';
        return s;
    }

    // ------------------------------------------------------------- the page
    function _summaryStrip(t, ev) {
        const r = _rollup(ev);
        let chips = SEVS.filter(s => r.bySev[s]).map(s =>
            '<span style="display:inline-flex; align-items:center; gap:5px; margin-right:10px;">' + _sevChip(s) +
            '<span class="u-mono" style="font-size:10.5px; color:var(--color-text-secondary);">Σ ' + r.bySev[s].freq.toExponential(2) + '/FH (' + r.bySev[s].count + ')</span></span>').join('');
        if (r.unassessed) chips += '<span style="font-size:10.5px; color:var(--color-text-tertiary); margin-right:10px;">' + r.unassessed + ' unassessed</span>';
        const closeBadge = '<span style="font-weight:700; color:' + (ev.closed ? '#137A4C' : '#B7791F') + ';">Σp ' + (ev.closed ? '= 1 ✓' : '≠ 1 ✗') + '</span>';
        const worst = r.worst ? '<span style="margin-right:10px;">worst credible: ' + _sevChip(r.worst) + ' <span class="u-mono" style="font-size:10.5px; color:var(--color-text-secondary);">' + r.worstFreq.toExponential(2) + '/FH</span></span>' : '';
        const couple = ev.coupled
            ? '<span title="A barrier uses a conditional failure probability once an upstream barrier has failed; Σp still = 1." style="font-size:10.5px; color:#0A5AA8; font-weight:700;">common-cause coupling on</span>'
            : '<span title="Barriers treated as independent (product rule). Add a conditional pFail on a barrier to model coupling." style="font-size:10.5px; color:var(--color-text-tertiary);">independent barriers</span>';
        // v1.2 — unmodeled-coupling annunciator: the linked fault trees defeat
        // an independence the product rule is currently assuming.
        const unmod = etaCoupling(t).filter(c => !c.modeled).length;
        const cWarn = unmod
            ? '<span title="Barrier pairs whose linked fault trees share a CCF group or event, with no conditional pFail entered — INV-28." style="font-size:10.5px; color:#8E2A2A; font-weight:700;">⚠ ' + unmod + ' unmodeled coupling' + (unmod === 1 ? '' : 's') + '</span>'
            : '';
        return '<div style="padding:8px 14px; border-bottom:1px solid var(--color-border-strong); display:flex; gap:10px; flex-wrap:wrap; align-items:center; background:var(--color-surface-2);">' +
            closeBadge + '<span style="color:var(--color-border-strong);">|</span>' + worst + chips + '<span style="margin-left:auto; display:inline-flex; gap:10px; align-items:center;">' + cWarn + couple + '</span></div>';
    }

    function _render() {
        const host = document.getElementById('eta-host');
        if (!host) return;
        const F = 'font-size:11.5px; padding:4px 8px; border:1px solid var(--color-border-strong); background:var(--color-surface-2); color:var(--color-text-primary);';
        let html = '<div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:14px;">' +
            '<input id="eta-name" placeholder="Tree name" style="' + F + ' width:180px;">' +
            '<input id="eta-init" placeholder="Initiating event" style="' + F + ' width:220px;">' +
            '<input id="eta-freq" placeholder="freq /FH (your value)" style="' + F + ' width:150px;">' +
            '<input id="eta-by" placeholder="Signature" style="' + F + ' width:120px;">' +
            '<button class="ckpt-m-btn ckpt-m-btn-primary" style="font-size:11.5px; padding:4px 12px;" onclick="_etaCreateUi()">+ Event tree</button>' +
            // 30 Aug 2026 - export parity batch 2b
            '<button class="ckpt-m-btn" style="font-size:11.5px; padding:4px 12px;" onclick="exportData(&quot;Event_Trees&quot;, &quot;csv&quot;)" title="Export every tree&#39;s full outcome enumeration as CSV">&#8595; Export CSV</button>' +
            '<span id="eta-err" style="color:var(--color-danger); font-size:11px; font-weight:600;"></span></div>';
        const allFindings = etaFindings();
        _store().forEach(t => {
            const ev = etaEvaluate(t);
            const fk = {}; allFindings.forEach(x => { if (x.tree === t.id && x.key) fk[x.key] = x.kind; });
            html += '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-bottom:14px;">' +
                '<div style="padding:8px 14px; border-bottom:1px solid var(--color-border-strong); display:flex; align-items:center; gap:8px;"><b style="font-size:12.5px;">' + _esc(t.id) + ' — ' + _esc(t.name) + '</b>' +
                ' <span class="u-mono" style="font-size:11px; color:var(--color-text-tertiary);">' + _esc(t.initiator.desc || '') + ' @ ' + t.initiator.freq + '/FH · ' + (t.barriers || []).length + ' barrier(s)</span>' +
                '<button class="ckpt-m-btn" title="Delete this event tree" style="margin-left:auto; font-size:10.5px; padding:2px 9px;" onclick="_etaDeleteUi(\'' + t.id + '\')">delete</button></div>' +
                _summaryStrip(t, ev) +
                '<div style="padding:8px 14px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">' +
                '<input id="etb-name-' + t.id + '" placeholder="Barrier (e.g. Crew response)" style="' + F + ' width:190px;">' +
                '<input id="etb-p-' + t.id + '" placeholder="pFail (your value)" style="' + F + ' width:120px;">' +
                '<input id="etb-cc-' + t.id + '" placeholder="pFail | upstream failed (opt)" title="Optional common-cause coupling: failure probability once an upstream barrier has already failed. Leave blank for independent." style="' + F + ' width:200px;">' +
                '<button class="ckpt-m-btn" style="font-size:11px; padding:3px 10px;" onclick="_etaBarUi(\'' + t.id + '\')">+ barrier</button>' +
                ((t.barriers || []).length ? '<button class="ckpt-m-btn" style="font-size:11px; padding:3px 10px;" onclick="_etaRemoveBarUi(\'' + t.id + '\')">− barrier</button>' : '') + '</div>';
            if ((t.barriers || []).length) {
                // v1.2 — barrier register: link column (elicited), two-lane
                // P(top) annotation, coupling status per pair.
                const cps = etaCoupling(t);
                const pageOpts = ((typeof ftaPages !== 'undefined' ? ftaPages : []) || []).filter(p => p && p.root);
                html += '<div style="margin:2px 14px 10px; border:1px solid var(--color-border-strong);">' +
                    '<table class="data-table" style="width:100%; font-size:11.5px; margin:0;"><thead><tr>' +
                    '<th style="width:26px;">#</th><th>Barrier</th><th>pFail (elicited)</th><th>pFail | upstream failed</th><th>Implemented by (fault tree — elicited link)</th><th>Linked tree P(top) — annotation only</th><th>Coupling</th></tr></thead><tbody>' +
                    (t.barriers || []).map((b, bi) => {
                        const sel = '<select style="font-size:11px; padding:2px 4px; max-width:220px; border:1px solid var(--color-border-strong); background:var(--color-surface-2); color:var(--color-text-primary);" onchange="_etaLinkUi(\'' + t.id + '\',' + bi + ', this.value)">' +
                            '<option value="">— not linked —</option>' +
                            pageOpts.map(p => '<option value="' + _esc(p.id) + '"' + (b.linkedPageId === p.id ? ' selected' : '') + '>' + _esc(String(p.name || p.id).slice(0, 40)) + '</option>').join('') + '</select>';
                        let pTopCell = '<span style="color:var(--color-text-tertiary);">—</span>';
                        if (b.linkedPageId) {
                            const pt = _linkedPTop(_pageById(b.linkedPageId));
                            pTopCell = pt !== null
                                ? '<span class="u-mono" title="BDD-exact P(top) of the linked tree, per its exposure. Shown beside your per-demand pFail for review — the computed lane never overwrites the elicited value.">' + pt.toExponential(2) + '</span>'
                                : '<span style="color:var(--color-text-tertiary);">engine n/a</span>';
                        }
                        const mine = cps.filter(c => c.i === bi || c.j === bi);
                        let cCell = '<span style="color:var(--color-text-tertiary);">—</span>';
                        if (mine.length) {
                            cCell = mine.map(c => {
                                const other = (c.i === bi) ? c.bName : c.aName;
                                return c.modeled
                                    ? '<span title="' + _esc(c.why) + ' — conditional pFail entered; the dependence is in the arithmetic." style="color:#0A5AA8; font-weight:700;">coupled · modeled (vs ' + _esc(other) + ')</span>'
                                    : '<span title="' + _esc(c.why) + ' — INV-28: enter a conditional pFail (your value) on the downstream barrier, or remove/justify the links." style="color:#8E2A2A; font-weight:700;">⚠ coupling unmodeled (vs ' + _esc(other) + ')</span>';
                            }).join('<br>');
                        }
                        return '<tr><td class="u-mono">' + (bi + 1) + '</td><td>' + _esc(b.name || '') + '</td>' +
                            '<td class="u-mono">' + _clamp01(_num(b.pFail) || 0).toExponential(2) + '</td>' +
                            '<td class="u-mono">' + (_num(b.pCcf) !== null ? _clamp01(_num(b.pCcf)).toExponential(2) : '<span style="color:var(--color-text-tertiary);">—</span>') + '</td>' +
                            '<td>' + sel + '</td><td>' + pTopCell + '</td><td>' + cCell + '</td></tr>';
                    }).join('') + '</tbody></table></div>';
                const svg = _svgTree(t, ev);
                if (svg) html += '<div style="margin:2px 14px 10px; padding:10px 12px; background:#F8FAFC; border:1px solid var(--color-border-strong); border-radius:4px; overflow:auto;">' + svg + '</div>';
                else html += '<div style="margin:2px 14px 10px; font-size:11px; color:var(--color-text-tertiary);">Diagram shown for ≤ 5 barriers (2ⁿ leaves); see the table below.</div>';
                html += '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr><th>Path</th><th>Sequence</th><th>P(path)</th><th>Freq (/FH)</th><th>Severity call</th><th>Linked FC</th><th></th></tr></thead><tbody>' +
                    ev.outcomes.map(o => {
                        const flag = fk[o.key];
                        const rowStyle = flag ? ' style="background:rgba(226,75,74,0.06);"' : '';
                        const fcCell = flag ? _esc(o.linkedFcId || '—') + ' <span title="' + _esc((allFindings.find(x => x.tree === t.id && x.key === o.key) || {}).detail || '') + '" style="color:#B7791F; font-weight:700;">⚠</span>' : _esc(o.linkedFcId || '—');
                        return '<tr' + rowStyle + '><td class="u-mono">' + o.key + '</td>' +
                            '<td style="font-size:11px;">' + o.seq.map(_esc).join(' → ') + '</td>' +
                            '<td class="u-mono" style="font-size:11px;">' + o.prob.toExponential(3) + '</td>' +
                            '<td class="u-mono" style="font-size:11px;">' + o.freq.toExponential(3) + '</td>' +
                            '<td>' + _sevChip(o.severity) + '</td>' +
                            '<td class="u-mono" style="font-size:11px;">' + fcCell + '</td>' +
                            '<td><button class="ckpt-m-btn" style="font-size:10.5px; padding:1px 8px;" onclick="_etaAssessUi(\'' + t.id + '\',\'' + o.key + '\')">assess…</button></td></tr>';
                    }).join('') +
                    '</tbody></table>';
            }
            html += '</div>';
        });
        if (allFindings.length) {
            html += '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); padding:8px 14px;"><b style="font-size:12px;">Findings (INV-27)</b>' +
                allFindings.map(x => '<div style="font-size:12px; padding:4px 0 4px 10px; border-left:3px solid #B7791F; margin:4px 0;">' + _esc(x.tree) + ' [' + x.kind + ']: ' + _esc(x.detail) + '</div>').join('') + '</div>';
        }
        host.innerHTML = html;
    }
    window._etaCreateUi = function () {
        const g = id => (document.getElementById(id) || { value: '' }).value;
        const r = window.etaCreate(g('eta-name'), g('eta-init'), g('eta-freq'), g('eta-by'));
        const err = document.getElementById('eta-err');
        if (!r.ok) { if (err) err.textContent = r.err; return; }
        _render();
    };
    window._etaBarUi = function (tid) {
        const g = id => (document.getElementById(id) || { value: '' }).value;
        const r = window.etaAddBarrier(tid, g('etb-name-' + tid), g('etb-p-' + tid), '', g('etb-cc-' + tid));
        if (!r.ok) { try { showToast(r.err, 'error', 3200); } catch (_) {} return; }
        _render();
    };
    window._etaLinkUi = function (tid, bi, pageId) {
        const r = window.etaLinkBarrier(tid, bi, pageId);
        if (!r.ok) { try { showToast(r.err, 'error', 3000); } catch (_) {} return; }
        _render();
    };
    window._etaRemoveBarUi = function (tid) {
        const r = window.etaRemoveBarrier(tid);
        if (!r.ok) { try { showToast(r.err, 'error', 3000); } catch (_) {} return; }
        _render();
    };
    window._etaDeleteUi = function (tid) {
        const go = () => { const r = window.etaDelete(tid); if (r.ok) _render(); };
        if (typeof window.confirmModal === 'function') { window.confirmModal('Delete ' + tid + '? This cannot be undone.', go); }
        else if (window.confirm('Delete ' + tid + '? This cannot be undone.')) { go(); }
    };
    window._etaAssessUi = function (tid, key) {
        const t = _store().find(x => x.id === tid) || { consequences: {} };
        const cur = (t.consequences || {})[key] || {};
        const F = 'width:100%; box-sizing:border-box; font-size:13px; padding:7px 10px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary);';
        const L = 'display:block; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; margin:12px 0 4px;';
        let m = document.getElementById('eta-assess-modal');
        if (m) m.remove();
        m = document.createElement('div');
        m.id = 'eta-assess-modal';
        m.className = 'modal-overlay';
        m.innerHTML = '<div class="modal-content" style="max-width: 560px;">' +
            '<div class="modal-header"><h2>Assess outcome ' + _esc(key) + '</h2>' +
            '<button class="btn-red" style="margin:0;" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button></div>' +
            '<div class="modal-body" style="padding: 18px 22px;">' +
            '<label style="' + L + '">Consequence severity</label><select id="eta-sev" class="state-select" style="' + F + '">' + SEVS.map(s => '<option' + (s === cur.severity ? ' selected' : '') + '>' + s + '</option>').join('') + '</select>' +
            '<label style="' + L + '">Linked failure condition (optional — enables FHA reconcile)</label><input id="eta-fc" type="text" style="' + F + '" placeholder="e.g. FC-05" value="' + _esc(cur.linkedFcId || '') + '">' +
            '<label style="' + L + '">Note (optional)</label><input id="eta-note" type="text" style="' + F + '" placeholder="Rationale" value="' + _esc(cur.note || '') + '">' +
            '<label style="' + L + '">Signature (required)</label><input id="eta-aby" type="text" style="' + F + '" placeholder="Your name">' +
            '<div style="display:flex; justify-content:flex-end; margin-top:16px;"><button class="ckpt-m-btn" id="eta-ago" style="font-size:13px; padding:6px 18px;">Record assessment</button></div>' +
            '<p id="eta-aerr" style="color:#8E2A2A; font-size:12px; font-weight:600; margin:8px 0 0; display:none;"></p>' +
            '</div></div>';
        document.body.appendChild(m);
        document.getElementById('eta-ago').onclick = function () {
            const r = window.etaAssess(tid, key, document.getElementById('eta-sev').value, document.getElementById('eta-fc').value, document.getElementById('eta-note').value, document.getElementById('eta-aby').value);
            const err = document.getElementById('eta-aerr');
            if (!r.ok) { err.textContent = r.err; err.style.display = 'block'; return; }
            m.remove(); _render();
        };
        m.style.display = 'flex';
        setTimeout(() => m.classList.add('show'), 10);
    };
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._etaWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-eta');
                if (v) v.style.display = (tabId === 'eta') ? 'block' : 'none';
                const s = document.getElementById('snav-eta');
                if (s) s.classList.toggle('snav-active', tabId === 'eta');
                if (tabId === 'eta') _render();
            } catch (_) {}
            return r;
        };
        wrapped._etaWrapped = true;
        window.switchTab = wrapped;
    })();

    // REG §11d print path
    function _extend() {
        if (!window.Reports || !window.Reports.DEFAULT_TEMPLATES || !window.Reports.DEFAULT_TEMPLATES.REG) return false;
        const T = window.Reports.DEFAULT_TEMPLATES;
        if (T.REG.indexOf('{{reg_eta}}') < 0) {
            T.REG = T.REG.replace('## 11. RAM suite outputs',
                '## 11d. Event tree analyses\nSequence-consequence outcomes with exact path arithmetic, severity calls, FC links, and reconciliation findings.\n{{reg_eta}}\n\n## 11. RAM suite outputs');
        }
        if (!window.Reports.extractData._etaWrapped) {
            const orig = window.Reports.extractData;
            const wrapped = function (reportType) {
                const data = orig.apply(this, arguments);
                try {
                    if (reportType === 'REG') {
                        const rows = [];
                        _store().forEach(t => { const ev = etaEvaluate(t); ev.outcomes.forEach(o => rows.push({
                            'Tree': t.id, 'Path': o.key, 'Sequence': o.seq.join(' → ').slice(0, 100),
                            'P(path)': o.prob.toExponential(3), 'Freq /FH': o.freq.toExponential(3),
                            'Severity': o.severity || 'unassessed', 'Linked FC': o.linkedFcId || '—',
                            'Coupling': ev.coupled ? 'yes' : 'no',
                        })); });
                        data.reg_eta = rows;
                    }
                } catch (_) { if (reportType === 'REG') data.reg_eta = []; }
                return data;
            };
            wrapped._etaWrapped = true;
            window.Reports.extractData = wrapped;
        }
        return true;
    }
    if (!_extend()) { let tries = 20; const t = setInterval(() => { if (_extend() || --tries <= 0) clearInterval(t); }, 300); }

    window.etaEvaluate = etaEvaluate;
    window.etaFindings = etaFindings;
    window.etaRollup = _rollup;
    // v1.2 exports — coupling lane + store handle (tests, reports, ledger).
    window.etaCoupling = etaCoupling;
    window.etaCouplingFindings = etaCouplingFindings;
    window.etaLedgerHits = etaLedgerHits;
    window.etaStore = _store;
})();
