import http from 'node:http';
import { browserLogin } from './browser-login.js';

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
});
