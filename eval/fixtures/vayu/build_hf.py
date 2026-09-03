# -*- coding: utf-8 -*-
"""Assemble and build VAY-HF-0001 - Vayu VY-6 Flight Deck and Human Factors.

Mirrors the Aeolus HF document's toolchain rather than the SDD's: the source is
markdown, the three drawing sheets are separate landscape PDFs dropped in as
full-page figures, and pandoc drives pdflatex.

    _vayu_hf_body.md    sections 1 to 11
    _vayu_hf_appA.md    Appendix A, normal operating procedures
    _vayu_hf_appBC.md   Appendices B and C
    fig_vayu_*.pdf      the three sheets, built by fig_hf_sheets.py

Run:  python3 fig_hf_sheets.py && python3 build_hf.py
"""
import os, subprocess, sys, hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = "VAY-HF-0001_Vayu_VY6_Flight_Deck_and_Human_Factors.pdf"
SPEC = "_vayu_hf_spec.md"

FRONT = r"""
\begin{titlepage}
\thispagestyle{empty}
\vspace*{62mm}
{\Huge\bfseries Vayu VY-6\par}
\vspace{6mm}
{\LARGE Flight Deck and Human Factors Design Description\par}
\vspace{18mm}
{\large VAY-HF-0001 \quad\textperiodcentered\quad Issue 1 \quad\textperiodcentered\quad 2 September 2026\par}
\vspace{4mm}
{\large Companion to VAY-SDD-0001, Architecture and System Design Description, Issue 1\par}
\vspace{26mm}
\rule{\linewidth}{0.4pt}
\vspace{4mm}

\noindent\small\textbf{DEMONSTRATION ARTICLE.}\enspace The Vayu VY-6 is a representative
six-passenger electric vertical take-off and landing air taxi constructed by Safety Lab Aero.
Aircraft-level characteristics follow published information for aircraft in this class and are
listed against their sources in Appendix B of VAY-SDD-0001. The system architecture below aircraft
level, the flight deck, and every crew task in this document are representative, and are not the
design data of any manufacturer.\par
\vspace{3mm}
\noindent\small This document describes the design and stops where the assessment begins.
Section 11 states what it therefore does not contain, and why each omission is deliberate.\par
\vfill
\noindent\small Prepared by Safety Lab Aero.\normalsize
\end{titlepage}
\setcounter{page}{2}

\thispagestyle{plain}
\setcounter{tocdepth}{2}
\tableofcontents
\clearpage

"""

FIGS = {
    "flightdeck": ("fig_vayu_flightdeck.pdf", "HF-1",
                   "Flight deck panel arrangement. Panel zones, display and control "
                   "positions [PRELIM]. Also issued as a standalone drawing sheet."),
    "cockpit_ga": ("fig_vayu_cockpit_ga.pdf", "HF-2",
                   "Cockpit general arrangement, plan and side section. The drawing "
                   "defines the geometry reference scheme; the values against it are "
                   "the open items of \\S4.3. Also issued as a standalone drawing sheet."),
    "controls":   ("fig_vayu_controls.pdf", "HF-3",
                   "Flight deck controls. Axes, detents and guarding [PRELIM]; forces "
                   "and gradients are not defined. Also issued as a standalone drawing "
                   "sheet."),
}

LSCAPE = r"""
\begin{landscape}
\begin{center}
\includegraphics[width=\linewidth,height=0.92\textheight,keepaspectratio]{%s}
\end{center}
\vspace{-4mm}
\noindent\small\textbf{Figure %s} --- %s\normalsize
\end{landscape}
"""


# ---------------------------------------------------------------------------
# Character gate. pdflatex renders a character it has no definition for by
# stopping, which is at least honest, but it stops on the LAST page rather than
# the first offending character and the message names a line in a generated
# .tex nobody keeps. This is the LaTeX equivalent of the SDD build's WinAnsi
# gate: normalise what has an unambiguous equivalent, and fail loudly on
# anything else BEFORE handing the file to pandoc.
# ---------------------------------------------------------------------------
NORMALISE = {
    "\u2248": "about ",       # almost equal to - a number nobody measured anyway
    "\u2260": "not equal to ",
    "\u2264": "at most ",
    "\u2265": "at least ",
    "\u00d7": "x",
    "\u2192": "to ",
    "\u2019": "'",
    "\u2018": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2026": "...",
}
# These pdflatex handles through inputenc and they carry meaning in this family
# of documents, so they stay: em dash, en dash, section sign, middle dot.
ALLOWED = set("\u2014\u2013\u00a7\u00b7")


def char_gate(doc):
    for bad, good in NORMALISE.items():
        doc = doc.replace(bad, good)
    stray = sorted({ch for ch in doc if ord(ch) > 127 and ch not in ALLOWED})
    if stray:
        import unicodedata
        lines = []
        for ch in stray:
            i = doc.index(ch)
            lines.append("  U+%04X %s (%s)  ...%s..."
                         % (ord(ch), repr(ch), unicodedata.name(ch, "?"),
                            doc[max(0, i - 50):i + 50].replace("\n", " ")))
        raise SystemExit("characters pdflatex has no definition for:\n" + "\n".join(lines))
    return doc


BODY_START = "## 1 Purpose and scope"


def assemble():
    parts = [FRONT]
    for f in ("_vayu_hf_body.md", "_vayu_hf_appA.md", "_vayu_hf_appBC.md"):
        with open(os.path.join(HERE, f), encoding="utf-8") as fh:
            text = fh.read().rstrip()
        if f == "_vayu_hf_body.md":
            # The body was drafted as a standalone document, so it repeats the
            # YAML block, the H1 title and a front notice that FRONT already
            # carries - and its notice says the aircraft is fictional, which is
            # not what this one is. Keep FRONT's front matter, drop the body's.
            i = text.find(BODY_START)
            if i < 0:
                raise SystemExit("body front matter not recognised: '%s' is missing, so the "
                                 "assembler cannot tell front matter from content" % BODY_START)
            text = text[i:]
        parts.append(text + "\n\n")
    doc = "".join(parts)

    for key, (pdf, num, cap) in FIGS.items():
        token = "<<<FIG:%s>>>" % key
        if token not in doc:
            raise SystemExit("figure placeholder missing from the source: " + token)
        if not os.path.exists(os.path.join(HERE, pdf)):
            raise SystemExit("drawing sheet not built: %s - run fig_hf_sheets.py first" % pdf)
        doc = doc.replace(token, LSCAPE % (pdf, num, cap))

    leftover = [t for t in ("<<<FIG:",) if t in doc]
    if leftover:
        raise SystemExit("unreplaced figure placeholder remains in the source")

    doc = char_gate(doc)

    with open(os.path.join(HERE, SPEC), "w", encoding="utf-8") as fh:
        fh.write(doc)
    return doc


HEADER = r"""
% Reproducibility: pdftex stamps a creation date, a mod date and a trailer /ID,
% all of which vary run to run even with the clock pinned. These three
% primitives suppress them, so "rebuild and compare the hash" is a real check.
\ifdefined\pdfinfoomitdate \pdfinfoomitdate=1 \fi
\ifdefined\pdftrailerid \pdftrailerid{} \fi
\ifdefined\pdfsuppressptexinfo \pdfsuppressptexinfo=-1 \fi
\usepackage{pdflscape}
\usepackage{booktabs}
\usepackage{longtable}
\usepackage{array}
\usepackage{graphicx}
% hyperref is loaded by the template AFTER header-includes, so defer this.
\AtBeginDocument{\hypersetup{pdftitle={Vayu VY-6 - Flight Deck and Human Factors Design Description},
            pdfauthor={Safety Lab Aero},
            pdfsubject={VAY-HF-0001 Issue 1}}}
\setlength{\emergencystretch}{3em}
"""


def build():
    # DETERMINISTIC BUILD, the LaTeX equivalent of the SDD's rl_config.invariant.
    # pdftex stamps a creation time and derives the trailer /ID from it, so two
    # builds of identical source differ in md5 - and this document's md5 is its
    # identity in any golden captured on it. SOURCE_DATE_EPOCH pins the clock and
    # FORCE_SOURCE_DATE makes pdftex honour it for the PDF metadata as well.
    env = dict(os.environ)
    env["SOURCE_DATE_EPOCH"] = "1756771200"      # 2026-09-02T00:00:00Z, fixed
    env["FORCE_SOURCE_DATE"] = "1"
    hdr = os.path.join(HERE, "_hf_header.tex")
    with open(hdr, "w", encoding="utf-8") as fh:
        fh.write(HEADER)
    cmd = [
        "pandoc", SPEC, "-o", OUT,
        "--pdf-engine=pdflatex",
        "--from", "markdown+raw_tex+pipe_tables+backtick_code_blocks",
        "-V", "geometry:a4paper,margin=25mm",
        "-V", "fontsize=10pt",
        # lmodern is not in this texlive; pandoc's template falls back to it
        # unless a fontfamily is named. mathptmx + helvet is present and is a
        # closer match to the SDD's Helvetica body anyway.
        "-V", "fontfamily=mathptmx",
        "-V", "colorlinks=true",
        "-V", "linkcolor=black",
        "-V", "toccolor=black",
        "-V", "pagestyle=plain",
        "-H", "_hf_header.tex",
    ]
    r = subprocess.run(cmd, cwd=HERE, capture_output=True, text=True, env=env)
    if r.returncode != 0:
        sys.stderr.write(r.stdout[-4000:] + "\n" + r.stderr[-4000:] + "\n")
        raise SystemExit("pandoc failed")
    return os.path.join(HERE, OUT)


if __name__ == "__main__":
    doc = assemble()
    print("assembled %s  (%d chars)" % (SPEC, len(doc)))
    out = build()
    md5 = hashlib.md5(open(out, "rb").read()).hexdigest()
    print("wrote %s  %d bytes  md5 %s" % (OUT, os.path.getsize(out), md5))
