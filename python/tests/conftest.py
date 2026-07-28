"""
Shared pytest fixtures. The `isolate_loxtep_home` autouse fixture keeps every test
hermetic against the real developer machine's `~/.loxtep/` (config.json,
credentials.json) and the real cwd's ancestor tree — without it, tests that call
`load_config`/`load_credentials`/`get_token_from_env_or_file` with no explicit
override silently pass or fail depending on whether the machine running pytest has
ever run a real `loxtep login` (and, worse, can end up making live calls to the real
platform API instead of hitting a test's mock). Individual tests can still override
`LOXTEP_CONFIG_DIR` / cwd themselves; a later `monkeypatch.setenv`/`monkeypatch.chdir`
call in the test body simply takes precedence over this fixture's defaults.
"""

import pytest


@pytest.fixture(autouse=True)
def isolate_loxtep_home(tmp_path, monkeypatch):
    isolated_home = tmp_path / "isolated-loxtep-home"
    isolated_home.mkdir()
    monkeypatch.setenv("LOXTEP_CONFIG_DIR", str(isolated_home))

    isolated_cwd = tmp_path / "isolated-cwd"
    isolated_cwd.mkdir()
    monkeypatch.chdir(isolated_cwd)

    yield
