import { formatCliVersionLine, getSdkVersion } from './version.js';

describe('CLI version', () => {
  it('reads semver from package.json', () => {
    const version = getSdkVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('formats a single-line version string', () => {
    expect(formatCliVersionLine()).toBe(`@loxtep/sdk ${getSdkVersion()}`);
  });
});
