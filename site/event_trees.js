// 13 Oct 2026 (v2.0, hand-built event trees): the event tree is now DRAWN BY HAND on the one diagram editor (SLDiagramEditor), in IEC 62502 notation: initiating event, headings with success / failure branches AND multi-outcome headings (partial success, up to 9 outcomes), branch points where a heading does not apply (skipped), sequences that end early, transfers to another event tree, end states with name, consequence category, severity, failure condition link, sequence probability and frequency. The 1 to 5 barrier drawing limit is gone (the editor draws only what is on screen). The audited arithmetic is unchanged for every existing tree (same products, same keys, same order); see tests/regression_eta_bowtie_handbuild_20261013b.test.js
// 13 Sep 2026 (R19 step 3): native alert/confirm/prompt replaced by the app's own dialogs (slAlert/slConfirm/slPrompt) and typed toasts; see tests/regression_native_dialogs.test.js
// ============================================================================
// event_trees.js - v2.0 - C4: Event Tree Analysis. Sequence-consequence
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
//
// v2.0 (13 Oct 2026): IEC 62502 by hand. The stored shape is a strict
// superset of v1.x, so every existing tree opens and computes unchanged:
//   tree.barriers[i]            the HEADINGS, in column order. New optional fields:
//     .id                       stable heading id (written on the first hand edit; old
//                               trees use 'H<n>' until then)
//     .branches[]               a MULTI-OUTCOME heading: [{ id, label, p, pc? }] in
//                               top-to-bottom order, outcome 0 = success. p sums to 1;
//                               pc (all or none) is the outcome probability once an
//                               upstream heading has not succeeded (the v1.1 coupling,
//                               generalized). pFail is kept = 1 - p(success) for readers.
//                               A plain heading keeps pFail / pCcf exactly as before.
//   tree.nodeRules{prefix}      'skip' (the heading does not apply on this sequence: one
//                               straight branch, probability 1) or 'end' (the sequence
//                               ends here). prefix = the outcome characters of the
//                               headings before, in column order ('-' = not asked).
//   tree.consequences{key}      as before, plus .label (end state name), .category
//                               (consequence category) and .transferTo (an event tree id).
//                               key = one character per heading, LAST heading first (the
//                               v1.x bit-string order): '0' success, '1' failure (or the
//                               outcome index for a multi-outcome heading), '-' not asked.
//   tree.initiator.fromTransfers  the initiator frequency is the sum of the sequences of
//                               other trees that transfer into this one.
// Quantification is one walk: every node multiplies by its outcome probability, a
// skipped heading by 1, so Σp over end states is still exactly 1 (the self-audit).
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
    function _report(e) { try { if (window.SLErrorWatch && typeof SLErrorWatch.report === 'function') SLErrorWatch.report(e, 'event_trees'); } catch (_) {} }
    function _toast(m, k, ms) { try { if (typeof showToast === 'function') showToast(m, k || 'info', ms); } catch (_) {} }
    function _me() {
        try { if (typeof _wsUser === 'function') { const u = _wsUser() || {}; if (u.name || u.email) return String(u.name || u.email); } } catch (_) {}
        try { if (typeof currentUserName !== 'undefined' && currentUserName) return String(currentUserName); } catch (_) {}
        try { if (typeof _signoffReviewerName === 'function' && _signoffReviewerName()) return String(_signoffReviewerName()); } catch (_) {}
        return '';
    }
    const SEVS = ['No Safety Effect', 'Minor', 'Major', 'Hazardous', 'Catastrophic'];
    // 11 Sep — the app-wide bright severity fills (see --sev-*-fill in safety_lab.css)
    const SEV_COLORS = {
        'No Safety Effect': '#A6DFB4', 'Minor': '#F8ECB0', 'Major': '#F2DB74',
        'Hazardous': '#F5B878', 'Catastrophic': '#F2928C'
    };
    function _num(v) { const x = parseFloat(v); return Number.isFinite(x) ? x : null; }
    function _clamp01(v) { return Math.min(1, Math.max(0, v)); }
    function _clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

    // ------------------------------------------------------------ headings (v2.0)
    const ETA_MAX_OUTCOMES = 9;                 // outcome characters '0'..'8'
    const CH = '012345678';
    function _hid(h, i) { return (h && h.id != null && String(h.id) !== '') ? String(h.id) : 'H' + (i + 1); }
    function _isMulti(h) { return !!h && Array.isArray(h.branches) && h.branches.length >= 2; }
    function _branchIds(h) { return _isMulti(h) ? h.branches.map((b, k) => String(b && b.id != null ? b.id : 'b' + k)) : ['S', 'F']; }
    // Every heading as its outcome list. A plain heading is the v1.x pair, with the
    // SAME numbers: success 1 - pFail, failure pFail; coupled: 1 - pCcf, pCcf.
    function _branchesOf(h) {
        if (_isMulti(h)) {
            const all = h.branches.every(b => b && _num(b.pc) !== null);
            return h.branches.slice(0, ETA_MAX_OUTCOMES).map((b, k) => ({
                id: String(b && b.id != null ? b.id : 'b' + k),
                label: String((b && b.label) || (k === 0 ? 'Success' : 'Outcome ' + (k + 1))),
                p: _clamp01(_num(b && b.p) || 0),
                pc: all ? _clamp01(_num(b.pc)) : null,
            }));
        }
        const base = _clamp01(_num(h && h.pFail) || 0);
        const ccf = _num(h && h.pCcf);
        return [
            { id: 'S', label: 'Success', p: 1 - base, pc: ccf !== null ? 1 - _clamp01(ccf) : null },
            { id: 'F', label: 'Failure', p: base, pc: ccf !== null ? _clamp01(ccf) : null },
        ];
    }
    function _coupledHeading(h) {
        if (_isMulti(h)) return h.branches.every(b => b && _num(b.pc) !== null);
        return _num(h && h.pCcf) !== null;
    }
    // P(not success) of a heading: pFail for a plain one, 1 - p(outcome 0) for a multi-outcome one.
    function _pNotOk(h) { return _isMulti(h) ? _clamp01(1 - (_num(h.branches[0] && h.branches[0].p) || 0)) : _clamp01(_num(h && h.pFail) || 0); }
    function _rulesOf(t) { const r = t && t.nodeRules; return (r && typeof r === 'object') ? r : {}; }
    function _rev(s) { let o = ''; for (let i = s.length - 1; i >= 0; i--) o += s[i]; return o; }
    function _keyOf(chars, n) { if (!n) return '0'; let k = ''; for (let j = n - 1; j >= 0; j--) k += chars[j]; return k; }

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
    // v2.0: the budget counts SEQUENCES (end states), which is 2^n for a plain tree and
    // fewer when headings are skipped or sequences end early, more for multi-outcome headings.
    const ETA_MAX_BARRIERS = 17;
    const ETA_OUTCOME_BUDGET = 1 << ETA_MAX_BARRIERS;

    // Exact number of end states, without enumerating them: a subtree with no rule in it
    // has the closed form Π(outcomes of the headings below).
    function etaSequenceCount(tree) {
        const bars = (tree && tree.barriers) || [], n = bars.length;
        const k = bars.map(h => _branchesOf(h).length);
        const suffix = new Array(n + 1); suffix[n] = 1;
        for (let d = n - 1; d >= 0; d--) suffix[d] = suffix[d + 1] * k[d];
        const rules = _rulesOf(tree), keys = Object.keys(rules);
        if (!keys.length) return suffix[0];
        const pref = new Set();
        keys.forEach(r => { for (let i = 0; i <= r.length; i++) pref.add(r.slice(0, i)); });
        return (function cnt(d, prefix) {
            if (d >= n) return 1;
            const r = rules[prefix];
            if (r === 'end') return 1;
            if (r === 'skip') return cnt(d + 1, prefix + '-');
            if (!pref.has(prefix)) return suffix[d];
            let s = 0;
            for (let b = 0; b < k[d]; b++) s += cnt(d + 1, prefix + CH[b]);
            return s;
        })(0, '');
    }

    // Transfers in: the initiator of a tree marked fromTransfers is the sum of the sequences
    // of other trees that transfer into it. A cycle contributes nothing and is a finding.
    const _evalStack = [];
    function _transfersInto(id) {
        if (_evalStack.indexOf(id) >= 0) return { freq: 0, cycle: true };
        _evalStack.push(id);
        try {
            let f = 0, cycle = false;
            _store().forEach(t => {
                if (!t || !t.id || t.id === id) return;
                const cons = t.consequences || {};
                if (!Object.keys(cons).some(k => cons[k] && cons[k].transferTo === id)) return;
                let ev; try { ev = etaEvaluate(t); } catch (_) { return; }
                if (ev.transferCycle) cycle = true;
                ev.outcomes.forEach(o => { if (o.transferTo === id) f += o.freq; });
            });
            return { freq: f, cycle: cycle };
        } finally { _evalStack.pop(); }
    }

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
        let freq = _num(tree.initiator && tree.initiator.freq) || 0;
        let transferCycle = false, fromTransfers = false;
        if (tree.initiator && tree.initiator.fromTransfers && tree.id) {
            const tin = _transfersInto(tree.id);
            freq = tin.freq; transferCycle = tin.cycle; fromTransfers = true;
        }
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
        const count = etaSequenceCount(tree);
        if (count > ETA_OUTCOME_BUDGET) {
            const plain = !Object.keys(_rulesOf(tree)).length && !bars.some(_isMulti);
            const err = new Error((plain
                ? 'This event tree has ' + n + ' barriers, which enumerates 2^' + n + ' = ' + Math.pow(2, n).toLocaleString() + ' outcomes'
                : 'This event tree has ' + n + ' headings and ' + count.toLocaleString() + ' sequences') +
                ' — above the ' + ETA_OUTCOME_BUDGET.toLocaleString() + ' budget. Decompose it: model the later barriers as a ' +
                'second event tree seeded by the outcome that reaches them (a transfer), or fold barriers that ' +
                'always act together into one. Nothing has been computed — a partial enumeration ' +
                'would under-report outcomes and break the Σp = 1 check.');
            err.name = 'EtaExplosionError';
            err.barriers = n;
            err.wouldEnumerate = count;
            err.budget = ETA_OUTCOME_BUDGET;
            throw err;
        }
        const B = bars.map(_branchesOf);
        const CPL = bars.map(_coupledHeading);
        const MULTI = bars.map(_isMulti);
        const rules = _rulesOf(tree);
        const cons = tree.consequences || {};
        const outcomes = [];
        const coupled = CPL.some(Boolean);
        const chars = new Array(n);
        let row = 0;
        (function rec(d, prefix, p, up) {
            if (d < n) {
                const r = rules[prefix];
                if (r === 'skip') { chars[d] = '-'; rec(d + 1, prefix + '-', p, up); return; }
                if (r !== 'end') {
                    const br = B[d], cp = CPL[d] && up;
                    for (let b = 0; b < br.length; b++) {
                        const c = CH[b]; chars[d] = c;
                        rec(d + 1, prefix + c, p * (cp ? br[b].pc : br[b].p), up || b > 0);
                    }
                    return;
                }
                for (let j = d; j < n; j++) chars[j] = '-';
            }
            const key = _keyOf(chars, n);
            const seq = [];
            for (let i = 0; i < n; i++) {
                const c = chars[i];
                if (c === '-') continue;
                if (MULTI[i]) seq.push(bars[i].name + ': ' + B[i][+c].label);
                else if (c === '1') seq.push(bars[i].name + ' FAILS');
                else seq.push(bars[i].name + ' holds');
            }
            const c = cons[key] || {};
            outcomes.push({ key, seq, prob: p, freq: p * freq, severity: c.severity || '', linkedFcId: c.linkedFcId || '', note: c.note || '',
                label: c.label || '', category: c.category || '', transferTo: c.transferTo || '', seqNo: ++row, path: n ? chars.join('') : '' });
        })(0, '', 1, false);
        // the v1.x order: by key (for a plain tree, exactly the ascending bit mask)
        outcomes.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
        let sum = 0;
        for (let i = 0; i < outcomes.length; i++) sum += outcomes[i].prob;
        const closed = Math.abs(sum - 1) < 1e-9;
        return { outcomes, freq, closed, sum, coupled, fromTransfers, transferCycle };
    }

    // roll-up: Σ frequency and count by severity, plus worst credible outcome
    function _rollup(ev) {
        const bySev = {}; let unassessed = 0, worstIdx = -1;
        ev.outcomes.forEach(o => {
            if (!o.severity) { if (o.prob > 0 && !o.transferTo) unassessed++; return; }
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
            let ev;
            try { ev = etaEvaluate(t); }
            catch (e) { out.push({ tree: t && t.id, key: null, kind: 'budget', detail: String(e && e.message || e) }); return; }
            if (!ev.closed) out.push({ tree: t.id, key: null, kind: 'arithmetic', detail: 'path probabilities sum to ' + ev.sum.toPrecision(6) + ' ≠ 1 — barrier probability out of range' });
            // v2.0: multi-outcome headings and transfers
            (t.barriers || []).forEach((h, i) => {
                const nm = '"' + (h.name || ('heading ' + (i + 1))) + '"';
                if (_isMulti(h)) {
                    const s = h.branches.reduce((a, b) => a + (_num(b && b.p) || 0), 0);
                    if (Math.abs(s - 1) > 1e-9) out.push({ tree: t.id, key: null, kind: 'outcome-sum', detail: 'heading ' + nm + ' outcome probabilities sum to ' + s.toPrecision(6) + ' ≠ 1: enter your values so they add up to 1' });
                    const withPc = h.branches.filter(b => b && _num(b.pc) !== null).length;
                    if (withPc && withPc < h.branches.length) out.push({ tree: t.id, key: null, kind: 'coupling-partial', detail: 'heading ' + nm + ' has a conditional probability on ' + withPc + ' of ' + h.branches.length + ' outcomes: enter all of them or none (none = independent)' });
                    if (withPc === h.branches.length) { const sc = h.branches.reduce((a, b) => a + (_num(b.pc) || 0), 0); if (Math.abs(sc - 1) > 1e-9) out.push({ tree: t.id, key: null, kind: 'outcome-sum', detail: 'heading ' + nm + ' conditional outcome probabilities sum to ' + sc.toPrecision(6) + ' ≠ 1' }); }
                } else if (_num(h.pFail) === null) {
                    out.push({ tree: t.id, key: null, kind: 'unquantified', detail: 'heading ' + nm + ' has no failure probability yet, so it counts as 0 (always succeeds) until you enter your value' });
                }
            });
            if (ev.transferCycle) out.push({ tree: t.id, key: null, kind: 'transfer-cycle', detail: 'the initiator frequency comes from transfers, and the transfers loop back into this tree. A loop contributes nothing: break it' });
            ev.outcomes.forEach(o => {
                if (o.transferTo && !_store().some(x => x && x.id === o.transferTo)) out.push({ tree: t.id, key: o.key, kind: 'transfer-dangling', detail: 'outcome ' + o.key + ' transfers to ' + o.transferTo + ', which is not an event tree in this project' });
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
    // logical event. modeled ⇔ the downstream barrier carries a pCcf
    // (v2.0: or, for a multi-outcome heading, a conditional probability on every outcome).
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
                    modeled: _coupledHeading(b),
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
    // v2.0: a new id is the next FREE number (the v1.x length + 1 repeated an id after a delete).
    function _nextTreeId() {
        let mx = 0;
        _store().forEach(t => { const m = /^ET-(\d+)$/.exec(String(t && t.id || '')); if (m) mx = Math.max(mx, +m[1]); });
        return 'ET-' + String(mx + 1).padStart(3, '0');
    }
    window.etaCreate = function (name, initDesc, freq, by) {
        if (!String(name || '').trim() || !String(by || '').trim()) return { ok: false, err: 'Name and signature are required.' };
        const f = _num(freq);
        if (!(f > 0)) return { ok: false, err: 'Initiator frequency must be a positive number (your value, per flight hour).' };
        const id = _nextTreeId();
        _store().push({ id, name: String(name).trim(), initiator: { desc: String(initDesc || '').trim(), freq: f }, barriers: [], consequences: {}, by: String(by).trim(), at: new Date().toISOString() });
        _jr('eta', id + ' created: ' + name + ' (initiator ' + f + '/FH) — signed ' + by);
        _save();
        return { ok: true, id };
    };
    // v2.0: a blank tree to draw by hand, only a name. The initiating event, its
    // frequency, the headings and the end states are drawn and filled in on the diagram.
    window.etaCreateBlank = function (name) {
        if (!String(name || '').trim()) return { ok: false, err: 'Give the event tree a name.' };
        const id = _nextTreeId();
        _store().push({ id, name: String(name).trim(), initiator: { desc: '', freq: null }, barriers: [], consequences: {}, by: _me(), at: new Date().toISOString() });
        _jr('eta', id + ' created by hand: ' + name);
        _save();
        return { ok: true, id };
    };
    window.etaRename = function (treeId, name) {
        const t = _store().find(x => x.id === treeId);
        if (!t) return { ok: false, err: 'Tree not found.' };
        if (!String(name || '').trim()) return { ok: false, err: 'A name is required.' };
        t.name = String(name).trim();
        _jr('eta', treeId + ' renamed: ' + t.name);
        _save();
        return { ok: true };
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
        if (t.nodeRules) Object.keys(t.nodeRules).forEach(k => { if (k.length >= t.barriers.length) delete t.nodeRules[k]; });
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
        const prev = (t.consequences || {})[key] || {};
        t.consequences = t.consequences || {};
        t.consequences[key] = Object.assign({}, prev, { severity, linkedFcId: String(linkedFcId || '').trim(), note: String(note || '').trim(), by: String(by).trim(), at: new Date().toISOString() });
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

    // ======================================================================
    // v2.0: THE DIAGRAM MODEL. The stored tree is the source of truth. toModel()
    // draws it as SLDiagramEditor elements (all positions computed, IEC 62502
    // layout: headings across the top, success up / failure down, end states on the
    // right). fromModel() reads an edited model back into a tree, carrying every
    // consequence call and branch rule whose sequence still exists after the edit
    // (by heading id and outcome id, so reordering keeps them and nothing is
    // guessed). The editor's complete() hook runs fromModel + toModel inside every
    // change, so derived branch points and end states move in the same undo step.
    // ======================================================================
    const G = { COLW: 184, HDR_H: 82, ROW_H: 46, INIT_W: 176, X0: 216, TOP: 118, END_W: 270, END_H: 40 };
    // The diagram draws every sequence up to this many; past it the headings stay
    // editable on the canvas and the sequence table below lists every end state.
    const DIAGRAM_MAX_SEQUENCES = 8192;

    function _callContent(c) {
        c = c || {};
        return JSON.stringify(['severity', 'label', 'category', 'linkedFcId', 'note', 'transferTo', 'sysmlRef'].map(k => (c[k] == null ? '' : String(c[k]))));
    }
    function _headingProps(h) {
        const p = {};
        if (_isMulti(h)) p.branches = _clone(h.branches).map((b, k) => Object.assign({ id: String(b && b.id != null ? b.id : 'b' + k) }, b, { id: String(b && b.id != null ? b.id : 'b' + k) }));
        else { if (h.pFail !== undefined) p.pFail = h.pFail; if (h.pCcf !== undefined) p.pCcf = h.pCcf; }
        if (h.linkedPageId) p.linkedPageId = h.linkedPageId;
        if (h.note !== undefined) p.note = h.note;
        return p;
    }

    function toModel(t) {
        const bars = (t && t.barriers) || [], n = bars.length;
        const els = [];
        bars.forEach((h, i) => {
            const el = { id: _hid(h, i), kind: 'heading', x: G.X0 + i * G.COLW + 8, y: 0, w: G.COLW - 16, h: G.HDR_H, label: String(h.name == null ? '' : h.name), props: _headingProps(h) };
            el.props._col = i; el.props._pnok = _pNotOk(h); el.props._multi = _isMulti(h); el.props._cpl = _coupledHeading(h);
            if (h.sysmlRef) el.sysmlRef = h.sysmlRef;
            els.push(el);
        });
        const ini = (t && t.initiator) || {};
        const init = { id: 'INIT', kind: 'init', x: 0, y: 0, w: G.X0, h: G.TOP, label: String(ini.desc || ''), props: {} };
        if (ini.freq !== undefined && ini.freq !== null) init.props.freq = ini.freq;
        if (ini.fromTransfers) init.props.fromTransfers = true;
        if (t && t.sysmlRef) init.sysmlRef = t.sysmlRef;
        els.unshift(init);
        let ev = null, err = null, count = 0;
        try { count = etaSequenceCount(t); ev = etaEvaluate(t); } catch (e) { err = e; }
        init.props._ks = JSON.stringify(bars.map((h, i) => [_hid(h, i), _branchIds(h)]));   // the key space the end states and branch points below are drawn in
        init.props._f = ev ? ev.freq : null;
        init.props._ft = ev ? !!ev.fromTransfers : false;
        if (!ev || count > DIAGRAM_MAX_SEQUENCES) {
            const y = G.TOP + 20;
            init.h = y + 14; init.props._rootY = y;
            els.push({ id: 'NOTE', kind: 'note', x: G.X0, y: y - 30, w: Math.max(420, n * G.COLW), h: 60, label: '',
                props: { _text: err ? String(err.message || err) : ('This tree has ' + count.toLocaleString() + ' sequences. The diagram draws up to ' + DIAGRAM_MAX_SEQUENCES.toLocaleString() + '; edit the headings here and read every sequence in the table below.') } });
            return { elements: els, connectors: [] };
        }
        const evByKey = {}; ev.outcomes.forEach(o => { evByKey[o.key] = o; });
        const B = bars.map(_branchesOf), rules = _rulesOf(t), cons = (t && t.consequences) || {};
        const chars = new Array(n);
        const nodeOrd = new Array(n + 1).fill(0);
        let row = 0;
        const endX = G.X0 + n * G.COLW + 10;
        function leaf() {
            const y = G.TOP + row * G.ROW_H + G.ROW_H / 2;
            const key = _keyOf(chars, n), o = evByKey[key] || { prob: 0, freq: 0, seq: [] }, c = cons[key] || {};
            const p = { key: key };
            ['severity', 'category', 'linkedFcId', 'note', 'transferTo', 'by', 'at'].forEach(k => { if (c[k] != null && c[k] !== '') p[k] = c[k]; });
            p._seq = row + 1; p._p = o.prob; p._f = o.freq;
            const el = { id: 'E' + row, kind: 'end', x: endX, y: y - G.END_H / 2, w: G.END_W, h: G.END_H, label: String(c.label || ''), props: p };
            if (c.sysmlRef) el.sysmlRef = c.sysmlRef;
            els.push(el);
            row++;
            return y;
        }
        const CPL = bars.map(_coupledHeading);
        function rec(d, prefix, up) {
            if (d >= n) return leaf();
            const r = rules[prefix];
            const id = 'N' + d + '.' + (nodeOrd[d]++);
            const x = G.X0 + d * G.COLW;
            if (r === 'skip') {
                chars[d] = '-';
                const y = rec(d + 1, prefix + '-', up);
                els.push({ id, kind: 'node', x, y: y - 12, w: G.COLW, h: 24, label: '', props: { prefix, rule: 'skip', _d: d, _yin: 12, _ys: [12], _br: [] } });
                return y;
            }
            if (r === 'end') {
                for (let j = d; j < n; j++) chars[j] = '-';
                const y = leaf();
                els.push({ id, kind: 'node', x, y: y - 12, w: (n - d) * G.COLW + 10, h: 24, label: '', props: { prefix, rule: 'end', _d: d, _yin: 12, _ys: [12], _br: [] } });
                return y;
            }
            const ys = [];
            B[d].forEach((b, k) => { chars[d] = CH[k]; ys.push(rec(d + 1, prefix + CH[k], up || k > 0)); });
            const cond = CPL[d] && up;   // the probability this branch point really uses (coupled once an earlier heading did not succeed)
            const y0 = ys[0], y1 = ys[ys.length - 1], top = y0 - 16;
            els.push({ id, kind: 'node', x, y: top, w: G.COLW, h: (y1 - y0) + 32, label: '', props: { prefix, rule: 'apply', _d: d, _yin: (y0 + y1) / 2 - top, _ys: ys.map(v => v - top), _br: B[d].map((b, k) => ({ t: b.label, p: cond ? b.pc : b.p, bad: k > 0, multi: B[d].length > 2, cond: cond })) } });
            return (y0 + y1) / 2;
        }
        const rootY = rec(0, '', false);
        init.h = rootY + 14; init.props._rootY = rootY;
        return { elements: els, connectors: [] };
    }

    // Read an edited model back into a tree. base = the stored tree before the edit.
    function fromModel(m, base) {
        base = base || { barriers: [], consequences: {}, initiator: {} };
        const t = _clone(base);
        const els = (m && m.elements) || [];
        const init = els.find(e => e && e.kind === 'init');
        if (init) {
            const ip = init.props || {};
            t.initiator = Object.assign({}, t.initiator || {});
            t.initiator.desc = String(init.label == null ? '' : init.label);
            if (ip.freq === undefined || ip.freq === null || ip.freq === '') { if (t.initiator.freq !== undefined) t.initiator.freq = null; }
            else t.initiator.freq = ip.freq;
            if (ip.fromTransfers) t.initiator.fromTransfers = true; else delete t.initiator.fromTransfers;
            if (init.sysmlRef) t.sysmlRef = init.sysmlRef; else delete t.sysmlRef;
        }
        // headings, in column order (centre x; ties keep the stored order)
        const baseBars = base.barriers || [];
        const baseIds = baseBars.map(_hid);
        const rank = id => { const i = baseIds.indexOf(id); return i < 0 ? 1e9 : i; };
        const hs = els.map((e, idx) => ({ e, idx })).filter(o => o.e && o.e.kind === 'heading');
        hs.sort((a, b) => ((a.e.x + a.e.w / 2) - (b.e.x + b.e.w / 2)) || (rank(a.e.id) - rank(b.e.id)) || (a.idx - b.idx));
        const bars = hs.map(({ e }) => {
            const bi = baseIds.indexOf(e.id);
            const h = bi >= 0 ? _clone(baseBars[bi]) : {};
            const p = e.props || {};
            h.id = e.id;
            h.name = String(e.label == null ? '' : e.label);
            if (Array.isArray(p.branches) && p.branches.length >= 2) {
                h.branches = p.branches.slice(0, ETA_MAX_OUTCOMES).map((b, k) => {
                    const o = { id: String(b && b.id != null ? b.id : 'b' + k), label: String((b && b.label) || '') };
                    const pv = _num(b && b.p); o.p = pv === null ? 0 : pv;
                    const pc = _num(b && b.pc); if (pc !== null) o.pc = pc;
                    return o;
                });
                const p0 = _num(h.branches[0].p) || 0;
                h.pFail = Math.min(1, Math.max(0, 1 - p0));
                delete h.pCcf;
            } else {
                delete h.branches;
                if (p.pFail === undefined || p.pFail === null || p.pFail === '') delete h.pFail; else h.pFail = p.pFail;
                if (p.pCcf === undefined || p.pCcf === null || p.pCcf === '') delete h.pCcf; else h.pCcf = p.pCcf;
            }
            if (p.linkedPageId) h.linkedPageId = String(p.linkedPageId); else delete h.linkedPageId;
            if (p.note === undefined) delete h.note; else h.note = p.note;
            if (e.sysmlRef) h.sysmlRef = e.sysmlRef; else delete h.sysmlRef;
            return h;
        });
        t.barriers = bars;
        // Carry the assessments and branch rules into the edited heading order, by heading id and
        // outcome id. Two sources, each in its own key space: the stored tree (base) and the shapes
        // on the canvas (the key space they were drawn in, INIT props._ks). A call or rule survives
        // only where its sequence or branch point still exists exactly; the canvas wins where both speak.
        const newIds = bars.map(_hid), newBr = bars.map(_branchIds);
        const baseSpace = { ids: baseIds, br: baseBars.map(_branchIds) };
        let elSpace = baseSpace;
        try { const ks = init && init.props && init.props._ks ? JSON.parse(init.props._ks) : null; if (Array.isArray(ks)) elSpace = { ids: ks.map(x => String(x[0])), br: ks.map(x => x[1].map(String)) }; } catch (_) {}
        const assignOf = (sp, chars) => { const a = {}; chars.forEach((c, j) => { if (j < sp.ids.length) a[sp.ids[j]] = (c === '-' ? '-' : sp.br[j][+c]); }); return a; };
        const carryKey = (key, sp) => {
            const nb = sp.ids.length, fwd = nb ? _rev(String(key)).split('') : [];
            if (fwd.length !== nb) return null;
            const a = assignOf(sp, fwd);
            if (Object.keys(a).some(id => a[id] !== '-' && newIds.indexOf(id) < 0)) return null;   // a heading it went through is gone
            const out = [];
            for (let j = 0; j < newIds.length; j++) {
                const v = a[newIds[j]];
                if (v === undefined) return null;                                                  // a new heading: a new sequence
                if (v === '-') { out.push('-'); continue; }
                const idx = newBr[j].indexOf(v);
                if (idx < 0) return null;                                                          // its outcome is gone
                out.push(CH[idx]);
            }
            return _keyOf(out, out.length);
        };
        const carryRule = (prefix, sp) => {
            const d = String(prefix).length;
            if (d >= sp.ids.length) return [];
            const hid = sp.ids[d], nd = newIds.indexOf(hid);
            if (nd < 0) return [];
            const a = assignOf(sp, String(prefix).split(''));
            const before = new Set(newIds.slice(0, nd));
            if (Object.keys(a).some(id => a[id] !== '-' && !before.has(id))) return [];             // an ancestor moved after it or is gone
            let list = [''];
            for (let j = 0; j < nd; j++) {
                const id = newIds[j], v = a[id];
                if (v === undefined) {
                    if (sp.ids.indexOf(id) >= 0) return [];                                       // moved from after: it no longer means the same
                    list = [].concat.apply([], list.map(pp => newBr[j].map((_, k) => pp + CH[k])));   // a new heading before it: on each of its outcomes
                    continue;
                }
                if (v === '-') { list = list.map(pp => pp + '-'); continue; }
                const idx = newBr[j].indexOf(v);
                if (idx < 0) return [];
                list = list.map(pp => pp + CH[idx]);
            }
            return list;
        };
        const cons = {}, rules = {};
        const bc = base.consequences || {};
        Object.keys(bc).forEach(k => { const nk = carryKey(k, baseSpace); if (nk != null) cons[nk] = bc[k]; });
        const br0 = _rulesOf(base);
        Object.keys(br0).forEach(pr => carryRule(pr, baseSpace).forEach(np => { rules[np] = br0[pr]; }));
        els.forEach(e => {
            if (!e || !e.props) return;
            if (e.kind === 'end' && /^E\d+$/.test(e.id) && e.props.key != null) {
                const nk = carryKey(e.props.key, elSpace);
                if (nk == null) return;
                const prev = cons[nk] || null, p = e.props;
                const c = prev ? Object.assign({}, prev) : {};
                // an empty field stays exactly as stored ('' stays '', absent stays absent): old data round-trips byte for byte
                ['severity', 'category', 'linkedFcId', 'note', 'transferTo'].forEach(f => { if (p[f] != null && String(p[f]) !== '') c[f] = String(p[f]); else if (prev && prev[f] === '') c[f] = ''; else delete c[f]; });
                if (e.label) c.label = String(e.label); else if (prev && prev.label === '') c.label = ''; else delete c.label;
                if (e.sysmlRef) c.sysmlRef = e.sysmlRef; else delete c.sysmlRef;
                const has = ['severity', 'label', 'category', 'linkedFcId', 'note', 'transferTo', 'sysmlRef'].some(f => c[f] != null && c[f] !== '');
                if (!has) { delete cons[nk]; return; }
                if (_callContent(prev) !== _callContent(c)) {
                    // provenance: a call changed by hand is signed by whoever changed it
                    if (p.at && (!prev || p.at !== prev.at)) { c.by = p.by || ''; c.at = p.at; }
                    else { c.by = _me(); c.at = new Date().toISOString(); }
                }
                cons[nk] = c;
            }
            if (e.kind === 'node' && /^N\d+\.\d+$/.test(e.id) && e.props.prefix != null) {
                const r = e.props.rule;
                carryRule(e.props.prefix, elSpace).forEach(np => { if (r === 'skip' || r === 'end') rules[np] = r; else delete rules[np]; });
            }
        });
        // keep only rules on branch points that exist, and calls on sequences that exist
        t.consequences = cons;
        if (Object.keys(rules).length) t.nodeRules = rules; else delete t.nodeRules;
        _prune(t);
        return t;
    }
    // Drop rules no walk reaches and calls on keys that are not sequences (after an edit).
    function _prune(t) {
        let count = 0;
        try { count = etaSequenceCount(t); } catch (_) { return; }
        if (count > ETA_OUTCOME_BUDGET) return;
        const n = (t.barriers || []).length, B = t.barriers.map(h => _branchesOf(h).length), rules = _rulesOf(t);
        const used = {}, keys = {}, chars = new Array(n);
        (function rec(d, prefix) {
            if (d < n) {
                const r = rules[prefix];
                if (r) used[prefix] = r;
                if (r === 'skip') { chars[d] = '-'; rec(d + 1, prefix + '-'); return; }
                if (r !== 'end') { for (let k = 0; k < B[d]; k++) { chars[d] = CH[k]; rec(d + 1, prefix + CH[k]); } return; }
                for (let j = d; j < n; j++) chars[j] = '-';
            }
            keys[_keyOf(chars, n)] = 1;
        })(0, '');
        if (t.nodeRules) { if (Object.keys(used).length) t.nodeRules = used; else delete t.nodeRules; }
        const c = t.consequences || {};
        Object.keys(c).forEach(k => { if (!keys[k]) delete c[k]; });
    }

    // ------------------------------------------------------------ notation (IEC 62502)
    const _E = window.SLDiagramEditor || null;
    function _x(s) { return _E ? _E.esc(s) : _esc(s); }
    function _fmtP(v) { return (typeof v === 'number' && isFinite(v)) ? (v === 0 ? '0' : v === 1 ? '1' : v.toExponential(2)) : '?'; }
    function _wrap(text, max, lines) {
        const words = String(text || '').split(/\s+/).filter(Boolean), out = []; let cur = '';
        words.forEach(w => { if (!cur) cur = w; else if ((cur + ' ' + w).length <= max) cur += ' ' + w; else { out.push(cur); cur = w; } });
        if (cur) out.push(cur);
        if (out.length > lines) { out.length = lines; out[lines - 1] = out[lines - 1].slice(0, Math.max(1, max - 1)) + '…'; }
        return out.map(l => l.length > max ? l.slice(0, max - 1) + '…' : l);
    }
    const OKC = 'var(--sde-ok,#1f8f4e)', BADC = 'var(--sde-bad,#c0392b)', LINE = 'var(--sde-line,#4a5260)', MUTED = 'var(--sde-muted,#7a828f)', INK = 'var(--sde-stroke,#14171c)', FILL = 'var(--sde-fill,#fff)';

    function _shapeInit(e) {
        const p = e.props || {}, w = G.INIT_W, h = G.HDR_H, ry = p._rootY != null ? p._rootY : h + 30;
        const lines = e.label ? _wrap(e.label, 24, 2) : ['Initiating event'];
        const f = p.fromTransfers ? (p._f != null ? _fmtP(p._f) + ' /FH from transfers' : 'from transfers') : (p.freq != null && p.freq !== '' ? _fmtP(+p.freq) + ' /FH' : 'frequency: enter your value');
        return '<path d="M ' + (w / 2) + ' ' + h + ' V ' + ry + ' H ' + G.X0 + '" fill="none" stroke="' + LINE + '" stroke-width="1.8"/>' +
            '<rect class="sde-shape" x="0" y="0" width="' + w + '" height="' + h + '" rx="6" fill="' + FILL + '" stroke="' + INK + '" stroke-width="1.6"/>' +
            '<rect x="0" y="0" width="' + w + '" height="18" rx="6" fill="rgba(26,110,242,.10)"/>' +
            '<text x="8" y="13" font-size="9.5" font-weight="700" fill="' + MUTED + '" letter-spacing=".4">INITIATING EVENT</text>' +
            lines.map((l, i) => '<text x="8" y="' + (34 + i * 14) + '" font-size="12" font-weight="600" fill="' + (e.label ? INK : MUTED) + '">' + _x(l) + '</text>').join('') +
            '<text x="8" y="' + (h - 9) + '" font-size="10.5" fill="' + MUTED + '" font-family="var(--font-mono,monospace)">' + _x(f) + '</text>' +
            '<path d="M ' + (w / 2 - 14) + ' ' + h + ' h 28" stroke="transparent" stroke-width="12"/><path d="M ' + (w / 2) + ' ' + h + ' V ' + ry + '" stroke="transparent" stroke-width="10" fill="none"/>';
    }
    function _shapeHeading(e) {
        const p = e.props || {}, w = e.w, h = e.h;
        const lines = _wrap(e.label || 'Unnamed heading', 24, 3);
        let pr;
        if (Array.isArray(p.branches) && p.branches.length >= 2) pr = p.branches.length + ' outcomes';
        else pr = (p.pFail != null && p.pFail !== '') ? 'P(failure) ' + _fmtP(+p.pFail) : 'P(failure): enter your value';
        const tags = [];
        if (p._cpl) tags.push('coupled');
        if (p.linkedPageId) tags.push('fault tree');
        return '<rect class="sde-shape" x="0" y="0" width="' + w + '" height="' + h + '" rx="6" fill="' + FILL + '" stroke="' + INK + '" stroke-width="1.4"/>' +
            '<text x="8" y="13" font-size="9" font-weight="700" fill="' + MUTED + '" letter-spacing=".4">HEADING ' + ((p._col || 0) + 1) + '</text>' +
            lines.map((l, i) => '<text x="8" y="' + (29 + i * 13) + '" font-size="11.5" font-weight="600" fill="' + INK + '">' + _x(l) + '</text>').join('') +
            '<text x="8" y="' + (h - 8) + '" font-size="10" fill="' + ((p.pFail == null || p.pFail === '') && !p.branches ? BADC : MUTED) + '" font-family="var(--font-mono,monospace)">' + _x(pr) + (tags.length ? ' · ' + _x(tags.join(' · ')) : '') + '</text>';
    }
    function _shapeNode(e) {
        const p = e.props || {}, ys = p._ys || [], yin = p._yin || 0, W = e.w, br = p._br || [];
        const SX = 22;
        let s = '';
        if (p.rule === 'skip' || p.rule === 'end') {
            s += '<path d="M 0 ' + yin + ' H ' + W + '" fill="none" stroke="' + LINE + '" stroke-width="1.6"' + (p.rule === 'skip' ? ' stroke-dasharray="6 4"' : '') + '/>';
            s += '<text x="' + (SX + 4) + '" y="' + (yin - 5) + '" font-size="9.5" fill="' + MUTED + '" font-style="italic">' + (p.rule === 'skip' ? 'does not apply' : 'sequence ends') + '</text>';
            s += '<rect class="sde-shape" x="0" y="' + (yin - 9) + '" width="' + Math.min(W, G.COLW) + '" height="18" fill="transparent" stroke="none"/>';
            return s + '<path d="M 0 ' + yin + ' H ' + W + '" stroke="transparent" stroke-width="12" fill="none"/>';
        }
        s += '<path d="M 0 ' + yin + ' H ' + SX + '" fill="none" stroke="' + LINE + '" stroke-width="1.6"/>';
        s += '<path d="M ' + SX + ' ' + ys[0] + ' V ' + ys[ys.length - 1] + '" fill="none" stroke="' + LINE + '" stroke-width="1.6"/>';
        ys.forEach((y, k) => {
            const b = br[k] || {}, col = k === 0 ? OKC : (b.multi && k < ys.length - 1 ? '#b7791f' : BADC);
            s += '<path d="M ' + SX + ' ' + y + ' H ' + W + '" fill="none" stroke="' + LINE + '" stroke-width="1.6"/>';
            s += '<text x="' + (SX + 5) + '" y="' + (y - 5) + '" font-size="9.5" fill="' + col + '" font-weight="600">' + _x(String(b.t || '').slice(0, 20)) + ' <tspan font-weight="400" fill="' + MUTED + '" font-family="var(--font-mono,monospace)">' + _x(_fmtP(b.p)) + (b.cond ? ' (coupled)' : '') + '</tspan>' + (b.cond ? '<title>Probability once an earlier heading did not succeed</title>' : '') + '</text>';
        });
        s += '<circle class="sde-shape" cx="' + SX + '" cy="' + yin + '" r="3.6" fill="' + LINE + '" stroke="' + LINE + '"/>';
        s += '<path d="M ' + SX + ' ' + ys[0] + ' V ' + ys[ys.length - 1] + '" stroke="transparent" stroke-width="12" fill="none"/>';
        return s;
    }
    function _shapeEnd(e) {
        const p = e.props || {}, w = e.w, h = e.h;
        const sev = p.severity || '', col = sev ? (SEV_COLORS[sev] || '#cbd5e1') : 'transparent';
        const name = e.label || (p.transferTo ? 'Transfer to ' + p.transferTo : (sev || 'End state (not assessed)'));
        let s = '<path d="M -10 ' + (h / 2) + ' H 0" stroke="' + LINE + '" stroke-width="1.6"/>';
        s += '<rect class="sde-shape" x="0" y="0" width="' + w + '" height="' + h + '" rx="4" fill="' + FILL + '" stroke="' + (sev ? INK : MUTED) + '" stroke-width="1.2"' + (sev || p.transferTo || e.label ? '' : ' stroke-dasharray="4 3"') + '/>';
        s += '<rect x="0" y="0" width="8" height="' + h + '" rx="3" fill="' + col + '"/>';
        let tx = 14;
        if (p.transferTo) { s += '<path d="M 14 ' + (h - 8) + ' l 9 -16 l 9 16 z" fill="' + FILL + '" stroke="' + INK + '" stroke-width="1.3"/>'; tx = 38; }
        s += '<text x="' + tx + '" y="15" font-size="11" font-weight="600" fill="' + INK + '"><tspan fill="' + MUTED + '" font-weight="400">#' + (p._seq || '') + ' </tspan>' + _x(String(name).slice(0, 34)) + '</text>';
        s += '<text x="' + tx + '" y="' + (h - 8) + '" font-size="9.5" fill="' + MUTED + '" font-family="var(--font-mono,monospace)">p ' + _x(_fmtP(p._p)) + ' · ' + _x(_fmtP(p._f)) + ' /FH' + (sev && e.label ? ' · ' + _x(sev) : '') + (p.category ? ' · ' + _x(String(p.category).slice(0, 18)) : '') + '</text>';
        return s;
    }
    function _shapeNote(e) {
        return '<rect class="sde-shape" x="0" y="0" width="' + e.w + '" height="' + e.h + '" rx="6" fill="rgba(183,121,31,.08)" stroke="#b7791f" stroke-dasharray="4 3"/>' +
            _wrap((e.props || {})._text || '', Math.floor(e.w / 6.4), 3).map((l, i) => '<text x="10" y="' + (20 + i * 14) + '" font-size="11.5" fill="' + INK + '">' + _x(l) + '</text>').join('');
    }
    const _icon = inner => '<svg width="30" height="22" viewBox="0 0 30 22" aria-hidden="true">' + inner + '</svg>';
    const STAMPS = { 'stamp-outcome': 1, 'stamp-skip': 1, 'stamp-end': 1, 'stamp-transfer': 1 };

    function _treeOfEditor(ed) { const id = ed && ed.opts && ed.opts.etaTreeId; return id ? _store().find(x => x && x.id === id) || null : null; }
    function _RuleError(msg) { const R = _E && _E.RuleError; return R ? new R(msg) : new Error(msg); }
    function _hitIn(els, kind, x, y, pad) {
        pad = pad || 0;
        return els.filter(e => e.kind === kind && x >= e.x - pad && x <= e.x + e.w + pad && y >= e.y - pad && y <= e.y + e.h + pad)
            .sort((a, b) => (a.w * a.h) - (b.w * b.h))[0] || null;
    }
    function _nearestInColumn(els, kind, x, y) {
        const col = els.filter(e => e.kind === kind && x >= e.x && x <= e.x + Math.min(e.w, G.COLW));
        let best = null, bd = 60;
        col.forEach(e => { const yy = e.y + ((e.props && e.props._yin) || e.h / 2), dd = Math.abs(yy - y); if (dd < bd) { bd = dd; best = e; } });
        return best;
    }
    function _headingAtColumn(els, d) {
        const hs = els.filter(e => e.kind === 'heading').sort((a, b) => (a.x + a.w / 2) - (b.x + b.w / 2));
        return hs[d] || null;
    }
    let _bidSeq = 0;
    function _newBranchId() { return 'O' + Date.now().toString(36) + (_bidSeq++).toString(36); }
    // Make a plain heading multi-outcome, or add one more outcome to a multi-outcome one.
    // Probabilities stay summing to 1: the new outcome starts at 0 until you split it.
    function _addOutcome(tx, hel) {
        const p = hel.props || {};
        let branches;
        if (Array.isArray(p.branches) && p.branches.length >= 2) {
            if (p.branches.length >= ETA_MAX_OUTCOMES) throw _RuleError('A heading can have at most ' + ETA_MAX_OUTCOMES + ' outcomes.');
            branches = _clone(p.branches);
            const coupled = branches.every(b => _num(b.pc) !== null);
            const nb = { id: _newBranchId(), label: 'Outcome ' + (branches.length + 1), p: 0 };
            if (coupled) nb.pc = 0;
            branches.splice(branches.length - 1, 0, nb);
        } else {
            const pf = _num(p.pFail), pc = _num(p.pCcf);
            branches = [{ id: 'S', label: 'Success', p: pf === null ? 1 : 1 - pf }, { id: _newBranchId(), label: 'Partial success', p: 0 }, { id: 'F', label: 'Failure', p: pf === null ? 0 : pf }];
            if (pc !== null) { branches[0].pc = 1 - pc; branches[1].pc = 0; branches[2].pc = pc; }
        }
        tx.updateElement(hel.id, { props: { branches: branches, pFail: undefined, pCcf: undefined } });
    }
    let _pendingSelect = null;
    function _applyStamp(tx, s, ed) {
        const els = tx.model.elements, cx = s.x + s.w / 2, cy = s.y + s.h / 2;
        // placed from the keyboard (Enter on a tool) or not on a target: the selected shape is the target
        let selected = null;
        try { const sel = ed && typeof ed.selection === 'function' ? ed.selection() : []; if (sel.length === 1) selected = tx.get(sel[0]) || null; } catch (_) {}
        const pick = (kind) => (selected && selected.kind === kind) ? selected : null;
        if (s.kind === 'stamp-skip' || s.kind === 'stamp-end') {
            const node = _hitIn(els, 'node', cx, cy) || pick('node') || _nearestInColumn(els, 'node', cx, cy);
            if (!node) throw _RuleError('Drop "' + (s.kind === 'stamp-skip' ? 'Does not apply' : 'End sequence here') + '" on a branch point of the tree, where a heading splits a sequence (or select the branch point first).');
            tx.updateElement(node.id, { props: { rule: s.kind === 'stamp-skip' ? 'skip' : 'end' } });
            _pendingSelect = node.id;
            return;
        }
        if (s.kind === 'stamp-outcome') {
            let hel = _hitIn(els, 'heading', cx, cy, 6);
            if (!hel) hel = pick('heading');
            if (!hel) { const node = _hitIn(els, 'node', cx, cy) || pick('node') || _nearestInColumn(els, 'node', cx, cy); if (node) hel = _headingAtColumn(els, (node.props || {})._d || 0); }
            if (!hel) throw _RuleError('Drop "Extra outcome" on a heading (or on one of its branch points) to give it a partial-success outcome.');
            _addOutcome(tx, hel);
            _pendingSelect = hel.id;
            return;
        }
        if (s.kind === 'stamp-transfer') {
            const end = _hitIn(els, 'end', cx, cy, 6) || pick('end') || _nearestInColumn(els, 'end', cx, cy);
            if (!end) throw _RuleError('Drop "Transfer" on an end state: that sequence then continues in another event tree.');
            const me = _treeOfEditor(ed), other = _store().find(x => x && (!me || x.id !== me.id));
            if (!other) throw _RuleError('There is no other event tree to transfer to yet. Create it first (New event tree), then drop the transfer here.');
            tx.updateElement(end.id, { props: { transferTo: other.id } });
            _pendingSelect = end.id;
        }
    }
    function _sameEl(a, b) {
        return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && String(a.label || '') === String(b.label || '') && a.kind === b.kind &&
            JSON.stringify(a.props || {}) === JSON.stringify(b.props || {}) && JSON.stringify(a.sysmlRef || null) === JSON.stringify(b.sysmlRef || null);
    }
    // Bring the transaction's model to exactly `target` (ids are stable: headings by id,
    // branch points and end states by position, so growing a tree mostly updates in place).
    function _syncInto(tx, target) {
        const want = new Map(target.elements.map(e => [e.id, e]));
        const gone = tx.model.elements.filter(e => !want.has(e.id)).map(e => e.id);
        for (let i = gone.length - 1; i >= 0; i--) tx.removeElement(gone[i]);
        target.elements.forEach(te => {
            const cur = tx.get(te.id);
            if (!cur) { tx.addElement(te.kind, te.x, te.y, { id: te.id, w: te.w, h: te.h, label: te.label, props: te.props, sysmlRef: te.sysmlRef }); return; }
            if (_sameEl(cur, te)) return;
            const props = Object.assign({}, te.props);
            Object.keys(cur.props || {}).forEach(k => { if (!(k in props)) props[k] = undefined; });
            tx.updateElement(te.id, { kind: te.kind, x: te.x, y: te.y, w: te.w, h: te.h, label: te.label, props: props, sysmlRef: te.sysmlRef === undefined ? undefined : te.sysmlRef });
        });
    }
    function _complete(tx, ctx) {
        const base = _treeOfEditor(ctx.editor);
        if (!base) return;
        tx.model.elements.filter(e => STAMPS[e.kind]).forEach(s => { _applyStamp(tx, s, ctx.editor); tx.removeElement(s.id); });
        // a branch point is drawn from its heading, not a model element of its own: link the heading or the end state
        if (tx.model.elements.some(e => (e.kind === 'node' || e.kind === 'note') && e.sysmlRef)) throw _RuleError('A branch point follows its heading and is not a model element of its own. Link the heading, or an end state, to the model instead.');
        const t2 = fromModel(tx.model, base);
        _syncInto(tx, toModel(t2));
    }

    function _fcOptions(cur) {
        const ids = [];
        ((typeof acFhaData !== 'undefined' ? acFhaData : []) || []).forEach(f => { if (f && f.fcId && ids.indexOf(f.fcId) < 0) ids.push(f.fcId); });
        ((typeof systemsData !== 'undefined' ? systemsData : []) || []).forEach(s => (s.fha || []).forEach(f => { if (f && f.fcId && ids.indexOf(f.fcId) < 0) ids.push(f.fcId); }));
        if (cur && ids.indexOf(cur) < 0) ids.push(cur);
        return [{ value: '', label: 'Not linked' }].concat(ids.map(v => ({ value: v, label: v })));
    }
    function _pageOptions(cur) {
        const pages = ((typeof ftaPages !== 'undefined' ? ftaPages : []) || []).filter(p => p && p.root);
        const o = [{ value: '', label: 'Not linked' }].concat(pages.map(p => ({ value: p.id, label: String(p.name || p.id).slice(0, 60) })));
        if (cur && !pages.some(p => p.id === cur)) o.push({ value: cur, label: cur + ' (not found)' });
        return o;
    }
    function _treeOptions(cur, selfId) {
        const o = [{ value: '', label: 'No transfer (end state)' }].concat(_store().filter(t => t && t.id !== selfId).map(t => ({ value: t.id, label: t.id + ' ' + String(t.name || '').slice(0, 40) })));
        if (cur && !_store().some(t => t.id === cur)) o.push({ value: cur, label: cur + ' (not found)' });
        return o;
    }
    const _pNum = (v) => (v == null || v === '') ? null : (Number(v) >= 0 && Number(v) <= 1 ? null : 'Enter a probability between 0 and 1 (for example 1e-3).');

    function _fields(item, ctx) {
        if (!ctx || !ctx.isElement) return null;
        const tr = _treeOfEditor(ctx.editor);
        if (item.kind === 'init') return [
            { key: 'props.freq', label: 'Frequency (per flight hour, your value)', type: 'number', validate: v => (v == null || v > 0) ? null : 'The initiating event frequency must be a positive number.' },
            { key: 'props.fromTransfers', label: 'Use the frequency transferred in from other event trees', type: 'checkbox', help: 'The sum of the sequences of other trees that transfer into this one.' },
        ];
        if (item.kind === 'heading') {
            const multi = Array.isArray(item.props.branches) && item.props.branches.length >= 2;
            const f = multi ? [] : [
                { key: 'props.pFail', label: 'P(failure) (your value)', type: 'number', validate: _pNum },
                { key: 'props.pCcf', label: 'P(failure) once an earlier heading did not succeed (optional)', type: 'number', validate: _pNum, help: 'Common-cause coupling. Leave blank for an independent heading.' },
            ];
            return f.concat([
                { key: 'props.linkedPageId', label: 'Quantified by fault tree', type: 'select', options: _pageOptions(item.props.linkedPageId) },
                { key: 'props.note', label: 'Note', type: 'textarea' },
            ]);
        }
        if (item.kind === 'node') return [
            { key: 'props.rule', label: 'At this point of the sequence', type: 'select', options: [
                { value: 'apply', label: 'The heading applies: branch' },
                { value: 'skip', label: 'The heading does not apply: pass straight through' },
                { value: 'end', label: 'The sequence ends here' }] },
        ];
        if (item.kind === 'end') return [
            { key: 'props.severity', label: 'Severity', type: 'select', options: [{ value: '', label: 'Not assessed' }].concat(SEVS.map(s => ({ value: s, label: s }))) },
            { key: 'props.category', label: 'Consequence category', type: 'text', help: 'For example: safe flight and landing, damage, injury.' },
            { key: 'props.linkedFcId', label: 'Failure condition', type: 'select', options: _fcOptions(item.props.linkedFcId) },
            { key: 'props.transferTo', label: 'Transfer to event tree', type: 'select', options: _treeOptions(item.props.transferTo, tr && tr.id) },
            { key: 'props.note', label: 'Note', type: 'textarea' },
        ];
        return [];
    }

    let _curEd = null;
    function _panel(item, ctx) {
        const ed = ctx && ctx.editor, t = _treeOfEditor(ed);
        if (!t) return '';
        const ro = ctx.readOnly ? ' disabled' : '';
        const btn = (act, label, extra) => '<button type="button" class="sde-btn" onclick="SLEtaUI.act(\'' + act + '\'' + (extra != null ? ',' + extra : '') + ')"' + ro + '>' + _esc(label) + '</button>';
        if (!item) {
            let ev = null; try { ev = etaEvaluate(t); } catch (_) {}
            return '<label>Event tree</label><div>' + _esc(t.id + ' ' + (t.name || '')) + '</div>' +
                '<div class="sde-help">Drag a Heading onto the canvas to add a column. Drop "Extra outcome", "Does not apply", "End sequence here" or "Transfer" on the part of the tree it changes. Select an end state to assess it.</div>' +
                (ev ? '<label>Sum of sequence probabilities</label><div class="sde-ro-val">' + ev.sum.toPrecision(6) + (ev.closed ? ' (closes to 1)' : ' (does not close)') + '</div><label>Sequences</label><div>' + ev.outcomes.length + '</div>' : '');
        }
        if (item.kind === 'heading') {
            const p = item.props || {}, multi = Array.isArray(p.branches) && p.branches.length >= 2;
            let h = '';
            if (multi) {
                const s = p.branches.reduce((a, b) => a + (_num(b.p) || 0), 0);
                h += '<label>Outcomes (top to bottom; the first is success)</label>';
                p.branches.forEach((b, k) => {
                    h += '<div style="display:flex;gap:4px;align-items:center;margin:3px 0;">' +
                        '<input type="text" value="' + _esc(b.label || '') + '" aria-label="Outcome ' + (k + 1) + ' name" style="flex:1.4;" onchange="SLEtaUI.branch(\'' + _esc(item.id) + '\',' + k + ',\'label\',this.value)"' + ro + '>' +
                        '<input type="text" inputmode="decimal" value="' + _esc(b.p == null ? '' : b.p) + '" aria-label="Outcome ' + (k + 1) + ' probability" title="Probability (your value)" style="flex:1;" onchange="SLEtaUI.branch(\'' + _esc(item.id) + '\',' + k + ',\'p\',this.value)"' + ro + '>' +
                        '<input type="text" inputmode="decimal" value="' + _esc(b.pc == null ? '' : b.pc) + '" aria-label="Outcome ' + (k + 1) + ' probability once an earlier heading did not succeed" title="Probability once an earlier heading did not succeed (optional, all or none)" placeholder="coupled" style="flex:1;" onchange="SLEtaUI.branch(\'' + _esc(item.id) + '\',' + k + ',\'pc\',this.value)"' + ro + '>' +
                        (p.branches.length > 2 ? '<button type="button" class="sde-btn" title="Remove this outcome" aria-label="Remove outcome ' + (k + 1) + '" onclick="SLEtaUI.branch(\'' + _esc(item.id) + '\',' + k + ',\'remove\')"' + ro + '>Remove</button>' : '') + '</div>';
                });
                h += '<div class="sde-help"' + (Math.abs(s - 1) > 1e-9 ? ' style="color:var(--sde-bad,#c0392b)"' : '') + '>Probabilities add up to ' + s.toPrecision(6) + (Math.abs(s - 1) > 1e-9 ? ': they must add up to 1.' : '.') + ' Columns: name, probability, probability once an earlier heading did not succeed.</div>';
            }
            h += '<div class="sde-row">' + btn('outcome', 'Add an outcome', "'" + item.id + "'") + btn('left', 'Move left', "'" + item.id + "'") + btn('right', 'Move right', "'" + item.id + "'") + '</div>';
            if (p.linkedPageId) { const pt = _linkedPTop(_pageById(p.linkedPageId)); h += '<label>Linked fault tree P(top), for review only</label><div class="sde-ro-val">' + (pt !== null ? pt.toExponential(3) + ' /FH' : 'not available') + '</div><div class="sde-help">Shown beside your per-demand value; it never overwrites it.</div>'; }
            const ix = (t.barriers || []).findIndex((b, i) => _hid(b, i) === item.id);
            const cps = ix >= 0 ? etaCoupling(t).filter(c => c.i === ix || c.j === ix) : [];
            if (cps.length) h += '<label>Coupling</label>' + cps.map(c => '<div class="sde-help" style="color:' + (c.modeled ? 'inherit' : 'var(--sde-bad,#c0392b)') + '">' + _esc((c.modeled ? 'Modeled: ' : 'Not modeled: ') + c.why + ' (with ' + (c.i === ix ? c.bName : c.aName) + ')') + '</div>').join('');
            return h;
        }
        if (item.kind === 'end') {
            let ev = null; try { ev = etaEvaluate(t); } catch (_) {}
            const o = ev ? ev.outcomes.find(x => x.key === item.props.key) : null;
            if (!o) return '';
            const f = etaFindings().filter(x => x.tree === t.id && x.key === o.key);
            return '<label>Sequence ' + o.seqNo + ' (path ' + _esc(o.key) + ')</label><div class="sde-help">' + _esc(o.seq.length ? o.seq.join(', then ') : 'No headings yet') + '</div>' +
                '<label>Sequence probability and frequency</label><div class="sde-ro-val">p ' + o.prob.toExponential(4) + ' · ' + o.freq.toExponential(4) + ' /FH</div>' +
                f.map(x => '<div class="sde-issue">' + _esc(x.detail) + '</div>').join('') +
                (o.transferTo ? '<div class="sde-row">' + btn('open', 'Open ' + o.transferTo, "'" + o.transferTo + "'") + '</div>' : '');
        }
        if (item.kind === 'init') {
            let ev = null; try { ev = etaEvaluate(t); } catch (_) {}
            return ev && ev.fromTransfers ? '<label>Frequency transferred in</label><div class="sde-ro-val">' + ev.freq.toExponential(4) + ' /FH</div>' : '';
        }
        if (item.kind === 'node') return '<div class="sde-help">A branch point: where heading ' + ((item.props._d || 0) + 1) + ' splits this sequence. Choose whether the heading applies here.</div>';
        return '';
    }

    function _validate(m) {
        const out = [];
        const t = _treeOfEditor(_curEd);
        if (!t) return out;
        etaFindings().filter(f => f.tree === t.id).slice(0, 20).forEach(f => {
            const end = f.key ? (m.elements || []).find(e => e.kind === 'end' && e.props && e.props.key === f.key) : null;
            out.push({ id: end ? end.id : null, message: f.detail });
        });
        return out;
    }

    if (_E) {
        _E.register({
            type: 'event-tree',
            title: 'Event tree (IEC 62502)',
            grid: 2,
            lockPositions: true,
            layout: false,
            hint: 'Drag a tool from the toolbox onto the tree. Click a shape to edit it on the right; double-click to rename.',
            elementKinds: {
                init: { label: 'Initiating event', hidden: true, shape: _shapeInit, renderLabel: false, resizable: false, ports: 'none', w: G.X0, h: G.TOP, maxCount: 1, sysmlType: 'SafetyLab::EventTree', lodShape: true },
                heading: { label: 'Heading', description: 'A pivotal event or barrier: one column of the tree, with a success and a failure branch on every sequence it applies to', shape: _shapeHeading, renderLabel: false, resizable: false, ports: 'none', w: G.COLW - 16, h: G.HDR_H, defaultLabel: 'New heading', sysmlType: 'SafetyLab::EventTreeHeading', lodShape: true,
                    icon: _icon('<rect x="2" y="3" width="26" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 9h18M6 14h11" stroke="currentColor" stroke-width="1.3"/>') },
                node: { label: 'Branch point', hidden: true, shape: _shapeNode, renderLabel: false, resizable: false, ports: 'none', labelEditable: false, lodShape: true },
                end: { label: 'End state', hidden: true, shape: _shapeEnd, renderLabel: false, resizable: false, ports: 'none', w: G.END_W, h: G.END_H, sysmlType: 'SafetyLab::EventTreeOutcome', lodShape: true },
                note: { label: 'Note', hidden: true, shape: _shapeNote, renderLabel: false, resizable: false, ports: 'none', labelEditable: false },
                'stamp-outcome': { label: 'Extra outcome', description: 'Drop on a heading to give it a partial-success outcome (more than two branches)', w: 30, h: 24, ports: 'none', resizable: false,
                    icon: _icon('<path d="M3 11h8M11 4v14M11 4h15M11 11h15M11 18h15" fill="none" stroke="currentColor" stroke-width="1.5"/>') },
                'stamp-skip': { label: 'Does not apply', description: 'Drop on a branch point: the heading is not asked on that sequence, which passes straight through', w: 30, h: 24, ports: 'none', resizable: false,
                    icon: _icon('<path d="M3 11h24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="4 3"/>') },
                'stamp-end': { label: 'End sequence here', description: 'Drop on a branch point: the sequence ends there, without the later headings', w: 30, h: 24, ports: 'none', resizable: false,
                    icon: _icon('<path d="M3 11h18" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="21" y="5" width="6" height="12" fill="currentColor"/>') },
                'stamp-transfer': { label: 'Transfer', description: 'Drop on an end state: the sequence continues in another event tree', w: 30, h: 24, ports: 'none', resizable: false,
                    icon: _icon('<path d="M3 11h11" stroke="currentColor" stroke-width="1.6"/><path d="M14 18l7-13 7 13z" fill="none" stroke="currentColor" stroke-width="1.5"/>') },
            },
            connectorKinds: {},
            complete: _complete,
            fields: _fields,
            panel: _panel,
            validate: _validate,
            canDelete(item) {
                if (!item) return true;
                if (item.kind === 'init') return 'The initiating event is the root of the tree. Delete the whole event tree from the page instead.';
                if (item.kind === 'node') return 'A branch point follows its heading. Use "Does not apply" or "End sequence here", or delete the heading.';
                if (item.kind === 'end') return 'End states follow the headings. Clear its assessment in the properties, or end the sequence earlier.';
                if (item.kind === 'note') return false;
                return true;
            },
        });
    }

    // ------------------------------------------------------------- the page
    function _sevChip(sev) {
        if (!sev) return '<span style="color:var(--color-text-tertiary); font-size:11px;">unassessed</span>';
        return _sevPill(sev);
    }
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
        return '<div style="padding:8px 14px; border:1px solid var(--color-border-strong); display:flex; gap:10px; flex-wrap:wrap; align-items:center; background:var(--color-surface-2);">' +
            closeBadge + '<span style="color:var(--color-border-strong);">|</span>' + worst + chips + '<span style="margin-left:auto; display:inline-flex; gap:10px; align-items:center;">' + cWarn + couple + '</span></div>';
    }

    let _selId = null, _page = 0;
    const PAGE = 200;
    function _sel() { const s = _store(); return s.find(t => t.id === _selId) || s[0] || null; }

    function _barrierRegister(t) {
        if (!(t.barriers || []).length) return '';
        const cps = etaCoupling(t);
        const pageOpts = ((typeof ftaPages !== 'undefined' ? ftaPages : []) || []).filter(p => p && p.root);
        return '<div style="margin:12px 0 0; border:1px solid var(--color-border-strong);">' +
            '<table class="data-table" style="width:100%; font-size:11.5px; margin:0;"><thead><tr>' +
            '<th style="width:26px;">#</th><th>Heading</th><th>pFail (elicited)</th><th>pFail | upstream failed</th><th>Implemented by (fault tree — elicited link)</th><th>Linked tree P(top) — annotation only</th><th>Coupling</th></tr></thead><tbody>' +
            (t.barriers || []).map((b, bi) => {
                const sel = '<select aria-label="Fault tree that implements heading ' + (bi + 1) + '" style="font-size:11px; padding:2px 4px; max-width:220px; border:1px solid var(--color-border-strong); background:var(--color-surface-2); color:var(--color-text-primary);" onchange="_etaLinkUi(\'' + t.id + '\',' + bi + ', this.value)">' +
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
                const multi = _isMulti(b);
                return '<tr><td class="u-mono">' + (bi + 1) + '</td><td>' + _esc(b.name || '') + (multi ? ' <span style="color:var(--color-text-tertiary);">(' + b.branches.length + ' outcomes)</span>' : '') + '</td>' +
                    '<td class="u-mono">' + _pNotOk(b).toExponential(2) + '</td>' +
                    '<td class="u-mono">' + (!multi && _num(b.pCcf) !== null ? _clamp01(_num(b.pCcf)).toExponential(2) : (multi && _coupledHeading(b) ? 'per outcome' : '<span style="color:var(--color-text-tertiary);">—</span>')) + '</td>' +
                    '<td>' + sel + '</td><td>' + pTopCell + '</td><td>' + cCell + '</td></tr>';
            }).join('') + '</tbody></table></div>';
    }

    function _sequenceTable(t, ev, allFindings) {
        const fk = {}; allFindings.forEach(x => { if (x.tree === t.id && x.key) fk[x.key] = x; });
        const N = ev.outcomes.length, pages = Math.max(1, Math.ceil(N / PAGE));
        if (_page >= pages) _page = pages - 1;
        const rows = ev.outcomes.slice(_page * PAGE, _page * PAGE + PAGE);
        const nav = N > PAGE ? '<div style="display:flex; gap:8px; align-items:center; margin:6px 0; font-size:11.5px;">Sequences ' + (_page * PAGE + 1) + ' to ' + Math.min(N, (_page + 1) * PAGE) + ' of ' + N.toLocaleString() +
            '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 9px;"' + (_page ? '' : ' disabled') + ' onclick="SLEtaUI.page(-1)">Previous</button><button class="ckpt-m-btn" style="font-size:11px; padding:2px 9px;"' + (_page < pages - 1 ? '' : ' disabled') + ' onclick="SLEtaUI.page(1)">Next</button><span style="color:var(--color-text-tertiary);">Export CSV for every sequence at once.</span></div>' : '';
        return nav + '<table class="data-table" style="width:100%; font-size:12px; margin-top:12px;"><thead><tr><th>Seq</th><th>Path</th><th>Sequence</th><th>P(path)</th><th>Freq (/FH)</th><th>End state</th><th>Severity call</th><th>Linked FC</th><th></th></tr></thead><tbody>' +
            rows.map(o => {
                const flag = fk[o.key];
                const rowStyle = flag ? ' style="background:rgba(226,75,74,0.06);"' : '';
                const fcCell = flag ? _esc(o.linkedFcId || '—') + ' <span title="' + _esc(flag.detail) + '" style="color:#B7791F; font-weight:700;">⚠</span>' : _esc(o.linkedFcId || '—');
                return '<tr' + rowStyle + '><td class="u-mono">' + o.seqNo + '</td><td class="u-mono">' + _esc(o.key) + '</td>' +
                    '<td style="font-size:11px;">' + o.seq.map(_esc).join(' → ') + '</td>' +
                    '<td class="u-mono" style="font-size:11px;">' + o.prob.toExponential(3) + '</td>' +
                    '<td class="u-mono" style="font-size:11px;">' + o.freq.toExponential(3) + '</td>' +
                    '<td style="font-size:11px;">' + _esc(o.label || '') + (o.transferTo ? ' <span title="Transfers to another event tree">→ ' + _esc(o.transferTo) + '</span>' : '') + (o.category ? ' <span style="color:var(--color-text-tertiary);">(' + _esc(o.category) + ')</span>' : '') + '</td>' +
                    '<td>' + _sevChip(o.severity) + '</td>' +
                    '<td class="u-mono" style="font-size:11px;">' + fcCell + '</td>' +
                    '<td><button class="ckpt-m-btn" style="font-size:10.5px; padding:1px 8px;" onclick="_etaAssessUi(\'' + t.id + '\',\'' + _esc(o.key) + '\')">assess…</button></td></tr>';
            }).join('') + '</tbody></table>';
    }

    function _renderSide() {
        const side = document.getElementById('eta-side');
        if (!side) return;
        const t = _sel();
        if (!t) { side.innerHTML = ''; return; }
        let ev = null, err = null;
        try { ev = etaEvaluate(t); } catch (e) { err = e; }
        const allFindings = etaFindings();
        const sub = document.getElementById('eta-sub');
        if (sub) sub.textContent = t.id + ' · ' + ((t.initiator && t.initiator.desc) || 'initiating event not named yet') + ' · ' + (t.barriers || []).length + ' heading(s)' + (ev ? ' · ' + ev.outcomes.length + ' sequence(s)' : '') + (t.by ? ' · ' + t.by : '');
        let html = '';
        if (err) html += '<div style="padding:10px 14px; border:1px solid #B7791F; background:rgba(183,121,31,.06); font-size:12px;">' + _esc(err.message || err) + '</div>';
        else html += _summaryStrip(t, ev);
        html += _barrierRegister(t);
        if (ev) html += _sequenceTable(t, ev, allFindings);
        const mine = allFindings.filter(x => x.tree === t.id);
        if (mine.length) {
            html += '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); padding:8px 14px; margin-top:12px;"><b style="font-size:12px;">Findings (INV-27)</b>' +
                mine.map(x => '<div style="font-size:12px; padding:4px 0 4px 10px; border-left:3px solid #B7791F; margin:4px 0;">' + _esc(x.tree) + ' [' + x.kind + ']: ' + _esc(x.detail) + '</div>').join('') + '</div>';
        }
        side.innerHTML = html;
    }

    function _mountEditor(t) {
        const host = document.getElementById('eta-canvas');
        if (!host) return;
        if (_curEd && _curEd.opts.etaTreeId === (t && t.id) && host.contains(_curEd.root)) { _curEd.reload(); return; }
        if (_curEd) { try { _curEd.destroy(); } catch (_) {} _curEd = null; }
        host.innerHTML = '';
        if (!t || !_E) return;
        const tid = t.id;
        _curEd = _E.mount(host, {
            type: 'event-tree',
            etaTreeId: tid,
            height: 'fill',   // 15 Oct 2026: the shared canvas height (diagram_editor.js v1.5)
            lockKey: 'eta:' + tid,
            adapter: {
                load: () => { const tr = _store().find(x => x.id === tid); return tr ? toModel(tr) : { elements: [], connectors: [] }; },
                save: (model) => {
                    const s = _store(), i = s.findIndex(x => x.id === tid);
                    if (i < 0) return;
                    s[i] = fromModel(model, s[i]);
                    _jr('eta', tid + ': edited on the diagram');
                },
            },
            actions: [
                { label: 'Export image', title: 'Download the whole event tree as an SVG picture', run: () => SLEtaUI.exportSvg() },
                { label: 'Export SysML v2', title: 'Export the event trees as SysML v2 (SafetyLab library)', run: () => { try { SLSysML.openExport('eta'); } catch (_) { _toast('SysML v2 export is not available in this build.', 'warning'); } } },
            ],
        });
        _curEd.on('change', () => {
            _renderSide();
            // after the gesture's own selection (a dropped tool selects itself, and is gone)
            if (_pendingSelect) { const id = _pendingSelect, ed = _curEd; _pendingSelect = null; setTimeout(() => { try { if (ed.get(id)) ed.select([id]); } catch (_) {} }, 0); }
        });
        _curEd.on('reload', () => _renderSide());
    }

    function _render() {
        const host = document.getElementById('eta-host');
        if (!host) return;
        const s = _store(), t = _sel();
        if (t) _selId = t.id;
        const B = 'font-size:11.5px; padding:4px 12px;';
        let html = '<div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:12px;">' +
            '<label for="eta-pick" style="font-size:12px; font-weight:600;">Event tree</label>' +
            '<select id="eta-pick" onchange="SLEtaUI.select(this.value)" style="font-size:12px; padding:4px 8px; border:1px solid var(--color-border-strong); background:var(--color-surface-2); color:var(--color-text-primary); max-width:360px;">' +
            (s.length ? s.map(x => '<option value="' + _esc(x.id) + '"' + (t && x.id === t.id ? ' selected' : '') + '>' + _esc(x.id + ' · ' + (x.name || '')) + '</option>').join('') : '<option value="">No event trees yet</option>') + '</select>' +
            '<button class="ckpt-m-btn ckpt-m-btn-primary" style="' + B + '" onclick="SLEtaUI.create()">+ New event tree</button>' +
            (t ? '<button class="ckpt-m-btn" style="' + B + '" onclick="SLEtaUI.rename()">Rename</button><button class="ckpt-m-btn" title="Delete this event tree" style="' + B + '" onclick="_etaDeleteUi(\'' + t.id + '\')">Delete</button>' : '') +
            // 30 Aug 2026 - export parity batch 2b
            '<button class="ckpt-m-btn" style="font-size:11.5px; padding:4px 12px;" onclick="exportData(&quot;Event_Trees&quot;, &quot;csv&quot;)" title="Export every tree&#39;s full outcome enumeration as CSV">&#8595; Export CSV</button>' +
            '<span id="eta-err" style="color:var(--color-danger); font-size:11px; font-weight:600;"></span></div>';
        if (!t) {
            html += '<div style="padding:18px; border:1px dashed var(--color-border-strong); font-size:12.5px; color:var(--color-text-secondary);">An event tree follows an initiating event through the headings (barriers and pivotal events) that decide how it ends. Click <b>New event tree</b> to draw one by hand: name it, then drag headings onto the canvas, set their probabilities, and assess the end states.</div>';
            host.innerHTML = html;
            if (_curEd) { try { _curEd.destroy(); } catch (_) {} _curEd = null; }
            return;
        }
        html += '<div id="eta-sub" style="font-size:11.5px; color:var(--color-text-tertiary); margin:-4px 0 8px;" class="u-mono"></div>';
        html += '<div id="eta-canvas"></div><div id="eta-side"></div>';
        const keep = _curEd && _curEd.opts.etaTreeId === t.id ? _curEd.root : null;
        host.innerHTML = html;
        if (keep) { document.getElementById('eta-canvas').appendChild(keep); }
        _mountEditor(t);
        _renderSide();
    }

    window.SLEtaUI = {
        select(id) { _selId = id; _page = 0; _render(); },
        page(d) { _page = Math.max(0, _page + d); _renderSide(); },
        async create() {
            const name = await slPrompt('Name the new event tree (usually the initiating event it follows):', '', { title: 'New event tree', okText: 'Create' });
            if (name == null) return;
            const r = window.etaCreateBlank(name);
            if (!r.ok) { _toast(r.err, 'error', 3200); return; }
            _selId = r.id; _page = 0; _render();
            _toast(r.id + ' created. Name the initiating event, then drag headings onto the canvas.', 'success', 4200);
        },
        async rename() {
            const t = _sel(); if (!t) return;
            const name = await slPrompt('New name for ' + t.id + ':', t.name || '', { title: 'Rename event tree', okText: 'Rename' });
            if (name == null) return;
            const r = window.etaRename(t.id, name);
            if (!r.ok) { _toast(r.err, 'error', 3200); return; }
            _render();
        },
        act(what, arg) {
            const ed = _curEd; if (!ed) return;
            if (what === 'open') { _selId = arg; _page = 0; _render(); return; }
            const hel = ed.get(arg); if (!hel) return;
            if (what === 'outcome') { ed.change('Add an outcome to ' + (hel.label || 'heading'), tx => { _addOutcome(tx, tx.get(arg)); }); return; }
            if (what === 'left' || what === 'right') {
                const hs = ed.model().elements.filter(e => e.kind === 'heading').sort((a, b) => (a.x + a.w / 2) - (b.x + b.w / 2));
                const i = hs.findIndex(e => e.id === arg), j = what === 'left' ? i - 1 : i + 1;
                if (i < 0 || j < 0 || j >= hs.length) { _toast('This heading is already the ' + (what === 'left' ? 'first' : 'last') + ' one.', 'info', 2200); return; }
                ed.change('Move heading ' + what, tx => { tx.updateElement(hs[i].id, { x: hs[j].x }); tx.updateElement(hs[j].id, { x: hs[i].x }); }).then(() => { try { ed.select([arg]); } catch (_) {} }).catch(_report);
            }
        },
        branch(hid, k, field, value) {
            const ed = _curEd; if (!ed) return;
            const hel = ed.get(hid); if (!hel || !Array.isArray(hel.props.branches)) return;
            const br = _clone(hel.props.branches);
            if (field === 'remove') {
                if (br.length <= 2) { _toast('A heading needs at least two outcomes.', 'warning'); return; }
                br.splice(k, 1);
                ed.change('Remove an outcome from ' + (hel.label || 'heading'), tx => { tx.updateElement(hid, { props: { branches: br } }); }).then(() => ed.select([hid])).catch(_report);
                return;
            }
            if (!br[k]) return;
            if (field === 'label') br[k].label = String(value || '').trim() || br[k].label;
            else {
                const raw = String(value == null ? '' : value).trim();
                if (raw === '' && field === 'pc') delete br[k].pc;
                else { const v = Number(raw); if (!(v >= 0 && v <= 1)) { _toast('Enter a probability between 0 and 1 (for example 1e-3).', 'warning'); ed.select([hid]); return; } br[k][field] = v; }
            }
            ed.change('Edit outcome ' + (k + 1) + ' of ' + (hel.label || 'heading'), tx => { tx.updateElement(hid, { props: { branches: br } }); }).then(() => ed.select([hid])).catch(_report);
        },
        exportSvg() {
            const ed = _curEd, t = _sel(); if (!ed || !t) return;
            try {
                const svg = ed.toSvg();
                const blob = new Blob([svg], { type: 'image/svg+xml' });
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = String(t.id) + '_event_tree.svg';
                document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
                _toast('Saved ' + a.download + '.', 'success', 2600);
            } catch (e) { _toast('Could not export the picture: ' + (e && e.message || e), 'error'); }
        },
        editor() { return _curEd; },
    };

    window._etaLinkUi = function (tid, bi, pageId) {
        const r = window.etaLinkBarrier(tid, bi, pageId);
        if (!r.ok) { try { showToast(r.err, 'error', 3000); } catch (_) {} return; }
        if (_curEd) _curEd.reload();
        _renderSide();
    };
    window._etaDeleteUi = async function (tid) {
        if (!(await slConfirm('Delete ' + tid + '? Undo brings it back.', { danger: true, okText: 'Delete' }))) return;
        try { if (typeof pushUndo === 'function') pushUndo('Delete event tree ' + tid); } catch (_) {}
        const r = window.etaDelete(tid); if (r.ok) { _selId = null; _render(); }
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
            '<label style="' + L + '">Signature (required)</label><input id="eta-aby" type="text" style="' + F + '" placeholder="Your name" value="' + _esc(_me()) + '">' +
            '<div style="display:flex; justify-content:flex-end; margin-top:16px;"><button class="ckpt-m-btn" id="eta-ago" style="font-size:13px; padding:6px 18px;">Record assessment</button></div>' +
            '<p id="eta-aerr" style="color:#8E2A2A; font-size:12px; font-weight:600; margin:8px 0 0; display:none;"></p>' +
            '</div></div>';
        document.body.appendChild(m);
        document.getElementById('eta-ago').onclick = function () {
            try { if (typeof pushUndo === 'function') pushUndo('Assess event tree outcome'); } catch (_) {}
            const r = window.etaAssess(tid, key, document.getElementById('eta-sev').value, document.getElementById('eta-fc').value, document.getElementById('eta-note').value, document.getElementById('eta-aby').value);
            const err = document.getElementById('eta-aerr');
            if (!r.ok) { err.textContent = r.err; err.style.display = 'block'; return; }
            m.remove();
            if (_curEd) _curEd.reload();
            _renderSide();
        };
        m.style.display = 'flex';
        setTimeout(() => m.classList.add('show'), 10);
    };
    // A Cancel in the change acknowledgement puts the project back: redraw from it.
    try { window.addEventListener('sl:change-ack', e => { if (e && e.detail && e.detail.decision === 'canceled') { const v = document.getElementById('view-eta'); if (v && v.style.display !== 'none') _render(); } }); } catch (_) {}
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
                // remember it as the last tab, so a project apply (Cancel change, reload) comes back here
                if (tabId === 'eta') { try { localStorage.setItem('safetyLab.ui.lastTab.v1', 'eta'); } catch (_) {} _render(); }
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
                        _store().forEach(t => { let ev; try { ev = etaEvaluate(t); } catch (e) { rows.push({ 'Tree': t.id, 'Path': 'REFUSED', 'Sequence': String(e.message || e).slice(0, 100), 'P(path)': '', 'Freq /FH': '', 'Severity': '', 'Linked FC': '', 'Coupling': '' }); return; } ev.outcomes.forEach(o => rows.push({
                            'Tree': t.id, 'Path': o.key, 'Sequence': o.seq.join(' → ').slice(0, 100),
                            'P(path)': o.prob.toExponential(3), 'Freq /FH': o.freq.toExponential(3),
                            'Severity': o.severity || 'unassessed', 'Linked FC': o.linkedFcId || '—',
                            'Coupling': ev.coupled ? 'yes' : 'no',
                            'End state': (o.label || '') + (o.transferTo ? ' → ' + o.transferTo : ''),
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
    // v2.0: the pure diagram model, for the bow-tie generator and tests.
    window.SLEta = {
        version: '2.0', toModel, fromModel, sequenceCount: etaSequenceCount, branchesOf: _branchesOf, headingId: _hid,
        isMulti: _isMulti, pNotOk: _pNotOk, keyOf: _keyOf, GEOMETRY: G, DIAGRAM_MAX_SEQUENCES, MAX_OUTCOMES: ETA_MAX_OUTCOMES,
        complete: _complete, render: _render,
    };
})();
