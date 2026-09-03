# -*- coding: utf-8 -*-
"""Figure toolkit and the aircraft views for HAL-SDD-0001.

Everything here is drawn as reportlab vector shapes rather than a raster, so the
figures stay crisp at any zoom and the PDF stays small. The Aeolus SDD uses
shaded 3D renders for its general arrangement and its isometric zonal view;
these are honest 2D engineering views instead — plan, profile and front
elevation — which is the standard form for an SDD and is the half that can be
drawn faithfully rather than approximated.

Geometry is written in metres and mapped to points by `Scale`, so the numbers in
the source match the numbers in §1.2 and can be checked against them.
"""
from reportlab.graphics.shapes import (Drawing, Rect, Line, String, Polygon, PolyLine,
                                       Circle, Ellipse, Group)
from reportlab.lib import colors

# ---- palette --------------------------------------------------------------
INK      = colors.HexColor("#1d2b3a")
HAIR     = colors.HexColor("#9aa8b6")
SKIN     = colors.HexColor("#e8edf2")
SKIN2    = colors.HexColor("#d6dee7")
WATER    = colors.HexColor("#cfe0ee")
LABEL    = colors.HexColor("#41546a")
TITLE_C  = colors.HexColor("#10263f")

ZONE_COLORS = {
    "110": colors.HexColor("#e8743b"), "120": colors.HexColor("#d64b4b"),
    "200": colors.HexColor("#f0a830"), "300": colors.HexColor("#e6c229"),
    "400": colors.HexColor("#5aa469"), "500": colors.HexColor("#2f8f7a"),
    "600": colors.HexColor("#7d5ba6"), "700": colors.HexColor("#2b7cb8"),
    "800": colors.HexColor("#4a5568"), "900": colors.HexColor("#8fa31e"),
}
ZONE_NAMES = {
    "110": "Nose and forward hull",      "120": "Flight deck",
    "200": "Forward cabin",              "300": "Aft cabin",
    "400": "Underfloor fwd (fwd fr 14)", "500": "Underfloor aft (aft fr 14)",
    "600": "Energy store bay",           "700": "Left and right nacelles",
    "800": "Aft fuselage",               "900": "Wing and empennage",
}
ROUTE_COLORS = {
    "R-1": colors.HexColor("#b3272d"), "R-2": colors.HexColor("#e8743b"),
    "R-3": colors.HexColor("#c8a02c"), "R-4": colors.HexColor("#1f9e8f"),
    "R-5": colors.HexColor("#2b6cb0"), "R-6": colors.HexColor("#6b46a8"),
}
ROUTE_NAMES = {
    "R-1": "HV run A (store -> L nacelle)", "R-2": "HV run B (store -> R nacelle)",
    "R-3": "Turbogenerator feed + fuel",    "R-4": "Coolant ring",
    "R-5": "Channel 1 electrical",          "R-6": "Channel 2 electrical",
}


class Scale:
    """metres -> points, with an origin offset. y is up, as reportlab expects."""
    def __init__(self, k, ox=0.0, oy=0.0):
        self.k, self.ox, self.oy = k, ox, oy
    def x(self, m): return self.ox + m * self.k
    def y(self, m): return self.oy + m * self.k
    def d(self, m): return m * self.k


def txt(g, x, y, s, size=5.2, col=LABEL, anchor="start", bold=False):
    t = String(x, y, s, fontSize=size, fillColor=col,
               fontName="Helvetica-Bold" if bold else "Helvetica")
    t.textAnchor = anchor
    g.add(t)


def frame_title(d, w, title, subtitle=None):
    txt(d, 4, d.height - 9, title, 7.6, TITLE_C, bold=True)
    if subtitle:
        txt(d, 4, d.height - 17.5, subtitle, 5.0, LABEL)


# ===========================================================================
# HA-10 geometry, in metres, from §1.2
# ===========================================================================
LEN, SPAN = 14.2, 19.4
FUS_W = 1.72                    # max hull beam
WING_X, ROOT_C, TIP_C = 4.6, 1.95, 1.20
NAC_Y, NAC_LEN = 3.00, 2.30     # nacelle offset from centreline, length
PROP_D = 2.40
HSTAB_SPAN, HSTAB_C = 6.10, 1.05
FIN_X0, FIN_X1, FIN_H = 11.30, 14.05, 3.15
STEP_X = 6.50                   # planing step, frame 11
BULKHEAD_X = 8.05               # watertight bulkhead, frame 14


def _plan(g, s):
    """Plan view, nose at left, centreline on s.y(0)."""
    hw = FUS_W / 2
    # hull: pointed nose, parallel mid, tapered tail
    pts = []
    for m, w in [(0.0, .10), (0.9, .58), (2.1, .84), (3.4, hw), (9.4, hw),
                 (11.8, .70), (14.2, .26)]:
        pts += [s.x(m), s.y(w)]
    for m, w in [(14.2, -.26), (11.8, -.70), (9.4, -hw), (3.4, -hw),
                 (2.1, -.84), (0.9, -.58), (0.0, -.10)]:
        pts += [s.x(m), s.y(w)]
    g.add(Polygon(pts, fillColor=SKIN, strokeColor=INK, strokeWidth=.6))
    # wing (straight taper, slight sweep on the LE)
    for sgn in (1, -1):
        g.add(Polygon([s.x(WING_X), s.y(sgn * hw),
                       s.x(WING_X + ROOT_C), s.y(sgn * hw),
                       s.x(WING_X + ROOT_C + .34), s.y(sgn * SPAN / 2),
                       s.x(WING_X + ROOT_C + .34 - TIP_C), s.y(sgn * SPAN / 2)],
                      fillColor=SKIN2, strokeColor=INK, strokeWidth=.6))
        # aileron / flap break, so the wing reads as a wing rather than a slab
        g.add(Line(s.x(WING_X + ROOT_C - .30), s.y(sgn * hw),
                   s.x(WING_X + ROOT_C + .34 - .22), s.y(sgn * SPAN / 2),
                   strokeColor=HAIR, strokeWidth=.4))
    # nacelles + propeller discs
    for sgn in (1, -1):
        g.add(Rect(s.x(WING_X - 1.15), s.y(sgn * NAC_Y - .34), s.d(NAC_LEN), s.d(.68),
                   fillColor=SKIN2, strokeColor=INK, strokeWidth=.5))
        g.add(Ellipse(s.x(WING_X - 1.20), s.y(sgn * NAC_Y), s.d(.10), s.d(PROP_D / 2),
                      fillColor=None, strokeColor=HAIR, strokeWidth=.5))
    # T-tail horizontal stabiliser
    g.add(Polygon([s.x(FIN_X1 - HSTAB_C - .35), s.y(HSTAB_SPAN / 2),
                   s.x(FIN_X1 - .05), s.y(HSTAB_SPAN / 2),
                   s.x(FIN_X1 - .05), s.y(-HSTAB_SPAN / 2),
                   s.x(FIN_X1 - HSTAB_C - .35), s.y(-HSTAB_SPAN / 2)],
                  fillColor=SKIN2, strokeColor=INK, strokeWidth=.6))
    g.add(Line(s.x(0), s.y(0), s.x(LEN), s.y(0), strokeColor=HAIR,
               strokeWidth=.35, strokeDashArray=[3, 2]))


def _profile(g, s, waterline=True):
    """Profile view, nose at left, keel around s.y(0)."""
    if waterline:
        g.add(Rect(s.x(-.6), s.y(-.55), s.d(LEN + 1.2), s.d(.55),
                   fillColor=WATER, strokeColor=None))
        g.add(Line(s.x(-.6), s.y(0), s.x(LEN + .6), s.y(0),
                   strokeColor=colors.HexColor("#7fa8c9"), strokeWidth=.5))
    # hull: forebody deeper, single step, afterbody rising to the sternpost
    pts = [s.x(0.0), s.y(1.05), s.x(1.0), s.y(0.42), s.x(2.4), s.y(0.12),
           s.x(STEP_X), s.y(0.02), s.x(STEP_X), s.y(0.42),
           s.x(10.2), s.y(0.72), s.x(12.6), s.y(1.35), s.x(14.2), s.y(1.92),
           s.x(14.2), s.y(2.35), s.x(11.0), s.y(2.52), s.x(6.0), s.y(2.55),
           s.x(2.6), s.y(2.30), s.x(0.9), s.y(1.86), s.x(0.0), s.y(1.05)]
    g.add(Polygon(pts, fillColor=SKIN, strokeColor=INK, strokeWidth=.6))
    # flight deck glazing
    g.add(Polygon([s.x(1.05), s.y(1.95), s.x(2.55), s.y(2.34),
                   s.x(2.55), s.y(2.02), s.x(1.35), s.y(1.72)],
                  fillColor=colors.HexColor("#b9cddd"), strokeColor=INK, strokeWidth=.4))
    # high wing, seen edge-on
    g.add(Rect(s.x(WING_X), s.y(2.52), s.d(ROOT_C), s.d(.30),
               fillColor=SKIN2, strokeColor=INK, strokeWidth=.5))
    # nacelle + prop
    g.add(Rect(s.x(WING_X - 1.15), s.y(2.46), s.d(NAC_LEN), s.d(.62),
               fillColor=SKIN2, strokeColor=INK, strokeWidth=.5))
    g.add(Line(s.x(WING_X - 1.22), s.y(2.77 - PROP_D / 2), s.x(WING_X - 1.22),
               s.y(2.77 + PROP_D / 2), strokeColor=HAIR, strokeWidth=.7))
    # fin + T-tail
    g.add(Polygon([s.x(FIN_X0), s.y(2.45), s.x(FIN_X1 - 1.15), s.y(2.45 + FIN_H),
                   s.x(FIN_X1), s.y(2.45 + FIN_H), s.x(FIN_X1), s.y(2.45)],
                  fillColor=SKIN2, strokeColor=INK, strokeWidth=.6))
    g.add(Rect(s.x(FIN_X1 - 1.35), s.y(2.45 + FIN_H), s.d(HSTAB_C + .30), s.d(.16),
               fillColor=SKIN2, strokeColor=INK, strokeWidth=.5))
    # gear
    for gx, gh in ((2.45, .95), (7.55, 1.05)):
        g.add(Line(s.x(gx), s.y(.30), s.x(gx), s.y(.30 - gh), strokeColor=INK, strokeWidth=.8))
        g.add(Circle(s.x(gx), s.y(.30 - gh - .22), s.d(.24),
                     fillColor=colors.HexColor("#3b4757"), strokeColor=INK, strokeWidth=.4))


def _front(g, s):
    """Front elevation, centreline at s.x(0)."""
    hw = FUS_W / 2
    g.add(Rect(s.x(-.6 - SPAN / 2), s.y(-.55), s.d(SPAN + 1.2), s.d(.55),
               fillColor=WATER, strokeColor=None))
    # hull cross-section: V bottom into a rounded upper
    g.add(Polygon([s.x(0), s.y(0.02), s.x(hw), s.y(1.05), s.x(hw), s.y(2.05),
                   s.x(hw * .55), s.y(2.55), s.x(-hw * .55), s.y(2.55),
                   s.x(-hw), s.y(2.05), s.x(-hw), s.y(1.05)],
                  fillColor=SKIN, strokeColor=INK, strokeWidth=.6))
    # wing with a little dihedral
    for sgn in (1, -1):
        g.add(Polygon([s.x(sgn * hw), s.y(2.56), s.x(sgn * SPAN / 2), s.y(3.10),
                       s.x(sgn * SPAN / 2), s.y(2.86), s.x(sgn * hw), s.y(2.30)],
                      fillColor=SKIN2, strokeColor=INK, strokeWidth=.55))
        # nacelle + propeller disc
        g.add(Rect(s.x(sgn * NAC_Y - .34), s.y(2.46), s.d(.68), s.d(.62),
                   fillColor=SKIN2, strokeColor=INK, strokeWidth=.5))
        g.add(Circle(s.x(sgn * NAC_Y), s.y(2.77), s.d(PROP_D / 2),
                     fillColor=None, strokeColor=HAIR, strokeWidth=.55))
        g.add(Line(s.x(sgn * 1.55), s.y(.34), s.x(sgn * 1.55), s.y(-.62),
                   strokeColor=INK, strokeWidth=.8))
        g.add(Circle(s.x(sgn * 1.55), s.y(-.84), s.d(.24),
                     fillColor=colors.HexColor("#3b4757"), strokeColor=INK, strokeWidth=.4))
    # fin
    g.add(Polygon([s.x(-.10), s.y(2.55), s.x(.10), s.y(2.55),
                   s.x(.10), s.y(5.60), s.x(-.10), s.y(5.60)],
                  fillColor=SKIN2, strokeColor=INK, strokeWidth=.5))
    g.add(Rect(s.x(-HSTAB_SPAN / 2), s.y(5.60), s.d(HSTAB_SPAN), s.d(.14),
               fillColor=SKIN2, strokeColor=INK, strokeWidth=.5))


def _bounds_ok(d, name, pad=2):
    """A shape that escapes the frame overlaps the next figure on the page and is
    invisible in review until someone looks at a rendered page. The first cut of
    these drawings did exactly that — the plan-view wing ran off the top. Cheap
    to check, so check."""
    try:
        x0, y0, x1, y1 = d.getBounds()
    except Exception:
        return
    if x0 < -pad or y0 < -pad or x1 > d.width + pad or y1 > d.height + pad:
        raise SystemExit("figure %s escapes its frame: bounds=(%.1f,%.1f)-(%.1f,%.1f) "
                         "frame=%dx%d" % (name, x0, y0, x1, y1, d.width, d.height))


def general_arrangement(w=470, h=430):
    """Figure 1-1 — plan, profile and front elevation at one common scale.

    Span (19.4 m) exceeds length (14.2 m) on this aircraft, so the PLAN is the
    tallest view and gets the top half to itself; profile and front elevation
    share the bottom. One scale throughout, so the three can be measured against
    each other and against §1.2."""
    d = Drawing(w, h)
    d.add(Rect(0, 0, w, h, fillColor=colors.HexColor("#fbfcfd"),
               strokeColor=colors.HexColor("#dfe4ea"), strokeWidth=.5))
    frame_title(d, w, "HALCYON HA-10  \u00b7  General Arrangement",
                "Plan, profile and front elevation to the dimensions of \u00a71.2, one common scale. "
                "Fictional demonstration article.")
    k = 12.4

    # ---- PLAN: nose left, span vertical, in the upper band ----
    plan_cy = h - 40 - (SPAN / 2) * k
    gp = Group(); _plan(gp, Scale(k, 20, plan_cy)); d.add(gp)
    txt(d, 20, h - 32, "PLAN", 5.8, TITLE_C, bold=True)

    # notes block, in the space the plan does not use
    nx = 20 + LEN * k + 26
    ny = h - 46
    txt(d, nx, ny, "PRINCIPAL DIMENSIONS", 5.4, TITLE_C, bold=True); ny -= 10
    for a, b in [("Span", "19.4 m"), ("Length", "14.2 m"), ("Max beam", "1.72 m"),
                 ("Propeller diameter", "2.40 m"), ("Planing step", "frame 11"),
                 ("Watertight bulkhead", "frame 14"), ("Occupants", "10 (2 flight crew)"),
                 ("MTOW", "5,700 kg")]:
        txt(d, nx, ny, a, 4.8, LABEL); txt(d, nx + 108, ny, b, 4.8, INK, bold=True); ny -= 8.6
    ny -= 4
    txt(d, nx, ny, "The isometric view of the Aeolus general", 4.6, HAIR); ny -= 7
    txt(d, nx, ny, "arrangement has no counterpart here: these", 4.6, HAIR); ny -= 7
    txt(d, nx, ny, "are drawn views, not a render.", 4.6, HAIR)

    # ---- PROFILE, lower left ----
    gr = Group(); _profile(gr, Scale(k, 20, 40)); d.add(gr)
    txt(d, 20, 132, "PROFILE", 5.8, TITLE_C, bold=True)

    # ---- FRONT ELEVATION, lower right ----
    fx = 20 + LEN * k + 26 + (SPAN / 2) * k * .78
    gf = Group(); _front(gf, Scale(k * .78, fx, 44)); d.add(gf)
    txt(d, fx - (SPAN / 2) * k * .78, 132, "FRONT ELEVATION", 5.8, TITLE_C, bold=True)

    _bounds_ok(d, "1-1 general arrangement")
    return d


# ===========================================================================
# Figure 6-1 — zonal model
# ===========================================================================
# (zone code, view, x0, x1, y0, y1) in metres on the profile; plan-only zones
# are drawn on the plan view instead.
PROFILE_ZONES = [
    ("110", 0.00, 2.40, 0.10, 2.30), ("120", 1.05, 2.90, 1.95, 2.55),
    ("200", 2.90, 5.90, 1.30, 2.55), ("300", 5.90, 8.60, 1.30, 2.55),
    ("400", 1.40, BULKHEAD_X, 0.10, 1.30), ("500", BULKHEAD_X, 11.00, 0.45, 1.30),
    ("600", 5.40, 7.60, 0.55, 1.28), ("800", 11.00, 14.20, 1.35, 2.50),
]
PLAN_ZONES = [("700", "nacelles"), ("900", "wing and empennage")]

# route polylines on the profile, in metres
PROFILE_ROUTES = {
    "R-1": [(6.5, 1.05), (5.0, 1.15), (4.9, 2.60), (3.4, 2.72)],
    "R-2": [(6.5, 0.95), (9.0, 1.05), (9.2, 2.60), (3.4, 2.62)],
    "R-3": [(12.6, 1.90), (9.5, 1.60), (7.4, 1.20)],
    "R-4": [(12.4, 1.75), (6.6, 1.00), (4.9, 2.52), (3.4, 2.66)],
    "R-5": [(2.2, 2.15), (4.6, 2.44), (6.4, 1.22)],
    "R-6": [(2.2, 2.05), (7.2, 2.30), (10.6, 2.20)],
}


def zonal_model(w=470, h=330):
    """Figure 6-1 — ten zones, with the §4 routings.

    The PROFILE carries eight of the ten zones and gets the space; the plan is a
    small inset for the two that only exist there (nacelles and wing). The first
    cut gave both views the same scale and the plan-view wing ran off the top of
    the frame and over the title — which is what _bounds_ok now refuses."""
    d = Drawing(w, h)
    d.add(Rect(0, 0, w, h, fillColor=colors.HexColor("#fbfcfd"),
               strokeColor=colors.HexColor("#dfe4ea"), strokeWidth=.5))
    frame_title(d, w, "HALCYON HA-10  \u00b7  Zonal Model",
                "Ten zones per \u00a73, with the zone-spanning routings of \u00a74 drawn over the profile.")
    legend_w = 138
    body_w = w - legend_w - 20

    # ---- PROFILE, the main view ----
    k = 17.0
    sr = Scale(k, 18, h - 150)
    gr = Group(); _profile(gr, sr, waterline=True)
    for code, x0, x1, y0, y1 in PROFILE_ZONES:
        gr.add(Rect(sr.x(x0), sr.y(y0), sr.d(x1 - x0), sr.d(y1 - y0),
                    fillColor=ZONE_COLORS[code], strokeColor=None, fillOpacity=.42))
        txt(gr, sr.x((x0 + x1) / 2), sr.y((y0 + y1) / 2) - 2, code, 4.8,
            colors.HexColor("#12202e"), anchor="middle", bold=True)
    gr.add(Line(sr.x(BULKHEAD_X), sr.y(0.05), sr.x(BULKHEAD_X), sr.y(2.60),
                strokeColor=colors.HexColor("#b3272d"), strokeWidth=1.0,
                strokeDashArray=[2.5, 1.8]))
    txt(gr, sr.x(BULKHEAD_X), sr.y(2.76), "watertight bulkhead, frame 14", 4.6,
        colors.HexColor("#b3272d"), anchor="middle", bold=True)
    for rid, pts in PROFILE_ROUTES.items():
        flat = []
        for mx, my in pts: flat += [sr.x(mx), sr.y(my)]
        gr.add(PolyLine(flat, strokeColor=ROUTE_COLORS[rid], strokeWidth=1.2))
    d.add(gr)
    txt(d, 18, h - 40, "PROFILE \u2014 zones and the routings that cross them", 5.8, TITLE_C, bold=True)

    # ---- PLAN inset, for the two zones that only exist there ----
    kp = 5.9
    sp = Scale(kp, 18, 74)
    gp = Group(); _plan(gp, sp)
    for sgn in (1, -1):
        gp.add(Rect(sp.x(WING_X - 1.15), sp.y(sgn * NAC_Y - .34), sp.d(NAC_LEN), sp.d(.68),
                    fillColor=ZONE_COLORS["700"], strokeColor=None, fillOpacity=.65))
        gp.add(Polygon([sp.x(WING_X + .55), sp.y(sgn * 1.9),
                        sp.x(WING_X + ROOT_C + .34), sp.y(sgn * 1.9),
                        sp.x(WING_X + ROOT_C + .34), sp.y(sgn * SPAN / 2),
                        sp.x(WING_X + ROOT_C + .34 - TIP_C), sp.y(sgn * SPAN / 2)],
                       fillColor=ZONE_COLORS["900"], strokeColor=None, fillOpacity=.50))
    d.add(gp)
    txt(d, 18, 136, "PLAN \u2014 the two zones that exist only here", 5.8, TITLE_C, bold=True)
    txt(d, 18 + LEN * kp + 14, 96, "700  nacelles", 4.8, LABEL)
    txt(d, 18 + LEN * kp + 14, 87, "900  wing and empennage", 4.8, LABEL)
    txt(d, 18 + LEN * kp + 14, 74, "Every other zone is a volume in the", 4.5, HAIR)
    txt(d, 18 + LEN * kp + 14, 66, "hull and is shown on the profile.", 4.5, HAIR)

    # ---- legends ----
    lx = w - legend_w + 6
    ly = h - 44
    txt(d, lx, ly, "ZONES", 5.4, TITLE_C, bold=True); ly -= 9.5
    for code in ["110", "120", "200", "300", "400", "500", "600", "700", "800", "900"]:
        d.add(Rect(lx, ly - 3.4, 6, 5, fillColor=ZONE_COLORS[code], strokeColor=None))
        txt(d, lx + 9, ly - 2.6, code + "  " + ZONE_NAMES[code], 4.5, LABEL)
        ly -= 8.4
    ly -= 8
    txt(d, lx, ly, "ZONE-SPANNING ROUTINGS", 5.4, TITLE_C, bold=True); ly -= 9.5
    for rid in ["R-1", "R-2", "R-3", "R-4", "R-5", "R-6"]:
        d.add(Line(lx, ly - 1.2, lx + 7, ly - 1.2, strokeColor=ROUTE_COLORS[rid], strokeWidth=1.3))
        txt(d, lx + 10, ly - 2.6, rid + "  " + ROUTE_NAMES[rid], 4.5, LABEL)
        ly -= 8.4

    _bounds_ok(d, "6-1 zonal model")
    return d
