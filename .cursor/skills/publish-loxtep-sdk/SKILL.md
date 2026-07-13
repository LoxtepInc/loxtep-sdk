---
name: publish-loxtep-sdk
description: >-
  Release and publish @loxtep/sdk to npm from the loxtep-sdk monorepo. Use when
  the user asks to publish, release, ship, or tag a new SDK version, bump npm
  version, or run the npm publish GitHub Actions workflow.
---

# Publish @loxtep/sdk

Release the Node package at `nodejs/` (`@loxtep/sdk`) to [npm](https://www.npmjs.com/package/@loxtep/sdk).

## Prerequisites (one-time)

Trusted Publishing must be configured on npm (no `NPM_TOKEN` in CI):

1. [Package Access](https://www.npmjs.com/package/@loxtep/sdk/access) → **Trusted Publisher** → GitHub Actions
2. Repository: `LoxtepInc/loxtep-sdk`
3. Workflow: `nodejs-publish.yml`
4. Allowed: **npm publish**

## Standard release (preferred)

Pushing a `v*` git tag triggers `.github/workflows/nodejs-publish.yml` automatically.

### Checklist

```
- [ ] Changes merged on main
- [ ] nodejs/package.json version bumped (semver)
- [ ] nodejs/CHANGELOG.md updated ([Keep a Changelog](https://keepachangelog.com/))
- [ ] pnpm run build && pnpm run test pass in nodejs/
- [ ] Commit version + changelog on main
- [ ] Tag vX.Y.Z and push tag
- [ ] GitHub Actions publish job green
- [ ] npm registry shows new version
```

### Commands

```bash
cd nodejs
pnpm run build && pnpm run test

# After editing package.json + CHANGELOG.md on main:
git add nodejs/package.json nodejs/CHANGELOG.md
git commit -m "Release @loxtep/sdk vX.Y.Z"
git push origin main

git tag vX.Y.Z
git push origin vX.Y.Z
```

The workflow checks out the tag, sets npm version from the tag name (`v0.4.1` → `0.4.1`), runs tests, and publishes via OIDC.

### Verify

```bash
npm view @loxtep/sdk version
npm view @loxtep/sdk dist-tags
gh run list -R LoxtepInc/loxtep-sdk --workflow=nodejs-publish.yml -L 3
```

## Manual publish (fallback)

Does not require a git tag. Uses whatever version is in `nodejs/package.json` on `main`:

```bash
gh workflow run "Publish @loxtep/sdk to npm" -R LoxtepInc/loxtep-sdk
```

Optional inputs: `version`, `dry_run`, `tag` (npm dist-tag, default `latest`).

## Semver

| Change | Bump |
|--------|------|
| Breaking API / removed exports | **major** |
| New features, backward compatible | **minor** |
| Bug fixes only | **patch** |

Package root is `nodejs/` only — not the monorepo root.

## CI behavior

| Workflow | Trigger | Action |
|----------|---------|--------|
| `nodejs-publish.yml` | Push tag `v*` or manual dispatch | build → test → npm publish |
| `nodejs-ci.yml` | Push/PR to `main` (`nodejs/**`) | lint, build, test only |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `EOTP` / 2FA in CI | Use Trusted Publishing on [Access](https://www.npmjs.com/package/@loxtep/sdk/access); do not use bypass-2FA tokens |
| `Unknown command: trust` | Local npm &lt; 11.15: `npm install -g npm@11.15.0` |
| `Version not changed` in CI | Tag already matches `package.json`; or re-run without `version` input |
| npm website shows old version | Registry API is authoritative; UI cache lags — `npm view @loxtep/sdk version` |
| Publish workflow not running | Tag must match `v*` (e.g. `v0.4.1`, not `0.4.1`) |
| `repository.url` OIDC mismatch | `package.json` must use `https://github.com/LoxtepInc/loxtep-sdk.git` |

## Do not

- Commit or push npm tokens
- Use `NPM_TOKEN` for publish (OIDC only)
- Run `npm publish` from monorepo root (no `package.json` there)
- Bump version only in the workflow without committing to main (tag flow expects changelog on the tagged commit)
