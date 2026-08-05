# Entity JSON schemas (vendored)

These JSON Schema draft-07 files are a copy of the Loxtep platform schemas used
for customer workspace entity validation.

**Source (canonical):** Loxtep platform customer-workspace entity JSON schemas
(private platform monorepo). Sync from a local checkout when those schemas
change.

**Sync command** (from `nodejs/`):

```bash
node scripts/sync-entity-schemas.mjs /path/to/loxtep
```

When platform schemas change, re-run the sync script and note the date/source
commit in the SDK CHANGELOG.

**Last synced:** 2026-07-24 (from local Loxtep platform checkout)
