# -*- coding: utf-8 -*-
"""HAL-SDD-0001 §5 — system design descriptions, part 1 of 2 (PRL … EL2).

Each entry is (code, name, {subsection: text}). Subsection order is fixed and
mirrors the Aeolus document exactly: Purpose / Description & Architecture /
Redundancy & Reconfiguration / Interfaces / Installation & Segregation /
Operation. §6 mirrors these by code, which is what the decompose coverage
checklist parses.
"""

SYSTEMS_A = [
 ("PRL", "Left Propulsion Unit", {
  "Purpose": """The left propulsion unit converts electrical energy from the high-voltage propulsion \
bus into shaft power at the left propeller, and modulates that power in response to thrust commands \
from the flight control channels.""",
  "Description & Architecture": """The unit comprises a permanent-magnet motor, a three-phase \
inverter, a reduction gearbox and a constant-speed propeller. The inverter is the electrical boundary \
of the unit: upstream of it the aircraft is a high-voltage DC system, downstream of it a rotating \
machine.

The motor is wound as two independent three-phase sets on a shared rotor, each fed by its own \
half-bridge set within the inverter. Loss of one set leaves the unit able to produce reduced torque \
on the other; the two sets do not share gate drive, current sensing or control processing.

Propeller pitch is governed hydro-mechanically from an engine-driven pump within the gearbox, with \
electrical feather on command. Feathering does not depend on the propulsion bus.""",
  "Redundancy & Reconfiguration": """Two winding sets, two half-bridge sets, and an independent \
feather path. The unit is one of two on the aircraft and the sizing case for the pair is the \
continuation of a coastal sector after the loss of one; that case sets both the single-unit rating \
and the propeller pitch schedule, since a windmilling propeller on the failed side has to be \
feathered for the remaining unit's rating to be sufficient.""",
  "Interfaces": """In: high-voltage DC from the propulsion bus; coolant flow and return from the \
thermal management loop; thrust command and thrust-lever position from both flight control channels; \
low-voltage control power from channel 1.

Out: shaft power to the propeller; motor speed, torque, winding temperature and inverter state to the \
displays; a feather-complete discrete to the flight control channels.""",
  "Installation & Segregation": """The unit is installed in the left nacelle (zone 700L), which is a \
designated fire zone with its own detection loop and its own drainage. The inverter sits aft of the \
motor on the nacelle's rear bulkhead, cooled from the TMS radiator in the same nacelle. High-voltage \
run A enters the nacelle at the wing root and is the only high-voltage penetration on this side.""",
  "Operation": """The crew commands thrust with a single lever per side. Above a defined coolant \
temperature the unit derates automatically and the derate is annunciated. Feather is available as a \
guarded switch on the overhead panel and is also commanded automatically when the flight control \
channels detect a locked rotor."""}),

 ("PRR", "Right Propulsion Unit", {
  "Purpose": """The right propulsion unit converts electrical energy from the high-voltage propulsion \
bus into shaft power at the right propeller, and modulates that power in response to thrust commands \
from the flight control channels.""",
  "Description & Architecture": """The right unit is the mirror of the left and shares its part \
numbers: the same motor with two independent winding sets, the same two-set inverter, the same \
gearbox and the same constant-speed propeller.

That commonality is deliberate — it is a maintenance and spares decision taken at programme level — \
and it is recorded here rather than buried, because two units of identical design are not two \
independent units in every respect. What differs between them is installation: the side of the \
aircraft, the high-voltage run that feeds them, and the low-voltage channel that controls them.""",
  "Redundancy & Reconfiguration": """As the left unit: two winding sets, two half-bridge sets, an \
independent feather path, and a pair-level case in which one unit continues the sector alone. \
Nothing in the right unit reconfigures to cover a left-unit failure other than by carrying more of \
the load within its own rating.""",
  "Interfaces": """In: high-voltage DC from the propulsion bus; coolant flow and return from the \
thermal management loop; thrust command and thrust-lever position from both flight control channels; \
low-voltage control power from channel 2.

Out: shaft power to the propeller; motor speed, torque, winding temperature and inverter state to the \
displays; a feather-complete discrete to the flight control channels.""",
  "Installation & Segregation": """The unit is installed in the right nacelle (zone 700R), a \
designated fire zone with its own detection loop and drainage. It is fed by high-voltage run B, which \
crosses the watertight bulkhead at a different frame from run A and travels on the opposite side of \
the hull. Control power comes from channel 2, so the two units do not share a low-voltage source.""",
  "Operation": """As the left unit. The two thrust levers are mechanically independent and are not \
ganged; there is no single lever that commands both."""}),

 ("EST", "High-Voltage Energy Store", {
  "Purpose": """The energy store holds the propulsion energy for the sector and delivers it to the \
high-voltage propulsion bus, within the limits of its declared thermal and state-of-charge \
envelope.""",
  "Description & Architecture": """The store is built from modules arranged in two parallel strings, \
each with its own contactor pair, its own current sensing and its own module-level monitoring. A \
battery management system supervises cell voltage, module temperature and string current, and is the \
authority that opens a contactor.

Each string can be isolated at its contactors without disturbing the other. The strings share the \
enclosure, the cold plate and the vent path; they do not share monitoring hardware, contactors or \
wiring above the module level.

The enclosure is a sealed steel case with a burst membrane venting directly overboard through the \
underside of the store bay. It carries no ventilation path to the cabin.

The propulsion bus itself is part of this installation: a potted busbar assembly on the forward wall \
of the same bay, carrying four contactors — one per energy source and one per propulsion unit. It is \
a bus and not a ring, and that is the architectural fact from which most of its behaviour follows: \
every source and every consumer meets at one electrical node. Each contactor has its own controller \
and reports its own state; no two share a controller. An insulation-monitoring device measures \
leakage to airframe continuously and reports it as data.""",
  "Redundancy & Reconfiguration": """Two strings, independently isolable, either of which can feed \
the bus at reduced power. The store is one of two energy sources on the aircraft; the turbogenerator \
is the other, and the two are dissimilar by design rather than by installation. The reserve case \
that sizes the store is a single go-around at the destination followed by a diversion to an alternate; \
that case is preliminary and is expected to move.""",
  "Interfaces": """In: coolant flow and return from the thermal management loop; low-voltage control \
power, taken from both channels through a diode-OR so that the management system does not depend on \
either alone; charging current on the ground through a dedicated inlet.

Out: high-voltage DC to the propulsion bus through the string contactors; low-voltage supply to both \
electrical channels through two independent DC/DC converters; state of charge, module temperatures, \
string currents and contactor state to the displays; a thermal-event discrete to the fire and thermal \
protection system.""",
  "Installation & Segregation": """The store occupies its own bay (zone 600) below the cabin floor \
and aft of the forward watertight bulkhead. The bay is a designated fire zone, is vented overboard, \
and shares no wall with an occupied compartment other than the cabin floor, which is an insulated \
double skin. The two strings sit either side of a central web within the enclosure.""",
  "Operation": """The store is charged on the ground through the dedicated inlet, and is available \
from battery-master selection. In flight the crew sees state of charge, available power and the \
warmest module. There is no crew action that opens a contactor directly; isolation is a management-\
system function, and the crew's control is a master switch that requests it."""}),

 ("EGN", "Turbogenerator Set", {
  "Purpose": """The turbogenerator converts fuel into electrical energy in flight and delivers it to \
the high-voltage propulsion bus, supplementing or replacing the energy store as the sector \
requires.""",
  "Description & Architecture": """The set is a single-shaft gas turbine driving a generator through \
a reduction gearbox, with a rectifier converting its output to high-voltage DC at the bus. It is a \
single unit; there is no second turbogenerator.

Fuel is held in two integral wing tanks, one per side, feeding a single gallery aft to the burner. \
Each tank has its own boost pump — left on channel 1, right on channel 2 — and its own shutoff valve, \
with a crossfeed cock so either tank can supply the set. Contents are measured by capacitance probes \
with a separate low-level float switch per tank, two dissimilar means. There is no fuel in the hull \
and none is jettisonable.

Starting is from the energy store, which means the store is a prerequisite for the generator and not \
merely an alternative to it — a dependency recorded here because it is the kind of thing an \
architecture diagram hides.

The rectifier is a passive unit with no control processing; the generator's output is regulated at \
the machine.""",
  "Redundancy & Reconfiguration": """None within the set: it is a simplex system. Its redundancy \
partner is the energy store, and the pair is dissimilar — one stores, one generates, and they fail \
for unrelated reasons. The set can be shut down and its bus contactor opened without affecting the \
store's path to the bus.""",
  "Interfaces": """In: coolant flow and return from the thermal management loop; low-voltage control \
power from channel 2; power to the boost pumps, split between channels; a start command and starting \
current from the energy store; bleed offtake demand from the cabin environment system.

Out: high-voltage DC to the propulsion bus through the rectifier and its contactor; bleed air to the \
cabin environment system; shaft speed, exhaust gas temperature, fuel flow and available power to the \
displays; a thermal and overheat discrete to the fire and thermal protection system.""",
  "Installation & Segregation": """The set is installed in the aft fuselage (zone 800), a designated \
fire zone with its own detection loop, its own extinguishant bottle and a drained, ventilated \
compartment. The exhaust exits above the waterline on the port side. Tanks are within the wing box \
(zone 900), outboard of the hull and above the waterline in all normal attitudes; the gallery enters \
the fire zone on route R-3 through a firewall fitting with a shutoff valve immediately outside it. No \
fuel line runs through the cabin, the store bay or either nacelle. The rectifier sits forward of the \
firewall.""",
  "Operation": """The set is started after the store is live and is normally run for the whole sector. \
The crew selects it on or off; there is no partial mode. Shutdown in flight leaves the aircraft on \
stored energy, which is a normal reversion and is annunciated as such rather than as a failure."""}),

 ("TMS", "Thermal Management", {
  "Purpose": """The thermal management system removes heat from the energy store, the turbogenerator, \
both propulsion units and the propulsion bus, and holds each within its declared operating \
temperature range.""",
  "Description & Architecture": """A single liquid loop serves every heat source on the aircraft. Two \
pumps in the aft fuselage circulate coolant through a ring that reaches the store bay, both nacelles \
and back; each nacelle carries a radiator with its own controllable flap.

The loop is one loop. It has two pumps, two radiators and two flap controllers, but a single body of \
coolant and a single set of pipework, and a loss of containment anywhere in it is a loss of the whole \
loop. This is the aircraft's most widely shared resource and the section is written to say so rather \
than to imply otherwise.

Cold plates at the store and the busbar are integral to those assemblies. The propulsion inverters \
and the generator rectifier are plate-cooled from the same loop.""",
  "Redundancy & Reconfiguration": """Two pumps on separate electrical channels, either sufficient at \
reduced flow; two radiators, either sufficient at reduced ambient. No redundancy in the coolant path \
itself. Consumers derate on rising coolant temperature — the store first, then the propulsion units — \
and the derate order is a design choice recorded here because it determines what the aircraft still \
does as the loop degrades.""",
  "Interfaces": """In: low-voltage power to pump 1 from channel 1 and pump 2 from channel 2; flap \
commands from the same channels; coolant temperature and pressure sensing at four points in the ring.

Out: coolant flow and return to the energy store, the propulsion bus, both propulsion units and the \
turbogenerator; loop temperature, pressure and pump state to the displays; a derate request to each \
consumer.""",
  "Installation & Segregation": """Pumps and the expansion tank are in the aft fuselage (zone 800). \
The ring follows route R-4 and is the only route that enters every zone containing a heat source. It \
crosses the watertight bulkhead once, at frame 14, through a sealed penetration shared with no other \
service.""",
  "Operation": """The system runs automatically whenever the aircraft is live. The crew sees loop \
temperature and pump state, and has a pump-select switch. There is no crew action that reconfigures \
the coolant path, because there is no alternative path to select."""}),

 ("FCA", "Flight Control Channel A", {
  "Purpose": """Channel A commands the positions of the primary control surfaces in response to pilot \
and autopilot inputs, and monitors the response of those surfaces against the command it issued.""",
  "Description & Architecture": """Channel A is a flight control computer, its actuator control \
electronics, and its own sensor set. Primary control is fly-by-wire to electro-hydrostatic actuators, \
one per surface half: left and right elevator, left and right aileron, and the upper rudder segment.

The channel hosts software developed by one of two teams working to a dissimilarity argument; \
channel B hosts the other. The two channels use different processors and different air-data sources, \
and they do not exchange state except through a monitored cross-compare of surface position.

Secondary control — flap drive and pitch trim — is commanded by whichever channel is in control, \
through a single power drive unit per function with asymmetry braking at each flap section.""",
  "Redundancy & Reconfiguration": """Channel A is one of two. Each channel alone can fly the aircraft \
through its own half of each surface pair; the surfaces are sized so that one half of each pair is \
sufficient. Transfer between channels is automatic on a monitored disagreement and is annunciated. \
A mechanical reversion path exists to pitch trim and to the lower rudder segment only, and it is not \
a selectable mode — it is what remains when both channels are gone.""",
  "Interfaces": """In: 28 V DC from electrical channel 1; air data and inertial data from the primary \
display's sensor set; pilot inceptor position; autopilot commands; surface position feedback from its \
own actuators; thrust-lever position.

Out: actuator commands to its half of each surface pair; thrust commands to both propulsion units; \
control law state, surface positions and channel health to the displays; a cross-compare word to \
channel B.""",
  "Installation & Segregation": """The channel A computer is installed in the forward avionics rack \
on the left side of the nose (zone 110). Its wiring follows route R-5 on the left of the aircraft \
throughout. It is powered from electrical channel 1 and shares no power, sensing or processing \
element with channel B; the two share only the airframe and the surfaces they drive.""",
  "Operation": """The crew flies through conventional inceptors with envelope protection active in \
the normal control law. Degraded laws are annunciated. Channel selection is automatic; the crew has a \
channel-select switch for maintenance and for a deliberate transfer."""}),

 ("FCB", "Flight Control Channel B", {
  "Purpose": """Channel B commands the positions of the primary control surfaces in response to pilot \
and autopilot inputs, and monitors the response of those surfaces against the command it issued.""",
  "Description & Architecture": """Channel B is the dissimilar counterpart of channel A: a different \
processor family, software from the second development team, and its own sensor set taken from the \
standby display's sources rather than the primary's.

It drives the other half of each surface pair — right and left elevator inboard sections, the \
opposite aileron actuator, and the lower rudder segment. The lower rudder segment is the one that \
retains a mechanical path, so channel B's surface set and the mechanical reversion set overlap by \
design.""",
  "Redundancy & Reconfiguration": """As channel A, and symmetrically: either channel alone is \
sufficient, transfer is automatic on a monitored disagreement, and the mechanical path is what \
remains below both. The asymmetry worth recording is the sensor source — channel B reads the standby \
display's air data, which is itself on a separate supply — so the two channels do not fail together \
on a common air-data source.""",
  "Interfaces": """In: 28 V DC from electrical channel 2; air data and inertial data from the standby \
display's sensor set; pilot inceptor position; autopilot commands; surface position feedback from its \
own actuators; thrust-lever position.

Out: actuator commands to its half of each surface pair; thrust commands to both propulsion units; \
control law state, surface positions and channel health to the displays; a cross-compare word to \
channel A.""",
  "Installation & Segregation": """The channel B computer is installed in the aft cabin equipment bay \
on the right side (zone 300), not in the forward rack. Its wiring follows route R-6 on the right of \
the aircraft throughout. The physical separation between the two computers is the length of the \
cabin, and it is the basis on which the two are installed rather than co-located.""",
  "Operation": """As channel A. The channel-select switch selects either channel explicitly; there is \
no position in which both are commanded to drive the same surface half."""}),

 ("EL1", "Electrical Distribution Channel 1", {
  "Purpose": """Channel 1 converts high-voltage energy to low voltage and distributes it to the \
channel-1 loads, including flight control channel A and the primary display.""",
  "Description & Architecture": """A DC/DC converter at the energy store steps high voltage down to \
28 V and feeds a channel-1 busbar in the forward avionics rack. Distribution is through solid-state \
power controllers, one per load, each individually resettable and each reporting its own state.

A channel-1 battery sits across the bus and carries the channel through a converter failure or a \
high-voltage isolation, for a duration that the assessment will size rather than this document.

There is no bus tie between channel 1 and channel 2. The absence is deliberate: a tie would make a \
fault on one bus reachable from the other, and the two channels exist to not do that.""",
  "Redundancy & Reconfiguration": """Channel 1 is one of two. Every flight-critical load set is \
carried by one channel or the other, and the split is by function rather than by convenience — \
channel A of the flight controls, the primary display, the left boost pump, coolant pump 1. There is \
no reconfiguration between channels; the redundancy is at the load, not at the bus.""",
  "Interfaces": """In: high-voltage DC from the energy store through the channel-1 DC/DC converter; \
charging current to the channel-1 battery.

Out: 28 V DC to flight control channel A, the primary display, the left fuel boost pump, coolant pump \
1, the channel-1 half of the gear control, and the channel-1 fire detection loop; bus voltage, load \
states and battery state to the displays.""",
  "Installation & Segregation": """The channel-1 converter is at the energy store bay (zone 600); the \
channel-1 busbar and battery are in the forward avionics rack (zone 110). Wiring follows route R-5 on \
the left of the aircraft. Channel 1 and channel 2 share no generation, conversion or busbar element, \
and cross only at the flight deck bulkhead, through separate grommets 400 mm apart.""",
  "Operation": """The channel is energised by the battery master. Individual loads can be reset from \
the overhead panel. The crew has no control that connects channel 1 to channel 2."""}),

 ("EL2", "Electrical Distribution Channel 2", {
  "Purpose": """Channel 2 converts high-voltage energy to low voltage and distributes it to the \
channel-2 loads, including flight control channel B and the standby display.""",
  "Description & Architecture": """Channel 2 mirrors channel 1: its own DC/DC converter at the energy \
store, its own busbar, its own solid-state power controllers, and its own battery.

Its busbar is in the aft cabin equipment bay rather than the forward rack, so the two channels are \
separated along the length of the aircraft as well as across it. The standby display carries a further \
dedicated battery of its own, independent of the channel-2 battery — that display is the only load on \
the aircraft with two levels of electrical backing.""",
  "Redundancy & Reconfiguration": """As channel 1, symmetrically, and with the same deliberate \
absence of a bus tie. The channel-2 load set is flight control channel B, the standby display, the \
right boost pump, coolant pump 2, the channel-2 half of the gear control, and the channel-2 fire \
detection loop.""",
  "Interfaces": """In: high-voltage DC from the energy store through the channel-2 DC/DC converter; \
charging current to the channel-2 battery and to the standby display's dedicated battery.

Out: 28 V DC to the loads listed above; bus voltage, load states and battery states to the \
displays.""",
  "Installation & Segregation": """The channel-2 converter is at the energy store bay (zone 600) on \
the opposite face of the enclosure to channel 1's. The channel-2 busbar and battery are in the aft \
cabin equipment bay (zone 300). Wiring follows route R-6 on the right of the aircraft.""",
  "Operation": """As channel 1. Both channels come up on the battery master and neither is selectable \
independently in normal operation."""}),
]
