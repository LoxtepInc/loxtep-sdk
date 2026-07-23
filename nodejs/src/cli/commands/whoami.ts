import {
  mergeJwtIdentityFallback,
  parseCurrentUserResponse,
  unwrapApiEnvelope,
  type ParsedCurrentUser,
} from '../../client/current-user-response.js';
import { decodeJwtClaims } from '../../auth/jwt.js';
import { buildPlatformRequestUrl } from '../../config/platform-request-url.js';
import type { LoxtepHttpClient } from '../../http/client.js';
import { createCliHttpClient } from '../create-cli-client.js';

/** Flattened user context from GET /organizations/users/me. */
export type UserMeResponse = ParsedCurrentUser;

export interface WhoamiOptions {
  /** Print raw /users/me JSON to stderr (also enabled with LOXTEP_DEBUG=1). */
  debug?: boolean;
  /** For tests: inject fetch to mock API. Prefer over `fetchUser` for integration tests. */
  fetchFn?: typeof fetch;
  /** Alias for {@link fetchFn} (matches {@link CreateCliClientOptions.fetch_fn}). */
  fetch_fn?: typeof fetch;
  /**
   * For tests only: bypass HTTP and inject a flat user DTO (output formatting).
   * Does NOT exercise API envelope parsing — use `fetchFn` + mock-platform-api fixtures instead.
   */
  fetchUser?: () => Promise<UserMeResponse>;
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
}

function isDebugEnabled(options: WhoamiOptions): boolean {
  return options.debug === true || process.env.LOXTEP_DEBUG === '1';
}

function isPlaceholderIdentity(data: ParsedCurrentUser): boolean {
  return !data.email && !data.first_name && !data.last_name && !data.organization_name && !data.organization_id;
}

function responseLooksEmpty(raw: unknown): boolean {
  if (raw == null) return true;
  if (typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw as object).length === 0) {
    return true;
  }
  const msg = (raw as { message?: unknown }).message;
  return msg === 'OK' && Object.keys(raw as object).length <= 1;
}

async function enrichOrganizationName(
  data: ParsedCurrentUser,
  http: LoxtepHttpClient
): Promise<ParsedCurrentUser> {
  if (data.organization_name || !data.organization_id) return data;
  try {
    const orgRaw = await http.get<unknown>(
      `/organizations/organizations/${encodeURIComponent(data.organization_id)}`
    );
    const org = unwrapApiEnvelope(orgRaw) as Record<string, unknown> | null;
    const name =
      typeof org?.name === 'string'
        ? org.name
        : typeof org?.organization_name === 'string'
          ? org.organization_name
          : undefined;
    if (name) return { ...data, organization_name: name };
  } catch {
    // Non-fatal — UUID is still useful
  }
  return data;
}

/**
 * Run whoami: unified auth + GET /organizations/users/me, print user and org.
 */
export async function runWhoami(options: WhoamiOptions = {}): Promise<void> {
  try {
    const data = options.fetchUser
      ? await options.fetchUser()
      : await (async () => {
          const cli = await createCliHttpClient({
            configFilePath: options.configFilePath,
            credentialsPath: options.credentialsPath,
            customerMcpPath: options.customerMcpPath,
            fetch_fn: options.fetch_fn ?? options.fetchFn,
          });
          if (!cli) {
            console.error(
              'Missing api_url or access token. Set LOXTEP_API_URL / LOXTEP_AUTH_TOKEN, or run: loxtep config set api_url <url> ; loxtep login'
            );
            process.exitCode = 1;
            return null;
          }

          const path = '/organizations/users/me';
          if (isDebugEnabled(options)) {
            const url = buildPlatformRequestUrl(cli.auth.api_url, path);
            console.error(`[loxtep whoami debug] GET ${url}`);
          }

          const raw = await cli.http.get<unknown>(path);
          if (isDebugEnabled(options)) {
            console.error('[loxtep whoami debug] GET /organizations/users/me response:');
            if (responseLooksEmpty(raw)) {
              console.error(
                '(empty or non-JSON body — HTTP 200 with no payload; check SigV4 credentials in credentials.json)'
              );
            }
            console.error(JSON.stringify(raw, null, 2));
          }

          let parsed = parseCurrentUserResponse(raw);
          const token = await cli.auth.get_token();
          if (token && (isPlaceholderIdentity(parsed) || responseLooksEmpty(raw))) {
            parsed = mergeJwtIdentityFallback(parsed, decodeJwtClaims(token));
          }
          parsed = await enrichOrganizationName(parsed, cli.http);
          return parsed;
        })();
    if (data == null) return;
    const email = data?.email ?? '—';
    const name = [data?.first_name, data?.last_name].filter(Boolean).join(' ') || '—';
    const org = data?.organization_name ?? data?.organization_id ?? '—';
    console.log('User:', email);
    console.log('Name:', name);
    console.log('Organization:', org);
    if (isPlaceholderIdentity(data)) {
      console.error(
        'Could not read your profile from the API. Run `loxtep login` again, or `LOXTEP_DEBUG=1 loxtep whoami` to inspect the raw response.'
      );
      process.exitCode = 1;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Failed to fetch user:', msg);
    process.exitCode = 1;
  }
}
