# -*- coding: utf-8 -*-
"""Figures for VAY-HFD-0001 - Vayu VY-6 Human Factors Description.

Two figures only. The flight deck is drawn as a plan of the panel with the two
display surfaces, the standby, the inceptors and the seat, because section 3 is
about what the pilot can see and reach. The phase strip is drawn because section
5 walks ten phases and a reader needs to hold the order in mind while reading it.

Neither figure classifies anything: no priority, no modality, no workload.
"""
from reportlab.graphics.shapes import Drawing, Rect, Line, Circle, Polygon, PolyLine
from reportlab.lib import colors
from fig_core import txt, frame_title, INK, HAIR, LABEL, TITLE_C, _bounds_ok

GLASS = colors.HexColor("#dbe6f0")
PANEL = colors.HexColor("#eef1f5")
SEATC = colors.HexColor("#e6ded2")


def flight_deck(w=470, h=300):
    """Panel plan with the seat below it, so reach and sight lines read together."""
    d = Drawing(w, h)
    d.add(Rect(0, 0, w, h, fillColor=colors.HexColor("#fbfcfd"),
               strokeColor=colors.HexColor("#dfe4ea"), strokeWidth=.5))
    frame_title(d, w, "Flight Deck Arrangement",
                "Panel and seating as described in section 3. Dimensions are not to scale.")

    cx = w / 2.0
    # glareshield and panel body
    d.add(Rect(cx - 190, 172, 380, 78, fillColor=PANEL, strokeColor=INK, strokeWidth=.8, rx=4, ry=4))
    d.add(Line(cx - 190, 250, cx + 190, 250, strokeColor=HAIR, strokeWidth=.6))
    txt(d, cx - 186, 254, "GLARESHIELD", 5.0, LABEL)

    # two display surfaces
    d.add(Rect(cx - 178, 182, 160, 58, fillColor=GLASS, strokeColor=INK, strokeWidth=.7))
    txt(d, cx - 98, 214, "LEFT SURFACE", 6.0, INK, anchor="middle", bold=True)
    txt(d, cx - 98, 204, "flight path, energy, regime", 4.8, LABEL, anchor="middle")
    d.add(Rect(cx + 18, 182, 160, 58, fillColor=GLASS, strokeColor=INK, strokeWidth=.7))
    txt(d, cx + 98, 214, "RIGHT SURFACE", 6.0, INK, anchor="middle", bold=True)
    txt(d, cx + 98, 204, "systems, route, traffic and terrain", 4.8, LABEL, anchor="middle")

    # standby, centred between them
    d.add(Rect(cx - 14, 194, 28, 40, fillColor=GLASS, strokeColor=INK, strokeWidth=.7))
    txt(d, cx, 212, "STBY", 4.8, INK, anchor="middle", bold=True)

    # alert banner strip across the top of the left surface
    d.add(Rect(cx - 178, 232, 160, 8, fillColor=colors.HexColor("#f3d9d9"),
               strokeColor=HAIR, strokeWidth=.4))
    txt(d, cx - 98, 234, "banner area", 4.2, LABEL, anchor="middle")

    # centre pedestal
    d.add(Rect(cx - 30, 96, 60, 68, fillColor=PANEL, strokeColor=INK, strokeWidth=.7, rx=3, ry=3))
    txt(d, cx, 150, "PEDESTAL", 4.8, LABEL, anchor="middle")

    # centre inceptor
    d.add(Circle(cx, 124, 13, fillColor=colors.HexColor("#dfe6ee"), strokeColor=INK, strokeWidth=.9))
    d.add(Line(cx, 124, cx, 138, strokeColor=INK, strokeWidth=1.6))
    txt(d, cx, 106, "INCEPTOR", 4.6, INK, anchor="middle", bold=True)
    txt(d, cx + 20, 124, "flight path demand", 4.6, LABEL)

    # energy lever, left hand
    d.add(Rect(cx - 104, 108, 16, 46, fillColor=colors.HexColor("#dfe6ee"),
               strokeColor=INK, strokeWidth=.8, rx=3, ry=3))
    d.add(Line(cx - 96, 154, cx - 96, 168, strokeColor=INK, strokeWidth=1.6))
    txt(d, cx - 96, 98, "ENERGY LEVER", 4.6, INK, anchor="middle", bold=True)

    # recovery handle, guarded, right side
    d.add(Rect(cx + 88, 112, 30, 26, fillColor=colors.HexColor("#f6e6c8"),
               strokeColor=colors.HexColor("#c8a02c"), strokeWidth=.9, rx=2, ry=2))
    txt(d, cx + 103, 122, "GUARDED", 4.4, INK, anchor="middle", bold=True)
    txt(d, cx + 103, 104, "recovery handle", 4.6, LABEL, anchor="middle")

    # seat
    d.add(Rect(cx - 26, 34, 52, 46, fillColor=SEATC, strokeColor=INK, strokeWidth=.8, rx=3, ry=3))
    d.add(Rect(cx - 26, 30, 52, 8, fillColor=SEATC, strokeColor=INK, strokeWidth=.6))
    txt(d, cx, 54, "PILOT SEAT", 5.2, INK, anchor="middle", bold=True)
    txt(d, cx, 44, "centreline", 4.6, LABEL, anchor="middle")

    # reach arc
    d.add(PolyLine([cx - 132, 78, cx - 108, 128, cx - 40, 158, cx + 40, 158,
                    cx + 108, 128, cx + 132, 78],
                   strokeColor=HAIR, strokeWidth=.6, strokeDashArray=[3, 2.4]))
    txt(d, cx + 136, 80, "seated reach", 4.6, LABEL)

    # cabin behind
    d.add(Line(cx - 190, 22, cx + 190, 22, strokeColor=HAIR, strokeWidth=.6,
               strokeDashArray=[4, 3]))
    txt(d, cx - 186, 12, "CABIN - six seats, no cabin crew, open above seat height", 5.0, LABEL)

    _bounds_ok(d, "flight_deck")
    return d


PHASES = ["Pre-flight", "Boarding", "Pre-departure", "Departure", "Transition-up",
          "Cruise", "Transition-down", "Approach/Landing", "Turnaround", "Degraded/Emergency"]


def phase_strip(w=470, h=96):
    """The ten phases of section 5, in order, so the reader keeps the sequence."""
    d = Drawing(w, h)
    d.add(Rect(0, 0, w, h, fillColor=colors.HexColor("#fbfcfd"),
               strokeColor=colors.HexColor("#dfe4ea"), strokeWidth=.5))
    frame_title(d, w, "Phases of a Sector",
                "The order in which section 5 describes the crew tasks.")

    n = len(PHASES)
    x0, x1 = 16, w - 16
    seg = (x1 - x0) / float(n)
    for i, name in enumerate(PHASES):
        x = x0 + i * seg
        last = (name == "Degraded/Emergency")
        fill = colors.HexColor("#f4e9e9") if last else colors.HexColor("#e9eff5")
        d.add(Rect(x + 1.5, 30, seg - 3, 26, fillColor=fill, strokeColor=HAIR, strokeWidth=.5,
                   rx=2, ry=2))
        words = name.split("/") if "/" in name else name.split(" ")
        if len(words) == 1:
            txt(d, x + seg / 2, 40, name, 4.6, INK, anchor="middle", bold=True)
        else:
            txt(d, x + seg / 2, 45, words[0], 4.6, INK, anchor="middle", bold=True)
            txt(d, x + seg / 2, 36, words[1], 4.6, INK, anchor="middle", bold=True)
        if i < n - 1 and not last:
            d.add(Line(x + seg - 1, 43, x + seg + 1, 43, strokeColor=HAIR, strokeWidth=.8))
    d.add(Line(x0, 24, x1 - seg, 24, strokeColor=HAIR, strokeWidth=.5, strokeDashArray=[3, 2]))
    txt(d, x0, 14, "One sector, repeated eight to fourteen times a day.", 4.8, LABEL)
    txt(d, x1, 14, "Reached from any phase.", 4.8, LABEL, anchor="end")
    _bounds_ok(d, "phase_strip")
    return d
