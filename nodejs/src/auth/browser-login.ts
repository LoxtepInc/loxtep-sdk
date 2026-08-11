/**
 * OAuth 2.1 browser-based login for the Loxtep SDK.
 *
 * Opens a browser to the Loxtep app's MCP auth page, runs a localhost callback
 * server to receive the tokens, then returns them. Same UX as the hosted MCP
 * OAuth flow — no email/password/TOTP prompts needed.
 *
 * Flow:
 * 1. Start a local HTTP server on a random port
 * 2. Open browser to https://app.loxtep.io/auth/cli?callback_url=http://localhost:{port}/callback
 * 3. User logs in (Cognito SRP + MFA if needed) in the browser
 * 4. App mints a CLI-scoped session and redirects to our localhost callback with tokens
 * 5. Return tokens to caller, shut down server
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { URL } from 'node:url';
import { exec, type ChildProcess } from 'node:child_process';
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
  /** For tests: invoked once the callback server is listening (with bound port). */
  on_listening?: (port: number) => void;
}

export interface BrowserLoginResult {
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  /** API origin returned by the app OAuth callback (e.g. https://api.loxtep.io). */
  api_base_url?: string;
  aws_credentials?: {
    access_key_id: string;
    secret_access_key: string;
    session_token: string;
    expiration: string;
  };
}

const CLOSE_HEADERS = { Connection: 'close' as const };

/** Force-close keep-alive sockets so the CLI process can exit immediately. */
export function shutdownCallbackServer(server: Server, sockets: Set<Socket>): void {
  for (const socket of sockets) {
    socket.destroy();
  }
  sockets.clear();

  const maybeCloseAll = server as Server & { closeAllConnections?: () => void };
  maybeCloseAll.closeAllConnections?.();
  server.close();
}

/**
 * Open a URL in the user's default browser.
 */
function openBrowser(url: string): void {
  const os = platform();
  const cmd =
    os === 'darwin' ? 'open' : os === 'win32' ? 'start' : 'xdg-open';
  const child: ChildProcess = exec(`${cmd} "${url}"`);
  child.unref?.();
}

function finishResponse(res: ServerResponse, body: string, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'text/html', ...CLOSE_HEADERS });
  res.end(body);
  res.socket?.destroy();
}

/**
 * Run the browser-based OAuth login flow.
 * Returns tokens on success, throws on timeout or failure.
 */
export function browserLogin(options: BrowserLoginOptions): Promise<BrowserLoginResult> {
  const { app_url, timeout_ms = 300_000, no_open = false, on_listening } = options;

  return new Promise<BrowserLoginResult>((resolve, reject) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const sockets = new Set<Socket>();

    const settleSuccess = (result: BrowserLoginResult): void => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      shutdownCallbackServer(server, sockets);
      resolve(result);
    };

    const settleFailure = (err: Error): void => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      shutdownCallbackServer(server, sockets);
      reject(err);
    };

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const reqUrl = new URL(req.url ?? '/', `http://localhost`);

      if (reqUrl.pathname === '/callback') {
        const access_token = reqUrl.searchParams.get('access_token');
        const refresh_token = reqUrl.searchParams.get('refresh_token') ?? undefined;
        const expires_at = reqUrl.searchParams.get('expires_at') ?? undefined;
        const api_base_url = reqUrl.searchParams.get('api_base_url')?.replace(/\/$/, '') || undefined;

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
          finishResponse(
            res,
            '<html><body><h2>Login failed</h2><p>No access token received. Close this window and try again.</p></body></html>',
            400
          );
          return;
        }

        finishResponse(
          res,
          '<html><body><h2>Login successful!</h2><p>You can close this window and return to your terminal.</p></body></html>'
        );

        settleSuccess({ access_token, refresh_token, expires_at, api_base_url, aws_credentials });
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/plain', ...CLOSE_HEADERS });
      res.end('Loxtep SDK login callback server');
      res.socket?.destroy();
    });

    server.on('connection', socket => {
      sockets.add(socket);
      socket.on('close', () => {
        sockets.delete(socket);
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        settleFailure(new Error('Failed to start callback server'));
        return;
      }

      const port = addr.port;
      on_listening?.(port);

      const callbackUrl = `http://localhost:${port}/callback`;
      const loginUrl = `${app_url.replace(/\/$/, '')}/auth/cli?callback_url=${encodeURIComponent(callbackUrl)}`;

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
      settleFailure(new Error(`Callback server error: ${err.message}`));
    });

    timeoutId = setTimeout(() => {
      settleFailure(new Error(`Login timed out after ${timeout_ms / 1000} seconds. Try again.`));
    }, timeout_ms);
    timeoutId.unref?.();
  });
}
