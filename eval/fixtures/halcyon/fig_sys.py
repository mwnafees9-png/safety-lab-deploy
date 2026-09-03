# -*- coding: utf-8 -*-
"""§6 system schematics for HAL-SDD-0001 — one block diagram per system.

Modelled on the Aeolus Figure 6-2 style: boxes for units, typed lines for what
crosses between them, a line-type legend, and a note under the drawing that says
the one thing the picture is for.

The renderer is spec-driven. A schematic is a list of boxes on a coarse grid and
a list of typed links, so the source reads as architecture rather than as
drawing code, and a wrong diagram is a wrong fact rather than a wrong coordinate.
"""
from reportlab.graphics.shapes import Drawing, Rect, Line, String, PolyLine, Group, Circle
from reportlab.lib import colors
from fig_core import txt, frame_title, INK, HAIR, LABEL, TITLE_C, _bounds_ok

# ---- typed connections ----------------------------------------------------
KIND = {
    "hv":      (colors.HexColor("#b3272d"), 1.5,  None,        "High-voltage DC"),
    "lv":      (colors.HexColor("#2b6cb0"), 0.95, None,        "Low-voltage DC (28 V)"),
    "cool":    (colors.HexColor("#1f9e8f"), 1.1,  None,        "Coolant"),
    "fuel":    (colors.HexColor("#c8a02c"), 1.1,  None,        "Fuel"),
    "bleed":   (colors.HexColor("#6b46a8"), 1.1,  None,        "Bleed air"),
    "mech":    (colors.HexColor("#1d2b3a"), 1.2,  None,        "Mechanical"),
    "sig":     (colors.HexColor("#7b8794"), 0.7,  [2.2, 1.8],  "Signal / data"),
    "struct":  (colors.HexColor("#4a5568"), 1.4,  [4, 2],      "Structural / interlock"),
}
BOX_FILL = {
    "unit":  (colors.HexColor("#ffffff"), colors.HexColor("#1d2b3a")),
    "res":   (colors.HexColor("#eef4f8"), colors.HexColor("#2b6cb0")),   # a resource
    "zone":  (colors.HexColor("#f7f4fb"), colors.HexColor("#7d5ba6")),   # a zone / enclosure
    "ext":   (colors.HexColor("#f6f7f9"), colors.HexColor("#9aa8b6")),   # something outside this system
    "crew":  (colors.HexColor("#fdf6ec"), colors.HexColor("#c8a02c")),
}

PAD_L, PAD_R, PAD_T, PAD_B = 14, 14, 34, 34


class Sch:
    """boxes: id -> (col, row, colspan, label, sub, style). Grid is COLS x ROWS."""
    ROW_H = 40

    def __init__(self, code, name, cols, rows, boxes, links, note, w=470, h=None):
        self.code, self.name, self.cols = code, name, cols
        # Size from the rows actually OCCUPIED, not the rows declared. The first
        # cut trusted the declared count and left a band of dead space under every
        # schematic whose spec reserved a row it never used.
        used = max(b[1] for b in boxes.values()) + 1
        self.rows = used
        self.boxes, self.links, self.note = boxes, links, note
        self.w = w
        self.h = h if h else PAD_T + PAD_B + used * self.ROW_H

    def _cell(self, col, row, span=1):
        gw = (self.w - PAD_L - PAD_R) / self.cols
        gh = (self.h - PAD_T - PAD_B) / self.rows
        x = PAD_L + col * gw + gw * .10
        y = PAD_B + (self.rows - 1 - row) * gh + gh * .16
        return x, y, gw * span - gw * .20, gh * .68

    def draw(self):
        d = Drawing(self.w, self.h)
        d.add(Rect(0, 0, self.w, self.h, fillColor=colors.HexColor("#fbfcfd"),
                   strokeColor=colors.HexColor("#dfe4ea"), strokeWidth=.5))
        frame_title(d, self.w, "%s Schematic (%s)" % (self.name, self.code))
        geo = {}
        for bid, (col, row, span, label, sub, style) in self.boxes.items():
            x, y, w, h = self._cell(col, row, span)
            geo[bid] = (x, y, w, h)
        # links first, so boxes sit on top of the lines
        for a, b, kind in self.links:
            col, wdt, dash, _ = KIND[kind]
            ax, ay, aw, ah = geo[a]; bx, by, bw, bh = geo[b]
            acx, acy = ax + aw / 2, ay + ah / 2
            bcx, bcy = bx + bw / 2, by + bh / 2
            if abs(acy - bcy) < 1:                      # same row: straight
                x0 = ax + aw if bcx > acx else ax
                x1 = bx if bcx > acx else bx + bw
                pts = [x0, acy, x1, acy]
            elif abs(acx - bcx) < 1:                    # same column: straight
                y0 = ay + ah if bcy > acy else ay
                y1 = by if bcy > acy else by + bh
                pts = [acx, y0, acx, y1]
            else:                                       # elbow: out the side, then vertical
                x0 = ax + aw if bcx > acx else ax
                y1 = by + bh if acy > bcy else by
                pts = [x0, acy, bcx, acy, bcx, y1]
            d.add(PolyLine(pts, strokeColor=col, strokeWidth=wdt, strokeDashArray=dash))
        for bid, (col, row, span, label, sub, style) in self.boxes.items():
            x, y, w, h = geo[bid]
            fill, stroke = BOX_FILL[style]
            d.add(Rect(x, y, w, h, fillColor=fill, strokeColor=stroke, strokeWidth=.7,
                       rx=1.5, ry=1.5))
            txt(d, x + w / 2, y + h - (9 if sub else h / 2 + 2.2), label, 5.4, INK,
                anchor="middle", bold=True)
            if sub:
                txt(d, x + w / 2, y + h - 17, sub, 4.4, LABEL, anchor="middle")
        # legend from the kinds actually used, in a stable order
        used, seen = [], set()
        for _, _, k in self.links:
            if k not in seen: seen.add(k); used.append(k)
        lx = PAD_L
        for k in used:
            colr, wdt, dash, name = KIND[k]
            d.add(Line(lx, 17, lx + 11, 17, strokeColor=colr, strokeWidth=wdt, strokeDashArray=dash))
            txt(d, lx + 14, 15.2, name, 4.4, LABEL)
            lx += 16 + len(name) * 2.25
        txt(d, PAD_L, 6.5, self.note, 4.5, colors.HexColor("#5b6b7d"))
        _bounds_ok(d, "6-x " + self.code)
        return d


B = lambda c, r, s, l, sub=None, st="unit": (c, r, s, l, sub, st)

SCHEMATICS = {

"PRL": Sch("PRL", "Left Propulsion Unit", 4, 3, {
    "bus": B(0, 1, 1, "PROPULSION BUS", "one node, §5.3", "res"),
    "inv": B(1, 1, 1, "INVERTER", "two half-bridge sets"),
    "mot": B(2, 1, 1, "MOTOR", "two winding sets"),
    "gbx": B(3, 1, 1, "GEARBOX + PROP", "hydro-mech pitch"),
    "tms": B(1, 0, 1, "TMS BRANCH", "route R-4", "res"),
    "el1": B(0, 0, 1, "CHANNEL 1", "control power", "res"),
    "fca": B(2, 0, 1, "FCA / FCB", "thrust command", "ext"),
    "fth": B(3, 0, 1, "FEATHER", "independent of the bus", "ext"),
  }, [("bus","inv","hv"), ("inv","mot","hv"), ("mot","gbx","mech"),
      ("tms","inv","cool"), ("el1","inv","lv"), ("fca","inv","sig"), ("fth","gbx","mech")],
  "Two winding sets on one rotor: what the two sets share is the rotor and the gearbox, and nothing else."),

"PRR": Sch("PRR", "Right Propulsion Unit", 4, 3, {
    "bus": B(0, 1, 1, "PROPULSION BUS", "one node, §5.3", "res"),
    "inv": B(1, 1, 1, "INVERTER", "two half-bridge sets"),
    "mot": B(2, 1, 1, "MOTOR", "two winding sets"),
    "gbx": B(3, 1, 1, "GEARBOX + PROP", "hydro-mech pitch"),
    "tms": B(1, 0, 1, "TMS BRANCH", "route R-4", "res"),
    "el2": B(0, 0, 1, "CHANNEL 2", "control power", "res"),
    "fcb": B(2, 0, 1, "FCA / FCB", "thrust command", "ext"),
    "fth": B(3, 0, 1, "FEATHER", "independent of the bus", "ext"),
  }, [("bus","inv","hv"), ("inv","mot","hv"), ("mot","gbx","mech"),
      ("tms","inv","cool"), ("el2","inv","lv"), ("fcb","inv","sig"), ("fth","gbx","mech")],
  "Identical to the left unit by part number. The difference is installation: run B, channel 2, the other nacelle."),

"EST": Sch("EST", "High-Voltage Energy Store", 4, 3, {
    "s1":  B(0, 0, 1, "STRING 1", "contactor pair"),
    "s2":  B(0, 1, 1, "STRING 2", "contactor pair"),
    "bms": B(1, 0, 1, "BMS", "opens a contactor"),
    "cp":  B(1, 1, 1, "COLD PLATE", "shared", "res"),
    "bus": B(2, 0, 2, "PROPULSION BUS  —  four contactors on one node", "EST · EGN · PRL · PRR", "res"),
    "dc1": B(2, 1, 1, "DC/DC  CH 1", None, "res"),
    "dc2": B(3, 1, 1, "DC/DC  CH 2", None, "res"),
    "vent":B(0, 2, 2, "SEALED ENCLOSURE + OVERBOARD VENT", "no path to the cabin", "zone"),
    "ins": B(2, 2, 2, "INSULATION MONITOR", "leakage to airframe, continuous", "ext"),
  }, [("s1","bus","hv"), ("s2","bus","hv"), ("s1","bms","sig"), ("s2","bms","sig"),
      ("cp","s2","cool"), ("s1","dc1","hv"), ("s2","dc2","hv"), ("bus","ins","sig")],
  "Two strings isolable independently; they share the enclosure, the cold plate and the vent path. Every source and consumer meets at one node."),

"EGN": Sch("EGN", "Turbogenerator Set", 5, 2, {
    "tk1": B(0, 0, 1, "WING TANK L", "boost pump, ch 1"),
    "tk2": B(0, 1, 1, "WING TANK R", "boost pump, ch 2"),
    "xf":  B(1, 0, 1, "CROSSFEED", "either tank"),
    "trb": B(2, 0, 1, "TURBINE", "single shaft"),
    "gen": B(3, 0, 1, "GENERATOR", "regulated at machine"),
    "rec": B(4, 0, 1, "RECTIFIER", "passive"),
    "st":  B(2, 1, 1, "START FROM STORE", "the store is a prerequisite", "res"),
    "bl":  B(3, 1, 1, "BLEED TO ECS", None, "ext"),
    "bus": B(4, 1, 1, "PROPULSION BUS", None, "res"),
  }, [("tk1","xf","fuel"), ("tk2","xf","fuel"), ("xf","trb","fuel"),
      ("trb","gen","mech"), ("gen","rec","hv"), ("rec","bus","hv"),
      ("st","trb","lv"), ("trb","bl","bleed")],
  "A simplex set whose redundancy partner is the energy store — and which cannot start without it."),

"TMS": Sch("TMS", "Thermal Management", 5, 2, {
    "p1":  B(0, 0, 1, "PUMP 1", "channel 1"),
    "p2":  B(0, 1, 1, "PUMP 2", "channel 2"),
    "est": B(1, 0, 1, "STORE PLATE", None, "ext"),
    "bus": B(2, 0, 1, "BUSBAR PLATE", None, "ext"),
    "nl":  B(3, 0, 1, "L RADIATOR", "flap controlled"),
    "nr":  B(4, 0, 1, "R RADIATOR", "flap controlled"),
    "egn": B(1, 1, 1, "GENERATOR PLATE", None, "ext"),
    "der": B(3, 1, 2, "DERATE REQUEST  —  store first, then propulsion", "on rising loop temperature", "ext"),
  }, [("p1","est","cool"), ("est","bus","cool"), ("bus","nl","cool"), ("nl","nr","cool"),
      ("p2","egn","cool"), ("egn","bus","cool"), ("nr","der","sig")],
  "One loop, one body of coolant. Two pumps and two radiators do not make two loops — a loss of containment anywhere is a loss of all of it."),

"FCA": Sch("FCA", "Flight Control Channel A", 4, 3, {
    "el1": B(0, 1, 1, "CHANNEL 1", "28 V DC", "res"),
    "dpp": B(0, 0, 1, "PRIMARY SENSORS", "air data + inertial", "ext"),
    "inc": B(0, 2, 1, "INCEPTORS", "pilot + autopilot", "crew"),
    "fcc": B(1, 1, 1, "FCC A", "team 1 software"),
    "ace": B(2, 1, 1, "ACE A", "actuator control"),
    "srf": B(3, 1, 1, "SURFACE HALVES", "elev · ail · upper rudder"),
    "xcm": B(2, 0, 2, "CROSS-COMPARE WITH CHANNEL B", "monitored, annunciated on disagreement", "ext"),
    "sec": B(2, 2, 2, "FLAP DRIVE + PITCH TRIM", "commanded by whichever channel is in control", "ext"),
  }, [("el1","fcc","lv"), ("dpp","fcc","sig"), ("inc","fcc","sig"),
      ("fcc","ace","sig"), ("ace","srf","mech"), ("fcc","xcm","sig"), ("ace","sec","sig")],
  "Sensing, power and processing are all on the left of the aircraft, on route R-5."),

"FCB": Sch("FCB", "Flight Control Channel B", 4, 3, {
    "el2": B(0, 1, 1, "CHANNEL 2", "28 V DC", "res"),
    "dps": B(0, 0, 1, "STANDBY SENSORS", "a different source", "ext"),
    "inc": B(0, 2, 1, "INCEPTORS", "pilot + autopilot", "crew"),
    "fcc": B(1, 1, 1, "FCC B", "team 2 software"),
    "ace": B(2, 1, 1, "ACE B", "actuator control"),
    "srf": B(3, 1, 1, "SURFACE HALVES", "elev · ail · lower rudder"),
    "xcm": B(2, 0, 2, "CROSS-COMPARE WITH CHANNEL A", "monitored, annunciated on disagreement", "ext"),
    "mec": B(2, 2, 2, "MECHANICAL REVERSION", "pitch trim + lower rudder — not selectable", "zone"),
  }, [("el2","fcc","lv"), ("dps","fcc","sig"), ("inc","fcc","sig"),
      ("fcc","ace","sig"), ("ace","srf","mech"), ("fcc","xcm","sig"), ("inc","mec","mech")],
  "Dissimilar processor, dissimilar software, and a dissimilar air-data source. The mechanical path is what remains below both channels."),

"EL1": Sch("EL1", "Electrical Distribution Channel 1", 4, 3, {
    "est": B(0, 1, 1, "ENERGY STORE", None, "res"),
    "dc":  B(1, 1, 1, "DC/DC CH 1", "HV -> 28 V"),
    "bus": B(2, 1, 1, "CH 1 BUSBAR", "forward rack"),
    "bat": B(2, 0, 1, "CH 1 BATTERY", "across the bus"),
    "l1":  B(3, 0, 1, "FCC A · DPP", None, "ext"),
    "l2":  B(3, 1, 1, "L BOOST PUMP · TMS PUMP 1", None, "ext"),
    "l3":  B(3, 2, 1, "GEAR CH 1 · FIRE LOOP 1", None, "ext"),
    "tie": B(0, 2, 2, "NO BUS TIE TO CHANNEL 2", "the absence is the design", "zone"),
  }, [("est","dc","hv"), ("dc","bus","lv"), ("bat","bus","lv"),
      ("bus","l1","lv"), ("bus","l2","lv"), ("bus","l3","lv")],
  "Redundancy is at the load, not at the bus: every flight-critical function is carried by one channel or the other."),

"EL2": Sch("EL2", "Electrical Distribution Channel 2", 4, 3, {
    "est": B(0, 1, 1, "ENERGY STORE", None, "res"),
    "dc":  B(1, 1, 1, "DC/DC CH 2", "HV -> 28 V"),
    "bus": B(2, 1, 1, "CH 2 BUSBAR", "aft cabin bay"),
    "bat": B(2, 0, 1, "CH 2 BATTERY", "across the bus"),
    "l1":  B(3, 0, 1, "FCC B · DPS", None, "ext"),
    "l2":  B(3, 1, 1, "R BOOST PUMP · TMS PUMP 2", None, "ext"),
    "l3":  B(3, 2, 1, "GEAR CH 2 · FIRE LOOP 2", None, "ext"),
    "sby": B(0, 2, 2, "STANDBY DISPLAY BATTERY", "a further stage behind channel 2", "zone"),
  }, [("est","dc","hv"), ("dc","bus","lv"), ("bat","bus","lv"),
      ("bus","l1","lv"), ("bus","l2","lv"), ("bus","l3","lv"), ("sby","l1","lv")],
  "The standby display is the only load on the aircraft with two levels of electrical backing."),

"DPP": Sch("DPP", "Primary Flight Display", 4, 3, {
    "prb": B(0, 0, 1, "PITOT-STATIC", "two heated probes"),
    "adr": B(0, 1, 1, "AIR DATA + INERTIAL", "primary sensor set"),
    "el1": B(0, 2, 1, "CHANNEL 1", None, "res"),
    "du1": B(1, 0, 1, "DISPLAY UNIT 1", None),
    "du2": B(1, 1, 1, "DISPLAY UNIT 2", None),
    "cas": B(2, 1, 1, "CREW ALERTING", "three levels, prioritised here"),
    "pwr": B(2, 0, 1, "POWERTRAIN PAGE", "SOC · available power · loop temp"),
    "fca": B(3, 1, 1, "TO FCA", "air + inertial data", "ext"),
    "xcm": B(3, 0, 1, "CROSS-COMPARE", "vs standby", "ext"),
    "all": B(2, 2, 2, "DATA AND DISCRETES FROM EVERY SYSTEM IN §2.2", None, "ext"),
  }, [("prb","adr","sig"), ("adr","du1","sig"), ("adr","du2","sig"), ("el1","du2","lv"),
      ("du1","pwr","sig"), ("du2","cas","sig"), ("cas","fca","sig"), ("pwr","xcm","sig"),
      ("all","cas","sig")],
  "The display and flight control channel A share a rack, a route and an electrical channel — recorded as an installation item to be examined."),

"DPS": Sch("DPS", "Standby Display", 4, 2, {
    "prb": B(0, 0, 1, "SECOND PROBE", "own pitot + static"),
    "att": B(0, 1, 1, "SOLID-STATE ATTITUDE", "own sensor"),
    "el2": B(1, 1, 1, "CHANNEL 2", None, "res"),
    "bat": B(1, 0, 1, "DEDICATED BATTERY", "automatic transfer"),
    "unt": B(2, 0, 1, "STANDBY UNIT", None),
    "crw": B(3, 0, 1, "CREW", None, "crew"),
    "fcb": B(3, 1, 1, "TO FCB", "air + inertial data", "ext"),
  }, [("prb","unt","sig"), ("att","unt","sig"), ("el2","unt","lv"), ("bat","unt","lv"),
      ("unt","crw","sig"), ("unt","fcb","sig")],
  "Independent of the primary display across four things at once: sensor, probe, electrical channel and battery."),

"HUF": Sch("HUF", "Forward Hull Compartment", 4, 2, {
    "nose":B(0, 0, 1, "NOSE GEAR BAY", "only opening below waterline"),
    "drn": B(0, 1, 1, "ONE-WAY DRAIN", "above static waterline"),
    "cmp": B(1, 0, 2, "FORWARD COMPARTMENT  (fwd of frame 14)", "step at frame 11", "zone"),
    "blk": B(3, 0, 1, "WATERTIGHT BULKHEAD", "frame 14"),
    "blg": B(1, 1, 1, "BILGE SENSING", "this compartment only"),
    "pen": B(2, 1, 2, "THREE SEALED PENETRATIONS", "HV run A · coolant ring · channel 1", "ext"),
  }, [("nose","cmp","struct"), ("drn","cmp","struct"), ("cmp","blk","struct"),
      ("blg","cmp","sig"), ("pen","blk","struct")],
  "No bilge line joins the two compartments: a common line would defeat the bulkhead, which is the point of having it."),

"HUA": Sch("HUA", "Aft Hull Compartment & Water Systems", 4, 2, {
    "blk": B(0, 0, 1, "WATERTIGHT BULKHEAD", "frame 14"),
    "cmp": B(1, 0, 2, "AFT COMPARTMENT  (aft of frame 14)", "main gear bays, aft equipment bay", "zone"),
    "wr":  B(3, 0, 1, "WATER RUDDER", "sternpost, retractable"),
    "act": B(2, 1, 1, "ACTUATOR", "diode-OR, both channels"),
    "ped": B(0, 1, 1, "RUDDER PEDALS", "shared with the air rudder", "crew"),
    "ilk": B(1, 1, 1, "GEAR INTERLOCK", "hardwired discrete"),
  }, [("blk","cmp","struct"), ("cmp","wr","struct"), ("act","wr","mech"),
      ("ped","act","mech"), ("ilk","act","sig")],
  "The water rudder and the air rudder share the pedals and nothing else; retraction on gear-down is hardwired, not software."),

"LDG": Sch("LDG", "Amphibious Landing Gear", 4, 3, {
    "sel": B(0, 1, 1, "GEAR LEVER", None, "crew"),
    "el1": B(0, 0, 1, "CHANNEL 1", "nose + L main", "res"),
    "el2": B(0, 2, 1, "CHANNEL 2", "R main", "res"),
    "n":   B(1, 0, 1, "NOSE UNIT", "2 sensors per lock"),
    "lm":  B(1, 1, 1, "LEFT MAIN", "2 sensors per lock"),
    "rm":  B(1, 2, 1, "RIGHT MAIN", "2 sensors per lock"),
    "cmp": B(2, 1, 1, "COMPARISON", "two dissimilar means"),
    "cas": B(3, 1, 1, "ALERTING", "mismatch vs selected surface", "ext"),
    "ff":  B(2, 2, 2, "MECHANICAL FREE-FALL EXTENSION", "releases the uplocks", "zone"),
    "wow": B(2, 0, 2, "WEIGHT-ON-WHEELS TO PROPULSION · ECS · DISPLAYS", None, "ext"),
  }, [("sel","lm","sig"), ("el1","n","lv"), ("el2","rm","lv"),
      ("n","cmp","sig"), ("lm","cmp","sig"), ("rm","cmp","sig"),
      ("cmp","cas","sig"), ("n","wow","sig"), ("rm","ff","mech")],
  "What the crew sees is a comparison of two independent sensors against the selected landing surface, not a sensor reading."),

"FPR": Sch("FPR", "Fire & Thermal Protection", 4, 3, {
    "z1":  B(0, 0, 1, "STORE BAY", "dual loop + module sensing"),
    "z2":  B(0, 1, 1, "GENERATOR BAY", "dual loop"),
    "z3":  B(0, 2, 1, "NACELLES L / R", "dual loop each"),
    "l1":  B(1, 0, 1, "LOOP 1 · CH 1", "route R-5", "res"),
    "l2":  B(1, 1, 1, "LOOP 2 · CH 2", "route R-6", "res"),
    "cas": B(2, 1, 1, "CREW ALERTING", "AND for warning, OR for loop fault", "ext"),
    "con": B(2, 0, 1, "CONTAINMENT", "enclosure + overboard vent", "zone"),
    "bot": B(3, 1, 1, "BOTTLE", "generator bay only"),
    "iso": B(3, 0, 1, "ISOLATION", "fuel shutoff · bus contactor", "ext"),
    "smk": B(2, 2, 2, "CABIN + BAGGAGE SMOKE DETECTION", "photoelectric, separate", "ext"),
  }, [("z1","l1","sig"), ("z2","l2","sig"), ("z3","l1","sig"), ("z3","l2","sig"),
      ("l1","cas","sig"), ("l2","cas","sig"), ("z1","con","struct"),
      ("cas","bot","sig"), ("con","iso","sig"), ("smk","cas","sig")],
  "Three zones are answered by isolation, one by containment, and only one by extinguishant — there is none that usefully addresses a cell in runaway."),

"ECS": Sch("ECS", "Cabin Environment", 5, 2, {
    "egn": B(0, 0, 1, "TURBOGENERATOR", "the only bleed source", "ext"),
    "pak": B(1, 0, 1, "AIR-CYCLE PACK", "aft fuselage"),
    "dst": B(2, 0, 1, "DISTRIBUTION", "flight deck + both cabin zones"),
    "ofv": B(3, 0, 1, "OUTFLOW VALVE", "single"),
    "rlf": B(4, 0, 1, "RELIEF VALVE", "independent"),
    "alt": B(1, 1, 1, "RECIRC FAN + HEATER", "channel 2 — no pressurisation", "res"),
    "huf": B(3, 1, 1, "FWD DOOR INTERLOCK", "differential across the bulkhead", "ext"),
    "wsc": B(2, 1, 1, "WINDSCREEN ANTI-FOG", "bleed + electric backup"),
  }, [("egn","pak","bleed"), ("pak","dst","bleed"), ("dst","ofv","bleed"),
      ("ofv","rlf","bleed"), ("alt","dst","lv"), ("dst","huf","sig"), ("pak","wsc","bleed")],
  "With the generator shut down the aircraft is ventilated but not pressurised — an operating condition, which is what the FL120 limit is for."),
}
