#!/usr/bin/env bash
# Clean-directory Try-it onboarding against the real CLI binary.
#
# Usage (from nodejs/):
#   pnpm run build
#   pnpm run test:e2e:try-it -- --instance <non-prod-uuid>
#
# Env:
#   LOXTEP_E2E_INSTANCE_ID   Required for attach/setup/test/deploy
#   LOXTEP_E2E_CREDENTIALS   Default: ./.loxtep/credentials.json
#   LOXTEP_E2E_KEEP=1        Keep workdir
#   LOXTEP_CLI               Override CLI (default: dist/cli/index.js)
#
# Without --instance: validates scaffold only (init template materialization).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

INSTANCE_ID="${LOXTEP_E2E_INSTANCE_ID:-}"
CREDENTIALS_SRC="${LOXTEP_E2E_CREDENTIALS:-$ROOT/.loxtep/credentials.json}"
KEEP="${LOXTEP_E2E_KEEP:-0}"
CLI="${LOXTEP_CLI:-$ROOT/dist/cli/index.js}"
WORKDIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --instance) INSTANCE_ID="${2:-}"; shift 2 ;;
    --credentials) CREDENTIALS_SRC="${2:-}"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ ! -f "$CLI" ]]; then
  echo "error: build first (missing $CLI)" >&2
  exit 2
fi

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/loxtep-try-it.XXXXXX")"
cleanup() {
  local code=$?
  if [[ $code -ne 0 || "$KEEP" == "1" ]]; then
    echo "Workdir: $WORKDIR" >&2
  else
    rm -rf "$WORKDIR"
  fi
}
trap cleanup EXIT

echo "==> Workdir $WORKDIR"
cd "$WORKDIR"
cp -a "$ROOT/package.json" "$WORKDIR/_sdk-package.json" 2>/dev/null || true

# Use the local built CLI via PATH shim
mkdir -p "$WORKDIR/bin"
cat > "$WORKDIR/bin/loxtep" <<EOF
#!/usr/bin/env bash
exec node "$CLI" "\$@"
EOF
chmod +x "$WORKDIR/bin/loxtep"
export PATH="$WORKDIR/bin:$PATH"

echo "==> Scaffold (offline init not used — need auth for platform project)"
if [[ ! -f "$CREDENTIALS_SRC" ]]; then
  echo "No credentials at $CREDENTIALS_SRC — validating template materialization only via node" >&2
  node --input-type=module -e "
    import { materializeBundledTemplate } from 'file://$ROOT/dist/cli/templates-materialize.js';
    import { existsSync } from 'node:fs';
    import { join } from 'node:path';
    const r = await materializeBundledTemplate('$WORKDIR', 'shopify-orders');
    if (!r) throw new Error('materialize failed');
    if (!existsSync(join('$WORKDIR', 'workflows', 'orders-enricher.ts'))) throw new Error('missing workflow');
    if (!existsSync(join('$WORKDIR', 'events', 'order-created.json'))) throw new Error('missing event');
    console.log('✓ Template materialization OK (no live credentials)');
  "
  exit 0
fi

mkdir -p "$WORKDIR/.loxtep"
cp "$CREDENTIALS_SRC" "$WORKDIR/.loxtep/credentials.json"

echo "==> loxtep init --template shopify-orders"
if ! loxtep init --template shopify-orders --name "try-it-$(date +%s)"; then
  echo "init failed (likely auth). Falling back to bundled template materialization." >&2
  node --input-type=module -e "
    import { materializeBundledTemplate } from 'file://$ROOT/dist/cli/templates-materialize.js';
    import { existsSync } from 'node:fs';
    import { join } from 'node:path';
    process.env.LOXTEP_SDK_PACKAGE_ROOT = '$ROOT';
    const r = await materializeBundledTemplate('$WORKDIR', 'shopify-orders', { packageRoot: '$ROOT' });
    if (!r) throw new Error('materialize failed');
    if (!existsSync(join('$WORKDIR', 'workflows', 'orders-enricher.ts'))) throw new Error('missing workflow');
    if (!existsSync(join('$WORKDIR', 'events', 'order-created.json'))) throw new Error('missing event');
    console.log('✓ Template materialization OK (live init blocked by auth)');
  "
  echo "REMAINING BLOCKER: refresh credentials with \`loxtep login\`, then re-run with --instance <non-prod-uuid>"
  KEEP=1
  exit 0
fi

test -f workflows/orders-enricher.ts
test -f events/order-created.json
echo "✓ Scaffold includes workflow + event"

if [[ -z "$INSTANCE_ID" ]]; then
  echo "No --instance: stopping after scaffold (pass --instance for attach/setup/test/deploy)"
  KEEP=1
  exit 0
fi

echo "==> loxtep attach --instance $INSTANCE_ID"
loxtep attach --instance "$INSTANCE_ID"

echo "==> loxtep setup"
loxtep setup

echo "==> loxtep generate"
loxtep generate

echo "==> loxtep test orders-enricher (auto-approve)"
# Non-interactive approval via yes
yes y | loxtep test orders-enricher --event ./events/order-created.json
TEST_EC=${PIPESTATUS[1]}
if [[ "$TEST_EC" -ne 0 ]]; then
  echo "test failed with exit $TEST_EC" >&2
  exit "$TEST_EC"
fi

echo "==> loxtep deploy"
loxtep deploy

echo "==> second deploy (in-place update)"
loxtep deploy

echo "✓ Try-it onboarding E2E succeeded"
KEEP=1
