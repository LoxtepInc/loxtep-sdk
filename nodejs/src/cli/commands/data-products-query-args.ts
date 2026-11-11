/**
 * Args after `loxtep data-products query <id>`.
 * Strips only `--json`, `--receipt`, and `--file <path>` before the SQL join.
 * Unknown `--…` tokens stay in the SQL. If the remaining SQL's last token
 * starts with `--`, the query is refused and nothing is sent.
 */

export type DataProductQueryArgs =
  | { ok: true; mode: 'sql'; sql: string; receipt: boolean }
  | { ok: true; mode: 'file'; path: string; receipt: boolean }
  | { ok: false; message: string };

const FILE_USAGE = 'Usage: loxtep data-products query <id> --file <path>';
const SQL_USAGE =
  'Usage: loxtep data-products query <id> "SQL" | loxtep data-products query <id> --file <path>';

export function parseDataProductQueryArgs(argsAfterId: string[]): DataProductQueryArgs {
  const receipt = argsAfterId.includes('--json') || argsAfterId.includes('--receipt');
  const fileIdx = argsAfterId.indexOf('--file');
  if (fileIdx >= 0) {
    const path = argsAfterId[fileIdx + 1];
    if (!path || path.startsWith('--')) {
      return { ok: false, message: FILE_USAGE };
    }
    return { ok: true, mode: 'file', path, receipt };
  }

  const sqlTokens: string[] = [];
  for (const token of argsAfterId) {
    if (token === '--json' || token === '--receipt') continue;
    sqlTokens.push(token);
  }

  const sql = sqlTokens.join(' ').replace(/^["']|["']$/g, '');
  if (!sql.trim()) {
    return { ok: false, message: SQL_USAGE };
  }

  const lastToken = sql.trim().split(/\s+/).at(-1) ?? '';
  if (lastToken.startsWith('--')) {
    return {
      ok: false,
      message:
        `Refusing data-products query: SQL ends with '${lastToken}'. ` +
        'That trailing -- token would be sent as part of the SQL. ' +
        'Remove it, or pass the statement with --file <path>. ' +
        'Only --json, --receipt, and --file <path> are removed from the arguments. ' +
        'Other -- tokens are left in the SQL.',
    };
  }

  return { ok: true, mode: 'sql', sql, receipt };
}
