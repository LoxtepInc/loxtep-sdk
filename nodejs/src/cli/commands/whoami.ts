import { parseCurrentUserResponse, type ParsedCurrentUser } from '../../client/current-user-response.js';
import { LoxtepHttpClient } from '../../http/client.js';
import { createCliAuthContext } from '../create-cli-client.js';

/** Flattened user context from GET /organizations/users/me. */
export type UserMeResponse = ParsedCurrentUser;

export interface WhoamiOptions {
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
          return parseCurrentUserResponse(raw);
        })();
    if (data == null) return;
    const email = data?.email ?? '—';
    const name = [data?.first_name, data?.last_name].filter(Boolean).join(' ') || '—';
    const org = data?.organization_name ?? data?.organization_id ?? '—';
    console.log('User:', email);
    console.log('Name:', name);
    console.log('Organization:', org);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Failed to fetch user:', msg);
    process.exitCode = 1;
  }
}
