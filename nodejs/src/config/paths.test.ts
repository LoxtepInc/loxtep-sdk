import { homedir } from 'node:os';
import { join } from 'node:path';
import { CONFIG_DIR_ENV, getConfigDir, getDefaultConfigPath } from './paths.js';

describe('getConfigDir', () => {
  const orig = process.env[CONFIG_DIR_ENV];

  afterEach(() => {
    if (orig === undefined) {
      delete process.env[CONFIG_DIR_ENV];
    } else {
      process.env[CONFIG_DIR_ENV] = orig;
    }
  });

  it('defaults to ~/.loxtep', () => {
    delete process.env[CONFIG_DIR_ENV];
    expect(getConfigDir()).toBe(join(homedir(), '.loxtep'));
    expect(getDefaultConfigPath()).toBe(join(homedir(), '.loxtep', 'config.json'));
  });

  it('honors LOXTEP_CONFIG_DIR', () => {
    process.env[CONFIG_DIR_ENV] = '/tmp/loxtep-test-config';
    expect(getConfigDir()).toBe('/tmp/loxtep-test-config');
  });
});
