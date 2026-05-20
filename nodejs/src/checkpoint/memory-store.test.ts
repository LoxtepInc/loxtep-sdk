import { createMemoryCheckpointStore } from './memory-store.js';

describe('createMemoryCheckpointStore', () => {
  it('should save then load returns same position', async () => {
    const store = createMemoryCheckpointStore();
    await store.save('my-checkpoint', { event_id: 'e1', checkpoint: 'z/100' });
    const loaded = await store.load('my-checkpoint');
    expect(loaded).toEqual({ event_id: 'e1', checkpoint: 'z/100' });
  });

  it('should return null for unknown checkpoint_id', async () => {
    const store = createMemoryCheckpointStore();
    const loaded = await store.load('unknown');
    expect(loaded).toBeNull();
  });
});
