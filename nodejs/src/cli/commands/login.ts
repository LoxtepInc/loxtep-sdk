import * as readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { login as authLogin, LoginMfaRequiredError } from '../../auth/login.js';
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
   * Same flow as `npx @loxtep/customer-mcp-server login`: browser + localhost callback.
   * Use when password login cannot complete (e.g. SSO-only) or for parity with MCP.
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
 * Run login: prompt for email, password, and (optional) authenticator code, then a single POST /auth/login.
 */
export async function runLogin(options: LoginOptions = {}): Promise<void> {
  if (options.browser) {
    const config = await loadConfig(options.configFilePath);
    const credentialsPath = options.credentialsPath ?? getCredentialsPath();
    console.log(
      'Browser login: running `npx @loxtep/customer-mcp-server login` (no email/password prompts here).'
    );
    const r = spawnSync('npx', ['-y', '@loxtep/customer-mcp-server', 'login'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        LOXTEP_TOKEN_FILE: credentialsPath,
        ...(config.api_url ? { LOXTEP_API_BASE_URL: config.api_url } : {}),
      },
    });
    if (r.error) {
      console.error('Could not run browser login:', r.error.message);
      process.exitCode = 1;
      return;
    }
    if (r.status !== 0) {
      process.exitCode = r.status ?? 1;
      return;
    }
    console.log(
      `Browser login completed. Tokens are in ${credentialsPath} (shared with the customer MCP server).`
    );
    return;
  }

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
        console.error('Hint: for MCP-style browser login, run: npx loxtep login --browser');
      }
    }
    process.exitCode = 1;
  }
}
