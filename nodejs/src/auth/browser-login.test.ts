import http from 'node:http';
import type { Server } from 'node:http';
import type { Socket } from 'node:net';
import { browserLogin, shutdownCallbackServer } from './browser-login.js';

describe('browserLogin', () => {
  it('resolves and releases the callback port after a successful redirect', async () => {
    let port = 0;

    const loginPromise = browserLogin({
      app_url: 'https://app.example.com',
      no_open: true,
      timeout_ms: 10_000,
      on_listening: boundPort => {
        port = boundPort;
      },
    });

    await new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('callback server did not start')), 2_000);
      const wait = setInterval(() => {
        if (port > 0) {
          clearInterval(wait);
          clearTimeout(deadline);
          resolve();
        }
      }, 10);
    });

    await new Promise<void>((resolve, reject) => {
      const req = http.get(
        `http://127.0.0.1:${port}/callback?access_token=test-token&refresh_token=refresh-token`,
        res => {
          res.resume();
          res.on('end', () => resolve());
        }
      );
      req.on('error', reject);
    });

    await expect(loginPromise).resolves.toEqual({
      access_token: 'test-token',
      refresh_token: 'refresh-token',
      expires_at: undefined,
      aws_credentials: undefined,
    });

    await expect(
      new Promise<void>((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/`, res => {
          res.resume();
          reject(new Error(`expected server to be closed, got status ${res.statusCode}`));
        });
        req.on('error', err => {
          if ('code' in err && err.code === 'ECONNREFUSED') {
            resolve();
            return;
          }
          reject(err);
        });
      })
    ).resolves.toBeUndefined();
  });

  it('parses aws_credentials and api_base_url from callback query', async () => {
    let port = 0;
    const aws = {
      access_key_id: 'AKIA',
      secret_access_key: 'secret',
      session_token: 'sess',
      expiration: '2099-01-01T00:00:00Z',
    };
    const loginPromise = browserLogin({
      app_url: 'https://app.example.com',
      channel: 'cli',
      no_open: true,
      timeout_ms: 10_000,
      on_listening: p => {
        port = p;
      },
    });

    await new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('no listen')), 2_000);
      const wait = setInterval(() => {
        if (port > 0) {
          clearInterval(wait);
          clearTimeout(deadline);
          resolve();
        }
      }, 10);
    });

    const qs = new URLSearchParams({
      access_token: 'tok',
      api_base_url: 'https://api.example.com/',
      aws_credentials: encodeURIComponent(JSON.stringify(aws)),
    });
    await new Promise<void>((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${port}/callback?${qs}`, res => {
          res.resume();
          res.on('end', () => resolve());
        })
        .on('error', reject);
    });

    const result = await loginPromise;
    expect(result.access_token).toBe('tok');
    expect(result.api_base_url).toBe('https://api.example.com');
    expect(result.aws_credentials).toEqual(aws);
  });

  it('ignores invalid aws_credentials JSON and still succeeds', async () => {
    let port = 0;
    const loginPromise = browserLogin({
      app_url: 'https://app.example.com',
      no_open: true,
      timeout_ms: 10_000,
      on_listening: p => {
        port = p;
      },
    });
    await new Promise<void>(r => {
      const wait = setInterval(() => {
        if (port > 0) {
          clearInterval(wait);
          r();
        }
      }, 10);
    });
    await new Promise<void>((resolve, reject) => {
      http
        .get(
          `http://127.0.0.1:${port}/callback?access_token=tok&aws_credentials=%7Bbad`,
          res => {
            res.resume();
            res.on('end', () => resolve());
          }
        )
        .on('error', reject);
    });
    await expect(loginPromise).resolves.toMatchObject({
      access_token: 'tok',
      aws_credentials: undefined,
    });
  });

  it('returns 400 HTML when callback lacks access_token', async () => {
    let port = 0;
    const loginPromise = browserLogin({
      app_url: 'https://app.example.com',
      no_open: true,
      timeout_ms: 500,
      on_listening: p => {
        port = p;
      },
    });
    await new Promise<void>(r => {
      const wait = setInterval(() => {
        if (port > 0) {
          clearInterval(wait);
          r();
        }
      }, 10);
    });
    const status = await new Promise<number>((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${port}/callback`, res => {
          res.resume();
          res.on('end', () => resolve(res.statusCode ?? 0));
        })
        .on('error', reject);
    });
    expect(status).toBe(400);
    await expect(loginPromise).rejects.toThrow(/timed out/);
  });

  it('serves plain text for non-callback paths', async () => {
    let port = 0;
    const loginPromise = browserLogin({
      app_url: 'https://app.example.com',
      no_open: true,
      timeout_ms: 800,
      on_listening: p => {
        port = p;
      },
    });
    await new Promise<void>(r => {
      const wait = setInterval(() => {
        if (port > 0) {
          clearInterval(wait);
          r();
        }
      }, 10);
    });
    const body = await new Promise<string>((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${port}/health`, res => {
          const chunks: Buffer[] = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        })
        .on('error', reject);
    });
    expect(body).toContain('callback server');
    await expect(loginPromise).rejects.toThrow(/timed out/);
  });

  it('shutdownCallbackServer destroys tracked sockets', () => {
    const sockets = new Set<Socket>();
    const fakeSocket = { destroy: jest.fn() } as unknown as Socket;
    sockets.add(fakeSocket);
    const server = {
      closeAllConnections: jest.fn(),
      close: jest.fn(),
    } as unknown as Server;
    shutdownCallbackServer(server, sockets);
    expect((fakeSocket as unknown as { destroy: jest.Mock }).destroy).toHaveBeenCalled();
    expect(sockets.size).toBe(0);
    expect((server as unknown as { close: jest.Mock }).close).toHaveBeenCalled();
  });
});
