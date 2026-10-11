import { createQueuesApi } from './queues.js';
import type { LoxtepHttpClient } from '../http/client.js';

function http(body: unknown, instanceId?: string): LoxtepHttpClient {
  return {
    get: jest.fn(async () => body),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    getDefaultHeader: () => instanceId,
  } as unknown as LoxtepHttpClient;
}

describe('queue visibility', () => {
  it('does not invent checkpoints when the selected instance list is empty', async () => {
    const api = createQueuesApi(http({ queues: [] }, 'instance-a'));
    const meta = await api.get_queue_metadata('q-events');
    expect(meta).toMatchObject({
      queue_name: 'q-events',
      visibility: 'empty_on_selected_instance',
      instance_id: 'instance-a',
    });
    expect(meta.checkpoints).toBeUndefined();
    await expect(api.get_reader_checkpoint('q-events', 'bot-1')).rejects.toMatchObject({
      code: 'empty_on_selected_instance',
    });
  });

  it('marks a name absent from a non-empty instance list as not_visible', async () => {
    const api = createQueuesApi(
      http({ queues: [{ queue_name: 'other', checkpoints: [{ bot_id: 'bot-1', checkpoint: 'z/9' }] }] }, 'instance-b')
    );
    const meta = await api.get_queue_metadata('q-events');
    expect(meta.visibility).toBe('not_visible');
    expect(meta.instance_id).toBe('instance-b');
    expect(meta.checkpoints).toBeUndefined();
    await expect(api.get_reader_checkpoint('q-events', 'bot-1')).rejects.toMatchObject({
      code: 'not_visible',
    });
  });

  it('returns the queue that is visible on the selected instance', async () => {
    const api = createQueuesApi(
      http({ queues: [{ queue_name: 'q-events', checkpoints: [{ bot_id: 'bot-1', checkpoint: 'z/4' }] }] }, 'instance-a')
    );
    const checkpoint = await api.get_reader_checkpoint('q-events', 'bot-1');
    expect(checkpoint.checkpoint).toBe('z/4');
  });
});
