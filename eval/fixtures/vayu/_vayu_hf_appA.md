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
