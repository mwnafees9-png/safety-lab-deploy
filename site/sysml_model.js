/* ============================================================================
 * sysml_model.js, v1.3, 13 Oct 2026: Safety Lab's model as a real SysML v2 model.
 * 13 Oct 2026 (v1.3, merge of integrate3 into fix3-M): both sets of additions below; still ONE editor provider
 *   (editorProvider / pick from the v1.2 merge; fix3-M's duplicate was dropped).
 * 13 Oct 2026 (v1.2, merge): the two rounds' additions together; ONE editor provider (editorProvider).
 * 13 Oct 2026 (v1.1, STPA control structure build): the STPA control structure gains the
 * Handbook's missing symbols, so the library and the mapping gain them too: Actuator, Sensor
 * and ExternalElement parts (refs stpa.act / stpa.sen / stpa.ext), Actuation and Measurement
 * connections (stpa.actu / stpa.meas), Controller.controlAlgorithm and OtherLink.linkType
 * (other input or output, or disturbance). Export, index, picker and import all carry them.
 * Plus SLSysML.pick(currentRef, opts) -> Promise<ref | null> (the picker without the field) and,
 * when no other provider is set, SLSysML becomes the SLDiagramEditor SysML provider, so every
 * diagram's "Link to model element" stores the same string ref as every other sysmlRef.
 * 13 Oct 2026 (hand-built bow-ties and event trees): the bow-tie's own elements (hazard, top
 *   event, threats, consequences, escalation factors: ref kind `bte`) and its pathways (`btl`,
 *   connections) export and import; barriers carry type, effectiveness, owner and role; event
 *   trees carry multi-outcome headings (outcomes), branch rules (sequenceRules), transfers
 *   (TransfersTo) and end state names and categories. The diagram editor's model-link button
 *   uses SLSysML (SLDiagramEditor.setSysmlProvider, set here once). See
 *   tests/regression_eta_bowtie_handbuild_20261013b.test.js
 * 13 Oct 2026 (v1.1 of fix3-M, now in v1.3): drawn reliability block diagrams export one RbdBlock (or StandbyGroup) per
 *   component, with its failure and repair rates, how many places it is drawn in and its model link, and
 *   the whole drawing (blocks, junctions, k-out-of-n nodes, links, positions) in the structure attribute,
 *   so an import rebuilds the same diagram. Markov models export degraded states, starting probabilities,
 *   the start state as the state machine's entry and repair transitions (@Rate repair). Library: RbdBlock
 *   repairRate and places, StandbyGroup, MarkovState degraded and initialProbability, Rate repair.
 *   See tests/regression_rbd_markov_diagrams_20261013b.test.js
 * ----------------------------------------------------------------------------
 * WHAT IT DOES
 *   1. MODEL INDEX. Every Safety Lab element that is about the system (aircraft
 *      functions, systems, items, resources, interfaces, zones, failure conditions,
 *      FHA rows, requirements, fault tree pages, gates and events, CCF groups, FMEA
 *      rows, STPA controllers / processes / control actions / feedback / UCAs,
 *      bow-tie barriers, event tree headings and outcomes, RBD blocks, Markov states
 *      and transitions, crew tasks and members, maintenance tasks) gets a stable
 *      SysML v2 identity: a ref (`kind:id`, see SYSML_API.md), a qualified name and
 *      an element id (a name-based UUID under the project's own namespace id), plus
 *      typed links to the system elements it is about. Existing link fields
 *      (realizedByItemId, traceIds, linkedFhaIds, linkedFcId, beId, providedBy,
 *      consumedBySystems, linkedPageId, markovModelId, ccfGroup, housedFunctions ...)
 *      are read and written as they are; `sysmlRef` on any element is the general
 *      "about" link on top of them.
 *   2. EXPORT. The whole project (or one area) as SysML v2 textual notation that
 *      imports the open SafetyLab library (sysml_safety_lib.sysml, embedded below
 *      byte for byte). Every export is checked in the tests by two independent
 *      SysML v2 validators: it must parse and link cleanly.
 *   3. IMPORT. SysML v2 text from Safety Lab, Sys Lab, Cameo 2026x or any other
 *      SysML v2 tool: architecture (part definitions and usages, connections,
 *      interfaces, flows), functions (action definitions and usages), requirements,
 *      and every SafetyLab library element. It previews what would be added and
 *      changed, matches by id then by name, never deletes, and lists everything it
 *      could not map. Export, import into an empty project, export again: the same
 *      text.
 *   4. UI. "Export SysML v2" / "Import SysML v2" in every Data Actions menu and the
 *      Project menu, house dialogs, plain language; SLSysML.linkPicker() and
 *      SLSysML.refLabel() for a "Model element" field any properties panel can
 *      reuse (the fault tree node drawer gets one here).
 *
 * RULES OF THIS FILE
 *   - The core (index, exportText, parse, planImport, applyImport) is pure over a
 *     project-shaped object P (the SLStores keys), so the browser and the Node
 *     tests run the same code. Only the UI section touches the DOM or the globals.
 *   - Reads never write. The project namespace id (projectConfig.sysml.ns) is
 *     created by an authored action only (export, import, picking a link).
 *   - Only what is on screen is computed: the index is built per area, lazily,
 *     and cached until the next save; the picker renders at most 200 rows.
 *   - Fault tree math, AI behavior and every existing store shape are untouched.
 *   - The SysML reader (tokenize / statements / interpret) is adapted from Sys
 *     Lab's src/sysml.js (7 Oct 2026), the sister tool's validated reader.
 * ==========================================================================*/
(function (root) {
    'use strict';

    // ======================================================== the library
    // Byte-identical copy of site/sysml_safety_lib.sysml (pinned by the regression test).
    var LIBRARY_FILE = 'SafetyLab.sysml';
    var LIBRARY_TEXT = "/* SafetyLab: an open SysML v2 library for safety, reliability and human factors analysis.\n   Version 1.2, 13 Oct 2026 (1.1 adds the STPA Handbook's actuators, sensors, external elements, actuation\n   and measurement links, the controller's control algorithm and the link type of other links; event tree\n   and bow-tie extras; 1.2 adds RbdBlock repairRate and places, StandbyGroup, MarkovState degraded and\n   initialProbability, Rate repair). Published by Safety Lab Aero for use in any SysML v2 tool.\n   Modeled on the concepts of OMG RAAML 1.1 and 1.2 (fault trees, FMEA, FHA, STPA), which exist only as a\n   SysML v1 profile, and on open SysML v2 work for STPA (Ahlbrecht et al., Systems Engineering, 2025).\n   Every Safety Lab export imports this package; Safety Lab reads it back on import. */\nlibrary package SafetyLab {\n    doc /* Definitions for failure conditions, FHA entries, fault trees, common cause, FMEA, STPA, bow-ties,\n           event trees, reliability block diagrams, Markov models, human factors and maintenance tasks,\n           plus the typed links that tie each of them to the system elements they are about. */\n    private import ScalarValues::*;\n\n    /* ---------- value types ---------- */\n    enum def Severity {\n        doc /* Failure condition classification (ARP4761A, AC 25.1309-1B). */\n        enum noSafetyEffect;\n        enum minor;\n        enum major;\n        enum hazardous;\n        enum catastrophic;\n    }\n    enum def GateKind {\n        doc /* Fault tree gates (IEC 61025, NASA Fault Tree Handbook). */\n        enum andGate;\n        enum orGate;\n        enum xorGate;\n        enum votingGate;\n        enum inhibitGate;\n        enum transferGate;\n        enum priorityAndGate;\n        enum spareGate;\n        enum functionalDependencyGate;\n        enum sequenceEnforcingGate;\n        enum notGate;\n    }\n    enum def EventKind {\n        doc /* Fault tree events (IEC 61025). */\n        enum basicEvent;\n        enum undevelopedEvent;\n        enum conditioningEvent;\n        enum houseEvent;\n    }\n    enum def FailureConditionKind {\n        doc /* How a failure condition relates to its function (FHA functional failure set). */\n        enum totalLoss;\n        enum partialLoss;\n        enum malfunction;\n        enum combined;\n    }\n    enum def GuideWord {\n        doc /* The four ways a control action can be unsafe (STPA Handbook, SAE J3307). */\n        enum notProvided;\n        enum providedCausesHazard;\n        enum wrongTimingOrOrder;\n        enum stoppedTooSoonOrAppliedTooLong;\n    }\n    enum def ControllerKind {\n        enum human;\n        enum automation;\n        enum organization;\n    }\n    enum def BarrierSide {\n        enum preventive;\n        enum mitigative;\n    }\n\n    /* ---------- identity and links ---------- */\n    metadata def Ident {\n        doc /* The stable identity of an exported element: the Safety Lab key and its SysML element id. */\n        attribute key : String;\n        attribute elementId : String[0..1];\n        attribute label : String[0..1];\n        attribute localId : String[0..1];\n        attribute unresolved : String[0..1];\n    }\n    abstract metadata def SafetyLink {\n        doc /* A typed link from a safety element to what it is about. Used on dependencies. */\n    }\n    metadata def About :> SafetyLink;\n    metadata def Assesses :> SafetyLink;\n    metadata def Analyzes :> SafetyLink;\n    metadata def Mitigates :> SafetyLink;\n    metadata def RealizedBy :> SafetyLink;\n    metadata def ContributesTo :> SafetyLink;\n    metadata def MemberOf :> SafetyLink;\n    metadata def TransfersTo :> SafetyLink;\n    metadata def QuantifiedBy :> SafetyLink;\n    metadata def ProvidedBy :> SafetyLink;\n    metadata def ConsumedBy :> SafetyLink;\n    metadata def Houses :> SafetyLink;\n    metadata def Covers :> SafetyLink;\n    metadata def LeadsTo :> SafetyLink;\n    metadata def PerformedBy :> SafetyLink;\n    metadata def Cites :> SafetyLink;\n    metadata def TracesTo :> SafetyLink;\n    metadata def Rate {\n        doc /* A Markov transition rate, per hour. repair = true marks a repair (restoration) transition. */\n        attribute perHour : Real;\n        attribute repair : Boolean[0..1];\n    }\n\n    /* ---------- architecture ---------- */\n    abstract part def SafetyElement;\n    part def AircraftModel :> SafetyElement {\n        doc /* The whole aircraft: its systems and the interfaces between them. */\n    }\n    part def System :> SafetyElement {\n        attribute role : String[0..1];\n    }\n    part def Item :> SafetyElement {\n        doc /* An item, LRU or component that realizes part of a system. */\n        attribute itemType : String[0..1];\n        attribute dal : String[0..1];\n        attribute assuranceType : String[0..1];\n    }\n    part def SharedResource :> SafetyElement {\n        doc /* A resource several systems depend on (power, hydraulics, a data bus). */\n        attribute resourceType : String[0..1];\n    }\n    connection def SystemInterface {\n        end part a : SafetyElement;\n        end part b : SafetyElement;\n        attribute interfaceKind : String[0..1];\n        attribute direction : String[0..1];\n        attribute medium : String[0..1];\n        attribute icdRef : String[0..1];\n    }\n    part def Zone :> SafetyElement {\n        attribute equipment : String[0..1];\n        attribute severityLabel : String[0..1];\n        attribute interference : String[0..1];\n        attribute mitigation : String[0..1];\n    }\n    part def Routing :> SafetyElement {\n        attribute routingKind : String[0..1];\n    }\n\n    /* ---------- functions and requirements ---------- */\n    action def AircraftFunction;\n    action def SystemFunction;\n    requirement def SafetyRequirement {\n        attribute level : String[0..1];\n        attribute requirementType : String[0..1];\n        attribute rationale : String[0..1];\n        attribute verificationMethod : String[0..1];\n        attribute verificationStatus : String[0..1];\n        attribute traceId : String[0..1];\n    }\n    part def Assumption :> SafetyElement {\n        attribute assumptionType : String[0..1];\n        attribute assumptionState : String[0..1];\n        attribute validationStrategy : String[0..1];\n        attribute routeTo : String[0..1];\n    }\n\n    /* ---------- FHA ---------- */\n    part def FailureCondition :> SafetyElement {\n        doc /* A failure condition: the effect on the aircraft of a function failing in a given way. */\n        attribute failureKind : FailureConditionKind[0..1];\n        attribute additional : Boolean[0..1];\n        attribute awareness : String[0..1];\n        attribute functionRef : String[0..1];\n    }\n    part def FhaEntry :> SafetyElement {\n        doc /* One row of a functional hazard assessment: a failure condition classified in its flight phases. */\n        attribute severity : Severity[0..1];\n        attribute severityLabel : String[0..1];\n        attribute phases : String[0..1];\n        attribute effectOnAircraft : String[0..1];\n        attribute effectOnCrew : String[0..1];\n        attribute effectOnOccupants : String[0..1];\n        attribute functionRef : String[0..1];\n    }\n\n    /* ---------- fault trees and common cause ---------- */\n    part def FaultTree :> SafetyElement {\n        attribute treeLevel : String[0..1];\n        attribute mode : String[0..1];\n        attribute asBuiltFactor : Real[0..1];\n    }\n    abstract part def FaultTreeNode :> SafetyElement {\n        attribute logicalId : String[0..1];\n    }\n    part def Gate :> FaultTreeNode {\n        attribute gateKind : GateKind[0..1];\n        attribute gateKindLabel : String[0..1];\n        attribute votingK : Integer[0..1];\n        attribute dalOption : String[0..1];\n    }\n    part def Event :> FaultTreeNode {\n        attribute eventKind : EventKind[0..1];\n        attribute eventKindLabel : String[0..1];\n        attribute probability : Real[0..1];\n        attribute failureRate : Real[0..1];\n        attribute inputMode : String[0..1];\n        attribute exposureMode : String[0..1];\n        attribute exposureTime : Real[0..1];\n        attribute repairModel : String[0..1];\n        attribute repairTime : Real[0..1];\n        attribute libraryKey : String[0..1];\n    }\n    part def CommonCauseGroup :> SafetyElement {\n        attribute beta : Real[0..1];\n    }\n    part def CommonModeAnalysis :> SafetyElement {\n        attribute claim : String[0..1];\n        attribute modes : String[0..1];\n        attribute findings : String[0..1];\n        attribute mitigation : String[0..1];\n        attribute status : String[0..1];\n        attribute scope : String[0..1];\n    }\n    part def ParticularRisk :> SafetyElement {\n        attribute affectedSystems : String[0..1];\n        attribute affectedSystemIds : String[0..1];\n        attribute csfl : String[0..1];\n        attribute mitigation : String[0..1];\n    }\n\n    /* ---------- FMEA ---------- */\n    part def FailureMode :> SafetyElement {\n        doc /* One FMEA line: a way an item or function fails, and its effects. */\n        attribute fmeaType : String[0..1];\n        attribute scope : String[0..1];\n        attribute itemName : String[0..1];\n        attribute phase : String[0..1];\n        attribute localEffect : String[0..1];\n        attribute nextEffect : String[0..1];\n        attribute endEffect : String[0..1];\n        attribute detection : String[0..1];\n        attribute severityLabel : String[0..1];\n        attribute compensating : String[0..1];\n        attribute remarks : String[0..1];\n        attribute failureRate : Real[0..1];\n        attribute exposureTime : Real[0..1];\n        attribute libraryKey : String[0..1];\n    }\n    part def FailureEffect :> SafetyElement {\n        attribute effectLevel : String[0..1];\n    }\n\n    /* ---------- STPA ---------- */\n    part def ControlStructure :> SafetyElement;\n    part def Controller :> SafetyElement {\n        attribute controllerKind : ControllerKind[0..1];\n        attribute controllerKindLabel : String[0..1];\n        attribute rank : Integer[0..1];\n        attribute processModel : String[0..1];\n        attribute controlAlgorithm : String[0..1];\n    }\n    part def ControlledProcess :> SafetyElement;\n    part def Actuator :> SafetyElement {\n        doc /* Turns a controller's control action into a physical action on the controlled process (STPA Handbook, Leveson and Thomas 2018). */\n    }\n    part def Sensor :> SafetyElement {\n        doc /* Measures the controlled process and carries the feedback back to a controller (STPA Handbook). */\n    }\n    part def ExternalElement :> SafetyElement {\n        doc /* Outside the control structure: the environment or another system that sends disturbances or other inputs. */\n    }\n    connection def ControlAction {\n        end part source : SafetyElement;\n        end part target : SafetyElement;\n    }\n    connection def Feedback {\n        end part source : SafetyElement;\n        end part target : SafetyElement;\n    }\n    connection def OtherLink {\n        end part source : SafetyElement;\n        end part target : SafetyElement;\n        attribute linkType : String[0..1];\n    }\n    connection def Actuation {\n        doc /* An actuator acting on the element it controls. */\n        end part source : SafetyElement;\n        end part target : SafetyElement;\n    }\n    connection def Measurement {\n        doc /* A sensor measuring an element. */\n        end part source : SafetyElement;\n        end part target : SafetyElement;\n    }\n    part def Loss :> SafetyElement;\n    part def Hazard :> SafetyElement {\n        attribute group : String[0..1];\n    }\n    part def SafetyConstraint :> SafetyElement;\n    part def UnsafeControlAction :> SafetyElement {\n        attribute guideWord : GuideWord[0..1];\n        attribute context : String[0..1];\n        attribute status : String[0..1];\n        attribute rationale : String[0..1];\n    }\n\n    /* ---------- bow-ties (CCPS / Energy Institute) and event trees (IEC 62502) ---------- */\n    part def BowTie :> SafetyElement;\n    part def BowTieHazard :> SafetyElement {\n        doc /* The hazard of a bow-tie: what can cause harm while it is kept under control. */\n    }\n    part def TopEvent :> SafetyElement {\n        doc /* The moment control of the hazard is lost: the knot of the bow-tie. */\n    }\n    part def Threat :> SafetyElement {\n        doc /* A cause that can release the hazard into the top event. */\n    }\n    part def Consequence :> SafetyElement {\n        doc /* An outcome of the top event. */\n        attribute severityLabel : String[0..1];\n        attribute consequenceCategory : String[0..1];\n        attribute linkedFcId : String[0..1];\n    }\n    part def EscalationFactor :> SafetyElement {\n        doc /* A condition that makes a barrier fail or work less well. */\n    }\n    part def Barrier :> SafetyElement {\n        attribute side : BarrierSide[0..1];\n        attribute barrierRole : String[0..1];\n        attribute barrierType : String[0..1];\n        attribute effectiveness : String[0..1];\n        attribute barrierOwner : String[0..1];\n        attribute failureProbability : Real[0..1];\n        attribute traceKind : String[0..1];\n        attribute traceRef : String[0..1];\n        attribute traceLogicalId : String[0..1];\n        attribute principleId : String[0..1];\n        attribute requirementId : String[0..1];\n    }\n    connection def BowTiePathway {\n        doc /* A pathway: threat to barrier to top event, or top event to barrier to consequence. */\n        end part source : SafetyElement;\n        end part target : SafetyElement;\n    }\n    connection def EscalationPathway {\n        doc /* An escalation factor to the barrier it degrades, through escalation factor barriers. */\n        end part source : SafetyElement;\n        end part target : SafetyElement;\n    }\n    connection def HazardRelease {\n        end part source : SafetyElement;\n        end part target : SafetyElement;\n    }\n    part def EventTree :> SafetyElement {\n        attribute initiatorFrequency : Real[0..1];\n        attribute initiatorFromTransfers : Boolean[0..1];\n        attribute sequenceRules : String[0..1];\n    }\n    part def EventTreeHeading :> SafetyElement {\n        attribute failureProbability : Real[0..1];\n        attribute couplingProbability : Real[0..1];\n        attribute outcomes : String[0..1];\n    }\n    part def EventTreeOutcome :> SafetyElement {\n        attribute path : String[0..1];\n        attribute severityLabel : String[0..1];\n        attribute linkedFcId : String[0..1];\n        attribute endState : String[0..1];\n        attribute consequenceCategory : String[0..1];\n    }\n\n    /* ---------- reliability block diagrams and Markov models ---------- */\n    part def ReliabilityBlockDiagram :> SafetyElement {\n        attribute structure : String[0..1];\n    }\n    part def RbdBlock :> SafetyElement {\n        doc /* One component of a reliability block diagram (IEC 61078). A block drawn in several places is one component. */\n        attribute failureRate : Real[0..1];\n        attribute repairRate : Real[0..1];\n        attribute places : Integer[0..1];\n    }\n    part def StandbyGroup :> RbdBlock {\n        doc /* One unit working, the others waiting; a waiting unit fails at dormancyFactor times failureRate; each switch-over works with probability switchSuccess. */\n        attribute units : Integer[0..1];\n        attribute dormancyFactor : Real[0..1];\n        attribute switchSuccess : Real[0..1];\n    }\n    state def MarkovModel;\n    state def MarkovState {\n        doc /* A state of a Markov model (IEC 61165): failed states count in P(failed); degraded states work with reduced capability. */\n        attribute failed : Boolean[0..1];\n        attribute degraded : Boolean[0..1];\n        attribute initialProbability : Real[0..1];\n    }\n\n    /* ---------- human factors and maintenance ---------- */\n    part def CrewMember :> SafetyElement;\n    action def CrewTask {\n        attribute phase : String[0..1];\n        attribute timeSeconds : Real[0..1];\n        attribute reactionSeconds : Real[0..1];\n        attribute executionSeconds : Real[0..1];\n        attribute basis : String[0..1];\n        attribute channels : String[0..1];\n        attribute notes : String[0..1];\n    }\n    action def MaintenanceTask {\n        attribute intervalHours : Real[0..1];\n        attribute activeRepairHours : Real[0..1];\n        attribute logisticsHours : Real[0..1];\n        attribute adminHours : Real[0..1];\n    }\n}\n";

    // ======================================================== small helpers
    var hasOwn = Object.prototype.hasOwnProperty;
    function S(v) { return v == null ? '' : String(v); }
    function arr(v) { return Array.isArray(v) ? v : []; }
    function q(s) { return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }
    function dq(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r\n?/g, '\n').replace(/\n/g, '\\n').replace(/\t/g, '\\t') + '"'; }
    function docText(s) { return String(s || '').replace(/\*\//g, '* /').replace(/\r\n?/g, '\n').split('\n').map(function (l) { return l.replace(/\s+$/, ''); }).join('\n').trim(); }
    function numText(n) {
        if (typeof n !== 'number' || !isFinite(n)) return null;
        var t = String(n);
        if (/e/.test(t)) { var m = /^(-?\d+(?:\.\d+)?)e([+-]?\d+)$/.exec(t); if (m) t = m[1] + 'E' + m[2]; }
        return t;
    }
    function toNum(v) { if (v === '' || v == null) return null; var n = typeof v === 'number' ? v : Number(v); return isFinite(n) ? n : null; }
    function clip(s, n) { s = S(s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '...' : s; }

    // ---- SHA-1 and name-based UUIDs (RFC 4122 v5) for stable element ids -----
    function sha1(bytes) {
        var h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
        var ml = bytes.length, withOne = ml + 1, padLen = (withOne % 64 <= 56) ? 56 - (withOne % 64) : 120 - (withOne % 64);
        var total = withOne + padLen + 8, buf = new Uint8Array(total);
        buf.set(bytes); buf[ml] = 0x80;
        var bits = ml * 8; buf[total - 4] = (bits >>> 24) & 255; buf[total - 3] = (bits >>> 16) & 255; buf[total - 2] = (bits >>> 8) & 255; buf[total - 1] = bits & 255;
        buf[total - 5] = Math.floor(bits / 4294967296) & 255;
        var w = new Array(80);
        for (var off = 0; off < total; off += 64) {
            for (var i = 0; i < 16; i++) w[i] = (buf[off + i * 4] << 24) | (buf[off + i * 4 + 1] << 16) | (buf[off + i * 4 + 2] << 8) | buf[off + i * 4 + 3];
            for (i = 16; i < 80; i++) { var x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]; w[i] = (x << 1) | (x >>> 31); }
            var a = h0, b = h1, c = h2, d = h3, e = h4;
            for (i = 0; i < 80; i++) {
                var f, k;
                if (i < 20) { f = (b & c) | (~b & d); k = 0x5A827999; } else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; } else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; } else { f = b ^ c ^ d; k = 0xCA62C1D6; }
                var t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) | 0;
                e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = t;
            }
            h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
        }
        var out = new Uint8Array(20);
        [h0, h1, h2, h3, h4].forEach(function (h, j) { out[j * 4] = (h >>> 24) & 255; out[j * 4 + 1] = (h >>> 16) & 255; out[j * 4 + 2] = (h >>> 8) & 255; out[j * 4 + 3] = h & 255; });
        return out;
    }
    function utf8(s) {
        if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
        var out = [], str = unescape(encodeURIComponent(s));
        for (var i = 0; i < str.length; i++) out.push(str.charCodeAt(i));
        return new Uint8Array(out);
    }
    function hexToBytes(hex) { var h = hex.replace(/-/g, ''), out = new Uint8Array(h.length / 2); for (var i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16); return out; }
    var _nsBytes = { k: null, v: null };
    function uuid5(nsUuid, name) {
        if (_nsBytes.k !== nsUuid) { _nsBytes.k = nsUuid; _nsBytes.v = hexToBytes(nsUuid); }
        var ns = _nsBytes.v, nm = utf8(name), all = new Uint8Array(ns.length + nm.length);
        all.set(ns); all.set(nm, ns.length);
        var h = sha1(all);
        h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80;
        var hex = ''; for (var i = 0; i < 16; i++) hex += (h[i] < 16 ? '0' : '') + h[i].toString(16);
        return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20, 32);
    }
    // The fixed namespace every Safety Lab project namespace is derived under.
    var SL_ROOT_NS = '6f1d2c3a-5b4e-5f60-8a71-0c2d3e4f5a6b';
    function newProjectNs() {
        var b = new Uint8Array(16);
        try { (root.crypto || {}).getRandomValues(b); } catch (_) { for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
        if (!b.some(function (x) { return x; })) for (var j = 0; j < 16; j++) b[j] = Math.floor(Math.random() * 256);
        b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
        var hex = ''; for (var k = 0; k < 16; k++) hex += (b[k] < 16 ? '0' : '') + b[k].toString(16);
        return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20, 32);
    }
    function projectNs(P) {
        var c = P.projectConfig && P.projectConfig.sysml;
        if (c && /^[0-9a-f-]{36}$/i.test(c.ns || '')) return { ns: c.ns, provisional: false };
        return { ns: uuid5(SL_ROOT_NS, 'project:' + S(P.projectName)), provisional: true };
    }
    function ensureProjectNs(P) {
        if (!P.projectConfig || typeof P.projectConfig !== 'object') return null;
        if (!P.projectConfig.sysml || typeof P.projectConfig.sysml !== 'object') P.projectConfig.sysml = {};
        if (!/^[0-9a-f-]{36}$/i.test(P.projectConfig.sysml.ns || '')) P.projectConfig.sysml.ns = newProjectNs();
        return P.projectConfig.sysml.ns;
    }

    // ======================================================== vocabularies
    var SEVERITY = { 'no safety effect': 'noSafetyEffect', 'minor': 'minor', 'major': 'major', 'hazardous': 'hazardous', 'catastrophic': 'catastrophic' };
    var SEVERITY_BACK = { noSafetyEffect: 'No Safety Effect', minor: 'Minor', major: 'Major', hazardous: 'Hazardous', catastrophic: 'Catastrophic' };
    var GATE = { AND: 'andGate', OR: 'orGate', XOR: 'xorGate', VOTING: 'votingGate', INHIBIT: 'inhibitGate', TRANSFER: 'transferGate', PAND: 'priorityAndGate', SPARE: 'spareGate', FDEP: 'functionalDependencyGate', SEQ: 'sequenceEnforcingGate', NOT: 'notGate' };
    var EVENT = { basic: 'basicEvent', undeveloped: 'undevelopedEvent', conditioning: 'conditioningEvent', house: 'houseEvent' };
    var GUIDE = { np: 'notProvided', ph: 'providedCausesHazard', wt: 'wrongTimingOrOrder', ss: 'stoppedTooSoonOrAppliedTooLong' };
    var FCKIND = { tl: 'totalLoss', pl: 'partialLoss', m: 'malfunction', cb: 'combined', plx: 'partialLoss', mx: 'malfunction' };
    function inv(o) { var r = {}; Object.keys(o).forEach(function (k) { r[o[k]] = k; }); return r; }
    var GATE_BACK = inv(GATE), EVENT_BACK = inv(EVENT), GUIDE_BACK = inv(GUIDE);

    // ======================================================== the model tree
    // A node of the exported model: kw (keyword), short, name, type, spec, ref (Safety Lab ref),
    // label (the Safety Lab name when the SysML name had to differ), attrs [[name, text]],
    // doc, kids, ends (connections), links [{meta, to}], raw (extra lines).
    function El(kw, o) { var e = { kw: kw, short: null, name: null, type: null, spec: null, ref: null, label: null, attrs: [], doc: '', kids: [], links: [], parent: null }; for (var k in o) if (hasOwn.call(o, k)) e[k] = o[k]; return e; }
    function add(parent, el) { el.parent = parent; parent.kids.push(el); return el; }
    function attr(el, name, kind, v) {
        if (v == null || v === '') return;
        var t = null;
        if (kind === 'str') t = dq(v);
        else if (kind === 'num') t = numText(toNum(v));
        else if (kind === 'int') { var n = toNum(v); t = n == null ? null : String(Math.round(n)); }
        else if (kind === 'bool') t = v ? 'true' : 'false';
        else if (kind.indexOf('enum:') === 0) t = 'SafetyLab::' + kind.slice(5) + '::' + v;
        if (t != null) el.attrs.push([name, t]);
    }
    // A typed link. field/raw: the Safety Lab field it came from and the value written there, so a link
    // that points at nothing in this project is kept as written (Ident.unresolved) instead of lost.
    function link(el, meta, to, field, raw) {
        if (to) el.links.push({ meta: meta, to: to, field: field, raw: raw });
        else if (field && raw != null && raw !== '') unres(el, field, raw);
    }
    function unres(el, field, raw) { var u = el.unres || (el.unres = {}); (u[field] = u[field] || []).push(raw); }

    // Names in one namespace: a SysML name and short name must not repeat (case-insensitive,
    // so tools that fold case agree), and a short name equal to its own name is dropped
    // (one validator reads that as two candidates).
    function nsFix(parent) {
        var used = Object.create(null);
        parent.kids.forEach(function (e) {
            var raw = S(e.name).replace(/\s+/g, ' ').trim();
            var name = raw || S(e.short) || 'unnamed';
            var sh = e.short != null && S(e.short).trim() ? S(e.short).trim() : null;
            if (sh && (sh.toLowerCase() === name.toLowerCase() || used[sh.toLowerCase()])) { if (e.ref) e.localId = sh; sh = null; }
            if (sh) used[sh.toLowerCase()] = 1;
            if (used[name.toLowerCase()]) {
                var base = name + (e.short ? ' (' + e.short + ')' : ''), n = base, i = 2;
                while (used[n.toLowerCase()]) n = base + ' ' + i++;
                name = n;
            }
            used[name.toLowerCase()] = 1;
            if (name !== raw && e.ref && e.label == null) e.label = S(e.name);
            e.name = name; e.short = sh;
            if (e.kids.length) nsFix(e);
        });
    }
    function seg(e) { return q(e.short || e.name); }
    function qn(e) { var parts = []; for (var x = e; x && x.kw !== 'model'; x = x.parent) parts.unshift(seg(x)); return parts; }

    // ======================================================== refs
    function iidOf(r) { return r && r.internalId != null ? String(r.internalId) : ''; }
    function ifaceId(f, i, list) {
        if (f && f.icdRef && list.filter(function (x) { return x && x.icdRef === f.icdRef; }).length === 1) return S(f.icdRef);
        var n = 0; for (var j = 0; j < i; j++) if (list[j] && list[j].fromSystemId === f.fromSystemId && list[j].toSystemId === f.toSystemId) n++;
        return S(f.fromSystemId) + '>' + S(f.toSystemId) + '#' + (n + 1);
    }
    function refOf(kind, o, ctx) {
        ctx = ctx || {};
        switch (kind) {
            case 'sys': return 'sys:' + o.id;
            case 'afn': return 'afn:' + o.funcId;
            case 'fn': case 'item': case 'res': case 'zone': case 'route': case 'fha': case 'req': case 'cma': case 'pra': case 'fmea': return kind + ':' + iidOf(o);
            case 'sfn': case 'sfha': case 'sreq': return kind + ':' + ctx.systemId + '/' + iidOf(o);
            case 'fc': return 'fc:' + (o.fcId || o.id);
            case 'sfc': return 'sfc:' + ctx.systemId + '/' + (o.fcId || o.id);
            case 'asm': return 'asm:' + o.asmId;
            case 'ft': return 'ft:' + o.id;
            case 'ftn': return 'ftn:' + ctx.pageId + '/' + o.id;
            default: return kind + ':' + (o.id != null ? o.id : o);
        }
    }

    // ======================================================== project accessors
    function systems(P) { return arr(P.systemsData); }
    function cfg(P) { return P.projectConfig || {}; }
    function stpa(P) { var d = P.stpaData; return d && d.cs ? d : null; }
    function hfStore(P, k) { var h = cfg(P).hf; return h && h[k] && Array.isArray(h[k].rows) ? h[k].rows : []; }
    function kidsOf(n) { return Array.isArray(n.children) && n.children.length ? n.children : (Array.isArray(n._children) ? n._children : arr(n.children)); }

    // Lookups the export needs to turn stored ids into refs (built once per export).
    function lookups(P) {
        var L = { fnBySub: Object.create(null), fnByIid: Object.create(null), sfnBySys: Object.create(null), itemByIid: Object.create(null), itemById: Object.create(null),
            fcAc: Object.create(null), fcSys: Object.create(null), fhaByIid: Object.create(null), reqById: Object.create(null), reqByIid: Object.create(null), asm: Object.create(null),
            fmeaByIid: Object.create(null), zoneById: Object.create(null), mk: Object.create(null), et: Object.create(null), sysById: Object.create(null) };
        // the fault tree maps walk every node: built only when an area that links to nodes asks for them
        var ft = null;
        var ftMaps = function () {
            if (ft) return ft;
            ft = { page: Object.create(null), nodeById: Object.create(null), nodeByDisp: Object.create(null) };
            arr(P.ftaPages).forEach(function (pg) {
                ft.page[pg.id] = 'ft:' + pg.id;
                (function walk(n) { if (!n) return; var r = 'ftn:' + pg.id + '/' + n.id; if (!ft.nodeById[n.id]) ft.nodeById[n.id] = r; if (n.displayId && !ft.nodeByDisp[n.displayId]) ft.nodeByDisp[n.displayId] = r; kidsOf(n).forEach(walk); })(pg.root);
            });
            return ft;
        };
        ['page', 'nodeById', 'nodeByDisp'].forEach(function (k) { Object.defineProperty(L, k, { enumerable: true, get: function () { return ftMaps()[k]; } }); });
        arr(P.acFunctionsData).forEach(function (r) { if (r.subId && !L.fnBySub[r.subId]) L.fnBySub[r.subId] = refOf('fn', r); L.fnByIid[iidOf(r)] = refOf('fn', r); });
        systems(P).forEach(function (s) {
            L.sysById[s.id] = 'sys:' + s.id;
            var m = L.sfnBySys[s.id] = Object.create(null);
            arr(s.functions).forEach(function (f) { if (f.funcId && !m[f.funcId]) m[f.funcId] = refOf('sfn', f, { systemId: s.id }); });
            var fs = L.fcSys[s.id] = Object.create(null);
            fcimFcs(s.fcim).forEach(function (fc) { if (!fs[fc.id]) fs[fc.id] = 'sfc:' + s.id + '/' + fc.id; });
            arr(s.fha).forEach(function (r) { if (r.fcId && !fs[r.fcId]) fs[r.fcId] = 'sfc:' + s.id + '/' + r.fcId; L.fhaByIid[iidOf(r)] = refOf('sfha', r, { systemId: s.id }); });
            arr(s.req).forEach(function (r) { L.reqByIid[iidOf(r)] = refOf('sreq', r, { systemId: s.id }); if (r.id && !L.reqById[r.id]) L.reqById[r.id] = refOf('sreq', r, { systemId: s.id }); });
        });
        arr(P.itemsData).forEach(function (r) { L.itemByIid[iidOf(r)] = refOf('item', r); if (r.itemId && !L.itemById[r.itemId]) L.itemById[r.itemId] = refOf('item', r); });
        fcimFcs(P.acFcimData).forEach(function (fc) { if (!L.fcAc[fc.id]) L.fcAc[fc.id] = 'fc:' + fc.id; });
        arr(P.acFhaData).forEach(function (r) { if (r.fcId && !L.fcAc[r.fcId]) L.fcAc[r.fcId] = 'fc:' + r.fcId; L.fhaByIid[iidOf(r)] = refOf('fha', r); });
        arr(P.acReqData).forEach(function (r) { L.reqByIid[iidOf(r)] = refOf('req', r); if (r.id && !L.reqById[r.id]) L.reqById[r.id] = refOf('req', r); });
        arr(P.acAssumptionsData).forEach(function (a) { if (a.asmId && !L.asm[a.asmId]) L.asm[a.asmId] = 'asm:' + a.asmId; });
        arr(P.zsaData).forEach(function (z) { if (z.zoneId && !L.zoneById[z.zoneId]) L.zoneById[z.zoneId] = refOf('zone', z); });
        arr(P.fmeaData).forEach(function (r) { L.fmeaByIid[iidOf(r)] = refOf('fmea', r); });
        arr(cfg(P).markovModels).forEach(function (m) { if (m && m.id) L.mk[m.id] = 'mk:' + m.id; });
        arr(cfg(P).eventTrees).forEach(function (t) { if (t && t.id) L.et[t.id] = 'et:' + t.id; });
        return L;
    }
    // The failure conditions a FCIM matrix holds, in the order the app derives them.
    function fcimFcs(rows) {
        var out = [];
        arr(rows).forEach(function (d, ri) {
            if (!d) return;
            if (d.tlId) out.push({ id: d.tlId, desc: d.tlDesc, subId: d.subId, slot: 'tl', row: ri });
            if (d.plId) out.push({ id: d.plId, desc: d.plDesc, subId: d.subId, slot: 'pl', row: ri });
            if (d.mId) out.push({ id: d.mId, desc: d.mDesc, subId: d.subId, slot: 'm', row: ri });
            arr(d.combined).forEach(function (c) { if (c && c.cbId) out.push({ id: c.cbId, desc: c.cbDesc, subId: d.subId, slot: 'cb', row: ri }); });
            arr(d.plExtra).forEach(function (e) { if (e && e.id) out.push({ id: e.id, desc: e.desc, subId: d.subId, slot: 'plx', row: ri }); });
            arr(d.mExtra).forEach(function (e) { if (e && e.id) out.push({ id: e.id, desc: e.desc, subId: d.subId, slot: 'mx', row: ri }); });
        });
        return out;
    }
    // Any element may carry the general "about" link.
    function aboutRef(el, o) { if (o && typeof o.sysmlRef === 'string' && o.sysmlRef) link(el, 'About', o.sysmlRef); }

    // ======================================================== build: one area at a time
    var AREAS = [
        { id: 'architecture', pkg: 'Architecture', label: 'Architecture (systems, items, resources, interfaces, zones)' },
        { id: 'functions', pkg: 'Functions', label: 'Functions' },
        { id: 'requirements', pkg: 'Requirements', label: 'Requirements' },
        { id: 'assumptions', pkg: 'Assumptions', label: 'Assumptions' },
        { id: 'fha', pkg: 'Hazards', label: 'Failure conditions and FHA' },
        { id: 'fta', pkg: 'FaultTrees', label: 'Fault trees' },
        { id: 'cca', pkg: 'CommonCause', label: 'Common cause (CCF groups, CMA, PRA)' },
        { id: 'fmea', pkg: 'FMEA', label: 'FMEA' },
        { id: 'stpa', pkg: 'STPA', label: 'STPA' },
        { id: 'bowtie', pkg: 'BowTies', label: 'Bow-ties' },
        { id: 'eta', pkg: 'EventTrees', label: 'Event trees' },
        { id: 'rbd', pkg: 'Reliability', label: 'Reliability block diagrams' },
        { id: 'markov', pkg: 'Markov', label: 'Markov models' },
        { id: 'hf', pkg: 'HumanFactors', label: 'Human factors (crew tasks)' },
        { id: 'ram', pkg: 'Maintenance', label: 'Maintenance tasks' }
    ];
    var AREA_BY_ID = {}; AREAS.forEach(function (a) { AREA_BY_ID[a.id] = a; });
    // Which area a ref kind lives in (the index builds only the areas it needs).
    var KIND_AREA = { sys: 'architecture', item: 'architecture', res: 'architecture', iface: 'architecture', zone: 'architecture', route: 'architecture', aircraft: 'architecture',
        afn: 'functions', fn: 'functions', sfn: 'functions', req: 'requirements', sreq: 'requirements', asm: 'assumptions', fc: 'fha', sfc: 'fha', fha: 'fha', sfha: 'fha',
        ft: 'fta', ftn: 'fta', ccf: 'cca', cma: 'cca', pra: 'cca', fmea: 'fmea', bt: 'bowtie', btb: 'bowtie', bte: 'bowtie', btl: 'bowtie', et: 'eta', eth: 'eta', eto: 'eta', rbd: 'rbd', rbdb: 'rbd',
        mk: 'markov', mks: 'markov', mkt: 'markov', 'hf.task': 'hf', 'hf.actor': 'hf', 'ram.task': 'ram' };
    function areaOfKind(k) { return KIND_AREA[k] || (k.indexOf('stpa.') === 0 ? 'stpa' : null); }

    // The display type of each ref kind (what the picker and labels say).
    var KIND_LABEL = { sys: 'System', item: 'Item', res: 'Resource', iface: 'Interface', zone: 'Zone', route: 'Routing', afn: 'Aircraft function', fn: 'Aircraft function', sfn: 'System function',
        req: 'Requirement', sreq: 'System requirement', asm: 'Assumption', fc: 'Failure condition', sfc: 'System failure condition', fha: 'FHA entry', sfha: 'System FHA entry',
        ft: 'Fault tree', ftn: 'Fault tree node', ccf: 'CCF group', cma: 'Common mode analysis', pra: 'Particular risk', fmea: 'Failure mode', bt: 'Bow-tie', btb: 'Barrier', bte: 'Bow-tie element', btl: 'Bow-tie pathway',
        et: 'Event tree', eth: 'Event tree heading', eto: 'Event tree outcome', rbd: 'Reliability block diagram', rbdb: 'RBD block', mk: 'Markov model', mks: 'Markov state', mkt: 'Markov transition',
        'hf.task': 'Crew task', 'hf.actor': 'Crew member', 'ram.task': 'Maintenance task', 'stpa.ctl': 'Controller', 'stpa.proc': 'Controlled process', 'stpa.ca': 'Control action',
        'stpa.fb': 'Feedback', 'stpa.oth': 'Other link', 'stpa.act': 'Actuator', 'stpa.sen': 'Sensor', 'stpa.ext': 'External element', 'stpa.actu': 'Actuation', 'stpa.meas': 'Measurement', 'stpa.loss': 'Loss', 'stpa.haz': 'Hazard', 'stpa.sc': 'Safety constraint', 'stpa.uca': 'Unsafe control action' };

    var BUILD = {};

    BUILD.architecture = function (P, pkg, L) {
        var ac = add(pkg, El('part def', { name: 'Aircraft', short: 'AIRCRAFT', spec: 'SafetyLab::AircraftModel', ref: 'aircraft:AIRCRAFT' }));
        var sysDef = {};
        systems(P).forEach(function (s) {
            var d = add(pkg, El('part def', { short: s.id, name: s.name || s.id, spec: 'SafetyLab::System', ref: 'sys:' + s.id, doc: s.description || '' }));
            attr(d, 'role', 'str', s.role);
            aboutRef(d, s);
            sysDef[s.id] = d;
        });
        arr(P.itemsData).forEach(function (it) {
            var owner = sysDef[it.owningSystemId] || ac;
            var e = add(owner, El('part', { short: it.itemId, name: it.name || it.itemId, type: 'SafetyLab::Item', ref: refOf('item', it), doc: it.description || '' }));
            attr(e, 'itemType', 'str', it.type); attr(e, 'dal', 'str', it.dal); attr(e, 'assuranceType', 'str', it.daType);
            arr(it.traceIds).forEach(function (t) { link(e, 'TracesTo', L.fnBySub[t], 'traceIds', t); });
            aboutRef(e, it);
        });
        var sysUse = {};
        systems(P).forEach(function (s) { sysUse[s.id] = add(ac, El('part', { name: s.name || s.id, type: sysDef[s.id] })); });
        var ifs = arr(cfg(P).interfaces);
        ifs.forEach(function (f, i) {
            if (!f || !sysDef[f.fromSystemId] || !sysDef[f.toSystemId] || f.fromSystemId === f.toSystemId) return;
            var id = ifaceId(f, i, ifs);
            var c = add(ac, El('connection', { short: f.icdRef || null, name: f.medium || f.icdRef || ('Interface ' + (i + 1)), type: 'SafetyLab::SystemInterface', ref: 'iface:' + id, ends: [sysUse[f.fromSystemId], sysUse[f.toSystemId]], doc: f.notes || '' }));
            attr(c, 'interfaceKind', 'str', f.kind); attr(c, 'direction', 'str', f.direction); attr(c, 'medium', 'str', f.medium); attr(c, 'icdRef', 'str', f.icdRef);
            if (f.fromFuncId) link(c, 'About', L.fnBySub[f.fromFuncId] || L.fnByIid[f.fromFuncId], 'fromFuncId', f.fromFuncId);
            if (f.toFuncId) link(c, 'About', L.fnBySub[f.toFuncId] || L.fnByIid[f.toFuncId], 'toFuncId', f.toFuncId);
            aboutRef(c, f);
        });
        add(pkg, El('part', { name: 'aircraft', type: ac }));
        arr(P.resourcesData).forEach(function (r) {
            var e = add(pkg, El('part', { short: r.resId, name: r.name || r.resId, type: 'SafetyLab::SharedResource', ref: refOf('res', r), doc: r.description || r.desc || '' }));
            attr(e, 'resourceType', 'str', r.type);
            arr(r.providedBy).forEach(function (sid) { link(e, 'ProvidedBy', L.sysById[sid], 'providedBy', sid); });
            arr(r.consumedBySystems).forEach(function (sid) { link(e, 'ConsumedBy', L.sysById[sid], 'consumedBySystems', sid); });
            arr(r.consumedBy).forEach(function (fid) { link(e, 'ConsumedBy', L.fnBySub[fid] || L.fnByIid[fid], 'consumedBy', fid); });
            aboutRef(e, r);
        });
        arr(P.zsaData).forEach(function (z) {
            var e = add(pkg, El('part', { short: z.zoneId, name: z.desc ? clip(z.desc, 80) : z.zoneId, type: 'SafetyLab::Zone', ref: refOf('zone', z), doc: z.desc || '' }));
            attr(e, 'equipment', 'str', z.equip); attr(e, 'severityLabel', 'str', z.severity); attr(e, 'interference', 'str', z.interference); attr(e, 'mitigation', 'str', z.mitigation);
            arr(z.housedFunctions).forEach(function (fid) { link(e, 'Houses', L.fnBySub[fid], 'housedFunctions', fid); });
            aboutRef(e, z);
        });
        arr(P.routingData).forEach(function (r) {
            var e = add(pkg, El('part', { short: r.routingId, name: r.name || r.routingId, type: 'SafetyLab::Routing', ref: refOf('route', r), doc: r.desc || '' }));
            attr(e, 'routingKind', 'str', r.kind);
            arr(r.routesThroughZones).forEach(function (zid) { link(e, 'TracesTo', L.zoneById[zid], 'routesThroughZones', zid); });
            arr(r.carriesFunctions).forEach(function (fid) { link(e, 'About', L.fnBySub[fid], 'carriesFunctions', fid); });
            arr(r.carriesItems).forEach(function (iid) { link(e, 'RealizedBy', L.itemById[iid] || L.itemByIid[iid], 'carriesItems', iid); });
            aboutRef(e, r);
        });
    };

    BUILD.functions = function (P, pkg, L) {
        var groups = [], byId = Object.create(null);
        arr(P.acFunctionsData).forEach(function (r) {
            var g = r.funcId ? byId[r.funcId] : null;
            if (r.funcId && !g) { g = byId[r.funcId] = add(pkg, El('action def', { short: r.funcId, name: r.funcName || r.funcId, spec: 'SafetyLab::AircraftFunction', ref: 'afn:' + r.funcId, doc: r.funcDef || '' })); groups.push(g); }
            var e = add(g || pkg, El('action', { short: r.subId, name: r.subName || r.subId || 'Function', type: 'SafetyLab::AircraftFunction', ref: refOf('fn', r), doc: r.subDef || '' }));
            aboutRef(e, r);
        });
        systems(P).forEach(function (s) {
            if (!arr(s.functions).length) return;
            var g = add(pkg, El('action def', { name: (s.name || s.id) + ' functions', ref: 'sfg:' + s.id }));
            link(g, 'About', 'sys:' + s.id);
            arr(s.functions).forEach(function (f) {
                var e = add(g, El('action', { short: f.funcId, name: f.funcName || f.funcId || 'Function', type: 'SafetyLab::SystemFunction', ref: refOf('sfn', f, { systemId: s.id }), doc: f.funcDef || '' }));
                arr(f.traceIds).forEach(function (t) { link(e, 'TracesTo', L.fnBySub[t], 'traceIds', t); });
                aboutRef(e, f);
            });
        });
    };

    function reqEl(r, ref, L, systemId) {
        var name = (r.id ? r.id + ': ' : '') + (clip(r.text, 60) || 'Requirement');
        var e = El('requirement', { short: r.id || null, name: name, type: 'SafetyLab::SafetyRequirement', ref: ref, doc: r.text || '' });
        attr(e, 'level', 'str', r.level); attr(e, 'requirementType', 'str', r.type); attr(e, 'rationale', 'str', r.rat);
        attr(e, 'verificationMethod', 'str', r.verifMethod); attr(e, 'verificationStatus', 'str', r.verifStatus);
        if (r.traceId) {
            var to = (systemId && L.fcSys[systemId] && L.fcSys[systemId][r.traceId]) || L.fcAc[r.traceId] || L.fnBySub[r.traceId];
            if (to) link(e, 'Mitigates', to); else e.attrs.push(['traceId', dq(r.traceId)]);
        }
        aboutRef(e, r);
        return e;
    }
    BUILD.requirements = function (P, pkg, L) {
        arr(P.acReqData).forEach(function (r) { add(pkg, reqEl(r, refOf('req', r), L, null)); });
        systems(P).forEach(function (s) {
            if (!arr(s.req).length) return;
            var sp = add(pkg, El('package', { short: s.id, name: s.name || s.id }));
            arr(s.req).forEach(function (r) { add(sp, reqEl(r, refOf('sreq', r, { systemId: s.id }), L, s.id)); });
        });
    };

    function asmEl(a) {
        var e = El('part', { short: a.asmId, name: a.asmId || 'Assumption', type: 'SafetyLab::Assumption', ref: 'asm:' + a.asmId, doc: a.text || '' });
        attr(e, 'assumptionType', 'str', a.type); attr(e, 'assumptionState', 'str', a.state); attr(e, 'validationStrategy', 'str', a.valStrategy); attr(e, 'routeTo', 'str', a.routeTo);
        aboutRef(e, a);
        return e;
    }
    BUILD.assumptions = function (P, pkg) {
        arr(P.acAssumptionsData).forEach(function (a) { if (a && a.asmId) add(pkg, asmEl(a)); });
        systems(P).forEach(function (s) {
            var rows = arr(s.asm).filter(function (a) { return a && a.asmId; });
            if (!rows.length) return;
            var sp = add(pkg, El('package', { short: s.id, name: s.name || s.id }));
            rows.forEach(function (a) { var e = add(sp, asmEl(a)); e.ref = 'sasm:' + s.id + '/' + a.asmId; });
        });
    };

    function sevAttr(e, sev) {
        var k = SEVERITY[S(sev).trim().toLowerCase()];
        if (k && SEVERITY_BACK[k] === S(sev)) attr(e, 'severity', 'enum:Severity', k); else attr(e, 'severityLabel', 'str', sev);
    }
    function fcBlock(holder, rows, fhaRows, scope, L) {
        // scope: { systemId } for a system, null for the aircraft
        var sid = scope ? scope.systemId : null, kind = sid ? 'sfc' : 'fc', seen = Object.create(null);
        var fnRef = function (subId) { return L.fnBySub[subId] || (sid && L.sfnBySys[sid] && L.sfnBySys[sid][subId]) || null; };
        fcimFcs(rows).forEach(function (fc) {
            if (seen[fc.id]) return; seen[fc.id] = 1;
            var e = add(holder, El('part', { short: fc.id, name: fc.desc ? clip(fc.desc, 80) : fc.id, type: 'SafetyLab::FailureCondition', ref: kind + ':' + (sid ? sid + '/' : '') + fc.id, doc: fc.desc || '' }));
            attr(e, 'failureKind', 'enum:FailureConditionKind', FCKIND[fc.slot]);
            if (fc.slot === 'plx' || fc.slot === 'mx') attr(e, 'additional', 'bool', true);
            var row = arr(rows)[fc.row];
            if (fc.slot === 'tl' && row && row.awareness) attr(e, 'awareness', 'str', row.awareness);
            if (fnRef(fc.subId)) link(e, 'About', fnRef(fc.subId)); else attr(e, 'functionRef', 'str', fc.subId);
        });
        arr(fhaRows).forEach(function (r) {
            if (r.fcId && !seen[r.fcId]) {
                seen[r.fcId] = 1;
                var f = add(holder, El('part', { short: r.fcId, name: r.fcDesc ? clip(r.fcDesc, 80) : r.fcId, type: 'SafetyLab::FailureCondition', ref: kind + ':' + (sid ? sid + '/' : '') + r.fcId, doc: r.fcDesc || '' }));
                if (fnRef(r.subId)) link(f, 'About', fnRef(r.subId)); else attr(f, 'functionRef', 'str', r.subId);
            }
        });
        arr(fhaRows).forEach(function (r) {
            var e = add(holder, El('part', { name: 'FHA ' + (r.fcId || '') + (r.phases ? ' ' + clip(r.phases, 40) : ''), type: 'SafetyLab::FhaEntry', ref: sid ? refOf('sfha', r, { systemId: sid }) : refOf('fha', r), doc: r.fcDesc || '' }));
            sevAttr(e, r.severity); attr(e, 'phases', 'str', r.phases);
            attr(e, 'effectOnAircraft', 'str', r.effAc); attr(e, 'effectOnCrew', 'str', r.effCrew); attr(e, 'effectOnOccupants', 'str', r.effPax);
            if (r.fcId) link(e, 'Assesses', kind + ':' + (sid ? sid + '/' : '') + r.fcId);
            if (fnRef(r.subId)) link(e, 'About', fnRef(r.subId)); else attr(e, 'functionRef', 'str', r.subId);
            arr(r.assumptionIds).forEach(function (a) { link(e, 'Cites', L.asm[a] || (sid ? 'sasm:' + sid + '/' + a : null), 'assumptionIds', a); });
            if (r.acTrace != null && r.acTrace !== '') link(e, 'TracesTo', L.fhaByIid[String(r.acTrace)], 'acTrace', r.acTrace);
            aboutRef(e, r);
        });
    }
    BUILD.fha = function (P, pkg, L) {
        fcBlock(pkg, P.acFcimData, P.acFhaData, null, L);
        systems(P).forEach(function (s) {
            if (!arr(s.fcim).length && !arr(s.fha).length) return;
            var sp = add(pkg, El('package', { short: s.id, name: s.name || s.id }));
            fcBlock(sp, s.fcim, s.fha, { systemId: s.id }, L);
        });
    };

    function ftNode(parent, n, pg, L) {
        var gate = n.type === 'gate';
        var e = add(parent, El('part', { short: n.displayId || null, name: n.name || n.displayId || ((gate ? 'Gate ' : 'Event ') + n.id), label: n.name ? null : '', type: gate ? 'SafetyLab::Gate' : 'SafetyLab::Event', ref: 'ftn:' + pg.id + '/' + n.id, doc: n.description || '' }));
        if (n.logicalId != null && String(n.logicalId) !== String(n.id)) attr(e, 'logicalId', 'str', String(n.logicalId));
        if (gate) {
            if (GATE[n.gateType]) attr(e, 'gateKind', 'enum:GateKind', GATE[n.gateType]); else attr(e, 'gateKindLabel', 'str', n.gateType);
            attr(e, 'votingK', 'int', n.votingK != null ? n.votingK : n.k);
            attr(e, 'dalOption', 'str', n.dalOption);
            if (n.linkedPageId) link(e, 'TransfersTo', L.page[n.linkedPageId], 'linkedPageId', n.linkedPageId);
            if (n.transferOutTo) link(e, 'TransfersTo', L.page[n.transferOutTo], 'transferOutTo', n.transferOutTo);
        } else {
            if (EVENT[n.type]) attr(e, 'eventKind', 'enum:EventKind', EVENT[n.type]); else attr(e, 'eventKindLabel', 'str', n.type);
            var lam = toNum(n.lambda);
            if (n.inputMode !== 'lambda') attr(e, 'probability', 'num', toNum(n.probability));
            if (lam || n.inputMode === 'lambda') attr(e, 'failureRate', 'num', lam);
            attr(e, 'inputMode', 'str', n.inputMode);
            attr(e, 'exposureMode', 'str', n.exposureMode); attr(e, 'exposureTime', 'num', toNum(n.dormancyInterval));
            attr(e, 'repairModel', 'str', n.repairModel); attr(e, 'repairTime', 'num', toNum(n.tau));
            attr(e, 'libraryKey', 'str', n.libraryKey);
            if (n.ccfGroup) link(e, 'MemberOf', 'ccf:' + n.ccfGroup);
            if (n.realizedByItemId != null && n.realizedByItemId !== '') link(e, 'RealizedBy', L.itemByIid[String(n.realizedByItemId)] || L.itemById[String(n.realizedByItemId)], 'realizedByItemId', n.realizedByItemId);
            if (n.markovModelId) link(e, 'QuantifiedBy', L.mk[n.markovModelId], 'markovModelId', n.markovModelId);
        }
        aboutRef(e, n);
        kidsOf(n).forEach(function (c) { if (c) ftNode(e, c, pg, L); });
    }
    BUILD.fta = function (P, pkg, L) {
        arr(P.ftaPages).forEach(function (pg) {
            if (!pg || (!pg.root && /^Untitled Fault Tree$/.test(S(pg.name)))) return;   // the blank starting page is the empty state, not content
            var e = add(pkg, El('part', { short: pg.id, name: pg.name || pg.id, type: 'SafetyLab::FaultTree', ref: 'ft:' + pg.id }));
            attr(e, 'treeLevel', 'str', pg.treeLevel); attr(e, 'mode', 'str', pg.mode); attr(e, 'asBuiltFactor', 'num', toNum(pg.asBuiltFactor));
            if (pg.systemId) link(e, 'About', L.sysById[pg.systemId], 'systemId', pg.systemId);
            arr(pg.linkedFhaIds).forEach(function (id) { link(e, 'Analyzes', L.fhaByIid[String(id)], 'linkedFhaIds', id); });
            if (pg.verifies) link(e, 'Covers', L.page[pg.verifies], 'verifies', pg.verifies);
            aboutRef(e, pg);
            if (pg.root) ftNode(e, pg.root, pg, L);
        });
    };

    BUILD.cca = function (P, pkg, L) {
        var groups = [], beta = Object.create(null);
        arr(P.ftaPages).forEach(function (pg) {
            (function walk(n) { if (!n) return; if (n.ccfGroup) { if (!(n.ccfGroup in beta)) { groups.push(n.ccfGroup); beta[n.ccfGroup] = null; } if (beta[n.ccfGroup] == null && toNum(n.beta) != null) beta[n.ccfGroup] = toNum(n.beta); } kidsOf(n).forEach(walk); })(pg && pg.root);
        });
        groups.forEach(function (g) { var e = add(pkg, El('part', { name: g, type: 'SafetyLab::CommonCauseGroup', ref: 'ccf:' + g })); attr(e, 'beta', 'num', beta[g]); });
        arr(P.cmaData).forEach(function (r) {
            var e = add(pkg, El('part', { short: r.cmaId, name: r.subject || r.cmaId || 'Common mode analysis', type: 'SafetyLab::CommonModeAnalysis', ref: refOf('cma', r) }));
            attr(e, 'claim', 'str', r.claim); attr(e, 'modes', 'str', arr(r.modes).join(', ')); attr(e, 'findings', 'str', r.findings);
            attr(e, 'mitigation', 'str', r.mitigation); attr(e, 'status', 'str', r.status); attr(e, 'scope', 'str', r.scope);
            if (r.owningSystemId) link(e, 'About', L.sysById[r.owningSystemId], 'owningSystemId', r.owningSystemId);
            arr(r.linkedGateIds).forEach(function (g) { var m = /^(.*):([^:]+)$/.exec(S(g)); link(e, 'Covers', m ? 'ftn:' + m[1] + '/' + m[2] : null, 'linkedGateIds', g); });
            aboutRef(e, r);
        });
        arr(P.praData).forEach(function (r) {
            var e = add(pkg, El('part', { short: r.praId, name: r.threat || r.praId || 'Particular risk', type: 'SafetyLab::ParticularRisk', ref: refOf('pra', r), doc: r.desc || '' }));
            if (Array.isArray(r.systems)) { var unres = []; r.systems.forEach(function (sid) { if (L.sysById[sid]) link(e, 'About', L.sysById[sid]); else unres.push(sid); }); attr(e, 'affectedSystemIds', 'str', unres.join(', ')); if (!r.systems.length) attr(e, 'affectedSystemIds', 'str', ' '); }
            else attr(e, 'affectedSystems', 'str', r.systems);
            attr(e, 'csfl', 'str', r.csfl); attr(e, 'mitigation', 'str', r.mitigation);
            arr(r.affectedZones).forEach(function (z) { link(e, 'Covers', L.zoneById[z], 'affectedZones', z); });
            aboutRef(e, r);
        });
    };

    BUILD.fmea = function (P, pkg, L) {
        arr(P.fmeaData).forEach(function (r) {
            var mode = r.fmeaType === 'functional' ? r.funcMode : r.mode;
            var e = add(pkg, El('part', { short: r.fmeaId, name: (r.fmeaId ? r.fmeaId + ' ' : '') + (mode || 'Failure mode'), type: 'SafetyLab::FailureMode', ref: refOf('fmea', r), doc: mode || '' }));
            attr(e, 'fmeaType', 'str', r.fmeaType); attr(e, 'scope', 'str', r.scope); attr(e, 'itemName', 'str', r.part); attr(e, 'phase', 'str', r.phase);
            attr(e, 'localEffect', 'str', r.localEffect); attr(e, 'nextEffect', 'str', r.nextEffect); attr(e, 'endEffect', 'str', r.endEffect);
            attr(e, 'detection', 'str', r.detection); attr(e, 'severityLabel', 'str', r.severity); attr(e, 'compensating', 'str', r.compensating); attr(e, 'remarks', 'str', r.remarks);
            attr(e, 'failureRate', 'num', toNum(r.rate)); attr(e, 'exposureTime', 'num', toNum(r.time)); attr(e, 'libraryKey', 'str', r.parentLibKey);
            if (r.funcSubId) link(e, 'About', L.fnBySub[r.funcSubId] || (r.owningSystemId && L.sfnBySys[r.owningSystemId] && L.sfnBySys[r.owningSystemId][r.funcSubId]), 'funcSubId', r.funcSubId);
            if (r.owningSystemId) link(e, 'About', L.sysById[r.owningSystemId], 'owningSystemId', r.owningSystemId);
            if (r.linkedFcId != null && r.linkedFcId !== '') link(e, 'ContributesTo', L.fhaByIid[String(r.linkedFcId)], 'linkedFcId', r.linkedFcId);
            if (r.beId != null && r.beId !== '') link(e, 'TracesTo', L.nodeById[r.beId] || L.nodeByDisp[r.beId], 'beId', r.beId);
            aboutRef(e, r);
        });
    };

    BUILD.stpa = function (P, pkg, L) {
        var d = stpa(P); if (!d) return;
        var cs = d.cs, nodes = arr(cs.controllers).concat(arr(cs.processes), arr(cs.actuators), arr(cs.sensors), arr(cs.externals));
        if (nodes.length) {
            var def = add(pkg, El('part def', { name: 'Control structure', spec: 'SafetyLab::ControlStructure', ref: 'stpa.cs:main' }));
            arr(cs.controllers).forEach(function (c) {
                var e = add(def, El('part', { short: c.id, name: c.name || c.id, type: 'SafetyLab::Controller', ref: 'stpa.ctl:' + c.id, doc: c.desc || '' }));
                if (['human', 'automation', 'organization'].indexOf(c.kind) >= 0) attr(e, 'controllerKind', 'enum:ControllerKind', c.kind); else attr(e, 'controllerKindLabel', 'str', c.kind);
                attr(e, 'rank', 'int', c.authority);
                if (arr(c.processModel).length) attr(e, 'processModel', 'str', arr(c.processModel).join('\n'));
                attr(e, 'controlAlgorithm', 'str', c.controlAlgorithm);
                aboutRef(e, c);
            });
            arr(cs.processes).forEach(function (p) { var e = add(def, El('part', { short: p.id, name: p.name || p.id, type: 'SafetyLab::ControlledProcess', ref: 'stpa.proc:' + p.id, doc: p.desc || '' })); aboutRef(e, p); });
            [['actuators', 'Actuator', 'stpa.act'], ['sensors', 'Sensor', 'stpa.sen'], ['externals', 'ExternalElement', 'stpa.ext']].forEach(function (k) {
                arr(cs[k[0]]).forEach(function (p) { var e = add(def, El('part', { short: p.id, name: p.name || p.id, type: 'SafetyLab::' + k[1], ref: k[2] + ':' + p.id, doc: p.desc || '' })); aboutRef(e, p); });
            });
            var ids = Object.create(null); def.kids.forEach(function (k) { ids[k.ref.slice(k.ref.indexOf(':') + 1)] = k; });
            [['actions', 'ControlAction', 'stpa.ca'], ['feedbacks', 'Feedback', 'stpa.fb'], ['others', 'OtherLink', 'stpa.oth'], ['actuations', 'Actuation', 'stpa.actu'], ['measurements', 'Measurement', 'stpa.meas']].forEach(function (k) {
                arr(cs[k[0]]).forEach(function (x) {
                    if (!ids[x.from] || !ids[x.to]) return;
                    var e = add(def, El('connection', { short: x.id, name: x.name || x.id, type: 'SafetyLab::' + k[1], ref: k[2] + ':' + x.id, ends: [ids[x.from], ids[x.to]] }));
                    if (k[0] === 'others') attr(e, 'linkType', 'str', x.type);
                    aboutRef(e, x);
                });
            });
            add(pkg, El('part', { name: 'controlStructure', type: def }));
        }
        arr(d.losses).forEach(function (l) { var e = add(pkg, El('part', { short: l.id, name: l.name || l.id, type: 'SafetyLab::Loss', ref: 'stpa.loss:' + l.id, doc: l.desc || '' })); aboutRef(e, l); });
        arr(d.hazards).forEach(function (h) {
            var e = add(pkg, El('part', { short: h.id, name: h.name || h.id, type: 'SafetyLab::Hazard', ref: 'stpa.haz:' + h.id }));
            attr(e, 'group', 'str', h.group);
            arr(h.lossIds).forEach(function (l) { link(e, 'LeadsTo', 'stpa.loss:' + l, 'lossIds', l); });
            if (h.fromFcId) link(e, 'About', L.fcAc[h.fromFcId], 'fromFcId', h.fromFcId);
            aboutRef(e, h);
        });
        arr(d.constraints).forEach(function (c) {
            var e = add(pkg, El('part', { short: c.id, name: c.id || 'Constraint', type: 'SafetyLab::SafetyConstraint', ref: 'stpa.sc:' + c.id, doc: c.text || '' }));
            arr(c.hazardIds).forEach(function (h) { link(e, 'Mitigates', 'stpa.haz:' + h, 'hazardIds', h); });
            aboutRef(e, c);
        });
        var acts = Object.create(null); arr(cs.actions).forEach(function (a) { acts[a.id] = a; });
        Object.keys(d.dispositions || {}).forEach(function (key) {
            var disp = d.dispositions[key]; if (!disp) return;
            var m = /^(.*):(np|ph|wt|ss)$/.exec(key); if (!m) return;
            var a = acts[m[1]];
            var e = add(pkg, El('part', { short: 'UCA-' + key, name: 'UCA ' + (a ? a.name : m[1]) + ' ' + GUIDE[m[2]], type: 'SafetyLab::UnsafeControlAction', ref: 'stpa.uca:' + key, doc: disp.hazard || '' }));
            attr(e, 'guideWord', 'enum:GuideWord', GUIDE[m[2]]); attr(e, 'context', 'str', disp.context); attr(e, 'status', 'str', disp.status); attr(e, 'rationale', 'str', disp.rationale);
            if (a) link(e, 'About', 'stpa.ca:' + a.id);
            arr(disp.hazardIds).forEach(function (h) { link(e, 'LeadsTo', 'stpa.haz:' + h, 'hazardIds', h); });
            arr(disp.fcIds).forEach(function (f) { link(e, 'LeadsTo', L.fcAc[f], 'fcIds', f); });
            if (disp.bridge) {
                arr(disp.bridge.ftaRefs).forEach(function (r) { link(e, 'TracesTo', L.nodeByDisp[r] || L.nodeById[r], 'bridge.ftaRefs', r); });
                arr(disp.bridge.fmeaRefs).forEach(function (r) { link(e, 'TracesTo', L.fmeaByIid[String(r)], 'bridge.fmeaRefs', r); });
            }
        });
    };

    BUILD.bowtie = function (P, pkg, L) {
        arr(cfg(P).bowties).forEach(function (b) {
            if (!b || !b.id) return;
            var e = add(pkg, El('part', { short: b.id, name: b.name || b.id, type: 'SafetyLab::BowTie', ref: 'bt:' + b.id }));
            if (b.ftaPageId) link(e, 'Analyzes', L.page[b.ftaPageId], 'ftaPageId', b.ftaPageId);
            if (b.etaId) link(e, 'Analyzes', L.et[b.etaId], 'etaId', b.etaId);
            aboutRef(e, b);
            var onDiagram = Object.create(null);
            arr(b.barriers).forEach(function (x) {
                var be = add(e, El('part', { short: x.id, name: x.name || x.id, type: 'SafetyLab::Barrier', ref: 'btb:' + b.id + '/' + x.id, doc: x.note || '' }));
                onDiagram[x.id] = be;
                if (x.side === 'preventive' || x.side === 'mitigative') attr(be, 'side', 'enum:BarrierSide', x.side);
                attr(be, 'barrierRole', 'str', x.role); attr(be, 'barrierType', 'str', x.barrierType); attr(be, 'effectiveness', 'str', x.effectiveness); attr(be, 'barrierOwner', 'str', x.owner);
                attr(be, 'failureProbability', 'num', toNum(x.pFail));
                var t = x.trace || {};
                attr(be, 'traceKind', 'str', t.kind && t.kind !== 'none' ? t.kind : ''); attr(be, 'traceRef', 'str', t.ref); attr(be, 'principleId', 'str', x.principleId);
                if (t.logicalId) attr(be, 'traceLogicalId', 'str', String(t.logicalId));
                if (t.pageId) link(be, 'TracesTo', L.page[t.pageId], 'trace.pageId', t.pageId);
                if (t.etaId) link(be, 'TracesTo', L.et[t.etaId], 'trace.etaId', t.etaId);
                if (x.requirementId) { var rr = L.reqById[x.requirementId]; if (rr) link(be, 'Mitigates', rr); else attr(be, 'requirementId', 'str', x.requirementId); }
                aboutRef(be, x);
            });
            // the hand-drawn bow-tie (bowtie.js v3.0): its elements and pathways
            var D = b.diagram && typeof b.diagram === 'object' ? b.diagram : null;
            if (D) {
                arr(D.elements).forEach(function (o) {
                    var T = BT_TYPES[o && o.kind]; if (!T || !o.id) return;
                    var pr = o.props || {};
                    var oe = add(e, El('part', { name: o.name || o.id, type: 'SafetyLab::' + T, ref: 'bte:' + b.id + '/' + o.id, doc: pr.note || '' }));
                    onDiagram[o.id] = oe;
                    if (o.kind === 'consequence') {
                        attr(oe, 'severityLabel', 'str', pr.severity); attr(oe, 'consequenceCategory', 'str', pr.category);
                        if (pr.linkedFcId) { var fr = L.fcAc[pr.linkedFcId]; if (fr) link(oe, 'LeadsTo', fr); else attr(oe, 'linkedFcId', 'str', pr.linkedFcId); }
                    }
                    if (o.kind === 'threat' && pr.ftRef) link(oe, 'TracesTo', String(pr.ftRef), 'ftRef', pr.ftRef);
                    aboutRef(oe, o);
                });
                arr(D.links).forEach(function (l) {
                    var a = l && onDiagram[l.from], c = l && onDiagram[l.to]; if (!a || !c || !l.id) return;
                    var ce = add(e, El('connection', { name: (a.name || '') + ' to ' + (c.name || ''), type: 'SafetyLab::' + (BT_LINKS[l.kind] || 'BowTiePathway'), ref: 'btl:' + b.id + '/' + l.id, ends: [a, c] }));
                    aboutRef(ce, l);
                });
            }
        });
    };
    var BT_TYPES = { hazard: 'BowTieHazard', top: 'TopEvent', threat: 'Threat', consequence: 'Consequence', escalation: 'EscalationFactor' };
    var BT_LINKS = { path: 'BowTiePathway', escalation: 'EscalationPathway', release: 'HazardRelease' };

    BUILD.eta = function (P, pkg, L) {
        arr(cfg(P).eventTrees).forEach(function (t) {
            if (!t || !t.id) return;
            var ini = t.initiator || {};
            var e = add(pkg, El('part', { short: t.id, name: t.name || t.id, type: 'SafetyLab::EventTree', ref: 'et:' + t.id, doc: ini.desc || '' }));
            attr(e, 'initiatorFrequency', 'num', toNum(ini.freq));
            if (ini.fromTransfers) attr(e, 'initiatorFromTransfers', 'bool', true);
            if (t.nodeRules && typeof t.nodeRules === 'object' && Object.keys(t.nodeRules).length) attr(e, 'sequenceRules', 'str', JSON.stringify(t.nodeRules));
            if (t.linkedFcId) link(e, 'About', L.fcAc[t.linkedFcId], 'linkedFcId', t.linkedFcId);
            aboutRef(e, t);
            arr(t.barriers).forEach(function (h, i) {
                var he = add(e, El('part', { short: 'H' + (i + 1), name: h.name || ('Heading ' + (i + 1)), type: 'SafetyLab::EventTreeHeading', ref: 'eth:' + t.id + '/' + i, doc: h.note || '' }));
                attr(he, 'failureProbability', 'num', toNum(h.pFail)); attr(he, 'couplingProbability', 'num', toNum(h.pCcf));
                if (Array.isArray(h.branches) && h.branches.length >= 2) attr(he, 'outcomes', 'str', JSON.stringify(h.branches));
                if (h.linkedPageId) link(he, 'QuantifiedBy', L.page[h.linkedPageId], 'linkedPageId', h.linkedPageId);
                aboutRef(he, h);
            });
            var cons = t.consequences || {};
            Object.keys(cons).forEach(function (path) {
                var c = cons[path] || {};
                var oe = add(e, El('part', { name: 'Outcome ' + path, type: 'SafetyLab::EventTreeOutcome', ref: 'eto:' + t.id + '/' + path, doc: c.note || '' }));
                attr(oe, 'path', 'str', path); attr(oe, 'severityLabel', 'str', c.severity);
                attr(oe, 'endState', 'str', c.label); attr(oe, 'consequenceCategory', 'str', c.category);
                if (c.transferTo) link(oe, 'TransfersTo', L.et[c.transferTo], 'transferTo', c.transferTo);
                if (c.linkedFcId) { var fr = L.fcAc[c.linkedFcId]; if (fr) link(oe, 'LeadsTo', fr); else attr(oe, 'linkedFcId', 'str', c.linkedFcId); }
                aboutRef(oe, c);
            });
        });
    };

    // RBD structure text: the module's own DSL, read here only to name the blocks.
    function rbdBlocks(dsl) {
        var out = [], re = /block\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^,()]+?))\s*(?:,\s*([^()]*?))?\s*\)/g, m;
        while ((m = re.exec(S(dsl)))) out.push({ name: S(m[1] != null ? m[1] : m[2] != null ? m[2] : m[3]).trim(), lambda: toNum(S(m[4]).trim()) });
        return out;
    }
    // 13 Oct 2026 (v1.1): a drawn RBD (rbd_net.js network). The drawing travels whole in `structure`
    // (JSON, tagged), and every COMPONENT is a part: a block drawn in several places is one component.
    var RBD_DIAGRAM_FORMAT = 'safetylab-rbd-diagram';
    function rbdDiagramParts(e, m, L) {
        var d = m.diagram;
        attr(e, 'structure', 'str', JSON.stringify({ format: RBD_DIAGRAM_FORMAT, version: 1, elements: d.elements || [], connectors: d.connectors || [] }));
        if (m.fromPage) link(e, 'Analyzes', L.page[m.fromPage], 'fromPage', m.fromPage);
        aboutRef(e, m);
        var comps = [], byKey = Object.create(null), names = Object.create(null);
        arr(d.elements).forEach(function (b) {
            if (!b || (b.kind !== 'block' && b.kind !== 'standby')) return;
            var c = b.props && b.props.component != null ? S(b.props.component).trim() : '';
            var key = c || b.id, x = byKey[key];
            if (!x) { x = byKey[key] = { el: b, places: 0, ref: null }; comps.push(x); }
            x.places++;
            if (!x.ref && typeof b.sysmlRef === 'string' && b.sysmlRef) x.ref = b.sysmlRef;
        });
        comps.forEach(function (x) {
            var b = x.el, p = b.props || {}, nm = S(b.label).trim() || 'Block', n = nm, k = 2;
            while (names[n.toLowerCase()]) n = nm + ' (' + (k++) + ')';
            names[n.toLowerCase()] = 1;
            var be = add(e, El('part', { name: n, type: b.kind === 'standby' ? 'SafetyLab::StandbyGroup' : 'SafetyLab::RbdBlock', ref: 'rbdb:' + m.id + '/' + n, derived: true }));
            attr(be, 'failureRate', 'num', p.lambda); attr(be, 'repairRate', 'num', p.mu);
            if (x.places > 1) attr(be, 'places', 'int', x.places);
            if (b.kind === 'standby') { attr(be, 'units', 'int', p.units); attr(be, 'dormancyFactor', 'num', p.warmK); attr(be, 'switchSuccess', 'num', p.switchP); }
            var sr = x.ref || (m.blockRefs || {})[n]; if (sr) link(be, 'About', sr);
        });
    }
    BUILD.rbd = function (P, pkg, L) {
        var models = cfg(P).rbd && Array.isArray(cfg(P).rbd.models) ? cfg(P).rbd.models : [];
        models.forEach(function (m) {
            if (!m || !m.id) return;
            var e = add(pkg, El('part', { short: m.id, name: m.name || m.id, type: 'SafetyLab::ReliabilityBlockDiagram', ref: 'rbd:' + m.id }));
            if (m.diagram && Array.isArray(m.diagram.elements)) { rbdDiagramParts(e, m, L); return; }   // 13 Oct 2026: a drawn diagram
            attr(e, 'structure', 'str', m.dsl);
            if (m.fromPage) link(e, 'Analyzes', L.page[m.fromPage], 'fromPage', m.fromPage);
            aboutRef(e, m);
            var seen = Object.create(null);
            rbdBlocks(m.dsl).forEach(function (b) {
                if (!b.name || seen[b.name]) return; seen[b.name] = 1;
                var be = add(e, El('part', { name: b.name, type: 'SafetyLab::RbdBlock', ref: 'rbdb:' + m.id + '/' + b.name, derived: true }));
                attr(be, 'failureRate', 'num', b.lambda);
                var sr = (m.blockRefs || {})[b.name]; if (sr) link(be, 'About', sr);
            });
        });
    };

    function rbdDiagramOf(text) {
        if (!text || S(text).charAt(0) !== '{') return null;
        try { var o = JSON.parse(text); if (o && o.format === RBD_DIAGRAM_FORMAT && Array.isArray(o.elements)) return { elements: o.elements, connectors: Array.isArray(o.connectors) ? o.connectors : [] }; } catch (_) {}
        return null;
    }
    BUILD.markov = function (P, pkg) {
        arr(cfg(P).markovModels).forEach(function (m) {
            if (!m || !m.id) return;
            var e = add(pkg, El('state def', { short: m.id, name: m.name || m.id, spec: 'SafetyLab::MarkovModel', ref: 'mk:' + m.id }));
            var states = arr(m.states).filter(function (s) { return s && s.name; }), stEl = Object.create(null);
            var ip = m.initialProbs && typeof m.initialProbs === 'object' && !Array.isArray(m.initialProbs) ? m.initialProbs : null;
            states.forEach(function (s) {
                if (stEl[s.name]) return;
                var se = stEl[s.name] = add(e, El('state', { name: s.name, type: 'SafetyLab::MarkovState', ref: 'mks:' + m.id + '/' + s.name }));
                attr(se, 'failed', 'bool', !!s.isFailed);
                if (s.degraded && !s.isFailed) attr(se, 'degraded', 'bool', true);                       // 13 Oct 2026
                if (ip && hasOwn.call(ip, s.name)) attr(se, 'initialProbability', 'num', ip[s.name]);     // 13 Oct 2026
                aboutRef(se, s);
            });
            // 13 Oct 2026: the entry is the start state (the first state when none is set, as the solver reads it)
            var entryName = ip ? Object.keys(ip).filter(function (k) { return stEl[k]; }).sort(function (a, b) { return (toNum(ip[b]) || 0) - (toNum(ip[a]) || 0); })[0] : (m.initialState != null && stEl[m.initialState] ? m.initialState : null);
            if (states.length) e.entry = stEl[entryName != null ? entryName : states[0].name];
            arr(m.transitions).forEach(function (t, i) {
                if (!t || !stEl[t.from] || !stEl[t.to]) return;
                var te = add(e, El('transition', { name: 'T' + (i + 1), ref: 'mkt:' + m.id + '/' + i, from: stEl[t.from], to: stEl[t.to] }));
                te.rate = toNum(t.rate);
                if (t.kind === 'repair') te.repair = true;                                                 // 13 Oct 2026
                aboutRef(te, t);
            });
        });
    };

    BUILD.hf = function (P, pkg) {
        var tasks = hfStore(P, 'tasks'), actors = [], seen = Object.create(null);
        tasks.forEach(function (t) { var c = S(t.crewmember).trim(); if (c && !seen[c]) { seen[c] = 1; actors.push(c); } });
        actors.forEach(function (c) { add(pkg, El('part', { name: c, type: 'SafetyLab::CrewMember', ref: 'hf.actor:' + c })); });
        tasks.forEach(function (t) {
            if (!t || !t.taskId) return;
            var e = add(pkg, El('action', { short: t.taskId, name: t.task ? clip(t.task, 80) : t.taskId, type: 'SafetyLab::CrewTask', ref: 'hf.task:' + t.taskId, doc: t.task || '' }));
            attr(e, 'phase', 'str', t.phase); attr(e, 'timeSeconds', 'num', toNum(t.timeS)); attr(e, 'reactionSeconds', 'num', toNum(t.reactionS)); attr(e, 'executionSeconds', 'num', toNum(t.execS));
            attr(e, 'basis', 'str', t.basis); attr(e, 'channels', 'str', t.channels); attr(e, 'notes', 'str', t.notes);
            if (S(t.crewmember).trim()) link(e, 'PerformedBy', 'hf.actor:' + S(t.crewmember).trim());
            if (t.asmId) link(e, 'Cites', 'asm:' + t.asmId, 'asmId', t.asmId);
            aboutRef(e, t);
        });
    };

    BUILD.ram = function (P, pkg, L) {
        var tasks = cfg(P).ram && Array.isArray(cfg(P).ram.tasks) ? cfg(P).ram.tasks : [];
        tasks.forEach(function (t) {
            if (!t || !t.id) return;
            var e = add(pkg, El('action', { short: t.id, name: t.name || t.id, type: 'SafetyLab::MaintenanceTask', ref: 'ram.task:' + t.id }));
            attr(e, 'intervalHours', 'num', toNum(t.interval)); attr(e, 'activeRepairHours', 'num', toNum(t.activeRepair));
            attr(e, 'logisticsHours', 'num', toNum(t.logistics)); attr(e, 'adminHours', 'num', toNum(t.admin));
            if (t.itemId) link(e, 'About', L.itemById[t.itemId] || L.itemByIid[t.itemId], 'itemId', t.itemId);
            if (t.beRef) link(e, 'TracesTo', L.nodeByDisp[t.beRef] || L.nodeById[t.beRef], 'beRef', t.beRef);
            aboutRef(e, t);
        });
    };

    // Build the model tree for the chosen areas. Returns { root, byRef }.
    function build(P, areaIds) {
        var L = lookups(P);
        var model = El('model', { name: S(P.projectName).trim() || 'Untitled Project' });
        (areaIds || AREAS.map(function (a) { return a.id; })).forEach(function (id) {
            var A = AREA_BY_ID[id]; if (!A) return;
            var pkg = add(model, El('package', { name: A.pkg, area: id }));
            BUILD[id](P, pkg, L);
            if (!pkg.kids.length) model.kids.pop();
        });
        nsFix(model);
        var byRef = Object.create(null);
        (function walk(e) { e.kids.forEach(function (k) { if (k.ref && !byRef[k.ref]) byRef[k.ref] = k; walk(k); }); })(model);
        return { root: model, byRef: byRef };
    }

    // ======================================================== serialize
    var LINK_METAS = ['About', 'Assesses', 'Analyzes', 'Mitigates', 'RealizedBy', 'ContributesTo', 'MemberOf', 'TransfersTo', 'QuantifiedBy', 'ProvidedBy', 'ConsumedBy', 'Houses', 'Covers', 'LeadsTo', 'PerformedBy', 'Cites', 'TracesTo'];
    function exportText(P, opts) {
        opts = opts || {};
        var areaIds = opts.areas || null;
        var B = build(P, areaIds), model = B.root;
        // a link to an element outside the chosen areas: build those areas too, so the
        // text links cleanly (a scoped export carries what its links point at)
        if (areaIds) {
            var need = Object.create(null), have = Object.create(null);
            areaIds.forEach(function (a) { have[a] = 1; });
            var grow = true, guard = 0;
            while (grow && guard++ < 20) {
                grow = false;
                (function walk(e) { e.kids.forEach(function (k) { k.links.forEach(function (l) { var a = areaOfKind(String(l.to).split(':')[0]); if (a && !have[a]) need[a] = 1; }); walk(k); }); })(model);
                Object.keys(need).forEach(function (a) { if (!have[a]) { have[a] = 1; grow = true; } });
                if (grow) { B = build(P, AREAS.map(function (x) { return x.id; }).filter(function (x) { return have[x]; })); model = B.root; }
            }
        }
        var ns = opts.ns || projectNs(P).ns;
        var out = [], w = function (s) { out.push(s); };
        var at = S(opts.at || new Date().toISOString()).slice(0, 10);
        w('package ' + q(model.name) + ' {');
        w('    private import SafetyLab::*;');
        w('    @Ident { :>> key = "project"; :>> elementId = ' + dq(ns) + '; }');
        w('    doc /* ' + docText('Exported from Safety Lab Aero on ' + at + '. ' + model.name + ' as a SysML v2 model: every element carries its Safety Lab key and element id, and its links to the system elements it is about. Uses the open SafetyLab library (' + LIBRARY_FILE + ').').split('\n').join('\n       ') + ' */');
        var links = [], dangling = 0;
        function body(e, ind) {
            var ins = ind + '    ';
            e.links.forEach(function (l) { if (!B.byRef[l.to] && l.field && l.raw != null && l.raw !== '') unres(e, l.field, l.raw); });
            if (e.ref && !/^sfg:|^stpa\.cs:|^aircraft:/.test(e.ref)) {
                var idText = ':>> key = ' + dq(e.ref) + '; :>> elementId = ' + dq(uuid5(ns, e.ref)) + ';' + (e.label != null ? ' :>> label = ' + dq(e.label) + ';' : '') + (e.localId != null ? ' :>> localId = ' + dq(e.localId) + ';' : '') + (e.unres ? ' :>> unresolved = ' + dq(JSON.stringify(e.unres)) + ';' : '');
                w(ins + '@Ident { ' + idText + ' }');
            } else if (e.ref) w(ins + '@Ident { :>> key = ' + dq(e.ref) + '; }');
            if (e.doc && docText(e.doc)) w(ins + 'doc /* ' + docText(e.doc).split('\n').join('\n' + ins + '   ') + ' */');
            e.attrs.forEach(function (a) { w(ins + ':>> ' + a[0] + ' = ' + a[1] + ';'); });
            if (e.kw === 'transition' && e.rate != null) w(ins + '@Rate { :>> perHour = ' + numText(e.rate) + ';' + (e.repair ? ' :>> repair = true;' : '') + ' }');
            if (e.entry) w(ins + 'entry; then ' + seg(e.entry) + ';');
            e.kids.forEach(function (k) { emit(k, ins); });
        }
        function head(e) {
            var s = e.kw;
            if (e.kw === 'transition') return 'transition ' + q(e.name) + ' first ' + seg(e.from) + ' then ' + seg(e.to);
            if (e.short) s += ' <' + q(e.short) + '>';
            s += ' ' + q(e.name);
            if (e.spec) s += ' :> ' + e.spec;
            if (e.type) s += ' : ' + (typeof e.type === 'string' ? e.type : qn(e.type).join('::'));   // qualified: a usage may share its definition's name
            if (e.kw === 'connection' && e.ends) s += ' connect ' + seg(e.ends[0]) + ' to ' + seg(e.ends[1]);
            return s;
        }
        function emit(e, ind) {
            e.links.forEach(function (l) { links.push([e, l]); });
            var hasBody = (e.ref && true) || e.doc || e.attrs.length || e.kids.length || e.rate != null || e.entry;
            if (!hasBody) { w(ind + head(e) + ';'); return; }
            w(ind + head(e) + ' {');
            body(e, ind);
            w(ind + '}');
        }
        model.kids.forEach(function (p) { emit(p, '    '); });
        var linkLines = [];
        links.forEach(function (x) {
            var e = x[0], l = x[1], t = B.byRef[l.to];
            if (!t) { dangling++; return; }
            linkLines.push('        #' + l.meta + ' dependency from ' + qn(e).join('::') + ' to ' + qn(t).join('::') + ';');
        });
        if (linkLines.length) { w('    package Links {'); linkLines.forEach(w); w('    }'); }
        w('}');
        return { text: out.join('\n') + '\n', dangling: dangling, elements: Object.keys(B.byRef).length, links: linkLines.length };
    }

    // ======================================================== index (for pickers and labels)
    function indexAreas(P, areaIds) {
        var B = build(P, areaIds), ns = projectNs(P).ns, list = [];
        Object.keys(B.byRef).forEach(function (ref) {
            var e = B.byRef[ref], kind = ref.slice(0, ref.indexOf(':'));
            if (!KIND_LABEL[kind]) return;
            var name = e.label != null && e.label !== '' ? e.label : e.name;
            list.push({ ref: ref, kind: kind, sysmlType: typeof e.type === 'string' ? e.type : e.spec || e.kw, id: e.short || e.localId || '', name: name, kindLabel: KIND_LABEL[kind],
                label: (e.short || e.localId ? (e.short || e.localId) + ' ' : '') + name + ' (' + KIND_LABEL[kind] + ')', qn: qn(e).join('::'), path: humanPath(e),
                links: e.links.map(function (l) { return { meta: l.meta, to: l.to }; }) });
            var it = list[list.length - 1], eid = null;
            Object.defineProperty(it, 'elementId', { enumerable: true, get: function () { return eid || (eid = uuid5(ns, ref)); } });
        });
        return list;
    }
    function index(P) { return indexAreas(P, null); }
    // Where an element sits, in words: its package and the elements above it, by name.
    function humanPath(e) { var parts = []; for (var x = e.parent; x && x.kw !== 'model'; x = x.parent) parts.unshift(x.kw === 'package' && x.area ? (AREA_BY_ID[x.area] || {}).pkg || x.name : (x.label != null && x.label !== '' ? x.label : x.name)); return parts.join(' > '); }

    // ======================================================== reading SysML v2 text
    // Adapted from Sys Lab src/sysml.js (tokenize / statements / interpret).
    var PUNCT = ['::>', ':>>', '::', ':>', '=>', '..', '->', '==', '!=', '<=', '>=', '@@', '{', '}', ';', ':', '.', ',', '<', '>', '[', ']', '(', ')', '=', '@', '#', '~', '*', '+', '-', '/', '%', '^', '?', '!', '&', '|', '$'];
    function fail(msg) { var e = new Error(msg); e.userFacing = true; return e; }
    var ID_RE = /[A-Za-z_À-￿][A-Za-z0-9_À-￿]*/y, NUM_RE = /\d+(\.\d+)?([eE][+-]?\d+)?/y;
    function tokenize(text) {
        // sticky regexes and char codes, no substrings per token: a 60 MB export reads in seconds
        var s = String(text).replace(/^﻿/, ''), out = [], i = 0, line = 1, n = s.length;
        var nl = function (a, b) { for (var k = a; k < b; k++) if (s.charCodeAt(k) === 10) line++; };
        while (i < n) {
            var cc = s.charCodeAt(i);
            if (cc === 10) { line++; i++; continue; }
            if (cc === 32 || cc === 9 || cc === 13 || cc === 12 || cc === 11 || cc === 160 || cc === 0xFEFF) { i++; continue; }
            if (cc === 47 && s.charCodeAt(i + 1) === 47) {
                if (s.charCodeAt(i + 2) === 42) { var e0 = s.indexOf('*/', i + 3); var j0 = e0 < 0 ? n : e0 + 2; nl(i, j0); i = j0; continue; }
                var e1 = s.indexOf('\n', i); i = e1 < 0 ? n : e1; continue;
            }
            if (cc === 47 && s.charCodeAt(i + 1) === 42) {
                var e2 = s.indexOf('*/', i + 2), j2 = e2 < 0 ? n : e2 + 2;
                var bodyTxt = s.slice(i + 2, e2 < 0 ? n : e2);
                if (bodyTxt.indexOf('\n') >= 0) bodyTxt = bodyTxt.split('\n').map(function (l) { return l.replace(/^\s*\*?\s?/, ''); }).join('\n');
                else bodyTxt = bodyTxt.replace(/^\s*\*?\s?/, '');
                out.push({ t: 'note', v: bodyTxt.trim(), line: line }); nl(i, j2); i = j2; continue;
            }
            if (cc === 39 || cc === 34) {
                var j = i + 1, v = '', run = j, q0 = cc;
                while (j < n) {
                    var c2 = s.charCodeAt(j);
                    if (c2 === q0) break;
                    if (c2 === 92 && j + 1 < n) { v += s.slice(run, j); var esc = s[j + 1]; v += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc === 'r' ? '\r' : esc; j += 2; run = j; continue; }
                    if (c2 === 10) line++;
                    j++;
                }
                v += s.slice(run, j);
                out.push({ t: cc === 39 ? 'name' : 'str', v: v, line: line }); i = j + 1; continue;
            }
            ID_RE.lastIndex = i; var id = ID_RE.exec(s);
            if (id) { out.push({ t: 'id', v: id[0], line: line }); i += id[0].length; continue; }
            NUM_RE.lastIndex = i; var num = NUM_RE.exec(s);
            if (num) { out.push({ t: 'num', v: num[0], line: line }); i += num[0].length; continue; }
            var pu = null; for (var p = 0; p < PUNCT.length; p++) if (s.startsWith(PUNCT[p], i)) { pu = PUNCT[p]; break; }
            if (pu) { out.push({ t: 'p', v: pu, line: line }); i += pu.length; continue; }
            i++;
        }
        return out;
    }
    function isP(t, v) { return t && t.t === 'p' && t.v === v; }
    function isW(t, v) { return t && t.t === 'id' && t.v === v; }
    function isName(t) { return t && (t.t === 'name' || t.t === 'id'); }
    function statements(toks, i) {
        var out = [];
        while (i < toks.length && !isP(toks[i], '}')) {
            var st = { toks: [], body: null, doc: null, line: toks[i].line }, depth = 0;
            while (i < toks.length) {
                var t = toks[i];
                if (depth === 0 && isP(t, ';')) { i++; break; }
                if (depth === 0 && isP(t, '}')) break;
                if (isP(t, '(') || isP(t, '[')) depth++;
                if (isP(t, ')') || isP(t, ']')) depth = Math.max(0, depth - 1);
                if (t.t === 'note' && depth === 0) { st.doc = t.v; i++; if (isP(toks[i], ';')) i++; break; }
                if (depth === 0 && isP(t, '{')) { var r = statements(toks, i + 1); st.body = r.out; i = r.i + 1; if (isP(toks[i], ';')) i++; break; }
                st.toks.push(t); i++;
            }
            if (st.toks.length || st.body || st.doc !== null) out.push(st);
        }
        return { out: out, i: i };
    }
    var MODS = { 'private': 1, 'public': 1, 'protected': 1, 'abstract': 1, 'variation': 1, 'readonly': 1, 'derived': 1, 'constant': 1, 'ref': 1, 'in': 1, 'out': 1, 'inout': 1, 'individual': 1, 'snapshot': 1, 'timeslice': 1, 'all': 1, 'standard': 1, 'library': 1 };
    function readRef(toks, j) {
        var segs = [], conj = false;
        if (isP(toks[j], '~')) { conj = true; j++; }
        while (isName(toks[j])) { segs.push(toks[j].v); j++; if (isP(toks[j], '::') || isP(toks[j], '.')) { j++; continue; } break; }
        return { ref: segs.length ? { segs: segs, conj: conj } : null, j: j };
    }
    function readValue(t, j) {
        // the value after "=": a string, a number, true/false, or an enum literal path
        var neg = false; if (isP(t[j], '-')) { neg = true; j++; }
        var x = t[j]; if (!x) return undefined;
        if (x.t === 'str') return x.v;
        if (x.t === 'num') return (neg ? -1 : 1) * Number(x.v);
        if (isW(x, 'true')) return true; if (isW(x, 'false')) return false;
        if (isName(x)) { var r = readRef(t, j); return r.ref ? { enumLit: r.ref.segs[r.ref.segs.length - 1], segs: r.ref.segs } : undefined; }
        return undefined;
    }
    function interpret(st) {
        var t = st.toks, j = 0;
        var el = { kind: null, def: false, name: null, short: null, type: null, spec: null, body: [], doc: st.doc, meta: {}, metaOf: {}, attrs: {}, prefix: [], line: st.line };
        while (j < t.length) {
            if (isP(t[j], '#') && isName(t[j + 1])) { el.prefix.push(t[j + 1].v); j += 2; continue; }
            if (t[j].t === 'id' && MODS[t[j].v] && !(t[j].v === 'ref' && isP(t[j + 1], ':'))) { if (t[j].v === 'in' || t[j].v === 'out' || t[j].v === 'inout') el.dir = t[j].v; if (t[j].v === 'library') el.library = true; j++; continue; }
            break;
        }
        if (isP(t[j], '@')) { el.kind = 'meta'; var r0 = readRef(t, j + 1); el.type = r0.ref; j = r0.j; }
        else if (isP(t[j], ':>>') || isP(t[j], ':>') || isP(t[j], '::>')) { el.kind = 'redef'; var r1 = readRef(t, j + 1); el.target = r1.ref; j = r1.j; if (isP(t[j], '=')) el.value = readValue(t, j + 1); }
        else if (t[j] && t[j].t === 'id') {
            el.kind = t[j].v; j++;
            if (el.kind === 'succession' && isW(t[j], 'flow')) { el.kind = 'flow'; j++; }
            if (el.kind === 'use' && isW(t[j], 'case')) { el.kind = 'usecase'; j++; }
            if (el.kind === 'include' && isW(t[j], 'use') && isW(t[j + 1], 'case')) j += 2;
            if (el.kind === 'exhibit' && isW(t[j], 'state')) j++;
            if (el.kind === 'assert' && isW(t[j], 'constraint')) { el.kind = 'constraint'; el.assert = true; j++; }
            if (isW(t[j], 'def')) { el.def = true; j++; }
        } else if (st.doc !== null && !t.length) el.kind = 'comment';
        if (!el.kind) el.kind = 'unknown';
        if (el.kind === 'end') { while (isP(t[j], '#') && isName(t[j + 1])) { el.prefix.push(t[j + 1].v); j += 2; } }
        if (isP(t[j], '<') && isName(t[j + 1]) && isP(t[j + 2], '>')) { el.short = t[j + 1].v; j += 3; }
        var j0 = j;
        var stop = { of: 1, from: 1, to: 1, connect: 1, allocate: 1, by: 1, about: 1, defined: 1, specializes: 1, subsets: 1, redefines: 1, typed: 1, first: 1, then: 1, perform: 1 };
        if (el.kind === 'attribute' && (isP(t[j], ':>>') || isW(t[j], 'redefines'))) { el.redefines = true; j++; }
        if (isName(t[j]) && !(t[j].t === 'id' && stop[t[j].v]) && ['import', 'redef', 'meta'].indexOf(el.kind) < 0) { el.name = t[j].v; j++; }
        // 13 Oct 2026 (v1.1): `then X;` (a state machine's entry succession) REFERS to X; it declares nothing. Read as a
        // name it shadowed the state X, so a link from that state (its model link) was lost on import.
        if (el.kind === 'then' && el.name != null) { el.thenTarget = el.name; el.name = null; }
        if (el.kind === 'import') { el.target = readRef(t, j).ref; }
        if (isP(t[j], '[')) { while (j < t.length && !isP(t[j], ']')) j++; j++; }
        if (isP(t[j], ':>') || isW(t[j], 'specializes')) { var r2 = readRef(t, j + 1); el.spec = r2.ref; j = r2.j; }
        if (isP(t[j], ':') || (isW(t[j], 'defined') && isW(t[j + 1], 'by'))) { j += isP(t[j], ':') ? 1 : 2; var r3 = readRef(t, j); el.type = r3.ref; j = r3.j; }
        if (!el.spec && (isP(t[j], ':>') || isW(t[j], 'specializes'))) { var r4 = readRef(t, j + 1); el.spec = r4.ref; j = r4.j; }
        var after = function (wd) { for (var k = j; k < t.length; k++) if (isW(t[k], wd)) return readRef(t, k + 1); return null; };
        if (el.kind === 'attribute' && isW(t[j], 'default') && isP(t[j + 1], '=')) { el.isDefault = true; j++; }
        if (el.kind === 'attribute' && isP(t[j], '=')) el.value = readValue(t, j + 1);
        if (el.kind === 'transition') {
            var at = function (wd) { for (var k = j0; k < t.length; k++) if (isW(t[k], wd)) return k; return -1; };
            var f = at('first'), th = at('then');
            if (f >= 0) el.from = readRef(t, f + 1).ref;
            if (th >= 0) el.to = readRef(t, th + 1).ref;
            if (f >= 0 && el.name === null && j0 < f && isName(t[j0])) el.name = t[j0].v;
        }
        if (el.kind === 'flow' || el.kind === 'message') {
            for (var k1 = j; k1 < t.length; k1++) if (isW(t[k1], 'of')) { var m1 = k1 + 1; if (isName(t[m1]) && isP(t[m1 + 1], ':')) { el.item = t[m1].v; el.itemType = readRef(t, m1 + 2).ref; } else el.itemType = readRef(t, m1).ref; break; }
            var a1 = after('from'), b1 = after('to'); el.from = a1 && a1.ref; el.to = b1 && b1.ref;
        }
        if (el.kind === 'connect' || el.kind === 'connection' || el.kind === 'interface') {
            for (var k2 = (el.kind === 'connect' ? Math.max(0, j - 1) : j); k2 < t.length; k2++) if (isW(t[k2], 'connect')) { el.from = readRef(t, k2 + 1).ref; var b2 = after('to'); el.to = b2 && b2.ref; break; }
        }
        if ((el.kind === 'connection' || el.kind === 'interface') && !el.from) { var a3 = readRef(t, j0); if (a3.ref && isW(t[a3.j], 'to')) { el.from = a3.ref; el.to = readRef(t, a3.j + 1).ref; el.name = null; } }
        if (el.kind === 'connect' && !el.from && el.name) { var a4 = readRef(t, j - 1); el.from = a4.ref; var b4 = after('to'); el.to = b4 && b4.ref; el.name = null; }
        if (el.kind === 'allocate' || el.kind === 'allocation') {
            var ka = -1; for (var k3 = 0; k3 < t.length; k3++) if (isW(t[k3], 'allocate') && k3 >= (el.kind === 'allocate' ? 0 : j)) { ka = k3; break; }
            var a5 = readRef(t, el.kind === 'allocate' ? (el.name ? j - 1 : j) : ka + 1); el.from = a5.ref; var b5 = after('to'); el.to = b5 && b5.ref; if (el.kind === 'allocate') el.name = null;
        }
        if (el.kind === 'dependency') {
            var fk = -1, tk = -1; for (var k4 = j; k4 < t.length; k4++) { if (fk < 0 && isW(t[k4], 'from')) fk = k4; if (tk < 0 && isW(t[k4], 'to')) tk = k4; }
            var list = function (a, b) { var o = [], m = a; while (m < b) { var r = readRef(t, m); if (r.ref) o.push(r.ref); var moved = r.j !== m; m = r.j; if (isP(t[m], ',')) m++; else if (!moved) m++; } return o; };
            if (tk >= 0) { el.froms = list(fk >= 0 ? fk + 1 : j, tk); el.tos = list(tk + 1, t.length); }
        }
        if (el.kind === 'satisfy') { var m6 = isW(t[j], 'requirement') ? j + 1 : el.name ? j - 1 : j; el.req = readRef(t, m6).ref; var b6 = after('by'); el.by = b6 && b6.ref; el.name = null; }
        if (el.kind === 'end') { for (var k5 = 0; k5 < t.length; k5++) if (isP(t[k5], '::>') || isP(t[k5], ':>') || isP(t[k5], ':')) { el.target = readRef(t, k5 + 1).ref; break; } }
        if (st.body) el.body = st.body.map(interpret);
        el.body.forEach(function (b) {
            if (b.kind === 'meta') { var mn = b.type ? b.type.segs[b.type.segs.length - 1] : ''; var mo = el.metaOf[mn] = el.metaOf[mn] || {}; b.body.forEach(function (x) { if (x.kind === 'redef' && x.target) { var k = x.target.segs[x.target.segs.length - 1]; mo[k] = x.value; el.meta[k] = x.value; } }); }
            if (b.kind === 'redef' && b.target && b.value !== undefined) el.attrs[b.target.segs[b.target.segs.length - 1]] = b.value;
            if (b.kind === 'attribute' && b.name && b.value !== undefined && el.attrs[b.name] === undefined) el.attrs[b.name] = b.value;
            if (b.kind === 'doc' && b.doc && el.doc === null) el.doc = b.doc;
        });
        return el;
    }
    function parse(text) {
        var toks = tokenize(text), r = statements(toks, 0);
        if (r.i < toks.length) throw fail('The SysML file has a "}" with nothing to close (line ' + toks[r.i].line + ').');
        return r.out.map(interpret);
    }

    // ======================================================== import: plan
    function lastSeg(r) { return r && r.segs.length ? r.segs[r.segs.length - 1] : null; }
    // Name lookup over the parsed tree: an element's members are its own body plus, for a
    // usage typed by a definition (or a definition that specializes one), that definition's.
    function Scope(files) {
        var all = [], tops = [];
        files.forEach(function (els) { els.forEach(function (e) { tops.push(e); }); });
        (function walk(list, owner) { list.forEach(function (e) { e.owner = owner; all.push(e); walk(e.body, e); }); })(tops, null);
        // Each namespace is indexed once (name and short name -> member), so resolving 100k links stays linear.
        var idxOf = new Map(), topIdx = null;
        function mkIdx(list) {
            var map = new Map(), imports = [];
            list.forEach(function (x) {
                if (x.kind === 'import') { if (x.target) imports.push(x); return; }
                if (x.kind === 'meta' || x.kind === 'redef') return;
                if (x.name != null && !map.has(x.name)) map.set(x.name, x);
                if (x.short != null && !map.has(x.short)) map.set(x.short, x);
            });
            return { list: list, map: map, imports: imports };
        }
        function index(e) {
            if (!e) return topIdx || (topIdx = mkIdx(tops));
            var hit = idxOf.get(e); if (hit) return hit;
            var own = e.body.slice(), ix = mkIdx(own);
            idxOf.set(e, ix);
            var base = e.type || e.spec;
            if (base && e.kind !== 'import') {
                var d = resolve(base.segs, e.owner);
                if (d && d !== e) { var di = index(d); di.list.forEach(function (m) { own.push(m); if (m.kind === 'import' || m.kind === 'meta' || m.kind === 'redef') return; if (m.name != null && !ix.map.has(m.name)) ix.map.set(m.name, m); if (m.short != null && !ix.map.has(m.short)) ix.map.set(m.short, m); }); }
            }
            return ix;
        }
        function members(e) { return index(e).list; }
        var importCache = new Map();
        function find(ix, nm) {
            var hit = ix.map.get(nm); if (hit) return hit;
            for (var k = 0; k < ix.imports.length; k++) {
                var im = ix.imports[k];
                var pkg = importCache.has(im) ? importCache.get(im) : null;
                if (!importCache.has(im)) { importCache.set(im, null); var segs = im.target.segs; pkg = resolveAbs(segs[segs.length - 1] === '*' ? segs.slice(0, -1) : segs); importCache.set(im, pkg); }
                if (pkg && pkg.body) { var h2 = index(pkg).map.get(nm); if (h2) return h2; }
            }
            return null;
        }
        function resolveAbs(segs) { var cur = null; for (var i = 0; i < segs.length; i++) { var nx = find(index(cur), segs[i]); if (!nx) return null; cur = nx; } return cur; }
        function resolve(segs, from) {
            if (!segs || !segs.length) return null;
            for (var sc = from; ; sc = sc ? sc.owner : null) {
                var first = find(index(sc), segs[0]);
                if (first) { var cur = first, ok = true; for (var i = 1; i < segs.length; i++) { var nx = find(index(cur), segs[i]); if (!nx) { ok = false; break; } cur = nx; } if (ok) return cur; }
                if (!sc) break;
            }
            return null;
        }
        return { all: all, tops: tops, resolve: resolve, members: members };
    }
    function typeName(e) { var r = e.type || e.spec; return r ? r.segs.join('::') : ''; }
    function slType(e) { var r = e.type || e.spec; if (!r) return null; var s = r.segs; return s.length >= 2 && s[s.length - 2] === 'SafetyLab' ? s[s.length - 1] : (s.length === 1 && LIB_DEFS[s[0]] ? s[0] : null); }
    var LIB_DEFS = {};
    (function () { var re = /\b(?:part|action|requirement|state|connection|enum|metadata) def (\w+)/g, m; while ((m = re.exec(LIBRARY_TEXT))) LIB_DEFS[m[1]] = 1; })();
    function attrOf(e, k) { var v = e.attrs[k]; return v && typeof v === 'object' ? v.enumLit : v; }
    function strAttr(e, k) { var v = attrOf(e, k); return v == null ? '' : String(v); }
    function numAttr(e, k) { var v = attrOf(e, k); return typeof v === 'number' ? v : (v != null && v !== '' && isFinite(Number(v)) ? Number(v) : null); }
    function identKey(e) { var m = e.metaOf.Ident; return m && typeof m.key === 'string' ? m.key : null; }
    function identLabel(e) { var m = e.metaOf.Ident; return m && typeof m.label === 'string' ? m.label : null; }
    function shortOf(e) { var m = e.metaOf.Ident; return e.short || (m && typeof m.localId === 'string' ? m.localId : null); }
    function nameOf(e) { var l = identLabel(e); return l != null ? l : (e.name || shortOf(e) || ''); }

    // Read every file into one picture: SafetyLab elements by key, their links, and the
    // plain SysML (architecture, functions, requirements) another tool wrote.
    function readFiles(files) {
        var parsed = [], notes = [], unmapped = [];
        files.forEach(function (f) {
            try { parsed.push(parse(f.text)); } catch (e) { notes.push(f.name + ': ' + (e.message || e)); }
        });
        var sc = Scope(parsed);
        var isLib = function (e) { for (var x = e; x; x = x.owner) if (x.kind === 'package' && (x.library || x.name === 'SafetyLab')) return true; return false; };
        var els = [], byKey = Object.create(null), keyOfEl = new Map();
        sc.all.forEach(function (e) {
            if (isLib(e)) return;
            var k = identKey(e);
            if (k) { els.push(e); if (!byKey[k]) byKey[k] = e; keyOfEl.set(e, k); }
        });
        // links: #Meta dependency from A to B
        var links = [];
        sc.all.forEach(function (e) {
            if (e.kind !== 'dependency' || isLib(e) || !e.froms || !e.tos) return;
            var meta = e.prefix.filter(function (p) { return LINK_METAS.indexOf(p) >= 0; })[0] || null;
            e.froms.forEach(function (fr) {
                var a = sc.resolve(fr.segs, e.owner);
                e.tos.forEach(function (to) {
                    var b = sc.resolve(to.segs, e.owner);
                    if (!a || !b) { notes.push('A link on line ' + e.line + ' points at something not in the file (' + (a ? to.segs.join('::') : fr.segs.join('::')) + '): skipped.'); return; }
                    links.push({ meta: meta || 'About', from: a, to: b, line: e.line, name: e.name });
                });
            });
        });
        return { scope: sc, parsed: parsed, notes: notes, unmapped: unmapped, els: els, byKey: byKey, keyOfEl: keyOfEl, links: links, isLib: isLib };
    }

    // ---- the per-kind readers: a parsed SafetyLab element back to Safety Lab fields ----
    function kindOfKey(k) { var i = k.indexOf(':'); return i < 0 ? '' : k.slice(0, i); }
    function idOfKey(k) { var i = k.indexOf(':'); return i < 0 ? k : k.slice(i + 1); }
    function splitScoped(id) { var i = id.indexOf('/'); return i < 0 ? [null, id] : [id.slice(0, i), id.slice(i + 1)]; }

    function planImport(P, files, opts) {
        opts = opts || {};
        var R = readFiles(files), plan = { files: files.map(function (f) { return f.name; }), notes: R.notes.slice(), unmapped: [], adds: [], changes: [], counts: {}, ops: [], projectName: null, kept: 0 };
        var linksFrom = new Map();
        R.links.forEach(function (l) { var k = R.keyOfEl.get(l.to); var lst = linksFrom.get(l.from); if (!lst) { lst = []; linksFrom.set(l.from, lst); } lst.push({ meta: l.meta, toKey: k || null, toEl: l.to }); });
        var L = function (e, meta, kinds) { return (linksFrom.get(e) || []).filter(function (l) { return (!meta || l.meta === meta) && l.toKey && (!kinds || kinds.indexOf(kindOfKey(l.toKey)) >= 0); }).map(function (l) { return l.toKey; }); };
        plan.linksOf = L;
        // the model package's name becomes the project name of an untitled project
        var top = R.scope.tops.filter(function (e) { return e.kind === 'package' && !e.library && e.name !== 'SafetyLab'; })[0];
        if (top) { plan.projectName = top.name; var pm = top.metaOf.Ident; if (pm && pm.key === 'project' && /^[0-9a-f-]{36}$/i.test(S(pm.elementId))) plan.ns = pm.elementId; }
        // SafetyLab elements, in file order
        R.els.forEach(function (e) { plan.ops.push({ key: R.keyOfEl.get(e), el: e }); });
        // plain SysML from another tool (no Ident): architecture, functions, requirements
        if (!R.els.length || opts.foreign !== false) foreignPlan(P, R, plan);
        plan.R = R;
        diffPlan(P, plan);
        return plan;
    }

    // What another tool's SysML maps to: part definitions with parts become the aircraft and
    // its systems and items, connections / interfaces / flows between systems become system
    // interfaces, action definitions and usages become functions, requirements become
    // requirements. Everything else is listed as not brought in.
    function foreignPlan(P, R, plan) {
        var sc = R.scope, isOurs = function (e) { for (var x = e; x; x = x.owner) if (identKey(x) || R.isLib(x)) return true; return false; };
        var foreign = sc.all.filter(function (e) { return !isOurs(e); });
        if (!foreign.length) return;
        var fops = plan.foreign = { systems: [], items: [], ifaces: [], functions: [], reqs: [] };
        var partDefs = foreign.filter(function (e) { return e.kind === 'part' && e.def; });
        var usedTypes = new Set(foreign.filter(function (e) { return e.kind === 'part' && !e.def && e.type; }).map(function (e) { return lastSeg(e.type); }));
        var hasParts = function (d) { return sc.members(d).some(function (u) { return u.kind === 'part' && !u.def && u.name; }); };
        var topDefs = foreign.filter(function (e) { return e.kind === 'part' && !e.def && e.type && (!e.owner || e.owner.kind === 'package'); }).map(function (e) { return sc.resolve(e.type.segs, e.owner); }).filter(function (d) { return d && d.kind === 'part' && d.def; });
        var cands = partDefs.filter(function (d) { return hasParts(d) && (topDefs.indexOf(d) >= 0 || (!usedTypes.has(d.name) && !(d.short && usedTypes.has(d.short)))); });
        cands.sort(function (a, b) { return ((b.meta.kind === 'Aircraft') - (a.meta.kind === 'Aircraft')) || (sc.members(b).length - sc.members(a).length); });
        var rootDef = cands[0] || null;
        var sysOfUsage = new Map();
        var defUses = function (d) { return foreign.filter(function (u) { return u.kind === 'part' && !u.def && u.type && u.owner && u.owner.kind === 'part' && sc.resolve(u.type.segs, u.owner) === d; }).length; };
        if (rootDef) {
            var seen = new Set();
            sc.members(rootDef).filter(function (u) { return u.kind === 'part' && !u.def && u.name; }).forEach(function (u) {
                var d = u.type ? sc.resolve(u.type.segs, u.owner) : null;
                var nm = (u.metaOf.SysLab && u.metaOf.SysLab.title) || (d ? d.name : u.name);
                var code = (d && d.short) || (/^[A-Z][A-Z0-9]{0,7}$/.test(u.name) ? u.name : null);
                var sys = { name: nm, code: code || null, line: u.line, items: [] };
                fops.systems.push(sys); sysOfUsage.set(u, sys);
                // every part below the system (any depth) becomes an item of it
                (function walk(container, depth) {
                    if (depth > 12 || !container || seen.has(container)) return; seen.add(container);
                    sc.members(container).filter(function (x) { return x.kind === 'part' && !x.def && x.name; }).forEach(function (x) {
                        var xd = x.type ? sc.resolve(x.type.segs, x.owner) : null;
                        var reused = xd && defUses(xd) > 1;
                        var title = (x.metaOf.SysLab && x.metaOf.SysLab.title) || (xd ? (reused ? xd.name + ' ' + x.name : xd.name) : x.name);
                        var ident = (x.short || (/^[A-Z0-9][A-Z0-9_.-]{1,31}$/.test(x.name) ? x.name : '') || (xd && !reused && xd.short) || '');
                        sys.items.push({ name: title, itemId: ident, line: x.line, desc: (xd && xd.doc) || x.doc || '', el: x });
                        walk(xd || x, depth + 1);
                    });
                })(d || u, 0);
            });
            // connections between two systems: system interfaces
            var sysByUsageName = new Map(); sysOfUsage.forEach(function (s, u) { sysByUsageName.set(u.name, s); });
            var conns = [];
            (function collect(container, depth) { if (depth > 12) return; sc.members(container).forEach(function (c) { if (['flow', 'connect', 'connection', 'interface'].indexOf(c.kind) >= 0 && c.from && c.to) conns.push(c); }); })(rootDef, 0);
            conns.forEach(function (c) {
                var a = sysByUsageName.get(c.from.segs[0]), b = sysByUsageName.get(c.to.segs[0]);
                if (!a || !b || a === b) { if (!a || !b) plan.unmapped.push('Line ' + c.line + ': a ' + c.kind + ' that is not between two systems (Safety Lab keeps interfaces between systems).'); return; }
                fops.ifaces.push({ from: a, to: b, medium: c.item || (c.itemType ? lastSeg(c.itemType) : '') || c.name || c.short || '', icdRef: c.short || '', kind: 'interface', line: c.line });
            });
        } else if (partDefs.length) plan.notes.push('No part definition holds parts, so there is no architecture to bring in.');
        // functions. A function group (an action definition named "... functions", or Sys Lab's
        // "Function group") scopes its functions to the aircraft or to a system; an action
        // definition whose body holds other actions is an aircraft function with sub-functions.
        var actDefs = foreign.filter(function (e) { return e.kind === 'action' && e.def; });
        var isGroupDef = function (d) { return d.meta.kind === 'Function group' || /\bfunctions$/i.test(d.name || ''); };
        var kidActs = function (d) { return d.body.filter(function (u) { return u.kind === 'action' && !u.def && u.name; }); };
        var defOfUse = function (u) { return u.type ? sc.resolve(u.type.segs, u.owner) : null; };
        var sysForName = function (nm) {
            var n = S(nm).toLowerCase();
            return fops.systems.filter(function (s) { return S(s.name).toLowerCase() === n || (s.code && s.code.toLowerCase() === n); })[0] ||
                { existing: systems(P).filter(function (x) { return S(x.name).toLowerCase() === n || S(x.id).toLowerCase() === n; })[0] || null };
        };
        var seenAct = new Set(), rowsOut = [], sysFns = [];
        var fnFrom = function (d, u) { return { id: (d && d.short) || (u && u.short) || '', name: (d && d.name) || (u && u.name) || '', def: (d && d.doc) || (u && u.doc) || '', line: (d || u).line, el: d || u }; };
        var addTop = function (d, u) {
            var key = d || u; if (seenAct.has(key)) return; seenAct.add(key);
            var kids = kidActs(d || u);
            if (kids.length) {
                var g = fnFrom(d, u);
                kids.forEach(function (k) { var kd = defOfUse(k); var leaf = fnFrom(kd && kd.kind === 'action' ? kd : null, k); if (kd) seenAct.add(kd); seenAct.add(k); rowsOut.push({ id: leaf.id, name: leaf.name, def: leaf.def, line: leaf.line, el: leaf.el, groupId: g.id, groupName: g.name }); });
            } else { var f = fnFrom(d, u); rowsOut.push({ id: f.id, name: f.name, def: f.def, line: f.line, el: f.el, groupId: '', groupName: '' }); }
        };
        actDefs.filter(isGroupDef).forEach(function (g) {
            var m = /^(.*?)\s*functions$/i.exec(g.name || ''), scopeName = m ? m[1] : '';
            var isAc = !scopeName || /^aircraft$/i.test(scopeName);
            kidActs(g).forEach(function (u) {
                var d = defOfUse(u);
                if (isAc) addTop(d && d.kind === 'action' ? d : null, u);
                else {
                    var sy = sysForName(scopeName);
                    (function walk(x, xd) { var key = xd || x; if (seenAct.has(key)) return; seenAct.add(key); var f = fnFrom(xd, x); f.sys = sy; f.scopeName = scopeName; sysFns.push(f); kidActs(xd || x).forEach(function (k) { var kd = defOfUse(k); walk(k, kd && kd.kind === 'action' ? kd : null); }); })(u, d && d.kind === 'action' ? d : null);
                }
            });
            seenAct.add(g);
        });
        // package-level action usages, then action definitions nothing else used
        foreign.filter(function (e) { return e.kind === 'action' && !e.def && e.name && e.owner && e.owner.kind === 'package'; }).forEach(function (u) { var d = defOfUse(u); addTop(d && d.kind === 'action' ? d : null, d ? null : u); if (d) seenAct.add(u); });
        actDefs.filter(function (d) { return !isGroupDef(d) && !seenAct.has(d); }).forEach(function (d) { addTop(d, null); });
        fops.functions = rowsOut;
        fops.sysFunctions = sysFns.filter(function (f) { return f.sys && (f.sys.name || f.sys.existing); });
        sysFns.filter(function (f) { return !(f.sys && (f.sys.name || f.sys.existing)); }).forEach(function (f) { plan.unmapped.push('Function ' + (f.id || f.name) + ' (line ' + f.line + '): its system "' + f.scopeName + '" is not in the file or the project.'); });
        // allocations of an aircraft function to an item: the item realizes that function (item traceIds)
        fops.allocs = [];
        var actOf = function (x) { if (!x) return null; if (x.kind === 'action' && !x.def) { var d = defOfUse(x); return d && d.kind === 'action' ? d : x; } return x; };
        foreign.filter(function (e) { return (e.kind === 'allocate' || e.kind === 'allocation') && e.from && e.to; }).forEach(function (a) {
            var fr = actOf(sc.resolve(a.from.segs, a.owner)), to = sc.resolve(a.to.segs, a.owner);
            if (fr && to) fops.allocs.push({ fn: fr, part: to, line: a.line });
        });
        // traces between functions ("dependency X traces to Y" from Sys Lab)
        fops.traces = [];
        foreign.filter(function (e) { return e.kind === 'dependency' && e.froms && e.tos && !e.prefix.length; }).forEach(function (dep) {
            dep.froms.forEach(function (fr) { dep.tos.forEach(function (to) { var a = sc.resolve(fr.segs, dep.owner), b = sc.resolve(to.segs, dep.owner); if (a && b && a.kind === 'action' && b.kind === 'action') fops.traces.push({ from: actOf(a), to: actOf(b) }); }); });
        });
        // requirements: in a package named after a system they are that system's
        foreign.filter(function (e) { return e.kind === 'requirement' && (e.name || e.short); }).forEach(function (r) {
            if (r.def && foreign.some(function (u) { return u.kind === 'requirement' && !u.def && u.type && lastSeg(u.type) === r.name; })) return;   // a definition with usages: the usages are the requirements
            var id = r.short || (r.metaOf.SysLab && r.metaOf.SysLab.id) || '';
            var sys = null; for (var x = r.owner; x && !sys; x = x.owner) if (x.kind === 'package' && x.name) { var c = sysForName(x.name); if (c && (c.name || c.existing)) sys = c; }
            fops.reqs.push({ id: id, text: r.doc || r.name || id, name: r.name || id, line: r.line, rationale: (r.metaOf.SysLab && r.metaOf.SysLab.rationale) || '', sys: sys });
        });
        // what is left: list it, never guess
        var inner = 0; foreign.forEach(function (c) { if (['flow', 'connect', 'connection', 'interface'].indexOf(c.kind) >= 0 && !c.def && c.from && c.to && c.owner && c.owner !== rootDef && c.owner.kind === 'part') inner++; });
        if (inner) plan.unmapped.push(inner + ' connection' + (inner === 1 ? '' : 's') + ' inside a system: Safety Lab keeps the interfaces between systems.');
        var mapped = { part: 1, action: 1, requirement: 1, package: 1, doc: 1, comment: 1, meta: 1, redef: 1, import: 1, attribute: 1, port: 1, item: 1, flow: 1, connect: 1, connection: 1, interface: 1, metadata: 1, end: 1, dependency: 1, satisfy: 1, allocate: 1 };
        var counts = Object.create(null);
        foreign.forEach(function (e) { if (!mapped[e.kind] && (!e.owner || e.owner.kind === 'package')) counts[e.kind + (e.def ? ' definition' : '')] = (counts[e.kind + (e.def ? ' definition' : '')] || 0) + 1; });
        var ports = foreign.filter(function (e) { return e.kind === 'port' && !e.def; }).length;
        if (ports) plan.unmapped.push(ports + ' port' + (ports === 1 ? '' : 's') + ': Safety Lab keeps the interfaces between systems, not the ports on them.');
        var itemEls = new Set(); fops.systems.forEach(function (sy) { sy.items.forEach(function (it) { itemEls.add(it.el); }); });
        var rowEls = new Set(fops.functions.map(function (r) { return r.el; }));
        var sysFnEls = new Set(arr(fops.sysFunctions).map(function (r) { return r.el; }));
        var sysUseEls = new Set(); sysOfUsage.forEach(function (v, u) { sysUseEls.add(u); });
        var allocKept = fops.allocs.filter(function (a) { return rowEls.has(a.fn) && itemEls.has(a.part); });
        var allocOwn = fops.allocs.filter(function (a) { return sysFnEls.has(a.fn) && (sysUseEls.has(a.part) || itemEls.has(a.part)); });
        fops.allocs = allocKept;
        var allocLeft = foreign.filter(function (e) { return (e.kind === 'allocate' || e.kind === 'allocation') && !e.def; }).length - allocKept.length - allocOwn.length;
        if (allocLeft > 0) plan.unmapped.push(allocLeft + ' allocation' + (allocLeft === 1 ? '' : 's') + ' of an aircraft function to a whole system: Safety Lab keeps those as system functions; check System workspaces.');
        Object.keys(counts).forEach(function (k) { plan.unmapped.push(counts[k] + ' ' + k + (counts[k] === 1 ? '' : 's') + ': no Safety Lab equivalent, not brought in.'); });
    }

    // ---- diff: what the plan would add or change, by key, then id, then name ----
    function diffPlan(P, plan) {
        var have = haveIndex(P);
        plan.ops.forEach(function (op) {
            var k = op.key, kind = kindOfKey(k), e = op.el;
            if (k === 'project' || /^(sfg|aircraft|stpa\.cs):/.test(k)) { op.skip = true; return; }
            if (kind === 'mks' || kind === 'mkt' || kind === 'rbdb') { op.kind = kind; op.nested = true; return; }
            var READ = READERS[kind];
            if (!READ) { op.skip = true; plan.unmapped.push((nameOf(e) || k) + ' (line ' + e.line + '): ' + kind + ' is not a kind this version of Safety Lab reads.'); return; }
            var hit = have.find(kind, k, shortOf(e), nameOf(e), e);
            op.kind = kind; op.target = hit;
            if (!hit) { plan.adds.push({ kind: kind, label: KIND_LABEL[kind] || kind, name: (e.short ? e.short + ' ' : '') + nameOf(e), key: k }); }
            else {
                var fields = READ.fields ? READ.fields(e, plan) : {}, changed = [];
                Object.keys(fields).forEach(function (f) { var cur = hit.obj[f]; var nv = fields[f]; if (nv === undefined) return; if (JSON.stringify(cur == null ? '' : cur) !== JSON.stringify(nv == null ? '' : nv)) changed.push(f); });
                op.changed = changed;
                if (!changed.length) plan.kept++;
                if (changed.length) plan.changes.push({ kind: kind, label: KIND_LABEL[kind] || kind, name: (e.short ? e.short + ' ' : '') + nameOf(e), fields: changed, key: k });
            }
        });
        if (plan.foreign) {
            var f = plan.foreign;
            f.systems.forEach(function (s) { s.target = systems(P).find(function (x) { return (s.code && x.id === s.code) || S(x.name).toLowerCase() === S(s.name).toLowerCase(); }) || null; if (!s.target) plan.adds.push({ kind: 'sys', label: 'System', name: s.name }); else plan.kept++; });
            f.systems.forEach(function (s) { s.items.forEach(function (it) { it.target = arr(P.itemsData).find(function (x) { return (it.itemId && x.itemId === it.itemId) || (S(x.name).toLowerCase() === S(it.name).toLowerCase() && (!s.target || x.owningSystemId === s.target.id)); }) || null; if (!it.target) plan.adds.push({ kind: 'item', label: 'Item', name: (it.itemId ? it.itemId + ' ' : '') + it.name }); else plan.kept++; }); });
            f.ifaces.forEach(function (x) { plan.adds.push({ kind: 'iface', label: 'Interface', name: x.from.name + ' to ' + x.to.name + (x.medium ? ' (' + x.medium + ')' : '') }); });
            f.functions.forEach(function (fn) { fn.target = arr(P.acFunctionsData).find(function (x) { return (fn.id && x.subId === fn.id) || S(x.subName).toLowerCase() === S(fn.name).toLowerCase(); }) || null; if (!fn.target) plan.adds.push({ kind: 'fn', label: 'Function', name: (fn.id ? fn.id + ' ' : '') + fn.name }); else plan.kept++; });
            var sysT = function (sy) { return sy ? (sy.existing || sy.target || null) : null; };
            arr(f.sysFunctions).forEach(function (fn) { var st = sysT(fn.sys); fn.target = st ? arr(st.functions).find(function (x) { return (fn.id && x.funcId === fn.id) || S(x.funcName).toLowerCase() === S(fn.name).toLowerCase(); }) || null : null; if (!fn.target) plan.adds.push({ kind: 'sfn', label: 'System function', name: (fn.id ? fn.id + ' ' : '') + fn.name }); else plan.kept++; });
            f.reqs.forEach(function (r) { var st = sysT(r.sys); var pool = r.sys ? (st ? arr(st.req) : []) : arr(P.acReqData); r.target = pool.find(function (x) { return (r.id && x.id === r.id) || (r.text && S(x.text) === r.text); }) || null; if (!r.target) plan.adds.push({ kind: r.sys ? 'sreq' : 'req', label: r.sys ? 'System requirement' : 'Requirement', name: (r.id ? r.id + ' ' : '') + clip(r.text, 60) }); else plan.kept++; });
            // a second import of the same file adds nothing
            f.ifaces = f.ifaces.filter(function (x) {
                var a = x.from.target, b = x.to.target; if (!a || !b) return true;
                var dup = arr(cfg(P).interfaces).some(function (y) { return y.fromSystemId === a.id && y.toSystemId === b.id && S(y.medium) === S(x.medium); });
                if (dup) plan.adds = plan.adds.filter(function (ad) { return !(ad.kind === 'iface' && ad.name === x.from.name + ' to ' + x.to.name + (x.medium ? ' (' + x.medium + ')' : '')); });
                return !dup;
            });
        }
        var c = plan.counts; plan.adds.forEach(function (a) { c[a.label] = (c[a.label] || 0) + 1; });
    }

    // Existing elements of the project, found by key, then short id, then name, per kind.
    function haveIndex(P) {
        var cache = Object.create(null);
        function list(kind) {
            if (cache[kind]) return cache[kind];
            var out = [];
            var push = function (ref, id, name, obj, extra) { out.push({ ref: ref, id: S(id), name: S(name), obj: obj, extra: extra || {} }); };
            switch (kind) {
                case 'sys': systems(P).forEach(function (s) { push('sys:' + s.id, s.id, s.name, s); }); break;
                case 'item': arr(P.itemsData).forEach(function (r) { push(refOf('item', r), r.itemId, r.name, r); }); break;
                case 'res': arr(P.resourcesData).forEach(function (r) { push(refOf('res', r), r.resId, r.name, r); }); break;
                case 'zone': arr(P.zsaData).forEach(function (r) { push(refOf('zone', r), r.zoneId, r.desc, r); }); break;
                case 'route': arr(P.routingData).forEach(function (r) { push(refOf('route', r), r.routingId, r.name, r); }); break;
                case 'iface': { var ifs = arr(cfg(P).interfaces); ifs.forEach(function (f, i) { push('iface:' + ifaceId(f, i, ifs), f.icdRef, f.medium, f); }); break; }
                case 'afn': { var seen = {}; arr(P.acFunctionsData).forEach(function (r) { if (r.funcId && !seen[r.funcId]) { seen[r.funcId] = 1; push('afn:' + r.funcId, r.funcId, r.funcName, r); } }); break; }
                case 'fn': arr(P.acFunctionsData).forEach(function (r) { push(refOf('fn', r), r.subId, r.subName, r); }); break;
                case 'sfn': systems(P).forEach(function (s) { arr(s.functions).forEach(function (f) { push(refOf('sfn', f, { systemId: s.id }), f.funcId, f.funcName, f, { sys: s }); }); }); break;
                case 'req': arr(P.acReqData).forEach(function (r) { push(refOf('req', r), r.id, r.text, r); }); break;
                case 'sreq': systems(P).forEach(function (s) { arr(s.req).forEach(function (r) { push(refOf('sreq', r, { systemId: s.id }), r.id, r.text, r, { sys: s }); }); }); break;
                case 'asm': arr(P.acAssumptionsData).forEach(function (a) { push('asm:' + a.asmId, a.asmId, a.asmId, a); }); break;
                case 'sasm': systems(P).forEach(function (s) { arr(s.asm).forEach(function (a) { push('sasm:' + s.id + '/' + a.asmId, a.asmId, a.asmId, a, { sys: s }); }); }); break;
                case 'fc': fcimFcs(P.acFcimData).forEach(function (fc) { push('fc:' + fc.id, fc.id, fc.desc, fc); }); arr(P.acFhaData).forEach(function (r) { if (r.fcId) push('fc:' + r.fcId, r.fcId, r.fcDesc, { id: r.fcId, desc: r.fcDesc, fromFha: true }); }); break;
                case 'sfc': systems(P).forEach(function (s) { fcimFcs(s.fcim).forEach(function (fc) { push('sfc:' + s.id + '/' + fc.id, fc.id, fc.desc, fc, { sys: s }); }); arr(s.fha).forEach(function (r) { if (r.fcId) push('sfc:' + s.id + '/' + r.fcId, r.fcId, r.fcDesc, { id: r.fcId, desc: r.fcDesc, fromFha: true }, { sys: s }); }); }); break;
                case 'fha': arr(P.acFhaData).forEach(function (r) { push(refOf('fha', r), '', '', r); }); break;
                case 'sfha': systems(P).forEach(function (s) { arr(s.fha).forEach(function (r) { push(refOf('sfha', r, { systemId: s.id }), '', '', r, { sys: s }); }); }); break;
                case 'ft': arr(P.ftaPages).forEach(function (pg) { push('ft:' + pg.id, pg.id, pg.name, pg); }); break;
                case 'ftn': arr(P.ftaPages).forEach(function (pg) { (function walk(n) { if (!n) return; push('ftn:' + pg.id + '/' + n.id, n.displayId, n.name, n, { page: pg }); kidsOf(n).forEach(walk); })(pg.root); }); break;
                case 'ccf': { var g = {}; arr(P.ftaPages).forEach(function (pg) { (function walk(n) { if (!n) return; if (n.ccfGroup && !g[n.ccfGroup]) { g[n.ccfGroup] = 1; push('ccf:' + n.ccfGroup, n.ccfGroup, n.ccfGroup, { name: n.ccfGroup }); } kidsOf(n).forEach(walk); })(pg.root); }); break; }
                case 'cma': arr(P.cmaData).forEach(function (r) { push(refOf('cma', r), r.cmaId, r.subject, r); }); break;
                case 'pra': arr(P.praData).forEach(function (r) { push(refOf('pra', r), r.praId, r.threat, r); }); break;
                case 'fmea': arr(P.fmeaData).forEach(function (r) { push(refOf('fmea', r), r.fmeaId, r.mode || r.funcMode, r); }); break;
                case 'bt': arr(cfg(P).bowties).forEach(function (b) { push('bt:' + b.id, b.id, b.name, b); }); break;
                case 'btb': arr(cfg(P).bowties).forEach(function (b) { arr(b.barriers).forEach(function (x) { push('btb:' + b.id + '/' + x.id, x.id, x.name, x, { bt: b }); }); }); break;
                case 'bte': arr(cfg(P).bowties).forEach(function (b) { arr(b.diagram && b.diagram.elements).forEach(function (x) { if (x && BT_TYPES[x.kind]) push('bte:' + b.id + '/' + x.id, x.id, x.name, x, { bt: b }); }); }); break;
                case 'btl': arr(cfg(P).bowties).forEach(function (b) { arr(b.diagram && b.diagram.links).forEach(function (x) { if (x && x.id) push('btl:' + b.id + '/' + x.id, x.id, '', x, { bt: b }); }); }); break;
                case 'et': arr(cfg(P).eventTrees).forEach(function (t) { push('et:' + t.id, t.id, t.name, t); }); break;
                case 'eth': arr(cfg(P).eventTrees).forEach(function (t) { arr(t.barriers).forEach(function (h, i) { push('eth:' + t.id + '/' + i, 'H' + (i + 1), h.name, h, { et: t }); }); }); break;
                case 'eto': arr(cfg(P).eventTrees).forEach(function (t) { Object.keys(t.consequences || {}).forEach(function (pth) { push('eto:' + t.id + '/' + pth, pth, 'Outcome ' + pth, t.consequences[pth], { et: t }); }); }); break;
                case 'rbd': ((cfg(P).rbd || {}).models || []).forEach(function (m) { push('rbd:' + m.id, m.id, m.name, m); }); break;
                case 'mk': arr(cfg(P).markovModels).forEach(function (m) { push('mk:' + m.id, m.id, m.name, m); }); break;
                case 'hf.task': hfStore(P, 'tasks').forEach(function (t) { push('hf.task:' + t.taskId, t.taskId, t.task, t); }); break;
                case 'hf.actor': { var a = {}; hfStore(P, 'tasks').forEach(function (t) { var c = S(t.crewmember).trim(); if (c && !a[c]) { a[c] = 1; push('hf.actor:' + c, c, c, { name: c }); } }); break; }
                case 'ram.task': ((cfg(P).ram || {}).tasks || []).forEach(function (t) { push('ram.task:' + t.id, t.id, t.name, t); }); break;
                default:
                    if (kind.indexOf('stpa.') === 0) {
                        var d = stpa(P); if (!d) break;
                        var src = { 'stpa.ctl': d.cs.controllers, 'stpa.proc': d.cs.processes, 'stpa.ca': d.cs.actions, 'stpa.fb': d.cs.feedbacks, 'stpa.oth': d.cs.others, 'stpa.act': d.cs.actuators, 'stpa.sen': d.cs.sensors, 'stpa.ext': d.cs.externals, 'stpa.actu': d.cs.actuations, 'stpa.meas': d.cs.measurements, 'stpa.loss': d.losses, 'stpa.haz': d.hazards, 'stpa.sc': d.constraints }[kind];
                        if (src) arr(src).forEach(function (x) { push(kind + ':' + x.id, x.id, x.name || x.text, x); });
                        if (kind === 'stpa.uca') Object.keys(d.dispositions || {}).forEach(function (key) { push('stpa.uca:' + key, 'UCA-' + key, '', d.dispositions[key]); });
                    }
            }
            cache[kind] = out;
            return out;
        }
        return {
            find: function (kind, key, short, name, e) {
                var L = list(kind);
                if (!L.maps) { L.maps = { ref: new Map(), id: new Map(), name: new Map() }; L.forEach(function (x) { if (!L.maps.ref.has(x.ref)) L.maps.ref.set(x.ref, x); if (x.id && !L.maps.id.has(x.id)) L.maps.id.set(x.id, x); var nl = x.name && x.name.toLowerCase(); if (nl && !L.maps.name.has(nl)) L.maps.name.set(nl, x); }); }
                var byKey = L.maps.ref.get(key); if (byKey) return byKey;
                // nested kinds match only inside their own parent
                if (['ftn', 'btb', 'bte', 'btl', 'eth', 'eto', 'mks', 'mkt', 'rbdb', 'sfn', 'sfha', 'sreq', 'sfc', 'sasm'].indexOf(kind) >= 0) return null;
                if (['fha'].indexOf(kind) >= 0) return null;
                if (short) { var byId = L.maps.id.get(String(short)); if (byId) return byId; }
                if (name) { var byName = L.maps.name.get(S(name).toLowerCase()); if (byName) return byName; }
                return null;
            },
            list: list
        };
    }

    // ---- readers: element -> fields, and how to add one -------------------------------
    // fields(e, plan) returns the plain fields; links are wired in a second pass (wire).
    var READERS = {
        sys: { fields: function (e) { return { name: nameOf(e), role: strAttr(e, 'role') || undefined }; } },
        item: { fields: function (e) { return { itemId: shortOf(e) || '', name: nameOf(e), type: strAttr(e, 'itemType'), dal: strAttr(e, 'dal'), daType: strAttr(e, 'assuranceType'), description: e.doc || '' }; } },
        res: { fields: function (e) { return { resId: shortOf(e) || '', name: nameOf(e), type: strAttr(e, 'resourceType') }; } },
        iface: { fields: function (e) { return { kind: strAttr(e, 'interfaceKind'), direction: strAttr(e, 'direction'), medium: strAttr(e, 'medium'), icdRef: strAttr(e, 'icdRef') }; } },
        zone: { fields: function (e) { return { zoneId: shortOf(e) || '', desc: e.doc || nameOf(e), equip: strAttr(e, 'equipment'), severity: strAttr(e, 'severityLabel'), interference: strAttr(e, 'interference'), mitigation: strAttr(e, 'mitigation') }; } },
        route: { fields: function (e) { return { routingId: shortOf(e) || '', name: nameOf(e), kind: strAttr(e, 'routingKind'), desc: e.doc || '' }; } },
        afn: { fields: function (e) { return { funcId: shortOf(e) || '', funcName: nameOf(e) }; } },
        fn: { fields: function (e) { return { subId: shortOf(e) || '', subName: nameOf(e), subDef: e.doc || '' }; } },
        sfn: { fields: function (e) { return { funcId: shortOf(e) || '', funcName: nameOf(e), funcDef: e.doc || '' }; } },
        req: { fields: function (e) { return { id: shortOf(e) || '', text: e.doc || '', level: strAttr(e, 'level'), type: strAttr(e, 'requirementType'), rat: strAttr(e, 'rationale'), verifMethod: strAttr(e, 'verificationMethod'), verifStatus: strAttr(e, 'verificationStatus') }; } },
        asm: { fields: function (e) { return { asmId: shortOf(e) || nameOf(e), text: e.doc || '', type: strAttr(e, 'assumptionType'), state: strAttr(e, 'assumptionState'), valStrategy: strAttr(e, 'validationStrategy'), routeTo: strAttr(e, 'routeTo') }; } },
        fc: { fields: function () { return {}; } },
        fha: { fields: function (e) { var sv = attrOf(e, 'severity'); return { severity: sv ? (SEVERITY_BACK[sv] || sv) : strAttr(e, 'severityLabel'), phases: strAttr(e, 'phases'), effAc: strAttr(e, 'effectOnAircraft'), effCrew: strAttr(e, 'effectOnCrew'), effPax: strAttr(e, 'effectOnOccupants'), fcDesc: e.doc || '' }; } },
        ft: { fields: function (e) { return { name: nameOf(e), treeLevel: strAttr(e, 'treeLevel') || undefined, mode: strAttr(e, 'mode') || undefined }; } },
        ftn: { fields: function (e) { return { name: nameOf(e) }; } },
        ccf: { fields: function () { return {}; } },
        cma: { fields: function (e) { return { cmaId: shortOf(e) || '', subject: nameOf(e), claim: strAttr(e, 'claim'), findings: strAttr(e, 'findings'), mitigation: strAttr(e, 'mitigation'), status: strAttr(e, 'status') }; } },
        pra: { fields: function (e, plan) { return { praId: shortOf(e) || '', threat: nameOf(e), desc: e.doc || '', systems: praSystems(e, plan), csfl: strAttr(e, 'csfl'), mitigation: strAttr(e, 'mitigation') }; } },
        fmea: { fields: function (e) { var t = strAttr(e, 'fmeaType'); var o = { fmeaId: shortOf(e) || '', fmeaType: t, localEffect: strAttr(e, 'localEffect'), nextEffect: strAttr(e, 'nextEffect'), endEffect: strAttr(e, 'endEffect'), detection: strAttr(e, 'detection'), severity: strAttr(e, 'severityLabel') }; if (t === 'functional') o.funcMode = e.doc || ''; else o.mode = e.doc || ''; return o; } },
        bt: { fields: function (e) { return { name: nameOf(e) }; } },
        btb: { fields: function (e) { return { name: nameOf(e) }; } },
        bte: { fields: function (e) { return { name: nameOf(e) }; } },
        btl: { fields: function () { return {}; } },
        et: { fields: function (e) { return { name: nameOf(e) }; } },
        eth: { fields: function (e) { return { name: nameOf(e), pFail: numAttr(e, 'failureProbability') }; } },
        eto: { fields: function (e) { return { severity: strAttr(e, 'severityLabel'), note: e.doc || '' }; } },
        rbd: { fields: function (e) { var st = strAttr(e, 'structure'), dg = rbdDiagramOf(st); return dg ? { name: nameOf(e), diagram: dg } : { name: nameOf(e), dsl: st || null }; } },
        rbdb: { fields: function () { return {}; } },
        mk: { fields: function (e) { return { name: nameOf(e) }; } },
        mks: { fields: function () { return {}; } },
        mkt: { fields: function () { return {}; } },
        'hf.task': { fields: function (e) { return { task: e.doc || nameOf(e), phase: strAttr(e, 'phase') }; } },
        'hf.actor': { fields: function () { return {}; } },
        'ram.task': { fields: function (e) { return { name: nameOf(e) }; } },
        sreq: null, sfc: null, sfha: null, sasm: null
    };
    READERS.sreq = READERS.req; READERS.sfc = READERS.fc; READERS.sfha = READERS.fha; READERS.sasm = READERS.asm;
    // an actuation / measurement without a name of its own is exported under its id: that is not a name to import
    ['stpa.actu', 'stpa.meas'].forEach(function (k) { READERS[k] = { fields: function (e) { var n = nameOf(e); return n && n !== shortOf(e) ? { name: n } : {}; } }; });
    ['stpa.ctl', 'stpa.proc', 'stpa.ca', 'stpa.fb', 'stpa.oth', 'stpa.act', 'stpa.sen', 'stpa.ext', 'stpa.loss', 'stpa.haz'].forEach(function (k) { READERS[k] = { fields: function (e) { return { name: nameOf(e) }; } }; });
    READERS['stpa.sc'] = { fields: function (e) { return { text: e.doc || '' }; } };
    READERS['stpa.uca'] = { fields: function (e) { return { status: strAttr(e, 'status'), context: strAttr(e, 'context') }; } };

    function praSystems(e, plan) {
        var linked = plan && plan.linksOf ? plan.linksOf(e, 'About', ['sys']).map(function (k) { var o = plan.keyObj && plan.keyObj[k]; return o && o.id ? o.id : idOfKey(k); }) : [];
        var raw = attrOf(e, 'affectedSystemIds');
        if (linked.length || raw != null) return linked.concat(S(raw).trim() ? S(raw).split(/,\s*/) : []);
        return strAttr(e, 'affectedSystems');
    }
    // ======================================================== import: apply
    // Adds what is new and updates the fields the plan lists as changed. Never deletes.
    function applyImport(P, plan, opts) {
        opts = opts || {};
        var R = plan.R, L = plan.linksOf, made = { added: 0, changed: 0 };
        var newId = opts.newId || (function () { var n = Date.now(); return function () { return String(n++) + Math.random().toString(36).slice(2, 6); }; })();
        var nodeIdNext = (function () { var mx = toNum(P.internalIdCounter) || 1; arr(P.ftaPages).forEach(function (pg) { (function walk(n) { if (!n) return; var v = toNum(n.id); if (v != null && v >= mx) mx = v + 1; kidsOf(n).forEach(walk); })(pg.root); }); return function () { return mx++; }; })();
        if (plan.projectName && (!S(P.projectName).trim() || P.projectName === 'Untitled Project')) P.projectName = plan.projectName;
        if (!P.projectConfig || typeof P.projectConfig !== 'object') P.projectConfig = {};
        var C = P.projectConfig;
        // a project with no SysML identity yet takes the file's: the same model keeps the same element ids
        if (plan.ns && !(C.sysml && /^[0-9a-f-]{36}$/i.test(S(C.sysml.ns)))) { C.sysml = C.sysml && typeof C.sysml === 'object' ? C.sysml : {}; C.sysml.ns = plan.ns; }
        var keyMap = Object.create(null);   // imported key -> the Safety Lab object it became (for wiring)
        plan.keyObj = keyMap;
        var refMap = Object.create(null);   // imported key -> the ref it has here
        var iidSets = new Map();
        var iidFree = function (store, want) { var st = iidSets.get(store); if (!st) { st = new Set(arr(store).map(function (r) { return String(r.internalId); })); iidSets.set(store, st); } return !st.has(String(want)); };
        var asIid = function (v) { var n = Number(v); return v !== '' && isFinite(n) && String(n) === String(v) ? n : v; };
        var pickIid = function (store, key) { var id = idOfKey(key); id = splitScoped(id)[1]; var v = id && iidFree(store, id) ? asIid(id) : newId(); var st = iidSets.get(store); if (st) st.add(String(v)); return v; };
        var sysByImported = function (k) { var o = keyMap[k]; return o ? o : null; };
        var ops = plan.ops.filter(function (o) { return !o.skip; });
        var byKind = function (k) { return ops.filter(function (o) { return o.kind === k; }); };
        var upd = function (op, obj, fields) { (op.changed || []).forEach(function (f) { if (fields[f] !== undefined) obj[f] = fields[f]; }); if ((op.changed || []).length) made.changed++; };
        var fieldsOf = function (op) { return READERS[op.kind].fields(op.el, plan); };
        var setRef = function (op, obj, ref) { keyMap[op.key] = obj; refMap[op.key] = ref; };
        var parentKeyOf = function (op) { for (var x = op.el.owner; x; x = x.owner) { var k = R.keyOfEl.get(x); if (k) return k; } return null; };

        // --- systems
        P.systemsData = P.systemsData || [];
        byKind('sys').forEach(function (op) {
            var f = fieldsOf(op);
            if (op.target) { upd(op, op.target.obj, f); setRef(op, op.target.obj, op.target.ref); return; }
            var id = idOfKey(op.key); if (systems(P).some(function (s) { return s.id === id; })) id = 'sys-' + newId();
            var s = { id: id, name: f.name, role: f.role || 'function', asmCounter: 1, functions: [], fcim: [], extractedFCs: [], fha: [], req: [], asm: [] };
            if (op.el.doc) s.description = op.el.doc;
            P.systemsData.push(s); made.added++; setRef(op, s, 'sys:' + s.id);
        });
        var sysIdOf = function (key) { var o = keyMap[key]; return o && o.id != null ? o.id : null; };
        var sysForEl = function (op) { var pk = parentKeyOf(op); if (pk && kindOfKey(pk) === 'sys') return keyMap[pk]; var ab = L(op.el, 'About', ['sys'])[0]; return ab ? keyMap[ab] : null; };
        // --- items, resources, zones, routing
        P.itemsData = P.itemsData || [];
        byKind('item').forEach(function (op) {
            var f = fieldsOf(op), owner = sysForEl(op);
            if (op.target) { upd(op, op.target.obj, f); setRef(op, op.target.obj, op.target.ref); return; }
            var r = { internalId: pickIid(P.itemsData, op.key), itemId: f.itemId, name: f.name, type: f.type, dal: f.dal, daType: f.daType, owningSystemId: owner ? owner.id : '', description: f.description, traceIds: [] };
            P.itemsData.push(r); made.added++; setRef(op, r, refOf('item', r));
        });
        P.resourcesData = P.resourcesData || [];
        byKind('res').forEach(function (op) {
            var f = fieldsOf(op);
            if (op.target) { upd(op, op.target.obj, f); setRef(op, op.target.obj, op.target.ref); return; }
            var r = { internalId: pickIid(P.resourcesData, op.key), resId: f.resId, name: f.name, type: f.type, providedBy: [], consumedBy: [], consumedBySystems: [] };
            P.resourcesData.push(r); made.added++; setRef(op, r, refOf('res', r));
        });
        P.zsaData = P.zsaData || [];
        byKind('zone').forEach(function (op) {
            var f = fieldsOf(op);
            if (op.target) { upd(op, op.target.obj, f); setRef(op, op.target.obj, op.target.ref); return; }
            var r = { internalId: pickIid(P.zsaData, op.key), zoneId: f.zoneId, desc: f.desc, equip: f.equip, severity: f.severity, interference: f.interference, mitigation: f.mitigation, housedFunctions: [] };
            P.zsaData.push(r); made.added++; setRef(op, r, refOf('zone', r));
        });
        P.routingData = P.routingData || [];
        byKind('route').forEach(function (op) {
            var f = fieldsOf(op);
            if (op.target) { upd(op, op.target.obj, f); setRef(op, op.target.obj, op.target.ref); return; }
            var r = { internalId: pickIid(P.routingData, op.key), routingId: f.routingId, name: f.name, kind: f.kind, desc: f.desc, routesThroughZones: [], carriesFunctions: [], carriesItems: [] };
            P.routingData.push(r); made.added++; setRef(op, r, refOf('route', r));
        });
        // --- functions (aircraft rows carry their group)
        P.acFunctionsData = P.acFunctionsData || [];
        byKind('afn').forEach(function (op) { var f = fieldsOf(op); keyMap[op.key] = { funcId: f.funcId, funcName: f.funcName, funcDef: op.el.doc || '' }; refMap[op.key] = 'afn:' + f.funcId; if (op.target) { var g = op.target.obj; arr(P.acFunctionsData).forEach(function (r) { if (r.funcId === g.funcId) { if ((op.changed || []).indexOf('funcName') >= 0) r.funcName = f.funcName; } }); } });
        byKind('fn').forEach(function (op) {
            var f = fieldsOf(op), pk = parentKeyOf(op), g = pk && kindOfKey(pk) === 'afn' ? keyMap[pk] : null;
            if (op.target) { upd(op, op.target.obj, f); setRef(op, op.target.obj, op.target.ref); return; }
            var r = { internalId: pickIid(P.acFunctionsData, op.key), funcId: g ? g.funcId : '', funcName: g ? g.funcName : '', subId: f.subId, subName: f.subName, subDef: f.subDef };
            if (g && g.funcDef) r.funcDef = g.funcDef;
            P.acFunctionsData.push(r); made.added++; setRef(op, r, refOf('fn', r));
        });
        byKind('sfn').forEach(function (op) {
            var f = fieldsOf(op), pk = parentKeyOf(op), sid0 = pk && kindOfKey(pk) === 'sfg' ? idOfKey(pk) : splitScoped(idOfKey(op.key))[0];
            var s = keyMap['sys:' + sid0] || systems(P).find(function (x) { return x.id === sid0; }) || null;
            if (op.target) { upd(op, op.target.obj, f); setRef(op, op.target.obj, op.target.ref); return; }
            if (!s) { plan.notes.push('System function ' + (f.funcId || f.funcName) + ': its system is not in the file or the project, so it was left out.'); return; }
            s.functions = s.functions || [];
            var r = { internalId: pickIid(s.functions, op.key), traceIds: [], funcId: f.funcId, funcName: f.funcName, funcDef: f.funcDef };
            s.functions.push(r); made.added++; setRef(op, r, refOf('sfn', r, { systemId: s.id }));
        });
        // --- assumptions
        P.acAssumptionsData = P.acAssumptionsData || [];
        byKind('asm').forEach(function (op) {
            var f = fieldsOf(op);
            if (op.target) { upd(op, op.target.obj, f); setRef(op, op.target.obj, op.target.ref); return; }
            var a = { asmId: f.asmId, text: f.text, state: f.state, valStrategy: f.valStrategy, type: f.type, routeTo: f.routeTo };
            P.acAssumptionsData.push(a); made.added++; setRef(op, a, 'asm:' + a.asmId);
        });
        var sysOfScoped = function (op) { var sid = splitScoped(idOfKey(op.key))[0]; return (sid && keyMap['sys:' + sid]) || systems(P).find(function (y) { return y.id === sid; }) || null; };
        byKind('sasm').forEach(function (op) {
            var f = fieldsOf(op), s = sysOfScoped(op);
            if (op.target) { upd(op, op.target.obj, f); setRef(op, op.target.obj, op.target.ref); return; }
            if (!s) return;
            s.asm = s.asm || [];
            var a = { asmId: f.asmId, text: f.text, state: f.state, valStrategy: f.valStrategy, type: f.type, routeTo: f.routeTo };
            s.asm.push(a); made.added++; setRef(op, a, 'sasm:' + s.id + '/' + a.asmId);
        });
        // --- failure conditions: rebuild FCIM rows (grouped by the function they are about)
        var fcRows = function (opsList, store, sysCtx) {
            var rowFor = Object.create(null);
            opsList.forEach(function (op) {
                var e = op.el, id = shortOf(e) || nameOf(e);
                if (op.target) { setRef(op, op.target.obj, op.target.ref); return; }
                var fnKey = L(e, 'About', ['fn', 'sfn'])[0], fnObj = fnKey ? keyMap[fnKey] : null;
                var subId = fnObj ? (fnObj.subId || fnObj.funcId || '') : strAttr(e, 'functionRef');
                var kindLit = attrOf(e, 'failureKind'), extra = attrOf(e, 'additional') === true;
                var desc = e.doc || nameOf(e);
                if (!kindLit) { setRef(op, { id: id, desc: desc, fhaOnly: true }, (sysCtx ? 'sfc:' + sysCtx.id + '/' : 'fc:') + id); keyMap[op.key].subId = subId; return; }
                var row = rowFor[subId];
                var slot = kindLit === 'totalLoss' ? 'tl' : kindLit === 'partialLoss' ? (extra ? 'plx' : 'pl') : kindLit === 'malfunction' ? (extra ? 'mx' : 'm') : 'cb';
                var free = row && ((slot === 'tl' && !row.tlId) || (slot === 'pl' && !row.plId) || (slot === 'm' && !row.mId) || slot === 'cb' || slot === 'plx' || slot === 'mx');
                if (!row || !free) {
                    row = { internalId: newId(), subId: subId, awareness: '' };
                    if (!sysCtx) { var want = null; row.internalId = want || newId(); }
                    store.push(row); rowFor[subId] = row;
                }
                if (slot === 'tl') { row.tlId = id; row.tlDesc = desc; if (strAttr(e, 'awareness')) row.awareness = strAttr(e, 'awareness'); }
                else if (slot === 'pl') { row.plId = id; row.plDesc = desc; }
                else if (slot === 'm') { row.mId = id; row.mDesc = desc; }
                else if (slot === 'cb') { (row.combined = row.combined || []).push({ cbId: id, cbDesc: desc }); }
                else if (slot === 'plx') { (row.plExtra = row.plExtra || []).push({ id: id, desc: desc }); }
                else { (row.mExtra = row.mExtra || []).push({ id: id, desc: desc }); }
                made.added++; setRef(op, { id: id, desc: desc, subId: subId }, (sysCtx ? 'sfc:' + sysCtx.id + '/' : 'fc:') + id);
            });
        };
        P.acFcimData = P.acFcimData || [];
        fcRows(byKind('fc'), P.acFcimData, null);
        var sfcBySys = new Map();
        byKind('sfc').forEach(function (op) { var s = sysOfScoped(op); if (!s) return; if (!sfcBySys.has(s)) sfcBySys.set(s, []); sfcBySys.get(s).push(op); });
        sfcBySys.forEach(function (list, s) { s.fcim = s.fcim || []; fcRows(list, s.fcim, s); });
        // --- FHA rows
        var fhaRow = function (op, store, sysCtx) {
            var f = fieldsOf(op), e = op.el;
            if (op.target) { upd(op, op.target.obj, f); setRef(op, op.target.obj, op.target.ref); return; }
            var fcK = L(e, 'Assesses', ['fc', 'sfc'])[0], fc = fcK ? keyMap[fcK] : null;
            var fnK = L(e, 'About', ['fn', 'sfn'])[0], fn = fnK ? keyMap[fnK] : null;
            var r = { internalId: pickIid(store, op.key), fcId: fc ? fc.id : (fcK ? splitScoped(idOfKey(fcK))[1] : ''), subId: fn ? (fn.subId || fn.funcId || '') : strAttr(e, 'functionRef'), fcDesc: f.fcDesc, severity: f.severity, phases: f.phases, effAc: f.effAc, effCrew: f.effCrew, effPax: f.effPax, assumptionIds: [], comments: '' };
            store.push(r); made.added++; setRef(op, r, sysCtx ? refOf('sfha', r, { systemId: sysCtx.id }) : refOf('fha', r));
        };
        P.acFhaData = P.acFhaData || [];
        byKind('fha').forEach(function (op) { fhaRow(op, P.acFhaData, null); });
        byKind('sfha').forEach(function (op) { var s = sysOfScoped(op); if (!s) return; s.fha = s.fha || []; fhaRow(op, s.fha, s); });
        // --- requirements
        P.acReqData = P.acReqData || [];
        var reqRow = function (op, store, sysCtx) {
            var f = fieldsOf(op);
            if (op.target) { upd(op, op.target.obj, f); setRef(op, op.target.obj, op.target.ref); return; }
            var r = { internalId: pickIid(store, op.key) };
            if (f.id) r.id = f.id;
            r.traceId = ''; r.level = f.level; r.type = f.type; r.text = f.text; r.rat = f.rat; r.verifMethod = f.verifMethod; r.verifStatus = f.verifStatus; r.verifEvidence = '';
            var raw = strAttr(op.el, 'traceId'); if (raw) r.traceId = raw;
            store.push(r); made.added++; setRef(op, r, sysCtx ? refOf('sreq', r, { systemId: sysCtx.id }) : refOf('req', r));
        };
        byKind('req').forEach(function (op) { reqRow(op, P.acReqData, null); });
        byKind('sreq').forEach(function (op) { var s = sysOfScoped(op); if (!s) return; s.req = s.req || []; reqRow(op, s.req, s); });
        // --- interfaces (between two systems)
        C.interfaces = Array.isArray(C.interfaces) ? C.interfaces : [];
        byKind('iface').forEach(function (op) {
            var f = fieldsOf(op), e = op.el;
            if (op.target) { upd(op, op.target.obj, f); setRef(op, op.target.obj, op.target.ref); return; }
            var endSys = function (ref) { if (!ref) return null; var u = R.scope.resolve(ref.segs, e.owner); var d = u && u.type ? R.scope.resolve(u.type.segs, u.owner) : null; var k = d ? R.keyOfEl.get(d) : null; return k ? keyMap[k] : null; };
            var a = endSys(e.from), b = endSys(e.to);
            if (!a || !b) { plan.notes.push('Interface ' + (f.icdRef || nameOf(e)) + ': one of its systems is not in the file, so it was left out.'); return; }
            var x = { fromSystemId: a.id, toSystemId: b.id, kind: f.kind || 'interface', direction: f.direction || '', medium: f.medium || '', icdRef: f.icdRef || '' };
            if (e.doc) x.notes = e.doc;
            C.interfaces.push(x); made.added++; keyMap[op.key] = x;
        });
        // --- fault trees: pages, then nodes in tree order
        P.ftaPages = Array.isArray(P.ftaPages) ? P.ftaPages : [];
        var blank = P.ftaPages.length === 1 && !P.ftaPages[0].root && /^Untitled Fault Tree$/.test(S(P.ftaPages[0].name)) ? P.ftaPages[0] : null;
        var pageOf = Object.create(null);
        byKind('ft').forEach(function (op) {
            var f = fieldsOf(op), e = op.el;
            if (op.target) { upd(op, op.target.obj, f); setRef(op, op.target.obj, op.target.ref); pageOf[op.key] = op.target.obj; return; }
            var id = idOfKey(op.key); if (P.ftaPages.some(function (p) { return p.id === id && p !== blank; })) id = 'page-' + newId();
            var pg = { id: id, name: f.name, root: null };
            if (f.treeLevel) pg.treeLevel = f.treeLevel;
            if (f.mode) pg.mode = f.mode;
            var abf = numAttr(e, 'asBuiltFactor'); if (abf != null) pg.asBuiltFactor = abf;
            if (blank) { var i = P.ftaPages.indexOf(blank); P.ftaPages[i] = pg; blank = null; if (P.activeFTAPageId == null || !P.ftaPages.some(function (p) { return p.id === P.activeFTAPageId; })) P.activeFTAPageId = pg.id; }
            else P.ftaPages.push(pg);
            made.added++; setRef(op, pg, 'ft:' + pg.id); pageOf[op.key] = pg;
        });
        var usedNodeIds = new Set(); arr(P.ftaPages).forEach(function (pg) { (function walk(n) { if (!n) return; usedNodeIds.add(String(n.id)); kidsOf(n).forEach(walk); })(pg.root); });
        byKind('ftn').forEach(function (op) {
            var e = op.el, f = fieldsOf(op);
            if (op.target) { upd(op, op.target.obj, f); setRef(op, op.target.obj, op.target.ref); return; }
            var pk = parentKeyOf(op); if (!pk) return;
            var parent = keyMap[pk]; if (!parent) return;
            var want = splitScoped(idOfKey(op.key))[1], idNum = Number(want);
            var nid = (want !== '' && isFinite(idNum) && !usedNodeIds.has(String(idNum))) ? idNum : nodeIdNext();
            usedNodeIds.add(String(nid));
            var isGate = slType(e) === 'Gate';
            var n = { id: nid, name: nameOf(e), type: isGate ? 'gate' : (EVENT_BACK[attrOf(e, 'eventKind')] || strAttr(e, 'eventKindLabel') || 'basic'), probability: 0, children: [] };
            if (isGate) n.gateType = GATE_BACK[attrOf(e, 'gateKind')] || strAttr(e, 'gateKindLabel') || 'OR';
            var lid = strAttr(e, 'logicalId'); n.logicalId = lid ? asIid(lid) : nid;
            if (shortOf(e)) n.displayId = shortOf(e);
            var vk = numAttr(e, 'votingK'); if (vk != null) n.votingK = vk;
            if (strAttr(e, 'dalOption')) n.dalOption = strAttr(e, 'dalOption');
            if (!isGate) {
                var p = numAttr(e, 'probability'), lam = numAttr(e, 'failureRate');
                if (p != null) n.probability = p;
                if (lam != null) n.lambda = lam;
                if (strAttr(e, 'inputMode')) n.inputMode = strAttr(e, 'inputMode');
                if (strAttr(e, 'exposureMode')) n.exposureMode = strAttr(e, 'exposureMode');
                var dorm = numAttr(e, 'exposureTime'); if (dorm != null) n.dormancyInterval = dorm;
                if (strAttr(e, 'repairModel')) n.repairModel = strAttr(e, 'repairModel');
                var tau = numAttr(e, 'repairTime'); if (tau != null) n.tau = tau;
                if (strAttr(e, 'libraryKey')) n.libraryKey = strAttr(e, 'libraryKey');
            }
            if (e.doc) n.description = e.doc;
            if (kindOfKey(pk) === 'ft') { if (parent.root) { plan.notes.push('Fault tree ' + parent.name + ' already has a top event here; the imported top ' + n.name + ' was left out.'); return; } parent.root = n; }
            else (parent.children = parent.children || []).push(n);
            made.added++; setRef(op, n, 'ftn:' + (pageOfNode(pk) || '') + '/' + n.id);
            n.__page = pageOfNode(pk);
        });
        function pageOfNode(pk) { var k = pk; while (k && kindOfKey(k) === 'ftn') { var o = keyMap[k]; if (o && o.__page) return o.__page; break; } return kindOfKey(pk) === 'ft' && keyMap[pk] ? keyMap[pk].id : null; }
        // --- CCF groups carry beta to their members (wired below)
        byKind('ccf').forEach(function (op) { keyMap[op.key] = { name: nameOf(op.el), beta: numAttr(op.el, 'beta') }; refMap[op.key] = 'ccf:' + nameOf(op.el); });
        // --- CMA, PRA, FMEA
        P.cmaData = P.cmaData || [];
        byKind('cma').forEach(function (op) {
            var f = fieldsOf(op), e = op.el;
            if (op.target) { upd(op, op.target.obj, f); setRef(op, op.target.obj, op.target.ref); return; }
            var r = { internalId: pickIid(P.cmaData, op.key), cmaId: f.cmaId, subject: f.subject, claim: f.claim, modes: strAttr(e, 'modes') ? strAttr(e, 'modes').split(/,\s*/) : [], linkedGateIds: [], findings: f.findings, mitigation: f.mitigation, status: f.status };
            if (strAttr(e, 'scope')) r.scope = strAttr(e, 'scope');
            P.cmaData.push(r); made.added++; setRef(op, r, refOf('cma', r));
        });
        P.praData = P.praData || [];
        byKind('pra').forEach(function (op) {
            var f = fieldsOf(op);
            if (op.target) { upd(op, op.target.obj, f); setRef(op, op.target.obj, op.target.ref); return; }
            var r = { internalId: pickIid(P.praData, op.key), praId: f.praId, threat: f.threat, desc: f.desc, systems: f.systems, csfl: f.csfl, mitigation: f.mitigation, affectedZones: [] };
            P.praData.push(r); made.added++; setRef(op, r, refOf('pra', r));
        });
        P.fmeaData = P.fmeaData || [];
        byKind('fmea').forEach(function (op) {
            var f = fieldsOf(op), e = op.el;
            if (op.target) { upd(op, op.target.obj, f); setRef(op, op.target.obj, op.target.ref); return; }
            var r = { internalId: pickIid(P.fmeaData, op.key), fmeaType: f.fmeaType, scope: strAttr(e, 'scope'), owningSystemId: '', fmeaId: f.fmeaId };
            if (f.fmeaType === 'functional') { r.funcSubId = ''; r.funcMode = f.funcMode; } else { r.part = strAttr(e, 'itemName'); r.mode = f.mode; }
            r.phase = strAttr(e, 'phase') || undefined; if (r.phase === undefined) delete r.phase;
            r.localEffect = f.localEffect; r.nextEffect = f.nextEffect; r.endEffect = f.endEffect; r.detection = f.detection; r.severity = f.severity;
            r.compensating = strAttr(e, 'compensating'); r.remarks = strAttr(e, 'remarks');
            var rate = numAttr(e, 'failureRate'), time = numAttr(e, 'exposureTime'); if (rate != null) r.rate = rate; if (time != null) r.time = time;
            if (strAttr(e, 'libraryKey')) r.parentLibKey = strAttr(e, 'libraryKey');
            P.fmeaData.push(r); made.added++; setRef(op, r, refOf('fmea', r));
        });
        // --- STPA
        var stpaOps = ops.filter(function (o) { return o.kind && o.kind.indexOf('stpa.') === 0; });
        if (stpaOps.length) {
            if (!P.stpaData || !P.stpaData.cs) P.stpaData = { cs: { controllers: [], processes: [], actions: [], feedbacks: [], others: [], precedence: [] }, dispositions: {}, causeDismissals: {}, scopeFcIds: [], meta: { mission: '', scope: '', boundary: '', abstractionLevel: '' }, losses: [], hazards: [], constraints: [], responsibilities: [], csState: 'initial', sip: {} };
            var D = P.stpaData;
            ['actions', 'feedbacks', 'others', 'controllers', 'processes'].forEach(function (k) { D.cs[k] = D.cs[k] || []; });
            var csArr = function (k) { if (!Array.isArray(D.cs[k])) D.cs[k] = []; return D.cs[k]; };   // v1.1: created only when the file carries them
            ['losses', 'hazards', 'constraints'].forEach(function (k) { D[k] = D[k] || []; });
            D.dispositions = D.dispositions || {};
            var idOf = function (op) { return idOfKey(op.key); };
            stpaOps.forEach(function (op) {
                var e = op.el, f = fieldsOf(op);
                if (op.target) { upd(op, op.target.obj, f); setRef(op, op.target.obj, op.target.ref); return; }
                var id = idOf(op), o = null;
                if (op.kind === 'stpa.ctl') { o = { id: id, name: nameOf(e), kind: attrOf(e, 'controllerKind') || strAttr(e, 'controllerKindLabel') || 'automation' }; var rk = numAttr(e, 'rank'); if (rk != null) o.authority = rk; if (e.doc) o.desc = e.doc; if (strAttr(e, 'processModel')) o.processModel = strAttr(e, 'processModel').split('\n'); if (strAttr(e, 'controlAlgorithm')) o.controlAlgorithm = strAttr(e, 'controlAlgorithm'); D.cs.controllers.push(o); }
                else if (op.kind === 'stpa.proc') { o = { id: id, name: nameOf(e) }; if (e.doc) o.desc = e.doc; D.cs.processes.push(o); }
                else if (op.kind === 'stpa.act' || op.kind === 'stpa.sen' || op.kind === 'stpa.ext') { o = { id: id, name: nameOf(e) }; if (e.doc) o.desc = e.doc; csArr({ 'stpa.act': 'actuators', 'stpa.sen': 'sensors', 'stpa.ext': 'externals' }[op.kind]).push(o); }
                else if (op.kind === 'stpa.actu' || op.kind === 'stpa.meas') {
                    var end2 = function (ref) { if (!ref) return null; var x = R.scope.resolve(ref.segs, e.owner); var k = x ? R.keyOfEl.get(x) : null; return k ? idOfKey(k) : null; };
                    o = { id: id, from: end2(e.from), to: end2(e.to) };
                    if (nameOf(e) && nameOf(e) !== id) o.name = nameOf(e);
                    if (!o.from || !o.to) { plan.notes.push('STPA link ' + id + ': one end is not in the file, so it was left out.'); return; }
                    csArr(op.kind === 'stpa.actu' ? 'actuations' : 'measurements').push(o);
                }
                else if (op.kind === 'stpa.ca' || op.kind === 'stpa.fb' || op.kind === 'stpa.oth') {
                    var end = function (ref) { if (!ref) return null; var x = R.scope.resolve(ref.segs, e.owner); var k = x ? R.keyOfEl.get(x) : null; return k ? idOfKey(k) : null; };
                    o = { id: id, from: end(e.from), to: end(e.to), name: nameOf(e) };
                    if (!o.from || !o.to) { plan.notes.push('STPA link ' + id + ': one end is not in the file, so it was left out.'); return; }
                    if (op.kind === 'stpa.oth' && strAttr(e, 'linkType')) o.type = strAttr(e, 'linkType');
                    (op.kind === 'stpa.ca' ? D.cs.actions : op.kind === 'stpa.fb' ? D.cs.feedbacks : D.cs.others).push(o);
                }
                else if (op.kind === 'stpa.loss') { o = { id: id, name: nameOf(e), desc: e.doc || '' }; D.losses.push(o); }
                else if (op.kind === 'stpa.haz') { o = { id: id, name: nameOf(e), lossIds: [] }; if (strAttr(e, 'group')) o.group = strAttr(e, 'group'); D.hazards.push(o); }
                else if (op.kind === 'stpa.sc') { o = { id: id, text: e.doc || '', hazardIds: [] }; D.constraints.push(o); }
                else if (op.kind === 'stpa.uca') { o = { status: strAttr(e, 'status') || 'open' }; if (strAttr(e, 'context')) o.context = strAttr(e, 'context'); if (strAttr(e, 'rationale')) o.rationale = strAttr(e, 'rationale'); if (e.doc) o.hazard = e.doc; D.dispositions[id] = o; }
                if (o) { made.added++; setRef(op, o, op.kind + ':' + id); }
            });
        }
        // --- bow-ties, event trees, RBD, Markov
        byKind('et').forEach(function (op) {
            var e = op.el, f = fieldsOf(op);
            if (op.target) { upd(op, op.target.obj, f); setRef(op, op.target.obj, op.target.ref); return; }
            C.eventTrees = Array.isArray(C.eventTrees) ? C.eventTrees : [];
            var t = { id: idOfKey(op.key), name: f.name, initiator: { desc: e.doc || '', freq: numAttr(e, 'initiatorFrequency') }, barriers: [], consequences: {} };
            if (t.initiator.freq == null) delete t.initiator.freq;
            if (attrOf(e, 'initiatorFromTransfers') === true) t.initiator.fromTransfers = true;
            try { var nr = strAttr(e, 'sequenceRules'); if (nr) t.nodeRules = JSON.parse(nr); } catch (_) { plan.notes.push('Event tree ' + t.id + ': its branch rules could not be read, so the tree comes in with every heading applying everywhere.'); }
            C.eventTrees.push(t); made.added++; setRef(op, t, 'et:' + t.id);
        });
        byKind('eth').forEach(function (op) {
            var e = op.el, pk = parentKeyOf(op), t = pk ? keyMap[pk] : null;
            if (op.target) { setRef(op, op.target.obj, op.target.ref); return; }
            if (!t) return;
            var h = { name: nameOf(e) }; var pf = numAttr(e, 'failureProbability'); if (pf != null) h.pFail = pf; var pc = numAttr(e, 'couplingProbability'); if (pc != null) h.pCcf = pc; if (e.doc) h.note = e.doc;
            try { var oc = strAttr(e, 'outcomes'); if (oc) { var bl = JSON.parse(oc); if (Array.isArray(bl) && bl.length >= 2) h.branches = bl; } } catch (_) {}
            t.barriers.push(h); made.added++; setRef(op, h, 'eth:' + t.id + '/' + (t.barriers.length - 1));
        });
        byKind('eto').forEach(function (op) {
            var e = op.el, f = fieldsOf(op), pk = parentKeyOf(op), t = pk ? keyMap[pk] : null;
            if (op.target) { upd(op, op.target.obj, f); setRef(op, op.target.obj, op.target.ref); return; }
            if (!t) return;
            var path = strAttr(e, 'path') || splitScoped(idOfKey(op.key))[1];
            var c = {}; if (f.severity) c.severity = f.severity; if (strAttr(e, 'linkedFcId')) c.linkedFcId = strAttr(e, 'linkedFcId'); if (f.note) c.note = f.note;
            if (strAttr(e, 'endState')) c.label = strAttr(e, 'endState'); if (strAttr(e, 'consequenceCategory')) c.category = strAttr(e, 'consequenceCategory');
            t.consequences = t.consequences || {}; t.consequences[path] = c; made.added++; setRef(op, c, 'eto:' + t.id + '/' + path);
        });
        byKind('bt').forEach(function (op) {
            var f = fieldsOf(op);
            if (op.target) { upd(op, op.target.obj, f); setRef(op, op.target.obj, op.target.ref); return; }
            C.bowties = Array.isArray(C.bowties) ? C.bowties : [];
            var b = { id: idOfKey(op.key), name: f.name, ftaPageId: '', etaId: '', barriers: [] };
            C.bowties.push(b); made.added++; setRef(op, b, 'bt:' + b.id);
        });
        byKind('btb').forEach(function (op) {
            var e = op.el, pk = parentKeyOf(op), b = pk ? keyMap[pk] : null;
            if (op.target) { upd(op, op.target.obj, fieldsOf(op)); setRef(op, op.target.obj, op.target.ref); return; }
            if (!b) return;
            var x = { id: splitScoped(idOfKey(op.key))[1], side: attrOf(e, 'side') || 'preventive', name: nameOf(e) };
            var pf = numAttr(e, 'failureProbability'); if (pf != null) x.pFail = pf;
            x.trace = { kind: strAttr(e, 'traceKind') || 'none', ref: strAttr(e, 'traceRef'), logicalId: strAttr(e, 'traceLogicalId') };
            if (strAttr(e, 'principleId')) x.principleId = strAttr(e, 'principleId');
            if (strAttr(e, 'requirementId')) x.requirementId = strAttr(e, 'requirementId');
            if (strAttr(e, 'barrierRole')) x.role = strAttr(e, 'barrierRole');
            if (strAttr(e, 'barrierType')) x.barrierType = strAttr(e, 'barrierType');
            if (strAttr(e, 'effectiveness')) x.effectiveness = strAttr(e, 'effectiveness');
            if (strAttr(e, 'barrierOwner')) x.owner = strAttr(e, 'barrierOwner');
            if (e.doc) x.note = e.doc;
            b.barriers.push(x); made.added++; setRef(op, x, 'btb:' + b.id + '/' + x.id);
        });
        // the hand-drawn bow-tie's own elements and pathways (laid out on open)
        var btDiagram = function (b) {
            if (!b.diagram || typeof b.diagram !== 'object') b.diagram = { v: 1, elements: [], links: [], pos: {} };
            if (!Array.isArray(b.diagram.elements)) b.diagram.elements = [];
            if (!Array.isArray(b.diagram.links)) b.diagram.links = [];
            return b.diagram;
        };
        var BT_KIND_BACK = { BowTieHazard: 'hazard', TopEvent: 'top', Threat: 'threat', Consequence: 'consequence', EscalationFactor: 'escalation' };
        byKind('bte').forEach(function (op) {
            var e = op.el, pk = parentKeyOf(op), b = pk ? keyMap[pk] : null;
            if (op.target) { upd(op, op.target.obj, fieldsOf(op)); setRef(op, op.target.obj, op.target.ref); return; }
            var kind = BT_KIND_BACK[slType(e)];
            if (!b || !kind) return;
            var o = { id: splitScoped(idOfKey(op.key))[1], kind: kind, name: nameOf(e) }, pr = {};
            if (e.doc) pr.note = e.doc;
            if (kind === 'consequence') { if (strAttr(e, 'severityLabel')) pr.severity = strAttr(e, 'severityLabel'); if (strAttr(e, 'consequenceCategory')) pr.category = strAttr(e, 'consequenceCategory'); if (strAttr(e, 'linkedFcId')) pr.linkedFcId = strAttr(e, 'linkedFcId'); }
            if (kind === 'top') { if (b.ftaPageId) pr.ftaPageId = b.ftaPageId; if (b.etaId) pr.etaId = b.etaId; }
            if (Object.keys(pr).length) o.props = pr;
            btDiagram(b).elements.push(o); made.added++; setRef(op, o, 'bte:' + b.id + '/' + o.id);
        });
        byKind('btl').forEach(function (op) {
            var e = op.el, pk = parentKeyOf(op), b = pk ? keyMap[pk] : null;
            if (op.target) { setRef(op, op.target.obj, op.target.ref); return; }
            if (!b) return;
            var end = function (ref) { if (!ref) return null; var x = R.scope.resolve(ref.segs, e.owner); var k = x ? R.keyOfEl.get(x) : null; return k ? splitScoped(idOfKey(k))[1] : null; };
            var t = slType(e), kind = t === 'EscalationPathway' ? 'escalation' : t === 'HazardRelease' ? 'release' : 'path';
            var l = { id: splitScoped(idOfKey(op.key))[1], kind: kind, from: end(e.from), to: end(e.to) };
            if (!l.from || !l.to) { plan.notes.push('Bow-tie pathway ' + l.id + ': one end is not in the file, so it was left out.'); return; }
            btDiagram(b).links.push(l); made.added++; setRef(op, l, 'btl:' + b.id + '/' + l.id);
        });
        byKind('rbd').forEach(function (op) {
            var f = fieldsOf(op);
            if (op.target) { upd(op, op.target.obj, f); setRef(op, op.target.obj, op.target.ref); return; }
            C.rbd = C.rbd && Array.isArray(C.rbd.models) ? C.rbd : { models: [] };
            var m = { id: idOfKey(op.key), name: f.name, dsl: f.dsl || null, fromPage: null };
            if (f.diagram) m.diagram = f.diagram;   // 13 Oct 2026: a drawn diagram comes back as drawn
            C.rbd.models.push(m); made.added++; setRef(op, m, 'rbd:' + m.id);
        });
        byKind('rbdb').forEach(function (op) { var pk = parentKeyOf(op), m = pk ? keyMap[pk] : null; var nm = splitScoped(idOfKey(op.key))[1]; keyMap[op.key] = { rbd: m, name: nm }; });
        byKind('mk').forEach(function (op) {
            var e = op.el, f = fieldsOf(op);
            if (op.target) { upd(op, op.target.obj, f); setRef(op, op.target.obj, op.target.ref); return; }
            C.markovModels = Array.isArray(C.markovModels) ? C.markovModels : [];
            var m = { id: idOfKey(op.key), name: f.name, states: [], transitions: [] };
            var ipIn = {}, anyIp = false, entry = null;
            e.body.forEach(function (x, ix) {
                if (x.kind === 'state' && !x.def && x.name) {
                    var fl = attrOf(x, 'failed'), st = { name: nameOf(x), isFailed: fl === true };
                    if (attrOf(x, 'degraded') === true && !st.isFailed) st.degraded = true;                 // 13 Oct 2026
                    var p0 = numAttr(x, 'initialProbability'); if (p0 != null) { ipIn[st.name] = p0; anyIp = true; }
                    m.states.push(st); keyMap[identKey(x) || ('mks:' + m.id + '/' + x.name)] = m.states[m.states.length - 1];
                }
                if (x.kind === 'entry' && e.body[ix + 1] && e.body[ix + 1].kind === 'then' && e.body[ix + 1].thenTarget) entry = e.body[ix + 1].thenTarget;
            });
            e.body.forEach(function (x) {
                if (x.kind === 'transition' && x.from && x.to) { var rt = x.metaOf.Rate ? x.metaOf.Rate.perHour : null; var tr = { from: lastSeg(x.from), to: lastSeg(x.to), rate: typeof rt === 'number' ? rt : 0 }; if (x.metaOf.Rate && x.metaOf.Rate.repair === true) tr.kind = 'repair'; m.transitions.push(tr); keyMap[identKey(x) || ('mkt:' + m.id + '/' + (m.transitions.length - 1))] = tr; }
            });
            if (anyIp) m.initialProbs = ipIn;                                                                  // 13 Oct 2026
            else if (entry != null && m.states.some(function (s) { return s.name === entry; }) && m.states[0].name !== entry) m.initialState = entry;
            C.markovModels.push(m); made.added++; setRef(op, m, 'mk:' + m.id);
        });
        // --- human factors and maintenance
        var hfTasks = byKind('hf.task');
        if (hfTasks.length) {
            C.hf = C.hf && typeof C.hf === 'object' ? C.hf : {};
            C.hf.tasks = C.hf.tasks && Array.isArray(C.hf.tasks.rows) ? C.hf.tasks : { rows: [] };
            hfTasks.forEach(function (op) {
                var e = op.el, f = fieldsOf(op);
                if (op.target) { upd(op, op.target.obj, f); setRef(op, op.target.obj, op.target.ref); return; }
                var who = L(e, 'PerformedBy', ['hf.actor'])[0];
                var t = { taskId: idOfKey(op.key), phase: strAttr(e, 'phase'), crewmember: who ? idOfKey(who) : '', task: e.doc || nameOf(e), reactionS: numAttr(e, 'reactionSeconds') == null ? '' : numAttr(e, 'reactionSeconds'), execS: numAttr(e, 'executionSeconds') == null ? '' : numAttr(e, 'executionSeconds'), timeS: numAttr(e, 'timeSeconds') == null ? '' : numAttr(e, 'timeSeconds'), basis: strAttr(e, 'basis'), channels: strAttr(e, 'channels'), notes: strAttr(e, 'notes'), asmId: '' };
                C.hf.tasks.rows.push(t); made.added++; setRef(op, t, 'hf.task:' + t.taskId);
            });
        }
        var ramTasks = byKind('ram.task');
        if (ramTasks.length) {
            C.ram = C.ram && typeof C.ram === 'object' ? C.ram : {};
            C.ram.tasks = Array.isArray(C.ram.tasks) ? C.ram.tasks : [];
            ramTasks.forEach(function (op) {
                var e = op.el, f = fieldsOf(op);
                if (op.target) { upd(op, op.target.obj, f); setRef(op, op.target.obj, op.target.ref); return; }
                var t = { id: idOfKey(op.key), name: f.name, itemId: '', beRef: '', activeRepair: numAttr(e, 'activeRepairHours'), logistics: numAttr(e, 'logisticsHours'), admin: numAttr(e, 'adminHours'), interval: numAttr(e, 'intervalHours') };
                ['activeRepair', 'logistics', 'admin', 'interval'].forEach(function (k) { if (t[k] == null) delete t[k]; });
                C.ram.tasks.push(t); made.added++; setRef(op, t, 'ram.task:' + t.id);
            });
        }

        // ---- second pass: wire the links into the existing link fields, and sysmlRef
        var refHere = function (k) { return k ? (refMap[k] || null) : null; };
        var objOf = function (k) { return k ? keyMap[k] || null : null; };
        var addUniq = function (list, v) { if (v != null && v !== '' && list.indexOf(v) < 0) list.push(v); };
        // An element that already exists is wired into a copy, then only what is NEW is merged in:
        // a link value missing from a list is added, an empty single link is filled. Nothing is removed
        // or overwritten (never delete).
        var shadows = [];
        var shallow = function (o) { var c = {}; Object.keys(o).forEach(function (k) { if (k === 'children' || k === '_children') return; var v = o[k]; c[k] = Array.isArray(v) ? v.slice() : (v && typeof v === 'object') ? Object.assign({}, v) : v; }); return c; };
        ops.forEach(function (op) { if (!op.target || !keyMap[op.key] || op.kind === 'rbdb' || op.kind === 'ccf' || op.kind === 'afn') return; var real = keyMap[op.key], sh = shallow(real); shadows.push({ op: op, real: real, sh: sh }); keyMap[op.key] = sh; });
        // generic "about" link: kept on sysmlRef when it is not one of the typed fields
        var typedAbout = { item: ['fn'], iface: ['fn'], zone: [], route: ['fn'], fha: ['fn', 'sfn'], sfha: ['fn', 'sfn'], fc: ['fn', 'sfn'], sfc: ['fn', 'sfn'], ft: ['sys'], cma: ['sys'], fmea: ['fn', 'sfn', 'sys'], 'stpa.haz': ['fc'], 'stpa.uca': ['stpa.ca'], et: ['fc'], sfn: [], 'ram.task': ['item'], pra: ['sys'] };
        ops.forEach(function (op) {
            var e = op.el, o = keyMap[op.key]; if (!o) return;
            var abouts = L(e, 'About');
            var typed = typedAbout[op.kind] || [];
            var free = abouts.filter(function (k) { return typed.indexOf(kindOfKey(k)) < 0 && !(op.kind === 'sfn' && kindOfKey(k) === 'sys'); });
            if (free.length && op.kind !== 'rbdb') { var r0 = refHere(free[0]) || free[0]; if (o.sysmlRef !== r0) o.sysmlRef = r0; }
        });
        // per kind
        byKind('item').forEach(function (op) { var o = keyMap[op.key]; L(op.el, 'TracesTo', ['fn']).forEach(function (k) { var f = objOf(k); if (f) addUniq(o.traceIds, f.subId); }); });
        byKind('res').forEach(function (op) { var o = keyMap[op.key]; L(op.el, 'ProvidedBy', ['sys']).forEach(function (k) { var s = objOf(k); if (s) addUniq(o.providedBy, s.id); }); L(op.el, 'ConsumedBy', ['sys']).forEach(function (k) { var s = objOf(k); if (s) addUniq(o.consumedBySystems, s.id); }); L(op.el, 'ConsumedBy', ['fn']).forEach(function (k) { var f = objOf(k); if (f) addUniq(o.consumedBy, f.subId); }); });
        byKind('zone').forEach(function (op) { var o = keyMap[op.key]; L(op.el, 'Houses', ['fn']).forEach(function (k) { var f = objOf(k); if (f) addUniq(o.housedFunctions, f.subId); }); });
        byKind('route').forEach(function (op) { var o = keyMap[op.key]; L(op.el, 'TracesTo', ['zone']).forEach(function (k) { var z = objOf(k); if (z) addUniq(o.routesThroughZones, z.zoneId); }); L(op.el, 'About', ['fn']).forEach(function (k) { var f = objOf(k); if (f) addUniq(o.carriesFunctions, f.subId); }); L(op.el, 'RealizedBy', ['item']).forEach(function (k) { var it = objOf(k); if (it) addUniq(o.carriesItems, it.itemId); }); });
        byKind('iface').forEach(function (op) { var o = keyMap[op.key]; if (!o) return; var fns = L(op.el, 'About', ['fn']).map(objOf).filter(Boolean); if (fns[0]) o.fromFuncId = fns[0].subId; if (fns[1]) o.toFuncId = fns[1].subId; });
        byKind('sfn').forEach(function (op) { var o = keyMap[op.key]; if (!o) return; L(op.el, 'TracesTo', ['fn']).forEach(function (k) { var f = objOf(k); if (f) addUniq(o.traceIds, f.subId); }); });
        byKind('fha').concat(byKind('sfha')).forEach(function (op) {
            var o = keyMap[op.key]; if (!o) return;
            L(op.el, 'Cites', ['asm', 'sasm']).forEach(function (k) { var a = objOf(k); if (a) addUniq(o.assumptionIds, a.asmId); });
            var up = L(op.el, 'TracesTo', ['fha'])[0]; if (up && objOf(up)) o.acTrace = objOf(up).internalId;
        });
        byKind('req').concat(byKind('sreq')).forEach(function (op) { var o = keyMap[op.key]; if (!o) return; var m = L(op.el, 'Mitigates')[0]; if (m) { var t = objOf(m); if (t) o.traceId = t.id || t.subId || t.fcId || o.traceId; } });
        byKind('ft').forEach(function (op) {
            var pg = keyMap[op.key];
            var s = L(op.el, 'About', ['sys'])[0]; if (s && objOf(s)) pg.systemId = objOf(s).id;
            pg.linkedFhaIds = L(op.el, 'Analyzes', ['fha', 'sfha']).map(objOf).filter(Boolean).map(function (r) { return r.internalId; });
            var v = L(op.el, 'Covers', ['ft'])[0]; if (v && objOf(v)) pg.verifies = objOf(v).id;
        });
        byKind('ftn').forEach(function (op) {
            var n = keyMap[op.key]; if (!n) return;
            var tr = L(op.el, 'TransfersTo', ['ft']).map(objOf).filter(Boolean);
            if (n.type === 'gate' && tr.length) { if (n.gateType === 'TRANSFER') n.linkedPageId = tr[0].id; else n.transferOutTo = tr[0].id; if (tr[1]) n.transferOutTo = tr[1].id; }
            var g = L(op.el, 'MemberOf', ['ccf'])[0]; if (g && objOf(g)) { n.ccfGroup = objOf(g).name; if (objOf(g).beta != null) n.beta = objOf(g).beta; }
            var it = L(op.el, 'RealizedBy', ['item'])[0]; if (it && objOf(it)) n.realizedByItemId = objOf(it).internalId;
            var mk = L(op.el, 'QuantifiedBy', ['mk'])[0]; if (mk && objOf(mk)) n.markovModelId = objOf(mk).id;
        });
        byKind('ftn').forEach(function (op) { var n = keyMap[op.key]; if (n && n.__page !== undefined) delete n.__page; });
        byKind('cma').forEach(function (op) {
            var o = keyMap[op.key];
            var s = L(op.el, 'About', ['sys'])[0]; o.owningSystemId = s && objOf(s) ? objOf(s).id : '';
            L(op.el, 'Covers', ['ftn']).forEach(function (k) { var ref = refHere(k) || k; var m = /^ftn:(.*)\/([^/]+)$/.exec(ref); if (m) addUniq(o.linkedGateIds, m[1] + ':' + m[2]); });
        });
        byKind('pra').forEach(function (op) { var o = keyMap[op.key]; L(op.el, 'Covers', ['zone']).forEach(function (k) { var z = objOf(k); if (z) addUniq(o.affectedZones, z.zoneId); }); });
        byKind('fmea').forEach(function (op) {
            var o = keyMap[op.key];
            var s = L(op.el, 'About', ['sys'])[0]; if (s && objOf(s)) o.owningSystemId = objOf(s).id;
            var f = L(op.el, 'About', ['fn', 'sfn'])[0]; if (f && objOf(f)) o.funcSubId = objOf(f).subId || objOf(f).funcId;
            var c = L(op.el, 'ContributesTo', ['fha', 'sfha'])[0]; if (c && objOf(c)) o.linkedFcId = String(objOf(c).internalId);
            var be = L(op.el, 'TracesTo', ['ftn'])[0]; if (be && objOf(be)) o.beId = objOf(be).id;
        });
        if (P.stpaData && P.stpaData.cs) {
            ops.filter(function (o) { return o.kind === 'stpa.haz'; }).forEach(function (op) { var h = keyMap[op.key]; if (!h) return; L(op.el, 'LeadsTo', ['stpa.loss']).forEach(function (k) { addUniq(h.lossIds, idOfKey(k)); }); var fc = L(op.el, 'About', ['fc'])[0]; if (fc) h.fromFcId = objOf(fc) ? objOf(fc).id : idOfKey(fc); });
            ops.filter(function (o) { return o.kind === 'stpa.sc'; }).forEach(function (op) { var c = keyMap[op.key]; if (!c) return; L(op.el, 'Mitigates', ['stpa.haz']).forEach(function (k) { addUniq(c.hazardIds, idOfKey(k)); }); });
            ops.filter(function (o) { return o.kind === 'stpa.uca'; }).forEach(function (op) {
                var d = keyMap[op.key]; if (!d) return;
                var hz = L(op.el, 'LeadsTo', ['stpa.haz']).map(idOfKey); if (hz.length) d.hazardIds = hz;
                var fcs = L(op.el, 'LeadsTo', ['fc']).map(function (k) { return objOf(k) ? objOf(k).id : idOfKey(k); }); if (fcs.length) d.fcIds = fcs;
                var ft = L(op.el, 'TracesTo', ['ftn']).map(objOf).filter(Boolean).map(function (n) { return n.displayId || n.id; });
                var fm = L(op.el, 'TracesTo', ['fmea']).map(objOf).filter(Boolean).map(function (r) { return r.internalId; });
                if (ft.length || fm.length) d.bridge = { declared: true, ftaRefs: ft, fmeaRefs: fm };
            });
        }
        byKind('et').forEach(function (op) { var t = keyMap[op.key]; var fc = L(op.el, 'About', ['fc'])[0]; if (fc && objOf(fc)) t.linkedFcId = objOf(fc).id; });
        byKind('eth').forEach(function (op) { var h = keyMap[op.key]; if (!h) return; var pg = L(op.el, 'QuantifiedBy', ['ft'])[0]; if (pg && objOf(pg)) h.linkedPageId = objOf(pg).id; });
        byKind('eto').forEach(function (op) { var c = keyMap[op.key]; if (!c) return; var fc = L(op.el, 'LeadsTo', ['fc'])[0]; if (fc && objOf(fc)) c.linkedFcId = objOf(fc).id; var tr = L(op.el, 'TransfersTo', ['et'])[0]; if (tr && objOf(tr)) c.transferTo = objOf(tr).id; });
        byKind('bte').forEach(function (op) {
            var o = keyMap[op.key]; if (!o) return;
            var fc = L(op.el, 'LeadsTo', ['fc'])[0]; if (fc && objOf(fc)) { o.props = o.props || {}; o.props.linkedFcId = objOf(fc).id; }
            var ft = L(op.el, 'TracesTo', ['ftn'])[0]; if (ft) { o.props = o.props || {}; o.props.ftRef = refHere(ft) || ft; }
        });
        byKind('bt').forEach(function (op) { var b = keyMap[op.key]; L(op.el, 'Analyzes').forEach(function (k) { var o = objOf(k); if (!o) return; if (kindOfKey(k) === 'ft') b.ftaPageId = o.id; if (kindOfKey(k) === 'et') b.etaId = o.id; }); });
        byKind('btb').forEach(function (op) {
            var x = keyMap[op.key]; if (!x) return;
            L(op.el, 'TracesTo').forEach(function (k) { var o = objOf(k); if (!o) return; if (kindOfKey(k) === 'ft') x.trace.pageId = o.id; if (kindOfKey(k) === 'et') x.trace.etaId = o.id; });
            var rq = L(op.el, 'Mitigates', ['req', 'sreq'])[0]; if (rq && objOf(rq) && objOf(rq).id) x.requirementId = objOf(rq).id;
        });
        byKind('rbd').forEach(function (op) { var m = keyMap[op.key]; var pg = L(op.el, 'Analyzes', ['ft'])[0]; if (pg && objOf(pg)) m.fromPage = objOf(pg).id; });
        byKind('rbdb').forEach(function (op) { var b = keyMap[op.key]; if (!b || !b.rbd) return; var ab = L(op.el, 'About')[0]; if (ab) { b.rbd.blockRefs = b.rbd.blockRefs || {}; b.rbd.blockRefs[b.name] = refHere(ab) || ab; } });
        byKind('hf.task').forEach(function (op) { var t = keyMap[op.key]; var a = L(op.el, 'Cites', ['asm'])[0]; if (a && objOf(a)) t.asmId = objOf(a).asmId; });
        byKind('ram.task').forEach(function (op) {
            var t = keyMap[op.key];
            var it = L(op.el, 'About', ['item'])[0]; if (it && objOf(it)) t.itemId = objOf(it).itemId || objOf(it).internalId;
            var be = L(op.el, 'TracesTo', ['ftn'])[0]; if (be && objOf(be)) t.beRef = objOf(be).displayId || objOf(be).id;
        });
        made.linkChanges = [];
        var empty = function (v) { return v == null || v === ''; };
        var mergeInto = function (real, sh, prefix, changed) {
            Object.keys(sh).forEach(function (k) {
                if (k === 'children' || k === '_children' || k === '__page') return;
                var v = sh[k], cur = real[k];
                if (Array.isArray(v)) { var add = v.filter(function (x) { return !Array.isArray(cur) || cur.map(String).indexOf(String(x)) < 0; }); if (add.length) { if (!Array.isArray(cur)) real[k] = []; add.forEach(function (x) { real[k].push(x); }); changed.push(prefix + k); } }
                else if (v && typeof v === 'object') { if (!cur || typeof cur !== 'object') { if (Object.keys(v).length) { real[k] = v; changed.push(prefix + k); } } else mergeInto(cur, v, prefix + k + '.', changed); }
                else if (empty(cur) && !empty(v)) { real[k] = v; changed.push(prefix + k); }
            });
        };
        shadows.forEach(function (x) {
            var changed = []; mergeInto(x.real, x.sh, '', changed);
            keyMap[x.op.key] = x.real;
            if (changed.length) { made.linkChanges.push({ kind: x.op.kind, label: KIND_LABEL[x.op.kind] || x.op.kind, name: (shortOf(x.op.el) ? shortOf(x.op.el) + ' ' : '') + nameOf(x.op.el), fields: changed, key: x.op.key }); if (!(x.op.changed || []).length) made.changed++; }
        });
        // links that pointed at nothing in the exporting project come back as they were written
        var setPath = function (o, pth, v, isArr) {
            var parts = pth.split('.'), x = o;
            for (var i = 0; i < parts.length - 1; i++) { if (!x[parts[i]] || typeof x[parts[i]] !== 'object') x[parts[i]] = parts[i] === 'bridge' ? { declared: true, ftaRefs: [], fmeaRefs: [] } : {}; x = x[parts[i]]; }
            var k = parts[parts.length - 1];
            if (isArr) { if (!Array.isArray(x[k])) x[k] = []; if (x[k].indexOf(v) < 0) x[k].push(v); }
            else if (x[k] == null || x[k] === '') x[k] = v;
        };
        var ARRAY_FIELDS = { traceIds: 1, providedBy: 1, consumedBySystems: 1, consumedBy: 1, housedFunctions: 1, routesThroughZones: 1, carriesFunctions: 1, carriesItems: 1, assumptionIds: 1, linkedFhaIds: 1, linkedGateIds: 1, affectedZones: 1, lossIds: 1, hazardIds: 1, fcIds: 1, 'bridge.ftaRefs': 1, 'bridge.fmeaRefs': 1 };
        ops.forEach(function (op) {
            if (op.target) return;
            var o = keyMap[op.key], m = op.el.metaOf.Ident; if (!o || !m || typeof m.unresolved !== 'string') return;
            var u; try { u = JSON.parse(m.unresolved); } catch (_) { return; }
            Object.keys(u || {}).forEach(function (f) { arr(u[f]).forEach(function (v) { setPath(o, f, v, !!ARRAY_FIELDS[f]); }); });
        });
        // bump the node counter above every id now in the trees
        var mx = toNum(P.internalIdCounter) || 1; arr(P.ftaPages).forEach(function (pg) { (function walk(n) { if (!n) return; var v = toNum(n.id); if (v != null && v >= mx) mx = v + 1; kidsOf(n).forEach(walk); })(pg.root); });
        P.internalIdCounter = mx;

        // ---- plain SysML from another tool
        if (plan.foreign) applyForeign(P, plan, made, newId);
        ensureProjectNs(P);
        return made;
    }

    // What an import would do, including the links it would add to elements that already exist:
    // the plan is applied to a copy of the project and the differences are read back.
    function previewImport(P, files) {
        var plan = planImport(P, files);
        try {
            var copy = JSON.parse(JSON.stringify(P)), n = 0;
            var made = applyImport(copy, planImport(copy, files), { newId: function () { return 'preview-' + (n++); } });
            (made.linkChanges || []).forEach(function (lc) {
                var hit = plan.changes.filter(function (c) { return c.key === lc.key; })[0];
                if (hit) lc.fields.forEach(function (f) { if (hit.fields.indexOf(f) < 0) hit.fields.push(f); });
                else { plan.changes.push(lc); if (plan.kept > 0) plan.kept--; }
            });
        } catch (e) { plan.notes.push('The preview could not try the links out (' + (e.message || e) + '); the import itself is unaffected.'); }
        return plan;
    }
    function applyForeign(P, plan, made, newId) {
        var f = plan.foreign;
        f.systems.forEach(function (s) {
            if (!s.target) {
                var base = 'sys-' + (s.code ? s.code.toLowerCase() : (S(s.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'system')), id = base, k = 2;
                while (systems(P).some(function (x) { return x.id === id; })) id = base + '-' + k++;
                s.target = { id: id, name: s.name, role: 'function', asmCounter: 1, functions: [], fcim: [], extractedFCs: [], fha: [], req: [], asm: [] };
                P.systemsData.push(s.target); made.added++;
            }
            s.items.forEach(function (it) {
                if (it.target) return;
                it.target = { internalId: newId(), itemId: it.itemId || '', name: it.name, type: 'Subsystem', dal: '', daType: 'FDAL', owningSystemId: s.target.id, description: it.desc || '', traceIds: [] };
                P.itemsData.push(it.target); made.added++;
            });
        });
        f.ifaces.forEach(function (x) {
            if (!x.from.target || !x.to.target) return;
            P.projectConfig.interfaces.push({ fromSystemId: x.from.target.id, toSystemId: x.to.target.id, kind: 'interface', direction: 'a_to_b', medium: x.medium || '', icdRef: x.icdRef || '' }); made.added++;
        });
        var sysT = function (sy) { return sy ? (sy.existing || sy.target || null) : null; };
        // a function another tool left without an ID gets the next free one, so failure conditions can point at it
        var nextId = function (prefix, taken) { var n = 1, id; do { id = prefix + String(n++).padStart(3, '0'); } while (taken(id)); return id; };
        var groupIds = Object.create(null);
        f.functions.forEach(function (fn) {
            if (fn.target) return;
            var gid = fn.groupId;
            if (!gid && fn.groupName) { gid = groupIds[fn.groupName] || (groupIds[fn.groupName] = nextId('AF-SYS-', function (x) { return arr(P.acFunctionsData).some(function (r) { return r.funcId === x; }); })); }
            var sid = fn.id || nextId('FN-SYS-', function (x) { return arr(P.acFunctionsData).some(function (r) { return r.subId === x; }); });
            if (!fn.id) plan.notes.push('Function "' + fn.name + '" had no ID in the file; it is ' + sid + ' here.');
            fn.target = { internalId: newId(), funcId: gid || '', funcName: fn.groupName || '', subId: sid, subName: fn.name, subDef: fn.def || '' };
            P.acFunctionsData.push(fn.target); made.added++;
        });
        arr(f.allocs).forEach(function (a) {
            var row = f.functions.filter(function (x) { return x.el === a.fn; })[0], it = null;
            f.systems.forEach(function (sy) { sy.items.forEach(function (x) { if (x.el === a.part) it = x; }); });
            if (row && row.target && it && it.target) { it.target.traceIds = it.target.traceIds || []; if (it.target.traceIds.indexOf(row.target.subId) < 0) it.target.traceIds.push(row.target.subId); }
        });
        arr(f.sysFunctions).forEach(function (fn) {
            var st = sysT(fn.sys); if (fn.target || !st) return;
            st.functions = st.functions || [];
            fn.target = { internalId: newId(), traceIds: [], funcId: fn.id || '', funcName: fn.name, funcDef: fn.def || '' };
            st.functions.push(fn.target); made.added++;
        });
        // a system function that traces to an aircraft function keeps that trace
        arr(f.traces).forEach(function (t) {
            var a = arr(f.sysFunctions).filter(function (x) { return x.el === t.from; })[0], b = f.functions.filter(function (x) { return x.el === t.to; })[0];
            if (a && b && a.target && b.target && b.target.subId && a.target.traceIds && a.target.traceIds.indexOf(b.target.subId) < 0) a.target.traceIds.push(b.target.subId);
        });
        f.reqs.forEach(function (r) {
            if (r.target) return;
            var st = sysT(r.sys), store = r.sys ? (st ? (st.req = st.req || []) : null) : P.acReqData;
            if (!store) return;
            r.target = { internalId: newId(), traceId: '', level: r.sys ? 'L2' : 'L1', type: '', text: r.text, rat: r.rationale || '', verifMethod: '', verifStatus: '', verifEvidence: '' };
            if (r.id) r.target.id = r.id;
            store.push(r.target); made.added++;
        });
    }

    // ======================================================== the browser side
    var core = { exportText: exportText, index: index, indexAreas: indexAreas, build: build, parse: parse, planImport: planImport, previewImport: previewImport, applyImport: applyImport, refOf: refOf, uuid5: uuid5, sha1: sha1, projectNs: projectNs, ensureProjectNs: ensureProjectNs, LIBRARY_TEXT: LIBRARY_TEXT, AREAS: AREAS, KIND_LABEL: KIND_LABEL, areaOfKind: areaOfKind };

    var isBrowser = typeof document !== 'undefined' && typeof window !== 'undefined';
    var STORE_KEYS = ['projectName', 'acFunctionsData', 'acFcimData', 'acFhaData', 'acReqData', 'acAssumptionsData', 'systemsData', 'praData', 'zsaData', 'cmaData', 'routingData', 'resourcesData', 'fmeaData', 'itemsData', 'stpaData', 'ftaPages', 'activeFTAPageId', 'internalIdCounter', 'projectConfig'];
    function liveP() {
        var P = {};
        var St = root.SLStores;
        STORE_KEYS.forEach(function (k) { try { var s = St && St.byKey(k); if (s) P[k] = s.get(); } catch (_) {} });
        return P;
    }
    function writeBack(P) {
        var St = root.SLStores;
        STORE_KEYS.forEach(function (k) { try { var s = St && St.byKey(k); if (s && s.get() !== P[k]) s.set(P[k]); } catch (_) {} });
    }

    // ---- index cache: per area, until the next save -----------------------
    var _ver = 0, _cache = { ver: -1, areas: {} };
    function invalidate() { _ver++; }
    function areaIndex(area) {
        if (_cache.ver !== _ver) _cache = { ver: _ver, areas: {} };
        if (!_cache.areas[area]) {
            var list = indexAreas(liveP(), [area]), byRef = Object.create(null);
            list.forEach(function (x) { byRef[x.ref] = x; });
            _cache.areas[area] = { list: list, byRef: byRef };
        }
        return _cache.areas[area];
    }
    function resolve(ref) {
        if (!ref || typeof ref !== 'string') return null;
        var area = areaOfKind(ref.slice(0, ref.indexOf(':'))); if (!area) return null;
        try { return areaIndex(area).byRef[ref] || null; } catch (_) { return null; }
    }
    function refLabel(ref) { if (!ref) return ''; var r = resolve(ref); return r ? r.label : 'Not found: ' + ref; }
    var DEFAULT_PICK = ['sys', 'item', 'res', 'iface', 'zone', 'afn', 'fn', 'sfn'];
    function targets(opts) {
        opts = opts || {};
        var kinds = opts.kinds || DEFAULT_PICK, areas = [];
        kinds.forEach(function (k) { var a = areaOfKind(k); if (a && areas.indexOf(a) < 0) areas.push(a); });
        if (opts.all) areas = AREAS.map(function (a) { return a.id; });
        var q0 = S(opts.q).toLowerCase().trim(), limit = opts.limit || 200, out = [], total = 0;
        areas.forEach(function (a) {
            areaIndex(a).list.forEach(function (x) {
                if (!opts.all && kinds.indexOf(x.kind) < 0) return;
                if (q0 && x.label.toLowerCase().indexOf(q0) < 0 && x.qn.toLowerCase().indexOf(q0) < 0) return;
                total++; if (out.length < limit) out.push(x);
            });
        });
        out.total = total;
        return out;
    }

    function esc(s) { return S(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function toast(m, k, t) { try { if (typeof root.showToast === 'function') root.showToast(m, k || 'info', t || 3500); } catch (_) {} }
    function save() { invalidate(); try { if (typeof root.commitSaveChanges === 'function') root.commitSaveChanges(); else if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {} }

    // A house modal: the app's dialog card, wider, with our own body.
    function modal(title, bodyHtml, actions, opts) {
        opts = opts || {};
        var ov = document.createElement('div');
        ov.className = 'modal-overlay sl-sysml-modal'; ov.setAttribute('role', 'presentation');
        ov.innerHTML = '<div class="sl-dialog-card" role="dialog" aria-modal="true" aria-label="' + esc(title) + '" style="max-width:' + (opts.width || 640) + 'px; max-height:86vh; display:flex; flex-direction:column;">' +
            '<h3 class="sl-dialog-title">' + esc(title) + '</h3><div class="sl-sysml-body" style="overflow:auto; min-height:0; font-size:13.5px; line-height:1.5;">' + bodyHtml + '</div>' +
            '<div class="sl-dialog-actions">' + actions.map(function (a, i) { return '<button type="button" data-i="' + i + '" class="' + (a.primary ? 'sl-dialog-ok' : 'sl-dialog-cancel') + '"' + (a.disabled ? ' disabled' : '') + '>' + esc(a.label) + '</button>'; }).join('') + '</div></div>';
        document.body.appendChild(ov);
        ov.style.display = 'flex';
        requestAnimationFrame(function () { ov.classList.add('show'); });
        var close = function () { document.removeEventListener('keydown', onKey, true); ov.classList.remove('show'); setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 200); };
        function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } }
        document.addEventListener('keydown', onKey, true);
        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
        Array.prototype.forEach.call(ov.querySelectorAll('.sl-dialog-actions button'), function (b) { b.addEventListener('click', function () { var a = actions[+b.getAttribute('data-i')]; if (a.onClick && a.onClick(ov) === false) return; close(); }); });
        return { el: ov, close: close };
    }
    function download(name, data, type) {
        var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: type || 'text/plain' })); a.download = name;
        document.body.appendChild(a); a.click(); setTimeout(function () { try { URL.revokeObjectURL(a.href); a.remove(); } catch (_) {} }, 1000);
    }
    function safeName(s) { return (typeof root._safeFileName === 'function') ? root._safeFileName(s || 'Untitled') : S(s || 'Untitled').replace(/[^a-z0-9_-]+/gi, '_'); }

    // ---- export ------------------------------------------------------------
    // Which area a screen's Data Actions menu exports by default.
    var TAB_AREA = { fta: 'fta', bowtie: 'bowtie', eta: 'eta', markov: 'markov', fmea: 'fmea', stpa: 'stpa', zsa: 'architecture', pra: 'cca', cma: 'cca', 'ac-func': 'functions', 'ac-fha': 'fha', 'ac-fcim': 'fha', 'ac-req': 'requirements', 'ac-asm': 'assumptions', 'sys-dir': 'architecture', 'sys-workspace': 'architecture', library: 'architecture', rbd: 'rbd' };
    function exportProject(opts) {
        opts = opts || {};
        var P = liveP(); ensureProjectNs(P);
        var areas = opts.area && opts.area !== 'all' ? [opts.area] : null;
        var r = exportText(P, { areas: areas, at: opts.at });
        return { modelText: r.text, libraryText: LIBRARY_TEXT, fileName: safeName(P.projectName) + '.sysml', elements: r.elements, links: r.links, dangling: r.dangling };
    }
    function openExport(area) {
        if (!isBrowser) return;
        var P = liveP();
        var cur = area || TAB_AREA[S(root._slCurrentTab || '')] || 'all';
        var opts = '<option value="all">The whole project</option>' + AREAS.map(function (a) { return '<option value="' + a.id + '"' + (a.id === cur ? ' selected' : '') + '>' + esc(a.label) + ' only</option>'; }).join('');
        var body = '<p style="margin:0 0 10px;">Saves ' + esc(S(P.projectName) || 'this project') + ' as a SysML v2 model you can open in Cameo, Sys Lab or any SysML v2 tool. Every element keeps its Safety Lab ID and its links to the systems, items and functions it is about.</p>' +
            '<label style="display:block; font-weight:600; margin:10px 0 4px;" for="sl-sysml-scope">What to export</label><select id="sl-sysml-scope" style="width:100%;">' + opts + '</select>' +
            '<p style="margin:8px 0 0; font-size:12.5px; color:var(--color-text-secondary);">An area exports with everything its links point at, so the file always opens cleanly.</p>' +
            '<label style="display:block; font-weight:600; margin:14px 0 4px;">File</label>' +
            '<label style="display:flex; gap:8px; align-items:flex-start; margin:4px 0; text-transform:none; letter-spacing:normal; font-weight:400; font-size:13px;"><input type="radio" name="sl-sysml-fmt" value="zip" checked style="width:auto; margin:2px 0 0;"> <span>A .zip with the model and the SafetyLab library as two .sysml files (recommended)</span></label>' +
            '<label style="display:flex; gap:8px; align-items:flex-start; margin:4px 0; text-transform:none; letter-spacing:normal; font-weight:400; font-size:13px;"><input type="radio" name="sl-sysml-fmt" value="one" style="width:auto; margin:2px 0 0;"> <span>One .sysml file with the library inside it</span></label>';
        modal('Export SysML v2', body, [
            { label: 'Cancel' },
            { label: 'Export', primary: true, onClick: function (ov) {
                var sc = ov.querySelector('#sl-sysml-scope').value, fmt = (ov.querySelector('input[name=sl-sysml-fmt]:checked') || {}).value || 'zip';
                toast('Preparing the SysML v2 export...', 'info', 2000);
                setTimeout(function () { runExport(sc, fmt); }, 30);
            } }
        ]);
        function runExport(sc, fmt) {
                var r;
                try { var PP = liveP(); var created = !(PP.projectConfig && PP.projectConfig.sysml && PP.projectConfig.sysml.ns); r = exportProject({ area: sc }); if (created) save(); }
                catch (e) { toast('Could not export: ' + (e.message || e), 'error', 6000); return; }
                var base = r.fileName.replace(/\.sysml$/, '');
                if (fmt === 'one') { download(base + '.sysml', LIBRARY_TEXT + '\n' + r.modelText, 'text/plain'); toast('Exported ' + base + '.sysml (' + r.elements + ' elements, ' + r.links + ' links).', 'success', 4500); return; }
                var files = {}; files[base + '.sysml'] = r.modelText; files[LIBRARY_FILE] = LIBRARY_TEXT;
                if (typeof root._zipMake === 'function') {
                    root._zipMake(files).then(function (u8) { download(base + '_SysML.zip', u8, 'application/zip'); toast('Exported ' + base + '_SysML.zip (' + r.elements + ' elements, ' + r.links + ' links).', 'success', 4500); })
                        .catch(function () { download(base + '.sysml', LIBRARY_TEXT + '\n' + r.modelText, 'text/plain'); });
                } else download(base + '.sysml', LIBRARY_TEXT + '\n' + r.modelText, 'text/plain');
        }
    }

    // ---- import ------------------------------------------------------------
    function readPicked(fileList) {
        var list = Array.prototype.slice.call(fileList || []);
        return Promise.all(list.map(function (f) {
            if (/\.zip$/i.test(f.name) && typeof root._zipParse === 'function') {
                return f.arrayBuffer().then(function (b) { return root._zipParse(new Uint8Array(b)); }).then(function (files) {
                    return Object.keys(files).filter(function (n) { return /\.(sysml|kerml)$/i.test(n); }).map(function (n) { var v = files[n]; return { name: n, text: typeof v === 'string' ? v : new TextDecoder().decode(v) }; });
                });
            }
            return f.text().then(function (t) { return [{ name: f.name, text: t }]; });
        })).then(function (parts) { return [].concat.apply([], parts); });
    }
    function openImport() {
        if (!isBrowser) return;
        var inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = '.sysml,.kerml,.zip';
        inp.onchange = function () {
            readPicked(inp.files).then(function (files) {
                if (!files.length) { toast('No .sysml file in what you picked.', 'warning'); return; }
                if (files.some(function (f) { return /<\?xml|<xmi:XMI|<uml:Model/.test(f.text.slice(0, 400)); })) { toast('That is an XMI file. Use Project > Import SysML model (XMI) for it.', 'warning', 6000); return; }
                showPlan(files);
            }).catch(function (e) { toast('Could not read the file: ' + (e.message || e), 'error', 6000); });
        };
        inp.click();
    }
    function showPlan(files) {
        var P = liveP(), plan;
        try { plan = previewImport(P, files); } catch (e) { slAlertSafe('Could not read the SysML file: ' + (e.message || e)); return; }
        var adds = plan.adds, chg = plan.changes;
        var group = function (list) { var g = {}; list.forEach(function (x) { (g[x.label] = g[x.label] || []).push(x); }); return g; };
        var section = function (title, list, fmt) {
            if (!list.length) return '';
            var g = group(list);
            return '<h4 style="margin:12px 0 4px; font-size:13.5px;">' + esc(title) + '</h4>' + Object.keys(g).map(function (k) {
                var rows = g[k];
                return '<details style="margin:2px 0;"><summary>' + esc(k) + ': ' + rows.length + '</summary><ul style="margin:4px 0 4px 18px; padding:0;">' + rows.slice(0, 200).map(function (x) { return '<li>' + esc(fmt(x)) + '</li>'; }).join('') + (rows.length > 200 ? '<li>and ' + (rows.length - 200) + ' more</li>' : '') + '</ul></details>';
            }).join('');
        };
        var body = '<p style="margin:0 0 6px;">From ' + esc(plan.files.join(', ')) + '. Nothing in this project is deleted: new elements are added, and elements that match by ID or name are updated where the file differs.</p>' +
            (adds.length || chg.length ? '' : '<p><b>Nothing to add or change.</b> This project already has everything in the file.</p>') +
            section('Will be added', adds, function (x) { return x.name; }) +
            section('Will be updated', chg, function (x) { return x.name + ' (' + x.fields.join(', ') + ')'; }) +
            (plan.kept ? '<p style="margin:10px 0 0;">Already in this project and unchanged: ' + plan.kept + ' element' + (plan.kept === 1 ? '' : 's') + ' (matched by ID or name).</p>' : '') +
            (plan.unmapped.length ? '<h4 style="margin:12px 0 4px; font-size:13.5px;">Not brought in</h4><ul style="margin:4px 0 4px 18px; padding:0;">' + plan.unmapped.slice(0, 100).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' : '') +
            (plan.notes.length ? '<h4 style="margin:12px 0 4px; font-size:13.5px;">Notes</h4><ul style="margin:4px 0 4px 18px; padding:0;">' + plan.notes.slice(0, 100).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' : '');
        modal('Import SysML v2', body, [
            { label: 'Cancel' },
            { label: adds.length || chg.length ? 'Import ' + (adds.length + chg.length) + ' change' + (adds.length + chg.length === 1 ? '' : 's') : 'Close', primary: true, disabled: false, onClick: function () {
                if (!adds.length && !chg.length) return;
                try { if (typeof root.pushUndo === 'function') root.pushUndo('SysML v2 import'); } catch (_) {}
                var LP = liveP(), plan2 = planImport(LP, files), made;
                try { made = applyImport(LP, plan2, { newId: typeof root.newRowId === 'function' ? root.newRowId : null }); }
                catch (e) { slAlertSafe('The import stopped part way: ' + (e.message || e) + '. Use Undo to go back.'); return; }
                writeBack(LP);
                try { if (typeof root.rebuildExtractedFCsForAllSystems === 'function') root.rebuildExtractedFCsForAllSystems(); } catch (_) {}
                save();
                try { if (typeof root.jrnl === 'function') root.jrnl('sysml-import', 'SysML v2 import from ' + plan2.files.join(', ') + ': ' + made.added + ' added, ' + made.changed + ' updated'); } catch (_) {}
                if (plan2.projectName && typeof root._refreshProjectNameUI === 'function') { try { root._refreshProjectNameUI(); } catch (_) {} }
                ['renderACFunctions', 'renderACFCIM', 'renderACFHA', 'renderACReq', 'renderACAssumptions', 'renderFMEA', 'renderZSA', 'renderPRA', 'renderItems', 'renderSystemDirectory', 'renderMarkovModels', 'renderFTASidebar', 'updateD3', 'updateDashboard', 'renderProjectConfigUI'].forEach(function (fn) { try { if (typeof root[fn] === 'function') root[fn](); } catch (_) {} });
                toast('Imported from SysML v2: ' + made.added + ' added, ' + made.changed + ' updated.', 'success', 5000);
            } }
        ], { width: 700 });
    }
    function slAlertSafe(m) { if (typeof root.slAlert === 'function') root.slAlert(m, { title: 'SysML v2' }); else toast(m, 'error', 7000); }

    // ---- the link picker -----------------------------------------------------
    function linkPicker(container, currentRef, onPick, opts) {
        opts = opts || {};
        if (!container) return null;
        var wrap = document.createElement('div');
        wrap.className = 'sl-sysml-field'; wrap.setAttribute('data-sl-sysml-field', '1');
        wrap.style.cssText = 'display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:0 0 12px;';
        var cur = currentRef || '';
        function paint() {
            var lbl = cur ? refLabel(cur) : 'Not linked';
            var missing = cur && !resolve(cur), rs = cur ? resolve(cur) : null;
            wrap.innerHTML = '<label style="margin:0; font-weight:600; white-space:nowrap;">' + esc(opts.label || 'Model element') + '</label>' +
                '<span class="sl-sysml-value" title="' + esc(rs ? rs.kindLabel + (rs.path ? ' in ' + rs.path : '') : cur ? 'This link points at an element that is no longer in the model' : 'Not linked to an element of the system model yet') + '" style="flex:1; min-width:140px; padding:6px 10px; border:1px solid var(--color-border, #e5e7eb); border-radius:8px; font-size:13px;' + (missing ? ' color:#b91c1c;' : cur ? '' : ' color:var(--color-text-secondary);') + '">' + esc(lbl) + '</span>' +
                '<button type="button" class="sl-sysml-change" style="padding:6px 12px; border-radius:8px; border:1px solid var(--color-border, #e5e7eb); background:var(--color-surface-2, #f3f4f6); color:inherit; font-size:13px; font-weight:600; cursor:pointer;">' + (cur ? 'Change' : 'Link') + '</button>' +
                (cur ? '<button type="button" class="sl-sysml-clear" style="padding:6px 12px; border-radius:8px; border:1px solid var(--color-border, #e5e7eb); background:transparent; color:inherit; font-size:13px; cursor:pointer;">Clear</button>' : '');
            wrap.querySelector('.sl-sysml-change').onclick = function () { openPicker(cur, opts, function (ref) { cur = ref; paint(); try { ensureLiveNs(); onPick(ref); } catch (e) { if (root.SLErrorWatch) root.SLErrorWatch.report(e, 'sysml_model'); } }); };
            var cl = wrap.querySelector('.sl-sysml-clear'); if (cl) cl.onclick = function () { cur = ''; paint(); try { onPick(null); } catch (_) {} };
        }
        paint();
        container.appendChild(wrap);
        return { el: wrap, set: function (ref) { cur = ref || ''; paint(); }, destroy: function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); } };
    }
    function ensureLiveNs() {
        try { if (typeof projectConfig !== 'undefined' && projectConfig && !(projectConfig.sysml && projectConfig.sysml.ns)) { ensureProjectNs({ projectConfig: projectConfig }); } } catch (_) {}
    }
    function openPicker(cur, opts, done) {
        var all = false;
        var body = '<input type="search" class="sl-dialog-input" id="sl-sysml-q" placeholder="Search by ID or name" autocomplete="off" style="margin-top:0;">' +
            '<label style="display:flex; gap:8px; align-items:center; margin:8px 0; font-size:12.5px; text-transform:none; letter-spacing:normal; font-weight:400;"><input type="checkbox" id="sl-sysml-all" style="width:auto; margin:0;"> Also show safety elements (failure conditions, fault tree nodes, STPA, barriers and more)</label>' +
            '<div id="sl-sysml-list" role="listbox" style="border:1px solid var(--color-border, #e5e7eb); border-radius:8px; max-height:46vh; overflow:auto;"></div><div id="sl-sysml-more" style="font-size:12px; color:var(--color-text-secondary); margin-top:6px;"></div>';
        var m = modal(opts.title || 'Link to a model element', body, [{ label: 'Cancel' }], { width: 620 });
        var list = m.el.querySelector('#sl-sysml-list'), qEl = m.el.querySelector('#sl-sysml-q'), more = m.el.querySelector('#sl-sysml-more');
        function paint() {
            var rows = targets({ kinds: opts.kinds || null, all: all, q: qEl.value, limit: 200 });
            list.innerHTML = rows.length ? rows.map(function (x) {
                return '<div role="option" tabindex="0" data-ref="' + esc(x.ref) + '" class="sl-sysml-opt" style="padding:7px 10px; border-bottom:1px solid var(--color-border-hair, #eef0f3); cursor:pointer;' + (x.ref === cur ? ' background:var(--color-surface-2, #f3f4f6); font-weight:600;' : '') + '">' +
                    '<div style="font-size:13px;">' + esc((x.id ? x.id + ' ' : '') + x.name) + '</div><div style="font-size:11.5px; color:var(--color-text-secondary);">' + esc(x.kindLabel) + (x.path ? ' in ' + esc(x.path) : '') + '</div></div>';
            }).join('') : '<div style="padding:12px; color:var(--color-text-secondary);">Nothing matches.</div>';
            more.textContent = rows.total > rows.length ? 'Showing ' + rows.length + ' of ' + rows.total + '. Type to narrow the list.' : '';
            Array.prototype.forEach.call(list.querySelectorAll('.sl-sysml-opt'), function (o) {
                var pick = function () { m.close(); done(o.getAttribute('data-ref')); };
                o.addEventListener('click', pick); o.addEventListener('keydown', function (e) { if (e.key === 'Enter') pick(); });
            });
        }
        var tmr = null;
        qEl.addEventListener('input', function () { clearTimeout(tmr); tmr = setTimeout(paint, 120); });
        m.el.querySelector('#sl-sysml-all').addEventListener('change', function (e) { all = e.target.checked; paint(); });
        paint();
        setTimeout(function () { qEl.focus(); }, 40);
        return m;
    }

    // ---- wiring: menus, the node drawer, the cache --------------------------
    function addMenuItems() {
        var menus = document.querySelectorAll('.tab-dropdown-content');
        Array.prototype.forEach.call(menus, function (menu) {
            if (menu.querySelector('[data-sl-sysml]')) return;
            var hr = document.createElement('hr'); hr.setAttribute('data-sl-sysml', 'sep'); hr.style.cssText = 'border:none; border-top:1px solid var(--color-border-hair); margin:4px 0;';
            var ex = document.createElement('div'); ex.setAttribute('data-sl-sysml', 'export'); ex.textContent = 'Export SysML v2';
            ex.title = 'Save this area (or the whole project) as a SysML v2 model for Cameo, Sys Lab or any SysML v2 tool';
            ex.onclick = function () { openExport(menuArea(menu)); };
            var im = document.createElement('div'); im.setAttribute('data-sl-sysml', 'import'); im.textContent = 'Import SysML v2';
            im.title = 'Bring in a SysML v2 model (.sysml or .zip) from Safety Lab, Sys Lab, Cameo or another SysML v2 tool';
            im.onclick = function () { openImport(); };
            menu.appendChild(hr); menu.appendChild(ex); menu.appendChild(im);
        });
        // the Project menu, next to the XMI import
        var xmi = document.querySelector('.nav-dropdown-content [onclick*="import-xmi-file"]');
        if (xmi && !document.querySelector('[data-sl-sysml="project-export"]')) {
            var pe = document.createElement('div'); pe.setAttribute('data-sl-sysml', 'project-export'); pe.textContent = '📐  Export SysML v2 model…'; pe.onclick = function () { openExport('all'); };
            var pi = document.createElement('div'); pi.setAttribute('data-sl-sysml', 'project-import'); pi.textContent = '📐  Import SysML v2 model…'; pi.onclick = function () { openImport(); };
            xmi.parentNode.insertBefore(pe, xmi); xmi.parentNode.insertBefore(pi, xmi);
        }
    }
    function menuArea(menu) {
        var v = menu.closest('[id^="view-"]'), id = v ? v.id.replace(/^view-/, '') : '';
        if (id === 'fta' || /fta/.test(id)) return 'fta';
        return TAB_AREA[id] || TAB_AREA[S(root._slCurrentTab)] || 'all';
    }
    // The fault tree node drawer: a "Model element" row under the identity block.
    function hookNodeDrawer() {
        var orig = root.openNodePropertiesModal;
        if (typeof orig !== 'function' || orig.__slSysml) return;
        var wrapped = function (dataNode) {
            var r = orig.apply(this, arguments);
            try { mountNodeField(dataNode); } catch (e) { if (root.SLErrorWatch) root.SLErrorWatch.report(e, 'sysml_model'); }
            return r;
        };
        wrapped.__slSysml = true;
        root.openNodePropertiesModal = wrapped;
    }
    function mountNodeField(dataNode) {
        var panel = document.getElementById('node-config-panel'); if (!panel || !dataNode) return;
        var node = dataNode.data || dataNode;
        var host = document.getElementById('config-sysml-host');
        if (panel.querySelector('[data-sl-sysml-field]') && !(host && host.contains(panel.querySelector('[data-sl-sysml-field]')))) return;   // another feature renders its own field
        if (!host) {
            host = document.createElement('div'); host.id = 'config-sysml-host';
            var after = document.getElementById('config-identity-host');
            if (after && after.parentNode) after.parentNode.insertBefore(host, after.nextSibling); else panel.appendChild(host);
        }
        host.innerHTML = '';
        // One field for the node's link to the model. An event realized by an item keeps using the
        // established realizedByItemId (the golden thread, EWIS and integrity checks read it); any
        // other element goes on sysmlRef.
        var isEvent = node.type && node.type !== 'gate';
        var itemRef = function () { var v = node.realizedByItemId; if (v == null || v === '') return ''; var its = []; try { its = (root.SLStores && root.SLStores.byKey('itemsData').get()) || []; } catch (_) {} var it = its.find(function (x) { return String(x.internalId) === String(v) || x.itemId === v; }); return it ? 'item:' + it.internalId : ''; };
        linkPicker(host, node.sysmlRef || itemRef(), function (ref) {
            try { if (typeof root.pushUndo === 'function') root.pushUndo('Link model element'); } catch (_) {}
            if (ref && isEvent && /^item:/.test(ref)) {
                var iid = ref.slice(5), n = Number(iid);
                node.realizedByItemId = isFinite(n) && String(n) === iid ? n : iid;
                delete node.sysmlRef;
            } else if (ref) node.sysmlRef = ref;
            else { if (node.sysmlRef) delete node.sysmlRef; else if (isEvent) delete node.realizedByItemId; }
            save();
        }, { label: 'Model element' });
    }
    function hookCache() {
        ['scheduleAutosave', '_applyProjectData'].forEach(function (fn) {
            var orig = root[fn]; if (typeof orig !== 'function' || orig.__slSysml) return;
            var w = function () { invalidate(); return orig.apply(this, arguments); }; w.__slSysml = true; root[fn] = w;
        });
    }
    function addStyles() {
        if (document.getElementById('sl-sysml-styles')) return;
        var st = document.createElement('style'); st.id = 'sl-sysml-styles';
        st.textContent = '.sl-sysml-opt:hover,.sl-sysml-opt:focus{background:var(--color-surface-2,#f3f4f6);outline:none}' +
            '.sl-sysml-opt:focus-visible{box-shadow:inset 0 0 0 2px var(--color-accent,#0a84ff)}' +
            '.sl-sysml-field .sl-sysml-change:hover,.sl-sysml-field .sl-sysml-clear:hover{border-color:var(--color-accent,#0a84ff)}';
        document.head.appendChild(st);
    }
    function boot() {
        try { hookDiagramEditor(); } catch (_) {}
        try { addStyles(); } catch (_) {}
        try { addMenuItems(); } catch (e) { if (root.SLErrorWatch) root.SLErrorWatch.report(e, 'sysml_model'); }
        try { hookNodeDrawer(); } catch (_) {}
        try { hookCache(); } catch (_) {}
    }
    if (isBrowser) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
        root.addEventListener && root.addEventListener('load', boot);
    }

    // v1.1: the picker on its own, as a promise (null when the person closes it without picking).
    function pick(currentRef, opts) {
        opts = opts || {};
        return new Promise(function (resolveP) {
            if (!isBrowser) { resolveP(null); return; }
            var done = false;
            var m = openPicker(currentRef || '', opts, function (ref) { done = true; ensureLiveNs(); resolveP(ref || null); });
            // closing the dialog without a pick resolves null
            try {
                var ov = m && m.el;
                if (ov && typeof MutationObserver !== 'undefined') {
                    var mo = new MutationObserver(function () { if (!ov.isConnected) { mo.disconnect(); if (!done) resolveP(null); } });
                    mo.observe(document.body, { childList: true });
                }
            } catch (_) {}
        });
    }
    // The ONE SysML provider for the diagram editor (merge of the bow-tie / event tree round and the
    // STPA / cascading effects round): every diagram's "Link to model element" picks from this model,
    // stores the same string ref as every other sysmlRef, and a closed picker resolves null.
    var editorProvider = {
        pick: function (item) { return pick(item && typeof item.sysmlRef === 'string' ? item.sysmlRef : '', { title: 'Link ' + ((item && item.label) || 'this shape') + ' to a model element' }); },
        describe: function (ref) { return typeof ref === 'string' ? refLabel(ref) : (ref && (ref.qualifiedName || ref.name || ref.id)) || ''; }
    };
    function hookDiagramEditor() {
        var E = root.SLDiagramEditor;
        if (!E || typeof E.setSysmlProvider !== 'function' || (typeof E.getSysmlProvider === 'function' && E.getSysmlProvider())) return;
        E.setSysmlProvider(editorProvider);
    }
    try { hookDiagramEditor(); } catch (_) {}

    root.SLSysML = {
        version: '1.3',
        pick: pick, editorProvider: editorProvider,
        LIBRARY_TEXT: LIBRARY_TEXT, LIBRARY_FILE: LIBRARY_FILE, AREAS: AREAS,
        core: core,
        refOf: refOf, resolve: resolve, refLabel: refLabel, targets: targets, invalidate: invalidate,
        index: function () { return index(liveP()); },
        linkPicker: linkPicker,
        exportProject: exportProject, openExport: openExport, openImport: openImport, showPlan: showPlan,
        planImport: function (P, files) { return planImport(P || liveP(), files); },
        applyImport: function (P, plan) { return applyImport(P || liveP(), plan); }
    };
}(typeof window !== 'undefined' ? window : this));
