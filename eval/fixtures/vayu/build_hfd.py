# -*- coding: utf-8 -*-
"""Build VAY-HFD-0001 - Vayu VY-6 - Human Factors Description.

The second document of the fixture pair, and the first human factors source
document in the family. Same cover, contents, heading and footer conventions as
the SDD so that the FORM is constant across the family and only the content type
varies.

Run:  python3 build_hfd.py  ->  VAY-HFD-0001_Vayu_VY-6_Human_Factors_Description.pdf
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from reportlab import rl_config
rl_config.invariant = 1

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
                                Table, TableStyle, PageBreak)
from reportlab.platypus.tableofcontents import TableOfContents

import content_hf as H
import fig_hf as FH

OUT = "VAY-HFD-0001_Vayu_VY-6_Human_Factors_Description.pdf"


def assert_encodable(label, text):
    try:
        text.encode("cp1252")
    except UnicodeEncodeError as e:
        bad = text[e.start:e.end]
        raise SystemExit("Un-renderable character %r in %s: ...%s..."
                         % (bad, label, text[max(0, e.start - 40):e.start + 40]))


ss = getSampleStyleSheet()
BODY = ParagraphStyle("body", parent=ss["BodyText"], fontName="Helvetica", fontSize=9.5,
                      leading=13.4, alignment=TA_JUSTIFY, spaceAfter=6)
H1 = ParagraphStyle("h1", parent=ss["Heading1"], fontName="Helvetica-Bold", fontSize=15,
                    leading=19, spaceBefore=16, spaceAfter=9, textColor=colors.HexColor("#10263f"))
CAP = ParagraphStyle("cap", parent=BODY, fontSize=8.4, leading=11.4,
                     textColor=colors.HexColor("#4a5a6e"), alignment=0, spaceBefore=3, spaceAfter=10)
NOTE = ParagraphStyle("note", parent=BODY, fontSize=8.4, leading=11.6,
                      textColor=colors.HexColor("#4a5a6e"))
CELL = ParagraphStyle("cell", parent=BODY, fontSize=8.2, leading=10.8, alignment=0, spaceAfter=0)
CELLH = ParagraphStyle("cellh", parent=CELL, fontName="Helvetica-Bold",
                       textColor=colors.HexColor("#10263f"))
TITLE = ParagraphStyle("title", parent=ss["Title"], fontName="Helvetica-Bold", fontSize=25, leading=31)
SUB = ParagraphStyle("sub", parent=BODY, fontSize=12, leading=17, alignment=0)

PAGE_W, PAGE_H = A4
MARGIN = 22 * mm


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7.4)
    canvas.setFillColor(colors.HexColor("#7b8794"))
    if doc.page > 1:
        canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - MARGIN + 6 * mm, H.DOC["footer_right"])
        canvas.setStrokeColor(colors.HexColor("#dfe4ea"))
        canvas.line(MARGIN, PAGE_H - MARGIN + 4 * mm, PAGE_W - MARGIN, PAGE_H - MARGIN + 4 * mm)
    canvas.drawCentredString(PAGE_W / 2.0, MARGIN - 6 * mm, H.DOC["footer_left"])
    if doc.page > 1:
        canvas.drawRightString(PAGE_W - MARGIN, MARGIN - 6 * mm, str(doc.page))
    canvas.restoreState()


class Doc(BaseDocTemplate):
    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name == "h1":
            self.notify("TOCEntry", (0, flowable.getPlainText(), self.page))


def para(text, style=BODY):
    return [Paragraph(b.strip().replace("\n", " "), style)
            for b in text.split("\n\n") if b.strip()]


def grid(rows, widths, header=True):
    data = [[Paragraph(str(c), CELLH if (header and i == 0) else CELL) for c in row]
            for i, row in enumerate(rows)]
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4.2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4.2),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, colors.HexColor("#e3e8ee")),
        ("LINEBELOW", (0, 0), (-1, 0), 0.9, colors.HexColor("#10263f")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f4f6f9")),
    ]))
    return t


def build():
    avail = PAGE_W - 2 * MARGIN
    story = []

    story += [Spacer(1, 52 * mm),
              Paragraph("Vayu VY-6", TITLE),
              Spacer(1, 5 * mm),
              Paragraph("Human Factors Description", SUB),
              Spacer(1, 16 * mm),
              Paragraph(H.DOC["number"] + " &nbsp;-&nbsp; " + H.DOC["issue"], SUB),
              Spacer(1, 8 * mm),
              Paragraph("Single-pilot, six-passenger electric vertical take-off and landing air "
                        "taxi. Demonstration article: the Vayu VY-6 is a representative aircraft "
                        "constructed by Safety Lab Aero and is not the design data of any "
                        "manufacturer. This document is a companion to VAY-SDD-0001 and describes "
                        "the crew, the flight deck and the task, where that document describes the "
                        "equipment.", NOTE),
              PageBreak()]

    toc = TableOfContents()
    toc.levelStyles = [ParagraphStyle("toc0", fontName="Helvetica-Bold", fontSize=9.6, leading=16,
                                      textColor=colors.HexColor("#10263f"))]
    story += [Paragraph("Contents", H1), toc, PageBreak()]

    story += [Paragraph("Introduction", H1)]
    story += para(H.INTRO)

    for i, (head, body) in enumerate(H.SECTIONS):
        story += [Paragraph(head, H1)]
        if head.startswith("3 "):
            story += [Spacer(1, 2), FH.flight_deck(avail, 300),
                      Paragraph("Figure 1 &nbsp;Flight deck arrangement. The panel, the inceptors "
                                "and the seated reach envelope described in this section.", CAP)]
        if head.startswith("5 "):
            story += [Spacer(1, 2), FH.phase_strip(avail, 96),
                      Paragraph("Figure 2 &nbsp;Phases of a sector, in the order this section "
                                "describes them.", CAP)]
        story += para(body)

    story += [PageBreak(), Paragraph("Appendix A - Task Index", H1)]
    story += para("Every crew task named in section 5, listed flat and tagged with the phase in "
                  "which it is performed. The list is an index to the narrative rather than a "
                  "procedure: it says what the pilot does and when, and it does not say how long "
                  "any of it takes or how the tasks divide between the pilot and the aircraft.")
    rows = [["Task", "Phase", "Description"]] + [list(r) for r in H.TASK_INDEX]
    story += [grid(rows, [avail * .22, avail * .15, avail * .63])]

    doc = Doc(OUT, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN,
              topMargin=MARGIN + 4 * mm, bottomMargin=MARGIN,
              title="Vayu VY-6 - Human Factors Description",
              author="Safety Lab Aero", subject=H.DOC["number"])
    frame = Frame(MARGIN, MARGIN, PAGE_W - 2 * MARGIN, PAGE_H - 2 * MARGIN - 4 * mm, id="f")
    doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=footer)])
    doc.multiBuild(story)
    return OUT


if __name__ == "__main__":
    assert_encodable("INTRO", H.INTRO)
    for head, body in H.SECTIONS:
        assert_encodable(head, head)
        assert_encodable(head, body)
    for row in H.TASK_INDEX:
        for c in row:
            assert_encodable("task row", str(c))
    if len(H.SECTIONS) != 8:
        raise SystemExit("expected 8 sections, found %d" % len(H.SECTIONS))
    out = build()
    print("wrote", out, os.path.getsize(out), "bytes")
