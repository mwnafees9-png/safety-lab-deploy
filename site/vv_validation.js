// ============================================================================
// vv_validation.js — v2.0 — ARP-G2: the full §5.4.3/§5.4.4 validation split.
//
// Verification asks "does the implementation meet the requirement?" — the app
// already tracks that per requirement. Validation asks the PRIOR question:
// "is the requirement itself correct and complete?" v1 (Phase P4/M11) built
// the matrix, the computed lints, one attestation signature, set-level
// computed checks, and the PSSA gate. v2 closes the G-2 residue: the §5.4.3
// correctness checklist is now AUTHORED, not auto-ticked.
//
// THE TWO LANES, kept honestly apart:
//   · COMPUTED (advisory seeds) — the deterministic lint battery over text
//     and metadata (stated, unambiguous, verifiable, traceable, rationale,
//     unique). A machine can catch a missing 'shall'; it cannot judge
//     whether the requirement is RIGHT. So the lints inform — they never
//     conclude on correctness by themselves.
//   · AUTHORED (§5.4.3) — six correctness aspects each demanding a human
//     answer (yes / no / n-a, with a note wherever the answer isn't a plain
//     yes): correct, complete-as-a-statement, unambiguous, feasible,
//     consistent, right-level. Original wording throughout — the standard
//     is cited, never reproduced.
//
// RIGOR scaled to consequence (v1 rule, now with teeth): a requirement
// tracing to Cat/Haz demands the authored checklist COMPLETE plus an
// independent signed attestation; Major demands checklist + signed
// attestation; below that the computed checks suffice. An attestation
// signed while the authored checklist is incomplete leaves the requirement
// AWAITING — a signature cannot stand in for the judgment it is supposed
// to cover. An authored NO renders the requirement FLAGGED until the text
// is fixed or the answer withdrawn. A signature over a failing lint stays
// FLAGGED (v1 rule, kept).
//
// COMPLETENESS per SET (§5.4.4): the five computed set checks remain, and
// gain the sixth the clause actually demands — an AUTHORED set-level
// completeness judgment with a stated basis, because "nothing is missing"
// is a human conclusion, not a computable one. Signed, withdrawable,
// basis required (≥15 chars — "looks complete" is not a basis).
//
// INV-40 (advisory): validation-before-verification discipline — no
// requirement claims 'Verified' while its own validation is not VALID.
// Verifying an invalid requirement is confirming the wrong thing well.
//
// Born modular (zero monolith edits): classic script, wraps switchTab for
// the 'val-matrix' tab, pushes one auto item onto the PSSA checklist at
// load, annotates golden-thread gaps. All state under projectConfig.reqVal
// (attestations at the req key; authored answers under .checklist; set
// judgments under '__set:<scope>') — rides existing persistence, no new
// persistence sites.
// ============================================================================
(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function _store() {
        if (typeof projectConfig === 'undefined') return {};
        if (!projectConfig.reqVal) projectConfig.reqVal = {};
        return projectConfig.reqVal;
    }
    const _key = r => String(r.internalId != null ? r.internalId : (r.id || r.traceId));

    // ------------------------------------------------------------ the sets
    // A "set" is the unit of completeness evaluation: the aircraft-level
    // requirement set, or one system's requirement set.
    function vvSets() {
        const sets = [{ scope: 'aircraft', name: 'Aircraft-level set', reqs: (typeof acFhaData !== 'undefined' && typeof acReqData !== 'undefined') ? (acReqData || []) : [] }];
        ((typeof systemsData !== 'undefined' && systemsData) || []).forEach(s =>
            sets.push({ scope: s.id, name: (s.name || s.id) + ' set', reqs: s.req || [], sys: s }));
        return sets;
    }

    // ------------------------------------------------- severity-scaled rigor
    // Worst severity among the failure conditions this requirement traces to.
    function _tracedFcs(r) {
        const traces = Array.isArray(r.traceIds) ? r.traceIds : (r.traceId ? [r.traceId] : []);
        const out = [];
        traces.forEach(t => {
            const ac = ((typeof acFhaData !== 'undefined' && acFhaData) || []).find(f => f.fcId === t || String(f.internalId) === String(t));
            if (ac) { out.push(ac); return; }
            ((typeof systemsData !== 'undefined' && systemsData) || []).forEach(s => {
                const f = (s.fha || []).find(x => x.fcId === t || String(x.internalId) === String(t));
                if (f) out.push(f);
            });
        });
        return out;
    }
    const _SEV_RANK = { 'Catastrophic': 4, 'Hazardous': 3, 'Major': 2, 'Minor': 1, 'No Safety Effect': 0 };
    function vvRigor(r) {
        const fcs = _tracedFcs(r);
        let worst = null, rank = -1;
        fcs.forEach(f => { const k = _SEV_RANK[f.severity] || 0; if (k > rank) { rank = k; worst = f.severity; } });
        if (rank >= 3) return { level: 'independent', worst, label: 'authored checklist + independent attestation', why: 'traces to a ' + worst + ' condition' };
        if (rank === 2) return { level: 'attest', worst, label: 'authored checklist + attestation', why: 'traces to a Major condition' };
        return { level: 'basic', worst: worst || '—', label: 'automatic checks', why: fcs.length ? 'worst traced severity ' + worst : 'no traced failure condition' };
    }

    // --------------------------------------------------- correctness lints
    // COMPUTED lane — deterministic, text-and-metadata only, ADVISORY SEEDS
    // for the authored checklist. Original wording throughout.
    const _VAGUE = ['as appropriate', 'as required', 'as necessary', 'adequate', 'sufficient',
        'minimize', 'maximize', 'optimal', 'user-friendly', 'robust', 'quickly', 'easily',
        'if possible', 'where practical', 'best effort', 'etc.', 'and/or', 'reasonable', 'state of the art'];
    const _PLACEHOLDER = /\bTBD\b|\bTBS\b|\bTODO\b|\?\?\?|<[^>]*>/i;

    const LINTS = [
        { id: 'stated', label: 'Stated', run: (r) => {
            const t = (r.text || '').trim();
            if (!t) return { pass: false, detail: 'empty requirement text' };
            if (_PLACEHOLDER.test(t)) return { pass: false, detail: 'placeholder marker in text' };
            if (!/\bshall\b|\bmust\b|\bshall not\b/i.test(t)) return { pass: false, detail: 'no imperative (shall/must)' };
            return { pass: true, detail: 'imperative statement, no placeholders' };
        } },
        { id: 'unambiguous', label: 'Unambiguous', run: (r) => {
            const t = (r.text || '').toLowerCase();
            const hits = _VAGUE.filter(v => t.includes(v));
            return hits.length ? { pass: false, detail: 'vague wording: "' + hits.slice(0, 3).join('", "') + '"' }
                : { pass: true, detail: 'no vague-term hits' };
        } },
        { id: 'verifiable', label: 'Verifiable', run: (r) => {
            const hasMethod = !!(r.verifMethod || '').trim();
            const quantified = /\d/.test(r.text || '');
            if (hasMethod) return { pass: true, detail: 'verification method: ' + r.verifMethod };
            if ((r.type || '') === 'Quantitative' && !quantified) return { pass: false, detail: 'quantitative type with no number in text' };
            return { pass: quantified, detail: quantified ? 'quantified in text (no method yet)' : 'no verification method and no quantification' };
        } },
        { id: 'traceable', label: 'Traceable', run: (r) => {
            const traces = Array.isArray(r.traceIds) ? r.traceIds : (r.traceId ? [r.traceId] : []);
            if (!traces.length) return { pass: false, detail: 'no parent trace' };
            const resolved = _tracedFcs(r).length;
            return { pass: true, detail: traces.join(', ') + (resolved ? ' (resolves to ' + resolved + ' FC(s))' : ' (not an FC reference)') };
        } },
        { id: 'rationale', label: 'Rationale', run: (r) => {
            const derived = (r.level || '') === 'Derived' || !!r.derivationType;
            const has = !!(r.rat || '').trim();
            if (derived && !has) return { pass: false, detail: 'derived requirement without rationale' };
            return { pass: true, detail: has ? 'recorded' : 'not derived — rationale optional' };
        } },
        { id: 'unique', label: 'Unique in set', run: (r, set) => {
            const norm = t => (t || '').toLowerCase().replace(/\s+/g, ' ').trim();
            const mine = norm(r.text);
            const dup = (set.reqs || []).find(o => _key(o) !== _key(r) && norm(o.text) === mine && mine);
            return dup ? { pass: false, detail: 'duplicate of ' + (dup.id || dup.traceId || ('#' + dup.internalId)) }
                : { pass: true, detail: 'no duplicate text' };
        } },
    ];

    function reqValChecklist(r, set) {
        return LINTS.map(l => { try { return Object.assign({ id: l.id, label: l.label }, l.run(r, set || { reqs: [] })); }
            catch (e) { return { id: l.id, label: l.label, pass: false, detail: 'lint error: ' + e.message }; } });
    }

    // ----------------------------------- §5.4.3 AUTHORED correctness aspects
    // Six judgments a machine cannot make. Answered yes / no / n-a; 'no' and
    // 'n-a' demand a note (a bare NO is a complaint, not a finding; a bare
    // N-A is an evasion). Answers live under the attestation record's
    // .checklist and are covered by the eventual signature.
    const ASPECTS = [
        { id: 'correct',    label: 'Correct',        q: 'Technically right — it states what the design intent actually needs, not an approximation of it.' },
        { id: 'complete',   label: 'Complete',       q: 'Complete as a statement — conditions, modes and tolerances included; nothing left to be assumed.' },
        { id: 'unambig',    label: 'Unambiguous',    q: 'A second reader lands on the same meaning without asking the author.' },
        { id: 'feasible',   label: 'Feasible',       q: 'A realizable design can satisfy it within the program’s physics and constraints.' },
        { id: 'consistent', label: 'Consistent',     q: 'No conflict with any other requirement in this set or its parents.' },
        { id: 'level',      label: 'Right level',    q: 'Belongs to THIS set — not a parent restatement, not a child’s design choice.' },
    ];

    function vvChecklistState(r) {
        const rec = _store()[_key(r)] || {};
        const cl = rec.checklist || {};
        const answered = ASPECTS.filter(a => cl[a.id] && cl[a.id].ans);
        const noes = ASPECTS.filter(a => cl[a.id] && cl[a.id].ans === 'no');
        return { answers: cl, answered: answered.length, total: ASPECTS.length,
                 noes: noes.map(a => a.label), complete: answered.length === ASPECTS.length && noes.length === 0 };
    }

    // ------------------------------------------------ conclusion per req
    // valid    — lints pass AND the rigor's demands are met (high rigor:
    //            authored checklist complete + signature[+independence])
    // awaiting — lints pass, checklist or attestation still owed
    // flagged  — an authored NO stands, or a signature sits on a failing
    //            lint (neither lane can override the other)
    // open     — lints failing, nothing signed
    function reqValConclusion(r, set) {
        const rows = reqValChecklist(r, set);
        const autosPass = rows.every(x => x.pass);
        const rigor = vvRigor(r);
        const att = _store()[_key(r)];
        const attested = !!(att && att.by);
        const independent = !!(att && att.independent);
        const cl = vvChecklistState(r);
        let conclusion, detail;
        if (cl.noes.length) { conclusion = 'flagged'; detail = 'authored checklist records NO on ' + cl.noes.join(', ') + ' — fix the requirement or withdraw the answer'; }
        else if (attested && !autosPass) { conclusion = 'flagged'; detail = 'signed over a failing check — resolve the lint or withdraw'; }
        else if (!autosPass) { conclusion = 'open'; detail = rows.filter(x => !x.pass).length + ' check(s) failing'; }
        else if (rigor.level === 'basic') { conclusion = 'valid'; detail = 'automatic checks pass (' + rigor.label + ')'; }
        else if (!cl.complete) { conclusion = 'awaiting'; detail = '§5.4.3 checklist authored ' + cl.answered + '/' + cl.total + (attested ? ' — the signature cannot stand in for the judgment it covers' : '') + ' (' + rigor.why + ')'; }
        else if (!attested) { conclusion = 'awaiting'; detail = 'checklist authored — attestation owed (' + rigor.why + ')'; }
        else if (rigor.level === 'independent' && !independent) { conclusion = 'awaiting'; detail = 'attested by ' + att.by + ' — independence not claimed'; }
        else { conclusion = 'valid'; detail = 'authored 6/6 · attested ' + att.by + (independent ? ' (independent)' : '') + ' · checks pass'; }
        return { conclusion, detail, rigor, autosPass, attested, independent, att, rows, checklist: cl };
    }

    // ---------------------------------------- authored-answer author action
    // The ONLY write path for §5.4.3 answers. 'no'/'n-a' refuse without a
    // note. Withdrawing = answering again with ans=null.
    function vvAnswer(scopeKey, reqKey, aspectId, ans, note) {
        const set = vvSets().find(s => s.scope === scopeKey);
        const r = set && (set.reqs || []).find(x => _key(x) === String(reqKey));
        const aspect = ASPECTS.find(a => a.id === aspectId);
        if (!r || !aspect) return false;
        const st = _store();
        const rec = st[String(reqKey)] = st[String(reqKey)] || {};
        rec.checklist = rec.checklist || {};
        if (ans == null) { delete rec.checklist[aspectId]; _saveAndRender(); return true; }
        if (ans !== 'yes' && ans !== 'no' && ans !== 'na') return false;
        if ((ans === 'no' || ans === 'na') && !(note || '').trim()) {
            _toast(ans === 'no' ? 'A NO needs its note — what exactly is wrong? A bare NO is a complaint, not a finding.'
                                : 'N-A needs its note — why does this aspect not apply here?', 'error');
            return false;
        }
        rec.checklist[aspectId] = { ans: ans, note: (note || '').trim() || undefined, at: new Date().toISOString() };
        _saveAndRender();
        return true;
    }

    // --------------------------------------------------- attestation action
    async function vvAttest(scopeKey, reqKey) {
        const set = vvSets().find(s => s.scope === scopeKey);
        const r = set && (set.reqs || []).find(x => _key(x) === String(reqKey));
        if (!r) return;
        const st = _store();
        const rec = st[String(reqKey)];
        if (rec && rec.by) {
            if (confirm('Withdraw the validation attestation on ' + (r.id || r.traceId || reqKey) + '? (Authored checklist answers are kept.)')) {
                delete rec.by; delete rec.at; delete rec.independent;
                if (r.valArtifact && /^VAL-CHK/.test(r.valArtifact)) delete r.valArtifact;
                if (typeof saveState === 'function') saveState();
                renderValMatrix();
            }
            return;
        }
        const c0 = reqValConclusion(r, set);
        if (c0.rigor.level !== 'basic' && !c0.checklist.complete &&
            !confirm('The §5.4.3 checklist is authored ' + c0.checklist.answered + '/' + c0.checklist.total +
                (c0.checklist.noes.length ? ' with NO standing on ' + c0.checklist.noes.join(', ') : '') +
                '. You can sign now, but the conclusion stays ' + (c0.checklist.noes.length ? 'FLAGGED' : 'AWAITING') +
                ' until the checklist is complete — the signature cannot stand in for the judgment. Continue?')) return;
        if (!c0.autosPass && !confirm('Correctness checks are FAILING on this requirement. Signing now records the attestation but the conclusion stays FLAGGED. Continue?')) return;
        const by = window.prompt('Attest correctness of ' + (r.id || r.traceId || reqKey) + ' — signature (name):', '');
        if (!by || !by.trim()) return;
        let independent = false;
        if (c0.rigor.level === 'independent')
            independent = confirm('This requirement ' + c0.rigor.why + ' — independence of the validator is demanded.\n\nOK = I did not author this requirement (independent)\nCancel = record without the independence claim');
        st[String(reqKey)] = Object.assign(rec || {}, { by: by.trim(), at: new Date().toISOString(), independent });
        // Record the evidence reference on the row itself (elicited act, signed
        // above) — the 4754B objectives matrix reads it as validation evidence.
        if (reqValConclusion(r, set).conclusion === 'valid') r.valArtifact = 'VAL-CHK ' + new Date().toISOString().slice(0, 10);
        if (typeof saveState === 'function') saveState();
        renderValMatrix();
    }

    // ------------------------------------------------ completeness per set
    // The §5.4.4 idea, originally worded: a requirement can be individually
    // pristine while the SET is wrong by omission. Five computed checks +
    // the authored judgment omission actually demands.
    function vvSetJudgment(scope) { return _store()['__set:' + scope] || null; }
    function vvJudgeSet(scope, by, basis) {
        const st = _store();
        const k = '__set:' + scope;
        if (st[k] && st[k].by) { delete st[k]; _saveAndRender(); return true; }   // withdraw
        if (!(by || '').trim()) { _toast('The completeness judgment needs a signature.', 'error'); return false; }
        if (String(basis || '').trim().length < 15) {
            _toast('Not recorded — a completeness judgment needs its BASIS (≥15 chars): what was reviewed to conclude nothing is missing? "Looks complete" is not a basis.', 'error');
            return false;
        }
        st[k] = { by: String(by).trim(), basis: String(basis).trim(), at: new Date().toISOString() };
        _saveAndRender();
        return true;
    }

    function vvSetCompleteness(set) {
        const checks = [];
        const push = (id, label, pass, detail) => checks.push({ id, label, pass, detail });
        const reqs = set.reqs || [];
        const traceSet = new Set();
        reqs.forEach(r => (Array.isArray(r.traceIds) ? r.traceIds : (r.traceId ? [r.traceId] : [])).forEach(t => traceSet.add(t)));

        // 1. every severe condition in scope carries at least one requirement
        const fcs = set.scope === 'aircraft'
            ? ((typeof acFhaData !== 'undefined' && acFhaData) || [])
            : ((set.sys && set.sys.fha) || []);
        const severe = fcs.filter(f => (_SEV_RANK[f.severity] || 0) >= 2);
        const uncovered = severe.filter(f => !traceSet.has(f.fcId) && !traceSet.has(String(f.internalId)));
        push('coverage', 'Every Major-or-worse condition has a requirement', severe.length === 0 || uncovered.length === 0,
            severe.length ? (uncovered.length ? uncovered.map(f => f.fcId).join(', ') + ' uncovered of ' + severe.length : severe.length + ' condition(s) all covered') : 'no Major+ conditions in scope');

        // 2. every derived requirement justifies its existence
        const derived = reqs.filter(r => (r.level || '') === 'Derived' || r.derivationType);
        const bare = derived.filter(r => !(r.rat || '').trim());
        push('derived', 'Derived requirements carry rationale', bare.length === 0,
            derived.length ? (bare.length ? bare.length + ' of ' + derived.length + ' without rationale' : derived.length + ' derived, all justified') : 'no derived requirements');

        // 3. assumptions routed to the requirements lane are dispositioned
        const asms = set.scope === 'aircraft'
            ? ((typeof acAssumptionsData !== 'undefined' && acAssumptionsData) || [])
            : ((set.sys && set.sys.asm) || []);
        const routed = asms.filter(a => /req/i.test(a.routeTo || ''));
        const undisposed = routed.filter(a => (a.state || 'proposed') === 'proposed');
        push('assumptions', 'Requirement-routed assumptions dispositioned', undisposed.length === 0,
            routed.length ? (undisposed.length ? undisposed.length + ' of ' + routed.length + ' still proposed' : routed.length + ' routed, all dispositioned') : 'none routed to requirements');

        // 4. no requirement in the set fails its own correctness checks
        const failing = reqs.filter(r => !reqValChecklist(r, set).every(x => x.pass));
        push('correctness', 'No requirement fails correctness checks', failing.length === 0,
            reqs.length ? (failing.length ? failing.length + ' of ' + reqs.length + ' with failing checks' : reqs.length + ' requirement(s) clean') : 'set is empty');

        // 5. every high-rigor requirement carries its owed authored checklist + attestation
        const owed = reqs.filter(r => { const c = reqValConclusion(r, set); return c.conclusion === 'awaiting' || c.conclusion === 'flagged'; });
        push('rigor', 'Severity-scaled authored checklists + attestations in place', owed.length === 0,
            owed.length ? owed.length + ' requirement(s) awaiting or flagged' : 'all rigor demands met');

        // 6. §5.4.4 — the AUTHORED completeness judgment. Omission is a human
        // conclusion; the five computed checks inform it, never replace it.
        const j = vvSetJudgment(set.scope);
        push('judgment', 'Authored completeness judgment (§5.4.4)', !!(j && j.by),
            j && j.by ? 'judged by ' + j.by + ' · ' + String(j.at).slice(0, 10) + ' — ' + j.basis
                      : 'not yet judged — a set is complete when someone with the whole picture SAYS so, with a basis');

        const pass = checks.every(c => c.pass);
        return { scope: set.scope, name: set.name, checks, pass, reqCount: reqs.length };
    }

    // Program-wide roll-up (drives the PSSA gate item and evidence package).
    function vvProgramPosture() {
        const sets = vvSets().map(s => vvSetCompleteness(s));
        const allReqs = vvSets().flatMap(s => (s.reqs || []).map(r => ({ r, s })));
        const reqs = allReqs.map(x => reqValConclusion(x.r, x.s));
        const n = c => reqs.filter(x => x.conclusion === c).length;
        const authoredDone = allReqs.filter(x => vvChecklistState(x.r).complete).length;
        const judged = vvSets().filter(s => { const j = vvSetJudgment(s.scope); return j && j.by; }).length;
        return { sets, total: reqs.length, valid: n('valid'), awaiting: n('awaiting'), flagged: n('flagged'), open: n('open'),
            authored: authoredDone, judgedSets: judged,
            setsPassing: sets.filter(s => s.pass).length };
    }

    // ---- INV-40 (advisory): validation before verification ------------------
    if (typeof invRegister === 'function') {
        invRegister({ id: 'INV-40', sev: 'advisory',
            name: '§5.4 validation before verification — no requirement claims Verified while its own validation is not VALID',
            run: function () {
                try {
                    const pairs = vvSets().flatMap(s => (s.reqs || []).map(r => ({ r, s })));
                    if (!pairs.length) return { checked: 0, fails: [] };
                    const fails = [];
                    pairs.forEach(x => {
                        const vs = String(x.r.verifStatus || '').toLowerCase();
                        if (vs !== 'verified') return;
                        const c = reqValConclusion(x.r, x.s);
                        if (c.conclusion !== 'valid')
                            fails.push((x.r.id || x.r.traceId || ('#' + x.r.internalId)) + ' is Verified but its validation is ' + c.conclusion.toUpperCase() + ' — ' + c.detail + ' (verifying an invalid requirement is confirming the wrong thing well)');
                    });
                    return { checked: pairs.length, fails: fails };
                } catch (_) { return { checked: 0, fails: [] }; }
            } });
    }

    // --------------------------------------------------------------- page
    const _saveAndRender = () => { try { if (typeof saveState === 'function') saveState(); else if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} try { renderValMatrix(); _renderPop(); } catch (_) {} };
    const _toast = (m, t) => { try { if (typeof showToast === 'function') { showToast(m, t || 'info', 5200); return; } } catch (_) {} };

    window._vvValScope = window._vvValScope || 'aircraft';
    window.vvValSetScope = function (s) { window._vvValScope = s; renderValMatrix(); };

    const _CHIP_STYLE = { valid: ['#1D6E3E', 'rgba(52,199,89,0.13)'], awaiting: ['#9A6200', 'rgba(255,149,0,0.12)'],
        flagged: ['#8E2A2A', 'rgba(255,59,48,0.12)'], open: ['var(--color-text-tertiary)', 'var(--color-surface-2)'] };
    const _stamp = (txt, kind) => { const [fg, bg] = _CHIP_STYLE[kind] || _CHIP_STYLE.open;
        return '<span style="display:inline-block; padding:2px 8px; font-size:10px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:' + fg + '; background:' + bg + '; border-radius:var(--r-full);">' + _esc(txt) + '</span>'; };

    // ---- the §5.4.3 authoring pop-over --------------------------------------
    let _popCtx = null;   // { scope, reqKey }
    function _closePop() { const el = document.getElementById('vv-543-pop'); if (el && el.parentNode) el.parentNode.removeChild(el); _popCtx = null; }
    window.vv543Open = function (scopeKey, reqKey) { _popCtx = { scope: scopeKey, reqKey: String(reqKey) }; _renderPop(); };
    window.vv543Close = _closePop;
    window.vv543Answer = function (aspectId, ans) {
        if (!_popCtx) return;
        let note = '';
        if (ans === 'no') { note = window.prompt('NO on this aspect — what exactly is wrong? (required)', '') || ''; if (!note.trim()) return; }
        if (ans === 'na') { note = window.prompt('N-A — why does this aspect not apply here? (required)', '') || ''; if (!note.trim()) return; }
        vvAnswer(_popCtx.scope, _popCtx.reqKey, aspectId, ans, note);
    };
    window.vv543Withdraw = function (aspectId) { if (_popCtx) vvAnswer(_popCtx.scope, _popCtx.reqKey, aspectId, null); };
    function _renderPop() {
        if (!_popCtx || typeof document === 'undefined') return;
        const set = vvSets().find(s => s.scope === _popCtx.scope);
        const r = set && (set.reqs || []).find(x => _key(x) === _popCtx.reqKey);
        if (!r) { _closePop(); return; }
        const c = reqValConclusion(r, set);
        let div = document.getElementById('vv-543-pop');
        if (!div) {
            div = document.createElement('div');
            div.id = 'vv-543-pop';
            div.style.cssText = 'position:fixed; inset:0; z-index:9000; background:rgba(20,26,36,.35); display:flex; align-items:center; justify-content:center;';
            div.addEventListener('click', function (e) { if (e.target === div) _closePop(); });
            document.body.appendChild(div);
        }
        const seedRows = c.rows.map(x => '<span class="u-mono" title="' + _esc(x.detail) + '" style="font-size:9.5px; margin-right:8px; color:' + (x.pass ? 'var(--color-text-tertiary)' : '#8E2A2A') + ';">' + (x.pass ? '✓' : '✗') + ' ' + _esc(x.label) + '</span>').join('');
        div.innerHTML =
            '<div style="background:var(--color-surface-1,#fff); border:1px solid var(--color-border-strong,#c9d1dc); border-radius:10px; max-width:640px; width:94%; max-height:86vh; overflow:auto; padding:16px 20px; box-shadow:0 12px 40px rgba(0,0,0,.25);">' +
            '<div style="display:flex; justify-content:space-between; align-items:center;">' +
            '<b style="font-size:13.5px;">§5.4.3 correctness — ' + _esc(r.id || r.traceId || ('#' + r.internalId)) + '</b>' +
            '<button style="font-size:12px; border:1px solid var(--color-border,#dde3ea); background:none; border-radius:4px; cursor:pointer; padding:2px 9px;" onclick="vv543Close()">✕</button></div>' +
            '<div style="font-size:11.5px; color:var(--color-text-secondary); margin-top:6px; line-height:1.5;">' + _esc((r.text || '').slice(0, 220)) + ((r.text || '').length > 220 ? '…' : '') + '</div>' +
            '<div style="font-size:10px; color:var(--color-text-tertiary); margin-top:8px;">Computed seeds (advisory — they inform your judgment, they are not it): ' + seedRows + '</div>' +
            '<table class="data-table" style="width:100%; font-size:12px; margin-top:10px;"><tbody>' +
            ASPECTS.map(a => {
                const cur = (c.checklist.answers || {})[a.id];
                const btn = (ans, lbl, col) => '<button class="u-mono" style="font-size:10px; font-weight:700; cursor:pointer; margin-left:4px; padding:2px 9px; border-radius:5px; border:1px solid ' + col + '; color:' + (cur && cur.ans === ans ? '#fff' : col) + '; background:' + (cur && cur.ans === ans ? col : col + '0D') + ';" onclick="vv543Answer(\'' + a.id + '\',\'' + ans + '\')">' + lbl + '</button>';
                return '<tr><td style="width:44%;"><b style="font-size:11.5px;">' + _esc(a.label) + '</b><br><span style="font-size:10.5px; color:var(--color-text-secondary);">' + _esc(a.q) + '</span>' +
                    (cur && cur.note ? '<br><span style="font-size:10px; color:var(--color-text-tertiary);">note: ' + _esc(cur.note) + '</span>' : '') + '</td>' +
                    '<td style="text-align:right; white-space:nowrap;">' + btn('yes', 'YES', '#1D6E3E') + btn('no', 'NO', '#8E2A2A') + btn('na', 'N-A', '#7C8797') +
                    (cur ? '<a href="#" style="font-size:9.5px; margin-left:7px;" onclick="vv543Withdraw(\'' + a.id + '\'); return false;">withdraw</a>' : '') + '</td></tr>';
            }).join('') + '</tbody></table>' +
            '<div style="font-size:10.5px; color:var(--color-text-tertiary); margin-top:8px;">Authored ' + c.checklist.answered + '/' + c.checklist.total +
            (c.checklist.noes.length ? ' · <b style="color:#8E2A2A;">NO standing on ' + _esc(c.checklist.noes.join(', ')) + '</b>' : '') +
            ' · conclusion: ' + _stamp(c.conclusion.toUpperCase(), c.conclusion) +
            '<br>The signature (attest… in the matrix) covers these answers — sign after authoring, not instead of it.</div></div>';
    }

    // ---- §5.4.4 judge action ------------------------------------------------
    window.vvJudgeSetUI = function (scope) {
        const j = vvSetJudgment(scope);
        if (j && j.by) {
            if (confirm('Withdraw the §5.4.4 completeness judgment on this set (by ' + j.by + ')?')) vvJudgeSet(scope);
            return;
        }
        const by = window.prompt('Judge this requirement SET complete (§5.4.4) — signature (name):', '');
        if (!by || !by.trim()) return;
        const basis = window.prompt('BASIS for the judgment — what did you review to conclude nothing is missing? (≥15 chars)', '');
        if (basis == null) return;
        vvJudgeSet(scope, by, basis);
    };

    function renderValMatrix() {
        if (typeof document === 'undefined') return;
        const host = document.getElementById('val-matrix-host');
        if (!host) return;
        const sets = vvSets();
        if (!sets.some(s => s.scope === window._vvValScope)) window._vvValScope = 'aircraft';
        const set = sets.find(s => s.scope === window._vvValScope) || sets[0];
        const posture = vvProgramPosture();

        let html = '<div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:14px;">' + sets.map(s => {
            const active = s.scope === set.scope;
            return '<button onclick="vvValSetScope(\'' + _esc(s.scope) + '\')" style="border:1px solid var(--color-border-hair); border-radius:999px; padding:4px 12px; font-size:12px; cursor:pointer;' +
                (active ? ' background:var(--color-accent, #3b82f6); color:#fff;' : ' background:var(--color-surface-2); color:var(--color-text-secondary);') + '">' +
                _esc(s.name) + ' (' + (s.reqs || []).length + ')</button>';
        }).join('') + '</div>';

        const tile = (lbl, val, sub) => '<div style="border:1px solid var(--color-border-hair); border-radius:10px; padding:12px 14px; background:var(--color-surface-1);">' +
            '<div style="font-size:11px; color:var(--color-text-tertiary); text-transform:uppercase; letter-spacing:0.05em;">' + lbl + '</div>' +
            '<div style="font-size:24px; font-weight:700; margin-top:2px;">' + val + '</div>' +
            (sub ? '<div style="font-size:11px; color:var(--color-text-tertiary);">' + sub + '</div>' : '') + '</div>';
        html += '<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:16px;">' +
            tile('Requirements (program)', posture.total, posture.valid + ' valid · ' + posture.awaiting + ' awaiting · ' + posture.flagged + ' flagged') +
            tile('§5.4.3 authored', posture.authored + '/' + posture.total, 'checklists fully authored') +
            tile('Sets complete', posture.setsPassing + '/' + posture.sets.length, posture.judgedSets + '/' + posture.sets.length + ' judged (§5.4.4)') +
            tile('Flagged', posture.flagged, 'authored NO or signature over a failing check') + '</div>';

        // ---- the set's completeness panel ----
        const comp = vvSetCompleteness(set);
        const j = vvSetJudgment(set.scope);
        html += '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-bottom:18px;">' +
            '<div style="padding:9px 14px; border-bottom:2px solid var(--color-text-primary); display:flex; justify-content:space-between; align-items:center;">' +
            '<b>Set completeness — ' + _esc(comp.name) + '</b><span>' +
            '<button class="ckpt-m-btn" style="font-size:10.5px; padding:1px 9px; margin-right:8px;" onclick="vvJudgeSetUI(\'' + _esc(set.scope) + '\')">' + (j && j.by ? 'withdraw judgment…' : 'judge complete (§5.4.4)…') + '</button>' +
            _stamp(comp.pass ? 'COMPLETE' : 'INCOMPLETE', comp.pass ? 'valid' : 'awaiting') + '</span></div>' +
            '<table class="data-table" style="width:100%; font-size:12.5px;"><tbody>' +
            comp.checks.map(c => '<tr><td style="width:26px; text-align:center;">' + (c.pass ? '✓' : '✗') + '</td>' +
                '<td>' + _esc(c.label) + '</td><td style="color:var(--color-text-secondary);">' + _esc(c.detail) + '</td></tr>').join('') +
            '</tbody></table></div>';

        // ---- per-requirement matrix ----
        if (!(set.reqs || []).length) {
            html += '<p style="color:var(--color-text-tertiary); font-size:13px;">No requirements in this set yet.</p>';
        } else {
            html += '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr>' +
                '<th>Requirement</th><th>Traces</th><th>Rigor</th>' +
                LINTS.map(l => '<th style="font-size:10px;">' + _esc(l.label) + '</th>').join('') +
                '<th>§5.4.3 authored</th><th>Attestation</th><th>Conclusion</th></tr></thead><tbody>';
            (set.reqs || []).forEach(r => {
                const c = reqValConclusion(r, set);
                html += '<tr><td><b>' + _esc(r.id || r.traceId || ('#' + r.internalId)) + '</b><br><span style="font-size:11px; color:var(--color-text-secondary);">' + _esc((r.text || '').slice(0, 90)) + ((r.text || '').length > 90 ? '…' : '') + '</span></td>' +
                    '<td class="u-mono" style="font-size:11px;">' + _esc((Array.isArray(r.traceIds) ? r.traceIds : (r.traceId ? [r.traceId] : [])).join(', ') || '—') +
                    (c.rigor.worst && c.rigor.worst !== '—' ? '<br><span style="font-size:10px; color:var(--color-text-tertiary);">' + _esc(c.rigor.worst) + '</span>' : '') + '</td>' +
                    '<td style="font-size:11px;">' + _esc(c.rigor.label) + '</td>' +
                    c.rows.map(x => '<td style="text-align:center;" title="' + _esc(x.detail) + '">' +
                        (x.pass ? '✓' : '<span style="color:#8E2A2A; font-weight:700;">✗</span>') + '</td>').join('') +
                    '<td style="white-space:nowrap;">' +
                        (c.rigor.level === 'basic'
                            ? '<span style="font-size:10.5px; color:var(--color-text-tertiary);">not demanded</span>'
                            : '<span class="u-mono" style="font-size:11px;' + (c.checklist.complete ? ' color:#1D6E3E; font-weight:700;' : (c.checklist.noes.length ? ' color:#8E2A2A; font-weight:700;' : '')) + '">' + c.checklist.answered + '/' + c.checklist.total + (c.checklist.noes.length ? ' ✗' : '') + '</span>') +
                        ' <button class="ckpt-m-btn" style="font-size:10px; padding:1px 7px;" onclick="vv543Open(\'' + _esc(set.scope) + '\',\'' + _esc(_key(r)) + '\')">author…</button></td>' +
                    '<td>' + (c.attested
                        ? '<span style="font-size:11px;">' + _esc(c.att.by) + (c.independent ? ' <span title="independence claimed">⚖</span>' : '') + '</span> <a href="#" style="font-size:10px;" onclick="vvAttest(\'' + _esc(set.scope) + '\',\'' + _esc(_key(r)) + '\'); return false;">withdraw</a>'
                        : (c.rigor.level === 'basic' ? '<span style="font-size:11px; color:var(--color-text-tertiary);">not demanded</span>'
                            : '<button class="ckpt-m-btn" style="font-size:10.5px; padding:1px 8px;" onclick="vvAttest(\'' + _esc(set.scope) + '\',\'' + _esc(_key(r)) + '\')">attest…</button>')) + '</td>' +
                    '<td title="' + _esc(c.detail) + '">' + _stamp(c.conclusion.toUpperCase(), c.conclusion) + '</td></tr>';
            });
            html += '</tbody></table>';
        }
        html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">Validation asks whether the requirement is RIGHT; verification (V&amp;V roll-up) asks whether it is MET. ' +
            'Two lanes: computed lints SEED, the §5.4.3 checklist is AUTHORED — six judgments a machine cannot make — and the signature covers the authored answers, never replaces them. ' +
            'Rigor scales with the worst traced severity: Cat/Haz ⇒ checklist + independent attestation, Major ⇒ checklist + attestation, below ⇒ automatic checks. ' +
            'Set completeness (§5.4.4) is five computed checks plus the authored judgment omission demands. INV-40 watches the order: validate before you verify.</p>';
        host.innerHTML = html;
    }

    // -------------------------------------- runtime graft 1: the PSSA gate
    (function graftGate() {
        try {
            if (typeof CKPT_CHECKLISTS === 'undefined' || !Array.isArray(CKPT_CHECKLISTS.PSSA)) return;
            if (CKPT_CHECKLISTS.PSSA.some(i => i.id === 'val')) return;
            CKPT_CHECKLISTS.PSSA.push({
                id: 'val', kind: 'auto', ref: '§5.4',
                label: 'Requirement sets validated (correctness + completeness)',
                eval: () => {
                    const p = vvProgramPosture();
                    if (!p.total) return { pass: false, detail: 'no requirements to validate' };
                    const bad = p.flagged + p.open + p.awaiting;
                    return { pass: p.setsPassing === p.sets.length && bad === 0,
                        detail: p.valid + '/' + p.total + ' valid · ' + p.authored + '/' + p.total + ' authored · ' + p.setsPassing + '/' + p.sets.length + ' sets complete (' + p.judgedSets + ' judged)' + (p.flagged ? ' · ' + p.flagged + ' FLAGGED' : '') };
                },
            });
        } catch (_) {}
    })();

    // ------------------------- runtime graft 2: golden-thread gap annotation
    (function wrapGaps() {
        if (typeof window._gtvReportGaps !== 'function' || window._gtvReportGaps._vvValWrapped) return;
        const orig = window._gtvReportGaps;
        const wrapped = function () {
            let out = orig.apply(this, arguments);
            try {
                const p = vvProgramPosture();
                const owed = p.awaiting + p.flagged;
                if (owed) out += ' ' + owed + ' requirement(s) not yet validated at the rigor their severity demands — the thread ends on requirements whose correctness is unconfirmed.';
            } catch (_) {}
            return out;
        };
        wrapped._vvValWrapped = true;
        window._gtvReportGaps = wrapped;
    })();

    // ------------------------------------------------- navigation wrapper
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._vvValWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-val-matrix');
                if (v) v.style.display = (tabId === 'val-matrix') ? 'block' : 'none';
                const s = document.getElementById('snav-val-matrix');
                if (s) s.classList.toggle('snav-active', tabId === 'val-matrix');
                if (tabId === 'val-matrix') renderValMatrix();
            } catch (_) {}
            return r;
        };
        wrapped._vvValWrapped = true;
        window.switchTab = wrapped;
    })();

    // ------------------------------------------------------------ exports
    window.reqValChecklist = reqValChecklist;
    window.reqValConclusion = reqValConclusion;
    window.vvSetCompleteness = vvSetCompleteness;
    window.vvProgramPosture = vvProgramPosture;
    window.vvSets = vvSets;
    window.vvRigor = vvRigor;
    window.vvAttest = vvAttest;
    window.vvAnswer = vvAnswer;
    window.vvChecklistState = vvChecklistState;
    window.vvJudgeSet = vvJudgeSet;
    window.vvSetJudgment = vvSetJudgment;
    window.VV_ASPECTS = ASPECTS;
    window.renderValMatrix = renderValMatrix;
})();
