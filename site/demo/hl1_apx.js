/* ============================================================================
 * demo/hl1_apx.js (23 Nov 2026): the Aeolus HL-1 demo with the Interdependence, MAC and CoFFE Autopilots done for all
 * sixty aircraft failure conditions and sent to the PASA (1.1: the full-scale aircraft, thirty more).
 *
 * Waqas, 23 Nov 2026: a customer wants "the aeolus demos fully populated with the autopilots"; "demo in all the builds need to
 * upgraded with all the latest information".
 *
 * NOTHING HERE IS A RESULT. This file holds only what an engineer types into the three Autopilots: how each system
 * function is built, what each resource failure does to each function it feeds, the answer to each question, the
 * outcomes and what they mean, and the budget for each event. fill() puts them in through the Autopilots' own steps
 * and sends each failure condition, so the tables, the gates, the math, the CMA list, the system FHA lines and the PASA
 * text all come from the live engine, the same way the rest of this demo is built ("run the real engines over the
 * loaded model"). It is signed by the demo's safety engineer on a fixed date (SLApxAuto.fillAs), and it is carried to
 * today's stores with the team switch off too, so every build shows it.
 *
 * Every figure here rests on the demo's public-information assumptions (Assumptions page); the evidence named for the
 * answers is to be replaced by simulator evidence. Tests: tests/regression_hl1_apx_demo_20261123.test.js.
 * ==========================================================================*/
(function () {
    'use strict';
    var VERSION = '1.1';

    const B = (name, pattern, units, extra) => Object.assign({ name, pattern, units }, extra || {});
    const BUILDS = {
        'SFN-FCS1': [B('Elevator surfaces', 'lr', ['LH elevator', 'RH elevator']), B('Pitch control lanes', 'shared', ['Command lane', 'Monitor lane'])],
        'SFN-FCS2': [B('Ailerons', 'lr', ['LH aileron', 'RH aileron']), B('Roll spoilers', 'lr', ['LH roll spoilers', 'RH roll spoilers'])],
        'SFN-FCS3': [B('Rudders', 'lr', ['LH fin rudder', 'RH fin rudder'])],
        'SFN-FCS4': [B('Ground spoilers', 'lr', ['LH ground spoilers', 'RH ground spoilers'])],
        'SFN-PRP1': [B('Left wing powerplants', 'shared', ['Powerplant 1 (outboard)', 'Powerplant 2 (inboard)']), B('Right wing powerplants', 'shared', ['Powerplant 3 (inboard)', 'Powerplant 4 (outboard)'])],
        'SFN-PRP2': [B('Thrust asymmetry monitor', 'shared', ['Asymmetry monitor', 'Engine indication cross-check'])],
        'SFN-PRP3': [B('Thrust reversers', 'lr', ['LH reversers', 'RH reversers'])],
        'SFN-LDG1': [B('Gear extension', 'backup', ['Normal hydraulic extension', 'Alternate free-fall extension'], { co: 'no' })],
        'SFN-LDG2': [B('Brake hydraulic supply', 'backup', ['Normal brakes (system A)', 'Alternate brakes (system B)'], { co: 'yes' }), B('Brake control monitor', 'shared', ['Brake control unit A monitor', 'Brake control unit B monitor'])],
        'SFN-LDG3': [B('Nose-wheel steering', 'backup', ['Steering actuator (system A)', 'Differential braking'], { co: 'no' })],
        'SFN-LDG4': [B('Main gear bogies', 'pairs', ['Left bogie group', 'Right bogie group'])],
        'SFN-AVI1': [B('Display channels', 'triple', ['Captain PFD', 'First officer PFD', 'Standby instrument'])],
        'SFN-AVI2': [B('Crew alerting computers', 'shared', ['Alerting computer 1', 'Alerting computer 2'])],
        'SFN-AVI3': [B('Navigation sources', 'shared', ['GNSS receiver 1', 'GNSS receiver 2'])],
        'SFN-IPS1': [B('Wing and tail anti-ice', 'lr', ['LH anti-ice', 'RH anti-ice'])],
        'SFN-IPS2': [B('Probe heaters', 'triple', ['Probe heater 1', 'Probe heater 2', 'Probe heater 3'])],
        'SFN-FUE1': [B('Tank groups', 'pairs', ['Left tank group', 'Right tank group'])],
        'SFN-FUE2': [B('Engine feed paths', 'pairs', ['Inboard feed pair', 'Outboard feed pair'])],
        'SFN-FUE3': [B('Transfer and balance control', 'single', ['Fuel management computer'])],
        'SFN-CRG1': [B('Restraint load paths', 'shared', ['Primary load path', 'Secondary load path'])],
        'SFN-CRG2': [B('Center of gravity determination', 'shared', ['Load sheet', 'On-board weighing system'])],
        'SFN-CRG3': [B('Loading system', 'single', ['Loading conveyor and winch'])],
        'SFN-ECS1': [B('Pressurization packs', 'shared', ['Pack 1', 'Pack 2'])],
        'SFN-ECS2': [B('Flight-deck pressure control', 'backup', ['Automatic controller', 'Manual control'], { co: 'no' })],
        'SFN-ECS3': [B('Relief valves', 'shared', ['Relief valve 1', 'Relief valve 2'])],
        'SFN-OXY1': [B('Crew oxygen', 'shared', ['Main oxygen bottle', 'Reserve oxygen bottle'])],
        'SFN-NZD1': [B('Door actuation', 'single', ['Door actuators'])],
        'SFN-NZD2': [B('Latches and locks', 'shared', ['Latch set', 'Lock set'])],
        'SFN-NZD3': [B('Lock indication channels', 'shared', ['Indication channel 1', 'Indication channel 2'])],
        'SFN-EPS1': [B('Engine generators', 'pairs', ['Left wing generators', 'Right wing generators']), B('Emergency sources', 'backup', ['APU generator', 'Main battery'], { co: 'yes' })],
        'SFN-EPS2': [B('Main AC buses', 'shared', ['AC bus 1', 'AC bus 2'])],
        'SFN-EWS1': [B('Wiring segregation', 'single', ['Segregated harness routes'])],
        'SFN-HYD1': [B('Hydraulic systems', 'triple', ['System A', 'System B', 'System C'])],
        'SFN-HYD2': [B('System isolation valves', 'single', ['Isolation valves'])],
        'SFN-FPR1': [B('Detection loops', 'shared', ['Loop A', 'Loop B'])],
        'SFN-FPR2': [B('Extinguisher bottles', 'shared', ['Bottle 1', 'Bottle 2'])],
        // 23 Nov 2026: the full-scale aircraft
        'SFN-AFS1': [B('Autopilot channels', 'shared', ['Autopilot channel 1', 'Autopilot channel 2'])],
        'SFN-AFS2': [B('Autothrust drive', 'shared', ['Servo motor', 'Failure annunciation'])],
        'SFN-HLF1': [B('Trailing-edge flaps', 'lr', ['Left flaps', 'Right flaps'])],
        'SFN-HLF2': [B('Leading-edge slats', 'lr', ['Left slats', 'Right slats'])],
        'SFN-HLF3': [B('Asymmetry brakes', 'shared', ['Left wing tip brake', 'Right wing tip brake'])],
        'SFN-HLF4': [B('Position monitoring lanes', 'shared', ['Lane 1', 'Lane 2'])],
        'SFN-APU1': [B('APU', 'single', ['APU'])],
        'SFN-APU2': [B('APU bleed shutoff', 'single', ['APU bleed shutoff valve'])],
        'SFN-COM1': [B('Voice radios', 'triple', ['VHF radio 1', 'VHF radio 2', 'HF radio'])],
        'SFN-COM2': [B('Datalink', 'single', ['Datalink unit'])],
        'SFN-LGT1': [B('Landing lights', 'lr', ['Left landing light', 'Right landing light'])],
        'SFN-LGT2': [B('Flight deck lighting', 'backup', ['Normal flight deck lighting', 'Standby flood lighting'], { co: 'no' })],
        'SFN-LGT3': [B('Emergency lighting', 'shared', ['Battery pack 1', 'Battery pack 2'])],
        'SFN-WWS1': [B('Potable water', 'single', ['Water tank and pump'])],
        'SFN-WWS2': [B('Waste containment', 'backup', ['Waste line', 'Drained shroud'], { co: 'no' })],
        'SFN-REC1': [B('Voice recording', 'single', ['Voice recorder function'])],
        'SFN-REC2': [B('Data recording', 'single', ['Data recorder function'])],
        'SFN-STW1': [B('Shaker channels', 'shared', ['Shaker channel 1', 'Shaker channel 2'])],
        'SFN-STW2': [B('Pusher channels', 'shared', ['Pusher channel 1', 'Pusher channel 2'])],
        'SFN-SAW1': [B('Terrain warning', 'single', ['Terrain awareness computer'])],
        'SFN-SAW2': [B('Collision avoidance', 'single', ['Collision avoidance computer'])],
        'SFN-WSH1': [B('Windshield heat', 'lr', ['Left windshield heat', 'Right windshield heat'])],
        'SFN-WSH2': [B('Wipers', 'lr', ['Left wiper', 'Right wiper'])],
        'SFN-ECS4': [B('Avionics cooling fans', 'shared', ['Fan 1', 'Fan 2'])],
        'SFN-FUE4': [B('Fuel quantity channels', 'shared', ['Capacitance gauging', 'Fuel used cross-check'])]
    };
    // what each resource failure does to each function it feeds (state: none | partial | total | wrong; none needs a reason)
    const R = (res, mode, state, why) => ({ res, mode, state, why });
    const HYD3 = ['RES-02', 'RES-03', 'RES-04'].map(r => R(r, 'Total loss', 'none', 'Actuated from any two of the three hydraulic systems'));
    const RES_BY_FN = {
        'SFN-FCS1': HYD3.concat([R('RES-01', 'Total loss', 'partial')]),
        'SFN-FCS2': HYD3.concat([R('RES-01', 'Total loss', 'partial')]),
        'SFN-FCS3': HYD3.concat([R('RES-01', 'Total loss', 'partial')]),
        'SFN-FCS4': [R('RES-02', 'Total loss', 'partial'), R('RES-03', 'Total loss', 'partial')],
        'SFN-PRP1': [R('RES-05', 'Partial loss', 'partial')],
        'SFN-PRP2': [R('RES-01', 'Total loss', 'partial')],
        'SFN-PRP3': [R('RES-02', 'Total loss', 'partial'), R('RES-03', 'Total loss', 'partial')],
        'SFN-LDG1': [R('RES-02', 'Total loss', 'partial')],
        'SFN-LDG2': [R('RES-02', 'Total loss', 'partial'), R('RES-03', 'Total loss', 'partial')],
        'SFN-LDG3': [R('RES-02', 'Total loss', 'partial')],
        'SFN-AVI1': [R('RES-01', 'Total loss', 'partial'), R('RES-01', 'Degraded', 'partial')],
        'SFN-AVI2': [R('RES-01', 'Total loss', 'partial')],
        'SFN-AVI3': [R('RES-01', 'Total loss', 'partial')],
        'SFN-IPS1': [R('RES-06', 'Partial loss', 'partial')],
        'SFN-IPS2': [R('RES-01', 'Total loss', 'partial')],
        'SFN-FUE2': [R('RES-01', 'Total loss', 'partial')],
        'SFN-CRG2': [R('RES-01', 'Total loss', 'partial')],
        'SFN-ECS1': [R('RES-06', 'Partial loss', 'partial'), R('RES-06', 'Total loss', 'total')],
        'SFN-ECS2': [R('RES-06', 'Total loss', 'total')],
        'SFN-NZD1': [R('RES-02', 'Total loss', 'partial')],
        'SFN-NZD3': [R('RES-01', 'Total loss', 'total')],
        'SFN-HYD1': [R('RES-01', 'Total loss', 'none', 'Systems A and B have engine-driven pumps; only the electric pump of system C stops, and one system lost is not a partial loss here')],
        'SFN-FPR1': [R('RES-01', 'Total loss', 'partial')],
        'SFN-AFS1': [R('RES-01', 'Total loss', 'partial')],
        'SFN-AFS2': [R('RES-01', 'Total loss', 'none', 'The servo is on the essential bus, which the battery keeps')],
        'SFN-HLF1': [R('RES-02', 'Total loss', 'partial'), R('RES-03', 'Total loss', 'partial')],
        'SFN-HLF2': [R('RES-02', 'Total loss', 'partial'), R('RES-03', 'Total loss', 'partial')],
        'SFN-HLF3': [R('RES-01', 'Total loss', 'none', 'The brakes are set by springs and released by power, so a power loss applies them')],
        'SFN-HLF4': [R('RES-01', 'Total loss', 'partial')],
        'SFN-COM1': [R('RES-01', 'Total loss', 'partial')],
        'SFN-LGT1': [R('RES-01', 'Total loss', 'partial')],
        'SFN-LGT2': [R('RES-01', 'Total loss', 'partial')],
        'SFN-STW1': [R('RES-01', 'Total loss', 'partial')],
        'SFN-STW2': [R('RES-01', 'Total loss', 'partial')],
        'SFN-WSH1': [R('RES-01', 'Total loss', 'partial')],
        'SFN-ECS4': [R('RES-01', 'Total loss', 'partial')],
        'SFN-FUE4': [R('RES-01', 'Total loss', 'partial')]
    };
    const PARTIAL_PHRASE = { none: 'No effect. Loss of redundancy', partial: 'Partial loss of this function', total: 'Total loss of this function', wrong: 'Wrong output' };
    // what each resource failure does at aircraft level
    const AC = { 'RES-01': 'Degraded, failure condition not reached', 'RES-02': 'Loss of redundancy only', 'RES-03': 'Loss of redundancy only', 'RES-04': 'Loss of redundancy only', 'RES-05': 'Degraded, failure condition not reached', 'RES-06': 'Degraded, failure condition not reached' };
    // ---- the failure conditions -------------------------------------------------------------------------------------
    // lvl(s): the outcome level of a case (0 = the best outcome ... top = the worst); s(name) is the state of an assembly
    // group ('O', 'D', 'F'), m(funcId) is true when that function's wrong action is in the case.
    const lost = x => x !== 'O';
    const FCS = {
        'FC-01': { mid: [['Reduced pitch authority', 'none', 'One elevator surface lost: pitch control kept inside the certified envelope with reduced margin']], best: 'Pitch control kept', worst: 'Pitch attitude cannot be controlled by any means',
                   lvl: s => (s('Elevator surfaces') === 'F' || s('Pitch control lanes') === 'F') ? 2 : s('Elevator surfaces') === 'D' ? 1 : 0, why: 'No pitch control surface or no control lane is left to move the elevators' },
        'FC-02': { malf: { 'SFN-FCS1': 'combo' }, best: 'Wrong pitch output caught by the monitor lane', worst: 'A wrong pitch response at low altitude the crew cannot correct in time', lvl: s => (s.m('SFN-FCS1') && s('Pitch control lanes') === 'D') ? 1 : 0 },
        'FC-03': { mid: [['Reduced roll authority', 'none', 'Roll control kept on one set of surfaces, crosswind limit reduced']], best: 'Roll control kept', worst: 'Roll attitude cannot be controlled',
                   lvl: s => (s('Ailerons') === 'F' && lost(s('Roll spoilers'))) || (s('Roll spoilers') === 'F' && lost(s('Ailerons'))) ? 2 : (s('Ailerons') === 'F' || s('Roll spoilers') === 'F') ? 1 : 0, why: 'Not enough roll authority left: the remaining surfaces cannot hold wings level against the asymmetric roll' },
        'FC-04': { mid: [['Yaw control on one rudder', 'none', 'One fin rudder left: enough for the engine-out case, crosswind limit reduced']], best: 'Yaw control kept', worst: 'Yaw and sideslip cannot be controlled',
                   lvl: s => s('Rudders') === 'F' ? 2 : s('Rudders') === 'D' ? 1 : 0, why: 'No rudder left to counter an engine failure or a crosswind' },
        'FC-05': { mid: [['Both engines lost on one side', 'FC-06', 'Two engines on one side lost: asymmetric thrust at the controllability limit, continued flight to the nearest strip']], best: 'Thrust enough to continue', worst: 'No thrust on any engine: forced landing',
                   lvl: s => (s('Left wing powerplants') === 'F' && s('Right wing powerplants') === 'F') ? 2 : (s('Left wing powerplants') === 'F' || s('Right wing powerplants') === 'F') ? 1 : 0, why: 'No powerplant left to deliver thrust' },
        'FC-06': { best: 'Thrust balanced enough to continue', worst: 'Both engines lost on one side at take-off or climb',
                   lvl: s => (s('Left wing powerplants') === 'F' || s('Right wing powerplants') === 'F') ? 1 : 0, why: 'Both engines on one side lost: the asymmetric thrust is beyond the rudder at low speed' },
        'FC-07': { best: 'Asymmetry annunciated', worst: 'Thrust asymmetry beyond controllable limits goes unannunciated', lvl: s => s('Thrust asymmetry monitor') === 'F' ? 1 : 0, why: 'No monitor left to annunciate the asymmetry' },
        'FC-08': { mid: [['Low-speed overrun into the strip end safety area', 'none', 'Overrun at 30 knots or less into the graded end safety area']], best: 'Stops on the strip', worst: 'High-speed overrun off a semi-prepared strip',
                   lvl: s => (s('Brake hydraulic supply') === 'F' && (s('Thrust reversers') === 'F' || s('Ground spoilers') === 'F')) ? 2 : (s('Brake hydraulic supply') === 'F' || (s('Thrust reversers') === 'F' && s('Ground spoilers') === 'F')) ? 1 : 0, why: 'Not enough stopping force left on 1,800 m of graded dirt' },
        'FC-09': { best: 'Directional control kept', worst: 'Runway excursion on the ground', lvl: s => s('Nose-wheel steering') === 'F' ? 1 : 0, why: 'No steering left; differential braking alone cannot hold the centerline on dirt' },
        'FC-10': { best: 'Primary display kept', worst: 'No attitude, airspeed or altitude display in IMC', lvl: s => s('Display channels') === 'F' ? 1 : 0, why: 'No display channel left, the standby instrument included' },
        'FC-11': { malf: { 'SFN-AVI1': 'combo' }, best: 'Misleading data caught by the cross-check', worst: 'The crew follows misleading attitude or airspeed', lvl: s => (s.m('SFN-AVI1') && s('Display channels') === 'D') ? 1 : 0 },
        'FC-12': { best: 'Hazard alerting kept', worst: 'A hazard goes unalerted', lvl: s => s('Crew alerting computers') === 'F' ? 1 : 0, why: 'No alerting computer left' },
        'FC-13': { mid: [['Asymmetric icing on one wing', 'none', 'Ice builds on one wing: exit icing at once, increased approach speed']], best: 'Ice protection kept', worst: 'Unprotected flight in icing: loss of lift or of air data',
                   lvl: s => (s('Wing and tail anti-ice') === 'F' || s('Probe heaters') === 'F') ? 2 : (s('Wing and tail anti-ice') === 'D' || s('Probe heaters') === 'D') ? 1 : 0, why: 'No protection left on the lifting surfaces or on the air-data probes' },
        'FC-14': { mid: [['Feed to one engine pair lost', 'none', 'Fuel to two engines lost: continue on the other two to a diversion field']], best: 'Fuel delivered to all engines', worst: 'All engines flame out for lack of fuel',
                   lvl: s => (s('Engine feed paths') === 'F' || s('Tank groups') === 'F' || (s('Transfer and balance control') === 'F' && lost(s('Engine feed paths')))) ? 2 : lost(s('Engine feed paths')) ? 1 : 0, why: 'No feed path or no tank group left to deliver fuel, or fuel trapped once balance control is lost with a feed path down' },
        'FC-15': { best: 'Gear down and locked', worst: 'Landing with the gear not locked', lvl: s => s('Gear extension') === 'F' ? 1 : 0, why: 'Neither the normal nor the free-fall extension can lock the gear' },
        'FC-16': { malf: { 'SFN-AVI3': 'combo' }, best: 'Guidance error caught by the independent cross-check', worst: 'Approach flown on misleading guidance to an unsurveyed strip', lvl: s => (s.m('SFN-AVI3') && lost(s('Navigation sources'))) ? 1 : 0 },
        'FC-17': { best: 'Payload held', worst: 'Payload shifts or breaks free in flight', lvl: s => s('Restraint load paths') === 'F' ? 1 : 0, why: 'Neither load path left at a restraint station' },
        'FC-18': { best: 'Center of gravity confirmed inside the envelope', worst: 'Take-off with the center of gravity outside the envelope', lvl: s => s('Center of gravity determination') === 'F' ? 1 : 0, why: 'No means left to establish the loaded center of gravity' },
        'FC-19': { malf: { 'SFN-CRG2': 'combo' }, best: 'Wrong figure caught by the independent check', worst: 'Take-off on an erroneous weight and balance figure', lvl: s => (s.m('SFN-CRG2') && s('Center of gravity determination') === 'D') ? 1 : 0 },
        'FC-20': { best: 'Hold pressurized', worst: 'Hold depressurized at altitude: descent and diversion', lvl: s => s('Pressurization packs') === 'F' ? 1 : 0, why: 'No pack left to pressurize the hold' },
        'FC-21': { malf: { 'SFN-ECS1': 'combo' }, best: 'Over-pressure relieved', worst: 'Hold over-pressure beyond the structural limit', lvl: s => (s.m('SFN-ECS1') && s('Relief valves') === 'F') ? 1 : 0 },
        'FC-22': { mid: [['Emergency descent on reduced oxygen', 'none', 'Flight-deck pressure lost with one oxygen bottle left: emergency descent within the bottle duration']], best: 'Crew protected', worst: 'Crew incapacitated by hypoxia',
                   lvl: s => (s('Flight-deck pressure control') === 'F' && s('Crew oxygen') === 'F') ? 2 : (s('Flight-deck pressure control') === 'F' && s('Crew oxygen') === 'D') ? 1 : 0, why: 'Flight-deck pressure lost with no oxygen left for the crew' },
        'FC-23': { best: 'Door held closed', worst: 'Nose door opens in flight', lvl: s => s('Latches and locks') === 'F' ? 1 : 0, why: 'Neither the latches nor the locks hold the door' },
        'FC-24': { best: 'Lock state indicated', worst: 'Dispatch with the lock state unknown', lvl: s => s('Lock indication channels') === 'F' ? 1 : 0, why: 'No indication channel left' },
        'FC-25': { malf: { 'SFN-NZD3': 'combo' }, best: 'False locked indication caught by channel disagree', worst: 'Take-off with the door indicated locked when it is not', lvl: s => (s.m('SFN-NZD3') && s('Lock indication channels') === 'D') ? 1 : 0 },
        'FC-26': { mid: [['Essential bus on emergency sources only', 'FC-59', 'All engine generators lost: essential loads on the APU generator or the battery, land at the nearest suitable field']], best: 'Electrical power kept', worst: 'No electrical power to any bus',
                   lvl: s => ((s('Engine generators') === 'F' && s('Emergency sources') === 'F') || s('Main AC buses') === 'F' || (s('Wiring segregation') === 'F' && lost(s('Main AC buses')))) ? 2 : s('Engine generators') === 'F' ? 1 : 0, why: 'No source or no bus left to supply power, or a wiring failure takes out the remaining bus' },
        'FC-27': { mid: [['One hydraulic system left', 'FC-57', 'Two systems lost: flight control on one system, reduced authority, land at the nearest suitable field']], best: 'Hydraulic power kept', worst: 'No hydraulic power for flight control',
                   lvl: s => (s('Hydraulic systems') === 'F' || (s('Hydraulic systems') === 'D' && s('System isolation valves') === 'F')) ? 2 : s('Hydraulic systems') === 'D' ? 1 : 0, why: 'No hydraulic system left, or the isolation fails with only one system left' },
        'FC-28': { mid: [['One bogie group damaged', 'none', 'One bogie group fails its load path: stop on the strip, structural inspection']], best: 'Loads absorbed', worst: 'Gear or airframe structural failure on the unpaved surface',
                   lvl: s => s('Main gear bogies') === 'F' ? 2 : s('Main gear bogies') === 'D' ? 1 : 0, why: 'Neither bogie group can carry the semi-prepared surface loads' },
        'FC-29': { best: 'Fire detected and put out', worst: 'Fire spreads in the hold or a nacelle', lvl: s => (s('Detection loops') === 'F' || s('Extinguisher bottles') === 'F') ? 1 : 0, why: 'No detection loop or no extinguisher bottle left' },
        'FC-30': { malf: { 'SFN-PRP1': 'alone' }, best: 'Thrust as commanded', worst: 'Uncommanded thrust change on one engine', lvl: s => 0 },
        // ---- 23 Nov 2026: the full-scale aircraft -------------------------------------------------------------------
        'FC-31': { malf: { 'SFN-AFS1': 'combo' }, best: 'Excursion caught by the monitor channel', worst: 'Flight path leaves the approach below 1,000 ft', lvl: s => (s.m('SFN-AFS1') && s('Autopilot channels') === 'D') ? 1 : 0 },
        'FC-32': { best: 'Autoflight kept', worst: 'Hand flying for the rest of the sector', lvl: s => s('Autopilot channels') === 'F' ? 1 : 0, why: 'No autopilot channel left to drive the autopilot or the autothrust' },
        'FC-33': { best: 'Autothrust works, or its failure is annunciated', worst: 'Go-around started without the thrust the climb needs', lvl: s => s('Autothrust drive') === 'F' ? 1 : 0, why: 'The servo fails and its failure is not annunciated' },
        'FC-34': { mid: [['High-lift locked out by the asymmetry brakes', 'none', 'Surfaces stopped where they were within roll authority: approach at a higher speed to a longer runway']], best: 'High-lift symmetric', worst: 'Rolling moment beyond the ailerons and spoilers near the ground',
                   lvl: s => ((s('Trailing-edge flaps') === 'D' || s('Leading-edge slats') === 'D') && s('Asymmetry brakes') === 'F') ? 2 : (s('Trailing-edge flaps') === 'D' || s('Leading-edge slats') === 'D') ? 1 : 0, why: 'One side of a surface set stops while the other keeps moving, and neither tip brake stops them' },
        'FC-35': { mid: [['Slats only, or surfaces locked out', 'none', 'Approach with part of the high-lift: higher speed, landing distance beyond the strip, diversion']], best: 'Full high-lift for landing', worst: 'Flapless approach far faster than the strip allows',
                   lvl: s => s('Trailing-edge flaps') === 'F' ? 2 : (s('Leading-edge slats') === 'F' || s('Trailing-edge flaps') === 'D' || s('Leading-edge slats') === 'D') ? 1 : 0, why: 'Neither side of the flaps can extend' },
        'FC-36': { malf: { 'SFN-HLF1': 'combo' }, best: 'Retraction stopped by the monitoring lanes', worst: 'Lift lost just after rotation with a full payload', lvl: s => (s.m('SFN-HLF1') && s('Position monitoring lanes') !== 'O') ? 1 : 0 },
        'FC-37': { best: 'APU available', worst: 'No APU power when the generators are already lost', lvl: s => s('APU') === 'F' ? 1 : 0, why: 'The APU does not start' },
        'FC-38': { malf: { 'SFN-APU1': 'combo' }, best: 'Contaminated bleed shut off', worst: 'Smoke or fumes in the flight deck', lvl: s => (s.m('SFN-APU1') && s('APU bleed shutoff') === 'F') ? 1 : 0 },
        'FC-39': { best: 'Voice kept on at least one radio', worst: 'No voice contact over a remote route', lvl: s => s('Voice radios') === 'F' ? 1 : 0, why: 'All three radios lost' },
        'FC-40': { malf: { 'SFN-COM2': 'combo' }, best: 'Wrong clearance caught by voice readback', worst: 'Aircraft flies a clearance it was not given', lvl: s => (s.m('SFN-COM2') && s('Voice radios') !== 'O') ? 1 : 0 },
        'FC-41': { mid: [['Landing on one light', 'none', 'One landing light left: reduced view of the strip edges, landing continued']], best: 'Both landing lights', worst: 'Night landing on an unlit strip with no surface cues',
                   lvl: s => s('Landing lights') === 'F' ? 2 : s('Landing lights') === 'D' ? 1 : 0, why: 'Neither landing light works' },
        'FC-42': { best: 'Flight deck lit', worst: 'Panels and instruments unlit at night', lvl: s => s('Flight deck lighting') === 'F' ? 1 : 0, why: 'Neither the normal nor the standby lighting works' },
        'FC-43': { best: 'Escape path lit', worst: 'Evacuation in the dark', lvl: s => s('Emergency lighting') === 'F' ? 1 : 0, why: 'Neither battery pack lights the exits' },
        'FC-44': { best: 'Waste contained', worst: 'Water reaches the avionics', lvl: s => s('Waste containment') === 'F' ? 1 : 0, why: 'The line leaks and the drained shroud fails to carry it away' },
        'FC-45': { best: 'Water available', worst: 'No water for the crew', lvl: s => s('Potable water') === 'F' ? 1 : 0, why: 'The tank or the pump fails' },
        'FC-46': { best: 'Flight recorded', worst: 'No voice or data record', lvl: s => (s('Voice recording') === 'F' && s('Data recording') === 'F') ? 1 : 0, why: 'Both voice and data recording lost' },
        'FC-47': { best: 'Stall warning kept', worst: 'An approach to the stall is not announced', lvl: s => s('Shaker channels') === 'F' ? 1 : 0, why: 'Neither shaker channel works' },
        'FC-48': { malf: { 'SFN-STW2': 'combo' }, best: 'False pusher command stopped by the channel agreement check', worst: 'Nose pushed down close to the ground', lvl: s => (s.m('SFN-STW2') && s('Pusher channels') === 'D') ? 1 : 0 },
        'FC-49': { best: 'Stall protection kept', worst: 'A stall develops without the pusher', lvl: s => s('Pusher channels') === 'F' ? 1 : 0, why: 'Neither pusher channel works' },
        'FC-50': { best: 'Terrain warning kept', worst: 'Terrain near the strip not announced', lvl: s => s('Terrain warning') === 'F' ? 1 : 0, why: 'The terrain awareness computer fails' },
        'FC-51': { best: 'Collision avoidance kept', worst: 'No resolution advisory', lvl: s => s('Collision avoidance') === 'F' ? 1 : 0, why: 'The collision avoidance computer fails' },
        'FC-52': { malf: { 'SFN-SAW1': 'alone' }, best: 'No false warning', worst: 'Unneeded pull-up and go-around at the strip', lvl: s => 0 },
        'FC-53': { mid: [['View from one side only', 'none', 'One windshield heated or wiped: the pilot on that side lands']], best: 'Both windshields clear', worst: 'Forward view lost at the strip',
                   lvl: s => (s('Windshield heat') === 'F' || s('Wipers') === 'F') ? 2 : (s('Windshield heat') === 'D' || s('Wipers') === 'D') ? 1 : 0, why: 'Neither windshield heated, or neither wiped' },
        'FC-54': { best: 'Avionics cooled', worst: 'Avionics overheat', lvl: s => s('Avionics cooling fans') === 'F' ? 1 : 0, why: 'Neither fan works' },
        'FC-55': { malf: { 'SFN-HLF4': 'combo' }, best: 'Wrong indication caught by lane disagreement', worst: 'Take-off or landing on a flap setting the crew does not expect', lvl: s => (s.m('SFN-HLF4') && s('Position monitoring lanes') === 'D') ? 1 : 0 },
        'FC-56': { malf: { 'SFN-FUE4': 'combo' }, best: 'Wrong quantity caught by the fuel used cross-check', worst: 'Fuel exhaustion not foreseen', lvl: s => (s.m('SFN-FUE4') && s('Fuel quantity channels') === 'D') ? 1 : 0 },
        'FC-57': { best: 'Two or more hydraulic systems kept', worst: 'Flight control on one hydraulic system', lvl: s => (s('Hydraulic systems') !== 'O') ? 1 : 0, why: 'Two of the three hydraulic systems lost' },
        'FC-58': { malf: { 'SFN-FPR1': 'combo' }, best: 'False warning caught by the loop discordance monitor', worst: 'A healthy engine shut down at take-off', lvl: s => (s.m('SFN-FPR1') && s('Detection loops') === 'D') ? 1 : 0 },
        'FC-59': { best: 'At least one engine generator kept', worst: 'Essential loads on the APU or the battery only', lvl: s => s('Engine generators') === 'F' ? 1 : 0, why: 'All engine generators lost' },
        'FC-60': { malf: { 'SFN-LDG2': 'combo' }, best: 'Uncommanded braking caught by the brake control monitor', worst: 'Acceleration lost on the strip', lvl: s => (s.m('SFN-LDG2') && s('Brake control monitor') !== 'O') ? 1 : 0 }
    };
    const EV = 'HL-1 performance and handling assessment (ASM-AC set, public information and assumptions), to be replaced by simulator evidence';
    // the budget for each event, per flight, as allocated for each table (shared equipment carries its most conservative figure)
    const BUDGETS = {
        'FC-01': { 'Elevator surfaces|F': '1E-09', 'Pitch control lanes|F': '1E-09' },
        'FC-02': { 'Pitch control lanes|D': '2E-04', 'M:SFN-FCS1': '1E-06' },
        'FC-03': { 'Ailerons|F': '1E-08', 'Roll spoilers|F': '1E-08', 'Roll spoilers|D': '2E-04', 'Ailerons|D': '2E-04' },
        'FC-04': { 'Rudders|F': '2E-09' },
        'FC-05': { 'Left wing powerplants|F': '1E-08', 'Right wing powerplants|F': '1E-08' },
        'FC-06': { 'Left wing powerplants|F': '1E-08', 'Right wing powerplants|F': '1E-08' },
        'FC-07': { 'Thrust asymmetry monitor|F': '1E-08' },
        'FC-08': { 'Brake hydraulic supply|F': '1E-08', 'Ground spoilers|F': '1E-08', 'Thrust reversers|F': '1E-08' },
        'FC-09': { 'Nose-wheel steering|F': '1E-08' },
        'FC-10': { 'Display channels|F': '1E-10' },
        'FC-11': { 'Display channels|D': '1E-07', 'M:SFN-AVI1': '1E-06' },
        'FC-12': { 'Crew alerting computers|F': '1E-08' },
        'FC-13': { 'Wing and tail anti-ice|F': '1E-08', 'Probe heaters|F': '1E-10' },
        'FC-14': { 'Tank groups|F': '1E-09', 'Engine feed paths|F': '1E-09', 'Engine feed paths|D': '2E-05', 'Transfer and balance control|F': '1E-06' },
        'FC-15': { 'Gear extension|F': '1E-08' },
        'FC-16': { 'Navigation sources|D': '2E-04', 'M:SFN-AVI3': '1E-06' },
        'FC-17': { 'Restraint load paths|F': '2E-09' },
        'FC-18': { 'Center of gravity determination|F': '2E-09' },
        'FC-19': { 'Center of gravity determination|D': '2E-04', 'M:SFN-CRG2': '1E-06' },
        'FC-20': { 'Pressurization packs|F': '1E-08' },
        'FC-21': { 'Relief valves|F': '1E-08', 'M:SFN-ECS1': '1E-06' },
        'FC-22': { 'Flight-deck pressure control|F': '1E-08', 'Crew oxygen|F': '1E-08' },
        'FC-23': { 'Latches and locks|F': '2E-09' },
        'FC-24': { 'Lock indication channels|F': '1E-08' },
        'FC-25': { 'Lock indication channels|D': '2E-04', 'M:SFN-NZD3': '1E-06' },
        'FC-26': { 'Engine generators|F': '2E-09', 'Emergency sources|F': '2E-09', 'Main AC buses|F': '2E-09', 'Main AC buses|D': '5E-05', 'Wiring segregation|F': '2E-06' },
        'FC-27': { 'Hydraulic systems|F': '1E-10', 'Hydraulic systems|D': '1E-07', 'System isolation valves|F': '1E-05' },
        'FC-28': { 'Main gear bogies|F': '2E-09' },
        'FC-29': { 'Detection loops|F': '1E-09', 'Extinguisher bottles|F': '1E-09' },
        'FC-30': {  },
        'FC-31': { 'Autopilot channels|D': '2E-04', 'M:SFN-AFS1': '1E-06' },
        'FC-32': { 'Autopilot channels|F': '1E-08' },
        'FC-33': { 'Autothrust drive|F': '1E-08' },
        'FC-34': { 'Asymmetry brakes|F': '1E-08', 'Trailing-edge flaps|D': '2E-04', 'Leading-edge slats|D': '2E-04' },
        'FC-35': { 'Trailing-edge flaps|F': '1E-08' },
        'FC-36': { 'Position monitoring lanes|D': '2E-04', 'M:SFN-HLF1': '1E-06' },
        'FC-37': { 'APU|F': '1E-05' },
        'FC-38': { 'APU bleed shutoff|F': '1E-05', 'M:SFN-APU1': '1E-06' },
        'FC-39': { 'Voice radios|F': '1E-10' },
        'FC-40': { 'Voice radios|D': '1E-07', 'M:SFN-COM2': '1E-06' },
        'FC-41': { 'Landing lights|F': '1E-08' },
        'FC-42': { 'Flight deck lighting|F': '1E-08' },
        'FC-43': { 'Emergency lighting|F': '1E-08' },
        'FC-44': { 'Waste containment|F': '1E-08' },
        'FC-45': { 'Potable water|F': '1E-05' },
        'FC-46': { 'Voice recording|F': '1E-05', 'Data recording|F': '1E-05' },
        'FC-47': { 'Shaker channels|F': '1E-08' },
        'FC-48': { 'Shaker channels|D': '2E-04', 'Pusher channels|D': '2E-04', 'M:SFN-STW2': '1E-06' },
        'FC-49': { 'Pusher channels|F': '1E-08' },
        'FC-50': { 'Terrain warning|F': '1E-05' },
        'FC-51': { 'Collision avoidance|F': '1E-05' },
        'FC-52': {  },
        'FC-53': { 'Windshield heat|F': '1E-08', 'Wipers|F': '1E-08' },
        'FC-54': { 'Avionics cooling fans|F': '1E-08' },
        'FC-55': { 'Trailing-edge flaps|F': '1E-08', 'Leading-edge slats|F': '1E-08', 'Position monitoring lanes|D': '2E-04', 'M:SFN-HLF4': '1E-06', 'Leading-edge slats|D': '2E-04', 'Asymmetry brakes|D': '2E-04', 'Trailing-edge flaps|D': '2E-04', 'Asymmetry brakes|F': '1E-08' },
        'FC-56': { 'Fuel quantity channels|D': '2E-04', 'M:SFN-FUE4': '1E-06' },
        'FC-57': { 'Hydraulic systems|D': '1E-07' },
        'FC-58': { 'Detection loops|D': '2E-04', 'M:SFN-FPR1': '1E-06' },
        'FC-59': { 'Engine generators|F': '2E-09' },
        'FC-60': { 'Brake control monitor|D': '2E-04', 'M:SFN-LDG2': '1E-06' }
    };
    const SIGNER = 'M. Chen', SIGNED_AT = '2026-11-23T16:00:00.000Z';
    const PLAN = { BUILDS, RES_BY_FN, PARTIAL_PHRASE, AC, FCS, EV, BUDGETS, SIGNER, SIGNED_AT };

    // Puts the plan in through the Autopilots' own steps and sends each failure condition. Returns { ok, sent, problems }.
    function fill() {
        const A = window.SLApxAuto, M = window.SLApxMac, C = window.SLApxCof, X = window.SLApx;
        if (!A || !M || !C || !X || !A.fillAs) return { ok: false, sent: 0, problems: ['The Autopilots are not in this build.'] };
        return A.fillAs(SIGNER, SIGNED_AT, function () { return fillNow(A, M, C, X); });
    }
    function fillNow(A, M, C, X) {
        const problems = [], fcs = A.model.fcs(), fcBy = id => fcs.find(f => f.fcId === id), fresh = f => A.model.fcOf(f.key);
        const resBy = {}; A.model.resources().forEach(r => { if (r.row && r.row.resId) resBy[r.row.resId] = r; });
        // 1. how each system function is built: once, on the first failure condition that uses it (a build belongs to the function)
        Object.keys(BUILDS).forEach(fid => {
            const colId = 'fn:' + fid, f = fcs.find(x => A.model.picked(x).some(c => c.colId === colId));
            if (!f) { problems.push('No failure condition uses ' + fid + '.'); return; }
            if (M.model.groupsOf(colId).length) return;
            BUILDS[fid].forEach((b, k) => {
                const gid = k === 0 ? '' : M.act.addGroup(fresh(f), colId).id;
                const g = M.act.setPattern(fresh(f), colId, gid, b.pattern, 'hand', '');
                M.act.setGroupName(fresh(f), colId, g.id, b.name);
                b.units.forEach((u, i) => M.act.setUnit(fresh(f), colId, g.id, i, 'name', u));
                if (b.co) M.act.setCo(fresh(f), colId, g.id, b.co);
            });
        });
        let sent = 0;
        Object.keys(FCS).forEach(id => {
            const f0 = fcBy(id), plan = FCS[id]; if (!f0) { problems.push(id + ' is not in this project.'); return; }
            const fc = () => fresh(f0), cols = A.model.picked(fc()).map(c => c.colId);
            // 2. the resources: each one that feeds a checked function, its failure modes and what each does
            const byRes = {};
            cols.forEach(cid => (RES_BY_FN[cid.slice(3)] || []).forEach(x => { (byRes[x.res] = byRes[x.res] || []).push(Object.assign({ cid: cid }, x)); }));
            Object.keys(byRes).forEach(rid => {
                const r = resBy[rid]; if (!r) { problems.push(id + ': no resource ' + rid + '.'); return; }
                if (!A.model.resState(fc(), r).on) A.act.resTick(fc(), r.key);
                const fed = []; byRes[rid].forEach(x => { if (fed.indexOf(x.cid) === -1) fed.push(x.cid); });
                fed.forEach(cid => { if (!A.model.resState(fc(), r).feeds[cid]) A.act.feed(fc(), r.key, cid); });
                const modes = []; byRes[rid].forEach(x => { if (modes.indexOf(x.mode) === -1) modes.push(x.mode); });
                modes.forEach(m => A.act.mode(fc(), r.key, m, true));
                modes.forEach(m => {
                    fed.forEach(cid => {
                        const x = byRes[rid].find(y => y.cid === cid && y.mode === m), k = r.key + '|' + m + '|' + cid, st = x ? x.state : 'none';
                        A.act.setCra(fc(), k, PARTIAL_PHRASE[st]);
                        if (st === 'none') A.act.setCraWhy(fc(), k, x && x.why ? x.why : 'This function does not use it in this failure mode');
                    });
                    A.act.setCra(fc(), r.key + '|' + m + '|', AC[rid]);
                });
            });
            // 3. the wrong actions that matter
            Object.keys(plan.malf || {}).forEach(fid => M.act.setMalf(fc(), 'fn:' + fid, true, plan.malf[fid]));
            const reader = (ds, c) => {
                const st = {}, wrong = {};
                ds.forEach((d, i) => { if (d.isM) wrong[d.funcId] = c[i] === 'M'; else st[d.name] = c[i]; });
                const s = n => { if (!(n in st)) throw new Error(id + ': no assembly group named ' + n); return st[n]; };
                s.m = fid => !!wrong[fid]; return s;
            };
            const top = 1 + (plan.mid || []).length;
            try {
                // 4. the MAC: every switch-off question, the reason for each rule, the evidence
                for (let n = 0; ; n++) {
                    const s = M.model.solved(fc()); if (!s || s.error) { problems.push(id + ' MAC: ' + (s && s.error)); break; } if (s.done) break;
                    const c = X.nextQuestion(s.cols, s.m1, { lo: 0, hi: 1, among: s.cases });
                    M.act.answer(fc(), c, plan.lvl(reader(M.model.macCols(fc()), c)) === top);
                    if (n > 5000) { problems.push(id + ' MAC: too many questions'); break; }
                }
                const ms = M.model.solved(fc()); if (ms && ms.done) M.model.rules(ms).forEach(x => M.act.setWhy(fc(), x.c, plan.why || ''));
                M.act.setEv(fc(), EV);
                // 5. the CoFFE: the outcomes, every question, what each outcome means and whether it is a failure condition of its own
                C.act.setOutcome(fc(), 0, plan.worst); C.act.setOutcome(fc(), 1, plan.best);
                (plan.mid || []).slice().reverse().forEach(x => { C.act.addOutcome(fc()); C.act.setOutcome(fc(), 1, x[0]); });
                for (let n = 0; ; n++) {
                    const s = C.model.solved(fc()); if (!s) { problems.push(id + ' CoFFE: ' + C.model.left(fc()).join(' ')); break; }
                    const q = C.model.next(s); if (!q) break;
                    const lv = plan.lvl(reader(s.ds, q.c));
                    if (q.phase === 1) C.act.answer(fc(), 1, q.c, lv === top); else C.act.answer(fc(), 2, q.c, lv);
                    if (n > 5000) { problems.push(id + ' CoFFE: too many questions'); break; }
                }
                C.act.setOutDef(fc(), 0, plan.worst);
                (plan.mid || []).forEach((x, i) => { C.act.setOutFc(fc(), i + 1, x[1] === 'none' ? 'none' : fcBy(x[1]).key); C.act.setOutDef(fc(), i + 1, x[2]); });
                // 6. the budgets
                const s = C.model.solved(fc()), b = BUDGETS[id] || {};
                if (s && s.done) C.model.budgetEvents(fc(), s).forEach(x => {
                    const d = s.ds.find(dd => dd.id === x.e.col), k = d ? (d.isM ? 'M:' + d.funcId : d.name + '|' + x.e.st) : '';
                    if (b[k]) C.act.setBudget(fc(), x.k, b[k]); else problems.push(id + ': no budget for ' + k + '.');
                });
            } catch (e) { problems.push(id + ': ' + (e && e.message ? e.message : String(e))); return; }
            // 7. send each Autopilot to the PASA
            const r1 = A.act.send(fc(), SIGNER), r2 = r1.ok ? M.act.send(fc(), SIGNER) : r1, r3 = r2.ok ? C.act.send(fc(), SIGNER) : r2;
            if (r3.ok) sent++; else problems.push(id + ' not sent: ' + r3.why);
        });
        classify(A, M, C, problems);
        return { ok: !problems.length, sent: sent, problems: problems };
    }
    // 8. The system engineer classifies each system FHA line the Autopilots added (the tool never sets a severity itself).
    // The demo's rule: what the loss does on its own, with everything else working, read from each CoFFE that uses it: the
    // worst outcome takes that failure condition's severity; a lesser outcome that is a failure condition of its own takes
    // that one's; a lesser outcome that is not, one class below; no effect on its own but in a combination that causes it,
    // Minor; losing one or all units of a group built with more than one is at least Minor (a loss of redundancy); nothing
    // at all, No Safety Effect. A line used by several takes the most severe.
    const SEV = ['No Safety Effect', 'Minor', 'Major', 'Hazardous', 'Catastrophic'];
    function classify(A, M, C, problems) {
        const fcs = A.model.fcs(), byId = {}, sevOf = {};
        fcs.forEach(fc => { byId[fc.fcId] = fc; });
        fcs.forEach(fc0 => {
            const fc = A.model.fcOf(fc0.key), sol = C.model.solved(fc); if (!sol || !sol.done) return;
            const inGate = {}, mark = g => C.model.gateEvents(g).forEach(x => { inGate[x.col + '|' + x.st] = true; });
            mark(C.model.gate(fc, sol)); C.model.linkedChecks(fc, sol).forEach(l => { if (l.g) mark(l.g); });
            M.model.allEvents(fc).forEach(e => {
                const link = M.model.linkOf(fc, e.k), row = link ? M.model.sysFcRow(link) : null; if (!row || !row.apx) return;
                const i = sol.ds.findIndex(d => e.st === 'M' ? (d.isM && d.colId === e.k.split('|')[0]) : d.id + '|' + e.st === e.k);
                let sev;
                if (i === -1) sev = e.st === 'M' ? fc.sev : 'No Safety Effect';      // a wrong action that causes it alone
                else {
                    const c = sol.ds.map((d, j) => j === i ? e.st : 'O').join(''), lv = sol.lvl[c], up = sol.FL - (lv == null ? 0 : lv);
                    if (lv == null || lv === 0) sev = inGate[sol.ds[i].id + '|' + e.st] ? 'Minor' : 'No Safety Effect';
                    else if (lv === sol.FL) sev = fc.sev;
                    else { const lk = C.model.outFc(fc, up); sev = lk && lk !== 'none' && fcs.find(f => f.key === lk) ? fcs.find(f => f.key === lk).sev : SEV[Math.max(1, SEV.indexOf(fc.sev) - 1)]; }
                }
                const d0 = i === -1 ? null : sol.ds[i];
                if (d0 && !d0.isM && d0.units && d0.units.length > 1 && SEV.indexOf(sev) < 1) sev = 'Minor';
                const key = row.fcId + '@' + link.sysId;
                if (!sevOf[key] || SEV.indexOf(sev) > SEV.indexOf(sevOf[key].sev)) sevOf[key] = { row: row, sev: sev };
            });
        });
        Object.keys(sevOf).forEach(k => { const x = sevOf[k]; if (!x.row.severity) x.row.severity = x.sev; });
        try { if (A.kit && A.kit.save) A.kit.save(); } catch (_) {}
        if (!Object.keys(sevOf).length) problems.push('No system FHA line was added.');
    }
    window.SLHl1Apx = { VERSION: VERSION, plan: PLAN, fill: fill };
})();
