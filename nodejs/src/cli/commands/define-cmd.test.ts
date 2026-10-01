/**
 * Unit tests for loxtep define CLI commands.
 */

import {
  runDefineStatusCommand,
  runDefineSubmitShapeCommand,
  runDefineApproveCommand,
  runDefineBatchCommand,
} from './define-cmd.js';
import type { LoxtepClient } from '../../client/loxtep-client.js';

function mockClient(product_definition: Record<string, unknown>): LoxtepClient {
  return {
    define: { product_definition },
  } as unknown as LoxtepClient;
}

describe('define-cmd', () => {
  it('status returns JSON from product_definition.get_definition_status', async () => {
    const client = mockClient({
      get_definition_status: async (id: string) => ({ data_product_id: id, blockers: [] }),
    });
    const result = await runDefineStatusCommand(client, 'dp-1');
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout[0]!)).toEqual({ data_product_id: 'dp-1', blockers: [] });
  });

  it('submit-shape requires --definition JSON object', async () => {
    const client = mockClient({
      submit_shape_proposal: async () => ({ ok: true }),
    });
    const bad = await runDefineSubmitShapeCommand(client, 'dp-1', {
      definition_json: '[]',
    });
    expect(bad.exitCode).toBe(1);
    expect(bad.stderr[0]).toMatch(/JSON object/);
  });

  it('approve forwards semantic_proposal_id', async () => {
    let got: string | undefined;
    const client = mockClient({
      approve_definition_proposal: async (id: string) => {
        got = id;
        return { disposition: 'accepted' };
      },
    });
    const result = await runDefineApproveCommand(client, 'sp-9');
    expect(result.exitCode).toBe(0);
    expect(got).toBe('sp-9');
  });

  it('batch parses csv ids', async () => {
    let got: { data_product_ids: string[]; action?: string } | undefined;
    const client = mockClient({
      run_definition_batch: async (input: {
        data_product_ids: string[];
        action?: string;
      }) => {
        got = input;
        return { results: [] };
      },
    });
    const result = await runDefineBatchCommand(client, {
      data_product_ids: 'a, b ,c',
      action: 'evidence',
    });
    expect(result.exitCode).toBe(0);
    expect(got).toEqual({ data_product_ids: ['a', 'b', 'c'], action: 'evidence' });
  });
});
