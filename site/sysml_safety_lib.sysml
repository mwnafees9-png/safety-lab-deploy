/* SafetyLab: an open SysML v2 library for safety, reliability and human factors analysis.
   Version 1.2, 13 Oct 2026 (1.1 adds the STPA Handbook's actuators, sensors, external elements, actuation
   and measurement links, the controller's control algorithm and the link type of other links; event tree
   and bow-tie extras; 1.2 adds RbdBlock repairRate and places, StandbyGroup, MarkovState degraded and
   initialProbability, Rate repair). Published by Safety Lab Aero for use in any SysML v2 tool.
   Modeled on the concepts of OMG RAAML 1.1 and 1.2 (fault trees, FMEA, FHA, STPA), which exist only as a
   SysML v1 profile, and on open SysML v2 work for STPA (Ahlbrecht et al., Systems Engineering, 2025).
   Every Safety Lab export imports this package; Safety Lab reads it back on import. */
library package SafetyLab {
    doc /* Definitions for failure conditions, FHA entries, fault trees, common cause, FMEA, STPA, bow-ties,
           event trees, reliability block diagrams, Markov models, human factors and maintenance tasks,
           plus the typed links that tie each of them to the system elements they are about. */
    private import ScalarValues::*;

    /* ---------- value types ---------- */
    enum def Severity {
        doc /* Failure condition classification (ARP4761A, AC 25.1309-1B). */
        enum noSafetyEffect;
        enum minor;
        enum major;
        enum hazardous;
        enum catastrophic;
    }
    enum def GateKind {
        doc /* Fault tree gates (IEC 61025, NASA Fault Tree Handbook). */
        enum andGate;
        enum orGate;
        enum xorGate;
        enum votingGate;
        enum inhibitGate;
        enum transferGate;
        enum priorityAndGate;
        enum spareGate;
        enum functionalDependencyGate;
        enum sequenceEnforcingGate;
        enum notGate;
    }
    enum def EventKind {
        doc /* Fault tree events (IEC 61025). */
        enum basicEvent;
        enum undevelopedEvent;
        enum conditioningEvent;
        enum houseEvent;
    }
    enum def FailureConditionKind {
        doc /* How a failure condition relates to its function (FHA functional failure set). */
        enum totalLoss;
        enum partialLoss;
        enum malfunction;
        enum combined;
    }
    enum def GuideWord {
        doc /* The four ways a control action can be unsafe (STPA Handbook, SAE J3307). */
        enum notProvided;
        enum providedCausesHazard;
        enum wrongTimingOrOrder;
        enum stoppedTooSoonOrAppliedTooLong;
    }
    enum def ControllerKind {
        enum human;
        enum automation;
        enum organization;
    }
    enum def BarrierSide {
        enum preventive;
        enum mitigative;
    }

    /* ---------- identity and links ---------- */
    metadata def Ident {
        doc /* The stable identity of an exported element: the Safety Lab key and its SysML element id. */
        attribute key : String;
        attribute elementId : String[0..1];
        attribute label : String[0..1];
        attribute localId : String[0..1];
        attribute unresolved : String[0..1];
    }
    abstract metadata def SafetyLink {
        doc /* A typed link from a safety element to what it is about. Used on dependencies. */
    }
    metadata def About :> SafetyLink;
    metadata def Assesses :> SafetyLink;
    metadata def Analyzes :> SafetyLink;
    metadata def Mitigates :> SafetyLink;
    metadata def RealizedBy :> SafetyLink;
    metadata def ContributesTo :> SafetyLink;
    metadata def MemberOf :> SafetyLink;
    metadata def TransfersTo :> SafetyLink;
    metadata def QuantifiedBy :> SafetyLink;
    metadata def ProvidedBy :> SafetyLink;
    metadata def ConsumedBy :> SafetyLink;
    metadata def Houses :> SafetyLink;
    metadata def Covers :> SafetyLink;
    metadata def LeadsTo :> SafetyLink;
    metadata def PerformedBy :> SafetyLink;
    metadata def Cites :> SafetyLink;
    metadata def TracesTo :> SafetyLink;
    metadata def Rate {
        doc /* A Markov transition rate, per hour. repair = true marks a repair (restoration) transition. */
        attribute perHour : Real;
        attribute repair : Boolean[0..1];
    }

    /* ---------- architecture ---------- */
    abstract part def SafetyElement;
    part def AircraftModel :> SafetyElement {
        doc /* The whole aircraft: its systems and the interfaces between them. */
    }
    part def System :> SafetyElement {
        attribute role : String[0..1];
    }
    part def Item :> SafetyElement {
        doc /* An item, LRU or component that realizes part of a system. */
        attribute itemType : String[0..1];
        attribute dal : String[0..1];
        attribute assuranceType : String[0..1];
    }
    part def SharedResource :> SafetyElement {
        doc /* A resource several systems depend on (power, hydraulics, a data bus). */
        attribute resourceType : String[0..1];
    }
    connection def SystemInterface {
        end part a : SafetyElement;
        end part b : SafetyElement;
        attribute interfaceKind : String[0..1];
        attribute direction : String[0..1];
        attribute medium : String[0..1];
        attribute icdRef : String[0..1];
    }
    part def Zone :> SafetyElement {
        attribute equipment : String[0..1];
        attribute severityLabel : String[0..1];
        attribute interference : String[0..1];
        attribute mitigation : String[0..1];
    }
    part def Routing :> SafetyElement {
        attribute routingKind : String[0..1];
    }

    /* ---------- functions and requirements ---------- */
    action def AircraftFunction;
    action def SystemFunction;
    requirement def SafetyRequirement {
        attribute level : String[0..1];
        attribute requirementType : String[0..1];
        attribute rationale : String[0..1];
        attribute verificationMethod : String[0..1];
        attribute verificationStatus : String[0..1];
        attribute traceId : String[0..1];
    }
    part def Assumption :> SafetyElement {
        attribute assumptionType : String[0..1];
        attribute assumptionState : String[0..1];
        attribute validationStrategy : String[0..1];
        attribute routeTo : String[0..1];
    }

    /* ---------- FHA ---------- */
    part def FailureCondition :> SafetyElement {
        doc /* A failure condition: the effect on the aircraft of a function failing in a given way. */
        attribute failureKind : FailureConditionKind[0..1];
        attribute additional : Boolean[0..1];
        attribute awareness : String[0..1];
        attribute functionRef : String[0..1];
    }
    part def FhaEntry :> SafetyElement {
        doc /* One row of a functional hazard assessment: a failure condition classified in its flight phases. */
        attribute severity : Severity[0..1];
        attribute severityLabel : String[0..1];
        attribute phases : String[0..1];
        attribute effectOnAircraft : String[0..1];
        attribute effectOnCrew : String[0..1];
        attribute effectOnOccupants : String[0..1];
        attribute functionRef : String[0..1];
    }

    /* ---------- fault trees and common cause ---------- */
    part def FaultTree :> SafetyElement {
        attribute treeLevel : String[0..1];
        attribute mode : String[0..1];
        attribute asBuiltFactor : Real[0..1];
    }
    abstract part def FaultTreeNode :> SafetyElement {
        attribute logicalId : String[0..1];
    }
    part def Gate :> FaultTreeNode {
        attribute gateKind : GateKind[0..1];
        attribute gateKindLabel : String[0..1];
        attribute votingK : Integer[0..1];
        attribute dalOption : String[0..1];
    }
    part def Event :> FaultTreeNode {
        attribute eventKind : EventKind[0..1];
        attribute eventKindLabel : String[0..1];
        attribute probability : Real[0..1];
        attribute failureRate : Real[0..1];
        attribute inputMode : String[0..1];
        attribute exposureMode : String[0..1];
        attribute exposureTime : Real[0..1];
        attribute repairModel : String[0..1];
        attribute repairTime : Real[0..1];
        attribute libraryKey : String[0..1];
    }
    part def CommonCauseGroup :> SafetyElement {
        attribute beta : Real[0..1];
    }
    part def CommonModeAnalysis :> SafetyElement {
        attribute claim : String[0..1];
        attribute modes : String[0..1];
        attribute findings : String[0..1];
        attribute mitigation : String[0..1];
        attribute status : String[0..1];
        attribute scope : String[0..1];
    }
    part def ParticularRisk :> SafetyElement {
        attribute affectedSystems : String[0..1];
        attribute affectedSystemIds : String[0..1];
        attribute csfl : String[0..1];
        attribute mitigation : String[0..1];
    }

    /* ---------- FMEA ---------- */
    part def FailureMode :> SafetyElement {
        doc /* One FMEA line: a way an item or function fails, and its effects. */
        attribute fmeaType : String[0..1];
        attribute scope : String[0..1];
        attribute itemName : String[0..1];
        attribute phase : String[0..1];
        attribute localEffect : String[0..1];
        attribute nextEffect : String[0..1];
        attribute endEffect : String[0..1];
        attribute detection : String[0..1];
        attribute severityLabel : String[0..1];
        attribute compensating : String[0..1];
        attribute remarks : String[0..1];
        attribute failureRate : Real[0..1];
        attribute exposureTime : Real[0..1];
        attribute libraryKey : String[0..1];
    }
    part def FailureEffect :> SafetyElement {
        attribute effectLevel : String[0..1];
    }

    /* ---------- STPA ---------- */
    part def ControlStructure :> SafetyElement;
    part def Controller :> SafetyElement {
        attribute controllerKind : ControllerKind[0..1];
        attribute controllerKindLabel : String[0..1];
        attribute rank : Integer[0..1];
        attribute processModel : String[0..1];
        attribute controlAlgorithm : String[0..1];
    }
    part def ControlledProcess :> SafetyElement;
    part def Actuator :> SafetyElement {
        doc /* Turns a controller's control action into a physical action on the controlled process (STPA Handbook, Leveson and Thomas 2018). */
    }
    part def Sensor :> SafetyElement {
        doc /* Measures the controlled process and carries the feedback back to a controller (STPA Handbook). */
    }
    part def ExternalElement :> SafetyElement {
        doc /* Outside the control structure: the environment or another system that sends disturbances or other inputs. */
    }
    connection def ControlAction {
        end part source : SafetyElement;
        end part target : SafetyElement;
    }
    connection def Feedback {
        end part source : SafetyElement;
        end part target : SafetyElement;
    }
    connection def OtherLink {
        end part source : SafetyElement;
        end part target : SafetyElement;
        attribute linkType : String[0..1];
    }
    connection def Actuation {
        doc /* An actuator acting on the element it controls. */
        end part source : SafetyElement;
        end part target : SafetyElement;
    }
    connection def Measurement {
        doc /* A sensor measuring an element. */
        end part source : SafetyElement;
        end part target : SafetyElement;
    }
    part def Loss :> SafetyElement;
    part def Hazard :> SafetyElement {
        attribute group : String[0..1];
    }
    part def SafetyConstraint :> SafetyElement;
    part def UnsafeControlAction :> SafetyElement {
        attribute guideWord : GuideWord[0..1];
        attribute context : String[0..1];
        attribute status : String[0..1];
        attribute rationale : String[0..1];
    }

    /* ---------- bow-ties (CCPS / Energy Institute) and event trees (IEC 62502) ---------- */
    part def BowTie :> SafetyElement;
    part def BowTieHazard :> SafetyElement {
        doc /* The hazard of a bow-tie: what can cause harm while it is kept under control. */
    }
    part def TopEvent :> SafetyElement {
        doc /* The moment control of the hazard is lost: the knot of the bow-tie. */
    }
    part def Threat :> SafetyElement {
        doc /* A cause that can release the hazard into the top event. */
    }
    part def Consequence :> SafetyElement {
        doc /* An outcome of the top event. */
        attribute severityLabel : String[0..1];
        attribute consequenceCategory : String[0..1];
        attribute linkedFcId : String[0..1];
    }
    part def EscalationFactor :> SafetyElement {
        doc /* A condition that makes a barrier fail or work less well. */
    }
    part def Barrier :> SafetyElement {
        attribute side : BarrierSide[0..1];
        attribute barrierRole : String[0..1];
        attribute barrierType : String[0..1];
        attribute effectiveness : String[0..1];
        attribute barrierOwner : String[0..1];
        attribute failureProbability : Real[0..1];
        attribute traceKind : String[0..1];
        attribute traceRef : String[0..1];
        attribute traceLogicalId : String[0..1];
        attribute principleId : String[0..1];
        attribute requirementId : String[0..1];
    }
    connection def BowTiePathway {
        doc /* A pathway: threat to barrier to top event, or top event to barrier to consequence. */
        end part source : SafetyElement;
        end part target : SafetyElement;
    }
    connection def EscalationPathway {
        doc /* An escalation factor to the barrier it degrades, through escalation factor barriers. */
        end part source : SafetyElement;
        end part target : SafetyElement;
    }
    connection def HazardRelease {
        end part source : SafetyElement;
        end part target : SafetyElement;
    }
    part def EventTree :> SafetyElement {
        attribute initiatorFrequency : Real[0..1];
        attribute initiatorFromTransfers : Boolean[0..1];
        attribute sequenceRules : String[0..1];
    }
    part def EventTreeHeading :> SafetyElement {
        attribute failureProbability : Real[0..1];
        attribute couplingProbability : Real[0..1];
        attribute outcomes : String[0..1];
    }
    part def EventTreeOutcome :> SafetyElement {
        attribute path : String[0..1];
        attribute severityLabel : String[0..1];
        attribute linkedFcId : String[0..1];
        attribute endState : String[0..1];
        attribute consequenceCategory : String[0..1];
    }

    /* ---------- reliability block diagrams and Markov models ---------- */
    part def ReliabilityBlockDiagram :> SafetyElement {
        attribute structure : String[0..1];
    }
    part def RbdBlock :> SafetyElement {
        doc /* One component of a reliability block diagram (IEC 61078). A block drawn in several places is one component. */
        attribute failureRate : Real[0..1];
        attribute repairRate : Real[0..1];
        attribute places : Integer[0..1];
    }
    part def StandbyGroup :> RbdBlock {
        doc /* One unit working, the others waiting; a waiting unit fails at dormancyFactor times failureRate; each switch-over works with probability switchSuccess. */
        attribute units : Integer[0..1];
        attribute dormancyFactor : Real[0..1];
        attribute switchSuccess : Real[0..1];
    }
    state def MarkovModel;
    state def MarkovState {
        doc /* A state of a Markov model (IEC 61165): failed states count in P(failed); degraded states work with reduced capability. */
        attribute failed : Boolean[0..1];
        attribute degraded : Boolean[0..1];
        attribute initialProbability : Real[0..1];
    }

    /* ---------- human factors and maintenance ---------- */
    part def CrewMember :> SafetyElement;
    action def CrewTask {
        attribute phase : String[0..1];
        attribute timeSeconds : Real[0..1];
        attribute reactionSeconds : Real[0..1];
        attribute executionSeconds : Real[0..1];
        attribute basis : String[0..1];
        attribute channels : String[0..1];
        attribute notes : String[0..1];
    }
    action def MaintenanceTask {
        attribute intervalHours : Real[0..1];
        attribute activeRepairHours : Real[0..1];
        attribute logisticsHours : Real[0..1];
        attribute adminHours : Real[0..1];
    }
}
