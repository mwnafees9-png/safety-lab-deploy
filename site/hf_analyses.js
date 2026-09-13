// ============================================================================
// hf_analyses.js — v1.13 — HF'S OWN ANALYSES (30 Aug 2026, Waqas: "human
// factors is not just about assumptions, that is one angle linking it to the
// safety analyses").
//
// The typed-assumption register (hf_assumptions.js / hf_register_panel.js) is
// the BRIDGE — where HF conclusions get credited into FHA severities and
// fault trees. This module carries three of the analyses that exist BEFORE
// anything is credited:
//
//   FUNCTION ALLOCATION (view-hfa-alloc) — which aircraft functions belong to
//   crew, automation, or shared control, with rationale. Attached to the live
//   functions lane (acFunctionsData) by internalId; never a parallel list.
//   Gap checks: functions with no allocation; and the sharp one — an FHA row
//   whose assumptionIds cite an HF-typed assumption (crew credit) on a
//   function never allocated crew/shared. Credit without allocation is a
//   finding, not a style issue.
//
//   HUMAN ERROR ANALYSIS (view-hfa-hea) — the crew-task FMEA: per task, the
//   discrete error modes of NUREG/CR-1278 (Swain & Guttmann, THERP —
//   public-domain US-gov taxonomy: omission, commission, timing, sequence,
//   selection), the detection means, the recovery path, and the failure
//   condition(s) each error feeds. Task references point at HF-typed
//   assumptions (asmId) so the ledgers stay joined, never duplicated.
//
//   CREW ALERTING (view-hfa-alerts) — the inventory of alerts the analyses
//   lean on: priority per 25.1322 (Warning / Caution / Advisory), sensory
//   modality (visual / aural / tactile — 25.1322 vocabulary), and which
//   failure conditions cite each alert. Dangling fcIds and orphan alerts
//   are named, never silently kept.
//
//   CREW TASK ANALYSIS (v1.1, 30 Aug — Waqas: "it does not start with just an
//   assumption"): task analysis is a PRIMARY analysis. Crew tasks are
//   enumerated per phase FIRST (projectConfig.hf.tasks.rows) with no
//   assumption required; "credit this task" PROMOTES one into the typed
//   register (creates the HF assumption through the product's own store,
//   carrying phase/time/crew across) when the safety argument needs it.
//   INV-36's (the phase-workload check) red line still sums CREDITED tasks - widening it to all authored
//   tasks is a change to a cited invariant and goes through its own gate.
//
//   ERGONOMICS EVALUATION REGISTER (v1.1): authored findings against the
//   ISO 9241 spine (projectConfig.hf.ergo.rows) - item, clause cite,
//   finding, Open/Closed. The spine card cites; this register records.
//
// RULES OF THIS FILE.
// - Deterministic authoring surfaces: no model calls, no invented numbers.
//   Enumerations are cited vocabularies (NUREG/CR-1278; 25.1322), never
//   invented ones.
// - READS DON'T WRITE (the ram_predict v0.1 battery lesson): rendering never
//   creates projectConfig.hf; only authored actions do.
// - Persistence rides projectConfig.hf.{alloc,hea,alerts}.rows — the fracas
//   pattern, no new top-level store, no payload edit.
// - Findings are computed live from the joined stores, never persisted.
// - Styling: site tokens + data-table, classes under hfx-*, no stylesheet.
// ============================================================================
(function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ---- cited vocabularies (never invented) -------------------------------
    var ALLOCATIONS = ['crew', 'automation', 'shared'];
    // NUREG/CR-1278 (Swain & Guttmann, THERP) discrete error taxonomy.
    var ERROR_MODES = ['omission', 'commission', 'timing', 'sequence', 'selection'];
    // 25.1322 alerting vocabulary.
    var ALERT_PRIORITIES = ['Warning', 'Caution', 'Advisory'];
    var ALERT_MODALITIES = ['visual', 'aural', 'tactile'];
    // §25.1302 controls & displays evaluation lane. The four considerations are the rule's own
    // sub-paragraphs (a)-(d), 14 CFR §25.1302 (public domain), paraphrased for the picker; the
    // finding + disposition are authored. AC 25.1302-1 is the means-of-compliance guidance.
    var CD_KINDS = ['Control', 'Display', 'Indicator', 'Alerting', 'Automation'];
    var CD_CONSIDERATIONS = [
        '(a) information to perform the task',
        '(b) usable by the qualified crew',
        '(c) predictable & unambiguous behavior',
        '(d) error management (detect & recover)'
    ];
    var CD_STATUS = ['Open', 'Closed'];
    // Situation-awareness assessment lane. The three levels are the widely-used SA model
    // (perception / comprehension / projection); the regulatory basis is §25.1302(a) — the
    // information the crew needs to perform the task — with AC 25.1302-1 as the MoC guidance.
    var SA_LEVELS = ['L1 Perception', 'L2 Comprehension', 'L3 Projection'];
    var SA_STATUS = ['Open', 'Closed'];

    // ---- store access (reads don't write) ----------------------------------
    function _pc() { return (typeof projectConfig !== 'undefined' && projectConfig) ? projectConfig : null; }
    function _read(kind) {
        var p = _pc();
        var hf = p && p.hf;
        var st = hf && hf[kind];
        return (st && Array.isArray(st.rows)) ? st : { rows: [] };
    }
    function _ensure(kind) {
        var p = _pc();
        if (!p) return null;
        if (!p.hf) p.hf = {};
        if (!p.hf[kind]) p.hf[kind] = { rows: [] };
        if (!Array.isArray(p.hf[kind].rows)) p.hf[kind].rows = [];
        return p.hf[kind];
    }
    function _save() { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }
    function _toastSafe(msg, kind) { try { if (typeof _toast === 'function') _toast(msg, kind || 'info'); } catch (_) {} }
    // Review column — the SAME per-row comment/thread affordance the FHA / FTA / requirement
    // artifacts carry (misc_fn_modules reviewCellHtml -> commentTriggerHtml -> Review). HF lane
    // rows become first-class comment targets: kind hf<Lane>, id = the row's own id. Headless
    // (no reviewCellHtml) => no column, so the module stays testable in node.
    function _revTh() { return (typeof reviewCellHtml === 'function') ? '<th class="review-col">Review</th>' : ''; }
    // The review cell, plus the AI confidence pill when the row was AI-drafted.
    //
    // Waqas, 2 Sep 2026: "same rigor in review and sign offs will be required as is the
    // case with other AI drafted analyses." Every other AI-written lane in the product
    // shows the reader, in the row itself, that a model wrote it and whether a human has
    // reviewed it since — the fault-tree pages and the RAM lanes both mount AiBadges for
    // exactly that. An HF row that carries the same provenance but shows none of it is
    // asking the reviewer to approve something whose origin the page has hidden from them.
    //
    // Resolved from the KIND rather than passed in, so no call site changes and no lane
    // can be forgotten: the mapping below is the same one the provenance stamp uses,
    // read from the other end.
    var _KIND_LANE = { hfTid: 'tid', hfAlloc: 'alloc', hfTask: 'tasks', hfHea: 'hea', hfAlerts: 'alerts',
                       hfErgo: 'ergo', hfCd: 'cd', hfSa: 'sa', hfMfc: 'mfc' };
    function _aiPill(kind, id) {
        try {
            if (typeof window === 'undefined' || !window.AiBadges) return '';
            var lane = _KIND_LANE[kind]; if (!lane) return '';
            var idField = _AI_STAMP_LANES[lane]; if (!idField) return '';
            var rows = (_read(lane) || {}).rows || [];
            var row = null;
            for (var i = 0; i < rows.length; i++) { if (String(rows[i][idField]) === String(id)) { row = rows[i]; break; } }
            if (!row || !row.aiGenerated) return '';
            var c = window.AiBadges.confidence(row, {});
            return c ? window.AiBadges.pillHtml(c) : '';
        } catch (_) { return ''; }
    }
    function _revTd(kind, id) {
        try {
            if (typeof reviewCellHtml !== 'function' || id == null || String(id) === '') return '';
            return reviewCellHtml(kind, String(id)).replace(/^<td([^>]*)>/, function (m, attrs) { return '<td' + attrs + '>' + _aiPill(kind, id); });
        } catch (_) { return ''; }
    }

    // ---- live joins (the product's own stores, never copies) ---------------
    function _functions() { return (typeof acFunctionsData !== 'undefined' && Array.isArray(acFunctionsData)) ? acFunctionsData : []; }
    function _fha() { return (typeof acFhaData !== 'undefined' && Array.isArray(acFhaData)) ? acFhaData : []; }
    function _typedAsm() {
        var out = [];
        var take = function (a) { if (a && a.type) out.push(a); };
        ((typeof acAssumptionsData !== 'undefined' && Array.isArray(acAssumptionsData)) ? acAssumptionsData : []).forEach(take);
        ((typeof systemsData !== 'undefined' && Array.isArray(systemsData)) ? systemsData : []).forEach(function (s) {
            ((s && Array.isArray(s.asm)) ? s.asm : []).forEach(take);
        });
        return out;
    }
    function _hfAsm() { return _typedAsm().filter(function (a) { return /human factors/i.test(String(a.type)); }); }

    // ======================================================== ALLOCATION ====
    function allocRowFor(internalId) {
        var rows = _read('alloc').rows;
        for (var i = 0; i < rows.length; i++) if (String(rows[i].key) === String(internalId)) return rows[i];
        return null;
    }
    function setAlloc(internalId, field, value) {
        var st = _ensure('alloc');
        if (!st) return;
        var fn = _functions().find(function (f) { return String(f.internalId) === String(internalId); });
        var row = st.rows.find(function (r) { return String(r.key) === String(internalId); });
        if (!row) {
            row = { key: String(internalId), subId: fn ? fn.subId : '', subName: fn ? fn.subName : '', allocation: '', rationale: '' };
            st.rows.push(row);
        }
        if (field === 'allocation' && (value === '' || ALLOCATIONS.indexOf(value) >= 0)) row.allocation = value;
        if (field === 'rationale') row.rationale = String(value || '');
        if (fn) { row.subId = fn.subId; row.subName = fn.subName; }   // keep display keys fresh
        _save();
        renderAlloc();
    }
    // CSV import lands here rather than pushing rows: allocation is keyed to the LIVE
    // functions lane, so a row that does not resolve to a real sub-function is refused
    // rather than orphaned. Returns true when it matched, false when it did not — the
    // importer counts the misses and names them.
    function setAllocBySubId(subId, allocation, rationale) {
        var fn = _functions().find(function (f) { return String(f.subId) === String(subId); });
        if (!fn) return false;
        if (allocation) setAlloc(fn.internalId, 'allocation', String(allocation).toLowerCase());
        if (rationale != null) setAlloc(fn.internalId, 'rationale', rationale);
        return true;
    }

    function allocFindings() {
        var fns = _functions();
        var byKey = {};
        _read('alloc').rows.forEach(function (r) { byKey[String(r.key)] = r; });
        var unallocated = fns.filter(function (f) { var r = byKey[String(f.internalId)]; return !r || !r.allocation; });
        // credited-but-unallocated: an FHA row citing an HF-typed assumption on
        // a function not allocated crew/shared. All three links are the
        // product's own: fha.assumptionIds -> asmId; fha.subId -> fn.subId;
        // fn.internalId -> alloc row.
        var hfIds = {};
        _hfAsm().forEach(function (a) { if (a.asmId != null) hfIds[String(a.asmId)] = true; });
        var fnBySubId = {};
        fns.forEach(function (f) { if (f.subId) fnBySubId[String(f.subId)] = f; });
        var credited = [];
        _fha().forEach(function (row) {
            var ids = Array.isArray(row.assumptionIds) ? row.assumptionIds : [];
            if (!ids.some(function (id) { return hfIds[String(id)]; })) return;
            var fn = fnBySubId[String(row.subId)];
            if (!fn) return;                                   // system-scope rows resolve elsewhere
            var r = byKey[String(fn.internalId)];
            if (!r || (r.allocation !== 'crew' && r.allocation !== 'shared')) {
                credited.push({ fcId: row.fcId || ('#' + row.internalId), subId: row.subId, subName: fn.subName });
            }
        });
        var stale = _read('alloc').rows.filter(function (r) {
            return !fns.some(function (f) { return String(f.internalId) === String(r.key); });
        });
        return { unallocated: unallocated, creditedUnallocated: credited, stale: stale };
    }
    function renderAlloc() {
        if (typeof document === 'undefined') return;
        var host = document.getElementById('hfa-alloc-host');
        if (!host) return;
        var fns = _functions();
        var find = allocFindings();
        if (!fns.length) {
            host.innerHTML =
                '<div class="hfx-teach" style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); border-radius:6px; padding:16px 20px; ">' +
                '<b style="font-size:13px;">Who does what — the crew, the automation, or both?</b>' +
                '<p style="font-size:12.5px; color:var(--color-text-secondary); margin:8px 0 0; line-height:1.55;">Every sub-function on the Functions page gets one answer here, with the rationale. ' +
                'This is the decision the rest of the HF lane hangs off: a task analysis only exists for what the crew was allocated, and crew credit in the safety argument is a finding when the function was never allocated to the crew at all.<br><br>' +
                '<b>No functions yet</b> — build the functions lane first (Aircraft Functions, or draft it with the AI), then allocate each one here.</p></div>';
            return;
        }
        var done = fns.length - find.unallocated.length;
        var findHtml = '';
        if (find.creditedUnallocated.length) {
            findHtml += '<div class="hfx-finding u-mono" style="font-size:11px; color:#8E2A2A; border:1px solid #8E2A2A55; background:#8E2A2A0d; border-radius:5px; padding:8px 12px; margin-bottom:10px;">' +
                '<b>CREDIT WITHOUT ALLOCATION (' + find.creditedUnallocated.length + ')</b> — these failure conditions carry Human-Factors credit, but their function was never allocated crew or shared: ' +
                find.creditedUnallocated.slice(0, 8).map(function (c) { return esc(c.fcId) + ' (' + esc(c.subId) + ')'; }).join(', ') +
                (find.creditedUnallocated.length > 8 ? ' …' : '') + '. Allocate the function or challenge the credit.</div>';
        }
        if (find.stale.length) {
            findHtml += '<div class="hfx-finding u-mono" style="font-size:11px; color:#B7791F; border:1px solid #B7791F55; border-radius:5px; padding:8px 12px; margin-bottom:10px;">' +
                find.stale.length + ' allocation(s) reference a function no longer on the Functions page: ' +
                find.stale.slice(0, 6).map(function (r) { return esc(r.subId || r.key); }).join(', ') + '.</div>';
        }
        host.innerHTML = _xlaneBanner('alloc') +
            '<div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:10px;">' +
            '<span class="hfx-chip u-mono" style="font-size:10.5px; font-weight:700; border:1px solid var(--color-border-strong); border-radius:5px; padding:2px 8px;">' + done + ' / ' + fns.length + ' allocated</span>' +
            '<button class="btn-cyan" style="font-size:11px;" onclick="exportData(\'HF_Allocation\', \'csv\')" title="Export the crew/automation/shared allocation with rationale as CSV">&#8595; Export CSV</button>' +
            '</div>' + findHtml +
            '<div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:10px;">' +
            '<button class="btn-cyan" style="font-size:11px;" onclick="triggerCSVImport(\'HF_FunctionAllocation\')">&#8593; Import CSV</button>' +
            '<button class="btn-cyan" style="font-size:11px;" onclick="exportData(\'HF_FunctionAllocation\', \'csv\')" title="Every sub-function, allocated or not \u2014 an unallocated line exports blank because that gap is the finding">&#8595; Export CSV</button>' +
            '</div>' +
            _hfTableHtml('alloc') +
            '<p class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary); margin-top:10px;">Allocation is authored, never inferred. The credit check joins the product\'s own links: FHA assumptionIds &rarr; HF-typed assumptions; FHA subId &rarr; the function; the function &rarr; this table.</p>';
    }

    // =============================================================== HEA ====
    function addHea() {
        var st = _ensure('hea');
        if (!st) return;
        // id = max existing suffix + 1 — row removal must never recycle an id
        var n = 1 + st.rows.reduce(function (m, r) { var x = parseInt(String(r.heaId || '').replace(/^\D+/, ''), 10); return isNaN(x) ? m : Math.max(m, x); }, 0);
        st.rows.push({ heaId: 'HEA-' + String(n).padStart(3, '0'), asmId: '', task: '', errorMode: '', effect: '', detection: '', recovery: '', fcIds: '' });
        _save();
        renderHea();
    }
    function setHea(i, field, value) {
        var st = _ensure('hea');
        if (!st || !st.rows[i]) return;
        if (field === 'errorMode' && value !== '' && ERROR_MODES.indexOf(value) < 0) return;
        st.rows[i][field] = String(value || '');
        _save();
        renderHea();
    }
    function removeHea(i) { var st = _ensure('hea'); if (!st) return; st.rows.splice(i, 1); _save(); renderHea(); }
    function heaFindings() {
        var rows = _read('hea').rows;
        var tasks = _hfAsm();
        var covered = {};
        rows.forEach(function (r) { if (r.asmId) covered[String(r.asmId)] = true; });
        var tasksWithoutError = tasks.filter(function (a) { return !covered[String(a.asmId)]; });
        var open = rows.filter(function (r) { return r.errorMode && (!r.detection || !r.recovery); });
        var fcSet = {};
        _fha().forEach(function (f) { if (f.fcId) fcSet[String(f.fcId)] = true; });
        var dangling = [];
        rows.forEach(function (r) {
            String(r.fcIds || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (id) {
                if (!fcSet[id]) dangling.push({ heaId: r.heaId, fcId: id });
            });
        });
        return { tasksWithoutError: tasksWithoutError, open: open, dangling: dangling };
    }
    function renderHea() {
        if (typeof document === 'undefined') return;
        var host = document.getElementById('hfa-hea-host');
        if (!host) return;
        var st = _read('hea');
        var find = heaFindings();
        var findHtml = '';
        if (find.tasksWithoutError.length) {
            findHtml += '<div class="hfx-finding u-mono" style="font-size:11px; color:#B7791F; border:1px solid #B7791F55; border-radius:5px; padding:8px 12px; margin-bottom:10px;">' +
                '<b>' + find.tasksWithoutError.length + ' crew task(s) analyzed for time, not for error</b> — HF assumptions with no error row: ' +
                find.tasksWithoutError.slice(0, 6).map(function (a) { return esc(a.asmId); }).join(', ') + (find.tasksWithoutError.length > 6 ? ' …' : '') + '.</div>';
        }
        if (find.open.length) {
            findHtml += '<div class="hfx-finding u-mono" style="font-size:11px; color:#B7791F; border:1px solid #B7791F55; border-radius:5px; padding:8px 12px; margin-bottom:10px;">' +
                find.open.length + ' error row(s) missing a detection means or recovery path — an error nobody detects is an assumption, not an analysis.</div>';
        }
        if (find.dangling.length) {
            findHtml += '<div class="hfx-finding u-mono" style="font-size:11px; color:#8E2A2A; border:1px solid #8E2A2A55; border-radius:5px; padding:8px 12px; margin-bottom:10px;">' +
                find.dangling.length + ' linked failure-condition id(s) not on the FHA: ' + find.dangling.slice(0, 6).map(function (d) { return esc(d.heaId) + '&rarr;' + esc(d.fcId); }).join(', ') + '.</div>';
        }
        var teach = '';
        if (!st.rows.length) {
            teach = '<div class="hfx-teach" style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); border-radius:6px; padding:16px 20px; margin-bottom:12px; ">' +
                '<b style="font-size:13px;">What can the crew get wrong — and what happens when they do?</b>' +
                '<p style="font-size:12.5px; color:var(--color-text-secondary); margin:8px 0 0; line-height:1.55;">The crew-task FMEA. For each task, walk the five discrete error modes of NUREG/CR-1278 ' +
                '(<span class="u-mono" style="font-size:11px;">omission &middot; commission &middot; timing &middot; sequence &middot; selection</span>), name how the error would be <b>detected</b> and how the crew <b>recovers</b>, and link the failure condition it feeds. ' +
                'Tasks come from the HF assumptions on the register &mdash; the two ledgers stay joined by asmId, never copied.</p></div>';
        }
        host.innerHTML = _xlaneBanner('hea') + teach + findHtml +
            '<div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:10px;">' +
            '<button class="btn-cyan" style="font-size:11px;" onclick="HF_ANALYSES.addHea()">+ Add error row</button>' +
            '<button class="btn-cyan" style="font-size:11px;" onclick="triggerCSVImport(\'HF_HEA\')">&#8593; Import CSV</button>' +
            (st.rows.length ? '<button class="btn-cyan" style="font-size:11px;" onclick="exportData(\'HF_HEA\', \'csv\')" title="Export the human error analysis as CSV">&#8595; Export CSV</button>' : '') +
            '</div>' +
            _hfTableHtml('hea') +
            '<p class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary); margin-top:10px;">Error modes: NUREG/CR-1278 (Swain &amp; Guttmann, THERP) discrete taxonomy &mdash; a cited vocabulary, not an invented one. Probabilities are deliberately absent: THERP quantification needs its own staged tables, and a number without them would be a rumor.</p>';
    }

    // ============================================================ ALERTS ====
    function addAlert() {
        var st = _ensure('alerts');
        if (!st) return;
        var n = 1 + st.rows.reduce(function (m, r) { var x = parseInt(String(r.alertId || '').replace(/^\D+/, ''), 10); return isNaN(x) ? m : Math.max(m, x); }, 0);
        st.rows.push({ alertId: 'ALR-' + String(n).padStart(3, '0'), name: '', priority: '', modality: '', fcIds: '', notes: '' });
        _save();
        renderAlerts();
    }
    function setAlert(i, field, value) {
        var st = _ensure('alerts');
        if (!st || !st.rows[i]) return;
        if (field === 'priority' && value !== '' && ALERT_PRIORITIES.indexOf(value) < 0) return;
        if (field === 'modality' && value !== '' && ALERT_MODALITIES.indexOf(value) < 0) return;
        st.rows[i][field] = String(value || '');
        _save();
        renderAlerts();
    }
    function removeAlert(i) { var st = _ensure('alerts'); if (!st) return; st.rows.splice(i, 1); _save(); renderAlerts(); }
    function alertFindings() {
        var rows = _read('alerts').rows;
        var fcSet = {};
        _fha().forEach(function (f) { if (f.fcId) fcSet[String(f.fcId)] = true; });
        var orphans = rows.filter(function (r) { return !String(r.fcIds || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean).length; });
        var dangling = [];
        rows.forEach(function (r) {
            String(r.fcIds || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (id) {
                if (!fcSet[id]) dangling.push({ alertId: r.alertId, fcId: id });
            });
        });
        return { orphans: orphans, dangling: dangling };
    }
    function renderAlerts() {
        if (typeof document === 'undefined') return;
        var host = document.getElementById('hfa-alerts-host');
        if (!host) return;
        var st = _read('alerts');
        var find = alertFindings();
        var teach = '';
        if (!st.rows.length) {
            teach = '<div class="hfx-teach" style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); border-radius:6px; padding:16px 20px; margin-bottom:12px; ">' +
                '<b style="font-size:13px;">Every &ldquo;crew detects and responds&rdquo; in your analyses leans on an alert. This is where those alerts get counted.</b>' +
                '<p style="font-size:12.5px; color:var(--color-text-secondary); margin:8px 0 0; line-height:1.55;">Inventory each warning, caution and advisory the safety analyses rely on: its 25.1322 priority, its sensory modality, and the failure conditions that cite it. ' +
                'An alert no condition cites is an orphan; a condition relying on an alert that is not in the inventory is exactly the gap this table exists to show.</p></div>';
        }
        var findHtml = '';
        if (find.orphans.length) {
            findHtml += '<div class="hfx-finding u-mono" style="font-size:11px; color:#B7791F; border:1px solid #B7791F55; border-radius:5px; padding:8px 12px; margin-bottom:10px;">' +
                find.orphans.length + ' alert(s) cited by no failure condition: ' + find.orphans.slice(0, 6).map(function (r) { return esc(r.alertId); }).join(', ') + ' — link them or record why they exist.</div>';
        }
        if (find.dangling.length) {
            findHtml += '<div class="hfx-finding u-mono" style="font-size:11px; color:#8E2A2A; border:1px solid #8E2A2A55; border-radius:5px; padding:8px 12px; margin-bottom:10px;">' +
                find.dangling.length + ' linked failure-condition id(s) not on the FHA: ' + find.dangling.slice(0, 6).map(function (d) { return esc(d.alertId) + '&rarr;' + esc(d.fcId); }).join(', ') + '.</div>';
        }
        host.innerHTML = _xlaneBanner('alerts') + teach + findHtml +
            '<div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:10px;">' +
            '<button class="btn-cyan" style="font-size:11px;" onclick="HF_ANALYSES.addAlert()">+ Add alert</button>' +
            '<button class="btn-cyan" style="font-size:11px;" onclick="triggerCSVImport(\'HF_Alerts\')">&#8593; Import CSV</button>' +
            (st.rows.length ? '<button class="btn-cyan" style="font-size:11px;" onclick="exportData(\'HF_Alerts\', \'csv\')" title="Export the crew alerting inventory as CSV">&#8595; Export CSV</button>' : '') +
            '</div>' +
            _hfTableHtml('alerts') +
            '<p class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary); margin-top:10px;">Priority and modality use the 25.1322 vocabulary. The inventory records what the analyses lean on &mdash; it does not certify the alerting system.</p>';
    }

    // ======================================================= CREW TASKS ====
    var ERGO_STATUS = ['Open', 'Closed'];
    function _nextId(rows, field, prefix) {
        var n = 1 + rows.reduce(function (m, r) { var x = parseInt(String(r[field] || '').replace(/^\D+/, ''), 10); return isNaN(x) ? m : Math.max(m, x); }, 0);
        return prefix + String(n).padStart(3, '0');
    }
    function addTask() {
        var st = _ensure('tasks');
        if (!st) return;
        st.rows.push({ taskId: _nextId(st.rows, 'taskId', 'TASK-'), phase: '', crewmember: '', task: '', reactionS: '', execS: '', timeS: '', basis: '', channels: '', notes: '', asmId: '' });
        _save(); renderTasks();
    }
    function setTask(i, field, value) {
        var st = _ensure('tasks');
        if (!st || !st.rows[i]) return;
        st.rows[i][field] = String(value || '');
        _save(); renderTasks();
    }
    function removeTask(i) { var st = _ensure('tasks'); if (!st) return; st.rows.splice(i, 1); _save(); renderTasks(); }
    // PROMOTE: the task earns a place in the safety argument - create the
    // HF-typed assumption through the product's own store (same id scheme as
    // the AI writer and CSV import), carry the task facts into hf metadata,
    // and link back. Engineer-authored: no ai* provenance fields.
    // By id, for the kebab: the menu addresses a row the way the store does, not by the
    // position it happened to render at.
    function creditTaskById(id) {
        var rows = _read('tasks').rows;
        for (var i = 0; i < rows.length; i++) { if (String(rows[i].taskId) === String(id)) return creditTask(i); }
    }
    function creditTask(i) {
        var st = _ensure('tasks');
        if (!st || !st.rows[i] || st.rows[i].asmId) return;
        if (typeof acAssumptionsData === 'undefined') return;
        var r = st.rows[i];
        var asmId = 'ASM-AC-' + String(acAsmCounter++).padStart(3, '0');
        var hf = { crewmember: r.crewmember || '', responsePhase: r.phase || '' };
        var t = taskResponseS(r);
        if (t != null && t > 0) {
            hf.taskTimeS = t; hf.taskTimeBasis = r.basis || 'authored on the Task Analysis page';
            var ra = _num(r.reactionS), ex = _num(r.execS);
            if (ra != null) hf.reactionS = ra;
            if (ex != null) hf.executionS = ex;
        }
        acAssumptionsData.push({
            asmId: asmId,
            statement: 'Crew perform: ' + (r.task || r.taskId) + (r.phase ? (' [' + r.phase + ']') : ''),
            state: 'Proposed', type: 'Human Factors',
            valStrategy: '', valArtifact: '', verArtifact: '',
            origin: 'Credited from Task Analysis ' + r.taskId,
            hf: hf
        });
        r.asmId = asmId;
        _save();
        try { if (typeof renderACAssumptions === 'function') renderACAssumptions(); } catch (_) {}
        renderTasks();
        _toastSafe('Task ' + r.taskId + ' credited as ' + asmId + ' - Proposed; the conservative lane holds until it is validated.', 'success');
    }
    function renderTasks() {
        if (typeof document === 'undefined') return;
        var host = document.getElementById('hfa-tasks-host');
        if (!host) return;
        var st = _read('tasks');
        var teach = '';
        if (!st.rows.length) {
            teach = '<div class="hfx-teach" style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); border-radius:6px; padding:16px 20px; margin-bottom:12px; ">' +
                '<b style="font-size:13px;">Start with what the crew actually does - not with assumptions.</b>' +
                '<p style="font-size:12.5px; color:var(--color-text-secondary); margin:8px 0 0; line-height:1.55;">Enumerate the crew tasks phase by phase: who does it, what it is, how long the response takes — reaction plus execution — and on what basis. ' +
                'A task stands on its own as analysis. When the safety argument leans on one, <b>Credit</b> promotes it into the typed-assumption register - that is the bridge, not the starting point.</p></div>';
        }
        host.innerHTML = _xlaneBanner('task') + teach +
            '<div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:10px;">' +
            '<button class="btn-cyan" style="font-size:11px;" onclick="HF_ANALYSES.addTask()">+ Add task</button>' +
            '<button class="btn-cyan" style="font-size:11px;" onclick="triggerCSVImport(\'HF_Tasks\')">&#8593; Import CSV</button>' +
            (st.rows.length ? '<button class="btn-cyan" style="font-size:11px;" onclick="exportData(\'HF_Tasks\', \'csv\')">&#8595; Export CSV</button>' : '') +
            '<span class="u-mono" style="font-size:10px; color:var(--color-text-tertiary);">' + st.rows.filter(function (r) { return r.asmId; }).length + ' of ' + st.rows.length + ' credited into the register</span></div>' +
            _hfTableHtml('tasks') +
            '<p class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary); margin-top:10px;">Tasks are PRIMARY analysis - a task needs no assumption to exist. The phase-workload red line currently sums CREDITED tasks; widening it to all authored tasks is a change to a cited invariant, queued behind its own gate.</p>';
    }

    // ================================================== ERGO REGISTER ====
    function addErgo() {
        var st = _ensure('ergo');
        if (!st) return;
        st.rows.push({ ergoId: _nextId(st.rows, 'ergoId', 'ERG-'), item: '', clause: '', finding: '', status: 'Open', notes: '' });
        _save(); renderErgo();
    }
    function setErgo(i, field, value) {
        var st = _ensure('ergo');
        if (!st || !st.rows[i]) return;
        if (field === 'status' && ERGO_STATUS.indexOf(value) < 0) return;
        st.rows[i][field] = String(value || '');
        _save(); renderErgo();
    }
    function removeErgo(i) { var st = _ensure('ergo'); if (!st) return; st.rows.splice(i, 1); _save(); renderErgo(); }
    function renderErgo() {
        if (typeof document === 'undefined') return;
        var host = document.getElementById('hfa-ergo-register-host');
        if (!host) return;
        var st = _read('ergo');
        var teach = '';
        if (!st.rows.length) {
            teach = '<div class="hfx-teach" style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); border-radius:6px; padding:14px 18px; margin-bottom:12px; ">' +
                '<b style="font-size:13px;">The spine cites the criteria - this register records what you found against them.</b>' +
                '<p style="font-size:12.5px; color:var(--color-text-secondary); margin:6px 0 0; line-height:1.5;">One row per evaluated item: the control or display, the ISO 9241 clause (or Fitts seed) it was judged against, the finding, and whether it is closed.</p></div>';
        }
        host.innerHTML = _xlaneBanner('ergo') + teach +
            '<div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:10px;">' +
            '<button class="btn-cyan" style="font-size:11px;" onclick="HF_ANALYSES.addErgo()">+ Add evaluation</button>' +
            '<button class="btn-cyan" style="font-size:11px;" onclick="triggerCSVImport(\'HF_Ergo\')">&#8593; Import CSV</button>' +
            (st.rows.length ? '<button class="btn-cyan" style="font-size:11px;" onclick="exportData(\'HF_Ergo\', \'csv\')">&#8595; Export CSV</button>' : '') +
            '<span class="u-mono" style="font-size:10px; color:var(--color-text-tertiary);">' + st.rows.filter(function (r) { return r.status === 'Open'; }).length + ' open</span></div>' +
            _hfTableHtml('ergo');
    }

    // ============================================== §25.1302 CONTROLS & DISPLAYS ====
    // Controls & displays evaluation per 14 CFR §25.1302 / AC 25.1302-1. Promotes what the
    // Ergonomics register covers today into a first-class regulatory lane keyed to the four
    // §25.1302 considerations (a)-(d). Full CRUD; findings compute coverage across the four
    // considerations (a gap = a consideration with no evaluated item) and the open count.
    function addCd() {
        var st = _ensure('cd');
        if (!st) return;
        st.rows.push({ cdId: _nextId(st.rows, 'cdId', 'CD-'), item: '', kind: 'Control', consideration: '', supports: '', finding: '', status: 'Open', notes: '' });
        _save(); renderCd();
    }
    function setCd(i, field, value) {
        var st = _ensure('cd');
        if (!st || !st.rows[i]) return;
        if (field === 'kind' && CD_KINDS.indexOf(value) < 0) return;
        if (field === 'consideration' && value && CD_CONSIDERATIONS.indexOf(value) < 0) return;
        if (field === 'status' && CD_STATUS.indexOf(value) < 0) return;
        st.rows[i][field] = String(value || '');
        _save(); renderCd();
    }
    function removeCd(i) { var st = _ensure('cd'); if (!st) return; st.rows.splice(i, 1); _save(); renderCd(); }
    function cdFindings() {
        var st = _read('cd'); var rows = (st && st.rows) || [];
        var open = rows.filter(function (r) { return r.status !== 'Closed'; });
        var unconsidered = rows.filter(function (r) { return !r.consideration; });
        var covered = {};
        rows.forEach(function (r) { if (r.consideration) covered[r.consideration] = true; });
        var gaps = CD_CONSIDERATIONS.filter(function (c) { return !covered[c]; });
        return { open: open, unconsidered: unconsidered, gaps: gaps, count: rows.length };
    }
    function renderCd() {
        if (typeof document === 'undefined') return;
        var host = document.getElementById('hfa-cd-host');
        if (!host) return;
        var st = _read('cd');
        var find = cdFindings();
        var teach = '';
        if (!st.rows.length) {
            teach = '<div class="hfx-teach" style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); border-radius:6px; padding:14px 18px; margin-bottom:12px; ">' +
                '<b style="font-size:13px;">The controls and displays the crew actually uses &mdash; judged against &sect;25.1302.</b>' +
                '<p style="font-size:12.5px; color:var(--color-text-secondary); margin:6px 0 0; line-height:1.5;">One row per evaluated control, display or automation behavior: which of the four &sect;25.1302 considerations it is judged against &mdash; (a) the information to do the task, (b) usability by the qualified crew, (c) predictable and unambiguous behavior, (d) error management &mdash; the finding, and its disposition. AC 25.1302-1 is the means-of-compliance guidance.</p></div>';
        }
        var findHtml = '';
        if (st.rows.length && find.gaps.length) {
            findHtml += '<div class="hfx-finding u-mono" style="font-size:11px; color:#B7791F; border:1px solid #B7791F55; border-radius:5px; padding:8px 12px; margin-bottom:10px;">' +
                '<b>' + find.gaps.length + ' of 4 &sect;25.1302 considerations have no evaluated item</b> &mdash; ' + find.gaps.map(function (g) { return esc(g); }).join('; ') + '.</div>';
        }
        host.innerHTML = _xlaneBanner('cd') + teach + findHtml +
            '<div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:10px;">' +
            '<button class="btn-cyan" style="font-size:11px;" onclick="HF_ANALYSES.addCd()">+ Add evaluation</button>' +
            '<button class="btn-cyan" style="font-size:11px;" onclick="triggerCSVImport(\'HF_ControlsDisplays\')">&#8593; Import CSV</button>' +
            (st.rows.length ? '<button class="btn-cyan" style="font-size:11px;" onclick="exportData(\'HF_ControlsDisplays\', \'csv\')">&#8595; Export CSV</button>' : '') +
            '<span class="u-mono" style="font-size:10px; color:var(--color-text-tertiary);">' + find.open.length + ' open &middot; ' + (4 - find.gaps.length) + ' / 4 considerations covered</span></div>' +
            _hfTableHtml('cd') +
            '<p class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary); margin-top:6px;">&sect;25.1302(a)-(d) are the rule\'s own considerations (14 CFR, public domain); AC 25.1302-1 is the accepted means-of-compliance guidance. The evaluation and disposition are authored, not determined here.</p>';
    }

    // ============================================== SITUATION AWARENESS ====
    // SA assessment per the three-level model (perception / comprehension / projection),
    // grounded in §25.1302(a) (information to perform the task) and AC 25.1302-1. Ties to the
    // crew-task and alerting lanes: each SA element names the CUE that supplies it. Full CRUD;
    // findings compute level coverage (a level with no assessed element) and elements with no cue
    // — information the crew is assumed to have with no identified means to perceive it.
    function addSa() {
        var st = _ensure('sa');
        if (!st) return;
        st.rows.push({ saId: _nextId(st.rows, 'saId', 'SA-'), element: '', level: 'L1 Perception', cue: '', phase: '', finding: '', status: 'Open', notes: '' });
        _save(); renderSa();
    }
    function setSa(i, field, value) {
        var st = _ensure('sa');
        if (!st || !st.rows[i]) return;
        if (field === 'level' && SA_LEVELS.indexOf(value) < 0) return;
        if (field === 'status' && SA_STATUS.indexOf(value) < 0) return;
        st.rows[i][field] = String(value || '');
        _save(); renderSa();
    }
    function removeSa(i) { var st = _ensure('sa'); if (!st) return; st.rows.splice(i, 1); _save(); renderSa(); }
    function saFindings() {
        var st = _read('sa'); var rows = (st && st.rows) || [];
        var open = rows.filter(function (r) { return r.status !== 'Closed'; });
        var noCue = rows.filter(function (r) { return r.element && !r.cue; });
        var covered = {};
        rows.forEach(function (r) { if (r.level) covered[r.level] = true; });
        var levelGaps = SA_LEVELS.filter(function (l) { return !covered[l]; });
        return { open: open, noCue: noCue, levelGaps: levelGaps, count: rows.length };
    }
    function renderSa() {
        if (typeof document === 'undefined') return;
        var host = document.getElementById('hfa-sa-host');
        if (!host) return;
        var st = _read('sa');
        var find = saFindings();
        var teach = '';
        if (!st.rows.length) {
            teach = '<div class="hfx-teach" style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); border-radius:6px; padding:14px 18px; margin-bottom:12px; ">' +
                '<b style="font-size:13px;">What the crew must know &mdash; and whether the flight deck actually lets them know it.</b>' +
                '<p style="font-size:12.5px; color:var(--color-text-secondary); margin:6px 0 0; line-height:1.5;">One row per situation-awareness element, at its level &mdash; L1 perceive the cue, L2 understand what it means, L3 project what happens next &mdash; the cue or source that supplies it (a display, an alert), the flight phase, and the finding. Grounded in &sect;25.1302(a) and AC 25.1302-1. An element with no identified cue is information the crew is assumed to have with no means to perceive it.</p></div>';
        }
        var findHtml = '';
        if (st.rows.length && find.levelGaps.length) {
            findHtml += '<div class="hfx-finding u-mono" style="font-size:11px; color:#B7791F; border:1px solid #B7791F55; border-radius:5px; padding:8px 12px; margin-bottom:10px;">' +
                '<b>' + find.levelGaps.length + ' of 3 SA levels have no assessed element</b> &mdash; ' + find.levelGaps.map(function (g) { return esc(g); }).join('; ') + '.</div>';
        }
        if (st.rows.length && find.noCue.length) {
            findHtml += '<div class="hfx-finding u-mono" style="font-size:11px; color:#8E2A2A; border:1px solid #8E2A2A55; border-radius:5px; padding:8px 12px; margin-bottom:10px;">' +
                '<b>' + find.noCue.length + ' SA element(s) name no cue</b> &mdash; information assumed available with no identified means to perceive it: ' +
                find.noCue.slice(0, 6).map(function (r) { return esc(r.element); }).join(', ') + (find.noCue.length > 6 ? ' …' : '') + '.</div>';
        }
        host.innerHTML = _xlaneBanner('sa') + teach + findHtml +
            '<div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:10px;">' +
            '<button class="btn-cyan" style="font-size:11px;" onclick="HF_ANALYSES.addSa()">+ Add SA element</button>' +
            '<button class="btn-cyan" style="font-size:11px;" onclick="triggerCSVImport(\'HF_SituationAwareness\')">&#8593; Import CSV</button>' +
            (st.rows.length ? '<button class="btn-cyan" style="font-size:11px;" onclick="exportData(\'HF_SituationAwareness\', \'csv\')">&#8595; Export CSV</button>' : '') +
            '<span class="u-mono" style="font-size:10px; color:var(--color-text-tertiary);">' + find.open.length + ' open &middot; ' + (3 - find.levelGaps.length) + ' / 3 SA levels covered</span></div>' +
            _hfTableHtml('sa') +
            '<p class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary); margin-top:6px;">The three levels are the standard perception/comprehension/projection SA model; the regulatory basis is &sect;25.1302(a) with AC 25.1302-1 as guidance. The cue column links each element to the display or alert that supplies it. Assessment and disposition are authored.</p>';
    }

    // =============================================================== MFC (§25.1523 / App. D) ====
    // Minimum Flight Crew workload analysis. Grounded in 14 CFR §25.1523 + Appendix D (public
    // domain — the six basic workload functions and ten workload factors are the rule's own,
    // verbatim). Store: one authored row per basic workload function (crew assignment + Bedford
    // 1–10 + note), a disposition per workload factor, and the crew determination + rationale.
    // Findings JOIN the live Function Allocation lane so the MFC argument tracks the real crew split.
    var MFC_FUNCTIONS = [
        { key: 'fpc',  label: 'Flight path control' },
        { key: 'ca',   label: 'Collision avoidance' },
        { key: 'nav',  label: 'Navigation' },
        { key: 'comm', label: 'Communications' },
        { key: 'sys',  label: 'Operation and monitoring of aircraft engines and systems' },
        { key: 'cmd',  label: 'Command decisions' }
    ];
    var MFC_FACTORS = [
        'Accessibility, ease and simplicity of operation of all necessary controls',
        'Accessibility and conspicuity of instruments and failure-warning devices (and whether they direct corrective action)',
        'Number, urgency and complexity of operating procedures (incl. fuel management)',
        'Degree and duration of concentrated mental and physical effort (normal + malfunctions/emergencies)',
        'Extent of required monitoring of systems en route',
        'Actions requiring a crewmember away from the assigned duty station',
        'Degree of automation for crossover/isolation after failures',
        'Communications and navigation workload',
        'Increased workload from an emergency leading to other emergencies',
        'Incapacitation of a flight crewmember (when the operating rule requires two or more pilots)'
    ];
    var MFC_ROLES = ['—', 'PF', 'PM', 'Shared', 'Automation'];
    function _mfcEnsure() {
        var st = _ensure('mfc'); if (!st) return null;
        if (!Array.isArray(st.rows)) st.rows = [];
        if (!st.factors || typeof st.factors !== 'object') st.factors = {};
        if (!st.conclusion || typeof st.conclusion !== 'object') st.conclusion = { minCrew: '', rationale: '' };
        return st;
    }
    function setMfcFn(key, field, value) {
        var st = _mfcEnsure(); if (!st) return;
        var r = st.rows.find(function (x) { return x.key === key; });
        if (!r) { r = { key: key }; st.rows.push(r); }
        r[field] = value; _save(); renderMfc();
    }
    function setMfcFactor(idx, value) { var st = _mfcEnsure(); if (!st) return; st.factors[idx] = value; _save(); renderMfc(); }
    function setMfcConclusion(field, value) { var st = _mfcEnsure(); if (!st) return; st.conclusion[field] = value; _save(); renderMfc(); }
    function mfcFindings() {
        var st = _read('mfc'); var rows = st.rows || [], factors = st.factors || {}, concl = st.conclusion || {};
        var byKey = {}; rows.forEach(function (r) { byKey[String(r.key)] = r; });
        var labelOf = function (k) { var f = MFC_FUNCTIONS.find(function (x) { return x.key === k; }); return f ? f.label : k; };
        var unassigned = MFC_FUNCTIONS.filter(function (f) { var r = byKey[f.key]; return !r || !r.role || r.role === '—'; }).map(function (f) { return f.label; });
        var high = MFC_FUNCTIONS.filter(function (f) { var r = byKey[f.key] || {}; var b = parseFloat(r.bedford); return !isNaN(b) && b >= 7; }).map(function (f) { return f.label; });
        var openFactors = []; MFC_FACTORS.forEach(function (_, i) { var d = factors[i]; if (!d || !String(d).trim()) openFactors.push(i + 1); });
        var minCrew = parseInt(String(concl.minCrew || '').replace(/[^0-9]/g, ''), 10);
        var incap = (!isNaN(minCrew) && minCrew >= 2) && (!factors[9] || !String(factors[9]).trim());
        var crewCount = 0;
        try { (_read('alloc').rows || []).forEach(function (r) { if (r.allocation === 'Crew' || r.allocation === 'Shared') crewCount++; }); } catch (_) {}
        var crewHeavy = (!isNaN(minCrew) && minCrew <= 1) && crewCount >= 8;
        return { unassigned: unassigned, high: high, openFactors: openFactors, incap: incap, crewHeavy: crewHeavy, crewCount: crewCount };
    }
    function renderMfc() {
        if (typeof document === 'undefined') return;
        var host = document.getElementById('hfa-mfc-host'); if (!host) return;
        var st = _read('mfc'); var rows = st.rows || [], factors = st.factors || {}, concl = st.conclusion || {};
        var find = mfcFindings();
        var inp = function (v, on, ph, w) { return '<input value="' + esc(v || '') + '" placeholder="' + (ph || '') + '" onchange="' + on + '" style="width:100%; min-width:' + (w || 90) + 'px; font:inherit; font-size:11px; padding:3px 5px; border:1px solid var(--color-border-strong); background:var(--color-surface-2); color:inherit; border-radius:4px;">'; };
        var teach =
            '<div class="hfx-teach" style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); border-radius:6px; padding:16px 20px;  margin-bottom:14px;">' +
            '<b style="font-size:13px;">Minimum Flight Crew &mdash; 14 CFR &sect;25.1523 / Appendix D</b>' +
            '<p style="font-size:12.5px; color:var(--color-text-secondary); margin:8px 0 0; line-height:1.55;">The minimum flight crew must be sufficient for safe operation considering crew workload, control accessibility, and the kind of operation (&sect;25.1523). Appendix D fixes the <b>six basic workload functions</b> and <b>ten workload factors</b> below &mdash; assign each function, rate its workload (Bedford 1&ndash;10), disposition each factor, and record the crew determination with its rationale. Assignment is authored; the findings join your live Function Allocation.</p></div>';
        var bann = '';
        if (find.unassigned.length) bann += '<div class="hfx-finding u-mono" style="font-size:11px; color:#8E2A2A; border:1px solid #8E2A2A55; background:#8E2A2A0d; border-radius:5px; padding:8px 12px; margin-bottom:10px;"><b>UNASSIGNED WORKLOAD FUNCTION(S)</b> &mdash; ' + find.unassigned.map(esc).join(', ') + '. Every basic workload function must be assigned before the determination holds.</div>';
        if (find.incap) bann += '<div class="hfx-finding u-mono" style="font-size:11px; color:#8E2A2A; border:1px solid #8E2A2A55; background:#8E2A2A0d; border-radius:5px; padding:8px 12px; margin-bottom:10px;"><b>INCAPACITATION FACTOR OPEN</b> &mdash; the determination is two or more crew, so Appendix D factor (10), single-crewmember incapacitation, must be dispositioned.</div>';
        if (find.crewHeavy) bann += '<div class="hfx-finding u-mono" style="font-size:11px; color:#B7791F; border:1px solid #B7791F55; border-radius:5px; padding:8px 12px; margin-bottom:10px;"><b>CREW-HEAVY vs SINGLE-PILOT</b> &mdash; ' + find.crewCount + ' functions are allocated Crew/Shared but the determination is single-pilot. Re-check the workload argument.</div>';
        if (find.high.length) bann += '<div class="hfx-finding u-mono" style="font-size:11px; color:#B7791F; border:1px solid #B7791F55; border-radius:5px; padding:8px 12px; margin-bottom:10px;"><b>HIGH WORKLOAD (Bedford &ge;7)</b> &mdash; ' + find.high.map(esc).join(', ') + '.</div>';
        host.innerHTML = _xlaneBanner('mfc') + teach + bann +
            '<div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:10px;"><button class="btn-cyan" style="font-size:11px;" onclick="exportData(\'HF_MFC\', \'csv\')">&#8595; Export CSV</button><button class="btn-cyan" style="font-size:11px;" onclick="triggerCSVImport(\'HF_MFC\')">&#8593; Import CSV</button></div>' +
            '<h4 style="margin:6px 0 6px; font-size:12.5px;">Basic workload functions (Appendix D(a))</h4>' +
            _hfTableHtml('mfc') +
            '<h4 style="margin:6px 0 6px; font-size:12.5px;">Workload factors (Appendix D(b)) &mdash; ' + (10 - find.openFactors.length) + ' / 10 dispositioned</h4>' +
            _hfTableHtml('mfcFactor') +
            '<h4 style="margin:6px 0 6px; font-size:12.5px;">Determination (&sect;25.1523)</h4>' +
            '<div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; "><label style="font-size:12px;">Minimum flight crew:&nbsp;' + inp(concl.minCrew, 'HF_ANALYSES.setMfcConclusion(\'minCrew\', this.value)', 'e.g. 2 pilots', 90) + '</label></div>' +
            '<div style="margin-top:8px;"><textarea rows="3" placeholder="rationale tying the functions + factors to the determination" onchange="HF_ANALYSES.setMfcConclusion(\'rationale\', this.value)" style="width:100%; font:inherit; font-size:12px; padding:6px 8px; border:1px solid var(--color-border-strong); background:var(--color-surface-2); color:inherit; border-radius:6px;">' + esc(concl.rationale || '') + '</textarea></div>' +
            '<p class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary); margin-top:10px;">The six functions and ten factors are 14 CFR Part 25 Appendix D, verbatim (public domain). Assignment and dispositions are authored; the crew-heavy check joins the live Function Allocation lane. Kind of operation is assumed IFR unless a more limited approval is sought (App. D(c)).</p>';
    }

    // ============================================ TASK IDENTIFICATION ====
    // Stage 1 of the task chain, and the deliberate mirror of the FUNCTIONS lane:
    // functions -> FCIM -> FHA becomes tasks -> TCIM -> task hazard assessment.
    //
    // What this lane is FOR: enumerating what the crew actually has to do, from the
    // operating procedures, BEFORE anything is decomposed or assessed. A task that
    // is not identified here cannot be analysed downstream, exactly as a function
    // that is not in the functions lane never reaches the FCIM.
    //
    // The parent/child shape is the functions lane's, not a new one: a PROCEDURE
    // (procId/procName) carries one or more TASK STEPS (taskId/taskName/taskDef).
    // taskId is the join key the matrix and the hazard assessment both stand on.
    //
    // SOURCE is not decoration. A task with no cited procedure reference is a task
    // somebody invented, and the finding says so in those words.
    var TID_MODES = ['Normal', 'Non-normal', 'Emergency', 'Ground'];
    var TID_CREW = ['PF', 'PM', 'Either', 'Both', 'Ground crew'];
    // 2 Sep 2026 (Waqas: "either, both, PM and all that need to be defined somewhere,
    // and that should be a downselect rather than free text, so the AI cannot use
    // different terms"). ONE definition per term, served to the drafter prompt, the
    // modal options and the column legend alike — the same words everywhere. Measured
    // reason: across three independent TID draws opsMode agreed kappa 1.000 while crew
    // agreed 0.78–0.94 — the vocabulary was listed but never defined, so the model
    // decided for itself what separates Either from Both.
    var TID_CREW_DEFS = {
        'PF':          'Pilot Flying — controls the flight path, manually or through the autoflight',
        'PM':          'Pilot Monitoring — the other pilot: monitors flight path and systems, handles radios and checklists, cross-checks the PF',
        'Either':      'either pilot may perform the step; not role-specific',
        'Both':        'both pilots are required — challenge-and-response, a cross-check, or concurrent action',
        'Ground crew': 'performed by ground personnel, not the flight crew'
    };
    var TID_CREW_LEGEND = Object.keys(TID_CREW_DEFS).map(function (k) { return k + ': ' + TID_CREW_DEFS[k]; }).join('\n');

    function addTid() {
        var st = _ensure('tid');
        if (!st) return;
        st.rows.push({
            taskId: _nextId(st.rows, 'taskId', 'TSK-'),
            procId: '', procName: '', opsMode: 'Normal', phase: '',
            taskName: '', taskDef: '', crew: '', trigger: '', source: '', notes: ''
        });
        _save(); renderTid();
    }
    function setTid(i, field, value) {
        var st = _ensure('tid');
        if (!st || !st.rows[i]) return;
        if (field === 'opsMode' && TID_MODES.indexOf(value) < 0) return;
        if (field === 'crew' && value && TID_CREW.indexOf(value) < 0) return;
        st.rows[i][field] = String(value || '');
        _save(); renderTid();
    }
    function removeTid(i) { var st = _ensure('tid'); if (!st) return; st.rows.splice(i, 1); _save(); renderTid(); }

    // Findings are computed live and never persisted. Five checks, each of which
    // names a way the enumeration is not yet trustworthy rather than untidy.
    function tidFindings() {
        var st = _read('tid'); var rows = (st && st.rows) || [];
        var uncited = rows.filter(function (r) { return !String(r.source || '').trim(); });
        var noCrew = rows.filter(function (r) { return !String(r.crew || '').trim(); });
        var noTrigger = rows.filter(function (r) { return !String(r.trigger || '').trim(); });
        var covered = {};
        rows.forEach(function (r) { if (r.opsMode) covered[r.opsMode] = true; });
        var modeGaps = TID_MODES.filter(function (m) { return !covered[m]; });
        var seen = {}, dupes = [];
        rows.forEach(function (r) {
            var id = String(r.taskId || '').trim();
            if (!id) return;
            if (seen[id]) { if (dupes.indexOf(id) < 0) dupes.push(id); } else { seen[id] = true; }
        });
        return { uncited: uncited, noCrew: noCrew, noTrigger: noTrigger, modeGaps: modeGaps, dupes: dupes, count: rows.length };
    }

    function renderTid() {
        if (typeof document === 'undefined') return;
        var host = document.getElementById('hfa-tid-host');
        if (!host) return;
        var st = _read('tid');
        var find = tidFindings();
        var teach = '';
        if (!st.rows.length) {
            teach = '<div class="hfx-teach" style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); border-radius:6px; padding:14px 18px; margin-bottom:12px; ">' +
                '<b style="font-size:13px;">Identify the tasks before you decompose them.</b>' +
                '<p style="font-size:12.5px; color:var(--color-text-secondary); margin:6px 0 0; line-height:1.55;">This lane is to the task chain what the functions lane is to the failure chain. ' +
                'One row per <b>task step</b>, grouped under the <b>procedure</b> it comes from: normal, non-normal, emergency or ground. Say who does it, what starts it, and cite the procedure it is taken from. ' +
                'The Task Analysis matrix then decomposes each step into its deviations, and the Task Hazard Assessment judges them &mdash; neither can see a task that was never identified here.</p>' +
                '<p style="font-size:12.5px; color:var(--color-text-secondary); margin:8px 0 0; line-height:1.55;">A step with no cited source is a step somebody invented. That is a finding, not a formatting nit.</p></div>';
        }
        var findHtml = '';
        if (st.rows.length) {
            var bits = [];
            if (find.modeGaps.length) bits.push('<b>' + find.modeGaps.length + ' of 4 operating modes have no identified task</b> &mdash; ' + find.modeGaps.map(function (m) { return esc(m); }).join('; '));
            if (find.uncited.length) bits.push('<b>' + find.uncited.length + ' task' + (find.uncited.length === 1 ? '' : 's') + ' cite no procedure source</b>');
            if (find.noCrew.length) bits.push(find.noCrew.length + ' with no crewmember assigned');
            if (find.noTrigger.length) bits.push(find.noTrigger.length + ' with no trigger');
            if (find.dupes.length) bits.push('<b>duplicate task ids</b> &mdash; ' + find.dupes.map(function (d) { return esc(d); }).join(', '));
            if (bits.length) {
                findHtml = '<div class="hfx-finding u-mono" style="font-size:11px; color:#B7791F; border:1px solid #B7791F55; border-radius:5px; padding:8px 12px; margin-bottom:10px;">' + bits.join(' &middot; ') + '.</div>';
            }
        }
        host.innerHTML = _xlaneBanner('tid') + teach + findHtml +
            '<div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:10px;">' +
            '<button class="btn-cyan" style="font-size:11px;" onclick="HF_ANALYSES.addTid()">+ Add task step</button>' +
            '<button class="btn-cyan" style="font-size:11px;" onclick="triggerCSVImport(\'HF_TaskIdentification\')">&#8593; Import CSV</button>' +
            (st.rows.length ? '<button class="btn-cyan" style="font-size:11px;" onclick="exportData(\'HF_TaskIdentification\', \'csv\')" title="Export the identified task steps as CSV">&#8595; Export CSV</button>' : '') +
            '<span class="u-mono" style="font-size:10px; color:var(--color-text-tertiary);">' + find.count + ' task step' + (find.count === 1 ? '' : 's') + ' &middot; ' + (4 - find.modeGaps.length) + ' / 4 operating modes covered &middot; ' + (find.count - find.uncited.length) + ' cited</span></div>' +
            _hfTableHtml('tid') +
            '<p class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary); margin-top:6px;">Identification only. This lane records what the crew is required to do and where that requirement comes from; it makes no judgment about difficulty, workload, error or consequence &mdash; those are the Task Analysis and Task Hazard Assessment lanes, and they read this one.</p>';
    }

    // ========================= THE COLUMN SCHEMA =========================
    // Waqas, 2 Sep 2026: "all these lanes need text wrapping features coz most of the text
    // is hidden, match the same table format and layout as FHAs, and instead of in table
    // editing I want editing in a modal see how it was done in the FHAs, and we will need
    // the same kebab here."
    //
    // WHY THE TEXT WAS HIDDEN. Every HF cell was a live <input> with a min-width. An input
    // shows one line of whatever it holds, so a 200-character finding displayed about
    // twenty characters and the rest existed only if you clicked into the box and arrowed
    // along it. The worksheets never had this problem because they never put inputs in
    // cells: an FHA cell is TEXT, it wraps like text, and editing happens somewhere else.
    // Switching the cells to text is therefore not a styling fix, it is the same fix —
    // the wrapping falls out of the base table CSS the moment the input is gone.
    //
    // ONE SCHEMA, THREE SURFACES. The table head, the row cells and the modal fields are
    // all generated from the list below. That is the point: nine lanes × three surfaces is
    // twenty-seven places a column could be added to two of and forgotten in the third,
    // which is exactly the drift that produced the hand-maintained parallel lists this
    // file has already had to collapse twice. A column added here appears in all three by
    // construction, or in none.
    //
    // FIELD FLAGS
    //   ro      read-only — shown in the table, never offered in the modal (ids, and the
    //           AI provenance the engineer must not retype)
    //   opts    closed vocabulary — a <select> in the modal; the lane's setter still
    //           refuses an off-list value, so this is convenience, not the guard
    //   optsFn  vocabulary computed at open time (the assumption register)
    //   area    long free text — a <textarea> in the modal
    //   w       column width hint; long prose columns get a max-width so one cell cannot
    //           squeeze every other column to nothing
    //   mono    monospaced display (ids and citations, where character shape matters)
    var HF_SCHEMA = {
        tid: {
            title: 'task step', store: 'tid', idField: 'taskId', kind: 'hfTid', render: 'renderTid',
            save: { mode: 'index', fn: 'setTid' },
            // The lane's doctrine, kept visible in the row: an uncited step is a step
            // somebody invented, and it carries the amber left edge it always has.
            rowStyle: function (r) { return String(r.source || '').trim() ? '' : 'border-left:3px solid #B7791F;'; },
            cols: [
                { k: 'taskId',   label: 'Task ID',   ro: true, mono: true, w: '90px' },
                { k: 'procId',   label: 'Proc ID',   w: '80px', mono: true },
                { k: 'procName', label: 'Procedure', w: '160px' },
                { k: 'opsMode',  label: 'Mode',      opts: 'TID_MODES', w: '110px' },
                { k: 'phase',    label: 'Phases',    optsFn: 'projectPhases', multi: true, w: '130px' },
                { k: 'taskName', label: 'Task step', w: '200px' },
                { k: 'taskDef',  label: 'Definition', area: true, w: '260px' },
                { k: 'crew',     label: 'Crew',      opts: 'TID_CREW', optsDefs: 'TID_CREW_DEFS', legend: TID_CREW_LEGEND, w: '100px' },
                { k: 'trigger',  label: 'Trigger',   w: '180px' },
                { k: 'source',   label: 'Source',    mono: true, w: '160px' },
                { k: 'notes',    label: 'Notes',     area: true, w: '200px' }
            ]
        },
        tasks: {
            title: 'task', store: 'tasks', idField: 'taskId', kind: 'hfTask', render: 'renderTasks',
            save: { mode: 'index', fn: 'setTask' },
            cols: [
                { k: 'taskId',     label: 'ID',    ro: true, mono: true, w: '90px' },
                { k: 'phase',      label: 'Phases', optsFn: 'projectPhases', multi: true, w: '140px' },
                { k: 'crewmember', label: 'Crew',  opts: 'TID_CREW', optsDefs: 'TID_CREW_DEFS', legend: TID_CREW_LEGEND, w: '100px' },
                { k: 'task',       label: 'Task',  w: '240px' },
                // 3 Sep 2026 — response time split into its two components (Waqas: "then we
                // should be calling it that"): reaction from the norms, execution from the
                // simulator; the sum is the response the register credits. Available time is
                // read from the mission profile; occupancy is computed. Nothing here is drafted.
                { k: 'reactionS',  label: 'Reaction (s)', w: '80px' },
                { k: 'execS',      label: 'Execution (s)', w: '80px' },
                { k: 'responseS',  label: 'Response (s)', ro: true, w: '80px', mono: true,
                  fmt: function (r) { var v = taskResponseS(r); return v == null ? null : '<span class="u-mono" style="font-size:11px; font-weight:700;">' + esc(_fmtS(v)) + '</span>'; } },
                { k: 'basis',      label: 'Basis', w: '140px' },
                { k: 'availableS', label: 'Available (s)', ro: true, w: '90px', mono: true,
                  fmt: function (r) { var a = taskAvailableS(r); if (a.s == null) return null; var tip = a.per.map(function (x) { return x.phase + ': ' + _fmtS(x.s) + ' s (' + x.src + ')'; }).join('\n'); return '<span class="u-mono" style="font-size:11px;" title="' + esc(tip) + '">' + esc(_fmtS(a.s)) + (a.derived ? ' <span style="opacity:.6;" title="Derived from the phase duration on Define → Flight Phases — no crew response window is authored for this phase yet.">≈</span>' : '') + '</span>'; } },
                { k: 'occupancy',  label: 'Occupancy', ro: true, w: '80px', mono: true,
                  fmt: function (r) { var u = taskOccupancy(r); if (u == null) return null; var pct = Math.round(u * 100); var col = u > 0.8 ? '#8E2A2A' : (u > 0.6 ? '#B7791F' : 'inherit'); return '<span class="u-mono" style="font-size:11px; font-weight:700; color:' + col + ';" title="Response ÷ available for this task alone; the phase-workload check sums every credited task per crew member per phase against the 80 % red line.">' + pct + '%</span>'; } },
                { k: 'channels',   label: 'Channels (HIDH)', w: '150px' },
                { k: 'asmId',      label: 'Credited', optsFn: 'asmOptions', w: '110px', mono: true,
                  fmt: function (r, t) { return t ? '<span class="u-mono" style="font-size:11px; color:#1D9E75; font-weight:700;">' + esc(t) + '</span>' : null; } },
                { k: 'notes',      label: 'Notes', area: true, w: '200px' }
            ],
            // The lane's own action, in the kebab where the worksheets put theirs (the FHA
            // carries Golden Thread and Add phase variant the same way). Credit promotes a
            // task into the typed-assumption register; offered only while it is not yet
            // credited, because a second credit on one task double-counts it.
            extra: function (r) {
                return r.asmId ? '' : '<button type="button" role="menuitem" onclick="HF_ANALYSES.creditTaskById(\'' + esc(String(r.taskId)) + '\')" title="Promote into the typed-assumption register — the task facts carry into hf metadata; the assumption starts Proposed and the conservative lane holds until validated">⤴ Credit into register</button>';
            }
        },
        hea: {
            title: 'error mode', store: 'hea', idField: 'heaId', kind: 'hfHea', render: 'renderHea',
            save: { mode: 'index', fn: 'setHea' },
            cols: [
                { k: 'heaId',     label: 'ID',        ro: true, mono: true, w: '90px' },
                { k: 'asmId',     label: 'Task (asm)', optsFn: 'asmOptions', w: '110px', mono: true },
                { k: 'task',      label: 'Task',      w: '180px' },
                { k: 'errorMode', label: 'Error mode', opts: 'ERROR_MODES', w: '120px' },
                { k: 'effect',    label: 'Effect',    area: true, w: '220px' },
                { k: 'detection', label: 'Detection', area: true, w: '200px' },
                { k: 'recovery',  label: 'Recovery',  area: true, w: '200px' },
                { k: 'fcIds',     label: 'Feeds FC',  w: '110px', mono: true }
            ]
        },
        alerts: {
            title: 'alert', store: 'alerts', idField: 'alertId', kind: 'hfAlerts', render: 'renderAlerts',
            save: { mode: 'index', fn: 'setAlert' },
            cols: [
                { k: 'alertId',  label: 'ID',       ro: true, mono: true, w: '90px' },
                { k: 'name',     label: 'Alert',    w: '220px' },
                { k: 'priority', label: 'Priority (25.1322)', opts: 'ALERT_PRIORITIES', w: '130px' },
                { k: 'modality', label: 'Modality', opts: 'ALERT_MODALITIES', w: '110px' },
                { k: 'fcIds',    label: 'Cited by FC', w: '120px', mono: true },
                { k: 'notes',    label: 'Notes',    area: true, w: '240px' }
            ]
        },
        ergo: {
            title: 'evaluation', store: 'ergo', idField: 'ergoId', kind: 'hfErgo', render: 'renderErgo',
            save: { mode: 'index', fn: 'setErgo' },
            cols: [
                { k: 'ergoId',  label: 'ID',      ro: true, mono: true, w: '90px' },
                { k: 'item',    label: 'Item',    w: '220px' },
                { k: 'clause',  label: 'Criterion (cite)', w: '180px', mono: true },
                { k: 'finding', label: 'Finding', area: true, w: '300px' },
                { k: 'status',  label: 'Status',  opts: 'ERGO_STATUS', w: '100px' },
                { k: 'notes',   label: 'Notes',   area: true, w: '200px' }
            ]
        },
        cd: {
            title: 'evaluation', store: 'cd', idField: 'cdId', kind: 'hfCd', render: 'renderCd',
            save: { mode: 'index', fn: 'setCd' },
            cols: [
                { k: 'cdId',          label: 'ID',   ro: true, mono: true, w: '90px' },
                { k: 'item',          label: 'Item', w: '220px' },
                { k: 'kind',          label: 'Kind', opts: 'CD_KINDS', w: '120px' },
                { k: 'consideration', label: '§25.1302 consideration', opts: 'CD_CONSIDERATIONS', w: '220px' },
                { k: 'supports',      label: 'Supports', w: '160px' },
                { k: 'finding',       label: 'Finding',  area: true, w: '300px' },
                { k: 'status',        label: 'Status',   opts: 'CD_STATUS', w: '100px' },
                { k: 'notes',         label: 'Notes',    area: true, w: '200px' }
            ]
        },
        sa: {
            title: 'SA element', store: 'sa', idField: 'saId', kind: 'hfSa', render: 'renderSa',
            save: { mode: 'index', fn: 'setSa' },
            cols: [
                { k: 'saId',    label: 'ID',         ro: true, mono: true, w: '90px' },
                { k: 'element', label: 'SA element', w: '220px' },
                { k: 'level',   label: 'Level',      opts: 'SA_LEVELS', w: '150px' },
                { k: 'cue',     label: 'Cue / source', area: true, w: '260px' },
                { k: 'phase',   label: 'Phase',      w: '120px' },
                { k: 'finding', label: 'Finding',    area: true, w: '260px' },
                { k: 'status',  label: 'Status',     opts: 'SA_STATUS', w: '100px' },
                { k: 'notes',   label: 'Notes',      area: true, w: '200px' }
            ]
        },
        // The two KEYED lanes. Their rows are not created or deleted by the engineer — the
        // allocation lane mirrors the live functions list and the minimum-flight-crew lane
        // is the six Appendix D functions fixed by the rule — so they get Edit and Traces
        // but never Duplicate or Delete. Their free-text columns are the ones that were
        // worst hit by the input-width problem, which is why they are in this change.
        alloc: {
            title: 'allocation', store: 'alloc', idField: 'key', kind: 'hfAlloc', render: 'renderAlloc',
            save: { mode: 'key', fn: 'setAlloc' }, fixedRows: true,
            cols: [
                { k: 'subId',      label: 'Sub-function', ro: true, mono: true, w: '110px' },
                { k: 'subName',    label: 'Name',         ro: true, w: '220px' },
                { k: 'allocation', label: 'Allocated to', opts: 'ALLOCATIONS', w: '130px' },
                { k: 'rationale',  label: 'Rationale',    area: true, w: '380px' }
            ]
        },
        // The ten Appendix D workload FACTORS. Not a store of their own — they live on the
        // mfc record as an array of dispositions — but a table the engineer reads and
        // edits, so they take the same treatment: text cells, a kebab, the modal.
        mfcFactor: {
            title: 'workload factor', store: 'mfc', idField: 'idx', kind: null, render: 'renderMfc',
            save: { mode: 'factor', fn: 'setMfcFactor' }, fixedRows: true,
            cols: [
                { k: 'idx',         label: '#',      ro: true, mono: true, w: '50px' },
                { k: 'factor',      label: 'Factor', ro: true, w: '320px' },
                { k: 'disposition', label: 'Disposition', area: true, w: '420px' }
            ]
        },
        mfc: {
            title: 'workload function', store: 'mfc', idField: 'key', kind: 'hfMfc', render: 'renderMfc',
            save: { mode: 'key', fn: 'setMfcFn' }, fixedRows: true,
            cols: [
                { k: 'label',   label: 'Workload function', ro: true, w: '240px' },
                { k: 'role',    label: 'Assigned', opts: 'MFC_ROLES', w: '120px' },
                { k: 'bedford', label: 'Bedford',  w: '90px' },
                { k: 'note',    label: 'Basis / note', area: true, w: '380px' }
            ]
        }
    };
    // Vocabularies addressed by name from the schema, so a column declares its list rather
    // than closing over one and the modal can resolve it without a switch. Every name here
    // is a list the lane ALREADY declares — the schema names them, it never restates them,
    // so the modal cannot offer a value the setter would refuse.
    function _hfVocab(name) {
        var V = { TID_MODES: TID_MODES, TID_CREW: TID_CREW, ERROR_MODES: ERROR_MODES,
                  ALERT_PRIORITIES: ALERT_PRIORITIES, ALERT_MODALITIES: ALERT_MODALITIES,
                  ERGO_STATUS: ERGO_STATUS, CD_KINDS: CD_KINDS, CD_CONSIDERATIONS: CD_CONSIDERATIONS,
                  CD_STATUS: CD_STATUS, SA_LEVELS: SA_LEVELS, SA_STATUS: SA_STATUS,
                  ALLOCATIONS: ALLOCATIONS, MFC_ROLES: MFC_ROLES };
        return V[name] || [];
    }
    // The one vocabulary that is computed rather than fixed: the human-factors assumptions
    // already on the register. Task and error rows credit against those ids, and a free
    // text box there would let a row cite a credit that does not exist.
    function _hfDefs(name) { return ({ TID_CREW_DEFS: TID_CREW_DEFS })[name] || {}; }
    // 3 Sep 2026 (Waqas) — the crew task's time is RESPONSE time: reaction (perceive,
    // recognise, decide — the HIDH norms) PLUS execution (measured in the simulator).
    // Both are entered, never drafted; the sum is what the register credits. A row
    // that only carries the older single timeS keeps working: it reads as the response.
    function _num(v) { var n = parseFloat(v); return (isNaN(n) || n < 0) ? null : n; }
    function taskResponseS(r) {
        if (!r) return null;
        var a = _num(r.reactionS), b = _num(r.execS);
        if (a != null || b != null) return +(((a || 0) + (b || 0)).toFixed(2));
        return _num(r.timeS);
    }
    // Time AVAILABLE comes from the mission profile (Define → Flight Phases), never typed
    // twice: the phase's authored crew response window when one exists, else the phase
    // duration (marked derived). A task spanning several phases gets the most constraining.
    function _phaseSeconds(p) {
        var d = parseFloat(p && p.duration); if (isNaN(d) || d <= 0) return null;
        var u = String((p && p.durationUnit) || 'mins');
        return u === 'seconds' ? d : (u === 'hours' ? d * 3600 : d * 60);
    }
    function taskPhases(v) { return String(v || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); }
    function taskAvailableS(r) {
        var phases = taskPhases(r && r.phase);
        var tbl = []; try { tbl = (typeof flightPhasesData !== 'undefined' ? flightPhasesData : []) || []; } catch (_) { tbl = []; }
        if (!tbl.length) return { s: null, derived: false, per: [] };
        var wanted = phases.some(function (x) { return /^all phases$/i.test(x); }) ? tbl.map(function (p) { return p.phase; }) : phases;
        var per = [];
        wanted.forEach(function (name) {
            var p = tbl.find(function (x) { return String(x.phase).trim().toLowerCase() === String(name).trim().toLowerCase(); });
            if (!p) return;
            var w = parseFloat(p.windowS);
            if (!isNaN(w) && w > 0) per.push({ phase: p.phase, s: w, src: 'response window' });
            else { var d = _phaseSeconds(p); if (d != null) per.push({ phase: p.phase, s: d, src: 'phase duration' }); }
        });
        if (!per.length) return { s: null, derived: false, per: [] };
        var min = per.reduce(function (m, x) { return (m == null || x.s < m.s) ? x : m; }, null);
        return { s: min.s, derived: min.src === 'phase duration', src: min.src, phase: min.phase, per: per };
    }
    function taskOccupancy(r) {
        var need = taskResponseS(r), av = taskAvailableS(r);
        if (need == null || av.s == null || av.s <= 0) return null;
        return need / av.s;
    }
    function _fmtS(n) { return n == null ? '' : (Math.round(n * 100) / 100).toString(); }
    // The project's own flight phases (Define → Flight Phases) as a downselect — the
    // same list the FHA lane constrains itself to. "All phases" stays available.
    function _projectPhaseOptions() {
        var ph = [];
        try { ph = ((typeof flightPhasesData !== 'undefined' ? flightPhasesData : []) || []).map(function (p) { return String((p && p.phase) || '').trim(); }).filter(Boolean); } catch (_) { ph = []; }
        if (!ph.length) { try { ph = (typeof FLIGHT_PHASES !== 'undefined' ? FLIGHT_PHASES : []).slice(); } catch (_) { ph = []; } }
        if (ph.indexOf('All phases') < 0) ph.push('All phases');
        return ph;
    }
    function _hfOptsFn(name) {
        if (name === 'projectPhases') return _projectPhaseOptions().map(function (v) { return { v: v, label: v }; });
        if (name === 'asmOptions') {
            return _hfAsm().map(function (a) { return { v: String(a.asmId), label: String(a.asmId) + ' — ' + String(a.text || a.title || '').slice(0, 60) }; });
        }
        return [];
    }

    // ------------------------------------------------------------ the table
    // Rows carry their id in a data attribute so the modal, the kebab and the review cell
    // all address the same row by the same key the store uses.
    function _hfRowsOf(lane) {
        if (lane === 'mfcFactor') {
            var fst = _read('mfc'); var fac = (fst && fst.factors) || {};
            return (MFC_FACTORS || []).map(function (f, i) {
                return { idx: '(' + (i + 1) + ')', i: i, factor: f, disposition: fac[i] || '' };
            });
        }
        if (lane === 'mfc') {
            var st = _read('mfc'); var by = {};
            (st.rows || []).forEach(function (r) { by[String(r.key)] = r; });
            return (MFC_FUNCTIONS || []).map(function (f) {
                var r = by[String(f.key)] || {};
                return { key: f.key, label: f.label, role: r.role || '', bedford: r.bedford || '', note: r.note || '', aiGenerated: r.aiGenerated, aiModel: r.aiModel, aiCite: r.aiCite };
            });
        }
        if (lane === 'alloc') {
            var arows = _read('alloc').rows || []; var ab = {};
            arows.forEach(function (r) { ab[String(r.key)] = r; });
            return _functions().map(function (f) {
                var r = ab[String(f.internalId)] || {};
                return { key: f.internalId, subId: f.subId, subName: f.subName,
                         allocation: r.allocation || '', rationale: r.rationale || '',
                         aiGenerated: r.aiGenerated, aiModel: r.aiModel, aiCite: r.aiCite };
            });
        }
        return (_read(HF_SCHEMA[lane].store) || {}).rows || [];
    }
    function _hfDisplay(col, row) {
        var v = row[col.k];
        var t = (v == null || String(v) === '') ? '' : String(v);
        // A column may draw itself (the credited-assumption id shows green, because a
        // credit taken is a different state from a credit merely recorded).
        if (typeof col.fmt === 'function') { var f = col.fmt(row, t); if (f != null) return f; }
        if (!t) return '<span style="color:var(--color-text-tertiary);">—</span>';
        var s = esc(t);
        if (col.mono) return '<span class="u-mono" style="font-size:11px;">' + s + '</span>';
        return s;
    }
    // The whole table, in the worksheets' own layout: the row-actions kebab FIRST, the
    // built-in columns in schema order, the Review cell LAST. Matching that order is not
    // cosmetic — the shared kebab positioner, the selection layer and mass_actions all
    // expect to find the action cell where every other worksheet puts it.
    function _hfTableHtml(lane) {
        var cfg = HF_SCHEMA[lane]; if (!cfg) return '';
        var rows = _hfRowsOf(lane);
        if (!rows.length) return '';
        var head = '<tr><th style="width:52px;">Actions</th>' + cfg.cols.map(function (c) {
            return '<th' + (c.w ? ' style="min-width:' + c.w + ';"' : '') + (c.legend ? ' title="' + esc(c.legend) + '"' : '') + '>' + c.label + (c.legend ? ' <span aria-hidden="true" style="opacity:.55;font-weight:400;">\u24d8</span>' : '') + '</th>';
        }).join('') + (cfg.kind ? _revTh() : '') + '</tr>';
        var body = rows.map(function (r) {
            var id = r[cfg.idField];
            var tds = cfg.cols.map(function (c) {
                return '<td' + (c.w ? ' style="max-width:' + c.w + ';"' : '') + '>' + _hfDisplay(c, r) + '</td>';
            }).join('');
            var rs = (typeof cfg.rowStyle === 'function') ? (cfg.rowStyle(r) || '') : '';
            return '<tr data-hf-id="' + esc(String(id)) + '"' + (rs ? ' style="' + rs + '"' : '') + '>' +
                '<td>' + _hfActions(lane, cfg.kind, id) + '</td>' + tds + (cfg.kind ? _revTd(cfg.kind, id) : '') + '</tr>';
        }).join('');
        return '<div style="overflow-x:auto; margin-bottom:16px;">' +
            '<table class="data-table hfx-table" style="width:100%; font-size:12px;">' +
            '<thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
    }

    // ------------------------------------------------------------- the modal
    // The house pattern (.modal-overlay > .modal > .modal-head/.modal-body/.modal-foot),
    // the same one the template editor and the golden-thread panel use, so it inherits the
    // app's dark mode, focus ring and scroll behaviour rather than restating them.
    var _hfEditCtx = null;
    function closeHfEdit() {
        var el = document.getElementById('hf-edit-overlay');
        if (el) el.remove();
        _hfEditCtx = null;
    }
    function openHfEdit(lane, id) {
        if (typeof document === 'undefined') return;
        var cfg = HF_SCHEMA[lane]; if (!cfg) return;
        var rows = _hfRowsOf(lane);
        var row = null;
        for (var i = 0; i < rows.length; i++) { if (String(rows[i][cfg.idField]) === String(id)) { row = rows[i]; break; } }
        if (!row) return;
        closeHfEdit();
        _hfEditCtx = { lane: lane, id: String(id) };

        var fields = cfg.cols.map(function (c) {
            var val = row[c.k] == null ? '' : String(row[c.k]);
            var fid = 'hfe-' + c.k;
            var label = '<label style="display:block; font-size:11px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; color:var(--color-text-tertiary); margin-bottom:4px;">' + c.label + '</label>';
            if (c.ro) {
                return '<div>' + label + '<div class="u-mono" style="font-size:12px; padding:7px 9px; border:1px dashed var(--color-border-hair); border-radius:6px; color:var(--color-text-secondary); background:var(--color-surface-2);">' +
                    ((typeof c.fmt === 'function' && c.fmt(row, val)) || (val ? esc(val) : '—')) + '</div></div>';
            }
            var common = 'id="' + fid + '" data-hf-field="' + c.k + '" style="width:100%; font:inherit; font-size:12.5px; padding:7px 9px; border:1px solid var(--color-border-strong); background:var(--color-surface-2); color:inherit; border-radius:6px;"';
            if (c.opts || c.optsFn) {
                var _defs = c.optsDefs ? _hfDefs(c.optsDefs) : null;
                var list = c.opts ? _hfVocab(c.opts).map(function (v) { return { v: v, label: (_defs && _defs[v]) ? (v + ' — ' + _defs[v]) : v }; }) : _hfOptsFn(c.optsFn);
                if (c.multi) {
                    // 3 Sep 2026 — a task can span phases (Waqas): one checkbox per option,
                    // saved as the same comma-separated set the FHA uses for its phases.
                    var chosen = taskPhases(val).map(function (x) { return x.toLowerCase(); });
                    var boxes = list.map(function (o) {
                        var on = chosen.indexOf(String(o.v).toLowerCase()) >= 0;
                        return '<label style="display:inline-flex; align-items:center; gap:5px; margin:0 10px 6px 0; font-size:12px; text-transform:none; letter-spacing:0; font-weight:500;"><input type="checkbox" data-hf-multi="' + c.k + '" value="' + esc(o.v) + '"' + (on ? ' checked' : '') + '> ' + esc(o.label) + '</label>';
                    }).join('');
                    return '<div style="grid-column:1 / -1;">' + label + '<div data-hf-field="' + c.k + '" data-hf-multi-group="1" style="padding:6px 0 0;">' + boxes + '</div></div>';
                }
                var opts = ['<option value="">—</option>'].concat(list.map(function (o) {
                    return '<option value="' + esc(o.v) + '"' + (String(o.v) === val ? ' selected' : '') + '>' + esc(o.label) + '</option>';
                })).join('');
                return '<div>' + label + '<select ' + common + '>' + opts + '</select></div>';
            }
            if (c.area) {
                return '<div style="grid-column:1 / -1;">' + label + '<textarea rows="3" ' + common + '>' + esc(val) + '</textarea></div>';
            }
            return '<div>' + label + '<input type="text" ' + common + ' value="' + esc(val) + '"></div>';
        }).join('');

        // AI provenance, shown rather than hidden: the reviewer about to change a row is
        // entitled to know a model wrote it and from which sentence.
        var prov = row.aiGenerated
            ? '<div style="grid-column:1 / -1; font-size:11.5px; color:var(--color-text-tertiary); border-top:1px solid var(--color-border-hair); padding-top:10px;">' +
              'AI-drafted by ' + esc(String(row.aiModel || 'the model')) + (row.aiCite ? ' from <b>' + esc(String(row.aiCite)) + '</b>' : '') +
              ' — advisory until you approve it.</div>'
            : '';

        var ov = document.createElement('div');
        ov.className = 'modal-overlay show';
        ov.id = 'hf-edit-overlay';
        ov.innerHTML =
            '<div class="modal" style="max-width:880px;">' +
            '<div class="modal-head"><h3>Edit ' + esc(cfg.title) + ' · ' + esc(String(id)) + '</h3>' +
            '<button type="button" id="hfe-x" style="border:none;background:transparent;font-size:23px;line-height:1;cursor:pointer;color:var(--color-text-tertiary);">×</button></div>' +
            '<div class="modal-body" style="grid-template-columns:1fr 1fr;">' + fields + prov + '</div>' +
            '<div class="modal-foot" style="padding:14px 22px; display:flex; gap:10px; justify-content:flex-end;">' +
            '<button type="button" id="hfe-cancel" class="btn-cyan" style="background:var(--color-surface-2); color:inherit;">Cancel</button>' +
            '<button type="button" id="hfe-save" class="btn-cyan">Save changes</button>' +
            '</div></div>';
        document.body.appendChild(ov);
        ov.addEventListener('click', function (e) { if (e.target === ov) closeHfEdit(); });
        document.getElementById('hfe-x').onclick = closeHfEdit;
        document.getElementById('hfe-cancel').onclick = closeHfEdit;
        document.getElementById('hfe-save').onclick = function () { saveHfEdit(); };
        try { var first = ov.querySelector('input,select,textarea'); if (first) first.focus(); } catch (_) {}
    }
    // Save writes through the LANE'S OWN setter, field by field, exactly as the old
    // in-cell inputs did. Nothing here assigns to a row object: every vocabulary guard the
    // lane enforces on a typed value still fires, and a value the lane refuses is simply
    // not written — the same refusal the engineer would have seen in the cell.
    function saveHfEdit() {
        if (!_hfEditCtx || typeof document === 'undefined') return false;
        var lane = _hfEditCtx.lane, id = _hfEditCtx.id;
        var cfg = HF_SCHEMA[lane]; if (!cfg) return false;
        var rows = _hfRowsOf(lane);
        var idx = -1;
        for (var i = 0; i < rows.length; i++) { if (String(rows[i][cfg.idField]) === String(id)) { idx = i; break; } }
        if (idx < 0) { closeHfEdit(); return false; }
        var ov = document.getElementById('hf-edit-overlay'); if (!ov) return false;
        cfg.cols.forEach(function (c) {
            if (c.ro) return;
            var el = ov.querySelector('[data-hf-field="' + c.k + '"]');
            if (!el) return;
            var v;
            if (typeof el.getAttribute === 'function' && el.getAttribute('data-hf-multi-group')) {
                v = Array.prototype.slice.call(el.querySelectorAll('input[type="checkbox"]:checked')).map(function (b) { return b.value; }).join(', ');
            } else { v = String(el.value == null ? '' : el.value); }
            if (cfg.save.mode === 'key') API[cfg.save.fn](rows[idx][cfg.idField], c.k, v);
            else if (cfg.save.mode === 'factor') API[cfg.save.fn](rows[idx].i, v);
            else API[cfg.save.fn](idx, c.k, v);
        });
        closeHfEdit();
        try { if (typeof API[cfg.render] === 'function') API[cfg.render](); } catch (_) {}
        return true;
    }

    // ================================================= ROW ACTIONS ====
    // AFHA-style row actions for the HF lanes (Waqas, 2 Sep 2026: "make sure the
    // tabs have CRUD and review capabilities, data actions ... and AFHA style
    // actions"). The worksheet tables consolidate Edit / References / Delete into
    // one kebab (helpers_modules rowActionsHTML, Phase 57); the HF lanes were still
    // carrying a bare "remove" link, which meant no duplicate, no confirm, and — the
    // part that actually costs us — no action cell for mass_actions.js to parse,
    // since that module identifies rows by reading the delete handler out of the
    // cell every other table builds.
    //
    // EDIT IS NOW THE FIRST ITEM (2 Sep 2026). Until the table refactor the HF lanes
    // edited IN PLACE — every cell was a live input — so an Edit item would have
    // re-focused a field the engineer could already click, and it was deliberately
    // absent. The cells are text now and editing happens in the modal, exactly as the
    // worksheets do it, so Edit leads the menu here for the same reason it leads theirs.
    //
    // The markup is byte-compatible with rowActionsHTML's: same wrapper class, same
    // kebab, same menu, same ram-danger delete. That is what lets the shared menu
    // positioner (and, next, the shared selection layer) work here unchanged.
    var _HF_LANES = {
        tid:    { id: 'taskId',  prefix: 'TSK-', render: 'renderTid',    label: 'task step' },
        tasks:  { id: 'taskId',  prefix: 'TASK-', render: 'renderTasks', label: 'task' },
        hea:    { id: 'heaId',   prefix: 'HEA-', render: 'renderHea',    label: 'error mode' },
        alerts: { id: 'alertId', prefix: 'ALT-', render: 'renderAlerts', label: 'alert' },
        ergo:   { id: 'ergoId',  prefix: 'ERG-', render: 'renderErgo',   label: 'evaluation' },
        cd:     { id: 'cdId',    prefix: 'CD-',  render: 'renderCd',     label: 'evaluation' },
        sa:     { id: 'saId',    prefix: 'SA-',  render: 'renderSa',     label: 'SA element' }
    };
    function _laneIndexOf(lane, id) {
        var cfg = _HF_LANES[lane]; if (!cfg) return -1;
        var st = _read(lane);
        for (var i = 0; i < st.rows.length; i++) {
            if (String(st.rows[i][cfg.id]) === String(id)) return i;
        }
        return -1;
    }
    function _rerenderLane(lane) {
        var cfg = _HF_LANES[lane]; if (!cfg) return;
        try { if (typeof API[cfg.render] === 'function') API[cfg.render](); } catch (_) {}
    }
    // Delete BY ID, not by index. Index-addressed deletes are a live-rerender hazard
    // (the pager and any future sort reorder the array under the handler); the whole
    // reason the worksheets key on an id is that a row survives a re-render and a
    // position does not.
    function deleteRow(lane, id) {
        var cfg = _HF_LANES[lane]; if (!cfg) return false;
        var i = _laneIndexOf(lane, id);
        if (i < 0) return false;
        // Suppressible for a batch: mass_actions sets one gate for N rows and puts
        // the per-row confirm back in a finally. Same contract as the worksheets.
        if (!(typeof window !== 'undefined' && window.__hfBatchDelete) &&
            typeof confirm === 'function' && !confirm('Delete ' + id + '? This cannot be undone from here.')) return false;
        var st = _ensure(lane); if (!st) return false;
        st.rows.splice(i, 1);
        _save(); _rerenderLane(lane);
        return true;
    }
    // Duplicate is the HF answer to "⧉ Add phase variant" on the FHA: the same step
    // recurs in another phase, or the same control is evaluated against a second
    // §25.1302 consideration, and retyping it is how the two copies drift apart.
    // The copy lands directly BELOW its original and carries a fresh id.
    function duplicateRow(lane, id) {
        var cfg = _HF_LANES[lane]; if (!cfg) return false;
        var i = _laneIndexOf(lane, id);
        if (i < 0) return false;
        var st = _ensure(lane); if (!st) return false;
        var copy = {};
        Object.keys(st.rows[i]).forEach(function (k) { copy[k] = st.rows[i][k]; });
        copy[cfg.id] = _nextId(st.rows, cfg.id, cfg.prefix);
        // A duplicate is a NEW row in the safety argument, so it does not inherit the
        // original's promotion into the assumption register. Carrying asmId across
        // would give two rows one credit and quietly double-count it.
        if ('asmId' in copy) copy.asmId = '';
        st.rows.splice(i + 1, 0, copy);
        _save(); _rerenderLane(lane);
        return true;
    }
    // The action cell. Structure matches rowActionsHTML so the shared kebab
    // positioner and the selection layer both see what they expect.
    function _hfActions(lane, kind, id) {
        var sid = esc(String(id == null ? '' : id));
        // The keyed lanes (allocation mirrors the functions list; minimum flight crew is
        // the six Appendix D functions fixed by the rule) have rows the engineer neither
        // creates nor deletes, so they get Edit and Traces and nothing destructive.
        var fixed = !!(HF_SCHEMA[lane] && HF_SCHEMA[lane].fixedRows);
        var extra = '';
        try {
            var sch = HF_SCHEMA[lane];
            if (sch && typeof sch.extra === 'function') {
                var rowsX = _hfRowsOf(lane), rowX = null;
                for (var xi = 0; xi < rowsX.length; xi++) { if (String(rowsX[xi][sch.idField]) === String(id)) { rowX = rowsX[xi]; break; } }
                if (rowX) extra = sch.extra(rowX) || '';
            }
        } catch (_) {}
        var back = '';
        if (kind && typeof window !== 'undefined' && typeof window.openBackrefPanel === 'function') {
            back = '<button type="button" role="menuitem" class="backref-trigger" ' +
                'title="Traces to / used by — every artifact linked to this row" aria-label="Traces to / used by" ' +
                'onclick="openBackrefPanel({kind:\'' + kind + '\', id: \'' + sid + '\'})">⇋ Traces to / Used by</button>';
        }
        return '<div class="row-actions">' +
            '<button type="button" class="row-kebab" aria-label="Row actions" aria-haspopup="true" onclick="toggleRowMenu(event)">⋮</button>' +
            '<div class="row-action-menu" role="menu">' +
            '<button type="button" role="menuitem" onclick="HF_ANALYSES.openHfEdit(\'' + lane + '\', \'' + sid + '\')">✎ Edit</button>' +
            (fixed ? '' : '<button type="button" role="menuitem" onclick="HF_ANALYSES.duplicateRow(\'' + lane + '\', \'' + sid + '\')" title="Copy this row below with a fresh id — the credited-assumption link is deliberately not carried across">⧉ Duplicate</button>') +
            back + extra +
            (fixed ? '' : '<button type="button" role="menuitem" class="ram-danger" onclick="HF_ANALYSES.deleteRow(\'' + lane + '\', \'' + sid + '\')">✕ Delete</button>') +
            '</div></div>';
    }

    // ============================== THE CROSS-LANE BANNER =====================
    // A lane's own findings can only see the lane. The breaks that matter most sit
    // BETWEEN lanes — a step identified and never analysed, an error row citing a failure
    // condition the FHA does not carry, a cue no display provides — and until now those
    // were computed in the AI module and shown only in the Quality Scorecard, which is a
    // panel you have to think to open.
    //
    // Waqas, 2 Sep 2026: "the scorecard and in lane banner". So the same findings, from
    // the same function, are drawn HERE — above the teaching card and above the lane's own
    // findings, because a break with the lane next door outranks a local gap — where the
    // engineer is already standing when they would fix it.
    //
    // Reads through the AI module's own accessor rather than recomputing: two
    // implementations of one rule is how a lane and a gate come to disagree, and the gate
    // is the one that blocks a deploy. Absent module → empty string, silently: the HF
    // lanes must stay usable, and testable in node, with no AI module loaded at all.
    function _xlaneBanner(lane) {
        try {
            var API = (typeof window !== 'undefined') ? window.SafetyLabAI : null;
            if (!API || typeof API.hfConsistencyFor !== 'function') return '';
            var fs = API.hfConsistencyFor(lane) || [];
            if (!fs.length) return '';
            return fs.map(function (f) {
                var high = f.sev === 'high';
                var col = high ? '#8E2A2A' : '#B7791F';
                var items = (f.items || []).slice(0, 6).map(function (t) { return esc(String(t)); }).join('<br>');
                var more = (f.items || []).length > 6 ? ('<br>… and ' + ((f.items || []).length - 6) + ' more') : '';
                return '<div class="hfx-finding hfx-xlane u-mono" style="font-size:11px; color:' + col +
                    '; border:1px solid ' + col + '55; border-radius:5px; padding:8px 12px; margin-bottom:10px;">' +
                    '<b>' + esc(f.label) + '</b>' +
                    (high ? ' <span style="opacity:.75;">— blocks sign-off until resolved or dispositioned</span>' : '') +
                    '<div style="margin-top:5px; line-height:1.55;">' + items + more + '</div>' +
                    '<div style="margin-top:5px; opacity:.7;">Cross-lane \u2014 this one is about how this lane agrees with the rest of the assessment, not about a single row.</div>' +
                    '</div>';
            }).join('');
        } catch (_) { return ''; }
    }

    // ============================================== AI PROVENANCE ON A ROW ====
    // Waqas, 2 Sep 2026: "same rigor in review and sign offs will be required as is
    // the case with other AI drafted analyses."
    //
    // Every other AI-written lane in the product stamps its rows — aiGenerated,
    // aiModel, aiAt, aiFeature — and the whole assurance chain reads those stamps: the
    // AI provenance audit view lists them, the Quality Scorecard grades them, and the
    // hard gate refuses to call a project validated while an AI-authored number or an
    // invented reference is still standing in one. The HF lanes wrote through their own
    // setters and carried no stamp at all, so a drafted row was indistinguishable from a
    // typed one and the entire chain reported zero HF rows on a project full of them.
    // That is not a lighter standard for human factors; it is human factors sitting
    // outside the standard entirely.
    //
    // The lane owns the write, as it owns every other write. The AI module hands over
    // what it knows and this function places it, so the store is never reached into from
    // outside and no field lands that the lane has not agreed to carry.
    //
    // The stamp is METADATA, never analysis. It records who drafted the row and from
    // which sentence — it asserts nothing about whether the row is right, which is
    // exactly what the reviewer's approve/sign is for.
    var _AI_STAMP_LANES = {
        tid: 'taskId', tasks: 'taskId', hea: 'heaId', alerts: 'alertId',
        ergo: 'ergoId', cd: 'cdId', sa: 'saId', alloc: 'key', mfc: 'key'
    };
    function stampAi(lane, id, meta) {
        var idField = _AI_STAMP_LANES[lane];
        if (!idField || id == null || String(id) === '') return false;
        var st = _read(lane);
        var rows = (st && Array.isArray(st.rows)) ? st.rows : [];
        var row = null;
        for (var i = 0; i < rows.length; i++) {
            if (String(rows[i][idField]) === String(id)) { row = rows[i]; break; }
        }
        if (!row) return false;
        meta = meta || {};
        row.aiGenerated = true;
        row.aiModel = String(meta.model || '');
        row.aiAt = String(meta.at || new Date().toISOString());
        row.aiFeature = String(meta.feature || '');
        row.aiLane = String(meta.lane || lane);
        // Skills V1.3 — WHICH INSTRUCTIONS drafted this row: skillId@vN#bodyHash/cfgHash.
        // Every other AI-written lane in the product carries aiSkill and the HF lanes did
        // not, which is what made their output unauditable: a row you cannot trace to the
        // exact prompt that produced it cannot be part of a consistency claim.
        if (meta.skill) row.aiSkill = String(meta.skill);
        // The citation the row was drafted from, kept as its own field rather than only
        // in prose: an uncited AI row is a finding the consistency sweep can count, and
        // it cannot count what is buried inside a notes string.
        if (meta.cite) row.aiCite = String(meta.cite);
        _save();
        return true;
    }
    // Read side for the assurance chain — every AI-stamped row in the project, with the
    // lane it belongs to and the id the review comments and approvals are keyed on.
    function aiRows() {
        var out = [];
        Object.keys(_AI_STAMP_LANES).forEach(function (lane) {
            var idField = _AI_STAMP_LANES[lane];
            var st = _read(lane);
            ((st && st.rows) || []).forEach(function (r) {
                if (r && r.aiGenerated) out.push({ lane: lane, id: r[idField], row: r });
            });
        });
        return out;
    }

    // ------------------------------------------------------------- wiring
    var API = {
        setAlloc: setAlloc, allocFindings: allocFindings, renderAlloc: renderAlloc,
        addHea: addHea, setHea: setHea, removeHea: removeHea, heaFindings: heaFindings, renderHea: renderHea,
        addAlert: addAlert, setAlert: setAlert, removeAlert: removeAlert, alertFindings: alertFindings, renderAlerts: renderAlerts,
        addTask: addTask, setTask: setTask, removeTask: removeTask, creditTask: creditTask, creditTaskById: creditTaskById, renderTasks: renderTasks,
        addTid: addTid, setTid: setTid, removeTid: removeTid, renderTid: renderTid, tidFindings: tidFindings, TID_MODES: TID_MODES, TID_CREW: TID_CREW, TID_CREW_DEFS: TID_CREW_DEFS, projectPhaseOptions: _projectPhaseOptions, taskResponseS: taskResponseS, taskAvailableS: taskAvailableS, taskOccupancy: taskOccupancy, taskPhases: taskPhases,
        addErgo: addErgo, setErgo: setErgo, removeErgo: removeErgo, renderErgo: renderErgo,
        addCd: addCd, setCd: setCd, removeCd: removeCd, renderCd: renderCd, cdFindings: cdFindings, CD_KINDS: CD_KINDS, CD_CONSIDERATIONS: CD_CONSIDERATIONS,
        addSa: addSa, setSa: setSa, removeSa: removeSa, renderSa: renderSa, saFindings: saFindings, SA_LEVELS: SA_LEVELS,
        renderMfc: renderMfc, setMfcFn: setMfcFn, setMfcFactor: setMfcFactor, setMfcConclusion: setMfcConclusion, mfcFindings: mfcFindings, MFC_FUNCTIONS: MFC_FUNCTIONS, MFC_FACTORS: MFC_FACTORS,
        deleteRow: deleteRow, duplicateRow: duplicateRow, _HF_LANES: _HF_LANES,
        stampAi: stampAi, aiRows: aiRows, _AI_STAMP_LANES: _AI_STAMP_LANES,
        openHfEdit: openHfEdit, saveHfEdit: saveHfEdit, closeHfEdit: closeHfEdit, HF_SCHEMA: HF_SCHEMA, _hfTableHtml: _hfTableHtml, _hfRowsOf: _hfRowsOf,
        _read: _read, _functions: _functions, setAllocBySubId: setAllocBySubId, ALLOCATIONS: ALLOCATIONS, ERROR_MODES: ERROR_MODES, ERGO_STATUS: ERGO_STATUS,
        ALERT_PRIORITIES: ALERT_PRIORITIES, ALERT_MODALITIES: ALERT_MODALITIES,
    };
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        (function wire() {
            if (typeof window.switchTab === 'function' && !window.switchTab._hfxWrapped) {
                var orig = window.switchTab;
                var VIEWS = { 'hfa-tid': renderTid, 'hfa-alloc': renderAlloc, 'hfa-hea': renderHea, 'hfa-alerts': renderAlerts, 'hfa-cd': renderCd, 'hfa-sa': renderSa, 'hfa-mfc': renderMfc };
                var wrapped = function (tabId) {
                    var r = orig.apply(this, arguments);
                    try {
                        Object.keys(VIEWS).forEach(function (id) {
                            var v = document.getElementById('view-' + id);
                            if (v) v.style.display = (tabId === id) ? 'block' : 'none';
                        });
                        if (VIEWS[tabId]) VIEWS[tabId]();
                    } catch (_) {}
                    return r;
                };
                wrapped._hfxWrapped = true;
                window.switchTab = wrapped;
            } else if (typeof window.switchTab !== 'function' && typeof window.addEventListener === 'function') {
                window.addEventListener('DOMContentLoaded', function () { setTimeout(wire, 700); });
            }
        })();
    }
    if (typeof window !== 'undefined') window.HF_ANALYSES = API;
    if (typeof module !== 'undefined') module.exports = API;
})();
