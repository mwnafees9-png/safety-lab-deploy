// 27 Oct 2026 (customer report, Waqas): the node shows ONE line, its probability per flight and per flight hour.
// Every other note about a node lives in the warning pill at the bottom of the canvas and in the node's
// properties box. ftaNodeWarnings is the one place those notes are worded; the pill, the properties
// box and formatNodeActualLine all read it, so the three can never say different things.
//   node   the fault tree node (data object, not the d3 wrapper)
//   isRoot true when the node is the top event of the tree on screen
// Returns [{ key, sev: 'warn' | 'info', title, text }]: key groups the same finding across nodes,
// title is the pill list's one-line heading for the group, text is this node's full message.
function ftaNodeWarnings(node, isRoot) {
    const out = [];
    if (!node) return out;
    const leaf = node.type !== 'gate';
    const fmt = v => (v && isFinite(v)) ? Number(v).toExponential(2).toUpperCase() : '0';
    if (leaf && node._sharedStrictest) {
        out.push({ key: 'shared-strictest', sev: 'warn',
            title: 'Held at the strictest allocation shared with another tree',
            text: 'Held at the strictest allocation across ' + node._sharedStrictest.instances +
                  ' trees (from ' + (node._sharedStrictest.fromPageName || 'another tree') + ')' });
    }
    if (leaf && node._sharedStrictestConflict) {
        out.push({ key: 'shared-conflict', sev: 'warn',
            title: 'Shared across trees with different exposure models',
            text: 'Shared across trees with different exposure models: no strictest requirement applied' });
    }
    if (leaf && node._feasibilityViolation) {
        const v = node._feasibilityViolation;
        out.push({ key: 'feasibility', sev: 'warn',
            title: 'Budget is stricter than the part can achieve',
            text: 'The part can achieve P=' + fmt(v.achievable) +
                  (v.achievableLambda ? ' (from an achievable rate of ' + fmt(v.achievableLambda) + '/hr over the exposure time)' : '') +
                  ', but its allocated budget is P=' + fmt(v.allocated) + '. It would need to be ' +
                  (isFinite(v.delta) ? Number(v.delta).toFixed(1) : '?') +
                  ' times more reliable than it can be. An architecture change or a higher grade part is needed.' });
    }
    if (leaf) return out;
    if (node._probCompromised) {
        out.push({ key: 'independence', sev: 'warn',
            title: 'Independence compromised: a common-cause (β) term is needed',
            text: 'Independence compromised: common-cause (β) term required' });
    }
    // Dynamic gates say how their static number was done (13 Oct 2026 math audit F4 / fix G).
    const ds = node._dynStatic, exact = !!(ds && ds.mode === 'exact');
    const why = (ds && ds.reason) ? ' (' + ds.reason + ')' : '';
    if (node.gateType === 'SPARE') {
        out.push(exact
            ? { key: 'dyn-spare-exact', sev: 'info', title: 'Spare gate solved exactly',
                text: 'Spare solved exactly in the static number (standby, switch and time order included)' }
            : { key: 'dyn-spare-bound', sev: 'info', title: 'Spare gate: static number is an upper bound',
                text: 'Static number is an upper bound for this spare: primary AND (switch fails OR spare)' + why + '; DFT Monte-Carlo gives the time-ordered value' });
    } else if (node.gateType === 'PAND') {
        out.push(exact
            ? { key: 'dyn-pand-exact', sev: 'info', title: 'Priority AND solved exactly',
                text: 'Priority AND solved exactly in the static number (failure order included)' }
            : { key: 'dyn-pand-bound', sev: 'info', title: 'Priority AND: static number is an upper bound',
                text: 'Static number is an upper bound for this priority AND: all inputs failed, any order' + why + '; DFT Monte-Carlo gives the order-aware value' });
    } else if (node.gateType === 'SEQ') {
        out.push(exact
            ? { key: 'dyn-seq-exact', sev: 'info', title: 'Sequence gate solved exactly',
                text: 'Sequence gate solved exactly in the static number (inputs fail one after another, left to right)' }
            : { key: 'dyn-seq-bound', sev: 'info', title: 'Sequence gate: static number is an upper bound',
                text: 'Static number is an upper bound for this sequence gate: all inputs failed, any order' + why + '; DFT Monte-Carlo gives the sequence-aware value' });
    } else if (node.gateType === 'NOT') {
        out.push({ key: 'dyn-not', sev: 'info', title: 'NOT gate: non-coherent logic',
            text: 'NOT gate: non-coherent logic. P(top) is exact; cut sets are listed as prime implicants ("NOT X" means X does not occur)' });
    } else if (node.gateType === 'FDEP') {
        out.push({ key: 'dyn-fdep', sev: 'info', title: 'Functional dependency',
            text: 'Functional dependency: when the trigger fails, its dependent events count as failed in the static number' });
    }
    // Top event of an allocation tree: the exact total of the tree as built against the target the
    // engineer set. Only when they differ by more than 1% (Phase 56.43f): when the allocator closes
    // the budget the two agree and there is nothing to say.
    if (isRoot && typeof ftaConfig === 'object' && ftaConfig && ftaConfig.mode === 'top-down' &&
        typeof node._bddActualProb === 'number' && isFinite(node._bddActualProb)) {
        const target = (typeof node.probability === 'number' && isFinite(node.probability)) ? node.probability : null;
        const aP = node._bddActualProb;
        const rel = (target !== null && target > 0) ? Math.abs(aP - target) / target : null;
        if (rel === null || rel >= 0.01) {
            const worse = target !== null && aP > target;
            const pct = rel === null ? '' : ' (' + (rel * 100).toFixed(rel < 0.1 ? 1 : 0) + '% ' + (worse ? 'over' : 'under') + ')';
            out.push({ key: worse ? 'actual-over' : 'actual-under', sev: worse ? 'warn' : 'info',
                title: worse ? 'Top event: the tree adds up to more than the target' : 'Top event: the tree adds up to less than the target',
                text: 'Actual (exact): P=' + fmt(aP) + (target !== null ? ' against the target P=' + fmt(target) + pct : '') +
                      '. The exact total of the tree as built, with repeated events and AND gates counted exactly.' });
        }
    }
    return out;
}

// Kept for callers outside the canvas (and the dynamic-gate tests): the first note on a node, as one
// string with its ⚠ (warning) or △ (information) mark, or '' when there is nothing to say.
function formatNodeActualLine(d) {
    const node = d && d.data;
    if (!node) return '';
    const isRoot = (typeof getActiveFTARoot === 'function') ? (getActiveFTARoot() === node) : false;
    const w = ftaNodeWarnings(node, isRoot);
    if (!w.length) return '';
    return (w[0].sev === 'warn' ? '⚠ ' : '△ ') + w[0].text;
}
