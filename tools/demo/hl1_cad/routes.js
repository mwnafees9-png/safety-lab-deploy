/* The harness and pipe runs of Aeolus, as the program's CAD tool holds them (routing belongs to the CAD tool; Sys Lab and
   Safety Lab only read it). Each run is one assembly in the STEP model, named by its line number, with one tube per
   segment between the waypoints (meters, geometry.js frame). [id, kind, name, diameter m, points]
   Channel 1 runs keep to the left sidewall and channel 2 to the right, except where a seeded finding says otherwise. */
const ENG = require('./geometry').ENG;
const R = [];
const W = (id, kind, name, d, pts) => R.push({ id, kind, name, d, pts });
const side = y => (y < 0 ? -1 : 1);
// along a hold sidewall at height z, from x0 to x1 (left: y = -3.85, right: y = 3.85)
const wall = (s, z, x0, x1) => [[x0, 3.85 * s, z], [x1, 3.85 * s, z]];

// ---- engine runs: nacelle, up the pylon, along the wing front spar, into the wing box, down the sidewall ----
for (const e of ENG) {
  const n = e.n, y = e.y, s = side(y);
  // pylon lanes (19 Oct 2026, build 6): the feeder 0.35 m inboard of the pylon center line, the engine harness 0.35 m
  // outboard, fuel and bleed on the center line; the feeders cross to the fuselage at 9.6 m, under the fuel and bleed,
  // and come down the sidewall 0.3 m inboard of the wiring lanes
  const yi = 3.55 * s, up = [[32.0, y - 1.0 * s, 7.6], [36.0, y - 0.35 * s, 10.0], [41.6, y - 0.35 * s, 10.0], [41.6, y - 0.35 * s, 9.6], [41.6, yi, 9.6]];
  // generators 1 and 2 feed AC bus 1 in the nose, generators 3 and 4 feed AC bus 2 in the aft bay
  W('W-GEN' + n, 'wire', 'Generator ' + n + ' feeder', 0.06, s < 0 ? [...up, [42.6, yi, 9.6], [42.6, yi, 4.4], [42.6, 3.85 * s, 3.9], [20, 3.85 * s, 3.9], [6.6, 3.85 * s, 3.9], [6.4, 1.4 * s, 4.4]]
    : [...up, [43.4, yi, 9.6], [43.4, yi, 4.4], [43.4, 3.85, 3.9], [94.5, 3.85, 3.9], [96.6, 1.3, 6.9]]);
  W('W-ENG' + n, 'wire', 'Engine ' + n + ' harness (FADEC, indication, fire detection)', 0.05,
    [[33.0, y, 9.3], [37.0, y + 0.35 * s, 10.1], [42.4, y + 0.35 * s, 10.6], [42.4, 3.7 * s, 10.6], [42.8, 3.7 * s, 9.0], [21, 3.7 * s, 9.0], [7.2, 3.6 * s, 8.4], [5.2, 1.0 * s, 6.2]]);
  W('F-FEED' + n, 'fuel', 'Engine ' + n + ' fuel feed', 0.05, [[46, y, 10.1], [41.2, y, 10.0], [36.5, y, 9.9], [32.6, y, 7.0]]);
  W('B-ENG' + n, 'bleed', 'Engine ' + n + ' bleed duct', 0.12, [[40.0, y, 10.3], [42.0, y, 10.9], [42.0, 3.4 * s, 10.9], [42.0, 0.4 * s, 10.2]]);
}
// ---- power ----
W('W-FEED-AFT', 'wire', 'Forward to aft feeder harness, left sidewall', 0.07, [[6.6, -1.6, 4.4], [7.4, -3.85, 4.2], ...wall(-1, 4.2, 7.4, 94.5).slice(1), [96.5, -1.8, 6.2]]);
W('W-FCC1-PWR', 'wire', 'Flight control computer 1 power', 0.02, [[6.3, -1.3, 4.4], [4.6, -1.0, 4.5]]);
// SEEDED FINDING 3: this harness starts at DC bus 1 in the forward bay; FCC 2's power should come from DC bus 2 aft
W('W-FCC2-PWR', 'wire', 'Flight control computer 2 harness', 0.025, [[6.4, -1.2, 5.0], [6.4, -1.2, 8.2], [7.6, -1.2, 10.4], [12, -1.4, 11.2], [18.2, 1.0, 11.3]]);
W('W-ESS', 'wire', 'Essential bus distribution', 0.04, [[19.2, -1.4, 11.2], [14, -1.9, 11.2], [9, -1.9, 11.2], [8.5, -1.0, 11.9]]);
W('W-APUGEN', 'wire', 'APU generator feeder', 0.05, [[105.2, 0, 8.3], [102, -0.8, 8.0], [99.9, -2.4, 7.0], [97.6, -2.4, 7.0]]);
W('W-EMER', 'wire', 'Emergency generator to essential bus', 0.04, [[40, 1.6, 3.1], [30, 1.9, 3.1], [15, 1.9, 3.1], [14.4, 3.85, 3.9], ...wall(1, 9.0, 14.4, 17.2), [19.4, -1.4, 11.3]]);
// ---- flight controls (fly-by-wire): lane 1 along the left sidewall high, lane 2 along the right ----
W('W-FBW-1', 'wire', 'Fly-by-wire lane 1: ACE 1 to the elevator and left rudder', 0.04, [[5.2, -1.4, 4.2], [7.2, -3.85, 8.0], ...wall(-1, 8.0, 7.2, 94.6).slice(1), [99.5, -2.0, 9.4], [101.5, -5, 10.9], [104, -6.5, 13.4]]);
W('W-FBW-1W', 'wire', 'Fly-by-wire lane 1: branch to the left wing', 0.03, [[41.6, -3.85, 8.0], [42.6, -3.7, 10.2], [55, -18, 11.0], [55, -33, 10.8]]);
W('W-FBW-2', 'wire', 'Fly-by-wire lane 2: ACE 2 to the tail and the right wing', 0.04, [[97.5, 1.4, 5.2], [97.0, 2.2, 8.2], [94.6, 3.85, 8.0], ...wall(1, 8.0, 94.6, 46.2).slice(1), [46.2, 3.7, 10.2], [55, 18, 11.0], [55, 33, 10.8]]);
W('W-FBW-TAIL-2', 'wire', 'Fly-by-wire lane 2: ACE 2 to the elevator and rudder', 0.03, [[97.5, 1.4, 5.2], [99.5, 2.0, 9.4], [101.5, 5, 10.9], [104, 6.5, 13.4]]);
// ---- avionics network: plane A on the left, plane B on the right ----
W('W-AFDX-A', 'wire', 'Avionics network plane A trunk', 0.03, [[5.6, -0.6, 5.7], [8.2, -3.85, 8.4], [8.8, -3.85, 9.2], ...wall(-1, 9.2, 8.8, 44).slice(1), [44, -3.4, 10.0], [44, -3.85, 9.2], ...wall(-1, 9.2, 44, 94.6).slice(1), [98.6, 1.8, 8.6]]);
W('W-AFDX-B', 'wire', 'Avionics network plane B trunk', 0.03, [[19.2, 0.6, 11.6], [19.4, 2.2, 11.2], [20.5, 3.85, 9.2], ...wall(1, 9.2, 20.5, 80).slice(1), [80, 3.8, 9.7]]);
// SEEDED FINDING 2: both lock-sensing channels go through the one hinge-line penetration, side by side
W('W-NZD-LOCK-1', 'wire', 'Nose door lock sensing, channel 1', 0.015, [[6.6, -2.8, 10.4], [7.6, -0.25, 10.6], [8.4, -0.05, 10.6], [9.2, -0.8, 11.3], [8.0, -1.6, 9.0], [5.2, -1.6, 5.7]]);
W('W-NZD-LOCK-2', 'wire', 'Nose door lock sensing, channel 2', 0.015, [[6.6, 2.8, 10.4], [7.6, 0.25, 10.6], [8.4, 0.05, 10.6], [9.2, 0.8, 11.3], [14, 1.2, 11.3], [18.8, 1.6, 11.4]]);
W('W-RT-005', 'wire', 'Restraint tension monitoring loop', 0.02, [[12, -3.25, 3.9], [93.6, -3.25, 3.9], [93.6, -3.45, 4.2], [19.6, -3.45, 4.2]]);
// ---- hydraulics ----
// SEEDED FINDING 1: systems A and B converge in the wing box and run side by side (Safety Lab's open CMA-004)
W('H-A-01', 'hydraulic', 'Hydraulic A: engine 2 pump pressure and return', 0.04, [[32.6, -13.9, 7.6], [36.5, -13.7, 10.0], [43.4, -13.7, 10.0], [43.4, -0.06, 10.0], [47.0, -0.06, 10.0], [47.0, -2.9, 9.6], [47.0, -2.9, 3.6], [48.4, -5.0, 2.4]]);
W('H-B-01', 'hydraulic', 'Hydraulic B: engine 3 pump pressure and return', 0.04, [[32.6, 13.9, 7.6], [36.5, 13.7, 10.0], [43.4, 13.7, 10.0], [43.4, 0.06, 10.0], [47.0, 0.06, 10.0], [47.0, 2.9, 9.6], [47.0, 2.9, 3.6], [48.4, 5.0, 2.4]]);
W('H-A-02', 'hydraulic', 'Hydraulic A: distribution aft to the elevator and left rudder', 0.03, [[52, -5.4, 2.6], [60, -3.85, 3.2], [94.6, -3.85, 3.2], [101, -2.6, 6.0], [101, -3.6, 9.7], [101.5, -5.4, 9.8], [105, -7.1, 12.6]]);
W('H-B-02', 'hydraulic', 'Hydraulic B: distribution aft to the elevator and right rudder', 0.03, [[52, 5.4, 2.6], [60, 3.85, 3.2], [94.6, 3.85, 3.2], [101, 2.6, 6.0], [101, 3.6, 9.7], [101.5, 5.4, 9.8], [105, 7.1, 12.6]]);
W('H-A-03', 'hydraulic', 'Hydraulic A: forward to the nose door and gear', 0.025, [[48, -5.2, 2.6], [45.6, -3.85, 3.2], [9.5, -3.85, 3.2], [9.5, -2.6, 3.2], [9.5, -2.6, 9.4], [7.2, -3.0, 9.4]]);
W('H-B-03', 'hydraulic', 'Hydraulic B: forward to the nose-wheel steering', 0.025, [[48, 5.2, 2.6], [45.6, 3.85, 3.2], [13.6, 3.85, 3.2], [13.6, 1.2, 3.0], [12.6, 1.2, 3.0], [11.8, 0.5, 2.9]]);
W('H-C-01', 'hydraulic', 'Hydraulic C: aft bay pump to the stabilizer and rudders', 0.03, [[97.6, -1.0, 4.6], [98.5, -1.6, 7.4], [99.4, 0, 9.8], [99, 0, 10.6]]);
W('H-C-RAT', 'hydraulic', 'Ram air turbine pump to system C', 0.025, [[41.4, -1.6, 3.0], [44, -2.0, 3.0], [46, -3.85, 3.5], [94.6, -3.85, 3.5], [97.4, -1.2, 4.6]]);
// ---- fuel, bleed, inerting, oxygen ----
W('F-XFEED', 'fuel', 'Crossfeed gallery', 0.06, [[46, -23, 10.0], [45, -4.0, 9.8], [45, 4.0, 9.8], [46, 23, 10.0]]);
W('F-APU', 'fuel', 'APU fuel feed', 0.025, [[47, 1.0, 9.8], [47.4, 3.3, 9.4], [47.4, 3.3, 4.6], [47.8, 3.85, 4.6], ...wall(1, 4.6, 47.8, 94.6).slice(1), [99.6, 1.0, 7.0], [101, -0.6, 7.2]]);
W('B-APU', 'bleed', 'APU bleed duct', 0.1, [[103, 0.6, 8.6], [99.5, 1.2, 8.9], [94.6, 3.6, 9.6], [66, 3.6, 9.2], [52.6, 3.6, 9.2], [52.6, 3.4, 10.0], [43, 0.6, 10.2]]);
W('B-PACK', 'bleed', 'Manifold to the air conditioning packs', 0.12, [[42.0, -0.2, 10.0], [44.6, -2.6, 9.6], [44.6, -2.6, 4.0], [43, -2.2, 3.0], [38.8, -1.3, 3.0]]);
// SEEDED FINDING 8 (build 6): the left wing fly-by-wire branch climbs past the left wing anti-ice duct, 45 mm clear,
// closer than the 6 in the program keeps wiring from hot air ducts
W('B-WAI-L', 'bleed', 'Wing anti-ice supply, left', 0.08, [[42.0, -0.6, 10.3], [43, -4.4, 10.1], [43, -6, 10.0]]);
W('B-WAI-R', 'bleed', 'Wing anti-ice supply, right', 0.08, [[42.0, 0.6, 10.3], [43, 4.4, 10.1], [43, 6, 10.0]]);
W('B-ASM', 'bleed', 'Bleed air to the air separation module', 0.05, [[42.0, 0.2, 10.0], [44.8, 3.2, 9.6], [44.8, 3.2, 4.6], [44, 1.6, 3.0], [43.5, 0.8, 3.0]]);
W('O-CREW', 'oxygen', 'Crew oxygen distribution', 0.015, [[14.2, 1.7, 11.6], [14, 1.4, 11.9], [10.2, 0.6, 12.4]]);
W('O-LM', 'oxygen', 'Oxygen to the loadmaster station', 0.012, [[14, 1.4, 11.8], [15.4, 2.0, 11.2], [16.4, 3.4, 10.0], [16.4, 3.4, 6.1]]);
// The line type the CAD tool writes on each run (19 Oct 2026, build 6): the program's own words, which its attribute
// table in Sys Lab maps to route types. W-RT-005 carries none: seeded finding, its type is not in the CAD.
const POWER = /^W-(GEN\d|FEED-AFT|APUGEN|EMER|ESS|FCC\d-PWR)$/, DATA = /^W-AFDX-/;
R.lineType = r => r.id === 'W-RT-005' ? null : r.kind === 'wire' ? (POWER.test(r.id) ? 'Power feeder' : DATA.test(r.id) ? 'Data bus (AFDX)' : 'Signal')
  : { hydraulic: 'Hydraulic pressure and return', fuel: 'Fuel', bleed: 'Bleed air', oxygen: 'Oxygen' }[r.kind];
module.exports = R;
