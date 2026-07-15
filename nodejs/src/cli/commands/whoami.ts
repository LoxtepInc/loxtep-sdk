import { LoxtepHttpClient } from '../../http/client.js';
import { createCliAuthContext } from '../create-cli-client.js';

/** Response shape from GET /organizations/users/me (snake_case per API). */
export interface UserMeResponse {
  user_id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  organization_id?: string;
  organization_name?: string;
  [key: string]: unknown;
}

export interface WhoamiOptions {
  /** For tests: inject fetch to mock API. */
  fetchFn?: typeof fetch;
  /** For tests: bypass HTTP client and use this fetcher (avoids signer in Jest). */
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
          const client = new LoxtepHttpClient({
            base_url: authCtx.api_url,
            get_token: authCtx.get_token,
            refresh_auth: authCtx.refresh_auth,
            credentials: DUMMY_SIGV4,
            fetch_fn: options.fetchFn ?? fetch,
          });
          return client.get<UserMeResponse>('/organizations/users/me');
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
