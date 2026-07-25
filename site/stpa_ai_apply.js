// ============================================================================
// stpa_ai_apply.js — v0.1 — PRD-2: the APPLY half of governed AI STPA drafting.
//
// THE GOVERNANCE SPLIT, stated once and enforced here:
//   · The AI drafts what is CREATIVE — the spine (losses → hazards →
//     constraints) and the control-structure seeds (controllers, processes,
//     control actions, feedbacks) — as PROPOSALS carried through the house
//     review panel, each row landing with full provenance (aiGenerated,
//     aiFeature 'stpa.draft', model, timestamp).
//   · The ENGINE derives what is MECHANICAL — UCA candidates come from
//     STPA.ucaSeeds over the accepted control structure, five-part phrasing
//     and all. The model never writes a UCA: deriving them by construction
//     beats asking a model to be exhaustive.
//   · The HUMAN dispositions EVERYTHING — UCA dispositions, scenario
//     dismissals (rationale demanded), abstraction level, approvals. None
//     of that is touchable from this lane.
//
// This module is the pure, unit-tested apply: validate the parsed draft,
// refuse dishonest applications (no store, non-empty analysis, dangling
// refs), mint ids, write ONCE. ai_assistant.js owns the model call and the
// review panel; it hands the accepted draft here.
// ============================================================================
(function () {
    'use strict';

    function _bad(reason) { return { ok: false, reason: 'STPA draft refused — ' + reason }; }
    const _s = v => String(v == null ? '' : v).trim();
    const _arr = v => Array.isArray(v) ? v : [];

    // apply(sd, parsed, prov) → { ok, counts } | { ok:false, reason }
    //   sd     — the live stpaData object (panel-shaped)
    //   parsed — { losses:[{text}], hazards:[{text, lossRefs:[1-based]}],
    //             constraints:[{text, hazardRefs:[1-based]}],
    //             controllers:[{name}], processes:[{name}],
    //             actions:[{name, from:1-based controller, to:1-based process}],
    //             feedbacks:[{name, from:1-based process, to:1-based controller}] }
    //   prov   — { model, at } stamped onto every row
    function apply(sd, parsed, prov) {
        if (!sd || !sd.cs) return _bad('no STPA store — turn the STPA lane on in Program Planning → Program scope first (it is opt-in by design)');
        if ((sd.losses || []).length || (sd.hazards || []).length)
            return _bad('this analysis already has content (' + (sd.losses || []).length + ' losses, ' + (sd.hazards || []).length + ' hazards) — the draft seeds an EMPTY analysis; extending a living one stays human');
        if (!parsed) return _bad('nothing parsed');
        const losses = _arr(parsed.losses).map(x => _s(x && x.text)).filter(t => t.length >= 5);
        const hazards = _arr(parsed.hazards);
        const constraints = _arr(parsed.constraints);
        const controllers = _arr(parsed.controllers).map(x => _s(x && x.name)).filter(Boolean);
        const processes = _arr(parsed.processes).map(x => _s(x && x.name)).filter(Boolean);
        if (!losses.length) return _bad('no usable losses in the draft — the spine hangs off them');
        if (!hazards.length) return _bad('no hazards in the draft');
        if (!controllers.length || !processes.length) return _bad('a control structure needs at least one controller and one controlled process');

        prov = prov || {};
        const stamp = { aiGenerated: true, aiFeature: 'stpa.draft', aiModel: prov.model || null, aiAt: prov.at || new Date().toISOString() };

        // ---- validate refs BEFORE writing anything (all-or-nothing) ---------
        for (let i = 0; i < hazards.length; i++) {
            const h = hazards[i];
            if (_s(h && h.text).length < 5) return _bad('hazard #' + (i + 1) + ' has no usable text');
            const refs = _arr(h.lossRefs);
            if (!refs.length) return _bad('hazard #' + (i + 1) + ' links to no loss — a hazard that leads to no loss is not a hazard');
            for (const r of refs) if (!(r >= 1 && r <= losses.length)) return _bad('hazard #' + (i + 1) + ' references loss ' + r + ' which the draft does not contain');
        }
        for (let i = 0; i < constraints.length; i++) {
            const c = constraints[i];
            if (_s(c && c.text).length < 5) return _bad('constraint #' + (i + 1) + ' has no usable text');
            for (const r of _arr(c.hazardRefs)) if (!(r >= 1 && r <= hazards.length)) return _bad('constraint #' + (i + 1) + ' references hazard ' + r + ' which the draft does not contain');
        }
        const actions = _arr(parsed.actions), feedbacks = _arr(parsed.feedbacks);
        for (let i = 0; i < actions.length; i++) {
            const a = actions[i];
            if (!_s(a && a.name)) return _bad('control action #' + (i + 1) + ' has no name');
            if (!(a.from >= 1 && a.from <= controllers.length)) return _bad('control action #' + (i + 1) + ': FROM controller ' + (a && a.from) + ' does not exist in the draft');
            if (!(a.to >= 1 && a.to <= processes.length)) return _bad('control action #' + (i + 1) + ': TO process ' + (a && a.to) + ' does not exist in the draft');
        }
        for (let i = 0; i < feedbacks.length; i++) {
            const f = feedbacks[i];
            if (!_s(f && f.name)) return _bad('feedback #' + (i + 1) + ' has no name');
            if (!(f.from >= 1 && f.from <= processes.length)) return _bad('feedback #' + (i + 1) + ': FROM process ' + (f && f.from) + ' does not exist in the draft');
            if (!(f.to >= 1 && f.to <= controllers.length)) return _bad('feedback #' + (i + 1) + ': TO controller ' + (f && f.to) + ' does not exist in the draft');
        }

        // ---- mint ids + write (single pass, refs by minted id) --------------
        sd.losses = losses.map((t, i) => Object.assign({ id: 'L-' + (i + 1), text: t }, stamp));
        sd.hazards = hazards.map((h, i) => Object.assign({ id: 'H-' + (i + 1), text: _s(h.text),
            lossIds: _arr(h.lossRefs).map(r => 'L-' + r) }, stamp));
        sd.constraints = constraints.map((c, i) => Object.assign({ id: 'SC-' + (i + 1), text: _s(c.text),
            hazardIds: _arr(c.hazardRefs).map(r => 'H-' + r) }, stamp));
        sd.cs.controllers = controllers.map((n, i) => Object.assign({ id: 'C' + (i + 1), name: n }, stamp));
        sd.cs.processes = processes.map((n, i) => Object.assign({ id: 'P' + (i + 1), name: n }, stamp));
        sd.cs.actions = actions.map((a, i) => Object.assign({ id: 'CA' + (i + 1), name: _s(a.name),
            from: 'C' + a.from, to: 'P' + a.to }, stamp));
        sd.cs.feedbacks = feedbacks.map((f, i) => Object.assign({ id: 'FB' + (i + 1), name: _s(f.name),
            from: 'P' + f.from, to: 'C' + f.to }, stamp));

        return { ok: true, counts: { losses: sd.losses.length, hazards: sd.hazards.length, constraints: sd.constraints.length,
                 controllers: sd.cs.controllers.length, processes: sd.cs.processes.length,
                 actions: sd.cs.actions.length, feedbacks: sd.cs.feedbacks.length },
                 note: 'Spine + control structure seeded with provenance. UCA candidates now derive MECHANICALLY from the engine (STPA walkthrough Step 3) — the model never writes a UCA; you disposition every one.' };
    }

    const API = { apply };
    if (typeof window !== 'undefined') window.STPA_AI_APPLY = API;
    if (typeof module !== 'undefined') module.exports = API;
})();
