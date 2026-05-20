/**
 * In-memory checkpoint store. For tests or single-process use.
 */

import type { CheckpointPosition, CheckpointStore } from './types.js';

export function createMemoryCheckpointStore(): CheckpointStore {
  const map = new Map<string, CheckpointPosition>();
  return {
    async save(checkpoint_id: string, position: CheckpointPosition): Promise<void> {
      map.set(checkpoint_id, { ...position });
    },
    async load(checkpoint_id: string): Promise<CheckpointPosition | null> {
      const pos = map.get(checkpoint_id);
      return pos ? { ...pos } : null;
    },
  };
}
