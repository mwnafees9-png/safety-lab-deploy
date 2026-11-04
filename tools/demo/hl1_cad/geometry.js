/* Aeolus HL-1 geometry, in meters, one frame for the Sys Lab model and the CAD generator:
   x aft from the nose tip, y to the right, z up from the ground with the aircraft on its wheels.
   A plausible answer to the specification (109 m, 80 m span, four podded engines under a high wing, nose loading,
   twin fins), not a design. Numbers not in the specification are demo assumptions. */
const R = 4.3, ZC = 6.8;            // fuselage radius and centerline height
const ENG = [                        // engine positions: Safety Lab numbers them 1 to 4 from the left
  { n: 1, y: -23, pos: 'left outboard' }, { n: 2, y: -13, pos: 'left inboard' }, { n: 3, y: 13, pos: 'right inboard' }, { n: 4, y: 23, pos: 'right outboard' }];
const ENG_X = [30, 37], ENG_Z = 8.0, ENG_D = 3.0;   // nacelle from the fan face to the exhaust, centerline, diameter
// Zones as boxes [x0, x1, y0, y1, z0, z1]: Safety Lab's 23 HL-1 zones, plus the two wings the ZSA does not list yet
const ZONES = [
  ['Z-NOSE', 'Nose radome and forward avionics bay', [0, 8.5, -4.3, 4.3, 2.0, 8.6]],
  ['Z-NZDR', 'Nose door hinge, latch and lock bay', [4.5, 8.5, -3.6, 3.6, 8.6, 11.0]],
  ['Z-FDCK', 'Raised flight deck above the hold', [7, 15, -2.6, 2.6, 11.0, 13.4]],
  ['Z-CREW', 'Crew rest and forward galley', [15, 21, -2.6, 2.6, 11.0, 13.0]],
  ['Z-HOLD-F', 'Cargo hold, forward third', [8.5, 37, -4.3, 4.3, 3.4, 11.0]],
  ['Z-HOLD-M', 'Cargo hold, center third', [37, 66, -4.3, 4.3, 3.4, 9.4]],
  ['Z-HOLD-A', 'Cargo hold, aft third', [66, 95, -4.3, 4.3, 3.4, 11.0]],
  ['Z-CWB', 'Center wing box and fuel gallery', [41, 53, -4.3, 4.3, 9.4, 11.8]],
  ['Z-NAC1', 'Nacelle 1, left outboard', [29.5, 37.5, -24.6, -21.4, 6.4, 9.6]],
  ['Z-NAC2', 'Nacelle 2, left inboard', [29.5, 37.5, -14.6, -11.4, 6.4, 9.6]],
  ['Z-NAC3', 'Nacelle 3, right inboard', [29.5, 37.5, 11.4, 14.6, 6.4, 9.6]],
  ['Z-NAC4', 'Nacelle 4, right outboard', [29.5, 37.5, 21.4, 24.6, 6.4, 9.6]],
  ['Z-PYL1', 'Pylon 1, left outboard', [33, 41, -23.6, -22.4, 9.6, 10.9]],
  ['Z-PYL2', 'Pylon 2, left inboard', [33, 41, -13.6, -12.4, 9.6, 10.9]],
  ['Z-PYL3', 'Pylon 3, right inboard', [33, 41, 12.4, 13.6, 9.6, 10.9]],
  ['Z-PYL4', 'Pylon 4, right outboard', [33, 41, 22.4, 23.6, 9.6, 10.9]],
  ['Z-MLGW', 'Main landing gear bays', [45, 61, -6.8, 6.8, 0.0, 3.4]],
  ['Z-NLGW', 'Nose landing gear bay', [8.5, 14.5, -1.4, 1.4, 0.0, 3.4]],
  ['Z-BELLY', 'Belly fairing and keel beam runs', [14.5, 45, -4.3, 4.3, 2.4, 3.4]],
  ['Z-AFTE', 'Aft equipment bay', [95, 100, -4.3, 4.3, 2.4, 10.4]],
  ['Z-TCONE', 'Tail cone aft of the pressure bulkhead', [100, 104, -4.3, 4.3, 6.0, 10.4]],
  ['Z-APU', 'APU bay, aft fuselage', [104, 109, -1.4, 1.4, 7.4, 10.4]],
  ['Z-EMP', 'Empennage, twin fins and horizontal stabilizer', [96, 109, -16, 16, 10.4, 21]],
  ['Z-LWING', 'Left wing, outboard of the wing box', [41, 60, -40, -4.3, 9.6, 12.4]],
  ['Z-RWING', 'Right wing, outboard of the wing box', [41, 60, 4.3, 40, 9.6, 12.4]],
];
/* Left and right halves of the zones that hold redundant equipment on both sides (the zone tree: a part sits in the
   deepest zone that holds its centroid). Safety Lab's ZSA rows stay on the parent zones. */
const SPLIT = ['Z-NOSE', 'Z-FDCK', 'Z-CREW', 'Z-HOLD-F', 'Z-HOLD-M', 'Z-HOLD-A', 'Z-BELLY', 'Z-MLGW', 'Z-AFTE', 'Z-TCONE', 'Z-EMP'];
const CHILDREN = [];
for (const [code, name, b] of ZONES) if (SPLIT.includes(code)) {
  CHILDREN.push([code + '-L', name + ', left side', [b[0], b[1], b[2], 0, b[4], b[5]], code]);
  CHILDREN.push([code + '-R', name + ', right side', [b[0], b[1], 0, b[3], b[4], b[5]], code]);
}
// The zone a unit sits in: the side of a split zone when its whole box is on one side, otherwise the zone itself.
function zoneOf(zone, pos, size) {
  if (!SPLIT.includes(zone)) return zone;
  const lo = pos[1] - size[1] / 2, hi = pos[1] + size[1] / 2;
  return hi <= 0 ? zone + '-L' : lo >= 0 ? zone + '-R' : zone;
}
module.exports = { R, ZC, ENG, ENG_X, ENG_Z, ENG_D, ZONES, SPLIT, CHILDREN, zoneOf, LENGTH: 109, SPAN: 80 };
