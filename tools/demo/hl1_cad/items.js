/* Every unit on Aeolus: its system, zone, place and size in the aircraft (meters, geometry.js frame), mass (kg),
   electrical power (W), part number, supplier and the system functions it performs. Items whose ident starts LRU- are
   Safety Lab's (same ident in both tools); the rest are added in Sys Lab. One list feeds the Sys Lab model and the CAD
   model, so the two always agree. Masses and powers are demo estimates. */
const { ENG, ENG_X, ENG_Z } = require('./geometry');
const L = [];
// I(ident, name, system, zone, [x, y, z], [dx, dy, dz], { m: kg, w: watts, pn, sup, fn: [...], dal, sub })
const I = (id, name, sys, zone, pos, size, o = {}) => L.push(Object.assign({ id, name, sys, zone, pos, size }, o));
const box = s => [s, s, s];

// ---- ATA 27 flight controls ----
I('LRU-FCS-01', 'Elevator actuation lane A', 'FCS', 'Z-EMP', [101.5, -5, 10.8], [0.9, 0.3, 0.3], { m: 38, w: 0, pn: 'HL1-2731-101', sup: 'Supplier A', fn: ['SFN-FCS1'], dal: 'A' });
I('LRU-FCS-02', 'Elevator actuation lane B', 'FCS', 'Z-EMP', [101.5, 5, 10.8], [0.9, 0.3, 0.3], { m: 44, w: 2200, pn: 'HL1-2731-201', sup: 'Supplier B', fn: ['SFN-FCS1'], dal: 'A' });
I('LRU-FCS-03', 'Flight control computer 1', 'FCS', 'Z-NOSE', [4.4, -0.9, 4.6], [0.55, 0.25, 0.35], { m: 12, w: 180, pn: 'HL1-2793-101', sup: 'Supplier C', fn: ['SFN-FCS5', 'SFN-AFS1', 'SFN-AFS2'], dal: 'A' });
I('LRU-FCS-04', 'Flight control computer 2', 'FCS', 'Z-CREW', [18.2, 1.2, 11.5], [0.55, 0.25, 0.35], { m: 13, w: 190, pn: 'HL1-2793-201', sup: 'Supplier D', fn: ['SFN-FCS5', 'SFN-AFS1', 'SFN-AFS2'], dal: 'A' });
I('LRU-FCS-05', 'Left fin rudder actuator', 'FCS', 'Z-EMP', [105, -6.5, 14], [0.8, 0.3, 0.3], { m: 36, w: 0, pn: 'HL1-2721-101', sup: 'Supplier A', fn: ['SFN-FCS3'], dal: 'A' });
I('LRU-FCS-06', 'Right fin rudder actuator', 'FCS', 'Z-EMP', [105, 6.5, 14], [0.8, 0.3, 0.3], { m: 36, w: 0, pn: 'HL1-2721-101', sup: 'Supplier A', fn: ['SFN-FCS3'], dal: 'A' });
I('FCS-ACT-AIL-L', 'Left aileron actuators', 'FCS', 'Z-LWING', [55, -33, 10.8], [0.8, 0.3, 0.3], { m: 30, pn: 'HL1-2711-101', sup: 'Supplier A', fn: ['SFN-FCS2'], dal: 'A' });
I('FCS-ACT-AIL-R', 'Right aileron actuators', 'FCS', 'Z-RWING', [55, 33, 10.8], [0.8, 0.3, 0.3], { m: 30, pn: 'HL1-2711-101', sup: 'Supplier A', fn: ['SFN-FCS2'], dal: 'A' });
I('FCS-ACT-SPL-L', 'Left spoiler actuators', 'FCS', 'Z-LWING', [55.5, -18, 11.2], [1.2, 0.3, 0.3], { m: 42, pn: 'HL1-2761-101', sup: 'Supplier A', fn: ['SFN-FCS4'], dal: 'B' });
I('FCS-ACT-SPL-R', 'Right spoiler actuators', 'FCS', 'Z-RWING', [55.5, 18, 11.2], [1.2, 0.3, 0.3], { m: 42, pn: 'HL1-2761-101', sup: 'Supplier A', fn: ['SFN-FCS4'], dal: 'B' });
I('FCS-ACT-THS', 'Trimmable horizontal stabilizer actuator', 'FCS', 'Z-EMP', [99, 0, 10.9], [0.6, 0.6, 0.9], { m: 85, pn: 'HL1-2741-101', sup: 'Supplier E', fn: ['SFN-FCS7'], dal: 'A' });
I('FCS-SSTK-CA', 'Captain sidestick', 'FCS', 'Z-FDCK', [9.2, -1.2, 11.6], [0.2, 0.15, 0.3], { m: 3, w: 10, pn: 'HL1-2703-101', sup: 'Supplier C', fn: ['SFN-FCS8'], dal: 'A' });
I('FCS-SSTK-FO', 'First officer sidestick', 'FCS', 'Z-FDCK', [9.2, 1.2, 11.6], [0.2, 0.15, 0.3], { m: 3, w: 10, pn: 'HL1-2703-101', sup: 'Supplier C', fn: ['SFN-FCS8'], dal: 'A' });
I('FCS-PEDALS', 'Rudder and brake pedals', 'FCS', 'Z-FDCK', [8.0, 0, 11.3], [0.4, 1.4, 0.3], { m: 18, pn: 'HL1-2723-101', sup: 'Supplier C', fn: ['SFN-FCS8'], dal: 'A' });
I('FCS-ACE-1', 'Actuator control electronics 1', 'FCS', 'Z-NOSE', [5.0, -1.4, 4.0], [0.45, 0.2, 0.3], { m: 7, w: 90, pn: 'HL1-2794-101', sup: 'Supplier C', fn: ['SFN-FCS6'], dal: 'A' });
I('FCS-ACE-2', 'Actuator control electronics 2', 'FCS', 'Z-AFTE', [97.5, 1.2, 5.0], [0.45, 0.2, 0.3], { m: 7, w: 90, pn: 'HL1-2794-201', sup: 'Supplier D', fn: ['SFN-FCS6'], dal: 'A' });

// ---- ATA 71 to 80: the four powerplants, one set each ----
for (const e of ENG) {
  const n = e.n, z = 'Z-NAC' + n, y = e.y, x0 = ENG_X[0], zc = ENG_Z, py = 'Z-PYL' + n, pp = 'PP' + n;
  I('LRU-PRP-0' + n, 'Engine ' + n + ' (' + e.pos + ')', pp, z, [33.5, y, zc], [6.4, 1.5, 1.5], { m: 3900, pn: 'HL1-7200-001', sup: 'Engine supplier', fn: ['SFN-PRP' + n + 'U', 'SFN-PRP1'], dal: 'A' });
  I('EFC-FADEC-' + n, 'FADEC, engine ' + n, 'EFC', z, [x0 + 2.2, y + (y < 0 ? -1.2 : 1.2), zc + 0.9], [0.5, 0.2, 0.3], { m: 9, w: 0, pn: 'HL1-7321-001', sup: 'Engine supplier', fn: ['SFN-EFC2', 'SFN-AFS3', 'SFN-PRP9'], dal: 'A' });
  I('EFC-FMU-' + n, 'Fuel metering unit, engine ' + n, 'EFC', z, [x0 + 3.0, y, zc - 1.0], [0.4, 0.3, 0.3], { m: 14, pn: 'HL1-7322-001', sup: 'Engine supplier', fn: ['SFN-EFC1'], dal: 'A' });
  I('IGN-EXC-' + n, 'Ignition exciters, engine ' + n, 'IGN', z, [x0 + 3.6, y + (y < 0 ? 1.1 : -1.1), zc - 0.6], [0.3, 0.2, 0.2], { m: 6, w: 60, pn: 'HL1-7411-001', sup: 'Engine supplier', fn: ['SFN-IGN1'], dal: 'C' });
  I('EAIR-EAI-' + n, 'Engine anti-ice valve, engine ' + n, 'EAIR', z, [x0 + 1.0, y, zc + 1.1], [0.25, 0.25, 0.25], { m: 4, w: 20, pn: 'HL1-7511-001', sup: 'Engine supplier', fn: ['SFN-EAIR1'], dal: 'C' });
  I('EIND-VIB-' + n, 'Vibration sensors, engine ' + n, 'EIND', z, [x0 + 3.2, y, zc + 1.0], [0.1, 0.1, 0.1], { m: 1, w: 2, pn: 'HL1-7731-001', sup: 'Engine supplier', fn: ['SFN-EIND1'], dal: 'C' });
  // the reverser is installed with its powerplant (Safety Lab carries it there too); the TRV system keeps the interlock
  I('TRV-ACT-' + n, 'Thrust reverser actuation, engine ' + n, pp, z, [x0 + 5.0, y, zc + 1.2], [1.2, 0.6, 0.3], { m: 60, w: 300, pn: 'HL1-7832-001', sup: 'Nacelle supplier', fn: ['SFN-TRV1', 'SFN-TRV2'], dal: 'A' });
  I('OIL-TANK-' + n, 'Oil tank, engine ' + n, 'OIL', z, [x0 + 2.6, y + (y < 0 ? 1.1 : -1.1), zc + 0.4], [0.4, 0.3, 0.4], { m: 12, pn: 'HL1-7911-001', sup: 'Engine supplier', fn: ['SFN-OIL1'], dal: 'C' });
  I('STRT-ATS-' + n, 'Air turbine starter, engine ' + n, 'STRT', z, [x0 + 3.4, y, zc - 1.1], [0.35, 0.3, 0.3], { m: 11, pn: 'HL1-8011-001', sup: 'Engine supplier', fn: ['SFN-STRT1'], dal: 'C' });
  I('STRT-SAV-' + n, 'Start air valve, engine ' + n, 'STRT', py, [36, y, 10.2], [0.3, 0.3, 0.3], { m: 5, w: 30, pn: 'HL1-8012-001', sup: 'Valve supplier', fn: ['SFN-STRT1'], dal: 'C' });
  I('LRU-EPS-0' + n, 'Generator ' + n, 'EPS', z, [x0 + 2.0, y + (y < 0 ? 1.2 : -1.2), zc - 0.8], [0.5, 0.4, 0.4], { m: 48, pn: 'HL1-2421-001', sup: 'Electrical supplier', fn: ['SFN-EPS1'], dal: 'B' });
  I('EPS-GCU-' + n, 'Generator control unit ' + n, 'EPS', 'Z-NOSE', [5.6, (n <= 2 ? -1 : 1) * (0.6 + 0.3 * (n % 2)), 3.4 + 0.5 * (n % 2)], [0.35, 0.2, 0.3], { m: 6, w: 40, pn: 'HL1-2422-001', sup: 'Electrical supplier', fn: ['SFN-EPS1'], dal: 'B' });
  I('PNU-PRV-' + n, 'Bleed pressure regulating valve, engine ' + n, 'PNU', py, [38, y, 10.2], [0.35, 0.35, 0.35], { m: 7, w: 25, pn: 'HL1-3611-001', sup: 'Valve supplier', fn: ['SFN-PNU1'], dal: 'C' });
  I('PNU-PCE-' + n, 'Precooler, engine ' + n, 'PNU', py, [40, y, 10.3], [0.7, 0.5, 0.5], { m: 22, pn: 'HL1-3612-001', sup: 'Heat exchanger supplier', fn: ['SFN-PNU1'], dal: 'C' });
  I('FUEL-LPV-' + n, 'Low-pressure fuel shutoff valve, engine ' + n, 'FUEL', py, [40.6, y, 10.0], [0.25, 0.25, 0.25], { m: 4, w: 20, pn: 'HL1-2821-001', sup: 'Valve supplier', fn: ['SFN-FUE2', 'SFN-ECTL2'], dal: 'A' });
  I(n === 1 ? 'LRU-FPR-01' : 'FPR-NAC-' + n, n === 1 ? 'Nacelle fire detection loop' : 'Nacelle fire detection loop, engine ' + n, 'FPR', z, [x0 + 3.5, y, zc + 1.45], [5.0, 0.1, 0.1], { m: 3, w: 5, pn: 'HL1-2611-001', sup: 'Fire protection supplier', fn: ['SFN-FPR1'], dal: 'B' });
}

// ---- ATA 24 electrical power ----
I('LRU-EPS-05', 'APU generator', 'EPS', 'Z-APU', [105.2, 0, 8.0], [0.5, 0.4, 0.4], { m: 42, pn: 'HL1-2423-001', sup: 'Electrical supplier', fn: ['SFN-EPS1', 'SFN-APU2'], dal: 'C' });
I('LRU-EPS-06', 'Main battery', 'EPS', 'Z-NOSE', [5.8, 1.6, 3.0], [0.5, 0.35, 0.3], { m: 38, pn: 'HL1-2431-001', sup: 'Battery supplier', fn: ['SFN-EPS1'], dal: 'B' });
I('EPS-ITM-MAIBUS1', 'AC bus 1', 'EPS', 'Z-NOSE', [6.2, 1.4, 4.6], [0.8, 0.4, 1.4], { m: 55, pn: 'HL1-2451-001', sup: 'Electrical supplier', fn: ['SFN-EPS2'], dal: 'B' });
I('EPS-ACBUS-2', 'AC bus 2', 'EPS', 'Z-AFTE', [96.6, 1.0, 7.4], [0.8, 0.4, 1.0], { m: 55, pn: 'HL1-2451-001', sup: 'Electrical supplier', fn: ['SFN-EPS2'], dal: 'B' });
I('EPS-ITM-ESSBUS', 'Essential bus', 'EPS', 'Z-CREW', [19.4, -1.4, 11.6], [0.6, 0.3, 1.0], { m: 30, pn: 'HL1-2452-001', sup: 'Electrical supplier', fn: ['SFN-EPS2'], dal: 'A' });
I('EPS-DCBUS-1', 'DC bus 1', 'EPS', 'Z-NOSE', [6.3, -1.4, 4.6], [0.6, 0.3, 1.0], { m: 22, pn: 'HL1-2453-001', sup: 'Electrical supplier', fn: ['SFN-EPS2'], dal: 'A' });
I('EPS-DCBUS-2', 'DC bus 2', 'EPS', 'Z-AFTE', [96.5, -1.6, 5.2], [0.6, 0.3, 1.0], { m: 22, pn: 'HL1-2453-001', sup: 'Electrical supplier', fn: ['SFN-EPS2'], dal: 'A' });
I('EPS-PDC-AFT', 'Aft power distribution center', 'EPS', 'Z-AFTE', [97.5, -1.6, 6.8], [0.6, 0.4, 1.2], { m: 40, pn: 'HL1-2454-001', sup: 'Electrical supplier', fn: ['SFN-EPS2'], dal: 'B' });
I('EPS-TRU-1', 'Transformer rectifier unit 1', 'EPS', 'Z-NOSE', [5.0, 1.6, 4.4], [0.4, 0.3, 0.3], { m: 12, pn: 'HL1-2441-001', sup: 'Electrical supplier', fn: ['SFN-EPS2'], dal: 'B' });
I('EPS-TRU-2', 'Transformer rectifier unit 2', 'EPS', 'Z-AFTE', [96.5, 1.6, 5.0], [0.4, 0.3, 0.3], { m: 12, pn: 'HL1-2441-001', sup: 'Electrical supplier', fn: ['SFN-EPS2'], dal: 'B' });
I('EPS-ITM-EMEGEN', 'Emergency generator', 'EPS', 'Z-BELLY', [40, 1.6, 2.9], [0.5, 0.4, 0.4], { m: 30, pn: 'HL1-2424-001', sup: 'Electrical supplier', fn: ['SFN-EPS1'], dal: 'A' });
I('EPS-EXTPWR', 'External power receptacle', 'EPS', 'Z-NLGW', [13.6, 1.0, 2.6], [0.3, 0.2, 0.2], { m: 3, pn: 'HL1-2441-101', sup: 'Electrical supplier', fn: ['SFN-EPS2'], dal: 'D' });

// ---- ATA 29 hydraulic power: three systems of their own ----
I('HYD-HSMU', 'Hydraulic system monitoring unit', 'HYD', 'Z-AFTE', [98.2, 0.8, 6.0], [0.35, 0.2, 0.3], { m: 5, w: 30, pn: 'HL1-2931-001', sup: 'Hydraulics supplier', fn: ['SFN-HYD2'], dal: 'B' });
I('LRU-HYD-01', 'Hydraulic pump, system A', 'HYDA', 'Z-NAC2', [32.6, -11.9, 7.4], [0.4, 0.3, 0.3], { m: 18, pn: 'HL1-2911-001', sup: 'Hydraulics supplier', fn: ['SFN-HYDA', 'SFN-HYD1'], dal: 'A' });
I('HYDA-EMP', 'AC motor pump, system A', 'HYDA', 'Z-MLGW', [48, -5.2, 2.0], [0.5, 0.4, 0.4], { m: 26, w: 9000, pn: 'HL1-2912-001', sup: 'Hydraulics supplier', fn: ['SFN-HYDA'], dal: 'B' });
I('HYDA-RES', 'Reservoir, system A', 'HYDA', 'Z-MLGW', [50, -5.4, 2.4], [0.7, 0.5, 0.6], { m: 30, pn: 'HL1-2913-001', sup: 'Hydraulics supplier', fn: ['SFN-HYDA'], dal: 'B' });
I('HYDA-ACC', 'Accumulator, system A', 'HYDA', 'Z-MLGW', [52, -5.4, 2.2], [0.3, 0.3, 0.8], { m: 16, pn: 'HL1-2914-001', sup: 'Hydraulics supplier', fn: ['SFN-HYDA', 'SFN-LDG2'], dal: 'A' });
I('LRU-HYD-02', 'Hydraulic pump, system B', 'HYDB', 'Z-NAC3', [32.6, 11.9, 7.4], [0.4, 0.3, 0.3], { m: 18, pn: 'HL1-2911-001', sup: 'Hydraulics supplier', fn: ['SFN-HYDB', 'SFN-HYD1'], dal: 'A' });
I('HYDB-EMP', 'AC motor pump, system B', 'HYDB', 'Z-MLGW', [48, 5.2, 2.0], [0.5, 0.4, 0.4], { m: 26, w: 9000, pn: 'HL1-2912-001', sup: 'Hydraulics supplier', fn: ['SFN-HYDB'], dal: 'B' });
I('HYDB-RES', 'Reservoir, system B', 'HYDB', 'Z-MLGW', [50, 5.4, 2.4], [0.7, 0.5, 0.6], { m: 30, pn: 'HL1-2913-001', sup: 'Hydraulics supplier', fn: ['SFN-HYDB'], dal: 'B' });
I('HYDB-ACC', 'Accumulator, system B', 'HYDB', 'Z-MLGW', [52, 5.4, 2.2], [0.3, 0.3, 0.8], { m: 16, pn: 'HL1-2914-001', sup: 'Hydraulics supplier', fn: ['SFN-HYDB', 'SFN-LDG2'], dal: 'A' });
I('LRU-HYD-03', 'Hydraulic pump, system C', 'HYDC', 'Z-AFTE', [97.6, -1.0, 4.4], [0.5, 0.4, 0.4], { m: 26, w: 9000, pn: 'HL1-2912-001', sup: 'Hydraulics supplier', fn: ['SFN-HYDC', 'SFN-HYD1'], dal: 'A' });
I('HYDC-RES', 'Reservoir, system C', 'HYDC', 'Z-AFTE', [98.5, -1.6, 7.6], [0.6, 0.5, 0.6], { m: 26, pn: 'HL1-2913-001', sup: 'Hydraulics supplier', fn: ['SFN-HYDC'], dal: 'B' });
I('HYDC-RAT', 'Ram air turbine pump', 'HYDC', 'Z-BELLY', [41.4, -1.6, 2.9], [0.6, 0.5, 0.4], { m: 40, pn: 'HL1-2915-001', sup: 'Hydraulics supplier', fn: ['SFN-HYDC'], dal: 'A' });

// ---- ATA 28 fuel and 47 inerting ----
I('FUEL-TANK-CTR', 'Center wing tank', 'FUEL', 'Z-CWB', [47, 0, 10.6], [10, 7.6, 1.8], { m: 480, pn: 'HL1-2811-001', sup: 'Airframe', fn: ['SFN-FUE1'], dal: 'B' });
I('FUEL-TANK-L1', 'Left inner tank', 'FUEL', 'Z-LWING', [48, -12, 10.9], [9, 14, 1.4], { m: 420, pn: 'HL1-2811-101', sup: 'Airframe', fn: ['SFN-FUE1'], dal: 'B' });
I('FUEL-TANK-L2', 'Left outer tank', 'FUEL', 'Z-LWING', [51, -27, 11.0], [7, 14, 1.0], { m: 300, pn: 'HL1-2811-201', sup: 'Airframe', fn: ['SFN-FUE1'], dal: 'B' });
I('FUEL-TANK-R1', 'Right inner tank', 'FUEL', 'Z-RWING', [48, 12, 10.9], [9, 14, 1.4], { m: 420, pn: 'HL1-2811-101', sup: 'Airframe', fn: ['SFN-FUE1'], dal: 'B' });
I('FUEL-TANK-R2', 'Right outer tank', 'FUEL', 'Z-RWING', [51, 27, 11.0], [7, 14, 1.0], { m: 300, pn: 'HL1-2811-201', sup: 'Airframe', fn: ['SFN-FUE1'], dal: 'B' });
I('LRU-FUE-01', 'Fuel boost pump, tank group 1', 'FUEL', 'Z-LWING', [46, -23, 10.3], [0.4, 0.4, 0.4], { m: 9, w: 1400, pn: 'HL1-2822-001', sup: 'Fuel supplier', fn: ['SFN-FUE2'], dal: 'A' });
for (const [n, y, z] of [[2, -13, 'Z-LWING'], [3, 13, 'Z-RWING'], [4, 23, 'Z-RWING']])
  I('FUEL-BP-' + n, 'Fuel boost pump, tank group ' + n, 'FUEL', z, [46, y, 10.3], [0.4, 0.4, 0.4], { m: 9, w: 1400, pn: 'HL1-2822-001', sup: 'Fuel supplier', fn: ['SFN-FUE2'], dal: 'A' });
I('LRU-FUE-02', 'Crossfeed valve', 'FUEL', 'Z-CWB', [45, 0, 9.8], [0.3, 0.3, 0.3], { m: 5, w: 25, pn: 'HL1-2823-001', sup: 'Valve supplier', fn: ['SFN-FUE2', 'SFN-FUE3'], dal: 'B' });
I('FUEL-FQMS', 'Fuel quantity and management computer', 'FUEL', 'Z-NOSE', [4.8, 1.4, 5.2], [0.4, 0.25, 0.3], { m: 7, w: 60, pn: 'HL1-2841-001', sup: 'Fuel supplier', fn: ['SFN-FUE3'], dal: 'B' });
I('FUEL-REFUEL', 'Refuel panel and gallery', 'FUEL', 'Z-LWING', [44, -8, 9.9], [0.6, 0.4, 0.3], { m: 12, w: 20, pn: 'HL1-2831-001', sup: 'Fuel supplier', fn: ['SFN-FUE4', 'SFN-FUE5'], dal: 'C' });
I('FUEL-JETT', 'Jettison valves', 'FUEL', 'Z-RWING', [56, 30, 10.8], [0.3, 0.3, 0.3], { m: 6, w: 20, pn: 'HL1-2832-001', sup: 'Valve supplier', fn: ['SFN-FUE3'], dal: 'B' });
I('FTIS-ASM', 'Air separation module', 'FTIS', 'Z-BELLY', [43, 0.8, 2.9], [1.0, 0.4, 0.4], { m: 28, w: 200, pn: 'HL1-4711-001', sup: 'Inerting supplier', fn: ['SFN-FTIS1'], dal: 'C' });
I('FTIS-NEA-VLV', 'Nitrogen-enriched air valve', 'FTIS', 'Z-CWB', [43, 1.2, 9.7], [0.2, 0.2, 0.2], { m: 2, w: 15, pn: 'HL1-4712-001', sup: 'Inerting supplier', fn: ['SFN-FTIS1'], dal: 'C' });
I('FTIS-CTRL', 'Inerting controller', 'FTIS', 'Z-BELLY', [42, -0.8, 2.9], [0.3, 0.2, 0.2], { m: 3, w: 30, pn: 'HL1-4713-001', sup: 'Inerting supplier', fn: ['SFN-FTIS1'], dal: 'C' });

// ---- ATA 32 landing gear ----
I('LRU-LDG-01', 'Main bogie assembly', 'LDG', 'Z-MLGW', [49, -4.8, 1.3], [3.2, 1.6, 2.4], { m: 2900, pn: 'HL1-3211-001', sup: 'Gear supplier', fn: ['SFN-LDG4', 'SFN-LDG1'], dal: 'B' });
for (const [id, nm, x, y] of [['LDG-BOGIE-LA', 'Main bogie, left aft', 56, -4.8], ['LDG-BOGIE-RF', 'Main bogie, right forward', 49, 4.8], ['LDG-BOGIE-RA', 'Main bogie, right aft', 56, 4.8]])
  I(id, nm, 'LDG', 'Z-MLGW', [x, y, 1.3], [3.2, 1.6, 2.4], { m: 2900, pn: 'HL1-3211-001', sup: 'Gear supplier', fn: ['SFN-LDG4', 'SFN-LDG1'], dal: 'B' });
I('LDG-NOSE-GEAR', 'Nose gear', 'LDG', 'Z-NLGW', [11.2, 0, 1.6], [1.4, 1.6, 2.0], { m: 950, pn: 'HL1-3221-001', sup: 'Gear supplier', fn: ['SFN-LDG4', 'SFN-LDG1'], dal: 'B' });
I('LRU-LDG-02', 'Brake control unit A', 'LDG', 'Z-NOSE', [5.6, -2.4, 5.0], [0.45, 0.25, 0.3], { m: 8, w: 70, pn: 'HL1-3242-101', sup: 'Brake supplier', fn: ['SFN-LDG2'], dal: 'A' });
I('LRU-LDG-03', 'Brake control unit B', 'LDG', 'Z-AFTE', [97.4, 1.8, 6.4], [0.45, 0.25, 0.3], { m: 8, w: 70, pn: 'HL1-3242-101', sup: 'Brake supplier', fn: ['SFN-LDG2'], dal: 'A' });
I('LRU-LDG-04', 'Nose-wheel steering actuator', 'LDG', 'Z-NLGW', [11.6, 0.5, 2.9], [0.4, 0.3, 0.3], { m: 22, pn: 'HL1-3251-001', sup: 'Gear supplier', fn: ['SFN-LDG3', 'SFN-LDG6'], dal: 'B' });
I('LDG-RETRACT', 'Gear retraction actuators', 'LDG', 'Z-MLGW', [52.5, 0, 3.0], [2.0, 2.0, 0.4], { m: 160, pn: 'HL1-3231-001', sup: 'Gear supplier', fn: ['SFN-LDG1'], dal: 'B' });
I('LDG-LGCIU-1', 'Gear control and interface unit 1', 'LDG', 'Z-NOSE', [4.2, 2.5, 3.6], [0.4, 0.2, 0.3], { m: 6, w: 50, pn: 'HL1-3233-001', sup: 'Gear supplier', fn: ['SFN-LDG1'], dal: 'B' });
I('LDG-LGCIU-2', 'Gear control and interface unit 2', 'LDG', 'Z-CREW', [17, -1.6, 11.3], [0.4, 0.2, 0.3], { m: 6, w: 50, pn: 'HL1-3233-001', sup: 'Gear supplier', fn: ['SFN-LDG1'], dal: 'B' });
I('LDG-ACC', 'Brake accumulator', 'LDG', 'Z-MLGW', [53, -1.0, 2.4], [0.4, 0.4, 0.6], { m: 30, pn: 'HL1-3243-001', sup: 'Brake supplier', fn: ['SFN-LDG2'], dal: 'A' });
I('LDG-BTMS', 'Brake temperature monitoring unit', 'LDG', 'Z-MLGW', [53, 0, 2.6], [0.3, 0.2, 0.2], { m: 3, w: 15, pn: 'HL1-3247-001', sup: 'Brake supplier', fn: ['SFN-LDG5'], dal: 'C' });
I('LDG-WSS', 'Wheel speed sensors', 'LDG', 'Z-MLGW', [52.5, 0, 1.0], [6.0, 9.0, 0.2], { m: 10, w: 10, pn: 'HL1-3246-001', sup: 'Brake supplier', fn: ['SFN-LDG5'], dal: 'A' });

// ---- ATA 31 avionics and displays, 34 navigation, 42 IMA, 22 auto flight ----
I('LRU-AVI-01', 'Primary flight display 1', 'AVI', 'Z-FDCK', [8.4, -1.0, 12.2], [0.1, 0.4, 0.3], { m: 6, w: 90, pn: 'HL1-3161-001', sup: 'Avionics supplier', fn: ['SFN-AVI1'], dal: 'A' });
I('AVI-PFD-2', 'Primary flight display 2', 'AVI', 'Z-FDCK', [8.4, 1.0, 12.2], [0.1, 0.4, 0.3], { m: 6, w: 90, pn: 'HL1-3161-001', sup: 'Avionics supplier', fn: ['SFN-AVI1'], dal: 'A' });
I('AVI-MFD-1', 'Multifunction display 1', 'AVI', 'Z-FDCK', [8.4, -0.5, 12.2], [0.1, 0.4, 0.3], { m: 6, w: 90, pn: 'HL1-3161-001', sup: 'Avionics supplier', fn: ['SFN-AVI3'], dal: 'B' });
I('AVI-MFD-2', 'Multifunction display 2', 'AVI', 'Z-FDCK', [8.4, 0.5, 12.2], [0.1, 0.4, 0.3], { m: 6, w: 90, pn: 'HL1-3161-001', sup: 'Avionics supplier', fn: ['SFN-AVI3'], dal: 'B' });
I('AVI-EWD', 'Engine and warning display', 'AVI', 'Z-FDCK', [8.4, 0, 12.6], [0.1, 0.4, 0.3], { m: 6, w: 90, pn: 'HL1-3161-001', sup: 'Avionics supplier', fn: ['SFN-AVI2', 'SFN-EIND1'], dal: 'A' });
I('AVI-SBY', 'Standby instrument', 'AVI', 'Z-FDCK', [8.4, 0, 11.8], [0.1, 0.15, 0.15], { m: 2, w: 15, pn: 'HL1-3411-001', sup: 'Avionics supplier', fn: ['SFN-AVI1'], dal: 'A' });
I('LRU-AVI-02', 'Air data computer 1', 'AVI', 'Z-NOSE', [3.6, -0.7, 5.2], [0.4, 0.2, 0.3], { m: 5, w: 40, pn: 'HL1-3412-001', sup: 'Avionics supplier', fn: ['SFN-AVI1', 'SFN-NAV2'], dal: 'A' });
I('LRU-AVI-03', 'Air data computer 2', 'AVI', 'Z-NOSE', [3.6, 0.7, 5.2], [0.4, 0.2, 0.3], { m: 5, w: 40, pn: 'HL1-3412-001', sup: 'Avionics supplier', fn: ['SFN-AVI1', 'SFN-NAV2'], dal: 'A' });
I('LRU-AVI-04', 'Air data computer 3', 'AVI', 'Z-CREW', [17.6, 0, 11.2], [0.4, 0.2, 0.3], { m: 5, w: 40, pn: 'HL1-3412-201', sup: 'Second avionics supplier', fn: ['SFN-AVI1', 'SFN-NAV2'], dal: 'A' });
I('AVI-EAFR-1', 'Flight data and voice recorder, forward', 'AVI', 'Z-NOSE', [6.6, 0, 3.0], [0.4, 0.2, 0.2], { m: 7, w: 25, pn: 'HL1-3133-001', sup: 'Recorder supplier', fn: ['SFN-AVI9'], dal: 'D' });
I('AVI-EAFR-2', 'Flight data and voice recorder, aft', 'AVI', 'Z-TCONE', [102, 0, 8.6], [0.4, 0.2, 0.2], { m: 7, w: 25, pn: 'HL1-3133-001', sup: 'Recorder supplier', fn: ['SFN-AVI9'], dal: 'D' });
I('NAV-IRU-1', 'Inertial reference unit 1', 'NAV', 'Z-NOSE', [4.0, -1.6, 3.6], [0.4, 0.3, 0.3], { m: 9, w: 40, pn: 'HL1-3421-001', sup: 'Navigation supplier', fn: ['SFN-NAV1', 'SFN-NAV2'], dal: 'A' });
I('NAV-IRU-2', 'Inertial reference unit 2', 'NAV', 'Z-NOSE', [4.0, 1.6, 3.6], [0.4, 0.3, 0.3], { m: 9, w: 40, pn: 'HL1-3421-001', sup: 'Navigation supplier', fn: ['SFN-NAV1', 'SFN-NAV2'], dal: 'A' });
I('NAV-IRU-3', 'Inertial reference unit 3', 'NAV', 'Z-CREW', [17.6, -1.2, 11.2], [0.4, 0.3, 0.3], { m: 9, w: 40, pn: 'HL1-3421-001', sup: 'Navigation supplier', fn: ['SFN-NAV1', 'SFN-NAV2'], dal: 'A' });
I('NAV-GNSS-1', 'GNSS receiver 1', 'NAV', 'Z-CREW', [16, -0.8, 12.6], [0.3, 0.2, 0.2], { m: 3, w: 20, pn: 'HL1-3458-001', sup: 'Navigation supplier', fn: ['SFN-NAV1'], dal: 'B' });
I('NAV-GNSS-2', 'GNSS receiver 2', 'NAV', 'Z-CREW', [16, 0.8, 12.6], [0.3, 0.2, 0.2], { m: 3, w: 20, pn: 'HL1-3458-001', sup: 'Navigation supplier', fn: ['SFN-NAV1'], dal: 'B' });
I('NAV-RA-1', 'Radio altimeter 1', 'NAV', 'Z-BELLY', [20, -0.8, 2.6], [0.3, 0.2, 0.2], { m: 3, w: 20, pn: 'HL1-3433-001', sup: 'Navigation supplier', fn: ['SFN-NAV2', 'SFN-AFS2'], dal: 'B' });
I('NAV-RA-2', 'Radio altimeter 2', 'NAV', 'Z-BELLY', [20, 0.8, 2.6], [0.3, 0.2, 0.2], { m: 3, w: 20, pn: 'HL1-3433-001', sup: 'Navigation supplier', fn: ['SFN-NAV2', 'SFN-AFS2'], dal: 'B' });
I('NAV-WXR', 'Weather radar', 'NAV', 'Z-NOSE', [1.0, 0, 6.2], [0.6, 0.8, 0.6], { m: 14, w: 250, pn: 'HL1-3441-001', sup: 'Navigation supplier', fn: ['SFN-NAV4'], dal: 'C' });
I('NAV-TCAS', 'TCAS computer', 'NAV', 'Z-NOSE', [5.2, 1.8, 6.0], [0.4, 0.25, 0.3], { m: 6, w: 60, pn: 'HL1-3445-001', sup: 'Navigation supplier', fn: ['SFN-NAV3'], dal: 'B' });
I('NAV-TAWS', 'Terrain awareness computer', 'NAV', 'Z-NOSE', [5.2, -1.8, 6.0], [0.4, 0.25, 0.3], { m: 5, w: 40, pn: 'HL1-3446-001', sup: 'Navigation supplier', fn: ['SFN-NAV3'], dal: 'C' });
I('NAV-MMR-1', 'Multimode receiver 1', 'NAV', 'Z-NOSE', [4.6, -1.0, 6.4], [0.4, 0.2, 0.25], { m: 4, w: 30, pn: 'HL1-3451-001', sup: 'Navigation supplier', fn: ['SFN-NAV1', 'SFN-AFS2'], dal: 'B' });
I('NAV-MMR-2', 'Multimode receiver 2', 'NAV', 'Z-NOSE', [4.6, 1.0, 6.4], [0.4, 0.2, 0.25], { m: 4, w: 30, pn: 'HL1-3451-001', sup: 'Navigation supplier', fn: ['SFN-NAV1', 'SFN-AFS2'], dal: 'B' });
for (const n of [1, 2, 3]) I('NAV-AOA-' + n, 'Angle of attack sensor ' + n, 'NAV', 'Z-NOSE', [2.6, n === 1 ? -2.6 : n === 2 ? 2.6 : -2.4, 5.6 + (n === 3 ? 0.8 : 0)], [0.2, 0.2, 0.2], { m: 2, w: 30, pn: 'HL1-3412-301', sup: 'Air data supplier', fn: ['SFN-NAV2'], dal: 'A' });
I('IMA-CAB-1', 'IMA cabinet 1', 'IMA', 'Z-NOSE', [5.0, -1.6, 5.4], [0.6, 0.3, 0.45], { m: 20, w: 300, pn: 'HL1-4210-001', sup: 'Avionics supplier', fn: ['SFN-IMA1', 'SFN-IMA3', 'SFN-AVI2', 'SFN-AVI3', 'SFN-CRG2', 'SFN-NZD3'], dal: 'A' });
I('IMA-CAB-2', 'IMA cabinet 2', 'IMA', 'Z-CREW', [18.8, 1.6, 11.4], [0.6, 0.3, 0.45], { m: 20, w: 300, pn: 'HL1-4210-001', sup: 'Avionics supplier', fn: ['SFN-IMA1', 'SFN-IMA3', 'SFN-AVI2', 'SFN-AVI3', 'SFN-CRG2', 'SFN-NZD3'], dal: 'A' });
I('IMA-SW-A', 'Avionics network switch, plane A', 'IMA', 'Z-NOSE', [5.6, -0.6, 5.6], [0.3, 0.2, 0.15], { m: 3, w: 30, pn: 'HL1-4220-001', sup: 'Avionics supplier', fn: ['SFN-IMA2'], dal: 'A' });
I('IMA-SW-B', 'Avionics network switch, plane B', 'IMA', 'Z-CREW', [19.2, 0.6, 11.6], [0.3, 0.2, 0.15], { m: 3, w: 30, pn: 'HL1-4220-001', sup: 'Avionics supplier', fn: ['SFN-IMA2'], dal: 'A' });
for (const [n, z, pos] of [[1, 'Z-HOLD-F', [24, -3.8, 9.8]], [2, 'Z-CWB', [44, -3.4, 10.0]], [3, 'Z-HOLD-A', [80, 3.8, 9.8]], [4, 'Z-AFTE', [98.6, 1.8, 8.6]]])
  I('IMA-RDC-' + n, 'Remote data concentrator ' + n, 'IMA', z, pos, [0.3, 0.2, 0.2], { m: 3, w: 25, pn: 'HL1-4230-001', sup: 'Avionics supplier', fn: ['SFN-IMA2'], dal: 'B' });
I('AFS-FCU', 'Flight control unit (glareshield)', 'AFS', 'Z-FDCK', [8.6, 0, 12.8], [0.2, 1.4, 0.15], { m: 4, w: 30, pn: 'HL1-2231-001', sup: 'Avionics supplier', fn: ['SFN-AFS1', 'SFN-AFS2', 'SFN-AFS3'], dal: 'B' });
I('AFS-DISC', 'Autopilot and autothrust disconnect switches', 'AFS', 'Z-FDCK', [9.6, 0, 12.3], [0.1, 0.3, 0.1], { m: 1, pn: 'HL1-2232-001', sup: 'Avionics supplier', fn: ['SFN-AFS1', 'SFN-AFS3'], dal: 'B' });

// ---- ATA 30 ice and rain, 56 windows ----
I('LRU-IPS-01', 'Pitot probe heater, channel 1', 'IPS', 'Z-NOSE', [1.8, -1.6, 6.6], [0.3, 0.1, 0.1], { m: 1, w: 300, pn: 'HL1-3031-001', sup: 'Air data supplier', fn: ['SFN-IPS2'], dal: 'B' });
I('IPS-PH-2', 'Pitot probe heater, channel 2', 'IPS', 'Z-NOSE', [1.8, 1.6, 6.6], [0.3, 0.1, 0.1], { m: 1, w: 300, pn: 'HL1-3031-001', sup: 'Air data supplier', fn: ['SFN-IPS2'], dal: 'B' });
I('IPS-PH-3', 'Pitot probe heater, channel 3', 'IPS', 'Z-NOSE', [2.2, -1.8, 7.2], [0.3, 0.1, 0.1], { m: 1, w: 300, pn: 'HL1-3031-001', sup: 'Air data supplier', fn: ['SFN-IPS2'], dal: 'B' });
I('IPS-ICEDET-1', 'Ice detector 1', 'IPS', 'Z-NOSE', [2.8, -2.8, 6.0], [0.2, 0.1, 0.1], { m: 1, w: 80, pn: 'HL1-3081-001', sup: 'Ice protection supplier', fn: ['SFN-IPS1'], dal: 'C' });
I('IPS-ICEDET-2', 'Ice detector 2', 'IPS', 'Z-NOSE', [2.8, 2.8, 6.0], [0.2, 0.1, 0.1], { m: 1, w: 80, pn: 'HL1-3081-001', sup: 'Ice protection supplier', fn: ['SFN-IPS1'], dal: 'C' });
I('IPS-WAIV-L', 'Wing anti-ice valve, left', 'IPS', 'Z-LWING', [43, -6, 10.0], [0.3, 0.3, 0.3], { m: 6, w: 25, pn: 'HL1-3011-001', sup: 'Valve supplier', fn: ['SFN-IPS1'], dal: 'B' });
I('IPS-WAIV-R', 'Wing anti-ice valve, right', 'IPS', 'Z-RWING', [43, 6, 10.0], [0.3, 0.3, 0.3], { m: 6, w: 25, pn: 'HL1-3011-001', sup: 'Valve supplier', fn: ['SFN-IPS1'], dal: 'B' });
I('IPS-CTRL', 'Ice protection control unit', 'IPS', 'Z-CREW', [19.4, 0.4, 11.2], [0.35, 0.2, 0.3], { m: 5, w: 30, pn: 'HL1-3091-001', sup: 'Ice protection supplier', fn: ['SFN-IPS1', 'SFN-IPS2', 'SFN-WIN2'], dal: 'B' });
I('WIN-WS-L', 'Windshield, left', 'WIN', 'Z-FDCK', [7.6, -0.8, 12.9], [0.1, 1.0, 0.8], { m: 32, w: 1800, pn: 'HL1-5611-001', sup: 'Transparency supplier', fn: ['SFN-WIN1', 'SFN-WIN2'], dal: 'C' });
I('WIN-WS-R', 'Windshield, right', 'WIN', 'Z-FDCK', [7.6, 0.8, 12.9], [0.1, 1.0, 0.8], { m: 32, w: 1800, pn: 'HL1-5611-001', sup: 'Transparency supplier', fn: ['SFN-WIN1', 'SFN-WIN2'], dal: 'C' });
I('WIN-SIDE-L', 'Side windows, left', 'WIN', 'Z-FDCK', [9.5, -2.1, 12.6], [1.4, 0.1, 0.6], { m: 24, w: 600, pn: 'HL1-5612-001', sup: 'Transparency supplier', fn: ['SFN-WIN1'], dal: 'D' });
I('WIN-SIDE-R', 'Side windows, right', 'WIN', 'Z-FDCK', [9.5, 2.1, 12.6], [1.4, 0.1, 0.6], { m: 24, w: 600, pn: 'HL1-5612-001', sup: 'Transparency supplier', fn: ['SFN-WIN1'], dal: 'D' });
I('WIN-WIPERS', 'Windshield wipers', 'WIN', 'Z-FDCK', [7.4, 0, 12.4], [0.2, 1.8, 0.2], { m: 8, w: 150, pn: 'HL1-3041-001', sup: 'Transparency supplier', fn: ['SFN-WIN2'], dal: 'D' });

// ---- ATA 21 air conditioning and pressurization, 35 oxygen, 36 pneumatic, 38 water ----
I('LRU-ECS-01', 'Hold pressure control unit', 'ECS', 'Z-AFTE', [96.6, 0.4, 7.4], [0.4, 0.25, 0.3], { m: 6, w: 40, pn: 'HL1-2131-001', sup: 'ECS supplier', fn: ['SFN-ECS1'], dal: 'B' });
I('LRU-ECS-02', 'Hold relief valve', 'ECS', 'Z-HOLD-A', [93.6, -3.6, 8.8], [0.4, 0.4, 0.4], { m: 9, pn: 'HL1-2132-001', sup: 'ECS supplier', fn: ['SFN-ECS3'], dal: 'A' });
I('LRU-ECS-03', 'Flight-deck pack', 'ECS', 'Z-CREW', [16.2, -1.4, 12.4], [0.8, 0.6, 0.6], { m: 60, w: 400, pn: 'HL1-2151-101', sup: 'ECS supplier', fn: ['SFN-ECS2'], dal: 'B' });
I('ECS-PACK-1', 'Hold air conditioning pack 1', 'ECS', 'Z-BELLY', [38, -1.3, 2.9], [1.4, 0.9, 0.8], { m: 110, w: 300, pn: 'HL1-2151-001', sup: 'ECS supplier', fn: ['SFN-ECS1'], dal: 'C' });
I('ECS-PACK-2', 'Hold air conditioning pack 2', 'ECS', 'Z-BELLY', [38, 1.3, 2.9], [1.4, 0.9, 0.8], { m: 110, w: 300, pn: 'HL1-2151-001', sup: 'ECS supplier', fn: ['SFN-ECS1'], dal: 'C' });
I('ECS-OFV-HOLD', 'Hold outflow valve', 'ECS', 'Z-HOLD-A', [94, 2.6, 4.0], [0.5, 0.5, 0.3], { m: 8, w: 40, pn: 'HL1-2133-001', sup: 'ECS supplier', fn: ['SFN-ECS1'], dal: 'B' });
I('ECS-OFV-FD', 'Flight-deck outflow valve', 'ECS', 'Z-CREW', [15.4, 1.8, 12.6], [0.3, 0.3, 0.2], { m: 4, w: 30, pn: 'HL1-2134-001', sup: 'ECS supplier', fn: ['SFN-ECS2'], dal: 'B' });
I('ECS-FD-PCU', 'Flight-deck pressure controller', 'ECS', 'Z-CREW', [19.6, 1.6, 11.2], [0.35, 0.2, 0.3], { m: 5, w: 30, pn: 'HL1-2135-001', sup: 'ECS supplier', fn: ['SFN-ECS2'], dal: 'A' });
I('ECS-AVFAN', 'Avionics cooling fans', 'ECS', 'Z-NOSE', [6.2, 0, 3.4], [0.4, 0.4, 0.4], { m: 8, w: 400, pn: 'HL1-2126-001', sup: 'ECS supplier', fn: ['SFN-ECS2'], dal: 'C' });
I('ECS-TCTL', 'Temperature controller', 'ECS', 'Z-CREW', [18.6, -0.9, 11.2], [0.35, 0.2, 0.3], { m: 4, w: 30, pn: 'HL1-2161-001', sup: 'ECS supplier', fn: ['SFN-ECS1', 'SFN-ECS2'], dal: 'C' });
I('LRU-OXY-01', 'Crew oxygen bottle', 'OXY', 'Z-FDCK', [14.2, 1.7, 11.4], [0.6, 0.25, 0.25], { m: 22, pn: 'HL1-3511-001', sup: 'Oxygen supplier', fn: ['SFN-OXY1'], dal: 'B' });
I('OXY-BOTTLE-2', 'Crew oxygen bottle 2', 'OXY', 'Z-CREW', [15.6, -1.7, 11.4], [0.6, 0.25, 0.25], { m: 22, pn: 'HL1-3511-001', sup: 'Oxygen supplier', fn: ['SFN-OXY1'], dal: 'B' });
I('OXY-MASKS-FD', 'Quick-donning masks, flight deck', 'OXY', 'Z-FDCK', [10, 0, 12.5], [0.4, 3.0, 0.2], { m: 6, pn: 'HL1-3521-001', sup: 'Oxygen supplier', fn: ['SFN-OXY1'], dal: 'B' });
I('OXY-MASK-LM', 'Quick-donning mask, loadmaster station', 'OXY', 'Z-HOLD-F', [16.4, 3.4, 6.0], [0.2, 0.2, 0.2], { m: 2, pn: 'HL1-3521-001', sup: 'Oxygen supplier', fn: ['SFN-OXY1'], dal: 'B' });
I('OXY-REG', 'Oxygen pressure regulator and indication', 'OXY', 'Z-FDCK', [14, 1.4, 11.8], [0.25, 0.15, 0.15], { m: 2, w: 5, pn: 'HL1-3531-001', sup: 'Oxygen supplier', fn: ['SFN-OXY1'], dal: 'B' });
I('PNU-XBV', 'Crossbleed valve', 'PNU', 'Z-CWB', [42, 0, 10.2], [0.35, 0.35, 0.35], { m: 8, w: 25, pn: 'HL1-3621-001', sup: 'Valve supplier', fn: ['SFN-PNU1'], dal: 'C' });
I('PNU-APUBV', 'APU bleed valve', 'PNU', 'Z-TCONE', [103, 0.6, 8.4], [0.3, 0.3, 0.3], { m: 6, w: 25, pn: 'HL1-3622-001', sup: 'Valve supplier', fn: ['SFN-PNU1', 'SFN-APU1'], dal: 'C' });
I('PNU-BMC-1', 'Bleed monitoring computer 1', 'PNU', 'Z-NOSE', [4.4, 1.9, 6.0], [0.35, 0.2, 0.3], { m: 5, w: 30, pn: 'HL1-3631-001', sup: 'Valve supplier', fn: ['SFN-PNU1', 'SFN-PNU2'], dal: 'B' });
I('PNU-BMC-2', 'Bleed monitoring computer 2', 'PNU', 'Z-AFTE', [98, -1.8, 7.0], [0.35, 0.2, 0.3], { m: 5, w: 30, pn: 'HL1-3631-001', sup: 'Valve supplier', fn: ['SFN-PNU1', 'SFN-PNU2'], dal: 'B' });
I('PNU-OHDS', 'Bleed duct overheat sensing loops', 'PNU', 'Z-BELLY', [30, 0, 3.2], [30, 0.1, 0.1], { m: 6, w: 5, pn: 'HL1-3632-001', sup: 'Fire protection supplier', fn: ['SFN-PNU2'], dal: 'B' });
I('WW-TANK', 'Potable water tank', 'WW', 'Z-CREW', [16.2, 1.4, 11.3], [0.8, 0.5, 0.5], { m: 15, pn: 'HL1-3811-001', sup: 'Interiors supplier', fn: ['SFN-WW1'], dal: 'E' });
I('WW-LAV', 'Crew lavatory', 'WW', 'Z-CREW', [20.4, 1.4, 12.0], [1.0, 1.0, 2.0], { m: 70, w: 200, pn: 'HL1-3832-001', sup: 'Interiors supplier', fn: ['SFN-WW1'], dal: 'E' });

// ---- ATA 25 cargo handling and furnishings; 52 doors ----
I('LRU-CRG-01', 'Restraint station assembly', 'CRG', 'Z-HOLD-F', [12, 0, 3.7], [0.6, 6.8, 0.5], { m: 140, pn: 'HL1-2551-001', sup: 'Cargo systems supplier', fn: ['SFN-CRG1'], dal: 'A' });
for (let n = 2; n <= 18; n++) { const x = 12 + (n - 1) * 4.8, z = x < 37 ? 'Z-HOLD-F' : x < 66 ? 'Z-HOLD-M' : 'Z-HOLD-A';
  I('CRG-RS-' + String(n).padStart(2, '0'), 'Restraint station ' + n, 'CRG', z, [x, 0, 3.7], [0.6, 6.8, 0.5], { m: 140, pn: 'HL1-2551-001', sup: 'Cargo systems supplier', fn: ['SFN-CRG1'], dal: 'A', useOf: 'LRU-CRG-01' }); }
I('LRU-CRG-02', 'Restraint tension monitor', 'CRG', 'Z-HOLD-F', [19.6, -3.8, 4.4], [0.4, 0.2, 0.3], { m: 5, w: 30, pn: 'HL1-2552-001', sup: 'Cargo systems supplier', fn: ['SFN-CRG1'], dal: 'B' });
for (const [k, z, x0, x1] of [['F', 'Z-HOLD-F', 8.6, 37], ['M', 'Z-HOLD-M', 37, 66], ['A', 'Z-HOLD-A', 66, 94]])
  I('CRG-ROLLERS-' + k, 'Floor roller and guide tracks, ' + { F: 'forward', M: 'center', A: 'aft' }[k], 'CRG', z, [(x0 + x1) / 2, 0, 3.48], [x1 - x0, 6.0, 0.15], { m: Math.round(16 * (x1 - x0)), pn: 'HL1-2553-001', sup: 'Cargo systems supplier', fn: ['SFN-CRG3'], dal: 'D' });
I('CRG-WINCH', 'Loading winch', 'CRG', 'Z-HOLD-F', [9.4, 0, 4.0], [0.8, 0.8, 0.6], { m: 160, w: 6000, pn: 'HL1-2554-001', sup: 'Cargo systems supplier', fn: ['SFN-CRG3'], dal: 'C' });
I('CRG-LMP', 'Loadmaster control panel', 'CRG', 'Z-HOLD-F', [16.6, 3.8, 6.4], [0.1, 0.6, 0.5], { m: 6, w: 40, pn: 'HL1-2555-001', sup: 'Cargo systems supplier', fn: ['SFN-CRG1', 'SFN-CRG2', 'SFN-CRG3'], dal: 'B' });
I('CRG-WBC', 'Weight and balance computer', 'CRG', 'Z-CREW', [17.2, 1.6, 11.6], [0.35, 0.2, 0.3], { m: 4, w: 30, pn: 'HL1-2556-001', sup: 'Cargo systems supplier', fn: ['SFN-CRG2'], dal: 'B' });
I('EQF-SEATS-FD', 'Flight-deck seats (captain, first officer, observer)', 'EQF', 'Z-FDCK', [10, 0, 11.6], [1.2, 3.0, 1.2], { m: 75, pn: 'HL1-2511-001', sup: 'Interiors supplier', fn: ['SFN-EQF1'], dal: 'E' });
I('EQF-SEAT-LM', 'Loadmaster seat', 'EQF', 'Z-HOLD-F', [16.8, 3.2, 4.6], [0.6, 0.6, 1.1], { m: 18, pn: 'HL1-2512-001', sup: 'Interiors supplier', fn: ['SFN-EQF1'], dal: 'E' });
I('EQF-REST', 'Crew rest bunks', 'EQF', 'Z-CREW', [17.8, 0, 12.0], [1.8, 2.0, 1.2], { m: 90, pn: 'HL1-2521-001', sup: 'Interiors supplier', fn: ['SFN-EQF1'], dal: 'E' });
I('EQF-GALLEY', 'Forward galley', 'EQF', 'Z-CREW', [20.5, -1.4, 11.8], [0.8, 0.8, 1.6], { m: 80, w: 1500, pn: 'HL1-2531-001', sup: 'Interiors supplier', fn: ['SFN-EQF1'], dal: 'E' });
I('EQF-EMERG', 'Emergency and survival equipment', 'EQF', 'Z-FDCK', [14.4, -1.6, 11.6], [0.5, 0.3, 0.6], { m: 25, pn: 'HL1-2561-001', sup: 'Interiors supplier', fn: ['SFN-EQF2'], dal: 'E' });
I('LRU-NZD-01', 'Nose door latch actuator', 'NZD', 'Z-NZDR', [6.0, -2.2, 10.0], [0.5, 0.25, 0.25], { m: 14, pn: 'HL1-5251-101', sup: 'Door supplier', fn: ['SFN-NZD2'], dal: 'A' });
I('LRU-NZD-02', 'Nose door lock actuator', 'NZD', 'Z-NZDR', [6.0, 2.2, 10.0], [0.5, 0.25, 0.25], { m: 14, pn: 'HL1-5251-201', sup: 'Door supplier', fn: ['SFN-NZD2'], dal: 'A' });
I('LRU-NZD-03', 'Lock proximity sensor, channel 1', 'NZD', 'Z-NZDR', [6.6, -2.8, 10.4], [0.1, 0.1, 0.1], { m: 0.5, w: 3, pn: 'HL1-5271-001', sup: 'Sensor supplier', fn: ['SFN-NZD3'], dal: 'A' });
I('LRU-NZD-04', 'Lock proximity sensor, channel 2', 'NZD', 'Z-NZDR', [6.6, 2.8, 10.4], [0.1, 0.1, 0.1], { m: 0.5, w: 3, pn: 'HL1-5271-001', sup: 'Sensor supplier', fn: ['SFN-NZD3'], dal: 'A' });
I('NZD-VISOR-ACT-L', 'Visor opening actuator, left', 'NZD', 'Z-NZDR', [7.2, -3.0, 9.4], [1.4, 0.3, 0.3], { m: 48, pn: 'HL1-5252-001', sup: 'Door supplier', fn: ['SFN-NZD1'], dal: 'B' });
I('NZD-VISOR-ACT-R', 'Visor opening actuator, right', 'NZD', 'Z-NZDR', [7.2, 3.0, 9.4], [1.4, 0.3, 0.3], { m: 48, pn: 'HL1-5252-001', sup: 'Door supplier', fn: ['SFN-NZD1'], dal: 'B' });
I('NZD-DCU', 'Nose door control unit', 'NZD', 'Z-HOLD-F', [10.2, 3.6, 6.2], [0.4, 0.25, 0.3], { m: 6, w: 40, pn: 'HL1-5281-001', sup: 'Door supplier', fn: ['SFN-NZD1', 'SFN-NZD2'], dal: 'A' });
I('DRS-CREW-DOOR', 'Crew entry door with airstair', 'DRS', 'Z-HOLD-F', [18.4, -3.95, 5.4], [1.2, 0.3, 2.0], { m: 160, w: 300, pn: 'HL1-5211-001', sup: 'Door supplier', fn: ['SFN-DRS1', 'SFN-DRS2'], dal: 'C' });
I('DRS-HATCH-L', 'Flight-deck escape hatch, left', 'DRS', 'Z-FDCK', [12.4, -1.0, 13.2], [0.6, 0.6, 0.15], { m: 12, pn: 'HL1-5221-001', sup: 'Door supplier', fn: ['SFN-DRS2'], dal: 'D' });
I('DRS-HATCH-R', 'Flight-deck escape hatch, right', 'DRS', 'Z-FDCK', [12.4, 1.0, 13.2], [0.6, 0.6, 0.15], { m: 12, pn: 'HL1-5221-001', sup: 'Door supplier', fn: ['SFN-DRS2'], dal: 'D' });
I('DRS-SVC-DOOR', 'Aft service door', 'DRS', 'Z-HOLD-A', [90, 3.95, 5.4], [1.0, 0.3, 1.8], { m: 90, pn: 'HL1-5231-001', sup: 'Door supplier', fn: ['SFN-DRS2', 'SFN-DRS3'], dal: 'D' });
I('DRS-IND', 'Door indication unit', 'DRS', 'Z-CREW', [16.2, -0.4, 11.2], [0.3, 0.2, 0.2], { m: 2, w: 15, pn: 'HL1-5271-101', sup: 'Door supplier', fn: ['SFN-DRS1'], dal: 'C' });

// ---- ATA 26 fire protection ----
I('LRU-FPR-02', 'Hold fire detection loop', 'FPR', 'Z-HOLD-F', [22.75, 0, 10.6], [28.5, 0.1, 0.1], { m: 4, w: 5, pn: 'HL1-2615-001', sup: 'Fire protection supplier', fn: ['SFN-FPR1'], dal: 'B' });
I('FPR-HOLD-M', 'Hold fire detection loop, center', 'FPR', 'Z-HOLD-M', [51.5, 0, 9.2], [29, 0.1, 0.1], { m: 4, w: 5, pn: 'HL1-2615-001', sup: 'Fire protection supplier', fn: ['SFN-FPR1'], dal: 'B' });
I('FPR-HOLD-A', 'Hold fire detection loop, aft', 'FPR', 'Z-HOLD-A', [80.5, 0, 10.6], [29, 0.1, 0.1], { m: 4, w: 5, pn: 'HL1-2615-001', sup: 'Fire protection supplier', fn: ['SFN-FPR1'], dal: 'B' });
for (const [n, x, z] of [[1, 22, 'Z-HOLD-F'], [2, 51, 'Z-HOLD-M'], [3, 80, 'Z-HOLD-A']])
  I('FPR-SMOKE-' + n, 'Hold smoke detectors, ' + ['forward', 'center', 'aft'][n - 1], 'FPR', z, [x, 2.6, n === 2 ? 9.2 : 10.6], [0.3, 0.3, 0.1], { m: 3, w: 10, pn: 'HL1-2616-001', sup: 'Fire protection supplier', fn: ['SFN-FPR1'], dal: 'B' });
I('FPR-BTL-L', 'Engine fire extinguisher bottles, left', 'FPR', 'Z-PYL2', [35, -13, 10.4], [0.5, 0.4, 0.4], { m: 20, pn: 'HL1-2621-001', sup: 'Fire protection supplier', fn: ['SFN-FPR2'], dal: 'B' });
I('FPR-BTL-R', 'Engine fire extinguisher bottles, right', 'FPR', 'Z-PYL3', [35, 13, 10.4], [0.5, 0.4, 0.4], { m: 20, pn: 'HL1-2621-001', sup: 'Fire protection supplier', fn: ['SFN-FPR2'], dal: 'B' });
I('FPR-BTL-APU', 'APU fire extinguisher bottle', 'FPR', 'Z-TCONE', [102.6, -1.0, 8.0], [0.4, 0.3, 0.3], { m: 10, pn: 'HL1-2622-001', sup: 'Fire protection supplier', fn: ['SFN-FPR2'], dal: 'B' });
I('FPR-APU-DET', 'APU fire detection loop', 'FPR', 'Z-APU', [106, 0, 9.4], [3.0, 0.1, 0.1], { m: 1, w: 5, pn: 'HL1-2611-101', sup: 'Fire protection supplier', fn: ['SFN-FPR1'], dal: 'B' });
I('FPR-WW-OHT', 'Wheel well overheat detection', 'FPR', 'Z-MLGW', [53, 0, 3.2], [12, 0.1, 0.1], { m: 2, w: 5, pn: 'HL1-2617-001', sup: 'Fire protection supplier', fn: ['SFN-FPR1'], dal: 'C' });
I('FPR-CTRL', 'Fire detection and control unit', 'FPR', 'Z-CREW', [18.4, -1.8, 11.4], [0.4, 0.25, 0.3], { m: 6, w: 40, pn: 'HL1-2618-001', sup: 'Fire protection supplier', fn: ['SFN-FPR1', 'SFN-FPR2'], dal: 'A' });

// ---- ATA 23 communications, 33 lights, 45 maintenance, 46 information ----
for (const n of [1, 2, 3]) I('COM-VHF-' + n, 'VHF radio ' + n, 'COM', 'Z-NOSE', [3.2 + 0.5 * n, n === 2 ? 1.9 : -1.9, 4.2], [0.35, 0.2, 0.25], { m: 4, w: 60, pn: 'HL1-2312-001', sup: 'Communications supplier', fn: ['SFN-COM1'], dal: 'C' });
for (const n of [1, 2]) I('COM-HF-' + n, 'HF radio ' + n, 'COM', 'Z-AFTE', [96, n === 1 ? -2.0 : 2.0, 8.2], [0.4, 0.25, 0.3], { m: 8, w: 400, pn: 'HL1-2311-001', sup: 'Communications supplier', fn: ['SFN-COM1'], dal: 'D' });
I('COM-SATCOM', 'SATCOM terminal', 'COM', 'Z-CREW', [20.6, -0.2, 12.6], [0.5, 0.3, 0.3], { m: 12, w: 300, pn: 'HL1-2315-001', sup: 'Communications supplier', fn: ['SFN-COM1'], dal: 'D' });
for (const n of [1, 2]) I('COM-XPDR-' + n, 'Mode S transponder ' + n, 'COM', 'Z-NOSE', [5.8, n === 1 ? -1.9 : 1.9, 6.6], [0.35, 0.2, 0.25], { m: 4, w: 50, pn: 'HL1-3452-001', sup: 'Communications supplier', fn: ['SFN-COM2'], dal: 'C' });
I('COM-AMU', 'Audio management unit', 'COM', 'Z-NOSE', [6.6, -1.0, 6.6], [0.35, 0.2, 0.25], { m: 4, w: 40, pn: 'HL1-2351-001', sup: 'Communications supplier', fn: ['SFN-COM1', 'SFN-COM3'], dal: 'C' });
I('COM-INT-LM', 'Interphone station, loadmaster', 'COM', 'Z-HOLD-F', [16.6, 3.9, 7.0], [0.15, 0.2, 0.2], { m: 1, w: 5, pn: 'HL1-2352-001', sup: 'Communications supplier', fn: ['SFN-COM3'], dal: 'D' });
I('COM-INT-NZD', 'Interphone station, nose door', 'COM', 'Z-HOLD-F', [8.6, -3.8, 5.0], [0.15, 0.2, 0.2], { m: 1, w: 5, pn: 'HL1-2352-001', sup: 'Communications supplier', fn: ['SFN-COM3'], dal: 'D' });
I('COM-ELT', 'Emergency locator transmitter', 'COM', 'Z-TCONE', [101.6, 0, 10.2], [0.3, 0.15, 0.15], { m: 3, w: 5, pn: 'HL1-2356-001', sup: 'Communications supplier', fn: ['SFN-COM4'], dal: 'E' });
I('LGT-LDG-L', 'Landing light, left', 'LGT', 'Z-LWING', [43, -6.5, 10.0], [0.3, 0.3, 0.3], { m: 3, w: 600, pn: 'HL1-3341-001', sup: 'Lighting supplier', fn: ['SFN-LGT1'], dal: 'E' });
I('LGT-LDG-R', 'Landing light, right', 'LGT', 'Z-RWING', [43, 6.5, 10.0], [0.3, 0.3, 0.3], { m: 3, w: 600, pn: 'HL1-3341-001', sup: 'Lighting supplier', fn: ['SFN-LGT1'], dal: 'E' });
I('LGT-TAXI', 'Taxi and turnoff lights', 'LGT', 'Z-NLGW', [9.6, 0, 2.2], [0.3, 0.6, 0.3], { m: 4, w: 450, pn: 'HL1-3342-001', sup: 'Lighting supplier', fn: ['SFN-LGT1'], dal: 'E' });
I('LGT-NAV', 'Navigation and strobe lights', 'LGT', 'Z-LWING', [57, -39.6, 11.0], [0.4, 0.3, 0.2], { m: 4, w: 200, pn: 'HL1-3343-001', sup: 'Lighting supplier', fn: ['SFN-LGT1'], dal: 'E' });
I('LGT-BEACON', 'Anti-collision beacons', 'LGT', 'Z-HOLD-F', [30, 0, 10.85], [0.3, 0.3, 0.2], { m: 2, w: 100, pn: 'HL1-3344-001', sup: 'Lighting supplier', fn: ['SFN-LGT1'], dal: 'E' });
I('LGT-EMER', 'Emergency lighting and batteries', 'LGT', 'Z-HOLD-F', [17.4, -3.6, 9.8], [0.4, 0.2, 0.2], { m: 6, w: 30, pn: 'HL1-3351-001', sup: 'Lighting supplier', fn: ['SFN-LGT2'], dal: 'D' });
for (const [k, z, x0, x1] of [['F', 'Z-HOLD-F', 8.6, 37], ['M', 'Z-HOLD-M', 37, 66], ['A', 'Z-HOLD-A', 66, 94]])
  I('LGT-HOLD-' + k, 'Hold working lights, ' + { F: 'forward', M: 'center', A: 'aft' }[k], 'LGT', z, [(x0 + x1) / 2, -1.5, 9.25], [x1 - x0, 0.2, 0.1], { m: 10, w: 400, pn: 'HL1-3321-001', sup: 'Lighting supplier', fn: ['SFN-LGT3'], dal: 'E' });
I('LGT-FD', 'Flight-deck lighting', 'LGT', 'Z-FDCK', [11, 0, 13.0], [3.0, 2.0, 0.1], { m: 6, w: 200, pn: 'HL1-3311-001', sup: 'Lighting supplier', fn: ['SFN-LGT3'], dal: 'D' });
I('CMS-CMC', 'Central maintenance computer', 'CMS', 'Z-NOSE', [6.0, 1.9, 5.4], [0.4, 0.25, 0.3], { m: 6, w: 60, pn: 'HL1-4510-001', sup: 'Avionics supplier', fn: ['SFN-CMS1', 'SFN-CMS2', 'SFN-CMS4'], dal: 'D' });
I('CMS-MAT', 'Maintenance access terminal', 'CMS', 'Z-FDCK', [14.0, -1.6, 12.0], [0.3, 0.4, 0.05], { m: 2, w: 40, pn: 'HL1-4511-001', sup: 'Avionics supplier', fn: ['SFN-CMS1', 'SFN-CMS3', 'SFN-CMS5'], dal: 'E' });
I('CMS-DLU', 'Data loader', 'CMS', 'Z-FDCK', [14.0, -1.6, 11.6], [0.3, 0.3, 0.15], { m: 3, w: 30, pn: 'HL1-4512-001', sup: 'Avionics supplier', fn: ['SFN-CMS3'], dal: 'E' });
I('INF-EFB-1', 'Electronic flight bag, captain', 'INF', 'Z-FDCK', [9.0, -1.8, 12.0], [0.05, 0.3, 0.2], { m: 1, w: 20, pn: 'HL1-4611-001', sup: 'Information systems supplier', fn: ['SFN-INF1', 'SFN-INF2'], dal: 'E' });
I('INF-EFB-2', 'Electronic flight bag, first officer', 'INF', 'Z-FDCK', [9.0, 1.8, 12.0], [0.05, 0.3, 0.2], { m: 1, w: 20, pn: 'HL1-4611-001', sup: 'Information systems supplier', fn: ['SFN-INF1', 'SFN-INF2'], dal: 'E' });
I('INF-LMT', 'Loadmaster planning tablet', 'INF', 'Z-HOLD-F', [16.6, 3.8, 6.0], [0.05, 0.3, 0.2], { m: 1, w: 15, pn: 'HL1-4612-001', sup: 'Information systems supplier', fn: ['SFN-INF1'], dal: 'D' });
I('INF-SRV', 'Aircraft information server', 'INF', 'Z-CREW', [16.4, -1.8, 11.6], [0.4, 0.25, 0.3], { m: 7, w: 120, pn: 'HL1-4613-001', sup: 'Information systems supplier', fn: ['SFN-INF2'], dal: 'E' });

// ---- ATA 49 APU, 76 and 77 engine controls and indicating, 78 thrust lever interlock ----
I('APU-UNIT', 'Auxiliary power unit', 'APU', 'Z-APU', [106.4, 0, 8.8], [1.6, 1.0, 1.0], { m: 340, pn: 'HL1-4910-001', sup: 'APU supplier', fn: ['SFN-APU1', 'SFN-APU2'], dal: 'C' });
I('APU-ECB', 'APU electronic control box', 'APU', 'Z-TCONE', [102.8, 1.2, 8.8], [0.4, 0.25, 0.3], { m: 6, w: 50, pn: 'HL1-4961-001', sup: 'APU supplier', fn: ['SFN-APU1', 'SFN-APU2'], dal: 'C' });
I('APU-INLET', 'APU air inlet door', 'APU', 'Z-APU', [105, 0, 10.2], [0.8, 0.6, 0.15], { m: 8, w: 40, pn: 'HL1-4915-001', sup: 'APU supplier', fn: ['SFN-APU1', 'SFN-APU2'], dal: 'C' });
I('APU-FUELP', 'APU fuel pump', 'APU', 'Z-TCONE', [101, -0.8, 7.2], [0.3, 0.3, 0.3], { m: 5, w: 400, pn: 'HL1-4932-001', sup: 'APU supplier', fn: ['SFN-APU1'], dal: 'C' });
I('ECTL-TLQ', 'Thrust lever quadrant', 'ECTL', 'Z-FDCK', [9.6, 0, 11.6], [0.5, 0.4, 0.3], { m: 14, w: 20, pn: 'HL1-7611-001', sup: 'Avionics supplier', fn: ['SFN-ECTL1', 'SFN-TRV2'], dal: 'A' });
I('ECTL-FIREP', 'Engine fire handles and master switches', 'ECTL', 'Z-FDCK', [9.0, 0, 12.4], [0.2, 0.8, 0.15], { m: 4, w: 10, pn: 'HL1-7621-001', sup: 'Avionics supplier', fn: ['SFN-ECTL2', 'SFN-FPR2'], dal: 'A' });
I('EIND-EMU-1', 'Engine monitoring unit 1', 'EIND', 'Z-NOSE', [4.4, 0.2, 3.0], [0.35, 0.2, 0.3], { m: 5, w: 30, pn: 'HL1-7711-001', sup: 'Engine supplier', fn: ['SFN-EIND1', 'SFN-PRP2'], dal: 'B' });
I('EIND-EMU-2', 'Engine monitoring unit 2', 'EIND', 'Z-CREW', [17, 1.8, 11.2], [0.35, 0.2, 0.3], { m: 5, w: 30, pn: 'HL1-7711-001', sup: 'Engine supplier', fn: ['SFN-EIND1', 'SFN-PRP2'], dal: 'B' });
I('TRV-ISOL', 'Reverser isolation valves and interlock', 'TRV', 'Z-CWB', [44, 0, 10.6], [0.6, 0.6, 0.3], { m: 12, w: 40, pn: 'HL1-7833-001', sup: 'Nacelle supplier', fn: ['SFN-TRV2'], dal: 'A' });
I('PROP-TMC', 'Thrust management and asymmetry monitor', 'PROP', 'Z-NOSE', [5.0, 0.6, 6.4], [0.35, 0.2, 0.3], { m: 4, w: 30, pn: 'HL1-7111-001', sup: 'Avionics supplier', fn: ['SFN-PRP2', 'SFN-AFS3', 'SFN-PRP9'], dal: 'A' });

// ---- EWIS: the penetrations the routes pass through ----
I('EWIS-PEN-HINGE', 'Hinge-line penetration, nose door', 'EWIS', 'Z-NZDR', [8.0, 0, 10.6], [0.4, 1.2, 0.2], { m: 2, pn: 'HL1-9241-001', sup: 'Wiring supplier', fn: ['SFN-EWS1'], dal: 'A' });
I('EWIS-PEN-CWB', 'Wing root penetrations', 'EWIS', 'Z-CWB', [44.5, 0, 9.6], [1.0, 8.4, 0.2], { m: 4, pn: 'HL1-9241-101', sup: 'Wiring supplier', fn: ['SFN-EWS1'], dal: 'A' });
I('EWIS-PEN-AFT', 'Aft pressure bulkhead penetrations', 'EWIS', 'Z-AFTE', [99.8, 0, 7.0], [0.2, 3.0, 2.0], { m: 3, pn: 'HL1-9241-201', sup: 'Wiring supplier', fn: ['SFN-EWS1'], dal: 'A' });

// each unit in the side of a split zone where its whole box is on one side
const { zoneOf } = require('./geometry');
for (const it of L) { it.zoneParent = it.zone; it.zone = zoneOf(it.zone, it.pos, it.size); }
module.exports = L;
