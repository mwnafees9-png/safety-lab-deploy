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
