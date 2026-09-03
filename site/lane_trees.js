// ============================================================================
// lane_trees.js — v1.2 — B3: tree generation from the MAC, CoFFE,
// interdependence and common-resource lanes (21 Aug 2026).
//
// THE TARGET SHAPE IS ARP4761A FIGURE Q.4-1 (Waqas, 21 Aug: "go through the
// screenshots"). For FC 3.2.2.TL.A the example tree is:
//
//   TOP (the FC)  — OR
//   ├─ <FC>.COFFE — the AVAILABILITY gate: the MAC breach structure, one
//   │   branch per contributing SYSTEM FUNCTION (the Q.4-1 interdependence
//   │   row), each branch an OR of
//   │     · the function's own loss event, and
//   │     · one resource-loss event per Q.4-2 CRA cross — SHARED events
//   │       (AGS.MF appears under both GSS and TRS with a repeat marker):
//   │       same logicalId, so BDD folding sees one physical event.
//   └─ FF5.3-style MALFUNCTION RESIDUE — signed CoFFE cases the availability
//       model cannot compute, hanging OUTSIDE the availability gate.
//
// THREE TOP EVENTS PER DECLARATION (OPEN_ITEMS B3): total loss, partial loss,
// malfunction are three DIFFERENT conditions at three different severities —
// three pages, not three branches. Each binds to ITS OWN classified AFHA
// condition through the FCIM row's TL/PL/M ids. Where the same condition id
// carries several phase-group rows (the Appendix Q FHA: 3.2.2.TL.U is Major
// in Taxi, Catastrophic in Landing), THE TREE IS FOR THE WORST CASE — ruled
// by Waqas, 21 Aug: "fault trees will only be for the worst case". _NO_DEFAULTS:
// an unbound lane refuses with a named finding, never a guessed severity.
//
// EQUIVALENCE, RESTATED FOR THE ENRICHED TREE. The theorem macCompile proves
// (cutsets ≡ breach sets) applies to the MAC SKELETON. Resource events widen
// the tree beyond the model on purpose — that is the common-cause route the
// Q.4-2 table exists to expose — so verification here is two properties:
//   [1] SKELETON: with CRA events and CoFFE residue stripped, the BDD minimal
//       cutsets equal the lane's sets exactly (breach sets / partial sets /
//       arbitration combinations).
//   [2] ROUTES: every generated resource event appears under exactly the
//       member branches the declared data serves — no invented coupling.
//
// PROVENANCE ON EVERY GENERATED NODE: _laneProv = { lane, source, ref }.
// sources: 'fc' (the top), 'mac' (skeleton), 'cra' (resource events),
// 'coffe' (signed residue, carries the signer). Ids come from the project
// numbering scheme via makeSharedId (stable across regenerates); hardcoded
// prefixes are the engine-absent fallback only.
//
// REGENERATE-AS-DIFF: stable page ids, per-lane fingerprints over every
// input lane (rule + arbitration + binding + CRA linkage + signed verdicts),
// added/removed set diff reported on every recompile.
//
// Interdependence contributors the MAC does not cover are NAMED FINDINGS on
// the desk — a signed "contributes" cell is a question for the engineer, not
// licence to invent a branch (ruled with the screenshots, 21 Aug).
//
// BORN MODULAR: reads app globals guardedly, wraps renderMfmsPanel for its
// desk. Zero monolith edits. window.SLLaneTrees + module.exports (tests).
// ============================================================================
(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.SLLaneTrees = api;
}(this, function () {
    'use strict';

    var LANES = [
        { key: 'tl',  lane: 'total-loss',   mode: 'TL', label: 'Total loss' },
        { key: 'pl',  lane: 'partial-loss', mode: 'PL', label: 'Partial loss' },
        { key: 'mal', lane: 'malfunction',  mode: 'M',  label: 'Malfunction' }
    ];

    // ---- guarded app-global access (rule 5: SLEnv.get, never window[name];
    // indirect eval is the fallback for environments without SLEnv) ----------
    function G(name) {
        try {
            var E = (typeof SLEnv !== 'undefined') ? SLEnv : (typeof window !== 'undefined' ? window.SLEnv : null);
            if (E && typeof E.get === 'function') { var v = E.get(name); if (v !== undefined) return v; }
        } catch (_) {}
        try { return (0, eval)('typeof ' + name + ' !== "undefined" ? ' + name + ' : undefined'); } catch (_) { return undefined; }
    }
    function pc() { return G('projectConfig') || {}; }
    function rules() { return (pc().macModels || []).filter(Boolean); }
    function ruleById(id) { return rules().find(function (r) { return String(r.id) === String(id); }) || null; }
    function fhaRows() { return G('acFhaData') || []; }
    function fcimRows() { return G('acFcimData') || []; }
    function resources() { return G('resourcesData') || []; }
    function systems() { return G('systemsData') || []; }
    function pages() { return G('ftaPages') || []; }
    function nextId() {
        // internalIdCounter is a shared top-level binding across the app scripts.
        try { return (0, eval)('internalIdCounter++'); } catch (_) { return Math.floor(1e9 + (Date.now ? 0 : 0)) + (nextId._f = (nextId._f || 0) + 1); }
    }
    function resolveFn(id) {
        var r = {};
        try { var R = G('SLFnResolve'); if (R && R.resolve) r = R.resolve(id) || {}; } catch (_) {}
        if (!r.kind || r.kind === 'unknown') {
            // v1.1 (live-found on K350): fn_resolver classifies SYSTEM artifacts,
            // but a MAC rule's subId is an AIRCRAFT sub-function — the function
            // the floor protects. Resolve those here so functionOf never calls a
            // real declaration "unknown" (and gate names read the function, not
            // a raw SF- id).
            try {
                var af = (G('acFunctionsData') || []).find(function (f) { return f && String(f.subId) === String(id); });
                if (af) return { kind: 'function', label: af.subName || af.funcName || String(id), aircraft: true };
            } catch (_) {}
        }
        return r;
    }
    function fnLabel(id) { var r = resolveFn(id); return r.label || String(id); }
    function fnOwnerSystem(id) {
        var r = resolveFn(id);
        if (r.systemId) return systems().find(function (s) { return s.id === r.systemId; }) || null;
        return null;
    }
    function fnv(x) { try { var f = G('_ckptFnv'); if (f) return f(JSON.stringify(x)); } catch (_) {}
        var s = JSON.stringify(x), h = 0x811c9dc5;
        for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
        return ('0000000' + h.toString(16)).slice(-8);
    }

    // ---- numbering: scheme first, hardcoded prefix only as fallback ---------
    function mintShared(kind, key, ctx, fallback) {
        try {
            var N = G('SafetyLabNumbering'), scheme = G('slNumberingScheme'), store = G('slNumberingStore');
            var cf = G('_slNumberCtx');
            if (N && scheme && store) return N.makeSharedId(scheme, kind, key, Object.assign(typeof cf === 'function' ? cf() : {}, ctx || {}), store);
        } catch (_) {}
        return fallback;
    }

    // ---- lane → classified condition binding (worst case, _NO_DEFAULTS) -----
    // The FCIM row for the function names the TL / PL / M condition ids
    // (tlId / plId / mId, plus plExtra/mExtra); the classified AFHA rows carry
    // those ids. Among a condition's phase-group rows THE WORST SEVERITY WINS
    // (Waqas, 21 Aug: "fault trees will only be for the worst case") — same
    // posture as _macFcForRule.
    var SEV_RANK = { Catastrophic: 5, Hazardous: 4, Major: 3, Minor: 2, Negligible: 1 };
    function fcimFor(subId) {
        var rows = fcimRows().filter(function (r) { return r && String(r.subId) === String(subId); });
        return rows.find(function (r) { return String(r.awareness || '').toLowerCase() === 'aware'; }) || rows[0] || null;
    }
    function laneConditionIds(subId, laneKey) {
        var row = fcimFor(subId);
        if (!row) return [];
        var ids = [];
        if (laneKey === 'tl' && row.tlId) ids.push(row.tlId);
        if (laneKey === 'pl') { if (row.plId) ids.push(row.plId); (row.plExtra || []).forEach(function (e) { if (e && e.id) ids.push(e.id); }); }
        if (laneKey === 'mal') { if (row.mId) ids.push(row.mId); (row.mExtra || []).forEach(function (e) { if (e && e.id) ids.push(e.id); }); }
        return ids;
    }
    function bindLane(rule, laneKey) {
        var ids = laneConditionIds(rule.subId, laneKey);
        var cands = fhaRows().filter(function (f) {
            if (String(f.subId) !== String(rule.subId)) return false;
            return ids.indexOf(f.fcId) !== -1;
        });
        if (!cands.length && laneKey === 'tl') {
            // TL keeps macCompile's reach: the function's worst classified row.
            cands = fhaRows().filter(function (f) { return String(f.subId) === String(rule.subId); });
        }
        if (!cands.length) {
            var ln = LANES.find(function (l) { return l.key === laneKey; });
            return { fc: null, finding: 'No classified ' + ln.label.toLowerCase() + ' condition bound for ' + rule.subId +
                     (ids.length ? ' — the FCIM names ' + ids.join(', ') + ' but no FHA row classifies it. Classify it first.'
                                 : ' — author the FCIM ' + ln.mode + ' cell and its FHA row first. The tool never guesses a severity.') };
        }
        var pool = cands.slice().sort(function (a, b) { return (SEV_RANK[b.severity] || 0) - (SEV_RANK[a.severity] || 0); });
        return { fc: pool[0], finding: null };
    }

    // ---- CRA: resources serving a member function ---------------------------
    // A resource serves member m (a system function) when the engineer's data
    // says so: a CRA cell text on m's column, or a declared provide/consume
    // touching m's owner system (coarse — flagged, never silent). Mode rows
    // follow bindings_modules' _CRA_MODES vocabulary.
    function craModeForLane(laneKey) { return laneKey === 'tl' ? ['Total loss'] : laneKey === 'pl' ? ['Partial loss', 'Degraded'] : []; }
    function resourcesServing(rule, fc, member, laneKey) {
        var out = [];
        var own = fnOwnerSystem(member);
        var cra = (pc().interdep && pc().interdep.cra) || {};
        resources().forEach(function (r) {
            craModeForLane(laneKey).forEach(function (mode) {
                var resKey = (r.internalId || r.resId) + '·' + mode;
                var cellTxt = fc ? (cra[String(fc.internalId) + '§' + resKey + '§fn:' + member] || '') : '';
                var declared = (r.providedByFunctions || []).indexOf(member) !== -1;
                var coarse = !declared && !cellTxt && own &&
                    ((r.consumedBySystems || []).indexOf(own.id) !== -1 || (r.providedBy || []).indexOf(own.id) !== -1);
                if (cellTxt || declared || coarse) out.push({ res: r, mode: mode, coarse: !!coarse && !cellTxt && !declared, why: cellTxt || null });
            });
        });
        return out;
    }

    // ---- node builders (provenance on every node) ---------------------------
    function prov(node, lane, source, ref) { node._laneProv = { lane: lane, source: source, ref: ref || null }; return node; }
    function memberEvent(member, lane, laneKey) {
        var label = fnLabel(member);
        var verb = laneKey === 'pl' ? ' — partial loss of function' : laneKey === 'mal' ? ' malfunction (adverse action)' : ' — total loss of function';
        var logical = (laneKey === 'mal' ? 'macmal:' : 'macsys:') + member;
        var did = mintShared('basicEvent', logical, { SYS: label }, (laneKey === 'mal' ? 'MAL·' : 'MAC·') + String(label).slice(0, 14));
        return prov({ id: nextId(), logicalId: logical, displayId: did, name: label + verb,
                      type: 'basic', probability: 0, children: [], _macProvenance: 'compiled' }, lane, 'mac', member);
    }
    function degEvent(tok, rule, lane) {
        var rest = tok.slice(4), cut = rest.indexOf(':');
        var sysId = rest.slice(0, cut), label = rest.slice(cut + 1);
        var s = systems().find(function (x) { return x.id === sysId; }) || { name: String(sysId) };
        var row = (rule.degraded || []).find(function (d) { return d && d.sysId === sysId && d.label === label; }) || {};
        var did = mintShared('basicEvent', 'macdeg:' + sysId + ':' + label, { SYS: s.name }, 'MAC·' + s.name.slice(0, 10) + '·deg');
        return prov({ id: nextId(), logicalId: 'macdeg:' + sysId + ':' + label, displayId: did,
                      name: s.name + ' degraded — ' + label + (row.weight != null ? ' (retains ' + row.weight + ')' : ''),
                      type: 'basic', probability: 0, children: [], _macProvenance: 'compiled' }, lane, 'mac', tok);
    }
    function resourceEvent(entry, lane) {
        var r = entry.res;
        var logical = 'macres:' + (r.internalId || r.resId) + ':' + entry.mode;
        var did = mintShared('basicEvent', logical, { SYS: r.name || r.resId }, 'RES·' + String(r.name || r.resId).slice(0, 12));
        return prov({ id: nextId(), logicalId: logical, displayId: did,
                      name: (entry.mode === 'Total loss' ? 'Loss of ' : entry.mode + ' of ') + (r.name || r.resId) + ' for this function' + (entry.coarse ? ' (system-level linkage — refine to a function)' : ''),
                      type: 'basic', probability: 0, children: [], _macProvenance: 'compiled-cra', _laneCoarse: !!entry.coarse },
                    lane, 'cra', (r.resId || r.internalId) + '·' + entry.mode);
    }
    // FF branch (Q.4-1): the member's own loss OR its resource routes.
    function ffBranch(member, rule, fc, lane, laneKey) {
        var base = memberEvent(member, lane, laneKey);
        var served = resourcesServing(rule, fc, member, laneKey);
        if (!served.length) return base;
        var kids = [base].concat(served.map(function (e) { return resourceEvent(e, lane); }));
        var label = fnLabel(member);
        var gid = mintShared('gate', 'laneff:' + rule.id + ':' + laneKey + ':' + member, { SYS: label }, 'FF·' + String(label).slice(0, 12));
        return prov({ id: nextId(), logicalId: 'laneff:' + member, displayId: gid,
                      name: (laneKey === 'pl' ? 'Partial loss of ' : 'Loss of ') + label + ' function',
                      type: 'gate', gateType: 'OR', probability: 0, children: kids, _macProvenance: 'compiled' }, lane, 'mac', member);
    }

    // ---- CoFFE residue: signed YES the model cannot compute -----------------
    function coffeResidue(rule, fc, laneKey) {
        if (!fc) return [];
        var V = (pc().coffe && pc().coffe.verdicts) || {};
        var out = [];
        Object.keys(V).forEach(function (k) {
            if (k.indexOf(String(fc.internalId) + '§') !== 0 || V[k].verdict !== 'yes') return;
            var key = k.split('§')[1];
            var parts = key.split('∧').map(function (seg) { var i = seg.lastIndexOf('='); return { sysId: seg.slice(0, i), state: seg.slice(i + 1) }; });
            var hasMal = parts.some(function (p) { return p.state === 'malfunction'; });
            if (laneKey === 'pl') return;                                // partial loss carries no residue
            if (laneKey === 'mal' && !hasMal) return;                    // the mal lane takes only malfunction cases signed on ITS condition
            if (laneKey === 'tl' && !hasMal) {
                // Availability case: residue only where the model does not
                // already own it. Malfunction cases ALWAYS ride the TL tree —
                // the FF5.3 position in Figure Q.4-1, outside the availability gate.
                var computed = null;
                try { var cc = G('coffeComputed'); if (cc) computed = cc(fc, { parts: parts, key: key }); } catch (_) {}
                if (computed === 'yes') return;
            }
            out.push({ key: key, parts: parts, verdict: V[k] });
        });
        return out;
    }
    function residueBranch(item, lane) {
        var mk = function (p) {
            var s = systems().find(function (x) { return x.id === p.sysId; }) || { name: String(p.sysId) };
            var mal = p.state === 'malfunction';
            var logical = (mal ? 'macmal:' : 'macsys:') + p.sysId;
            var did = mintShared('basicEvent', logical, { SYS: s.name }, (mal ? 'MAL·' : 'MAC·') + s.name.slice(0, 14));
            return prov({ id: nextId(), logicalId: logical, displayId: did,
                          name: s.name + (mal ? ' malfunction (adverse action)' : ' failed / unavailable'),
                          type: 'basic', probability: 0, children: [], _macProvenance: 'authored-malfunction' },
                        lane, 'coffe', item.key);
        };
        var node;
        if (item.parts.length === 1) node = mk(item.parts[0]);
        else node = prov({ id: nextId(), logicalId: 'lanecoffe:' + item.key, displayId: mintShared('gate', 'lanecoffe:' + item.key, {}, 'COFFE-AND'),
                           name: 'Combined: ' + item.parts.map(function (p) { var s = systems().find(function (x) { return x.id === p.sysId; }); return (s ? s.name : p.sysId) + ' ' + p.state; }).join(' ∧ '),
                           type: 'gate', gateType: 'AND', probability: 0,
                           children: item.parts.map(mk), _macProvenance: 'authored-malfunction' }, lane, 'coffe', item.key);
        node._macGraft = item.key;
        node._laneProv.by = item.verdict.by || null;
        node._laneProv.at = item.verdict.at || null;
        return node;
    }

    // ---- lane sets (the truth each skeleton must equal) ---------------------
    function laneSets(rule, laneKey) {
        var bsc = G('macBreachSetsChecked');
        var bc = bsc ? bsc(rule) : { sets: [], error: 'engine absent' };
        if (bc.error) return { error: bc.error };
        var M = G('SLMacLanes');
        if (!M) return { error: 'SLMacLanes absent' };
        var sevRow = bindLane(rule, 'tl');
        var L = M.lanes(rule, bc.sets, sevRow.fc ? sevRow.fc.severity : '', function (id) { return resolveFn(id); });
        if (laneKey === 'tl') return { sets: bc.sets, lanes: L };
        if (laneKey === 'pl') return { sets: L.partialLoss.sets, lanes: L };
        if (!L.arbitration.declared) return { error: L.arbitration.finding || 'arbitration undeclared', lanes: L };
        return { sets: L.malfunction.sets.map(function (s) { return s.slice(); }), lanes: L, malfunction: L.malfunction };
    }

    // ---- skeleton verification (property [1]) -------------------------------
    function stripEnrichment(node) {
        if (!node) return node;
        var kids = (node.children || [])
            .filter(function (c) { return !c._macGraft && c._macProvenance !== 'compiled-cra'; })
            .map(stripEnrichment)
            .filter(function (c) { return c.type !== 'gate' || (c.children || []).length; });
        return Object.assign({}, node, { children: kids, _children: undefined });
    }
    function verifySkeleton(root, sets, laneKey) {
        try {
            var bdd = G('bddMinimalCutsets');
            if (!bdd) return null;   // engine absent → unverified, stated
            var got = (bdd(stripEnrichment(root)) || []).map(function (cs) {
                return cs.map(function (n) {
                    return String(n.logicalId || '').replace(/^macsys:/, '').replace(/^macmal:/, '').replace(/^macdeg:/, 'deg:');
                }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort().join('|');
            }).sort();
            var want = sets.map(function (s) { return s.slice().sort().join('|'); }).sort();
            return want.length === got.length && want.every(function (w, i) { return w === got[i]; });
        } catch (_) { return false; }
    }
    // property [2]: each resource event sits under exactly the members served.
    function verifyRoutes(root, rule, fc, laneKey) {
        var seen = {};   // logicalId → set of member ids whose branch holds it
        (root.children || []).forEach(function walkTop(branch) {
            var member = branch._laneProv && branch._laneProv.source === 'mac' && branch._laneProv.ref;
            (branch.children || []).forEach(function (c) {
                if (c._macProvenance === 'compiled-cra') {
                    (seen[c.logicalId] = seen[c.logicalId] || []).push(member);
                }
            });
        });
        var M = G('SLMacLanes');
        var members = M ? M.members(rule) : [];
        var ok = true;
        Object.keys(seen).forEach(function (lid) {
            var m = lid.match(/^macres:(.*):([^:]*)$/);
            if (!m) { ok = false; return; }
            members.forEach(function (mem) {
                var served = resourcesServing(rule, fc, mem, laneKey).some(function (e) {
                    return 'macres:' + (e.res.internalId || e.res.resId) + ':' + e.mode === lid;
                });
                var present = seen[lid].indexOf(mem) !== -1;
                if (served !== present) ok = false;
            });
        });
        return ok;
    }

    // ---- interdependence coverage findings ----------------------------------
    function idpFindings(rule, fc) {
        var out = [];
        if (!fc) return out;
        try {
            var fns = G('idpContributorFns');
            var M = G('SLMacLanes');
            if (!fns || !M) return out;
            var members = M.members(rule);
            (fns(fc) || []).forEach(function (funcId) {
                if (members.indexOf(funcId) !== -1) return;
                var served = resourcesServing(rule, fc, funcId, 'tl').length || resourcesServing(rule, fc, funcId, 'pl').length;
                out.push({ kind: 'idp-uncovered', member: funcId,
                    msg: fnLabel(funcId) + ' contributes to ' + (fc.fcId || 'this condition') + ' per the interdependence row but no MAC clause covers it' +
                         (served ? ' (it does appear as a resource route)' : '') + ' — add it to a clause or record why the floor excludes it.' });
            });
        } catch (_) {}
        return out;
    }

    // ---- fingerprints (regenerate-as-diff over EVERY feeding lane) ----------
    function laneFp(rule, laneKey, fc) {
        var base;
        try { var f = G('_macRuleFp'); base = f ? f(rule) : null; } catch (_) { base = null; }
        var cra = [];
        var M = G('SLMacLanes');
        (M ? M.members(rule) : []).forEach(function (mem) {
            resourcesServing(rule, fc, mem, laneKey).forEach(function (e) {
                cra.push(mem + '|' + (e.res.resId || e.res.internalId) + '|' + e.mode + '|' + (e.coarse ? 'c' : 'd'));
            });
        });
        var residue = coffeResidue(rule, fc, laneKey).map(function (i) { return i.key; }).sort();
        return fnv([base, laneKey, fc ? fc.internalId : null, rule.arbitration || null, cra.sort(), residue]);
    }

    function store() {
        var p = pc();
        if (!p.laneCompiled) p.laneCompiled = {};
        return p.laneCompiled;
    }
    function status(ruleId, laneKey) {
        var rule = ruleById(ruleId);
        var rec = (store()[ruleId] || {})[laneKey];
        if (!rule || !rec || !pages().some(function (p) { return p.id === rec.pageId; })) return 'missing';
        var b = bindLane(rule, laneKey);
        return rec.fp === laneFp(rule, laneKey, b.fc) ? 'fresh' : 'stale';
    }

    // ---- the compile ---------------------------------------------------------
    function compileLane(rule, laneKey) {
        var ln = LANES.find(function (l) { return l.key === laneKey; });
        var b = bindLane(rule, laneKey);
        if (!b.fc) return { ok: false, reason: b.finding };
        var ls = laneSets(rule, laneKey);
        if (ls.error) return { ok: false, reason: ls.error };
        if (!ls.sets.length) return { ok: false, reason: 'the ' + ln.label.toLowerCase() + ' lane derives no sets — nothing to generate' };
        var lane = ln.lane, fc = b.fc;

        // availability gate children — the MAC skeleton, members enriched into
        // FF branches (Q.4-1). Malfunction lane: arbitration gate, mal events.
        var kids = [];
        if (laneKey === 'mal') {
            var arb = ls.lanes.arbitration;
            var evs = arb.of.map(function (m) { return ffBranch(m, rule, fc, lane, 'mal'); });
            var g = arb.k === 1 ? 'OR' : (arb.k === arb.of.length ? 'AND' : 'VOTING');
            if (g === 'OR') kids = evs;
            else {
                var mg = prov({ id: nextId(), logicalId: 'lanemal:' + rule.id, displayId: mintShared('gate', 'lanemal:' + rule.id, {}, 'MAL-' + arb.k + 'oo' + arb.of.length),
                    name: (g === 'AND' ? 'All' : '≥' + arb.k) + ' of the arbitrated set erroneous — arbitration (' + arb.scheme + ') defeated',
                    type: 'gate', gateType: g, probability: 0, children: evs, _macProvenance: 'compiled' }, lane, 'mac', 'arbitration');
                if (g === 'VOTING') mg.votingK = arb.k;
                kids = [mg];
            }
        } else {
            ls.sets.forEach(function (set) {
                var evs = set.map(function (key) { return String(key).indexOf('deg:') === 0 ? degEvent(key, rule, lane) : ffBranch(key, rule, fc, lane, laneKey); });
                if (evs.length === 1) { kids.push(evs[0]); return; }
                kids.push(prov({ id: nextId(), logicalId: 'lanebrch:' + rule.id + ':' + kids.length, displayId: mintShared('gate', 'lanebrch:' + rule.id + ':' + laneKey + ':' + set.slice().sort().join('|'), {}, 'MAC-BRCH'),
                    name: 'Configuration below the floor: { ' + set.map(function (k) { return String(k).indexOf('deg:') === 0 ? k.slice(4).replace(':', ' degraded: ') : fnLabel(k); }).join(' ∧ ') + ' }',
                    type: 'gate', gateType: 'AND', probability: 0, children: evs, _macProvenance: 'compiled' }, lane, 'mac', set.join('|')));
            });
        }
        var availName = laneKey === 'tl' ? 'Below the minimum acceptable configuration — ' : laneKey === 'pl' ? 'Configuration reduced within MAC — ' : 'Arbitrated malfunction — ';
        var avail = prov({ id: nextId(), logicalId: 'lanegate:' + rule.id + ':' + laneKey,
            displayId: mintShared('gate', 'lanegate:' + rule.id + ':' + laneKey, { PARENT: fc.fcId, MODE: ln.mode }, (fc.fcId || 'FC') + '.COFFE'),
            name: availName + fnLabel(rule.subId),
            type: 'gate', gateType: 'OR', probability: 0, children: kids, _macProvenance: 'compiled' }, lane, 'mac', rule.id);

        var residue = coffeResidue(rule, fc, laneKey).map(function (i) { return residueBranch(i, lane); });
        var topKids = [avail].concat(residue);
        var root = prov({ id: nextId(), logicalId: 'lanetop:' + rule.id + ':' + laneKey,
            displayId: mintShared('faultTree', 'lanetop:' + rule.id + ':' + laneKey, { PARENT: fc.fcId, MODE: ln.mode }, 'TOP-' + (fc.fcId || rule.subId)),
            name: fc.fcDesc || fc.fcId, type: 'gate', gateType: 'OR', probability: 0, children: topKids, _macProvenance: 'compiled' }, lane, 'fc', fc.internalId);

        // ---- verify (both properties), diff, land the page ------------------
        var verified = verifySkeleton(root, ls.sets, laneKey);
        var routes = verifyRoutes(root, rule, fc, laneKey);
        var st = store();
        var recAll = st[rule.id] = st[rule.id] || {};
        var prev = recAll[laneKey];
        var added = [], removed = [];
        if (prev && Array.isArray(prev.sets)) {
            var kf = function (s) { return s.slice().sort().join('|'); };
            var was = {}; prev.sets.forEach(function (s) { was[kf(s)] = 1; });
            var now = {}; ls.sets.forEach(function (s) { now[kf(s)] = 1; });
            added = ls.sets.filter(function (s) { return !was[kf(s)]; });
            removed = prev.sets.filter(function (s) { return !now[kf(s)]; });
        }
        var pageId = (prev && prev.pageId) || ('lane-' + laneKey + '-' + rule.id);
        var pg = {
            id: pageId, name: ln.label + ' · ' + (fc.fcId || fnLabel(rule.subId)), root: root,
            treeLevel: 'aircraft', mode: 'top-down', linkedFhaId: fc.internalId,
            generatedFrom: 'lanes', laneKind: lane, macRuleId: rule.id, _laneFp: laneFp(rule, laneKey, fc),
            missionProfileId: (G('ftaConfig') && G('ftaConfig').missionProfileId) || ''
        };
        var arr = pages();
        var at = arr.findIndex(function (p) { return p.id === pageId; });
        if (at !== -1) arr[at] = pg; else arr.push(pg);
        recAll[laneKey] = { fp: pg._laneFp, pageId: pageId, sets: ls.sets, verified: verified, routes: routes,
                            residue: residue.length, at: new Date().toISOString() };
        return { ok: true, pageId: pageId, verified: verified, routes: routes, added: added, removed: removed,
                 sets: ls.sets.length, residue: residue.length, fcId: fc.fcId };
    }

    function compile(ruleId) {
        var rule = ruleById(ruleId);
        if (!rule) return { ok: false, reason: 'rule not found' };
        var out = { ok: true, lanes: {}, findings: [] };
        var M = G('SLMacLanes');
        if (M) {
            var fo = M.functionOf(rule, function (id) { return resolveFn(id); });
            if (fo.finding) out.findings.push({ kind: 'not-per-function', msg: fo.finding });
        }
        LANES.forEach(function (ln) {
            out.lanes[ln.key] = compileLane(rule, ln.key);
            if (!out.lanes[ln.key].ok) out.findings.push({ kind: 'lane-' + ln.key, msg: out.lanes[ln.key].reason });
        });
        var tb = bindLane(rule, 'tl');
        idpFindings(rule, tb.fc).forEach(function (f) { out.findings.push(f); });
        out.ok = LANES.some(function (ln) { return out.lanes[ln.key].ok; });
        return out;
    }

    function compileAll() {
        var res = { rules: 0, pages: 0, findings: 0 };
        rules().forEach(function (r) {
            var c = compile(r.id);
            res.rules++;
            LANES.forEach(function (ln) { if (c.lanes[ln.key] && c.lanes[ln.key].ok) res.pages++; });
            res.findings += c.findings.length;
        });
        try { var s = G('commitSaveChanges'); if (typeof s === 'function') s(); } catch (_) {}
        return res;
    }

    // ---- the desk (wraps renderMfmsPanel; zero monolith edits) --------------
    function _esc(s) { try { var e = G('esc'); if (e) return e(s); } catch (_) {}
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function renderDesk() {
        if (typeof document === 'undefined') return;
        var mh = document.getElementById('mfms-host');
        if (!mh || !mh.parentElement) return;
        var host = document.getElementById('lane-trees-desk');
        if (!host) { host = document.createElement('div'); host.id = 'lane-trees-desk'; mh.parentElement.insertBefore(host, mh.nextSibling); }
        var rs = rules();
        var html = '<h4 style="margin: var(--s-5) 0 6px;">Lane trees — Q.4-1 generation from the MAC · CoFFE · interdependence · common-resource lanes' +
            (rs.length ? ' <button class="ckpt-m-btn ckpt-m-btn-primary" style="font-size:11px; padding:2px 10px; margin-left:10px;" onclick="SLLaneTrees.compileAll(); try{renderMfmsPanel();}catch(_){}">Generate all</button>' : '') + '</h4>';
        if (!rs.length) { html += '<p style="color: var(--color-text-tertiary); font-size:13px;">Declare a MAC on the MAC Model tab — one declaration generates three top events (total loss / partial loss / malfunction), each bound to its own classified condition, enriched with the Q.4-2 resource routes and the signed CoFFE residue.</p>'; host.innerHTML = html; return; }
        html += '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr><th>Function</th>' +
            LANES.map(function (l) { return '<th style="text-align:center;">' + l.label + '</th>'; }).join('') + '<th>Findings</th><th></th></tr></thead><tbody>';
        rs.forEach(function (r) {
            var recs = store()[r.id] || {};
            var cells = LANES.map(function (ln) {
                var st = status(r.id, ln.key);
                var rec = recs[ln.key];
                var b = bindLane(r, ln.key);
                if (st === 'missing' && !b.fc) return '<td style="text-align:center;" title="' + _esc(b.finding || '') + '"><span style="color:#9A6200; font-size:10.5px;">unbound</span></td>';
                var col = st === 'fresh' ? 'var(--color-success)' : st === 'stale' ? 'var(--color-warning)' : 'var(--color-text-tertiary)';
                var mark = rec ? (rec.verified === true ? ' ✓≡' : rec.verified === false ? ' ✕' : '') + (rec.routes === false ? ' routes!' : '') + (rec.residue ? ' +' + rec.residue : '') : '';
                var open = rec ? ' <a style="cursor:pointer;" onclick="openFTAPageById(\'' + _esc(rec.pageId) + '\')" title="Open">↗</a>' : '';
                return '<td style="text-align:center;"><span class="sla-stamp" style="color:' + col + ';">' + st.toUpperCase() + '</span><span class="u-mono" style="font-size:10px;">' + _esc(mark) + '</span>' + open + '</td>';
            }).join('');
            var c = null;
            try { c = compilePreviewFindings(r); } catch (_) { c = []; }
            html += '<tr><td>' + _esc(fnLabel(r.subId)) + '</td>' + cells +
                '<td style="font-size:11px;">' + (c.length ? '<span style="color:#9A6200;" title="' + _esc(c.map(function (f) { return f.msg; }).join('\n\n')) + '">' + c.length + ' finding' + (c.length === 1 ? '' : 's') + '</span>' : '<span style="color:var(--color-text-tertiary);">—</span>') + '</td>' +
                '<td><button class="ckpt-m-btn" style="font-size:11px; padding:2px 8px;" onclick="(function(){var d=SLLaneTrees.compile(\'' + _esc(String(r.id)) + '\'); try{commitSaveChanges();}catch(_){}; try{renderMfmsPanel();}catch(_){}; if(window.showToast){var t=[];[\'tl\',\'pl\',\'mal\'].forEach(function(k){var L=d.lanes[k]; if(L.ok)t.push(k.toUpperCase()+\': \'+L.sets+\' sets\'+(L.added&&L.added.length||L.removed&&L.removed.length?\' (+\'+L.added.length+\'/−\'+L.removed.length+\')\':\'\'));}); showToast(t.length?\'Generated \'+t.join(\' · \'):(d.findings[0]&&d.findings[0].msg)||\'Nothing generated\', t.length?\'success\':\'warning\', 5200);}})()">Generate</button></td></tr>';
        });
        html += '</tbody></table>';
        html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">Three top events per declaration — three different conditions at three different severities, each bound to its own classified FHA condition via the FCIM TL/PL/M ids (worst-case row — trees are for the worst case). ✓≡ = skeleton cutsets proven ≡ the lane’s sets with resource routes and signed residue stripped; +n = signed CoFFE residue branches; resource events are shared (one physical event, one id — the Q.4-2 common-cause routes fold in the BDD). Unbound lanes and uncovered interdependence contributors are named findings, never guesses.</p>';
        host.innerHTML = html;
    }
    function compilePreviewFindings(rule) {
        var out = [];
        LANES.forEach(function (ln) { var b = bindLane(rule, ln.key); if (!b.fc) out.push({ kind: 'lane-' + ln.key, msg: b.finding }); });
        var tb = bindLane(rule, 'tl');
        idpFindings(rule, tb.fc).forEach(function (f) { out.push(f); });
        var M = G('SLMacLanes');
        if (M) { var fo = M.functionOf(rule, function (id) { return resolveFn(id); }); if (fo.finding) out.push({ kind: 'not-per-function', msg: fo.finding }); }
        if (M && rule.arbitration == null) out.push({ kind: 'arbitration', msg: 'No arbitration scheme declared — the malfunction lane cannot be derived until it is stated.' });
        return out;
    }

    (function wrapPanel(tries) {
        if (typeof window === 'undefined') return;
        var orig = window.renderMfmsPanel;
        if (typeof orig !== 'function') { if ((tries || 0) < 40) setTimeout(function () { wrapPanel((tries || 0) + 1); }, 250); return; }
        if (orig._laneWrapped) return;
        var wrapped = function () { var r = orig.apply(this, arguments); try { renderDesk(); } catch (_) {} return r; };
        wrapped._laneWrapped = true;
        try { if (window.SLWrap && SLWrap.preserve) SLWrap.preserve(orig, wrapped); } catch (_) {}
        window.renderMfmsPanel = wrapped;
    })(0);

    return {
        LANES: LANES, compile: compile, compileAll: compileAll, status: status,
        bindLane: bindLane, laneSets: laneSets, resourcesServing: resourcesServing,
        coffeResidue: coffeResidue, idpFindings: idpFindings, laneFp: laneFp,
        _verifySkeleton: verifySkeleton, _verifyRoutes: verifyRoutes, _stripEnrichment: stripEnrichment,
        renderDesk: renderDesk
    };
}));
