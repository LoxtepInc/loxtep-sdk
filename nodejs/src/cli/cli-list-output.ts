/**
 * Shared stdout/stderr formatting for CLI `list` subcommands.
 * Default output is a pruned summary; raw API payloads go to stderr with --debug or LOXTEP_DEBUG=1.
 */

export interface CliListOutputOptions {
  debug?: boolean;
  /** Short label for debug banners, e.g. `domains list`. */
  label?: string;
}

export function isCliListDebugEnabled(options?: CliListOutputOptions): boolean {
  return options?.debug === true || process.env.LOXTEP_DEBUG === '1';
}

export function printCliListOutput(
  summary: unknown,
  raw: unknown,
  options?: CliListOutputOptions
): void {
  if (isCliListDebugEnabled(options)) {
    const label = options?.label ?? 'list';
    console.error(`[loxtep ${label} debug] raw API response:`);
    console.error(JSON.stringify(raw, null, 2));
  }
  console.log(JSON.stringify(summary, null, 2));
}

/** Map list rows while preserving pagination metadata for scripts. */
export function mapPaginatedList<T, S>(
  data: { items: T[]; pagination?: unknown },
  mapItem: (item: T) => S
): { items: S[]; pagination?: unknown } {
  return {
    items: data.items.map(mapItem),
    ...(data.pagination !== undefined ? { pagination: data.pagination } : {}),
  };
}
