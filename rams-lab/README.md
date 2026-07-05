# RAMS Lab

Rail RAMS assessment workspace — EN 50126 / 50128 / 50129 / CSM-RA.
Vertical #2 of the Safety Lab platform. **Completely separate product and
deployment from Safety Lab Aero** — this folder is a self-contained project;
move it to its own repository whenever convenient (nothing references it from
the aero codebase, and the aero deploy does not include it).

## Status

v1 scaffold — NOT deployed. Working pages: Dashboard (lifecycle cockpits +
ISA gate checklists), System Definition (+ M4 Platform Screen Door sample),
Hazard Log (CSM-RA classification, THR, derived SIL, signed states),
THR Apportionment, Reliability Prediction (predicted-vs-field lane),
Availability (Ai computed / Ao elicited), Maintainability (MTTR/MDT,
demonstrated-vs-target), SRAC Register, Safety Case (EN 50129 parts + the
tamper-evident sign-off chain). Persistence: browser localStorage (v1).

## Run locally

Any static server over `site/` (ES modules need http, not file://):

    cd rams-lab && python3 -m http.server 8080 --directory site
    # → http://localhost:8080

## Test

    node test/smoke.mjs

The smoke test enforces the architecture constitution (file ceilings, import
rules) and verifies the engine math, evidence chain, spine tables, module
registration and the sample program. Keep it green.

## Deploy (later — not now)

    cd rams-lab && wrangler deploy

Own worker (`rams-lab`), own future domain. See wrangler.jsonc.

## Architecture

Read ARCHITECTURE.md before writing any code. Short version: core/ is
vertical-agnostic machinery, spine/ is the standard as data, modules/ are
pages that never import each other, app.js is the only composition point,
500-line ceiling per file — and the smoke test enforces all of it.
