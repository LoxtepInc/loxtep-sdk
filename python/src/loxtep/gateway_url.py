"""
Build request URLs against Loxtep's shared API gateway host.

Port of the Node SDK's ``nodejs/src/config/platform-request-url.ts``. Loxtep's shared
API host routes each **microservice** as the first path segment (e.g. ``…/dataproducts/...``,
``…/workflows/…``, ``…/app/…`` for ``observe``). The SDK's relative paths (e.g.
``/dataproducts``, ``/workflows/projects``) are the **API Gateway resource tree** for that
service, so the public URL is usually ``{host}/{microservice}{same_path}``, and when
``path`` already begins with a microservice (e.g. ``/ai/…``, ``/graph/…``) we do **not**
add another segment.

Keep this in sync with the Node.js implementation — see that file's history for the two
bugs this port fixes relative to Python's previous (nonexistent) routing: query strings
must survive the rewrite, and the ``/dataproducts`` doubling must not apply to sibling
resources like ``datacontracts``/``warehouse``.
"""

import os

# Paths that are already correct from the host root (include the gateway's first segment in `path`).
_PATH_ALREADY_HAS_SERVICE_PREFIX = ("ai", "graph")

MICROSERVICE_OVERRIDES: dict[str, str] = {
    # Observe, botmon-style routes live in the `app` microservice.
    "observe": "app",
    # Global rate limit discovery (if deployed on app stack).
    "rate-limits": "app",
}

# Sibling resources that live directly under the `dataproducts` microservice root
# (e.g. `/dataproducts/warehouse/...`), as opposed to being nested one level deeper
# under the `dataproducts` *resource* itself (e.g. `/dataproducts/dataproducts/...`,
# which is what the `/dataproducts/dataproducts/...` doubling below is for).
# A path like `/dataproducts/datacontracts` must NOT be doubled — the real route is
# `/dataproducts/datacontracts`, not `/dataproducts/dataproducts/datacontracts`.
DATAPRODUCTS_SIBLING_RESOURCES: frozenset[str] = frozenset(
    {
        "datacontracts",
        "quality-metrics",
        "quality-rules",
        "templates",
        "warehouse",
        "alerts",
        "lineage",
        "exports",
        "connector-packages",
        "openmetadata",
        "agents",
        "ai",
    }
)


def _get_search_microservice_from_env() -> str:
    return os.environ.get("LOXTEP_PLATFORM_SEARCH_MS", "").strip() or "graph"


def _split_path_and_query(path: str) -> tuple[str, str]:
    """Split path and optional query string (`?…`); query includes the leading `?` when present."""
    q = path.find("?")
    if q < 0:
        return path, ""
    return path[:q], path[q:]


def get_gateway_microservice_id(path: str) -> str:
    """
    Return the public URL path (first segment) for the service that handles this request path,
    before overrides. Typically the first segment of `path` is the **resource** name in CDK,
    which is often the same as the microservice id (`dataproducts`, `workflows`, `organizations`, …).
    """
    pathname, _ = _split_path_and_query(path)
    segments = [s for s in pathname.lstrip("/").split("/") if s]
    first = segments[0] if segments else ""
    if first == "search":
        return _get_search_microservice_from_env()
    return MICROSERVICE_OVERRIDES.get(first, first)


def build_platform_request_url(api_host: str, path: str) -> str:
    """
    Build a full request URL for a shared control-plane host.

    - `/ai/…`, `/graph/…`: `path` is already a full public path from the host root.
    - `/dataproducts/…`: SDK paths for the `dataproducts` resource itself are in-service;
      public routes are `…/dataproducts/dataproducts/…`. Sibling resources that live
      directly under the `dataproducts` microservice root (`datacontracts`, `quality-metrics`,
      `templates`, `warehouse`, … — see `DATAPRODUCTS_SIBLING_RESOURCES`) are NOT doubled:
      `…/dataproducts/datacontracts`.
    - Most other services: in-service path starts with a microservice segment
      (e.g. `/workflows/projects`); public is `…/workflows/projects` (do **not** prepend
      the microservice again).
    - One-segment paths (e.g. `/workflows`, `/search`, `/governance`) still need a prefix:
      `…/workflows/workflow`, `…/graph/search`, `…/governance/governance`.
    - Query strings on `path` (e.g. `?page_size=1`) are preserved on the returned URL.
    """
    host = api_host.rstrip("/")
    pathname, search = _split_path_and_query(path)
    p = pathname if pathname.startswith("/") else f"/{pathname}"

    first_segment = p.lstrip("/").split("/", 1)[0] if len(p) > 1 else ""
    if first_segment in _PATH_ALREADY_HAS_SERVICE_PREFIX:
        return f"{host}{p}{search}"

    if not p or p == "/":
        return f"{host}{search}"

    segments = [s for s in p.lstrip("/").split("/") if s]
    if not segments:
        return f"{host}{search}"

    first = segments[0]
    microservice = get_gateway_microservice_id(p)

    if first == "dataproducts":
        second = segments[1] if len(segments) > 1 else None
        if second and second in DATAPRODUCTS_SIBLING_RESOURCES:
            return f"{host}{p}{search}"
        return f"{host}/dataproducts/dataproducts{p[len('/dataproducts'):]}{search}"

    if len(segments) == 1:
        if not microservice:
            return f"{host}{p}{search}"
        return f"{host}/{microservice}{p}{search}"

    if first == microservice:
        return f"{host}{p}{search}"
    if microservice:
        return f"{host}/{microservice}{p}{search}"
    return f"{host}{p}{search}"
