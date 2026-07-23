import { mapListSummaries, printCliListOutput } from './cli-list-output.js';

describe('cli-list-output', () => {
  const origDebug = process.env.LOXTEP_DEBUG;
  let stdout: string[];
  let stderr: string[];

  beforeEach(() => {
    stdout = [];
    stderr = [];
    jest.spyOn(console, 'log').mockImplementation((...args) => {
      stdout.push(args.join(' '));
    });
    jest.spyOn(console, 'error').mockImplementation((...args) => {
      stderr.push(args.join(' '));
    });
    delete process.env.LOXTEP_DEBUG;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (origDebug === undefined) delete process.env.LOXTEP_DEBUG;
    else process.env.LOXTEP_DEBUG = origDebug;
  });

  it('prints a bare JSON array on stdout', () => {
    printCliListOutput(
      [{ id: 'a' }, { id: 'b' }],
      { items: [{ id: 'a' }], pagination: { has_next: true } },
      { label: 'projects list' }
    );
    expect(JSON.parse(stdout[0]!)).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(stderr).toHaveLength(0);
  });

  it('prints raw API payload to stderr when debug is enabled', () => {
    printCliListOutput([{ id: 'a' }], { items: [{ id: 'a' }], pagination: { page: 1 } }, {
      debug: true,
      label: 'workflows list',
    });
    expect(JSON.parse(stdout[0]!)).toEqual([{ id: 'a' }]);
    expect(stderr[0]).toContain('[loxtep workflows list debug]');
    expect(stderr.join('\n')).toContain('"pagination"');
  });

  it('mapListSummaries maps items only', () => {
    const rows = mapListSummaries(
      { items: [{ name: 'x' }, { name: 'y' }] },
      (row) => ({ n: row.name })
    );
    expect(rows).toEqual([{ n: 'x' }, { n: 'y' }]);
  });
});
