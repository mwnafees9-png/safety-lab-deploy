/*!
 * Safety Lab Aero — Aerospace safety analysis tool
 * (FHA, FTA / BDD, DAL allocation per ARP 4754A/4754B, AutoReq generation,
 *  PRA / ZSA / CMA / FMEA per ARP 4761A)
 *
 * Copyright © 2026. All rights reserved.
 * Patent pending — subject matter covered by one or more pending U.S. patent applications.
 *
 * Beta software — confidential. Distributed under a non-redistributable
 * beta-evaluation license. Reverse engineering, redistribution, derivative
 * works, and commercial use are prohibited without prior written permission
 * from the copyright holder. All feedback submitted during the beta period
 * is licensed back to the copyright holder under the terms of the beta
 * agreement signed with each tester.
 *
 * Each beta build carries a unique build identifier and an expiry date.
 * Build details are surfaced in the About panel, in every PDF export footer,
 * and in every saved project JSON file. If your build is past expiry,
 * contact the maintainer for a renewed build.
 */
"use strict";
// ==========================================
// RUNTIME MASTER ENGINE INFRASTRUCTURE
// ==========================================

// =====================================================================
// Phase 42 — Beta build identification.
// These two constants are substituted per-tester by build.sh; the values
// here are dev-build defaults. Do NOT edit by hand in a distributed build.
// =====================================================================
// [P2 batch 5] L31-31 moved verbatim to bindings_modules.js
// [P2 batch 5] L32-32 moved verbatim to bindings_modules.js
// [P2 batch 5] L33-33 moved verbatim to bindings_modules.js
// [P2 batch 5] L34-34 moved verbatim to bindings_modules.js

// Phase 53.8 — version banner. Bumped manually on each release so the user can
// confirm in DevTools console which build is actually loaded (file:// caches
// JS aggressively; "Disable cache" in DevTools only affects HTTP, not file://).
// If you don't see this exact version in console after a hard refresh, you're
// still running cached code — close all tabs of this file and reopen.
const SAFETY_LAB_VERSION = 'p56.5 (2026-05-26) — Phase 56.13 Paywall enforcement. Must subscribe to access (Electra and other comped domains stay free Pro+). Default license tier changed from "pro-plus" to "unpaid"; after the existing 10-day trial expires, isPaywalled() returns true and a full-screen Subscribe modal blocks the app. Existing signups (signupDate < 2026-05-26) get a 30-day grandfather window granting Pro+ access from enforcement start; a persistent orange banner counts down days remaining. EDU tier repriced from free to $49/month. Trial users see a yellow banner counting down trial days. Signup date stamped automatically on first sign-in via setSignupEmail. Plus prior: p56.3 Reports nav dropdown, p56.10 AI bulk-draft review, p56.1 section editor, p56.0 Reports module + 9 ARP 4761A artifacts.';
try { console.log('%c[Safety Lab Aero] ' + SAFETY_LAB_VERSION, 'color: #4E63D8; font-weight: 600;'); } catch(_) {}
// [P2 batch 5] L43-43 moved verbatim to bindings_modules.js
let selectedNodeData = null;

// Core AC Domains
let acFunctionsData = []; let acFcimData = []; let acExtractedFCs = []; let acFhaData = []; let acReqData = []; let acAssumptionsData = []; let acAsmCounter = 1;
let praData = []; let zsaData = []; let cmaData = [];
// Routing-as-zone-spanning-paths (additive). A routing run is a physical path
// (harness / loom / line) that traverses multiple zones and carries one or more
// functions / items. Row shape:
//   { internalId, routingId, name, kind:'HV'|'LV'|'fuel'|'hydraulic'|'data'|'pneumatic',
//     routesThroughZones:[zoneId...], carriesFunctions:[subId...], carriesItems:[itemId...],
//     desc, history:[] }
// Used by separation / common-route analysis; persisted with the project.
let routingData = [];

// Project-wide Resources store (additive). A Resource is something systems PROVIDE
// and functions CONSUME — electrical/hydraulic/pneumatic power, fuel, etc. It is NOT
// a function. Row shape:
//   { internalId, resId, name, type:'Electrical'|'Hydraulic'|'Pneumatic'|'Fuel'|
//     'Mechanical'|'Data/Signal'|'Thermal'|'Other',
//     providedBy:[systemId...], consumedBy:[subId...], description }
// providedBy = system ids (systemsData) that PROVIDE the resource; consumedBy =
// aircraft sub-function ids (acFunctionsData.subId) that CONSUME it. Persisted
// alongside routingData on every project serialize/deserialize path. No compute coupling.
let resourcesData = [];

// AI source-document store (additive). Persisted alongside routingData so an AI
// document upload is "upload once, persisted, consumed by every feature". Each
// entry shape:
//   { id, name, addedAt, text, tables:[{title, markdown}], images:[{type, data, caption}] }
// The AI module (ai_assistant.js) writes here via window.SafetyLabSourceDocs.add(...)
// and reads it back through snapshot(). Purely a data side-car — it never feeds the
// deterministic engine / FTA math; it only grounds the advisory AI prompts.
// [P2 batch 5] L76-76 moved verbatim to bindings_modules.js
// Defensive size guards so a fat embedded diagram can never bloat / break a save.
// [P2 batch 5] L78-78 moved verbatim to bindings_modules.js
// [P2 batch 5] L79-79 moved verbatim to bindings_modules.js
// Apply the size guards to one doc (defensive; never throws). Drops oversize / overflow
// images but always keeps text + tables + image captions so the AI still has context.
// [P2 batch 6] L82-116 moved verbatim to misc_fn_modules.js
// Defensive global API the AI module uses to add/list/clear source docs. De-dups by
// name (replace), stamps id + addedAt, and runs the size guards on add so the live
// in-memory store is already persist-safe. Tolerant of being called before load.
window.SafetyLabSourceDocs = {
    add: function (doc) {
        try {
            if (!doc || typeof doc !== 'object') return null;
            if (!Array.isArray(projectSourceDocs)) projectSourceDocs = [];
            const name = String(doc.name || 'document');
            const budget = { used: 0 };
            // Recompute the budget already consumed by the docs we are keeping.
            const kept = projectSourceDocs.filter(function (d) { return d && String(d.name) !== name; });
            kept.forEach(function (d) { (Array.isArray(d.images) ? d.images : []).forEach(function (im) { budget.used += String((im && im.data) || '').length; }); });
            const stamped = _slabGuardSourceDoc({
                id: doc.id || ('doc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)),
                name: name, addedAt: Date.now(),
                text: doc.text, tables: doc.tables, images: doc.images
            }, budget);
            projectSourceDocs = kept.concat([stamped]);
            try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
            return stamped;
        } catch (_) { return null; }
    },
    list: function () { try { return Array.isArray(projectSourceDocs) ? projectSourceDocs.slice() : []; } catch (_) { return []; } },
    clear: function () { try { projectSourceDocs = []; try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} } catch (_) {} },
    get: function (id) { try { return (Array.isArray(projectSourceDocs) ? projectSourceDocs : []).find(function (d) { return d && d.id === id; }) || null; } catch (_) { return null; } },
    remove: function (id) { try { if (!Array.isArray(projectSourceDocs)) return false; const before = projectSourceDocs.length; projectSourceDocs = projectSourceDocs.filter(function (d) { return !d || d.id !== id; }); const changed = projectSourceDocs.length !== before; if (changed) { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} } return changed; } catch (_) { return false; } }
};

// ============================================================================
// AI Assumptions ledger (additive — separate AI store)
// ----------------------------------------------------------------------------
// A persisted, per-analysis record of the load-bearing assumptions each AI
// analysis declared. The AI module (ai_assistant.js) writes here from its single
// assumptions chokepoint (_parseAssumptions) via window.SafetyLabAiAssumptions.add(...).
// This is DELIBERATELY SEPARATE from the engineer-managed assumptions store
// (acAssumptionsData / sys.asm) — it never feeds those, and it never touches the
// deterministic engine / FTA / CCF math. Purely an audit side-car surfaced in the
// dedicated "AI Assumptions" tab so the AI's stated premises are visible + triageable.
// Entry shape:
//   { id, analysis, analysisLabel, scope:'aircraft'|'system'|'', systemId, systemName,
//     text, type:'independence'|'data'|'architecture'|'operational'|'other',
//     status:'Open'|'Confirmed'|'Rejected', model, at, note }
// Persisted alongside routingData (defensive Array.isArray on every load site).
// [P2 batch 5] L161-161 moved verbatim to bindings_modules.js
// Allowed enums — anything else is coerced to a safe default so a malformed write
// can never poison the ledger or the tab render.
// [P2 batch 5] L164-164 moved verbatim to bindings_modules.js
// [P2 batch 5] L165-165 moved verbatim to bindings_modules.js
// Normalise free text for de-dup matching (collapse whitespace + lowercase).
// [P2 batch 6] L167-175 moved verbatim to misc_fn_modules.js
// Defensive global API the AI module uses to add/list/triage AI assumptions. Every
// mutator schedules an autosave + re-renders the tab if open, and NEVER throws.
window.SafetyLabAiAssumptions = {
    // De-dups by (analysis + normalized text): on a re-run of the same analysis the
    // existing entry (and its status/note triage) is KEPT — we don't duplicate it.
    add: function (entry) {
        try {
            if (!entry || typeof entry !== 'object') return null;
            if (!Array.isArray(aiAssumptions)) aiAssumptions = [];
            const text = String(entry.text == null ? '' : entry.text).trim();
            if (!text) return null;
            const analysis = String(entry.analysis || '').trim();
            // #1b — sanitize walkthrough fields + citations, then let the deterministic
            // core VERIFY every citation quote against the project's source documents
            // (ai_badges.js verifier; the AI never certifies its own quotes). Guarded —
            // absent verifier ⇒ citations stored unverified, still visible.
            const _rat1b = String(entry.rationale || '').trim().slice(0, 500);
            const _ifw1b = String(entry.ifWrong || '').trim().slice(0, 500);
            const _use1b = String(entry.usedFor || '').trim().slice(0, 300);
            let _cits1b = (Array.isArray(entry.citations) ? entry.citations : []).map(function (c) {
                if (!c || typeof c !== 'object') return null;
                const q = String(c.quote || '').trim().slice(0, 400);
                if (!q) return null;
                return { doc: String(c.doc || '').trim().slice(0, 200), quote: q, where: String(c.where || '').trim().slice(0, 160),
                         verified: false, docFound: false, matchedDoc: '' };
            }).filter(Boolean).slice(0, 8);
            try {
                if (_cits1b.length && window.AiBadges && typeof window.AiBadges.verifyCitations === 'function') {
                    const _docs1b = (window.SafetyLabSourceDocs && typeof window.SafetyLabSourceDocs.list === 'function') ? window.SafetyLabSourceDocs.list() : [];
                    _cits1b = window.AiBadges.verifyCitations(_cits1b, _docs1b);
                }
            } catch (_) {}
            const _basis1b = _cits1b.length ? 'cited' : 'uncited';
            const key = analysis + '\u0000' + _aiAsmNormText(text);
            const existing = aiAssumptions.find(function (a) {
                return a && (String(a.analysis || '') + '\u0000' + _aiAsmNormText(a.text)) === key;
            });
            if (existing) {
                // keep — don't duplicate on re-runs; but if a re-run supplies the RICHER
                // record (citations / rationale) an older row lacks, carry it forward.
                // Triage (status / note) is never touched.
                try {
                    if ((!Array.isArray(existing.citations) || !existing.citations.length) && _cits1b.length) existing.citations = _cits1b;
                    if (!existing.rationale && _rat1b) existing.rationale = _rat1b;
                    if (!existing.ifWrong && _ifw1b) existing.ifWrong = _ifw1b;
                    if (!existing.usedFor && _use1b) existing.usedFor = _use1b;
                    if (existing.basis == null) existing.basis = (Array.isArray(existing.citations) && existing.citations.length) ? 'cited' : 'uncited';
                    try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
                } catch (_) {}
                return existing;
            }
            let type = String(entry.type || 'other').trim().toLowerCase();
            if (_AI_ASM_TYPES.indexOf(type) === -1) type = 'other';
            let status = String(entry.status || 'Open').trim();
            if (_AI_ASM_STATUSES.indexOf(status) === -1) status = 'Open';
            let scope = String(entry.scope || '').trim().toLowerCase();
            if (scope !== 'aircraft' && scope !== 'system') scope = '';
            const stamped = {
                id: 'aiasm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
                analysis: analysis,
                analysisLabel: String(entry.analysisLabel || analysis || 'AI analysis'),
                scope: scope,
                systemId: String(entry.systemId || ''),
                systemName: String(entry.systemName || ''),
                text: text,
                type: type,
                status: status,
                model: String(entry.model || ''),
                // Skills V1 (29 Aug 2026) — which drafting instructions were live
                // when the model declared this premise (skillId@vN#hash from the
                // ai_skills.js registry, resolved via the entry's analysis key —
                // '' when the registry is absent or the analysis has no skill).
                skill: (function () {
    var _sevPill = function (s, o) { return (typeof sevPillHtml === 'function') ? sevPillHtml(s, o) : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }; // severity pill (helpers_modules.js); safe when helpers is not loaded (test sandboxes)
                    try {
                        if (typeof window !== 'undefined' && window.SLABSkills && typeof window.SLABSkills.stampFor === 'function') {
                            // V2 — basis-aware: a Part 23 project's variant (when one
                            // exists) stamps distinctly. basisFrom is the registry's
                            // single implementation of the basis key.
                            const _bk = (typeof window.SLABSkills.basisFrom === 'function')
                                ? window.SLABSkills.basisFrom(typeof projectConfig !== 'undefined' ? projectConfig : null) : '';
                            return window.SLABSkills.stampFor(analysis, _bk) || '';
                        }
                    } catch (_) {}
                    return '';
                })(),
                at: (typeof entry.at === 'number') ? entry.at : Date.now(),
                note: String(entry.note || ''),
                // #1b — walkthrough + verified-citation payload.
                rationale: _rat1b, ifWrong: _ifw1b, usedFor: _use1b,
                citations: _cits1b, basis: _basis1b, promotedTo: ''
            };
            aiAssumptions.push(stamped);
            try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
            _aiAsmRerenderIfOpen();
            return stamped;
        } catch (_) { return null; }
    },
    // #1b — record that a Confirmed entry was promoted into the engineer-managed
    // assumptions register (the ledger keeps the audit copy; asmId links them).
    markPromoted: function (id, asmId) {
        try {
            if (!Array.isArray(aiAssumptions)) return null;
            const row = aiAssumptions.find(function (a) { return a && a.id === id; });
            if (!row) return null;
            row.promotedTo = String(asmId || '');
            try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
            _aiAsmRerenderIfOpen();
            return row;
        } catch (_) { return null; }
    },
    list: function () { try { return Array.isArray(aiAssumptions) ? aiAssumptions.slice() : []; } catch (_) { return []; } },
    setStatus: function (id, status) {
        try {
            if (!Array.isArray(aiAssumptions)) return null;
            let st = String(status || '').trim();
            if (_AI_ASM_STATUSES.indexOf(st) === -1) st = 'Open';
            const row = aiAssumptions.find(function (a) { return a && a.id === id; });
            if (!row) return null;
            row.status = st;
            try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
            _aiAsmRerenderIfOpen();
            return row;
        } catch (_) { return null; }
    },
    setNote: function (id, note) {
        try {
            if (!Array.isArray(aiAssumptions)) return null;
            const row = aiAssumptions.find(function (a) { return a && a.id === id; });
            if (!row) return null;
            row.note = String(note == null ? '' : note);
            try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
            // Note edits don't re-render (would steal focus / reset the input mid-type).
            return row;
        } catch (_) { return null; }
    },
    remove: function (id) {
        try {
            if (!Array.isArray(aiAssumptions)) return false;
            const idx = aiAssumptions.findIndex(function (a) { return a && a.id === id; });
            if (idx < 0) return false;
            aiAssumptions.splice(idx, 1);
            try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
            _aiAsmRerenderIfOpen();
            return true;
        } catch (_) { return false; }
    },
    clear: function () {
        try {
            aiAssumptions = [];
            try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
            _aiAsmRerenderIfOpen();
        } catch (_) {}
    }
};

// ---- AI Assumptions tab — rendering + triage UI -----------------------------
// Reads window.SafetyLabAiAssumptions.list(), groups rows by analysisLabel, and
// renders each group with its rows (text + type chip + scope/system + model/time +
// a status <select> and a note input). Two top filters (analysis + status) plus an
// overall count + empty state. Reuses existing tab/control classes for consistency.
// View-only over the persisted store — never touches the engine / FTA / CCF math.
// [P2 batch 5] L270-270 moved verbatim to bindings_modules.js
// Type chip colors (independent of status). Kept muted so the status pill leads.
// [P2 batch 5] L272-275 moved verbatim to bindings_modules.js
// Status pill colors: Open=amber, Confirmed=green, Rejected=gray/red.
// [P2 batch 3] L277-437 moved verbatim to support_modules.js
if (typeof window !== 'undefined') {
    window.renderAiAssumptions = renderAiAssumptions;
    window.setAiAsmFilter = setAiAsmFilter;
    window.onAiAsmStatusChange = onAiAsmStatusChange;
    window.onAiAsmNoteChange = onAiAsmNoteChange;
}

// System Domain Sandbox
let systemsData = []; 
// [P2 batch 5] L287-287 moved verbatim to bindings_modules.js

// ============================================================================
// Review / commenting (Phase 50)
// ----------------------------------------------------------------------------
// reviewCommentsData[] is a flat list of comment records. Threading is modeled
// via parentId — a root comment has parentId === null, a reply has parentId
// equal to the commentId it answers. Every comment can itself be replied to.
//
// Each comment targets one artifact via target = { kind, id, systemId? }:
//   kind:      'acFha' | 'sysFha' | 'acReq' | 'sysReq' | 'acAsm' | 'sysAsm'
//              | 'pra'  | 'zsa'   | 'cma'   | 'fmea'
//   id:        the artifact's own ID string (acFhaId, sysReqId, praId, …)
//   systemId:  only set when kind is a sys-* artifact, identifies which
//              owning system the record lives under (a system-scoped review).
//
// status: 'open' | 'resolved'. When resolved we record resolvedAt/By + an
// optional resolutionNote, and the comment hides from default views unless the
// user toggles "show resolved".
//
// activeReviewerName is the reviewer label stamped on new comments (persisted
// in localStorage so users don't have to retype it every session).
// ============================================================================
// Phase 53 — user-defined project name. Shown in the header, used as the default
// filename for saves + exports. Free text; sanitized to a filename-safe string
// when building file names but the display name keeps spaces / punctuation.
// [P2 batch 5] L313-313 moved verbatim to bindings_modules.js

// [P2 batch 5] L315-315 moved verbatim to bindings_modules.js
// [P2 batch 5] L316-316 moved verbatim to bindings_modules.js
// Phase 53.71 — Approval records. Separate from comments so an artifact's review state
// can be queried in O(1) by approvalsIndex (kind + id → record). Approving is an explicit
// reviewer action distinct from resolving a comment; cert teams need both.
// [P2 batch 5] L320-320 moved verbatim to bindings_modules.js
// [P2 batch 5] L321-324 moved verbatim to bindings_modules.js

// Labs Domain
// [P2 batch 5] L327-327 moved verbatim to bindings_modules.js
// Phase 53.61 — Items / LRUs. First-class entity between Function and Component.
// Each item has: itemId, name, type (HW/SW/HW+SW/Subsystem), dal (A-E), daType (FDAL/IDAL),
// owningSystemId (blank = aircraft-level), description, realizedByCSCI/HWCI (free text),
// traceIds[] (function subIds this item realizes), comments.
// Linked from FTA basic events (realizedByItemId) and FMEA piece-part rows (itemId).
// [P2 batch 5] L333-333 moved verbatim to bindings_modules.js
// [P2 batch 5] L334-344 moved verbatim to bindings_modules.js

let ftaPages = []; let activeFTAPageId = null;
// [P2 batch 5] L347-347 moved verbatim to bindings_modules.js

// --- IDs & Numbering (numbering.js engine) ---------------------------------
// Automated, immutable, template-driven IDs. The active scheme + counter store
// travel with the project (saved/loaded). Auto-fill only happens on CREATE and
// only when the ID field is left blank — manual entries are always respected.
// [P2 batch 5] L353-353 moved verbatim to bindings_modules.js
// [P2 batch 5] L354-354 moved verbatim to bindings_modules.js
// [P2 batch 4] L355-416 moved verbatim to helpers_modules.js
// Accessors for the numbering editor UI (numbering_ui.js). Applying a new scheme
// is forward-only — it changes how NEW IDs are minted and never renumbers
// existing items. The counter store is preserved across a scheme change.
window.SafetyLabNumberingState = {
    getScheme: function () { return slNumberingScheme; },
    setScheme: function (s) { if (s && s.templates) slNumberingScheme = s; },
    getStore:  function () { return slNumberingStore; }
};
let editStates = { acFunc: null, acFcim: null, acFha: null, acReq: null, sysFunc: null, sysFcim: null, sysFha: null, sysReq: null, pra: null, zsa: null, cma: null, fmea: null };
let ftaConfig = { mode: 'bottom-up', apportion: 'equal', targetP: 0.00001, linkedFhaId: '', exposureTime: 1, exposureSource: 'auto', missionProfileId: '' };

// Project-level safety configuration. Drives the auto-derived FTA top-event target.
//   regulation:    'Part 25' | 'Part 23'
//   part23Class:   'I' | 'II' | 'III' | 'IV'  (used only when regulation === 'Part 23')
//   override:      boolean — when true, the FTA target rate is user-editable even if a hazard is linked
//   customLibrary: { key: { name, lambda, source, group } } — overrides/additions to COMPONENT_LIBRARY
//   piQ, piE:      project-wide quality (πQ) and environment (πE) multipliers for library λ lookups
// [P2 batch 5] L373-405 moved verbatim to bindings_modules.js

// Quantitative probability targets (failures per flight hour) by regulation/class and severity.
// Sources: AC 25.1309-1A Table 1 (Part 25); AC 23.1309-1E Table 2 (Part 23 Classes I–IV).
// Numbers are *upper bounds* — i.e. the design must demonstrate < target.
// Phase 53.69 — Four-tier pricing model.
//   edu         — students + universities. Free with a verified .edu email.
//                 Strips AutoReq generation + Verification / Validation mirror trees so the
//                 product can't be used as a free replacement for paid commercial cert work.
//   pro         — all features minus AI. Includes licensed library BYOL.
//   pro-plus    — pro + AI integration (Claude / Voyage via hosted proxy or BYO key).
//   enterprise  — pro-plus + ITAR routing (Azure OpenAI) + DO-330 tool qualification kit.
//
// License tier is set via localStorage key 'safetyLab.license.tier' = one of the values above.
// In beta builds the default (no key set) is 'pro-plus' so testers can exercise everything.
// Production builds read the tier from a signed license token issued at purchase.
// [P2 batch 5] L421-421 moved verbatim to bindings_modules.js
// Tier rank — higher number includes everything lower-ranked tiers can do, with the exception
// of the EDU strip-down (EDU is *not* a subset of Pro; it's a deliberately restricted free tier).
// [P2 batch 5] L424-424 moved verbatim to bindings_modules.js

// Phase 53.69a — 10-day evaluation trial. Available on every paid tier at signup.
// During the trial the user's *effective* tier is forced to EDU (stripped AutoReq + V&V mirror
// trees) regardless of the tier they're trialing toward. This protects the high-leverage
// features from "spin up a trial, burn a cert cycle, churn" abuse and gives prospects a
// taste of the workflow + UI without giving away the value drivers.
const TRIAL_DURATION_DAYS = 10;
const TRIAL_DURATION_MS = TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;

// [P2 batch 6] L386-421 moved verbatim to misc_fn_modules.js
window.getTrialDaysRemaining = getTrialDaysRemaining;
window.isOnTrial = isOnTrial;
window.startTrial = startTrial;
window.endTrial = endTrial;
window.getTrialTargetTier = getTrialTargetTier;

// Phase 56.13 — Paywall enforcement. After the 10-day trial expires, users must
// have a paid subscription to access the app. Electra (@electra.aero) stays comped
// Pro+ forever. Existing signups (created BEFORE PAYWALL_ENFORCEMENT_START) get a
// 30-day grandfather window from enforcement start, then are paywalled like
// everyone else. EDU tier is now $49/month (was free).
const PAYWALL_ENFORCEMENT_START = new Date('2026-05-26T00:00:00Z').getTime();
const PAYWALL_GRANDFATHER_DAYS = 30;
const PAYWALL_GRANDFATHER_MS = PAYWALL_GRANDFATHER_DAYS * 24 * 60 * 60 * 1000;

// Signup-date tracking. The signup flow stamps this at first sign-in; existing users
// who never had it set are treated as having signed up at enforcement start (so they
// get the full 30-day grandfather window from "now").
// [P2 batch 6] L440-452 moved verbatim to misc_fn_modules.js
// Best-effort backfill: if a user has a signup email but no signup date, stamp it
// at enforcement start so they enter the grandfather window cleanly.
(function _backfillSignupDate() {
    try {
        const email = localStorage.getItem('safetyLab.signup.email');
        if (email && !localStorage.getItem('safetyLab.signup.signupDate')) {
            localStorage.setItem('safetyLab.signup.signupDate', String(PAYWALL_ENFORCEMENT_START));
        }
    } catch(_) {}
})();
window.getSignupDate = getSignupDate;
window.setSignupDate = setSignupDate;

// [P2 batch 6] L466-478 moved verbatim to misc_fn_modules.js
window.isInGrandfatherWindow = isInGrandfatherWindow;
window.getGrandfatherDaysRemaining = getGrandfatherDaysRemaining;

// `getLicenseTier()` returns the *persistent* tier (what the user paid for, or
// 'unpaid' if no paid subscription is recorded). `getEffectiveTier()` returns what
// they can actually exercise *right now* — during an active trial this is forced
// to 'edu'; if paywalled with no comp/trial/grandfather, it stays 'unpaid' and
// the app shows the paywall screen.
// [P2 batch 4] L596-649 moved verbatim to helpers_modules.js
window.isPaywalled = isPaywalled;
window.getLicenseTier = getLicenseTier;
window.getEffectiveTier = getEffectiveTier;

// [P2 batch 6] L492-495 moved verbatim to misc_fn_modules.js
window.isEduLicensed = isEduLicensed;
window.isProLicensed = isProLicensed;
window.isProPlusLicensed = isProPlusLicensed;
window.isEnterpriseLicensed = isEnterpriseLicensed;

// Feature capability helpers — answer "can the *current* tier do X?"
// EDU is deliberately stripped of AutoReq generation and V&V mirror trees.
// [P2 batch 6] L503-508 moved verbatim to misc_fn_modules.js
window.canUseAutoReq = canUseAutoReq;
window.canUseVerificationTree = canUseVerificationTree;
window.canUseAI = canUseAI;
window.canUseConfigBaselining = canUseConfigBaselining;
window.canUseItarRouting = canUseItarRouting;
window.canUseDO330Kit = canUseDO330Kit;

// EDU verification — accept only .edu (US) or .ac.<cc> (international academic) addresses.
// In production this would call a backend endpoint that verifies the email via magic link;
// the localStorage version below is the offline fallback used by the beta build.
// [P2 batch 6] L519-524 moved verbatim to misc_fn_modules.js
window.isEduEmail = isEduEmail;

// Phase 53.74 / 55.0.5b — Comped sign-in registries. Email DOMAINS in COMPED_FREE_DOMAINS
// grant comped status to every signup from that org (partner-level comp). Individual
// EMAILS in COMPED_FREE_EMAILS grant comped status to a single named address (founder,
// advisor, invited guest). Both lists drive the same "clean sign-in" UX — no pricing,
// no tier language — and resolve to Pro+ tier internally.
//
// Operationally these are a *handshake* gesture — the user signs up with their email,
// the tool flips to Pro+ instantly, no Stripe round-trip. When we wire a real backend
// the same lists live server-side so the comp can't be granted by clientside tampering;
// the localStorage version below is the beta-build offline fallback.
// [P2 batch 5] L585-585 moved verbatim to bindings_modules.js

// Entries can be either:
//   - a plain string   → permanent comp (e.g. founder/internal addresses)
//   - an object        → time-bounded comp { email, expiresAt: 'YYYY-MM-DD', reason }
// Time-bounded entries automatically fall back to the regular paywall path after
// their expiresAt date, so we don't need a cron to clean them up.
// [P2 batch 5] L592-598 moved verbatim to bindings_modules.js

// [P2 batch 6] L546-576 moved verbatim to misc_fn_modules.js
window.isElectraEmail = isElectraEmail;
window.isCompedEmail = isCompedEmail;
window.compedTierFor = compedTierFor;

// Signup persistence — separate from license tier so the signup flow can decide the tier
// after seeing the email. The signup record itself is just identity (email/name/org).
// [P2 batch 4] L750-789 moved verbatim to helpers_modules.js
window.getSignupEmail = getSignupEmail;
window.setSignupEmail = setSignupEmail;
window.getSignupName = getSignupName;
window.setSignupName = setSignupName;
window.getSignupOrg = getSignupOrg;
window.setSignupOrg = setSignupOrg;
window.setLicenseTier = setLicenseTier;

// User-facing upgrade prompt — wired to the existing toast system so it lands consistently.
// [P2 batch 6] L592-615 moved verbatim to misc_fn_modules.js
window.showUpgradeRequiredToast = showUpgradeRequiredToast;

// License token used to authenticate Pro+ / Enterprise calls to the Safety Lab Aero proxy.
// [P2 batch 6] L619-621 moved verbatim to misc_fn_modules.js
window.getLicenseToken = getLicenseToken;

// Display label for the currently-selected cert basis. Used in headers, FTA toolbar readouts,
// AutoReq req text, MoC catalog filter banner, PDF cover pages.
// [P2 batch 6] L626-632 moved verbatim to misc_fn_modules.js
window.certBasisDisplayLabel = certBasisDisplayLabel;

// Phase 53.55 — extended cert-basis coverage. Per-flight-hour targets for transport, normal,
// rotorcraft, eVTOL, and engine/propeller categories. Part 450 (commercial space) and Part 107
// (small UAS) intentionally have all-null targets because their risk methodology is mission-
// based / SORA-class-based, not per-flight-hour. The cert-basis selector still accepts them
// so the MoC catalog can show the right paragraphs; safety analysis on those programs uses
// QRA / SORA flows that are out of scope for the per-FH severity model.
// PROB_TARGETS / DAL_TARGETS / DAL_ORDER / SEVERITY_RANK / DAL_RANK_MAP / DO178C_DAL_CREDIT /
// DO254_DAL_CREDIT — extracted to safety_targets.js (Phase 76; byte-identical, loaded BEFORE this file).

// Lookup helper. kind: 'sw' for DO-178C (software), 'hw' for DO-254 (complex hardware).
// Returns { dal, coverage / ind, tables, kindLabel } or null when DAL unknown.
// [P2 batch 6] L646-652 moved verbatim to misc_fn_modules.js

// Phase 29.3 — Means of Compliance catalog. Curated set of certification paragraphs the safety
// engineer can reference when declaring per-requirement compliance credit. Sources:
//   • 14 CFR Part 25 — FAA airworthiness standards for transport-category aircraft
//   • CS-25 — EASA equivalent (largely paragraph-aligned with Part 25)
//   • AC 25.1309-1B — FAA advisory circular on system safety assessment
//   • AMC 25.1309 — EASA Acceptable Means of Compliance counterpart
//   • AC 20-174 — FAA acceptance of ARP4754A
// Phase 53.54 — every entry carries appliesTo[] so the MoC catalog can filter to the
// active cert basis. 'Part 25' = transport-category rulesets (14 CFR Part 25, AC 25.x, CS-25,
// AMC 25.x). 'Part 23' = normal-category rulesets (14 CFR Part 23, AC 23.x, CS-23, AMC 23.x).
// Cross-cutting standards (ARP4754A, DO-178C, etc.) carry ['Part 25', 'Part 23'].
// COMPLIANCE_CATALOGUE — extracted to catalogue_data.js (Phase 76; byte-identical, loaded BEFORE this file).
// Phase 53.54 — UI state: toggle to show all regulations regardless of cert basis.
// [P2 batch 5] L721-721 moved verbatim to bindings_modules.js
// MOC_METHODS — extracted to catalogue_data.js (Phase 76; byte-identical, loaded BEFORE this file).
// MOC_STATUS — extracted to catalogue_data.js (Phase 76; byte-identical, loaded BEFORE this file).

// ===========================================================================
// Phase 30.1 — Particular Risk Catalog
// Curated reference list of canonical particular risks per ARP4761A App L,
// AC 25.1309-1B §12, AMC 25.1309 §8.2, and the threat-specific FAA/EASA ACs.
// This is a *reference library*, not a propagation model — selecting an entry
// pre-fills the PRA form with a typical threat description, default zones of
// influence, and a baseline mitigation strategy. The analyst is expected to
// refine all fields to the specific aircraft configuration.
//
// Each entry:
//   id:            stable key
//   name:          short title used in dropdowns / tags
//   category:      Engine | Environmental | Fire | Structural | Decompression | Wheels/Tyres | Other
//   regulations:   primary regulatory paragraphs and ACs that mandate analysis
//   typicalPhases: flight phases when the risk is dominant
//   defaultDesc:   description / typical propagation envelope (analyst edits)
//   defaultMitigation: baseline mitigation strategies industry typically applies
// ===========================================================================
// PARTICULAR_RISK_CATALOGUE — extracted to catalogue_data.js (Phase 76; byte-identical, loaded BEFORE this file).
// PR_CATEGORIES — extracted to catalogue_data.js (Phase 76; byte-identical, loaded BEFORE this file).

// ============================================================================
// CERT-BASIS RISK APPLICABILITY (additive layer over the 9-value PRA riskType enum).
// ----------------------------------------------------------------------------
// NOTE ON NAMING: the task asked for a `PARTICULAR_RISK_CATALOGUE`, but that
// identifier is ALREADY taken above (line ~831) by the larger pre-fill catalog
// the PRA form / PR-catalog browser consume. To stay additive and avoid
// clobbering that load-bearing const, this applicability layer is named
// `PARTICULAR_RISK_APPLICABILITY`. The consumable surface — the function
// `applicableParticularRisks(projectConfig)` — is named exactly as requested and
// exposed on window for the PRA / AI modules.
//
// `risk` values are the canonical 9-value PRA enum (matches the PRA form dropdown
// + TEMPLATE_SCHEMAS.pra options). Each entry's `appliesTo(projectConfig, ctx)`
// predicate returns a boolean; `reason(projectConfig, ctx)` returns a human string.
// `ctx` is an optional bag of derived hints; when omitted it is derived defensively
// from itemsData. Predicates NEVER throw — every signal access is guarded.
// ============================================================================

// Derive propulsion / configuration hints from whatever signals exist. Purely
// advisory and defensive — missing data degrades to the most inclusive answer so
// the applicability layer never hides a risk the analyst might actually need.
// [P2 batch 4] L920-989 moved verbatim to helpers_modules.js
// Expose for the PRA / AI modules + any other consumer (same pattern as other shared helpers).
try {
    if (typeof window !== 'undefined') {
        window.applicableParticularRisks = applicableParticularRisks;
        window.PARTICULAR_RISK_APPLICABILITY = PARTICULAR_RISK_APPLICABILITY;
    }
} catch (_) {}

// ============================================================================
// Phase 53.67 — PR ANALYSIS MODEL SCHEMAS.
// Each particular risk type has its own structured analysis model. The model
// captures the parameters the AI (Phase 53.68) needs to reason about impact
// geometry, energy, zones affected, and likely CSFL outcomes. UI renders one
// form field per param, typed appropriately. params: arr of
//   { id, label, type: 'number'|'select'|'multiselect'|'text'|'item-ref',
//     unit?, default?, options?, help? }
// ============================================================================
// PR_MODEL_SCHEMAS — extracted to catalogue_data.js (Phase 76; byte-identical, loaded BEFORE this file).
// Map a catalog PR id → which model schema is most appropriate. Used by the
// PRA form to auto-select the right model when the user picks the threat type.
// PR_TO_MODEL_TYPE — extracted to catalogue_data.js (Phase 76; byte-identical, loaded BEFORE this file).

// Render the MoC catalog table on the Compliance tab.
// [P2 batch 6] L737-774 moved verbatim to misc_fn_modules.js
window.onMoCShowAllToggle = onMoCShowAllToggle;

// Render the compliance status matrix — every requirement that has at least one mocEntries[] item.
// [P2 batch 6] L778-812 moved verbatim to misc_fn_modules.js

// Open a tiny inline modal to add/edit MoC entries on a requirement. scope is 'ac' or 'sys-<id>'.
// [P2 batch 5] L869-900 moved verbatim to bindings_modules.js
// [P2 batch 5] L901-904 moved verbatim to bindings_modules.js
// [P2 batch 5] L905-922 moved verbatim to bindings_modules.js
// [P2 batch 5] L923-931 moved verbatim to bindings_modules.js

// =====================================================================
// Phase 29.4 — Configuration Baselines (ARP 4754B §5.5 / §6.5)
// Immutable project snapshots tagged at certification milestones (PSSA at PDR, SSA at CDR,
// per FAA / EASA submissions). Each baseline carries:
//   id, name, milestone, timestamp, signedBy, notes, hash (SHA-256), snapshot (JSON)
// =====================================================================
// [P2 batch 5] L939-939 moved verbatim to bindings_modules.js

// Phase 55.0.8 — per-project AutoReq template overrides. Maps generator key to
// { text, rat } template strings with ${var} substitution. Empty entries fall
// through to the in-code default. Persisted via _snapshotProject + save/load.
let autoReqTemplateOverrides = {};
try { if (typeof window !== 'undefined') window.autoReqTemplateOverrides = autoReqTemplateOverrides; } catch(_) {}

// Phase 56.9 — Per-project report-section edits. Keyed [reportType][sectionId] = prose.
// Persisted via _snapshotProject() + saveProject() + loadProject() so the section editor
// retains the user's edits across save / reload.
let projectReportEdits = {};
try { if (typeof window !== 'undefined') window.projectReportEdits = projectReportEdits; } catch(_) {}

// Compute SHA-256 hash of the snapshot string. Async because SubtleCrypto returns a Promise.
// [P2 batch 6] L841-956 moved verbatim to misc_fn_modules.js
// [P2 batch 5] L1165-1172 moved verbatim to bindings_modules.js

// [P2 batch 5] L1174-1180 moved verbatim to bindings_modules.js

// ============================================================================
// Phase 30.1 — PR Catalog browse modal for the PRA form
// "Browse Catalog" button on the PRA tab opens this modal; selecting an entry
// pre-fills the PRA threat / description / mitigation fields (analyst then
// refines them and ticks Affected Zones manually). The catalog entry is also
// retained on the PRA row as `prCatalogueRef` so the back-reference panel can
// surface "PR catalog → PRA usage" later.
// ============================================================================
// [P2 batch 5] L1190-1216 moved verbatim to bindings_modules.js
// [P2 batch 5] L1217-1220 moved verbatim to bindings_modules.js
// [P2 batch 5] L1221-1251 moved verbatim to bindings_modules.js


// Decrement a DAL by `n` levels, clamping at E (no further reduction possible).
// [P2 batch 4] L1477-1507 moved verbatim to helpers_modules.js

// ==========================================
// Copy / Paste + repeated-event (common-mode) handling
// Every node has a `logicalId` representing the underlying event identity:
//   - For a fresh node, logicalId === id (one-to-one).
//   - When a branch is pasted *into the same tree*, the clone preserves logicalId so cutsets,
//     visualization, and edit propagation treat the duplicates as the same logical event.
//   - When pasted into a *different tree*, fresh logicalIds are minted (cross-tree paste is
//     a clean copy, not a common-mode link).
// ==========================================
// [P2 batch 5] L1266-1266 moved verbatim to bindings_modules.js

// [P2 batch 4] L1520-1586 moved verbatim to helpers_modules.js

// Fields that describe the *event* (vs the tree position). These propagate across every node
// that shares a logicalId, so editing one instance of a common-mode event updates them all.
// [P2 batch 5] L1272-1280 moved verbatim to bindings_modules.js
// [P2 batch 3] L1759-1997 moved verbatim to support_modules.js
window.pasteSpecial = pasteSpecial;

// =============================================================================
// Phase 56.51b — Make Independent action.
// =============================================================================
// Breaks a common-mode link without requiring the user to delete + re-paste.
// Effect: the selected node gets a fresh logicalId + displayId, so the BDD
// and the cutset analysis stop treating it as the same physical event as its
// siblings. The other instances keep sharing their logicalId between
// themselves — only the chosen node is separated.
// [P2 batch 6] L1004-1029 moved verbatim to misc_fn_modules.js
window.makeNodeIndependent = makeNodeIndependent;

// =============================================================================
// Phase 56.50 — Draggable + minimizable modal utility.
// =============================================================================
// Shared infrastructure so any modal can become draggable + minimizable.
// Usage: call _makeModalDraggable(rootEl, { title, modalId }) after the modal
// element is appended to the DOM. The utility:
//   • Adds a header drag handle (cursor: move) for moving the modal around.
//   • Adds a minimize button (—) that collapses to a docked chip at
//     bottom-right of the viewport. Click chip to restore, click chip ✕ to
//     close entirely.
//   • Remembers drag position across minimize/restore; resets on close.
//   • Skips minimize-eligibility for confirm/alert dialogs (passed via
//     opts.confirm = true).
// =============================================================================
(function _initModalUtilCss() {
    if (document.getElementById('safety-lab-modal-util-css')) return;
    const style = document.createElement('style');
    style.id = 'safety-lab-modal-util-css';
    style.textContent = `
        .modal-drag-handle { cursor: move; user-select: none; }
        .modal-drag-handle:active { cursor: grabbing; }
        .modal-control-btn {
            background: transparent; border: none; cursor: pointer;
            font-size: 16px; line-height: 1; padding: 4px 8px;
            color: var(--color-text-secondary, #666); border-radius: 4px;
            transition: background 0.12s, color 0.12s;
        }
        .modal-control-btn:hover { background: rgba(0,0,0,0.08); color: var(--color-text-primary, #111); }
        .modal-minimize-btn::before { content: '—'; font-weight: 700; }
        #modal-minimize-dock {
            position: fixed; bottom: 12px; right: 12px;
            display: flex; flex-direction: row; gap: 8px;
            z-index: 9998; max-width: calc(100vw - 24px); overflow-x: auto;
            pointer-events: none;
        }
        #modal-minimize-dock .min-chip {
            pointer-events: auto;
            display: inline-flex; align-items: center; gap: 8px;
            background: var(--color-surface-1, #2a2a2c);
            color: var(--color-text-primary, #f5f5f7);
            border: 1px solid var(--color-border-thin, #3a3a3c);
            border-radius: 8px; padding: 6px 10px;
            font-size: 12px; font-family: system-ui, sans-serif;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            cursor: pointer; transition: background 0.12s;
            max-width: 220px;
        }
        #modal-minimize-dock .min-chip:hover { background: var(--color-surface-2, #3a3a3c); }
        #modal-minimize-dock .min-chip .label {
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            max-width: 160px;
        }
        #modal-minimize-dock .min-chip .restore-icon::before { content: '↗'; opacity: 0.7; }
        #modal-minimize-dock .min-chip .close-x {
            opacity: 0.55; font-size: 14px; line-height: 1;
            padding: 0 2px; cursor: pointer;
        }
        #modal-minimize-dock .min-chip .close-x:hover { opacity: 1; color: #ff453a; }
        .modal-hidden-by-minimize { display: none !important; }
    `;
    document.head.appendChild(style);
})();

// [P2 batch 4] L1701-1819 moved verbatim to helpers_modules.js

window._makeModalDraggable = _makeModalDraggable;
window._minimizeModal = _minimizeModal;
window._restoreModal = _restoreModal;

// =============================================================================
// Phase 56.38 — Cross-tree paste review modal.
// =============================================================================
// After a cross-tree paste, walk the pasted subtree and surface the merge
// outcome on every node: source snapshot vs natural-destination allocation,
// which one is being kept (conservative-merge picks the stricter), and any
// sibling rebalance that the gate-level allocator produced. The engineer can:
//   • Accept all (default) — keep the merge as computed.
//   • Revert to natural — strip all _pasteOrigin from this branch (destination
//     reallocates without any source constraint).
//   • Override individual nodes — set _pasteOverrideProb on a per-node basis
//     and re-run the allocator.
// =============================================================================
// [P2 batch 4] L1838-1981 moved verbatim to helpers_modules.js
window.openPasteReviewModal = openPasteReviewModal;

// [P2 batch 6] L1117-1120 moved verbatim to misc_fn_modules.js
window.closePasteReviewModal = closePasteReviewModal;

// [P2 batch 6] L1123-1128 moved verbatim to misc_fn_modules.js
window.onPasteModeChange = onPasteModeChange;

// Phase 56.40 — Same physical event. Restore source logicalId on every pasted
// node so the existing repeated-event machinery treats source and pasted
// instances as one shared event. Propagate field updates so they stay in sync.
// [P2 batch 6] L1134-1152 moved verbatim to misc_fn_modules.js
window.applyPasteMode_SameEvent = applyPasteMode_SameEvent;

// Phase 56.40 — CCF group. Tag every basic event in the pasted subtree AND
// every source-tree counterpart with ccfGroup + β. Both sides participate so
// the cutset expansion produces 2-of-n CCF rows across trees.
// [P2 batch 6] L1158-1188 moved verbatim to misc_fn_modules.js
window.applyPasteMode_CCFGroup = applyPasteMode_CCFGroup;

// ============================================================================
// Additive CCF tagger for an explicit set of member basic events (#143).
// ----------------------------------------------------------------------------
// applyPasteMode_CCFGroup() tags a SUBTREE (a pasted branch). The AI CCF-group
// approval gate needs to tag a non-contiguous SET of member basic events that
// the engineer accepted, identified by stable {pageId, nodeId} refs. This thin
// helper does ONLY that: it locates each named node and sets ONLY the four
// existing inline CCF fields (ccfGroup, beta, gamma, delta) — the exact same
// fields, with the exact same [0,1] clamps, that the node-config save path and
// createCcfGroupFromLibrary() already write — then drives the SAME recompute /
// render the existing CCF-config-change path uses (propagateRepeatedEventEdit →
// calculateAllProbabilities → updateD3 → scheduleAutosave). It NEVER touches the
// BDD builder, cut-set extraction, or any probability math, and adds no new node
// fields. Fully defensive: a missing page/node is skipped and reported, never
// thrown. memberRefs = [{ pageId, nodeId }, …]. Returns { applied, missing,
// nodes } so the caller can report a precise outcome.
//   beta is required (> 0 defines membership); gamma/delta are optional (MGL).
// [P2 batch 4] L2075-2125 moved verbatim to helpers_modules.js
window.applyCCFGroupToNodes = applyCCFGroupToNodes;

// [P2 batch 6] L1211-1247 moved verbatim to misc_fn_modules.js
window.acceptPasteReview = acceptPasteReview;

// [P2 batch 6] L1250-1268 moved verbatim to misc_fn_modules.js
window.revertPasteToNatural = revertPasteToNatural;

// Strip allocatedDAL (and carrier flag) from every node in every page. Run before each top-down sweep.
// [P2 batch 3] L2587-2918 moved verbatim to support_modules.js
window._missionProfiles = _missionProfiles;
window._missionProfilePhases = _missionProfilePhases;

// Total flight envelope duration, in hours, summed across a phase table (defaults to the
// project's flight phases). Pass a mission profile's phase table to size that profile.
// [P2 batch 3] L2924-3080 moved verbatim to support_modules.js
window.onCustomCertBasisFieldChange = onCustomCertBasisFieldChange;

// Build the applicable quantitative-target table for the chosen regulation/class.
// [P2 batch 4] L2199-2266 moved verbatim to helpers_modules.js

// [P2 batch 5] L1572-1572 moved verbatim to bindings_modules.js
// [P2 batch 5] L1573-1573 moved verbatim to bindings_modules.js

// Helper fetch for active system
const sys = () => systemsData.find(s => s.id === activeSystemId);

// Aggregate helper for Golden Thread
// [P2 batch 5] L1579-1579 moved verbatim to bindings_modules.js
// [P2 batch 5] L1580-1580 moved verbatim to bindings_modules.js

const formConfigs = {
    acFunc: { submitBtn: 'btn-submit-ac-func', cancelBtn: 'btn-cancel-ac-func', defaultText: 'Log Aircraft Function', fields: ['ac-func-id','ac-func-name','ac-func-def','ac-subfunc-id','ac-subfunc-name','ac-subfunc-def'] },
    acFcim: { submitBtn: 'btn-submit-ac-fcim', cancelBtn: 'btn-cancel-ac-fcim', defaultText: 'Log AC FCIM', fields: ['ac-fcim-subfunc','ac-fcim-crew','ac-fcim-tl-id','ac-fcim-tl-desc','ac-fcim-pl-id','ac-fcim-pl-desc','ac-fcim-m-id','ac-fcim-m-desc'] },
    acFha: { submitBtn: 'btn-submit-ac-fha', cancelBtn: 'btn-cancel-ac-fha', defaultText: 'Log Aircraft FHA', fields: ['ac-fha-subfunc','ac-fha-fcid','ac-fha-fcdesc','ac-fha-eff-ac','ac-fha-eff-crew','ac-fha-eff-pax','ac-fha-sev','ac-fha-asm','ac-fha-comments'], checkboxes: 'ac-fha-phases' },
    acReq: { submitBtn: 'btn-submit-ac-req', cancelBtn: 'btn-cancel-ac-req', defaultText: 'Log Requirement', fields: ['ac-req-trace', 'ac-req-level','ac-req-type','ac-req-analysis','ac-req-text','ac-req-rat'] },
    sysFunc: { submitBtn: 'btn-submit-sys-func', cancelBtn: 'btn-cancel-sys-func', defaultText: 'Log System Function', fields: ['sys-func-id','sys-func-name','sys-func-def'] },
    sysFcim: { submitBtn: 'btn-submit-sys-fcim', cancelBtn: 'btn-cancel-sys-fcim', defaultText: 'Log System FCIM', fields: ['sys-fcim-subfunc','sys-fcim-crew','sys-fcim-tl-id','sys-fcim-tl-desc','sys-fcim-pl-id','sys-fcim-pl-desc','sys-fcim-m-id','sys-fcim-m-desc'] },
    sysFha: { submitBtn: 'btn-submit-sys-fha', cancelBtn: 'btn-cancel-sys-fha', defaultText: 'Log System FHA', fields: ['sys-fha-ac-trace','sys-fha-subfunc','sys-fha-fcid','sys-fha-fcdesc','sys-fha-eff-ac','sys-fha-eff-crew','sys-fha-eff-pax','sys-fha-sev','sys-fha-asm','sys-fha-comments'], checkboxes: 'sys-fha-phases' },
    sysReq: { submitBtn: 'btn-submit-sys-req', cancelBtn: 'btn-cancel-sys-req', defaultText: 'Log Sys Requirement', fields: ['sys-req-trace', 'sys-req-level','sys-req-type','sys-req-analysis','sys-req-text','sys-req-rat'] },
    pra: { submitBtn: 'btn-submit-pra', cancelBtn: 'btn-cancel-pra', defaultText: 'Log PRA Evaluation', fields: ['pra-id','pra-threat','pra-desc','pra-systems','pra-csfl-impact','pra-mitigation'] },
    zsa: { submitBtn: 'btn-submit-zsa', cancelBtn: 'btn-cancel-zsa', defaultText: 'Log Zonal Analysis', fields: ['zsa-zone-id','zsa-desc','zsa-equip','zsa-severity','zsa-interference','zsa-mitigation'] },
    cma: { submitBtn: 'btn-submit-cma', cancelBtn: 'btn-cancel-cma', defaultText: 'Log CMA Entry', fields: ['cma-id','cma-subject','cma-claim','cma-status','cma-findings','cma-mitigation','cma-references'] },
    fmea: { submitBtn: 'btn-submit-fmea', cancelBtn: 'btn-cancel-fmea', defaultText: 'Log FMEA Entry', fields: ['fmea-id','fmea-function-link','fmea-func-mode','fmea-phase','fmea-basic-event','fmea-parent-lib','fmea-part','fmea-mode','fmea-alpha-fm','fmea-rate','fmea-time','fmea-local-effect','fmea-next-effect','fmea-end-effect','fmea-detection','fmea-severity','fmea-compensating','fmea-remarks'] }
};

// HTML-escape helper. Safe for both text and attribute contexts.
// [P2 batch 6] L1310-1323 moved verbatim to misc_fn_modules.js

// ============================================================================
// Phase 53.56 — ReqHistory: per-requirement change history with restore.
// Captures every CRUD event + AutoReq regeneration. Soft delete keeps the row
// in the store with deleted=true so it can be restored from the Deleted filter.
// History is persisted as part of the requirement row (req.history[]) so it
// rides with normal save/load.
// ============================================================================
// ReqHistory — extracted to core_modules.js (Phase 76; byte-identical, loaded before this file).

// Phase 53.64 — derivation type chip + parent reference, rendered next to the req text.
// Colors by type so the audit story is visible at a glance: top-level (blue) / allocated
// (green) / derived (purple) / refined (orange).
// [P2 batch 5] L1625-1630 moved verbatim to bindings_modules.js
// [P2 batch 4] L2327-2405 moved verbatim to helpers_modules.js

// Standard Ed/X action cell. Pass extra HTML (e.g., a "Thread" button) to append.
// Phase 53.73 — Reviewer-approval control for table rows. Returns a clickable badge
// that flips between three visual states (unapproved / approved / sign-off-voided),
// tied to Review.isApproved() + Review.getApproval(). Clicking calls toggleApproval()
// which records or revokes the sign-off and re-renders the affected table + dashboard.
// [P2 batch 5] L1638-1644 moved verbatim to bindings_modules.js
// Map the makeCRUD config `key` to the Review/Traceability `kind`. Used by the auto
// review-column appender so makeCRUD tables get the column without per-table changes.
// [P2 batch 5] L1647-1651 moved verbatim to bindings_modules.js
// [P2 batch 4] L2426-2458 moved verbatim to helpers_modules.js
// ============================================================================
// #25 — Tamper-evident multi-stage sign-off (DER-grade audit trail).
// A signed, role-staged chain stored on the approval record: each entry carries
// signer + stage + timestamp + a SHA-256 hash chained to the prior one, so any
// later edit / reorder / removal of a sign-off is detectable (verifySignoffChain).
// Decoupled from the binary approve(): a sign-off-only record never reads as
// "approved" (isApproved guards on signoffOnly). Rides on reviewApprovalsData (persisted).
// ============================================================================
const _SIGNOFF_STAGES = ['Prepared', 'Reviewed', 'Approved', 'DER-Accepted'];
// (uses the existing _sha256Hex defined with the baseline code above)
// [P2 batch 4] L2469-2568 moved verbatim to helpers_modules.js
try { window.SafetyLabSignoff = { stages: _SIGNOFF_STAGES, record: recordSignoff, chain: signoffChain, verify: verifySignoffChain, isStale: isStaleSinceSignoff }; } catch (_) {}
// [P2 batch 5] L1665-1700 moved verbatim to bindings_modules.js
// [P2 batch 5] L1701-1729 moved verbatim to bindings_modules.js

// ============================================================================
// Phase 54.0–54.2 — Customizable Templates
// ============================================================================
// Every artifact type (AFHA, SFHA, ACReq, SysReq, PRA, ZSA, CMA, FMEA, Functions,
// FCIM, Assumptions) has a built-in schema describing its columns. Customers can
// override that schema at two levels: organization (persisted in localStorage,
// applies to every project this browser opens) and project (persisted in
// projectData, applies to this project only). Project overrides win over org
// overrides which win over built-in.
//
// What customization supports in Phase 54.0:
//   - Add a custom column (text / number / longtext / enum / date / boolean)
//   - Rename a built-in column (display label only; the column id never changes)
//   - Hide a built-in column from display (data is preserved; can be un-hidden)
//   - Reorder columns
//
// What it doesn't support yet (subsequent phases):
//   - Computed fields (formulas across columns)
//   - Validation rules (regex, mandatory-when-X)
//   - Per-column DOCX/PDF template control
//
// Backward compatibility: when no overrides exist, every artifact renders with
// its built-in column set in its built-in order — i.e. exactly as it did before
// Phase 54. The migration is non-breaking by design.
//
// Custom-column values are stored on each row inside `customFields`, an object
// keyed by column id. Built-in column values live on the row at their canonical
// key (e.g. row.fcId, row.severity) — unchanged from pre-54 behavior.

// [P2 batch 5] L1760-1760 moved verbatim to bindings_modules.js

// Built-in column registry. Each artifact lists the canonical columns the tool's
// internal logic depends on. Built-in columns can be renamed, hidden, or reordered
// but never deleted — deleting them would break things like AutoReq generators,
// the Traceability index, the FTA-FHA linkage. Custom columns added by users are
// stored separately in the override objects.
// TEMPLATE_SCHEMAS — extracted to config_data.js (Phase 76; byte-identical, loaded BEFORE this file).

// Initial state for per-project overrides. Stored in projectData so it travels with
// the project JSON. Each key matches a TEMPLATE_SCHEMAS key and contains:
//   columnOverrides: { <colId>: { label?, hide? } }   (rename / hide built-ins)
//   customColumns:   [{ id, label, type, options?, after? }]  (user-added columns)
//   columnOrder:     [colId, colId, …]   (display order; empty = use built-in order)
// [P2 batch 6] L1408-1442 moved verbatim to misc_fn_modules.js

let orgTemplates = loadOrgTemplates();
let projectTemplates = emptyTemplateOverrides();
window.orgTemplates = orgTemplates;
window.projectTemplates = projectTemplates;

// Effective template resolution: built-in → org overrides → project overrides.
// Returns a flat list of column descriptors in display order, each augmented with
// the effective label and a visibility flag. Custom columns are mixed in at their
// configured insertion point (or appended if no `after` is set).
// [P2 batch 4] L2724-2775 moved verbatim to helpers_modules.js
window.getEffectiveTemplate = getEffectiveTemplate;

// Get / set a custom-column value on a row. Built-in columns continue to live
// at the row's canonical key (row.fcId, row.severity, …) — only user-added
// columns go through this indirection.
// [P2 batch 6] L1459-1467 moved verbatim to misc_fn_modules.js
window.getCustomFieldValue = getCustomFieldValue;
window.setCustomFieldValue = setCustomFieldValue;

// Returns just the visible custom (non-built-in) columns for a kind. Used by
// renderers that want to append extra td/th to existing markup without rebuilding
// the whole table. This is the cheap migration path for renderers that have
// hand-rolled HTML and aren't worth a full template-driven rewrite yet.
// [P2 batch 6] L1475-1478 moved verbatim to misc_fn_modules.js
window.getCustomColumns = getCustomColumns;

// Returns the *effective label* for a built-in column (honors org/project rename).
// Renderers that emit hand-rolled <th> for built-ins can call this to pick up
// renames without a full template-driven rewrite.
// [P2 batch 6] L1484-1488 moved verbatim to misc_fn_modules.js
window.getBuiltInColumnLabel = getBuiltInColumnLabel;

// Render the trailing td cells for a row that map to custom columns. Returns a
// string of <td>…</td> fragments. The renderer is responsible for placing this
// at the end of its <tr>. Editing happens inline via the template editor or via
// a future row-edit modal — for Phase 54.0 these cells are display-only.
// [P2 batch 6] L1495-1504 moved verbatim to misc_fn_modules.js
window.renderCustomColumnCells = renderCustomColumnCells;

// Render the trailing <th> cells for the table head. Mirror of the row helper
// above; used by _injectCustomColumnHeaders to keep heads in sync with bodies.
// [P2 batch 6] L1509-1513 moved verbatim to misc_fn_modules.js
window.customColumnHeadersHtml = customColumnHeadersHtml;

// One-time injection — call after every table re-render to make sure the
// thead has the right number of custom <th> appended. Idempotent.
// [P2 batch 5] L1884-1899 moved verbatim to bindings_modules.js
// [P2 batch 6] L1519-1540 moved verbatim to misc_fn_modules.js
window._injectCustomColumnHeaders = _injectCustomColumnHeaders;

// Template editor — modal accessible from Project menu → "Templates…".
// [P2 batch 5] L1925-1925 moved verbatim to bindings_modules.js
// [P2 batch 5] L1926-1926 moved verbatim to bindings_modules.js
// [P2 batch 6] L1546-1560 moved verbatim to misc_fn_modules.js
window.openTemplateEditor = openTemplateEditor;
window.closeTemplateEditor = closeTemplateEditor;

// [P2 batch 6] L1564-1571 moved verbatim to misc_fn_modules.js
window.setTemplateKind = setTemplateKind;
window.setTemplateScope = setTemplateScope;

// [P2 batch 4] L2912-2958 moved verbatim to helpers_modules.js
window.renderTemplateEditor = renderTemplateEditor;

// [P2 batch 6] L1578-1597 moved verbatim to misc_fn_modules.js
window.renameColumn = renameColumn;

// [P2 batch 6] L1600-1617 moved verbatim to misc_fn_modules.js
window.toggleColumnHidden = toggleColumnHidden;

// [P2 batch 6] L1620-1628 moved verbatim to misc_fn_modules.js
window.resetColumnOverride = resetColumnOverride;

// [P2 batch 6] L1631-1655 moved verbatim to misc_fn_modules.js
window.addCustomColumn = addCustomColumn;

// [P2 batch 6] L1658-1667 moved verbatim to misc_fn_modules.js
window.changeCustomColumnType = changeCustomColumnType;

// [P2 batch 6] L1670-1677 moved verbatim to misc_fn_modules.js
window.deleteCustomColumn = deleteCustomColumn;

// After a template change, re-render the table for the active artifact kind
// (plus its theaders) so the UI reflects the change immediately.
// [P2 batch 6] L1682-1712 moved verbatim to misc_fn_modules.js
window.rerenderAllTemplateDrivenTables = rerenderAllTemplateDrivenTables;

// ============================================================================
// End template module
// ============================================================================

// [P2 batch 4] L3102-3183 moved verbatim to helpers_modules.js
window.toggleRowMenu = toggleRowMenu;
window.closeAllRowMenus = closeAllRowMenus;
// Wrap arbitrary action <button> markup (each ideally role="menuitem") in the same kebab menu,
// for bespoke tables that don't go through rowActionsHTML (e.g. Baselines).
// [P2 batch 6] L1724-1727 moved verbatim to misc_fn_modules.js
window.kebabMenu = kebabMenu;
document.addEventListener('click', closeAllRowMenus);
document.addEventListener('scroll', closeAllRowMenus, true);
window.addEventListener('resize', closeAllRowMenus);
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAllRowMenus(); });

// Phase 53.73 — Render the "Review" column for a row. Combines the existing 💬 comment
// trigger with the new approval checkbox into a single cell so reviewers see comments +
// sign-off side by side. Drop wherever the column lives in the table.
// [P2 batch 6] L1737-1747 moved verbatim to misc_fn_modules.js
window.reviewCellHtml = reviewCellHtml;

// Phase 53.73 — Inject a `<th>Review</th>` header into every approvable table once.
// Idempotent. Run once on DOM ready. Keeps the static HTML headers untouched so this
// change is a single place to maintain.
// [P2 batch 5] L2134-2141 moved verbatim to bindings_modules.js
// [P2 batch 6] L1754-1773 moved verbatim to misc_fn_modules.js
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _injectReviewColumnHeaders);
    } else {
        // Defer slightly so DOM nodes constructed by other init paths are settled.
        setTimeout(_injectReviewColumnHeaders, 0);
    }
}
window._injectReviewColumnHeaders = _injectReviewColumnHeaders;

// CRUD factory. Encapsulates the form↔data mapping, render loop, edit/delete handlers
// for the simple modules (acFunc, acFcim, acReq, sysFunc, sysFcim, sysReq, pra, zsa, fmea).
// FHA modules stay custom because they own the ASM-link preservation logic.
//
// Config:
//   key             — module key (drives editStates[key], formConfigs[key])
//   store           — () => array (mutated in place; getter returns falsy when no store yet)
//   formIds         — { dataField: 'element-id', ... }   bi-directional form ↔ data mapping
//   submitBtn, cancelBtn, defaultText  — for the shared cancelEdit/setEditMode helpers
//   tableBody       — id of the <tbody> to render into
//   renderCells(row, actionsHTML) — returns the inner <td>...</td>s for one row
//   editFnName, deleteFnName — names of the globals onclick handlers reference
//   afterChange?    — called after every add/edit/delete (for derived state sync)
//   validate?(data) — return error string to abort the submit, or undefined to proceed
//   transform?(data)— mutate/normalize data after readForm but before saving
//   storePrecondition?() — return error string to block the submit (e.g., "Open a system folder first")
//   onEdit?(item)   — called after writing the form on edit (e.g., refresh derived UI)
// ── #15b — windowed table virtualization (opt-in; default off → current rendering unchanged) ──
// Renders only the visible row slice + sized spacer rows, re-windowing on scroll, so a very large
// worksheet costs the same to render as a small one. Pure rendering — no data / determinism / ITAR
// impact. Applies ONLY to standard per-row tables (not the merged-cell decomposition table).
// Desktop: on by default. Browser: opt in with ?virtualize=1 or localStorage SLA_VIRTUALIZE='1';
// force off anywhere with ?virtualize=0 or SLA_VIRTUALIZE='0'. _VIRTUAL_ROW_H is now only a
// FALLBACK — _rowHeight() measures a real rendered row (support_modules.js).
var _VIRTUALIZE_MIN_ROWS = 300;
var _VIRTUAL_ROW_H = 34;
// [P2 batch 3] L4164-4401 moved verbatim to support_modules.js
try { if (typeof window !== 'undefined') window.slPrompt = slPrompt; } catch (_) {}

// [P2 batch 5] L2199-2206 moved verbatim to bindings_modules.js

// [P2 batch 6] L1813-1826 moved verbatim to misc_fn_modules.js
// Run once after DOM is ready.
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            _refreshProjectNameUI();
            _refreshSaveFolderMenu();
        });
    } else {
        setTimeout(() => { _refreshProjectNameUI(); _refreshSaveFolderMenu(); }, 0);
    }
}

// [P2 batch 6] L1839-1914 moved verbatim to misc_fn_modules.js
window.openNewProjectWizard = openNewProjectWizard;

// [P2 batch 6] L1917-1942 moved verbatim to misc_fn_modules.js
window.npwCreate = npwCreate;

// Sanitize a free-text project name into a filename component (no slashes, etc.).
// [P2 batch 6] L1946-1966 moved verbatim to misc_fn_modules.js

// Phase 70 (desktop) — Electron bridge hooks. Inert in the browser build (nothing calls
// them there). The desktop main process invokes these via webContents.executeJavaScript to
// drive native Save/Open of .slab project files without a second in-page file dialog.
if (typeof window !== 'undefined') {
    window.__slabGetProjectJSON = function() {
        try { return JSON.stringify(_slabBuildProjectExport(), null, 2); }
        catch (e) { return JSON.stringify({ __slabError: String(e) }); }
    };
    window.__slabLoadProjectJSON = function(str) {
        try {
            const f = new File([String(str)], 'project.slab', { type: 'application/json' });
            loadProject({ target: { files: [f] } });
            return true;
        } catch (e) { try { alert('Could not open project: ' + e); } catch (_) {} return false; }
    };
}

// [P2 batch 4] L3472-3571 moved verbatim to helpers_modules.js

// ==========================================
// UI Navigation Engine 
// ==========================================
// Phase 53.45 — localStorage keys for persisted UI state across reloads.
// [P2 batch 5] L2395-2395 moved verbatim to bindings_modules.js
// [P2 batch 5] L2396-2396 moved verbatim to bindings_modules.js
// Phase 56.47 — apportion mode (equal vs weighted) also persisted across reloads
// so the user's weighted-vs-equal choice survives refresh even before autosave fires.
// [P2 batch 5] L2399-2399 moved verbatim to bindings_modules.js

// [P2 batch 3] L4705-5038 moved verbatim to support_modules.js
window.computePhaseStatus = computePhaseStatus;

// Phase 62.1 (A1) — six-cockpit dashboard. The old single-row process strip becomes
// three lifecycle rows (AFHA→PASA / SFHA→PSSA / SSA→ASA) of cockpit cards + a CCA
// strip. Cards open a detail modal (openCockpitModal); the deep-links live inside it.
// Status vocabulary: 'Handed off' and 'Reopened' arrive with the status engine (A3)
// and the baseline action (A5); until then complete = 'Ready to baseline'.
// [P2 batch 5] L2409-2409 moved verbatim to bindings_modules.js

// [P2 batch 6] L2007-2044 moved verbatim to misc_fn_modules.js
window.renderProcessStrip = renderProcessStrip;

// Phase 62.1 (A1) — program posture metrics. Replaces the severity/lifecycle pies:
// posture answers "where is the program and what's blocking it"; distribution charts
// now belong in the scoped views where they have context.
// [P2 batch 6] L2050-2083 moved verbatim to misc_fn_modules.js
window.renderPostureMetrics = renderPostureMetrics;

// Phase 62.1 (A1) — requirements V&V posture strip (replaces the by-level bar chart).
// Answers "how much of the requirement set is validated/verified", program-wide.
// [P2 batch 6] L2088-2116 moved verbatim to misc_fn_modules.js
window.renderReqVvStrip = renderReqVvStrip;

// [P2 batch 6] L2119-2126 moved verbatim to misc_fn_modules.js
window.enterPhase = enterPhase;

// ============================================================================
// Phase 62.1 (A1/A2) — cockpit detail modal.
// Inputs + completion checklist on the left, activities on the right, outputs +
// actions in the footer. Rows marked (planned) are greyed until their roadmap
// feature lands (B/C/D phases); live rows are real queries against project data.
// ============================================================================
// [P2 batch 4] L3721-3859 moved verbatim to helpers_modules.js
window.openCockpitModal = openCockpitModal;
window.closeCockpitModal = closeCockpitModal;

// ============================================================================
// Phase 62.2 (A3/A4/A5) — completion checklists, status engine, baseline & hand off.
//
// A4: each assessment carries the standard's own completion criteria as a checklist —
//     'auto' items are live queries, 'attest' items are signed statements, 'planned'
//     items await their roadmap feature.
// A3: status vocabulary becomes In work / Ready to baseline / Handed off / Reopened.
//     Handed off = a hand-off record exists and the input fingerprint still matches.
//     Reopened  = inputs drifted after hand-off (recomputed live, never stored).
// A5: hand-off captures a full project baseline (SHA-256, existing machinery),
//     records signer + fingerprint, and stamps the record under projectConfig.
// ============================================================================
// [P2 batch 5] L2555-2555 moved verbatim to bindings_modules.js

// Sync FNV-1a fingerprint — cheap change detection for input drift (not integrity;
// integrity is the baseline's SHA-256).
// [P2 batch 4] L3879-3947 moved verbatim to helpers_modules.js

// The checklist registry. refs cite the standard so a DER sees their own criteria.
// [P2 batch 5] L2562-2634 moved verbatim to bindings_modules.js

// [P2 batch 6] L2160-2188 moved verbatim to misc_fn_modules.js
window.evalCkptChecklist = evalCkptChecklist;

// A3 — the status engine. Applied on top of computePhaseStatus's base statuses.
// [P2 batch 6] L2192-2208 moved verbatim to misc_fn_modules.js
window.applyCockpitStatuses = applyCockpitStatuses;

// A5 — baseline & hand off. Gate must be ready; captures a full project baseline
// (existing SHA-256 machinery), records signer + input fingerprint.
// [P2 batch 6] L2213-2233 moved verbatim to misc_fn_modules.js
window.ckptHandOff = ckptHandOff;

// A4 — attest / clear an attestation item.
// [P2 batch 6] L2237-2252 moved verbatim to misc_fn_modules.js
window.ckptAttest = ckptAttest;

// ============================================================================
// Phase 62.3 (B1) — CCMR / latent-failure sweep + not-to-exceed τ-bisection.
//
// Sweeps every Cat/Haz-linked fault tree for latent events (periodic-test repair
// model, or latent exposure mode with a dormancy interval exceeding one flight).
// For verification trees with real λ data, bisects the test/dormancy interval to
// find the NOT-TO-EXCEED value — the largest interval at which the tree's top
// event still meets its severity target (E.3.2.4 significant latents; §5.1 CCMR
// candidates). Allocation-tree latents are listed for visibility; their intervals
// bound at verification. Wear-out candidates flagged from component-library
// provenance (E.3.2.5).
// ============================================================================
// [P2 batch 4] L4131-4196 moved verbatim to helpers_modules.js

// [P2 batch 5] L2745-2745 moved verbatim to bindings_modules.js
// [P2 batch 4] L4199-4239 moved verbatim to helpers_modules.js
window.ccmrLatentSweep = ccmrLatentSweep;

// Wear-out candidates (E.3.2.5) — verification leaves sourced from mechanical
// component-library entries (NSWC-11 family or mechanically-named groups).
// [P2 batch 6] L2275-2294 moved verbatim to misc_fn_modules.js
window.ccmrWearoutList = ccmrWearoutList;

// [P2 batch 4] L4266-4320 moved verbatim to helpers_modules.js
window.renderCcmrPage = renderCcmrPage;

// [P2 batch 6] L2300-2311 moved verbatim to misc_fn_modules.js
window.ccmrExportCsv = ccmrExportCsv;

// ============================================================================
// Phase 62.4 (B2) — FMES as a DERIVED VIEW (ARP4761A §4.2, Appendix J.4.2).
//
// No maintained FMES artifact: FMEA rows are the single source of truth. The
// deterministic core groups rows by (system, end effect, detection means) —
// the equivalence class at which an FTA basic event is well-defined — and the
// group's summed λ is what a linked basic event owes. Two lints guard the
// classic failure modes: a BE fed by only part of its group (under-summed λ,
// anti-conservative) and a BE whose linked rows span detection classes (mixed
// exposure semantics). The FMES document is generated from the groups on demand.
// ============================================================================
// [P2 batch 6] L2325-2351 moved verbatim to misc_fn_modules.js
window.fmesGroups = fmesGroups;

// [P2 batch 4] L4377-4420 moved verbatim to helpers_modules.js
window.fmesLints = fmesLints;

// Adopt a group's summed λ onto its (single) linked basic event, with provenance.
// [P2 batch 6] L2358-2371 moved verbatim to misc_fn_modules.js
window.fmesAdopt = fmesAdopt;

// Staleness: adopted BE whose λ no longer equals its group's current sum.
// [P2 batch 4] L4441-4495 moved verbatim to helpers_modules.js
window.renderFmesPage = renderFmesPage;

// Generated FMES document (J.4.2 worksheet shape) — CSV export.
// [P2 batch 6] L2379-2390 moved verbatim to misc_fn_modules.js
window.fmesExportCsv = fmesExportCsv;

// ============================================================================
// Phase 62.8 (C1) — Independence Principle ledger (ARP4761A §2.2, B.4.3.3,
// D.4.2.2, M; ARP4754B §5.2.3).
//
// One record per UNIQUE MEMBER-SET, auto-identified from (a) minimal cut sets of
// order ≥2 in Cat/Haz trees (failure-independence backing probability credit) and
// (b) AND/INHIBIT gates carrying a DALgebra independence claim (error-independence
// backing DAL credit). Existing CMA rows and AutoReq gate-independence
// requirements ATTACH to the principle — they are its evidence, not duplicates.
// Deterministic contradiction check: members sharing a CCF group (β>0) are a
// declared dependency. Lifecycle: Identified → Evaluated → Requirement → Verified,
// with Compromised cascading from CCF contradictions, compromised gate claims,
// or open CMA findings.
// ============================================================================
// [P2 batch 5] L2883-2883 moved verbatim to bindings_modules.js
// [P2 batch 4] L4528-4618 moved verbatim to helpers_modules.js
window.ipLedger = ipLedger;

// [P2 batch 6] L2411-2426 moved verbatim to misc_fn_modules.js
window.ipDisposition = ipDisposition;

// [P2 batch 5] L2905-2911 moved verbatim to bindings_modules.js

// [P2 batch 6] L2431-2469 moved verbatim to misc_fn_modules.js
window.renderIpLedgerPage = renderIpLedgerPage;

// ============================================================================
// Phase 63 (D1) — Interdependence Analysis + Common Resource Analysis
// (ARP4761A B.3 Table B1 / B.4.3.2 Table B3).
//
// Interdependence: rows = aircraft FCs (with their function), columns = systems.
// Cell resolution: manual override (asserted / cleared, signed) beats derived
// (function trace · resource provide/consume · SFHA trace-back) beats unreviewed.
// The honesty rule: an empty cell means "not yet reviewed", never "no" — the PASA
// checklist counts unreviewed cells. Derived cells are facts with provenance and
// cannot be cleared; the human lane and the computed lane never overwrite each
// other.
//
// Common Resource matrix: per FC, columns = THAT FC's contributing systems
// (straight from its interdependence row — the B.4.3.2 step-a mapping), rows =
// resource × failure mode, cells = per-system effect (auto-marked when the
// system provides or consumes the resource; effect text is human), each row
// closing with the combined aircraft-level effect.
// ============================================================================
// [P2 batch 4] L4706-4781 moved verbatim to helpers_modules.js
window.idpStats = idpStats;

// Cell click — cycle: unreviewed → asserted → cleared → unreviewed. Derived cells
// show provenance; a derived cell can be "cleared" but derivation wins + flags.
// [P2 batch 6] L2495-2516 moved verbatim to misc_fn_modules.js
window.idpCycleCell = idpCycleCell;

// CRA cell / aircraft-level effect editing.
// [P2 batch 6] L2520-2529 moved verbatim to misc_fn_modules.js
window.craEditCell = craEditCell;

// Phase 63.4 — cell cycling for the common-resources matrix, same interaction as
// the interdependence grid. On a ⚡ resource-system column the cell cycles
// · → P → C → P·C → · ; on a function-provider column it toggles C only.
// Function-derived consumption (legacy consumedBy sub-functions) renders as C
// but is a derivation — it can't be clicked away, matching the interdep rule.
// [P2 batch 6] L2537-2565 moved verbatim to misc_fn_modules.js
window.idpCycleResCell = idpCycleResCell;

// [P2 batch 6] L2568-2575 moved verbatim to misc_fn_modules.js
window.idpQuickAddResource = idpQuickAddResource;

// [P2 batch 5] L3060-3060 moved verbatim to bindings_modules.js
// [P2 batch 5] L3061-3061 moved verbatim to bindings_modules.js

// [P2 batch 4] L4872-5009 moved verbatim to helpers_modules.js
window.renderInterdepPage = renderInterdepPage;

// [P2 batch 6] L2584-2599 moved verbatim to misc_fn_modules.js
window.interdepExportCsv = interdepExportCsv;

// ============================================================================
// Phase 63.1 (D2) — MAC model: minimum acceptable configuration, fidelity L0→L2.
//
// A MAC rule defines, per aircraft function (and phase), the survival condition
// as a conjunction of clauses: MAC holds when EVERY clause holds, and a clause
// holds when at least `min` of its member systems are operative. This is the L0
// (Boolean) fidelity — pure configuration judgment, available at concept phase.
//
// The L0 compiler is exact combinatorics: the rule fails iff some clause has
// more than (n − min) members failed, so the MINIMAL BREACH COMBINATIONS are,
// per clause, all (n − min + 1)-subsets of its members — unioned across clauses
// and subsumption-reduced. Single-point findings are order-1 breach sets.
//
// Rules are engineering judgment until substantiated (SDD ref), so each rule
// carries substantiation = { kind: 'assumption' | 'sdd', ref }. L1 (degraded
// states / modifiers) and L2 (scalar floors) extend the same records in D3.
// Storage: projectConfig.macModels — persisted, baselined, fingerprinted.
// ============================================================================
// [P2 batch 6] L2620-2646 moved verbatim to misc_fn_modules.js
window.macBreachSets = macBreachSets;

// [P2 batch 6] L2649-2659 moved verbatim to misc_fn_modules.js
window.macStats = macStats;

// ---- editor state + actions ----
// [P2 batch 5] L3145-3145 moved verbatim to bindings_modules.js

// [P2 batch 4] L5093-5153 moved verbatim to helpers_modules.js
window.macStartDraft = macStartDraft; window.macCancelDraft = macCancelDraft;
window.macDraftSet = macDraftSet; window.macDraftClauseMin = macDraftClauseMin;
window.macDraftToggleSys = macDraftToggleSys; window.macDraftAddClause = macDraftAddClause;
window.macDraftRemoveClause = macDraftRemoveClause; window.macSaveDraft = macSaveDraft;
window.macSubstantiate = macSubstantiate; window.macDeleteRule = macDeleteRule;

// [P2 batch 4] L5160-5273 moved verbatim to helpers_modules.js
window.macCompile = macCompile;

// [P2 batch 6] L2675-2679 moved verbatim to misc_fn_modules.js
window.macTreeStatus = macTreeStatus;

// [P2 batch 6] L2682-2694 moved verbatim to misc_fn_modules.js
window.macCompileAll = macCompileAll;

// ============================================================================
// Phase 63.11 (D4) — CoFFE: Combined Functional Failure Effects (B.4.3.1).
// Optional method slot, strictly dual-lane:
//   COMPUTED lane — pure-loss cases evaluate against the FC's compiled MAC
//     breach sets (a case breaches iff it contains a breach combination).
//     Malfunction cases have no computed lane: they are the judgment residue.
//   ELICITED lane — signed human verdicts. Never auto-filled, never overwritten.
// Agreement = verification (two independent derivations converge). Disagreement
// = a finding: elicited-yes vs computed-no is a MISSING TREE BRANCH; elicited-no
// vs computed-yes challenges the MAC model. Confirmed YES verdicts are LOCKED
// CONSTRAINTS the trees must contain — the model's regression suite (App N).
// Enumeration: singles + pairs over the FC's contributing systems (from its
// interdependence row), states {total loss, malfunction}, supersets of a
// confirmed-yes case pruned per the standard's scoping rationale.
// ============================================================================
// [P2 batch 5] L3194-3194 moved verbatim to bindings_modules.js
// [P2 batch 6] L2713-2744 moved verbatim to misc_fn_modules.js
window.coffeCases = coffeCases;

// Computed lane: pure-loss cases vs the FC's MAC breach sets.
// [P2 batch 6] L2748-2760 moved verbatim to misc_fn_modules.js
window.coffeComputed = coffeComputed;

// [P2 batch 6] L2763-2779 moved verbatim to misc_fn_modules.js
window.coffeVerdict = coffeVerdict;

// Capability-result text (Table B2 column 6).
// [P2 batch 6] L2783-2792 moved verbatim to misc_fn_modules.js
window.coffeEditResult = coffeEditResult;

// Phase 63.15 (D7) — graft a signed-YES malfunction case onto the FC's compiled
// tree as an AUTHORED branch. Malfunction events get their own logicalIds
// (macmal:<sysId>) — an adverse action is a different event than a loss. The
// branch carries _macGraft = caseKey; the compiler and the AI restructurer both
// preserve grafts, and the equivalence prover ignores them (authored, not model).
// [P2 batch 6] L2800-2829 moved verbatim to misc_fn_modules.js
window.coffeGraft = coffeGraft;

// ============================================================================
// Phase 63.16 (D8) — Safety Program Plan: method slots + signed tailoring.
// Fixed objectives, pluggable methods, recorded opt-outs. The plan record
// declares WHICH method fills each objective slot (declarative — the tabs all
// remain available); the tailoring register holds every checklist opt-out with
// its rationale and signature; depth defaults derive from the cert basis.
// ============================================================================
// [P2 batch 5] L3321-3326 moved verbatim to bindings_modules.js
// [P2 batch 6] L2840-2849 moved verbatim to misc_fn_modules.js
window.sppSetSlot = sppSetSlot;

// [P2 batch 6] L2852-2868 moved verbatim to misc_fn_modules.js
window.sppTailorItem = sppTailorItem;

// [P2 batch 6] L2871-2879 moved verbatim to misc_fn_modules.js
window.sppClearTailoring = sppClearTailoring;

// [P2 batch 4] L5488-5562 moved verbatim to helpers_modules.js
window.renderSppPage = renderSppPage;

// Findings across an FC: conflicts + locked constraints missing from the trees.
// Sweeps the VERDICT STORE (not the pruned enumeration) so locked verdicts on
// cases that later got pruned — or whose systems left the interdependence row —
// still act as permanent regression constraints.
// [P2 batch 6] L2889-2906 moved verbatim to misc_fn_modules.js
window.coffeFindings = coffeFindings;

// [P2 batch 5] L3396-3396 moved verbatim to bindings_modules.js
// [P2 batch 4] L5590-5669 moved verbatim to helpers_modules.js
window.renderCoffePanel = renderCoffePanel;

// ============================================================================
// Phase 63.12 (D5) — authored MF&MS trees: the manual method slot.
// Hand-built aircraft trees join the MF&MS panel next to the compiled ones —
// cross-checked, never trusted. Events map to systems via external-source links
// (externalSource.systemId) or compiled-style logicalIds ('macsys:<id>');
// unmapped events make a cutset undecidable at system granularity and count as
// a coverage gap. Checks per tree:
//   • MAC comparison — breach sets the tree misses (anti-conservative: MISSING)
//     and fully-mapped cutsets claiming combos the MAC says survive (EXTRA).
//   • Locked CoFFE constraints — every signed-YES loss case must breach the tree.
// ============================================================================
// [P2 batch 4] L5683-5741 moved verbatim to helpers_modules.js
window.mfmsCrossCheck = mfmsCrossCheck;

// [P2 batch 6] L2927-2945 moved verbatim to misc_fn_modules.js
window.mfmsNewAuthoredTree = mfmsNewAuthoredTree;

// ============================================================================
// Phase 63.13 — per-system PSSA panel (the system-workspace slot). Every tree
// carrying this system's id lands here automatically, with its DAL posture,
// linked FC, and verification-mirror status; system latents from the CCMR
// sweep summarize at the top.
// ============================================================================
// [P2 batch 6] L2954-2976 moved verbatim to misc_fn_modules.js
window.wsPssaNewTree = wsPssaNewTree;

// ============================================================================
// Phase 63.14 (D6) — AI tree synthesis under the equivalence prover.
// The AI (the user's Active Model — Fable 5 when selected) drafts a READABLE
// restructure of a compiled MF&MS tree: meaningful intermediate gates, good
// names, engineering narrative order. The deterministic core then PROVES the
// proposal Boolean-equivalent to the rule's breach sets (same BDD cutset check
// as the compiler) before it can touch the page. AI owns form; the core owns
// truth; the boundary is a theorem, not a review. Rejected proposals never
// touch project data.
// ============================================================================
// [P2 batch 4] L5806-5845 moved verbatim to helpers_modules.js
window.mfmsApplyRestructure = mfmsApplyRestructure;

// The Fable call — drafts the readable hierarchy; apply-under-proof does the rest.
// [P2 batch 6] L2993-3030 moved verbatim to misc_fn_modules.js
window.mfmsAiRestructure = mfmsAiRestructure;

// [P2 batch 6] L3033-3067 moved verbatim to misc_fn_modules.js
window.renderWsPssaPanel = renderWsPssaPanel;

// [P2 batch 4] L5926-6009 moved verbatim to helpers_modules.js
window.renderMfmsPanel = renderMfmsPanel;

// [P2 batch 4] L6012-6084 moved verbatim to helpers_modules.js
window.renderMacPage = renderMacPage;

// ============================================================================
// Phase 63.2 — full-page cockpits for PASA and ASA (Aircraft Safety nav).
// Same data spine as the dashboard modal (detail builders + checklist engine +
// status engine + hand-off), rendered as a proper page: inputs and completion
// checklist on the left, activities with deep links on the right, outputs and
// actions in a footer strip. The dashboard cards keep the quick-glance modal.
// ============================================================================
// [P2 batch 5] L3570-3570 moved verbatim to bindings_modules.js

// [P2 batch 4] L6096-6159 moved verbatim to helpers_modules.js
window.renderCockpitPage = renderCockpitPage;

// Phase 63.2 — PASA workspace sub-tabs. The Interdependence, Resources, and MAC
// views are REPARENTED into the PASA page on first use (their render functions
// keep their host ids), and legacy switchTab calls to them redirect here so
// every old deep link still lands correctly.
// [P2 batch 5] L3579-3579 moved verbatim to bindings_modules.js
// [P2 batch 6] L3093-3130 moved verbatim to misc_fn_modules.js
window.pasaSub = pasaSub;

// [P2 batch 4] L6207-6302 moved verbatim to helpers_modules.js
window.cycleSystemRole = cycleSystemRole;
// [P2 batch 4] L6304-6404 moved verbatim to helpers_modules.js
try { window.openFTAPageById = openFTAPageById; window._renderSidebarContext = _renderSidebarContext; } catch(_) {}

// Phase 53.7 — Aircraft Safety workspace navigation.
// Mirrors the Systems Safety workspace pattern: one entry point + a sub-tab bar
// for Functions / FCIM / FHA / Requirements / Assumptions.
// [P2 batch 5] L3628-3631 moved verbatim to bindings_modules.js

// AC_WORKSPACE_TABS — extracted to ui_constants.js (Phase 76; byte-identical, loaded BEFORE this file).

// [P2 batch 4] L6417-6494 moved verbatim to helpers_modules.js


// ==========================================
// SEMANTIC UNIVERSAL CSV IMPORT ENGINE
// ==========================================
// [P2 batch 5] L3641-3641 moved verbatim to bindings_modules.js
// [P2 batch 2] L7956-8366 moved verbatim to data_ops_modules.js


// ==========================================
// FLIGHT PHASES
// ==========================================
// [P2 batch 5] L3648-3648 moved verbatim to bindings_modules.js
// [P2 batch 4] L6508-6626 moved verbatim to helpers_modules.js
window.onPhasesProfileChange = onPhasesProfileChange;
window.createMissionProfile = createMissionProfile;
window.renameMissionProfile = renameMissionProfile;
window.deleteMissionProfile = deleteMissionProfile;
window.addPhaseRow = addPhaseRow;
window.deletePhaseRow = deletePhaseRow;

// Phase 32a — exposure time semantics.
//   ftaConfig.exposureSource = 'auto' | 'manual'
//     'auto':   When an FHA is linked, exposureTime = sum of durations of the FHA's exposed
//               flight phases (matched against flightPhasesData). When no FHA is linked the
//               default of 1 hr applies. Manual edits via the toolbar input flip the source
//               back to 'manual' so the user value is honored.
//     'manual': exposureTime is whatever the user typed; FHA link does not override it.
//
// Returns the exposure-time (hours) that should be used for the active tree. Used by the
// top-down allocator, calcBottomUp, and the cutset rate annotations — they all read
// ftaConfig.exposureTime, so we update it via syncFTAExposure() rather than via a function
// that returns a value separately.
// [P2 batch 4] L6646-6756 moved verbatim to helpers_modules.js
window._computeTopAllocatorContext = _computeTopAllocatorContext;

// Phase 33 — equivalent failure rate (per active exposure hour) for an arbitrary probability.
// Used on every node (intermediate gates as well as basic-event leaves) so the canvas can
// display λ /hr as the primary unit while keeping P at t as a derived secondary.
//   • For a basic event with stored λ:    use λ directly.
//   • For a gate with computed P:         λ_equiv = -ln(1 - P) / t_exposure.
// Note: under rare-event approx (P << 1), λ_equiv ≈ P / t_exposure. For larger P the formula
// preserves the exact rate that, integrated over t_exposure, gives P (1 - exp(-λt) = P).
// [P2 batch 6] L3189-3196 moved verbatim to misc_fn_modules.js
window.rateEquivalentForProb = rateEquivalentForProb;

// Format a node's λ /hr and P-at-t for the inline metrics input. Single-line compact format
// so it fits the existing input widget; gates and leaves share the same shape.
//
// Phase 56.42 — Top-down + shared events case: when the active page's root has
// _bddActualProb (the BDD-exact reconstruction stored alongside the engineer's
// target), surface both values neutrally as "Target: ... · Actual: ...". No
// badge, no color, no judgment language — engineer reads both and decides.
// [P2 batch 4] L6783-6859 moved verbatim to helpers_modules.js
window.formatNodeActualLine = formatNodeActualLine;
window.formatNodeMetrics = formatNodeMetrics;

// ==========================================
// ASSUMPTION MODEL HELPERS
// Assumptions are first-class records (scoped to AC or to each system). FHA rows reference
// them via `assumptionIds: []`. Legacy rows with `assumptions: "ASM-AC-001: text"` are
// migrated on load. The trace from assumption → FHAs/sub-functions is computed at render.
// ==========================================

// One-time migration: rewrite legacy "assumptions" string fields on FHA rows
// into an `assumptionIds` array. Idempotent — calling repeatedly is safe.
// [P2 batch 2] L8737-9030 moved verbatim to data_ops_modules.js

const acFuncCRUD = makeCRUD({
    key: 'acFunc',
    store: () => acFunctionsData,
    formIds: { funcId: 'ac-func-id', funcName: 'ac-func-name', funcDef: 'ac-func-def', subId: 'ac-subfunc-id', subName: 'ac-subfunc-name', subDef: 'ac-subfunc-def' },
    submitBtn: 'btn-submit-ac-func', cancelBtn: 'btn-cancel-ac-func', defaultText: 'Log Aircraft Function',
    tableBody: 'ac-func-body',
    editFnName: 'editACFunction', deleteFnName: 'deleteACFunction',
    // Excel-style merged identity cells per aircraft function (see _acFuncRenderRows).
    renderRows: (arr, ctx) => _acFuncRenderRows(arr, ctx),
    // Fallback single-row renderer (unused while renderRows is present; kept for parity).
    renderCells: (row, actions) => `<td>${actions}</td><td><strong>${esc(row.funcId)}</strong></td><td>${esc(row.funcName)}</td><td>${esc(row.funcDef)}</td><td><strong>${esc(row.subId)}</strong></td><td>${esc(row.subName)}</td><td>${esc(row.subDef)}</td>`,
});
window.editACFunction = acFuncCRUD.edit;
window.deleteACFunction = acFuncCRUD.deleteItem;
window.renderACFunctions = acFuncCRUD.render;

// --- Multi sub-function add: log several sub-functions under one aircraft function ----------
// Pure: pick the sub-function rows to commit. Non-empty rows win; if none, commit a single
// (function-only) row to preserve the original single-add behaviour. (Testable.)
// [P2 batch 6] L3240-3248 moved verbatim to misc_fn_modules.js
// [P2 batch 5] L3739-3750 moved verbatim to bindings_modules.js
// Add mode: commit one row per sub-function, all sharing the function's ID. Edit mode: unchanged.
// [P2 batch 5] L3752-3774 moved verbatim to bindings_modules.js
// Clear any extra sub-function rows when entering single-row edit mode.
(function () {
    const _editOrig = acFuncCRUD.edit;
    window.editACFunction = function (id) { _acClearSubfuncExtras(); _editOrig(id); };
})();

const acFcimCRUD = makeCRUD({
    key: 'acFcim',
    store: () => acFcimData,
    formIds: { subId: 'ac-fcim-subfunc', awareness: 'ac-fcim-crew', tlId: 'ac-fcim-tl-id', tlDesc: 'ac-fcim-tl-desc', plId: 'ac-fcim-pl-id', plDesc: 'ac-fcim-pl-desc', mId: 'ac-fcim-m-id', mDesc: 'ac-fcim-m-desc' },
    submitBtn: 'btn-submit-ac-fcim', cancelBtn: 'btn-cancel-ac-fcim', defaultText: 'Log AC FCIM',
    tableBody: 'ac-fcim-body',
    editFnName: 'editACFCIM', deleteFnName: 'deleteACFCIM',
    // FCIM rows define the set of failure conditions referenced by the FHA tab.
    afterChange: () => {
        acExtractedFCs = [];
        _pushExtractedFCs(acFcimData, acExtractedFCs);
    },
    // Cascade obsolescence — the factory wraps the <tr> with no class hook, so badge the
    // first (sub-function) cell when the row is flagged obsolete.
    renderCells: (row, actions) => _fcimRenderCells(row, actions),
});
window.submitACFCIM = acFcimCRUD.submit;
window.editACFCIM = acFcimCRUD.edit;
window.deleteACFCIM = acFcimCRUD.deleteItem;
window.renderACFCIM = acFcimCRUD.render;

// [P2 batch 4] L6965-7075 moved verbatim to helpers_modules.js

// Open the chart modal for a given FHA. Pulls current chartProps into the radios.
// [P2 batch 5] L3805-3805 moved verbatim to bindings_modules.js
// [P2 batch 5] L3806-3873 moved verbatim to bindings_modules.js

// [P2 batch 6] L3285-3321 moved verbatim to misc_fn_modules.js

// [P2 batch 5] L3913-3919 moved verbatim to bindings_modules.js

// [P2 batch 5] L3921-3936 moved verbatim to bindings_modules.js

const acReqCRUD = makeCRUD({
    key: 'acReq',
    store: () => acReqData,
    formIds: {
        traceId: 'ac-req-trace', level: 'ac-req-level', type: 'ac-req-type', analysis: 'ac-req-analysis', text: 'ac-req-text', rat: 'ac-req-rat',
        // `type` is the ARP4754B §5.3.1 class; `analysis` is which analysis produced
        // it. They were one field until 1 Aug 2026 — see req_taxonomy.js.
        // Phase 29.1 — V&V fields per ARP 4754B §6.3 (validation) + §6.4 (verification).
        validationMethod: 'ac-req-val-method', validationStatus: 'ac-req-val-status', validationEvidence: 'ac-req-val-evidence',
        verifMethod:      'ac-req-ver-method', verifStatus:      'ac-req-ver-status', verifEvidence:      'ac-req-ver-evidence',
        // Phase 53.63 — derivation chain per ARP 4754B §6.1.1.
        derivationType: 'ac-req-derivation-type', parentReqId: 'ac-req-parent'
    },
    submitBtn: 'btn-submit-ac-req', cancelBtn: 'btn-cancel-ac-req', defaultText: 'Log Requirement',
    tableBody: 'ac-req-body',
    editFnName: 'editACReq', deleteFnName: 'deleteACReq',
    renderCells: (row, actions) => `<td>${actions}</td><td><strong>${esc(row.traceId || 'N/A')}</strong></td><td><strong>${esc(row.level)}</strong></td><td>${esc(row.type)}</td><td>${esc(row.text)}${autoReqBadgesHtml(row)}${derivationBadgeHtml(row)}</td><td>${esc(row.rat)}</td><td>${reqVerStatusBadge(row, 'validation')}</td><td>${reqVerStatusBadge(row, 'verif')}</td>`,
});

// Phase 29.1 — render a small status pill for a requirement's validation or verification.
// kind is 'validation' or 'verif'; reads {kind}Status + {kind}Method + {kind}Evidence.
// [P2 batch 6] L3346-3363 moved verbatim to misc_fn_modules.js

// Wrap submit to mark auto-generated reqs as user-overridden when the user edits them.
// Phase 53.56 — also record create / edit history entries.
const _origSubmitACReq = acReqCRUD.submit;
// [P2 batch 5] L3979-4017 moved verbatim to bindings_modules.js
window.editACReq = acReqCRUD.edit;
// Phase 53.56 — soft delete with history; physical delete is gated behind a separate purge action.
window.deleteACReq = function(internalId){
    const r = (acReqData || []).find(x => String(x.internalId) === String(internalId));
    if (!r) return;
    if (r.deleted) {
        // Already in the Deleted bin — offer to restore instead of double-deleting.
        if (confirm('This requirement is already deleted. Restore it?')) {
            ReqHistory.restore(r);
            if (typeof window.renderACReq === 'function') window.renderACReq();
            if (typeof scheduleAutosave === 'function') scheduleAutosave();
            showToast('Requirement restored.', 'success', 2500);
        }
        return;
    }
    if (!confirm('Delete requirement ' + (r.traceId || ('REQ-' + r.internalId)) + '? It will move to the Deleted filter and can be restored from there.')) return;
    ReqHistory.softDelete(r);
    if (typeof window.renderACReq === 'function') window.renderACReq();
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
    showToast('Requirement deleted. Use the Deleted filter to restore.', 'info', 3500);
};
// [P2 batch 5] L4039-4046 moved verbatim to bindings_modules.js
// Decorate render to tag rows with data attributes for the filter chips.
const _origRenderACReq = acReqCRUD.render;
window.renderACReq = function(){
    _origRenderACReq();
    const tbody = document.getElementById('ac-req-body');
    if(!tbody) return;
    Array.from(tbody.querySelectorAll('tr')).forEach((tr, i) => {
        const r = acReqData[i];
        if(!r) return;
        tr.setAttribute('data-ar-kind', r.reqSource ? (r.reqSource.generator || 'auto') : 'manual');
        if(r.reqSource && r.reqSource.stale) tr.setAttribute('data-ar-stale', '1'); else tr.removeAttribute('data-ar-stale');
        if(r.compromised) tr.setAttribute('data-ar-compromised', '1'); else tr.removeAttribute('data-ar-compromised');
        if(r.reqSource && r.reqSource.obsolete) tr.setAttribute('data-ar-obsolete', '1'); else tr.removeAttribute('data-ar-obsolete');
        if(r.status === 'archived') tr.setAttribute('data-ar-archived', '1'); else tr.removeAttribute('data-ar-archived');
        // Phase 53.56 — deleted flag drives soft-delete visibility.
        if(r.deleted) tr.setAttribute('data-ar-deleted', '1'); else tr.removeAttribute('data-ar-deleted');
        // Patch row action group to add 🕒 history button (+ restore for deleted rows).
        _patchReqRowActions(tr, r, 'ac');
    });
    applyAutoReqFilter('ac');
};

// Phase 53.56 — inject a 🕒 history button and (for deleted rows) a Restore button
// into the existing action group. Called from both AC + Sys req renderers.
// [P2 batch 4] L7344-7410 moved verbatim to helpers_modules.js
window.updateACAsmRoute = updateACAsmRoute;
window.updateSysAsmRoute = updateSysAsmRoute;

// [P2 batch 4] L7414-7495 moved verbatim to helpers_modules.js

const sysFuncCRUD = makeCRUD({
    key: 'sysFunc',
    store: () => sys()?.functions,
    storePrecondition: () => sys() ? null : 'Please open a system folder first.',
    formIds: { funcId: 'sys-func-id', funcName: 'sys-func-name', funcDef: 'sys-func-def' },
    submitBtn: 'btn-submit-sys-func', cancelBtn: 'btn-cancel-sys-func', defaultText: 'Log System Function',
    tableBody: 'sys-func-body',
    editFnName: 'editSysFunction', deleteFnName: 'deleteSysFunction',
    renderCells: (row, actions) => `<td>${actions}</td><td>${_renderSysFuncTraceCell(row)}</td><td><strong>${esc(row.funcId)}</strong></td><td>${esc(row.funcName)}</td><td>${esc(row.funcDef)}</td>`,
});
const _origSysFuncSubmit = sysFuncCRUD.submit;
const _origSysFuncEdit   = sysFuncCRUD.edit;
// [P2 batch 5] L4089-4107 moved verbatim to bindings_modules.js
window.editSysFunction = function(iId) {
    _origSysFuncEdit(iId);
    const arr = sys() ? sys().functions : null;
    if (!arr) return;
    const row = arr.find(r => String(r.internalId) === String(iId));   // 28 Aug 2026 — numeric-id rows vs the kebab's string id
    const traceIds = row && (Array.isArray(row.traceIds) ? row.traceIds : (row.traceId ? [row.traceId] : []));
    populateSysFuncTraceDropdown(traceIds || []);
};
window.deleteSysFunction = sysFuncCRUD.deleteItem;
window.renderSysFunctions = sysFuncCRUD.render;

// ==========================================
// CASCADE OBSOLESCENCE
// Deleting a FUNCTION is destructive to the function row only; everything that
// traced to it (FCIM failure conditions, FHA rows, requirements, fault trees) is
// left in place but flagged OBSOLETE — a non-destructive marker, never a delete.
// The whole cascade is ONE undoable step (a single pushUndo at the top, coalesced)
// and ends with a single toast summary. No confirmation dialog.
//
// Matching is string-based (there is NO enforced FK between functions and their
// downstream artifacts). In-app rows store the function's sub-function / function
// CODE; Excel-imported rows may store the NAME — so we match a link field against
// EITHER code or name (trim + string compare). Every external/global touchpoint is
// typeof/try-guarded so a missing helper can never abort the cascade.
// ==========================================
(function installCascadeObsolescence() {
    // Flag a single row/page obsolete in place. Idempotent: a row already obsolete
    // is left untouched (so re-running never overwrites an earlier reason/timestamp,
    // and the change-count stays honest). Returns true only when it actually flipped.
    function _markObsolete(row, reason) {
        if (!row || row.obsolete) return false;
        row.obsolete = true;
        row.obsoleteReason = reason;
        row.obsoletedAt = new Date().toISOString();
        return true;
    }

    // String-equality helper that tolerates null/undefined and surrounding whitespace.
    function _eqTrim(a, b) {
        if (a == null || b == null) return false;
        return String(a).trim() === String(b).trim();
    }

    // Does an artifact's link field point at this function? Matches against any of the
    // candidate keys (code + name).
    function _linkMatches(linkVal, keys) {
        if (linkVal == null) return false;
        for (let i = 0; i < keys.length; i++) {
            if (_eqTrim(linkVal, keys[i])) return true;
        }
        return false;
    }

    // Mark every downstream artifact that traces to funcRow obsolete.
    // scope is 'aircraft' | 'system'; sysObj is the active system object for system scope.
    // Returns counts { fcim, fha, req, fta } of rows/pages newly flagged.
    function _cascadeObsoleteForFunction(funcRow, scope, sysObj) {
        const counts = { fcim: 0, fha: 0, req: 0, fta: 0 };
        if (!funcRow) return counts;

        const isAC = scope === 'aircraft';
        // Aircraft links via subId/subName; system via funcId/funcName.
        const keys = isAC
            ? [funcRow.subId, funcRow.subName]
            : [funcRow.funcId, funcRow.funcName];
        const label = isAC
            ? (funcRow.subName || funcRow.subId || funcRow.funcName || funcRow.funcId || '')
            : (funcRow.funcName || funcRow.funcId || '');
        const reason = 'Parent function ' + String(label).trim() + ' removed';

        // Resolve the four downstream stores for this scope, guarding every access.
        let fcimStore = null, fhaStore = null, reqStore = null;
        try {
            if (isAC) {
                fcimStore = (typeof acFcimData !== 'undefined') ? acFcimData : null;
                fhaStore  = (typeof acFhaData  !== 'undefined') ? acFhaData  : null;
                reqStore  = (typeof acReqData  !== 'undefined') ? acReqData  : null;
            } else if (sysObj) {
                fcimStore = sysObj.fcim || null;
                fhaStore  = sysObj.fha  || null;
                reqStore  = sysObj.req  || null;
            }
        } catch (e) { /* leave stores null */ }

        // 1. FCIM rows — link field is row.subId.
        try {
            if (Array.isArray(fcimStore)) {
                fcimStore.forEach(r => {
                    if (r && _linkMatches(r.subId, keys) && _markObsolete(r, reason)) counts.fcim++;
                });
            }
        } catch (e) { /* skip */ }

        // 2. FHA rows — link field is row.subId. Collect the internalIds of the rows we
        //    flag here (obsolete or already-obsolete that match) so the FTA step can find
        //    the trees that hang off them.
        const matchedFhaIds = [];
        try {
            if (Array.isArray(fhaStore)) {
                fhaStore.forEach(r => {
                    if (r && _linkMatches(r.subId, keys)) {
                        if (r.internalId != null) matchedFhaIds.push(r.internalId);
                        if (_markObsolete(r, reason)) counts.fha++;
                    }
                });
            }
        } catch (e) { /* skip */ }

        // 3. Requirements — link field is row.traceId. Use the existing obsolete/orphan
        //    vocabulary on reqSource (the badge renderer + filters already read these),
        //    and record an audit entry when ReqHistory is present.
        try {
            if (Array.isArray(reqStore)) {
                reqStore.forEach(r => {
                    if (!r || !_linkMatches(r.traceId, keys)) return;
                    if (r.reqSource && r.reqSource.obsolete) return; // already obsoleted — don't double-count
                    r.reqSource = r.reqSource || {};
                    r.reqSource.obsolete = { reason: reason, taggedAt: new Date().toISOString() };
                    r.reqSource.orphan = true;
                    counts.req++;
                    try {
                        if (typeof window.ReqHistory !== 'undefined' && window.ReqHistory && typeof window.ReqHistory.record === 'function') {
                            window.ReqHistory.record(r, 'reconcile', null, { reason: reason, note: reason });
                        }
                    } catch (e2) { /* audit is best-effort */ }
                });
            }
        } catch (e) { /* skip */ }

        // 4. Fault trees — a page is associated with this function when any of its
        //    linkedFhaIds[] (or legacy scalar linkedFhaId) is one of the FHA internalIds
        //    we just matched. (Node-level externalSource links use prefixed AC_/SYS_ ids;
        //    best-effort handled below, but the linkedFhaIds intersection is the required
        //    path.)
        try {
            if (matchedFhaIds.length && typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) {
                const fhaIdSet = new Set(matchedFhaIds.map(String));
                const prefix = isAC ? 'AC_' : 'SYS_';
                ftaPages.forEach(page => {
                    if (!page) return;
                    let hit = false;
                    // Required path: linkedFhaIds[] / linkedFhaId (raw FHA internalIds).
                    const lids = Array.isArray(page.linkedFhaIds)
                        ? page.linkedFhaIds
                        : (page.linkedFhaId != null ? [page.linkedFhaId] : []);
                    for (let i = 0; i < lids.length; i++) {
                        if (fhaIdSet.has(String(lids[i]))) { hit = true; break; }
                    }
                    // Best-effort: node-level externalSource links to an obsoleted FHA
                    // (prefixed AC_<id>/SYS_<id>). Walk the page's nodes if present.
                    if (!hit) {
                        try {
                            const stack = [];
                            if (page.root) stack.push(page.root);
                            while (stack.length) {
                                const n = stack.pop();
                                if (!n) continue;
                                const es = n.externalSource;
                                if (es && (es.kind === 'fha') && es.targetId != null) {
                                    const raw = String(es.targetId).replace(prefix, '');
                                    if (fhaIdSet.has(raw)) { hit = true; break; }
                                }
                                const kids = (n.children || []).concat(n._children || []);
                                for (let j = 0; j < kids.length; j++) stack.push(kids[j]);
                            }
                        } catch (eWalk) { /* node walk is best-effort */ }
                    }
                    if (hit && _markObsolete(page, reason)) counts.fta++;
                });
            }
        } catch (e) { /* skip */ }

        return counts;
    }

    // Pluralize helper for the toast summary.
    function _plural(n, singular, plural) {
        return n + ' ' + (n === 1 ? singular : (plural || (singular + 's')));
    }

    // Top-level entry: remove a function and cascade obsolescence to its downstream
    // artifacts as one undoable step, then re-render the affected tabs + toast.
    function _removeFunctionCascade(internalId, scope) {
        const isAC = scope === 'aircraft';
        let store = null, sysObj = null;
        try {
            if (isAC) {
                store = (typeof acFunctionsData !== 'undefined') ? acFunctionsData : null;
            } else {
                sysObj = (typeof sys === 'function') ? sys() : null;
                store = sysObj ? sysObj.functions : null;
            }
        } catch (e) { store = null; }
        if (!Array.isArray(store)) return;

        const idx = store.findIndex(x => x && String(x.internalId) === String(internalId));
        if (idx < 0) return;
        const funcRow = store[idx];

        // Single undo snapshot at the top — pushUndo coalesces everything that follows
        // (within ~150ms) into one undo unit.
        try { if (typeof pushUndo === 'function') pushUndo('Remove function (cascade obsolete)'); } catch (e) {}

        // Flag downstream artifacts BEFORE removing the function row (the cascade reads
        // the row's codes/names to build its match keys).
        const counts = _cascadeObsoleteForFunction(funcRow, scope, sysObj);

        // Now remove just the function row.
        store.splice(idx, 1);

        // Re-render the affected tabs for this scope. FCIM afterChange (which rebuilds
        // extracted FC lists) runs inside the CRUD render path, so calling the render
        // hooks is sufficient.
        try {
            if (isAC) {
                if (typeof renderACFunctions === 'function') renderACFunctions();
                if (typeof renderACFCIM === 'function') renderACFCIM();
                if (typeof renderACFHA === 'function') renderACFHA();
                if (typeof window.renderACReq === 'function') window.renderACReq();
                else if (typeof renderACReq === 'function') renderACReq();
            } else {
                if (typeof renderSysFunctions === 'function') renderSysFunctions();
                if (typeof renderSysFCIM === 'function') renderSysFCIM();
                if (typeof renderSysFHA === 'function') renderSysFHA();
                if (typeof window.renderSysReq === 'function') window.renderSysReq();
                else if (typeof renderSysReq === 'function') renderSysReq();
            }
        } catch (e) { /* render hooks are best-effort */ }

        // Fault trees only need re-rendering / recalc when at least one tree flipped.
        if (counts.fta > 0) {
            try { if (typeof renderFTASidebar === 'function') renderFTASidebar(); } catch (e) {}
            try { if (typeof calculateAllProbabilities === 'function') calculateAllProbabilities(); } catch (e) {}
            try { if (typeof updateD3 === 'function') updateD3(); } catch (e) {}
        }

        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (e) {}

        // Build the toast summary — omit zero categories, pluralize each.
        const flagged = counts.fcim + counts.fha + counts.req + counts.fta;
        const parts = [];
        if (counts.fcim) parts.push(_plural(counts.fcim, 'failure condition'));
        if (counts.fha)  parts.push(_plural(counts.fha,  'FHA row'));
        if (counts.req)  parts.push(_plural(counts.req,  'requirement'));
        if (counts.fta)  parts.push(_plural(counts.fta,  'fault tree'));
        let msg, kind;
        if (flagged > 0) {
            msg = 'Function removed — marked obsolete: ' + parts.join(', ') + '.';
            kind = 'warning';
        } else {
            msg = 'Function removed. No downstream artifacts traced to it.';
            kind = 'info';
        }
        try { if (typeof showToast === 'function') showToast(msg, kind, 5000); } catch (e) {}
    }

    // Override the function-delete globals so the cascade runs in place of the plain
    // makeCRUD deleteItem (which just splices + re-renders with no undo/cascade).
    window.deleteACFunction  = function (id) { _removeFunctionCascade(id, 'aircraft'); };
    window.deleteSysFunction = function (id) { _removeFunctionCascade(id, 'system'); };

    // Expose for any programmatic callers / tests.
    window._cascadeObsoleteForFunction = _cascadeObsoleteForFunction;
    window._removeFunctionCascade = _removeFunctionCascade;
})();

const sysFcimCRUD = makeCRUD({
    key: 'sysFcim',
    store: () => sys()?.fcim,
    storePrecondition: () => sys() ? null : 'Please open a system folder first.',
    formIds: { subId: 'sys-fcim-subfunc', awareness: 'sys-fcim-crew', tlId: 'sys-fcim-tl-id', tlDesc: 'sys-fcim-tl-desc', plId: 'sys-fcim-pl-id', plDesc: 'sys-fcim-pl-desc', mId: 'sys-fcim-m-id', mDesc: 'sys-fcim-m-desc' },
    submitBtn: 'btn-submit-sys-fcim', cancelBtn: 'btn-cancel-sys-fcim', defaultText: 'Log System FCIM',
    tableBody: 'sys-fcim-body',
    editFnName: 'editSysFCIM', deleteFnName: 'deleteSysFCIM',
    afterChange: () => {
        const s = sys(); if (!s) return;
        s.extractedFCs = [];
        _pushExtractedFCs(s.fcim, s.extractedFCs);
    },
    // Cascade obsolescence — badge the first (sub-function) cell when flagged obsolete.
    renderCells: (row, actions) => _fcimRenderCells(row, actions),
});
window.submitSysFCIM = sysFcimCRUD.submit;
window.editSysFCIM = sysFcimCRUD.edit;
window.deleteSysFCIM = sysFcimCRUD.deleteItem;
window.renderSysFCIM = sysFcimCRUD.render;

// Shared FCIM table row renderer for both AC and System FCIM tabs. Columns (must match the
// <thead>): Actions, Sub-Function, Awareness, Total Loss, Partial Loss, Malfunction.
// An "N/A" awareness row documents an inapplicable crew-unaware case: it is non-tracing,
// has empty tl/pl/m, and carries a rationale — so we badge the awareness cell as non-tracing
// and surface the rationale in the Total Loss cell, leaving Partial/Malfunction empty.
// [P2 batch 6] L3726-3761 moved verbatim to misc_fn_modules.js
window.rebuildExtractedFCsForAllSystems = rebuildExtractedFCsForAllSystems;

// Phase 53.42 — Auto-fill FC IDs on blank-fcId FHA rows by matching FCIM TL/PL/M descriptions
// against the FHA's own description. Scoring is token-set Jaccard (lowercased, stripped
// of punctuation, common stopwords removed) so "LV power from 1 LV Bus" still matches
// "LVDC distribute LV power from LV Bus". Threshold 0.4 to avoid false positives. Returns
// the number of rows filled. Tries first to match within the FHA's own subId; if none match,
// falls back to any FCIM in the system.
// [P2 batch 4] L7864-7934 moved verbatim to helpers_modules.js
window.autoFillFcIdsForActiveSystem = autoFillFcIdsForActiveSystem;

// [P2 batch 4] L7937-8008 moved verbatim to helpers_modules.js

const sysReqCRUD = makeCRUD({
    key: 'sysReq',
    store: () => sys()?.req,
    storePrecondition: () => sys() ? null : 'Please open a system folder first.',
    formIds: {
        traceId: 'sys-req-trace', level: 'sys-req-level', type: 'sys-req-type', analysis: 'sys-req-analysis', text: 'sys-req-text', rat: 'sys-req-rat',
        // `type` is the ARP4754B §5.3.1 class; `analysis` is which analysis produced
        // it. They were one field until 1 Aug 2026 — see req_taxonomy.js.
        // Phase 29.1 — V&V fields per ARP 4754B §6.3 + §6.4.
        validationMethod: 'sys-req-val-method', validationStatus: 'sys-req-val-status', validationEvidence: 'sys-req-val-evidence',
        verifMethod:      'sys-req-ver-method', verifStatus:      'sys-req-ver-status', verifEvidence:      'sys-req-ver-evidence',
        // Phase 53.63 — derivation chain per ARP 4754B §6.1.1.
        derivationType: 'sys-req-derivation-type', parentReqId: 'sys-req-parent'
    },
    submitBtn: 'btn-submit-sys-req', cancelBtn: 'btn-cancel-sys-req', defaultText: 'Log Sys Requirement',
    tableBody: 'sys-req-body',
    editFnName: 'editSysReq', deleteFnName: 'deleteSysReq',
    renderCells: (row, actions) => `<td>${actions}</td><td><strong>${esc(row.traceId)}</strong></td><td><strong>${esc(row.level)}</strong></td><td>${esc(row.type)}</td><td>${esc(row.text)}${autoReqBadgesHtml(row)}${derivationBadgeHtml(row)}</td><td>${esc(row.rat)}</td><td>${reqVerStatusBadge(row, 'validation')}</td><td>${reqVerStatusBadge(row, 'verif')}</td>`,
});
const _origSubmitSysReq = sysReqCRUD.submit;
// [P2 batch 5] L4467-4504 moved verbatim to bindings_modules.js
window.editSysReq = sysReqCRUD.edit;
// Phase 53.56 — soft delete + restore for sys requirements.
window.deleteSysReq = function(internalId){
    const s = sys(); if (!s) return;
    const r = (s.req || []).find(x => String(x.internalId) === String(internalId));
    if (!r) return;
    if (r.deleted) {
        if (confirm('This requirement is already deleted. Restore it?')) {
            ReqHistory.restore(r);
            if (typeof window.renderSysReq === 'function') window.renderSysReq();
            if (typeof scheduleAutosave === 'function') scheduleAutosave();
            showToast('Requirement restored.', 'success', 2500);
        }
        return;
    }
    if (!confirm('Delete requirement ' + (r.traceId || ('REQ-' + r.internalId)) + '? It will move to the Deleted filter and can be restored from there.')) return;
    ReqHistory.softDelete(r);
    if (typeof window.renderSysReq === 'function') window.renderSysReq();
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
    showToast('Requirement deleted. Use the Deleted filter to restore.', 'info', 3500);
};
// [P2 batch 5] L4526-4534 moved verbatim to bindings_modules.js
// Decorate sys req render with the same row-tagging + filter as AC.
const _origRenderSysReq = sysReqCRUD.render;
window.renderSysReq = function(){
    _origRenderSysReq();
    const tbody = document.getElementById('sys-req-body');
    if(!tbody) return;
    const store = (sys() && sys().req) ? sys().req : [];
    Array.from(tbody.querySelectorAll('tr')).forEach((tr, i) => {
        const r = store[i];
        if(!r) return;
        tr.setAttribute('data-ar-kind', r.reqSource ? (r.reqSource.generator || 'auto') : 'manual');
        if(r.reqSource && r.reqSource.stale) tr.setAttribute('data-ar-stale', '1'); else tr.removeAttribute('data-ar-stale');
        if(r.compromised) tr.setAttribute('data-ar-compromised', '1'); else tr.removeAttribute('data-ar-compromised');
        if(r.reqSource && r.reqSource.obsolete) tr.setAttribute('data-ar-obsolete', '1'); else tr.removeAttribute('data-ar-obsolete');
        if(r.status === 'archived') tr.setAttribute('data-ar-archived', '1'); else tr.removeAttribute('data-ar-archived');
        // Phase 53.56 — deleted flag + history/restore buttons.
        if(r.deleted) tr.setAttribute('data-ar-deleted', '1'); else tr.removeAttribute('data-ar-deleted');
        _patchReqRowActions(tr, r, 'sys');
    });
    applyAutoReqFilter('sys');
};

// [P2 batch 3] L9573-9729 moved verbatim to support_modules.js

const praCRUD = makeCRUD({
    key: 'pra',
    store: () => praData,
    formIds: { praId: 'pra-id', threat: 'pra-threat', desc: 'pra-desc', systems: 'pra-systems', csfl: 'pra-csfl-impact', mitigation: 'pra-mitigation' },
    submitBtn: 'btn-submit-pra', cancelBtn: 'btn-cancel-pra', defaultText: 'Log PRA Evaluation',
    tableBody: 'pra-body',
    editFnName: 'editPRA', deleteFnName: 'deletePRA',
    renderCells: (row, actions) => {
        return '<td>' + _threadInKebab(actions, { kind:'pra', id: row.internalId }) + '</td>' +
            '<td><strong>' + esc(row.praId) + '</strong></td>' +
            '<td><strong>' + esc(row.threat) + '</strong></td>' +
            '<td>' + esc(row.desc) + '</td>' +
            '<td>' + esc(row.systems) + '</td>' +
            '<td>' + esc(row.csfl) + '</td>' +
            '<td>' + _renderPraZonesCell(row.affectedZones) + '</td>' +
            '<td>' + _renderPraExposedCell(row.affectedZones) + '</td>' +
            '<td>' + esc(row.mitigation) + '</td>';
    },
});
// Wrap PRA submit/edit/delete to handle the affected-zones multi-select that lives outside the CRUD factory.
const _origPraSubmit = praCRUD.submit;
const _origPraEdit = praCRUD.edit;
window.submitPRA = function(){
    // Snapshot the selection AND the editing id BEFORE the factory's submit runs — the
    // factory calls cancelEdit() which wipes both the multi-select state and editStates.pra.
    const zones = _getPraMultiSelectValues();
    const editingId = (typeof editStates !== 'undefined') ? editStates.pra : null;
    // Phase 30.1 — capture pending catalog reference set by selectPRCatalogueEntry().
    const pendingRef = window._pendingPrCatalogueRef || null;
    // Phase 53.67 — capture the per-PR analysis model BEFORE _origPraSubmit because
    // cancelEdit() inside it may not clear the dynamic form fields, but we want the
    // snapshot taken from the live form state.
    const modelSnap = _readPraModelForm();
    _origPraSubmit();
    const target = editingId != null ? praData.find(r => String(r.internalId) === String(editingId)) : praData[praData.length - 1];
    if (target) {
        target.affectedZones = zones;
        if (pendingRef) target.prCatalogueRef = pendingRef;
        if (modelSnap) target.model = modelSnap;
    }
    window._pendingPrCatalogueRef = null;
    populatePraAffectedZonesDropdown([]);   // clear selection after submit
    renderPRA();
};
window.editPRA = function(iId) {
    _origPraEdit(iId);
    const row = praData.find(r => String(r.internalId) === String(iId));   // 28 Aug 2026 — numeric-id rows vs the kebab's string id
    populatePraAffectedZonesDropdown(row ? (row.affectedZones || []) : []);
    // Phase 30.1 — remember existing catalog ref so an edit that doesn't browse keeps it.
    window._pendingPrCatalogueRef = (row && row.prCatalogueRef) ? row.prCatalogueRef : null;
    // Phase 53.67 — restore the per-PR analysis model into the dynamic form.
    if (row && row.model) {
        const sel = document.getElementById('pra-model-type');
        if (sel) sel.value = row.model.type || '';
        _renderPraModelForm(row.model.type, row.model.params || {});
    } else {
        _renderPraModelForm('', {});
    }
};
window.deletePRA = praCRUD.deleteItem;
window.renderPRA = praCRUD.render;

// ============================================================================
// Phase 53.67 — PR analysis model dynamic form.
// _populatePraModelTypeDropdown — fills the select; the user's PR catalog
//   choice can pre-select via PR_TO_MODEL_TYPE map (called from selectPRCatalogueEntry).
// _renderPraModelForm — given a type id + existing params, paints the param
//   fields into #pra-model-params. Returns when called with empty type (shown
//   as "select an analysis model" placeholder).
// _readPraModelForm — pulls current param values back out into a {type, params}
//   object suitable for storing on the PRA record's `model` field.
// ============================================================================
// [P2 batch 4] L8192-8267 moved verbatim to helpers_modules.js

// [P2 batch 5] L4633-4636 moved verbatim to bindings_modules.js

// [P2 batch 6] L3916-3916 moved verbatim to misc_fn_modules.js
const zsaCRUD = makeCRUD({
    key: 'zsa',
    store: () => zsaData,
    formIds: { zoneId: 'zsa-zone-id', desc: 'zsa-desc', equip: 'zsa-equip', severity: 'zsa-severity', interference: 'zsa-interference', mitigation: 'zsa-mitigation' },
    submitBtn: 'btn-submit-zsa', cancelBtn: 'btn-cancel-zsa', defaultText: 'Log Zonal Analysis',
    tableBody: 'zsa-body',
    editFnName: 'editZSA', deleteFnName: 'deleteZSA',
    // After loading a row into the form, sync the mitigation placeholder to the current severity.
    onEdit: () => checkZSA_SpatialReq(),
    renderCells: (row, actions) => {
        const sevClass = row.severity === 'Catastrophic' ? 'cell-Catastrophic' : 'cell-Major';
        return '<td>' + _threadInKebab(actions, { kind:'zsa', id: row.internalId }) + '</td>' +
            '<td><strong>' + esc(row.zoneId) + '</strong></td>' +
            '<td>' + esc(row.desc) + '</td>' +
            '<td>' + esc(row.equip) + '</td>' +
            '<td class="' + sevClass + '">' + (row.severity === 'Catastrophic' ? _sevPill('Catastrophic') : esc(row.severity)) + '</td>' +
            '<td>' + _renderZsaHousedFunctionsCell(row.housedFunctions) + '</td>' +
            '<td>' + esc(row.interference) + '</td>' +
            '<td>' + esc(row.mitigation) + '</td>';
    },
});
const _origZsaSubmit = zsaCRUD.submit;
const _origZsaEdit = zsaCRUD.edit;
window.submitZSA = function(){
    // Capture editingId BEFORE _origZsaSubmit (the factory's cancelEdit clears editStates).
    const housed = _getZsaMultiSelectValues();
    const editingId = (typeof editStates !== 'undefined') ? editStates.zsa : null;
    // Phase 53.67 — snapshot adjacency hints BEFORE submit (cancelEdit may clear).
    const adjacency = _readZsaAdjacencyHints();
    _origZsaSubmit();
    const target = editingId != null ? zsaData.find(r => String(r.internalId) === String(editingId)) : zsaData[zsaData.length - 1];
    if (target) {
        target.housedFunctions = housed;
        target.adjacency = adjacency;
    }
    populateZsaHousedFunctionsDropdown([]);
    _clearZsaAdjacencyHints();
    renderZSA();
    // PRA's exposed-functions and zone column depend on ZSA — refresh.
    populatePraAffectedZonesDropdown(_getPraMultiSelectValues());
    renderPRA();
};
window.editZSA = function(iId) {
    _origZsaEdit(iId);
    const row = zsaData.find(r => String(r.internalId) === String(iId));   // 28 Aug 2026 — numeric-id rows vs the kebab's string id
    populateZsaHousedFunctionsDropdown(row ? (row.housedFunctions || []) : []);
    _writeZsaAdjacencyHints(row ? (row.adjacency || {}) : {});
};

// Phase 53.67 — adjacency hints capture / restore on the ZSA form.
// [P2 batch 6] L3967-4001 moved verbatim to misc_fn_modules.js
window.deleteZSA = function(iId) {
    zsaCRUD.deleteItem(iId);
    // PRA derived columns depend on ZSA — refresh.
    populatePraAffectedZonesDropdown(_getPraMultiSelectValues());
    renderPRA();
};
window.renderZSA = zsaCRUD.render;

// ---------- Common Mode Analysis (CMA) — ARP4761A App M ----------
// Independence verification record. Common modes considered are stored as a string[].

// CMA_MODE_LABELS — extracted to ui_constants.js (Phase 76; byte-identical, loaded BEFORE this file).

// [P2 batch 4] L8373-8472 moved verbatim to helpers_modules.js

// ----- CMA scope (Aircraft / System) helpers, mirroring FMEA -----
// [P2 batch 5] L4740-4740 moved verbatim to bindings_modules.js

// [P2 batch 6] L4020-4036 moved verbatim to misc_fn_modules.js
// [P2 batch 5] L4759-4765 moved verbatim to bindings_modules.js

const cmaCRUD = makeCRUD({
    key: 'cma',
    store: () => cmaData,
    formIds: {
        cmaId: 'cma-id', subject: 'cma-subject', claim: 'cma-claim', status: 'cma-status',
        findings: 'cma-findings', mitigation: 'cma-mitigation', references: 'cma-references',
        scope: 'cma-scope', owningSystemId: 'cma-owning-system'
    },
    submitBtn: 'btn-submit-cma', cancelBtn: 'btn-cancel-cma', defaultText: 'Log CMA Entry',
    tableBody: 'cma-body',
    editFnName: 'editCMA', deleteFnName: 'deleteCMA',
    renderCells: (row, actions) => {
        return '<td>' + _threadInKebab(actions, { kind:'cma', id: row.internalId }) + '</td>' +
            _renderScopeCell(row.scope, row.owningSystemId) +
            '<td><strong>' + esc(row.cmaId) + '</strong></td>' +
            '<td>' + _cmaSuggestBadge(row) + esc(row.subject) + '</td>' +
            '<td>' + esc(row.claim) + '</td>' +
            '<td>' + _renderCmaLinkedGatesCell(row.linkedGateIds) + '</td>' +
            '<td>' + _renderCmaModesCell(row.modes) + '</td>' +
            '<td>' + esc(row.findings) + '</td>' +
            '<td>' + esc(row.mitigation) + '</td>' +
            '<td>' + _renderCmaStatusCell(row.status) + '</td>';
    },
});
const _origCmaSubmit = cmaCRUD.submit;
const _origCmaEdit = cmaCRUD.edit;
const _origCmaRender = cmaCRUD.render;
window.submitCMA = function() {
    const scopeEl = document.getElementById('cma-scope');
    const scope = (scopeEl && scopeEl.value) || 'aircraft';
    if (scope === 'system') {
        const owner = (document.getElementById('cma-owning-system') || {}).value || '';
        if (!owner) return alert('System-scope CMAs require an owning System Folder. Pick one or switch the scope to Aircraft.');
    }
    const modes = _getCmaModesSelection();
    const linkedGateIds = _getCmaLinkedGatesSelection();
    // Capture editingId BEFORE _origCmaSubmit (the factory's cancelEdit clears editStates.cma).
    const editingId = editStates.cma;
    _origCmaSubmit();
    const target = editingId != null ? cmaData.find(r => String(r.internalId) === String(editingId)) : cmaData[cmaData.length - 1];
    if (target) {
        target.modes = modes;
        target.linkedGateIds = linkedGateIds;
        // Normalize the scope fields the factory just wrote.
        target.scope = scope;
        target.owningSystemId = scope === 'system' ? ((document.getElementById('cma-owning-system') || {}).value || '') : '';
    }
    // Reset both checkbox lists after a new submission.
    populateCmaModesCheckboxes([]);
    populateCmaLinkedGatesDropdown([]);
    // The CMA may have just (de)flagged a gate's AutoReq independence req as compromised — recompute.
    try { AutoReq.recomputeFlags('ac'); systemsData.forEach(s => AutoReq.recomputeFlags('sys-' + s.id)); } catch(e){}
    if (typeof renderACReq === 'function') renderACReq();
    if (typeof renderSysReq === 'function') renderSysReq();
    // Reset scope picker to default for next entry.
    if (scopeEl) scopeEl.value = 'aircraft';
    onCmaScopeChange();
    renderCMA();
};
window.editCMA = function(iId) {
    _origCmaEdit(iId);
    const row = cmaData.find(r => String(r.internalId) === String(iId));   // 28 Aug 2026 — numeric-id rows vs the kebab's string id
    const modes = (row && row.modes) || [];
    populateCmaModesCheckboxes(modes);
    // Restore linked-gates selection.
    populateCmaLinkedGatesDropdown((row && row.linkedGateIds) || []);
    // Restore scope + owning system (makeCRUD writes simple fields but we want explicit handling).
    const scopeEl = document.getElementById('cma-scope');
    if (scopeEl) scopeEl.value = (row && row.scope) || 'aircraft';
    populateCmaOwningSystem((row && row.owningSystemId) || '');
    onCmaScopeChange();
};
window.deleteCMA = cmaCRUD.deleteItem;
// Wrap render to apply scope filter (legacy rows default to 'aircraft').
// [P2 batch 5] L4841-4875 moved verbatim to bindings_modules.js

// ============================================================================
// Shared-resource common-cause — link an FTA branch back to the aircraft
// sub-functions it (transitively) realizes, so we can spot when two nominally
// independent channels under an AND/INHIBIT gate both consume the SAME resource
// (power / hydraulics / fuel / …). Losing that one resource defeats the
// independence the gate assumes. All three node→function link paths are partial,
// so we UNION them; every global access is guarded.
//   (a) node.externalSource {kind:'fha', targetId:'AC_<id>'|'SYS_<id>'} → FHA → subIds
//   (b) node.realizedByItemId → itemsData item → item.traceIds (= function subIds)
//   (c) page-level fallback: page.linkedFhaIds[] (legacy scalar linkedFhaId)
//       → resolve each against acFhaData by internalId → .subIds
// ----------------------------------------------------------------------------
// Read an FHA row's linked sub-function ids (multi-link with legacy scalar).
// [P2 batch 3] L10236-10487 moved verbatim to support_modules.js
window.autoDetectCommonModes = autoDetectCommonModes;

// Phase 58 — dedicated entry: scan AND/INHIBIT gates for shared-resource
// couplings and stage SUGGESTED CMA rows. Invoked from the resource-impact panel
// ("Flag shared-resource common modes in CMA"). Mirrors autoDetectCommonModes'
// persistence/toast pattern; dedups against the current cmaData autoKeys.
// [P2 batch 5] L4897-4916 moved verbatim to bindings_modules.js

// Suggestion badge shown on auto-detected CMA rows until Accepted.
// [P2 batch 6] L4138-4146 moved verbatim to misc_fn_modules.js
// [P2 batch 5] L4928-4935 moved verbatim to bindings_modules.js
// [P2 batch 5] L4936-4941 moved verbatim to bindings_modules.js

// ============================================================================
// Routing / zone-spanning paths — minimal CRUD (additive).
// ----------------------------------------------------------------------------
// Mirrors the CMA pattern: makeCRUD handles the scalar fields (routingId, name,
// kind, desc), and thin submit/edit wrappers capture/restore the three
// checkbox-list multiselects (routesThroughZones, carriesFunctions, carriesItems)
// + a per-row history stamp. Persistence is handled by routingData being wired
// into every project serialize/deserialize path. No compute coupling.
// ============================================================================
const ROUTING_KINDS = ['HV', 'LV', 'fuel', 'hydraulic', 'data', 'pneumatic'];

// [P2 batch 4] L8689-8728 moved verbatim to helpers_modules.js

const routingCRUD = makeCRUD({
    key: 'routing',
    store: () => routingData,
    formIds: { routingId: 'routing-id', name: 'routing-name', kind: 'routing-kind', desc: 'routing-desc' },
    submitBtn: 'btn-submit-routing', cancelBtn: 'btn-cancel-routing', defaultText: 'Log Routing',
    tableBody: 'routing-body',
    editFnName: 'editRouting', deleteFnName: 'deleteRouting',
    validate: (data) => {
        if (!data.routingId || !String(data.routingId).trim()) return 'Routing ID is required.';
        if (!data.name || !String(data.name).trim()) return 'Name is required.';
        return null;
    },
    transform: (data) => {
        // Normalize kind to the allowed enum; default to 'LV' if blank/unknown.
        if (ROUTING_KINDS.indexOf(data.kind) < 0) data.kind = 'LV';
        return data;
    },
    renderCells: (row, actions) => {
        const chips = (ids) => {
            if (!ids || !ids.length) return '<span class="u-muted">—</span>';
            const shown = ids.slice(0, 4).map(t => '<span style="display: inline-block; padding: 1px 6px; margin: 0 3px 2px 0; background: var(--color-surface-2); border-radius: var(--r-full); font-size: 10.5px; font-family: var(--font-mono);">' + esc(t) + '</span>').join('');
            const more = ids.length > 4 ? ' <span style="font-size: 10.5px; color: var(--color-text-tertiary);">+' + (ids.length - 4) + ' more</span>' : '';
            return shown + more;
        };
        const kindBadge = '<span style="display: inline-block; padding: 1px 8px; background: var(--color-accent-soft); color: var(--color-accent); border-radius: var(--r-full); font-size: 11px; font-weight: 700; font-family: var(--font-mono);">' + esc(row.kind || 'LV') + '</span>';
        return '<td>' + actions + '</td>'
             + '<td><strong>' + esc(row.routingId) + '</strong></td>'
             + '<td>' + esc(row.name) + '</td>'
             + '<td>' + kindBadge + '</td>'
             + '<td>' + chips(row.routesThroughZones) + '</td>'
             + '<td>' + chips(row.carriesFunctions) + '</td>'
             + '<td>' + chips(row.carriesItems) + '</td>'
             + '<td><span style="font-size: 11.5px; color: var(--color-text-secondary);">' + esc(row.desc || '') + '</span></td>';
    },
});
const _origRoutingSubmit = routingCRUD.submit;
const _origRoutingEdit = routingCRUD.edit;
// [P2 batch 5] L4993-5013 moved verbatim to bindings_modules.js
window.editRouting = function (internalId) {
    _origRoutingEdit(internalId);
    const row = (routingData || []).find(r => String(r.internalId) === String(internalId));
    _populateRoutingMultiselects(row || {});
};
window.deleteRouting = function (internalId) {
    const row = (routingData || []).find(r => String(r.internalId) === String(internalId));
    if (row && typeof confirm === 'function' && !confirm('Delete routing ' + (row.routingId || internalId) + '?')) return;
    routingCRUD.deleteItem(internalId);
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
};
window.renderRouting = routingCRUD.render;

// ============================================================================
// Resources — project-wide things systems PROVIDE and functions CONSUME
// ----------------------------------------------------------------------------
// Mirrors the Routing module: makeCRUD handles the scalar fields (resId, name,
// type, description), and thin submit/edit wrappers capture/restore the two
// checkbox-list multiselects (providedBy = system ids, consumedBy = aircraft
// sub-function subIds). Persistence is handled by resourcesData being wired into
// every project serialize/deserialize path. No compute coupling.
// ============================================================================
const RESOURCE_TYPES = ['Electrical', 'Hydraulic', 'Pneumatic', 'Fuel', 'Mechanical', 'Data/Signal', 'Thermal', 'Other'];

// [P2 batch 6] L4225-4247 moved verbatim to misc_fn_modules.js

const resourcesCRUD = makeCRUD({
    key: 'resources',
    store: () => resourcesData,
    formIds: { resId: 'resources-id', name: 'resources-name', type: 'resources-type', description: 'resources-desc' },
    submitBtn: 'btn-submit-resources', cancelBtn: 'btn-cancel-resources', defaultText: 'Log Resource',
    tableBody: 'resources-body',
    editFnName: 'editResource', deleteFnName: 'deleteResource',
    validate: (data) => {
        if (!data.name || !String(data.name).trim()) return 'Name is required.';
        return null;
    },
    transform: (data) => {
        // Normalize type to the allowed enum; default to 'Other' if blank/unknown.
        if (RESOURCE_TYPES.indexOf(data.type) < 0) data.type = 'Other';
        return data;
    },
    renderCells: (row, actions) => {
        // Resolve providedBy system ids → system names; consumedBy subIds → sub-function names.
        const sysName = (id) => {
            const s = (systemsData || []).find(x => x && String(x.id) === String(id));
            return s ? (s.name || s.id) : id;
        };
        const fnName = (subId) => {
            const f = (acFunctionsData || []).find(x => x && String(x.subId) === String(subId));
            return f ? (f.subName || f.subId) : subId;
        };
        const chips = (labels) => {
            if (!labels || !labels.length) return '<span class="u-muted">—</span>';
            const shown = labels.slice(0, 4).map(t => '<span style="display: inline-block; padding: 1px 6px; margin: 0 3px 2px 0; background: var(--color-surface-2); border-radius: var(--r-full); font-size: 10.5px;">' + esc(t) + '</span>').join('');
            const more = labels.length > 4 ? ' <span style="font-size: 10.5px; color: var(--color-text-tertiary);">+' + (labels.length - 4) + ' more</span>' : '';
            return shown + more;
        };
        const typeBadge = '<span style="display: inline-block; padding: 1px 8px; background: var(--color-accent-soft); color: var(--color-accent); border-radius: var(--r-full); font-size: 11px; font-weight: 700; font-family: var(--font-mono);">' + esc(row.type || 'Other') + '</span>';
        return '<td>' + actions + '</td>'
             + '<td><strong>' + esc(row.resId) + '</strong></td>'
             + '<td>' + esc(row.name) + '</td>'
             + '<td>' + typeBadge + '</td>'
             + '<td>' + chips((row.providedBy || []).map(sysName)) + '</td>'
             + '<td>' + chips((row.consumedBy || []).map(fnName)) + '</td>'
             + '<td><span style="font-size: 11.5px; color: var(--color-text-secondary);">' + esc(row.description || '') + '</span></td>'
             + '<td><button class="btn-ghost" onclick="showResourceImpact(' + row.internalId + ')">Impact</button></td>';
    },
});
const _origResourceSubmit = resourcesCRUD.submit;
const _origResourceEdit = resourcesCRUD.edit;
// [P2 batch 5] L5107-5130 moved verbatim to bindings_modules.js
window.editResource = function (internalId) {
    _origResourceEdit(internalId);
    const row = (resourcesData || []).find(r => String(r.internalId) === String(internalId));
    _populateResourceMultiselects(row || {});
};
window.deleteResource = function (internalId) {
    const row = (resourcesData || []).find(r => String(r.internalId) === String(internalId));
    if (row && typeof confirm === 'function' && !confirm('Delete resource ' + (row.resId || internalId) + '?')) return;
    resourcesCRUD.deleteItem(internalId);
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
};
window.renderResources = resourcesCRUD.render;

// ============================================================================
// Phase 58 — Loss-of-resource impact. Power / hydraulics / etc. are COMMON
// resources: losing one defeats many "independent" functions at once. This view
// makes that visible — for a resource it lists every consuming sub-function and
// the FHA failure condition(s) those functions own, plus a worst-case severity.
// ----------------------------------------------------------------------------
// Severity ordering helper (Catastrophic > Hazardous > Major > Minor > none).
// Mirrors SEVERITY_RANK; "No Safety Effect" / "Negligible" / blank rank lowest.
// [P2 batch 4] L8926-8971 moved verbatim to helpers_modules.js
window._resourceImpact = _resourceImpact;

// Render + show the loss-of-resource impact panel for a given resource internalId.
window.showResourceImpact = function (internalId) {
    const panel = document.getElementById('resources-impact-panel');
    if (!panel) return;
    const res = (typeof resourcesData !== 'undefined' && resourcesData ? resourcesData : [])
        .find(r => r && String(r.internalId) === String(internalId));
    if (!res) { panel.style.display = 'none'; return; }
    const imp = _resourceImpact(res);
    const head = '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">'
        + '<h4 style="margin:0; color: var(--header-color);">⚡ Loss of ' + esc(res.name || res.resId || 'resource') + ' (' + esc(res.type || 'Other') + ') — impact</h4>'
        + '<button class="btn-ghost" title="Close" onclick="document.getElementById(\'resources-impact-panel\').style.display=\'none\';" style="line-height:1; padding:2px 9px; font-size:15px;">×</button>'
        + '</div>';
    let body = '';
    if (!imp.funcCount) {
        body = '<p style="margin:10px 0 0 0; font-size:12.5px; color: var(--color-text-secondary);">No consuming functions linked yet — add them in <strong>Consumed By</strong>.</p>';
    } else {
        body += '<p style="margin:8px 0 4px 0; font-size:12.5px; color: var(--color-text-secondary);">Defeats <strong>' + imp.funcCount + '</strong> function(s) · <strong>' + imp.fcCount + '</strong> failure condition(s) · worst severity ' + _resourceSevChip(imp.worstSeverity) + '</p>';
        if (imp.funcCount >= 2) {
            body += '<div style="margin:8px 0; padding:9px 12px; border-left:3px solid var(--sev-haz-fg); background: var(--sev-haz-bg); border-radius: var(--r-sm); font-size:12px; color: var(--color-text-secondary);">'
                + 'These functions all depend on this single resource. Any independence or redundancy claim between them (e.g. an FTA AND-gate) is defeated by loss of this resource.'
                + '<div style="margin-top:8px;"><button class="btn-ghost" onclick="detectResourceCommonModes()">Flag shared-resource common modes in CMA</button></div>'
                + '</div>';
        }
        body += imp.functions.map(fn => {
            const fcList = fn.fcs.length
                ? '<ul style="margin:4px 0 0 0; padding-left:18px;">' + fn.fcs.map(fc =>
                    '<li style="font-size:12px; margin:2px 0; color: var(--color-text-secondary);"><span style="font-family: var(--font-mono); font-weight:700;">' + esc(fc.fcId || '—') + '</span> — ' + esc(fc.fcDesc || '') + ' ' + _resourceSevChip(fc.severity) + '</li>'
                  ).join('') + '</ul>'
                : '<div style="font-size:11.5px; color: var(--color-text-tertiary); margin-top:2px;">No failure conditions linked to this function yet.</div>';
            return '<div style="margin-top:8px; padding-top:8px; border-top:1px solid var(--color-border-hair);">'
                + '<strong style="font-size:12.5px;">' + esc(fn.subName) + '</strong>' + fcList + '</div>';
        }).join('');
    }
    panel.innerHTML = head + body;
    panel.style.display = 'block';
};

// ============================================================================
// Phase 50 — Review / commenting module
// ----------------------------------------------------------------------------
// Public surface (called from UI + tables):
//   Review.threadsFor(target)    -> [{ root, replies: [...] }, ...]
//   Review.openCountFor(target)  -> number   (open root + replies)
//   Review.totalCountFor(target) -> number   (open + resolved, all depths)
//   Review.addComment(target, text, parentId?) -> the new comment
//   Review.resolveComment(commentId, note?)
//   Review.reopenComment(commentId)
//   Review.deleteComment(commentId)   // cascades replies
//   Review.allOpen()             -> open comments (any artifact), newest first
//   Review.byKind(kind)          -> all comments targeting `kind`
//   Review.setReviewerName(name)
//   Review.getReviewerName()
//
// targetMatches semantics: two targets match iff their kind + id (+ systemId
// when present on the comment) line up. systemId is only set on sys-* kinds.
// ============================================================================
// Review — extracted to assurance_modules.js (Phase 76; byte-identical, loaded before this file).


// =============================================================================
// Phase 56.22 — Auto-derived hazard trace matrix
// =============================================================================
// Walks the function-trace graph + external-source FTA edges to produce every
// FHA-to-FHA trace in the project (AC↔Sys, Sys↔AC, Sys↔Sys). No manual
// `acTraces[]` data entry required — the matrix re-derives on every render so
// adding a sys function trace, or linking a sys FHA to a new function, or
// dropping an external-source link on a fault tree event automatically lights
// up the corresponding row in the matrix.
//
// Traces are emitted in BOTH directions (symmetric) so the matrix can be
// filtered to "Sys → AC" as well as "AC → Sys". The de-dup key folds direction
// so we never emit the same logical edge twice in one direction.
window._traceScopeFilter = 'all';   // 'all' | 'ac-sys' | 'sys-ac' | 'sys-sys'
// [P2 batch 5] L5228-5234 moved verbatim to bindings_modules.js

// Returns an array of edges:
//   { source: {fha, scope:'ac'|'sys', systemId?, systemName?},
//     target: {fha, scope, systemId?, systemName?, function?},
//     basis:  'function-trace' | 'external-source' | 'manual-acTraces' }
// [P2 batch 5] L5240-5436 moved verbatim to bindings_modules.js

// =============================================================================
// Phase 56.26 — Requirements Repository (unified scoped view of all reqs)
// =============================================================================
// Renders a tree-style directory rail (Aircraft + per-system) and a filtered
// requirements table. The per-tab requirement views (view-ac-req, view-sys-req)
// remain unchanged as the in-context entry points; this view is the project-
// wide aggregator that safety leads and certification reviewers want.
window._reqsRepoActive = window._reqsRepoActive || 'aircraft';
// [P2 batch 5] L5446-5449 moved verbatim to bindings_modules.js
// [P2 batch 4] L9269-9372 moved verbatim to helpers_modules.js
window.renderRequirementsRepository = renderRequirementsRepository;

// =============================================================================
// Phase 56.27 — ARP 4761A Process full page
// =============================================================================
// Reuses computePhaseStatus() (the same data backing the dashboard strip)
// but renders one richer stacked card per phase with status, progress,
// description, and a deep-link button into the scoped view.
// [P2 batch 6] L4418-4450 moved verbatim to misc_fn_modules.js
window.renderArpProcessPage = renderArpProcessPage;

// =============================================================================
// Phase 56.27 — V&V Status Roll-up
// =============================================================================
// Aggregates every requirement (Aircraft + all Systems) and surfaces the
// validation / verification posture. Filter chips for scope, level, type,
// and status; top summary tiles; table rows.
window._vvFilters = window._vvFilters || { scope: 'all', level: 'any', type: 'any', status: 'any' };
// [P2 batch 5] L5501-5504 moved verbatim to bindings_modules.js
// [P2 batch 4] L9427-9542 moved verbatim to helpers_modules.js
window.renderVVStatusPage = renderVVStatusPage;

// =============================================================================
// Phase 56.27 — DAL Credit Reference (DO-178C / DO-254)
// =============================================================================
// Two halves:
//   1. Distribution of claimed DAL across project items/requirements/FTAs
//   2. Reference cards summarizing DO-178C Table A-1..A-7 + DO-254 Appendix A
//      objective counts per DAL — full text via cite-by-reference per
//      Phase 53.51 copyright policy.
// [P2 batch 4] L9553-9633 moved verbatim to helpers_modules.js
window.renderDalReferencePage = renderDalReferencePage;

// [P2 batch 4] L9636-9685 moved verbatim to helpers_modules.js
window.generateTraceMatrix = generateTraceMatrix;

// Phase 56.22 — back-ref panel enhancement: when the panel target is an FHA,
// append "Related hazards (auto-derived)" cards using deriveHazardTraces().
// [P2 batch 5] L5524-5534 moved verbatim to bindings_modules.js

// ==========================================
// FMEA
// ==========================================
// [P2 batch 6] L4485-4533 moved verbatim to misc_fn_modules.js

// Click handler for the scope filter chips above the FMEA table.
// [P2 batch 5] L5590-5596 moved verbatim to bindings_modules.js

// UI-only mode swap: toggles segmented control, form sections, label, placeholder. Does NOT
// cancel an in-progress edit or trigger a re-render. Safe to call from inside _writeFmeaForm.
// [P2 batch 4] L9766-9834 moved verbatim to helpers_modules.js

// [P2 batch 5] L5602-5608 moved verbatim to bindings_modules.js

// [P2 batch 3] L11706-11878 moved verbatim to support_modules.js

// Phase 53.60 — when parent library changes, surface its failure-mode menu so the user
// can click to populate Failure Mode + α_FM. Empty if no distribution is on file.
// [P2 batch 5] L5614-5640 moved verbatim to bindings_modules.js

// Phase 53.60 — apply a published failure mode to the form fields (mode text + α_FM).
// [P2 batch 5] L5643-5652 moved verbatim to bindings_modules.js

// Phase 53.60 — when α_FM changes, recompute λ from parent.lambda × α_FM if a parent is set.
// [P2 batch 5] L5655-5666 moved verbatim to bindings_modules.js

// ============================================================================
// ============================================================================
// Phase 53.65 — AI Foundation. BYO Anthropic + Voyage API keys. Pro-gated.
//   - AiClient wraps Anthropic Messages API + Voyage embeddings
//   - localStorage for API keys (with explicit security warning to user)
//   - projectConfig.aiSettings for per-project preferences (model, top-K, etc.)
//   - IndexedDB-backed AiMemory for cross-project learning (Phase 53.66 will use it)
//   - Audit log saved per-project + IndexedDB long-term
//   - aiSource metadata on every AI-generated artifact (Phase 53.67+ uses this)
// ============================================================================
// [P2 batch 5] L5678-5678 moved verbatim to bindings_modules.js
// [P2 batch 5] L5679-5679 moved verbatim to bindings_modules.js
// [P2 batch 5] L5680-5680 moved verbatim to bindings_modules.js
// [P2 batch 5] L5681-5681 moved verbatim to bindings_modules.js
// [P2 batch 5] L5682-5682 moved verbatim to bindings_modules.js

// Phase 53.66b — Pro+ proxy configuration. The Safety Lab Aero proxy holds Anthropic /
// Voyage / Azure OpenAI keys server-side and authenticates Pro+ users via license
// token. The placeholder URL is wired now; the backend will be deployed in Phase 54.
// Customers running ITAR-controlled programs get auto-routed to the Azure OpenAI
// endpoint (US-only private deployment) by the proxy based on the isITARControlled
// flag the client sends with each request.
// [P2 batch 5] L5690-5690 moved verbatim to bindings_modules.js
// Token allowance per month — measured in "Sonnet-equivalent" tokens. Each model's
// tokens are weighted so faster/cheaper models burn the allowance more slowly.
// [P2 batch 5] L5693-5693 moved verbatim to bindings_modules.js
// MODEL_TOKEN_WEIGHTS — extracted to config_data.js (Phase 76; byte-identical, loaded BEFORE this file).

// Approximate per-1M-token pricing as of 2026-Q2. Used only for the in-app cost
// tracker — Anthropic/Voyage send actual usage with each response.
// AI_PRICES_USD_PER_MTOK — extracted to config_data.js (Phase 76; byte-identical, loaded BEFORE this file).

// AiClient — extracted to core_modules.js (Phase 76; byte-identical, loaded before this file).

// AiMemory — extracted to ai_memory.js (Phase 76 modularization; byte-identical,
// loaded as a classic script BEFORE this file so window.AiMemory is already defined).

// ----------------------------------------------------------------------------
// AI Assistant tab — Settings UI handlers.
// ----------------------------------------------------------------------------
// [P2 batch 4] L9942-10000 moved verbatim to helpers_modules.js

// Phase 53.66b — ITAR toggle handler. Sets projectConfig.isITARControlled and refreshes the status line.
// [P2 batch 5] L5711-5717 moved verbatim to bindings_modules.js

// [P2 batch 4] L10011-10056 moved verbatim to helpers_modules.js

// [P2 batch 5] L5721-5753 moved verbatim to bindings_modules.js

// [P2 batch 5] L5755-5762 moved verbatim to bindings_modules.js

// [P2 batch 5] L5764-5798 moved verbatim to bindings_modules.js
// BYO-specific test that forces direct Anthropic mode by checking the user pasted a key.
// [P2 batch 5] L5800-5812 moved verbatim to bindings_modules.js

// [P2 batch 5] L5814-5836 moved verbatim to bindings_modules.js

// [P2 batch 5] L5838-5849 moved verbatim to bindings_modules.js

// [P2 batch 5] L5851-5854 moved verbatim to bindings_modules.js

// Phase 53.61 — Items / LRUs. First-class entity sitting between Function and
// Component. CRUD here is custom (not makeCRUD) because the form has a
// multi-select for traceIds and a system-picker that needs live refresh.
// ============================================================================
formConfigs.item = {
    submitBtn: 'btn-submit-item',
    cancelBtn: 'btn-cancel-item',
    defaultText: 'Log Item',
    fields: ['item-id','item-name','item-type','item-dal','item-da-type','item-owning-system','item-zone','item-csci','item-hwci','item-desc']
};

// [P2 batch 4] L10204-10266 moved verbatim to helpers_modules.js

window.submitItem = function(){
    const get = (id) => (document.getElementById(id) || {}).value || '';
    const checked = (id) => !!(document.getElementById(id) || {}).checked;
    const data = {
        itemId:         get('item-id').trim(),
        name:           get('item-name').trim(),
        type:           get('item-type'),
        dal:            get('item-dal'),
        daType:         get('item-da-type'),
        owningSystemId: get('item-owning-system'),
        // Equipment → Zone link (optional). '' = unassigned; existing items unaffected.
        zoneId:         get('item-zone'),
        realizedByCSCI: get('item-csci'),
        realizedByHWCI: get('item-hwci'),
        description:    get('item-desc'),
        traceIds:       _readItemTraceList(),
        // Phase 53.67 — engine flag + position metadata (drives rotor-burst / blade-out PRA modeling).
        isEngine:       checked('item-is-engine'),
        enginePosition: checked('item-is-engine') ? get('item-engine-position') : '',
        engineMount:    checked('item-is-engine') ? get('item-engine-mount')    : '',
        comments:       ''
    };
    if (!data.itemId) return alert('Item ID is required.');
    if (!data.name)   return alert('Display Name is required.');
    const editingId = editStates.item;
    if (editingId != null) {
        const idx = itemsData.findIndex(r => String(r.internalId) === String(editingId));
        if (idx >= 0) itemsData[idx] = Object.assign({ internalId: editingId, history: itemsData[idx].history || [] }, data);
    } else {
        itemsData.push(Object.assign({ internalId: newRowId(), history: [] }, data));
    }
    cancelEdit('item');
    renderItems();
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
};

// Phase 53.67 — toggle the engine-specific fields when isEngine flips.
// [P2 batch 5] L5906-5910 moved verbatim to bindings_modules.js

window.editItem = function(internalId){
    const row = (itemsData || []).find(r => String(r.internalId) === String(internalId));
    if (!row) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = (v == null ? '' : v); };
    _populateItemOwningSystem();
    _populateItemZone(row.zoneId || '');
    set('item-id', row.itemId);
    set('item-name', row.name);
    set('item-type', row.type || 'HW+SW');
    set('item-dal', row.dal || 'C');
    set('item-da-type', row.daType || 'IDAL');
    set('item-owning-system', row.owningSystemId || '');
    set('item-zone', row.zoneId || '');
    set('item-csci', row.realizedByCSCI);
    set('item-hwci', row.realizedByHWCI);
    set('item-desc', row.description);
    // Phase 53.67 — engine flag + fields.
    const isEngEl = document.getElementById('item-is-engine');
    if (isEngEl) isEngEl.checked = !!row.isEngine;
    set('item-engine-position', row.enginePosition || 'left');
    set('item-engine-mount',    row.engineMount    || 'wing-pylon');
    if (typeof onItemIsEngineToggle === 'function') onItemIsEngineToggle();
    _renderItemTraceList(row.traceIds || []);
    editStates.item = internalId;
    setEditMode('item');
    window.scrollTo(0, 0);
};

window.deleteItem = function(internalId){
    const row = (itemsData || []).find(r => String(r.internalId) === String(internalId));
    if (!row) return;
    if (!confirm('Delete item ' + (row.itemId || internalId) + '? Any FTA basic events or FMEA rows that reference this item will lose the link.')) return;
    const idx = itemsData.findIndex(r => String(r.internalId) === String(internalId));
    if (idx >= 0) itemsData.splice(idx, 1);
    renderItems();
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
};

// [P2 batch 4] L10349-10455 moved verbatim to helpers_modules.js

window.submitFMEA = function() {
    const data = _readFmeaForm();
    // Phase 68 — FMEA is always filed under the open System Folder (no aircraft-level FMEA).
    if (!activeSystemId) { return alert('Open a System Folder first — FMEA is filed per system.'); }
    data.scope = 'system';
    data.owningSystemId = activeSystemId;
    if (data.scope === 'system' && !data.owningSystemId) {
        return alert('System-scope FMEAs require an owning System Folder. Pick one or switch the scope to Aircraft.');
    }
    if (_fmeaActiveMode === 'functional') {
        if (!data.fmeaId || !data.funcSubId) return alert('Provide an FMEA ID and link to a sub-function.');
    } else {
        if (!data.fmeaId) return alert('Provide an FMEA ID.');
        if (!data.beId || !data.part) return alert('Select a Basic Event and enter a component name.');
        if (data.rate < 0) return alert('Failure rate (λ) must be ≥ 0.');
        if (data.time < 0) return alert('Exposure time must be ≥ 0.');
    }
    const editingId = editStates.fmea;
    if (editingId != null) {
        const idx = fmeaData.findIndex(r => String(r.internalId) === String(editingId));
        if (idx >= 0) fmeaData[idx] = Object.assign({ internalId: editingId }, data);
    } else {
        fmeaData.push(Object.assign({ internalId: newRowId() }, data));
    }
    // Piece-part rows push aggregated λ (Σ failure-mode rates) onto the linked basic event.
    if (data.fmeaType === 'piece-part') {
        _pushPiecePartFmeaToFta();
    }
    cancelEdit('fmea');
    renderFMEA();
    showToast('FMEA entry saved.', 'success', 2000);
};

window.editFMEA = function(iId) {
    const row = fmeaData.find(r => String(r.internalId) === String(iId));   // 28 Aug 2026 — numeric-id rows vs the kebab's string id
    if (!row) return;
    editStates.fmea = iId;
    setEditMode('fmea');
    _writeFmeaForm(row);
};

// [P2 batch 5] L5993-6002 moved verbatim to bindings_modules.js

// [P2 batch 5] L6004-6083 moved verbatim to bindings_modules.js

// ==========================================
// D3 FAULT TREE MULTI-PAGE ENGINE
// ==========================================
// [P2 batch 6] L4757-4793 moved verbatim to misc_fn_modules.js
// ── Fuzzy node matching (shared by both FTA searches) ───────────────────────────────
// Deterministic, dependency-free, fully offline (no network/LLM — preserves the air-gap).
// Relevance tiers, high → low:  exact substring (1.0) > every query word present, any order
// (0.9) > trigram-similarity for typos / reworded text (≤0.85). Below the threshold = no match.
// [P2 batch 5] L6129-6129 moved verbatim to bindings_modules.js
// [P2 batch 2] L13372-13763 moved verbatim to fta_view_modules.js
window._promoteStandaloneTree = _promoteStandaloneTree;

// [P2 batch 4] L10638-10722 moved verbatim to helpers_modules.js
window.syncFtaConfigFromActivePage = syncFtaConfigFromActivePage;

// [P2 batch 4] L10725-10786 moved verbatim to helpers_modules.js

// ── correlation colouring (basic events): independent / repeated / CCF ──────
// Recomputed once per render in updateD3(); read by getNodeColors().
// [P2 batch 5] L6140-6140 moved verbatim to bindings_modules.js
// Conditional canvas legend — shown only when the page actually contains a repeated
// event and/or a CCF-group member. Docks at the bottom-left of the FTA canvas.
// [P2 batch 4] L10793-10896 moved verbatim to helpers_modules.js
window._ftaCcfPopover = _ftaCcfPopover;

// ── Multi-select → group as common cause (#6) ───────────────────────────────
// Shift-click basic events to build a selection; a floating bar then groups them into one CCF
// group (shared ccfGroup name + default β=0.1, tune later via the pill popover).
// [P2 batch 5] L6149-6149 moved verbatim to bindings_modules.js
// [P2 batch 4] L10903-10948 moved verbatim to helpers_modules.js
window._ftaCcfClearMulti = _ftaCcfClearMulti;

// ── CCF detection → one-click suggestions (#7) ──────────────────────────────
// Scan for DISTINCT basic events (different logicalId) that share a description but aren't yet in
// one CCF group — likely common-cause candidates (identical parts, same vendor lot). A canvas pill
// surfaces the count; a modal groups any candidate with one click.
// [P2 batch 4] L10955-11024 moved verbatim to helpers_modules.js
window._ftaCcfSuggestModal = _ftaCcfSuggestModal;

// [P2 batch 4] L11027-11097 moved verbatim to helpers_modules.js

// Phase 49 — dynamic description-box sizing.
//   • The foreignObject for each node holds a desc textarea + ID input + metrics input,
//     stacked vertically with `justify-content: flex-end`.
//   • Description height grows with content (field-sizing: content + max-height).
//   • This helper measures the rendered desc height for a node and resizes that node's
//     foreignObject so its BOTTOM stays anchored at y=-30 (just above the shape) while
//     the TOP floats upward to accommodate the longer description. The new top offset is
//     stored on `datum.data.descBoxHeight` so link drawing uses the right attach point.
// Phase 53.32 — Fixed-size description box with shrink-to-fit font.
//
// Every prior approach (scrollHeight, field-sizing:content, hidden mirror div, char-count
// height estimation) depended on browser layout that was inconsistent inside <foreignObject>,
// so the box clipped text. New strategy: pin the box at a uniform generous height (DESC_H px)
// and shrink the FONT SIZE for longer descriptions so the text always fits. Uniform geometry
// also means d3.tree's link drawing doesn't need to chase per-node heights anymore.
//
// Capacity by tier (at content width ~146 px, line-height 1.3, box 100 px tall):
//   12 px → ~22 chars/line × 6 lines = ~132 chars
//   11 px → ~24 chars/line × 6 lines = ~144 chars
//   10 px → ~26 chars/line × 7 lines = ~182 chars
//    9 px → ~29 chars/line × 7 lines = ~203 chars
//    8 px → ~33 chars/line × 8 lines = ~264 chars  (hard floor for readability)
// Phase 53.40 — single source of truth for box height; d3.tree nodeSize derives from this so
// the gates / connector lines move together when the box height changes.
// [P2 batch 5] L6186-6186 moved verbatim to bindings_modules.js
// foreignObject total: desc + 3 gap + 20 ID + 3 gap + 18 metric = boxHeight + 44.
// Bottom of fO is anchored at y = -30 above the gate (autoSizeNodeDescription).
// So fO top sits at y = -(30 + boxHeight + 44). Vertical tree spacing must clear that distance
// plus the gate shape (~40 tall) plus a buffer to keep the connector line visually clean.
// [P2 batch 6] L4860-4892 moved verbatim to misc_fn_modules.js
window.autoSizeNodeDescription = autoSizeNodeDescription;

// Phase 49 — redraw the link from a node's parent into this node, using the per-node
// descBoxHeight (falling back to 90 — the legacy fixed value — if missing).
// [P2 batch 6] L4897-4906 moved verbatim to misc_fn_modules.js
window.redrawLinkToNode = redrawLinkToNode;

// Phase 47 — "Reconfigure Layout" floating button. Clears every xOffset / yOffset on
// every node in the active tree so d3.tree()'s clean computed positions take effect,
// then re-fits the canvas. Lets the user untangle a hand-arranged tree back into the
// auto-laid-out look with one click.
// [P2 batch 6] L4913-4933 moved verbatim to misc_fn_modules.js
window.reconfigureActiveTreeLayout = reconfigureActiveTreeLayout;

// Phase 33 — post-layout overlap avoidance. d3.tree() with nodeSize handles same-parent
// siblings via the separation function, but cousins (different parents at the same depth)
// can still land too close once we tighten the nodeSize. Description boxes are 160 wide
// centered on the node, plus a DAL badge that extends ~30 px to the right. So we treat each
// node's effective horizontal footprint as ~190 px (95 px on either side of its x).
//
// Strategy: walk every depth row left-to-right. If a node's left edge (x − 95) is to the
// left of the previous node's right edge (prev.x + 95), shift this node — and every node
// in its subtree — to the right by exactly the overlap distance. Subtree shift keeps
// children moving with their parent so the visual tree stays consistent.
// [P2 batch 2] L14348-14879 moved verbatim to fta_view_modules.js
window.openNodePropertiesModal = openNodePropertiesModal;

// Phase 57 — resizable node drawer. Width is user-preference, persisted across sessions.
// [P2 batch 5] L6287-6287 moved verbatim to bindings_modules.js
// [P2 batch 5] L6288-6288 moved verbatim to bindings_modules.js
// [P2 batch 2] L14885-15155 moved verbatim to fta_view_modules.js

// ---------- Phase 7.3 / 7.4 — Library reliability-prediction parameters ----------
// Filter state (kept in module scope to avoid losing on tab switch).
// [P2 batch 5] L6293-6293 moved verbatim to bindings_modules.js

// Default project-config fields covering the new prediction parameters.
// Phase 53.58 — migrate any old project that was using a stripped licensed standard
// back to MIL-HDBK-217F so the dropdowns don't end up empty.
// Phase 53.59 — licensed standards are valid again, but only as Pro · BYOL passthroughs.
// [P2 batch 4] L11236-11375 moved verbatim to helpers_modules.js
// One-click: turn a shared component-library entry into a β-factor CCF group.
// The shared-library heuristic already flags this as a common-cause risk; this
// closes the loop by letting the user create the group directly.
// [P2 batch 5] L6303-6315 moved verbatim to bindings_modules.js

// [P2 batch 4] L11393-11454 moved verbatim to helpers_modules.js

// --- Handlers ---
// Phase 53.59 — licensed standards behind the Pro gate. Selecting one when not Pro
// opens the upgrade modal; selecting one as a Pro user prompts BYOL CSV import.
// [P2 batch 5] L6322-6328 moved verbatim to bindings_modules.js

// [P2 batch 4] L11467-11521 moved verbatim to helpers_modules.js

// ============================================================================
// Phase 55.0.3 — Supabase Auth bridge
// ============================================================================
// Wires real magic-link authentication into the existing signup modal so
// signups create real auth.users rows in Supabase, which fires the
// on_auth_user_created trigger and provisions a Personal workspace plus the
// public.users mirror row. The localStorage-based identity state we already
// keep (signup email, name, org, license tier) becomes a UI/UX cache layered
// on top of the actual Supabase session.
//
// Behavior:
//   - On boot we load the Supabase JS SDK from CDN and create a client using
//     the project URL + publishable key.
//   - The signup modal's submitSignup() calls supabase.auth.signInWithOtp(...)
//     to send a magic link to the user's email. The modal flips to a "check
//     your email" state instead of closing.
//   - When the user clicks the link in their email they land back at this
//     page with auth tokens in the URL hash. supabase-js automatically
//     processes the hash, builds a session, and fires onAuthStateChange.
//     Our listener then updates the local signup record + license tier
//     and refreshes the header chip.
//   - electra.aero → forced to Pro+ tier (also enforced server-side by the
//     handle_new_user trigger we shipped in Phase 55.0.1).
//   - .edu / .ac.<cc> → EDU tier.
//   - Other domains → Pro+ default for now (paid tier picker comes back
//     when we wire Stripe Checkout in Phase 55.0.5).
//
// Graceful degradation: if the Supabase SDK fails to load (CDN blocked,
// offline, etc.) the existing localStorage-only signup flow still runs.
// That way the Electra demo never depends on backend reachability.

// On-prem / self-hosted override. The desktop preload (or a web on-prem bootstrap script) may set
// window.__SLAB_SUPABASE_URL__ / __SLAB_SUPABASE_KEY__ (or window.SafetyLab.SUPABASE_URL/KEY) BEFORE
// this file runs, to point auth + realtime co-authoring + the project_crdt store at a customer's own
// Supabase (e.g. Electra's VPC / intranet). Defaults to the hosted multi-tenant project, so the web
// SaaS build is unchanged. Mirrors the AI_PROXY_BASE_URL override pattern used for AI inference.
// 6 Sep 2026 — the ONE config surface (slab_config.js) is the source of truth; it
// loads first and has already refused the boot if a customer install pointed here.
// The direct-window fallback stays only so an out-of-order load can't crash.
const _slabBackendCfg = (typeof window !== 'undefined') ? window : {};
const _slabCfg = (typeof window !== 'undefined' && window.SLConfig) ? window.SLConfig : null;
const SUPABASE_PROJECT_URL = String(
    (_slabCfg && _slabCfg.supabaseUrl) ||
    _slabBackendCfg.__SLAB_SUPABASE_URL__ ||
    (_slabBackendCfg.SafetyLab && _slabBackendCfg.SafetyLab.SUPABASE_URL) ||
    'https://fhrqkhdrwbfnizkepkch.supabase.co'
).replace(/\/+$/, '');
const SUPABASE_PUBLISHABLE_KEY = String(
    (_slabCfg && _slabCfg.supabaseKey) ||
    _slabBackendCfg.__SLAB_SUPABASE_KEY__ ||
    (_slabBackendCfg.SafetyLab && _slabBackendCfg.SafetyLab.SUPABASE_KEY) ||
    'sb_publishable_ExwM8wVKnQ3chHQKPyRFOw_WMtLGfiQ'
);
try { if (SUPABASE_PROJECT_URL !== 'https://fhrqkhdrwbfnizkepkch.supabase.co') console.info('[Safety Lab Aero] Collaboration backend →', SUPABASE_PROJECT_URL); } catch (_) {}

// [P2 batch 5] L6381-6381 moved verbatim to bindings_modules.js
// [P2 batch 5] L6382-6382 moved verbatim to bindings_modules.js
// [P2 batch 5] L6383-6383 moved verbatim to bindings_modules.js
// Phase 57 — gate the "Signed in as…" toast so it only fires on a genuine interactive sign-in,
// not on every page-load session restore (which previously stacked multiple toasts on refresh).
// [P2 batch 5] L6386-6386 moved verbatim to bindings_modules.js
// [P2 batch 5] L6387-6387 moved verbatim to bindings_modules.js

// [P2 batch 4] L11580-11627 moved verbatim to helpers_modules.js
window._initSupabaseClient = _initSupabaseClient;
// [P2 batch 5] L6391-6391 moved verbatim to bindings_modules.js
// [P2 batch 5] L6392-6392 moved verbatim to bindings_modules.js
// [P2 batch 5] L6393-6393 moved verbatim to bindings_modules.js

// === REALTIME-PRESENCE-START (#27 part 1) ===============================
// Live presence — who else is online in this workspace right now — on the existing
// Supabase Realtime client. LIVE by default; NEVER runs for ITAR-controlled projects
// (guarded in startRealtimePresence) and air-gapped deployments can't reach Supabase anyway.
// Read-only (no data mutation), fully fault-tolerant. Kill-switch: window.SafetyLabAI.realtime=false,
// ?realtime=0, or localStorage SLA_REALTIME='0'. Live comment broadcast = part 2.
// [P2 batch 5] L6401-6401 moved verbatim to bindings_modules.js
// Stable per-session token — makes comment ids globally unique across live clients
// and lets us ignore our own broadcast echoes. (#27 part 2)
var _rtClientToken = (function () { try { return (window.crypto && crypto.randomUUID ? crypto.randomUUID() : ('s' + Math.random().toString(36).slice(2))).slice(0, 8); } catch (_) { return 's' + Date.now().toString(36).slice(-6); } })();
// [P2 batch 4] L11643-11757 moved verbatim to helpers_modules.js
window._rtUpdatePresenceProject = _rtUpdatePresenceProject;
// --- #27 part 2: live comment broadcast --------------------------------------
// Pure reducer: merge one incoming comment op into a list. No DOM, no globals. (Testable.)
// Ops: {op:'delete',commentId} cascades; {c:<comment>} upserts by commentId. Self-tagged
// messages (same tok) are ignored so a client never re-applies its own edit.
// [P2 batch 4] L11763-11802 moved verbatim to helpers_modules.js
try { window.SafetyLabRealtime = { start: startRealtimePresence, stop: stopRealtimePresence, enabled: _rtEnabled, _users: _rtPresenceUsers, _merge: _rtMergeComment, _peers: _rtProjectPeers, updateProject: _rtUpdatePresenceProject }; } catch (_) {}
try { window.addEventListener('load', function () { setTimeout(function () { try { if (_rtEnabled()) startRealtimePresence(); } catch (_) {} }, 2500); }); } catch (_) {}
// === REALTIME-PRESENCE-END ==============================================

// Handler called whenever supabase tells us the user is signed in (either fresh
// magic-link click or persisted session from a previous visit). Mirrors the
// session's email/user_id into our localStorage so the existing tier-resolution
// logic keeps working unchanged.
// [P2 batch 4] L11811-11902 moved verbatim to helpers_modules.js
window._isDesktopAuth = _isDesktopAuth;

// Unified sign-in: web AND desktop use the same step — email → 6-digit code (paste-link fallback).
// One flow, one set of copy, everywhere. (On web the emailed link is also clickable as a shortcut.)
// [P2 batch 6] L5070-5092 moved verbatim to misc_fn_modules.js
window.sendMagicLink = sendMagicLink;

// Parse what the user gave the desktop verify field: a 6-digit OTP code, a pasted Supabase
// sign-in LINK (we pull token_hash + type straight out of its query/hash), or a bare token
// hash. Returns {kind:'code'|'hash', token, type}. This is what lets desktop work whether the
// email shows a code ({{ .Token }}) OR only a magic link ({{ .ConfirmationURL }}, the default).
// [P2 batch 6] L5099-5118 moved verbatim to misc_fn_modules.js
window._parseAuthInput = _parseAuthInput;

// Public: finish a DESKTOP sign-in. Accepts a 6-digit code OR a pasted sign-in link from the
// email. On success Supabase fires onAuthStateChange('SIGNED_IN') → _onSupabaseSignedIn, which
// brings up the workspace chip, realtime presence, live comments and cloud projects.
// [P2 batch 6] L5124-5139 moved verbatim to misc_fn_modules.js
window.verifyEmailOtp = verifyEmailOtp;

// Public: sign out the current session.
// [P2 batch 6] L5143-5152 moved verbatim to misc_fn_modules.js
window.supabaseSignOut = supabaseSignOut;

// Boot Supabase as soon as the SDK is on the page. Idempotent — the click on
// the sign-in chip will also trigger init if it hasn't run yet.
document.addEventListener('DOMContentLoaded', () => {
    // Tiny defer so the supabase-js CDN script has a moment to register on window.
    setTimeout(() => { _initSupabaseClient(); }, 50);
    // 31 Aug 2026 — an invitee arrives at /app/?invite=<token>. Read and STRIP the
    // token immediately (it is a credential; it must not linger in the address bar,
    // a screenshot or history), park it in sessionStorage, and redeem as soon as
    // there is a session. Deliberately after client init, and _onSupabaseSignedIn
    // calls _redeemPendingInvite() again for the sign-in-then-accept path.
    setTimeout(() => { try { _consumeInviteFromUrl(); } catch (_) {} }, 400);
});

// ===========================================================================
// Phase 53.74 — In-app signup modal
// ===========================================================================
// Single entry point for new users. Email-domain detection drives tier assignment:
//   @electra.aero       → comped Pro+ (no charge, no trial degradation)
//   .edu / .ac.<cc>     → EDU free (AutoReq + V&V mirror trees stripped)
//   anything else       → user picks 10-day trial / Pro / Pro+
// Auto-opens on first launch when no signup email is on record. The "Skip for now"
// button lets beta testers keep using the build without going through signup.
// [P2 batch 4] L12008-12068 moved verbatim to helpers_modules.js
window.connectWorkspace = connectWorkspace;

// Throttle auto-send so relaunching several times doesn't fire off a string of code emails.
// [P2 batch 6] L5175-5198 moved verbatim to misc_fn_modules.js
// [P2 batch 6] L5200-5207 moved verbatim to misc_fn_modules.js
window.openSignupModal  = openSignupModal;
window.closeSignupModal = closeSignupModal;

// Live email-domain detection — updates the banner + shows/hides the tier picker.
// [P2 batch 4] L12109-12150 moved verbatim to helpers_modules.js
window.onSignupEmailChange = onSignupEmailChange;

var _signupAwaitingCode = null;   // desktop: the email we've emailed a 6-digit code to (awaiting verifyOtp)
// [P2 batch 4] L12154-12238 moved verbatim to helpers_modules.js
window.submitSignup = submitSignup;

// Flip the modal contents to "check your email" mode after a successful
// magic-link send. The user finishes signup by clicking the link in their
// email; when they return, onAuthStateChange closes the modal.
// [P2 batch 4] L12244-12305 moved verbatim to helpers_modules.js
window._signupResendCode = _signupResendCode;

// Go back to the email step (the gate email was wrong, or signing in as someone else).
// [P2 batch 6] L5226-5239 moved verbatim to misc_fn_modules.js
window._signupUseDifferentEmail = _signupUseDifferentEmail;

// Desktop OTP: verify the entered 6-digit code. On success onAuthStateChange('SIGNED_IN')
// closes the modal and brings up presence / comments / cloud projects.
// [P2 batch 4] L12327-12389 moved verbatim to helpers_modules.js
window.refreshSigninChip = refreshSigninChip;

// ---- Account / Profile panel — view + edit name & organization -------------
// Opened from the header sign-in chip. Shows name / email / org / plan, lets the
// user edit name + organization (email is account identity, read-only), and saves
// to Supabase user_metadata (full_name, org) + the app's local signup record.
// [P2 batch 4] L12396-12468 moved verbatim to helpers_modules.js
window.openAccountPanel = openAccountPanel;

// #268 — self-serve account erasure: dry-run preview → type-DELETE confirm → erase
// (content purge + PII anonymize, server-side) → certificate of destruction → sign out.
// [P2 batch 4] L12473-12535 moved verbatim to helpers_modules.js
window._openEraseAccountModal = _openEraseAccountModal;

// ============================================================================
// Workspace governance — per-area ownership, locking, and an attributed change
// log. "Areas" = the aircraft-level scope + each System Folder. State rides
// inside already-persisted objects (systemsData[i].owner/.lock and
// projectConfig.acWorkspace/.changeLog), so it saves/loads with the project
// (incl. cloud save). NOW-version: cross-user visibility is on save/load — there
// is no realtime layer yet, and enforcement is client-side (advisory). Live +
// server-authoritative locking is the Stage-1 follow-on.
// ============================================================================
// [P2 batch 6] L5268-5290 moved verbatim to misc_fn_modules.js
window.slWorkspaceEditable = _wsEditable;
// [P2 batch 6] L5292-5325 moved verbatim to misc_fn_modules.js
// [P2 batch 5] L6681-6681 moved verbatim to bindings_modules.js
// [P2 batch 4] L12606-12745 moved verbatim to helpers_modules.js
window.openWorkspacesPanel = openWorkspacesPanel;

// Inline lock badges — a clickable lock pill in every analysis view's header, wired to the
// same area locks as the Workspaces panel. Aircraft analyses + CCAs lock the aircraft level;
// the system workspace locks the active system. Lock/unlock still goes through the password gate.
// [P2 batch 5] L6688-6691 moved verbatim to bindings_modules.js
// [P2 batch 6] L5334-5361 moved verbatim to misc_fn_modules.js
window._wsRenderInlineLocks = _wsRenderInlineLocks;
// [P2 batch 6] L5363-5377 moved verbatim to misc_fn_modules.js
window._wsToggleInlineLock = _wsToggleInlineLock;

// Auto-open the signup modal on first launch when no signup record exists *and* the user
// hasn't previously dismissed it. Wired into the existing DOMContentLoaded boot path
// further down; this is the helper it calls.
// [P2 batch 6] L5384-5410 moved verbatim to misc_fn_modules.js
window.maybeAutoOpenSignup = maybeAutoOpenSignup;


// Boot wiring: refresh the chip + auto-open if first-launch and no signup record.
document.addEventListener('DOMContentLoaded', () => {
    try { refreshSigninChip(); } catch(_) {}
    try { maybeAutoOpenSignup(); } catch(_) {}
    try { refreshWorkspaceChip(); } catch(_) {}
});

// ============================================================================
// Phase 55.0.4 — Workspace switcher chip
// ============================================================================
// Displays the user's active workspace next to the sign-in chip. The active
// workspace determines where cloud-saved projects land (Phase 55.0.5). On
// first sign-in we pre-select the auto-created "Personal" workspace from the
// handle_new_user trigger; the user can switch to another workspace they
// belong to, or create a new one.
//
// State:
//   _workspaces       — array of workspace rows the current user is a member of
//   _activeWorkspaceId — uuid of the workspace currently selected
//   The active workspace id persists in localStorage so it survives reloads.

let _workspaces = [];
let _activeWorkspaceId = null;
// [P2 batch 5] L6806-6806 moved verbatim to bindings_modules.js

// [P2 batch 6] L5450-5465 moved verbatim to misc_fn_modules.js
window.getActiveWorkspaceId = getActiveWorkspaceId;
window.getActiveWorkspace = getActiveWorkspace;

// Fetch the workspaces the signed-in user belongs to. Uses the Supabase client
// directly with RLS enforcing access — we only see rows where the user is a
// member via workspace_members.
// [P2 batch 6] L5472-5496 moved verbatim to misc_fn_modules.js
window.fetchWorkspaces = fetchWorkspaces;

// Refresh the chip in the header. Shows/hides based on signed-in state.
// Also (re-)loads the workspace list when called after sign-in.
// [P2 batch 6] L5501-5523 moved verbatim to misc_fn_modules.js
window.refreshWorkspaceChip = refreshWorkspaceChip;

// [P2 batch 6] L5526-5561 moved verbatim to misc_fn_modules.js
window.toggleWorkspaceMenu = toggleWorkspaceMenu;

// Close the menu on outside click.
document.addEventListener('click', (e) => {
    const wrap = document.getElementById('workspace-chip-wrap');
    const menu = document.getElementById('workspace-menu');
    if (!wrap || !menu) return;
    if (!menu.classList.contains('open')) return;
    if (!wrap.contains(e.target)) {
        menu.classList.remove('open');
        menu.setAttribute('aria-hidden', 'true');
        const chip = document.getElementById('workspace-chip');
        if (chip) chip.setAttribute('aria-expanded', 'false');
    }
});

// [P2 batch 6] L5578-5586 moved verbatim to misc_fn_modules.js
window.switchWorkspace = switchWorkspace;

// [P2 batch 4] L13010-13059 moved verbatim to helpers_modules.js
window.promptCreateWorkspace = promptCreateWorkspace;

// Workspace chip refresh is invoked directly from _onSupabaseSignedIn /
// _onSupabaseSignedOut — no extra wiring needed here.

// ============================================================================
// Phase 55.0.5 — Cloud save/load + Workspace settings
// ============================================================================
// Persists projects to Supabase scoped by active workspace. RLS enforces
// per-workspace access. The current cloud-project id is tracked so subsequent
// saves overwrite the same row rather than creating duplicates.

// [P2 batch 5] L6960-6960 moved verbatim to bindings_modules.js
// [P2 batch 6] L5603-5603 moved verbatim to misc_fn_modules.js
window.getActiveCloudProjectId = getActiveCloudProjectId;

// Optimistic-concurrency token for the current cloud document (project_documents.version).
// Captured on load, bumped on save; used to detect a save by someone else.
// [P2 batch 5] L6966-6966 moved verbatim to bindings_modules.js

// Deterministic JSON (sorted keys) -> SHA-256 hex. Hashes a version baseline and
// powers "no change since last version" de-duping. Must stay stable across saves.
// [P2 batch 4] L13082-13151 moved verbatim to helpers_modules.js
window.createProjectRevision = createProjectRevision;

// Snapshot every piece of the in-memory project state into a JSON blob.
// Mirrors what saveProject() (the local-file save path) collects.
// [P2 batch 4] L13156-13284 moved verbatim to helpers_modules.js
try { if (typeof window !== 'undefined') { window.__crdtCapture = __crdtCapture; window.__crdtApply = __crdtApply; window.__crdtFingerprint = __crdtFingerprint; } } catch (_) {}

// Save the current project to the active workspace's cloud storage.
// [P2 batch 4] L13288-13361 moved verbatim to helpers_modules.js
window.saveProjectToCloud = saveProjectToCloud;

// Open the cloud-projects browser modal.
// [P2 batch 4] L13365-13415 moved verbatim to helpers_modules.js
window.openProjectFromCloud = openProjectFromCloud;

// [P2 batch 6] L5628-5633 moved verbatim to misc_fn_modules.js
window.closeCloudProjectsModal = closeCloudProjectsModal;

// [P2 batch 6] L5636-5659 moved verbatim to misc_fn_modules.js
window._loadCloudProject = _loadCloudProject;

// ----------------------------------------------------------------------------
// Version history + revisions panel (Phase A — versioning UI)
// ----------------------------------------------------------------------------
// [P2 batch 6] L5665-5695 moved verbatim to misc_fn_modules.js
window.openVersionHistory = openVersionHistory;

// [P2 batch 6] L5698-5700 moved verbatim to misc_fn_modules.js
window.closeVersionHistory = closeVersionHistory;

// [P2 batch 4] L13493-13556 moved verbatim to helpers_modules.js
window._renderVersionHistory = _renderVersionHistory;

// [P2 batch 6] L5706-5723 moved verbatim to misc_fn_modules.js
window.restoreSavedVersion = restoreSavedVersion;

// [P2 batch 6] L5726-5743 moved verbatim to misc_fn_modules.js
window.restoreRevision = restoreRevision;

// [P2 batch 6] L5746-5756 moved verbatim to misc_fn_modules.js
window.promptCreateRevision = promptCreateRevision;

// ----------------------------------------------------------------------------
// Reviews & approvals workflow (#12)
// ----------------------------------------------------------------------------
// [P2 batch 4] L13615-13655 moved verbatim to helpers_modules.js
window.openReviewsPanel = openReviewsPanel;

// [P2 batch 6] L5765-5765 moved verbatim to misc_fn_modules.js
window.closeReviewsPanel = closeReviewsPanel;

// [P2 batch 6] L5768-5798 moved verbatim to misc_fn_modules.js
window._renderReviewsList = _renderReviewsList;

// [P2 batch 6] L5801-5836 moved verbatim to misc_fn_modules.js
window._rvShowRequestForm = _rvShowRequestForm;

// [P2 batch 6] L5839-5869 moved verbatim to misc_fn_modules.js
window.submitReviewRequest = submitReviewRequest;

// [P2 batch 4] L13765-13858 moved verbatim to helpers_modules.js
window.openReviewDetail = openReviewDetail;

// [P2 batch 6] L5875-5890 moved verbatim to misc_fn_modules.js
window.recordMyReviewDecision = recordMyReviewDecision;

// [P2 batch 6] L5893-5905 moved verbatim to misc_fn_modules.js
window.setReviewStatus = setReviewStatus;

// [P2 batch 6] L5908-5924 moved verbatim to misc_fn_modules.js
window.addReviewComment = addReviewComment;

// ----------------------------------------------------------------------------
// Cryptographic sign-off (#14) — re-authenticated, baseline-bound signatures
// ----------------------------------------------------------------------------
// [P2 batch 6] L5930-5965 moved verbatim to misc_fn_modules.js
window.openSignoffModal = openSignoffModal;

// [P2 batch 6] L5968-5968 moved verbatim to misc_fn_modules.js
window.closeSignoffModal = closeSignoffModal;

// [P2 batch 6] L5971-6008 moved verbatim to misc_fn_modules.js
window.submitSignoff = submitSignoff;

// [P2 batch 6] L6011-6047 moved verbatim to misc_fn_modules.js
window.openSignatureCertificate = openSignatureCertificate;

// Verify the append-only sign-off ledger end-to-end (server recomputes the chain).
// [P2 batch 6] L6051-6067 moved verbatim to misc_fn_modules.js
window.verifySignoffLedger = verifySignoffLedger;

// ----------------------------------------------------------------------------
// Workspace settings modal
// ----------------------------------------------------------------------------
// [P2 batch 6] L6073-6098 moved verbatim to misc_fn_modules.js
window.openWorkspaceSettings = openWorkspaceSettings;

// [P2 batch 6] L6101-6106 moved verbatim to misc_fn_modules.js
window.closeWorkspaceSettings = closeWorkspaceSettings;

// [P2 batch 4] L14095-14169 moved verbatim to helpers_modules.js
window.inviteWorkspaceMember = inviteWorkspaceMember;
// 31 Aug 2026 — the rest of the invitation feature (see helpers_modules.js).
window.revokeInvitation = revokeInvitation;
// H-7 (31 Aug 2026) — project archive/restore. Exported explicitly like every
// other inline-onclick target in this file: helpers_modules is a classic script
// so the declarations are already global, but the export list is what the
// durability suite censuses, and a target that is only implicitly global is one
// refactor away from being unreachable from the markup.
window.archiveCloudProject   = archiveCloudProject;
window.restoreCloudProject   = restoreCloudProject;
window.toggleArchivedProjects = toggleArchivedProjects;
window._renderArchivedProjects = _renderArchivedProjects;
window._canAdminActiveWorkspace = _canAdminActiveWorkspace;
window.wsAddInviteRow = wsAddInviteRow;
window.wsResetInviteRows = wsResetInviteRows;
window._renderPendingInvitations = _renderPendingInvitations;
window._consumeInviteFromUrl = _consumeInviteFromUrl;
window._redeemPendingInvite = _redeemPendingInvite;

// Change an existing member's role. Admin-only in the UI; also enforced by RLS
// (ws_members_admin_update). Owner role + self are not editable from here.
// [P2 batch 6] L6114-6134 moved verbatim to misc_fn_modules.js
window.updateWorkspaceMemberRole = updateWorkspaceMemberRole;

// Remove a member from the workspace. Admin-only in the UI; also enforced by RLS
// (ws_members_admin_delete). Confirms first; owner + self are not removable here.
// [P2 batch 6] L6139-6160 moved verbatim to misc_fn_modules.js
window.removeWorkspaceMember = removeWorkspaceMember;

function onLibParamChange() {
    const envEl = document.getElementById('lib-env');
    const qualEl = document.getElementById('lib-quality');
    const stressEl = document.getElementById('lib-stress-toggle');
    const tjEl = document.getElementById('lib-tj');
    const eaEl = document.getElementById('lib-ea');
    if (envEl)   projectConfig.libraryEnv = envEl.value;
    if (qualEl)  projectConfig.libraryQuality = qualEl.value;
    if (stressEl) projectConfig.useStressPrediction = !!stressEl.checked;
    if (tjEl) {
        const v = parseFloat(tjEl.value);
        if (!isNaN(v)) projectConfig.operatingTempC = v;
    }
    if (eaEl) {
        const v = parseFloat(eaEl.value);
        if (!isNaN(v) && v > 0) projectConfig.activationEnergyEv = v;
    }
    refreshLibraryDependentNodes();
    _refreshLibPiSummary();
    renderLibraryTable();
}
function onLibFilterChange() {
    _libFilterState.search = (document.getElementById('lib-search') || {}).value || '';
    _libFilterState.group = (document.getElementById('lib-group-filter') || {}).value || '';
    _libFilterState.source = (document.getElementById('lib-source-filter') || {}).value || '';
    _libFilterState.category = (document.getElementById('lib-category-filter') || {}).value || '';
    renderLibraryTable();
}
function resetLibFilters() {
    _libFilterState.search = ''; _libFilterState.group = ''; _libFilterState.source = ''; _libFilterState.category = '';
    const ids = ['lib-search', 'lib-group-filter', 'lib-source-filter', 'lib-category-filter'];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    renderLibraryTable();
}

function onLibraryLambdaChange(key, raw) {
    const v = parseFloat(raw); if (isNaN(v) || v < 0) return;
    if (isBuiltinLibraryEntry(key)) {
        // Create or update an override.
        projectConfig.customLibrary[key] = { ...COMPONENT_LIBRARY[key], lambda: v };
    } else {
        if (projectConfig.customLibrary[key]) projectConfig.customLibrary[key].lambda = v;
    }
    refreshLibraryDependentNodes();
    renderLibraryTable();
}
function addCustomLibraryEntry() {
    const key = (document.getElementById('lib-new-key').value || '').trim();
    const name = (document.getElementById('lib-new-name').value || '').trim();
    const group = (document.getElementById('lib-new-group').value || 'Custom').trim();
    const lambda = parseFloat(document.getElementById('lib-new-lambda').value);
    if (!key || !name) return alert('Provide both a key and a name.');
    if (getActiveLibrary()[key]) return alert('That key already exists. Pick a different one.');
    if (isNaN(lambda) || lambda < 0) return alert('Provide a non-negative λ value.');
    // Phase 56.x (#4) — optional repair model carried on the library entry; nodes inherit it.
    const entry = { name, lambda, source: 'custom', group };
    const repairModel = ((document.getElementById('lib-new-repair') || {}).value) || '';
    if (repairModel && repairModel !== 'unmaintained') {
        entry.repairModel = repairModel;
        const mu  = parseFloat((document.getElementById('lib-new-mu')  || {}).value);
        const tau = parseFloat((document.getElementById('lib-new-tau') || {}).value);
        if (repairModel === 'continuous' && !isNaN(mu)  && mu  > 0) entry.mu  = mu;
        if (repairModel === 'periodic'   && !isNaN(tau) && tau > 0) entry.tau = tau;
    }
    projectConfig.customLibrary[key] = entry;
    document.getElementById('lib-new-key').value = '';
    document.getElementById('lib-new-name').value = '';
    document.getElementById('lib-new-group').value = 'Custom';
    document.getElementById('lib-new-lambda').value = '';
    ['lib-new-repair','lib-new-mu','lib-new-tau'].forEach(id => { const el = document.getElementById(id); if (el) el.value = (id === 'lib-new-repair' ? '' : ''); });
    renderLibraryTable();
}
function deleteLibraryEntry(key) {
    if (!confirm(`Delete custom entry "${key}"? Nodes using it will fall back to λ = 0.`)) return;
    delete projectConfig.customLibrary[key];
    refreshLibraryDependentNodes();
    renderLibraryTable();
}
function revertLibraryEntry(key) {
    delete projectConfig.customLibrary[key];
    refreshLibraryDependentNodes();
    renderLibraryTable();
}
// Import the component library from CSV. Accepts the same columns the exporter writes
// (Key, Name, Group, Lambda, Source). Built-in keys become overrides; novel keys become customs.
function importComponentLibraryCSV(text) {
    const arr = csvToArray(text);
    if (arr.length < 2) throw new Error('Library CSV is empty or missing a header row.');
    const headers = arr[0].map(h => h.trim().toUpperCase());
    const col = (n) => headers.indexOf(n.toUpperCase());
    const iKey = col('Key'), iName = col('Name'), iGroup = col('Group'),
          iLambda = col('Lambda'), iSource = col('Source');
    if (iKey < 0 || iName < 0 || iLambda < 0) throw new Error('Library CSV must include Key, Name, and Lambda columns.');
    let added = 0, overridden = 0;
    arr.slice(1).forEach(r => {
        const key = (r[iKey] || '').trim();
        if (!key) return;
        const lambda = parseFloat(r[iLambda]); if (isNaN(lambda) || lambda < 0) return;
        const entry = {
            name:   r[iName] || key,
            lambda: lambda,
            source: iSource >= 0 ? (r[iSource] || 'imported') : 'imported',
            group:  iGroup  >= 0 ? (r[iGroup]  || 'Custom')   : 'Custom'
        };
        if (isBuiltinLibraryEntry(key)) overridden++; else added++;
        projectConfig.customLibrary[key] = entry;
    });
    refreshLibraryDependentNodes();
    renderLibraryTable();
    alert(`Library import complete: ${added} new entry/entries, ${overridden} override(s).`);
}
// Populate the (config-panel) component library dropdown once. Idempotent.
function populateComponentLibrary() {
    const sel = document.getElementById('config-input-library');
    if (!sel || sel.options.length > 1) return;
    sel.innerHTML = componentLibraryOptionsHtml();
}

// Resolve the phases attached to the FTA's currently-linked hazard. Used by the per-phase λ editor.
function _phasesForLinkedHazard() {
    if (!ftaConfig.linkedFhaId) return [];
    const isAC = ftaConfig.linkedFhaId.startsWith('AC_');
    const realId = ftaConfig.linkedFhaId.replace('AC_', '').replace('SYS_', '');
    const fha = isAC ? acFhaData.find(x => String(x.internalId) === String(realId))
                     : getAllSysFha().find(x => String(x.internalId) === String(realId));
    if (!fha || !fha.phases) return [];
    return String(fha.phases).split(',').map(s => s.trim()).filter(Boolean);   // 28 Aug 2026 — array-tolerant (String([..]) comma-joins); an unhealed AI row must not throw inside the node-click path
}

// Render the per-phase λ editor for the currently selected basic/undeveloped event.
function renderPhaseLambdaEditor(dataNode) {
    const container = document.getElementById('config-phase-lambda-container');
    const grid      = document.getElementById('config-phase-lambda-grid');
    const sourceTag = document.getElementById('config-phase-source');
    if (!container || !grid) return;
    const phases = _phasesForLinkedHazard();
    const isLeaf = dataNode.type === 'basic' || dataNode.type === 'undeveloped';
    if (!isLeaf || !phases.length) { container.style.display = 'none'; return; }
    container.style.display = 'block';
    const fhaId = ftaConfig.linkedFhaId.replace('AC_', '').replace('SYS_', '');
    sourceTag.textContent = `· from linked hazard (${phases.length} phases)`;
    const byPhase = dataNode.lambdaByPhase || {};
    grid.innerHTML = phases.map(ph => `<div>
        <label style="font-size:0.75em; margin-bottom:2px;">${esc(ph)} (/hr)</label>
        <input type="number" step="any" min="0" data-phase="${esc(ph)}" value="${byPhase[ph] != null ? byPhase[ph] : ''}" placeholder="flat λ" oninput="onPhaseLambdaEdit()" class="u-mb0">
    </div>`).join('');
}
function onPhaseLambdaEdit() {
    if (!selectedNodeData) return;
    const inputs = document.querySelectorAll('#config-phase-lambda-grid input[data-phase]');
    const map = {};
    inputs.forEach(inp => {
        const raw = inp.value.trim();
        if (raw !== '') {
            const v = parseFloat(raw);
            if (!isNaN(v) && v >= 0) map[inp.dataset.phase] = v;
        }
    });
    selectedNodeData.lambdaByPhase = Object.keys(map).length ? map : undefined;
    calculateAllProbabilities();
    updateD3();
}

// Show / hide μ and τ fields based on the chosen repair model.
function onRepairModelChange() {
    const model = document.getElementById('config-repair-model').value;
    const muWrap  = document.getElementById('config-mu-container');
    const tauWrap = document.getElementById('config-tau-container');
    if (muWrap)  muWrap.style.display  = model === 'continuous' ? 'block' : 'none';
    if (tauWrap) tauWrap.style.display = model === 'periodic'   ? 'block' : 'none';
    updateNodeData();
}

// Phase 57 — per-event exposure UI. Toggle the manual/dormancy inputs by mode, then persist.
function onExposureModeChange() {
    const sel = document.getElementById('config-exposure-mode');
    if (!sel) return;
    const mode = sel.value || 'continuous';
    const manualWrap = document.getElementById('config-exposure-manual-container');
    const dormWrap   = document.getElementById('config-dormancy-container');
    if (manualWrap) manualWrap.style.display = mode === 'manual' ? 'block' : 'none';
    if (dormWrap)   dormWrap.style.display   = mode === 'latent' ? 'block' : 'none';
    updateNodeData();
}

// Render the read-only "effective exposure" line for the selected event, using the same
// resolver the allocator and bottom-up quant use, so the engineer sees the exact t in play.
function _refreshExposureReadout() {
    const out = document.getElementById('config-exposure-effective');
    if (!out) return;
    const node = selectedNodeData;
    if (!node || node.type === 'gate') { out.textContent = '—'; return; }
    const globalT = (typeof ftaConfig === 'object' && ftaConfig && ftaConfig.exposureTime) || 1;
    const t = (typeof _nodeExposureTime === 'function') ? _nodeExposureTime(node, globalT) : globalT;
    const mode = node.exposureMode || 'continuous';
    let src = 'full mission';
    if (mode === 'active') src = 'Σ at-risk phase durations';
    else if (mode === 'latent') src = 'dormancy interval';
    else if (mode === 'manual') src = 'manual value';
    const tStr = (isFinite(t) ? (t >= 0.01 ? t.toFixed(3) : t.toExponential(2)) : '—');
    let txt = tStr + ' hr (' + src + ')';
    if (mode !== 'continuous' && Math.abs(t - globalT) > 1e-9) {
        const ratio = t / globalT;
        txt += ' — ' + (ratio >= 1 ? ratio.toFixed(1) + '× the mission' : (1/ratio).toFixed(1) + '× shorter than mission');
    }
    out.textContent = txt;
}

// React when the user flips between λ / MTBF / P / Library modes.
function onInputModeChange() {
    const mode = document.getElementById('config-input-mode').value;
    const valWrap = document.getElementById('config-input-value-container');
    const libWrap = document.getElementById('config-input-library-container');
    const valLabel = document.getElementById('config-input-value-label');
    if (mode === 'library') {
        valWrap.style.display = 'none';
        libWrap.style.display = 'block';
    } else {
        valWrap.style.display = 'block';
        libWrap.style.display = 'none';
        if (mode === 'lambda')      valLabel.textContent = 'Failure rate λ (per flight hour)';
        else if (mode === 'mtbf')   valLabel.textContent = 'MTBF (hours)';
        else if (mode === 'probability') valLabel.textContent = 'Probability P at exposure time';
    }
    updateNodeData();
}

function changeNodeType() {
    if(!selectedNodeData) return; let val = document.getElementById('config-node-type').value; let isGate = ['AND','OR','XOR','VOTING','INHIBIT','TRANSFER','PAND','SPARE','FDEP'].includes(val);
    let activeChildren = selectedNodeData.children || selectedNodeData._children;
    if(!isGate && activeChildren && activeChildren.length > 0) { alert("Delete children first."); document.getElementById('config-node-type').value = selectedNodeData.type === 'gate' ? selectedNodeData.gateType : selectedNodeData.type; return; }
    if(val === 'TRANSFER' && activeChildren && activeChildren.length > 0) { alert("Transfer gates cannot have children."); document.getElementById('config-node-type').value = selectedNodeData.type === 'gate' ? selectedNodeData.gateType : selectedNodeData.type; return; }
    // Dynamic gate types are also gates.
const isDyn = ['PAND','SPARE','FDEP'].includes(val);
const isGateAny = isGate || isDyn;
if(isGateAny) { selectedNodeData.type = 'gate'; selectedNodeData.gateType = val; } else { selectedNodeData.type = val; selectedNodeData.gateType = null; }
    // Phase 44 — when switching INTO VOTING from another gate type, votingK may still be
    // undefined. Default to 2 so the gate computes as K=2-of-N (not K=1 = OR).
    if (val === 'VOTING' && !(selectedNodeData.votingK > 0)) selectedNodeData.votingK = 2;
    // DFT-WARM — switching INTO SPARE seeds the cold / perfect-switch defaults, which
    // is exactly what this gate has always meant. Changing them is a deliberate act.
    if (val === 'SPARE') {
        if (!isFinite(parseFloat(selectedNodeData.spareWarmK)))   selectedNodeData.spareWarmK = 0;
        if (!isFinite(parseFloat(selectedNodeData.spareSwitchP))) selectedNodeData.spareSwitchP = 1;
    }
    const _spareCfg = document.getElementById('config-spare-container');
    if (_spareCfg) _spareCfg.style.display = (val === 'SPARE') ? 'flex' : 'none';
    document.getElementById('config-name-container').style.display = (val === 'TRANSFER') ? 'none' : 'block';
    document.getElementById('config-transfer-container').style.display = (val === 'TRANSFER') ? 'flex' : 'none';
    document.getElementById('config-ccf-container').style.display = (selectedNodeData.type === 'basic') ? 'flex' : 'none';
    if(val === 'TRANSFER') { selectedNodeData.name = "Transfer"; const linkSel = document.getElementById('config-transfer-link'); linkSel.innerHTML = '<option value="">-- Select Tree to Link --</option>'; ftaPages.forEach(p => { if(p.id !== activeFTAPageId) linkSel.innerHTML += `<option value="${esc(p.id)}">${esc(p.name)}</option>`; }); }
    // Phase 53.49 — gate type / node type change reshapes the math → flag affected reqs.
    if (typeof _markStructureChangeObsolete === 'function') _markStructureChangeObsolete('Node type changed (gate logic reshaped).');
    updateFTAConfigUI(); calculateAllProbabilities(); updateD3(); try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}   // 13 Sep 2026 (R18)
}

// [P2 batch 3] L16505-16665 moved verbatim to support_modules.js
window.refreshBasicEventDerived = refreshBasicEventDerived;

// [P2 batch 4] L14474-14572 moved verbatim to helpers_modules.js
window._isDisplayIdDuplicate = _isDisplayIdDuplicate;

// [P2 batch 4] L14575-14653 moved verbatim to helpers_modules.js
window.onFtaFhaLinkChange = onFtaFhaLinkChange;
window.autoGenerateTopGateForFha = autoGenerateTopGateForFha;
// Phase 53.49 — structural-change tracker.
// Any add/delete/gate-type-change on either tree marks AutoReq probability/DAL/structure reqs
// as obsolete so the user knows to regenerate. Paste of EXISTING logicalIds and Integrate Back
// preserve identity, so those skip the flag pass (see _isPureStructuralRelocation).
// [P2 batch 6] L6424-6442 moved verbatim to misc_fn_modules.js
window._markStructureChangeObsolete = _markStructureChangeObsolete;

// Phase 53.49 — Q3: when allocation grows, auto-mirror the new BE into the verification tree.
// Returns true if a mirror node was added.
// [P2 batch 6] L6447-6461 moved verbatim to misc_fn_modules.js
window._autoMirrorIntoVerification = _autoMirrorIntoVerification;

// Phase 53.49 — find the parent of a node in the active page (returns the parent or null).
// [P2 batch 4] L14701-14758 moved verbatim to helpers_modules.js
window._handleVerificationSideAdd = _handleVerificationSideAdd;

// [P2 batch 4] L14761-14846 moved verbatim to helpers_modules.js

// Phase 57 — the "📊 Results" popup (openResultsModal/closeResultsModal) was removed; the
// cutset/results panel is now an inline section at the bottom of the FTA workspace.

// Esc-to-close — wired once on DOMContentLoaded. We avoid swallowing Esc when
// the user is editing a text field inside the modal (textarea / input / select)
// so they can still cancel their edit naturally. The handler only fires when
// the active element is the body or a button.
document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    const ae = document.activeElement;
    const editing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable);
    if (editing) return;
    const ncp = document.getElementById('node-config-panel');
    if (ncp && ncp.style.display === 'block') { closeNodeConfigModal(); e.preventDefault(); return; }
    // #36 — generic: Esc closes the TOPMOST open modal by invoking its OWN close
    // control (so each modal's cleanup runs — we never force-hide and corrupt state).
    try {
        const ov = Array.prototype.slice.call(document.querySelectorAll('.modal-overlay.show'));
        if (ov.length) {
            const top = ov[ov.length - 1];
            const closer = top.querySelector('[data-modal-close], .modal-close, button[aria-label="Close" i], button[onclick*="close" i]');
            if (closer) { closer.click(); e.preventDefault(); }
        }
    } catch (_) {}
}, false);

// Phase 53.46 — `onFtaCalcModeChange` intercepts the calc-mode dropdown so switching from
// Top-Down to Bottom-Up on a tree that already has content offers to spawn a VERIFICATION
// MIRROR rather than nuking the allocations the analyst built. The mode is sticky per page;
// see `_syncPageModeFromConfig` / page-switch handler.
// [P2 batch 6] L6500-6537 moved verbatim to misc_fn_modules.js
window.onFtaCalcModeChange = onFtaCalcModeChange;

// Phase 53.46 — deep clone an FTA subtree, optionally blanking quantitative values on leaves
// so the result is a structural mirror suitable for bottom-up verification population. Keeps
// the same logicalIds (so common-mode chains + auto-evidence linkage by logicalId work later),
// but gives every node a fresh structural id from internalIdCounter.
// [P2 batch 4] L14922-15013 moved verbatim to helpers_modules.js
window.createVerificationTreeFromActive = createVerificationTreeFromActive;

// Phase 57 — keep a verification mirror's ownership/context in lockstep with its source.
// A mirror represents the SAME system's verification, so when the source's owning system,
// tree level, FHA link, or top-event budget changes, the mirror must follow — otherwise it
// drops out of the per-system SSA/ASA rollups (which filter on systemId) or shows under the
// wrong folder. Called from the ownership-change handlers. No-op when the given page has no
// mirror, or is itself a mirror.
// [P2 batch 6] L6553-6564 moved verbatim to misc_fn_modules.js
window._syncMirrorOwnershipFromSource = _syncMirrorOwnershipFromSource;

// [P2 batch 2] L19125-19399 moved verbatim to fta_view_modules.js

// [P2 batch 5] L7927-7933 moved verbatim to bindings_modules.js

// [P2 batch 5] L7935-8046 moved verbatim to bindings_modules.js

// Show the AC↔Sys FC linkage panel when the active FTA is linked to a System FHA.
// The selection writes through to sysFha.acTrace, which the AutoReq generator reads at generation time.
// [P2 batch 2] L19524-19697 moved verbatim to fta_view_modules.js
window.getRootAncestorPage = getRootAncestorPage;
window.getRootAncestorPageOfActive = getRootAncestorPageOfActive;

// Phase 53.43 — reactive DAL propagation. Runs every time the tree changes (called from
// calculateAllProbabilities). Walks from the true-root page's top event downward, seeding
// the DAL from the root page's linked FHA + project cert basis. Returns silently if there's
// no seed available (no FHA linked anywhere on the chain), so it never disturbs the user.
// allocateDAL already follows transferOutTo, so subtree roots inherit the parent's allocated
// DAL automatically.
// [P2 batch 6] L6585-6612 moved verbatim to misc_fn_modules.js
window.propagateDalFromTrueRoot = propagateDalFromTrueRoot;

// Phase 56.48a — For every logicalId that appears in 2+ positions, set every
// instance's allocatedDAL to the strictest DAL across all positions (dalMax).
// Mirrors _propagateStrictestAcrossSharedEvents but for DAL instead of probability.
// [P2 batch 6] L6618-6649 moved verbatim to misc_fn_modules.js
window._propagateStrictestDALAcrossSharedEvents = _propagateStrictestDALAcrossSharedEvents;

// Phase 53.43 — "Integrate Subtree Back": inverse of transfer-out. Moves the linked subtree's
// children straight onto the source gate, clears the transfer-out flag, deletes the now-empty
// subtree page, and (optionally) recursively flattens nested transfers.
//
// Children retain their logicalIds (the transfer-out used `preserveLogicalIds`), so repeated-
// event chains and common-mode markers survive the round-trip intact. The reactive cascade
// (calculateAllProbabilities) re-evaluates allocations afterward, so DAL / λ / P numbers
// remain consistent with the integrated layout — they were the same before and after the
// move (transfer is a presentation choice, not a math change).
// [P2 batch 4] L15247-15301 moved verbatim to helpers_modules.js
window.integrateTransferredSubtree = integrateTransferredSubtree;
// [P2 batch 5] L8138-8144 moved verbatim to bindings_modules.js
// [P2 batch 5] L8145-8149 moved verbatim to bindings_modules.js

// Run the autonomous DAL allocator from the active page's top event.
// Top-event DAL comes from the linked FHA + project class. Without a linked hazard,
// we prompt the user once for a manual seed DAL.
// Phase 53.43 — kept for the explicit toolbar button so users can still force a re-run
// (or seed a tree that has no FHA link). The reactive propagateDalFromTrueRoot handles the
// automatic case driven by edits.
// [P2 batch 4] L15322-15429 moved verbatim to helpers_modules.js
window.togglePanelCollapse = togglePanelCollapse;

// [P2 batch 4] L15432-15482 moved verbatim to helpers_modules.js
window.onExposureInputChange = onExposureInputChange;
window.onExposureAutoToggle  = onExposureAutoToggle;

// Phase 76 — mission-profile picker for the active fault tree. Selecting a profile records it on
// the page and re-pulls the exposure time from the FHA's phases costed at the profile's durations.
// [P2 batch 6] L6681-6711 moved verbatim to misc_fn_modules.js
window.refreshFtaMissionProfileDropdown = refreshFtaMissionProfileDropdown;
window.onFtaMissionProfileChange = onFtaMissionProfileChange;
// [P2 batch 6] L6714-6751 moved verbatim to misc_fn_modules.js
window._getPasteOriginTarget = _getPasteOriginTarget;

// =============================================================================
// Phase 56.39d — Prescribed failure rate helper.
// =============================================================================
// Engineer-asserted gate rate. When set + toggled on, the value is used
// VERBATIM (not min'd against natural apportionment) and the allocator stops
// at the gate (does NOT recurse into children). Bottom-up still computes
// children's probability so divergence can be flagged.
// [P2 batch 6] L6761-6767 moved verbatim to misc_fn_modules.js
window._getPrescribedTarget = _getPrescribedTarget;

// =============================================================================
// Phase 56.39c — Weight slider rebalance helpers.
// =============================================================================
// Sibling weights sum to 100 by invariant. Dragging one slider redistributes
// the delta proportionally across unlocked siblings. Locked siblings hold their
// value. If all-but-one siblings are locked, the unlocked slider is clamped
// at (100 − sum_locked).
// [P2 batch 4] L15584-15697 moved verbatim to helpers_modules.js
window.syncWeightSliderFromNode = syncWeightSliderFromNode;

// [P2 batch 6] L6780-6796 moved verbatim to misc_fn_modules.js
window.onWeightSliderInput = onWeightSliderInput;

// [P2 batch 6] L6799-6805 moved verbatim to misc_fn_modules.js
window.onWeightLockToggle = onWeightLockToggle;

// [P2 batch 6] L6808-6823 moved verbatim to misc_fn_modules.js
window.syncPrescribedFromNode = syncPrescribedFromNode;

// [P2 batch 1] L20282-20625 moved verbatim to fta_quant_modules.js
window._checkExternalSourceStaleness = _checkExternalSourceStaleness;

// [P2 batch 4] L15749-15848 moved verbatim to helpers_modules.js
window._hasRepeatedLogicalIds = _hasRepeatedLogicalIds;

// Phase 56.45 — Walk every leaf in the active tree, compare its allocated
// λ to its achievableLambda (when set), tag node._feasibilityViolation when
// allocated exceeds achievable. The canvas renders a small ⚠ marker on
// flagged leaves so the engineer can spot architecture-vs-physics conflicts.
// [P2 batch 4] L15855-15900 moved verbatim to helpers_modules.js
window._checkLeafFeasibility = _checkLeafFeasibility;

// Phase 56.41 / 56.44 — Tag every gate whose subtree contains repeated
// logicalIds. Used by the per-gate BDD-exact normalization pass and by the
// canvas chip / warning UX. Phase 56.44 rewrite: just call
// _hasRepeatedLogicalIds for each gate. O(n²) worst case but trees are small
// enough that this is fine (typically <100 nodes).
// [P2 batch 4] L15908-15967 moved verbatim to helpers_modules.js
window._normalizeIntermediateGatesForSharedEvents = _normalizeIntermediateGatesForSharedEvents;

// Phase 56.43 — MCS-aware top-down rebalance.
//
// After allocateTopDown sets initial per-leaf probabilities via a naive split
// (which assumes independence at every gate and ignores shared events), find a
// uniform scale factor k in [0, 1] such that applying k to every UNIQUE
// variable's probability makes BDD-exact reconstruct to the engineer's target.
//
// Why this matters: when shared events create dominant cutsets (e.g., one
// event in both AND-branches), naive top-down allocation over-allocates budget
// because it can't see the sharing. The BDD/MCS expression with shared events
// folded as single variables gives the true P(top), which can be orders of
// magnitude higher than the naive allocation suggests. mcsAwareRebalance
// shrinks the unique-variable rates uniformly until BDD-exact equals target —
// preserving the relative ratios from the naive allocator while closing the
// absolute budget.
//
// Algorithm: bisection on k in [0, 1]. Converges in ~50 iterations to 1e-4
// relative tolerance for typical trees.
//
// Returns true on success (converged), false on inapplicable conditions.
// [P2 batch 4] L15990-16073 moved verbatim to helpers_modules.js
window.mcsAwareRebalance = mcsAwareRebalance;

// Phase 56.46 — Birnbaum importance per unique variable.
// B_v = ∂P_top/∂p_v ≈ P_top|p_v=1 − P_top|p_v=0.
// Computed via two BDD-exact evaluations per variable. For a tree with N
// unique variables this is 2N BDD evaluations — fine for N ≤ ~30, skip for
// larger trees to avoid quadratic blowup.
// [P2 batch 6] L6875-6894 moved verbatim to misc_fn_modules.js
window._computeBirnbaumPerVariable = _computeBirnbaumPerVariable;

// Phase 56.46 — Importance-weighted redistribution.
// After uniform-scale mcsAwareRebalance closes the budget, redistribute so
// each variable's burden share (B_v × p_v) is approximately equal across
// variables — the equi-importance allocation. Variables with high Birnbaum
// (dominant cutset members) get tighter rates; variables with low Birnbaum
// (marginal contributors) relax. Final uniform re-scale re-pins target.
//
// Skip for trees with > MAX_VARS unique events to keep latency reasonable.
// [P2 batch 4] L16111-16184 moved verbatim to helpers_modules.js
window.mcsAwareImportanceRedistribute = mcsAwareImportanceRedistribute;

// Phase 56.41 — Post-pass: for every logicalId that appears in 2+ positions,
// set all instances to the strictest (smallest) allocated probability. Runs
// after top-down allocation so the conservative-merge across instances is
// reflected on the canvas. Re-syncs lambda from the corrected probability.
// Subsumed by mcsAwareRebalance when BDD-exact is available; retained as
// a fallback for environments where computeExactProbability isn't loaded.
// [P2 batch 1] L21072-21244 moved verbatim to fta_quant_modules.js

// ── Cut-set explosion guard (deterministic-core safeguard) ───────────────────
// Minimal cut-set enumeration is an AND-product (Cartesian) that can blow up
// combinatorially on deep AND nesting / large voting gates. The guard ABORTS the
// whole enumeration (throws) the instant it would exceed _CUTSET_BUDGET — it NEVER
// truncates and returns a partial set (an incomplete cut-set set would silently
// under-report failure combinations). Under the budget, behaviour is byte-identical
// to before, so the deterministic result is unchanged. P(top) is computed by the BDD
// engine, not by cut sets, so an abort here never affects the certification probability.
const _CUTSET_BUDGET = 200000;
// [P2 batch 6] L6925-6930 moved verbatim to misc_fn_modules.js
CutsetExplosionError.prototype = Object.create(Error.prototype);
CutsetExplosionError.prototype.constructor = CutsetExplosionError;
// [P2 batch 1] L21263-21938 moved verbatim to fta_quant_modules.js
window._nodeExposureTime = _nodeExposureTime;

// Convert a (possibly sampled) λ into a probability for the active mission, honoring the
// event's repair model: unmaintained / continuously monitored / periodically tested.
// [P2 batch 1] L21943-22227 moved verbatim to fta_quant_modules.js
// ── #19 — Web Worker cut-set offload (opt-in; the canonical SYNC path stays the default) ──────
// enumerateCutsetsAsync resolves to cut sets (arrays of event node objects) identical to
// getCutsets(). For large trees it offloads the enumeration to fta_worker.js so the UI stays
// responsive; it ALWAYS falls back to the synchronous engine on any worker hiccup, so results are
// guaranteed identical (same engine, transfers pre-flattened, ids reconstructed) and the
// deterministic default behaviour is never at risk. Activate after a browser smoke test with
// ?cutsetWorker=1 or localStorage SLA_CUTSET_WORKER='1'.
var _cutsetWorker = null, _cutsetWorkerSeq = 0;
var _CUTSET_WORKER_MIN_NODES = 400;   // only worth the postMessage round-trip for big trees
// [P2 batch 6] L6948-6979 moved verbatim to misc_fn_modules.js
try { window.enumerateCutsetsAsync = enumerateCutsetsAsync; } catch (_) {}

// ── #17 — Web Worker offload for exact P(top) + importance (opt-in; canonical sync default) ───
// computeImportanceAsync resolves to the SAME shape as computeImportanceMeasures(). Probabilities
// are already baked onto the tree by the upstream quantification flow, so the worker does only the
// pure BDD combinatorics. Always falls back to the synchronous engine on any worker issue, so the
// certification P(top) is identical (parity-proven) and never at risk. Same flag as the cut-set worker.
// [P2 batch 6] L6987-7012 moved verbatim to misc_fn_modules.js
try { window.computeImportanceAsync = computeImportanceAsync; } catch (_) {}

// ── #45 — quantification result cache (opt-in; collision-verified; cleared on every edit) ──────
// Caches getCutsets()/computeImportanceMeasures() keyed by a canonical hash of the tree (structure +
// baked probabilities + CCF params). A hit re-verifies the EXACT canonical content, so a hash collision
// can never return a wrong result; the whole cache is cleared on any edit (scheduleAutosave) and on
// project load, so a hit means the tree is provably unchanged and cached refs stay valid. Default OFF
// (cert path unchanged); enable with ?quantcache=1 or localStorage SLA_QUANTCACHE='1'.
var _quantCache = new Map();
var _QUANT_CACHE_CAP = 24;
// [P2 batch 2] L20838-21035 moved verbatim to fta_view_modules.js

// ==========================================
// GOLDEN THREAD MODAL ENGINE
// ==========================================
// ============================================================================
// Golden Thread — the per-failure-condition safety thread (ARP 4761A / 4754B).
// Re-based on the Traceability index (single source of truth) and BDD-exact
// quantification. Renders the FC end-to-end: budget check → functions/DAL →
// fault tree → contributors (FMEA/library) → common cause → requirements →
// verification → assumptions, with a gap banner. Stages are click-navigable.
// ============================================================================
window._gtJumps = [];
// [P2 batch 5] L8521-8521 moved verbatim to bindings_modules.js
// [P2 batch 2] L21049-21242 moved verbatim to fta_view_modules.js

// One-click: open the shared golden thread for the FC this item belongs to,
// with the item highlighted in place. Surfaced from PRA / ZSA / CMA / FTA node.
// [P2 batch 5] L8526-8531 moved verbatim to bindings_modules.js
// Convenience for the FTA node config panel (uses the live selection).
// [P2 batch 5] L8533-8536 moved verbatim to bindings_modules.js
// Small reusable "Thread" button for analysis rows.
// [P2 batch 6] L7045-7118 moved verbatim to misc_fn_modules.js
window.toggleGtvFlagged = toggleGtvFlagged;

// The Golden Thread view: function picker + Sankey + ecosystem panel.
// [P2 batch 3] L18745-18895 moved verbatim to support_modules.js
window.renderGoldenThreadView = renderGoldenThreadView;

// ==========================================
// AutoReq engine (Phase 3H)
// Generates requirements from FHA hazards, FTA basic events, DALgebra allocations, and gate structure.
// Each generated req carries a reqSource = { generator, sourceId, fingerprint, context, generatedAt, ... }.
// On source drift the fingerprint mismatches → req is flagged stale (user accepts/rejects diff).
// Gate-independence reqs also carry { compromised, compromiseReasons } based on structural checks.
// ==========================================
// AutoReq — extracted to assurance_modules.js (Phase 76; byte-identical, loaded before this file).

// ============================================================================
// Phase 14.1 — Traceability index
// Single source of truth for "what references X?"  Powers:
//   • back-reference side panel (Phase 14.2-3)
//   • command palette (Phase 14.4)
//   • Dashboard worklist (Phase 14.5)
//
// Artifact kinds:
//   acFunc, acFcim, acFha, acReq, acAsm
//   sysFunc, sysFcim, sysFha, sysReq, sysAsm   (sys-scoped — descriptors carry systemId)
//   ftaPage, ftaNode (with pageId), pra, zsa, cma, fmea
// ============================================================================
// Traceability — extracted to assurance_modules.js (Phase 76; byte-identical, loaded before this file).

// Render badge HTML for a requirement row (used in renderCells for AC + Sys req tables).
// Phase 53.48 — verification-evidence linkage between AutoReq and the verification mirror tree.
//
// For requirements generated from the allocation FTA (generator === 'fta-event'), look up the
// matching node in the verification mirror by logicalId. The mirror's bottom-up calculated λ
// IS the implementation evidence — compare against the req's allocated λ target to PASS/FAIL.
//
// For requirements generated from FHA (generator === 'fha' or 'fha-quant'), the top-event
// probability rolled up by the mirror is the evidence — compare against the FHA's regulation
// target.
//
// Three "non-evidence" states are returned cleanly:
//   { state: 'no-mirror' }     — no verification mirror exists for the source allocation tree.
//   { state: 'no-node' }       — mirror exists but no node with the matching logicalId
//                                (component drift; the req has no implementation counterpart).
//   { state: 'awaiting' }      — mirror node exists but λ is still 0 (verification not started).
//   { state: 'pass' | 'fail' } — mirror node has λ; comparison is meaningful.
// [P2 batch 2] L21891-22055 moved verbatim to fta_view_modules.js
window.getAutoReqVerificationEvidence = getAutoReqVerificationEvidence;

// [P2 batch 4] L16597-16674 moved verbatim to helpers_modules.js

// ---------- Reconcile Duplicates modal handlers ----------
// [P2 batch 5] L8664-8664 moved verbatim to bindings_modules.js

// [P2 batch 4] L16679-16743 moved verbatim to helpers_modules.js

// -------- AutoReq UI: modal, filter, accept/reject diff --------

// Current generator-scope target ('ac' or 'sys-<id>'). Set when modal opens.
window._autoReqActiveScope = 'ac';

// [P2 batch 4] L16750-16885 moved verbatim to helpers_modules.js

// Filter chip handler. Stores per-scope filter selection in a closure-local map.
// [P2 batch 5] L8676-8676 moved verbatim to bindings_modules.js
// [P2 batch 4] L16889-16948 moved verbatim to helpers_modules.js

// ── Persistent "AI is working" indicator ───────────────────────────────────────────
// A sticky toast (no auto-dismiss) with a spinner that stays visible the ENTIRE time AI is
// running background work, so a long assessment never looks idle. Reference-counted, so several
// overlapping assessments share ONE toast that only clears when the last task finishes. Driven by
// AI.complete() (the single AI chokepoint) — see ai_assistant.js.
// [P2 batch 5] L8684-8684 moved verbatim to bindings_modules.js
// [P2 batch 4] L16956-17002 moved verbatim to helpers_modules.js
try { window.slabAiBusyBegin = slabAiBusyBegin; window.slabAiBusyEnd = slabAiBusyEnd; } catch(_){}

// ── Rule: every modal has a visible exit ───────────────────────────────────────────
// No user should be trapped in a modal with no visible way out. Any `.modal-overlay` (the app's
// formal modal system, shown via the `.show` class) that lacks a dismiss control gets a × injected
// automatically — at load and whenever a modal is added to the DOM. It only injects when a control
// is GENUINELY absent, so the many modals that already have Close/Cancel/× are left untouched. The
// mandatory signup gate is exempt; the EULA/License gates and the command palette use their own
// overlay classes (not `.modal-overlay`), so they are never touched by this.
const _SL_MODAL_EXIT_EXEMPT = { 'signup-modal': 1 };
// [P2 batch 6] L7203-7232 moved verbatim to misc_fn_modules.js
try {
    if (document.readyState !== 'loading') _slScanModals();
    else document.addEventListener('DOMContentLoaded', _slScanModals);
    if (window.MutationObserver) new MutationObserver(_slQueueModalScan).observe(document.documentElement, { childList: true, subtree: true });
    // Escape backstop — dismiss the top-most visible, non-exempt overlay even if it forgot a handler.
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        const open = [];
        document.querySelectorAll('.modal-overlay.show').forEach(function (o) { if (!(o.id && _SL_MODAL_EXIT_EXEMPT[o.id])) open.push(o); });
        if (!open.length) return;
        const top = open[open.length - 1];
        const btn = top.querySelector('.modal-close, .node-modal-close, .close-x, .sl-fb-close, [aria-label="Close" i], .sl-auto-exit');
        if (btn) btn.click(); else top.classList.remove('show');
    });
} catch (_) {}

// Replace native alert() / confirm() with toast-friendly versions, but keep semantic intent.
// confirm() needs a blocking yes/no, so we keep native confirm. alert() becomes a toast.
window._origAlert = window.alert;
window.alert = function(msg) {
    // Heuristic: errors usually start with words like "Please", "Error", contain "must", "first", "select"
    const m = (msg || '').toString();
    let type = 'info';
    if(/error|invalid|fail/i.test(m)) type = 'error';
    else if(/please|first|select|need to/i.test(m)) type = 'warning';
    else if(/saved|loaded|generated|complete|success/i.test(m)) type = 'success';
    showToast(m, type);
};

// ----- 5.4 Autosave + recovery -----
// [P2 batch 5] L8756-8756 moved verbatim to bindings_modules.js
// [P2 batch 5] L8757-8757 moved verbatim to bindings_modules.js
// [P2 batch 5] L8758-8758 moved verbatim to bindings_modules.js
let _autosaveLastWrite = 0;
// [P2 batch 5] L8760-8760 moved verbatim to bindings_modules.js
// [P2 batch 5] L8761-8761 moved verbatim to bindings_modules.js
// [P2 batch 5] L8762-8762 moved verbatim to bindings_modules.js
// [P2 batch 5] L8763-8763 moved verbatim to bindings_modules.js
// [P2 batch 5] L8764-8764 moved verbatim to bindings_modules.js
// [P2 batch 5] L8765-8765 moved verbatim to bindings_modules.js
// Phase 57 — explicit "Save Changes" state. Set true on any tracked edit (every mutating action
// funnels through scheduleAutosave); cleared only by an explicit commitSaveChanges(). The header
// indicator and the node drawer's Save button both reflect this so the user always has a Save
// Changes control once changes are made. Background autosave still runs as the recovery net.
let _dirtySinceSave = false;

// === #14 — durable persistence: IndexedDB primary + localStorage mirror =======================
// Native IndexedDB key/value (no deps → air-gap safe; local-only → ITAR safe, zero network egress).
// IndexedDB holds large projects that exceed the ~5MB localStorage quota; localStorage stays as a
// synchronous mirror so the pagehide/beforeunload flush remains reliable for normal-sized projects.
// SLDB — extracted to engine_modules.js (Phase 76; byte-identical, loaded after this file).
try { window.SafetyLabStore = SLDB; } catch (_) {}

// Pure: is this parsed autosave a real working state worth recovering (not the empty bootstrap)? (Testable.)
// [P2 batch 4] L17097-17137 moved verbatim to helpers_modules.js

// ── #49 — performance instrumentation (opt-in; ZERO overhead + behaviour change when off) ───────
// _perfTime(label, fn) just calls fn() when disabled, so wrapping a hot path is free by default.
// Enable with ?perf=1 or localStorage SLA_PERF='1' → records avg/max/last per op + a live overlay.
// Supports the Boeing-pilot commitment to "instrument it and share where it hits a limit."
var _perfStats = {};
// [P2 batch 6] L7294-7314 moved verbatim to misc_fn_modules.js
try { window.SafetyLabPerf = { stats: function () { return _perfStats; }, rows: _perfRows, report: function () { try { console.table(_perfRows()); } catch (_) {} return _perfRows(); }, reset: function () { _perfStats = {}; }, time: _perfTime }; } catch (_) {}
try { window.addEventListener('load', function () { if (_perfEnabled()) setInterval(_perfRenderOverlay, 1000); }); } catch (_) {}

// === #16 — project-size / quota health (advisory, NEVER destructive) ==========================
// [P2 batch 5] L8812-8812 moved verbatim to bindings_modules.js
// [P2 batch 5] L8813-8813 moved verbatim to bindings_modules.js
// [P2 batch 5] L8814-8814 moved verbatim to bindings_modules.js
// [P2 batch 5] L8815-8815 moved verbatim to bindings_modules.js
// [P2 batch 5] L8816-8816 moved verbatim to bindings_modules.js
// Pure: classify project health from payload size + total row count. Advisory only — no data is
// ever dropped or capped; we warn and let the user decide (baseline / split / export). (Testable.)
// [P2 batch 4] L17176-17216 moved verbatim to helpers_modules.js
// === Project bundle codec — "separate files on disk, one project in memory" ====================
// Pure transform between the flat in-memory project (same shape as _snapshotProject) and a set of
// per-domain / per-system / per-FTA-page files. Lossless: merge(split(p)) reproduces p. Enables a
// folder-of-files layout (git-friendly, modular) AND a portable .slproj zip of the same files, plus
// delta save (rewrite only files whose content signature changed). I/O sits ON TOP of this codec;
// the existing single-.json save/load + IndexedDB autosave are untouched.
// [P2 batch 5] L8826-8834 moved verbatim to bindings_modules.js
// [P2 batch 6] L7334-7367 moved verbatim to misc_fn_modules.js
// ── #50 inc3 — portable .slproj zip (native deflate + CRC32; NO dependency, air-gap-safe) ───────
// A minimal ZIP writer/reader using CompressionStream('deflate-raw'). Packages the bundle files into
// one shareable .slproj (internally multi-file), and reads it back → merge → one project. Fully
// round-trippable + Node-testable; no JSZip / no CDN.
var _CRC32_TABLE = (function () { var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
// [P2 batch 4] L17271-17339 moved verbatim to helpers_modules.js
try { window.SafetyLabBundle = { split: _bundleSplit, merge: _bundleMerge, changed: _bundleChangedFiles, toZip: _bundleToZip, fromZip: _bundleFromZip, zipMake: _zipMake, zipParse: _zipParse }; } catch (_) {}

// ── #50 — user-facing bundle I/O. Additive: existing Save/Load (.json) + autosave are untouched. ──
// (a) Portable .slproj export/import — cross-browser (Blob download + file input), codec Node-verified.
// [P2 batch 4] L17344-17408 moved verbatim to helpers_modules.js
try { window.exportProjectBundle = exportProjectBundle; window.importProjectBundle = importProjectBundle; window.saveProjectToFolder = saveProjectToFolder; window.openProjectFromFolder = openProjectFromFolder; } catch (_) {}

// Phase 56.52a — Disk write-through: if the user has configured a Save Folder,
// every autosave also writes the JSON project file to that folder. Silent
// permission check so it doesn't prompt every 2s; if the handle is gone or
// permission lapsed we degrade gracefully to localStorage-only.
// [P2 batch 4] L17415-17535 moved verbatim to helpers_modules.js

// Per-view save buttons — surface the same auto-save reassurance on every data-editing view, so the
// engineer never has to glance up to the top bar to know their work is safe. Each button reuses the
// header indicator's look and is wired to the SAME state (commitSaveChanges + _dirtySinceSave), so it
// reads "Saved just now" / "Save Changes" / "Saving…" in lock-step with the header control.
// [P2 batch 5] L8892-8892 moved verbatim to bindings_modules.js
// [P2 batch 6] L7392-7421 moved verbatim to misc_fn_modules.js
try {
    if (document.readyState !== 'loading') _slInjectViewSaveButtons();
    else document.addEventListener('DOMContentLoaded', _slInjectViewSaveButtons);
} catch (_) {}
window.commitSaveChanges = commitSaveChanges;

// ============================================================
// Phase 57 — UX upgrade batch: density toggle, ARP 4761A workflow
// stepper, one-time getting-started card, in-tree node search.
// All additive; degrade gracefully if their anchors are absent.
// ============================================================
// ARP 4761A workflow stepper — a thin strip under the header that shows the safety spine and
// highlights the stage matching the active tab. Hidden on non-workflow tabs.
// [P2 batch 5] L8936-8943 moved verbatim to bindings_modules.js
// [P2 batch 6] L7436-7455 moved verbatim to misc_fn_modules.js
window._renderWorkflowStepper = _renderWorkflowStepper;

// One-time getting-started card (dismissed permanently per browser).
// [P2 batch 5] L8967-8967 moved verbatim to bindings_modules.js
// [P2 batch 6] L7460-7480 moved verbatim to misc_fn_modules.js
window.dismissGettingStarted = dismissGettingStarted;

// In-tree node search — find nodes by description, node ID (displayId) or internal id,
// across EVERY fault-tree page (gates, top events, basic events — every type). Each hit stores
// its page so we can switch to it, expand any collapsed ancestors, select + center the node.
// Enter cycles matches. (Phase 57; cross-tree + expand + center-on-hit added 2026-06-28.)
// [P2 batch 5] L8995-8995 moved verbatim to bindings_modules.js
// [P2 batch 5] L8996-8996 moved verbatim to bindings_modules.js
// [P2 batch 5] L8997-8997 moved verbatim to bindings_modules.js
// [P2 batch 4] L17647-17747 moved verbatim to helpers_modules.js
window.ftaZoomToSelection = ftaZoomToSelection;


// #52 — guided empty states: when an analysis table has no rows, show a "nothing here yet"
// hint with the next best action. Additive — only injects when the tbody is genuinely empty.
// [P2 batch 5] L9004-9013 moved verbatim to bindings_modules.js
// [P2 batch 6] L7497-7513 moved verbatim to misc_fn_modules.js
window._renderTabEmptyStates = _renderTabEmptyStates;

// #46 — generic collapsible entry forms, so the table/context stays visible during data entry
// (the inline FHA forms previously pushed the table down). Collapsed by default; auto-expands on edit.
// [P2 batch 6] L7518-7529 moved verbatim to misc_fn_modules.js
window.toggleSlCollapsible = toggleSlCollapsible;
window.expandEntryForm = expandEntryForm;

// #43 — one standardized, promise-based dialog system (polished, focus-managed, Esc/backdrop to
// cancel, dark-mode aware). Replaces bare native prompt()/confirm() at migrated call sites.
// [P2 batch 6] L7535-7572 moved verbatim to misc_fn_modules.js
window.slConfirm = slConfirm;

// Navigate to a search hit: switch to its page, reveal it, select, render, then center on it.
// [P2 batch 6] L7576-7588 moved verbatim to misc_fn_modules.js
window.ftaTreeSearch = ftaTreeSearch;

document.addEventListener('DOMContentLoaded', function () {
    try { _maybeShowGettingStarted(); } catch (_) {}
});
// Public API — call after any state-mutating action.
// [P2 batch 6] L7595-7629 moved verbatim to misc_fn_modules.js
try {
    window.addEventListener('pagehide', _flushAutosave);
    window.addEventListener('beforeunload', _flushAutosave);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') _flushAutosave(); });
} catch (_) {}
// Keep the relative "Saved Ns ago" text fresh.
setInterval(() => { if(_autosaveLastWrite) _updateSaveIndicator('saved'); }, 5000);

// Check on load for a recovery candidate.
// [P2 batch 2] L23366-23525 moved verbatim to data_ops_modules.js

// ----- 5.6 Undo / Redo (perf-tuned in 6.1) -----
// [P2 batch 5] L9159-9159 moved verbatim to bindings_modules.js
// [P2 batch 5] L9160-9160 moved verbatim to bindings_modules.js
// [P2 batch 5] L9161-9161 moved verbatim to bindings_modules.js
// [P2 batch 5] L9162-9162 moved verbatim to bindings_modules.js
// [P2 batch 5] L9163-9163 moved verbatim to bindings_modules.js
// [P2 batch 5] L9164-9164 moved verbatim to bindings_modules.js
// [P2 batch 4] L17914-17954 moved verbatim to helpers_modules.js

// ----- 5.5 Welcome modal -----
// [P2 batch 5] L9168-9168 moved verbatim to bindings_modules.js
// [P2 batch 6] L7652-7717 moved verbatim to misc_fn_modules.js
window.addEventListener('keydown', function(e){
    // Esc closes any open modal (priority over other handlers)
    if(e.key === 'Escape') {
        const open = document.querySelector('.modal-overlay.show');
        if(open) { open.classList.remove('show'); setTimeout(() => open.style.display = 'none', 250); e.preventDefault(); return; }
    }
    if(_isTypingTarget(e.target)) return;
    const meta = e.metaKey || e.ctrlKey;
    if(meta && (e.key === 's' || e.key === 'S')) { e.preventDefault(); saveProject(); showToast('Project saved.', 'success', 2000); return; }
    if(meta && e.shiftKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); redo(); return; }
    if(meta && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo(); return; }
    if(meta && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); return; }
    if(meta && (e.key === '/' || e.key === '?')) { e.preventDefault(); toggleHelpMode(); return; }
    if(!meta && e.key === '?') { e.preventDefault(); if(typeof openShortcutsHelp === 'function') openShortcutsHelp(); return; }
    if(meta && (e.key === 'n' || e.key === 'N')) {
        const ftaView = document.getElementById('view-fta');
        if(ftaView && ftaView.style.display !== 'none') { e.preventDefault(); addNewFTAPage(); showToast('New fault tree added.', 'success', 2000); return; }
    }
});

// ----- 5.9 PDF export (jsPDF loaded on demand) -----
// [P2 batch 5] L9256-9256 moved verbatim to bindings_modules.js
// ============================================================================
// Phase 53 — SaveFs: user-chosen save directory via File System Access API
// ----------------------------------------------------------------------------
// Once the user picks a save folder, every project export (JSON, PDF, CSV) writes
// directly there with no per-file dialog. Falls back to anchor.download when:
//   - the browser doesn't expose showDirectoryPicker (Firefox, Safari)
//   - the page was opened from file:// (Chrome blocks the API on local origins)
//   - the user revokes permission on the folder
//
// FileSystemDirectoryHandle is NOT JSON-serializable, so we keep it in IndexedDB
// rather than localStorage/projectConfig. The handle survives across sessions
// subject to the browser re-granting permission.
// ============================================================================
// SaveFs — extracted to core_modules.js (Phase 76; byte-identical, loaded before this file).

// Save a jsPDF doc through SaveFs (default-dir / picker / download fallback).
// Falls back to doc.save() if SaveFs isn't available for some reason.
// [P2 batch 4] L18063-18086 moved verbatim to helpers_modules.js

// ============================================================================
// Phase 52 — Excel import (3 layers)
// ----------------------------------------------------------------------------
// Layer 1: sheet-name → tool-kind via alias dictionary (SHEET_ALIASES)
// Layer 2: column-header → tool-field via per-kind alias dictionary (FIELD_ALIASES)
// Layer 3: a mapping dialog the user can override before commit; mappings can
//          be saved as a localStorage template keyed by a sheet-name fingerprint.
//
// Public surface:
//   ExcelImport.onFilePicked(event)   — triggered by the hidden <input type=file>
//   ExcelImport.runImport()           — confirm button in the dialog
//   ExcelImport.closeDialog()         — cancel button
//
// Lifecycle:
//   pick file → parse → build ImportPlan → render dialog (auto-routed) →
//   user reviews / overrides → runImport() mutates data arrays + re-renders.
// ============================================================================
// [P2 batch 5] L9293-9293 moved verbatim to bindings_modules.js
// [P2 batch 2] L23726-23994 moved verbatim to data_ops_modules.js
window._stampBetaFooter = _stampBetaFooter;

// Resolve the {title, headers, rows} for a tabular module. Returns null for non-tabular
// modules (Dashboard, FTA, Graph, Markov, Validation) — handled separately.
// [P2 batch 2] L23999-24457 moved verbatim to data_ops_modules.js

// Route 'pdf' format through the new exporter (replaces the CSV-degradation path).
(function patchExportData(){
    if (typeof window.exportData !== 'function') return;
    const _orig = window.exportData;
    window.exportData = function(moduleName, format) {
        if (format === 'pdf') return exportTabAsPDF(moduleName);
        return _orig.call(this, moduleName, format);
    };
})();

// ----- 5.3 Sample / demo project -----
// Sample-project chooser — loads one of the two bundled worked examples (SV-7 conventional
// twin, ES-9 electric eSTOL) from window.SL_DEMOS (demo_projects.js). Replaces the old
// inline uSTOL sample (_buildSampleProject, now unused).
// [P2 batch 2] L24473-24996 moved verbatim to data_ops_modules.js

// ----- Update updateD3 to show / hide the FTA empty state. -----
// Wrap updateD3 once, after initial declaration. Cache the DOM ref and avoid redundant
// style mutations so this wrap stays cheap on every render (6.1 perf tuning).
(function(){
    const orig = window.updateD3 || updateD3;
    if(typeof orig !== 'function') return;
    let _emptyStateEl = null;
    let _lastEmptyDisplay = null;
    window.updateD3 = function(){
        const r = orig.apply(this, arguments);
        if(!_emptyStateEl) _emptyStateEl = document.getElementById('fta-empty-state');
        if(_emptyStateEl) {
            const root = (typeof getActiveFTARoot === 'function') ? getActiveFTARoot() : null;
            const target = root ? 'none' : 'flex';
            if(_lastEmptyDisplay !== target) {
                _emptyStateEl.style.display = target;
                _lastEmptyDisplay = target;
            }
        }
        return r;
    };
})();

// ==========================================
// Phase 8: Math Validation — every engine validated against canonical references
// ==========================================
// Each benchmark is { id, name, source, citation, category, expected, tolerance, run }
// where run() returns { computed, [detail] } and tolerance is absolute or relative.

// [P2 batch 5] L9346-9346 moved verbatim to bindings_modules.js

// Tiny tree helpers used by the benchmark runners — pure, no project mutation.
// [P2 batch 5] L9349-9349 moved verbatim to bindings_modules.js
// [P2 batch 6] L7833-7843 moved verbatim to misc_fn_modules.js

// [P2 batch 5] L9362-9789 moved verbatim to bindings_modules.js

// [P2 batch 2] L25472-25691 moved verbatim to data_ops_modules.js
window._toggleBenchmarkRow = _toggleBenchmarkRow;

// [P2 batch 4] L18606-18701 moved verbatim to helpers_modules.js

window.onload = function() {
    try {
        initThemeFromStorage();
        initNewProjectState();
        initD3();
        // Phase 53.45 — restore the last fault-tree mode the user had (top-down vs bottom-up)
        // BEFORE switchTab so the FTA toolbar reflects it on first paint.
        try {
            const savedMode = localStorage.getItem(_UI_FTA_MODE_KEY);
            if (savedMode === 'top-down' || savedMode === 'bottom-up') {
                ftaConfig.mode = savedMode;
                const sel = document.getElementById('fta-calc-mode');
                if (sel) sel.value = savedMode;
            }
            // Phase 56.47 — restore apportion choice (equal vs weighted) so the
            // user's selection survives refresh.
            const savedApportion = localStorage.getItem(_UI_FTA_APPORTION_KEY);
            if (savedApportion === 'equal' || savedApportion === 'weighted') {
                ftaConfig.apportion = savedApportion;
                const aSel = document.getElementById('fta-apportion');
                if (aSel) aSel.value = savedApportion;
            }
        } catch(_) {}
        // Phase 53.45 — restore the last tab the user was on; fall back to dashboard if missing
        // or invalid. createNewProject / loadProject still force dashboard explicitly when they
        // run, which is the right semantics for a fresh project.
        let initialTab = 'dashboard';
        try {
            const savedTab = localStorage.getItem(_UI_LAST_TAB_KEY);
            const validTabs = ['dashboard', 'defs', 'ac-func', 'ac-fcim', 'phases', 'ac-fha', 'ac-req', 'ac-asm', 'sys-dir', 'sys-workspace', 'pra', 'zsa', 'cma', 'fmea', 'fta', 'library', 'markov', 'validation', 'trace', 'graph', 'moc', 'baselines', 'cm', 'review'];
            if (savedTab && validTabs.indexOf(savedTab) >= 0) initialTab = savedTab;
        } catch(_) {}
        switchTab(initialTab);
        renderFlightPhases();
        renderFTASidebar();
        checkAutosaveRecovery();
        _wrapForUndoAndAutosave();
        maybeShowWelcomeOnLoad();
        _updateSaveIndicator('saved');
        // Initial empty-state display
        const es = document.getElementById('fta-empty-state');
        if(es) es.style.display = getActiveFTARoot() ? 'none' : 'flex';
        // Phase 42 — beta expiry check + build-info readout.
        checkBetaExpiry();
        renderBetaBuildInfo();
    } catch (err) { console.error(err); }
};

// =====================================================================
// Phase 42 — Beta expiry / build-info / feedback helpers.
// =====================================================================

// Show a non-blocking banner if the build is past BUILD_EXPIRES_AT.
// [P2 batch 6] L7905-7922 moved verbatim to misc_fn_modules.js
window.checkBetaExpiry = checkBetaExpiry;

// Render the small build-info chip in the global header. Visible at all times so
// every tester knows which build they're using and when it expires.
// [P2 batch 6] L7927-7946 moved verbatim to misc_fn_modules.js
window.renderBetaBuildInfo = renderBetaBuildInfo;

// Open a pre-filled mailto: feedback email. Subject includes build ID for triage.
// [P2 batch 5] L9894-9907 moved verbatim to bindings_modules.js

// Global keyboard handler: Escape exits FTA fullscreen; Ctrl/Cmd+C/V drives FTA copy/paste
// only when the FTA tab is active and the user isn't typing in a form field.
window.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && document.body.classList.contains('fta-fullscreen')) {
        toggleFTAFullscreen();
        return;
    }
    const ftaView = document.getElementById('view-fta');
    if (!ftaView || ftaView.style.display === 'none') return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        copySelectedBranch();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'v' || e.key === 'V')) {
        // Phase 56.51 — Cmd+Shift+V = Paste Special (force the mode-choice modal)
        e.preventDefault();
        pasteSpecial();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        pasteAsChild();
    }
});

// ============================================================================
// Phase 14.2-3 — Back-reference side panel
// Phase 53.56 — extended with History tab for requirements.
// ============================================================================
// [P2 batch 5] L9937-9937 moved verbatim to bindings_modules.js
// [P2 batch 5] L9938-9938 moved verbatim to bindings_modules.js

// [P2 batch 5] L9940-9969 moved verbatim to bindings_modules.js

// Phase 53.56 — convenience entry point that opens the panel straight to the History tab.
// [P2 batch 5] L9972-9981 moved verbatim to bindings_modules.js

// [P2 batch 5] L9983-9992 moved verbatim to bindings_modules.js

// [P2 batch 2] L25989-26306 moved verbatim to data_ops_modules.js

// [P2 batch 5] L9996-10005 moved verbatim to bindings_modules.js

// jumpToArtifact — switches tabs, sets active system if needed, scrolls to the row.
// [P2 batch 5] L10008-10043 moved verbatim to bindings_modules.js

// [P2 batch 6] L7997-8071 moved verbatim to misc_fn_modules.js

// [P2 batch 5] L10201-10210 moved verbatim to bindings_modules.js

// [P2 batch 5] L10212-10220 moved verbatim to bindings_modules.js

// [P2 batch 5] L10222-10247 moved verbatim to bindings_modules.js

// [P2 batch 5] L10249-10254 moved verbatim to bindings_modules.js
// [P2 batch 5] L10255-10260 moved verbatim to bindings_modules.js
// [P2 batch 5] L10261-10267 moved verbatim to bindings_modules.js

// Helper for table rows to drop the 💬N trigger button.
// [P2 batch 4] L19215-19250 moved verbatim to helpers_modules.js

// ============================================================================
// Phase 14.4 — Command palette (Cmd-K / Ctrl-K)
// ============================================================================
// [P2 batch 5] L10275-10294 moved verbatim to bindings_modules.js

let _palActiveIdx = 0;
let _palCurrentItems = [];

window.openCmdPalette = function() {
    const overlay = document.getElementById('cmd-palette-overlay');
    const input = document.getElementById('cmd-palette-input');
    if (!overlay || !input) return;
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    input.value = '';
    _renderCmdPaletteResults('');
    setTimeout(() => input.focus(), 30);
};
window.closeCmdPalette = function() {
    const overlay = document.getElementById('cmd-palette-overlay');
    if (!overlay) return;
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
};

// [P2 batch 4] L19296-19339 moved verbatim to helpers_modules.js
window.cmdPaletteSelect = function(idx) {
    const item = _palCurrentItems[idx];
    if (!item) return;
    closeCmdPalette();
    if (item.kind === 'nav') {
        if (typeof switchTab === 'function') switchTab(item.tab);
    } else {
        jumpToArtifact(item);
    }
};
// [P2 batch 6] L8122-8127 moved verbatim to misc_fn_modules.js
// Global key handler for Cmd-K + palette navigation.
document.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('cmd-palette-overlay');
    const isOpen = overlay && overlay.classList.contains('show');
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (isOpen) closeCmdPalette();
        else openCmdPalette();
        return;
    }
    if (!isOpen) return;
    if (e.key === 'Escape') {
        e.preventDefault();
        closeCmdPalette();
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        _palActiveIdx = Math.min(_palActiveIdx + 1, _palCurrentItems.length - 1);
        _updatePalActive();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        _palActiveIdx = Math.max(_palActiveIdx - 1, 0);
        _updatePalActive();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        cmdPaletteSelect(_palActiveIdx);
    }
});
// Input handler — debounced re-render.
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('cmd-palette-input');
    if (!input) return;
    let timer = null;
    input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => _renderCmdPaletteResults(input.value || ''), 80);
    });
    // Escape from input closes palette.
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); closeCmdPalette(); }
    });
});

// ============================================================================
// #45 — Keyboard shortcuts cheat-sheet + persistent launcher (promote ⌘K).
// Lists only verified, wired shortcuts. Opens with "?", the launcher, or the
// palette's "? shortcuts" hint. Uses the .modal-overlay backdrop (free Esc-close).
// ============================================================================
// [P2 batch 5] L10380-10401 moved verbatim to bindings_modules.js
// [P2 batch 6] L8176-8192 moved verbatim to misc_fn_modules.js
window.openShortcutsHelp = function() {
    const ov = document.getElementById('shortcuts-overlay');
    if (!ov) return;
    _renderShortcutsBody();
    ov.style.display = 'flex';                 // override any prior inline display:none (Esc handler)
    ov.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => ov.classList.add('show'));
};
window.closeShortcutsHelp = function() {
    const ov = document.getElementById('shortcuts-overlay');
    if (!ov) return;
    ov.classList.remove('show');
    ov.setAttribute('aria-hidden', 'true');
    setTimeout(() => { ov.style.display = 'none'; }, 250);
};
document.addEventListener('DOMContentLoaded', () => {
    // Backdrop click closes the sheet.
    const ov = document.getElementById('shortcuts-overlay');
    if (ov) ov.addEventListener('click', e => { if (e.target === ov) closeShortcutsHelp(); });
    // Persistent launcher (bottom-right, stacked above the feedback FAB) — promotes ⌘K + shortcuts.
    if (!document.getElementById('shortcuts-fab')) {
        const wrap = document.createElement('div');
        wrap.id = 'shortcuts-fab';
        const modLabel = _shortcutMod() === '⌘' ? '⌘K' : 'Ctrl K';
        wrap.innerHTML =
            '<button type="button" id="fab-cmdk" aria-label="Open command palette" title="Command palette — jump to any view or artifact">' + modLabel + '</button>'
          + '<button type="button" id="fab-help" title="Keyboard shortcuts" aria-label="Keyboard shortcuts">?</button>';
        document.body.appendChild(wrap);
        const c = document.getElementById('fab-cmdk');
        const h = document.getElementById('fab-help');
        if (c) c.addEventListener('click', () => { try { openCmdPalette(); } catch (_) {} });
        if (h) h.addEventListener('click', () => { try { openShortcutsHelp(); } catch (_) {} });
    }
});

// ============================================================================
// Phase 14.5 — Worklist Dashboard
// Replaces (augments) the existing updateDashboard() with an actionable list.
// ============================================================================
// [P2 batch 4] L19481-19549 moved verbatim to helpers_modules.js

// Jump from a worklist row → artifact tab + open the review panel on that artifact.
// [P2 batch 5] L10461-10467 moved verbatim to bindings_modules.js

// Map a review target back to a jump descriptor that jumpToArtifact understands.
// [P2 batch 2] L26966-27124 moved verbatim to data_ops_modules.js

// Open the side panel for whatever artifact `commentId` belongs to. Used by the
// summary row's "Open thread" button (commentId is just a stable handle into the
// row's target — any comment on the artifact works).
// [P2 batch 5] L10475-10479 moved verbatim to bindings_modules.js

// Reviewer name input is mirrored to localStorage so the user only types it once.
// [P2 batch 5] L10482-10484 moved verbatim to bindings_modules.js

// Wire worklist into the existing updateDashboard via a small monkey-patch — we don't
// want to disturb the chart-rendering code, so we just call renderWorklist() after it.
(function patchDashboard(){
    if (typeof window.updateDashboard !== 'function') return;
    const _origUpdateDashboard = window.updateDashboard;
    window.updateDashboard = function() {
        const r = _origUpdateDashboard.apply(this, arguments);
        try { renderWorklist(); } catch(e){ console.warn('renderWorklist:', e); }
        try { renderDashboardActivityPanel(); } catch(e){ console.warn('renderDashboardActivityPanel:', e); }
        return r;
    };
})();

// ============================================================================
// Phase 51 — Dashboard activity baseline ("since last Dashboard PDF download")
// ----------------------------------------------------------------------------
// Captures the verification state of every requirement and assumption at the
// moment a Dashboard PDF is exported (or the user clicks "Reset baseline").
// Subsequent renders diff current state vs the baseline to surface what's
// changed since the last status snapshot was shared.
// ============================================================================

// [P2 batch 4] L19599-19727 moved verbatim to helpers_modules.js

// [P2 batch 5] L10510-10514 moved verbatim to bindings_modules.js

// ============================================================================
// Phase 14.6 — Collapsible form helper
// Wraps an existing form region inside a togglable container. Idempotent.
// Call wrapFormCollapsible(viewId, formSelector, opts) once per form on first render.
// ============================================================================
// [P2 batch 4] L19740-19787 moved verbatim to helpers_modules.js
document.addEventListener('DOMContentLoaded', applyCollapsibleForms);

// ============================================================================
// Phase 14.7 — Active-system breadcrumb on sys-workspace
// Inserts a persistent strip showing the active system and a quick switcher.
// ============================================================================
// [P2 batch 6] L8286-8316 moved verbatim to misc_fn_modules.js
// Wrap switchWorkspaceTab to refresh the breadcrumb whenever we land on a sys sub-tab.
(function patchWsTab(){
    if (typeof window.switchWorkspaceTab !== 'function') return;
    const _orig = window.switchWorkspaceTab;
    window.switchWorkspaceTab = function() {
        const r = _orig.apply(this, arguments);
        try { updateSystemBreadcrumb(); } catch(e){}
        return r;
    };
})();
// Also wrap openSystemWorkspace to refresh on initial entry.
(function patchOpenSysWs(){
    if (typeof window.openSystemWorkspace !== 'function') return;
    const _orig = window.openSystemWorkspace;
    window.openSystemWorkspace = function() {
        const r = _orig.apply(this, arguments);
        try { updateSystemBreadcrumb(); } catch(e){}
        return r;
    };
})();

// ============================================================================
// Phase 14.9 — FTA canvas req-count badges — REMOVED 2026-06-28 (product decision:
// the per-node linked-requirement count badge was not useful). The feature was fully
// self-contained — _reqsForFtaNode() + annotateFtaNodesWithReqCounts() + an updateD3
// hook, plus the .node-req-badge / .node-req-badge-text CSS rules. Nothing else
// referenced it, so removal has no other effect. (Restore from chat history if needed.)
// ============================================================================

// ============================================================================
// Phase 14.8 — Filter chip helper for FHA / PRA / ZSA / Functions / FCIM
// We inject a small chip bar above each table that filters rows in place.
// ============================================================================
// [P2 batch 5] L10592-10592 moved verbatim to bindings_modules.js
// [P2 batch 6] L8351-8375 moved verbatim to misc_fn_modules.js
document.addEventListener('DOMContentLoaded', applyGenericFilters);

// ============================================================================
// Phase 14.10 — Bulk operations (Requirements + FMEA + CMA + PRA + ZSA)
// Selection model: window._bulkSel is a Set of "<viewId>:<internalId>" strings.
// ============================================================================
window._bulkSel = new Set();
// [P2 batch 6] L8383-8438 moved verbatim to misc_fn_modules.js
// MutationObserver — keep checkboxes in sync whenever a table is re-rendered.
(function setupBulkObserver(){
    document.addEventListener('DOMContentLoaded', () => {
        ['view-fmea', 'view-cma', 'view-pra', 'view-zsa', 'view-ac-req'].forEach(viewId => {
            const root = document.getElementById(viewId);
            if (!root) return;
            const obs = new MutationObserver(() => injectBulkCheckboxes(viewId));
            obs.observe(root, { childList: true, subtree: true });
        });
        applyBulkUI();
    });
})();

// ============================================================================
// Phase 14.11 — Network graph traceability viz
// Uses vis-network from CDN if available. Falls back to a lightweight SVG.
// ============================================================================
// [P2 batch 5] L10752-10801 moved verbatim to bindings_modules.js

// ============================================================================
// Phase 55.0.8 — AutoReq Templates settings UI
// Opens a modal that lets users override the text+rationale templates each
// AutoReq generator emits. Overrides are stored on the project (per-project,
// not per-org yet) and persist via the standard save/load round-trip.
// ============================================================================
(function () {
    'use strict';

    const GEN_DESCRIPTIONS = {
        'fha-prob':       'FHA → Probabilistic safety target (quantitative branch)',
        'fha-qualitative':'FHA → Qualitative assessment requirement',
        'fha-similarity': 'FHA → Similarity-argument requirement',
        'fha-dal':        'FHA → Per-function FDAL allocation',
        'fta-event':      'FTA basic event → Reliability allocation',
        'fta-interval':   'FTA basic event → Maintenance interval (CMR candidate)',
        'dalgebra':       'DALgebra carrier node → FDAL/IDAL allocation',
        'dalgebra-default': 'DALgebra → Default DAL statement (compressed mode)',
        'gate-indep-and': 'AND gate → Functional independence claim',
        'gate-indep-dev': 'AND gate → Development independence (DAL reduction predicate)',
        'gate-indep-phys':'AND gate → Physical separation (Catastrophic top)',
        'gate-indep-ccf-lib':   'AND gate → Dissimilarity (shared library entry)',
        'gate-indep-ccf-group': 'AND gate → Common-cause control (declared CCF group)',
        'gate-indep-cma': 'CMA common mode → Preclusion requirement',
        'gate-indep-or':  'OR gate → No-single-failure claim',
        'pra-zonal':      'PRA hazard → Zonal protection requirement',
        'zsa-separation': 'ZSA zone → Housed-function separation requirement',
        'zsa-phys':       'ZSA Catastrophic zone → Physical separation requirement'
    };
    const GEN_ORDER = [
        'fha-prob', 'fha-qualitative', 'fha-similarity', 'fha-dal',
        'fta-event', 'fta-interval', 'dalgebra', 'dalgebra-default',
        'gate-indep-and', 'gate-indep-dev', 'gate-indep-phys',
        'gate-indep-ccf-lib', 'gate-indep-ccf-group', 'gate-indep-cma',
        'gate-indep-or',
        'pra-zonal', 'zsa-separation', 'zsa-phys'
    ];

    function _esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    function open() {
        const modal = document.getElementById('ar-tmpl-modal');
        if (!modal) return;
        const list = document.getElementById('ar-tmpl-list');
        if (!list) return;
        const overrides = (window.autoReqTemplateOverrides && typeof window.autoReqTemplateOverrides === 'object')
            ? window.autoReqTemplateOverrides : {};
        list.innerHTML = GEN_ORDER.map(g => {
            const cur = overrides[g] || {};
            const tx = cur.text || '';
            const rt = cur.rat  || '';
            return `
                <div data-gen="${_esc(g)}" style="border:1px solid var(--border-primary, rgba(127,127,127,0.25)); border-radius:10px; padding:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <strong style="font-size:13px;">${_esc(GEN_DESCRIPTIONS[g] || g)}</strong>
                        <code style="font-size:11px; opacity:0.65;">${_esc(g)}</code>
                    </div>
                    <label style="font-size:11.5px; opacity:0.8; margin:6px 0 3px; display:block;">Text template (empty = default)</label>
                    <textarea class="ar-tmpl-text" rows="2" style="width:100%; box-sizing:border-box; font:13px var(--font-mono, monospace); padding:8px;" placeholder="Leave empty to use default. Example: [SR-\${context.fcId}] \${text}">${_esc(tx)}</textarea>
                    <label style="font-size:11.5px; opacity:0.8; margin:8px 0 3px; display:block;">Rationale template (empty = default)</label>
                    <textarea class="ar-tmpl-rat" rows="2" style="width:100%; box-sizing:border-box; font:13px var(--font-mono, monospace); padding:8px;" placeholder="Leave empty to use default. Example: \${rat} (Internal: \${context.fcId})">${_esc(rt)}</textarea>
                </div>
            `;
        }).join('');
        modal.style.display = 'flex';
    }
    function close() {
        const modal = document.getElementById('ar-tmpl-modal');
        if (modal) modal.style.display = 'none';
    }
    function save() {
        const list = document.getElementById('ar-tmpl-list');
        if (!list) return close();
        const newOverrides = {};
        list.querySelectorAll('[data-gen]').forEach(card => {
            const g = card.getAttribute('data-gen');
            const tx = (card.querySelector('.ar-tmpl-text') || {}).value || '';
            const rt = (card.querySelector('.ar-tmpl-rat')  || {}).value || '';
            const text = tx.trim();
            const rat  = rt.trim();
            if (text || rat) {
                newOverrides[g] = {};
                if (text) newOverrides[g].text = text;
                if (rat)  newOverrides[g].rat  = rat;
            }
        });
        try {
            if (typeof autoReqTemplateOverrides !== 'undefined') {
                Object.keys(autoReqTemplateOverrides).forEach(k => delete autoReqTemplateOverrides[k]);
                Object.assign(autoReqTemplateOverrides, newOverrides);
            }
            window.autoReqTemplateOverrides = newOverrides;
        } catch (_) {}
        close();
        try { if (typeof showToast === 'function') showToast('AutoReq templates saved. Re-run generation to apply.', 'success'); } catch(_) {}
    }
    function resetAll() {
        if (!confirm('Clear all template overrides? AutoReq generators will revert to default wording.')) return;
        try {
            if (typeof autoReqTemplateOverrides !== 'undefined') {
                Object.keys(autoReqTemplateOverrides).forEach(k => delete autoReqTemplateOverrides[k]);
            }
            window.autoReqTemplateOverrides = {};
        } catch (_) {}
        open();   // re-render with cleared state
    }

    // Wire close/save/cancel buttons once the DOM is ready.
    function _wire() {
        const closeBtn  = document.getElementById('ar-tmpl-close');
        const cancelBtn = document.getElementById('ar-tmpl-cancel');
        const saveBtn   = document.getElementById('ar-tmpl-save');
        const resetBtn  = document.getElementById('ar-tmpl-reset-all');
        const modal     = document.getElementById('ar-tmpl-modal');
        if (closeBtn)  closeBtn.addEventListener('click', close);
        if (cancelBtn) cancelBtn.addEventListener('click', close);
        if (saveBtn)   saveBtn.addEventListener('click', save);
        if (resetBtn)  resetBtn.addEventListener('click', resetAll);
        if (modal)     modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _wire);
    else _wire();

    window.SafetyLab = window.SafetyLab || {};
    window.SafetyLab.autoReqTemplates = { open, close, save, resetAll };
})();

/* ============================================================================
 * Phase 56 — Report Generation Engine (Batch 2)
 * ----------------------------------------------------------------------------
 * Builds the 9 ARP 4761A artifacts (AFHA, PASA, SFHA, PSSA, SSA, ASA, ZSA,
 * PRA, CMA) from current project data and exports as either a Word document
 * or a PDF. Each report type ships with a built-in default markdown template,
 * and users can optionally upload a customer-branded .docx where {{tokens}}
 * get substituted while the template's styling is preserved.
 *
 * Public surface (everything reachable from window.Reports):
 *   Reports.open(reportType, opts)   — show modal pre-selected to a type
 *   Reports.generate(args)           — programmatic one-shot generation
 *   Reports.REPORT_DEFS              — registry (read-only inspection)
 *
 * Default markdown templates live in DEFAULT_TEMPLATES. Tokens supported:
 *   {{aircraft_name}} {{system_name}} {{cert_basis}} {{date}} {{project_name}}
 *   {{fha_table}} {{requirements_table}} {{assumptions_list}} {{fta_summary}}
 *   {{component_list}} {{pra_table}} {{zsa_table}} {{cma_table}}
 *   {{appendix:fta}} {{appendix:zsa}} {{appendix:pra}} {{appendix:cma}}
 * ========================================================================= */

// [P2 batch 5] L10955-10955 moved verbatim to bindings_modules.js
// [P2 batch 6] L8611-8653 moved verbatim to misc_fn_modules.js
(function() {
    'use strict';
    if (typeof window === 'undefined') return;
    const GATE_ID = 'sl-paywall-screen';
    const STYLE_ID = 'sl-paywall-styles';
    const STRIPE_CHECKOUT_BASE = 'https://buy.stripe.com/'; // user supplies real Stripe Payment Link IDs
    const PAYWALL_PRICING = {
        // Phase 56.33 — Education tier is free, intentionally. Students who use
        // Safety Lab Aero in their thesis work become OEM safety engineers in 5-10
        // years; academic citations build credibility you can't buy; marginal
        // cost of serving them is near zero (no AI proxy, no priority support).
        // Verified .edu / .ac.* domain gating still applies on signup.
        edu:        { label: 'Education',  price: 0,   period: 'forever', desc: 'Verified .edu / academic — free, forever',
                      stripeId: null, cta: 'Sign up — Free' },
        pro:        { label: 'Pro',        price: 1500, period: 'month', desc: 'Working safety engineers — individual seat',
                      stripeId: '8x24gy2ZjeAP27n4xn93y00', cta: 'Subscribe — $1,500/mo' },
        'pro-plus': { label: 'Pro+',       price: 2500, period: 'month', desc: 'AI assistant + DO-330 kit + everything in Pro',
                      stripeId: 'bJe9AS8jD8crdQ5d3T93y01', cta: 'Subscribe — $2,500/mo' },
        enterprise: { label: 'Enterprise', price: null, period: 'custom', desc: 'Multi-seat, ITAR routing, on-prem deployment',
                      stripeId: null, cta: 'Contact sales' },
    };

    function _ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = [
            '#' + GATE_ID + ' { position: fixed; inset: 0; z-index: 2147483500; background: rgba(15,23,42,0.94); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; }',
            '#' + GATE_ID + ' .pw-card { background: #fff; color: #111; border-radius: 16px; width: min(860px, 94vw); max-height: 92vh; overflow-y: auto; padding: 32px 36px 28px; box-shadow: 0 30px 80px rgba(0,0,0,0.5); }',
            '@media (prefers-color-scheme: dark) { #' + GATE_ID + ' .pw-card { background: #1c1c1e; color: #f2f2f7; } }',
            '#' + GATE_ID + ' h1 { font-size: 24px; font-weight: 600; margin: 0 0 6px; }',
            '#' + GATE_ID + ' p.pw-lead { margin: 0 0 22px; opacity: 0.8; line-height: 1.5; font-size: 14px; }',
            '#' + GATE_ID + ' .pw-tier-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-bottom: 22px; }',
            '#' + GATE_ID + ' .pw-tier-card { border: 1px solid rgba(127,127,127,0.25); border-radius: 12px; padding: 16px 18px; display: flex; flex-direction: column; gap: 8px; background: rgba(127,127,127,0.04); }',
            '#' + GATE_ID + ' .pw-tier-card.featured { border-color: #3b82f6; box-shadow: 0 4px 16px rgba(59,130,246,0.18); }',
            '#' + GATE_ID + ' .pw-tier-name { font-size: 13px; font-weight: 600; opacity: 0.9; text-transform: uppercase; letter-spacing: 0.5px; }',
            '#' + GATE_ID + ' .pw-tier-price { font-size: 26px; font-weight: 700; }',
            '#' + GATE_ID + ' .pw-tier-price small { font-size: 13px; font-weight: 500; opacity: 0.65; }',
            '#' + GATE_ID + ' .pw-tier-desc { font-size: 12.5px; opacity: 0.75; line-height: 1.45; min-height: 36px; }',
            '#' + GATE_ID + ' .pw-tier-btn { margin-top: 6px; padding: 10px 14px; border-radius: 8px; border: none; background: #3b82f6; color: #fff; font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; text-decoration: none; text-align: center; }',
            '#' + GATE_ID + ' .pw-tier-btn:hover { background: #2563eb; }',
            '#' + GATE_ID + ' .pw-tier-btn.secondary { background: rgba(127,127,127,0.2); color: inherit; }',
            '#' + GATE_ID + ' .pw-tier-btn.secondary:hover { background: rgba(127,127,127,0.3); }',
            '#' + GATE_ID + ' .pw-foot { display: flex; justify-content: space-between; align-items: center; padding-top: 14px; border-top: 1px solid rgba(127,127,127,0.18); font-size: 12px; opacity: 0.7; gap: 12px; flex-wrap: wrap; }',
            '#' + GATE_ID + ' .pw-foot a { color: #3b82f6; text-decoration: none; }',
            '#' + GATE_ID + ' .pw-foot a:hover { text-decoration: underline; }',
            '#sl-paywall-banner { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 2147483400; background: rgba(217,119,6,0.96); color: #fff; padding: 8px 16px; border-radius: 999px; font: 12.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; font-weight: 600; box-shadow: 0 6px 20px rgba(0,0,0,0.25); display: flex; align-items: center; gap: 10px; cursor: pointer; }',
            '#sl-paywall-banner:hover { filter: brightness(1.05); }',
            '#sl-paywall-banner .pw-banner-cta { background: rgba(255,255,255,0.2); padding: 3px 10px; border-radius: 999px; font-size: 11.5px; }',
        ].join('\n');
        document.head.appendChild(s);
    }

    function _renderPaywallScreen() {
        _ensureStyles();
        if (document.getElementById(GATE_ID)) return;
        const email = (function() { try { return localStorage.getItem('safetyLab.signup.email') || ''; } catch(_) { return ''; } })();
        const gate = document.createElement('div');
        gate.id = GATE_ID;
        const tierCards = Object.entries(PAYWALL_PRICING).map(([key, t]) => {
            const featured = key === 'pro' ? 'featured' : '';
            let priceHtml;
            if (t.price == null) {
                priceHtml = '<div class="pw-tier-price">Custom <small>contact</small></div>';
            } else if (t.price === 0) {
                // Phase 56.33 — free tier displays "Free / forever" rather than "$0".
                priceHtml = '<div class="pw-tier-price">Free <small>/' + t.period + '</small></div>';
            } else {
                priceHtml = '<div class="pw-tier-price">$' + t.price + ' <small>/' + t.period + '</small></div>';
            }
            let btn;
            if (t.stripeId) {
                btn = '<button class="pw-tier-btn" onclick="window.SafetyLab._paywallSubscribe(\'' + key + '\')">' + t.cta + '</button>';
            } else if (key === 'edu') {
                // Phase 56.33 — free EDU; the path is "sign out, sign back in with
                // a verified academic email." The button surfaces that explanation.
                btn = '<button class="pw-tier-btn secondary" onclick="alert(\'Sign out and sign back in with a verified .edu or academic (.ac.*) email address to access the free Education tier.\')">' + t.cta + '</button>';
            } else {
                btn = '<a class="pw-tier-btn" href="mailto:waqas.nafees@safetylabaero.com?subject=Safety%20Lab%20Aero%20Enterprise%20-%20Inquiry">' + t.cta + '</a>';
            }
            return [
                '<div class="pw-tier-card ' + featured + '">',
                '  <div class="pw-tier-name">' + t.label + '</div>',
                priceHtml,
                '  <div class="pw-tier-desc">' + t.desc + '</div>',
                btn,
                '</div>',
            ].join('');
        }).join('');
        gate.innerHTML = [
            '<div class="pw-card">',
            '  <h1>Subscribe to continue using Safety Lab Aero</h1>',
            '  <p class="pw-lead">Your trial has ended. Pick a plan to unlock the full workspace. Electra Aerospace and partnered organizations remain on free Pro+ — contact us if your team is being onboarded as a strategic partner.</p>',
            '  <div class="pw-tier-grid">' + tierCards + '</div>',
            '  <div class="pw-foot">',
            '    <span>Signed in as <strong>' + (email || '—') + '</strong></span>',
            '    <span><a href="#" onclick="window.SafetyLab._paywallSignOut(event)">Sign out</a> · <a href="mailto:waqas.nafees@safetylabaero.com">Need help?</a></span>',
            '  </div>',
            '</div>',
        ].join('');
        document.body.appendChild(gate);
    }

    function _renderTrialOrGrandfatherBanner() {
        _ensureStyles();
        // Remove any existing banner before rendering a fresh one (state may have changed).
        const existing = document.getElementById('sl-paywall-banner');
        if (existing) existing.remove();
        if (typeof isPaywalled !== 'function' || isPaywalled()) return; // paywall handles the blocked case
        let label = null;
        if (typeof isOnTrial === 'function' && isOnTrial()) {
            const days = (typeof getTrialDaysRemaining === 'function') ? getTrialDaysRemaining() : null;
            label = '⏳ Trial — ' + (days != null ? (days + ' day' + (days === 1 ? '' : 's') + ' left') : 'active');
        } else if (typeof isInGrandfatherWindow === 'function' && isInGrandfatherWindow()) {
            const days = (typeof getGrandfatherDaysRemaining === 'function') ? getGrandfatherDaysRemaining() : null;
            label = '⚠️ Subscribe before paywall — ' + (days != null ? (days + ' day' + (days === 1 ? '' : 's') + ' grace') : 'grace period active');
        }
        if (!label) return;
        const banner = document.createElement('div');
        banner.id = 'sl-paywall-banner';
        banner.innerHTML = '<span>' + label + '</span><span class="pw-banner-cta">Subscribe →</span>';
        banner.onclick = () => { _renderPaywallScreen(); };
        document.body.appendChild(banner);
    }

    function _subscribe(tierKey) {
        const t = PAYWALL_PRICING[tierKey];
        if (!t || !t.stripeId) {
            window.location.href = 'mailto:waqas.nafees@safetylabaero.com?subject=Safety%20Lab%20Aero%20Subscription%20-%20Inquiry';
            return;
        }
        // Stripe Payment Link format: https://buy.stripe.com/<link_id>
        // The placeholder IDs need to be replaced with real Stripe Payment Links once products
        // are configured. Falls back to a contact email so the flow never dead-ends.
        if (t.stripeId.startsWith('REPLACE_')) {
            window.location.href = 'mailto:waqas.nafees@safetylabaero.com?subject=Safety%20Lab%20Aero%20Subscription%20-%20' + encodeURIComponent(t.label);
            return;
        }
        window.location.href = STRIPE_CHECKOUT_BASE + t.stripeId;
    }
    function _signOut(e) {
        if (e && e.preventDefault) e.preventDefault();
        try {
            const keys = ['safetyLab.signup.email','safetyLab.signup.name','safetyLab.signup.org','safetyLab.signup.signupDate','safetyLab.license.tier','safetyLab.license.trialStartedAt','safetyLab.license.trialTarget'];
            keys.forEach(k => localStorage.removeItem(k));
        } catch(_) {}
        window.location.reload();
    }

    window.SafetyLab = window.SafetyLab || {};
    window.SafetyLab._paywallSubscribe = _subscribe;
    window.SafetyLab._paywallSignOut = _signOut;
    window.SafetyLab._renderPaywall = _renderPaywallScreen;
    window.SafetyLab._renderTrialBanner = _renderTrialOrGrandfatherBanner;
    window.SafetyLab._recheckPaywall = function () { try { _check(); } catch(_) {} };

    function _check() {
        if (typeof isPaywalled === 'function' && isPaywalled()) {
            _renderPaywallScreen();
        } else {
            _renderTrialOrGrandfatherBanner();
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _check);
    else setTimeout(_check, 100);
})();


// =============================================================================
// Phase 56.16 — Edit modal scaffold + Requirements form canary
// =============================================================================
// Electra user feedback (2026-05-27): inline edit forms feel clunky/inconsistent
// across the app. We're introducing a centered-modal edit pattern, starting
// with the Aircraft and System Requirements forms as the canary. The form HTML
// is untouched; we wrap the existing edit/submit/cancel handlers to manage
// modal state and inject CSS that visually promotes the form to an overlay
// while in editing mode. Other forms (FHA, Assumption, FMEA, PRA, ZSA, CMA)
// will follow in Phase 2 once this canary is validated.
(function _initEditModalCanary(){
    'use strict';
    if (window._editModalInitDone) return;
    window._editModalInitDone = true;

    const FORMS = {
        'ac-req-form':  { cancelKey: 'acReq',  title: 'Edit Aircraft Requirement' },
        'sys-req-form': { cancelKey: 'sysReq', title: 'Edit System Requirement' },
    };

    // Phase 56.16b — full coverage. Maps the artifact edit-fn name → the
    // formConfigs key whose `fields` array lists this form's DOM IDs (used to
    // locate the form's .controls ancestor) → human-readable modal title.
    const EDIT_FN_BY_KEY = {
        // Aircraft Safety scope
        acFunc:   { editFn: 'editACFunction',   title: 'Edit Aircraft Function' },
        acFcim:   { editFn: 'editACFCIM',       title: 'Edit Aircraft FCIM Entry' },
        acFha:    { editFn: 'editACFHA',        title: 'Edit Aircraft FHA Row' },
        acReq:    { editFn: 'editACReq',        title: 'Edit Aircraft Requirement' },
        acAsm:    { editFn: 'editACAssumption', title: 'Edit Aircraft Assumption' },
        // Systems Safety scope
        sysFunc:  { editFn: 'editSysFunction',   title: 'Edit System Function' },
        sysFcim:  { editFn: 'editSysFCIM',       title: 'Edit System FCIM Entry' },
        sysFha:   { editFn: 'editSysFHA',        title: 'Edit System FHA Row' },
        sysReq:   { editFn: 'editSysReq',        title: 'Edit System Requirement' },
        sysAsm:   { editFn: 'editSysAssumption', title: 'Edit System Assumption' },
        // Common Cause Analysis
        pra:      { editFn: 'editPRA',           title: 'Edit Particular Risk' },
        zsa:      { editFn: 'editZSA',           title: 'Edit Zonal Safety Record' },
        cma:      { editFn: 'editCMA',           title: 'Edit Common-Mode Record' },
        // Safety Tools
        fmea:     { editFn: 'editFMEA',          title: 'Edit FMEA Row' },
        item:     { editFn: 'editItem',          title: 'Edit Item / LRU' },
    };

    // Fallback field IDs for keys whose forms are hand-rolled (not via makeCRUD),
    // so formConfigs[key] won't exist. Any field on the form works — we use it
    // only to walk up to the form's .controls ancestor.
    const FIELD_FALLBACK_BY_KEY = {
        acFha:  ['ac-fha-trace', 'ac-fha-fc-id', 'ac-fha-fc-desc'],
        sysFha: ['sys-fha-trace', 'sys-fha-fc-id', 'sys-fha-fc-desc'],
        pra:    ['pra-id', 'pra-title', 'pra-desc'],
        zsa:    ['zsa-id', 'zsa-title', 'zsa-zone'],
        cma:    ['cma-id', 'cma-title', 'cma-finding'],
        fmea:   ['fmea-component', 'fmea-function', 'fmea-failureMode', 'fmea-id'],
        item:   ['item-name', 'item-id', 'item-type'],
    };

    // Map well-known formIds we'll auto-assign so cancelEdit + scrim-click know
    // which cancelKey to pass back into the existing cancelEdit() function.
    const AUTO_FORM_ID_PREFIX = 'sl-edit-form-';
    function _formIdForKey(key) {
        return AUTO_FORM_ID_PREFIX + key;
    }

    function _findFormContainerForKey(key) {
        // 1. Preferred: walk up from a CRUD-registered field id.
        try {
            if (typeof formConfigs !== 'undefined' && formConfigs && formConfigs[key] && Array.isArray(formConfigs[key].fields)) {
                for (const fieldId of formConfigs[key].fields) {
                    const el = document.getElementById(fieldId);
                    if (el) {
                        const ctl = el.closest && el.closest('.controls');
                        if (ctl) return ctl;
                    }
                }
            }
        } catch (_) {}
        // 2. Fallback: try hand-coded field id list for hand-rolled forms.
        const fallback = FIELD_FALLBACK_BY_KEY[key];
        if (fallback) {
            for (const fieldId of fallback) {
                const el = document.getElementById(fieldId);
                if (el) {
                    const ctl = el.closest && el.closest('.controls');
                    if (ctl) return ctl;
                }
            }
        }
        return null;
    }

    function _ensureFormHasId(formEl, key) {
        if (!formEl.id) {
            formEl.id = _formIdForKey(key);
        }
        // Register so close-handlers know the right cancelKey.
        if (!FORMS[formEl.id]) {
            const meta = EDIT_FN_BY_KEY[key];
            FORMS[formEl.id] = {
                cancelKey: key,
                title: meta ? meta.title : 'Edit'
            };
        }
        return formEl.id;
    }

    function _openEditModalForKey(key) {
        const formEl = _findFormContainerForKey(key);
        if (!formEl) {
            console.warn('[edit-modal] no .controls container found for key', key);
            return;
        }
        const id = _ensureFormHasId(formEl, key);
        _openEditModal(id);
    }

    function _injectCSS() {
        if (document.getElementById('sl-edit-modal-style')) return;
        const css = `
            .sl-edit-modal-scrim {
                position: fixed; inset: 0;
                background: rgba(10, 17, 32, 0.55);
                z-index: 99998;
                opacity: 0;
                pointer-events: none;
                transition: opacity 140ms ease;
                backdrop-filter: blur(2px);
                -webkit-backdrop-filter: blur(2px);
            }
            .sl-edit-modal-scrim.show { opacity: 1; pointer-events: auto; }
            body.sl-edit-modal-open { overflow: hidden; }
            .controls.in-edit-modal {
                position: fixed !important;
                top: 50% !important; left: 50% !important;
                transform: translate(-50%, -50%) !important;
                width: min(820px, 92vw) !important;
                max-height: 86vh !important;
                overflow-y: auto !important;
                z-index: 99999 !important;
                background: var(--bg-container, var(--color-surface-1, #ffffff)) !important;
                border: 1px solid var(--color-border-hair, rgba(255,255,255,0.08)) !important;
                border-left: 4px solid #8b5cf6 !important;
                border-radius: 14px !important;
                box-shadow: 0 24px 70px rgba(0,0,0,0.55), 0 6px 18px rgba(0,0,0,0.35) !important;
                padding: 22px 28px 20px !important;
                margin: 0 !important;
                display: block !important;
                color: var(--text-primary, inherit) !important;
            }
            .controls.in-edit-modal::before {
                content: attr(data-edit-modal-title);
                display: block;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: var(--color-text-tertiary, #9ca3af);
                margin-bottom: 12px;
                padding-bottom: 10px;
                border-bottom: 1px solid var(--color-border-hair, rgba(255,255,255,0.08));
            }
            .controls.in-edit-modal .action-group {
                position: sticky;
                bottom: 0;
                background: var(--bg-container, var(--color-surface-1, #ffffff));
                padding-top: 12px;
                margin-top: 16px;
                border-top: 1px solid var(--color-border-hair, rgba(255,255,255,0.08));
                z-index: 1;
            }
            @media (max-width: 700px) {
                .controls.in-edit-modal { width: 96vw; padding: 18px; }
            }
        `;
        const style = document.createElement('style');
        style.id = 'sl-edit-modal-style';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function _ensureScrim() {
        let scrim = document.getElementById('sl-edit-modal-scrim');
        if (scrim) return scrim;
        scrim = document.createElement('div');
        scrim.id = 'sl-edit-modal-scrim';
        scrim.className = 'sl-edit-modal-scrim';
        scrim.addEventListener('click', _onScrimClick);
        document.body.appendChild(scrim);
        return scrim;
    }

    function _onScrimClick() {
        // Treat scrim click as Cancel — runs the existing cancelEdit path so
        // the form state cleans up like a normal cancel.
        const formId = document.body.dataset.slEditModalFormId;
        if (!formId) { _closeEditModal(); return; }
        const meta = FORMS[formId];
        if (meta && typeof window.cancelEdit === 'function') {
            window.cancelEdit(meta.cancelKey);
        } else {
            _closeEditModal();
        }
    }

    // Map of formId -> { parent, nextSibling } so we can restore the form's
    // original DOM position after the modal closes. Portaling into <body> is
    // necessary because any ancestor with `transform`, `filter`, or `perspective`
    // breaks `position: fixed` (it becomes relative to that ancestor, not the
    // viewport). The site uses transforms in several places, so the portal
    // approach is the only robust fix.
    const _portalAnchors = new Map();

    function _openEditModal(formId) {
        _injectCSS();
        const scrim = _ensureScrim();
        const form = document.getElementById(formId);
        if (!form) { console.warn('[edit-modal] form not found:', formId); return; }
        const meta = FORMS[formId] || { title: 'Edit' };
        form.setAttribute('data-edit-modal-title', meta.title);

        // Portal the form into <body> so position: fixed actually works.
        if (form.parentNode && form.parentNode !== document.body) {
            _portalAnchors.set(formId, { parent: form.parentNode, nextSibling: form.nextSibling });
            document.body.appendChild(form);
        }

        form.classList.add('in-edit-modal');
        scrim.classList.add('show');
        document.body.classList.add('sl-edit-modal-open');
        document.body.dataset.slEditModalFormId = formId;
        // Focus the first sensible input so keyboard users can start typing immediately.
        setTimeout(() => {
            const firstInput = form.querySelector('input[type="text"], textarea, select');
            if (firstInput && typeof firstInput.focus === 'function') firstInput.focus();
        }, 60);
    }

    function _closeEditModal() {
        const formId = document.body.dataset.slEditModalFormId;
        if (formId) {
            const form = document.getElementById(formId);
            if (form) {
                form.classList.remove('in-edit-modal');
                form.removeAttribute('data-edit-modal-title');
                // Restore the form to its original DOM position.
                const anchor = _portalAnchors.get(formId);
                if (anchor && anchor.parent) {
                    if (anchor.nextSibling && anchor.nextSibling.parentNode === anchor.parent) {
                        anchor.parent.insertBefore(form, anchor.nextSibling);
                    } else {
                        anchor.parent.appendChild(form);
                    }
                    _portalAnchors.delete(formId);
                }
            }
        }
        const scrim = document.getElementById('sl-edit-modal-scrim');
        if (scrim) scrim.classList.remove('show');
        document.body.classList.remove('sl-edit-modal-open');
        delete document.body.dataset.slEditModalFormId;
    }

    // ESC closes the modal via the existing cancel path so form state stays consistent.
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return;
        if (!document.body.classList.contains('sl-edit-modal-open')) return;
        _onScrimClick();
    });

    // Wrap edit handlers. The original handlers populate the form fields from
    // the record being edited; we open the modal right after so the user sees
    // the populated form immediately. The 'key' arg is the formConfigs CRUD key
    // (or matching key for hand-rolled forms) that locates the .controls form.
    function _wrapEditHandlerByKey(editFnName, key) {
        const orig = window[editFnName];
        if (typeof orig !== 'function') return;
        if (orig._slEditWrapped) return;
        const wrapped = function() {
            const result = orig.apply(this, arguments);
            try { _openEditModalForKey(key); } catch (err) { console.error('openEditModalForKey failed', err); }
            return result;
        };
        wrapped._slEditWrapped = true;
        window[editFnName] = wrapped;
    }

    // Wrap cancelEdit to close the modal whenever ANY artifact's edit mode is
    // canceled (which also fires after CRUD submit since makeCRUD's submit
    // calls cancelEdit(key) at the end of a successful save).
    function _wrapCancelEdit() {
        const orig = window.cancelEdit;
        if (typeof orig !== 'function') return;
        if (orig._slEditWrapped) return;
        const wrapped = function(key) {
            const result = orig.apply(this, arguments);
            try { _closeEditModal(); } catch (err) { console.error('closeEditModal failed', err); }
            return result;
        };
        wrapped._slEditWrapped = true;
        // 20 Aug 2026 — keep every prior wrapper's idempotence marker (see fn_wrap.js).
        try { if (window.SLWrap) SLWrap.preserve(orig, wrapped); } catch (_) {}
        window.cancelEdit = wrapped;
    }

    // Wrap a known submit-fn name to close the modal on save, for the few
    // forms that don't route their save path through cancelEdit (hand-rolled
    // editors). This is belt-and-suspenders — most save paths already close
    // via the cancelEdit wrap above.
    function _wrapSubmitFn(name) {
        const orig = window[name];
        if (typeof orig !== 'function') return;
        if (orig._slEditWrapped) return;
        const wrapped = function() {
            const result = orig.apply(this, arguments);
            try { _closeEditModal(); } catch (err) { console.error('closeEditModal failed', err); }
            return result;
        };
        wrapped._slEditWrapped = true;
        // 20 Aug 2026 — carry the undo/autosave marker across this wrap.
        // This module installs on a setTimeout, i.e. AFTER _wrapForUndoAndAutosave has run at
        // DOMContentLoaded, so `orig` here is usually the undo wrapper. Behaviour was fine —
        // calling through still pushes undo and schedules the autosave — but the FLAG was
        // dropped, which broke two things:
        //   • _wrapForUndoAndAutosave's idempotence guard is `if (fn._wrappedForUndo) return`.
        //     With the marker gone, a second wrap pass would wrap the wrapper and every one of
        //     these actions would push undo TWICE and autosave twice. Latent only because the
        //     wrap currently runs once — and this module deliberately re-installs at 50ms,
        //     500ms and 2000ms, so "runs once" is not a property anyone is maintaining.
        //   • it made the coverage impossible to verify: submitACFHA read as unwrapped on
        //     production while demonstrably still saving. Found by the runtime smoke gate;
        //     none of the 159 static suites can see a function identity swapped at runtime.
        if (orig._wrappedForUndo) wrapped._wrappedForUndo = true;
        // 20 Aug 2026 — keep every prior wrapper's idempotence marker (see fn_wrap.js).
        try { if (window.SLWrap) SLWrap.preserve(orig, wrapped); } catch (_) {}
        window[name] = wrapped;
    }

    function _install() {
        _injectCSS();

        // Wrap every artifact's edit handler. Missing functions are silently
        // skipped (no-op), so the install stays safe across builds where some
        // artifact modules might not yet be loaded.
        for (const key of Object.keys(EDIT_FN_BY_KEY)) {
            const meta = EDIT_FN_BY_KEY[key];
            _wrapEditHandlerByKey(meta.editFn, key);
        }

        _wrapCancelEdit();

        // Best-effort submit-side wraps for hand-rolled save handlers. The
        // CRUD-factory forms close through cancelEdit so they don't need this.
        ['submitACFHA', 'submitSysFHA', 'submitPRA', 'submitZSA', 'submitCMA',
         'submitFMEA', 'submitItem',
         'submitACAssumption', 'submitSysAssumption']
            .forEach(_wrapSubmitFn);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _install);
    } else {
        // DOM is ready, but the CRUD-factory-installed handlers may not be on
        // window yet because they're set deeper in the bundle. Defer once.
        setTimeout(_install, 50);
    }

    // Re-install opportunistically — if a wrapped function gets replaced by a
    // later script (unlikely, but defensive), the wrapping flag prevents double
    // wrapping while still picking up newer references.
    setTimeout(_install, 500);
    setTimeout(_install, 2000);

    // Expose for debugging.
    window._slEditModal = { open: _openEditModal, close: _closeEditModal };
})();


// =============================================================================
// Phase 56.18 — External-system event linkage
// =============================================================================
// Allows any basic event, undeveloped event, or gate to be linked to a failure
// condition originating outside the current fault tree's scope. The link is
// captured on the node as `externalSource = { kind, scope, systemId, targetId,
// targetPageId, targetNodeId, snapshotValue, linkedAt }`. Having
// `externalSource` set is itself the "external" flag (no separate boolean).
// No canvas visual treatment per user request.
//
// Phase 56.18c — the dropdown now offers FOUR combined scope+kind options:
//   aircraft-fha — Aircraft-level FHA row
//   system-fha   — Another System's FHA row
//   aircraft-fta — Aircraft-level FTA node (any gate / event)
//   system-fta   — Another System's FTA node (any gate / event)
//
// The FTA pickers walk every page of the chosen scope, recurse the root tree,
// and flatten ALL nodes (gates, basic events, undeveloped events) into one
// picker labeled `PageName · NodeID — Description`.
(function _initExternalSourceLinkage() {
    'use strict';
    if (window._extSrcInitDone) return;
    window._extSrcInitDone = true;

    function _getExtSrcContainer() { return document.getElementById('config-extsrc-container'); }
    function _getScopeSel()        { return document.getElementById('config-extsrc-scope'); }
    function _getSystemSel()       { return document.getElementById('config-extsrc-system'); }
    function _getFhaSel()          { return document.getElementById('config-extsrc-fha'); }
    function _getFtaSel()          { return document.getElementById('config-extsrc-fta'); }
    function _getStatusEl()        { return document.getElementById('config-extsrc-status'); }
    function _getSystemContainer() { return document.getElementById('config-extsrc-system-container'); }
    function _getFhaContainer()    { return document.getElementById('config-extsrc-fha-container'); }
    function _getFtaContainer()    { return document.getElementById('config-extsrc-fta-container'); }

    // Parse combined dropdown value 'aircraft-fha' / 'system-fha' /
    // 'aircraft-fta' / 'system-fta' into { scope, kind }. Empty input → blank.
    function _parseCombo(combo) {
        if (!combo) return { scope: '', kind: '' };
        const idx = combo.lastIndexOf('-');
        if (idx < 0) return { scope: combo, kind: '' };
        return { scope: combo.slice(0, idx), kind: combo.slice(idx + 1) };
    }
    function _comboValue(scope, kind) {
        if (!scope || !kind) return '';
        return scope + '-' + kind;
    }

    // FHA row → human label.
    function _fhaLabel(row) {
        const id = row.fcId ? (row.fcId + ': ') : '';
        const desc = (row.fcDesc || row.failureCondition || '').trim();
        const sev = row.severity ? ` [${row.severity}]` : '';
        return id + (desc.slice(0, 60)) + sev;
    }

    // FTA node → human label (uses node id + name, truncated).
    function _nodeLabel(node, pageName) {
        const nm = (node.name || '').trim();
        const shortName = nm.length > 40 ? nm.slice(0, 40) + '…' : nm;
        const typeTag = (node.type === 'gate')
            ? '<' + (node.gateType || 'GATE') + '>'
            : (node.type === 'basic' ? '<BE>' : '<' + (node.type || 'node').toUpperCase() + '>');
        return pageName + ' · ' + typeTag + ' ' + (node.id || '?') + (shortName ? ' — ' + shortName : '');
    }

    // Walk every node in a page's root tree, collecting non-TRANSFER nodes for
    // the picker. We skip TRANSFER stubs because they don't have meaningful
    // standalone probabilities — picking the destination root makes more sense.
    function _flattenPageNodes(page, out, visited) {
        if (!page || !page.root) return;
        visited = visited || new Set();
        if (visited.has(page.id)) return;
        visited.add(page.id);
        const stack = [page.root];
        const seen = new Set();
        while (stack.length) {
            const n = stack.pop();
            if (!n || seen.has(n.id)) continue;
            seen.add(n.id);
            if (!(n.type === 'gate' && n.gateType === 'TRANSFER')) {
                out.push({ pageId: page.id, pageName: page.name || page.id, node: n });
            }
            const kids = n.children || n._children || [];
            for (const k of kids) stack.push(k);
        }
    }

    function _populateSystemDropdown() {
        const sel = _getSystemSel();
        if (!sel) return;
        const current = sel.value;
        sel.innerHTML = '<option value="">— Select system —</option>';
        (systemsData || []).forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.text = s.name || s.id;
            sel.appendChild(opt);
        });
        // Restore selection if still present.
        if (current && Array.from(sel.options).some(o => o.value === current)) {
            sel.value = current;
        }
    }

    function _populateFhaDropdown(scope, systemId) {
        const sel = _getFhaSel();
        if (!sel) return;
        const current = sel.value;
        sel.innerHTML = '<option value="">— Select failure condition —</option>';
        let rows = [];
        if (scope === 'aircraft') {
            rows = (acFhaData || []).map(r => ({ row: r, id: 'AC_' + r.internalId }));
        } else if (scope === 'system' && systemId) {
            const sys = (systemsData || []).find(s => s.id === systemId);
            const sysRows = (sys && Array.isArray(sys.fha)) ? sys.fha : [];
            rows = sysRows.map(r => ({ row: r, id: 'SYS_' + r.internalId }));
        }
        rows.forEach(({ row, id }) => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.text = _fhaLabel(row);
            sel.appendChild(opt);
        });
        if (current && Array.from(sel.options).some(o => o.value === current)) {
            sel.value = current;
        }
    }

    // Build the FTA-node picker. Options are grouped by page (optgroup) so the
    // user can see which tree each node belongs to. value encodes
    // `pageId::nodeId` for unambiguous round-trip.
    function _populateFtaDropdown(scope, systemId, currentValue) {
        const sel = _getFtaSel();
        if (!sel) return;
        const prior = currentValue || sel.value;
        sel.innerHTML = '<option value="">— Select FTA node —</option>';
        const pages = (window.ftaPages || []).filter(p => {
            if (!p || !p.root) return false;
            // Phase 56.18c — exclude the active page so users can't link a node
            // to itself or another node in the same tree. External by definition.
            if (typeof activeFTAPageId !== 'undefined' && p.id === activeFTAPageId) return false;
            if (scope === 'aircraft') return p.treeLevel === 'aircraft';
            if (scope === 'system')   return p.treeLevel === 'system' && p.systemId === systemId;
            return false;
        });
        pages.forEach(page => {
            const flat = [];
            _flattenPageNodes(page, flat);
            if (flat.length === 0) return;
            const grp = document.createElement('optgroup');
            grp.label = page.name || page.id;
            flat.forEach(({ node }) => {
                const opt = document.createElement('option');
                opt.value = page.id + '::' + node.id;
                opt.text = _nodeLabel(node, '');  // pageName already in optgroup label
                grp.appendChild(opt);
            });
            sel.appendChild(grp);
        });
        if (prior && Array.from(sel.options).some(o => o.value === prior)) {
            sel.value = prior;
        }
    }

    // Look up a saved FTA node target by pageId + nodeId. Returns null if either
    // is missing.
    function _resolveFtaNodeTarget(targetPageId, targetNodeId) {
        if (!targetPageId || !targetNodeId) return null;
        const page = (window.ftaPages || []).find(p => p.id === targetPageId);
        if (!page || !page.root) return null;
        const stack = [page.root];
        const seen = new Set();
        while (stack.length) {
            const n = stack.pop();
            if (!n || seen.has(n.id)) continue;
            seen.add(n.id);
            if (n.id === targetNodeId) return { page, node: n };
            const kids = n.children || n._children || [];
            for (const k of kids) stack.push(k);
        }
        return null;
    }
    window._resolveFtaNodeTarget = _resolveFtaNodeTarget;

    function _writeStatus(msg, isWarn) {
        const el = _getStatusEl();
        if (!el) return;
        el.style.color = isWarn ? 'var(--color-warning, #f59e0b)' : 'var(--text-secondary)';
        el.innerHTML = msg;
    }

    function _renderStatusFromSelection() {
        if (!selectedNodeData) return;
        const src = selectedNodeData.externalSource;
        if (!src) {
            _writeStatus('<strong>External source:</strong> mark this event as inherited from another FHA row or another FTA node. Once linked, the allocator will respect the inherited target as the most-conservative budget and flag any apportioned value that exceeds it.');
            return;
        }
        const kind = src.kind || (src.targetId && !src.targetNodeId ? 'fha' : '');
        const scopeLabel = src.scope === 'aircraft'
            ? 'Aircraft scope'
            : 'System: ' + (((systemsData || []).find(s => s.id === src.systemId) || {}).name || src.systemId || '(unknown)');
        if (kind === 'fha') {
            const fha = (typeof _resolveLinkedFha === 'function') ? _resolveLinkedFha(src.targetId) : null;
            if (!fha) {
                _writeStatus('<strong>⚠ Source missing:</strong> the linked failure condition no longer exists in the project. Re-link or clear this external reference.', true);
                return;
            }
            _writeStatus(
                '<strong>Inherited from ' + scopeLabel + ' · FHA</strong><br>' +
                '<code style="font-size: 11px;">' + _fhaLabel(fha) + '</code><br>' +
                '<span style="font-size: 11px; color: var(--text-secondary);">Linked at ' + (src.linkedAt || 'unknown') + '. The allocator will treat the source\'s target rate as a ceiling for this branch.</span>'
            );
            return;
        }
        if (kind === 'fta') {
            const hit = _resolveFtaNodeTarget(src.targetPageId, src.targetNodeId);
            if (!hit) {
                _writeStatus('<strong>⚠ Source missing:</strong> the linked FTA node no longer exists. Re-link or clear this external reference.', true);
                return;
            }
            const p = (typeof hit.node.probability === 'number') ? hit.node.probability : null;
            const probStr = (p !== null && isFinite(p)) ? p.toExponential(3) : 'n/a';
            _writeStatus(
                '<strong>Inherited from ' + scopeLabel + ' · FTA</strong><br>' +
                '<code style="font-size: 11px;">' + _nodeLabel(hit.node, hit.page.name || hit.page.id) + '</code><br>' +
                '<span style="font-size: 11px; color: var(--text-secondary);">P @ source ≈ ' + probStr + '. Linked at ' + (src.linkedAt || 'unknown') + '. The allocator will treat this as the most-conservative budget for this branch.</span>'
            );
            return;
        }
        _writeStatus('<strong>External source set</strong> but the link kind is unknown. Clear and re-link.', true);
    }

    function _syncPanelFromSelection() {
        const cont = _getExtSrcContainer();
        if (!cont) return;
        const node = selectedNodeData;
        if (!node) { cont.style.display = 'none'; return; }
        // Only meaningful for events/gates that can represent inherited failure conditions.
        // Show for basic events, undeveloped, and gates. Hide for TRANSFER (uses its own linkage).
        const t = node.type;
        const gateType = node.gateType;
        const eligible = (t === 'basic' || t === 'undeveloped' || t === 'gate') && gateType !== 'TRANSFER';
        if (!eligible) { cont.style.display = 'none'; return; }
        cont.style.display = 'flex';
        _populateSystemDropdown();

        const src = node.externalSource || null;
        const scope = (src && src.scope) || '';
        const kind  = (src && src.kind)  || (src && src.targetId && !src.targetNodeId ? 'fha' : (src && src.targetNodeId ? 'fta' : ''));
        _getScopeSel().value = _comboValue(scope, kind);

        // System sub-picker only when scope=system.
        if (scope === 'system') {
            _getSystemContainer().style.display = '';
            _getSystemSel().value = (src && src.systemId) || '';
        } else {
            _getSystemContainer().style.display = 'none';
        }

        // FHA or FTA sub-picker based on kind.
        if (kind === 'fha') {
            _getFhaContainer().style.display = '';
            _getFtaContainer().style.display = 'none';
            _populateFhaDropdown(scope, src && src.systemId);
            _getFhaSel().value = (src && src.targetId) || '';
        } else if (kind === 'fta') {
            _getFhaContainer().style.display = 'none';
            _getFtaContainer().style.display = '';
            const combo = (src && src.targetPageId && src.targetNodeId)
                ? (src.targetPageId + '::' + src.targetNodeId)
                : '';
            _populateFtaDropdown(scope, src && src.systemId, combo);
            _getFtaSel().value = combo;
        } else {
            _getFhaContainer().style.display = 'none';
            _getFtaContainer().style.display = 'none';
        }
        _renderStatusFromSelection();
    }

    function _saveLinkFromForm() {
        if (!selectedNodeData) return;
        const combo = _getScopeSel().value;
        const { scope, kind } = _parseCombo(combo);
        const systemId = _getSystemSel().value;
        if (!scope || !kind) {
            // Clear the link entirely + remove inherited snapshot.
            delete selectedNodeData.externalSource;
            delete selectedNodeData._inheritedAt;
            delete selectedNodeData._externalSourceStale;
        } else if (kind === 'fha') {
            const targetId = _getFhaSel().value;
            const isComplete = (scope === 'aircraft' && targetId) ||
                               (scope === 'system' && systemId && targetId);
            selectedNodeData.externalSource = {
                kind: 'fha',
                scope: scope,
                systemId: scope === 'system' ? systemId : '',
                targetId: targetId || '',
                targetPageId: '',
                targetNodeId: '',
                linkedAt: isComplete ? new Date().toISOString().slice(0, 10) : ''
            };
        } else if (kind === 'fta') {
            const ftaVal = _getFtaSel().value;
            const sep = ftaVal.indexOf('::');
            const targetPageId = sep >= 0 ? ftaVal.slice(0, sep) : '';
            const targetNodeId = sep >= 0 ? ftaVal.slice(sep + 2) : '';
            const isComplete = (scope === 'aircraft' && targetPageId && targetNodeId) ||
                               (scope === 'system' && systemId && targetPageId && targetNodeId);
            selectedNodeData.externalSource = {
                kind: 'fta',
                scope: scope,
                systemId: scope === 'system' ? systemId : '',
                targetId: '',
                targetPageId: targetPageId,
                targetNodeId: targetNodeId,
                linkedAt: isComplete ? new Date().toISOString().slice(0, 10) : ''
            };
        }
        // Phase 56.18b — auto-inherit. When the link is complete and resolves to a
        // valid target probability, snap the basic event's λ to the inherited
        // value and capture a snapshot so we can detect when the source drifts
        // and surface a stale flag (see _recomputeEffectiveWithExternalCaps).
        if (selectedNodeData.externalSource && typeof _getExternalSourceTarget === 'function') {
            try {
                const inheritedP = _getExternalSourceTarget(selectedNodeData);
                if (inheritedP !== null && isFinite(inheritedP) && inheritedP > 0 && inheritedP < 1) {
                    const tExp = (typeof ftaConfig !== 'undefined' && ftaConfig.exposureTime) ? ftaConfig.exposureTime : 1;
                    const inheritedLambda = -Math.log1p(-inheritedP) / tExp;
                    // Only overwrite λ on basic / undeveloped events (not gates); gates
                    // have their probability set by the allocator and don't carry λ.
                    if (selectedNodeData.type !== 'gate' && !selectedNodeData._inheritOverride) {
                        if (isFinite(inheritedLambda) && inheritedLambda > 0) selectedNodeData.lambda = inheritedLambda;
                        selectedNodeData.probability = inheritedP;
                    }
                    selectedNodeData._inheritedAt = {
                        probability: inheritedP,
                        lambda: isFinite(inheritedLambda) ? inheritedLambda : 0,
                        capturedAt: new Date().toISOString()
                    };
                    delete selectedNodeData._externalSourceStale;
                }
            } catch (e) { /* tolerate transient */ }
        }
        _renderStatusFromSelection();
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
        if (typeof calculateAllProbabilities === 'function') {
            try { calculateAllProbabilities(); } catch (e) { /* tolerate transient */ }
        }
        if (typeof updateD3 === 'function') updateD3();
    }

    // Public handlers wired from index.html.
    window.onExternalSourceScopeChange = function() {
        const combo = _getScopeSel().value;
        const { scope, kind } = _parseCombo(combo);
        _getSystemContainer().style.display = (scope === 'system') ? '' : 'none';
        _getFhaContainer().style.display = (kind === 'fha') ? '' : 'none';
        _getFtaContainer().style.display = (kind === 'fta') ? '' : 'none';
        if (kind === 'fha') {
            _populateFhaDropdown(scope, scope === 'system' ? _getSystemSel().value : null);
        } else if (kind === 'fta') {
            _populateFtaDropdown(scope, scope === 'system' ? _getSystemSel().value : null);
        }
        _saveLinkFromForm();
    };
    window.onExternalSourceSystemChange = function() {
        const { scope, kind } = _parseCombo(_getScopeSel().value);
        const sysId = _getSystemSel().value;
        if (kind === 'fha') _populateFhaDropdown('system', sysId);
        else if (kind === 'fta') _populateFtaDropdown('system', sysId);
        _saveLinkFromForm();
    };
    window.onExternalSourceFhaChange = function() {
        _saveLinkFromForm();
    };
    window.onExternalSourceFtaNodeChange = function() {
        _saveLinkFromForm();
    };

    // Phase 56.18c — public helper used by allocateTopDown + AutoReq. Returns the
    // most-conservative probability target inherited from the external source, or
    // null when the link is missing/incomplete/unresolvable.
    function _getExternalSourceTarget(node) {
        if (!node || !node.externalSource) return null;
        const src = node.externalSource;
        const kind = src.kind || (src.targetId && !src.targetNodeId ? 'fha' : (src.targetNodeId ? 'fta' : ''));
        if (kind === 'fha') {
            const fha = (typeof _resolveLinkedFha === 'function') ? _resolveLinkedFha(src.targetId) : null;
            if (!fha) return null;
            // Severity-driven target — same table the FTA toolbar uses for top-event allocation.
            if (typeof _targetProbForSeverity === 'function') {
                const p = _targetProbForSeverity(fha.severity);
                return (typeof p === 'number' && isFinite(p)) ? p : null;
            }
            // Fallback approximate map matching AC 25.1309 catastrophic/hazardous/major/minor.
            const sevMap = { 'Catastrophic': 1e-9, 'Hazardous': 1e-7, 'Major': 1e-5, 'Minor': 1e-3, 'No Safety Effect': 1.0 };
            return sevMap[fha.severity] != null ? sevMap[fha.severity] : null;
        }
        if (kind === 'fta') {
            const hit = _resolveFtaNodeTarget(src.targetPageId, src.targetNodeId);
            if (!hit) return null;
            const p = hit.node.probability;
            return (typeof p === 'number' && isFinite(p)) ? p : null;
        }
        return null;
    }
    window._getExternalSourceTarget = _getExternalSourceTarget;

    // Observe the panel for show/hide transitions. Each time the panel becomes
    // visible we re-sync from selectedNodeData (which was just populated by the
    // existing node-click handler). This avoids modifying the click handler.
    function _watchPanel() {
        const panel = document.getElementById('node-config-panel');
        if (!panel || panel._extSrcObserved) return;
        panel._extSrcObserved = true;
        let lastDisplay = panel.style.display;
        const observer = new MutationObserver(() => {
            const current = panel.style.display;
            if (current !== lastDisplay) {
                lastDisplay = current;
                if (current !== 'none') {
                    // Defer so the existing populate code (config-name, config-lambda, etc.)
                    // finishes first.
                    setTimeout(_syncPanelFromSelection, 30);
                }
            }
        });
        observer.observe(panel, { attributes: true, attributeFilter: ['style'] });
        // Phase 56.18 follow-up — if the panel is already visible when we install
        // (e.g. the user had a node selected before the page loaded fully), sync
        // immediately. The MutationObserver only catches transitions, so a panel
        // that opened pre-install would otherwise stay un-populated.
        if (panel.style.display && panel.style.display !== 'none' && selectedNodeData) {
            setTimeout(_syncPanelFromSelection, 50);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _watchPanel);
    } else {
        _watchPanel();
    }
    // Defensive re-watch in case the panel gets re-rendered late.
    setTimeout(_watchPanel, 500);
    setTimeout(_watchPanel, 2000);

    // Expose sync for debugging + manual refresh.
    window._syncExternalSourcePanel = _syncPanelFromSelection;
})();


// =============================================================================
// Phase 56.19 — Assumption linkage on PRA / ZSA / CMA forms
// =============================================================================
// Mirrors the FHA `assumptionIds[]` pattern for Common Cause Analysis artifacts.
// PRA + ZSA are aircraft-scope, so they list AC assumptions. CMA's scope is
// per-record (aircraft or system), so its assumption list switches between
// acAssumptionsData and the active system's asm[] based on the CMA Scope
// selector. v1: capture + persist + restore on edit. Table display TBD in v1b.
(function _initAssumptionLinkagePRAZSACMA() {
    'use strict';
    if (window._asmLinkagePZCInit) return;
    window._asmLinkagePZCInit = true;

    function _asmLabel(a) {
        const id = a.asmId || ('ASM-' + a.internalId);
        const stmt = (a.statement || a.text || '').trim().slice(0, 60);
        return id + (stmt ? '  ·  ' + stmt : '');
    }

    function _acAsmOptions() {
        return (acAssumptionsData || []).map(a => ({ value: a.internalId, label: _asmLabel(a) }));
    }
    function _sysAsmOptions(systemId) {
        const sys = (systemsData || []).find(s => s.id === systemId);
        const arr = (sys && Array.isArray(sys.asm)) ? sys.asm : [];
        return arr.map(a => ({ value: a.internalId, label: _asmLabel(a) }));
    }

    function _populate(hostId, options, selected) {
        const host = document.getElementById(hostId);
        if (!host) return;
        _renderCheckboxList(host, options, selected, {
            emptyText: 'No assumptions defined yet — add some in the Assumptions tab first.'
        });
    }
    function _read(hostId) {
        const host = document.getElementById(hostId);
        return _getCheckboxListValues(host);
    }

    // -- PRA -----------------------------------------------------------------
    function populatePraAssumptions(selected) {
        _populate('pra-assumptions', _acAsmOptions(), selected || _read('pra-assumptions'));
    }
    window.populatePraAssumptions = populatePraAssumptions;

    // -- ZSA -----------------------------------------------------------------
    function populateZsaAssumptions(selected) {
        _populate('zsa-assumptions', _acAsmOptions(), selected || _read('zsa-assumptions'));
    }
    window.populateZsaAssumptions = populateZsaAssumptions;

    // -- CMA -----------------------------------------------------------------
    function populateCmaAssumptions(selected) {
        const scopeSel = document.getElementById('cma-scope');
        const scope = scopeSel ? scopeSel.value : 'aircraft';
        let options;
        if (scope === 'system') {
            const owner = document.getElementById('cma-owning-system');
            const sysId = owner ? owner.value : '';
            options = sysId ? _sysAsmOptions(sysId) : [];
        } else {
            options = _acAsmOptions();
        }
        _populate('cma-assumptions', options, selected || _read('cma-assumptions'));
    }
    window.populateCmaAssumptions = populateCmaAssumptions;

    // When CMA scope or owning system changes, repopulate to the right scope.
    function _hookCmaScopeChanges() {
        const scopeSel = document.getElementById('cma-scope');
        const owner = document.getElementById('cma-owning-system');
        if (scopeSel && !scopeSel._asmRepopHooked) {
            scopeSel._asmRepopHooked = true;
            scopeSel.addEventListener('change', () => setTimeout(populateCmaAssumptions, 30));
        }
        if (owner && !owner._asmRepopHooked) {
            owner._asmRepopHooked = true;
            owner.addEventListener('change', () => setTimeout(populateCmaAssumptions, 30));
        }
    }

    // Wrap submit handlers so saved record carries assumptionIds[]. The wrappers
    // run AFTER the original submitX runs — the original has already pushed the
    // record into the store, so we look up the most-recent record (or the one
    // currently being edited) and stamp the assumptionIds onto it.
    function _findRecentRecord(arr, editKey) {
        const editId = (typeof editStates !== 'undefined' && editStates) ? editStates[editKey] : null;
        if (editId) return arr.find(r => String(r.internalId) === String(editId));
        return arr[arr.length - 1] || null;
    }

    function _wrapSubmit(name, hostId, getArr, editKey, scopeAware) {
        const orig = window[name];
        if (typeof orig !== 'function' || orig._asmLinkWrapped) return;
        const wrapped = function() {
            // Capture asm list BEFORE delegating — the original may call cancelEdit
            // which clears the form. Note: editKey reflects the record being edited
            // PRIOR to the original submit (which then clears editStates).
            const asmIds = _read(hostId);
            const editIdSnapshot = (typeof editStates !== 'undefined') ? editStates[editKey] : null;
            const result = orig.apply(this, arguments);
            try {
                const arr = getArr();
                let target;
                if (editIdSnapshot) {
                    target = (arr || []).find(r => String(r.internalId) === String(editIdSnapshot));
                }
                if (!target) target = arr && arr[arr.length - 1];
                if (target) {
                    target.assumptionIds = asmIds.slice();
                    if (scopeAware) {
                        // For CMA, also remember which scope the asm IDs are against
                        // so we can resolve them later (AC vs Sys assumption pools).
                        const scopeSel = document.getElementById('cma-scope');
                        target.assumptionScope = scopeSel ? scopeSel.value : (target.scope || 'aircraft');
                    }
                }
                if (typeof scheduleAutosave === 'function') scheduleAutosave();
            } catch (err) { console.warn('[asm-link] submit-wrap', name, err); }
            return result;
        };
        wrapped._asmLinkWrapped = true;
        // 20 Aug 2026 — keep every prior wrapper's idempotence marker (see fn_wrap.js).
        try { if (window.SLWrap) SLWrap.preserve(orig, wrapped); } catch (_) {}
        window[name] = wrapped;
    }

    // Wrap edit handlers so the checkbox list reflects the loaded record's
    // assumptionIds when entering edit mode.
    function _wrapEdit(name, hostId, getArr, populateFn) {
        const orig = window[name];
        if (typeof orig !== 'function' || orig._asmLinkWrapped) return;
        const wrapped = function(internalId) {
            const result = orig.apply(this, arguments);
            try {
                const arr = getArr();
                const row = (arr || []).find(r => String(r.internalId) === String(internalId));
                const ids = (row && Array.isArray(row.assumptionIds)) ? row.assumptionIds : [];
                // Defer so the existing edit handler finishes populating its own fields first.
                setTimeout(() => populateFn(ids), 40);
            } catch (err) { console.warn('[asm-link] edit-wrap', name, err); }
            return result;
        };
        wrapped._asmLinkWrapped = true;
        // 20 Aug 2026 — keep every prior wrapper's idempotence marker (see fn_wrap.js).
        try { if (window.SLWrap) SLWrap.preserve(orig, wrapped); } catch (_) {}
        window[name] = wrapped;
    }

    function _install() {
        // Initial population (each form's empty state).
        populatePraAssumptions([]);
        populateZsaAssumptions([]);
        populateCmaAssumptions([]);
        _hookCmaScopeChanges();

        _wrapSubmit('submitPRA', 'pra-assumptions', () => praData, 'pra', false);
        _wrapSubmit('submitZSA', 'zsa-assumptions', () => zsaData, 'zsa', false);
        _wrapSubmit('submitCMA', 'cma-assumptions', () => cmaData, 'cma', true);

        _wrapEdit('editPRA', 'pra-assumptions', () => praData, populatePraAssumptions);
        _wrapEdit('editZSA', 'zsa-assumptions', () => zsaData, populateZsaAssumptions);
        _wrapEdit('editCMA', 'cma-assumptions', () => cmaData, populateCmaAssumptions);
    }

    // Re-populate on tab switches so the form reflects the current assumptions
    // pool (which the user may have edited in the Assumptions tab).
    function _hookTabSwitch() {
        if (typeof window.switchTab !== 'function' || window.switchTab._asmLinkRepop) return;
        const orig = window.switchTab;
        const wrapped = function(tabName) {
            const result = orig.apply(this, arguments);
            try {
                if (tabName === 'view-pra' || tabName === 'pra') populatePraAssumptions(_read('pra-assumptions'));
                if (tabName === 'view-zsa' || tabName === 'zsa') populateZsaAssumptions(_read('zsa-assumptions'));
                if (tabName === 'view-cma' || tabName === 'cma') populateCmaAssumptions(_read('cma-assumptions'));
            } catch (_) {}
            return result;
        };
        wrapped._asmLinkRepop = true;
        window.switchTab = wrapped;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { _install(); _hookTabSwitch(); });
    } else {
        setTimeout(() => { _install(); _hookTabSwitch(); }, 50);
    }
    setTimeout(() => { _install(); _hookTabSwitch(); }, 500);
    setTimeout(() => { _install(); _hookTabSwitch(); }, 2000);
})();


// ============================================================================
// Phase 56.53 — Visual Template Editor (#386)
// ============================================================================
// Lets a customer upload their .docx template and edit it as rich text inside
// Safety Lab Aero BEFORE the report is generated. Architecture:
//
//   .docx → mammoth.js → HTML → contenteditable WYSIWYG → markdown → docx-js
//
// Data tokens like {{project_name}} or {{fha_table}} render as visual chips
// that are atomic during editing (delete as a unit). A token-picker dropdown
// lets the user insert new chips at the cursor. On save, the edited HTML is
// converted back to markdown and fed to the existing Reports.renderToDocx()
// writer (Phase 56.2) which handles token substitution and outputs a .docx.
//
// Public API:
//   window.TemplateEditor.open(file, opts)
//     opts = { reportType, systemId, appendices, autoGenerate }
//     returns Promise<{ ok: boolean, fileName?, blob? }>
// ============================================================================
(function() {
    'use strict';

    const MAMMOTH_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';

    let _mammothLoading = null;
    function _loadMammoth() {
        if (window.mammoth) return Promise.resolve(window.mammoth);
        if (_mammothLoading) return _mammothLoading;
        _mammothLoading = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = MAMMOTH_CDN;
            s.onload = () => resolve(window.mammoth);
            s.onerror = () => reject(new Error('Could not load mammoth.js (network required)'));
            document.head.appendChild(s);
        });
        return _mammothLoading;
    }

    // ------------------------------------------------------------------------
    // Token registry — these are the tokens that get substituted at generation
    // time by Reports.renderToDocx. The picker UI groups them for the user.
    // ------------------------------------------------------------------------
    const SCALAR_TOKENS = [
        { id: 'project_name',  label: 'Project Name' },
        { id: 'aircraft_name', label: 'Aircraft Name' },
        { id: 'cert_basis',    label: 'Certification Basis' },
        { id: 'date',          label: "Today's Date" },
        { id: 'system_name',   label: 'System Name' },
        { id: 'system_id',     label: 'System ID' },
        { id: 'author',        label: 'Author' },
        { id: 'version',       label: 'Document Version' }
    ];
    const TABLE_TOKENS = [
        { id: 'fha_table',           label: 'FHA Table' },
        { id: 'requirements_table',  label: 'Requirements Table' },
        { id: 'assumptions_list',    label: 'Assumptions List' },
        { id: 'component_list',      label: 'Component / LRU List' },
        { id: 'fta_summary',         label: 'FTA Summary' },
        { id: 'pra_table',           label: 'Particular Risk Table' },
        { id: 'zsa_table',           label: 'Zonal Safety Table' },
        { id: 'cma_table',           label: 'Common Mode Table' },
        { id: 'fmea_functional_table', label: 'FMEA (Functional) Table' },
        { id: 'fmea_piecepart_table',  label: 'FMEA (Piece-Part) Table' },
        { id: 'fmes_table',          label: 'FMES Summary Table' },
        { id: 'ram_ledger_table',    label: 'R&M Maintainability Ledger (Ai/Ao)' },
        { id: 'ram_prediction_table', label: 'Reliability Prediction Rollup' },
        { id: 'ram_alloc_table',     label: 'Reliability Allocation Table' },
        { id: 'ram_spares_table',    label: 'Spares Provisioning Table' },
        { id: 'ram_weibull_table',   label: 'Weibull Life-Data Table' },
        { id: 'ram_growth_table',    label: 'Reliability Growth (Crow-AMSAA)' },
        { id: 'fracas_table',        label: 'FRACAS Field-Data Table' },
        { id: 'msg3_table',          label: 'MSG-3 MSI Register' },
        { id: 'mmel_table',          label: 'MMEL / TLD Register' },
        { id: 'et_table',            label: 'Event Tree Sequences' },
        { id: 'bowtie_table',        label: 'Bow-Tie Register' },
        { id: 'ccmr_table',          label: 'CCMR Candidates' },
        { id: 'ip_ledger_table',     label: 'Independence Principles Ledger' },
        { id: 'budget_ledger_table', label: 'Budget vs Achieved Ledger' },
        { id: 'ffs_table',           label: 'Qualitative FFS (Dev Errors)' },
        { id: 'lcc_table',           label: 'Life-Cycle Cost Table' },
        { id: 'sneak_table',         label: 'Sneak Circuit Candidates' },
        { id: 'swrel_table',         label: 'Software Reliability Table' },
        { id: 'tol_derate_table',    label: 'Tolerance & Derating Table' }
    ];
    const APPENDIX_TOKENS = [
        { id: 'appendix:fta',  label: 'FTA Appendix (auto-render)' },
        { id: 'appendix:pra',  label: 'PRA Appendix (auto-render)' },
        { id: 'appendix:zsa',  label: 'ZSA Appendix (auto-render)' },
        { id: 'appendix:cma',  label: 'CMA Appendix (auto-render)' }
    ];

    // ------------------------------------------------------------------------
    // State for the active editor session. There is only ever one open editor
    // at a time. Reset on close.
    // ------------------------------------------------------------------------
    let _state = null;

    // ========================================================================
    // PUBLIC API
    // ========================================================================
    async function open(file, opts) {
        opts = opts || {};
        if (!file) throw new Error('TemplateEditor.open: file is required');

        // Load mammoth on-demand
        let mammoth;
        try {
            mammoth = await _loadMammoth();
        } catch (e) {
            _showToast('Could not load template parser. Check your network connection.', 'error');
            throw e;
        }

        // Convert .docx → HTML. Mammoth produces semantic HTML for paragraphs,
        // headings, lists, bold/italic, and tables. Some fidelity is lost
        // (custom fonts, exact spacing) but the structure survives.
        let result;
        try {
            const buf = await file.arrayBuffer();
            result = await mammoth.convertToHtml({ arrayBuffer: buf });
        } catch (e) {
            _showToast('Could not read this .docx file. It may be corrupt or password-protected.', 'error');
            throw e;
        }

        const rawHtml = result.value || '<p>(Template appears empty.)</p>';
        const messages = result.messages || [];
        if (messages.length) {
            console.log('[TemplateEditor] mammoth warnings:', messages);
        }

        // Wrap {{token}} patterns as visual chips
        const tokenizedHtml = _wrapTokensAsChips(rawHtml);

        // Open the editor UI and wait for save or cancel
        return new Promise((resolve, reject) => {
            _state = {
                file:           file,
                fileName:       file.name || 'template.docx',
                reportType:     opts.reportType || 'AFHA',
                systemId:       opts.systemId || null,
                appendices:     opts.appendices || {},
                autoGenerate:   opts.autoGenerate !== false,  // default true
                originalHtml:   rawHtml,
                tokenizedHtml:  tokenizedHtml,
                resolve:        resolve,
                reject:         reject
            };
            _renderEditor();
        });
    }

    // ========================================================================
    // TOKENIZATION — wrap {{name}} patterns in non-editable chip spans so they
    // behave as atomic units during editing.
    // ========================================================================
    function _wrapTokensAsChips(html) {
        // Note: we operate on the full HTML string. Tokens inside tag
        // attributes are essentially impossible (mammoth doesn't emit them
        // there), so this is safe in practice.
        return html.replace(/\{\{([a-z0-9_:]+)\}\}/gi, function(_match, name) {
            const safe = name.replace(/[<>&"']/g, '');
            // Zero-width spaces inside flank the chip so cursor placement
            // before/after the chip works reliably with contenteditable.
            return '<span class="sl-tpl-chip" contenteditable="false" data-token="' + safe + '" title="Token: replaces with ' + safe + ' when report is generated">{{' + safe + '}}</span>';
        });
    }

    // ========================================================================
    // EDITOR UI — full-screen overlay modal with header/toolbar/canvas/footer
    // ========================================================================
    function _renderEditor() {
        // Remove any existing editor
        const existing = document.getElementById('sl-tpl-editor');
        if (existing) existing.remove();

        _injectStyles();

        const overlay = document.createElement('div');
        overlay.id = 'sl-tpl-editor';
        overlay.className = 'sl-tpl-overlay';
        overlay.innerHTML = [
            '<div class="sl-tpl-modal">',
                '<div class="sl-tpl-header">',
                    '<div class="sl-tpl-title">',
                        '<span class="sl-tpl-pill">Edit Template</span>',
                        '<span class="sl-tpl-filename"></span>',
                    '</div>',
                    '<button class="sl-tpl-icon-btn" id="sl-tpl-close-x" title="Cancel">&times;</button>',
                '</div>',
                '<div class="sl-tpl-toolbar" id="sl-tpl-toolbar">',
                    '<button class="sl-tpl-tb-btn" data-cmd="bold" title="Bold (⌘B / Ctrl+B)"><b>B</b></button>',
                    '<button class="sl-tpl-tb-btn" data-cmd="italic" title="Italic (⌘I / Ctrl+I)"><i>I</i></button>',
                    '<button class="sl-tpl-tb-btn" data-cmd="underline" title="Underline (⌘U / Ctrl+U)"><u>U</u></button>',
                    '<span class="sl-tpl-tb-sep"></span>',
                    '<button class="sl-tpl-tb-btn" data-cmd="formatBlock" data-val="H1" title="Heading 1">H1</button>',
                    '<button class="sl-tpl-tb-btn" data-cmd="formatBlock" data-val="H2" title="Heading 2">H2</button>',
                    '<button class="sl-tpl-tb-btn" data-cmd="formatBlock" data-val="H3" title="Heading 3">H3</button>',
                    '<button class="sl-tpl-tb-btn" data-cmd="formatBlock" data-val="P" title="Normal paragraph">P</button>',
                    '<span class="sl-tpl-tb-sep"></span>',
                    '<button class="sl-tpl-tb-btn" data-cmd="insertUnorderedList" title="Bullet list">•≡</button>',
                    '<button class="sl-tpl-tb-btn" data-cmd="insertOrderedList" title="Numbered list">1.≡</button>',
                    '<span class="sl-tpl-tb-sep"></span>',
                    '<div class="sl-tpl-token-picker">',
                        '<button class="sl-tpl-tb-token-btn" id="sl-tpl-token-trigger">+ Insert Token <span class="sl-tpl-caret">▾</span></button>',
                        '<div class="sl-tpl-token-menu" id="sl-tpl-token-menu" hidden>',
                            '<div class="sl-tpl-token-search-wrap">',
                                '<input type="text" class="sl-tpl-token-search" id="sl-tpl-token-search" placeholder="Search tokens…" />',
                            '</div>',
                            '<div class="sl-tpl-token-list" id="sl-tpl-token-list"></div>',
                        '</div>',
                    '</div>',
                    '<span class="sl-tpl-tb-spacer"></span>',
                    '<button class="sl-tpl-tb-btn sl-tpl-tb-ghost" id="sl-tpl-help-btn" title="What are tokens?">?</button>',
                '</div>',
                '<div class="sl-tpl-canvas-wrap">',
                    '<div class="sl-tpl-canvas" id="sl-tpl-canvas" contenteditable="true" spellcheck="false"></div>',
                '</div>',
                '<div class="sl-tpl-footer">',
                    '<div class="sl-tpl-help-text">',
                        'Tokens like <span class="sl-tpl-mini-chip">{{project_name}}</span> stay as chips; they\'re replaced with real data when the report is generated.',
                    '</div>',
                    '<div class="sl-tpl-actions">',
                        '<button class="sl-tpl-btn sl-tpl-btn-ghost" id="sl-tpl-cancel">Cancel</button>',
                        '<button class="sl-tpl-btn sl-tpl-btn-primary" id="sl-tpl-save">Save &amp; Generate Report</button>',
                    '</div>',
                '</div>',
            '</div>'
        ].join('');
        document.body.appendChild(overlay);

        // Populate
        overlay.querySelector('.sl-tpl-filename').textContent = _state.fileName;
        const canvas = overlay.querySelector('#sl-tpl-canvas');
        canvas.innerHTML = _state.tokenizedHtml;

        // Populate token picker list
        _renderTokenPickerList();

        // Wire interactions
        _wireToolbar(overlay, canvas);
        _wireTokenPicker(overlay, canvas);
        _wireChipBehavior(canvas);
        _wireFooter(overlay, canvas);
        _wireKeyboard(overlay, canvas);

        // Focus canvas
        canvas.focus();
        _moveCursorToStart(canvas);
    }

    function _wireToolbar(overlay, canvas) {
        const tb = overlay.querySelector('#sl-tpl-toolbar');
        tb.addEventListener('mousedown', function(ev) {
            // Prevent toolbar clicks from moving the selection out of the canvas
            const btn = ev.target.closest('.sl-tpl-tb-btn');
            if (btn) ev.preventDefault();
        });
        tb.addEventListener('click', function(ev) {
            const btn = ev.target.closest('.sl-tpl-tb-btn');
            if (!btn) return;
            const cmd = btn.getAttribute('data-cmd');
            if (!cmd) return;
            const val = btn.getAttribute('data-val') || null;
            canvas.focus();
            try {
                document.execCommand(cmd, false, val);
            } catch (e) { console.warn('[TemplateEditor] execCommand failed', cmd, e); }
            _updateToolbarState(overlay);
        });
        // Update active states on selection change
        canvas.addEventListener('keyup', () => _updateToolbarState(overlay));
        canvas.addEventListener('mouseup', () => _updateToolbarState(overlay));

        // Help button
        const helpBtn = overlay.querySelector('#sl-tpl-help-btn');
        if (helpBtn) helpBtn.addEventListener('click', _showHelp);
    }

    function _updateToolbarState(overlay) {
        const cmds = ['bold','italic','underline'];
        cmds.forEach(c => {
            const btn = overlay.querySelector('.sl-tpl-tb-btn[data-cmd="' + c + '"]');
            if (!btn) return;
            try {
                if (document.queryCommandState(c)) btn.classList.add('is-active');
                else btn.classList.remove('is-active');
            } catch (_) {}
        });
    }

    function _wireTokenPicker(overlay, canvas) {
        const trigger = overlay.querySelector('#sl-tpl-token-trigger');
        const menu    = overlay.querySelector('#sl-tpl-token-menu');
        const search  = overlay.querySelector('#sl-tpl-token-search');
        let savedRange = null;

        trigger.addEventListener('mousedown', function(ev) {
            // Save the selection BEFORE the button takes focus
            savedRange = _saveSelection(canvas);
            ev.preventDefault();
        });
        trigger.addEventListener('click', function(ev) {
            ev.preventDefault();
            const isHidden = menu.hasAttribute('hidden');
            if (isHidden) {
                menu.removeAttribute('hidden');
                search.value = '';
                _renderTokenPickerList();
                setTimeout(() => search.focus(), 0);
            } else {
                menu.setAttribute('hidden', '');
            }
        });

        // Filter as user types
        search.addEventListener('input', function() {
            _renderTokenPickerList(search.value.trim().toLowerCase());
        });

        // Insert token on click
        menu.addEventListener('mousedown', function(ev) {
            const item = ev.target.closest('.sl-tpl-token-item');
            if (item) ev.preventDefault();  // don't lose selection
        });
        menu.addEventListener('click', function(ev) {
            const item = ev.target.closest('.sl-tpl-token-item');
            if (!item) return;
            const tokenId = item.getAttribute('data-token');
            if (!tokenId) return;
            menu.setAttribute('hidden', '');
            canvas.focus();
            _restoreSelection(canvas, savedRange);
            _insertTokenChip(canvas, tokenId);
        });

        // Hide menu on outside click
        document.addEventListener('mousedown', function _outside(ev) {
            if (!overlay.contains(ev.target)) return;
            if (ev.target.closest('.sl-tpl-token-picker')) return;
            menu.setAttribute('hidden', '');
        });
    }

    function _renderTokenPickerList(query) {
        const list = document.getElementById('sl-tpl-token-list');
        if (!list) return;
        const q = (query || '').toLowerCase();
        const groups = [
            { label: 'Scalar Tokens',    items: SCALAR_TOKENS    },
            { label: 'Table Tokens',     items: TABLE_TOKENS     },
            { label: 'Appendix Tokens',  items: APPENDIX_TOKENS  }
        ];
        const html = groups.map(g => {
            const filtered = g.items.filter(t => !q || t.id.toLowerCase().includes(q) || t.label.toLowerCase().includes(q));
            if (!filtered.length) return '';
            return '<div class="sl-tpl-token-group">' +
                '<div class="sl-tpl-token-group-label">' + g.label + '</div>' +
                filtered.map(t =>
                    '<button class="sl-tpl-token-item" data-token="' + t.id + '">' +
                        '<span class="sl-tpl-token-item-label">' + t.label + '</span>' +
                        '<code class="sl-tpl-token-item-code">{{' + t.id + '}}</code>' +
                    '</button>'
                ).join('') +
            '</div>';
        }).join('') || '<div class="sl-tpl-token-empty">No tokens match.</div>';
        list.innerHTML = html;
    }

    function _insertTokenChip(canvas, tokenId) {
        const chipHtml = '<span class="sl-tpl-chip" contenteditable="false" data-token="' + tokenId +
            '" title="Token: replaces with ' + tokenId + ' when report is generated">{{' + tokenId + '}}</span>&nbsp;';
        try {
            document.execCommand('insertHTML', false, chipHtml);
        } catch (e) {
            // Fallback: append at end
            canvas.insertAdjacentHTML('beforeend', chipHtml);
        }
    }

    function _wireChipBehavior(canvas) {
        // Backspace immediately AFTER a chip should delete the chip atomically
        canvas.addEventListener('keydown', function(ev) {
            if (ev.key !== 'Backspace') return;
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return;
            const range = sel.getRangeAt(0);
            if (!range.collapsed) return;  // Let default handle selections
            // Walk back through neighboring nodes to find a chip immediately before cursor
            const node = range.startContainer;
            const offset = range.startOffset;
            let prev = null;
            if (node.nodeType === 3 /* text */) {
                if (offset === 0) {
                    prev = node.previousSibling;
                }
            } else if (node.nodeType === 1 /* element */) {
                prev = node.childNodes[offset - 1];
            }
            if (prev && prev.nodeType === 1 && prev.classList && prev.classList.contains('sl-tpl-chip')) {
                ev.preventDefault();
                prev.remove();
            }
        });
    }

    function _wireFooter(overlay, canvas) {
        overlay.querySelector('#sl-tpl-close-x').addEventListener('click', _cancel);
        overlay.querySelector('#sl-tpl-cancel').addEventListener('click', _cancel);
        overlay.querySelector('#sl-tpl-save').addEventListener('click', () => _saveAndGenerate(canvas));
    }

    function _wireKeyboard(overlay, canvas) {
        overlay.addEventListener('keydown', function(ev) {
            if (ev.key === 'Escape') {
                ev.preventDefault();
                _cancel();
            }
        });
    }

    // ========================================================================
    // CANCEL / SAVE
    // ========================================================================
    function _cancel() {
        if (!_state) return;
        const resolve = _state.resolve;
        _closeEditor();
        if (resolve) resolve({ ok: false, cancelled: true });
    }

    async function _saveAndGenerate(canvas) {
        if (!_state) return;
        const editedHtml = canvas.innerHTML;
        const markdown   = _htmlToMarkdown(canvas);  // walks DOM rather than the HTML string

        // Disable buttons while we work
        const saveBtn = document.getElementById('sl-tpl-save');
        const cancelBtn = document.getElementById('sl-tpl-cancel');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Generating…'; }
        if (cancelBtn) cancelBtn.disabled = true;

        try {
            let result = { ok: true, markdown: markdown, editedHtml: editedHtml };
            if (_state.autoGenerate) {
                result = await _generateDocxFromMarkdown(markdown, _state.reportType, _state.systemId, _state.appendices);
                if (result.ok && result.fileName) {
                    _showToast('Report generated: ' + result.fileName, 'success');
                }
            }
            const resolve = _state.resolve;
            _closeEditor();
            if (resolve) resolve(result);
        } catch (e) {
            console.error('[TemplateEditor] generate failed', e);
            _showToast('Could not generate report: ' + (e.message || e), 'error');
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save & Generate Report'; }
            if (cancelBtn) cancelBtn.disabled = false;
        }
    }

    function _closeEditor() {
        const overlay = document.getElementById('sl-tpl-editor');
        if (overlay) overlay.remove();
        _state = null;
    }

    // ========================================================================
    // HTML → MARKDOWN — walks the contenteditable DOM and emits markdown that
    // Reports._parseTemplate can read. Supported: h1-h3, paragraphs, ul/ol,
    // bold/italic, token chips (passed through as {{name}}).
    // ========================================================================
    function _htmlToMarkdown(root) {
        const lines = [];
        const blocks = Array.from(root.children);
        if (blocks.length === 0) {
            // Treat the root as one paragraph
            return _inlineToMarkdown(root);
        }
        for (const el of blocks) {
            _blockToMarkdown(el, lines, 0);
        }
        return lines.join('\n');
    }

    function _blockToMarkdown(el, lines, listDepth) {
        const tag = (el.tagName || '').toUpperCase();
        if (tag === 'H1' || tag === 'H2' || tag === 'H3') {
            const level = parseInt(tag.slice(1), 10);
            lines.push('#'.repeat(level) + ' ' + _inlineToMarkdown(el));
            lines.push('');
        } else if (tag === 'P' || tag === 'DIV') {
            const text = _inlineToMarkdown(el).trim();
            if (text) { lines.push(text); lines.push(''); }
            else lines.push('');
        } else if (tag === 'UL' || tag === 'OL') {
            const ordered = tag === 'OL';
            let idx = 1;
            Array.from(el.children).forEach(li => {
                if ((li.tagName || '').toUpperCase() !== 'LI') return;
                // Nested lists: recurse
                const inline = _inlineToMarkdown(li, /*excludeLists=*/true).trim();
                const prefix = '  '.repeat(listDepth) + (ordered ? (idx + '. ') : '- ');
                lines.push(prefix + inline);
                idx++;
                // Handle nested lists inside this li
                Array.from(li.children).forEach(child => {
                    const ct = (child.tagName || '').toUpperCase();
                    if (ct === 'UL' || ct === 'OL') _blockToMarkdown(child, lines, listDepth + 1);
                });
            });
            lines.push('');
        } else if (tag === 'BLOCKQUOTE') {
            lines.push('> ' + _inlineToMarkdown(el));
            lines.push('');
        } else if (tag === 'TABLE') {
            // Mammoth emits tables; for now, render as a simple text dump.
            // The existing Reports system handles tables via tokens, so users
            // who want real tables should use token chips ({{fha_table}} etc.)
            // rather than literal tables in the template.
            const rows = el.querySelectorAll('tr');
            rows.forEach(r => {
                const cells = Array.from(r.children).map(c => _inlineToMarkdown(c).trim()).filter(Boolean);
                if (cells.length) lines.push(cells.join(' · '));
            });
            lines.push('');
        } else if (tag === 'BR') {
            lines.push('');
        } else {
            // Fallback for unexpected blocks: treat as paragraph
            const text = _inlineToMarkdown(el).trim();
            if (text) { lines.push(text); lines.push(''); }
        }
    }

    function _inlineToMarkdown(node, excludeLists) {
        let out = '';
        node.childNodes.forEach(child => {
            if (child.nodeType === 3 /* text */) {
                out += child.nodeValue;
            } else if (child.nodeType === 1 /* element */) {
                const tag = (child.tagName || '').toUpperCase();
                if (child.classList && child.classList.contains('sl-tpl-chip')) {
                    const t = child.getAttribute('data-token') || '';
                    out += '{{' + t + '}}';
                } else if (tag === 'STRONG' || tag === 'B') {
                    out += '**' + _inlineToMarkdown(child) + '**';
                } else if (tag === 'EM' || tag === 'I') {
                    out += '*' + _inlineToMarkdown(child) + '*';
                } else if (tag === 'U') {
                    // Markdown doesn't have underline; pass through as plain
                    out += _inlineToMarkdown(child);
                } else if (tag === 'BR') {
                    out += '  \n';
                } else if (tag === 'A') {
                    const href = child.getAttribute('href') || '';
                    out += '[' + _inlineToMarkdown(child) + '](' + href + ')';
                } else if ((tag === 'UL' || tag === 'OL') && excludeLists) {
                    // Skip — handled by caller as nested block
                } else {
                    out += _inlineToMarkdown(child);
                }
            }
        });
        return out;
    }

    // ========================================================================
    // GENERATE — feed the markdown into the existing Reports.renderToDocx
    // pipeline which handles {{token}} substitution and produces a .docx blob.
    // ========================================================================
    async function _generateDocxFromMarkdown(markdown, reportType, systemId, appendices) {
        if (!window.Reports || typeof window.Reports.generate !== 'function') {
            throw new Error('Reports module unavailable. Reload the app.');
        }
        // Reports.generate accepts a customTemplateMarkdown option via the
        // internal generateWithMarkdown path. If the version of Reports loaded
        // doesn't expose that, fall back to a manual extract+render flow.
        // We use Reports.extractData via Reports + internal renderToDocx if
        // exposed, otherwise we call Reports.generate with the customDocxFile
        // option (which won't quite match because we have markdown not a file
        // — so we wrap it as a synthesized docx via the docx-js writer).

        // Cleanest path: call Reports._renderMarkdownToDocx if exported.
        // Fallback: call Reports.generate with customTemplateMarkdown.
        // We try both via the most-likely available shape.

        const R = window.Reports;
        const data = (typeof R.extractData === 'function')
            ? R.extractData(reportType, { systemId: systemId })
            : {};

        let blob;
        if (typeof R.renderToDocxFromMarkdown === 'function') {
            blob = await R.renderToDocxFromMarkdown(markdown, data, { appendices: appendices || {} });
        } else if (typeof R.renderToDocx === 'function') {
            blob = await R.renderToDocx(reportType, data, {
                appendices: appendices || {},
                customTemplateMarkdown: markdown
            });
        } else {
            throw new Error('Reports.renderToDocx is not available; cannot produce .docx.');
        }

        const baseName = (R.REPORT_DEFS && R.REPORT_DEFS[reportType] && R.REPORT_DEFS[reportType].name)
            ? R.REPORT_DEFS[reportType].name.replace(/[^A-Za-z0-9_-]+/g, '_')
            : 'Custom_Template_Report';
        const fileName = baseName + '_' + _todayISO() + '.docx';

        // Save via SaveFs if available, else trigger browser download
        if (typeof SaveFs !== 'undefined' && SaveFs.saveBlob) {
            await SaveFs.saveBlob(blob, fileName);
        } else {
            _downloadBlob(blob, fileName);
        }
        return { ok: true, fileName: fileName, blob: blob };
    }

    function _todayISO() {
        const d = new Date();
        return d.getFullYear() + '-' +
            String(d.getMonth()+1).padStart(2,'0') + '-' +
            String(d.getDate()).padStart(2,'0');
    }

    function _downloadBlob(blob, name) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
    }

    // ========================================================================
    // HELPERS — selection save/restore, toast, help
    // ========================================================================
    function _saveSelection(container) {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return null;
        const range = sel.getRangeAt(0);
        if (!container.contains(range.commonAncestorContainer)) return null;
        return range.cloneRange();
    }

    function _restoreSelection(container, range) {
        if (!range) return;
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function _moveCursorToStart(container) {
        const range = document.createRange();
        range.selectNodeContents(container);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function _showToast(msg, kind) {
        if (typeof window.showToast === 'function') { window.showToast(msg, kind || 'info'); return; }
        try { console[kind === 'error' ? 'error' : 'log']('[TemplateEditor]', msg); } catch (_) {}
    }

    function _showHelp() {
        const text = 'Tokens are placeholders that get replaced with data from your project when the report is generated.\n\n' +
            'Examples:\n' +
            '• {{project_name}} → your project\'s name\n' +
            '• {{fha_table}} → a full FHA worksheet, auto-rendered\n' +
            '• {{appendix:fta}} → an appendix with FTA diagrams\n\n' +
            'Click "+ Insert Token" in the toolbar to add tokens. ' +
            'Type around them like normal text — tokens delete as a single unit when you backspace.';
        if (typeof window.showToast === 'function') {
            window.showToast(text, 'info', { sticky: true });
        } else {
            alert(text);
        }
    }

    // ========================================================================
    // STYLES — injected once on first open. Theme-aware via CSS variables.
    // ========================================================================
    function _injectStyles() {
        if (document.getElementById('sl-tpl-editor-styles')) return;
        const style = document.createElement('style');
        style.id = 'sl-tpl-editor-styles';
        style.textContent = [
            '.sl-tpl-overlay { position: fixed; inset: 0; z-index: 2147483500; background: rgba(8,11,18,0.72); display: flex; align-items: stretch; justify-content: center; padding: 32px; font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }',
            '.sl-tpl-modal { background: var(--color-surface-1, #fff); color: var(--color-text-primary, #000); border-radius: 14px; box-shadow: 0 28px 80px rgba(0,0,0,0.45); width: 100%; max-width: 1100px; display: flex; flex-direction: column; overflow: hidden; }',
            '.sl-tpl-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid var(--color-border-thin, #e5e7eb); }',
            '.sl-tpl-title { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 600; }',
            '.sl-tpl-pill { background: linear-gradient(135deg, #4E63D8 0%, #af52de 100%); color: #fff; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 500; letter-spacing: 0.2px; }',
            '.sl-tpl-filename { font-weight: 500; color: var(--color-text-secondary, #555); }',
            '.sl-tpl-icon-btn { background: transparent; border: 0; font-size: 22px; cursor: pointer; color: var(--color-text-secondary, #666); padding: 4px 10px; border-radius: 8px; }',
            '.sl-tpl-icon-btn:hover { background: var(--color-surface-2, #f3f4f6); color: var(--color-text-primary, #000); }',

            '.sl-tpl-toolbar { display: flex; align-items: center; gap: 4px; padding: 10px 16px; border-bottom: 1px solid var(--color-border-thin, #e5e7eb); background: var(--color-surface-2, #f9fafb); flex-wrap: wrap; }',
            '.sl-tpl-tb-btn { background: var(--color-surface-1, #fff); border: 1px solid var(--color-border-thin, #e5e7eb); color: var(--color-text-primary, #000); padding: 6px 12px; border-radius: 7px; cursor: pointer; font-size: 13px; min-width: 32px; }',
            '.sl-tpl-tb-btn:hover { background: var(--color-surface-3, #f3f4f6); }',
            '.sl-tpl-tb-btn.is-active { background: rgba(0,122,255,0.12); border-color: rgba(0,122,255,0.4); color: #4E63D8; }',
            '.sl-tpl-tb-btn b, .sl-tpl-tb-btn i, .sl-tpl-tb-btn u { font-size: 13px; }',
            '.sl-tpl-tb-sep { width: 1px; height: 22px; background: var(--color-border-thin, #e5e7eb); margin: 0 4px; }',
            '.sl-tpl-tb-spacer { flex: 1; }',
            '.sl-tpl-tb-ghost { background: transparent; border-color: transparent; color: var(--color-text-secondary, #777); }',

            '.sl-tpl-token-picker { position: relative; }',
            '.sl-tpl-tb-token-btn { background: linear-gradient(135deg, rgba(0,122,255,0.12), rgba(175,82,222,0.12)); color: #4E63D8; border: 1px solid rgba(0,122,255,0.3); padding: 6px 12px; border-radius: 7px; cursor: pointer; font-size: 13px; font-weight: 500; }',
            '.sl-tpl-tb-token-btn:hover { background: linear-gradient(135deg, rgba(0,122,255,0.2), rgba(175,82,222,0.2)); }',
            '.sl-tpl-caret { margin-left: 4px; font-size: 10px; }',
            '.sl-tpl-token-menu { position: absolute; top: calc(100% + 6px); left: 0; min-width: 320px; max-height: 380px; overflow: auto; background: var(--color-surface-1, #fff); border: 1px solid var(--color-border-thin, #d5d5d5); border-radius: 10px; box-shadow: 0 14px 40px rgba(0,0,0,0.18); padding: 8px; z-index: 10; }',
            '.sl-tpl-token-search-wrap { padding: 0 4px 8px; border-bottom: 1px solid var(--color-border-thin, #eee); margin-bottom: 6px; }',
            '.sl-tpl-token-search { width: 100%; padding: 7px 10px; border: 1px solid var(--color-border-thin, #ddd); border-radius: 7px; font-size: 13px; background: var(--color-surface-2, #fafafa); color: var(--color-text-primary, #000); box-sizing: border-box; }',
            '.sl-tpl-token-group-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-secondary, #888); padding: 8px 6px 4px; }',
            '.sl-tpl-token-item { display: flex; justify-content: space-between; align-items: center; width: 100%; background: transparent; border: 0; padding: 7px 8px; border-radius: 6px; cursor: pointer; text-align: left; color: var(--color-text-primary, #000); font-size: 13px; }',
            '.sl-tpl-token-item:hover { background: rgba(0,122,255,0.08); }',
            '.sl-tpl-token-item-label { font-weight: 500; }',
            '.sl-tpl-token-item-code { color: var(--color-text-secondary, #777); font-size: 11px; font-family: ui-monospace, "SF Mono", Menlo, monospace; }',
            '.sl-tpl-token-empty { padding: 16px; text-align: center; color: var(--color-text-secondary, #888); font-size: 13px; }',

            '.sl-tpl-canvas-wrap { flex: 1; overflow: auto; background: var(--color-surface-2, #f5f5f7); padding: 24px; }',
            '.sl-tpl-canvas { background: var(--color-surface-1, #fff); border: 1px solid var(--color-border-thin, #e5e7eb); border-radius: 10px; padding: 48px 56px; min-height: 60vh; max-width: 8.5in; margin: 0 auto; font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: var(--color-text-primary, #000); outline: none; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }',
            '.sl-tpl-canvas:focus { border-color: rgba(0,122,255,0.4); box-shadow: 0 0 0 3px rgba(0,122,255,0.15); }',
            '.sl-tpl-canvas h1 { font-size: 24px; font-weight: 700; margin: 24px 0 12px; }',
            '.sl-tpl-canvas h2 { font-size: 19px; font-weight: 600; margin: 20px 0 10px; }',
            '.sl-tpl-canvas h3 { font-size: 16px; font-weight: 600; margin: 16px 0 8px; }',
            '.sl-tpl-canvas p { margin: 0 0 12px; }',
            '.sl-tpl-canvas ul, .sl-tpl-canvas ol { margin: 0 0 12px; padding-left: 28px; }',
            '.sl-tpl-canvas li { margin-bottom: 4px; }',
            '.sl-tpl-canvas table { border-collapse: collapse; margin: 12px 0; }',
            '.sl-tpl-canvas td, .sl-tpl-canvas th { border: 1px solid var(--color-border-thin, #ccc); padding: 6px 10px; }',
            '.sl-tpl-canvas strong, .sl-tpl-canvas b { font-weight: 700; }',
            '.sl-tpl-canvas em, .sl-tpl-canvas i { font-style: italic; }',

            '.sl-tpl-chip { display: inline-block; background: linear-gradient(135deg, rgba(0,122,255,0.14), rgba(175,82,222,0.14)); border: 1px solid rgba(0,122,255,0.35); color: #4E63D8; padding: 1px 7px; margin: 0 1px; border-radius: 5px; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; line-height: 1.5; white-space: nowrap; user-select: all; cursor: default; }',
            '.sl-tpl-chip:hover { background: linear-gradient(135deg, rgba(0,122,255,0.22), rgba(175,82,222,0.22)); }',
            '.sl-tpl-mini-chip { background: rgba(0,122,255,0.12); border: 1px solid rgba(0,122,255,0.3); color: #4E63D8; padding: 1px 5px; border-radius: 4px; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11px; }',

            '.sl-tpl-footer { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-top: 1px solid var(--color-border-thin, #e5e7eb); background: var(--color-surface-2, #f9fafb); gap: 16px; }',
            '.sl-tpl-help-text { font-size: 12px; color: var(--color-text-secondary, #666); flex: 1; }',
            '.sl-tpl-actions { display: flex; gap: 8px; flex-shrink: 0; }',
            '.sl-tpl-btn { padding: 9px 16px; border-radius: 8px; border: 1px solid var(--color-border-thin, #d5d5d5); background: var(--color-surface-1, #fff); color: var(--color-text-primary, #000); cursor: pointer; font-size: 13px; font-weight: 500; }',
            '.sl-tpl-btn:hover { background: var(--color-surface-2, #f3f4f6); }',
            '.sl-tpl-btn:disabled { opacity: 0.5; cursor: wait; }',
            '.sl-tpl-btn-primary { background: linear-gradient(135deg, #4E63D8 0%, #5856d6 100%); color: #fff; border: 0; }',
            '.sl-tpl-btn-primary:hover { background: linear-gradient(135deg, #006ce0 0%, #4e4bc7 100%); }',
            '.sl-tpl-btn-ghost { background: transparent; }',

            // Dark theme adjustments
            '[data-theme="dark"] .sl-tpl-overlay { background: rgba(0,0,0,0.78); }',
            '[data-theme="dark"] .sl-tpl-modal { background: var(--color-surface-1, #1c1c1e); color: var(--color-text-primary, #f5f5f7); }',
            '[data-theme="dark"] .sl-tpl-canvas { background: var(--color-surface-1, #1c1c1e); color: var(--color-text-primary, #f5f5f7); border-color: var(--color-border-thin, #3a3a3c); }',
            ''
        ].join('\n');
        document.head.appendChild(style);
    }

    // ========================================================================
    // EXPORT
    // ========================================================================
    window.TemplateEditor = {
        open: open,
        SCALAR_TOKENS:  SCALAR_TOKENS,
        TABLE_TOKENS:   TABLE_TOKENS,
        APPENDIX_TOKENS: APPENDIX_TOKENS
    };
    try { console.log('[TemplateEditor] Phase 56.53 loaded. window.TemplateEditor.open(file, opts) ready.'); } catch (_) {}

})();


// ============================================================================
// Phase 56.53f — Wire TemplateEditor into the existing report-gen modal
// ============================================================================
// Watches for the custom-template file input (#rpt-custom-template) in the
// existing Reports modal. When a .docx is selected, injects an "Open in
// Visual Editor" button beneath the file picker. Clicking the button opens
// the TemplateEditor with the current report context, and on save generates
// the .docx through the existing Reports pipeline.
// ============================================================================
(function() {
    'use strict';
    if (window._templateEditorIntegration) return;
    window._templateEditorIntegration = true;

    const FILE_INPUT_SELECTOR = '#rpt-custom-template';
    const BTN_ID = 'sl-tpl-edit-btn';

    function _findModalContext() {
        // Try to read the currently selected reportType, format, systemId,
        // appendices from the modal. The exact ids depend on which modal
        // version is open. We look for common ones.
        const ctx = {
            reportType: null,
            format:     'docx',
            systemId:   null,
            appendices: {}
        };
        // Report type — try a few likely selectors
        const rt = document.querySelector('#rpt-type, [name="rpt-type"], #report-type-select');
        if (rt && rt.value) ctx.reportType = rt.value;
        // Format
        const fmt = document.querySelector('input[name="rpt-format"]:checked, #rpt-format');
        if (fmt) ctx.format = fmt.value || 'docx';
        // System
        const sys = document.querySelector('#rpt-system, [name="rpt-system"]');
        if (sys && sys.value && sys.value !== '__none') ctx.systemId = sys.value;
        // Appendices
        const appBoxes = document.querySelectorAll('input[name="rpt-appendix"]:checked, #rpt-appendix-fta, #rpt-appendix-pra, #rpt-appendix-zsa, #rpt-appendix-cma');
        appBoxes.forEach(b => {
            const key = (b.id || '').replace('rpt-appendix-', '') || b.value;
            if (key && b.checked) ctx.appendices[key] = true;
        });
        return ctx;
    }

    function _ensureButton(fileInput) {
        if (!fileInput || !fileInput.parentNode) return;
        let btn = document.getElementById(BTN_ID);
        if (!btn) {
            btn = document.createElement('button');
            btn.id = BTN_ID;
            btn.type = 'button';
            btn.className = 'sl-tpl-launch-btn';
            btn.innerHTML = '<span class="sl-tpl-launch-icon">📝</span> Open in Visual Editor';
            btn.style.cssText = [
                'display:none',
                'margin-top:10px',
                'padding:9px 14px',
                'background:linear-gradient(135deg, rgba(0,122,255,0.14), rgba(175,82,222,0.14))',
                'color:#4E63D8',
                'border:1px solid rgba(0,122,255,0.35)',
                'border-radius:8px',
                'cursor:pointer',
                'font-size:13px',
                'font-weight:500',
                'width:100%'
            ].join(';');
            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'linear-gradient(135deg, rgba(0,122,255,0.22), rgba(175,82,222,0.22))';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'linear-gradient(135deg, rgba(0,122,255,0.14), rgba(175,82,222,0.14))';
            });
            fileInput.parentNode.insertBefore(btn, fileInput.nextSibling);

            btn.addEventListener('click', async function(ev) {
                ev.preventDefault();
                const file = fileInput.files && fileInput.files[0];
                if (!file) {
                    if (typeof window.showToast === 'function') window.showToast('Pick a .docx file first.', 'warning');
                    return;
                }
                const ctx = _findModalContext();
                btn.disabled = true;
                const prevText = btn.innerHTML;
                btn.innerHTML = '<span class="sl-tpl-launch-icon">⏳</span> Loading editor…';
                try {
                    await window.TemplateEditor.open(file, {
                        reportType: ctx.reportType || 'AFHA',
                        systemId:   ctx.systemId,
                        appendices: ctx.appendices,
                        autoGenerate: true
                    });
                } catch (e) {
                    console.error('[TemplateEditor] open failed', e);
                    if (typeof window.showToast === 'function') window.showToast('Could not open editor: ' + (e.message || e), 'error');
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = prevText;
                }
            });
        }
        const hasFile = fileInput.files && fileInput.files.length > 0;
        btn.style.display = hasFile ? 'inline-block' : 'none';
    }

    // Watch for the modal being shown — the file input id appears.
    // We also wire the change handler directly when we find it.
    function _scan() {
        const inp = document.querySelector(FILE_INPUT_SELECTOR);
        if (!inp) return;
        if (inp._tplWired) {
            _ensureButton(inp);
            return;
        }
        inp._tplWired = true;
        inp.addEventListener('change', () => _ensureButton(inp));
        _ensureButton(inp);
    }

    // Run on DOM ready, then periodically (cheap) to catch modal opens.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _scan);
    } else {
        _scan();
    }
    setInterval(_scan, 600);

    try { console.log('[TemplateEditor] Modal integration loaded.'); } catch (_) {}

})();

/* ============================================================================
 * #35 — First-run onramp / guided "Getting started" checklist.
 * A dismissible card that walks a NEW project down the golden thread. Each step
 * jumps to its tab and self-checks the moment its data exists. Suppressed once
 * dismissed, once every step is satisfied (a fresh load of an already-complete
 * project never nags), or when a sample project is loaded. READ-ONLY over app
 * state — it never mutates safety data, so it cannot touch the deterministic core.
 * ==========================================================================*/
(function () {
    'use strict';
    var ONRAMP_KEY = 'safetyLab.onrampState.v1';   // '' (open) | 'collapsed' | 'dismissed'
    function _len(x) { try { return (x && x.length) ? x.length : 0; } catch (_) { return 0; } }
    function _state() { try { return localStorage.getItem(ONRAMP_KEY) || ''; } catch (_) { return ''; } }
    function _setState(v) { try { localStorage.setItem(ONRAMP_KEY, v); } catch (_) {} }
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    // A page is not a tree until it has a top event. initNewProjectState() always
    // seeds one blank page (root: null), so counting pages marks this step done
    // before the user has drawn anything.
    function _treeCount() {
        try {
            if (typeof ftaPages === 'undefined' || !ftaPages || !ftaPages.length) return 0;
            var n = 0;
            for (var i = 0; i < ftaPages.length; i++) if (ftaPages[i] && ftaPages[i].root) n++;
            return n;
        } catch (_) { return 0; }
    }

    function _steps() {
        return [
            { label: 'Define aircraft functions', sub: 'What the aircraft must do — the top of the thread.', tab: 'ac-func', done: function () { return _len(typeof acFunctionsData !== 'undefined' && acFunctionsData) > 0; } },
            { label: 'Identify failure conditions', sub: 'Run the AFHA: hazards + severity, per ARP 4761A.', tab: 'ac-fha', done: function () { return _len(typeof acFhaData !== 'undefined' && acFhaData) > 0; } },
            { label: 'Add a system', sub: 'Allocate functions down to the systems that perform them.', tab: 'sys-dir', done: function () { return _len(typeof systemsData !== 'undefined' && systemsData) > 0; } },
            { label: 'Build a fault tree', sub: 'Decompose a hazard to its causes — λ stays yours to set.', tab: 'fta', done: function () { return _treeCount() > 0; } },
            { label: 'Generate requirements', sub: 'Then open the Golden Thread to watch it all connect.', tab: 'ac-req', done: function () { return _len(typeof acReqData !== 'undefined' && acReqData) > 0; } }
        ];
    }
    var _scheduled = false;
    function scheduleOnramp() { if (_scheduled) return; _scheduled = true; setTimeout(function () { _scheduled = false; try { renderOnramp(); } catch (_) {} }, 60); }
    function _wire(el) {
        Array.prototype.forEach.call(el.querySelectorAll('[data-go]'), function (n) {
            n.addEventListener('click', function (e) {
                e.preventDefault();
                var tab = this.getAttribute('data-go');
                try { if (typeof switchTab === 'function') switchTab(tab); } catch (_) {}
                scheduleOnramp();
            });
        });
        var head = el.querySelector('[data-act="toggle"]');
        if (head) head.addEventListener('click', function (e) {
            if (e.target.closest && e.target.closest('[data-act="dismiss"]')) return;
            var collapsed = el.classList.toggle('collapsed');
            _setState(collapsed ? 'collapsed' : '');
        });
        var x = el.querySelector('[data-act="dismiss"]');
        if (x) x.addEventListener('click', function (e) { e.stopPropagation(); _setState('dismissed'); el.remove(); });
    }
    function renderOnramp() {
        var st = _state();
        var el = document.getElementById('sl-onramp');
        if (st === 'dismissed') { if (el) el.remove(); return; }
        var steps = _steps();
        var results = steps.map(function (s) { try { return !!s.done(); } catch (_) { return false; } });
        var doneCount = results.filter(Boolean).length;
        var allDone = doneCount === steps.length;
        // Already-complete project on a fresh load → don't nag a returning power user.
        if (allDone && !el && st === '') { _setState('dismissed'); return; }
        if (!el) { el = document.createElement('div'); el.id = 'sl-onramp'; document.body.appendChild(el); }
        if (st === 'collapsed') el.classList.add('collapsed'); else el.classList.remove('collapsed');
        var head = '<div class="sl-onramp-head" data-act="toggle"><span class="sl-onramp-caret">▾</span>'
            + '<span class="sl-onramp-title">Getting started</span>'
            + '<span class="sl-onramp-prog">' + doneCount + '/' + steps.length + '</span>'
            + '<button class="sl-onramp-x" title="Dismiss" data-act="dismiss">×</button></div>';
        if (allDone) {
            el.innerHTML = head + '<div class="sl-onramp-body"><div class="sl-onramp-done-banner"><b>✓ You traced the thread.</b>'
                + 'Functions → hazards → systems → fault tree → requirements are all linked. Open the '
                + '<a href="#" data-go="golden-thread" style="color:var(--color-accent,#4E63D8);font-weight:600;">Golden Thread</a> to see it end to end.</div></div>';
            _wire(el); return;
        }
        var body = '';
        steps.forEach(function (s, i) {
            var d = results[i];
            body += '<div class="sl-onramp-step' + (d ? ' done' : '') + '" data-go="' + _esc(s.tab) + '">'
                + '<span class="sl-onramp-check">' + (d ? '✓' : '') + '</span>'
                + '<span><span class="sl-onramp-label">' + _esc(s.label) + '</span>'
                + '<span class="sl-onramp-sub">' + _esc(s.sub) + '</span></span></div>';
        });
        el.innerHTML = head + '<div class="sl-onramp-body">' + body
            + '<div class="sl-onramp-foot">Grounded in ARP 4761A / 4754B · click a step to jump there</div></div>';
        _wire(el);
    }
    // Public hooks — reopen from anywhere, or force a refresh after a data change.
    window.showOnramp = function () { _setState(''); try { renderOnramp(); } catch (_) {} };
    window._refreshOnramp = scheduleOnramp;
    // Refresh checkmarks whenever the user navigates (predicate-only, cheap).
    (function patchSwitchTab() {
        if (typeof window.switchTab === 'function') {
            var _o = window.switchTab;
            window.switchTab = function () { var r = _o.apply(this, arguments); try { scheduleOnramp(); } catch (_) {} setTimeout(function () { try { if (typeof _renderTabEmptyStates === 'function') _renderTabEmptyStates(); } catch (_) {} try { if (typeof _wsRenderInlineLocks === 'function') _wsRenderInlineLocks(); } catch (_) {} }, 50); return r; };
        }
    })();
    function boot() { try { renderOnramp(); } catch (_) {} }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 500); });
    else setTimeout(boot, 500);
})();

// ============================================================================
// Phase 63.10 — the ANEM dedication. Rest the pointer on ANEM for ten seconds
// and it tells you who it's named for.
// ============================================================================
(function () {
    let _anemTimer = null;
    function arm(el) {
        if (!el) return;
        el.addEventListener('mouseenter', function () {
            clearTimeout(_anemTimer);
            _anemTimer = setTimeout(function () {
                try { if (typeof showToast === 'function') showToast('✦ ANEM — named after Anya and Emma.', 'info', 7000); } catch (_) {}
            }, 10000);
        });
        el.addEventListener('mouseleave', function () { clearTimeout(_anemTimer); });
    }
    try { arm(document.getElementById('snav-anem')); arm(document.getElementById('tab-aichat')); } catch (_) {}
})();
