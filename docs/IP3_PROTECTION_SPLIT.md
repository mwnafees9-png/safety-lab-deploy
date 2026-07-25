# IP-3 — DALgebra / AutoReq Protection Split (Scoping Memo)

**Date:** 26 July 2026 · **Author:** engineering session w/ Waqas · **Status:** DECISION MEMO — no build authorized beyond Phase 0/1 below.

---

## 1 · Threat model, honestly stated

Safety Lab ships as ~180 classic scripts served to every browser. Before IP-1, View Source delivered the complete engine source *including the header comments that explain the design rationale* — effectively a free transfer of the hard part (the thinking) to any competitor. After IP-1 (shipped today), production serves a minified mirror: comments and whitespace gone, identifiers intact.

Three attacker classes, three different answers:

| Attacker | Post-IP-1 exposure | Realistic answer |
|---|---|---|
| Curious pilot user / journalist | Reads nothing useful anymore | IP-1 is sufficient |
| Competitor with an engineer and a weekend | Can still recover algorithms from minified JS (names intact, structure readable with a formatter) | Phase 1 (sealed bundle) |
| Funded reverse-engineering effort | Will recover anything that executes client-side, including WASM (slower, but tractable) | Only law (patents/trade secret/contract) truly answers this; Phase 3 raises cost |

The governing product fact: **local-first / air-gap / ITAR-safe operation is a core differentiator** (it is on the security page, in the white papers, and in the Boeing pitch). Any protection scheme that requires calling home for core math contradicts the thing customers are buying. This memo therefore rejects "move the engines server-side for everyone" up front.

## 2 · Crown-jewel inventory (what is actually worth protecting)

**Tier 1 — differentiating logic (protect):**
`engine_modules.js` + `fta_quant_modules.js` (exact BDD, CCF tiering, importance, exposure model), `fta_freq.js` (G.12 frequency lane), `markov_ctmc.js` (transient CTMC), the DALgebra allocation/rebalance engine and AutoReq emission rules (inside `helpers_modules.js`/`fta_view_modules.js`), `stpa_core.js` (J3307 conformance engine), `monitor_spec.js` (Q_true split), `vv_validation.js` conclusion ladder.

**Tier 2 — curated data with an effort moat (minify only):**
HF corpora (`hf_kb_data`, `hf_reference_data`, `hf_hfacs`), KB corpora, GUIDE_PHRASES / cause banks, SORA Annex E matrix, catalogue. Copying these is visible (fingerprints); the 217F tables are US-Gov public domain and carry no protection value at all.

**Tier 3 — commodity (no protection value):** renderers, panels, navigation, styling. Protecting these costs QA and buys nothing.

## 3 · Options considered

**A. Status quo + IP-1 (minified mirror) — SHIPPED TODAY.** Free, behavior-preserving (no identifier renaming, so the 180-file global-name architecture is untouched). Stops the casual reader; does not stop an engineer.

**B. Sealed engine bundle ("IP-1.5") — RECOMMENDED as Phase 1.** Bundle the Tier-1 files into ONE closure with esbuild, then mangle *internal* identifiers aggressively (safe precisely because cross-references become closure-internal; only the deliberate export surface keeps names). This is the cheap 80%: structure, names, and module boundaries disappear; the public API surface is a short, frozen list we control. Effort: S–M (the delicate part is enumerating the true export surface of DALgebra/AutoReq out of helpers — they are currently entangled with UI code, and the untangling is *also* good engineering). Prereq: none. Risk: moderate QA burden, one-time.

**C. Server-side engines (SaaS lane only).** Worker endpoints for allocation/conformance. Rejected as a general answer (kills air-gap differentiation, adds latency to interactive loops, Cloudflare CPU limits vs. BDD builds, dual codepaths). Retained only as a possible *license-enforcement* point for SaaS-tier feature gating (Phase 2) — the engine stays local; the *entitlement* is checked server-side.

**D. WASM port (Rust) of the Tier-1 numeric core.** Highest bar + best performance; large rewrite; and we already own a dissimilar-verification story (DSV-1 Monte Carlo cross-check) that would validate a second implementation. Effort: L (months). Do this only on evidence: an actual clone attempt, or enterprise procurement demanding it. Note honestly: WASM is obfuscation-by-compilation, not encryption — it raises cost, it does not create impossibility.

## 4 · Recommendation (phased, evidence-gated)

- **Phase 0 — DONE (IP-1):** minified `./dist` is the production lane from today. Readable `./site` never ships again.
- **Phase 1 — Sealed Tier-1 bundle:** when convenient (a focused session). Deliverable: `engine_sealed.js` + frozen export list + QA wall green against the sealed build.
- **Phase 2 — SaaS entitlement gating (server-side license checks, engines stay local):** when pricing tiers exist. Pairs with IP-1 pipeline already in place.
- **Phase 3 — Rust/WASM core:** evidence-gated only. Budget L; validated via the existing DSV lane.
- **Rejected:** server-side execution of core math for all users.

## 5 · Interlock with IP-2 (patents, with counsel now)

Patents and secrecy split the same asset two ways: what the filings *claim* becomes public by design and needs no hiding; what they do *not* claim should be sealed (Phase 1) and treated as trade secret (access-controlled repo, the NDA-before-pilot habit we already follow, and the EULA's reverse-engineering clause). **Action when counsel returns claims:** walk the Tier-1 list against the claim set and align the sealed-bundle boundary so unclaimed art stays inside it. Until then, Phase 1's boundary = all of Tier 1.

## 6 · Decision asks

1. Confirm Phase 1 (sealed bundle) is wanted as a future session — no urgency, but before any broad self-serve trial.
2. Confirm Phase 2 waits for pricing tiers; Phase 3 waits for evidence.
3. On counsel's claim scope arriving: 30-minute review to set the sealed boundary (item in §5).
