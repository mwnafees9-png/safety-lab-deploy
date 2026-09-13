// ============================================================================
// stpa_core.js — v1.1 — STPA ENGINE (v1.1/BRIDGE: the UCA ↔ FTA/FMEA seam —
// bridgeMap(): assessed UCAs declare failure-mode counterparts (FTA nodes,
// FMEA rows, resolver-checked, dangling refuses) or declare themselves PURE
// INTERACTION hazards — first-class, never orphans. Three computed states:
// bridged / interaction / undeclared. cf. doi:10.1177/1748006X261465051.) (v1.0/R1+R2: the last two residues.
// R1 — §7.2.1/App E: the control structure is authored AT A STATED LEVEL
// OF ABSTRACTION (system / subsystem / component); 2a-1 now reports
// PARTIAL until the level is declared. R2 — §7.4.3.2: the 4c solution set
// includes TESTING — every drafted requirement carries a test-criticality
// disposition, and NON-CRITICAL demands a documented rationale; 4c-1/4c-2
// count test dispositions in their evidence. 27/27, no residues.)
// (v0.9/W6: APPENDIX C ARCHETYPES —
// the informative appendix crosses FOUR scenario classes against the FOUR
// UCA types into a Scenario Archetype Table, and its claim is exactly the
// house argument: coverage becomes a COMPUTED property with clear exit
// criteria, not a feeling. Our four classes project directly onto the W3
// cause machinery (4a/controller · 4a/feedback · 4b/control-path ·
// 4b/process), so archetypeMatrix() is a projection, not a second store —
// one fact, one place. Plus the OPTIONAL SIP self-assessment scaffold
// (§6.4 / Appendix D items a–y): the standard's NOTE 1 says it is NOT
// required, the tool says so loudly, and the item WORDING is never stored
// (copyrighted — the analyst works from their licensed copy).)
// (v0.8/W5: CONFORMANCE — clause 9 of
// J3307 puts the burden on the user to DEMONSTRATE that the evaluation
// content fulfils the required activities. conformance() walks all 27
// Table 1 work products and, for each, points at the object that satisfies
// it and the link that traces it — satisfied / partial / missing / n-a,
// with evidence strings a reviewer can chase. The auditor asks "show me
// 4b-2"; the tool answers in one click.)
// (v0.7/W4: THE COMPLETE CONTROL
// STRUCTURE. Controllers carry process models (and, for humans, the four
// J3307 §7.2.2 mental-model types), authority ranks, and descriptions;
// 'other inputs and outputs' join as the FIFTH element type (§7.2 — the
// edge class analysts routinely omit); loopSummary() gives the POSITIVE
// critical-feedback-per-loop statement (2b-2) that inv18 only stated
// negatively; conflictSites() finds every process commanded by more than
// one controller and demands a precedence rule — the conflicting-command
// interaction hazard STPA exists to catch; respTrace() validates
// responsibilities allocated to elements and traced up the spine; and
// csCompleteness() reports what the structure still owes, honestly.)
// (v0.6/W3: STEP 4 COMPLETENESS —
// enumerated causal seeds. J3307 §7.4.1.2 mandates SIX causes be evaluated
// for why a controller ISSUES an unsafe control action (4a), and §7.4.2.2
// mandates SEVEN control-path + THREE controlled-process causes for why a
// correct action is NOT EXECUTED or improperly executed (4b) — the scenario
// class most analyses omit entirely. causeSeeds() computes 16 seeds per
// assessed UCA; COVERAGE IS COMPUTED, never stored — a cause is covered
// when a scenario tagged with it exists, so the worklist cannot silently
// shrink. Dismissals are the data, and a dismissal without rationale is
// refused. This is how "the six causes were considered" becomes a
// demonstrable property instead of an assertion.)
// (v0.5/W2: UCA dispositions link to the
// SPINE hazard register (hazardIds) — the W1 objects are now the target
// class; direct FHA fcIds survive as the legacy route. Passing the spine
// to ucaSeeds()/lossScenarios() makes a dangling hazard link a refusal.)
// (v0.4: THE J3307 SPINE — losses,
// hazards, constraints as first-class objects with typed upward links
// (constraint→hazard→loss; J3307 Figure 8 hangs everything off losses).
// spineValidate() refuses structural impossibilities (duplicate ids,
// dangling links, unnamed objects); spineTrace() reports traceability
// GAPS as advisory findings (an untraced hazard is legal to author and
// dishonest to ship); hazardRollup() gives the 1b-2 grouping and the
// per-loss rollup. A hazard may be CREATED FROM an FHA failure condition
// (fromFcId) — the FHA stays master for the classical lane; the spine
// object is the STPA-side identity.)
// (v0.3: J3307 §7.3.1.2 five-part UCA —
// an 'assessed' disposition now REQUIRES a context clause stating the
// ACTUAL (true) system state that makes the action unsafe (not a controller
// belief), exactly as a 'dismissed' disposition requires a rationale. The
// seed carries a `parts` object naming all five mandated parts —
// source / type / control action / context / link to hazards — so
// conformance is mechanical, not asserted.)
// (v0.2: causal factors pass an optional factorClass — the HF-6 seven-factor
// taxonomy — through to computed scenarios; passthrough only, the engine
// never classifies anything itself.)
// (System-Theoretic Process Analysis).
//
// The system-level lane ABOVE the component lanes: FMEA is the bottom feed,
// FHA/FTA the classical spine — STPA catches what they structurally miss:
// INTERACTION hazards, where every component works and the system still
// fails. Complements, never replaces (incremental adoption; the INCOSE
// SDV-era argument, mechanized).
//
// Model (authored, plain data — display-lane engine, never writes stores):
//   controlStructure = {
//     controllers: [{ id, name, kind: 'human'|'automation'|'organization' }],
//     processes:   [{ id, name }],
//     actions:     [{ id, from, to, name }],            // control actions
//     feedbacks:   [{ id, from, to, name }]             // feedback paths
//   }
//
// THE ENGINE:
//   validate()     — refuses dangling edges, duplicate ids, empty structures.
//   inv18()        — MISSING-FEEDBACK check (advisory): a controller that
//                    commands a process with NO feedback path from it is
//                    flying blind — flagged with the poster's own logic
//                    ("accountable leadership requires feedback"). Three
//                    honest exits; no "mark as reviewed".
//   ucaSeeds()     — for every control action × the four Y-guide phrases
//                    (not provided / provided causes hazard / wrong timing
//                    or order / stopped too soon, applied too long): a
//                    SEED work item the analyst disposes — assess, link to
//                    an FHA FC, or dismiss WITH rationale. Seeds are
//                    computed, never stored; dispositions are the data.
//   lossScenarios()— assessed UCAs carry scenarios; every causal-factor
//                    mitigation cites an assumption (asmId) on the thread —
//                    typed, two-postured, credited only when Validated.
//                    An unlinked mitigation is flagged: a mitigation
//                    nobody registered is a hope, not a control.
// ============================================================================
(function () {
    'use strict';

    const GUIDE_PHRASES = [
        { id: 'np',  phrase: 'not provided' },
        { id: 'ph',  phrase: 'provided causes hazard' },
        { id: 'wt',  phrase: 'wrong timing or order' },
        { id: 'ss',  phrase: 'stopped too soon / applied too long' }
    ];

    function validate(cs) {
        const errs = [];
        if (!cs) return ['control structure required'];
        const ctl = cs.controllers || [], prc = cs.processes || [];
        if (!ctl.length) errs.push('no controllers — STPA starts with who commands');
        if (!prc.length) errs.push('no controlled processes');
        const ids = new Set();
        [...ctl, ...prc].forEach(n => {
            if (!n.id) errs.push('node without id');
            else if (ids.has(n.id)) errs.push('duplicate node id ' + n.id);
            else ids.add(n.id);
        });
        const edge = (e, kind) => {
            if (!ids.has(e.from)) errs.push(kind + ' ' + (e.id || e.name) + ': unknown source "' + e.from + '"');
            if (!ids.has(e.to)) errs.push(kind + ' ' + (e.id || e.name) + ': unknown target "' + e.to + '"');
        };
        (cs.actions || []).forEach(e => edge(e, 'control action'));
        (cs.feedbacks || []).forEach(e => edge(e, 'feedback'));
        (cs.others || []).forEach(e => edge(e, 'other input/output'));   // W4 — the fifth element type
        if (!(cs.actions || []).length) errs.push('no control actions — nothing to analyze');
        (cs.precedence || []).forEach(pr => {
            if (!pr || !pr.processId) errs.push('precedence rule without a target process');
            else if (!ids.has(pr.processId)) errs.push('precedence rule targets unknown element "' + pr.processId + '"');
            else if (!(pr.rule || '').trim()) errs.push('precedence entry for ' + pr.processId + ' has no rule text — an empty rule decides nothing');
        });
        return errs;
    }

    // ---- INV-18 (advisory): commanding without feedback = flying blind ------
    function inv18(cs) {
        const errs = validate(cs);
        if (errs.length) throw new Error('stpa: ' + errs.join('; '));
        const findings = [];
        (cs.actions || []).forEach(a => {
            const heard = (cs.feedbacks || []).some(f => f.from === a.to && f.to === a.from);
            if (!heard) findings.push({
                actionId: a.id, controller: a.from, process: a.to,
                detail: a.from + ' commands "' + a.name + '" to ' + a.to + ' with NO feedback path back — ' +
                        'commanding without hearing is open-loop hope, not control',
                exits: ['add the feedback path (and the sensor/report that carries it)',
                        'show an equivalent feedback route via another node (document it as an edge)',
                        'accept open-loop EXPLICITLY as a typed assumption on the register — two postures, like everything else']
            });
        });
        return { checked: (cs.actions || []).length, findings };
    }

    // ---- UCA seeds: computed work, analyst-disposed --------------------------
    // dispositions: { '<actionId>:<phraseId>': { status:'assessed'|'dismissed',
    //   hazard?, context?, hazardIds?[], fcIds?[], rationale?,
    //   scenarios?[{ desc, causalFactors:[{factor, asmId?}] }] } }
    //
    // J3307 §7.3.1.2 — a UCA is a FIVE-part statement:
    //   <source> <type> <control action> <context> <link to hazards>
    // and the context must specify the ACTUAL (true) state that makes the
    // action unsafe — not what the controller believes the state to be.
    // An 'assessed' disposition without a context clause is therefore
    // refused, exactly as a 'dismissed' one without a rationale is.
    //
    // W2 — the hazard link now targets the W1 SPINE hazard register
    // (hazardIds); direct fcIds survive as a legacy route (the right shape
    // aimed at the wrong target class). When the optional `spine` argument
    // is passed, a hazardId that is not on the register is REFUSED —
    // dangling links are broken promises here too.
    function ucaSeeds(cs, dispositions, spine) {
        const errs = validate(cs);
        if (errs.length) throw new Error('stpa: ' + errs.join('; '));
        dispositions = dispositions || {};
        const knownHaz = spine ? new Set((spine.hazards || []).map(h => h.id)) : null;
        const out = [];
        (cs.actions || []).forEach(a => GUIDE_PHRASES.forEach(g => {
            const key = a.id + ':' + g.id;
            const d = dispositions[key] || null;
            if (d && d.status === 'dismissed' && !(d.rationale || '').trim())
                throw new Error('stpa: UCA ' + key + ' dismissed WITHOUT rationale — a silent dismissal is a hole, not a disposition');
            if (d && d.status === 'assessed' && !(d.context || '').trim())
                throw new Error('stpa: UCA ' + key + ' assessed WITHOUT context — J3307 §7.3.1.2 mandates the context clause: the ACTUAL system state that makes “' + a.name + '” ' + g.phrase + ' unsafe (not a controller belief)');
            const hazardIds = (d && d.hazardIds) || [];
            if (knownHaz) hazardIds.forEach(id => {
                if (!knownHaz.has(id))
                    throw new Error('stpa: UCA ' + key + ' cites hazard "' + id + '" that is not on the spine register — a dangling link is a broken promise');
            });
            const ctx = (d && (d.context || '').trim()) || null;
            const fcIds = (d && d.fcIds) || [];
            const links = hazardIds.length ? hazardIds : fcIds;   // spine first; FC = legacy
            const seed = {
                ucaId: 'UCA-' + key,
                actionId: a.id, action: a.name, controller: a.from, process: a.to,
                phrase: g.phrase,
                context: ctx,
                text: ctx
                    ? a.from + ': “' + a.name + '” ' + g.phrase + ' while ' + ctx +
                      (links.length ? ' [→ ' + links.join(', ') + ']' : '') + ' (' + a.from + ' → ' + a.to + ')'
                    : '“' + a.name + '” ' + g.phrase + ' (' + a.from + ' → ' + a.to + ')',
                status: d ? d.status : 'open',
                hazardIds: hazardIds,
                fcIds: fcIds,
                rationale: (d && d.rationale) || null
            };
            // The five mandated parts, NAMED — so a conformance sweep can point
            // at each one instead of parsing prose.
            seed.parts = {
                source: a.from,
                type: g.phrase,
                controlAction: a.name,
                context: ctx,                                   // null while open — honestly incomplete
                hazardLinks: links.slice()
            };
            out.push(seed);
        }));
        return out;
    }

    // ---- loss scenarios: mitigations must live on the register ---------------
    function lossScenarios(cs, dispositions, asmResolver, spine) {
        const seeds = ucaSeeds(cs, dispositions, spine);
        const scenarios = [], flags = [];
        Object.keys(dispositions || {}).forEach(key => {
            const d = dispositions[key];
            if (!d || d.status !== 'assessed') return;
            (d.scenarios || []).forEach((s, i) => {
                const scen = { scenId: 'LS-' + key + '-' + (i + 1), ucaId: 'UCA-' + key, desc: s.desc,
                               cause: s.cause || null,           // W3 — '<4a|4b>:<causeId>' tag, passthrough
                               causalFactors: [] };
                (s.causalFactors || []).forEach(cf => {
                    const entry = { factor: cf.factor, asmId: cf.asmId || null, factorClass: cf.factorClass || null, posture: null };
                    if (!cf.asmId) {
                        flags.push('LS-' + key + '-' + (i + 1) + ': causal factor "' + cf.factor +
                                   '" has NO registered assumption — an unregistered mitigation is a hope, not a control');
                    } else if (typeof asmResolver === 'function') {
                        const a = asmResolver(cf.asmId);
                        entry.posture = a ? { state: a.state, effective: a.effective } : 'UNRESOLVED';
                        if (!a) flags.push(scen.scenId + ': cites ' + cf.asmId + ' — not found on the register');
                    }
                    scen.causalFactors.push(entry);
                });
                scenarios.push(scen);
            });
        });
        return { scenarios, flags };
    }

    // ======================================================================
    // STPA-BRIDGE — the UCA ↔ FTA/FMEA seam (26 Jul 2026).
    // ======================================================================
    // Recent literature keeps rediscovering the same seam (cf. Abdellatif et
    // al., doi:10.1177/1748006X261465051): STPA finds unsafe control actions,
    // the classical lanes find component failures, and the two meet only in
    // prose. Here the seam is DATA. An assessed UCA may be BRIDGED to the FTA
    // nodes and FMEA rows that carry its failure-mode counterpart — and a UCA
    // with NO such counterpart is a PURE INTERACTION HAZARD: first-class,
    // owned by the STPA lane, never an orphan, never forced into failure
    // framing. That distinction is the whole point of running STPA at all —
    // every component can meet spec and the system still fails.
    //
    // Authored data (on the assessed disposition, beside hazardIds):
    //   bridge: { declared: true, ftaRefs: ['<displayId|nodeId>'], fmeaRefs: ['<internalId>'] }
    // Three computed states — the worklist cannot silently shrink:
    //   'bridged'     — declared, with ≥1 resolved counterpart ref
    //   'interaction' — declared, deliberately zero refs (the affirmative claim)
    //   'undeclared'  — assessed but the bridge question not yet answered
    // Resolvers are passed in (display-lane discipline; the engine never
    // reaches into stores): { fta: ref => node|null, fmea: ref => row|null }.
    // A declared ref that does not resolve REFUSES — dangling links are
    // broken promises here exactly as they are on the spine.
    function bridgeMap(cs, dispositions, resolvers, spine) {
        const seeds = ucaSeeds(cs, dispositions, spine);
        resolvers = resolvers || {};
        const rFta = (typeof resolvers.fta === 'function') ? resolvers.fta : null;
        const rFmea = (typeof resolvers.fmea === 'function') ? resolvers.fmea : null;
        const entries = [], byFta = {}, byFmea = {};
        Object.keys(dispositions || {}).forEach(key => {
            const d = dispositions[key];
            if (!d || d.status === 'assessed') return;
            if (d.bridge && d.bridge.declared)
                throw new Error('stpa: UCA ' + key + ' carries a bridge declaration but is ' + (d.status || 'open') +
                    ' — the bridge rides an assessment; dispose the UCA first');
        });
        seeds.filter(s => s.status === 'assessed').forEach(s => {
            const key = s.ucaId.slice(4);
            const d = dispositions[key] || {};
            const b = d.bridge || null;
            if (!b || !b.declared) {
                entries.push({ ucaId: s.ucaId, kind: 'undeclared', ftaRefs: [], fmeaRefs: [],
                    statement: s.ucaId + ': bridge question unanswered — declare the failure-mode counterparts, or declare the UCA a pure interaction hazard. Undeclared is honest, and it is also unfinished.' });
                return;
            }
            const ftaRefs = (b.ftaRefs || []).slice(), fmeaRefs = (b.fmeaRefs || []).slice();
            const ftaHits = ftaRefs.map(ref => {
                const hit = rFta ? rFta(ref) : null;
                if (!hit) throw new Error('stpa: UCA ' + key + ' bridges to FTA "' + ref + '" which does not resolve — a dangling bridge is a broken promise');
                return { ref: ref, id: String(hit.id != null ? hit.id : ref), name: hit.name || null, displayId: hit.displayId || null };
            });
            const fmeaHits = fmeaRefs.map(ref => {
                const hit = rFmea ? rFmea(ref) : null;
                if (!hit) throw new Error('stpa: UCA ' + key + ' bridges to FMEA "' + ref + '" which does not resolve — a dangling bridge is a broken promise');
                return { ref: ref, id: String(hit.internalId != null ? hit.internalId : ref), failureMode: hit.failureMode || hit.mode || null };
            });
            if (ftaHits.length || fmeaHits.length) {
                const named = ftaHits.map(h => 'FTA ' + (h.displayId || h.id)).concat(fmeaHits.map(h => 'FMEA ' + h.id));
                entries.push({ ucaId: s.ucaId, kind: 'bridged', ftaRefs: ftaHits, fmeaRefs: fmeaHits,
                    statement: s.ucaId + ': failure-mode counterpart on record — ' + named.join(', ') +
                        '. The classical lane quantifies the counterpart; STPA keeps the context that makes it unsafe.' });
                ftaHits.forEach(h => { (byFta[h.id] = byFta[h.id] || []).push(s.ucaId); });
                fmeaHits.forEach(h => { (byFmea[h.id] = byFmea[h.id] || []).push(s.ucaId); });
            } else {
                entries.push({ ucaId: s.ucaId, kind: 'interaction', ftaRefs: [], fmeaRefs: [],
                    statement: s.ucaId + ': PURE INTERACTION HAZARD — declared: no component-failure counterpart exists or is required. ' +
                        'Every component can meet spec and this loss still happens; the STPA lane owns it, first-class ' +
                        '(the seam the classical lanes structurally miss — cf. doi:10.1177/1748006X261465051).' });
            }
        });
        const rollup = {
            assessed: entries.length,
            bridged: entries.filter(e => e.kind === 'bridged').length,
            interaction: entries.filter(e => e.kind === 'interaction').length,
            undeclared: entries.filter(e => e.kind === 'undeclared').length
        };
        return { entries, rollup, byFta, byFmea };
    }

    // ======================================================================
    // W4 — THE COMPLETE CONTROL STRUCTURE
    // ======================================================================
    // The four J3307 §7.2.2 mental-model types every HUMAN controller carries.
    const MENTAL_MODELS = [
        { id: 'environment',       label: 'model of the environment' },
        { id: 'ownState',          label: 'model of their own state' },
        { id: 'controlledProcess', label: 'model of the controlled process' },
        { id: 'otherControllers',  label: 'model of the other controllers' }   // the one usually missed
    ];

    // 2b-2 — the POSITIVE statement: for every control action, WHICH feedback
    // paths close its loop. inv18 flags the negative; this states the positive,
    // so "critical feedback per control loop" is a summary, not an absence.
    function loopSummary(cs) {
        const errs = validate(cs);
        if (errs.length) throw new Error('stpa: ' + errs.join('; '));
        return (cs.actions || []).map(a => {
            const fb = (cs.feedbacks || []).filter(f => f.from === a.to && f.to === a.from);
            return { actionId: a.id, action: a.name, controller: a.from, process: a.to,
                     feedbackIds: fb.map(f => f.id), feedbackNames: fb.map(f => f.name),
                     closed: fb.length > 0 };
        });
    }

    // 2f-2 — conflict sites: any element that RECEIVES control actions from
    // more than one controller. Each site needs a precedence rule; a site
    // without one is the conflicting-command interaction hazard, unresolved.
    function conflictSites(cs) {
        const errs = validate(cs);
        if (errs.length) throw new Error('stpa: ' + errs.join('; '));
        const byTarget = {};
        (cs.actions || []).forEach(a => {
            (byTarget[a.to] = byTarget[a.to] || []).push(a);
        });
        const rules = {};
        (cs.precedence || []).forEach(pr => { if (pr && pr.processId) rules[pr.processId] = (pr.rule || '').trim() || null; });
        const rankOf = {};
        (cs.controllers || []).forEach(c => { if (c.authority != null && c.authority !== '') rankOf[c.id] = +c.authority; });
        const sites = [];
        Object.keys(byTarget).forEach(t => {
            const acts = byTarget[t];
            const ctls = Array.from(new Set(acts.map(a => a.from)));
            if (ctls.length < 2) return;
            const ranks = ctls.map(c => rankOf[c]).filter(r => r != null && !isNaN(r));
            const ranked = ranks.length === ctls.length && new Set(ranks).size === ctls.length;
            sites.push({
                targetId: t, controllers: ctls, actionIds: acts.map(a => a.id),
                rule: rules[t] || null,
                authorityRanked: ranked,
                finding: (rules[t] || ranked) ? null
                    : t + ' receives commands from ' + ctls.join(' and ') + ' with NO precedence rule and no unambiguous authority ranking — two voices, no tiebreak: this is the conflicting-command hazard, standing'
            });
        });
        return { sites, findings: sites.map(x => x.finding).filter(Boolean) };
    }

    // 2c-1/2c-2 — responsibilities: allocated to an element, traced to spine
    // constraints. Dangling links refuse; missing allocations report honestly.
    function respTrace(responsibilities, cs, spine) {
        const errs = validate(cs);
        if (errs.length) throw new Error('stpa: ' + errs.join('; '));
        const sErrs = spineValidate(spine || { losses: [], hazards: [], constraints: [] });
        if (sErrs.length) throw new Error('stpa: ' + sErrs.join('; '));
        const elemIds = new Set([].concat(cs.controllers || [], cs.processes || []).map(n => n.id));
        const conIds = new Set(((spine || {}).constraints || []).map(c => c.id));
        const rErrs = [];
        const seen = new Set();
        (responsibilities || []).forEach(r => {
            if (!r.id) { rErrs.push('responsibility without id'); return; }
            if (seen.has(r.id)) rErrs.push('duplicate responsibility id ' + r.id); else seen.add(r.id);
            if (!(r.text || '').trim()) rErrs.push('responsibility ' + r.id + ' has no text');
            if (!r.elementId || !elemIds.has(r.elementId)) rErrs.push('responsibility ' + r.id + ' allocated to unknown element "' + (r.elementId || '') + '"');
            (r.constraintIds || []).forEach(cid => {
                if (!conIds.has(cid)) rErrs.push('responsibility ' + r.id + ' cites unknown constraint "' + cid + '"');
            });
        });
        if (rErrs.length) throw new Error('stpa: ' + rErrs.join('; '));
        const findings = [];
        (cs.controllers || []).forEach(c => {
            if (!(responsibilities || []).some(r => r.elementId === c.id))
                findings.push({ kind: 'no-responsibilities', id: c.id, detail: 'controller ' + c.id + ' has NO enumerated responsibilities — a controller nobody holds accountable for anything is a box, not a controller' });
        });
        (responsibilities || []).forEach(r => {
            if (!(r.constraintIds || []).length)
                findings.push({ kind: 'untraced-responsibility', id: r.id, detail: 'responsibility ' + r.id + ' traces to NO safety constraint — 2c-2 wants the link, not just the sentence' });
        });
        return { checked: (responsibilities || []).length, findings };
    }

    // 2b-1 / 2f-1 / 2f-3 — what the structure still owes. Advisory: legal to
    // author incrementally, dishonest to call finalized while any of it stands.
    function csCompleteness(cs) {
        const errs = validate(cs);
        if (errs.length) throw new Error('stpa: ' + errs.join('; '));
        const findings = [];
        (cs.controllers || []).forEach(c => {
            const pm = c.processModel || [];
            if (!pm.length) findings.push({ kind: 'no-process-model', id: c.id, detail: 'controller ' + c.id + ' has NO process model — what belief does its control algorithm act on?' });
            if (c.kind === 'human') {
                const mm = c.mentalModels || {};
                MENTAL_MODELS.forEach(t => {
                    if (!(mm[t.id] || '').trim())
                        findings.push({ kind: 'mental-model-gap', id: c.id, detail: 'human controller ' + c.id + ' is missing the ' + t.label + ' (§7.2.2 — ' + (t.id === 'otherControllers' ? 'the one usually missed; mode confusion lives here' : 'one of the four required') + ')' });
                });
            }
            if ((cs.controllers || []).length > 1 && (c.authority == null || c.authority === ''))
                findings.push({ kind: 'no-authority', id: c.id, detail: 'controller ' + c.id + ' has no authority rank while other controllers exist — relative authority is part of the structure, not a nicety' });
        });
        [].concat(cs.controllers || [], cs.processes || []).forEach(n => {
            if (!(n.desc || '').trim())
                findings.push({ kind: 'no-description', id: n.id, detail: 'element ' + n.id + ' has no description (2f-3) — a bare label is not an element definition' });
        });
        return { checked: (cs.controllers || []).length + (cs.processes || []).length, findings };
    }

    // ======================================================================
    // STEP 4 CAUSE ENUMERATIONS (W3) — original factual statements of the
    // J3307-mandated cause classes (facts about the standard, not its text).
    // ======================================================================
    const CAUSES_4A = [   // §7.4.1.2 — why a controller ISSUES the UCA (six causes)
        { id: 'cf',  side: 'controller', cause: 'controller failure — the controller itself fails, physically or as a human performer' },
        { id: 'ca',  side: 'controller', cause: 'unsafe control algorithm — the decision logic is wrong, wrongly implemented, or has degraded over time' },
        { id: 'ci',  side: 'controller', cause: 'unsafe control input — a command received from another controller or from outside the system leads to the UCA' },
        { id: 'pm',  side: 'controller', cause: 'unsafe process / mental model — the controller\'s belief diverges from the true state (fed by missing, late, or incorrect feedback)' },
        { id: 'fnr', side: 'feedback',   cause: 'feedback not received — the information path back to the controller delivers nothing' },
        { id: 'fin', side: 'feedback',   cause: 'feedback inadequate — received, but wrong, stale, or insufficient to update the process model' }
    ];
    const CAUSES_4B = [   // §7.4.2.2 — why a CORRECT action is not executed / improperly executed
        { id: 'cp1', side: 'control-path', cause: 'command never reaches the actuator' },
        { id: 'cp2', side: 'control-path', cause: 'command arrives corrupted' },
        { id: 'cp3', side: 'control-path', cause: 'command arrives delayed' },
        { id: 'cp4', side: 'control-path', cause: 'commands arrive out of order' },
        { id: 'cp5', side: 'control-path', cause: 'command applied to the wrong target' },
        { id: 'cp6', side: 'control-path', cause: 'command overridden or countermanded by another controller' },
        { id: 'cp7', side: 'control-path', cause: 'the control path itself has failed' },
        { id: 'pr1', side: 'process',      cause: 'controlled process does not respond to the commanded action' },
        { id: 'pr2', side: 'process',      cause: 'controlled process responds in a degraded way' },
        { id: 'pr3', side: 'process',      cause: 'controlled process is disturbed by something outside the control loop' }
    ];

    // causeSeeds(cs, dispositions, causeDismissals, spine?) — 16 computed
    // seeds per ASSESSED UCA. Status:
    //   covered   — a scenario on the UCA carries cause === '<4a|4b>:<causeId>'
    //               (COMPUTED from the scenarios; coverage cannot be faked or
    //               silently lost). Covered wins over a stale dismissal.
    //   dismissed — causeDismissals['<ucaKey>:<causeId>'] = { rationale }
    //               (rationale REQUIRED — a silent dismissal is a hole).
    //   open      — neither. Honestly outstanding.
    function causeSeeds(cs, dispositions, causeDismissals, spine) {
        const seeds = ucaSeeds(cs, dispositions, spine);
        causeDismissals = causeDismissals || {};
        const out = [];
        seeds.filter(s => s.status === 'assessed').forEach(s => {
            const key = s.ucaId.slice(4);
            const d = (dispositions || {})[key] || {};
            const scens = d.scenarios || [];
            const push = (phase, c) => {
                const tag = phase + ':' + c.id;
                const dk = key + ':' + c.id;
                const covered = scens.some(sc => sc && sc.cause === tag);
                const dis = causeDismissals[dk] || null;
                if (dis && !(dis.rationale || '').trim())
                    throw new Error('stpa: cause ' + dk + ' dismissed WITHOUT rationale — J3307 says these causes SHALL be evaluated; a silent dismissal is a hole, not an evaluation');
                out.push({
                    seedId: 'CS-' + dk,
                    ucaId: s.ucaId, ucaText: s.text,
                    phase: phase, causeId: c.id, side: c.side, cause: c.cause,
                    status: covered ? 'covered' : (dis ? 'dismissed' : 'open'),
                    rationale: (!covered && dis) ? dis.rationale : null,
                    scenarioCount: scens.filter(sc => sc && sc.cause === tag).length
                });
            };
            CAUSES_4A.forEach(c => push('4a', c));
            CAUSES_4B.forEach(c => push('4b', c));
        });
        return out;
    }

    // ======================================================================
    // THE SPINE (W1) — losses / hazards / constraints, typed upward links.
    //   spine = { losses:      [{ id, name, desc? }],
    //             hazards:     [{ id, name, lossIds:[], group?, fromFcId? }],
    //             constraints: [{ id, text, hazardIds:[] }] }
    // ======================================================================
    function spineValidate(spine) {
        const errs = [];
        if (!spine) return ['spine required'];
        const losses = spine.losses || [], hazards = spine.hazards || [], constraints = spine.constraints || [];
        const ids = new Set();
        const claim = (id, what) => {
            if (!id) { errs.push(what + ' without id'); return; }
            if (ids.has(id)) errs.push('duplicate id ' + id + ' — one identity per object, across ALL three registers');
            else ids.add(id);
        };
        losses.forEach(l => { claim(l.id, 'loss'); if (!(l.name || '').trim()) errs.push('loss ' + (l.id || '?') + ' has no name — an unnamed loss is not a stakeholder statement'); });
        hazards.forEach(h => { claim(h.id, 'hazard'); if (!(h.name || '').trim()) errs.push('hazard ' + (h.id || '?') + ' has no name'); });
        constraints.forEach(c => { claim(c.id, 'constraint'); if (!(c.text || '').trim()) errs.push('constraint ' + (c.id || '?') + ' has no text'); });
        const lossIds = new Set(losses.map(l => l.id)), hazIds = new Set(hazards.map(h => h.id));
        hazards.forEach(h => (h.lossIds || []).forEach(id => {
            if (!lossIds.has(id)) errs.push('hazard ' + h.id + ' cites unknown loss "' + id + '" — a dangling link is a broken promise');
        }));
        constraints.forEach(c => (c.hazardIds || []).forEach(id => {
            if (!hazIds.has(id)) errs.push('constraint ' + c.id + ' cites unknown hazard "' + id + '"');
        }));
        return errs;
    }

    // Traceability GAPS — advisory, not refusal: legal to author, dishonest to
    // ship. These are what the W5 conformance sweep will fail on.
    function spineTrace(spine) {
        const errs = spineValidate(spine);
        if (errs.length) throw new Error('stpa: ' + errs.join('; '));
        const losses = spine.losses || [], hazards = spine.hazards || [], constraints = spine.constraints || [];
        const findings = [];
        hazards.forEach(h => { if (!(h.lossIds || []).length) findings.push({ kind: 'untraced-hazard', id: h.id, detail: 'hazard ' + h.id + ' traces to NO loss — J3307 hangs every hazard off a loss (Figure 8); a hazard that costs nobody anything is not a hazard' }); });
        constraints.forEach(c => { if (!(c.hazardIds || []).length) findings.push({ kind: 'unlinked-constraint', id: c.id, detail: 'constraint ' + c.id + ' constrains NO hazard — a constraint with no hazard is a rule without a reason' }); });
        losses.forEach(l => {
            if (!hazards.some(h => (h.lossIds || []).indexOf(l.id) >= 0))
                findings.push({ kind: 'uncovered-loss', id: l.id, detail: 'loss ' + l.id + ' has NO hazard leading to it — either the analysis is early, or the loss is out of scope; say which' });
        });
        hazards.forEach(h => {
            if (!constraints.some(c => (c.hazardIds || []).indexOf(h.id) >= 0))
                findings.push({ kind: 'unconstrained-hazard', id: h.id, detail: 'hazard ' + h.id + ' has NO safety constraint — identified and then left standing' });
        });
        return { checked: losses.length + hazards.length + constraints.length, findings };
    }

    // 1b-2 — hazard grouping/rollup. Groups by the free-text `group` field
    // (ungrouped collected honestly under null), plus the per-loss rollup.
    function hazardRollup(spine) {
        const errs = spineValidate(spine);
        if (errs.length) throw new Error('stpa: ' + errs.join('; '));
        const hazards = spine.hazards || [], constraints = spine.constraints || [];
        const groups = {};
        hazards.forEach(h => {
            const g = (h.group || '').trim() || null;
            const key = g === null ? ' ungrouped' : g;
            if (!groups[key]) groups[key] = { group: g, hazardIds: [] };
            groups[key].hazardIds.push(h.id);
        });
        const perLoss = (spine.losses || []).map(l => ({
            lossId: l.id,
            hazardIds: hazards.filter(h => (h.lossIds || []).indexOf(l.id) >= 0).map(h => h.id),
            constraintCount: constraints.filter(c => (c.hazardIds || []).some(hid =>
                hazards.some(h => h.id === hid && (h.lossIds || []).indexOf(l.id) >= 0))).length
        }));
        return { groups: Object.keys(groups).sort().map(k => groups[k]), perLoss };
    }

    // ======================================================================
    // W6 — APPENDIX C SCENARIO ARCHETYPES (informative; the automation play).
    // ======================================================================
    const ARCHETYPE_CLASSES = [
        { id: 'ctl', label: 'unsafe controller behavior',            phase: '4a', side: 'controller' },
        { id: 'fbk', label: 'inadequate feedback and information',    phase: '4a', side: 'feedback' },
        { id: 'cpx', label: 'unsafe control path',                    phase: '4b', side: 'control-path' },
        { id: 'prx', label: 'unsafe controlled-process behavior',    phase: '4b', side: 'process' }
    ];
    // The Scenario Archetype Table: four classes × four UCA types. Every cell
    // aggregates the enumerated causes (W3) for the assessed UCAs of that
    // type — covered / dismissed / open — so "is Step 4 done" has an ANSWER:
    // exit = every populated cell fully disposed. A projection of causeSeeds,
    // never a second store.
    function archetypeMatrix(cs, dispositions, causeDismissals, spine) {
        const seeds = ucaSeeds(cs, dispositions, spine).filter(x => x.status === 'assessed');
        const cseeds = causeSeeds(cs, dispositions, causeDismissals, spine);
        const typeOf = ucaId => ucaId.split(':').pop();
        const cells = [];
        GUIDE_PHRASES.forEach(g => ARCHETYPE_CLASSES.forEach(cl => {
            const ucas = seeds.filter(x => typeOf(x.ucaId) === g.id);
            const rows = cseeds.filter(x => typeOf(x.ucaId) === g.id && x.phase === cl.phase && x.side === cl.side);
            const covered = rows.filter(x => x.status === 'covered').length;
            const dismissed = rows.filter(x => x.status === 'dismissed').length;
            cells.push({
                typeId: g.id, type: g.phrase, classId: cl.id, class: cl.label,
                ucaCount: ucas.length, causes: rows.length,
                covered: covered, dismissed: dismissed, open: rows.length - covered - dismissed,
                complete: rows.length > 0 && (covered + dismissed) === rows.length
            });
        }));
        const populated = cells.filter(c => c.ucaCount > 0);
        return {
            classes: ARCHETYPE_CLASSES.slice(), types: GUIDE_PHRASES.slice(), cells: cells,
            exit: populated.length > 0 && populated.every(c => c.complete),
            openCells: populated.filter(c => !c.complete).length
        };
    }

    // ---- SIP self-assessment scaffold (§6.4 / Appendix D, items a–y) -------
    // NOT REQUIRED for J3307 compliance (the standard's own NOTE 1 says so).
    // The item WORDING is copyrighted and never stored: the tool ships the
    // 25-slot STRUCTURE and the pointer; the analyst supplies their reading
    // from the licensed document. sipSummary() refuses a 'yes'/'partial'/'no'
    // state with no note — an assessment with no words is a checkbox, and
    // checkboxes are not evidence.
    const SIP_ITEMS = 'abcdefghijklmnopqrstuvwxy'.split('').map(ch => ({
        id: ch, ref: 'SAE J3307 §6.4 / Appendix D, item (' + ch + ')'
    }));
    function sipSummary(sip) {
        sip = sip || {};
        const states = { yes: 0, partial: 0, no: 0, na: 0, open: 0 };
        const errs = [];
        SIP_ITEMS.forEach(it => {
            const v = sip[it.id];
            if (!v || !v.state) { states.open++; return; }
            if (['yes', 'partial', 'no', 'na'].indexOf(v.state) < 0) { errs.push('item (' + it.id + '): unknown state "' + v.state + '"'); return; }
            if (v.state !== 'na' && !(v.note || '').trim())
                errs.push('item (' + it.id + ') marked ' + v.state + ' with NO note — an assessment with no words is a checkbox, not evidence');
            states[v.state]++;
        });
        if (errs.length) throw new Error('stpa: ' + errs.join('; '));
        return { items: SIP_ITEMS.length, states: states, assessed: SIP_ITEMS.length - states.open };
    }

    // ======================================================================
    // W5 — J3307 CONFORMANCE (clause 9): the 27 work products, demonstrated.
    // model = { cs, dispositions, causeDismissals, spine, responsibilities,
    //           meta, csState }
    // hooks = { scopeApproved: bool, reqRows: [{ uca }] }   — the panel passes
    //           store-derived facts IN; the engine never reads stores itself.
    // ======================================================================
    function conformance(model, hooks) {
        model = model || {}; hooks = hooks || {};
        const cs = model.cs || { controllers: [], processes: [], actions: [], feedbacks: [], others: [] };
        const spine = model.spine || { losses: [], hazards: [], constraints: [] };
        const meta = model.meta || {};
        const resp = model.responsibilities || [];
        const reqRows = hooks.reqRows || [];
        const out = [];
        const add = (id, step, title, status, evidence) => out.push({ id, step, title, status, evidence });
        const ids = arr => arr.map(x => x.id).join(', ');

        const csOk = validate(cs).length === 0;
        let seeds = [], cseeds = [], lsFlags = [];
        if (csOk) {
            try { seeds = ucaSeeds(cs, model.dispositions, spine); } catch (_) { seeds = null; }
            if (seeds) {
                try { cseeds = causeSeeds(cs, model.dispositions, model.causeDismissals, spine); } catch (_) { cseeds = []; }
                try { lsFlags = lossScenarios(cs, model.dispositions, null, spine).flags; } catch (_) { lsFlags = []; }
            }
        }
        const assessed = (seeds || []).filter(x => x.status === 'assessed');
        const disposed = (seeds || []).filter(x => x.status !== 'open');

        // ---- Step 1 -------------------------------------------------------
        const L = spine.losses, H = spine.hazards, C = spine.constraints;
        add('1a-1', 1, 'Losses', L.length ? 'satisfied' : 'missing',
            L.length ? L.length + ' loss(es): ' + ids(L) : 'no losses authored — the spine hangs off these');
        add('1a-2', 1, 'Loss list reviewed by stakeholders', hooks.scopeApproved ? 'satisfied' : 'missing',
            hooks.scopeApproved ? 'stakeholder confirmation recorded on the approvals rail (kind: stpaScope)' : 'no stakeholder confirmation on the approvals rail');
        add('1b-1', 1, 'System-level hazards', H.length ? 'satisfied' : 'missing',
            H.length ? H.length + ' hazard(s): ' + ids(H) : 'no hazards on the spine register');
        const grouped = H.filter(h => (h.group || '').trim());
        add('1b-2', 1, 'Hazard grouping / hierarchy (where used)', grouped.length ? 'satisfied' : 'na',
            grouped.length ? grouped.length + ' hazard(s) grouped — rollup computed' : 'no grouping in use (permitted — the work product applies only where a hierarchy is used)');
        add('1c-1', 1, 'System-level constraints', C.length ? 'satisfied' : 'missing',
            C.length ? C.length + ' constraint(s): ' + ids(C) : 'no constraints on the spine register');
        const cTraced = C.filter(c => (c.hazardIds || []).length);
        add('1c-2', 1, 'Constraint → hazard traceability', !C.length ? 'missing' : cTraced.length === C.length ? 'satisfied' : 'partial',
            !C.length ? 'depends on 1c-1' : cTraced.length + '/' + C.length + ' constraints trace to a hazard');

        // ---- Step 2 -------------------------------------------------------
        const LEVELS = ['system', 'subsystem', 'component'];
        const lvlOk = LEVELS.indexOf(meta.abstractionLevel) >= 0;
        add('2a-1', 2, 'System boundary and scope, at a stated level of abstraction',
            (meta.scope && meta.boundary && lvlOk) ? 'satisfied' : (meta.scope || meta.boundary || lvlOk) ? 'partial' : 'missing',
            [meta.scope ? 'scope stated' : 'scope MISSING', meta.boundary ? 'boundary stated' : 'boundary MISSING',
             lvlOk ? 'level: ' + meta.abstractionLevel : 'abstraction level UNDECLARED (App E: system / subsystem / component)'].join(' · ') +
            (model.csState ? ' · structure: ' + model.csState : ''));
        add('2b-1', 2, 'Controllers', cs.controllers.length ? 'satisfied' : 'missing',
            cs.controllers.length ? cs.controllers.length + ' controller(s): ' + ids(cs.controllers) : 'none');
        const pmOk = cs.controllers.filter(c => (c.processModel || []).length ||
            (c.kind === 'human' && c.mentalModels && MENTAL_MODELS.every(t => (c.mentalModels[t.id] || '').trim())));
        add('2b-2', 2, 'Controller process models (humans: all four mental models)',
            !cs.controllers.length ? 'missing' : pmOk.length === cs.controllers.length ? 'satisfied' : pmOk.length ? 'partial' : 'missing',
            pmOk.length + '/' + cs.controllers.length + ' controllers carry a process model');
        add('2c-1', 2, 'Controller responsibilities', resp.length ? 'satisfied' : 'missing',
            resp.length ? resp.length + ' responsibilit(ies): ' + ids(resp) : 'none allocated');
        const rTraced = resp.filter(r => (r.constraintIds || []).length);
        add('2c-2', 2, 'Responsibility → constraint traceability', !resp.length ? 'missing' : rTraced.length === resp.length ? 'satisfied' : 'partial',
            !resp.length ? 'depends on 2c-1' : rTraced.length + '/' + resp.length + ' responsibilities trace to a constraint');
        add('2d-1', 2, 'Control actions', cs.actions.length ? 'satisfied' : 'missing',
            cs.actions.length ? cs.actions.length + ' action(s): ' + ids(cs.actions) : 'none');
        let loopsClosed = 0;
        try { if (csOk) loopsClosed = loopSummary(cs).filter(l => l.closed).length; } catch (_) {}
        add('2e-1', 2, 'Feedback', cs.feedbacks.length ? 'satisfied' : 'missing',
            cs.feedbacks.length ? cs.feedbacks.length + ' feedback path(s) · ' + loopsClosed + '/' + cs.actions.length + ' loops closed' : 'no feedback paths — every loop is open');
        add('2f-1', 2, 'Other inputs and outputs (neither control nor feedback)', (cs.others || []).length ? 'satisfied' : 'partial',
            (cs.others || []).length ? cs.others.length + ' other edge(s): ' + ids(cs.others) : 'none authored — if genuinely none exist, say so in the boundary statement; this is the element type analysts routinely omit');
        add('2f-2', 2, 'Controlled processes', cs.processes.length ? 'satisfied' : 'missing',
            cs.processes.length ? cs.processes.length + ' process(es): ' + ids(cs.processes) : 'none');
        const allElems = cs.controllers.concat(cs.processes);
        const described = allElems.filter(n => (n.desc || '').trim());
        add('2f-3', 2, 'Element descriptions', !allElems.length ? 'missing' : described.length === allElems.length ? 'satisfied' : 'partial',
            described.length + '/' + allElems.length + ' elements described');

        // ---- Step 3 -------------------------------------------------------
        const seedFail = seeds === null;
        add('3a-1', 3, 'Unsafe control actions (per action × four types)',
            seedFail ? 'missing' : !disposed.length ? 'missing' : disposed.length === seeds.length ? 'satisfied' : 'partial',
            seedFail ? 'engine refuses the current dispositions — repair first' : disposed.length + '/' + (seeds || []).length + ' seeds disposed (' + assessed.length + ' assessed)');
        const ucaTraced = assessed.filter(x => (x.hazardIds || []).length);
        add('3a-2', 3, 'UCA → hazard traceability', !assessed.length ? 'missing' : ucaTraced.length === assessed.length ? 'satisfied' : 'partial',
            !assessed.length ? 'depends on 3a-1' : ucaTraced.length + '/' + assessed.length + ' assessed UCAs trace to a spine hazard' +
            (assessed.some(x => !(x.hazardIds || []).length && (x.fcIds || []).length) ? ' (legacy FC links present — retarget to the register)' : ''));
        const covered = assessed.filter(x => reqRows.some(r => r && r.uca === x.ucaId));
        add('3b-1', 3, 'Controller constraints (derived)', !assessed.length ? 'missing' : covered.length === assessed.length ? 'satisfied' : covered.length ? 'partial' : 'missing',
            covered.length + '/' + assessed.length + ' assessed UCAs drafted to the requirements worksheet');
        add('3b-2', 3, 'Controller constraint → UCA traceability', !covered.length ? 'missing' : 'satisfied',
            covered.length ? 'every drafted row carries its uca backlink by construction' : 'no drafted constraints yet');
        const hazToLoss = new Set(H.filter(h => (h.lossIds || []).length).map(h => h.id));
        const fullChain = ucaTraced.filter(x => (x.hazardIds || []).every(id => hazToLoss.has(id)));
        add('3b-3', 3, 'Onward trace to system constraints and hazards', !ucaTraced.length ? 'missing' : fullChain.length === ucaTraced.length ? 'satisfied' : 'partial',
            !ucaTraced.length ? 'depends on 3a-2' : fullChain.length + '/' + ucaTraced.length + ' UCA hazard links continue upward to a loss');

        // ---- Step 4 -------------------------------------------------------
        const cause = phase => {
            const rows = cseeds.filter(x => x.phase === phase);
            const done = rows.filter(x => x.status !== 'open');
            const cov = rows.filter(x => x.status === 'covered');
            return { rows, done, cov };
        };
        const c4a = cause('4a'), c4b = cause('4b');
        add('4a-1', 4, 'Loss scenarios — unsafe control action issued (six causes each)',
            !c4a.rows.length ? 'missing' : c4a.done.length === c4a.rows.length ? 'satisfied' : 'partial',
            !c4a.rows.length ? 'no assessed UCAs to evaluate' : c4a.done.length + '/' + c4a.rows.length + ' enumerated causes disposed (' + c4a.cov.length + ' covered by scenarios)');
        add('4a-2', 4, 'Scenario → UCA traceability (4a)', c4a.cov.length ? 'satisfied' : 'missing',
            c4a.cov.length ? 'structural — scenarios live on their UCA disposition; the link cannot dangle' : 'no 4a scenarios yet');
        add('4b-1', 4, 'Loss scenarios — improper / non-execution (ten causes each)',
            !c4b.rows.length ? 'missing' : c4b.done.length === c4b.rows.length ? 'satisfied' : 'partial',
            !c4b.rows.length ? 'no assessed UCAs to evaluate' : c4b.done.length + '/' + c4b.rows.length + ' enumerated causes disposed (' + c4b.cov.length + ' covered by scenarios)');
        add('4b-2', 4, 'Scenario → UCA traceability (4b)', c4b.cov.length ? 'satisfied' : 'missing',
            c4b.cov.length ? 'structural — scenarios live on their UCA disposition; the link cannot dangle' : 'no 4b scenarios yet — the class most analyses omit');
        // R2 — §7.4.3.2: testing is part of the 4c solution set. A drafted row is
        // test-disposed when it is CRITICAL, or NON-CRITICAL with a documented
        // rationale — a bare non-critical is counted as undisposed, and named.
        const drafted = reqRows.filter(r => r && r.uca);
        const testDisposed = drafted.filter(r => r.stpaTest &&
            (r.stpaTest.state === 'critical' || (r.stpaTest.state === 'non-critical' && (r.stpaTest.rationale || '').trim())));
        const bareNonCrit = drafted.filter(r => r.stpaTest && r.stpaTest.state === 'non-critical' && !(r.stpaTest.rationale || '').trim()).length;
        const testsOk = drafted.length > 0 && testDisposed.length === drafted.length;
        add('4c-1', 4, 'Requirements, mitigations, recommendations, testing',
            !assessed.length ? 'missing'
                : (covered.length === assessed.length && !lsFlags.length && testsOk) ? 'satisfied'
                : (covered.length || testDisposed.length || !lsFlags.length) ? 'partial' : 'missing',
            covered.length + '/' + assessed.length + ' UCAs answered by drafted requirements · ' +
            testDisposed.length + '/' + drafted.length + ' drafted rows test-disposed (§7.4.3.2)' +
            (bareNonCrit ? ' · ' + bareNonCrit + ' non-critical WITHOUT rationale — a bare non-critical is a hole' : '') +
            ' · ' + lsFlags.length + ' unregistered-mitigation flag(s) standing');
        add('4c-2', 4, 'Requirement / mitigation / test → scenario traceability',
            !covered.length ? 'missing' : (lsFlags.length || !testsOk) ? 'partial' : 'satisfied',
            (covered.length ? 'drafted rows backlink their UCA; ' : 'no drafted rows; ') +
            (testsOk ? 'test dispositions ride the same rows; ' : 'test dispositions incomplete; ') +
            (lsFlags.length ? lsFlags.length + ' causal factor(s) not resolving to a registered assumption' : 'every cited mitigation resolves to the register'));

        const tally = { satisfied: 0, partial: 0, missing: 0, na: 0 };
        out.forEach(x => { tally[x.status] = (tally[x.status] || 0) + 1; });
        return { deliverables: out, tally, total: out.length };
    }

    const API = { GUIDE_PHRASES, CAUSES_4A, CAUSES_4B, MENTAL_MODELS, validate, inv18, ucaSeeds, lossScenarios, bridgeMap,
                  causeSeeds, spineValidate, spineTrace, hazardRollup,
                  loopSummary, conflictSites, respTrace, csCompleteness, conformance,
                  ARCHETYPE_CLASSES, SIP_ITEMS, archetypeMatrix, sipSummary };
    if (typeof window !== 'undefined') window.STPA = API;
    if (typeof module !== 'undefined') module.exports = API;
})();
