# -*- coding: utf-8 -*-
"""Standalone landscape drawing sheets for VAY-HF-0001 - Vayu VY-6.

Three sheets, each written as its own A4 landscape PDF so the LaTeX build can
drop them in as full-page figures and so each can be issued as a drawing sheet on
its own, which is how the Aeolus HF document does it.

    fig_vayu_flightdeck.pdf   HF-1  panel arrangement, zones and item callouts
    fig_vayu_cockpit_ga.pdf   HF-2  cockpit GA - plan and side section, geometry
                                    reference scheme, vision angles
    fig_vayu_controls.pdf     HF-3  the controls themselves - inceptor, energy
                                    lever, guarded recovery handle, bezel keys

DISCIPLINE. These drawings show WHAT IS THERE and WHERE. They classify nothing:
no alert priority tier, no severity, no workload, no allocation. Where a
dimension is not defined it is drawn as a labelled leader with TBD against it,
because a named gap is the correct answer and an invented number is not.

Run:  python3 fig_hf_sheets.py
"""
from reportlab import rl_config
rl_config.invariant = 1

from reportlab.lib.pagesizes import A4, landscape
from reportlab.graphics.shapes import (Drawing, Rect, Line, String, Polygon, PolyLine,
                                       Circle, Ellipse, Wedge)
from reportlab.graphics import renderPDF
from reportlab.lib import colors
import math

W, H = landscape(A4)          # 842 x 595 pt

INK    = colors.HexColor("#1d2b3a")
HAIR   = colors.HexColor("#9aa8b6")
LABEL  = colors.HexColor("#41546a")
TITLE_C= colors.HexColor("#10263f")
GLASS  = colors.HexColor("#dbe6f0")
PANEL  = colors.HexColor("#eceff3")
METAL  = colors.HexColor("#e2e7ec")
SEATC  = colors.HexColor("#e6ded2")
GUARD  = colors.HexColor("#f6e6c8")
GUARD_S= colors.HexColor("#c8a02c")
TBDC   = colors.HexColor("#b3272d")
BG     = colors.HexColor("#fdfdfe")


def txt(d, x, y, s, size=6.0, col=LABEL, anchor="start", bold=False):
    t = String(x, y, s, fontSize=size, fillColor=col,
               fontName="Helvetica-Bold" if bold else "Helvetica")
    t.textAnchor = anchor
    d.add(t)


def sheet(title, subtitle, number):
    """Border and title block, common to all three sheets."""
    d = Drawing(W, H)
    d.add(Rect(0, 0, W, H, fillColor=BG, strokeColor=None))
    d.add(Rect(18, 18, W - 36, H - 36, fillColor=None, strokeColor=INK, strokeWidth=1.0))
    d.add(Rect(20, 20, W - 40, H - 40, fillColor=None, strokeColor=HAIR, strokeWidth=.4))
    # title block, lower right
    tb_w, tb_h = 300, 62
    x0, y0 = W - 18 - tb_w, 18
    d.add(Rect(x0, y0, tb_w, tb_h, fillColor=colors.white, strokeColor=INK, strokeWidth=.9))
    d.add(Line(x0, y0 + 40, x0 + tb_w, y0 + 40, strokeColor=INK, strokeWidth=.6))
    d.add(Line(x0, y0 + 20, x0 + tb_w, y0 + 20, strokeColor=HAIR, strokeWidth=.4))
    d.add(Line(x0 + 196, y0, x0 + 196, y0 + 40, strokeColor=HAIR, strokeWidth=.4))
    txt(d, x0 + 8, y0 + 48, title, 9.4, TITLE_C, bold=True)
    txt(d, x0 + 8, y0 + 28, subtitle, 6.2, LABEL)
    txt(d, x0 + 8, y0 + 8, "Vayu VY-6 - VAY-HF-0001 - Issue 1", 6.0, LABEL)
    txt(d, x0 + 204, y0 + 28, "SHEET", 5.4, LABEL)
    txt(d, x0 + 204, y0 + 8, number, 12.0, TITLE_C, bold=True)
    # demonstration notice, lower left
    txt(d, 26, 26, "Demonstration article - representative design, not manufacturer data. "
                   "Dimensions marked TBD are undefined by design and are listed in VAY-HF-0001 section 11.2.",
        5.6, LABEL)
    return d


def legend(d, x, y, rows, title="KEY"):
    txt(d, x, y, title, 6.4, TITLE_C, bold=True)
    for i, (num, name) in enumerate(rows):
        yy = y - 11 - i * 9.4
        d.add(Circle(x + 4, yy + 2, 4.6, fillColor=colors.white, strokeColor=INK, strokeWidth=.6))
        txt(d, x + 4, yy, str(num), 4.8, INK, anchor="middle", bold=True)
        txt(d, x + 13, yy, name, 5.8, LABEL)


def callout(d, x, y, num, tx, ty):
    """A numbered balloon at (x,y) with a leader to the item at (tx,ty)."""
    d.add(Line(x, y, tx, ty, strokeColor=HAIR, strokeWidth=.5))
    d.add(Circle(x, y, 5.6, fillColor=colors.white, strokeColor=INK, strokeWidth=.7))
    txt(d, x, y - 2, str(num), 5.4, INK, anchor="middle", bold=True)


def tbd(d, x, y, text, anchor="start"):
    txt(d, x, y, text, 5.6, TBDC, anchor=anchor, bold=True)


def dim_line(d, x0, y0, x1, y1, label, off=0, col=HAIR):
    d.add(Line(x0, y0, x1, y1, strokeColor=col, strokeWidth=.4))
    for (px, py) in ((x0, y0), (x1, y1)):
        d.add(Circle(px, py, 1.2, fillColor=col, strokeColor=col))
    mx, my = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    txt(d, mx, my + 2 + off, label, 5.4, LABEL, anchor="middle")


# =========================================================================
# HF-1  Flight deck panel arrangement
# =========================================================================
def flight_deck_sheet():
    d = sheet("FLIGHT DECK PANEL ARRANGEMENT",
              "Panel zones, display and control positions.", "HF-1")

    cx = 330.0                     # panel centreline on the sheet
    base = 150.0                   # panel bottom

    # ---- overhead panel -------------------------------------------------
    d.add(Rect(cx - 150, 470, 300, 62, fillColor=PANEL, strokeColor=INK, strokeWidth=.9, rx=4, ry=4))
    txt(d, cx, 522, "OVERHEAD PANEL", 7.0, TITLE_C, anchor="middle", bold=True)
    ov = [("ELEC", "HV bus tie, pack isolate"), ("THERMAL", "loop select, pump"),
          ("LIGHTS", "external, deck, cabin"), ("CHARGE", "ground supply"),
          ("DATA", "bus A / bus B reset")]
    for i, (a, b) in enumerate(ov):
        x = cx - 144 + i * 58
        d.add(Rect(x, 478, 54, 32, fillColor=colors.white, strokeColor=HAIR, strokeWidth=.5))
        txt(d, x + 27, 498, a, 5.4, INK, anchor="middle", bold=True)
        txt(d, x + 27, 489, b, 4.2, LABEL, anchor="middle")
    callout(d, cx + 176, 500, 1, cx + 150, 500)

    # ---- glareshield ----------------------------------------------------
    d.add(Rect(cx - 176, 418, 352, 40, fillColor=METAL, strokeColor=INK, strokeWidth=.9, rx=3, ry=3))
    txt(d, cx - 170, 446, "GLARESHIELD", 6.4, TITLE_C, bold=True)
    # master alert lights - hardware, named, not classified
    for i, (lab, col) in enumerate((("MASTER", colors.HexColor("#c9463f")),
                                    ("MASTER", colors.HexColor("#c9913f")))):
        x = cx - 160 + i * 74
        d.add(Rect(x, 424, 62, 22, fillColor=colors.white, strokeColor=col, strokeWidth=1.2, rx=2, ry=2))
        txt(d, x + 31, 437, lab, 4.8, INK, anchor="middle", bold=True)
        txt(d, x + 31, 429, "ALERT LIGHT", 4.2, LABEL, anchor="middle")
    callout(d, cx - 210, 436, 2, cx - 160, 436)
    # display source and mode keys
    d.add(Rect(cx + 6, 424, 164, 22, fillColor=colors.white, strokeColor=HAIR, strokeWidth=.5))
    txt(d, cx + 88, 437, "DISPLAY SOURCE AND FORMAT KEYS", 4.8, INK, anchor="middle", bold=True)
    txt(d, cx + 88, 429, "surface select - format select - declutter", 4.2, LABEL, anchor="middle")
    callout(d, cx + 210, 436, 3, cx + 170, 436)

    # ---- main instrument panel -----------------------------------------
    d.add(Rect(cx - 176, 268, 352, 146, fillColor=PANEL, strokeColor=INK, strokeWidth=1.0, rx=3, ry=3))
    txt(d, cx - 170, 402, "MAIN INSTRUMENT PANEL", 6.4, TITLE_C, bold=True)

    # left display surface
    d.add(Rect(cx - 168, 292, 148, 100, fillColor=GLASS, strokeColor=INK, strokeWidth=.9))
    txt(d, cx - 94, 350, "LEFT DISPLAY SURFACE", 6.0, INK, anchor="middle", bold=True)
    txt(d, cx - 94, 340, "flight path - energy - regime", 4.6, LABEL, anchor="middle")
    d.add(Rect(cx - 168, 378, 148, 14, fillColor=colors.HexColor("#f3dede"),
               strokeColor=HAIR, strokeWidth=.4))
    txt(d, cx - 94, 382, "ALERT BANNER AREA", 4.4, INK, anchor="middle", bold=True)
    callout(d, cx - 214, 385, 4, cx - 168, 385)
    callout(d, cx - 214, 340, 5, cx - 168, 340)

    # right display surface
    d.add(Rect(cx + 20, 292, 148, 100, fillColor=GLASS, strokeColor=INK, strokeWidth=.9))
    txt(d, cx + 94, 350, "RIGHT DISPLAY SURFACE", 6.0, INK, anchor="middle", bold=True)
    txt(d, cx + 94, 340, "systems - route - traffic and terrain", 4.6, LABEL, anchor="middle")
    callout(d, cx + 214, 350, 6, cx + 168, 350)

    # bezel keys around both surfaces
    for sgn, x0 in ((-1, cx - 168), (1, cx + 20)):
        for i in range(5):
            d.add(Rect(x0 + 6 + i * 28, 296, 22, 7, fillColor=colors.white,
                       strokeColor=HAIR, strokeWidth=.4))
    txt(d, cx - 94, 285, "bezel line-select keys", 4.4, LABEL, anchor="middle")
    txt(d, cx + 94, 285, "bezel line-select keys", 4.4, LABEL, anchor="middle")
    callout(d, cx - 214, 300, 7, cx - 168, 300)

    # standby display, between and below
    d.add(Rect(cx - 16, 316, 32, 52, fillColor=GLASS, strokeColor=INK, strokeWidth=.9))
    txt(d, cx, 346, "STBY", 5.2, INK, anchor="middle", bold=True)
    txt(d, cx, 336, "own", 4.2, LABEL, anchor="middle")
    txt(d, cx, 328, "feed", 4.2, LABEL, anchor="middle")
    callout(d, cx, 262, 8, cx, 316)

    # ---- centre pedestal ------------------------------------------------
    d.add(Rect(cx - 96, base, 192, 108, fillColor=PANEL, strokeColor=INK, strokeWidth=1.0, rx=3, ry=3))
    txt(d, cx - 90, 246, "CENTRE PEDESTAL", 6.4, TITLE_C, bold=True)

    # inceptor
    d.add(Circle(cx, 206, 17, fillColor=colors.HexColor("#dfe6ee"), strokeColor=INK, strokeWidth=1.0))
    d.add(Line(cx, 206, cx, 228, strokeColor=INK, strokeWidth=2.2))
    d.add(Circle(cx, 230, 4.2, fillColor=INK, strokeColor=INK))
    txt(d, cx, 188, "CENTRE INCEPTOR", 5.2, INK, anchor="middle", bold=True)
    callout(d, cx - 128, 214, 9, cx - 17, 210)

    # comms / cabin / lighting sub-panels
    for i, (lab, sub) in enumerate((("COMMS", "radio - datalink - audio"),
                                    ("CABIN", "door - address - intercom"))):
        x = cx - 88 + i * 96
        d.add(Rect(x, 158, 88, 22, fillColor=colors.white, strokeColor=HAIR, strokeWidth=.5))
        txt(d, x + 44, 171, lab, 5.0, INK, anchor="middle", bold=True)
        txt(d, x + 44, 162, sub, 4.2, LABEL, anchor="middle")
    callout(d, cx - 128, 168, 10, cx - 88, 168)
    callout(d, cx + 128, 168, 11, cx + 96, 168)

    # ---- left side console: energy lever ---------------------------------
    d.add(Rect(cx - 214, base + 6, 36, 96, fillColor=PANEL, strokeColor=INK, strokeWidth=.9, rx=3, ry=3))
    d.add(Rect(cx - 204, 176, 16, 54, fillColor=colors.HexColor("#dfe6ee"),
               strokeColor=INK, strokeWidth=.9, rx=3, ry=3))
    d.add(Line(cx - 196, 230, cx - 196, 248, strokeColor=INK, strokeWidth=2.2))
    d.add(Circle(cx - 196, 250, 4.6, fillColor=INK, strokeColor=INK))
    txt(d, cx - 196, 142, "ENERGY LEVER", 5.0, INK, anchor="middle", bold=True)
    txt(d, cx - 196, 134, "left hand", 4.2, LABEL, anchor="middle")
    callout(d, cx - 250, 214, 12, cx - 214, 214)

    # ---- right side console: recovery handle -----------------------------
    d.add(Rect(cx + 178, base + 6, 36, 96, fillColor=PANEL, strokeColor=INK, strokeWidth=.9, rx=3, ry=3))
    d.add(Rect(cx + 186, 196, 20, 34, fillColor=GUARD, strokeColor=GUARD_S, strokeWidth=1.2, rx=2, ry=2))
    d.add(Line(cx + 186, 213, cx + 206, 213, strokeColor=GUARD_S, strokeWidth=.8))
    txt(d, cx + 196, 142, "RECOVERY HANDLE", 4.8, INK, anchor="middle", bold=True)
    txt(d, cx + 196, 134, "guarded", 4.2, LABEL, anchor="middle")
    d.add(Rect(cx + 186, 164, 20, 12, fillColor=colors.white, strokeColor=HAIR, strokeWidth=.5))
    txt(d, cx + 196, 168, "ARM", 4.2, INK, anchor="middle", bold=True)
    callout(d, cx + 250, 214, 13, cx + 214, 214)

    # ---- yaw pedals ------------------------------------------------------
    for sgn in (-1, 1):
        d.add(Rect(cx + sgn * 34 - 14, 96, 28, 20, fillColor=METAL, strokeColor=INK,
                   strokeWidth=.8, rx=2, ry=2))
    txt(d, cx, 86, "YAW PEDALS", 5.0, INK, anchor="middle", bold=True)
    callout(d, cx + 128, 106, 14, cx + 48, 106)

    # ---- key -------------------------------------------------------------
    legend(d, 612, 500, [
        (1,  "Overhead panel - electrical, thermal, lighting, charge, data"),
        (2,  "Master alert lights (two), glareshield"),
        (3,  "Display source and format keys"),
        (4,  "Alert banner area, top of left surface"),
        (5,  "Left display surface - flight path, energy, regime"),
        (6,  "Right display surface - systems, route, traffic, terrain"),
        (7,  "Bezel line-select keys, five per surface"),
        (8,  "Standby display, own low-voltage feed"),
        (9,  "Centre inceptor - flight path demand"),
        (10, "Communications sub-panel"),
        (11, "Cabin and door sub-panel"),
        (12, "Energy lever, left console"),
        (13, "Guarded recovery handle and arming switch"),
        (14, "Yaw pedals"),
    ])
    txt(d, 612, 358, "NOT DEFINED ON THIS SHEET", 6.4, TBDC, bold=True)
    for i, t in enumerate([
        "Panel surface dimensions and key pitch",
        "Display active area and resolution",
        "Bezel key legend set",
        "Overhead switch inventory and guarding",
        "Annunciator luminance and colour set",
    ]):
        tbd(d, 612, 346 - i * 9.4, "TBD   " + t)

    txt(d, 40, 560, "PILOT'S FORWARD VIEW - single crew station on the aircraft centreline",
        7.4, TITLE_C, bold=True)
    txt(d, 40, 549, "Zones are drawn in their relative positions. The sheet is not to scale.",
        5.8, LABEL)
    return d


# =========================================================================
# HF-2  Cockpit general arrangement - plan and side section
# =========================================================================
def cockpit_ga_sheet():
    """Plan above, side section below, both at one scale across the full sheet.

    The first cut drew both views at 46 pt/m in the middle of an A4 landscape
    sheet: each view was under 180 pt wide, the labels collided, and the notes
    ran under the title block. Scale is 110 pt/m now and the two views own a
    band of the sheet each."""
    d = sheet("COCKPIT GENERAL ARRANGEMENT",
              "Plan and side section. Geometry reference scheme.", "HF-2")

    s_ = 110.0                       # pt per metre, both views

    # ---------------- PLAN, upper band -----------------------------------
    px, py = 66, 424                 # nose at px; centreline at py
    def PX(m): return px + m * s_
    def PY(m): return py + m * s_

    txt(d, 40, 552, "PLAN - flight deck and forward cabin, viewed from above", 8.0, TITLE_C, bold=True)
    txt(d, 40, 541, "Scale 110 pt per metre. Same scale as the side section below.", 5.6, LABEL)

    # fuselage walls, nose to the section cut
    for sgn in (-1, 1):
        d.add(PolyLine([PX(0.00), PY(0.0), PX(0.42), PY(sgn * 0.52), PX(1.05), PY(sgn * 0.88),
                        PX(1.60), PY(sgn * 0.95), PX(3.60), PY(sgn * 0.95)],
                       strokeColor=INK, strokeWidth=1.2))
    # section cut, aft
    zig = []
    for i in range(11):
        zig += [PX(3.60) + (6 if i % 2 else -6), PY(-0.95) + i * (1.90 * s_ / 10.0)]
    d.add(PolyLine(zig, strokeColor=HAIR, strokeWidth=.8))
    txt(d, PX(3.66), PY(-0.86), "section cut", 5.0, LABEL)

    # centreline
    d.add(Line(PX(-0.06), PY(0.0), PX(3.70), PY(0.0), strokeColor=HAIR,
               strokeWidth=.5, strokeDashArray=[8, 4]))
    txt(d, PX(3.72), PY(0.0), "BL 0", 5.4, LABEL)

    # flight deck / cabin boundary
    d.add(Line(PX(2.30), PY(-0.95), PX(2.30), PY(0.95), strokeColor=HAIR,
               strokeWidth=1.0, strokeDashArray=[5, 3]))
    txt(d, PX(2.34), PY(0.80), "flight deck / cabin boundary", 5.4, LABEL)
    txt(d, PX(2.95), PY(-0.55), "CABIN - six seats, no cabin crew", 5.6, LABEL, anchor="middle")

    # panel, curved across the deck
    d.add(PolyLine([PX(0.95), PY(-0.74), PX(1.16), PY(0.0), PX(0.95), PY(0.74)],
                   strokeColor=INK, strokeWidth=1.6))
    txt(d, PX(1.20), PY(0.62), "PANEL", 5.6, INK, bold=True)

    # seat on the centreline
    d.add(Rect(PX(1.52), PY(-0.29), 0.66 * s_, 0.58 * s_, fillColor=SEATC,
               strokeColor=INK, strokeWidth=1.0, rx=3, ry=3))
    txt(d, PX(1.85), PY(-0.04), "PILOT SEAT", 6.0, INK, anchor="middle", bold=True)
    txt(d, PX(1.85), PY(-0.15), "on the centreline", 4.8, LABEL, anchor="middle")

    # doors, one per side
    for sgn in (-1, 1):
        d.add(Line(PX(1.46), PY(sgn * 0.93), PX(2.24), PY(sgn * 0.93),
                   strokeColor=INK, strokeWidth=2.6))
        txt(d, PX(1.85), PY(sgn * 0.93) + (5 if sgn > 0 else 7), "DOOR", 5.2, INK,
            anchor="middle", bold=True)

    # seated reach arc, forward of the seat reference
    srx, sry = PX(1.62), PY(0.0)
    pts = []
    for ang in range(-78, 79, 4):
        r = 0.72 * s_
        pts += [srx - r * math.cos(math.radians(ang)), sry + r * math.sin(math.radians(ang))]
    d.add(PolyLine(pts, strokeColor=TBDC, strokeWidth=.9, strokeDashArray=[4, 3]))
    tbd(d, PX(0.72), PY(-0.44), "TBD seated reach envelope")

    # station lines
    for m in (0.0, 1.0, 2.0, 3.0):
        d.add(Line(PX(m), PY(-0.99), PX(m), PY(0.99), strokeColor=HAIR,
                   strokeWidth=.35, strokeDashArray=[2, 3]))
        txt(d, PX(m), PY(-0.99) - 11, "STA %d" % int(m * 1000), 5.0, LABEL, anchor="middle")

    # ---------------- SIDE SECTION, lower band ----------------------------
    qx, qy = 66, 96                  # nose at qx; floor at qy
    def QX(m): return qx + m * s_
    def QZ(m): return qy + m * s_

    txt(d, 40, 284, "SIDE SECTION - on the aircraft centreline", 8.0, TITLE_C, bold=True)

    # floor, ceiling
    d.add(Line(QX(0.00), QZ(0.0), QX(3.60), QZ(0.0), strokeColor=INK, strokeWidth=1.2))
    d.add(Line(QX(0.86), QZ(1.55), QX(3.60), QZ(1.55), strokeColor=INK, strokeWidth=1.2))
    # nose and windshield
    d.add(PolyLine([QX(0.00), QZ(0.60), QX(0.26), QZ(0.90), QX(0.52), QZ(1.10)],
                   strokeColor=INK, strokeWidth=1.2))
    d.add(Polygon([QX(0.52), QZ(1.10), QX(0.86), QZ(1.55), QX(1.30), QZ(1.55),
                   QX(1.30), QZ(1.14), QX(0.72), QZ(1.00)],
                  fillColor=GLASS, strokeColor=INK, strokeWidth=1.0))
    txt(d, QX(0.95), QZ(1.26), "WINDSHIELD", 5.6, INK, anchor="middle", bold=True)

    # panel and glareshield
    d.add(Rect(QX(0.98), QZ(0.56), 0.22 * s_, 0.50 * s_, fillColor=PANEL,
               strokeColor=INK, strokeWidth=1.0))
    txt(d, QX(1.09), QZ(0.46), "PANEL", 5.2, INK, anchor="middle", bold=True)
    d.add(Rect(QX(0.94), QZ(1.06), 0.34 * s_, 0.09 * s_, fillColor=METAL,
               strokeColor=INK, strokeWidth=.8))
    txt(d, QX(1.32), QZ(1.08), "glareshield", 5.0, LABEL)

    # seat
    d.add(Rect(QX(1.52), QZ(0.40), 0.62 * s_, 0.10 * s_, fillColor=SEATC,
               strokeColor=INK, strokeWidth=1.0))
    d.add(Rect(QX(2.06), QZ(0.40), 0.10 * s_, 0.66 * s_, fillColor=SEATC,
               strokeColor=INK, strokeWidth=1.0))
    txt(d, QX(1.80), QZ(0.28), "PILOT SEAT", 5.6, INK, anchor="middle", bold=True)

    # design eye position
    dx_, dz_ = QX(1.80), QZ(1.16)
    d.add(Line(dx_ - 11, dz_, dx_ + 11, dz_, strokeColor=TBDC, strokeWidth=.8))
    d.add(Line(dx_, dz_ - 11, dx_, dz_ + 11, strokeColor=TBDC, strokeWidth=.8))
    d.add(Circle(dx_, dz_, 5.2, fillColor=colors.white, strokeColor=TBDC, strokeWidth=1.3))
    txt(d, dx_ + 15, dz_ + 8, "DESIGN EYE POSITION", 5.8, TBDC, bold=True)
    tbd(d, dx_ + 15, dz_ - 2, "TBD  location and eye-reference tolerance")

    # vision rays and the angle between them
    d.add(Line(dx_, dz_, QX(0.06), QZ(0.16), strokeColor=TBDC, strokeWidth=.9,
               strokeDashArray=[5, 3]))
    d.add(Line(dx_, dz_, QX(0.04), QZ(1.30), strokeColor=HAIR, strokeWidth=.7,
               strokeDashArray=[3, 3]))
    d.add(Wedge(dx_, dz_, 62, 182, 212, fillColor=None, strokeColor=TBDC, strokeWidth=.7))
    tbd(d, QX(0.42), QZ(0.62), "TBD  over-nose depression angle")
    txt(d, QX(0.10), QZ(1.34), "horizon reference", 5.0, LABEL)

    # pedals and inceptor
    d.add(Rect(QX(1.14), QZ(0.08), 0.24 * s_, 0.16 * s_, fillColor=METAL,
               strokeColor=INK, strokeWidth=.9))
    txt(d, QX(1.26), QZ(-0.04), "yaw pedals", 5.0, LABEL, anchor="middle")
    d.add(Line(QX(1.44), QZ(0.42), QX(1.44), QZ(0.76), strokeColor=INK, strokeWidth=2.2))
    d.add(Circle(QX(1.44), QZ(0.78), 4.2, fillColor=INK, strokeColor=INK))
    txt(d, QX(1.44), QZ(0.84), "inceptor", 5.0, LABEL, anchor="middle")

    # seat adjustment range
    d.add(Line(QX(1.46), QZ(0.36), QX(1.46), QZ(0.60), strokeColor=TBDC, strokeWidth=1.0))
    for zz in (0.36, 0.60):
        d.add(Line(QX(1.42), QZ(zz), QX(1.50), QZ(zz), strokeColor=TBDC, strokeWidth=1.0))
    tbd(d, QX(0.96), QZ(0.44), "TBD seat", "end")
    tbd(d, QX(0.96), QZ(0.36), "adjustment", "end")

    # waterlines
    for m, lab in ((0.0, "WL 0  floor"), (0.80, "WL 800"), (1.55, "WL 1550  ceiling")):
        d.add(Line(QX(-0.06), QZ(m), QX(3.64), QZ(m), strokeColor=HAIR,
                   strokeWidth=.35, strokeDashArray=[2, 3]))
        txt(d, QX(3.66), QZ(m), lab, 5.0, LABEL)

    # cabin boundary in section
    d.add(Line(QX(2.30), QZ(0.0), QX(2.30), QZ(1.55), strokeColor=HAIR,
               strokeWidth=1.0, strokeDashArray=[5, 3]))
    txt(d, QX(2.36), QZ(1.42), "cabin", 5.2, LABEL)

    # ---------------- geometry reference scheme, right column -------------
    gx = 560
    txt(d, gx, 268, "GEOMETRY REFERENCE SCHEME", 7.0, TITLE_C, bold=True)
    for i, t in enumerate([
        "STA   fuselage station, mm aft of the nose reference",
        "WL    waterline, mm above the flight deck floor",
        "BL    buttock line, mm from the centreline (BL 0)",
    ]):
        txt(d, gx, 254 - i * 10.0, t, 5.6, LABEL)
    txt(d, gx, 214, "The scheme is defined here. The values against it are not.",
        5.8, TBDC, bold=True)
    for i, t in enumerate([
        "Design Eye Position and its tolerance",
        "External vision envelope, over-nose and over-side",
        "Seated reach envelope to each panel zone",
        "Seat adjustment range and the seat-to-DEP aid",
        "Flight deck access and emergency egress routing",
    ]):
        tbd(d, gx, 200 - i * 10.0, "TBD   " + t)
    txt(d, gx, 140, "This drawing defines the arrangement and the reference scheme.", 5.6, LABEL)
    txt(d, gx, 130, "It does not close the open items; those are listed in", 5.6, LABEL)
    txt(d, gx, 120, "VAY-HF-0001 section 4.3 and carried in section 11.2.", 5.6, LABEL)
    return d


# =========================================================================
# HF-3  Controls
# =========================================================================
def controls_sheet():
    d = sheet("FLIGHT DECK CONTROLS",
              "Inceptor, energy lever, recovery handle, bezel keys.", "HF-3")

    txt(d, 40, 545, "Each control is drawn with the axes it moves in and the detents it has. "
                    "Force, breakout and gradient are not defined.", 6.0, LABEL)

    # ---------------- centre inceptor ------------------------------------
    ox, oy = 150, 380
    txt(d, ox - 90, 470, "CENTRE INCEPTOR", 8.0, TITLE_C, bold=True)
    txt(d, ox - 90, 459, "Right hand. Flight path demand in both regimes.", 5.6, LABEL)
    d.add(Circle(ox, oy, 46, fillColor=colors.white, strokeColor=INK, strokeWidth=1.0))
    d.add(Circle(ox, oy, 15, fillColor=colors.HexColor("#dfe6ee"), strokeColor=INK, strokeWidth=1.0))
    # axes
    d.add(Line(ox - 62, oy, ox + 62, oy, strokeColor=INK, strokeWidth=.8))
    d.add(Line(ox, oy - 62, ox, oy + 62, strokeColor=INK, strokeWidth=.8))
    for (dx, dy, lab) in ((0, 70, "PITCH  nose up"), (0, -72, "PITCH  nose down"),
                          (72, 0, "ROLL  right"), (-72, 0, "ROLL  left")):
        txt(d, ox + dx, oy + dy, lab, 5.2, LABEL,
            anchor="middle" if dx == 0 else ("start" if dx > 0 else "end"))
    # twist for yaw
    pts = []
    for a in range(20, 161, 6):
        r = 30
        pts += [ox + r * math.cos(math.radians(a)), oy + r * math.sin(math.radians(a))]
    d.add(PolyLine(pts, strokeColor=GUARD_S, strokeWidth=1.2))
    txt(d, ox, oy + 36, "TWIST  yaw", 5.2, GUARD_S, anchor="middle", bold=True)
    # thumb switches
    d.add(Rect(ox - 9, oy + 4, 18, 7, fillColor=colors.white, strokeColor=HAIR, strokeWidth=.5))
    txt(d, ox, oy - 6, "trim / mode", 4.4, LABEL, anchor="middle")
    txt(d, ox - 90, 286, "Detents:  none. The inceptor is continuous in all three axes.",
        5.4, LABEL)
    tbd(d, ox - 90, 275, "TBD  breakout force, force gradient, displacement limits")
    tbd(d, ox - 90, 265, "TBD  thumb switch inventory and legends")

    # ---------------- energy lever ---------------------------------------
    ex, ey = 400, 300
    txt(d, ex - 40, 470, "ENERGY LEVER", 8.0, TITLE_C, bold=True)
    txt(d, ex - 40, 459, "Left hand. Energy demand, both regimes.", 5.6, LABEL)
    d.add(Rect(ex - 16, ey, 32, 132, fillColor=colors.white, strokeColor=INK, strokeWidth=1.0, rx=4, ry=4))
    # detents
    dets = [(0.06, "IDLE"), (0.34, "HOVER BAND"), (0.66, "CRUISE BAND"), (0.94, "MAX")]
    for frac, lab in dets:
        y = ey + 6 + frac * 120
        d.add(Line(ex - 16, y, ex + 16, y, strokeColor=HAIR, strokeWidth=.7))
        d.add(Polygon([ex + 16, y, ex + 22, y + 3, ex + 22, y - 3],
                      fillColor=INK, strokeColor=INK))
        txt(d, ex + 26, y - 2, lab, 5.2, INK, bold=True)
    # knob
    d.add(Rect(ex - 20, ey + 128, 40, 16, fillColor=colors.HexColor("#dfe6ee"),
               strokeColor=INK, strokeWidth=1.0, rx=3, ry=3))
    txt(d, ex, ey + 133, "GRIP", 5.0, INK, anchor="middle", bold=True)
    txt(d, ex - 40, 268, "Travel is a single axis, fore and aft, with the bands marked.", 5.4, LABEL)
    tbd(d, ex - 40, 258, "TBD  band boundaries in engineering units")
    tbd(d, ex - 40, 248, "TBD  detent force and whether the bands are detented or painted")

    # ---------------- recovery handle -------------------------------------
    rx_, ry_ = 620, 372
    txt(d, rx_ - 40, 470, "RECOVERY HANDLE", 8.0, TITLE_C, bold=True)
    txt(d, rx_ - 40, 459, "Guarded. Mechanical to the firing unit.", 5.6, LABEL)
    d.add(Rect(rx_ - 34, ry_ - 34, 68, 68, fillColor=GUARD, strokeColor=GUARD_S,
               strokeWidth=1.4, rx=3, ry=3))
    # guard, hinged open
    d.add(PolyLine([rx_ - 34, ry_ + 34, rx_ - 6, ry_ + 58, rx_ + 40, ry_ + 58],
                   strokeColor=GUARD_S, strokeWidth=1.4))
    txt(d, rx_ + 44, ry_ + 56, "guard, hinged", 5.0, GUARD_S)
    d.add(Rect(rx_ - 12, ry_ - 20, 24, 40, fillColor=colors.white, strokeColor=INK, strokeWidth=1.1, rx=2, ry=2))
    d.add(Line(rx_, ry_ + 20, rx_, ry_ + 30, strokeColor=INK, strokeWidth=2.4))
    txt(d, rx_, ry_ - 32, "PULL", 5.6, INK, anchor="middle", bold=True)
    # arming switch
    d.add(Rect(rx_ - 30, ry_ - 74, 60, 24, fillColor=colors.white, strokeColor=INK, strokeWidth=.9))
    d.add(Line(rx_, ry_ - 74, rx_, ry_ - 50, strokeColor=HAIR, strokeWidth=.5))
    txt(d, rx_ - 15, ry_ - 65, "SAFE", 5.0, INK, anchor="middle", bold=True)
    txt(d, rx_ + 15, ry_ - 65, "ARM", 5.0, INK, anchor="middle", bold=True)
    txt(d, rx_, ry_ - 86, "two-position arming switch", 5.0, LABEL, anchor="middle")
    txt(d, rx_ - 40, 268, "The handle acts mechanically. The inhibit acts on the", 5.4, LABEL)
    txt(d, rx_ - 40, 259, "electrical path, and it does not act on the handle.", 5.4, LABEL)
    tbd(d, rx_ - 40, 246, "TBD  handle force and displacement")
    tbd(d, rx_ - 40, 237, "TBD  guard opening direction and grip")

    # ---------------- bezel keys ------------------------------------------
    bx, by = 130, 150
    txt(d, bx - 20, 200, "DISPLAY BEZEL KEYS", 8.0, TITLE_C, bold=True)
    txt(d, bx - 20, 189, "Five per surface, along the lower edge.", 5.6, LABEL)
    for i in range(5):
        d.add(Rect(bx - 20 + i * 46, by, 40, 20, fillColor=colors.white,
                   strokeColor=INK, strokeWidth=.8, rx=2, ry=2))
        txt(d, bx + i * 46, by + 7, "LSK %d" % (i + 1), 5.0, INK, anchor="middle", bold=True)
    tbd(d, bx - 20, 130, "TBD  legend set and whether legends are fixed or driven by the page")

    # ---------------- what is not a control -------------------------------
    txt(d, 470, 200, "FUNCTIONS WITH NO DEDICATED CONTROL", 6.6, TITLE_C, bold=True)
    txt(d, 470, 188, "Named in VAY-SDD-0001, reached only through a display page:", 5.4, LABEL)
    for i, t in enumerate([
        "High-voltage bus tie",
        "Coolant loop crossover valve",
        "Battery string isolation",
        "Data bus A / B reset",
        "Ground charge initiation",
        "Lift rotor stop and index",
    ]):
        txt(d, 478, 174 - i * 9.4, "-  " + t, 5.4, LABEL)
    tbd(d, 470, 112, "TBD  which of these needs a dedicated control is an open item")
    return d


SHEETS = [
    ("fig_vayu_flightdeck.pdf", flight_deck_sheet),
    ("fig_vayu_cockpit_ga.pdf", cockpit_ga_sheet),
    ("fig_vayu_controls.pdf",   controls_sheet),
]

if __name__ == "__main__":
    for name, fn in SHEETS:
        d = fn()
        renderPDF.drawToFile(d, name, name)
        print("wrote", name)
