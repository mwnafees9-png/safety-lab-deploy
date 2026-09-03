#!/usr/bin/env python3
"""A15 wave 1 — eCFR Title 14 corpus pipeline (Safety Lab Aero).

Fetch -> parse -> section chunks -> deterministic BM25 index -> sharded JSON.
Run ON A MACHINE WITH NETWORK (the cloud container's egress excludes ecfr.gov):

    python3 corpus_pipeline.py --parts 21,23,25,27,29,33,35,91 --out ./corpus_out
    python3 corpus_pipeline.py --selftest          # no network; embedded fixture

Every chunk carries provenance (source URL, section id, point-in-time date).
US Government work -> public domain; verbatim storage and quoting are fine.
BM25 parameters are recorded in the manifest so scoring is reproducible
forever (ruling 4 Aug: deterministic retrieval, no learned component).
"""
import argparse, datetime, json, math, os, re, sys, urllib.request
import xml.etree.ElementTree as ET

K1, B = 1.2, 0.75
SHARD_BYTES = 18 * 1024 * 1024   # device/commit-friendly

TOKEN_RE = re.compile(r"[a-z0-9]+(?:[.\-()][a-z0-9()]+)*")

def tokenize(text):
    """Lowercase; keeps hyphen/paren regulatory refs together ('25.1309(b)' is one
    token) AND emits the bare section prefix ('25.1309') so a query for the section
    matches text citing any paragraph of it. Deterministic by construction."""
    out = []
    for t in TOKEN_RE.findall(text.lower()):
        out.append(t)
        if "(" in t:
            base = t.split("(", 1)[0].rstrip(".")
            if base:
                out.append(base)
    return out

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "SafetyLabAero-A15/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()

def latest_date():
    d = json.loads(fetch("https://www.ecfr.gov/api/versioner/v1/titles.json"))
    t = [x for x in d["titles"] if x["number"] == 14][0]
    return t["latest_issue_date"]

def part_xml(date, part):
    url = "https://www.ecfr.gov/api/versioner/v1/full/%s/title-14.xml?part=%s" % (date, part)
    return fetch(url), url

def sections_from_xml(xml_bytes, part, url, date):
    """eCFR full XML: DIV8 = section. Emit one chunk per section; split giants at ~6k chars on paragraph boundaries."""
    root = ET.fromstring(xml_bytes)
    out = []
    for div in root.iter("DIV8"):
        n = (div.get("N") or "").strip()            # e.g. "§ 25.1309"
        secid = re.sub(r"[^0-9A-Za-z.\-]", "", n.replace("§", "")).strip(".")
        if not secid:
            continue
        head = div.find("HEAD")
        title = ("".join(head.itertext()).strip() if head is not None else n)
        paras = []
        for p in div.iter("P"):
            t = re.sub(r"\s+", " ", "".join(p.itertext())).strip()
            if t:
                paras.append(t)
        if not paras:
            continue
        # pack paragraphs into <=6000-char chunks, never splitting a paragraph
        buf, chunks = [], []
        size = 0
        for t in paras:
            if size + len(t) > 6000 and buf:
                chunks.append(" ".join(buf)); buf, size = [], 0
            buf.append(t); size += len(t)
        if buf:
            chunks.append(" ".join(buf))
        for i, text in enumerate(chunks):
            cid = "14CFR-%s" % secid + ("" if len(chunks) == 1 else "#p%d" % (i + 1))
            out.append({
                "id": cid, "title": title, "part": str(part), "text": text,
                "provenance": {"source": url, "docId": "14 CFR Part %s" % part,
                                "section": secid, "issueDate": date,
                                "retrieved": datetime.date.today().isoformat()}
            })
    return out

def build_index(chunks):
    """Deterministic BM25 postings: df + per-doc tf, avgdl. No floats stored beyond doc lengths."""
    postings, doclen = {}, {}
    for i, c in enumerate(chunks):
        toks = tokenize(c["title"] + " " + c["text"])
        doclen[i] = len(toks)
        tf = {}
        for t in toks:
            tf[t] = tf.get(t, 0) + 1
        for t, n in tf.items():
            postings.setdefault(t, []).append([i, n])
    avgdl = (sum(doclen.values()) / max(1, len(doclen)))
    return {"postings": postings, "doclen": doclen, "avgdl": avgdl, "N": len(chunks), "k1": K1, "b": B}

def shard_chunks(chunks, outdir):
    shards, cur, size, names = [], [], 0, []
    for c in chunks:
        j = len(json.dumps(c))
        if size + j > SHARD_BYTES and cur:
            shards.append(cur); cur, size = [], 0
        cur.append(c); size += j
    if cur:
        shards.append(cur)
    for i, s in enumerate(shards):
        name = "chunks-%02d.json" % i
        with open(os.path.join(outdir, name), "w") as f:
            json.dump(s, f)
        names.append({"file": name, "count": len(s)})
    return names

FIXTURE_XML = b"""<DIV5><DIV8 N="\xc2\xa7 25.1309" TYPE="SECTION"><HEAD>\xc2\xa7 25.1309 Equipment, systems, and installations.</HEAD>
<P>(a) The equipment, systems, and installations must be designed to ensure that they perform their intended functions under any foreseeable operating condition.</P>
<P>(b) The airplane systems must be designed so that the occurrence of any failure condition which would prevent the continued safe flight and landing of the airplane is extremely improbable.</P></DIV8>
<DIV8 N="\xc2\xa7 25.1301" TYPE="SECTION"><HEAD>\xc2\xa7 25.1301 Function and installation.</HEAD>
<P>Each item of installed equipment must be of a kind and design appropriate to its intended function.</P></DIV8></DIV5>"""

def selftest():
    chunks = sections_from_xml(FIXTURE_XML, 25, "fixture://", "fixture")
    assert [c["id"] for c in chunks] == ["14CFR-25.1309", "14CFR-25.1301"], chunks
    assert "extremely improbable" in chunks[0]["text"]
    idx = build_index(chunks)
    assert idx["N"] == 2 and "failure" in idx["postings"]
    assert "25.1309" in tokenize("see 25.1309(b) for detail")  # regulatory-ref token survives
    # determinism: rebuild -> identical
    assert json.dumps(build_index(chunks), sort_keys=True) == json.dumps(idx, sort_keys=True)
    print("SELFTEST OK — 2 sections, %d terms, avgdl %.1f" % (len(idx["postings"]), idx["avgdl"]))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--parts", default="21,23,25,27,29,33,35,91")
    ap.add_argument("--out", default="./corpus_out")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    os.makedirs(a.out, exist_ok=True)
    date = latest_date()
    print("eCFR Title 14 point-in-time:", date)
    chunks = []
    for p in [x.strip() for x in a.parts.split(",") if x.strip()]:
        xml, url = part_xml(date, p)
        cs = sections_from_xml(xml, p, url, date)
        print("  Part %-4s -> %4d chunks" % (p, len(cs)))
        chunks.extend(cs)
    idx = build_index(chunks)
    with open(os.path.join(a.out, "postings.json"), "w") as f:
        json.dump(idx, f)
    shard_meta = shard_chunks(chunks, a.out)
    manifest = {"corpus": "a15-wave1-14cfr", "built": datetime.datetime.utcnow().isoformat() + "Z",
                "issueDate": date, "parts": a.parts, "chunks": len(chunks),
                "terms": len(idx["postings"]), "avgdl": idx["avgdl"], "k1": K1, "b": B,
                "shards": shard_meta, "license": "US Government work — public domain"}
    with open(os.path.join(a.out, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    print("DONE:", len(chunks), "chunks,", len(idx["postings"]), "terms ->", a.out)

if __name__ == "__main__":
    main()
