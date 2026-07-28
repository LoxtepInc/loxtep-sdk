"""
Typed workspace-context codegen pipeline for `loxtep generate` — emits a Python module
(`.loxtep/generated/__init__.py`) instead of Node's `.loxtep/generated/index.ts`.

Port of nodejs/src/codegen/{load-workspace-context,normalize,emit,write-artifact}.ts.
Deliberately consolidated into one module (Python doesn't need the same four-file split
for this amount of logic). Skill validation (`.loxtep/skills/`) has no Python port yet
and is intentionally not included — `generate` here only does load → normalize → emit
→ write.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import uuid
from pathlib import Path
from pprint import pformat
from typing import Any, NamedTuple

MAX_PAGE_SIZE = 100
GENERATED_ARTIFACT_PATH = os.path.join(".loxtep", "generated", "__init__.py")


# ---------------------------------------------------------------------------
# Stage 1 (I/O): load the raw workspace context from the control plane
# ---------------------------------------------------------------------------


def _fetch_all_pages(fetch_page: Any) -> list[dict[str, Any]]:
    """Fetch every page from a `list()`-style API and return the flattened items.
    Stops once a page comes back shorter than MAX_PAGE_SIZE (the last page)."""
    all_items: list[dict[str, Any]] = []
    page = 1
    while True:
        result = fetch_page(page)
        items = result.get("items", []) if isinstance(result, dict) else []
        all_items.extend(items)
        if len(items) < MAX_PAGE_SIZE:
            break
        page += 1
    return all_items


def _extract_queues_from_observe(observe_data: Any) -> list[dict[str, str]]:
    if not isinstance(observe_data, dict):
        return []
    queues = observe_data.get("queues")
    if not isinstance(queues, list):
        queues = (observe_data.get("data") or {}).get("queues") if isinstance(observe_data.get("data"), dict) else None
    if not isinstance(queues, list):
        return []
    result: list[dict[str, str]] = []
    for q in queues:
        if not isinstance(q, dict):
            continue
        name = q.get("queue_name") or q.get("name") or ""
        qid = q.get("queue_id") or q.get("id") or ""
        if name:
            result.append({"name": name, "id": qid or name})
    return result


def load_workspace_context(client: Any, project_id: str) -> dict[str, Any]:
    """Fetch all workspace resources from the control plane and assemble them into
    a workspace context dict. The client must be configured with a valid project_id."""
    data_products_items = _fetch_all_pages(
        lambda page: client.build.data_products.list(page=page, page_size=MAX_PAGE_SIZE)
    )
    connectors_items = _fetch_all_pages(
        lambda page: client.connect.connectors.list(page=page, page_size=MAX_PAGE_SIZE)
    )
    domains_items = _fetch_all_pages(
        lambda page: client.define.domains.list(page=page, page_size=MAX_PAGE_SIZE)
    )
    workflow_items = _fetch_all_pages(
        lambda page: client.build.workflows.list(project_id=project_id, page=page, page_size=MAX_PAGE_SIZE)
    )
    # `flows` and `workflows` are the same backend entity; kept as two collections
    # in the generated artifact, sourced from one fetch (matches Node).
    flow_items = workflow_items

    try:
        observe_data = client.observe.status()
        queues_raw = _extract_queues_from_observe(observe_data)
    except Exception:
        # Observe may be unreachable (e.g. no instance configured) — acceptable;
        # queues are instance-level and may not be reachable during initial setup.
        queues_raw = []

    data_products = [
        {
            "name": dp.get("name"),
            "id": dp.get("data_product_id"),
            "domain": dp.get("domain_id"),
            "schema": dp.get("schema"),
        }
        for dp in data_products_items
    ]
    connectors = [
        {
            "type": c.get("connector_type"),
            "id": c.get("connector_id"),
            "connection_id": None,
            "name": (c.get("metadata") or {}).get("name") or c.get("connector_type"),
        }
        for c in connectors_items
    ]
    domains = [
        {
            "name": d.get("name"),
            "id": d.get("domain_id"),
            "data_product_ids": [
                dp["id"] for dp in data_products if dp["domain"] == d.get("domain_id")
            ],
        }
        for d in domains_items
    ]
    flows = [{"name": f.get("name"), "id": f.get("workflow_id")} for f in flow_items]
    workflows = [{"name": w.get("name"), "id": w.get("workflow_id")} for w in workflow_items]

    return {
        "data_products": data_products,
        "connectors": connectors,
        "domains": domains,
        "queues": queues_raw,
        "flows": flows,
        "workflows": workflows,
    }


# ---------------------------------------------------------------------------
# Stage 2: normalize — deterministic key derivation + canonical ordering
# ---------------------------------------------------------------------------


class NormalizedResource(NamedTuple):
    key: str
    data: dict[str, Any]


def derive_key(name: str) -> str:
    """Derive a deterministic, valid Python identifier key from a resource name.

    1. Lowercase the name
    2. Replace any run of non-alphanumeric characters with a single `_`
    3. Trim leading/trailing `_`
    4. If result is empty or starts with a digit, prefix with `_`
    """
    key = name.lower()
    key = re.sub(r"[^a-z0-9]+", "_", key)
    key = key.strip("_")
    if not key or key[0].isdigit():
        key = "_" + key
    return key


def _normalize_collection(resources: list[dict[str, Any]]) -> list[NormalizedResource]:
    """Sort by id ascending (canonical ordering), derive a key from each resource's
    name, and resolve collisions with `_2`, `_3`, ... in id-sorted order."""
    sorted_resources = sorted(resources, key=lambda r: r.get("id") or "")
    key_counts: dict[str, int] = {}
    result: list[NormalizedResource] = []
    for resource in sorted_resources:
        base_key = derive_key(str(resource.get("name") or ""))
        count = key_counts.get(base_key, 0)
        key_counts[base_key] = count + 1
        key = base_key if count == 0 else f"{base_key}_{count + 1}"
        result.append(NormalizedResource(key=key, data=resource))
    return result


def normalize_context(ctx: dict[str, Any]) -> dict[str, list[NormalizedResource]]:
    return {
        "data_products": _normalize_collection(ctx["data_products"]),
        "connectors": _normalize_collection(ctx["connectors"]),
        "domains": _normalize_collection(ctx["domains"]),
        "queues": _normalize_collection(ctx["queues"]),
        "flows": _normalize_collection(ctx["flows"]),
        "workflows": _normalize_collection(ctx["workflows"]),
    }


# ---------------------------------------------------------------------------
# Stage 3: emit — render Python source from the normalized context
# ---------------------------------------------------------------------------

_COLLECTION_FIELDS: dict[str, tuple[str, ...]] = {
    "data_products": ("name", "id", "domain", "schema"),
    "connectors": ("name", "type", "id", "connection_id"),
    "domains": ("name", "id", "data_product_ids"),
    "queues": ("name", "id"),
    "flows": ("name", "id"),
    "workflows": ("name", "id"),
}


def _compute_context_hash(norm: dict[str, list[NormalizedResource]]) -> str:
    """Deterministic short hash for cache-invalidation display, purely local to this
    generator — not intended to numerically match Node's own artifact hash (different
    serialization), only to change when the underlying context does."""
    serializable = {
        collection: [{"key": r.key, "data": r.data} for r in resources]
        for collection, resources in norm.items()
    }
    serialized = json.dumps(serializable, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:8]


def _emit_collection(const_name: str, collection: str, resources: list[NormalizedResource]) -> str:
    fields = _COLLECTION_FIELDS[collection]
    if not resources:
        return f"{const_name}: dict[str, dict[str, Any]] = {{}}"
    entries = {r.key: {f: r.data.get(f) for f in fields} for r in resources}
    body = pformat(entries, indent=4, width=100, sort_dicts=False)
    return f"{const_name}: dict[str, dict[str, Any]] = {body}"


def emit_artifact(norm: dict[str, list[NormalizedResource]]) -> str:
    """Render a normalized context into a complete Python source string."""
    context_hash = _compute_context_hash(norm)
    header = [
        "# .loxtep/generated/__init__.py  (AUTO-GENERATED — do not edit)",
        f"# Context hash: {context_hash}",
        "",
        "from typing import Any",
        "",
    ]

    blocks = [
        _emit_collection("DATA_PRODUCTS", "data_products", norm["data_products"]),
        _emit_collection("CONNECTORS", "connectors", norm["connectors"]),
        _emit_collection("DOMAINS", "domains", norm["domains"]),
        _emit_collection("QUEUES", "queues", norm["queues"]),
        _emit_collection("FLOWS", "flows", norm["flows"]),
        _emit_collection("WORKFLOWS", "workflows", norm["workflows"]),
    ]

    workspace = (
        "WORKSPACE: dict[str, dict[str, dict[str, Any]]] = {\n"
        '    "data_products": DATA_PRODUCTS,\n'
        '    "connectors": CONNECTORS,\n'
        '    "domains": DOMAINS,\n'
        '    "queues": QUEUES,\n'
        '    "flows": FLOWS,\n'
        '    "workflows": WORKFLOWS,\n'
        "}\n"
    )

    parts = header + [blocks[0], "", blocks[1], "", blocks[2], "", blocks[3], "", blocks[4], "", blocks[5], "", workspace]
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Stage 4: write — atomic file overwrite returning per-type counts
# ---------------------------------------------------------------------------


def compute_counts(norm: dict[str, list[NormalizedResource]]) -> dict[str, int]:
    return {collection: len(resources) for collection, resources in norm.items()}


def write_artifact(target_path: str, source: str, norm: dict[str, list[NormalizedResource]]) -> dict[str, int]:
    """Write the generated artifact source to disk atomically (write to a temp file
    in the same directory, then rename over the target) and return per-type counts."""
    target = Path(target_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    temp_path = target.parent / f".loxtep-gen-{uuid.uuid4().hex[:16]}.tmp"
    try:
        temp_path.write_text(source, encoding="utf-8")
        temp_path.replace(target)
    except OSError:
        temp_path.unlink(missing_ok=True)
        raise
    return compute_counts(norm)
