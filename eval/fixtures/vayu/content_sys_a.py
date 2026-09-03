# -*- coding: utf-8 -*-
"""VAY-SDD-0001 - Vayu VY-6 - section 5, systems 1 to 8."""

SYSTEMS_A = [
    ("DEP", "Distributed Electric Propulsion", {
        "Purpose": """DEP converts electrical power into torque and speed for the VY-6's ten propulsors: eight lift rotors on the left and right booms (zones 400, 500) and two wing-mounted cruise propellers (zones 600, 700), via ten inverter-motor units converting high-voltage DC to variable-frequency AC.

DEP turns torque and speed demands from FCS into per-motor current commands, returning motor and inverter status to FCS over the data buses. DEP holds no authority over flight path; it executes commands and reports propulsor state.""",
        "Description & Architecture": """Each drive unit sits beside its propulsor: four per boom for lift rotors, one per wing root for cruise propellers. Each inverter takes high-voltage DC from EPD, produces three-phase AC, and drives a permanent-magnet motor coupled directly to the hub, no gearbox.

Motor position and current are sensed locally in an independent current-control loop per inverter. Each motor controller takes torque and speed setpoints over the data bus and reports winding temperature, DC link voltage, and fault flags.""",
        "Redundancy & Reconfiguration": """Each of the ten propulsors has its own inverter-motor unit and current-control loop, so a fault confined to one unit affects only its propulsor. Lift units sit four to a boom; the remaining rotors on both booms operate independently of any one unit.

The two cruise propellers are fed from separate inverters and separate sections of the EPD high-voltage bus; a fault on one inverter does not reach the other propeller's drive path. FCS adjusts torque distribution across the remaining active propulsors.""",
        "Interfaces": """DEP takes torque and speed commands from FCS over data buses A and B (routes R-5, R-6), one channel per boom and wing, returning motor and inverter status on the same buses. High-voltage power arrives from EPD on route R-1 to the booms and R-2 to the wings.

Coolant for inverter power stages and motor windings comes from TMS on route R-4, separate supply and return lines per installation. LFT interfaces at each rotor hub, taking drive torque from DEP and stop-and-align commands relayed through DEP.""",
        "Installation & Segregation": """The four left-boom units occupy zone 400 and the four right-boom units zone 500, mounted outboard with cooling lines along the boom spar. The two cruise units sit at the wing root in zones 600 and 700.

Wiring and coolant for the left boom and wing are routed separately from the right boom and wing, per the aircraft's left/right split. Data bus A and bus B run on opposite sides of the fuselage centerline.""",
        "Operation": """In hover, DEP drives all eight lift rotors at speeds and torques set by FCS, producing vertical thrust and pitch, roll and yaw control through differential thrust, while cruise propellers idle. During transition, DEP shifts torque from the lift rotors toward the cruise propellers as wing-borne lift builds.

In cruise, the lift rotors are stopped and aligned, drawing no torque, and the cruise propellers hold the thrust for the selected airspeed. DEP reports motor and inverter parameters to FCS throughout.""",
    }),
    ("LFT", "Lift Unit and Rotor Assembly", {
        "Purpose": """LFT comprises the eight lift rotors, hubs, blade retention hardware, and the stop-and-align mechanism fixing each rotor in a low-drag position for wing-borne flight. Four rotors mount on each boom, zones 400 and 500, each 2.0 meters in diameter, driven directly by a DEP motor.

The system turns motor torque into lift and control thrust in hover and transition, then stops rotation and aligns blades along the boom axis for cruise. LFT carries no drive electronics; torque comes from, and is monitored by, DEP.""",
        "Description & Architecture": """Each rotor has two blades on a central hub via a retention pin and pitch bearing, mounted on its DEP motor's output shaft. A centrifugal blade-retention path independent of the pitch bearing means attachment does not rely solely on the bearing under rotation.

The stop-and-align mechanism is an electromechanical brake and index device in each hub, actuated by a signal relayed through DEP once FCS commands transition. It stops the rotor and locks blades aligned with local airflow, releasing when hover mode resumes.""",
        "Redundancy & Reconfiguration": """The eight rotors form two sets of four, one per boom, fore and aft of the boom centerline. Each rotor's hub, blade retention hardware and stop-and-align mechanism share no moving parts with any other rotor's assembly.

A change in alignment status at one hub is confined to that rotor: the other seven retain independent stop-and-align mechanisms, each actuated by its own signal path from DEP. FCS recalculates achievable thrust and moment distribution across the remaining active rotors.""",
        "Interfaces": """LFT takes drive torque directly from the DEP motor on each rotor, and stop-and-align actuation relayed through DEP from FCS. LFT returns rotor position, lock state, and blade condition through the associated DEP unit onto data bus A or B for that boom.

The hub and blade assemblies interface mechanically with the boom structure through the rotor mounting flange, sharing the boom's load path with the DEP motor housing. LFT has no direct connection to any other system.""",
        "Installation & Segregation": """The four left-boom rotors sit in zone 400 and the four right-boom rotors in zone 500, each station separated by a structural bay that also carries the associated DEP unit. Blade sweep clearance is maintained between adjacent rotor stations on the same boom.

Left and right boom rotor assemblies are structurally and electrically independent, connected to the aircraft only through their boom root attachments and DEP data and power routes. No mechanical linkage exists between rotors on opposite booms.""",
        "Operation": """During hover and transition, each rotor turns under torque from its DEP motor, blade pitch and speed set to produce the thrust and moments FCS commands. As transition proceeds, FCS commands each stop-and-align mechanism in sequence to stop the rotor and lock the blades along the boom.

In cruise, all eight rotors stay stopped and aligned, blades edge-on to reduce drag. On the return transition, FCS releases the mechanisms in sequence, and each DEP motor spins its rotor up before wing-borne lift is reduced.""",
    }),
    ("HVB", "High Voltage Battery and Energy Storage", {
        "Purpose": """HVB stores energy for propulsion, actuation, and aircraft systems, delivering high-voltage DC to EPD. Two independent packs sit in the underfloor bay, zone 800, each built from four parallel strings of series-connected cells in its own enclosure.

Each pack's battery management system monitors cell voltage, temperature and current, balances strings, and reports state of charge and health to EPD and FCS. Enclosure venting directs any gas released by a cell to a dedicated overboard path away from occupied zones.""",
        "Description & Architecture": """The two packs sit side by side under the cabin floor, each with four strings joined in parallel at the pack's output contactors. Cells form prismatic modules, each wired for voltage and temperature sensing to the pack's controller.

Each pack's controller aggregates data from its four strings, computes state of charge and health, and commands the pack's main and precharge contactors. It communicates with EPD over the data buses, reporting status and receiving isolation commands.""",
        "Redundancy & Reconfiguration": """The two packs are electrically independent from cell level through the output contactors, each with its own controller, cooling circuit, and vent path. Either pack may be isolated from the high-voltage bus at its own contactors without action at the other.

Within each pack, the four strings are individually fused and separately monitored, so an abnormal string is identified independently of the other three. EPD combines status from both packs to determine which bus sections remain fed.""",
        "Interfaces": """HVB delivers high-voltage DC to EPD's main bus through the pack contactors, one per pack, and takes precharge and contactor commands from EPD over data bus A and B, one per pack. Battery data (charge, health, cell temperature) goes to EPD and on to FCS.

Coolant for the cell modules comes from TMS on separate supply and return lines per pack, on route R-4 from the aft equipment bay through zone 800. Each pack's vent path is independent, ducted to its own outlet.""",
        "Installation & Segregation": """The left and right packs occupy separate bays in the underfloor compartment, zone 800, divided by a bulkhead that also carries each pack's vent ducting to its own outlet. Each pack's high-voltage cabling to EPD runs on its own side of the bulkhead.

Coolant lines, data bus connections, and vent ducting for the left and right packs stay on separate sides of the underfloor bay, matching the left/right segregation used for the booms and wings.""",
        "Operation": """Normally both packs connect to the high-voltage bus and share the load from DEP, EPD's low-voltage conversion, and ACT, each controller balancing its own four strings continuously. Charge and health data are displayed to the crew and used by FCS for energy planning.

Between legs, ground charging equipment connects through EPD, and each pack accepts charge current independently under its own controller. Coolant flow to each pack is modulated by TMS from that pack's reported temperature.""",
    }),
    ("EPD", "Electrical Power Distribution", {
        "Purpose": """EPD distributes power from HVB to the DEP inverter-motor units, ACT actuators, and low-voltage systems including FCS and NAV. It comprises the high-voltage bus, its contactors, two low-voltage converters, and isolation monitoring.

EPD's contactor logic determines which bus sections are fed from which pack, and converts high-voltage power to low-voltage DC for route R-3. Isolation monitoring measures resistance between the high-voltage bus and airframe structure, reporting it to FCS.""",
        "Description & Architecture": """The high-voltage bus has two sections, one fed primarily by the left pack and one by the right, joined by a bus-tie contactor. From each section, feeders extend to the boom lift inverters on route R-1 and to the wing cruise inverters and actuation loads on route R-2.

Two low-voltage converters, one per bus section, step high-voltage DC down for route R-3 to FCS, NAV, cabin systems and lighting. Isolation monitoring units measure leakage resistance on each section independently, reporting to FCS.""",
        "Redundancy & Reconfiguration": """The two bus sections can be joined through the bus-tie contactor or separated, each then fed only by its own pack. Separating them confines a condition on one section's isolation monitoring to that section, leaving the other section's DEP and ACT feeders energized from its own pack.

Either low-voltage converter can supply the full low-voltage bus alone; normally both run in parallel, and each can be isolated at its own contactor. Feeder contactors to each boom and wing are independently controlled.""",
        "Interfaces": """EPD takes high-voltage DC from HVB's two packs and issues contactor commands to HVB over data bus A and B. EPD supplies high-voltage power to DEP on routes R-1 and R-2, and low-voltage power to FCS, NAV, ACT electronics and cabin systems on route R-3.

EPD reports bus voltage, contactor state and isolation resistance to FCS over data bus A and B, and takes power configuration commands from FCS. TMS provides coolant to the converters and contactor housings on route R-4.""",
        "Installation & Segregation": """The bus contactors and the two converters sit in the aft equipment bay, zone 300, with the bus-tie contactor central between the left and right feeders. Feeder cabling to each boom and wing exits the bay on the corresponding side.

Left-side and right-side feeders from the equipment bay to the booms and wings run along opposite sides of the fuselage structure, keeping the two bus sections separated along their length.""",
        "Operation": """Normally the bus-tie contactor is closed, both packs and both converters share the aircraft's load, and isolation monitoring runs continuously on both sections. The crew views bus voltage, contactor state, and isolation resistance on flight deck displays.

During ground charging, EPD reconfigures contactors to route charge current from ground equipment to each pack under FCS supervision. In flight, EPD changes feeder and bus-tie states only on FCS command, based on flight phase and HVB/DEP status.""",
    }),
    ("TMS", "Thermal Management", {
        "Purpose": """TMS removes heat from the two battery packs, the ten DEP inverter-motor units, and the EPD low-voltage converters, rejecting it to ambient air through heat exchangers. Two independent coolant loops, pumps, heat exchangers, and route R-4 plumbing serve each cooled component.

Coolant temperature and flow are monitored per loop and reported to FCS, with pump speed modulated by the heat load reported by HVB, DEP and EPD. TMS maintains circulation whenever the corresponding electrical system is powered.""",
        "Description & Architecture": """The two loops follow the aircraft's left/right split: one serves the left pack, the left boom's four DEP units, and the left converter; the other serves the corresponding right-side components, each loop with its own pump, heat exchanger, and reservoir, in zone 300.

Coolant is a single-phase liquid through cold plates bonded to the battery modules, inverter stages, and motor windings, returning through the heat exchanger where external airflow removes the heat. Sensors sit at each component's inlet and outlet.""",
        "Redundancy & Reconfiguration": """The left and right loops are hydraulically separate from pump to heat exchanger, sharing no common plumbing, so flow in one loop is independent of conditions in the other. Each loop's pump and heat exchanger can be commanded off independently by that loop's controller.

Within a loop, the cold plates for the battery pack, the four DEP units, and the converter are plumbed in parallel branches from a common manifold, so one branch can be throttled or shut without affecting the others.""",
        "Interfaces": """TMS supplies and returns coolant on route R-4 to HVB, DEP and EPD, with separate supply and return lines per component within a loop. TMS reports coolant temperature, flow rate and pump status to FCS over data bus A for the left loop and bus B for the right.

TMS takes heat load and temperature data from HVB's controllers, DEP's inverter and motor sensors, and EPD's converter sensors, using it to set pump speed per loop. Power for the pumps and controllers comes from EPD over route R-3.""",
        "Installation & Segregation": """The two pumps, heat exchangers and reservoirs sit in the aft equipment bay, zone 300, on opposite sides of the bay per the left/right loop split. Coolant lines from each pump run forward and outboard to the underfloor battery bay and the corresponding boom and wing.

Left-loop plumbing to the left pack, boom and converter runs along the left side of the fuselage structure, separated from the right-loop plumbing serving the corresponding right-side components.""",
        "Operation": """Once HVB, DEP and EPD are powered, both loops circulate continuously, pump speed varying with heat generated during hover, cruise and transition. Heat load rises in hover, when all eight lift rotors and inverters are active, shifting toward the cruise propeller inverters in wing-borne flight.

Between legs, the loops keep circulating during ground charging to remove heat from charge current. The crew monitors coolant temperature per loop on flight deck displays, alongside battery and inverter temperatures.""",
    }),
    ("FCS", "Flight Control System", {
        "Purpose": """FCS computes and issues the commands that fly the VY-6 in hover, wing-borne cruise, and the transition between them, turning pilot and autopilot inputs into commands for DEP and ACT. It comprises the flight control computers, control laws per flight mode, and transition logic.

FCS combines pilot inputs with attitude, position and air data from NAV to compute commands for DEP's propulsors and ACT's actuators. No mechanical linkage exists between the flight deck and the propulsors or surfaces; commands pass through FCS electrically.""",
        "Description & Architecture": """The flight control computers sit in the flight deck avionics bay, zone 100, running separate control laws for hover mode, wing-borne mode, and transition. In hover, the law allocates thrust and moments across the lift rotors through DEP; in wing-borne mode, across the cruise propellers and ACT-driven surfaces.

The transition law blends the hover and wing-borne laws as airspeed builds or decays, ramping rotor and propeller torque with the stop-and-align sequence commanded to LFT through DEP, from air data and rotor state.""",
        "Redundancy & Reconfiguration": """FCS issues commands over both data bus A and B, addressing the left boom, right boom, left wing and right wing channels separately, command and status paths staying independent through to DEP and ACT.

The control laws recompute thrust and moment allocation continuously from status reported by DEP, LFT, and ACT, redistributing torque and deflection across units reporting normal status. Each data bus carries command and status independent of the other.""",
        "Interfaces": """FCS commands DEP's ten units with torque and speed setpoints over data bus A to the left boom and wing and bus B to the right boom and wing, receiving motor and inverter status in return. FCS commands ACT's actuators with surface setpoints and receives position and status over the same buses.

FCS receives attitude, position, airspeed, altitude and low-speed air data from NAV; bus voltage, contactor state and isolation resistance from EPD; and battery, inverter, converter and coolant status from HVB, DEP and TMS.""",
        "Installation & Segregation": """The flight control computers occupy zone 100 alongside the pilot's controls and displays, with data bus A and B leaving the flight deck on opposite sides of the fuselage centerline toward the equipment bay, booms and wings.

Cabling for bus A follows the left side of the fuselage structure and bus B the right side, maintaining separation through to the boom, wing and equipment bay connection points.""",
        "Operation": """In hover, FCS computes thrust and moment commands for the lift rotors from pilot stick and pedal inputs, using attitude and low-speed air data from NAV. In cruise, FCS computes surface commands for ACT and thrust commands for the cruise propellers, holding the selected airspeed and altitude.

During transition, FCS commands LFT's stop-and-align mechanisms through DEP once conditions permit, shifting authority from rotor thrust to aerodynamic surfaces. FCS presents propulsion, actuation, power, thermal and navigation status to the crew.""",
    }),
    ("ACT", "Flight Control Actuation", {
        "Purpose": """ACT positions the ailerons on the wings and the control surfaces on the V-tail in response to commands from FCS. Electromechanical actuators, one per surface, convert an electrical position command into surface deflection.

ACT reports achieved surface position and actuator status back to FCS, closing the position loop locally at each actuator while FCS sets the commanded position. The control surfaces have no mechanical or hydraulic linkage to the flight deck; deflection comes entirely from ACT.""",
        "Description & Architecture": """Each aileron, left wing zone 600 and right wing zone 700, is driven by an actuator at the wing rib: a motor, gear reduction stage, and local position controller. The V-tail surfaces, zone 900, are each driven by a similarly configured actuator at the tail root.

Each actuator's controller closes a position loop from a sensor on the actuator output, taking its commanded position from FCS over the data bus. Wing and V-tail actuators share a common design, differing in gear ratio and output torque.""",
        "Redundancy & Reconfiguration": """Each surface's actuator has its own motor, gear stage and position controller, independent of the others. The left and right aileron actuators are fed from separate feeders sourced from EPD's left and right bus sections, and commanded from separate data buses.

FCS recomputes command allocation from the position and status each actuator reports, adjusting deflection on surfaces reporting normal status. V-tail actuators are likewise fed from separate sources on the left and right sides of zone 900.""",
        "Interfaces": """ACT takes surface position commands from FCS over data bus A for the left aileron and left V-tail surface, and bus B for the right aileron and right V-tail surface, returning position and status on the same buses. Power for the motors comes from EPD over routes R-2 and R-3.

TMS supplies no coolant to ACT directly; the actuators rely on surrounding airflow for heat rejection, with temperature reported to FCS. NAV's air data is used indirectly by FCS to schedule surface command gains at different airspeeds.""",
        "Installation & Segregation": """The aileron actuators sit within the wing structure in zones 600 and 700, close to the surface driven, and the V-tail actuators sit at the tail root in zone 900. Left-side and right-side actuator wiring is routed separately back to the fuselage.

Bus A wiring to the left aileron and left V-tail actuators, and bus B wiring to the right aileron and right V-tail actuators, follow the same left/right split used elsewhere, keeping the two command channels separated.""",
        "Operation": """In cruise and during transition, ACT positions the ailerons and V-tail surfaces continuously per FCS commands for roll, pitch and yaw control. In hover, aerodynamic surfaces contribute little authority, and ACT holds the positions FCS commands.

Actuator position and status are reported continuously to FCS in flight, and any change appears on the flight deck displays. Ground checks exercise each actuator through its travel range before departure, confirmed by FCS.""",
    }),
    ("NAV", "Navigation and Air Data", {
        "Purpose": """NAV determines the aircraft's position, attitude, velocity, and air data, and provides low-speed sensing for hover and transition when pitot-static air data is least reliable. Inertial sensors, satellite positioning, air data probes, and low-speed sensors feed FCS the state data needed for control commands.

NAV measures and reports aircraft state independently of the control laws that consume it; FCS uses that state to compute commands for DEP and ACT. NAV also feeds position and air data to crew displays and flight management functions.""",
        "Description & Architecture": """An inertial measurement unit and satellite positioning receiver, both in zone 100, provide attitude, angular rate, position and velocity. Air data probes on the forward fuselage measure airspeed, altitude and angle of attack; low-speed sensors near the booms provide groundspeed and height.

The inertial and satellite positioning data combine in a navigation computer into a blended position and attitude solution, reported to FCS continuously. Air data probe and low-speed sensor outputs are processed separately, weighted by airspeed.""",
        "Redundancy & Reconfiguration": """NAV has separate sensor sets for inertial/satellite positioning, forward air data, and low-speed sensing, each reporting to FCS independently. Low-speed sensors sit near the left and right booms, so groundspeed and height data stay available from either boom's sensor independently of the other.

FCS combines the navigation solution, air data, and low-speed sensor data by flight phase, weighting low-speed sensing more in hover and air data more in cruise. A change in one source's quality shifts the weighting applied.""",
        "Interfaces": """NAV reports the blended navigation solution, forward air data, and low-speed sensor data to FCS over data bus A and B, sensor sets split per the aircraft's left/right convention. FCS uses this data for commands issued to DEP and ACT.

NAV takes low-voltage power from EPD over route R-3, with the inertial, satellite positioning, air data and low-speed sensor sets fed from separate points on the bus. NAV has no direct interface with HVB, DEP, LFT, ACT or TMS; its data reaches them through FCS.""",
        "Installation & Segregation": """The inertial measurement unit, satellite positioning receiver and navigation computer sit in zone 100 alongside the flight control computers. Forward air data probes mount on the fuselage nose ahead of the flight deck, and low-speed sensors mount near the left and right boom roots in zones 400 and 500.

Wiring from the left-boom low-speed sensor to the navigation computer follows the bus A routing along the left side of the fuselage, and the right-boom sensor follows bus B along the right side.""",
        "Operation": """Throughout flight, NAV continuously computes and reports position, attitude and velocity, low-speed sensors active during hover and transition and air data probes most relied upon in cruise. The crew views position, attitude, airspeed and altitude on flight deck displays fed by FCS.

During transition, FCS draws on both low-speed and forward air data as their relative reliability changes with airspeed. NAV's outputs continue through ground operations for taxi and the vertiport approach.""",
    }),
]
