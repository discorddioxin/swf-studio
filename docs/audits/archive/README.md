# audits/

Dated snapshots: each file records what an audit, investigation or phase review
found **at the revision it names** (several put the commit in the filename).
They are kept as history, so paths, commands and line numbers inside them can be
stale after later refactors — e.g. tooling that has since moved under a game
adapter in `src/adapters/<game>/tools/`.

Current-state documentation lives elsewhere:

| Topic | Where |
|---|---|
| Where game-specific code may live (and what runs for any other SWF set) | [`src/adapters/README.md`](../src/adapters/README.md) |
| Current Gaia/Fishing isolation status, findings and re-run instructions | [`GAIA_FISHING_CODE_AUDIT.md`](./GAIA_FISHING_CODE_AUDIT.md) |
| Decoder / runtime / engine notes | [`docs/`](../docs) |
| Dev tooling map (dumpers, harnesses, preview) | [`debug/README.md`](../debug/README.md) |
