import {
  mergeJwtIdentityFallback,
  parseCurrentUserResponse,
  type ParsedCurrentUser,
} from '../../client/current-user-response.js';
import { decodeJwtClaims } from '../../auth/jwt.js';
import { LoxtepHttpClient } from '../../http/client.js';
import { createCliAuthContext } from '../create-cli-client.js';

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

const DUMMY_SIGV4 = { accessKeyId: 'cli', secretAccessKey: 'cli' } as const;

function isDebugEnabled(options: WhoamiOptions): boolean {
  return options.debug === true || process.env.LOXTEP_DEBUG === '1';
}

function isPlaceholderIdentity(data: ParsedCurrentUser): boolean {
  return !data.email && !data.first_name && !data.last_name && !data.organization_name && !data.organization_id;
}

/**
 * Run whoami: unified auth + GET /organizations/users/me, print user and org.
 */
export async function runWhoami(options: WhoamiOptions = {}): Promise<void> {
  try {
    const data = options.fetchUser
      ? await options.fetchUser()
      : await (async () => {
          const authCtx = await createCliAuthContext({
            configFilePath: options.configFilePath,
            credentialsPath: options.credentialsPath,
            customerMcpPath: options.customerMcpPath,
          });
          if (!authCtx) {
            console.error(
              'Missing api_url or access token. Set LOXTEP_API_URL / LOXTEP_AUTH_TOKEN, or run: loxtep config set api_url <url> ; loxtep login'
            );
            process.exitCode = 1;
            return null;
          }
          const fetchImpl = options.fetch_fn ?? options.fetchFn ?? fetch;
          const client = new LoxtepHttpClient({
            base_url: authCtx.api_url,
            use_platform_path_resolution: true,
            get_token: authCtx.get_token,
            refresh_auth: authCtx.refresh_auth,
            credentials: DUMMY_SIGV4,
            fetch_fn: fetchImpl,
          });
          const raw = await client.get<unknown>('/organizations/users/me');
          if (isDebugEnabled(options)) {
            console.error('[loxtep whoami debug] GET /organizations/users/me response:');
            console.error(JSON.stringify(raw, null, 2));
          }
          let parsed = parseCurrentUserResponse(raw);
          const token = await authCtx.get_token();
          if (token && isPlaceholderIdentity(parsed)) {
            parsed = mergeJwtIdentityFallback(parsed, decodeJwtClaims(token));
          }
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
