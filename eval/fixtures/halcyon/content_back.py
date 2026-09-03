# -*- coding: utf-8 -*-
"""HAL-SDD-0001 §6 and Appendix A.

§6 mirrors §5 by system code. That mirroring is not decoration: the decompose
coverage checklist parses the document's own two-level section list and groups
the chapters by code, so a document whose §6 does not mirror its §5 gives it
nothing to work with.

The schematics themselves are not drawn. Each entry is a real caption saying
what the figure shows and what to read off it, in the same register as the
Aeolus captions — a placeholder that describes the drawing honestly is more use
to a reader, and to the engine, than an invented picture.
"""

SECTION_6_INTRO = """The zonal model is the ten-zone division of §3 applied to the physical aircraft: \
each zone is a volume with a boundary, an environment and a list of what is installed in it. The \
schematics below are per-system views drawn on that model, so that a system can be read either as a \
functional chain or as a set of things in places.

Each figure carries the same three layers: the system's own components, the zones they sit in, and \
the routes of §4 that connect them. Where a system crosses the watertight bulkhead at frame 14, the \
crossing is marked, because that boundary is the one the hull design depends on."""

SCHEMATICS = [
 ("PRL", "Left Propulsion Unit",
  "Single-line diagram from the propulsion bus through the run A penetration to the inverter, motor "
  "and gearbox, with the two winding sets shown as separate paths from the two half-bridge sets. The "
  "coolant branch from route R-4 and the channel-1 control feed are shown entering the nacelle "
  "separately. Read off it: what is common between the two winding sets, which is the rotor and the "
  "gearbox and nothing else."),
 ("PRR", "Right Propulsion Unit",
  "The mirror of Figure 6-1, on run B and channel 2, drawn to the same key so the two can be laid "
  "side by side. Read off it: the two units are identical in design and differ only in installation, "
  "which is the distinction the independence argument turns on."),
 ("EST", "High-Voltage Energy Store",
  "The store enclosure with two strings, their contactor pairs and the battery management system, "
  "and the busbar assembly on the forward wall of the same bay with its four contactors. The "
  "overboard vent path and the cold-plate connection to route R-4 are shown leaving the bay. Read "
  "off it: every source and every consumer of high-voltage power meets at one node, and that node is "
  "in the same bay as the cells."),
 ("EGN", "Turbogenerator Set",
  "The turbine, gearbox, generator and rectifier in the aft fuselage, with the fuel gallery arriving "
  "from the wing tanks on route R-3 and the firewall shutoff valve marked outside the fire zone. The "
  "start path from the energy store is drawn as a separate line. Read off it: the generator cannot "
  "start without the store."),
 ("TMS", "Thermal Management",
  "The coolant ring as a closed loop: two pumps in the aft fuselage, the store and busbar cold "
  "plates, both nacelle radiators with their flaps, and the generator plate — every heat source on "
  "one circuit. The single bulkhead penetration at frame 14 is marked. Read off it: there is one "
  "body of coolant, and the two pumps do not make two loops."),
 ("FCA", "Flight Control Channel A",
  "The channel A computer in the forward rack, its actuator control electronics, and the actuators "
  "it drives — one half of each surface pair — with its air-data source shown coming from the "
  "primary sensor set. The channel-1 electrical feed follows route R-5 throughout. Read off it: the "
  "channel's sensing, power and processing are all on the left of the aircraft."),
 ("FCB", "Flight Control Channel B",
  "The channel B computer in the aft cabin bay, drawn to the same key, on route R-6 and channel 2, "
  "with its air-data source coming from the standby display. The mechanical reversion path to pitch "
  "trim and the lower rudder segment is overlaid as a dashed line. Read off it: the two channels "
  "share the airframe and the surfaces, and nothing else."),
 ("EL1", "Electrical Distribution Channel 1",
  "The channel-1 DC/DC converter at the store, the forward busbar and battery, and the solid-state "
  "power controllers with their loads named. Read off it: there is no bus tie to channel 2 — the "
  "absence is drawn as a gap, not left to inference."),
 ("EL2", "Electrical Distribution Channel 2",
  "The channel-2 equivalent, with its busbar and battery in the aft cabin bay and the standby "
  "display's dedicated battery shown as a further stage behind it. Read off it: the standby display "
  "is the only load with two levels of electrical backing."),
 ("DPP", "Primary Flight Display",
  "The two display units, the primary sensor set, the two heated probes, and the data paths out to "
  "flight control channel A. The crew alerting function is drawn as a block inside the display units "
  "with its inputs listed. Read off it: the primary display and channel A share a rack, a route and "
  "an electrical channel."),
 ("DPS", "Standby Display",
  "The standby unit with its own sensor, its own probe, its channel-2 feed and its dedicated "
  "battery, and its data path out to flight control channel B. Read off it: the independence from "
  "the primary display is across four things at once — sensor, probe, channel and battery."),
 ("HUF", "Forward Hull Compartment",
  "Profile and plan of the hull forward of frame 14, showing the step at frame 11, the nose gear bay "
  "and its drain, the bilge sensing, and the three sealed penetrations of the bulkhead. Read off it: "
  "the bay doors are the only opening below the waterline."),
 ("HUA", "Aft Hull Compartment & Water Systems",
  "Profile and plan aft of frame 14, showing the main gear bays, the water rudder at the sternpost "
  "with its actuator above the static waterline, and the mechanical run to the pedals on the "
  "opposite side of the hull to the air rudder run. The gear-selection interlock is drawn as a "
  "hardwired discrete. Read off it: the water rudder and the air rudder share the pedals and "
  "nothing else."),
 ("LDG", "Amphibious Landing Gear",
  "The three units with their actuators, uplocks and downlocks, and the two independent position "
  "sensors per lock drawn as separate lines to the alerting function. The channel split — nose and "
  "left main on channel 1, right main on channel 2 — is shown at the power inputs. Read off it: the "
  "indication the crew sees is a comparison, not a sensor."),
 ("FPR", "Fire & Thermal Protection",
  "The four detection zones with their dual loops on separate channels, the store bay's additional "
  "module-level sensing, the single extinguishant bottle in the generator compartment, and the "
  "isolation commands out to the fuel shutoff and the bus contactors. Read off it: three zones are "
  "answered by isolation, one by containment, and only one by extinguishant."),
 ("ECS", "Cabin Environment",
  "The bleed offtake from the turbogenerator, the air-cycle pack, the distribution ducting forward, "
  "the outflow and relief valves at the aft bulkhead, and the electrical recirculation and heating "
  "path shown as the alternative to the pack. The cabin air inlet on the upper fuselage and the "
  "store vent on the underside are both marked. Read off it: with the generator shut down the "
  "aircraft is ventilated but not pressurised."),
]

APPENDIX_A = """This document describes the Halcyon HA-10 as designed. It states what the aircraft is \
made of, how the parts are arranged, what each part needs from the others, where each part is \
installed, and how the crew operates it. It does not say what any of that is worth in safety terms.

Specifically, and deliberately, it contains no failure conditions, no severity classifications, no \
probability objectives, no development assurance levels and no safety requirements. Those are the \
output of the safety assessment, not an input to it, and a design description that pre-empts them \
makes the assessment a transcription exercise.

The distinction matters most where it is least visible. Section 5 records, for example, that the two \
propulsion units share part numbers, that the coolant loop is one loop with two pumps, that the \
propulsion bus is a single electrical node, that the primary display and flight control channel A \
share a rack and an electrical channel, and that the cabin air inlet is on the upper fuselage while \
the energy store vents from the underside. Each of those is a design fact. Whether any of them is a \
common cause, an independence violation, a single point of failure or a non-issue is a question this \
document raises and does not answer.

The same applies to the numbers. Where a figure is preliminary it says so. Where a design has a \
declared limit — a sea state, an altitude, a thermal envelope — the limit is stated as a design \
characteristic, not as a demonstrated capability, and nothing here should be read as a claim that any \
objective has been met.

Two further notes for anyone working from this document.

First, the aircraft is fictional. The Halcyon HA-10 is not any company's programme; the configuration \
is a plausible answer to the stated mission and nothing more, and no number in it is taken from, or \
intended to describe, any real aircraft.

Second, the description is deliberately uneven in one respect. Some systems are described in more \
architectural detail than others, because some are more architecturally interesting on this aircraft \
than others. That unevenness reflects the design, not an omission, and the reader should not infer \
that a shorter section describes a simpler or a less important system."""
