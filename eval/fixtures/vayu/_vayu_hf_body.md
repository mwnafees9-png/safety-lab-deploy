---
title: "Vayu VY-6 — Flight Deck & Human Factors Design Description"
subtitle: "VAY-HF-0001 · Issue 1 · 2 September 2026"
---

# Vayu VY-6 — Flight Deck & Human Factors Design Description

**VAY-HF-0001 · Issue 1 · 2 September 2026**
Companion to VAY-SDD-0001 (Architecture and System Design Description), Issue 1.

> **FICTIONAL AIRCRAFT — DEMONSTRATION ARTICLE**
> The Vayu VY-6 does not exist and is not any company's programme. No customer
> data of any kind appears in this document.
>
> Prepared by Safety Lab Aero.

---

## 1 Purpose and scope

VAY-SDD-0001 describes what each of the aircraft's sixteen systems is, what it
draws on, and where it sits in the airframe. It says almost nothing about the
one interface every one of those systems ultimately terminates at: the single
person on the flight deck.

This document supplies that missing description. It is the design input to the
human-factors assessment — function allocation, crew task analysis, human error
analysis, crew alerting, ergonomics, situation awareness, the
controls-and-displays evaluation, and the minimum-flight-crew determination for
the type.

It follows the same rule as the SDD: **it describes the design, and it stops
where the assessment begins.** §11 states precisely what it therefore does not
contain, and why that omission is deliberate.

A word on why this document exists at all for a single-pilot aircraft. It would
be easy to assume that a one-person flight deck needs less human-factors design
description than a two-person one, on the theory that there is no crew
coordination to describe. The opposite is closer to true. Every item that a
two-crew flight deck can hand to the other seat — a cross-check, a second set of
eyes on an alert, a division of the radio and the checklist — has to be absorbed
by the flight deck itself on this aircraft, or it does not happen. That makes
the geometry, the display content, the control layout and the alerting
philosophy carry more of the burden here, not less, and it is why this document
is written with the same care as its two-crew sibling rather than a lighter one.

The aircraft this document describes is divided in VAY-SDD-0001 into sixteen
systems across ten zones, and every one of those systems eventually reaches the
flight deck in some form — a display page, a lever, a switch, an annunciator, or
simply a design choice about what the pilot is never shown at all. This
document does not repeat the system descriptions; VAY-SDD-0001 does that. It
extracts, from each of the sixteen, the fact that lands on the one person who
has to fly, navigate, communicate, and manage the aircraft's power and thermal
state without another qualified person to share any part of it with. Where the
SDD is organised by system, this document is organised by what the pilot sees,
touches, and is told, and it draws its material from the SDD's own words
wherever a crew-relevant fact is stated there.

This document also does not repeat the aircraft-level configuration data in
VAY-SDD-0001 §1.2 — span, mass, propulsor count, cruise speed and the rest —
except where a figure has a direct bearing on the crew interface, such as a
sector length that sets the phase durations in §2.2, or a passenger count that
sets the cabin accommodation this document has to account for. Readers wanting
the aircraft's full configuration should go to the SDD directly.

The certification basis is likewise a matter for VAY-SDD-0001 §1.3 rather than
for this document: the intended basis is a special condition for
small-category vertical take-off and landing aircraft, with the applicable
category left open pending the intended operation and the maximum seating
configuration. This document does not name a paragraph of that basis, does
not assume which category applies, and does not anticipate what either choice
would require of the flight deck. Where the analyses this document feeds need
a specific evaluation method or a specific numbered requirement, that method
and that requirement are theirs to bring, not this document's to guess at.

### 1.1 Provenance convention

| Tag | Meaning |
|---|---|
| `[GIVEN]` | Fixed by the aircraft specification or by VAY-SDD-0001. Do not expect it to move. |
| `[PRELIM]` | Preliminary design data. Real, but not frozen. Cite as preliminary. |
| `[ASSUMED]` | Engineering assumption, recorded so it can be challenged. Not given to us. |
| `[TBD]` | A known gap, named rather than filled. |

Where a value the analyses need does not yet exist it is marked `[TBD]` and left
empty. **An empty field is the correct answer.** A plausible number substituted
for a missing one is worse than the gap, because the gap is visible and the
substitution is not.

---

## 2 Operating concept, as the crew experiences it

The mission characteristics in VAY-SDD-0001 §1.1 have consequences for the crew
that the SDD does not draw out. They are stated here as facts, not as findings.

| Characteristic | Value | Provenance |
|---|---|---|
| Sector length | 20 – 30 km | `[GIVEN]` |
| Sector rate | 8 – 14 per day per airframe | `[GIVEN]` |
| Flight rules | Day and night operation stated; the applicable flight rules are not | `[TBD]` |
| Cruise altitude | 300 – 600 m above the city | `[GIVEN]` |
| Crew complement carried | 1 pilot. No cabin crew. | `[GIVEN]` |
| Passengers carried | 6, in the cabin (zone 200) | `[GIVEN]` |
| Boarding / deboarding | A **ground** operation at the pad, aircraft powered, pilot remaining in the seat throughout | `[GIVEN]` |
| Turnaround | Approximately 10 minutes | `[GIVEN]` |
| Line maintenance at the pad | None | `[GIVEN]` |
| Energy replenishment | Available only at defined network points, not at every pad | `[GIVEN]` |
| Pad environment | Elevated structures surrounded by buildings; shear and turbulence off structures a normal condition | `[GIVEN]` |

These are stated in VAY-SDD-0001 §1.1 as mission characteristics, not as
flight-deck design; this document's job is to say what each one means once it
reaches the pilot. A sector rate of eight to fourteen a day, for instance, is
an airframe utilisation figure in the SDD. For the pilot it is eight to
fourteen repetitions, in a single duty period, of every task this document
describes: a boarding check with no second person to share it, a vertical
departure, a transition, a cruise, a second transition, an approach into a
building-shear environment, and a landing, each with its own display and
alerting behaviour. Day and night operation means that repetition happens
under two different ambient-lighting regimes, sometimes within the same duty
period, against pads whose own lighting and surrounding-structure visibility
is not characterised in either document (§10.2).

### 2.1 Three consequences worth stating plainly

**There is no second person.** Whatever a two-crew flight deck hands across the
centre pedestal to the other seat — a cross-check of a setting, a second
reading of an alert, a shared radio and checklist workload — this flight deck
has to absorb by itself, because there is nobody else on it. `[GIVEN]` This is
not a statement about whether one pilot is enough; §3 says plainly that the
determination of minimum flight crew is not made here. It is a statement about
what the flight-deck design has to be capable of regardless of that
determination's outcome: every display page, every alert, and every control in
the sections that follow has exactly one possible reader, and the design either
accounts for that or it does not.

**The turnaround is a powered, occupied event, not a shutdown.** The aircraft
does not go quiet between legs. It stays powered, the pilot stays in the seat,
and passengers board and leave around a live aircraft close to a building
edge, roughly ten minutes at a time, eight to fourteen times a day. `[GIVEN]`
Ten minutes is not idle time from the flight deck's point of view. In that
window the pilot is, at minimum, the person confirming doors and restraints
before the next departure (§7.3, §8.4), and possibly also monitoring energy
replenishment where a pad has that capability, all without having left the
seat or handed any part of the task to someone else on the flight deck.

**Every sector carries two transitions, not the occasional one.** The aircraft
has no tilting mechanism; the change between hover-borne and wing-borne flight
is a matter of control law and airspeed, executed once outbound and once
inbound on every single leg. Across a 14-sector day that is up to 28
transitions for one aircraft, far more frequent than the occasional regime
change a conventional or tilt-rotor type would present. `[GIVEN]` Section 9
records that the transition sequence itself is commanded automatically by the
flight control system once conditions permit; what stays with the pilot,
every time, is flying the aircraft through it and reading whatever the
displays and alerting system show while it happens.

### 2.2 Flight phases

The programme phase vocabulary, built from the representative sector in
VAY-SDD-0001 §1.1. Durations are the nominal split used for design purposes;
they are not a schedule. `[PRELIM]`

| Phase | Nominal duration (min) |
|---|---|
| Standing / pre-flight | `[TBD]` |
| Boarding | ≈10 (turnaround figure) |
| Vertical departure (hover, climb) | 2 |
| Transition to wing-borne flight | Included in departure/climb above |
| Wing-borne cruise | 9 |
| Transition to hover-borne flight | Included in approach below |
| Approach and landing (hover, descent) | 3 |
| Deboarding | Included in turnaround above |

The 2-minute departure and 3-minute approach figures each contain a transition;
VAY-SDD-0001 does not break the transition itself out as a separately timed
sub-phase, and no attempt is made here to invent one. `[GIVEN]` for the named
minutes; `[TBD]` for a standalone transition duration and for standing time.

The resulting sector shape is short and front- and back-loaded: nine minutes
of steady wing-borne cruise sits between two shorter, denser phases — the
vertical departure and climb, and the approach and landing — each of which
folds a hover regime, a transition, and (on the approach side) a
building-shaded pad environment into two or three minutes. A phase table built
this way is a design input for the task and workload analyses to divide
further; it is not itself a claim about how much happens inside either short
phase, which is exactly the kind of question this document leaves to those
analyses.

---

## 3 Crew station and qualification

| Item | Value | Provenance |
|---|---|---|
| Pilot stations | 1, on the aircraft centreline | `[GIVEN]` |
| Additional flight-deck seating | None described | `[GIVEN]` |
| Passenger seating | 6, cabin (zone 200), two-two-two, aft of the flight deck | `[GIVEN]` |
| Cabin crew | None | `[GIVEN]` |
| Oxygen provision | None described in VAY-SDD-0001 | `[GIVEN]` |
| Operating convention | Single continuous pilot duty; no Pilot Flying / Pilot Monitoring exchange is possible | `[GIVEN]` |
| Kind of operation sought | Day and night | `[GIVEN]` |

The absence of an oxygen system is stated here as a design fact rather than an
oversight: cruise altitude is 300–600 m above the city, well below where crew
oxygen is normally a design feature, and VAY-SDD-0001's sixteen-system
inventory names no such system. If that changes, this table changes with it.

The single-station arrangement also removes a category of design question that
a two-seat flight deck has to answer and this one does not: there is no
question of which seat is primary, no handover of controls between seats, and
no seat-to-seat reach or sightline problem to solve, because there is only one
seat. What replaces those questions is a different one — whether everything
the pilot needs across a full sector, from boarding check to shutdown, is
reachable, visible and legible from that one position without having to rely
on a second viewpoint that does not exist. Sections 4 through 8 are the design
description that question is asked of; §11 restates why answering it is not
this document's job.

> **The one-pilot figure is an input, not an answer.** VAY-SDD-0001 gives a
> crew complement of one pilot and no cabin crew. That is the specification's
> sizing assumption. The minimum-flight-crew determination for the type is made
> by the analysis against the workload methodology applicable to the
> certification basis, and may confirm the number, or challenge it. Nothing in
> this document performs that determination.

The "no additional flight-deck seating" row carries a training consequence
worth stating alongside it: VAY-SDD-0001 describes no jumpseat or observer
position on the flight deck, which means a check pilot, an instructor, or an
observer cannot occupy the flight deck during a revenue sector to watch a line
pilot fly the type as flown. Whatever line-observation the training and
checking programme relies on has to happen some other way — from the cabin,
from the simulator named in §3.1, or not as direct observation at all. Which of
those applies is not stated and is `[TBD]`.

### 3.1 Qualification and training `[ASSUMED]`

- Type-rated pilots, current on type, drawn from a pool flying repetitive
  short-sector urban operations at high daily tempo.
- Recurrent training is assumed to include the elevated-pad approach in a
  building-shear environment, the hover/wing-borne transition in each
  direction, and the no-cabin-crew boarding and passenger-readiness check as
  named items.
- A flight-deck mock-up and a full-flight simulator are planned programme
  assets. No simulator campaign has been run. `[TBD]` — evidence dates.
- Because there is no second pilot to develop line experience alongside, the
  qualification route by which a newly type-rated pilot is judged ready for
  unsupervised single-pilot line flying — line-check content, sign-off
  authority, minimum experience before solo operation — is `[TBD]`.
- A daily tempo of eight to fourteen sectors, flown alone, by day and by
  night, is itself a training consideration this document flags without
  resolving: whatever recency and currency requirements the operator sets, the
  pilot accrues them at a much higher repetition rate per duty day than a
  lower-tempo type would produce, and does so without a second pilot present
  to observe or moderate the day. What recency and duty-time provisions apply
  is an operating-rule question outside this document's scope. `[TBD]`
- Recurrent evaluation of the pilot's handling of the flight deck's
  automatic behaviours — the automatic transition sequencing, the automatic
  passenger-address announcements, and the automatic detect-and-avoid track
  build described in §9 — as distinct, named training items is `[TBD]`.

---

## 4 Flight deck architecture and geometry

The flight deck occupies zone 100, on the aircraft centreline, forward of the
cabin. Per VAY-SDD-0001's zone table, the boundary at the front of the cabin is
a pressure-free bulkhead, and the flight deck is **open to the cabin above seat
height** rather than separated from it by a door. `[GIVEN]`

### 4.1 Consequences of the single-pilot centreline arrangement `[PRELIM]`

- Seating is symmetric on the centreline rather than offset to a side, so the
  eye-reference-point question is one of longitudinal and vertical position
  only, not of a left/right pairing as on a side-by-side flight deck.
- Every flight-deck resource that a two-person aircraft can split across two
  seats — one display each, one radio each, one set of eyes on the alert list
  each — exists here in a single instance for the pilot to use alone, whatever
  redundancy the underlying system carries. Section 6 records where the display
  and control architecture is itself duplicated; that duplication serves system
  availability, and its relationship to a single user's workload is for the
  analyses.
- The flight deck being open to the cabin above seat height means the pilot has
  a direct, unobstructed sightline over the passenger seats. VAY-SDD-0001 does
  not describe a door, a partition, or a means of closing that opening. What
  that means for cabin noise reaching the flight deck, for passenger access to
  the flight deck in flight, and for any security or isolation function, is not
  addressed by either document and is `[TBD]`.
- That same open boundary is also the only means by which the pilot can
  directly observe the cabin without a camera or other sensor — none is
  described in VAY-SDD-0001. Section 7.3 records that passenger-readiness
  confirmation before departure falls to the pilot or ground staff with no
  cabin crew present; whether that confirmation in practice relies on this
  sightline, on a display indication, or on a ground signal is `[TBD]` there.
- Boarding takes place with the flight deck occupied and the aircraft powered,
  which is the normal condition for every one of the eight to fourteen daily
  turnarounds rather than an exceptional one. The pilot conducts whatever
  pre-departure checks the type requires from the seat, without a second
  flight-deck occupant to perform or verify any part of them.
- The centreline position also fixes, by construction, where the geometry
  problems in §4.3 have to be solved: there is one Design Eye Position to
  define, not two, and every panel zone in §4.2 is described relative to that
  single position rather than to a left- or right-hand offset. That
  simplifies the geometry problem in one sense and removes any possibility of
  compensating for a poor solution from a second vantage point in another.
- The urban pad environment described in §2 — elevated structures, buildings
  close in, shear and turbulence off nearby surfaces as a normal condition —
  is flown into and out of on every sector by the same one pilot occupying
  the same fixed centreline position, using whatever external vision envelope
  item 2 of §4.3 eventually defines. A wider or narrower cut-off angle than a
  conventional transport's has direct consequence for how much of the pad
  edge, the surrounding structures, and any obstacle close to the aircraft is
  visible during the two- to three-minute departure and approach phases,
  independent of anything the displays in §6 show.

<<<FIG:flightdeck>>>

### 4.2 Panel zones `[PRELIM]`

VAY-SDD-0001 contains no dedicated flight-deck layout drawing; the panel-zone
table below is assembled from the equipment placements each of the sixteen
system descriptions states in passing — DIS locating its own displays and
switches, FCS and NAV locating their computers, ERS locating its handle and
switch, and so on. That method of assembly is stated plainly because it means
this table is only as complete as the placements the SDD happens to mention,
and a zone with no equipment listed against it is not evidence that the zone
is empty, only that nothing in the SDD's text places anything there yet.

| Zone | Contents |
|---|---|
| Alerting panel (above the displays) | Master caution and warning lights; annunciator legends |
| Main instrument panel | Two display surfaces, each on its own graphics processor and configurable to flight, navigation or synoptic pages; a standby display; an audio panel |
| Lower instrument panel | Hard switches for gear, lighting, and system resets |
| Centre console | Centre inceptor (flight path); left-hand energy lever; guarded emergency-recovery handle and its separate safe-and-arm switch |
| Dedicated annunciator | Emergency recovery system control-unit status (armed state, fault) — see §8.3 |
| Overhead panel | `[TBD]` — not described in VAY-SDD-0001 |
| Side consoles | `[TBD]` — not described in VAY-SDD-0001 |

Two things are worth stating plainly about this table. First, VAY-SDD-0001
describes a lower-instrument-panel location for the hard switches that a
conventional two-crew transport commonly places overhead; whether that is
because this aircraft genuinely has no overhead panel, or because the overhead
panel simply has not been described yet, is itself `[TBD]`. Second, the
emergency-recovery annunciator is called out separately from the alerting panel
because VAY-SDD-0001 describes it as "a dedicated flight deck annunciator near
the activation handle" rather than as part of the general alert list — see
§8.3 for what that distinction means for the crew interface.

A third point follows from the first two together. Where a conventional
two-crew flight deck spreads switches, annunciators and displays across an
overhead panel, a main panel and two side consoles reachable from two
different seats, this aircraft's described equipment concentrates into three
areas immediately in front of a single seat: the alerting panel above, the
displays and standby display in the centre, and the lower panel and console
below and beside. Whether that concentration is complete — whether an overhead
panel and side consoles genuinely do not exist, or simply have not yet been
placed in the SDD's text — is exactly the kind of question §4.3's geometry
items and this table's `[TBD]` rows exist to carry forward rather than answer
by assumption.

<<<FIG:cockpit_ga>>>

### 4.3 Geometry data `[TBD]`

None of the six items below exist yet in any form this document can cite.
They are listed because the ergonomics and controls-and-displays analyses
cannot proceed without them, and because a single-seat flight deck has no
second position from which a poor answer to any one of them could be
partially compensated for. Required, and **not yet defined**:

1. Design Eye Position and eye-reference-point tolerance
2. External vision envelope — over-nose and over-side cut-off angles, with
   particular attention to close-quarters visibility of the pad, its edge, and
   the surrounding building structures during an elevated-pad approach
3. Sightline and viewing angle from the design eye position to each display
   surface and to the standby display
4. Reach envelope to each panel zone from the seat design position
5. Seat adjustment range and the seat-to-eye-reference alignment aid
6. Flight-deck access and emergency egress routing, including how the open
   boundary to the cabin figures in an egress path

---

## 5 Anthropometry and accommodation

| Item | Value | Provenance |
|---|---|---|
| Accommodation range | 5th percentile female to 95th percentile male | `[ASSUMED]` |
| Anthropometric database | `[TBD]` — not selected | |
| Clothing / equipment state | Normal flight clothing; no cold-weather or high-visibility bulk case defined | `[TBD]` |
| Demonstration method | Mock-up, digital human model, or both | `[TBD]` |

With one pilot seat and no second position to compensate for a poor fit at the
first, the accommodation range has to be validated across its full span rather
than checked at a nominal midpoint; a geometry that is merely adequate for a
central percentile is not enough when there is no second pilot able to reach
what the first cannot. That is a design intent stated for the accommodation
work to carry forward, not a finding that any current geometry meets it.

The accommodation range interacts directly with the geometry items §4.3 lists
as `[TBD]`: a Design Eye Position, a seat adjustment range, and a reach
envelope are each only meaningful once the accommodation range they are meant
to cover is fixed. Selecting the anthropometric database and the demonstration
method is accordingly a precondition for closing those geometry items, not a
parallel and independent task. Passenger anthropometry — six variably-sized
occupants per leg, seated aft of the flight deck with restraints described in
§7.3 and §8.4 — is a separate question from crew accommodation and is not
addressed by this section; nothing in VAY-SDD-0001 or this document's source
material sets a passenger anthropometric basis either.

---

## 6 Display suite

Per VAY-SDD-0001 §5.11 (DIS). `[GIVEN]` unless noted.

| Element | Provision |
|---|---|
| Display surfaces | 2, side by side, each on its own graphics processor, configurable to flight, navigation or synoptic pages through bezel keys |
| Standby display | 1, per the aircraft configuration. Its architecture is not detailed in the DIS system description. `[TBD]` |
| Format flexibility | **Either display can show any available page, including the other surface's page.** |
| Flight-path input | Centre inceptor, with two independent signal paths to the two flight control computers |
| Energy input | Left-hand energy lever, sending independent position signals to each flight control computer |
| Reference data | 1 inertial measurement unit and 1 satellite positioning receiver (zone 100); forward air data probes on the nose; low-speed sensors near each boom root, reporting independently per boom |
| Alerting hardware | Master caution and warning lights and annunciator legends on a panel above the displays; an aural tone generator sharing the COM audio-panel path |

### 6.1 Reconfiguration behaviour `[GIVEN]` where stated, `[TBD]` where not

- **Page selection between the two display surfaces is manual**, made by the
  pilot at the bezel keys; either surface can be set to show any available page.
- **What happens automatically, if anything, on the loss of one display's
  graphics processor is not stated.** Whether the surviving surface takes up
  the lost content on its own, whether the pilot must select it, or whether
  some other reversion path exists, is `[TBD]`.
- The navigation and air-data sensor sets are described in the singular for
  inertial and satellite positioning — one unit each — with only the low-speed
  sensors described as present at both booms. Whether the primary flight
  displays have any means of reversion if the single inertial or satellite
  positioning source is affected is `[TBD]`.

That combination — manual page selection as the normal way of working, paired
with an unstated reversion behaviour on processor loss, and a navigation
sensor set that is single rather than duplicated where the displays themselves
are — is recorded here as design fact. What it means for the crew is for the
analyses.

One further mechanical point is worth recording plainly, because it follows
directly from there being two independently selectable surfaces and one
reader. At any moment, the pilot's two displays can show a primary flight page
and a second page together, two non-flight pages together, or the same page
twice; VAY-SDD-0001 states that either surface can carry either format, but
does not state that a primary flight format is protected from being displaced
off both surfaces at once. Whether such protection exists, in software or in
procedure, is `[TBD]` and is listed again at item 8 below.

### 6.2 Display content `[PRELIM]`

Content named in VAY-SDD-0001 as reaching the displays, drawn from the DIS
system description and from the interfaces other systems declare to DIS:

- Flight, navigation and system synoptic pages, selectable to either surface
- Traffic and terrain tracks from DAA, on a dedicated page monitored during pad
  approach and departure
- A power/energy page: bus voltage, contactor state and isolation resistance
  (from EPD); battery charge and health (from HVB); coolant temperature per
  loop, and battery and inverter temperatures (from TMS)
- COM channel and datalink status, on a system synoptic page
- Gear position, shown on the same page during extension and retraction
  (from LGS)
- A cabin synoptic page showing door and latch status (from CAB)
- Alert messages, appearing on whichever display shows a synoptic or status
  page, with an aural tone and one of the two glareshield alert lights. Which
  light accompanies which message is not defined `[TBD]`

Read across the sixteen system descriptions, the content list above is not a
fixed set of pages so much as a statement that every system with something to
report sends it to the same pair of surfaces: propulsion, energy, thermal,
navigation, communications, traffic, gear, and cabin state all converge on the
two displays and the standby display, selected and arranged by the one person
reading them. VAY-SDD-0001 does not state a maximum number of pages, a paging
hierarchy, or a rule for what happens when two systems need attention on two
different pages at once; those are exactly the questions item 8 below leaves
open.

### 6.3 Not defined `[TBD]`

The four items below are the ones the display-suite description above
repeatedly points at without resolving. They matter more on this type than on
a lower-tempo one because whatever the answer turns out to be, the pilot lives
inside it eight to fourteen times a day, day and night, alone:

7. Measured luminance, contrast and sunlight-readability performance
8. Which format each display shows by default, per phase
9. Behaviour on loss of one, then both, display graphics processors
10. The standby display's architecture — independence of its supply, sensor
    and processing path from the two primary displays

---

## 7 Controls

`[PRELIM]` unless noted.

### 7.1 Flight path and energy

- A single centre inceptor for flight path, with two independent signal paths
  carried to the two flight control computers `[GIVEN]`
- A single left-hand energy lever, likewise sending independent position
  signals to each flight control computer `[GIVEN]`
- A guarded emergency-recovery handle at the centre console, and a separate
  safe-and-arm switch: both are required before a firing signal can reach the
  recovery-system charge `[GIVEN]`
- Neither VAY-SDD-0001 nor this document's source material describes rudder
  pedals, a yaw pedal, or any other directional-control input distinct from the
  centre inceptor. Whether such an input exists, and if so what it drives, is
  `[TBD]`.
- No autopilot engage/disengage control, autothrottle control, or
  flight-director selector is described — see §9.

> There is no mechanical or hydraulic linkage anywhere between the flight deck
> and a propulsor or a control surface. Every command from the centre
> inceptor and the energy lever reaches its destination electrically, through
> the flight control computers, over the aircraft's two data buses. This
> document records that architecture; it does not analyse the single-point
> character of a one-lever, one-inceptor input path.

The flight-path and energy inputs are worth setting against the corresponding
arrangement on a larger, multi-propulsor transport. Where a four-engine
aircraft gives the crew one thrust lever per engine, this aircraft gives the
pilot one energy lever for all ten propulsors combined — eight lift rotors and
two cruise propellers — with the flight control system, not the lever,
deciding how commanded energy is distributed across whichever propulsors are
active for the current flight regime. That is a direct consequence of the
distributed-electric-propulsion architecture DEP and FCS describe in
VAY-SDD-0001 §5: allocation across ten independent units is a control-law
function, not something a pilot could do lever by lever even with more hands
than one.

<<<FIG:controls>>>

### 7.2 Systems

Hard switches for landing gear, lighting and system resets are described at
the lower instrument panel rather than overhead. `[GIVEN]` No overhead panel is
described in VAY-SDD-0001; whether the type has one, and what philosophy
governs it if so, is `[TBD]`.

Beyond those named hard switches, VAY-SDD-0001 gives no account of how the
pilot commands the remaining systems that plainly need some crew-accessible
control at some point in a flight or a turnaround: closing or opening the
electrical bus-tie contactor, selecting a coolant-loop configuration,
initiating ground charging, or resetting a data-bus channel are each
mentioned as things the systems themselves or the flight control system do,
without a stated flight-deck control surface for a pilot override or manual
selection where one might exist. Whether such controls exist and where they
sit is `[TBD]`, distinct from the hard-switch set named above.

### 7.3 Cabin and door controls

- Two cabin doors, one each side, each with an independent electric latch
  actuator and its own manual release lever `[GIVEN]`
- Door and latch status is presented to the pilot on a cabin synoptic page
  `[GIVEN]`
- Cabin lighting and the forward/aft environmental outlets are adjustable by
  the pilot from the flight deck `[GIVEN]`
- On arrival, the pilot confirms the aircraft is at the pad before releasing
  the door latches `[GIVEN]`. The flight-deck control by which that release is
  commanded — a dedicated door-control panel, a function on an existing panel,
  or something else — is not named in VAY-SDD-0001. `[TBD]`
- With no cabin crew carried, the pilot or ground staff confirm each passenger
  is seated and restrained before doors are requested closed `[GIVEN]`. How
  that confirmation is made — by the pilot's own sightline over the open
  flight-deck/cabin boundary described in §4.1, by ground staff signal, by
  some display indication, or by more than one of these — is `[TBD]`.
- Restraint buckle status is recorded by HMS "where sensed" `[GIVEN]`, a
  qualifier VAY-SDD-0001 uses without stating which seat positions are
  instrumented and which are not. Whether every one of the six passenger
  restraints reports status, or only some, is `[TBD]`.
- Cabin lighting is arranged as two strings, one per sidewall, on separate
  low-voltage feed segments, with ceiling trim lighting providing overlap
  `[GIVEN]`; the pilot's control for selecting or overriding either string
  individually, as opposed to cabin lighting as a whole, is `[TBD]`.

### 7.4 Control-actuation data `[TBD]`

As with the geometry items in §4.3, none of the following four items exist yet
in a form this document can cite, and each is a precondition for the reach,
force and error-tolerant-design analyses that the controls in §7.1 through
§7.3 will eventually need to pass through:

11. Breakout forces, control travel, and detent forces on the centre inceptor,
    the energy lever, and the guarded recovery handle
12. Actuation direction conventions
13. Guarding and locking provisions for irreversible actions, beyond the
    recovery handle's guard and its separate safe-and-arm switch
14. Presence and form of any yaw or directional control input separate from
    the centre inceptor

---

## 8 Crew alerting

This section describes the alerting system's **capability**. It does **not**
assign a priority to any condition — that population is an analysis output.

### 8.1 Capability `[GIVEN]` unless noted

| Property | Provision |
|---|---|
| Hardware | An alerting panel above the two displays carries master caution and warning lights and annunciator legends |
| Presentation | Alert messages appear on whichever display currently shows a synoptic or status page, with an aural tone and one of the two glareshield alert lights. Which light accompanies which message is `[TBD]` |
| Acknowledgement | A glareshield switch; the pilot can then call up the associated system page |
| Procedures | Whether the associated page called up on acknowledgement contains the alert's procedure, or only its system status, is `[TBD]` |
| Aural | A single tone generator, sharing the same audio path as the COM audio panel used for radio and intercom `[GIVEN]`. Precedence and arbitration between an alert tone and radio or intercom audio on that shared path is `[TBD]` |
| Tactile | `[TBD]` — no tactile alerting means is stated |

The acknowledgement switch itself is placed at the glareshield `[GIVEN]`,
directly below the alerting panel it answers and within the same forward
reach envelope as the displays it lets the pilot call a system page up from;
whether that reach is confirmed for the accommodation range in §5, from the
centreline seat, at the design eye position §4.3 has not yet fixed, is not
established by either document.

The shared aural path is worth stating plainly: on this aircraft the same
audio chain that carries an alert tone to the pilot's ear also carries every
radio call and every cabin intercom exchange. Whether the two are arbitrated,
and how, is not described.

That sharing is a direct consequence of the flight deck's single-occupant
architecture rather than an oversight specific to alerting: the audio panel,
the alert tone generator, the vertiport datalink, the two VHF radios and the
cabin intercom all terminate at the one headset the pilot wears, because there
is only one headset to terminate at. A two-crew flight deck can route
different audio to each headset, or rely on one pilot to monitor the radio
while the other attends to an alert; neither option exists here by
construction, and this document records the single shared path as the design
fact it is rather than assuming an arbitration scheme that is not stated.

### 8.2 Philosophy `[ASSUMED]`

- Alerts ordered by urgency of required crew response, not by system of origin
- One condition, one alert; the consolidation rule where several systems report
  related status — DAA's dual processing channels, for instance, or EPD's two
  bus sections — is `[TBD]`
- Phase-dependent inhibits during a vertical departure, a transition, or a pad
  approach: windows and inhibited set `[TBD]`
- Whether the alerting system distinguishes at all between a condition
  affecting the aircraft's ability to complete the current sector and a
  condition affecting only the next one — relevant on a type that returns to
  a chargeable node only at defined network points rather than at every pad
  — is `[TBD]`
- Whether any alert is suppressed, modified or re-timed specifically because
  the aircraft is on a pad, powered, with passengers boarding or leaving
  around it, as distinct from being suppressed for reasons tied to a
  conventional ground phase, is `[TBD]`

### 8.3 Indications that are not on a display `[GIVEN]`

- **Emergency-recovery system control-unit status** — armed state and fault —
  is presented on "a dedicated flight deck annunciator near the activation
  handle," not on a display page. That distinguishes it from the general alert
  list in the same way a discrete hardware indication always does: it does not
  depend on which page either display currently shows. What VAY-SDD-0001 does
  **not** state is whether this annunciator's supply, sensing or processing
  path is independent of the two primary displays' own failure modes — unlike
  a purely mechanical indicator, it is described as presented through DIS, and
  its independence from a display or avionics failure is `[TBD]`.
- **Master caution and warning lights** are named as hardware on the alerting
  panel, distinct from the display surfaces beneath them, in the same sense
  that any dedicated annunciator light is equipment rather than a
  reconfigurable page.

### 8.4 Two conditions the SDD singles out `[GIVEN]`

Stated as design facts. Their classification and their crew response are for
the analyses:

- Cabin door and latch status is presented on a dedicated synoptic page,
  described specifically as being consulted "during boarding and before
  departure" — a condition the SDD calls out for crew attention at those two
  points in the turnaround.
- Restraint buckle status is recorded "where sensed" rather than for every
  seat without qualification, which VAY-SDD-0001 states as a property of the
  recording rather than as an oversight to be corrected here.

---

## 9 Automation

`[PRELIM]` unless noted.

No autopilot, autothrottle, or flight-director function is described anywhere
in VAY-SDD-0001. `[GIVEN]` The flight control system instead provides
continuous fly-by-wire control laws — a hover law, a wing-borne law, and a
transition law that blends the two — translating the pilot's centre-inceptor
and energy-lever inputs into propulsor and surface commands throughout the
flight. `[GIVEN]`

- The transition itself is sequenced by the flight control system rather than
  by a discrete pilot selection: it commands the lift-rotor stop-and-align
  mechanisms "once conditions permit," shifting authority from rotor thrust to
  aerodynamic surfaces as airspeed builds, and the reverse on the way back into
  hover. `[GIVEN]`
- Passenger-address announcements at boarding and on arrival are sequenced
  automatically from flight-phase information, without pilot input, with the
  pilot able to override from the flight-deck microphone. `[GIVEN]`
- Traffic and obstacle tracking runs continuously from engine start to
  shutdown; no pilot action is required to keep the track list current.
  `[GIVEN]`
- Thermal management pump speed is modulated automatically from reported heat
  load in each coolant loop; this is a system-level automatic function with no
  described crew-facing control. `[GIVEN]`
- Ground and air behaviour selection in the flight control system is driven
  automatically by weight-on-wheels state reported from the main landing-gear
  legs, with no described pilot selection between the two. `[GIVEN]`
- Detect-and-avoid's two independent processing channels cross-check their
  track lists automatically before the result reaches the displays, and the
  processor falls back to the local sensor picture alone if the transponder
  path is affected, without a stated pilot action to trigger that fallback.
  `[GIVEN]`

Energy state feeds this picture continuously rather than at fixed checkpoints:
HVB's charge and health data "are displayed to the crew and used by FCS for
energy planning," and TMS's per-loop coolant, battery and inverter
temperatures are displayed alongside it. `[GIVEN]` Against an operating
concept where a charge is available only at defined network points rather
than at every pad (§2), that continuous display is the pilot's stated window
into whether the aircraft's stored energy supports the sector ahead and the
return to a chargeable point beyond it; no dispatch-level energy threshold,
display cue, or decision point is named in either document, and its absence
is tracked with the other procedural gaps at §10.1.

Set against those automatic functions, several closely related actions are
described as remaining with the pilot rather than the system: gear retraction
and extension are pilot-commanded, observed leg by leg on the display as each
one cycles, with a manual extension handle available if the electric
actuators do not respond; the safe-and-arm switch for the emergency recovery
system is pilot-set according to phase of flight; and page selection between
the two displays (§6.1) is manual throughout. The pattern that results — some
functions automatic by default with no stated pilot involvement, others
manual by default with no stated automatic assistance, on the same flight
deck — is recorded here as a design fact in the same spirit as §6.1's display
finding. What it implies for the pilot's model of what the aircraft is doing
for them at a given moment, unassisted, is for the analyses.

Not defined `[TBD]`, and each a precondition for understanding what the
automatic functions above actually do at their edges:

15. Mode annunciation set, if any function beyond continuous fly-by-wire
    control exists; transition and reversion annunciation
16. Envelope protection — whether provided, and in which axes, in hover and in
    wing-borne flight
17. Any automatic reversion or disconnect condition for the fly-by-wire control
    laws, and its alerting
18. Control-law and transition-logic behaviour on loss of a display processor,
    one coolant loop, or one propulsor
19. Whether control gains or the transition threshold schedule on aircraft
    mass or loading — six passengers of varying weight is not a fixed item,
    and the aircraft's inertia distribution changes leg to leg with who is
    on board

---

## 10 Procedures, environment and crew-relevant interfaces

### 10.1 Procedures `[TBD]` throughout

VAY-SDD-0001 contains no procedures. A normal operating sequence, phase by
phase, and a non-normal set organised by system, have been constructed for this
document from the architecture, and appear as Appendix A and Appendix B. They
are written as design input to the task, error and workload analyses rather
than as an approved operating procedure, and they are marked throughout with
the provenance of each step. Where a step would need a value nobody has
defined, the step names the gap instead: recording an absence plainly is
preferred to inventing a plausible-looking number that has not been designed.

Appendix C lists every control and indication on the flight deck against its
panel zone and its provenance.

26. Backup medium for procedures — paper, electronic, or none, is not defined
27. Memory (recall) item set
28. Whether the system page called up on alert acknowledgement (§8.1) contains
    the associated procedure, or only system status
29. The boarding handover and cross-check between ground staff and the pilot,
    with no cabin crew present to share it — who confirms what, and in what
    order, before doors are requested closed

One procedural fact is given rather than open: the turnaround readiness
report compiled by HMS at engine shutdown is reviewed by ground crew at a
maintenance terminal before the aircraft is released for its next flight.
`[GIVEN]` What the pilot's own part in that release decision is — beyond
calling up recent recorded events on a maintenance page if needed — is not
stated.

Ground charging is a further turnaround activity VAY-SDD-0001 places partly on
the pilot's side of the interface: EPD reconfigures contactors to route charge
current from ground equipment to each pack "under FCS supervision," and each
pack's controller accepts charge current independently. `[GIVEN]` Whether that
supervision requires a pilot-initiated step, runs automatically once ground
equipment connects, or something between the two, is `[TBD]`; it matters here
because charging, where it happens, shares the same roughly ten-minute
turnaround window as boarding, restraint confirmation and the readiness-report
review, all without a second flight-deck occupant to divide the window
between tasks.

The take-off, or vertical-departure, configuration question that a
conventional transport answers with a dedicated configuration monitor is not
addressed at all in VAY-SDD-0001: no such monitor, and no stated parameter set
for one, appears anywhere in the sixteen system descriptions. Whether a
pre-departure configuration check exists in any form, and if so what it
covers, is `[TBD]` and is tracked with the other procedural gaps above.

### 10.2 Environment `[TBD]` throughout

None of the six items below has a measured value behind it anywhere in the
source material this document draws on. They are grouped together because
each describes the physical environment the pilot works inside rather than
something the aircraft's own systems report, and because on this type — an
open flight deck, an urban pad environment, and a duty day built from many
short, low-altitude legs rather than few long ones — the environment is not a
background condition so much as a recurring element of every single sector:

20. Ambient noise — in hover with all eight lift rotors active, in wing-borne
    cruise with the two propellers, and at the open flight-deck/cabin
    boundary described in §4.1
21. Vibration from the boom-mounted lift rotors and the wing-mounted cruise
    propellers, and its transmission to the flight deck
22. Lighting levels and independence of lighting supplies, across day and
    night operation
23. Wind, shear and turbulence loading at elevated pads among buildings — a
    stated operating condition (§2) with no measured data behind it
24. Visual environment on a night approach to an elevated, built-up pad
25. Electromagnetic and optical interference from adjacent structures, cranes
    and other rotorcraft in the urban corridor

Each of these is a design case named in general terms by VAY-SDD-0001 §1.1 —
the pad environment "shaped by buildings rather than by the free-stream," with
"shear and turbulence off nearby structures" as "a normal operating condition
rather than an exception" — without a measured value behind any of them. The
gap matters more for this aircraft than it would for one flying a stable
enroute environment for most of its sector, because on the VY-6 the
building-shaped environment coincides with the phases where the pilot's
attention is already most divided: the vertical departure and the approach and
landing, each carrying a transition, each only two to three minutes long, and
each flown by one person with the full display and alerting picture from §6
and §8 to read at the same time.

### 10.3 Crew-relevant system characteristics

From VAY-SDD-0001. The characteristic listed is the one that reaches the crew.
The table draws one row from each of the sixteen systems named in §1's
inventory, so that every system contributes something the pilot sees, uses,
or is told, even where that contribution is narrower than the system's full
scope in the SDD; readers wanting the complete description of any one system
should go to VAY-SDD-0001 §5 directly rather than treat this row as a
summary of it.

| System | Characteristic | Provenance |
|---|---|---|
| DEP | Ten independent inverter-motor units, one per propulsor, no gearbox; the flight control system redistributes torque across the survivors on the loss of any one | `[GIVEN]` |
| LFT | Eight lift rotors, each with its own stop-and-align mechanism; blades lock edge-on to the airflow in cruise | `[GIVEN]` |
| HVB | Two independent battery packs of four strings each; charge and health data displayed to the crew continuously | `[GIVEN]` |
| EPD | Two high-voltage bus sections joined by a tie contactor; bus voltage, contactor state and isolation resistance displayed to the crew | `[GIVEN]` |
| TMS | Two independent coolant loops, left and right; coolant temperature per loop, and battery and inverter temperatures, displayed to the crew | `[GIVEN]` |
| FCS | No autopilot, autothrottle or flight director described; continuous fly-by-wire control laws for hover, wing-borne flight and transition, commanded over two independent data buses | `[GIVEN]` |
| ACT | Electromechanical actuation of the ailerons and V-tail surfaces; no mechanical or hydraulic linkage to the flight deck; position and status reported back to the flight control system and the displays | `[GIVEN]` |
| NAV | A single inertial measurement unit and a single satellite positioning receiver; forward air data probes; low-speed sensors reporting independently at each boom | `[GIVEN]` |
| COM | Two VHF radios and one vertiport datalink transceiver; passenger-address announcements sequenced automatically with pilot override | `[GIVEN]` |
| DAA | Nose, wingtip and tail sensors plus a transponder; two independent processing channels, cross-checked, building the traffic and terrain picture automatically | `[GIVEN]` |
| DIS | Two reconfigurable display surfaces plus a standby display; master caution and warning lights on a dedicated panel; a glareshield acknowledgement switch | `[GIVEN]` |
| LGS | A retractable, wheeled, four-point gear; weight-on-wheels sensed at each main leg; a mechanical downlock at each leg independent of continued actuator power; a manual extension handle in the flight deck | `[GIVEN]` |
| STR | Composite semi-monocoque structure; ground crew inspect gear-bay, battery-bay and boom access panels during turnaround — the pilot's part in that inspection, if any, is not stated | `[GIVEN]`, `[TBD]` for pilot involvement |
| CAB | Six seats, two-two-two, each with a four-point restraint; two doors, each independently latched; no cabin crew; environmental and lighting control from the flight deck | `[GIVEN]` |
| ERS | A guarded activation handle and a separate safe-and-arm switch, both required to fire; a dedicated firing battery independent of the aircraft's main low-voltage distribution; a dedicated flight-deck annunciator for control-unit status | `[GIVEN]` |
| HMS | Continuous recording from both data buses on two independent recorders; a turnaround readiness report compiled at shutdown and reviewed by ground crew before release | `[GIVEN]` |

VAY-SDD-0001 §4 describes six routings — R-1 through R-6 — carrying
high-voltage power, low-voltage power, coolant and the two data buses across
the aircraft's zone boundaries, several of them explicitly on opposite sides
of the fuselage or through physically separated paths through the wing
carry-through. That segregation is a structural and electrical design
property; it is named here because several of the crew-facing facts in the
table above rest on it without saying so outright. The two displays' separate
graphics processors and separate low-voltage feed segments (§6), the two data
buses each display can draw a source from, and DAA's two independently
cross-checked processing channels are each an expression, at the flight-deck
end, of the same left/right and bus-A/bus-B split that the routings maintain
along their whole length. A crew-relevant conclusion that depends on that
segregation continuing to hold all the way to the panel the pilot reads is
exactly the kind of conclusion this document leaves to the analyses that
follow it.

---

## 11 What this document does not do

This document is written the way a flight-deck design description is written,
and it stops where such a document stops.

It tells you what the pilot is given to look at, what they can touch, what the
aircraft will tell them and by what means, and under what conditions they will
be doing it, alone, for up to fourteen legs a day. It does **not** tell you:

- which functions are allocated to the pilot, to automation, or to both;
- what tasks the pilot performs, in what order, in what time, at what workload;
- what the pilot can get wrong, how it would be detected, or how it would be
  recovered;
- which condition produces a Warning, a Caution or an Advisory;
- what the pilot must know at each stage of flight, or whether the flight deck
  lets them know it;
- whether any of the above is adequate, compliant, or acceptable;
- what the minimum flight crew is.

That omission is deliberate and it is not a gap. Deriving those things is the
work. Reading that page selection between the two displays is manual while
their behaviour on a processor loss is unstated implies something about
reversion awareness in a cockpit with nobody else to notice a stuck page; that
a recovery-system annunciator is described as presented through the display
system rather than through an independent path is a claim about failure
independence that has to be tested rather than assumed; that restraint status
is recorded "where sensed" is a claim about detection coverage across six
seats that a pilot working alone cannot verify by cross-check; that an aural
alert tone which shares its path with the radio and the intercom has no stated
arbitration order cannot be relied on by any analysis that assumes the single
pilot hears the right thing first, every time, with nobody in the other seat
to catch what they miss.

Nor does this document say anything about the passenger side of the aircraft
beyond the flight-deck controls that touch it directly — door latches, cabin
lighting, environmental outlets, and the door and restraint indications listed
in §7.3 and §8.4. What the six passengers experience during boarding, flight
and disembarkation, and what if anything they are told or shown, is outside
this document's scope entirely; it covers the flight deck, not the cabin.

### 11.1 Given, preliminary, assumed

**Given** — from the specification or VAY-SDD-0001: one pilot with no cabin
crew, seated on the centreline; six passengers in the cabin; the flight deck
open to the cabin above seat height; boarding as a powered, occupied ground
operation with the pilot remaining seated; two reconfigurable display surfaces
plus a standby display, with page selection manual and either surface able to
show either page; a single centre inceptor and a single energy lever, each with
two independent signal paths to the two flight control computers; no
autopilot, autothrottle or flight director; continuous fly-by-wire control laws
for hover, wing-borne flight and transition, the transition itself sequenced
automatically; a guarded recovery handle and a separate safe-and-arm switch,
both required to fire, with a dedicated firing battery and a dedicated
annunciator; cabin door and latch status shown on a dedicated page and
consulted at boarding and before departure; restraint status recorded "where
sensed"; a turnaround readiness report compiled at shutdown and reviewed by
ground crew before release.

**Preliminary** — expected to move: panel-zone allocation; display format
assignment; phase durations.

**Assumed** — everything else in this document, including the accommodation
range, the training-route description, and the alerting philosophy. Each
should be recorded as an assumption when it is picked up, and challenged.

### 11.2 The open items

Numbered through §4 to §10 and repeated here for tracking: 1–6 geometry and
access; 7–10 displays; 11–14 control actuation; 15–19 automation; 20–25
environment; 26–29 procedures. Two further items are flagged in place rather
than numbered: the independence of the emergency-recovery annunciator from
display and avionics failure modes (§8.3), and the pilot's part, if any, in the
turnaround structural inspection (§10.3, STR row).

Any human-factors conclusion that depends on one of these is provisional on
it, and should say so.

---
