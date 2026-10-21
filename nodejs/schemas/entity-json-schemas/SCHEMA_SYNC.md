# Entity JSON schemas (vendored)

These JSON Schema draft-07 files are byte-identical copies of the Loxtep platform's
single entity-schema source, used by `loxtep lint` and `validateEntity()`.

**Source:** `LoxtepInc/loxtep` `platform-backend/_core/src/workspace/entity-json-schemas/`
**Pinned commit:** `f6be71ea3ee9b1ca0a898a520152cc68c9c48a41` (git blob ids per file in `SOURCE.json`)

**Sync** (from `nodejs/`, with a loxtep checkout at the commit to pin):

```bash
pnpm run sync:entity-schemas /path/to/loxtep
pnpm run check:entity-schemas
```

`check:entity-schemas` runs in CI and before publish. It fails if any vendored file
differs from the pinned commit's blob, or if a file is missing or extra. Do not edit
these files by hand; re-sync instead and note the commit in CHANGELOG.md.
