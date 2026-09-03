---
title: "Vayu VY-6 --- Flight Deck & Human Factors Design Description"
subtitle: "VAY-HF-0001 · Issue 1 · 2 September 2026"
---

# Vayu VY-6 --- Flight Deck & Human Factors Design Description

**VAY-HF-0001 · Issue 1 · 2 September 2026**
Companion to VAY-SDD-0001 (Architecture and System Design Description), Issue 1.

> **DEMONSTRATION ARTICLE**
> The Vayu VY-6 is a representative six-passenger electric VTOL air taxi
> constructed by Safety Lab Aero. Aircraft-level characteristics follow published
> information for aircraft in this class and are sourced in Appendix B of
> VAY-SDD-0001. System architecture below aircraft level, the flight deck, and
> every crew task in this document are representative, and are not the design
> data of any manufacturer.
>
> Prepared by Safety Lab Aero.

---

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
| Boarding | about 10 (turnaround figure) |
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


\begin{landscape}
\begin{center}
\includegraphics[width=\linewidth,height=0.92\textheight,keepaspectratio]{fig_vayu_flightdeck.pdf}
\end{center}
\vspace{-4mm}
\noindent\small\textbf{Figure HF-1} --- Flight deck panel arrangement. Panel zones, display and control positions [PRELIM]. Also issued as a standalone drawing sheet.\normalsize
\end{landscape}


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


\begin{landscape}
\begin{center}
\includegraphics[width=\linewidth,height=0.92\textheight,keepaspectratio]{fig_vayu_cockpit_ga.pdf}
\end{center}
\vspace{-4mm}
\noindent\small\textbf{Figure HF-2} --- Cockpit general arrangement, plan and side section. The drawing defines the geometry reference scheme; the values against it are the open items of \S4.3. Also issued as a standalone drawing sheet.\normalsize
\end{landscape}


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


\begin{landscape}
\begin{center}
\includegraphics[width=\linewidth,height=0.92\textheight,keepaspectratio]{fig_vayu_controls.pdf}
\end{center}
\vspace{-4mm}
\noindent\small\textbf{Figure HF-3} --- Flight deck controls. Axes, detents and guarding [PRELIM]; forces and gradients are not defined. Also issued as a standalone drawing sheet.\normalsize
\end{landscape}


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

# Appendix A — Normal operating procedures

## A.1 What these procedures are, and what they are not

Neither VAY-SDD-0001 nor VAY-HF-0001 §1–§11 contains a procedure. Between them
they describe an architecture — sixteen systems, a display suite, a control
set, an alerting capability — and say nothing about the order in which a
pilot uses any of it. Appendix A is therefore **constructed from that
architecture**, written out so that the task and error analyses
this document exists to feed have something concrete to work from instead of
inferring a sequence from a system table every time one is needed.

That has the same three consequences it would have for any aircraft, stated
here because they should be read before any step below is used.

**This is not an approved AFM, POH, or operator procedure.** No flight test
has been flown, no simulator campaign has been run (VAY-HF-0001 §3.1 records
that a full-flight simulator is a planned asset, not an available one), and
no operator has reviewed a single line of it. Status throughout is
`[ASSUMED]` unless a step is marked otherwise, and a step marked `[GIVEN]` is
given only as to the *system behaviour* it rests on — never as to the crew
action, the wording, or the sequence built around that behaviour.

**Speeds, times, quantities and masses are deliberately absent.** No duration
of any kind — how long a phase runs, how long a step takes, how long a
margin lasts — appears anywhere below; VAY-HF-0001 §2.2 carries the phase
durations that exist, and this appendix points to that section by reference
rather than repeating a figure from it. Where a real procedure would give an
approach speed, a rotor RPM, an energy threshold, or a landing distance,
this one says `[TBD]`.

**No task analysis has been performed on any of it.** These procedures state
what the pilot does. They do not decompose that into how the task divides,
which step could be got wrong or how, what it costs the pilot to do it, or
whether the aircraft asks one person for more than one person can give. That
is the work the analyses do; this appendix is their input, not a pre-emption
of their conclusion.

One consequence is specific to this aircraft and worth stating before §A.2
develops it. Every procedure below is written for a flight deck with **one**
occupant. There is no second pilot to read a step back, confirm a setting,
or notice what the first pilot missed. A step that reads as obviously
fragile because nobody is there to catch an error in it is a finding worth
raising against the design, not a gap in the writing of the procedure.

## A.2 Crew complement and the absence of a duty split `[GIVEN]`

One pilot, on the aircraft centreline. Six passengers, aft, in the cabin. No
cabin crew. VAY-HF-0001 §3 states plainly that the operating convention is a
"single continuous pilot duty" and that "no Pilot Flying / Pilot Monitoring
exchange is possible" — there is one seat, so there is no second occupant to
exchange the role with in the first place.

That is stated here as the governing fact for everything that follows, not
as a finding about whether it is enough. VAY-HF-0001 §3 is explicit that the
one-pilot figure "is an input, not an answer," and this appendix inherits
that position without modification. Every procedure below is written for a
crew of one because that is what the specification gives; whether it should
be is the minimum-flight-crew determination, and this document does not make
it.

Three things follow directly from having one seat, and each is worth
stating plainly because a two-crew procedure would not need to say it.

**Every check in this appendix is the pilot's own.** Where a two-crew
procedure would have one pilot set something and the other confirm it, this
aircraft has one pilot do both — read the indication, make the selection,
and re-read the indication, in sequence, because there is nobody positioned
to do the second half of that pair independently. No step below is written
as a challenge and a response, because there is only one voice on the flight
deck to challenge or respond.

**Ground staff are a separate party, not a second crew member.** VAY-HF-0001
§4.1 and §7.3 both record that passenger-readiness confirmation before
departure falls to "the pilot or ground staff" — without settling which, or
how the two would divide it if both are involved. Where a step below
involves ground staff, it is written as a handover between two parties, not
as a division of one crew's duty, and the cross-check made at that handover
is `[TBD]` — open item 29 in the body document, carried into every relevant
step below.

**There is no jumpseat and no way to observe the pilot flying the aircraft
as flown.** VAY-HF-0001 §3 records that no jumpseat or observer position is
described on the flight deck, so a check pilot or instructor cannot occupy
it during a revenue sector. Nothing in this appendix assumes a second
person is ever present for training, checking, or handover purposes; where
a step would benefit from one, that absence is named rather than worked
around.

## A.3 Checklist medium and philosophy `[ASSUMED]`

Neither document describes a checklist. VAY-HF-0001 §10.1 already carries
this as open item 26 — "backup medium for procedures — paper, electronic,
or none, is not defined" — and nothing found while writing this appendix
narrows it. What follows is the minimum that can honestly be assumed, not a
design.

The alerting capability at §8.1 of the body document gives an alert
message, an aural tone, and for some conditions a light. Acknowledgement is
a glareshield switch, after which the pilot can call up the associated
system page — but whether that page carries the alert's procedure or only
the system's status is `[TBD]`, open item 28. A normal checklist, if one
exists in electronic form, most plausibly rides the same two display
surfaces that carry everything else; nothing in VAY-SDD-0001 confirms that a
normal-checklist page exists at all, as distinct from the synoptic and
status pages §6.2 lists. Whether normal procedures are presented
electronically, on paper, from memory, or in some combination is
`[TBD]` — open item 26 again.

**Challenge-and-response has no meaning here.** With one voice on the flight
deck, a normal checklist can be read and actioned by the same person, or
flown without being read at all and merely referenced afterward — the two
are procedurally different and this document does not choose between them,
because nothing in either source document does. The steps below are written
as a sequence of pilot actions and confirmations without a stated medium,
consistent with the honest gap this section records rather than papering
over it with an assumed challenge-and-response convention borrowed from a
two-crew aircraft it would not fit.

No default power-up state for any panel is described in VAY-SDD-0001 — no
overhead panel is confirmed to exist at all (VAY-HF-0001 §4.2), so a
"dark-cockpit" convention cannot honestly be assumed for it the way it might
be for a conventional layout. The steps in §A.4.1 therefore state positively
what is confirmed, rather than relying on an assumed starting condition for
anything not explicitly checked.

## A.4 Ground procedures

### A.4.1 Flight deck preparation and power-up

1. Ground or network power established, or the aircraft's own stored energy
   used directly — VAY-SDD-0001 describes no auxiliary power unit or third
   source distinct from the two battery packs and whatever ground supply a
   pad offers `[GIVEN]`. Which source is normal for flight-deck power-up
   before departure, and how the transfer between them is confirmed, is
   `[TBD]`.
2. Displays — two reconfigurable surfaces, each on its own graphics
   processor, plus the standby display `[GIVEN]`. Confirm both main surfaces
   present a picture and that each can be set, at the bezel keys, to any
   available page. Confirm the standby display presents attitude, airspeed
   and altitude equivalents; its independence from the primary displays'
   supply, sensor and processing paths is not stated `[TBD]` — open item 10.
3. Flight-path and energy inputs — centre inceptor and left-hand energy
   lever. Each sends two independent signals to the two flight control
   computers `[GIVEN]`. Confirm both respond and that no degraded-law
   indication is presented; whether any mode or law annunciation exists at
   all to confirm against is `[TBD]` — open item 15.
4. Energy state — HVB charge and health for both battery packs, checked
   against the figures displayed continuously on the power/energy page
   `[GIVEN]`. Confirm both packs report and that no fault is shown.
5. Electrical distribution — EPD bus voltage, tie-contactor state and
   isolation resistance for both high-voltage bus sections, displayed on the
   same page `[GIVEN]`. Confirm nominal on both sections.
6. Thermal — TMS coolant temperature on each of the two loops, and battery
   and inverter temperatures, displayed alongside the electrical data
   `[GIVEN]`. Pump speed on each loop is modulated automatically from
   reported heat load and takes no crew selection `[GIVEN]`; confirm
   temperatures only.
7. Emergency recovery system — safe-and-arm switch position confirmed
   against the phase of flight (ground, in this case), and the dedicated
   annunciator near the activation handle checked for armed state and
   fault `[GIVEN]`. Whether that annunciator's supply and processing are
   independent of the two primary displays' own failure modes is `[TBD]` —
   flagged at §8.3 of the body document and not resolved by this appendix.
8. Crew oxygen — **not applicable.** VAY-SDD-0001 describes no oxygen
   system, and VAY-HF-0001 §3 records the absence as a design fact rather
   than an oversight: cruise altitude is well below where crew oxygen would
   ordinarily be a design feature. No check exists because nothing exists to
   check.
9. Navigation reference — one inertial measurement unit and one satellite
   positioning receiver, both singular rather than duplicated `[GIVEN]`;
   forward air data probes; low-speed sensors reporting independently at
   each boom root. Confirm each source valid. What the primary displays do
   if the single inertial or satellite source is lost is `[TBD]`, noted at
   §6.1 of the body document without being carried into its own numbered
   open item there; it is nonetheless a real gap in this step and is picked
   up at open item 32 below.
10. Alerting list — confirm no open alert on either display, or account for
    each individually. With one reader and no second set of eyes, an alert
    accepted here and forgotten has nobody else positioned to notice it
    later.
11. Flight management — route loaded. Loading plan and passenger data, where
    they affect mass and centre of gravity, are addressed at §A.4.3.

### A.4.2 Exterior inspection `[ASSUMED]`

Neither document describes an exterior inspection, who performs it, or what
it covers. VAY-HF-0001 §10.3 records only that ground crew inspect
gear-bay, battery-bay and boom access panels **during turnaround**, with the
pilot's part in that inspection, if any, left unstated. Whether a
first-flight-of-the-day walkaround exists as a distinct, pilot-performed
step — separate from the ground crew's turnaround inspection — is `[TBD]`,
open item 39. What follows is written on the assumption that some exterior
check precedes the day's first departure, because it is difficult to
imagine the type flying without one; its content below is constructed, not
sourced.

The aircraft has no hydraulic system in its crew-facing description — flap,
gear and flight-control actuation are electromechanical throughout
(VAY-HF-0001 §7.1, ACT and LGS rows of §10.3) — so this inspection has none
of the fluid, quantity or leak checks a hydraulically-actuated type would
carry. Four items are particular to this aircraft:

**The eight lift rotors, on their two booms**, each with its own
stop-and-align mechanism `[GIVEN]`. In the cruise-stowed condition the
blades lock edge-on to the airflow; before the day's first vertical
departure they are inspected in whatever position the stop-and-align
mechanism leaves them, for blade condition and for freedom of the mechanism
itself. No indication is described for confirming that condition from
outside the aircraft, as distinct from the flight-deck indication checked
in §A.4.1; the walkaround is a visual check standing in for one.

**The two wing-mounted cruise propellers**, inspected for blade condition
in their stowed orientation, on the same basis as the lift rotors above.

**The landing gear** — a retractable, wheeled, four-point arrangement, with
a mechanical downlock at each leg independent of continued actuator power
`[GIVEN]`. Inspected for general condition and for whatever downlock
indication, if any, is visible from outside the aircraft; none is named in
either document.

**The two cabin doors**, each with an independent electric latch actuator
and its own manual release lever `[GIVEN]`. The manual release lever at
each door is checked for accessibility and condition — it is the only
non-electric means of opening a door that either document describes, and
its value depends on it working when the electric latch does not.

### A.4.3 Energy state and dispatch decision `[GIVEN]` as to the constraint, `[ASSUMED]` as to the procedure

The operating concept gives energy replenishment only at defined points in
the network, not at every pad (VAY-HF-0001 §2, `[GIVEN]`). That is the
direct analogue of a fuel-availability constraint on a conventional type,
and it produces the same shape of dispatch question — can the airframe, as
it stands, complete the sector or sectors ahead of it and still reach a
point where it can recharge — without either document supplying an answer.

1. HVB charge and health for both packs, and TMS coolant and cell
   temperatures, checked against the day's planned sequence of legs. Both
   packs' state feeds FCS "for energy planning" `[GIVEN]`; what that
   planning function shows the pilot, if anything beyond the raw
   charge and temperature figures, is `[TBD]`.
2. Confirm the pad or pads ahead on the planned sequence include a
   network charging point within whatever margin the operator holds, or
   that the day's remaining legs can be flown and closed out on-board
   charge alone. **No minimum-energy threshold, display cue, or decision
   point is named in either source document** — this is stated as a design
   fact at VAY-HF-0001 §9 without being given its own tracking number
   there; it is carried forward here as open item 31, because a dispatch
   decision cannot honestly be written as a checklist item against a
   threshold that does not exist.
3. Where a pad ahead is a charging point, confirm (or plan to confirm on
   arrival) that ground charging equipment is available and compatible.
   EPD reconfigures contactors to route charge current "under FCS
   supervision," and each pack's controller accepts current independently
   `[GIVEN]`; whether that supervision needs a pilot-initiated step or runs
   without one is `[TBD]` — open item 30, picked up again at §A.9.
4. Dispatch fitness of the airframe otherwise — no minimum equipment list
   exists for this type in either document, and the procedural form of a
   dispatch decision (who makes it, against what, and where it is
   recorded) is `[TBD]`, in the same shape as the energy question above but
   without even a partial answer. Unlike a type with line maintenance
   available at intermediate stops, VY-6 has none `[GIVEN]`, so a deferral
   accepted at the start of a duty day has to hold for every one of the
   eight to fourteen sectors that follow it, with no maintenance
   organisation and no second pilot anywhere in that day to revisit the
   decision.

## A.5 Passenger handling on the pad

### A.5.1 Boarding with the aircraft powered `[GIVEN]` as to the condition, `[ASSUMED]` as to the sequence

Boarding is a ground operation conducted with the aircraft powered and the
pilot remaining in the seat throughout `[GIVEN]`. It is the normal condition
for every one of the type's eight to fourteen daily turnarounds, not an
exceptional event, and it happens with nothing separating the flight deck
from the cabin but open space above seat height — VAY-SDD-0001 describes no
door or partition `[GIVEN]`.

1. Doors — release commanded once the aircraft is confirmed at the pad
   `[GIVEN]`. The flight-deck control by which that release is actually
   commanded is not named — a dedicated panel, a function on an existing
   one, or something else — `[TBD]`.
2. Cabin lighting and environmental outlets — set for boarding. Both are
   adjustable by the pilot from the flight deck `[GIVEN]`.
3. Passenger-address announcement — sequenced automatically from
   flight-phase information as boarding begins, with no pilot input
   required `[GIVEN]`. The pilot can override from the flight-deck
   microphone `[GIVEN]`; content of any manual override is not addressed by
   either document.
4. Passenger boarding itself — conducted by the passengers, by ground
   staff, or by some combination; neither document names who assists whom
   physically, only that no cabin crew does it `[GIVEN]`.
5. Readiness confirmation — the pilot or ground staff confirm each
   passenger is seated and restrained before doors are requested closed
   `[GIVEN]`. How that confirmation is made is `[TBD]` — the pilot's direct
   sightline over the open flight-deck/cabin boundary, a display
   indication, a ground-staff signal, or more than one of these are all
   named as possibilities in VAY-HF-0001 §4.1 and §7.3 without any being
   selected. This is open item 29 from the body document, and it is the
   single largest procedural hole in this section: every other step here
   can be written with some confidence about what the pilot does; this one
   cannot, because the method of confirmation is not settled.

### A.5.2 Restraint and door closure `[GIVEN]` as to the equipment, `[ASSUMED]` as to the sequence

1. Restraint status — six four-point restraints, two-two-two, checked
   against the cabin synoptic page `[GIVEN]`. Buckle status is recorded
   "where sensed," a qualifier VAY-HF-0001 §7.3 and §8.4 both use without
   stating which of the six positions are instrumented and which are not.
   For any position not reporting, confirmation is by whatever means §A.5.1
   step 5 above resolves to, once it is resolved; today it is `[TBD]`.
2. Door and latch status — both doors confirmed closed and latched on the
   cabin synoptic page, described specifically as consulted "during
   boarding and before departure" `[GIVEN]`. This is one of the two
   conditions VAY-HF-0001 §8.4 singles out by name for crew attention at
   these points in the turnaround; the other is restraint status above.
3. Manual release levers — confirmed stowed and not fouled, at both doors.
4. Cabin lighting and environmental outlets — reset from the boarding
   configuration if different for departure.

### A.5.3 Passenger briefing `[TBD]` throughout

Neither document addresses passenger briefing content or medium. What is
established is the boundary of what the flight deck can do: an automatic
passenger-address announcement sequenced by flight phase, and a pilot
override from the flight-deck microphone `[GIVEN]`, §A.5.1 above. Nothing
beyond that — restraint-use instruction, brace guidance, emergency egress
information, or anything said about the guarded emergency-recovery system
at the centre console — is named in either document. VAY-HF-0001 §11 states
explicitly that the passenger side of the aircraft is outside its scope
except at the flight-deck controls that touch it directly; this appendix
inherits that boundary rather than filling it in. Passenger briefing content
and delivery medium is open item 37.

With no cabin crew to deliver a live briefing from within the cabin, and
the pilot seated forward through the whole of boarding, whatever briefing
passengers receive is either recorded content carried on the automatic
announcement, a safety card or equivalent placed in the cabin, the pilot's
microphone override, or some combination — none of which either document
names.

## A.6 Departure

### A.6.1 Before start

1. Restraint and door closure — confirmed complete (§A.5.2).
2. Energy state and dispatch margin — confirmed (§A.4.3).
3. Mass and centre of gravity — six passengers of varying individual mass,
   loaded leg to leg with a different combination each time, change the
   aircraft's mass and inertia distribution in a way VAY-HF-0001 §9 records
   as unresolved for the control-law and transition-threshold schedule
   (open item 19). Whether a load-and-balance computation is performed
   before each departure, by what means, and against what limits, is not
   stated by either document `[TBD]` — open item 38.
4. Departure briefing — including the loss of one propulsor. Ten
   independent inverter-motor units, one per propulsor, with the flight
   control system redistributing torque across the survivors on the loss
   of any one, and no gearbox coupling a failure to a neighbour `[GIVEN]`.
   No described crew action follows a single propulsor loss during a
   vertical departure — the redistribution is stated as automatic and
   nothing in either document names a pilot response to confirm, refuse, or
   act on top of it. The briefing states what is known: that the system
   redistributes automatically. What the pilot would additionally do is
   `[TBD]`.
5. Take-off, or vertical-departure, configuration check — **no such check
   is described in any form.** VAY-HF-0001 §10.1 states this plainly: no
   configuration monitor, and no stated parameter set for one, appears
   anywhere across the sixteen system descriptions. Where a conventional
   transport would have a discrete configuration-monitor input covering
   flaps, trim, doors and the like, this aircraft has nothing named at all.
   Whether some check exists that has simply not been described, or
   whether none exists, is `[TBD]` — open item 32. The steps at §A.6.2
   below are the closest this appendix can honestly come to one, built from
   the individual indications that do exist rather than from a monitor
   that does not.

### A.6.2 Rotor spin-up and pad checks

1. Lift rotors — eight, on two booms, released from the cruise-stowed
   edge-on position by the stop-and-align mechanisms and brought to a
   condition ready for hover thrust `[GIVEN]` as to the mechanism, `[TBD]`
   as to what confirms it from the flight deck. No indication is named for
   distinguishing "rotors ready" from "rotors stowed" on either display.
2. Weight-on-wheels — sensed at each main gear leg, driving the flight
   control system's automatic selection between ground and air behaviour
   with no pilot selection `[GIVEN]`.
3. Traffic and terrain — dedicated DAA page called up, described in
   VAY-HF-0001 §6.2 as "monitored during pad approach and departure"
   `[GIVEN]`. Confirm the picture presented and no unresolved track close
   to the pad.
4. Restraint and door/latch status — final confirmation, repeating §A.5.2
   steps 1 and 2. These two are checked again here because they are the
   two conditions VAY-HF-0001 §8.4 names specifically as consulted "before
   departure," distinct from being checked once during boarding and
   assumed to hold.
5. Energy, electrical and thermal indications — confirmed nominal, per
   §A.4.1 steps 4 through 6, immediately before commanding a departure.

### A.6.3 Vertical departure

1. Centre inceptor — commands flight path in the hover control law; energy
   lever commands power. Both send independent signals to the two flight
   control computers `[GIVEN]`. What envelope protection, if any, is
   provided in hover is `[TBD]` — open item 16.
2. Displays — the pilot selects, at the bezel keys, whichever pages the
   departure needs across the two reconfigurable surfaces: a flight page,
   the traffic and terrain page, and whatever else the moment calls for.
   Page selection is manual throughout, with no stated default assignment
   by phase `[GIVEN]` as to the manual selection, `[TBD]` — open item 8 —
   as to any default. With one reader and two surfaces to divide between a
   flight page and everything else, what is not on either surface at a
   given moment is, for that moment, not being read.
3. Climb continues to whatever height precedes the transition; VAY-HF-0001
   §2.2 treats the vertical-departure phase and the transition below as one
   figure rather than describing a separate climb segment ahead of it.

### A.6.4 Transition to wing-borne flight

The transition is sequenced by the flight control system, not commanded by
a discrete pilot selection. It commands the lift-rotor stop-and-align
mechanisms "once conditions permit," shifting authority from rotor thrust
to aerodynamic surfaces as airspeed builds `[GIVEN]`.

1. The pilot's part is to continue flying the aircraft through the
   sequence on the same centre inceptor and energy lever used throughout
   the departure, and to read whatever the displays show while it happens
   `[GIVEN]` — VAY-HF-0001 §2.1 states this almost exactly: what stays with
   the pilot "is flying the aircraft through it and reading whatever the
   displays and alerting system show while it happens." No initiating
   selection is made because none is described.
2. **No mode or transition annunciation is confirmed to exist.** Whether
   the pilot has any positive indication that the transition has begun,
   is proceeding normally, or has completed — as distinct from inferring
   it from airspeed and control feel — is `[TBD]`, open item 15. This
   sequence runs, automatically, up to twenty-eight times a day for one
   aircraft (fourteen sectors, two transitions each, VAY-HF-0001 §2.1),
   flown by the same one pilot every time, and the absence of a confirmed
   annunciation for it is stated here as a fact worth the analyses'
   attention rather than worked around with an assumed indication that
   would not survive scrutiny.
3. Any automatic reversion of the transition back toward hover, and any
   alerting associated with it, is `[TBD]` — open item 17. No step is
   written for a reverted transition because no reversion behaviour is
   described to write one against.

## A.7 Cruise

Wing-borne cruise, per the phase split at VAY-HF-0001 §2.2, is the settled
middle segment of the sector, flown at 300 to 600 m above the city on a 20
to 30 km sector `[GIVEN]`. Four things are read continuously, each
corresponding to a system this aircraft carries that a conventional type
either does not have or does not expose to the crew in the same way:

1. **Energy state.** HVB charge and health for both packs; EPD bus
   voltage, tie-contactor state and isolation resistance for both bus
   sections; TMS coolant temperature on each loop and battery and inverter
   temperatures — all displayed continuously `[GIVEN]`. As at §A.4.3, no
   minimum-energy threshold or decision cue exists to read this
   information against; the pilot has the raw figures and no stated
   trigger point.
2. **Traffic and terrain.** The DAA page, built from two independently
   cross-checked processing channels, falling back to the local sensor
   picture alone if the transponder path is affected, with no stated pilot
   action to trigger that fallback `[GIVEN]`.
3. **Cabin state.** Door, latch and restraint status remain on the cabin
   synoptic page through the cruise. In flight this is indication only —
   neither document describes any means of adjusting a restraint from the
   flight deck once the aircraft is airborne, in the same way a
   conventional type's crew cannot reach a cabin restraint once seated
   forward.
4. **Communications.** Two VHF radios and the vertiport datalink, sharing
   the same audio path as the alert tone generator, which is the same path
   the cabin intercom would use if the intercom and the flight-deck
   microphone connect to it `[GIVEN]`. Arbitration between an alert tone
   and a radio call on that shared path is `[TBD]`, carried from §8.1 of
   the body document.

No routine crew selection is described for propulsion allocation across
the ten propulsors, for thermal management, or for electrical
configuration in normal cruise flight — VAY-HF-0001 §9 states each of
these as automatic, with no crew-facing control named for overriding any
of them in the ordinary case `[GIVEN]`. The routine selections that remain
with the pilot are page assignment between the two displays, and cabin
lighting or environmental outlet adjustment if a passenger requests it
through whatever means either document leaves unstated.

## A.8 Arrival

### A.8.1 Descent and approach preparation

1. Destination pad assessment — an elevated structure among buildings,
   with shear and turbulence off nearby surfaces a normal operating
   condition `[GIVEN]`, VAY-HF-0001 §10.2. **No measured wind, shear or
   obstacle data exists for any specific pad**, and no means is described
   by which the pilot learns pad-specific conditions before committing to
   an approach — `[TBD]`, open item 33.
2. Landing performance — no mass or wind limit is stated for a vertical
   landing at a given pad, and no performance margin equivalent to a
   runway-distance requirement exists for this aircraft, because it does
   not need a runway `[GIVEN]` as to the absence of the runway case,
   `[TBD]` as to any hover-landing performance figure that replaces it —
   open item 34.
3. Approach briefing — including the transition to hover-borne flight
   ahead, the building-shaded pad environment, and what the pilot intends
   to do if the approach cannot be continued to landing. No go-around or
   diversion procedure specific to a rejected pad approach is described in
   either document; the briefing states the intention against a procedure
   that does not yet exist.
4. Lighting and visual environment — day and night operation are both
   named `[GIVEN]`, but pad lighting, surrounding-structure visibility at
   night, and low-sun conditions have no measured data behind them
   `[TBD]`, open items 22 and 24 from the body document.

### A.8.2 Transition to hover

The reverse of §A.6.4. As airspeed reduces, the flight control system
sequences the transition back into hover, releasing the lift-rotor
stop-and-align mechanisms and shifting authority from aerodynamic surfaces
back to rotor thrust `[GIVEN]` — VAY-HF-0001 §9 states the departure
sequence and adds "the reverse on the way back into hover" without
describing the reverse sequence separately. The same absence of a
confirmed mode or transition annunciation applies here as at §A.6.4, and it
is the same open item, not a second one.

### A.8.3 Approach and landing on the pad

1. The pilot flies the descent and approach on the centre inceptor and
   energy lever in the hover control law, reading the flight page and the
   DAA traffic and terrain page across the two display surfaces (manual
   selection, §A.6.3 step 2 applies equally here). What envelope protection
   exists in hover is the same open gap noted at §A.6.3 step 1.
2. External vision — over-nose and over-side cut-off angles from the
   design eye position are not yet defined `[TBD]`, open item 2 of the
   body document, and VAY-HF-0001 §4.1 names this approach specifically as
   the phase where that gap matters most: close-quarters visibility of the
   pad edge and the surrounding structures depends on it directly.
3. Landing gear — extension is pilot-commanded, not automatic; each leg is
   observed individually on the display as it cycles, with a manual
   extension handle available if the electric actuators do not respond
   `[GIVEN]`. Confirm all four legs down, with the mechanical downlock at
   each leg independent of continued actuator power `[GIVEN]`.
4. Touchdown — weight-on-wheels sensed at the main legs, and the flight
   control system's ground/air behaviour selected automatically with no
   pilot action `[GIVEN]`. No wind limit, mass limit, or flare technique is
   stated for the landing itself `[TBD]`, the same gap noted at §A.8.1
   step 2.
5. Ground manoeuvring on the pad, if any is needed to position the
   aircraft after touchdown — neither document describes rudder pedals, a
   yaw pedal, or any directional-control input separate from the centre
   inceptor `[TBD]`, open item 14 of the body document. Whether the
   aircraft repositions itself on the pad surface at all after a vertical
   landing, and by what control input if so, is accordingly unresolved;
   no taxi procedure is written here because nothing in either source
   document describes a taxi capability to write one against.

## A.9 Turnaround

The turnaround is a powered, occupied event, not a shutdown. The aircraft
stays energised, the pilot stays in the seat, and this repeats eight to
fourteen times a day `[GIVEN]`, VAY-HF-0001 §2.1 (§2.2 gives the phase's
nominal length). Nothing below assumes the systems secured at §A.10 are
touched during a normal turnaround; that section describes a different,
end-of-day event.

1. Deboarding — the reverse of §A.5, with the arrival passenger-address
   announcement sequenced automatically from flight-phase information and
   the same pilot microphone override available `[GIVEN]`.
2. Door release — commanded once the aircraft is confirmed at the pad
   `[GIVEN]`, by whatever flight-deck control §A.5.1 step 1 eventually
   resolves to.
3. Ground charging, where the pad is a network charging point — EPD
   reconfigures contactors "under FCS supervision" `[GIVEN]`; whether that
   requires a pilot-initiated step, runs automatically once ground
   equipment connects, or something between the two, is `[TBD]`, open item
   30. Where the pad is not a charging point, no replenishment occurs and
   this step does not apply — the day's energy plan from §A.4.3 has to
   already account for that.
4. Next-leg boarding, restraint and door closure — the whole of §A.5,
   repeated. On a short turnaround with no cabin crew, this is the pilot's
   task alongside whatever charging monitoring step 3 above adds, with
   nobody else on the flight deck to divide the window between them.
5. Turnaround readiness — VAY-HF-0001 §10.1 records that a turnaround
   readiness report is compiled by HMS **at engine shutdown** and reviewed
   by ground crew before the aircraft is released for its next flight
   `[GIVEN]`. A normal turnaround, by the design recorded at §2 of the body
   document, does not shut the aircraft down. Whether any
   check exists at each of the eight to fourteen daily turnarounds that
   do **not** trigger that report — as distinct from the report generated
   once, at the end of the duty day — is not stated by either document
   `[TBD]`, open item 35.

With no line maintenance available at the pad `[GIVEN]`, any anomaly
noticed during a turnaround has no local remedy. The dispatch judgment made
once at §A.4.3, before the first sector of the day, is in effect asked to
hold across every turnaround that follows it, without a maintenance
organisation and without a second pilot anywhere in the day to revisit it.
That is stated here as a consequence of the operating concept, not as a
finding that the concept is unworkable.

## A.10 Shutdown and handover

Unlike the turnaround at §A.9, this section describes the end of a duty
period or a return to a network point for a full stop — not a normal
between-sector event.

1. Systems secured — HVB packs, EPD bus sections and contactors, TMS
   pumps, brought to their shutdown state. No sequence is stated in either
   document `[TBD]`.
2. Emergency recovery system — safe-and-arm switch set to its ground state,
   consistent with the phase-of-flight logic described at VAY-HF-0001 §9
   `[GIVEN]` as to the switch existing and being phase-dependent, `[ASSUMED]`
   as to this specific selection.
3. Turnaround readiness report — compiled by HMS at shutdown, from
   continuous recording on both data buses across two independent
   recorders `[GIVEN]`. This is the report referred to but not generated
   at §A.9 step 5 above; here, at an actual shutdown, it is produced.
4. Handover to ground crew — the report is reviewed at a maintenance
   terminal before the aircraft is released for its next flight `[GIVEN]`.
   The pilot's own part in that release decision, beyond calling up recent
   recorded events on a maintenance page if needed, is not stated
   `[TBD]`.
5. Handover to another pilot, where the aircraft's next duty is flown by
   someone else — content and method are `[TBD]`, open item 36. With no
   jumpseat or observer position on the flight deck (VAY-HF-0001 §3), an
   in-person handover briefing conducted on the aircraft, in the way a
   two-crew type might manage one, has no seat to happen from.

## A.11 Normal-procedure open items

These are the holes in Appendix A specifically, numbered onward from the
twenty-nine items already tracked at §10.1 and §11.2 of the body document.

30. **Ground/network charging initiation.** Whether the pilot-facing side
    of EPD's charge-contactor reconfiguration is a pilot-initiated step, an
    automatic one, or something between the two (§A.4.3, §A.9).
31. **Energy dispatch threshold.** No minimum-energy figure, display cue,
    or decision point for completing a sector and reaching a network
    charging point is named anywhere in either document (§A.4.3, §A.7).
32. **Pre-departure configuration check.** Whether anything resembling a
    take-off or vertical-departure configuration check exists, and what it
    covers if so — none is described in any form in VAY-SDD-0001 (§A.6.1,
    §A.6.2).
33. **Pad-specific condition assessment.** How the pilot learns wind,
    shear, obstacle and lighting conditions at a specific destination pad
    before committing to an approach (§A.8.1).
34. **Vertical-landing performance data.** Mass and wind limits for a
    landing at a given pad; no figure of any kind replaces the
    runway-distance requirement this type does not need (§A.8.1, §A.8.3).
35. **Turnaround-level readiness check.** Whether anything checks the
    aircraft at each of the eight to fourteen daily turnarounds that do
    not trigger the shutdown-generated HMS readiness report (§A.9).
36. **End-of-duty handover.** Content and method of a handover between
    pilots at change of duty, with no jumpseat or observer position to
    support one delivered on the aircraft (§A.10).
37. **Passenger safety-briefing content and medium.** Beyond the automatic
    phase-triggered announcement and the pilot's microphone override,
    nothing is named for restraint use, brace guidance, egress, or the
    emergency-recovery system (§A.5.3).
38. **Load and centre-of-gravity computation.** Whether, and how, a
    load-and-balance check is performed before each departure given that
    six passengers of varying mass change the loaded condition leg to leg
    (§A.6.1).
39. **Pre-flight exterior inspection.** Whether a pilot-performed
    walkaround exists ahead of the day's first departure, distinct from
    the ground crew's turnaround inspection of gear-bay, battery-bay and
    boom access panels, and what it would cover if so (§A.4.2).

Any procedure step above that rests on one of these — and most do — is
provisional on it, in exactly the sense §11.2 of the body document already
states for items 1 through 29.

# Appendix B — Non-normal procedures

## B.1 What these procedures are

Neither VAY-SDD-0001 nor VAY-HF-0001 §1–§11 contains a procedure, and Appendix
A already states plainly that this document constructs procedures from the
architecture rather than reporting ones that already exist. The same is true
here, with one further complication Appendix A did not carry: a non-normal
condition is, by definition, one the architecture was not necessarily built to
make easy to read, and constructing a procedure for it means saying, honestly,
when the architecture gives the pilot nothing to read at all.

Everything below inherits Appendix A's governing fact without repeating its
full statement: one pilot, on the centreline, with no second occupant to
confirm a reading, repeat a step back, or notice what the first reading
missed. Where Appendix A could note that absence once at §A.2 and let each
later step stand on it, a non-normal procedure needs the same absence stated
at the point it bites hardest — where a two-crew flight deck would routinely
divide a look at the alert list from a hand on the aircraft, and this one
cannot.

Each entry below describes an indication and an action: what appears on a
display, an annunciator or a light, and what the pilot does about it, once.
Where the source material gives no indication, or no action, or neither, the
entry says so rather than inventing one. Conditions with no stated action of
any kind are marked in the text and collected at §B.15 — the intended purpose
of that section is to give the safety and human-factors assessments a
starting list of the places a design decision has to close a gap that no
procedure can, not to catalogue the design's shortcomings for their own sake.

No memory-item set is proposed here, for the same reason Appendix A does not
propose a checklist medium: VAY-HF-0001 §10.1 carries "memory (recall) item
set" as open item 27, unresolved, and nothing in this appendix's construction
narrows it. Several entries below read as needing to be done before any list
could plausibly be read; each is left exactly that unresolved for the
analysis to take up, not pre-empted with a memory-item designation this
document has no basis to assign.

## B.2 Battery and energy (HVB)

Two independent battery packs, each of four strings, feed the aircraft's two
high-voltage bus sides through a normally-open tie contactor. The packs sit in
a sealed bay beneath the cabin floor, vented overboard. Charge and health data
for both packs are displayed to the pilot continuously, on the same
power/energy page that carries EPD's bus voltage, contactor state and
isolation resistance, and TMS's coolant and cell temperatures (VAY-HF-0001
§6.2). `[GIVEN]`

### B.2.1 Single string isolated

1. Indication — the power/energy page shows whatever change a string's
   isolation produces in the affected pack's reported charge or health
   figure. Whether the page carries a status distinct at the level of an
   individual string, as opposed to the pack-level charge and health
   VAY-HF-0001 §6.2 names, is not stated by either source document; nothing
   in the architecture as described distinguishes "one string down" from
   "the pack's aggregate figure moved." `[TBD]` — open item 40.
2. Action — confirm the affected pack's remaining charge and health against
   the day's planned sequence of legs (§A.4.3 of Appendix A applies equally
   in flight). No contactor selection is named for isolating or restoring a
   single string from the flight deck.
3. Continue the sector, or revise the day's remaining legs against the
   reduced pack capacity, using the same raw charge and health figures
   Appendix A already notes have no stated minimum-energy threshold behind
   them (open item 31).

### B.2.2 Pack temperature rise

1. Indication — battery and inverter temperatures for both packs, displayed
   continuously alongside per-loop coolant temperature on the power/energy
   page. `[GIVEN]`
2. Action — coolant pump speed on each loop is modulated automatically from
   reported heat load, with no described crew selection (VAY-HF-0001 §9).
   §7.2 of the body document names exactly this gap — "selecting a
   coolant-loop configuration" — as a thing the systems do without a stated
   flight-deck control for a pilot override. `[TBD]` — open item 41.
3. The only action either document supports is a change to the flight
   itself — reducing commanded power through the energy lever, or ending
   the sector — rather than any direct intervention in the thermal system.

### B.2.3 Energy below plan

1. Indication — the same continuous charge, health, bus and coolant figures
   read throughout normal cruise (Appendix A §A.7 item 1), with no
   minimum-energy threshold, display cue or decision point named anywhere
   in either source document. `[TBD]` — open item 31, restated here because
   it applies to an in-flight recognition of the condition, not only to the
   pre-departure dispatch decision Appendix A tracks it against.
2. Action — assess the figures against the day's planned sequence of legs
   and the location of the nearest network charging point (§A.4.3), and
   revise the plan — divert to a charging point, or curtail the remaining
   legs — using judgement the design gives no cue to anchor.

## B.3 Electrical distribution (EPD)

Two high-voltage bus sides, joined by a single normally-open tie contactor;
bus voltage, contactor state and isolation resistance for both sides
displayed continuously. `[GIVEN]`

### B.3.1 Loss of one high-voltage bus side

1. Indication — bus voltage and contactor state on the power/energy page
   show the affected side unpowered.
2. Action — whether the tie contactor can be closed by a pilot selection to
   feed the affected side's loads from the remaining side, whether closure
   is automatic, or whether it is not available at all in flight, is not
   stated. §7.2 of the body document names "closing or opening the
   electrical bus-tie contactor" specifically, without a stated flight-deck
   control for pilot override or manual selection. `[TBD]` — open item 42.
3. Confirm which propulsors, displays or other loads draw from the affected
   side — §10.3's routing note records that the two displays' separate
   graphics processors and feed segments follow the same left/right split as
   the bus sides — and continue the sector on whatever the remaining side and
   the automatic reconfiguration, if any, leave available.

### B.3.2 Low-voltage bus loss

1. Indication — not described. VAY-SDD-0001 names a low-voltage distribution
   system only in passing — as what the emergency recovery system's
   dedicated firing battery is independent of (§8.3 of the body document),
   and as the feed for cabin lighting's two strings (§7.3) — without
   describing its architecture, its display, or what depends on it beyond
   those two mentions.
2. Action — none is stated, because neither the indication nor the
   consequence of a low-voltage bus loss is described anywhere in the
   source material. `[TBD]` — open item 43. This gap sits squarely inside the
   pattern §B.1 describes: a condition the architecture does not yet give
   the pilot any means of reading.

### B.3.3 Insulation monitor indication

1. Indication — isolation resistance for both bus sides, displayed
   continuously on the power/energy page alongside bus voltage and
   contactor state.
2. Action — no threshold, no annunciation behaviour distinct from the
   continuous reading, and no procedure keyed to a falling isolation-
   resistance figure is named. `[TBD]` — open item 44.
3. In the absence of a stated procedure, monitor the reading and treat a
   declining trend as a reason to end the sector; nothing in either document
   supports a more specific action than that.

## B.4 Propulsion (DEP and LFT)

Ten independent inverter-motor units — eight lift rotors on two booms, two
wing-mounted cruise propellers — each without a gearbox, with the flight
control system redistributing torque across the surviving units on the loss
of any one. `[GIVEN]` Each lift rotor carries its own stop-and-align
mechanism, locking its blades edge-on to the airflow for cruise. `[GIVEN]`

### B.4.1 Loss of one lift unit in hover

1. Indication — not named. VAY-SDD-0001 states that the flight control
   system redistributes torque across the surviving units automatically; it
   does not state what, if anything, the pilot is shown to identify which of
   the eight lift rotors has been lost, or that any of the eight is
   individually annunciated at all. `[TBD]` — open item 45, the same shape of
   gap Appendix A's departure briefing (§A.6.1 step 4) already names for a
   single propulsor loss in general terms.
2. Action — none beyond continuing to fly the centre inceptor and energy
   lever through whatever redistribution the flight control system performs
   automatically. No crew selection is described for isolating, or
   attempting to restart, a lost lift unit.
3. What margin remains in hover with one of eight lift units lost — whether
   the aircraft continues to hover normally, hovers with reduced authority,
   or requires an immediate transition to wing-borne flight — is not stated
   by either document.

### B.4.2 Loss of a lift unit group

1. Indication — as B.4.1, with the same absence of individual-unit
   annunciation. Whether a group loss confined to one boom is distinguished,
   on any display, from a single-unit loss elsewhere is not stated. `[TBD]` —
   open item 46.
2. Action — as B.4.1. Nothing in the source material describes a different
   crew response to a group loss than to a single loss, because neither is
   described with any crew response beyond continuing to fly.
3. A loss confined to one boom changes the aircraft's lift and moment
   distribution left to right in a way a single lost unit spread differently
   would not; whether the flight control system's redistribution logic, or
   the pilot's available control authority, treats the two cases differently
   is not addressed by either document.

### B.4.3 Loss of a cruise unit

1. Indication — as above, not named individually.
2. Action — continue flying the wing-borne law through whatever
   redistribution occurs across the remaining cruise unit and, where the
   control law permits it, the lift rotors. No asymmetry indication distinct
   from handling itself is described.
3. Whether a single cruise-unit loss changes the transition threshold back
   to hover, given that transition timing already depends on airspeed and
   control-law state rather than a discrete pilot selection (§9 of the body
   document), is not addressed. `[TBD]` — open item 47.

### B.4.4 Rotor fails to stop or index for cruise

1. Indication — not named. The stop-and-align mechanism's normal behaviour
   is described (§9, §A.4.2 of Appendix A); no indication is described for
   confirming, from the flight deck, that a given rotor has reached the
   stowed, edge-on position rather than remaining part-deployed, beyond the
   general absence of a rotors-ready indication already noted at Appendix A
   §A.6.2 step 1.
2. Action — whether the transition to wing-borne flight proceeds, is
   inhibited, or produces some other flight-control-system behaviour when
   one of eight rotors has not reached the stowed position is not stated.
   `[TBD]` — open item 48.
3. No procedure is written past that point, because no indication exists to
   tell the pilot which of those outcomes has occurred.

## B.5 Transition

The transition between hover-borne and wing-borne flight is sequenced by the
flight control system rather than commanded by a discrete pilot selection, in
both directions, on every sector (§9 of the body document; §A.6.4 and §A.8.2
of Appendix A). There is no tilting mechanism; the change is a matter of
control law and airspeed acting on the same fixed lift rotors and cruise
propellers throughout. `[GIVEN]` No mode or transition annunciation is
confirmed to exist in either direction — open item 15 — and this section
inherits that absence rather than repeating it at every step below.

### B.5.1 Transition to wing-borne flight does not complete

1. Indication — none beyond what the pilot reads directly from airspeed,
   attitude and control feel, in the same absence of annunciation already
   recorded at Appendix A §A.6.4 step 2.
2. Action — no crew-initiated means of aborting or repeating the transition
   sequence is described. Whether the flight control system reverts
   automatically toward hover if the sequence does not complete, and what
   that reversion looks like to the pilot if it happens, is `[TBD]` — open
   item 17, restated here because it is precisely the gap this entry needs
   closed. The absence of any crew-initiated abort, distinct from an
   automatic reversion, is `[TBD]` — open item 49.
3. The pilot's available action is limited to continuing to fly the centre
   inceptor and energy lever through whatever the flight control system does
   next, because no discrete crew procedure exists for a transition that does
   not complete on its own.

### B.5.2 Transition to hover does not complete

1. Indication — as B.5.1, in the reverse direction, on approach to a pad
   rather than departing one.
2. Action — as B.5.1; the absence is the same gap, not a second one, and it
   carries a particular weight on this side of the sector. A transition to
   hover that does not complete happens during the approach and landing
   phase, over an elevated pad among buildings, with the external-vision gap
   already named at Appendix A §A.8.3 step 2 compounding whatever the pilot
   can see of the aircraft's own state.
3. No go-around or waved-off approach procedure specific to an incomplete
   transition is described, beyond the general absence of any
   rejected-approach procedure already noted at Appendix A §A.8.1 step 3.

## B.6 Thermal management (TMS)

Two independent coolant loops, left and right, with pump speed on each
modulated automatically from reported heat load and no described crew
selection. `[GIVEN]`

### B.6.1 Loss of one coolant loop

1. Indication — coolant temperature for the affected loop, together with the
   battery and inverter temperatures it serves, shown on the power/energy
   page moving outside its normal reading.
2. Action — as at §B.2.2, no coolant-loop reconfiguration control is named
   for the pilot (open item 41). The available response is the same
   reduction in commanded power through the energy lever, or an earlier end
   to the sector, rather than any direct system intervention.
3. Which battery pack and which propulsor group each loop serves, and
   therefore what the practical consequence of losing one loop is for the
   equipment on the other side of the aircraft, is not stated by either
   document.

### B.6.2 Loss of both loops

1. Indication — as B.6.1, on both sides at once.
2. Action — as B.6.1, with no reconfiguration available on either loop and
   no described means of shedding thermal load beyond reducing commanded
   power.
3. What condition the battery packs, inverters or motors reach, unmanaged,
   over the remainder of a sector with no coolant flow is not characterised
   in either document, and no figure is given against which the pilot could
   judge how much of the flight remains available before that matters.
   `[TBD]`

## B.7 Flight control (FCS and ACT)

VAY-SDD-0001 describes the flight control system as running three computing
lanes, with no mechanical reversion path of any kind. `[GIVEN]` VAY-HF-0001
describes the centre inceptor and energy lever as each sending two
independent signal paths to "the two flight control computers" (§6, §7.1 of
the body document); this appendix uses the finer-grained, three-lane
description because it is the one the aircraft's own specification gives, and
does not attempt to reconcile the two figures here. Every command reaches the
ailerons, the V-tail surfaces and the ten propulsors electrically, through
electromechanical actuation, with no mechanical or hydraulic linkage anywhere
between the flight deck and a control surface or propulsor. `[GIVEN]`

### B.7.1 Loss of one computing lane

1. Indication — not described. No mode or law annunciation is confirmed to
   exist for any flight-control-system state (open item 15), and this is the
   specific case that gap most directly touches: a lane loss is exactly the
   kind of event a law annunciation would exist to show, and none is
   confirmed.
2. Action — none beyond continuing to fly, because no indication is
   confirmed to tell the pilot a lane has been lost in the first place.
   `[TBD]` — open item 50.
3. What handling change, if any, follows the loss of one of three lanes is
   not stated.

### B.7.2 Loss of two lanes

1. Indication — as B.7.1.
2. Action — as B.7.1. With three lanes and no mechanical reversion, the loss
   of two lanes leaves one lane carrying the full command path with nothing
   behind it if that lane is also lost; whether that condition is annunciated
   any differently from a single-lane loss is not stated. `[TBD]` — open item
   50 applies equally here.
3. This is the point at which §B.13.1 below becomes directly relevant: with
   no mechanical path and no described means of the pilot confirming or
   influencing which lane, if any, remains in command, the emergency
   recovery system is the design's stated means of addressing a
   flight-control condition beyond this one, not a procedure step within
   this section.

### B.7.3 Actuator jam or runaway

1. Indication — not described. Actuator position and status are reported
   back to the flight control system and the displays generally (§10.3 of
   the body document, ACT row); whether a jam or a runaway is distinguished,
   on any display, from normal actuator behaviour is not stated.
2. Action — none is described. `[TBD]` — open item 51.
3. Whether the electromechanical actuation architecture provides any means
   of isolating a jammed or runaway actuator from the surface or propulsor it
   drives, as distinct from the flight control system's general
   redistribution of command across that surface's or propulsor's
   neighbours, is not addressed by either document.

## B.8 Navigation and air data (NAV)

A single inertial measurement unit and a single satellite positioning
receiver; forward air data probes; low-speed sensors reporting independently
at each boom root. `[GIVEN]`

### B.8.1 Loss of satellite position

1. Indication — the position source shown as invalid or unavailable on
   whichever display page carries it.
2. Action — what the flight displays do when the single satellite
   positioning source is lost is not stated by either document; VAY-HF-0001
   §6.1 names the gap in passing — "whether the primary flight displays have
   any means of reversion if the single inertial or satellite positioning
   source is affected" — without giving it its own tracking number there.
   `[TBD]` — open item 52, closing that gap here.
3. With a single inertial reference also fitted, and no stated cross-
   reference between the two beyond both feeding the same, singular
   navigation function, the pilot's available action on losing satellite
   position is limited to whatever the inertial reference alone continues to
   support, and neither document says what that is.

### B.8.2 Air data disagreement

1. Indication — forward air data probes are named in the plural (§10.3 of
   the body document, NAV row); whether their outputs are compared against
   each other, and what is shown if they disagree, is not stated. `[TBD]` —
   open item 53.
2. Action — none is described, because no disagreement indication is
   described to act on.

### B.8.3 Loss of low-speed sensing

1. Indication — low-speed sensors report independently at each boom root
   (§10.3 of the body document); a loss at one boom would, on that
   description, be distinguishable from a loss at the other, though no
   display behaviour for either case is named.
2. Action — not described. The hover and transition control laws are stated
   to draw on this sensing (§9), and a loss at one boom raises the same
   left/right asymmetry question already noted at §B.4.2 for a lift-unit-
   group loss, without either document saying whether the control law treats
   the two conditions the same way. `[TBD]` — open item 54.

## B.9 Landing gear (LGS)

A retractable, wheeled, four-point gear; weight-on-wheels sensed at each main
leg; a mechanical downlock at each leg independent of continued actuator
power; a manual free-fall extension handle in the flight deck, independent of
the electric actuators. `[GIVEN]`

1. Indication — gear position is shown on the display during extension and
   retraction (§6.2 of the body document), with each leg observed
   individually as it cycles (Appendix A §A.8.3 step 3).
2. Gear does not extend normally — alternate extension by the manual handle,
   independent of the electric actuators. `[GIVEN]`
3. Downlock confirmation — each leg's downlock is mechanical and independent
   of continued actuator power; whether the display distinguishes a
   confirmed downlock from an uncertain one, on any one of the four legs
   individually, is not stated.
4. A partial or asymmetric downlock — one leg of four not confirmed down
   while the other three are — is not addressed by any procedure in either
   document, and the landing that would follow one, on a four-point gear
   rather than the multi-bogie arrangement a larger transport carries, is not
   characterised. `[TBD]` — open item 55.
5. No wind or mass limit is stated for a vertical landing in any gear
   configuration, normal or otherwise (Appendix A §A.8.1 step 2, open item
   34), so a partial-downlock landing carries that same absence of
   performance data in addition to the absence of a procedure for the
   condition itself.

## B.10 Cabin and doors (CAB)

Two cabin doors, one each side, each with an independent electric latch
actuator and its own manual release lever; door and latch status presented on
a dedicated cabin synoptic page. `[GIVEN]`

### B.10.1 Door latch indication in flight

1. Indication — the cabin synoptic page carries door and latch status
   continuously, the same page consulted at boarding and before departure
   (§8.4 of the body document).
2. A disagreement or an unlatched indication appearing on that page in
   flight, as distinct from the pre-departure check it is named for, is not
   addressed by any procedure in either document. `[TBD]` — open item 56.
3. Action — with no in-flight door control described (only a manual release
   lever intended for ground use, per Appendix A §A.4.2's walkaround note),
   the pilot's available response to an in-flight indication of this kind is
   limited to whatever flight-path or landing decision follows from not
   being able to confirm or correct the condition directly.

### B.10.2 Passenger incapacitation or interference

1. Indication — none is described. The flight deck is open to the cabin
   above seat height, giving the pilot a direct sightline over the passenger
   seats (§4.1 of the body document), and no camera or other sensor for
   cabin observation is described beyond that sightline.
2. Action — with no cabin crew and no means of leaving the flight-deck seat
   described for any in-flight purpose, the pilot's available response to a
   passenger condition observed over that sightline is not addressed by
   either document. `[TBD]` — open item 57.
3. Whether the sightline itself is adequate for recognising a passenger
   condition from the forward seat, at whatever angle and distance the
   eventual flight-deck geometry produces (§4.3's open geometry items), is a
   question this appendix cannot answer because the geometry it would depend
   on does not yet exist.

## B.11 Pilot incapacitation

No procedure is written for this condition, because no element of the design
gives one anything to be written against.

There is one pilot, on the centreline, with no second pilot seat and no
jumpseat or observer position described anywhere on the flight deck (§3 of
the body document). VAY-SDD-0001 describes no means by which the aircraft
detects that the pilot is incapacitated, no means by which a passenger could
take any flight-path or system action from the cabin, and no means by which
the flight continues, is interrupted, or is landed without the one person at
the centre inceptor and energy lever remaining capable of using them. `[GIVEN]`
as to the absence of any of these provisions in the source material; the
absence itself is the finding.

This condition sits outside the indication-and-action form the rest of this
appendix uses, because neither exists here. It is carried to §B.15 rather
than left implicit: a document that describes what the pilot sees and does
has to say plainly when there is no pilot left to see or do anything, and no
other means the design provides in that circumstance. `[TBD]` — open item 58.

## B.12 Fire, smoke and fumes

VAY-SDD-0001 describes no crew oxygen system (§3 of the body document;
Appendix A §A.4.1 step 8 records this as a design fact rather than an
oversight, given a cruise altitude well below where crew oxygen would
ordinarily be a design feature). A smoke or fumes procedure on this aircraft
accordingly has no masks-and-goggles step to reach for; whatever the pilot
does about smoke or fumes is done breathing the flight deck's own air
throughout.

### B.12.1 Smoke or fumes on the flight deck

1. Indication — an alert message on whichever display carries it, with an
   aural tone and, for some conditions, a light on the alerting panel (§8.1
   of the body document); no smoke detector, and no distinction between
   smoke originating in the flight deck itself and smoke reaching it from
   elsewhere, is named specifically for this condition.
2. Action — electrical load shedding and ventilation selections are the
   general means available; the specific sequence, and any smoke-removal
   procedure distinct from isolation, is not described. `[TBD]` — open item
   59.
3. Land as soon as possible. With no oxygen equipment and no second occupant
   to divide attention between flying the aircraft and managing the source,
   this step is stated here as a description of what the flight deck offers,
   not as a finding about whether it is enough.

### B.12.2 Battery bay indication

1. Indication — the sealed, underfloor, overboard-vented battery bay housing
   both packs is not shown to have any dedicated smoke, fire or gas
   detection distinct from the pack temperature and health figures already
   displayed on the power/energy page. Whether the venting arrangement is
   itself instrumented — a flow indication, a detection loop in the vent
   path, or nothing — is not stated by either document. `[TBD]` — open item
   60.
2. Action — in the absence of a dedicated indication, the pilot's only
   available cue is the same continuous pack temperature and health reading
   used throughout §B.2, read for whatever departure from normal it happens
   to show.
3. No contactor isolation, no suppression, and no means of pilot access to
   the bay in flight is described — the bay sits sealed beneath the cabin
   floor, and nothing in either document names a crew-accessible control for
   it beyond what already appears on the power/energy page.

## B.13 Emergency recovery system (ERS)

A guarded mechanical handle at the centre console and a separate safe-and-arm
switch, both required before a firing signal can reach the recovery-system
charge; a dedicated firing battery independent of the aircraft's main
low-voltage distribution; a dedicated flight-deck annunciator, near the
handle, for the control unit's armed state and fault. Arming and inhibit
logic are tied to weight-on-wheels and height. `[GIVEN]`

### B.13.1 Conditions in which the handle is the remaining option

There is no mechanical or hydraulic linkage anywhere between the flight deck
and a control surface or propulsor (§7.1 of the body document, restated at
§B.7 above). Three computing lanes carry every command electrically, and
there is no mechanical reversion path behind them. Read together with
§B.7.2, that means a condition removing electrical command capability from
all three lanes — however such a condition would arise, and neither document
names one — leaves no means of directly controlling the aircraft's flight
path at all.

1. Indication — the dedicated annunciator's armed state and fault reading,
   and whatever handling the pilot can still feel or read through the centre
   inceptor and energy lever, which on this description would be nothing.
2. Action — the guarded handle, once the safe-and-arm switch permits it, is
   the design's stated means of addressing a flight-control condition beyond
   this one. No procedure precedes it, because no procedure exists for
   restoring command capability once it is gone; this is stated as a
   description of the design, not as an assessment of whether the handle is
   a sufficient answer to the condition that leads to it.
3. What height and weight-on-wheels combination the inhibit logic permits
   firing at, and what a pilot flying at low height over an elevated urban
   pad — as every approach and departure on this type is — can actually
   expect the handle to do for them at that height, is `[TBD]` — open item
   61.

### B.13.2 Inadvertent arming or inhibit disagreement

1. Indication — the dedicated annunciator shows armed state and fault;
   whether an inhibit condition and an armed indication can disagree with
   each other, and what is shown if they do, is not stated.
2. Action — the safe-and-arm switch is set according to phase of flight
   (Appendix A §A.4.1 step 7, §A.10 step 2); no procedure is described for
   resolving a disagreement between the switch's own selection and what the
   annunciator reports, or between the inhibit logic's weight-on-wheels and
   height inputs and the phase the pilot believes the aircraft to be in.
   `[TBD]` — open item 61 applies equally here, as the same control unit and
   the same annunciator are involved.
3. Whether the annunciator's own supply and processing path is independent
   of the two primary displays' failure modes is already tracked at §8.3 of
   the body document without a numbered item; it bears directly on this
   entry, because an annunciator that shares a failure mode with the
   displays it is meant to stand apart from would show a fault at exactly
   the moment its independence matters most.

## B.14 Vertiport and environment

The operating concept places every sector between elevated pads among
buildings, with shear and turbulence off nearby structures a normal operating
condition rather than an exception (§2 of the body document), and with little
open ground beneath most of the route. `[GIVEN]`

### B.14.1 Pad unavailable on arrival

1. Indication — none specific to this condition is described. Whatever the
   pilot learns about a destination pad's state before or during an approach
   is not addressed by either document; Appendix A §A.8.1 step 1 already
   names the same gap for pad-specific wind, shear and obstacle data,
   tracked as open item 33.
2. Action — no alternate-pad or diversion procedure specific to a rejected
   approach is described in either document (Appendix A §A.8.1 step 3
   records the same absence for an approach briefing that has nothing to
   brief against). `[TBD]` — open item 62.
3. With little open ground beneath most of the route, the pilot's available
   options on finding a destination pad unavailable are not the same as they
   would be for an aircraft that can put down on open ground if a prepared
   surface is not available; neither document addresses what those options
   are for this type.

### B.14.2 Wind or turbulence beyond the declared envelope

1. Indication — no declared wind or turbulence envelope for pad operations
   exists in either document to be exceeded, and no display or annunciation
   is named for a condition defined relative to an envelope that has not yet
   been fixed. `[TBD]` — open item 63.
2. Action — none is described, for the same reason.
3. The absence is worth naming plainly because it sits at the phase where it
   matters most: the two- to three-minute vertical departure and approach
   and landing phases (§2.2 of the body document) are exactly the phases in
   which shear and turbulence off nearby structures are named as a normal
   condition, and they are the same phases carrying a transition, a
   building-shaded pad environment, and the full display and alerting
   picture at once (§10.2 of the body document).

## B.15 Conditions the design does not resolve

Collected from Appendix B. Each is a place where a procedure cannot be
written until a design decision is taken or an analysis is run. They are
offered as a starting point for the human-factors and safety work, in the
same spirit VAY-HF-0001 §11.2 already states for the items carried from the
body document and Appendix A.

40. **Battery string-level status** (§B.2.1). Whether a single isolated
    string, within a four-string pack, is shown to the pilot as anything
    distinct from the pack's aggregate charge and health figure.
41. **Coolant-loop reconfiguration** (§B.2.2, §B.6.1, §B.6.2). No
    flight-deck control is named for selecting a coolant-loop configuration;
    the only available response to a rising temperature or a lost loop is a
    change to the flight itself.
42. **Bus-tie contactor manual control** (§B.3.1). Whether the pilot can
    close the tie contactor to feed one bus side's loads from the other, or
    whether that reconfiguration is automatic, unavailable, or something
    else.
43. **Low-voltage bus architecture** (§B.3.2). What the low-voltage
    distribution feeds, beyond the two mentions the source material makes in
    passing, and what its loss would mean.
44. **Insulation-monitor procedure** (§B.3.3). No threshold or crew action is
    defined for a declining isolation-resistance reading.
45. **Individual lift-unit-loss indication** (§B.4.1). Whether the pilot is
    shown which of eight lift rotors has been lost, and what hover authority
    remains with one gone.
46. **Grouped lift-unit loss** (§B.4.2). Whether a loss confined to one boom
    is distinguished from a single loss elsewhere, on any display or in the
    flight control system's redistribution logic.
47. **Cruise-unit-loss consequence** (§B.4.3). Asymmetry indication and any
    change to the transition threshold following a single cruise-unit loss.
48. **Rotor fails to stow for cruise** (§B.4.4). Whether the transition is
    inhibited, proceeds, or produces some other behaviour when a lift rotor
    has not reached the stowed, edge-on position.
49. **No crew-initiated transition abort** (§B.5.1, §B.5.2). Whether any
    means exists for the pilot to abort or repeat a transition sequence that
    does not complete, distinct from the automatic-reversion gap already
    carried at item 17.
50. **Computing-lane-loss annunciation** (§B.7.1, §B.7.2). No indication is
    confirmed to exist for the loss of one or two of the three flight-control
    computing lanes.
51. **Actuator jam or runaway detection** (§B.7.3). No means of
    distinguishing a jammed or runaway actuator from normal behaviour, on any
    display, is described.
52. **Reversion on loss of the single satellite or inertial source**
    (§B.8.1). Named in passing at §6.1 of the body document without a
    tracking number there; closed here.
53. **Air-data disagreement resolution** (§B.8.2). Whether the forward air
    data probes' outputs are compared, and what is shown if they disagree.
54. **Low-speed-sensor loss at one boom** (§B.8.3). Consequence for the
    hover and transition control laws, which are stated to rely on
    independent per-boom reporting.
55. **Partial or asymmetric downlock on a four-point gear** (§B.9). Not
    addressed by any procedure, and the resulting landing not characterised.
56. **In-flight door-latch disagreement** (§B.10.1). Addressed for the
    pre-departure check; not addressed for an indication appearing in
    flight.
57. **Passenger incapacitation or interference** (§B.10.2). No means beyond
    the open sightline over the cabin, and no procedure for what the pilot
    does about what they see.
58. **Pilot incapacitation** (§B.11). No detection, no second pilot, no
    passenger means of controlling the aircraft, and no procedure of any
    kind.
59. **Flight-deck smoke or fumes isolation sequence** (§B.12.1). No specific
    sequence, and no smoke-removal procedure distinct from isolation and
    landing, is described, and no oxygen equipment exists to reach for while
    performing it.
60. **Battery-bay detection and indication** (§B.12.2). Whether the sealed,
    vented bay carries any dedicated detection beyond the pack temperature
    and health figures already on the power/energy page.
61. **Emergency-recovery firing conditions at low height** (§B.13.1,
    §B.13.2). What the arming and inhibit logic's weight-on-wheels and height
    inputs actually permit at the heights this type's urban pad approaches
    and departures are flown at, and whether an inhibit condition and an
    armed indication can disagree.
62. **No diversion procedure for a pad unavailable on arrival** (§B.14.1).
    Pad-specific condition data is named at open item 33; the diversion
    procedure itself is a separate, equally open gap.
63. **No declared wind or turbulence envelope for pad operations**
    (§B.14.2). Nothing exists yet to be exceeded, and no procedure exists for
    recognising or responding to exceeding it once it does.

Two of these are set apart because they are not, in the end, gaps of the same
kind as the rest.

**Pilot incapacitation (item 58)** is not a case where a procedure is
missing; it is a case where nothing in the aircraft's description —
detection, a second seat, a passenger means of control — gives a procedure
anywhere to attach to. Every other item in this list describes an indication
or an action the design could plausibly add. This one describes an occupant
the design does not have.

**The condition behind the emergency recovery handle (item 61, read together
with §B.7.2 and §B.13.1)** is the item this appendix would most like the
safety and human-factors work to take up first. A design with three
electrical computing lanes and no mechanical reversion of any kind has made a
choice: when the electrical command path is gone, nothing remains between the
pilot and the guarded handle. That choice is stated here as a design fact,
not as a judgement on it either way. What this appendix can say is that the
aircraft flies every sector low, over buildings, with little open ground
beneath it, and that the arming and inhibit logic deciding whether the handle
does anything useful at the height and configuration the aircraft is
actually in when it might be needed is exactly the piece of the design this
appendix cannot characterise, because neither source document gives it
anything to characterise it with.

---

# Appendix C — Control schedule

Every control or dedicated indication named anywhere in VAY-HF-0001 §1–§11,
in Appendix A, or in Appendix B above appears here once, grouped by the
panel-zone table at body document §4.2. Where VAY-SDD-0001 places the control
or fixes its function, the row is marked `[GIVEN]`; where its position or
form is this document's own construction, built from a function the source
material names without naming the control itself, the row is marked
`[PRELIM]`; where neither the control's existence nor its function is stated
at all, the row is marked `[TBD]`. This schedule does not fix breakout force,
control travel, detent force, or actuation direction — those are open items
11 and 12, and they apply to every row below without exception. Guarding
provisions are marked where VAY-SDD-0001 states one; where it does not, the
guard is `[PRELIM]` or `[TBD]` as the row indicates, and open item 13 applies
throughout.

This schedule is shorter than a comparable two-crew transport's control
schedule would be, and that is worth stating plainly rather than leaving the
reader to wonder whether rows were left out. It is not shorter because the
aircraft has fewer functions to manage — ten propulsors, two battery packs,
two bus sides, two coolant loops and a fly-by-wire system across three
computing lanes are, if anything, more to manage than a comparable
conventionally-propelled aircraft carries. It is shorter because
VAY-SDD-0001 names far fewer of those functions at flight-deck-control
granularity. Several rows below record a control this document believes must
exist, because the function it would serve is named somewhere in the source
material, without VAY-SDD-0001 naming the control itself, its panel, or its
form. Those rows are marked `[TBD]` rather than omitted, on the same
principle §1.1 of the body document states for every other gap in this
document family: an empty field, honestly marked, is the correct answer.

| Tag | Legend | Panel | Type | Function and provenance |
|:--|:-----------|:-----------------------|:------------------------|:----------------------------------------|
| 1 | `MASTER` | ALERTING PANEL | pushbutton annunciator | One of the two glareshield alert lights. Alert messages appear on whichever display shows a synoptic or status page, with an aural tone and one of these lights; which light accompanies which message is `[TBD]` |
| 2 | `MASTER` | ALERTING PANEL | pushbutton annunciator | Marked *CAUTION*. As above. `[GIVEN]` |
| 3 | `ALERT` | ALERTING PANEL | pushbutton | Marked *ACK*. Glareshield acknowledgement switch; the pilot can then call up the associated system page. Whether that page carries the alert's procedure or only its status is `[TBD]` — open item 28. `[GIVEN]` |
| 4 | `ERS` | DEDICATED ANNUNCIATOR | indication only | Marked *ARM / FAULT*. Emergency recovery control-unit status, presented on "a dedicated flight deck annunciator near the activation handle" rather than on a display page. Independence of its supply and processing path from the two primary displays' own failure modes is `[TBD]` (§8.3 of the body document). `[GIVEN]` |
| 5 | `DU L` | MAIN INSTRUMENT PANEL | display surface | Left display, own graphics processor; configurable to flight, navigation or synoptic pages. `[GIVEN]` |
| 6 | `DU R` | MAIN INSTRUMENT PANEL | display surface | Right display, as left. Either surface can show either page. `[GIVEN]` |
| 7 | `BEZEL L` | MAIN INSTRUMENT PANEL | bezel key set | Page selection for the left display; manual throughout, no stated default per phase — open item 8. `[GIVEN]` as to manual selection |
| 8 | `BEZEL R` | MAIN INSTRUMENT PANEL | bezel key set | As left. `[GIVEN]` |
| 9 | `STBY` | MAIN INSTRUMENT PANEL | standby display | Attitude, airspeed and altitude equivalents. Architecture, and independence of its supply, sensor and processing path from the two primary displays, is `[TBD]` — open item 10. `[GIVEN]` as to existence |
| 10 | `AUDIO PANEL` | MAIN INSTRUMENT PANEL | control panel | Selects and routes COM, alert tone and, where fitted, intercom audio to the single headset. Arbitration between an alert tone and radio or intercom audio on the shared path is `[TBD]`. `[GIVEN]` as to existence and the shared path |
| 11 | `GEAR` | LOWER INSTRUMENT PANEL | hard switch | Landing gear control. Hard switches for gear are described at the lower panel rather than overhead. `[GIVEN]` as to panel location; switch form `[PRELIM]` |
| 12 | `LIGHTING` | LOWER INSTRUMENT PANEL | hard switch(es) | System lighting control(s); grouping and count not detailed. `[PRELIM]` |
| 13 | `SYS RESET` | LOWER INSTRUMENT PANEL | hard switch(es) | System reset switches, named generically; which systems and how many resets is not detailed. `[PRELIM]` |
| 14 | `GEAR ALT EXTEND` | LOWER PANEL / CENTRE CONSOLE | pull handle | Manual free-fall extension, from a separate handle, independent of the electric gear actuators. `[GIVEN]` as to the handle and its independence; panel position `[PRELIM]` |
| 15 | `INCEPTOR` | CENTRE CONSOLE | centre inceptor | Single centre inceptor; flight-path command, with two independent signal paths into the flight control system. `[GIVEN]` |
| 16 | `ENERGY LEVER` | CENTRE CONSOLE | lever | Single left-hand energy lever; power command distributed across all ten propulsors by the flight control system, with two independent signal paths. `[GIVEN]` |
| 17 | `ERS` | CENTRE CONSOLE | guarded pull handle | Marked *PULL TO DEPLOY*. Emergency recovery system activation handle. Guarded; firing requires this handle and the separate safe-and-arm switch together. `[GIVEN]` |
| 18 | `ERS` | CENTRE CONSOLE | guarded toggle | Marked *SAFE / ARM*. Separate safe-and-arm switch, set according to phase of flight. Guard provision beyond the handle's own guard is `[PRELIM]`. `[GIVEN]` as to the switch and its function |
| 19 | `DOOR` | CABIN/DOOR — panel not named | switch, form not stated | Marked *RELEASE*. Commands door-latch release once the aircraft is confirmed at the pad. Neither the panel nor the control's form is named in either source document. `[TBD]` — open item 64 |
| 20 | `DOOR L` | CABIN/DOOR | manual release lever | Left door manual release; ground use; independent of the electric latch actuator. `[GIVEN]` |
| 21 | `DOOR R` | CABIN/DOOR | manual release lever | Right door, as left. `[GIVEN]` |
| 22 | `CABIN LTG` | CABIN/DOOR — panel not named | control, form not stated | Cabin lighting: two strings, one per sidewall, on separate low-voltage feed segments, with ceiling trim lighting providing overlap. Adjustable by the pilot from the flight deck as a whole; a control for selecting or overriding either string individually is not named. `[TBD]` — open item 65 |
| 23 | `ENV OUTLETS` | CABIN/DOOR | control, form not stated | Forward/aft environmental outlets, adjustable by the pilot from the flight deck. `[GIVEN]` as to adjustability; control form `[PRELIM]` |
| 24 | `VHF 1` | COMMUNICATIONS — panel not named | radio control head | First VHF radio. `[GIVEN]` as to existence; panel and control form `[PRELIM]` |
| 25 | `VHF 2` | COMMUNICATIONS | radio control head | Second VHF radio. `[GIVEN]`/`[PRELIM]`, as above |
| 26 | `DATALINK` | COMMUNICATIONS | control/display, form not stated | Vertiport datalink transceiver. `[GIVEN]`/`[PRELIM]`, as above |
| 27 | `PA` | COMMUNICATIONS | microphone / switch | Marked *OVERRIDE*. Pilot override of the automatic, phase-triggered passenger-address announcement, from the flight-deck microphone. `[GIVEN]` |
| 28 | `BUS TIE` | ENERGY/PROPULSION — panel not named | contactor control, form not stated | Manual selection, if any, for the high-voltage bus-tie contactor. Not named as a crew-accessible control anywhere in VAY-SDD-0001. `[TBD]` — open item 42 |
| 29 | `COOLANT` | ENERGY/PROPULSION | control, form not stated | Marked *LOOP CONFIG*. Coolant-loop configuration selection, if any. Not named as a crew-accessible control. `[TBD]` — open item 41 |
| 30 | `DATA BUS` | ENERGY/PROPULSION or LOWER PANEL | control, form not stated | Marked *RESET*. Resetting a data-bus channel, named as a systems function in §7.2 of the body document without a stated flight-deck control. `[TBD]` — open item 66 |
| 31 | `GND CHARGE` | ENERGY/PROPULSION | control, form not stated | Ground/network charging initiation, if pilot-initiated as distinct from automatic once ground equipment connects. `[TBD]` — open item 30 (Appendix A) |
| 32 | `FLT MGT` | MAIN INSTRUMENT PANEL (assumed) | control, form not stated | Route loading and flight-management data entry. Existence implied by Appendix A §A.4.1 step 11; means of entry not detailed. `[TBD]` |
| 33 | — | OVERHEAD PANEL | zone, contents unconfirmed | Whether the type has an overhead panel at all, distinct from one simply not yet described, is `[TBD]` — open item 67. No control below is placed there because none can be, honestly, until the zone itself is confirmed. |
| 34 | — | SIDE CONSOLES | zone, contents unconfirmed | As above. `[TBD]` — open item 67 |

Rows 33 and 34 are included as zones rather than as controls because §4.2 of
the body document names them as `[TBD]` in exactly that form — a panel zone
that may or may not exist, as distinct from a control whose panel is merely
unassigned. Every other row above at least has a function to anchor it, even
where its panel or form does not yet exist; these two rows do not have even
that, and are carried here rather than dropped so that a later assessment
does not have to rediscover that the question was ever open.

Four items are worth drawing together across the table rather than leaving
them scattered row by row. First, no control in this schedule has a second
instance for a second crew member to operate, check, or reach for
independently — every row above is reached, read and actioned from the one
centreline seat, and Appendix A §A.2 already states what that means for how
each control's use is written. Second, several rows exist in this schedule
only because a function is named without a control being named to go with
it — rows 19, 22, 28, 29 and 30 are each a case where VAY-SDD-0001 states
plainly that something happens (a door releases, lighting adjusts, a
contactor opens, a coolant loop reconfigures, a data-bus channel resets)
without stating how the pilot makes it happen, if the pilot makes it happen
at all. Third, the two zones at rows 33 and 34 mean this schedule cannot yet
claim to be complete in the way the Aeolus schedule this document was built
against could: that schedule drew every control from a stated flight-deck
layout; this one draws its rows from what sixteen system descriptions happen
to mention in passing, and a panel zone neither document confirms or denies
is not evidence of an empty panel, only of an unfinished description.
Fourth, and following directly from the first three, the guarded controls in
this schedule — rows 4, 17 and 18 — are also the ones §B.13 above depends on
most directly, and nothing in this table adds to what §B.13 already says
about what the guard protects against or what lies beyond it once the guard
is opened.

---

*The Vayu VY-6 is a fictional aircraft. This document demonstrates the shape
and the discipline of a flight-deck human-factors input specification. It is
not a design of, or a statement about, any real aircraft.*

