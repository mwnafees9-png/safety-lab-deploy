# -*- coding: utf-8 -*-
"""Aircraft views for VAY-SDD-0001 - Vayu VY-6.

Drawn 2D engineering views, vector, from the dimensions in section 1.2. There is
no isometric and no render: a drawn view is honest about being a drawing.

Geometry is in METRES throughout and mapped to the page by one scale per figure,
so a wrong picture is a wrong dimension rather than a wrong coordinate.
"""
from reportlab.graphics.shapes import (Drawing, Rect, Line, String, Polygon, PolyLine,
                                       Circle, Ellipse, Group)
from reportlab.lib import colors

INK     = colors.HexColor("#1d2b3a")
HAIR    = colors.HexColor("#9aa8b6")
SKIN    = colors.HexColor("#e8edf2")
ROTOR   = colors.HexColor("#dbe6f0")
LABEL   = colors.HexColor("#41546a")
TITLE_C = colors.HexColor("#10263f")

ZONE_COLORS = {
    "100": colors.HexColor("#cfe0ee"), "200": colors.HexColor("#d6e8dc"),
    "300": colors.HexColor("#efe2cc"), "400": colors.HexColor("#e2dcef"),
    "500": colors.HexColor("#e2dcef"), "600": colors.HexColor("#f0dede"),
    "700": colors.HexColor("#f0dede"), "800": colors.HexColor("#e6dff0"),
    "900": colors.HexColor("#dde6ea"), "1000": colors.HexColor("#e9e4d6"),
}
ZONE_NAMES = {
    "100": "Flight deck", "200": "Cabin", "300": "Aft equipment bay",
    "400": "Left boom", "500": "Right boom", "600": "Left wing",
    "700": "Right wing", "800": "Underfloor battery bay", "900": "V-tail",
    "1000": "Gear bays",
}
ROUTE_COLORS = {
    "R-1": colors.HexColor("#b3272d"), "R-2": colors.HexColor("#d2691e"),
    "R-3": colors.HexColor("#2b6cb0"), "R-4": colors.HexColor("#1f9e8f"),
    "R-5": colors.HexColor("#7b8794"), "R-6": colors.HexColor("#7d5ba6"),
}
ROUTE_NAMES = {
    "R-1": "HV to booms", "R-2": "HV to wing", "R-3": "LV distribution",
    "R-4": "Coolant", "R-5": "Data bus A", "R-6": "Data bus B",
}

# ---- principal dimensions, metres (section 1.2) ---------------------------
LEN      = 10.40        # nose to tail
SPAN     = 15.00        # wing span
HEIGHT   = 3.60         # ground to fin tip
FUS_W    = 1.90         # max fuselage width
BOOM_Y   = 2.60         # boom centreline offset from aircraft centreline
BOOM_X0  = 1.80
BOOM_X1  = 9.40
LIFT_D   = 2.00         # lift rotor diameter
LIFT_X   = [2.10, 4.20, 7.00, 9.10]   # stations clear of the wing chord
CRUISE_D = 1.90
CRUISE_Y = 5.40
CRUISE_X = 4.30
WING_X0  = 4.55         # wing leading edge at root
WING_C   = 1.35         # root chord
TAIL_X0  = 9.30


def txt(g, x, y, s, size=5.2, col=LABEL, anchor="start", bold=False):
    t = String(x, y, s, fontSize=size, fillColor=col,
               fontName="Helvetica-Bold" if bold else "Helvetica")
    t.textAnchor = anchor
    g.add(t)


def frame_title(d, w, title, subtitle=None):
    txt(d, 4, d.height - 9, title, 7.6, TITLE_C, bold=True)
    if subtitle:
        txt(d, 4, d.height - 17.5, subtitle, 5.0, LABEL)


def _bounds_ok(d, name, pad=2):
    """A shape that escapes the frame overlaps the next figure on the page and is
    invisible in review until somebody looks at a rendered page. Cheap to check."""
    try:
        x0, y0, x1, y1 = d.getBounds()
    except Exception:
        return
    if x0 < -pad or y0 < -pad or x1 > d.width + pad or y1 > d.height + pad:
        raise SystemExit("figure %s escapes its frame: bounds=(%.1f,%.1f)-(%.1f,%.1f) "
                         "frame=%dx%d" % (name, x0, y0, x1, y1, d.width, d.height))


def _rotor(g, cx, cy, r, edge_on=False):
    if edge_on:
        g.add(Ellipse(cx, cy, r, r * 0.10, fillColor=ROTOR, strokeColor=HAIR, strokeWidth=.5))
    else:
        g.add(Circle(cx, cy, r, fillColor=None, strokeColor=HAIR, strokeWidth=.5,
                     strokeDashArray=[2, 1.6]))
        g.add(Line(cx - r * .82, cy, cx + r * .82, cy, strokeColor=INK, strokeWidth=1.0))
        g.add(Circle(cx, cy, r * .10, fillColor=INK, strokeColor=INK))


def _plan(g, s, ox, oy):
    """Top view. x aft along the fuselage, y to the right wing."""
    def X(m): return ox + m * s
    def Y(m): return oy + m * s

    # wing
    g.add(Rect(X(WING_X0), Y(-SPAN / 2), WING_C * s, SPAN * s,
               fillColor=SKIN, strokeColor=INK, strokeWidth=.7))
    # booms
    for sgn in (-1, 1):
        g.add(Rect(X(BOOM_X0), Y(sgn * BOOM_Y - 0.16), (BOOM_X1 - BOOM_X0) * s, 0.32 * s,
                   fillColor=SKIN, strokeColor=INK, strokeWidth=.6))
    # fuselage: pointed nose, parallel mid, tapered tail boom
    hw = FUS_W / 2
    fus = [X(0.00), Y(0.00), X(0.55), Y(-hw * .55), X(1.50), Y(-hw),
           X(6.60), Y(-hw), X(9.30), Y(-hw * .34), X(LEN), Y(-hw * .16),
           X(LEN), Y(hw * .16), X(9.30), Y(hw * .34), X(6.60), Y(hw),
           X(1.50), Y(hw), X(0.55), Y(hw * .55)]
    g.add(Polygon(fus, fillColor=SKIN, strokeColor=INK, strokeWidth=.9))
    # V-tail, planform
    for sgn in (-1, 1):
        g.add(Polygon([X(TAIL_X0), Y(sgn * 0.18), X(LEN), Y(sgn * 1.55),
                       X(LEN), Y(sgn * 1.95), X(TAIL_X0 + 0.55), Y(sgn * 0.20)],
                      fillColor=SKIN, strokeColor=INK, strokeWidth=.7))
    # lift rotors
    for sgn in (-1, 1):
        for lx in LIFT_X:
            _rotor(g, X(lx), Y(sgn * BOOM_Y), LIFT_D / 2 * s)
    # cruise propellers
    for sgn in (-1, 1):
        _rotor(g, X(CRUISE_X), Y(sgn * CRUISE_Y), CRUISE_D / 2 * s)
    # cabin outline
    g.add(Rect(X(1.70), Y(-hw * .78), 3.30 * s, hw * 1.56 * s,
               fillColor=None, strokeColor=HAIR, strokeWidth=.4, strokeDashArray=[2, 2]))
    # dimension: span
    yd = Y(-SPAN / 2) - 11
    g.add(Line(X(WING_X0 + WING_C / 2), yd, X(WING_X0 + WING_C / 2), Y(-SPAN / 2),
               strokeColor=HAIR, strokeWidth=.4))
    txt(g, X(WING_X0 + WING_C / 2) + 3, yd + 2, "span 15.00 m", 5.0, LABEL)
    txt(g, X(0.1), Y(SPAN / 2) + 4, "PLAN", 6.2, TITLE_C, bold=True)


def _profile(g, s, ox, oy):
    """Side view. Ground line at oy."""
    def X(m): return ox + m * s
    def Z(m): return oy + m * s

    gnd = 0.62                      # ground clearance to fuselage underside
    top = gnd + 1.62
    g.add(Line(X(-0.3), Z(0), X(LEN + 0.3), Z(0), strokeColor=HAIR, strokeWidth=.6))
    body = [X(0.00), Z(gnd + 0.72), X(0.60), Z(top - 0.10), X(1.70), Z(top),
            X(6.40), Z(top), X(9.20), Z(top - 0.34), X(LEN), Z(top - 0.46),
            X(LEN), Z(gnd + 0.70), X(9.20), Z(gnd + 0.16), X(6.40), Z(gnd),
            X(1.60), Z(gnd), X(0.55), Z(gnd + 0.26)]
    g.add(Polygon(body, fillColor=SKIN, strokeColor=INK, strokeWidth=.9))
    # windows
    for i in range(4):
        g.add(Rect(X(2.10 + i * 1.05), Z(top - 0.72), 0.72 * s, 0.44 * s,
                   fillColor=colors.HexColor("#cfe0ee"), strokeColor=HAIR, strokeWidth=.4))
    g.add(Polygon([X(0.62), Z(top - 0.06), X(1.55), Z(top - 0.04), X(1.55), Z(top - 0.66),
                   X(0.70), Z(top - 0.58)], fillColor=colors.HexColor("#cfe0ee"),
                  strokeColor=HAIR, strokeWidth=.4))
    # wing, edge on
    g.add(Rect(X(WING_X0), Z(top - 0.08), WING_C * s, 0.20 * s,
               fillColor=SKIN, strokeColor=INK, strokeWidth=.7))
    # boom, side
    g.add(Rect(X(BOOM_X0), Z(top - 0.30), (BOOM_X1 - BOOM_X0) * s, 0.26 * s,
               fillColor=colors.HexColor("#dfe6ee"), strokeColor=INK, strokeWidth=.6))
    # lift rotors edge on, above the boom
    for lx in LIFT_X:
        _rotor(g, X(lx), Z(top + 0.10), LIFT_D / 2 * s, edge_on=True)
    # cruise prop edge on
    _rotor(g, X(CRUISE_X), Z(top + 0.02), CRUISE_D / 2 * s, edge_on=True)
    # V-tail, side
    g.add(Polygon([X(TAIL_X0), Z(top - 0.30), X(LEN), Z(top + 1.10),
                   X(LEN), Z(top + 1.46), X(TAIL_X0 + 0.55), Z(top - 0.26)],
                  fillColor=SKIN, strokeColor=INK, strokeWidth=.7))
    # battery bay, underfloor
    g.add(Rect(X(2.40), Z(gnd - 0.02), 3.60 * s, 0.30 * s,
               fillColor=colors.HexColor("#e6dff0"), strokeColor=INK, strokeWidth=.5))
    txt(g, X(4.20), Z(gnd + 0.06), "BATTERY BAY", 4.4, LABEL, anchor="middle")
    # gear
    for wx in (1.55, 6.20, 7.40):
        g.add(Line(X(wx), Z(gnd), X(wx), Z(0.30), strokeColor=INK, strokeWidth=1.0))
        g.add(Circle(X(wx), Z(0.30), 0.30 * s, fillColor=colors.HexColor("#4a5568"),
                     strokeColor=INK, strokeWidth=.5))
    txt(g, X(0.1), Z(top + 1.62), "PROFILE", 6.2, TITLE_C, bold=True)
    txt(g, X(LEN) + 4, Z(0.10), "length 10.40 m", 5.0, LABEL)


def _front(g, s, ox, oy):
    """Front elevation. Centreline at ox, ground at oy."""
    def Y(m): return ox + m * s
    def Z(m): return oy + m * s

    gnd, top = 0.62, 2.24
    g.add(Line(Y(-SPAN / 2 - 0.3), Z(0), Y(SPAN / 2 + 0.3), Z(0), strokeColor=HAIR, strokeWidth=.6))
    # wing
    g.add(Rect(Y(-SPAN / 2), Z(top - 0.10), SPAN * s, 0.20 * s,
               fillColor=SKIN, strokeColor=INK, strokeWidth=.7))
    # fuselage section
    hw = FUS_W / 2
    g.add(Polygon([Y(-hw), Z(gnd + 0.30), Y(-hw * .80), Z(top - 0.02), Y(hw * .80), Z(top - 0.02),
                   Y(hw), Z(gnd + 0.30), Y(hw * .70), Z(gnd), Y(-hw * .70), Z(gnd)],
                  fillColor=SKIN, strokeColor=INK, strokeWidth=.9))
    # booms and lift rotors edge on
    for sgn in (-1, 1):
        g.add(Rect(Y(sgn * BOOM_Y - 0.15), Z(top - 0.36), 0.30 * s, 0.24 * s,
                   fillColor=colors.HexColor("#dfe6ee"), strokeColor=INK, strokeWidth=.6))
        _rotor(g, Y(sgn * BOOM_Y), Z(top + 0.06), LIFT_D / 2 * s, edge_on=True)
        _rotor(g, Y(sgn * CRUISE_Y), Z(top - 0.02), CRUISE_D / 2 * s, edge_on=True)
        g.add(Line(Y(sgn * 0.70), Z(gnd), Y(sgn * 0.70), Z(0.30), strokeColor=INK, strokeWidth=1.0))
        g.add(Circle(Y(sgn * 0.70), Z(0.30), 0.30 * s, fillColor=colors.HexColor("#4a5568"),
                     strokeColor=INK, strokeWidth=.5))
    txt(g, Y(-SPAN / 2), Z(top + 0.62), "FRONT", 6.2, TITLE_C, bold=True)
    txt(g, Y(SPAN / 2) - 2, Z(top + 0.62), "height 3.60 m", 5.0, LABEL, anchor="end")


def general_arrangement(w=470, h=430):
    """Three views at ONE scale. Plan fills the left column; profile and front
    stack in the right column. The first cut stacked all three and they overlapped
    - the span is 15 m against a 10.4 m length, so the plan view is the tall one
    and it does not leave room for the other two beneath it."""
    d = Drawing(w, h)
    d.add(Rect(0, 0, w, h, fillColor=colors.HexColor("#fbfcfd"),
               strokeColor=colors.HexColor("#dfe4ea"), strokeWidth=.5))
    frame_title(d, w, "Vayu VY-6 General Arrangement",
                "Plan, profile and front elevation at one common scale. Dimensions per section 1.2.")

    s = 15.0                       # px per metre, common to all three views
    # left column: plan, centreline at mid height
    _plan(d, s, ox=34, oy=196)
    # right column: front elevation above, profile below
    _front(d, s, ox=326, oy=284)
    _profile(d, s, ox=244, oy=96)

    d.add(Line(228, 40, 228, h - 46, strokeColor=colors.HexColor("#e6ebf0"), strokeWidth=.6))
    _bounds_ok(d, "general_arrangement")
    return d


# ---- zonal model ----------------------------------------------------------
PROFILE_ZONES = [
    ("100", 0.30, 1.75), ("200", 1.75, 5.05), ("300", 5.05, 6.60),
    ("800", 2.40, 6.00), ("900", 9.30, 10.40),
]
BOOM_ZONES = [("400", "left boom"), ("500", "right boom")]
WING_ZONES = [("600", "left wing"), ("700", "right wing")]

PROFILE_ROUTES = [
    ("R-1", 1.72, 1.95, 6.95),
    ("R-2", 1.50, 2.30, 5.05),
    ("R-3", 1.28, 1.15, 9.15),
    ("R-4", 1.06, 2.50, 7.25),
    ("R-5", 0.84, 1.05, 9.60),
    ("R-6", 0.62, 1.05, 8.30),
]


def zonal_model(w=470, h=300):
    """Profile with the zone bands behind it and the routings of section 4 over it.

    The first cut drew this at half the scale in a 330-high frame: the bands were
    too shallow to label, the six routings sat 4 px apart, and the top third of
    the figure was empty. Bigger, shorter, and the legend directly beneath."""
    d = Drawing(w, h)
    d.add(Rect(0, 0, w, h, fillColor=colors.HexColor("#fbfcfd"),
               strokeColor=colors.HexColor("#dfe4ea"), strokeWidth=.5))
    frame_title(d, w, "Zonal Model",
                "Ten zones per section 3, with the zone-spanning routings of section 4 over the profile.")

    s = 33.0
    ox, oy = 26, 150
    def X(m): return ox + m * s
    def Z(m): return oy + m * s

    gnd, top = 0.30, 2.05

    # zone bands behind the aircraft
    for zid, x0, x1 in PROFILE_ZONES:
        if zid == "800":
            z0, z1 = gnd - 0.34, gnd + 0.02
        elif zid == "900":
            z0, z1 = top - 0.12, top + 0.72
        else:
            z0, z1 = gnd, top
        d.add(Rect(X(x0), Z(z0), (x1 - x0) * s, (z1 - z0) * s,
                   fillColor=ZONE_COLORS[zid], strokeColor=HAIR, strokeWidth=.4))
    # boom band above, wing band inboard
    d.add(Rect(X(BOOM_X0), Z(top + 0.14), (BOOM_X1 - BOOM_X0) * s, 0.30 * s,
               fillColor=ZONE_COLORS["400"], strokeColor=HAIR, strokeWidth=.4))
    d.add(Rect(X(WING_X0), Z(top - 0.34), WING_C * s, 0.34 * s,
               fillColor=ZONE_COLORS["600"], strokeColor=HAIR, strokeWidth=.4))
    # gear bays
    for gx0, gx1 in ((1.25, 1.85), (5.95, 7.65)):
        d.add(Rect(X(gx0), Z(gnd - 0.34), (gx1 - gx0) * s, 0.34 * s,
                   fillColor=ZONE_COLORS["1000"], strokeColor=HAIR, strokeWidth=.4))

    # aircraft outline over the bands
    d.add(PolyLine([X(0.00), Z(gnd + 0.74), X(0.60), Z(top - 0.06), X(1.70), Z(top),
                    X(6.40), Z(top), X(9.20), Z(top - 0.30), X(10.40), Z(top - 0.42),
                    X(10.40), Z(gnd + 0.70), X(9.20), Z(gnd + 0.16), X(6.40), Z(gnd),
                    X(1.60), Z(gnd), X(0.55), Z(gnd + 0.26), X(0.00), Z(gnd + 0.74)],
                   strokeColor=INK, strokeWidth=1.1))

    # routings over the outline
    for rid, z, x0, x1 in PROFILE_ROUTES:
        d.add(Line(X(x0), Z(z), X(x1), Z(z), strokeColor=ROUTE_COLORS[rid], strokeWidth=1.4))
        txt(d, X(x1) + 3, Z(z) - 1.8, rid, 5.0, ROUTE_COLORS[rid], bold=True)

    # zone ids, on top of everything
    for zid, xm, zm in (("100", 1.00, gnd + 0.14), ("200", 3.35, gnd + 0.14),
                        ("300", 5.80, gnd + 0.14), ("800", 4.20, gnd - 0.20),
                        ("900", 9.85, top + 0.34), ("1000", 6.80, gnd - 0.20)):
        txt(d, X(xm), Z(zm), zid, 5.8, TITLE_C, anchor="middle", bold=True)
    txt(d, X(BOOM_X0) - 4, Z(top + 0.24), "400 / 500", 5.4, TITLE_C, anchor="end", bold=True)
    txt(d, X(WING_X0 + WING_C) + 4, Z(top - 0.22), "600 / 700", 5.4, TITLE_C, bold=True)

    # legend beneath
    lx, ly = 26, 108
    txt(d, lx, ly, "ZONES", 5.8, TITLE_C, bold=True)
    for i, zid in enumerate(["100", "200", "300", "400", "500", "600", "700", "800", "900", "1000"]):
        x = lx + (i % 2) * 224
        y = ly - 13 - (i // 2) * 11.5
        d.add(Rect(x, y - 1, 8, 7, fillColor=ZONE_COLORS[zid], strokeColor=HAIR, strokeWidth=.4))
        txt(d, x + 12, y, "%s  %s" % (zid, ZONE_NAMES[zid]), 5.4, LABEL)
    txt(d, lx, ly - 82, "ZONE-SPANNING ROUTINGS", 5.8, TITLE_C, bold=True)
    for i, rid in enumerate(["R-1", "R-2", "R-3", "R-4", "R-5", "R-6"]):
        x = lx + (i % 3) * 150
        y = ly - 95 - (i // 3) * 11.5
        d.add(Line(x, y + 2, x + 12, y + 2, strokeColor=ROUTE_COLORS[rid], strokeWidth=1.5))
        txt(d, x + 16, y, "%s  %s" % (rid, ROUTE_NAMES[rid]), 5.4, LABEL)

    _bounds_ok(d, "zonal_model")
    return d
