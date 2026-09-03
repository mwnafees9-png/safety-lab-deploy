---
title: "Aeolus HL-1 — Flight Deck & Human Factors Design Description"
subtitle: "AEO-HF-0001 · Issue 1 · 1 September 2026"
---

# Aeolus HL-1 — Flight Deck & Human Factors Design Description

**AEO-HF-0001 · Issue 1 · 1 September 2026**
Companion to AEO-SDD-0001 (Architecture & System Description Document), Issue 1.

> **FICTIONAL AIRCRAFT — DEMONSTRATION ARTICLE**
> The Aeolus HL-1 does not exist and is not any company's programme. No customer
> data of any kind appears in this document.
>
> Prepared by Safety Lab Aero.

---

## 1 Purpose and scope

AEO-SDD-0001 describes what each system is and what it draws on. It says little
about the one interface every system ultimately terminates at: the two people on
the flight deck.

This document supplies that missing description. It is the design input to the
human-factors assessment — function allocation, crew task analysis, human error
analysis, crew alerting, ergonomics, situation awareness, the §25.1302
controls-and-displays evaluation, and the §25.1523 minimum-flight-crew
determination.

It follows the same rule as the SDD: **it describes the design, and it stops
where the assessment begins.** §11 states precisely what it therefore does not
contain, and why that omission is deliberate.

### 1.1 Provenance convention

| Tag | Meaning |
|---|---|
| `[GIVEN]` | Fixed by the aircraft specification or by AEO-SDD-0001. Do not expect it to move. |
| `[PRELIM]` | Preliminary design data. Real, but not frozen. Cite as preliminary. |
| `[ASSUMED]` | Engineering assumption, recorded so it can be challenged. Not given to us. |
| `[TBD]` | A known gap, named rather than filled. |

Where a value the analyses need does not yet exist it is marked `[TBD]` and left
empty. **An empty field is the correct answer.** A plausible number substituted
for a missing one is worse than the gap, because the gap is visible and the
substitution is not.

---

## 2 Operating concept, as the crew experiences it

The mission characteristics in AEO-SDD-0001 §1.1 have consequences for the crew
that the SDD does not draw out. They are stated here as facts, not as findings.

| Characteristic | Value | Provenance |
|---|---|---|
| Sector length | 600 – 2,000 nm | `[GIVEN]` |
| Sector rate | 2 – 4 per week per airframe | `[GIVEN]` |
| Flight rules | IFR, low flight levels | `[GIVEN]` |
| Maximum operating altitude | FL260 | `[GIVEN]` |
| Crew complement carried | Nominal 2; provision for 4 | `[GIVEN]` |
| Hold occupancy in flight | None. Flight crew only. | `[GIVEN]` |
| Loading / unloading | A **ground** operation, aircraft on its own gear, ground supply, crew trained on type | `[GIVEN]` |
| Destination | Semi-prepared strip, project-built, not maintained to commercial standards | `[GIVEN]` |
| Turnaround | Hours, not minutes | `[GIVEN]` |
| Line maintenance at the strip | None | `[GIVEN]` |
| Dispatch decision | Taken at origin with outbound **and** return sectors considered together | `[GIVEN]` |

### 2.1 Three consequences worth stating plainly

**The payload is one item.** There is no averaging across a distributed load. A
restraint or centre-of-gravity problem is a whole-aircraft problem from the first
moment it exists. `[GIVEN]`

**The landing margin is the design.** The requirement is 1,800 m on a
semi-prepared surface against a predicted rollout of approximately 1,080 m. That
margin is what the braking and flotation design rests on, and it is consumed by
surface condition, by touchdown point, and by any delay in deceleration. `[GIVEN]`

**Dispatch is a two-sector decision.** With no maintenance at the far end, a
serviceability judgement made at origin governs the return leg as well. `[GIVEN]`

### 2.2 Flight phases

The programme phase vocabulary. Durations are the nominal split used for design
purposes; they are not a schedule. `[PRELIM]`

| Phase | Nominal duration (h) |
|---|---|
| Standing | 0.5 |
| Taxi | 0.15 |
| Takeoff | 0.05 |
| Climb | 0.45 |
| Cruise | 1.4 |
| Descent | 0.4 |
| Approach | 0.15 |
| Landing | 0.05 |

---

## 3 Crew stations and qualification

| Item | Value | Provenance |
|---|---|---|
| Pilot stations | 2, side by side | `[GIVEN]` |
| Additional seating | Provision for 4 occupants total on the flight deck | `[GIVEN]` |
| Oxygen mask stations | 4 | `[GIVEN]` |
| Operating convention | Pilot Flying / Pilot Monitoring, exchanged by sector or phase | `[ASSUMED]` |
| Kind of operation sought | IFR, day and night | `[GIVEN]` |

> **The two-crew figure is an input, not an answer.** AEO-SDD-0001 gives a
> nominal complement of two with provision for four. That is the specification's
> sizing assumption. The §25.1523 determination is made against the Appendix D
> basic workload functions and workload factors by the analysis, and may confirm
> the number, or challenge it. Nothing in this document performs that
> determination.

### 3.1 Qualification and training `[ASSUMED]`

- Type-rated pilots, current on type, drawn from a small dedicated pool flying
  repetitive point-to-point missions.
- Recurrent training is assumed to include the semi-prepared-strip approach and
  the outsized-load dispatch decision as named items.
- A flight-deck mock-up and a full-flight simulator are planned programme assets.
  No simulator campaign has been run. `[TBD]` — evidence dates.

---

## 4 Flight deck architecture and geometry

The flight deck sits **aft of the nose visor hinge line**, on a deck above the
forward hold. The entire nose section forward of the flight deck hinges upward
for loading. `[GIVEN]`

### 4.1 Consequences of the visor arrangement `[PRELIM]`

- The over-the-nose cut-off angle is set by the visor structure and its hinge, not
  by a conventional windshield lower sill.
- Eye height above ground is that of a high-wing freighter on a 20-tyre gear —
  substantially above a conventional transport.
- The flight deck is the reference point for the door lock **mechanical visual
  indicator** described in §8.3, which is read from inside the flight deck.


\begin{landscape}
\begin{center}
\includegraphics[width=\linewidth,height=0.92\textheight,keepaspectratio]{fig_aeolus_flightdeck.pdf}
\end{center}
\vspace{-4mm}
\noindent\small\textbf{Figure HF-1} — Flight deck panel arrangement. Panel zones, display and control positions [PRELIM]. Also issued as a standalone drawing sheet.\normalsize
\end{landscape}

### 4.2 Panel zones `[PRELIM]`

| Zone | Contents |
|---|---|
| Glareshield | Master Warning / Master Caution; autoflight mode control; display source selection; engine fire handles |
| Main instrument panel | Four display units; two head-up displays; integrated standby instrument |
| Centre pedestal | Four thrust levers with reversers; flap, speedbrake, trim; radios; flight-management control units; cargo and door control panel |
| Overhead | Electrical, hydraulic (A/B/C), fuel, bleed and pressurisation, ice protection, fire protection, oxygen, lighting |
| Side consoles | Nose-wheel tiller (left seat), seat controls, oxygen mask stowage |


\begin{landscape}
\begin{center}
\includegraphics[width=\linewidth,height=0.92\textheight,keepaspectratio]{fig_aeolus_cockpit_ga.pdf}
\end{center}
\vspace{-4mm}
\noindent\small\textbf{Figure HF-2} — Cockpit general arrangement, plan and side section. Dimensions [PRELIM]; the drawing defines the geometry reference scheme, not the open items. Also issued as a standalone drawing sheet.\normalsize
\end{landscape}

### 4.3 Geometry data `[TBD]`

Required by the ergonomics and controls-and-displays analyses; **not yet
defined**:

1. Design Eye Position and eye-reference-point tolerance
2. External vision envelope — over-nose, over-side, and cut-off angles past the visor
3. Head-up display eyebox and its relationship to the DEP
4. Reach envelope to each panel zone from the seat design position
5. Seat adjustment ranges and the seat-to-DEP alignment aid
6. Flight-deck access and emergency egress routing

---

## 5 Anthropometry and accommodation

| Item | Value | Provenance |
|---|---|---|
| Accommodation range | 5th percentile female to 95th percentile male, mixed-gender | `[ASSUMED]` |
| Anthropometric database | `[TBD]` — not selected | |
| Clothing / equipment state | Normal flight clothing; no cold-weather bulk case defined | `[TBD]` |
| Demonstration method | Mock-up, digital human model, or both | `[TBD]` |

---

## 6 Display suite

Per AEO-SDD-0001 §5.11. `[GIVEN]` unless noted.

| Element | Provision |
|---|---|
| Display units | 4, driven by 3 display processing units on a dual-redundant deterministic network |
| Head-up displays | 2 |
| Format flexibility | **Any display unit can present any format** |
| Reference data | 3 air data inertial reference units — two on main buses, one on the DC essential bus |
| Navigation | 2 flight management computers; dual radio and satellite navigation; dual radio altimeters; weather radar |
| Standby | Independent integrated standby attitude, airspeed and altitude on the DC essential bus, sharing **no** supply, sensor or processing with the primary displays |

### 6.1 Reconfiguration behaviour `[GIVEN]`

- **Reversionary display selection is manual.** The crew selects the source.
- **Network reconfiguration is automatic.** The crew does not.

That split — one automatic, one manual, in the same system, in the same failure
— is stated here as design fact. What it means for the crew is for the analyses.

### 6.2 Display content `[PRELIM]`

Formats available for selection to any unit:

- Primary flight: attitude, airspeed, altitude, vertical speed, heading, autoflight mode annunciation
- Navigation: map, route, terrain, weather radar
- Engine and alerting: four-engine parameters and the consolidated crew alert list with associated procedures
- Systems synoptics: electrical, hydraulic A/B/C, fuel, bleed and pressurisation, ice protection
- **Payload page:** strap tension at each of the nine saddle stations, saddle engagement, computed centre of gravity against the certified envelope, hold pressure schedule
- **Door page:** visor position, latch state, and lock state on the proximity sensing channel

### 6.3 Not defined `[TBD]`

7. Measured luminance, contrast and sunlight-readability performance
8. Which format each unit shows by default, per phase
9. Behaviour on loss of one, two, then all three display processing units
10. Head-up display symbology set and its declutter logic

---

## 7 Controls

\begin{landscape}
\begin{center}
\includegraphics[width=\linewidth,height=0.92\textheight,keepaspectratio]{fig_aeolus_controls.pdf}
\end{center}
\vspace{-4mm}
\noindent\small\textbf{Figure HF-3} — Flight deck control layout. Control type, position and guarding; tag numbers key to the Appendix C control schedule. Also issued as a standalone drawing sheet.\normalsize
\end{landscape}


`[PRELIM]` unless noted.

### 7.1 Flight path and thrust

- Two control columns and wheels; rudder pedals with toe brakes
- Pitch trim: wheel-mounted switches and a pedestal trim wheel
- Nose-wheel tiller, **left seat only**
- Flap lever, detented; speedbrake lever
- **Four thrust levers**, mechanically independent, with reverse levers `[GIVEN]`
- Autothrottle engage/disengage on the levers

> Four engines on a 28.0 m outboard moment arm (0.35 of the 80.0 m semi-span)
> `[GIVEN]`. Identification of which powerplant has failed, and the control
> response to it, is a design case at takeoff. This document records the geometry;
> it does not analyse the task.

### 7.2 Systems

Overhead panel organised by system on a dark-cockpit philosophy: an unlit panel
is the normal configuration. `[PRELIM]`

### 7.3 Payload and door controls

A cargo and door control panel on the pedestal provides visor open / close /
latch / lock commands and restraint winch control. `[PRELIM]`

- The visor is operable from the flight deck and from an external ground panel `[ASSUMED]`
- Interlocks between the two control positions `[TBD]`
- Whether visor operation is inhibited by any flight-state signal `[TBD]`

### 7.4 Control-actuation data `[TBD]`

11. Breakout forces, control travel, detent forces
12. Actuation direction conventions
13. Guarding and locking provisions for irreversible actions

---

## 8 Crew alerting

This section describes the alerting system's **capability**. It does **not**
assign a priority to any condition — that population is an analysis output.

### 8.1 Capability `[GIVEN]`

| Property | Provision |
|---|---|
| Architecture | Two independent processing channels consolidate **every** system's status into a **single** prioritised crew alert list |
| Procedures | Each alert carries its associated procedure |
| Presentation | Alert list on a display unit; Master Warning and Master Caution on the glareshield, both pilots |
| Aural | `[TBD]` — inventory, precedence and output-path arbitration are not defined |
| Tactile | `[TBD]` — stall warning means not stated in the SDD |

### 8.2 Philosophy `[ASSUMED]`

- Alerts ordered by urgency of required crew response, not by system of origin
- One condition, one alert; the consolidation rule where several systems detect
  the same condition is `[TBD]`
- Phase-dependent inhibits during takeoff and landing: windows and inhibited set `[TBD]`

### 8.3 Two indications that are not on a display `[GIVEN]`

These are stated in AEO-SDD-0001 and matter disproportionately to the crew
interface:

- **Nose door lock — mechanical visual indicator.** Lock engagement is sensed by
  two dissimilar, independently routed means: a proximity sensing harness reading
  pin position, **and a mechanical linkage driving a visual indicator visible from
  inside the flight deck.** The second is not a display and cannot fail with the
  avionics.
- **Crew oxygen cylinder pressure** is displayed continuously and is a **dispatch
  item**.

### 8.4 Two conditions the SDD singles out `[GIVEN]`

Stated as design facts. Their classification and their crew response are for the
analyses:

- Loss of tension on **any** strap is annunciated in flight.
- Loss of tension on **two adjacent** saddle stations is annunciated as a
  restraint condition requiring immediate attention.

---

## 9 Automation

`[PRELIM]` unless noted.

- Autopilot and autothrottle commanded by the avionics system `[GIVEN]`
- Lateral and vertical navigation coupled to the flight management function
- Flight director on both primary flight formats and both head-up displays

Not defined `[TBD]`:

14. Mode annunciation set; transition and reversion annunciation
15. Envelope protection — whether provided, in which axes
16. Automatic autopilot disconnect condition set, and its alerting
17. Autoflight behaviour on loss of a display processor, a hydraulic system, or an engine
18. Whether gains or limits schedule on payload configuration — a 105 m, 72.6 t single item has an inertia distribution unlike a distributed load

---

## 10 Procedures, environment and crew-relevant interfaces

### 10.1 Procedures `[PRELIM]`

> **Appendix A and Appendix B carry the procedures themselves** — a normal
> operating sequence phase by phase, and an emergency and abnormal set, written
> out from the architecture so the task, error and workload analyses have a
> concrete input. Read §A.1 first: AEO-SDD-0001 contains no procedures, so
> everything in the appendices is constructed and is `[ASSUMED]` unless the
> system behaviour it rests on is marked otherwise.

- Normal and non-normal procedures presented with their alerts on the alerting display `[GIVEN]`
- A paper quick-reference handbook is carried as the backup medium `[ASSUMED]`
- Memory (recall) item set `[TBD]`
- **Take-off configuration monitor:** restraint status is an input to it `[GIVEN]`. Its full parameter set is `[TBD]`
- Loading is a ground operation; the handover point between the loading crew and
  the flight crew, and the cross-checks at it, are `[TBD]`

### 10.2 Environment `[TBD]` throughout

19. Ambient noise — cruise, and semi-prepared ground operations
20. Vibration, including hold resonance with a 105 m item
21. Lighting levels and independence of lighting supplies
22. Low-sun approach to an unlit strip — a design case with no measured data
23. Dust and brownout ingress to the flight deck on the ground roll

### 10.3 Crew-relevant system characteristics

From AEO-SDD-0001. The characteristic listed is the one that reaches the crew.

| System | Characteristic | Provenance |
|---|---|---|
| Propulsion | 4 engines; 28.0 m outboard moment arm; asymmetric identification is a takeoff design case | `[GIVEN]` |
| Flight Controls | Consumes HYD A/B/C, EPS, AVI | `[GIVEN]` |
| Hydraulic | Three independent systems A/B/C | `[GIVEN]` |
| Electrical | Four 150 kVA generators plus APU; DC essential bus carries one ADIRU and the standby instrument | `[GIVEN]` |
| Avionics | 4 displays + 2 HUDs, 3 processors, dual network; manual reversion, automatic network reconfiguration | `[GIVEN]` |
| ECS | Flight deck at conventional cabin altitude; **hold at low differential only**, approx.  8,800 m equivalent | `[PRELIM]` |
| Crew Oxygen | 2 cylinders, crossover, **4 quick-donning full-face masks with integral smoke goggles**; sized for 4 occupants for the diversion time at maximum operating altitude | `[GIVEN]` |
| Nose Cargo Door | 12 latches on a common torque shaft; 8 independent locking pins on a separate actuator and separate hydraulic supply; dual dissimilar lock sensing; **pressure interlock confirms < 0.1 psi residual before unlock will run** | `[GIVEN]` |
| Cargo Restraint | 9 saddles x 2 straps; electric winches, mechanically locked; continuous tension monitoring; single instrumented loop | `[GIVEN]` |
| Fire Protection | Glareshield fire handles; **hold has smoke detection at nine stations and no suppression** | `[GIVEN]` |
| Landing Gear | 1 nose + 6 main bogies, 20 tyres; semi-prepared surface operation | `[GIVEN]` |

---

## 11 What this document does not do

This document is written the way a flight-deck design description is written, and
it stops where such a document stops.

It tells you what the crew is given to look at, what they can touch, what the
aircraft will tell them and by what means, and under what conditions they will be
doing it. It does **not** tell you:

- which functions are allocated to the crew, to automation, or to both;
- what tasks the crew perform, in what order, in what time, at what workload;
- what the crew can get wrong, how it would be detected, or how it would be recovered;
- which condition produces a Warning, a Caution or an Advisory;
- what the crew must know at each stage of flight, or whether the flight deck lets them know it;
- whether any of the above is adequate, compliant, or acceptable;
- what the minimum flight crew is.

That omission is deliberate and it is not a gap. Deriving those things is the
work. Reading that reversion is manual while network reconfiguration is automatic
implies something about mode awareness; that a door lock has a mechanical
indicator readable from the flight deck is a barrier whose use has to be designed
into a procedure and then analysed; that a single instrumented tension loop
covers nine saddles is a claim about detection coverage that has to be tested
rather than assumed; that an aural precedence order which does not yet exist
cannot be relied on by any analysis that assumes the crew hears the right thing
first.

### 11.1 Given, preliminary, assumed

**Given** — from the specification or AEO-SDD-0001: crew complement of two with
provision for four; hold unoccupied in flight; loading as a ground operation;
FL260; 4 display units and 2 HUDs on 3 processors with manual reversion and
automatic network reconfiguration; the independent standby instrument on the DC
essential bus; the two-channel consolidated alert list with associated
procedures; dual dissimilar door-lock sensing including the mechanical
flight-deck indicator; the door pressure interlock at 0.1 psi; nine saddles with
two straps each and continuous tension monitoring; the two annunciated restraint
conditions; four masks sized for the diversion at maximum operating altitude;
oxygen pressure as a dispatch item; hold smoke detection without suppression.

**Preliminary** — expected to move: hold pressurisation differential; phase
durations; panel-zone allocation; display format assignment.

**Assumed** — everything else in this document, including the PF/PM convention,
the dark-cockpit philosophy, the accommodation range, the paper QRH backup, and
the alerting ordering philosophy. Each should be recorded as an assumption when
it is picked up, and challenged.

### 11.2 The open items

Numbered through §4 to §10 and repeated here for tracking: 1–6 geometry and
access; 7–10 displays; 11–13 control actuation; aural inventory and precedence,
tactile provision, consolidation rule and inhibit windows in §8; 14–18
automation; 19–23 environment; plus memory items, take-off configuration monitor
parameters, and the loading handover in §10.1. Items 24–38 are raised by the
procedures and are collected at §A.9 and §B.16.

Any human-factors conclusion that depends on one of these is provisional on it,
and should say so.

---

# Appendix A — Normal operating procedures

## A.1 What these procedures are, and what they are not

AEO-SDD-0001 contains no procedures. It describes an architecture. Everything in
Appendix A and Appendix B is therefore **constructed from that architecture** —
it is the operating sequence the design implies, written out so that the human
factors work has something concrete to analyse instead of inferring a procedure
from a schematic every time it needs one.

That has three consequences, and they should be read before any of the steps
below are used.

**These are not an approved AFM or POH.** No flight test has been flown, no
procedure has been validated in a simulator, and no operator has reviewed them.
Their status is `[ASSUMED]` unless a step is marked otherwise, and a step marked
`[GIVEN]` is given only as to the *system behaviour* it rests on, not as to the
crew action, the wording or the sequence.

**Speeds, times, quantities and altitudes are deliberately absent.** Where a real
procedure would say "at 400 ft" or "below 250 kt" or "within 2 minutes", these
say `[TBD]`. Inventing a number here would be worse than leaving the hole, because
a number in this document would be cited downstream as though it came from the
design. The holes are the honest output; §A.9 and §B.16 collect them.

**No task analysis has been performed on them.** These procedures state what the
crew does. They do not state how the task decomposes, which steps are vulnerable
to which error, what the workload is at any point, or whether the division of duty
is the right one. That is the work the analyses do, and this appendix exists to
give them an input, not to pre-empt them.

A procedure that reads as obviously wrong is a finding worth raising against the
design, not a typo to correct silently.

## A.2 Crew complement and duty split `[ASSUMED]`

Two pilots, Pilot Flying and Pilot Monitoring, exchanged by sector. The flight
deck seats four; the two additional stations are not assigned a role in any
normal procedure below, and whether a sector is ever flown with more than two
active crew is `[TBD]`.

Duties follow the conventional split: PF controls flight path and thrust and
commands configuration changes; PM operates the configuration controls, reads
checklists, works the alerting list, handles communications and monitors. The
left-seat pilot has the nose-wheel tiller and therefore has the taxi task
regardless of who is PF `[GIVEN]` — the tiller is a left-seat control, and this
is the one asymmetry in the flight deck that a procedure cannot write around.

**Ground crew are a separate party.** Loading and unloading are ground operations
conducted by a crew trained on the type, with the aircraft powered from a ground
supply `[GIVEN]`. The flight crew's relationship to that crew is a handover, not
a supervision, and the point at which responsibility for the payload passes from
one to the other is `[TBD]` — open item 24.

## A.3 Checklist medium and philosophy `[ASSUMED]`

Normal and non-normal procedures are presented with their alerts on the alerting
display `[GIVEN]`. A paper quick-reference handbook is carried as the backup
medium. Normal checklists are challenge-and-response, read by PM. Whether normal
checklists are also presented electronically, and whether the electronic
presentation tracks completion, is `[TBD]`.

The overhead panel is dark-cockpit: an unlit panel is the normal configuration
`[PRELIM]`. Normal procedures below therefore do not enumerate switch positions
that the dark-cockpit convention already implies; they name only the selections
that are actively made.

## A.4 Ground procedures before the payload

### A.4.1 Flight deck preparation and power-up

The aircraft is powered from a ground supply at two receptacles `[GIVEN]`, or
from the APU.

1. Ground power or APU generator — established. Bus configuration is automatic
   and is not annunciated unless a source is lost `[GIVEN]`.
2. Battery master — ON. DC essential bus and hot battery bus energised.
3. Displays — four display units, two head-up displays, three display processors
   `[GIVEN]`. Confirm all four units present a picture and that reversionary
   selection is available.
4. Integrated standby instrument — attitude, airspeed, altitude present. This
   instrument shares no supply, no sensor and no processing with the primary
   displays `[GIVEN]`; confirming it separately is the point of it.
5. Crew oxygen — cylinder pressure checked against the dispatch minimum. Pressure
   is displayed continuously and is a dispatch item `[GIVEN]`. Dispatch minimum
   is `[TBD]`.
6. Masks — four stations, quick-donning, full-face with integral smoke goggles
   `[GIVEN]`. Each station checked for flow and for microphone continuity.
7. Fire detection — dual-loop test on each nacelle and the APU compartment. A
   single loop failure degrades the AND logic to single-loop and is annunciated
   as a fault `[GIVEN]`.
8. Alerting list — confirm no open alerts, or account for each.
9. Hold smoke detection — nine stations along the hold `[GIVEN]`. Confirm all
   nine reporting. **There is no hold suppression** `[GIVEN]`; the detection
   check is the whole of what the crew has.
10. Flight management — route, then the loading plan when it arrives from the
    ground system.

### A.4.2 Exterior inspection `[ASSUMED]`

A conventional walkaround, with four items particular to this aircraft.

The **visor hinge line and seal** are inspected along their full circumference.
The visor is the entire nose section forward of the flight deck, it is a single
load path, and it is treated as structure `[GIVEN]` — there is no redundancy in
the door structure itself.

The **mechanical lock indicator linkage** is inspected where it is accessible.
This is the second, dissimilar lock-sensing path, and it drives an indicator
visible from inside the flight deck `[GIVEN]`. Its value depends on it being
independent of the proximity harness; an inspection that treats it as decoration
defeats it.

**Twenty tyres** on one twin-wheel nose unit and six three-wheel main bogies
`[GIVEN]`, inspected for the condition a semi-prepared surface produces rather
than the condition a paved apron produces. Tyre pressures are displayed
`[GIVEN]`; the walkaround is looking for cuts, foreign object damage and
sidewall condition. Gear leg and bogie count are preliminary design data and are
not frozen `[GIVEN]`.

**Brake condition and residual temperature.** Brake temperature is monitored
continuously and a turnaround limit is displayed `[GIVEN]`. On a turnaround at a
strip with no line maintenance, the displayed limit is the only brake
serviceability information the crew has.

### A.4.3 Dispatch decision `[GIVEN]` as to the constraint, `[ASSUMED]` as to the procedure

The operating concept assumes no line maintenance capability at the strip, and
dispatch decisions are therefore taken at the origin with the outbound and
return sectors considered together `[GIVEN]`.

Before the aircraft is loaded, the crew and the operator establish that the
airframe as it stands can complete both sectors under the minimum equipment
list. A deferral that is acceptable outbound and unacceptable inbound is not
acceptable. The MEL itself is `[TBD]`, and the procedural form of this decision —
who makes it, against what document, and at what point it is recorded — is
`[TBD]`, open item 25.

## A.5 Loading `[GIVEN]` as to the system, `[ASSUMED]` as to the sequence

Loading is a ground procedure with the aircraft on its own gear and powered from
a ground supply `[GIVEN]`. The design payload is one wind-turbine blade of up to
105 m and 72.6 t occupying the full 108 m hold length; alternative cases are two
95 m blades or three 80 m blades nested `[GIVEN]`.

### A.5.1 Opening the visor

The visor is operated from a **ground handling panel** with the aircraft on
jacks or on its gear, and cannot be operated in flight `[GIVEN]`. AEO-HF-0001
§7.3 records a pedestal cargo and door panel as `[PRELIM]`; the authority
relationship between the two control positions is `[TBD]`, open item 13, and
these steps are written from the ground panel.

1. Hold pressurisation — confirm vented. The door cannot be opened with the hold
   pressurised: a pressure interlock vents and confirms residual differential
   below 0.1 psi before the lock actuator will run `[GIVEN]`.
2. Locking pins — eight pins withdrawn by the lock actuator on its own hydraulic
   supply `[GIVEN]`.
3. Latches — twelve rotary latches released on the common torque shaft `[GIVEN]`.
4. Visor — OPEN. Hydraulic from system A, electric backup drive available
   `[GIVEN]`. Time to open, and whether the electric backup is a normal or an
   abnormal selection, are `[TBD]`.
5. Both lock-sensing indications — confirm consistent with OPEN. The proximity
   harness and the mechanical indicator are dissimilar and independently routed
   `[GIVEN]`; a disagreement between them at this point is an abnormal condition
   and is handled at §B.9.

### A.5.2 Positioning and restraining the blade

1. Saddles — nine at fixed stations, pinned to hard points in the hold floor
   beam structure, each with an adjustable conforming interface set to the blade
   profile `[GIVEN]`. Set and pinned before the item enters the hold.
2. Blade — positioned along the hold axis. The blade cannot be divided, cannot
   be flexed beyond narrow limits, and must be loaded along the axis of the hold
   `[GIVEN]`. Longitudinal position tolerance is `[TBD]`.
3. Saddle engagement — confirmed at all nine stations. Lateral and vertical
   restraint is by the saddle geometry itself `[GIVEN]`; if a saddle is not
   engaged, the blade is not restrained laterally at that station regardless of
   strap tension.
4. Straps — two tension straps per saddle, tensioned by electric winches and
   locked mechanically `[GIVEN]`. Eighteen straps in total.
5. Tension monitoring loop — confirm every strap reporting and within band.
   Target tension and band are `[TBD]`.
6. Weight and balance — payload mass and distribution feed the centre-of-gravity
   computation `[GIVEN]`. Loading plan and W&B data come from the ground system.

There is no redundancy in the hold floor hard points, and the tension monitoring
loop is a single instrumented loop whose coverage is a recorded item `[GIVEN]`.
Neither fact changes a step above; both change what a step is worth.

### A.5.3 Closing the visor

1. Hold — clear of personnel and equipment. Confirmation method `[TBD]`.
2. Visor — CLOSE.
3. Latches — twelve engaged.
4. Locking pins — eight driven through the latch bodies, so that the latches
   cannot back-drive while the pins are engaged `[GIVEN]`.
5. **Both** lock indications — proximity harness and mechanical visual indicator,
   independently confirmed. Confirming one and inferring the other is the failure
   this arrangement exists to prevent.
6. Lock status is displayed on the flight deck at all times and is an input to
   the take-off configuration monitor `[GIVEN]`.

### A.5.4 Handover to the flight crew

The handover point between the loading crew and the flight crew, and the
cross-checks made at it, are `[TBD]` — open item 24, and the largest procedural
hole in this appendix. What passes across it, at minimum, is: saddle engagement
at nine stations, tension at eighteen straps, visor lock state on both sensing
paths, final mass and centre of gravity, and hold clear.

## A.6 Departure

### A.6.1 Before start

1. Loading and restraint — confirmed complete and handed over (§A.5.4).
2. Fuel — quantity and distribution across six wing tanks plus centre tank
   `[GIVEN]`. Transfer and cross-feed are scheduled automatically to hold centre
   of gravity and wing bending within limits without crew action `[GIVEN]`;
   confirm the automatic schedule is active and the initial distribution matches
   the plan.
3. Take-off performance — landing distance requirement at the destination is
   1,800 m on a semi-prepared surface `[GIVEN]`. Take-off data for the departure
   field is `[TBD]`.
4. Take-off briefing — including the engine-failure case. Asymmetric thrust from
   an outboard engine at the 28.0 m moment arm is the sizing case for directional
   control `[GIVEN]`, and the briefing names which engine, which side, and the
   intended action at and after V1.
5. Doors and hold access — closed. Portable extinguishers at the flight deck and
   the hold access door — present `[GIVEN]`.

### A.6.2 APU and engine start

1. APU — start. The APU generator can supply any main bus on the ground and in
   flight `[GIVEN]`.
2. Ground power — disconnected.
3. Bleed — APU bleed for starting, or a cross-bleed `[GIVEN]`.
4. Engines — started in sequence. Engines are numbered 1 to 4 from left outboard
   to right outboard `[GIVEN]`. Start sequence is `[TBD]`.
5. Each engine — dual-channel FADEC healthy, both channels. The four FADEC
   channels take power from four different sources, arranged so that no single
   bus loss can affect more than one engine `[GIVEN]`.
6. Generators — four 150 kVA variable-frequency generators on line.
7. Hydraulics — system A pressurised from the engine-driven pumps on engines 1
   and 2, system B from engines 3 and 4, system C from its two AC electric motor
   pumps `[GIVEN]`. Three pressures, three quantities.

### A.6.3 After start and before taxi

1. Flight controls — full and free. Three dissimilar flight control computers
   voting on command, each supplied from a different electrical source `[GIVEN]`;
   confirm normal control law and no degraded-law annunciation.
2. High-lift — flaps set for take-off. Double-slotted Fowler flaps in four
   sections and full-span slats, driven by two independent power drive units
   through a common torque shaft with asymmetry brakes at each section `[GIVEN]`.
3. Ice protection — as required. Automatic or manual; in automatic, detection
   commands the system on `[GIVEN]`. The performance penalty of wing anti-ice in
   use is applied automatically to the displayed performance `[GIVEN]` — the crew
   does not apply it by hand and should not.
4. Pressurisation — automatic. Flight deck at a conventional cabin altitude, hold
   at a low differential only, currently sized to approximately 8,800 m hold
   altitude equivalent `[GIVEN]`, preliminary and not frozen.
5. Restraint — eighteen strap tensions in band, nine saddles engaged.
6. Visor lock — both indications.
7. Take-off configuration monitor — no discrete. Restraint status is an input to
   it `[GIVEN]`; its full parameter set is `[TBD]`, open item 15.

### A.6.4 Taxi

Taxi is a left-seat task: the tiller is a left-seat control `[GIVEN]`. Nose wheel
steering is hydraulic, commanded from tillers and rudder pedals, with a
mechanical disconnect for towing `[GIVEN]`.

1. Brakes — checked. Normal braking from system B, alternate from system A
   `[GIVEN]`.
2. Taxi speed and turn radius — `[TBD]`. A 160.0 m span and a 119.4 m length on a
   semi-prepared surface make ground manoeuvring a design case in its own right,
   and no clearance or radius data exists yet.
3. Brake temperature — monitored. A turnaround limit is displayed `[GIVEN]`.

### A.6.5 Before take-off

1. Take-off configuration monitor — clear.
2. Flight controls, high-lift position, stabiliser trim — set and confirmed.
3. Restraint and visor lock — final confirmation. These two are on the take-off
   configuration check because they are the two conditions under which the
   aircraft should not fly and everything else can look normal.
4. Thrust reversers — armed as applicable. Reversers are fitted to the two
   **inboard** engines only, and deployment is inhibited in flight by
   weight-on-wheels and radio-altimeter agreement, with a mechanical lock at the
   translating sleeve `[GIVEN]`.

### A.6.6 Take-off and initial climb

1. Thrust — set. Four thrust levers, mechanically independent, with autothrottle
   `[GIVEN]`.
2. V-speeds — `[TBD]`.
3. Rotation and initial climb — flown on the head-up displays or the primary
   displays; which is primary for the take-off task is `[TBD]`, open item 8.
4. Gear — UP. Retraction and extension by hydraulic system A `[GIVEN]`.
5. High-lift — retracted on schedule.
6. Envelope protection — active in the normal control law `[GIVEN]`.

The engine-out case is at §B.2.

## A.7 Cruise

The aircraft flies point-to-point sectors of 600 to 2,000 nm under IFR in the low
flight levels `[GIVEN]`. Maximum operating altitude is FL260 `[GIVEN]`, limited
by the low pressurisation differential to which the hold is designed. The nominal
cruise segment is 1.4 h `[PRELIM]`.

The cruise workload is largely monitoring. Four things are monitored that a
conventional freighter does not monitor:

1. **Restraint tension**, continuously, at eighteen straps. In flight the crew
   has indication only; there is no in-flight adjustment of restraint `[GIVEN]`.
   Loss of tension on any strap is annunciated; loss on two adjacent stations is
   annunciated as a restraint condition requiring immediate attention `[GIVEN]`.
   The crew action on either is at §B.10.
2. **Fuel distribution.** Transfer and cross-feed are automatic `[GIVEN]`.
   Imbalance between left and right wings is annunciated at 1,200 kg and is
   limited structurally to 3,000 kg `[GIVEN]`. The margin between annunciation
   and structural limit is the whole of the crew's response time, and it is not
   expressed in minutes anywhere — `[TBD]`.
3. **Hold smoke detection**, nine stations, with no suppression available
   `[GIVEN]`.
4. **Hold differential.** The hold is pressurised to a low differential only.
   The flight deck and the hold are separate conditioning zones `[GIVEN]`, and
   the two can diverge.

Routine cruise selections: pack configuration and bleed source, ice protection
mode, and manual cross-feed or tank isolation if the automatic schedule is
overridden `[GIVEN]`. There is no routine crew action in normal flight for
pressurisation, hydraulics, electrics or fuel `[GIVEN]`.

## A.8 Arrival

### A.8.1 Descent and approach preparation

1. Destination assessment — the destination is a semi-prepared strip constructed
   for the project and not maintained to commercial standards `[GIVEN]`. Surface
   condition, and the means by which the crew learns it before commitment, are
   `[TBD]`, open item 26.
2. Landing performance — landing distance requirement 1,800 m; predicted rollout
   at maximum landing weight approximately 1,080 m `[GIVEN]`. **The margin
   between those two numbers is the operating margin on which the braking and
   flotation design rests** `[GIVEN]`. Maximum landing weight is 318,000 kg.
3. Approach briefing — including the go-around, the braking configuration and the
   autobrake selection.
4. Ice protection — as required for the approach.

### A.8.2 Approach

1. Gear — DOWN. Downlock status is sensed by two independent proximity circuits
   per unit `[GIVEN]`; the indication is a comparison, not a single circuit's
   word.
2. High-lift — landing configuration.
3. Autobrake — set. Autobrake is available `[GIVEN]`; the selection logic and the
   levels are `[TBD]`.
4. Approach to an unlit or partially lit strip, and low-sun approach, are named
   design cases with no measured data `[GIVEN]` — open item 22.

### A.8.3 Landing and rollout

1. Touchdown, spoilers, reverse. Reverse is available on the two inboard engines
   only `[GIVEN]`; directional and deceleration behaviour with two-engine reverse
   on a semi-prepared surface is `[TBD]`.
2. Braking — anti-skid operates per wheel pair `[GIVEN]`.
3. Rollout is flown against a 1,800 m requirement with approximately 1,080 m
   predicted. Any degradation of braking is assessed against that margin and not
   against a runway length.
4. Brake temperature — monitored through rollout and taxi-in.

### A.8.4 After landing, shutdown and turnaround

1. High-lift, spoilers, ice protection — retracted or off.
2. Taxi in — left seat, tiller.
3. APU — started before generator shutdown as required.
4. Engines — shut down. There is no crew action required to isolate an engine
   other than to close the associated fuel shut-off and fire handle `[GIVEN]`.
5. Brake temperature — checked against the displayed turnaround limit `[GIVEN]`.
   With no line maintenance at the strip, an over-limit brake set is a dispatch
   problem with no local remedy.
6. Hold — depressurised before any visor operation (§A.5.1).
7. Unloading — the reverse of §A.5, conducted by the ground crew with the
   aircraft powered from a ground supply. Turnaround is measured in hours rather
   than minutes `[GIVEN]`.
8. Securing — battery, external power, APU as applicable. The APU fire bottle
   discharges automatically on detection with the aircraft unattended `[GIVEN]`;
   the definition of "unattended", and how the crew arms or confirms that state,
   is `[TBD]`.

## A.9 Normal-procedure open items

These are the holes in Appendix A specifically. They are additional to the
twenty-three items in §11.2 and continue that numbering.

24. **Loading handover.** The point at which responsibility for the payload
    passes from the loading crew to the flight crew, what is transferred, and
    what is independently re-checked rather than accepted (§A.5.4).
25. **Dispatch decision procedure.** Who decides, against what document, at what
    point, that the airframe can complete both sectors with no line maintenance
    at the far end (§A.4.3). The MEL does not exist.
26. **Destination surface assessment.** How the crew establishes the condition of
    a semi-prepared strip before it is committed to it (§A.8.1).
27. **Normal checklist medium and completion tracking.** Whether normal
    checklists are electronic, paper, or both, and whether completion is tracked
    by the aircraft (§A.3).
28. **Speeds, times and quantities throughout.** V-speeds, flap and gear
    schedules, autobrake levels, taxi limits, target strap tension and band,
    dispatch oxygen minimum. Every one of these is `[TBD]` and each is marked at
    the step that needs it.
29. **Which display is primary for the take-off and approach task** — head-up or
    head-down (§A.6.6, and §6.2 of the main document).

---

# Appendix B — Emergency and abnormal operating procedures

## B.1 Convention

The alerting system consolidates every system's status into a single prioritised
crew alert list **with associated procedures**, driven by two independent
processing channels `[GIVEN]`. The normal path for a non-normal condition is
therefore: alert appears, crew acknowledges, the associated procedure is read
from the list and actioned.

Two categories sit outside that path.

**Memory (recall) items** are actioned before any list is read. The memory item
set is `[TBD]` — open item 14 — and §B.2 offers candidates, not a set. A memory
item set is a workload decision as much as a safety one, and proposing it here
would be exactly the pre-emption this document avoids elsewhere.

**Conditions with no procedure** are conditions the design does not resolve and
the crew must. They are marked in the text and collected at §B.16.

Steps below are written PM-actioned unless the step is a flight-path action.
Guarded and irreversible controls are named as such where the design states a
guard; where it does not, the guarding provision is `[TBD]` — open item 13
applies throughout Appendix B.

## B.2 Candidate memory items `[TBD]`

Offered for the analysis to accept, reject or extend. None of these is
established.

- Engine fire or severe damage — thrust lever, fuel shut-off, fire handle
- Rapid depressurisation — masks, then descent
- Smoke or fumes in the flight deck — masks and goggles, then isolation
- Restraint loss at two adjacent stations — flight-path limitation before
  anything else (§B.10)
- Unlocked visor indication in flight (§B.9)

The last two are on this list because they are conditions where the correct first
action is a change to how the aircraft is flown, and a read-and-do procedure
reaches that action too late to be the first thing done. Whether that reasoning
survives analysis is not settled here.

## B.3 Propulsion

### B.3.1 Engine fire, on the ground or in flight

Detection is dual-loop and continuous, with AND logic between the loops for
warning, degrading to single-loop logic on loss of one loop `[GIVEN]`.

1. Thrust lever (affected engine) — CLOSE.
2. Fuel shut-off — CLOSED.
3. Fire handle — PULLED. There is no crew action required to isolate a failed
   engine other than these `[GIVEN]`.
4. Extinguisher — DISCHARGE. Two bottles per engine pair, cross-plumbed so that
   either bottle can discharge into either nacelle of the pair `[GIVEN]`. Time
   between first and second discharge is `[TBD]`.
5. If the warning persists after both bottles of the pair — no further
   extinguishing is available for that pair. Land as soon as possible.

Note what pulling a fire handle costs: that engine's generator, its
engine-driven hydraulic pump, and its bleed contribution. Engines 1 and 2 pump
hydraulic system A; engines 3 and 4 pump system B `[GIVEN]`. Shutting down 1 and
2 leaves system A on the power transfer unit alone.

### B.3.2 Engine failure at or after V1

The aircraft is designed to continue to a suitable aerodrome following the loss
of any one engine at or after V1 `[GIVEN]`.

1. Directional control — maintained. Asymmetric thrust from an outboard engine at
   the 28.0 m moment arm is the sizing case, and it sets both rudder area and the
   split-segment arrangement `[GIVEN]`.
2. Rotate, climb on the engine-out profile — `[TBD]`.
3. Identify and confirm the failed engine. **Which of four** has failed is the
   identification task, and the geometry makes an outboard failure and an inboard
   failure different problems `[GIVEN]`. No procedure resolves this; the crew's
   means of identification is a design question — §B.16.
4. Secure the engine when the flight path permits: thrust lever, fuel shut-off,
   fire handle if indicated.
5. Continue to a suitable aerodrome. The FADEC protects against overspeed and
   overtemperature without crew intervention `[GIVEN]`; there is no crew action
   for those.

### B.3.3 Engine failure in cruise

As §B.3.2 without the time pressure. Drift-down, if required, is against a
maximum operating altitude of FL260 `[GIVEN]`; the drift-down procedure and its
levels are `[TBD]`.

### B.3.4 Second engine failure on the same side

**Outside the design dispatch case.** Loss of a second engine on the same side is
outside the design dispatch case and is retained as a condition to be studied
`[GIVEN]`. There is no procedure. The controllability of this case is not
established, and writing steps for it here would assert a capability the design
does not claim. §B.16.

### B.3.5 Thrust reverser

Reversers are on the inboard engines only, inhibited in flight by
weight-on-wheels and radio-altimeter agreement, with a mechanical lock at the
translating sleeve `[GIVEN]`.

- Reverser unlocked in flight — the inhibit and the mechanical lock are both
  designed against this. Crew action `[TBD]`.
- Reverser failed to deploy on landing — the rollout is flown on braking alone
  against the 1,800 m / 1,080 m margin (§A.8.3).

## B.4 Fuel

### B.4.1 Fuel imbalance

Imbalance between left and right wings is annunciated at 1,200 kg and is limited
structurally to 3,000 kg `[GIVEN]`.

1. Confirm the automatic transfer schedule is running. Transfer and cross-feed
   are normally automatic and scheduled to hold centre of gravity and wing
   bending within limits without crew action `[GIVEN]`.
2. If automatic transfer is not correcting — select manual cross-feed. Cross-feed
   is by a single gallery running spanwise through the wing box with four
   isolation valves, permitting any tank to feed any engine `[GIVEN]`.
3. Monitor to within band.

The time available between annunciation at 1,200 kg and the structural limit at
3,000 kg is not stated anywhere and depends on the rate — `[TBD]`, and it is the
number this procedure most needs.

### B.4.2 Boost pump failure

Two AC boost pumps per collector operate in parallel, either being sufficient for
the full engine demand at all altitudes `[GIVEN]`. A single pump failure is an
indication, not a limitation.

With both pumps failed on a collector: a gravity feed path exists **below FL150**
with the boost pumps failed `[GIVEN]`. Descent to below FL150 is therefore the
procedure, and the altitude is a hard system limit rather than a
recommendation.

### B.4.3 Cross-feed gallery

The gallery is the only path by which fuel from one side reaches an engine on the
other, it is a single spanwise run, and its routing is retained as an item
requiring particular-risk and zonal attention `[GIVEN]`. Loss of the gallery
removes cross-feed entirely and leaves each side on its own tanks. There is no
reconfiguration; the procedure is fuel management within each side and a
diversion decision — `[TBD]`.

## B.5 Hydraulics

Three independent 3,000 psi systems, entirely separate in fluid, pumping and
distribution, with no system able to transfer fluid to another `[GIVEN]`.

### B.5.1 Loss of one system

Every primary surface is driven by at least two actuators supplied from different
hydraulic systems: rudder segments from A and B, elevators from A and C, ailerons
from B and C `[GIVEN]`. Loss of any one system leaves every surface driven.

1. Identify the lost system by pressure and quantity.
2. If pumps are lost but fluid is retained — the power transfer unit transmits
   mechanical power only and passes no fluid, and permits a system that has lost
   its pumps but retained fluid to be repressurised from the other side
   `[GIVEN]`. PTU — as required. The PTU is a crew-commandable unit `[GIVEN]`.
3. If fluid is lost — the PTU is of no use, and the system stays lost.
4. Consequences by system: A is gear retraction and extension, normal visor
   drive, and alternate braking; B is normal braking; C is electrically pumped
   and has the ram air turbine as its emergency source `[GIVEN]`.

### B.5.2 Loss of all AC generation

The ram air turbine deploys **automatically** on loss of all AC generation and
supplies system C together with an emergency generator `[GIVEN]`. Deployment is
automatic with a manual override `[GIVEN]`.

1. Confirm RAT deployed and system C pressurised.
2. Confirm the AC essential bus supplied by the emergency generator.
3. Land as soon as practicable. Battery-only operation is time-limited and the
   remaining endurance is displayed `[GIVEN]`.

### B.5.3 Loss of all three hydraulic systems

Brake accumulator capacity is sized to **six full brake applications** with all
three systems lost `[GIVEN]`. Gear extension is by free-fall, independent of
hydraulic pressure `[GIVEN]`.

1. Gear — alternate free-fall extension, from a separate handle `[GIVEN]`.
2. Braking — accumulator. **Six applications.** Anti-skid availability in this
   configuration is `[TBD]`.
3. Flight control — a mechanical reversion path exists to the stabiliser trim and
   to the lower rudder segment only `[GIVEN]`; but note that mechanical reversion
   results from loss of all *electrical command paths*, not from loss of
   hydraulics, and the two cases are different. With all hydraulics lost and the
   computers alive, the surfaces have no motive power.

Counting brake applications on a 1,800 m semi-prepared strip is a crew task with
no supporting indication defined — `[TBD]`, §B.16.

## B.6 Electrical

Four engine-driven 150 kVA generators, an APU generator able to supply any main
bus on the ground and in flight, and a RAT-driven emergency generator supplying
the AC essential bus only `[GIVEN]`.

### B.6.1 Single generator loss

Bus reconfiguration is automatic and is **not annunciated to the crew unless a
source is lost** `[GIVEN]`. Any one generator can carry the essential and main
load in the cruise `[GIVEN]`.

1. Confirm the reconfiguration that has occurred. The crew is told the source is
   gone; the bus configuration that resulted is displayed, not announced.
2. APU — start and place on a main bus if required.
3. No further action. The condition is a dispatch matter for the return sector
   (§A.4.3).

### B.6.2 Progressive loss of sources

The DC essential bus is the aircraft's final electrical resort: the flight
control computers, the standby instruments, the engine controls, the fire
protection and the crew oxygen indication are all supplied from it, directly or
through its associated inverter `[GIVEN]`.

1. Establish what remains: four main AC buses, two DC main buses, DC essential,
   hot battery.
2. Two 50 Ah batteries support the DC essential bus and the hot battery bus
   `[GIVEN]`. Battery-only endurance is displayed `[GIVEN]`.
3. Land within the displayed endurance. The endurance figure is the whole of the
   time budget and there is no reserve behind it.

Note for the analysis rather than the crew: the four generators are of a single
part number across all four positions, and that commonality is recorded as a
design-level installation item `[GIVEN]`.

## B.7 Flight controls

### B.7.1 Loss of one or two flight control computers

Three dissimilar computers vote on command, each on a different electrical source
and hosting software developed by one of two teams under a dissimilarity argument
`[GIVEN]`. Degraded laws are annunciated `[GIVEN]`.

1. Note the annunciated law. Envelope protection availability changes with the
   law; what is lost at each level is `[TBD]`.
2. Handling and speed limitations by law — `[TBD]`.

### B.7.2 Mechanical reversion

Reversion to mechanical control is **not a selectable mode**; it results from the
loss of all electrical command paths `[GIVEN]`. The mechanical path reaches the
stabiliser trim and the lower rudder segment only `[GIVEN]`.

There is no procedure to enter this state and none to leave it. What the aircraft
can be flown to in this configuration — approach, landing, or neither — is not
established. §B.16.

### B.7.3 High-lift asymmetry

Two independent power drive units through a common torque shaft with asymmetry
brakes at each section `[GIVEN]`.

1. Flap lever — stop at the current position.
2. Asymmetry brakes are automatic at each section `[GIVEN]`.
3. Land at the configuration achieved. Landing distance and approach speed
   penalties — `[TBD]`.

### B.7.4 Surface jam

Jam discretes are provided to the avionics `[GIVEN]`. The crew procedure for a
jammed surface is `[TBD]`.

## B.8 Landing gear and braking

### B.8.1 Gear does not extend normally

1. Alternate extension — free-fall, from a separate handle, independent of
   hydraulic pressure `[GIVEN]`.
2. Downlock — confirm on both independent proximity circuits per unit `[GIVEN]`.
   Six main bogies and a nose unit: seven units, fourteen circuits.
3. A partial downlock indication on one unit of six bogies is not addressed by
   any procedure and the landing that follows it is not characterised. `[TBD]`,
   §B.16.

### B.8.2 Brake system degradation

Normal braking from system B, alternate from system A, accumulator-supported
emergency braking behind both `[GIVEN]`.

1. Loss of system B — braking transfers to system A. Confirm.
2. Loss of both A and B — accumulator braking, six full applications `[GIVEN]`.
3. Anti-skid failure — anti-skid operates per wheel pair `[GIVEN]`; braking
   technique without it on a semi-prepared surface is `[TBD]`.

Every case in this section is assessed against the 1,800 m requirement and the
1,080 m predicted rollout, because that margin is the design basis on which
braking degradation is assessed `[GIVEN]`.

### B.8.3 Brake overheat

Brake temperature is monitored continuously and a turnaround limit is displayed
`[GIVEN]`. In flight after a rejected take-off, or on a turnaround at a strip with
no line maintenance, the displayed limit is the only serviceability information
available. Cooling times and the gear-down cooling procedure are `[TBD]`.

## B.9 Nose visor and locks

Lock status is displayed on the flight deck at all times `[GIVEN]`, on two
dissimilar and independently routed sensing paths: a proximity harness reading
pin position directly, and a mechanical linkage driving a visual indicator
visible from inside the flight deck `[GIVEN]`.

### B.9.1 Lock indication disagreement on the ground

The two paths disagree. One says locked, one does not.

1. Do not depart. The take-off configuration monitor takes lock status as an
   input `[GIVEN]`.
2. Re-cycle the locks per §A.5.3 and re-confirm both indications.
3. If the disagreement persists — the aircraft is not dispatchable. Which path is
   believed when they disagree is not defined by the design, and defining it is a
   design decision, not a crew decision. §B.16.

### B.9.2 Unlocked indication in flight

The door cannot be operated in flight `[GIVEN]`. An unlocked indication in flight
is therefore either an indication failure or a structural condition on a single
load path that is also the pressure boundary and part of the forward fuselage
structural load path `[GIVEN]`.

1. Both indications — compare.
2. Reduce hold differential — the pressurisation controllers, two outflow valves
   and the manual mode are the means `[GIVEN]`. Target differential `[TBD]`.
3. Speed and manoeuvre limitation — `[TBD]`.
4. Land as soon as possible.

The design provides no means of confirming visor lock state independently of the
two sensing paths, and no means of re-securing it in flight. That is a
characteristic of the design, stated here so the analysis sees it as one.

## B.10 Cargo restraint

A tension monitoring loop instruments every strap continuously `[GIVEN]`. There is
no in-flight adjustment of restraint `[GIVEN]`.

### B.10.1 Loss of tension on one strap

Loss of tension on any strap is annunciated in flight `[GIVEN]`. Load paths are
sized such that the loss of any one strap is carried by its neighbours `[GIVEN]`.

1. Note the station.
2. Monitor the adjacent stations specifically. The escalation the design cares
   about is adjacency, not count.
3. Manoeuvre and turbulence limitation — `[TBD]`.

### B.10.2 Loss of tension at two adjacent stations

Annunciated as a restraint condition **requiring immediate attention** `[GIVEN]`.
This is the strongest language AEO-SDD-0001 uses about any condition, and the
design attaches no procedure to it.

1. Minimise manoeuvre load. Limits `[TBD]`.
2. Avoid turbulence; descend or divert as the situation requires.
3. Land as soon as possible.
4. There is nothing the crew can do to the restraint itself, in flight, at all.

The crew has indication only, cannot re-tension, cannot enter the hold in flight,
and cannot see the payload. The procedure above is a flight-path procedure
because a flight-path procedure is the only kind available. What the manoeuvre
limitation actually is, is the single most important `[TBD]` in Appendix B.

## B.11 Pressurisation and depressurisation

Two digital controllers driving two outflow valves, either valve being sufficient;
a pneumatic backup mode driving one outflow valve directly on cabin pressure; and
positive and negative pressure relief valves protecting the structure
independently of the control system `[GIVEN]`.

### B.11.1 Controller or outflow valve failure

1. Second controller / second valve — automatic. Confirm.
2. Manual mode — available `[GIVEN]`.
3. Pneumatic backup — behind manual.

### B.11.2 Rapid depressurisation

The flight deck and the hold are separate conditioning zones `[GIVEN]`. A
depressurisation may be of one, or of both, and the two have different
consequences: the flight deck is the crew, and the hold is the pressure boundary
that includes the visor.

1. Masks — ON, 100%. Four quick-donning full-face masks with integral smoke
   goggles and demand regulators `[GIVEN]`; there is no passenger oxygen because
   the hold is not occupied in flight `[GIVEN]`.
2. Crew communication — established on masks.
3. Descent — initiated. Emergency descent profile and level-off altitude
   `[TBD]`. Maximum operating altitude is FL260, which shortens this problem
   compared with a conventional freighter.
4. If the hold has depressurised — visor lock indications, both, and §B.9.2.

Crew oxygen is sized for four occupants for the diversion time associated with
the maximum operating altitude, with reserve `[GIVEN]`.

### B.11.3 Single-pack operation

Single-pack operation is permitted with a reduced hold conditioning schedule
`[GIVEN]`. Two air cycle packs are supplied from four engines through a
cross-bleed manifold with three isolation valves, so either pack can be supplied
from either side `[GIVEN]`.

## B.12 Fire, smoke and overheat

### B.12.1 Smoke in the hold

Nine smoke detection stations along the hold length, **and no suppression**
`[GIVEN]`. The decision not to fit hold suppression is recorded in AEO-SDD-0001
and carried forward as an assumption to be substantiated `[GIVEN]` — it rests on
the hold carrying a single blade and no combustible palletised load.

1. Confirm the indication. Nine stations; which stations, and their pattern
   along 108 m, is the only information the crew has about where.
2. There is no suppression to discharge. There is no crew access to the hold in
   flight.
3. Hold ventilation and differential — the environmental system is the only
   available influence on the hold environment. What selection, if any, helps is
   **not defined** — `[TBD]`, and it is a design question, not a procedural one.
4. Land as soon as possible; the nearest suitable aerodrome, not the destination.
5. Portable extinguishers are provided at the flight deck and at the hold access
   door `[GIVEN]` — on the ground.

This is the clearest case in the document of a procedure that cannot be written
until a design decision is made. It is listed at §B.16 and it is the item this
appendix would most like the analysis to look at first.

### B.12.2 APU fire

The APU has a single dedicated bottle discharged automatically on detection with
the aircraft unattended `[GIVEN]`. With the aircraft attended, discharge is a
crew action through the fire handles `[GIVEN]`.

1. APU — shut down. Automatic shutdown and fuel isolation occur on APU fire
   `[GIVEN]`.
2. Bottle — discharge if not automatic.
3. Confirm the electrical and bleed consequences of losing the APU.

### B.12.3 Bleed duct overheat

Overheat detection is fitted to the bleed duct runs and to the main gear bays
`[GIVEN]`.

1. Isolate the affected side at the cross-bleed manifold — three isolation valves
   `[GIVEN]`.
2. Accept single-pack operation and the reduced hold conditioning schedule
   (§B.11.3).
3. Wing anti-ice on the affected side becomes unavailable; bleed protection is
   available from either side through the cross-bleed manifold `[GIVEN]`, so
   confirm what remains rather than assuming symmetry.

### B.12.4 Smoke or fumes on the flight deck

1. Masks and goggles — ON. The masks are full-face with integral smoke goggles
   `[GIVEN]`.
2. Crew communication — established.
3. Isolation — electrical load shedding and ventilation selections. The specific
   sequence is `[TBD]`; there is no smoke-removal procedure in the design.
4. Land as soon as possible.

## B.13 Ice protection

Detection is advisory, automatic activation is available, and the system may be
selected on manually at any time `[GIVEN]`.

### B.13.1 Ice detector disagreement

Two ice detectors of the same type are installed on opposite sides of the forward
fuselage, and their commonality is recorded as an item for examination `[GIVEN]`.

1. Select ice protection ON manually. The manual selection is available at any
   time and does not depend on either detector `[GIVEN]`.
2. Accept the performance penalty; it is applied automatically to the displayed
   performance `[GIVEN]`.

### B.13.2 Loss of a heated zone

Electrical zones are independently supplied and a lost zone is annunciated
`[GIVEN]`. Six independently controlled zones protect the horizontal and vertical
stabiliser leading edges.

1. Note the zone.
2. Icing-conditions limitation with a zone lost — `[TBD]`.
3. Exit icing conditions if the limitation is unknown, which at present it is.

## B.14 Crew oxygen

Two high-pressure cylinders supply a common manifold with a crossover valve
`[GIVEN]`. Either cylinder can supply the crew for the required duration at
reduced reserve `[GIVEN]`.

1. Low pressure — crossover valve as required.
2. A thermal discharge indicator on the fuselage skin shows overboard discharge
   of a cylinder overpressure `[GIVEN]` — this is a walkaround item, not a flight
   deck indication.
3. Descend to an altitude not requiring oxygen; with FL260 as the ceiling this is
   a shorter descent than on a high-altitude aircraft.

## B.15 Evacuation and forced landing

The hold is not occupied in flight and the aircraft carries flight crew only
`[GIVEN]`. Evacuation is therefore of two to four people from the flight deck.

Flight deck egress provisions, ditching provisions and their equipment are not
described in AEO-SDD-0001 and are not described here. `[TBD]` — open item 30.

A forced landing or ditching with a 72.6 t single item restrained by nine saddles
and eighteen straps is a load case, not just an evacuation case, and no
information exists on either. `[TBD]`.

## B.16 Conditions the design does not resolve

Collected from Appendix B. Each is a place where a procedure cannot be written
until a design decision is taken or an analysis is run. They are the intended
starting point for the human factors work rather than a list of complaints.

30. **Hold smoke with no suppression** (§B.12.1). Detection exists, suppression
    does not, and no crew influence on the hold environment is defined.
31. **Restraint loss at two adjacent stations** (§B.10.2). The design annunciates
    a condition "requiring immediate attention" and provides no action and no
    manoeuvre limit.
32. **Engine identification among four** (§B.3.2). Which of four has failed, at
    what point in the take-off, on what indication.
33. **Second engine failure on the same side** (§B.3.4). Outside the dispatch
    case; controllability not established.
34. **Mechanical reversion** (§B.7.2). Not selectable, not exited, and the
    achievable flight path not characterised.
35. **Visor lock indication disagreement** (§B.9.1). Which of two dissimilar
    paths is believed.
36. **Accumulator brake application counting** (§B.5.3). Six applications, no
    defined indication of how many have been used.
37. **Partial downlock on one of six main bogies** (§B.8.1). Not addressed, and
    the resulting landing not characterised.
38. **Flight deck egress and ditching provisions** (§B.15). Not described at all.

---

# Appendix C — Control schedule

Every control drawn on Figure HF-3 appears here once, in drawing order. The
schedule fixes **what kind of control it is, where it sits, and whether it is
guarded**. It does not fix breakout force, control travel, detent force,
actuation direction or knob shape — those are open items 11, 12 and 13, they
apply to every row in this table without exception, and no row below should be
read as supplying them.

Where the function rests on a statement in AEO-SDD-0001 the row is marked
`[GIVEN]`; where the control's existence or position is this document's
construction it is `[PRELIM]`. A guard marked `[PRELIM]` means the design states
no guarding provision and one is proposed here for the analysis to accept or
reject.

| Tag | Legend | Panel | Type | Function and provenance |
|:--|:-----------|:-----------|:------------|:----------------------------------------|
| 1 | `GEN 1` | ELECTRICAL | toggle | Engine 1 variable-frequency generator, 150 kVA. `[GIVEN]` |
| 2 | `GEN 2` | ELECTRICAL | toggle | Engine 2 generator. `[GIVEN]` |
| 3 | `GEN 3` | ELECTRICAL | toggle | Engine 3 generator. `[GIVEN]` |
| 4 | `GEN 4` | ELECTRICAL | toggle | Engine 4 generator. Single part number across all four positions — a recorded installation item. `[GIVEN]` |
| 5 | `APU GEN` | ELECTRICAL | toggle | APU generator; can supply any main bus on the ground and in flight. `[GIVEN]` |
| 6 | `EXT PWR` | ELECTRICAL | toggle | Ground power, two receptacles. `[GIVEN]` |
| 7 | `BAT 1+2` | ELECTRICAL | toggle | Two 50 Ah batteries on the DC essential and hot battery buses. `[GIVEN]` |
| 8 | `EMER` | ELECTRICAL | guarded toggle | Marked *GEN*. RAT-driven emergency generator, AC essential bus only. Guarded. `[GIVEN]` / guard `[PRELIM]` |
| 9 | `ENG PMP 1` | HYDRAULIC | toggle | Engine-driven pump, hydraulic system A. `[GIVEN]` |
| 10 | `ENG PMP 2` | HYDRAULIC | toggle | Engine-driven pump, system A. `[GIVEN]` |
| 11 | `ENG PMP 3` | HYDRAULIC | toggle | Engine-driven pump, system B. `[GIVEN]` |
| 12 | `ENG PMP 4` | HYDRAULIC | toggle | Engine-driven pump, system B. `[GIVEN]` |
| 13 | `ELEC C1` | HYDRAULIC | toggle | System C AC electric motor pump 1. `[GIVEN]` |
| 14 | `ELEC C2` | HYDRAULIC | toggle | System C AC electric motor pump 2. `[GIVEN]` |
| 15 | `PTU` | HYDRAULIC | toggle | Power transfer unit A↔B: mechanical power only, no fluid transfer. Crew-commandable. `[GIVEN]` |
| 16 | `RAT` | HYDRAULIC | guarded toggle | Marked *MAN DEPLOY*. Manual override of automatic RAT deployment. Guarded. `[GIVEN]` / guard `[PRELIM]` |
| 17 | `PMP 1A` | FUEL | toggle | `[PRELIM]` — position and grouping only. |
| 18 | `PMP 1B` | FUEL | toggle | `[PRELIM]` — position and grouping only. |
| 19 | `PMP 2A` | FUEL | toggle | `[PRELIM]` — position and grouping only. |
| 20 | `PMP 2B` | FUEL | toggle | `[PRELIM]` — position and grouping only. |
| 21 | `PMP 3A` | FUEL | toggle | `[PRELIM]` — position and grouping only. |
| 22 | `PMP 3B` | FUEL | toggle | `[PRELIM]` — position and grouping only. |
| 23 | `PMP 4A` | FUEL | toggle | `[PRELIM]` — position and grouping only. |
| 24 | `PMP 4B` | FUEL | toggle | `[PRELIM]` — position and grouping only. |
| 25 | `XFEED 1` | FUEL | toggle | `[PRELIM]` — position and grouping only. |
| 26 | `XFEED 2` | FUEL | toggle | `[PRELIM]` — position and grouping only. |
| 27 | `XFEED 3` | FUEL | toggle | `[PRELIM]` — position and grouping only. |
| 28 | `XFEED 4` | FUEL | toggle | `[PRELIM]` — position and grouping only. |
| 29 | `CTR TANK` | FUEL | toggle | `[PRELIM]` — position and grouping only. |
| 30 | `TRANSFER` | FUEL | rotary selector, 2 positions | Marked *AUTO / MAN*. Fuel transfer schedule. Normally automatic and requires no crew action. `[GIVEN]` |
| 31 | `REFUEL` | FUEL | toggle | Marked *VALVE*. `[PRELIM]` — position and grouping only. |
| 32 | `IMBAL` | FUEL | toggle | Marked *TEST*. Imbalance annunciated at 1,200 kg; structural limit 3,000 kg. `[GIVEN]` |
| 33 | `START 1` | ENG START | toggle | `[PRELIM]` — position and grouping only. |
| 34 | `START 2` | ENG START | toggle | `[PRELIM]` — position and grouping only. |
| 35 | `START 3` | ENG START | toggle | `[PRELIM]` — position and grouping only. |
| 36 | `START 4` | ENG START | toggle | `[PRELIM]` — position and grouping only. |
| 37 | `ENG MODE` | ENG START | rotary selector, 3 positions | Marked *NORM/START/CRANK*. Engine start mode. Positions `[PRELIM]`. |
| 38 | `IGNITION` | ENG START | rotary selector, 3 positions | Marked *A / B / BOTH*. Ignition selection. `[PRELIM]` |
| 39 | `APU` | ENG START | toggle | Marked *MASTER*. `[PRELIM]` — position and grouping only. |
| 40 | `APU` | ENG START | toggle | Marked *START*. `[PRELIM]` — position and grouping only. |
| 41 | `ENG 1` | FIRE PROTECTION | pull handle | Marked *FIRE*. Fire handle, engine 1. Isolates fuel and arms discharge. `[GIVEN]` |
| 42 | `ENG 2` | FIRE PROTECTION | pull handle | Marked *FIRE*. Fire handle, engine 2. `[GIVEN]` |
| 43 | `ENG 3` | FIRE PROTECTION | pull handle | Marked *FIRE*. Fire handle, engine 3. `[GIVEN]` |
| 44 | `ENG 4` | FIRE PROTECTION | pull handle | Marked *FIRE*. Fire handle, engine 4. `[GIVEN]` |
| 45 | `APU` | FIRE PROTECTION | pull handle | Marked *FIRE*. APU fire handle. Automatic discharge applies with the aircraft unattended. `[GIVEN]` |
| 46 | `BOTTLE` | FIRE PROTECTION | pushbutton annunciator | Marked *1-2 DISCH*. Two bottles per engine pair, cross-plumbed either way into the pair. `[GIVEN]` |
| 47 | `BOTTLE` | FIRE PROTECTION | pushbutton annunciator | Marked *3-4 DISCH*. As above for engines 3 and 4. `[GIVEN]` |
| 48 | `LOOP` | FIRE PROTECTION | toggle | Marked *TEST*. Dual-loop detection test. AND logic degrades to single-loop on loss of one loop. `[GIVEN]` |
| 49 | `WING A/I L` | ICE PROTECTION | toggle | `[PRELIM]` — position and grouping only. |
| 50 | `WING A/I R` | ICE PROTECTION | toggle | `[PRELIM]` — position and grouping only. |
| 51 | `COWL 1-2` | ICE PROTECTION | toggle | `[PRELIM]` — position and grouping only. |
| 52 | `COWL 3-4` | ICE PROTECTION | toggle | `[PRELIM]` — position and grouping only. |
| 53 | `STAB ZONES` | ICE PROTECTION | rotary selector, 6 positions | Marked *1-6*. Six independently controlled electrically heated stabiliser zones. A lost zone is annunciated. `[GIVEN]` |
| 54 | `PROBE` | ICE PROTECTION | toggle | Marked *HEAT*. `[PRELIM]` — position and grouping only. |
| 55 | `WSHLD` | ICE PROTECTION | toggle | Marked *HEAT*. `[PRELIM]` — position and grouping only. |
| 56 | `ICE DET` | ICE PROTECTION | rotary selector, 3 positions | Marked *AUTO/MAN/OFF*. Detection is advisory; manual selection is available at any time and needs neither detector. `[GIVEN]` |
| 57 | `PACK 1` | AIR COND | toggle | `[PRELIM]` — position and grouping only. |
| 58 | `PACK 2` | AIR COND | toggle | `[PRELIM]` — position and grouping only. |
| 59 | `BLEED 1-2` | AIR COND | toggle | `[PRELIM]` — position and grouping only. |
| 60 | `BLEED 3-4` | AIR COND | toggle | `[PRELIM]` — position and grouping only. |
| 61 | `X-BLEED` | AIR COND | rotary selector, 3 positions | Marked *3 VALVES*. Cross-bleed manifold, three isolation valves; either pack from either side. `[GIVEN]` |
| 62 | `PRESS MODE` | AIR COND | rotary selector, 3 positions | Marked *AUTO1/2/MAN*. Two digital controllers, two outflow valves, manual mode, pneumatic backup behind it. `[GIVEN]` |
| 63 | `OUTFLOW` | AIR COND | toggle | Marked *MANUAL*. `[PRELIM]` — position and grouping only. |
| 64 | `HOLD` | AIR COND | toggle | Marked *COND*. Hold conditioning. Flight deck and hold are separate zones. `[GIVEN]` |
| 65 | `VISOR LOCK` | VISOR/CARGO | indication only | Marked *PROXIMITY*. Proximity harness reading pin position directly. Displayed at all times. `[GIVEN]` |
| 66 | `VISOR LOCK` | VISOR/CARGO | indication only | Marked *MECHANICAL*. Mechanical linkage driving a visual indicator inside the flight deck. Dissimilar and independently routed. `[GIVEN]` |
| 67 | `RESTRAINT` | VISOR/CARGO | indication only | Marked *18 STRAPS*. Continuous tension monitoring, nine saddles × two straps. Two adjacent stations = immediate attention. `[GIVEN]` |
| 68 | `HOLD` | VISOR/CARGO | indication only | Marked *DIFF PRESS*. Hold differential; the visor interlock requires below 0.1 psi. `[GIVEN]` |
| 69 | `CREW` | OXYGEN | guarded toggle | Marked *SUPPLY*. Crew oxygen supply. Guarded. `[GIVEN]` / guard `[PRELIM]` |
| 70 | `CROSS-` | OXYGEN | toggle | Marked *OVER*. `[PRELIM]` — position and grouping only. |
| 71 | `MASK` | OXYGEN | pushbutton annunciator | Marked *TEST*. `[PRELIM]` — position and grouping only. |
| 72 | `OXY PRESS` | OXYGEN | indication only | Cylinder pressure, displayed continuously; a dispatch item. Minimum `[TBD]`. `[GIVEN]` |
| 73 | `DOME` | LIGHTING | rotary selector, 3 positions | `[PRELIM]` — position and grouping only. |
| 74 | `PANEL` | LIGHTING | rotary selector, 3 positions | `[PRELIM]` — position and grouping only. |
| 75 | `STORM` | LIGHTING | toggle | `[PRELIM]` — position and grouping only. |
| 76 | `EXTERIOR` | LIGHTING | rotary selector, 4 positions | `[PRELIM]` — position and grouping only. |
| 77 | `MASTER` | — | pushbutton annunciator | Marked *WARNING*. Both pilots. Alerting is a single prioritised list on two independent channels. `[GIVEN]` |
| 78 | `MASTER` | — | pushbutton annunciator | Marked *CAUTION*. Both pilots. Aural inventory and precedence are open items in §8. `[GIVEN]` |
| 79 | `DU REVERSION` | — | rotary selector, 4 positions | Marked *LEFT*. Reversionary display selection is manual; network reconfiguration is automatic. `[GIVEN]` |
| 80 | `HUD L` | — | toggle | Marked *STOW/DEPLOY*. Head-up display combiner. Whether HUD or head-down is primary for take-off is open item 8. `[PRELIM]` |
| 81 | `SPD/MACH` | — | rotary selector, 5 positions | `[PRELIM]` — position and grouping only. |
| 82 | `HDG/TRK` | — | rotary selector, 5 positions | `[PRELIM]` — position and grouping only. |
| 83 | `ALT` | — | rotary selector, 5 positions | `[PRELIM]` — position and grouping only. |
| 84 | `V/S · FPA` | — | rotary selector, 5 positions | `[PRELIM]` — position and grouping only. |
| 85 | `HUD R` | — | toggle | Marked *STOW/DEPLOY*. As left. `[PRELIM]` |
| 86 | `DU REVERSION` | — | rotary selector, 4 positions | Marked *RIGHT*. As left. `[GIVEN]` |
| 87 | `MASTER` | — | pushbutton annunciator | Marked *WARNING*. Both pilots. Alerting is a single prioritised list on two independent channels. `[GIVEN]` |
| 88 | `MASTER` | — | pushbutton annunciator | Marked *CAUTION*. Both pilots. Aural inventory and precedence are open items in §8. `[GIVEN]` |
| 89 | `AP 1` | — | pushbutton annunciator | `[PRELIM]` — position and grouping only. |
| 90 | `AP 2` | — | pushbutton annunciator | `[PRELIM]` — position and grouping only. |
| 91 | `A/THR` | — | pushbutton annunciator | `[PRELIM]` — position and grouping only. |
| 92 | `FD L` | — | pushbutton annunciator | `[PRELIM]` — position and grouping only. |
| 93 | `FD R` | — | pushbutton annunciator | `[PRELIM]` — position and grouping only. |
| 94 | `GEAR` | — | lever, 2 detents | Marked *UP / DOWN*. Gear selection; retraction and extension by hydraulic system A. `[GIVEN]` |
| 95 | `ALTERNATE` | — | pull handle | Marked *GEAR EXTEND*. Free-fall extension from a separate handle, independent of hydraulic pressure. `[GIVEN]` |
| 96 | `AUTOBRAKE` | — | rotary selector, 4 positions | Marked *levels [TBD]*. Autobrake is available; levels and selection logic are `[TBD]`. `[GIVEN]` as to availability |
| 97 | `ANTI-SKID` | — | toggle | Anti-skid operates per wheel pair. `[GIVEN]` |
| 98 | `PARK BRAKE` | — | lever, 2 detents | `[PRELIM]` — position and grouping only. |
| 99 | `GEAR — 7 UNITS` | — | indication only | One nose unit and six main bogies. `[GIVEN]` |
| 100 | `14 DOWNLOCK CIRCUITS` | — | indication only | Two independent proximity circuits per unit; the indication is a comparison. `[GIVEN]` |
| 101 | `BRAKE ACCUM PRESS` | — | indication only | Accumulator sized to six full applications with all three hydraulic systems lost. `[GIVEN]` |
| 102 | `BRAKE TEMP · TURNAROUND` | — | indication only | Continuous monitoring with a displayed turnaround limit. `[GIVEN]` |
| 103 | `THRUST 1` | THRUST | lever | Four levers, mechanically independent, with autothrottle. `[GIVEN]` |
| 104 | `THRUST 2` | THRUST | lever | Reverse fitted — inboard engine. `[GIVEN]` |
| 105 | `THRUST 3` | THRUST | lever | Reverse fitted — inboard engine. `[GIVEN]` |
| 106 | `THRUST 4` | THRUST | lever | Outboard engine; no reverse. `[GIVEN]` |
| 107 | `FLAP` | CONFIG/TRIM | lever, 5 detents | Marked *detented*. Double-slotted Fowler flaps in four sections; two PDUs on a common torque shaft with asymmetry brakes. Detents `[PRELIM]` |
| 108 | `SPEEDBRAKE` | CONFIG/TRIM | lever, 3 detents | Spoiler lever. `[PRELIM]` |
| 109 | `PITCH TRIM` | CONFIG/TRIM | wheel | Marked *pedestal wheel*. Trimmable horizontal stabiliser; also wheel-mounted switches. `[PRELIM]` |
| 110 | `RUDDER TRIM` | CONFIG/TRIM | rotary selector, 5 positions | `[PRELIM]` — position and grouping only. |
| 111 | `AILERON TRIM` | CONFIG/TRIM | rotary selector, 5 positions | `[PRELIM]` — position and grouping only. |
| 112 | `FUEL S/O 1` | FUEL S/O | guarded toggle | With the fire handle, the only crew action needed to isolate an engine. Guarded. `[GIVEN]` |
| 113 | `FUEL S/O 2` | FUEL S/O | guarded toggle | As above. Guarded. `[GIVEN]` |
| 114 | `FUEL S/O 3` | FUEL S/O | guarded toggle | As above. Guarded. `[GIVEN]` |
| 115 | `FUEL S/O 4` | FUEL S/O | guarded toggle | As above. Guarded. `[GIVEN]` |
| 116 | `VISOR` | CARGO/DOOR | guarded toggle | Marked *OPEN/CLOSE*. Hydraulic from system A with an electric backup drive. Cannot be operated in flight. Pedestal position `[PRELIM]` |
| 117 | `LATCH` | CARGO/DOOR | guarded toggle | Marked *12 ROTARY*. Twelve rotary latches on a common torque shaft. `[GIVEN]` |
| 118 | `LOCK` | CARGO/DOOR | guarded toggle | Marked *8 PINS*. Eight pins driven through the latch bodies so latches cannot back-drive. `[GIVEN]` |
| 119 | `WINCH` | CARGO/DOOR | rotary selector, 5 positions | Marked *SELECT 1-9*. Nine saddle stations, two straps each, electric winches locked mechanically. `[GIVEN]` |
| 120 | `WINCH` | CARGO/DOOR | toggle | Marked *TENSION*. Ground use only; there is no in-flight adjustment of restraint. `[GIVEN]` |
| 121 | `HOLD ΔP &lt; 0.1 psi` | CARGO/DOOR | indication only | `[PRELIM]` — position and grouping only. |
| 122 | `NOSE-WHEEL TILLER` | CARGO/DOOR | wheel | Marked *LEFT SEAT ONLY [GIVEN]*. Left seat only. Hydraulic, from tillers and pedals, with a mechanical disconnect for towing. `[GIVEN]` |

---

*The Aeolus HL-1 is a fictional aircraft. This document demonstrates the shape
and the discipline of a flight-deck human-factors input specification. It is not
a design of, or a statement about, any real aircraft.*
