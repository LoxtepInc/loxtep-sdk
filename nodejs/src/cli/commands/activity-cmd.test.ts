/**
 * Tests for `loxtep activity list` CLI command.
 * Requirements: 7.4, 18.5
 */

import { runActivityListCommand } from './activity-cmd';
import type { LoxtepClient } from '../../client/loxtep-client';
import type { ActivityEntry } from '../../client/activity-types';

function makeEntry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    entry_id: 'ent_001',
    kind: 'audit',
    operation_name: 'create_data_product',
    actor: 'user_123',
    source: 'cli',
    resource_type: 'data_product',
    resource_id: 'dp_456',
    timestamp: '2025-01-15T10:30:00Z',
    ...overrides,
  };
}

function mockClient(entries: ActivityEntry[] = [], cursor: string | null = null): LoxtepClient {
  return {
    context: {
      activity: {
        list: jest.fn().mockResolvedValue({ entries, cursor }),
      },
    },
  } as unknown as LoxtepClient;
}

describe('runActivityListCommand', () => {
  it('returns exit 0 with "No activity entries found." when API returns empty', async () => {
    const client = mockClient([]);
    const result = await runActivityListCommand(client);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No activity entries found.');
    expect(result.stderr).toHaveLength(0);
  });

  it('returns formatted entries when API returns data', async () => {
    const entries: ActivityEntry[] = [
      makeEntry({
        entry_id: 'ent_001',
        kind: 'action_trace',
        workflow_name: 'sync-orders',
        operation_name: 'run_workflow',
        actor: 'user_abc',
        outcome: 'succeeded',
        timestamp: '2025-01-15T12:00:00Z',
        target_resource: 'dp_orders',
      }),
      makeEntry({
        entry_id: 'ent_002',
        kind: 'audit',
        operation_name: 'update_connector',
        actor: 'user_def',
        source: 'mcp',
        resource_type: 'connector',
        resource_id: 'cn_789',
        skill_name: 'data-workflows',
        timestamp: '2025-01-15T11:00:00Z',
      }),
    ];
    const client = mockClient(entries);
    const result = await runActivityListCommand(client);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toHaveLength(0);
    // First entry — action_trace
    expect(result.stdout.some(l => l.includes('TRACE') && l.includes('succeeded'))).toBe(true);
    expect(result.stdout.some(l => l.includes('Workflow: sync-orders'))).toBe(true);
    expect(result.stdout.some(l => l.includes('Target: dp_orders'))).toBe(true);
    // Second entry — audit
    expect(result.stdout.some(l => l.includes('AUDIT') && l.includes('mcp'))).toBe(true);
    expect(result.stdout.some(l => l.includes('Resource: connector/cn_789'))).toBe(true);
    expect(result.stdout.some(l => l.includes('Skill: data-workflows'))).toBe(true);
  });

  it('passes filters to the API client', async () => {
    const client = mockClient([]);
    await runActivityListCommand(client, {
      source: 'sdk',
      actor: 'user_xyz',
      resource_type: 'workflow',
      from: '2025-01-01T00:00:00Z',
      to: '2025-01-31T23:59:59Z',
      limit: 10,
    });
    expect(client.context.activity.list).toHaveBeenCalledWith({
      source: 'sdk',
      actor: 'user_xyz',
      resource_type: 'workflow',
      start: '2025-01-01T00:00:00Z',
      end: '2025-01-31T23:59:59Z',
      limit: 10,
    });
  });

  it('rejects invalid source filter with exit 1', async () => {
    const client = mockClient([]);
    const result = await runActivityListCommand(client, { source: 'invalid' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain('Invalid source filter');
    expect(result.stdout).toHaveLength(0);
  });

  it('returns exit 1 when API call fails', async () => {
    const client = {
      context: {
        activity: {
          list: jest.fn().mockRejectedValue(new Error('Network timeout')),
        },
      },
    } as unknown as LoxtepClient;
    const result = await runActivityListCommand(client);
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain('Failed to list activity');
    expect(result.stderr[0]).toContain('Network timeout');
  });
});
