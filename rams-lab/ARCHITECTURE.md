# RAMS Lab — Architecture Constitution

Born modular. These rules exist because Safety Lab Aero grew a 36k-line
monolith; RAMS Lab must never repeat it. Every rule below is enforceable in
review and most are enforceable by the smoke test.

## Layout

    site/rams/
      index.html          shell page — loads app.js as an ES module, nothing else
      rams.css            the ink-on-paper identity (only stylesheet)
      app.js              COMPOSITION ROOT — imports modules, registers them. The
                          only file allowed to know the full module list.
      core/               vertical-agnostic machinery (no rail knowledge)
        bus.js            event bus (pub/sub) — how modules talk
        store.js          project state + persistence + ids + undo snapshot
        evidence.js       fingerprints, SHA-256 baselines, sign-offs, drift
        engine.js         math: gate/RBD eval, top-down apportionment,
                          availability, MTTR/MDT rollups
        registry.js       module registry consumed by the shell
      spine/              THE STANDARD AS DATA, not code
        en50126.js        lifecycle phases, CSM-RA risk matrix, THR→SIL table,
                          checklist definitions, severity palette
      ui/
        shell.js          sidebar + router + header — knows registry, not modules
      modules/            one file per page/analysis; the only growth surface
        dashboard.js hazards.js thr.js reliability.js availability.js
        maintainability.js sracs.js safetycase.js sample.js

## The rules

1. **Modules never import each other.** Cross-module needs go through the
   store (shared state) or the bus (events). If two modules need the same
   helper, it moves to core/.
2. **core/ never imports from modules/ or spine/.** The engine cannot know
   what a hazard is. Spine data is passed IN as arguments/config.
3. **The spine is data.** Adding FuSa Lab later means writing spine/iso26262.js
   and a new composition root — zero edits to core/ or existing modules.
4. **500-line ceiling per file.** At 400 lines a module must split (page +
   engine-helpers). The smoke test warns at 400 and fails at 500.
5. **The shell knows the registry, not the modules.** Navigation, routing and
   page hosting come from what modules declare at registration:
   `{ id, section, title, render(host, ctx), onEvent? }`.
6. **One state root.** All persistent state lives in the store document;
   modules read via `ctx.state`, write via `ctx.update(fn)` which persists,
   fingerprints, and broadcasts. No module-private persistence.
7. **Evidence is core.** Any signed act (verdict, acceptance, tailoring,
   gate hand-off) goes through evidence.js so every vertical inherits
   tamper-evident chains for free.
8. **No build step.** Native ES modules, no bundler, no framework. The
   platform's longevity requirement outlives any toolchain fashion.

## Composition

`app.js` is the only place the product is assembled:

    import { registry } from './core/registry.js';
    import { spine } from './spine/en50126.js';
    import * as hazards from './modules/hazards.js';
    registry.register(hazards.module);
    ...
    shell.mount(document.body, { spine });

FuSa Lab / a future vertical = new spine + new app.js + reused everything else.
