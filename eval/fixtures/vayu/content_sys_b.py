# -*- coding: utf-8 -*-
"""VAY-SDD-0001 - Vayu VY-6 - section 5, systems 9 to 16."""

SYSTEMS_B = [
    ("COM", "Communications", {
        "Purpose": """The communications system links the flight deck to air traffic control, vertiport operations, and dispatch, and carries cabin address and crew intercom functions. It supports frequent short urban legs between vertiports, with routine calls to ground and tower and vertiport sequencing before each approach.

A vertiport datalink transceiver exchanges pad assignment, queue position, and charging bay status with the ground network automatically in range. The passenger address amplifier and cabin speakers carry boarding, taxi, and arrival announcements; the audio panel routes radio and intercom audio to the pilot headset.""",
        "Description & Architecture": """Two VHF radios, a vertiport datalink transceiver, a crew audio panel, and a cabin address amplifier make up the system. The radios and transceiver mount in the aft equipment bay, zone 300, with antennas on the upper and lower fuselage skin in zone 100 and zone 200.

The audio panel sits in the zone 100 instrument panel, presenting radio and intercom selection through switches and a status readout. The cabin address amplifier drives speakers in the zone 200 sidewall trim; wiring runs from the equipment bay to the flight deck and cabin along route R-3.""",
        "Redundancy & Reconfiguration": """The two VHF radios are wired to separate antennas and separate low-voltage feeds on route R-3, each selectable independently at the audio panel. The datalink transceiver operates on a third, dedicated antenna and feed, distinct from either voice radio channel.

Loss of one low-voltage feed removes only the equipment on that feed, since the radios and transceiver share no common feed segment upstream of the equipment bay distribution point. The audio panel draws from both feed segments through separate input diodes.""",
        "Interfaces": """COM receives position and altitude data from NAV for datalink position reports, and traffic and terrain advisories from DAA the pilot can relay by voice. FCS supplies flight phase information used to sequence automatic cabin announcements without pilot input.

DIS presents COM channel selection and radio status on the flight deck displays. HMS records radio and datalink transmit and receive events, channel changes, and audio panel selections on data bus A. The amplifier also accepts a direct flight deck microphone input.""",
        "Installation & Segregation": """The two radios, the datalink transceiver, and their harnesses are installed on opposite sides of the aft equipment bay, zone 300, separated by the bay's centerline structure. Antenna cables follow separate conduit paths to the upper and lower fuselage antennas, crossing zone 100 and zone 200.

Low-voltage feed wiring for COM runs along route R-3, kept apart from route R-1 and route R-2 high-voltage runs by standoff brackets at each frame station. Cabin address speaker wiring in zone 200 is routed clear of the door mechanism wiring.""",
        "Operation": """Before departure the pilot selects the active radio and datalink channel at the audio panel and confirms cabin address function with a test announcement. During each leg the pilot monitors the selected radio; the transceiver exchanges pad and queue status with the destination vertiport automatically.

The amplifier plays a recorded boarding announcement at the gate and an arrival announcement after touchdown, with the pilot able to override either from the flight deck microphone. Between legs the pilot reviews radio and datalink status before requesting the next pad assignment.""",
    }),
    ("DAA", "Detect and Avoid", {
        "Purpose": """The detect and avoid system gives the pilot awareness of other air traffic, terrain, and fixed obstacles in the urban environment, where buildings, cranes, and rotorcraft can be close to the route. It combines a transponder-based traffic receiver with short-range sensors around the aircraft.

Traffic and obstacle information is fused into tracks passed to FCS for display formatting and to DIS for presentation on the flight deck screens. The system operates continuously from engine start to shutdown across the daily leg count.""",
        "Description & Architecture": """DAA combines an ADS-B in/out transponder, short-range obstacle sensors around the airframe, and a track processor in the aft equipment bay, zone 300. Camera and lidar sensors mount at the nose, each wingtip, and the tail cone, giving overlapping coverage near pads.

The track processor correlates transponder returns, received directly and relayed through the COM datalink, with the local sensor picture to build a combined track list. This list refreshes continuously and passes over data bus A to the displays and to FCS.""",
        "Redundancy & Reconfiguration": """The nose, wingtip, and tail sensors overlap in coverage, so the volume around the aircraft is observed by more than one location. The two wingtip sensor sets are wired to opposite low-voltage feed segments on route R-3, each on a separate input channel.

The track processor has two independent processing channels, each capable of building a track list from the full sensor set, with outputs cross-checked before reaching the displays. If the transponder path is affected, the processor builds tracks from local sensors alone.""",
        "Interfaces": """DAA sends traffic and obstacle tracks to FCS for correlation with the planned flight path and to DIS, rendered on the traffic and terrain page the pilot monitors during pad approach and departure. NAV supplies aircraft position and attitude used to place tracks.

COM relays vertiport-sourced traffic reports to the DAA processor over the datalink when direct transponder reception is limited. HMS records the track list, sensor source composition, and processing channel changes on data bus A.""",
        "Installation & Segregation": """The track processor is installed in the aft equipment bay, zone 300, on an independent shelf with its own low-voltage feed. The nose sensor sits in zone 100, wingtip sensors in zone 600 and zone 700, and the tail sensor in zone 900.

Sensor data cables run along route R-5, the data bus A path, kept separate from route R-1 and route R-2 high-voltage runs by standoff brackets. Wingtip sensor feed wiring follows the same left and right segregation used for wing high-voltage distribution.""",
        "Operation": """During taxi and hover near a vertiport pad, the pilot monitors the traffic and terrain display for nearby structures, ground vehicles, and other aircraft, using track symbology to judge clearance. In cruise, the display shows tracks relevant to the planned route and altitude.

The pilot can select expanded or compact display ranges, toggle terrain shading, and query a track for altitude and closure information. No pilot action is required to keep the track list current from engine start through shutdown.""",
    }),
    ("DIS", "Flight Deck Displays and Controls", {
        "Purpose": """The flight deck displays and controls system presents flight, navigation, propulsion, and system status to the pilot and provides the inceptors and switches used to command the aircraft. It brings together information from FCS, NAV, DAA, and the propulsion and power systems onto two display surfaces.

Primary and secondary flight information, system synoptic pages, and alert messages are shown across the displays, while inceptors and hard switches let the pilot command flight path, thrust, and system configuration. The system operates from before engine start through shutdown on every leg.""",
        "Description & Architecture": """Two display surfaces mount side by side in the zone 100 instrument panel, each driven by its own graphics processor and configurable to flight, navigation, or synoptic pages through bezel keys. A center inceptor and throttle levers send electrical flight path and thrust commands to FCS.

An alerting panel above the displays presents master caution and warning lights and annunciator legends, backed by an aural tone generator sharing the COM audio panel path. Hard switches for gear, lighting, and system resets sit along the lower instrument panel.""",
        "Redundancy & Reconfiguration": """The two displays are driven from separate graphics processors on separate low-voltage feeds from route R-3, and each processor can source content from either FCS computer independently. Either display can show any available page, including the other surface's page.

The center inceptor carries two independent signal paths to the two FCS computers through separate connectors; the throttle levers likewise send independent position signals to each computer. The alerting panel's tone generator and light drivers share the feed with the left display processor, the right processor on the other segment.""",
        "Interfaces": """DIS presents what FCS reports for flight path, attitude, and system status, and renders traffic and terrain tracks from DAA on a dedicated page. NAV data reaches the displays through FCS rather than a direct connection.

COM channel and datalink status appear on a system synoptic page, and LGS gear position is shown on the same page during extension and retraction. HMS records display page selections, alert messages, and inceptor and throttle positions on data bus A and data bus B.""",
        "Installation & Segregation": """The two displays, their processors, and the alerting panel install in the zone 100 instrument panel, with the left processor and display on one low-voltage feed segment and the right pair on the other, on separate bundles to the equipment bay junction.

The center inceptor and throttle wiring runs separate from display and processor wiring, following route R-5 and route R-6 for its two independent FCS signal paths. Hard switch wiring for gear, lighting, and resets connects to route R-3.""",
        "Operation": """At power-up the pilot brings up both displays through a built-in test, then selects the primary flight page on one surface and a synoptic page on the other for taxi and takeoff. In cruise the pilot commonly leaves one display on navigation.

Alert messages appear on whichever display shows a synoptic or status page, with an aural tone and, for more significant messages, a caution or warning light. The pilot acknowledges alerts through a glare shield switch and can call up the associated system page.""",
    }),
    ("LGS", "Landing Gear and Ground Contact", {
        "Purpose": """The landing gear and ground contact system supports the aircraft on the ground and vertiport pads, absorbs touchdown at the end of each hover descent, and provides signals used elsewhere to recognize weight on the wheels.

A retractable, wheeled, four-point gear arrangement is used, with nose and main legs stowed into gear bays after takeoff and extended ahead of each pad approach. A manual tow fitting and parking brake support ground movement between pads.""",
        "Description & Architecture": """Each of the three gear legs carries a wheel, a shock strut, and an electric retraction actuator supplied by ACT, stowing into an individual bay in zone 1000 after takeoff. The nose leg retracts forward and the two main legs retract inboard.

A weight-on-wheels sensor at each main leg reports ground or air state to FCS, and a position sensor on each actuator reports gear position to DIS. The parking brake acts on the main wheels through an electric caliper; a tow fitting on the nose leg allows repositioning without power.""",
        "Redundancy & Reconfiguration": """The four legs are actuated by individually powered retraction motors, each fed from route R-3 through its own circuit, so one leg's cycling does not depend on another's circuit. Weight-on-wheels sensing is taken from both main legs independently.

Each leg carries a mechanical downlock engaged by spring force once the actuator reaches the extended position, independent of continued power to the actuator. A manual extension handle in the flight deck can drive all four legs to the downlocked position without the electric actuators.""",
        "Interfaces": """LGS reports gear position and weight-on-wheels state to FCS, used in flight control logic, and to DIS for the gear indication. ACT provides the retraction and extension actuator function itself.

STR carries the gear leg attachment fittings and touchdown loads into the airframe primary structure at each of the four bay locations. HMS records gear extension and retraction events, weight-on-wheels transitions, and downlock indications on data bus B.""",
        "Installation & Segregation": """The four gear bays occupy zone 1000, the nose bay forward of the flight deck and the two main bays beneath the wing root on each side, each bounded by its own structural frame.

Retraction actuator power wiring runs along route R-3 in individual circuits per leg to the main low-voltage distribution panel. Position and weight-on-wheels sensor wiring follows route R-5 to FCS and DIS, separate from actuator power within each bay.""",
        "Operation": """The pilot commands gear retraction after a positive rate of climb following takeoff, and extension during approach to each pad, observing gear position on the flight deck display as each leg cycles.

On the ground the pilot sets the parking brake before shutdown; if repositioning is needed without power, ground crew connect the tow fitting and release the brake. The manual extension handle is used only if the electric actuators do not respond.""",
    }),
    ("STR", "Airframe Structure", {
        "Purpose": """The airframe structure carries the fuselage, wing, booms, V-tail, and battery bay, providing load paths connecting the lift rotors, cruise propellers, gear, and battery packs to a single airframe. It is built primarily from carbon fiber composite.

The structure supports the aircraft through the full range of flight conditions on the urban route network, from hover through transition to wing-borne cruise and back. Access panels throughout allow inspection and maintenance of systems within each zone.""",
        "Description & Architecture": """The fuselage is a semi-monocoque composite shell from the flight deck, zone 100, through the cabin, zone 200, to the aft equipment bay, zone 300, with the underfloor battery bay, zone 800, between the main wing spars.

The wing consists of left and right panels, zone 600 and zone 700, joined at a center section through the fuselage above the battery bay, with cruise propellers on pylons ahead of the leading edge. A V-tail, zone 900, provides aft control surface attachment points used by ACT.""",
        "Redundancy & Reconfiguration": """The wing center section carries bending and shear loads through upper and lower composite spar caps continuing across the fuselage, so a load can transfer through either spar depending on chord location. Boom attachment fittings at each wing panel are duplicated fore and aft.

The battery bay structure separates the two independent HVB packs with a composite bulkhead the length of the bay, each pack in its own structural bay beneath the cabin floor. Gear bay structure at each of the four locations is an independent frame.""",
        "Interfaces": """STR provides mounting structure and load paths for LFT at each boom station, for DEP at the wing-mounted cruise propeller pylons, and for LGS at each of the four gear bays. HVB packs are secured within the zone 800 bay structure.

ACT control surface actuators mount to fittings on the wing trailing edge and V-tail structure; EPD high-voltage cabling for route R-1 and route R-2 passes through conduits in the boom and wing spar. HMS records structural strain gauge readings on data bus A.""",
        "Installation & Segregation": """Structural bays and zones are separated by bulkheads and frames that also serve as segregation boundaries; the battery bay bulkhead separating the two HVB packs also carries route R-4 coolant lines on opposite sides.

Wing structure carries route R-2 high-voltage cabling to the cruise propeller pylons along the leading edge box, separated from the wing accessory bay by the forward spar. Access panels allow inspection without disturbing load-carrying members.""",
        "Operation": """The structure is passive in normal operation, requiring no pilot action; ground crew assess its condition through visual inspection at access panels between legs. Strain sensors report continuously to HMS, adding to the turnaround readiness data.

Ground crew check gear bay, battery bay, and boom access panels during turnaround inspection for damage or loose fasteners before release. Scheduled structural inspections at longer intervals examine the primary spar and fuselage joints.""",
    }),
    ("CAB", "Cabin and Occupant Safety", {
        "Purpose": """The cabin and occupant safety system covers passenger seating, restraints, doors, and interior of the six-passenger cabin, along with the environmental controls that keep the space comfortable across the day and night schedule.

Six passenger seats are arranged in the cabin, zone 200, each with its own restraint, and two doors provide entry and exit at each vertiport stop. Interior trim, stowage, and cabin lighting complete the environment, along with address and audio functions provided by COM.""",
        "Description & Architecture": """The cabin holds six forward-facing seats in a two-two-two arrangement, each with a four-point restraint and single-point buckle release. Two doors, one each side, open outward on hinges near the leading edge, held by an electric latch with a manual release lever.

Cabin lighting is LED strips along sidewall and ceiling trim, supplied from route R-3; environmental control outlets at the forward and aft cabin ends deliver conditioned air managed by TMS. Stowage compartments beneath each seat and in the aft cabin wall hold personal items.""",
        "Redundancy & Reconfiguration": """Each of the two doors has an independent electric latch actuator and its own manual release lever, entirely separate from the other door's mechanism and wiring. Each seat restraint buckle and webbing set is an independent, replaceable unit.

Cabin lighting is arranged in two strings, one per sidewall, wired to opposite low-voltage feed segments on route R-3, with ceiling trim lighting providing overlap. The forward and aft environmental outlets are supplied by separate ducting runs from the TMS manifold.""",
        "Interfaces": """CAB receives conditioned air from TMS at the forward and aft cabin outlets and low-voltage power from EPD for lighting and door latch actuators. COM provides the passenger address function through CAB sidewall speakers and the crew intercom link.

DIS presents door and latch status to the pilot on a cabin synoptic page during boarding and before departure. HMS records door open and closed events, latch status, and restraint buckle status where sensed, on data bus B.""",
        "Installation & Segregation": """Cabin seats mount on tracks in the cabin floor structure, zone 200, above the underfloor battery bay, zone 800, with seat track fasteners separate from the battery bay mounting rails below. Door hinges and latches mount in the fuselage door frame structure.

Cabin lighting and door latch wiring runs along route R-3 within the sidewall trim, clear of the high-voltage route R-1 and route R-2 conduits beneath the cabin floor. Cabin address speaker wiring shares the trim raceway on a separate connector run.""",
        "Operation": """Passengers board through either door at the vertiport pad; cabin crew are not carried, so the pilot or ground staff confirm each occupant is seated and restrained before requesting doors closed.

During flight the environmental outlets and cabin lighting operate continuously, adjustable by the pilot from the flight deck. On arrival the pilot confirms the aircraft is at the pad before releasing the door latches, and passengers exit through either door.""",
    }),
    ("ERS", "Emergency Recovery System", {
        "Purpose": """The emergency recovery system provides a ballistic parachute intended to lower the aircraft to the ground, with an activation handle in the flight deck, a control unit evaluating arming conditions, and a parachute assembly in the aft equipment bay, zone 300.

Arming and inhibit logic in the control unit uses airspeed, altitude, and attitude data from NAV and FCS to determine whether an activation command proceeds to the pyrotechnic charge. The deployment path runs through a frangible panel in the upper aft fuselage skin.""",
        "Description & Architecture": """The parachute assembly consists of a folded canopy and riser lines in a canister, a pyrotechnic charge that propels a drogue from the canister, and a bridle to attachment fittings on the aft fuselage. The canister mounts in zone 300 beneath a frangible cover panel.

A control unit next to the canister receives an activation signal from a guarded handle at the flight deck center console and evaluates arming conditions before sending a firing signal. The path includes a separate safe and arm switch that must be armed, set by the pilot, before firing can reach the charge.""",
        "Redundancy & Reconfiguration": """The activation handle and the safe and arm switch are two separate, independently operated flight deck controls, both required before a firing signal reaches the charge. The control unit receives airspeed and altitude from NAV over an input separate from the general data bus.

The firing circuit is powered from a dedicated battery pack within the control unit, separate from the aircraft's main low-voltage distribution on route R-3. Wiring from the unit to the charge runs in a shielded, dedicated harness.""",
        "Interfaces": """ERS receives airspeed and altitude data from NAV and attitude data from FCS for the control unit's arming and inhibit logic. EPD powers the unit's monitoring functions; the firing circuit draws from the dedicated internal battery pack.

DIS presents control unit status, including armed state and fault indication, on a dedicated flight deck annunciator near the activation handle. HMS records handle guard state, safe and arm switch position, and control unit status continuously on data bus B.""",
        "Installation & Segregation": """The canister, control unit, and dedicated firing battery install together in the aft equipment bay, zone 300, on a mounting structure attached to the fuselage frames beneath the frangible cover panel, apart from the COM and DAA equipment.

The firing harness between the control unit and the charge runs in a dedicated conduit separate from route R-3, route R-5, and route R-6. Activation handle wiring runs forward from zone 300 to zone 100, kept apart from general flight deck switch wiring.""",
        "Operation": """The safe and arm switch is set by the pilot according to operator procedures for the phase of flight, and the guarded activation handle is available at the flight deck center console throughout.

Should the pilot lift the guard and pull the handle, the control unit checks current arming conditions before passing a firing signal to the charge, which deploys the drogue and canopy through the frangible panel in the aft fuselage skin. Control unit status is visible on the annunciator throughout.""",
    }),
    ("HMS", "Health Monitoring and Data Recording", {
        "Purpose": """The health monitoring and data recording system continuously gathers status and event data from every other system, records it for later review, and compiles a turnaround readiness report used by ground crew and the pilot between legs.

Data is collected from both aircraft data buses, route R-5 data bus A and route R-6 data bus B, and written to two independent recorders in the aft equipment bay, zone 300.""",
        "Description & Architecture": """A data concentrator in zone 300 collects messages from data bus A and data bus B, timestamps them against a common clock, and writes them to two recorder units mounted alongside it. Each recorder stores a rolling record, retrievable through a data port.

The turnaround readiness report is generated at engine shutdown, drawing on status messages received during the preceding flight from every reporting system, and presented to ground crew on a maintenance terminal. The report lists system status entries by zone and system code.""",
        "Redundancy & Reconfiguration": """The two recorders each connect to both data bus A and data bus B independently, so either can build a complete record without depending on the other. Each recorder has its own low-voltage feed from route R-3, on separate feed segments.

The data concentrator has two processing channels, each capable of building the turnaround readiness report from the collected bus data. If one data bus is affected, the concentrator builds its report from the remaining bus, and indicates which bus contributed each entry.""",
        "Interfaces": """HMS records from every system on data bus B, and also data bus A, gathering status and event messages from DEP, LFT, HVB, EPD, TMS, FCS, ACT, NAV, COM, DAA, DIS, LGS, STR, CAB, and ERS.

DIS can call up recent recorded events for display on a flight deck maintenance page, drawing on the same recorder data used for the turnaround readiness report. EPD supplies low-voltage power to the concentrator and both recorders from route R-3.""",
        "Installation & Segregation": """The data concentrator and both recorders install together in the aft equipment bay, zone 300, on a shelf separate from the COM, DAA, and ERS equipment. Each recorder connects to the bay's data bus A and data bus B points by an individual cable pair.

Recorder power wiring follows route R-3 in two separate segments back to the low-voltage distribution panel, apart from the data bus cabling on route R-5 and route R-6. The maintenance data port is accessible from an external panel near the equipment bay.""",
        "Operation": """The concentrator and recorders operate automatically from engine start to shutdown, requiring no pilot action beyond calling up recent recorded events on the maintenance page if needed. At shutdown the concentrator compiles the turnaround readiness report.

Ground crew connect a maintenance terminal to the external data port between legs to review the turnaround readiness report before releasing the aircraft for its next flight, and retrieve recorder data at scheduled maintenance intervals.""",
    }),
]
