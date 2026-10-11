jest.mock('../create-cli-client.js', () => ({
  requireCliClient: jest.fn(),
}));

import { requireCliClient } from '../create-cli-client.js';
import { runDataProductsQuery } from './data-products-cmd.js';
import { WarehouseQueryError } from '../../client/data-products-types.js';

const requireClient = requireCliClient as jest.MockedFunction<typeof requireCliClient>;

describe('data-products query receipt', () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

  beforeEach(() => {
    log.mockClear();
    error.mockClear();
    process.exitCode = 0;
  });

  afterAll(() => {
    log.mockRestore();
    error.mockRestore();
  });

  it('prints the native receipt and exits nonzero when the query failed', async () => {
    requireClient.mockResolvedValue({
      client: {
        build: {
          data_products: {
            query_receipt: async () => ({
              data_product_id: 'dp-1',
              query_id: 'q-9',
              status: 'failed',
              rows: [],
              error: 'schema_mismatch: event_type',
              error_code: 'query_error',
              completion_evidence: 'native',
            }),
            query: jest.fn(),
          },
        },
      },
    } as never);
    await runDataProductsQuery('dp-1', 'SELECT event_type FROM t', { receipt: true });
    expect(process.exitCode).toBe(1);
    const receipt = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(receipt).toMatchObject({
      query_id: 'q-9',
      status: 'failed',
      completion_evidence: 'native',
    });
  });

  it('keeps query_id on the row-mode error and does not print rows', async () => {
    requireClient.mockResolvedValue({
      client: {
        build: {
          data_products: {
            query: async () => {
              throw new WarehouseQueryError('schema_mismatch: event_type', {
                query_id: 'q-9',
                status: 'failed',
                code: 'query_error',
              });
            },
          },
        },
      },
    } as never);
    await runDataProductsQuery('dp-1', 'SELECT event_type FROM t');
    expect(process.exitCode).toBe(1);
    expect(log).not.toHaveBeenCalled();
    expect(JSON.parse(String(error.mock.calls[0]?.[0]))).toMatchObject({
      code: 'query_error',
      query_id: 'q-9',
    });
  });

  it('prints rows when the native status is completed', async () => {
    requireClient.mockResolvedValue({
      client: {
        build: {
          data_products: {
            query: async () => ({ items: [{ id: '1' }], metadata: { data_product_id: 'dp-1' } }),
          },
        },
      },
    } as never);
    await runDataProductsQuery('dp-1', 'SELECT id FROM t');
    expect(process.exitCode).toBe(0);
    expect(JSON.parse(String(log.mock.calls[0]?.[0])).items).toEqual([{ id: '1' }]);
  });
});
