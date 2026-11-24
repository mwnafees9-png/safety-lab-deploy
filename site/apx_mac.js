/* ============================================================================
 * apx_mac.js (SLApxMac v1.0, 15 Nov 2026): the MAC Autopilot. Step 3 of 5 of the Interdependence, MAC and CoFFE
 * Autopilots. It registers itself on the page the three share (apx_autopilots.js) and does its math in apx_engine.js.
 * On for everyone since 24 Nov 2026; it saves in projectConfig.apx.
 *
 * Waqas, 15 Nov 2026:
 *   "for MAC why aren't we make them choose configuration first for the systems performing the function": the build of
 *     each system comes first. It is set by hand, or the AI reads a design document and proposes it, "Or the engineer can
 *     tell the AI and it proposes it"; a person accepts every one. "CAD models are virtually non existent at the PASA
 *     level, architecture will need either AI or human interpertation same as SDD": nothing is read automatically.
 *   "make it such they eventually have to put the SDD in and compare it to how they initially set the build": the MAC is
 *     Assumed until the builds are compared with the SDD; then Backed by the SDD, Different from the SDD, or Disputed.
 *   "Keep questions at the sub-system/assembly level, we dont go down to items as this is an aircraft level evaluation".
 *   "MAC rules cannot be K of N, it will be if you loose right aileron and right spoiler it will result in loss of roll
 *     control, due to assymetric roll": a rule is a named combination of assemblies with the reason, in the engineer's
 *     words. Ailerons and spoilers "are not two systems, they are part of the flight control system": they are assembly
 *     groups of one system function.
 *   "what if even if you loose them asymmetrically you still have control authority": on an assembly where it matters
 *     which one is lost, "one side lost" is asked on its own and never worked out from "both lost".
 *   "can loosing more make it better seems like a dumb question": not asked.
 *   "System level I dont think MAC will work, you just have to build the fault trees from architecture feeding aircraft
 *     level MAC"; "those links must not get broken": each loss in a MAC rule links down to a system failure condition and
 *     its fault tree. A link has a permanent ID. The tool never removes one: when what it points to changes it is kept and
 *     marked for review.
 *
 * v1.1, Waqas, 17 Nov 2026: "MAC and CoFFE will need a similar interface and these should be linked directly to the
 * system level analyses, functions created for systems and systems added albeit at the aircraft level should be added to
 * system level analyses automatically"; on the severity of a line made that way: "how will you determine the severity?
 * total loss of wheel braking may be contributing to loss of ability to stop the aircraft, but the aircraft might have
 * sufficient control authority with thrust reverseers and flaps to mitigate it" (confirmed: the tool never sets it).
 *   - The build step opens with the ask: "Add an assembly group", for one of the checked system functions.
 *   - Every assembly is mirrored onto its system (system.assemblies, entries marked apx), so the system level starts
 *     from the same assemblies.
 *   - Every loss and wrong action of a set build gets its line in that system's FHA by itself (ensureSysFcs): keyed to
 *     the system function, traced to the aircraft failure condition, SEVERITY LEFT BLANK for the system engineer, and
 *     linked with a permanent link. The aircraft-level effect of the line is written from the MAC rules ("contributes
 *     to ... together with ...") and, once the CoFFE is done, from the CoFFE ("on its own: ...", apx_coffe.js).
 *
 * WHERE THE BUILD LIVES (one per system function, shared by every failure condition that uses it):
 *   projectConfig.apx.build['fn:<funcId>'] = { groups: [ { id: 'ASM-n' (permanent), name ('' = the system as a whole),
 *       pattern, units: [ { id: 'ASM-n.k', name, side: 'LH' | 'RH' | 'C' } ], pos: 'same' | 'mirror' | 'each',
 *       src: 'hand' | 'doc' | 'told' | 'sdd', ref, by, at, sdd: { pattern, units, quote, where, doc, src, by, at }, resolve } ] }
 * THE RECORD OF ONE FAILURE CONDITION (projectConfig.apx.mac[<governing row internalId>]):
 *   sig      the columns the answers were given for; when the build or the checked systems change, the answers are set
 *            aside (kept in stale) and the questions are asked again
 *   m1       { case: 0 | 1 }   0 = the aircraft still does the job, 1 = it does not; hist: the cases each answer wrote
 *   why      { case: text }    the reason for each rule;  ev: the evidence for the answers
 *   malf     { colId: { on, mode: 'alone' | 'combo' } }
 *   links    { '<column>|<state>': { id: 'LNK-n', sysId, fcId, by, at, review } }
 *   sent     { by, at, status } once sent to the PASA; any later change clears it
 *
 * v1.3, Waqas, 23 Nov 2026, on today's MAC page modes (a backup taking over, where the takeover itself can fail): "on modes I am
 * good with the questions". For an assembly group built "two, one backs up the other" the build asks one more thing: "Can the
 * change-over to <the standby unit> fail on its own?" (called the change-over here so it is never mixed up with the
 * switch-off questions). It is a yes or no answered by the engineer; the tool never assumes it, and the MAC cannot be sent
 * while it is unanswered. When yes, the group's "not working" is two named ways, shown wherever that loss is written and
 * drawn: both units lost, or the unit in use lost with the change-over failing. The change-over is written onto the system
 * as its own assembly entry (kind 'change-over'), and it goes to the PASA with the rule (rule.apx.inside). The answer does not
 * change what "not working" means at the aircraft level, so no switch-off answer is set aside because of it.
 *   g.co = { can: 'yes' | 'no', name, by, at }  (only for the 'backup' build; dropped when the build changes)
 *
 * API (window.SLApxMac): model, act, PATTERNS. Tests: tests/regression_apx_mac_20261115.test.js.
 * ==========================================================================*/
(function (root) {
    'use strict';
    var VERSION = '1.4';   // 1.4 24 Nov 2026: on for everyone (wording: the earlier MAC model)   // 1.3 23 Nov 2026: the change-over question for a group built as one unit backing up the other   // 1.1 17 Nov 2026: the build step asks first; assemblies are written onto their system; every loss gets its line in the system's FHA by itself, severity left blank
    var A = root.SLApxAuto, X = root.SLApx;
    if (!A || !A.kit || !X) { if (typeof module !== 'undefined' && module.exports) module.exports = { VERSION: VERSION, missing: true }; return; }
    var K = A.kit, E = K.E, S = K.S, T = K.T, arr = K.arr, safe = K.safe, lc = K.lc;

    var PATTERNS = {
        single: { label: 'Single (one unit)', map: ['O', 'F'], units: ['Unit'] },
        backup: { label: 'Two, one backs up the other', map: ['O', 'O', 'F'], units: ['Unit A (in use)', 'Unit B (standby)'] },
        shared: { label: 'Two, both share the load', map: ['O', 'D', 'F'], units: ['Unit A', 'Unit B'] },
        lr: { label: 'Left and right, both share the load', map: ['O', 'D', 'F'], units: ['LH unit', 'RH unit'], sides: ['LH', 'RH'] },
        pairs: { label: 'Inboard and outboard pairs, both share the load', map: ['O', 'D', 'F'], units: ['Inboard pair', 'Outboard pair'] },
        triple: { label: 'Three, two out of three vote', map: ['O', 'O', 'D', 'F'], units: ['Channel 1', 'Channel 2', 'Channel 3'] }
    };
    var POS = [['same', 'No, any one counts the same'], ['mirror', 'Left and right mirror each other'], ['each', 'Yes, each one is different']];
    var SIDES = [['C', 'Center / not sided'], ['LH', 'Left (LH)'], ['RH', 'Right (RH)']];

    // ---- the store ------------------------------------------------------------------------------------------------------
    function apx() { return K.store(); }
    function nextSeq(kind) { var s = apx(); if (!s.seq || typeof s.seq !== 'object') s.seq = {}; s.seq[kind] = (s.seq[kind] || 0) + 1; return s.seq[kind]; }
    function builds() { var s = apx(); if (!s.build || typeof s.build !== 'object') s.build = {}; return s.build; }
    function peekBuild(colId) { var p = K.pc(); return (p && p.apx && p.apx.build && p.apx.build[colId]) || null; }
    function rec(fcKey) {
        var s = apx(); if (!s.mac || typeof s.mac !== 'object') s.mac = {};
        var r = s.mac[fcKey]; if (!r || typeof r !== 'object') r = s.mac[fcKey] = {};
        ['m1', 'why', 'malf', 'links'].forEach(function (k) { if (!r[k] || typeof r[k] !== 'object') r[k] = {}; });
        if (!Array.isArray(r.hist)) r.hist = [];
        if (typeof r.mirror !== 'boolean') r.mirror = true;
        return r;
    }
    function peek(fcKey) { var p = K.pc(); return (p && p.apx && p.apx.mac && p.apx.mac[fcKey]) || null; }
    function touched(fcKey) { var r = rec(fcKey); if (r.sent) { r.changedSince = { at: K.now() }; r.wasSent = r.sent; delete r.sent; } K.save(); }

    // ---- columns: one per assembly group of each checked system function ---------------------------------------------------
    function lossBase(fc) { return K.picked(fc).filter(function (c) { var x = K.cellOf(fc, c); return !(x.role === 'fails' && x.how === 'malfunction'); }); }
    function groupsOf(colId) { var b = peekBuild(colId); return b && Array.isArray(b.groups) ? b.groups : []; }
    function newGroup(colId) {
        var b = builds(); if (!b[colId] || !Array.isArray(b[colId].groups)) b[colId] = { groups: [] };
        var g = { id: 'ASM-' + nextSeq('asm'), name: '', pattern: '', units: [], pos: 'same', src: 'hand', ref: '', by: '', at: '' };
        b[colId].groups.push(g); return g;
    }
    function groupById(colId, gid) { return groupsOf(colId).filter(function (g) { return g.id === gid; })[0] || null; }
    function patOf(g) { return g && PATTERNS[g.pattern] ? PATTERNS[g.pattern] : null; }
    function unitNames(g) { var p = patOf(g); if (!p) return []; return p.units.map(function (d, k) { var u = arr(g.units)[k]; return u && T(u.name) ? T(u.name) : d; }); }
    function splitOK(g) { var p = patOf(g); return !!p && p.units.length === 2 && p.map.join() === 'O,D,F'; }
    function statesOf(g) { var p = patOf(g); if (!p) return ['F', 'O']; if (g.pos === 'each' && splitOK(g)) return ['F', 'A', 'B', 'O']; return ['F', 'D', 'O'].filter(function (x) { return p.map.indexOf(x) !== -1; }); }
    // ---- the change-over of a group built "two, one backs up the other" --------------------------------------------------
    function coAsk(g) { return !!(g && g.pattern === 'backup' && patOf(g)); }
    function coDefault(g) { var u = unitNames(g); return 'Change-over to ' + (u[1] || 'the standby unit'); }
    // null: not asked for this build, or not answered yet; otherwise { yes, name }
    function coOf(g) { if (!coAsk(g) || !g.co || (g.co.can !== 'yes' && g.co.can !== 'no')) return null; return { yes: g.co.can === 'yes', name: T(g.co.name) || coDefault(g) }; }
    // the ways the group is "not working", in words: one way, or two when the change-over can fail on its own
    function coWays(d) {
        var co = d && d.g ? coOf(d.g) : null; if (!co || !co.yes) return null;
        return [{ k: 'both', text: 'Both lost (' + d.units.join(' and ') + ')', parts: [d.units[0] + ' lost', d.units[1] + ' lost'] },
                { k: 'co', text: d.units[0] + ' lost with the ' + lc(co.name) + ' failing', parts: [d.units[0] + ' lost', co.name + ' fails'] }];
    }
    function desc(c, g) {
        var p = patOf(g);
        return { id: c.colId + '#' + g.id, colId: c.colId, gid: g.id, g: g, sysId: c.sysId, sysName: c.sysName, fnName: c.fnName, funcId: c.funcId, named: !!T(g.name), name: T(g.name) || c.sysName,
            set: !!p, P: p, pos: g.pos || 'same', states: statesOf(g), sided: !!p && p.units.length > 1 && (g.pos === 'each' || g.pos === 'mirror'), units: unitNames(g), co: coOf(g), coOpen: coAsk(g) && !coOf(g) };
    }
    // every column of this failure condition; a system function with no build yet shows as one unset column
    function macCols(fc) {
        var out = [];
        lossBase(fc).forEach(function (c) {
            var gs = groupsOf(c.colId);
            if (!gs.length) out.push({ id: c.colId + '#', colId: c.colId, gid: '', g: null, sysId: c.sysId, sysName: c.sysName, fnName: c.fnName, funcId: c.funcId, named: false, name: c.sysName, set: false, P: null, pos: 'same', states: ['F', 'O'], sided: false, units: [] });
            else gs.forEach(function (g) { out.push(desc(c, g)); });
        });
        return out;
    }
    function ready(fc) { var cs = macCols(fc); return cs.length > 0 && cs.every(function (d) { return d.set; }); }
    function engineCols(ds) { return X.columns(ds.map(function (d) { return { id: d.id, states: d.states, sided: d.sided, units: d.units, label: d.name }; })); }
    function sigOf(ds, mirror) { return ds.map(function (d) { return d.id + ':' + d.states.join('') + ':' + (d.sided ? 1 : 0) + ':' + d.units.length; }).join('|') + '|m' + (mirror ? 1 : 0); }
    // When the columns under the answers change, the answers are set aside (kept) and every link is marked for review.
    function sync(fc) {
        var r0 = peek(fc.key); if (!r0) return;
        var ds = macCols(fc); if (!ds.length || !ds.every(function (d) { return d.set; })) return;
        var sg = sigOf(ds, r0.mirror !== false);
        if (r0.sig === sg) return;
        var r = rec(fc.key), had = Object.keys(r.m1).length > 0;
        if (r.sig && had) {
            r.stale = { sig: r.sig, m1: r.m1, why: r.why, at: K.now() };
            r.m1 = {}; r.hist = []; r.why = {};
            Object.keys(r.links).forEach(function (k) { if (r.links[k] && !r.links[k].review) r.links[k].review = 'The build changed after this link was made.'; });
            r.asked = 'again';
            if (r.sent) { r.changedSince = { at: K.now() }; r.wasSent = r.sent; delete r.sent; }
        }
        r.sig = sg;
    }
    function solved(fc) {
        var ds = macCols(fc); if (!ds.length || !ds.every(function (d) { return d.set; })) return null;
        sync(fc);
        var cols = engineCols(ds), r = peek(fc.key) || {}, m1 = r.m1 || {}, cases, s;
        try { cases = X.cases(cols); s = X.solve(cols, m1, { lo: 0, hi: 1, among: cases }); } catch (e) { return { ds: ds, cols: cols, error: e && e.message ? e.message : String(e) }; }
        return { ds: ds, cols: cols, cases: cases, by: s.by, open: s.open, done: s.done, m1: m1, mirror: r.mirror !== false };
    }
    function breaking(sol) { return sol && sol.done ? X.minimal(sol.cases.filter(function (c) { return sol.by[c].level === 1; }), sol.cols) : []; }
    function rulesOf(sol) { return sol && sol.done ? X.rules(breaking(sol), sol.cols, { mirror: sol.mirror }) : []; }

    // ---- words ----------------------------------------------------------------------------------------------------------
    function joinAnd(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
    function unitWords(d, st) {
        var u = d.units, pre = d.named && d.P && d.P.units.length === u.length && u.every(function (x, k) { return x !== d.P.units[k]; }) ? '' : d.name + ': ';
        if (st === 'F' && d.co && d.co.yes) return pre + 'both (' + u.join(' and ') + '), or ' + u[0] + ' with the ' + lc(d.co.name) + ' failing';
        if (st === 'F') return pre + (u.length <= 1 ? (u[0] || 'the unit') : u.length === 2 ? 'both (' + u.join(' and ') + ')' : 'all ' + u.length + ' (' + u.join(', ') + ')');
        if (st === 'A') return pre + u[0]; if (st === 'B') return pre + u[1];
        if (st === 'D') { var p = d.P, k = p.map.indexOf('D'); return pre + (k <= 1 ? (u.length === 2 ? 'either ' + u.join(' or ') : 'any one of ' + u.join(', ')) : 'any ' + k + ' of ' + u.join(', ')); }
        return pre + 'doing the wrong thing';
    }
    function ruleWords(c, ds) { var w = []; for (var i = 0; i < c.length; i++) if (c[i] !== 'O') w.push(unitWords(ds[i], c[i])); return w.join(' + ') + ' lost'; }
    function stLabel(d, st) { return st === 'O' ? 'Working' : st === 'F' ? 'Not working' : st === 'D' ? 'Partly working' : st === 'M' ? 'Doing the wrong thing' : 'Partly working (' + d.units[st === 'A' ? 0 : 1] + ' lost)'; }
    function caseText(c, ds) {
        var t = [], p = [];
        for (var i = 0; i < c.length; i++) { var s = c[i], n = ds[i].name; if (s === 'F') t.push(n); else if (s === 'D') p.push(n); else if (s === 'A' || s === 'B') p.push(n + ' (' + ds[i].units[s === 'A' ? 0 : 1] + ' lost)'); }
        if (!t.length && !p.length) return 'Nothing lost';
        var bits = []; if (t.length) bits.push('total loss of ' + joinAnd(t)); if (p.length) bits.push('partial loss of ' + joinAnd(p));
        var x = bits.join(' plus '); return x.charAt(0).toUpperCase() + x.slice(1);
    }
    function unitsOff(d, st) { if (st === 'A') return [0]; if (st === 'B') return [1]; var k = d.P.map.indexOf(st), o = []; for (var i = 0; i < Math.max(k, 0); i++) o.push(i); return o; }
    function uneven(c, ds) { for (var i = 0; i < c.length; i++) if (c[i] === 'A' || c[i] === 'B' || (ds[i].pos === 'mirror' && c[i] === 'D')) return true; return false; }

    // ---- status ---------------------------------------------------------------------------------------------------------
    // Assumed until every build is compared with the SDD; then Different, Disputed or Backed.
    function macStatus(fc) {
        var ds = macCols(fc).filter(function (d) { return d.g; });
        var un = ds.filter(function (d) { return !d.g.sdd; }), diff = ds.filter(function (d) { return d.g.sdd && !sameBuild(d.g, d.g.sdd) && !d.g.resolve; }), disp = ds.filter(function (d) { return d.g.sdd && !sameBuild(d.g, d.g.sdd) && d.g.resolve === 'dispute'; });
        if (!ds.length || un.length) return { k: 'assumed', t: 'Assumed: ' + (ds.length && un.length < ds.length ? un.length + ' of ' + ds.length + ' builds are' : 'the builds are') + ' not compared with the SDD yet', word: 'Assumed' };
        if (diff.length) return { k: 'differs', t: 'Different from the SDD on ' + joinAnd(diff.map(function (d) { return d.name; })), word: 'Different from the SDD' };
        if (disp.length) return { k: 'disputed', t: 'Disputed with the design team on ' + joinAnd(disp.map(function (d) { return d.name; })), word: 'Disputed' };
        var docs = []; ds.forEach(function (d) { var n = T(d.g.sdd.doc); if (n && docs.indexOf(n) === -1) docs.push(n); });
        return { k: 'backed', t: 'Backed by the SDD' + (docs.length ? ' (' + docs.join(', ') + ')' : ''), word: 'Backed by the SDD' };
    }
    function sameBuild(g, s) { return !!s && g.pattern === s.pattern; }
    function status(fc) { var r = peek(fc.key) || {}; return r.sent ? { k: 'sent', by: r.sent.by, at: r.sent.at } : r.changedSince ? { k: 'changed' } : (r.m1 && Object.keys(r.m1).length) || r.sig || r.wasSent ? { k: 'started' } : { k: 'new' }; }
    function aloneMalf(fc) { return malfList(fc).filter(function (m) { return m.on && m.mode === 'alone'; }); }
    function comboMalf(fc) { return malfList(fc).filter(function (m) { return m.on && m.mode === 'combo'; }); }
    // every checked system function, with whether its wrong action matters (pre-checked from the Interdependence answer)
    function malfList(fc) {
        var r = peek(fc.key) || {}, mm = r.malf || {};
        return K.picked(fc).map(function (c) {
            var x = K.cellOf(fc, c), def = x.role === 'fails' && x.how === 'malfunction', me = mm[c.colId];
            return { colId: c.colId, sysId: c.sysId, sysName: c.sysName, fnName: c.fnName, funcId: c.funcId, on: me ? !!me.on : def, mode: me && me.mode === 'combo' ? 'combo' : 'alone', fromIdp: def };
        });
    }
    function left(fc) {
        var out = [], ds = macCols(fc);
        if (!ds.length) { out.push('No system is checked for this failure condition. Do the Interdependence Autopilot first.'); return out; }
        var unset = ds.filter(function (d) { return !d.set; }); if (unset.length) { out.push('Set how ' + joinAnd(unset.map(function (d) { return d.name; })) + (unset.length > 1 ? ' are' : ' is') + ' built.'); return out; }
        var sol = solved(fc); if (sol.error) { out.push(sol.error); return out; }
        if (!sol.done) { out.push(sol.open.length + ' switch-off question' + (sol.open.length > 1 ? 's are' : ' is') + ' still open.'); return out; }
        var r = peek(fc.key) || {}, why = r.why || {}, nw = rulesOf(sol).filter(function (x) { return !T(why[x.c]); }).length;
        if (nw) out.push('Say why for ' + nw + ' MAC rule' + (nw > 1 ? 's' : '') + '.');
        if (!T(r.ev)) out.push('Give the evidence for the answers (for example the performance analysis or simulation).');
        var co0 = ds.filter(function (d) { return d.coOpen; }); if (co0.length) out.push('Say whether the change-over to the standby can fail on its own for ' + joinAnd(co0.map(function (d) { return d.name; })) + ' (How each system is built).');
        return out;
    }

    // ---- links down to the system fault trees ------------------------------------------------------------------------------
    function Tr() { return root.SLFcTrees || null; }
    function sysById(id) { return K.systems().filter(function (s) { return S(s.id) === S(id); })[0] || null; }
    function sysGroups(sysId) { var sy = sysById(sysId), F = Tr(); if (!sy) return []; var gs = F ? safe(function () { return F.groups(sy); }, null) : null; if (gs) return gs; var seen = {}, out = []; arr(sy.fha).forEach(function (r) { if (r && r.fcId && !seen[r.fcId]) { seen[r.fcId] = 1; out.push({ fcId: S(r.fcId), gov: r, rows: [r] }); } }); return out; }
    function acGroup(fc) { var F = Tr(); if (!F) return null; return (safe(function () { return F.groups('ac'); }, []) || []).filter(function (g) { return g && g.gov && S(g.gov.internalId) === fc.key; })[0] || null; }
    function acTree(fc) { var F = Tr(), g = acGroup(fc); return F && g ? safe(function () { return F.treeFor(g); }, null) : null; }
    // the losses the MAC rules name, and the wrong actions that cause it alone
    function linkEvents(fc) {
        var sol = solved(fc), out = [], seen = {};
        if (sol && sol.done) breaking(sol).forEach(function (c) { for (var i = 0; i < c.length; i++) { if (c[i] === 'O') continue; var k = sol.ds[i].id + '|' + c[i]; if (!seen[k]) { seen[k] = 1; out.push({ k: k, d: sol.ds[i], st: c[i], sysId: sol.ds[i].sysId, what: unitWords(sol.ds[i], c[i]) + ' lost' }); } } });
        aloneMalf(fc).concat(comboMalf(fc)).forEach(function (m) { var k = m.colId + '|M'; if (!seen[k]) { seen[k] = 1; out.push({ k: k, d: null, st: 'M', sysId: m.sysId, what: m.sysName + ' doing the wrong thing (' + lc(m.fnName) + ')', m: m }); } });
        return out;
    }
    // every loss and wrong action a link can be made for (the CoFFE links all of them: Tables Q.4-3 to Q.4-5)
    function allEvents(fc) {
        var out = [];
        macCols(fc).forEach(function (d) { if (!d.set) return; d.states.forEach(function (st) { if (st !== 'O') out.push({ k: d.id + '|' + st, d: d, st: st, sysId: d.sysId, what: unitWords(d, st) + ' lost' }); }); });
        malfList(fc).filter(function (m) { return m.on; }).forEach(function (m) { out.push({ k: m.colId + '|M', d: null, st: 'M', sysId: m.sysId, what: m.sysName + ' doing the wrong thing (' + lc(m.fnName) + ')', m: m }); });
        return out;
    }
    function linkOf(fc, k) { var r = peek(fc.key); return (r && r.links && r.links[k]) || null; }
    // what a link looks like today: its target, the target's tree, whether it is in the aircraft tree, and any reason to review it
    function linkState(fc, e) {
        var l = linkOf(fc, e.k), F = Tr(), out = { link: l, target: null, tree: null, built: false, inAc: false, review: l ? l.review || '' : '' };
        if (!l) return out;
        out.target = sysGroups(l.sysId).filter(function (g) { return g.fcId === S(l.fcId); })[0] || null;
        if (!out.target) { out.review = out.review || 'The system failure condition it points to is no longer in that system\'s FHA.'; return out; }
        out.tree = F ? safe(function () { return F.treeFor(out.target); }, null) : null;
        out.built = !!(out.tree && F && F.built && safe(function () { return F.built(out.tree); }, false));
        var ac = acTree(fc); out.acTree = ac;
        out.inAc = !!(ac && F && F.linked && safe(function () { return F.linked(ac, { sysId: S(l.sysId), fcId: S(l.fcId) }); }, false));
        if (l.inTree && ac && !out.inAc) out.review = out.review || 'It was linked into the aircraft fault tree, and is no longer found there.';
        return out;
    }
    // Links kept that no longer match a loss in the MAC rules: never removed, shown for review.
    function orphanLinks(fc) { var r = peek(fc.key); if (!r || !r.links) return []; var live = {}; allEvents(fc).forEach(function (e) { live[e.k] = 1; }); return Object.keys(r.links).filter(function (k) { return !live[k]; }).map(function (k) { return { k: k, link: r.links[k] }; }); }
    function setLink(fc, k, sysId, fcId, auto) {
        var r = rec(fc.key), l = r.links[k];
        if (!fcId) return;
        if (!l) l = r.links[k] = { id: 'LNK-' + nextSeq('lnk'), sysId: S(sysId), fcId: S(fcId), by: auto ? 'the tool' : K.who(), at: K.now(), review: '', auto: !!auto };
        else { if (!Array.isArray(l.was)) l.was = []; if (l.fcId !== S(fcId) || l.sysId !== S(sysId)) { l.was.push({ sysId: l.sysId, fcId: l.fcId, until: K.now() }); l.sysId = S(sysId); l.fcId = S(fcId); l.inTree = false; } l.review = ''; l.by = K.who(); l.at = K.now(); }
        touched(fc.key);
    }
    function linkIntoTree(fc, k) {
        var l = linkOf(fc, k), F = Tr(), ac = acTree(fc);
        if (!l) return { ok: false, why: 'Pick the system failure condition first.' };
        if (!F || !ac) return { ok: false, why: 'There is no aircraft fault tree for this failure condition yet. Create it in the Fault trees tab, then link.' };
        var res = safe(function () { return F.link(ac, { sysId: S(l.sysId), fcId: S(l.fcId) }); }, null);
        if (!res || !res.ok) return { ok: false, why: (res && res.why) || 'The link could not be made.' };
        rec(fc.key).links[k].inTree = true; rec(fc.key).links[k].review = ''; touched(fc.key);
        return { ok: true };
    }
    function traceTo(row, fc) { var t = S(row.acTrace).split(/[,;]/).map(function (x) { return x.trim(); }).filter(Boolean); if (t.indexOf(fc.fcId) === -1) { t.push(fc.fcId); row.acTrace = t.join(', '); return true; } return false; }
    function createSysFc(fc, k, sysId, text, auto) {
        text = T(text); var sy = sysById(sysId); if (!text) return { ok: false, why: 'Describe the failure condition.' }; if (!sy) return { ok: false, why: 'That system is no longer in the project.' };
        if (!Array.isArray(sy.fha)) sy.fha = [];
        var same = sy.fha.filter(function (r) { return r && T(r.fcDesc).toLowerCase() === text.toLowerCase(); })[0];
        if (same && same.fcId) { traceTo(same, fc); setLink(fc, k, sysId, same.fcId, auto); return { ok: true, existed: true, fcId: S(same.fcId) }; }
        var col = K.allCols().filter(function (c) { return c.sysId === S(sysId) && k.indexOf(c.colId) === 0; })[0];
        // the severity is never set here: one loss is a contributor, and what it is worth depends on what else still works
        var row = { internalId: Date.now() + Math.floor(Math.random() * 100000), fcId: '', fcDesc: text, subId: col ? col.funcId : '', sysFuncId: col ? col.funcId : '', phases: fc.row.phases || '', severity: '', acTrace: fc.fcId, apx: { by: auto ? 'tool' : K.who(), at: K.now(), from: fc.fcId } };
        var N = root.SLNoDupes, clash = N && N.fhaClash ? safe(function () { return N.fhaClash(row, sy.fha); }, null) : null;
        if (clash && clash.row && clash.row.fcId) { traceTo(clash.row, fc); setLink(fc, k, sysId, clash.row.fcId, auto); return { ok: true, existed: true, fcId: S(clash.row.fcId) }; }
        try { var an = K.fn('_slAutoNumber'); if (an) an('sysFha', row, { SYS: S(sy.id) }); } catch (_) {}
        if (!row.fcId) { var n = 1, ids = {}; K.systems().forEach(function (s2) { arr(s2.fha).forEach(function (r2) { if (r2 && r2.fcId) ids[S(r2.fcId)] = 1; }); }); while (ids['SFC-' + n]) n++; row.fcId = 'SFC-' + n; }
        sy.fha.push(row);
        setLink(fc, k, sysId, row.fcId, auto);
        return { ok: true, fcId: S(row.fcId), made: true };
    }
    // the words of a loss as a system failure condition
    function sysFcText(e) {
        if (e.st === 'M') return 'Malfunction of ' + e.m.sysName + ' function (' + lc(e.m.fnName) + ')';
        var d = e.d, fnw = lc(d.fnName), units = unitWords(d, e.st).replace(/^.*?: /, ''), what = d.named ? d.name + ' (' + d.sysName + ', ' + fnw + ')' : d.sysName + ' function (' + fnw + ')';
        if (e.st === 'F') return 'Total loss of ' + what;
        if (e.st === 'A' || e.st === 'B') return 'Loss of ' + units + ': ' + what;
        return 'Partial loss of ' + what + ': ' + units + ' lost';
    }
    function sysFcRow(l) { var sy = l ? sysById(l.sysId) : null; return sy ? arr(sy.fha).filter(function (r) { return r && S(r.fcId) === S(l.fcId); })[0] || null : null; }
    // Every loss and wrong action of the builds set so far gets its line in its system's FHA, linked, by itself.
    // A loss that already has a link is left alone. Returns the lines it made.
    function ensureSysFcs(fc) {
        var made = [];
        if (!ready(fc)) return made;
        allEvents(fc).forEach(function (e) { if (linkOf(fc, e.k)) return; var r = createSysFc(fc, e.k, e.sysId, sysFcText(e), true); if (r.ok) made.push({ k: e.k, fcId: r.fcId, existed: !!r.existed }); });
        contributions(fc);
        if (made.length) K.save();
        return made;
    }
    // What each line contributes to, in words, from the MAC rules. Written onto lines the Autopilot made (row.apx), per
    // aircraft failure condition, and joined into the line's aircraft-level effect unless a person has rewritten it.
    function setEffect(row, fcId, part, text) {
        if (!row || !row.apx) return;
        if (!row.apx.eff || typeof row.apx.eff !== 'object') row.apx.eff = {};
        if (!row.apx.eff[fcId]) row.apx.eff[fcId] = {};
        if (text) row.apx.eff[fcId][part] = text; else delete row.apx.eff[fcId][part];
        var joined = Object.keys(row.apx.eff).map(function (f) { var x = row.apx.eff[f]; return [x.own, x.with].filter(Boolean).join(' '); }).filter(Boolean).join(' ');
        if (!T(row.effAc) || row.effAc === row.apx.wrote) { row.effAc = joined; row.apx.wrote = joined; }
    }
    function contributions(fc) {
        var sol = solved(fc); if (!sol || sol.error || !sol.done) return;
        var br = breaking(sol), by = {};
        br.forEach(function (c) { for (var i = 0; i < c.length; i++) { if (c[i] === 'O') continue; var k = sol.ds[i].id + '|' + c[i], others = []; for (var j = 0; j < c.length; j++) if (j !== i && c[j] !== 'O') others.push(unitWords(sol.ds[j], c[j]) + ' lost'); (by[k] = by[k] || []).push(others.join(' and ')); } });
        allEvents(fc).forEach(function (e) {
            var row = sysFcRow(linkOf(fc, e.k)); if (!row || !row.apx) return;
            var list = by[e.k], alone = e.st === 'M' && aloneMalf(fc).some(function (m) { return m.colId + '|M' === e.k; });
            var t = alone ? 'Causes ' + fc.fcId + ' (' + fc.desc + ') on its own.' : !list ? 'Not in any combination that causes ' + fc.fcId + ' (' + fc.desc + ').' : list.some(function (x) { return !x; }) ? 'Causes ' + fc.fcId + ' (' + fc.desc + ') on its own.' : 'Contributes to ' + fc.fcId + ' (' + fc.desc + ') together with: ' + list.join('; or ') + '.';
            setEffect(row, fc.fcId, 'with', t);
        });
    }

    // ---- the fault tree against the MAC --------------------------------------------------------------------------------------
    var CUT_CAP = 5000;
    function kids(n) { return n ? (n.children || n._children || []) : []; }
    // Minimal cut sets of a tree made of AND and OR gates, as sets of leaf keys. Refuses a gate it cannot read and a
    // tree over the cap; nothing is truncated.
    function cutSets(node, keyOf) {
        function go(n) {
            if (!n) return [];
            if (n.type !== 'gate') return [[keyOf(n)]];
            var cs = kids(n).map(go), gt = S(n.gateType || 'OR').toUpperCase();
            if (!cs.length) return [];
            if (gt === 'OR') { var o = []; cs.forEach(function (x) { o = o.concat(x); }); if (o.length > CUT_CAP) throw new Error('The fault tree has over ' + CUT_CAP + ' combinations. The check does not sample; split the tree.'); return minimalSets(o); }
            if (gt === 'AND') {
                var acc = [[]];
                cs.forEach(function (x) { var nx = []; acc.forEach(function (a) { x.forEach(function (b) { var m = a.slice(); b.forEach(function (e) { if (m.indexOf(e) === -1) m.push(e); }); nx.push(m); }); }); if (nx.length > CUT_CAP) throw new Error('The fault tree has over ' + CUT_CAP + ' combinations. The check does not sample; split the tree.'); acc = minimalSets(nx); });
                return acc;
            }
            throw new Error('The fault tree has a ' + gt + ' gate (' + T(n.name || n.displayId || '') + '). This check reads AND and OR gates only.');
        }
        return go(node);
    }
    function minimalSets(sets) {
        var u = sets.map(function (s) { return s.slice().sort(); }).sort(function (a, b) { return a.length - b.length; }), out = [];
        u.forEach(function (s) { if (!out.some(function (m) { return m.every(function (x) { return s.indexOf(x) !== -1; }); })) out.push(s); });
        return out;
    }
    // Both ways: every way the MAC breaks is in the tree, and every cut set of the tree breaks the MAC.
    function treeCheck(fc) {
        var sol = solved(fc);
        if (!sol || sol.error || !sol.done) return { ready: false, why: 'Finish the switch-off questions first.' };
        var ac = acTree(fc), F = Tr();
        if (!ac || !ac.root) return { ready: false, why: 'There is no aircraft fault tree for this failure condition yet. The check runs as soon as there is one.', noTree: true };
        if (!(F && F.built && safe(function () { return F.built(ac); }, false))) return { ready: false, why: 'The aircraft fault tree for this failure condition has its top event and nothing built under it yet. The check runs once it is built.', noTree: true };
        var evs = linkEvents(fc), byTarget = {}, unlinked = [];
        evs.forEach(function (e) { var l = linkOf(fc, e.k); if (l) byTarget[S(l.sysId) + '§' + S(l.fcId)] = e; else unlinked.push(e); });
        var keyOf = function (n) { if (n.sysNode && n.sysNode.sysId != null) { var t = S(n.sysNode.sysId) + '§' + S(n.sysNode.fcId || ''); if (byTarget[t]) return 'e:' + byTarget[t].k; } return 'x:' + T((n.displayId || ('#' + n.id)) + (n.name ? ' ' + n.name : '')); };
        var cuts; try { cuts = cutSets(ac.root, keyOf); } catch (e) { return { ready: false, why: e && e.message ? e.message : String(e) }; }
        var mal = {}; aloneMalf(fc).forEach(function (m) { mal[m.colId + '|M'] = m; });
        var toCase = function (set) { var c = sol.ds.map(function () { return 'O'; }), other = [], malf = []; set.forEach(function (k) { if (k.indexOf('x:') === 0) { other.push(k.slice(2)); return; } var ek = k.slice(2), at = ek.lastIndexOf('|'), id = ek.slice(0, at), st = ek.slice(at + 1); if (st === 'M') { malf.push(ek); return; } var i = sol.ds.map(function (d) { return d.id; }).indexOf(id); if (i === -1) { other.push(ek); return; } c[i] = st; }); return { c: c.join(''), other: other, malf: malf }; };
        var treeCases = cuts.map(function (s) { var t = toCase(s); t.set = s; return t; });
        var br = breaking(sol);
        var a = br.map(function (c) { var hit = treeCases.some(function (t) { return !t.other.length && !t.malf.length && t.c === c; }); return { c: c, text: caseText(c, sol.ds), ok: hit }; });
        Object.keys(mal).forEach(function (k) { var hit = treeCases.some(function (t) { return !t.other.length && t.malf.length === 1 && t.malf[0] === k && !/[^O]/.test(t.c); }); a.push({ c: k, text: mal[k].sysName + ' doing the wrong thing', ok: hit, malf: true }); });
        var b = treeCases.map(function (t) {
            if (t.other.length) return { text: t.set.map(function (k) { return k.slice(2); }).join(' + '), ok: null, why: 'It has ' + joinAnd(t.other) + ', which is not linked to a loss in the MAC rules.' };
            if (t.malf.length) return { text: t.malf.concat(/[^O]/.test(t.c) ? [caseText(t.c, sol.ds)] : []).join(' + '), ok: t.malf.every(function (k) { return mal[k]; }) || (sol.by[t.c] && sol.by[t.c].level === 1), malf: true };
            return { text: caseText(t.c, sol.ds), ok: !!(sol.by[t.c] && sol.by[t.c].level === 1) };
        });
        return { ready: true, a: a, b: b, unlinked: unlinked, ok: a.every(function (x) { return x.ok; }) && b.every(function (x) { return x.ok === true; }) };
    }

    // ---- actions ------------------------------------------------------------------------------------------------------------
    var ui = { way: 'hand', tryOff: {}, told: '', doc: '', busy: '', newFc: {}, sddWay: 'ai', sddDoc: '', ask: { col: '', name: '', pat: '' } };
    function stamp(g, src, ref) { g.src = src || 'hand'; g.ref = T(ref || ''); g.by = K.who(); g.at = K.now(); }
    // Every assembly of every set build of a system's functions, written onto the system (entries marked apx; anything
    // else on that list is left alone). Same IDs as here.
    function mirror(colId) {
        var col = K.colOf(colId); if (!col) return;
        var sy = sysById(col.sysId); if (!sy) return;
        var keep = arr(sy.assemblies).filter(function (a) { return a && !a.apx; }), mine = [];
        K.allCols().filter(function (c) { return c.sysId === col.sysId; }).forEach(function (c) {
            groupsOf(c.colId).forEach(function (g) { var P = patOf(g); if (!P) return; unitNames(g).forEach(function (n, k) { var u = g.units[k] || {}; mine.push({ id: u.id || (g.id + '.' + (k + 1)), name: n, side: u.side || 'C', groupId: g.id, group: T(g.name), funcId: c.funcId, build: g.pattern, apx: true }); }); var co = coOf(g); if (co && co.yes) mine.push({ id: g.id + '.co', name: co.name, side: 'C', groupId: g.id, group: T(g.name), funcId: c.funcId, build: g.pattern, kind: 'change-over', apx: true }); });
        });
        sy.assemblies = keep.concat(mine);
    }
    function affected(colId) { mirror(colId); K.fcs().forEach(function (f) { if (K.picked(f).some(function (c) { return c.colId === colId; })) { sync(f); var r = peek(f.key); if (r && r.sent) touched(f.key); } }); }
    function setPattern(fc, colId, gid, pattern, src, ref) {
        var g = gid ? groupById(colId, gid) : null; if (!g) g = newGroup(colId);
        if (pattern && !PATTERNS[pattern]) return g;
        var P = PATTERNS[pattern] || null, old = arr(g.units);
        g.pattern = pattern || '';
        g.units = P ? P.units.map(function (d, k) { var o = old[k]; return { id: (o && o.id) || (g.id + '.' + (k + 1)), name: o && T(o.name) && o.name !== d && P.units.length === old.length ? T(o.name) : '', side: (o && o.side && P.units.length === old.length ? o.side : (P.sides ? P.sides[k] : 'C')) }; }) : [];
        if (P && P.units.length < 2) g.pos = 'same';
        if (P && pattern === 'lr' && g.pos === 'same') g.pos = 'mirror';
        if (g.pattern !== 'backup') delete g.co;
        delete g.resolve; stamp(g, src, ref); affected(colId); K.save();
        return g;
    }
    function setPos(fc, colId, gid, pos) { var g = groupById(colId, gid); if (!g || !POS.some(function (p) { return p[0] === pos; })) return; g.pos = pos; stamp(g, g.src === 'sdd' ? 'hand' : g.src, g.ref); affected(colId); K.save(); }
    function setGroupName(fc, colId, gid, name) { var g = groupById(colId, gid); if (!g) return; g.name = T(name); mirror(colId); K.save(); }
    function setUnit(fc, colId, gid, k, field, v) { var g = groupById(colId, gid); if (!g || !g.units[k]) return; if (field === 'side') g.units[k].side = ['LH', 'RH', 'C'].indexOf(v) !== -1 ? v : 'C'; else g.units[k].name = T(v); mirror(colId); K.save(); }
    function addGroup(fc, colId) { var gs = groupsOf(colId); if (!gs.length) newGroup(colId); var g = newGroup(colId); affected(colId); K.save(); return g; }
    function removeGroup(fc, colId, gid) { var b = builds()[colId]; if (!b || b.groups.length < 2) return false; var g = groupById(colId, gid); if (!g) return false; if (!Array.isArray(b.removed)) b.removed = []; b.removed.push({ id: g.id, name: g.name, at: K.now(), by: K.who() }); b.groups = b.groups.filter(function (x) { return x.id !== gid; }); affected(colId); K.save(); return true; }
    // the change-over answer: a yes or no from the engineer, and the name used for it (default "Change-over to <standby>")
    function setCo(fc, colId, gid, can, name) {
        var g = groupById(colId, gid); if (!coAsk(g)) return false;
        if (can != null) { if (can !== 'yes' && can !== 'no') return false; g.co = { can: can, name: g.co ? T(g.co.name) : '', by: K.who(), at: K.now() }; }
        if (name != null) { if (!g.co) return false; g.co.name = T(name); }
        mirror(colId);
        K.fcs().forEach(function (f) { if (K.picked(f).some(function (c) { return c.colId === colId; })) { var r = peek(f.key); if (r && r.sent) touched(f.key); } });
        K.save(); return true;
    }
    function setMirror(fc, v) { var r = rec(fc.key); r.mirror = !!v; sync(fc); touched(fc.key); }
    function answer(fc, c, v) {
        var sol = solved(fc); if (!sol || sol.error) throw new Error(sol && sol.error ? sol.error : 'Set how every system is built first.');
        if (sol.cases.indexOf(c) === -1) throw new Error('That mix is not one of this failure condition\'s mixes.');
        var r = rec(fc.key), wrote = X.answer(r.m1, c, v ? 1 : 0, sol.cols, { lo: 0, hi: 1, mirror: r.mirror !== false });
        if (wrote.length) r.hist.push(wrote);
        delete r.asked; touched(fc.key);
        return wrote;
    }
    function undo(fc) { var r = rec(fc.key), h = r.hist.pop(); if (h) h.forEach(function (c) { delete r.m1[c]; }); touched(fc.key); }
    function clearAnswers(fc) { var r = rec(fc.key); if (Object.keys(r.m1).length) r.stale = { sig: r.sig, m1: r.m1, why: r.why, at: K.now(), cleared: true }; r.m1 = {}; r.hist = []; touched(fc.key); }
    function setWhy(fc, c, text) { rec(fc.key).why[c] = T(text); touched(fc.key); }
    function setEv(fc, text) { rec(fc.key).ev = T(text); touched(fc.key); }
    function setMalf(fc, colId, on, mode) { var r = rec(fc.key), cur = malfList(fc).filter(function (m) { return m.colId === colId; })[0]; if (!cur) return; r.malf[colId] = { on: on == null ? cur.on : !!on, mode: mode || cur.mode }; touched(fc.key); }
    function send(fc, name) {
        name = T(name); if (!name) return { ok: false, why: 'Type your name to sign before sending.' };
        var l = left(fc); if (l.length) return { ok: false, why: l[0] };
        ensureSysFcs(fc);
        var r = rec(fc.key), st = macStatus(fc);
        r.sent = { by: name, at: K.now(), status: st.k, statusText: st.t }; delete r.changedSince;
        try { if (root.SLApxBridge && root.SLApxBridge.project) root.SLApxBridge.project(fc, 'mac'); } catch (e) { r.bridgeError = e && e.message ? e.message : String(e); }
        K.save();
        return { ok: true, status: st };
    }

    // ---- the build from a document or from the engineer's words (the AI proposes, a person accepts) ------------------------
    function docs() { var api = root.SafetyLabSourceDocs; var l = api && api.list ? safe(function () { return api.list(); }, []) : []; return arr(l).filter(function (d) { return d && T(d.name) && T(d.text); }); }
    function props() { var s = apx(); if (!s.buildProp || typeof s.buildProp !== 'object') s.buildProp = {}; return s.buildProp; }
    function peekProp(colId) { var p = K.pc(); return (p && p.apx && p.apx.buildProp && p.apx.buildProp[colId]) || null; }
    function cleanProposal(raw) {
        var out = [];
        arr(raw).forEach(function (g) {
            if (!g || !PATTERNS[g.pattern]) return;
            var P = PATTERNS[g.pattern], us = arr(g.units).slice(0, P.units.length);
            out.push({ name: T(g.name).slice(0, 80), pattern: g.pattern, pos: POS.some(function (p) { return p[0] === g.pos; }) ? g.pos : (g.pattern === 'lr' ? 'mirror' : 'same'),
                units: P.units.map(function (d, k) { var u = us[k] || {}; return { name: T(u.name).slice(0, 80), side: ['LH', 'RH', 'C'].indexOf(u.side) !== -1 ? u.side : (P.sides ? P.sides[k] : 'C') }; }),
                quote: T(g.quote).slice(0, 400), where: T(g.where).slice(0, 120) });
        });
        return out;
    }
    function parseJson(text) { try { return JSON.parse(S(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch (_) {} try { var m = S(text).match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); } catch (_) {} return null; }
    var AI_SYSTEM = 'You read aircraft design material for a safety engineer who is setting how each system function is built, at assembly level (not items), for a Minimum Acceptable Configuration. Use ONLY what the supplied text says. For each listed system function return its assembly groups. Each group has: "name" (for example "Ailerons"; leave "" when the function is one group), "pattern" (exactly one of: single, backup, shared, lr, pairs, triple), "units" (the assemblies, in order, each {"name","side"} with side LH, RH or C), "pos" (same: any one lost counts the same; mirror: left and right mirror each other; each: it matters which one is lost), "quote" (the words from the text this rests on, verbatim) and "where" (section or page). Patterns: single = one unit. backup = two, one in use and one standby, losing one loses nothing. shared = two that share the load, losing one is a partial loss. lr = a left and a right unit that share the load. pairs = an inboard and an outboard pair that share the load. triple = three, two needed. If the text does not say how a function is built, return an empty groups list for it; never guess. Reply with JSON only: {"columns":[{"colId":"...","groups":[...]}]}.';
    function propose(fc, mode, payload) {
        var cols = lossBase(fc); if (!cols.length) return Promise.reject(new Error('No system is checked for this failure condition.'));
        var loader = typeof root.slLoadAI === 'function' ? Promise.resolve().then(function () { return root.slLoadAI(); }).catch(function () {}) : Promise.resolve();
        return loader.then(function () {
            var P = root.SafetyLabAI; if (!(P && typeof P.complete === 'function')) throw new Error('The AI is not available on this plan or in this session. Set the build by hand.');
            var text = mode === 'doc' ? S(payload.text).slice(0, 60000) : S(payload.text).slice(0, 8000);
            if (!T(text)) throw new Error(mode === 'doc' ? 'That document has no readable text.' : 'Describe the build in your own words first.');
            var ctx = { failureCondition: fc.fcId + ' ' + fc.desc, systemFunctions: cols.map(function (c) { return { colId: c.colId, system: c.sysName, 'function': c.fnName }; }), source: mode === 'doc' ? { document: payload.name, text: text } : { engineerSays: text } };
            return P.complete({ feature: 'apx.mac.build', system: AI_SYSTEM, messages: [{ role: 'user', content: JSON.stringify(ctx, null, 1) }], maxTokens: 3000, temperature: 0 }).then(function (r) {
                var j = parseJson(r && r.text); if (!j || !Array.isArray(j.columns)) throw new Error('The AI\'s reply could not be read. Nothing was proposed.');
                var n = 0, pr = props();
                j.columns.forEach(function (c) { if (!c || !cols.some(function (x) { return x.colId === c.colId; })) return; var g = cleanProposal(c.groups); if (g.length) { pr[c.colId] = { groups: g, src: mode === 'doc' ? 'doc' : 'told', doc: mode === 'doc' ? T(payload.name) : '', model: (r && r.model) || '', at: K.now() }; n++; } });
                try { if (root.AiFidelity && root.AiFidelity.recordProvenance) root.AiFidelity.recordProvenance({ kind: 'draft', feature: 'apx.mac.build', section: fc.fcId, model: (r && r.model) || '' }); } catch (_) {}
                K.save();
                return { n: n, of: cols.length };
            });
        });
    }
    function acceptProposal(fc, colId) {
        var pr = peekProp(colId); if (!pr) return false;
        var b = builds(), have = groupsOf(colId);
        if (!b[colId] || !Array.isArray(b[colId].groups)) b[colId] = { groups: [] };
        pr.groups.forEach(function (p, i) {
            var g = have[i] || newGroup(colId);
            g.name = p.name; g.pattern = p.pattern; g.pos = p.pos;
            g.units = p.units.map(function (u, k) { var o = arr(g.units)[k]; return { id: (o && o.id) || (g.id + '.' + (k + 1)), name: u.name, side: u.side }; });
            delete g.resolve; stamp(g, pr.src, (pr.doc ? pr.doc + (p.where ? ', ' + p.where : '') : p.where) + (p.quote ? ': "' + p.quote + '"' : ''));
        });
        delete props()[colId]; affected(colId); K.save();
        return true;
    }
    function dismissProposal(colId) { delete props()[colId]; K.save(); }

    // ---- the SDD compare: what the SDD says for each build, read by the AI or by the engineer, then compared -----------------
    function setSdd(fc, colId, gid, says) {
        var g = groupById(colId, gid); if (!g || !says || !PATTERNS[says.pattern]) return false;
        g.sdd = { pattern: says.pattern, quote: T(says.quote), where: T(says.where), doc: T(says.doc), src: says.src === 'ai' ? 'ai' : 'hand', by: K.who(), at: K.now() };
        if (sameBuild(g, g.sdd)) delete g.resolve;
        K.fcs().forEach(function (f) { if (K.picked(f).some(function (c) { return c.colId === colId; })) { var r = peek(f.key); if (r && r.sent) touched(f.key); } });
        K.save(); return true;
    }
    function resolveSdd(fc, colId, gid, how) {
        var g = groupById(colId, gid); if (!g || !g.sdd) return false;
        if (how === 'sdd') { var ref = (g.sdd.doc ? g.sdd.doc + (g.sdd.where ? ', ' + g.sdd.where : '') : g.sdd.where); setPattern(fc, colId, gid, g.sdd.pattern, 'sdd', ref); }
        else if (how === 'dispute') { g.resolve = 'dispute'; g.disputed = { by: K.who(), at: K.now() }; K.fcs().forEach(function (f) { if (K.picked(f).some(function (c) { return c.colId === colId; })) { var r = peek(f.key); if (r && r.sent) touched(f.key); } }); K.save(); }
        return true;
    }
    var SDD_SYSTEM = 'You read a System Design Description for a safety engineer who is checking the builds he assumed. Use ONLY what the supplied text says. For each listed assembly group say how the SDD says it is built: "pattern" (exactly one of: single, backup, shared, lr, pairs, triple; single = one unit; backup = two, one in use and one standby; shared = two that share the load; lr = a left and a right unit sharing the load; pairs = an inboard and an outboard pair sharing the load; triple = three, two needed), "quote" (the SDD words this rests on, verbatim) and "where" (section or page). If the SDD does not say, return "pattern":"" for that group; never guess. Reply with JSON only: {"groups":[{"key":"...","pattern":"...","quote":"...","where":"..."}]}.';
    function readSdd(fc, doc) {
        var ds = macCols(fc).filter(function (d) { return d.g; }); if (!ds.length) return Promise.reject(new Error('Set the builds first.'));
        var loader = typeof root.slLoadAI === 'function' ? Promise.resolve().then(function () { return root.slLoadAI(); }).catch(function () {}) : Promise.resolve();
        return loader.then(function () {
            var P = root.SafetyLabAI; if (!(P && typeof P.complete === 'function')) throw new Error('The AI is not available on this plan or in this session. Read the SDD yourself and enter what it says.');
            if (!doc || !T(doc.text)) throw new Error('Pick the SDD from the project\'s source documents first.');
            var ctx = { groups: ds.map(function (d) { return { key: d.id, system: d.sysName, 'function': d.fnName, assemblyGroup: d.named ? d.name : '' }; }), sdd: { document: doc.name, text: S(doc.text).slice(0, 60000) } };
            return P.complete({ feature: 'apx.mac.sdd', system: SDD_SYSTEM, messages: [{ role: 'user', content: JSON.stringify(ctx, null, 1) }], maxTokens: 3000, temperature: 0 }).then(function (r) {
                var j = parseJson(r && r.text); if (!j || !Array.isArray(j.groups)) throw new Error('The AI\'s reply could not be read. Nothing was compared.');
                var n = 0;
                j.groups.forEach(function (x) { var d = ds.filter(function (y) { return y.id === (x && x.key); })[0]; if (d && PATTERNS[x.pattern] && setSdd(fc, d.colId, d.gid, { pattern: x.pattern, quote: x.quote, where: x.where, doc: doc.name, src: 'ai' })) n++; });
                return { n: n, of: ds.length };
            });
        });
    }

    // ---- today's MAC rules for this aircraft function, brought in as answers (step 5: conversion) -----------------------------
    function oldRules(fc) { var p = K.pc(); return arr(p && p.macModels).filter(function (r) { return r && !r.apx && S(r.subId) === S(fc.subId); }); }
    function oldSets(rule) { var f = K.fn('macBreachSetsChecked'); var x = f ? safe(function () { return f(rule); }, null) : null; return x && !x.error ? arr(x.sets) : null; }
    // Each token of an earlier rule against today's columns: a system function or system (total loss), a degraded level
    // (partial loss), or an item (which now belongs in the system's own fault tree).
    function mapToken(tok, ds) {
        tok = S(tok); var deg = tok.indexOf('deg:') === 0, id = tok, label = '';
        if (deg) { var rest = tok.slice(4), i = rest.indexOf(':'); id = i < 0 ? rest : rest.slice(0, i); label = i < 0 ? '' : rest.slice(i + 1); }
        var hits = ds.filter(function (d) { return d.funcId === id || S(d.sysId) === id; });
        if (!hits.length) { var own = K.fn('_idpFnOwner'), o = own ? safe(function () { return own(id); }, null) : null; if (o && o.system) hits = ds.filter(function (d) { return S(d.sysId) === S(o.system.id); }); }
        if (!hits.length) { var it = arr(K.g('itemsData')).filter(function (x) { return x && (S(x.itemId) === id || S(x.internalId) === id); })[0]; if (it) return { item: it, tok: tok }; return { unknown: true, tok: tok }; }
        if (hits.length > 1) return { many: hits, tok: tok };
        return { d: hits[0], st: deg ? 'D' : 'F', label: label, tok: tok };
    }
    function conversion(fc) {
        var rules = oldRules(fc); if (!rules.length) return null;
        var sol = solved(fc), out = { rules: rules, sets: [], notes: [], ok: true, ready: !!(sol && !sol.error) };
        if (!out.ready) return out;
        var ds = sol.ds, levels = {};
        rules.forEach(function (rule) {
            var sets = oldSets(rule); if (!sets) { out.ok = false; out.notes.push('An earlier rule could not be read.'); return; }
            var lv = {}; arr(rule.degraded).forEach(function (d) { if (d && d.sysId) { lv[d.sysId] = lv[d.sysId] || {}; lv[d.sysId][S(d.label)] = 1; } });
            Object.keys(lv).forEach(function (sid) { if (Object.keys(lv[sid]).length > 1) { out.ok = false; out.notes.push('The earlier rule has ' + Object.keys(lv[sid]).length + ' degraded levels for one system. The Autopilot has one "partly working" state per assembly, so this rule is not brought in by the tool: answer the questions instead.'); } });
            sets.forEach(function (set) {
                var c = ds.map(function () { return 'O'; }), bad = null;
                set.forEach(function (tok) { var m = mapToken(tok, ds); if (m.item) bad = 'It names ' + T(m.item.name || m.item.itemId) + ', an item. That is now a gate in its system\'s own fault tree, not a MAC rule.'; else if (m.unknown) bad = 'It names "' + m.tok + '", which is not one of this failure condition\'s checked systems.'; else if (m.many) bad = 'It names a system that is split into ' + m.many.length + ' assembly groups here.'; else { var i = ds.indexOf(m.d); if (m.st === 'D' && m.d.states.indexOf('D') === -1) bad = m.d.name + ' has no "partly working" state with the build set here.'; else if (c[i] !== 'F') c[i] = m.st; } });
                out.sets.push({ set: set, c: bad ? null : c.join(''), bad: bad });
                if (bad) { out.ok = false; if (out.notes.indexOf(bad) === -1) out.notes.push(bad); }
            });
        });
        return out;
    }
    // Exact: a mix breaks the MAC when it holds every loss of one earlier breach set. The smallest breaking mixes and the
    // biggest safe ones are written as answers; logic fills the rest, as it does for the engineer's own answers.
    function convert(fc) {
        var cv = conversion(fc); if (!cv || !cv.ready) return { ok: false, why: 'Set how every system is built first.' };
        if (!cv.ok) return { ok: false, why: cv.notes[0] || 'The earlier rule cannot be brought in exactly.' };
        var sol = solved(fc), r = rec(fc.key);
        if (Object.keys(r.m1).length) return { ok: false, why: 'There are answers already. Clear them first if the earlier rule should replace them.' };
        var sets = cv.sets.map(function (s) { return s.c; });
        var breaks = function (c) { return sets.some(function (b) { return X.le(b, c, sol.cols); }); };
        var bad = sol.cases.filter(breaks), good = sol.cases.filter(function (c) { return !breaks(c); });
        var wrote = [];
        X.minimal(bad, sol.cols).forEach(function (c) { wrote = wrote.concat(X.answer(r.m1, c, 1, sol.cols, { lo: 0, hi: 1, mirror: false })); });
        X.maximal(good, sol.cols).forEach(function (c) { wrote = wrote.concat(X.answer(r.m1, c, 0, sol.cols, { lo: 0, hi: 1, mirror: false })); });
        r.hist.push(wrote); r.converted = { from: cv.rules.map(function (x) { return S(x.id); }), at: K.now(), by: K.who() };
        touched(fc.key);
        return { ok: true, n: wrote.length };
    }

    // ---- the page -------------------------------------------------------------------------------------------------------------
    var CSS = '.apx-scen{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}.apx-scol{border:1.5px solid var(--color-border,rgba(20,23,28,.3));border-radius:12px;padding:10px 12px;background:var(--color-surface-1,#fff)}'
        + '.apx-scol b{display:block;margin-bottom:6px}.apx-units{display:flex;gap:6px;flex-wrap:wrap}.apx-ub{border-radius:8px;padding:6px 10px;font-weight:700;font-size:12.5px;border:2px solid #0B7A3E;background:rgba(11,122,62,.14)}'
        + '.apx-ub.off{border-color:#B42318;background:#B42318;color:#fff}.apx-ub[data-apx-x]{cursor:pointer}.apx-slab{display:block;margin-top:8px;font-size:12.5px;font-weight:700}'
        + '.apx-scol.s-O{border-color:#0B7A3E}.apx-scol.s-F{border-color:#B42318;background:rgba(180,35,24,.06)}.apx-scol.s-D{border-color:#9A5B00;background:rgba(154,91,0,.07)}'
        + '.apx-prog4{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0 0 14px}.apx-prog4>div{border:1px solid var(--color-border,rgba(20,23,28,.3));border-radius:10px;padding:8px 12px;background:var(--color-surface-2,#F6F6F4)}.apx-prog4 b{display:block;font-size:20px}'
        + '.apx-answers{display:flex;gap:12px;flex-wrap:wrap}.apx-btn.yes{background:#0B7A3E;border-color:#0B7A3E;color:#fff}.apx-btn.no{background:#B42318;border-color:#B42318;color:#fff}'
        + '.apx-lanes{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.apx-lane{border:1px solid var(--color-border,rgba(20,23,28,.3));border-radius:12px;padding:12px 14px}.apx-lane h4{margin:0 0 6px}.apx-li{margin:6px 0 0;padding-left:14px;position:relative}.apx-li::before{content:"";position:absolute;left:2px;top:.6em;width:5px;height:5px;border-radius:50%;background:currentColor}'
        + '.apx-co{margin:8px 0 0;padding:8px 10px;border:1.5px solid var(--color-border,rgba(20,23,28,.3));border-radius:10px}.apx-co.open{border-color:#B26A00;border-width:2px}.apx-co .apx-urow{margin:0 0 6px}'
        + '.apx-bld{border:1.5px solid var(--color-border,rgba(20,23,28,.3));border-radius:12px;padding:12px 14px;margin:0 0 10px;background:var(--color-surface-1,#fff)}.apx-bld.on{border-color:#1A6EF2}'
        + '.apx-grp{display:grid;grid-template-columns:minmax(180px,260px) minmax(0,1fr);gap:8px 14px;align-items:start;padding:10px 0;border-top:1px solid var(--color-border,rgba(20,23,28,.2))}.apx-grp:first-of-type{border-top:0}'
        + '.apx-urow{display:grid;grid-template-columns:minmax(0,1fr) 190px;gap:8px;margin:0 0 6px}'
        + 'table.apx-arp td.O{background:rgba(11,122,62,.14);font-weight:700}table.apx-arp td.F{background:rgba(180,35,24,.16);font-weight:700}table.apx-arp td.D{background:rgba(154,91,0,.16);font-weight:700}table.apx-arp td.M{background:rgba(110,60,190,.14);font-weight:700}'
        + '.apx-tag.ok{color:#0B7A3E}.apx-tag.bad{color:#B42318}.apx-tag.warn{color:#9A5B00}'
        + '@media (max-width:760px){.apx-grp,.apx-urow{grid-template-columns:1fr}}';
    function style() { K.style(); if (typeof document === 'undefined' || document.getElementById('apx-style-mac')) return; var st = document.createElement('style'); st.id = 'apx-style-mac'; st.textContent = CSS; document.head.appendChild(st); }
    function card(q, help, body) { return K.card(q, help, body); }
    function note(kind, html) { return '<div class="apx-note' + (kind ? ' ' + kind : '') + '">' + html + '</div>'; }
    function sel(attr, opts, cur, extra) { return '<select data-apx-xc="' + E(attr) + '"' + (extra || '') + '>' + opts.map(function (o) { return '<option value="' + E(o[0]) + '"' + (o[0] === cur ? ' selected' : '') + '>' + E(o[1]) + '</option>'; }).join('') + '</select>'; }
    function statusNote(fc) { var st = macStatus(fc); return note(st.k === 'backed' ? 'good' : 'warn', 'MAC status: <b>' + E(st.t) + '</b>'); }
    function need(fc, title) {
        var ds = macCols(fc);
        if (!ds.length) return card(title, 'No system is checked for this failure condition yet. Do the Interdependence Autopilot first: the MAC works on the systems checked there.', '<button class="apx-btn p" data-apx-ap="idp">Open the Interdependence Autopilot</button>');
        return null;
    }
    function unitBlocks(d, off, click) { return d.units.map(function (u, k) { return '<span class="apx-ub ' + (off.indexOf(k) !== -1 ? 'off' : 'on') + '"' + (click ? ' data-apx-x="try|' + E(d.id) + '|' + k + '" role="button" tabindex="0" aria-pressed="' + (off.indexOf(k) !== -1) + '"' : '') + '>' + E(u) + '</span>'; }).join(''); }
    function scenario(sol, c, click) {
        return '<div class="apx-scen">' + sol.ds.map(function (d, i) {
            var off = click ? tryOffList(d) : unitsOff(d, c[i]), st = click ? tryState(d) : c[i];
            return '<div class="apx-scol s-' + (X.isPartial(st) ? 'D' : st) + '"><b>' + E(d.name) + (d.named ? '<span style="font-weight:400;font-size:12.5px"> (' + E(d.sysName) + ')</span>' : '') + '</b><div class="apx-units">' + unitBlocks(d, off, click) + '</div><span class="apx-slab">' + E(stLabel(d, st)) + '</span></div>';
        }).join('') + '</div>';
    }
    function tryOffList(d) { return arr(ui.tryOff[d.id]).map(function (v, k) { return v ? k : -1; }).filter(function (k) { return k >= 0; }); }
    function tryState(d) { var off = tryOffList(d), k = off.length; if (d.pos === 'each' && splitOK(d.g) && k === 1) return off[0] === 0 ? 'A' : 'B'; return d.P.map[Math.min(k, d.P.map.length - 1)]; }
    function okWord(fc) { return K.fcWord(fc); }

    function stepBuild(fc) {
        var n = need(fc, 'How is each system built?'); if (n) return n;
        var base = lossBase(fc), dl = docs();
        var ways = '<div class="apx-sw" role="group" aria-label="Where the build comes from" style="margin:0 0 12px">' + [['hand', 'Set it by hand'], ['doc', 'The AI reads a design document'], ['told', 'Tell the AI in your words']].map(function (w) { return '<button type="button" class="' + (ui.way === w[0] ? 'on' : '') + '" data-apx-x="way|' + w[0] + '">' + w[1] + '</button>'; }).join('') + '</div>';
        var ai = '';
        if (ui.way === 'doc') ai = dl.length ? '<div class="apx-add" style="grid-template-columns:auto minmax(0,1fr) auto;margin:0 0 12px"><b>Design document</b>' + sel('doc', [['', 'Pick the architecture description or the SDD']].concat(dl.map(function (d) { return [d.name, d.name]; })), ui.doc) + '<button class="apx-btn" data-apx-x="propose|doc"' + (ui.busy ? ' disabled' : '') + '>' + (ui.busy === 'doc' ? 'The AI is reading it...' : 'Read it and propose the builds') + '</button></div>' : note('warn', 'This project has no source document with readable text yet. Add the architecture description or the SDD on the AI inputs page, then come back. Until then, set the build by hand or tell the AI in your words.');
        if (ui.way === 'told') ai = '<div style="margin:0 0 12px"><textarea data-apx-xc="told" rows="3" style="width:100%;box-sizing:border-box;font:inherit;padding:8px 10px;border:1px solid var(--color-border-strong,#14171C);border-radius:9px" placeholder="For example: the flight control system has a left and a right aileron, and roll spoilers on each wing. Each wing\'s surfaces have their own actuators." aria-label="The build in your words">' + E(ui.told) + '</textarea><button class="apx-btn" style="margin-top:6px" data-apx-x="propose|told"' + (ui.busy ? ' disabled' : '') + '>' + (ui.busy === 'told' ? 'The AI is working it out...' : 'Propose the builds from my words') + '</button></div>';
        if (ui.way !== 'hand') ai += '<p style="margin:0 0 12px;font-size:12.5px">The AI proposes; nothing is set until you accept it. A build that came from words or a document is still <b>Assumed</b> until it is compared with the SDD in the last step.</p>';
        var unset = base.filter(function (c) { return !groupsOf(c.colId).some(function (g) { return patOf(g); }); });
        if (!ui.ask.col || !base.some(function (c) { return c.colId === ui.ask.col; })) ui.ask.col = (unset[0] || base[0]).colId;
        var ask = '<div class="apx-ask"><div class="apx-askq">Add an assembly group</div>'
            + '<div class="apx-askrow">' + sel('askcol', base.map(function (c) { return [c.colId, c.sysName + ': ' + lc(c.fnName) + (groupsOf(c.colId).some(function (g) { return patOf(g); }) ? '' : ' (not set yet)')]; }), ui.ask.col, ' style="width:100%" aria-label="System function"')
            + '<input type="text" data-apx-xc="askname" value="' + E(ui.ask.name) + '" placeholder="Group name, for example: Ailerons. Leave empty when the system is one group" aria-label="Assembly group name"></div>'
            + '<div class="apx-askrow one"><b>How is it built?</b>' + sel('askpat', [['', 'Pick how it is built']].concat(Object.keys(PATTERNS).map(function (k) { return [k, PATTERNS[k].label]; })), ui.ask.pat, ' style="width:100%" aria-label="How it is built"') + '</div>'
            + '<div><button class="apx-btn p" data-apx-x="askadd">Add it</button></div>'
            + '<p style="margin:6px 0 0;font-size:12.5px">Then name each assembly and its side below, as your design names them. The assemblies are added to that system, so its own analysis starts from the same ones. A system can have several groups, for example ailerons and roll spoilers.</p></div>'
            + (unset.length ? '<p style="margin:12px 0 0"><b>Still to set:</b> ' + E(joinAnd(unset.map(function (c) { return c.sysName; }))) + '</p>' : '')
            + (base.length > unset.length ? '<p style="margin:18px 0 8px;font-weight:700">Set so far</p>' : '');
        var rows = base.map(function (c) {
            var gs = groupsOf(c.colId), pr = peekProp(c.colId), h = '';
            if (!gs.length && !pr) return '';
            var list = gs.length ? gs : [];
            h += list.map(function (g) {
                var P = patOf(g), gid = g ? g.id : '', key = c.colId + '|' + gid;
                var left0 = (list.length > 1 || (g && T(g.name)) ? '<input type="text" data-apx-xc="gname|' + E(key) + '" value="' + E(g ? g.name : '') + '" placeholder="Assembly group, for example: Ailerons" aria-label="Assembly group name">' : '<span style="font-size:12.5px">The system as one group</span>')
                    + (g ? '<div style="font-size:12px;margin-top:4px">ID ' + E(g.id) + '</div>' : '');
                var right = sel('pat|' + key, [['', 'Pick how it is built']].concat(Object.keys(PATTERNS).map(function (k) { return [k, PATTERNS[k].label]; })), g ? g.pattern : '', ' style="width:100%" aria-label="How ' + E(c.sysName) + ' is built"');
                if (P) {
                    right += '<div style="margin-top:8px">' + P.units.map(function (dn, k) { var u = g.units[k] || {}; return '<div class="apx-urow"><input type="text" data-apx-xc="uname|' + E(key) + '|' + k + '" value="' + E(u.name || '') + '" placeholder="' + E(dn) + ': its name in your design" aria-label="Assembly ' + (k + 1) + ' name">' + sel('uside|' + key + '|' + k, SIDES, u.side || 'C', ' aria-label="Side"') + '</div>'; }).join('') + '</div>';
                    if (coAsk(g)) { var co1 = g.co && (g.co.can === 'yes' || g.co.can === 'no') ? g.co.can : '', u1 = unitNames(g)[1];
                        right += '<div class="apx-co' + (co1 ? '' : ' open') + '"><div class="apx-urow" style="align-items:center;grid-template-columns:minmax(0,1fr) auto"><b>Can the change-over to ' + E(u1) + ' fail on its own?</b><div class="apx-sw" role="group" aria-label="Can the change-over fail on its own"><button type="button" class="' + (co1 === 'yes' ? 'on' : '') + '" data-apx-x="co|' + E(key) + '|yes" aria-pressed="' + (co1 === 'yes') + '">Yes</button><button type="button" class="' + (co1 === 'no' ? 'on' : '') + '" data-apx-x="co|' + E(key) + '|no" aria-pressed="' + (co1 === 'no') + '">No</button></div></div>'
                            + (co1 === 'yes' ? '<div class="apx-urow"><input type="text" data-apx-xc="coname|' + E(key) + '" value="' + E(T(g.co.name)) + '" placeholder="' + E(coDefault(g)) + ': its name in your design" aria-label="Change-over name"></div><div style="font-size:12.5px">Not working is then two ways: both lost, or ' + E(unitNames(g)[0]) + ' lost with the change-over failing. Both are drawn under this loss in the fault tree gate.</div>'
                            : co1 === 'no' ? '<div style="font-size:12.5px">Not working is both lost.</div>' : '<div style="font-size:12.5px">For example a shuttle valve that sticks, or a transfer relay that does not close. The tool does not assume this: say yes or no.</div>') + '</div>'; }
                    if (P.units.length > 1) right += '<div class="apx-urow" style="align-items:center;grid-template-columns:minmax(0,1fr) minmax(0,1fr)"><b>Does it matter which one is lost?</b>' + sel('pos|' + key, POS, g.pos || 'same') + '</div>' + (g.pos !== 'same' ? '<div style="font-size:12.5px">' + (g.pos === 'each' && splitOK(g) ? 'Each one lost is asked on its own.' : 'One side lost is asked on its own.') + ' It is never worked out from "both lost", because an uneven loss can be worse than an even one.</div>' : '');
                    right += '<div style="font-size:12.5px;margin-top:6px">' + (g.src === 'sdd' ? '<span class="apx-tag ok">From the SDD</span>' : g.src === 'doc' ? '<span class="apx-tag">From a document, accepted by ' + E(g.by) + '</span>' : g.src === 'told' ? '<span class="apx-tag">From your words, accepted by ' + E(g.by) + '</span>' : '<span class="apx-tag">Set by hand</span>') + (g.ref ? E(g.ref) : (g.src === 'sdd' ? '' : 'assumed until the SDD is compared')) + '</div>';
                }
                if (g && gs.length > 1) right += '<button class="apx-btn" style="margin-top:8px" data-apx-x="delgrp|' + E(key) + '">Remove this group</button>';
                return '<div class="apx-grp"><div>' + left0 + '</div><div>' + right + '</div></div>';
            }).join('');
            if (pr) h += note('', '<span class="apx-tag">AI proposes</span>' + pr.groups.map(function (p) { return '<b>' + E(p.name || c.sysName) + ':</b> ' + E(PATTERNS[p.pattern].label) + ' (' + E(p.units.map(function (u, k) { return (u.name || PATTERNS[p.pattern].units[k]) + (u.side !== 'C' ? ' ' + u.side : ''); }).join(', ')) + ')' + (p.quote ? '. From ' + E(pr.doc || 'your words') + (p.where ? ', ' + E(p.where) : '') + ': "' + E(p.quote) + '"' : ''); }).join('<br>') + '<div style="margin-top:8px"><button class="apx-btn p" data-apx-x="accept|' + E(c.colId) + '">Accept</button> <button class="apx-btn" data-apx-x="dismiss|' + E(c.colId) + '">Dismiss</button></div>');
            return '<div class="apx-bld' + (gs.length && gs.every(function (g) { return patOf(g); }) ? ' on' : '') + '"><div class="apx-nm">' + E(c.sysName) + ' <span class="apx-tag" style="font-weight:600">' + E(c.funcId) + '</span><span style="font-weight:400"> ' + E(c.fnName) + '</span></div>' + h + '</div>';
        }).join('');
        var ds = macCols(fc), mir = ds.some(function (d) { return d.states.indexOf('A') !== -1; }) ? '<div class="apx-eff" style="margin:14px 0 0;grid-template-columns:minmax(0,1fr) minmax(260px,360px)"><div><b>Do left and right mirror each other across the aircraft?</b><div style="font-size:12.5px">If yes, one answer covers a mix and its mirror image.</div></div><div class="apx-sw" role="group" aria-label="Mirror"><button type="button" class="' + ((peek(fc.key) || {}).mirror !== false ? 'on' : '') + '" data-apx-x="mirror|1">Yes, they mirror</button><button type="button" class="' + ((peek(fc.key) || {}).mirror === false ? 'on' : '') + '" data-apx-x="mirror|0">No, ask both sides</button></div></div>' : '';
        return card('How is each system built?', 'Add the assembly groups of each checked system and say how each is built. It tells the tool what "partly working" really means. Names and sides come from your design, never from the tool.', ways + ai + ask + rows + mir + statusNote(fc));
    }
    function stepGame(fc) {
        var n = need(fc, 'Switch it off'); if (n) return n;
        if (!ready(fc)) return card('Switch it off', 'Set how every system is built first (the step before this one).', '');
        var sol = solved(fc); if (sol.error) return card('Switch it off', '', note('bad', E(sol.error)));
        var r = peek(fc.key) || {}, asked = arr(r.hist).length, byYou = Object.keys(sol.m1).length, logic = sol.cases.filter(function (c) { return sol.by[c].level != null && sol.by[c].src === 'logic'; }).length, mir = Math.max(0, byYou - asked);
        var body = '<div class="apx-eff" style="margin-bottom:14px"><div><b>Evidence for these answers</b></div><div><input type="text" data-apx-xc="ev" value="' + E(r.ev || '') + '" placeholder="For example: landing performance analysis, ground handling simulation" aria-label="Evidence"></div></div>'
            + '<div class="apx-prog4"><div><b>' + sol.cases.length + '</b>mixes in total</div><div><b>' + asked + '</b>questions you answered</div><div><b>' + (logic + mir) + '</b>filled by logic' + (mir ? ' and mirror' : '') + '</div><div><b>' + sol.open.length + '</b>left</div></div>';
        if (r.asked === 'again') body += note('warn', 'The build or the checked systems changed, so the questions are asked again. The earlier answers are kept on file.');
        var cv = !byYou ? conversion(fc) : null;
        if (cv && cv.rules.length) body += note(cv.ok ? '' : 'warn', '<b>This aircraft function has ' + cv.rules.length + ' earlier MAC rule' + (cv.rules.length > 1 ? 's' : '') + ' from the earlier MAC model.</b> ' + (cv.ok ? 'The tool can bring ' + (cv.rules.length > 1 ? 'them' : 'it') + ' in exactly, as answers you then check: ' + E(cv.sets.map(function (s) { return caseText(s.c, sol.ds); }).join('; ')) + '. <button class="apx-btn" data-apx-x="convert" style="margin-left:6px">Bring it in</button>' : E(cv.notes.join(' '))));
        if (sol.open.length) {
            var c = X.nextQuestion(sol.cols, sol.m1, { lo: 0, hi: 1, among: sol.cases }), un = uneven(c, sol.ds);
            body += '<p style="font-size:17px;font-weight:700;margin:6px 0 8px">With the red blocks switched off:</p>' + scenario(sol, c, false)
                + '<p style="font-size:17px;font-weight:700;margin:14px 0 10px">Can the aircraft still ' + E(okWord(fc)) + ' safely' + (un ? ', with enough control authority left' : '') + '?</p>'
                + (un ? '<p style="margin:-4px 0 10px;font-size:13px">This mix loses one side only. Say yes only if the evidence shows enough control authority is left.</p>' : '')
                + '<div class="apx-answers"><button class="apx-btn big yes" data-apx-x="ans|' + c + '|0">Yes, it still can</button><button class="apx-btn big no" data-apx-x="ans|' + c + '|1">No</button></div>';
        } else body += note('good', '<b>Done.</b> You answered ' + asked + ' question' + (asked === 1 ? '' : 's') + '; logic filled the other ' + (logic + mir) + '. The tool has written your MAC (next step).');
        body += '<div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap"><button class="apx-btn" data-apx-x="undo"' + (asked ? '' : ' disabled') + '>Undo last answer</button><button class="apx-btn" data-apx-x="clear"' + (byYou ? '' : ' disabled') + '>Clear all answers</button></div>';
        var tc = sol.ds.map(tryState).join(''), kn = sol.by[tc] || {}, trail = '';
        if (kn.level != null) trail = kn.src === 'you' ? 'You answered this mix yourself.' : 'Worked out from your answer for: ' + E(caseText(kn.from, sol.ds)) + ' (you said the aircraft ' + (sol.m1[kn.from] === 1 ? 'cannot' : 'still can') + '). This mix has everything that one had ' + (kn.level === 1 ? 'lost, and more' : 'working, and more') + '.';
        var play = '<p class="apx-help" style="margin:0 0 10px">Click any block to switch it off or on. Every result is your own answer, or worked out from one of your answers, and it says which.</p>' + scenario(sol, tc, true)
            + note(kn.level === 1 ? 'bad' : kn.level === 0 ? 'good' : '', kn.level != null ? '<b>' + (kn.level === 1 ? 'This mix breaks the MAC: the aircraft cannot ' + E(okWord(fc)) + ' safely.' : 'With this mix the aircraft can still ' + E(okWord(fc)) + ' safely.') + '</b><br>' + trail : 'Not worked out yet. <button class="apx-btn" data-apx-x="ans|' + tc + '|0" style="margin-left:8px">It still can</button> <button class="apx-btn" data-apx-x="ans|' + tc + '|1">It cannot</button>');
        return card('Switch it off: can it still ' + E(okWord(fc)) + '?', 'The tool switches off assemblies and asks one thing each time. It only asks what it cannot work out from your answers: if a mix is safe, the same mix with something switched back on is safe too.', body) + K.preview('Try your own', play);
    }
    function rulesTable(fc, sol, edit) {
        var r = peek(fc.key) || {}, why = r.why || {}, rs = rulesOf(sol);
        return '<div class="apx-cap">Minimum acceptable configuration rules for<br>failure condition "' + E(fc.desc) + '"</div><div class="apx-tw"><table data-sl-worksheet="1" class="apx-arp"><tr><th style="width:44%">If this is lost</th><th style="width:18%">Result</th><th>Why</th></tr>'
            + (rs.length ? rs.map(function (x) { return '<tr><td class="l"><b>' + E(ruleWords(x.c, sol.ds)) + '</b>' + (x.mirror ? '<div style="font-size:12.5px">Mirror image, same answer: ' + E(ruleWords(x.mirror, sol.ds)) + '</div>' : '') + '</td><td>' + E(fc.desc) + '</td><td class="l">' + (edit ? '<input type="text" data-apx-xc="why|' + x.c + '" value="' + E(why[x.c] || '') + '" placeholder="Why this mix breaks it, in your words (for example: asymmetric roll beyond the control authority left)" aria-label="Why">' : E(why[x.c] || '')) + '</td></tr>'; }).join('') : '<tr><td class="l" colspan="3">No mix of these losses breaks it.</td></tr>') + '</table></div>';
    }
    function stepWorked(fc) {
        var n = need(fc, 'What the tool worked out'); if (n) return n;
        var sol = ready(fc) ? solved(fc) : null; if (!sol || sol.error || !sol.done) return card('What the tool worked out', 'Finish the switch-off questions first.', '');
        var okMax = X.maximal(sol.cases.filter(function (c) { return sol.by[c].level === 0; }), sol.cols), r = peek(fc.key) || {};
        var wayCell = function (d, st) { return st === 'O' ? 'Must fully work' : st === 'F' ? 'Not needed' : st === 'D' ? 'OK partly working' : 'OK with ' + d.units[st === 'A' ? 0 : 1] + ' lost'; };
        var ways = '<div class="apx-cap">Ways to still ' + E(okWord(fc)) + '</div><div class="apx-tw"><table data-sl-worksheet="1" class="apx-arp"><tr><th>Way</th>' + sol.ds.map(function (d) { return '<th>' + E(d.name) + '</th>'; }).join('') + '</tr>' + okMax.map(function (c, k) { return '<tr><td>Way ' + (k + 1) + '</td>' + sol.ds.map(function (d, i) { return '<td>' + E(wayCell(d, c[i])) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table></div>';
        var txt = function (d, x) { var p = d.P, n0 = p.units.length, k = p.map.indexOf(x), last = p.map.lastIndexOf(x); if (k < 0) return 'Does not happen with this build'; if (x === 'O') return last > 0 ? (n0 === 2 ? 'Both work' : 'All ' + n0 + ' work') + ', or ' + last + ' lost (redundancy only)' : n0 === 1 ? 'It works' : n0 === 2 ? 'Both work' : 'All ' + n0 + ' work'; if (x === 'D' && d.states.indexOf('A') !== -1) return d.units[0] + ' lost, or ' + d.units[1] + ' lost (each asked on its own)'; return k === last ? k + ' of ' + n0 + ' lost' : k + ' to ' + last + ' of ' + n0 + ' lost'; };
        var txt0 = txt; txt = function (d, x) { var w = x === 'F' ? coWays(d) : null; return w ? w.map(function (y) { return y.text; }).join(', or ') : txt0(d, x); };
        var states = '<div class="apx-cap">What each state means</div><div class="apx-tw"><table data-sl-worksheet="1" class="apx-arp"><tr><th>Assembly group</th><th>Build</th><th>Fully working</th><th>Partly working</th><th>Not working</th></tr>' + sol.ds.map(function (d) { return '<tr><td class="l"><b>' + E(d.name) + '</b></td><td class="l">' + E(d.P.label) + '</td><td class="O l">' + E(txt(d, 'O')) + '</td><td class="D l">' + E(txt(d, 'D')) + '</td><td class="F l">' + E(txt(d, 'F')) + '</td></tr>'; }).join('') + '</table></div>';
        var asm = '<div class="apx-cap">Stated assumptions (go into the PASA)</div><div class="apx-tw"><table data-sl-worksheet="1" class="apx-arp"><tr><th>Assembly group</th><th>Does it matter which one is lost?</th><th>So the tool</th></tr>' + sol.ds.map(function (d) { return '<tr><td class="l"><b>' + E(d.name) + '</b></td><td class="l">' + E((POS.filter(function (p) { return p[0] === d.pos; })[0] || POS[0])[1]) + '</td><td class="l">' + (d.sided ? 'Asked "one side lost" on its own. It is never assumed from the answer for "both lost", because an uneven loss can be worse than an even one' : 'Counted how many are lost and carried answers over by logic') + '</td></tr>'; }).join('') + '</table></div>';
        var body = rulesTable(fc, sol, true) + '<p style="margin:8px 0 16px;font-size:12.5px">Each rule is a named combination of assemblies: the smallest mixes that break the function. Anything bigger breaks it too. Give each one its reason.</p>' + ways + states + asm
            + '<p style="font-size:12.5px">Evidence for the answers: ' + E(r.ev || 'none given yet') + '</p>' + (r.converted ? note('', 'These answers were brought in from the earlier MAC rule on ' + E(S(r.converted.at).slice(0, 10)) + ' by ' + E(r.converted.by) + '. Check them before sending.') : '') + statusNote(fc);
        return card('Your MAC, written by the tool', 'Nothing to work out here: the tool wrote this from your answers. You give each rule its reason.', body);
    }
    function stepMalf(fc) {
        var n = need(fc, 'Can a system cause it by doing the wrong thing?'); if (n) return n;
        var body = '<div class="apx-ticks">' + malfList(fc).map(function (m) {
            return '<div class="apx-tick' + (m.on ? ' on' : '') + '"><button type="button" class="apx-box" data-apx-x="malf|' + E(m.colId) + '" aria-label="' + (m.on ? 'Uncheck ' : 'Check ') + E(m.sysName) + '" aria-pressed="' + (m.on ? 'true' : 'false') + '"></button><span class="apx-nm">' + E(m.sysName) + ' <span style="font-weight:400">' + E(m.fnName) + '</span></span><span class="apx-why">'
                + (m.on ? sel('malfmode|' + m.colId, [['alone', 'It causes the failure condition all by itself'], ['combo', 'Only together with other failures']], m.mode) + '<div style="font-size:12.5px;margin-top:6px">' + (m.mode === 'alone' ? 'It becomes its own branch in the fault tree and goes to the ' + E(m.sysName) + ' PSSA. It stays out of the CoFFE table.' : 'It gets a "doing the wrong thing" column in the CoFFE table. The MAC cannot answer those cases, so you answer them there.') + '</div>' : (m.fromIdp ? '' : 'Its wrong action does not lead to this failure condition.')) + '</span></div>';
        }).join('') + '</div>';
        return card('Can a system cause it by doing the wrong thing?', 'For example, an engine stuck at high thrust on landing. Check each system whose wrong action matters, and say whether it does it alone or only together with other failures.', body);
    }
    function lanes(fc) {
        var sol = ready(fc) ? solved(fc) : null; if (!sol || sol.error || !sol.done) return null;
        var br = breaking(sol);
        return { sol: sol, total: X.minimal(sol.cases.filter(function (c) { return !/[DAB]/.test(c) && sol.by[c].level === 1; }), sol.cols), partial: br.filter(function (c) { return /[DAB]/.test(c); }), malf: aloneMalf(fc) };
    }
    function stepLanes(fc) {
        var n = need(fc, 'The three lanes'); if (n) return n;
        var L = lanes(fc); if (!L) return card('The three lanes', 'Finish the switch-off questions first.', '');
        var li = function (a) { return a.length ? a.map(function (c) { return '<div class="apx-li">' + E(caseText(c, L.sol.ds)) + '</div>'; }).join('') : '<div class="apx-li">None</div>'; };
        var body = '<div class="apx-lanes"><div class="apx-lane"><h4>Total loss lane</h4><p style="margin:0;font-size:12.5px">Smallest mixes of assembly groups that are completely lost:</p><div>' + li(L.total) + '</div></div>'
            + '<div class="apx-lane"><h4>Partial loss lane</h4><p style="margin:0;font-size:12.5px">Smallest mixes once "partly working" counts:</p><div>' + li(L.partial) + '</div></div>'
            + '<div class="apx-lane"><h4>Malfunction lane</h4><p style="margin:0;font-size:12.5px">Wrong actions that cause it alone:</p><div>' + (L.malf.length ? L.malf.map(function (m) { return '<div class="apx-li">' + E(m.sysName) + ': ' + E(lc(m.fnName)) + ' done wrong</div>'; }).join('') : '<div class="apx-li">None</div>') + '</div></div></div>'
            + note('', 'These come straight from your answers, worked out by the tool. There is nothing to type here. Each lane is its own top event in the fault tree.');
        return card('The three lanes', 'Every way the MAC can be broken, split the way the fault tree and the CoFFE table need it.', body);
    }
    function linkPicker(fc, e) {
        var l = linkOf(fc, e.k), gs = sysGroups(e.sysId), sy = sysById(e.sysId), sn = sy ? T(sy.name || sy.id) : S(e.sysId);
        return sel('link|' + e.k, [['', 'Pick from the ' + sn + ' FHA']].concat(gs.map(function (g) { return [g.fcId, g.fcId + ' ' + T(g.gov.fcDesc || '')]; })).concat([['__new', '+ Create a new failure condition in the ' + sn + ' FHA']]), ui.newFc[e.k] ? '__new' : (l ? S(l.fcId) : ''), ' style="width:100%" aria-label="System failure condition"')
            + (ui.newFc[e.k] ? '<div class="apx-urow" style="margin-top:6px;grid-template-columns:minmax(0,1fr) auto"><input type="text" data-apx-newfc="' + E(e.k) + '" placeholder="Describe it, for example: ' + E(e.what) + '" aria-label="New failure condition"><button class="apx-btn" data-apx-x="mkfc|' + E(e.k) + '">Create and link</button></div>' : '');
    }
    function stepLinks(fc) {
        var n = need(fc, 'Links down to the system fault trees'); if (n) return n;
        var sol = ready(fc) ? solved(fc) : null; if (!sol || sol.error || !sol.done) return card('Links down to the system fault trees', 'Finish the switch-off questions first.', '');
        var madeNow = ensureSysFcs(fc);
        var evs = linkEvents(fc), rows = evs.map(function (e) {
            var st = linkState(fc, e), l = st.link;
            var pick = linkPicker(fc, e);
            var tree = !l ? 'Pick the failure condition first' : !st.target ? 'Its failure condition is gone' : !st.tree ? 'No fault tree yet' : st.built ? 'Built from the architecture' : 'Its top event only, nothing built under it';
            var act = !l ? '<span class="apx-tag">Not linked yet</span>' : st.review ? '<span class="apx-tag bad">Link kept. Needs review</span>' + E(st.review) + ' <button class="apx-btn" data-apx-x="rev|' + E(e.k) + '"' + (st.target ? '' : ' disabled') + '>Mark reviewed</button>' : st.inAc ? '<span class="apx-tag ok">Linked</span>in the aircraft fault tree' : '<span class="apx-tag ok">Linked</span>' + (st.acTree ? '<button class="apx-btn" data-apx-x="intree|' + E(e.k) + '">Put it in the aircraft fault tree</button>' : 'the aircraft fault tree does not exist yet');
            return '<tr><td class="l"><b>' + E(e.what) + '</b></td><td class="l">' + pick + '</td><td class="l">' + E(tree) + '</td><td class="l">' + (l ? '<div style="font-size:12px">' + E(l.id) + '</div>' : '') + act + '</td></tr>';
        }).join('');
        var orph = orphanLinks(fc), nrev = evs.filter(function (e) { return linkState(fc, e).review; }).length + orph.length;
        var body = note('', '<b>There is no MAC below the aircraft level.</b> Each loss in a MAC rule links down to that system\'s own failure condition and its fault tree, which is built from the architecture. Something like "2 of 3 computers" is a gate inside that tree, not a MAC rule.') + note('', '<b>The tool adds each loss to its system\'s FHA by itself</b>, keyed to the system function and traced to this failure condition. The severity is left blank: one loss is a contributor, and what it is worth depends on what else still works, so the system engineer classifies it. You can point a link at a different line of that FHA.' + (madeNow.length ? ' ' + madeNow.length + ' line' + (madeNow.length > 1 ? 's were' : ' was') + ' added just now.' : ''))
            + '<div class="apx-tw"><table data-sl-worksheet="1" class="apx-arp"><tr><th>Loss in the MAC rules</th><th>System failure condition</th><th>Its fault tree</th><th>Link</th></tr>' + (rows || '<tr><td class="l" colspan="4">No loss to link: nothing breaks this MAC.</td></tr>') + '</table></div>'
            + (orph.length ? note('warn', '<b>Links kept from before.</b> ' + orph.map(function (o) { return E(o.link.id) + ' to ' + E(o.link.fcId) + ': its loss is no longer in the MAC rules.'; }).join(' ') + ' The tool does not remove links. They stay on file.') : '')
            + note(nrev ? 'warn' : 'good', '<b>Links are never broken.</b> Each one has a permanent ID. If a build changes, a tree is rebuilt or the MAC is redone, the link stays and is marked for review. The tool never removes one by itself.' + (nrev ? ' ' + nrev + ' link' + (nrev > 1 ? 's need' : ' needs') + ' review now.' : ''));
        return card('Links down to the system fault trees', 'Every loss named in the MAC rules points to the system failure condition, and so to the fault tree, that explains how it can happen.', body);
    }
    function stepTree(fc) {
        var n = need(fc, 'Does the fault tree match the MAC?'); if (n) return n;
        var t = treeCheck(fc);
        if (!t.ready) return card('Does the fault tree match the MAC?', 'The tool compares the aircraft fault tree with your MAC. Anything that breaks the MAC must be in the tree, and everything in the tree must break the MAC.', note(t.noTree ? '' : 'warn', E(t.why)));
        var tag = function (ok, y, no) { return ok === true ? '<span class="apx-tag ok">' + y + '</span>' : ok === false ? '<span class="apx-tag bad">' + no + '</span>' : '<span class="apx-tag warn">Cannot tell</span>'; };
        var body = note(t.ok ? 'good' : 'bad', '<b>' + (t.ok ? 'The fault tree and the MAC agree, both ways.' : 'The fault tree and the MAC do not agree yet. See the rows marked below.') + '</b>')
            + (t.unlinked.length ? note('warn', t.unlinked.length + ' loss' + (t.unlinked.length > 1 ? 'es are' : ' is') + ' not linked to a system failure condition yet (the step before this one), so the tree cannot be read for ' + (t.unlinked.length > 1 ? 'them' : 'it') + ': ' + E(joinAnd(t.unlinked.map(function (e) { return e.what; }))) + '.') : '')
            + '<div class="apx-lanes"><div class="apx-lane"><h4>Every way the MAC can break is in the fault tree</h4><div class="apx-tw"><table data-sl-worksheet="1" class="apx-arp">' + t.a.map(function (x) { return '<tr><td class="l">' + E(x.text) + '</td><td>' + tag(x.ok, 'In the tree', 'Missing') + '</td></tr>'; }).join('') + '</table></div></div>'
            + '<div class="apx-lane"><h4>Every cut set in the fault tree breaks the MAC</h4><div class="apx-tw"><table data-sl-worksheet="1" class="apx-arp">' + (t.b.length ? t.b.map(function (x) { return '<tr><td class="l">' + E(x.text) + (x.why ? '<div style="font-size:12.5px">' + E(x.why) + '</div>' : '') + '</td><td>' + tag(x.ok, 'Breaks it', 'Does not') + '</td></tr>'; }).join('') : '<tr><td class="l">The tree has no cut set yet.</td></tr>') + '</table></div></div></div>';
        var miss = t.a.filter(function (x) { return !x.ok; })[0];
        if (miss) body += note('bad', 'The MAC says "' + E(miss.text) + '" causes the failure condition, but the fault tree has no branch for exactly that. Add the branch in the Fault trees tab, or fix the MAC.');
        return card('Does the fault tree match the MAC?', 'The tool compares the aircraft fault tree with your MAC. Anything that breaks the MAC must be in the tree, and everything in the tree must break the MAC.', body);
    }
    function stepSdd(fc) {
        var n = need(fc, 'Add the SDD and compare'); if (n) return n;
        var ds = macCols(fc), st = macStatus(fc), dl = docs(), body = '';
        if (ds.some(function (d) { return !d.set; })) return card('Add the SDD and compare', 'Set how every system is built first.', '');
        body += '<div class="apx-sw" role="group" aria-label="Who reads the SDD" style="margin:0 0 12px">' + [['ai', 'The AI reads the SDD'], ['hand', 'I read it myself']].map(function (w) { return '<button type="button" class="' + (ui.sddWay === w[0] ? 'on' : '') + '" data-apx-x="sddway|' + w[0] + '">' + w[1] + '</button>'; }).join('') + '</div>';
        if (ui.sddWay === 'ai') body += dl.length ? '<div class="apx-add" style="grid-template-columns:auto minmax(0,1fr) auto;margin:0 0 12px"><b>The SDD</b>' + sel('sdddoc', [['', 'Pick the SDD from the project\'s source documents']].concat(dl.map(function (d) { return [d.name, d.name]; })), ui.sddDoc) + '<button class="apx-btn" data-apx-x="readsdd"' + (ui.busy ? ' disabled' : '') + '>' + (ui.busy === 'sdd' ? 'The AI is reading the SDD...' : 'Read it and compare') + '</button></div><p style="margin:0 0 12px;font-size:12.5px">The AI reads what the SDD says about each build and quotes it. The comparison itself is done by the tool, not the AI.</p>' : note('warn', 'This project has no source document with readable text yet. Add the SDD on the AI inputs page, or read it yourself and enter what it says.');
        var rows = ds.map(function (d) {
            var g = d.g, s = g.sdd, same = s && sameBuild(g, s), key = d.colId + '|' + d.gid;
            var says = s ? E(PATTERNS[s.pattern].label) + (s.quote || s.where || s.doc ? '<div style="font-size:12.5px">' + (s.quote ? '"' + E(s.quote) + '" ' : '') + '(' + E([s.doc, s.where].filter(Boolean).join(', ') || 'no reference given') + ')</div>' : '') + '<div style="font-size:12px">' + (s.src === 'ai' ? 'Read by the AI' : 'Read by ' + E(s.by)) + '</div>' : 'Not compared yet';
            if (ui.sddWay === 'hand') says += '<div class="apx-urow" style="margin-top:6px">' + sel('sddpat|' + key, [['', 'What the SDD says']].concat(Object.keys(PATTERNS).map(function (k) { return [k, PATTERNS[k].label]; })), s && s.src !== 'ai' ? s.pattern : '') + '<input type="text" data-apx-sddref="' + E(key) + '" value="' + E(s && s.src !== 'ai' ? [s.doc, s.where].filter(Boolean).join(', ') : '') + '" placeholder="SDD section or page" aria-label="SDD reference"></div>';
            var act = !s ? '' : same ? '' : g.resolve === 'dispute' ? '<span class="apx-tag bad">Raised with the design team</span>' : '<button class="apx-btn" data-apx-x="res|' + E(key) + '|sdd">Use the SDD build</button> <button class="apx-btn" data-apx-x="res|' + E(key) + '|dispute">The SDD is wrong: raise it</button>';
            return '<tr><td class="l"><b>' + E(d.name) + '</b></td><td class="l">' + E(d.P.label) + (g.src === 'sdd' ? ' <span class="apx-tag ok">now from the SDD</span>' : '') + '</td><td class="l">' + says + '</td><td>' + (!s ? '<span class="apx-tag">Open</span>' : same ? '<span class="apx-tag ok">Same</span>' : '<span class="apx-tag bad">Different</span>') + '</td><td class="l">' + act + '</td></tr>';
        }).join('');
        body += '<div class="apx-tw"><table data-sl-worksheet="1" class="apx-arp"><tr><th>Assembly group</th><th>How you set it</th><th>What the SDD says</th><th>Match?</th><th></th></tr>' + rows + '</table></div>';
        var diff = ds.filter(function (d) { return d.g.sdd && !sameBuild(d.g, d.g.sdd) && !d.g.resolve; });
        if (diff.length) body += note('bad', diff.map(function (d) { var one = function (p) { return PATTERNS[p].map[1] === 'O' ? 'no loss at all' : PATTERNS[p].map[1] === 'F' ? 'a total loss' : 'a partial loss'; }; return '<b>' + E(d.name) + ':</b> you set "' + E(d.P.label) + '", so losing one unit counted as ' + one(d.g.pattern) + '. The SDD says "' + E(PATTERNS[d.g.sdd.pattern].label) + '", so losing one unit is ' + one(d.g.sdd.pattern) + '. If you use the SDD build, the switch-off questions that involve it are asked again and its links are marked for review.'; }).join('<br>'));
        body += statusNote(fc);
        var l = left(fc), s2 = status(fc);
        body += l.length ? note('warn', l.map(E).join('<br>')) : '';
        if (s2.k === 'sent') body += '<div class="apx-sent"><b>Sent to the PASA</b> as: ' + E((peek(fc.key).sent || {}).statusText || '') + '. Signed by <b>' + E(s2.by) + '</b> on ' + E(S(s2.at).slice(0, 10)) + '.</div>' + K.takeOut(fc, 'mac');
        else body += (s2.k === 'changed' ? note('warn', 'Something changed since this was sent. Send it again to bring the PASA up to date.') : '')
            + '<div class="apx-eff" style="margin-top:14px"><div><b>Sign with your name</b></div><div><input type="text" data-apx-sign="1" value="' + E(K.ui.sign != null ? K.ui.sign : K.who()) + '" placeholder="One signature covers this MAC" aria-label="Sign with your name"></div></div>'
            + (K.ui.signMiss ? note('bad', E(K.ui.signMiss)) : '')
            + '<button class="apx-btn p big" style="margin-top:12px" data-apx-x="send"' + (l.length ? ' disabled' : '') + '>' + (st.k === 'backed' ? 'Send to the PASA' : 'Send to the PASA, marked ' + E(st.word)) + '</button>';
        return card('Add the SDD and compare', 'In the end, every build you set must be checked against the SDD. Until then the PASA shows this MAC as Assumed.', body);
    }

    function render(i, fc) { style(); return [null, stepBuild, stepGame, stepWorked, stepMalf, stepLanes, stepLinks, stepTree, stepSdd][i](fc); }
    function parts(arg, n) { var a = arg.split('|'); if (a.length > n) a = a.slice(0, n - 1).concat([a.slice(n - 1).join('|')]); return a; }
    function click(action, arg, el, fc) {
        var a;
        if (action === 'way') { ui.way = arg; return true; }
        if (action === 'sddway') { ui.sddWay = arg; return true; }
        if (action === 'addgrp') { addGroup(fc, arg); return true; }
        if (action === 'co') { a = arg.split('|'); setCo(fc, a[0], a[1], a[2], null); return true; }
        if (action === 'askadd') {
            var ac = ui.ask.col, ap = ui.ask.pat, an = T(K.val('[data-apx-xc="askname"]') || ui.ask.name);
            if (!ac) { K.toast('Pick the system function first.', 'warning'); return false; }
            if (!PATTERNS[ap]) { K.toast('Say how it is built.', 'warning'); return false; }
            var have = groupsOf(ac), free = have.filter(function (g0) { return !patOf(g0); })[0];
            if (!an && have.some(function (g0) { return patOf(g0) && !T(g0.name); })) { K.toast('That system already has its one group. Give this one a name to add another.', 'warning'); return false; }
            if (an && have.some(function (g0) { return T(g0.name).toLowerCase() === an.toLowerCase(); })) { K.toast('That system already has a group with that name.', 'warning'); return false; }
            var ng = free || newGroup(ac); ng.name = an; setPattern(fc, ac, ng.id, ap, 'hand', '');
            ui.ask.name = ''; ui.ask.pat = '';
            return true;
        }
        if (action === 'delgrp') { a = arg.split('|'); removeGroup(fc, a[0], a[1]); return true; }
        if (action === 'mirror') { setMirror(fc, arg === '1'); return true; }
        if (action === 'accept') { acceptProposal(fc, arg); return true; }
        if (action === 'dismiss') { dismissProposal(arg); return true; }
        if (action === 'propose') {
            var payload = arg === 'doc' ? docs().filter(function (d) { return d.name === ui.doc; })[0] : { text: ui.told };
            if (arg === 'doc' && !payload) { K.toast('Pick the document first.', 'warning'); return false; }
            ui.busy = arg; K.draw();
            return propose(fc, arg, payload).then(function (r) { ui.busy = ''; K.toast(r.n ? 'The AI proposed the build for ' + r.n + ' of ' + r.of + ' system function' + (r.of > 1 ? 's' : '') + '. Accept or dismiss each one.' : 'The AI found nothing it could rest a build on. Nothing was proposed.', r.n ? 'info' : 'warning'); }, function (e) { ui.busy = ''; throw e; });
        }
        if (action === 'readsdd') {
            var doc = docs().filter(function (d) { return d.name === ui.sddDoc; })[0];
            if (!doc) { K.toast('Pick the SDD first.', 'warning'); return false; }
            ui.busy = 'sdd'; K.draw();
            return readSdd(fc, doc).then(function (r) { ui.busy = ''; K.toast('The SDD was read for ' + r.n + ' of ' + r.of + ' build' + (r.of > 1 ? 's' : '') + '.' + (r.n < r.of ? ' Where it says nothing, read it yourself.' : ''), 'info'); }, function (e) { ui.busy = ''; throw e; });
        }
        if (action === 'ans') { a = arg.split('|'); answer(fc, a[0], a[1] === '1'); return true; }
        if (action === 'undo') { undo(fc); return true; }
        if (action === 'clear') { clearAnswers(fc); return true; }
        if (action === 'convert') { var cr = convert(fc); if (!cr.ok) K.toast(cr.why, 'warning'); return true; }
        if (action === 'try') { a = arg.split('|'); var k = Number(a.pop()), id = a.join('|'), cur = arr(ui.tryOff[id]).slice(); cur[k] = !cur[k]; ui.tryOff[id] = cur; return true; }
        if (action === 'malf') { var m = malfList(fc).filter(function (x) { return x.colId === arg; })[0]; if (m) setMalf(fc, arg, !m.on, null); return true; }
        if (action === 'mkfc') { var e = allEvents(fc).filter(function (x) { return x.k === arg; })[0]; if (!e) return true; var inp = K.val('[data-apx-newfc="' + arg.replace(/"/g, '\\"') + '"]'), r1 = createSysFc(fc, arg, e.sysId, inp); if (!r1.ok) { K.toast(r1.why, 'warning'); return false; } if (r1.existed) K.toast('That failure condition is already in the system FHA. It is linked instead of being added again.'); delete ui.newFc[arg]; return true; }
        if (action === 'rev') { var r2 = rec(fc.key); if (r2.links[arg]) { r2.links[arg].review = ''; r2.links[arg].reviewed = { by: K.who(), at: K.now() }; if (r2.links[arg].inTree) r2.links[arg].inTree = false; touched(fc.key); } return true; }
        if (action === 'intree') { var r3 = linkIntoTree(fc, arg); if (!r3.ok) K.toast(r3.why, 'warning'); return true; }
        if (action === 'res') { a = arg.split('|'); resolveSdd(fc, a[0], a[1], a[2]); return true; }
        if (action === 'send') { var name = K.val('[data-apx-sign]'), res = send(fc, name); K.ui.sign = name; K.ui.signMiss = res.ok ? false : res.why; return true; }
        return false;
    }
    function change(action, arg, el, fc) {
        var a, v = el.value;
        if (action === 'askcol') { ui.ask.col = v; return false; }
        if (action === 'askpat') { ui.ask.pat = v; return false; }
        if (action === 'askname') { ui.ask.name = v; return false; }
        if (action === 'doc') { ui.doc = v; return false; }
        if (action === 'sdddoc') { ui.sddDoc = v; return false; }
        if (action === 'told') { ui.told = v; return false; }
        if (action === 'pat') { a = arg.split('|'); setPattern(fc, a[0], a[1], v, 'hand', ''); return true; }
        if (action === 'pos') { a = arg.split('|'); setPos(fc, a[0], a[1], v); return true; }
        if (action === 'coname') { a = arg.split('|'); setCo(fc, a[0], a[1], null, v); return true; }
        if (action === 'gname') { a = arg.split('|'); if (!a[1]) newGroup(a[0]).name = T(v); else setGroupName(fc, a[0], a[1], v); K.save(); return true; }
        if (action === 'uname') { a = arg.split('|'); setUnit(fc, a[0], a[1], Number(a[2]), 'name', v); return true; }
        if (action === 'uside') { a = arg.split('|'); setUnit(fc, a[0], a[1], Number(a[2]), 'side', v); return true; }
        if (action === 'ev') { setEv(fc, v); return false; }
        if (action === 'why') { setWhy(fc, arg, v); return false; }
        if (action === 'malfmode') { setMalf(fc, arg, true, v); return true; }
        if (action === 'link') { if (v === '__new') { ui.newFc[arg] = true; return true; } delete ui.newFc[arg]; var e = allEvents(fc).filter(function (x) { return x.k === arg; })[0]; if (e && v) setLink(fc, arg, e.sysId, v); return true; }
        if (action === 'sddpat') { a = arg.split('|'); if (!v) return false; var ref = K.val('[data-apx-sddref="' + arg.replace(/"/g, '\\"') + '"]'); setSdd(fc, a[0], a[1], { pattern: v, where: ref, doc: '', src: 'hand' }); return true; }
        return false;
    }

    var api = { VERSION: VERSION, PATTERNS: PATTERNS,
        model: { coOf: coOf, coWays: coWays, macCols: macCols, ready: ready, solved: solved, breaking: breaking, rules: rulesOf, ruleWords: ruleWords, caseText: caseText, unitWords: unitWords, stLabel: stLabel, lanes: lanes, malfList: malfList, aloneMalf: aloneMalf, comboMalf: comboMalf, left: left, status: status, macStatus: macStatus, linkEvents: linkEvents, sysFcText: sysFcText, sysFcRow: sysFcRow, contributions: contributions, setEffect: setEffect, allEvents: allEvents, sysById: sysById, joinAnd: joinAnd, unitsOff: unitsOff, linkOf: linkOf, linkState: linkState, orphanLinks: orphanLinks, treeCheck: treeCheck, cutSets: cutSets, groupsOf: groupsOf, lossBase: lossBase, sysGroups: sysGroups, peek: peek, conversion: conversion, oldRules: oldRules, docs: docs, acTree: acTree, rulesTable: rulesTable },
        act: { setCo: setCo, setPattern: setPattern, setPos: setPos, setGroupName: setGroupName, setUnit: setUnit, addGroup: addGroup, removeGroup: removeGroup, setMirror: setMirror, answer: answer, undo: undo, clearAnswers: clearAnswers, setWhy: setWhy, setEv: setEv, setMalf: setMalf, setLink: setLink, linkIntoTree: linkIntoTree, createSysFc: createSysFc, ensureSysFcs: ensureSysFcs, mirror: mirror, setSdd: setSdd, resolveSdd: resolveSdd, send: send, propose: propose, acceptProposal: acceptProposal, dismissProposal: dismissProposal, readSdd: readSdd, convert: convert, cleanProposal: cleanProposal },
        linkPicker: linkPicker, click: click, change: change, style: style, note: note, sel: sel, _ui: ui };
    A.register('mac', { name: 'MAC', steps: ['Failure condition', 'How each system is built', 'Switch it off', 'What the tool worked out', 'Wrong actions that cause it', 'The three lanes', 'Links down to the system fault trees', 'Check the fault tree against the MAC', 'Add the SDD, compare and send'], render: render, click: click, change: change, status: status });
    try { root.SLApxMac = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
