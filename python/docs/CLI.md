# Loxtep CLI from Python

Python users can run **login**, **query**, **stream**, and **replay** from the
CLI in two ways:

1. **Python CLI** (this package): `loxtep login`, `loxtep query`,
   `loxtep stream`, `loxtep replay` after `pip install -e .`
2. **Node.js CLI from Python**: Call `npx loxtep` via `subprocess` for the same
   commands.

Both use the same config and credentials: `~/.loxtep/config.json` and
`~/.loxtep/credentials.json` (same as the Node.js CLI).

---

## 1. Python CLI (recommended)

Install the package with the CLI entry point:

```bash
pip install -e .
# or from repo root: pip install -e sdks/python
```

Then:

```bash
# Login (runs Node.js loxtep login via subprocess; requires Node.js/npx)
loxtep login

# Query (uses Python SDK; token from ~/.loxtep/credentials.json or LOXTEP_TOKEN)
loxtep query <data_product_id> "SELECT * FROM t LIMIT 10"

# Stream events (Python SDK)
loxtep stream <data_product_id> [--start <cursor>]

# Replay events (Python SDK)
loxtep replay <data_product_id> [--start <cursor>]
```

**Config**: `~/.loxtep/config.json` or env: `LOXTEP_API_URL`,
`LOXTEP_ORGANIZATION_ID`, `LOXTEP_PROJECT_ID`.  
**Auth**: Run `loxtep login` once (writes to `~/.loxtep/credentials.json`) or
set `LOXTEP_TOKEN`.

---

## 2. Using Node.js loxtep CLI from Python (subprocess)

If you prefer to drive the Node.js CLI from Python (e.g. in scripts or
notebooks):

### Prerequisites

- Node.js and `npx` installed.
- Loxtep Node SDK available (e.g. from repo: `cd sdks/nodejs && npm link` or
  `npx loxtep` from a project that depends on `@loxtep/sdk`).

### Login

```python
import subprocess

# Interactive login (prompts for email/password)
subprocess.run(["npx", "loxtep", "login"], check=True)

# With options (if supported by Node CLI)
subprocess.run(
    ["npx", "loxtep", "login", "--email", "user@example.com", "--password", "secret"],
    check=True,
)
```

Credentials are written to `~/.loxtep/credentials.json` and shared with the
Python SDK.

### Query

```python
import subprocess
import json

result = subprocess.run(
    ["npx", "loxtep", "data-products", "query", data_product_id, sql],
    capture_output=True,
    text=True,
    check=True,
)
data = json.loads(result.stdout)
```

Or use the **Python SDK** with the same credentials:

```python
from loxtep import LoxtepClient
from loxtep.cli_config import load_config, get_token_from_env_or_file

config = load_config()
token = get_token_from_env_or_file()
client = LoxtepClient(
    api_url=config["api_url"],
    auth={"type": "jwt", "token": token},
    organization_id=config.get("organization_id"),
    project_id=config.get("project_id"),
)
result = client.data_products.query(data_product_id, sql)
client.close()
```

### Stream

The Node.js CLI does not currently expose a `stream` subcommand. Use the
**Python CLI** (`loxtep stream <id>`) or **Python SDK**:

```python
from loxtep import LoxtepClient
from loxtep.cli_config import load_config, get_token_from_env_or_file

config = load_config()
token = get_token_from_env_or_file()
client = LoxtepClient(
    api_url=config["api_url"],
    auth={"type": "jwt", "token": token},
    organization_id=config.get("organization_id"),
    project_id=config.get("project_id"),
)
for event in client.data_products.stream(data_product_id):
    process(event)
client.close()
```

### Replay

The Node.js CLI does not currently expose a `replay` subcommand. Use the
**Python CLI** (`loxtep replay <id>`) or **Python SDK**
(`client.data_products.replay(id)`).

---

## Config and credentials paths

| Item        | Path (default)               | Env override        |
| ----------- | ---------------------------- | ------------------- |
| Config dir  | `~/.loxtep`                  | `LOXTEP_CONFIG_DIR` |
| Config file | `~/.loxtep/config.json`      | —                   |
| Credentials | `~/.loxtep/credentials.json` | —                   |
| Token       | (from credentials or env)    | `LOXTEP_TOKEN`      |

Config keys: `api_url`, `organization_id`, `project_id`.  
Credentials: `access_token` (required), `refresh_token`, `expires_at`
(optional).
