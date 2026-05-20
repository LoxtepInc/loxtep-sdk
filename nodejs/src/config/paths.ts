import { homedir } from 'node:os';
import { join } from 'node:path';

/** Default config directory: ~/.loxtep (Unix) or %USERPROFILE%\.loxtep (Windows). */
export function getConfigDir(): string {
  return join(homedir(), '.loxtep');
}

/** Default config file path: ~/.loxtep/config.json. */
export function getDefaultConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}
