/**
 * HTTP integration: approvals list_pending + resolve (approve/reject)
 * against `mock-platform-api` fixtures (no live mcpdev required).
 *
 * Bootstrap:
 * - Default path uses `createPlatformMockFetch` from `src/cli/__tests__/mock-platform-api.ts`
 *   (stable MOCK_IDS + production `{ success, data }` envelopes).
 * - Optional live smoke: `LOXTEP_CLI_SMOKE=1` with logged-in CLI credentials
 *   (`loxtep login`) and `LOXTEP_API_URL` / org in config — see `cli-staging-smoke.test.ts`.
 */

import { LoxtepClient } from './loxtep-client.js';
import {
  MOCK_IDS,
  MOCK_PLATFORM_API,
  createPlatformMockFetch,
} from '../cli/__tests__/mock-platform-api.js';

function createFixtureClient(): LoxtepClient {
  return new LoxtepClient({
    api_url: MOCK_PLATFORM_API,
    url_resolution: 'platform',
    auth: { type: 'jwt', token: 'fixture-jwt' },
    organization_id: MOCK_IDS.organization_id,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    fetch_fn: createPlatformMockFetch(),
  });
}

describe('approvals HTTP integration (mock platform fixtures)', () => {
  it('list_pending returns pending approval requests', async () => {
    const client = createFixtureClient();
    const pending = await client.review.approvals.list_pending();
    expect(pending.items).toHaveLength(1);
    expect(pending.items[0]?.approval_request_id).toBe(MOCK_IDS.approval_request_id);
    expect(pending.items[0]?.status).toBe('pending');
    expect(pending.items[0]?.organization_id).toBe(MOCK_IDS.organization_id);
  });

  it('resolve approve returns approved decision', async () => {
    const client = createFixtureClient();
    const result = await client.review.approvals.resolve(
      MOCK_IDS.approval_request_id,
      'approve'
    );
    expect(result).toEqual({
      approval_request_id: MOCK_IDS.approval_request_id,
      status: 'approved',
      decided_at: '2026-01-02T00:00:00.000Z',
    });
  });

  it('resolve reject returns rejected decision', async () => {
    const client = createFixtureClient();
    const result = await client.review.approvals.resolve(
      MOCK_IDS.approval_request_id,
      'reject'
    );
    expect(result).toEqual({
      approval_request_id: MOCK_IDS.approval_request_id,
      status: 'rejected',
      decided_at: '2026-01-02T00:00:00.000Z',
    });
  });
});
