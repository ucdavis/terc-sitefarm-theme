# Claude guidance

@AGENTS.md

All project guidance lives in [AGENTS.md](AGENTS.md) (workflow, environment,
non-negotiables, data specifics) and [vue/README.md](vue/README.md) (the
step-by-step for building/porting Vue components into decoupled blocks).
Follow both.

Claude-specific notes:

- Auto-memory for this project carries additional operational context
  (ddev quirks, demo decisions, paths/naming, the accessibility mandate) —
  trust it, but verify anything content-dependent against the live site.
- The sprint demo run-of-show is a Claude artifact ("Tahoe Conditions
  Sprint Demo") — update it when the demoable surface changes.
- Live verification happens via Playwright against http://localhost:8080
  (the in-app browser pane can't load *.ddev.site cleanly).
