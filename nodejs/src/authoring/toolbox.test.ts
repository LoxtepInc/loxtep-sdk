import { createToolbox, ToolboxOperationError } from './toolbox';
import type { Toolbox, DataProductRef, WorkflowRef } from './toolbox';
import type { QueueRef } from './types';

/**
 * Minimal mock of LoxtepClient — only the namespaces used by the toolbox.
 * Each method is a jest.fn() for assertion.
 */
function createMockClient() {
  return {
    data_products: {
      get_writer: jest.fn(),
      query: jest.fn(),
      get: jest.fn(),
      list: jest.fn(),
    },
    queues: {
      open_writer: jest.fn(),
      get_queue_metadata: jest.fn(),
    },
    connections: {
      list: jest.fn(),
      get: jest.fn(),
      test: jest.fn(),
    },
    workflows: {
      listWorkflows: jest.fn(),
      getWorkflowGraph: jest.fn(),
    },
  } as unknown as Parameters<typeof createToolbox>[0]['client'];
}

describe('toolbox', () => {
  const projectId = 'proj_test_123';
  let client: ReturnType<typeof createMockClient>;
  let toolbox: Toolbox;

  beforeEach(() => {
    client = createMockClient();
    toolbox = createToolbox({ client, projectId });
  });

  describe('dataProducts.write', () => {
    const ref: DataProductRef = { id: 'dp_1', name: 'orders' };

    it('writes an event and returns a WriteResult on success', async () => {
      const mockWriter = { write: jest.fn(), close: jest.fn().mockResolvedValue(undefined) };
      (client.data_products.get_writer as jest.Mock).mockResolvedValue(mockWriter);

      const result = await toolbox.dataProducts.write(ref, { order_id: 1 });

      expect(client.data_products.get_writer).toHaveBeenCalledWith('orders');
      expect(mockWriter.write).toHaveBeenCalledWith({ order_id: 1 });
      expect(mockWriter.close).toHaveBeenCalled();
      expect(result).toEqual({ success: true, events_written: 1 });
    });

    it('throws ToolboxOperationError on failure (no model fallback)', async () => {
      (client.data_products.get_writer as jest.Mock).mockRejectedValue(
        new Error('stream bus not configured'),
      );

      await expect(toolbox.dataProducts.write(ref, {})).rejects.toThrow(ToolboxOperationError);
      await expect(toolbox.dataProducts.write(ref, {})).rejects.toMatchObject({
        namespace: 'dataProducts',
        operation: 'write',
        code: 'TOOLBOX_OPERATION_FAILED',
      });
    });
  });

  describe('dataProducts.query', () => {
    const ref: DataProductRef = { id: 'dp_1', name: 'orders' };

    it('returns rows from a SQL query', async () => {
      const mockResult = {
        items: [{ order_id: 1 }, { order_id: 2 }],
        metadata: { data_product_id: 'dp_1', total_rows: 2 },
      };
      (client.data_products.query as jest.Mock).mockResolvedValue(mockResult);

      const result = await toolbox.dataProducts.query(ref, 'SELECT * FROM orders');

      expect(client.data_products.query).toHaveBeenCalledWith('dp_1', 'SELECT * FROM orders');
      expect(result.items).toEqual([{ order_id: 1 }, { order_id: 2 }]);
      expect(result.metadata.data_product_id).toBe('dp_1');
    });

    it('throws ToolboxOperationError on failure', async () => {
      (client.data_products.query as jest.Mock).mockRejectedValue(new Error('query timeout'));

      await expect(toolbox.dataProducts.query(ref, 'SELECT 1')).rejects.toThrow(
        ToolboxOperationError,
      );
      await expect(toolbox.dataProducts.query(ref, 'SELECT 1')).rejects.toMatchObject({
        namespace: 'dataProducts',
        operation: 'query',
      });
    });
  });

  describe('dataProducts.get', () => {
    const ref: DataProductRef = { id: 'dp_1', name: 'orders' };

    it('returns a data product by reference', async () => {
      const mockDP = { data_product_id: 'dp_1', name: 'orders', kind: 'source' };
      (client.data_products.get as jest.Mock).mockResolvedValue(mockDP);

      const result = await toolbox.dataProducts.get(ref);

      expect(client.data_products.get).toHaveBeenCalledWith('dp_1');
      expect(result).toEqual(mockDP);
    });

    it('throws ToolboxOperationError on failure', async () => {
      (client.data_products.get as jest.Mock).mockRejectedValue(new Error('not found'));

      await expect(toolbox.dataProducts.get(ref)).rejects.toThrow(ToolboxOperationError);
      await expect(toolbox.dataProducts.get(ref)).rejects.toMatchObject({
        namespace: 'dataProducts',
        operation: 'get',
      });
    });
  });

  describe('dataProducts.list', () => {
    it('lists data products', async () => {
      const items = [{ data_product_id: 'dp_1', name: 'orders' }];
      (client.data_products.list as jest.Mock).mockResolvedValue({ items, pagination: {} });

      const result = await toolbox.dataProducts.list();

      expect(client.data_products.list).toHaveBeenCalledWith({ domain_id: undefined });
      expect(result).toEqual(items);
    });

    it('passes domain_id filter', async () => {
      (client.data_products.list as jest.Mock).mockResolvedValue({ items: [], pagination: {} });

      await toolbox.dataProducts.list({ domain_id: 'dm_1' });

      expect(client.data_products.list).toHaveBeenCalledWith({ domain_id: 'dm_1' });
    });

    it('throws ToolboxOperationError on failure', async () => {
      (client.data_products.list as jest.Mock).mockRejectedValue(new Error('unauthorized'));

      await expect(toolbox.dataProducts.list()).rejects.toThrow(ToolboxOperationError);
      await expect(toolbox.dataProducts.list()).rejects.toMatchObject({
        namespace: 'dataProducts',
        operation: 'list',
      });
    });
  });

  describe('queues.write', () => {
    const ref: QueueRef = { id: 'q_1', name: 'orders_raw' };

    it('writes an event to a queue', async () => {
      const mockWriter = {
        write: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
      };
      (client.queues.open_writer as jest.Mock).mockResolvedValue(mockWriter);

      await toolbox.queues.write(ref, { payload: 'data' });

      expect(client.queues.open_writer).toHaveBeenCalledWith({
        bot_id: 'toolbox-writer-orders_raw',
        queue_name: 'orders_raw',
      });
      expect(mockWriter.write).toHaveBeenCalledWith({ payload: 'data' });
      expect(mockWriter.close).toHaveBeenCalled();
    });

    it('throws ToolboxOperationError on failure', async () => {
      (client.queues.open_writer as jest.Mock).mockRejectedValue(
        new Error('stream bus missing'),
      );

      await expect(toolbox.queues.write(ref, {})).rejects.toThrow(ToolboxOperationError);
      await expect(toolbox.queues.write(ref, {})).rejects.toMatchObject({
        namespace: 'queues',
        operation: 'write',
      });
    });
  });

  describe('queues.getMetadata', () => {
    const ref: QueueRef = { id: 'q_1', name: 'orders_raw' };

    it('returns queue metadata', async () => {
      const metadata = { queue_name: 'orders_raw', stats: { event_count: 42 } };
      (client.queues.get_queue_metadata as jest.Mock).mockResolvedValue(metadata);

      const result = await toolbox.queues.getMetadata(ref);

      expect(client.queues.get_queue_metadata).toHaveBeenCalledWith('orders_raw');
      expect(result.queue_name).toBe('orders_raw');
    });

    it('throws ToolboxOperationError on failure', async () => {
      (client.queues.get_queue_metadata as jest.Mock).mockRejectedValue(
        new Error('queue not found'),
      );

      await expect(toolbox.queues.getMetadata(ref)).rejects.toThrow(ToolboxOperationError);
      await expect(toolbox.queues.getMetadata(ref)).rejects.toMatchObject({
        namespace: 'queues',
        operation: 'getMetadata',
      });
    });
  });

  describe('connections.list', () => {
    it('lists connections', async () => {
      const items = [{ connection_id: 'conn_1', name: 'shopify' }];
      (client.connections.list as jest.Mock).mockResolvedValue({ items, pagination: {} });

      const result = await toolbox.connections.list();

      expect(client.connections.list).toHaveBeenCalled();
      expect(result).toEqual(items);
    });

    it('throws ToolboxOperationError on failure', async () => {
      (client.connections.list as jest.Mock).mockRejectedValue(new Error('network error'));

      await expect(toolbox.connections.list()).rejects.toThrow(ToolboxOperationError);
      await expect(toolbox.connections.list()).rejects.toMatchObject({
        namespace: 'connections',
        operation: 'list',
      });
    });
  });

  describe('connections.get', () => {
    it('gets a connection by ID', async () => {
      const conn = { connection_id: 'conn_1', name: 'shopify' };
      (client.connections.get as jest.Mock).mockResolvedValue(conn);

      const result = await toolbox.connections.get('conn_1');

      expect(client.connections.get).toHaveBeenCalledWith('conn_1');
      expect(result).toEqual(conn);
    });

    it('throws ToolboxOperationError on failure', async () => {
      (client.connections.get as jest.Mock).mockRejectedValue(new Error('not found'));

      await expect(toolbox.connections.get('conn_x')).rejects.toThrow(ToolboxOperationError);
    });
  });

  describe('connections.test', () => {
    it('tests a connection', async () => {
      const testResult = { success: true, message: 'Connected' };
      (client.connections.test as jest.Mock).mockResolvedValue(testResult);

      const result = await toolbox.connections.test('conn_1');

      expect(client.connections.test).toHaveBeenCalledWith('conn_1');
      expect(result).toEqual(testResult);
    });

    it('throws ToolboxOperationError on failure', async () => {
      (client.connections.test as jest.Mock).mockRejectedValue(new Error('timeout'));

      await expect(toolbox.connections.test('conn_1')).rejects.toThrow(ToolboxOperationError);
      await expect(toolbox.connections.test('conn_1')).rejects.toMatchObject({
        namespace: 'connections',
        operation: 'test',
      });
    });
  });

  describe('workflows.list', () => {
    it('lists workflows for the project', async () => {
      const items = [{ workflow_id: 'wf_1', name: 'ingest-orders' }];
      (client.workflows.listWorkflows as jest.Mock).mockResolvedValue({
        items,
        pagination: {},
      });

      const result = await toolbox.workflows.list();

      expect(client.workflows.listWorkflows).toHaveBeenCalledWith({ project_id: projectId });
      expect(result).toEqual(items);
    });

    it('throws ToolboxOperationError on failure', async () => {
      (client.workflows.listWorkflows as jest.Mock).mockRejectedValue(
        new Error('unauthorized'),
      );

      await expect(toolbox.workflows.list()).rejects.toThrow(ToolboxOperationError);
      await expect(toolbox.workflows.list()).rejects.toMatchObject({
        namespace: 'workflows',
        operation: 'list',
      });
    });
  });

  describe('workflows.getGraph', () => {
    const ref: WorkflowRef = { id: 'wf_1', name: 'ingest-orders' };

    it('returns the workflow graph', async () => {
      const graph = {
        workflow_id: 'wf_1',
        nodes: [{ node_id: 'n1', workflow_id: 'wf_1', type: 'ingestion' }],
        edges: [{ source_node_id: 'n1', target_node_id: 'n2' }],
      };
      (client.workflows.getWorkflowGraph as jest.Mock).mockResolvedValue(graph);

      const result = await toolbox.workflows.getGraph(ref);

      expect(client.workflows.getWorkflowGraph).toHaveBeenCalledWith('wf_1', projectId);
      expect(result).toEqual(graph);
    });

    it('throws ToolboxOperationError on failure', async () => {
      (client.workflows.getWorkflowGraph as jest.Mock).mockRejectedValue(
        new Error('workflow not found'),
      );

      await expect(toolbox.workflows.getGraph(ref)).rejects.toThrow(ToolboxOperationError);
      await expect(toolbox.workflows.getGraph(ref)).rejects.toMatchObject({
        namespace: 'workflows',
        operation: 'getGraph',
      });
    });
  });

  describe('no-model behavior (R4.1)', () => {
    /**
     * Validates: Requirements 4.1
     *
     * The toolbox namespace invokes platform tools directly and returns typed
     * results WITHOUT invoking any AI model/LLM/inference call.
     *
     * Strategy: Spy on every client namespace method. After a successful
     * toolbox call, assert that exactly the expected client method was invoked
     * and no other client method was called — proving no model indirection.
     */

    it('dataProducts.write calls only client.data_products.get_writer — no model invoked', async () => {
      const ref: DataProductRef = { id: 'dp_1', name: 'orders' };
      const mockWriter = { write: jest.fn(), close: jest.fn().mockResolvedValue(undefined) };
      (client.data_products.get_writer as jest.Mock).mockResolvedValue(mockWriter);

      await toolbox.dataProducts.write(ref, { order_id: 1 });

      // The expected client method was called
      expect(client.data_products.get_writer).toHaveBeenCalledTimes(1);

      // No other client namespace methods were invoked (no model/LLM indirection)
      expect(client.data_products.query).not.toHaveBeenCalled();
      expect(client.data_products.get).not.toHaveBeenCalled();
      expect(client.data_products.list).not.toHaveBeenCalled();
      expect(client.queues.open_writer).not.toHaveBeenCalled();
      expect(client.queues.get_queue_metadata).not.toHaveBeenCalled();
      expect(client.connections.list).not.toHaveBeenCalled();
      expect(client.connections.get).not.toHaveBeenCalled();
      expect(client.connections.test).not.toHaveBeenCalled();
      expect(client.workflows.listWorkflows).not.toHaveBeenCalled();
      expect(client.workflows.getWorkflowGraph).not.toHaveBeenCalled();
    });

    it('dataProducts.query calls only client.data_products.query — no model invoked', async () => {
      const ref: DataProductRef = { id: 'dp_1', name: 'orders' };
      (client.data_products.query as jest.Mock).mockResolvedValue({
        items: [{ id: 1 }],
        metadata: { data_product_id: 'dp_1', total_rows: 1 },
      });

      await toolbox.dataProducts.query(ref, 'SELECT 1');

      expect(client.data_products.query).toHaveBeenCalledTimes(1);
      expect(client.data_products.get_writer).not.toHaveBeenCalled();
      expect(client.data_products.get).not.toHaveBeenCalled();
      expect(client.data_products.list).not.toHaveBeenCalled();
      expect(client.queues.open_writer).not.toHaveBeenCalled();
      expect(client.workflows.listWorkflows).not.toHaveBeenCalled();
    });

    it('queues.write calls only client.queues.open_writer — no model invoked', async () => {
      const ref: QueueRef = { id: 'q_1', name: 'orders_raw' };
      const mockWriter = {
        write: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
      };
      (client.queues.open_writer as jest.Mock).mockResolvedValue(mockWriter);

      await toolbox.queues.write(ref, { data: 'test' });

      expect(client.queues.open_writer).toHaveBeenCalledTimes(1);
      expect(client.data_products.get_writer).not.toHaveBeenCalled();
      expect(client.data_products.query).not.toHaveBeenCalled();
      expect(client.queues.get_queue_metadata).not.toHaveBeenCalled();
      expect(client.workflows.listWorkflows).not.toHaveBeenCalled();
    });

    it('workflows.list calls only client.workflows.listWorkflows — no model invoked', async () => {
      (client.workflows.listWorkflows as jest.Mock).mockResolvedValue({
        items: [{ workflow_id: 'wf_1', name: 'flow' }],
        pagination: {},
      });

      await toolbox.workflows.list();

      expect(client.workflows.listWorkflows).toHaveBeenCalledTimes(1);
      expect(client.data_products.get_writer).not.toHaveBeenCalled();
      expect(client.data_products.query).not.toHaveBeenCalled();
      expect(client.queues.open_writer).not.toHaveBeenCalled();
      expect(client.connections.list).not.toHaveBeenCalled();
      expect(client.workflows.getWorkflowGraph).not.toHaveBeenCalled();
    });

    it('connections.list calls only client.connections.list — no model invoked', async () => {
      (client.connections.list as jest.Mock).mockResolvedValue({
        items: [{ connection_id: 'conn_1', name: 'main' }],
        pagination: {},
      });

      await toolbox.connections.list();

      expect(client.connections.list).toHaveBeenCalledTimes(1);
      expect(client.connections.get).not.toHaveBeenCalled();
      expect(client.connections.test).not.toHaveBeenCalled();
      expect(client.data_products.get_writer).not.toHaveBeenCalled();
      expect(client.queues.open_writer).not.toHaveBeenCalled();
      expect(client.workflows.listWorkflows).not.toHaveBeenCalled();
    });
  });

  describe('ToolboxOperationError', () => {
    it('has the correct name and code', () => {
      const err = new ToolboxOperationError('dataProducts', 'write', 'stream failed');
      expect(err.name).toBe('ToolboxOperationError');
      expect(err.code).toBe('TOOLBOX_OPERATION_FAILED');
      expect(err.namespace).toBe('dataProducts');
      expect(err.operation).toBe('write');
      expect(err.message).toBe('toolbox.dataProducts.write failed: stream failed');
    });

    it('is an instance of Error and LoxtepError', () => {
      const err = new ToolboxOperationError('queues', 'write', 'queue missing');
      expect(err).toBeInstanceOf(Error);
      // The error extends LoxtepError which extends Error
      expect(err.code).toBe('TOOLBOX_OPERATION_FAILED');
    });

    it('includes cause_message in details when cause is an Error', () => {
      const cause = new Error('underlying cause');
      const err = new ToolboxOperationError('workflows', 'list', 'failed', cause);
      expect(err.details).toMatchObject({
        namespace: 'workflows',
        operation: 'list',
        cause_message: 'underlying cause',
      });
    });

    it('preserves status_code from the cause', () => {
      const cause = { status_code: 404, message: 'not found' };
      const err = new ToolboxOperationError('dataProducts', 'get', 'not found', cause);
      expect(err.status_code).toBe(404);
    });
  });
});
