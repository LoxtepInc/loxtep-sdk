import * as readline from 'node:readline';
import { login as authLogin, LoginMfaRequiredError } from '../../auth/login.js';
import { browserLogin } from '../../auth/browser-login.js';
import { loadConfig } from '../../config/load.js';
import { getCredentialsPath, writeCredentials } from '../credentials.js';

export interface LoginOptions {
  email?: string;
  password?: string;
  /**
   * 6-digit TOTP, or empty/omit for accounts without MFA.
   * When set (including `''`), skips the interactive authenticator prompt (for scripts/tests).
   */
  mfa_code?: string;
  organization_id?: string;
  /**
   * Browser OAuth login: opens browser to the Loxtep app login page with a localhost callback.
   * This is the default when no email/password is provided.
   */
  browser?: boolean;
  /** For tests: inject fetch to mock API. */
  fetchFn?: typeof fetch;
  /** For tests: config file path (default: env/file). */
  configFilePath?: string;
  /** For tests: credentials file path to write. */
  credentialsPath?: string;
  /** Override config auth first path segment (default: `app` when omitted in config). */
  auth_path_prefix?: string;
  /** Don't auto-open browser — just print the URL. */
  no_open?: boolean;
}

/** Prompt for a single line (e.g. email or password). */
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve((answer ?? '').trim());
    });
  });
}

/** Normalize optional MFA: empty → none; 6 digits → use; else throw. */
function parseOptionalMfaInput(raw: string): string | undefined {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length === 0) return undefined;
  if (digits.length === 6) return digits;
  throw new Error(
    'Authenticator code must be exactly 6 digits, or press Enter if you do not use TOTP.'
  );
}

/**
 * Run login: by default opens a browser for OAuth login. Use --email/--password for headless/CI environments.
 */
export async function runLogin(options: LoginOptions = {}): Promise<void> {
  // Default to browser login when no email/password provided
  const useBrowser = options.browser === true || (!options.email && !options.password && options.browser !== false);

  if (useBrowser) {
    const config = await loadConfig(options.configFilePath);
    const credentialsPath = options.credentialsPath ?? getCredentialsPath();

    // Determine app URL from config or default
    const apiUrl = (config.api_url || '').replace(/\/$/, '');
    let appUrl: string;
    if (apiUrl.includes('apidev.')) {
      appUrl = apiUrl.replace('apidev.', 'appdev.');
    } else if (apiUrl.includes('api.')) {
      appUrl = apiUrl.replace('api.', 'app.');
    } else {
      appUrl = 'https://app.loxtep.io';
    }

    try {
      const result = await browserLogin({
        app_url: appUrl,
        api_url: apiUrl || undefined,
        no_open: options.no_open,
      });
      await writeCredentials(
        {
          access_token: result.access_token,
          refresh_token: result.refresh_token,
          expires_at: result.expires_at,
          api_base_url: apiUrl || undefined,
          aws_credentials: result.aws_credentials,
        },
        credentialsPath
      );
      console.log(`\nLogged in successfully. Tokens saved to ${credentialsPath}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Login failed:', msg);
      process.exitCode = 1;
    }
    return;
  }

  // Email/password login (for CI/headless environments)
  const config = await loadConfig(options.configFilePath);
  const apiUrl = config.api_url;
  if (!apiUrl) {
    console.error('Missing api_url. Set LOXTEP_API_URL or run: loxtep config set api_url <url>');
    process.exitCode = 1;
    return;
  }

  let email = options.email;
  let password = options.password;
  if (!email) email = await prompt('Email: ');
  if (!password) password = await prompt('Password: ');

  if (!email || !password) {
    console.error('Email and password are required.');
    process.exitCode = 1;
    return;
  }

  let mfa: string | undefined;
  if (options.mfa_code !== undefined) {
    mfa = parseOptionalMfaInput(options.mfa_code);
  } else {
    const line = await prompt('Authenticator code (6 digits) if you use TOTP, or press Enter: ');
    mfa = parseOptionalMfaInput(line);
  }

  const org = options.organization_id ?? config.organization_id;
  const fetchFn = options.fetchFn;

  try {
    const result = await authLogin(apiUrl, email, password, {
      organization_id: org,
      ...(mfa ? { mfa_code: mfa } : {}),
      auth_path_prefix: options.auth_path_prefix ?? config.auth_path_prefix,
      fetchFn,
    });
    await writeCredentials(
      {
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        expires_at: result.expires_at,
        aws_credentials: result.aws_credentials,
      },
      options.credentialsPath
    );
    console.log('Logged in successfully.');
  } catch (err) {
    if (err instanceof LoginMfaRequiredError) {
      console.error(
        'Login failed: this account requires MFA. Enter your 6-digit code at the Authenticator prompt, or use --mfa-code <digits>.'
      );
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Login failed:', msg);
      if (/forbidden|403/i.test(msg)) {
        console.error('Hint: try browser login with: npx loxtep login --browser');
      }
    }
    process.exitCode = 1;
  }
}
