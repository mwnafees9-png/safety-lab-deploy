# -*- coding: utf-8 -*-
"""Build VAY-SDD-0001 - Vayu VY-6 - Architecture and System Design Description.

Layout mirrors the Aeolus and Halcyon fixtures: a cover, a dot-leader contents
page, numbered two-level headings, the same six section 5 subsections, and a
running footer carrying the demonstration notice and the document id.

Run:  python3 build_sdd.py  ->  VAY-SDD-0001_Vayu_VY-6_Architecture_and_SDD.pdf
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# DETERMINISTIC BUILD. A PDF normally embeds a creation timestamp and a random
# document id, so two builds of identical content differ in md5 - and this
# fixture's md5 IS its identity in any golden captured on it. rl_config.invariant
# pins both, so "regenerate and compare the hash" is a real check.
from reportlab import rl_config
rl_config.invariant = 1

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
                                Table, TableStyle, PageBreak)
from reportlab.platypus.flowables import HRFlowable
from reportlab.platypus.tableofcontents import TableOfContents

import content_front as F
import content_sys_a as SA
import content_sys_b as SB
import content_back as B
import fig_core as FIG
import fig_sys as FSYS
import fig_hf as FHF

OUT = "VAY-SDD-0001_Vayu_VY-6_Architecture_and_SDD.pdf"
SYSTEMS = SA.SYSTEMS_A + SB.SYSTEMS_B
SUBS = ["Purpose", "Description & Architecture", "Redundancy & Reconfiguration",
        "Interfaces", "Installation & Segregation", "Operation"]


def assert_encodable(label, text):
    """The standard fonts are WinAnsi-encoded. A character outside that set renders
    as a solid black box, silently. A black box in a measurement instrument is
    worse than a crash, so fail the build on the first one."""
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
H2 = ParagraphStyle("h2", parent=ss["Heading2"], fontName="Helvetica-Bold", fontSize=11.5,
                    leading=15, spaceBefore=12, spaceAfter=5, textColor=colors.HexColor("#10263f"))
H3 = ParagraphStyle("h3", parent=ss["Heading3"], fontName="Helvetica-Bold", fontSize=9.8,
                    leading=13, spaceBefore=8, spaceAfter=3, textColor=colors.HexColor("#2b3f57"))
CAP = ParagraphStyle("cap", parent=BODY, fontSize=8.4, leading=11.4,
                     textColor=colors.HexColor("#4a5a6e"), alignment=0, spaceBefore=3, spaceAfter=10)
NOTE = ParagraphStyle("note", parent=BODY, fontSize=8.4, leading=11.6,
                      textColor=colors.HexColor("#4a5a6e"))
CELL = ParagraphStyle("cell", parent=BODY, fontSize=8.2, leading=10.8, alignment=0, spaceAfter=0)
CELLH = ParagraphStyle("cellh", parent=CELL, fontName="Helvetica-Bold",
                       textColor=colors.HexColor("#10263f"))
TITLE = ParagraphStyle("title", parent=ss["Title"], fontName="Helvetica-Bold", fontSize=25,
                       leading=31, alignment=0)
SUB = ParagraphStyle("sub", parent=BODY, fontSize=12, leading=17, alignment=0)

PAGE_W, PAGE_H = A4
MARGIN = 22 * mm


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7.4)
    canvas.setFillColor(colors.HexColor("#7b8794"))
    if doc.page > 1:
        canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - MARGIN + 6 * mm, F.DOC["footer_right"])
        canvas.setStrokeColor(colors.HexColor("#dfe4ea"))
        canvas.line(MARGIN, PAGE_H - MARGIN + 4 * mm, PAGE_W - MARGIN, PAGE_H - MARGIN + 4 * mm)
    canvas.drawCentredString(PAGE_W / 2.0, MARGIN - 6 * mm, F.DOC["footer_left"])
    if doc.page > 1:
        canvas.drawRightString(PAGE_W - MARGIN, MARGIN - 6 * mm, str(doc.page))
    canvas.restoreState()


class Doc(BaseDocTemplate):
    def afterFlowable(self, flowable):
        if not isinstance(flowable, Paragraph):
            return
        st = flowable.style.name
        if st == "h1":
            self.notify("TOCEntry", (0, flowable.getPlainText(), self.page))
        elif st == "h2":
            self.notify("TOCEntry", (1, flowable.getPlainText(), self.page))


def para(text, style=BODY):
    out = []
    for block in [b.strip() for b in text.split("\n\n") if b.strip()]:
        out.append(Paragraph(block.replace("\n", " "), style))
    return out


def grid(rows, widths, header=True):
    data = [[Paragraph(str(c), CELLH if (header and i == 0) else CELL) for c in row]
            for i, row in enumerate(rows)]
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, colors.HexColor("#e3e8ee")),
    ]
    if header:
        style += [("LINEBELOW", (0, 0), (-1, 0), 0.9, colors.HexColor("#10263f")),
                  ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f4f6f9"))]
    t.setStyle(TableStyle(style))
    return t


def build():
    avail = PAGE_W - 2 * MARGIN
    story = []

    # ---- cover -------------------------------------------------------------
    story += [Spacer(1, 52 * mm),
              Paragraph("Vayu VY-6", TITLE),
              Spacer(1, 5 * mm),
              Paragraph("Architecture and System Design Description", SUB),
              Spacer(1, 16 * mm),
              Paragraph(F.DOC["number"] + " &nbsp;-&nbsp; " + F.DOC["issue"]
                        + " &nbsp;-&nbsp; 2 September 2026", SUB),
              Spacer(1, 8 * mm),
              Paragraph("Companion to VAY-HF-0001, Flight Deck and Human Factors Design "
                        "Description, Issue 1", SUB),
              Spacer(1, 22 * mm),
              HRFlowable(width="100%", thickness=0.4, color=colors.HexColor("#1d2b3a"),
                         spaceBefore=0, spaceAfter=8),
              Paragraph("<b>DEMONSTRATION ARTICLE.</b>&nbsp; The Vayu VY-6 is a representative "
                        "six-passenger electric vertical take-off and landing air taxi constructed "
                        "by Safety Lab Aero. Aircraft-level characteristics follow published "
                        "information for aircraft in this class and are listed against their "
                        "sources in Appendix B. The system architecture below aircraft level is "
                        "representative, and is not the design data of any manufacturer.", NOTE),
              Spacer(1, 3 * mm),
              Paragraph("This document describes the design and stops where the assessment begins. "
                        "Appendix A states what it therefore does not contain, and why each "
                        "omission is deliberate.", NOTE),
              Spacer(1, 6 * mm),
              Paragraph("Prepared by Safety Lab Aero.", NOTE),
              PageBreak()]

    # ---- contents ----------------------------------------------------------
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle("toc0", fontName="Helvetica-Bold", fontSize=9.6, leading=16,
                       textColor=colors.HexColor("#10263f")),
        ParagraphStyle("toc1", fontName="Helvetica", fontSize=8.8, leading=13.6, leftIndent=14,
                       textColor=colors.HexColor("#33465e")),
    ]
    story += [Paragraph("Contents", H1), toc, PageBreak()]

    # ---- 1 -----------------------------------------------------------------
    story += [Paragraph("1 Aircraft Description and Concept", H1)]
    story += para(F.INTRO)
    story += [Spacer(1, 4), FIG.general_arrangement(avail, 430),
              Paragraph("Figure 1-1 &nbsp;General arrangement. Plan, profile and front elevation to "
                        "the dimensions of section 1.2, drawn at one common scale. There is no "
                        "isometric.", CAP)]
    for head, body in F.SECTIONS_1:
        story += [Paragraph(head.replace("&", "&amp;"), H2)]
        if body:
            story += para(body)
        else:
            story += [grid(F.CONFIG_TABLE, [avail * .20, avail * .30, avail * .20, avail * .30]),
                      Spacer(1, 4), Paragraph(F.CONFIG_NOTE, NOTE)]

    # ---- 2 -----------------------------------------------------------------
    story += [PageBreak(), Paragraph("2 System Architecture Overview", H1),
              Paragraph("2.1 System Inventory", H2)]
    story += para(F.SECTION_2_INTRO)
    story += [grid(F.INVENTORY, [avail * .08, avail * .28, avail * .16, avail * .48]),
              Paragraph("2.2 System-to-System Interface Matrix", H2)]
    story += para(F.SECTION_22_INTRO)
    story += [grid(F.INTERFACES, [avail * .14, avail * .20, avail * .66])]

    # ---- 3 / 4 -------------------------------------------------------------
    story += [PageBreak(), Paragraph("3 Zonal Breakdown", H1)]
    story += para(F.SECTION_3_INTRO)
    story += [grid(F.ZONES, [avail * .07, avail * .19, avail * .40, avail * .34]),
              Paragraph("4 Zone-Spanning Routings", H1)]
    story += para(F.SECTION_4)

    # ---- 5 -----------------------------------------------------------------
    story += [PageBreak(), Paragraph("5 System Design Descriptions", H1)]
    story += para("The sixteen systems of section 2.1 are described below in the same order and to "
                  "the same six headings, so that any two can be compared without re-reading both "
                  "in full.")
    for i, (code, name, subs) in enumerate(SYSTEMS, start=1):
        story += [Paragraph("5.%d %s (%s)" % (i, name.replace("&", "&amp;"), code), H2)]
        for j, key in enumerate(SUBS, start=1):
            story += [Paragraph("5.%d.%d %s" % (i, j, key.replace("&", "&amp;")), H3)]
            story += para(subs[key])

    # ---- 6 -----------------------------------------------------------------
    story += [PageBreak(), Paragraph("6 Zonal Model and System Schematics", H1)]
    story += para(B.SECTION_6_INTRO)
    story += [Spacer(1, 4), FIG.zonal_model(avail, 300),
              Paragraph("Figure 6-1 &nbsp;Zonal model. Ten zones per section 3, with the "
                        "zone-spanning routings of section 4 drawn over the profile.", CAP)]
    for i, (code, name, cap) in enumerate(B.SCHEMATICS, start=1):
        sch = FSYS.SCHEMATICS[code]
        story += [Paragraph("6.%d %s (%s)" % (i, name.replace("&", "&amp;"), code), H2),
                  sch.draw(),
                  Paragraph("Figure 6-%d &nbsp;%s (%s). %s"
                            % (i + 1, name.replace("&", "&amp;"), code, cap), CAP)]

    # The flight deck gets a figure here too. The full treatment - panel zones,
    # geometry reference scheme, controls, procedures - is VAY-HF-0001's job, but
    # a reader of the SDD should not have to leave the document to find out what
    # the crew station looks like.
    story += [Paragraph("6.17 Flight Deck Arrangement", H2)]
    story += para("The flight deck is described as equipment in section 5.11 and as a crew "
                  "station in VAY-HF-0001. The arrangement below is included so that the "
                  "installation of DIS can be read without leaving this document. Panel "
                  "zones, the geometry reference scheme, the control schedule and the crew "
                  "procedures are in VAY-HF-0001 and are not repeated here.")
    story += [FHF.flight_deck(avail, 300),
              Paragraph("Figure 6-18 &nbsp;Flight deck arrangement. The panel, the inceptors "
                        "and the seated reach envelope. Drawn in full on sheet HF-1 of "
                        "VAY-HF-0001.", CAP)]

    # ---- Appendix A --------------------------------------------------------
    story += [PageBreak(), Paragraph("Appendix A - What this document does not do", H1)]
    story += para(B.APPENDIX_A)

    # ---- Appendix B --------------------------------------------------------
    story += [PageBreak(), Paragraph("Appendix B - Source of aircraft-level facts", H1)]
    story += para(B.APPENDIX_B_INTRO)
    story += [grid(B.APPENDIX_B, [avail * .20, avail * .26, avail * .54]),
              Spacer(1, 4), Paragraph(B.APPENDIX_B_NOTE, NOTE)]

    doc = Doc(OUT, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN,
              topMargin=MARGIN + 4 * mm, bottomMargin=MARGIN,
              title="Vayu VY-6 - Architecture and System Design Description",
              author="Safety Lab Aero", subject=F.DOC["number"])
    frame = Frame(MARGIN, MARGIN, PAGE_W - 2 * MARGIN, PAGE_H - 2 * MARGIN - 4 * mm, id="f")
    doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=footer)])
    doc.multiBuild(story)
    return OUT


if __name__ == "__main__":
    assert_encodable("INTRO", F.INTRO)
    for h, b in F.SECTIONS_1:
        assert_encodable(h, h)
        if b:
            assert_encodable(h, b)
    for row in F.CONFIG_TABLE + F.INVENTORY + F.INTERFACES + F.ZONES + B.APPENDIX_B:
        for c in row:
            assert_encodable("table cell", str(c))
    for t in (F.SECTION_2_INTRO, F.SECTION_22_INTRO, F.SECTION_3_INTRO, F.SECTION_4,
              F.CONFIG_NOTE, B.SECTION_6_INTRO, B.APPENDIX_A, B.APPENDIX_B_INTRO,
              B.APPENDIX_B_NOTE):
        assert_encodable("block", t)
    for code, name, subs in SYSTEMS:
        for k, v in subs.items():
            assert_encodable("%s / %s" % (code, k), v)
    for code, name, cap in B.SCHEMATICS:
        assert_encodable("fig %s" % code, cap)

    missing = [c for c, _, _ in B.SCHEMATICS if c not in FSYS.SCHEMATICS]
    if missing:
        raise SystemExit("no schematic spec for: %s" % ", ".join(missing))
    codes_sys = [c for c, _, _ in SYSTEMS]
    codes_fig = [c for c, _, _ in B.SCHEMATICS]
    if codes_sys != codes_fig:
        raise SystemExit("section 5 and section 6 are in different orders:\n  5: %s\n  6: %s"
                         % (codes_sys, codes_fig))

    out = build()
    print("wrote", out, os.path.getsize(out), "bytes")
