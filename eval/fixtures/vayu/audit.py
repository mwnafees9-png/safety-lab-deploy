import re, sys, warnings, hashlib
warnings.filterwarnings("ignore")
from pypdf import PdfReader

def text(p):
    return "".join((pg.extract_text() or "") for pg in PdfReader(p).pages)

SDD = "VAY-SDD-0001_Vayu_VY-6_Architecture_and_SDD.pdf"
HFD = "VAY-HF-0001_Vayu_VY6_Flight_Deck_and_Human_Factors.pdf"

NEG = re.compile(r"(does not|do not|not state|never state|no .{0,30}appears|omission is deliberate|"
                 r"is not this document|stops where|deliberately|not contain|not tell you|"
                 r"what it therefore does not)", re.I)


def _declared(t, start):
    """True when the hit sits inside a passage declaring what the document does
    NOT do. Those passages are the point of section 11, not a violation of it."""
    return bool(NEG.search(t[max(0, start - 320):start + 60]))


def scan(t, pat):
    hits = list(re.finditer(pat, t, re.I))
    real = [m for m in hits if not _declared(t, m.start())]
    return real, len(hits) - len(real)

def report(name, path, checks):
    t = text(path)
    print("\n== %s ==" % name)
    print("   pages/chars/md5: %d / %d / %s" % (
        len(PdfReader(path).pages), len(t),
        hashlib.md5(open(path,"rb").read()).hexdigest()))
    bad = 0
    for label, pat, allow in checks:
        real, declared = scan(t, pat)
        n = len(real)
        ok = n <= allow
        bad += 0 if ok else 1
        note = "" if allow == 0 else "  (allowed %d)" % allow
        if declared:
            note += "  [%d in declared-exclusion prose]" % declared
        print("   %-34s %3d   %s%s" % (label, n, "OK" if ok else "FAIL", note))
        if not ok:
            for m in real:
                print("        ...%s..." % t[max(0,m.start()-70):m.start()+70].replace("\n"," "))
    return bad, t

# SDD: the five severity words appear ONCE each in section 1.3, naming the scale,
# exactly as the Aeolus and Halcyon fixtures do. Anything above that is a
# classification and fails.
sdd_checks = [
    ("severity words (scale naming only)", r"\b(catastrophic|hazardous|major|minor|no safety effect)\b", 6),
    ("probability targets",   r"\b\d(\.\d+)?\s*[eE]\s*-\s*\d+\b|\bper flight hour\b|\bextremely (remote|improbable)\b", 0),
    ("DAL assignments",       r"\bDAL\b|\bdevelopment assurance level\b|\blevel [ABCD]\b", 1),
    ("shall statements",      r"\bshall\b", 0),
    ("failure condition ids", r"\bFC[-_ ]?\d+\b|\bFHA[-_ ]?\d+\b", 0),
    ("requirement ids",       r"\bREQ[-_ ]?\d+\b|\bSR[-_ ]?\d+\b", 0),
    ("time commitments",      r"\bwithin \d+\s*(second|minute)|\bfor \d+\s*(second|minute)s?\b", 0),
    ("tolerance claims",      r"\bfail[- ]safe\b|\bsingle point of failure\b|\btolerant to\b|\bno single failure\b", 0),
    ("SC-VTOL paragraph cite",r"\bVTOL\.\d{4}\b|\bSC-VTOL\.\d+\b", 0),
]
# HFD: everything above PLUS the lane vocabularies it must not pre-answer.
hfd_checks = sdd_checks[:1] + [("severity words", r"\b(catastrophic|hazardous|major|minor|no safety effect)\b", 0)][:0] + sdd_checks[1:] + [
    ("allocation labels",     r"\ballocated to (the )?(crew|automation|pilot)\b|\bshared allocation\b", 0),
    ("error mode terms",      r"\b(omission|commission)\s+(error|type)\b|\berror of (omission|commission)\b|\b(timing|sequence|selection) error\b", 0),
    ("alert tiering", r"\b(a|an|the)\s+(Warning|Caution|Advisory)\b|classified as (a )?(Warning|Caution|Advisory)", 0),
    ("modality labels",       r"\b(aural|tactile)\s+(cue|annunciation)\b|modality\s*[:=]", 0),
    ("workload ratings",      r"\bbedford\b|\bworkload (rating|score|index)\b", 0),
    ("crew determination",    r"\bsingle pilot (is|has been) (shown|demonstrated|adequate|sufficient)\b|\bminimum (flight )?crew (is|has been) (shown|established)\b", 0),
    ("task times",           r"\b\d+\s*seconds?\b|\bthe pilot has \d+\b", 0),
]
b1, t1 = report("SDD  VAY-SDD-0001", SDD, sdd_checks)
b2, t2 = report("HF   VAY-HF-0001", HFD, hfd_checks)

# parser constraints (documented regexes from the Halcyon findings)
print("\n== parser constraints ==")
codes = re.findall(r"\(([A-Z]{2,5})\)", t1)
import collections
want = ["DEP","LFT","HVB","EPD","TMS","FCS","ACT","NAV","COM","DAA","DIS","LGS","STR","CAB","ERS","HMS"]
found = [c for c in want if c in codes]
print("   system codes readable by \\(([A-Z]{2,5})\\):  %d / 16   %s" % (len(found), "OK" if len(found)==16 else "FAIL"))
emdash_titles = re.findall(r"^\s*\d+(?:\.\d+)*\s+[^\n]*[–—][^\n]*$", t1, re.M)
print("   numbered titles containing an en/em dash: %d   %s" % (len(emdash_titles), "OK" if not emdash_titles else "FAIL"))
digit_codes = [c for c in set(codes) if any(ch.isdigit() for ch in c)]
print("   system codes containing a digit:          %d   %s" % (len(digit_codes), "OK" if not digit_codes else "FAIL"))

print("\nRESULT:", "PASS" if (b1==0 and b2==0 and len(found)==16 and not emdash_titles) else "FAIL")
