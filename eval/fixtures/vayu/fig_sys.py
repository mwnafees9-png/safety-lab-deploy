# -*- coding: utf-8 -*-
"""Section 6 system schematics for VAY-SDD-0001 - one block diagram per system.

Spec-driven renderer: a schematic is a list of boxes on a coarse grid plus a list
of typed links, so the source reads as architecture rather than as drawing code,
and a wrong diagram is a wrong FACT rather than a wrong coordinate.
"""
from reportlab.graphics.shapes import Drawing, Rect, Line, PolyLine
from reportlab.lib import colors
from fig_core import txt, frame_title, INK, HAIR, LABEL, TITLE_C, _bounds_ok

KIND = {
    "hv":     (colors.HexColor("#b3272d"), 1.5,  None,       "High-voltage DC"),
    "lv":     (colors.HexColor("#2b6cb0"), 0.95, None,       "Low-voltage DC (28 V)"),
    "cool":   (colors.HexColor("#1f9e8f"), 1.1,  None,       "Coolant"),
    "mech":   (colors.HexColor("#1d2b3a"), 1.2,  None,       "Mechanical"),
    "sig":    (colors.HexColor("#7b8794"), 0.7,  [2.2, 1.8], "Signal / data"),
    "struct": (colors.HexColor("#4a5568"), 1.4,  [4, 2],     "Structural / interlock"),
}
BOX_FILL = {
    "unit": (colors.HexColor("#ffffff"), colors.HexColor("#1d2b3a")),
    "res":  (colors.HexColor("#eef4f8"), colors.HexColor("#2b6cb0")),
    "zone": (colors.HexColor("#f7f4fb"), colors.HexColor("#7d5ba6")),
    "ext":  (colors.HexColor("#f6f7f9"), colors.HexColor("#9aa8b6")),
    "crew": (colors.HexColor("#fdf6ec"), colors.HexColor("#c8a02c")),
}

PAD_L, PAD_R, PAD_T, PAD_B = 14, 14, 34, 34


class Sch:
    """boxes: id -> (col, row, colspan, label, sub, style). Grid is COLS x ROWS."""
    ROW_H = 40

    def __init__(self, code, name, cols, rows, boxes, links, note, w=470, h=None):
        self.code, self.name, self.cols = code, name, cols
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
            geo[bid] = self._cell(col, row, span)
        for a, b, kind in self.links:
            col, wdt, dash, _ = KIND[kind]
            ax, ay, aw, ah = geo[a]
            bx, by, bw, bh = geo[b]
            acx, acy = ax + aw / 2, ay + ah / 2
            bcx, bcy = bx + bw / 2, by + bh / 2
            if abs(acy - bcy) < 1:
                x0 = ax + aw if bcx > acx else ax
                x1 = bx if bcx > acx else bx + bw
                pts = [x0, acy, x1, acy]
            elif abs(acx - bcx) < 1:
                y0 = ay + ah if bcy > acy else ay
                y1 = by if bcy > acy else by + bh
                pts = [acx, y0, acx, y1]
            else:
                x0 = ax + aw if bcx > acx else ax
                y1 = by + bh if acy > bcy else by
                pts = [x0, acy, bcx, acy, bcx, y1]
            d.add(PolyLine(pts, strokeColor=col, strokeWidth=wdt, strokeDashArray=dash))
        for bid, (col, row, span, label, sub, style) in self.boxes.items():
            x, y, w, h = geo[bid]
            fill, stroke = BOX_FILL[style]
            d.add(Rect(x, y, w, h, fillColor=fill, strokeColor=stroke, strokeWidth=.7, rx=1.5, ry=1.5))
            txt(d, x + w / 2, y + h - (9 if sub else h / 2 + 2.2), label, 5.4, INK,
                anchor="middle", bold=True)
            if sub:
                txt(d, x + w / 2, y + h - 17, sub, 4.4, LABEL, anchor="middle")
        used, seen = [], set()
        for _, _, k in self.links:
            if k not in seen:
                seen.add(k)
                used.append(k)
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

"DEP": Sch("DEP", "Distributed Electric Propulsion", 5, 3, {
    "busa": B(0, 0, 1, "HV BUS A", "pack A side", "res"),
    "busb": B(0, 2, 1, "HV BUS B", "pack B side", "res"),
    "inva": B(1, 0, 1, "INVERTER GROUP A", "four lift units"),
    "invb": B(1, 2, 1, "INVERTER GROUP B", "four lift units"),
    "invc": B(1, 1, 1, "CRUISE INVERTERS", "two units"),
    "lfta": B(2, 0, 1, "LEFT BOOM MOTORS", "four"),
    "lftb": B(2, 2, 1, "RIGHT BOOM MOTORS", "four"),
    "crz":  B(2, 1, 1, "CRUISE MOTORS", "two"),
    "fcs":  B(3, 1, 1, "FCS", "torque demand", "ext"),
    "tms":  B(4, 1, 1, "TMS", "route R-4", "res"),
  }, [("busa","inva","hv"), ("busb","invb","hv"), ("busa","invc","hv"), ("busb","invc","hv"),
      ("inva","lfta","hv"), ("invb","lftb","hv"), ("invc","crz","hv"),
      ("fcs","invc","sig"), ("tms","invc","cool")],
  "Each boom group is fed from one pack side. The cruise inverters are the only units drawing from both."),

"LFT": Sch("LFT", "Lift Unit and Rotor Assembly", 4, 3, {
    "mot": B(0, 1, 1, "MOTOR", "one per unit", "ext"),
    "hub": B(1, 1, 1, "HUB", "blade retention"),
    "bld": B(2, 1, 1, "BLADES", "two per rotor"),
    "brk": B(1, 0, 1, "PARKING BRAKE", "holds the stop"),
    "idx": B(2, 0, 1, "INDEX SENSOR", "blade position"),
    "boom":B(3, 1, 1, "BOOM STRUCTURE", "zone 400 / 500", "zone"),
    "fcs": B(0, 0, 1, "FCS", "stop and align", "ext"),
    "hms": B(3, 0, 1, "HMS", "vibration and index", "ext"),
  }, [("mot","hub","mech"), ("hub","bld","mech"), ("brk","hub","mech"),
      ("idx","hub","sig"), ("hub","boom","struct"), ("fcs","brk","sig"), ("idx","hms","sig")],
  "The rotor is stopped and indexed for cruise. The brake and the index sensor act on the same hub."),

"HVB": Sch("HVB", "High Voltage Battery and Energy Storage", 4, 3, {
    "p1a": B(0, 0, 1, "PACK A STRINGS", "four, contactor each"),
    "p1b": B(0, 2, 1, "PACK B STRINGS", "four, contactor each"),
    "bmsa":B(1, 0, 1, "BMS A", "opens a contactor"),
    "bmsb":B(1, 2, 1, "BMS B", "opens a contactor"),
    "cp":  B(1, 1, 1, "COLD PLATE", "one per pack", "res"),
    "busa":B(2, 0, 1, "HV BUS A", None, "res"),
    "busb":B(2, 2, 1, "HV BUS B", None, "res"),
    "enc": B(3, 0, 1, "SEALED ENCLOSURE", "overboard vent", "zone"),
    "ins": B(3, 2, 1, "INSULATION MONITOR", "leakage to airframe", "ext"),
  }, [("p1a","busa","hv"), ("p1b","busb","hv"), ("p1a","bmsa","sig"), ("p1b","bmsb","sig"),
      ("cp","p1a","cool"), ("cp","p1b","cool"), ("p1a","enc","struct"), ("busb","ins","sig")],
  "Two packs, isolable independently. They share the underfloor bay, the vent path and the coolant supply."),

"EPD": Sch("EPD", "Electrical Power Distribution", 5, 3, {
    "hva": B(0, 0, 1, "HV BUS A", None, "res"),
    "hvb": B(0, 2, 1, "HV BUS B", None, "res"),
    "tie": B(1, 1, 1, "BUS TIE", "normally open"),
    "dca": B(2, 0, 1, "DC/DC A", "28 V"),
    "dcb": B(2, 2, 1, "DC/DC B", "28 V"),
    "lva": B(3, 0, 1, "LV BUS A", "route R-3", "res"),
    "lvb": B(3, 2, 1, "LV BUS B", "route R-3", "res"),
    "ess": B(4, 1, 1, "ESSENTIAL BUS", "either side"),
    "bat": B(1, 0, 1, "LV BATTERY", "independent of HV"),
  }, [("hva","tie","hv"), ("hvb","tie","hv"), ("hva","dca","hv"), ("hvb","dcb","hv"),
      ("dca","lva","lv"), ("dcb","lvb","lv"), ("lva","ess","lv"), ("lvb","ess","lv"),
      ("bat","ess","lv")],
  "The tie is the only path between the two high-voltage sides. The essential bus can be fed from either."),

"TMS": Sch("TMS", "Thermal Management", 5, 3, {
    "pmpa":B(0, 0, 1, "PUMP A", "loop A"),
    "pmpb":B(0, 2, 1, "PUMP B", "loop B"),
    "hxa": B(1, 0, 1, "HEAT EXCHANGER A", "ram and fan"),
    "hxb": B(1, 2, 1, "HEAT EXCHANGER B", "ram and fan"),
    "bat": B(2, 1, 1, "BATTERY COLD PLATES", "both packs", "ext"),
    "inv": B(3, 1, 1, "INVERTER PLATES", "all groups", "ext"),
    "mot": B(4, 1, 1, "MOTOR JACKETS", "ten units", "ext"),
    "xv":  B(2, 0, 1, "CROSSOVER VALVE", "either loop to either load"),
  }, [("pmpa","hxa","cool"), ("pmpb","hxb","cool"), ("hxa","bat","cool"), ("hxb","inv","cool"),
      ("xv","bat","cool"), ("xv","inv","cool"), ("inv","mot","cool")],
  "Two loops, one crossover. Every heat load can be reached from either loop through the valve."),

"FCS": Sch("FCS", "Flight Control System", 5, 3, {
    "fca": B(0, 0, 1, "FCC A", "route R-5", "res"),
    "fcb": B(0, 1, 1, "FCC B", "route R-6", "res"),
    "fcc": B(0, 2, 1, "FCC C", "dissimilar lane", "res"),
    "vot": B(1, 1, 1, "COMMAND VOTE", "three lanes"),
    "nav": B(2, 0, 1, "NAV", "state and air data", "ext"),
    "inc": B(2, 2, 1, "INCEPTORS", "pilot demand", "crew"),
    "dep": B(3, 0, 1, "DEP", "torque demand", "ext"),
    "act": B(3, 2, 1, "ACT", "surface demand", "ext"),
    "dis": B(4, 1, 1, "DIS", "mode and state", "ext"),
  }, [("fca","vot","sig"), ("fcb","vot","sig"), ("fcc","vot","sig"),
      ("nav","fca","sig"), ("inc","fcc","sig"), ("vot","dep","sig"), ("vot","act","sig"),
      ("vot","dis","sig")],
  "Three lanes on two buses and a dissimilar third. Hover, transition and wing-borne laws run in the same computers."),

"ACT": Sch("ACT", "Flight Control Actuation", 5, 2, {
    "fcs": B(0, 0, 1, "FCS", "surface demand", "ext"),
    "ele": B(1, 0, 1, "RUDDERVATOR L", "two motors"),
    "elr": B(2, 0, 1, "RUDDERVATOR R", "two motors"),
    "ail": B(3, 0, 1, "AILERON L / R", "one motor each"),
    "flp": B(4, 0, 1, "FLAP DRIVE", "single, interconnected"),
    "lva": B(1, 1, 1, "LV BUS A", None, "res"),
    "lvb": B(3, 1, 1, "LV BUS B", None, "res"),
  }, [("fcs","ele","sig"), ("fcs","elr","sig"), ("fcs","ail","sig"), ("fcs","flp","sig"),
      ("lva","ele","lv"), ("lvb","elr","lv"), ("lva","ail","lv"), ("lvb","flp","lv")],
  "Electromechanical throughout, with no mechanical path from the inceptors to any surface."),

"NAV": Sch("NAV", "Navigation and Air Data", 5, 3, {
    "ir1": B(0, 0, 1, "INERTIAL A", "with GNSS"),
    "ir2": B(0, 2, 1, "INERTIAL B", "with GNSS"),
    "ads": B(1, 1, 1, "AIR DATA", "two probes"),
    "lsp": B(2, 1, 1, "LOW-SPEED SENSING", "hover, wind vector"),
    "rad": B(3, 0, 1, "RADAR ALTIMETER", "two"),
    "mag": B(3, 2, 1, "MAGNETIC HEADING", "standby source"),
    "fcs": B(4, 1, 1, "FCS", "state vector", "ext"),
  }, [("ir1","ads","sig"), ("ir2","ads","sig"), ("ads","lsp","sig"), ("lsp","fcs","sig"),
      ("rad","fcs","sig"), ("mag","fcs","sig")],
  "Low-speed sensing exists because pitot air data is not usable through the hover and transition regimes."),

"COM": Sch("COM", "Communications", 5, 3, {
    "v1":  B(0, 0, 1, "VHF A", None),
    "v2":  B(0, 2, 1, "VHF B", None),
    "dat": B(1, 1, 1, "VERTIPORT DATALINK", "pad state and slot"),
    "aud": B(2, 1, 1, "AUDIO PANEL", "pilot headset"),
    "pa":  B(3, 0, 1, "PASSENGER ADDRESS", "cabin speakers"),
    "int": B(3, 2, 1, "CABIN INTERCOM", "pilot to cabin"),
    "ant": B(4, 1, 1, "ANTENNA GROUP", "upper and lower", "zone"),
  }, [("v1","aud","sig"), ("v2","aud","sig"), ("dat","aud","sig"), ("aud","pa","sig"),
      ("aud","int","sig"), ("v1","ant","sig"), ("v2","ant","sig")],
  "One audio panel is the pilot's single point of contact with radios, datalink and the cabin."),

"DAA": Sch("DAA", "Detect and Avoid", 5, 2, {
    "adsb":B(0, 0, 1, "ADS-B IN", "cooperative traffic"),
    "xpdr":B(0, 1, 1, "TRANSPONDER", "cooperative out"),
    "opt": B(1, 0, 1, "OPTICAL SENSORS", "forward and lateral"),
    "proc":B(2, 0, 1, "SURVEILLANCE PROCESSOR", "track fusion"),
    "ter": B(2, 1, 1, "TERRAIN AND OBSTACLE DATA", "urban database", "res"),
    "dis": B(3, 0, 1, "DIS", "traffic and terrain picture", "ext"),
    "fcs": B(4, 0, 1, "FCS", "advisory only", "ext"),
  }, [("adsb","proc","sig"), ("opt","proc","sig"), ("ter","proc","sig"),
      ("proc","dis","sig"), ("proc","fcs","sig"), ("xpdr","adsb","sig")],
  "The processor fuses cooperative traffic, optical detections and the obstacle database into one picture."),

"DIS": Sch("DIS", "Flight Deck Displays and Controls", 5, 3, {
    "gp1": B(0, 0, 1, "GRAPHICS A", None),
    "gp2": B(0, 2, 1, "GRAPHICS B", None),
    "d1":  B(1, 0, 1, "LEFT SURFACE", "primary flight"),
    "d2":  B(1, 2, 1, "RIGHT SURFACE", "systems and route"),
    "std": B(2, 1, 1, "STANDBY DISPLAY", "own LV feed"),
    "inc": B(3, 0, 1, "CENTRE INCEPTOR", "flight path", "crew"),
    "lev": B(3, 2, 1, "ENERGY LEVER", "left hand", "crew"),
    "ann": B(4, 1, 1, "ALERT PRESENTATION", "banner and tone"),
  }, [("gp1","d1","sig"), ("gp2","d2","sig"), ("gp1","std","sig"),
      ("inc","ann","sig"), ("lev","ann","sig"), ("d1","ann","sig"), ("d2","ann","sig")],
  "Two surfaces from two graphics processors, and a standby display that does not depend on either."),

"LGS": Sch("LGS", "Landing Gear and Ground Contact", 4, 3, {
    "nose":B(0, 1, 1, "NOSE UNIT", "castoring"),
    "mainl":B(1, 0, 1, "MAIN UNIT L", "oleo and wheel"),
    "mainr":B(1, 2, 1, "MAIN UNIT R", "oleo and wheel"),
    "wow": B(2, 1, 1, "WEIGHT ON WHEELS", "two sensors"),
    "brk": B(3, 0, 1, "WHEEL BRAKES", "electric"),
    "str": B(3, 2, 1, "AIRFRAME", "zone 1000", "zone"),
    "fcs": B(2, 0, 1, "FCS", "ground or air state", "ext"),
  }, [("nose","str","struct"), ("mainl","str","struct"), ("mainr","str","struct"),
      ("wow","fcs","sig"), ("mainl","brk","mech"), ("mainr","brk","mech")],
  "Retractable tricycle. Weight on wheels is the signal that tells the control laws the aircraft is on the pad."),

"STR": Sch("STR", "Airframe Structure", 5, 3, {
    "fwd": B(0, 1, 1, "FORWARD FUSELAGE", "zone 100", "zone"),
    "cab": B(1, 1, 1, "CABIN SECTION", "zone 200", "zone"),
    "bay": B(1, 2, 1, "BATTERY BAY", "zone 800", "zone"),
    "aft": B(2, 1, 1, "AFT FUSELAGE", "zone 300", "zone"),
    "wing":B(3, 0, 1, "WING BOX", "carry-through"),
    "boom":B(3, 2, 1, "BOOMS L / R", "eight lift mounts"),
    "tail":B(4, 1, 1, "V-TAIL", "zone 900", "zone"),
  }, [("fwd","cab","struct"), ("cab","aft","struct"), ("cab","bay","struct"),
      ("wing","cab","struct"), ("boom","wing","struct"), ("aft","tail","struct")],
  "The wing box carries the booms, and the booms carry every lift unit. One load path, named."),

"CAB": Sch("CAB", "Cabin and Occupant Safety", 5, 2, {
    "seat":B(0, 0, 1, "SEATS", "one pilot, six cabin"),
    "rest":B(1, 0, 1, "RESTRAINTS", "four point"),
    "door":B(2, 0, 1, "DOORS", "one per side"),
    "lat": B(2, 1, 1, "LATCH SENSING", "to DIS", "ext"),
    "int": B(3, 0, 1, "INTERIOR", "linings and stowage"),
    "env": B(4, 0, 1, "CABIN ENVIRONMENT", "ventilation and lighting"),
    "lvb": B(4, 1, 1, "LV BUS B", None, "res"),
  }, [("seat","rest","struct"), ("door","lat","sig"), ("int","env","struct"),
      ("lvb","env","lv"), ("rest","int","struct")],
  "Door latch state is sensed and presented on the flight deck; the pilot boards the cabin without leaving the seat."),

"ERS": Sch("ERS", "Emergency Recovery System", 5, 2, {
    "arm": B(0, 0, 1, "ARMING UNIT", "own LV feed"),
    "inh": B(1, 0, 1, "INHIBIT LOGIC", "weight on wheels and height"),
    "fire":B(2, 0, 1, "FIRING UNIT", "pyrotechnic"),
    "can": B(3, 0, 1, "CANISTER", "aft upper fuselage"),
    "har": B(4, 0, 1, "HARNESS", "to wing box"),
    "wow": B(1, 1, 1, "LGS", "ground state", "ext"),
    "crew":B(0, 1, 1, "PILOT HANDLE", "guarded", "crew"),
  }, [("arm","inh","lv"), ("inh","fire","sig"), ("fire","can","mech"), ("can","har","mech"),
      ("wow","inh","sig"), ("crew","fire","mech")],
  "The handle is mechanical to the firing unit. The inhibit acts on the electrical path, not on the handle."),

"HMS": Sch("HMS", "Health Monitoring and Data Recording", 5, 3, {
    "busa":B(0, 0, 1, "DATA BUS A", "route R-5", "res"),
    "busb":B(0, 2, 1, "DATA BUS B", "route R-6", "res"),
    "acq": B(1, 1, 1, "ACQUISITION UNIT", "all systems"),
    "rec": B(2, 1, 1, "CRASH-PROTECTED RECORDER", "aft fuselage"),
    "sto": B(3, 0, 1, "MAINTENANCE STORE", "removable"),
    "gnd": B(4, 1, 1, "VERTIPORT LINK", "turnaround report", "ext"),
    "dis": B(3, 2, 1, "DIS", "readiness summary", "ext"),
  }, [("busa","acq","sig"), ("busb","acq","sig"), ("acq","rec","sig"), ("acq","sto","sig"),
      ("sto","gnd","sig"), ("acq","dis","sig")],
  "One acquisition unit reads both buses. The turnaround report is what the next departure is planned from."),

}
