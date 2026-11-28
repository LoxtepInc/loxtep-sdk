/** Canonical node execution configuration; execution remains owned by the native runtime. */
export type NodeExecutionConfig =
  | { mode: "single" }
  | {
      mode: "fanout";
      /** Total invocations INCLUDING the parent processing work. Integer 1–20. */
      instances: number;
      key: "event_id" | "mongodb_document_id" | { fields: string[] };
    }
  | {
      mode: "partitioning";
      /** Fixed MongoDB lookup workers, each with its own checkpoint. Integer 1–256. */
      partition_count: number;
      key: "mongodb_document_id";
    };
