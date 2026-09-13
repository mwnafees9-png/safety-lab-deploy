// ============================================================================
// ml_assurance.js — v0.2 — the AI/ML learning-assurance lane (#8–#13, epic).
// v0.2 (2 Aug 2026): learned-vs-learning + safety-continuum position on every
// constituent — the FAA AI roadmap principle, declared never derived; findings
// scale with the declared tier. Additive: v0.1 rows render as "not declared".
//
// WHAT THIS IS, AND WHAT IT IS NOT
// ---------------------------------------------------------------------------
// Every other AI file in this product is OUR AI, governed, drafting for the
// engineer. This lane is the opposite axis: assuring SOMEBODY ELSE'S machine-
// learning constituent as a certifiable item, in the shape ARP6983 / ED-324
// (joint SAE G-34 · EUROCAE WG-114) asks for.
//
// It records and traces. It does not assess a model. The tool computes no
// accuracy, no loss, no representativeness metric, and never will from this
// lane — those belong to the ML team's own toolchain, and a safety tool that
// pretended otherwise would be inviting a number nobody could defend. What it
// owns is the argument around the model: what the constituent is allowed to do,
// the envelope it is claimed valid inside, and where its data came from.
//
// THREE REGISTERS, IN THE ORDER THE STANDARD BUILDS THEM
// ---------------------------------------------------------------------------
//   1. Constituents (MLC) — each ML item, the function it implements, its
//      assurance level, and the aircraft/system function it hangs off. This is
//      what puts the model on the golden thread instead of beside it.
//   2. ODD — the Operational Design Domain: the declared dimensions and ranges
//      the constituent is claimed valid within. Everything downstream is only
//      as good as this declaration, so it is authored first and explicitly.
//   3. Datasets — training / validation / test, with source, lineage, and the
//      representativeness claim stated AGAINST a named ODD. Independence of the
//      test set from training is a yes/no the engineer asserts, not a
//      calculation, and it is recorded as such.
//
// HONEST LIMITS, stated in the UI as well as here:
//   · ARP6983 / ED-324 is a method standard. It is not by itself an accepted
//     means of compliance, and this lane does not make it one.
//   · An assurance level recorded here is a DECLARATION, not an allocation —
//     nothing in this file derives a level from severity. That derivation is
//     the standard's own open question and we will not pre-empt it.
//   · Representativeness is a claim with a rationale, never a computed score.
//
// BORN MODULAR: new file, own view, own nav entry, own store. The only edits
// elsewhere are the lane entry, the three serialisers, the two load paths, the
// new-project reset, and the switchTab registry — that last one because a view
// missing from it is a view switchTab cannot hide (found live, 20 Jul).
//
// Kill switch: the lane is opt-in and OFF by default in program_plan.js. No
// certification basis turns it on, because none yet requires it.
// ============================================================================
(function () {
    'use strict';
    if (typeof window === 'undefined') return;
    if (window.__slMlAssuranceWired) return;
    window.__slMlAssuranceWired = true;

    // ---- store -------------------------------------------------------------
    // Shape is fixed here and mirrored in the serialisers; see _mlDefault().
    function _mlDefault() {
        return { constituents: [], odd: [], datasets: [], monitors: [], capture: [], captureEnabled: false, counter: 1 };
    }
    function DATA() {
        try {
            if (typeof mlData === 'undefined' || !mlData || typeof mlData !== 'object') return null;
            if (!Array.isArray(mlData.constituents)) mlData.constituents = [];
            if (!Array.isArray(mlData.odd)) mlData.odd = [];
            if (!Array.isArray(mlData.datasets)) mlData.datasets = [];
            if (!Array.isArray(mlData.monitors)) mlData.monitors = [];
            if (!Array.isArray(mlData.capture)) mlData.capture = [];
            if (typeof mlData.captureEnabled !== 'boolean') mlData.captureEnabled = false;
            if (typeof mlData.counter !== 'number') mlData.counter = 1;
            return mlData;
        } catch (_) { return null; }
    }
    function _save() {
        try { if (typeof _dirtySinceSave !== 'undefined') _dirtySinceSave = true; } catch (_) {}
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        try { render(); } catch (_) {}
    }
    function _esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
    }
    function _toast(msg, kind, ms) {
        try { if (typeof showToast === 'function') showToast(msg, kind || 'info', ms || 3500); } catch (_) {}
    }
    function _nextId(prefix) {
        const d = DATA(); if (!d) return prefix + '-1';
        const n = d.counter++;
        return prefix + '-' + String(n).padStart(3, '0');
    }

    // ---- vocabulary --------------------------------------------------------
    // Assurance levels are the standard's, recorded as declared. Deliberately
    // NOT derived from severity — see the header.
    const LEVELS = ['not set', 'AL1', 'AL2', 'AL3', 'AL4', 'AL5'];
    const DATASET_ROLES = ['training', 'validation', 'test'];
    // 2 Aug 2026 — the FAA roadmap's named guiding principle: DISTINGUISH the
    // assurance methodology for learned (static — trained offline, frozen in
    // service, assured as designed) vs learning (adapts in the operational
    // environment — the learning itself needs assuring). Figure 5 puts the two
    // years apart in certification readiness, and a register that cannot say
    // which one it holds cannot choose a methodology. DECLARED, never inferred;
    // undeclared is a finding, not a default (the A8 discipline).
    const BEHAVIOURS = ['not declared', 'learned (static)', 'learning (adapts in service)'];
    // Continuum position scales the evidence this register demands — the
    // roadmap's incremental / lower-risk-first principles need a recorded
    // position to scale against. The tier names are the EASA AI Concept Paper's
    // published taxonomy (Level 1A–3B, human augmentation → autonomy), cited as
    // such rather than a vocabulary invented here. Declared, never derived.
    const CONTINUUM = ['not declared',
        'L1A — human augmentation', 'L1B — human cognitive assistance',
        'L2A — human-AI cooperation', 'L2B — human-AI collaboration',
        'L3A — supervised autonomy', 'L3B — non-supervised autonomy'];
    function _continuumRank(v) { const i = CONTINUUM.indexOf(String(v || '')); return i > 0 ? i : 0; }
    function _isLearning(c) { return String(c && c.behaviour || '') === BEHAVIOURS[2]; }

    // ---- authoring ---------------------------------------------------------
    const author = {
        addConstituent: function (name, implementsFn, level, oddId, note, behaviour, continuum) {
            const d = DATA(); if (!d) return;
            if (!String(name || '').trim()) { _toast('An ML constituent needs a name.', 'error'); return; }
            d.constituents.push({
                id: _nextId('MLC'), name: String(name).trim(),
                implementsFn: String(implementsFn || '').trim(),
                level: LEVELS.indexOf(level) > 0 ? level : 'not set',
                oddId: String(oddId || '').trim(),
                note: String(note || '').trim(),
                // Both DECLARED. An unrecognised or absent value is 'not declared'
                // and stays visible as a finding — never silently coerced to the
                // convenient answer (a 'learned' default would be exactly the
                // silent-default disease A7/A8 dug out of the FHA lane).
                behaviour: BEHAVIOURS.indexOf(behaviour) > 0 ? behaviour : BEHAVIOURS[0],
                continuum: CONTINUUM.indexOf(continuum) > 0 ? continuum : CONTINUUM[0]
            });
            _save();
        },
        addOdd: function (dimension, range, units, rationale) {
            const d = DATA(); if (!d) return;
            if (!String(dimension || '').trim()) { _toast('An ODD entry needs a dimension.', 'error'); return; }
            if (!String(range || '').trim()) { _toast('An ODD dimension without a range declares nothing.', 'error'); return; }
            d.odd.push({
                id: _nextId('ODD'), dimension: String(dimension).trim(),
                range: String(range).trim(), units: String(units || '').trim(),
                rationale: String(rationale || '').trim()
            });
            _save();
        },
        addDataset: function (name, role, source, oddId, repClaim, independent) {
            const d = DATA(); if (!d) return;
            if (!String(name || '').trim()) { _toast('A dataset needs a name.', 'error'); return; }
            if (DATASET_ROLES.indexOf(role) < 0) { _toast('Role must be training, validation or test.', 'error'); return; }
            d.datasets.push({
                id: _nextId('DS'), name: String(name).trim(), role: role,
                source: String(source || '').trim(),
                oddId: String(oddId || '').trim(),
                repClaim: String(repClaim || '').trim(),
                // Independence of the test set from training is an ENGINEER'S
                // ASSERTION. Nothing here inspects the data, so it is stored as a
                // claim and rendered as one.
                independent: independent === true ? true : (independent === false ? false : null)
            });
            _save();
        },
        remove: function (kind, id) {
            const d = DATA(); if (!d || !d[kind]) return;
            const i = d[kind].findIndex(function (r) { return r.id === id; });
            if (i < 0) return;
            // Removing an ODD entry that a dataset or constituent cites would
            // leave a dangling reference — refuse and say which.
            if (kind === 'odd') {
                const users = []
                    .concat(d.datasets.filter(function (x) { return x.oddId === id; }).map(function (x) { return x.id; }))
                    .concat(d.constituents.filter(function (x) { return x.oddId === id; }).map(function (x) { return x.id; }))
                    .concat(d.monitors.filter(function (x) { return x.oddId === id; }).map(function (x) { return x.id; }));
                if (users.length) { _toast('ODD ' + id + ' is cited by ' + users.join(', ') + ' — detach those first.', 'error', 5000); return; }
            }
            // Same rule one level up: an observation that points at a deleted
            // constituent is a finding about nothing.
            if (kind === 'constituents') {
                const obs = d.monitors.filter(function (x) { return x.mlcId === id; }).map(function (x) { return x.id; });
                if (obs.length) { _toast('Constituent ' + id + ' is cited by observation ' + obs.join(', ') + ' — remove those first.', 'error', 5000); return; }
            }
            d[kind].splice(i, 1);
            _save();
        }
    };


    // ======================================================================
    // #11 — IN-SERVICE MONITORING (drift), fed by FRACAS
    // ----------------------------------------------------------------------
    // A trained model does not fail like a bearing. It degrades because the
    // world moved out from under the data it was fitted to — so the safety
    // question in service is not "did it break" but "is the aircraft still
    // inside the ODD this constituent was declared valid within".
    //
    // The tool does NOT classify drift. Nothing here reads a distribution or
    // computes a divergence; it could not, and a number invented at this layer
    // would be indefensible. What it does is let an engineer attach an
    // in-service observation to a constituent and to the ODD dimension they
    // believe it challenges, and record the verdict THEY reached.
    //
    // The FRACAS link is deliberately a REFERENCE, not a copy: the incident
    // stays the case manager's record in projectConfig.ram, and this register
    // points at it. Copying would give two truths that drift apart.
    // ======================================================================
    const MON_SOURCES = ['fracas', 'flight test', 'simulation', 'operator report', 'monitoring campaign'];
    const MON_VERDICTS = ['watch', 'outside ODD', 'retrain candidate', 'closed'];

    function fracasIncidents() {
        // Read-only view of the FRACAS case manager, so an observation can cite
        // a real incident id rather than a retyped description.
        const out = [];
        try {
            const recs = (projectConfig && projectConfig.ram && projectConfig.ram.fieldRows) || [];
            recs.forEach(function (f) {
                (f.incidents || []).forEach(function (inc) {
                    out.push({ id: inc.id, on: (f.name || f.item || f.id || 'record'), date: inc.date || '', desc: inc.desc || '' });
                });
            });
        } catch (_) {}
        return out;
    }

    function addMonitor(mlcId, oddId, source, observed, verdict, rationale, fracasRef) {
        const d = DATA(); if (!d) return;
        if (!d.constituents.some(function (c) { return c.id === mlcId; })) {
            _toast('An observation must attach to a known ML constituent.', 'error'); return;
        }
        if (!String(observed || '').trim()) { _toast('Record what was actually observed.', 'error'); return; }
        if (MON_VERDICTS.indexOf(verdict) < 0) { _toast('Verdict must be one of: ' + MON_VERDICTS.join(', '), 'error'); return; }
        // "Outside ODD" and "retrain candidate" are consequential calls — they
        // are the ones a reviewer will ask you to justify, so they need words.
        if ((verdict === 'outside ODD' || verdict === 'retrain candidate') && String(rationale || '').trim().length < 10) {
            _toast('"' + verdict + '" needs a rationale of at least 10 characters — it is a claim, not a tick.', 'error', 5000); return;
        }
        d.monitors.push({
            id: _nextId('MON'), mlcId: mlcId, oddId: String(oddId || '').trim(),
            source: MON_SOURCES.indexOf(source) >= 0 ? source : 'operator report',
            observed: String(observed).trim(), verdict: verdict,
            rationale: String(rationale || '').trim(),
            fracasRef: String(fracasRef || '').trim(),
            at: new Date().toISOString().slice(0, 10)
        });
        _save();
    }

    // ======================================================================
    // #12 — GOVERNED EXPERT-INTERACTION CAPTURE (the seed substrate)
    // ----------------------------------------------------------------------
    // What makes a safety-engineering model possible one day is not more text —
    // it is the record of a qualified engineer CORRECTING a draft, which is the
    // one signal the public internet does not contain.
    //
    // Collecting it is also the point at which a tool can quietly become a
    // liability, so the gates come first and they are hard:
    //
    //   · OFF by default, per project. Nothing is captured until somebody
    //     deliberately turns it on for THIS project.
    //   · REFUSED outright on an export-controlled project. Corrections to
    //     controlled technical data are controlled technical data; there is no
    //     version of this that is worth the risk, so the flag cannot even be
    //     set while isITARControlled is true.
    //   · Records stay IN THE PROJECT. Nothing in this module transmits
    //     anything anywhere. It rides the project snapshot like every other
    //     register, and travels only where the project already travels.
    //
    // And the honest limit: this is a SUBSTRATE, not a pipeline. Nothing trains
    // on it today, and #13 — a model that learns from it — is blocked on having
    // enough of it to be worth the attempt.
    // ======================================================================
    function _itarControlled() {
        try { return !!(typeof projectConfig !== 'undefined' && projectConfig && projectConfig.isITARControlled); }
        catch (_) { return false; }
    }
    function captureAllowed() { return !_itarControlled(); }
    function setCaptureEnabled(on) {
        const d = DATA(); if (!d) return false;
        if (on && _itarControlled()) {
            _toast('Refused — this project is flagged export-controlled. Corrections to controlled technical data are controlled technical data.', 'error', 7000);
            d.captureEnabled = false; _save(); return false;
        }
        d.captureEnabled = !!on;
        _toast(d.captureEnabled ? 'Expert-correction capture ON for this project — records stay in the project.' : 'Capture off.', 'info', 4000);
        _save();
        return d.captureEnabled;
    }
    // The single entry point other modules call when an engineer edits an AI
    // draft. Silent no-op unless the project opted in — a capture that happens
    // by accident is the failure mode worth engineering against.
    function recordCorrection(feature, drafted, corrected, by, note) {
        const d = DATA(); if (!d) return false;
        if (!d.captureEnabled) return false;
        if (_itarControlled()) { d.captureEnabled = false; return false; }   // belt and braces
        const a = String(drafted == null ? '' : drafted);
        const b = String(corrected == null ? '' : corrected);
        if (!a && !b) return false;
        if (a === b) return false;                                           // acceptance is not a correction
        d.capture.push({
            id: _nextId('CAP'), feature: String(feature || 'unknown'),
            drafted: a, corrected: b,
            by: String(by || '').trim() || (function () {
                try { return (typeof _signoffReviewerName === 'function' && _signoffReviewerName()) || ''; } catch (_) { return ''; }
            })(),
            note: String(note || '').trim(),
            at: new Date().toISOString()
        });
        _save();
        return true;
    }

    // ---- completeness ------------------------------------------------------
    // Every finding is a pointer at something a reviewer will ask about. None of
    // them is a pass/fail on the model itself.
    function findings() {
        const d = DATA(); if (!d) return [];
        const out = [];
        d.constituents.forEach(function (c) {
            if (c.level === 'not set') out.push({ sev: 'open', id: c.id, text: 'No assurance level declared.' });
            if (!c.oddId) out.push({ sev: 'open', id: c.id, text: 'No ODD cited — the validity envelope is undeclared.' });
            if (!c.implementsFn) out.push({ sev: 'advisory', id: c.id, text: 'Not linked to a function — this constituent is off the thread.' });
            // 2 Aug 2026 — the learned/learning distinction and the continuum
            // position scale what this register demands. All deterministic reads
            // of DECLARED fields; nothing is inferred about the model itself.
            const rank = _continuumRank(c.continuum);
            if (!c.behaviour || c.behaviour === BEHAVIOURS[0]) {
                out.push({ sev: 'open', id: c.id, text: 'Learned vs learning not declared — the assurance methodology cannot be chosen until it is (FAA AI roadmap guiding principle; the two are years apart in certification readiness).' });
            }
            if (!c.continuum || c.continuum === CONTINUUM[0]) {
                out.push({ sev: 'advisory', id: c.id, text: 'Continuum position not declared (EASA Concept Paper L1A–L3B) — the evidence this register demands cannot scale until it is.' });
            }
            if (_isLearning(c)) {
                // The learning itself needs assuring: in service, the only
                // evidence stream this register holds is the monitoring lane —
                // so for a learning constituent its absence is OPEN, not the
                // advisory a static constituent gets below.
                if (!d.monitors.some(function (m) { return m.mlcId === c.id; })) {
                    out.push({ sev: 'open', id: c.id, text: 'Declared LEARNING (adapts in service) with no in-service observation — the adaptation is running unwatched, and for a learning constituent that is the assurance case, not housekeeping.' });
                }
                if (rank >= 5 && !String(c.note || '').trim()) {
                    out.push({ sev: 'open', id: c.id, text: 'Learning constituent declared at an autonomy tier (' + c.continuum + ') with no note recording the learning-assurance strategy — the combination the roadmap places furthest from certification readiness, undocumented.' });
                }
            }
            if (rank >= 4 && c.level === 'not set') {
                out.push({ sev: 'open', id: c.id, text: 'Declared at ' + c.continuum + ' with no assurance level — the higher the continuum tier, the less an undeclared level can stand.' });
            }
            if (rank >= 4 && !c.oddId) {
                out.push({ sev: 'open', id: c.id, text: 'Declared at ' + c.continuum + ' with no ODD — collaboration/autonomy tiers with an undeclared envelope invert the incremental principle.' });
            }
        });
        DATASET_ROLES.forEach(function (r) {
            if (!d.datasets.some(function (x) { return x.role === r; })) {
                out.push({ sev: 'open', id: '—', text: 'No ' + r + ' dataset recorded.' });
            }
        });
        d.datasets.forEach(function (ds) {
            if (!ds.oddId) out.push({ sev: 'open', id: ds.id, text: 'Representativeness is not claimed against any ODD.' });
            else if (!ds.repClaim) out.push({ sev: 'open', id: ds.id, text: 'Cites an ODD but states no representativeness rationale.' });
            if (ds.role === 'test' && ds.independent !== true) {
                out.push({ sev: 'open', id: ds.id, text: 'Test-set independence from training is not asserted.' });
            }
        });
        if (d.constituents.length && !d.odd.length) {
            out.push({ sev: 'open', id: '—', text: 'No ODD declared for the program.' });
        }
        // #11 — a constituent nobody is watching in service. For LEARNING
        // constituents this is already raised as OPEN above (their adaptation is
        // the assurance case) — skip them here so one condition is one finding.
        d.constituents.forEach(function (c) {
            if (_isLearning(c)) return;
            if (!d.monitors.some(function (m) { return m.mlcId === c.id; })) {
                out.push({ sev: 'advisory', id: c.id, text: 'No in-service observation recorded — nothing is watching this constituent for drift.' });
            }
        });
        d.monitors.forEach(function (m) {
            if (m.verdict === 'outside ODD') {
                out.push({ sev: 'open', id: m.id, text: 'Observed outside the declared ODD and not closed — the validity claim does not currently hold.' });
            }
            if (m.verdict === 'retrain candidate') {
                out.push({ sev: 'open', id: m.id, text: 'Flagged as a retrain candidate — open until the retrained constituent is re-declared.' });
            }
        });
        return out;
    }

    // ---- rendering ---------------------------------------------------------
    function _table(cols, rows, empty) {
        if (!rows.length) return '<div style="padding:14px;font-size:12px;color:var(--color-text-tertiary);">' + _esc(empty) + '</div>';
        return '<table class="data-table" style="width:100%;font-size:12.5px;"><thead><tr>' +
            cols.map(function (c) { return '<th style="text-align:left;">' + _esc(c) + '</th>'; }).join('') +
            '<th></th></tr></thead><tbody>' + rows.join('') + '</tbody></table>';
    }
    function _rm(kind, id) {
        return '<td style="text-align:right;"><button class="ckpt-m-btn" style="font-size:11px;padding:2px 8px;" ' +
            'onclick="try{ML_ASSURANCE.remove(\'' + kind + '\',\'' + _esc(id) + '\')}catch(e){}">Remove</button></td>';
    }

    function render() {
        if (typeof document === 'undefined') return;
        const host = document.getElementById('view-mlas');
        if (!host) return;
        const d = DATA();
        if (!d) { host.innerHTML = '<div style="padding:30px;color:var(--color-text-tertiary);">Project not loaded.</div>'; return; }

        const oddOpts = d.odd.map(function (o) { return '<option value="' + _esc(o.id) + '">' + _esc(o.id + ' · ' + o.dimension) + '</option>'; }).join('');

        const mlcRows = d.constituents.map(function (c) {
            const odd = c.oddId ? c.oddId : '<span style="color:var(--color-text-tertiary);">none</span>';
            const beh = (!c.behaviour || c.behaviour === BEHAVIOURS[0])
                ? '<span style="color:#B03030;font-weight:700;" title="The FAA roadmap distinguishes the assurance methodology for the two — undeclared means no methodology can be chosen.">not declared</span>'
                : (_isLearning(c)
                    ? '<span style="color:#8A6D00;font-weight:700;" title="Adapts in the operational environment — the learning itself needs assuring; in-service monitoring is the assurance case, not housekeeping.">learning</span>'
                    : '<span title="Trained offline, frozen in service — assured as designed.">learned</span>');
            const cont = (!c.continuum || c.continuum === CONTINUUM[0])
                ? '<span style="color:var(--color-text-tertiary);">not declared</span>'
                : '<span class="mono" title="' + _esc(c.continuum) + ' — EASA AI Concept Paper taxonomy, declared not derived.">' + _esc(String(c.continuum).split(' — ')[0]) + '</span>';
            return '<tr><td class="mono">' + _esc(c.id) + '</td><td><b>' + _esc(c.name) + '</b>' +
                (c.note ? '<br><span style="font-size:11px;color:var(--color-text-secondary);">' + _esc(c.note) + '</span>' : '') + '</td>' +
                '<td>' + _esc(c.implementsFn || '—') + '</td>' +
                '<td class="mono">' + _esc(c.level) + '</td>' +
                '<td>' + beh + '</td><td>' + cont + '</td>' +
                '<td class="mono">' + odd + '</td>' + _rm('constituents', c.id) + '</tr>';
        });
        const oddRows = d.odd.map(function (o) {
            return '<tr><td class="mono">' + _esc(o.id) + '</td><td><b>' + _esc(o.dimension) + '</b></td>' +
                '<td class="mono">' + _esc(o.range) + (o.units ? ' ' + _esc(o.units) : '') + '</td>' +
                '<td style="font-size:11.5px;color:var(--color-text-secondary);">' + _esc(o.rationale || '—') + '</td>' + _rm('odd', o.id) + '</tr>';
        });
        const dsRows = d.datasets.map(function (ds) {
            const ind = ds.role !== 'test' ? '—'
                : (ds.independent === true ? '<span style="color:#0E7A3C;font-weight:700;">asserted</span>'
                                           : '<span style="color:#B03030;font-weight:700;">not asserted</span>');
            return '<tr><td class="mono">' + _esc(ds.id) + '</td><td><b>' + _esc(ds.name) + '</b></td>' +
                '<td class="mono">' + _esc(ds.role) + '</td><td>' + _esc(ds.source || '—') + '</td>' +
                '<td class="mono">' + _esc(ds.oddId || '—') + '</td>' +
                '<td style="font-size:11.5px;color:var(--color-text-secondary);">' + _esc(ds.repClaim || '—') + '</td>' +
                '<td style="font-size:11.5px;">' + ind + '</td>' + _rm('datasets', ds.id) + '</tr>';
        });

        // ---- #11 in-service monitoring -----------------------------------
        const mlcOpts = d.constituents.map(function (c) {
            return '<option value="' + _esc(c.id) + '">' + _esc(c.id + ' · ' + c.name) + '</option>';
        }).join('');
        const inc = fracasIncidents();
        const frOpts = inc.map(function (x) {
            return '<option value="' + _esc(x.id) + '">' + _esc(x.id + ' · ' + x.on + (x.date ? ' · ' + x.date : '')) + '</option>';
        }).join('');
        const VCOL = { 'watch': '#8A6D00', 'outside ODD': '#B03030', 'retrain candidate': '#B03030', 'closed': '#0E7A3C' };
        const monRows = d.monitors.map(function (m) {
            const c = d.constituents.filter(function (x) { return x.id === m.mlcId; })[0];
            const vc = VCOL[m.verdict] || 'var(--color-text-primary)';
            return '<tr><td class="mono">' + _esc(m.id) + '</td>' +
                '<td class="mono">' + _esc(m.mlcId) + (c ? '<br><span style="font-size:11px;color:var(--color-text-secondary);">' + _esc(c.name) + '</span>' : '') + '</td>' +
                '<td class="mono">' + _esc(m.oddId || '—') + '</td>' +
                '<td style="font-size:11.5px;">' + _esc(m.source) + (m.fracasRef ? '<br><span class="mono" style="font-size:11px;">' + _esc(m.fracasRef) + '</span>' : '') + '</td>' +
                '<td style="font-size:11.5px;">' + _esc(m.observed) +
                    (m.rationale ? '<br><span style="font-size:11px;color:var(--color-text-secondary);">' + _esc(m.rationale) + '</span>' : '') + '</td>' +
                '<td style="font-size:11.5px;font-weight:700;color:' + vc + ';">' + _esc(m.verdict) + '</td>' +
                '<td class="mono" style="font-size:11px;color:var(--color-text-tertiary);">' + _esc(m.at || '') + '</td>' +
                _rm('monitors', m.id) + '</tr>';
        });

        // ---- #12 expert-correction capture -------------------------------
        const capOK = captureAllowed();
        const capOn = !!d.captureEnabled;
        function _trunc(t, n) {
            const v = String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
            return v.length > n ? v.slice(0, n - 1) + '…' : v;
        }
        const capRows = d.capture.map(function (c) {
            return '<tr><td class="mono">' + _esc(c.id) + '</td>' +
                '<td style="font-size:11.5px;">' + _esc(c.feature) + '</td>' +
                '<td style="font-size:11.5px;color:var(--color-text-secondary);">' + _esc(_trunc(c.drafted, 90)) + '</td>' +
                '<td style="font-size:11.5px;">' + _esc(_trunc(c.corrected, 90)) + '</td>' +
                '<td style="font-size:11.5px;">' + _esc(c.by || '—') + '</td>' +
                '<td class="mono" style="font-size:11px;color:var(--color-text-tertiary);">' + _esc(String(c.at || '').slice(0, 10)) + '</td>' +
                _rm('capture', c.id) + '</tr>';
        });

        const f = findings();
        const fBlock = f.length
            ? '<ul style="margin:6px 0 0;padding-left:18px;font-size:12px;color:var(--color-text-secondary);">' +
                f.map(function (x) {
                    return '<li><span class="mono" style="font-size:11px;">' + _esc(x.id) + '</span> — ' + _esc(x.text) +
                        (x.sev === 'advisory' ? ' <i>(advisory)</i>' : '') + '</li>';
                }).join('') + '</ul>'
            : '<div style="font-size:12px;color:#0E7A3C;margin-top:6px;">Nothing outstanding in this register.</div>';

        host.innerHTML =
        '<h3>AI/ML learning assurance</h3>' +
        '<p style="font-size:12.5px;color:var(--color-text-secondary);margin:2px 0 6px;">' +
          'The argument around a machine-learning constituent, in the shape ARP6983 / ED-324 asks for: what it is allowed to do, ' +
          'the envelope it is claimed valid inside, and where its data came from.</p>' +
        '<div style="border:1px solid var(--color-border-strong);background:var(--color-surface-2);padding:9px 13px;margin:0 0 16px;">' +
          '<b style="font-size:11.5px;">What this lane will not do.</b> ' +
          '<span style="font-size:12px;color:var(--color-text-secondary);">It records and traces; it does not assess a model. ' +
          'No accuracy, loss or representativeness score is computed here — those belong to your ML toolchain, and a safety tool that ' +
          'invented them would be handing you a number you could not defend. Assurance levels are <b>declared</b>, never derived from severity. ' +
          'ARP6983 / ED-324 is a method standard and is not by itself an accepted means of compliance.</span></div>' +

        '<div style="border:1px solid var(--color-border-strong);margin-bottom:16px;">' +
          '<div style="padding:8px 13px;border-bottom:2px solid var(--color-text-primary);"><b>1 · ML constituents</b> ' +
            '<span style="font-size:11px;color:var(--color-text-tertiary);">the item under assurance, and the function it implements</span></div>' +
          _table(['ID', 'Constituent', 'Implements', 'Level', 'Behavior', 'Continuum', 'ODD'], mlcRows, 'No ML constituent recorded yet.') +
          '<div style="padding:9px 13px;border-top:1px solid var(--color-border-hair);display:flex;gap:7px;flex-wrap:wrap;align-items:center;">' +
            '<input id="mlas-c-name" placeholder="Name (e.g. Runway detector)" style="flex:2;min-width:170px;padding:5px 8px;font-size:12px;">' +
            '<input id="mlas-c-fn" placeholder="Implements function (e.g. SF-07)" style="flex:1;min-width:150px;padding:5px 8px;font-size:12px;">' +
            '<select id="mlas-c-level" style="padding:5px 8px;font-size:12px;">' + LEVELS.map(function (l) { return '<option>' + l + '</option>'; }).join('') + '</select>' +
            '<select id="mlas-c-beh" title="FAA AI roadmap: learned (static, offline-trained) vs learning (adapts in service) take DIFFERENT assurance methodologies. Declare which this is." style="padding:5px 8px;font-size:12px;">' +
              BEHAVIOURS.map(function (b) { return '<option>' + _esc(b) + '</option>'; }).join('') + '</select>' +
            '<select id="mlas-c-cont" title="Safety-continuum position (EASA AI Concept Paper L1A–L3B). Declared, never derived — it scales what this register demands." style="padding:5px 8px;font-size:12px;">' +
              CONTINUUM.map(function (x) { return '<option>' + _esc(x) + '</option>'; }).join('') + '</select>' +
            '<select id="mlas-c-odd" style="padding:5px 8px;font-size:12px;"><option value="">ODD — none</option>' + oddOpts + '</select>' +
            '<button class="ckpt-m-btn" onclick="try{ML_ASSURANCE._addC()}catch(e){}">Add</button></div>' +
        '</div>' +

        '<div style="border:1px solid var(--color-border-strong);margin-bottom:16px;">' +
          '<div style="padding:8px 13px;border-bottom:2px solid var(--color-text-primary);"><b>2 · Operational Design Domain</b> ' +
            '<span style="font-size:11px;color:var(--color-text-tertiary);">the declared envelope — everything downstream is only as good as this</span></div>' +
          _table(['ID', 'Dimension', 'Range', 'Rationale'], oddRows, 'No ODD declared. A constituent without one has an undeclared validity envelope.') +
          '<div style="padding:9px 13px;border-top:1px solid var(--color-border-hair);display:flex;gap:7px;flex-wrap:wrap;align-items:center;">' +
            '<input id="mlas-o-dim" placeholder="Dimension (e.g. Visibility)" style="flex:1;min-width:150px;padding:5px 8px;font-size:12px;">' +
            '<input id="mlas-o-range" placeholder="Range (e.g. 800–10000)" style="flex:1;min-width:130px;padding:5px 8px;font-size:12px;">' +
            '<input id="mlas-o-units" placeholder="Units (m)" style="width:90px;padding:5px 8px;font-size:12px;">' +
            '<input id="mlas-o-rat" placeholder="Rationale" style="flex:2;min-width:170px;padding:5px 8px;font-size:12px;">' +
            '<button class="ckpt-m-btn" onclick="try{ML_ASSURANCE._addO()}catch(e){}">Add</button></div>' +
        '</div>' +

        '<div style="border:1px solid var(--color-border-strong);margin-bottom:16px;">' +
          '<div style="padding:8px 13px;border-bottom:2px solid var(--color-text-primary);"><b>3 · Data management</b> ' +
            '<span style="font-size:11px;color:var(--color-text-tertiary);">training · validation · test, each claimed against an ODD</span></div>' +
          _table(['ID', 'Dataset', 'Role', 'Source', 'ODD', 'Representativeness claim', 'Independent'], dsRows,
                 'No datasets recorded. The standard expects training, validation and test to be distinguishable.') +
          '<div style="padding:9px 13px;border-top:1px solid var(--color-border-hair);display:flex;gap:7px;flex-wrap:wrap;align-items:center;">' +
            '<input id="mlas-d-name" placeholder="Dataset name" style="flex:1;min-width:150px;padding:5px 8px;font-size:12px;">' +
            '<select id="mlas-d-role" style="padding:5px 8px;font-size:12px;">' + DATASET_ROLES.map(function (r) { return '<option>' + r + '</option>'; }).join('') + '</select>' +
            '<input id="mlas-d-src" placeholder="Source / lineage" style="flex:1;min-width:150px;padding:5px 8px;font-size:12px;">' +
            '<select id="mlas-d-odd" style="padding:5px 8px;font-size:12px;"><option value="">ODD — none</option>' + oddOpts + '</select>' +
            '<input id="mlas-d-rep" placeholder="Representativeness rationale" style="flex:2;min-width:180px;padding:5px 8px;font-size:12px;">' +
            '<label style="font-size:11.5px;display:flex;align-items:center;gap:5px;text-transform:none;">' +
              '<input type="checkbox" id="mlas-d-ind"> independent of training</label>' +
            '<button class="ckpt-m-btn" onclick="try{ML_ASSURANCE._addD()}catch(e){}">Add</button></div>' +
        '</div>' +

        '<div style="border:1px solid var(--color-border-strong);margin-bottom:16px;">' +
          '<div style="padding:8px 13px;border-bottom:2px solid var(--color-text-primary);"><b>4 · In-service monitoring</b> ' +
            '<span style="font-size:11px;color:var(--color-text-tertiary);">what was seen in service, against the envelope you declared</span></div>' +
          '<div style="padding:8px 13px;border-bottom:1px solid var(--color-border-hair);font-size:11.5px;color:var(--color-text-secondary);">' +
            'The tool does not classify drift. It does not read a distribution or compute a divergence, and a number invented at this layer ' +
            'would be indefensible. What it records is an observation, the ODD dimension you believe it challenges, and <b>the verdict you reached</b>. ' +
            'A FRACAS citation stays a reference — the incident remains the case manager\'s record.</div>' +
          _table(['ID', 'Constituent', 'ODD', 'Source', 'Observed', 'Verdict', 'Logged'], monRows,
                 'No in-service observation recorded. Nothing is currently watching these constituents for drift.') +
          (d.constituents.length
            ? '<div style="padding:9px 13px;border-top:1px solid var(--color-border-hair);display:flex;gap:7px;flex-wrap:wrap;align-items:center;">' +
                '<select id="mlas-m-mlc" style="padding:5px 8px;font-size:12px;">' + mlcOpts + '</select>' +
                '<select id="mlas-m-odd" style="padding:5px 8px;font-size:12px;"><option value="">ODD — none</option>' + oddOpts + '</select>' +
                '<select id="mlas-m-src" style="padding:5px 8px;font-size:12px;">' +
                  MON_SOURCES.map(function (x) { return '<option>' + _esc(x) + '</option>'; }).join('') + '</select>' +
                '<select id="mlas-m-fr" style="padding:5px 8px;font-size:12px;"><option value="">FRACAS — none</option>' + frOpts + '</select>' +
                '<input id="mlas-m-obs" placeholder="What was actually observed" style="flex:2;min-width:200px;padding:5px 8px;font-size:12px;">' +
                '<select id="mlas-m-verdict" style="padding:5px 8px;font-size:12px;">' +
                  MON_VERDICTS.map(function (x) { return '<option>' + _esc(x) + '</option>'; }).join('') + '</select>' +
                '<input id="mlas-m-rat" placeholder="Rationale — required for outside ODD / retrain candidate" style="flex:2;min-width:200px;padding:5px 8px;font-size:12px;">' +
                '<button class="ckpt-m-btn" onclick="try{ML_ASSURANCE._addM()}catch(e){}">Add</button></div>'
            : '<div style="padding:9px 13px;border-top:1px solid var(--color-border-hair);font-size:12px;color:var(--color-text-tertiary);">' +
                'Record an ML constituent in section 1 first — an observation has to attach to something.</div>') +
        '</div>' +

        '<div style="border:1px solid var(--color-border-strong);margin-bottom:16px;">' +
          '<div style="padding:8px 13px;border-bottom:2px solid var(--color-text-primary);"><b>5 · Expert-correction capture</b> ' +
            '<span style="font-size:11px;color:var(--color-text-tertiary);">off by default · per project · never leaves the project</span></div>' +
          '<div style="padding:9px 13px;border-bottom:1px solid var(--color-border-hair);font-size:11.5px;color:var(--color-text-secondary);">' +
            'When this is on, an edit you make to an AI draft is recorded here as a before/after pair. It rides the project file like every ' +
            'other register and <b>is not transmitted anywhere</b> — nothing in the product trains on it today. Accepting a draft unchanged is ' +
            'not a correction and is not recorded.</div>' +
          '<div style="padding:10px 13px;border-bottom:1px solid var(--color-border-hair);">' +
            '<label style="display:flex;align-items:center;gap:8px;font-size:12.5px;text-transform:none;font-weight:700;' +
              (capOK ? '' : 'opacity:.55;cursor:not-allowed;') + '">' +
              '<input type="checkbox" id="mlas-cap-on"' + (capOn ? ' checked' : '') + (capOK ? '' : ' disabled') +
                ' onchange="try{ML_ASSURANCE._toggleCapture(this.checked)}catch(e){}">' +
              'Capture expert corrections in this project' +
            '</label>' +
            (capOK
              ? '<div style="font-size:11.5px;color:var(--color-text-secondary);margin-top:5px;">' +
                  (capOn ? 'On — ' + d.capture.length + ' correction' + (d.capture.length === 1 ? '' : 's') + ' recorded so far.'
                         : 'Off. Nothing is being recorded.') + '</div>'
              : '<div style="font-size:11.5px;color:#B03030;margin-top:5px;font-weight:700;">' +
                  'Unavailable — this project is flagged export-controlled. Corrections to controlled technical data are themselves ' +
                  'controlled technical data, so capture cannot be switched on here at all.</div>') +
          '</div>' +
          // Records that already exist are shown whatever the flag now says.
          // A project can be marked export-controlled AFTER corrections were
          // captured, and the worst thing this panel could do is make them
          // vanish from the screen while they sit in the project file. Say they
          // are there, say they predate the flag, and let the engineer act.
          (!capOK && d.capture.length
            ? '<div style="padding:9px 13px;border-bottom:1px solid var(--color-border-hair);font-size:11.5px;color:#B03030;font-weight:700;">' +
                d.capture.length + ' correction' + (d.capture.length === 1 ? '' : 's') + ' captured before this project was flagged ' +
                'export-controlled. They are still in the project file. Remove them here if they should not be.</div>'
            : '') +
          ((capOn || d.capture.length)
            ? _table(['ID', 'Feature', 'AI draft', 'Your correction', 'By', 'Date'], capRows,
                     'Nothing captured yet — corrections appear here as you edit AI drafts.')
            : '') +
        '</div>' +

        '<div style="border:1px solid var(--color-border-strong);"><div style="padding:8px 13px;border-bottom:2px solid var(--color-text-primary);">' +
          '<b>Outstanding</b> <span style="font-size:11px;color:var(--color-text-tertiary);">' + f.length + ' — pointers at what a reviewer will ask</span></div>' +
          '<div style="padding:9px 13px;">' + fBlock + '</div></div>';
    }

    // ---- form handlers -----------------------------------------------------
    function _v(id) { const e = document.getElementById(id); return e ? e.value : ''; }
    const API = {
        LEVELS: LEVELS, DATASET_ROLES: DATASET_ROLES,
        BEHAVIOURS: BEHAVIOURS, CONTINUUM: CONTINUUM,
        addConstituent: author.addConstituent, addOdd: author.addOdd, addDataset: author.addDataset,
        remove: author.remove, findings: findings, render: render, _mlDefault: _mlDefault,
        MON_SOURCES: MON_SOURCES, MON_VERDICTS: MON_VERDICTS,
        addMonitor: addMonitor, fracasIncidents: fracasIncidents,
        captureAllowed: captureAllowed, setCaptureEnabled: setCaptureEnabled,
        recordCorrection: recordCorrection,
        _addC: function () { author.addConstituent(_v('mlas-c-name'), _v('mlas-c-fn'), _v('mlas-c-level'), _v('mlas-c-odd'), '', _v('mlas-c-beh'), _v('mlas-c-cont')); },
        _addO: function () { author.addOdd(_v('mlas-o-dim'), _v('mlas-o-range'), _v('mlas-o-units'), _v('mlas-o-rat')); },
        _addD: function () {
            const cb = document.getElementById('mlas-d-ind');
            author.addDataset(_v('mlas-d-name'), _v('mlas-d-role'), _v('mlas-d-src'), _v('mlas-d-odd'), _v('mlas-d-rep'), !!(cb && cb.checked));
        },
        _addM: function () {
            addMonitor(_v('mlas-m-mlc'), _v('mlas-m-odd'), _v('mlas-m-src'), _v('mlas-m-obs'),
                       _v('mlas-m-verdict'), _v('mlas-m-rat'), _v('mlas-m-fr'));
        },
        // The checkbox is optimistic; setCaptureEnabled is the authority. If it
        // refuses (export-controlled), render() repaints from the store and the
        // box goes back to where the store says it is, not where the click left it.
        _toggleCapture: function (on) { setCaptureEnabled(!!on); try { render(); } catch (_) {} }
    };
    window.ML_ASSURANCE = API;
    window.renderMlAssurance = render;

    // ---- wiring ------------------------------------------------------------
    // Same moat as stpa_panel.js: wrap switchTab once, render on arrival. The
    // guard flag stops a double wrap if this file is ever loaded twice.
    (function wrap() {
        if (typeof window.switchTab === 'function' && !window.switchTab._mlasWrapped) {
            const orig = window.switchTab;
            const wrapped = function (tabId) {
                const r = orig.apply(this, arguments);
                try { if (tabId === 'mlas') setTimeout(render, 0); } catch (_) {}
                return r;
            };
            wrapped._mlasWrapped = true;
            try { if (orig._stpaWrapped) wrapped._stpaWrapped = true; } catch (_) {}
            window.switchTab = wrapped;
        } else if (typeof window.addEventListener === 'function') {
            window.addEventListener('DOMContentLoaded', function () { setTimeout(wrap, 600); });
        }
    })();
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
