#!/usr/bin/env bash
# Live CLI E2E — drives the real `loxtep` binary against the platform API.
# Not Jest. Requires a prior pwd-local login (or an explicit credentials file).
#
# Usage:
#   # Minimal (auth + workspace scaffold) — works with platform credentials only:
#   pnpm run test:e2e:cli
#
#   # Full attach + generate (needs an instance whose API allows workspace context):
#   pnpm run test:e2e:cli -- --instance <uuid>
#
#   ./scripts/cli-e2e.sh [--instance <uuid>] [--credentials <file>] [--keep]
#
# Env:
#   LOXTEP_E2E_INSTANCE_ID   Optional; enables attach + generate when set
#   LOXTEP_E2E_CREDENTIALS   Credentials.json to copy (default: ./.loxtep/credentials.json)
#   LOXTEP_E2E_KEEP=1        Keep temp workdir on success
#   LOXTEP_E2E_WORKDIR       Use this dir instead of mktemp (implies keep)
#   LOXTEP_E2E_SOFT_ATTACH=1 Attach/generate failures become warnings (still exit 0)
#   LOXTEP_CLI               Override CLI binary (default: dist/cli/index.js)
#
# Exit 0 only if required steps succeed (and optional attach steps unless soft).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

INSTANCE_ID="${LOXTEP_E2E_INSTANCE_ID:-}"
CREDENTIALS_SRC="${LOXTEP_E2E_CREDENTIALS:-$ROOT/.loxtep/credentials.json}"
KEEP="${LOXTEP_E2E_KEEP:-0}"
WORKDIR="${LOXTEP_E2E_WORKDIR:-}"
SOFT_ATTACH="${LOXTEP_E2E_SOFT_ATTACH:-0}"
CLI="${LOXTEP_CLI:-$ROOT/dist/cli/index.js}"
NAME="cli-e2e-$(date +%Y%m%d-%H%M%S)"

usage() {
  sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --instance)
      INSTANCE_ID="${2:-}"
      shift 2
      ;;
    --credentials)
      CREDENTIALS_SRC="${2:-}"
      shift 2
      ;;
    --keep)
      KEEP=1
      shift
      ;;
    --soft-attach)
      SOFT_ATTACH=1
      shift
      ;;
    --name)
      NAME="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage
      ;;
  esac
done

if [[ ! -f "$CLI" ]]; then
  echo "error: CLI binary not found at $CLI — run: pnpm run build" >&2
  exit 2
fi

if [[ ! -f "$CREDENTIALS_SRC" ]]; then
  echo "error: no credentials at $CREDENTIALS_SRC" >&2
  echo "hint: from $ROOT run: loxtep login" >&2
  exit 2
fi

if [[ -z "$WORKDIR" ]]; then
  WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/loxtep-cli-e2e.XXXXXX")"
else
  mkdir -p "$WORKDIR"
  KEEP=1
fi

LOG="$WORKDIR/e2e.log"
FAILED=0

cleanup() {
  local code=$?
  if [[ $code -ne 0 || "$FAILED" -ne 0 ]]; then
    echo "" >&2
    echo "E2E FAILED. Workdir kept: $WORKDIR" >&2
    echo "Tail of $LOG:" >&2
    tail -n 50 "$LOG" >&2 || true
    [[ "$KEEP" == "1" ]] || true
    exit 1
  fi
  if [[ "$KEEP" != "1" ]]; then
    rm -rf "$WORKDIR"
  else
    echo "Kept workdir: $WORKDIR"
  fi
}
trap cleanup EXIT

loxtep() {
  (cd "$WORKDIR" && node "$CLI" "$@")
}

step() {
  local label="$1"
  shift
  echo ""
  echo "==> $label"
  echo "==> $label" >>"$LOG"
  echo "\$ loxtep $*" | tee -a "$LOG"
  if ! loxtep "$@" >>"$LOG" 2>&1; then
    echo "FAIL: $label" >&2
    FAILED=1
    return 1
  fi
  echo "OK: $label"
}

soft_step() {
  local label="$1"
  shift
  echo ""
  echo "==> $label (soft)"
  echo "==> $label (soft)" >>"$LOG"
  echo "\$ loxtep $*" | tee -a "$LOG"
  if ! loxtep "$@" >>"$LOG" 2>&1; then
    echo "WARN: $label failed (continuing)" | tee -a "$LOG" >&2
    return 0
  fi
  echo "OK: $label"
}

optional_step() {
  local label="$1"
  shift
  if [[ "$SOFT_ATTACH" == "1" ]]; then
    soft_step "$label" "$@" || true
  else
    step "$label" "$@"
  fi
}

assert_file() {
  local path="$1"
  if [[ ! -f "$WORKDIR/$path" ]]; then
    echo "FAIL: missing file $path in $WORKDIR" >&2
    FAILED=1
    return 1
  fi
  echo "OK: file $path"
}

assert_log_match() {
  local pat="$1"
  local label="$2"
  if ! grep -Eq "$pat" "$LOG"; then
    echo "FAIL: $label (pattern /$pat/ not in log)" >&2
    FAILED=1
    return 1
  fi
  echo "OK: $label"
}

echo "CLI E2E"
echo "  cli:         $CLI"
echo "  workdir:     $WORKDIR"
echo "  credentials: $CREDENTIALS_SRC"
echo "  instance:    ${INSTANCE_ID:-"(none — workspace phase only)"}"
echo "  soft_attach: $SOFT_ATTACH"
echo "  project:     $NAME"
echo "  log:         $LOG"

mkdir -p "$WORKDIR/.loxtep"
cp "$CREDENTIALS_SRC" "$WORKDIR/.loxtep/credentials.json"
chmod 600 "$WORKDIR/.loxtep/credentials.json"

{
  echo "started_at=$(date -Iseconds)"
  echo "instance=${INSTANCE_ID:-}"
  echo "name=$NAME"
} >"$LOG"

# --- Phase A: platform auth + workspace scaffold (required) ---
step "whoami (auth)" whoami
assert_log_match '^User:' "whoami printed User"

step "init project" init --name "$NAME"
assert_file ".loxtep/project.json"
if [[ ! -d "$WORKDIR/workflows" ]]; then
  echo "FAIL: missing workflows/ after init" >&2
  FAILED=1
else
  echo "OK: dir workflows/"
fi

step "projects list" projects list
soft_step "instances list" instances list
step "status (pre-attach)" status
step "whoami (post-init)" whoami

# --- Phase B: attach + generate (optional; instance-scoped APIs vary) ---
if [[ -n "$INSTANCE_ID" ]]; then
  optional_step "attach instance" attach --instance "$INSTANCE_ID"
  if [[ "$FAILED" -eq 0 || "$SOFT_ATTACH" == "1" ]]; then
    if python3 - "$WORKDIR/.loxtep/project.json" "$INSTANCE_ID" <<'PY'
import json, sys
path, expect = sys.argv[1], sys.argv[2]
data = json.load(open(path))
got = data.get("instance_id") or data.get("instanceId")
if got != expect:
    raise SystemExit(f"instance_id mismatch: got={got!r} expect={expect!r}")
print("OK: project.json instance_id")
PY
    then
      :
    else
      if [[ "$SOFT_ATTACH" == "1" ]]; then
        echo "WARN: instance_id not written (continuing)" | tee -a "$LOG" >&2
      else
        FAILED=1
      fi
    fi
  fi

  soft_step "data-products list" data-products list
  optional_step "generate" generate
  if [[ -f "$WORKDIR/.loxtep/generated/index.ts" ]]; then
    echo "OK: file .loxtep/generated/index.ts"
  elif [[ "$SOFT_ATTACH" == "1" ]]; then
    echo "WARN: generate output missing (continuing)" | tee -a "$LOG" >&2
  else
    echo "FAIL: missing .loxtep/generated/index.ts" >&2
    FAILED=1
  fi

  optional_step "status (post-attach)" status
fi

if [[ "$FAILED" -ne 0 ]]; then
  exit 1
fi

echo ""
echo "E2E PASSED"
echo "  workdir: $WORKDIR"
echo "  log:     $LOG"
