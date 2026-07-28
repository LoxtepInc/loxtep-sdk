"""
Python CLI: login (via Node CLI subprocess), query, stream, replay (via Python SDK).
Config/credentials from ~/.loxtep (same as Node) or env LOXTEP_*.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from typing import NoReturn


def _print_help(parser: argparse.ArgumentParser) -> None:
    parser.print_help()
    print("""
Examples:
  loxtep login
  loxtep query <data_product_id> "SELECT * FROM t LIMIT 10"
  loxtep stream <data_product_id> [--start <cursor>]
  loxtep replay <data_product_id> [--start <cursor>]
  loxtep workflows list [--project-id <id>]
  loxtep workflows deploy --project-id <id> --instance-id <id> [--version-id <id>] [--force]
  loxtep observe status
  loxtep projects list
  loxtep projects get <project_id>
  loxtep templates list
  loxtep templates get <template_id>
  loxtep generate
  loxtep config export --from-connector <connector_id> [--format sh|json|env]

Config: ~/.loxtep/config.json or LOXTEP_API_URL, LOXTEP_ORGANIZATION_ID, LOXTEP_PROJECT_ID.
Auth: run `loxtep login` (uses Node CLI) or set LOXTEP_TOKEN.
`loxtep generate` emits Python types to .loxtep/generated/__init__.py (Node's `generate`
emits .loxtep/generated/index.ts — each SDK's CLI generates its own language's types;
requires .loxtep/project.json to be attached, i.e. `loxtep attach` (Node CLI) already run).

Any other command (ingest, deploy, transform, push, delivery, workflows create, init,
attach, instances, domains, standards, data-contracts, triggers, improvements,
activity, metrics, bus, lint, bundle, test, ...) delegates to the canonical Node.js CLI
via `npx loxtep ...` — requires Node.js/npx.
""")


# Command surfaces implemented natively in this Python CLI, as (command, subcommand)
# pairs (subcommand is None for commands with no subparser, e.g. `query`, `login`).
# Any invocation that doesn't match one of these delegates to the canonical Node.js CLI
# (`npx loxtep ...`) — the CLI is dev-tooling (auth, scaffolding, deploy), not something
# every language SDK reimplements; see nodejs/src/cli/index.ts for the full command set
# this Python package intentionally does not duplicate (ingest, deploy, transform, push,
# delivery, workflows create, instances, attach, init, generate, domains, standards,
# data-contracts, triggers, improvements, activity, metrics, bus, lint, bundle, test).
_NATIVE_COMMANDS: dict[str, set[str] | None] = {
    "login": None,
    "query": None,
    "stream": None,
    "replay": None,
    "generate": None,
    "workflows": {"list", "deploy"},
    "observe": {"status"},
    "projects": {"list", "get"},
    "templates": {"list", "get"},
    "config": {"export"},
}


def _is_native_command(argv: list[str]) -> bool:
    if not argv:
        return True  # bare `loxtep` -> help
    command = argv[0]
    if command in ("help", "-h", "--help"):
        return True
    subcommands = _NATIVE_COMMANDS.get(command, "unknown")
    if subcommands == "unknown":
        return False
    if subcommands is None:
        return True
    return len(argv) > 1 and argv[1] in subcommands


def _delegate_to_node_cli(argv: list[str]) -> int:
    """Forward an argv this Python CLI doesn't natively implement to `npx loxtep`."""
    try:
        result = subprocess.run(["npx", "loxtep", *argv], cwd=os.getcwd())
        return result.returncode if result.returncode is not None else 0
    except FileNotFoundError:
        print(
            f"loxtep {' '.join(argv)} requires Node.js and npx (this command is implemented "
            "by the canonical @loxtep/sdk CLI, not reimplemented in Python). "
            "Install Node.js, or run: npx loxtep " + " ".join(argv),
            file=sys.stderr,
        )
        return 1


def _cmd_login() -> int:
    """Run Node.js loxtep login via subprocess; credentials written to ~/.loxtep/credentials.json."""
    return _delegate_to_node_cli(["login"])


def _cmd_query(data_product_id: str, sql: str) -> int:
    """Run SQL in data product context using Python SDK."""
    from .cli_config import load_config, get_token_from_env_or_file
    from .client import LoxtepClient

    config = load_config()
    token = get_token_from_env_or_file()
    api_url = config.get("api_url")
    if not api_url:
        print("Missing api_url. Set LOXTEP_API_URL or run: loxtep config set api_url <url> (via Node CLI)", file=sys.stderr)
        return 1
    if not token:
        print("Not logged in. Run: loxtep login", file=sys.stderr)
        return 1

    client = LoxtepClient(
        api_url=api_url,
        auth={"type": "jwt", "token": token},
        organization_id=config.get("organization_id"),
        project_id=config.get("project_id"),
    )
    try:
        result = client.query.query(data_product_id, sql)
        print(json.dumps(result, indent=2))
        return 0
    except Exception as e:
        print(f"Query failed: {e}", file=sys.stderr)
        return 1
    finally:
        client.close()


def _cmd_stream(data_product_id: str, start: str | None) -> int:
    """Stream events from data product using Python SDK."""
    from .cli_config import load_config, get_token_from_env_or_file
    from .client import LoxtepClient

    config = load_config()
    token = get_token_from_env_or_file()
    api_url = config.get("api_url")
    if not api_url:
        print("Missing api_url. Set LOXTEP_API_URL or run: loxtep config set api_url <url> (via Node CLI)", file=sys.stderr)
        return 1
    if not token:
        print("Not logged in. Run: loxtep login", file=sys.stderr)
        return 1

    client = LoxtepClient(
        api_url=api_url,
        auth={"type": "jwt", "token": token},
        organization_id=config.get("organization_id"),
        project_id=config.get("project_id"),
    )
    try:
        for event in client.build.data_products.stream(data_product_id, start=start):
            print(json.dumps(event))
        return 0
    except Exception as e:
        print(f"Stream failed: {e}", file=sys.stderr)
        return 1
    finally:
        client.close()


def _cmd_workflows_list(project_id: str | None) -> int:
    """List workflows using Python SDK. project_id from --project-id or config."""
    from .cli_config import load_config, get_token_from_env_or_file
    from .client import LoxtepClient

    config = load_config()
    token = get_token_from_env_or_file()
    api_url = config.get("api_url")
    if not api_url:
        print("Missing api_url. Set LOXTEP_API_URL or run: loxtep config set api_url <url> (via Node CLI)", file=sys.stderr)
        return 1
    if not token:
        print("Not logged in. Run: loxtep login", file=sys.stderr)
        return 1
    pid = project_id or config.get("project_id")
    if not pid:
        print(
            "Missing project_id. Use: loxtep workflows list --project-id <id> or set LOXTEP_PROJECT_ID / config",
            file=sys.stderr,
        )
        return 1
    client = LoxtepClient(
        api_url=api_url,
        auth={"type": "jwt", "token": token},
        organization_id=config.get("organization_id"),
        project_id=config.get("project_id"),
    )
    try:
        result = client.build.workflows.list(project_id=pid, page_size=50)
        print(json.dumps(result, indent=2))
        return 0
    except Exception as e:
        print(f"Workflows list failed: {e}", file=sys.stderr)
        return 1
    finally:
        client.close()


def _cmd_workflows_deploy(
    project_id: str,
    instance_id: str,
    version_id: str | None,
    force: bool,
) -> int:
    """Deploy project to instance using Python SDK."""
    from .cli_config import load_config, get_token_from_env_or_file
    from .client import LoxtepClient

    config = load_config()
    token = get_token_from_env_or_file()
    api_url = config.get("api_url")
    if not api_url:
        print("Missing api_url. Set LOXTEP_API_URL or run: loxtep config set api_url <url> (via Node CLI)", file=sys.stderr)
        return 1
    if not token:
        print("Not logged in. Run: loxtep login", file=sys.stderr)
        return 1
    client = LoxtepClient(
        api_url=api_url,
        auth={"type": "jwt", "token": token},
        organization_id=config.get("organization_id"),
        project_id=config.get("project_id"),
    )
    try:
        result = client.build.workflows.deploy(
            project_id=project_id,
            instance_id=instance_id,
            version_id=version_id,
            force_redeploy=force,
        )
        print(json.dumps(result, indent=2))
        return 0
    except Exception as e:
        print(f"Deploy failed: {e}", file=sys.stderr)
        return 1
    finally:
        client.close()


def _cmd_observe_status() -> int:
    """Observe status (GET /observe/bots) using Python SDK."""
    from .cli_config import load_config, get_token_from_env_or_file
    from .client import LoxtepClient

    config = load_config()
    token = get_token_from_env_or_file()
    api_url = config.get("api_url")
    if not api_url:
        print("Missing api_url. Set LOXTEP_API_URL or run: loxtep config set api_url <url> (via Node CLI)", file=sys.stderr)
        return 1
    if not token:
        print("Not logged in. Run: loxtep login", file=sys.stderr)
        return 1
    client = LoxtepClient(
        api_url=api_url,
        auth={"type": "jwt", "token": token},
        organization_id=config.get("organization_id"),
        project_id=config.get("project_id"),
    )
    try:
        result = client.observe.status()
        print(json.dumps(result, indent=2))
        return 0
    except Exception as e:
        print(f"Observe status failed: {e}", file=sys.stderr)
        return 1
    finally:
        client.close()


def _cmd_projects_list() -> int:
    """List projects in the organization using Python SDK."""
    from .cli_config import load_config, get_token_from_env_or_file
    from .client import LoxtepClient

    config = load_config()
    token = get_token_from_env_or_file()
    api_url = config.get("api_url")
    if not api_url:
        print("Missing api_url. Set LOXTEP_API_URL or run: loxtep config set api_url <url> (via Node CLI)", file=sys.stderr)
        return 1
    if not token:
        print("Not logged in. Run: loxtep login", file=sys.stderr)
        return 1
    client = LoxtepClient(
        api_url=api_url,
        auth={"type": "jwt", "token": token},
        organization_id=config.get("organization_id"),
        project_id=config.get("project_id"),
    )
    try:
        result = client.workspace.projects.list(page_size=50)
        print(json.dumps(result, indent=2))
        return 0
    except Exception as e:
        print(f"Projects list failed: {e}", file=sys.stderr)
        return 1
    finally:
        client.close()


def _cmd_projects_get(project_id: str) -> int:
    """Get a single project by ID using Python SDK."""
    from .cli_config import load_config, get_token_from_env_or_file
    from .client import LoxtepClient

    config = load_config()
    token = get_token_from_env_or_file()
    api_url = config.get("api_url")
    if not api_url:
        print("Missing api_url. Set LOXTEP_API_URL or run: loxtep config set api_url <url> (via Node CLI)", file=sys.stderr)
        return 1
    if not token:
        print("Not logged in. Run: loxtep login", file=sys.stderr)
        return 1
    client = LoxtepClient(
        api_url=api_url,
        auth={"type": "jwt", "token": token},
        organization_id=config.get("organization_id"),
        project_id=config.get("project_id"),
    )
    try:
        result = client.workspace.projects.get(project_id)
        print(json.dumps(result, indent=2))
        return 0
    except Exception as e:
        print(f"Projects get failed: {e}", file=sys.stderr)
        return 1
    finally:
        client.close()


def _cmd_templates_list() -> int:
    """List templates using Python SDK."""
    from .cli_config import load_config, get_token_from_env_or_file
    from .client import LoxtepClient

    config = load_config()
    token = get_token_from_env_or_file()
    api_url = config.get("api_url")
    if not api_url:
        print("Missing api_url. Set LOXTEP_API_URL or run: loxtep config set api_url <url> (via Node CLI)", file=sys.stderr)
        return 1
    if not token:
        print("Not logged in. Run: loxtep login", file=sys.stderr)
        return 1
    client = LoxtepClient(
        api_url=api_url,
        auth={"type": "jwt", "token": token},
        organization_id=config.get("organization_id"),
        project_id=config.get("project_id"),
    )
    try:
        result = client.connect.templates.list(page_size=50)
        print(json.dumps(result, indent=2))
        return 0
    except Exception as e:
        print(f"Templates list failed: {e}", file=sys.stderr)
        return 1
    finally:
        client.close()


def _cmd_templates_get(template_id: str) -> int:
    """Get a single template by ID using Python SDK."""
    from .cli_config import load_config, get_token_from_env_or_file
    from .client import LoxtepClient

    config = load_config()
    token = get_token_from_env_or_file()
    api_url = config.get("api_url")
    if not api_url:
        print("Missing api_url. Set LOXTEP_API_URL or run: loxtep config set api_url <url> (via Node CLI)", file=sys.stderr)
        return 1
    if not token:
        print("Not logged in. Run: loxtep login", file=sys.stderr)
        return 1
    client = LoxtepClient(
        api_url=api_url,
        auth={"type": "jwt", "token": token},
        organization_id=config.get("organization_id"),
        project_id=config.get("project_id"),
    )
    try:
        result = client.connect.templates.get(template_id)
        print(json.dumps(result, indent=2))
        return 0
    except Exception as e:
        print(f"Templates get failed: {e}", file=sys.stderr)
        return 1
    finally:
        client.close()


def _cmd_replay(data_product_id: str, start: str | None) -> int:
    """Replay events from data product using Python SDK."""
    from .cli_config import load_config, get_token_from_env_or_file
    from .client import LoxtepClient

    config = load_config()
    token = get_token_from_env_or_file()
    api_url = config.get("api_url")
    if not api_url:
        print("Missing api_url. Set LOXTEP_API_URL or run: loxtep config set api_url <url> (via Node CLI)", file=sys.stderr)
        return 1
    if not token:
        print("Not logged in. Run: loxtep login", file=sys.stderr)
        return 1

    client = LoxtepClient(
        api_url=api_url,
        auth={"type": "jwt", "token": token},
        organization_id=config.get("organization_id"),
        project_id=config.get("project_id"),
    )
    try:
        for event in client.build.data_products.replay(data_product_id, start=start):
            print(json.dumps(event))
        return 0
    except Exception as e:
        print(f"Replay failed: {e}", file=sys.stderr)
        return 1
    finally:
        client.close()


def _cmd_generate() -> int:
    """Generate typed Python constants from the connected workspace.

    Python equivalent of Node's `loxtep generate`: emits `.loxtep/generated/__init__.py`
    (Node emits `.loxtep/generated/index.ts`) — codegen output has to match the language
    you're coding in, so unlike most other commands this isn't delegated to the Node CLI.
    Requires an attached project (`.loxtep/project.json` with instance_id/api_url, written
    by `loxtep init` + `loxtep attach` via the Node CLI).
    """
    from .cli_config import get_token_from_env_or_file
    from .client import LoxtepClient
    from .codegen import GENERATED_ARTIFACT_PATH, emit_artifact, load_workspace_context, normalize_context, write_artifact
    from .project_context import ProjectPreconditionError, require_attached_project

    try:
        project_dir, project = require_attached_project()
    except ProjectPreconditionError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    token = get_token_from_env_or_file()
    if not token:
        print("Not logged in. Run: loxtep login", file=sys.stderr)
        return 1

    client = LoxtepClient(
        api_url=project["api_url"],
        auth={"type": "jwt", "token": token},
        organization_id=project.get("organization_id"),
        project_id=project["project_id"],
        streams=project.get("streams"),
    )
    try:
        try:
            context = load_workspace_context(client, project["project_id"])
        except Exception as e:
            print(f"Failed to retrieve workspace context: {e}", file=sys.stderr)
            return 1

        normalized = normalize_context(context)
        source = emit_artifact(normalized)
        artifact_path = os.path.join(project_dir, GENERATED_ARTIFACT_PATH)
        try:
            counts = write_artifact(artifact_path, source, normalized)
        except OSError as e:
            print(f"Failed to write generated artifact: {e}", file=sys.stderr)
            return 1

        print(f"Generated {artifact_path}:")
        print(f"  Data products: {counts['data_products']}")
        print(f"  Connectors:    {counts['connectors']}")
        print(f"  Domains:       {counts['domains']}")
        print(f"  Queues:        {counts['queues']}")
        print(f"  Flows:         {counts['flows']}")
        print(f"  Workflows:     {counts['workflows']}")
        return 0
    finally:
        client.close()


def _cmd_config_export(from_connector: str | None, fmt: str) -> int:
    """Config export: output SDK bootstrap env vars from a connector."""
    from .cli_config import run_config_export_from_connector

    if not from_connector:
        print("Error: --from-connector <connector_id> is required.", file=sys.stderr)
        return 1
    return run_config_export_from_connector(from_connector, fmt=fmt)


def main() -> int:
    raw_argv = sys.argv[1:]
    if not _is_native_command(raw_argv):
        return _delegate_to_node_cli(raw_argv)

    parser = argparse.ArgumentParser(
        prog="loxtep",
        description="Loxtep CLI: login, query, stream, replay (Python SDK; login uses Node CLI).",
    )
    subparsers = parser.add_subparsers(dest="command", help="Command")

    # login
    subparsers.add_parser("login", help="Log in (runs Node.js loxtep login; writes ~/.loxtep/credentials.json)")

    # query data_product_id sql
    q = subparsers.add_parser("query", help="Run SQL in data product context")
    q.add_argument("data_product_id", help="Data product ID")
    q.add_argument("sql", help="SQL query string")

    # stream data_product_id [--start cursor]
    s = subparsers.add_parser("stream", help="Stream events from data product")
    s.add_argument("data_product_id", help="Data product ID")
    s.add_argument("--start", default=None, help="Start cursor (optional)")

    # replay data_product_id [--start cursor]
    r = subparsers.add_parser("replay", help="Replay events from data product")
    r.add_argument("data_product_id", help="Data product ID")
    r.add_argument("--start", default=None, help="Start cursor (optional)")

    # workflows list | deploy
    workflows_p = subparsers.add_parser("workflows", help="List or deploy workflows")
    workflows_sub = workflows_p.add_subparsers(dest="workflows_subcommand", required=True)
    wf_list = workflows_sub.add_parser("list", help="List workflows")
    wf_list.add_argument("--project-id", default=None, help="Project ID (or set LOXTEP_PROJECT_ID)")
    wf_deploy = workflows_sub.add_parser("deploy", help="Deploy project to instance")
    wf_deploy.add_argument("--project-id", required=True, help="Project ID")
    wf_deploy.add_argument("--instance-id", required=True, help="Instance ID")
    wf_deploy.add_argument("--version-id", default=None, help="Version ID (optional)")
    wf_deploy.add_argument("--force", action="store_true", help="Force redeploy")

    # observe status
    observe_p = subparsers.add_parser("observe", help="Observe (bots / status)")
    observe_sub = observe_p.add_subparsers(dest="observe_subcommand", required=True)
    observe_sub.add_parser("status", help="GET /observe/bots status")

    # projects list | get
    projects_p = subparsers.add_parser("projects", help="List or get projects")
    projects_sub = projects_p.add_subparsers(dest="projects_subcommand", required=True)
    projects_sub.add_parser("list", help="List projects in the organization")
    get_p = projects_sub.add_parser("get", help="Get a project by ID")
    get_p.add_argument("project_id", help="Project ID")

    # generate
    subparsers.add_parser(
        "generate", help="Generate typed Python constants (.loxtep/generated/__init__.py)"
    )

    # templates list | get
    templates_p = subparsers.add_parser("templates", help="List or get catalog templates")
    templates_sub = templates_p.add_subparsers(dest="templates_subcommand", required=True)
    templates_sub.add_parser("list", help="List templates in the catalog")
    get_t = templates_sub.add_parser("get", help="Get a template by ID")
    get_t.add_argument("template_id", help="Template ID")

    # config export --from-connector <id> [--format sh|json|env]
    config_p = subparsers.add_parser("config", help="Config management (export)")
    config_sub = config_p.add_subparsers(dest="config_subcommand", required=True)
    config_export = config_sub.add_parser("export", help="Export SDK config from a connector")
    config_export.add_argument(
        "--from-connector",
        dest="from_connector",
        default=None,
        help="Connector ID to export SDK config from",
    )
    config_export.add_argument(
        "--format",
        dest="export_format",
        choices=["sh", "json", "env"],
        default="sh",
        help="Output format: sh (default), json, or env",
    )

    args = parser.parse_args()

    if not args.command or args.command == "help":
        _print_help(parser)
        return 0

    if args.command == "login":
        return _cmd_login()
    if args.command == "workflows":
        sub = getattr(args, "workflows_subcommand", None)
        if sub == "list":
            return _cmd_workflows_list(getattr(args, "project_id", None))
        if sub == "deploy":
            return _cmd_workflows_deploy(
                project_id=args.project_id,
                instance_id=args.instance_id,
                version_id=getattr(args, "version_id", None),
                force=getattr(args, "force", False),
            )
        workflows_p.print_help()
        return 1
    if args.command == "observe":
        if getattr(args, "observe_subcommand", None) == "status":
            return _cmd_observe_status()
        observe_p.print_help()
        return 1
    if args.command == "projects":
        sub = getattr(args, "projects_subcommand", None)
        if sub == "list":
            return _cmd_projects_list()
        if sub == "get":
            return _cmd_projects_get(args.project_id)
        projects_p.print_help()
        return 1
    if args.command == "templates":
        sub = getattr(args, "templates_subcommand", None)
        if sub == "list":
            return _cmd_templates_list()
        if sub == "get":
            return _cmd_templates_get(args.template_id)
        templates_p.print_help()
        return 1
    if args.command == "config":
        sub = getattr(args, "config_subcommand", None)
        if sub == "export":
            return _cmd_config_export(
                from_connector=getattr(args, "from_connector", None),
                fmt=getattr(args, "export_format", "sh"),
            )
        config_p.print_help()
        return 1
    if args.command == "generate":
        return _cmd_generate()
    if args.command == "query":
        return _cmd_query(args.data_product_id, args.sql)
    if args.command == "stream":
        return _cmd_stream(args.data_product_id, args.start)
    if args.command == "replay":
        return _cmd_replay(args.data_product_id, args.start)

    _print_help(parser)
    return 1


def run() -> NoReturn:
    sys.exit(main())
