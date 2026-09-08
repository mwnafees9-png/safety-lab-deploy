// bindings_modules.js — v1.0 — Phase P2 batch 5: self-contained constants + API bindings.
// MOVED VERBATIM from safety_lab.js (byte-exact). Two machine-proven classes:
//   1. const/let data declarations whose initializers evaluate in an EMPTY VM
//      (no external references; TDZ semantics prove the monolith never read them
//      before their original position).
//   2. window.<name> = <function-literal> bindings assigned exactly once across
//      the codebase, VM-pure, and screened against load-time reads in every
//      remaining monolith IIFE/listener/declaration.
// Load order: BEFORE safety_lab.js. Zero behavior change.
const BETA_BUILD_ID = 'dev-build';         // e.g. 'beta-2026-05-jane.smith'

const BETA_TESTER_LABEL = 'Internal dev';  // human-readable label

const BUILD_EXPIRES_AT = 4102444800000;    // dev default ≈ 2100; build.sh overrides

const BETA_FEEDBACK_EMAIL = 'safetylab-beta@example.com';   // build.sh substitutes

let svg, g, zoom, treeLayout;

let projectSourceDocs = [];

const _SLAB_DOC_IMG_MAX = 1600000;        // skip persisting any single base64 image larger than ~1.6MB

const _SLAB_DOC_IMG_TOTAL_MAX = 8000000;  // cap total persisted image base64 bytes per project at ~8MB

let aiAssumptions = [];

const _AI_ASM_TYPES   = ['independence', 'data', 'architecture', 'operational', 'other'];

const _AI_ASM_STATUSES = ['Open', 'Confirmed', 'Rejected'];

const _aiAsmFilter = { analysis: 'all', status: 'all' };

const _AI_ASM_TYPE_TINT = {
    independence: '#7c3aed', data: '#0e7490', architecture: '#b45309',
    operational: '#0f766e', other: '#64748b'
};

let activeSystemId = null;

let projectName = 'Untitled Project';

let reviewCommentsData = [];

let reviewCounter = 1;

let reviewApprovalsData = [];

let activeReviewerName = (function() {
    try { return localStorage.getItem('safetyLab.activeReviewerName') || ''; }
    catch (_) { return ''; }
})();

let fmeaData = []; let fmeaCounter = 1;

let itemsData = [];

// ---------------------------------------------------------------------------
// FLIGHT PHASES (1 Aug 2026) — ONE vocabulary, owned by this table.
//
// There were three disagreeing lists, and the disagreement was silent:
//   · the FHA form's checkbox grid — static HTML in index.html, nine phases;
//   · FLIGHT_PHASES in ai_assistant.js — eight, offering a "Go-around" the form
//     did not, and omitting the Standing / Initial Climb the form did;
//   · this table — whatever the project happened to contain.
// Exposure normalisation matches an FHA row's phases against THIS table
// (getPhaseExposureRatio). A phase the form offered but the table did not hold
// scored no exposure, so the normalisation quietly did not run and the
// requirement was sized against the whole envelope instead of the window the
// condition is actually exposed in.
//
// The table is now the single source. The FHA grid is RENDERED from it
// (renderFhaPhaseGrid in helpers_modules.js), so a phase cannot be selected on
// an FHA row unless it exists here — which is what makes name-normalisation for
// the trees unnecessary rather than merely unused.
//
// NOMINAL phases are the mission. Their durations sum to the t_mission behind
// every exposure ratio.
//
// SPECIAL (contingency) phases — rejected take-off, go-around — are NOT part of
// the nominal mission: they are flown on a small fraction of departures. Two
// consequences, both enforced in support_modules.js:
//
//   · They are EXCLUDED from getTotalFlightDuration. Sum them into the mission
//     and every exposure ratio in the project is diluted by time most flights
//     never spend.
//
//   · An FHA row that names one holds its exposure window at the FULL flight
//     instead of shrinking to the contingency's own duration. A function needed
//     during a go-around must have survived the entire preceding flight to be
//     available when the go-around is flown: the failure accrues across the
//     flight and is REVEALED at the demand. Sizing t to the three minutes of
//     the go-around itself would understate the probability by roughly two
//     orders of magnitude — in the unconservative direction, which is the one
//     that does not announce itself.
//
//     The honest per-flight exposure of a contingency phase is
//     P(demand) x duration, and this tool has no occurrence-frequency field.
//     Rather than invent a frequency, it holds the conservative bound: r = 1.
//     Adding that field is logged as an open item, not guessed at here.
// ---------------------------------------------------------------------------
// 5 Sep 2026 (lever 3) — every phase carries its ESCAPE: how the flight gets out of a
// condition whose effect has not yet been felt. The FHA drafter is told these, and
// fha_derive.js applies the 4 Sep ruling from them (not realised + escapable and not
// defeated → No Safety Effect; not realised + no escape or defeated → the end effect).
// A project saved before this field existed reads the same defaults by phase name.
const DEFAULT_FLIGHT_PHASES = [
    {phase: 'Standing', altFrom: '', altFromUnit: 'AGL', altTo: '', altToUnit: 'AGL', duration: '1', durationUnit: 'hours', escape: 'stop on the ground'},
    {phase: 'Taxi', altFrom: '', altFromUnit: 'AGL', altTo: '', altToUnit: 'AGL', duration: '15', durationUnit: 'mins', escape: 'stop on the ground'},
    {phase: 'Takeoff', altFrom: '0', altFromUnit: 'AGL', altTo: '1500', altToUnit: 'AGL', duration: '2', durationUnit: 'mins', escape: 'reject the take-off before V1'},
    {phase: 'Initial Climb', altFrom: '1500', altFromUnit: 'AGL', altTo: '10000', altToUnit: 'ASL', duration: '5', durationUnit: 'mins', escape: 'continue to a landing'},
    {phase: 'Climb', altFrom: '10000', altFromUnit: 'ASL', altTo: '35000', altToUnit: 'ASL', duration: '20', durationUnit: 'mins', escape: 'continue to a landing'},
    {phase: 'Cruise', altFrom: '35000', altFromUnit: 'ASL', altTo: '35000', altToUnit: 'ASL', duration: '4', durationUnit: 'hours', escape: 'continue to a landing'},
    {phase: 'Descent', altFrom: '35000', altFromUnit: 'ASL', altTo: '10000', altToUnit: 'ASL', duration: '25', durationUnit: 'mins', escape: 'continue to a landing'},
    {phase: 'Approach', altFrom: '10000', altFromUnit: 'ASL', altTo: '1000', altToUnit: 'AGL', duration: '10', durationUnit: 'mins', escape: 'go-around'},
    {phase: 'Landing', altFrom: '1000', altFromUnit: 'AGL', altTo: '0', altToUnit: 'AGL', duration: '3', durationUnit: 'mins', escape: 'none'}
];

// Seeded into every new project alongside the nominal phases. These two are the
// contingencies a transport-category FHA almost always needs a row for, because
// they are where the demand on a degraded function is highest and the severity
// of losing it is worst.
const SPECIAL_FLIGHT_PHASES = [
    {phase: 'Rejected Takeoff', altFrom: '0', altFromUnit: 'AGL', altTo: '0', altToUnit: 'AGL', duration: '1', durationUnit: 'mins', special: true, escape: 'stop on the runway'},
    {phase: 'Go-around', altFrom: '0', altFromUnit: 'AGL', altTo: '3000', altToUnit: 'AGL', duration: '3', durationUnit: 'mins', special: true, escape: 'continue to a landing'}
];

// Offered by "+ Add contingency phase" on the Flight Phases tab. Not seeded —
// a programme adds the ones its concept of operations actually contains.
const SPECIAL_PHASE_CATALOGUE = [
    {phase: 'Balked Landing', altFrom: '0', altFromUnit: 'AGL', altTo: '3000', altToUnit: 'AGL', duration: '3', durationUnit: 'mins', special: true},
    {phase: 'Emergency Descent', altFrom: '35000', altFromUnit: 'ASL', altTo: '10000', altToUnit: 'ASL', duration: '6', durationUnit: 'mins', special: true},
    {phase: 'Diversion / Hold', altFrom: '10000', altFromUnit: 'ASL', altTo: '10000', altToUnit: 'ASL', duration: '45', durationUnit: 'mins', special: true},
    {phase: 'Engine-out Drift-down', altFrom: '35000', altFromUnit: 'ASL', altTo: '15000', altToUnit: 'ASL', duration: '20', durationUnit: 'mins', special: true},
    {phase: 'Single-engine Approach', altFrom: '3000', altFromUnit: 'AGL', altTo: '0', altToUnit: 'AGL', duration: '8', durationUnit: 'mins', special: true},
    {phase: 'Ditching / Forced Landing', altFrom: '3000', altFromUnit: 'AGL', altTo: '0', altToUnit: 'AGL', duration: '5', durationUnit: 'mins', special: true}
];

// Back-compat: a project saved before the `special` flag existed carries a plain
// "Go-around" row with no flag. Recognising it by NAME as well as by flag means
// shipping this build does not silently start inflating those projects' mission
// totals. Aliases cover the spellings the importer and the demos already emit.
const _SPECIAL_PHASE_NAMES = (function () {
    const set = {};
    SPECIAL_FLIGHT_PHASES.concat(SPECIAL_PHASE_CATALOGUE).forEach(function (p) { set[p.phase.toLowerCase()] = 1; });
    ['go around', 'goaround', 'go-round', 'rto', 'rejected take-off', 'rejected take off',
     'aborted takeoff', 'aborted take-off', 'baulked landing', 'missed approach',
     'diversion', 'hold', 'drift-down', 'driftdown'].forEach(function (n) { set[n] = 1; });
    return set;
})();

// Accepts a phase ROW or a phase NAME. Used by getTotalFlightDuration and
// getPhaseExposureRatio, so it must never throw on a malformed row.
function isSpecialPhase(p) {
    if (!p) return false;
    if (typeof p === 'object') {
        if (p.special === true) return true;
        if (p.special === false) return false;   // explicit override wins over the name table
        return isSpecialPhase(p.phase);
    }
    const n = String(p).trim().toLowerCase();
    return !!(n && _SPECIAL_PHASE_NAMES[n]);
}

// A fresh phase table: the nominal mission plus the seeded contingencies. Deep
// copied every time — handing out the constant itself would let one project's
// duration edits leak into the next new project.
function newDefaultPhaseTable() {
    return JSON.parse(JSON.stringify(DEFAULT_FLIGHT_PHASES.concat(SPECIAL_FLIGHT_PHASES)));
}

try {
    window.DEFAULT_FLIGHT_PHASES  = DEFAULT_FLIGHT_PHASES;
    window.SPECIAL_FLIGHT_PHASES  = SPECIAL_FLIGHT_PHASES;
    window.SPECIAL_PHASE_CATALOGUE = SPECIAL_PHASE_CATALOGUE;
    window.isSpecialPhase         = isSpecialPhase;
    window.newDefaultPhaseTable   = newDefaultPhaseTable;
} catch (_) {}

let flightPhasesData = newDefaultPhaseTable();

let internalIdCounter = 1; let typeCounters = { gate: 1, basic: 1, undeveloped: 1, conditioning: 1, house: 1 };

let slNumberingScheme = (window.SafetyLabNumbering ? window.SafetyLabNumbering.DEFAULT_SCHEME : null);

let slNumberingStore  = (window.SafetyLabNumbering ? window.SafetyLabNumbering.newStore() : { seq: {}, map: {} });

let projectConfig = {
    regulation: 'Part 25', part23Class: 'IV', override: false,
    // Phase 53.55 — added cert-basis sub-categories.
    //   part27Class:       'I' | 'II' | 'III' | 'IV'  (applies when regulation === 'Part 27'; 31 Aug 2026 split per
    //                      FAA PS-ASW-27-15 safety continuum — absent = legacy, resolves to the Class III alias row)
    //   scvtolCategory:    'Basic 1' | 'Basic 2' | 'Basic 3' | 'Enhanced'  (applies when regulation === 'SC-VTOL';
    //                      31 Aug 2026 split per MOC SC-VTOL Issue 2 Table 1 — legacy 'Basic' still resolves, = Basic 1)
    //   customCertBasis:   { name, probabilities, dals, notes }  (Pro feature, when regulation === 'Custom')
    scvtolCategory: 'Enhanced',
    customCertBasis: null,
    customLibrary: {}, piQ: 1, piE: 1,
    markovModels: [],   // [{ id, name, states: [{name, isFailed}], transitions: [{from, to, rate}] }]
    // #IFACE — system↔system interface edges (golden-thread lateral links). Shape:
    //   { id, fromSystemId, fromFuncId?, toSystemId, toFuncId?,
    //     kind: 'interface' | 'functional' | 'resource',
    //     medium?, direction?: 'a_to_b'|'b_to_a'|'bidirectional', icdRef?, resourceId?,
    //     status: 'active', aiEdited?, aiEditModel?, source? }
    // kind: interface=physical/data dependency · functional=A's fn relies on B's fn · resource=shared resource (CMA common-cause candidate)
    interfaces: [],
    // Phase 35 — user-defined Certification Mission Duration (hours). When > 0 it overrides
    // the sum of flightPhasesData rows as the t_mission used in FHA-driven exposure
    // normalization (binding case is the SHORTEST mission profile under the type cert).
    // null or 0 = "auto" (fall back to sum of phases, current behavior).
    missionDuration: null,
    // Phase 51 — dashboard activity baseline. Captured on Dashboard-PDF export so the
    // user can see what's moved since the last status share. Shape:
    //   { ts: <ms>, requirements: { reqId: { verifStatus, status, obsolete } },
    //                assumptions:  { asmId: { state } } }
    // null = no baseline captured yet → the activity panel shows an empty state.
    dashboardBaseline: null,
    // Phase 76 — special mission profiles. Each is a named flight-phase table (its durations)
    // used as the exposure-time basis for any fault tree that selects it (ftaPage.missionProfileId).
    // The DEFAULT profile is the canonical flightPhasesData; only SPECIAL profiles live here.
    // Shape: [{ id, name, phases:[{phase,altFrom,altFromUnit,altTo,altToUnit,duration,durationUnit}] }]
    missionProfiles: []
};

const LICENSE_TIERS = ['edu', 'pro', 'pro-plus', 'enterprise'];

const LICENSE_TIER_RANK = { 'edu': 0, 'pro': 1, 'pro-plus': 2, 'enterprise': 3 };

const COMPED_FREE_DOMAINS = ['electra.aero'];
// Staff domain — comped at the TOP tier (enterprise), not Pro+. Every
// @safetylabaero.com address (8 Sep 2026, Waqas). isCompedEmail() also matches
// these; compedTierFor() returns 'enterprise' for them.
const COMPED_ENTERPRISE_DOMAINS = ['safetylabaero.com'];
// Explicit block list — overrides ANY comp (domain or email). For a former
// member of a comped partner org who should no longer get free access.
const COMPED_BLOCKED_EMAILS = ['ali.salim@electra.aero'];

const COMPED_FREE_EMAILS = [
    'hussein@aerospace.consulting',  // Aerospace Consulting — signed partner (permanent)
    'mohamed@aerospace.consulting',  // Aerospace Consulting — signed partner (permanent)
    'mwnafees9@gmail.com',                                                                       // founder — permanent
    { email: 'anvarada30@gmail.com', expiresAt: '2026-07-27', reason: '2-month beta comp' },
    { email: 'vinnywin23@gmail.com', expiresAt: '2026-07-28', reason: '2-month beta comp' },
    { email: 'etchetoghetto@gmail.com', expiresAt: '2026-09-29', reason: '2-month beta comp' },
];

let _mocShowAllRegulations = false;

window.openMoCManager = function(scope, internalId) {
    const store = scope === 'ac' ? acReqData : ((systemsData.find(s => 'sys-' + s.id === scope) || {}).req || []);
    const req = store.find(r => String(r.internalId) === String(internalId));
    if (!req) return;
    if (!Array.isArray(req.mocEntries)) req.mocEntries = [];
    const cat = COMPLIANCE_CATALOGUE.map(c => '<option value="' + esc(c.regulation + '|' + c.paragraph) + '">' + esc(c.regulation + ' ' + c.paragraph + ' — ' + c.title.slice(0, 60)) + '</option>').join('');
    const methodOpts = MOC_METHODS.map(m => '<option value="' + esc(m) + '">' + esc(m) + '</option>').join('');
    const statusOpts = MOC_STATUS.map(s => '<option value="' + esc(s) + '">' + esc(s) + '</option>').join('');
    const existingRows = req.mocEntries.map((e, i) =>
        '<tr><td>' + esc(e.regulation) + '</td><td>' + esc(e.paragraph) + '</td><td>' + esc(e.method) + '</td><td>' + esc(e.status) + '</td><td>' + esc(e.notes || '') + '</td><td><button class="action-btn btn-red" onclick="removeMoCEntry(\'' + scope + '\',\'' + internalId + '\',' + i + ')">X</button></td></tr>'
    ).join('');
    const html =
        '<div style="background: rgba(0,0,0,0.4); position: fixed; inset: 0; z-index: 2100; display: flex; align-items: center; justify-content: center;" id="_mocOverlay" onclick="if(event.target===this)closeMoCManager()">' +
        '<div style="background: var(--color-surface-1); padding: 24px; border-radius: var(--r-lg); width: 720px; max-width: 92vw; max-height: 80vh; overflow-y: auto; box-shadow: var(--shadow-xl);">' +
            '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;"><h3 class="u-m0">MoC Entries — ' + esc(req.traceId || ('#' + internalId)) + '</h3><button class="btn-red" onclick="closeMoCManager()" class="u-m0">Close</button></div>' +
            '<p style="font-size: 12px; color: var(--color-text-secondary); margin: 0 0 12px 0;">' + esc(req.text || '') + '</p>' +
            (existingRows ? '<table class="reference-table" style="font-size: 12px; margin-bottom: 16px;"><thead><tr><th>Regulation</th><th>Paragraph</th><th>Method</th><th>Status</th><th>Notes</th><th></th></tr></thead><tbody>' + existingRows + '</tbody></table>' : '<p class="u-muted-italic">No MoC entries yet.</p>') +
            '<div style="border-top: 1px solid var(--color-border-hair); padding-top: 12px;"><h4 style="margin: 0 0 8px 0;">Add new entry</h4>' +
            '<div class="grid-2-col"><div><label>Catalog</label><select id="_mocCatSel"><option value="">— Custom (enter below) —</option>' + cat + '</select><label>Regulation</label><input type="text" id="_mocRegInput" placeholder="e.g., 14 CFR Part 25"><label>Paragraph</label><input type="text" id="_mocParaInput" placeholder="e.g., §25.1309(b)"></div><div><label>Method</label><select id="_mocMethodSel">' + methodOpts + '</select><label>Status</label><select id="_mocStatusSel">' + statusOpts + '</select><label>Notes</label><input type="text" id="_mocNotesInput" placeholder="optional"></div></div>' +
            '<div class="action-group" style="margin-top: 12px;"><button class="btn-green" onclick="addMoCEntry(\'' + scope + '\',\'' + internalId + '\')">+ Add Entry</button></div></div>' +
        '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    // Wire catalog-pick to autofill regulation + paragraph fields.
    const sel = document.getElementById('_mocCatSel');
    if (sel) sel.addEventListener('change', () => {
        const v = sel.value;
        if (!v) return;
        const [reg, para] = v.split('|');
        const r = document.getElementById('_mocRegInput'); if (r) r.value = reg;
        const p = document.getElementById('_mocParaInput'); if (p) p.value = para;
    });
};

window.closeMoCManager = function() {
    const ov = document.getElementById('_mocOverlay');
    if (ov) ov.remove();
};

window.addMoCEntry = function(scope, internalId) {
    const store = scope === 'ac' ? acReqData : ((systemsData.find(s => 'sys-' + s.id === scope) || {}).req || []);
    const req = store.find(r => String(r.internalId) === String(internalId));
    if (!req) return;
    if (!Array.isArray(req.mocEntries)) req.mocEntries = [];
    const entry = {
        regulation: (document.getElementById('_mocRegInput')   || {}).value || '',
        paragraph:  (document.getElementById('_mocParaInput')  || {}).value || '',
        method:     (document.getElementById('_mocMethodSel')  || {}).value || '',
        status:     (document.getElementById('_mocStatusSel')  || {}).value || 'Pending',
        notes:      (document.getElementById('_mocNotesInput') || {}).value || ''
    };
    if (!entry.regulation || !entry.paragraph) return alert('Pick a catalog entry or fill in the regulation + paragraph manually.');
    req.mocEntries.push(entry);
    closeMoCManager();
    openMoCManager(scope, internalId);   // reopen with the new entry visible
    if (typeof renderMoCMatrix === 'function') renderMoCMatrix();
};

window.removeMoCEntry = function(scope, internalId, idx) {
    const store = scope === 'ac' ? acReqData : ((systemsData.find(s => 'sys-' + s.id === scope) || {}).req || []);
    const req = store.find(r => String(r.internalId) === String(internalId));
    if (!req || !Array.isArray(req.mocEntries)) return;
    req.mocEntries.splice(idx, 1);
    closeMoCManager();
    openMoCManager(scope, internalId);
    if (typeof renderMoCMatrix === 'function') renderMoCMatrix();
};

let projectBaselines = [];   // populated from projectConfig on load + autosaved

window.SafetyLabAssumptionsGate = function (actionLabel) {
    return new Promise(function (resolve) {
        try {
            const open = (window.SafetyLabAiAssumptions && typeof window.SafetyLabAiAssumptions.list === 'function')
                ? window.SafetyLabAiAssumptions.list().filter(function (a) { return a && a.status === 'Open'; })
                : [];
            if (!open.length) { resolve(true); return; }
            const ov = document.createElement('div');
            ov.style.cssText = 'position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;background:rgba(8,12,20,.55);backdrop-filter:blur(2px);';
            const card = document.createElement('div');
            card.style.cssText = "background:#fff;color:#1b1f27;width:min(540px,92vw);border-radius:14px;box-shadow:0 24px 64px rgba(0,0,0,.4);padding:22px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;";
            const sample = open.slice(0, 6).map(function (a) { return '<li style="margin:3px 0;"><strong>' + _gateEsc(a.analysisLabel || a.analysis || 'AI') + ':</strong> ' + _gateEsc(String(a.text || '').slice(0, 140)) + '</li>'; }).join('');
            card.innerHTML =
                '<div style="font-size:15px;font-weight:800;color:#7f1d1d;margin:0 0 8px;">⚠ ' + open.length + ' open AI assumption' + (open.length === 1 ? '' : 's') + '</div>' +
                '<div style="font-size:13px;color:#374151;line-height:1.5;margin:0 0 12px;">' + open.length + ' AI-declared assumption' + (open.length === 1 ? ' is' : 's are') + ' still <strong>Open</strong> (not Confirmed or Rejected). For a certification artifact, every load-bearing assumption should be dispositioned by a human before you ' + _gateEsc(actionLabel || 'finalize') + '.</div>' +
                '<ul style="font-size:12px;color:#4b5563;margin:0 0 16px;padding-left:18px;max-height:160px;overflow:auto;">' + sample + (open.length > 6 ? '<li style="opacity:.7;">…and ' + (open.length - 6) + ' more</li>' : '') + '</ul>' +
                '<div class="slag-btns" style="display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;"></div>';
            const btns = card.querySelector('.slag-btns');
            const review = document.createElement('button');
            review.type = 'button'; review.textContent = 'Review assumptions';
            review.style.cssText = 'font:inherit;font-size:13px;font-weight:700;border:1px solid #d4d8e3;background:#fff;color:#0a1f44;border-radius:9px;padding:8px 16px;cursor:pointer;';
            const cancel = document.createElement('button');
            cancel.type = 'button'; cancel.textContent = 'Cancel';
            cancel.style.cssText = 'font:inherit;font-size:13px;font-weight:600;border:1px solid #d4d8e3;background:#fff;color:#555b6b;border-radius:9px;padding:8px 16px;cursor:pointer;';
            const proceed = document.createElement('button');
            proceed.type = 'button'; proceed.textContent = 'Proceed anyway';
            proceed.style.cssText = 'font:inherit;font-size:13px;font-weight:700;border:none;background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff;border-radius:9px;padding:8px 18px;cursor:pointer;';
            function done(v) { try { document.removeEventListener('keydown', onKey, true); } catch (_) {} if (ov.parentNode) ov.parentNode.removeChild(ov); resolve(v); }
            function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); done(false); } }
            review.onclick = function () { done(false); try { if (typeof switchTab === 'function') switchTab('assumptions'); } catch (_) {} };
            cancel.onclick = function () { done(false); };
            proceed.onclick = function () {
                try {
                    const who = (typeof getSignupEmail === 'function' && getSignupEmail()) || 'user';
                    if (typeof window.slWorkspaceLog === 'function') window.slWorkspaceLog('assumptions-override', (actionLabel || 'finalize') + ' with ' + open.length + ' open AI assumption(s)', who);
                    else console.warn('[assumptions-gate] proceeded over ' + open.length + ' open AI assumption(s) for: ' + (actionLabel || 'finalize') + ' by ' + who);
                } catch (_) {}
                done(true);
            };
            btns.appendChild(review); btns.appendChild(cancel); btns.appendChild(proceed);
            ov.appendChild(card);
            ov.addEventListener('mousedown', function (e) { if (e.target === ov) done(false); });
            document.body.appendChild(ov);
            document.addEventListener('keydown', onKey, true);
        } catch (e) { resolve(true); }   // fail OPEN — never block the user on a gate bug
    });
};

window.captureBaseline = async function() {
    if (!(await window.SafetyLabAssumptionsGate('capture this baseline'))) return;   // #260
    const milestoneOpts = ['PSSA (PDR)', 'SSA (CDR)', 'FAA Submission', 'EASA Submission', 'TIA Review', 'Custom'];
    const milestone = await slPrompt(
        'Baseline milestone (one of: ' + milestoneOpts.join(', ') + '):\n\nFor "Custom", type your own label.',
        'PSSA (PDR)'
    );
    if (!milestone) return;
    const name = (await slPrompt('Baseline name (e.g., "PSSA v1.0", "SSA submission to FAA 2026-Q2"):', milestone)) || milestone;
    const signedBy = (await slPrompt('Signed by (engineer name / role; leave blank for unsigned draft):', '')) || '';
    const notes = (await slPrompt('Notes / change rationale (optional):', '')) || '';
    // Snapshot is the same structure as the JSON save file.
    const snapshot = {
        acFunctionsData, acFcimData, acFhaData, acReqData, acAssumptionsData,
        systemsData, praData, zsaData, cmaData, fmeaData,
        ftaPages, ftaConfig, projectConfig, flightPhasesData
    };
    const snapStr = JSON.stringify(snapshot);
    const hash = await _sha256Hex(snapStr);
    const baseline = {
        id: 'bl-' + Date.now(),
        name, milestone, signedBy, notes,
        timestamp: new Date().toISOString(),
        hash,
        sizeBytes: snapStr.length,
        snapshot   // full data kept inline for self-contained projects
    };
    projectBaselines.push(baseline);
    if (typeof showToast === 'function') showToast('Baseline "' + name + '" captured (SHA-256: ' + hash.slice(0, 12) + '…).', 'success', 3500);
    renderBaselines();
};

window.downloadBaseline = function(id) {
    const b = projectBaselines.find(x => x.id === id);
    if (!b) return;
    const blob = new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'safety_lab_baseline_' + b.name.replace(/[^A-Za-z0-9]+/g, '_') + '.json';
    a.click();
    URL.revokeObjectURL(url);
};

window.verifyBaseline = async function(id) {
    const b = projectBaselines.find(x => x.id === id);
    if (!b) return;
    const recomputed = await _sha256Hex(JSON.stringify(b.snapshot));
    if (recomputed === b.hash) {
        if (typeof showToast === 'function') showToast('Baseline "' + b.name + '" integrity verified — SHA-256 matches.', 'success', 3500);
    } else {
        alert('INTEGRITY CHECK FAILED for "' + b.name + '"\n\nStored hash:      ' + b.hash + '\nRecomputed hash:  ' + recomputed + '\n\nThe baseline data has been altered since capture.');
    }
};

const _DIFF_LABELS = { acFunctionsData: 'AC functions', acFhaData: 'AC FHA', acReqData: 'AC requirements', acAssumptionsData: 'AC assumptions', systemsData: 'Systems', praData: 'PRA', zsaData: 'ZSA', cmaData: 'CMA', fmeaData: 'FMEA', ftaPages: 'FTA pages' };

window.diffBaselineToCurrent = async function(id) {
    const b = projectBaselines.find(x => x.id === id);
    if (!b) return;
    const current = { acFunctionsData, acFcimData, acFhaData, acReqData, acAssumptionsData, systemsData, praData, zsaData, cmaData, fmeaData, ftaPages, ftaConfig, projectConfig, flightPhasesData };
    const curHash = await _sha256Hex(JSON.stringify(current));
    if (curHash === b.hash) { alert('No changes since "' + b.name + '" was captured.\nHash: ' + curHash); return; }
    _renderBaselineDiff(b, _baselineFieldDiff(b.snapshot, current), curHash);
};

window.deleteBaseline = function(id) {
    const b = projectBaselines.find(x => x.id === id);
    if (!b) return;
    if (!confirm('Delete baseline "' + b.name + '"? This cannot be undone.')) return;
    projectBaselines = projectBaselines.filter(x => x.id !== id);
    renderBaselines();
};

window.openPRCatalogueBrowser = function() {
    const byCat = {};
    PARTICULAR_RISK_CATALOGUE.forEach(e => {
        if (!byCat[e.category]) byCat[e.category] = [];
        byCat[e.category].push(e);
    });
    const groups = PR_CATEGORIES.map(cat => {
        const items = byCat[cat] || [];
        if (!items.length) return '';
        const rows = items.map(e =>
            '<tr style="cursor: pointer;" onclick="selectPRCatalogueEntry(\'' + esc(e.id) + '\')">' +
                '<td><strong>' + esc(e.name) + '</strong></td>' +
                '<td><span style="font-family: var(--font-mono); font-size: 10px; color: var(--color-text-tertiary);">' + e.regulations.slice(0, 2).map(esc).join(', ') + (e.regulations.length > 2 ? ' +' + (e.regulations.length - 2) : '') + '</span></td>' +
                '<td class="u-text-xs">' + esc(e.defaultDesc.slice(0, 110)) + (e.defaultDesc.length > 110 ? '…' : '') + '</td>' +
            '</tr>'
        ).join('');
        return '<div style="margin-bottom: 14px;"><div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-tertiary); font-weight: 600; margin-bottom: 4px;">' + esc(cat) + '</div><table class="reference-table" class="u-text-sm"><thead><tr><th style="width: 28%;">Risk</th><th style="width: 22%;">Regulations</th><th>Description (preview)</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }).join('');
    const html =
        '<div style="background: rgba(0,0,0,0.4); position: fixed; inset: 0; z-index: 2100; display: flex; align-items: center; justify-content: center;" id="_prCatOverlay" onclick="if(event.target===this)closePRCatalogueBrowser()">' +
        '<div style="background: var(--color-surface-1); padding: 24px; border-radius: var(--r-lg); width: 880px; max-width: 92vw; max-height: 86vh; overflow-y: auto; box-shadow: var(--shadow-xl);">' +
            '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;"><div><h3 class="u-m0">Particular Risk Catalog</h3><div style="font-size: 11px; color: var(--color-text-tertiary); margin-top: 2px;">ARP4761A App L · AC 25.1309-1B §12 · AMC 25.1309 §8.2</div></div><button class="btn-red" onclick="closePRCatalogueBrowser()" class="u-m0">Close</button></div>' +
            '<p style="font-size: 12px; color: var(--color-text-secondary); margin: 0 0 14px 0;">Click any row to pre-fill the PRA form with that risk\'s typical threat description, regulatory anchors, and baseline mitigation strategy. The analyst then refines all fields and ticks Affected Zones to match the specific aircraft configuration.</p>' +
            groups +
        '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
};

window.closePRCatalogueBrowser = function() {
    const ov = document.getElementById('_prCatOverlay');
    if (ov) ov.remove();
};

window.selectPRCatalogueEntry = function(id) {
    const entry = PARTICULAR_RISK_CATALOGUE.find(e => e.id === id);
    if (!entry) return closePRCatalogueBrowser();
    // Make sure the PRA threat dropdown includes this catalog name; the HTML only carries a
    // small static seed list, so we inject the catalog name as a one-off option if missing.
    const threatSel = document.getElementById('pra-threat');
    if (threatSel) {
        const exists = Array.from(threatSel.options).some(o => o.value === entry.name);
        if (!exists) {
            const opt = document.createElement('option');
            opt.value = entry.name; opt.textContent = entry.name;
            threatSel.appendChild(opt);
        }
        threatSel.value = entry.name;
    }
    const setIfBlank = (id, val) => { const el = document.getElementById(id); if (el && !el.value) el.value = val; };
    setIfBlank('pra-desc',       entry.defaultDesc);
    setIfBlank('pra-mitigation', entry.defaultMitigation);
    // Stash the catalog ref so the next submit captures it on the new PRA row.
    window._pendingPrCatalogueRef = { id: entry.id, name: entry.name, capturedAt: Date.now() };
    // Phase 53.67 — auto-select the appropriate analysis model for this PR type so the
    // user sees the relevant parameter form immediately.
    const modelType = (typeof PR_TO_MODEL_TYPE !== 'undefined') ? PR_TO_MODEL_TYPE[entry.id] : null;
    if (modelType) {
        const modelSel = document.getElementById('pra-model-type');
        if (modelSel) modelSel.value = modelType;
        if (typeof _renderPraModelForm === 'function') _renderPraModelForm(modelType, {});
    }
    if (typeof showToast === 'function') showToast('PRA form pre-filled from catalog: ' + entry.name + '. Refine fields and pick Affected Zones.', 'info', 4500);
    closePRCatalogueBrowser();
};

let nodeClipboard = null; // { sourceTreeId, subtree: deep clone of selected node }

const REPEATED_EVENT_SYNCED_FIELDS = [
    'name', 'displayId', 'type', 'gateType',
    'lambda', 'probability',
    'inputMode', 'inputValue', 'libraryKey',
    'ccfGroup', 'beta', 'votingK',
    // DFT-WARM — one physical spare arrangement means one dormancy factor and one
    // switch reliability everywhere the same logical gate appears.
    'spareWarmK', 'spareSwitchP',
    // Phase 56.48b — DAL synced across shared instances. One physical component,
    // one DAL — same logical event must have the same allocated DAL everywhere.
    'allocatedDAL', 'dalKindOverride'
];

let acChartInstance = null; let sysChartInstance = null;

let asmStateChartInstance = null; let reqLevelChartInstance = null;

const getAllSysFha = () => systemsData.flatMap(s => s.fha);

const getAllSysReq = () => systemsData.flatMap(s => s.req);

const _DERIV_PALETTE = {
    'top-level': { bg: 'rgba(0, 122, 255, 0.14)',  fg: 'var(--color-accent, #4E63D8)' },
    'allocated': { bg: 'rgba(52, 199, 89, 0.14)',  fg: 'var(--sev-min-fg, #2db150)' },
    'derived':   { bg: 'rgba(94, 92, 230, 0.14)',  fg: '#5e5ce6' },
    'refined':   { bg: 'rgba(255, 149, 0, 0.14)',  fg: 'var(--sev-haz-fg, #c47100)' }
};

const APPROVABLE_KINDS = new Set([
    'acFha', 'sysFha',           // FHA line items (drive AFHA, SFHA, PASA, PSSA phases)
    'pra', 'zsa', 'cma',         // CCA documents
    'acReq', 'sysReq',           // safety requirements
    'fmea',                      // FMEA rows
    // HF lanes — 2 Sep 2026, Waqas: "there is a comment approve and sign action in the
    // AFHA we need those for the HFAs too". The HF Review cell was rendering the comment
    // trigger alone, because _approvalControlHtml gates on THIS set and no hf* kind was in
    // it — so ✓ approve and 🖊 sign-off never drew. Nothing else needed changing: the
    // approval record, the tamper-evident sign-off chain and the void-on-open-comment rule
    // are all keyed on {kind, id, systemId} and were already generic.
    'hfAlloc', 'hfTid', 'hfTask', 'hfHea', 'hfAlerts', 'hfErgo', 'hfCd', 'hfSa', 'hfMfc'
    // Assumptions intentionally excluded — they have their own lifecycle state field.
]);

const _CRUD_KEY_TO_KIND = {
    'acFunc': 'acFunc', 'acFcim': 'acFcim', 'acReq': 'acReq',
    'sysFunc': 'sysFunc', 'sysFcim': 'sysFcim', 'sysReq': 'sysReq',
    'pra': 'pra', 'zsa': 'zsa', 'cma': 'cma'
};

window.openSignoffPanel = async function (kind, id, systemId) {
    systemId = systemId || null;
    const old = document.getElementById('signoff-panel'); if (old) old.remove();
    const chain = signoffChain(kind, id, systemId);
    let ok = true; try { ok = await verifySignoffChain(kind, id, systemId); } catch (_) { ok = false; }
    const nextStage = _SIGNOFF_STAGES[Math.min(chain.length, _SIGNOFF_STAGES.length - 1)];
    const allDone = chain.length >= _SIGNOFF_STAGES.length;
    const rel = function (t) { try { return new Date(t).toLocaleString(); } catch (_) { return ''; } };
    const ov = document.createElement('div'); ov.id = 'signoff-panel';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:20px;font:14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;';
    const rows = chain.length ? chain.map(function (s) {
        return '<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid #e4e8f1;font-size:13px;"><div><b>' + esc(s.stage) + '</b> — ' + esc(s.signer) + '</div><div style="color:#5b6675;font-size:12px;">' + esc(rel(s.at)) + '</div></div>';
    }).join('') : '<div style="color:#5b6675;font-size:13px;padding:6px 0;">No sign-offs yet.</div>';
    const verifyBadge = chain.length ? ('<div style="margin-top:8px;font-size:12px;font-weight:600;color:' + (ok ? '#0a7f4f' : '#b91c1c') + ';">' + (ok ? '✓ Chain intact — tamper-evident hashes verified' : '⚠ Chain BROKEN — a sign-off was altered') + '</div>') : '';
    const _stale = chain.length ? isStaleSinceSignoff(kind, id, systemId) : false;
    const staleBadge = _stale ? ('<div style="margin-top:8px;font-size:12px;font-weight:700;color:#b45309;background:#fdf4e7;border:1px solid #f0d9b5;border-radius:8px;padding:8px 10px;">⚠ This artifact has been EDITED since the last sign-off (' + esc(chain[chain.length - 1].stage) + ' by ' + esc(chain[chain.length - 1].signer) + '). The sign-off no longer reflects the current content — re-sign to re-attest.</div>') : '';
    const signArea = allDone
        ? '<div style="font-size:13px;color:#0a7f4f;font-weight:600;">All stages signed.</div>'
        : '<label style="font-size:12px;color:#5b6675;">Sign as <b>' + esc(nextStage) + '</b> — your name:</label><div style="display:flex;gap:8px;margin-top:5px;"><input id="signoff-name" type="text" value="' + esc(_signoffReviewerName()) + '" style="flex:1;border:1px solid #d8dee8;border-radius:8px;padding:8px 10px;font:inherit;font-size:13px;"><button id="signoff-go" style="border:none;border-radius:8px;background:#4E63D8;color:#fff;font:inherit;font-weight:600;padding:8px 14px;cursor:pointer;">Sign</button></div><div style="font-size:11px;color:#5b6675;margin-top:6px;">Signing attests this artifact at the "' + esc(nextStage) + '" stage — recorded with a tamper-evident timestamp + hash.</div>';
    ov.innerHTML = '<div style="background:#fff;color:#1a2230;border-radius:14px;width:min(520px,96vw);max-height:90vh;overflow:auto;box-shadow:0 24px 64px rgba(0,0,0,.3);padding:20px 22px;">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;"><div style="font-size:16px;font-weight:700;color:#0a1f44;">Sign-off chain</div><button id="signoff-x" style="border:none;background:transparent;font-size:22px;cursor:pointer;color:#5b6675;">×</button></div>'
        + '<div style="font-size:12px;color:#5b6675;margin:2px 0 12px;">' + esc(String(kind)) + ' · ' + esc(String(id)) + (systemId ? (' · ' + esc(String(systemId))) : '') + '</div>'
        + rows + verifyBadge + staleBadge + '<div style="margin-top:14px;">' + signArea + '</div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) ov.remove(); });
    const xb = document.getElementById('signoff-x'); if (xb) xb.onclick = function () { ov.remove(); };
    const go = document.getElementById('signoff-go');
    if (go) go.onclick = async function () {
        const nm = ((document.getElementById('signoff-name') || {}).value || '').trim();
        if (!nm) { if (typeof showToast === 'function') showToast('Enter your name to sign.', 'warning'); return; }
        go.disabled = true;
        try { await recordSignoff(kind, id, systemId, nextStage, nm); } catch (e) { if (typeof showToast === 'function') showToast('Sign failed: ' + ((e && e.message) || e), 'warning'); go.disabled = false; return; }
        if (typeof showToast === 'function') showToast('Signed: ' + nextStage + ' — ' + nm, 'success');
        ov.remove(); window.openSignoffPanel(kind, id, systemId);
    };
};

window.toggleApproval = function(kind, id, systemId) {
    if (typeof Review === 'undefined') return;
    const target = { kind, id, systemId: systemId || null };
    const rec = Review.getApproval(target);
    if (rec) {
        Review.unapprove(target);
        if (typeof showToast === 'function') showToast('Approval revoked.', 'info', 2400);
    } else {
        Review.approve(target);
        if (typeof showToast === 'function') showToast('Approved by ' + (Review.getReviewerName() || 'reviewer') + '.', 'success', 2400);
    }
    // Re-render the table that owns this row + the dashboard (process strip).
    try {
        const RENDER_BY_KIND = {
            'acFha': () => typeof renderACFHA === 'function' && renderACFHA(),
            'sysFha': () => typeof renderSysFHA === 'function' && renderSysFHA(),
            'acReq': () => typeof renderACReq === 'function' && renderACReq(),
            'sysReq': () => typeof renderSysReq === 'function' && renderSysReq(),
            'acAsm': () => typeof renderACAssumptions === 'function' && renderACAssumptions(),
            'sysAsm': () => typeof renderSysAssumptions === 'function' && renderSysAssumptions(),
            'pra': () => typeof renderPRA === 'function' && renderPRA(),
            'zsa': () => typeof renderZSA === 'function' && renderZSA(),
            'cma': () => typeof renderCMA === 'function' && renderCMA(),
            'fmea': () => typeof renderFMEA === 'function' && renderFMEA(),
        };
        // HF lanes — 2 Sep 2026. They became approvable with the rest, and without a
        // re-render here the click wrote the approval and left the checkbox showing ☐:
        // the data was right and the screen said nothing had happened, which reads as a
        // broken button. One entry per lane rather than a wildcard, so an unmapped kind
        // still fails loudly in review instead of silently no-op'ing.
        const HF_RENDER = { hfAlloc: 'renderAlloc', hfTid: 'renderTid', hfTask: 'renderTasks',
                            hfHea: 'renderHea', hfAlerts: 'renderAlerts', hfErgo: 'renderErgo',
                            hfCd: 'renderCd', hfSa: 'renderSa', hfMfc: 'renderMfc' };
        if (HF_RENDER[kind]) {
            const HX = (typeof window !== 'undefined') ? window.HF_ANALYSES : null;
            if (HX && typeof HX[HF_RENDER[kind]] === 'function') HX[HF_RENDER[kind]]();
        }
        if (RENDER_BY_KIND[kind]) RENDER_BY_KIND[kind]();
        if (typeof renderProcessStrip === 'function') renderProcessStrip();
    } catch(_) {}
};

const TEMPLATE_COLUMN_TYPES = ['text', 'longtext', 'number', 'enum', 'multiselect', 'date', 'boolean', 'reference'];

const ORG_TEMPLATES_LSKEY = 'safetyLab.orgTemplates';

const _CUSTOM_COL_THEAD_IDS = {
    acFha:  'ac-fha-thead',
    sysFha: null,    // SFHA uses dynamic per-system theads; handled in renderer
    acReq:  'ac-req-thead',
    sysReq: null,
    pra:    'pra-thead',
    zsa:    'zsa-thead',
    cma:    'cma-thead',
    fmea:   'fmea-thead',
    acFunc: 'ac-functions-thead',
    sysFunc: null,
    acFcim: 'ac-fcim-thead',
    sysFcim: null,
    acAsm:  'ac-asm-thead',
    sysAsm: null
};

let _activeTemplateKind = 'acFha';

let _activeTemplateScope = 'project';   // 'org' or 'project'

const _REVIEW_COL_TBODY_IDS = [
    'ac-func-body', 'sys-func-body',   // Functions tables also render the review cell.
    'ac-fcim-body', 'sys-fcim-body',   // FCIM tables too.
    'ac-fha-body', 'sys-fha-body',
    'ac-req-body', 'sys-req-body',
    'pra-body', 'zsa-body', 'cma-body',
    'fmea-body'
];

window.promptRenameProject = async function() {
    const next = ((await slPrompt('Project name:', projectName || 'Untitled Project')) || '').trim();
    if (!next) return;
    projectName = next;
    _refreshProjectNameUI();
    showToast('Renamed to "' + next + '".', 'success', 2200);
    try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch(_) {}
};

const _NPW_BASES = [
    { v: 'Part 25', label: '14 CFR Part 25 — Transport category', sub: 'AC 25.1309-1B targets · Catastrophic 1e-9/FH, DAL A' },
    { v: 'Part 23', label: '14 CFR Part 23 — Normal / Commuter', sub: 'AC 23.1309-1E, class-dependent targets (pick class below)' },
    { v: 'Part 27', label: '14 CFR Part 27 — Normal rotorcraft', sub: 'AC 27-1B · PS-ASW-27-15 Class I–IV (pick below)' },
    { v: 'Part 29', label: '14 CFR Part 29 — Transport rotorcraft', sub: 'AC 29-2C Fig. 29.1309-2 · Catastrophic 1e-9/FH, DAL A' },
    { v: 'sc-vtol', label: 'EASA SC-VTOL — eVTOL / AAM', sub: 'Category Basic 1/2/3 (by seats) or Enhanced (pick below)' },
    { v: 'Part 33', label: '14 CFR Part 33 — Engines', sub: '§33.75' },
    { v: 'Part 450', label: '14 CFR Part 450 — Commercial space', sub: 'mission-based methodology' },
    { v: 'Part 107', label: '14 CFR Part 107 + SORA — small UAS', sub: 'mission-based methodology' },
    { v: 'specific-sora', label: 'EU 2019/947 Specific category — SORA 2.5', sub: 'GRC · ARC · SAIL · OSOs — AMC to Article 11' }
];

const _UI_LAST_TAB_KEY = 'safetyLab.ui.lastTab.v1';

const _UI_FTA_MODE_KEY = 'safetyLab.ui.ftaMode.v1';

const _UI_FTA_APPORTION_KEY = 'safetyLab.ui.ftaApportion.v1';

const CKPT_STATUS_LABEL = { 'not-started': 'Not started', 'in-progress': 'In work', 'complete': 'Ready to baseline', 'handed-off': 'Baselined', 'reopened': 'Reopened' };

const _CKPT_SEV_RANK = { 'Catastrophic': 5, 'Hazardous': 4, 'Major': 3, 'Minor': 2, 'Negligible': 1, 'No Safety Effect': 1 };

const CKPT_CHECKLISTS = {
    AFHA: [
        { id: 'cls', kind: 'auto', ref: 'A.5',   label: 'Every failure condition classified', eval: c => { const n = c.acFhas.filter(f => !f.severity).length; return { pass: c.acFhas.length > 0 && n === 0, detail: n ? n + ' unclassified' : c.acFhas.length + ' FCs' }; } },
        { id: 'eff', kind: 'auto', ref: 'A.4',   label: 'Effects captured for every FC', eval: c => { const n = c.acFhas.filter(f => !(f.effAc || f.effCrew || f.effPax)).length; return { pass: c.acFhas.length > 0 && n === 0, detail: n ? n + ' without effects' : 'all captured' }; } },
        { id: 'phs', kind: 'auto', ref: 'A.4',   label: 'Flight phases assigned', eval: c => { const n = c.acFhas.filter(f => !f.phases).length; return { pass: c.acFhas.length > 0 && n === 0, detail: n ? n + ' without phases' : 'all assigned' }; } },
        { id: 'asm', kind: 'auto', ref: 'A.6',   label: 'Aircraft assumptions routed and dispositioned', eval: c => { const un = (acAssumptionsData || []).filter(a => !a.routeTo).length; return { pass: c.openAcAsm === 0 && un === 0, detail: (c.openAcAsm || un) ? (c.openAcAsm + ' open · ' + un + ' unrouted') : 'all routed and dispositioned' }; } },
        { id: 'apr', kind: 'auto', ref: 'Review', label: 'All line items reviewer-approved', eval: c => ({ pass: (c.phases.AFHA.ratio || 0) >= 1, detail: c.phases.AFHA.progress }) },
        { id: 'cmp', kind: 'attest', ref: 'A.9.1', label: 'Completeness review held (multi-disciplinary)' },
        { id: 'sub', kind: 'attest', ref: 'A.9.2', label: 'Effect substantiation recorded' },
        { id: 'ai', kind: 'auto', ref: 'E2', label: 'AI-drafted prose reviewed and accepted', eval: c => ((typeof window !== 'undefined' && window.AiFidelity) ? AiFidelity.gateEval('AFHA') : { pass: true, detail: 'fidelity layer off' }) }
    ],
    PASA: [
        { id: 'alloc', kind: 'auto', ref: 'B.5.b', label: 'Every cat/haz FC allocated (tree or SFHA)', eval: c => { const un = c.critLinked.filter(x => x.trees.length === 0 && !x.delegated); return { pass: c.crit.length > 0 && un.length === 0, detail: un.length ? un.length + ' unallocated' : c.crit.length + ' covered' }; } },
        { id: 'bfeas', kind: 'auto', ref: 'B.4.1', label: 'Budget feasibility \u2014 no over-committed allocation gates', eval: c => { try { const s = (typeof budgetLedgerStats === 'function') ? budgetLedgerStats() : null; if (!s || typeof s.overCommitted !== 'number') return { pass: true, detail: 'ledger off' }; return { pass: s.overCommitted === 0, detail: s.overCommitted ? s.overCommitted + ' over-committed \u2014 resolve or log in the Budget Ledger' : (s.underAllocated ? 'feasible \u00b7 ' + s.underAllocated + ' margin(s) held' : 'all gates feasible') }; } catch (e) { return { pass: true, detail: 'ledger off' }; } } },
        { id: 'fdal',  kind: 'auto', ref: 'B.4.2', label: 'FDALs assigned on allocation trees', eval: c => { const t = c.critLinked.flatMap(x => x.trees); const n = t.filter(x => !(x.root && x.root.allocatedDAL)).length; return { pass: t.length > 0 && n === 0, detail: t.length === 0 ? 'no trees yet' : (n ? n + ' trees without DAL run' : t.length + ' trees ✓') }; } },
        { id: 'reqs',  kind: 'auto', ref: 'B.4.4', label: 'AC-level safety requirements generated', eval: c => ({ pass: (acReqData || []).length > 0, detail: (acReqData || []).length + ' requirements' }) },
        { id: 'recon', kind: 'auto', ref: 'B.5.i', label: 'SFHA severity consistency', eval: c => ({ pass: c.reconViolations.length === 0, detail: c.reconViolations.length ? c.reconViolations.slice(0, 2).join('; ') : 'consistent' }) },
        { id: 'apr',   kind: 'auto', ref: 'Review', label: 'All line items reviewer-approved', eval: c => ({ pass: (c.phases.PASA.ratio || 0) >= 1, detail: c.phases.PASA.progress }) },
        { id: 'cerr',  kind: 'attest', ref: 'B.5.h', label: 'Common-error potential assessed' },
        { id: 'crew',  kind: 'attest', ref: 'B.4.4.2', label: 'Crew-action assumptions compiled and shared' },
        { id: 'intd',  kind: 'auto', ref: 'B.3', label: 'Interdependence coverage — every FC × system cell reviewed', eval: c => { const s = idpStats(); return { pass: s.cells > 0 && s.unreviewed === 0, detail: s.cells ? (s.unreviewed ? s.unreviewed + ' of ' + s.cells + ' unreviewed' : s.cells + ' cells reviewed · ' + s.multi + ' multi-system FCs') : 'no FCs/systems yet' }; } },
        { id: 'ai', kind: 'auto', ref: 'E2', label: 'AI-drafted prose reviewed and accepted', eval: c => ((typeof window !== 'undefined' && window.AiFidelity) ? AiFidelity.gateEval('PASA') : { pass: true, detail: 'fidelity layer off' }) }
    ],
    SFHA: [
        { id: 'cls', kind: 'auto', ref: 'C.5', label: 'Every system FC classified', eval: c => { const n = c.allSysFha.filter(f => !f.severity).length; return { pass: c.allSysFha.length > 0 && n === 0, detail: n ? n + ' unclassified' : c.allSysFha.length + ' FCs' }; } },
        { id: 'eff', kind: 'auto', ref: 'C.4', label: 'Effects captured for every FC', eval: c => { const n = c.allSysFha.filter(f => !(f.effAc || f.effCrew || f.effPax)).length; return { pass: c.allSysFha.length > 0 && n === 0, detail: n ? n + ' without effects' : 'all captured' }; } },
        { id: 'recon', kind: 'auto', ref: 'C.5', label: 'AFHA reconciliation (traced severities consistent)', eval: c => ({ pass: c.reconViolations.length === 0, detail: c.reconViolations.length ? c.reconViolations.slice(0, 2).join('; ') : 'consistent' }) },
        { id: 'apr', kind: 'auto', ref: 'Review', label: 'All line items reviewer-approved', eval: c => ({ pass: (c.phases.SFHA.ratio || 0) >= 1, detail: c.phases.SFHA.progress }) },
        { id: 'cmp', kind: 'attest', ref: 'C.9', label: 'Completeness review held per system' },
        { id: 'ai', kind: 'auto', ref: 'E2', label: 'AI-drafted prose reviewed and accepted', eval: c => ((typeof window !== 'undefined' && window.AiFidelity) ? AiFidelity.gateEval('SFHA') : { pass: true, detail: 'fidelity layer off' }) }
    ],
    PSSA: [
        { id: 'trees', kind: 'auto', ref: 'D.4.2', label: 'Every system carries allocation tree(s)', eval: c => { const n = c.nSys - c.sysWithTrees.length; return { pass: c.nSys > 0 && n === 0, detail: n ? n + ' systems without trees' : c.sysWithTrees.length + ' systems ✓' }; } },
        { id: 'fdal', kind: 'auto', ref: 'D.4.1', label: 'DAL allocation run on system trees', eval: c => { const n = c.sysTopDown.filter(t => !(t.root && t.root.allocatedDAL)).length; return { pass: c.sysTopDown.length > 0 && n === 0, detail: c.sysTopDown.length === 0 ? 'no trees yet' : (n ? n + ' without DAL run' : 'all run') }; } },
        { id: 'reqs', kind: 'auto', ref: 'D.4.3.1', label: 'Requirements generated per system', eval: c => { const n = c.sysWithTrees.filter(s => !(s.req && s.req.length)).length; return { pass: c.sysWithTrees.length > 0 && n === 0, detail: n ? n + ' systems without reqs' : 'all systems ✓' }; } },
        { id: 'apr', kind: 'auto', ref: 'Review', label: 'All line items reviewer-approved', eval: c => ({ pass: (c.phases.PSSA.ratio || 0) >= 1, detail: c.phases.PSSA.progress }) },
        { id: 'lat', kind: 'auto', ref: 'D.4.2.1.1', label: 'Latent intervals within not-to-exceed', eval: c => { const rows = ccmrLatentSweep().filter(r => r.system !== 'Aircraft'); const ex = rows.filter(r => r.exceeds).length; return { pass: ex === 0, detail: rows.length ? (rows.length + ' latents · ' + ex + ' exceed') : 'none identified' }; } },
        { id: 'acc', kind: 'attest', ref: 'D.5.d', label: 'Requirements accepted by development' },
        { id: 'rte', kind: 'auto', ref: 'D.6.3', label: 'System assumptions routed', eval: c => { const all = (systemsData || []).flatMap(s => s.asm || []); const un = all.filter(a => !a.routeTo).length; return { pass: all.length === 0 || un === 0, detail: all.length ? (un ? un + ' of ' + all.length + ' unrouted' : all.length + ' routed') : 'none recorded' }; } },
        { id: 'ai', kind: 'auto', ref: 'E2', label: 'AI-drafted prose reviewed and accepted', eval: c => ((typeof window !== 'undefined' && window.AiFidelity) ? AiFidelity.gateEval('PSSA') : { pass: true, detail: 'fidelity layer off' }) }
    ],
    SSA: [
        { id: 'mir', kind: 'auto', ref: 'E.3', label: 'Every allocation tree has a populated mirror', eval: c => { const t = c.sysTopDown; const n = t.filter(x => !c.mirrorPopulated(x)).length; return { pass: t.length > 0 && n === 0, detail: t.length === 0 ? 'no trees yet' : (n ? n + ' unmirrored/unpopulated' : t.length + ' verified') }; } },
        { id: 'apr', kind: 'auto', ref: 'Review', label: 'Mirror line items approved', eval: c => ({ pass: (c.phases.SSA.ratio || 0) >= 1, detail: c.phases.SSA.progress }) },
        { id: 'lat', kind: 'auto', ref: 'E.3.2.4', label: 'Significant latents bounded (CCMR sweep)', eval: c => { const rows = ccmrLatentSweep().filter(r => r.verification); const ex = rows.filter(r => r.exceeds).length; const nod = rows.filter(r => !(r.lambda > 0)).length; return { pass: ex === 0 && nod === 0, detail: rows.length ? (rows.length + ' latents · ' + ex + ' exceed · ' + nod + ' without λ') : 'none identified' }; } },
        { id: 'prs', kind: 'planned', ref: 'E.4.d', label: 'Problem reports addressed', tag: 'parked' },
        { id: 'ind', kind: 'auto', ref: 'E.3.1.1', label: 'Independence principles evaluated, none compromised', eval: c => { const L = ipLedger(); const comp = L.filter(p => p.state === 'compromised').length; const unev = L.filter(p => p.state === 'identified').length; return { pass: L.length === 0 || (comp === 0 && unev === 0), detail: L.length ? (L.length + ' principles · ' + comp + ' compromised · ' + unev + ' unevaluated') : 'none identified' }; } },
        { id: 'ai', kind: 'auto', ref: 'E2', label: 'AI-drafted prose reviewed and accepted', eval: c => ((typeof window !== 'undefined' && window.AiFidelity) ? AiFidelity.gateEval('SSA') : { pass: true, detail: 'fidelity layer off' }) }
    ],
    ASA: [
        { id: 'mir', kind: 'auto', ref: 'F.3.7', label: 'Every cat/haz FC has a populated mirror', eval: c => { const un = c.critLinked.filter(x => x.trees.length === 0 || x.trees.some(t => !c.mirrorPopulated(t))); return { pass: c.crit.length > 0 && un.length === 0, detail: un.length ? un.length + ' open' : 'all verified' }; } },
        { id: 'cca', kind: 'auto', ref: 'F.3.9', label: 'CCA analyses complete', eval: c => { const ok = ['PRA', 'ZSA', 'CMA'].every(k => (c.phases[k].ratio || 0) >= 1); return { pass: ok, detail: ['PRA', 'ZSA', 'CMA'].map(k => k + ' ' + Math.round((c.phases[k].ratio || 0) * 100) + '%').join(' · ') }; } },
        { id: 'apr', kind: 'auto', ref: 'Review', label: 'All line items reviewer-approved', eval: c => ({ pass: (c.phases.ASA.ratio || 0) >= 1, detail: c.phases.ASA.progress }) },
        { id: 'crew', kind: 'attest', ref: 'F.4.h', label: 'Crew-action assumptions accepted by stakeholders' },
        { id: 'dal', kind: 'attest', ref: 'F.3.8', label: 'Final FDAL/IDAL confirmed against classifications' },
        { id: 'ai', kind: 'auto', ref: 'E2', label: 'AI-drafted prose reviewed and accepted', eval: c => ((typeof window !== 'undefined' && window.AiFidelity) ? AiFidelity.gateEval('ASA') : { pass: true, detail: 'fidelity layer off' }) }
    ],
    PRA: [
        { id: 'apr', kind: 'auto', ref: 'Review', label: 'All risk items approved', eval: c => ({ pass: (c.phases.PRA.ratio || 0) >= 1, detail: c.phases.PRA.progress }) },
        { id: 'thr', kind: 'attest', ref: 'L.3', label: 'Threat models documented per risk' },
        { id: 'ai', kind: 'auto', ref: 'E2', label: 'AI-drafted prose reviewed and accepted', eval: c => ((typeof window !== 'undefined' && window.AiFidelity) ? AiFidelity.gateEval('PRA') : { pass: true, detail: 'fidelity layer off' }) }
    ],
    ZSA: [
        { id: 'apr', kind: 'auto', ref: 'Review', label: 'All zones approved', eval: c => ({ pass: (c.phases.ZSA.ratio || 0) >= 1, detail: c.phases.ZSA.progress }) },
        { id: 'ins', kind: 'attest', ref: 'K.4', label: 'Zonal inspection performed (mockup or aircraft)' },
        { id: 'ai', kind: 'auto', ref: 'E2', label: 'AI-drafted prose reviewed and accepted', eval: c => ((typeof window !== 'undefined' && window.AiFidelity) ? AiFidelity.gateEval('ZSA') : { pass: true, detail: 'fidelity layer off' }) }
    ],
    CMA: [
        { id: 'dis', kind: 'auto', ref: 'M.3', label: 'All claims dispositioned', eval: c => { const n = (cmaData || []).filter(x => !(x.status === 'Closed — Accepted' || x.status === 'Mitigated')).length; return { pass: (cmaData || []).length > 0 && n === 0, detail: n ? n + ' open' : 'all dispositioned' }; } },
        { id: 'apr', kind: 'auto', ref: 'Review', label: 'All line items approved', eval: c => ({ pass: (c.phases.CMA.ratio || 0) >= 1, detail: c.phases.CMA.progress }) },
        { id: 'tlr', kind: 'attest', ref: 'M.3.2', label: 'Questionnaire tailored to project' },
        { id: 'ai', kind: 'auto', ref: 'E2', label: 'AI-drafted prose reviewed and accepted', eval: c => ((typeof window !== 'undefined' && window.AiFidelity) ? AiFidelity.gateEval('CMA') : { pass: true, detail: 'fidelity layer off' }) }
    ]
};

let _ccmrCache = { at: 0, rows: null };

let _ipCache = { at: 0, list: null };

const _IP_STATE_META = {
    identified:  { label: 'Identified',  color: 'var(--color-text-tertiary)' },
    evaluated:   { label: 'Evaluated',   color: 'var(--color-info)' },
    requirement: { label: 'Requirement', color: 'var(--color-accent)' },
    verified:    { label: 'Verified',    color: 'var(--color-success)' },
    compromised: { label: 'COMPROMISED', color: 'var(--color-danger)' }
};

const _CRA_MODES = ['Total loss', 'Partial loss', 'Degraded'];

let _idpSelectedFc = null;

let _macDraft = null;   // { subId, phase, clauses: [{min, of:[]}] }

const _COFFE_STATES = ['total loss', 'malfunction'];

// STPA lane store — persisted with the project payload; authored ONLY through
// stpa_panel's author adapter. Seeds/scenarios are computed by the engine —
// this holds the control structure, the dispositions, and the FHA scope refs.
// ML/AI constituent store (SC-ML lane). Declared here with the other project
// stores so initNewProjectState() has something to reset rather than creating an
// implicit global on first write.
let mlData = { constituents: [], odd: [], datasets: [], monitors: [], capture: [], captureEnabled: false, counter: 1 };

let stpaData = { cs: { controllers: [], processes: [], actions: [], feedbacks: [], others: [], precedence: [] }, dispositions: {}, causeDismissals: {}, scopeFcIds: [], meta: { mission: '', scope: '', boundary: '', abstractionLevel: '' }, losses: [], hazards: [], constraints: [], responsibilities: [], csState: 'initial', sip: {} };

const SPP_SLOTS = [
    { id: 'combinedEffects', label: 'Multi-system FC disposition (B.4)', options: ['MAC model (compiled)', 'Manual CoFFE', 'Hybrid — MAC + CoFFE residue'], dflt: 2,
      help: 'How aircraft-level failure conditions that involve more than one system are dispositioned (ARP4761A §B.4). The standard method is a Combined Functional Failure Effects (CoFFE) analysis — which system functional failures, alone or in combination, produce the aircraft-level failure condition. MAC model (compiled): the tool derives the combined effects automatically from the Minimum Acceptable Configuration model. Manual CoFFE: you work the ARP4761A CoFFE table by hand. Hybrid: MAC compiles the bulk and you hand-work the residue.' },
    { id: 'aircraftTrees', label: 'MF&MS trees (B.4.1)', options: ['Compiled from MAC', 'Authored (cross-checked)', 'Both'], dflt: 2,
      help: 'How the aircraft-level Multifunction & Multisystem (MF&MS) fault trees are produced (ARP4761A §B.4.1) — the top-down trees modelling how combined system functional failures meet each aircraft-level failure condition. Compiled from MAC: generated from the Minimum Acceptable Configuration model. Authored (cross-checked): built by hand with a cross-check. Both: compiled and authored in parallel.' },
    { id: 'quantification', label: 'Quantitative method (§4.1)', options: ['FTA / BDD-exact', 'FTA + Markov attachments'], dflt: 0,
      help: 'The probabilistic method used to quantify the fault trees (ARP4761A §4.1). FTA / BDD-exact: exact top-event probabilities via binary decision diagrams. FTA + Markov attachments: adds state-based Markov models where sequence-dependent or repairable failures need them.' },
    { id: 'independence', label: 'Independence evaluation (App M)', options: ['Principle ledger + CMA', 'CMA worksheets only'], dflt: 0,
      help: 'How independence between functions and items is evaluated and tracked (ARP4761A Appendix M). Principle ledger + CMA: a living register of Independence Principles alongside Common Mode Analysis. CMA worksheets only: relies on the common-mode worksheets alone.' }
];

let _coffeSelectedFc = null;

const _CKPT_PAGE_KEYS = { pasa: 'PASA', asa: 'ASA' };

let _pasaReparented = false;

window.enterAcWorkspace = function() {
    // Default to Functions when entering the workspace fresh.
    switchTab('ac-func');
};

let currentImportTarget = null;

let _phasesProfileId = '';   // '' = default profile (the canonical flightPhasesData)

window.acAddSubfuncRow = function () {
    const c = document.getElementById('ac-subfunc-extra'); if (!c) return;
    const row = document.createElement('div');
    row.className = 'ac-subfunc-row';
    row.style.cssText = 'margin-top:10px;border-top:1px dashed #d8dee8;padding-top:8px;';
    row.innerHTML = '<label>Aircraft Sub-Function ID</label><input type="text" class="ac-xsub-id">' +
        '<label>Aircraft Sub-Function</label><input type="text" class="ac-xsub-name">' +
        '<label>Sub-Function Definition</label><input type="text" class="ac-xsub-def">' +
        '<button type="button" onclick="this.closest(\'.ac-subfunc-row\').remove()" style="margin-top:6px;background:#fbeaea;color:#b91c1c;border:1px solid #f0d9d9;border-radius:6px;padding:3px 9px;cursor:pointer;font-size:12px;">× Remove</button>';
    c.appendChild(row);
    const f = row.querySelector('.ac-xsub-name'); if (f) f.focus();
};

window.submitACFunction = function () {
    if (editStates.acFunc) { acFuncCRUD.submit(); _acClearSubfuncExtras(); return; }
    const gv = function (id) { const e = document.getElementById(id); return e ? e.value : ''; };
    const sv = function (id, v) { const e = document.getElementById(id); if (e) e.value = (v == null ? '' : v); };
    const funcName = gv('ac-func-name'), funcDef = gv('ac-func-def');
    const subRows = [{ id: gv('ac-subfunc-id'), name: gv('ac-subfunc-name'), def: gv('ac-subfunc-def') }];
    const extra = document.querySelectorAll('#ac-subfunc-extra .ac-subfunc-row');
    Array.prototype.forEach.call(extra, function (r) {
        const q = function (sel) { const e = r.querySelector(sel); return e ? e.value : ''; };
        subRows.push({ id: q('.ac-xsub-id'), name: q('.ac-xsub-name'), def: q('.ac-xsub-def') });
    });
    const plan = _acPlanSubAdds(subRows);
    let sharedFuncId = (gv('ac-func-id') || '').trim();   // i=0 uses original (maybe blank → auto-assigned)
    for (let i = 0; i < plan.length; i++) {
        const s = plan[i];
        sv('ac-func-id', sharedFuncId);
        sv('ac-func-name', funcName); sv('ac-func-def', funcDef);
        sv('ac-subfunc-id', s.id); sv('ac-subfunc-name', s.name); sv('ac-subfunc-def', s.def);
        acFuncCRUD.submit();   // validates, auto-numbers blank IDs, pushes, renders, clears the form
        if (i === 0) { const last = acFunctionsData[acFunctionsData.length - 1]; if (last && last.funcId) sharedFuncId = last.funcId; }
    }
    _acClearSubfuncExtras();
};

let _fhaChartActive = null;   // { internalId, scope, fha }

window.openFhaChartModal = function(internalId, scope) {
    let fha = null;
    if (scope === 'ac') {
        fha = acFhaData.find(f => String(f.internalId) === String(internalId));
    } else if (scope === 'sys' && sys()) {
        fha = sys().fha.find(f => String(f.internalId) === String(internalId));
    }
    if (!fha) return;
    _fhaChartActive = { internalId, scope, fha };
    const cp = fha.chartProps || {};
    const sev = fha.severity;

    // Header context — also surface the active cert basis so the user knows
    // which AC's Figure 2 they're walking through.
    const reg = (typeof projectConfig !== 'undefined' && projectConfig && projectConfig.regulation) || 'Part 25';
    const cls = (typeof projectConfig !== 'undefined' && projectConfig && projectConfig.part23Class) || 'IV';
    const isPart23 = reg === 'Part 23';
    const acRef = isPart23 ? 'AC 23.1309-1E' : 'AC 25.1309-1B';
    const certLabel = reg + (isPart23 ? ' Class ' + cls : '');
    const permissive = isPart23 && (cls === 'I' || cls === 'II');

    // Phase 53.73a — title + intro paragraph must reflect the active cert basis.
    // Previously hard-coded to "AC 25.1309-1B" which misled Part 23 / SC-VTOL / etc users.
    const titleEl = document.getElementById('fha-chart-modal-title');
    if (titleEl) titleEl.textContent = '📋 ' + acRef + ' Chart Walkthrough';
    const introEl = document.getElementById('fha-chart-modal-intro');
    if (introEl) introEl.textContent = 'Answers below feed ' + acRef + ' Figure 2 to determine the analysis depth (similarity argument, qualitative only, or full qualitative + quantitative).';

    const ctx = document.getElementById('fha-chart-context');
    if (ctx) {
        ctx.innerHTML =
            '<strong>' + esc(fha.fcId || '') + '</strong> · <span class="cell-' + esc(sev) + '">' + esc(sev) + '</span><br>' +
            esc(fha.fcDesc || '') +
            '<div style="margin-top:8px; padding-top:8px; border-top:1px dashed var(--color-border-hair); font-size: 11px; color: var(--color-text-tertiary);">' +
                'Cert basis: <strong>' + esc(certLabel) + '</strong> · Decision per <strong>' + esc(acRef) + '</strong> Figure 2' +
                (permissive ? '<br><em style="color: #c2680a;">Permissive class — Cat/Haz default to qualitative-only when un-characterized.</em>' : '') +
            '</div>';
    }

    // Set radio values from chartProps
    function setRadio(name, val) {
        const v = val === true ? 'true' : val === false ? 'false' : 'null';
        const els = document.querySelectorAll('input[name="' + name + '"]');
        els.forEach(e => { e.checked = (e.value === v); });
    }
    setRadio('fha-chart-similar',   cp.similarPrior);
    setRadio('fha-chart-simple',    cp.isSimple);
    setRadio('fha-chart-redundant', cp.isRedundant);
    setRadio('fha-chart-simpleconv', cp.isSimpleConventional);

    // Show/hide severity-specific question blocks
    const majQ = document.getElementById('fha-chart-major-questions');
    const cathQ = document.getElementById('fha-chart-cathaz-questions');
    if (majQ)  majQ.style.display  = (sev === 'Major') ? 'block' : 'none';
    if (cathQ) cathQ.style.display = (sev === 'Hazardous' || sev === 'Catastrophic') ? 'block' : 'none';

    // Show outcome preview
    _refreshFhaChartOutcome();

    const modal = document.getElementById('fha-chart-modal');
    if (modal) { modal.style.display = 'flex'; setTimeout(() => modal.classList.add('show'), 10); }
    // Wire change listeners so outcome updates as the user picks
    ['fha-chart-similar','fha-chart-simple','fha-chart-redundant','fha-chart-simpleconv'].forEach(n => {
        document.querySelectorAll('input[name="' + n + '"]').forEach(el => {
            el.onchange = _refreshFhaChartOutcome;
        });
    });
};

window.closeFhaChartModal = function() {
    const modal = document.getElementById('fha-chart-modal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 250);
    _fhaChartActive = null;
};

window.saveFhaChartProps = function() {
    if (!_fhaChartActive) return;
    const fha = _fhaChartActive.fha;
    fha.chartProps = {
        similarPrior:         _readChartRadio('fha-chart-similar'),
        isSimple:             _readChartRadio('fha-chart-simple'),
        isRedundant:          _readChartRadio('fha-chart-redundant'),
        isSimpleConventional: _readChartRadio('fha-chart-simpleconv')
    };
    closeFhaChartModal();
    showToast('Chart characterization saved for ' + (fha.fcId || 'FC') + '.', 'success', 2500);
    try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch(_) {}
    // Re-render the FHA table so the button color flips.
    if (_fhaChartActive && _fhaChartActive.scope === 'ac') renderACFHA();
    else if (typeof renderSysFHA === 'function') renderSysFHA();
};

window.submitACReq = function(){
    // Determine if we're editing an auto-generated req (editStates.acReq is its internalId).
    const editingId = editStates.acReq;
    let preReq = null;
    if(editingId != null){
        const idx = acReqData.findIndex(r => String(r.internalId) === String(editingId));
        if(idx >= 0) preReq = JSON.parse(JSON.stringify(acReqData[idx]));
    }
    // Phase 53.63 — cycle prevention before mutating the store.
    const candidateParent = (document.getElementById('ac-req-parent') || {}).value;
    if (editingId != null && candidateParent && typeof _wouldCreateCycle === 'function' && _wouldCreateCycle(editingId, candidateParent)) {
        return alert('Cannot set this parent — it would create a circular derivation chain.');
    }
    const sizeBefore = acReqData.length;
    _origSubmitACReq();
    // After submit, if this was an auto-req and its text changed, flag user-override.
    if(preReq && preReq.reqSource){
        const updated = acReqData.find(r => String(r.internalId) === String(editingId));
        if(updated && updated.text !== preReq.text){
            if(!updated.reqSource) updated.reqSource = preReq.reqSource;
            updated.reqSource.userOverridden = true;
            if(typeof window.renderACReq === 'function') window.renderACReq();
        }
    }
    // History: edit vs create.
    if (preReq) {
        const updated = acReqData.find(r => String(r.internalId) === String(editingId));
        if (updated && typeof ReqHistory !== 'undefined') {
            // Carry forward the history array (origSubmit replaced the whole row).
            if (!Array.isArray(updated.history)) updated.history = preReq.history || [];
            ReqHistory.record(updated, 'edit', preReq);
        }
    } else if (acReqData.length > sizeBefore) {
        const newest = acReqData[acReqData.length - 1];
        if (newest && typeof ReqHistory !== 'undefined') {
            ReqHistory.record(newest, 'create', null);
        }
    }
};

window.restoreACReq = function(internalId){
    const r = (acReqData || []).find(x => String(x.internalId) === String(internalId));
    if (!r || !r.deleted) return;
    ReqHistory.restore(r);
    if (typeof window.renderACReq === 'function') window.renderACReq();
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
    showToast('Requirement restored.', 'success', 2500);
};

window.submitSysFunction = function() {
    const traceIds = _getSysFuncTraceValues();
    // Capture editStates.sysFunc BEFORE _origSysFuncSubmit runs — the factory's submit
    // calls cancelEdit at the end and clears editStates, so reading it after returns null.
    const editingId = (typeof editStates !== 'undefined') ? editStates.sysFunc : null;
    _origSysFuncSubmit();
    const arr = sys() ? sys().functions : null;
    if (arr) {
        const target = editingId != null ? arr.find(r => String(r.internalId) === String(editingId)) : arr[arr.length - 1];
        if (target) {
            target.traceIds = traceIds.slice();
            // Drop the legacy scalar so save files only carry the new shape.
            delete target.traceId;
        }
    }
    // Reset the multi-select after a new entry.
    populateSysFuncTraceDropdown([]);
    if (typeof renderSysFunctions === 'function') renderSysFunctions();
};

window.submitSysReq = function(){
    const s = sys();
    const editingId = editStates.sysReq;
    let preReq = null;
    if(s && editingId != null){
        const idx = s.req.findIndex(r => String(r.internalId) === String(editingId));
        if(idx >= 0) preReq = JSON.parse(JSON.stringify(s.req[idx]));
    }
    // Phase 53.63 — cycle prevention before mutating the store.
    const candidateParent = (document.getElementById('sys-req-parent') || {}).value;
    if (editingId != null && candidateParent && typeof _wouldCreateCycle === 'function' && _wouldCreateCycle(editingId, candidateParent)) {
        return alert('Cannot set this parent — it would create a circular derivation chain.');
    }
    const sizeBefore = s ? s.req.length : 0;
    _origSubmitSysReq();
    const s2 = sys();
    if(preReq && preReq.reqSource){
        const updated = s2 && s2.req.find(r => String(r.internalId) === String(editingId));
        if(updated && updated.text !== preReq.text){
            if(!updated.reqSource) updated.reqSource = preReq.reqSource;
            updated.reqSource.userOverridden = true;
            if(typeof window.renderSysReq === 'function') window.renderSysReq();
        }
    }
    // Phase 53.56 — history capture.
    if (preReq) {
        const updated = s2 && s2.req.find(r => String(r.internalId) === String(editingId));
        if (updated && typeof ReqHistory !== 'undefined') {
            if (!Array.isArray(updated.history)) updated.history = preReq.history || [];
            ReqHistory.record(updated, 'edit', preReq);
        }
    } else if (s2 && s2.req.length > sizeBefore) {
        const newest = s2.req[s2.req.length - 1];
        if (newest && typeof ReqHistory !== 'undefined') {
            ReqHistory.record(newest, 'create', null);
        }
    }
};

window.restoreSysReq = function(internalId){
    const s = sys(); if (!s) return;
    const r = (s.req || []).find(x => String(x.internalId) === String(internalId));
    if (!r || !r.deleted) return;
    ReqHistory.restore(r);
    if (typeof window.renderSysReq === 'function') window.renderSysReq();
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
    showToast('Requirement restored.', 'success', 2500);
};

window.onPraModelTypeChange = function(){
    const sel = document.getElementById('pra-model-type');
    _renderPraModelForm(sel ? sel.value : '', {});
};

let _cmaScopeFilter = 'all';  // 'all' | 'aircraft' | 'system'

window.setCmaScopeFilter = function(scope) {
    _cmaScopeFilter = scope;
    document.querySelectorAll('[data-cma-scope]').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-cma-scope') === scope);
    });
    renderCMA();
};

window.renderCMA = function() {
    // Re-populate the owning-system dropdown each render so it stays in sync with systemsData.
    populateCmaOwningSystem();
    onCmaScopeChange();
    // Keep the linked-gates dropdown in sync with the current FTA pages.
    populateCmaLinkedGatesDropdown();
    if (_cmaScopeFilter === 'all') {
        _origCmaRender();
        return;
    }
    // Temporarily filter the store by swapping the body innerHTML after the base render.
    _origCmaRender();
    const tbody = document.getElementById('cma-body');
    if (!tbody) return;
    // Filter rows in-place by matching data attribute we'll add: re-render manually instead.
    const rows = (cmaData || []).filter(r => ((r.scope || 'aircraft') === _cmaScopeFilter));
    // 6 Sep 2026 — the scope-filtered view pages through the shared pager like the unfiltered
    // one (it used to render every filtered row at once). Key carries the scope so each
    // filter remembers its own page.
    const _cmaRowHtml = row => {
        const actions = rowActionsHTML('editCMA', 'deleteCMA', row.internalId);
        // Phase 53.73 — Review column on filtered CMA rows.
        const reviewTd = reviewCellHtml('cma', row.internalId, null);
        return '<tr>' +
            '<td>' + actions + '</td>' +
            _renderScopeCell(row.scope, row.owningSystemId) +
            '<td><strong>' + esc(row.cmaId) + '</strong></td>' +
            '<td>' + _cmaSuggestBadge(row) + esc(row.subject) + '</td>' +
            '<td>' + esc(row.claim) + '</td>' +
            '<td>' + _renderCmaLinkedGatesCell(row.linkedGateIds) + '</td>' +
            '<td>' + _renderCmaModesCell(row.modes) + '</td>' +
            '<td>' + esc(row.findings) + '</td>' +
            '<td>' + esc(row.mitigation) + '</td>' +
            '<td>' + _renderCmaStatusCell(row.status) + '</td>' +
            reviewTd +
        '</tr>';
    };
    if (typeof SLPaginate !== 'undefined' && typeof SLPaginate.pageTbody === 'function') {
        SLPaginate.pageTbody({ key: 'cma-' + _cmaScopeFilter, tbody, rows, rowHtml: _cmaRowHtml,
            label: (f, t, n) => 'rows ' + f.toLocaleString() + '–' + t.toLocaleString() + ' of ' + n.toLocaleString() + ' in this scope — counts computed over the full set' });
    } else {
        tbody.innerHTML = rows.map(_cmaRowHtml).join('');
    }
};

window.detectResourceCommonModes = function () {
    if (typeof pushUndo === 'function') pushUndo('Detect shared-resource common modes');
    if (typeof cmaData === 'undefined' || !Array.isArray(cmaData)) { try { cmaData = []; } catch (e) {} }
    const existingKeys = new Set((cmaData || []).map(c => c && c.autoKey).filter(Boolean));
    const _mkId = () => (typeof _newId === 'function') ? _newId('CMA') : ('CMA-A' + (internalIdCounter));
    let candidates = [];
    try { candidates = _detectSharedResourceCommonModes(existingKeys, _mkId); } catch (e) { candidates = []; }
    if (!candidates.length) {
        if (typeof showToast === 'function') showToast('No shared-resource couplings found across AND/INHIBIT gates.', 'info', 4500);
        return;
    }
    candidates.forEach(c => cmaData.push(c));
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
    if (typeof renderCMA === 'function') renderCMA();
    if (typeof showToast === 'function') showToast('Flagged ' + candidates.length + ' shared-resource common mode(s) in CMA — review under Common Mode Analysis.', 'success', 5200);
    // Jump to CMA if that view exists so the analyst lands on the new rows.
    try {
        if (typeof switchTab === 'function' && document.getElementById('view-cma')) switchTab('cma');
    } catch (e) { /* navigation is best-effort */ }
};

window.acceptCmaSuggestion = function (id) {
    const row = (cmaData || []).find(r => String(r.internalId) === String(id));
    if (!row) return;
    delete row.suggested;
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
    renderCMA();
    if (typeof showToast === 'function') showToast('Common-mode entry accepted.', 'success', 2500);
};

window.dismissCmaSuggestion = function (id) {
    cmaData = (cmaData || []).filter(r => String(r.internalId) !== String(id));
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
    renderCMA();
    if (typeof showToast === 'function') showToast('Suggestion dismissed.', 'info', 2500);
};

window.submitRouting = function () {
    // Capture multiselects + editingId BEFORE the factory submit (its cancelEdit clears state).
    const zones = _getCheckboxListValues(document.getElementById('routing-zones'));
    const funcs = _getCheckboxListValues(document.getElementById('routing-functions'));
    const items = _getCheckboxListValues(document.getElementById('routing-items'));
    const editingId = editStates.routing;
    _origRoutingSubmit();
    const target = editingId != null
        ? (routingData || []).find(r => String(r.internalId) === String(editingId))
        : (routingData || [])[routingData.length - 1];
    if (target) {
        target.routesThroughZones = zones;
        target.carriesFunctions = funcs;
        target.carriesItems = items;
        if (!Array.isArray(target.history)) target.history = [];
        target.history.push({ ts: Date.now(), action: editingId != null ? 'edit' : 'create' });
    }
    // Reset the checkbox lists for the next entry.
    _populateRoutingMultiselects({});
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
};

window.submitResource = function () {
    // Auto-number resId on create if blank (edit keeps the existing id).
    const idEl = document.getElementById('resources-id');
    if (idEl && !String(idEl.value || '').trim() && editStates.resources == null) {
        idEl.value = (typeof _newId === 'function')
            ? _newId('RES')
            : 'RES-' + String(resourcesData.length + 1).padStart(3, '0');
    }
    // Capture multiselects + editingId BEFORE the factory submit (its cancelEdit clears state).
    const provided = _getCheckboxListValues(document.getElementById('resources-provided-by'));
    const consumed = _getCheckboxListValues(document.getElementById('resources-consumed-by'));
    const editingId = editStates.resources;
    _origResourceSubmit();
    const target = editingId != null
        ? (resourcesData || []).find(r => String(r.internalId) === String(editingId))
        : (resourcesData || [])[resourcesData.length - 1];
    if (target) {
        target.providedBy = provided;
        target.consumedBy = consumed;
    }
    // Reset the checkbox lists for the next entry.
    _populateResourceMultiselects({});
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
};

window.setTraceScopeFilter = function(scope) {
    window._traceScopeFilter = scope || 'all';
    document.querySelectorAll('#trace-filter-bar .filter-chip').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-trace-scope') === window._traceScopeFilter);
    });
    if (typeof generateTraceMatrix === 'function') generateTraceMatrix();
};

window.deriveHazardTraces = function() {
    const edges = [];
    const seen = new Set();   // dedupe by sourceFha.internalId|targetFha.internalId|basis
    function _emit(src, tgt, basis) {
        if (!src || !src.fha || !tgt || !tgt.fha) return;
        if (String(src.fha.internalId) === String(tgt.fha.internalId)) return;   // no self-loop
        const key = src.fha.internalId + '|' + tgt.fha.internalId + '|' + basis;
        if (seen.has(key)) return;
        seen.add(key);
        edges.push({ source: src, target: tgt, basis });
    }
    const sysName = id => {
        const s = (systemsData || []).find(x => x.id === id);
        return s ? (s.name || s.id) : id;
    };

    // ---- Helper: map sys-function internalId → systemId + function record ----
    const sysFuncIndex = new Map();   // sysFunc.internalId → { systemId, sysFunc }
    (systemsData || []).forEach(s => {
        (s.functions || []).forEach(fn => {
            sysFuncIndex.set(fn.internalId, { systemId: s.id, sysFunc: fn });
        });
    });

    // ---- Helper: map ac-function internalId → list of {systemId, sysFunc} that trace to it ----
    const acFuncToSysFuncs = new Map();   // acFuncId → [{systemId, sysFunc}, ...]
    (systemsData || []).forEach(s => {
        (s.functions || []).forEach(fn => {
            const tIds = Array.isArray(fn.traceIds) ? fn.traceIds : (fn.traceId ? [fn.traceId] : []);
            tIds.forEach(aid => {
                if (!acFuncToSysFuncs.has(aid)) acFuncToSysFuncs.set(aid, []);
                acFuncToSysFuncs.get(aid).push({ systemId: s.id, sysFunc: fn });
            });
        });
    });

    // ---- Helper: list of sys FHAs per system that reference a given sys-function internalId ----
    function _sysFhasForFunction(systemId, sysFuncId) {
        const s = (systemsData || []).find(x => x.id === systemId);
        if (!s) return [];
        return (s.fha || []).filter(f => {
            const ids = Array.isArray(f.subIds) ? f.subIds : (f.subId ? [f.subId] : []);
            return ids.includes(sysFuncId);
        });
    }

    // ---- Helper: function name lookup for the matrix's "Target Function" column ----
    function _funcLabel(scope, systemId, funcInternalId) {
        if (!funcInternalId) return '';
        if (scope === 'ac') {
            const fn = (acFunctionsData || []).find(f => String(f.internalId) === String(funcInternalId));
            return fn ? (fn.funcId ? fn.funcId + ': ' : '') + (fn.funcName || '') : '';
        }
        const idx = sysFuncIndex.get(funcInternalId);
        if (!idx) return '';
        const fn = idx.sysFunc;
        return (fn.funcId ? fn.funcId + ': ' : '') + (fn.funcName || '');
    }

    // ----- Pass 1: AC FHA ↔ Sys FHA via the function trace graph -----
    (acFhaData || []).forEach(acFha => {
        const acFuncIds = Array.isArray(acFha.subIds) ? acFha.subIds : (acFha.subId ? [acFha.subId] : []);
        acFuncIds.forEach(acFuncId => {
            const sysFuncMatches = acFuncToSysFuncs.get(acFuncId) || [];
            sysFuncMatches.forEach(({ systemId, sysFunc }) => {
                const sysFhas = _sysFhasForFunction(systemId, sysFunc.internalId);
                sysFhas.forEach(sysFha => {
                    _emit(
                        { fha: acFha, scope: 'ac', function: _funcLabel('ac', null, acFuncId) },
                        { fha: sysFha, scope: 'sys', systemId, systemName: sysName(systemId), function: _funcLabel('sys', systemId, sysFunc.internalId) },
                        'function-trace'
                    );
                    // Reverse direction: Sys → AC
                    _emit(
                        { fha: sysFha, scope: 'sys', systemId, systemName: sysName(systemId), function: _funcLabel('sys', systemId, sysFunc.internalId) },
                        { fha: acFha, scope: 'ac', function: _funcLabel('ac', null, acFuncId) },
                        'function-trace'
                    );
                });
            });
        });
    });

    // ----- Pass 2: Sys FHA ↔ Sys FHA via shared AC function -----
    // If sysFhaA hazards a sysFunc tracing to acFunc X, AND sysFhaB hazards a sysFunc
    // tracing to the same acFunc X, then sysFhaA and sysFhaB are linked through X.
    acFuncToSysFuncs.forEach((sysFuncList, acFuncId) => {
        // Build the full set of (sysFha, sysFunc) pairs that hazard sys functions tracing to this acFunc.
        const candidates = [];
        sysFuncList.forEach(({ systemId, sysFunc }) => {
            const sysFhas = _sysFhasForFunction(systemId, sysFunc.internalId);
            sysFhas.forEach(sysFha => candidates.push({ sysFha, systemId, sysFunc }));
        });
        // Emit a cross-system edge for every distinct pair of candidates that live in different systems.
        for (let i = 0; i < candidates.length; i++) {
            for (let j = i + 1; j < candidates.length; j++) {
                if (candidates[i].systemId === candidates[j].systemId) continue;
                const a = candidates[i], b = candidates[j];
                _emit(
                    { fha: a.sysFha, scope: 'sys', systemId: a.systemId, systemName: sysName(a.systemId), function: _funcLabel('sys', a.systemId, a.sysFunc.internalId) },
                    { fha: b.sysFha, scope: 'sys', systemId: b.systemId, systemName: sysName(b.systemId), function: _funcLabel('sys', b.systemId, b.sysFunc.internalId) },
                    'function-trace'
                );
                _emit(
                    { fha: b.sysFha, scope: 'sys', systemId: b.systemId, systemName: sysName(b.systemId), function: _funcLabel('sys', b.systemId, b.sysFunc.internalId) },
                    { fha: a.sysFha, scope: 'sys', systemId: a.systemId, systemName: sysName(a.systemId), function: _funcLabel('sys', a.systemId, a.sysFunc.internalId) },
                    'function-trace'
                );
            }
        }
    });

    // ----- Pass 3: External-source FTA links (Phase 56.18) -----
    // When an FTA basic event's externalSource targets an FHA (kind='fha'), that
    // creates a cross-scope edge between the page's owning FHA and the linked FHA.
    function _resolveFhaById(targetId) {
        if (!targetId) return null;
        if (targetId.startsWith && targetId.startsWith('AC_')) {
            const innerId = targetId.slice(3);
            const f = (acFhaData || []).find(x => String(x.internalId) === innerId);
            return f ? { fha: f, scope: 'ac' } : null;
        }
        if (targetId.startsWith && targetId.startsWith('SYS_')) {
            const innerId = targetId.slice(4);
            for (const s of (systemsData || [])) {
                const f = (s.fha || []).find(x => String(x.internalId) === innerId);
                if (f) return { fha: f, scope: 'sys', systemId: s.id, systemName: sysName(s.id) };
            }
        }
        return null;
    }
    (ftaPages || []).forEach(page => {
        if (!page || !page.root) return;
        // Find the page's owning FHA via linkedFhaIds[] (Phase 28.6).
        const lids = Array.isArray(page.linkedFhaIds) ? page.linkedFhaIds : (page.linkedFhaId ? [page.linkedFhaId] : []);
        if (!lids.length) return;
        const ownerFhas = lids.map(lid => {
            const inAc = (acFhaData || []).find(f => String(f.internalId) === String(lid));
            if (inAc) return { fha: inAc, scope: 'ac' };
            for (const s of (systemsData || [])) {
                const m = (s.fha || []).find(f => String(f.internalId) === String(lid));
                if (m) return { fha: m, scope: 'sys', systemId: s.id, systemName: sysName(s.id) };
            }
            return null;
        }).filter(Boolean);
        if (!ownerFhas.length) return;
        // Walk the page tree, collect every externalSource pointing at an FHA.
        const stack = [page.root];
        const seenIds = new Set();
        while (stack.length) {
            const n = stack.pop();
            if (!n || seenIds.has(n.id)) continue;
            seenIds.add(n.id);
            const src = n.externalSource;
            if (src && (src.kind === 'fha' || (src.targetId && !src.targetNodeId)) && src.targetId) {
                const tgt = _resolveFhaById(src.targetId);
                if (tgt) {
                    ownerFhas.forEach(owner => {
                        _emit(owner, tgt, 'external-source');
                        _emit(tgt, owner, 'external-source');
                    });
                }
            }
            const kids = n.children || n._children || [];
            for (const k of kids) stack.push(k);
        }
    });

    // ----- Pass 4: Legacy manual acTraces[] / acTrace fallback -----
    // Keeps existing projects with hand-entered traces working even if no
    // function-trace edges have been drawn yet.
    (systemsData || []).forEach(s => {
        (s.fha || []).forEach(sysFha => {
            // acTraces[] is a multi-list of AC FHA internalIds (Phase 28.3).
            const list = Array.isArray(sysFha.acTraces) ? sysFha.acTraces.slice() : [];
            // Legacy single .acTrace might be either an FHA internalId or an FC ID string.
            if (sysFha.acTrace) list.push(sysFha.acTrace);
            list.forEach(ref => {
                let acFha = (acFhaData || []).find(f => String(f.internalId) === String(ref));
                if (!acFha) acFha = (acFhaData || []).find(f => f.fcId === ref);
                if (!acFha) return;
                _emit(
                    { fha: sysFha, scope: 'sys', systemId: s.id, systemName: sysName(s.id) },
                    { fha: acFha, scope: 'ac' },
                    'manual-acTraces'
                );
                _emit(
                    { fha: acFha, scope: 'ac' },
                    { fha: sysFha, scope: 'sys', systemId: s.id, systemName: sysName(s.id) },
                    'manual-acTraces'
                );
            });
        });
    });

    return edges;
};

window.setReqsRepoActive = function(key) {
    window._reqsRepoActive = key;
    renderRequirementsRepository();
};

window.setVVFilter = function(key, val) {
    window._vvFilters[key] = val;
    renderVVStatusPage();
};

window.getAutoDerivedFhaSiblings = function(targetKind, targetInternalId, targetSystemId) {
    if (typeof window.deriveHazardTraces !== 'function') return [];
    if (targetKind !== 'acFha' && targetKind !== 'sysFha') return [];
    const edges = window.deriveHazardTraces();
    return edges.filter(e => {
        const s = e.source;
        const scopeMatch = (targetKind === 'acFha' && s.scope === 'ac') ||
                           (targetKind === 'sysFha' && s.scope === 'sys' && s.systemId === targetSystemId);
        return scopeMatch && String(s.fha.internalId) === String(targetInternalId);
    });
};

let _fmeaActiveMode = 'functional';   // segmented control state

let _fmeaScopeFilter = 'all';         // 'all' | 'aircraft' | 'system'

window.setFmeaScopeFilter = function(scope) {
    _fmeaScopeFilter = scope;
    document.querySelectorAll('[data-fmea-scope]').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-fmea-scope') === scope);
    });
    renderFMEA();
};

const _SEV_CELL_CLASS = {
    'Catastrophic': 'cell-Catastrophic',
    'Hazardous':    'cell-Hazardous',
    'Major':        'cell-Major',
    'Minor':        'cell-Minor',
    'Negligible':   'cell-Negligible'
};

window.onFmeaParentLibChange = function(){
    const key = (document.getElementById('fmea-parent-lib') || {}).value;
    const menu = document.getElementById('fmea-mode-menu');
    if (!menu) return;
    if (!key || !FAILURE_MODE_DISTRIBUTIONS[key]) {
        menu.style.display = 'none';
        menu.innerHTML = '';
        return;
    }
    const modes = FAILURE_MODE_DISTRIBUTIONS[key];
    const sumA = modes.reduce((s, m) => s + (m.alphaFm || 0), 0);
    const sumChip = Math.abs(sumA - 1.0) <= 0.02
        ? '<span style="background: rgba(52,199,89,0.14); color: var(--sev-min-fg); padding: 1px 8px; border-radius: var(--r-full); font-size: 10px; font-weight: 700; letter-spacing: 0.04em;">Σα = ' + sumA.toFixed(2) + '</span>'
        : '<span style="background: rgba(255,149,0,0.14); color: var(--sev-haz-fg); padding: 1px 8px; border-radius: var(--r-full); font-size: 10px; font-weight: 700; letter-spacing: 0.04em;">Σα = ' + sumA.toFixed(2) + ' (≠ 1)</span>';
    let html = '<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;"><strong>Published failure mode distribution</strong> ' + sumChip + '</div>';
    html += '<div style="display: flex; flex-direction: column; gap: 4px;">';
    modes.forEach((m, idx) => {
        const a = (m.alphaFm * 100).toFixed(0);
        html += '<button type="button" class="action-btn" style="text-align: left; background: var(--color-surface-1); border: 1px solid var(--color-border-hair); padding: 6px 10px; font-size: 12px;" onclick="applyFmeaModeMenuPick(\'' + esc(key) + '\', ' + idx + ')">'
              + '<span style="display: inline-block; width: 42px; font-family: var(--font-mono); color: var(--color-accent); font-weight: 600;">' + a + '%</span>'
              + esc(m.mode) + ' <span style="color: var(--color-text-tertiary); font-size: 10.5px;">— ' + esc(m.source) + '</span>'
              + '</button>';
    });
    html += '</div>';
    menu.innerHTML = html;
    menu.style.display = '';
};

window.applyFmeaModeMenuPick = function(libKey, idx){
    const modes = FAILURE_MODE_DISTRIBUTIONS[libKey];
    if (!modes || !modes[idx]) return;
    const m = modes[idx];
    const modeEl = document.getElementById('fmea-mode');
    const alphaEl = document.getElementById('fmea-alpha-fm');
    if (modeEl) modeEl.value = m.mode;
    if (alphaEl) alphaEl.value = m.alphaFm;
    onFmeaAlphaFmChange();
};

window.onFmeaAlphaFmChange = function(){
    const key = (document.getElementById('fmea-parent-lib') || {}).value;
    const alphaEl = document.getElementById('fmea-alpha-fm');
    const rateEl = document.getElementById('fmea-rate');
    if (!key || !alphaEl || !rateEl) return;
    const parent = COMPONENT_LIBRARY[key] || ((projectConfig && projectConfig.customLibrary) || {})[key];
    const a = parseFloat(alphaEl.value);
    if (parent && parent.lambda > 0 && !isNaN(a) && a > 0) {
        rateEl.value = parent.lambda * a;
        if (typeof calcFMEAProb === 'function') calcFMEAProb();
    }
};

const AI_LS_ANTHROPIC = 'safetyLab.ai.anthropicKey';

const AI_LS_VOYAGE    = 'safetyLab.ai.voyageKey';

const AI_LS_COST      = 'safetyLab.ai.sessionCost';

const AI_IDB_NAME     = 'safetyLab.ai.v1';

const AI_IDB_STORE    = 'memory';

// 6 Sep 2026 — when the config surface is present its answer is FINAL, including a blank
// (browser-only / AI off = no AI endpoint at all). A blank used to fall through to Safety
// Lab's proxy, which is exactly the leak the config surface exists to prevent. The direct
// override / hosted fallback survives only for an out-of-order load with no SLConfig.
const AI_PROXY_BASE_URL = (typeof window !== 'undefined' && window.SLConfig) ? String(window.SLConfig.aiEndpoint || '') : ((typeof window !== 'undefined' && window.__SLAB_AI_ENDPOINT__) ? String(window.__SLAB_AI_ENDPOINT__) : 'https://api.safetylabaero.com/v1/ai');

const PRO_PLUS_MONTHLY_ALLOWANCE = 2000000;   // 2M Sonnet-equivalent tokens / month

window.toggleAiITAR = function(){
    if (!projectConfig) return;
    const el = document.getElementById('ai-itar-toggle');
    projectConfig.isITARControlled = !!(el && el.checked);
    _refreshAiITARStatus();
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
};

window.saveAiSettings = function(){
    const get = (id) => (document.getElementById(id) || {}).value || '';
    try {
        const aKey = get('ai-anthropic-key').trim();
        const vKey = get('ai-voyage-key').trim();
        if (aKey) localStorage.setItem(AI_LS_ANTHROPIC, aKey); else localStorage.removeItem(AI_LS_ANTHROPIC);
        if (vKey) localStorage.setItem(AI_LS_VOYAGE, vKey);    else localStorage.removeItem(AI_LS_VOYAGE);
    } catch(_) { return alert('Could not write to localStorage. Check browser privacy settings.'); }
    // Self-hosted / on-prem backend (#56) — provider mode + local endpoints/model/key.
    // These are read directly by the AI module's Provider (cloud / itar-cloud / local).
    try {
        const lsSet = (k, v) => { v = (v || '').trim(); if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); };
        const mode = (get('ai-provider-mode') || 'cloud').trim();
        localStorage.setItem('safetyLab.ai.provider', mode || 'cloud');
        lsSet('safetyLab.ai.localEndpoint',      get('ai-local-endpoint'));
        lsSet('safetyLab.ai.localModel',         get('ai-local-model'));
        lsSet('safetyLab.ai.localKey',           get('ai-local-key'));
        lsSet('safetyLab.ai.localEmbedEndpoint', get('ai-local-embed-endpoint'));
        lsSet('safetyLab.ai.localEmbedModel',    get('ai-local-embed-model'));
        const visEl = document.getElementById('ai-local-vision');
        localStorage.setItem('safetyLab.ai.localVision', (visEl && !visEl.checked) ? '0' : '1');
    } catch(_) {}
    if (!projectConfig.aiSettings) projectConfig.aiSettings = {};
    projectConfig.aiSettings.anthropicModel = get('ai-anthropic-model');
    projectConfig.aiSettings.voyageModel    = get('ai-voyage-model');
    projectConfig.aiSettings.maxTokens      = parseInt(get('ai-max-tokens')) || 4096;
    projectConfig.aiSettings.costCap        = parseFloat(get('ai-cost-cap')) || 0;   // blank / 0 = no cap
    projectConfig.aiSettings.topK           = parseInt(get('ai-top-k')) || 5;
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
    const status = document.getElementById('ai-status');
    if (status) status.innerHTML = '<span style="color: var(--color-success);">✓ Settings saved.</span>';
    setTimeout(() => { if (status) status.innerHTML = ''; }, 3000);
};

window.clearAiKeys = function(){
    if (!confirm('Clear both Anthropic and Voyage API keys from this browser? AI features will be disabled until you paste new keys.')) return;
    try { localStorage.removeItem(AI_LS_ANTHROPIC); localStorage.removeItem(AI_LS_VOYAGE); } catch(_) {}
    document.getElementById('ai-anthropic-key').value = '';
    document.getElementById('ai-voyage-key').value = '';
    const status = document.getElementById('ai-status');
    if (status) status.innerHTML = '<span class="u-muted">Keys cleared.</span>';
};

window.testAiConnection = async function(){
    const status = document.getElementById('ai-status');
    let mode = 'cloud';
    try { mode = localStorage.getItem('safetyLab.ai.provider') || 'cloud'; } catch(_) {}
    const localMode = (mode === 'local');
    if (status) status.innerHTML = '<span class="u-muted">Testing ' + (localMode ? 'self-hosted model' : 'Pro+ proxy') + '…</span>';
    try {
        saveAiSettings();
        if (localMode && window.SafetyLabAI && typeof window.SafetyLabAI.complete === 'function') {
            const r = await window.SafetyLabAI.complete({
                feature: 'ai.test',
                messages: [{ role: 'user', content: 'Reply with the single word OK and nothing else.' }],
                maxTokens: 16
            });
            const txt = (r && r.text) || '';
            if (status) status.innerHTML = '<span style="color: var(--color-success);">✓ Self-hosted model OK (' + esc((r && r.model) || 'local') + '). Replied: ' + esc(String(txt).trim()) + '</span>';
            _renderAiAuditLog();
            return;
        }
        const r = await AiClient.messages({
            feature: 'ai.test',
            messages: [{ role: 'user', content: 'Reply with the single word OK and nothing else.' }],
            maxTokens: 16
        });
        const txt = (r.content && r.content[0] && r.content[0].text) || '';
        const route = AiClient.isProxyMode() ? 'Pro+ proxy' : 'BYO direct';
        if (status) status.innerHTML = '<span style="color: var(--color-success);">✓ ' + route + ' OK. Model replied: ' + esc(txt.trim()) + '</span>';
        _refreshAiAllowance();
        _refreshAiCostDisplay();
        _renderAiAuditLog();
    } catch(e) {
        if (status) status.innerHTML = '<span style="color: var(--sev-cat-fg);">✗ Test failed: ' + esc(String(e.message || e)) + '</span>';
        _renderAiAuditLog();
    }
};

window.testAiConnectionBYO = async function(){
    const status = document.getElementById('ai-status');
    saveAiSettings();
    const hasKey = !!(localStorage.getItem(AI_LS_ANTHROPIC) || '').trim();
    if (!hasKey) { if (status) status.innerHTML = '<span style="color: var(--sev-haz-fg);">No BYO Anthropic key pasted in Advanced. Paste a key first.</span>'; return; }
    // The proxy mode check looks at Pro+ license + license token, so if both are absent we'll fall through to BYO.
    // For an explicit BYO test, temporarily blank the license token.
    let savedToken = '';
    try { savedToken = localStorage.getItem('safetyLab.license.token') || ''; localStorage.removeItem('safetyLab.license.token'); } catch(_) {}
    try { await testAiConnection(); } finally {
        try { if (savedToken) localStorage.setItem('safetyLab.license.token', savedToken); } catch(_) {}
    }
};

window.testVoyageConnection = async function(){
    const status = document.getElementById('ai-status');
    let mode = 'cloud';
    try { mode = localStorage.getItem('safetyLab.ai.provider') || 'cloud'; } catch(_) {}
    const localMode = (mode === 'local');
    if (status) status.innerHTML = '<span class="u-muted">Testing ' + (localMode ? 'self-hosted embeddings' : 'Voyage') + '…</span>';
    try {
        saveAiSettings();
        let v;
        if (localMode && window.SafetyLabAI && typeof window.SafetyLabAI.embed === 'function') {
            v = await window.SafetyLabAI.embed({ input: 'Safety Lab Aero connection test.', inputType: 'query' });
        } else {
            v = await AiClient.embed('Safety Lab Aero connection test.', { inputType: 'query' });
        }
        const dim = (v && v.length) || 0;
        if (status) status.innerHTML = '<span style="color: var(--color-success);">✓ ' + (localMode ? 'Self-hosted embeddings' : 'Voyage') + ' OK. Embedding dimension: ' + dim + '</span>';
        _refreshAiCostDisplay();
        _renderAiAuditLog();
    } catch(e) {
        if (status) status.innerHTML = '<span style="color: var(--sev-cat-fg);">✗ Embeddings failed: ' + esc(String(e.message || e)) + '</span>';
        _renderAiAuditLog();
    }
};

window.exportAiMemory = async function(){
    try {
        const all = await AiMemory.all();
        // #78 — export as a governed correction/regression dataset (schema-wrapped), not a raw dump.
        const payload = { schema: 'safety-lab.correction-dataset.v1', exportedAt: new Date().toISOString(), count: all.length, cases: all };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'safety_lab_correction_dataset.json'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch(e) { alert('Export failed: ' + e); }
};

window.clearAiMemory = async function(){
    if (!confirm('Clear all AI review memory from this browser? Cannot be undone. Past audit-log entries on the project file are unaffected.')) return;
    try { await AiMemory.clear(); _refreshAiMemoryCount(); showToast('AI memory cleared.', 'success', 2500); } catch(e) { alert('Clear failed: ' + e); }
};

window.onItemIsEngineToggle = function(){
    const el = document.getElementById('item-is-engine');
    const block = document.getElementById('item-engine-fields');
    if (block) block.style.display = (el && el.checked) ? '' : 'none';
};

window.deleteFMEA = function(iId) {
    const removed = (fmeaData || []).find(r => String(r.internalId) === String(iId));   // 28 Aug 2026 — numeric-id rows vs the kebab's string id
    fmeaData = fmeaData.filter(r => String(r.internalId) !== String(iId));
    // Re-aggregate so the basic event drops to the sum of its REMAINING modes
    // (and back to 0 if its last mode was removed) instead of keeping a stale λ.
    if (removed && (removed.fmeaType || 'piece-part') === 'piece-part' && removed.beId) {
        _pushPiecePartFmeaToFta([removed.beId]);
    }
    renderFMEA();
};

window.renderFMEA = function() {
    _setFmeaTableHead();
    if (typeof refreshFmeaModeButtons === 'function') refreshFmeaModeButtons();
    _populateFmeaFunctionLink();
    _populateFmeaFuncLinkedFc();
    // Keep the form's owning-system dropdown current with systemsData on every render.
    populateFmeaOwningSystem();
    onFmeaScopeChange();
    const tbody = document.getElementById('fmea-body');
    if (!tbody) return;
    // Filter to the active mode (treat legacy rows without fmeaType as piece-part).
    // Then apply scope filter (legacy rows without scope default to 'aircraft').
    // 'orphan' is a special filter value — orthogonal to scope, shows rows whose source is gone.
    const rows = (fmeaData || [])
        .filter(r => String(r.owningSystemId || '') === String(activeSystemId || ''))   // Phase 68 — FMEA is per-system; show only the open System Folder's rows
        .filter(r => (r.fmeaType || 'piece-part') === _fmeaActiveMode)
        .filter(r => {
            if (_fmeaScopeFilter === 'all') return true;
            if (_fmeaScopeFilter === 'orphan') return _isFmeaOrphan(r);
            const s = r.scope || 'aircraft';
            return s === _fmeaScopeFilter;
        });
    // ENG-2 phase 1b — one row builder, paginated via the shared pager (>50
    // rows); the coverage banner rides at the top of EVERY page.
    const _fmeaRowHtml = (row) => {
        const actions = rowActionsHTML('editFMEA', 'deleteFMEA', row.internalId);
        // Phase 53.73 — Review column on every FMEA row.
        const reviewTd = reviewCellHtml('fmea', row.internalId, null);
        const sevClass = _SEV_CELL_CLASS[row.severity] || '';
        const sevCell = '<td class="' + sevClass + '">' + esc(row.severity || '—') + '</td>';
        const orphan = _isFmeaOrphan(row);
        const scopeCell = _renderScopeCell(row.scope, row.owningSystemId, { orphan, orphanReason: orphan ? _fmeaOrphanReason(row) : '' });
        if (row.fmeaType === 'functional') {
            const fn = (acFunctionsData || []).find(f => f.subId === row.funcSubId);
            const fnLabel = fn ? (row.funcSubId + ' · ' + (fn.subName || '')) : (row.funcSubId || '—');
            // #3 — show the linked FHA failure condition (if any) as a chip on the function cell.
            const _fc = row.linkedFcId ? (acFhaData || []).find(h => String(h.internalId) === String(row.linkedFcId)) : null;
            const _fcChip = _fc ? ' <span style="display:inline-block;padding:1px 6px;margin-left:4px;background:var(--color-accent-soft);color:var(--color-accent);border-radius:var(--r-full);font-size:10px;font-weight:600;" title="Linked failure condition">&#8594; ' + esc(_fc.fcId || ('FC#' + _fc.internalId)) + '</span>' : '';
            return '<tr>' +
                '<td>' + actions + '</td>' +
                scopeCell +
                '<td><strong>' + esc(row.fmeaId || '') + '</strong></td>' +
                '<td>' + esc(fnLabel) + _fcChip + '</td>' +
                '<td>' + esc(FMEA_FUNC_MODE_LABELS[row.funcMode] || row.funcMode || '') + '</td>' +
                '<td>' + esc(row.localEffect || '') + '</td>' +
                '<td>' + esc(row.nextEffect || '') + '</td>' +
                '<td>' + esc(row.endEffect || '') + '</td>' +
                '<td>' + esc(row.detection || '') + '</td>' +
                sevCell +
                '<td>' + esc(row.compensating || '') + '</td>' +
                '<td>' + esc(row.phase || '') + '</td>' +
                reviewTd +
            '</tr>';
        }
        // piece-part
        let targetNode = null;
        for (const page of ftaPages) { targetNode = findNode(page.root, row.beId); if (targetNode) break; }
        const display = targetNode ? '[' + esc(targetNode.displayId) + ']' : 'Unknown Node';
        return '<tr>' +
            '<td>' + actions + '</td>' +
            scopeCell +
            '<td><strong>' + esc(row.fmeaId || '') + '</strong></td>' +
            '<td>' + display + '</td>' +
            '<td>' + esc(row.part || '') + '</td>' +
            '<td>' + esc(row.mode || '') + '</td>' +
            '<td>' + esc(row.localEffect || '') + '</td>' +
            '<td>' + esc(row.nextEffect || '') + '</td>' +
            '<td>' + esc(row.endEffect || '') + '</td>' +
            '<td>' + esc(row.detection || '') + '</td>' +
            sevCell +
            '<td>' + esc(row.phase || '') + '</td>' +
            '<td>' + esc(row.rate || 0) + '</td>' +
            '<td>' + esc(row.time || 0) + '</td>' +
            '<td><strong>' + ((row.prob || 0).toExponential(3)) + '</strong></td>' +
            reviewTd +
        '</tr>';
    };
    // Phase 56.x (#2) — coverage banner when α-apportioned modes don't sum to 1.
    let _fmeaBanner = '';
    if (_fmeaActiveMode === 'piece-part') {
        const _cov = _fmeaCoverageIssues();
        if (_cov.length) _fmeaBanner = _fmeaCoverageBannerHtml(_cov);
    }
    if (typeof SLPaginate !== 'undefined' && SLPaginate.pageTbody) {
        SLPaginate.pageTbody({ key: 'fmea', tbody, rows, rowHtml: _fmeaRowHtml, prefixHtml: _fmeaBanner,
            label: (f, t, n) => 'failure modes ' + f + '–' + t + ' of ' + n + ' (current filter) — coverage checks computed over the full worksheet' });
    } else {
        tbody.innerHTML = _fmeaBanner + rows.map(_fmeaRowHtml).join('');
    }
};

const FTA_SIDEBAR_COLLAPSE_KEY = 'safetyLab.fta.sidebar.sectionsCollapsed';

const FTA_SIDEBAR_SEARCH_KEY   = 'safetyLab.fta.sidebar.searchQuery';

const _FTA_SIM_THRESHOLD = 0.5;   // raise → stricter, lower → looser. Single knob to tune.

let _ftaRepeatedLids = new Set();

let _ftaCcfMultiSel = new Set();

const _FTA_DESC_BOX_HEIGHT = 100;

const _FTA_DESC_FONT_TIERS = [
    { maxChars: 132, font: 12 },
    { maxChars: 144, font: 11 },
    { maxChars: 182, font: 10 },
    { maxChars: 203, font:  9 },
    { maxChars: Infinity, font: 8 }
];

const NODE_DRAWER_WIDTH_KEY = 'safetyLab.nodeDrawerWidth.v1';

const NODE_DRAWER_MIN_W = 340;

const _libFilterState = { search: '', group: '', source: '', category: '' };

window.createCcfGroupFromLibrary = function(key) {
    const nodes = _basicEventsUsingLibraryKey(key);
    if (nodes.length < 2) { if (typeof showToast === 'function') showToast('Need at least 2 basic events sharing this library entry to form a CCF group.', 'warning', 3500); return; }
    const def = getActiveLibrary()[key] || {};
    const groupName = 'CCF-' + key;
    const beta = 0.1;
    const ok = confirm('Create CCF group "' + groupName + '" (β = ' + beta + ') across ' + nodes.length + ' basic events that share component library entry "' + (def.name || key) + '"?\n\nThis sets ccfGroup + β on each event (γ/δ default to 0). Tune β/γ/δ per event afterward.');
    if (!ok) return;
    nodes.forEach(n => { n.ccfGroup = groupName; n.beta = beta; if (n.gamma == null) n.gamma = 0; if (n.delta == null) n.delta = 0; });
    if (typeof calculateAllProbabilities === 'function') calculateAllProbabilities();
    if (typeof updateD3 === 'function') updateD3();
    if (typeof showToast === 'function') showToast('CCF group "' + groupName + '" created on ' + nodes.length + ' shared-library basic events (β = ' + beta + ').', 'success', 4000);
};

const PRO_LICENSED_STANDARDS = new Set([
    '217Plus 2015',
    'FIDES 2022',
    'Telcordia SR-332',
    'Siemens SN 29500',
    'IEC TR 62380'
]);

let _supabaseClient = null;

let _supabaseReady = false;

let _supabaseSession = null;

let _authRestoreComplete = false;   // true once the boot-time session restore has settled

let _signInToastShown = false;      // dedupe within a page load

window.getSupabaseClient = function() { return _supabaseClient; };

window.getSupabaseSession = function() { return _supabaseSession; };

window.isSupabaseSignedIn = function() { return !!(_supabaseSession && _supabaseSession.user); };

let _rtChannel = null;

window.slWorkspaceLog = function(scope, systemId, action, summary){ _wsLog(scope, systemId, action, summary); };

let _wsActiveArea = { scope:'ac', sysId:'' };

const _WS_LOCK_VIEWS = {
    'ac-func': 'ac', 'ac-fcim': 'ac', 'ac-fha': 'ac', 'ac-req': 'ac', 'ac-asm': 'ac',
    'pra': 'ac', 'zsa': 'ac', 'cma': 'ac'
};

const ACTIVE_WS_LSKEY = 'safetyLab.activeWorkspaceId';

let _activeCloudProjectId = null;

let _activeCloudDocVersion = null;

window.onFtaSysFuncChange = function() {
    const page = ftaPages.find(p => p.id === activeFTAPageId);
    if (!page) return;
    const v = (document.getElementById('fta-sys-func') || {}).value || '';
    page._wizardSubId = v;
    _refreshSysWizard(page);
};

window.onFtaSysFcChange = function() {
    // Phase 53.35 — marker so we can confirm the fresh JS loaded. If you don't see this in the
    // browser console when picking an FC, the page is running cached JS — Cmd+Shift+R to hard
    // reload. (No new fault tree should be added to the sidebar.)
    if (typeof console !== 'undefined' && console.log) console.log('[SafetyLab] onFtaSysFcChange (Phase 53.34/35 — reusing current page)');
    const currentPage = ftaPages.find(p => p.id === activeFTAPageId);
    if (!currentPage) return;
    const fcSel = document.getElementById('fta-sys-fc');
    const internalId = fcSel ? fcSel.value : '';
    if (!internalId) return;

    // Find the FHA and resolve the most conservative variant when multiple share the same fcId.
    const sys = (systemsData || []).find(s => s.id === currentPage.systemId);
    if (!sys) return;
    // #51 — string-coerced compare: f.internalId is numeric in many projects/demos while the
    // dropdown value (internalId) is a string. Strict === silently finds nothing, so selecting an
    // FC would never link (chip stays "Unlinked", target never derives). Coerce both sides.
    const picked = (sys.fha || []).find(f => String(f.internalId) === String(internalId));
    if (!picked) return;
    const SEV_RANK = SEVERITY_RANK;   // Phase 27 refactor B5 — alias to module-scope constant.
    let fha = picked;
    (sys.fha || []).forEach(f => {
        if ((f.fcId || '') === (picked.fcId || '') && (SEV_RANK[f.severity] || 0) > (SEV_RANK[fha.severity] || 0)) {
            fha = f;
        }
    });

    // Phase 53.44 — non-destructive FC re-pick. If the page already has a developed tree
    // (children under the root), preserve them entirely and just RE-LINK the FHA — update the
    // top event's name and probability target in place, and update the page label. The user
    // is just changing which FHA seeds the top target, not abandoning their analysis. A fresh
    // top gate is only built when the page is empty.
    let page = currentPage;
    page.treeLevel = 'system';
    page.systemId = currentPage.systemId;

    const target = (typeof getSafetyTarget === 'function') ? getSafetyTarget(fha.severity) : { prob: null, dal: null };
    // Phase 56.23 — description = fcDesc only, displayId = fcId (with TOP-XXX
    // fallback if the FHA has no fcId yet).
    const newTopName = (fha.fcDesc || 'Failure condition').trim();
    const newTopDisplayId = (fha.fcId && fha.fcId.trim()) ? fha.fcId.trim() : null;
    const newPageName = (fha.fcId || 'FHA') + (fha.fcDesc ? ' — ' + fha.fcDesc.trim().slice(0, 40) : '');

    const hasChildren = !!(page.root && (
        (page.root.children && page.root.children.length > 0) ||
        (page.root._children && page.root._children.length > 0)
    ));
    let action;   // 'initialised' | 'relinked' (for the toast)
    if (!page.root) {
        // Empty page — build a fresh top OR gate seeded with the regulation target.
        const rootId = internalIdCounter++;
        page.root = {
            id: rootId,
            logicalId: rootId,
            displayId: newTopDisplayId || ('TOP-' + String(rootId).padStart(3, '0')),
            name: newTopName,
            type: 'gate',
            gateType: 'OR',
            probability: target.prob != null ? target.prob : 0,
            children: []
        };
        action = 'initialised';
    } else if (!hasChildren) {
        // Placeholder root with no children — safe to refresh in place.
        page.root.name = newTopName;
        if (newTopDisplayId) page.root.displayId = newTopDisplayId;
        page.root.probability = target.prob != null ? target.prob : page.root.probability || 0;
        action = 'initialised';
    } else {
        // Developed tree — keep the children intact, just re-seat the top target.
        page.root.name = newTopName;
        if (newTopDisplayId) page.root.displayId = newTopDisplayId;
        page.root.probability = target.prob != null ? target.prob : page.root.probability || 0;
        action = 'relinked';
    }
    page.name = newPageName;
    page.linkedFhaId = fha.internalId;

    // Drive the existing FHA-link dropdown to the chosen FHA so the toolbar (top-event target
    // panel, event-allocation panel, AC↔Sys link panel) all refresh in step.
    const linkSel = document.getElementById('fta-fha-link');
    if (linkSel) {
        const wantedValue = 'SYS_' + fha.internalId;
        if (!Array.from(linkSel.options).some(o => o.value === wantedValue)) {
            const opt = document.createElement('option');
            opt.value = wantedValue;
            opt.textContent = (fha.fcId || '#' + fha.internalId) + ': ' + (fha.fcDesc || '');
            linkSel.appendChild(opt);
        }
        linkSel.value = wantedValue;
        // Run syncFTAConfig directly so the FHA-link dropdown handler's auto-gate logic
        // doesn't fire (we've already built our own gate populated with the target rate).
        if (typeof syncFTAConfig === 'function') syncFTAConfig();
    }

    // Phase 57 — the wizard just (re)set this page's system, tree level, and FHA link; carry
    // all of that to its verification mirror so the mirror stays under the same system + FC.
    if (typeof _syncMirrorOwnershipFromSource === 'function') _syncMirrorOwnershipFromSource(page);

    if (typeof renderFTASidebar === 'function') renderFTASidebar();
    if (typeof calculateAllProbabilities === 'function') calculateAllProbabilities();
    if (typeof updateD3 === 'function') updateD3();
    if (typeof fitToScreen === 'function') fitToScreen();
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
    const probStr = target.prob != null ? target.prob.toExponential(0) + ' /FH' : 'no quantitative target';
    if (typeof showToast === 'function') showToast(
        (action === 'relinked' ? 'Re-linked to' : 'Fault tree initialized for') + ' ' + (fha.fcId || '') +
        ' (severity ' + (fha.severity || '—') + ' → top-event target ' + probStr + ').' +
        (action === 'relinked' ? ' Existing tree preserved.' : ''),
        'success', 3600
    );
};

window.integrateSelectedTransferredSubtree = function() {
    if (!selectedNodeData) return alert('Select the transferred-out gate first.');
    if (!selectedNodeData.transferOutTo) return alert('This gate has not been transferred out.');
    const flatten = confirm('Move the subtree back into this tree?\n\nClick OK to keep nested transfers nested.\nClick Cancel to abort.\n\n(Hold the Alt key when clicking the toolbar button to also flatten any nested transferred-out gates.)');
    if (!flatten) return;
    integrateTransferredSubtree(selectedNodeData.id, false);
};

window.integrateSelectedTransferredSubtreeFlatten = function() {
    if (!selectedNodeData || !selectedNodeData.transferOutTo) return;
    if (!confirm('Move the subtree back AND flatten any nested transferred-out gates?')) return;
    integrateTransferredSubtree(selectedNodeData.id, true);
};

window._gtJumpIdx = function(i){ const d = window._gtJumps[i]; if(d){ closeGoldenThreadModal(); if(typeof jumpToArtifact==='function'){ try{ jumpToArtifact(d); }catch(e){} } } };

window.openThreadFromArtifact = function(target){
    const fcs = _resolveFcsForArtifact(target);
    if(!fcs.length){ if(typeof showToast==='function') showToast('This item is not yet connected to any failure-condition thread.', 'info', 3500); return; }
    openGoldenThreadModal(fcs[0].internalId, fcs[0].domain, target);
    if(fcs.length > 1 && typeof showToast==='function') showToast('Also appears in ' + (fcs.length-1) + ' other thread' + (fcs.length-1===1?'':'s') + ': ' + fcs.slice(1).map(f=>f.fcId).join(', '), 'info', 5000);
};

window.openThreadFromSelectedNode = function(){
    if(typeof selectedNodeData==='undefined' || !selectedNodeData){ if(typeof showToast==='function') showToast('Select a node first.', 'info', 2500); return; }
    window.openThreadFromArtifact({ kind:'ftaNode', id: selectedNodeData.id, pageId: activeFTAPageId });
};

// 8 Aug 2026 — 'ph' (physical hazard) is the twelfth node kind (SL-ARC-0001
// §17.1): a CCA-found physical hazard on the thread as its own object. It
// takes its own layer between the CCA that found it and the requirements
// that control it.
const _GTV_LAYERS = ['func','sys','stpa','fc','fta','cca','ph','ip','req','vv'];

const _GTV_LNAME  = { func:'Function', sys:'System', stpa:'STPA', fc:'Failure condition', fta:'Fault tree', cca:'Common cause', ph:'Physical hazard', ip:'Independence', req:'Requirement', vv:'Verification', ram:'Reliability', hf:'Human factors' };

const _GTV_COLOR  = { func:'#2E6FB0', sys:'#1D9E75', stpa:'#6D28D9', fc:'#7F77DD', fta:'#D85A30', cca:'#BA7517', ph:'#A8552E', ip:'#0E7490', req:'#D4537E', vv:'#639922', ram:'#C88A00', hf:'#7A3EA8' };

const _GTV_FLAGC  = { compromised:'#E2524A', obsolete:'#6B7280', stale:'#E0A53A' };

const _GTV_FLAGM  = { compromised:'⚠ ', obsolete:'⊘ ', stale:'↻ ' };

let _gtvEcoEscHandler = null;

let _gtvOnlyFlagged = false;

let _reconcilePendingPairs = null;

const _autoReqFilterState = { 'ac': 'all', 'sys': 'all' };

let _aiBusy = { n: 0, el: null, label: '', t0: 0, tick: null, quip: 0 };   // Phase 66.14 — t0/tick drive the elapsed clock, quip the rotating line

let _slModalScanQueued = false;

const AUTOSAVE_KEY = 'safetyLab.autosave.v1';

const AUTOSAVE_META_KEY = 'safetyLab.autosave.meta.v1';

// E1 part 3 (26 Aug 2026) — THE LAST GOOD SNAPSHOT, kept beside the current one.
// Parts 1+2 stop an EMPTY snapshot from destroying a good one. They do nothing
// about content→content: a project that loses most of its rows and then saves
// over itself is still gone, because the result passes _autosaveHasContent.
// This slot is the answer, and it is THROTTLED rather than written per save —
// mirroring every autosave would double the write cost of a 4.5 MB project for
// a case that is rarer than the one already fixed. Two minutes of exposure in
// exchange for no measurable cost is the trade being made here, deliberately.
const LASTGOOD_KEY = 'safetyLab.autosave.lastgood.v1';

const LASTGOOD_META_KEY = 'safetyLab.autosave.lastgood.meta.v1';

const LASTGOOD_MIN_INTERVAL_MS = 120000;   // at most one last-good write every 2 minutes

let _lastgoodLastWrite = 0;

let _autosaveDebounceTimer = null;

let _autosaveLastDiskWrite = 0;          // Phase 56.52a — last successful disk write-through

let _autosaveDiskWriteInFlight = false;  // Phase 56.52a — prevent overlapping disk writes

let _autosaveDiskAvailable = null;       // Phase 56.52a — tri-state: null=unknown, true=have handle, false=no handle

let _autosaveMaxWaitTimer = null;

let _autosavePending = false;     // true between an edit and its debounced write — drives flush-on-exit
let _autosaveFlushQueued = false; // 2 Sep 2026 — per-change save: one queued microtask coalesces a synchronous burst into a single write

let _autosaveSuspended = false;   // suspend during project load / sample load to avoid clobbering

// E1 (26 Aug 2026) — the recovery window. See checkAutosaveRecovery in
// data_ops_modules.js for the incident these guard against. Kept SEPARATE from
// _autosaveSuspended on purpose: this pair refuses one specific write — an empty
// snapshot over a stored one that has content, during boot recovery — and can
// therefore never strand autosave the way a general suspend can.
let _autosaveRecoveryPending = false;      // true from checkAutosaveRecovery() entry until it resolves
let _autosaveRecoveryTimer = null;         // backstop that closes the window if recovery never settles
let _autosaveStoredHasContent = null;      // tri-state: null = not yet known, else _autosaveHasContent(stored)
// #2Sep2026 BOOT DURABILITY — false from page load until boot recovery has RUN
// (checkAutosaveRecovery resolved, via _recoveryHoldEnd). While false, an EMPTY
// autosave snapshot is refused outright (see _writeAutosave). The E1 pair above
// only guards the window that OPENS when checkAutosaveRecovery starts; a blank
// write can fire EARLIER in boot (a module-init / DOMContentLoaded autosave,
// especially now that scheduleAutosave flushes on a microtask, not a 2s debounce)
// and destroy the stored copy recovery is about to read. An empty snapshot has
// nothing worth persisting, so refusing it until recovery has run cannot lose
// data, and it protects BOTH stores — covering the large / IndexedDB-only case a
// synchronous localStorage content check would miss.
let _bootRecoveryHasRun = false;

const _PROJECT_SIZE_WARN_BYTES = 4500000;    // ~4.5 MB — near the practical localStorage mirror limit

const _PROJECT_SIZE_CRIT_BYTES = 9000000;    // ~9 MB — large even for an IndexedDB-backed UI

const _PROJECT_ROWS_WARN = 40000;            // soft advisory on total row/node count (perf)

let _projectHealthLast = '';

let _projectHealthLastWarnAt = 0;

const _BUNDLE_MAP = {
    'project.json':   ['projectName','_betaBuild','activeSystemId','activeFTAPageId','internalIdCounter','typeCounters','acAsmCounter','fmeaCounter','reviewCounter','ftaConfig','projectConfig','flightPhasesData','autoReqTemplateOverrides','projectReportEdits'],
    'aircraft.json':  ['acFunctionsData','acFcimData','acExtractedFCs','acFhaData','acReqData','acAssumptionsData'],
    'cca.json':       ['praData','zsaData','cmaData','routingData','resourcesData'],
    'fmea.json':      ['fmeaData','itemsData'],
    'review.json':    ['reviewCommentsData','reviewApprovalsData'],
    'baselines.json': ['projectBaselines'],
    'ai.json':        ['projectSourceDocs','aiAssumptions']
};

const _SL_SAVE_VIEWS = ['view-ac-func','view-ac-fcim','view-ac-fha','view-ac-req','view-ac-asm','view-pra','view-zsa','view-cma','view-fmea','view-items','view-phases','view-resources','view-routing','view-markov','ws-view-func','ws-view-fcim','ws-view-fha','ws-view-req','ws-view-asm'];

// 23 Aug 2026 (3) — _WF_STEPS REMOVED with the strip (Waqas: "remove the
// pills we have the vertical nav options"). The reconciled stage map lived
// here for one day; its anti-drift value (spine vs rail agreement) died with
// the spine. _renderWorkflowStepper survives as a residue-clearing no-op.

const _GS_SEEN_KEY = 'safetyLab.gettingStarted.dismissed.v1';

let _ftaSearchHits = [];

let _ftaSearchIdx = 0;

let _ftaSearchHitsQuery = null;

const _EMPTY_STATE_MAP = {
    'ac-func-body':  'No aircraft functions yet — add one above to start the ARP 4754A functional breakdown, or open ✦ ANEM to draft them.',
    'ac-fha-body':   'No aircraft failure conditions yet — log one above, import via Data Actions, or open ✦ ANEM to draft them from your functions.',
    'sys-func-body': 'No system functions yet — add functions to begin this system’s breakdown.',
    'sys-fha-body':  'No system failure conditions yet — log one above, or use ✦ ANEM to draft them from the function list.',
    'pra-body':      'No particular-risk models yet — add a PRA model to assess external / common threats.',
    'zsa-body':      'No zonal entries yet — add a zone to begin the Zonal Safety Analysis.',
    'cma-body':      'No common-mode entries yet — add one to begin the Common-Mode Analysis.',
    'item-body':     'No items / LRUs yet — add items to map them to functions and failure modes.'
};

const UNDO_LIMIT = 50;

let _undoStack = [];

let _redoStack = [];

let _undoSuspended = false;

let _lastUndoSnap = '';

let _undoCoalesceTimer = null;

const WELCOME_KEY = 'safetyLab.welcomeSeen.v1';

let _helpModeActive = false;

let _jspdfLoading = null;

let _xlsxLoading = null;

let _benchmarkResults = null;       // populated after runAllBenchmarks()

let _benchIdSeed = 50000;

const BENCHMARKS = [
    // ---- Static fault tree algebra ----
    {
        id: 'B01-and-2', category: 'Static FTA',
        name: 'AND gate, 2 independent events',
        source: "Vesely et al., Fault Tree Handbook (NUREG-0492, 1981), §IV.4",
        citation: 'P(A ∧ B) = P(A) · P(B) for independent events',
        expected: 0.02, tolerance: 1e-12,
        run: () => {
            const A = _mkLeaf({ probability: 0.1 });
            const B = _mkLeaf({ probability: 0.2 });
            const root = _mkGate('AND', [A, B]);
            BDD.reset();
            const r = computeExactProbability(root);
            return { computed: r.prob };
        }
    },
    {
        id: 'B02-or-2', category: 'Static FTA',
        name: 'OR gate, 2 independent events',
        source: "Vesely et al., Fault Tree Handbook (NUREG-0492, 1981), §IV.4",
        citation: 'P(A ∨ B) = 1 − (1−P(A))(1−P(B))',
        expected: 0.28, tolerance: 1e-12,
        run: () => {
            const A = _mkLeaf({ probability: 0.1 });
            const B = _mkLeaf({ probability: 0.2 });
            const root = _mkGate('OR', [A, B]);
            BDD.reset();
            const r = computeExactProbability(root);
            return { computed: r.prob };
        }
    },
    {
        id: 'B03-or-3', category: 'Static FTA',
        name: 'OR gate, 3 independent events',
        source: "Andrews & Moss, Reliability and Risk Assessment (2nd ed., 2002), §4.3",
        citation: 'P(A ∨ B ∨ C) = 1 − ∏(1 − P(Xi))',
        expected: 0.271, tolerance: 1e-9,
        run: () => {
            const A = _mkLeaf({ probability: 0.1 });
            const B = _mkLeaf({ probability: 0.1 });
            const C = _mkLeaf({ probability: 0.1 });
            const root = _mkGate('OR', [A, B, C]);
            BDD.reset();
            const r = computeExactProbability(root);
            return { computed: r.prob };   // = 1 − 0.9^3 = 0.271
        }
    },
    {
        id: 'B04-voting-2of3', category: 'Static FTA',
        name: 'k-of-n VOTING, 2-of-3',
        source: "Vesely et al., Fault Tree Handbook (NUREG-0492, 1981), §IV.6",
        citation: 'P(2-of-3) = 3p²(1−p) + p³ = 0.028',
        expected: 0.028, tolerance: 1e-10,
        run: () => {
            const a = _mkLeaf({ probability: 0.1 });
            const b = _mkLeaf({ probability: 0.1 });
            const c = _mkLeaf({ probability: 0.1 });
            const root = _mkGate('VOTING', [a, b, c], { votingK: 2 });
            BDD.reset();
            const r = computeExactProbability(root);
            return { computed: r.prob };
        }
    },
    {
        id: 'B05-bdd-repeated', category: 'BDD-exact',
        name: 'BDD exact P(top) with repeated event',
        source: "Bryant, IEEE Trans. Computers (1986); Vesely §V.3",
        citation: 'Tree (A ∧ B) ∨ (A ∧ C), A repeated → P = P(A)·[1−(1−P(B))(1−P(C))]',
        expected: 0.044, tolerance: 1e-9,
        run: () => {
            const lidA = 99001;
            const A1 = _mkLeaf({ probability: 0.1, logicalId: lidA });
            const A2 = _mkLeaf({ probability: 0.1, logicalId: lidA });
            const B = _mkLeaf({ probability: 0.2 });
            const C = _mkLeaf({ probability: 0.3 });
            const root = _mkGate('OR', [
                _mkGate('AND', [A1, B]),
                _mkGate('AND', [A2, C])
            ]);
            BDD.reset();
            const r = computeExactProbability(root);
            return { computed: r.prob };
        }
    },
    {
        id: 'B06-mcs-vs-bdd', category: 'BDD-exact',
        name: 'MCS upper bound > BDD exact (repeated events)',
        source: "Vesely §V.3; MCS bound is exact only under rare-event approx",
        citation: 'MCS sum = P(A)·P(B) + P(A)·P(C) = 0.05; BDD exact = 0.044',
        expected: 0.05, tolerance: 1e-9,
        run: () => {
            // MCS upper bound: Σ P(cutset_i) over the minimal cutsets
            const PA = 0.1, PB = 0.2, PC = 0.3;
            const mcs = PA * PB + PA * PC;
            return { computed: mcs, detail: 'MCS bound = P(A·B) + P(A·C) = ' + (PA*PB).toFixed(4) + ' + ' + (PA*PC).toFixed(4) };
        }
    },

    // ---- Importance measures ----
    {
        id: 'B07-birnbaum', category: 'Importance',
        name: 'Birnbaum importance of repeated event A',
        source: "Vesely et al., NUREG-0492, §VIII.3 (importance measures)",
        citation: 'I_B(A) = P(top | A=1) − P(top | A=0). For (A∧B)∨(A∧C): 1−(1−B)(1−C) − 0 = 0.44',
        expected: 0.44, tolerance: 1e-6,
        run: () => {
            const lidA = 99002;
            const A1 = _mkLeaf({ probability: 0.1, logicalId: lidA });
            const A2 = _mkLeaf({ probability: 0.1, logicalId: lidA });
            const B = _mkLeaf({ probability: 0.2 });
            const C = _mkLeaf({ probability: 0.3 });
            const root = _mkGate('OR', [_mkGate('AND', [A1, B]), _mkGate('AND', [A2, C])]);
            BDD.reset();
            const im = computeImportanceMeasures(root);
            const aMeasure = (im.measures || []).find(x => x.node && x.node.logicalId === lidA);
            return { computed: aMeasure ? aMeasure.birnbaum : 0 };
        }
    },
    {
        id: 'B08-fv', category: 'Importance',
        name: 'Fussell–Vesely importance of event A',
        source: "Fussell & Vesely (1972); Vesely §VIII.3",
        citation: 'FV(A) = (P_top − P(top | A=0)) / P_top = 1.0 — A is in every cutset',
        expected: 1.0, tolerance: 1e-9,
        run: () => {
            const lidA = 99003;
            const A1 = _mkLeaf({ probability: 0.1, logicalId: lidA });
            const A2 = _mkLeaf({ probability: 0.1, logicalId: lidA });
            const B = _mkLeaf({ probability: 0.2 });
            const C = _mkLeaf({ probability: 0.3 });
            const root = _mkGate('OR', [_mkGate('AND', [A1, B]), _mkGate('AND', [A2, C])]);
            BDD.reset();
            const im = computeImportanceMeasures(root);
            const aMeasure = (im.measures || []).find(x => x.node && x.node.logicalId === lidA);
            return { computed: aMeasure ? aMeasure.fv : 0 };
        }
    },

    // ---- CCF (β-factor and MGL) ----
    {
        id: 'B09-beta-ccf', category: 'CCF',
        name: 'β-factor CCF, 2-component group',
        source: "NUREG/CR-5485 (Mosleh et al., 1998), §3.2",
        citation: 'P(D∧E) with β=0.1, q=0.01 = β·q + (1−β)²·q² = 1.081e-3',
        expected: 1.081e-3, tolerance: 1e-9,
        run: () => {
            const beta = 0.1, q = 0.01;
            // Exact closed-form for 2 components in a β-factor CCF group
            const p = beta * q + (1 - beta) * (1 - beta) * q * q;
            return { computed: p, detail: 'closed-form via β-factor decomposition' };
        }
    },
    {
        id: 'B10-mgl-ccf', category: 'CCF',
        name: 'MGL CCF probabilities, 3-component group',
        source: "NUREG/CR-5485, §3.3 (Multiple Greek Letter)",
        citation: 'β=0.05, γ=0.5, q=0.01 → P_3of3_CCF = q·β·γ = 2.5e-4',
        expected: 2.5e-4, tolerance: 1e-9,
        run: () => {
            const beta = 0.05, gamma = 0.5, q = 0.01;
            // P(3-of-3 CCF) = q · β · γ (in MGL with δ=0)
            const p = q * beta * gamma;
            return { computed: p, detail: 'P_3of3 = q · β · γ' };
        }
    },
    {
        id: 'B09e-beta-ccf-engine', category: 'CCF',
        name: 'β-factor CCF through the engine (end-to-end)',
        source: "NUREG/CR-5485 (Mosleh et al., 1998), §3.2 — engine-exercised",
        citation: 'Real β-group built and run through computeExactProbability. Engine is exact: β·q + (1−β·q)·((1−β)q)² = 1.080919e-3 (the textbook β·q+(1−β)²q² = 1.081e-3 is a rare-event approximation that drops the (1−βq) overlap factor).',
        expected: 1.080919e-3, tolerance: 1e-9,
        run: () => {
            // Build an ACTUAL 2-member β-factor CCF group and route it through the BDD engine.
            const D = _mkLeaf({ probability: 0.01, ccfGroup: 'CCF-DE', beta: 0.1, name: 'Pump D' });
            const E = _mkLeaf({ probability: 0.01, ccfGroup: 'CCF-DE', beta: 0.1, name: 'Pump E' });
            const root = _mkGate('AND', [D, E]);
            BDD.reset();
            const r = computeExactProbability(root);
            return { computed: r.prob, detail: 'engine BDD over indep var q(1−β)=0.009 ×2 + shared tier-2 var q·β=0.001' };
        }
    },
    {
        id: 'B10e-mgl-ccf-engine', category: 'CCF',
        name: 'MGL CCF through the engine (end-to-end)',
        source: "NUREG/CR-5485, §3.3 (Multiple Greek Letter) — engine-exercised",
        citation: 'Real β/γ MGL group (β=0.05, γ=0.5, q=0.01), 3 members AND-ed, run through computeExactProbability. Exact engine value = P(g2∨g3) + (1−P(g2∨g3))·((1−β)q)³ = 5.007944e-4.',
        expected: 5.007944463661e-4, tolerance: 1e-9,
        run: () => {
            // Build an ACTUAL 3-member MGL CCF group (β, γ tiers) and route it through the engine.
            const D = _mkLeaf({ probability: 0.01, ccfGroup: 'CCF-DEF', beta: 0.05, gamma: 0.5, name: 'Valve D' });
            const E = _mkLeaf({ probability: 0.01, ccfGroup: 'CCF-DEF', beta: 0.05, gamma: 0.5, name: 'Valve E' });
            const F = _mkLeaf({ probability: 0.01, ccfGroup: 'CCF-DEF', beta: 0.05, gamma: 0.5, name: 'Valve F' });
            const root = _mkGate('AND', [D, E, F]);
            BDD.reset();
            const r = computeExactProbability(root);
            return { computed: r.prob, detail: 'engine BDD: indep q(1−β)=0.0095 ×3 + shared tier-2 q·β·(1−γ)=2.5e-4 + tier-3 q·β·γ=2.5e-4' };
        }
    },

    // ---- Markov ----
    {
        id: 'B11-markov-2state', category: 'Markov',
        name: '2-state Markov (closed form)',
        source: "Andrews & Moss (2002) §7.2; Trivedi (2002) §8.2",
        citation: 'π_F = λ/(λ+μ). λ=1e-3, μ=1e-1 → π_F = 1/101 ≈ 9.901e-3',
        expected: 9.901e-3, tolerance: 1e-6,
        run: () => {
            // solveMarkovModel keys transitions by state.name, so from/to must match `name` exactly.
            const model = {
                states: [{ name: 'Working', isFailed: false }, { name: 'Failed', isFailed: true }],
                transitions: [{ from: 'Working', to: 'Failed', rate: 1e-3 }, { from: 'Failed', to: 'Working', rate: 1e-1 }]
            };
            const sol = solveMarkovModel(model);
            return { computed: sol.pFailed, detail: 'π = [' + sol.pi.map(p => p.toFixed(6)).join(', ') + ']' };
        }
    },
    {
        id: 'B12-markov-3state', category: 'Markov',
        name: '3-state degraded-mode Markov (closed form)',
        source: "Trivedi (2002) §8.3; Andrews & Moss §7.4",
        citation: 'States W→D→F→W. Rates [1e-4, 1e-3, 1e-2]. π_F = 1/111 ≈ 9.009e-3',
        expected: 9.009009e-3, tolerance: 1e-6,
        run: () => {
            const model = {
                states: [
                    { name: 'Working',  isFailed: false },
                    { name: 'Degraded', isFailed: false },
                    { name: 'Failed',   isFailed: true  }
                ],
                transitions: [
                    { from: 'Working',  to: 'Degraded', rate: 1e-4 },
                    { from: 'Degraded', to: 'Failed',   rate: 1e-3 },
                    { from: 'Failed',   to: 'Working',  rate: 1e-2 }
                ]
            };
            const sol = solveMarkovModel(model);
            return { computed: sol.pFailed, detail: 'π = [' + sol.pi.map(p => p.toFixed(6)).join(', ') + ']' };
        }
    },

    // ---- Phase-of-flight λ weighting ----
    {
        id: 'B13-phase-lambda', category: 'Phase-of-flight',
        name: 'Time-weighted λ across two phases',
        source: "AC 25.1309-1B §7.6.1 / App. F.3.3 (phase-dependent rates); Boeing safety analysis practice",
        citation: 'λ_eff = Σ(λ_i · t_i) / Σ(t_i). Takeoff 2 min @ 1e-2 + Cruise 4 hr @ 5e-4 → 5.7851e-4',
        expected: 5.7851e-4, tolerance: 1e-3,
        run: () => {
            // Closed-form: weight by duration. Convert takeoff 2 min = 1/30 hr.
            const tT = 1/30, lT = 1e-2;
            const tC = 4,    lC = 5e-4;
            const eff = (lT * tT + lC * tC) / (tT + tC);
            return { computed: eff };
        }
    },

    // ---- Stress prediction (Arrhenius) ----
    {
        id: 'B14-arrhenius-pi-t', category: 'Stress prediction',
        name: 'Arrhenius π_T at Tj = 75 °C, Ea = 0.4 eV',
        source: "MIL-HDBK-217F N2 §5.1; π_T = exp(−Ea/k · (1/Tj − 1/T_ref))",
        citation: 'k = 8.617e-5 eV/K, T_ref = 298.15 K. Closed-form ≈ 9.356',
        expected: 9.356, tolerance: 1e-3,
        run: () => {
            return { computed: computePiT(75, 0.4) };
        }
    },
    {
        id: 'B15-effective-lambda', category: 'Stress prediction',
        name: 'Effective λ with π_E × π_Q × π_T',
        source: "MIL-HDBK-217F N2 §5.1 stress-adjusted prediction",
        citation: 'Digital MOS IC: λ_b=5e-7, AIC env (π_E=4), B2 qual (π_Q=1), Tj=75°C → λ_eff ≈ 1.871e-5',
        expected: 1.871e-5, tolerance: 1e-3,
        run: () => {
            // Save + temporarily set project config, compute, restore.
            const saved = { std: projectConfig.libraryStandard, env: projectConfig.libraryEnv,
                            qual: projectConfig.libraryQuality, stress: projectConfig.useStressPrediction,
                            Tj: projectConfig.operatingTempC, Ea: projectConfig.activationEnergyEv };
            projectConfig.libraryStandard = 'MIL-HDBK-217F';
            projectConfig.libraryEnv = 'AIC';
            projectConfig.libraryQuality = 'B2';
            projectConfig.useStressPrediction = true;
            projectConfig.operatingTempC = 75;
            projectConfig.activationEnergyEv = 0.4;
            const entry = COMPONENT_LIBRARY['mil217_ic_dig_mos'];
            const eff = effectiveLambdaForLibraryEntry(entry);
            // restore
            projectConfig.libraryStandard = saved.std; projectConfig.libraryEnv = saved.env;
            projectConfig.libraryQuality = saved.qual; projectConfig.useStressPrediction = saved.stress;
            projectConfig.operatingTempC = saved.Tj; projectConfig.activationEnergyEv = saved.Ea;
            return { computed: eff, detail: 'π_E·π_Q·π_T = 4 · 1 · 9.356 = 37.42 applied to λ_b=5e-7' };
        }
    },

    // ---- Uncertainty propagation ----
    {
        id: 'B16-lognormal-uncertainty', category: 'Uncertainty',
        name: 'Lognormal uncertainty MC mean',
        source: "Apostolakis (1990); Stamatelatos NUREG-1855 §6",
        citation: 'λ ~ LN(median=1e-5, EF=3). σ = ln(3)/1.645. Analytic mean ≈ λ_median · exp(σ²/2)',
        expected: 1.204e-5, tolerance: 0.05,  // 5% relative tolerance for MC
        run: () => {
            // Closed-form: lognormal mean = exp(μ + σ²/2) where μ = ln(median), σ = ln(EF)/1.645
            const median = 1e-5, EF = 3;
            const sigma = Math.log(EF) / 1.645;
            const mu = Math.log(median);
            const analyticMean = Math.exp(mu + 0.5 * sigma * sigma);
            return { computed: analyticMean, detail: 'σ = ln(3)/1.645 ≈ ' + sigma.toFixed(4) + '; closed form, not MC' };
        }
    },

    // ---- DFT Monte Carlo ----
    {
        id: 'B17-pand-mc', category: 'Dynamic FTA',
        name: 'PAND(X, Y) probability (MC vs closed form)',
        source: "Čepin & Mavko (2002), Reliability Engineering & System Safety §76",
        citation: 'PAND with λ_X=0.1, λ_Y=0.1, t=1, t=1. P = ∫₀ᵗ λ·e^(-λs) · (1 − e^(-λ(t−s))) ds ≈ 0.00468',
        expected: 0.00468, tolerance: 0.1,   // 10% relative tolerance for MC
        run: () => {
            const X = _mkLeaf({ lambda: 0.1, displayId: 'X' });
            const Y = _mkLeaf({ lambda: 0.1, displayId: 'Y' });
            const root = _mkGate('PAND', [X, Y]);
            // Phase 63.3 — 400k trials: at p≈0.0047 the MC σ is ~1.1e-4 (≈2.3% rel),
            // so the 10% tolerance sits at >4σ and the benchmark stops flaking.
            const out = simulateDFT(root, 1, 400000);
            return { computed: out.p, detail: 'Empirical from ' + (out.N || 0) + ' MC trials, SE ≈ ' + (out.stderr || 0).toExponential(2) + ', seed ' + out.seed + ' (reproducible)' };
        }
    },

    // ---- DALgebra (ARP4761A App P Table P2, under ARP4754B §5.2) ----
    //
    // ARP4754B assigns FDAL/IDAL but defers the ASSIGNMENT PROCESS to ARP4761A;
    // the options table itself is App P Table P2. The old ARP4754A (2010)
    // §5.4.1.x numbering is kept inside each citation as provenance — it is where
    // these cases came from, not what they claim.
    //
    // RESOLVED — the engine is correct; the LABEL was wrong. The Option-2 case was
    // read as proving the allocator decrements a DAL with no independence claim.
    // It does not. The gating lives in allocateDAL (support_modules.js), which
    // refuses the reduction when the independence state is 'none' and 'compromised'
    // — the allocator defaults to PROVISIONAL, not to unconditional. What was wrong
    // was this test's own description of what it was demonstrating.
    {
        id: 'B18-dalgebra-opt2', category: 'DALgebra',
        name: 'DALgebra Option 2 — AND gate decrement (under a provisional independence claim)',
        source: "SAE ARP4761A App P Table P2 Option 2, under ARP4754B §5.2 principles (was ARP4754A (2010) §5.4.1.2)",
        citation: 'Top DAL A → two members at B per Table P2 Option 2; the reduction is permitted only behind a functional-independence claim (App P step f), which the allocator defaults to as PROVISIONAL',
        expected: 'B', tolerance: 0,
        run: () => {
            // Build a tiny tree where DAL allocation runs and we inspect a child's allocated DAL.
            const child = _mkLeaf({ type: 'undeveloped', allocatedDAL: null });
            const root = _mkGate('AND', [child, _mkLeaf()], { dalOption: 'opt2' });
            // Run allocator (it mutates allocatedDAL on each child).
            allocateDAL(root, 'A', new Set());
            return { computed: child.allocatedDAL, isExact: true };
        }
    },
    {
        id: 'B19-dalgebra-opt1', category: 'DALgebra',
        name: 'DALgebra Option 1 — carrier + independence claim',
        source: "SAE ARP4761A App P Table P2 Option 1, under ARP4754B §5.2 principles (was ARP4754A (2010) §5.4.1.1)",
        citation: 'Top DAL A, carrier child = A, sibling = C (two levels down)',
        expected: 'A,C', tolerance: 0,
        run: () => {
            const carrier = _mkLeaf({ type: 'undeveloped', allocatedDAL: null });
            const sibling = _mkLeaf({ type: 'undeveloped', allocatedDAL: null });
            const root = _mkGate('AND', [carrier, sibling], { dalOption: 'opt1', dalCarrierChildId: carrier.id });
            allocateDAL(root, 'A', new Set());
            return { computed: carrier.allocatedDAL + ',' + sibling.allocatedDAL, isExact: true };
        }
    },

    // ---- Safety target lookups ----
    {
        id: 'B20-targets-part25', category: 'Safety targets',
        name: 'Part 25 Catastrophic → P ≤ 1e-9, DAL A',
        source: "AC 25.1309-1B §3.3.1 / Table 4-1 (Boeing, Airbus practice)",
        citation: 'Catastrophic in Part 25 → quantitative target 1e-9/FH, FDAL A',
        expected: '1e-9,A', tolerance: 0,
        run: () => {
            const saved = projectConfig.regulation;
            projectConfig.regulation = 'Part 25';
            const t = getSafetyTarget('Catastrophic');
            projectConfig.regulation = saved;
            return { computed: t.prob.toExponential(0) + ',' + t.dal, isExact: true };
        }
    },

    // ---- Phase 61 locking benchmarks — probability-only allocation ----
    {
        id: 'B21-alloc-inhibit-roundtrip', category: 'Allocation round-trip',
        name: 'Top-down INHIBIT apportionment closes bottom-up (product-inverse)',
        source: "Vesely et al., NUREG-0492 §VII (INHIBIT quantifies as AND); ARP4761A allocation round-trip",
        citation: 'INHIBIT reconstructs as Π pᵢ, so apportionment must satisfy Π childTarget = T. Each of 2 children gets √T.',
        expected: 1e-6, tolerance: 1e-9,
        run: () => {
            const a = _mkLeaf(), b = _mkLeaf();
            const root = _mkGate('INHIBIT', [a, b]);
            allocateTopDown(root, 1e-6, 'equal', new Set());
            const rec = calcBottomUp(root, new Set());
            return { computed: rec, detail: 'child budgets = ' + a.probability.toExponential(3) + ' each; product reconstructs the target' };
        }
    },
    {
        id: 'B22-alloc-probability-only', category: 'Allocation round-trip',
        name: 'Allocation is probability-only: no λ written, budget closes exactly',
        source: "Phase 61 design contract — allocation distributes probability; λ is verification-side",
        citation: 'After allocateTopDown, leaves carry P budgets and NO λ; AND of 2 children reconstructs T exactly.',
        expected: 1e-6, tolerance: 1e-12,
        run: () => {
            const a = _mkLeaf(), b = _mkLeaf();
            const root = _mkGate('AND', [a, b]);
            allocateTopDown(root, 1e-6, 'equal', new Set());
            const lambdaFree = (a.lambda === undefined) && (b.lambda === undefined) && (root.lambda === undefined);
            const rec = calcBottomUp(root, new Set());
            return { computed: lambdaFree ? rec : NaN,
                     detail: lambdaFree ? 'no λ on any allocation node ✓' : 'FAIL: λ found on an allocation node' };
        }
    },
    {
        id: 'B23-ccf-uncertainty-consistency', category: 'Uncertainty',
        name: 'CCF tree: uncertainty median matches BDD-exact point estimate',
        source: "NUREG/CR-5485 (MGL splits); consistency of sampled vs analytic quantification",
        citation: 'AND of 2 members, q=1e-3, β=0.1: P = (q(1−β))² + qβ − cross ≈ 1.0081e-4. With EF=1 the sampled median must equal BDD-exact.',
        expected: 1, tolerance: 1e-6,
        run: () => {
            const tExp = (typeof ftaConfig === 'object' && ftaConfig && ftaConfig.exposureTime) ? ftaConfig.exposureTime : 1;
            const lam = -Math.log1p(-0.001) / tExp;   // λ such that q reconstructs to exactly 1e-3
            const a = _mkLeaf({ probability: 0.001, lambda: lam, ccfGroup: '_bench_ccf', beta: 0.1 });
            const b = _mkLeaf({ probability: 0.001, lambda: lam, ccfGroup: '_bench_ccf', beta: 0.1 });
            const root = _mkGate('AND', [a, b]);
            BDD.reset();
            const exact = computeExactProbability(root).prob;
            const unc = runUncertaintyAnalysis(root, 64);   // EF=1 → deterministic samples
            return { computed: exact > 0 ? unc.median / exact : 0,
                     detail: 'BDD-exact = ' + exact.toExponential(4) + ' · uncertainty median = ' + unc.median.toExponential(4) };
        }
    }
];

window.openBetaFeedback = function() {
    const subject = 'Safety Lab Aero Beta — Feedback — ' + BETA_BUILD_ID;
    const body =
        'Build: ' + BETA_BUILD_ID + '\n' +
        'Tester: ' + BETA_TESTER_LABEL + '\n' +
        'Timestamp: ' + new Date().toISOString() + '\n' +
        'Page: ' + (typeof location !== 'undefined' ? location.href : '(unknown)') + '\n' +
        '\n' +
        '— Describe the issue or suggestion below this line —\n\n';
    const mailto = 'mailto:' + BETA_FEEDBACK_EMAIL +
        '?subject=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent(body);
    if (typeof window !== 'undefined' && window.open) window.open(mailto, '_blank');
};

let _backrefTarget = null;

let _backrefActiveTab = 'refs';   // 'refs' | 'history'

window.openBackrefPanel = function(target, displayLabel, opts) {
    if (typeof Traceability === 'undefined') return;
    _backrefTarget = target;
    const panel = document.getElementById('backref-panel');
    const scrim = document.getElementById('backref-scrim');
    const tabsEl = document.getElementById('backref-tabs');
    if (!panel) return;

    const titleEl    = document.getElementById('backref-title');
    const eyebrowEl  = document.getElementById('backref-eyebrow');
    if (titleEl)    titleEl.textContent    = displayLabel || (Traceability.KIND_LABELS[target.kind] || 'Artifact');
    if (eyebrowEl)  eyebrowEl.textContent  = 'Traces to / Used by · ' + (Traceability.KIND_LABELS[target.kind] || target.kind);

    // Tabs only show for requirements (where history is available).
    const showTabs = (target.kind === 'acReq' || target.kind === 'sysReq');
    if (tabsEl) tabsEl.style.display = showTabs ? '' : 'none';
    _backrefActiveTab = (opts && opts.tab) ? opts.tab : 'refs';
    if (showTabs) {
        Array.from(tabsEl.querySelectorAll('.backref-tab')).forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-backref-tab') === _backrefActiveTab);
        });
    } else {
        _backrefActiveTab = 'refs';
    }
    _renderBackrefBody();

    panel.classList.add('show');
    panel.setAttribute('aria-hidden', 'false');
    if (scrim) scrim.classList.add('show');
};

window.openReqHistoryPanel = function(internalId, scopeKind) {
    const kind = scopeKind === 'ac' ? 'acReq' : 'sysReq';
    const target = { kind: kind, id: internalId };
    if (scopeKind === 'sys') target.systemId = (typeof activeSystemId !== 'undefined') ? activeSystemId : null;
    // Use the req's traceId as the display label.
    let label = 'Requirement';
    const found = (typeof findReqAnyScope === 'function') ? findReqAnyScope(internalId) : null;
    if (found && found.req) label = (found.req.traceId ? found.req.traceId + ' — ' : '') + ((found.req.text || '').slice(0, 60));
    openBackrefPanel(target, label, { tab: 'history' });
};

window.switchBackrefTab = function(tab) {
    _backrefActiveTab = tab;
    const tabsEl = document.getElementById('backref-tabs');
    if (tabsEl) {
        Array.from(tabsEl.querySelectorAll('.backref-tab')).forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-backref-tab') === tab);
        });
    }
    _renderBackrefBody();
};

window.closeBackrefPanel = function() {
    const panel = document.getElementById('backref-panel');
    const scrim = document.getElementById('backref-scrim');
    if (panel) {
        panel.classList.remove('show');
        panel.setAttribute('aria-hidden', 'true');
    }
    if (scrim) scrim.classList.remove('show');
    _backrefTarget = null;
};

window.jumpToArtifact = function(descriptor) {
    if (!descriptor) return;
    closeBackrefPanel();
    closeCmdPalette();
    const { kind, id, tab, systemId, sysSubtab } = descriptor;

    // Sys-scoped jumps: enter system workspace first, then switch sub-tab.
    if (tab === 'sys-workspace' && systemId) {
        if (typeof openSystemWorkspace === 'function') openSystemWorkspace(systemId);
        // Map kind → workspace sub-tab.
        const sub = sysSubtab
            ? sysSubtab.replace(/^sys-/, '')
            : ({ sysFunc: 'func', sysFcim: 'fcim', sysFha: 'fha', sysReq: 'req', sysAsm: 'asm' }[kind] || 'func');
        if (typeof switchWorkspaceTab === 'function') setTimeout(() => switchWorkspaceTab(sub), 30);
    } else if (tab === 'fta' && kind === 'ftaPage') {
        if (typeof switchTab === 'function') switchTab('fta');
        if (typeof window !== 'undefined') window.activeFTAPageId = id;
        if (typeof renderFTASidebar === 'function') renderFTASidebar();
        if (typeof updateD3 === 'function') updateD3();
    } else if (tab === 'fta' && kind === 'ftaNode') {
        if (typeof switchTab === 'function') switchTab('fta');
        // Walk pages to find which one owns this node.
        if (typeof ftaPages !== 'undefined' && typeof findNode === 'function') {
            for (const page of ftaPages) {
                if (findNode(page.root, id)) { window.activeFTAPageId = page.id; break; }
            }
        }
        if (typeof renderFTASidebar === 'function') renderFTASidebar();
        if (typeof updateD3 === 'function') updateD3();
    } else {
        if (typeof switchTab === 'function') switchTab(tab);
    }

    // Phase 66.11 — mark the destination. Tables mark the row; fault trees mark the
    // node on the canvas (a tree has no row to flash, so these jumps used to land
    // with nothing highlighted at all).
    setTimeout(() => {
        try {
            if (tab === 'fta' && kind === 'ftaNode' && typeof _slHighlightFtaNode === 'function') {
                if (_slHighlightFtaNode(id)) return;
            }
            if (tab === 'fta' && kind === 'ftaPage' && typeof _slHighlightFtaNode === 'function') {
                const pg = (typeof ftaPages !== 'undefined') ? ftaPages.find(x => x.id === id) : null;
                if (pg && pg.root && _slHighlightFtaNode(pg.root.id)) return;
            }
            _highlightArtifactRow(kind, id);
        } catch (_) {}
    }, 260);
};

let _reviewTarget = null;

let _reviewReplyParent = null;

window.openReviewPanel = function(target) {
    if (!target || !target.kind || target.id == null) return;
    _reviewTarget = { kind: target.kind, id: target.id, systemId: target.systemId || null };
    _reviewReplyParent = null;

    const titleEl = document.getElementById('review-title');
    const subEl = document.getElementById('review-subtitle');
    const eyebrow = document.getElementById('review-eyebrow');
    if (titleEl) titleEl.textContent = Review.kindLabel(target.kind);
    if (eyebrow) eyebrow.textContent = 'Review · comments';
    if (subEl)  subEl.textContent  = _reviewTargetSubtitle(_reviewTarget);

    renderReviewPanelBody();

    const panel = document.getElementById('review-panel');
    const scrim = document.getElementById('review-scrim');
    if (panel) {
        panel.classList.add('show');
        panel.setAttribute('aria-hidden', 'false');
    }
    if (scrim) scrim.classList.add('show');

    // Reset composer state.
    const ctx = document.getElementById('review-composer-context');
    const txt = document.getElementById('review-composer-text');
    const cancel = document.getElementById('review-composer-cancel');
    if (ctx) ctx.textContent = 'Add a comment';
    if (txt) { txt.value = ''; setTimeout(() => txt.focus(), 80); }
    if (cancel) cancel.style.display = 'none';

    // Cmd-Enter to post.
    if (txt && !txt._reviewKeyBound) {
        txt._reviewKeyBound = true;
        txt.addEventListener('keydown', function(e) {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                submitReviewCompose();
            }
        });
    }
};

window.closeReviewPanel = function() {
    const panel = document.getElementById('review-panel');
    const scrim = document.getElementById('review-scrim');
    if (panel) { panel.classList.remove('show'); panel.setAttribute('aria-hidden', 'true'); }
    if (scrim) scrim.classList.remove('show');
    _reviewTarget = null;
    _reviewReplyParent = null;
};

window.renderReviewPanelBody = function() {
    const body = document.getElementById('review-body');
    const openCountEl = document.getElementById('review-open-count');
    if (!body || !_reviewTarget) return;

    const showResolvedEl = document.getElementById('review-show-resolved');
    const includeResolved = !!(showResolvedEl && showResolvedEl.checked);
    const threads = Review.threadsFor(_reviewTarget, { includeResolved });

    const openCount = Review.openCountFor(_reviewTarget);
    if (openCountEl) {
        openCountEl.textContent = openCount + ' open' + (Review.totalCountFor(_reviewTarget) - openCount > 0
            ? ' · ' + (Review.totalCountFor(_reviewTarget) - openCount) + ' resolved'
            : '');
    }

    if (threads.length === 0) {
        body.innerHTML = '<div class="review-empty">No comments yet. Start the conversation below.</div>';
        return;
    }

    let html = '';
    for (const thread of threads) {
        const allResolved = thread.root.status === 'resolved' &&
            thread.descendants.every(d => d.c.status === 'resolved');
        html += '<div class="review-thread' + (allResolved ? ' has-resolved' : '') + '">';
        html += _renderReviewComment(thread.root, 0);
        for (const d of thread.descendants) {
            html += _renderReviewComment(d.c, d.depth);
        }
        html += '</div>';
    }
    body.innerHTML = html;
};

window.beginReviewReply = function(parentId) {
    _reviewReplyParent = parentId;
    const ctx = document.getElementById('review-composer-context');
    const cancel = document.getElementById('review-composer-cancel');
    const txt = document.getElementById('review-composer-text');
    const parent = Review.getById(parentId);
    if (ctx) ctx.textContent = 'Replying to ' + ((parent && parent.authorName) || 'comment');
    if (cancel) cancel.style.display = 'inline-block';
    if (txt) { txt.focus(); txt.value = ''; }
};

window.cancelReviewCompose = function() {
    _reviewReplyParent = null;
    const ctx = document.getElementById('review-composer-context');
    const cancel = document.getElementById('review-composer-cancel');
    const txt = document.getElementById('review-composer-text');
    if (ctx) ctx.textContent = 'Add a comment';
    if (cancel) cancel.style.display = 'none';
    if (txt) txt.value = '';
};

window.submitReviewCompose = async function() {
    if (!_reviewTarget) return;
    const txt = document.getElementById('review-composer-text');
    const raw = txt ? txt.value : '';
    if (!raw || !raw.trim()) {
        showToast('Comment cannot be empty.', 'warning');
        return;
    }
    if (!Review.getReviewerName()) {
        // Prompt once for a reviewer name so comments aren't anonymous "Reviewer".
        const name = ((await slPrompt('Your name (for review attribution):')) || '').trim();
        if (name) Review.setReviewerName(name);
    }
    const created = Review.addComment(_reviewTarget, raw, _reviewReplyParent);
    if (!created) return;
    if (txt) txt.value = '';
    _reviewReplyParent = null;
    const ctx = document.getElementById('review-composer-context');
    const cancel = document.getElementById('review-composer-cancel');
    if (ctx) ctx.textContent = 'Add a comment';
    if (cancel) cancel.style.display = 'none';
    renderReviewPanelBody();
    _refreshCommentTriggersFor(_reviewTarget);
    _refreshReviewSummaryIfOpen();
    showToast('Comment posted.', 'success');
};

window.resolveReviewComment = function(commentId) {
    Review.resolveComment(commentId);
    renderReviewPanelBody();
    _refreshCommentTriggersFor(_reviewTarget);
    _refreshReviewSummaryIfOpen();
};

window.reopenReviewComment = function(commentId) {
    Review.reopenComment(commentId);
    renderReviewPanelBody();
    _refreshCommentTriggersFor(_reviewTarget);
    _refreshReviewSummaryIfOpen();
};

window.deleteReviewComment = function(commentId) {
    if (!confirm('Delete this comment (and any replies under it)?')) return;
    Review.deleteComment(commentId);
    renderReviewPanelBody();
    _refreshCommentTriggersFor(_reviewTarget);
    _refreshReviewSummaryIfOpen();
};

const STATIC_NAV_ITEMS = [
    { kind: 'nav', label: 'Go to · Dashboard',            tab: 'dashboard' },
    { kind: 'nav', label: 'Go to · Aircraft Functions',    tab: 'ac-func' },
    { kind: 'nav', label: 'Go to · Aircraft FCIM',         tab: 'ac-fcim' },
    { kind: 'nav', label: 'Go to · Aircraft FHA',          tab: 'ac-fha' },
    { kind: 'nav', label: 'Go to · Aircraft 1309 / DAL',   tab: 'defs' },
    { kind: 'nav', label: 'Go to · Aircraft Requirements', tab: 'ac-req' },
    { kind: 'nav', label: 'Go to · Aircraft Assumptions',  tab: 'ac-asm' },
    { kind: 'nav', label: 'Go to · Systems Directory',     tab: 'sys-dir' },
    { kind: 'nav', label: 'Go to · PRA',                   tab: 'pra' },
    { kind: 'nav', label: 'Go to · ZSA',                   tab: 'zsa' },
    { kind: 'nav', label: 'Go to · CMA',                   tab: 'cma' },
    { kind: 'nav', label: 'Go to · FMEA',                  tab: 'fmea' },
    { kind: 'nav', label: 'Go to · Fault Tree Analysis',   tab: 'fta' },
    { kind: 'nav', label: 'Go to · Component Library',     tab: 'library' },
    { kind: 'nav', label: 'Go to · Markov',                tab: 'markov' },
    { kind: 'nav', label: 'Go to · Flight Phases',         tab: 'phases' },
    { kind: 'nav', label: 'Go to · Trace Matrix',          tab: 'trace' },
    { kind: 'nav', label: 'Go to · Math Validation',       tab: 'validation' }
];

const _SHORTCUT_GROUPS = [
    { title: 'Global', items: [
        ['{MOD} K',                 'Open the command palette — jump to any view or artifact'],
        ['{MOD} S',                 'Save project'],
        ['{MOD} Z',                 'Undo'],
        ['{MOD} ⇧ Z',               'Redo'],
        ['{MOD} /',                 'Toggle help mode (hover any control for a hint)'],
        ['?',                       'Show this shortcuts list'],
        ['Esc',                     'Close any dialog · exit fullscreen']
    ]},
    { title: 'Command palette', items: [
        ['↑ ↓',                     'Move through results'],
        ['Enter',                   'Open the selected result'],
        ['Esc',                     'Close the palette']
    ]},
    { title: 'Fault Tree Analysis', items: [
        ['{MOD} N',                 'New fault tree'],
        ['{MOD} C',                 'Copy the selected branch'],
        ['{MOD} V',                 'Paste as a child of the selection'],
        ['{MOD} ⇧ V',               'Paste special (choose the merge mode)']
    ]}
];

window.reviewJumpFromComment = function(commentId) {
    const c = Review.getById(commentId);
    if (!c) return;
    const desc = _reviewJumpDescriptorFor(c.target);
    if (desc) jumpToArtifact(desc);
    setTimeout(() => openReviewPanel(c.target), 200);
};

window.reviewOpenThreadFromComment = function(commentId) {
    const c = Review.getById(commentId);
    if (!c) return;
    openReviewPanel(c.target);
};

window.onReviewerNameInput = function(val) {
    Review.setReviewerName(val || '');
};

window.captureDashboardBaselineNow = function() {
    _captureDashboardBaseline();
    renderDashboardActivityPanel();
    showToast('Activity baseline captured.', 'success', 2500);
};

const _genericFilters = {};   // viewId → 'all' | 'issues'

window.setGenericFilter = function(viewId, val) {
    _genericFilters[viewId] = val;
    const view = document.getElementById(viewId);
    if (!view) return;
    view.querySelectorAll('[data-gen-filter]').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-gen-filter') === val);
    });
    // Re-render the relevant table. The view-specific render functions know which to call.
    const renderHooks = {
        'view-ac-func': () => typeof renderACFunctions === 'function' && renderACFunctions(),
        'view-ac-fcim': () => typeof renderACFCIM === 'function' && renderACFCIM(),
        'view-ac-fha':  () => typeof renderACFHA === 'function' && renderACFHA(),
        'view-pra':     () => typeof renderPRA === 'function' && renderPRA(),
        'view-zsa':     () => typeof renderZSA === 'function' && renderZSA()
    };
    if (renderHooks[viewId]) renderHooks[viewId]();
};

window.toggleBulkSelect = function(view, id, checked) {
    const key = _bulkKey(view, id);
    if (checked) window._bulkSel.add(key); else window._bulkSel.delete(key);
    _renderBulkBar(view);
};

window.toggleBulkSelectAll = function(view, checked) {
    document.querySelectorAll('#' + view + ' .bulk-checkbox-row').forEach(cb => {
        cb.checked = !!checked;
        const id = cb.getAttribute('data-bulk-id');
        if (id != null) toggleBulkSelect(view, id, !!checked);
    });
};

window.bulkClear = function(view) {
    Array.from(window._bulkSel).forEach(k => { if (k.indexOf(view + ':') === 0) window._bulkSel.delete(k); });
    document.querySelectorAll('#' + view + ' .bulk-checkbox-row, #' + view + ' .bulk-checkbox-all').forEach(cb => cb.checked = false);
    _renderBulkBar(view);
};

window.bulkAction = function(view, action) {
    const selectedIds = Array.from(window._bulkSel).filter(k => k.indexOf(view + ':') === 0).map(k => parseInt(k.slice(view.length + 1), 10));
    if (!selectedIds.length) return;
    if (action === 'delete' && !confirm('Delete ' + selectedIds.length + ' selected item' + (selectedIds.length === 1 ? '' : 's') + '?')) return;

    const removeFromStore = (store) => { for (let i = store.length - 1; i >= 0; i--) if (selectedIds.includes(store[i].internalId)) store.splice(i, 1); };

    if (view === 'view-fmea')   { if (action === 'delete') removeFromStore(fmeaData); }
    else if (view === 'view-cma'){ if (action === 'delete') removeFromStore(cmaData); }
    else if (view === 'view-pra'){ if (action === 'delete') removeFromStore(praData); }
    else if (view === 'view-zsa'){ if (action === 'delete') removeFromStore(zsaData); }
    else if (view === 'view-ac-req'){
        if (action === 'delete') removeFromStore(acReqData);
        else if (action === 'archive') acReqData.forEach(r => { if (selectedIds.includes(r.internalId)) r.status = 'archived'; });
    }

    bulkClear(view);
    // Re-render
    if (typeof renderFMEA === 'function' && view === 'view-fmea') renderFMEA();
    if (typeof renderCMA === 'function' && view === 'view-cma') renderCMA();
    if (typeof renderPRA === 'function' && view === 'view-pra') renderPRA();
    if (typeof renderZSA === 'function' && view === 'view-zsa') renderZSA();
    if (typeof renderACReq === 'function' && view === 'view-ac-req') renderACReq();
    showToast('Bulk ' + action + ' applied to ' + selectedIds.length + ' item' + (selectedIds.length === 1 ? '' : 's') + '.', 'success', 2400);
};

window.renderTraceGraph = function() {
    const host = document.getElementById('trace-graph-canvas');
    if (!host) return;
    host.innerHTML = '';
    if (typeof Traceability === 'undefined') { host.textContent = 'Traceability index not available.'; return; }
    // Build nodes + edges from listAllArtifacts + getReferrers
    const arts = Traceability.listAllArtifacts();
    const nodes = arts.map(a => {
        const key = a.kind + ':' + (a.systemId ? a.systemId + ':' : '') + a.id;
        return { id: key, label: a.label.length > 40 ? a.label.slice(0, 39) + '…' : a.label, group: a.kind, raw: a };
    });
    const edges = [];
    arts.forEach(a => {
        const target = { kind: a.kind, id: a.id, systemId: a.systemId };
        const refs = Traceability.getReferrers(target);
        refs.forEach(r => {
            const from = r.kind + ':' + (r.systemId ? r.systemId + ':' : '') + r.id;
            const to = a.kind + ':' + (a.systemId ? a.systemId + ':' : '') + a.id;
            edges.push({ from, to });
        });
    });
    // Group palette
    const groupColor = {
        acFunc:'#0ea5e9', sysFunc:'#0ea5e9',
        acFha:'#dc2626', sysFha:'#dc2626',
        acFcim:'#f97316', sysFcim:'#f97316',
        acReq:'#16a34a', sysReq:'#16a34a',
        acAsm:'#a78bfa', sysAsm:'#a78bfa',
        ftaPage:'#2563eb', ftaNode:'#60a5fa',
        pra:'#db2777', zsa:'#ec4899', cma:'#7c3aed', fmea:'#eab308'
    };
    nodes.forEach(n => { n.color = { background: groupColor[n.group] || '#6b7280', border: '#0f172a' }; n.font = { color: '#ffffff', size: 11 }; n.shape = 'dot'; n.size = 14; });
    if (typeof vis === 'undefined' || !vis.Network) {
        host.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--color-text-secondary);">Graph library (vis-network) not loaded. Add the CDN script to safety_lab.html to enable this view.<br><br>Stats: ' + nodes.length + ' nodes · ' + edges.length + ' edges.</div>';
        return;
    }
    const data = { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges.map((e, i) => Object.assign({ id: 'e' + i, arrows: 'to', color: { color: 'rgba(140, 140, 150, 0.45)' } }, e))) };
    const options = {
        physics: { stabilization: { iterations: 200 }, barnesHut: { gravitationalConstant: -2000, springLength: 110 } },
        interaction: { hover: true, tooltipDelay: 200 },
        edges: { smooth: { type: 'continuous' }, width: 1 },
        nodes: { borderWidth: 1.5 }
    };
    const net = new vis.Network(host, data, options);
    net.on('click', (params) => {
        if (!params.nodes || !params.nodes.length) return;
        const n = nodes.find(x => x.id === params.nodes[0]);
        if (n && n.raw) jumpToArtifact(n.raw);
    });
};

let _docxLibLoading = null;

let _jszipLoading = null;

// TRUE only when a human actually touched the row. The three flags are not
// interchangeable: `humanEdited` is the direct claim; `aiChatEdited` means the
// change came through the assistant, so it is NOT a human edit however it looks;
// and a bare `aiEdited` with no model and no timestamp is a legacy row from
// before provenance was recorded, which is treated as human because that is the
// conservative reading of an unattributed edit.
function slHumanEdited(row) {
    if (!row) return false;
    if (row.humanEdited === true) return true;
    if (row.aiChatEdited === true) return false;
    if (row.aiEdited === true) return !row.aiEditModel && !row.aiEditedAt;
    return false;
}
try { if (typeof window !== 'undefined') window.slHumanEdited = slHumanEdited; } catch (_) {}

