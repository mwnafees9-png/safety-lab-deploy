# Export parity — every analysis on offer exports CSV (Waqas directive, 17 Aug 2026)

**Directive:** "make sure human factors, reliability analyses are all capable of
exporting the same way, STPA, MBSA, whatever is on offer can get exported."

## Verified TODAY (17 Aug)

| Analysis | CSV export | Path |
|---|---|---|
| AC/Sys Functions, FCIM, FHA, Reqs, Assumptions | ✅ | exportData switch |
| Flight phases, PRA, ZSA, **CMA (added 17 Aug)**, FMEA, Fault_Tree, Library, Cutsets, **Trace_Matrix (crash-fixed 17 Aug)**, Definitions | ✅ | exportData switch |
| FMES | ✅ | fmesExportCsv (misc_fn 1369) |
| CCMR / latent failures | ✅ | ccmrExportCsv (misc_fn 1302) |
| Routing / interdependencies | ✅ | interdepExportCsv (misc_fn 1594) |
| SSE | ✅ | sse_export.js |
| ReqIF (FCs+reqs) | ✅ | reqif_bridge.js |
| Whole project | ✅ | open JSON (.slab) + exportProjectBundle |

## GAPS — buttons exist, case missing (alert "not implemented")
- `All_Requirements` · `Items` · `VV_Status`

## GAPS — no export path at all
- **HF register** (hfa / hfa-task / hfa-ergo)
- **Reliability predictions** (217F part-stress; R&M set; maintainability)
- **Markov models** (PDF only today)
- **Event Trees** · **Bow-Tie**
- **STPA** (stpaData: losses, hazards, constraints, UCAs, dispositions)
- **MMEL candidates** · **MLAS / MBSA surface**

## Rules for the implementation (learned today, the hard way)
1. Mirror each RENDERER's columns — never invent a schema (trace-matrix crash
   came from a stale assumption about acTrace's type; CMA CSV was built by
   mirroring the existing PDF provider).
2. Coerce field types defensively (String()/Array.isArray) — demo data is the
   canary and it caught two bugs in one hour.
3. One dated regression test per new case, wall must stay 144+/0.
4. Cache-buster bump per shipped file; ship via ship.sh only.

## Status
- [x] CMA case (shipped, verified in prod, CSV in hand)
- [x] Trace_Matrix crash fix (66.9, awaiting ship verification)
- [ ] All_Requirements, Items, VV_Status (quick — stores known)
- [ ] HF / REL / Markov / ETA / STPA / MMEL / MLAS (schema-from-renderer work)
