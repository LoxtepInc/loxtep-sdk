/**
 * Shared stdout/stderr formatting for CLI `list` subcommands.
 * Default output is a pruned JSON **array** of summary rows (human + jq friendly).
 * Raw API payloads (including pagination/cursor) go to stderr with --debug or LOXTEP_DEBUG=1.
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
  summaryRows: unknown[],
  raw: unknown,
  options?: CliListOutputOptions
): void {
  if (isCliListDebugEnabled(options)) {
    const label = options?.label ?? 'list';
    console.error(`[loxtep ${label} debug] raw API response:`);
    console.error(JSON.stringify(raw, null, 2));
  }
  console.log(JSON.stringify(summaryRows, null, 2));
}

/** Map paginated SDK list results to a flat summary array for CLI stdout. */
export function mapListSummaries<T, S>(
  data: { items: T[] },
  mapItem: (item: T) => S
): S[] {
  return data.items.map(mapItem);
}

/**
 * @deprecated CLI stdout is a bare array; use {@link mapListSummaries}. Pagination belongs in --debug raw output only.
 */
export function mapPaginatedList<T, S>(
  data: { items: T[]; pagination?: unknown },
  mapItem: (item: T) => S
): { items: S[]; pagination?: unknown } {
  return {
    items: mapListSummaries(data, mapItem),
    ...(data.pagination !== undefined ? { pagination: data.pagination } : {}),
  };
}
