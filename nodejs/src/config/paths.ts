import { homedir } from 'node:os';
import { join } from 'node:path';

/** Override via `LOXTEP_CONFIG_DIR` (matches Python `cli_config._config_dir`). */
export const CONFIG_DIR_ENV = 'LOXTEP_CONFIG_DIR';

/** Default config directory: ~/.loxtep (Unix) or %USERPROFILE%\.loxtep (Windows). */
export function getConfigDir(): string {
  const override = process.env[CONFIG_DIR_ENV]?.trim();
  if (override) {
    return override;
  }
  return join(homedir(), '.loxtep');
}

/** Default config file path: ~/.loxtep/config.json. */
export function getDefaultConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}
