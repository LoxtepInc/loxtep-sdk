#!/usr/bin/env bash
# Live CLI E2E — drives the real `loxtep` binary against the platform API.
# Not Jest. Requires a prior pwd-local login (or an explicit credentials file).
#
# Usage:
#   # Phase A only (auth + workspace scaffold):
#   pnpm run test:e2e:cli
#
#   # Complete lifecycle (requires instance):
#   #   attach → generate → ingest → lint → push → deploy → transform → surface sweep
#   pnpm run test:e2e:cli -- --instance <uuid> --keep
#
#   ./scripts/cli-e2e.sh [--instance <uuid>] [--credentials <file>] [--keep] [--name <name>]
#
# Env:
#   LOXTEP_E2E_INSTANCE_ID   Enables Phase B+C+D (complete lifecycle)
#   LOXTEP_E2E_CREDENTIALS   Credentials.json to copy (default: ./.loxtep/credentials.json)
#   LOXTEP_E2E_KEEP=1        Keep temp workdir on success
#   LOXTEP_E2E_WORKDIR       Use this dir instead of mktemp (implies keep)
#   LOXTEP_CLI               Override CLI binary (default: dist/cli/index.js)
#
# Exit 0 only if every invoked step succeeds.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

INSTANCE_ID="${LOXTEP_E2E_INSTANCE_ID:-}"
CREDENTIALS_SRC="${LOXTEP_E2E_CREDENTIALS:-$ROOT/.loxtep/credentials.json}"
KEEP="${LOXTEP_E2E_KEEP:-0}"
WORKDIR="${LOXTEP_E2E_WORKDIR:-}"
CLI="${LOXTEP_CLI:-$ROOT/dist/cli/index.js}"
NAME="cli-e2e-$(date +%Y%m%d-%H%M%S)"
INGEST_NAME=""

usage() {
  sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      ;;
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

INGEST_NAME="e2e-$(echo "$NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g' | cut -c1-40)"

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
    tail -n 80 "$LOG" >&2 || true
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

# Optional review APIs: grokbot (and other scoped roles) may lack improvements/cdlc/candidates.
# Skip RBAC denials; still fail hard on unexpected errors.
step_rbac() {
  local label="$1"
  shift
  echo ""
  echo "==> $label"
  echo "==> $label" >>"$LOG"
  echo "\$ loxtep $*" | tee -a "$LOG"
  local out rc
  set +e
  out="$(loxtep "$@" 2>&1)"
  rc=$?
  set -e
  printf '%s\n' "$out" >>"$LOG"
  if [[ "$rc" -eq 0 ]]; then
    echo "OK: $label"
    return 0
  fi
  if printf '%s\n' "$out" | grep -Eqi 'insufficient permissions|Access denied'; then
    echo "SKIP: $label (RBAC)" | tee -a "$LOG"
    return 0
  fi
  echo "FAIL: $label" >&2
  FAILED=1
  return 1
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

assert_dir() {
  local path="$1"
  if [[ ! -d "$WORKDIR/$path" ]]; then
    echo "FAIL: missing dir $path in $WORKDIR" >&2
    FAILED=1
    return 1
  fi
  echo "OK: dir $path"
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
echo "  instance:    ${INSTANCE_ID:-"(none — Phase A only)"}"
echo "  project:     $NAME"
echo "  ingest:      ${INSTANCE_ID:+$INGEST_NAME}"
echo "  log:         $LOG"
if [[ -n "$INSTANCE_ID" ]]; then
  echo "  mode:        complete (attach → ingest/push/deploy → transform → surface sweep)"
else
  echo "  mode:        Phase A only (pass --instance for complete lifecycle)"
fi

mkdir -p "$WORKDIR/.loxtep"
cp "$CREDENTIALS_SRC" "$WORKDIR/.loxtep/credentials.json"
chmod 600 "$WORKDIR/.loxtep/credentials.json"

{
  echo "started_at=$(date -Iseconds)"
  echo "instance=${INSTANCE_ID:-}"
  echo "name=$NAME"
  echo "ingest=${INGEST_NAME}"
} >"$LOG"

# --- Phase A: platform auth + workspace scaffold ---
step "whoami (auth)" whoami
assert_log_match '^User:' "whoami printed User"

step "init project" init --name "$NAME"
assert_file ".loxtep/project.json"
assert_dir "workflows"

step "projects list" projects list
step "instances list" instances list
step "status (pre-attach)" status
step "whoami (post-init)" whoami

if [[ -z "$INSTANCE_ID" ]]; then
  if [[ "$FAILED" -ne 0 ]]; then
    exit 1
  fi
  echo ""
  echo "E2E PASSED (Phase A only — pass --instance for complete lifecycle)"
  echo "  workdir: $WORKDIR"
  echo "  log:     $LOG"
  exit 0
fi

# --- Phase B: attach + generate ---
step "attach instance" attach --instance "$INSTANCE_ID"
if ! python3 - "$WORKDIR/.loxtep/project.json" "$INSTANCE_ID" <<'PY'
import json, sys
path, expect = sys.argv[1], sys.argv[2]
data = json.load(open(path))
got = data.get("instance_id") or data.get("instanceId")
if got != expect:
    raise SystemExit(f"instance_id mismatch: got={got!r} expect={expect!r}")
print("OK: project.json instance_id")
PY
then
  FAILED=1
fi

step "instances stream-config" instances stream-config "$INSTANCE_ID"
assert_log_match '"LeoEvent"|"Region"' "stream-config returned Leo resources"

step "data-products list" data-products list
step "generate" generate
assert_file ".loxtep/generated/index.ts"
step "status (post-attach)" status

# --- Phase C: documented build & deploy happy path ---
# Help examples: ingest create → lint → push → deploy [--dry-run] → deploy
step "connectors list" connectors list --type sdk
step "domains list" domains list
step "workflows list (pre-ingest)" workflows list

step "ingest create" ingest create --name "$INGEST_NAME"
# Ingest writes workflow + DP JSON under workflows/ and related package paths.
if ! find "$WORKDIR/workflows" -type f -name '*.json' 2>/dev/null | grep -q .; then
  # Some packages land under nested dirs; also check common ingest outputs.
  if ! find "$WORKDIR" -type f \( -path '*/workflows/*.json' -o -name 'sdk-ingest-bundle.json' -o -path '*/.loxtep/*ingest*' \) 2>/dev/null | grep -q .; then
    echo "FAIL: ingest create wrote no workflow/package JSON under $WORKDIR" >&2
    find "$WORKDIR" -type f 2>/dev/null | head -80 >>"$LOG" || true
    FAILED=1
  else
    echo "OK: ingest package files present"
  fi
else
  echo "OK: workflows/*.json after ingest"
fi

step "lint" lint
step "push" push
step "deploy (dry-run)" deploy --dry-run

# Capture deploy stdout/stderr into the log, then poll the async run_id to completion.
{
  echo ""
  echo "==> deploy"
  echo "==> deploy" >>"$LOG"
  echo "\$ loxtep deploy" | tee -a "$LOG"
}
DEPLOY_OUT="$(mktemp)"
if ! loxtep deploy >"$DEPLOY_OUT" 2>&1; then
  cat "$DEPLOY_OUT" | tee -a "$LOG"
  echo "FAIL: deploy" >&2
  FAILED=1
else
  cat "$DEPLOY_OUT" | tee -a "$LOG"
  echo "OK: deploy"
  RUN_ID="$(python3 - "$DEPLOY_OUT" <<'PY'
import re, sys
text = open(sys.argv[1]).read()
m = re.search(r'run_id=([0-9a-fA-F-]{36})', text)
print(m.group(1) if m else '')
PY
)"
  if [[ -z "$RUN_ID" ]]; then
    echo "FAIL: deploy did not print run_id=…" >&2
    FAILED=1
  else
    echo "OK: deploy run_id=$RUN_ID"
    DEPLOY_ATTEMPT=1
    while [[ "$DEPLOY_ATTEMPT" -le 2 && "$FAILED" -eq 0 ]]; do
      echo ""
      echo "==> poll deploy run (attempt $DEPLOY_ATTEMPT)"
      echo "==> poll deploy run ($RUN_ID attempt=$DEPLOY_ATTEMPT)" >>"$LOG"
      POLL_OK=0
      DEPLOY_EMPTY=0
      for _ in $(seq 1 60); do
        POLL_OUT="$(mktemp)"
        if loxtep deployments get "$RUN_ID" >"$POLL_OUT" 2>&1; then
          eval "$(python3 - "$POLL_OUT" <<'PY'
import json, sys
raw = open(sys.argv[1]).read()
start = raw.find('{')
if start < 0:
    print('STATUS=""')
    print('DEPLOY_ERROR=""')
    print('WORKFLOW_COUNT="0"')
    raise SystemExit
obj = json.loads(raw[start:])
def sh(k, v):
    print(f'{k}={json.dumps("" if v is None else str(v))}')
sh('STATUS', obj.get('status') or '')
sh('DEPLOY_ERROR', obj.get('error') or '')
sh('WORKFLOW_COUNT', obj.get('workflow_count') if obj.get('workflow_count') is not None else '0')
PY
)"
          echo "  status=$STATUS error=${DEPLOY_ERROR:-none} workflows=$WORKFLOW_COUNT" | tee -a "$LOG"
          case "$STATUS" in
            deployed|succeeded|success|completed)
              if [[ "$DEPLOY_ERROR" == "no_workflows" || "$WORKFLOW_COUNT" == "0" ]]; then
                cat "$POLL_OUT" >>"$LOG"
                DEPLOY_EMPTY=1
                POLL_OK=0
                break
              fi
              POLL_OK=1
              cat "$POLL_OUT" >>"$LOG"
              break
              ;;
            failed|error|cancelled|rejected)
              cat "$POLL_OUT" | tee -a "$LOG"
              echo "FAIL: deploy run ended status=$STATUS" >&2
              FAILED=1
              POLL_OK=0
              break
              ;;
          esac
        fi
        rm -f "$POLL_OUT"
        sleep 2
      done
      if [[ "$POLL_OK" -eq 1 ]]; then
        echo "OK: deploy run $RUN_ID completed"
        break
      fi
      if [[ "$DEPLOY_EMPTY" -eq 1 && "$DEPLOY_ATTEMPT" -lt 2 ]]; then
        echo "WARN: deploy run reported no_workflows — retrying deploy once after settle" | tee -a "$LOG"
        sleep 5
        DEPLOY_RETRY_OUT="$(mktemp)"
        if ! loxtep deploy >"$DEPLOY_RETRY_OUT" 2>&1; then
          cat "$DEPLOY_RETRY_OUT" | tee -a "$LOG"
          echo "FAIL: deploy retry failed" >&2
          FAILED=1
          break
        fi
        cat "$DEPLOY_RETRY_OUT" | tee -a "$LOG"
        RUN_ID="$(python3 - "$DEPLOY_RETRY_OUT" <<'PY'
import re, sys
text = open(sys.argv[1]).read()
m = re.search(r'run_id=([0-9a-fA-F-]{36})', text)
print(m.group(1) if m else '')
PY
)"
        rm -f "$DEPLOY_RETRY_OUT"
        if [[ -z "$RUN_ID" ]]; then
          echo "FAIL: deploy retry did not print run_id=…" >&2
          FAILED=1
          break
        fi
        echo "OK: deploy retry run_id=$RUN_ID"
        DEPLOY_ATTEMPT=$((DEPLOY_ATTEMPT + 1))
        continue
      fi
      if [[ "$DEPLOY_EMPTY" -eq 1 ]]; then
        echo "FAIL: deploy run completed with no_workflows / workflow_count=0" >&2
        FAILED=1
      elif [[ "$FAILED" -eq 0 ]]; then
        echo "FAIL: timed out waiting for deploy run $RUN_ID" >&2
        FAILED=1
      fi
      break
    done

    if [[ "$POLL_OK" -eq 1 ]]; then
      # Status reads per-workflow deployment rows, which lag the project_deploy run
      # (LeoCron can sit idle for minutes on shared sandbox after MS deploys).
      echo ""
      echo "==> wait for status Deploy: deployed"
      echo "==> wait for status Deploy: deployed" >>"$LOG"
      STATUS_OK=0
      for _ in $(seq 1 150); do
        STATUS_OUT="$(mktemp)"
        if loxtep status >"$STATUS_OUT" 2>&1; then
          if grep -Eq '^Deploy:[[:space:]]+deployed( |$)' "$STATUS_OUT"; then
            cat "$STATUS_OUT" | tee -a "$LOG"
            STATUS_OK=1
            break
          fi
          DEPLOY_LINE="$(grep -E '^Deploy:' "$STATUS_OUT" | head -1 || true)"
          echo "  $DEPLOY_LINE" | tee -a "$LOG"
        fi
        rm -f "$STATUS_OUT"
        sleep 5
      done
      if [[ "$STATUS_OK" -ne 1 ]]; then
        echo "FAIL: timed out waiting for loxtep status to show Deploy: deployed" >&2
        FAILED=1
      else
        echo "OK: status shows deployed"
      fi
    fi
  fi
fi
rm -f "$DEPLOY_OUT"

PROJECT_ID="$(python3 -c "import json; print(json.load(open('$WORKDIR/.loxtep/project.json'))['project_id'])")"
step "deployments list" deployments list --project-id "$PROJECT_ID"
step "workflows list (post-deploy)" workflows list
step "observe status" observe status
step "status (post-deploy)" status
# Assert only the post-deploy status block (earlier phases legitimately print never deployed).
if ! awk '/^==> status \(post-deploy\)$/{p=1;next} p && /^==> /{exit} p' "$LOG" | grep -Eq '^Deploy:[[:space:]]+deployed( |$)'; then
  echo "FAIL: post-deploy status does not show Deploy: deployed" >&2
  FAILED=1
else
  echo "OK: post-deploy status shows deployed"
fi

if [[ "$FAILED" -ne 0 ]]; then
  echo "FAIL: Phase C did not settle to a real deploy; not running Phase D" >&2
  exit 1
fi

# Resolve package IDs written by ingest create (needed for get/queue/transform).
eval "$(python3 - "$WORKDIR" "$INGEST_NAME" <<'PY'
import json, sys
from pathlib import Path
root = Path(sys.argv[1])
ingest_name = sys.argv[2]
workflow_id = ''
dp_id = ''
dp_name = ingest_name
connector_id = ''
domain_id = ''
for wf in sorted((root / 'workflows').glob('*')):
    wj = wf / 'workflow.json'
    if not wj.is_file():
        continue
    data = json.loads(wj.read_text())
    workflow_id = str(data.get('workflow_id') or data.get('id') or wf.name)
    for dp in (wf / 'data-products').glob('*.json'):
        d = json.loads(dp.read_text())
        dp_id = str(d.get('data_product_id') or d.get('id') or dp.stem)
        dp_name = str(d.get('name') or dp_name)
        if d.get('domain_id'):
            domain_id = str(d['domain_id'])
        break
    break
for c in sorted((root / 'connectors').glob('*.json')):
    connector_id = c.stem
    break
proj = json.loads((root / '.loxtep' / 'project.json').read_text())
if not domain_id and proj.get('domain_id'):
    domain_id = str(proj['domain_id'])
org_id = str(proj.get('organization_id') or '')
def sh(name, val):
    print(f"{name}={json.dumps(val)}")
sh('WORKFLOW_ID', workflow_id)
sh('DP_ID', dp_id)
sh('DP_NAME', dp_name)
sh('CONNECTOR_ID', connector_id)
sh('DOMAIN_ID', domain_id)
sh('ORG_ID', org_id)
PY
)"

if [[ -z "${WORKFLOW_ID:-}" || -z "${DP_ID:-}" || -z "${CONNECTOR_ID:-}" ]]; then
  echo "FAIL: could not resolve workflow/data-product/connector ids from package files" >&2
  FAILED=1
else
  echo "OK: package ids workflow=$WORKFLOW_ID dp=$DP_ID connector=$CONNECTOR_ID"
fi

# --- Phase D: transform + broad CLI surface (reads + safe creates) ---
TRANSFORM_NAME="cleaned-${INGEST_NAME}"
step "transform create" transform create --from "$DP_NAME" --name "$TRANSFORM_NAME"
step "lint (post-transform)" lint
step "projects get" projects get "$PROJECT_ID"
step "projects list --source local" projects list --source local
step "projects changes" projects changes
step "workflows get" workflows get "$WORKFLOW_ID"
step "triggers list" triggers list --project-id "$PROJECT_ID"
step "data-products get" data-products get "$DP_ID"
step "data-products readiness" data-products readiness "$DP_ID"
step "queue info" queue info "$DP_ID"
step "connectors test" connectors test "$CONNECTOR_ID"
step "config list" config list
step "config paths" config paths
step "config export connector" config export --from-connector "$CONNECTOR_ID" --format json
step "config export data-product" config export --from-data-product "$DP_ID" --format json
step "instances get" instances get "$INSTANCE_ID"
if [[ -n "${DOMAIN_ID:-}" ]]; then
  step "domains get" domains get "$DOMAIN_ID"
else
  echo "SKIP: domains get (no domain_id on package)" | tee -a "$LOG"
fi
step "standards list" standards list
step "data-contracts list" data-contracts list
step "packs list" packs list
step "packs status" packs status
step "approvals list" approvals list
step_rbac "improvements list" improvements list
step_rbac "cdlc review-queue" cdlc review-queue
step_rbac "candidates list" candidates list
step_rbac "activity list" activity list
step_rbac "metrics rate-limits" metrics rate-limits
step_rbac "bus login" bus login
step "generate (post-transform)" generate

# Delivery needs a target (non-SDK) connector when available.
TARGET_CONNECTOR="$(
  loxtep connectors list 2>/dev/null | python3 -c '
import json,sys
raw=sys.stdin.read()
start=raw.find("[")
if start<0:
  start=raw.find("{")
if start<0:
  raise SystemExit
obj=json.loads(raw[start:])
items=obj if isinstance(obj,list) else (obj.get("items") or [])
for it in items:
  ctype=(it.get("connector_type") or "")
  if ctype and ctype != "sdk":
    print(it.get("connector_id") or "")
    break
' || true
)"
if [[ -n "$TARGET_CONNECTOR" ]]; then
  step "delivery create" delivery create --from "$TRANSFORM_NAME" --connector-id "$TARGET_CONNECTOR" --name "out-${INGEST_NAME}"
  step "lint (post-delivery)" lint
else
  echo "SKIP: delivery create (no non-sdk connector in org)" | tee -a "$LOG"
fi

step "status (final)" status

if [[ "$FAILED" -ne 0 ]]; then
  exit 1
fi

echo ""
echo "E2E PASSED (complete lifecycle + surface sweep)"
echo "  workdir: $WORKDIR"
echo "  log:     $LOG"
