/**
 * Stub namespaces for LoxtepClient. Methods will be implemented in later issues.
 * All surfaces use customer-facing terminology: data_products, flows, standards, data_contracts.
 */

export const data_products_stub = {
  get: (_id: string) => notImplemented('data_products.get'),
  list: (_filters?: Record<string, unknown>) => notImplemented('data_products.list'),
  search: (_query: string, _filters?: Record<string, unknown>) =>
    notImplemented('data_products.search'),
};

export const flows_stub = {
  get: (_id: string) => notImplemented('flows.get'),
  list: (_params: { project_id: string }) => notImplemented('flows.list'),
  create: (_params: Record<string, unknown>) => notImplemented('flows.create'),
};

export const connections_stub = {
  get: (_id: string) => notImplemented('connections.get'),
  list: (_filters?: Record<string, unknown>) => notImplemented('connections.list'),
  create: (_config: Record<string, unknown>) => notImplemented('connections.create'),
  update: (_id: string, _config: Record<string, unknown>) => notImplemented('connections.update'),
  test: (_id: string) => notImplemented('connections.test'),
};

export const queues_stub = {
  open_reader: (_params: { bot_id: string; queue_name: string }) =>
    notImplemented('queues.open_reader'),
  open_writer: (_params: { bot_id: string; queue_name: string }) =>
    notImplemented('queues.open_writer'),
  get_queue_metadata: (_queue_name: string) => notImplemented('queues.get_queue_metadata'),
};

function notImplemented(method: string): Promise<never> {
  return Promise.reject(new Error(`Not implemented: ${method}`));
}
