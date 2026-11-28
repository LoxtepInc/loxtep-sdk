import { createTriggersApi } from "./triggers.js";
import type { LoxtepHttpClient } from "../http/client.js";
import type { NodeExecutionConfig } from "./execution-types.js";

it.each<NodeExecutionConfig>([
  { mode: "fanout", instances: 2, key: "mongodb_document_id" },
  { mode: "partitioning", partition_count: 2, key: "mongodb_document_id" },
])(
  "forwards execution configuration through source creation and partial update: %j",
  async (execution) => {
    const writes: Record<string, unknown>[] = [];
    const existing = {
      connection_id: "connection",
      project_id: "project",
      workflow_id: "workflow",
      configuration: { database: "citygro" },
    };
    const http = {
      get: async () => ({ success: true, data: existing }),
      put: async (_path: string, body: Record<string, unknown>) => {
        writes.push(body);
        return { success: true, data: body };
      },
    } as unknown as LoxtepHttpClient;
    const api = createTriggersApi(http);
    await api.create({
      project_id: "project",
      workflow_id: "workflow",
      key: "lookup",
      name: "Lookup",
      type: "mongodb-source",
      execution,
    });
    await api.update("connection", {
      project_id: "project",
      workflow_id: "workflow",
      execution,
    });
    expect(writes.map((write) => write.execution)).toEqual([
      execution,
      execution,
    ]);
    expect(writes[1].configuration).toEqual(existing.configuration);
    expect(writes.every((write) => !Object.hasOwn(write, "checkpoints"))).toBe(
      true,
    );
  },
);
