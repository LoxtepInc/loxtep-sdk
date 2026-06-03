/**
 * OAuth 2.1 browser-based login for the Loxtep SDK.
 *
 * Opens a browser to the Loxtep app's MCP auth page, runs a localhost callback
 * server to receive the tokens, then returns them. Same UX as the hosted MCP
 * OAuth flow — no email/password/TOTP prompts needed.
 *
 * Flow:
 * 1. Start a local HTTP server on a random port
 * 2. Open browser to https://app.loxtep.io/auth/mcp?callback_url=http://localhost:{port}/callback
 * 3. User logs in (Cognito SRP + MFA if needed) in the browser
 * 4. App redirects to our localhost callback with access_token + refresh_token
 * 5. Return tokens to caller, shut down server
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { exec } from 'node:child_process';
import { platform } from 'node:os';

export interface BrowserLoginOptions {
  /** Loxtep app URL (e.g. https://app.loxtep.io or https://appdev.loxtep.io). */
  app_url: string;
  /** API base URL for the refresh endpoint (e.g. https://api.loxtep.io). */
  api_url?: string;
  /** Timeout in milliseconds before giving up (default: 300000 = 5 minutes). */
  timeout_ms?: number;
  /** If true, don't auto-open the browser — just print the URL. */
  no_open?: boolean;
}

export interface BrowserLoginResult {
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  aws_credentials?: {
    access_key_id: string;
    secret_access_key: string;
    session_token: string;
    expiration: string;
  };
}

/**
 * Open a URL in the user's default browser.
 */
function openBrowser(url: string): void {
  const os = platform();
  const cmd =
    os === 'darwin' ? 'open' : os === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} "${url}"`);
}

/**
 * Run the browser-based OAuth login flow.
 * Returns tokens on success, throws on timeout or failure.
 */
export function browserLogin(options: BrowserLoginOptions): Promise<BrowserLoginResult> {
  const { app_url, timeout_ms = 300_000, no_open = false } = options;

  return new Promise<BrowserLoginResult>((resolve, reject) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const reqUrl = new URL(req.url ?? '/', `http://localhost`);

      if (reqUrl.pathname === '/callback') {
        // Tokens come as query params from the Loxtep app redirect
        const access_token = reqUrl.searchParams.get('access_token');
        const refresh_token = reqUrl.searchParams.get('refresh_token') ?? undefined;
        const expires_at = reqUrl.searchParams.get('expires_at') ?? undefined;

        // AWS credentials (optional, URL-encoded JSON)
        let aws_credentials: BrowserLoginResult['aws_credentials'] | undefined;
        const awsCredsParam = reqUrl.searchParams.get('aws_credentials');
        if (awsCredsParam) {
          try {
            aws_credentials = JSON.parse(decodeURIComponent(awsCredsParam));
          } catch {
            // ignore parse errors
          }
        }

        if (!access_token) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<html><body><h2>Login failed</h2><p>No access token received. Close this window and try again.</p></body></html>');
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          '<html><body><h2>Login successful!</h2><p>You can close this window and return to your terminal.</p></body></html>'
        );

        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        server.close();
        resolve({ access_token, refresh_token, expires_at, aws_credentials });
        return;
      }

      // Health check / catch-all
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Loxtep SDK login callback server');
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to start callback server'));
        return;
      }

      const port = addr.port;
      const callbackUrl = `http://localhost:${port}/callback`;
      const loginUrl = `${app_url.replace(/\/$/, '')}/auth/mcp?callback_url=${encodeURIComponent(callbackUrl)}`;

      if (no_open) {
        console.log(`\nOpen this URL in your browser to log in:\n\n  ${loginUrl}\n`);
      } else {
        console.log(`\nOpening browser for Loxtep login...\n  ${loginUrl}\n`);
        console.log('If the browser does not open, copy the URL above and paste it manually.\n');
        openBrowser(loginUrl);
      }

      console.log('Waiting for login to complete...');
    });

    server.on('error', err => {
      if (!settled) {
        settled = true;
        reject(new Error(`Callback server error: ${err.message}`));
      }
    });

    // Timeout
    timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        server.close();
        reject(new Error(`Login timed out after ${timeout_ms / 1000} seconds. Try again.`));
      }
    }, timeout_ms);
  });
}
