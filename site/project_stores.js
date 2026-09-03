/* ============================================================================
 * project_stores.js — v1.0 — ONE declaration of what a project is.
 * ----------------------------------------------------------------------------
 * WHY THIS EXISTS
 *
 * Six places independently answered the question "what is in a project":
 *
 *   _snapshotProject()        helpers_modules   — the local autosave + undo snapshot
 *   _buildProjectSnapshot()   helpers_modules   — the cloud push
 *   _slabBuildProjectExport() misc_fn_modules   — the .slab file export
 *   initNewProjectState()     misc_fn_modules   — what a new project clears
 *   _applyProjectData()       data_ops_modules  — recovery / undo / resume / tab-guard load
 *   _restoreProjectSnapshot() helpers_modules   — open-from-cloud
 *
 * They were maintained by eye and they drifted. Every drift cost real data:
 *
 *   • stpaData was missing from the cloud push AND the local autosave — the whole
 *     STPA lane vanished on reload. Fixed once, by hand, in one of them.
 *   • flightPhasesData was missing from the reset until 1 Aug 2026, so a new project
 *     inherited the previous aircraft's phase table and every exposure ratio was
 *     computed against the wrong mission length. A year of wrong denominators.
 *   • itemsData, projectBaselines, autoReqTemplateOverrides and projectReportEdits
 *     were missing from the reset — a blank project came up holding 16 LRUs from
 *     the Aeolus demo (measured on production, 20 Aug 2026).
 *   • autoReqTemplateOverrides and projectReportEdits were missing from the CLOUD
 *     push — 0 of 411 stored documents contained either, so every save-and-reopen
 *     silently discarded every word of per-section report prose a user had written.
 *   • projectTemplates was missing from _applyProjectData — saved by everything,
 *     read back by open-from-cloud, and dropped by undo, refresh-recovery and the
 *     multi-tab guard.
 *
 * WHY IT LOOKS LIKE THIS (accessor pairs, not a name list)
 *
 * The obvious shape is `STORES = ['acFunctionsData', ...]` plus `state[name] = v`.
 * That cannot work here. App state is TOP-LEVEL `let` in classic scripts, which
 * lives in the global lexical environment — NOT on `window` — so there is no object
 * to index. `eval` would bridge it and is forbidden by the CSP (see sl_env.js, which
 * exists for exactly this reason and is read-only by design).
 *
 * So each store carries its own get/set closure. Verbose once, correct forever: a new
 * store is ONE entry here instead of six edits across three files, and
 * tests/regression_project_durability asserts every consumer derives from this list.
 *
 * LOAD ORDER: this file only defines closures; nothing runs until called, long after
 * every `let` is initialised. It must load AFTER the declarations to avoid TDZ on a
 * call, which the script order in index.html guarantees.
 * ==========================================================================*/
(function () {
    'use strict';

    var A = function () { return []; };          // default: empty array
    var O = function () { return {}; };          // default: empty object

    function arr(v) { return Array.isArray(v) ? v : []; }
    function obj(v) { return (v && typeof v === 'object') ? v : {}; }
    function num(v, d) { return (typeof v === 'number' && isFinite(v) && v > 0) ? v : d; }

    // ---------------------------------------------------------------------
    // THE LIST. Order mirrors _snapshotProject so a reader can diff them by eye.
    //
    //   key        the property name in a saved document
    //   get/set    closures over the lexical binding
    //   reset      value for a NEW project
    //   coerce     how an incoming saved value is normalised on load
    //   content    counts toward "does this project hold authored work"
    //              (drives the cloud shrink guard and public.sl_doc_items in the DB)
    //   mirror     also assign to window[key] — some consumers read it off window
    //   cloudOnly  present in the cloud push only (a build stamp, not project content)
    // ---------------------------------------------------------------------
    var LIST = [
        { key: 'projectName', get: function () { return projectName; }, set: function (v) { projectName = v; },
          reset: function () { return 'Untitled Project'; },
          coerce: function (v, cur) { return (typeof v === 'string' && v.trim()) ? v : (cur || 'Untitled Project'); } },

        { key: 'acFunctionsData',   content: true, get: function () { return acFunctionsData; },   set: function (v) { acFunctionsData = v; },   reset: A, coerce: arr },
        { key: 'acFcimData',        content: true, get: function () { return acFcimData; },        set: function (v) { acFcimData = v; },        reset: A, coerce: arr },
        { key: 'acExtractedFCs',                   get: function () { return acExtractedFCs; },    set: function (v) { acExtractedFCs = v; },    reset: A, coerce: arr },
        { key: 'acFhaData',         content: true, get: function () { return acFhaData; },         set: function (v) { acFhaData = v; },         reset: A, coerce: arr },
        { key: 'acReqData',         content: true, get: function () { return acReqData; },         set: function (v) { acReqData = v; },         reset: A, coerce: arr },
        { key: 'acAssumptionsData', content: true, get: function () { return acAssumptionsData; }, set: function (v) { acAssumptionsData = v; }, reset: A, coerce: arr },
        { key: 'acAsmCounter', get: function () { return acAsmCounter; }, set: function (v) { acAsmCounter = v; },
          reset: function () { return 1; }, coerce: function (v) { return v || 1; } },

        { key: 'systemsData',   content: true, get: function () { return systemsData; },   set: function (v) { systemsData = v; },   reset: A, coerce: arr },
        // A UI cursor, not content. Deliberately dropped on load — a restored project
        // must not reopen inside whatever system the OUTGOING one had selected.
        { key: 'activeSystemId', get: function () { return activeSystemId; }, set: function (v) { activeSystemId = v; },
          reset: function () { return null; }, coerce: function () { return null; } },

        { key: 'praData',       content: true, get: function () { return praData; },       set: function (v) { praData = v; },       reset: A, coerce: arr },
        { key: 'zsaData',       content: true, get: function () { return zsaData; },       set: function (v) { zsaData = v; },       reset: A, coerce: arr },
        { key: 'cmaData',       content: true, get: function () { return cmaData; },       set: function (v) { cmaData = v; },       reset: A, coerce: arr },
        { key: 'routingData',   content: true, get: function () { return routingData; },   set: function (v) { routingData = v; },   reset: A, coerce: arr },
        { key: 'resourcesData', content: true, get: function () { return resourcesData; }, set: function (v) { resourcesData = v; }, reset: A, coerce: arr },

        // NOT content: one real project is 2.26MB of uploaded PDFs with nothing authored
        // yet, and it must not read as populated work to the shrink guard.
        { key: 'projectSourceDocs', get: function () { return projectSourceDocs; }, set: function (v) { projectSourceDocs = v; }, reset: A, coerce: arr,
          snapshot: function () { return (typeof _slabSerializeSourceDocs === 'function') ? _slabSerializeSourceDocs() : arr(projectSourceDocs); } },

        { key: 'aiAssumptions', get: function () { return aiAssumptions; }, set: function (v) { aiAssumptions = v; }, reset: A, coerce: arr },
        { key: 'fmeaData', content: true, get: function () { return fmeaData; }, set: function (v) { fmeaData = v; }, reset: A, coerce: arr },
        { key: 'fmeaCounter', get: function () { return fmeaCounter; }, set: function (v) { fmeaCounter = v; },
          reset: function () { return 1; }, coerce: function (v) { return v || 1; } },
        { key: 'itemsData', content: true, get: function () { return itemsData; }, set: function (v) { itemsData = v; }, reset: A, coerce: arr },

        { key: 'flightPhasesData', get: function () { return flightPhasesData; }, set: function (v) { flightPhasesData = v; },
          reset: function () { return (typeof newDefaultPhaseTable === 'function') ? newDefaultPhaseTable() : arr(flightPhasesData); },
          // Older saves predate the table; keeping the CURRENT one is wrong (that was the
          // 2025 bug) but so is emptying it — fall back to a fresh default table.
          coerce: function (v) { return Array.isArray(v) && v.length ? v : ((typeof newDefaultPhaseTable === 'function') ? newDefaultPhaseTable() : []); } },

        { key: 'stpaData', get: function () { return stpaData; }, set: function (v) { stpaData = v; },
          reset: function () { return SLStores.EMPTY_STPA(); },
          coerce: function (v) { return (v && v.cs) ? v : SLStores.EMPTY_STPA(); } },
        { key: 'mlData', get: function () { return mlData; }, set: function (v) { mlData = v; },
          reset: function () { return SLStores.EMPTY_ML(); },
          coerce: function (v) { return (v && Array.isArray(v.constituents)) ? v : SLStores.EMPTY_ML(); } },

        { key: 'ftaPages', content: true, get: function () { return ftaPages; }, set: function (v) { ftaPages = v; },
          reset: function () { return [SLStores.blankPage()]; },
          coerce: function (v) { return (Array.isArray(v) && v.length) ? v : [SLStores.blankPage()]; } },
        { key: 'activeFTAPageId', get: function () { return activeFTAPageId; }, set: function (v) { activeFTAPageId = v; },
          reset: function () { return (ftaPages && ftaPages[0]) ? ftaPages[0].id : null; },
          coerce: function (v) { return v || ((ftaPages && ftaPages[0]) ? ftaPages[0].id : null); } },

        { key: 'internalIdCounter', get: function () { return internalIdCounter; }, set: function (v) { internalIdCounter = v; },
          reset: function () { return 1; }, coerce: function (v) { return v || 1; } },
        { key: 'typeCounters', get: function () { return typeCounters; }, set: function (v) { typeCounters = v; },
          reset: function () { return SLStores.EMPTY_TYPE_COUNTERS(); },
          coerce: function (v) { return v || SLStores.EMPTY_TYPE_COUNTERS(); } },

        { key: 'ftaConfig', get: function () { return ftaConfig; }, set: function (v) { ftaConfig = v; },
          reset: function () { return SLStores.DEFAULT_FTA_CONFIG(); },
          coerce: function (v) { return v || SLStores.DEFAULT_FTA_CONFIG(); } },
        { key: 'projectConfig', get: function () { return projectConfig; }, set: function (v) { projectConfig = v; },
          reset: function () { return SLStores.DEFAULT_PROJECT_CONFIG(); },
          coerce: function (v) { return SLStores.normaliseProjectConfig(v || SLStores.DEFAULT_PROJECT_CONFIG()); } },

        { key: 'projectBaselines', get: function () { return projectBaselines; }, set: function (v) { projectBaselines = v; }, reset: A, coerce: arr },

        { key: 'reviewCommentsData', get: function () { return reviewCommentsData; }, set: function (v) { reviewCommentsData = v; }, reset: A, coerce: arr },
        { key: 'reviewCounter', get: function () { return reviewCounter; }, set: function (v) { reviewCounter = v; },
          reset: function () { return 1; },
          coerce: function (v) { return num(v, (Array.isArray(reviewCommentsData) ? reviewCommentsData.length : 0) + 1); } },
        { key: 'reviewApprovalsData', get: function () { return reviewApprovalsData; }, set: function (v) { reviewApprovalsData = v; }, reset: A, coerce: arr },

        // These three are read off window by their consumers, so the mirror is not
        // decoration — reports.js reads window.projectReportEdits directly.
        { key: 'autoReqTemplateOverrides', mirror: true, get: function () { return autoReqTemplateOverrides; }, set: function (v) { autoReqTemplateOverrides = v; }, reset: O, coerce: obj },
        { key: 'projectReportEdits',       mirror: true, get: function () { return projectReportEdits; },       set: function (v) { projectReportEdits = v; },       reset: O, coerce: obj },
        { key: 'projectTemplates',         mirror: true, get: function () { return projectTemplates; },         set: function (v) { projectTemplates = v; },
          reset: function () { return (typeof emptyTemplateOverrides === 'function') ? emptyTemplateOverrides() : {}; },
          coerce: function (v) { return (v && typeof v === 'object') ? v : ((typeof emptyTemplateOverrides === 'function') ? emptyTemplateOverrides() : {}); } }
    ];

    var SLStores = {
        LIST: LIST,
        keys: function () { return LIST.map(function (s) { return s.key; }); },
        contentKeys: function () { return LIST.filter(function (s) { return s.content; }).map(function (s) { return s.key; }); },
        byKey: function (k) { for (var i = 0; i < LIST.length; i++) if (LIST[i].key === k) return LIST[i]; return null; },

        // ---- shared default shapes (one definition, several call sites) ----
        blankPage: function () { return { id: 'page-' + Date.now(), name: 'Untitled Fault Tree', root: null }; },
        EMPTY_TYPE_COUNTERS: function () { return { gate: 1, basic: 1, undeveloped: 1, conditioning: 1, house: 1 }; },
        DEFAULT_FTA_CONFIG: function () { return { mode: 'bottom-up', apportion: 'equal', targetP: 0.00001, linkedFhaId: '', exposureTime: 1, exposureSource: 'auto' }; },
        DEFAULT_PROJECT_CONFIG: function () {
            return { regulation: 'Part 25', part23Class: 'IV', override: false, customLibrary: {}, piQ: 1, piE: 1,
                     markovModels: [], libraryStandard: 'MIL-HDBK-217F', libraryEnv: 'GB', libraryQuality: 'B2',
                     useStressPrediction: false, operatingTempC: 25, activationEnergyEv: 0.4 };
        },
        normaliseProjectConfig: function (c) {
            if (!c || typeof c !== 'object') c = SLStores.DEFAULT_PROJECT_CONFIG();
            if (!c.customLibrary) c.customLibrary = {};
            if (c.piQ == null) c.piQ = 1;
            if (c.piE == null) c.piE = 1;
            if (!Array.isArray(c.markovModels)) c.markovModels = [];
            if (!Array.isArray(c.interfaces)) c.interfaces = [];   // #IFACE migration-safe default
            return c;
        },
        EMPTY_ML: function () { return { constituents: [], odd: [], datasets: [], monitors: [], capture: [], captureEnabled: false, counter: 1 }; },
        EMPTY_STPA: function () {
            return { cs: { controllers: [], processes: [], actions: [], feedbacks: [], others: [], precedence: [] },
                     dispositions: {}, causeDismissals: {}, scopeFcIds: [],
                     meta: { mission: '', scope: '', boundary: '', abstractionLevel: '' },
                     losses: [], hazards: [], constraints: [], responsibilities: [], csState: 'initial', sip: {} };
        },

        // ---- the three operations every consumer needs ----------------------
        // Build a plain object of the current state.
        snapshot: function () {
            var out = {};
            LIST.forEach(function (s) {
                try { out[s.key] = s.snapshot ? s.snapshot() : s.get(); }
                catch (_) { /* binding absent in this build — omit rather than throw */ }
            });
            return out;
        },

        // Restore state from a saved document. A key the document does not carry gets
        // its coerced default — which is what MUST happen, but note this is also how a
        // PARTIAL payload wipes stores. Callers that can receive a partial document are
        // responsible for refusing it; see cloud_sync's shrink guard.
        restore: function (data) {
            data = data || {};
            LIST.forEach(function (s) {
                try {
                    var cur = s.get();
                    var v = s.coerce ? s.coerce(data[s.key], cur) : (data[s.key] !== undefined ? data[s.key] : s.reset());
                    s.set(v);
                    if (s.mirror) { try { window[s.key] = v; } catch (_) {} }
                } catch (_) {}
            });
        },

        // Clear to a brand-new project.
        reset: function () {
            LIST.forEach(function (s) {
                try {
                    var v = s.reset();
                    s.set(v);
                    if (s.mirror) { try { window[s.key] = v; } catch (_) {} }
                } catch (_) {}
            });
        },

        // How much authored work a document holds. Mirrors public.sl_doc_items() in the
        // database — the two guards must agree on what "empty" means.
        contentItems: function (doc) {
            if (!doc || typeof doc !== 'object') return 0;
            var n = 0;
            SLStores.contentKeys().forEach(function (k) { if (Array.isArray(doc[k])) n += doc[k].length; });
            // A lone rootless fault-tree page IS the empty state, not content — it is the
            // exact shape every one of the four known wipes collapsed to.
            if (n === 1 && Array.isArray(doc.ftaPages) && doc.ftaPages.length === 1 && !doc.ftaPages[0].root) n = 0;
            return n;
        }
    };

    window.SLStores = SLStores;
}());
