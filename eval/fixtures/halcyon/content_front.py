# -*- coding: utf-8 -*-
"""
HAL-SDD-0001 — Halcyon HA-10 — front matter and §1–§4.

WRITTEN AS AN EVAL FIXTURE. This document is the second input document for the
drafting-quality rig; the Aeolus HL-1 SDD is the first. It therefore obeys the
same discipline as that document, and the discipline is the whole point:

    it DESCRIBES the design and it CLASSIFIES and ASSESSES nothing.

No severity, no failure condition, no probability objective and no DAL appears
anywhere in it. Those are what the engine under test has to derive. Design facts
are stated freely (dual channels, independent power, watertight compartments,
containment enclosure); safety COMMITMENTS are not (no "within 1 second", no
"for 30 minutes", no "1.0E-07 per flight hour") — those are the assessment's to
assume and to allocate, and the demo project records them as assumptions for
exactly that reason.

Aircraft facts are taken from site/demo_showcase_halcyon.js so the fixture and
the demo describe one aircraft. Two systems are described here that the demo has
no system for — Fire & Thermal Protection and Cabin Environment, against SF-09
and SF-10 — plus a thermal management loop that a hybrid-electric aircraft needs
and that gives the common-resource lanes something real to find.
"""

DOC = {
    "number": "HAL-SDD-0001",
    "aircraft": "Halcyon HA-10",
    "issue": "Issue 1",
    "title": "Halcyon HA-10\nArchitecture and System Design Description",
    "footer_left": "Fictional demonstration article — no customer data.",
    "footer_right": "HAL-SDD-0001 · Halcyon HA-10 · Issue 1",
}

INTRO = """The Halcyon HA-10 is a ten-seat, high-wing, hybrid-electric amphibian sized around a \
single operating idea: coastal routes of 100 to 500 nm flown between places that have water but \
may not have a runway. Every significant configuration choice on the aircraft follows from that \
sentence.

An aircraft that must be able to land on water cannot treat the hull as secondary structure, and \
an aircraft that must fly a coastal sector on stored energy cannot treat the energy store as a \
convenience. Those two consequences — a hull whose integrity is a flight function, and a \
powertrain with two dissimilar energy paths feeding one bus — shape the rest of the design."""

SECTIONS_1 = [
    ("1.1 Mission & Operating Concept", """The aircraft flies point-to-point coastal sectors of 100 to 500 nm, typically four to eight \
sectors per day, under instrument flight rules in the low flight levels. Cruise altitude is 8,000 ft; \
the aircraft is not a high-altitude machine and does not need to be. A representative sector is \
70 minutes of cruise between a 6-minute water taxi, a 2-minute take-off run and a 3-minute landing.

Roughly half of the network is water. The remainder is short paved strips of the kind found on small \
coastal fields. The aircraft is expected to alternate between the two within a single duty day, and \
the gear is selected for the surface on each approach rather than configured once for the day. That \
alternation is a normal operating condition, not an exception.

Ten occupants are carried, including two flight crew. The cabin is occupied throughout and is not a \
cargo hold; the occupant environment is therefore a function of the aircraft rather than a comfort \
feature of the interior.

Water operations are limited to a declared sea state. Outside that state the hull is outside its \
certified envelope, and the limitation is an operating limitation rather than a design margin.

Turnaround is measured in minutes at a water base with no line maintenance and no ground power. The \
aircraft is expected to be self-sufficient on the water: it starts, taxis, and departs on its own \
stored energy, and the operating concept assumes no external supply at the far end of a sector."""),

    ("1.2 Configuration & Principal Characteristics", None),   # table follows

    ("1.3 Certification & Safety Basis", """The intended certification basis is 14 CFR Part 23, normal category, at Level 4 / high-speed as \
those levels are applied to a ten-occupant aeroplane, with the acceptable means of compliance for \
system safety taken from AC 23.1309-1E, Class III. Special conditions are anticipated in at least \
three areas: the high-voltage energy store and its installation, for which the existing Part 23 \
requirements were not written; the hull as a primary structural and flotation element; and the \
amphibious gear as a configuration whose correct selection depends on the landing surface.

The severity scale used throughout the programme is the standard one — No Safety Effect, Minor, \
Major, Hazardous, Catastrophic — with the quantitative objectives of AC 23.1309-1E Class III applied \
to each. Development assurance is per ARP4754B and the safety assessment process per ARP4761A.

This document describes the design. It does not classify anything and it does not assess anything. \
The determination of what the aircraft is required to do, what happens when it fails to do it, how \
severe those outcomes are, and what must therefore be true of the architecture, is the work of the \
safety assessment and is not pre-empted here. That separation is deliberate and is discussed in \
Appendix A."""),
]

CONFIG_TABLE = [
    ("Parameter", "Value", "Parameter", "Value"),
    ("Configuration", "High wing, twin wing-mounted electric propulsion units, T-tail, amphibious hull",
     "Maximum take-off weight", "5,700 kg"),
    ("Occupants", "10 (2 flight crew + 8)", "Maximum landing weight", "5,450 kg"),
    ("Wing span", "19.4 m", "Operating empty weight", "approx. 3,650 kg"),
    ("Overall length", "14.2 m", "Design payload", "900 kg"),
    ("Hull", "Single-step planing hull, two watertight compartments either side of a bulkhead at frame 14",
     "Energy store capacity", "310 kWh usable (preliminary)"),
    ("Powerplant", "2 × 340 kW electric propulsion units, wing-mounted, tractor",
     "Turbogenerator", "1 × 400 kW class turbogenerator, aft fuselage"),
    ("Propulsion architecture", "Hybrid-electric: turbogenerator and high-voltage store feed a common propulsion bus",
     "Fuel capacity", "620 litres (two wing tanks)"),
    ("Maximum operating altitude", "FL120", "Cruise altitude, typical", "8,000 ft"),
    ("Design range", "500 nm at maximum payload", "Landing distance requirement",
     "760 m paved; 900 m water run (preliminary)"),
    ("Landing gear", "Retractable tricycle, twin-wheel nose unit, single-wheel mains, water-capable bays",
     "Declared sea state", "Significant wave height 0.6 m (preliminary)"),
]

CONFIG_NOTE = """Figures given as preliminary are subject to change. The usable energy-store capacity, \
the water landing run and the declared sea state in particular are not frozen, and downstream work \
should cite them as preliminary rather than as fixed."""

SECTION_2_INTRO = """Sixteen systems are defined at aircraft level. Five are treated as resources — \
they exist to supply other systems rather than to act on the aircraft themselves — and the \
distinction matters because a resource failure propagates to every consumer that stands on it. The \
thermal management loop is the clearest case on this aircraft: it is not a system anyone flies, and \
almost everything in the powertrain depends on it."""

INVENTORY = [
    ("Code", "System", "Type", "Principal consumers or suppliers"),
    ("PRL", "Left Propulsion Unit", "Function", "Consumes the propulsion bus, TMS, FCA/FCB command"),
    ("PRR", "Right Propulsion Unit", "Function", "Consumes the propulsion bus, TMS, FCA/FCB command"),
    ("EST", "High-Voltage Energy Store", "Resource", "Supplies the propulsion bus and both LV channels; consumes TMS"),
    ("EGN", "Turbogenerator Set", "Resource", "Supplies the propulsion bus; consumes fuel, TMS"),
    ("TMS", "Thermal Management", "Resource", "Serves EST, EGN, PRL, PRR and the bus"),
    ("FCA", "Flight Control Channel A", "Function", "Consumes EL1; reads the primary display's sensors"),
    ("FCB", "Flight Control Channel B", "Function", "Consumes EL2; reads the standby display's sensors"),
    ("EL1", "Electrical Distribution Channel 1", "Resource", "Supplies FCA, DPP and the channel-1 load set"),
    ("EL2", "Electrical Distribution Channel 2", "Resource", "Supplies FCB, DPS and the channel-2 load set"),
    ("DPP", "Primary Flight Display", "Function", "Consumes EL1; serves the crew and FCA"),
    ("DPS", "Standby Display", "Function", "Consumes EL2 and a dedicated battery; serves the crew and FCB"),
    ("HUF", "Hull \u2014 Forward Compartment", "Function", "Structural; interfaces LDG, ECS"),
    ("HUA", "Hull \u2014 Aft Compartment & Water Systems", "Function", "Structural; hosts the water rudder"),
    ("LDG", "Amphibious Landing Gear", "Function", "Consumes EL1/EL2; interfaces HUF, HUA"),
    ("FPR", "Fire & Thermal Protection", "Function", "Consumes EL1/EL2; monitors EST, EGN, the cabin"),
    ("ECS", "Cabin Environment", "Function", "Consumes EL1/EL2 and EGN bleed"),
]

SECTION_22_INTRO = """The matrix below records what each system needs from another in order to work. \
It is the starting point for understanding how a failure in one place is felt in another, and for \
testing whether two things claimed to be independent actually are."""

INTERFACES = [
    ("From", "To", "What crosses the interface"),
    ("EST", "Propulsion bus", "High-voltage DC through two string contactors; state of charge and thermal state as data"),
    ("EGN", "Propulsion bus", "High-voltage DC through the generator rectifier; available power as data"),
    ("Propulsion bus", "PRL / PRR", "High-voltage DC to each inverter \u2014 one electrical node, two consumers"),
    ("EST", "EGN", "Starting current: the turbogenerator cannot start without the store"),
    ("TMS", "EST / EGN / PRL / PRR", "Coolant flow and return on a single loop with two pumps; coolant temperature as data"),
    ("EL1", "FCA / DPP", "28 V DC to the channel-A computer, its actuator electronics, and the primary display"),
    ("EL2", "FCB / DPS", "28 V DC to the channel-B computer, its actuator electronics, and the standby display"),
    ("EST", "EL1 / EL2", "Low-voltage supply through two independent DC/DC converters, one per channel"),
    ("FCA / FCB", "PRL / PRR", "Thrust command and thrust-lever position; each channel reaches both units"),
    ("DPP", "FCA", "Air data and inertial data from the primary sensor set"),
    ("DPS", "FCB", "Air data and inertial data from the standby sensor set \u2014 a different source, deliberately"),
    ("LDG", "Multiple", "Weight-on-wheels and gear-position discretes to propulsion, displays and the environment system"),
    ("HUA", "LDG", "Water-rudder retraction interlock with the main gear selection"),
    ("FPR", "EST / EGN", "Thermal and smoke sensing in; extinguishant discharge and isolation command out"),
    ("EGN", "ECS", "Bleed air for cabin conditioning and for the windscreen anti-fog function"),
    ("ECS", "HUF", "Cabin pressure differential across the forward bulkhead as an interlock on the door"),
]

SECTION_3_INTRO = """The aircraft is divided into ten zones for the purposes of installation and \
segregation. The hull compartments are the coarsest division and the most consequential: the \
watertight bulkhead at frame 14 is both a structural boundary and a zonal one, and nothing crosses \
it without being recorded in §4."""

ZONES = [
    ("Zone", "Name", "Principal contents", "Environment"),
    ("110", "Nose and forward hull", "Nose gear bay, forward avionics rack, mooring gear", "Unpressurised; wetted in water operations"),
    ("120", "Flight deck", "Displays, inceptors, standby display and its battery, thrust levers", "Pressurised, occupied"),
    ("200", "Forward cabin", "Seats 1–4, forward ECS distribution, cabin fire detection", "Pressurised, occupied"),
    ("300", "Aft cabin", "Seats 5–8, aft ECS distribution, baggage", "Pressurised, occupied"),
    ("400", "Underfloor forward (fwd of frame 14)", "Forward hull compartment, HV routing run A, bilge sensing", "Unpressurised; watertight"),
    ("500", "Underfloor aft (aft of frame 14)", "Aft hull compartment, HV routing run B, water-rudder actuation", "Unpressurised; watertight"),
    ("600", "Energy store bay", "High-voltage energy store, store contactors, TMS cold plate, containment vent", "Unpressurised; fire zone; vented overboard"),
    ("700", "Left and right nacelles", "Propulsion units, inverters, TMS radiators, main gear bays", "Unpressurised; fire zones"),
    ("800", "Aft fuselage", "Turbogenerator, fuel gallery, rectifier, exhaust, TMS pumps", "Unpressurised; fire zone"),
    ("900", "Wing and empennage", "Wing tanks, control runs, water rudder, external lighting", "Unpressurised"),
]

SECTION_4 = """Six routes cross a zone boundary and are recorded here because a hazard in one zone \
can reach another only along one of them.

R-1  High-voltage run A. Energy store bay (600) to the left nacelle (700L) through underfloor \
forward (400) and the left wing root. Carries propulsion-bus current at full power.

R-2  High-voltage run B. Energy store bay (600) to the right nacelle (700R) through underfloor aft \
(500) and the right wing root. Routed on the opposite side of the hull to R-1 and crossing the \
watertight bulkhead at a different frame.

R-3  Turbogenerator feed. Aft fuselage (800) to the energy store bay (600), carrying rectified \
high-voltage DC forward to the bus, and fuel aft from the wing gallery (900) to the burner.

R-4  Coolant ring. A single loop from the pumps in the aft fuselage (800) through the store bay \
(600), both nacelles (700L and 700R), and back. It passes through every zone that contains a heat \
source and is the only route that does so.

R-5  Channel 1 electrical run. Flight deck (120) to the left nacelle and the forward hull, on the \
left side of the aircraft throughout.

R-6  Channel 2 electrical run. Flight deck (120) to the right nacelle and the aft hull, on the right \
side of the aircraft throughout. R-5 and R-6 share no zone penetration except at the flight deck \
bulkhead, where they pass through separate grommets 400 mm apart.

The energy store bay (600) is vented directly overboard and shares no ventilation path with the \
cabin. The bilge sensing in zones 400 and 500 is reported separately per compartment; there is no \
common bilge line between them, because a common line would defeat the bulkhead."""
