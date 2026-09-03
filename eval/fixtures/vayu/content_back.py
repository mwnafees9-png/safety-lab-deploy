# -*- coding: utf-8 -*-
"""VAY-SDD-0001 - Vayu VY-6 - section 6 captions, Appendix A and Appendix B."""

SECTION_6_INTRO = """This section shows where the systems of section 5 are installed and how their \
units connect. Figure 6-1 places the ten zones of section 3 on the aircraft and draws the six \
zone-spanning routings of section 4 over the profile. Figures 6-2 to 6-17 give one block schematic per \
system, in the order of the inventory in section 2.1.

The schematics are architecture drawings rather than wiring diagrams. A box is a unit or a resource, a \
line is something that crosses between them, and the line type says what. Where a box is drawn in grey \
it belongs to another system and is shown only because the interface is the point of the figure.

Read together with section 5, the figures answer a question the text alone answers slowly: what does \
this system share with that one, and where does the sharing physically happen."""

SCHEMATICS = [
    ("DEP", "Distributed Electric Propulsion",
     "Bus side to inverter group to motors, with the cruise inverters drawing from both sides."),
    ("LFT", "Lift Unit and Rotor Assembly",
     "One lift unit: motor, hub, blades, parking brake and index sensor on the boom structure."),
    ("HVB", "High Voltage Battery and Energy Storage",
     "Two packs, their management units, the shared bay and the shared vent path."),
    ("EPD", "Electrical Power Distribution",
     "Two high-voltage sides, the tie between them, conversion to low voltage and the essential bus."),
    ("TMS", "Thermal Management",
     "Two coolant loops and the crossover valve that lets either loop reach either heat load."),
    ("FCS", "Flight Control System",
     "Three computing lanes, the command vote, and what the vote drives."),
    ("ACT", "Flight Control Actuation",
     "Surface actuation and the low-voltage side each actuator is fed from."),
    ("NAV", "Navigation and Air Data",
     "Inertial and air data sources, low-speed sensing, and what reaches the flight control computers."),
    ("COM", "Communications",
     "Radios, datalink and cabin audio, all meeting at one audio panel."),
    ("DAA", "Detect and Avoid",
     "Cooperative traffic, optical detection and the obstacle database fused into one picture."),
    ("DIS", "Flight Deck Displays and Controls",
     "Two graphics processors, two surfaces, a standby display and the alert presentation path."),
    ("LGS", "Landing Gear and Ground Contact",
     "Gear units on the airframe, and the weight-on-wheels signal that reaches the control laws."),
    ("STR", "Airframe Structure",
     "The load path from the V-tail through the fuselage to the wing box and out to the booms."),
    ("CAB", "Cabin and Occupant Safety",
     "Seats and restraints, doors and latch sensing, interior and cabin environment."),
    ("ERS", "Emergency Recovery System",
     "Arming, inhibit, firing and the mechanical path from the pilot handle to the canister."),
    ("HMS", "Health Monitoring and Data Recording",
     "One acquisition unit reading both data buses, and where its output goes."),
]

APPENDIX_A = """This document is a description. It is written to be the input to a safety assessment, \
and it deliberately stops where the assessment begins.

It does not identify failure conditions. It says that the two booms are fed from separate high-voltage \
channels; it does not say what happens if a channel is lost, and it does not name that as a condition to \
be assessed. Section 5 describes what each system is and what it is connected to, and the work of asking \
what the loss or malfunction of each function would mean to the aircraft belongs to the functional hazard \
assessment.

It does not classify severity. The five classes are named in section 1.3 so that the reader knows the \
vocabulary the programme uses, and no class is applied to anything in this document.

It does not state probability objectives or development assurance levels. Those follow from the \
certification basis and the category, and the category is not settled here.

It contains no requirements. No sentence in it imposes an obligation on the design. Where a design \
property is stated, it is stated as a fact about the aircraft as it stands.

It states no safety commitment as a number. There is no crew response time, no exposure time, no \
demonstrated rate and no endurance figure offered as an objective. Where an assessment needs such a \
number it must record it as an assumption, and the assumption then belongs to whoever is able to \
validate it.

Read the document as a description of an aircraft that exists. Everything that follows from it - what can \
go wrong, how badly it would matter, how often it may be allowed to happen, and what has to be shown - is \
the assessment's work and not this document's."""

APPENDIX_B_INTRO = """The Vayu VY-6 is a demonstration article. Its aircraft-level characteristics were \
chosen to follow the published envelope of a real six-passenger urban eVTOL programme, so that the \
document describes an aircraft of a realistic size, speed, payload and mission rather than an invented \
one. Those characteristics, and only those, are listed below with their source.

Everything below aircraft level - the sixteen systems, their internal architecture, their redundancy \
structure, their interfaces, the zonal layout and every installation detail in sections 2 to 6 - is \
representative. It was constructed for this document and it is not the design data of any manufacturer."""

APPENDIX_B = [
    ["Characteristic", "Value used", "Basis"],
    ["Occupancy", "1 pilot, 6 passengers",
     "Published configuration of the Sarla Aviation Shunya, a six-passenger-plus-pilot eVTOL."],
    ["Wing span", "15.00 m", "Published full-scale span for the same programme."],
    ["Maximum speed", "250 km/h", "Published top speed for the same programme."],
    ["Payload", "680 kg", "Published payload for the same programme."],
    ["Typical sector", "20 to 30 km",
     "Published urban trip range for the same programme, with a longer-range growth path stated separately."],
    ["Propulsion", "All-electric",
     "Published propulsion type for the same programme."],
    ["Operating concept", "Urban vertiport to vertiport, service from 2028",
     "Published operating concept and service target for the same programme."],
    ["Certification", "Small-category VTOL special condition, category not settled",
     "Published certification intent for the same programme, with the certifying authority its own."],
    ["Length, height, mass", "10.40 m, 3.60 m, 2,600 kg",
     "Not published. Chosen to be consistent with the span, payload and occupancy above."],
    ["Propulsor arrangement", "8 lift rotors, 2 cruise propellers",
     "Not published in this form. Representative lift-plus-cruise arrangement for the class."],
    ["All system architecture", "Sections 2 to 6",
     "Not published and not manufacturer data. Constructed for this document."],
]

APPENDIX_B_NOTE = """Sources were public at the time of writing and were read on 2 September 2026. A \
programme in flight test changes; anyone relying on the aircraft-level figures should re-read the \
source rather than this table."""
