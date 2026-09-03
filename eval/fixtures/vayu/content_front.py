# -*- coding: utf-8 -*-
"""VAY-SDD-0001 - Vayu VY-6 - front matter and sections 1 to 4.

WRITTEN AS AN EVAL FIXTURE, third in the family after Aeolus HL-1 and Halcyon
HA-10, and under the same discipline, which is the whole point:

    it DESCRIBES the design and it CLASSIFIES and ASSESSES nothing.

No severity classification, no failure condition, no probability objective and no
development assurance level appears anywhere in it. Those are what the engine
under test has to derive. Design facts are stated freely; safety COMMITMENTS are
not.

Aircraft-level characteristics follow the published envelope for a six-passenger
urban eVTOL of this class and are listed with their sources in Appendix B. System
architecture below aircraft level is representative and is not manufacturer data.
"""

DOC = {
    "number": "VAY-SDD-0001",
    "aircraft": "Vayu VY-6",
    "issue": "Issue 1",
    "title": "Vayu VY-6\nArchitecture and System Design Description",
    "footer_left": "Demonstration article - representative design, not manufacturer data.",
    "footer_right": "VAY-SDD-0001 - Vayu VY-6 - Issue 1",
}

INTRO = """The Vayu VY-6 is a six-passenger electric vertical take-off and landing aircraft sized \
around a single operating idea: short revenue legs between elevated pads inside a city, flown by one \
pilot, many times a day. Every significant configuration choice follows from that sentence.

An aircraft that must hover out of a confined urban pad and then cruise on a wing cannot treat \
either regime as the exception, and an aircraft that flies eight to fourteen legs a day on stored \
energy cannot treat the energy store as a convenience. Those two consequences - two flight regimes \
with a transition between them on every sector, and a battery installation that is a primary \
structure and a primary heat source at once - shape the rest of the design.

The aircraft carries eight lift rotors on two longitudinal booms for the hover regime and two \
wing-mounted cruise propellers for wing-borne flight. The lift rotors are stopped and indexed in \
cruise; the cruise propellers are not turning in the hover. Nothing on the aircraft changes its \
geometry to make that happen: there is no tilting mechanism, and the transition is a matter of \
control law and airspeed rather than of moving structure."""

SECTIONS_1 = [
    ("1.1 Mission and Operating Concept", """The aircraft flies point-to-point urban sectors of 20 \
to 30 km between elevated vertiport pads, typically eight to fourteen sectors per day, by day and by \
night. Cruise altitude is between 300 and 600 m above the city; the aircraft is not a high-altitude \
machine and does not need to be. A representative sector is nine minutes of wing-borne cruise between \
a two-minute vertical departure and a three-minute approach and landing.

Pads are elevated structures surrounded by buildings. The wind environment at the pad is shaped by \
those buildings rather than by the free-stream, and shear and turbulence off nearby structures are a \
normal operating condition rather than an exception. The aircraft is expected to depart and arrive \
into that environment on schedule.

Seven occupants are carried: one pilot on the flight deck and six passengers in the cabin. There is \
no cabin crew. Passengers board and leave on the pad with the aircraft powered, and the pilot remains \
in the seat throughout the turnaround.

Turnaround is about ten minutes at a pad with no line maintenance. The aircraft is expected to be \
self-sufficient between charges: it powers up, departs, flies the sector and returns on its own \
stored energy, and the operating concept assumes a charge is available only at defined points in the \
network rather than at every pad.

Range grows with battery generation. The airframe and its installations are sized for the longer-range \
store that is expected to follow, and the present energy allowance is a property of the fitted packs \
rather than of the aircraft."""),

    ("1.2 Configuration and Principal Characteristics", None),   # table follows

    ("1.3 Certification and Safety Basis", """The intended certification basis is a special condition \
for small-category vertical take-off and landing aircraft, as applied by the certifying authority for \
the programme. The applicable category within that basis depends on the intended operation and on \
maximum passenger seating, and it is not settled in this document. The aircraft is designed for \
passenger-carrying operations over a built-up area; what that implies for the category, and what the \
category implies for the objectives, is the safety assessment's to establish.

The safety assessment for the programme uses a five-class severity scale, the classes being No Safety \
Effect, Minor, Major, Hazardous and Catastrophic. This document names the scale so that the reader \
knows which vocabulary the assessment will use. It does not apply it. No failure condition is \
identified here, no severity is assigned, no probability objective is stated and no development \
assurance level is allocated.

The distinction matters for how this document should be read. Where the text says that two channels \
are independent, or that a bay is separately ventilated, it is stating a design fact that the \
assessment may rely on. Where the assessment needs a number - an exposure time, a crew response, a \
demonstrated rate - that number is not here, and the assessment records it as an assumption."""),
]

CONFIG_TABLE = [
    ["Characteristic", "Value", "Characteristic", "Value"],
    ["Configuration", "Lift plus cruise, fixed geometry", "Wing span", "15.00 m"],
    ["Overall length", "10.40 m", "Overall height", "3.60 m"],
    ["Maximum take-off mass", "2,600 kg", "Payload", "680 kg"],
    ["Occupants", "1 pilot, 6 passengers", "Cabin crew", "None"],
    ["Lift propulsors", "8 rotors, 2.00 m diameter", "Cruise propulsors", "2 propellers, 1.90 m diameter"],
    ["Lift rotor arrangement", "4 per boom, 2 booms", "Cruise arrangement", "Wing-mounted, one per side"],
    ["Energy storage", "2 independent packs, 4 strings each", "Distribution", "2 high-voltage sides, 1 tie"],
    ["Flight control", "Fly-by-wire, no mechanical reversion", "Actuation", "Electromechanical"],
    ["Cruise speed", "200 km/h", "Maximum speed", "250 km/h"],
    ["Typical sector", "20 to 30 km", "Sectors per day", "8 to 14"],
    ["Landing gear", "Retractable tricycle", "Recovery", "Ballistic parachute installed"],
]

CONFIG_NOTE = """Masses and dimensions are design values for the demonstration article. Aircraft-level \
characteristics follow the published envelope for aircraft of this class; Appendix B lists each and \
its source. No performance figure in this table is a guaranteed value and none is a safety objective."""

SECTION_2_INTRO = """The aircraft is divided into sixteen systems for design and description. The \
division is by responsibility rather than by physical location: a system may appear in several zones, \
and a zone commonly holds parts of several systems. Section 3 gives the zones and section 6 shows both \
together.

Each system carries a three-letter code. The codes are used throughout sections 5 and 6 and in the \
interface matrix below, and they are the identifiers by which the systems are referred to in every \
other programme document."""

INVENTORY = [
    ["Code", "System", "Zones", "Scope"],
    ["DEP", "Distributed Electric Propulsion", "300, 400, 500, 600, 700",
     "Inverters and motor control for the eight lift units and the two cruise units."],
    ["LFT", "Lift Unit and Rotor Assembly", "400, 500",
     "Eight lift rotors, hubs, blade retention, parking brakes and blade indexing."],
    ["HVB", "High Voltage Battery and Energy Storage", "800",
     "Two packs of four strings, battery management, enclosure, venting and charge interface."],
    ["EPD", "Electrical Power Distribution", "300, 800",
     "High-voltage buses and tie, conversion to low voltage, essential bus, isolation monitoring."],
    ["TMS", "Thermal Management", "300, 400, 500, 800",
     "Two coolant loops with a crossover serving batteries, inverters and motors."],
    ["FCS", "Flight Control System", "100, 300",
     "Flight control computers, hover and wing-borne control laws, transition, command voting."],
    ["ACT", "Flight Control Actuation", "600, 700, 900",
     "Electromechanical actuation of ruddervators, ailerons and flaps."],
    ["NAV", "Navigation and Air Data", "100, 300",
     "Inertial and satellite position, air data, low-speed sensing, radar altimetry."],
    ["COM", "Communications", "100, 200, 300",
     "Radios, vertiport datalink, audio panel, passenger address and cabin intercom."],
    ["DAA", "Detect and Avoid", "100, 300",
     "Cooperative traffic, optical detection, terrain and obstacle data, surveillance processing."],
    ["DIS", "Flight Deck Displays and Controls", "100",
     "Display surfaces, standby display, inceptors and the presentation of alerts."],
    ["LGS", "Landing Gear and Ground Contact", "1000",
     "Fixed tricycle gear, wheel brakes, weight-on-wheels sensing and ground handling provisions."],
    ["STR", "Airframe Structure", "100 to 1000",
     "Fuselage, wing box, booms, V-tail, battery bay structure and the load paths between them."],
    ["CAB", "Cabin and Occupant Safety", "200",
     "Seats, restraints, doors and latch sensing, interior, stowage and the cabin environment."],
    ["ERS", "Emergency Recovery System", "300",
     "Ballistic parachute, canister, harness, arming unit, inhibit logic and the pilot handle."],
    ["HMS", "Health Monitoring and Data Recording", "300",
     "Continuous acquisition from both data buses, crash-protected recording and turnaround reporting."],
]

SECTION_22_INTRO = """The matrix below lists the interfaces that cross a system boundary. It is not a \
wiring list: it names what is exchanged and in which direction, so that a reader can see which systems \
depend on which without reading both descriptions in full. Interfaces internal to one system are \
described in that system's subsection 5.x.4 and do not appear here."""

INTERFACES = [
    ["From", "To", "What crosses the boundary"],
    ["HVB", "EPD", "High-voltage supply from each pack to its own bus side."],
    ["EPD", "DEP", "High-voltage supply to the inverter groups on both bus sides."],
    ["EPD", "ACT, NAV, DIS, COM", "Low-voltage supply from the two low-voltage buses and the essential bus."],
    ["DEP", "LFT", "Motor drive to the eight lift units, and the stop-and-align command path."],
    ["FCS", "DEP", "Torque demand for all ten propulsors, and the received unit state."],
    ["FCS", "ACT", "Surface demand to the ruddervators, ailerons and flap drive."],
    ["NAV", "FCS", "Position, attitude, air data and low-speed state vector."],
    ["DAA", "DIS", "Traffic, terrain and obstacle picture for presentation."],
    ["LGS", "FCS", "Weight-on-wheels state used to select ground or air behaviour."],
    ["TMS", "HVB, DEP", "Coolant to the battery cold plates, the inverter plates and the motor jackets."],
    ["CAB", "DIS", "Door latch state for presentation on the flight deck."],
    ["LGS", "ERS", "Ground state to the inhibit logic."],
    ["FCS", "DIS", "Mode, regime and system state for presentation."],
    ["All systems", "HMS", "Parameter reporting on data bus A and data bus B."],
    ["STR", "LFT, DEP, HVB", "Mounting and load paths for the booms, the propulsors and the battery bay."],
]

SECTION_3_INTRO = """The aircraft is divided into ten zones. A zone is a physical volume with a \
boundary that something has to cross, and the boundaries are chosen so that they correspond to real \
separations in the structure rather than to convenient lines on a drawing.

The battery bay is treated as its own zone rather than as part of the cabin section it sits beneath, \
because its boundary is a real one: the bay is sealed from the cabin and vented overboard. The two \
booms are separate zones from each other and from the wing, because a boom is a distinct structure \
carrying its own installations along its own length."""

ZONES = [
    ["Zone", "Name", "Contains", "Boundary"],
    ["100", "Flight deck", "Displays, inceptors, flight control computers, navigation and surveillance units.",
     "Pressure-free bulkhead at the cabin front; open to the cabin above seat height."],
    ["200", "Cabin", "Six passenger seats, restraints, doors, interior linings and stowage.",
     "Cabin floor above the battery bay; bulkhead to the aft equipment bay."],
    ["300", "Aft equipment bay", "Power distribution, thermal units, recorder, recovery canister.",
     "Bulkhead at the cabin rear; skin panels with external access."],
    ["400", "Left boom", "Four lift units, boom harness, coolant branch, boom structure.",
     "Boom attachment to the wing box; boom skin along its length."],
    ["500", "Right boom", "Four lift units, boom harness, coolant branch, boom structure.",
     "Boom attachment to the wing box; boom skin along its length."],
    ["600", "Left wing", "Cruise unit, aileron and flap actuation, wing harness.",
     "Wing root rib at the carry-through; wing skin."],
    ["700", "Right wing", "Cruise unit, aileron and flap actuation, wing harness.",
     "Wing root rib at the carry-through; wing skin."],
    ["800", "Underfloor battery bay", "Two battery packs, battery management, cold plates, vent path.",
     "Sealed from the cabin above; vented overboard through the lower skin."],
    ["900", "V-tail", "Ruddervator actuation and its harness.",
     "Tail attachment frames; tail skin."],
    ["1000", "Gear bays", "Nose and main gear units, wheel brakes, weight-on-wheels sensing.",
     "Bay walls and fairings; open to the airflow below."],
]

SECTION_4 = """Six routings cross zone boundaries. They are listed here because a routing that passes \
through several zones is the mechanism by which an event in one zone reaches equipment in another, and \
because the separation between routings is a design property rather than an accident of installation.

R-1 carries high-voltage supply from the battery bay to the two booms. It leaves zone 800, passes \
through the wing carry-through, and divides at the wing root into a left and a right run. The left run \
serves zone 400 and the right run serves zone 500; the two runs are on opposite sides of the carry-through \
and share no common conduit outboard of it.

R-2 carries high-voltage supply from the battery bay to the two wing-mounted cruise units. It follows \
the same carry-through as R-1 but is separately supported and separately sleeved within it.

R-3 is the low-voltage distribution. It runs from the aft equipment bay forward along both sides of the \
cabin to the flight deck, and outboard to the wing and the booms. The two sides of the low-voltage system \
run on opposite sides of the fuselage for the length of the cabin.

R-4 is the coolant routing. Two loops leave the aft equipment bay, one to the battery cold plates in zone \
800 and one to the inverter plates and motor jackets in zones 400, 500, 600 and 700. The crossover valve \
that connects the two loops sits in zone 300.

R-5 and R-6 are data bus A and data bus B. Both reach every system. They run on opposite sides of the \
fuselage and take different paths through the wing carry-through, so that the two buses do not share a \
support, a penetration or a conduit anywhere along their length."""
