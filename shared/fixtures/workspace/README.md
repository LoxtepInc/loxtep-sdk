# Workspace auto-config fixtures

Canonical `.loxtep` shapes shared by Node and Python `from_workspace` /
`fromWorkspace` tests. Keep these in sync with what `loxtep attach` writes.

| File | Purpose |
| --- | --- |
| `project.json` | Full attach-shaped project (PascalCase `streams`) |
| `project-minimal.json` | api_url + ids only (no streams) |
| `project-no-api-url.json` | Missing `api_url` (error-path tests) |
| `streams-snake.json` | snake_case stream aliases (`region` → `Region`) for parseStreamsPartial
| `credentials.json` | Valid `access_token` |
| `credentials-empty.json` | Present but empty (token missing) |

Do **not** invent alternate shapes in language-specific tests — copy these
files into a temp `.loxtep/` dir instead.
