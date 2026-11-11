import { parseDataProductQueryArgs } from './data-products-query-args.js';

describe('parseDataProductQueryArgs', () => {
  it('strips --json and --receipt before joining SQL', () => {
    expect(parseDataProductQueryArgs(['SELECT 1 AS x', '--json'])).toEqual({
      ok: true,
      mode: 'sql',
      sql: 'SELECT 1 AS x',
      receipt: true,
    });
    expect(parseDataProductQueryArgs(['--receipt', 'SELECT', '1'])).toEqual({
      ok: true,
      mode: 'sql',
      sql: 'SELECT 1',
      receipt: true,
    });
    expect(parseDataProductQueryArgs(['"SELECT 1 AS x"', '--json'])).toEqual({
      ok: true,
      mode: 'sql',
      sql: 'SELECT 1 AS x',
      receipt: true,
    });
  });

  it('strips a --json argv token that sits between SQL tokens', () => {
    expect(parseDataProductQueryArgs(['SELECT', '--json', '1'])).toEqual({
      ok: true,
      mode: 'sql',
      sql: 'SELECT 1',
      receipt: true,
    });
  });

  it('keeps an unknown -- token in the middle of the SQL', () => {
    expect(parseDataProductQueryArgs(['SELECT', '--keep', '1'])).toEqual({
      ok: true,
      mode: 'sql',
      sql: 'SELECT --keep 1',
      receipt: false,
    });
  });

  it('refuses when the remaining SQL ends with a -- token', () => {
    const parsed = parseDataProductQueryArgs(['SELECT', '1', '--debug']);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.message).toContain("SQL ends with '--debug'");
      expect(parsed.message).toContain('Refusing data-products query');
    }
  });

  it('refuses a quoted statement whose last token starts with --', () => {
    const parsed = parseDataProductQueryArgs(['"SELECT 1 --oops"']);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.message).toContain("'--oops'");
  });

  it('does not strip --json text that is inside the SQL', () => {
    expect(parseDataProductQueryArgs(["SELECT '--json' AS x", '--receipt'])).toEqual({
      ok: true,
      mode: 'sql',
      sql: "SELECT '--json' AS x",
      receipt: true,
    });
  });

  it('takes --file <path> out of the argument list', () => {
    expect(parseDataProductQueryArgs(['--file', 'q.sql', '--json'])).toEqual({
      ok: true,
      mode: 'file',
      path: 'q.sql',
      receipt: true,
    });
    expect(parseDataProductQueryArgs(['SELECT', '1', '--file', 'q.sql', '--receipt'])).toEqual({
      ok: true,
      mode: 'file',
      path: 'q.sql',
      receipt: true,
    });
  });

  it('refuses --file when the path is missing or is another flag', () => {
    expect(parseDataProductQueryArgs(['--file']).ok).toBe(false);
    expect(parseDataProductQueryArgs(['--file', '--json']).ok).toBe(false);
  });

  it('refuses an empty statement', () => {
    expect(parseDataProductQueryArgs(['--json']).ok).toBe(false);
    expect(parseDataProductQueryArgs([]).ok).toBe(false);
  });
});
