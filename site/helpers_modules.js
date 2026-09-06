// helpers_modules.js — v1.0 — Phase P2 batch 4: runtime helper layer (bulk pass).
// MOVED VERBATIM from safety_lab.js (byte-exact; classic script loaded BEFORE the
// monolith; all names remain global). 100%% pure runtime function declarations —
// zero load-time code. Each segment was machine-validated (standalone parse +
// monolith-minus-segment parse) before the move; reconstruction diff proves the
// original file is byte-recoverable. Segment map: see [P2 batch 4] markers in safety_lab.js.
function _slNumberCtx() {
    let prog = '';
    try { prog = (projectConfig && projectConfig.programCode) || (typeof projectName === 'string' ? projectName : ''); } catch (_) {}
    return { PROGRAM: String(prog || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'PRJ' };
}
function _slBlank(v) { return v == null || String(v).trim() === ''; }
function _slFillField(kind, field, data, extraCtx, existsFn) {
    const N = window.SafetyLabNumbering;
    if (!_slBlank(data[field])) return;                       // respect manual entry
    // extraCtx (2 Aug 2026): PARENT / MODE / SYS ride into the template, so the
    // engine's scoped patterns ({PARENT}-{MODE}, {SYS}-…) finally receive the
    // context they were designed for. Absent ⇒ exactly the old behaviour.
    const ctx = extraCtx ? Object.assign(_slNumberCtx(), extraCtx) : _slNumberCtx();
    let cand = N.makeId(slNumberingScheme, kind, ctx, slNumberingStore);
    // COLLISION GUARD (2 Aug, caught live): a derived template ({PARENT}-{MODE},
    // no {SEQ}) mints the SAME id for every row sharing PARENT+MODE — a
    // function's aware/unaware pair collided on SF-03-TL. When the caller can
    // name the ids already in use, suffix the MODE with the lowest free
    // ordinal: TL → TL2 → TL3; PL2 → PL3 (trailing digits continue, never
    // stack to PL22). SEQ-bearing templates never collide, so existsFn simply
    // never fires there.
    if (typeof existsFn === 'function' && extraCtx && extraCtx.MODE) {
        const m0 = String(extraCtx.MODE);
        const base = m0.replace(/\d+$/, '');
        let n = (parseInt(m0.slice(base.length), 10) || 1) + 1;
        let guard = 0;
        while (cand && existsFn(cand) && guard++ < 200) {
            cand = N.makeId(slNumberingScheme, kind, Object.assign({}, ctx, { MODE: base + n }), slNumberingStore);
            n++;
        }
    }
    data[field] = cand;
}
// Aircraft function ID: rows sharing a function name must share one ID. Reuse an
// existing row's funcId for the same name; otherwise mint a new one (once per name).
function _slAssignFuncId(data) {
    const N = window.SafetyLabNumbering;
    if (!_slBlank(data.funcId)) return;
    const name = (data.funcName || '').trim().toLowerCase();
    if (name) {
        const ex = (acFunctionsData || []).find(r => (r.funcName || '').trim().toLowerCase() === name && !_slBlank(r.funcId));
        if (ex) { data.funcId = ex.funcId; return; }
        data.funcId = N.makeSharedId(slNumberingScheme, 'acFunction', 'name:' + name, _slNumberCtx(), slNumberingStore);
        return;
    }
    data.funcId = N.makeId(slNumberingScheme, 'acFunction', _slNumberCtx(), slNumberingStore);
}
// FHA failure-condition ID: rows evaluating the SAME condition across different
// flight phases must share ONE fcId (Waqas, 31 Aug 2026: "a failure condition ID
// does not change when evaluating a failure condition across different phases of
// flight" — observed broken in AI-drafted artifacts: every per-phase row minted a
// fresh sequential id, so the App Q phase-group machinery (_fhaGroupRows /
// acFhaAddPhaseVariant, 22 Aug) never engaged on AI rows). Same pattern as
// _slAssignFuncId: reuse by identity key, mint once otherwise. Identity =
// sub-function + normalized condition text (scoped per system for SFHA) — the
// deterministic criterion functions already use; a reworded condition is a
// different row on purpose, never a guess. makeSharedId covers rows minted in
// the same batch before either lands in the store.
function _slAssignFcId(data, rows, ctx) {
    const N = window.SafetyLabNumbering;
    if (!_slBlank(data.fcId)) return;                          // respect manual entry
    const desc = (data.fcDesc || '').trim().toLowerCase();
    const sub  = (data.subId  || '').trim().toLowerCase();
    if (desc) {
        const ex = (rows || []).find(r => r && !_slBlank(r.fcId)
            && (r.fcDesc || '').trim().toLowerCase() === desc
            && (r.subId  || '').trim().toLowerCase() === sub);
        if (ex) { data.fcId = ex.fcId; return; }
        const scope = (ctx && ctx.SYS) ? (String(ctx.SYS) + '|') : '';
        data.fcId = N.makeSharedId(slNumberingScheme, 'failureCond', 'cond:' + scope + sub + '|' + desc,
            ctx ? Object.assign(_slNumberCtx(), ctx) : _slNumberCtx(), slNumberingStore);
        return;
    }
    _slFillField('failureCond', 'fcId', data, ctx);            // no text to key on — plain mint
}
// Auto-fill blank IDs on CREATE. key = CRUD/form key. ctx carries scope context
// (SYS for system-level artifacts) into the scheme templates.
//
// 2 Aug 2026 — the switch finally covers what its callers already ask for.
// _slAutoNumber('sysFha', …) and ('sysFunc', …) had been called by the AI
// accept paths since #272 and FELL THROUGH silently (no branch), and the FCIM
// had no key at all — which is why a real project ended up with tool-minted
// FC-### next to hand-typed SF02-PL: a human was doing by hand exactly what
// the engine's own {PARENT}-{MODE} fcimMode template was designed to do, dead
// on every path. Waqas's ruling: the programme's ID schemes drive numbering,
// manual and AI alike, at both aircraft and system level.
function _slAutoNumber(key, data, ctx) {
    try {
        const N = window.SafetyLabNumbering;
        if (!N || !slNumberingScheme) return data;
        const SYS = (ctx && ctx.SYS) || (typeof activeSystemId !== 'undefined' && activeSystemId ? String(activeSystemId) : '');
        if (key === 'acFunc') { _slAssignFuncId(data); _slFillField('subFunction', 'subId', data); }
        // 31 Aug 2026 — FHA ids go through the same-condition reuse path (see
        // _slAssignFcId). sysFha scans the ACTIVE system's rows — the same scope
        // the SYS ctx token already keys numbering to on this path (an AI write
        // to a non-active system inheriting activeSystemId's SYS is a
        // pre-existing wrinkle, unchanged here).
        else if (key === 'acFha') { _slAssignFcId(data, (typeof acFhaData !== 'undefined' ? acFhaData : []), null); }
        else if (key === 'sysFunc') { _slFillField('subFunction', 'funcId', data, { SYS: SYS }); }
        else if (key === 'sysFha') { _slAssignFcId(data, (((typeof sys === 'function' ? sys() : null) || {}).fha) || [], { SYS: SYS }); }
        else if (key === 'acFcim' || key === 'sysFcim') {
            const sysCtx = key === 'sysFcim' ? { SYS: SYS } : {};
            // COLLISION GUARD (2 Aug): the whole matrix's ids — a second row for the
            // same sub-function (aware/unaware pair) must never repeat the pair's ids.
            const _rows = key === 'sysFcim'
                ? (((typeof sys === 'function' ? sys() : null) || {}).fcim || [])
                : ((typeof acFcimData !== 'undefined' ? acFcimData : []) || []);
            const _used = new Set();
            _rows.forEach(function (r) {
                if (!r) return;
                [r.tlId, r.plId, r.mId].forEach(function (v) { if (v) _used.add(v); });
                (Array.isArray(r.plExtra) ? r.plExtra : []).forEach(function (e) { if (e && e.id) _used.add(e.id); });
                (Array.isArray(r.mExtra) ? r.mExtra : []).forEach(function (e) { if (e && e.id) _used.add(e.id); });
                (Array.isArray(r.combined) ? r.combined : []).forEach(function (c) { if (c && c.cbId) _used.add(c.cbId); });
            });
            const _inData = function () {
                return [data.tlId, data.plId, data.mId]
                    .concat((Array.isArray(data.plExtra) ? data.plExtra : []).map(function (e) { return e && e.id; }))
                    .concat((Array.isArray(data.mExtra) ? data.mExtra : []).map(function (e) { return e && e.id; }))
                    .filter(Boolean);
            };
            const _exists = function (id) { return _used.has(id) || _inData().indexOf(id) >= 0; };
            if (!_slBlank(data.tlDesc)) _slFillField('fcimMode', 'tlId', data, Object.assign({ PARENT: data.subId || '', MODE: 'TL' }, sysCtx), _exists);
            if (!_slBlank(data.plDesc)) _slFillField('fcimMode', 'plId', data, Object.assign({ PARENT: data.subId || '', MODE: 'PL' }, sysCtx), _exists);
            if (!_slBlank(data.mDesc))  _slFillField('fcimMode', 'mId',  data, Object.assign({ PARENT: data.subId || '', MODE: 'M' }, sysCtx), _exists);
            // Multiplicity extras (Table A3): PL2, PL3… / M2, M3… after the primary.
            ['plExtra', 'mExtra'].forEach(function (k) {
                (Array.isArray(data[k]) ? data[k] : []).forEach(function (e, i) {
                    if (e && !e.id && e.desc) {
                        const t = { _x: '' };
                        _slFillField('fcimMode', '_x', t, Object.assign({ PARENT: data.subId || '', MODE: (k === 'plExtra' ? 'PL' : 'M') + (i + 2) }, sysCtx), _exists);
                        e.id = t._x;
                    }
                });
            });
        }
    } catch (e) { console.warn('[numbering] auto-id failed:', e); }
    return data;
}
function _slMaxTrailingSeq(ids) {
    let max = 0; const re = /(\d+)\s*$/;
    (ids || []).forEach(v => { if (v == null) return; const mm = String(v).match(re); if (mm) { const n = parseInt(mm[1], 10); if (n > max) max = n; } });
    return max;
}
function _slSeedNumberingFromExisting() {
    const N = window.SafetyLabNumbering; if (!N || !slNumberingScheme) return;
    try {
        const af = slNumberingScheme.templates.acFunction;
        N.seedCounter(slNumberingStore, af.type, 'global', {}, _slMaxTrailingSeq((acFunctionsData || []).map(r => r.funcId)));
        const sf = slNumberingScheme.templates.subFunction;
        N.seedCounter(slNumberingStore, sf.type, 'global', {}, _slMaxTrailingSeq((acFunctionsData || []).map(r => r.subId)));
        const fc = slNumberingScheme.templates.failureCond;
        N.seedCounter(slNumberingStore, fc.type, 'global', {}, _slMaxTrailingSeq((acFhaData || []).map(r => r.fcId)));
    } catch (e) { console.warn('[numbering] seed failed:', e); }
}
function _slInitNumberingFromProject(data) {
    const N = window.SafetyLabNumbering;
    slNumberingScheme = (data && data.numberingScheme) || (N ? N.DEFAULT_SCHEME : slNumberingScheme);
    slNumberingStore  = (data && data.numberingStore)  || (N ? N.newStore() : { seq: {}, map: {} });
    _slSeedNumberingFromExisting();
}
function _slResetNumbering() {
    const N = window.SafetyLabNumbering;
    slNumberingScheme = N ? N.DEFAULT_SCHEME : null;
    slNumberingStore  = N ? N.newStore() : { seq: {}, map: {} };
}

function getLicenseTier() {
    // 6 Sep 2026 — a verified signed license is the authority. On a customer install
    // (self-hosted / browser-only / desktop) it is the ONLY authority: absent or invalid
    // → 'unpaid' (fail closed). On the hosted demo it applies only when valid.
    try {
        const L = (typeof window !== 'undefined') ? window.SLLicense : null;
        if (L && L.authoritative) return L.valid ? L.tier : 'unpaid';
    } catch (_) {}
    try {
        const tier = localStorage.getItem('safetyLab.license.tier');
        if (tier && LICENSE_TIER_RANK.hasOwnProperty(tier)) return tier;
    } catch(_) {}
    // Phase 56.13 — was 'pro-plus' (beta default). Now 'unpaid' so the paywall
    // engages after trial + grandfather expire and no Stripe subscription is recorded.
    return 'unpaid';
}
function getEffectiveTier() {
    // Phase 53.74 / 55.0.5b — Comped sign-ins (electra.aero domain, or specific
    // founder/advisor emails in COMPED_FREE_EMAILS) always exercise Pro+ regardless
    // of trial state. They get the full demo on first launch with no degradation.
    try {
        const email = (localStorage.getItem('safetyLab.signup.email') || '').toLowerCase();
        if (email && typeof isCompedEmail === 'function' && isCompedEmail(email)) {
            // Comped accounts are guaranteed AT LEAST Pro+, but must never be downgraded
            // below the tier they actually hold — an enterprise/owner account stays
            // enterprise (otherwise the comp would silently cap it at Pro+).
            const held = getLicenseTier();
            return (LICENSE_TIER_RANK[held] || 0) >= LICENSE_TIER_RANK['pro-plus'] ? held : 'pro-plus';
        }
    } catch(_) {}
    if (isOnTrial()) return 'edu';
    // Phase 56.13 — grandfather window grants Pro+ access to existing signups for 30
    // days after enforcement start, then they revert to whatever tier they actually
    // hold (which for non-payers is 'unpaid' → paywalled). Like the comp path, never
    // downgrade an account that already holds a tier above Pro+.
    if (isInGrandfatherWindow()) {
        const heldGf = getLicenseTier();
        return (LICENSE_TIER_RANK[heldGf] || 0) >= LICENSE_TIER_RANK['pro-plus'] ? heldGf : 'pro-plus';
    }
    return getLicenseTier();
}

// Phase 56.13 — Paywall predicate. True when the user has no comp, no trial, no
// grandfather window, and no recorded paid subscription. Drives the paywall screen.
function _slEntitlementVerdict(o) {
    o = o || {};
    if (o.activeLicense) return { paywalled: false, tier: o.licensePlan || 'pro-plus' };
    if (o.comped)        return { paywalled: false, tier: 'pro-plus' };
    if (o.academic)      return { paywalled: false, tier: 'edu' };
    if (o.onTrial)       return { paywalled: false, tier: 'edu' };
    return { paywalled: true, tier: 'unpaid' };
}
try { if (typeof window !== 'undefined') window._slEntitlementVerdict = _slEntitlementVerdict; } catch(_) {}

// ONE licensing rule (6 Sep 2026, desktop parity). Wherever the signed license is the
// authority — every customer install: self-hosted, browser-only, desktop — the paywall
// question IS the license question: valid → never paywalled, invalid/absent → paywalled
// (and slab_license.js shows the "load your license" screen). The server entitlement
// verdict below belongs to the hosted demo cloud only. This replaces the 30 Aug "desktop
// never renders the paywall" exemption: a desktop without a valid license IS paywalled
// (Waqas, 5 Sep), and a desktop with one is licensed by the same file the web trusts.
function _signedLicenseAuthority() {
    try { const L = window.SLLicense; if (L && L.authoritative) return { authoritative: true, valid: !!L.valid }; } catch (_) {}
    return { authoritative: false, valid: false };
}
function isPaywalled() {
    try {
        const _lic = _signedLicenseAuthority();
        if (_lic.authoritative) return !_lic.valid;
        // Phase 57 — SERVER-AUTHORITATIVE verdict, written by _onSupabaseSignedIn from the
        // user's real Supabase tier / trial_ends_at / license_tokens. When set it is the
        // ONLY authority; fails OPEN (unset -> fall through) so a transient error never
        // locks a paying user. The localStorage logic below is the pre-sync fallback.
        try {
            const _sv = localStorage.getItem('safetyLab.server.paywalled');
            if (_sv === '1') return true;
            if (_sv === '0') return false;
        } catch(_) {}
        const email = (localStorage.getItem('safetyLab.signup.email') || '').toLowerCase();
        // No signup at all → the auth gate will catch them before paywall (no-op here).
        if (!email) return false;
        // Comped → never paywalled.
        if (typeof isCompedEmail === 'function' && isCompedEmail(email)) return false;
        // Active trial → not paywalled.
        if (isOnTrial()) return false;
        // Grandfather window → not paywalled.
        if (isInGrandfatherWindow()) return false;
        // Has a recognized paid tier in localStorage → not paywalled.
        const tier = (function() { try { return localStorage.getItem('safetyLab.license.tier') || ''; } catch(_) { return ''; } })();
        if (tier && LICENSE_TIER_RANK.hasOwnProperty(tier) && tier !== 'unpaid') return false;
        return true;
    } catch(_) { return false; }
}

function getSignupEmail() {
    try { return localStorage.getItem('safetyLab.signup.email') || ''; } catch(_) { return ''; }
}
function setSignupEmail(email) {
    try {
        if (email) {
            localStorage.setItem('safetyLab.signup.email', String(email).trim().toLowerCase());
            // Phase 56.13 — stamp signup date on the first sign-in so we can compute
            // grandfather-window eligibility. Won't overwrite an existing date.
            if (!localStorage.getItem('safetyLab.signup.signupDate')) {
                localStorage.setItem('safetyLab.signup.signupDate', String(Date.now()));
            }
        } else {
            localStorage.removeItem('safetyLab.signup.email');
        }
    } catch(_) {}
}
function getSignupName() {
    try { return localStorage.getItem('safetyLab.signup.name') || ''; } catch(_) { return ''; }
}
function setSignupName(name) {
    try {
        if (name) localStorage.setItem('safetyLab.signup.name', String(name).trim());
        else      localStorage.removeItem('safetyLab.signup.name');
    } catch(_) {}
}
function getSignupOrg() {
    try { return localStorage.getItem('safetyLab.signup.org') || ''; } catch(_) { return ''; }
}
function setSignupOrg(org) {
    try {
        if (org) localStorage.setItem('safetyLab.signup.org', String(org).trim());
        else     localStorage.removeItem('safetyLab.signup.org');
    } catch(_) {}
}
function setLicenseTier(tier) {
    if (!LICENSE_TIER_RANK.hasOwnProperty(tier)) return false;
    try { localStorage.setItem('safetyLab.license.tier', tier); } catch(_) {}
    return true;
}

function _prDeriveCtx(cfg, ctx) {
    if (ctx && typeof ctx === 'object') return ctx;
    cfg = cfg || {};
    const items = (typeof itemsData !== 'undefined' && Array.isArray(itemsData)) ? itemsData : [];
    const engineItems = items.filter(it => it && it.isEngine);
    const reg = String(cfg.regulation || '');
    // Optional future/explicit fields — honored if present, otherwise inferred.
    const propHint = String(cfg.propulsion || cfg.propulsionType || '').toLowerCase();
    const gearHint = String(cfg.landingGear || cfg.gearType || '').toLowerCase();
    // Electric propulsion: explicit hint wins; else SC-VTOL is the strong default signal;
    // else an explicit electric Part 23 hint. Conservative: only "electric" when we have a signal.
    const isElectric = /electr|battery|evtol/.test(propHint) ||
        (reg === 'SC-VTOL' && !/turbine|turbo|piston|combust/.test(propHint));
    const isPiston = /piston|recip/.test(propHint);
    // Turbine present: an explicit turbine hint, OR any engine item exists and we have no
    // electric/piston signal (most fixed-wing transport + rotorcraft are turbine).
    const hasTurbine = /turbine|turbo|jet|turbofan|turboprop|turboshaft/.test(propHint) ||
        (engineItems.length > 0 && !isElectric && !isPiston) ||
        (engineItems.length === 0 && !isElectric && !isPiston &&
            (reg === 'Part 25' || reg === 'Part 29' || reg === 'Part 27' || reg === 'Part 33'));
    // Retractable gear: explicit "fixed" hint disables; explicit "retract" enables; else
    // default to retractable for transport categories, unknown (treated as applicable) elsewhere.
    const fixedGear = /fixed|skid|non-retract/.test(gearHint);
    const retractableGear = /retract/.test(gearHint) ||
        (!fixedGear && (reg === 'Part 25' || reg === 'Part 29' || reg === 'Part 23'));
    const isRotorcraft = (reg === 'Part 27' || reg === 'Part 29');
    return {
        regulation: reg,
        engineCount: engineItems.length,
        isElectric: !!isElectric,
        isPiston: !!isPiston,
        hasTurbine: !!hasTurbine,
        fixedGear: !!fixedGear,
        retractableGear: !!retractableGear,
        isRotorcraft: !!isRotorcraft
    };
}

// PARTICULAR_RISK_APPLICABILITY — extracted to catalogue_data.js (Phase 76; byte-identical, loaded BEFORE this file).

// Rotorcraft-specific note appended to applicable reasons under Part 27/29. The 9-value
// enum has no rotorcraft-only risk, so this is surfaced as supplemental context rather
// than a separate enum member (which would change the enum — not permitted).
function _prRotorcraftNote(cfg, ctx) {
    const c = _prDeriveCtx(cfg, ctx);
    return c.isRotorcraft
        ? ' Rotorcraft cert basis (Part 27/29): also consider main/tail-rotor burst, drive-system & transmission debris per §27/29.901.'
        : '';
}

// Public consumable surface. Returns { applicable:[{risk,reason}], notApplicable:[{risk,reason}] }
// partitioning the canonical 9-value PRA enum against the active projectConfig. `ctx` is optional;
// when omitted it is derived from itemsData. Never throws — any predicate error is treated as
// "applicable" (fail-open) so the PRA/AI never silently drops a risk.
function applicableParticularRisks(projectConfig, ctx) {
    const cfg = projectConfig || (typeof window !== 'undefined' && window.projectConfig) ||
        (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {};
    const derived = _prDeriveCtx(cfg, ctx);
    const applicable = [];
    const notApplicable = [];
    PARTICULAR_RISK_APPLICABILITY.forEach(entry => {
        let ok = true;
        try { ok = !!entry.appliesTo(cfg, derived); } catch (e) { ok = true; }
        let reason = '';
        try { reason = String(entry.reason(cfg, derived) || ''); } catch (e) { reason = ''; }
        if (ok) reason += _prRotorcraftNote(cfg, derived);
        (ok ? applicable : notApplicable).push({ risk: entry.risk, reason: reason });
    });
    return { applicable, notApplicable };
}

function dalDecrement(dal, n) {
    if (!dal) return null;
    const i = DAL_ORDER.indexOf(dal);
    if (i < 0) return null;
    const target = Math.min(DAL_ORDER.length - 1, i + (n || 0));
    return DAL_ORDER[target];
}
// Most stringent of two DALs (A wins over B; null treated as "no allocation yet").
function dalMax(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return DAL_ORDER.indexOf(a) <= DAL_ORDER.indexOf(b) ? a : b;
}
// Color for the canvas badge — keeps the heatmap intuitive (red = highest assurance, gray = none).
// Phase 53.41 — DAL palette tuned for legibility against dark text.
//   D was #fef08a (pale yellow) — text was washed out. Bumped to a saturated amber (#fcd34d).
//   E was #9ca3af (mid gray) — bumped to a lighter cool gray so dark text reads cleanly.
// DAL_COLORS — extracted to ui_constants.js (Phase 76; byte-identical, loaded BEFORE this file).

// Per ARP4754A: functions carry FDAL; items carry IDAL. In a fault tree, gates and
// undeveloped events represent function failures; basic events represent item failures.
// House and conditioning events are auxiliary — we mark them with the neutral "DAL" prefix.
// Phase 55.0.8 — explicit per-node user override (dalKindOverride) beats the type heuristic.
function dalPrefixForNode(nodeData) {
    if (!nodeData) return 'DAL';
    const ov = nodeData.dalKindOverride;
    if (ov === 'FDAL' || ov === 'IDAL' || ov === 'DAL') return ov;
    if (nodeData.type === 'gate' || nodeData.type === 'undeveloped') return 'FDAL';
    if (nodeData.type === 'basic') return 'IDAL';
    return 'DAL';
}

function backfillLogicalIds() {
    ftaPages.forEach(page => {
        (function walk(n) {
            if (!n) return;
            if (n.logicalId == null) n.logicalId = n.id;
            const kids = n.children || n._children;
            if (kids) kids.forEach(walk);
        })(page.root);
    });
}

// Returns Map: logicalId → array of nodes sharing it in the active tree (only entries ≥ 2).
function repeatedEventGroups() {
    const groups = new Map();
    const root = getActiveFTARoot();
    if (!root) return groups;
    (function walk(n) {
        if (!n) return;
        const lid = n.logicalId != null ? n.logicalId : n.id;
        if (!groups.has(lid)) groups.set(lid, []);
        groups.get(lid).push(n);
        const kids = n.children || n._children;
        if (kids) kids.forEach(walk);
    })(root);
    // Keep only logicalIds with ≥ 2 occurrences.
    return new Map([...groups.entries()].filter(([, arr]) => arr.length >= 2));
}

// Deep clone a subtree.
//   preserveLogicalIds=true  → keep logicalIds and displayIds (same-tree paste = common mode)
//   preserveLogicalIds=false → mint fresh logicalIds; repeats within the source stay repeats
function cloneSubtree(node, preserveLogicalIds, maps) {
    maps = maps || { logical: new Map(), display: new Map() };
    const newId = internalIdCounter++;
    const oldLogical = node.logicalId != null ? node.logicalId : node.id;
    let newLogical, newDisplay;
    if (preserveLogicalIds) {
        newLogical = oldLogical;
        newDisplay = node.displayId;
    } else {
        if (!maps.logical.has(oldLogical)) {
            maps.logical.set(oldLogical, internalIdCounter++);
            const typeKey = node.type === 'gate' ? 'gate' : node.type;
            maps.display.set(oldLogical, generateDisplayId(typeKey));
        }
        newLogical = maps.logical.get(oldLogical);
        newDisplay = maps.display.get(oldLogical);
    }
    const cloned = {
        ...node,
        id: newId,
        logicalId: newLogical,
        displayId: newDisplay,
        // DAL fields are per-position, not per-event.
        allocatedDAL: null,
        isDALCarrier: false
    };
    // Don't accidentally share child arrays with the source — replace with fresh clones.
    const kids = node.children || node._children;
    if (kids && kids.length) {
        cloned.children = kids.map(c => cloneSubtree(c, preserveLogicalIds, maps));
        delete cloned._children;
    } else {
        cloned.children = [];
    }
    return cloned;
}

function _ensureMinimizeDock() {
    let dock = document.getElementById('modal-minimize-dock');
    if (!dock) {
        dock = document.createElement('div');
        dock.id = 'modal-minimize-dock';
        document.body.appendChild(dock);
    }
    return dock;
}

// Make `modalRoot` (the outer modal container) draggable + minimizable. The
// header child receives the drag handle styling. `opts.title` is the chip
// label when minimized. `opts.headerSelector` overrides the default header
// detection (first child with display:flex justify-content:space-between).
// `opts.onClose` runs when chip ✕ is clicked. `opts.confirm = true` suppresses
// minimize for dialogs that should not be dismissable.
function _makeModalDraggable(modalRoot, opts) {
    if (!modalRoot || modalRoot._mdInitialized) return;
    modalRoot._mdInitialized = true;
    opts = opts || {};
    // Find the inner content panel (the box that actually displays). For our
    // modals it's the immediate child div of the scrim.
    const panel = opts.panel || modalRoot.querySelector(':scope > div') || modalRoot;
    // Find the header to attach the drag handle + minimize button to.
    const header = opts.header || panel.querySelector(opts.headerSelector || ':scope > div:first-child');
    if (!header) return;
    header.classList.add('modal-drag-handle');

    // Make sure the panel can be positioned absolutely within the scrim.
    if (!panel.style.position || panel.style.position === 'static') {
        panel.style.position = 'relative';
    }

    // Drag state.
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    function onDown(e) {
        // Ignore drags that originated on a button or interactive element.
        const t = e.target;
        if (t.closest('button, input, textarea, select, a, label')) return;
        dragging = true;
        sx = (e.touches ? e.touches[0].clientX : e.clientX);
        sy = (e.touches ? e.touches[0].clientY : e.clientY);
        const cur = getComputedStyle(panel);
        ox = parseFloat(cur.left) || 0;
        oy = parseFloat(cur.top) || 0;
        e.preventDefault();
    }
    function onMove(e) {
        if (!dragging) return;
        const cx = (e.touches ? e.touches[0].clientX : e.clientX);
        const cy = (e.touches ? e.touches[0].clientY : e.clientY);
        panel.style.left = (ox + cx - sx) + 'px';
        panel.style.top  = (oy + cy - sy) + 'px';
        panel.style.margin = '0';   // override centering
        modalRoot._mdPos = { left: panel.style.left, top: panel.style.top };
    }
    function onUp() { dragging = false; }
    header.addEventListener('mousedown', onDown);
    header.addEventListener('touchstart', onDown, { passive: false });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);

    // Inject minimize button into the header right side, unless suppressed.
    if (!opts.confirm) {
        const btn = document.createElement('button');
        btn.className = 'modal-control-btn modal-minimize-btn';
        btn.title = 'Minimize';
        btn.setAttribute('aria-label', 'Minimize');
        // Try to find the existing right-aligned button group; otherwise append.
        const rightGroup = header.querySelector('[style*="justify-content:flex-end"], [style*="display:flex"][style*="gap"]');
        if (rightGroup && rightGroup !== header) rightGroup.insertBefore(btn, rightGroup.firstChild);
        else header.appendChild(btn);
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            _minimizeModal(modalRoot, opts);
        });
    }
}

function _minimizeModal(modalRoot, opts) {
    if (!modalRoot) return;
    opts = opts || {};
    const dock = _ensureMinimizeDock();
    // Hide the modal (don't destroy — preserve form state + position).
    modalRoot._mdPrevDisplay = modalRoot.style.display || '';
    modalRoot.classList.add('modal-hidden-by-minimize');

    const chip = document.createElement('div');
    chip.className = 'min-chip';
    chip.innerHTML = '<span class="restore-icon"></span><span class="label"></span><span class="close-x" aria-label="Close">✕</span>';
    chip.querySelector('.label').textContent = opts.title || 'Modal';
    chip._modalRoot = modalRoot;
    modalRoot._mdChip = chip;

    chip.addEventListener('click', (e) => {
        if (e.target.classList.contains('close-x')) {
            e.stopPropagation();
            _restoreModal(modalRoot);
            if (typeof opts.onClose === 'function') {
                try { opts.onClose(); } catch (_) {}
            } else {
                modalRoot.remove();
            }
            chip.remove();
            return;
        }
        _restoreModal(modalRoot);
    });
    dock.appendChild(chip);
}

function _restoreModal(modalRoot) {
    if (!modalRoot) return;
    modalRoot.classList.remove('modal-hidden-by-minimize');
    if (modalRoot._mdPrevDisplay !== undefined) modalRoot.style.display = modalRoot._mdPrevDisplay;
    if (modalRoot._mdChip) { modalRoot._mdChip.remove(); modalRoot._mdChip = null; }
}

function _collectPasteReviewRows(rootNode) {
    const rows = [];
    const exposure = (typeof ftaConfig === 'object' && ftaConfig && ftaConfig.exposureTime) ? ftaConfig.exposureTime : 1;
    (function walk(n, depth) {
        if (!n || !n._pasteOrigin) return;
        const snap = n._pasteOrigin;
        const naturalProb = (typeof n.probability === 'number' && isFinite(n.probability)) ? n.probability : null;
        const snapProb    = (typeof snap.snapshotProb === 'number' && isFinite(snap.snapshotProb)) ? snap.snapshotProb : null;
        let stricter = null;
        if (snapProb !== null && naturalProb !== null) {
            stricter = (snapProb < naturalProb) ? 'source' : (snapProb > naturalProb ? 'destination' : 'equal');
        } else if (snapProb !== null) stricter = 'source-only';
        else if (naturalProb !== null) stricter = 'destination-only';
        rows.push({
            node: n,
            depth: depth,
            label: (n.displayId || ('#' + n.id)) + ' — ' + (n.name || (n.type === 'gate' ? n.gateType : 'event')),
            kind:  n.type === 'gate' ? (n.gateType || 'gate') : 'event',
            isBranchRoot: !!snap.isBranchRoot,
            naturalProb: naturalProb,
            snapProb:    snapProb,
            naturalDAL:  n.allocatedDAL || null,
            snapDAL:     snap.snapshotDAL || null,
            stricter:    stricter,
            sourcePage:  snap.sourcePageName || ('Tree ' + snap.sourceTreeId),
            exposure:    exposure
        });
        const kids = n.children || n._children;
        if (kids) kids.forEach(c => walk(c, depth + 1));
    })(rootNode, 0);
    return rows;
}

function _pasteReviewFmtP(p) {
    if (p === null || p === undefined) return '—';
    if (typeof p !== 'number' || !isFinite(p)) return '—';
    if (p === 0) return '0';
    return p.toExponential ? p.toExponential(2) : ('' + p);
}

function openPasteReviewModal(branchRoot) {
    const rows = _collectPasteReviewRows(branchRoot);
    if (!rows.length) return;  // nothing to review
    const modalId = 'paste-review-modal';
    let modal = document.getElementById(modalId);
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = modalId;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;';

    const totalStrictFromSrc = rows.filter(r => r.stricter === 'source').length;
    const totalStrictFromDst = rows.filter(r => r.stricter === 'destination').length;
    const headerSummary = rows[0] ? rows[0].sourcePage : '';

    const rowHtml = rows.map(r => {
        const indent = '&nbsp;'.repeat(r.depth * 3);
        const tag = (r.stricter === 'source') ? '<span style="color:#3D8BFF;font-weight:600;">source kept</span>'
                 : (r.stricter === 'destination') ? '<span style="color:#34c759;font-weight:600;">destination kept</span>'
                 : (r.stricter === 'equal') ? '<span style="color:var(--color-text-secondary);">equal</span>'
                 : (r.stricter === 'source-only') ? '<span style="color:#3D8BFF;">source only</span>'
                 : '<span style="color:var(--color-text-tertiary);">—</span>';
        const dalCmp = (r.snapDAL && r.naturalDAL && r.snapDAL !== r.naturalDAL)
            ? (r.snapDAL + ' / ' + r.naturalDAL)
            : (r.snapDAL || r.naturalDAL || '—');
        return [
            '<tr>',
            '<td style="padding:6px 8px;font-family:ui-monospace,Menlo,monospace;font-size:12px;">' + indent + esc(r.label) + (r.isBranchRoot ? ' <span style="font-size:10px;background:#3D8BFF;color:#fff;padding:1px 5px;border-radius:3px;margin-left:4px;">branch root</span>' : '') + '</td>',
            '<td style="padding:6px 8px;text-align:right;font-family:ui-monospace,Menlo,monospace;font-size:12px;">' + _pasteReviewFmtP(r.snapProb) + '</td>',
            '<td style="padding:6px 8px;text-align:right;font-family:ui-monospace,Menlo,monospace;font-size:12px;">' + _pasteReviewFmtP(r.naturalProb) + '</td>',
            '<td style="padding:6px 8px;text-align:center;">' + tag + '</td>',
            '<td style="padding:6px 8px;text-align:center;font-family:ui-monospace,Menlo,monospace;font-size:12px;">' + esc(dalCmp) + '</td>',
            '</tr>'
        ].join('');
    }).join('');

    modal.innerHTML = [
        '<div style="background:var(--color-surface-1,#fff);color:var(--color-text-primary,#111);max-width:900px;width:100%;max-height:85vh;overflow:hidden;border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,0.4);display:flex;flex-direction:column;">',
        '  <div style="padding:18px 22px;border-bottom:1px solid var(--color-border-thin,#e5e5e7);display:flex;justify-content:space-between;align-items:center;">',
        '    <div>',
        '      <h2 style="margin:0 0 4px 0;font-size:17px;font-weight:600;color:var(--color-text-primary,#111);">Cross-tree paste review</h2>',
        '      <p style="margin:0;font-size:12px;color:var(--color-text-secondary,#666);">Pasted from <strong>' + esc(headerSummary) + '</strong>. Conservative-merge kept the stricter allocation on each node; siblings rebalanced automatically.</p>',
        '    </div>',
        '    <button onclick="closePasteReviewModal()" aria-label="Close" style="background:transparent;border:none;font-size:22px;cursor:pointer;color:var(--color-text-secondary,#666);">×</button>',
        '  </div>',
        '  <div style="padding:14px 22px;border-bottom:1px solid var(--color-border-thin,#e5e5e7);display:flex;gap:18px;font-size:12px;color:var(--color-text-secondary,#666);">',
        '    <span><strong>' + rows.length + '</strong> pasted nodes</span>',
        '    <span style="color:#3D8BFF;"><strong>' + totalStrictFromSrc + '</strong> kept source</span>',
        '    <span style="color:#34c759;"><strong>' + totalStrictFromDst + '</strong> kept destination</span>',
        '  </div>',
        '  <div style="padding:14px 22px;border-bottom:1px solid var(--color-border-thin,#e5e5e7);">',
        '    <p style="font-size:12px;font-weight:600;margin:0 0 8px 0;color:var(--color-text-primary,#111);">How should the pasted events be modeled?</p>',
        '    <label style="display:block;padding:4px 0;cursor:pointer;font-size:13px;color:var(--color-text-primary,#111);">',
        '      <input type="radio" name="paste-mode" value="independent" checked onchange="onPasteModeChange()" style="margin-right:6px;">',
        '      <strong>Independent instance</strong> — new IDs, no correlation. Right for template reuse on a different physical system.',
        '    </label>',
        '    <label style="display:block;padding:4px 0;cursor:pointer;font-size:13px;color:var(--color-text-primary,#111);">',
        '      <input type="radio" name="paste-mode" value="same-event" onchange="onPasteModeChange()" style="margin-right:6px;">',
        '      <strong>Same physical event</strong> — share IDs with the source. The same battery / pump / SW function in both trees, fully correlated.',
        '    </label>',
        '    <label style="display:block;padding:4px 0;cursor:pointer;font-size:13px;color:var(--color-text-primary,#111);">',
        '      <input type="radio" name="paste-mode" value="ccf-group" onchange="onPasteModeChange()" style="margin-right:6px;">',
        '      <strong>CCF group</strong> — partial correlation via β-factor. Same vendor lot, same family, similar-but-not-identical events.',
        '    </label>',
        '    <div id="paste-ccf-config" style="display:none;margin:8px 0 0 22px;padding:10px;background:var(--color-surface-2,rgba(0,0,0,0.04));border-radius:8px;">',
        '      <label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--color-text-secondary,#666);display:block;margin-bottom:4px;">CCF group name</label>',
        '      <input type="text" id="paste-ccf-name" placeholder="e.g., BATT-PROPLOT-2024Q1" style="width:100%;padding:6px 8px;margin:0 0 10px 0;font-size:13px;border:1px solid var(--color-border-thin,#ddd);border-radius:6px;box-sizing:border-box;background:var(--color-surface-1,#fff);color:var(--color-text-primary,#111);">',
        '      <label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--color-text-secondary,#666);display:block;margin-bottom:4px;">β-factor (0–1)</label>',
        '      <input type="number" id="paste-ccf-beta" placeholder="0.1" step="0.01" min="0" max="1" value="0.1" style="width:100%;padding:6px 8px;margin:0;font-size:13px;border:1px solid var(--color-border-thin,#ddd);border-radius:6px;box-sizing:border-box;background:var(--color-surface-1,#fff);color:var(--color-text-primary,#111);">',
        '      <p style="font-size:10px;color:var(--color-text-tertiary,#888);margin:6px 0 0 0;line-height:1.4;">Applied to all basic events in the pasted subtree AND their source-tree counterparts. β = 0.1 (common starting point) means 10% of failures are common-cause.</p>',
        '    </div>',
        '  </div>',
        '  <div style="overflow:auto;flex:1;padding:0 22px;">',
        '    <table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0;color:var(--color-text-primary,#111);">',
        '      <thead style="position:sticky;top:0;background:var(--color-surface-1,#fff);">',
        '        <tr style="border-bottom:1px solid var(--color-border-thin,#e5e5e7);">',
        '          <th style="text-align:left;padding:8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--color-text-secondary,#666);">Node</th>',
        '          <th style="text-align:right;padding:8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--color-text-secondary,#666);">Source P</th>',
        '          <th style="text-align:right;padding:8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--color-text-secondary,#666);">Natural P</th>',
        '          <th style="text-align:center;padding:8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--color-text-secondary,#666);">Merge</th>',
        '          <th style="text-align:center;padding:8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--color-text-secondary,#666);">DAL (snap / nat)</th>',
        '        </tr>',
        '      </thead>',
        '      <tbody>' + rowHtml + '</tbody>',
        '    </table>',
        '  </div>',
        '  <div style="padding:14px 22px;border-top:1px solid var(--color-border-thin,#e5e5e7);display:flex;justify-content:space-between;align-items:center;gap:10px;">',
        '    <p style="margin:0;font-size:11px;color:var(--color-text-tertiary,#888);">Default behavior keeps the conservative merge. Revert strips the source snapshots from this pasted branch — destination reallocates natural targets and any sibling rebalance reverses.</p>',
        '    <div style="display:flex;gap:8px;">',
        '      <button onclick="revertPasteToNatural()" style="background:transparent;border:1px solid var(--color-border-thin,#e5e5e7);color:var(--color-text-primary,#111);padding:8px 14px;border-radius:8px;font-size:13px;cursor:pointer;">Revert to natural</button>',
        '      <button onclick="acceptPasteReview()" style="background:#3D8BFF;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;">Accept merge</button>',
        '    </div>',
        '  </div>',
        '</div>'
    ].join('');
    document.body.appendChild(modal);
    modal._pasteBranchRoot = branchRoot;
    modal.addEventListener('click', (e) => { if (e.target === modal) closePasteReviewModal(); });
    // Phase 56.50 — make this modal draggable + minimizable.
    if (typeof _makeModalDraggable === 'function') {
        _makeModalDraggable(modal, { title: 'Paste Review', onClose: closePasteReviewModal });
    }
}

function applyCCFGroupToNodes(memberRefs, groupName, beta, gamma, delta) {
    const result = { applied: 0, missing: [], nodes: [] };
    try {
        const name = String(groupName == null ? '' : groupName).trim();
        if (!name) return result;
        const clamp01 = function (v, dflt) {
            const n = parseFloat(v);
            if (!isFinite(n)) return dflt;
            return Math.min(1, Math.max(0, n));
        };
        const b = clamp01(beta, 0);                          // same clamp the config save path uses
        const haveGamma = (gamma != null && gamma !== '');
        const haveDelta = (delta != null && delta !== '');
        const g = haveGamma ? clamp01(gamma, 0) : 0;
        const d = haveDelta ? clamp01(delta, 0) : 0;
        if (typeof ftaPages === 'undefined' || !Array.isArray(ftaPages)) return result;
        (Array.isArray(memberRefs) ? memberRefs : []).forEach(function (ref) {
            if (!ref) { result.missing.push(ref); return; }
            const pid = ref.pageId, nid = ref.nodeId;
            const page = ftaPages.find(function (p) { return p && String(p.id) === String(pid); });
            const node = (page && page.root && typeof findNode === 'function') ? findNode(page.root, nid) : null;
            // Tolerate string/number id drift on nodeId by falling back to a == match.
            const node2 = node || (page && page.root ? (function () {
                let hit = null;
                (function walk(n) { if (!n || hit) return; if (n.id == nid) { hit = n; return; } const k = n.children || n._children; if (k) k.forEach(walk); })(page.root);
                return hit;
            })() : null);
            if (!node2 || node2.type !== 'basic') { result.missing.push(ref); return; }
            // Write ONLY the four existing inline CCF fields — nothing else.
            node2.ccfGroup = name;
            node2.beta = b;
            // Mirror createCcfGroupFromLibrary: default γ/δ to 0 when not provided so
            // the node carries a complete (β, γ, δ) the engine math already understands.
            node2.gamma = haveGamma ? g : (node2.gamma == null ? 0 : node2.gamma);
            node2.delta = haveDelta ? d : (node2.delta == null ? 0 : node2.delta);
            // Mirror any repeated occurrences of this event (same logicalId) exactly as
            // the node-config save path does, so a CCF tag is consistent across positions.
            try { if (typeof propagateRepeatedEventEdit === 'function') propagateRepeatedEventEdit(node2); } catch (_) {}
            result.nodes.push(node2);
            result.applied++;
        });
        if (result.applied) {
            // SAME recompute / render the existing CCF-config-change path runs.
            if (typeof calculateAllProbabilities === 'function') calculateAllProbabilities();
            if (typeof updateD3 === 'function') updateD3();
            if (typeof refreshBasicEventDerived === 'function') refreshBasicEventDerived();
            if (typeof scheduleAutosave === 'function') scheduleAutosave();
        }
    } catch (_) { /* defensive: never throw from a tagging call */ }
    return result;
}

// Two DALgebra allocation options (ARP4754A §5.4.1 / Table 5-2, ARP4761A Table P2) for the
// CURRENTLY-SELECTED cert basis — computed with the engine's OWN dalDecrement so this reference can
// never diverge from the allocator. Under substantiated independence (CMA): Option 1 keeps one
// carrier at the top DAL and drops the other members TWO levels; Option 2 drops ≥2 members ONE level.
// The reduction is RELATIVE to the FC's top DAL and floored only at DAL E — there is NO absolute
// Cat/Haz floor. (A−2=C and B−2=D under Part 25, which is where the misleading "Cat→C/Haz→D"
// shorthand came from; for Part 23 Class III, Catastrophic top B correctly reduces to D.)
function dalgebraOptionsTableHTML() {
    const dec = (dal, n) => (typeof dalDecrement === 'function') ? dalDecrement(dal, n) : dal;
    const SEVS = [
        { key: 'Catastrophic', label: 'Catastrophic' },
        { key: 'Hazardous',    label: 'Hazardous' },
        { key: 'Major',        label: 'Major' },
        { key: 'Minor',        label: 'Minor' },
        { key: 'Negligible',   label: 'No Safety Effect' }
    ];
    let scope = '';
    try { const g0 = (typeof getSafetyTarget === 'function') ? getSafetyTarget('Catastrophic') : null; if (g0) scope = g0.scope || ''; } catch (_) {}
    const rowFor = (sev) => {
        let top = null;
        try { const g = (typeof getSafetyTarget === 'function') ? getSafetyTarget(sev.key) : null; if (g) top = g.dal; } catch (_) {}
        if (!top) return '<tr><td>' + sev.label + '</td><td colspan="3"><span class="u-muted-italic">mission-based cert basis — no per-flight-hour DAL ladder</span></td></tr>';
        if (top === 'E') return '<tr><td>' + sev.label + '</td><td><strong>DAL E</strong></td><td colspan="2"><span class="u-muted-italic">No development-assurance objectives — no reduction applies.</span></td></tr>';
        const others = dec(top, 2);   // Option 1 non-carriers: TWO levels below the top DAL (floor E)
        const two = dec(top, 1);       // Option 2 pair: ONE level below the top DAL (floor E)
        return '<tr><td>' + sev.label + '</td><td><strong>DAL ' + top + '</strong></td>' +
            '<td>carrier <strong>' + top + '</strong>, others <strong>' + others + '</strong></td>' +
            '<td>&ge;2 members <strong>' + two + '</strong>, others <strong>' + others + '</strong></td></tr>';
    };
    return '<h4 style="margin-top: var(--s-5); margin-bottom: var(--s-2); color: var(--color-text-primary);">Two DAL allocation options' + (scope ? ' &mdash; ' + (typeof esc === 'function' ? esc(scope) : scope) : '') + '</h4>' +
        '<p class="cfg-hint" style="margin-bottom: var(--s-2);" title="ARP4754A §5.4.1 / Table 5-2 (ARP4761A Table P2). A reduction below the failure condition&#39;s top DAL requires functional independence between the AND-gate members, substantiated by Common Mode Analysis. Option 1: one carrier keeps the top DAL, the other members drop TWO levels. Option 2: at least two members drop ONE level. The reduction is relative to the top DAL and floored only at DAL E. Without substantiated independence every member holds the top DAL.">DALgebra reduction under substantiated independence (CMA): non-carriers drop two levels (Option 1) or the pair drops one level (Option 2), relative to the top DAL. Floor: DAL E. Hover for detail.</p>' +
        '<table class="reference-table"><thead><tr><th style="width:20%;">Failure condition</th><th style="width:15%;">Top DAL</th><th style="width:32%;">Option 1 &mdash; carrier + independence</th><th style="width:33%;">Option 2 &mdash; AND decrement</th></tr></thead><tbody>' +
        SEVS.map(rowFor).join('') +
        '</tbody></table>';
}
try { window.dalgebraOptionsTableHTML = dalgebraOptionsTableHTML; } catch (_) {}

// ---- SORA basis: the SAIL → OSO robustness reference ---------------------------
// On a SORA basis (Part 107 + SORA, or the EU Specific category) there is no
// per-flight-hour probability ladder and no DAL — the assurance driver is the
// SAIL (I–VI), which fixes the required robustness (None/Low/Medium/High) of
// each Operational Safety Objective. This renders that matrix from the verified
// Annex E engine (window.SORA). Reference view: the full OSO×SAIL table.
function _isSoraBasis() {
    const reg = (typeof projectConfig === 'object' && projectConfig && projectConfig.regulation) || 'Part 25';
    return reg === 'Part 107' || reg === 'specific-sora';
}
function soraSailReferenceHTML() {
    const SORA = (typeof window !== 'undefined') ? window.SORA : null;
    if (!SORA || typeof SORA.osoList !== 'function' || typeof SORA.osoRobustness !== 'function') {
        return '<p class="u-muted-italic">SORA reference engine not loaded — reload the app so sora_core.js is available.</p>';
    }
    let osos, perSail;
    try {
        osos = SORA.osoList().osos;
        perSail = {};
        for (let s = 1; s <= 6; s++) {
            const r = SORA.osoRobustness(s);
            const m = {};
            r.objectives.forEach(o => { m[o.id] = { level: o.robustness, page: o.page, cite: o.cite }; });
            perSail[s] = m;
        }
    } catch (e) {
        return '<p class="u-muted-italic">SORA reference unavailable: ' + esc(e.message) + '</p>';
    }
    const ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI' };
    const cellStyle = (lvl) =>
        lvl === 'High'   ? 'background:#fbe9e7;color:#b3261e;font-weight:700;' :
        lvl === 'Medium' ? 'background:#fff4e5;color:#8a5a00;font-weight:600;' :
        lvl === 'Low'    ? 'background:#e8f5e9;color:#1b5e20;' :
                           'color:var(--color-text-tertiary);';
    const cellText = (lvl) => lvl === 'None' ? '—' : lvl;

    let rows = '';
    osos.forEach(o => {
        let tds = '';
        for (let s = 1; s <= 6; s++) {
            const cell = perSail[s][o.id] || { level: 'None' };
            tds += '<td style="text-align:center;padding:5px 6px;' + cellStyle(cell.level) + '">' + cellText(cell.level) + '</td>';
        }
        const page = (perSail[6][o.id] && perSail[6][o.id].page) || '';
        rows += '<tr>' +
            '<td style="padding:5px 8px;white-space:nowrap;"><strong>' + esc(o.id) + '</strong></td>' +
            '<td style="padding:5px 8px;font-size:12px;color:var(--color-text-secondary);">' + esc(o.title) +
                (page ? ' <span style="color:var(--color-text-tertiary);">· Annex E p.' + esc(String(page)) + '</span>' : '') + '</td>' +
            tds + '</tr>';
    });

    const legend = '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px;margin:8px 2px;">' +
        '<span><span style="display:inline-block;width:11px;height:11px;background:#e8f5e9;border:1px solid #1b5e20;vertical-align:middle;margin-right:4px;"></span>Low</span>' +
        '<span><span style="display:inline-block;width:11px;height:11px;background:#fff4e5;border:1px solid #8a5a00;vertical-align:middle;margin-right:4px;"></span>Medium</span>' +
        '<span><span style="display:inline-block;width:11px;height:11px;background:#fbe9e7;border:1px solid #b3261e;vertical-align:middle;margin-right:4px;"></span>High</span>' +
        '<span style="color:var(--color-text-tertiary);">— = not required (Optional/NR per Main Body Table 14)</span></div>';

    return '<div style="border:1px solid var(--color-border-hair);border-radius:10px;padding:14px 16px;background:var(--color-surface-1);">' +
        '<div style="font-size:13px;font-weight:600;margin-bottom:4px;">SAIL &rarr; Operational Safety Objective (OSO) robustness</div>' +
        '<p style="font-size:12px;color:var(--color-text-secondary);margin:0 0 6px;">A SORA basis has no per-flight-hour probability target and no DAL. The <strong>SAIL</strong> (Specific Assurance &amp; Integrity Level, I&ndash;VI) is set from the final Ground Risk Class &times; residual Air Risk Class (Main Body Table 7); it drives the required <strong>robustness</strong> of each OSO &mdash; each meeting both an <em>integrity</em> (safety gain) and an <em>assurance</em> (method of proof) criterion. Read the criteria in JARUS SORA v2.5 Annex E at the cited page.</p>' +
        legend +
        '<div style="overflow-x:auto;"><table class="reference-table" style="min-width:640px;">' +
        '<thead><tr><th style="text-align:left;padding:5px 8px;">OSO</th><th style="text-align:left;padding:5px 8px;">Objective</th>' +
        [1, 2, 3, 4, 5, 6].map(s => '<th style="text-align:center;padding:5px 6px;">SAIL ' + ROMAN[s] + '</th>').join('') +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<p style="font-size:11px;color:var(--color-text-tertiary);margin:8px 2px 0;">Source: JARUS SORA v2.5 Annex E (JAR_doc_28, 13.05.2024). Assignment verified cell-by-cell; criteria text is copyrighted and not reproduced — cite and read the source. A required robustness is a claim until its integrity &amp; assurance evidence is validated.</p>' +
        '</div>';
}

function renderProbTable() {
    const c = document.getElementById('prob-table-container');
    if (!c) return;
    // SORA basis: replace the DAL/probability ladder with the SAIL→OSO reference,
    // and relabel the section (the static heading/hint speak "quantitative / DAL").
    if (_isSoraBasis()) {
        try {
            const hint = c.previousElementSibling;
            if (hint && hint.classList && hint.classList.contains('cfg-hint')) {
                hint.textContent = 'SORA Specific category · SAIL I–VI drives OSO robustness (None/Low/Medium/High) — no per-flight-hour target, no DAL.';
                const head = hint.previousElementSibling;
                if (head && head.tagName === 'H4') head.textContent = 'Applicable SAIL & OSO Robustness (SORA)';
            }
        } catch (_) {}
        c.innerHTML = soraSailReferenceHTML();
        return;
    }
    const severities = ['Catastrophic', 'Hazardous', 'Major', 'Minor', 'Negligible'];
    const rows = severities.map(sev => {
        const t = getSafetyTarget(sev);
        const probCell = t.prob === null
            ? '<span class="u-muted-italic">No quantitative requirement</span>'
            : `&lt; ${t.prob.toExponential(0)} /fh`;
        return `<tr><td class="cell-${sev}">${sev === 'Negligible' ? 'No Safety Effect' : sev}</td><td>${probCell}</td><td><strong>DAL ${t.dal}</strong></td></tr>`;
    }).join('');
    // Phase 29.2 + 53.51 — DAL guidance summary. Qualitative descriptions only; the formal
    // objective counts and table references live in the source standards (RTCA DO-178C / DO-254).
    const dalCreditRows = ['A', 'B', 'C', 'D', 'E'].map(d => {
        const sw = getDALCredit(d, 'sw');
        const hw = getDALCredit(d, 'hw');
        return `<tr>
            <td><strong>DAL ${d}</strong></td>
            <td>${esc(sw ? sw.coverage : '—')}</td>
            <td>${esc(hw ? hw.ind : '—')}</td>
        </tr>`;
    }).join('');
    c.innerHTML = `<table class="reference-table">
        <thead><tr><th style="width: 20%;">Severity</th><th style="width: 50%;">Top-Event Probability Target (${esc(projectScopeLabel())})</th><th style="width: 30%;">Required DAL</th></tr></thead>
        <tbody>${rows}</tbody>
    </table>
    <h4 style="margin-top: var(--s-5); margin-bottom: var(--s-2); color: var(--color-text-primary);">DO-178C / DO-254 Certification Credit by DAL</h4>
    <p style="font-size: 12px; color: var(--color-text-secondary); margin: 0 0 var(--s-2) 0;">Each Development Assurance Level binds the downstream process to a specific objective set. Software follows DO-178C (Annex A Tables A-1..A-10); complex hardware follows DO-254 (Appendix A/B). These counts are the certification-credit budget the engineering team needs to plan against.</p>
    <table class="reference-table">
        <thead><tr><th style="width: 15%;">DAL</th><th style="width: 45%;">DO-178C (software)</th><th style="width: 40%;">DO-254 (hardware)</th></tr></thead>
        <tbody>${dalCreditRows}</tbody>
    </table>
    ${dalgebraOptionsTableHTML()}`;
}

// Handler for the AC 1309 dropdowns. Stores selection, refreshes UI, and pushes the new
// target into the FTA toolbar if a hazard link is active.
function onProjectConfigChange() {
    const regSel = document.getElementById('proj-regulation');
    const classSel = document.getElementById('proj-part23-class');
    const scvtolSel = document.getElementById('proj-scvtol-category');
    const mdInput = document.getElementById('proj-mission-duration');
    if (regSel) projectConfig.regulation = regSel.value;
    if (classSel) projectConfig.part23Class = classSel.value;
    // Phase 53.55 — capture SC-VTOL category. Gate Custom behind isProLicensed().
    if (scvtolSel) projectConfig.scvtolCategory = scvtolSel.value;
    // 31 Aug 2026 — Part 27 class (PS-ASW-27-15 continuum split). Empty = legacy, banner shows.
    const p27Sel = document.getElementById('proj-part27-class');
    if (p27Sel && p27Sel.value) projectConfig.part27Class = p27Sel.value;
    if (regSel && regSel.value === 'Custom' && !isProLicensed()) {
        // Pro feature — revert to last valid selection and surface a message.
        regSel.value = 'Part 25';
        projectConfig.regulation = 'Part 25';
        if (typeof showToast === 'function') showToast('Custom Cert Basis is a Safety Lab Aero, Inc. Pro feature — contact sales@anemtech to enable.', 'warning', 4800);
    }
    // Phase 35 — parse mission duration; blank or non-positive → auto.
    if (mdInput) {
        const v = parseFloat(mdInput.value);
        projectConfig.missionDuration = (!isNaN(v) && v > 0) ? v : null;
    }
    renderProjectConfigUI();
    // If the FTA is open and linked to a hazard, refresh the required-target display.
    if (typeof refreshFTARequiredTarget === 'function') refreshFTARequiredTarget();
    if (typeof refreshTopAllocatorReadout === 'function') refreshTopAllocatorReadout();
    if (typeof calculateAllProbabilities === 'function') calculateAllProbabilities();
    if (typeof updateD3 === 'function') updateD3();
    // Phase 53.54 — MoC catalog filters by cert basis; re-render if it's currently visible.
    if (typeof renderMoCCatalogue === 'function') {
        try { renderMoCCatalogue(); } catch(_) {}
    }
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
}

function derivationBadgeHtml(row) {
    if (!row) return '';
    const out = [];
    const dt = row.derivationType;
    if (dt && _DERIV_PALETTE[dt]) {
        const p = _DERIV_PALETTE[dt];
        out.push('<span style="display: inline-block; padding: 1px 7px; margin-left: 4px; background: ' + p.bg + '; color: ' + p.fg + '; border-radius: var(--r-full); font-size: 9.5px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;" title="Derivation type per ARP 4754B §6.1.1">' + esc(dt) + '</span>');
    }
    if (row.parentReqId) {
        let parentLabel = 'parent';
        try {
            const found = (typeof findReqAnyScope === 'function') ? findReqAnyScope(row.parentReqId) : null;
            if (found && found.req) parentLabel = found.req.traceId || ('REQ-' + found.req.internalId);
        } catch(_) {}
        out.push('<span style="display: inline-block; padding: 1px 7px; margin-left: 4px; background: var(--color-surface-2); color: var(--color-text-secondary); border-radius: var(--r-full); font-size: 10.5px; font-family: var(--font-mono);" title="Parent requirement (derivation chain)">↑ ' + esc(parentLabel) + '</span>');
    }
    return out.join('');
}

// Phase 53.63 — populate the Parent Requirement dropdown for the AC or Sys req form.
// Parents come from EITHER scope (a sys req can be a child of an AC req). We exclude
// the requirement currently being edited to prevent a row from being its own parent.
function _populateReqParentPicker(scope) {
    const id = scope === 'ac' ? 'ac-req-parent' : 'sys-req-parent';
    const sel = document.getElementById(id);
    if (!sel) return;
    const editingId = (typeof editStates !== 'undefined') ? editStates[scope === 'ac' ? 'acReq' : 'sysReq'] : null;
    const opts = ['<option value="">-- No parent (top-level) --</option>'];
    // AC reqs group
    const acItems = (acReqData || []).filter(r => !r.deleted && String(r.internalId) !== String(editingId));
    if (acItems.length) {
        opts.push('<optgroup label="Aircraft Requirements">');
        acItems.forEach(r => {
            opts.push('<option value="' + esc(r.internalId) + '">' + esc(r.traceId || 'REQ') + ' — ' + esc((r.text || '').slice(0, 70)) + '</option>');
        });
        opts.push('</optgroup>');
    }
    // Sys reqs grouped by system
    (systemsData || []).forEach(s => {
        const sysItems = (s.req || []).filter(r => !r.deleted && String(r.internalId) !== String(editingId));
        if (!sysItems.length) return;
        opts.push('<optgroup label="' + esc(s.name || s.id) + ' (System)">');
        sysItems.forEach(r => {
            opts.push('<option value="' + esc(r.internalId) + '">' + esc(r.traceId || 'REQ') + ' — ' + esc((r.text || '').slice(0, 70)) + '</option>');
        });
        opts.push('</optgroup>');
    });
    sel.innerHTML = opts.join('');
}

// Phase 53.63 — walk parent chain to detect circular references. Returns true if
// candidateParentId would create a cycle when set as parent of requirementId.
function _wouldCreateCycle(requirementId, candidateParentId) {
    if (!candidateParentId) return false;
    if (candidateParentId === requirementId) return true;
    const seen = new Set();
    let cur = candidateParentId;
    while (cur && !seen.has(cur)) {
        seen.add(cur);
        const found = findReqAnyScope(cur);
        if (!found) break;
        if (found.req.parentReqId === requirementId) return true;
        cur = found.req.parentReqId;
    }
    return false;
}

// Find a requirement by internalId across AC + all systems. Returns { req, scope }.
function findReqAnyScope(internalId) {
    if (acReqData) {
        const r = acReqData.find(x => String(x.internalId) === String(internalId));
        if (r) return { req: r, scope: 'ac' };
    }
    for (const s of (systemsData || [])) {
        const r = (s.req || []).find(x => String(x.internalId) === String(internalId));
        if (r) return { req: r, scope: 'sys-' + s.id };
    }
    return null;
}

function _approvalControlHtml(kind, id, systemId) {
    if (typeof Review === 'undefined' || !kind || id == null) return '';
    if (!APPROVABLE_KINDS.has(kind)) return '';
    const target = { kind, id, systemId: systemId || null };
    const sysArg = systemId ? `, '${esc(systemId)}'` : ', null';
    const idArg = typeof id === 'string' ? `'${esc(id)}'` : id;
    const onclick = `event.stopPropagation(); toggleApproval('${kind}', ${idArg}${sysArg})`;
    const rec = Review.getApproval(target);
    const isOk = Review.isApproved(target);
    let cls, glyph, title;
    if (!rec) {
        cls = 'unapproved';
        glyph = '☐';
        title = 'Approve this line item';
    } else if (isOk) {
        cls = 'approved';
        glyph = '✓';
        const when = (typeof Review.relTime === 'function') ? Review.relTime(rec.approvedAt) : '';
        title = 'Approved by ' + (rec.approvedBy || 'reviewer') + (when ? ' · ' + when : '') + '\nClick to revoke';
    } else {
        cls = 'voided';
        glyph = '⚠✓';
        title = 'Sign-off voided — open review comment on this line item.\nResolve the comment, then re-approve.';
    }
    const signoffBtn = '<button class="action-btn" onclick="event.stopPropagation(); openSignoffPanel(\'' + kind + '\', ' + idArg + sysArg + ')" title="Sign-off chain (tamper-evident)" aria-label="Sign-off chain">🖊</button>';
    // #31 — sync, render-safe stale marker: flag artifacts edited since their last sign-off.
    let staleMark = '';
    try { if (typeof isStaleSinceSignoff === 'function' && isStaleSinceSignoff(kind, id, systemId)) staleMark = '<span class="signoff-stale" title="Changed since last sign-off — re-sign to re-attest" aria-label="Changed since last sign-off" style="color:#b45309;font-weight:700;margin-left:1px;">⚠</span>'; } catch (_) {}
    return '<button class="action-btn approval-btn approval-' + cls + '" '
         + 'onclick="' + onclick + '" '
         + 'title="' + esc(title) + '" aria-label="' + esc(title) + '">'
         + glyph + '</button>' + signoffBtn + staleMark;
}

function _signoffReviewerName() { try { return (typeof Review !== 'undefined' && Review.getReviewerName && Review.getReviewerName()) || ''; } catch (_) { return ''; } }
function _signoffFind(kind, id, systemId) {
    return (reviewApprovalsData || []).find(function (r) {
        return r && r.kind === kind && String(r.id) === String(id) && (!systemId || !r.systemId || r.systemId === systemId);
    }) || null;
}
// --- #31: "changed since sign-off" (stale-signature) detection ---------------
// Fast, sync, deterministic signature (cyrb53) of an artifact's content, captured at
// sign-off time. Comparing the current signature to the one on the last sign-off tells
// us — synchronously, safe inside table render — whether the artifact was edited since
// it was signed. The SHA-256 contentHash stored alongside is the audit-grade record of
// exactly what content was attested. Neither field touches the tamper-chain hash, so
// verifySignoffChain is unaffected.
function _cyrb53(str, seed) {
    let h1 = 0xdeadbeef ^ (seed || 0), h2 = 0x41c6ce57 ^ (seed || 0);
    str = String(str);
    for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
// Deterministic stringify: recursively sorted keys (order-independent) and underscore-
// prefixed keys dropped (transient UI state shouldn't count as a content change).
// [OPT-1] dead duplicate _stableStringify removed (later definition always won under classic-script
// hoisting; note: its "_"-key filter therefore NEVER applied — see dev note).
// Locate the live content row for an approvable artifact. AC-level kinds live in global
// arrays; system-scoped kinds (sysFha/sysReq) live inside the owning systemsData entry.
function _artifactRow(kind, id, systemId) {
    const byId = function (arr) { return (Array.isArray(arr) ? arr : []).find(function (r) { return r && String(r.id) === String(id); }) || null; };
    try {
        switch (kind) {
            case 'acFha': return byId(typeof acFhaData !== 'undefined' ? acFhaData : []);
            case 'acReq': return byId(typeof acReqData !== 'undefined' ? acReqData : []);
            case 'pra':   return byId(typeof praData !== 'undefined' ? praData : []);
            case 'zsa':   return byId(typeof zsaData !== 'undefined' ? zsaData : []);
            case 'cma':   return byId(typeof cmaData !== 'undefined' ? cmaData : []);
            case 'fmea':  return byId(typeof fmeaData !== 'undefined' ? fmeaData : []);
            case 'sysFha':
            case 'sysReq': {
                const sys = (typeof systemsData !== 'undefined' ? systemsData : []).find(function (s) { return s && s.id === systemId; });
                if (!sys) return null;
                return byId(kind === 'sysFha' ? sys.fha : sys.req);
            }
        }
        // HF lanes (2 Sep 2026). They became approvable and signable with the rest, and a
        // signed row that is then edited must raise the same ⚠ stale marker as an FHA row.
        // Their rows live under projectConfig.hf.<store>.rows and are keyed by the lane's
        // own id field, not by .id — so they need their own resolution, not byId().
        if (/^hf[A-Z]/.test(String(kind))) {
            const M = { hfAlloc: ['alloc', 'key'], hfTid: ['tid', 'taskId'], hfTask: ['tasks', 'taskId'],
                        hfHea: ['hea', 'heaId'], hfAlerts: ['alerts', 'alertId'], hfErgo: ['ergo', 'ergoId'],
                        hfCd: ['cd', 'cdId'], hfSa: ['sa', 'saId'], hfMfc: ['mfc', 'key'] }[kind];
            if (!M) return null;
            const store = (typeof projectConfig !== 'undefined' && projectConfig && projectConfig.hf) ? projectConfig.hf[M[0]] : null;
            const rows = (store && Array.isArray(store.rows)) ? store.rows : [];
            return rows.find(function (r) { return r && String(r[M[1]]) === String(id); }) || null;
        }
    } catch (_) {}
    return null;
}
function _artifactContentString(kind, id, systemId) {
    const row = _artifactRow(kind, id, systemId || null);
    return row ? _stableStringify(row) : null;
}
// Sync, render-safe: has the artifact changed since its last sign-off?
function isStaleSinceSignoff(kind, id, systemId) {
    try {
        const chain = signoffChain(kind, id, systemId || null);
        if (!chain.length) return false;                  // never signed → not stale
        const last = chain[chain.length - 1];
        if (!last || !last.contentSig) return false;      // legacy sign-off w/o captured sig → no false alarm
        const cur = _artifactContentString(kind, id, systemId || null);
        if (cur == null) return false;                    // row gone → don't claim stale
        return _cyrb53(cur) !== last.contentSig;
    } catch (_) { return false; }
}
async function recordSignoff(kind, id, systemId, stage, signerName) {
    if (!kind || id == null || !stage) return null;
    systemId = systemId || null;
    let rec = _signoffFind(kind, id, systemId);
    if (!rec) { rec = { kind: kind, id: id, systemId: systemId, approvedBy: '', approvedAt: 0, note: '', signoffOnly: true, signoffs: [] }; reviewApprovalsData.push(rec); }
    if (!Array.isArray(rec.signoffs)) rec.signoffs = [];
    const prevHash = rec.signoffs.length ? rec.signoffs[rec.signoffs.length - 1].hash : '';
    const at = Date.now();
    const signer = String(signerName || _signoffReviewerName() || 'Signer').trim() || 'Signer';
    const hash = await _sha256Hex([prevHash, stage, signer, at].join('|'));
    // Capture what was signed: a fast sig (sync stale checks) + SHA-256 (audit evidence).
    let contentSig = '', contentHash = '';
    try { const cs = _artifactContentString(kind, id, systemId); if (cs != null) { contentSig = _cyrb53(cs); contentHash = await _sha256Hex(cs); } } catch (_) {}
    rec.signoffs.push({ stage: String(stage), signer: signer, at: at, prevHash: prevHash, hash: hash, contentSig: contentSig, contentHash: contentHash });
    try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
    return rec.signoffs[rec.signoffs.length - 1];
}
function signoffChain(kind, id, systemId) { const rec = _signoffFind(kind, id, systemId || null); return (rec && rec.signoffs) || []; }
async function verifySignoffChain(kind, id, systemId) {
    const chain = signoffChain(kind, id, systemId);
    let prev = '';
    for (let i = 0; i < chain.length; i++) {
        const s = chain[i];
        const h = await _sha256Hex([prev, s.stage, s.signer, s.at].join('|'));
        if (h !== s.hash) return false;
        prev = s.hash;
    }
    return true;
}

function getEffectiveTemplate(kind) {
    const built = TEMPLATE_SCHEMAS[kind];
    if (!built) return { name: kind, columns: [] };
    const org = (orgTemplates && orgTemplates[kind]) || { columnOverrides: {}, customColumns: [], columnOrder: [] };
    const prj = (projectTemplates && projectTemplates[kind]) || { columnOverrides: {}, customColumns: [], columnOrder: [] };

    // 1. Start with built-in columns. Apply org then project label/hide overrides.
    let columns = built.columns.map(c => {
        const orgO = org.columnOverrides[c.id] || {};
        const prjO = prj.columnOverrides[c.id] || {};
        return Object.assign({}, c, {
            label:  prjO.label  != null ? prjO.label  : (orgO.label  != null ? orgO.label  : c.label),
            hide:   prjO.hide   != null ? prjO.hide   : (orgO.hide   != null ? orgO.hide   : false),
            origLabel: c.label,
            scope: 'builtin'
        });
    });

    // 2. Append org-defined custom columns then project-defined ones. Project
    //    customs can override org customs by id; project wins.
    const customsById = {};
    org.customColumns.forEach(cc => { customsById[cc.id] = Object.assign({}, cc, { scope: 'org', builtIn: false }); });
    prj.customColumns.forEach(cc => { customsById[cc.id] = Object.assign({}, cc, { scope: 'project', builtIn: false }); });
    Object.keys(customsById).forEach(id => {
        const cc = customsById[id];
        // If the custom column wants to insert after a specific built-in, slot it
        // there; otherwise append.
        if (cc.after) {
            const idx = columns.findIndex(x => x.id === cc.after);
            if (idx >= 0) columns.splice(idx + 1, 0, cc);
            else columns.push(cc);
        } else {
            columns.push(cc);
        }
    });

    // 3. Apply explicit column order (project beats org) by stable sort.
    const order = (prj.columnOrder && prj.columnOrder.length) ? prj.columnOrder
                : (org.columnOrder && org.columnOrder.length) ? org.columnOrder
                : null;
    if (order && order.length) {
        const rank = {};
        order.forEach((id, i) => { rank[id] = i; });
        columns.sort((a, b) => {
            const ra = (rank[a.id] != null) ? rank[a.id] : 999 + columns.indexOf(a);
            const rb = (rank[b.id] != null) ? rank[b.id] : 999 + columns.indexOf(b);
            return ra - rb;
        });
    }

    return { name: built.name, description: built.description, columns };
}

function _activeOverrides() {
    return _activeTemplateScope === 'org'
        ? (orgTemplates[_activeTemplateKind] = orgTemplates[_activeTemplateKind] || { columnOverrides: {}, customColumns: [], columnOrder: [] })
        : (projectTemplates[_activeTemplateKind] = projectTemplates[_activeTemplateKind] || { columnOverrides: {}, customColumns: [], columnOrder: [] });
}
function _persistActiveScope() {
    if (_activeTemplateScope === 'org') saveOrgTemplates(orgTemplates);
    // Project scope persists when the project itself saves; nothing to do here.
}

function renderTemplateEditor() {
    const kindSel = document.getElementById('template-kind-select');
    const scopeRadios = document.querySelectorAll('input[name="template-scope"]');
    if (kindSel && kindSel.value !== _activeTemplateKind) kindSel.value = _activeTemplateKind;
    scopeRadios.forEach(r => { r.checked = (r.value === _activeTemplateScope); });

    const body = document.getElementById('template-editor-columns');
    if (!body) return;
    const eff = getEffectiveTemplate(_activeTemplateKind);
    const orgKind = orgTemplates[_activeTemplateKind] || { columnOverrides: {}, customColumns: [], columnOrder: [] };
    const prjKind = projectTemplates[_activeTemplateKind] || { columnOverrides: {}, customColumns: [], columnOrder: [] };
    let html = '<div class="template-cols-header"><div>Column</div><div>Label</div><div>Type</div><div>Scope</div><div>Visible</div><div>Actions</div></div>';
    eff.columns.forEach(c => {
        const scopeBadge = c.scope === 'builtin' ? '<span class="tmpl-scope tmpl-scope-builtin">built-in</span>'
                         : c.scope === 'org'     ? '<span class="tmpl-scope tmpl-scope-org">org</span>'
                                                 : '<span class="tmpl-scope tmpl-scope-prj">project</span>';
        const visToggle = '<label class="tmpl-vis"><input type="checkbox" ' + (c.hide ? '' : 'checked') + ' onchange="toggleColumnHidden(\'' + esc(c.id) + '\', !this.checked)"></label>';
        const labelInput = '<input class="tmpl-label-input" type="text" value="' + esc(c.label) + '" oninput="renameColumn(\'' + esc(c.id) + '\', this.value)">';
        const typeCell = c.builtIn
            ? '<span class="tmpl-type-builtin">' + esc(c.type || 'text') + '</span>'
            : '<select class="tmpl-type-select" onchange="changeCustomColumnType(\'' + esc(c.id) + '\', this.value)">' +
                TEMPLATE_COLUMN_TYPES.map(t => '<option value="' + t + '"' + (t === c.type ? ' selected' : '') + '>' + t + '</option>').join('') +
              '</select>';
        const actions = c.builtIn
            ? '<button class="action-btn" onclick="resetColumnOverride(\'' + esc(c.id) + '\')" title="Reset to built-in default">↺</button>'
            : '<button class="action-btn btn-red" onclick="deleteCustomColumn(\'' + esc(c.id) + '\')" title="Delete column">×</button>';
        html += '<div class="template-col-row">' +
            '<div class="tmpl-col-id">' + esc(c.id) + (c.builtIn && c.origLabel !== c.label ? ' <span class="tmpl-renamed">renamed from ' + esc(c.origLabel) + '</span>' : '') + '</div>' +
            '<div>' + labelInput + '</div>' +
            '<div>' + typeCell + '</div>' +
            '<div>' + scopeBadge + '</div>' +
            '<div>' + visToggle + '</div>' +
            '<div>' + actions + '</div>' +
        '</div>';
    });
    body.innerHTML = html;
}

function rowActionsHTML(editFnName, deleteFnName, internalId, extra = '') {
    const id = esc(internalId);
    // Phase 14.3 — back-reference trigger. Map editFnName → Traceability kind so every
    // table inherits the "view references" icon without touching individual render functions.
    const KIND_BY_EDIT_FN = {
        'editACFunc': 'acFunc', 'editACFCIM': 'acFcim', 'editACFHA': 'acFha',
        'editACReq': 'acReq', 'editACAsm': 'acAsm', 'editACAssumption': 'acAsm',
        'editSysFunc': 'sysFunc', 'editSysFCIM': 'sysFcim', 'editSysFHA': 'sysFha',
        'editSysReq': 'sysReq', 'editSysAssumption': 'sysAsm', 'editSysAsm': 'sysAsm',
        'editPRA': 'pra', 'editZSA': 'zsa', 'editCMA': 'cma', 'editFMEA': 'fmea',
        'editItem': 'item'   // Phase 53.61
    };
    const kind = KIND_BY_EDIT_FN[editFnName];
    let backref = '';
    if (kind) {
        // sysIdSnippet adds the active system id at render time for sys-* artifacts.
        const sysIdSnippet = kind.indexOf('sys') === 0 ? ', systemId: (typeof activeSystemId !== "undefined" ? activeSystemId : null)' : '';
        backref = `<button type="button" role="menuitem" class="backref-trigger" title="Traces to / used by — show every artifact linked to this one" aria-label="Traces to / used by" onclick="openBackrefPanel({kind:'${kind}', id: ${typeof internalId === 'string' ? `'${id}'` : internalId}${sysIdSnippet}})">⇋ Traces to / Used by</button>`;
    }

    // Phase 50 — comment trigger for the commentable artifact kinds.
    // Phase 53.25 — extended to include Functions and FCIM (AC + Sys) at user request.
    const COMMENTABLE_KINDS = new Set([
        'acFha','sysFha','acReq','sysReq','acAsm','sysAsm',
        'pra','zsa','cma','fmea',
        'acFunc','sysFunc','acFcim','sysFcim'
    ]);
    // Phase 53.73 — Comments + approval moved to a dedicated "Review" column (see reviewCellHtml
    // + each approvable table's renderCells / <thead>). Action group keeps just edit/delete/backref.

    // Phase 57 — consolidate row actions into one Apple-style kebab dropdown. Edit / References /
    // any extra (Thread, Chart…) / Delete all live in the menu; the row shows a single ⋮ trigger.
    return `<div class="row-actions">`
        + `<button type="button" class="row-kebab" aria-label="Row actions" aria-haspopup="true" onclick="toggleRowMenu(event)">⋮</button>`
        + `<div class="row-action-menu" role="menu">`
        +   `<button type="button" role="menuitem" onclick="${editFnName}('${id}')">✎ Edit</button>`
        +   backref
        +   extra
        +   `<button type="button" role="menuitem" class="ram-danger" onclick="${deleteFnName}('${id}')">✕ Delete</button>`
        + `</div>`
        + `</div>`;
}

// Phase 57 — row-action kebab menu open/close. Positioned with fixed coordinates so the menu
// escapes any table overflow clipping; closes on outside click, scroll, resize, or Escape.
function closeAllRowMenus() {
    document.querySelectorAll('.row-action-menu.open').forEach(m => {
        m.classList.remove('open');
        m.style.top = ''; m.style.left = '';
    });
}
function toggleRowMenu(event) {
    event.stopPropagation();
    const kebab = event.currentTarget;
    const menu = kebab.parentElement && kebab.parentElement.querySelector('.row-action-menu');
    if (!menu) return;
    const wasOpen = menu.classList.contains('open');
    closeAllRowMenus();
    if (wasOpen) return;
    menu.classList.add('open');                 // display it (CSS) so we can measure
    // 1 Sep 2026 — CSS zoom correction (Waqas: "the pop up for the comment is way over to the
    // left from the button"). body carries zoom:0.9. getBoundingClientRect() reports VISUAL
    // (zoomed) pixels, but an inline left/top on this position:fixed menu is a LAYOUT value the
    // browser multiplies by the ancestor zoom again — so the menu landed at 0.9x its target:
    // a few px off near the top-left, ~150px off at the right edge of a wide table (the HF
    // Review column). Work in visual px throughout, then divide the final assignment by the
    // effective zoom so it renders where it was aimed. z === 1 => byte-identical behaviour.
    const z = _cssZoomOf(menu);
    const r = kebab.getBoundingClientRect();
    const mW = (menu.offsetWidth || 180) * z;     // offsetWidth is layout px -> visual
    const mH = (menu.offsetHeight || 150) * z;
    let left = r.right - mW;                      // right-align to the kebab
    if (left + mW > window.innerWidth - 8) left = window.innerWidth - 8 - mW;
    if (left < 8) left = 8;
    // Phase 75 — keep the menu clear of the fixed left sidebar. A fixed menu trapped in a
    // lower stacking context gets painted over by the sidebar, so clamp left past its edge.
    try {
        const _asb = document.querySelector('.app-sidebar');
        if (_asb && document.body.classList.contains('nav-sidebar')) {
            const _sbR = _asb.getBoundingClientRect().right;
            if (left < _sbR + 8) left = _sbR + 8;
            if (left + mW > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - mW);
        }
    } catch (_) {}
    let top = r.bottom + 4;                       // below by default…
    if (top + mH > window.innerHeight - 8) top = r.top - mH - 4;   // …flip up if no room
    if (top < 8) top = 8;
    menu.style.left = (left / z) + 'px';          // visual -> layout: the browser re-applies the zoom
    menu.style.top = (top / z) + 'px';
}

// Effective CSS zoom acting on an element: the product of every ancestor's computed `zoom`.
// 1 when none is set. Used to convert visual-pixel targets (getBoundingClientRect) into the
// layout pixels a position:fixed inline left/top actually wants under a zoomed ancestor.
function _cssZoomOf(el) {
    let z = 1;
    try {
        let p = el;
        while (p && p.nodeType === 1) {
            const v = parseFloat(getComputedStyle(p).zoom);
            if (!isNaN(v) && v > 0 && v !== 1) z *= v;
            p = p.parentElement;
        }
    } catch (_) {}
    return z || 1;
}

async function saveProject() {
    // Phase 42 — beta build watermark + timestamp now travel inside _slabBuildProjectExport().
    const projectData = _slabBuildProjectExport();
    const blob = new Blob([JSON.stringify(projectData, null, 2)], {type: 'application/json'});
    const fileName = 'Safety_Lab_' + _safeFileName(projectName) + '.sl';   // .sl — the Safety Lab project file (JSON inside; legacy .json still opens)
    if (typeof SaveFs !== 'undefined') {
        await SaveFs.saveBlob(blob, fileName);
    } else {
        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); URL.revokeObjectURL(url);
    }
    // Phase 53 — project files are .json (text under the hood). Users sometimes
    // double-click them and get a text editor — make it explicit they reopen via
    // the Load Project menu inside Safety Lab Aero.
    showToast('Project saved. To reopen: Project ▾ → Load Project (the .json file is meant to be opened from inside Safety Lab Aero).', 'info', 6000);
}

function loadProject(event) {
    const file = event.target.files[0]; if (!file) return; const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            acFunctionsData = data.acFunctionsData || []; acFcimData = data.acFcimData || []; acExtractedFCs = data.acExtractedFCs || []; acFhaData = data.acFhaData || []; acReqData = data.acReqData || []; acAssumptionsData = data.acAssumptionsData || []; acAsmCounter = data.acAsmCounter || 1; 
            
            // Legacy migration: Wrap flat sys arrays into a folder if they exist
            systemsData = data.systemsData || [];
            if (systemsData.length === 0 && (data.sysFunctionsData && data.sysFunctionsData.length > 0)) {
                systemsData.push({ id: 'sys-legacy', name: 'Legacy Imported System', asmCounter: data.sysAsmCounter || 1, functions: data.sysFunctionsData || [], fcim: data.sysFcimData || [], extractedFCs: data.sysExtractedFCs || [], fha: data.sysFhaData || [], req: data.sysReqData || [], asm: data.sysAssumptionsData || [] });
            }
            activeSystemId = null;

            praData = data.praData || []; zsaData = data.zsaData || []; cmaData = data.cmaData || []; routingData = Array.isArray(data.routingData) ? data.routingData : []; resourcesData = Array.isArray(data.resourcesData) ? data.resourcesData : []; projectSourceDocs = Array.isArray(data.projectSourceDocs) ? data.projectSourceDocs : []; aiAssumptions = Array.isArray(data.aiAssumptions) ? data.aiAssumptions : []; fmeaData = data.fmeaData || []; fmeaCounter = data.fmeaCounter || 1; itemsData = data.itemsData || []; flightPhasesData = data.flightPhasesData || flightPhasesData; stpaData = (data.stpaData && data.stpaData.cs) ? data.stpaData : { cs: { controllers: [], processes: [], actions: [], feedbacks: [], others: [], precedence: [] }, dispositions: {}, causeDismissals: {}, scopeFcIds: [], meta: { mission: '', scope: '', boundary: '', abstractionLevel: '' }, losses: [], hazards: [], constraints: [], responsibilities: [], csState: 'initial', sip: {} };
            if(data.ftaRoot) { ftaPages = [{ id: 'page-legacy', name: 'Imported Tree', root: data.ftaRoot }]; activeFTAPageId = 'page-legacy'; } else { ftaPages = data.ftaPages || []; activeFTAPageId = data.activeFTAPageId || (ftaPages.length > 0 ? ftaPages[0].id : null); }
            internalIdCounter = data.internalIdCounter || 1; typeCounters = data.typeCounters || { gate: 1, basic: 1, undeveloped: 1, conditioning: 1, house: 1 }; ftaConfig = data.ftaConfig || { mode: 'bottom-up', apportion: 'equal', targetP: 0.00001, linkedFhaId: '', exposureTime: 1, exposureSource: 'auto' };
            projectConfig = data.projectConfig || { regulation: 'Part 25', part23Class: 'IV', override: false, customLibrary: {}, piQ: 1, piE: 1, markovModels: [], libraryStandard: 'MIL-HDBK-217F', libraryEnv: 'GB', libraryQuality: 'B2', useStressPrediction: false, operatingTempC: 25, activationEnergyEv: 0.4 };
    // Backfill defaults for older saves.
    if (!projectConfig.customLibrary) projectConfig.customLibrary = {};
    if (projectConfig.piQ == null) projectConfig.piQ = 1;
    if (typeof _ensureLibPredictionDefaults === 'function') _ensureLibPredictionDefaults();
    if (projectConfig.piE == null) projectConfig.piE = 1;
    if (!Array.isArray(projectConfig.markovModels)) projectConfig.markovModels = [];
    if (!Array.isArray(projectConfig.interfaces)) projectConfig.interfaces = [];   // #IFACE migration-safe default
    // Phase 35 — older saves predate missionDuration. Leave as null (= auto from flight phases).
    if (projectConfig.missionDuration === undefined) projectConfig.missionDuration = null;

            // IDs & Numbering — restore scheme + counter store; seed counters above
            // any pre-existing IDs so auto-IDs never collide with what's already there.
            _slInitNumberingFromProject(data);

            // Migrate legacy FHA assumption strings → assumptionIds arrays.
            migrateAllFHAAssumptions();
            // Phase 24: collapse system sub-functions into functions.
            migrateSysSubFunctionsToFunctions();
            migrateLegacyMultiTraces();
            // Phase 53.42 — rebuild extractedFCs from FCIM for every system. Projects saved
            // before the sysFcim import fix may have FCIM rows with no matching extractedFCs.
            if (typeof rebuildExtractedFCsForAllSystems === 'function') rebuildExtractedFCsForAllSystems();
            // Phase 29.4 — restore baselines if present in save file.
            projectBaselines = Array.isArray(data.projectBaselines) ? data.projectBaselines : [];
            // Phase 55.0.8 — restore AutoReq template overrides (per-project)
            autoReqTemplateOverrides = (data.autoReqTemplateOverrides && typeof data.autoReqTemplateOverrides === 'object') ? data.autoReqTemplateOverrides : {};
            try { if (typeof window !== 'undefined') window.autoReqTemplateOverrides = autoReqTemplateOverrides; } catch(_) {}
            // Phase 56.9 — restore per-project report-section edits
            projectReportEdits = (data.projectReportEdits && typeof data.projectReportEdits === 'object') ? data.projectReportEdits : {};
            try { if (typeof window !== 'undefined') window.projectReportEdits = projectReportEdits; } catch(_) {}
            // Phase 50 — restore review comments.
            reviewCommentsData = Array.isArray(data.reviewCommentsData) ? data.reviewCommentsData : [];
            reviewCounter = (typeof data.reviewCounter === 'number' && data.reviewCounter > 0) ? data.reviewCounter : (reviewCommentsData.length + 1);
            reviewApprovalsData = Array.isArray(data.reviewApprovalsData) ? data.reviewApprovalsData : [];
            // Phase 54 — restore per-project template overrides (back-compat: pre-54
            // projects don't have this key, so default to empty overrides).
            if (typeof emptyTemplateOverrides === 'function') {
                const restored = emptyTemplateOverrides();
                if (data.projectTemplates && typeof data.projectTemplates === 'object') {
                    Object.keys(restored).forEach(k => {
                        if (data.projectTemplates[k]) {
                            restored[k].columnOverrides = data.projectTemplates[k].columnOverrides || {};
                            restored[k].customColumns   = Array.isArray(data.projectTemplates[k].customColumns) ? data.projectTemplates[k].customColumns : [];
                            restored[k].columnOrder     = Array.isArray(data.projectTemplates[k].columnOrder)   ? data.projectTemplates[k].columnOrder   : [];
                        }
                    });
                }
                projectTemplates = restored;
                window.projectTemplates = projectTemplates;
            }
            // Phase 53 — restore project name.
            projectName = (typeof data.projectName === 'string' && data.projectName.trim()) ? data.projectName : 'Untitled Project';
            if (typeof _refreshProjectNameUI === 'function') _refreshProjectNameUI();
            // Backfill logicalId on every FTA node (older projects predate the field).
            backfillLogicalIds();

            selectedNodeData = null; document.getElementById('node-config-panel').style.display = 'none'; alert("Project successfully loaded!");
            Object.keys(formConfigs).forEach(mod => cancelEdit(mod));
            // Re-evaluate stale + compromised flags on all auto-generated requirements before first render.
            try { AutoReq.recomputeFlags('ac'); systemsData.forEach(s => AutoReq.recomputeFlags('sys-' + s.id)); } catch(e){ console.warn('AutoReq.recomputeFlags failed on load:', e); }
            renderACFunctions(); renderACFCIM(); renderACFHA(); renderACReq(); renderACAssumptions();
            renderPRA(); renderZSA(); renderFMEA(); renderFlightPhases();
            switchTab('dashboard'); renderFTASidebar(); calculateAllProbabilities(); document.getElementById('load-file').value = '';
        } catch (err) { alert("Error loading project file."); console.error(err); }
    }; reader.readAsText(file);
}

function _ckptDetail(key) {
    const nSys = (systemsData || []).length;
    const acFhas = acFhaData || [];
    const crit = acFhas.filter(f => f.severity === 'Catastrophic' || f.severity === 'Hazardous');
    const allSysFha = (systemsData || []).flatMap(s => s.fha || []);
    const allSysReq = (systemsData || []).flatMap(s => s.req || []);
    const allAsm = [...(acAssumptionsData || []), ...(systemsData || []).flatMap(s => s.asm || [])];
    const openAsm = allAsm.filter(a => a.state === 'Proposed').length;
    const acTopDown = (ftaPages || []).filter(p => !p.systemId && !p.verifies && (p.mode || 'top-down') === 'top-down' && p.root && ((p.root.children || []).length > 0 || (p.root._children || []).length > 0));
    const sysTopDown = (ftaPages || []).filter(p => p.systemId && !p.verifies && (p.mode || 'top-down') === 'top-down');
    const mirrors = (ftaPages || []).filter(p => p.verifies);
    const critAllocated = crit.filter(f => acTopDown.some(t =>
        (Array.isArray(t.linkedFhaIds) && t.linkedFhaIds.indexOf(f.internalId) !== -1) || t.linkedFhaId === f.internalId)).length;

    const live = (t, v, tab) => ({ t, v: String(v), planned: false, tab: tab || null });
    const plan = (t, tag, tab) => ({ t, v: tag || 'planned', planned: true, tab: tab || null });

    const D = {
        AFHA: {
            clause: 'Substantiation criteria — ARP4761A A.9',
            inputs: [live('Aircraft functions', (acFunctionsData || []).length), live('Flight phases', (flightPhasesData || []).length), live('Open assumptions', openAsm)],
            activities: [live('Failure conditions identified', acFhas.length), live('Classified', acFhas.filter(f => f.severity).length + '/' + acFhas.length), plan('Crew-awareness FC pairing', 'roadmap'), plan('Combined / operational-event FCs', 'roadmap')],
            outputs: acFhas.length + ' FCs + objectives → PASA'
        },
        PASA: {
            clause: 'Completion checklist — ARP4761A B.5 (13 items)',
            inputs: [live('AFHA failure conditions', acFhas.length + ' (' + crit.length + ' cat/haz)'), live('Architecture — systems', nSys), plan('MAC floors (SDD)', 'D2'), live('Open assumptions', openAsm)],
            activities: [live('Interdependence table', (() => { try { const s = idpStats(); return (s.cells - s.unreviewed) + '/' + s.cells + ' cells · ' + s.multi + ' multi-sys'; } catch (_) { return '—'; } })(), 'interdep'), live('MAC model', (() => { try { const m = macStats(); return m.rules + ' rules · ' + m.spf + ' SPF · ' + m.unsub + ' assumed'; } catch (_) { return '—'; } })(), 'mac'), live('MF&MS allocation trees', critAllocated + ' of ' + crit.length + ' cat/haz allocated', 'fta'), live('Independence principles', (() => { try { const L = ipLedger(); return L.length + ' found · ' + L.filter(p => p.state !== 'identified').length + ' evaluated'; } catch (_) { return '—'; } })(), 'ipledger'), live('Aircraft-level requirements', (acReqData || []).length, 'ac-req'), plan('FDAL summary', 'D3', 'dal-ref'), live('CoFFE cases (optional)', (() => { try { const V = (projectConfig.coffe && projectConfig.coffe.verdicts) || {}; return Object.keys(V).length + ' verdicts signed'; } catch (_) { return '—'; } })())],
            outputs: 'budgets + FDALs + ' + (acReqData || []).length + ' AC requirements → PSSAs'
        },
        SFHA: {
            clause: 'Substantiation criteria — ARP4761A C.9',
            inputs: [live('Systems defined', nSys), plan('PASA interdependence rows', 'D1'), live('Open assumptions', openAsm)],
            activities: [live('System failure conditions', allSysFha.length), live('Classified', allSysFha.filter(f => f.severity).length + '/' + allSysFha.length), plan('AFHA severity reconciliation', 'A4 query')],
            outputs: allSysFha.length + ' FCs + objectives → each PSSA'
        },
        PSSA: {
            clause: 'Completion checklist — ARP4761A D.5 (10 items)',
            inputs: [plan('Budgets + FDAL from PASA', 'A5 hand-off'), live('SFHA failure conditions', allSysFha.length), live('Open assumptions', openAsm)],
            activities: [live('System allocation trees', sysTopDown.length), live('Latent-failure sweep', (() => { try { const r = ccmrLatentSweep().filter(x => x.system !== 'Aircraft'); return r.length + ' latents · ' + r.filter(x => x.exceeds).length + ' exceed'; } catch (_) { return '—'; } })()), plan('Monitor requirements', 'roadmap'), live('System requirements', allSysReq.length)],
            outputs: allSysReq.length + ' system requirements + budgets → items'
        },
        SSA: {
            clause: 'Completion checklist — ARP4761A E.4',
            inputs: [live('Verification mirrors', mirrors.length), live('FMES groups', (() => { try { const f = fmesGroups(); return f.groups.length + ' (' + fmesLints().length + ' lints)'; } catch (_) { return '—'; } })()), plan('Problem reports', 'parked')],
            activities: [plan('Budget vs achieved chart', 'B-phase'), live('CCMR / latent sweep', (() => { try { const r = ccmrLatentSweep(); return r.filter(x => x.verification && x.nte != null).length + ' candidates · ' + r.filter(x => x.exceeds).length + ' exceed'; } catch (_) { return '—'; } })()), live('Wear-out candidates', (() => { try { return ccmrWearoutList().length; } catch (_) { return '—'; } })()), live('Mirror trees populated', mirrors.length)],
            outputs: 'verified results + CCMR candidates → ASA'
        },
        ASA: {
            clause: 'Completion checklist — ARP4761A F.4 (8 items)',
            inputs: [live('Cat/haz failure conditions', crit.length), live('CCA analyses', ((praData || []).length + (zsaData || []).length + (cmaData || []).length) + ' rows'), plan('SSA hand-offs', 'A5')],
            activities: [live('FC triage — interdependence basis', (() => { try { const s = idpStats(); return s.multi + ' multi-system FCs'; } catch (_) { return '—'; } })(), 'interdep'), plan('MF&MS re-run with measured rates', 'D3', 'fta'), live('Independence verification', (() => { try { const L = ipLedger(); return L.filter(p => p.state === 'verified').length + '/' + L.length + ' verified'; } catch (_) { return '—'; } })(), 'ipledger'), live('CCMR / latent posture', (() => { try { const r = ccmrLatentSweep(); return r.filter(x => x.exceeds).length + ' exceedances'; } catch (_) { return '—'; } })(), 'ccmr')],
            outputs: 'aircraft safety case + safety-significant events list'
        },
        PRA: { clause: 'Method — ARP4761A Appendix L', inputs: [live('Risk items', (praData || []).length), live('Zones', (zsaData || []).length)], activities: [live('Risks assessed', (praData || []).length)], outputs: 'survivability requirements + PASA/PSSA inputs' },
        ZSA: { clause: 'Method — ARP4761A Appendix K', inputs: [live('Zones', (zsaData || []).length)], activities: [live('Zones assessed', (zsaData || []).length)], outputs: 'installation requirements + separation evidence' },
        CMA: { clause: 'Method — ARP4761A Appendix M', inputs: [live('Independence claims', (cmaData || []).length), live('Principle ledger', (() => { try { const L = ipLedger(); return L.length + ' principles · ' + L.filter(p => p.state === 'compromised').length + ' compromised'; } catch (_) { return '—'; } })())], activities: [live('Claims dispositioned', (cmaData || []).filter(c => c.status === 'Closed — Accepted' || c.status === 'Mitigated').length + '/' + (cmaData || []).length)], outputs: 'independence evidence → SSA / ASA' }
    };
    return D[key] || null;
}

function openCockpitModal(key) {
    let phases;
    try { phases = computePhaseStatus(); } catch (_) { return; }
    try { if (typeof applyCockpitStatuses === 'function') applyCockpitStatuses(phases); } catch (_) {}
    const p = phases[key];
    const d = _ckptDetail(key);
    if (!p || !d) { enterPhase(key); return; }
    closeCockpitModal();

    const pct = Math.round(Math.max(0, Math.min(1, p.ratio || 0)) * 100);
    const rowHtml = r => '<div class="ckpt-m-row' + (r.planned ? ' ckpt-m-planned' : '') + '">' +
        '<span>' + esc(r.t) + '</span><span class="ckpt-m-val">' + esc(r.v) + '</span></div>';

    // Phase 62.2 (A4) — live checklist rows. Auto items show pass/fail with detail;
    // attest items are click-to-sign; planned items grey with their roadmap tag.
    const cl = p.checklist || evalCkptChecklist(key, phases);
    const CL_ICONS = { pass: '✓', fail: '✕', attested: '✍', open: '·', planned: '·', tailored: '⊘' };
    const clHtml = cl.items.map(i => {
        const click = (i.state === 'open' || i.state === 'attested')
            ? ' onclick="ckptAttest(\'' + esc(key) + '\',\'' + esc(i.id) + '\')" style="cursor:pointer;"' : '';
        return '<div class="ckpt-m-row ckpt-cl-' + esc(i.state) + '"' + click + ' title="' + esc(i.ref) + '">' +
            '<span><span class="ckpt-cl-ic">' + CL_ICONS[i.state] + '</span> ' + esc(i.label) + '</span>' +
            '<span class="ckpt-m-val">' + esc(i.state === 'open' ? 'attest →' : i.detail) + '</span></div>';
    }).join('');
    const clauseTitle = d.clause + ' — ' + cl.items.filter(i => i.state === 'pass' || i.state === 'attested').length + ' of ' +
        cl.items.filter(i => i.state !== 'planned').length + ' satisfied';

    // Phase 62.2 (A5) — hand-off state for the footer button.
    const h = p.handoff;
    let handBtn;
    if (p.status === 'handed-off') {
        handBtn = '<button class="ckpt-m-btn" disabled title="Baseline ' + esc((h && h.hash || '').slice(0, 12)) + '… · signed ' + esc(h ? h.by : '') + '">Baselined ✓ ' + esc(h ? h.at.slice(0, 10) : '') + '</button>';
    } else if (cl.ready) {
        handBtn = '<button class="ckpt-m-btn ckpt-m-btn-hand" onclick="ckptHandOff(\'' + esc(key) + '\')">' + (p.status === 'reopened' ? 'Re-baseline' : 'Baseline this assessment') + '</button>';
    } else {
        handBtn = '<button class="ckpt-m-btn" disabled title="Satisfy the completion checklist first">Baseline this assessment</button>';
    }

    const ov = document.createElement('div');
    ov.id = 'ckpt-modal-overlay';
    ov.innerHTML =
        '<div class="ckpt-modal" role="dialog" aria-modal="true" aria-label="' + esc(key) + ' cockpit">' +
        '<div class="ckpt-m-head">' +
        '<span class="ckpt-designation">' + esc(key) + '</span>' +
        '<span class="ckpt-m-name">' + esc(p.name) + '</span>' +
        '<span class="ckpt-chip ckpt-chip-' + esc(p.status) + '">' + esc(CKPT_STATUS_LABEL[p.status] || '') + '</span>' +
        '<button class="ckpt-m-close" onclick="closeCockpitModal()" aria-label="Close">×</button>' +
        '</div>' +
        '<div class="ckpt-m-body">' +
        '<div class="ckpt-m-col">' +
        '<div class="ckpt-m-sec">Inputs</div>' + d.inputs.map(rowHtml).join('') +
        '<div class="ckpt-m-sec" style="margin-top:12px;">' + esc(clauseTitle) + '</div>' + clHtml +
        '</div>' +
        '<div class="ckpt-m-col">' +
        '<div class="ckpt-m-sec">Activities</div>' + d.activities.map(rowHtml).join('') +
        '<div class="ckpt-bar" style="margin-top:10px;"><div class="ckpt-bar-fill st-' + esc(p.status) + '" style="width:' + pct + '%"></div></div>' +
        '</div>' +
        '</div>' +
        '<div class="ckpt-m-foot">' +
        '<span class="ckpt-m-outputs">Outputs: ' + esc(d.outputs) + '</span>' +
        '<span class="ckpt-m-actions">' +
        handBtn +
        '<button class="ckpt-m-btn" onclick="closeCockpitModal(); enterPhase(\'' + esc(key) + '\')">Open view →</button>' +
        (window.Reports && typeof Reports.open === 'function'
            ? '<button class="ckpt-m-btn ckpt-m-btn-primary" onclick="closeCockpitModal(); try { Reports.open(\'' + esc(key) + '\'); } catch(e) { showToast(\'No report template for ' + esc(key) + ' yet\', \'info\', 2500); }">Generate report</button>'
            : '') +
        '</span></div></div>';

    ov.addEventListener('click', e => { if (e.target === ov) closeCockpitModal(); });
    document.addEventListener('keydown', _ckptEsc, true);
    document.body.appendChild(ov);
}
function _ckptEsc(e) { if (e.key === 'Escape') closeCockpitModal(); }
function closeCockpitModal() {
    const ov = document.getElementById('ckpt-modal-overlay');
    if (ov) ov.remove();
    document.removeEventListener('keydown', _ckptEsc, true);
}

function _ckptFnv(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
}

// Per-assessment input fingerprints: minimal tuples of the upstream data each
// assessment consumes. Drift in any tuple flips a handed-off assessment to Reopened.
function _ckptFingerprint(key) {
    const H = (projectConfig && projectConfig.ckptHandoffs) || {};
    const fhaTup = (acFhaData || []).map(f => [f.internalId, f.severity, f.phases]);
    const sysFhaTup = (systemsData || []).flatMap(s => (s.fha || []).map(f => [f.internalId, f.severity, f.acTrace]));
    // Fingerprints cover the assessment's INPUTS and its OWN CONTENT — either
    // drifting after a hand-off flips the status to Reopened.
    const acTreeIds = (ftaPages || []).filter(p => !p.systemId && !p.verifies).map(p => p.id);
    const sysTreeIds = (ftaPages || []).filter(p => p.systemId && !p.verifies).map(p => p.id);
    const mirrorIds = (ftaPages || []).filter(p => p.verifies).map(p => p.id);
    let src;
    switch (key) {
        case 'AFHA': src = [(acFunctionsData || []).map(f => f.internalId || f.funcId || f.id), (flightPhasesData || []).map(p => [p.phase, p.duration, p.durationUnit]), fhaTup]; break;
        case 'PASA': src = [fhaTup, (systemsData || []).map(s => s.id), acTreeIds, (acReqData || []).map(r => r.internalId || r.id).length, Object.entries((projectConfig.interdep && projectConfig.interdep.cells) || {}).map(([k, v]) => [k, v.state]), (projectConfig.macModels || []).map(m => [m.id, m.subId, m.phase, (m.clauses || []).map(c => [c.min, c.of]), m.substantiation && m.substantiation.kind])]; break;
        case 'SFHA': src = [fhaTup, (systemsData || []).map(s => s.id), sysFhaTup, (H.PASA && H.PASA.at) || null]; break;
        case 'PSSA': src = [sysFhaTup, sysTreeIds, (systemsData || []).map(s => (s.req || []).length), (H.PASA && H.PASA.at) || null]; break;
        case 'SSA':  src = [sysTreeIds, mirrorIds, (H.PSSA && H.PSSA.at) || null]; break;
        case 'ASA':  src = [fhaTup, acTreeIds, mirrorIds, (H.SSA && H.SSA.at) || null]; break;
        case 'PRA':  src = [(praData || []).map(r => r.internalId), (zsaData || []).map(z => z.internalId)]; break;
        case 'ZSA':  src = [(zsaData || []).map(z => z.internalId)]; break;
        case 'CMA':  src = [(cmaData || []).map(c => [c.internalId, c.status])]; break;
        default: src = [];
    }
    // Phase 63.16 (D8) — tailoring changes are input drift: tailoring an item
    // after a hand-off reopens the assessment.
    const tailored = Object.keys((projectConfig && projectConfig.ckptTailored) || {}).filter(k => k.indexOf(key + ':') === 0).sort();
    return _ckptFnv(JSON.stringify([src, tailored]));
}

// Shared evaluation context — built once per checklist evaluation.
function _ckptEvalCtx(phases) {
    const acFhas = acFhaData || [];
    const crit = acFhas.filter(f => f.severity === 'Catastrophic' || f.severity === 'Hazardous');
    const allSysFha = (systemsData || []).flatMap(s => (s.fha || []).map(f => Object.assign({ _sys: s }, f)));
    const acTopDown = (ftaPages || []).filter(p => !p.systemId && !p.verifies && (p.mode || 'top-down') === 'top-down' && p.root && ((p.root.children || []).length > 0 || (p.root._children || []).length > 0));
    const sysTopDown = (ftaPages || []).filter(p => p.systemId && !p.verifies && (p.mode || 'top-down') === 'top-down' && p.root && ((p.root.children || []).length > 0 || (p.root._children || []).length > 0));
    const treeForFc = f => acTopDown.filter(t => (Array.isArray(t.linkedFhaIds) && t.linkedFhaIds.indexOf(f.internalId) !== -1) || t.linkedFhaId === f.internalId);
    const critLinked = crit.map(f => ({ f, trees: treeForFc(f), delegated: allSysFha.some(sf => sf.acTrace && String(sf.acTrace).indexOf(f.fcId) !== -1) }));
    // SFHA↔AFHA severity reconciliation (C.5): a traced system FC must not be classified
    // more severe than the aircraft FC it traces to.
    const reconViolations = [];
    allSysFha.forEach(sf => {
        if (!sf.acTrace) return;
        String(sf.acTrace).split(',').map(s => s.trim()).filter(Boolean).forEach(ref => {
            const ac = acFhas.find(a => a.fcId === ref);
            if (ac && (_CKPT_SEV_RANK[sf.severity] || 0) > (_CKPT_SEV_RANK[ac.severity] || 0)) {
                reconViolations.push(sf.fcId + ' (' + sf.severity + ') > ' + ac.fcId + ' (' + ac.severity + ')');
            }
        });
    });
    const sysWithTrees = (systemsData || []).filter(s => sysTopDown.some(t => t.systemId === s.id));
    const mirrorPopulated = t => {
        const m = (ftaPages || []).find(p => p.verifies === t.id);
        if (!m || !m.root) return false;
        let pop = 0, tot = 0;
        (function walk(n) { if (!n) return; if (n.type !== 'gate') { tot++; if ((n.lambda && n.lambda > 0) || (n.probability && n.probability > 0) || n.markovModelId) pop++; } (n.children || n._children || []).forEach(walk); })(m.root);
        return tot > 0 && pop >= tot;
    };
    return { phases, acFhas, crit, allSysFha, acTopDown, sysTopDown, critLinked, reconViolations, sysWithTrees, mirrorPopulated,
             openAcAsm: (acAssumptionsData || []).filter(a => a.state === 'Proposed').length,
             nSys: (systemsData || []).length };
}

function _ccmrResolveFha(id) {
    if (!id) return null;
    let f = (acFhaData || []).find(x => String(x.internalId) === String(id));
    if (f) return { fha: f, scope: 'Aircraft' };
    for (const s of (systemsData || [])) {
        const m = (s.fha || []).find(x => String(x.internalId) === String(id));
        if (m) return { fha: m, scope: s.name };
    }
    return null;
}
function _ccmrPageFha(page) {
    if (!page) return null;
    // Verification mirrors inherit the linked hazard from their source allocation page.
    if (page.verifies) {
        const src = (ftaPages || []).find(p => p.id === page.verifies);
        if (src) { const r = _ccmrPageFha(src); if (r) return r; }
    }
    const ids = (Array.isArray(page.linkedFhaIds) && page.linkedFhaIds.length) ? page.linkedFhaIds : (page.linkedFhaId ? [page.linkedFhaId] : []);
    let best = null;
    ids.forEach(id => {
        const r = _ccmrResolveFha(id);
        if (r && (!best || (_CKPT_SEV_RANK[r.fha.severity] || 0) > (_CKPT_SEV_RANK[best.fha.severity] || 0))) best = r;
    });
    return best;
}
function _ccmrIsLatent(n) {
    if (!n || n.type === 'gate') return null;
    const tau = parseFloat(n.tau);
    if (n.repairModel === 'periodic' && tau > 0) return { kind: 'periodic test', interval: tau, field: 'tau' };
    const dorm = parseFloat(n.dormancyInterval);
    if (n.exposureMode === 'latent' && dorm > 0) return { kind: 'latent dormancy', interval: dorm, field: 'dormancyInterval' };
    return null;
}

// Geometric bisection on the interval: P(top) is monotone increasing in τ, so find
// the largest τ with P(top) ≤ target. Mutates the node transiently; restores after.
function _ccmrNte(page, node, det, targetP) {
    const tExp = (typeof ftaConfig === 'object' && ftaConfig && ftaConfig.exposureTime) || 1;
    const orig = det.interval;
    const setI = v => { node[det.field] = v; };
    const evalAt = v => {
        setI(v);
        node.probability = effectiveProb(node, tExp);
        const r = computeExactProbability(page.root);
        return (r && isFinite(r.prob)) ? r.prob : 1;
    };
    let out;
    try {
        calcBottomUp(page.root, new Set());
        const pLo = evalAt(1);
        if (pLo > targetP * 1.0000001) out = { nte: null, note: 'target unmet even at 1 h interval' };
        else if (evalAt(1e6) <= targetP) out = { nte: 1e6, note: 'unconstrained (≥ 1e6 h)' };
        else {
            let lo = 1, hi = 1e6;
            for (let i = 0; i < 48; i++) {
                const mid = Math.sqrt(lo * hi);
                if (evalAt(mid) <= targetP) lo = mid; else hi = mid;
            }
            out = { nte: lo, note: '' };
        }
    } finally {
        setI(orig);
        try { node.probability = effectiveProb(node, tExp); calcBottomUp(page.root, new Set()); } catch (_) {}
    }
    return out;
}

function ccmrLatentSweep(force) {
    if (!force && _ccmrCache.rows && (Date.now() - _ccmrCache.at) < 5000) return _ccmrCache.rows;
    const rows = [];
    const tExp = (typeof ftaConfig === 'object' && ftaConfig && ftaConfig.exposureTime) || 1;
    (ftaPages || []).forEach(page => {
        if (!page || !page.root) return;
        const fr = _ccmrPageFha(page);
        if (!fr) return;
        const sev = fr.fha.severity;
        if (sev !== 'Catastrophic' && sev !== 'Hazardous') return;
        const isVerification = !!page.verifies || (page.mode === 'bottom-up');
        const sysName = page.systemId ? (((systemsData || []).find(s => s.id === page.systemId) || {}).name || String(page.systemId)) : 'Aircraft';
        let targetP = null;
        try { const t = getSafetyTarget(sev); if (t && t.prob) targetP = -Math.expm1(-t.prob * tExp); } catch (_) {}
        (function walk(n, seen) {
            if (!n || seen.has(n.id)) return;
            seen.add(n.id);
            const det = _ccmrIsLatent(n);
            if (det && det.interval > tExp) {
                const lam = (typeof getEffectiveLambda === 'function') ? (getEffectiveLambda(n) || 0) : (n.lambda || 0);
                let nte = null, note = '';
                if (isVerification && lam > 0 && targetP) {
                    try { const r = _ccmrNte(page, n, det, targetP); nte = r.nte; note = r.note; }
                    catch (e) { note = 'calc error'; }
                } else if (!isVerification) note = 'allocation tree — bounded at verification';
                else if (!(lam > 0)) note = 'no λ entered yet';
                rows.push({
                    pageId: page.id, pageName: page.name || ('page ' + page.id), system: sysName,
                    event: n.displayId || n.name || ('node ' + n.id), name: n.name || '',
                    fcId: fr.fha.fcId, severity: sev, detection: det.kind,
                    interval: det.interval, lambda: lam, nte, note,
                    verification: isVerification,
                    // CCMR pair-trace (3 Aug ruling): logicalId survives the
                    // verification-mirror clone, so it is the exact join back to
                    // the allocation node the fta-interval requirement generates
                    // from; `verifies` names that allocation page for mirror rows.
                    lid: (n.logicalId != null ? n.logicalId : n.id),
                    verifies: page.verifies || null,
                    exceeds: (nte != null && isFinite(nte) && nte < 1e6 && det.interval > nte * 1.0001)
                });
            }
            (n.children || n._children || []).forEach(c => walk(c, seen));
        })(page.root, new Set());
    });
    _ccmrCache = { at: Date.now(), rows };
    return rows;
}

function _ccmrFmtH(h) {
    if (h == null || !isFinite(h)) return '—';
    if (h >= 1e6) return '≥ 1e6 h';
    return (h >= 100 ? Math.round(h) : Math.round(h * 10) / 10).toLocaleString() + ' h';
}

function renderCcmrPage() {
    const host = document.getElementById('ccmr-host');
    if (!host) return;
    const rows = ccmrLatentSweep(true);
    const wear = ccmrWearoutList();
    const candidates = rows.filter(r => r.verification && r.nte != null);
    const exceed = rows.filter(r => r.exceeds);
    const tExp = (typeof ftaConfig === 'object' && ftaConfig && ftaConfig.exposureTime) || 1;

    let html = '<div class="ckpt-posture" style="margin-top:0;">' +
        '<div class="ckpt-tile"><div class="ckpt-tile-label">Latent events (Cat/Haz trees)</div><div class="ckpt-tile-value">' + rows.length + '</div><div class="ckpt-tile-sub">dormancy &gt; ' + _ccmrFmtH(tExp) + ' mission</div></div>' +
        '<div class="ckpt-tile"><div class="ckpt-tile-label">CCMR candidates</div><div class="ckpt-tile-value">' + candidates.length + '</div><div class="ckpt-tile-sub">not-to-exceed computed</div></div>' +
        '<div class="ckpt-tile' + (exceed.length ? ' ckpt-tile-danger' : ' ckpt-tile-ok') + '"><div class="ckpt-tile-label">Interval exceedances</div><div class="ckpt-tile-value">' + exceed.length + '</div><div class="ckpt-tile-sub">' + (exceed.length ? 'current interval > not-to-exceed' : 'all within bounds') + '</div></div>' +
        '<div class="ckpt-tile"><div class="ckpt-tile-label">Wear-out candidates</div><div class="ckpt-tile-value">' + wear.length + '</div><div class="ckpt-tile-sub">mechanical library provenance</div></div>' +
        '</div>';

    if (!rows.length) {
        html += '<p style="color: var(--color-text-tertiary); font-size: 13px;">No latent events found in Catastrophic/Hazardous trees. Latents are basic events with a periodic-test repair model (τ) or latent exposure mode (dormancy interval) exceeding the mission time.</p>';
    } else {
        html += '<table class="data-table" style="width:100%; font-size:12.5px;"><thead><tr>' +
            '<th>Event</th><th>Tree</th><th>System</th><th>FC</th><th>Sev</th><th>Detection</th><th style="text-align:right;">λ /h</th><th style="text-align:right;">Current interval</th><th style="text-align:right;">Not-to-exceed</th><th style="text-align:right;">Margin</th><th>Note</th>' +
            '</tr></thead><tbody>';
        rows.forEach(r => {
            const margin = (r.nte != null && isFinite(r.nte) && r.nte < 1e6 && r.interval > 0) ? (r.nte / r.interval) : null;
            html += '<tr' + (r.exceeds ? ' style="background: var(--sev-cat-bg);"' : '') + '>' +
                '<td class="u-mono">' + esc(r.event) + '</td>' +
                '<td>' + esc(r.pageName) + '</td>' +
                '<td>' + esc(r.system) + '</td>' +
                '<td class="u-mono">' + esc(r.fcId || '') + '</td>' +
                '<td><span class="sla-stamp" style="color: var(--sev-' + (r.severity === 'Catastrophic' ? 'cat' : 'haz') + '-fg);">' + (r.severity === 'Catastrophic' ? 'CAT' : 'HAZ') + '</span></td>' +
                '<td>' + esc(r.detection) + '</td>' +
                '<td class="u-mono" style="text-align:right;">' + (r.lambda > 0 ? r.lambda.toExponential(2) : '—') + '</td>' +
                '<td class="u-mono" style="text-align:right;">' + _ccmrFmtH(r.interval) + '</td>' +
                '<td class="u-mono" style="text-align:right;' + (r.exceeds ? ' color: var(--color-danger); font-weight:600;' : '') + '">' + _ccmrFmtH(r.nte) + '</td>' +
                '<td class="u-mono" style="text-align:right;">' + (margin != null ? ('×' + (Math.round(margin * 100) / 100)) : '—') + '</td>' +
                '<td style="color: var(--color-text-tertiary);">' + esc(r.note) + '</td></tr>';
        });
        html += '</tbody></table>';
        html += '<p style="font-size: 11.5px; color: var(--color-text-tertiary); font-family: var(--font-mono);">Not-to-exceed = largest interval at which the tree\'s top event still meets its severity target (per-FH target × ' + _ccmrFmtH(tExp) + ' exposure), all other events at current values. Rows over their bound are CCMR candidates requiring an interval reduction or design change (AC 25-19A).</p>';
    }

    if (wear.length) {
        html += '<h4 style="margin-top: var(--s-5);">Wear-out candidates — E.3.2.5</h4>' +
            '<table class="data-table" style="width:100%; font-size:12.5px;"><thead><tr><th>Event</th><th>Tree</th><th>System</th><th>Library entry</th><th>Group</th></tr></thead><tbody>' +
            wear.map(w => '<tr><td class="u-mono">' + esc(w.event) + '</td><td>' + esc(w.pageName) + '</td><td>' + esc(w.system) + '</td><td class="u-mono">' + esc(w.libraryKey) + '</td><td>' + esc(w.group) + '</td></tr>').join('') +
            '</tbody></table><p style="font-size: 11.5px; color: var(--color-text-tertiary);">Constant-λ math assumes pre-wear-out operation — these parts need life limits or scheduled replacement to keep that assumption valid.</p>';
    }
    host.innerHTML = html;
}

function _fmesFindBe(beId) {
    // Type-tolerant lookup: FMEA rows store beId as a string (form values / CSV
    // import) while node ids are numbers — findNode's strict === would miss them.
    const want = String(beId);
    for (const page of (ftaPages || [])) {
        if (!page.root) continue;
        let hit = null;
        (function walk(n) {
            if (hit || !n) return;
            if (String(n.id) === want || String(n.logicalId) === want || String(n.displayId || '') === want) { hit = n; return; }
            (n.children || n._children || []).forEach(walk);
        })(page.root);
        if (hit) return { node: hit, page };
    }
    return null;
}

// The two lints + completeness info.
function fmesLints() {
    const { groups, incomplete } = fmesGroups();
    const lints = [];
    // Lint 1 — split-group linkage: a BE receives only part of its equivalence class.
    groups.forEach(g => {
        if (g.beIds.size === 0) return;
        const linked = g.rows.filter(r => r.beId);
        if (g.beIds.size > 1) {
            lints.push({ kind: 'split', group: g, msg: 'Group "' + g.effect + '" / "' + g.detection + '" links ' + g.beIds.size + ' different basic events — one event should own the whole class (Σλ = ' + g.sumRate.toExponential(2) + ').' });
        } else if (linked.length < g.rows.length) {
            lints.push({ kind: 'split', group: g, msg: 'Group "' + g.effect + '" / "' + g.detection + '": only ' + linked.length + ' of ' + g.rows.length + ' rows link the basic event — its λ under-counts the class (anti-conservative).' });
        }
    });
    // Lint 2 — one BE fed by rows spanning multiple detection classes.
    const byBe = new Map();
    groups.forEach(g => g.beIds.forEach(id => { if (!byBe.has(id)) byBe.set(id, []); byBe.get(id).push(g); }));
    byBe.forEach((gs, beId) => {
        const dets = new Set(gs.map(g => _fmesNorm(g.detection)));
        if (dets.size > 1) {
            const be = _fmesFindBe(beId);
            lints.push({ kind: 'mixed', beId, msg: 'Basic event ' + (be && be.node ? (be.node.displayId || be.node.name) : beId) + ' is fed by rows with ' + dets.size + ' different detection means — split it: detection drives exposure time.' });
        }
    });
    if (incomplete.length) lints.push({ kind: 'incomplete', msg: incomplete.length + ' FMEA row(s) missing end effect or detection means — ungroupable until completed.' });
    return lints;
}

function _fmesBeState(g) {
    if (g.beIds.size !== 1) return { label: g.beIds.size === 0 ? 'unlinked' : 'multi-linked', cls: g.beIds.size === 0 ? '' : 'warn' };
    const hit = _fmesFindBe([...g.beIds][0]);
    if (!hit) return { label: 'BE missing', cls: 'warn' };
    // C2.1 (22 Aug 2026, live-UI-found) — a DECOMPOSED node is a gate with no λ of
    // its own; judging it by node.lambda rendered "STALE" in red and offered
    // Apply Σλ, which would stamp a λ onto a gate. Its truth is Σ(mode children λ)
    // vs the group's current sum, and adoption is never offered on it (noAdopt).
    if (hit.node._fmesDecomposed && hit.node._fmesDecomposed.group === g.key) {
        let modeSum = 0;
        (hit.node.children || []).forEach(c => { if (c && c._fmesMode) modeSum += (parseFloat(c.lambda) || 0); });
        return (Math.abs(modeSum - g.sumRate) <= Math.abs(g.sumRate) * 1e-9)
            ? { label: 'decomposed · ' + (hit.node.children || []).length + ' modes · ' + (hit.node.displayId || ''), cls: 'ok', noAdopt: true }
            : { label: 'decomposed — group sum changed (re-decompose)', cls: 'danger', noAdopt: true };
    }
    const lam = hit.node.lambda || 0;
    if (hit.node._fmesGroup === g.key) {
        return (Math.abs(lam - g.sumRate) <= Math.abs(g.sumRate) * 1e-9)
            ? { label: 'live · ' + (hit.node.displayId || ''), cls: 'ok' }
            : { label: 'STALE — group sum changed', cls: 'danger', canAdopt: true };
    }
    if (Math.abs(lam - g.sumRate) <= Math.abs(g.sumRate) * 1e-9) return { label: 'matches · ' + (hit.node.displayId || ''), cls: 'ok' };
    return { label: 'λ differs (' + (lam ? lam.toExponential(2) : '0') + ')', cls: 'warn', canAdopt: true };
}

function renderFmesPage() {
    const host = document.getElementById('fmes-host');
    if (!host) return;
    const { groups, incomplete } = fmesGroups();
    const lints = fmesLints();
    const linked = groups.filter(g => g.beIds.size > 0).length;

    let html = '<div class="ckpt-posture" style="margin-top:0;">' +
        '<div class="ckpt-tile"><div class="ckpt-tile-label">FMEA rows</div><div class="ckpt-tile-value">' + (fmeaData || []).length + '</div><div class="ckpt-tile-sub">' + incomplete.length + ' ungroupable</div></div>' +
        '<div class="ckpt-tile"><div class="ckpt-tile-label">FMES groups</div><div class="ckpt-tile-value">' + groups.length + '</div><div class="ckpt-tile-sub">by (effect, detection)</div></div>' +
        '<div class="ckpt-tile"><div class="ckpt-tile-label">Linked to basic events</div><div class="ckpt-tile-value">' + linked + '</div><div class="ckpt-tile-sub">of ' + groups.length + ' groups</div></div>' +
        '<div class="ckpt-tile' + (lints.length ? ' ckpt-tile-danger' : ' ckpt-tile-ok') + '"><div class="ckpt-tile-label">Lint findings</div><div class="ckpt-tile-value">' + lints.length + '</div><div class="ckpt-tile-sub">' + (lints.length ? 'need attention' : 'clean') + '</div></div></div>';

    if (lints.length) {
        html += '<div style="border: 1px solid var(--color-danger); border-radius: var(--r-md); padding: 10px 14px; margin-bottom: var(--s-4); background: var(--sev-cat-bg);">' +
            lints.map(l => '<div style="font-size: 12.5px; padding: 2px 0;">' + (l.kind === 'incomplete' ? '· ' : '⚠ ') + esc(l.msg) + '</div>').join('') + '</div>';
    }

    if (!groups.length) {
        html += '<p style="color: var(--color-text-tertiary); font-size: 13px;">No FMES groups yet — FMEA rows need an end effect and a detection means to group. The FMES is derived automatically; there is nothing to maintain here.</p>';
    } else {
        html += '<table class="data-table" style="width:100%; font-size:12.5px;"><thead><tr>' +
            '<th>System</th><th>End effect</th><th>Detection means</th><th>Modes</th><th style="text-align:right;">Σλ /h</th><th>Sev</th><th>Basic event</th><th></th></tr></thead><tbody>';
        groups.forEach(g => {
            const st = _fmesBeState(g);
            const stColor = st.cls === 'ok' ? 'var(--color-success)' : st.cls === 'danger' ? 'var(--color-danger)' : st.cls === 'warn' ? 'var(--color-warning)' : 'var(--color-text-tertiary)';
            html += '<tr>' +
                '<td>' + esc(g.system) + '</td>' +
                '<td>' + esc(g.effect) + '</td>' +
                '<td>' + esc(g.detection) + '</td>' +
                '<td title="' + esc(g.modes.join(' | ')) + '">' + g.rows.length + '</td>' +
                '<td class="u-mono" style="text-align:right;">' + g.sumRate.toExponential(3) + '</td>' +
                '<td>' + esc(g.worstSev || '—') + '</td>' +
                '<td class="u-mono" style="color:' + stColor + ';">' + esc(st.label) + '</td>' +
                '<td>' + (g.beIds.size === 1 && !st.noAdopt && (st.canAdopt || st.cls !== 'ok') ? '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 8px;" onclick="fmesAdopt(\'' + esc(g.key) + '\')">Apply Σλ</button>' : '') +
                    ((typeof SLMirrorModes !== 'undefined' && SLMirrorModes.fmesCellButton) ? SLMirrorModes.fmesCellButton(g) : '') + '</td></tr>';
        });
        html += '</tbody></table>';
        html += '<p style="font-size: 11.5px; color: var(--color-text-tertiary); font-family: var(--font-mono);">A basic event\'s λ is the SUM over all failure modes sharing its (end effect, detection) class — linking a single FMEA row under-counts it. Detection means defines the group boundary because it drives exposure time.</p>';
    }
    host.innerHTML = html;
}

function ipLedger(force) {
    if (!force && _ipCache.list && (Date.now() - _ipCache.at) < 5000) return _ipCache.list;
    const principles = new Map();

    function ensure(memberNodes, claimType, source) {
        const seen = new Map();
        memberNodes.forEach(n => {
            const lid = String(n.logicalId != null ? n.logicalId : n.id);
            if (!seen.has(lid)) seen.set(lid, { lid, label: n.displayId || n.name || lid, ccfGroup: n.ccfGroup || '', beta: n.beta || 0 });
        });
        if (seen.size < 2) return null;
        const members = [...seen.values()].sort((a, b) => a.lid.localeCompare(b.lid));
        const key = members.map(m => m.lid).join('∧');
        if (!principles.has(key)) principles.set(key, { key, members, claims: new Set(), sources: [], gateGids: [], cma: [], reqs: [], contradiction: false, gateCompromised: false });
        const p = principles.get(key);
        p.claims.add(claimType);
        p.sources.push(source);
        // CCF contradiction — two members declaring a shared common-cause group.
        const groups = {};
        members.forEach(m => { if (m.ccfGroup && m.beta > 0) groups[m.ccfGroup] = (groups[m.ccfGroup] || 0) + 1; });
        if (Object.values(groups).some(n => n >= 2)) p.contradiction = true;
        return p;
    }

    (ftaPages || []).forEach(page => {
        if (!page || !page.root) return;
        const fr = _ccmrPageFha(page);
        const sev = fr && fr.fha.severity;
        const isCritical = sev === 'Catastrophic' || sev === 'Hazardous';
        // (a) failure-independence from minimal cut sets (Cat/Haz trees, order 2–3)
        if (isCritical) {
            try {
                const mcs = bddMinimalCutsets(page.root) || [];
                mcs.forEach(cs => {
                    // Backlog #4 — a cut set containing a qualitative development
                    // error (ARP 4761A 4.1.1.1) is an ERROR-independence claim:
                    // the co-members must be independent of the erroneous
                    // development process, not just of random failure.
                    const _claim = cs.some(n => n && n.eventClass === 'dev-error') ? 'error' : 'failure';
                    if (cs.length >= 2 && cs.length <= 3) ensure(cs, _claim, { type: 'cutset', pageId: page.id, pageName: page.name || '', order: cs.length });
                });
            } catch (_) { /* explosion guard / BDD unavailable — gate sources still apply */ }
        }
        // (b) error-independence from DALgebra claims on AND/INHIBIT gates
        (function walk(n, seenIds) {
            if (!n || seenIds.has(n.id)) return;
            seenIds.add(n.id);
            if (n.type === 'gate' && (n.gateType === 'AND' || n.gateType === 'INHIBIT')) {
                const claim = n.dalIndependence || '';
                if (claim && claim !== 'none') {
                    const kids = (n.children || n._children || []).filter(Boolean);
                    const p = ensure(kids, 'error', { type: 'gate', pageId: page.id, pageName: page.name || '', nodeId: n.id, claim });
                    if (p) {
                        p.gateGids.push(String(page.id) + ':' + String(n.id));
                        if (claim === 'compromised' || n._cmaCompromised) p.gateCompromised = true;
                    }
                }
            }
            (n.children || n._children || []).forEach(c => walk(c, seenIds));
        })(page.root, new Set());
    });

    // (c) cross-side independence from bow-ties (bowtie.js). A mitigation barrier
    // traced to an element inside a cause cut set is a DEFEATED claim: prevention
    // and mitigation were multiplied as independent, but share a component. The
    // principle's members are the colliding cut set plus the barrier itself (as a
    // pseudo-member), so the cross-side nature is visible and order-1 cut sets
    // still form a valid 2-member principle.
    try {
        if (typeof window !== 'undefined' && typeof window.btLedgerHits === 'function') {
            window.btLedgerHits().forEach(h => {
                const pseudo = { logicalId: 'BT·' + h.btId + '·' + h.barrierId, displayId: '⛨ ' + (h.barrierName || h.barrierId) + ' (mitigation)' };
                const p = ensure((h.cutsetNodes || []).concat([pseudo]), 'failure',
                    { type: 'bowtie', btId: h.btId, btName: h.btName, barrierId: h.barrierId, barrierName: h.barrierName, pageId: h.pageId, sharedLid: h.sharedLid });
                if (p) p.bowtieCC = true;
            });
        }
    } catch (_) { /* bow-tie module absent or engine issue — ledger stays FTA-sourced */ }

    // (d) monitor independence from monitor specs (monitor_spec.js). A monitor
    // channel that is the monitored element, or shares a cut set with it, is a
    // DEFEATED claim — the monitoring credit rests on independence that isn't there.
    try {
        if (typeof window !== 'undefined' && typeof window.monLedgerHits === 'function') {
            window.monLedgerHits().forEach(h => {
                const p = ensure([h.targetNode, h.monitorMember], 'failure',
                    { type: 'monitor', pageId: h.pageId, lid: h.lid, monitorLid: h.monitorLid });
                if (p) p.monitorCC = true;
            });
        }
    } catch (_) { /* monitor module absent — ledger unaffected */ }

    // (e) event-tree barrier coupling from event_trees.js v1.2 (Backlog #5).
    // Each coupled barrier pair is an independence principle: the ETA product
    // rule CLAIMS the barriers fail independently. When the linked fault
    // trees share a CCF group or event and no conditional pFail is entered,
    // that claim is CONTRADICTED — compromised until the user models the
    // coupling (pCcf, their value) or removes/justifies the links. Barrier
    // pseudo-members mirror the bow-tie pattern (⛨ prefix).
    try {
        if (typeof window !== 'undefined' && typeof window.etaLedgerHits === 'function') {
            window.etaLedgerHits().forEach(h => {
                const pa = { logicalId: 'ETB·' + h.treeId + '·' + h.i, displayId: '⛨ ' + (h.aName || ('B' + (h.i + 1))) + ' (ET barrier)' };
                const pb = { logicalId: 'ETB·' + h.treeId + '·' + h.j, displayId: '⛨ ' + (h.bName || ('B' + (h.j + 1))) + ' (ET barrier)' };
                const p = ensure([pa, pb], 'failure',
                    { type: 'eta', treeId: h.treeId, treeName: h.treeName, aPageId: h.aPageId, bPageId: h.bPageId, why: h.why, modeled: h.modeled });
                if (p) {
                    p.etaCC = true;
                    if (!h.modeled) p.contradiction = true;   // unmodeled coupling = defeated independence
                }
            });
        }
    } catch (_) { /* event-tree module absent — ledger unaffected */ }

    const list = [...principles.values()];
    // Attach CMA evidence via linked gates. Rows filed by the PER-PRINCIPLE
    // walkthrough (cmaContext 'ip:<key>') are handled by the tag join below —
    // they also carry the principle's gate ids, so without this guard they
    // would attach twice.
    (cmaData || []).forEach(row => {
        if (String(row && row.cmaContext || '').indexOf('ip:') === 0) return;
        const gids = (row.linkedGates || row.linkedGateIds || []).map(String);
        if (!gids.length) return;
        list.forEach(p => {
            if (p.gateGids.some(g => gids.indexOf(g) !== -1)) p.cma.push({ cmaId: row.cmaId, status: row.status || '', findings: row.findings || '', phase: row.cmaPhase || 'development' });
        });
    });
    // Per-principle CMA evidence (4 Aug, App M M.3.2.1.3): the tag join. This
    // is what lets CUTSET / bow-tie / monitor / ETA-sourced principles — which
    // have no gateGids — receive CMA evidence at all: the walkthrough files the
    // row against the principle KEY, and the state machine below acts on it
    // (open concern → compromised = the M.3.2.1.3(c) "captured and addressed"
    // loop). Phase rides along for the ASA advisory marker.
    (cmaData || []).forEach(row => {
        const tag = String(row && row.cmaContext || '');
        if (tag.indexOf('ip:') !== 0) return;
        const key = tag.slice(3);
        list.forEach(p => {
            if (p.key === key) p.cma.push({ cmaId: row.cmaId, status: row.status || '', findings: row.findings || '', phase: row.cmaPhase || 'development', perIp: true });
        });
    });
    // Attach AutoReq gate-independence requirements.
    const allReq = [...(acReqData || []), ...(systemsData || []).flatMap(s => s.req || [])];
    allReq.forEach(r => {
        const sid = r.reqSource && String(r.reqSource.sourceId || '');
        if (!sid || sid.indexOf(':gate-indep:') === -1) return;
        list.forEach(p => {
            if (p.gateGids.some(g => { const parts = g.split(':'); return sid.indexOf(':gate-indep:' + parts[0] + ':') !== -1 && sid.indexOf(parts[1]) !== -1; })) p.reqs.push(r);
        });
    });
    // State machine.
    const disp = (projectConfig && projectConfig.ipDispositions) || {};
    list.forEach(p => {
        const openCma = p.cma.some(c => (c.status === 'Open' || c.status === 'In Progress') && String(c.findings).trim());
        const closedCma = p.cma.some(c => c.status === 'Closed — Accepted');
        const anyCmaDone = p.cma.some(c => c.status === 'Closed — Accepted' || c.status === 'Mitigated');
        p.disposition = disp[p.key] || null;
        if (p.contradiction || p.gateCompromised || p.bowtieCC || p.monitorCC || openCma) p.state = 'compromised';
        else if (closedCma && p.reqs.length) p.state = 'verified';
        else if (p.reqs.length) p.state = 'requirement';
        else if (p.disposition || anyCmaDone) p.state = 'evaluated';
        else p.state = 'identified';
        // Per-principle walkthrough coverage + the ASA advisory marker
        // (Waqas's ruling, 4 Aug — HANDOFF §1b): 'verified' keeps its meaning;
        // a verified principle with NO verification-phase evidence (no ASA
        // checklist pass, no verification-phase CMA row) is FLAGGED, never
        // demoted. Tightening later is a deliberate one-line flip here.
        try {
            const w = (projectConfig && projectConfig.cmaWalk && projectConfig.cmaWalk['ip:' + p.key]) || null;
            const devRun = !!(w && w.disp && Object.keys(w.disp).length);
            const verRun = !!(w && w.verDisp && Object.keys(w.verDisp).length);
            p.walk = {
                devRun, verRun,
                devConcerns: devRun ? Object.keys(w.disp).filter(k => w.disp[k] === 'concern').length : 0,
                verConcerns: verRun ? Object.keys(w.verDisp).filter(k => w.verDisp[k] === 'concern').length : 0
            };
            const verEvidence = verRun || p.cma.some(c => c && c.phase === 'verification');
            p.asaAdvisory = (p.state === 'verified' && !verEvidence);
        } catch (_) { p.walk = { devRun: false, verRun: false, devConcerns: 0, verConcerns: 0 }; p.asaAdvisory = false; }
    });
    // C1 (gap 5) — COMPROMISE CASCADE. A compromised principle marks every
    // dependent artifact with an ADDITIVE derived flag (ipCompromised) that is
    // recomputed on every ledger run — it never touches AutoReq's own
    // `compromised` machinery, and it clears itself when the principle heals.
    try {
        allReq.forEach(r => { if (r && r.ipCompromised) delete r.ipCompromised; });
        (cmaData || []).forEach(c => { if (c && c.ipCompromised) delete c.ipCompromised; });
        list.forEach(p => {
            if (p.state !== 'compromised') return;
            const label = p.members.map(m => m.label).join(' ⊥ ');
            const why = p.contradiction ? 'CCF contradiction between members'
                : p.gateCompromised ? 'gate independence claim compromised'
                : p.bowtieCC ? 'bow-tie cross-side common cause'
                : p.monitorCC ? 'monitor shares its monitored element'
                : 'open CMA finding against the claim';
            (p.reqs || []).forEach(r => { if (r) r.ipCompromised = { principle: label, why, at: new Date().toISOString() }; });
            (cmaData || []).forEach(row => {
                const gids = (row.linkedGates || row.linkedGateIds || []).map(String);
                if (gids.length && p.gateGids.some(g => gids.indexOf(g) !== -1)) row.ipCompromised = { principle: label, why, at: new Date().toISOString() };
            });
        });
    } catch (_) { /* cascade is derived decoration — never breaks the ledger */ }
    _ipCache = { at: Date.now(), list };
    return list;
}

function _idpCellKey(fcInternalId, colId) { return String(fcInternalId) + '§' + String(colId); }
function _idpStore() {
    if (!projectConfig.interdep) projectConfig.interdep = { cells: {}, cra: {} };
    if (!projectConfig.interdep.cells) projectConfig.interdep.cells = {};
    if (!projectConfig.interdep.cra) projectConfig.interdep.cra = {};
    return projectConfig.interdep;
}

// ============================================================================
// 21 Aug 2026 (A10) — interdependence at SYSTEM-FUNCTION granularity.
// ARP4761A Table Q.4-1 columns are the system WITH its function ("Wheel Brake
// (F1 decelerate wheels on ground)"), so the table's columns are now the
// declared system FUNCTIONS. New cells are keyed 'fc§fn:<funcId>'.
// Legacy cells keyed 'fc§<systemId>' remain readable in a per-system
// "system-level" column, flagged coarse — they are refined to a function by a
// signed click, NEVER silently expanded (a system-level review asserts nothing
// at function level that nobody reviewed).
// Derivations sharpen honestly: a fact lands on a FUNCTION column only when the
// data actually names that function (a trace lives ON the function; a resource
// declares providedByFunctions; an SFHA row carries sysFuncId). A fact that
// only names the SYSTEM surfaces in the system-level column — coarse, visible,
// never invented down to a function.
// ============================================================================

function _idpIsFnCol(colId) { return String(colId).indexOf('fn:') === 0; }
function _idpColFuncId(colId) { return _idpIsFnCol(colId) ? String(colId).slice(3) : null; }
function _idpFnOwner(funcId) {
    const syss = systemsData || [];
    for (let i = 0; i < syss.length; i++) {
        const f = ((syss[i] || {}).functions || []).find(x => x && String(x.funcId) === String(funcId));
        if (f) return { system: syss[i], fn: f };
    }
    return null;
}

// Systems implementing a given AC sub-function (via function trace edges).
function _idpSystemsImplementing(subId) {
    if (!subId) return [];
    return (systemsData || []).filter(s => (s.functions || []).some(f => {
        const ids = Array.isArray(f.traceIds) ? f.traceIds : (f.traceId ? [f.traceId] : []);
        return ids.indexOf(subId) !== -1;
    })).map(s => s.id);
}

// A resource is consumed "for" this FC when its sub-function consumes it
// (legacy function-level link) or a system implementing that sub-function does.
function _idpResConsumedFor(r, fc) {
    const implSet = fc.subId ? _idpSystemsImplementing(fc.subId) : [];
    return (r.consumedBy || []).indexOf(fc.subId) !== -1 ||
           (r.consumedBySystems || []).some(cid => implSet.indexOf(cid) !== -1);
}

// 21 Aug 2026 (L1) — is this SFHA row keyed to a function OF THIS SYSTEM?
// (row.sysFuncId is the explicit key; row.subId carries a funcId on every row
// the form has written since the pairing guard. A legacy row's subId is an
// aircraft sub-function id and matches neither.)
function _sysFhaFuncKey(sys, row) {
    if (!row) return null;
    const ids = ((sys && sys.functions) || []).filter(f => f && f.funcId).map(f => String(f.funcId));
    if (row.sysFuncId && ids.indexOf(String(row.sysFuncId)) !== -1) return String(row.sysFuncId);
    if (row.subId && ids.indexOf(String(row.subId)) !== -1) return String(row.subId);
    return null;
}

// Derived state for one (FC, FUNCTION) cell → null or { kind, why }.
// Only facts that actually NAME this function land here.
function _idpDerivedFn(fc, funcId) {
    const own = _idpFnOwner(funcId);
    if (!own) return null;
    // (a) implements — THIS function traces to the FC's sub-function
    const ids = Array.isArray(own.fn.traceIds) ? own.fn.traceIds : (own.fn.traceId ? [own.fn.traceId] : []);
    if (fc.subId && ids.indexOf(fc.subId) !== -1) {
        return { kind: 'implements', why: (own.fn.funcName || funcId) + ' traces to ' + fc.subId };
    }
    // (b) resource — a resource whose DECLARED provider function is this one,
    // consumed for the FC's sub-function (resource system functions, chain §5).
    const res = (resourcesData || []).find(r => (r.providedByFunctions || []).indexOf(funcId) !== -1 && _idpResConsumedFor(r, fc));
    if (res) return { kind: 'resource', why: (own.fn.funcName || funcId) + ' provides ' + (res.name || res.resId) + ' consumed for ' + fc.subId };
    // (c) SFHA trace-back — a system FC tracing to this aircraft FC AND keyed to
    // this function (rows carry sysFuncId from the L1 re-key; unkeyed rows stay
    // system-level and surface in the system column, never guessed onto one).
    if ((own.system.fha || []).some(f => f && f.acTrace && String(f.acTrace).indexOf(fc.fcId) !== -1 && _sysFhaFuncKey(own.system, f) === String(funcId))) {
        return { kind: 'sfha', why: 'SFHA condition on ' + (own.fn.funcName || funcId) + ' traces to ' + fc.fcId };
    }
    return null;
}

// Derived facts that name only the SYSTEM — everything the function columns
// cannot honestly carry. These populate the system-level (coarse) column.
function _idpDerivedSysOnly(fc, sysId) {
    const sys = (systemsData || []).find(s => s.id === sysId);
    if (!sys) return null;
    const fnIds = (sys.functions || []).filter(f => f && f.funcId).map(f => String(f.funcId));
    // implements is always function-attributable when functions exist; with NO
    // declared functions the trace fact still needs a home — this column.
    if (!fnIds.length && fc.subId && _idpSystemsImplementing(fc.subId).indexOf(sysId) !== -1) {
        return { kind: 'implements', why: 'system traces to ' + fc.subId + ' (no functions declared)', coarse: true };
    }
    // resource provided by this system with NO provider function declared
    const res = (resourcesData || []).find(r => (r.providedBy || []).indexOf(sysId) !== -1 &&
        !(r.providedByFunctions || []).some(fid => fnIds.indexOf(String(fid)) !== -1) &&
        _idpResConsumedFor(r, fc));
    if (res) return { kind: 'resource', why: 'provides ' + (res.name || res.resId) + ' consumed for ' + fc.subId + ' — declare the provider FUNCTION to refine', coarse: true };
    // SFHA rows tracing to this FC without a function key (explicit sysFuncId
    // or a form-written funcId in subId — see _sysFhaFuncKey)
    if ((sys.fha || []).some(f => f && f.acTrace && String(f.acTrace).indexOf(fc.fcId) !== -1 && !_sysFhaFuncKey(sys, f))) {
        return { kind: 'sfha', why: 'SFHA condition traces to ' + fc.fcId + ' — key the SFHA row to its system function to refine', coarse: true };
    }
    return null;
}

// Column-scoped resolution — what ONE column's cell shows.
// colId: 'fn:<funcId>' or a bare systemId (legacy / system-level).
function _idpCellRaw(fc, colId) {
    const store = _idpStore();
    const manual = store.cells[_idpCellKey(fc.internalId, colId)];
    const derived = _idpIsFnCol(colId) ? _idpDerivedFn(fc, _idpColFuncId(colId)) : _idpDerivedSysOnly(fc, colId);
    if (manual && manual.state === 'asserted') return { state: 'contributes', kind: 'asserted', why: manual.note || 'asserted', by: manual.by, legacy: !_idpIsFnCol(colId) };
    if (manual && manual.state === 'cleared') {
        // Cleared cannot suppress a derived fact — flag the conflict instead.
        if (derived) return { state: 'contributes', kind: derived.kind, why: derived.why + ' — manual clear overridden by derivation', conflict: true, coarse: !!derived.coarse };
        return { state: 'cleared', by: manual.by, legacy: !_idpIsFnCol(colId) };
    }
    if (derived) return { state: 'contributes', kind: derived.kind, why: derived.why, coarse: !!derived.coarse };
    // D1 (gap 4) — AI-swept proposal: NEVER a review outcome, never overwrites
    // derived/asserted/cleared (they all win above). dir: 'contributes'|'clear'.
    if (manual && manual.state === 'proposed') return { state: 'proposed', dir: manual.dir || 'contributes', why: manual.why || 'AI-proposed', model: manual.model || '' };
    return { state: 'unreviewed' };
}

// The Q.4-1 column set: each system's declared functions, plus a system-level
// column where legacy/coarse data needs a home (or no functions are declared).
function idpColumns() {
    const store = _idpStore();
    const legacyKeyed = new Set();
    Object.keys(store.cells).forEach(k => {
        const at = k.indexOf('§');
        if (at !== -1) { const col = k.slice(at + 1); if (!_idpIsFnCol(col)) legacyKeyed.add(col); }
    });
    const fcs = acFhaData || [];
    const out = [];
    (systemsData || []).forEach(s => {
        const fns = (s.functions || []).filter(f => f && f.funcId);
        fns.forEach(f => out.push({ colId: 'fn:' + f.funcId, sysId: s.id, funcId: f.funcId, fnName: f.funcName || f.funcId, sysName: s.name || s.id }));
        const hasSysFacts = fcs.some(fc => fc && _idpDerivedSysOnly(fc, s.id));
        if (!fns.length || legacyKeyed.has(String(s.id)) || hasSysFacts) {
            out.push({ colId: String(s.id), sysId: s.id, legacy: true, sysName: s.name || s.id, fnName: 'system-level' });
        }
    });
    return out;
}

// Public cell resolution. A FUNCTION colId resolves that column; a bare SYSTEM
// id keeps its PRE-A10 MEANING for every existing caller (asa_triage, cea_graph):
// the AGGREGATE of that system — its function columns plus its system-level
// column — so "does this system contribute to this FC" answers exactly as before.
function idpCell(fc, id) {
    if (_idpIsFnCol(id)) return _idpCellRaw(fc, id);
    const sys = (systemsData || []).find(s => s.id === id);
    const fnIds = sys ? (sys.functions || []).filter(f => f && f.funcId).map(f => 'fn:' + f.funcId) : [];
    const cells = fnIds.map(cid => _idpCellRaw(fc, cid));
    cells.push(_idpCellRaw(fc, id));
    const hit = cells.find(c => c.state === 'contributes');
    if (hit) return hit;
    if (cells.some(c => c.state === 'proposed')) return cells.find(c => c.state === 'proposed');
    if (cells.some(c => c.state === 'cleared')) return { state: 'cleared', by: (cells.find(c => c.state === 'cleared') || {}).by };
    return { state: 'unreviewed' };
}

// Contributing systems for an FC (pre-A10 shape — the CRA/MF&MS column set).
function idpContributors(fc) {
    return (systemsData || []).filter(s => idpCell(fc, s.id).state === 'contributes').map(s => s.id);
}
// Contributing FUNCTION columns for an FC (the Q.4-1 answer).
function idpContributorFns(fc) {
    return idpColumns().filter(c => c.funcId && _idpCellRaw(fc, c.colId).state === 'contributes').map(c => c.funcId);
}

// Full-table stats (drives the PASA checklist). Cells are FC × COLUMN now;
// "multi" stays distinct contributing SYSTEMS ≥ 2 (the MF&MS/MAC trigger).
function idpStats() {
    const fcs = acFhaData || [];
    const cols = idpColumns();
    let unreviewed = 0, contributes = 0, cleared = 0, multi = 0, proposed = 0, coarse = 0;
    fcs.forEach(fc => {
        const sysHit = new Set();
        cols.forEach(col => {
            const c = _idpCellRaw(fc, col.colId);
            if (c.state === 'unreviewed') unreviewed++;
            else if (c.state === 'contributes') { contributes++; sysHit.add(col.sysId); if (c.coarse || c.legacy) coarse++; }
            else if (c.state === 'proposed') { proposed++; unreviewed++; }   // a proposal is NOT a review — still gates
            else cleared++;
        });
        if (sysHit.size >= 2) multi++;
    });
    return { fcs: fcs.length, systems: (systemsData || []).length, columns: cols.length,
             cells: fcs.length * cols.length, unreviewed, contributes, cleared, multi, proposed, coarse };
}

function renderInterdepPage() {
    const host = document.getElementById('interdep-host');
    if (!host) return;
    const fcs = acFhaData || [];
    const syss = systemsData || [];
    const cols = idpColumns();
    const stats = idpStats();

    let html = '<div class="ckpt-posture" style="margin-top:0;">' +
        '<div class="ckpt-tile"><div class="ckpt-tile-label">FC × function cells</div><div class="ckpt-tile-value">' + stats.cells + '</div><div class="ckpt-tile-sub">' + fcs.length + ' FCs · ' + stats.columns + ' columns (Q.4-1: system functions)</div></div>' +
        '<div class="ckpt-tile' + (stats.unreviewed ? ' ckpt-tile-warn' : ' ckpt-tile-ok') + '"><div class="ckpt-tile-label">Unreviewed</div><div class="ckpt-tile-value">' + stats.unreviewed + '</div><div class="ckpt-tile-sub">' + (stats.unreviewed ? 'empty ≠ no — review them' : 'coverage complete') + '</div></div>' +
        '<div class="ckpt-tile"><div class="ckpt-tile-label">Contributions</div><div class="ckpt-tile-value">' + stats.contributes + '</div><div class="ckpt-tile-sub">derived + asserted' + (stats.coarse ? ' · <span style="color:#9A6200;">' + stats.coarse + ' system-level (refine)</span>' : '') + '</div></div>' +
        '<div class="ckpt-tile"><div class="ckpt-tile-label">Multi-system FCs</div><div class="ckpt-tile-value">' + stats.multi + '</div><div class="ckpt-tile-sub">→ MF&amp;MS / MAC targets</div></div></div>';

    // D1 (gap 4) — AI sweep over EMPTY cells only, landing as 'proposed'.
    const _idpEmpty = stats.unreviewed - (stats.proposed || 0);
    html += '<div style="margin:0 0 var(--s-4); display:flex; gap:10px; align-items:center; flex-wrap:wrap;">' +
        '<button class="ckpt-m-btn" ' + (_idpEmpty ? '' : 'disabled ') + 'onclick="idpAiSweep()">✨ AI sweep — propose ' + _idpEmpty + ' empty cell(s)</button>' +
        (stats.proposed ? '<span style="font-size:11.5px; color:#9A6200; font-weight:600; font-family:var(--font-mono);">' + stats.proposed + ' AI proposal(s) awaiting your signature — click each cell to accept or clear</span>' : '<span style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">the sweep only touches unreviewed cells — derived facts and signed reviews are never overwritten; proposals still count as unreviewed until you sign</span>') +
        '</div>';

    if (!fcs.length || !syss.length) {
        html += '<p style="color: var(--color-text-tertiary); font-size: 13px;">Needs aircraft FHA failure conditions and at least one system. Cells derive from function traces, resource provide/consume links, and SFHA trace-backs.</p>';
        host.innerHTML = html; return;
    }

    // ---- Table 1: Interdependence (B.3 / Q.4-1 shape — system FUNCTION columns) ----
    html += '<h4 style="margin: var(--s-4) 0 6px;">Interdependence table — B.3 · columns are system functions (Q.4-1)</h4>';
    // Two-row header: systems grouped over their function columns.
    const sysGroups = [];
    cols.forEach(c => {
        const last = sysGroups[sysGroups.length - 1];
        if (last && last.sysId === c.sysId) { last.cols.push(c); } else sysGroups.push({ sysId: c.sysId, sysName: c.sysName, cols: [c] });
    });
    html += '<div style="overflow-x:auto;"><table class="data-table" style="width:100%; font-size:12px;"><thead>' +
        '<tr><th rowspan="2" style="min-width:180px;">Aircraft function</th><th rowspan="2" style="min-width:120px;">Failure condition</th>' +
        sysGroups.map(g => '<th colspan="' + g.cols.length + '" style="text-align:center; border-bottom:1px solid var(--color-border-hair);">' + esc(g.sysName) + '</th>').join('') +
        '<th rowspan="2" style="min-width:90px;"></th></tr>' +
        '<tr>' + cols.map(c => '<th style="text-align:center; min-width:56px; font-weight:500; font-size:10.5px;' + (c.legacy ? ' color:#9A6200;' : '') + '" title="' + esc(c.legacy ? 'System-level (legacy/coarse) — refine reviews onto this system\'s functions' : (c.sysName + ' · ' + c.fnName)) + '">' + esc(c.legacy ? '▣ sys' : c.fnName) + '</th>').join('') + '</tr></thead><tbody>';
    fcs.forEach(fc => {
        const funcName = ((acFunctionsData || []).find(f => f.subId === fc.subId) || {});
        let unrev = 0;
        const sysHit = new Set();
        const cellsHtml = cols.map(col => {
            const c = _idpCellRaw(fc, col.colId);
            let inner, title;
            if (c.state === 'contributes') {
                sysHit.add(col.sysId);
                const color = c.kind === 'asserted' ? '#7F77DD' : '#1D9E75';
                title = (c.kind === 'asserted' ? 'Asserted by ' + (c.by || '?') : 'Derived — ' + c.why) + (c.conflict ? ' (CONFLICT with manual clear)' : '') + (c.coarse || c.legacy ? ' · SYSTEM-LEVEL — click to refine onto a function' : '');
                inner = '<span style="display:inline-block; width:11px; height:11px; background:' + color + ';' + (c.conflict ? ' outline:2px solid var(--color-danger);' : '') + ((c.coarse || c.legacy) ? ' opacity:.55; border:1px solid #9A6200;' : '') + '"></span>';
            } else if (c.state === 'cleared') {
                title = 'Reviewed — no contribution (' + (c.by || '?') + ')' + (c.legacy ? ' · system-level review — click to refine or lift' : '');
                inner = '<span style="color: var(--color-text-tertiary);">—</span>';
            } else if (c.state === 'proposed') {
                unrev++;   // proposals still need the engineer — they gate like unreviewed
                title = 'AI-PROPOSED ' + (c.dir === 'clear' ? 'no-contribution' : 'contribution') + ' — ' + (c.why || '') + ' · click to accept or clear (your signature decides; the proposal never does)';
                inner = '<span style="display:inline-block; width:11px; height:11px; border:2px dashed #9A6200;' + (c.dir === 'clear' ? '' : ' background:rgba(154,98,0,0.35);') + '"></span>';
            } else {
                unrev++;
                title = col.legacy ? 'System-level column — assert on this system\'s FUNCTION columns instead' : 'Not yet reviewed — click to assert';
                inner = '<span style="display:inline-block; width:11px; height:11px; border:1px dashed var(--color-border-strong);' + (col.legacy ? ' opacity:.4;' : '') + '"></span>';
            }
            return '<td style="text-align:center; cursor:pointer;' + (col.legacy ? ' background:var(--color-surface-2);' : '') + '" title="' + esc(title) + '" onclick="idpCycleCell(\'' + esc(String(fc.internalId)) + '\',\'' + esc(String(col.colId)) + '\')">' + inner + '</td>';
        }).join('');
        const n = sysHit.size;
        const sevCls = fc.severity === 'Catastrophic' ? 'cat' : fc.severity === 'Hazardous' ? 'haz' : 'neg';
        const chip = n >= 2
            ? '<span class="sla-stamp" style="color: var(--color-accent); cursor:pointer;" onclick="_idpSelectedFc=\'' + esc(String(fc.internalId)) + '\'; renderInterdepPage();">' + n + ' SYS → CRA</span>'
            : (unrev ? '<span style="font-size:10.5px; color: var(--color-warning); font-family: var(--font-mono);">' + unrev + ' unreviewed</span>'
                     : '<span style="font-size:10.5px; color: var(--color-text-tertiary); font-family: var(--font-mono);">' + (n === 1 ? 'single' : '—') + '</span>');
        html += '<tr><td>' + esc(funcName.funcName || funcName.subName || fc.subId || '—') + '</td>' +
            '<td><span class="u-mono">' + esc(fc.fcId || '') + '</span> <span class="sla-stamp" style="color: var(--sev-' + sevCls + '-fg); font-size:9px;">' + esc((fc.severity || '?').slice(0, 3).toUpperCase()) + '</span></td>' +
            cellsHtml + '<td>' + chip + '</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<div style="display:flex; gap:16px; font-size:11px; color:var(--color-text-secondary); font-family: var(--font-mono); padding:8px 0 0; flex-wrap:wrap;">' +
        '<span><span style="display:inline-block;width:9px;height:9px;background:#1D9E75;vertical-align:-1px;"></span> derived (trace · resource · SFHA)</span>' +
        '<span><span style="display:inline-block;width:9px;height:9px;background:#7F77DD;vertical-align:-1px;"></span> asserted (signed)</span>' +
        '<span>— cleared (reviewed, none)</span>' +
        '<span><span style="display:inline-block;width:9px;height:9px;border:2px dashed #9A6200;background:rgba(154,98,0,0.35);vertical-align:-1px;"></span> AI-proposed (unsigned)</span>' +
        '<span><span style="display:inline-block;width:9px;height:9px;border:1px dashed var(--color-border-strong);vertical-align:-1px;"></span> unreviewed</span>' +
        '<span><span style="display:inline-block;width:9px;height:9px;background:#1D9E75;opacity:.55;border:1px solid #9A6200;vertical-align:-1px;"></span> ▣ system-level (coarse — refine to a function)</span></div>';

    // ---- Table 2: Common resources × systems — same shape and interaction as
    // before; P cells on systems WITH declared functions carry an ᶠ control to
    // declare WHICH function provides (resource system functions, chain §5).
    html += '<h4 style="margin: var(--s-5) 0 6px;">Common resources × systems — provide / consume' +
        ' <button class="ckpt-m-btn" style="font-size:11px; padding:2px 10px; margin-left:10px;" onclick="idpQuickAddResource()">+ resource</button></h4>';
    if (!(resourcesData || []).length) {
        html += '<p style="color: var(--color-text-tertiary); font-size: 13px;">No resources yet — add one, then click cells to map: <b>P</b> on ⚡ resource-system columns, <b>C</b> wherever a system consumes it. Mark systems as resource systems from their directory card badge.</p>';
    } else {
        html += '<div style="overflow-x:auto;"><table class="data-table" style="width:100%; font-size:12px;"><thead><tr>' +
            '<th style="min-width:150px;">Resource</th><th style="min-width:80px;">Type</th>' +
            syss.map(s => {
                const isRes = s.role === 'resource' || s.role === 'both';
                return '<th style="text-align:center; min-width:64px;' + (isRes ? ' color: var(--color-accent);' : '') + '" title="' + (isRes ? 'Resource system — cells cycle P / C / P·C' : 'Function provider — cells toggle C') + '">' + (isRes ? '⚡ ' : '') + esc(s.name) + '</th>';
            }).join('') + '</tr></thead><tbody>';
        (resourcesData || []).forEach(r => {
            const fnConsumers = _resFnConsumers(r);
            const cells = syss.map(s => {
                const isP = (r.providedBy || []).indexOf(s.id) !== -1;
                const isC = (r.consumedBySystems || []).indexOf(s.id) !== -1 || fnConsumers.has(s.id);
                const provFns = (r.providedByFunctions || []).filter(fid => (s.functions || []).some(f => f && String(f.funcId) === String(fid)));
                let inner = '<span style="display:inline-block; width:11px; height:11px; border:1px dashed var(--color-border-strong);"></span>';
                if (isP && isC) inner = '<span class="u-mono" style="font-size:11px;"><b style="color:#1D9E75;">P</b>·<b style="color:#7F77DD;">C</b></span>';
                else if (isP) inner = '<b class="u-mono" style="font-size:11px; color:#1D9E75;">P</b>';
                else if (isC) inner = '<b class="u-mono" style="font-size:11px; color:#7F77DD;">C</b>';
                // Provider-function declaration — the ᶠ chip. Green when declared;
                // amber when this provider has declared functions but none named
                // (the resource stays a COARSE system-level fact until it is).
                if (isP && (s.functions || []).some(f => f && f.funcId)) {
                    inner += ' <a class="u-mono" style="font-size:10px; cursor:pointer; text-decoration:none; color:' + (provFns.length ? '#1D9E75' : '#9A6200') + ';" title="' + (provFns.length ? ('Provider function(s): ' + provFns.join(', ') + ' — click to change') : 'Declare WHICH function provides this resource (Q.4-2 granularity)') + '" onclick="event.stopPropagation(); idpDeclareResProviderFn(\'' + esc(String(r.internalId || r.resId)) + '\',\'' + esc(String(s.id)) + '\')">ᶠ' + (provFns.length ? provFns.length : '?') + '</a>';
                }
                const title = (isP ? 'Provides. ' : '') + (isC ? (fnConsumers.has(s.id) ? 'Consumes (incl. via traced functions). ' : 'Consumes. ') : '') + 'Click to cycle.';
                return '<td style="text-align:center; cursor:pointer;" title="' + esc(title) + '" onclick="idpCycleResCell(\'' + esc(String(r.internalId || r.resId)) + '\',\'' + esc(String(s.id)) + '\')">' + inner + '</td>';
            }).join('');
            html += '<tr><td>' + esc(r.name || r.resId) + '</td><td style="color: var(--color-text-tertiary);">' + esc(r.type || '—') + '</td>' + cells + '</tr>';
        });
        html += '</tbody></table></div>';
        html += '<div style="font-size:11px; color:var(--color-text-secondary); font-family: var(--font-mono); padding:6px 0 0;"><b style="color:#1D9E75;">P</b> provides · <b style="color:#7F77DD;">C</b> consumes · ⚡ resource system (cycles P/C/P·C) · plain columns toggle C · dashed = unmapped · <span style="color:#9A6200;">ᶠ?</span> provider function undeclared (coarse) · <span style="color:#1D9E75;">ᶠn</span> declared</div>';
    }

    // ---- Table 3: Common Resource Analysis (B.4.3.2, Table B3 shape) ----
    // Columns are the FC's contributing COLUMNS (Q.4-2: resources × system
    // functions; a system-level column appears only where the contribution
    // itself is still system-level).
    const craFcs = fcs.filter(fc => idpContributors(fc).length >= 1);
    if (craFcs.length) {
        if (!_idpSelectedFc || !craFcs.some(f => String(f.internalId) === String(_idpSelectedFc))) _idpSelectedFc = String(craFcs[0].internalId);
        const fc = craFcs.find(f => String(f.internalId) === String(_idpSelectedFc));
        const craCols = cols.filter(col => _idpCellRaw(fc, col.colId).state === 'contributes');
        const store = _idpStore();
        html += '<h4 style="margin: var(--s-5) 0 6px;">Common Resource Analysis — B.4.3.2 · one matrix per failure condition</h4>';
        html += '<div style="margin-bottom:8px;"><select class="state-select" style="max-width:420px;" onchange="_idpSelectedFc=this.value; renderInterdepPage();">' +
            craFcs.map(f => '<option value="' + esc(String(f.internalId)) + '"' + (String(f.internalId) === _idpSelectedFc ? ' selected' : '') + '>' + esc(f.fcId + ' — ' + (f.fcDesc || '').slice(0, 60)) + '</option>').join('') + '</select>' +
            '<span style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-left:10px;">columns = this FC\'s contributing system functions, per its interdependence row</span></div>';
        if (!(resourcesData || []).length) {
            html += '<p style="color: var(--color-text-tertiary); font-size: 13px;">No resources defined yet — add provide/consume rows in the Resources view; each becomes three matrix rows (total loss / partial loss / degraded).</p>';
        } else {
            html += '<div style="overflow-x:auto;"><table class="data-table" style="width:100%; font-size:12px;"><thead><tr><th style="min-width:170px;">Resource loss / malfunction</th>' +
                craCols.map(col => '<th style="text-align:center; min-width:110px;' + (col.legacy ? ' color:#9A6200;' : '') + '">' + esc(col.legacy ? (col.sysName + ' (system-level)') : (col.sysName + ' · ' + col.fnName)) + '</th>').join('') +
                '<th style="min-width:170px;">Aircraft-level effect</th></tr></thead><tbody>';
            (resourcesData || []).forEach(r => {
                _CRA_MODES.forEach(mode => {
                    const resKey = (r.internalId || r.resId) + '·' + mode;
                    const rowCells = craCols.map(col => {
                        const affectedFn = col.funcId && (r.providedByFunctions || []).indexOf(col.funcId) !== -1;
                        const affectedSys = (r.providedBy || []).indexOf(col.sysId) !== -1 ||
                            (r.consumedBySystems || []).indexOf(col.sysId) !== -1 ||
                            (r.consumedBy || []).some(subId => _idpSystemsImplementing(subId).indexOf(col.sysId) !== -1);
                        const affected = affectedFn || affectedSys;
                        const key = String(fc.internalId) + '§' + resKey + '§' + String(col.colId);
                        // legacy CRA text was keyed by bare systemId — still readable there
                        const txt = store.cra[key] || (col.legacy ? (store.cra[String(fc.internalId) + '§' + resKey + '§' + String(col.sysId)] || '') : '');
                        const mark = txt ? esc(txt) : (affected ? '<span style="color:#1D9E75;' + (affectedFn ? '' : 'opacity:.55;') + '">●</span>' : '<span style="color:var(--color-text-tertiary);">·</span>');
                        return '<td style="text-align:center; cursor:pointer; font-size:11px;" title="' + (affected ? ((affectedFn ? 'Declared provider function — ' : 'System-level provide/consume — ') + 'click to describe the effect') : 'Click to describe an effect') + '" onclick="craEditCell(\'' + esc(String(fc.internalId)) + '\',\'' + esc(resKey) + '\',\'' + esc(String(col.colId)) + '\')">' + mark + '</td>';
                    }).join('');
                    // craEditCell('fc', resKey, '') writes to 'fc§resKey§' (trailing
                    // separator) — read that key, tolerating the old un-suffixed form.
                    const effKey = String(fc.internalId) + '§' + resKey + '§';
                    const eff = store.cra[effKey] || store.cra[String(fc.internalId) + '§' + resKey] || '';
                    html += '<tr><td>' + esc(r.name || r.resId) + ' — <span style="color:var(--color-text-tertiary);">' + mode + '</span></td>' + rowCells +
                        '<td style="cursor:pointer; font-size:11px;" onclick="craEditCell(\'' + esc(String(fc.internalId)) + '\',\'' + esc(resKey) + '\',\'\')" title="Combined aircraft-level effect for this row">' + (eff ? esc(eff) : '<span style="color:var(--color-text-tertiary);">describe…</span>') + '</td></tr>';
                });
            });
            html += '</tbody></table></div>';
            html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">● = provides or consumes this resource (solid = declared provider function; faded = system-level, coarse). Click any cell to record the effect text; click the last column for the row\'s combined aircraft-level effect (B.4.3.2 step d).</p>';
        }
    }
    host.innerHTML = html;
}

// 21 Aug 2026 (B6) — re-point a legacy bare-SYSTEM member at the system FUNCTION
// it was really about. Signed and recorded (rule.repointed[]), never silent, and it
// moves everything keyed by the member id: clause membership, weights, fidelity
// basis, and the arbitration set. If the target already sits in a clause, the old
// member is simply removed (no duplicates).
async function macRepointMember(ruleId, oldId, newFuncId) {
    if (!newFuncId) return;
    const r = ((projectConfig.macModels) || []).find(x => String(x.id) === String(ruleId));
    if (!r) return;
    const ask = (typeof slPrompt === 'function') ? slPrompt : ((m, d) => Promise.resolve(window.prompt(m, d)));
    const oldL = _macSysName(oldId), newL = _macSysName(newFuncId);
    const by = (await ask('Re-point MAC member \u201C' + oldL + '\u201D at system function \u201C' + newL + '\u201D across this rule (clauses, weights, fidelity basis, arbitration). Sign with your name:', _signoffReviewerName() || '')) || '';
    if (!String(by).trim()) { renderMacPage(); return; }
    (r.clauses || []).forEach(cl => {
        const at = (cl.of || []).indexOf(oldId);
        if (at !== -1) {
            if ((cl.of || []).indexOf(newFuncId) !== -1) cl.of.splice(at, 1); else cl.of[at] = newFuncId;
            if (cl.weights && Object.prototype.hasOwnProperty.call(cl.weights, oldId)) { cl.weights[newFuncId] = cl.weights[oldId]; delete cl.weights[oldId]; }
            if (cl.basis && Object.prototype.hasOwnProperty.call(cl.basis, oldId)) { cl.basis[newFuncId] = cl.basis[oldId]; delete cl.basis[oldId]; }
        }
    });
    if (r.arbitration && Array.isArray(r.arbitration.of)) {
        const ai = r.arbitration.of.indexOf(oldId);
        if (ai !== -1) { if (r.arbitration.of.indexOf(newFuncId) !== -1) r.arbitration.of.splice(ai, 1); else r.arbitration.of[ai] = newFuncId; }
    }
    r.repointed = r.repointed || [];
    r.repointed.push({ from: oldId, to: newFuncId, by: String(by).trim(), at: new Date().toISOString(),
        note: String(by).trim() + ' re-pointed MAC member "' + oldL + '" at system function "' + newL + '".' });
    try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    if (typeof showToast === 'function') showToast('Member re-pointed \u2014 recorded in the rule\u2019s provenance.', 'success', 3500);
    renderMacPage();
}

function macStartDraft() {
    _macDraft = { subId: '', phase: 'All phases', clauses: [{ min: 1, of: [] }] };
    renderMacPage();
}
function macCancelDraft() { _macDraft = null; renderMacPage(); }
function macDraftSet(field, val) { if (_macDraft) _macDraft[field] = val; renderMacPage(); }
function macDraftClauseMin(i, val) { if (_macDraft && _macDraft.clauses[i]) _macDraft.clauses[i].min = Math.max(1, parseInt(val) || 1); renderMacPage(); }
// 21 Aug 2026 (B6) — the draft toggles system FUNCTION ids now. Same mechanics;
// macDraftToggleSys stays as a delegate so nothing that referenced the old name breaks.
function macDraftToggleMember(i, memberId) { return macDraftToggleSys(i, memberId); }
function macDraftToggleSys(i, sysId) {
    if (!_macDraft || !_macDraft.clauses[i]) return;
    const of = _macDraft.clauses[i].of;
    const at = of.indexOf(sysId);
    if (at === -1) of.push(sysId); else of.splice(at, 1);
    renderMacPage();
}
function macDraftAddClause() { if (_macDraft) _macDraft.clauses.push({ min: 1, of: [] }); renderMacPage(); }
function macDraftRemoveClause(i) { if (_macDraft) { _macDraft.clauses.splice(i, 1); if (!_macDraft.clauses.length) _macDraft.clauses.push({ min: 1, of: [] }); } renderMacPage(); }
async function macSaveDraft() {
    if (!_macDraft || !_macDraft.subId) { if (typeof showToast === 'function') showToast('Pick the aircraft function this MAC rule floors.', 'warning', 3000); return; }
    const clauses = _macDraft.clauses.filter(c => (c.of || []).length > 0).map(c => ({ min: Math.min(c.min || 1, c.of.length), of: c.of.slice() }));
    if (!clauses.length) { if (typeof showToast === 'function') showToast('Add at least one clause with members.', 'warning', 3000); return; }
    const by = (await slPrompt('MAC rules are engineering judgment until the SDD substantiates them — recorded as an assumption routed to design. Sign with your name:', _signoffReviewerName() || '')) || '';
    if (!by.trim()) return;
    _macStore().push({
        id: 'mac-' + Date.now(),
        level: 0,
        subId: _macDraft.subId,
        phase: _macDraft.phase || 'All phases',
        clauses,
        substantiation: { kind: 'assumption', ref: '', by: by.trim(), at: new Date().toISOString() },
        floor: null, contributions: []   // L2 slots — populated when the SDD provides numbers (D3)
    });
    _macDraft = null;
    try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    try { updateDashboard(); } catch (_) {}
    renderMacPage();
}
async function macSubstantiate(id) {
    const r = _macStore().find(x => x.id === id);
    if (!r) return;
    if (r.substantiation && r.substantiation.kind === 'sdd') {
        const yes = await (typeof slConfirm === 'function' ? slConfirm('Revert to assumption (clear SDD substantiation ' + (r.substantiation.ref || '') + ')?') : Promise.resolve(confirm('Revert?')));
        if (yes) r.substantiation = { kind: 'assumption', ref: '', by: r.substantiation.by || '', at: new Date().toISOString() };
    } else {
        const ref = (await slPrompt('SDD reference substantiating this rule (e.g., SDD-BRK-041 rev C):', '')) || '';
        if (!ref.trim()) return;
        const by = (await slPrompt('Sign with your name:', _signoffReviewerName() || '')) || '';
        if (!by.trim()) return;
        r.substantiation = { kind: 'sdd', ref: ref.trim(), by: by.trim(), at: new Date().toISOString() };
    }
    try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    renderMacPage();
}
async function macDeleteRule(id) {
    const yes = await (typeof slConfirm === 'function' ? slConfirm('Delete this MAC rule? Its breach set disappears from downstream analyses.') : Promise.resolve(confirm('Delete?')));
    if (!yes) return;
    const s = _macStore();
    const i = s.findIndex(x => x.id === id);
    if (i !== -1) s.splice(i, 1);
    try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    renderMacPage();
}

function _macSysName(id) {
    // 21 Aug 2026 (B6) — members are system FUNCTIONS now. Label through the
    // resolver so a function id renders "System · Function"; legacy system ids
    // and items still label sensibly; unknown falls back to the raw id.
    try { if (typeof window !== 'undefined' && window.SLFnResolve) { const r = SLFnResolve.resolve(id); if (r && r.kind !== 'unknown') return r.label || String(id); } } catch (_) {}
    return (((systemsData || []).find(s => s.id === id) || {}).name || String(id));
}
function _macClauseChips(cl, rule) {
    const weighted = (typeof macClauseWeighted === 'function') && rule && typeof rule === 'object' && macClauseWeighted(rule, cl);
    const names = (cl.of || []).map(id => {
        const w = (cl.weights && +cl.weights[id] > 0) ? +cl.weights[id] : 1;
        return esc(_macSysName(id)) + (weighted && w !== 1 ? '<span style="opacity:.6;">×' + w + '</span>' : '');
    }).join(', ');
    const q = weighted
        ? 'capacity ≥ ' + (cl.floor != null ? cl.floor : (cl.min || 1)) + ' from'
        : ((cl.min || 1) >= (cl.of || []).length ? 'all of' : '≥' + (cl.min || 1) + ' of');
    return '<span style="display:inline-block; border:1px solid var(--color-border-strong); padding:2px 8px; margin:2px 4px 2px 0; font-size:11.5px; font-family:var(--font-mono);">' + q + ' { ' + names + ' }</span>';
}
// ---- D2 fidelity ladder: substantiation bookkeeping ------------------------
// basis strings: 'assumed' (default when absent) or 'sdd:<ref>'.
function _macBasisIsSdd(b) { return String(b || '').indexOf('sdd:') === 0; }
function macFidAssumed(rule) {
    const out = [];
    (rule.clauses || []).forEach(cl => {
        if (!(typeof macClauseWeighted === 'function' && macClauseWeighted(rule, cl))) return;
        const basis = cl.basis || {};
        if (cl.floor != null && !_macBasisIsSdd(basis.floor)) out.push('floor ' + cl.floor);
        Object.keys(cl.weights || {}).forEach(s => { if (+cl.weights[s] > 0 && +cl.weights[s] !== 1 && !_macBasisIsSdd(basis[s])) out.push(_macSysName(s) + ' ×' + cl.weights[s]); });
    });
    (rule.degraded || []).forEach(d => { if (d && !_macBasisIsSdd(d.basis)) out.push((d.label || 'degraded') + ' → ' + d.weight); });
    return out;
}

// ============================================================================
// Phase 63.5 (D3) — MAC compiler: rules → generated MF&MS fault trees.
//
// Exact mapping, no approximation: a clause "≥min of n members survive" is
// breached when (n−min+1) members fail, i.e. a VOTING gate with k = n−min+1
// over the member-failure events (AND when k = n, direct events when k = 1).
// The rule's tree is the OR of its clause-breach gates. Every compile is
// VERIFIED: the generated tree's BDD minimal cut sets must equal the rule's
// combinatorial breach sets — the AI-synthesis contract (D6) applied to the
// compiler itself. Basic events carry stable per-system logicalIds so shared
// systems fold across pages in BDD quantification, and the ledger sees them.
// Regeneration diffs the breach set (fidelity-upgrade diffs), keeps the page id
// (links survive), and flags stale pages when the rule drifts.
// ============================================================================
function _macFcForRule(rule) {
    const rows = (acFhaData || []).filter(f => f.subId === rule.subId);
    if (!rows.length) return null;
    return rows.slice().sort((a, b) => (_CKPT_SEV_RANK[b.severity] || 0) - (_CKPT_SEV_RANK[a.severity] || 0))[0];
}
function _macRuleFp(rule) {
    // L1/L2 fields are APPENDED only when present — L0 fingerprints are
    // byte-identical to prior releases (no false 'stale' on upgrade).
    const cls = (rule.clauses || []).map(c => {
        const base = [c.min, (c.of || []).slice().sort()];
        if (c && (c.floor != null || (c.weights && Object.keys(c.weights).length))) base.push([c.floor != null ? c.floor : null, c.weights || null]);
        return base;
    });
    const payload = [rule.subId, rule.phase, cls];
    if (Array.isArray(rule.degraded) && rule.degraded.length) payload.push(rule.degraded.map(d => [d.sysId, d.label, d.weight]));
    return _ckptFnv(JSON.stringify(payload));
}
function _macCompiledStore() {
    if (!projectConfig.macCompiled) projectConfig.macCompiled = {};
    return projectConfig.macCompiled;
}

// Verify compiled tree ≡ breach sets via the BDD engine.
// Phase 63.15 (D7) — grafted malfunction branches (_macGraft) are AUTHORED
// additions, not model claims: the theorem applies to the compiled portion, so
// verification runs on the root with grafts filtered out.
function _macCompiledOnly(root) {
    if (!root) return root;
    const kids = (root.children || root._children || []).filter(c => !c._macGraft);
    return Object.assign({}, root, { children: kids, _children: undefined });
}
function _macVerify(rule, root) {
    try {
        const want = macBreachSets(rule).map(s => s.slice().sort().join('|')).sort();
        const got = (bddMinimalCutsets(_macCompiledOnly(root)) || []).map(cs =>
            [...new Set(cs.map(n => String(n.logicalId || '').replace(/^macsys:/, '').replace(/^macdeg:/, 'deg:')))].sort().join('|')).sort();
        return want.length === got.length && want.every((w, i) => w === got[i]);
    } catch (e) { return false; }
}

function macCompile(ruleId) {
    const rule = _macStore().find(r => r.id === ruleId);
    if (!rule) return { ok: false, reason: 'rule not found' };
    const fc = _macFcForRule(rule);
    if (!fc) return { ok: false, reason: 'no AFHA failure condition on function ' + rule.subId + ' — add the FHA row first' };
    const subMeta = (acFunctionsData || []).find(f => f.subId === rule.subId) || {};
    const funcLabel = subMeta.funcName || subMeta.subName || rule.subId;

    const be = sysId => {
        const s = (systemsData || []).find(x => x.id === sysId) || { name: String(sysId) };
        return { id: internalIdCounter++, logicalId: 'macsys:' + sysId, displayId: 'MAC·' + s.name.slice(0, 14),
                 name: s.name + ' failed / unavailable', type: 'basic', probability: 0, children: [], _macProvenance: 'compiled' };
    };
    // D2 (L1/L2) — degraded-state event: 'deg:<sysId>:<label>' breach elements.
    const beDeg = key => {
        const rest = key.slice(4);
        const cut = rest.indexOf(':');
        const sysId = rest.slice(0, cut), label = rest.slice(cut + 1);
        const s = (systemsData || []).find(x => x.id === sysId) || { name: String(sysId) };
        const row = (rule.degraded || []).find(d => d && d.sysId === sysId && d.label === label) || {};
        return { id: internalIdCounter++, logicalId: 'macdeg:' + sysId + ':' + label, displayId: 'MAC·' + s.name.slice(0, 10) + '·deg',
                 name: s.name + ' degraded — ' + label + (row.weight != null ? ' (retains ' + row.weight + ')' : ''),
                 type: 'basic', probability: 0, children: [], _macProvenance: 'compiled' };
    };
    // Breach sets first — the weighted compile builds FROM them, and the
    // explosion guard refuses (never approximates) before any tree exists.
    const bc = macBreachSetsChecked(rule);
    if (bc.error) return { ok: false, reason: bc.error };
    const breach = bc.sets;

    const kids = [];
    if (macRuleLevel(rule) > 0) {
        // ---- L1/L2 — OR of AND-groups over the minimal breach sets. Events
        // carry stable logicalIds so BDD quantification folds shared systems;
        // _macVerify still proves cutsets ≡ breach sets independently.
        breach.forEach(set => {
            const evs = set.map(key => key.indexOf('deg:') === 0 ? beDeg(key) : be(key));
            if (evs.length === 1) { kids.push(evs[0]); return; }
            kids.push({ id: internalIdCounter++, logicalId: internalIdCounter, displayId: 'MAC-BRCH',
                name: 'Capacity breach: { ' + set.map(k => k.indexOf('deg:') === 0 ? k.slice(4).replace(':', ' degraded: ') : _macSysName(k)).join(' ∧ ') + ' }',
                type: 'gate', gateType: 'AND', probability: 0, children: evs, _macProvenance: 'compiled' });
        });
    } else (rule.clauses || []).forEach(cl => {
        const n = (cl.of || []).length;
        if (!n) return;
        const k = n - (cl.min || 1) + 1;
        const members = cl.of.map(be);
        if (n === 1 || k === 1) {
            members.forEach(m => kids.push(m));   // any single member failing breaches
        } else if (k === n) {
            kids.push({ id: internalIdCounter++, logicalId: internalIdCounter, displayId: 'MAC-AND', name: 'All of { ' + cl.of.map(id => _macSysName(id)).join(', ') + ' } failed', type: 'gate', gateType: 'AND', probability: 0, children: members, _macProvenance: 'compiled' });
        } else {
            kids.push({ id: internalIdCounter++, logicalId: internalIdCounter, displayId: 'MAC-' + k + 'oo' + n, name: '≥' + k + ' of { ' + cl.of.map(id => _macSysName(id)).join(', ') + ' } failed', type: 'gate', gateType: 'VOTING', votingK: k, probability: 0, children: members, _macProvenance: 'compiled' });
        }
    });
    if (!kids.length) return { ok: false, reason: 'rule has no populated clauses' };
    const root = { id: internalIdCounter++, logicalId: internalIdCounter, displayId: 'MAC-TOP', name: 'MAC breached — ' + funcLabel + (rule.phase && rule.phase !== 'All phases' ? ' (' + rule.phase + ')' : ''), type: 'gate', gateType: 'OR', probability: 0, children: kids, _macProvenance: 'compiled' };

    const fp = _macRuleFp(rule);
    const store = _macCompiledStore();
    const prev = store[rule.id];
    // Breach-set diff vs the previous compile (fidelity-upgrade visibility).
    let added = [], removed = [];
    if (prev && Array.isArray(prev.breach)) {
        const key = s => s.slice().sort().join('|');
        const prevKeys = new Set(prev.breach.map(key));
        const nowKeys = new Set(breach.map(key));
        added = breach.filter(s => !prevKeys.has(key(s)));
        removed = prev.breach.filter(s => !nowKeys.has(key(s)));
    }
    // Keep the page id stable across recompiles so links survive.
    const pageId = (prev && prev.pageId) || ('mac-pg-' + rule.id);
    const existing = (ftaPages || []).findIndex(p => p.id === pageId);
    // Phase 63.15 (D7) — carry authored malfunction grafts across the recompile.
    if (existing !== -1 && ftaPages[existing].root) {
        (ftaPages[existing].root.children || []).filter(c => c._macGraft).forEach(g => root.children.push(g));
    }
    const page = {
        id: pageId, name: 'MF&MS · ' + (fc.fcId || funcLabel), root,
        treeLevel: 'aircraft', mode: 'top-down',
        linkedFhaId: fc.internalId,
        generatedFrom: 'mac', macRuleId: rule.id, _macFp: fp,
        missionProfileId: (typeof ftaConfig === 'object' && ftaConfig && ftaConfig.missionProfileId) || ''
    };
    if (existing !== -1) ftaPages[existing] = page; else ftaPages.push(page);
    const verified = _macVerify(rule, root);
    store[rule.id] = { fp, pageId, breach, verified, at: new Date().toISOString() };
    return { ok: true, pageId, verified, added, removed, breachCount: breach.length };
}

function renderSppPage() {
    const host = document.getElementById('spp-host');
    if (!host) return;
    const spp = _sppStore();
    const tlr = projectConfig.ckptTailored || {};
    const tKeys = Object.keys(tlr);

    let html = '';
    if (spp.intake) {
        html += '<p class="u-mono" style="font-size:11.5px; color: var(--color-text-tertiary); margin: 0 0 var(--s-3);">Intake: ' + esc(spp.intake.basis || '') + ' · route: ' + esc(spp.intake.route || '') + ' · ' + esc(String(spp.intake.at || '').slice(0, 10)) + '</p>';
    }
    html += '<h4 style="margin-top:0;">Method slots — fixed objectives, pluggable methods</h4>' +
        '<table class="data-table" style="width:100%; font-size:12.5px;"><thead><tr><th>Objective</th><th>Selected method</th></tr></thead><tbody>';
    SPP_SLOTS.forEach(s => {
        const cur = (spp.slots[s.id] != null) ? spp.slots[s.id] : s.dflt;
        html += '<tr><td>' + esc(s.label) + '</td><td><select class="state-select" style="max-width:340px;" onchange="sppSetSlot(\'' + esc(s.id) + '\', this.value)">' +
            s.options.map((o, i) => '<option value="' + i + '"' + (i === cur ? ' selected' : '') + '>' + esc(o) + '</option>').join('') +
            '</select></td></tr>';
    });
    html += '</tbody></table>';

    html += '<h4 style="margin-top: var(--s-5);">Tailoring register — signed opt-outs' +
        ' <button class="ckpt-m-btn" style="font-size:11px; padding:2px 10px; margin-left:10px;" onclick="sppTailorItem()">+ tailor out an item</button></h4>';
    if (!tKeys.length) {
        html += '<p style="color: var(--color-text-tertiary); font-size: 13px;">Nothing tailored out. Every completion-checklist item across the six assessments applies in full. Opting out requires a rationale and a signature, and stays permanently visible here and on the checklist.</p>';
    } else {
        html += '<table class="data-table" style="width:100%; font-size:12.5px;"><thead><tr><th>Item</th><th>Rationale</th><th>Signed</th><th></th></tr></thead><tbody>';
        tKeys.forEach(k => {
            const t = tlr[k];
            html += '<tr><td class="u-mono">' + esc(k) + '</td><td>' + esc(t.rationale || '') + '</td>' +
                '<td class="u-mono" style="font-size:11px;">' + esc(t.by || '') + ' · ' + esc(String(t.at || '').slice(0, 10)) + '</td>' +
                '<td><button class="ckpt-m-btn" style="font-size:11px; padding:2px 8px;" onclick="sppClearTailoring(\'' + esc(k) + '\')">Reinstate</button></td></tr>';
        });
        html += '</tbody></table>';
    }

    // Depth-of-analysis defaults (§3.8) from the current cert basis.
    html += '<h4 style="margin-top: var(--s-5);">Depth of analysis defaults — §3.8, from the certification basis</h4>' +
        '<table class="data-table" style="width:100%; font-size:12.5px;"><thead><tr><th>Severity</th><th>Target</th><th>DAL</th><th>Default depth</th></tr></thead><tbody>';
    ['Catastrophic', 'Hazardous', 'Major', 'Minor'].forEach(sev => {
        let t = null;
        try { t = getSafetyTarget(sev); } catch (_) {}
        const depth = sev === 'Catastrophic' ? 'Full qualitative + quantitative · MF&MS · CCA · CCMR sweep' :
                      sev === 'Hazardous' ? 'Qualitative + quantitative · CCA · CCMR sweep' :
                      sev === 'Major' ? 'Qualitative (quantitative per AC 25.1309 Fig. 2 criteria)' : 'Qualitative';
        html += '<tr><td>' + esc(sev) + '</td><td class="u-mono">' + esc(t && t.prob ? t.prob.toExponential(0) + ' /FH' : '—') + '</td>' +
            '<td class="u-mono">' + esc(t && t.dal || '—') + '</td><td>' + esc(depth) + '</td></tr>';
    });
    html += '</tbody></table>';

    // Phase E2.5 — AI activity ledger: every AI act (call, draft, accept, edit,
    // audit, lint-override) leaves a provenance record; the latest show here.
    try {
        const prov = (typeof window !== 'undefined' && window.AiFidelity && AiFidelity.provStore()) || [];
        html += '<h4 style="margin-top: var(--s-5);">AI activity ledger — Phase E2 provenance (' + prov.length + ' record' + (prov.length === 1 ? '' : 's') + ')</h4>';
        if (!prov.length) {
            html += '<p style="color: var(--color-text-tertiary); font-size:13px;">No AI activity recorded yet. Every AI call, draft, acceptance, and linter override lands here with its model, prompt hash, and input fingerprint.</p>';
        } else {
            html += '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr><th>When</th><th>Kind</th><th>Feature / Section</th><th>Model</th><th>Prompt</th><th>Flags</th><th>By</th></tr></thead><tbody>';
            prov.slice(-12).reverse().forEach(r => {
                html += '<tr><td class="u-mono">' + esc(String(r.at || '').slice(0, 16).replace('T', ' ')) + '</td>' +
                    '<td class="u-mono">' + esc(r.kind || '') + '</td>' +
                    '<td>' + esc(r.section || r.heading || r.group || r.feature || '') + (r.section || r.heading || r.group ? ' <span style="color:var(--color-text-tertiary);">· ' + esc(r.feature || '') + '</span>' : '') + '</td>' +
                    '<td class="u-mono" style="font-size:11px;">' + esc(String(r.model || '—').slice(0, 24)) + '</td>' +
                    '<td class="u-mono">' + esc(r.promptHash || '—') + '</td>' +
                    '<td class="u-mono">' + esc(r.flags != null ? String(r.flags) + (r.overrideNote ? ' ⊘' : '') : (r.findings != null ? String(r.findings) : '—')) + '</td>' +
                    '<td>' + esc(r.by || '') + '</td></tr>';
            });
            html += '</tbody></table>';
        }
    } catch (_) {}

    html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">The plan record is declarative — every method tab stays available; this declares what the program committed to, feeds the generated reports, and holds the opt-out register the completion gates honor.</p>';
    host.innerHTML = html;
}

function renderCoffePanel() {
    const host = document.getElementById('coffe-host');
    if (!host) return;
    const fcs = (acFhaData || []).filter(fc => idpContributors(fc).length >= 2);
    if (!fcs.length) {
        host.innerHTML = '<p style="color: var(--color-text-tertiary); font-size: 13px;">CoFFE cases enumerate over each FC\'s contributing systems — mark contributions in the interdependence table first (an FC needs ≥2 contributors).</p>';
        return;
    }
    if (!_coffeSelectedFc || !fcs.some(f => String(f.internalId) === String(_coffeSelectedFc))) _coffeSelectedFc = String(fcs[0].internalId);
    const fc = fcs.find(f => String(f.internalId) === String(_coffeSelectedFc));
    const V = _coffeStore().verdicts;
    const cases = coffeCases(fc);
    const findings = coffeFindings(fc);
    const decided = cases.filter(k => V[fc.internalId + '§' + k.key]).length;
    // 21 Aug 2026 (B4) — CoFFE consumes MAC. The model's answers FOLD AWAY;
    // judgement is spent only where it is genuinely required: malfunction
    // cases (no computed lane), cases touching a system no MAC clause models
    // (the model's "survives" there is vacuous, not knowledge), and live
    // signed-vs-computed disagreements, which stay on the table until worked.
    const unmod = new Set(coffeUnmodelledSystems(fc));
    const _coffeIsElicit = k => {
        const c = coffeComputed(fc, k);
        if (c === null) return true;
        if (k.parts.some(p => unmod.has(p.sysId))) return true;
        const v0 = V[fc.internalId + '§' + k.key];
        return !!(v0 && v0.verdict !== c);
    };
    const elicitCases = cases.filter(_coffeIsElicit);
    const foldedCases = cases.filter(k => !_coffeIsElicit(k));
    const foldYes = foldedCases.filter(k => coffeComputed(fc, k) === 'yes').length;
    const caseNo = {}; cases.forEach((k, i) => { caseNo[k.key] = i + 1; });

    let html = '<div class="ckpt-posture" style="margin-top:0;">' +
        '<div class="ckpt-tile"><div class="ckpt-tile-label">Cases</div><div class="ckpt-tile-value">' + cases.length + '</div><div class="ckpt-tile-sub">singles + pairs · model-pruned</div></div>' +
        '<div class="ckpt-tile"><div class="ckpt-tile-label">Model answers</div><div class="ckpt-tile-value">' + foldedCases.length + '</div><div class="ckpt-tile-sub">folded — derived, not judged</div></div>' +
        '<div class="ckpt-tile"><div class="ckpt-tile-label">Elicit</div><div class="ckpt-tile-value">' + elicitCases.length + '</div><div class="ckpt-tile-sub">' + decided + ' signed</div></div>' +
        '<div class="ckpt-tile' + (findings.length ? ' ckpt-tile-danger' : ' ckpt-tile-ok') + '"><div class="ckpt-tile-label">Lane disagreements</div><div class="ckpt-tile-value">' + findings.length + '</div><div class="ckpt-tile-sub">' + (findings.length ? 'findings — review' : 'lanes agree') + '</div></div></div>';

    html += '<div style="margin-bottom:8px;"><select class="state-select" style="max-width:420px;" onchange="_coffeSelectedFc=this.value; renderCoffePanel();">' +
        fcs.map(f => '<option value="' + esc(String(f.internalId)) + '"' + (String(f.internalId) === _coffeSelectedFc ? ' selected' : '') + '>' + esc(f.fcId + ' — ' + (f.fcDesc || '').slice(0, 60)) + '</option>').join('') + '</select></div>';
    if (unmod.size) {
        html += '<div style="border:1px solid var(--color-warning); padding:6px 12px; margin-bottom:var(--s-3); font-size:12px;">' +
            'No MAC clause models: <strong>' + [...unmod].map(id => esc(_macSysName(id))).join(', ') + '</strong> — their cases cannot be computed and need elicitation (or add them to the MAC).</div>';
    }

    if (findings.length) {
        html += '<div style="border:1px solid var(--color-danger); padding:8px 12px; margin-bottom:var(--s-3); background: var(--sev-cat-bg); font-size:12px;">' +
            findings.map(f => '⚠ ' + esc(f.msg)).join('<br>') + '</div>';
    }

    // Table B2 shape: Case # | one state column per contributing system | Result
    // (capability effect, editable) | "Does it result in FC?" (the determination —
    // elicited verdict with the computed lane annotated beneath it).
    // B4 — two sections, one row renderer: the ELICIT table always shows; the
    // model-answered cases fold behind a summary (expand to review, sign as
    // derived, or disagree). Case numbers are positions in the FULL walk, so a
    // case keeps its number whichever section it renders in.
    const cols = idpContributors(fc);
    const _coffeTableHead = '<div style="overflow-x:auto;"><table class="data-table" style="width:100%; font-size:12px;"><thead><tr>' +
        '<th style="width:44px;">Case</th>' +
        cols.map(id => '<th style="text-align:center; min-width:86px;">' + esc(_macSysName(id)) + '</th>').join('') +
        '<th style="min-width:150px;">Capability result</th>' +
        '<th style="text-align:center; min-width:130px;">Results in FC?</th></tr></thead><tbody>';
    if (!projectConfig.coffe.results) projectConfig.coffe.results = {};
    const _coffeRow = (kase) => {
        const idx = caseNo[kase.key] - 1;
        let html = '';
        const stateOf = {};
        kase.parts.forEach(p => { stateOf[p.sysId] = p.state; });
        const stateCells = cols.map(id => {
            const st = stateOf[id];
            if (!st) return '<td style="text-align:center; color: var(--color-text-tertiary);">Operational</td>';
            const color = st === 'total loss' ? 'var(--color-danger)' : 'var(--color-warning)';
            return '<td style="text-align:center; color:' + color + '; font-weight:600;">' + esc(st === 'total loss' ? 'Failed' : 'Malfunction') + '</td>';
        }).join('');
        const rKey = String(fc.internalId) + '§' + kase.key;
        const result = projectConfig.coffe.results[rKey] || '';
        const c = coffeComputed(fc, kase);
        const v = V[fc.internalId + '§' + kase.key];
        // Phase 63.15 (D7) — signed-YES malfunction cases offer "graft branch".
        const hasMal = kase.parts.some(p => p.state === 'malfunction');
        let graftBtn = '';
        if (v && v.verdict === 'yes' && hasMal) {
            const rule = _macStore().find(r => r.subId === fc.subId);
            const rec = rule && _macCompiledStore()[rule.id];
            const grafted = rec && (rec.grafts || []).indexOf(kase.key) !== -1;
            graftBtn = grafted
                ? ' <span style="font-size:10px; color: var(--color-success); font-family: var(--font-mono);">✓ grafted</span>'
                : ' <button class="ckpt-m-btn" style="font-size:10px; padding:1px 6px;" title="Graft this case onto the compiled tree as an authored malfunction branch" onclick="coffeGraft(\'' + esc(String(fc.internalId)) + '\',\'' + esc(kase.key) + '\')">graft →</button>';
        }
        // B4 — the model's unsigned answer offers "sign derived": accept the
        // arithmetic with a signature, recorded derived:true, spending the
        // signature only where the engineer DISAGREES otherwise.
        const derivedBtn = (!v && c !== null && !kase.parts.some(p => unmod.has(p.sysId)))
            ? ' <button class="ckpt-m-btn" style="font-size:10px; padding:1px 6px;" title="Accept the model\'s answer as the determination — recorded as DERIVED, not independently judged" onclick="coffeConfirmDerived(\'' + esc(String(fc.internalId)) + '\',\'' + esc(kase.key) + '\')">✍ sign derived</button>'
            : '';
        const vacuous = c !== null && kase.parts.some(p => unmod.has(p.sysId));
        const det = (v
            ? '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 8px;' + (v.verdict === 'yes' ? ' color: var(--color-danger); border-color: var(--color-danger);' : '') + '" onclick="coffeVerdict(\'' + esc(String(fc.internalId)) + '\',\'' + esc(kase.key) + '\')">' + (v.aiProposed ? '<span style="color:#7A5300;" title="AI-proposed — not a review. Click to clear it, then determine and sign; or leave it and sign your own.">✨ AI-proposed</span> ' : '✍ ') + (v.verdict === 'yes' ? 'Yes' : 'No') + ' · ' + esc(v.by) + (v.derived ? ' <span style="opacity:.6;">(derived)</span>' : '') + '</button>' + graftBtn
            : '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 8px;" onclick="coffeVerdict(\'' + esc(String(fc.internalId)) + '\',\'' + esc(kase.key) + '\')">determine →</button>' + derivedBtn) +
            '<div style="font-size:10px; font-family:var(--font-mono); color:' +
            (c === null ? 'var(--color-text-tertiary);">— no computed lane' :
             vacuous ? 'var(--color-text-tertiary);">— outside the MAC model' :
             (v && v.verdict !== c) ? 'var(--color-danger); font-weight:700;">✕ MAC says ' + c :
             'var(--color-text-tertiary);">MAC: ' + (c === 'yes' ? 'breaches' : 'survives') + ((v && v.verdict === c) ? ' ✓' : '')) + '</div>';
        html += '<tr><td class="u-mono">' + (idx + 1) + '</td>' + stateCells +
            '<td style="cursor:pointer; font-size:11.5px;" title="Capability result — click to describe (Table B2 column 6)" onclick="coffeEditResult(\'' + esc(String(fc.internalId)) + '\',\'' + esc(kase.key) + '\')">' + (result ? esc(result) : '<span style="color:var(--color-text-tertiary);">describe…</span>') + '</td>' +
            '<td style="text-align:center;">' + det + '</td></tr>';
        return html;
    };
    html += '<h4 style="margin: var(--s-3) 0 6px;">Elicit — judgement residue <span style="font-weight:400; font-size:11px; color:var(--color-text-tertiary);">(malfunction · unmodelled systems · disagreements)</span></h4>';
    html += elicitCases.length
        ? _coffeTableHead + elicitCases.map(_coffeRow).join('') + '</tbody></table></div>'
        : '<p style="color: var(--color-text-tertiary); font-size:13px;">Nothing left to elicit — every remaining case is answered by the MAC model below.</p>';
    if (foldedCases.length) {
        html += '<h4 style="margin: var(--s-4) 0 6px; cursor:pointer;" onclick="window._coffeShowComputed = !window._coffeShowComputed; renderCoffePanel();">' +
            (window._coffeShowComputed ? '▾' : '▸') + ' ' + foldedCases.length + ' case' + (foldedCases.length === 1 ? '' : 's') + ' answered by the MAC model' +
            ' <span style="font-weight:400; font-size:11px; color:var(--color-text-tertiary);">(' + foldYes + ' breach · ' + (foldedCases.length - foldYes) + ' survive — the same clause arithmetic the tree prover verifies; expand to review, sign as derived, or disagree)</span></h4>';
        if (window._coffeShowComputed) html += _coffeTableHead + foldedCases.map(_coffeRow).join('') + '</tbody></table></div>';
    }
    html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">Table B2 format — one state column per contributing system, capability result, explicit determination. B4: the MAC model\'s answers fold away (and a model-computed YES single prunes its supersets from the walk); judgement is spent on malfunction, unmodelled systems and disagreements. Sign-derived records acceptance of the arithmetic, never an independent judgement; signed Yes determinations are locked constraints the model must keep breaching.</p>';
    host.innerHTML = html;
}

function _mfmsEventSystem(node) {
    if (node && node.externalSource && node.externalSource.systemId) return String(node.externalSource.systemId);
    const lid = node && String(node.logicalId || '');
    if (lid && lid.indexOf('macsys:') === 0) return lid.slice(7);
    return null;
}
function _mfmsAuthoredPages() {
    return (ftaPages || []).filter(p => p.root && !p.verifies && !p.generatedFrom && !p.systemId &&
        (p.mode || 'top-down') === 'top-down' &&
        ((p.root.children || []).length > 0 || (p.root._children || []).length > 0) &&
        (Array.isArray(p.linkedFhaIds) ? p.linkedFhaIds.length : p.linkedFhaId));
}
function mfmsCrossCheck(page) {
    const fr = _ccmrPageFha(page);
    if (!fr) return null;
    const fc = fr.fha;
    let cutsets = [];
    try { cutsets = bddMinimalCutsets(page.root) || []; } catch (_) {}
    let mappedEvents = 0, totalEvents = 0;
    (function walk(n, seen) {
        if (!n || seen.has(n.id)) return;
        seen.add(n.id);
        if (n.type !== 'gate') { totalEvents++; if (_mfmsEventSystem(n)) mappedEvents++; }
        (n.children || n._children || []).forEach(c => walk(c, seen));
    })(page.root, new Set());
    // System-granularity cutsets: fully mapped ones only; others are undecidable.
    const sysCutsets = [];
    let undecidable = 0;
    cutsets.forEach(cs => {
        const systems = cs.map(_mfmsEventSystem);
        if (systems.every(Boolean)) sysCutsets.push([...new Set(systems)]);
        else undecidable++;
    });
    // MAC comparison.
    const breach = _coffeBreachSetsForFc(fc);
    let macDiff = null;
    if (breach.length) {
        // missing (anti-conservative): a MAC breach combination the tree does NOT
        // reach — no tree cutset is a subset of it.
        const missing = breach.filter(b => !sysCutsets.some(cs => cs.every(x => b.indexOf(x) !== -1)));
        // extra (conservative, but a model disagreement): a tree cutset claiming a
        // combination the MAC says survives — no breach set is a subset of it.
        const extra = sysCutsets.filter(cs => !breach.some(b => b.every(x => cs.indexOf(x) !== -1)));
        macDiff = { missing, extra };
    }
    // Locked CoFFE YES constraints (pure loss).
    const V = (projectConfig.coffe && projectConfig.coffe.verdicts) || {};
    const constraints = [];
    Object.keys(V).forEach(k => {
        if (k.indexOf(String(fc.internalId) + '§') !== 0 || V[k].verdict !== 'yes') return;
        const key = k.split('§')[1];
        const parts = key.split('∧').map(seg => { const i = seg.lastIndexOf('='); return { sysId: seg.slice(0, i), state: seg.slice(i + 1) }; });
        if (parts.some(p => p.state !== 'total loss')) return;   // loss constraints only
        const failed = parts.map(p => p.sysId);
        const contained = sysCutsets.some(cs => cs.every(x => failed.indexOf(x) !== -1));
        constraints.push({ key, contained, undecidable: !contained && undecidable > 0 });
    });
    return { fc, mappedEvents, totalEvents, undecidable, sysCutsets, macDiff, constraints };
}

function _mfmsSpecToTree(spec, depth) {
    if (depth > 8) throw new Error('tree too deep');
    if (spec && spec.sys) {
        const s = (systemsData || []).find(x => x.id === spec.sys) || { name: String(spec.sys) };
        return { id: internalIdCounter++, logicalId: 'macsys:' + spec.sys, displayId: 'MAC·' + s.name.slice(0, 14),
                 name: spec.name || (s.name + ' failed / unavailable'), type: 'basic', probability: 0, children: [], _macProvenance: 'ai-verified' };
    }
    const gt = String(spec && spec.gate || '').toUpperCase();
    if (gt !== 'OR' && gt !== 'AND' && gt !== 'VOTING') throw new Error('bad gate ' + gt);
    const kids = (spec.children || []).map(c => _mfmsSpecToTree(c, depth + 1));
    if (!kids.length) throw new Error('empty gate');
    const node = { id: internalIdCounter++, logicalId: internalIdCounter, displayId: 'AI-' + gt, name: String(spec.name || gt).slice(0, 120),
                   type: 'gate', gateType: gt, probability: 0, children: kids, _macProvenance: 'ai-verified' };
    if (gt === 'VOTING') node.votingK = Math.max(1, parseInt(spec.k) || 2);
    return node;
}

// Validate + apply a proposed restructure. Pure/deterministic — testable without AI.
function mfmsApplyRestructure(ruleId, spec) {
    const rule = _macStore().find(r => r.id === ruleId);
    const rec = _macCompiledStore()[ruleId];
    if (!rule || !rec) return { ok: false, reason: 'rule not compiled' };
    const page = (ftaPages || []).find(p => p.id === rec.pageId);
    if (!page) return { ok: false, reason: 'compiled page missing' };
    let newRoot;
    const idBefore = internalIdCounter;
    try { newRoot = _mfmsSpecToTree(spec, 0); }
    catch (e) { return { ok: false, reason: 'bad structure: ' + e.message }; }
    // The theorem: proposed tree's BDD cutsets must equal the rule's breach sets.
    let verified = false;
    try { verified = _macVerify(rule, newRoot); } catch (_) { verified = false; }
    if (!verified) { internalIdCounter = idBefore; return { ok: false, reason: 'equivalence check FAILED — proposal rejected, page untouched' }; }
    // Phase 63.15 (D7) — carry authored malfunction grafts onto the new structure.
    (page.root && page.root.children || []).filter(c => c._macGraft).forEach(g => newRoot.children.push(g));
    page.root = newRoot;
    rec.aiRestructured = true;
    rec.aiAt = new Date().toISOString();
    rec.verified = true;
    return { ok: true, verified: true };
}

function renderMfmsPanel() {
    const host = document.getElementById('mfms-host');
    if (!host) return;
    const rules = _macStore();
    const store = _macCompiledStore();
    const fresh = rules.filter(r => macTreeStatus(r) === 'fresh').length;
    const stale = rules.filter(r => macTreeStatus(r) === 'stale').length;
    const unver = rules.filter(r => { const rec = store[r.id]; return rec && rec.verified === false; }).length;

    let html = '<div class="ckpt-posture" style="margin-top:0;">' +
        '<div class="ckpt-tile"><div class="ckpt-tile-label">MAC rules</div><div class="ckpt-tile-value">' + rules.length + '</div><div class="ckpt-tile-sub">compile sources</div></div>' +
        '<div class="ckpt-tile' + (fresh === rules.length && rules.length ? ' ckpt-tile-ok' : '') + '"><div class="ckpt-tile-label">Trees fresh</div><div class="ckpt-tile-value">' + fresh + ' / ' + rules.length + '</div><div class="ckpt-tile-sub">' + stale + ' stale</div></div>' +
        '<div class="ckpt-tile' + (unver ? ' ckpt-tile-danger' : ' ckpt-tile-ok') + '"><div class="ckpt-tile-label">Equivalence verified</div><div class="ckpt-tile-value">' + (rules.length - unver) + ' / ' + rules.length + '</div><div class="ckpt-tile-sub">BDD cut sets ≡ breach sets</div></div>' +
        '<div class="ckpt-tile"><div class="ckpt-tile-label"></div><div style="padding-top:6px;"><button class="ckpt-m-btn ckpt-m-btn-primary" onclick="macCompileAll()">Compile all</button></div></div></div>';

    if (!rules.length) {
        html += '<p style="color: var(--color-text-tertiary); font-size: 13px;">No MAC rules to compile — write them on the MAC Model tab. Each rule compiles to an aircraft-level MF&MS fault tree: OR of clause-breach gates (VOTING k = n−min+1), linked to the function\'s worst failure condition, ready for top-down budget allocation.</p>';
    } else {
        html += '<table class="data-table" style="width:100%; font-size:12.5px;"><thead><tr><th>Function</th><th>FC</th><th>Tree</th><th>Breach combos</th><th>Status</th><th>Verified</th><th></th></tr></thead><tbody>';
        rules.forEach(r => {
            const fc = _macFcForRule(r);
            const st = macTreeStatus(r);
            const rec = store[r.id];
            const stColor = st === 'fresh' ? 'var(--color-success)' : st === 'stale' ? 'var(--color-warning)' : 'var(--color-text-tertiary)';
            html += '<tr>' +
                '<td>' + esc(r.subId) + '</td>' +
                '<td class="u-mono">' + esc(fc ? fc.fcId : '— no FHA row') + '</td>' +
                '<td>' + (rec ? esc('MF&MS · ' + (fc ? fc.fcId : '')) : '—') + '</td>' +
                '<td class="u-mono" style="text-align:center;">' + macBreachSets(r).length + ((rec && rec.grafts && rec.grafts.length) ? ' <span style="color: var(--color-purple);" title="Authored malfunction branches grafted from CoFFE — outside the equivalence theorem">+' + rec.grafts.length + ' grafted</span>' : '') + '</td>' +
                '<td><span class="sla-stamp" style="color:' + stColor + ';">' + st.toUpperCase() + '</span></td>' +
                '<td>' + (rec ? (rec.verified ? '<span style="color:var(--color-success);">✓ ≡</span>' + (rec.aiRestructured ? ' <span class="sla-stamp" style="color: var(--color-purple); font-size:9px;" title="AI drafted the readable structure; the BDD prover verified equivalence before it was applied">✦ AI-VERIFIED</span>' : '') : '<span style="color:var(--color-danger); font-weight:600;">✕ MISMATCH</span>') : '—') + '</td>' +
                '<td style="white-space:nowrap;"><button class="ckpt-m-btn" style="font-size:11px; padding:2px 8px;" onclick="macCompile(\'' + esc(r.id) + '\'); try{commitSaveChanges();}catch(_){}; renderMfmsPanel();">' + (st === 'missing' ? 'Compile' : 'Recompile') + '</button> ' +
                (rec && st === 'fresh' && window.SafetyLabAI && SafetyLabAI.available && SafetyLabAI.available() ? '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 8px;" title="AI drafts a readable hierarchy; the equivalence prover accepts or rejects it" onclick="mfmsAiRestructure(\'' + esc(r.id) + '\')">✦ Restructure</button> ' : '') +
                (rec ? '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 8px;" onclick="openFTAPageById(\'' + esc(rec.pageId) + '\')">Open ↗</button>' : '') + '</td></tr>';
        });
        html += '</tbody></table>';
        html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">Compiled trees are top-down (probability-only) pages linked to the function\'s worst FC — open one and the budget allocator, DALgebra, AutoReq and the principle ledger all run on it like any hand-built tree. Recompiling keeps the page id, diffs the breach set, and re-verifies equivalence.</p>';
    }

    // ---- Phase 63.12 (D5) — authored trees, cross-checked not trusted ----
    const authored = _mfmsAuthoredPages();
    html += '<h4 style="margin: var(--s-5) 0 6px;">Authored MF&MS trees — manual method slot' +
        ' <button class="ckpt-m-btn" style="font-size:11px; padding:2px 10px; margin-left:10px;" onclick="mfmsNewAuthoredTree()">+ authored tree</button></h4>';
    if (!authored.length) {
        html += '<p style="color: var(--color-text-tertiary); font-size: 13px;">No hand-built aircraft trees yet. Authored trees sit beside the compiled ones and are cross-checked against the MAC breach sets and locked CoFFE constraints — map their events to systems via external-source links so the checks can see them.</p>';
    } else {
        html += '<table class="data-table" style="width:100%; font-size:12.5px;"><thead><tr><th>Tree</th><th>FC</th><th>Event mapping</th><th>MAC comparison</th><th>Locked constraints</th><th></th></tr></thead><tbody>';
        authored.forEach(p => {
            const chk = mfmsCrossCheck(p);
            if (!chk) return;
            const mapTxt = chk.mappedEvents + '/' + chk.totalEvents + ' events' + (chk.undecidable ? ' · ' + chk.undecidable + ' cutsets undecidable' : '');
            let macTxt = '<span style="color:var(--color-text-tertiary);">no MAC rule</span>';
            if (chk.macDiff) {
                macTxt = chk.macDiff.missing.length
                    ? '<span style="color:var(--color-danger); font-weight:600;">✕ ' + chk.macDiff.missing.length + ' breach(es) missing</span>'
                    : '<span style="color:var(--color-success);">✓ all breaches reached</span>';
                if (chk.macDiff.extra.length) macTxt += ' <span style="color:var(--color-warning);">· ' + chk.macDiff.extra.length + ' extra</span>';
            }
            const conTxt = chk.constraints.length
                ? (chk.constraints.every(c => c.contained)
                    ? '<span style="color:var(--color-success);">✓ ' + chk.constraints.length + ' contained</span>'
                    : '<span style="color:var(--color-danger); font-weight:600;">✕ ' + chk.constraints.filter(c => !c.contained).length + ' of ' + chk.constraints.length + ' not contained</span>')
                : '<span style="color:var(--color-text-tertiary);">none locked</span>';
            html += '<tr><td>' + esc(p.name) + ' <span class="sla-stamp" style="color: var(--color-purple); font-size:9px;">AUTHORED</span></td>' +
                '<td class="u-mono">' + esc(chk.fc.fcId || '') + '</td>' +
                '<td class="u-mono" style="font-size:11px;">' + esc(mapTxt) + '</td>' +
                '<td>' + macTxt + '</td><td>' + conTxt + '</td>' +
                '<td><button class="ckpt-m-btn" style="font-size:11px; padding:2px 8px;" onclick="openFTAPageById(\'' + esc(p.id) + '\')">Open ↗</button></td></tr>';
        });
        html += '</tbody></table>';
        html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">Authored trees are checked, never trusted: MISSING = a MAC breach the tree can\'t reach (anti-conservative — fix the tree or the model); EXTRA = the tree claims a combination the MAC says survives. Locked CoFFE YES cases must always breach the tree.</p>';
    }
    // Aircraft trees without an FC link — visible but uncheckable until linked.
    const unlinked = (ftaPages || []).filter(p => p.root && !p.verifies && !p.generatedFrom && !p.systemId &&
        (p.mode || 'top-down') === 'top-down' &&
        ((p.root.children || []).length > 0 || (p.root._children || []).length > 0) &&
        !(Array.isArray(p.linkedFhaIds) ? p.linkedFhaIds.length : p.linkedFhaId));
    if (unlinked.length) {
        html += '<div style="opacity:0.6; font-size:12.5px; margin-top:8px;">' + unlinked.map(p =>
            '· ' + esc(p.name || p.id) + ' — <span class="u-mono" style="font-size:11px;">no FC link · link a failure condition to include it in the checks</span> ' +
            '<button class="ckpt-m-btn" style="font-size:11px; padding:1px 7px;" onclick="openFTAPageById(\'' + esc(p.id) + '\')">Open ↗</button>').join('<br>') + '</div>';
    }
    host.innerHTML = html;
}

function renderMacPage() {
    const host = document.getElementById('mac-host');
    if (!host) return;
    const rules = _macStore();
    const stats = macStats();
    const subs = [];
    const seen = new Set();
    (acFunctionsData || []).forEach(f => { const id = (f.subId || '').trim(); if (id && !seen.has(id)) { seen.add(id); subs.push({ id, label: id + (f.subName ? ' · ' + f.subName : '') }); } });
    subs.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    const phases = ['All phases'].concat((flightPhasesData || []).map(p => p.phase).filter(Boolean));

    let html = '<div class="ckpt-posture" style="margin-top:0;">' +
        '<div class="ckpt-tile"><div class="ckpt-tile-label">MAC rules (F0–F2)</div><div class="ckpt-tile-value">' + stats.rules + '</div><div class="ckpt-tile-sub">survival conditions</div></div>' +
        '<div class="ckpt-tile"><div class="ckpt-tile-label">Breach combinations</div><div class="ckpt-tile-value">' + stats.combos + '</div><div class="ckpt-tile-sub">compiled, minimal</div></div>' +
        '<div class="ckpt-tile' + (stats.spf ? ' ckpt-tile-danger' : ' ckpt-tile-ok') + '"><div class="ckpt-tile-label">Single-point breaches</div><div class="ckpt-tile-value">' + stats.spf + '</div><div class="ckpt-tile-sub">' + (stats.spf ? 'one failure defeats MAC' : 'none') + '</div></div>' +
        '<div class="ckpt-tile' + (stats.unsub ? ' ckpt-tile-warn' : ' ckpt-tile-ok') + '"><div class="ckpt-tile-label">Awaiting SDD</div><div class="ckpt-tile-value">' + stats.unsub + '</div><div class="ckpt-tile-sub">assumption-based rules</div></div></div>';

    // D2 — CONSERVATIVE-DEFAULT banner: any L1/L2 value not SDD-substantiated
    // is an ASSUMPTION, and every unmodeled degraded state counts as full loss.
    const _fidAssumedRules = rules.filter(r => macFidAssumed(r).length);
    if (_fidAssumedRules.length) {
        html += '<div style="border:1px solid #f0d9b5; border-left:3px solid #9A6200; background:var(--color-surface-2); padding:9px 14px; margin:0 0 var(--s-4); font-size:12px; color:var(--color-text-secondary);">' +
            '<b style="color:#9A6200;">Conservative defaults in effect.</b> ' + _fidAssumedRules.length + ' rule(s) carry F1/F2 capacities, floors, or degraded weights that are not SDD-substantiated — they are recorded as ASSUMED (' +
            esc(_fidAssumedRules.slice(0, 3).map(r => macFidAssumed(r).slice(0, 2).join(', ')).join(' · ')) + (_fidAssumedRules.length > 3 ? ' · …' : '') +
            '). Unmodeled degraded states count as FULL LOSS. Substantiate each value against the SDD in the fidelity editor.</div>';
    }

    // ---- draft editor ----
    if (_macDraft) {
        html += '<div style="border:1px solid var(--color-border-strong); padding:12px 14px; margin-bottom:var(--s-4); background:var(--color-surface-2);">' +
            '<div class="ckpt-m-sec" style="margin-bottom:8px;">New MAC rule — F0 · Counted (minimum equipment)</div>' +
            '<div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:10px;">' +
            '<select class="state-select" onchange="macDraftSet(\'subId\', this.value)"><option value="">— aircraft function —</option>' +
            subs.map(s => '<option value="' + esc(s.id) + '"' + (_macDraft.subId === s.id ? ' selected' : '') + '>' + esc(s.label) + '</option>').join('') + '</select>' +
            '<select class="state-select" onchange="macDraftSet(\'phase\', this.value)">' +
            phases.map(p => '<option' + (_macDraft.phase === p ? ' selected' : '') + '>' + esc(p) + '</option>').join('') + '</select></div>' +
            '<div style="font-size:12px; color:var(--color-text-secondary); margin-bottom:6px;">MAC holds when <strong>every clause</strong> holds:</div>';
        _macDraft.clauses.forEach((cl, i) => {
            html += '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:6px 0; border-bottom:1px solid var(--color-border-hair);">' +
                '<select class="state-select" style="width:90px;" onchange="macDraftClauseMin(' + i + ', this.value)">' +
                [1, 2, 3].map(n => '<option value="' + n + '"' + ((cl.min || 1) === n ? ' selected' : '') + '>≥ ' + n + ' of</option>').join('') + '</select>' +
                (systemsData || []).map(s => {
                    // 21 Aug 2026 (B6) — MAC members are system FUNCTIONS (ARP4761A
                    // Q.4-1 granularity): the checkboxes are the system's declared
                    // functions, grouped under a muted system label. A system with
                    // no declared functions offers nothing — declaring one is the
                    // prerequisite, never a bare-system fallback.
                    const fns = (s.functions || []).filter(f => f && f.funcId);
                    if (!fns.length) return '<span style="font-size:11px; color:var(--color-text-tertiary);" title="Declare functions on this system (system directory) to offer them as MAC members">' + esc(s.name) + ': no functions declared</span>';
                    return '<span style="display:inline-flex; align-items:center; gap:6px; flex-wrap:wrap; padding:1px 6px; border:1px solid var(--color-border-hair); border-radius:4px;">' +
                        '<span style="font-size:10.5px; color:var(--color-text-tertiary); font-family:var(--font-mono);">' + esc(s.name) + '</span>' +
                        fns.map(f => '<label style="display:inline-flex; align-items:center; gap:4px; font-size:12px; cursor:pointer;"><input type="checkbox" ' + (cl.of.indexOf(f.funcId) !== -1 ? 'checked' : '') + ' onchange="macDraftToggleMember(' + i + ', \'' + esc(f.funcId) + '\')"> ' + esc(f.funcName || f.funcId) + '</label>').join('') + '</span>';
                }).join(' ') +
                '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 8px; margin-left:auto;" onclick="macDraftRemoveClause(' + i + ')">remove clause</button></div>';
        });
        html += '<div style="display:flex; gap:8px; margin-top:10px;">' +
            '<button class="ckpt-m-btn" onclick="macDraftAddClause()">+ AND clause</button>' +
            '<button class="ckpt-m-btn ckpt-m-btn-primary" onclick="macSaveDraft()">Save rule (signed, as assumption)</button>' +
            '<button class="ckpt-m-btn" onclick="macCancelDraft()">Cancel</button></div></div>';
    } else {
        html += '<div style="margin-bottom:var(--s-4);"><button class="ckpt-m-btn ckpt-m-btn-primary" onclick="macStartDraft()">+ New MAC rule</button></div>';
    }

    // ---- rules table ----
    if (!rules.length) {
        html += '<p style="color: var(--color-text-tertiary); font-size: 13px;">No MAC rules yet. Start at F0 (Counted): pick a function and state its minimum surviving equipment — the breach set compiles instantly, single-point findings included. Numbers can replace judgment later (F2 · Measured) without losing anything.</p>';
    } else {
        html += '<table class="data-table" style="width:100%; font-size:12.5px;"><thead><tr><th>Function</th><th>Phase</th><th>Level</th><th>MAC holds when</th><th>Breach set</th><th>Substantiation</th><th></th></tr></thead><tbody>';
        rules.forEach(r => {
            const bcheck = macBreachSetsChecked(r);
            const breaches = bcheck.sets;
            const spf = breaches.filter(b => b.length === 1);
            const sub = subs.find(s => s.id === r.subId);
            const bLabel = k => k.indexOf('deg:') === 0 ? esc(k.slice(4).replace(':', ' ⤵ ')) : esc(_macSysName(k));
            const bTxt = bcheck.error
                ? '<span style="color:var(--color-danger); font-weight:600; font-size:11px;">' + esc(bcheck.error) + '</span>'
                : (breaches.length
                    ? breaches.slice(0, 6).map(b => '<span class="u-mono" style="font-size:11px;' + (b.length === 1 ? ' color:var(--color-danger); font-weight:600;' : '') + '">{' + b.map(bLabel).join(' ∧ ') + '}</span>').join(' , ') + (breaches.length > 6 ? ' … +' + (breaches.length - 6) : '')
                    : '—');
            const subst = (r.substantiation && r.substantiation.kind === 'sdd')
                ? '<span class="sla-stamp" style="color: var(--color-success);">SDD</span> <span class="u-mono" style="font-size:11px;">' + esc(r.substantiation.ref) + '</span>'
                : '<span class="sla-stamp" style="color: var(--color-warning);">ASSUMED</span>';
            const lvl = (typeof macRuleLevel === 'function') ? macRuleLevel(r) : (r.level || 0);
            const fidAssumed = macFidAssumed(r).length;
            // 21 Aug 2026 (B6) — validateMembers finally wired with the resolver it
            // was designed for: bare-SYSTEM members and unresolvable members are
            // findings, each with an inline re-point control (previewed, signed).
            const mchk = (typeof window !== 'undefined' && window.SLMacLanes && window.SLFnResolve)
                ? SLMacLanes.validateMembers(r, SLFnResolve.resolve)
                : { ok: true, systems: [], unknown: [], findings: [] };
            html += '<tr>' +
                '<td>' + esc(sub ? sub.label : r.subId) + '</td>' +
                '<td>' + esc(r.phase || 'All') + '</td>' +
                '<td><span class="sla-stamp" style="color: var(--color-accent);">F' + lvl + '</span>' + (lvl > 0 && fidAssumed ? '<div style="font-size:10px; color:#9A6200; font-weight:600;">' + fidAssumed + ' ASSUMED</div>' : '') + '</td>' +
                '<td>' + (r.clauses || []).map(cl => _macClauseChips(cl, r)).join(' AND ') + '</td>' +
                '<td>' + breaches.length + ' combos' + (spf.length ? ' · <span style="color:var(--color-danger); font-weight:600;">' + spf.length + ' SPF</span>' : '') + '<div>' + bTxt + '</div></td>' +
                '<td>' + subst + '</td>' +
                '<td style="white-space:nowrap;"><button class="ckpt-m-btn" style="font-size:11px; padding:2px 8px;" onclick="macFidToggle(\'' + esc(r.id) + '\')">' + (_macFidOpen[r.id] ? 'Fidelity ▴' : 'Fidelity F1/F2 ▾') + '</button> ' +
                '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 8px;" onclick="macSubstantiate(\'' + esc(r.id) + '\')">' + (r.substantiation && r.substantiation.kind === 'sdd' ? 'Revert' : 'Substantiate') + '</button> ' +
                '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 8px;" onclick="macDeleteRule(\'' + esc(r.id) + '\')">✕</button></td></tr>';
            if (!mchk.ok) {
                const rp = mchk.systems.map(m => {
                    const fns = SLFnResolve.functionsOf(m);
                    return '<div style="margin:3px 0;">&ldquo;' + esc(_macSysName(m)) + '&rdquo; is a SYSTEM &mdash; MAC is declared per system FUNCTION (a system performs several functions with different minimums). Re-point at: ' +
                        (fns.length
                            ? '<select class="state-select" style="max-width:300px;" onchange="macRepointMember(\'' + esc(r.id) + '\',\'' + esc(m) + '\', this.value)"><option value="">&mdash; choose its function &mdash;</option>' +
                              fns.map(f => '<option value="' + esc(f.funcId) + '">' + esc(f.funcName || f.funcId) + '</option>').join('') + '</select>'
                            : '<i>declare functions on this system first</i>') + '</div>';
                }).join('');
                const un = mchk.unknown.map(m => '<div style="margin:3px 0;">Member &ldquo;' + esc(m) + '&rdquo; resolves to nothing &mdash; deleted or renamed. Remove it or restore the function.</div>').join('');
                html += '<tr><td colspan="7" style="background:var(--color-surface-2); border-left:3px solid #9A6200; padding:8px 16px; font-size:12px; color:var(--color-text-secondary);"><b style="color:#9A6200;">Member granularity &mdash; ' + (mchk.systems.length + mchk.unknown.length) + ' finding(s)</b>' + rp + un + '</td></tr>';
            }
            if (_macFidOpen[r.id]) html += '<tr><td colspan="7" style="background:var(--color-surface-2); border-left:3px solid var(--color-text-primary); padding:10px 16px;">' + _macFidEditorHtml(r) + '</td></tr>';
        });
        html += '</tbody></table>';
        html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">Breach set = minimal failure combinations defeating the rule (F0 Counted: every (n−min+1)-subset · F1 Weighted / F2 Measured: minimal damage assignments driving surviving capacity below the floor; degraded states are their own events; loss dominates degraded — never double-counted; subsumption-reduced). Red singletons are single-point MAC breaches. Every compile is equivalence-proven against these sets.</p>';
    }
    host.innerHTML = html;
}

// ============================================================================
// D2 (L1/L2) — the fidelity editor. Floors and weights are SDD INPUTS with an
// assumption fallback: every value is either substantiated ('sdd:<ref>') or
// recorded ASSUMED (the conservative-default banner tracks the latter). Edits
// change the rule fingerprint → the compiled tree goes stale → recompiling
// diffs the breach set (the fidelity-upgrade diff) and re-proves equivalence.
// ============================================================================
let _macFidOpen = {};
function macFidToggle(id) { _macFidOpen[id] = !_macFidOpen[id]; renderMacPage(); }
function _macFidRule(id) { return _macStore().find(r => r.id === id); }
function _macFidAfter(rule) {
    rule.level = (typeof macRuleLevel === 'function') ? macRuleLevel(rule) : (rule.level || 0);
    try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    renderMacPage();
    try { if (typeof renderMfmsPanel === 'function') renderMfmsPanel(); } catch (_) {}
}
function macFidSetFloor(id, ci, v) {
    const r = _macFidRule(id); if (!r || !r.clauses || !r.clauses[ci]) return;
    const f = parseFloat(v);
    if (v === '' || !isFinite(f) || f <= 0) delete r.clauses[ci].floor; else r.clauses[ci].floor = f;
    _macFidAfter(r);
}
function macFidSetWeight(id, ci, sysId, v) {
    const r = _macFidRule(id); if (!r || !r.clauses || !r.clauses[ci]) return;
    const cl = r.clauses[ci];
    const w = parseFloat(v);
    if (!cl.weights) cl.weights = {};
    if (v === '' || !isFinite(w) || w <= 0 || w === 1) delete cl.weights[sysId]; else cl.weights[sysId] = w;
    if (!Object.keys(cl.weights).length) delete cl.weights;
    _macFidAfter(r);
}
async function macFidSetBasis(id, ci, key, kind) {
    const r = _macFidRule(id); if (!r || !r.clauses || !r.clauses[ci]) return;
    const cl = r.clauses[ci];
    if (!cl.basis) cl.basis = {};
    if (kind === 'sdd') {
        let ref = '';
        try { ref = (typeof slPrompt === 'function') ? await slPrompt('SDD reference substantiating this value (doc / §):', '') : window.prompt('SDD reference:', ''); } catch (_) {}
        if (!ref || !String(ref).trim()) return renderMacPage();   // no ref → stays assumed
        cl.basis[key] = 'sdd:' + String(ref).trim();
    } else cl.basis[key] = 'assumed';
    _macFidAfter(r);
}
function macFidAddDeg(id) {
    const r = _macFidRule(id); if (!r) return;
    const members = [...new Set((r.clauses || []).flatMap(c => c.of || []))];
    if (!members.length) return;
    if (!Array.isArray(r.degraded)) r.degraded = [];
    r.degraded.push({ sysId: members[0], label: 'degraded', weight: 0.5, basis: 'assumed' });
    _macFidAfter(r);
}
async function macFidSetDeg(id, i, field, v) {
    const r = _macFidRule(id); if (!r || !Array.isArray(r.degraded) || !r.degraded[i]) return;
    const d = r.degraded[i];
    if (field === 'weight') { const w = parseFloat(v); if (isFinite(w) && w >= 0) d.weight = w; }
    else if (field === 'basis') {
        if (v === 'sdd') {
            let ref = '';
            try { ref = (typeof slPrompt === 'function') ? await slPrompt('SDD reference for this degraded-state weight:', '') : window.prompt('SDD reference:', ''); } catch (_) {}
            if (!ref || !String(ref).trim()) return renderMacPage();
            d.basis = 'sdd:' + String(ref).trim();
        } else d.basis = 'assumed';
    }
    else d[field] = String(v);
    _macFidAfter(r);
}
function macFidDelDeg(id, i) {
    const r = _macFidRule(id); if (!r || !Array.isArray(r.degraded)) return;
    r.degraded.splice(i, 1);
    if (!r.degraded.length) delete r.degraded;
    _macFidAfter(r);
}
function _macFidEditorHtml(r) {
    const basisSel = (cur, onch) => {
        const sdd = _macBasisIsSdd(cur);
        return '<select class="state-select" style="width:110px; font-size:11px;" onchange="' + onch + '">' +
            '<option value="assumed"' + (!sdd ? ' selected' : '') + '>ASSUMED</option>' +
            '<option value="sdd"' + (sdd ? ' selected' : '') + '>SDD…</option></select>' +
            (sdd ? ' <span class="u-mono" style="font-size:10px; color:var(--color-text-tertiary);">' + esc(String(cur).slice(4)) + '</span>' : '');
    };
    let h = '<div style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-bottom:8px;">F1 · Weighted = member multipliers + degraded states · F2 · Measured = scalar capacity floor from the SDD. Every value is SDD-substantiated or ASSUMED (conservative). Edits mark the compiled tree stale — recompile to diff the breach set and re-prove equivalence.</div>';
    (r.clauses || []).forEach((cl, ci) => {
        h += '<div style="border:1px solid var(--color-border-hair); padding:8px 10px; margin-bottom:8px;">' +
            '<div style="font-size:11px; font-weight:700; margin-bottom:6px;">Clause ' + (ci + 1) + ' — F2 floor: ' +
            '<input type="number" step="any" min="0" value="' + (cl.floor != null ? cl.floor : '') + '" placeholder="count (≥' + (cl.min || 1) + ')" style="width:110px; font-size:11.5px; padding:2px 6px;" onchange="macFidSetFloor(\'' + esc(r.id) + '\',' + ci + ', this.value)"> ' +
            (cl.floor != null ? basisSel((cl.basis || {}).floor, 'macFidSetBasis(\'' + esc(r.id) + '\',' + ci + ',\'floor\', this.value)') : '<span style="font-size:10px; color:var(--color-text-tertiary);">blank = F0 counting semantics</span>') + '</div>' +
            '<div style="display:flex; gap:14px; flex-wrap:wrap;">' +
            (cl.of || []).map(sysId => {
                const w = (cl.weights && +cl.weights[sysId] > 0) ? +cl.weights[sysId] : 1;
                return '<div style="font-size:11.5px;">' + esc(_macSysName(sysId)) +
                    ' <input type="number" step="any" min="0" value="' + w + '" title="F1 multiplier / F2 capacity" style="width:70px; font-size:11.5px; padding:2px 6px;" onchange="macFidSetWeight(\'' + esc(r.id) + '\',' + ci + ',\'' + esc(sysId) + '\', this.value)"> ' +
                    (w !== 1 ? basisSel((cl.basis || {})[sysId], 'macFidSetBasis(\'' + esc(r.id) + '\',' + ci + ',\'' + esc(sysId) + '\', this.value)') : '') + '</div>';
            }).join('') + '</div></div>';
    });
    h += '<div style="font-size:11px; font-weight:700; margin:8px 0 4px;">Degraded states <span style="font-weight:400; color:var(--color-text-tertiary);">(retained capacity when partially failed — unmodeled states count as full loss)</span></div>';
    (r.degraded || []).forEach((d, i) => {
        const members = [...new Set((r.clauses || []).flatMap(c => c.of || []))];
        h += '<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; font-size:11.5px; margin-bottom:4px;">' +
            '<select class="state-select" style="width:150px; font-size:11px;" onchange="macFidSetDeg(\'' + esc(r.id) + '\',' + i + ',\'sysId\', this.value)">' +
            members.map(m => '<option value="' + esc(m) + '"' + (d.sysId === m ? ' selected' : '') + '>' + esc(_macSysName(m)) + '</option>').join('') + '</select>' +
            '<input type="text" value="' + esc(d.label || '') + '" placeholder="state label" style="width:140px; font-size:11.5px; padding:2px 6px;" onchange="macFidSetDeg(\'' + esc(r.id) + '\',' + i + ',\'label\', this.value)">' +
            'retains <input type="number" step="any" min="0" value="' + (d.weight != null ? d.weight : 0) + '" style="width:70px; font-size:11.5px; padding:2px 6px;" onchange="macFidSetDeg(\'' + esc(r.id) + '\',' + i + ',\'weight\', this.value)">' +
            basisSel(d.basis, 'macFidSetDeg(\'' + esc(r.id) + '\',' + i + ',\'basis\', this.value)') +
            '<button class="ckpt-m-btn" style="font-size:10px; padding:1px 8px;" onclick="macFidDelDeg(\'' + esc(r.id) + '\',' + i + ')">✕</button></div>';
    });
    h += '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 10px;" onclick="macFidAddDeg(\'' + esc(r.id) + '\')">+ degraded state</button>';
    return h;
}

function _ckptRefresh(key) {
    // Re-render whichever surface is showing this assessment.
    const pageView = document.getElementById('view-' + key.toLowerCase());
    if (pageView && pageView.style.display !== 'none' && typeof renderCockpitPage === 'function' && _CKPT_PAGE_KEYS[key.toLowerCase()]) {
        renderCockpitPage(key);
        return;
    }
    openCockpitModal(key);
}

function renderCockpitPage(key) {
    const host = document.getElementById('ckpt-page-' + key.toLowerCase());
    if (!host) return;
    let phases;
    try { phases = applyCockpitStatuses(computePhaseStatus()); } catch (_) { return; }
    const p = phases[key];
    const d = _ckptDetail(key);
    if (!p || !d) { host.innerHTML = ''; return; }
    const cl = p.checklist || evalCkptChecklist(key, phases);
    const pct = Math.round(Math.max(0, Math.min(1, p.ratio || 0)) * 100);
    const CL_ICONS = { pass: '✓', fail: '✕', attested: '✍', open: '·', planned: '·', tailored: '⊘' };

    const row = r => {
        const click = r.tab ? ' onclick="switchTab(\'' + esc(r.tab) + '\')" style="cursor:pointer;"' : '';
        return '<div class="ckpt-m-row' + (r.planned ? ' ckpt-m-planned' : '') + '"' + click + '>' +
            '<span>' + esc(r.t) + (r.tab ? ' <span style="color:var(--color-accent); font-size:11px;">→</span>' : '') + '</span>' +
            '<span class="ckpt-m-val">' + esc(r.v) + '</span></div>';
    };
    const clRow = i => {
        const click = (i.state === 'open' || i.state === 'attested')
            ? ' onclick="ckptAttest(\'' + esc(key) + '\',\'' + esc(i.id) + '\')" style="cursor:pointer;"' : '';
        return '<div class="ckpt-m-row ckpt-cl-' + esc(i.state) + '"' + click + ' title="' + esc(i.ref) + '">' +
            '<span><span class="ckpt-cl-ic">' + CL_ICONS[i.state] + '</span> <span class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary);">' + esc(i.ref) + '</span> ' + esc(i.label) + '</span>' +
            '<span class="ckpt-m-val">' + esc(i.state === 'open' ? 'attest →' : i.detail) + '</span></div>';
    };
    const satisfied = cl.items.filter(i => i.state === 'pass' || i.state === 'attested').length;
    const gateTotal = cl.items.filter(i => i.state !== 'planned').length;

    const h = p.handoff;
    let handBtn;
    if (p.status === 'handed-off') handBtn = '<button class="ckpt-m-btn" disabled title="Baseline ' + esc((h && h.hash || '').slice(0, 12)) + '…">Baselined ✓ ' + esc(h ? h.at.slice(0, 10) : '') + '</button>';
    else if (cl.ready) handBtn = '<button class="ckpt-m-btn ckpt-m-btn-hand" onclick="ckptHandOff(\'' + esc(key) + '\')">' + (p.status === 'reopened' ? 'Re-baseline' : 'Baseline this assessment') + '</button>';
    else handBtn = '<button class="ckpt-m-btn" disabled title="Satisfy the completion checklist first">Baseline this assessment</button>';

    host.innerHTML =
        '<div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom: var(--s-3);">' +
        '<span class="ckpt-chip ckpt-chip-' + esc(p.status) + '">' + esc(CKPT_STATUS_LABEL[p.status] || '') + '</span>' +
        '<span class="u-mono" style="font-size:12px; color:var(--color-text-tertiary);">' + esc(p.progress) + '</span>' +
        (h ? '<span class="u-mono" style="font-size:11px; color:var(--color-text-tertiary);">baseline ' + esc((h.hash || '').slice(0, 12)) + '… · signed ' + esc(h.by || '') + '</span>' : '') +
        '<span style="margin-left:auto; display:flex; gap:8px;">' + handBtn +
        (window.Reports && typeof Reports.open === 'function' ? '<button class="ckpt-m-btn ckpt-m-btn-primary" onclick="try { Reports.open(\'' + esc(key) + '\'); } catch(e) { showToast(\'No report template yet\', \'info\', 2500); }">Generate report</button>' : '') +
        '</span></div>' +
        '<div class="ckpt-bar" style="margin-bottom: var(--s-4);"><div class="ckpt-bar-fill st-' + esc(p.status) + '" style="width:' + pct + '%"></div></div>' +
        '<div style="display:grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: var(--s-5);">' +
        '<div>' +
        '<div class="ckpt-m-sec">Inputs</div>' + d.inputs.map(row).join('') +
        '<div class="ckpt-m-sec" style="margin-top: var(--s-4);">' + esc(d.clause) + ' — ' + satisfied + ' of ' + gateTotal + ' satisfied</div>' + cl.items.map(clRow).join('') +
        '</div>' +
        '<div>' +
        '<div class="ckpt-m-sec">Activities</div>' + d.activities.map(row).join('') +
        '<div class="ckpt-m-sec" style="margin-top: var(--s-4);">Outputs</div>' +
        '<div class="ckpt-m-row"><span class="u-mono" style="font-size:12px;">' + esc(d.outputs) + '</span></div>' +
        '</div></div>';
}

function updateDashboard() {
    try {
        // Phase 53.70 — render the ARP 4761A process strip first so it lands above
        // the headline tiles and worklist.
        try { renderProcessStrip(); } catch(_) {}

        // Aggregate per-system data once.
        const allSysAsm = systemsData.flatMap(s => s.asm);
        const allSysReq = systemsData.flatMap(s => s.req);
        const allSysFha = systemsData.flatMap(s => s.fha);

        // Hazard severity buckets (existing chart data).
        const sysSevCounts = {Catastrophic:0, Hazardous:0, Major:0, Minor:0, Negligible:0};
        allSysFha.forEach(d => { if (sysSevCounts[d.severity] !== undefined) sysSevCounts[d.severity]++; });
        const acSevCounts = {Catastrophic:0, Hazardous:0, Major:0, Minor:0, Negligible:0};
        acFhaData.forEach(d => { if (acSevCounts[d.severity] !== undefined) acSevCounts[d.severity]++; });

        // Assumption state breakdown across AC + all systems.
        const asmCounts = {Proposed: 0, Validated: 0, Verified: 0};
        [...acAssumptionsData, ...allSysAsm].forEach(a => {
            if (asmCounts[a.state] !== undefined) asmCounts[a.state]++;
        });
        const asmTotal = asmCounts.Proposed + asmCounts.Validated + asmCounts.Verified;

        // Requirement level breakdown across AC + all systems.
        const reqCounts = {L1: 0, L2: 0, L3: 0, L4: 0};
        [...acReqData, ...allSysReq].forEach(r => {
            if (reqCounts[r.level] !== undefined) reqCounts[r.level]++;
        });
        const reqTotal = reqCounts.L1 + reqCounts.L2 + reqCounts.L3 + reqCounts.L4;

        // Top tile metrics.
        document.getElementById('dash-asm-open').innerText = asmCounts.Proposed;
        document.getElementById('dash-asm-proposed').innerText = asmCounts.Proposed;
        document.getElementById('dash-asm-validated').innerText = asmCounts.Validated;
        document.getElementById('dash-asm-verified').innerText = asmCounts.Verified;

        document.getElementById('dash-req-total').innerText = reqTotal;
        document.getElementById('dash-req-l1').innerText = reqCounts.L1;
        document.getElementById('dash-req-l2').innerText = reqCounts.L2;
        document.getElementById('dash-req-l3').innerText = reqCounts.L3;
        document.getElementById('dash-req-l4').innerText = reqCounts.L4;

        const acCatHaz = acFhaData.filter(h => h.severity === 'Catastrophic').length;
        const sysCatHaz = allSysFha.filter(h => h.severity === 'Catastrophic').length;
        document.getElementById('dash-cat-haz').innerText = acCatHaz + sysCatHaz;
        document.getElementById('dash-cat-haz-ac').innerText = acCatHaz;
        document.getElementById('dash-cat-haz-sys').innerText = sysCatHaz;

        // Phase 62.1 (A1) — posture metrics + requirements V&V strip replace the
        // severity/lifecycle charts. Severity distribution now belongs in the
        // scoped views where it has context; the dashboard answers "where is the
        // program and what's blocking it".
        try { renderPostureMetrics(); } catch (e) { console.warn('renderPostureMetrics:', e); }
        try { renderReqVvStrip(); } catch (e) { console.warn('renderReqVvStrip:', e); }
        void asmTotal; void acSevCounts; void sysSevCounts; void reqCounts;
    } catch (err) { console.error(err); }
}

function populateDropdowns(selectId, dataArray, valProp, labelProp, isFlat = false) {
    const select = document.getElementById(selectId); if(!select) return;
    const previousValue = select.value;
    select.innerHTML = '<option value="">-- Select --</option>'; let unique = [];
    dataArray.forEach(item => { let val = item[valProp]; if(!unique.includes(val)) { unique.push(val); select.innerHTML += `<option value="${esc(val)}">${isFlat ? esc(val) : `${esc(val)}: ${esc(item[labelProp])}`}</option>`; } });
    // Restore previous selection if still valid (fixes audit Q4).
    if (previousValue && Array.from(select.options).some(o => o.value === previousValue)) select.value = previousValue;
}
function getCheckedValues(containerId) { return Array.from(document.querySelectorAll(`#${containerId} input:checked`)).map(cb => cb.value).join(', '); }
// 28 Aug 2026 — tolerant of the array shape AI-accepted rows carried before the
// phase-shape migration (String([...]) joins with commas, so one coercion covers
// both). An unhealed row must degrade to unchecked boxes, never to a TypeError
// that aborts the whole edit populate — that abort was the "Edit does nothing"
// symptom on every AI FHA row.
function setCheckedValues(containerId, commaString) { if(!commaString || (Array.isArray(commaString) && !commaString.length)) return; let vals = String(commaString).split(',').map(s => s.trim()); document.querySelectorAll(`#${containerId} input`).forEach(cb => cb.checked = vals.includes(cb.value)); }

// --- FHA phase grid (1 Aug 2026) --------------------------------------------
// The AC and System FHA forms used to carry a HARDCODED checkbox grid in
// index.html. That made the form a second phase vocabulary, disagreeing with the
// project's own Flight Phases table — and exposure normalisation reads the table,
// not the form. Ticking a box the table did not contain produced an FHA row whose
// phases matched nothing, so getPhaseExposureRatio fell open to r = 1 and the
// requirement was sized against the whole envelope. Silently.
//
// The grid is now built FROM the table. A phase cannot be put on an FHA row
// unless it exists in the project, which is what removes the need to normalise
// phase names anywhere downstream.
//
// Rebuilding is non-destructive: whatever is ticked right now survives, so this
// is safe to call from a table render, a tab switch, or mid-entry.
//
// UNKNOWN VALUES ARE KEPT, NOT DROPPED. A row imported from Excel, drafted before
// the table was edited, or carrying the "All phases" wildcard the demos use, would
// otherwise lose those phases the moment somebody opened it to edit one word.
// They render checked and flagged instead, so the engineer decides.
function renderFhaPhaseGrid(containerId, keepValue) {
    const host = document.getElementById(containerId);
    if (!host) return;
    const current = (keepValue != null && keepValue !== undefined)
        ? String(keepValue)
        : Array.from(host.querySelectorAll('input:checked')).map(cb => cb.value).join(', ');
    const sel = {};
    current.split(',').map(x => x.trim()).filter(Boolean).forEach(v => { sel[v] = 1; });

    const tbl = (typeof flightPhasesData !== 'undefined' ? flightPhasesData : []) || [];
    const nominal = [], contingency = [], known = {};
    tbl.forEach(row => {
        const n = String((row && row.phase) || '').trim();
        if (!n || known[n]) return;
        known[n] = 1;
        ((typeof isSpecialPhase === 'function' && isSpecialPhase(row)) ? contingency : nominal).push(n);
    });
    // "All phases" is a recognised legacy wildcard, not a mistake — the shipped
    // showcase projects use it, and _projectPhaseNames() in the AI lane accepts it.
    // It is deliberately NOT offered as a checkbox: ticking every box is the
    // explicit way to say "all", and an "All" box that competes with the individual
    // ones is the kind of ambiguity this whole change exists to remove. But a row
    // that already carries it must not be told it is an error.
    const WILDCARD = 'All phases';
    const wildcard = Object.keys(sel).filter(v => v.toLowerCase() === WILDCARD.toLowerCase());
    const orphans = Object.keys(sel).filter(v => !known[v] && v.toLowerCase() !== WILDCARD.toLowerCase());

    const box = (name, extra, title) =>
        `<label${title ? ' title="' + esc(title) + '"' : ''}><input type="checkbox" value="${esc(name)}"${sel[name] ? ' checked' : ''}> ${esc(name)}${extra || ''}</label>`;

    let html = '';
    if (!nominal.length && !contingency.length) {
        html = '<div style="font-size:12px; color:var(--sev-haz-fg,#b91c1c);">No flight phases defined — add them on the Flight Phases tab. Until then this failure condition cannot be exposure-normalised.</div>';
    } else {
        html += nominal.map(n => box(n)).join('');
        if (contingency.length) {
            html += '<div style="flex-basis:100%; height:0;"></div>'
                 +  '<div style="flex-basis:100%; font-size:10px; text-transform:uppercase; letter-spacing:0.07em; '
                 +  'color:var(--color-text-tertiary); font-weight:600; margin:6px 0 2px;">Contingency phases '
                 +  '<span style="text-transform:none; letter-spacing:0; font-weight:400;">— outside the nominal mission; exposure stays the full flight</span></div>';
            html += contingency.map(n => box(n, '', n + ' is a contingency phase. It is excluded from the mission duration, and a failure condition exposed here keeps the full-flight exposure window: the function had to survive the whole flight to be available when the contingency was flown.')).join('');
        }
    }
    if (wildcard.length) {
        html += '<div style="flex-basis:100%; height:0;"></div>'
             +  '<div style="flex-basis:100%; font-size:10px; text-transform:uppercase; letter-spacing:0.07em; '
             +  'color:var(--color-text-tertiary); font-weight:600; margin:6px 0 2px;">Legacy wildcard '
             +  '<span style="text-transform:none; letter-spacing:0; font-weight:400;">\u2014 no phase restriction, so no exposure normalisation; tick the individual phases instead to get it</span></div>';
        html += wildcard.map(n => box(n, '', 'A legacy value meaning "not restricted to any phase". It matches no row in the phase table, so the exposure window stays the full flight. Ticking the individual phases this condition is exposed in is what enables exposure normalisation.')).join('');
    }
    if (orphans.length) {
        html += '<div style="flex-basis:100%; height:0;"></div>'
             +  '<div style="flex-basis:100%; font-size:10px; text-transform:uppercase; letter-spacing:0.07em; '
             +  'color:var(--sev-haz-fg,#b91c1c); font-weight:600; margin:6px 0 2px;">Not in this project\u2019s phase table '
             +  '<span style="text-transform:none; letter-spacing:0; font-weight:400;">— kept so the row is not silently altered; add it on the Flight Phases tab or untick it</span></div>';
        html += orphans.map(n => box(n, ' \u26a0', 'Not a phase in this project. It matches nothing during exposure normalisation, so this condition is sized against the whole flight envelope.')).join('');
    }
    host.innerHTML = html;
}

// Keep both FHA forms in step with the table without disturbing anything ticked.
function refreshFhaPhaseGrids() {
    renderFhaPhaseGrid('ac-fha-phases');
    renderFhaPhaseGrid('sys-fha-phases');
}


// ==========================================
// SYSTEM SAFETY DIRECTORY LOGIC
// ==========================================
async function promptCreateSystem() {
    const sysName = await slPrompt("Enter new system or ATA chapter name (e.g., 'Primary Flight Displays'):");
    if(sysName && sysName.trim() !== "") {
        // Phase 63.4 — system role (ARP4761A B.4.3.2): resource systems provide common
        // resources (electrical, hydraulic, IMA…); function providers implement aircraft
        // functions; 'both' does both. Drives the common-resources matrix shape.
        const roleIn = (await slPrompt("System role — one of: function / resource / both\n\n• function — implements aircraft functions (default)\n• resource — provides a common resource (electrical, hydraulic, IMA, air data…)\n• both", 'function')) || 'function';
        const role = /^r/i.test(roleIn) ? 'resource' : /^b/i.test(roleIn) ? 'both' : 'function';
        const newSys = { id: 'sys-' + Date.now(), name: sysName.trim(), role, asmCounter: 1, functions: [], fcim: [], extractedFCs: [], fha: [], req: [], asm: [] };
        systemsData.push(newSys);
        // The plan is seeded from the aircraft scope, then shown — inheritance
        // becomes a decision the engineer sees and can tailor, instead of a
        // silent default nobody could find. (#15)
        try { if (window.PROGRAM_PLAN) PROGRAM_PLAN.initSystemPlan(newSys.id, null); } catch (_) {}
        renderSystemDirectory();
        try { if (window.PROGRAM_PLAN && PROGRAM_PLAN.openSystemPlanModal) PROGRAM_PLAN.openSystemPlanModal(newSys.id); } catch (_) {}
    }
}

// Phase 63.4 — cycle a system's role from the directory card badge.
function cycleSystemRole(sysId) {
    const s = (systemsData || []).find(x => x.id === sysId);
    if (!s) return;
    s.role = s.role === 'function' || !s.role ? 'resource' : s.role === 'resource' ? 'both' : 'function';
    try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    renderSystemDirectory();
    if (typeof showToast === 'function') showToast(s.name + ' → ' + (s.role === 'resource' ? 'resource system' : s.role === 'both' ? 'resource + function provider' : 'function provider'), 'info', 2200);
}

function _sysRoleBadge(s) {
    const role = s.role || 'function';
    const label = role === 'resource' ? '⚡ resource' : role === 'both' ? '⚡+ƒ both' : 'ƒ function';
    const color = role === 'function' ? 'var(--color-text-tertiary)' : 'var(--color-accent)';
    return '<span class="sys-folder-metrics" style="cursor:pointer; color:' + color + ';" title="System role — click to cycle (function / resource / both). Resource systems provide common resources (B.4.3.2)." onclick="event.stopPropagation(); cycleSystemRole(\'' + esc(s.id) + '\')">' + label + '</span>';
}

function renderSystemDirectory() {
    try { if (typeof _renderSidebarContext === 'function') _renderSidebarContext(); } catch(_) {}
    const grid = document.getElementById('sys-directory-grid'); grid.innerHTML = '';
    // Workspace governance card moved to the Admin nav group (Admin → Workspaces & Locks → openWorkspacesPanel()).
    systemsData.forEach(s => {
        let funcCount = s.functions.length; let hazCount = s.fha.length; let reqCount = s.req.length;
        let lockBadge = '';
        try { const lk = s.lock; if (lk) lockBadge = `<span class="sys-folder-metrics" style="background:#fde7e9;color:#b3261e;">🔒 ${esc(lk.name || lk.by || 'locked')}</span>`; else if (s.owner) lockBadge = `<span class="sys-folder-metrics" style="background:#e7f0ff;color:#0b57d0;">👤 ${esc(String(s.owner).split('@')[0])}</span>`; } catch (_) {}
        grid.innerHTML += `
            <div class="sys-folder-card sys-card-nav" onclick="openSystemWorkspace('${esc(s.id)}')">
                <h4 class="sys-folder-title">📁 ${esc(s.name)}</h4>
                <div style="display:flex; gap: 5px; flex-wrap: wrap;">
                    ${_sysRoleBadge(s)}
                    <span class="sys-folder-metrics">Func: ${funcCount}</span>
                    <span class="sys-folder-metrics">Haz: ${hazCount}</span>
                    <span class="sys-folder-metrics">Req: ${reqCount}</span>
                    ${lockBadge}
                </div>
            </div>`;
    });
}

function openSystemWorkspace(id) {
    activeSystemId = id; const s = sys(); document.getElementById('ws-sys-title').textContent = s ? `Workspace: ${s.name}` : 'System Workspace';
    try { if (window.PROGRAM_PLAN) PROGRAM_PLAN.renderSystemWorkspaceBanner(id); } catch (_) {}
    switchTab('sys-workspace'); switchWorkspaceTab('func');
}

// Phase 75.1 — populate the sidebar's contextual sub-lists (Systems, Fault Trees) from
// live data, reusing the existing open handlers. Additive + guarded; pure navigation.
function _renderSidebarContext() {
    try {
        const cur = (typeof window !== 'undefined' && window._slCurrentTab) ? window._slCurrentTab : '';
        // Systems Safety — one row per system folder.
        const sysHost = document.getElementById('asb-sys-list');
        if (sysHost) {
            sysHost.innerHTML = '';
            const list = (typeof systemsData !== 'undefined' && systemsData) ? systemsData : [];
            if (!list.length) {
                sysHost.innerHTML = '<div class="asb-empty">No systems yet</div>';
            } else {
                list.forEach(s => {
                    const a = document.createElement('a');
                    a.className = 'asb-item sub' + (s.id === activeSystemId ? ' snav-active' : '');
                    a.setAttribute('role', 'button'); a.tabIndex = 0;
                    a.onclick = () => openSystemWorkspace(s.id);
                    a.innerHTML = '<span class="asb-lbl">' + esc(s.name || '(unnamed system)') + '</span>';
                    sysHost.appendChild(a);
                });
            }
            // + Add New System action at the bottom of the Systems Safety nav list.
            const addSys = document.createElement('a');
            addSys.className = 'asb-item sub asb-add-system';
            addSys.setAttribute('role', 'button'); addSys.tabIndex = 0;
            addSys.onclick = () => { try { if (typeof promptCreateSystem === 'function') promptCreateSystem(); } catch (_) {} };
            addSys.innerHTML = '<span class="asb-lbl">+ Add New System</span>';
            sysHost.appendChild(addSys);
        }
        // Fault Tree Analysis — relocate the REAL pane into the sidebar (move whole pane),
        // so Search / + New Fault Tree / delete / subtree-expand all come with it and the
        // FTA canvas gets the full width. Move it back to the FTA layout in classic mode.
        try {
            const pane = document.querySelector('.fta-sidebar');
            const fhost = document.getElementById('asb-fta-list');
            const flayout = document.querySelector('.fta-layout');
            if (pane) {
                if (document.body.classList.contains('nav-sidebar') && fhost) {
                    if (pane.parentNode !== fhost) fhost.appendChild(pane);
                } else if (flayout) {
                    if (pane.parentNode !== flayout) flayout.insertBefore(pane, flayout.firstChild);
                }
            }
        } catch (_) {}
        // Auto-expand the CHAIN of groups containing the active tab (Rev C nav,
        // 15 Aug 2026: Analyze > Aircraft [AFHA | PASA | ASA] / Systems / RAM).
        const openIf = (gid, cond) => { const g = document.getElementById(gid); if (g && cond) g.open = true; };
        const inAfha = cur.indexOf('ac-') === 0;
        // 2 Sep 2026 (Waqas: "when I select some of the stuff in the HF drop down it also
        // opens aircraft level analyses") — Human Factors has been its OWN top-level group
        // (asb-grp-hf) since the HF lanes multiplied, but the three original HF tabs were
        // still listed here under PASA from before that move, so picking them expanded
        // Aircraft-level and PASA instead; the seven newer HF tabs were listed nowhere and
        // expanded nothing. Both are the same defect — a hand-maintained list drifting from
        // the DOM — so HF is now matched by PREFIX, like the AFHA group is, and the next
        // HF lane is covered the day it is born.
        const inPasa = ['pasa','fta','markov','eta','zsa','pra','cma','cea','routing','ipledger','stpa','mlas'].indexOf(cur) >= 0;
        const inHf   = cur.indexOf('hfa') === 0;
        const inAsa  = ['asa','ccmr','mmel','sse'].indexOf(cur) >= 0;
        const inSys  = ['sys-dir','sys-workspace','pssa','ssa','fmes','items'].indexOf(cur) >= 0;
        const inRam  = cur.indexOf('ram-') === 0 || ['library','rbd-mc','rel-frameworks','swrel','sneak','lcc'].indexOf(cur) >= 0;
        const inMx   = ['ram-mx','ram-msg3','msg3x','ram-pmopt','ram-test','ram-lora'].indexOf(cur) >= 0;
        openIf('asb-grp-sys', inAfha || inPasa || inAsa || inSys || inRam);
        openIf('asb-grp-aircraft', inAfha || inPasa || inAsa);
        openIf('asb-grp-afha', inAfha);
        openIf('asb-grp-pasa', inPasa);
        openIf('asb-grp-hf', inHf);
        openIf('asb-grp-asa', inAsa);
        openIf('asb-grp-systems', inSys);
        openIf('asb-grp-ram', inRam);
        openIf('asb-grp-ram-mx', inMx);
        openIf('asb-grp-fta', cur === 'fta');
    } catch (e) { /* sidebar context is a convenience layer — never block navigation */ }
}

// Open a specific fault-tree page from anywhere (mirrors the in-pane tree click).
function openFTAPageById(id) {
    const page = (typeof ftaPages !== 'undefined' && ftaPages ? ftaPages : []).find(p => p.id === id);
    if (!page) return;
    if (typeof switchTab === 'function') switchTab('fta');
    activeFTAPageId = page.id;
    if (typeof syncFtaConfigFromActivePage === 'function') syncFtaConfigFromActivePage();
    if (typeof renderFTASidebar === 'function') renderFTASidebar();
    if (typeof updateD3 === 'function') updateD3();
    try { selectedNodeData = null; } catch(_) {}
    const ncp = document.getElementById('node-config-panel'); if (ncp) ncp.style.display = 'none';
    if (typeof refreshTreeLevelDropdown === 'function') refreshTreeLevelDropdown();
}

function _syncAcWorkspaceNav(tabId) {
    const header = document.getElementById('ac-workspace-header');
    if (!header) return;
    const sub = AC_WORKSPACE_TABS[tabId];
    if (!sub) {
        header.style.display = 'none';
        return;
    }
    header.style.display = 'block';
    // Move the header right above the active view so it visually anchors the workspace.
    const activeView = document.getElementById('view-' + tabId);
    if (activeView && activeView.parentNode && header.nextElementSibling !== activeView) {
        try { activeView.parentNode.insertBefore(header, activeView); } catch(_) {}
    }
    ['func','fcim','fha','req','asm'].forEach(s => {
        const btn = document.getElementById('ac-ws-tab-' + s);
        if (btn) {
            if (s === sub) btn.classList.add('active');
            else btn.classList.remove('active');
        }
    });
}

function switchWorkspaceTab(subTab) {
    _ensureFmeaWorkspaceHost();   // make sure ws-view-fmea exists before we toggle views
    const tabs = ['func', 'fcim', 'fha', 'req', 'asm', 'fmea', 'pssa'];
    tabs.forEach(t => {
        const view = document.getElementById(`ws-view-${t}`);
        if (view) view.style.display = (t === subTab) ? 'block' : 'none';
        let btn = document.getElementById(`ws-tab-${t}`); if(btn) { if(t === subTab) btn.classList.add('active'); else btn.classList.remove('active'); }
    });

    if(!sys()) return;

    if(subTab === 'func') { renderSysFunctions(); populateSysFuncTraceDropdown(); }
    if(subTab === 'fcim') { renderSysFCIM(); populateDropdowns('sys-fcim-subfunc', sys().functions, 'funcId', 'funcName'); }
    if(subTab === 'fha') { renderSysFHA(); populateDropdowns('sys-fha-ac-trace', acFhaData, 'fcId', 'fcDesc'); populateDropdowns('sys-fha-subfunc', sys().functions, 'funcId', 'funcName'); populateDropdowns('sys-fha-fcid', sys().extractedFCs, 'id', 'id', true); if (typeof _refreshFhaFcOptions === 'function') _refreshFhaFcOptions('sys'); populateFhaAsmDropdown('sys'); }
    if(subTab === 'req') { renderSysReq(); populateDropdowns('sys-req-trace', sys().functions, 'funcId', 'funcName'); _populateReqParentPicker('sys'); }
    if(subTab === 'pssa') { try { renderWsPssaPanel(); } catch(e) { console.warn('renderWsPssaPanel:', e); } }
    if(subTab === 'asm') { renderSysAssumptions(); }
    if(subTab === 'fmea') { _prepFmeaForSystemContext(); if (typeof renderFMEA === 'function') renderFMEA(); }
}

// Phase 68 — FMEA is a per-system analysis living ONLY inside a System Folder (no
// aircraft-level FMEA). Rather than duplicate the large FMEA markup, we relocate the
// existing #view-fmea node into a workspace host so every field id + handler still works.
function _ensureFmeaWorkspaceHost() {
    let host = document.getElementById('ws-view-fmea');
    if (!host) {
        const anchor = document.getElementById('ws-view-func');
        if (!anchor || !anchor.parentNode) return null;
        host = document.createElement('div');
        host.id = 'ws-view-fmea';
        host.style.display = 'none';
        anchor.parentNode.appendChild(host);
    }
    const v = document.getElementById('view-fmea');
    if (v) {
        if (v.parentNode !== host) host.appendChild(v);
        v.style.display = 'block';   // keep it visible inside the host even if switchTab's loop toggled it off
    }
    return host;
}
// Strip the now-irrelevant scope chrome and force piece-part mode: per-system FMEA is
// item-level only (functional dropped) and always belongs to the open system.
function _prepFmeaForSystemContext() {
    const v = document.getElementById('view-fmea');
    if (!v) return;
    try { if (typeof _applyFmeaModeUI === 'function') _applyFmeaModeUI('piece-part'); } catch (_) {}
    const modeBtn = document.getElementById('fmea-mode-functional');
    const modeBar = modeBtn ? modeBtn.parentNode : null;        // the Functional/Piece-Part segmented control
    if (modeBar) modeBar.style.display = 'none';
    const chips = v.querySelector('.ar-filter-bar'); if (chips) chips.style.display = 'none';   // scope chips
    const scopeRow = document.getElementById('fmea-scope-row'); if (scopeRow) scopeRow.style.display = 'none';
    const s = (typeof sys === 'function') ? sys() : null;
    const h = v.querySelector('.header-with-export h3');
    if (h && s) h.innerHTML = 'FMEA — <span style="color:#0284c7;">' + esc(s.name || '') + '</span> <span style="font-size:13px;font-weight:500;color:var(--color-text-tertiary);margin-left:8px;">— ARP4761A App J · piece-part</span>';
}

function _phasesActiveTable() { return _missionProfilePhases(_phasesProfileId); }
function _fmtMissionHours(h) { h = +h || 0; return h >= 1 ? (Math.round(h * 100) / 100) + ' h' : (Math.round(h * 60 * 10) / 10) + ' min'; }
function renderFlightPhases() {
    // Mission-profile bar (Phase 76) — switch / add / rename / delete the profile being edited.
    const bar = document.getElementById('phases-profile-bar');
    if (bar) {
        const profiles = _missionProfiles();
        let opts = `<option value="" ${!_phasesProfileId ? 'selected' : ''}>Standard (default)</option>`;
        profiles.forEach(p => { opts += `<option value="${esc(p.id)}" ${String(p.id) === String(_phasesProfileId) ? 'selected' : ''}>${esc(p.name)}</option>`; });
        const isDefault = !_phasesProfileId;
        const total = getTotalFlightDuration(_phasesActiveTable());
        bar.innerHTML =
            `<label style="font-weight:600; margin:0;">Mission profile</label>`
            + `<select id="phases-profile-select" onchange="onPhasesProfileChange(this.value)" style="min-width:220px; margin:0;">${opts}</select>`
            + `<button type="button" class="action-btn" onclick="createMissionProfile()">+ New mission profile</button>`
            + (isDefault ? '' : `<button type="button" class="action-btn" onclick="renameMissionProfile()">Rename</button><button type="button" class="action-btn" onclick="deleteMissionProfile()" style="color:var(--sev-haz-fg,#b91c1c);">Delete</button>`)
            + `<span style="margin-left:auto; font-size:12px; color:var(--color-text-secondary);">${isDefault ? 'Default profile — the project baseline.' : 'Special profile.'} Mission duration: <strong id="phases-total-exposure">${_fmtMissionHours(total)}</strong> <span title="Contingency phases are excluded from this total. They are flown on a small fraction of departures, so counting them as mission time would dilute every exposure ratio in the project." style="cursor:help;">(nominal phases only)</span></span>`;
    }
    const tbody = document.getElementById('phases-body'); if(!tbody) return; tbody.innerHTML = '';
    // 5 Sep 2026 (lever 3) — the standard escapes as a datalist, so the column offers the
    // vocabulary the drafter is told without closing it (a programme may have its own).
    if (!document.getElementById('phase-escape-options')) {
        const dl = document.createElement('datalist'); dl.id = 'phase-escape-options';
        ['stop on the ground', 'reject the take-off before V1', 'stop on the runway', 'continue to a landing', 'go-around', 'none'].forEach(v => { const o = document.createElement('option'); o.value = v; dl.appendChild(o); });
        document.body.appendChild(dl);
    }
    // Nominal phases first, then contingencies under their own heading. The index
    // passed to updatePhase / deletePhaseRow is the row's index in the UNDERLYING
    // table, not its display position — reordering the display must not rewrite
    // the wrong row.
    const _tblRows = _phasesActiveTable();
    const _isSpecial = row => (typeof isSpecialPhase === 'function') ? isSpecialPhase(row) : false;
    const _ordered = _tblRows.map((row, idx) => ({ row, idx }))
                             .sort((a, b) => (_isSpecial(a.row) ? 1 : 0) - (_isSpecial(b.row) ? 1 : 0));
    let _headerDrawn = false;
    _ordered.forEach(({ row: p, idx }) => {
        if (_isSpecial(p) && !_headerDrawn) {
            _headerDrawn = true;
            tbody.innerHTML += `<tr><td colspan="10" style="background:var(--color-surface-2); padding:8px 10px; border-top:1px solid var(--color-border-hair);">`
                + `<span style="font-size:10px; text-transform:uppercase; letter-spacing:0.07em; font-weight:600; color:var(--color-text-tertiary);">Contingency phases</span>`
                + `<div style="font-size:12px; color:var(--color-text-secondary); margin-top:3px; max-width:78ch;">`
                + `Outside the nominal mission — flown on a small fraction of departures. Their durations are <strong>excluded from the mission total</strong>, and an FHA row that names one keeps the <strong>full-flight</strong> exposure window rather than shrinking to the manoeuvre: the function had to survive the whole flight to be available when the contingency was flown. A true per-flight figure needs P(demand) × duration, and there is no occurrence-frequency field yet — so the conservative bound is held instead of a frequency being guessed.`
                + `</div></td></tr>`;
        }
        tbody.innerHTML += `<tr${_isSpecial(p) ? ' data-contingency="1"' : ''}><td><strong>${esc(p.phase)}</strong>${_isSpecial(p) ? ' <span title="Contingency phase — excluded from the mission total; exposure stays the full flight." style="font-size:10px; font-weight:600; color:var(--color-text-tertiary); border:1px solid var(--color-border-hair); border-radius:3px; padding:1px 4px; margin-left:5px; cursor:help;">CONTINGENCY</span>' : ''}</td><td><input type="number" class="table-input" value="${esc(p.altFrom)}" onchange="updatePhase(${idx}, 'altFrom', this.value)"></td><td><select class="table-select" onchange="updatePhase(${idx}, 'altFromUnit', this.value)"><option ${p.altFromUnit==='AGL'?'selected':''}>AGL</option><option ${p.altFromUnit==='ASL'?'selected':''}>ASL</option></select></td><td><input type="number" class="table-input" value="${esc(p.altTo)}" onchange="updatePhase(${idx}, 'altTo', this.value)"></td><td><select class="table-select" onchange="updatePhase(${idx}, 'altToUnit', this.value)"><option ${p.altToUnit==='AGL'?'selected':''}>AGL</option><option ${p.altToUnit==='ASL'?'selected':''}>ASL</option></select></td><td><input type="number" class="table-input" value="${esc(p.duration)}" onchange="updatePhase(${idx}, 'duration', this.value)"></td><td><select class="table-select" onchange="updatePhase(${idx}, 'durationUnit', this.value)"><option ${p.durationUnit==='seconds'?'selected':''}>seconds</option><option ${p.durationUnit==='mins'?'selected':''}>mins</option><option ${p.durationUnit==='hours'?'selected':''}>hours</option></select></td><td><input type="number" min="0" step="1" class="table-input" value="${esc(p.windowS==null?'':p.windowS)}" placeholder="—" title="HF response window (s) — feeds INV-17; leave empty and INV-17 stays silent for this phase" onchange="updatePhase(${idx}, 'windowS', this.value)"></td><td><input type="text" class="table-input" list="phase-escape-options" value="${esc((typeof SLFhaDerive !== 'undefined' && SLFhaDerive) ? SLFhaDerive.escapeOf(p) : (p.escape || ''))}" placeholder="none" title="How the flight gets out of a condition whose effect has not yet been felt in this phase. Type none when there is no way out (e.g. Landing)." onchange="updatePhase(${idx}, 'escape', this.value)"></td><td style="text-align:center;"><button type="button" title="Remove phase" onclick="deletePhaseRow(${idx})" style="color:var(--sev-haz-fg,#b91c1c); background:none; border:none; cursor:pointer; font-size:14px;">✕</button></td></tr>`;
    });
}
function updatePhase(idx, field, val) {
    const _tbl = _phasesActiveTable();
    if (!_tbl[idx]) return;
    _tbl[idx][field] = val;
    // Phase 57/76 — a phase-duration edit must flow into any FTA whose exposure is auto-derived
    // from a linked FHA's phases. Only re-pull when the edited profile is the one the active tree
    // is built for; editing a different profile is a harmless no-op for the live canvas.
    const _editedIsActiveTree = String(_phasesProfileId || '') === String((typeof ftaConfig === 'object' && ftaConfig && ftaConfig.missionProfileId) || '');
    if (_editedIsActiveTree && (field === 'duration' || field === 'durationUnit' || field === 'phase')) {
        if (typeof ftaConfig === 'object' && ftaConfig && (ftaConfig.exposureSource || 'auto') === 'auto' && ftaConfig.linkedFhaId) {
            const wrote = (typeof syncFTAExposureFromFHA === 'function') ? syncFTAExposureFromFHA() : false;
            if (wrote) {
                const expInput = document.getElementById('fta-exposure-time');
                if (expInput) expInput.value = ftaConfig.exposureTime;
                if (typeof calculateAllProbabilities === 'function') calculateAllProbabilities();
                if (typeof updateD3 === 'function') updateD3();
                if (typeof refreshTopAllocatorReadout === 'function') refreshTopAllocatorReadout();
            }
        }
    }
    if (field === 'phase' && typeof refreshFhaPhaseGrids === 'function') refreshFhaPhaseGrids();
    // Keep the profile bar's total-exposure readout current without disturbing table focus.
    if (field === 'duration' || field === 'durationUnit') {
        const totEl = document.getElementById('phases-total-exposure');
        if (totEl) totEl.textContent = _fmtMissionHours(getTotalFlightDuration(_phasesActiveTable()));
    }
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
}

// --- Mission-profile management (Phase 76) ------------------------------------------
// The default profile IS flightPhasesData; special profiles are cloned from whatever is shown
// (so phase NAMES stay identical and the FHA→phase mapping is preserved) — you then edit only
// the durations. A fault tree points at a profile via ftaPage.missionProfileId.
function onPhasesProfileChange(id) { _phasesProfileId = id || ''; renderFlightPhases(); }
function createMissionProfile() {
    slPrompt('Name this mission profile (e.g. Long-haul):', 'Long-haul', { title: 'New mission profile', okText: 'Create' }).then(v => {
        const name = (v || '').trim();
        if (!name) return;
        const clone = JSON.parse(JSON.stringify(_phasesActiveTable() || []));   // identical phases — edit durations
        const id = 'mp-' + Date.now();
        _missionProfiles().push({ id, name, phases: clone });
        _phasesProfileId = id;
        renderFlightPhases();
        if (typeof refreshFtaMissionProfileDropdown === 'function') refreshFtaMissionProfileDropdown();
        if (typeof showToast === 'function') showToast('Created mission profile "' + name + '" — adjust its phase durations below.', 'success', 4000);
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
    });
}
function renameMissionProfile() {
    if (!_phasesProfileId) return;
    const p = _missionProfiles().find(x => String(x.id) === String(_phasesProfileId));
    if (!p) return;
    slPrompt('Rename mission profile:', p.name, { title: 'Rename mission profile', okText: 'Rename' }).then(v => {
        const name = (v || '').trim();
        if (!name) return;
        p.name = name;
        renderFlightPhases();
        if (typeof refreshFtaMissionProfileDropdown === 'function') refreshFtaMissionProfileDropdown();
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
    });
}
function deleteMissionProfile() {
    if (!_phasesProfileId) return;
    const list = _missionProfiles();
    const i = list.findIndex(x => String(x.id) === String(_phasesProfileId));
    if (i < 0) return;
    slConfirm('Delete this mission profile? Fault trees built for it fall back to the default profile.', { title: 'Delete mission profile', danger: true, okText: 'Delete' }).then(ok => {
        if (!ok) return;
        const deletedId = String(list[i].id);
        list.splice(i, 1);
        (ftaPages || []).forEach(pg => { if (String(pg.missionProfileId) === deletedId) pg.missionProfileId = ''; });
        if (typeof ftaConfig === 'object' && ftaConfig && String(ftaConfig.missionProfileId) === deletedId) ftaConfig.missionProfileId = '';
        _phasesProfileId = '';
        renderFlightPhases();
        if (typeof refreshFtaMissionProfileDropdown === 'function') refreshFtaMissionProfileDropdown();
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
    });
}
function addPhaseRow() {
    slPrompt('New flight phase name (e.g. Extended Cruise):', '', { title: 'Add nominal flight phase', okText: 'Add' }).then(v => {
        const name = (v || '').trim();
        if (!name) return;
        // `special: false` is explicit. Without it a phase the user happens to name
        // "Diversion" would be classified as a contingency by the name table and
        // silently drop out of the mission duration they just entered.
        _phasesActiveTable().push({ phase: name, altFrom: '', altFromUnit: 'ASL', altTo: '', altToUnit: 'ASL', duration: '0', durationUnit: 'hours', special: false });
        renderFlightPhases();
        if (typeof refreshFhaPhaseGrids === 'function') refreshFhaPhaseGrids();
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
    });
}

// Contingency phases come from a catalogue rather than a free-text box: they are a
// closed set with agreed names, and a typo here would produce an FHA vocabulary
// entry nobody else in the programme is using.
function addContingencyPhase() {
    const cat = (typeof SPECIAL_PHASE_CATALOGUE !== 'undefined' ? SPECIAL_PHASE_CATALOGUE : (window.SPECIAL_PHASE_CATALOGUE || []))
        .concat(typeof SPECIAL_FLIGHT_PHASES !== 'undefined' ? SPECIAL_FLIGHT_PHASES : (window.SPECIAL_FLIGHT_PHASES || []));
    const tbl = _phasesActiveTable();
    const have = {};
    tbl.forEach(r => { have[String((r && r.phase) || '').trim().toLowerCase()] = 1; });
    const avail = cat.filter(c => !have[c.phase.toLowerCase()]);
    if (!avail.length) {
        if (typeof showToast === 'function') showToast('Every catalogued contingency phase is already in this table.', 'info', 4000);
        return;
    }
    const menu = avail.map((c, i) => (i + 1) + '. ' + c.phase).join('\n');
    slPrompt('Add a contingency phase — enter its number:\n\n' + menu,
             '1', { title: 'Add contingency phase', okText: 'Add' }).then(v => {
        const n = parseInt(String(v || '').trim(), 10);
        if (!n || n < 1 || n > avail.length) return;
        tbl.push(JSON.parse(JSON.stringify(avail[n - 1])));
        renderFlightPhases();
        if (typeof refreshFhaPhaseGrids === 'function') refreshFhaPhaseGrids();
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
        if (typeof showToast === 'function') showToast('Added "' + avail[n - 1].phase + '" — excluded from the mission total; FHA rows naming it keep the full-flight exposure window.', 'success', 6000);
    });
}
function deletePhaseRow(idx) {
    const tbl = _phasesActiveTable();
    if (idx < 0 || idx >= tbl.length) return;
    slConfirm('Remove "' + (tbl[idx].phase || 'this phase') + '"?', { title: 'Remove phase', danger: true, okText: 'Remove' }).then(ok => {
        if (!ok) return;
        tbl.splice(idx, 1);
        renderFlightPhases();
        // FHA rows that named the removed phase keep the text — dropping it would
        // rewrite somebody's assessment on their behalf. The grid flags it instead
        // (see renderFhaPhaseGrid) so the engineer sees it and decides.
        if (typeof refreshFhaPhaseGrids === 'function') refreshFhaPhaseGrids();
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
    });
}

function calcExposureFromFHA(fhaId) {
    if (typeof ftaConfig !== 'undefined' && typeof ftaConfig.exposureTime === 'number' && ftaConfig.exposureTime > 0) {
        return ftaConfig.exposureTime;
    }
    return 1;
}

// Resolve an FHA descriptor and return its exposed-phase durations + ratio. Wraps
// _resolveLinkedFha + getPhaseExposureRatio in a single call. Returns null when no FHA.
// Phase 35 — when projectConfig.missionDuration is set, it overrides the sum-of-phases
// `totalHours` as the t_mission used to compute the exposure ratio r. This lets the user
// pin a binding mission duration (typically the shortest under the type cert) without
// having to edit every row on the Flight Phases tab.
function _fhaExposureContext(linkedFhaId, phaseTable) {
    if (!linkedFhaId) return null;
    const fha = (typeof _resolveLinkedFha === 'function') ? _resolveLinkedFha(linkedFhaId) : null;
    if (!fha || !fha.phases) return null;
    // FTA-side exposure: cost the FHA's selected phases at the active tree's mission-profile
    // durations (long-haul = longer cruise = more exposure). FHA still chooses WHICH phases.
    const tbl = phaseTable || _activeTreeMissionPhases();
    const exp = getPhaseExposureRatio(fha.phases, tbl);
    if (!exp) return null;
    // Override t_mission if the user pinned a Certification Mission Duration.
    const md = (typeof projectConfig !== 'undefined' && projectConfig.missionDuration && projectConfig.missionDuration > 0)
        ? projectConfig.missionDuration : null;
    if (md && exp.exposedHours > 0) {
        const adjustedRatio = Math.min(1, exp.exposedHours / md);
        return { fha, exp: Object.assign({}, exp, {
            totalHours: md,
            ratio: adjustedRatio,
            missionSource: 'project-defined'
        })};
    }
    return { fha, exp: Object.assign({}, exp, { missionSource: 'sum-of-flight-phases' }) };
}

// Push the FHA-derived exposure into ftaConfig.exposureTime when source = 'auto'. Returns
// true if a write happened. Idempotent — calling repeatedly is safe.
function syncFTAExposureFromFHA() {
    if (typeof ftaConfig === 'undefined') return false;
    if (ftaConfig.exposureSource !== 'auto') return false;
    const ctx = _fhaExposureContext(ftaConfig.linkedFhaId);
    if (!ctx) return false;
    // exposedHours is the sum of matched-phase durations. If nothing matched, fall back to
    // the total flight envelope so we never end up with 0.
    const t = (ctx.exp.exposedHours > 0) ? ctx.exp.exposedHours : (ctx.exp.totalHours || 1);
    ftaConfig.exposureTime = t;
    return true;
}

// Compute the probability the top-down allocator should distribute, along with the auxiliary
// quantities the toolbar shows. Returns:
//   { headlineRate, exposureTime, operationalRate, phaseRatio, totalMissionHours,
//     missionSource, topProbAtExposure, hasFhaNormalization, matchedPhases }
//
// Phase 36 fix: r is ALWAYS derived from the visible quantities t_exposure / t_mission so the
// readout stays internally consistent even when the user manually overrides exposureTime via
// the toolbar. Previously r was computed from the FHA's exposedHours / totalHours, which
// could drift away from the displayed t_exposure if the user typed a different value into
// the FTA toolbar's Exposure Time field.
//
// t_exposure: ftaConfig.exposureTime (always the displayed/in-use value).
// t_mission:  projectConfig.missionDuration when > 0, else sum of flight phases, else exposureTime.
// r = t_exposure / t_mission. Normalization is active when r ∈ (0, 0.999).
function _computeTopAllocatorContext() {
    const headlineRate = ftaConfig.targetP || 0;
    const exposureTime = ftaConfig.exposureTime || 1;
    // Determine t_mission. Three sources, in priority order.
    let totalMissionHours, missionSource;
    const md = (typeof projectConfig !== 'undefined' && projectConfig.missionDuration && projectConfig.missionDuration > 0)
        ? projectConfig.missionDuration : null;
    if (md) {
        totalMissionHours = md;
        missionSource = 'project-defined';
    } else {
        // Sum every row on the Flight Phases tab. parseDurationToHours handles each row.
        let sum = 0;
        try {
            (_activeTreeMissionPhases() || []).forEach(p => {
                const h = (typeof parseDurationToHours === 'function')
                    ? parseDurationToHours(p.duration, p.durationUnit)
                    : 0;
                if (h > 0) sum += h;
            });
        } catch(e){}
        if (sum > 0) {
            totalMissionHours = sum;
            missionSource = 'sum-of-flight-phases';
        } else {
            totalMissionHours = exposureTime;
            missionSource = 'no-mission-defined';
        }
    }
    // Pull matched-phase names from the linked FHA for the readout label (purely informational).
    const ctx = _fhaExposureContext(ftaConfig.linkedFhaId);
    const matchedPhases = ctx ? ctx.exp.matchedPhases : [];
    // Compute r consistently.
    const r = (totalMissionHours > 0) ? (exposureTime / totalMissionHours) : 1;
    const hasNormalization = r > 0 && r < 0.999;
    const operationalRate = hasNormalization ? (headlineRate / r) : headlineRate;
    return {
        headlineRate, exposureTime,
        operationalRate,
        phaseRatio: hasNormalization ? r : 1,
        totalMissionHours,
        missionSource,
        topProbAtExposure: -Math.expm1(-operationalRate * exposureTime),
        hasFhaNormalization: hasNormalization,
        matchedPhases
    };
}

function formatNodeMetrics(d) {
    const node = d.data;
    const isLeaf = node.type !== 'gate' && node.gateType !== 'TRANSFER';
    const tExp = ftaConfig.exposureTime || 1;
    // Tree-type-aware display. An ALLOCATION tree (top-down apportionment) shows the probability
    // BUDGET only — its λ there is a derived P/t artifact, not a measured rate. A VERIFICATION tree
    // (bottom-up roll-up of real component failure rates) is rate-led: λ (the input) + computed P.
    let isVerification = false;
    try {
        const page = (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) ? ftaPages.find(p => p.id === activeFTAPageId) : null;
        const mode = (page && page.mode) || (ftaConfig && ftaConfig.mode)
            || ((page && page.verifies) ? 'bottom-up' : 'top-down');
        // Phase 66.10 — the display follows the ACTIVE calculation mode, not the
        // page's role. `page.verifies` used to force the λ-led display even after
        // the page was switched to top-down, so an allocation view on a verification
        // page rendered "λ=0 P=0" on every leaf (allocation deletes λ) while the
        // gates above showed real allocated budgets.
        isVerification = (mode === 'bottom-up');
    } catch (_) {}
    let lam = 0, prob = 0;
    if (isLeaf) {
        if (isVerification) {
            lam = node.lambda || 0;
            if (lam > 0) {
                prob = -Math.expm1(-lam * tExp);
            } else {
                // Phase 66.10 — no measured rate on this leaf (an allocation-authored
                // leaf, or a verification leaf with no as-built data yet). Show the
                // probability the engine actually rolled up, and its rate equivalent.
                // The old branch printed a bare "λ=0 P=0" underneath a gate whose value
                // had just been computed FROM this leaf — the tree contradicted itself.
                prob = node.probability || 0;
                lam = (prob > 0 && prob < 1 && typeof rateEquivalentForProb === 'function')
                    ? rateEquivalentForProb(prob, tExp) : 0;
            }
        } else {
            // Phase 61 — allocation-tree leaves are probability-only: the stored budget IS
            // the displayed value. (Also fixes latent/manual-exposure leaves, whose old
            // λ-derived display used the wrong window.)
            prob = node.probability || 0;
        }
    } else {
        prob = node.probability || 0;
        lam = isVerification ? rateEquivalentForProb(prob, tExp) : 0;
    }
    const lamStr  = (lam  && isFinite(lam))  ? lam.toExponential(2).toUpperCase()  : (lam === 0 ? '0' : '∞');
    const probStr = (prob && isFinite(prob)) ? prob.toExponential(2).toUpperCase() : '0';
    if (isVerification) return 'λ=' + lamStr + ' P=' + probStr;
    // Phase 63.9 — allocation trees: P is the plain per-flight budget; alongside it,
    // the per-flight-hour equivalent (P normalized by mission time) — the number the
    // cert basis quotes — so P=5.08E-9 reads as ≈1.0E-9/FH at a glance. Display-only
    // normalization at the time boundary; no λ exists on allocation nodes.
    let perFh = '';
    try {
        const tM = (typeof _missionHoursForNormalization === 'function' && _missionHoursForNormalization()) || tExp || 0;
        if (prob > 0 && prob < 1 && tM > 0) perFh = ' · ≈' + (-Math.log1p(-prob) / tM).toExponential(2).toUpperCase() + '/FH';
    } catch (_) {}
    return 'P=' + probStr + perFh;
}

// Phase 56.42 — Companion to formatNodeMetrics. Returns a short "Actual:" line
// the canvas can render as a separate SVG text element below the metrics input
// when the engineer's TOP target diverges from the BDD-exact reconstruction in
// top-down mode. Returns '' when there's nothing to surface.
function formatNodeActualLine(d) {
    const node = d.data;
    // Phase 66.19 — a leaf held below its natural apportionment because the same physical
    // event carries a stricter requirement in another tree says so ON THE CANVAS. Without
    // it the engineer reads a number this tree's own math does not explain.
    if (node && node.type !== 'gate' && node._sharedStrictest) {
        return '\u26a0 Held at the strictest allocation across ' + node._sharedStrictest.instances +
               ' trees (from ' + (node._sharedStrictest.fromPageName || 'another tree') + ')';
    }
    if (node && node.type !== 'gate' && node._sharedStrictestConflict) {
        return '\u25b3 Shared across trees with different exposure models \u2014 no strictest requirement applied';
    }
    if (!node || node.type !== 'gate') return '';
    // Independence-compromise warning (Gaps 1/4 cascade) — shown on any AND/INHIBIT gate whose
    // DAL/probability reduction rested on an independence claim CMA found compromised. The
    // independent product understates P(top) until a common-cause (β) term is added.
    if (node._probCompromised) return '⚠ Independence compromised — common-cause (β) term required';
    // Gap 5 transparency — dynamic gates: static P(top) is order-agnostic (a conservative bound).
    // PAND/SPARE are treated as AND here (P(AND) ≥ P(PAND)); FDEP contributes 0. The order-aware
    // value comes from the DFT Monte-Carlo (ARP4761A App G required-order factor k/n!).
    if (node.gateType === 'PAND' || node.gateType === 'SPARE') return '△ Order-dependent — static P(top) uses a conservative AND bound; run DFT Monte-Carlo for the order-aware value';
    if (node.gateType === 'FDEP') return '△ FDEP contributes 0 to static P(top); its dependency is exercised in the DFT Monte-Carlo';
    if (typeof ftaConfig !== 'object' || !ftaConfig || ftaConfig.mode !== 'top-down') return '';
    if (typeof node._bddActualProb !== 'number' || !isFinite(node._bddActualProb)) return '';
    const isActiveRoot = (typeof getActiveFTARoot === 'function')
        ? (getActiveFTARoot() === node) : false;
    if (!isActiveRoot) return '';
    // Phase 56.43f — only surface the Actual when it materially diverges from
    // the engineer's target. When the MCS-aware allocator closes the budget,
    // target and actual converge and the second line is just noise.
    const target = (typeof node.probability === 'number' && isFinite(node.probability)) ? node.probability : null;
    const aP = node._bddActualProb;
    if (target !== null && target > 0) {
        const rel = Math.abs(aP - target) / target;
        if (rel < 0.01) return '';   // within 1% — allocator converged, hide line
    }
    const aProbStr = (aP && isFinite(aP)) ? aP.toExponential(2).toUpperCase() : '0';
    // Allocation tree (this line is top-down-only) → probability-led, consistent with formatNodeMetrics.
    return 'Actual: P=' + aProbStr;
}

function syncACFHACondition() { const t = acExtractedFCs.find(fc => fc.id === document.getElementById('ac-fha-fcid').value); document.getElementById('ac-fha-fcdesc').value = t ? t.desc : ''; }

// --- FHA sub-function ↔ failure-condition agreement (20 Aug 2026) ------------------
// The FHA row asserts "this sub-function has this failure condition". Before today the two
// dropdowns were independent: the FC list was never filtered by the selected sub-function
// and submit never checked the pair, so a row claiming SF-002 owns SF-001's total-loss
// condition saved silently and read as authoritative everywhere downstream.
//
// Two layers, on purpose. The FILTER is the ergonomic half — it stops the mistake being
// offered. The GUARD in submit is the real one, because the filter is bypassable by row
// edit, Excel import and ANEM. A filter alone would have looked like a fix and not been one.
//
// Deliberately permissive in three places, each of which is a legitimate pairing rather
// than a mistake:
//   • combined conditions (Table A3 related-sub-functions) span sub-functions by definition
//   • an FC whose FCIM row carries no subId at all — legacy and imported rows — cannot be
//     judged, and refusing to save them would strand existing projects
//   • the row currently being edited keeps its own FC visible even if it disagrees, so
//     opening a legacy mismatched row does not silently blank the field. It is reported,
//     not erased.
function _fcOwnerSubId(scope, fcId, sysId) {
    const pool = (scope === 'sys')
        ? (((systemsData || []).find(s => s && s.id === sysId) || {}).extractedFCs || [])
        : (acExtractedFCs || []);
    return (pool.find(fc => fc && String(fc.id) === String(fcId))) || null;
}

// Returns { ok, reason } for a (sub-function, FC) pair. ok:true means "save it".
function _fhaPairCheck(scope, subId, fcId, sysId) {
    if (!fcId) return { ok: true };                       // nothing chosen — other validation owns this
    const rec = _fcOwnerSubId(scope, fcId, sysId);
    if (!rec) return { ok: true };                        // FC not in the matrix — not this guard's business
    if (rec.combined) return { ok: true };                // Table A3 — spans sub-functions by design
    if (!rec.subId) return { ok: true };                  // legacy / imported row with no owner recorded
    if (!subId) return { ok: true };                      // no sub-function chosen — other validation owns this
    if (String(rec.subId) === String(subId)) return { ok: true };
    return { ok: false, reason: '"' + fcId + '" belongs to ' + rec.subId + ', not ' + subId + '.' };
}

// Repopulate an FHA form's FC dropdown so it only offers conditions belonging to the
// selected sub-function (plus combined conditions, plus whatever is already selected).
function _refreshFhaFcOptions(scope) {
    const subSel = document.getElementById(scope === 'sys' ? 'sys-fha-subfunc' : 'ac-fha-subfunc');
    const fcSel  = document.getElementById(scope === 'sys' ? 'sys-fha-fcid'    : 'ac-fha-fcid');
    if (!subSel || !fcSel) return;
    const sysId = (scope === 'sys' && typeof activeSystemId !== 'undefined') ? activeSystemId : null;
    const pool = (scope === 'sys')
        ? (((systemsData || []).find(s => s && s.id === sysId) || {}).extractedFCs || [])
        : (acExtractedFCs || []);
    const subId  = subSel.value;
    const keepId = fcSel.value;   // the row being edited keeps its own FC visible
    const shown = (pool || []).filter(fc => {
        if (!fc) return false;
        if (String(fc.id) === String(keepId)) return true;
        if (fc.combined) return true;
        if (!fc.subId) return true;
        if (!subId) return true;              // nothing selected yet → show everything
        return String(fc.subId) === String(subId);
    });
    populateDropdowns(scope === 'sys' ? 'sys-fha-fcid' : 'ac-fha-fcid', shown, 'id', 'id', true);
    if (keepId && Array.from(fcSel.options).some(o => o.value === keepId)) fcSel.value = keepId;
}
function onACFHASubFuncChange()  { _refreshFhaFcOptions('ac');  }
function onSysFHASubFuncChange() { _refreshFhaFcOptions('sys'); }
// Parses "ASM-XX-NNN: text" into { id, text }. Returns { id: null, text: raw } if no prefix matches.
function parseAssumptionField(raw) {
    if (!raw) return { id: null, text: '' };
    const m = String(raw).match(/^(ASM-[A-Z]+-\d+):\s*([\s\S]*)$/);
    return m ? { id: m[1], text: m[2] } : { id: null, text: String(raw) };
}

function submitACFHA() {
    // 20 Aug 2026 — the sub-function and the failure condition must agree. See _fhaPairCheck.
    // This runs BEFORE the assumption auto-create below so a rejected submit does not leave a
    // stray assumption behind.
    {
        const _sub = document.getElementById('ac-fha-subfunc').value;
        const _fc  = document.getElementById('ac-fha-fcid').value;
        const _chk = _fhaPairCheck('ac', _sub, _fc, null);
        if (!_chk.ok) {
            alert('Cannot log this FHA row.\n\n' + _chk.reason +
                  '\n\nAn FHA row asserts that THIS sub-function has THIS failure condition. ' +
                  'Pick the failure condition that belongs to ' + _sub + ', or change the sub-function to ' +
                  _fcOwnerSubId('ac', _fc, null).subId + '.');
            return;
        }
    }
    // If the user typed a new assumption but didn't click "+ Create", auto-create it now
    // so their text isn't silently discarded on submit.
    const newInput = document.getElementById('ac-fha-asm');
    if (newInput && newInput.value.trim() !== '') createNewAssumption('ac');

    const assumptionIds = getFhaAsmIds('ac');
    const data = {
        internalId: editStates.acFha || newRowId(),
        subId: document.getElementById('ac-fha-subfunc').value,
        fcId: document.getElementById('ac-fha-fcid').value,
        fcDesc: document.getElementById('ac-fha-fcdesc').value,
        phases: getCheckedValues('ac-fha-phases'),
        effAc: document.getElementById('ac-fha-eff-ac').value,
        effCrew: document.getElementById('ac-fha-eff-crew').value,
        effPax: document.getElementById('ac-fha-eff-pax').value,
        severity: document.getElementById('ac-fha-sev').value,
        assumptionIds,
        comments: document.getElementById('ac-fha-comments').value,
    };
    if (!editStates.acFha) _slAutoNumber('acFha', data); // auto-fill blank FC ID on create only
    if (editStates.acFha) {
        const idx = acFhaData.findIndex(i => String(i.internalId) === String(editStates.acFha));   // 28 Aug 2026 — the SAVE half of the numeric-id edit bug: without this an edit that opened could still fail to write back
        // 3 Sep 2026 — the form only knows its own fields. Replacing the row wholesale
        // silently dropped provenance, the effect levels, the anchor, sourceCondId and
        // the judgement flag. Overlay instead, and mark that a person touched it — the
        // AI accept path uses that mark to never overwrite an edited row.
        if (idx >= 0) acFhaData[idx] = Object.assign({}, acFhaData[idx], data, { humanEdited: true, humanEditedAt: new Date().toISOString() }); else acFhaData.push(data);
    } else {
        acFhaData.push(data);
    }
    cancelEdit('acFha');
    renderACFHA();
    renderACAssumptions(); // refresh Linked Failure Conditions column
}
function editACFHA(iId) {
    // 28 Aug 2026 — String() both sides: the kebab onclick always passes the id as a
    // string, while seeded/legacy rows store numbers. Strict === made Edit AND Delete
    // a silent no-op on every numeric-id row. Same coercion the rest of the codebase
    // already uses (String(x.internalId) === String(id)).
    const item = acFhaData.find(x => String(x.internalId) === String(iId)); if (!item) return;
    document.getElementById('ac-fha-subfunc').value = item.subId;
    // Filter the FC list to this sub-function BEFORE restoring the row's own FC. Assigning
    // .value directly does not fire onchange, so without this the edit form would show the
    // unfiltered list. _refreshFhaFcOptions always keeps whatever is currently selected, so a
    // legacy row whose FC disagrees still opens with its own value intact rather than blank.
    document.getElementById('ac-fha-fcid').value = item.fcId;
    if (typeof _refreshFhaFcOptions === 'function') _refreshFhaFcOptions('ac');
    document.getElementById('ac-fha-fcid').value = item.fcId;
    document.getElementById('ac-fha-fcdesc').value = item.fcDesc;
    // Build the grid around this row's stored phases first: a value no longer in
    // the project table is rendered flagged rather than dropped on the next save.
    renderFhaPhaseGrid('ac-fha-phases', item.phases);
    setCheckedValues('ac-fha-phases', item.phases);
    document.getElementById('ac-fha-eff-ac').value = item.effAc || '';
    document.getElementById('ac-fha-eff-crew').value = item.effCrew || '';
    document.getElementById('ac-fha-eff-pax').value = item.effPax || '';
    document.getElementById('ac-fha-sev').value = item.severity;
    document.getElementById('ac-fha-comments').value = item.comments || '';
    populateFhaAsmDropdown('ac');
    renderFhaAsmChips('ac', item.assumptionIds || []);
    editStates.acFha = iId; setEditMode('acFha'); window.scrollTo(0, 0);
}
function deleteACFHA(iId) {
    acFhaData = acFhaData.filter(x => String(x.internalId) !== String(iId));   // 28 Aug 2026 — see editACFHA
    renderACFHA();
    renderACAssumptions(); // refresh Linked Failure Conditions column
}
// Resolve an FHA row's stored sub-function reference to a human-readable name. Rows created
// via the in-app Sub-Function dropdown store the sub-function ID (e.g. "LDG-2"); Excel-imported
// rows store the name text directly. Look the ID up in acFunctionsData and show its subName;
// fall back to the raw stored value (covers imported names and any unmatched ID) so the column
// always reads as a function name regardless of how the row was created.
function _fhaSubFunctionDisplay(subId) {
    if (subId == null || subId === '') return '';
    try {
        const match = (typeof acFunctionsData !== 'undefined' && acFunctionsData)
            ? acFunctionsData.find(f => f.subId === subId) : null;
        if (match && match.subName) return match.subName;
    } catch (e) { /* fall through to raw value */ }
    // 21 Aug 2026 (L1) — SFHA rows key to SYSTEM functions (the form has written
    // funcIds into subId since the pairing guard landed); resolve those too.
    try { if (typeof window !== 'undefined' && window.SLFnResolve) { const r = SLFnResolve.resolve(subId); if (r && r.kind === 'function') return r.funcName || subId; } } catch (_) {}
    return subId;
}

// The FCIM join — the suggestion for re-keying a legacy row: the system FCIM
// (extractedFCs) knows which function owns this row's failure condition.
function _sysFhaFcimSuggestion(sys, row) {
    if (!sys || !row || !row.fcId) return null;
    const fcim = (sys.extractedFCs || []).find(fc => fc && String(fc.id) === String(row.fcId));
    if (!fcim || !fcim.subId) return null;
    const ids = (sys.functions || []).filter(f => f && f.funcId).map(f => String(f.funcId));
    return ids.indexOf(String(fcim.subId)) !== -1 ? String(fcim.subId) : null;
}
// Signed re-key of a legacy SFHA row onto a system function. The aircraft
// linkage is not lost — acTrace carries it; the old subId is recorded in the
// row's provenance.
async function sysFhaRekey(sysId, internalId, funcId) {
    if (!funcId) return;
    const s = (systemsData || []).find(x => x.id === sysId);
    const row = s && (s.fha || []).find(r => String(r.internalId) === String(internalId));
    if (!row) return;
    const ask = (typeof slPrompt === 'function') ? slPrompt : ((m, d) => Promise.resolve(window.prompt(m, d)));
    const fnLabel = _fhaSubFunctionDisplay(funcId);
    const by = (await ask('Re-key ' + (row.fcId || 'this row') + ' to system function \u201C' + fnLabel + '\u201D? The aircraft trace (acTrace) is unchanged; the old key is recorded. Sign with your name:', _signoffReviewerName() || '')) || '';
    if (!String(by).trim()) { renderSysFHA(); return; }
    row.rekeyed = { from: row.subId || null, to: funcId, by: String(by).trim(), at: new Date().toISOString() };
    row.subId = funcId;
    row.sysFuncId = funcId;
    try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    if (typeof showToast === 'function') showToast('Row re-keyed to ' + fnLabel + ' \u2014 recorded on the row.', 'success', 3500);
    renderSysFHA();
}

// FHA-G (22 Aug 2026) — group same-FC-ID phase rows. PURE: returns a render
// ORDER (store order untouched) clustering rows that share a non-empty fcId at
// the first member's position, plus per-group info. The Appendix Q pattern:
// one condition, classified per phase, under one id — worst case governs the
// fault trees (B3 ruling), so the head badge names the worst severity.
// 3 Sep 2026 (Waqas): "color code the disclaimer so it is glaringly obvious." A row
// the AI classified on limited information wears this in its Severity cell: amber
// fill, near-black text, uppercase — the one thing on the row you cannot skim past.
// The note is on hover, and the same note is filed as an 'AI judgement' assumption
// in the row's assumptions column, so it is reviewable like any human premise.
// 4 Sep 2026 (Waqas): the phases on a row are the mission profile's checkboxes; the
// AI only ticks boxes that exist. The old danger badge ("1 dropped: Initial climb")
// is gone — a spelling that matches a box ticks it now, and a value that matches
// no box is named in the row comment (⚠ PHASE NOT IN MISSION PROFILE) rather than
// shown here. The Phases cell lists ticked boxes, one per line, nothing else.
// 4 Sep 2026 (Waqas, reading golden run 1) — four layout rulings for both FHA tables:
//   · Sub-Function shows the sub-function ITSELF (name), with its id small beneath;
//   · the failure-condition ID never wraps — the id itself sits on one line;
//   · Phases is narrow and the phases stack one per line;
//   · Effects is wide (the three sentences are the row's substance).
function _fhaSubCell(subId) {
    const id = String(subId == null ? '' : subId);
    const name = _fhaSubFunctionDisplay(id);
    if (!name || name === id) return `<strong>${esc(id)}</strong>`;
    return `<strong>${esc(name)}</strong><br><span style="font-size:11px;color:var(--color-text-tertiary);white-space:nowrap;">(${esc(id)})</span>`;
}
function _fhaPhasesCell(row) {
    const list = String((row && row.phases) || '').split(',').map(x => x.trim()).filter(Boolean);
    return list.map(esc).join('<br>');
}
// 4 Sep 2026 (Waqas, second layout pass, screenshot of run 1): "judgement tag can be
// removed and comments judgement call to be color coded". The Severity cell is a
// pick-list column and stays narrow; the judgement lives in Comments, where the
// leading "⚠ JUDGEMENT CALL — …" segment is rendered in the same amber as the old
// badge so it still cannot be skimmed past, and the rest of the comment stays plain.
function _fhaCommentsCell(row) {
    const txt = String((row && row.comments) || '');
    if (!(row && row.judgementCall) || !/^⚠ JUDGEMENT CALL/.test(txt)) return esc(txt);
    const cut = txt.indexOf(' | ');
    const head = cut >= 0 ? txt.slice(0, cut) : txt;
    const rest = cut >= 0 ? txt.slice(cut + 3) : '';
    return `<span style="color:#7A5300;font-weight:600;">${esc(head)}</span>` + (rest ? `<br><span>${esc(rest)}</span>` : '');
}
function _fhaJudgementBadge(row) {
    if (!row || !row.judgementCall) return '';
    const note = String(row.judgementNote || '').trim();
    const edited = row.humanEdited ? (' (Row edited by hand ' + String(row.humanEditedAt || '').slice(0, 10) + ' — re-check whether the judgement still stands.)') : '';
    return `<span class="fha-judgement-badge" title="${esc('JUDGEMENT CALL — the AI classified this on limited information; engineer to confirm. ' + (note || '(no note given)') + edited)}" style="display:inline-block;margin-left:6px;padding:2px 8px;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;border-radius:4px;background:#F5B400;color:#1A1200;border:1px solid #B26A00;white-space:nowrap;vertical-align:middle;">⚠ Judgement</span>`;
}
function _fhaGroupRows(rows) {
    const rank = (typeof SEVERITY_RANK !== 'undefined') ? SEVERITY_RANK
        : { 'No Safety Effect': 1, 'Negligible': 1, 'Minor': 2, 'Major': 3, 'Hazardous': 4, 'Catastrophic': 5 };
    const buckets = new Map();   // fcId → rows (first-occurrence order)
    const order = [];            // fcId keys / solo rows, in first-occurrence order
    (rows || []).forEach(r => {
        const key = r && r.fcId ? String(r.fcId).trim() : '';
        if (!key) { order.push({ solo: r }); return; }
        if (!buckets.has(key)) { buckets.set(key, []); order.push({ key }); }
        buckets.get(key).push(r);
    });
    const ordered = [];
    const groups = new Map();    // fcId → { count, worst, headId }
    // 31 Aug 2026 (Waqas): failure conditions list in alphanumeric ASCENDING
    // order — FC-1, FC-2, ... then FC-10 (natural compare: 10 sorts after 2,
    // never after 1). Rows with a BLANK fcId cannot be addressed by id and go
    // LAST, keeping their store order among themselves. Supersedes the
    // first-occurrence cluster order shipped 22 Aug (FHA-G): groups still
    // cluster under their head; the CLUSTERS are what sort now.
    const _keyed = order.filter(o => o.key != null);
    const _blank = order.filter(o => o.solo);
    _keyed.sort((a, b) => String(a.key).localeCompare(String(b.key), undefined, { numeric: true, sensitivity: 'base' }));
    _keyed.concat(_blank).forEach(o => {
        if (o.solo) { ordered.push(o.solo); return; }
        const members = buckets.get(o.key);
        members.forEach(m => ordered.push(m));
        if (members.length > 1) {
            let worst = '';
            members.forEach(m => { if ((rank[m.severity] || 0) > (rank[worst] || 0)) worst = m.severity || worst; });
            // 3 Sep 2026 (Waqas, on a badge reading "phase group × 3 · worst Hazardous"):
            // "why is the AI not splitting it into two rows rather than saying that …
            // it's there to help not to confuse." He was right. Sharing an fcId was the
            // ONLY test, so three ACCEPTED DRAFTS of the same condition — 253 rows over
            // 85 conditions on the campaign project, 35 groups with byte-identical phase
            // lists and 45 with identical descriptions — were announced as a deliberate
            // per-phase classification nobody had made. Worse, `worst` then feeds the
            // fault trees the worst of three DUPLICATES rather than the worst across
            // phases, which is a different number and not the one App Q asks for.
            // A phase group must now PROVE it partitions the phases: two members whose
            // phase sets are identical are duplicates, and saying so is the useful thing.
            // 3 Sep 2026, second pass (Waqas): "different phases dont mean genuinely
            // different effects … the severity follows the change in effect." The first
            // fix split on phase lists; that is the wrong question. A legitimate split
            // needs BOTH different phases AND a different class. Blanks are abstentions,
            // not classifications, and do not count as a difference.
            const phaseKeys = new Set(members.map(_fhaPhaseKey));
            const sevKeys = new Set(members.map(function (m) { return String(m.severity || '').trim(); }).filter(Boolean));
            // 5 Sep 2026 (Waqas): "two rows with same severities are fine as long as effects
            // are different … you can increase pilot workload due to one failure condition in
            // different phases of flight for completely different tasks." So the EFFECTS are
            // part of the test: rows that differ in class OR in effect are a legitimate split;
            // only rows that say the same thing (same class, same effects) should be one row.
            const effKeys = new Set(members.map(_fhaEffectKey).filter(Boolean));
            const _differ = sevKeys.size > 1 || effKeys.size > 1;
            let kind = (phaseKeys.size > 1)
                ? (_differ ? 'phase' : 'consolidate')          // real split · or should be ONE row listing all phases
                : (_differ ? 'contradiction' : 'duplicate');   // same phases, two different stories · or plain copies
            // 5 Sep 2026 (Waqas): "one phase of flight can only have one effect and severity per
            // failure condition" — a phase named on two rows of one condition that carry
            // different classes is a contradiction even when the phase LISTS differ
            // ("Standing, Taxi" No Safety Effect and "Taxi, Takeoff" Major both claim Taxi).
            let twice = [];
            if (kind === 'phase') {
                const seen = {};
                members.forEach(function (m) {
                    const sev = String(m.severity || '').trim(); if (!sev) return;
                    const story = sev + '|' + _fhaEffectKey(m);   // one phase carries ONE effect and one class per condition
                    String(m.phases || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (ph) {
                        const k = ph.toLowerCase().replace(/[^a-z0-9]+/g, ''); if (k === 'allphases') return;
                        if (seen[k] && seen[k] !== story) { if (twice.indexOf(ph) < 0) twice.push(ph); }
                        else if (!seen[k]) seen[k] = story;
                    });
                });
                if (twice.length) kind = 'overlap';
            }
            groups.set(o.key, { count: members.length, worst, headId: members[0].internalId, kind: kind, distinctPhaseSets: phaseKeys.size, distinctClasses: sevKeys.size, twice: twice });
        }
    });
    return { ordered, groups };
}
// 5 Sep 2026 — the row's effect story (aircraft · crew · occupants), keyed on letters and
// digits so a re-typed comma or a capital never reads as a different effect. Empty when
// nothing is stated — an abstention is not a difference.
function _fhaEffectKey(r) {
    return [r && r.effAc, r && r.effCrew, r && r.effPax]
        .map(x => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
        .join('|').replace(/^\|+$/, '');
}
// Order-insensitive identity for a row's phase coverage: "Takeoff, Cruise" and
// "Cruise,Takeoff" are the same coverage and must not read as two phase variants.
function _fhaPhaseKey(r) {
    return String((r && r.phases) || '')
        .split(',').map(function (x) { return x.trim().toLowerCase(); })
        .filter(Boolean).sort().join('|');
}

// FHA-G — author the split: a new sibling row under the SAME failure-condition
// id, phases blank for the engineer to pick, everything else carried over as a
// starting point. Inserted right after its source so the group reads as one.
function acFhaAddPhaseVariant(iId) {
    const idx = acFhaData.findIndex(x => String(x.internalId) === String(iId));   // 28 Aug 2026 — see editACFHA
    if (idx < 0) return;
    const src = acFhaData[idx];
    const row = {
        internalId: newRowId(),
        subId: src.subId, fcId: src.fcId, fcDesc: src.fcDesc,
        phases: '',
        effAc: src.effAc, effCrew: src.effCrew, effPax: src.effPax,
        severity: src.severity,
        assumptionIds: (src.assumptionIds || []).slice(),
        comments: ''
    };
    acFhaData.splice(idx + 1, 0, row);
    try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    renderACFHA();
    if (typeof showToast === 'function') showToast('Phase variant added under ' + (src.fcId || 'this condition') + ' — set its phases and severity (per-phase classification, one FC id). The fault trees take the group\'s worst case.', 'success', 5200);
}

function renderACFHA() {
    // The entry form's phase grid is derived from the project's phase table, so it
    // is rebuilt wherever the tab is. Non-destructive — see renderFhaPhaseGrid.
    renderFhaPhaseGrid('ac-fha-phases');
    const tbody = document.getElementById('ac-fha-body'); tbody.innerHTML = '';
    // FHA-G — same-fcId rows cluster adjacently; heads carry the group badge.
    const _fhaGrouping = _fhaGroupRows(acFhaData);
    // ENG-2 phase 1b — one row builder, paginated through the shared pager
    // (>50 rows); severity counts and every rollup read the full store.
    const _fhaRowHtml = row => {
        const _grp = row.fcId ? _fhaGrouping.groups.get(String(row.fcId).trim()) : null;
        const _isHead = _grp && _grp.headId === row.internalId;
        const _isMember = _grp && !_isHead;
        const effectsHtml = (window.SLSeverityAxes && typeof SLSeverityAxes.effectsHtml === 'function') ? SLSeverityAxes.effectsHtml(row)   // 3 Sep 2026 — level chip per axis + the sentence that justifies it
            : `<strong>AC:</strong> ${esc(row.effAc || 'None')}<br><strong>Crew:</strong> ${esc(row.effCrew || 'None')}<br><strong>Pax:</strong> ${esc(row.effPax || 'None')}`;
        // Phase 53.73 — comment + approval moved to dedicated Review column at end of row.
        const chartBtn = _fhaChartTriggerHtml(row, 'ac');
        const reviewTd = reviewCellHtml('acFha', row.internalId, null);
        // Phase 54 — append any custom columns added via the template editor BEFORE
        // the Review cell so the visible order stays "built-ins → customs → Review".
        const customTds = (typeof renderCustomColumnCells === 'function') ? renderCustomColumnCells('acFha', row) : '';
        const _fhaExtra = `<button type="button" role="menuitem" onclick="openGoldenThreadModal('${esc(row.internalId)}', 'AC')">🧵 Golden Thread</button><button type="button" role="menuitem" onclick="acFhaAddPhaseVariant(${JSON.stringify(row.internalId)})" title="New sibling row under the same FC id — per-phase classification (App Q pattern)">⧉ Add phase variant</button>${chartBtn}`;
        // Cascade obsolescence — flag the whole row + badge the failure-condition cell.
        const _obsCls = row.obsolete ? ' class="slab-obsolete"' : '';
        const _obsBadge = row.obsolete ? '<span class="slab-obsolete-badge" title="' + esc(row.obsoleteReason || 'Obsolete') + '">OBSOLETE</span>' : '';
        // INV-HFW — crew-workload ↔ severity divergence badge (hf_severity_badge.js).
        const _hfw = (typeof HFSeverityCheck !== 'undefined' && HFSeverityCheck.evalRow) ? HFSeverityCheck.evalRow(row) : null;
        const _hfwAttr = _hfw ? ' data-hfw="1"' : '';
        const _hfwBadge = (_hfw && typeof HFW_UI !== 'undefined') ? HFW_UI.badge(row, 'AC', _hfw) : '';
        // 3 Sep 2026 — two different findings wear two different badges, because
        // calling duplicates a "phase group" told the engineer a methodology decision
        // had been made when it had not. An unclassified group says "unclassified"
        // rather than printing "worst " with nothing after it.
        const _grpDup = _grp && _grp.kind !== 'phase';   // anything that is NOT a legitimate split gets the member tooltip for it
        const _grpWorst = _grp && _grp.worst ? ('worst ' + esc(_grp.worst)) : 'unclassified';
        const _badgeStyle = (edge, ink) => `display:inline-block; margin-left:6px; padding:1px 7px; font-size:10px; font-weight:700; letter-spacing:0.03em; border:1px solid ${edge}; color:${ink}; border-radius:9px; background:var(--color-surface-2); white-space:nowrap;`;
        const _grpBadge = !_isHead ? '' : (function () {
            const n = _grp.count;
            switch (_grp.kind) {
                case 'duplicate':
                    return `<span class="fha-group-badge fha-group-dup" title="${n} rows share this failure-condition id, cover the SAME flight phases and carry the same class — duplicates, most often repeated drafts accepted into the project. Merge or delete the extras; until then the fault trees take the worst of the copies." style="${_badgeStyle('var(--color-warning, #7A5300)', 'var(--color-warning, #7A5300)')}">${n} duplicate rows · same phases</span>`;
                case 'overlap':
                    return `<span class="fha-group-badge fha-group-contra" title="A flight phase can carry only ONE effect and one class per failure condition. These rows name ${esc((_grp.twice || []).join(', '))} more than once with different classes — decide which row owns each phase and remove it from the other." style="${_badgeStyle('#B42318', '#B42318')}">⚠ phase assessed twice — ${esc((_grp.twice || []).slice(0, 3).join(', '))}</span>`;
                case 'contradiction':
                    return `<span class="fha-group-badge fha-group-contra" title="${n} rows share this failure-condition id and the SAME flight phases but are classified differently. The same condition in the same phases cannot be two classes — resolve which is right; until then the fault trees take the worst." style="${_badgeStyle('var(--color-danger, #8E2A2A)', 'var(--color-danger, #8E2A2A)')}">${n} rows · same phases, different class — resolve</span>`;
                case 'consolidate':
                    return `<span class="fha-group-badge fha-group-merge" title="${n} rows share this failure-condition id with different phase lists but the SAME class and the SAME effects. Rows come from effects, not from phases: where the effect and class are the same across phases, this is ONE row listing all of those phases. Merge them — a single row also gives the exposure ratio the full phase list it should have." style="${_badgeStyle('var(--color-warning, #7A5300)', 'var(--color-warning, #7A5300)')}">${n} rows · same class across phases — should be one row</span>`;
                default:
                    // 4 Sep 2026 (Waqas, on "phase group × 2 · worst Major"): "you do not need that
                    // pill its standard practice what we are doing" — a condition split into rows
                    // by phase because its effects differ IS the method (rows come from effects);
                    // it earns no badge. Duplicates, contradictions and consolidation candidates
                    // above still do — those are findings.
                    return '';
            }
        })();
        const _fcCell = _isMember
            ? `<span style="color:var(--color-text-tertiary);" title="${({
                    duplicate:     `Duplicate of ${esc(row.fcId)} — same failure condition, same flight phases, same class.`,
                    contradiction: `Conflicts with ${esc(row.fcId)} — same failure condition and phases, classified differently. Resolve.`,
                    consolidate:   `Belongs on the ${esc(row.fcId)} row — same failure condition and class, only the phase list differs. Merge.`,
                    overlap:       `Shares a phase with another ${esc(row.fcId)} row under a different class — a phase carries one effect and one class per condition. Resolve.`,
                    phase:         `Member of phase group ${esc(row.fcId)} — same failure condition, genuinely different effects and class in these phases.`
                })[_grp.kind] || ''}">└ ${esc(row.fcId)}</span>`
            : `<strong>${esc(row.fcId)}</strong>`;
        // 5 Sep 2026 (Waqas): "I dont want any badges in that column" — the FC ID cell is the
        // id alone; the group finding (duplicate / conflict / phase assessed twice / merge)
        // opens the Comments cell of the group head instead, so nothing is lost. Sub-Function
        // a bit wider; Effects and Comments much wider.
        const _findingHtml = _grpBadge ? `<div style="margin:0 0 4px 0;">${_grpBadge.replace('margin-left:6px;', 'margin-left:0;')}</div>` : '';
        return `<tr${_obsCls}${_hfwAttr}${_isMember ? ' data-fha-group-member="1"' : ''}><td>${rowActionsHTML('editACFHA', 'deleteACFHA', row.internalId, _fhaExtra)}</td><td style="width:1%;min-width:160px;">${_fhaSubCell(row.subId)}</td><td style="width:1%;white-space:nowrap;">${_fcCell}</td><td style="min-width:120px;max-width:170px;">${_obsBadge}${esc(row.fcDesc)}</td><td style="width:1%;white-space:nowrap;">${_fhaPhasesCell(row)}</td><td style="min-width:480px;width:34%;">${effectsHtml}</td><td class="cell-${esc(row.severity)}" style="width:1%;white-space:nowrap;">${esc(row.severity)}${_hfwBadge}</td><td style="width:1%;max-width:120px;">${renderFhaAsmLinksHtml(row.assumptionIds)}</td><td style="min-width:480px;width:34%;">${_findingHtml}${_fhaCommentsCell(row)}</td>${customTds}${reviewTd}</tr>`;
    };
    if (typeof SLPaginate !== 'undefined' && SLPaginate.pageTbody) {
        SLPaginate.pageTbody({ key: 'fha-ac', tbody, rows: _fhaGrouping.ordered, rowHtml: _fhaRowHtml,
            label: (f, t, n) => 'failure conditions ' + f + '–' + t + ' of ' + n + ' — severity counts and rollups computed over the full worksheet' });
    } else {
        _fhaGrouping.ordered.forEach(row => tbody.insertAdjacentHTML('beforeend', _fhaRowHtml(row)));
    }
    // Phase 54 — keep the thead in sync with the body.
    if (typeof _injectCustomColumnHeaders === 'function') _injectCustomColumnHeaders();
}

// Phase 53.13 — chart trigger button + modal plumbing.
// Only shown on FHA rows whose severity routes through AC 25.1309-1B Fig 2
// (Major / Hazardous / Catastrophic). Color reflects characterized state.
function _fhaChartTriggerHtml(row, scope) {
    if (!row || !row.severity) return '';
    const sev = row.severity;
    if (sev !== 'Major' && sev !== 'Hazardous' && sev !== 'Catastrophic') return '';
    const cp = row.chartProps || {};
    let characterized = false;
    if (cp.similarPrior === true) characterized = true;
    else if (sev === 'Major' && (cp.isSimple !== null && cp.isSimple !== undefined) && (cp.isRedundant !== null && cp.isRedundant !== undefined)) characterized = true;
    else if ((sev === 'Hazardous' || sev === 'Catastrophic') && (cp.isSimpleConventional !== null && cp.isSimpleConventional !== undefined)) characterized = true;
    const tip = characterized ? 'Chart characterized — click to review' : 'Chart not characterized — click to walk through AC 25.1309-1B Fig 2';
    return '<button class="fha-chart-trigger ' + (characterized ? 'characterized' : '') + '" '
        + 'onclick="openFhaChartModal(\'' + esc(row.internalId) + '\', \'' + scope + '\')" '
        + 'title="' + esc(tip) + '">📋 Chart</button>';
}

function _patchReqRowActions(tr, row, scopeKind) {
    if (!tr || !row) return;
    // Phase 57 — inject into the new kebab menu (.row-action-menu) instead of the old action group.
    const menu = tr.querySelector('.row-action-menu');
    if (!menu) return;
    // Avoid re-injecting on repeated renders.
    if (menu.querySelector('[data-hist-btn]')) return;
    const id = String(row.internalId);
    const restoreFn = scopeKind === 'ac' ? 'restoreACReq' : 'restoreSysReq';
    const deleteItem = menu.querySelector('.ram-danger');
    // History menu item — inserted just above Delete.
    const histBtn = document.createElement('button');
    histBtn.type = 'button';
    histBtn.setAttribute('role', 'menuitem');
    histBtn.setAttribute('data-hist-btn', '1');
    histBtn.setAttribute('title', 'View change history');
    histBtn.textContent = '🕒 History';
    histBtn.onclick = function(e){
        e.stopPropagation();
        if (typeof closeAllRowMenus === 'function') closeAllRowMenus();
        if (typeof openReqHistoryPanel === 'function') openReqHistoryPanel(id, scopeKind);
    };
    if (deleteItem) menu.insertBefore(histBtn, deleteItem); else menu.appendChild(histBtn);

    if (row.deleted) {
        const restore = document.createElement('button');
        restore.type = 'button';
        restore.setAttribute('role', 'menuitem');
        restore.setAttribute('data-restore-btn', '1');
        restore.setAttribute('title', 'Restore deleted requirement');
        restore.textContent = '↺ Restore';
        restore.onclick = function(e){ e.stopPropagation(); if (typeof closeAllRowMenus === 'function') closeAllRowMenus(); window[restoreFn](id); };
        if (deleteItem) menu.insertBefore(restore, deleteItem); else menu.appendChild(restore);
    }
}

// Phase 62.5 (B3) — assumption routing (ARP4761A A.6/C.6/D.4.3.2). Every assumption
// is either owned where it stands or routed to the level/organization that must
// confirm it. Routing is metadata on the existing rows; confirmation remains the
// existing Proposed → Validated → Verified state machine + artifact fields.
function _asmRouteSelect(scopeKind, asmId, row) {
    const cur = row.routeTo || '';
    const fn = scopeKind === 'ac' ? 'updateACAsmRoute' : 'updateSysAsmRoute';
    let opts = '<option value=""' + (cur === '' ? ' selected' : '') + '>— route to… —</option>' +
        '<option value="this"' + (cur === 'this' ? ' selected' : '') + '>Owned here (no routing needed)</option>';
    if (scopeKind === 'sys') opts += '<option value="aircraft"' + (cur === 'aircraft' ? ' selected' : '') + '>Aircraft level</option>';
    opts += '<option value="design"' + (cur === 'design' ? ' selected' : '') + '>Design organization (SDD)</option>' +
        '<option value="ops"' + (cur === 'ops' ? ' selected' : '') + '>Operations / procedures</option>';
    (systemsData || []).forEach(s => {
        const v = 'system:' + s.id;
        opts += '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>System — ' + esc(s.name) + '</option>';
    });
    // Free-text / imported routes (e.g. "Ops — AFM procedure") are still valid routings —
    // keep them selected instead of showing the row as unrouted.
    if (cur && ['', 'this', 'aircraft', 'design', 'ops'].indexOf(cur) === -1 && cur.indexOf('system:') !== 0) {
        opts += '<option value="' + esc(cur) + '" selected>' + esc(cur) + '</option>';
    }
    const stamp = row.routeTo && row.routeAt
        ? '<div style="font-size:10.5px; color: var(--color-text-tertiary); font-family: var(--font-mono);">routed ' + esc(String(row.routeAt).slice(0, 10)) + (row.routeBy ? ' · ' + esc(row.routeBy) : '') + '</div>' : '';
    const warn = !row.routeTo ? ' style="border-color: var(--color-warning);"' : '';
    return '<select class="state-select"' + warn + ' title="C.6 — route this assumption to whoever must confirm it" onchange="' + fn + '(\'' + esc(asmId) + '\', this.value)">' + opts + '</select>' + stamp;
}
function updateACAsmRoute(id, val) {
    const a = acAssumptionsData.find(x => x.asmId === id);
    if (a) { a.routeTo = val; a.routeAt = val ? new Date().toISOString() : ''; a.routeBy = val ? (_signoffReviewerName() || '') : ''; }
    renderACAssumptions();
}
function updateSysAsmRoute(id, val) {
    const a = sys() && sys().asm.find(x => x.asmId === id);
    if (a) { a.routeTo = val; a.routeAt = val ? new Date().toISOString() : ''; a.routeBy = val ? (_signoffReviewerName() || '') : ''; }
    renderSysAssumptions();
}

// 4 Sep 2026 (Waqas): "one table is sufficient". The Assumptions page carried the same
// records three times — the working log, a "program register" (what rests on each
// assumption) and a "typed assumptions" panel (type, credited ⇄ uncredited posture).
// The two extra tables are gone from this page; their columns live on the log now.
// The where-used map comes from assumption_moat (SafetyLabAsmMoat), the typed lanes
// from hf_assumptions (HF_ASSUMPTIONS); every write still goes through the app's own
// row-update path. The HF page keeps its own typed panel — that one is HF authoring.
function _asmMoatUses() {
    try { if (window.SafetyLabAsmMoat && typeof SafetyLabAsmMoat.whereUsed === 'function') return SafetyLabAsmMoat.whereUsed(); } catch (_) {}
    return { map: new Map(), gaps: [] };
}
function _asmRestsOnCell(asmId, state, wu) {
    const uses = (wu && wu.map && wu.map.get(asmId)) || [];
    const dead = ['Invalidated', 'Retired', 'Rejected', 'Withdrawn'].indexOf(String(state || '')) >= 0;
    if (!uses.length) return '<span style="color:#B7791F; font-weight:600; font-size:11px;" title="Nothing in the analysis depends on this assumption yet — bind it to the rows it supports, or retire it">nothing rests on it</span>';
    const head = dead ? '<span class="u-mono" style="font-weight:800; color:#8E2A2A;" title="This assumption is ' + esc(state) + ' but the analysis still depends on it">' + uses.length + ' BROKEN</span> — ' : '<span class="u-mono" style="font-weight:700;">' + uses.length + '</span> — ';
    return '<span style="font-size:11px;">' + head + esc(uses.slice(0, 4).map(u => u.detail).join(' · ')) + (uses.length > 4 ? ' <span style="color:var(--color-text-tertiary);">+' + (uses.length - 4) + ' more</span>' : '') + '</span>';
}
const _ASM_TYPE_COLOR = { hf: '#7A3EA8', dz: '#0E5A8A', rg: '#8E2A2A', op: '#1E6B4F', mx: '#8A5B0E', en: '#3F6212', sw: '#4A4A8A', hw: '#6B3F14', rd: '#116673' };
function _asmTypeCell(row, fn) {
    const hf = (typeof HF_ASSUMPTIONS !== 'undefined') ? HF_ASSUMPTIONS : null;
    const types = (hf && Array.isArray(hf.ASM_TYPES)) ? hf.ASM_TYPES : [];
    const cur = String(row.type || '');
    return '<select class="state-select" style="min-width:110px;" title="Assumption type — sets which lane rules apply (human-factors types get an HFA work item)" onchange="' + fn + '(\'' + esc(row.asmId) + '\', \'type\', this.value)">' +
        '<option value=""' + (cur ? '' : ' selected') + '>— type —</option>' +
        types.map(t => '<option value="' + esc(t.label) + '"' + (cur === t.label || cur === t.id ? ' selected' : '') + '>' + esc(t.label) + '</option>').join('') +
        (cur && !types.some(t => t.label === cur || t.id === cur) ? '<option value="' + esc(cur) + '" selected>' + esc(cur) + '</option>' : '') +
        '</select>';
}
function _asmPostureCell(row, fn) {
    const hf = (typeof HF_ASSUMPTIONS !== 'undefined') ? HF_ASSUMPTIONS : null;
    const validated = hf ? hf.isValidated(row.state) : (row.state === 'Validated' || row.state === 'Verified');
    const cr = row.credited == null ? '' : String(row.credited), uc = row.uncredited == null ? '' : String(row.uncredited);
    const eff = validated ? cr : uc;
    const inp = (lane, val, ph, tip) => '<input type="text" style="width:100%; min-width:90px; font-size:11px; padding:3px 5px;" placeholder="' + ph + '" title="' + tip + '" value="' + esc(val) + '" onchange="' + fn + '(\'' + esc(row.asmId) + '\', \'' + lane + '\', this.value)">';
    return '<div style="display:flex; flex-direction:column; gap:3px; min-width:150px;">' +
        '<div style="display:flex; align-items:center; gap:4px;"><span class="u-mono" style="font-size:9.5px; color:#1D9E75; width:62px;">credited</span>' + inp('credited', cr, 'credited posture', 'What the analysis credits while this assumption is Validated or Verified') + '</div>' +
        '<div style="display:flex; align-items:center; gap:4px;"><span class="u-mono" style="font-size:9.5px; color:#8E2A2A; width:62px;">uncredited</span>' + inp('uncredited', uc, 'conservative posture', 'What holds while the assumption is NOT validated') + '</div>' +
        ((cr || uc) ? '<div class="u-mono" style="font-size:10px; font-weight:700; color:' + (validated ? '#1D9E75' : '#8E2A2A') + ';" title="The lane the analysis reads right now — credited only while Validated / Verified">holds now: ' + esc(eff || '—') + '</div>' : '') +
        '</div>';
}
function _asmFindingsHtml(scopeSys) {
    let out = '';
    try {
        const wu = _asmMoatUses();
        (wu.gaps || []).forEach(g => { out += '<p style="font-size:11.5px; color:#B7791F; font-weight:600; margin:4px 0;">⚠ ' + esc(g) + '</p>'; });
        const hf = (typeof HF_ASSUMPTIONS !== 'undefined') ? HF_ASSUMPTIONS : null;
        if (hf && typeof hf.inv16 === 'function') (hf.inv16().fails || []).forEach(f => { out += '<p style="font-size:11.5px; color:#8E2A2A; font-weight:600; margin:4px 0;">⚠ Unvalidated credit · ' + esc(f.detail) + '</p>'; });
    } catch (_) {}
    return out;
}
function _asmRenderFindings(tableId) {
    const t = document.getElementById(tableId); if (!t) return;
    let host = document.getElementById(tableId + '-findings');
    if (!host) { host = document.createElement('div'); host.id = tableId + '-findings'; host.style.cssText = 'padding:6px 2px;'; t.parentNode.insertBefore(host, t.nextSibling); }
    host.innerHTML = _asmFindingsHtml();
}
function renderACAssumptions() {
    const tbody = document.getElementById('ac-asm-body'); tbody.innerHTML = '';
    const _wu = _asmMoatUses();   // one where-used pass per render, shared by every row
    // ENG-2 phase 1c — paginated via the shared pager (>50 rows).
    const _acAsmRowHtml = row => {
        let dynFields = _asmRouteSelect('ac', row.asmId, row);
        if (row.state === 'Validated' || row.state === 'Verified') {
            dynFields += `<input type="text" placeholder="Validation Strategy" value="${esc(row.valStrategy||'')}" onchange="updateACAsmText('${esc(row.asmId)}', 'valStrategy', this.value)"><input type="text" placeholder="Validation Artifacts" value="${esc(row.valArtifact||'')}" onchange="updateACAsmText('${esc(row.asmId)}', 'valArtifact', this.value)">`;
        }
        if (row.state === 'Verified') {
            dynFields += `<input type="text" placeholder="Verification Artifacts" value="${esc(row.verArtifact||'')}" onchange="updateACAsmText('${esc(row.asmId)}', 'verArtifact', this.value)">`;
        }
        // Phase 50 — no action column on this table; tuck the 💬 button next to the ID.
        const commentBtn = (typeof commentTriggerHtml === 'function')
            ? commentTriggerHtml({ kind: 'acAsm', id: row.asmId, systemId: null }) : '';
        return `<tr><td><div style="display:flex; align-items:center; gap:6px;"><strong>${esc(row.asmId)}</strong>${commentBtn}</div></td><td>${esc(row.origin)}</td><td style="min-width:260px;">${esc(row.text)}</td><td>${_asmTypeCell(row, 'updateACAsmText')}</td><td>${_asmPostureCell(row, 'updateACAsmText')}</td><td>${renderLinkedFHAsHtml(row.asmId)}</td><td>${_asmRestsOnCell(row.asmId, row.state, _wu)}</td><td style="width: 140px;"><select class="state-select" onchange="updateACAsmState('${esc(row.asmId)}', this.value)"><option value="Proposed" ${row.state==='Proposed'?'selected':''}>Proposed</option><option value="Validated" ${row.state==='Validated'?'selected':''}>Validated</option><option value="Verified" ${row.state==='Verified'?'selected':''}>Verified</option><option value="Invalidated" ${row.state==='Invalidated'?'selected':''}>Invalidated</option></select></td><td><div class="asm-dynamic-fields">${dynFields}</div></td></tr>`;
    };
    if (typeof SLPaginate !== 'undefined' && SLPaginate.pageTbody) {
        SLPaginate.pageTbody({ key: 'asm-ac', tbody, rows: acAssumptionsData, rowHtml: _acAsmRowHtml,
            label: (f, t, n) => 'assumptions ' + f + '–' + t + ' of ' + n + ' — validation gates computed over the full register' });
    } else {
        acAssumptionsData.forEach(row => tbody.insertAdjacentHTML('beforeend', _acAsmRowHtml(row)));
    }
    _asmRenderFindings('ac-asm-table');
}
function updateACAsmState(id, newState) { const asm = acAssumptionsData.find(a => a.asmId === id); if(asm) asm.state = newState; renderACAssumptions(); }
function updateACAsmText(id, field, val) {
    const asm = acAssumptionsData.find(a => a.asmId === id); if(asm) asm[field] = val;
    // type / posture change what "holds now" and the credit findings read — re-render for those
    if (field === 'type' || field === 'credited' || field === 'uncredited') { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} renderACAssumptions(); }
}


// ==========================================
// SYSTEM WORKSPACE CRUD LOGIC
// Per-system arrays accessed via sys()?.X — factory bails silently when no system is open.
// FHA stays custom below.
// ==========================================
// Multi-trace helpers — a system function can implement multiple AC functions.
function _getSysFuncTraceValues() {
    return _getCheckboxListValues(document.getElementById('sys-func-trace'));
}
function populateSysFuncTraceDropdown(selectedIds) {
    const el = document.getElementById('sys-func-trace');
    if (!el) return;
    const current = selectedIds || _getCheckboxListValues(el);
    // Phase 53.22 — trace to aircraft SUB-FUNCTIONS, deduped by subId. The
    // acFunctionsData store keeps one row per sub-function (so "Control Flight
    // Path" appears N times with sub-functions 1.1–1.6); we want each sub-id
    // to show exactly once.
    const seen = new Set();
    const options = [];
    (acFunctionsData || []).forEach(f => {
        const id = (f.subId || '').trim();
        if (!id || seen.has(id)) return;
        seen.add(id);
        // Display "1.1 · Provide Pitch Control" (sub-function id + name).
        // Fall back gracefully when subName is missing.
        const label = id + (f.subName ? '  ·  ' + f.subName : '');
        options.push({ value: id, label });
    });
    // Stable order: lexicographic on sub-id so 1.1 / 1.2 / … render in sequence.
    options.sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true }));
    _renderCheckboxList(el, options, current, {
        emptyText: 'No aircraft sub-functions defined yet — add some in Aircraft Functions first.'
    });
}
// Render the trace-list cell for the system function table — chips per linked
// AC sub-function. Phase 53.22 — lookup is by subId. Phase 53.24 — chips stack
// vertically and the cell collapses to the first 2 by default; a "+N more"
// badge reveals the rest in-place when clicked (one-way; click again to hide
// — works as a tiny native <details>).
function _renderSysFuncTraceCell(row) {
    const ids = Array.isArray(row.traceIds) ? row.traceIds : (row.traceId ? [row.traceId] : []);
    if (!ids.length) return '<span class="u-muted">—</span>';
    function chipHtml(id) {
        const f = (acFunctionsData || []).find(x => x.subId === id);
        const label = f
            ? (id + (f.subName ? ' · ' + f.subName.slice(0, 28) : ''))
            : id + ' (orphan)';
        const tone = f
            ? 'background: var(--color-accent-soft); color: var(--color-accent); border: 1px solid rgba(0, 122, 255, 0.18);'
            : 'background: rgba(255, 149, 0, 0.12); color: var(--sev-haz-fg); border: 1px solid rgba(255, 149, 0, 0.32);';
        return '<span style="display: block; padding: 2px 8px; ' + tone + ' border-radius: var(--r-full); font-size: 11px; margin: 2px 0; width: fit-content;">' + esc(label) + '</span>';
    }
    const MAX_VISIBLE = 2;
    if (ids.length <= MAX_VISIBLE) {
        return ids.map(chipHtml).join('');
    }
    const visible = ids.slice(0, MAX_VISIBLE).map(chipHtml).join('');
    const hidden  = ids.slice(MAX_VISIBLE).map(chipHtml).join('');
    return '<details class="trace-more"><summary>' + visible +
           '<span class="trace-more-toggle">+ ' + (ids.length - MAX_VISIBLE) + ' more</span></summary>' +
           hidden + '</details>';
}

function _tokenize(s) {
    const STOP = new Set(['the','a','an','of','to','from','for','on','in','and','or','at','by','is','was','will','be','has','have']);
    return new Set(String(s || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(t => t && !STOP.has(t)));
}
function _jaccard(a, b) {
    if (!a.size || !b.size) return 0;
    let inter = 0;
    a.forEach(x => { if (b.has(x)) inter++; });
    return inter / (a.size + b.size - inter);
}
function autoFillFcIdsForActiveSystem() {
    const s = sys();
    if (!s) { if (typeof showToast === 'function') showToast('Open a system folder first.', 'warning', 3000); return; }
    if (!Array.isArray(s.fha) || !s.fha.length) {
        if (typeof showToast === 'function') showToast('No FHA rows in this system.', 'info', 2400);
        return;
    }
    // Build (subId → list of candidate FC entries) from FCIM, plus a global list.
    const bySubId = new Map();
    const all = [];
    (s.fcim || []).forEach(f => {
        const entries = [];
        if (f.tlId) entries.push({ id: f.tlId, desc: f.tlDesc, type: 'TL', subId: f.subId });
        if (f.plId) entries.push({ id: f.plId, desc: f.plDesc, type: 'PL', subId: f.subId });
        if (f.mId)  entries.push({ id: f.mId,  desc: f.mDesc,  type: 'M',  subId: f.subId });
        entries.forEach(e => {
            all.push(e);
            if (e.subId) {
                if (!bySubId.has(e.subId)) bySubId.set(e.subId, []);
                bySubId.get(e.subId).push(e);
            }
        });
    });
    if (!all.length) { if (typeof showToast === 'function') showToast('No FCIM data to draw FC IDs from.', 'warning', 3000); return; }

    const THRESH = 0.4;
    let filled = 0;
    const details = [];
    s.fha.forEach(row => {
        if (row.fcId) return;                       // skip already-set rows
        const target = _tokenize(row.fcDesc);
        if (!target.size) return;
        let bestEntry = null, bestScore = 0;
        const pool = (row.subId && bySubId.has(row.subId)) ? bySubId.get(row.subId) : all;
        pool.forEach(e => {
            const score = _jaccard(target, _tokenize(e.desc));
            if (score > bestScore) { bestScore = score; bestEntry = e; }
        });
        if (bestEntry && bestScore >= THRESH) {
            row.fcId = bestEntry.id;
            // If the FHA's fcDesc was just a partial match, leave it; user can clean up later.
            filled++;
            details.push((row.subId || '—') + ' / ' + bestEntry.id + ' (score ' + bestScore.toFixed(2) + ')');
        }
    });
    rebuildExtractedFCsForAllSystems();   // belt-and-braces: ensure dropdowns have every option
    if (typeof renderSysFHA === 'function') renderSysFHA();
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
    if (typeof showToast === 'function') {
        if (filled === 0) {
            showToast('No blank FC ID matched any FCIM description above threshold.', 'info', 3600);
        } else {
            showToast('Filled FC ID on ' + filled + ' row' + (filled === 1 ? '' : 's') + ' from FCIM.', 'success', 3600);
        }
    }
    if (details.length && typeof console !== 'undefined') console.log('[SafetyLab] auto-filled FC IDs:\n  - ' + details.join('\n  - '));
}

function syncSysFHACondition() { const t = sys().extractedFCs.find(fc => fc.id === document.getElementById('sys-fha-fcid').value); document.getElementById('sys-fha-fcdesc').value = t ? t.desc : ''; }
function submitSysFHA() {
    if (!sys()) return alert('Please open a system folder first.');
    // 20 Aug 2026 — same agreement guard as the aircraft form. At system level the pairing is
    // system function ↔ system failure condition; the defect and the consequence are identical.
    {
        const _sub = document.getElementById('sys-fha-subfunc').value;
        const _fc  = document.getElementById('sys-fha-fcid').value;
        const _chk = _fhaPairCheck('sys', _sub, _fc, sys().id);
        if (!_chk.ok) {
            alert('Cannot log this system FHA row.\n\n' + _chk.reason +
                  '\n\nAn SFHA row asserts that THIS system function has THIS failure condition. ' +
                  'Pick the failure condition that belongs to ' + _sub + ', or change the system function to ' +
                  _fcOwnerSubId('sys', _fc, sys().id).subId + '.');
            return;
        }
    }
    const newInput = document.getElementById('sys-fha-asm');
    if (newInput && newInput.value.trim() !== '') createNewAssumption('sys');

    const assumptionIds = getFhaAsmIds('sys');
    const data = {
        internalId: editStates.sysFha || newRowId(),
        acTrace: document.getElementById('sys-fha-ac-trace').value,
        subId: document.getElementById('sys-fha-subfunc').value,
        // 21 Aug 2026 (L1) — the dropdown offers this system's FUNCTIONS, so the
        // value IS the function key; record it explicitly too.
        sysFuncId: document.getElementById('sys-fha-subfunc').value,
        fcId: document.getElementById('sys-fha-fcid').value,
        fcDesc: document.getElementById('sys-fha-fcdesc').value,
        phases: getCheckedValues('sys-fha-phases'),
        effAc: document.getElementById('sys-fha-eff-ac').value,
        effCrew: document.getElementById('sys-fha-eff-crew').value,
        effPax: document.getElementById('sys-fha-eff-pax').value,
        severity: document.getElementById('sys-fha-sev').value,
        assumptionIds,
        comments: document.getElementById('sys-fha-comments').value,
    };
    const arr = sys().fha;
    if (editStates.sysFha) {
        const idx = arr.findIndex(i => String(i.internalId) === String(editStates.sysFha));   // 28 Aug 2026 — see the acFha twin
        if (idx >= 0) arr[idx] = Object.assign({}, arr[idx], data, { humanEdited: true, humanEditedAt: new Date().toISOString() }); else arr.push(data);   // 3 Sep 2026 — see submitACFHA
    } else {
        arr.push(data);
    }
    cancelEdit('sysFha');
    renderSysFHA();
    renderSysAssumptions();
}
function editSysFHA(iId) {
    // 28 Aug 2026 — String() both sides: the kebab onclick always passes the id as a
    // string, while seeded/legacy rows store numbers. Strict === made Edit AND Delete
    // a silent no-op on every numeric-id row. Same coercion the rest of the codebase
    // already uses (String(x.internalId) === String(id)).
    const item = sys().fha.find(x => String(x.internalId) === String(iId)); if (!item) return;
    document.getElementById('sys-fha-ac-trace').value = item.acTrace || '';
    document.getElementById('sys-fha-subfunc').value = item.subId;
    // See editACFHA — filter to the selected function, keeping this row's own FC visible.
    document.getElementById('sys-fha-fcid').value = item.fcId;
    if (typeof _refreshFhaFcOptions === 'function') _refreshFhaFcOptions('sys');
    document.getElementById('sys-fha-fcid').value = item.fcId;
    document.getElementById('sys-fha-fcdesc').value = item.fcDesc;
    renderFhaPhaseGrid('sys-fha-phases', item.phases);
    setCheckedValues('sys-fha-phases', item.phases);
    document.getElementById('sys-fha-eff-ac').value = item.effAc || '';
    document.getElementById('sys-fha-eff-crew').value = item.effCrew || '';
    document.getElementById('sys-fha-eff-pax').value = item.effPax || '';
    document.getElementById('sys-fha-sev').value = item.severity;
    document.getElementById('sys-fha-comments').value = item.comments || '';
    populateFhaAsmDropdown('sys');
    renderFhaAsmChips('sys', item.assumptionIds || []);
    editStates.sysFha = iId; setEditMode('sysFha'); window.scrollTo(0, 0);
}
function deleteSysFHA(iId) {
    sys().fha = sys().fha.filter(x => String(x.internalId) !== String(iId));   // 28 Aug 2026 — see editACFHA
    renderSysFHA();
    renderSysAssumptions();
}
function renderSysFHA() {
    renderFhaPhaseGrid('sys-fha-phases');
    if (!sys()) { const tb = document.getElementById('sys-fha-body'); if (tb) tb.innerHTML = ''; return; }
    const tbody = document.getElementById('sys-fha-body'); tbody.innerHTML = '';
    const activeSysId = sys() ? sys().id : null;
    // ENG-2 phase 1b — paginated via the shared pager (>50 rows).
    const _sysFhaRowHtml = row => {
        const effectsHtml = (window.SLSeverityAxes && typeof SLSeverityAxes.effectsHtml === 'function') ? SLSeverityAxes.effectsHtml(row)   // 3 Sep 2026 — level chip per axis + the sentence that justifies it
            : `<strong>AC:</strong> ${esc(row.effAc || 'None')}<br><strong>Crew:</strong> ${esc(row.effCrew || 'None')}<br><strong>Pax:</strong> ${esc(row.effPax || 'None')}`;
        // Phase 53.73 — comment + approval moved to dedicated Review column at end of row.
        const chartBtn = _fhaChartTriggerHtml(row, 'sys');
        const reviewTd = reviewCellHtml('sysFha', row.internalId, activeSysId);
        // Phase 53.21 — AC Trace column removed from the table (the linkage data
        // is still stored on row.acTrace / row.acTraces[]; visible cross-scope
        // mapping lives on the Traceability tab + each row's back-reference panel).
        const _fhaExtra = `<button type="button" role="menuitem" onclick="openGoldenThreadModal('${esc(row.internalId)}', 'SYS')">🧵 Golden Thread</button>${chartBtn}`;
        // Cascade obsolescence — flag the whole row + badge the failure-condition cell.
        const _obsCls = row.obsolete ? ' class="slab-obsolete"' : '';
        const _obsBadge = row.obsolete ? '<span class="slab-obsolete-badge" title="' + esc(row.obsoleteReason || 'Obsolete') + '">OBSOLETE</span>' : '';
        // INV-HFW — crew-workload ↔ severity divergence badge (hf_severity_badge.js).
        const _hfw = (typeof HFSeverityCheck !== 'undefined' && HFSeverityCheck.evalRow) ? HFSeverityCheck.evalRow(row) : null;
        const _hfwAttr = _hfw ? ' data-hfw="1"' : '';
        const _hfwBadge = (_hfw && typeof HFW_UI !== 'undefined') ? HFW_UI.badge(row, 'SYS', _hfw) : '';
        // 21 Aug 2026 (L1) — an SFHA row belongs to a SYSTEM FUNCTION. Rows the
        // form wrote carry a funcId in subId already; a seed-era row keyed to an
        // aircraft sub-function gets an amber re-key control, suggested from the
        // system FCIM join when it exists. Signed, provenance on the row.
        const _l1Key = _sysFhaFuncKey(sys(), row);
        const _l1Fns = (sys().functions || []).filter(f => f && f.funcId);
        const _l1Sugg = _l1Key ? null : _sysFhaFcimSuggestion(sys(), row);
        const _l1Cell = _l1Key
            ? `<strong>${esc(_fhaSubFunctionDisplay(_l1Key))}</strong>`
            : `<strong>${esc(_fhaSubFunctionDisplay(row.subId))}</strong><div style="font-size:10px; color:#9A6200; font-weight:600;" title="This row is keyed to an aircraft sub-function. SFHA rows belong to a SYSTEM function (ARP4761A Q.5 granularity — the tighter-of-two rule needs this key).">keyed to aircraft sub-function</div>` +
              (_l1Fns.length
                ? `<select class="state-select" style="max-width:170px; font-size:10.5px;" onchange="sysFhaRekey('${esc(sys().id)}','${esc(String(row.internalId))}', this.value)"><option value="">— re-key to function —</option>` +
                  _l1Fns.map(f => `<option value="${esc(f.funcId)}"${_l1Sugg === String(f.funcId) ? ' selected-suggested' : ''}>${esc(f.funcName || f.funcId)}${_l1Sugg === String(f.funcId) ? ' (FCIM match)' : ''}</option>`).join('') + `</select>`
                : `<div style="font-size:10px; color:var(--color-text-tertiary);">declare functions on this system first</div>`)
        ;
        return `<tr${_obsCls}${_hfwAttr}><td>${rowActionsHTML('editSysFHA', 'deleteSysFHA', row.internalId, _fhaExtra)}</td><td style="width:1%;min-width:160px;">${_l1Cell}</td><td style="width:1%;white-space:nowrap;"><strong>${esc(row.fcId)}</strong></td><td style="min-width:120px;max-width:170px;">${_obsBadge}${esc(row.fcDesc)}</td><td style="width:1%;white-space:nowrap;">${_fhaPhasesCell(row)}</td><td style="min-width:480px;width:34%;">${effectsHtml}</td><td class="cell-${esc(row.severity)}" style="width:1%;white-space:nowrap;">${esc(row.severity)}${_hfwBadge}</td><td style="width:1%;max-width:120px;">${renderFhaAsmLinksHtml(row.assumptionIds)}</td><td style="min-width:480px;width:34%;">${_fhaCommentsCell(row)}</td>${reviewTd}</tr>`;
    };
    // 31 Aug 2026 — same ordered view as the AC table: natural ascending fcId,
    // same-id phase rows clustered, blank ids last.
    const _sysFhaOrdered = _fhaGroupRows(sys().fha).ordered;
    if (typeof SLPaginate !== 'undefined' && SLPaginate.pageTbody) {
        SLPaginate.pageTbody({ key: 'fha-sys', tbody, rows: _sysFhaOrdered, rowHtml: _sysFhaRowHtml,
            label: (f, t, n) => 'failure conditions ' + f + '–' + t + ' of ' + n + ' — severity counts and rollups computed over the full worksheet' });
    } else {
        _sysFhaOrdered.forEach(row => tbody.insertAdjacentHTML('beforeend', _sysFhaRowHtml(row)));
    }
}

function _populatePraModelTypeDropdown(){
    const sel = document.getElementById('pra-model-type');
    if (!sel) return;
    const opts = ['<option value="">— Select analysis model —</option>'];
    Object.keys(PR_MODEL_SCHEMAS).forEach(key => {
        opts.push('<option value="' + esc(key) + '">' + esc(PR_MODEL_SCHEMAS[key].label) + '</option>');
    });
    sel.innerHTML = opts.join('');
}

function _renderPraModelForm(typeId, paramValues){
    const desc = document.getElementById('pra-model-description');
    const host = document.getElementById('pra-model-params');
    if (!host) return;
    paramValues = paramValues || {};
    const schema = typeId ? PR_MODEL_SCHEMAS[typeId] : null;
    if (!schema) {
        if (desc) desc.textContent = 'Choose the analysis model that matches this particular risk. Each model defines the physical / geometric parameters needed to assess impact zones and CSFL outcomes.';
        host.innerHTML = '';
        return;
    }
    if (desc) desc.textContent = schema.description;
    const rows = schema.params.map((p, idx) => {
        const v = paramValues[p.id] != null ? paramValues[p.id] : (p.default != null ? p.default : '');
        const fid = 'pra-model-param-' + p.id;
        const help = p.help ? ' <span class="u-muted-italic">' + esc(p.help) + '</span>' : '';
        const unit = p.unit ? ' <span style="color: var(--color-text-tertiary); font-family: var(--font-mono);">' + esc(p.unit) + '</span>' : '';
        let input;
        if (p.type === 'select') {
            input = '<select id="' + fid + '" data-pra-param="' + esc(p.id) + '">'
                  + p.options.map(o => '<option value="' + esc(o) + '"' + (String(v) === String(o) ? ' selected' : '') + '>' + esc(o) + '</option>').join('')
                  + '</select>';
        } else if (p.type === 'multiselect') {
            const checked = Array.isArray(v) ? v.map(String) : (v ? String(v).split(',').map(s => s.trim()) : []);
            input = '<div id="' + fid + '" data-pra-param="' + esc(p.id) + '" data-pra-multi="1" style="display: flex; flex-wrap: wrap; gap: 4px;">'
                  + p.options.map(o => '<label style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: var(--color-surface-1); border: 1px solid var(--color-border-hair); border-radius: var(--r-full); font-size: 11px; cursor: pointer;"><input type="checkbox" value="' + esc(o) + '"' + (checked.indexOf(String(o)) >= 0 ? ' checked' : '') + '>' + esc(o) + '</label>').join('')
                  + '</div>';
        } else if (p.type === 'number') {
            input = '<input type="number" id="' + fid + '" data-pra-param="' + esc(p.id) + '" value="' + esc(v) + '" step="any">';
        } else if (p.type === 'item-ref') {
            const filter = p.filter || {};
            const cands = (itemsData || []).filter(it => {
                if (filter.isEngine && !it.isEngine) return false;
                return true;
            });
            input = '<select id="' + fid + '" data-pra-param="' + esc(p.id) + '"><option value="">— pick an item —</option>'
                  + cands.map(it => '<option value="' + esc(it.internalId) + '"' + (String(v) === String(it.internalId) ? ' selected' : '') + '>' + esc(it.itemId) + ' — ' + esc(it.name) + '</option>').join('')
                  + '</select>'
                  + (cands.length === 0 ? '<div style="font-size: 10.5px; color: var(--sev-haz-fg); margin-top: 3px;">No matching items defined. Add one in the Items/LRU Functional Mapping tab.</div>' : '');
        } else {
            input = '<input type="text" id="' + fid + '" data-pra-param="' + esc(p.id) + '" value="' + esc(v) + '">';
        }
        return '<div><label style="text-transform: none; letter-spacing: 0; font-size: 11.5px;">' + esc(p.label) + unit + help + '</label>' + input + '</div>';
    }).join('');
    host.innerHTML = rows;
}

function _readPraModelForm(){
    const sel = document.getElementById('pra-model-type');
    const type = sel ? sel.value : '';
    if (!type || !PR_MODEL_SCHEMAS[type]) return null;
    const params = {};
    PR_MODEL_SCHEMAS[type].params.forEach(p => {
        const el = document.querySelector('[data-pra-param="' + p.id + '"]');
        if (!el) return;
        if (el.getAttribute('data-pra-multi') === '1') {
            params[p.id] = Array.from(el.querySelectorAll('input[type=checkbox]:checked')).map(cb => cb.value);
        } else if (p.type === 'number') {
            const v = parseFloat(el.value);
            params[p.id] = isNaN(v) ? null : v;
        } else {
            params[p.id] = el.value;
        }
    });
    return { type, params };
}

function _getCmaModesSelection() {
    return _getCheckboxListValues(document.getElementById('cma-modes'));
}
// Populate the CMA common-modes checkbox list from the CMA_MODE_LABELS constant.
function populateCmaModesCheckboxes(selected) {
    const el = document.getElementById('cma-modes');
    if (!el) return;
    const current = selected || _getCheckboxListValues(el);
    const longLabels = {
        'design':            'Design — common architecture / shared schematic',
        'software':          'Software — same image or libraries running on all instances',
        'manufacturing':     'Manufacturing — same lot, batch, or production line',
        'hardware-component':'Hardware component — identical part numbers across redundant paths',
        'environment':       'Environment — shared exposure (temperature, vibration, EMI, radiation)',
        'power':             'Power — common power source / single bus',
        'cooling':           'Cooling — shared cooling / thermal management',
        'installation':      'Installation — co-located, common mounting, shared fasteners',
        'maintenance':       'Maintenance — same crew, procedure, or tool affects all instances',
        'specification':     'Specification — same requirements drive identical design errors',
        'testing':           'Testing — shared test setup masks common defects',
        'human-factors':     'Human factors — same operator can defeat all instances',
        'shared-resource':   'Shared resource — a common electrical / hydraulic / pneumatic / fuel supply feeds nominally independent channels'
    };
    const options = Object.entries(CMA_MODE_LABELS).map(([value]) => ({
        value,
        label: longLabels[value] || CMA_MODE_LABELS[value]
    }));
    _renderCheckboxList(el, options, current);
}

function _renderCmaModesCell(modes) {
    if (!modes || !modes.length) return '<span class="u-muted">—</span>';
    return modes.map(m => '<span style="display: inline-block; padding: 2px 8px; background: var(--color-surface-2); border: 1px solid var(--color-border-hair); border-radius: var(--r-full); font-size: 11px; margin: 1px 2px;">' + esc(CMA_MODE_LABELS[m] || m) + '</span>').join('');
}

function _renderCmaStatusCell(status) {
    const s = status || 'Open';
    const palette = {
        'Open':              { bg: 'rgba(255, 59, 48, 0.12)',  fg: 'var(--sev-cat-fg)' },
        'In Progress':       { bg: 'rgba(255, 149, 0, 0.13)',  fg: 'var(--sev-haz-fg)' },
        'Mitigated':         { bg: 'rgba(255, 204, 0, 0.16)',  fg: 'var(--sev-maj-fg)' },
        'Closed — Accepted': { bg: 'rgba(52, 199, 89, 0.13)',  fg: 'var(--sev-min-fg)' }
    };
    const p = palette[s] || palette['Open'];
    return '<span style="display: inline-block; padding: 3px 10px; background: ' + p.bg + '; color: ' + p.fg + '; border-radius: var(--r-full); font-size: 11px; font-weight: 600;">' + esc(s) + '</span>';
}

// ----- CMA Linked-Gates helpers -----
// Gates are referenced by a composite key "<pageId>:<nodeId>" to remain unique across FTA pages.
function _getCmaLinkedGatesSelection() {
    return _getCheckboxListValues(document.getElementById('cma-linked-gates'));
}
// Enumerate every gate node across all FTA pages, except pure TRANSFER pointers or transferred-out stubs.
function _enumerateAllGates() {
    const out = [];
    (ftaPages || []).forEach(page => {
        (function walk(node){
            if (!node) return;
            if (node.type === 'gate' && node.gateType !== 'TRANSFER' && !node.transferOutTo) {
                out.push({ page, node });
            }
            const kids = node.children || node._children;
            if (kids) kids.forEach(walk);
        })(page.root);
    });
    return out;
}
function populateCmaLinkedGatesDropdown(selected) {
    const el = document.getElementById('cma-linked-gates');
    if (!el) return;
    const current = selected || _getCheckboxListValues(el);
    const gates = _enumerateAllGates();
    const options = gates.map(({ page, node }) => ({
        value: page.id + ':' + node.id,
        label: '[' + (page.name || 'Untitled') + ']  ' +
               (node.displayId || ('G-' + node.id)) +
               ' · ' + (node.gateType || '?') +
               (node.name ? '  ·  ' + node.name : '')
    }));
    _renderCheckboxList(el, options, current, {
        emptyText: 'No FTA gates available yet — build a fault tree first.'
    });
}
// Render the linked-gates cell for a CMA row.
function _renderCmaLinkedGatesCell(linkedGateIds) {
    if (!linkedGateIds || !linkedGateIds.length) return '<span class="u-muted">—</span>';
    return linkedGateIds.map(key => {
        // key = "pageId:nodeId" — look up node + page for a friendly label.
        const sep = key.indexOf(':');
        if (sep < 0) return '<span class="ar-badge ar-badge-orphan" title="Malformed key">' + esc(key) + '</span>';
        const pageId = key.slice(0, sep);
        const nodeId = parseInt(key.slice(sep + 1), 10);
        const page = (ftaPages || []).find(p => String(p.id) === String(pageId));
        if (!page) return '<span class="ar-badge ar-badge-orphan" title="Page deleted">' + esc(key) + ' (page gone)</span>';
        const node = (typeof findNode === 'function') ? findNode(page.root, nodeId) : null;
        if (!node) return '<span class="ar-badge ar-badge-orphan" title="Gate deleted">' + esc(key) + ' (gate gone)</span>';
        const label = (node.displayId || ('G-' + node.id)) + ' (' + (node.gateType || '?') + ')';
        return '<span style="display: inline-block; padding: 2px 8px; background: var(--color-surface-2); border: 1px solid var(--color-border-hair); border-radius: var(--r-full); font-size: 11px; margin: 1px 2px; font-family: var(--font-mono);" title="' + esc(page.name || '') + '">' + esc(label) + '</span>';
    }).join('');
}

function _populateRoutingZones(selected) {
    const el = document.getElementById('routing-zones');
    if (!el) return;
    const current = selected || _getCheckboxListValues(el);
    const options = (zsaData || [])
        .filter(z => z && z.zoneId != null && String(z.zoneId) !== '')
        .map(z => ({
            value: String(z.zoneId),
            label: String(z.zoneId) + (z.desc ? '  ·  ' + String(z.desc).slice(0, 50) : '')
        }));
    _renderCheckboxList(el, options, current, { emptyText: 'No zones defined yet — add some in ZSA first.' });
}
function _populateRoutingFunctions(selected) {
    const el = document.getElementById('routing-functions');
    if (!el) return;
    const current = selected || _getCheckboxListValues(el);
    const funcs = (acFunctionsData || []).slice();
    (systemsData || []).forEach(s => {
        (s.functions || []).forEach(f => funcs.push({ subId: f.funcId, subName: (f.funcName || '') + ' [' + (s.name || s.id) + ']' }));
    });
    const options = funcs
        .filter(f => f && f.subId != null && String(f.subId) !== '')
        .map(f => ({ value: String(f.subId), label: String(f.subId) + (f.subName ? '  ·  ' + f.subName : '') }));
    _renderCheckboxList(el, options, current, { emptyText: 'No functions defined yet — add Aircraft or System functions first.' });
}
function _populateRoutingItems(selected) {
    const el = document.getElementById('routing-items');
    if (!el) return;
    const current = selected || _getCheckboxListValues(el);
    const options = (itemsData || [])
        .filter(it => it && it.itemId != null && String(it.itemId) !== '')
        .map(it => ({ value: String(it.itemId), label: String(it.itemId) + (it.name ? '  ·  ' + it.name : '') }));
    _renderCheckboxList(el, options, current, { emptyText: 'No items defined yet — add some in Items/LRU first.' });
}
function _populateRoutingMultiselects(row) {
    row = row || {};
    _populateRoutingZones(row.routesThroughZones || []);
    _populateRoutingFunctions(row.carriesFunctions || []);
    _populateRoutingItems(row.carriesItems || []);
}

function _resourceSeverityRank(sev) {
    if (typeof SEVERITY_RANK !== 'undefined' && SEVERITY_RANK && SEVERITY_RANK[sev] != null) return SEVERITY_RANK[sev];
    const m = { 'Catastrophic': 5, 'Hazardous': 4, 'Major': 3, 'Minor': 2, 'Negligible': 1, 'No Safety Effect': 1 };
    return m[sev] || 0;
}
// Small inline severity chip using the --sev-*-(bg|fg) theme variables.
function _resourceSevChip(sev) {
    const key = { 'Catastrophic': 'cat', 'Hazardous': 'haz', 'Major': 'maj', 'Minor': 'min', 'Negligible': 'neg', 'No Safety Effect': 'neg' }[sev] || 'neg';
    const label = sev || '—';
    return '<span style="display: inline-block; padding: 1px 8px; border-radius: var(--r-full); font-size: 10.5px; font-weight: 700; background: var(--sev-' + key + '-bg); color: var(--sev-' + key + '-fg);">' + esc(label) + '</span>';
}
// Compute the loss-of-resource impact for a resource row: for each consumed
// sub-function, resolve its name + the FHA failure conditions it owns, and roll
// up the worst severity across them. Fully guarded against missing globals.
function _resourceImpact(resRow) {
    const result = { functions: [], funcCount: 0, fcCount: 0, worstSeverity: '' };
    if (!resRow) return result;
    const consumed = Array.isArray(resRow.consumedBy) ? resRow.consumedBy : [];
    let worstRank = 0, fcTotal = 0;
    consumed.forEach(subId => {
        let subName = subId;
        try {
            const fn = (typeof acFunctionsData !== 'undefined' && acFunctionsData)
                ? acFunctionsData.find(x => x && String(x.subId) === String(subId)) : null;
            if (fn) subName = fn.subName || fn.subId;
        } catch (e) { /* keep raw subId */ }
        const fcs = [];
        try {
            (typeof acFhaData !== 'undefined' && acFhaData ? acFhaData : []).forEach(f => {
                if (!f) return;
                const links = Array.isArray(f.subIds) ? f.subIds : (f.subId ? [f.subId] : []);
                if (links.map(String).indexOf(String(subId)) === -1) return;
                fcs.push({ fcId: f.fcId || '', fcDesc: f.fcDesc || '', severity: f.severity || '' });
                const r = _resourceSeverityRank(f.severity);
                if (r > worstRank) worstRank = r;
            });
        } catch (e) { /* no FCs */ }
        fcTotal += fcs.length;
        result.functions.push({ subId, subName, fcs });
    });
    result.funcCount = result.functions.length;
    result.fcCount = fcTotal;
    const rankToSev = { 5: 'Catastrophic', 4: 'Hazardous', 3: 'Major', 2: 'Minor', 1: 'Negligible' };
    result.worstSeverity = rankToSev[worstRank] || '—';
    return result;
}

function _reqsRepoCount(scopeKey) {
    if (scopeKey === 'aircraft') return (acReqData || []).length;
    if (scopeKey === 'all-sys') {
        return (systemsData || []).reduce((acc, s) => acc + ((s.req || []).length), 0);
    }
    if (scopeKey.startsWith('sys:')) {
        const sysId = scopeKey.slice(4);
        const sys = (systemsData || []).find(s => s.id === sysId);
        return sys ? (sys.req || []).length : 0;
    }
    return 0;
}
function renderRequirementsRepository() {
    const tree    = document.getElementById('reqs-repo-tree');
    const content = document.getElementById('reqs-repo-content');
    if (!tree || !content) return;
    if (!window._reqsRepoActive) window._reqsRepoActive = 'aircraft';

    // Build the directory rail.
    const rowStyle = 'display:flex; justify-content:space-between; align-items:center; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 13px; margin: 2px 0;';
    const countStyle = 'background: var(--color-surface-1); color: var(--color-text-secondary); font-size: 11px; padding: 1px 7px; border-radius: 10px; min-width: 24px; text-align:center;';
    const active = window._reqsRepoActive;
    function _folderRow(key, label, icon) {
        const isActive = active === key;
        const bg = isActive ? 'background: var(--color-accent-soft, rgba(59,130,246,0.2)); color: var(--color-accent);' : '';
        return '<div onclick="setReqsRepoActive(\'' + esc(key) + '\')" style="' + rowStyle + bg + '"><span>' + icon + ' ' + esc(label) + '</span><span style="' + countStyle + '">' + _reqsRepoCount(key) + '</span></div>';
    }
    let html = '';
    html += '<div style="font-size: 11px; color: var(--color-text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; margin: 4px 6px 6px;">Project</div>';
    html += _folderRow('aircraft', 'Aircraft', '✈');
    html += '<div style="font-size: 11px; color: var(--color-text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; margin: 12px 6px 6px;">Systems</div>';
    const systems = (systemsData || []);
    if (!systems.length) {
        html += '<div style="padding: 6px 10px; font-size: 12px; color: var(--color-text-tertiary); font-style: italic;">No systems defined yet.</div>';
    } else {
        systems.forEach(s => {
            html += _folderRow('sys:' + s.id, s.name || s.id, '📁');
        });
        html += _folderRow('all-sys', 'All systems (combined)', '📚');
    }
    tree.innerHTML = html;

    // Build the requirements table for the active directory.
    let reqs = [];
    let label = '';
    let scopeKind = '';   // 'aircraft' | 'system'
    let scopeSystemName = '';
    if (active === 'aircraft') {
        reqs = (acReqData || []).slice();
        label = 'Aircraft requirements';
        scopeKind = 'aircraft';
    } else if (active === 'all-sys') {
        // Flatten with system name carried for column display.
        systems.forEach(s => {
            (s.req || []).forEach(r => {
                reqs.push({ __sysName: s.name || s.id, __sysId: s.id, ...r });
            });
        });
        label = 'All system requirements (' + systems.length + ' systems)';
        scopeKind = 'all-sys';
    } else if (active.startsWith('sys:')) {
        const sysId = active.slice(4);
        const sys = systems.find(s => s.id === sysId);
        reqs = sys ? (sys.req || []).slice() : [];
        label = (sys && (sys.name || sys.id)) || sysId;
        scopeKind = 'system';
        scopeSystemName = label;
    }

    let body = '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">';
    body += '<h4 style="margin: 0; font-size: 16px;">' + esc(label) + ' <span style="font-weight: 400; font-size: 13px; color: var(--color-text-tertiary);">(' + reqs.length + ')</span></h4>';
    body += '</div>';
    if (!reqs.length) {
        body += '<div style="padding: 24px; text-align: center; color: var(--color-text-tertiary); font-style: italic; border: 1px dashed var(--color-border-hair); border-radius: 8px;">No requirements in this scope yet. Add some via the corresponding Requirements tab, or use Auto-generate Requirements on the FHA/FTA/CMA/PRA/ZSA tabs.</div>';
    } else {
        body += '<table style="width: 100%; border-collapse: collapse; font-size: 13px;">';
        body += '<thead><tr style="background: var(--color-surface-2); text-align: left;">';
        body += '<th style="padding: 8px;">ID</th>';
        if (scopeKind === 'all-sys') body += '<th style="padding: 8px;">System</th>';
        body += '<th style="padding: 8px;">Trace</th>';
        body += '<th style="padding: 8px;">Level</th>';
        body += '<th style="padding: 8px;">Type</th>';
        body += '<th style="padding: 8px;" title="Which analysis produced this requirement. Was stored in Type until 1 Aug 2026.">From</th>';
        body += '<th style="padding: 8px;">Requirement Statement</th>';
        body += '<th style="padding: 8px;">Val</th><th style="padding: 8px;">Ver</th>';
        body += '</tr></thead><tbody>';
        reqs.forEach(r => {
            const traceList = Array.isArray(r.traceIds) && r.traceIds.length ? r.traceIds : (r.traceId ? [r.traceId] : []);
            const traceStr = traceList.join(', ');
            const val = r.valStatus || r.valStatusLabel || '—';
            const ver = r.verStatus || r.verStatusLabel || '—';
            body += '<tr style="border-bottom: 1px solid var(--color-border-hair);">';
            body += '<td style="padding: 8px; font-family: var(--font-mono); font-size: 12px;"><strong>' + esc(r.traceId || r.id || ('#' + r.internalId)) + '</strong></td>';
            if (scopeKind === 'all-sys') body += '<td style="padding: 8px;">' + esc(r.__sysName) + '</td>';
            body += '<td style="padding: 8px;">' + esc(traceStr) + '</td>';
            body += '<td style="padding: 8px;">' + esc(r.level || '') + '</td>';
            body += '<td style="padding: 8px;">' + esc(r.type || '') + '</td>';
            body += '<td style="padding: 8px; color: var(--color-text-tertiary);">' + esc(r.analysis || '') + '</td>';
            body += '<td style="padding: 8px;">' + esc((r.text || '').slice(0, 240)) + '</td>';
            body += '<td style="padding: 8px;">' + esc(val) + '</td><td style="padding: 8px;">' + esc(ver) + '</td>';
            body += '</tr>';
        });
        body += '</tbody></table>';
    }
    content.innerHTML = body;
}

// Legacy `type` values are migrated HERE rather than on load. There are three
// separate load paths (project open, autosave restore, demo showcase) and a
// migration wired into two of them is the reachability failure this codebase
// keeps rediscovering. Every requirements view funnels through this collector, it
// is idempotent, and it leaves anything ambiguous untouched.
function _vvMigrateReqTaxonomy(rows) {
    const RT = (typeof ReqTaxonomy !== 'undefined') ? ReqTaxonomy
             : (typeof window !== 'undefined' ? window.ReqTaxonomy : null);
    if (!RT) return;
    try { RT.migrateAll(rows); } catch (_) {}
}
function _vvAllRequirements() {
    // Migrate the SOURCE arrays, not the copies below. This collector spreads each
    // row (`{ ...r }`), so migrating the returned list would rewrite throwaways: the
    // view would look correct, nothing would persist, and the migration would run
    // again on every render for the life of the project.
    _vvMigrateReqTaxonomy(acReqData || []);
    (systemsData || []).forEach(s => _vvMigrateReqTaxonomy(s.req || []));
    const list = [];
    (acReqData || []).forEach(r => list.push({ ...r, __scope: 'aircraft', __sysName: 'Aircraft' }));
    (systemsData || []).forEach(s => {
        (s.req || []).forEach(r => list.push({ ...r, __scope: 'system', __sysId: s.id, __sysName: s.name || s.id }));
    });
    return list;
}
function _vvNormStatus(s) {
    const v = (s || '').toString().toLowerCase().trim();
    if (!v || v === '—' || v === '-') return 'open';
    if (v.indexOf('complete') >= 0 || v.indexOf('closed') >= 0 || v.indexOf('verified') >= 0 || v.indexOf('validated') >= 0) return 'closed';
    if (v.indexOf('progress') >= 0 || v.indexOf('partial') >= 0 || v.indexOf('draft') >= 0) return 'in-progress';
    return 'open';
}
function renderVVStatusPage() {
    const controls = document.getElementById('vv-status-controls');
    const summary  = document.getElementById('vv-status-summary');
    const host     = document.getElementById('vv-status-host');
    if (!controls || !summary || !host) return;
    const all = _vvAllRequirements();

    // ----- filter chip bar -----
    const f = window._vvFilters;
    const systems = (systemsData || []);
    function _chip(label, key, val, current) {
        const isActive = current === val;
        const bg = isActive ? 'background: var(--color-accent, #3b82f6); color: #fff;' : 'background: var(--color-surface-2); color: var(--color-text-secondary);';
        return '<button onclick="setVVFilter(\'' + esc(key) + '\',\'' + esc(val) + '\')" style="' + bg + ' border: 1px solid var(--color-border-hair); border-radius: 999px; padding: 4px 11px; font-size: 12px; cursor: pointer;">' + esc(label) + '</button>';
    }
    let chips = '';
    chips += '<span style="font-size: 11px; color: var(--color-text-tertiary); margin-right: 4px;">Scope</span>';
    chips += _chip('All', 'scope', 'all', f.scope);
    chips += _chip('Aircraft', 'scope', 'aircraft', f.scope);
    systems.forEach(s => { chips += _chip(s.name || s.id, 'scope', 'sys:' + s.id, f.scope); });
    // CHIPS ARE BUILT FROM THE DATA, NOT HARDCODED (1 Aug 2026).
    //
    // They used to be three fixed Type values (Safety / Functional / Performance)
    // and two fixed Level values (High-level / Derived), while the generators wrote
    // Probabilistic / Design Assurance / Independence / Maintenance at L1/L2/L3. The
    // two sets shared nothing. On the shipped Kestrel RJ showcase — 57 requirements,
    // 11 type values — "Safety" matched 0 rows, "Performance" matched 0, "High-level"
    // matched 0, "Derived" matched 0. An empty list reads as "you have none of those",
    // never as "this filter cannot match anything you own".
    //
    // Now every chip comes from ReqTaxonomy.chipsFor(), which returns the §5.3.1
    // classes that are actually present PLUS any value the taxonomy does not know,
    // grouped under "Unmapped". That is the whole guard, in both directions: a chip
    // cannot exist unless something matches it, and a stored value cannot become
    // unreachable. Counts are shown so an empty result is never a surprise.
    const _RT = (typeof ReqTaxonomy !== 'undefined') ? ReqTaxonomy
              : (typeof window !== 'undefined' ? window.ReqTaxonomy : null);
    const _chipGroup = (label, field, active) => {
        const list = _RT ? _RT.chipsFor(all, field) : [];
        if (!list.length) return '';
        let h = '<span style="font-size: 11px; color: var(--color-text-tertiary); margin: 0 4px 0 12px;">' + label + '</span>';
        h += _chip('Any', field, 'any', active);
        const known = list.filter(x => x.known), unknown = list.filter(x => !x.known);
        known.forEach(x => { h += _chip(x.value + ' (' + x.count + ')', field, x.value, active); });
        if (unknown.length) {
            h += '<span style="font-size: 11px; color: var(--color-text-tertiary); margin: 0 4px 0 8px;" ' +
                 'title="Values this project holds that are not ARP4754B §5.3.1 classes. Shown so the rows stay reachable — the migration deliberately does not guess at an engineer\u2019s meaning.">Unmapped</span>';
            unknown.forEach(x => { h += _chip(x.value + ' (' + x.count + ')', field, x.value, active); });
        }
        return h;
    };
    chips += _chipGroup('Level', 'level', f.level);
    chips += _chipGroup('Type', 'type', f.type);
    chips += _chipGroup('From', 'analysis', f.analysis || 'any');
    chips += '<span style="font-size: 11px; color: var(--color-text-tertiary); margin: 0 4px 0 12px;">Status</span>';
    chips += _chip('Any', 'status', 'any', f.status);
    chips += _chip('Open', 'status', 'open', f.status);
    chips += _chip('In progress', 'status', 'in-progress', f.status);
    chips += _chip('Closed', 'status', 'closed', f.status);
    controls.innerHTML = chips;

    // ----- apply filters -----
    let filtered = all.slice();
    if (f.scope === 'aircraft') filtered = filtered.filter(r => r.__scope === 'aircraft');
    else if (f.scope && f.scope.startsWith('sys:')) {
        const sid = f.scope.slice(4);
        filtered = filtered.filter(r => r.__sysId === sid);
    }
    if (f.level !== 'any') filtered = filtered.filter(r => (r.level || '') === f.level);
    if (f.type  !== 'any') filtered = filtered.filter(r => (r.type  || '') === f.type);
    if (f.analysis && f.analysis !== 'any') filtered = filtered.filter(r => (r.analysis || '') === f.analysis);
    if (f.status !== 'any') filtered = filtered.filter(r => {
        const val = _vvNormStatus(r.valStatus);
        const ver = _vvNormStatus(r.verStatus);
        // Worst-of: a req's overall status is the worse of val/ver.
        const order = { 'open': 0, 'in-progress': 1, 'closed': 2 };
        const worst = order[val] <= order[ver] ? val : ver;
        return worst === f.status;
    });

    // ----- summary tiles -----
    function _counts(list, getter) {
        const c = { open: 0, 'in-progress': 0, closed: 0 };
        list.forEach(r => { c[_vvNormStatus(getter(r))]++; });
        return c;
    }
    const valCounts = _counts(filtered, r => r.valStatus);
    const verCounts = _counts(filtered, r => r.verStatus);
    const tileStyle = 'border: 1px solid var(--color-border-hair); border-radius: 10px; padding: 14px 16px; background: var(--color-surface-1);';
    let tiles = '<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">';
    tiles += '<div style="' + tileStyle + '"><div style="font-size: 11px; color: var(--color-text-tertiary); text-transform: uppercase; letter-spacing: 0.05em;">Total in scope</div><div style="font-size: 26px; font-weight: 700; margin-top: 2px;">' + filtered.length + '</div></div>';
    tiles += '<div style="' + tileStyle + '"><div style="font-size: 11px; color: var(--color-text-tertiary); text-transform: uppercase; letter-spacing: 0.05em;">Validation closed</div><div style="font-size: 26px; font-weight: 700; margin-top: 2px; color: #15803d;">' + valCounts.closed + '</div><div style="font-size: 11px; color: var(--color-text-tertiary);">' + valCounts['in-progress'] + ' in progress · ' + valCounts.open + ' open</div></div>';
    tiles += '<div style="' + tileStyle + '"><div style="font-size: 11px; color: var(--color-text-tertiary); text-transform: uppercase; letter-spacing: 0.05em;">Verification closed</div><div style="font-size: 26px; font-weight: 700; margin-top: 2px; color: #15803d;">' + verCounts.closed + '</div><div style="font-size: 11px; color: var(--color-text-tertiary);">' + verCounts['in-progress'] + ' in progress · ' + verCounts.open + ' open</div></div>';
    const pct = filtered.length > 0 ? Math.round((Math.min(valCounts.closed, verCounts.closed) / filtered.length) * 100) : 0;
    tiles += '<div style="' + tileStyle + '"><div style="font-size: 11px; color: var(--color-text-tertiary); text-transform: uppercase; letter-spacing: 0.05em;">Fully closed (V&amp;V)</div><div style="font-size: 26px; font-weight: 700; margin-top: 2px;">' + pct + '%</div><div style="font-size: 11px; color: var(--color-text-tertiary);">requirements with both Val + Ver closed</div></div>';
    tiles += '</div>';
    summary.innerHTML = tiles;

    // ----- table -----
    if (!filtered.length) {
        host.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--color-text-tertiary); font-style: italic; border: 1px dashed var(--color-border-hair); border-radius: 8px;">No requirements match the current filters.</div>';
        return;
    }
    let body = '<table style="width: 100%; border-collapse: collapse; font-size: 13px;">';
    body += '<thead><tr style="background: var(--color-surface-2); text-align: left;">';
    body += '<th style="padding: 8px;">ID</th><th style="padding: 8px;">Scope</th><th style="padding: 8px;">Level</th><th style="padding: 8px;">Type</th><th style="padding: 8px;" title="Which analysis produced this requirement. Was stored in Type until 1 Aug 2026.">From</th><th style="padding: 8px;">Statement</th><th style="padding: 8px;">Val Status</th><th style="padding: 8px;">Ver Status</th>';
    body += '</tr></thead><tbody>';
    const statusBadge = (s) => {
        const k = _vvNormStatus(s);
        const col = { 'open': '#dc2626', 'in-progress': '#b45309', 'closed': '#15803d' }[k];
        const lbl = { 'open': 'Open', 'in-progress': 'In progress', 'closed': 'Closed' }[k];
        return '<span style="font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 10px; background: ' + col + '22; color: ' + col + ';">' + lbl + '</span>';
    };
    filtered.forEach(r => {
        body += '<tr style="border-bottom: 1px solid var(--color-border-hair);">';
        body += '<td style="padding: 8px; font-family: var(--font-mono); font-size: 12px;"><strong>' + esc(r.traceId || r.id || ('#' + r.internalId)) + '</strong></td>';
        body += '<td style="padding: 8px;">' + esc(r.__sysName) + '</td>';
        body += '<td style="padding: 8px;">' + esc(r.level || '') + '</td>';
        body += '<td style="padding: 8px;">' + esc(r.type || '') + '</td>';
        body += '<td style="padding: 8px; color: var(--color-text-tertiary);">' + esc(r.analysis || '') + '</td>';
        body += '<td style="padding: 8px;">' + esc((r.text || '').slice(0, 220)) + '</td>';
        body += '<td style="padding: 8px;">' + statusBadge(r.valStatus) + '</td>';
        body += '<td style="padding: 8px;">' + statusBadge(r.verStatus) + '</td>';
        body += '</tr>';
    });
    body += '</tbody></table>';
    host.innerHTML = body;
}

function renderDalReferencePage() {
    const host = document.getElementById('dal-ref-host');
    if (!host) return;

    // ----- Distribution roll-up -----
    // Collect DAL claims from requirements (FDAL/IDAL) and FTA nodes (per-tree).
    const dalCounts = { A: 0, B: 0, C: 0, D: 0, E: 0, '—': 0 };
    function _bump(dal) {
        const k = (dal || '').toString().trim().toUpperCase();
        if (['A','B','C','D','E'].indexOf(k) >= 0) dalCounts[k]++;
        else dalCounts['—']++;
    }
    (acReqData || []).forEach(r => { if (r.dal || r.fdal || r.idal) _bump(r.dal || r.fdal || r.idal); });
    (systemsData || []).forEach(s => (s.req || []).forEach(r => { if (r.dal || r.fdal || r.idal) _bump(r.dal || r.fdal || r.idal); }));
    // FTA top-gate FDAL / IDAL
    (ftaPages || []).forEach(p => {
        if (!p.root) return;
        if (p.root.fdal) _bump(p.root.fdal);
        if (p.root.idal) _bump(p.root.idal);
    });
    const total = Object.keys(dalCounts).reduce((a, k) => a + dalCounts[k], 0);

    const tileStyle = 'border: 1px solid var(--color-border-hair); border-radius: 10px; padding: 12px 14px; background: var(--color-surface-1); text-align: center;';
    let html = '<div style="font-size: 11px; color: var(--color-text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; margin: 4px 4px 8px;">Claimed DAL distribution across this project</div>';
    html += '<div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin-bottom: var(--s-5);">';
    ['A','B','C','D','E','—'].forEach(k => {
        const pct = total > 0 ? Math.round((dalCounts[k] / total) * 100) : 0;
        html += '<div style="' + tileStyle + '">' +
                '<div style="font-size: 11px; color: var(--color-text-tertiary);">DAL ' + esc(k) + '</div>' +
                '<div style="font-size: 22px; font-weight: 700; margin: 2px 0;">' + dalCounts[k] + '</div>' +
                '<div style="font-size: 11px; color: var(--color-text-tertiary);">' + pct + '%</div>' +
            '</div>';
    });
    html += '</div>';

    // ----- DO-178C reference card -----
    // Object counts are public knowledge per DO-178C Annex A. We summarize counts
    // and where applicable note independence required; we do NOT reproduce the
    // tables verbatim (cite-by-reference per Phase 53.51 policy).
    const do178c = [
        { dal: 'A', objs: 71, indep: 33, note: 'Catastrophic failure condition. Highest assurance; structural coverage at MC/DC.' },
        { dal: 'B', objs: 69, indep: 21, note: 'Hazardous. Decision coverage; significant independence.' },
        { dal: 'C', objs: 62, indep: 8,  note: 'Major. Statement coverage; reduced independence.' },
        { dal: 'D', objs: 26, indep: 5,  note: 'Minor. Reduced objective set.' },
        { dal: 'E', objs: 0,  indep: 0,  note: 'No effect — no DO-178C credit required.' }
    ];
    const do254 = [
        { dal: 'A', objs: 28, indep: 'Required', note: 'Catastrophic. Elementary analysis + advanced verification (FPGA: elemental coverage).' },
        { dal: 'B', objs: 27, indep: 'Required', note: 'Hazardous. Elementary analysis required.' },
        { dal: 'C', objs: 21, indep: 'Reduced',  note: 'Major. Reduced independence; design-assurance evidence.' },
        { dal: 'D', objs: 14, indep: 'Reduced',  note: 'Minor. Basic design-assurance evidence.' },
        { dal: 'E', objs: 0,  indep: '—',         note: 'No effect — no DO-254 credit required.' }
    ];
    function _refTable(title, rows, headers) {
        let t = '<div style="border: 1px solid var(--color-border-hair); border-radius: 10px; padding: 14px 16px; background: var(--color-surface-1); margin-bottom: 12px;">';
        t += '<div style="font-size: 13px; font-weight: 600; margin-bottom: 8px;">' + esc(title) + '</div>';
        t += '<table style="width: 100%; border-collapse: collapse; font-size: 12.5px;">';
        t += '<thead><tr style="background: var(--color-surface-2); text-align: left;">';
        headers.forEach(h => { t += '<th style="padding: 6px 8px;">' + esc(h) + '</th>'; });
        t += '</tr></thead><tbody>';
        rows.forEach(r => {
            t += '<tr style="border-bottom: 1px solid var(--color-border-hair);">';
            t += '<td style="padding: 6px 8px; font-weight: 600;">' + esc(r.dal) + '</td>';
            t += '<td style="padding: 6px 8px;">' + esc(String(r.objs)) + '</td>';
            t += '<td style="padding: 6px 8px;">' + esc(String(r.indep)) + '</td>';
            t += '<td style="padding: 6px 8px; color: var(--color-text-secondary);">' + esc(r.note) + '</td>';
            t += '</tr>';
        });
        t += '</tbody></table>';
        t += '<div style="font-size: 11px; color: var(--color-text-tertiary); margin-top: 8px;">Authoritative text is the published standard — RTCA / EUROCAE issue the controlled document. This is a summary only.</div>';
        t += '</div>';
        return t;
    }
    html += '<div style="font-size: 11px; color: var(--color-text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; margin: 4px 4px 8px;">Reference summary</div>';
    html += _refTable('DO-178C — Software DAL objective counts (Annex A Tables A-1 … A-7)',
        do178c, ['DAL', 'Objectives', 'With independence', 'Notes']);
    html += _refTable('DO-254 — Electronic Hardware DAL objectives (Appendix A)',
        do254, ['DAL', 'Objectives', 'Independence', 'Notes']);

    host.innerHTML = html;
}

function generateTraceMatrix() {
    const tbody = document.getElementById('trace-body');
    if (!tbody) return;
    const edges = window.deriveHazardTraces();
    const filter = window._traceScopeFilter || 'all';
    function _passes(e) {
        if (filter === 'all') return true;
        if (filter === 'ac-sys')  return e.source.scope === 'ac'  && e.target.scope === 'sys';
        if (filter === 'sys-ac')  return e.source.scope === 'sys' && e.target.scope === 'ac';
        if (filter === 'sys-sys') return e.source.scope === 'sys' && e.target.scope === 'sys';
        return true;
    }
    const visible = edges.filter(_passes);
    // Sort: source scope, source fcId, target fcId.
    visible.sort((a, b) => {
        const sa = a.source.scope + ':' + (a.source.systemName || '') + ':' + (a.source.fha.fcId || '');
        const sb = b.source.scope + ':' + (b.source.systemName || '') + ':' + (b.source.fha.fcId || '');
        if (sa !== sb) return sa < sb ? -1 : 1;
        const ta = (a.target.systemName || '') + ':' + (a.target.fha.fcId || '');
        const tb = (b.target.systemName || '') + ':' + (b.target.fha.fcId || '');
        return ta < tb ? -1 : (ta > tb ? 1 : 0);
    });
    if (!visible.length) {
        const msg = (filter === 'all')
            ? 'No hazard traces in this project yet. Add sys-function traces (Sys Functions → Trace) or link FTA events to other systems, and they will appear here automatically.'
            : 'No traces match the current scope filter. Try a different chip or "All".';
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color: var(--text-secondary); font-style: italic; padding: 18px;">' + esc(msg) + '</td></tr>';
        return;
    }
    const scopeLabel = (s) => s.scope === 'ac' ? 'Aircraft' : ('Sys: ' + (s.systemName || s.systemId || '?'));
    const basisLabel = {
        'function-trace':   '<span class="basis-pill basis-fn"  title="Derived from sys function → AC function trace edges">via function trace</span>',
        'external-source':  '<span class="basis-pill basis-ext" title="Linked through an FTA basic event with an external source">via external FTA link</span>',
        'manual-acTraces':  '<span class="basis-pill basis-man" title="Manual link entered on the sys FHA form">manual link</span>'
    };
    // ENG-2 phase 1c — the traceability matrix is potentially the largest table
    // in the app (edges grow with program size squared); paginated via the
    // shared pager. Sort + filter above run over the FULL edge set.
    const _traceRowHtml = e => {
        const sf = e.source.fha;
        const tf = e.target.fha;
        return '<tr>' +
            '<td><strong>' + esc(sf.fcId || '') + '</strong><br>' + esc((sf.fcDesc || '').slice(0, 80)) + '</td>' +
            '<td>' + esc(scopeLabel(e.source)) + '</td>' +
            '<td class="cell-' + esc(sf.severity || '') + '">' + esc(sf.severity || '') + '</td>' +
            '<td><strong>' + esc(tf.fcId || '') + '</strong><br>' + esc((tf.fcDesc || '').slice(0, 80)) + '</td>' +
            '<td>' + esc(scopeLabel(e.target)) + '</td>' +
            '<td class="cell-' + esc(tf.severity || '') + '">' + esc(tf.severity || '') + '</td>' +
            '<td>' + esc(e.target.function || '') + '</td>' +
            '<td>' + (basisLabel[e.basis] || esc(e.basis)) + '</td>' +
        '</tr>';
    };
    if (typeof SLPaginate !== 'undefined' && SLPaginate.pageTbody) {
        SLPaginate.pageTbody({ key: 'trace', tbody, rows: visible, rowHtml: _traceRowHtml,
            label: (f, t, n) => 'traces ' + f + '–' + t + ' of ' + n + ' (current filter) — derived over the full project' });
    } else {
        tbody.innerHTML = visible.map(_traceRowHtml).join('');
    }
}

function _applyFmeaModeUI(mode) {
    if (mode !== 'functional' && mode !== 'piece-part') return;
    _fmeaActiveMode = mode;
    const fBtn = document.getElementById('fmea-mode-functional');
    const pBtn = document.getElementById('fmea-mode-piecepart');
    if (fBtn) fBtn.classList.toggle('active', mode === 'functional');
    if (pBtn) pBtn.classList.toggle('active', mode === 'piece-part');
    const fBlock = document.getElementById('fmea-functional-fields');
    const pBlock = document.getElementById('fmea-piecepart-fields');
    const qBlock = document.getElementById('fmea-quantitative-fields');
    const idLabel = document.getElementById('fmea-id-label');
    if (fBlock) fBlock.style.display = (mode === 'functional') ? '' : 'none';
    if (pBlock) pBlock.style.display = (mode === 'functional') ? 'none' : '';
    if (qBlock) qBlock.style.display = (mode === 'functional') ? 'none' : 'grid';
    if (idLabel) idLabel.textContent = (mode === 'functional') ? 'Functional FMEA ID' : 'Piece-Part FMEA ID';
    // Phase 53.60 — populate parent library dropdown when entering piece-part mode.
    if (mode === 'piece-part' && typeof _populateFmeaParentLib === 'function') _populateFmeaParentLib();
    const idEl = document.getElementById('fmea-id');
    if (idEl) idEl.placeholder = (mode === 'functional') ? 'e.g., FMEA-F-001' : 'e.g., FMEA-PP-001';
}
// User-facing segmented control entry: swaps mode AND clears any in-progress edit (since
// switching modes mid-edit is a context change). Used by the Functional / Piece-Part buttons.
// Which FMEA modes the PROGRAMME says are in scope. FMEA had no catalogue lane
// until 1 Aug 2026, so the segmented control was a view toggle rather than a
// scope decision — a project doing only a functional FMEA still had a
// Piece-Part tab inviting it to start one, and the programme plan had no way to
// record either choice. Now it gates like every other analysis.
function fmeaModeInScope(mode) {
    try {
        // The global is PROGRAM_PLAN (program_plan.js: `window.PROGRAM_PLAN = API`).
        // This read `window.ProgramPlan` when the gate shipped, which is undefined —
        // so it took the fail-open path every time and gated NOTHING. Caught by
        // running it against the deployed build, not by the test, because the test
        // mocked `window.ProgramPlan`: it asserted the shape I had invented rather
        // than the shape the module exports. A mock is only evidence about the real
        // world if the name it stands in for is the real name.
        const W = (typeof window !== 'undefined') ? window : null;
        const PP = W ? (W.PROGRAM_PLAN || W.ProgramPlan) : null;
        if (!PP || typeof PP.laneOn !== 'function') return true;   // never gate what we cannot ask about
        return PP.laneOn(mode === 'functional' ? 'ffmea' : 'ppfmea');
    } catch (_) { return true; }
}
function refreshFmeaModeButtons() {
    [['fmea-mode-functional', 'functional'], ['fmea-mode-piecepart', 'piece-part']].forEach(function (pair) {
        const el = document.getElementById(pair[0]);
        if (!el) return;
        const on = fmeaModeInScope(pair[1]);
        el.disabled = !on;
        el.style.opacity = on ? '' : '0.45';
        el.title = on ? '' : 'Out of programme scope — add this lane on the Program Planning tab to use it. ' +
            (pair[1] === 'piece-part'
                ? 'ARP4761A J.3.2: a piece-part FMEA is performed as necessary to refine a failure rate, typically when the functional rates will not meet the FTA budget.'
                : 'ARP4761A J.3.2: functional FMEAs are typically performed to support the safety analysis effort.');
    });
}
function setFmeaMode(mode) {
    if (mode !== 'functional' && mode !== 'piece-part') return;
    if (!fmeaModeInScope(mode)) {
        if (typeof showToast === 'function') showToast(
            (mode === 'piece-part' ? 'Piece-Part' : 'Functional') + ' FMEA is not in this programme\u2019s scope. Add the lane on Program Planning first \u2014 the scope record is what the SSPP prints.',
            'info', 6000);
        return;
    }
    _applyFmeaModeUI(mode);
    cancelEdit('fmea');
    renderFMEA();
}

// Populate the AC sub-function dropdown for functional FMEA.
function _populateFmeaFunctionLink() {
    const sel = document.getElementById('fmea-function-link');
    if (!sel) return;
    const current = sel.value;
    const opts = ['<option value="">-- Select a sub-function --</option>'];
    (acFunctionsData || []).forEach(f => {
        const label = (f.subId || '') + (f.subName ? '  ·  ' + f.subName : '');
        opts.push('<option value="' + esc(f.subId || '') + '">' + esc(label) + '</option>');
    });
    sel.innerHTML = opts.join('');
    sel.value = current;
}

// Phase 56.x (#3) — populate the optional "Linked Failure Condition" dropdown for
// functional FMEA from the aircraft FHA failure conditions, so a functional failure
// mode can be tied to the FHA failure condition it contributes to (closes the
// functional-FMEA ↔ FHA gap).
function _populateFmeaFuncLinkedFc() {
    const sel = document.getElementById('fmea-func-linked-fc');
    if (!sel) return;
    const current = sel.value;
    const opts = ['<option value="">-- Not linked --</option>'];
    (acFhaData || []).forEach(h => {
        const id = String(h.internalId);
        const label = (h.fcId || ('FC#' + id)) + (h.fcDesc ? '  ·  ' + h.fcDesc : '') + (h.severity ? '  [' + h.severity + ']' : '');
        opts.push('<option value="' + esc(id) + '">' + esc(label) + '</option>');
    });
    sel.innerHTML = opts.join('');
    sel.value = current;
}

function calcFMEAProb() {
    const rate = parseFloat((document.getElementById('fmea-rate') || {}).value) || 0;
    const time = parseFloat((document.getElementById('fmea-time') || {}).value) || 0;
    const p = -Math.expm1(-rate * time);
    const el = document.getElementById('fmea-calc-prob');
    if (el) el.innerText = p.toExponential(4);
    return p;
}

function renderAiAssistant(){
    // Phase 53.66b — Pro+ tier gates AI now (not Pro).
    const lockedBanner = document.getElementById('ai-locked-banner');
    const settingsBlock = document.getElementById('ai-settings-block');
    const proPlus = (typeof isProPlusLicensed === 'function') ? isProPlusLicensed() : true;
    if (lockedBanner) lockedBanner.style.display = proPlus ? 'none' : '';
    if (settingsBlock) settingsBlock.style.display = proPlus ? '' : 'none';
    if (!proPlus) return;
    // Load keys + settings into form.
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = (v == null ? '' : v); };
    try { set('ai-anthropic-key', localStorage.getItem(AI_LS_ANTHROPIC) || ''); } catch(_) {}
    try { set('ai-voyage-key',    localStorage.getItem(AI_LS_VOYAGE)    || ''); } catch(_) {}
    const ais = (projectConfig && projectConfig.aiSettings) || {};
    set('ai-anthropic-model', ais.anthropicModel || 'claude-opus-4-8');
    set('ai-voyage-model',    ais.voyageModel    || 'voyage-3-large');
    set('ai-max-tokens',      ais.maxTokens      || 4096);
    set('ai-cost-cap',        ais.costCap        || '');
    set('ai-top-k',           ais.topK           || 5);
    // Self-hosted / on-prem backend (#56) — device-level routing config (localStorage).
    try {
        const lsGet = (k) => { try { return localStorage.getItem(k) || ''; } catch(_) { return ''; } };
        set('ai-provider-mode',        lsGet('safetyLab.ai.provider') || 'cloud');
        set('ai-local-endpoint',       lsGet('safetyLab.ai.localEndpoint'));
        set('ai-local-model',          lsGet('safetyLab.ai.localModel'));
        set('ai-local-key',            lsGet('safetyLab.ai.localKey'));
        set('ai-local-embed-endpoint', lsGet('safetyLab.ai.localEmbedEndpoint'));
        set('ai-local-embed-model',    lsGet('safetyLab.ai.localEmbedModel'));
        const visEl = document.getElementById('ai-local-vision');
        if (visEl) visEl.checked = (lsGet('safetyLab.ai.localVision') !== '0');
    } catch(_) {}
    // ITAR toggle + status.
    const itarEl = document.getElementById('ai-itar-toggle');
    if (itarEl) itarEl.checked = !!(projectConfig && projectConfig.isITARControlled);
    _refreshAiITARStatus();
    _refreshAiAllowance();
    _refreshAiCostDisplay();
    _refreshAiMemoryCount();
    _renderAiAuditLog();
}

// Phase 53.66b — refresh the allowance progress bar from AiClient.getTokenUsage().
function _refreshAiAllowance(){
    const u = (typeof AiClient !== 'undefined') ? AiClient.getTokenUsage() : { used: 0, allowance: PRO_PLUS_MONTHLY_ALLOWANCE };
    const fill = document.getElementById('ai-allowance-bar-fill');
    const txt  = document.getElementById('ai-allowance-text');
    const unlimited = !isFinite(u.allowance);            // enterprise / owner — uncapped
    const pct  = unlimited ? 0 : (u.allowance > 0 ? Math.min(100, (u.used / u.allowance) * 100) : 0);
    if (fill) {
        fill.style.width = (unlimited ? 100 : pct).toFixed(1) + '%';
        // Calm "all-clear" gradient when uncapped; warning gradient as a capped bar fills.
        if (unlimited)     fill.style.background = 'linear-gradient(90deg, #34c759, #0A63CC)';
        else if (pct > 90) fill.style.background = 'linear-gradient(90deg, #ff9500, #ff3b30)';
        else if (pct > 70) fill.style.background = 'linear-gradient(90deg, #6366f1, #ff9500)';
        else               fill.style.background = 'linear-gradient(90deg, #6366f1, #0A63CC)';
    }
    if (txt) txt.textContent = unlimited
        ? (Math.round(u.used).toLocaleString() + ' tokens used this month · Unlimited')
        : (Math.round(u.used).toLocaleString() + ' / ' + u.allowance.toLocaleString() + ' used · ' + pct.toFixed(1) + '%');
}

function _refreshAiITARStatus(){
    const status = document.getElementById('ai-itar-status');
    if (!status) return;
    const itar = !!(projectConfig && projectConfig.isITARControlled);
    if (itar) {
        status.innerHTML = '<span style="color: var(--sev-haz-fg, #c47100); font-weight: 600;">⚠ ITAR mode active.</span> AI calls will route via Azure OpenAI (US-East private deployment). BYO key mode is blocked for this project.';
    } else {
        status.innerHTML = '<span class="u-muted">Standard mode: calls route via public Anthropic API through the Safety Lab Aero proxy.</span>';
    }
}

function _refreshAiCostDisplay(){
    const el = document.getElementById('ai-cost-display');
    if (el) el.textContent = '$' + AiClient.getSessionCost().toFixed(4);
}
async function _refreshAiMemoryCount(){
    try {
        const n = await AiMemory.count();
        const el = document.getElementById('ai-memory-count');
        if (el) el.textContent = n;
    } catch(_) {}
}
function _renderAiAuditLog(){
    const host = document.getElementById('ai-audit-log');
    if (!host) return;
    const log = AiClient.getAuditLog().slice(-50).reverse();
    if (!log.length) { host.innerHTML = '<div class="u-muted-italic">No AI calls yet.</div>'; return; }
    const fmtTs = (ts) => { try { return new Date(ts).toLocaleString(); } catch(_) { return ts; } };
    host.innerHTML = log.map(e => {
        const ok = e.ok !== false;
        const color = ok ? 'var(--color-text-secondary)' : 'var(--sev-cat-fg)';
        const tag = ok ? '✓' : '✗';
        const cost = e.cost ? '$' + e.cost.toFixed(4) : '';
        const tok = (e.tokensIn || e.tokensOut) ? ((e.tokensIn || 0) + 'in / ' + (e.tokensOut || 0) + 'out') : '';
        const err = e.error ? (' · ' + e.error) : '';
        return '<div style="display: flex; gap: 8px; padding: 3px 6px; border-bottom: 1px solid var(--color-border-hair); color: ' + color + ';">'
             + '<span>' + tag + '</span>'
             + '<span style="min-width: 140px;">' + fmtTs(e.ts) + '</span>'
             + '<span style="min-width: 140px;">' + esc(e.feature || '—') + '</span>'
             + '<span style="min-width: 180px;">' + esc(e.model || '—') + '</span>'
             + '<span style="min-width: 110px;">' + esc(tok) + '</span>'
             + '<span style="min-width: 80px; text-align: right;">' + esc(cost) + '</span>'
             + '<span style="flex: 1; color: var(--sev-cat-fg);">' + esc(err) + '</span>'
             + '</div>';
    }).join('');
}

function _populateItemOwningSystem(){
    const sel = document.getElementById('item-owning-system');
    if (!sel) return;
    const opts = ['<option value="">-- Aircraft-level --</option>'];
    (systemsData || []).forEach(s => {
        opts.push('<option value="' + esc(s.id) + '">' + esc(s.name || s.id) + '</option>');
    });
    sel.innerHTML = opts.join('');
}

// Equipment → Zone link (Phase additive). Populate the item Zone select from
// existing zsaData zoneIds; a blank option leaves the item unassigned. `selected`
// is preserved as a one-off option even if its zone no longer exists, so editing
// an item never silently drops a stale link.
function _populateItemZone(selected){
    const sel = document.getElementById('item-zone');
    if (!sel) return;
    const cur = selected != null ? String(selected) : (sel.value || '');
    const opts = ['<option value="">-- Unassigned --</option>'];
    const seen = new Set();
    (zsaData || []).forEach(z => {
        const zid = z && z.zoneId != null ? String(z.zoneId) : '';
        if (!zid || seen.has(zid)) return;
        seen.add(zid);
        const label = zid + (z.desc ? '  ·  ' + String(z.desc).slice(0, 50) : '');
        opts.push('<option value="' + esc(zid) + '">' + esc(label) + '</option>');
    });
    if (cur && !seen.has(cur)) {
        opts.push('<option value="' + esc(cur) + '">' + esc(cur) + ' (zone not found)</option>');
    }
    sel.innerHTML = opts.join('');
    sel.value = cur;
}

function _renderItemTraceList(checked){
    const host = document.getElementById('item-trace-list');
    if (!host) return;
    const checkedSet = new Set((checked || []).map(String));
    const funcs = (acFunctionsData || []).slice();
    // Also offer system-scope functions when an item has a system selected — these
    // share the function namespace (per Phase 24 rename, sys functions have funcId).
    (systemsData || []).forEach(s => {
        (s.functions || []).forEach(f => funcs.push({ subId: f.funcId, subName: (f.funcName || '') + ' [' + (s.name || s.id) + ']' }));
    });
    if (!funcs.length) {
        host.innerHTML = '<div style="font-size: 12px; color: var(--color-text-tertiary); font-style: italic;">No functions defined yet — add Aircraft or System functions first.</div>';
        return;
    }
    const rows = funcs.map(f => {
        const id = f.subId || '';
        const label = id + (f.subName ? '  ·  ' + f.subName : '');
        const c = checkedSet.has(String(id)) ? ' checked' : '';
        return '<label class="checkbox-list-item" style="display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; font-size: 12px;">'
             + '<input type="checkbox" value="' + esc(id) + '"' + c + '> ' + esc(label) + '</label>';
    });
    host.innerHTML = rows.join('');
}

function _readItemTraceList(){
    const host = document.getElementById('item-trace-list');
    if (!host) return [];
    return Array.from(host.querySelectorAll('input[type=checkbox]:checked')).map(cb => cb.value);
}

function renderItems(){
    const tbody = document.getElementById('item-body');
    if (!tbody) return;
    const sysName = (id) => {
        if (!id) return '<span class="u-muted">Aircraft-level</span>';
        const s = (systemsData || []).find(x => x.id === id);
        return s ? esc(s.name || s.id) : esc(id);
    };
    const traceCell = (ids) => {
        if (!ids || !ids.length) return '<span class="u-muted">—</span>';
        const chips = ids.slice(0, 3).map(t => '<span style="display: inline-block; padding: 1px 6px; margin-right: 3px; background: var(--color-surface-2); border-radius: var(--r-full); font-size: 10.5px;">' + esc(t) + '</span>').join('');
        const more = ids.length > 3 ? ' <span style="font-size: 10.5px; color: var(--color-text-tertiary);">+' + (ids.length - 3) + ' more</span>' : '';
        return chips + more;
    };
    const dalBadge = (d) => '<span style="display: inline-block; padding: 1px 8px; background: var(--color-accent-soft); color: var(--color-accent); border-radius: var(--r-full); font-size: 11px; font-weight: 700; font-family: var(--font-mono);">' + esc(d || 'E') + '</span>';
    // Equipment → Zone link chip. Blank zoneId shows a muted dash. Flags a stale
    // link (zone no longer in zsaData) so the analyst notices a dangling reference.
    const zoneCell = (zid) => {
        if (!zid) return '<span class="u-muted">—</span>';
        const exists = (zsaData || []).some(z => String(z.zoneId) === String(zid));
        const bg = exists ? 'var(--color-surface-2)' : 'rgba(255,149,0,0.15)';
        const title = exists ? '' : ' title="Zone not found in ZSA — stale link"';
        return '<span' + title + ' style="display: inline-block; padding: 1px 7px; background: ' + bg + '; border-radius: var(--r-full); font-size: 10.5px; font-family: var(--font-mono);">' + esc(zid) + (exists ? '' : ' ⚠') + '</span>';
    };
    // ENG-2 phase 1c — paginated via the shared pager (>50 rows).
    const _itemRowHtml = row => {
        const actions = rowActionsHTML('editItem', 'deleteItem', row.internalId);
        // 8 Aug 2026 (SL-ARC-0001 §22, RAM→item edge) — the ledger-written failure
        // rate, shown beside the name with its provenance. rateSource.written vs the
        // live value distinguishes a ledger number from a later hand edit.
        const _rateChip = (row.rate > 0)
            ? ' <span class="u-mono" title="' + (row.rateSource && row.rateSource.origin === 'ram-ledger' && row.rate === row.rateSource.written
                    ? 'Failure rate written by the RAM ledger (Σλ over ' + esc(String(row.rateSource.events || '')) + ' linked event(s), ' + esc(String(row.rateSource.at || '').slice(0, 10)) + ')'
                    : 'Failure rate (hand-entered or edited since the ledger write)') + '"'
                + ' style="display:inline-block; padding:1px 7px; margin-left:5px; background:var(--color-surface-2); border-radius:var(--r-full); font-size:10.5px;">λ ' + esc(Number(row.rate).toExponential(1)) + '</span>'
            : '';
        return '<tr>'
             + '<td>' + actions + '</td>'
             + '<td><strong>' + esc(row.itemId) + '</strong></td>'
             + '<td>' + esc(row.name) + _rateChip + '</td>'
             + '<td><span style="font-size: 11px; color: var(--color-text-secondary);">' + esc(row.type || 'HW+SW') + '</span></td>'
             + '<td>' + dalBadge(row.dal) + ' <span style="font-size: 10px; color: var(--color-text-tertiary);">' + esc(row.daType || 'IDAL') + '</span></td>'
             + '<td>' + esc(row.daType || 'IDAL') + '</td>'
             + '<td>' + sysName(row.owningSystemId) + '</td>'
             + '<td>' + zoneCell(row.zoneId) + '</td>'
             + '<td>' + traceCell(row.traceIds) + '</td>'
             + '<td><span style="font-size: 11.5px; color: var(--color-text-secondary);">' + esc(row.description || '') + '</span></td>'
             + '</tr>';
    };
    if (typeof SLPaginate !== 'undefined' && SLPaginate.pageTbody) {
        SLPaginate.pageTbody({ key: 'items', tbody, rows: (itemsData || []), rowHtml: _itemRowHtml,
            label: (f, t, n) => 'items ' + f + '–' + t + ' of ' + n + ' — DAL rollups computed over the full register' });
    } else {
        tbody.innerHTML = (itemsData || []).map(_itemRowHtml).join('');
    }
}

// Phase 53.60 — Σα_FM aggregation for a given beId. Used by the FMEA table render
// to show a warning chip when a basic event's piece-part FMEA rows don't sum to 1.
function _sumAlphaFmForBe(beId) {
    if (!beId) return 0;
    return (fmeaData || []).reduce((s, r) => {
        if ((r.fmeaType || 'piece-part') !== 'piece-part') return s;
        if (r.beId !== beId) return s;
        const a = parseFloat(r.alphaFm);
        return s + (isNaN(a) ? 0 : a);
    }, 0);
}

// Phase 56.x — Aggregate ALL piece-part FMEA rows onto their linked basic events.
// A component basic event's rate is the SUM of its failure-mode rates
// (λ_be = Σ λ_mode). The previous implementation wrote each mode's rate in turn,
// so multiple modes clobbered each other and the basic event kept only the LAST
// mode's λ — systematically under-counting any multi-mode component. We set
// node.lambda to the per-beId sum and let calculateAllProbabilities → effectiveProb
// derive the probability (which correctly honors repair model / Markov / phase),
// rather than writing a row-level probability that bypasses those.
// Pass beIds in `alsoReset` to zero basic events that have lost all FMEA rows.
function _pushPiecePartFmeaToFta(alsoReset) {
    const byBe = new Map();
    (fmeaData || []).forEach(r => {
        if ((r.fmeaType || 'piece-part') !== 'piece-part' || !r.beId) return;
        byBe.set(r.beId, (byBe.get(r.beId) || 0) + (parseFloat(r.rate) || 0));
    });
    (alsoReset || []).forEach(beId => { if (beId && !byBe.has(beId)) byBe.set(beId, 0); });
    byBe.forEach((lambdaSum, beId) => {
        let target = null;
        for (const page of ftaPages) { target = findNode(page.root, beId); if (target) break; }
        if (target) target.lambda = lambdaSum;
    });
    if (typeof calculateAllProbabilities === 'function') calculateAllProbabilities();
    if (typeof updateD3 === 'function') updateD3();
}

// Phase 56.x (#2) — Failure-mode coverage check. For each basic event whose
// piece-part FMEA rows carry an explicit α_FM, flag when Σα deviates from 1
// (i.e. part of the component's failure rate is unmodeled). Surfaced as a
// banner in the FMEA table; purely advisory, no compute change.
function _fmeaCoverageIssues() {
    const byBe = new Map();
    (fmeaData || []).forEach(r => {
        if ((r.fmeaType || 'piece-part') !== 'piece-part' || !r.beId) return;
        const a = parseFloat(r.alphaFm);
        if (isNaN(a)) return; // only α-apportioned rows participate in coverage
        const e = byBe.get(r.beId) || { sum: 0, n: 0 };
        e.sum += a; e.n += 1; byBe.set(r.beId, e);
    });
    const issues = [];
    byBe.forEach((e, beId) => {
        if (Math.abs(e.sum - 1) <= 0.02) return; // covered within tolerance
        let disp = String(beId);
        for (const page of ftaPages) { const n = findNode(page.root, beId); if (n) { disp = n.displayId || disp; break; } }
        issues.push({ beId, displayId: disp, pct: Math.round(e.sum * 100) });
    });
    return issues;
}
function _fmeaCoverageBannerHtml(issues) {
    const items = issues.map(i => '<strong>' + esc(i.displayId) + '</strong> (' + i.pct + '% of λ modeled)').join(', ');
    return '<tr><td colspan="15" style="background: rgba(255,149,0,0.10); border-left: 3px solid var(--sev-haz-fg, #ff9500); padding: 8px 12px; font-size: 12px; color: var(--color-text-secondary);">'
         + '⚠ <strong>Incomplete failure-mode coverage</strong> — α-apportioned modes for these basic events don&#39;t sum to 1, so part of each component&#39;s failure rate is unmodeled: '
         + items + '. Add the missing modes or normalize α so Σα = 1.</td></tr>';
}

function addNewFTAPage() {
    // New trees start blank — user adds the top event via "+ Add Top Event".
    const newId = 'page-' + Date.now();
    // Phase 53.46 — inherit the user's last-used calc mode so a new top-down tree doesn't
    // silently revert to bottom-up the moment they hit "+ New Fault Tree".
    let defaultMode = ftaConfig.mode || 'bottom-up';
    try {
        const saved = localStorage.getItem(_UI_FTA_MODE_KEY);
        if (saved === 'top-down' || saved === 'bottom-up') defaultMode = saved;
    } catch(_) {}
    ftaPages.push({ id: newId, name: `Tree ${ftaPages.length + 1}`, root: null, treeLevel: 'standalone', mode: defaultMode, missionProfileId: ftaConfig.missionProfileId || '' });
    activeFTAPageId = newId; selectedNodeData = null; document.getElementById('node-config-panel').style.display = 'none';
    // Phase 53.34 — sync toolbar state from the new active page so headline λ_top / exposure / link
    // dropdown reflect the page we just switched to (not whatever the previous page had set).
    if (typeof syncFtaConfigFromActivePage === 'function') syncFtaConfigFromActivePage();
    renderFTASidebar(); updateD3(); fitToScreen(); refreshTreeLevelDropdown();
}

// Phase 53.34 — make ftaConfig follow the active page. Each page owns its linkedFhaId; ftaConfig
// is the live toolbar state. When the analyst switches pages, we re-derive the toolbar values
// from the new page so headline λ_top / exposure / target rate don't leak between trees.
function syncFtaConfigFromActivePage() {
    const page = ftaPages.find(p => p.id === activeFTAPageId);
    if (!page) return;
    const ids = Array.isArray(page.linkedFhaIds) ? page.linkedFhaIds : (page.linkedFhaId ? [page.linkedFhaId] : []);
    const primary = ids[0] || '';
    // Translate page-stored FHA id back to toolbar dropdown format (AC_/SYS_ prefix).
    let toolbarVal = '';
    if (primary) {
        // #51 — string-coerced compare so the stored page link (numeric internalId) still resolves
        // back to the toolbar value on reload; otherwise the dropdown stays empty and the tree
        // reads as "Unlinked" after every refresh even though page.linkedFhaId is set.
        const acHit  = (acFhaData || []).find(f => String(f.internalId) === String(primary));
        const sysHit = (typeof getAllSysFha === 'function') ? getAllSysFha().find(f => String(f.internalId) === String(primary)) : null;
        if (acHit) toolbarVal = 'AC_'  + primary;
        else if (sysHit) toolbarVal = 'SYS_' + primary;
    }
    ftaConfig.linkedFhaId = toolbarVal;
    // Drive the link dropdown so updateFTAConfigUI() picks the right severity / target.
    const linkSel = document.getElementById('fta-fha-link');
    if (linkSel) {
        // Ensure the option exists (it'll be rebuilt by updateFTAConfigUI anyway).
        if (toolbarVal && !Array.from(linkSel.options).some(o => o.value === toolbarVal)) {
            const opt = document.createElement('option');
            opt.value = toolbarVal; opt.textContent = '(page link)';
            linkSel.appendChild(opt);
        }
        linkSel.value = toolbarVal;
    }
    // Phase 56.47 — per-page targetP for standalone (no-FHA-link) trees. The
    // engineer's top-event budget belongs to the tree, not to ftaConfig — so it
    // must survive page switches and refreshes. When the page has no link:
    //   • Use page.targetP if previously set
    //   • Fall back to ftaConfig.targetP (which was restored from autosave)
    //   • Final fallback: 1e-5 placeholder so a fresh blank tree starts somewhere
    if (!toolbarVal) {
        let restored = null;
        if (typeof page.targetP === 'number' && isFinite(page.targetP) && page.targetP > 0) {
            restored = page.targetP;
        } else if (typeof ftaConfig.targetP === 'number' && isFinite(ftaConfig.targetP) && ftaConfig.targetP > 0) {
            restored = ftaConfig.targetP;
        } else {
            restored = 0.00001;
        }
        ftaConfig.targetP = restored;
        const tp = document.getElementById('fta-target-p');
        if (tp) tp.value = String(restored);
    }
    // Phase 53.46 — per-page calc mode. If the page records a mode, restore the dropdown +
    // ftaConfig to it. Otherwise, fall back to whatever the user had selected last (from
    // localStorage / current ftaConfig).
    if (page.mode === 'top-down' || page.mode === 'bottom-up') {
        ftaConfig.mode = page.mode;
        const modeSel = document.getElementById('fta-calc-mode');
        if (modeSel) modeSel.value = page.mode;
        // Phase 66.10 — same seeding on page load as on the toolbar switch, so a
        // saved top-down page whose nodes predate weights allocates evenly.
        if (page.mode === 'top-down' && typeof seedTopDownWeights === 'function') {
            try { seedTopDownWeights(page.root); } catch (_) {}
        }
    }
    // Phase 76 — mission profile follows the page; re-pull exposure under its phase durations.
    ftaConfig.missionProfileId = page.missionProfileId || '';
    if (typeof refreshFtaMissionProfileDropdown === 'function') refreshFtaMissionProfileDropdown();
    if ((ftaConfig.exposureSource || 'auto') === 'auto' && ftaConfig.linkedFhaId && typeof syncFTAExposureFromFHA === 'function') {
        syncFTAExposureFromFHA();
    }
    if (typeof updateFTAConfigUI === 'function') updateFTAConfigUI();
    if (typeof refreshTopAllocatorReadout === 'function') refreshTopAllocatorReadout();
}

function fitToScreen() {
    if (!svg || !getActiveFTARoot()) return;
    const parent = document.getElementById('svg-wrap-container');
    const fullWidth = parent.clientWidth; const fullHeight = parent.clientHeight;
    
    const bounds = g.node().getBBox();
    if (bounds.width === 0 || bounds.height === 0) return; 
    
    const pad = 150; const bWidth = bounds.width + pad; const bHeight = bounds.height + pad;
    const scale = Math.min(1.2, Math.min(fullWidth / bWidth, fullHeight / bHeight));
    const midX = bounds.x + bounds.width / 2; const midY = bounds.y + bounds.height / 2;
    const translate = [fullWidth / 2 - scale * midX, fullHeight / 2 - scale * midY];
    
    svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
}

function initD3() {
    try {
        if (typeof d3 === 'undefined') return;
        // ENG-2 phase 2 — the zoom handler stays pure-transform (cheap, every frame);
        // _ftaCullOnZoom is a throttled trailing re-render that only fires on big
        // trees where viewport culling is active (no-op otherwise).
        svg = d3.select("#fta-svg"); g = svg.append("g"); zoom = d3.zoom().scaleExtent([0.1, 3]).filter(ev => ev.type === 'wheel' ? (ev.ctrlKey || ev.metaKey) : !ev.button).on("zoom", (e) => { g.attr("transform", e.transform); if (typeof _ftaCullOnZoom === 'function') _ftaCullOnZoom(); }); svg.call(zoom);
        svg.on("dblclick.zoom", null); // double-click means "open properties", not zoom-in
        const width = document.getElementById('fta-svg').clientWidth; svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, 140)); 
        
        // Phase 41 — connector length tuned for readability:
        //   • Description block: y = -120 to -30 (90 px tall) — collapses to ~18 px when empty (Phase 39).
        //   • Shape: y ≈ -25 to +15 (OR/AND) or y ≈ -20 to +20 (basic circle).
        //   • Link source attach: y_parent + 25 (small stub below shape so the line is visible).
        //   • Link target attach: y_child - 120 (top of description box).
        // pitch = 175 → 30 px of visible connector between the gate's shape bottom and the
        // horizontal child-connector bar. Long enough to read clearly, short enough not to bloat.
        // Phase 49 — vertical pitch sized for the worst-case description height (max 140 px)
        // plus the ID/metrics/link-attach footprint. Most nodes (short or empty descriptions)
        // occupy far less, so the canvas still looks compact thanks to autoSizeNodeDescription
        // anchoring each foreignObject's bottom right above the shape.
        // Phase 53.40 — vertical spacing derived from the description-box height so gates +
        // connector lines move together when the box size changes.
        treeLayout = d3.tree()
            .nodeSize([165, _ftaNodeVerticalSpacing()])
            .separation((a, b) => a.parent === b.parent ? 1.05 : 1.2);
    } catch (err) { console.error(err); }
}

function getShapePath(d) {
    // A logical gate that has been transferred out renders as the standard transfer triangle on the
    // source page. Its description, displayId, and logicalId are preserved in the description box.
    if (d.data.transferOutTo) return "M 0,-20 L 20,15 L -20,15 Z";
    if (d.data.type === 'basic') return "M 0,-20 A 20,20 0 1,1 0,20 A 20,20 0 1,1 0,-20";
    if (d.data.gateType === 'AND') return "M -20,15 L -20,-5 A 20,20 0 0,1 20,-5 L 20,15 Z";
    if (d.data.gateType === 'OR') return "M -20,15 C -10,10 10,10 20,15 C 20,0 15,-15 0,-25 C -15,-15 -20,0 -20,15 Z";
    if (d.data.gateType === 'XOR') return "M -20,19 C -10,14 10,14 20,19 M -20,15 C -10,10 10,10 20,15 C 20,0 15,-15 0,-25 C -15,-15 -20,0 -20,15 Z";
    if (d.data.gateType === 'VOTING') return "M 0,-20 L 18,-5 L 18,15 L 0,30 L -18,15 L -18,-5 Z";
    if (d.data.gateType === 'INHIBIT') return "M -20,-15 L 20,-15 L 25,0 L 20,15 L -20,15 L -25,0 Z";
    if (d.data.gateType === 'TRANSFER') return "M 0,-20 L 20,15 L -20,15 Z";
    // Dynamic gates: PAND uses AND shape with an arrow inside; SPARE is a rounded pill; FDEP a trapezoid.
    if (d.data.gateType === 'PAND') return "M -22,15 L -22,-5 A 22,22 0 0,1 22,-5 L 22,15 Z M -10,5 L 10,5 L 5,0 M 10,5 L 5,10";
    if (d.data.gateType === 'SPARE') return "M -22,-12 L 22,-12 A 12,12 0 0,1 22,12 L -22,12 A 12,12 0 0,1 -22,-12 Z";
    if (d.data.gateType === 'FDEP') return "M -22,-12 L 22,-12 L 16,12 L -16,12 Z";
    if (d.data.type === 'undeveloped') return "M 0,-25 L 25,0 L 0,25 L -25,0 Z";
    if (d.data.type === 'conditioning') return "M 0,-15 A 25,15 0 1,1 0,15 A 25,15 0 1,1 0,-15";
    if (d.data.type === 'house') return "M -20,20 L 20,20 L 20,-5 L 0,-25 L -20,-5 Z";
    return "M -20,-20 h 40 v 40 h -40 Z";
}

function _renderCorrelationLegend(hasRepeated, hasCCF) {
    const wrap = document.getElementById('svg-wrap-container'); if (!wrap) return;
    if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
    let el = document.getElementById('ccf-corr-legend');
    if (!hasRepeated && !hasCCF) { if (el) el.style.display = 'none'; return; }
    if (!el) {
        el = document.createElement('div'); el.id = 'ccf-corr-legend';
        el.style.cssText = 'position:absolute;left:12px;bottom:12px;z-index:6;display:flex;gap:14px;align-items:center;padding:6px 12px;border-radius:9px;font-size:12px;background:var(--bg-control,rgba(255,255,255,0.92));border:1px solid var(--border-primary,#e5e7eb);color:var(--color-text-secondary,#555);box-shadow:0 2px 10px rgba(0,0,0,0.12);pointer-events:none;';
        wrap.appendChild(el);
    }
    const dot = c => '<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:' + c + ';margin-right:6px;vertical-align:-1px;"></span>';
    let html = '<span style="text-transform:uppercase;letter-spacing:0.04em;font-size:10px;color:var(--color-text-tertiary,#888);">correlation</span>';
    html += '<span>' + dot('#34c759') + 'independent</span>';
    if (hasRepeated) html += '<span>' + dot('#f59e0b') + 'same physical event</span>';
    if (hasCCF) html += '<span>' + dot('#8b5cf6') + 'CCF group</span>';
    el.innerHTML = html; el.style.display = 'flex';
}

// ── CCF pill + popover manager (#5) ─────────────────────────────────────────
// The violet (CCF: <group>) tag on a basic event is a clickable PILL. Clicking opens a popover
// that manages the whole common-cause group inline: β/γ/δ, the member list (every basic event in
// any FTA page sharing this ccfGroup), apply-to-all, and remove-from-group.
function _ftaCcfMembers(groupName) {
    if (!groupName) return [];
    const out = [];
    const pages = (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) ? ftaPages : [];
    pages.forEach(function (pg) {
        (function walk(n) {
            if (!n) return;
            if (n.type === 'basic' && n.ccfGroup === groupName) out.push({ node: n, pageName: pg.name || '' });
            (n.children || []).forEach(walk);
            (n._children || []).forEach(walk);
        })(pg.root);
    });
    return out;
}
function _closeFtaCcfPopover() {
    const p = document.getElementById('fta-ccf-popover'); if (p) p.remove();
    document.removeEventListener('mousedown', _ftaCcfOutside, true);
    document.removeEventListener('keydown', _ftaCcfEsc, true);
}
function _ftaCcfOutside(e) { const p = document.getElementById('fta-ccf-popover'); if (p && !p.contains(e.target)) _closeFtaCcfPopover(); }
function _ftaCcfEsc(e) { if (e.key === 'Escape') _closeFtaCcfPopover(); }
function _ftaCcfPopover(node, event) {
    _closeFtaCcfPopover();
    if (!node || !node.ccfGroup) return;
    const grp = node.ccfGroup;
    const members = _ftaCcfMembers(grp);
    const b = node.beta || 0, g = node.gamma || 0, dl = node.delta || 0;
    const pop = document.createElement('div');
    pop.id = 'fta-ccf-popover';
    pop.style.cssText = 'position:fixed;z-index:2147483601;width:320px;max-height:76vh;overflow:auto;background:var(--color-surface-1,#fff);color:var(--color-text-primary,#111);border:1px solid #c4b5fd;border-radius:12px;box-shadow:0 18px 48px rgba(0,0,0,.28);padding:14px 16px;font-size:13px;';
    const x = Math.min((event && event.clientX) || 200, window.innerWidth - 340);
    const y = Math.min((event && event.clientY) || 200, window.innerHeight - 380);
    pop.style.left = Math.max(12, x) + 'px';
    pop.style.top = Math.max(12, y) + 'px';
    const fld = function (id, lbl, val) {
        return '<label style="flex:1;font-size:11px;color:var(--color-text-secondary,#667085);">' + lbl +
            '<input id="' + id + '" type="number" step="0.01" min="0" max="1" value="' + val + '" style="width:100%;padding:5px 7px;margin-top:2px;border:1px solid var(--color-border-hair,#ddd);border-radius:6px;font:inherit;font-size:13px;background:var(--color-surface-2,#fff);color:inherit;box-sizing:border-box;"></label>';
    };
    const rows = members.map(function (m) {
        const nn = m.node;
        return '<div style="padding:6px 9px;border-bottom:1px solid var(--color-border-hair,#f1f1f1);display:flex;justify-content:space-between;gap:8px;align-items:center;">' +
            '<span style="font-weight:600;white-space:nowrap;">' + esc(nn.displayId || ('BE-' + nn.id)) + '</span>' +
            '<span style="color:var(--color-text-secondary,#667085);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(nn.description || nn.name || '') + '</span>' +
            '<span style="color:#7c3aed;font-variant-numeric:tabular-nums;white-space:nowrap;">β ' + (nn.beta || 0) + '</span></div>';
    }).join('') || '<div style="padding:8px 9px;color:var(--color-text-secondary,#667085);">This is the only member — add more via multi-select grouping.</div>';
    pop.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">' +
          '<div style="font-weight:700;color:#7c3aed;">◆ Common-cause group</div>' +
          '<button id="ccf-pop-x" aria-label="Close" style="border:none;background:transparent;font-size:18px;line-height:1;cursor:pointer;color:var(--color-text-tertiary,#888);">&times;</button></div>' +
        '<div style="font-weight:600;">' + esc(grp) + '</div>' +
        '<div style="color:var(--color-text-secondary,#667085);margin:2px 0 10px;font-size:12px;">' + members.length + ' member' + (members.length === 1 ? '' : 's') + ' · β = fraction of failures that are common-cause</div>' +
        '<div style="display:flex;gap:8px;margin-bottom:8px;">' + fld('ccf-pop-beta', 'β (2-of-n)', b) + fld('ccf-pop-gamma', 'γ (3-of-n)', g) + fld('ccf-pop-delta', 'δ (4-of-n)', dl) + '</div>' +
        '<label style="display:flex;align-items:center;gap:6px;margin-bottom:12px;font-size:12px;cursor:pointer;"><input id="ccf-pop-all" type="checkbox" checked> Apply to all ' + members.length + ' member' + (members.length === 1 ? '' : 's') + '</label>' +
        '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--color-text-tertiary,#888);margin-bottom:4px;">Members</div>' +
        '<div style="border:1px solid var(--color-border-hair,#eee);border-radius:8px;max-height:150px;overflow:auto;margin-bottom:12px;">' + rows + '</div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button id="ccf-pop-save" class="action-btn btn-cyan" style="flex:1;">Save</button>' +
          '<button id="ccf-pop-ungroup" class="action-btn" style="flex:0 0 auto;background:transparent;border:1px solid #ef4444;color:#ef4444;">Remove this event</button></div>';
    document.body.appendChild(pop);
    document.getElementById('ccf-pop-x').onclick = _closeFtaCcfPopover;
    document.getElementById('ccf-pop-save').onclick = function () {
        const clamp = v => Math.max(0, Math.min(1, parseFloat(v) || 0));
        const nb = clamp(document.getElementById('ccf-pop-beta').value);
        const ng = clamp(document.getElementById('ccf-pop-gamma').value);
        const nd = clamp(document.getElementById('ccf-pop-delta').value);
        const all = document.getElementById('ccf-pop-all').checked;
        const targets = all ? members.map(m => m.node) : [node];
        targets.forEach(function (t) { t.beta = nb; t.gamma = ng; t.delta = nd; });
        _closeFtaCcfPopover();
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        try { if (typeof updateD3 === 'function') updateD3(); } catch (_) {}
        try { if (typeof showToast === 'function') showToast('Updated CCF group "' + grp + '".', 'success', 2600); } catch (_) {}
    };
    document.getElementById('ccf-pop-ungroup').onclick = function () {
        node.ccfGroup = ''; node.beta = 0; node.gamma = 0; node.delta = 0;
        _closeFtaCcfPopover();
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        try { if (typeof updateD3 === 'function') updateD3(); } catch (_) {}
        try { if (typeof showToast === 'function') showToast('Removed from CCF group.', 'info', 2600); } catch (_) {}
    };
    setTimeout(function () { document.addEventListener('mousedown', _ftaCcfOutside, true); document.addEventListener('keydown', _ftaCcfEsc, true); }, 0);
}

function _ftaCcfMultiStyle() {
    if (document.getElementById('ccf-multi-style')) return;
    const s = document.createElement('style'); s.id = 'ccf-multi-style';
    s.textContent = '.node.ccf-multi > path{stroke:#a78bfa !important;stroke-width:3.5px !important;stroke-dasharray:5 3;} .node.ccf-multi{filter:drop-shadow(0 0 3px #7c3aed);}';
    document.head.appendChild(s);
}
function _ftaCcfToggleMulti(node, el) {
    _ftaCcfMultiStyle();
    if (_ftaCcfMultiSel.has(node)) { _ftaCcfMultiSel.delete(node); if (el) el.classList.remove('ccf-multi'); }
    else { _ftaCcfMultiSel.add(node); if (el) el.classList.add('ccf-multi'); }
    _ftaCcfRenderMultiBar();
}
function _ftaCcfClearMulti() {
    _ftaCcfMultiSel.clear();
    document.querySelectorAll('.node.ccf-multi').forEach(el => el.classList.remove('ccf-multi'));
    const bar = document.getElementById('ccf-multi-bar'); if (bar) bar.remove();
}
function _ftaCcfRenderMultiBar() {
    let bar = document.getElementById('ccf-multi-bar');
    const n = _ftaCcfMultiSel.size;
    if (n < 1) { if (bar) bar.remove(); return; }
    if (!bar) {
        bar = document.createElement('div'); bar.id = 'ccf-multi-bar';
        bar.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:20px;z-index:2147483601;display:flex;align-items:center;gap:12px;background:#2e1065;color:#fff;border-radius:12px;padding:10px 16px;font-size:13px;box-shadow:0 12px 32px rgba(0,0,0,.35);';
        document.body.appendChild(bar);
    }
    bar.innerHTML = '<span>◆ <strong>' + n + '</strong> event' + (n === 1 ? '' : 's') + ' selected</span>' +
        '<button id="ccf-multi-group" class="action-btn btn-cyan" ' + (n < 2 ? 'disabled' : '') + ' style="padding:6px 12px;">Group as common cause</button>' +
        '<button id="ccf-multi-clear" class="action-btn" style="padding:6px 12px;background:transparent;border:1px solid rgba(255,255,255,.4);color:#fff;">Clear</button>';
    document.getElementById('ccf-multi-group').onclick = _ftaCcfGroupSelected;
    document.getElementById('ccf-multi-clear').onclick = _ftaCcfClearMulti;
}
function _ftaCcfGroupSelected() {
    const nodes = [..._ftaCcfMultiSel];
    if (nodes.length < 2) return;
    // Reuse an existing group name if one of the selected events already belongs to a group.
    const existing = nodes.map(n => n.ccfGroup).find(g => g && g.trim());
    const suggested = existing || ('CCF-GRP-' + String(Date.now()).slice(-4));
    const name = (typeof prompt === 'function') ? prompt('Common-cause group name:', suggested) : suggested;
    if (!name || !name.trim()) return;
    nodes.forEach(n => { n.ccfGroup = name.trim(); if (!(n.beta > 0)) n.beta = 0.1; });
    _ftaCcfClearMulti();
    try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
    try { if (typeof updateD3 === 'function') updateD3(); } catch (_) {}
    try { if (typeof showToast === 'function') showToast('Grouped ' + nodes.length + ' events as CCF "' + name.trim() + '" (β=0.1). Click the violet pill to tune β.', 'success', 4600); } catch (_) {}
}

function _ftaCcfDetect() {
    const pages = (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) ? ftaPages : [];
    // Scope to the ACTIVE fault tree only — the page being viewed plus any TRANSFER-linked
    // sub-pages that belong to the same logical tree. Common-cause grouping is meaningful
    // within one quantified tree; scanning every top-event tree in the project surfaces
    // cross-tree coincidences that aren't real common causes for the tree on screen.
    const activeId = (typeof activeFTAPageId !== 'undefined') ? activeFTAPageId : null;
    const active = pages.find(p => p.id === activeId);
    if (!active) return [];
    const scopePages = [];
    const seenPages = new Set();
    (function collect(pg) {
        if (!pg || seenPages.has(pg.id)) return;
        seenPages.add(pg.id); scopePages.push(pg);
        (function follow(n) {
            if (!n) return;
            const linkId = n.transferOutTo || n.linkedPageId;
            if (linkId) { const lp = pages.find(p => p.id === linkId); if (lp) collect(lp); }
            (n.children || []).forEach(follow); (n._children || []).forEach(follow);
        })(pg.root);
    })(active);
    const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const byDesc = {};
    scopePages.forEach(pg => (function w(n) {
        if (!n) return;
        if (n.type === 'basic') { const d = norm(n.description || n.name); if (d) (byDesc[d] = byDesc[d] || []).push(n); }
        (n.children || []).forEach(w); (n._children || []).forEach(w);
    })(pg.root));
    const out = [];
    Object.keys(byDesc).forEach(d => {
        // dedupe by logicalId so repeated (same physical) events aren't counted as separate members
        const distinct = [...new Map(byDesc[d].map(n => [(n.logicalId != null ? n.logicalId : n.id), n])).values()];
        if (distinct.length < 2) return;
        const groups = new Set(distinct.map(n => n.ccfGroup || ''));
        if (groups.size === 1 && [...groups][0]) return;   // already all in one group
        out.push({ label: distinct[0].description || distinct[0].name || '(unnamed)', nodes: distinct });
    });
    return out;
}
function _ftaCcfRenderSuggestPill() {
    const wrap = document.getElementById('svg-wrap-container'); if (!wrap) return;
    let el = document.getElementById('ccf-suggest-pill');
    let suggestions = [];
    try { suggestions = _ftaCcfDetect(); } catch (_) {}
    if (!suggestions.length) { if (el) el.remove(); return; }
    if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
    if (!el) {
        el = document.createElement('button'); el.id = 'ccf-suggest-pill';
        // Bottom-LEFT: the canvas toolbar (Find/Fullscreen/Fit to Workspace, z-index 100) is
        // bottom-right, so the pill previously hid behind it. Left corner is clear; z-index 101
        // keeps it above any future overlay in that corner.
        el.style.cssText = 'position:absolute;left:12px;bottom:12px;z-index:101;display:flex;align-items:center;gap:6px;padding:7px 12px;border-radius:9px;font-size:12px;font-weight:600;cursor:pointer;background:#f5f3ff;border:1px solid #c4b5fd;color:#6d28d9;box-shadow:0 2px 10px rgba(0,0,0,.12);';
        wrap.appendChild(el);
    }
    el.textContent = '⚡ ' + suggestions.length + ' possible common-cause group' + (suggestions.length === 1 ? '' : 's');
    el.onclick = function () { _ftaCcfSuggestModal(); };
}
function _ftaCcfSuggestModal() {
    const suggestions = _ftaCcfDetect();
    const old = document.getElementById('ccf-suggest-modal'); if (old) old.remove();
    const ov = document.createElement('div'); ov.id = 'ccf-suggest-modal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483601;display:flex;align-items:center;justify-content:center;background:rgba(8,12,20,.5);padding:24px;';
    const items = suggestions.map(function (s, i) {
        const ids = s.nodes.map(n => esc(n.displayId || ('BE-' + n.id))).join(', ');
        return '<div style="border:1px solid var(--color-border-hair,#eee);border-radius:9px;padding:10px 12px;margin-bottom:8px;display:flex;justify-content:space-between;gap:10px;align-items:center;">' +
            '<div style="min-width:0;"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(s.label) + '</div>' +
            '<div style="color:var(--color-text-secondary,#667085);font-size:12px;">' + s.nodes.length + ' events · ' + ids + '</div></div>' +
            '<button class="action-btn btn-cyan ccf-sg-btn" data-i="' + i + '" style="flex:0 0 auto;padding:6px 12px;">Group</button></div>';
    }).join('') || '<div style="color:var(--color-text-secondary,#667085);padding:8px 0;">No common-cause candidates found.</div>';
    ov.innerHTML =
        '<div style="background:var(--color-surface-1,#fff);color:var(--color-text-primary,#111);border-radius:14px;width:100%;max-height:82vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,.32);">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--color-border-hair,#eee);">' +
            '<div style="font-weight:700;">⚡ Suggested common-cause groups</div>' +
            '<button id="ccf-sg-x" aria-label="Close" style="border:none;background:transparent;font-size:20px;cursor:pointer;color:var(--color-text-tertiary,#888);">&times;</button></div>' +
          '<div style="padding:14px 18px;overflow:auto;"><p style="margin:0 0 12px;font-size:12.5px;color:var(--color-text-secondary,#667085);">Distinct basic events sharing a description — likely common-cause candidates. Grouping applies a shared CCF group name and β=0.1 (tune later via the pill).</p>' + items + '</div></div>';
    document.body.appendChild(ov);
    document.getElementById('ccf-sg-x').onclick = () => ov.remove();
    ov.addEventListener('mousedown', e => { if (e.target === ov) ov.remove(); });
    ov.querySelectorAll('.ccf-sg-btn').forEach(function (btn) {
        btn.onclick = function () {
            const s = suggestions[parseInt(btn.getAttribute('data-i'), 10)];
            if (!s) return;
            const base = String(s.label).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20);
            const name = 'CCF-' + (base || ('GRP-' + String(Date.now()).slice(-4)));
            s.nodes.forEach(n => { n.ccfGroup = name; if (!(n.beta > 0)) n.beta = 0.1; });
            try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
            try { if (typeof updateD3 === 'function') updateD3(); } catch (_) {}
            try { if (typeof showToast === 'function') showToast('Grouped ' + s.nodes.length + ' events as "' + name + '" (β=0.1).', 'success', 4000); } catch (_) {}
            ov.remove();
        };
    });
}

function getNodeColors(d) {
    // Vibrant Apple-inspired palette. Dark mode brightens fills + strokes for contrast on
    // the near-black canvas; light mode uses the iOS system shades. Stroke is always 2 steps
    // darker than fill so the shape outline reads cleanly.
    const isDark = document.body.classList.contains('theme-dark');
    const L = {
        transfer: { fill: '#af52de', stroke: '#8e3dd1' },     // purple
        pand:     { fill: '#ff6482', stroke: '#e8456a' },     // pink
        spare:    { fill: '#5ac8fa', stroke: '#3aa7d8' },     // teal-cyan
        fdep:     { fill: '#bf5af2', stroke: '#9d3fd0' },     // magenta-purple
        and:      { fill: '#0A63CC', stroke: '#084FA3' },     // iOS blue
        or:       { fill: '#ff9500', stroke: '#e08400' },     // iOS orange
        xor:      { fill: '#ff9500', stroke: '#e08400' },
        voting:   { fill: '#5856d6', stroke: '#403fb8' },     // indigo
        inhibit:  { fill: '#34c759', stroke: '#2eb04e' },     // green
        gate:     { fill: '#8e8e93', stroke: '#6e6e73' },
        basic:    { fill: '#34c759', stroke: '#2eb04e' },     // green — independent basic event
        repeated: { fill: '#f59e0b', stroke: '#d97706' },     // amber — same physical event (repeated id)
        ccf:      { fill: '#8b5cf6', stroke: '#7c3aed' },     // violet — CCF-group member (β-coupled)
        undev:    { fill: '#ffcc00', stroke: '#d9ad00' },     // yellow
        cond:     { fill: '#5ac8fa', stroke: '#3aa7d8' },     // light cyan
        house:    { fill: '#a2845e', stroke: '#7c6448' }      // sand
    };
    const D = {
        transfer: { fill: '#bf5af2', stroke: '#d684f5' },
        pand:     { fill: '#ff7a96', stroke: '#ffa3b6' },
        spare:    { fill: '#64d2ff', stroke: '#8ee0ff' },
        fdep:     { fill: '#d18cf9', stroke: '#e2b3fb' },
        and:      { fill: '#3D8BFF', stroke: '#66A5FF' },
        or:       { fill: '#ff9f0a', stroke: '#ffba47' },
        xor:      { fill: '#ff9f0a', stroke: '#ffba47' },
        voting:   { fill: '#7d7aff', stroke: '#9d9bff' },
        inhibit:  { fill: '#30d158', stroke: '#5ee07d' },
        gate:     { fill: '#a1a1a6', stroke: '#c7c7cc' },
        basic:    { fill: '#30d158', stroke: '#5ee07d' },
        repeated: { fill: '#fbbf24', stroke: '#f59e0b' },
        ccf:      { fill: '#a78bfa', stroke: '#8b5cf6' },
        undev:    { fill: '#ffd60a', stroke: '#ffe254' },
        cond:     { fill: '#64d2ff', stroke: '#8ee0ff' },
        house:    { fill: '#bf9870', stroke: '#d1ad8b' }
    };
    const C = isDark ? D : L;

    // Transferred-out gates and the explicit TRANSFER gate type both signal "lives on another page".
    if (d.data.transferOutTo)           return C.transfer;
    if (d.data.gateType === 'TRANSFER') return C.transfer;
    if (d.data.gateType === 'PAND')     return C.pand;
    if (d.data.gateType === 'SPARE')    return C.spare;
    if (d.data.gateType === 'FDEP')     return C.fdep;
    if (d.data.gateType === 'AND')      return C.and;
    if (d.data.gateType === 'OR')       return C.or;
    if (d.data.gateType === 'XOR')      return C.xor;
    if (d.data.gateType === 'VOTING')   return C.voting;
    if (d.data.gateType === 'INHIBIT')  return C.inhibit;
    if (d.data.type === 'gate')         return C.gate;
    if (d.data.type === 'basic') {
        const lid = d.data.logicalId != null ? d.data.logicalId : d.data.id;
        if (d.data.ccfGroup && (d.data.beta || 0) > 0) return C.ccf;        // violet — CCF-group member
        if (_ftaRepeatedLids.has(lid))                  return C.repeated;   // amber — same physical event (repeated id)
        return C.basic;                                                      // green — independent
    }
    if (d.data.type === 'undeveloped')  return C.undev;
    if (d.data.type === 'conditioning') return C.cond;
    if (d.data.type === 'house')        return C.house;
    return { fill: '#ffffff', stroke: '#000000' };
}

function updateNodeDataInline() { 
    calculateAllProbabilities(); updateD3(); 
    if(selectedNodeData) { document.getElementById('config-name').value = selectedNodeData.name; document.getElementById('config-lambda').value = selectedNodeData.lambda || 0; } 
}

function _ensureLibPredictionDefaults() {
    if (!projectConfig) return;
    const SUPPORTED_STANDARDS = {
        'MIL-HDBK-217F':1, 'NSWC-11':1, 'Public Domain':1,
        // Pro · BYOL families (placeholder env/quality stubs only — no licensed values bundled).
        '217Plus 2015':1, 'FIDES 2022':1, 'Telcordia SR-332':1, 'Siemens SN 29500':1, 'IEC TR 62380':1
    };
    if (!SUPPORTED_STANDARDS[projectConfig.libraryStandard]) projectConfig.libraryStandard = 'MIL-HDBK-217F';
    if (!projectConfig.libraryEnv)      projectConfig.libraryEnv = 'GB';
    if (!projectConfig.libraryQuality)  projectConfig.libraryQuality = (projectConfig.libraryStandard === 'MIL-HDBK-217F' ? 'B2' : (STANDARD_QUALITIES[projectConfig.libraryStandard] ? Object.keys(STANDARD_QUALITIES[projectConfig.libraryStandard])[0] : 'GENERIC'));
    if (projectConfig.useStressPrediction == null) projectConfig.useStressPrediction = false;
    if (projectConfig.operatingTempC == null) projectConfig.operatingTempC = 25;
    if (projectConfig.activationEnergyEv == null) projectConfig.activationEnergyEv = 0.4;
}

// Look up the π_E factor for the project's selected standard + environment. Falls back to 1.0.
function _projectPiE() {
    _ensureLibPredictionDefaults();
    const tbl = STANDARD_ENVIRONMENTS[projectConfig.libraryStandard];
    if (!tbl) return 1.0;
    const entry = tbl[projectConfig.libraryEnv];
    return entry ? entry.piE : 1.0;
}

// Look up the π_Q factor for the project's selected standard + quality. Falls back to 1.0.
function _projectPiQ() {
    _ensureLibPredictionDefaults();
    const tbl = STANDARD_QUALITIES[projectConfig.libraryStandard];
    if (!tbl) return 1.0;
    const entry = tbl[projectConfig.libraryQuality];
    return entry ? entry.piQ : 1.0;
}

// Arrhenius temperature factor — π_T = exp(-Ea/k × (1/Tj_K − 1/T_ref_K))
// Tj in °C, Ea in eV, k = 8.617e-5 eV/K, T_ref = 298 K (25 °C).
function computePiT(tjC, ea) {
    const k = 8.617e-5;
    const eaUse = (typeof ea === 'number' && ea > 0) ? ea : 0.4;
    const TjK = (typeof tjC === 'number' ? tjC : 25) + 273.15;
    const TrefK = 298.15;
    return Math.exp(-(eaUse / k) * (1 / TjK - 1 / TrefK));
}

// Effective λ for a library entry = λ_base × π_T × π_Q × π_E.
// π_T applied only when projectConfig.useStressPrediction is true AND the entry's source family
// Non-electronic sources (NSWC mechanical, NPRD/EPRD field data) skip π_T.
function effectiveLambdaForLibraryEntry(entry) {
    if (!entry || !(entry.lambda > 0)) return 0;
    _ensureLibPredictionDefaults();
    const family = _sourceFamily(entry.source || '');
    // Phase 53.57/58 — only MIL-HDBK-217F has a parts-count π_T model among the bundled
    // public-domain families. NSWC-11 handles stress via part-specific multipliers in the
    // handbook tables. Public Domain handbook values are taken as-published.
    const usesPiT = projectConfig.useStressPrediction && family === 'MIL-HDBK-217F';
    const piT = usesPiT ? computePiT(projectConfig.operatingTempC, projectConfig.activationEnergyEv) : 1.0;
    // Use the env/quality from the project's selected standard regardless of entry source — this lets
    // a user pick MIL conventions for the whole project even if some entries come from FIDES tables.
    const piE = _projectPiE();
    const piQ = _projectPiQ();
    return entry.lambda * piT * piQ * piE;
}

// Populate the env + quality select dropdowns based on the current standard family.
function _populateLibStandardDropdowns() {
    _ensureLibPredictionDefaults();
    const stdSel = document.getElementById('lib-standard');
    const envSel = document.getElementById('lib-env');
    const qualSel = document.getElementById('lib-quality');
    if (stdSel) stdSel.value = projectConfig.libraryStandard;
    const envTbl = STANDARD_ENVIRONMENTS[projectConfig.libraryStandard] || {};
    const qualTbl = STANDARD_QUALITIES[projectConfig.libraryStandard] || {};
    if (envSel) {
        envSel.innerHTML = Object.entries(envTbl).map(([k, v]) =>
            `<option value="${esc(k)}">${esc(v.label)} — π_E ${v.piE}</option>`).join('');
        // If current value isn't in this standard, pick first.
        if (!envTbl[projectConfig.libraryEnv]) projectConfig.libraryEnv = Object.keys(envTbl)[0] || '';
        envSel.value = projectConfig.libraryEnv;
    }
    if (qualSel) {
        qualSel.innerHTML = Object.entries(qualTbl).map(([k, v]) =>
            `<option value="${esc(k)}">${esc(v.label)} — π_Q ${v.piQ}</option>`).join('');
        if (!qualTbl[projectConfig.libraryQuality]) projectConfig.libraryQuality = Object.keys(qualTbl)[0] || '';
        qualSel.value = projectConfig.libraryQuality;
    }
    const stressEl = document.getElementById('lib-stress-toggle');
    if (stressEl) stressEl.checked = !!projectConfig.useStressPrediction;
    const tjEl = document.getElementById('lib-tj'); if (tjEl) tjEl.value = projectConfig.operatingTempC;
    const eaEl = document.getElementById('lib-ea'); if (eaEl) eaEl.value = projectConfig.activationEnergyEv;
}

// Build / refresh the summary pill that shows the active factors.
function _refreshLibPiSummary() {
    const el = document.getElementById('lib-pi-summary');
    if (!el) return;
    _ensureLibPredictionDefaults();
    const piE = _projectPiE();
    const piQ = _projectPiQ();
    const piT = projectConfig.useStressPrediction ? computePiT(projectConfig.operatingTempC, projectConfig.activationEnergyEv) : null;
    const product = piE * piQ * (piT == null ? 1 : piT);
    const piTtxt = piT == null ? '<span class="u-muted">π_T off</span>' : `π_T = ${piT.toFixed(3)}`;
    el.innerHTML = `Effective multiplier (electronic sources): π_E = ${piE} &nbsp;·&nbsp; π_Q = ${piQ} &nbsp;·&nbsp; ${piTtxt} &nbsp;⇒&nbsp; <strong style="color: var(--color-accent);">λ_eff / λ_base = ${product.toExponential(3)}</strong>`;
}

// Populate the group / source / category filter dropdowns from the active library.
function _populateLibFilterDropdowns() {
    const active = getActiveLibrary();
    const groups = new Set(), sources = new Set(), cats = new Set();
    Object.values(active).forEach(d => {
        if (d.group) groups.add(d.group);
        if (d.source) sources.add(d.source);
        if (d.category) cats.add(d.category);
    });
    const fill = (id, set, currentVal, label) => {
        const el = document.getElementById(id);
        if (!el) return;
        const opts = ['<option value="">' + label + '</option>'].concat(Array.from(set).sort().map(v => `<option value="${esc(v)}">${esc(v)}</option>`));
        el.innerHTML = opts.join('');
        if (currentVal && set.has(currentVal)) el.value = currentVal;
    };
    fill('lib-group-filter', groups, _libFilterState.group, 'All groups');
    fill('lib-source-filter', sources, _libFilterState.source, 'All sources');
    fill('lib-category-filter', cats, _libFilterState.category, 'All categories');
    const searchEl = document.getElementById('lib-search');
    if (searchEl && _libFilterState.search) searchEl.value = _libFilterState.search;
}

// Phase 56.x (#5) — basic events (across all FTA pages) sourced from a library key.
function _basicEventsUsingLibraryKey(key) {
    const out = [];
    if (!key) return out;
    ftaPages.forEach(page => {
        (function walk(n){
            if (!n) return;
            if (n.type === 'basic' && n.libraryKey === key) out.push(n);
            const kids = n.children || n._children;
            if (kids) kids.forEach(walk);
        })(page.root);
    });
    return out;
}

function renderLibraryTable() {
    const tbody = document.getElementById('lib-table-body');
    if (!tbody) return;
    _populateLibStandardDropdowns();
    _populateLibFilterDropdowns();
    _refreshLibPiSummary();

    const active = getActiveLibrary();
    // Phase 56.x (#5) — precompute how many basic events reference each library key.
    const libUsageCount = {};
    ftaPages.forEach(page => { (function walk(n){ if(!n) return; if(n.type==='basic' && n.libraryKey){ libUsageCount[n.libraryKey]=(libUsageCount[n.libraryKey]||0)+1; } const kids=n.children||n._children; if(kids) kids.forEach(walk); })(page.root); });
    const search = (_libFilterState.search || '').toLowerCase();
    const grp = _libFilterState.group, src = _libFilterState.source, cat = _libFilterState.category;
    // Phase 53.57/58 — only MIL-HDBK-217F carries a parts-count π_T model in the bundled data.
    const electronicFamilies = { 'MIL-HDBK-217F':1 };

    let total = 0, shown = 0;
    const rows = [];
    Object.entries(active).forEach(([key, def]) => {
        total++;
        if (grp && def.group !== grp) return;
        if (src && def.source !== src) return;
        if (cat && def.category !== cat) return;
        if (search) {
            const hay = (key + ' ' + (def.name||'') + ' ' + (def.source||'') + ' ' + (def.group||'') + ' ' + (def.category||'')).toLowerCase();
            if (hay.indexOf(search) < 0) return;
        }
        shown++;
        const isCustom = !isBuiltinLibraryEntry(key);
        const isOverride = !isCustom && projectConfig.customLibrary && projectConfig.customLibrary[key];
        let status = '<span class="u-muted-small">built-in</span>';
        let action = '';
        if (isCustom) {
            status = '<span style="color: var(--color-success); font-weight: 600; font-size: 11px;">custom</span>';
            action = `<button class="action-btn btn-red" onclick="deleteLibraryEntry('${esc(key)}')">Delete</button>`;
        } else if (isOverride) {
            status = '<span style="color: var(--color-warning); font-weight: 600; font-size: 11px;">override</span>';
            action = `<button class="action-btn btn-cyan" onclick="revertLibraryEntry('${esc(key)}')">Revert</button>`;
        }
        const eff = effectiveLambdaForLibraryEntry(def);
        const ratio = (def.lambda > 0) ? (eff / def.lambda) : 1;
        const family = _sourceFamily(def.source || '');
        const piTApplied = projectConfig.useStressPrediction && electronicFamilies[family];
        const effDisplay = (def.lambda > 0)
            ? `<span style="font-family: var(--font-mono); font-size: 12px;">${eff.toExponential(2)}</span>` +
              (Math.abs(ratio - 1) > 0.01 ? ` <span style="color: var(--color-text-tertiary); font-size: 10px;">×${ratio.toFixed(2)}${piTApplied ? '*' : ''}</span>` : '')
            : '<span class="u-muted">—</span>';
        rows.push(`<tr>
            <td><code class="u-text-xs">${esc(key)}</code></td>
            <td>${esc(def.name)}</td>
            <td><span style="font-size: 12px; color: var(--color-text-secondary);">${esc(def.group||'')}</span></td>
            <td><span class="u-text-sm">${esc(def.category||'')}</span></td>
            <td><input type="number" step="any" min="0" value="${def.lambda}" onchange="onLibraryLambdaChange('${esc(key)}', this.value)" style="width: 130px; margin: 0; font-family: var(--font-mono); font-size: 12px;"></td>
            <td>${effDisplay}</td>
            <td><span class="u-muted-small">${esc(def.source||'')}</span></td>
            <td>${status} ${action}${(libUsageCount[key] >= 2) ? ` <button class="action-btn btn-amber" onclick="createCcfGroupFromLibrary('${esc(key)}')" title="${libUsageCount[key]} basic events share this entry — create a β-factor CCF group">CCF group (${libUsageCount[key]})</button>` : ''}</td>
        </tr>`);
    });
    // ENG-2 phase 1c — the component library ships with hundreds of entries;
    // paginated via the shared pager. Filters above run over the FULL library.
    if (typeof SLPaginate !== 'undefined' && SLPaginate.pageTbody) {
        SLPaginate.pageTbody({ key: 'library', tbody, rows, rowHtml: r => r,
            label: (f, t, n) => 'entries ' + f + '–' + t + ' of ' + n + ' shown (of ' + total.toLocaleString() + ' in the library) — filters run over the full set' });
    } else {
        tbody.innerHTML = rows.join('');
    }
    const counter = document.getElementById('lib-count');
    if (counter) counter.textContent = `(${shown.toLocaleString()} of ${total.toLocaleString()})`;
}

function onLibStandardChange() {
    const stdSel = document.getElementById('lib-standard');
    const v = stdSel.value;
    // Pro-gate licensed standards.
    if (PRO_LICENSED_STANDARDS.has(v)) {
        if (typeof isProLicensed === 'function' && !isProLicensed()) {
            openProUpgradeModal(v);
            // Revert the select back to the previously valid standard.
            stdSel.value = projectConfig.libraryStandard || 'MIL-HDBK-217F';
            return;
        }
        // Pro user — confirm they've loaded their own CSV; if not, surface the BYOL prompt.
        const hasImported = !!(projectConfig.customLibrary && Object.values(projectConfig.customLibrary).some(e => {
            return e && e.source && (
                e.source.indexOf(v) === 0 ||
                (v === '217Plus 2015' && e.source.indexOf('217Plus') === 0) ||
                (v === 'Siemens SN 29500' && (e.source.indexOf('SN 29500') === 0 || e.source.indexOf('Siemens') === 0))
            );
        }));
        if (!hasImported) {
            showToast('Pro · BYOL: No ' + v + ' entries detected. Use Library → Import CSV to load your licensed data first.', 'warning', 6000);
        }
    }
    projectConfig.libraryStandard = v;
    // Reset env + quality to the new standard's defaults (first key in each table).
    const envTbl = STANDARD_ENVIRONMENTS[v] || {};
    const qualTbl = STANDARD_QUALITIES[v] || {};
    if (!envTbl[projectConfig.libraryEnv]) projectConfig.libraryEnv = Object.keys(envTbl)[0] || '';
    if (!qualTbl[projectConfig.libraryQuality]) projectConfig.libraryQuality = Object.keys(qualTbl)[0] || '';
    refreshLibraryDependentNodes();
    renderLibraryTable();
}

// Phase 53.59 — Pro upgrade modal handlers.
function openProUpgradeModal(standardName) {
    const m = document.getElementById('pro-upgrade-modal');
    if (!m) return;
    const lab1 = document.getElementById('pro-upgrade-standard');
    const lab2 = document.getElementById('pro-upgrade-standard-2');
    if (lab1) lab1.textContent = standardName || 'Licensed';
    if (lab2) lab2.textContent = standardName || 'this standard';
    m.style.display = 'flex';
    setTimeout(() => m.classList.add('show'), 10);
}
function closeProUpgradeModal() {
    const m = document.getElementById('pro-upgrade-modal');
    if (!m) return;
    m.classList.remove('show');
    setTimeout(() => m.style.display = 'none', 220);
}
function openProSignup() {
    // Phase 53.74 — Route to the unified signup modal instead of a one-off toast.
    closeProUpgradeModal();
    openSignupModal();
}

function _initSupabaseClient() {
    if (_supabaseClient) return _supabaseClient;
    // 6 Sep 2026 — never connect if the config surface refused the boot (a
    // customer install that still points at Safety Lab). Belt-and-suspenders to
    // the slab_config guard: no backend contact under a fatal config.
    try { if (typeof window !== 'undefined' && window.__SLAB_CONFIG_FATAL__) { console.error('[Safety Lab Aero] backend disabled — ' + window.__SLAB_CONFIG_FATAL__); return null; } } catch (_) {}
    try {
        if (typeof window === 'undefined' || !window.supabase || typeof window.supabase.createClient !== 'function') {
            console.warn('[Safety Lab Aero] Supabase SDK not loaded — magic-link auth disabled, falling back to local signup.');
            return null;
        }
        _supabaseClient = window.supabase.createClient(SUPABASE_PROJECT_URL, SUPABASE_PUBLISHABLE_KEY, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
                flowType: 'pkce'
            }
        });
        _supabaseReady = true;
        // Wire the auth state listener — every sign-in / sign-out flows through here.
        _supabaseClient.auth.onAuthStateChange((event, session) => {
            _supabaseSession = session || null;
            try {
                if (event === 'SIGNED_IN' && session && session.user) {
                    _onSupabaseSignedIn(session.user);
                } else if (event === 'SIGNED_OUT') {
                    _onSupabaseSignedOut();
                } else if (event === 'TOKEN_REFRESHED' && session && session.user) {
                    _supabaseSession = session;
                }
            } catch (e) { console.error('[Safety Lab Aero] auth listener error:', e); }
        });
        // Pull the existing session on boot (persisted in localStorage by supabase-js).
        _supabaseClient.auth.getSession().then(({ data }) => {
            if (data && data.session) {
                _supabaseSession = data.session;
                if (data.session.user) {
                    _onSupabaseSignedIn(data.session.user);
                }
            }
        }).catch(() => {}).finally(() => {
            // Phase 57 — mark the boot restore settled shortly after, so the restore-time
            // SIGNED_IN events don't toast. Genuine sign-ins happen later and will toast once.
            setTimeout(() => { _authRestoreComplete = true; }, 1500);
        });
        return _supabaseClient;
    } catch (e) {
        console.error('[Safety Lab Aero] Supabase init failed:', e);
        return null;
    }
}

function _rtEnabled() {
    try {
        if (window.SafetyLabAI && window.SafetyLabAI.realtime === false) return false;
        if (/[?&]realtime=0/.test(location.search)) return false;
        return localStorage.getItem('SLA_REALTIME') !== '0';
    } catch (_) { return true; }
}
// Pure: reduce a Supabase presenceState() object → deduped, name-sorted user list. (Testable.)
function _rtPresenceUsers(state) {
    const seen = {}, out = [];
    Object.keys(state || {}).forEach(function (key) {
        (state[key] || []).forEach(function (m) {
            const id = String((m && (m.userId || m.email || m.name)) || key);
            if (seen[id]) return; seen[id] = 1;
            out.push({ id: id, name: String((m && m.name) || (m && m.email) || 'Someone'), at: (m && m.at) || 0 });
        });
    });
    out.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    return out;
}
function _rtRenderPresence(users) {
    let el = document.getElementById('rt-presence');
    if (!users || users.length <= 1) { if (el) el.remove(); return; }   // only show when someone else is here
    if (!el) {
        el = document.createElement('div'); el.id = 'rt-presence';
        el.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:99990;background:#0a1f44;color:#fff;border-radius:20px;padding:6px 12px;font:600 12px system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25);';
        document.body.appendChild(el);
    }
    el.textContent = '👥 ' + users.length + ' online';
    el.title = 'In this workspace now: ' + users.map(function (u) { return u.name; }).join(', ');
}
async function startRealtimePresence() {
    if (!_rtEnabled()) return;
    try { if (typeof projectConfig !== 'undefined' && projectConfig && projectConfig.isITARControlled) { await stopRealtimePresence(); return; } } catch (_) {}   // ITAR / air-gap: NEVER open a realtime cloud connection for an ITAR-controlled project
    let client, wsId, session;
    try { client = (typeof window.getSupabaseClient === 'function') && window.getSupabaseClient(); } catch (_) {}
    try { wsId = getActiveWorkspaceId(); } catch (_) {}
    try { session = (typeof window.getSupabaseSession === 'function') && window.getSupabaseSession(); } catch (_) {}
    if (!client || !wsId || !session || !session.user) return;
    await stopRealtimePresence();
    const u = session.user;
    let _curProj = null; try { _curProj = (typeof getActiveCloudProjectId === 'function') ? getActiveCloudProjectId() : null; } catch (_) {}
    const meta = { userId: u.id, name: (u.user_metadata && (u.user_metadata.name || u.user_metadata.full_name)) || u.email || 'Someone', email: u.email || '', projectId: _curProj || null, at: Date.now() };
    try {
        _rtChannel = client.channel('slab-presence:' + wsId, { config: { presence: { key: u.id }, broadcast: { self: false } } });
        _rtChannel.on('presence', { event: 'sync' }, function () { try { const st = _rtChannel.presenceState(); _rtRenderPresence(_rtPresenceUsers(st)); _rtRenderSoftLock(_rtProjectPeers(st, u.id)); } catch (_) {} });
        _rtChannel.on('broadcast', { event: 'comment' }, function (msg) { try { _rtApplyRemoteComment(msg && msg.payload); } catch (_) {} });   // #27 part 2: live comment sync
        _rtChannel.subscribe(function (status) { if (status === 'SUBSCRIBED') { try { _rtChannel.track(meta); } catch (_) {} } });
    } catch (e) { try { console.warn('Realtime presence failed:', e); } catch (_) {} }
}
async function stopRealtimePresence() {
    const ch = _rtChannel; _rtChannel = null;
    if (ch) { try { await ch.unsubscribe(); } catch (_) {} }
    const el = document.getElementById('rt-presence'); if (el) el.remove();
    const sl = document.getElementById('rt-softlock'); if (sl) sl.remove();
}
// --- Phase 0 soft-lock: who else has THIS cloud project open right now -----------------
// Pure: from a Supabase presenceState(), return the OTHER users (not me) whose tracked
// projectId equals the cloud project I currently have open. Empty when I have no cloud
// project open, or when I'm the only one in it. (Testable — no DOM, no globals beyond
// the active-project getter.)
function _rtProjectPeers(state, myUserId) {
    let myProj = null;
    try { myProj = (typeof getActiveCloudProjectId === 'function') ? getActiveCloudProjectId() : null; } catch (_) {}
    if (!myProj) return [];
    const seen = {}, peers = [];
    Object.keys(state || {}).forEach(function (key) {
        (state[key] || []).forEach(function (m) {
            if (!m || m.projectId !== myProj) return;
            const id = String(m.userId || m.email || key);
            if (id === String(myUserId)) return;     // that's me
            if (seen[id]) return; seen[id] = 1;
            peers.push({ id: id, name: String(m.name || m.email || 'Someone') });
        });
    });
    return peers;
}
// Non-blocking banner: warns that edits persist as whole-project snapshots (last save wins)
// while another collaborator is in the same project — honest about today's model until live
// co-editing (Phase 1, CRDT) ships. Shown only when at least one other user shares my project.
function _rtRenderSoftLock(peers) {
    let el = document.getElementById('rt-softlock');
    if (!peers || !peers.length) { if (el) el.remove(); return; }
    // If live co-authoring (CRDT) is active for this project, edits MERGE — so downgrade the
    // "last save wins" warning to a friendly live-editing indicator.
    let live = false;
    try { live = !!(window.SafetyLabCRDT && window.SafetyLabCRDT.status && window.SafetyLabCRDT.status().started); } catch (_) {}
    if (!el) {
        el = document.createElement('div');
        el.id = 'rt-softlock';
        document.body.appendChild(el);
    }
    el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:2147483600;max-width:580px;border-radius:10px;padding:10px 14px;font-size:13px;line-height:1.45;box-shadow:0 8px 28px rgba(0,0,0,.18);' +
        (live ? 'background:#e8f7ec;color:#0b6b2e;border:1px solid #bfe3c8;' : 'background:#fff6e5;color:#7a4b00;border:1px solid #f0c878;');
    const names = peers.map(function (p) { return p.name; });
    const who = names.length === 1
        ? esc(names[0]) + ' is'
        : esc(names.slice(0, 2).join(', ')) + (names.length > 2 ? ' +' + (names.length - 2) + ' more' : '') + ' are';
    el.innerHTML = live
        ? '👥 <strong>' + who + ' also editing this project.</strong> Changes merge live as you both work.'
        : '⚠️ <strong>' + who + ' also in this project.</strong> Edits save as whole-project snapshots — <strong>the last save wins</strong>. Coordinate before saving; live co-editing is coming.';
}
// Re-publish my presence with the cloud project I now have open (called when the active
// cloud project changes), so every other client's soft-lock recomputes against it.
function _rtUpdatePresenceProject() {
    try {
        if (!_rtChannel) return;
        const session = (typeof window.getSupabaseSession === 'function') && window.getSupabaseSession();
        if (!session || !session.user) return;
        const u = session.user;
        let proj = null; try { proj = (typeof getActiveCloudProjectId === 'function') ? getActiveCloudProjectId() : null; } catch (_) {}
        const meta = { userId: u.id, name: (u.user_metadata && (u.user_metadata.name || u.user_metadata.full_name)) || u.email || 'Someone', email: u.email || '', projectId: proj || null, at: Date.now() };
        _rtChannel.track(meta);
    } catch (_) {}
}

function _rtMergeComment(list, payload, myTok) {
    if (!payload) return { list: list, target: null, op: null };
    if (payload.tok && payload.tok === myTok) return { list: list, target: null, op: 'self' };
    if (payload.op === 'delete' && payload.commentId) {
        const doomed = new Set([payload.commentId]); let grew = true;
        while (grew) { grew = false; list.forEach(function (c) { if (c.parentId && doomed.has(c.parentId) && !doomed.has(c.commentId)) { doomed.add(c.commentId); grew = true; } }); }
        const removed = list.filter(function (c) { return doomed.has(c.commentId); });
        if (!removed.length) return { list: list, target: null, op: null };
        return { list: list.filter(function (c) { return !doomed.has(c.commentId); }), target: removed[0].target, op: 'delete' };
    }
    if (payload.c && payload.c.commentId) {
        const idx = list.findIndex(function (x) { return x.commentId === payload.c.commentId; });
        if (idx >= 0) { const copy = list.slice(); copy[idx] = payload.c; return { list: copy, target: payload.c.target, op: 'update' }; }
        return { list: list.concat([payload.c]), target: payload.c.target, op: 'add' };
    }
    return { list: list, target: null, op: null };
}
function _rtRefreshCommentsUI(target) {
    try { if (typeof renderReviewPanelBody === 'function') renderReviewPanelBody(); } catch (_) {}
    try { if (target && typeof _refreshCommentTriggersFor === 'function') _refreshCommentTriggersFor(target); } catch (_) {}
    try { if (typeof _refreshReviewSummaryIfOpen === 'function') _refreshReviewSummaryIfOpen(); } catch (_) {}
}
function _rtApplyRemoteComment(payload) {
    try {
        if (typeof reviewCommentsData === 'undefined') return;
        const res = _rtMergeComment(reviewCommentsData, payload, _rtClientToken);
        if (!res.op || res.op === 'self') return;
        reviewCommentsData = res.list;
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        _rtRefreshCommentsUI(res.target);
        if (res.op === 'add' && payload.c) { try { showToast('💬 ' + (payload.c.authorName || 'Someone') + ' commented', 'info', 4000); } catch (_) {} }
    } catch (e) { try { console.warn('Remote comment apply failed:', e); } catch (_) {} }
}
function _rtBroadcastComment(op, data) {
    try {
        if (!_rtChannel || !_rtEnabled()) return;
        if (typeof projectConfig !== 'undefined' && projectConfig && projectConfig.isITARControlled) return;   // defense-in-depth: never egress ITAR-controlled content
        _rtChannel.send({ type: 'broadcast', event: 'comment', payload: Object.assign({ op: op, tok: _rtClientToken }, data) });
    } catch (_) {}
}

function _onSupabaseSignedIn(user) {
    try {
        const email = (user && user.email) ? String(user.email).toLowerCase() : '';
        if (!email) return;
        // Persist identity into our existing local helpers so refreshSigninChip(),
        // getEffectiveTier(), and friends pick up the signed-in state.
        if (typeof setSignupEmail === 'function') setSignupEmail(email);
        // Provisional tier from the email class (instant, no round-trip). The authoritative
        // tier comes from the license_tokens.plan lookup below and overrides this.
        if (typeof isCompedEmail === 'function' && isCompedEmail(email)) {
            if (typeof setLicenseTier === 'function') setLicenseTier('pro-plus');
        } else if (typeof isEduEmail === 'function' && isEduEmail(email)) {
            if (typeof setLicenseTier === 'function') setLicenseTier('edu');
        } else {
            // Phase 57 — do NOT grant pro-plus provisionally. The authoritative sync
            // below sets the real tier (or paywalls). Never silently hand a paid tier.
        }
        // End any in-flight trial; signed-in users get their actual tier.
        if (typeof endTrial === 'function') endTrial();
        // Refresh visible UI bits.
        if (typeof refreshSigninChip === 'function') refreshSigninChip();
        if (typeof updateDashboard === 'function') updateDashboard();
        // Authoritative tier: the signed-in user's license_tokens.plan ('enterprise' or
        // 'pro-plus') is the source of truth — it overrides the provisional guess above so
        // an enterprise/owner account is never silently pinned to pro-plus. RLS returns only
        // this user's row. Runs async so it never blocks the sign-in path; refreshes the
        // chip + AI allowance once the real tier lands.
        (function _syncEntitlementFromServer() {
            try {
                if (!_supabaseClient) return;   // not booted -> fail OPEN (no paywall)
                // 6 Sep 2026 — on a customer install the signed license decides tier and
                // paywall; the cloud's license_tokens/users rows are NOT consulted for it
                // (the customer's database is theirs; licensing never calls home).
                if (_signedLicenseAuthority().authoritative) return;
                Promise.all([
                    _supabaseClient.from('license_tokens').select('plan,expires_at').limit(1).maybeSingle(),
                    _supabaseClient.from('users').select('tier,trial_ends_at').limit(1).maybeSingle()
                ]).then(function (r) {
                    const lic = r[0] && r[0].data;
                    const usr = r[1] && r[1].data;
                    const nowMs = Date.now();
                    const activeLicense = !!(lic && lic.plan && !(lic.expires_at && new Date(lic.expires_at).getTime() <= nowMs));
                    const comped   = (typeof isCompedEmail === 'function') && isCompedEmail(email);
                    const academic = (typeof isEduEmail === 'function') && isEduEmail(email);
                    const trialEndsAt = (usr && usr.trial_ends_at) ? new Date(usr.trial_ends_at).getTime() : null;
                    const onTrial = (trialEndsAt != null) && (trialEndsAt > nowMs);
                    const verdict = (typeof _slEntitlementVerdict === 'function')
                        ? _slEntitlementVerdict({ activeLicense: activeLicense, licensePlan: (lic && lic.plan) || null, comped: comped, academic: academic, onTrial: onTrial })
                        : { paywalled: false, tier: null };
                    if (verdict.paywalled) {
                        if (typeof endTrial === 'function') endTrial();
                    } else {
                        if (verdict.tier && typeof setLicenseTier === 'function') setLicenseTier(String(verdict.tier));
                        if (onTrial && !activeLicense && !comped && !academic) {
                            try {
                                localStorage.setItem('safetyLab.license.trialStartedAt', String(trialEndsAt - TRIAL_DURATION_MS));
                                localStorage.setItem('safetyLab.license.trialTarget', 'pro');
                            } catch(_) {}
                        } else if (typeof endTrial === 'function') { endTrial(); }
                    }
                    try { localStorage.setItem('safetyLab.server.paywalled', verdict.paywalled ? '1' : '0'); } catch(_) {}
                    if (typeof refreshSigninChip === 'function') refreshSigninChip();
                    if (typeof _refreshAiAllowance === 'function') _refreshAiAllowance();
                    try { if (window.SafetyLab && typeof window.SafetyLab._recheckPaywall === 'function') window.SafetyLab._recheckPaywall(); } catch(_) {}
                }).catch(function () { /* offline / RLS / error -> fail OPEN, no paywall this session */ });
            } catch (_) { /* fail open */ }
        })();
        // Close the signup modal if it's still open (post magic-link redirect / post code-verify).
        try { _signupAwaitingCode = null; } catch (_) {}
        const m = document.getElementById('signup-modal');
        if (m && m.style.display !== 'none') {
            try { closeSignupModal(); } catch (_) {}
        }
        // Phase 57 — only toast for a real interactive sign-in (after the boot restore has
        // settled), and only once per page load. Silent session restores on refresh no longer
        // spam the screen with stacked "Signed in as…" toasts.
        if (typeof showToast === 'function' && _authRestoreComplete && !_signInToastShown) {
            _signInToastShown = true;
            showToast('Signed in as ' + email + '.', 'success', 4200);
        }
        // Phase 55.0.4 — kick off workspace fetch + chip render now that we have a session.
        if (typeof refreshWorkspaceChip === 'function') {
            refreshWorkspaceChip().catch(() => {});
        }
        // 31 Aug 2026 — the sign-in-then-accept path. An invitee following an
        // invitation link almost never has a session yet: the token is parked in
        // sessionStorage by _consumeInviteFromUrl() and redeemed HERE, once there
        // is somebody to join the workspace as. Non-fatal by construction — a
        // failed redemption must never break sign-in itself.
        try { if (typeof _redeemPendingInvite === 'function') _redeemPendingInvite().catch(() => {}); } catch (_) {}
        // 6 Sep 2026 (desktop parity) — an "open this project" request that arrived
        // before sign-in (a ?project= link on the web, a safetylab:// link on the
        // desktop) is honored now that there is somebody to open it as.
        try { _consumePendingProjectLink(); } catch (_) {}
    } catch (e) {
        console.error('[Safety Lab Aero] onSignedIn handler error:', e);
    }
}

// ---- Open-in links (6 Sep 2026, "works like Office") ------------------------------
// ONE function opens a cloud project by id from either direction:
//   · web:     https://<web app>/app?project=<id>          (from the desktop's "Open in web")
//   · desktop: safetylab://open?project=<id>&backend=<host> (from the web's "Open in desktop")
// The id is a project row in the backend BOTH windows share; RLS decides whether this
// account may read it. If nobody is signed in yet the request waits for sign-in.
let _slabPendingProjectId = '';
function _isProjectId(v) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || '')); }
function openCloudProjectById(projectId) {
    if (!_isProjectId(projectId)) { try { showToast('That link does not name a project.', 'warning', 4000); } catch (_) {} return false; }
    _slabPendingProjectId = String(projectId).toLowerCase();
    return _consumePendingProjectLink();
}
function _consumePendingProjectLink() {
    if (!_slabPendingProjectId) _consumeProjectLinkFromUrl();
    const id = _slabPendingProjectId; if (!id) return false;
    const signedIn = (typeof isSupabaseSignedIn === 'function') && isSupabaseSignedIn();
    if (!signedIn) return false;                       // stays pending; _onSupabaseSignedIn retries
    _slabPendingProjectId = '';
    try { if (typeof _loadCloudProject === 'function') { _loadCloudProject(id); return true; } } catch (e) { try { console.warn('[open-in] ' + e); } catch (_) {} }
    return false;
}
// The web's ?project= parameter (read once at boot; removed from the address bar so a
// reload does not silently replace whatever the engineer opened since).
let _slabProjectLinkRead = false;
function _consumeProjectLinkFromUrl() {
    if (_slabProjectLinkRead) return; _slabProjectLinkRead = true;
    try {
        if (typeof location === 'undefined' || location.protocol === 'file:') return;   // desktop links arrive via safetylab://
        const qs = new URLSearchParams(location.search || '');
        const id = qs.get('project'); if (!id) return;
        if (_isProjectId(id)) _slabPendingProjectId = id.toLowerCase();
        qs.delete('project');
        const rest = qs.toString();
        history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + (location.hash || ''));
    } catch (_) {}
}
// Links for the account panel. Desktop link carries the backend host so the desktop can
// refuse a link meant for a different install; the web link is the install's own address.
function openInDesktopLink() {
    try {
        const id = (typeof _activeCloudProjectId !== 'undefined') ? _activeCloudProjectId : null; if (!id) return '';
        const cfg = window.SLConfig || {}; let hostName = ''; try { hostName = new URL(cfg.supabaseUrl || '').host; } catch (_) {}
        return 'safetylab://open?project=' + encodeURIComponent(id) + (hostName ? '&backend=' + encodeURIComponent(hostName) : '');
    } catch (_) { return ''; }
}
function openInWebLink() {
    try {
        const id = (typeof _activeCloudProjectId !== 'undefined') ? _activeCloudProjectId : null; if (!id) return '';
        const base = (window.SLConfig && window.SLConfig.webAppUrl) || ''; if (!base) return '';
        return base.replace(/\/+$/, '') + '?project=' + encodeURIComponent(id);
    } catch (_) { return ''; }
}
try { if (typeof window !== 'undefined') { window.openCloudProjectById = openCloudProjectById; window.__slabOpenCloudProject = openCloudProjectById; window.openInDesktopLink = openInDesktopLink; window.openInWebLink = openInWebLink; } } catch (_) {}

function _onSupabaseSignedOut() {
    try {
        // Clear local identity state but keep license tier defaults intact.
        if (typeof setSignupEmail === 'function') setSignupEmail('');
        _supabaseSession = null;
        _signInToastShown = false;   // Phase 57 — allow the toast again on the next real sign-in

        if (typeof refreshSigninChip === 'function') refreshSigninChip();
        // Phase 55.0.4 — clear workspace state on sign-out.
        try { setActiveWorkspaceId(null); } catch (_) {}
        try { _workspaces = []; } catch (_) {}
        if (typeof refreshWorkspaceChip === 'function') refreshWorkspaceChip();
        if (typeof showToast === 'function') showToast('Signed out.', 'info', 3000);
    } catch (e) { console.error('[Safety Lab Aero] onSignedOut handler error:', e); }
}

// True when the SPA runs inside the Electron desktop shell (or any file:// load).
// Its ONE remaining job: the desktop cannot complete a magic-LINK redirect (email clients
// won't open file:// URLs), so an emailed sign-in uses the 6-digit CODE instead of a link.
// Identity, licensing and the paywall no longer branch on it — the signed license and the
// shared auth gate decide those on every platform (6 Sep 2026).
function _isDesktopAuth() {
    try {
        if (window.slabDesktop && window.slabDesktop.isDesktop) return true;
        if (window.__SLAB_DESKTOP__) return true;
        if (typeof location !== 'undefined' && location.protocol === 'file:') return true;
    } catch (_) {}
    return false;
}

function openSignupModal() {
    const m = document.getElementById('signup-modal');
    if (!m) return;
    // Reset any prior desktop code-entry state so a re-open always starts clean.
    _signupAwaitingCode = null;
    const introEl   = document.getElementById('signup-intro');
    const codeField = document.getElementById('signup-code-field');
    const submitBtn = document.getElementById('signup-submit-btn');
    if (codeField) codeField.style.display = 'none';
    if (submitBtn) { submitBtn.textContent = 'Continue'; submitBtn.disabled = false; }
    // Pre-fill from any prior signup state so a returning user sees their info.
    const emailEl = document.getElementById('signup-email');
    const nameEl  = document.getElementById('signup-name');
    const orgEl   = document.getElementById('signup-org');
    if (emailEl) { emailEl.removeAttribute('readonly'); emailEl.value = getSignupEmail() || ''; }
    if (nameEl)  nameEl.value  = getSignupName()  || '';
    if (orgEl)   orgEl.value   = getSignupOrg()   || '';
    m.style.display = 'flex';
    setTimeout(() => m.classList.add('show'), 10);
    // Trigger detection so a pre-filled email immediately shows the right banner.
    onSignupEmailChange();
    // Focus email on open for keyboard-first flow.
    setTimeout(() => { try { if (emailEl) emailEl.focus(); } catch(_) {} }, 60);
}
// Sign-in entry from the chip / signed-out prompts. (6 Sep 2026: the desktop "Connect to
// workspace" model — a local app that optionally attached to an account — is GONE. The
// desktop now signs in at the same gate as the web, before the app opens, so there is
// nothing desktop-specific left here.)
function connectWorkspace() {
    try {
        if (typeof isSupabaseSignedIn === 'function' && isSupabaseSignedIn()) {
            if (typeof showToast === 'function') showToast('Already signed in.', 'info', 3000);
            if (typeof refreshWorkspaceChip === 'function') refreshWorkspaceChip();
            return;
        }
    } catch (_) {}
    openSignupModal();
}

function onSignupEmailChange() {
    const emailEl = document.getElementById('signup-email');
    const banner  = document.getElementById('signup-detect-banner');
    const picker  = document.getElementById('signup-tier-picker');
    const btn     = document.getElementById('signup-submit-btn');
    if (!emailEl) return;
    const email = (emailEl.value || '').trim().toLowerCase();
    // Empty / invalid → reset.
    const looksLikeEmail = /@[\w.-]+\.[a-z]{2,}$/i.test(email);
    if (!looksLikeEmail) {
        if (banner) { banner.style.display = 'none'; banner.className = 'signup-detect-banner'; banner.innerHTML = ''; }
        if (picker) picker.style.display = 'none';
        if (btn) btn.textContent = 'Continue';
        return;
    }
    if (isCompedEmail(email)) {
        // Comped partner domain — clean sign-in, no tier or pricing language surfaced.
        if (banner) {
            banner.className = 'signup-detect-banner signup-detect-comped';
            banner.style.display = 'block';
            banner.innerHTML = '<strong>✓ Welcome.</strong> ' + _authSendBlurb();
        }
        if (picker) picker.style.display = 'none';
        if (btn) btn.textContent = _authSendLabel();
        return;
    }
    if (isEduEmail(email)) {
        // Academic domain — clean sign-in, no tier or pricing language surfaced.
        if (banner) {
            banner.className = 'signup-detect-banner signup-detect-edu';
            banner.style.display = 'block';
            banner.innerHTML = '<strong>✓ Academic account.</strong> ' + _authSendBlurb();
        }
        if (picker) picker.style.display = 'none';
        if (btn) btn.textContent = _authSendLabel();
        return;
    }
    // Generic commercial domain — show the tier picker.
    if (banner) { banner.style.display = 'none'; banner.className = 'signup-detect-banner'; banner.innerHTML = ''; }
    if (picker) picker.style.display = 'block';
    if (btn) btn.textContent = 'Continue';
}

async function submitSignup() {
    // Desktop OTP second step: once a code has been emailed, this same button verifies it.
    if (_signupAwaitingCode) return _submitSignupVerifyCode();
    const emailEl = document.getElementById('signup-email');
    const nameEl  = document.getElementById('signup-name');
    const orgEl   = document.getElementById('signup-org');
    const email = ((emailEl && emailEl.value) || '').trim().toLowerCase();
    const name  = ((nameEl  && nameEl.value)  || '').trim();
    const org   = ((orgEl   && orgEl.value)   || '').trim();
    if (!email || !/@[\w.-]+\.[a-z]{2,}$/i.test(email)) {
        if (emailEl) { try { emailEl.focus(); } catch(_) {} }
        if (typeof showToast === 'function') showToast('Please enter a valid email address.', 'warning', 3500);
        else alert('Please enter a valid email address.');
        return;
    }
    // Cache identity locally regardless of which path we take — the chip needs it.
    setSignupName(name);
    setSignupOrg(org);

    // Phase 55.0.3 — try real Supabase magic-link auth first. Falls back to
    // legacy local-only signup if the SDK isn't loaded or the call errors.
    const submitBtn = document.getElementById('signup-submit-btn');
    const initialBtnText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending code…'; }

    const client = _initSupabaseClient();
    if (client) {
        try {
            await sendMagicLink(email);
            // Unified flow: BOTH web and desktop go to the same code-or-link entry step. (On web
            // the emailed link is also clickable — detectSessionInUrl signs them in and
            // onAuthStateChange closes the modal — but the presented step is identical to desktop.)
            _showSignupEnterCodeState(email);
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = _signupAwaitingCode ? 'Verify code' : initialBtnText; }
            return;
        } catch (e) {
            console.error('[Safety Lab Aero] sendMagicLink failed:', e);
            // Hard fail (rate-limited, bad email rejected by Supabase, etc.) — toast
            // and let the user retry. Don't fall through to local-only since the
            // session won't actually be authenticated.
            if (typeof showToast === 'function') {
                const msg = (e && e.message) ? e.message : 'Magic-link send failed';
                showToast('Sign-in failed: ' + msg, 'warning', 6000);
            } else {
                alert('Sign-in failed: ' + ((e && e.message) || 'unknown error'));
            }
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = initialBtnText; }
            return;
        }
    }

    // Fallback: Supabase SDK didn't load (offline, blocked CDN, beta mode). Use
    // the original localStorage-only signup so the Electra demo never hard-fails.
    setSignupEmail(email);
    try { endTrial(); } catch(_) {}
    let landed = '';
    if (isCompedEmail(email)) {
        setLicenseTier('pro-plus');
        landed = 'welcome aboard';
    } else if (isEduEmail(email)) {
        setLicenseTier('edu');
        landed = 'academic account';
    } else {
        let choice = 'trial';
        try {
            const picked = document.querySelector('input[name="signup-tier"]:checked');
            if (picked && picked.value) choice = picked.value;
        } catch(_) {}
        if (choice === 'pro' || choice === 'pro-plus') {
            setLicenseTier(choice);
            landed = (choice === 'pro' ? 'Pro' : 'Pro+') + ' (offline — paid plans unlock locally)';
        } else {
            setLicenseTier('pro-plus');
            startTrial('pro-plus');
            landed = '10-day free trial toward Pro+';
        }
    }
    closeSignupModal();
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = initialBtnText; }
    if (typeof showToast === 'function') {
        showToast('Signed in locally as ' + email + ' — tier: ' + landed + '. (Backend offline; cloud features disabled until reconnect.)', 'success', 6200);
    }
    try { refreshSigninChip(); } catch(_) {}
    try { if (typeof updateDashboard === 'function') updateDashboard(); } catch(_) {}
}

function _showSignupCheckEmailState(email) {
    const intro = document.getElementById('signup-intro');
    const banner = document.getElementById('signup-detect-banner');
    const picker = document.getElementById('signup-tier-picker');
    const submitBtn = document.getElementById('signup-submit-btn');
    if (intro) {
        intro.innerHTML = '<strong>Check your email.</strong> We just sent a magic link to <code>' + esc(email) + '</code>. Click the link in that email to finish signing in. The link is valid for one hour.';
    }
    if (banner) banner.style.display = 'none';
    if (picker) picker.style.display = 'none';
    if (submitBtn) {
        submitBtn.textContent = 'Resend magic link';
        submitBtn.disabled = false;
    }
}

// Desktop OTP: reveal the sign-in code field and switch the primary button to "Verify code".
// The same submitSignup() click now routes to _submitSignupVerifyCode() (see the guard at top).
function _showSignupEnterCodeState(email) {
    _signupAwaitingCode = String(email || '').trim().toLowerCase();
    const intro = document.getElementById('signup-intro');
    const banner = document.getElementById('signup-detect-banner');
    const picker = document.getElementById('signup-tier-picker');
    const codeField = document.getElementById('signup-code-field');
    const codeEl = document.getElementById('signup-code');
    const emailEl = document.getElementById('signup-email');
    const submitBtn = document.getElementById('signup-submit-btn');
    if (intro) {
        intro.innerHTML = '<strong>Check your email.</strong> Enter the code we sent to <code>' + esc(_signupAwaitingCode) + '</code>. No code in the email? Paste the sign-in link instead. Valid for one hour.' +
            '<div style="margin-top:8px;font-size:12.5px;">' +
            '<a href="#" id="signup-resend" style="color:var(--color-link,#0b57d0);">Resend code</a>' +
            ' &nbsp;·&nbsp; ' +
            '<a href="#" id="signup-diff-email" style="color:var(--color-link,#0b57d0);">Use a different email</a>' +
            '</div>';
        const rs = document.getElementById('signup-resend');
        if (rs) rs.onclick = function (e) { e.preventDefault(); _signupResendCode(); };
        const de = document.getElementById('signup-diff-email');
        if (de) de.onclick = function (e) { e.preventDefault(); _signupUseDifferentEmail(); };
    }
    if (banner) banner.style.display = 'none';
    if (picker) picker.style.display = 'none';
    if (emailEl) emailEl.setAttribute('readonly', 'readonly');
    if (codeField) codeField.style.display = '';
    if (codeEl) {
        codeEl.value = '';
        try { codeEl.focus(); } catch (_) {}
        codeEl.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); submitSignup(); } };
    }
    if (submitBtn) { submitBtn.textContent = 'Verify code'; submitBtn.disabled = false; }
}

// Resend the code to the same email (from the code-entry step).
async function _signupResendCode() {
    const email = _signupAwaitingCode; if (!email) return;
    try {
        await sendMagicLink(email);
        if (typeof showToast === 'function') showToast('New code sent to ' + email + '.', 'success', 3500);
    } catch (e) {
        if (typeof showToast === 'function') showToast('Resend failed: ' + ((e && e.message) || 'error'), 'warning', 5000);
    }
}

async function _submitSignupVerifyCode() {
    const codeEl = document.getElementById('signup-code');
    const email = _signupAwaitingCode;
    const raw = ((codeEl && codeEl.value) || '').trim();
    if (!_parseAuthInput(raw)) {
        if (typeof showToast === 'function') showToast('Enter the sign-in code from your email, or paste the sign-in link.', 'warning', 4500);
        else alert('Enter the sign-in code from your email, or paste the sign-in link.');
        if (codeEl) { try { codeEl.focus(); } catch (_) {} }
        return;
    }
    const submitBtn = document.getElementById('signup-submit-btn');
    const prev = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Verifying…'; }
    try {
        await verifyEmailOtp(email, raw);
        _signupAwaitingCode = null;
        // onAuthStateChange handles the rest (close modal, workspace chip, presence, cloud).
    } catch (e) {
        console.error('[Safety Lab Aero] verifyEmailOtp failed:', e);
        const msg = (e && e.message) ? e.message : 'invalid or expired code';
        if (typeof showToast === 'function') showToast('Code verification failed: ' + msg, 'warning', 6000);
        else alert('Code verification failed: ' + msg);
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = prev || 'Verify code'; }
    }
}

// Header chip refresh — shows current sign-in state + tier badge.
function refreshSigninChip() {
    const chip  = document.getElementById('signin-chip');
    const label = document.getElementById('signin-chip-label');
    if (!chip || !label) return;
    let email = getSignupEmail();
    if (!email) {
        chip.className = 'signin-chip';
        label.textContent = 'Sign in';
        chip.title = 'Sign in or sign up';
        chip.onclick = function() { try { connectWorkspace(); } catch (_) { try { openSignupModal(); } catch (__) {} } };
        return;
    }
    const tier = getEffectiveTier();
    const tierLabel = ({
        'edu': 'EDU',
        'pro': 'Pro',
        'pro-plus': 'Pro+',
        'enterprise': 'Enterprise'
    })[tier] || tier;
    let cls = 'signin-chip signin-chip-active';
    if (tier === 'pro-plus' || tier === 'enterprise') cls += ' signin-chip-premium';
    else if (tier === 'pro') cls += ' signin-chip-pro';
    else cls += ' signin-chip-edu';
    chip.className = cls;
    // Short username portion for compactness.
    const short = email.split('@')[0];
    label.textContent = short + ' · ' + tierLabel;
    chip.title = 'Signed in as ' + email + ' (' + tierLabel + ' tier). Click to view your account.';
    // Clicking a signed-in chip opens the Account panel (profile + plan + sign out).
    chip.onclick = function() { try { openAccountPanel(); } catch (_) {} };
}

// Account panel extras (6 Sep 2026): what the signed license says, and the Office-style
// "open this project in the other app" action. Both are empty strings when they do not apply.
function _acctLicenseLine(esc) {
    try {
        const L = window.SLLicense; if (!L || !L.authoritative) return '';
        if (!L.valid) return ' · <span style="color:#b91c1c;">no valid license</span>';
        const who = L.customer ? ' · licensed to ' + esc(L.customer) : '';
        const when = L.trial ? ' · <b style="color:var(--color-text-primary,#111);">Trial</b> · ' + esc(L.daysLeft) + ' days left' : (L.expiresAt ? ' · until ' + esc(String(L.expiresAt).slice(0, 10)) : '');
        return who + when;
    } catch (_) { return ''; }
}
function _acctOpenInRow(esc) {
    try {
        const isDesk = !!(window.SLConfig && window.SLConfig.isDesktop);
        // The web→desktop link is offered only once a desktop build that registers the
        // safetylab:// handler has been released (index.html sets SL_DESKTOP_APP_READY with
        // that release). A link to an app nobody can have yet would be a dead end.
        if (!isDesk && window.SL_DESKTOP_APP_READY !== true) return '';
        const href = isDesk ? openInWebLink() : openInDesktopLink();
        if (!href) return '';
        const label = isDesk ? 'Open this project on the web' : 'Open this project in the desktop app';
        return '<div style="font-size:12px;"><a id="acct-open-in" href="' + esc(href) + '" target="_blank" rel="noopener" style="color:var(--color-accent,#0A63CC);text-decoration:none;font-weight:600;">' + label + ' ↗</a></div>';
    } catch (_) { return ''; }
}
function openAccountPanel() {
    const existing = document.getElementById('account-panel'); if (existing) existing.remove();
    const email = (typeof getSignupEmail === 'function' ? getSignupEmail() : '') || '';
    if (!email) { try { openSignupModal(); } catch (_) {} return; }
    let meta = {};
    try { const s = (typeof getSupabaseSession === 'function') ? getSupabaseSession() : null; meta = (s && s.user && s.user.user_metadata) || {}; } catch (_) {}
    const lsGet = function(k){ try { return localStorage.getItem(k) || ''; } catch(_) { return ''; } };
    const curName = lsGet('safetyLab.signup.name') || meta.full_name || '';
    const curOrg  = lsGet('safetyLab.signup.org')  || meta.org || '';
    const tier = (typeof getEffectiveTier === 'function') ? getEffectiveTier() : '';
    const tierLabel = ({ 'edu':'EDU','pro':'Pro','pro-plus':'Pro+','enterprise':'Enterprise' })[tier] || (tier || '—');
    const esc = function(s){ return String(s==null?'':s).replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); };
    const inputCss = 'display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:9px 11px;border:1px solid var(--color-border-hair,rgba(0,0,0,.15));border-radius:9px;font:inherit;font-size:14px;background:var(--color-surface-2,#fff);color:inherit;';
    const lblCss = 'font-size:12px;font-weight:600;color:var(--color-text-secondary,#667085);';
    const ov = document.createElement('div');
    ov.id = 'account-panel';
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;background:rgba(8,12,20,.55);backdrop-filter:blur(2px);padding:24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;';
    ov.innerHTML =
        '<div style="background:var(--color-surface-1,#fff);color:var(--color-text-primary,#111);border:1px solid var(--color-border-hair,rgba(0,0,0,.12));border-radius:14px;width:min(460px,96vw);box-shadow:0 24px 64px rgba(0,0,0,.3);overflow:hidden;">'
      +   '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:16px 18px 12px;border-bottom:1px solid var(--color-border-hair,rgba(0,0,0,.1));">'
      +     '<div><div style="font-size:17px;font-weight:700;">Account</div><div style="font-size:12px;color:var(--color-text-secondary,#667085);margin-top:2px;">Your profile and plan</div></div>'
      +     '<button type="button" id="acct-x" aria-label="Close" style="border:none;background:transparent;font-size:24px;line-height:.8;cursor:pointer;color:var(--color-text-secondary,#667085);">×</button>'
      +   '</div>'
      +   '<div style="padding:16px 18px;display:flex;flex-direction:column;gap:12px;">'
      +     '<label style="' + lblCss + '">Full name<input id="acct-name" type="text" value="' + esc(curName) + '" placeholder="Jane Doe" style="' + inputCss + '"></label>'
      +     '<label style="' + lblCss + '">Organization<input id="acct-org" type="text" value="' + esc(curOrg) + '" placeholder="Company or institution" style="' + inputCss + '"></label>'
      +     '<label style="' + lblCss + '">Email<input type="email" value="' + esc(email) + '" disabled style="' + inputCss + 'background:var(--color-surface-3,rgba(0,0,0,.04));color:var(--color-text-secondary,#667085);"></label>'
      +     '<div style="font-size:12px;color:var(--color-text-secondary,#667085);">Plan: <b style="color:var(--color-text-primary,#111);">' + esc(tierLabel) + '</b>' + _acctLicenseLine(esc) + '</div>'
      +     _acctOpenInRow(esc)
      +     '<div id="acct-msg" style="font-size:12px;min-height:14px;"></div>'
      +     '<div id="acct-mfa-mount" style="border-top:1px dashed var(--color-border-hair,rgba(0,0,0,.12));padding-top:12px;"></div>'
      +     '<details style="margin-top:2px;border-top:1px dashed var(--color-border-hair,rgba(0,0,0,.12));padding-top:10px;"><summary style="font-size:12px;font-weight:600;color:#b91c1c;cursor:pointer;">Danger zone</summary>'
      +       '<div style="font-size:11.5px;color:var(--color-text-secondary,#667085);margin:8px 0;line-height:1.45;">Permanently erase your account and all your safety-analysis data, and receive a certificate of destruction. This cannot be undone.</div>'
      +       '<button type="button" id="acct-delete" style="border:1px solid #fca5a5;background:#fef2f2;color:#b91c1c;border-radius:9px;padding:7px 12px;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;">Delete my account &amp; data…</button>'
      +     '</details>'
      +   '</div>'
      +   '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 18px;border-top:1px solid var(--color-border-hair,rgba(0,0,0,.1));">'
      +     '<button type="button" id="acct-signout" style="border:1px solid var(--color-border-hair,rgba(0,0,0,.15));background:transparent;color:var(--color-text-secondary,#667085);border-radius:9px;padding:8px 14px;font:inherit;font-size:13px;cursor:pointer;">Sign out</button>'
      +     '<button type="button" id="acct-save" style="border:none;border-radius:9px;background:var(--color-accent,#0A63CC);color:#fff;font:inherit;font-weight:600;padding:8px 18px;cursor:pointer;">Save</button>'
      +   '</div>'
      + '</div>';
    document.body.appendChild(ov);
    // Two-factor authentication section (born-modular; mfa.js populates the mount).
    try { if (window.SafetyLabMFA && typeof window.SafetyLabMFA.mount === 'function') window.SafetyLabMFA.mount('acct-mfa-mount'); } catch(_){}
    const close = function(){ try { ov.remove(); } catch(_){} };
    ov.addEventListener('mousedown', function(e){ if (e.target === ov) close(); });
    const xb = document.getElementById('acct-x'); if (xb) xb.onclick = close;
    const signout = document.getElementById('acct-signout');
    if (signout) signout.onclick = function(){ if (!confirm('Sign out of Safety Lab Aero?\n\n(' + email + ')')) return; close(); try { supabaseSignOut(); } catch(_){} try { setSignupEmail(''); } catch(_){} try { refreshSigninChip(); } catch(_){} };
    const del = document.getElementById('acct-delete');
    if (del) del.onclick = function(){ close(); _openEraseAccountModal(email); };
    const save = document.getElementById('acct-save');
    if (save) save.onclick = async function(){
        const name2 = (((document.getElementById('acct-name')||{}).value)||'').trim();
        const org2  = (((document.getElementById('acct-org') ||{}).value)||'').trim();
        const msg = document.getElementById('acct-msg');
        const fail = function(t){ if (msg){ msg.style.color = '#c0392b'; msg.textContent = t; } };
        if (!name2) { fail('Please enter your full name.'); return; }
        if (!org2)  { fail('Please enter your organization.'); return; }
        try { localStorage.setItem('safetyLab.signup.name', name2); localStorage.setItem('safetyLab.signup.org', org2); } catch(_){}
        save.disabled = true; const orig = save.textContent; save.textContent = 'Saving…';
        try {
            const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
            if (client && client.auth && typeof client.auth.updateUser === 'function') {
                const { error } = await client.auth.updateUser({ data: { full_name: name2, org: org2 } });
                if (error) throw error;
            }
            if (msg){ msg.style.color = '#1e7e34'; msg.textContent = 'Profile saved.'; }
            try { if (typeof showToast === 'function') showToast('Profile saved.', 'success', 2500); } catch(_){}
        } catch (e) {
            fail('Saved on this device; cloud update failed: ' + ((e && e.message) || e));
        } finally {
            save.disabled = false; save.textContent = orig;
        }
        try { refreshSigninChip(); } catch(_){}
    };
}

async function _openEraseAccountModal(email) {
    const esc = function(s){ return String(s==null?'':s).replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); };
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    if (!client || typeof client.rpc !== 'function') { try { if (typeof showToast==='function') showToast('Not connected — sign in first.','warning',3000); } catch(_){} return; }
    let m = {};
    try {
        const { data, error } = await client.rpc('erase_my_account', { p_confirm: false });   // DRY RUN
        if (error) throw error;
        m = (data && data.manifest) || {};
    } catch (e) { try { if (typeof showToast==='function') showToast('Could not compute deletion: ' + ((e&&e.message)||e),'warning',4000); } catch(_){} return; }
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483640;display:flex;align-items:center;justify-content:center;background:rgba(8,12,20,.6);backdrop-filter:blur(2px);padding:24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;';
    ov.innerHTML =
        '<div style="background:#fff;color:#111;border-radius:14px;width:min(480px,96vw);box-shadow:0 24px 64px rgba(0,0,0,.4);overflow:hidden;">'
      + '<div id="erase-body" style="padding:18px 20px 10px;">'
      +   '<div style="font-size:16px;font-weight:800;color:#b91c1c;">⚠ Delete account &amp; all data</div>'
      +   '<div style="font-size:12.5px;color:#374151;margin-top:6px;line-height:1.5;">This permanently erases:</div>'
      +   '<ul style="font-size:12.5px;color:#374151;margin:6px 0 0;padding-left:18px;line-height:1.6;">'
      +     '<li><b>' + (m.projects||0) + '</b> project(s)</li>'
      +     '<li><b>' + (m.project_documents||0) + '</b> saved analysis document(s)</li>'
      +     '<li><b>' + (m.owned_workspaces||0) + '</b> owned workspace(s) + your memberships</li>'
      +     '<li>your name / org / email (anonymized in our records)</li>'
      +   '</ul>'
      +   '<div style="font-size:12px;color:#6b7280;margin-top:10px;">You will receive a <b>certificate of destruction</b>. This cannot be undone.</div>'
      +   '<div style="font-size:12px;color:#374151;margin-top:12px;">Type <b>DELETE</b> to confirm:</div>'
      +   '<input id="erase-confirm" type="text" autocomplete="off" style="margin-top:6px;width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid #e4e8f1;border-radius:9px;font:inherit;font-size:14px;">'
      +   '<div id="erase-msg" style="font-size:12px;min-height:14px;margin-top:8px;color:#6b7280;"></div>'
      + '</div>'
      + '<div id="erase-foot" style="display:flex;justify-content:flex-end;gap:10px;padding:12px 20px;border-top:1px solid rgba(0,0,0,.08);">'
      +   '<button type="button" id="erase-cancel" style="border:1px solid #d4d8e3;background:#fff;color:#555b6b;border-radius:9px;padding:8px 16px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;">Cancel</button>'
      +   '<button type="button" id="erase-go" disabled style="border:none;background:#fca5a5;color:#fff;border-radius:9px;padding:8px 18px;font:inherit;font-size:13px;font-weight:700;cursor:not-allowed;">Delete forever</button>'
      + '</div></div>';
    document.body.appendChild(ov);
    const close = function(){ try { ov.remove(); } catch(_){} };
    ov.addEventListener('mousedown', function(e){ if (e.target===ov) close(); });
    document.getElementById('erase-cancel').onclick = close;
    const inp = document.getElementById('erase-confirm');
    const go = document.getElementById('erase-go');
    const msg = document.getElementById('erase-msg');
    inp.oninput = function(){ const ok = inp.value.trim() === 'DELETE'; go.disabled = !ok; go.style.background = ok ? '#dc2626' : '#fca5a5'; go.style.cursor = ok ? 'pointer' : 'not-allowed'; };
    try { inp.focus(); } catch(_){}
    go.onclick = async function(){
        if (inp.value.trim() !== 'DELETE') return;
        go.disabled = true; go.textContent = 'Deleting…'; if (msg){ msg.style.color='#6b7280'; msg.textContent='Erasing your data…'; }
        try {
            const { data, error } = await client.rpc('erase_my_account', { p_confirm: true });   // COMMIT
            if (error) throw error;
            const cert = (data && data.certificate_id) || '(issued)';
            const hash = (data && data.manifest_sha256) || '';
            const b = document.getElementById('erase-body');
            if (b) b.innerHTML =
                '<div style="font-size:16px;font-weight:800;color:#15803d;">✓ Account erased</div>'
              + '<div style="font-size:12.5px;color:#374151;margin-top:8px;line-height:1.5;">Your data has been permanently deleted.</div>'
              + '<div style="font-size:11.5px;color:#374151;margin-top:10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px;">'
              +   '<b>Certificate of destruction</b><br>ID: ' + esc(String(cert)) + '<br>SHA-256: <span style="word-break:break-all;">' + esc(String(hash)) + '</span><br>Issued: ' + new Date().toISOString().slice(0,19).replace('T',' ') + ' UTC</div>'
              + '<div style="font-size:12px;color:#6b7280;margin-top:10px;">Signing you out…</div>';
            const f = document.getElementById('erase-foot'); if (f) f.remove();
            setTimeout(function(){ try { supabaseSignOut(); } catch(_){} try { setSignupEmail(''); } catch(_){} try { refreshSigninChip(); } catch(_){} close(); try { location.reload(); } catch(_){} }, 5000);
        } catch (e) {
            go.disabled = false; go.textContent = 'Delete forever'; if (msg){ msg.style.color='#c0392b'; msg.textContent = 'Deletion failed: ' + ((e&&e.message)||e); }
        }
    };
}

function _wsTrackActivity(){
    try{
        const u=_wsUser(); if(!u.email) return; if(!_wsEnsure()) return;
        const a=_wsActiveArea||{scope:'ac',sysId:''};
        const log=projectConfig.changeLog; const now=Date.now();
        const last=log.length?log[log.length-1]:null;
        if(last && last.action==='edit' && String(last.by).toLowerCase()===u.email && last.scope===a.scope && String(last.systemId||'')===String(a.sysId||'') && (now-last.ts)<90000){ last.ts=now; return; }
        const r=_wsAreaRef(a.scope,a.sysId);
        _wsLog(a.scope, a.sysId, 'edit', 'edited ' + (r?r.label:(a.scope==='system'?'a system':'aircraft level')));
    }catch(_){}
}
function _wsApplyReadonlyNotice(scope, systemId){
    let b=document.getElementById('ws-readonly-banner');
    if (_wsEditable(scope, systemId)){ if(b) b.style.display='none'; return; }
    const lk=_wsGetLock(scope, systemId);
    if(!b){ b=document.createElement('div'); b.id='ws-readonly-banner';
        b.style.cssText='position:fixed;top:0;left:0;right:0;z-index:99990;background:#b3261e;color:#fff;text-align:center;padding:7px 12px;font:13px/1.4 -apple-system,system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.2);';
        document.body.appendChild(b);
    }
    b.innerHTML='🔒 This area is locked by <b>' + (lk?(lk.name||lk.by):'another user') + '</b> — read-only. Edits here may be overwritten on save. <span style="text-decoration:underline;cursor:pointer" onclick="openWorkspacesPanel()">Manage locks</span>';
    b.style.display='block';
}
// Password re-authentication gate — every lock/unlock requires the user to confirm
// their own password. Verified against Supabase (signInWithPassword); the password
// is sent over HTTPS to the auth provider and never stored or logged here.
function _wsRequirePassword(actionLabel){
    return new Promise(function(resolve){
        const u=_wsUser();
        if(!u.email){ _wsToast('Sign in first.','warning'); resolve(false); return; }
        const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
        if(!client || !client.auth || typeof client.auth.signInWithPassword !== 'function'){
            _wsToast('Password confirmation needs hosted sign-in (unavailable in this build).','warning'); resolve(false); return;
        }
        const old=document.getElementById('ws-pw'); if(old) old.remove();
        const ov=document.createElement('div'); ov.id='ws-pw';
        ov.style.cssText='position:fixed;inset:0;z-index:2147483602;display:flex;align-items:center;justify-content:center;background:rgba(8,12,20,.6);padding:24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;';
        ov.innerHTML='<div style="background:var(--color-surface-1,#fff);color:var(--color-text-primary,#111);border:1px solid var(--color-border-hair,rgba(0,0,0,.12));border-radius:12px;width:min(380px,94vw);box-shadow:0 24px 64px rgba(0,0,0,.35);overflow:hidden;">'
            +'<div style="padding:16px 18px 8px;"><div style="font-size:15px;font-weight:700;">Confirm your password</div>'
            +'<div style="font-size:12.5px;color:var(--color-text-secondary,#667085);margin-top:4px;">Enter your password to '+(actionLabel||'continue')+'. Signed in as '+esc(u.email)+'.</div></div>'
            +'<div style="padding:6px 18px 14px;">'
            +'<input id="ws-pw-input" type="password" autocomplete="current-password" placeholder="Password" style="width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid var(--color-border-hair,rgba(0,0,0,.15));border-radius:9px;font:inherit;font-size:14px;background:var(--color-surface-2,#fff);color:inherit;">'
            +'<div id="ws-pw-msg" style="font-size:12px;color:#b3261e;min-height:14px;margin-top:6px;"></div></div>'
            +'<div style="display:flex;justify-content:flex-end;gap:8px;padding:10px 18px;border-top:1px solid var(--color-border-hair,rgba(0,0,0,.1));">'
            +'<button id="ws-pw-cancel" type="button" style="border:1px solid var(--color-border-hair,rgba(0,0,0,.15));background:transparent;color:inherit;border-radius:9px;padding:8px 14px;font:inherit;font-size:13px;cursor:pointer;">Cancel</button>'
            +'<button id="ws-pw-ok" type="button" style="border:none;border-radius:9px;background:var(--color-accent,#0A63CC);color:#fff;font:inherit;font-weight:600;font-size:13px;padding:8px 16px;cursor:pointer;">Confirm</button>'
            +'</div></div>';
        document.body.appendChild(ov);
        const inp=document.getElementById('ws-pw-input'); try{ inp.focus(); }catch(_){}
        const done=function(v){ try{ov.remove();}catch(_){} resolve(v); };
        const cancel=document.getElementById('ws-pw-cancel'); if(cancel) cancel.onclick=function(){ done(false); };
        const okBtn=document.getElementById('ws-pw-ok');
        const submit=async function(){
            const pw=(inp&&inp.value)||''; const msg=document.getElementById('ws-pw-msg');
            if(!pw){ if(msg) msg.textContent='Enter your password.'; return; }
            okBtn.disabled=true; const o=okBtn.textContent; okBtn.textContent='Checking…';
            try{
                const res=await client.auth.signInWithPassword({ email:u.email, password:pw });
                if(res && res.error){ if(msg) msg.textContent='Incorrect password.'; okBtn.disabled=false; okBtn.textContent=o; return; }
                done(true);
            }catch(e){ if(msg) msg.textContent=((e&&e.message)||'Verification failed.'); okBtn.disabled=false; okBtn.textContent=o; }
        };
        if(okBtn) okBtn.onclick=submit;
        if(inp) inp.onkeydown=function(e){ if(e.key==='Enter'){ e.preventDefault(); submit(); } };
        ov.addEventListener('mousedown',function(e){ if(e.target===ov) done(false); });
    });
}
function openWorkspacesPanel(){
    const u=_wsUser();
    if(!u.email){ _wsToast('Sign in to manage workspaces.','warning'); return; }
    if(!_wsEnsure()){ _wsToast('Open or create a project first.','warning'); return; }
    const old=document.getElementById('ws-panel'); if(old) old.remove();
    const ev=function(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c];}); };
    const ov=document.createElement('div'); ov.id='ws-panel';
    ov.style.cssText='position:fixed;inset:0;z-index:2147483601;display:flex;align-items:center;justify-content:center;background:rgba(8,12,20,.55);backdrop-filter:blur(2px);padding:24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;';
    ov.innerHTML='<div style="background:var(--color-surface-1,#fff);color:var(--color-text-primary,#111);border:1px solid var(--color-border-hair,rgba(0,0,0,.12));border-radius:14px;width:min(720px,96vw);max-height:90vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,.3);overflow:hidden;">'
        +'<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:16px 18px 12px;border-bottom:1px solid var(--color-border-hair,rgba(0,0,0,.1));">'
        +'<div><div style="font-size:17px;font-weight:700;">Workspaces &amp; Locks</div><div style="font-size:12px;color:var(--color-text-secondary,#667085);margin-top:2px;">Allocate areas to people, lock the one you\'re working in, and see who changed what. You are ' + ev(u.name) + '.</div></div>'
        +'<button type="button" id="ws-x" aria-label="Close" style="border:none;background:transparent;font-size:24px;line-height:.8;cursor:pointer;color:var(--color-text-secondary,#667085);">×</button></div>'
        +'<div style="overflow:auto;padding:14px 18px;">'
        +'<div style="font-weight:600;font-size:13px;margin-bottom:8px;">Areas</div><div id="ws-areas"></div>'
        +'<div style="font-weight:600;font-size:13px;margin:16px 0 8px;">Activity <span style="font-weight:400;color:var(--color-text-secondary,#667085);font-size:11.5px;">— who changed what, when</span></div><div id="ws-activity"></div>'
        +'</div>'
        +'<div style="padding:11px 18px;border-top:1px solid var(--color-border-hair,rgba(0,0,0,.1));display:flex;justify-content:flex-end;"><button type="button" id="ws-done" style="border:none;border-radius:9px;background:var(--color-accent,#0A63CC);color:#fff;font:inherit;font-weight:600;padding:8px 18px;cursor:pointer;">Done</button></div>'
        +'</div>';
    document.body.appendChild(ov);
    const close=function(){ try{ov.remove();}catch(_){} try{ if(typeof renderSystemDirectory==='function') renderSystemDirectory(); }catch(_){} try{ _wsApplyReadonlyNotice(_wsActiveArea.scope, _wsActiveArea.sysId); }catch(_){} };
    ov.addEventListener('mousedown',function(e){ if(e.target===ov) close(); });
    const xb=document.getElementById('ws-x'); if(xb) xb.onclick=close;
    const db=document.getElementById('ws-done'); if(db) db.onclick=close;
    function areaRows(){
        const u2=_wsUser();
        const areas=[{scope:'ac',sysId:'',label:'Aircraft level'}].concat((systemsData||[]).map(function(s){ return {scope:'system',sysId:s.id,label:s.name||s.id}; }));
        return areas.map(function(a){
            const lk=_wsGetLock(a.scope,a.sysId); const owner=_wsGetOwner(a.scope,a.sysId);
            const mine = lk && String(lk.by||'').toLowerCase()===u2.email;
            let status, btn;
            if(!lk){ status='<span style="color:var(--color-text-secondary,#667085);">Unlocked</span>'; btn='<button type="button" data-act="lock" data-scope="'+a.scope+'" data-sys="'+ev(a.sysId)+'" style="border:1px solid var(--color-border-hair,rgba(0,0,0,.15));background:transparent;border-radius:8px;padding:6px 12px;font:inherit;font-size:12.5px;cursor:pointer;color:inherit;">Lock</button>'; }
            else if(mine){ status='<span style="color:#0b8043;font-weight:600;">🔒 Locked by you</span>'; btn='<button type="button" data-act="unlock" data-scope="'+a.scope+'" data-sys="'+ev(a.sysId)+'" style="border:1px solid var(--color-border-hair,rgba(0,0,0,.15));background:transparent;border-radius:8px;padding:6px 12px;font:inherit;font-size:12.5px;cursor:pointer;color:inherit;">Unlock</button>'; }
            else { status='<span style="color:#b3261e;font-weight:600;">🔒 Locked by '+ev(lk.name||lk.by)+'</span>'; btn='<button type="button" data-act="override" data-scope="'+a.scope+'" data-sys="'+ev(a.sysId)+'" style="border:1px solid #b3261e;background:transparent;color:#b3261e;border-radius:8px;padding:6px 12px;font:inherit;font-size:12.5px;cursor:pointer;">Override</button>'; }
            return '<div style="border:1px solid var(--color-border-hair,rgba(0,0,0,.1));border-radius:9px;padding:10px 12px;margin-bottom:8px;">'
                +'<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;"><div style="font-weight:600;font-size:13.5px;">'+ev(a.label)+'</div>'+status+'</div>'
                +'<div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap;">'
                +'<label style="font-size:12px;color:var(--color-text-secondary,#667085);">Owner</label>'
                +'<input type="email" data-owner-scope="'+a.scope+'" data-owner-sys="'+ev(a.sysId)+'" value="'+ev(owner)+'" placeholder="email@org" style="flex:1;min-width:160px;padding:6px 9px;border:1px solid var(--color-border-hair,rgba(0,0,0,.15));border-radius:8px;font:inherit;font-size:12.5px;background:var(--color-surface-2,#fff);color:inherit;">'
                +btn+'</div></div>';
        }).join('');
    }
    function activityRows(){
        const log=(projectConfig.changeLog||[]).slice().reverse().slice(0,60);
        if(!log.length) return '<div style="font-size:12.5px;color:var(--color-text-secondary,#667085);">No activity recorded yet.</div>';
        return log.map(function(e){
            const when=new Date(e.ts||0).toLocaleString();
            return '<div style="display:flex;gap:8px;font-size:12.5px;padding:5px 0;border-bottom:1px solid var(--color-border-hair,rgba(0,0,0,.06));">'
                +'<span style="color:var(--color-text-secondary,#667085);white-space:nowrap;">'+ev(when)+'</span>'
                +'<span style="font-weight:600;white-space:nowrap;">'+ev(e.name||e.by||'—')+'</span>'
                +'<span>'+ev(e.summary||e.action||'')+'</span></div>';
        }).join('');
    }
    function render(){ const a=document.getElementById('ws-areas'); if(a) a.innerHTML=areaRows(); const v=document.getElementById('ws-activity'); if(v) v.innerHTML=activityRows(); }
    render();
    const areasHost=document.getElementById('ws-areas');
    if(areasHost){
        areasHost.addEventListener('click', async function(e){
            const t=e.target; const act=t&&t.getAttribute&&t.getAttribute('data-act'); if(!act) return;
            const scope=t.getAttribute('data-scope'); const sys=t.getAttribute('data-sys');
            // Every lock/unlock requires password re-authentication.
            const label = act==='lock' ? 'lock this workspace' : (act==='override' ? 'override another user’s lock' : 'unlock this workspace');
            const ok = await _wsRequirePassword(label);
            if(!ok) return;
            if(act==='lock') _wsLock(scope,sys);
            else if(act==='unlock') _wsUnlock(scope,sys,false);
            else if(act==='override') _wsUnlock(scope,sys,true);
            render(); try{ _wsApplyReadonlyNotice(_wsActiveArea.scope, _wsActiveArea.sysId); }catch(_){}
        });
        areasHost.addEventListener('change',function(e){
            const t=e.target; const sc=t&&t.getAttribute&&t.getAttribute('data-owner-scope'); if(!sc) return;
            _wsSetOwner(sc, t.getAttribute('data-owner-sys'), t.value||''); _wsToast('Owner updated.','success'); render();
        });
    }
}

async function promptCreateWorkspace() {
    const name = await slPrompt('New workspace name:');
    if (!name || !name.trim()) return;
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    if (!client) {
        if (typeof showToast === 'function') showToast('Sign in first to create a workspace.', 'warning', 4000);
        return;
    }
    try {
        // Fix 1 — validate the session FRESH (refreshes a stale token). A stale token makes
        // auth.uid() null on the request, which trips the RLS WITH CHECK on workspaces_self_insert.
        const { data: uData, error: uErr } = await client.auth.getUser();
        const user = uData && uData.user;
        if (uErr || !user || !user.id) {
            if (typeof showToast === 'function') showToast('Your session expired — sign out and back in, then create the workspace.', 'warning', 6000);
            return;
        }
        const userId = user.id;
        // Fix 2 — client-generate the workspace id so we never need to read the row back. For the
        // instant between the workspace insert and the membership insert the owner isn't a member
        // yet, so a .select() read-back would be filtered by workspaces_member_read. Owning the id
        // up front removes that race entirely.
        const wsId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : null;
        const row = { name: name.trim(), owner_id: userId, is_personal: false };
        if (wsId) row.id = wsId;
        let newId = wsId;
        if (wsId) {
            const { error: wsErr } = await client.from('workspaces').insert(row);
            if (wsErr) throw wsErr;
        } else {   // fallback when crypto.randomUUID is unavailable: read the id back
            const { data: ws, error: wsErr } = await client.from('workspaces').insert(row).select('id').single();
            if (wsErr) throw wsErr;
            newId = ws.id;
        }
        // Add me as owner. ws_members_self_join allows this (auth.uid() = user_id).
        const { error: memErr } = await client
            .from('workspace_members')
            .insert({ workspace_id: newId, user_id: userId, role: 'owner' });
        if (memErr) throw memErr;
        if (typeof showToast === 'function') showToast('Created workspace "' + name.trim() + '".', 'success', 4000);
        setActiveWorkspaceId(newId);
        await refreshWorkspaceChip();
        toggleWorkspaceMenu();
    } catch (e) {
        console.error('[Safety Lab Aero] create workspace failed:', e);
        const msg = (e && e.message) || 'unknown';
        const friendly = /row-level security|violates|jwt|auth/i.test(msg) ? 'session not recognized — sign out and back in, then retry.' : msg;
        if (typeof showToast === 'function') showToast('Create workspace failed: ' + friendly, 'warning', 6000);
    }
}

function _stableStringify(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(_stableStringify).join(',') + ']';
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + _stableStringify(v[k])).join(',') + '}';
}
async function _canonicalHash(obj) {
    try {
        const bytes = new TextEncoder().encode(_stableStringify(obj));
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) { console.warn('[Safety Lab Aero] canonical hash failed:', e); return null; }
}

// Office-style version history: append EVERY save as a retrievable point, keyed by
// the same version token written to project_documents. Non-fatal: never blocks a save.
async function _recordSaveHistory(projectId, version, snapshot, userId) {
    try {
        const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
        if (!client || !projectId || version == null) return;
        await client.from('project_document_versions').insert({
            project_id: projectId, version: version, data: snapshot, saved_by: userId
        });
    } catch (e) {
        console.warn('[Safety Lab Aero] save-history record skipped:', e);
    }
}

// Create a deliberate REVISION: an immutable, numbered baseline (Rev 1, Rev 2, ...)
// that goes through review / approval / sign-off. This is a CONTROLLED event, not
// something that happens on every save. Persists the working copy first so the
// revision matches it, then writes a hash-bound project_baselines row.
async function createProjectRevision(label, note) {
    // 5 Sep 2026 — this one is worse than the manual Save and gets no
    // confirmation option. It uploads the whole project, including the full text
    // of every source document, as a SIDE EFFECT of an action presented as
    // document control: the second statement of its body is `await
    // saveProjectToCloud()`. A user cutting a revision is not told they are
    // sending anything anywhere, so a warning would not inform them — it would
    // only move the blame. It refuses.
    var _blockedRev = _slCloudBlockedForControlled(null);
    if (_blockedRev) { _slControlledCloudNotice(_blockedRev, 'revision'); return null; }
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    if (!client) { if (typeof showToast === 'function') showToast('Sign in to create a revision.', 'warning', 4000); return null; }
    const userId = _supabaseSession && _supabaseSession.user && _supabaseSession.user.id;
    if (!userId) { if (typeof showToast === 'function') showToast('Session expired — please sign in again.', 'warning', 4000); return null; }
    // Persist the working copy first, so the revision snapshot matches what's saved.
    await saveProjectToCloud();
    const projectId = _activeCloudProjectId;
    if (!projectId) { if (typeof showToast === 'function') showToast('Save the project to cloud before creating a revision.', 'warning', 4000); return null; }
    try {
        const snapshot = _buildProjectSnapshot();
        const hash = (await _canonicalHash(snapshot)) || ('nohash-' + Date.now());
        // Don't cut a duplicate revision if nothing changed since the last one.
        const { data: latest } = await client
            .from('project_baselines')
            .select('version_no, sha256')
            .eq('project_id', projectId)
            .order('version_no', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (latest && latest.sha256 && latest.sha256 === hash) {
            if (typeof showToast === 'function') showToast('No changes since revision ' + latest.version_no + ' — nothing to capture.', 'info', 4000);
            return null;
        }
        const { data: created, error } = await client
            .from('project_baselines')
            .insert({ project_id: projectId, data: snapshot, sha256: hash, created_by: userId, label: label || null, note: note || null })
            .select('version_no')
            .single();
        if (error) throw error;
        const rev = created && created.version_no;
        if (typeof showToast === 'function') showToast('Revision ' + rev + ' created' + (label ? ' — ' + label : ''), 'success', 4500);
        return rev;
    } catch (e) {
        console.error('[Safety Lab Aero] create revision failed:', e);
        if (typeof showToast === 'function') showToast('Create revision failed: ' + (e.message || 'unknown'), 'warning', 5000);
        return null;
    }
}

// 20 Aug 2026 — DERIVED, same list as the local autosave. This function and
// _snapshotProject disagreeing is what put 0 of 411 stored documents in possession of
// projectReportEdits: every cloud save silently dropped every word of per-section
// report prose the user had written. They cannot disagree now — there is one list.
// _betaBuild is the ONLY cloud-only key: a build stamp, not project content.
function _buildProjectSnapshot() {
    if (typeof window !== 'undefined' && window.SLStores) {
        var snap = window.SLStores.snapshot();
        snap._betaBuild = (typeof BETA_BUILD_ID !== 'undefined') ? BETA_BUILD_ID : 'unknown';
        return snap;
    }
    return _buildProjectSnapshotLegacy();
}
function _buildProjectSnapshotLegacy() {
    return {
        projectName: (typeof projectName !== 'undefined') ? projectName : 'Untitled Project',
        _betaBuild: (typeof BETA_BUILD_ID !== 'undefined') ? BETA_BUILD_ID : 'unknown',
        acFunctionsData, acFcimData, acExtractedFCs, acFhaData, acReqData, acAssumptionsData, acAsmCounter,
        systemsData, activeSystemId,
        praData, zsaData, cmaData, routingData, resourcesData, projectSourceDocs: _slabSerializeSourceDocs(), aiAssumptions, fmeaData, fmeaCounter, itemsData,
        flightPhasesData,
        mlData,
        // stpaData belongs in EVERY snapshot, not just the .slab export. It was
        // present only in _slabBuildProjectExport(), so the cloud push (this
        // function) and the local autosave (_snapshotProject) both silently
        // dropped the whole STPA lane — losses, hazards, control structure, UCA
        // dispositions, causal scenarios. A reload restored it as empty.
        stpaData,
        ftaPages, activeFTAPageId, internalIdCounter, typeCounters,
        ftaConfig, projectConfig, projectBaselines,
        reviewCommentsData, reviewCounter, reviewApprovalsData,
        projectTemplates,
        // 20 Aug 2026 — these two were in the LOCAL autosave (_snapshotProject) and
        // NOT here, so every cloud round-trip silently discarded them. Verified in
        // production: 0 of 411 stored documents contained either. projectReportEdits
        // is every word of per-section report prose a user has written; losing it on
        // save-and-reopen is invisible until they go looking for it.
        // Same class as the stpaData note above, which is the whole reason
        // tests/regression_project_durability now asserts the three snapshot
        // builders agree rather than trusting anyone to keep them in step by eye.
        autoReqTemplateOverrides, projectReportEdits
    };
}

// Restore in-memory state from a snapshot (used by Open from cloud).
function _restoreProjectSnapshot(data) {
    if (!data || typeof data !== 'object') throw new Error('Invalid project data');
    acFunctionsData    = Array.isArray(data.acFunctionsData)   ? data.acFunctionsData   : [];
    acFcimData         = Array.isArray(data.acFcimData)        ? data.acFcimData        : [];
    acExtractedFCs     = Array.isArray(data.acExtractedFCs)    ? data.acExtractedFCs    : [];
    acFhaData          = Array.isArray(data.acFhaData)         ? data.acFhaData         : [];
    // Older saves predate the STPA lane; rehydrate the full default rather than
    // leaving the OUTGOING project's structure in memory. Mirrors the shape in
    // data_ops_modules.js so the two load paths cannot disagree.
    mlData             = (data.mlData && Array.isArray(data.mlData.constituents)) ? data.mlData : { constituents: [], odd: [], datasets: [], counter: 1 };
    stpaData           = (data.stpaData && data.stpaData.cs) ? data.stpaData : { cs: { controllers: [], processes: [], actions: [], feedbacks: [], others: [], precedence: [] }, dispositions: {}, causeDismissals: {}, scopeFcIds: [], meta: { mission: '', scope: '', boundary: '', abstractionLevel: '' }, losses: [], hazards: [], constraints: [], responsibilities: [], csState: 'initial', sip: {} };
    acReqData          = Array.isArray(data.acReqData)         ? data.acReqData         : [];
    acAssumptionsData  = Array.isArray(data.acAssumptionsData) ? data.acAssumptionsData : [];
    acAsmCounter       = (typeof data.acAsmCounter === 'number') ? data.acAsmCounter : 1;
    systemsData        = Array.isArray(data.systemsData)       ? data.systemsData       : [];
    activeSystemId     = data.activeSystemId || null;
    praData            = Array.isArray(data.praData)           ? data.praData           : [];
    zsaData            = Array.isArray(data.zsaData)           ? data.zsaData           : [];
    cmaData            = Array.isArray(data.cmaData)           ? data.cmaData           : [];
    routingData        = Array.isArray(data.routingData)       ? data.routingData       : [];
    resourcesData      = Array.isArray(data.resourcesData)     ? data.resourcesData     : [];
    projectSourceDocs  = Array.isArray(data.projectSourceDocs) ? data.projectSourceDocs : [];
    aiAssumptions      = Array.isArray(data.aiAssumptions)     ? data.aiAssumptions     : [];
    fmeaData           = Array.isArray(data.fmeaData)          ? data.fmeaData          : [];
    fmeaCounter        = (typeof data.fmeaCounter === 'number') ? data.fmeaCounter : 1;
    itemsData          = Array.isArray(data.itemsData)         ? data.itemsData         : [];
    flightPhasesData   = Array.isArray(data.flightPhasesData)  ? data.flightPhasesData  : flightPhasesData;
    ftaPages           = Array.isArray(data.ftaPages)          ? data.ftaPages          : ftaPages;
    activeFTAPageId    = data.activeFTAPageId || (ftaPages[0] && ftaPages[0].id) || null;
    internalIdCounter  = (typeof data.internalIdCounter === 'number') ? data.internalIdCounter : 1;
    typeCounters       = data.typeCounters || typeCounters;
    ftaConfig          = data.ftaConfig    || ftaConfig;
    projectConfig      = data.projectConfig || projectConfig;
    projectBaselines   = Array.isArray(data.projectBaselines)  ? data.projectBaselines  : [];
    // Phase 55.0.8 — AutoReq template overrides
    autoReqTemplateOverrides = (data.autoReqTemplateOverrides && typeof data.autoReqTemplateOverrides === 'object') ? data.autoReqTemplateOverrides : {};
    try { if (typeof window !== 'undefined') window.autoReqTemplateOverrides = autoReqTemplateOverrides; } catch(_) {}
    // Phase 56.9 — restore per-project report-section edits
    projectReportEdits = (data.projectReportEdits && typeof data.projectReportEdits === 'object') ? data.projectReportEdits : {};
    try { if (typeof window !== 'undefined') window.projectReportEdits = projectReportEdits; } catch(_) {}
    reviewCommentsData = Array.isArray(data.reviewCommentsData) ? data.reviewCommentsData : [];
    reviewCounter      = (typeof data.reviewCounter === 'number') ? data.reviewCounter : 1;
    reviewApprovalsData = Array.isArray(data.reviewApprovalsData) ? data.reviewApprovalsData : [];
    if (typeof emptyTemplateOverrides === 'function') {
        const fresh = emptyTemplateOverrides();
        if (data.projectTemplates) {
            Object.keys(fresh).forEach(k => {
                if (data.projectTemplates[k]) {
                    fresh[k].columnOverrides = data.projectTemplates[k].columnOverrides || {};
                    fresh[k].customColumns   = Array.isArray(data.projectTemplates[k].customColumns) ? data.projectTemplates[k].customColumns : [];
                    fresh[k].columnOrder     = Array.isArray(data.projectTemplates[k].columnOrder)   ? data.projectTemplates[k].columnOrder   : [];
                }
            });
        }
        projectTemplates = fresh;
        window.projectTemplates = projectTemplates;
    }
    if (typeof data.projectName === 'string' && data.projectName.trim()) projectName = data.projectName;
    if (typeof _refreshProjectNameUI === 'function') _refreshProjectNameUI();
    // 31 Aug 2026 (H-6) — NUMBERING, restored HERE because this is the only
    // snapshot path _loadCloudProject and _applyServerRestore use. Every save
    // already carries numberingScheme + numberingStore (written at
    // misc_fn_modules.js:1133) and the localStorage restore path has always
    // rehydrated them via _slInitNumberingFromProject; this path never did.
    // Two consequences, both live-observed: a fresh tab minted from FC-001 over
    // a project whose rows start at FC-198 (db0b5a9e, 31 Aug), and a tab that
    // switched projects kept the OUTGOING project's counter store — the same
    // class of cross-project bleed as H-5, in the numbering layer.
    // _slInitNumberingFromProject also seeds every counter above the ids already
    // present, so a save that predates the store still cannot collide.
    // Must stay AFTER acFunctionsData / acFhaData are assigned — the seeder
    // reads them to find the high-water mark.
    try { _slInitNumberingFromProject(data); }
    catch (e) { console.warn('[numbering] cloud-load init failed:', e); }
    try { _pruneFmeaToPerSystem(); } catch (_) {}   // Phase 68 — drop untagged / functional FMEA on cloud load too
    // Trigger a full re-render across all modules.
    try { if (typeof updateDashboard === 'function') updateDashboard(); } catch(_) {}
    try { if (typeof renderACFHA === 'function') renderACFHA(); } catch(_) {}
    try { if (typeof renderACFunctions === 'function') renderACFunctions(); } catch(_) {}
    try { if (typeof renderACReq === 'function') renderACReq(); } catch(_) {}
    try { if (typeof renderPRA === 'function') renderPRA(); } catch(_) {}
    try { if (typeof renderZSA === 'function') renderZSA(); } catch(_) {}
    try { if (typeof renderCMA === 'function') renderCMA(); } catch(_) {}
    try { if (typeof renderFMEA === 'function') renderFMEA(); } catch(_) {}
    try { if (typeof rerenderAllTemplateDrivenTables === 'function') rerenderAllTemplateDrivenTables(); } catch(_) {}
}

// === Phase 1 (CRDT co-authoring) model hooks ================================
// crdt_sync.js is model-agnostic; these two functions are the ONLY coupling to the live model.
// Capture reads the synced collections; apply writes them back + re-renders, with autosave
// SUSPENDED so a remote merge can't echo straight back out. v1 = the aircraft-level flat tables.
function __crdtCapture() {
    var clone = function (a) { try { return JSON.parse(JSON.stringify(a || [])); } catch (_) { return []; } };
    return {
        acFunctionsData:   clone(acFunctionsData),
        acFhaData:         clone(acFhaData),
        acReqData:         clone(acReqData),
        acAssumptionsData: clone(acAssumptionsData),
        praData:           clone(praData),
        zsaData:           clone(zsaData),
        cmaData:           clone(cmaData),
        fmeaData:          clone(fmeaData),
        systemsData:       clone(systemsData),
        ftaPages:          clone(ftaPages)
    };
}
function __crdtApply(partial) {
    if (!partial || typeof partial !== 'object') return;
    var prev = _autosaveSuspended; _autosaveSuspended = true;
    try {
        if (Array.isArray(partial.acFunctionsData))   acFunctionsData   = partial.acFunctionsData;
        if (Array.isArray(partial.acFhaData))         acFhaData         = partial.acFhaData;
        if (Array.isArray(partial.acReqData))         acReqData         = partial.acReqData;
        if (Array.isArray(partial.acAssumptionsData)) acAssumptionsData = partial.acAssumptionsData;
        if (Array.isArray(partial.praData))           praData           = partial.praData;
        if (Array.isArray(partial.zsaData))           zsaData           = partial.zsaData;
        if (Array.isArray(partial.cmaData))           cmaData           = partial.cmaData;
        if (Array.isArray(partial.fmeaData))          fmeaData          = partial.fmeaData;
        if (Array.isArray(partial.systemsData))       systemsData       = partial.systemsData;
        if (Array.isArray(partial.ftaPages))          ftaPages          = partial.ftaPages;
        // re-render only the collections that arrived in this delta
        try { if (partial.acFunctionsData   && typeof renderACFunctions     === 'function') renderACFunctions(); } catch (_) {}
        try { if (partial.acFhaData         && typeof renderACFHA           === 'function') renderACFHA(); } catch (_) {}
        try { if (partial.acReqData         && typeof renderACReq           === 'function') renderACReq(); } catch (_) {}
        try { if (partial.acAssumptionsData && typeof renderACAssumptions   === 'function') renderACAssumptions(); } catch (_) {}
        try { if (partial.praData           && typeof renderPRA             === 'function') renderPRA(); } catch (_) {}
        try { if (partial.zsaData           && typeof renderZSA             === 'function') renderZSA(); } catch (_) {}
        try { if (partial.cmaData           && typeof renderCMA             === 'function') renderCMA(); } catch (_) {}
        try { if (partial.fmeaData          && typeof renderFMEA            === 'function') renderFMEA(); } catch (_) {}
        try { if (partial.systemsData       && typeof renderSystemDirectory === 'function') renderSystemDirectory(); } catch (_) {}
        try { if (partial.ftaPages) { if (typeof renderFTASidebar === 'function') renderFTASidebar(); if (typeof updateD3 === 'function') updateD3(); } } catch (_) {}
        try { if (typeof updateDashboard === 'function') updateDashboard(); } catch (_) {}
    } finally { _autosaveSuspended = prev; }

    // 5 Sep 2026 — DATA LOSS, closed. Suspending autosave across the mutation is
    // right (a write mid-merge could persist a half-applied state), but nothing
    // scheduled one AFTERWARDS. A teammate's merged change therefore lived only
    // in this tab's memory until the local user happened to make an edit of
    // their own; close the tab first and the merge was gone, with no error and
    // no trace. Working rule 26 exists because measurement data was lost once —
    // this is the same class, arriving by a different door.
    //
    // Deliberately OUTSIDE the finally, so the flag is already restored and this
    // write is not the one being suppressed. Only fires when we were not already
    // inside a suspended region (a project load owns its own save).
    if (!prev) {
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
    }
}

// ---------------------------------------------------------------------------
// Provisioning a cloud project is a CHECK-THEN-INSERT, and it had no lock.
//
// _activeCloudProjectId is only assigned after the insert round-trip resolves,
// so every caller that arrives while that request is in flight still reads null
// and inserts its own row. On 31 Jul 2026 one user's first session produced
// twelve copies of the same showcase, seven of them minted inside a 44 ms
// window — far faster than a person can click, and faster than a single
// serialised path could have managed. Their workspace was junk on day one.
//
// Every provisioning path now goes through here. The first caller creates the
// row; concurrent callers await that same promise and get the same id back
// instead of racing it. cloud_sync.js reaches this via window._slEnsureCloudProject
// so the background autosave and the manual Save share one lock rather than
// each holding their own.
// ---------------------------------------------------------------------------
let _cloudProjectCreateLock = null;

async function _ensureCloudProject(client, wsId, name, certBasis, userId) {
    if (_activeCloudProjectId) return _activeCloudProjectId;
    if (_cloudProjectCreateLock) return await _cloudProjectCreateLock;

    _cloudProjectCreateLock = (async function () {
        const { data, error } = await client
            .from('projects')
            .insert({ workspace_id: wsId, name, cert_basis: certBasis, created_by: userId })
            .select()
            .single();
        if (error) throw error;
        _activeCloudProjectId = data.id;
        _activeCloudDocVersion = null;   // brand-new document -> first save becomes version 1
        try { if (typeof _rtUpdatePresenceProject === 'function') _rtUpdatePresenceProject(); } catch (_) {}
        return data.id;
    })();

    // Release the lock however it settles. Awaiters already hold the promise, so
    // clearing it here cannot strand them; on failure the next caller retries.
    _cloudProjectCreateLock.then(function () {}, function () {}).then(function () { _cloudProjectCreateLock = null; });

    return await _cloudProjectCreateLock;
}
try { if (typeof window !== 'undefined') window._slEnsureCloudProject = _ensureCloudProject; } catch (_) {}

// ---------------------------------------------------------------------------
// Signed-out posture (30 Aug 2026). Found during the F1c live-verify: a
// signed-out tab surfaced "permission denied for function is_workspace_member"
// raw in the cloud-projects panel. Signed-out is a STATE, not an error — the
// cloud surfaces below short-circuit to a sign-in prompt instead of fetching,
// and any RLS/permission error that still reaches a catch is translated before
// a user sees it. Server grants for authenticated users verified intact.
function _cloudSignedOut() {
    try { return !(typeof _supabaseSession !== 'undefined' && _supabaseSession && _supabaseSession.user); }
    catch (_) { return true; }
}
function _cloudErrText(e) {
    const raw = String((e && e.message) || e || 'unknown');
    const rls = /permission denied|row-level security|JWT|not authenticated/i.test(raw);
    if (rls && _cloudSignedOut()) return 'You are signed out — cloud features need a sign-in. Your work is still saved locally.';
    if (rls) return 'Cloud permissions refused this request — your work is still saved locally. If this persists, contact support.';
    return raw;
}
function _signedOutCloudHtml(what) {
    return '<div style="padding:18px;text-align:center;">' +
        '<div style="color:var(--color-text-secondary);margin-bottom:10px;">You are signed out — sign in to ' + esc(what || 'use cloud features') + '. Your work is still saved locally.</div>' +
        '<button class="action-btn btn-cyan" onclick="try{connectWorkspace()}catch(_){try{openSignupModal()}catch(__){}}">Sign in</button>' +
        '</div>';
}
// 31 Aug 2026 — bank the CURRENT in-memory state before any path that may
// replace it. Two layers, both best-effort and non-fatal: the single-slot
// autosave (synchronous localStorage mirror — survives the next few seconds)
// and a FORCED recovery-ring generation (survives the session; the ring's
// 5-minute throttle is bypassed the same way ringRestore bypasses it, because
// a conflict prompt is exactly the moment the throttle must not win).
function _bankWorkingState() {
    try { if (typeof _writeAutosave === 'function') _writeAutosave(); } catch (_) {}
    try {
        if (typeof window !== 'undefined') {
            if (typeof window._ringCaptureForce === 'function') window._ringCaptureForce();
            else if (typeof window._ringCapture === 'function') window._ringCapture();
        }
    } catch (_) {}
}

// ---------------------------------------------------------------------------
// ONE place that answers "may this project's content leave for the cloud?"
//
// 5 Sep 2026. The 5 Sep audit found FIVE separate ITAR fences and only one of
// them worked. The two in crdt_sync/presence were fixed earlier tonight; these
// are the paths that had no fence at all. They are written as ONE function
// deliberately: five hand-copied checks is how you end up with five different
// answers, which is exactly the state the audit found.
//
// WHY IT IS PHRASED AS "THE DESTINATION", NOT "IS THIS ITAR" (Waqas, 5 Sep):
// "save to the user/customer cloud, in our instance it will be our own cloud,
// for them its their server etc." Saving a controlled project is not wrong in
// itself — sending it to a destination not approved for controlled data is.
// Today there is exactly ONE destination, Safety Lab's shared multi-tenant
// cloud, hard-coded in three places, and Waqas has ruled that tier is "just for
// trial and demos and for our internal use". So a controlled project has no
// business there and this returns a reason. When the customer-hosted build
// lands and the destination becomes configurable, THIS FUNCTION is where
// "approved for controlled data" gets answered — the call sites do not change.
//
// Reads the bare identifier, never window.projectConfig: these are classic
// scripts sharing one global lexical scope, so the window property is
// permanently undefined — that is precisely what made two of the five fences
// dead code for weeks.
function _slCloudBlockedForControlled(snap) {
    try {
        var pc = (snap && snap.projectConfig)
              || (typeof projectConfig !== 'undefined' ? projectConfig : null);
        if (!pc) return 'the project configuration could not be read';   // fail CLOSED
        if (pc.isITARControlled) return 'this project is marked export-controlled';
        return null;
    } catch (_) { return 'the project configuration could not be read'; } // fail CLOSED
}
var _slControlledNoticeShown = false;
function _slControlledCloudNotice(reason, action) {
    var msg = 'Cloud ' + (action || 'save') + ' is off because ' + reason +
              '. This project stays on this machine — use export to move it.';
    try { console.info('[controlled] ' + msg); } catch (_) {}
    if (_slControlledNoticeShown) return;
    _slControlledNoticeShown = true;
    try { if (typeof showToast === 'function') showToast(msg, 'info', 7000); } catch (_) {}
}
try {
    if (typeof window !== 'undefined') {
        window.SLControlled = {
            blocksCloud: function (snap) { return _slCloudBlockedForControlled(snap); },
            notice:      function (reason, action) { return _slControlledCloudNotice(reason, action); }
        };
    }
} catch (_) {}

async function saveProjectToCloud() {
    // 5 Sep 2026 — the manual Save was deliberately left OUT of the 30 Aug
    // autosave fence, on the reasoning that it is "a deliberate user act". That
    // reasoning does not survive the destination framing: a deliberate act aimed
    // at a destination not approved for the data is still the wrong destination,
    // and the user is not told where their document text is going.
    var _blocked = _slCloudBlockedForControlled(null);
    if (_blocked) { _slControlledCloudNotice(_blocked, 'save'); return false; }
    // 3 Sep 2026 — the write itself lives in cloud_writer.js (the ONE writer of
    // project_documents; Waqas: "yes on 1", consolidate). This function keeps the
    // manual-save POLICY — the sign-in / workspace guards and their toasts,
    // provisioning through the shared lock, the projects row refresh, the success
    // toast — and hands the writer a prepare() that runs INSIDE its serialized run,
    // so the snapshot is fresh. The queue, the version token, the conditional
    // UPDATE, bank-then-ask, the lock-breach audit and the tab-lease gate are the
    // writer's. Resolves true when a write that includes this tab's state landed.
    const W = (typeof SLCloudWriter !== 'undefined') ? SLCloudWriter : ((typeof window !== 'undefined' && window.SLCloudWriter) ? window.SLCloudWriter : null);
    if (!W) {
        console.error('[Safety Lab Aero] cloud_writer.js is not loaded — cloud save skipped; the local save is safe.');
        if (typeof showToast === 'function') showToast('Cloud save unavailable (writer not loaded) — your work is still saved locally.', 'warning', 5000);
        return false;
    }
    let name = 'Untitled Project';
    const prepare = async function () {
        const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
        if (!client || _cloudSignedOut()) {
            if (typeof showToast === 'function') showToast('Sign in to save to cloud — your work is still saved locally.', 'warning', 4500);
            else alert('Sign in to save to cloud.');
            return null;
        }
        const wsId = getActiveWorkspaceId();
        if (!wsId) {
            if (typeof showToast === 'function') showToast('No active workspace selected.', 'warning', 4000);
            return null;
        }
        const userId = _supabaseSession && _supabaseSession.user && _supabaseSession.user.id;
        if (!userId) {
            if (typeof showToast === 'function') showToast('Session expired — please sign in again.', 'warning', 4000);
            return null;
        }
        const snapshot = _buildProjectSnapshot();
        name = (typeof projectName !== 'undefined' && projectName) ? projectName : 'Untitled Project';
        const certBasis = (snapshot.projectConfig && snapshot.projectConfig.regulation) || null;
        let projectId = _activeCloudProjectId;
        if (!projectId) {
            // First save — provision through the shared lock, never inline, so two
            // concurrent saves cannot each mint a row.
            projectId = await _ensureCloudProject(client, wsId, name, certBasis, userId);
        } else {
            // Existing project — update name + cert basis.
            await client.from('projects').update({ name, cert_basis: certBasis, updated_at: new Date().toISOString() }).eq('id', projectId);
        }
        return { client, projectId, userId, snapshot };
    };
    const r = await W.write({ mode: 'manual', prepare });
    if (r && r.ok) {
        if (typeof showToast === 'function') showToast('Saved to cloud: ' + name, 'success', 4000);
        return true;
    }
    if (r && r.reason === 'error') {
        console.error('[Safety Lab Aero] saveProjectToCloud failed:', r.error);
        if (typeof showToast === 'function') showToast('Cloud save failed: ' + _cloudErrText(r.error), 'warning', 5000);
    }
    // 'cancelled' (the engineer chose the cloud copy), 'lease' (another tab is active)
    // and 'skipped' (a guard above already spoke) have said their piece.
    return false;
}

// ===== H-7 — project archive / restore (31 Aug 2026) =========================
// Before this, a customer could not retire a project at all: nothing client-side
// ever set projects.deleted_at, even though projects_member_read has always
// filtered on it. The machinery existed and nothing used it.
//
// RULED BY WAQAS: admin/owner only, and ARCHIVE (reversible) rather than delete.
// Enforced in three places, deliberately, because only the last one is real:
//   · this UI hides the controls from anyone who cannot use them;
//   · archive_project / restore_project / archived_projects are SECURITY DEFINER
//     and re-check can_admin_workspace themselves;
//   · a BEFORE UPDATE trigger on projects refuses ANY change to deleted_at from a
//     non-admin browser session, so bypassing these functions changes nothing.
// Proven live on 31 Aug against a real editor membership (rolled back): the
// direct update raises, the RPC raises 42501, and the same editor's ordinary
// name edit on the same row still succeeds — the guard is scoped to deleted_at,
// not a blanket block on editors.
function _canAdminActiveWorkspace() {
    try {
        const r = (typeof getActiveWorkspace === 'function' ? (getActiveWorkspace() || {}) : {}).myRole || '';
        return r === 'owner' || r === 'admin';
    } catch (_) { return false; }
}

async function archiveCloudProject(projectId, projectName) {
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    if (!client || !projectId) return;
    // Reversible, and the wording says so — an irreversible-sounding prompt for a
    // reversible action trains people to fear the button.
    if (typeof window.confirm === 'function' &&
        !window.confirm('Archive "' + (projectName || 'this project') + '"?\n\nIt disappears from this list and from everyone else in the workspace. Nothing is deleted — an owner or admin can restore it from "Show archived".')) return;
    try {
        const { data, error } = await client.rpc('archive_project', { p_project: projectId });
        if (error) throw error;
        if (typeof showToast === 'function') {
            showToast(data && data.already_archived ? 'That project was already archived.' : 'Archived. Restore it any time from Show archived.', 'success', 5000);
        }
        if (typeof openProjectFromCloud === 'function') await openProjectFromCloud();
        const list = document.getElementById('cloud-archived-list');
        if (list && list.style.display !== 'none') await _renderArchivedProjects();
    } catch (e) {
        console.error('[Safety Lab Aero] archive_project failed:', e);
        if (typeof showToast === 'function') showToast('Archive failed: ' + _cloudErrText(e), 'warning', 6000);
    }
}

async function restoreCloudProject(projectId, projectName) {
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    if (!client || !projectId) return;
    try {
        const { data, error } = await client.rpc('restore_project', { p_project: projectId });
        if (error) throw error;
        if (typeof showToast === 'function') {
            showToast(data && data.already_active ? 'That project was already active.' : 'Restored "' + (projectName || 'project') + '".', 'success', 5000);
        }
        if (typeof openProjectFromCloud === 'function') await openProjectFromCloud();
        await _renderArchivedProjects();
    } catch (e) {
        console.error('[Safety Lab Aero] restore_project failed:', e);
        if (typeof showToast === 'function') showToast('Restore failed: ' + _cloudErrText(e), 'warning', 6000);
    }
}

// Collapse + EMPTY. Called whenever the modal (re)opens, so the panel can never
// carry another workspace's rows across a switch. Emptying matters as much as
// hiding: a hidden stale list is still stale the moment someone expands it.
function _resetArchivedProjectsPanel() {
    const list = document.getElementById('cloud-archived-list');
    const btn  = document.getElementById('cloud-archived-toggle');
    if (list) { list.style.display = 'none'; list.innerHTML = ''; }
    if (btn) btn.textContent = 'Show archived';
}

async function toggleArchivedProjects() {
    const list = document.getElementById('cloud-archived-list');
    const btn  = document.getElementById('cloud-archived-toggle');
    if (!list) return;
    const showing = list.style.display !== 'none';
    list.style.display = showing ? 'none' : 'block';
    if (btn) btn.textContent = showing ? 'Show archived' : 'Hide archived';
    if (!showing) await _renderArchivedProjects();
}

// An archived project is invisible to an ordinary select (projects_member_read
// filters deleted_at), which is the point — so the list comes from a definer-side
// RPC. CAPPED: this workspace already holds 354 archived rows on 31 Aug, and a
// 354-row wall of "Untitled Project" is not a list, it is a scroll.
const _ARCHIVED_CAP = 100;
async function _renderArchivedProjects() {
    const list = document.getElementById('cloud-archived-list');
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    if (!list) return;
    if (!client) { list.innerHTML = _signedOutCloudHtml('see archived projects'); return; }
    const wsId = (typeof getActiveWorkspaceId === 'function') ? getActiveWorkspaceId() : null;
    if (!wsId) { list.innerHTML = '<div style="padding:12px;color:var(--color-text-tertiary);font-style:italic;">No active workspace.</div>'; return; }
    list.innerHTML = 'Loading&hellip;';
    try {
        const { data, error } = await client.rpc('archived_projects', { p_workspace: wsId });
        if (error) throw error;
        const rows = Array.isArray(data) ? data : [];
        if (!rows.length) {
            list.innerHTML = '<div style="padding:12px;color:var(--color-text-tertiary);font-style:italic;">Nothing archived in this workspace.</div>';
            return;
        }
        const shown = rows.slice(0, _ARCHIVED_CAP);
        list.innerHTML =
            '<div style="font-size:11px;color:var(--color-text-tertiary);padding:0 2px 8px;">' +
                esc(String(rows.length)) + ' archived' +
                (rows.length > shown.length ? ' — showing the ' + shown.length + ' most recently archived' : '') +
            '</div>' +
            shown.map(p => {
                const when = p.deleted_at ? new Date(p.deleted_at).toLocaleString() : '—';
                const nm = (p.name || 'Untitled Project');
                return '<div style="padding:10px 12px;border-bottom:1px solid var(--color-border-hair);display:flex;justify-content:space-between;align-items:center;gap:12px;opacity:.75;">' +
                    '<div style="flex:1;min-width:0;">' +
                        '<div style="font-weight:600;color:var(--color-text-primary);">' + esc(nm) + '</div>' +
                        '<div style="font-size:11px;color:var(--color-text-tertiary);margin-top:2px;">archived ' + esc(when) + '</div>' +
                    '</div>' +
                    '<button class="action-btn" onclick="restoreCloudProject(\'' + esc(p.id) + '\', \'' + esc(String(nm).replace(/'/g, "\\'")) + '\')">Restore</button>' +
                '</div>';
            }).join('');
    } catch (e) {
        console.error('[Safety Lab Aero] archived_projects failed:', e);
        list.innerHTML = '<div style="padding:12px;color:var(--color-danger);">Failed to load archived projects: ' + esc(_cloudErrText(e)) + '</div>';
    }
}

async function openProjectFromCloud() {
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    if (!client) {
        if (typeof showToast === 'function') showToast('Sign in to open from cloud.', 'warning', 4000);
        return;
    }
    const wsId = getActiveWorkspaceId();
    if (!wsId) {
        if (typeof showToast === 'function') showToast('No active workspace selected.', 'warning', 4000);
        return;
    }
    const m = document.getElementById('cloud-projects-modal');
    if (!m) return;
    m.style.display = 'flex';
    setTimeout(() => m.classList.add('show'), 10);
    if (_cloudSignedOut()) {   // signed-out is a state, not a fetch error
        const soList = document.getElementById('cloud-projects-list');
        if (soList) soList.innerHTML = _signedOutCloudHtml('see your cloud projects');
        return;
    }
    // Header workspace name.
    const wsName = (getActiveWorkspace() || {}).name || '—';
    const wsLabel = document.getElementById('cloud-projects-workspace');
    if (wsLabel) wsLabel.textContent = wsName;
    // Load list.
    const list = document.getElementById('cloud-projects-list');
    if (list) list.innerHTML = 'Loading…';
    try {
        const { data, error } = await client
            .from('projects')
            .select('id, name, cert_basis, updated_at, created_at')
            .eq('workspace_id', wsId)
            .is('deleted_at', null)
            .order('updated_at', { ascending: false });
        if (error) throw error;
        // H-7 — the archive section exists only for someone who can act on it, and
        // is revealed BEFORE the empty-list return: a workspace whose live list is
        // empty is exactly the one where something needs restoring.
        const arcWrap = document.getElementById('cloud-archived-wrap');
        if (arcWrap) arcWrap.style.display = _canAdminActiveWorkspace() ? 'block' : 'none';
        // ...and it opens COLLAPSED AND EMPTY every time. Found live on the deployed
        // build 31 Aug: with the list left expanded, switching workspace re-rendered the
        // LIVE list but not this one, so the panel showed the previous workspace's
        // archived projects under a header naming the new one — "Nothing archived" for a
        // workspace holding 354, and 354 rows of another workspace's history here.
        // Re-rendering instead would still flash the stale list first; collapsing means
        // there is never a wrong list on screen, and the toggle re-fetches on the way open.
        _resetArchivedProjectsPanel();
        if (!data || !data.length) {
            if (list) list.innerHTML = '<div style="padding: 16px; color: var(--color-text-tertiary); font-style: italic;">No projects in this workspace yet. Save your current project to cloud to start.</div>';
            return;
        }
        if (list) {
            list.innerHTML = data.map(p => {
                const date = p.updated_at ? new Date(p.updated_at).toLocaleString() : '—';
                return '<div class="cloud-project-row" style="padding: 12px 14px; border-bottom: 1px solid var(--color-border-hair); display: flex; justify-content: space-between; align-items: center; gap: 12px; cursor: pointer;" onclick="_loadCloudProject(\'' + esc(p.id) + '\')">' +
                    '<div style="flex: 1; min-width: 0;">' +
                        '<div style="font-weight: 600; color: var(--color-text-primary);">' + esc(p.name) + '</div>' +
                        '<div style="font-size: 11px; color: var(--color-text-tertiary); margin-top: 2px;">' + esc(p.cert_basis || 'No cert basis') + ' · updated ' + esc(date) + '</div>' +
                    '</div>' +
                    '<button class="action-btn btn-cyan" onclick="event.stopPropagation(); _loadCloudProject(\'' + esc(p.id) + '\')">Open</button>' +
                    // H-7 — archive is admin/owner only (Waqas's ruling). The button is
                    // not rendered at all below that: archive_project refuses an editor
                    // anyway, and a control that always errors is worse than no control.
                    (_canAdminActiveWorkspace()
                        ? '<button class="action-btn" title="Archive this project" onclick="event.stopPropagation(); archiveCloudProject(\'' + esc(p.id) + '\', \'' + esc((p.name || '').replace(/'/g, "\\'")) + '\')">Archive</button>'
                        : '') +
                '</div>';
            }).join('');
        }
    } catch (e) {
        console.error('[Safety Lab Aero] list cloud projects failed:', e);
        if (list) list.innerHTML = '<div style="padding: 16px; color: var(--color-danger);">Failed to load: ' + esc(_cloudErrText(e)) + '</div>';
    }
}

async function _renderVersionHistory() {
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    const body = document.getElementById('vh-body');
    if (!client || !body) return;
    const projectId = _activeCloudProjectId;
    if (!projectId) return;
    if (_cloudSignedOut()) { body.innerHTML = _signedOutCloudHtml('see version history'); return; }
    body.innerHTML = 'Loading&hellip;';
    try {
        // 21 Aug 2026 — the saves list is the server's sl_recovery_points(): live +
        // archived rows with authored-item counts (public.sl_doc_items) and byte
        // sizes, newest first. The item count is what tells a user WHICH snapshot
        // still holds their work; version alone cannot.
        const [revRes, saveRes] = await Promise.all([
            client.from('project_baselines').select('id, version_no, label, note, status, created_at, created_by').eq('project_id', projectId).order('version_no', { ascending: false }),
            client.rpc('sl_recovery_points', { p_project: projectId })
        ]);
        if (revRes.error) throw revRes.error;
        if (saveRes.error) throw saveRes.error;
        const revisions = revRes.data || [];
        const saves = (saveRes.data || []).slice(0, 101);   // live row + latest 100 archives
        // Resolve emails for everyone referenced, in one query.
        const ids = Array.from(new Set([].concat(revisions.map(r => r.created_by), saves.map(s => s.saved_by)).filter(Boolean)));
        const emailMap = {};
        if (ids.length) {
            const { data: us } = await client.from('users').select('id, email').in('id', ids);
            (us || []).forEach(u => { emailMap[u.id] = u.email; });
        }
        const who = id => (id && emailMap[id]) ? emailMap[id] : '—';
        const when = ts => ts ? new Date(ts).toLocaleString() : '—';

        let html = '';
        html += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-tertiary);margin:12px 0 6px;">Revisions</div>';
        if (!revisions.length) {
            html += '<div style="padding:6px 0;color:var(--color-text-tertiary);font-style:italic;font-size:13px;">No revisions yet. Use &ldquo;Create revision&rdquo; to cut Rev 1.</div>';
        } else {
            html += revisions.map(r => {
                const badge = '<span style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;padding:2px 6px;border-radius:10px;background:var(--color-surface-2,#eef);color:var(--color-text-secondary);">' + esc(r.status || 'draft') + '</span>';
                return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--color-border-hair);">' +
                    '<div style="font-weight:700;min-width:54px;">Rev ' + esc(String(r.version_no)) + '</div>' +
                    '<div style="flex:1;min-width:0;">' +
                        '<div style="font-size:13px;">' + esc(r.label || '(no label)') + '</div>' +
                        (r.note ? '<div style="font-size:11px;color:var(--color-text-tertiary);">' + esc(r.note) + '</div>' : '') +
                        '<div style="font-size:11px;color:var(--color-text-tertiary);">' + esc(who(r.created_by)) + ' &middot; ' + esc(when(r.created_at)) + '</div>' +
                    '</div>' +
                    '<div>' + badge + '</div>' +
                    '<button type="button" class="action-btn" onclick="_revDiffOpen(\'' + esc(String(r.id)) + '\')" style="white-space:nowrap;" title="DIF-1 — identity-matched delta between this sealed revision and the working copy: trees, FHA, requirements, assumptions, engine P(top) changes.">&#916; Diff</button>' +
                    '<button type="button" class="action-btn" onclick="_replayVerifyRevision(\'' + esc(String(r.id)) + '\')" style="white-space:nowrap;" title="ASR-1 — verify this revision: sha256 integrity + every bottom-up tree re-derived through the engine and compared to the recorded values (1e-12 rel). Result is journaled.">&#10227; Verify</button>' +
                    '<button type="button" class="action-btn" onclick="restoreRevision(\'' + esc(String(r.id)) + '\')" style="white-space:nowrap;">Restore</button>' +
                '</div>';
            }).join('');
        }
        html += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-tertiary);margin:18px 0 6px;">Every save' + (saves.length >= 101 ? ' (latest 100)' : '') + '</div>';
        if (!saves.length) {
            html += '<div style="padding:6px 0;color:var(--color-text-tertiary);font-style:italic;font-size:13px;">No saves recorded yet. Saving to cloud starts the history.</div>';
        } else {
            const kb = b => (b == null) ? '' : (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
            html += saves.map(s => {
                const isLive = s.kind === 'live';
                const itemsTxt = (s.items == null) ? '' : (s.items + ' item' + (s.items === 1 ? '' : 's'));
                return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--color-border-hair);">' +
                    '<div style="min-width:54px;color:var(--color-text-tertiary);font-size:12px;">v' + esc(String(s.version)) + '</div>' +
                    '<div style="min-width:96px;font-size:12px;font-weight:600;color:var(--color-text-secondary);" title="Authored items in this snapshot (rows you created — uploads and config are not counted)">' + esc(itemsTxt) + '</div>' +
                    '<div style="min-width:56px;font-size:11px;color:var(--color-text-tertiary);">' + esc(kb(s.bytes)) + '</div>' +
                    '<div style="flex:1;min-width:0;font-size:12px;color:var(--color-text-secondary);">' + esc(who(s.saved_by)) + '</div>' +
                    '<div style="font-size:11px;color:var(--color-text-tertiary);white-space:nowrap;">' + esc(when(s.saved_at)) + '</div>' +
                    (isLive
                        ? '<span style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;padding:2px 8px;border-radius:10px;background:#1a8f3c22;color:#1a8f3c;font-weight:600;white-space:nowrap;">current</span>'
                        : '<button type="button" class="action-btn" onclick="restoreSavedVersion(' + esc(String(s.version)) + ')" style="white-space:nowrap;">Restore</button>') +
                '</div>';
            }).join('');
        }
        body.innerHTML = html;
    } catch (e) {
        console.error('[Safety Lab Aero] version history failed:', e);
        body.innerHTML = '<div style="padding:12px;color:var(--color-danger);">Failed to load history: ' + esc(_cloudErrText(e)) + '</div>';
    }
}

async function _emailsForIds(client, ids) {
    const map = {};
    const uniq = Array.from(new Set((ids || []).filter(Boolean)));
    if (!uniq.length) return map;
    try {
        const { data } = await client.from('users').select('id, email').in('id', uniq);
        (data || []).forEach(u => { map[u.id] = u.email; });
    } catch (_) { /* non-fatal */ }
    return map;
}

function _rvStatusBadge(status) {
    const colors = { draft:'#888', in_review:'#1144ee', changes_requested:'#c47f00', approved:'#1a8f3c', released:'#0a8f6a', rejected:'#c0392b', withdrawn:'#888' };
    const c = colors[status] || '#888';
    return '<span style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;padding:2px 8px;border-radius:10px;background:' + c + '22;color:' + c + ';font-weight:600;white-space:nowrap;">' + esc((status || '').replace(/_/g, ' ')) + '</span>';
}

function openReviewsPanel() {
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    if (!client) { if (typeof showToast === 'function') showToast('Sign in to manage reviews.', 'warning', 4000); return; }
    const old = document.getElementById('reviews-panel'); if (old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'reviews-panel';
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;background:rgba(8,12,20,.55);backdrop-filter:blur(2px);padding:24px;';
    ov.innerHTML =
        '<div style="background:var(--color-surface-1,#fff);color:var(--color-text-primary,#111);border-radius:12px;max-width:720px;width:100%;max-height:86vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,.3);">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--color-border-hair);">' +
                '<div style="font-weight:700;font-size:15px;">Reviews &amp; approvals</div>' +
                '<button type="button" aria-label="Close" onclick="closeReviewsPanel()" style="border:none;background:transparent;font-size:20px;line-height:1;cursor:pointer;color:var(--color-text-tertiary);">&times;</button>' +
            '</div>' +
            '<div id="rv-body" style="overflow:auto;padding:14px 18px 18px;">Loading&hellip;</div>' +
        '</div>';
    ov.addEventListener('click', function(e) { if (e.target === ov) closeReviewsPanel(); });
    document.body.appendChild(ov);
    if (!_activeCloudProjectId) {
        const body = document.getElementById('rv-body');
        if (body) body.innerHTML = '<div style="padding:16px;color:var(--color-text-tertiary);font-style:italic;">Save this project to cloud first — reviews attach to a cloud project.</div>';
        return;
    }
    _renderReviewsList();
}

async function openReviewDetail(reviewId) {
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    const body = document.getElementById('rv-body');
    if (!client || !body || !reviewId) return;
    body.innerHTML = 'Loading&hellip;';
    try {
        const [revRes, asgRes, comRes, soRes] = await Promise.all([
            client.from('reviews').select('id, title, status, requested_by, created_at').eq('id', reviewId).maybeSingle(),
            client.from('review_assignments').select('id, user_id, role, decision').eq('review_id', reviewId),
            client.from('review_comments').select('id, body, author, created_at').eq('review_id', reviewId).order('created_at', { ascending: true }),
            client.from('signoffs').select('id, signer_user_id, signer_email, role_at_signing, decision, meaning, baseline_sha256, ts').eq('review_id', reviewId).order('id', { ascending: true })
        ]);
        if (revRes.error) throw revRes.error;
        const review = revRes.data;
        if (!review) { body.innerHTML = '<div style="padding:12px;color:var(--color-text-tertiary);">Review not found.</div>'; return; }
        const assignments = asgRes.data || [];
        const comments = comRes.data || [];
        const signoffs = soRes.data || [];
        const emailMap = await _emailsForIds(client, [].concat([review.requested_by], assignments.map(a => a.user_id), comments.map(c => c.author), signoffs.map(s => s.signer_user_id)));
        // Current analysis fingerprint — a signature whose baseline differs is "superseded".
        let _rvCurrentHash = null;
        try { _rvCurrentHash = await _canonicalHash(_buildProjectSnapshot()); } catch (_) { /* best-effort */ }
        const myId = _supabaseSession && _supabaseSession.user && _supabaseSession.user.id;
        const iAmAssignee = assignments.some(a => a.user_id === myId);
        const iAmRequester = review.requested_by === myId;
        const active = ['in_review', 'changes_requested'].indexOf(review.status) !== -1;

        let html = '<div style="margin-bottom:10px;"><span onclick="_renderReviewsList()" style="cursor:pointer;font-size:12px;color:var(--color-accent,#1144ee);">&larr; All reviews</span></div>';
        html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;"><div style="font-weight:700;font-size:15px;flex:1;min-width:0;">' + esc(review.title || '(untitled)') + '</div>' + _rvStatusBadge(review.status) + '</div>';
        html += '<div style="font-size:11px;color:var(--color-text-tertiary);margin-bottom:14px;">requested by ' + esc(emailMap[review.requested_by] || '—') + '</div>';

        html += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-tertiary);margin-bottom:6px;">Assignees</div>';
        if (!assignments.length) html += '<div style="font-size:12px;color:var(--color-text-tertiary);font-style:italic;margin-bottom:14px;">No reviewers assigned.</div>';
        else html += '<div style="margin-bottom:14px;">' + assignments.map(a =>
            '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13px;">' +
                '<div style="flex:1;min-width:0;">' + esc(emailMap[a.user_id] || '—') + ' <span style="color:var(--color-text-tertiary);font-size:11px;">' + esc(a.role) + '</span></div>' +
                '<div style="font-size:11px;text-transform:uppercase;color:' + (a.decision === 'approved' ? '#1a8f3c' : a.decision === 'rejected' ? '#c0392b' : 'var(--color-text-tertiary)') + ';">' + esc(a.decision || 'pending') + '</div>' +
            '</div>').join('') + '</div>';

        if (iAmAssignee && active) {
            html += '<div style="display:flex;gap:8px;margin-bottom:14px;">' +
                '<button type="button" class="action-btn btn-cyan" onclick="recordMyReviewDecision(\'' + esc(reviewId) + '\',\'approved\')">Approve</button>' +
                '<button type="button" class="action-btn" onclick="recordMyReviewDecision(\'' + esc(reviewId) + '\',\'rejected\')">Request changes</button>' +
            '</div>';
        }

        if (iAmRequester) {
            html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">';
            if (active) {
                html += '<button type="button" class="action-btn btn-cyan" onclick="setReviewStatus(\'' + esc(reviewId) + '\',\'approved\')">Mark approved</button>';
                html += '<button type="button" class="action-btn" onclick="setReviewStatus(\'' + esc(reviewId) + '\',\'changes_requested\')">Request changes</button>';
            }
            if (review.status === 'approved') html += '<button type="button" class="action-btn btn-cyan" onclick="setReviewStatus(\'' + esc(reviewId) + '\',\'released\')">Release</button>';
            if (['in_review', 'changes_requested', 'approved'].indexOf(review.status) !== -1) html += '<button type="button" class="action-btn" onclick="setReviewStatus(\'' + esc(reviewId) + '\',\'withdrawn\')">Withdraw</button>';
            html += '</div>';
        }

        if (iAmAssignee || iAmRequester) {
            html += '<div style="margin-bottom:14px;"><button type="button" class="action-btn btn-cyan" onclick="openSignoffModal(\'' + esc(reviewId) + '\')">&#9998; Sign off&hellip;</button></div>';
        }
        html += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-tertiary);margin-bottom:6px;">Signatures</div>';
        if (!signoffs.length) {
            html += '<div style="font-size:12px;color:var(--color-text-tertiary);font-style:italic;margin-bottom:14px;">No signatures yet.</div>';
        } else {
            html += '<div style="margin-bottom:8px;">' + signoffs.map(function(s) {
                var stale = _rvCurrentHash && s.baseline_sha256 && s.baseline_sha256 !== _rvCurrentHash;
                return '<div style="padding:6px 0;border-bottom:1px solid var(--color-border-hair);font-size:12px;">' +
                    '<span style="color:' + (s.decision === 'approve' ? '#1a8f3c' : '#c0392b') + ';font-weight:600;text-transform:uppercase;">' + esc(s.decision) + '</span> &middot; ' +
                    esc(s.signer_email || emailMap[s.signer_user_id] || '—') + ' <span style="color:var(--color-text-tertiary);">(' + esc(s.role_at_signing) + ')</span>' +
                    (stale ? ' <span style="background:#c47f0022;color:#c47f00;font-size:10px;font-weight:600;text-transform:uppercase;padding:1px 6px;border-radius:8px;">superseded</span>' : '') +
                    (s.meaning ? '<div style="color:var(--color-text-tertiary);font-size:11px;">' + esc(s.meaning) + '</div>' : '') +
                    (stale ? '<div style="color:#c47f00;font-size:10px;">Analysis has changed since this signature &mdash; re-approval needed.</div>' : '') +
                    '<div style="color:var(--color-text-tertiary);font-size:10px;font-family:monospace;">&#9939; ' + esc((s.baseline_sha256 || '').slice(0, 16)) + '&hellip; &middot; ' + esc(s.ts ? new Date(s.ts).toLocaleString() : '') + '</div>' +
                '</div>';
            }).join('') + '</div>';
            html += '<div style="margin-bottom:14px;display:flex;gap:16px;flex-wrap:wrap;">' +
                '<span onclick="openSignatureCertificate(\'' + esc(reviewId) + '\')" style="cursor:pointer;font-size:12px;color:var(--color-accent,#1144ee);">View signature certificate &rarr;</span>' +
                '<span onclick="verifySignoffLedger()" style="cursor:pointer;font-size:12px;color:var(--color-accent,#1144ee);">Verify ledger integrity</span>' +
                '</div>';
        }
        html += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-tertiary);margin-bottom:6px;">Comments</div>';
        html += '<div style="margin-bottom:10px;">' + (comments.length ? comments.map(c =>
            '<div style="padding:8px 0;border-bottom:1px solid var(--color-border-hair);">' +
            '<div style="font-size:11px;color:var(--color-text-tertiary);margin-bottom:2px;">' + esc(emailMap[c.author] || '—') + ' &middot; ' + esc(c.created_at ? new Date(c.created_at).toLocaleString() : '') + '</div>' +
            '<div style="font-size:13px;white-space:pre-wrap;">' + esc(c.body) + '</div></div>'
        ).join('') : '<div style="font-size:12px;color:var(--color-text-tertiary);font-style:italic;">No comments yet.</div>') + '</div>';
        html += '<div style="display:flex;gap:8px;"><input id="rv-comment" type="text" placeholder="Add a comment&hellip;" style="flex:1;padding:8px;border:1px solid var(--color-border-hair);border-radius:6px;font:inherit;box-sizing:border-box;"><button type="button" class="action-btn" onclick="addReviewComment(\'' + esc(reviewId) + '\')">Post</button></div>';

        body.innerHTML = html;
    } catch (e) {
        console.error('[Safety Lab Aero] review detail failed:', e);
        body.innerHTML = '<div style="padding:12px;color:var(--color-danger);">Failed to load review: ' + esc(e.message || 'unknown') + '</div>';
    }
}

async function _renderWorkspaceMembers() {
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    const list = document.getElementById('ws-members-list');
    if (!client || !list) return;
    const wsId = getActiveWorkspaceId();
    if (!wsId) { list.innerHTML = ''; return; }
    list.innerHTML = 'Loading…';
    try {
        const { data, error } = await client
            .from('workspace_members')
            .select('user_id, role, joined_at, users:users!inner(email)')
            .eq('workspace_id', wsId);
        if (error) throw error;
        if (!data || !data.length) { list.innerHTML = '<div style="padding: 8px; color: var(--color-text-tertiary); font-style: italic;">No members yet.</div>'; return; }
        const myId = _supabaseSession && _supabaseSession.user && _supabaseSession.user.id;
        const myRole = (getActiveWorkspace() || {}).myRole || '';
        const canManage = (myRole === 'owner' || myRole === 'admin');
        const ROLES = ['admin', 'editor', 'reviewer', 'viewer'];   // owner transfer is a separate flow
        list.innerHTML = data.map(m => {
            const email = (m.users && m.users.email) || '(unknown)';
            const role = m.role || '—';
            const joined = m.joined_at ? new Date(m.joined_at).toLocaleDateString() : '—';
            const isSelf = m.user_id === myId;
            const isOwnerRow = role === 'owner';
            const editable = canManage && !isOwnerRow && !isSelf;  // never change the owner or yourself
            const roleCell = editable
                ? '<select onchange="updateWorkspaceMemberRole(\'' + esc(m.user_id) + '\', this.value)" style="font-size: 11px; padding: 3px 6px; border: 1px solid var(--color-border-hair); border-radius: 6px; background: var(--color-surface-1, #fff); color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.04em;">'
                    + ROLES.map(r => '<option value="' + r + '"' + (r === role ? ' selected' : '') + '>' + r + '</option>').join('')
                    + '</select>'
                : '<span style="font-size: 11px; color: var(--color-text-tertiary); text-transform: uppercase; letter-spacing: 0.04em;">' + esc(role) + (isSelf ? ' · you' : '') + '</span>';
            const removeCell = editable
                ? '<button type="button" onclick="removeWorkspaceMember(\'' + esc(m.user_id) + '\')" title="Remove member" style="border: none; background: transparent; color: var(--color-danger); font-size: 11px; cursor: pointer; padding: 2px 4px;">Remove</button>'
                : '';
            return '<div style="display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--color-border-hair);">' +
                '<div style="flex: 1; font-size: 13px;">' + esc(email) + '</div>' +
                '<div style="min-width: 96px; text-align: right;">' + roleCell + '</div>' +
                '<div style="font-size: 11px; color: var(--color-text-tertiary); width: 92px; text-align: right;">joined ' + esc(joined) + '</div>' +
                '<div style="width: 56px; text-align: right;">' + removeCell + '</div>' +
            '</div>';
        }).join('');
    } catch (e) {
        console.error('[Safety Lab Aero] list members failed:', e);
        list.innerHTML = '<div style="padding: 8px; color: var(--color-danger);">Failed to load members: ' + esc(e.message || 'unknown') + '</div>';
    }
}

// ---------------------------------------------------------------------------
// INVITE ROWS. Several people are usually added at once — a new programme brings
// its safety leads in together, not one a week. Each row is an email + a role;
// "+ Add another" appends one; the batch sends on one click.
//
// Layout note, because it caused a real defect: .modal-body is a two-column grid
// and the global `input, select, textarea { width: 100% }` rule makes a <select>
// claim the whole flex row. An email input carrying `flex: 1` (basis 0) beside it
// collapsed to 20px and was invisible on screen — Waqas, 31 Aug: "where do I add
// more people". Hence the explicit basis on the input and `flex: 0 0 auto` on the
// select; do not reduce these to `flex: 1` again.
// ---------------------------------------------------------------------------
const WS_ROLES = ['editor', 'reviewer', 'viewer', 'admin'];

function wsAddInviteRow(email, role) {
    const host = document.getElementById('ws-invite-rows');
    if (!host) return null;
    const row = document.createElement('div');
    row.className = 'ws-inv-row';
    row.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-bottom: 8px;';
    const inputCss = 'flex: 1 1 260px; min-width: 180px; height: 34px; border-radius: var(--r-sm); border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text-primary); padding: 0 10px; font-size: 13px; margin-bottom: 0;';
    const selCss = 'flex: 0 0 auto; width: auto; min-width: 128px; height: 34px; border-radius: var(--r-sm); border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text-primary); padding: 0 8px; font-size: 13px; margin-bottom: 0;';
    row.innerHTML =
        '<input type="email" class="ws-inv-email" placeholder="teammate@company.com" style="' + inputCss + '">' +
        '<select class="ws-inv-role" style="' + selCss + '">' +
        WS_ROLES.map(function (r) { return '<option value="' + r + '">' + r.charAt(0).toUpperCase() + r.slice(1) + '</option>'; }).join('') +
        '</select>' +
        '<button type="button" class="ws-inv-del" title="Remove this row" style="flex: 0 0 auto; width: 28px; height: 34px; border: none; background: transparent; color: var(--color-text-tertiary); font-size: 17px; line-height: 1; cursor: pointer;">&times;</button>';
    host.appendChild(row);
    if (email) row.querySelector('.ws-inv-email').value = email;
    if (role) row.querySelector('.ws-inv-role').value = role;
    row.querySelector('.ws-inv-del').onclick = function () {
        row.remove();
        // Never leave the section with no way to type — re-seed an empty row.
        if (!host.querySelector('.ws-inv-row')) wsAddInviteRow();
    };
    return row;
}

function wsResetInviteRows() {
    const host = document.getElementById('ws-invite-rows');
    if (!host) return;
    host.innerHTML = '';
    wsAddInviteRow();
    const st = document.getElementById('ws-invite-status');
    if (st) st.textContent = '';
}

async function inviteWorkspaceMember() {
    // 31 Aug 2026 — THE BUTTON NOW DOES THE WHOLE JOB, FOR EVERY ROW.
    //
    // It previously inserted one row into public.invitations and stopped: no email
    // function existed, the table was READ NOWHERE, and no redemption path existed.
    // The click wrote a row into a table nothing consumed, under a success message
    // that said "(Email delivery via Resend ships in the next update.)" — calm grey
    // text a user reads as "sent". Now: insert -> notify-invite sends -> the
    // accept_invitation RPC redeems. THE STATUS LINE TELLS THE TRUTH about which of
    // those happened, per address.
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    const statusEl = document.getElementById('ws-invite-status');
    const btn = document.getElementById('ws-invite-btn');
    const say = (msg, kind) => {
        if (!statusEl) return;
        statusEl.innerHTML = msg;
        statusEl.style.color = kind === 'bad' ? 'var(--color-danger)'
                             : kind === 'warn' ? 'var(--sev-haz-fg, #c47100)'
                             : 'var(--color-text-secondary)';
    };
    const rows = Array.prototype.slice.call(document.querySelectorAll('#ws-invite-rows .ws-inv-row'));
    // Every early return below used to be SILENT — a click that did nothing at all,
    // which is exactly what a dead button looks like from the outside.
    if (!rows.length) { say('Add an email address first.', 'bad'); return; }
    if (!client) { say('Not connected to the cloud — sign in first.', 'bad'); return; }
    const wsId = getActiveWorkspaceId();
    if (!wsId) { say('No active workspace — open one first.', 'bad'); return; }
    const myRole = (typeof getActiveWorkspace === 'function' ? (getActiveWorkspace() || {}) : {}).myRole || '';
    if (myRole && myRole !== 'owner' && myRole !== 'admin') { say('Only a workspace owner or admin can invite.', 'bad'); return; }
    const userId = _supabaseSession && _supabaseSession.user && _supabaseSession.user.id;

    const wanted = [];
    for (const row of rows) {
        const email = (row.querySelector('.ws-inv-email').value || '').trim().toLowerCase();
        const role = row.querySelector('.ws-inv-role').value || 'editor';
        if (!email) continue;                                   // blank rows are simply skipped
        if (!/@[\w.-]+\.[a-z]{2,}$/i.test(email)) { say('Not a valid email address: ' + esc(email), 'bad'); return; }
        if (WS_ROLES.indexOf(role) === -1) { say('Unknown role for ' + esc(email) + '.', 'bad'); return; }
        if (wanted.some(w => w.email === email)) { say('Duplicate address in the list: ' + esc(email), 'bad'); return; }
        wanted.push({ email, role, row });
    }
    if (!wanted.length) { say('Enter at least one email address.', 'bad'); return; }

    if (btn) { btn.disabled = true; btn.textContent = 'Inviting…'; }
    say('Creating ' + wanted.length + ' invitation' + (wanted.length > 1 ? 's' : '') + '…');
    const sent = [], unmailed = [], failed = [];
    for (const w of wanted) {
        try {
            const token = (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2))).replace(/-/g, '');
            const { data: row, error } = await client
                .from('invitations')
                .insert({ workspace_id: wsId, email: w.email, role: w.role, token, invited_by: userId })
                .select('id').single();
            if (error) throw error;
            // The mail is a SEPARATE failure domain from the invitation. Keep them
            // separate in the reporting too — the invite is valid either way.
            let mailed = false, mailErr = '';
            try {
                const { data: fnData, error: fnErr } = await client.functions.invoke('notify-invite', { body: { invitation_id: row.id } });
                if (fnErr) mailErr = fnErr.message || 'send failed';
                else if (fnData && fnData.ok === false) mailErr = fnData.error || 'send failed';
                else mailed = true;
            } catch (e) { mailErr = (e && e.message) || 'send failed'; }
            if (mailed) { sent.push(w.email); w.row.remove(); }
            else unmailed.push({ email: w.email, err: mailErr, link: location.origin + location.pathname.replace(/\/$/, '') + '/?invite=' + encodeURIComponent(token) });
        } catch (e) {
            console.error('[Safety Lab Aero] invite failed:', e);
            const msg = (e && e.message) || 'unknown';
            failed.push({ email: w.email, err: /row-level security|permission/i.test(msg) ? 'only an owner or admin can invite' : msg });
        }
    }

    const parts = [];
    if (sent.length) parts.push('Emailed ' + sent.map(esc).join(', ') + '. Invitations expire in 14 days.');
    // Honest, and useful: hand over the link rather than pretending.
    if (unmailed.length) parts.push('<b>Created but not emailed</b> — pass the link on by hand:<br>' +
        unmailed.map(u => esc(u.email) + ' (' + esc(u.err) + ')<br><span style="font-family: var(--font-mono, monospace);">' + esc(u.link) + '</span>').join('<br>'));
    if (failed.length) parts.push('<b>Failed</b>: ' + failed.map(f => esc(f.email) + ' — ' + esc(f.err)).join('; '));
    say(parts.join('<br><br>'), failed.length ? 'bad' : (unmailed.length ? 'warn' : 'ok'));

    if (!document.querySelector('#ws-invite-rows .ws-inv-row')) wsAddInviteRow();
    if (btn) { btn.disabled = false; btn.textContent = 'Send invitations'; }
    try { await _renderPendingInvitations(); } catch (_) {}
}

// ---------------------------------------------------------------------------
// Outstanding invitations. Read through public.pending_invitations(), which is
// admin-gated server-side and DELIBERATELY does not return the token — a
// pending list that ships credentials to every admin's devtools is a broadcast,
// not a feature.
// ---------------------------------------------------------------------------
async function _renderPendingInvitations() {
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    const host = document.getElementById('ws-pending-invites');
    if (!host) return;
    const wsId = getActiveWorkspaceId();
    if (!client || !wsId) { host.innerHTML = ''; return; }
    try {
        const { data, error } = await client.rpc('pending_invitations', { p_workspace: wsId });
        if (error) throw error;
        if (!data || !data.length) {
            host.innerHTML = '<div style="padding: 6px 0; color: var(--color-text-tertiary); font-style: italic; font-size: 12px;">No invitations outstanding.</div>';
            return;
        }
        host.innerHTML = data.map(function (i) {
            const when = i.expires_at ? new Date(i.expires_at).toLocaleDateString() : '—';
            const state = i.expired
                ? '<span style="color: var(--color-danger); font-size: 11px;">expired ' + esc(when) + '</span>'
                : '<span style="color: var(--color-text-tertiary); font-size: 11px;">expires ' + esc(when) + '</span>';
            return '<div style="display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--color-border-hair);">' +
                '<div style="flex: 1; font-size: 13px;">' + esc(i.email) + '</div>' +
                '<div style="min-width: 74px; text-align: right; font-size: 11px; color: var(--color-text-tertiary); text-transform: uppercase; letter-spacing: 0.04em;">' + esc(i.role) + '</div>' +
                '<div style="width: 132px; text-align: right;">' + state + '</div>' +
                '<div style="width: 56px; text-align: right;"><button type="button" onclick="revokeInvitation(\'' + esc(i.id) + '\')" title="Revoke" style="border: none; background: transparent; color: var(--color-danger); font-size: 11px; cursor: pointer; padding: 2px 4px;">Revoke</button></div>' +
            '</div>';
        }).join('');
    } catch (e) {
        console.error('[Safety Lab Aero] pending invitations failed:', e);
        host.innerHTML = '<div style="padding: 6px 0; color: var(--color-danger); font-size: 12px;">Could not load pending invitations: ' + esc(e.message || 'unknown') + '</div>';
    }
}

async function revokeInvitation(id) {
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    const statusEl = document.getElementById('ws-invite-status');
    if (!client || !id) return;
    try {
        const { error } = await client.from('invitations').delete().eq('id', id);
        if (error) throw error;
        if (statusEl) { statusEl.textContent = 'Invitation revoked.'; statusEl.style.color = 'var(--color-text-secondary)'; }
    } catch (e) {
        console.error('[Safety Lab Aero] revoke failed:', e);
        if (statusEl) { statusEl.textContent = 'Revoke failed: ' + (e.message || 'unknown'); statusEl.style.color = 'var(--color-danger)'; }
    }
    await _renderPendingInvitations();
}

// ---------------------------------------------------------------------------
// REDEMPTION. The invitee arrives at /app/?invite=<token>.
//
// This CANNOT be done with a plain select: invitations RLS is admin-read-only
// (invitations_admin_read -> private.can_admin_workspace), and an invitee is by
// definition not yet a member, so they cannot read the row describing their own
// invitation. public.accept_invitation() is SECURITY DEFINER for exactly that
// reason, and it — not this function — is where email match, expiry, single use
// and the role whitelist are enforced. Everything here is presentation.
//
// The token is stripped from the URL as soon as it is read, so a shared screen,
// a screenshot or the browser history does not keep a live credential.
// ---------------------------------------------------------------------------
async function _consumeInviteFromUrl() {
    let token = '';
    try {
        const u = new URL(location.href);
        token = u.searchParams.get('invite') || '';
        if (!token) return;
        u.searchParams.delete('invite');
        history.replaceState(null, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams : '') + u.hash);
    } catch (_) { return; }
    if (!token) return;

    // Park it until there is a session — the invitee usually has to sign in
    // first, and the redirect back would otherwise drop the token.
    try { sessionStorage.setItem('safetyLab.pendingInvite', token); } catch (_) {}
    await _redeemPendingInvite();
}

async function _redeemPendingInvite() {
    let token = '';
    try { token = sessionStorage.getItem('safetyLab.pendingInvite') || ''; } catch (_) {}
    if (!token) return;
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    if (!client) return;
    const signedIn = (typeof isSupabaseSignedIn === 'function') && isSupabaseSignedIn();
    if (!signedIn) {
        try { showToast('Sign in to accept your workspace invitation.', 'info'); } catch (_) {}
        return;   // _onSupabaseSignedIn calls back here once there is a session
    }
    try {
        const { data, error } = await client.rpc('accept_invitation', { p_token: token });
        if (error) throw error;
        const r = Array.isArray(data) ? data[0] : data;
        const status = r && r.status;
        // Only clear the token for outcomes that will never change. A
        // wrong_account result is fixable by signing in as the invited address,
        // so the token stays parked for that second attempt.
        const terminal = ['joined', 'already_member', 'already_used', 'expired', 'invalid', 'invalid_role'];
        if (terminal.indexOf(status) !== -1) { try { sessionStorage.removeItem('safetyLab.pendingInvite'); } catch (_) {} }

        if (status === 'joined') {
            try { showToast('You have joined ' + (r.workspace_name || 'the workspace') + ' as ' + (r.role || 'a member') + '.', 'success'); } catch (_) {}
            try { setActiveWorkspaceId(r.workspace_id); } catch (_) {}
            try { if (typeof refreshWorkspaceChip === 'function') await refreshWorkspaceChip(); } catch (_) {}
            try { if (typeof loadCloudProjects === 'function') await loadCloudProjects(); } catch (_) {}
        } else if (status === 'already_member') {
            try { showToast('You are already a member of ' + (r.workspace_name || 'that workspace') + '.', 'info'); } catch (_) {}
            try { setActiveWorkspaceId(r.workspace_id); } catch (_) {}
            try { if (typeof refreshWorkspaceChip === 'function') await refreshWorkspaceChip(); } catch (_) {}
        } else if (status === 'wrong_account') {
            try { showToast('That invitation was sent to ' + (r.invited_email || 'another address') + '. Sign in with that address to accept it.', 'warning', 9000); } catch (_) {}
        } else if (status === 'expired') {
            try { showToast('That invitation has expired — ask for a new one.', 'warning'); } catch (_) {}
        } else if (status === 'already_used') {
            try { showToast('That invitation has already been used.', 'warning'); } catch (_) {}
        } else {
            try { showToast('That invitation link is not valid.', 'warning'); } catch (_) {}
        }
    } catch (e) {
        console.error('[Safety Lab Aero] accept invitation failed:', e);
        try { showToast('Could not accept the invitation: ' + (e.message || 'unknown'), 'warning'); } catch (_) {}
    }
}

function jumpToTransferTree() {
    // Phase 66.11 — the panel's Go button and the canvas double-click are the same
    // action; both go through ftaOpenTransferTarget so they land identically.
    if(!selectedNodeData || selectedNodeData.gateType !== 'TRANSFER' || !selectedNodeData.linkedPageId) return;
    if (typeof ftaOpenTransferTarget === 'function') { ftaOpenTransferTarget(selectedNodeData); return; }
    activeFTAPageId = selectedNodeData.linkedPageId; renderFTASidebar(); updateD3(); selectedNodeData = null; document.getElementById('node-config-panel').style.display = 'none'; fitToScreen();
}

function updateToolbarState() {
    const rootNode = getActiveFTARoot();
    document.getElementById('btn-add-top').disabled = !!rootNode;
    const isGate = selectedNodeData && selectedNodeData.type === 'gate' && selectedNodeData.gateType !== 'TRANSFER';
    document.getElementById('select-gate-type').disabled = !isGate;
    document.getElementById('btn-add-gate').disabled = !isGate;
    document.getElementById('select-event-type').disabled = !isGate;
    document.getElementById('btn-add-event').disabled = !isGate;
    document.getElementById('btn-delete').disabled = !selectedNodeData;
    // Copy: any selection (including the top event — the whole tree copies).
    // Paste: clipboard non-empty AND (no root yet → paste becomes root) OR (a non-transfer gate selected).
    const copyBtn = document.getElementById('btn-copy');
    const pasteBtn = document.getElementById('btn-paste');
    const pasteSpecialBtn = document.getElementById('btn-paste-special');
    if (copyBtn) copyBtn.disabled = !selectedNodeData;
    if (pasteBtn) pasteBtn.disabled = !nodeClipboard || (rootNode && !isGate);
    // Phase 56.51a — Paste Special mirrors Paste's enable condition.
    if (pasteSpecialBtn) pasteSpecialBtn.disabled = !nodeClipboard || (rootNode && !isGate);
    // Transfer Out: enabled when selected is a logical gate with children and isn't already transferred out.
    const xferBtn = document.getElementById('btn-transfer-out');
    if (xferBtn) {
        const kids = selectedNodeData && (selectedNodeData.children || selectedNodeData._children);
        xferBtn.disabled = !isGate || selectedNodeData.transferOutTo || !kids || kids.length === 0;
    }
    // Phase 53.43 — Integrate Back: only enabled when the selected gate IS transferred out.
    const intBtn = document.getElementById('btn-integrate-back');
    if (intBtn) intBtn.disabled = !selectedNodeData || !selectedNodeData.transferOutTo;
}

function generateDisplayId(type) {
    const isGate = (type === 'gate');
    const seq = typeCounters[type]++;   // existing per-type counter (already migrated + saved)
    // Format via the active numbering scheme so gate/basic-event IDs honor the
    // user's template; fall back to the classic G-/BE- format if unavailable.
    try {
        const N = window.SafetyLabNumbering;
        if (N && slNumberingScheme) {
            const t = slNumberingScheme.templates[isGate ? 'gate' : 'basicEvent'];
            if (t && t.pattern) return N.expand(t.pattern, Object.assign({ TYPE: t.type, SEQ: seq }, _slNumberCtx()));
        }
    } catch (_) {}
    return `${isGate ? 'G' : 'BE'}-${String(seq).padStart(3, '0')}`;
}

function addTopEvent() { const rootId = internalIdCounter++; const root = { id: rootId, logicalId: rootId, displayId: `TOP-${String(rootId).padStart(3,'0')}`, name: "System Failure", type: "gate", gateType: "OR", probability: 0, children: [] }; const page = ftaPages.find(p => p.id === activeFTAPageId); if(page) page.root = root; calculateAllProbabilities(); updateD3(); fitToScreen(); }

// Phase 17 — auto-generate a top-level gate from the linked FHA.
// Lookup the failure condition by the dropdown's prefixed internalId, then either create a new
// top gate (empty page), update an empty placeholder's name (root without children), or — if the
// page already has events — ask before renaming so the user doesn't lose context.
// 20 Aug 2026 — accepts BOTH id forms, because the codebase genuinely holds both:
//   • PREFIXED  'AC_<iid>' / 'SYS_<iid>'  — what the toolbar dropdown and ftaConfig carry
//   • RAW       <iid>                     — what a PAGE carries (page.linkedFhaId /
//                                           linkedFhaIds[]), written by ANEM, the seeder
//                                           and now the toolbar path
// Before this, an unprefixed id fell into the `else` and was searched ONLY in the system
// FHA pool, so an aircraft page link resolved to nothing and every caller silently no-oped
// (propagateDalFromTrueRoot returned without allocating a single DAL). Unprefixed now means
// "search AC first, then every system", which is the only sane reading of a bare internalId.
// The prefix strip is ANCHORED — the old .replace('AC_','') was unanchored and would have
// mangled any internalId containing that substring anywhere.
function _resolveLinkedFha(linkedFhaId) {
    if (linkedFhaId === null || linkedFhaId === undefined || linkedFhaId === '') return null;
    const s = String(linkedFhaId);
    const hasAc  = s.indexOf('AC_')  === 0;
    const hasSys = s.indexOf('SYS_') === 0;
    const realId = hasAc ? s.slice(3) : hasSys ? s.slice(4) : s;
    const inAc  = () => ((acFhaData || []).find(x => x && String(x.internalId) === realId)) || null;
    const inSys = () => (((typeof getAllSysFha === 'function' ? getAllSysFha() : []) || [])
                            .find(x => x && String(x.internalId) === realId)) || null;
    if (hasAc)  return inAc();
    if (hasSys) return inSys();
    return inAc() || inSys();
}
// Phase 56.23 — top gate auto-population uses the FC's description as the node
// name (which renders in the canvas description box), and the FC ID as the node's
// displayId (which renders in the small Gate/Event ID badge). Previously the FC ID
// was prepended to the name, which made the description box read "FC-EL9-001: ..."
// and left the displayId as a generic "TOP-001".
// Phase 56.23 — scans every FTA node in every page and returns true if the
// supplied displayId is already in use by a node other than the caller. The
// `excludeNodeId` parameter is the node's internal id (so a node renaming to
// its own current value doesn't trip the duplicate check). Common-mode
// repeated events SHOULD share a displayId — they're handled separately via
// logicalId — so we permit duplicates where the logicalIds match.
function _isDisplayIdDuplicate(newId, excludeNodeId) {
    if (!newId) return false;
    const trimmed = String(newId).trim();
    if (!trimmed) return false;
    // Find the caller's logicalId so we can permit repeats of the SAME logical event.
    let callerLogicalId = null;
    function _findLogical(node) {
        if (!node || callerLogicalId !== null) return;
        if (node.id === excludeNodeId) { callerLogicalId = (node.logicalId != null ? node.logicalId : node.id); return; }
        const kids = node.children || node._children || [];
        kids.forEach(_findLogical);
    }
    (ftaPages || []).forEach(p => { if (p.root) _findLogical(p.root); });
    let dup = false;
    function _scan(node) {
        if (!node || dup) return;
        if (node.id !== excludeNodeId && (node.displayId || '').trim() === trimmed) {
            const nodeLogical = (node.logicalId != null ? node.logicalId : node.id);
            // Allow the shared id when both nodes represent the same logical event
            // (common-mode repeat), otherwise flag as duplicate.
            if (callerLogicalId === null || nodeLogical !== callerLogicalId) dup = true;
        }
        const kids = node.children || node._children || [];
        kids.forEach(_scan);
    }
    (ftaPages || []).forEach(p => { if (p.root) _scan(p.root); });
    return dup;
}

function _fcTopGateName(fha) {
    return (fha.fcDesc || 'Failure condition').trim();
}
function _fcTopGateDisplayId(fha, fallbackId) {
    // Use the FC ID verbatim so the canvas badge shows the regulator-readable
    // identifier; fall back to TOP-XXX if the FHA row has no fcId yet.
    if (fha && fha.fcId && fha.fcId.trim()) return fha.fcId.trim();
    return 'TOP-' + String(fallbackId).padStart(3, '0');
}
function _fcPageName(fha) {
    const id = fha.fcId || 'FHA';
    const desc = fha.fcDesc ? fha.fcDesc.trim().slice(0, 40) : '';
    return id + (desc ? ' — ' + desc : '');
}
function autoGenerateTopGateForFha(page, fha, opts) {
    opts = opts || {};
    if (!page || !fha) return false;
    const hasChildren = page.root && ((page.root.children && page.root.children.length > 0) || (page.root._children && page.root._children.length > 0));
    if (!page.root) {
        // Empty page → create a fresh top OR gate named for the failure condition.
        const rootId = internalIdCounter++;
        page.root = {
            id: rootId, logicalId: rootId,
            displayId: _fcTopGateDisplayId(fha, rootId),
            name: _fcTopGateName(fha),
            type: 'gate', gateType: 'OR', probability: 0,
            children: []
        };
        page.name = _fcPageName(fha);
        if (typeof showToast === 'function') showToast('Top event "' + _fcTopGateName(fha) + '" created from linked FHA.', 'success', 2800);
        return true;
    }
    if (!hasChildren) {
        // Placeholder root with no events — silently retitle + restamp displayId.
        page.root.name = _fcTopGateName(fha);
        page.root.displayId = _fcTopGateDisplayId(fha, page.root.id);
        page.name = _fcPageName(fha);
        if (typeof showToast === 'function') showToast('Top event renamed to match the linked FHA.', 'info', 2400);
        return true;
    }
    // Tree already has events — ask before overwriting, unless caller forced.
    if (opts.force) {
        page.root.name = _fcTopGateName(fha);
        page.root.displayId = _fcTopGateDisplayId(fha, page.root.id);
        page.name = _fcPageName(fha);
        return true;
    }
    const ok = confirm('This fault tree already has events.\n\nUpdate the top-event name to "' + _fcTopGateName(fha) + '"? (children are preserved.)');
    if (ok) {
        page.root.name = _fcTopGateName(fha);
        page.root.displayId = _fcTopGateDisplayId(fha, page.root.id);
        page.name = _fcPageName(fha);
        if (typeof showToast === 'function') showToast('Top event renamed.', 'info', 2400);
        return true;
    }
    return false;
}
function onFtaFhaLinkChange() {
    const sel = document.getElementById('fta-fha-link');
    const linkedFhaId = sel ? sel.value : '';
    // Always run the existing sync so the toolbar/target/phase math stays in step.
    if (typeof syncFTAConfig === 'function') syncFTAConfig();
    try { _renderFtaLinkedChip(); } catch (_) {}

    // 20 Aug 2026 — PERSIST THE LINK ON THE PAGE.
    // syncFTAConfig() writes only the GLOBAL ftaConfig, which is per-session and gets
    // overwritten by syncFtaConfigFromActivePage() the moment you open another tree. The
    // restore side has always been complete (syncFtaConfigFromActivePage reads
    // page.linkedFhaIds[] ?? page.linkedFhaId and rebuilds the prefixed toolbar value) —
    // there was simply no writer on the human path. Only ANEM (ai_assistant) and the demo
    // seeder ever set it, which is exactly why every demo reads as linked and a hand-built
    // project does not. Consequence of the gap: on any page you are not currently looking
    // at, ASA triage, requirement bucketing, exposure sync, the golden thread and
    // gt-integrity all resolved "no linked failure condition" and silently did nothing.
    //
    // Stored as the RAW internalId, and specifically as `fha.internalId` ITSELF rather than
    // the string left over from stripping the prefix — every assurance consumer compares
    // with strict `===` (assurance_modules pageTopSeverity / _governingFhaForPage / the
    // exposure map), so a numeric internalId stringified here would silently stop matching.
    const page = (ftaPages || []).find(p => p.id === activeFTAPageId);
    if (!page) return;
    const fha = linkedFhaId ? _resolveLinkedFha(linkedFhaId) : null;

    if (!fha) {
        // Cleared (or an id that no longer resolves) — unlink the page too. Previously this
        // returned before the page was ever touched, so clearing the dropdown left a stale
        // link on the page for every non-active-page consumer to keep reading.
        page.linkedFhaId = null;
        if (Array.isArray(page.linkedFhaIds)) page.linkedFhaIds = [];
        if (typeof _syncMirrorOwnershipFromSource === 'function') _syncMirrorOwnershipFromSource(page);
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
        return;
    }

    page.linkedFhaId = fha.internalId;
    // Keep the plural list in step. This is not belt-and-braces: syncFtaConfigFromActivePage
    // reads `Array.isArray(page.linkedFhaIds) ? page.linkedFhaIds : ...` — an EMPTY array
    // (which ANEM's unlink leaves behind) wins over the scalar and would swallow the link we
    // just wrote. Primary first, no duplicates, order otherwise preserved.
    if (Array.isArray(page.linkedFhaIds)) {
        page.linkedFhaIds = [fha.internalId].concat(
            page.linkedFhaIds.filter(id => String(id) !== String(fha.internalId)));
    }
    if (typeof scheduleAutosave === 'function') scheduleAutosave();

    const changed = autoGenerateTopGateForFha(page, fha);
    // Phase 57 — the FHA link is part of the mirror's inherited context; keep it in step
    // (this also re-syncs the mirror's exposure source through its own page link).
    if (typeof _syncMirrorOwnershipFromSource === 'function') _syncMirrorOwnershipFromSource(page);
    if (changed) {
        if (typeof renderFTASidebar === 'function') renderFTASidebar();
        if (typeof calculateAllProbabilities === 'function') calculateAllProbabilities();
        if (typeof updateD3 === 'function') updateD3();
        if (typeof fitToScreen === 'function') fitToScreen();
    }
}

function _findParentOfNode(root, targetId) {
    if (!root) return null;
    const kids = root.children || root._children;
    if (kids) {
        for (const c of kids) {
            if (c.id === targetId) return root;
            const deeper = _findParentOfNode(c, targetId);
            if (deeper) return deeper;
        }
    }
    return null;
}

// Phase 53.49 — Q1: when a sibling BE is added to a VERIFICATION mirror and has no
// allocation counterpart, prompt the user with three choices.
function _handleVerificationSideAdd(newNode, mirrorPage, parentInMirror) {
    if (!mirrorPage || !mirrorPage.verifies) return;
    const sourcePage = (ftaPages || []).find(p => p.id === mirrorPage.verifies);
    if (!sourcePage || !sourcePage.root) return;
    // If the new node's logicalId already exists in the source, this is just a re-mirror.
    const newLid = newNode.logicalId != null ? newNode.logicalId : newNode.id;
    const alreadyMatched = _findNodeByLogicalId(sourcePage.root, newLid);
    if (alreadyMatched) return;   // mapped, nothing to do
    // Locate the source parent by the mirror parent's logicalId.
    const mirrorParentLid = parentInMirror && (parentInMirror.logicalId != null ? parentInMirror.logicalId : parentInMirror.id);
    const sourceParent = _findNodeByLogicalId(sourcePage.root, mirrorParentLid);
    const sourceParentDesc = sourceParent ? ('"' + (sourceParent.name || sourceParent.displayId || 'gate') + '"') : 'a gate that has no allocation counterpart';
    const choice = prompt(
        'You added a basic event ("' + (newNode.name || newNode.displayId || 'new event') + '") to the verification tree as a sibling under ' + sourceParentDesc + '.\n\n' +
        'This component has no corresponding entry in the allocation tree — no requirement was ever generated to cover it. Choose how to reconcile:\n\n' +
        '  1 — Auto-add a matching BE to the allocation tree (so AutoReq generates a target for it on next run).\n' +
        '  2 — Jump to the allocation tree (the parent gate will be highlighted; you add it manually).\n' +
        '  3 — Informational only (leaves the verification mirror as-is; the new node renders as "Unmapped"; no requirement target).\n\n' +
        'Type 1, 2, or 3 and press OK. Cancel to leave as-is (same as 3).',
        '1'
    );
    if (choice === '1' && sourceParent) {
        // Auto-add to allocation tree using a fresh clone (preserve logicalId so future
        // mirror lookups succeed; reset numeric id so it has a unique structural slot).
        const allocClone = JSON.parse(JSON.stringify(newNode));
        allocClone.id = internalIdCounter++;
        allocClone.logicalId = newLid;
        if (!sourceParent.children) sourceParent.children = [];
        sourceParent.children.push(allocClone);
        if (typeof showToast === 'function') showToast('Component "' + (newNode.name || 'new event') + '" auto-added to the allocation tree. Re-run AutoReq to generate the target.', 'success', 3600);
        _markStructureChangeObsolete('Component added to allocation (auto-mirrored from verification side).');
    } else if (choice === '2' && sourceParent) {
        activeFTAPageId = sourcePage.id;
        if (typeof syncFtaConfigFromActivePage === 'function') syncFtaConfigFromActivePage();
        if (typeof renderFTASidebar === 'function') renderFTASidebar();
        if (typeof updateD3 === 'function') updateD3();
        if (typeof showToast === 'function') showToast('Switched to allocation tree — add the matching component under the highlighted parent gate.', 'info', 4200);
    } else {
        // 3 / Cancel — informational only.
        newNode._unmapped = true;
        if (typeof showToast === 'function') showToast('Added as informational — no requirement target. The node renders as "Unmapped" until you back-port it to the allocation.', 'info', 3600);
    }
}

function addSelectedGate() {
    if (!selectedNodeData || selectedNodeData.type !== 'gate') return;
    const gt = document.getElementById('select-gate-type').value;
    const _gid = internalIdCounter++;
    // Phase 44 — VOTING gates need a sane votingK default. Without this the field was
    // undefined on creation, calcBottomUp fell back to k=1 (= OR), so a freshly-created
    // VOTING gate computed as OR until the user manually edited K. Default 2 matches the
    // form's display fallback (selectNode reads votingK || 2).
    const nn = { id: _gid, logicalId: _gid, displayId: generateDisplayId('gate'), name: `New ${gt} Gate`, type: 'gate', gateType: gt, probability: 0, children: [] };
    if (gt === 'VOTING') nn.votingK = 2;
    // If the selected gate is a transfer-out, route the new child to the destination page's root.
    const target = resolveTransferOutTarget(selectedNodeData);
    if (target._children) target._children.push(nn);
    else { if (!target.children) target.children = []; target.children.push(nn); }
    // Phase 53.49 — structure changed → flag affected reqs as stale. Then mirror or prompt.
    _markStructureChangeObsolete('New gate added to fault tree.');
    const activePage = ftaPages.find(p => p.id === activeFTAPageId);
    if (activePage && activePage.verifies) _handleVerificationSideAdd(nn, activePage, target);
    else _autoMirrorIntoVerification(nn, activePage, target);
    calculateAllProbabilities(); updateD3();
    // Phase 66.33 — C1b. The new node is created FIRST and is immediately usable; the
    // identity dialog then asks what it is. Deliberately in that order: creation must
    // never be gated on filling in dropdowns ("you cannot think and fill in dropdowns at
    // once"), so the dialog is dismissible with Later and the node simply stays
    // unstructured — flagged, and holding up closure rather than holding up the work.
    try {
        selectedNodeData = nn;
        if (typeof selectNode === 'function') selectNode(nn);
        if (typeof slOpenNodeIdentityModal === 'function') slOpenNodeIdentityModal();
    } catch (_) {}
}
function addSelectedEvent() {
    if (!selectedNodeData || selectedNodeData.type !== 'gate') return;
    const et = document.getElementById('select-event-type').value;
    const _eid = internalIdCounter++;
    // Phase 66.17 — weight is a PERCENTAGE of the parent (a sibling group sums to
    // 100), so the old hard-coded `weight: 1` stamped 1% on every new event: added
    // to a 50/50 group it drew ~2% of the budget, the same scale bug fixed in 66.10.
    // It is left UNSET here and given its equal share below, once the group size is
    // known — and the existing siblings are scaled to fit by the same rebalancer the
    // slider uses, so the group still sums to 100.
    const nn = { id: _eid, logicalId: _eid, displayId: generateDisplayId(et), name: `New Event`, type: et, probability: 0, lambda: 0.0001, ccfGroup: "", beta: 0, children: [] };
    const target = resolveTransferOutTarget(selectedNodeData);
    if (target._children) target._children.push(nn);
    else { if (!target.children) target.children = []; target.children.push(nn); }
    // Only touch weights in TOP-DOWN mode. In bottom-up they are not read at all,
    // and rewriting a group's apportionment while the user is doing verification
    // work would be a silent edit to allocation data they are not looking at.
    // A node added in bottom-up is left with NO weight, which is exactly the state
    // seedTopDownWeights() was built for in 66.10: it gets the equal share the
    // moment the tree enters top-down.
    try {
        const _tdown = (typeof ftaConfig !== 'undefined' && ftaConfig && ftaConfig.mode === 'top-down');
        const _sibs = target._children || target.children || [];
        if (_tdown && _sibs.length > 1 && typeof _rebalanceSiblingWeights === 'function' && typeof _normalizeSiblingWeights === 'function') {
            // Normalise the EXISTING group first so the incoming share is carved out
            // of a group that already sums to 100 — this preserves the siblings'
            // RELATIVE apportionment (70/30 stays 70:30 between them) instead of
            // flattening deliberate weights, and _rebalanceSiblingWeights honours
            // any locked sibling exactly as a slider drag would.
            _normalizeSiblingWeights(_sibs.filter(function (x) { return x !== nn; }));
            _rebalanceSiblingWeights(nn, _sibs, 100 / _sibs.length);
        } else if (_tdown && _sibs.length === 1) {
            nn.weight = 100;
        }
    } catch (_) {}
    // Phase 53.49 — structure changed → flag affected reqs. Then auto-mirror (allocation side)
    // or prompt the user (verification side).
    _markStructureChangeObsolete('New basic event added to fault tree.');
    const activePage = ftaPages.find(p => p.id === activeFTAPageId);
    if (activePage && activePage.verifies) _handleVerificationSideAdd(nn, activePage, target);
    else _autoMirrorIntoVerification(nn, activePage, target);
    calculateAllProbabilities(); updateD3();
    // Phase 66.33 — C1b. The new node is created FIRST and is immediately usable; the
    // identity dialog then asks what it is. Deliberately in that order: creation must
    // never be gated on filling in dropdowns ("you cannot think and fill in dropdowns at
    // once"), so the dialog is dismissible with Later and the node simply stays
    // unstructured — flagged, and holding up closure rather than holding up the work.
    try {
        selectedNodeData = nn;
        if (typeof selectNode === 'function') selectNode(nn);
        if (typeof slOpenNodeIdentityModal === 'function') slOpenNodeIdentityModal();
    } catch (_) {}
}

function deleteNodeRecursive(node, targetId) { let actualChildren = node.children || node._children; if (!actualChildren) return false; for (let i = 0; i < actualChildren.length; i++) { if (actualChildren[i].id === targetId) { actualChildren.splice(i, 1); return true; } if (deleteNodeRecursive(actualChildren[i], targetId)) return true; } return false; }
function deleteSelectedNode() {
    if (!selectedNodeData) return;
    const rootNode = getActiveFTARoot();
    if (rootNode && selectedNodeData.id === rootNode.id) {
        if(confirm("Clear top event?")) {
            const page = ftaPages.find(p => p.id === activeFTAPageId);
            if(page) page.root = null;
            selectedNodeData = null;
            document.getElementById('node-config-panel').style.display = 'none';
            // Phase 53.49 — root cleared → all reqs from this tree are obsoleted.
            if (typeof _markStructureChangeObsolete === 'function') _markStructureChangeObsolete('Top event cleared.');
        }
    } else {
        deleteNodeRecursive(rootNode, selectedNodeData.id);
        selectedNodeData = null;
        document.getElementById('node-config-panel').style.display = 'none';
        // Phase 53.49 — structure changed → flag affected reqs.
        if (typeof _markStructureChangeObsolete === 'function') _markStructureChangeObsolete('Node deleted from fault tree.');
    }
    calculateAllProbabilities(); updateD3();
}

/* =====================================================================
   Phase 55.0.9 — FTA UX overhaul: modal open/close helpers
   --------------------------------------------------------------------
   The node-properties panel is rendered as a centered modal via CSS
   (see safety_lab.css "Phase 55.0.9" section). All the existing JS
   that toggles #node-config-panel.style.display continues to work
   unchanged — the CSS handles the visual transformation.

   What we add here:
   - closeNodeConfigModal(): close button + Esc handler use this to
     hide the panel and clear the active selection.
   - Esc keyhandler: closes the node-properties drawer when open.
   ===================================================================== */
function closeNodeConfigModal() {
    const ncp = document.getElementById('node-config-panel');
    if (ncp) ncp.style.display = 'none';
    selectedNodeData = null;
    // Disable the toolbar buttons that depend on a selection (matches the existing
    // pattern used in addSelectedGate / addSelectedEvent contexts).
    try {
        const ids = ['btn-add-gate','btn-add-event','btn-delete','btn-copy','btn-paste','btn-paste-special','btn-transfer-out','btn-integrate-back','select-gate-type','select-event-type'];
        ids.forEach(id => { const el = document.getElementById(id); if (el) el.disabled = true; });
    } catch (_) {}
    if (typeof updateD3 === 'function') updateD3();
}

function _cloneSubtreeForVerification(node, blankValues) {
    if (!node) return null;
    const fresh = {};
    Object.keys(node).forEach(k => {
        // Drop runtime/allocated state and parent-only fields we don't want to carry over.
        if (k === 'children' || k === '_children') return;
        if (k === 'allocatedDAL' || k === 'dalCarrierChildId' || k === 'isDALCarrier') return;
        // C2 (22 Aug 2026) — identity is DEEP-copied. `fresh[k] = node[k]` made the
        // twins share ONE identity object, so a verification-side edit (modeIds)
        // would have mutated the allocation twin and tripped its modes-on-allocation
        // closure block. Lockstep is SLMirrorModes.syncMirrorIdentity's job — by
        // copy, never by aliasing.
        if (k === 'identity' && node.identity && typeof node.identity === 'object') {
            fresh.identity = JSON.parse(JSON.stringify(node.identity));
            return;
        }
        fresh[k] = node[k];
    });
    // Each cloned node gets a fresh structural id; logicalId is preserved for traceability.
    fresh.id = internalIdCounter++;
    fresh.logicalId = node.logicalId || fresh.id;
    if (blankValues) {
        if (fresh.type !== 'gate') {
            fresh.lambda = 0;
            fresh.probability = 0;
            fresh.inputValue = 0;
            fresh.mtbf = null;
            fresh.libraryKey = null;
            fresh.inputMode = 'lambda';
        } else {
            // Gate probability/computed values will be recomputed bottom-up.
            fresh.probability = 0;
        }
    }
    const kids = node.children || node._children;
    if (kids && kids.length) fresh.children = kids.map(k => _cloneSubtreeForVerification(k, blankValues));
    return fresh;
}

function createVerificationTreeFromActive() {
    // Phase 53.69 — V&V mirror trees are gated for the EDU tier. Pro+, Pro and Enterprise have it.
    if (typeof canUseVerificationTree === 'function' && !canUseVerificationTree()) {
        showUpgradeRequiredToast('Verification / Validation mirror trees', 'pro');
        return null;
    }
    const sourcePage = ftaPages.find(p => p.id === activeFTAPageId);
    if (!sourcePage || !sourcePage.root) {
        if (typeof showToast === 'function') showToast('No active tree to mirror.', 'warning', 2800);
        return null;
    }
    if (sourcePage.verifies) {
        if (typeof showToast === 'function') showToast('This page is already a verification mirror — you can populate it directly.', 'info', 3200);
        return null;
    }
    // If a mirror already exists for this source, switch to it rather than creating a duplicate.
    const existing = ftaPages.find(p => p.verifies === sourcePage.id);
    if (existing) {
        activeFTAPageId = existing.id;
        if (typeof syncFtaConfigFromActivePage === 'function') syncFtaConfigFromActivePage();
        if (typeof renderFTASidebar === 'function') renderFTASidebar();
        if (typeof updateD3 === 'function') updateD3();
        if (typeof showToast === 'function') showToast('Switched to existing verification tree.', 'info', 2800);
        return existing;
    }
    const newRoot = _cloneSubtreeForVerification(sourcePage.root, /*blankValues=*/true);
    const newPageId = 'page-' + Date.now();
    const newPage = {
        id: newPageId,
        name: (sourcePage.name || 'Tree') + ' (Verification)',
        root: newRoot,
        mode: 'bottom-up',
        verifies: sourcePage.id,
        treeLevel: sourcePage.treeLevel || 'standalone',
        systemId: sourcePage.systemId,
        linkedFhaId: sourcePage.linkedFhaId,
        linkedFhaIds: Array.isArray(sourcePage.linkedFhaIds) ? sourcePage.linkedFhaIds.slice() : undefined,
        // Phase 76 — the mirror must verify under the SAME mission profile (exposure window) as
        // the tree it verifies, else the bottom-up check isn't like-for-like. Inherited here and
        // kept in lockstep via _syncMirrorOwnershipFromSource.
        missionProfileId: sourcePage.missionProfileId || '',
        // Phase 57 — also inherit the per-page top-event budget so the mirror shares the
        // source's standalone target. Ownership fields above + this stay in sync afterward
        // via _syncMirrorOwnershipFromSource (called from the ownership-change handlers).
        targetP: (typeof sourcePage.targetP === 'number') ? sourcePage.targetP : undefined
    };
    ftaPages.push(newPage);
    activeFTAPageId = newPageId;
    selectedNodeData = null;
    const ncp = document.getElementById('node-config-panel'); if (ncp) ncp.style.display = 'none';
    if (typeof syncFtaConfigFromActivePage === 'function') syncFtaConfigFromActivePage();
    if (typeof renderFTASidebar === 'function') renderFTASidebar();
    if (typeof calculateAllProbabilities === 'function') calculateAllProbabilities();
    if (typeof updateD3 === 'function') updateD3();
    if (typeof fitToScreen === 'function') setTimeout(fitToScreen, 50);
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
    if (typeof showToast === 'function') showToast(
        'Verification tree created — same structure as "' + (sourcePage.name || 'source') + '", all leaf values blank. Enter implementation λ values and the calculated top-event probability will verify your allocations.',
        'success', 4800
    );
    return newPage;
}

function integrateTransferredSubtree(gateId, flattenNested) {
    // Locate the source gate across all pages (it can live on any page that itself was a
    // transferred-in subtree of an ancestor).
    let sourceGate = null, sourcePage = null;
    function findIn(node, page) {
        if (!node) return false;
        if (node.id === gateId) { sourceGate = node; sourcePage = page; return true; }
        const kids = node.children || node._children;
        if (kids) for (const c of kids) if (findIn(c, page)) return true;
        return false;
    }
    for (const p of (ftaPages || [])) {
        if (p.root && findIn(p.root, p)) break;
    }
    if (!sourceGate) { if (typeof showToast === 'function') showToast('Gate not found in any page.', 'warning', 2800); return; }
    if (!sourceGate.transferOutTo) { if (typeof showToast === 'function') showToast('This gate has not been transferred out.', 'info', 2800); return; }

    const subtreeId = sourceGate.transferOutTo;
    const subtree = (ftaPages || []).find(p => p.id === subtreeId);
    if (!subtree || !subtree.root) {
        // Orphan: linked page is missing. Just clear the flag and restore an empty gate.
        delete sourceGate.transferOutTo;
        if (typeof renderFTASidebar === 'function') renderFTASidebar();
        if (typeof calculateAllProbabilities === 'function') calculateAllProbabilities();
        if (typeof updateD3 === 'function') updateD3();
        if (typeof showToast === 'function') showToast('Linked subtree page was missing — cleared the transfer flag.', 'warning', 3200);
        return;
    }
    // Move children straight onto the source gate. logicalIds carry through.
    sourceGate.children = subtree.root.children || [];
    delete sourceGate.transferOutTo;

    // Optional: recursively flatten any nested transferred-out gates in the just-moved subtree.
    if (flattenNested) {
        (function walk(n) {
            if (!n) return;
            if (n.transferOutTo) integrateTransferredSubtree(n.id, true);
            const kids = n.children || n._children;
            if (kids) kids.forEach(walk);
        })(sourceGate);
    }

    // Drop the now-empty subtree page from the model.
    ftaPages = (ftaPages || []).filter(p => p.id !== subtreeId);
    if (activeFTAPageId === subtreeId) activeFTAPageId = sourcePage ? sourcePage.id : (ftaPages[0] && ftaPages[0].id);
    selectedNodeData = null;
    const cfgPanel = document.getElementById('node-config-panel'); if (cfgPanel) cfgPanel.style.display = 'none';

    if (typeof renderFTASidebar === 'function') renderFTASidebar();
    if (typeof calculateAllProbabilities === 'function') calculateAllProbabilities();
    if (typeof updateD3 === 'function') updateD3();
    if (typeof fitToScreen === 'function') fitToScreen();
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
    if (typeof showToast === 'function') showToast('Subtree integrated back into "' + ((sourcePage && sourcePage.name) || 'parent') + '".', 'success', 2800);
}

async function runDALAllocation() {
    const root = getActiveFTARoot();
    if (!root) return alert('No active fault tree.');
    // Resolve the link from the toolbar control, falling back to the active page's stored link
    // (ftaConfig.linkedFhaId) so the allocator seeds even when the Calculation panel isn't open.
    const linkedFhaId = ((document.getElementById('fta-fha-link') || {}).value)
        || (typeof ftaConfig !== 'undefined' && ftaConfig.linkedFhaId) || '';

    let topDal = null;
    let fcLabel = '';
    if (linkedFhaId) {
        const isAC = linkedFhaId.startsWith('AC_');
        const realId = linkedFhaId.replace('AC_', '').replace('SYS_', '');
        // #51 — string-coerced compare (FHA internalId may be numeric in some projects/demos)
        const fha = isAC
            ? acFhaData.find(x => String(x.internalId) === String(realId))
            : getAllSysFha().find(x => String(x.internalId) === String(realId));
        if (fha) { topDal = getSafetyTarget(fha.severity).dal; fcLabel = (fha.fcId || '') + (fha.severity ? ' · ' + fha.severity : ''); }
    }
    if (!topDal) {
        // #40 — DAL is derived from a failure condition's severity. Rather than block the canvas
        // with a prompt, guide the user to link this tree to its owning hazard (no modal).
        const linkSel0 = document.getElementById('fta-fha-link');
        if (!linkSel0 || linkSel0.offsetParent === null) {
            const tog = Array.from(document.querySelectorAll('button, summary, [role="button"], .panel-collapse-toggle'))
                .find(x => /calculation mode/i.test((x.textContent || '').slice(0, 40)));
            if (tog) tog.click();
        }
        const sel = document.getElementById('fta-fha-link');
        if (sel) {
            try { sel.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
            try { sel.focus({ preventScroll: true }); } catch (_) {}
            const prevShadow = sel.style.boxShadow;
            sel.style.boxShadow = '0 0 0 3px rgba(47,109,246,0.55)';
            setTimeout(() => { sel.style.boxShadow = prevShadow; }, 2200);
        }
        if (typeof showToast === 'function') showToast('Link this tree to a failure condition (set the owning function above) to allocate DAL from its severity.', 'info', 5000);
        return;
    }
    clearAllAllocations();
    allocateDAL(root, topDal, new Set());
    updateD3();
    // #51 — "what happened" feedback: report the basis (FC/severity), top DAL, and P(top)
    // so the deterministic DAL-algebra pass narrates its own result.
    if (typeof showToast === 'function') {
        let msg = 'DAL allocated through the tree';
        if (fcLabel) msg += ' from ' + fcLabel;
        msg += ' → top-event DAL ' + topDal;
        if (root && typeof root.probability === 'number') msg += ' · P(top)=' + root.probability.toExponential(2);
        showToast(msg, 'success', 5000);
    }
    // If the user is currently configuring a node, refresh the panel's DAL fields.
    if (selectedNodeData) selectNode(selectedNodeData);
}
function clearAndRedraw() {
    clearAllAllocations();
    updateD3();
    if (selectedNodeData) selectNode(selectedNodeData);
}

// Toggle a focused FTA workspace — hides header / nav / background decoration,
// inflates the canvas to the viewport, and switches the button label.
function toggleFTAFullscreen() {
    const body = document.body;
    body.classList.toggle('fta-fullscreen');
    const btn = document.getElementById('btn-fullscreen');
    const inFullscreen = body.classList.contains('fta-fullscreen');
    if (btn) {
        if (inFullscreen) {
            btn.textContent = 'Exit Fullscreen';
            btn.classList.add('fullscreen-on');
        } else {
            btn.textContent = 'Fullscreen';
            btn.classList.remove('fullscreen-on');
        }
    }
    // Phase 40 — collapse the Calc-Mode panel on entering fullscreen; expand on exit.
    // Phase 57 — the Fault Trees navigation pane is always visible now, so it's excluded.
    const configPanel = document.getElementById('fta-config-panel');
    [configPanel].forEach(panel => {
        if (!panel) return;
        const toggle = panel.querySelector('.panel-collapse-toggle');
        if (inFullscreen) {
            panel.classList.add('is-collapsed');
            if (toggle) toggle.textContent = toggle.dataset.collapsedLabel || '▸ Expand';
        } else {
            panel.classList.remove('is-collapsed');
            if (toggle) toggle.textContent = toggle.dataset.expandedLabel || '▾ Collapse';
        }
    });
    // The SVG height changes via CSS — re-fit after the layout settles.
    setTimeout(() => { if (typeof fitToScreen === 'function') fitToScreen(); }, 50);
}

// Phase 40 — collapse/expand the sidebar or config panel. Called from the inline toggle button.
function togglePanelCollapse(selector, btn) {
    const panel = document.querySelector(selector);
    if (!panel) return;
    const wasCollapsed = panel.classList.contains('is-collapsed');
    panel.classList.toggle('is-collapsed');
    if (btn) {
        btn.textContent = wasCollapsed
            ? (btn.dataset.expandedLabel || '▾ Collapse')
            : (btn.dataset.collapsedLabel || '▸ Expand');
    }
    // Re-fit so the canvas takes the freed-up space (or gives some back).
    if (typeof fitToScreen === 'function') setTimeout(fitToScreen, 50);
}

function onTargetOverrideToggle() {
    const overrideChk = document.getElementById('fta-target-override');
    projectConfig.override = !!(overrideChk && overrideChk.checked);
    refreshFTARequiredTarget();
    syncFTAConfig();
}

// Phase 32a — when the user types into the exposure-time input directly, flip to manual mode
// so the FHA-driven auto-fill stops overriding their value.
function onExposureInputChange() {
    const expInput = document.getElementById('fta-exposure-time');
    const expAuto  = document.getElementById('fta-exposure-auto');
    if (!expInput) return;
    const v = parseFloat(expInput.value);
    if (!isNaN(v) && v > 0) {
        ftaConfig.exposureTime = v;
        // User edited — leave 'auto' alone if the value happens to match the FHA exposure
        // (no need to flip them out), but flip to manual otherwise.
        if (expAuto && expAuto.checked && ftaConfig.linkedFhaId) {
            const ctx = _fhaExposureContext(ftaConfig.linkedFhaId);
            const fhaExposure = ctx && ctx.exp.exposedHours > 0 ? ctx.exp.exposedHours : (ctx ? ctx.exp.totalHours : null);
            if (fhaExposure == null || Math.abs(fhaExposure - v) > 1e-6) {
                expAuto.checked = false;
                ftaConfig.exposureSource = 'manual';
            }
        }
    }
    refreshTopAllocatorReadout();
    calculateAllProbabilities();
    updateD3();
}

// Phase 32a — toggle FHA-driven auto-fill. When turning on, pull from FHA immediately so the
// input updates; when turning off, leave the current value as the manual starting point.
function onExposureAutoToggle() {
    const expAuto  = document.getElementById('fta-exposure-auto');
    const expInput = document.getElementById('fta-exposure-time');
    if (!expAuto) return;
    if (expAuto.checked) {
        ftaConfig.exposureSource = 'auto';
        if (ftaConfig.linkedFhaId) {
            syncFTAExposureFromFHA();
            if (expInput) expInput.value = ftaConfig.exposureTime;
        }
    } else {
        ftaConfig.exposureSource = 'manual';
    }
    refreshTopAllocatorReadout();
    calculateAllProbabilities();
    updateD3();
}

function _findParentAndSiblings(targetNode) {
    if (!targetNode || typeof getActiveFTARoot !== 'function') return null;
    const root = getActiveFTARoot();
    if (!root || root === targetNode || root.id === targetNode.id) return null;
    let result = null;
    (function walk(n) {
        if (!n || result) return;
        const kids = n.children || n._children;
        if (kids && kids.length) {
            const idx = kids.findIndex(c => c && (c.id === targetNode.id));
            if (idx >= 0) { result = { parent: n, siblings: kids, index: idx }; return; }
            kids.forEach(walk);
        }
    })(root);
    return result;
}

// Normalize weights for a sibling group so they sum to 100. Locked siblings
// retain their current value; only unlocked siblings absorb the normalization.
function _normalizeSiblingWeights(siblings) {
    if (!siblings || !siblings.length) return;
    siblings.forEach(s => {
        const w = parseFloat(s.weight);
        if (!isFinite(w) || w < 0) s.weight = 100 / siblings.length;
    });
    const total = siblings.reduce((sum, s) => sum + (parseFloat(s.weight) || 0), 0);
    if (total <= 0) {
        const eq = 100 / siblings.length;
        siblings.forEach(s => { s.weight = eq; });
        return;
    }
    // Scale all to sum=100 on load. (Lock state is honored only during interactive
    // drag, not during this baseline normalization.)
    const scale = 100 / total;
    siblings.forEach(s => { s.weight = (parseFloat(s.weight) || 0) * scale; });
}

// Drag handler: the active sibling moves to newPct, unlocked siblings absorb
// the delta proportional to their current weight, locked siblings unchanged.
// Returns the clamped value actually applied to the active sibling.
function _rebalanceSiblingWeights(activeNode, siblings, newPct) {
    if (!siblings || siblings.length < 2) return newPct;
    const locked = siblings.filter(s => s !== activeNode && s.weightLocked);
    const unlocked = siblings.filter(s => s !== activeNode && !s.weightLocked);
    const sumLocked = locked.reduce((s, n) => s + (parseFloat(n.weight) || 0), 0);
    const max = 100 - sumLocked;
    // Clamp newPct so the unlocked siblings can absorb the delta without going negative.
    if (newPct > max) newPct = max;
    if (newPct < 0) newPct = 0;
    const oldActive = parseFloat(activeNode.weight) || 0;
    const delta = newPct - oldActive;
    activeNode.weight = newPct;
    if (unlocked.length === 0) {
        // Nothing to redistribute to. Active sibling absorbs at the clamped value.
        return newPct;
    }
    const sumUnlocked = unlocked.reduce((s, n) => s + (parseFloat(n.weight) || 0), 0);
    if (sumUnlocked <= 0) {
        // Distribute evenly across unlocked siblings.
        const each = -delta / unlocked.length;
        unlocked.forEach(n => { n.weight = Math.max(0, (parseFloat(n.weight) || 0) + each); });
    } else {
        unlocked.forEach(n => {
            const share = (parseFloat(n.weight) || 0) / sumUnlocked;
            const adjusted = (parseFloat(n.weight) || 0) - delta * share;
            n.weight = Math.max(0, adjusted);
        });
    }
    // Final pass: enforce sum=100 (account for clamping rounding).
    const total = siblings.reduce((s, n) => s + (parseFloat(n.weight) || 0), 0);
    if (total > 0 && Math.abs(total - 100) > 0.001) {
        const scale = 100 / total;
        const fixedSum = (parseFloat(activeNode.weight) || 0) + sumLocked;
        // Scale only unlocked siblings (not the active or the locked ones).
        const unlockedSum = unlocked.reduce((s, n) => s + (parseFloat(n.weight) || 0), 0);
        const targetUnlockedSum = 100 - fixedSum;
        if (unlockedSum > 0 && targetUnlockedSum >= 0) {
            const k = targetUnlockedSum / unlockedSum;
            unlocked.forEach(n => { n.weight = (parseFloat(n.weight) || 0) * k; });
        }
    }
    return newPct;
}

// Phase 66.10 — a tree authored bottom-up carries no `weight` on any node.
// Entering top-down, seed every sibling group with equal percentage shares so
// the allocator and the slider agree from the very first render. Groups that
// already carry authored weights keep them and are merely normalised to 100.
function seedTopDownWeights(root) {
    if (!root) return;
    (function walk(n) {
        if (!n) return;
        const kids = n.children || n._children;
        if (!kids || !kids.length) return;
        const eq = 100 / kids.length;
        kids.forEach(k => {
            if (!k) return;
            const w = parseFloat(k.weight);
            if (!isFinite(w) || w < 0) k.weight = eq;
        });
        if (typeof _normalizeSiblingWeights === 'function') _normalizeSiblingWeights(kids);
        kids.forEach(walk);
    })(root);
}

function syncWeightSliderFromNode() {
    if (!selectedNodeData) return;
    const info = _findParentAndSiblings(selectedNodeData);
    if (!info) return;
    _normalizeSiblingWeights(info.siblings);
    const cur = parseFloat(selectedNodeData.weight) || (100 / info.siblings.length);
    const slider  = document.getElementById('config-weight');
    const display = document.getElementById('config-weight-display');
    const lock    = document.getElementById('config-weight-lock');
    const siblingHost = document.getElementById('config-weight-siblings');
    if (slider) slider.value = cur.toFixed(1);
    if (display) display.textContent = cur.toFixed(1) + '%';
    if (lock) lock.checked = !!selectedNodeData.weightLocked;
    if (siblingHost) {
        const lines = info.siblings.map(s => {
            const tag = s === selectedNodeData ? ' ◀ selected' : (s.weightLocked ? ' 🔒' : '');
            const lbl = (s.displayId || ('#' + s.id)) + ' — ' + (s.name || (s.type === 'gate' ? s.gateType : 'event'));
            const w = (parseFloat(s.weight) || 0).toFixed(1);
            return '  ' + lbl.slice(0, 38) + '  ' + w.padStart(5) + '%' + tag;
        });
        siblingHost.textContent = 'Sibling apportionment:\n' + lines.join('\n');
        siblingHost.style.whiteSpace = 'pre';
    }
    // Clamp the slider's max to (100 − sum of locked siblings excluding active).
    if (slider) {
        const sumLocked = info.siblings.filter(s => s !== selectedNodeData && s.weightLocked)
            .reduce((s, n) => s + (parseFloat(n.weight) || 0), 0);
        slider.max = String(Math.max(0, 100 - sumLocked));
    }
}

function _recomputeEffectiveWithExternalCaps(rootNode) {
    if (!rootNode) return;
    function walk(node, visited) {
        if (!node) return 0;
        if (visited.has(node.id)) return node.probability || 0;
        visited.add(node.id);
        const apportioned = (node._externalAllocation && node._externalAllocation.apportioned) || node.probability || 0;
        if (node.type !== 'gate') {
            // Leaves: external cap already applied during allocateTopDown.
            return node.probability || 0;
        }
        // TRANSFER / transfer-out — follow link
        if (node.gateType === 'TRANSFER' || node.transferOutTo) {
            const linkedId = node.transferOutTo || node.linkedPageId;
            if (linkedId) {
                const linked = ftaPages.find(p => p.id === linkedId);
                if (linked && linked.root) {
                    const p = walk(linked.root, visited);
                    node.probability = p;
                    return p;
                }
            }
            return 0;
        }
        const kids = node.children || node._children || [];
        if (!kids.length) return node.probability || 0;
        const childPs = kids.map(c => walk(c, visited));
        let gateP = 0;
        const gt = node.gateType;
        if (gt === 'AND' || gt === 'INHIBIT' || gt === 'PAND' || gt === 'SPARE') {
            gateP = childPs.reduce((a, b) => a * b, 1);
        } else if (gt === 'FDEP') {
            gateP = 0;
        } else if (gt === 'OR') {
            gateP = 1 - childPs.reduce((a, b) => a * (1 - b), 1);
        } else if (gt === 'VOTING' || gt === 'XOR') {
            const dp = new Array(childPs.length + 1).fill(0); dp[0] = 1;
            for (const p of childPs) {
                for (let i = childPs.length; i >= 1; i--) dp[i] = dp[i] * (1 - p) + dp[i - 1] * p;
                dp[0] = dp[0] * (1 - p);
            }
            if (gt === 'XOR') gateP = dp[1];
            else { const k = Math.min(node.votingK || 2, childPs.length); let sum = 0; for (let i = k; i <= childPs.length; i++) sum += dp[i]; gateP = sum; }
        }
        // Gate's own external cap (if any) — most conservative wins.
        let extP = null;
        try {
            if (typeof _getExternalSourceTarget === 'function' && node.externalSource) {
                extP = _getExternalSourceTarget(node);
            }
        } catch (e) { extP = null; }
        if (extP !== null && isFinite(extP)) gateP = Math.min(gateP, extP);
        // Diverges from apportioned target → flag + lock node.probability to effective.
        const denom = Math.max(apportioned, 1e-18);
        const diverged = Math.abs(gateP - apportioned) / denom > 0.001;
        if (diverged) {
            node._budgetMismatch = {
                apportioned: apportioned,
                effective: gateP,
                conservative: gateP < apportioned,
                ratio: gateP / denom
            };
        } else if (node._budgetMismatch) {
            delete node._budgetMismatch;
        }
        node.probability = gateP;
        return gateP;
    }
    walk(rootNode, new Set());
}

// Phase 56.41 — Detect repeated events (same logicalId in 2+ tree positions).
// Walks a tree resolving TRANSFERs and counts each logicalId. Used to decide
// whether to swap naive bottom-up for BDD-exact at the top, and to surface a
// "shared events" warning badge on affected gates.
function _hasRepeatedLogicalIds(rootNode) {
    if (!rootNode) return false;
    const counts = new Map();
    const visited = new Set();
    let found = false;
    (function walk(n) {
        if (!n || found) return;
        if (n.gateType === 'TRANSFER' || n.transferOutTo) {
            const linkedId = n.transferOutTo || n.linkedPageId;
            if (linkedId && !visited.has(linkedId)) {
                visited.add(linkedId);
                const linkedPage = (typeof ftaPages !== 'undefined') ? ftaPages.find(p => p.id === linkedId) : null;
                if (linkedPage && linkedPage.root) walk(linkedPage.root);
            }
            return;
        }
        const lid = n.logicalId != null ? n.logicalId : n.id;
        const c = (counts.get(lid) || 0) + 1;
        counts.set(lid, c);
        if (c >= 2) { found = true; return; }
        const kids = n.children || n._children;
        if (kids) kids.forEach(walk);
    })(rootNode);
    return found;
}

function _checkLeafFeasibility(rootNode) {
    if (!rootNode) return;
    const visited = new Set();
    (function walk(n) {
        if (!n) return;
        if (n.gateType === 'TRANSFER' || n.transferOutTo) {
            const linkedId = n.transferOutTo || n.linkedPageId;
            if (linkedId && !visited.has(linkedId)) {
                visited.add(linkedId);
                const linkedPage = (typeof ftaPages !== 'undefined') ? ftaPages.find(p => p.id === linkedId) : null;
                if (linkedPage && linkedPage.root) walk(linkedPage.root);
            }
            return;
        }
        if (n.type !== 'gate') {
            const ach = (typeof n.achievableLambda === 'number' && isFinite(n.achievableLambda) && n.achievableLambda > 0) ? n.achievableLambda : null;
            // Phase 61 — feasibility check runs in PROBABILITY space (allocation trees are
            // probability-only). The achievable physical rate is converted over this event's
            // exposure window: P_ach = 1−e^(−λ_ach·t). Unmaintained conversion — a deliberate
            // sanity heuristic: repair models could only IMPROVE achievable unavailability,
            // so this flags only certain infeasibility.
            const allocP = (typeof n.probability === 'number' && isFinite(n.probability) && n.probability > 0) ? n.probability : null;
            let achP = null;
            if (ach !== null) {
                const tEvt = (typeof _nodeExposureTime === 'function')
                    ? _nodeExposureTime(n, (typeof ftaConfig === 'object' && ftaConfig && ftaConfig.exposureTime) || 1)
                    : (((typeof ftaConfig === 'object' && ftaConfig && ftaConfig.exposureTime) || 1));
                achP = -Math.expm1(-ach * tEvt);
            }
            // INFEASIBLE: the component's physically achievable failure probability exceeds
            // the allocated budget — it would have to be MORE reliable than physics allows.
            if (achP !== null && allocP !== null && achP > allocP * 1.001) {
                n._feasibilityViolation = {
                    allocated: allocP,      // probability budget
                    achievable: achP,       // physically achievable probability over the exposure window
                    achievableLambda: ach,  // the underlying physical rate, for the tooltip
                    delta: achP / allocP    // how many × more reliable than physics allows
                };
            } else {
                delete n._feasibilityViolation;
            }
        }
        const kids = n.children || n._children;
        if (kids) kids.forEach(walk);
    })(rootNode);
}

function _flagGatesWithSharedSubtreeEvents(rootNode) {
    if (!rootNode) return;
    const visited = new Set();
    (function walk(n) {
        if (!n) return;
        if (n.type === 'gate' && n.gateType !== 'TRANSFER' && !n.transferOutTo) {
            n._sharedEventsInSubtree = _hasRepeatedLogicalIds(n);
        }
        if (n.gateType === 'TRANSFER' || n.transferOutTo) {
            const linkedId = n.transferOutTo || n.linkedPageId;
            if (linkedId && !visited.has(linkedId)) {
                visited.add(linkedId);
                const linkedPage = (typeof ftaPages !== 'undefined') ? ftaPages.find(p => p.id === linkedId) : null;
                if (linkedPage && linkedPage.root) walk(linkedPage.root);
            }
            return;
        }
        const kids = n.children || n._children;
        if (kids) kids.forEach(walk);
    })(rootNode);
}

// Phase 56.44 — For every intermediate gate whose subtree contains repeated
// logicalIds, replace the naive bottom-up probability with the BDD-exact
// reconstruction. This makes every displayed gate probability mathematically
// correct in the presence of shared events, not just the root. Post-order
// walk so deeper gates are corrected before their ancestors. Skips the
// active root (which is governed by the target/actual display in top-down
// mode, or already corrected to BDD-exact in bottom-up mode).
function _normalizeIntermediateGatesForSharedEvents(rootNode) {
    if (!rootNode || typeof computeExactProbability !== 'function') return;
    const tExp = (typeof ftaConfig === 'object' && ftaConfig && ftaConfig.exposureTime) ? ftaConfig.exposureTime : 1;
    const visited = new Set();
    (function walk(n) {
        if (!n) return;
        if (n.gateType === 'TRANSFER' || n.transferOutTo) {
            const linkedId = n.transferOutTo || n.linkedPageId;
            if (linkedId && !visited.has(linkedId)) {
                visited.add(linkedId);
                const linkedPage = (typeof ftaPages !== 'undefined') ? ftaPages.find(p => p.id === linkedId) : null;
                if (linkedPage && linkedPage.root) walk(linkedPage.root);
            }
            return;
        }
        const kids = n.children || n._children;
        if (kids) kids.forEach(walk);  // post-order: children first
        if (n === rootNode) return;     // skip root — governed by target/actual logic
        if (n.type !== 'gate') return;
        if (!n._sharedEventsInSubtree) return;
        try {
            const exact = computeExactProbability(n);
            if (exact && typeof exact.prob === 'number' && isFinite(exact.prob)) {
                n.probability = exact.prob;
                // Phase 61 — λ-equivalent only on verification (bottom-up) trees; allocation is probability-only.
                if (ftaConfig && ftaConfig.mode === 'top-down') delete n.lambda;
                else n.lambda = (exact.prob > 0 && exact.prob < 1) ? (-Math.log1p(-exact.prob) / tExp) : 0;
            }
        } catch (e) { /* skip on error — leave naive value */ }
    })(rootNode);
}

function mcsAwareRebalance(rootNode, targetProb) {
    if (!rootNode || typeof computeExactProbability !== 'function') return false;
    if (typeof targetProb !== 'number' || !isFinite(targetProb) || targetProb <= 0) return false;

    // Gather UNIQUE variables (each logicalId → [tree-position instances]).
    // TRANSFER boundaries are followed so subtree leaves participate.
    const uniqueVars = new Map();
    const visited = new Set();
    (function walk(n) {
        if (!n) return;
        if (n.gateType === 'TRANSFER' || n.transferOutTo) {
            const linkedId = n.transferOutTo || n.linkedPageId;
            if (linkedId && !visited.has(linkedId)) {
                visited.add(linkedId);
                const linkedPage = (typeof ftaPages !== 'undefined') ? ftaPages.find(p => p.id === linkedId) : null;
                if (linkedPage && linkedPage.root) walk(linkedPage.root);
            }
            return;
        }
        if (n.type !== 'gate') {
            const lid = n.logicalId != null ? n.logicalId : n.id;
            if (!uniqueVars.has(lid)) uniqueVars.set(lid, []);
            uniqueVars.get(lid).push(n);
        }
        const kids = n.children || n._children;
        if (kids) kids.forEach(walk);
    })(rootNode);

    if (uniqueVars.size === 0) return false;

    // Snapshot the naive per-variable probability. Use first instance (all
    // instances of a shared event have the same value after allocateTopDown +
    // propagation, but we take the strictest to be safe).
    const naiveProbs = new Map();
    uniqueVars.forEach((nodes, lid) => {
        let strictest = Infinity;
        nodes.forEach(n => {
            const p = (typeof n.probability === 'number' && isFinite(n.probability)) ? n.probability : Infinity;
            if (p < strictest) strictest = p;
        });
        naiveProbs.set(lid, isFinite(strictest) ? strictest : 0);
    });

    const tExp = (typeof ftaConfig === 'object' && ftaConfig && ftaConfig.exposureTime) ? ftaConfig.exposureTime : 1;

    function applyScaleAndEvaluate(k) {
        uniqueVars.forEach((nodes, lid) => {
            const base = naiveProbs.get(lid) || 0;
            const scaled = Math.min(0.9999, Math.max(0, base * k));
            nodes.forEach(n => {
                n.probability = scaled;
                delete n.lambda;   // Phase 61 — allocation is probability-only
            });
        });
        const exact = computeExactProbability(rootNode);
        return exact && isFinite(exact.prob) ? exact.prob : 0;
    }

    // First check: with k=1 (naive allocation), what does BDD-exact give us?
    const pAtOne = applyScaleAndEvaluate(1.0);
    if (pAtOne <= targetProb * 1.001) {
        // Naive is already feasible or under. Leave at k=1 (no rebalance needed)
        // and let any small headroom show via the divergence display.
        return true;
    }

    // Bisection on k in (0, 1]. We want to shrink rates so the dominant cutset
    // probability drops to the target. Converges in ~50 iterations.
    let kLo = 0.0, kHi = 1.0;
    let kBest = 1.0;
    const tolRel = 1e-4;
    for (let iter = 0; iter < 60; iter++) {
        const kMid = 0.5 * (kLo + kHi);
        const pMid = applyScaleAndEvaluate(kMid);
        kBest = kMid;
        if (Math.abs(pMid - targetProb) / targetProb < tolRel) break;
        if (pMid > targetProb) kHi = kMid;
        else                   kLo = kMid;
    }
    // Final state at converged k. Lambda + probability on every leaf is now
    // the MCS-aware allocated value (uniform-scaled from naive).
    applyScaleAndEvaluate(kBest);
    return true;
}

function mcsAwareImportanceRedistribute(rootNode, targetProb) {
    if (!rootNode || typeof computeExactProbability !== 'function') return false;
    if (typeof targetProb !== 'number' || !isFinite(targetProb) || targetProb <= 0) return false;
    const MAX_VARS = 30;

    // Gather unique variables.
    const uniqueVars = new Map();
    const visited = new Set();
    (function walk(n) {
        if (!n) return;
        if (n.gateType === 'TRANSFER' || n.transferOutTo) {
            const linkedId = n.transferOutTo || n.linkedPageId;
            if (linkedId && !visited.has(linkedId)) {
                visited.add(linkedId);
                const linkedPage = (typeof ftaPages !== 'undefined') ? ftaPages.find(p => p.id === linkedId) : null;
                if (linkedPage && linkedPage.root) walk(linkedPage.root);
            }
            return;
        }
        if (n.type !== 'gate') {
            const lid = n.logicalId != null ? n.logicalId : n.id;
            if (!uniqueVars.has(lid)) uniqueVars.set(lid, []);
            uniqueVars.get(lid).push(n);
        }
        const kids = n.children || n._children;
        if (kids) kids.forEach(walk);
    })(rootNode);

    if (uniqueVars.size === 0 || uniqueVars.size > MAX_VARS) return false;

    const birnbaum = _computeBirnbaumPerVariable(rootNode, uniqueVars);
    if (!birnbaum) return false;

    // Equi-importance target: each variable contributes targetProb/N to top.
    // Linear approximation: contribution_v ≈ B_v × p_v. Set p_v = (T/N) / B_v.
    const N = uniqueVars.size;
    const shareEach = targetProb / N;
    const tExp = (typeof ftaConfig === 'object' && ftaConfig && ftaConfig.exposureTime) ? ftaConfig.exposureTime : 1;
    uniqueVars.forEach((nodes, lid) => {
        const B = birnbaum.get(lid) || 0;
        if (B <= 0) return;   // variable doesn't contribute — leave as-is
        const pNew = Math.min(0.9999, Math.max(0, shareEach / B));
        nodes.forEach(n => { n.probability = pNew; delete n.lambda; });   // Phase 61 — probability-only
    });

    // Final uniform re-scale to pin BDD-exact back to target after redistribution.
    const snapshot = new Map();
    uniqueVars.forEach((nodes, lid) => { snapshot.set(lid, nodes[0].probability); });

    function applyScale(k) {
        uniqueVars.forEach((nodes, lid) => {
            const base = snapshot.get(lid) || 0;
            const scaled = Math.min(0.9999, Math.max(0, base * k));
            nodes.forEach(n => { n.probability = scaled; delete n.lambda; });   // Phase 61 — probability-only
        });
        const r = computeExactProbability(rootNode);
        return r && isFinite(r.prob) ? r.prob : 0;
    }

    let kLo = 0.0, kHi = 4.0;   // allow some upward flex if redistribution under-shot
    // Probe upper bound
    let pHi = applyScale(kHi);
    while (pHi < targetProb && kHi < 1e9) { kHi *= 4; pHi = applyScale(kHi); }
    let kBest = 1.0;
    for (let i = 0; i < 60; i++) {
        const kMid = 0.5 * (kLo + kHi);
        const pMid = applyScale(kMid);
        kBest = kMid;
        if (Math.abs(pMid - targetProb) / targetProb < 1e-4) break;
        if (pMid > targetProb) kHi = kMid; else kLo = kMid;
    }
    applyScale(kBest);
    return true;
}

function _gtvCloseEcoModal(){
    try { const ex = document.getElementById('gt-eco-modal'); if(ex && ex.parentNode) ex.parentNode.removeChild(ex); } catch(_){}
    try { if(_gtvEcoEscHandler){ document.removeEventListener('keydown', _gtvEcoEscHandler); _gtvEcoEscHandler = null; } } catch(_){}
}
// Route to the exact item a pill represents. Systems + fault trees land on the precise
// workspace/page; the rest land on their scoped view (best available today). vv nodes are a
// status bucket with no record, so they fall back to the requirements repo.
function _gtvNavigateTo(node){
    if(!node) return false;
    const r = node.ref || null;
    // After landing on the destination screen, flash the exact row that was
    // clicked in the golden thread (Waqas, 15 Aug: "the item clicked on the
    // previous screen should be highlighted"). Rows carry their identity via
    // reviewCellHtml's data-artifact-* stamp; _highlightArtifactRow does the
    // scroll + flash. Workspace destinations render async, so those get a
    // longer delay and one retry — a highlight that misses is a no-op, never
    // an error.
    const hl = (kind, id, delay) => {
        if(id == null) return;
        setTimeout(() => {
            try {
                const ok = typeof _highlightArtifactRow === 'function' && _highlightArtifactRow(kind, id);
                if(!ok) setTimeout(() => { try { if(typeof _highlightArtifactRow === 'function') _highlightArtifactRow(kind, id); } catch(_){} }, 450);
            } catch(_){}
        }, delay || 220);
    };
    try {
        if(!r || node.kind === 'vv'){ if(typeof switchTab === 'function') switchTab('reqs-repo'); return true; }
        switch(r.kind){
            case 'acFunc': if(typeof switchTab === 'function') switchTab('ac-func'); hl('acFunc', r.id); return true;
            case 'system':
                if(typeof openSystemWorkspace === 'function') openSystemWorkspace(r.id);
                hl('system', r.id, 420);   // Phase 66.11 — was silent on arrival
                return true;
            case 'acFha':  if(typeof switchTab === 'function') switchTab('ac-fha'); hl('acFha', r.id); return true;
            case 'sysFha':
                if(r.systemId && typeof openSystemWorkspace === 'function'){ openSystemWorkspace(r.systemId); try { if(typeof switchWorkspaceTab === 'function') switchWorkspaceTab('fha'); } catch(_){} hl('sysFha', r.id, 420); }
                else { if(typeof switchTab === 'function') switchTab('ac-fha'); hl('acFha', r.id); }
                return true;
            case 'ftaPage':
                // Phase 66.11 — landing on a tree used to mark nothing at all. Ring the
                // tree's top event so the user can see what they were sent to.
                if(typeof openFTAPageById === 'function') openFTAPageById(r.id);
                setTimeout(() => { try {
                    const pg = (typeof ftaPages !== 'undefined') ? ftaPages.find(x => x.id === r.id) : null;
                    if(pg && pg.root && typeof _slHighlightFtaNode === 'function') _slHighlightFtaNode(pg.root.id);
                } catch(_){} }, 340);
                return true;
            case 'cma': if(typeof switchTab === 'function') switchTab('cma'); hl('cma', r.id); return true;
            case 'zsa': if(typeof switchTab === 'function') switchTab('zsa'); hl('zsa', r.id); return true;
            case 'pra': if(typeof switchTab === 'function') switchTab('pra'); hl('pra', r.id); return true;
            case 'acReq': if(typeof switchTab === 'function') switchTab('reqs-repo'); hl('acReq', r.id); return true;
            case 'sysReq':
                if(r.systemId && typeof openSystemWorkspace === 'function'){ openSystemWorkspace(r.systemId); try { if(typeof switchWorkspaceTab === 'function') switchWorkspaceTab('req'); } catch(_){} hl('sysReq', r.id, 420); }
                else { if(typeof switchTab === 'function') switchTab('reqs-repo'); hl('acReq', r.id); }
                return true;
            default: return false;
        }
    } catch(e){ return false; }
}
function _gtvShowEcoModal(key, graph){
    try {
        const byKey = {}; graph.nodes.forEach(n => byKey[n.key] = n);
        const out = {}, inc = {}; graph.nodes.forEach(n => { out[n.key] = []; inc[n.key] = []; });
        graph.links.forEach(L => { if(out[L.s]) out[L.s].push(L.t); if(inc[L.t]) inc[L.t].push(L.s); });
        function closure(start, adj){ const seen = {}, st = (adj[start]||[]).slice(), o = []; while(st.length){ const x = st.pop(); if(seen[x]) continue; seen[x] = 1; o.push(x); (adj[x]||[]).forEach(y => { if(!seen[y]) st.push(y); }); } return o; }
        const n = byKey[key]; if(!n) return;
        const reach = {}; reach[key] = 1; closure(key, out).forEach(k => reach[k] = 1); closure(key, inc).forEach(k => reach[k] = 1);
        const groups = {}; _GTV_LAYERS.forEach(l => groups[l] = []);
        Object.keys(reach).forEach(k => { const m = byKey[k]; if(m && m.key !== key && groups[m.kind]) groups[m.kind].push(m); });
        const count = Object.keys(reach).length - 1;
        function pills(arr){
            return '<div style="display:flex; flex-wrap:wrap; gap:7px;">' + arr.map(m => {
                const fc = m.flag ? _GTV_FLAGC[m.flag] : _GTV_COLOR[m.kind];
                const tag = m.flag ? '<span style="margin-left:5px; font-size:10px; font-weight:700; color:' + fc + ';">' + m.flag.toUpperCase() + '</span>' : '';
                const nav = !!m.ref && m.kind !== 'vv';
                const arrow = nav ? '<span style="margin-left:5px; opacity:.45; font-size:12px;">→</span>' : '';
                return '<span class="gtem-pill"' + (nav ? (' data-navkey="' + esc(m.key) + '" role="button" tabindex="0" title="Open ' + esc(m.label) + '"') : '')
                    + ' style="display:inline-flex; align-items:center; gap:7px; font-size:12.5px; padding:6px 11px; border-radius:8px; border:1px solid ' + (m.flag ? fc : 'var(--color-border-hair)') + '; background:var(--color-surface-2); color:var(--color-text-primary); cursor:' + (nav ? 'pointer' : 'default') + '; transition:background .12s, box-shadow .12s;">'
                    + '<span style="width:9px; height:9px; border-radius:3px; background:' + fc + '; flex:none;"></span>' + esc(m.label) + tag + arrow + '</span>';
            }).join('') + '</div>';
        }
        let body = '<div style="display:flex; align-items:center; gap:9px; flex-wrap:wrap; margin:2px 34px 6px 2px;">'
            + '<span style="font-size:11px; padding:3px 10px; border-radius:999px; color:#fff; font-weight:700; background:' + _GTV_COLOR[n.kind] + ';">' + _GTV_LNAME[n.kind] + '</span>'
            + '<span style="font-size:17px; font-weight:700; color:var(--color-text-primary);">' + esc(n.label) + '</span></div>'
            + '<div style="font-size:12px; color:var(--color-text-tertiary); margin-bottom:10px;">Threads through ' + count + ' linked item' + (count === 1 ? '' : 's') + ' · click any item to open it</div>'
            // 25 Aug 2026 — the same door as the inline panel (see _gtvShowEco
            // in fta_view_modules.js). The modal excluded the clicked node from
            // its own pill list too, so BOTH surfaces had to be fixed or the
            // reviewer's complaint would survive in whichever one he opened.
            + ((!!n.ref && n.kind !== 'vv')
                ? '<div style="margin:-4px 0 11px;"><span class="gtem-pill gtem-self" data-navkey="' + esc(n.key) + '" role="button" tabindex="0" title="Open ' + esc(n.label) + '"'
                  + ' style="display:inline-flex; align-items:center; gap:7px; font-size:13px; font-weight:700; padding:6px 12px; border-radius:8px; border:1px solid ' + _GTV_COLOR[n.kind] + '; background:var(--color-surface-2); color:var(--color-text-primary); cursor:pointer; transition:background .12s, box-shadow .12s;">'
                  + '<span style="width:9px; height:9px; border-radius:3px; background:' + _GTV_COLOR[n.kind] + '; flex:none;"></span>Open ' + esc(n.label)
                  + '<span style="opacity:.45; font-size:12px;">→</span></span></div>'
                : '')
            + (n.flag ? '<div style="margin:2px 0 10px; padding:9px 12px; border-radius:8px; border:1px solid ' + _GTV_FLAGC[n.flag] + '; background:var(--color-surface-1); font-size:12.5px; color:' + _GTV_FLAGC[n.flag] + ';"><strong>' + n.flag.toUpperCase() + '</strong>' + (n.flagReason ? ' — ' + esc(n.flagReason) : '') + '</div>' : '');
        _GTV_LAYERS.forEach(l => { if(groups[l].length){ body += '<div style="margin-top:13px;"><div style="font-size:12px; font-weight:700; color:var(--color-text-secondary); margin-bottom:7px;">' + _GTV_LNAME[l] + ' (' + groups[l].length + ')</div>' + pills(groups[l]) + '</div>'; } });
        if(n.kind === 'func'){ body += '<button class="action-btn" id="gtem-report" style="margin-top:16px; background:var(--color-accent);" data-sub="' + esc(n.id) + '">📄 Generate trace report for ' + esc(n.id) + '</button>'; }

        _gtvCloseEcoModal();
        const overlay = document.createElement('div');
        overlay.id = 'gt-eco-modal';
        overlay.style.cssText = 'position:fixed; inset:0; z-index:100000; background:rgba(10,15,25,.45); display:flex; align-items:center; justify-content:center; padding:24px;';
        overlay.innerHTML = '<div class="gtem-card" role="dialog" aria-modal="true" style="background:var(--color-surface-1,#fff); border:1px solid var(--color-border-hair); border-radius:15px; max-width:720px; width:100%; max-height:82vh; overflow:auto; box-shadow:0 24px 64px rgba(0,0,0,.34); padding:20px 22px 22px; position:relative;">'
            + '<button id="gtem-close" aria-label="Close" style="position:absolute; top:11px; right:14px; background:transparent; border:none; font-size:23px; line-height:1; cursor:pointer; color:var(--color-text-secondary);">×</button>'
            + body + '</div>';
        document.body.appendChild(overlay);

        overlay.addEventListener('click', e => { if(e.target === overlay) _gtvCloseEcoModal(); });
        const cb = overlay.querySelector('#gtem-close'); if(cb) cb.addEventListener('click', _gtvCloseEcoModal);
        overlay.querySelectorAll('.gtem-pill[data-navkey]').forEach(el => {
            el.addEventListener('mouseenter', () => { el.style.background = 'var(--color-surface-3, #eef1f7)'; el.style.boxShadow = '0 1px 4px rgba(0,0,0,.12)'; });
            el.addEventListener('mouseleave', () => { el.style.background = 'var(--color-surface-2)'; el.style.boxShadow = 'none'; });
            const go = () => { const m = byKey[el.getAttribute('data-navkey')]; if(!m) return; const ok = _gtvNavigateTo(m); _gtvCloseEcoModal(); if(ok && window.showToast) showToast('Opened ' + m.label, 'info', 1700); };
            el.addEventListener('click', go);
            el.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); go(); } });
        });
        const rb = overlay.querySelector('#gtem-report');
        if(rb) rb.addEventListener('click', function(){
            const sub = this.getAttribute('data-sub'); this.disabled = true; this.textContent = 'Generating…';
            if(window.Reports && Reports.generate){
                Reports.generate({ reportType: 'GTT', format: 'docx', functionSubId: sub })
                    .then(r => { if(window.showToast) showToast('Generated ' + r.name, 'success', 3500); })
                    .catch(e => { if(window.showToast) showToast(String(e && e.message || e), 'error', 4500); })
                    .then(() => { rb.disabled = false; rb.textContent = '📄 Generate trace report for ' + sub; });
            }
        });
        _gtvEcoEscHandler = function(e){ if(e.key === 'Escape') _gtvCloseEcoModal(); };
        document.addEventListener('keydown', _gtvEcoEscHandler);
    } catch(e){ try { console.warn('gtv eco modal failed', e); } catch(_){} }
}

// #IFACE — system↔system interface panel under the golden thread. Self-contained and
// additive (manages its own DOM node), so it never touches the D3 graph or any
// deterministic path. Shows the lateral edges the AI builds from ICDs. Removed when empty.
function _ifacePanel(id, html, create){
    try {
        let p = document.getElementById(id);
        if(!html){ if(p) p.remove(); return; }
        if(!p){ p = create(); if(!p) return; }
        p.innerHTML = html;
    } catch(_){}
}
// System interfaces are DERIVED from the resources + interdependence tables —
// a provider→consumer edge exists wherever one system provides a resource another
// consumes. `relevantSet` (system ids) scopes it; null = project-wide.
function _ifaceEdges(relevantSet){
    const edges = []; const seen = {};
    (typeof resourcesData !== 'undefined' ? (resourcesData || []) : []).forEach(r => {
        const provs = (r.providedBy || []);
        const cons = new Set((r.consumedBySystems || []).map(String));
        try { if(typeof _resFnConsumers === 'function') _resFnConsumers(r).forEach(id => cons.add(String(id))); } catch(_){}
        provs.forEach(p => cons.forEach(c => {
            if(String(p) === String(c)) return;
            if(relevantSet && !relevantSet.has(String(c))) return;   // consumer must be on this function's thread
            const key = p + '>' + c + '>' + (r.resId || r.name);
            if(seen[key]) return; seen[key] = 1;
            edges.push({ from: String(p), to: String(c), medium: (r.name || r.resId || 'resource'), res: (r.resId || '') });
        }));
    });
    return edges;
}
function _ifaceHtml(edges, title){
    if(!edges.length) return '';
    const sysName = id => { const s = (systemsData||[]).find(x => String(x.id) === String(id)); return s ? s.name : (id || '?'); };
    const rows = edges.map(e => '<tr>'
        + '<td><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#d97706;margin-right:6px;vertical-align:middle;"></span>Shared resource</td>'
        + '<td>' + esc(sysName(e.from)) + ' <span style="color:var(--color-text-tertiary);">→</span> ' + esc(sysName(e.to)) + '</td>'
        + '<td>' + esc(e.medium) + '</td>'
        + '<td>' + esc(e.res || '—') + '</td></tr>').join('');
    return '<div style="font-size:13px;font-weight:600;color:var(--color-text-primary);margin:0 0 8px;">System interfaces <span style="font-weight:400;color:var(--color-text-tertiary);">— ' + title + ' (' + edges.length + ')</span></div>'
        + '<table class="data-table" style="width:100%;font-size:12.5px;"><thead><tr><th style="text-align:left;">Kind</th><th style="text-align:left;">From → To</th><th style="text-align:left;">Medium</th><th style="text-align:left;">Resource</th></tr></thead><tbody>' + rows + '</tbody></table>';
}
function renderInterfaces(){
    try {
        // Golden-thread view: FUNCTION-SPECIFIC, driven by the resources +
        // interdependence tables — only interfaces feeding a system that appears
        // on the selected function's thread.
        const pick = document.getElementById('gt-func-pick');
        const scope = pick ? pick.value : '';
        let gtHtml = '';
        if(scope){
            const relevant = new Set();
            const fcs = [];
            (acFhaData||[]).forEach(f => { if(f.subId === scope) fcs.push(f); });
            (systemsData||[]).forEach(s => (s.fha||[]).forEach(f => { if(f.subId === scope){ fcs.push(f); relevant.add(String(s.id)); } }));
            fcs.forEach(fc => { try { if(typeof idpContributors === 'function') idpContributors(fc).forEach(id => relevant.add(String(id))); } catch(_){} });
            const fn = (acFunctionsData||[]).find(f => f.subId === scope);
            gtHtml = _ifaceHtml(_ifaceEdges(relevant), 'resource &amp; interdependence edges for ' + esc(scope + (fn && fn.subName ? ' · ' + fn.subName : '')));
        }
        _ifacePanel('sl-interfaces-panel', gtHtml, function(){
            const host = document.getElementById('gt-sankey-host'); if(!host || !host.parentNode) return null;
            const p = document.createElement('div'); p.id = 'sl-interfaces-panel'; p.style.cssText = 'margin-top:18px;';
            host.parentNode.insertBefore(p, host.nextSibling); return p;
        });
        // Trace-matrix view (no function scope there): project-wide resource edges.
        _ifacePanel('sl-interfaces-panel-trace', _ifaceHtml(_ifaceEdges(null), 'resource &amp; interdependence edges (project)'), function(){
            const view = document.getElementById('view-trace'); if(!view) return null;
            const p = document.createElement('div'); p.id = 'sl-interfaces-panel-trace'; p.style.cssText = 'margin-top:18px;';
            view.appendChild(p); return p;
        });
    } catch(_){}
}

function autoReqBadgesHtml(row){
    if(!row || !row.reqSource) return '';
    const src = row.reqSource;
    const label = AutoReq.GEN_LABELS[src.generator] || src.generator || 'auto';
    const parts = [];
    parts.push(`<span class="ar-badge ar-badge-auto" title="Auto-generated: ${esc(label)}">auto</span>`);
    // Phase 53.48 — verification-evidence badge for FTA-event + FHA reqs.
    try {
        const ev = getAutoReqVerificationEvidence(row);
        if (ev) {
            const tones = {
                'pass':       { bg: 'rgba(52, 199, 89, 0.16)',  fg: '#1f7a3a', border: 'rgba(52, 199, 89, 0.32)' },
                'fail':       { bg: 'rgba(255, 59, 48, 0.16)',  fg: '#b91c1c', border: 'rgba(255, 59, 48, 0.32)' },
                'awaiting':   { bg: 'rgba(255, 149, 0, 0.14)',  fg: '#c2680a', border: 'rgba(255, 149, 0, 0.30)' },
                'no-mirror':  { bg: 'var(--color-surface-2)',    fg: 'var(--color-text-tertiary)', border: 'var(--color-border-hair)' },
                'no-node':    { bg: 'rgba(245, 158, 11, 0.14)', fg: '#c2680a', border: 'rgba(245, 158, 11, 0.30)' }
            };
            const t = tones[ev.state] || tones['no-mirror'];
            parts.push('<span class="ar-badge ar-badge-verify" title="' + esc(ev.detail || '') + '" style="background: ' + t.bg + '; color: ' + t.fg + '; border: 1px solid ' + t.border + ';">' + esc(ev.label) + '</span>');
        }
    } catch(_) {}
    if(src.stale){
        parts.push(`<span class="ar-badge ar-badge-stale" title="Source has changed since this requirement was generated. Click 'Auto-generate' to review the diff.">stale</span>`);
    }
    if(src.orphan){
        parts.push(`<span class="ar-badge ar-badge-orphan" title="Source has been deleted from the project.">orphan</span>`);
    }
    if(row.compromised && row.compromiseReasons && row.compromiseReasons.length){
        const detail = row.compromiseReasons.map(r => '• ' + r.detail).join('\n');
        parts.push(`<span class="ar-badge ar-badge-compromised" title="${esc(detail)}" onclick="showCompromisePanel(${esc(row.internalId)}, '${esc(window._autoReqActiveScope || 'ac')}'); event.stopPropagation();">compromised</span>`);
    }
    if(src.obsolete && row.status !== 'archived'){
        const reason = esc(src.obsolete.reason || '');
        const ref = esc(src.obsolete.supersededByRef || '');
        parts.push(`<span class="ar-badge ar-badge-obsolete" title="Less conservative than its counterpart in the other scope. Superseded by: ${ref}. ${reason}">obsolete — superseded by ${ref}</span>`);
        parts.push(`<button class="ar-badge ar-badge-archive-btn" onclick="archiveRequirement(${row.internalId}, '${esc(window._autoReqActiveScope || _scopeForReq(row) || 'ac')}'); event.stopPropagation();" title="Archive this requirement (keeps it in the data, hidden from the active filter)">Archive</button>`);
    }
    if(row.status === 'archived'){
        parts.push(`<span class="ar-badge ar-badge-archived" title="Archived on ${esc(new Date(row.archivedAt || 0).toLocaleDateString())}. ${esc(row.archivedReason || '')}">archived</span>`);
    }
    return ` <span class="ar-badge-row">${parts.join('')}</span>`;
}

// Determine which scope a given requirement belongs to (used when triggering scope-specific
// re-renders after archiving). Searches acReqData and all systems[].req.
function _scopeForReq(row) {
    if (!row) return null;
    if ((acReqData || []).some(r => String(r.internalId) === String(row.internalId))) return 'ac';
    for (const s of (systemsData || [])) {
        if ((s.req || []).some(r => String(r.internalId) === String(row.internalId))) return 'sys-' + s.id;
    }
    return null;
}

// Archive a requirement — sets status='archived' but never deletes the row.
function archiveRequirement(internalId, scope) {
    const stores = [];
    if (acReqData) stores.push({ data: acReqData, scope: 'ac' });
    (systemsData || []).forEach(s => stores.push({ data: s.req || [], scope: 'sys-' + s.id }));
    for (const st of stores) {
        const idx = st.data.findIndex(r => String(r.internalId) === String(internalId));
        if (idx < 0) continue;
        const row = st.data[idx];
        if (row.status === 'archived') return showToast('Already archived.', 'info', 2000);
        if (!confirm(`Archive requirement ${row.traceId || 'REQ-' + row.internalId}? It will be retained in the project for audit but hidden from the active filter view.`)) return;
        row.status = 'archived';
        row.archivedAt = Date.now();
        row.archivedReason = (row.reqSource && row.reqSource.obsolete)
            ? 'Less conservative than ' + (row.reqSource.obsolete.supersededByRef || 'superseding req')
            : 'User-archived';
        if (st.scope === 'ac' && typeof renderACReq === 'function') renderACReq();
        else if (typeof renderSysReq === 'function') renderSysReq();
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
        showToast('Requirement archived.', 'success', 2500);
        return;
    }
    showToast('Requirement not found.', 'error', 3000);
}

function openReconcileModal() {
    _reconcilePendingPairs = null;
    document.getElementById('reconcile-results-area').innerHTML = '<p class="u-muted-italic">Click "Scan for Duplicates" to find overlapping AC↔Sys requirements.</p>';
    document.getElementById('reconcile-apply-btn').disabled = true;
    const m = document.getElementById('reconcile-modal');
    m.style.display = 'flex';
    setTimeout(() => m.classList.add('show'), 10);
}
function closeReconcileModal() {
    const m = document.getElementById('reconcile-modal');
    m.classList.remove('show');
    setTimeout(() => m.style.display = 'none', 250);
}

function runDuplicateScan() {
    const pairs = AutoReq.findDuplicates();
    _reconcilePendingPairs = pairs;
    const area = document.getElementById('reconcile-results-area');
    if (!pairs.length) {
        area.innerHTML = '<div style="padding: var(--s-4); background: rgba(52, 199, 89, 0.10); border: 1px solid rgba(52, 199, 89, 0.3); border-radius: var(--r-md); color: var(--color-success); font-size: 13px;">✓ No duplicates found. AC↔Sys requirements are consistent.</div>';
        document.getElementById('reconcile-apply-btn').disabled = true;
        return;
    }
    const rows = pairs.map((p, i) => {
        const winnerScope = _scopeOf(p.winner) || 'ac';
        const loserScope = _scopeOf(p.loser) || 'ac';
        return `<div style="padding: var(--s-4); border: 1px solid var(--color-border-hair); border-radius: var(--r-md); background: var(--color-surface-2); margin-bottom: var(--s-3);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <strong class="u-text-md">Pair ${i + 1} · ${esc(AutoReq.GEN_LABELS[p.kind] || p.kind)}</strong>
                <span style="font-size: 11px; color: var(--color-text-tertiary); font-style: italic;">${esc(p.reason)}</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div style="padding: 10px; background: rgba(52, 199, 89, 0.10); border: 1px solid rgba(52, 199, 89, 0.3); border-radius: var(--r-sm);">
                    <div style="font-size: 10px; color: var(--color-success); font-weight: 700; letter-spacing: 0.06em; margin-bottom: 4px;">✓ MORE CONSERVATIVE · ${esc(winnerScope.toUpperCase())}</div>
                    <div style="font-size: 12px; line-height: 1.4;">${esc(p.winner.text)}</div>
                </div>
                <div style="padding: 10px; background: rgba(255, 149, 0, 0.10); border: 1px solid rgba(255, 149, 0, 0.3); border-radius: var(--r-sm);">
                    <div style="font-size: 10px; color: var(--color-warning); font-weight: 700; letter-spacing: 0.06em; margin-bottom: 4px;">⚠ LESS CONSERVATIVE · ${esc(loserScope.toUpperCase())} · will be flagged obsolete</div>
                    <div style="font-size: 12px; line-height: 1.4;">${esc(p.loser.text)}</div>
                </div>
            </div>
        </div>`;
    }).join('');
    area.innerHTML = `<div style="margin-bottom: var(--s-3); font-size: 12px; color: var(--color-text-secondary);">Found ${pairs.length} duplicate pair${pairs.length === 1 ? '' : 's'}.</div>` + rows;
    document.getElementById('reconcile-apply-btn').disabled = false;
}

function applyReconcileResults() {
    if (!_reconcilePendingPairs || !_reconcilePendingPairs.length) return;
    const n = AutoReq.applyObsoleteTags(_reconcilePendingPairs);
    showToast('Flagged ' + n + ' requirement' + (n === 1 ? '' : 's') + ' as obsolete. They are still in your project — archive each one individually after review.', 'success', 5000);
    closeReconcileModal();
    if (typeof renderACReq === 'function') renderACReq();
    if (typeof renderSysReq === 'function') renderSysReq();
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
}

// Expose internal _scopeOf for the badge HTML (since closure inside AutoReq IIFE isn't reachable).
function _scopeOf(req) {
    if (!req || !req.reqSource) return null;
    const s = req.reqSource.sourceId || '';
    if (s.indexOf('ac:') === 0) return 'ac';
    const m = s.match(/^sys-([^:]+):/);
    return m ? ('sys-' + m[1]) : null;
}

function openAutoReqModal(scope){
    // Phase 53.69 — AutoReq generation is gated for the EDU tier (students/universities).
    // Pro, Pro+, and Enterprise all include it; EDU is stripped by design.
    if (typeof canUseAutoReq === 'function' && !canUseAutoReq()) {
        showUpgradeRequiredToast('Auto-generate Requirements', 'pro');
        return;
    }
    window._autoReqActiveScope = scope || 'ac';
    const modal = document.getElementById('autoreq-modal');
    if(!modal) return;
    // Reset checkboxes to default on
    ['ar-gen-fha','ar-gen-fta','ar-gen-dal','ar-gen-gate','ar-gen-pra','ar-gen-zsa','ar-gen-fcim-mon'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.checked = true;
    });
    // PRA / ZSA generators are AC-scope only — disable them on a System scope so the user
    // doesn't think they apply per-system.
    const isAc = (scope || 'ac') === 'ac';
    ['ar-gen-pra','ar-gen-zsa','ar-gen-fcim-mon'].forEach(id => {
        const el = document.getElementById(id);
        if(!el) return;
        el.disabled = !isAc;
        if(!isAc) el.checked = false;
        const lbl = el.parentElement;
        if(lbl) lbl.style.opacity = isAc ? '1' : '0.5';
    });
    document.getElementById('ar-modal-scope').textContent = scope === 'ac' ? 'Aircraft' : 'System';
    document.getElementById('ar-preview-area').innerHTML = '<p style="color:var(--text-secondary); font-style:italic;">Click "Preview" to see what will be generated.</p>';
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
}
function closeAutoReqModal(){
    const modal = document.getElementById('autoreq-modal');
    if(!modal) return;
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 250);
}

function autoReqPreview(){
    const scope = window._autoReqActiveScope || 'ac';
    const cb = id => { const el = document.getElementById(id); return !!(el && el.checked && !el.disabled); };
    const opts = {
        fha:              cb('ar-gen-fha'),
        ftaEvent:         cb('ar-gen-fta'),
        dalgebra:         cb('ar-gen-dal'),
        gateIndependence: cb('ar-gen-gate'),
        praZonal:         cb('ar-gen-pra'),
        zsaSeparation:    cb('ar-gen-zsa'),
        hfOperational:    cb('ar-gen-hf'),
        iface:            cb('ar-gen-iface'),
        fcimMonitor:      cb('ar-gen-fcim-mon')
    };
    const merge = AutoReq.generate(opts, scope);
    window._autoReqPendingMerge = merge;

    const area = document.getElementById('ar-preview-area');
    const sectionHtml = (title, items, renderer) => {
        if(!items.length) return '';
        return `<h4 style="margin: 12px 0 6px 0; color: var(--header-color);">${esc(title)} (${items.length})</h4><div class="ar-preview-list">${items.map(renderer).join('')}</div>`;
    };
    let html = '';
    html += sectionHtml('New requirements', merge.isNew, c => {
        const compromisedTag = c.compromised ? '<span class="ar-badge ar-badge-compromised" style="margin-left:6px;">compromised</span>' : '';
        return `<div class="ar-preview-item"><div><strong>${esc(AutoReq.GEN_LABELS[c.reqSource.generator] || c.reqSource.generator)}</strong> &middot; ${esc(c.level)} &middot; ${esc(c.type)} ${compromisedTag}</div><div style="font-size:0.85em; margin-top:4px;">${esc(c.text)}</div></div>`;
    });
    html += sectionHtml('Updates (source drifted)', merge.isUpdated, u => {
        const diffs = (u.diff || []).map(d => `<li><code>${esc(d.field)}</code>: <span style="color:#dc2626;">${esc(String(d.from).slice(0, 80))}</span> &rarr; <span style="color:#16a34a;">${esc(String(d.to).slice(0, 80))}</span></li>`).join('');
        return `<div class="ar-preview-item ar-preview-stale"><div><strong>${esc(AutoReq.GEN_LABELS[u.next.reqSource.generator] || u.next.reqSource.generator)}</strong> &middot; ${esc(u.next.level)} &middot; ${esc(u.next.type)}</div><div style="font-size:0.85em; margin-top:4px;">${esc(u.next.text)}</div><ul style="font-size:0.75em; margin: 6px 0 0 16px; color: var(--text-secondary);">${diffs}</ul></div>`;
    });
    html += sectionHtml('Orphans (source deleted)', merge.orphaned, r => {
        return `<div class="ar-preview-item ar-preview-orphan"><div><strong>${esc(AutoReq.GEN_LABELS[r.reqSource && r.reqSource.generator] || (r.reqSource && r.reqSource.generator) || 'unknown')}</strong></div><div style="font-size:0.85em; margin-top:4px;">${esc(r.text)}</div></div>`;
    });
    // Phase 66.36 (A4) — pending re-bucketing. A node's declared owner has moved, so the
    // requirement allocated from it now belongs to a different system's register. The tool
    // does NOT move it silently: it shows what would move, what that costs, and waits.
    // Same posture as the rebalance flow — the analyst decides, and the decision is logged.
    html += sectionHtml('Move to the declared owner', merge.migrations || [], mv => {
        const cost = [];
        if(mv.hasVerificationStatus) cost.push('has a verification status');
        if(mv.hasEvidence) cost.push('<strong>has verification evidence against it</strong>');
        if(mv.userOverridden) cost.push('has manual edits');
        const costLine = cost.length
            ? `<div style="font-size:0.75em; margin-top:4px; color:#b45309;">Carried across intact — this row ${cost.join(', ')}.</div>`
            : `<div style="font-size:0.75em; margin-top:4px; color: var(--text-secondary);">Draft row — nothing issued against it yet.</div>`;
        return `<div class="ar-preview-item" style="border-left:3px solid #0369a1;">`
            + `<div><strong>${esc(mv.traceId)}</strong> &middot; ${esc(AutoReq.bucketLabel(mv.from))} &rarr; <strong>${esc(AutoReq.bucketLabel(mv.to))}</strong></div>`
            + `<div style="font-size:0.85em; margin-top:4px;">${esc(String(mv.text).slice(0, 220))}</div>`
            + costLine + `</div>`;
    });
    if((merge.migrationUnresolved || []).length){
        html += `<p style="color:#b45309; font-size:0.85em; margin-top:8px;">${merge.migrationUnresolved.length} requirement(s) could not be re-filed — see the orphan list.</p>`;
    }
    if(merge.unchanged.length){
        html += `<p style="color: var(--text-secondary); font-style: italic; margin-top: 12px;">${merge.unchanged.length} existing requirements are up to date.</p>`;
    }
    if(!html) html = '<p class="u-muted-italic">Nothing to generate — either there are no eligible sources or all requirements are already current.</p>';
    area.innerHTML = html;

    // Enable accept buttons based on counts.
    document.getElementById('ar-accept-all').disabled = (merge.isNew.length + merge.isUpdated.length + merge.orphaned.length === 0);
    document.getElementById('ar-accept-new').disabled = (merge.isNew.length === 0);
    document.getElementById('ar-accept-updates').disabled = (merge.isUpdated.length === 0);
    document.getElementById('ar-remove-orphans').disabled = (merge.orphaned.length === 0);
    const mgBtn = document.getElementById('ar-apply-migrations');
    if(mgBtn) mgBtn.disabled = ((merge.migrations || []).length === 0);
}

// Phase 66.36 (A4) — apply the pending re-bucketing. Explicit, never part of "Accept all":
// moving who OWNS a safety requirement is a different decision from accepting generated
// text, and bundling the two would make clicking through equivalent to consent.
function autoReqApplyMigrations(){
    const merge = window._autoReqPendingMerge;
    if(!merge || !(merge.migrations || []).length) return alert('Run Preview first.');
    const n = AutoReq.applyBucketMigration({ moves: merge.migrations });
    AutoReq.recomputeFlags(merge.scope);
    if(typeof renderACReq === 'function') renderACReq();
    if(typeof renderSysReq === 'function') renderSysReq();
    if(typeof updateDashboard === 'function') updateDashboard();
    autoReqPreview();
    if(typeof showToast === 'function'){
        showToast('Moved ' + n + ' requirement' + (n===1?'':'s') + ' to the system declared on the fault-tree node — verification status and evidence carried across.', n>0 ? 'success' : 'info', 5000);
    }
}

function autoReqAccept(mode){
    const merge = window._autoReqPendingMerge;
    if(!merge) return alert('Run Preview first.');
    const choices = { acceptNew:false, acceptUpdates:false, acceptOrphanRemoval:false };
    if(mode === 'all'){ choices.acceptNew = true; choices.acceptUpdates = true; choices.acceptOrphanRemoval = true; }
    if(mode === 'new') choices.acceptNew = true;
    if(mode === 'updates') choices.acceptUpdates = true;
    if(mode === 'orphans') choices.acceptOrphanRemoval = true;

    const n = AutoReq.applyMerge(merge, choices);
    AutoReq.recomputeFlags(merge.scope);

    // Re-render the appropriate table.
    if(merge.scope === 'ac' && typeof renderACReq === 'function') renderACReq();
    else if(merge.scope.startsWith('sys-') && typeof renderSysReq === 'function') renderSysReq();
    // Refresh dashboard (req counts may have changed).
    // Refresh dashboard counts after applying merges (Phase 27 audit C6 — function was misnamed).
    if(typeof updateDashboard === 'function') updateDashboard();
    // Re-preview so the user sees what's left.
    autoReqPreview();

    // Brief toast-style flash via the preview area header.
    const area = document.getElementById('ar-preview-area');
    const note = document.createElement('div');
    note.style.cssText = 'background:#dcfce7; color:#166534; padding:8px 12px; border-radius:4px; margin-bottom:10px; font-size:0.85em;';
    note.textContent = `Applied ${n} change${n===1?'':'s'}.`;
    area.insertBefore(note, area.firstChild);
    setTimeout(() => { try { note.remove(); } catch(e){} }, 2500);
    // #51 — also surface a global toast (the inline note is easy to miss when the table reflows).
    if (typeof showToast === 'function') showToast('AutoReq: applied ' + n + ' change' + (n===1?'':'s') + ' — requirements allocated from the tree’s logic.', n>0 ? 'success' : 'info', 4500);
}

// Compromised-detail panel (popup over requirement table).
function showCompromisePanel(internalId, scope){
    const store = scope === 'ac' ? acReqData : (systemsData.find(s => 'sys-' + s.id === scope) || {}).req || [];
    const req = store.find(r => String(r.internalId) === String(internalId));
    if(!req) return;
    const reasons = req.compromiseReasons || [];
    const reasonsHtml = reasons.length
        ? '<ul style="margin: 10px 0 0 18px; line-height: 1.6;">' + reasons.map(r => `<li><strong>${esc(r.kind)}:</strong> ${esc(r.detail)}</li>`).join('') + '</ul>'
        : '<p>No specific reasons recorded — try regenerating to refresh the flag.</p>';
    const modal = document.getElementById('compromise-modal');
    if(!modal) return;
    document.getElementById('compromise-req-text').textContent = req.text || '';
    document.getElementById('compromise-reasons').innerHTML = reasonsHtml;
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
}
function closeCompromisePanel(){
    const modal = document.getElementById('compromise-modal');
    if(!modal) return;
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 250);
}

function setAutoReqFilter(scopeKind, val){
    _autoReqFilterState[scopeKind] = val;
    // Update chip visual state
    document.querySelectorAll(`[data-ar-filter-scope="${scopeKind}"]`).forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-ar-filter-val') === val);
    });
    // Re-apply filter to existing rendered rows
    applyAutoReqFilter(scopeKind);
}
function applyAutoReqFilter(scopeKind){
    const tbodyId = scopeKind === 'ac' ? 'ac-req-body' : 'sys-req-body';
    const tbody = document.getElementById(tbodyId);
    if(!tbody) return;
    const val = _autoReqFilterState[scopeKind] || 'all';
    Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
        const k = tr.getAttribute('data-ar-kind') || 'manual';
        const isArchived = tr.getAttribute('data-ar-archived') === '1';
        const isObsolete = tr.getAttribute('data-ar-obsolete') === '1';
        // Phase 53.56 — deleted state hides the row from non-deleted views.
        const isDeleted  = tr.getAttribute('data-ar-deleted')  === '1';
        let show = true;
        if(val === 'all') {
            show = !isArchived && !isDeleted;            // hide archived + soft-deleted by default
        } else if(val === 'auto')        show = (k !== 'manual') && !isArchived && !isDeleted;
        else if(val === 'manual')        show = (k === 'manual') && !isArchived && !isDeleted;
        else if(val === 'compromised')   show = (tr.getAttribute('data-ar-compromised') === '1') && !isArchived && !isDeleted;
        else if(val === 'stale')         show = (tr.getAttribute('data-ar-stale') === '1') && !isArchived && !isDeleted;
        else if(val === 'obsolete')      show = isObsolete && !isArchived && !isDeleted;
        else if(val === 'archived')      show = isArchived && !isDeleted;
        else if(val === 'deleted')       show = isDeleted;
        tr.style.display = show ? '' : 'none';
    });
}

// ==========================================
// Phase 5: UX utilities — toast, autosave, undo, shortcuts, welcome, sample project, help
// ==========================================

// ----- 5.1 Toasts -----
// ICONS — extracted to ui_constants.js (Phase 76; byte-identical, loaded BEFORE this file).
function showToast(msg, type, duration) {
    type = type || 'info';
    duration = duration || 4000;
    const stack = document.getElementById('toast-stack');
    if(!stack) { console.log('[' + type + ']', msg); return; }
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML = '<span class="toast-icon">' + (ICONS[type] || ICONS.info) + '</span>' +
                      '<span class="toast-msg">' + esc(msg) + '</span>' +
                      '<button class="toast-close" aria-label="Dismiss">×</button>';
    stack.appendChild(toast);
    // Animate in
    requestAnimationFrame(() => toast.classList.add('show'));
    const dismiss = () => {
        toast.classList.remove('show');
        setTimeout(() => { try { toast.remove(); } catch(e){} }, 250);
    };
    toast.querySelector('.toast-close').addEventListener('click', dismiss);
    if(duration > 0) setTimeout(dismiss, duration);
}

function _aiBusyEnsureStyle() {
    if (document.getElementById('sl-aibusy-style')) return;
    const st = document.createElement('style');
    st.id = 'sl-aibusy-style';
    st.textContent =
        '@keyframes slAiSpin{to{transform:rotate(360deg)}}' +
        '@keyframes slAiQuip{0%{opacity:0;transform:translateY(3px)}12%{opacity:.72;transform:none}88%{opacity:.72}100%{opacity:0}}' +
        '.ai-busy-toast{align-items:flex-start}' +
        '.ai-busy-body{display:flex;flex-direction:column;gap:2px;min-width:190px}' +
        '.ai-busy-elapsed{opacity:.55;font-variant-numeric:tabular-nums;margin-left:6px;font-size:11px}' +
        '.ai-busy-quip{font-size:11px;opacity:.72;font-style:italic;animation:slAiQuip 5s ease-in-out infinite}' +
        '@media (prefers-reduced-motion: reduce){.ai-busy-quip{animation:none;opacity:.72}.ai-busy-spinner{animation-duration:2.4s}}' +
        '.ai-busy-spinner{width:14px;height:14px;border-radius:50%;border:2px solid var(--color-border-hair,#d0d5dd);border-top-color:var(--color-accent,#3D8BFF);display:inline-block;animation:slAiSpin .7s linear infinite;flex:none;margin-right:9px;vertical-align:middle}' +
        '.ai-busy-count{opacity:.65;font-size:11px;margin-left:7px}';
    document.head.appendChild(st);
}
// Phase 66.14 — the wait has a voice now. The indicator stays up for the WHOLE
// call (it always did) but a static line for 40 seconds reads as a hang, so it
// carries a live elapsed clock and a rotating second line. The quips are about
// the WAIT, never about what the model is supposedly doing — a fake progress
// narration ("consulting the standard…") in a tool whose whole pitch is that the
// AI does not own the numbers would be the worst possible place to invent telemetry.
const _AI_BUSY_QUIPS = [
    'it drafts — the engine still owns every number',
    'no arithmetic is happening back here',
    'reading is the slow part',
    'a good failure-condition row is worth the wait',
    'long answers take longer than short ones',
    'structure and narrative only; severity stays deterministic',
    'still going — the slow part is prose, not math',
    'the standard is long. so is this sentence.'
];
function _aiBusyFmtElapsed(ms) {
    const s = Math.floor(ms / 1000);
    return (s < 60) ? (s + 's') : (Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'));
}
function _aiBusyRender() {
    if (!_aiBusy.el) return;
    const body = _aiBusy.el.querySelector('.ai-busy-body');
    if (!body) return;
    if (!_aiBusy.el.classList.contains('show')) _aiBusy.el.classList.add('show');   // Phase 66.15 — never leave it stuck invisible
    const label = _aiBusy.label || 'working';
    const extra = _aiBusy.n > 1 ? (' <span class="ai-busy-count">+' + (_aiBusy.n - 1) + ' more</span>') : '';
    const secs = _aiBusy.t0 ? (Date.now() - _aiBusy.t0) : 0;
    // The elapsed clock only appears once the wait is long enough to wonder about.
    const clock = secs >= 3000 ? '<span class="ai-busy-elapsed">' + _aiBusyFmtElapsed(secs) + '</span>' : '';
    // Phase 66.16 — his headline, verbatim (18 Aug: "it should read AI Working -
    // Drum Roll Please"). The line that says what is ACTUALLY running keeps its place
    // underneath, because "which of the six things I clicked is this" is a real
    // question during a demo — after 6s it alternates with the rotating quips.
    const sub = (secs >= 6000 && (_aiBusy.quip % 2 === 1))
        ? _AI_BUSY_QUIPS[Math.floor(_aiBusy.quip / 2) % _AI_BUSY_QUIPS.length]
        : label;
    // \ud83e\udd41 = drum, \ud83e\udd41\ud83e\udd41 either side of the line (his call, 18 Aug: "with drum emojis").
    // Escaped rather than pasted so the file stays plain ASCII and no editor or
    // transfer can mangle the surrogate pair into a replacement character.
    body.innerHTML = '<div class="toast-msg">\ud83e\udd41 AI Working \u2014 Drum Roll Please \ud83e\udd41' + clock + extra + '</div>' +
                     '<div class="ai-busy-quip">' + esc(sub) + '</div>';
}
function slabAiBusyBegin(label) {
    _aiBusy.n++;
    if (label) _aiBusy.label = label;
    if (!_aiBusy.el) {
        const stack = document.getElementById('toast-stack');
        if (!stack) return;   // headless / no UI — nothing to show
        _aiBusyEnsureStyle();
        const el = document.createElement('div');
        el.className = 'toast toast-info ai-busy-toast';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.innerHTML = '<span class="ai-busy-spinner"></span><div class="ai-busy-body"></div>';
        stack.appendChild(el);
        _aiBusy.el = el;
        _aiBusy.t0 = Date.now();
        _aiBusy.quip = 0;
        // One timer drives both the clock and the rotation. 1s so the clock is honest;
        // the quip advances every fifth tick so it does not strobe.
        if (_aiBusy.tick) { try { clearInterval(_aiBusy.tick); } catch (_) {} }
        let _n = 0;
        _aiBusy.tick = setInterval(function () {
            _n++;
            if (_n % 5 === 0) _aiBusy.quip++;
            try { _aiBusyRender(); } catch (_) {}
        }, 1000);
        // Phase 66.15 — rAF is PAUSED in a background tab, so a job started and then
        // left running while the user switches tabs came back still at opacity 0.
        // Belt and braces: rAF for the smooth entry, a timeout backstop for the
        // hidden-tab case, and _aiBusyRender re-asserts the class on every tick.
        requestAnimationFrame(() => el.classList.add('show'));
        setTimeout(() => { try { el.classList.add('show'); } catch (_) {} }, 80);
    }
    _aiBusyRender();
}
function slabAiBusyEnd() {
    _aiBusy.n = Math.max(0, _aiBusy.n - 1);
    if (_aiBusy.n === 0 && _aiBusy.el) {
        const el = _aiBusy.el; _aiBusy.el = null; _aiBusy.label = '';
        _aiBusy.t0 = 0; _aiBusy.quip = 0;
        if (_aiBusy.tick) { try { clearInterval(_aiBusy.tick); } catch (_) {} _aiBusy.tick = null; }
        el.classList.remove('show');
        setTimeout(() => { try { el.remove(); } catch(e){} }, 250);
    } else {
        _aiBusyRender();
    }
}

// Authored work that lives NESTED under projectConfig rather than in a top-level array.
// This is the durability bug Waqas hit 2 Sep 2026: "I refreshed the project after previous
// deploy and it lost the data ... we should be able to refresh where we left off." The nine
// HF lanes store under projectConfig.hf.<lane>.rows; RAM predictions, MMEL items and Markov
// models are nested the same way. _autosaveHasContent looked only at four TOP-LEVEL stores,
// so a project whose authored work was HF (179 rows, in his case) was judged EMPTY — and
// checkAutosaveRecovery bails with `if (!_autosaveHasContent(parsed)) return false`, so the
// data sat in the saved payload and was never rehydrated, then the blank in-memory state
// autosaved over it. The payload was correct all along; the emptiness test was blind to it.
//
// Widening this predicate is MONOTONICALLY SAFE for data: it can only make recovery RUN and
// the empty-overwrite refusal FIRE in more cases, never fewer. It can never cause a wipe.
function _projectConfigHasAuthoredContent(pc) {
    try {
        if (!pc || typeof pc !== 'object') return false;
        // HF — any of the nine lanes carrying rows, or a minimum-flight-crew determination.
        var hf = pc.hf;
        if (hf && typeof hf === 'object') {
            var LANES = ['tid', 'alloc', 'tasks', 'hea', 'alerts', 'ergo', 'cd', 'sa', 'mfc'];
            for (var i = 0; i < LANES.length; i++) {
                var st = hf[LANES[i]];
                if (st && Array.isArray(st.rows) && st.rows.length) return true;
            }
            if (hf.mfc && (hf.mfc.conclusion && (hf.mfc.conclusion.minCrew || hf.mfc.conclusion.rationale))) return true;
            if (hf.mfc && hf.mfc.factors && Object.keys(hf.mfc.factors).length) return true;
        }
        // RAM predictions and field records; MMEL items; Markov models — all authored.
        if (pc.ram && pc.ram.predict && Array.isArray(pc.ram.predict.rows) && pc.ram.predict.rows.length) return true;
        if (pc.ram && Array.isArray(pc.ram.field) && pc.ram.field.length) return true;
        if (pc.mmel && Array.isArray(pc.mmel.items) && pc.mmel.items.length) return true;
        if (Array.isArray(pc.markovModels) && pc.markovModels.length) return true;
    } catch (_) {}
    return false;
}
function _autosaveHasContent(parsed) {
    if (!parsed) return false;
    return !!((parsed.acFhaData && parsed.acFhaData.length) ||
        (parsed.acReqData && parsed.acReqData.length) ||
        (parsed.ftaPages && parsed.ftaPages.some(function (p) { return p && p.root; })) ||
        (parsed.systemsData && parsed.systemsData.length) ||
        // 2 Sep 2026 — the nested authored lanes (HF / RAM / MMEL / Markov), which a
        // top-level-array-only test could not see. See _projectConfigHasAuthoredContent.
        _projectConfigHasAuthoredContent(parsed.projectConfig));
}
function _dismissWelcomeIfOpen() {
    try { const m = document.getElementById('welcome-modal'); if (m) { m.style.display = 'none'; m.classList.remove('active', 'show', 'open'); } } catch (_) {}
}

// ── #44 — payload compression for IndexedDB (opt-in write; reads always auto-detect) ───────────
// Native CompressionStream (gzip) shrinks the autosave payload before the IndexedDB write, extending
// capacity for large projects. No dependency, air-gap-safe. WRITE is opt-in (?compress=1 /
// localStorage SLA_COMPRESS='1') so the default path is unchanged; READ always handles both compressed
// (binary) and plain (string/legacy), so toggling the flag never strands existing data. The localStorage
// mirror stays plain text (synchronous unload safety-net).
function _compressEnabled() { try { if (typeof CompressionStream === 'undefined') return false; if (/[?&]compress=1/.test(location.search)) return true; return localStorage.getItem('SLA_COMPRESS') === '1'; } catch (_) { return false; } }
function _gzip(str) {
    var cs = new CompressionStream('gzip');
    var w = cs.writable.getWriter(); w.write(new TextEncoder().encode(str)); w.close();
    return new Response(cs.readable).arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
}
function _gunzip(u8) {
    var ds = new DecompressionStream('gzip');
    var w = ds.writable.getWriter(); w.write(u8); w.close();
    return new Response(ds.readable).arrayBuffer().then(function (buf) { return new TextDecoder().decode(buf); });
}
function _maybeCompress(payload) {
    if (!_compressEnabled()) return Promise.resolve(payload);
    try { return _gzip(payload).catch(function () { return payload; }); } catch (_) { return Promise.resolve(payload); }
}
function _maybeDecompress(stored) {
    if (stored == null) return Promise.resolve(null);
    if (typeof stored === 'string') return Promise.resolve(stored);   // plain / legacy
    try {
        if (typeof DecompressionStream === 'undefined') return Promise.resolve(null);
        var u8 = (stored instanceof Uint8Array) ? stored : new Uint8Array(stored);
        return _gunzip(u8).catch(function () { return null; });
    } catch (_) { return Promise.resolve(null); }
}

function _projectHealthLevel(bytes, rows) {
    if (bytes >= _PROJECT_SIZE_CRIT_BYTES) return { level: 'crit', msg: 'This project is very large (' + (bytes / 1e6).toFixed(1) + ' MB). It is safely stored, but consider splitting it or capturing a baseline — the UI may slow down.' };
    if (bytes >= _PROJECT_SIZE_WARN_BYTES || (rows | 0) >= _PROJECT_ROWS_WARN) return { level: 'warn', msg: 'This project is getting large (' + (bytes / 1e6).toFixed(1) + ' MB' + (rows ? ', ' + rows + ' rows' : '') + '). Safely stored; consider a baseline or split for performance.' };
    return { level: 'ok', msg: '' };
}
function _projectRowCount() {
    let n = 0;
    try {
        [acFunctionsData, acFhaData, acReqData, acAssumptionsData, acFcimData, fmeaData, praData, zsaData, cmaData].forEach(function (a) { if (Array.isArray(a)) n += a.length; });
        if (Array.isArray(systemsData)) systemsData.forEach(function (s) { if (s) ['functions', 'fha', 'req', 'fcim', 'asm'].forEach(function (k) { if (Array.isArray(s[k])) n += s[k].length; }); });
        if (Array.isArray(ftaPages)) ftaPages.forEach(function (p) { if (p && p.root) { (function count(node) { if (!node) return; n++; (node.children || []).forEach(count); })(p.root); } });
    } catch (_) {}
    return n;
}
function _checkProjectHealth(bytes) {
    try {
        const h = _projectHealthLevel(bytes || 0, _projectRowCount());
        if (h.level === 'ok') { _projectHealthLast = 'ok'; return; }
        const now = Date.now();
        if (h.level !== _projectHealthLast || (now - _projectHealthLastWarnAt) > 120000) {   // on level change, else throttle to 2 min
            if (typeof showToast === 'function') showToast(h.msg, h.level === 'crit' ? 'warning' : 'info', 6000);
            _projectHealthLastWarnAt = now;
        }
        _projectHealthLast = h.level;
    } catch (_) {}
}

// 20 Aug 2026 — DERIVED. The hand-written literal that used to live here is now one
// entry per store in project_stores.js, which the cloud push, the .slab export, the
// new-project reset and both load paths also read. The old comment on this function
// said "Mirrors saveProject() payload — keep in sync if saveProject changes"; keeping
// them in sync by hand is precisely what failed, repeatedly and expensively.
function _snapshotProject() {
    if (typeof window !== 'undefined' && window.SLStores) return window.SLStores.snapshot();
    // Fallback kept deliberately: if project_stores.js ever fails to load, an autosave
    // must still capture SOMETHING rather than throwing and writing nothing at all.
    return _snapshotProjectLegacy();
}
function _snapshotProjectLegacy() {
    return {
        projectName,
        acFunctionsData, acFcimData, acExtractedFCs, acFhaData, acReqData, acAssumptionsData, acAsmCounter,
        systemsData, activeSystemId, praData, zsaData, cmaData, routingData, resourcesData, projectSourceDocs: _slabSerializeSourceDocs(), aiAssumptions, fmeaData, fmeaCounter, itemsData, flightPhasesData,
        // See _buildProjectSnapshot: this is the autosave payload and the dirty
        // check. Without stpaData an STPA edit did not mark the project dirty,
        // so nothing downstream ever fired.
        stpaData, mlData,
        ftaPages, activeFTAPageId, internalIdCounter, typeCounters, ftaConfig, projectConfig, projectBaselines,
        reviewCommentsData, reviewCounter, reviewApprovalsData,
        // Phase 55.0.8 — per-project AutoReq template overrides
        autoReqTemplateOverrides,
        // Phase 56.9 — per-project report-section edits keyed [reportType][sectionId] = prose
        projectReportEdits,
        // 20 Aug 2026 — present in the cloud push and the .slab export but missing
        // here, so a refresh or an undo dropped it. The mirror image of the
        // autoReqTemplateOverrides/projectReportEdits hole in _buildProjectSnapshot.
        projectTemplates,
    };
}

function _crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = _CRC32_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function _deflateRaw(u8) { var cs = new CompressionStream('deflate-raw'); var w = cs.writable.getWriter(); w.write(u8); w.close(); return new Response(cs.readable).arrayBuffer().then(function (b) { return new Uint8Array(b); }); }
function _inflateRaw(u8) { var ds = new DecompressionStream('deflate-raw'); var w = ds.writable.getWriter(); w.write(u8); w.close(); return new Response(ds.readable).arrayBuffer().then(function (b) { return new Uint8Array(b); }); }
function _zipMake(files) {
    var enc = new TextEncoder(), names = Object.keys(files), locals = [], central = [], offset = 0;
    return names.reduce(function (chain, name) {
        return chain.then(function () {
            var nameBytes = enc.encode(name), data = enc.encode(files[name]), crc = _crc32(data);
            return _deflateRaw(data).then(function (comp) {
                var lh = new Uint8Array(30 + nameBytes.length + comp.length), dv = new DataView(lh.buffer);
                dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0, true); dv.setUint16(8, 8, true);
                dv.setUint16(10, 0, true); dv.setUint16(12, 0x21, true);
                dv.setUint32(14, crc, true); dv.setUint32(18, comp.length, true); dv.setUint32(22, data.length, true);
                dv.setUint16(26, nameBytes.length, true); dv.setUint16(28, 0, true);
                lh.set(nameBytes, 30); lh.set(comp, 30 + nameBytes.length); locals.push(lh);
                var ch = new Uint8Array(46 + nameBytes.length), cdv = new DataView(ch.buffer);
                cdv.setUint32(0, 0x02014b50, true); cdv.setUint16(4, 20, true); cdv.setUint16(6, 20, true); cdv.setUint16(8, 0, true); cdv.setUint16(10, 8, true);
                cdv.setUint16(12, 0, true); cdv.setUint16(14, 0x21, true);
                cdv.setUint32(16, crc, true); cdv.setUint32(20, comp.length, true); cdv.setUint32(24, data.length, true);
                cdv.setUint16(28, nameBytes.length, true); cdv.setUint32(42, offset, true);
                ch.set(nameBytes, 46); central.push(ch); offset += lh.length;
            });
        });
    }, Promise.resolve()).then(function () {
        var cdSize = central.reduce(function (a, c) { return a + c.length; }, 0), cdOffset = offset;
        var eocd = new Uint8Array(22), edv = new DataView(eocd.buffer);
        edv.setUint32(0, 0x06054b50, true); edv.setUint16(8, names.length, true); edv.setUint16(10, names.length, true);
        edv.setUint32(12, cdSize, true); edv.setUint32(16, cdOffset, true);
        var out = new Uint8Array(offset + cdSize + 22), p = 0;
        locals.forEach(function (l) { out.set(l, p); p += l.length; });
        central.forEach(function (c) { out.set(c, p); p += c.length; });
        out.set(eocd, p); return out;
    });
}
function _zipParse(u8) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), eocd = -1;
    for (var i = u8.length - 22; i >= 0; i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) return Promise.reject(new Error('not a .slproj archive'));
    var count = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true), dec = new TextDecoder();
    // Pass 1 — walk the central directory SYNCHRONOUSLY so each entry's offset is read correctly.
    var entries = [];
    for (var n = 0; n < count; n++) {
        if (dv.getUint32(p, true) !== 0x02014b50) return Promise.reject(new Error('corrupt central directory'));
        var method = dv.getUint16(p + 10, true), compSize = dv.getUint32(p + 20, true);
        var nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
        entries.push({ name: dec.decode(u8.subarray(p + 46, p + 46 + nameLen)), method: method, compSize: compSize, lhOff: dv.getUint32(p + 42, true) });
        p += 46 + nameLen + extraLen + commentLen;
    }
    // Pass 2 — inflate each entry (async) from its local header.
    var files = {};
    return entries.reduce(function (chain, e) {
        return chain.then(function () {
            var lNameLen = dv.getUint16(e.lhOff + 26, true), lExtraLen = dv.getUint16(e.lhOff + 28, true);
            var dataStart = e.lhOff + 30 + lNameLen + lExtraLen, comp = u8.subarray(dataStart, dataStart + e.compSize);
            return (e.method === 8 ? _inflateRaw(comp) : Promise.resolve(comp)).then(function (data) { files[e.name] = dec.decode(data); });
        });
    }, Promise.resolve()).then(function () { return files; });
}
function _bundleToZip(project) {
    var b = _bundleSplit(project), files = Object.assign({}, b.files);
    files['manifest.json'] = JSON.stringify(b.manifest);
    return _zipMake(files);
}
function _bundleFromZip(u8) {
    return _zipParse(u8).then(function (files) {
        var manifest = files['manifest.json'] ? JSON.parse(files['manifest.json']) : null;
        return _bundleMerge(manifest, files);
    });
}

function exportProjectBundle() {
    return _bundleToZip(_snapshotProject()).then(function (u8) {
        var nm = (typeof _safeFileName === 'function') ? _safeFileName(projectName || 'Untitled') : String(projectName || 'Untitled').replace(/[^a-z0-9_-]+/gi, '_');
        var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8], { type: 'application/zip' })); a.download = 'SafetyLab_' + nm + '.slproj';
        document.body.appendChild(a); a.click(); setTimeout(function () { try { URL.revokeObjectURL(a.href); a.remove(); } catch (_) {} }, 1000);
        if (typeof showToast === 'function') showToast('Exported ' + a.download, 'success', 3500);
    }).catch(function (e) { if (typeof showToast === 'function') showToast('Export failed: ' + ((e && e.message) || e), 'error'); });
}
function importProjectBundle() {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.slproj,.zip';
    inp.onchange = function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        f.arrayBuffer().then(function (buf) { return _bundleFromZip(new Uint8Array(buf)); })
            .then(function (project) { _applyProjectData(project); if (typeof scheduleAutosave === 'function') scheduleAutosave(); if (typeof showToast === 'function') showToast('Imported project bundle.', 'success', 3500); })
            .catch(function (e) { if (typeof showToast === 'function') showToast('Import failed: ' + ((e && e.message) || e), 'error'); });
    };
    inp.click();
}
// (b) Folder-of-files save/open via the Save-Folder directory handle (Chromium/desktop). Delta save
// rewrites only changed files. Browser-dependent (File System Access) — verify in-browser.
function _folderWrite(dir, path, content) {
    var parts = path.split('/'), chain = Promise.resolve(dir);
    for (var i = 0; i < parts.length - 1; i++) chain = chain.then((function (seg) { return function (d) { return d.getDirectoryHandle(seg, { create: true }); }; })(parts[i]));
    return chain.then(function (d) { return d.getFileHandle(parts[parts.length - 1], { create: true }); })
        .then(function (fh) { return fh.createWritable(); }).then(function (w) { return Promise.resolve(w.write(content)).then(function () { return w.close(); }); });
}
function _folderReadAll(dir, prefix, out) {
    var it = dir.values(); var step = function () { return it.next().then(function (r) { if (r.done) return out; var entry = r.value, path = prefix + entry.name; if (entry.kind === 'directory') return _folderReadAll(entry, path + '/', out).then(step); return entry.getFile().then(function (f) { return f.text(); }).then(function (t) { out[path] = t; return step(); }); }); };
    return step();
}
function saveProjectToFolder() {
    if (typeof SaveFs === 'undefined' || !SaveFs.isSupported || !SaveFs.isSupported()) { if (typeof showToast === 'function') showToast('Folder save needs a Chromium-based browser or the desktop app — use Export .slproj instead.', 'warning', 6000); return; }
    return SaveFs.getDefaultDirHandle(false).then(function (dir) {
        if (!dir) { if (typeof showToast === 'function') showToast('No save folder chosen.', 'warning'); return; }
        var b = _bundleSplit(_snapshotProject()); var files = Object.assign({}, b.files); files['manifest.json'] = JSON.stringify(b.manifest);
        return dir.getFileHandle('manifest.json').then(function (mh) { return mh.getFile(); }).then(function (mf) { return mf.text(); }).then(function (t) { return JSON.parse(t); }).catch(function () { return null; })
            .then(function (prev) {
                var changed, deleted = [];
                if (prev) { var d = _bundleChangedFiles(b.files, prev); changed = d.changed.indexOf('manifest.json') < 0 ? d.changed.concat(['manifest.json']) : d.changed; deleted = d.deleted; }
                else { changed = Object.keys(files); }
                var jobs = changed.map(function (p) { return function () { return _folderWrite(dir, p, files[p]); }; })
                    .concat(deleted.map(function (p) { return function () { return _folderDelete(dir, p).catch(function () {}); }; }));
                return jobs.reduce(function (c, j) { return c.then(j); }, Promise.resolve()).then(function () {
                    if (typeof showToast === 'function') showToast('Saved bundle to folder (' + changed.length + ' file' + (changed.length === 1 ? '' : 's') + ' written).', 'success', 4000);
                });
            });
    }).catch(function (e) { if (typeof showToast === 'function') showToast('Folder save failed: ' + ((e && e.message) || e), 'error'); });
}
function _folderDelete(dir, path) {
    var parts = path.split('/'), chain = Promise.resolve(dir);
    for (var i = 0; i < parts.length - 1; i++) chain = chain.then((function (seg) { return function (d) { return d.getDirectoryHandle(seg); }; })(parts[i]));
    return chain.then(function (d) { return d.removeEntry(parts[parts.length - 1]); });
}
function openProjectFromFolder() {
    if (typeof SaveFs === 'undefined' || !SaveFs.isSupported || !SaveFs.isSupported()) { if (typeof showToast === 'function') showToast('Folder open needs a Chromium-based browser or the desktop app — use Import .slproj instead.', 'warning', 6000); return; }
    return SaveFs.getDefaultDirHandle(false).then(function (dir) {
        if (!dir) return;
        return _folderReadAll(dir, '', {}).then(function (files) {
            var manifest = files['manifest.json'] ? JSON.parse(files['manifest.json']) : null;
            if (!manifest) { if (typeof showToast === 'function') showToast('No project bundle found in that folder.', 'warning'); return; }
            _applyProjectData(_bundleMerge(manifest, files)); if (typeof scheduleAutosave === 'function') scheduleAutosave();
            if (typeof showToast === 'function') showToast('Opened project bundle from folder.', 'success', 4000);
        });
    }).catch(function (e) { if (typeof showToast === 'function') showToast('Folder open failed: ' + ((e && e.message) || e), 'error'); });
}

async function _writeAutosaveToDisk(jsonPayload) {
    if (_autosaveDiskWriteInFlight) return;
    if (typeof SaveFs === 'undefined' || !SaveFs.isSupported || !SaveFs.isSupported()) {
        _autosaveDiskAvailable = false;
        return;
    }
    _autosaveDiskWriteInFlight = true;
    try {
        const dir = await SaveFs.getDefaultDirHandle(true);  // silent — no permission prompt
        if (!dir) { _autosaveDiskAvailable = false; return; }
        _autosaveDiskAvailable = true;
        const safeName = (typeof _safeFileName === 'function')
            ? _safeFileName(projectName || 'Untitled')
            : String(projectName || 'Untitled').replace(/[^a-z0-9_-]+/gi, '_');
        const fileName = 'Safety_Lab_' + safeName + '.sl';
        const fh = await dir.getFileHandle(fileName, { create: true });
        const w = await fh.createWritable();
        await w.write(jsonPayload);
        await w.close();
        _autosaveLastDiskWrite = Date.now();
        _updateSaveIndicator('saved');   // refresh label to show disk write
    } catch (e) {
        // Don't spam toasts — disk write-through is best-effort. Console only.
        console.warn('Autosave disk write-through failed:', e);
    } finally {
        _autosaveDiskWriteInFlight = false;
    }
}
// E1 (26 Aug 2026) — is the copy already in storage worth protecting?
// Answered from a cached tri-state rather than by re-reading and re-parsing the
// stored payload on every write: on a 4.5 MB project that parse would cost more
// than the write it is guarding. checkAutosaveRecovery seeds it at boot (it
// already parses the payload), every content-bearing write sets it true, and
// discardAutosave clears it. `null` means nobody has told us yet — read the
// mirror once, lazily, and cache the answer.
function _autosaveStoredWorthKeeping() {
    if (_autosaveStoredHasContent !== null) return _autosaveStoredHasContent;
    try {
        const raw = localStorage.getItem(AUTOSAVE_KEY);
        _autosaveStoredHasContent = raw ? _autosaveHasContent(JSON.parse(raw)) : false;
    } catch (_) { _autosaveStoredHasContent = false; }   // unreadable ⇒ nothing to protect
    return _autosaveStoredHasContent;
}

function _writeAutosave() {
    if(_autosaveSuspended) return;
    let payload, meta, snapHasContent;
    try {
        // E1 — the snapshot object is kept, not just its string, so emptiness is
        // judged with the SAME predicate the restore path uses. Re-parsing the
        // payload to ask the question would be both slower and a second answer.
        const snapObj = _perfTime('autosave.snapshot', function () { return _snapshotProject(); });
        payload = _perfTime('autosave.serialize', function () { return JSON.stringify(snapObj); });
        snapHasContent = _autosaveHasContent(snapObj);
        meta = { ts: Date.now(), size: payload.length };
        // 31 Aug 2026 — the autosave slot restores the DATA on resume but used to
        // drop the cloud identity, so the resumed tab re-provisioned a DUPLICATE
        // project row on its first push (db0b5a9e, minted 30 Aug). The identity
        // rides in the META, atomically with the payload it describes;
        // checkAutosaveRecovery adopts it after a successful restore.
        try {
            meta.cloudProjectId = (typeof _activeCloudProjectId !== 'undefined' && _activeCloudProjectId) ? _activeCloudProjectId : null;
            meta.cloudDocVersion = (typeof _activeCloudDocVersion !== 'undefined' && _activeCloudDocVersion != null) ? _activeCloudDocVersion : null;
        } catch (_) {}
    } catch(e) {
        console.warn('Autosave serialize failed:', e);
        _updateSaveIndicator('error');
        return;
    }
    // E1 — THE REFUSAL. During boot recovery only, an empty snapshot never
    // overwrites a stored one that has content. This is the write that destroyed
    // 19 functions / 32 FCIM rows / 38 FHA rows / 11 fault trees on 26 Aug: the
    // blank state landed while the restore that would have repopulated it was
    // still in flight, and took the payload that restore was about to read.
    // Outside the window nothing changes — a deliberately emptied project
    // (createNewProject, a genuine delete) still persists exactly as before.
    // #2Sep2026 BOOT DURABILITY — before boot recovery has RUN, never let an
    // EMPTY snapshot touch storage. The clobber this closes: on refresh the app
    // comes up blank and a blank autosave fires BEFORE checkAutosaveRecovery reads
    // the stored slot, so recovery finds nothing and only offers the manual banner
    // instead of landing the user where they were. An empty project has nothing
    // worth saving, so this refusal cannot lose data; it protects BOTH stores and
    // lifts the instant recovery resolves (_bootRecoveryHasRun, set in
    // _recoveryHoldEnd). Deliberate blanking (createNewProject) happens long after
    // boot, when the flag is already true, and persists exactly as before.
    if (!snapHasContent && !_bootRecoveryHasRun && !_autosaveRecoveryPending) {
        _updateSaveIndicator('saved');   // an empty project has nothing to save — not an error
        return;
    }
    if (_autosaveRecoveryPending && !snapHasContent && _autosaveStoredWorthKeeping()) {
        console.warn('[E1] refused to overwrite a stored project with an empty snapshot during recovery.');
        _updateSaveIndicator('saved');   // the good copy IS the saved state — say so honestly
        return;
    }
    // #14 — IndexedDB primary (large capacity), async fire-and-forget.
    const idbAvail = SLDB.available();
    if (idbAvail) {
        _maybeCompress(payload)                                          // #44 — gzip when enabled, else plain
            .then(function (stored) { return SLDB.set(AUTOSAVE_KEY, stored); })
            .then(function () { return SLDB.set(AUTOSAVE_META_KEY, meta); })
            .catch(function (e) { console.warn('IndexedDB autosave failed:', e); });
    }
    // localStorage mirror (synchronous — the pagehide/beforeunload safety net). Best-effort: a
    // project larger than the localStorage quota fails here but is still safe in IndexedDB.
    let lsOk = false;
    try {
        localStorage.setItem(AUTOSAVE_KEY, payload);
        localStorage.setItem(AUTOSAVE_META_KEY, JSON.stringify(meta));
        lsOk = true;
    } catch(e) { /* quota exceeded — IndexedDB holds the full payload */ }
    _autosaveLastWrite = meta.ts;
    _autosavePending = false;   // write dispatched — nothing pending to flush
    // E1 — what is in storage is now what we just wrote. Tracking it here is what
    // lets the refusal above stay free: no re-read, no re-parse, per write.
    _autosaveStoredHasContent = snapHasContent;
    // Only an error if NEITHER store is available; localStorage quota alone is no longer fatal.
    _updateSaveIndicator((lsOk || idbAvail) ? 'saved' : 'error');
    // Phase 56.52a — fire-and-forget disk write-through (no await — don't block UI).
    _writeAutosaveToDisk(payload);
    // E1 part 3 — keep a throttled copy of the last snapshot that had content.
    try { _writeLastGood(payload, meta, snapHasContent); } catch (_) {}
    // #16 — non-blocking project-size health advisory.
    try { _checkProjectHealth(meta.size); } catch(_) {}
}

// E1 part 3 — the last-good mirror. Three conditions, all of them load-bearing:
//   · the snapshot must HAVE content — a last-good slot holding nothing is not a
//     backup, it is the bug this whole item is about, one slot over;
//   · at most one write per LASTGOOD_MIN_INTERVAL_MS — this is what keeps the
//     feature from doubling the cost of every autosave on a large project;
//   · never throws into the caller. It is a backup. A backup that can break the
//     primary write is worse than no backup at all, so the call site wraps it
//     and this function swallows its own failures on top of that.
// The payload is REUSED, not re-serialised: the expensive part of an autosave is
// the stringify, and it has already happened by the time we get here.
function _writeLastGood(payload, meta, snapHasContent) {
    if (!snapHasContent) return false;
    const now = (meta && meta.ts) || Date.now();
    if (_lastgoodLastWrite && (now - _lastgoodLastWrite) < LASTGOOD_MIN_INTERVAL_MS) return false;
    let wrote = false;
    try {
        localStorage.setItem(LASTGOOD_KEY, payload);
        localStorage.setItem(LASTGOOD_META_KEY, JSON.stringify(meta));
        wrote = true;
    } catch (_) { /* quota — the IndexedDB copy below is the one that matters for big projects */ }
    try {
        if (SLDB.available()) {
            _maybeCompress(payload)
                .then(function (stored) { return SLDB.set(LASTGOOD_KEY, stored); })
                .then(function () { return SLDB.set(LASTGOOD_META_KEY, meta); })
                .catch(function (e) { console.warn('Last-good mirror (IndexedDB) failed:', e); });
            wrote = true;
        }
    } catch (_) {}
    if (wrote) _lastgoodLastWrite = now;
    return wrote;
}
function _updateSaveIndicator(state) {
    // Phase 57 — keep the node drawer's Save button in step with the same dirty state.
    const drawerBtn = document.getElementById('node-drawer-save');
    if (drawerBtn) drawerBtn.classList.toggle('has-unsaved', !!_dirtySinceSave);
    // Compute the display (state class + label) ONCE, then apply it to the header indicator AND
    // every per-view save button — so all of them mirror the exact same auto-save state.
    let cls = '', text = '';
    if (state === 'saving') { cls = 'saving'; text = 'Saving…'; }
    else if (state === 'error') { cls = 'error'; text = 'Save failed (storage full?)'; }
    // Phase 57 — when there are unsaved edits, present the control as an actionable "Save Changes"
    // (clickable → commitSaveChanges). Background autosave still protects the work locally; the
    // durable save (disk .json + cloud) is the explicit commit.
    else if (_dirtySinceSave) { cls = 'dirty'; text = 'Save Changes'; }
    else {
        const ago = Math.max(0, Math.round((Date.now() - _autosaveLastWrite) / 1000));
        const base = _autosaveLastWrite ? ('Saved ' + (ago < 5 ? 'just now' : ago + 's ago')) : 'All changes saved';
        // Phase 56.52a — surface disk write-through status so the user knows the on-disk .json is
        // current (not just the in-browser copy).
        let suffix = '';
        if (_autosaveDiskAvailable === true && _autosaveLastDiskWrite > 0) {
            const diskAgo = Math.max(0, Math.round((Date.now() - _autosaveLastDiskWrite) / 1000));
            suffix = ' · disk ' + (diskAgo < 5 ? 'just now' : diskAgo + 's ago');
        } else if (_autosaveDiskAvailable === false) {
            suffix = ' · browser only';
        }
        text = base + suffix;
    }
    // Header indicator.
    const el = document.getElementById('save-indicator');
    const txt = document.getElementById('save-indicator-text');
    if (el && txt) { el.classList.remove('saving', 'error', 'dirty'); if (cls) el.classList.add(cls); txt.textContent = text; }
    // Per-view save buttons (added to every data-editing view header) — same state, everywhere it matters.
    const views = document.querySelectorAll('.sl-view-save');
    for (let i = 0; i < views.length; i++) {
        const b = views[i]; b.classList.remove('saving', 'error', 'dirty'); if (cls) b.classList.add(cls);
        const t = b.querySelector('.sl-view-save-text'); if (t) t.textContent = text;
    }
}

// Phase 57 — explicit durable save invoked by the header "Save Changes" control and the node
// drawer's Save button. Writes the local autosave (+ best-effort .json to the chosen folder via
// SaveFs), pushes to the Supabase cloud when signed in, then clears the dirty state. Background
// autosave is unchanged — this is the user-driven commit the new UI asks for.
async function commitSaveChanges() {
    _dirtySinceSave = false;
    _updateSaveIndicator('saving');
    try { _writeAutosave(); } catch (e) { console.warn('Local save failed:', e); }
    // Cloud push only when actually signed in, so we don't nag with a sign-in prompt.
    let cloud = false;
    if (typeof _supabaseSession !== 'undefined' && _supabaseSession && _supabaseSession.user) {
        // 3 Sep 2026 — the toast below must not claim a cloud save that did not land.
        try { cloud = (await saveProjectToCloud()) === true; } catch (e) { console.warn('Cloud save failed:', e); }
    }
    _updateSaveIndicator('saved');
    if (typeof showToast === 'function') {
        showToast(cloud ? 'Changes saved locally and to the cloud.' : 'Changes saved locally.', 'success', 2000);
    }
}

function ftaTreeSearch(reset) {
    const input = document.getElementById('fta-tree-search-input');
    const countEl = document.getElementById('fta-tree-search-count');
    if (!input) return;
    const q = (input.value || '').trim().toLowerCase();
    if (reset || _ftaSearchHitsQuery !== q) {
        _ftaSearchHits = [];
        _ftaSearchHitsQuery = q;
        if (q && Array.isArray(ftaPages)) {
            // Walk every page's tree. Pages already include sub-trees that live behind transfer
            // gates (each is its own ftaPages entry), so iterating pages gives full cross-tree
            // coverage without following transfer links (which would double-count / loop).
            // Each node is scored (exact > all-words > fuzzy) so "similar wording" surfaces too.
            ftaPages.forEach(page => {
                if (!page || !page.root) return;
                (function walk(n, seen) {
                    if (!n || seen.has(n.id)) return; seen.add(n.id);
                    const score = _ftaMatchScore(q, n);
                    if (score > 0) _ftaSearchHits.push({ pageId: page.id, node: n, score: score });
                    const kids = n.children || n._children;   // search collapsed subtrees too
                    if (kids) kids.forEach(c => walk(c, seen));
                })(page.root, new Set());
            });
            // Most relevant first (exact substring → all-words → fuzzy); stable within a tier.
            _ftaSearchHits.sort((a, b) => b.score - a.score);
        }
        _ftaSearchIdx = 0;
    } else if (_ftaSearchHits.length) {
        _ftaSearchIdx = (_ftaSearchIdx + 1) % _ftaSearchHits.length;
    }
    if (countEl) countEl.textContent = _ftaSearchHits.length ? ((_ftaSearchIdx + 1) + '/' + _ftaSearchHits.length) : (q ? '0' : '');
    const hit = _ftaSearchHits[_ftaSearchIdx];
    if (hit) _ftaGoToSearchHit(hit);
}
// d3.hierarchy lays out via d.children only, so a hit under a collapsed ancestor (kids parked
// in _children) won't render. Reveal the path root→target by un-collapsing each ancestor.
function _ftaExpandPathToNode(root, target) {
    let path = null;
    (function rec(n, trail) {
        if (!n || path) return;
        const here = trail.concat([n]);
        if (n === target) { path = here; return; }
        const kids = n.children || n._children;
        if (kids) kids.forEach(c => rec(c, here));
    })(root, []);
    if (!path) return false;
    let changed = false;
    for (let i = 0; i < path.length - 1; i++) {        // ancestors only (exclude the target)
        const n = path[i];
        if (n._children && (!n.children || !n.children.length)) { n.children = n._children; n._children = null; changed = true; }
    }
    return changed;
}
// Pan/zoom so a node sits in the middle of the viewport (match by object identity — safe across
// pages even if internal ids ever collide).
function _ftaCenterOnNode(targetNode) {
    if (!svg || !g || !zoom || typeof d3 === 'undefined') return;
    let laid = null;
    g.selectAll('g.node').each(function (d) { if (d && d.data === targetNode) laid = d; });
    const parent = document.getElementById('svg-wrap-container');
    if (!laid || !parent) return;
    const scale = 1.0;
    const tx = parent.clientWidth / 2 - scale * laid.x;
    const ty = parent.clientHeight / 2 - scale * laid.y;
    svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
}
// #42 — when the node-edit drawer opens, pan the selected node into the area beside the drawer,
// but only if it would otherwise sit behind it or off-screen. Preserves the current zoom level.
function _ftaRevealNodeBesidePanel(targetNode) {
    if (!svg || !g || !zoom || typeof d3 === 'undefined') return;
    let laid = null;
    g.selectAll('g.node').each(function (d) { if (d && d.data === targetNode) laid = d; });
    const parent = document.getElementById('svg-wrap-container');
    if (!laid || !parent) return;
    const panel = document.getElementById('node-config-panel');
    const panelW = (panel && getComputedStyle(panel).display !== 'none') ? panel.getBoundingClientRect().width : 0;
    const t = d3.zoomTransform(svg.node());
    const W = parent.clientWidth, H = parent.clientHeight;
    const sx = t.x + t.k * laid.x, sy = t.y + t.k * laid.y;
    const hidden = sx > (W - panelW - 40) || sx < 60 || sy < 90 || sy > H - 90;
    if (!hidden) return;
    const tx = (W - panelW) / 2 - t.k * laid.x;
    const ty = H / 2 - t.k * laid.y;
    svg.transition().duration(450).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(t.k));
}
// #44 — Zoom to selection: center the canvas on the selected node at a comfortable zoom.
function ftaZoomToSelection() {
    if (typeof selectedNodeData === 'undefined' || !selectedNodeData) {
        if (typeof showToast === 'function') showToast('Select a node first, then zoom to it.', 'info', 3000);
        return;
    }
    if (!svg || !g || !zoom || typeof d3 === 'undefined') return;
    let laid = null;
    g.selectAll('g.node').each(function (d) { if (d && d.data === selectedNodeData) laid = d; });
    const parent = document.getElementById('svg-wrap-container');
    if (!laid || !parent) return;
    const scale = 1.5;
    const tx = parent.clientWidth / 2 - scale * laid.x;
    const ty = parent.clientHeight / 2 - scale * laid.y;
    svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
}

function pushUndo(label) {
    // Skip while loading sample / recovery / undo-redo.
    if(_undoSuspended || _autosaveSuspended) return;
    // Coalesce rapid-fire wrapped calls — if multiple actions fire within ~150ms, treat
    // them as a single undo unit. Keeps the stack lean and avoids serializing the project
    // on every keystroke or chained operation.
    if(_undoCoalesceTimer) return;
    try {
        const snap = JSON.stringify(_snapshotProject());
        // Don't push identical snapshots (e.g. when an action runs but doesn't actually mutate state).
        if(snap === _lastUndoSnap) return;
        _undoStack.push({ label: label || 'edit', snap });
        _lastUndoSnap = snap;
        if(_undoStack.length > UNDO_LIMIT) _undoStack.shift();
        _redoStack = [];
        _undoCoalesceTimer = setTimeout(() => { _undoCoalesceTimer = null; }, 150);
    } catch(e){ console.warn('pushUndo failed:', e); }
}
function _restoreSnap(snapStr) {
    _undoSuspended = true;
    try {
        _applyProjectData(JSON.parse(snapStr));
        _lastUndoSnap = snapStr;
    } finally { _undoSuspended = false; }
}
function undo() {
    if(!_undoStack.length) return showToast('Nothing to undo.', 'info', 2000);
    const current = JSON.stringify(_snapshotProject());
    const prev = _undoStack.pop();
    _redoStack.push({ label: prev.label, snap: current });
    _restoreSnap(prev.snap);
    showToast('Undid: ' + prev.label, 'info', 2000);
}
function redo() {
    if(!_redoStack.length) return showToast('Nothing to redo.', 'info', 2000);
    const current = JSON.stringify(_snapshotProject());
    const next = _redoStack.pop();
    _undoStack.push({ label: next.label, snap: current });
    _restoreSnap(next.snap);
    showToast('Redid: ' + next.label, 'info', 2000);
}

async function _savePdf(doc, fileName) {
    try {
        if (typeof SaveFs !== 'undefined' && typeof doc.output === 'function') {
            const blob = doc.output('blob');
            return await SaveFs.saveBlob(blob, fileName);
        }
    } catch (e) { console.warn('_savePdf fallback:', e); }
    doc.save(fileName);
    return { ok: true, mode: 'download', name: fileName };
}


function _loadJsPDF() {
    if(window.jspdf) return Promise.resolve(window.jspdf);
    if(_jspdfLoading) return _jspdfLoading;
    _jspdfLoading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        s.onload = () => resolve(window.jspdf);
        s.onerror = () => reject(new Error('Could not load jsPDF (network required)'));
        document.head.appendChild(s);
    });
    return _jspdfLoading;
}

function renderValidationTable() {
    const host = document.getElementById('val-results-list');
    const summary = document.getElementById('val-summary-pill');
    if (!host) return;
    if (!_benchmarkResults) {
        host.innerHTML = '<div style="padding: var(--s-5); border: 1px dashed var(--color-border-thin); border-radius: var(--r-md); background: var(--color-surface-2); color: var(--color-text-tertiary); text-align: center; font-size: 13px;">Click <strong>Run All Benchmarks</strong> to validate every math engine against canonical reference problems.</div>';
        if (summary) summary.textContent = BENCHMARKS.length + ' benchmarks defined';
        return;
    }
    const passes = _benchmarkResults.filter(r => r.pass).length;
    const fails = _benchmarkResults.length - passes;
    const allPass = fails === 0;
    if (summary) {
        summary.innerHTML = allPass
            ? '<span style="color: var(--color-success); font-weight: 600;">✓ ' + passes + ' / ' + _benchmarkResults.length + ' passing</span>'
            : '<span style="color: var(--color-danger); font-weight: 600;">' + fails + ' failed</span> · <span style="color: var(--color-text-secondary);">' + passes + ' / ' + _benchmarkResults.length + ' passing</span>';
    }
    // Group by category.
    const grouped = {};
    _benchmarkResults.forEach(r => {
        if (!grouped[r.category]) grouped[r.category] = [];
        grouped[r.category].push(r);
    });
    const html = Object.entries(grouped).map(([cat, items]) => {
        const rows = items.map(r => {
            const passBadge = r.pass
                ? '<span style="color: var(--color-success); font-weight: 600; font-size: 11px;">✓ PASS</span>'
                : (r.error ? '<span style="color: var(--color-danger); font-weight: 600; font-size: 11px;">✕ ERROR</span>'
                           : '<span style="color: var(--color-danger); font-weight: 600; font-size: 11px;">✕ FAIL</span>');
            const errLine = r.error
                ? '<div style="color: var(--color-danger); font-size: 12px; margin-top: 4px;">Error: ' + esc(r.error) + '</div>'
                : '';
            const relLine = (r.relErr != null && !r.error)
                ? '<span class="u-muted-small">  rel.err = ' + (r.relErr === 0 ? '0' : r.relErr.toExponential(2)) + '</span>'
                : '';
            // Phase 56.37 — each row is a clickable summary header plus a
            // hidden expansion panel showing the stepwise calculation.
            return '<div style="border-bottom: 1px solid var(--color-border-hair);">' +
                     '<div onclick="window._toggleBenchmarkRow(\'' + esc(r.id) + '\')" style="padding: 10px 14px; cursor: pointer;" title="Click to show / hide stepwise calculation">' +
                       '<div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">' +
                         '<div style="flex: 1;"><strong class="u-text-md">' +
                            '<span id="bench-chev-' + esc(r.id) + '" style="color: var(--color-text-tertiary); margin-right: 6px; display: inline-block; width: 12px;">▸</span>' +
                            esc(r.name) + '</strong>' +
                            '<div style="font-size: 11px; color: var(--color-text-tertiary); margin-top: 2px; margin-left: 18px;">' + esc(r.source) + '</div>' +
                            '<div style="font-size: 11px; color: var(--color-text-secondary); font-family: var(--font-mono); margin-top: 4px; margin-left: 18px;">' + esc(r.citation) + '</div>' +
                         '</div>' +
                         '<div style="flex-shrink: 0; text-align: right;">' + passBadge + '<div style="font-size: 10px; color: var(--color-text-tertiary); margin-top: 2px;">' + (r.dtMs ? r.dtMs.toFixed(1) + ' ms' : '') + '</div></div>' +
                       '</div>' +
                       '<div style="display: flex; gap: 18px; margin-top: 6px; margin-left: 18px; font-family: var(--font-mono); font-size: 12px;">' +
                         '<div>expected: <strong>' + esc(_formatBenchValue(r.expected)) + '</strong></div>' +
                         '<div>computed: <strong style="color: ' + (r.pass ? 'var(--color-success)' : 'var(--color-danger)') + ';">' + esc(_formatBenchValue(r.computed)) + '</strong></div>' +
                         relLine +
                       '</div>' +
                       (r.detail ? '<div style="font-size: 11px; color: var(--color-text-tertiary); margin-top: 4px; margin-left: 18px; font-style: italic;">' + esc(r.detail) + '</div>' : '') +
                       errLine +
                     '</div>' +
                     // Expanded calculation panel — hidden by default.
                     '<div id="bench-exp-' + esc(r.id) + '" style="display: none; padding: 14px 18px 16px 32px; background: var(--color-surface-2); border-top: 1px solid var(--color-border-hair);">' +
                       '<div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-text-tertiary); font-weight: 600; margin-bottom: 8px;">Stepwise calculation</div>' +
                       _renderBenchmarkStepsHtml(_buildBenchmarkSteps(r)) +
                     '</div>' +
                   '</div>';
        }).join('');
        return '<div class="controls" style="padding: 0; border-left-color: var(--color-accent); overflow: hidden;">' +
                 '<div style="padding: 12px 14px; background: var(--color-surface-2); border-bottom: 1px solid var(--color-border-thin);"><strong class="u-text-md">' + esc(cat) + '</strong> <span style="color: var(--color-text-tertiary); font-size: 11px; margin-left: 6px;">' + items.filter(i => i.pass).length + ' / ' + items.length + '</span></div>' +
                 rows +
               '</div>';
    }).join('');
    host.innerHTML = html;
}

function exportValidationReport() {
    if (!_benchmarkResults) {
        showToast('Run the benchmarks first.', 'warning', 3000);
        return;
    }
    // Emit a CSV that's easy to attach to a cert package.
    const header = ['ID', 'Category', 'Name', 'Source', 'Citation', 'Expected', 'Computed', 'Tolerance', 'Relative Error', 'Pass', 'Time (ms)', 'Error'];
    const rows = _benchmarkResults.map(r => [
        r.id, r.category, r.name, r.source, r.citation,
        _formatBenchValue(r.expected), _formatBenchValue(r.computed),
        String(r.tolerance), r.relErr == null ? '' : r.relErr.toExponential(3),
        r.pass ? 'PASS' : 'FAIL', r.dtMs ? r.dtMs.toFixed(2) : '', r.error || ''
    ]);
    const csv = [header, ...rows].map(row => row.map(cell => {
        const s = String(cell);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'Safety_Lab_Math_Validation_' + new Date().toISOString().slice(0,10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Validation report exported.', 'success', 2500);
}

function _reviewTargetSubtitle(target) {
    if (!target) return '';
    const { kind, id, systemId } = target;
    let rec = null, idLabel = id, desc = '';
    try {
        if (kind === 'acFha') {
            rec = acFhaData.find(r => r.fcId === id);
            if (rec) { idLabel = rec.fcId; desc = rec.fcDesc || rec.severity || ''; }
        } else if (kind === 'acReq') {
            rec = acReqData.find(r => r.reqId === id);
            if (rec) { idLabel = rec.reqId; desc = rec.reqText || ''; }
        } else if (kind === 'acAsm') {
            rec = acAssumptionsData.find(r => r.asmId === id);
            if (rec) { idLabel = rec.asmId; desc = rec.statement || ''; }
        } else if (kind === 'pra') {
            rec = praData.find(r => r.praId === id);
            if (rec) { idLabel = rec.praId; desc = rec.threat || rec.description || ''; }
        } else if (kind === 'zsa') {
            rec = zsaData.find(r => r.zsaId === id);
            if (rec) { idLabel = rec.zsaId; desc = rec.zone || rec.threat || ''; }
        } else if (kind === 'cma') {
            rec = cmaData.find(r => r.cmaId === id);
            if (rec) { idLabel = rec.cmaId; desc = rec.subject || rec.claim || ''; }
        } else if (kind === 'fmea') {
            rec = fmeaData.find(r => r.fmeaId === id);
            if (rec) { idLabel = rec.fmeaId; desc = rec.mode || rec.part || rec.failureMode || rec.component || ''; }
        } else if (kind === 'sysFha' || kind === 'sysReq' || kind === 'sysAsm') {
            const sys = systemId ? systemsData.find(s => s.id === systemId) : null;
            if (sys) {
                if (kind === 'sysFha') { rec = (sys.fha || []).find(r => r.fcId === id); if (rec) { idLabel = rec.fcId; desc = rec.fcDesc || rec.severity || ''; } }
                if (kind === 'sysReq') { rec = (sys.req || []).find(r => r.reqId === id); if (rec) { idLabel = rec.reqId; desc = rec.reqText || ''; } }
                if (kind === 'sysAsm') { rec = (sys.asm || []).find(r => r.asmId === id); if (rec) { idLabel = rec.asmId; desc = rec.statement || ''; } }
            }
            if (sys) desc = (desc ? desc + ' · ' : '') + 'in ' + (sys.name || sys.id);
        } else if (/^hf[A-Z]/.test(String(kind))) {
            // HF lane rows (1 Sep 2026). Resolve through the HF module's own store so the
            // thread header names the row the way the lane shows it.
            const HX = (typeof window !== 'undefined') ? window.HF_ANALYSES : null;
            const M = { hfAlloc: ['alloc', 'key', ['subId','subName']], hfTid: ['tid', 'taskId', ['taskName','opsMode']], hfTask: ['tasks', 'taskId', ['task','phase']], hfHea: ['hea', 'heaId', ['task','errorMode']],
                        hfAlerts: ['alerts', 'alertId', ['name','priority']], hfErgo: ['ergo', 'ergoId', ['item','finding']], hfCd: ['cd', 'cdId', ['item','consideration']],
                        hfSa: ['sa', 'saId', ['element','level']], hfMfc: ['mfc', 'key', ['role','note']] }[kind];
            if (HX && typeof HX._read === 'function' && M) {
                const st = HX._read(M[0]) || {};
                rec = (st.rows || []).find(r => String(r[M[1]]) === String(id)) || null;
                if (kind === 'hfAlloc' && !rec && typeof acFunctionsData !== 'undefined') { const f = (acFunctionsData || []).find(x => String(x.internalId) === String(id)); if (f) { idLabel = f.subId || id; desc = f.subName || ''; } }
                if (kind === 'hfMfc') { const fn = (HX.MFC_FUNCTIONS || []).find(x => x.key === id); if (fn) idLabel = fn.label; }
                if (rec) { desc = M[2].map(k => rec[k]).filter(Boolean).join(' · '); }
            }
        }
    } catch (_) {}
    if (desc && desc.length > 110) desc = desc.slice(0, 107) + '…';
    return idLabel + (desc ? ' · ' + desc : '');
}

function commentTriggerHtml(target) {
    const open = Review.openCountFor(target);
    const total = Review.totalCountFor(target);
    const cls = 'comment-trigger' + (open > 0 ? ' has-open' : '');
    const label = total > 0 ? ('💬 ' + open + (total > open ? '/' + total : '')) : '💬';
    const t = JSON.stringify(target).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
    const aria = open > 0 ? (open + ' open comment' + (open === 1 ? '' : 's')) : 'Add comment';
    return '<button class="' + cls + '" tabindex="0" aria-label="' + aria + '" title="' + aria + '" ' +
        'onclick="event.stopPropagation(); openReviewPanel(JSON.parse(this.getAttribute(\'data-target\').replace(/&quot;/g, \'\\&quot;\')))" ' +
        'data-target="' + t + '" data-comment-target="' + esc(target.kind + ':' + target.id) + '">' + label + '</button>';
}

// Recompute all 💬N triggers for a given target without re-rendering the whole table.
function _refreshCommentTriggersFor(target) {
    if (!target) return;
    const key = target.kind + ':' + target.id;
    document.querySelectorAll('[data-comment-target="' + CSS.escape(key) + '"]').forEach(btn => {
        const open = Review.openCountFor(target);
        const total = Review.totalCountFor(target);
        btn.classList.toggle('has-open', open > 0);
        btn.textContent = total > 0 ? ('💬 ' + open + (total > open ? '/' + total : '')) : '💬';
    });
}

// If the consolidated review summary tab is currently visible, refresh it.
function _refreshReviewSummaryIfOpen() {
    const v = document.getElementById('view-review');
    if (v && v.style.display !== 'none' && typeof renderReviewSummary === 'function') {
        renderReviewSummary();
    }
    // Dashboard worklist bucket (if visible).
    const d = document.getElementById('view-dashboard');
    if (d && d.style.display !== 'none' && typeof renderReviewDashboardBucket === 'function') {
        renderReviewDashboardBucket();
    }
}

function _fuzzyScore(q, text) {
    if (!q) return 0.001;
    q = q.toLowerCase(); text = text.toLowerCase();
    if (text.includes(q)) return 100 - text.indexOf(q);
    // simple subsequence
    let i = 0, j = 0, hits = 0;
    while (i < q.length && j < text.length) {
        if (q[i] === text[j]) { hits++; i++; }
        j++;
    }
    return i === q.length ? 30 + hits : 0;
}

function _renderCmdPaletteResults(query) {
    const list = document.getElementById('cmd-palette-results');
    if (!list) return;
    const all = (typeof Traceability !== 'undefined') ? Traceability.listAllArtifacts() : [];
    const items = [];
    // Static nav: always shown when there's no query, or matched against the query.
    STATIC_NAV_ITEMS.forEach(n => {
        const s = _fuzzyScore(query, n.label);
        if (s > 0 || !query) items.push({ kind: 'nav', label: n.label, tab: n.tab, score: s + (query ? 0 : 50) });
    });
    all.forEach(a => {
        const s = _fuzzyScore(query, a.label + ' ' + (a.searchText || ''));
        if (s > 0 || !query) items.push(Object.assign({}, a, { score: query ? s : 0.5 }));
    });
    items.sort((a, b) => b.score - a.score);
    _palCurrentItems = items.slice(0, 80);
    _palActiveIdx = 0;
    if (!_palCurrentItems.length) {
        list.innerHTML = '<div class="cmd-palette-empty">No matches for "' + esc(query) + '".</div>';
        return;
    }
    let html = '';
    _palCurrentItems.forEach((item, idx) => {
        const kindLabel = item.kind === 'nav' ? 'Nav' : (Traceability.KIND_LABELS[item.kind] || item.kind);
        html += '<div class="cmd-palette-item' + (idx === 0 ? ' active' : '') + '" data-idx="' + idx + '" role="option" onclick="cmdPaletteSelect(' + idx + ')">';
        html += '<span class="cmd-palette-kind">' + esc(kindLabel) + '</span>';
        html += '<span class="cmd-palette-label">' + esc(item.label) + '</span>';
        html += '</div>';
    });
    list.innerHTML = html;
}

function renderWorklist() {
    const host = document.getElementById('dash-worklist-host');
    if (!host) return;
    if (typeof Traceability === 'undefined') { host.innerHTML = ''; return; }
    const w = Traceability.getWorklist();

    function buildCard(title, items, severity) {
        const n = items.length;
        const sevClass = n === 0 ? 'zero' : (severity || '');
        let inner = '';
        if (!n) {
            inner = '<div class="dash-worklist-empty">Nothing to address. Nice.</div>';
        } else {
            inner = '<div class="dash-worklist-list">' + items.slice(0, 12).map(d => {
                const json = JSON.stringify(d).replace(/"/g, '&quot;');
                return '<div class="dash-worklist-row" tabindex="0" role="button" onclick="jumpToArtifact(JSON.parse(this.getAttribute(\'data-descriptor\').replace(/&quot;/g, \'\\&quot;\').replace(/\\\\&quot;/g, \'&quot;\')))" onkeydown="if(event.key===\'Enter\'){this.click();}" data-descriptor="' + json + '">' + esc(d.label) + '</div>';
            }).join('') + '</div>';
            if (items.length > 12) inner += '<div class="dash-worklist-empty">… and ' + (items.length - 12) + ' more.</div>';
        }
        return '<div class="dash-worklist-card"><h4>' + esc(title) + '<span class="dash-worklist-count ' + sevClass + '">' + n + '</span></h4>' + inner + '</div>';
    }

    let html = '';
    html += buildCard('Stale requirements — sources have drifted', w.staleReqs, 'warning');
    html += buildCard('Compromised independence requirements',     w.compromisedReqs, 'danger');
    html += buildCard('Obsolete requirements pending archive',     w.obsoletePending, 'warning');
    html += buildCard('Orphan FMEA rows — references deleted',     w.orphanFmea, 'warning');
    html += buildCard('Open CMAs with identified common modes',    w.openCmas, 'warning');
    // Duplicate pairs need a slightly different render
    const dupCount = w.duplicatePairs.length;
    let dupInner;
    if (!dupCount) dupInner = '<div class="dash-worklist-empty">Nothing to reconcile.</div>';
    else dupInner = '<div class="dash-worklist-list">' + w.duplicatePairs.slice(0, 12).map(p => {
        const a = p.winner ? p.winner.label : '?';
        const b = p.loser ? p.loser.label : '?';
        const json = p.loser ? JSON.stringify(p.loser).replace(/"/g, '&quot;') : '';
        return '<div class="dash-worklist-row" tabindex="0" role="button" data-descriptor="' + json + '" onclick="if(this.getAttribute(\'data-descriptor\'))jumpToArtifact(JSON.parse(this.getAttribute(\'data-descriptor\').replace(/&quot;/g, \'\\&quot;\').replace(/\\\\&quot;/g, \'&quot;\')))">' + esc(p.kind) + ': ' + esc(a.slice(0, 40)) + ' ↔ ' + esc(b.slice(0, 40)) + '</div>';
    }).join('') + '</div>';
    html += '<div class="dash-worklist-card"><h4>Duplicate AC↔Sys requirement pairs<span class="dash-worklist-count ' + (dupCount === 0 ? 'zero' : 'warning') + '">' + dupCount + '</span></h4>' + dupInner + '</div>';

    // Phase 50.5 — open review-comments bucket. Reuse the same card structure so the
    // worklist visual rhythm stays uniform.
    html += _buildDashReviewBucket();

    host.innerHTML = html;
}

// Reusable for the review summary tab too — returns the dashboard bucket fragment.
function _buildDashReviewBucket() {
    if (typeof Review === 'undefined') return '';
    const open = Review.allOpen();
    const n = open.length;
    const sevClass = n === 0 ? 'zero' : (n > 10 ? 'danger' : 'warning');
    let inner;
    if (!n) {
        inner = '<div class="dash-worklist-empty">No open review comments.</div>';
    } else {
        inner = '<div class="dash-worklist-list">' + open.slice(0, 12).map(c => {
            const label = '[' + Review.kindLabel(c.target.kind) + ' ' + c.target.id + '] '
                        + (c.text.length > 80 ? c.text.slice(0, 77) + '…' : c.text)
                        + ' — ' + c.authorName + ', ' + Review.relTime(c.timestamp);
            return '<div class="dash-worklist-row" tabindex="0" role="button" ' +
                'onclick="reviewJumpFromComment(\'' + esc(c.commentId) + '\')" ' +
                'onkeydown="if(event.key===\'Enter\'){this.click();}">' + esc(label) + '</div>';
        }).join('') + '</div>';
        if (open.length > 12) inner += '<div class="dash-worklist-empty">… and ' + (open.length - 12) + ' more.</div>';
    }
    return '<div class="dash-worklist-card"><h4>Open review comments<span class="dash-worklist-count ' + sevClass + '">' + n + '</span></h4>' + inner + '</div>';
}

function _allReqsForBaseline() {
    return [...acReqData, ...systemsData.flatMap(s => s.req || [])];
}
function _allAsmsForBaseline() {
    return [...acAssumptionsData, ...systemsData.flatMap(s => s.asm || [])];
}

function _captureDashboardBaseline() {
    const reqs = {};
    _allReqsForBaseline().forEach(r => {
        reqs[r.reqId] = {
            verifStatus: r.verifStatus || null,
            status: r.status || null,
            obsolete: !!(r.reqSource && r.reqSource.obsolete)
        };
    });
    const asms = {};
    _allAsmsForBaseline().forEach(a => {
        asms[a.asmId] = { state: a.state || null };
    });
    if (!projectConfig) projectConfig = {};
    projectConfig.dashboardBaseline = { ts: Date.now(), requirements: reqs, assumptions: asms };
    try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
}

// Returns null when no baseline has been captured yet — the UI shows an empty state.
function _computeDashboardDeltas() {
    const base = projectConfig && projectConfig.dashboardBaseline;
    if (!base) return null;

    const baseReq = base.requirements || {};
    const baseAsm = base.assumptions || {};
    const reqs = { added: 0, verified: 0, archived: 0, obsoleted: 0, removed: 0 };
    const asms = { added: 0, validated: 0, verified: 0, removed: 0 };

    const seenReqIds = new Set();
    for (const r of _allReqsForBaseline()) {
        const id = r.reqId;
        if (!id) continue;
        seenReqIds.add(id);
        const snap = baseReq[id];
        if (!snap) {
            reqs.added++;
            continue;
        }
        // State transitions: only count records where the field has FLIPPED
        // from false-y to true-y since the baseline. Records that were already
        // verified/archived/obsolete at baseline shouldn't re-count.
        if (snap.verifStatus !== 'Verified' && r.verifStatus === 'Verified') reqs.verified++;
        if (snap.status !== 'archived' && r.status === 'archived') reqs.archived++;
        const wasObsolete = !!snap.obsolete;
        const isObsolete = !!(r.reqSource && r.reqSource.obsolete);
        if (!wasObsolete && isObsolete) reqs.obsoleted++;
    }
    for (const id of Object.keys(baseReq)) if (!seenReqIds.has(id)) reqs.removed++;

    const seenAsmIds = new Set();
    for (const a of _allAsmsForBaseline()) {
        const id = a.asmId;
        if (!id) continue;
        seenAsmIds.add(id);
        const snap = baseAsm[id];
        if (!snap) {
            asms.added++;
            continue;
        }
        // "Validated" counts when state moves from Proposed → Validated. A direct
        // Proposed → Verified jump skips Validated, so we only count it under verified.
        const wasValOrUp = snap.state === 'Validated' || snap.state === 'Verified';
        const wasVerified = snap.state === 'Verified';
        if (!wasValOrUp && a.state === 'Validated') asms.validated++;
        if (!wasVerified && a.state === 'Verified') asms.verified++;
    }
    for (const id of Object.keys(baseAsm)) if (!seenAsmIds.has(id)) asms.removed++;

    return { reqs, asms, since: base.ts };
}

function renderDashboardActivityPanel() {
    const host = document.getElementById('dash-activity-host');
    if (!host) return;
    const d = _computeDashboardDeltas();

    if (!d) {
        host.innerHTML =
            '<div class="dash-activity-card empty">' +
                '<div class="dash-activity-empty-title">No baseline captured yet.</div>' +
                '<div class="dash-activity-empty-body">Activity metrics start tracking the moment you export a Dashboard PDF — or click the button below.</div>' +
                '<button class="btn-cyan" onclick="captureDashboardBaselineNow()">Capture baseline now</button>' +
            '</div>';
        return;
    }

    const since = new Date(d.since);
    const sinceLabel = since.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
    const reqCells = [
        { label: 'New requirements',     value: d.reqs.added,     cls: d.reqs.added     ? 'pos' : 'zero' },
        { label: 'Newly verified',       value: d.reqs.verified,  cls: d.reqs.verified  ? 'pos' : 'zero' },
        { label: 'Archived',             value: d.reqs.archived,  cls: d.reqs.archived  ? 'warn' : 'zero' },
        { label: 'Obsoleted',            value: d.reqs.obsoleted, cls: d.reqs.obsoleted ? 'warn' : 'zero' },
        { label: 'Removed',              value: d.reqs.removed,   cls: d.reqs.removed   ? 'warn' : 'zero' }
    ];
    const asmCells = [
        { label: 'New assumptions',      value: d.asms.added,     cls: d.asms.added     ? 'pos' : 'zero' },
        { label: 'Newly validated',      value: d.asms.validated, cls: d.asms.validated ? 'pos' : 'zero' },
        { label: 'Newly verified',       value: d.asms.verified,  cls: d.asms.verified  ? 'pos' : 'zero' },
        { label: 'Removed',              value: d.asms.removed,   cls: d.asms.removed   ? 'warn' : 'zero' }
    ];
    function cellHtml(c) {
        return '<div class="dash-activity-cell ' + c.cls + '">' +
            '<div class="dash-activity-value">' + c.value + '</div>' +
            '<div class="dash-activity-label">' + esc(c.label) + '</div>' +
        '</div>';
    }
    host.innerHTML =
        '<div class="dash-activity-card">' +
            '<div class="dash-activity-head">' +
                '<div>' +
                    '<div class="dash-activity-eyebrow">Activity since last Dashboard PDF</div>' +
                    '<div class="dash-activity-since">Baseline captured ' + esc(sinceLabel) + '</div>' +
                '</div>' +
                '<button class="btn-ghost" onclick="captureDashboardBaselineNow()" title="Reset the baseline to right now">↺ Reset baseline</button>' +
            '</div>' +
            '<div class="dash-activity-section-title">Requirements</div>' +
            '<div class="dash-activity-row">' + reqCells.map(cellHtml).join('') + '</div>' +
            '<div class="dash-activity-section-title">Assumptions</div>' +
            '<div class="dash-activity-row">' + asmCells.map(cellHtml).join('') + '</div>' +
        '</div>';
}

function wrapFormCollapsible(viewId, formSelector, opts) {
    opts = opts || {};
    const root = document.getElementById(viewId);
    if (!root) return;
    if (root.querySelector('.collapsible-form-bar')) return;   // already wrapped
    const form = root.querySelector(formSelector);
    if (!form) return;
    const bar = document.createElement('div');
    bar.className = 'collapsible-form-bar' + (opts.openByDefault ? ' open' : '');
    bar.innerHTML = '<span class="cfb-title">＋ ' + (opts.title || 'New entry') + '</span><span class="cfb-chev">▼</span>';
    const wrap = document.createElement('div');
    wrap.className = 'collapsible-form-content' + (opts.openByDefault ? ' open' : '');
    form.parentNode.insertBefore(bar, form);
    form.parentNode.insertBefore(wrap, form);
    wrap.appendChild(form);
    // The wrapped form was display: '' (controls class). Re-show it after move.
    form.style.display = '';
    // Phase 66.25 — the open state used to stop at `max-height: 2400px; overflow: hidden`.
    // Both are required DURING the animation and both are wrong after it: a form taller
    // than 2400px was cut off with no scrollbar and no way to reach the rest, and the
    // hidden overflow clipped any dropdown opening past the edge. So: animate under the
    // cap, then hand the element back to its natural height by adding .cfc-settled, and
    // take the cap back before a close so the closing transition still has somewhere to
    // travel from. Net effect: the animation is unchanged in both directions and no
    // content is ever unreachable.
    const _settle = (e) => {
        if (e && e.propertyName && e.propertyName !== 'max-height') return;
        if (wrap.classList.contains('open')) wrap.classList.add('cfc-settled');
    };
    wrap.addEventListener('transitionend', _settle);
    bar.addEventListener('click', () => {
        const closing = wrap.classList.contains('open');
        if (closing) {
            // Drop back to the capped state and force a reflow, so the transition starts
            // from a real pixel height instead of from `none` (which does not animate).
            wrap.classList.remove('cfc-settled');
            void wrap.offsetHeight;
        }
        bar.classList.toggle('open');
        wrap.classList.toggle('open');
    });
    // A form that starts open never fires a transition, so settle it immediately.
    if (opts.openByDefault) wrap.classList.add('cfc-settled');
}

// Apply collapsible wrappers to the common data-entry tabs once DOM is ready.
// Phase 53.20 — System workspace sub-views (ws-view-*) are added so the
// "Log entry" forms collapse on the System Safety side just like Aircraft.
function applyCollapsibleForms() {
    const targets = [
        // Aircraft Safety
        ['view-ac-func',  '.controls', 'Add function/s'],
        ['view-ac-fcim',  '.controls', 'Log failure condition'],
        ['view-ac-fha',   '.controls', 'Log FHA hazard'],
        ['view-ac-req',   '.controls', 'Log requirement'],
        ['view-ac-asm',   '.controls', 'Log assumption'],
        // Systems Safety workspace sub-views — same pattern.
        ['ws-view-func',  '.controls', 'Add system function'],
        ['ws-view-fcim',  '.controls', 'Log system failure condition'],
        ['ws-view-fha',   '.controls', 'Log system FHA hazard'],
        ['ws-view-req',   '.controls', 'Log system requirement'],
        ['ws-view-asm',   '.controls', 'Log system assumption'],
        // Cross-cutting analyses
        ['view-pra',      '.controls', 'Log PRA evaluation'],
        ['view-zsa',      '.controls', 'Log zonal analysis'],
        ['view-cma',      '.controls', 'Log CMA entry'],
        ['view-fmea',     '.controls', 'Log FMEA entry']
    ];
    targets.forEach(([viewId, sel, title]) => wrapFormCollapsible(viewId, sel, { title }));
}
