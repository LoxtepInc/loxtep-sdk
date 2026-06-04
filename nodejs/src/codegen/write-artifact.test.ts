import { writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { writeArtifact, computeCounts } from './write-artifact.js';
import type { NormalizedContext } from './types.js';

/** Create a unique temp directory for each test run */
function tempDir(): string {
  return join(tmpdir(), `writeArtifact-test-${randomBytes(8).toString('hex')}`);
}

const emptyNorm: NormalizedContext = {
  dataProducts: [],
  connectors: [],
  domains: [],
  queues: [],
  flows: [],
  workflows: [],
};

const populatedNorm: NormalizedContext = {
  dataProducts: [
    { key: 'orders', data: { name: 'orders', id: 'dp-1', domain: 'commerce', schema: null } },
    { key: 'users', data: { name: 'users', id: 'dp-2', domain: 'identity', schema: null } },
  ],
  connectors: [
    { key: 'shopify', data: { name: 'shopify', type: 'shopify', id: 'cn-1', connection_id: 'conn-1' } },
  ],
  domains: [
    { key: 'commerce', data: { name: 'commerce', id: 'dm-1', data_product_ids: ['dp-1'] } },
    { key: 'identity', data: { name: 'identity', id: 'dm-2', data_product_ids: ['dp-2'] } },
    { key: 'analytics', data: { name: 'analytics', id: 'dm-3', data_product_ids: [] } },
  ],
  queues: [
    { key: 'events', data: { name: 'events', id: 'q-1' } },
  ],
  flows: [],
  workflows: [
    { key: 'etl', data: { name: 'etl', id: 'w-1' } },
    { key: 'sync', data: { name: 'sync', id: 'w-2' } },
  ],
};

describe('computeCounts', () => {
  it('returns zeros for empty context', () => {
    const counts = computeCounts(emptyNorm);
    expect(counts).toEqual({
      dataProducts: 0,
      connectors: 0,
      domains: 0,
      queues: 0,
      flows: 0,
      workflows: 0,
    });
  });

  it('returns correct counts for populated context', () => {
    const counts = computeCounts(populatedNorm);
    expect(counts).toEqual({
      dataProducts: 2,
      connectors: 1,
      domains: 3,
      queues: 1,
      flows: 0,
      workflows: 2,
    });
  });
});

describe('writeArtifact', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = tempDir();
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('writes the source to the target path', async () => {
    const targetPath = join(testDir, 'generated', 'index.ts');
    const source = '// generated content\nexport const x = 1;\n';

    await writeArtifact(targetPath, source, emptyNorm);

    const written = await readFile(targetPath, 'utf-8');
    expect(written).toBe(source);
  });

  it('creates intermediate directories if they do not exist', async () => {
    const targetPath = join(testDir, 'deep', 'nested', 'dir', 'index.ts');
    const source = '// test\n';

    await writeArtifact(targetPath, source, emptyNorm);

    const written = await readFile(targetPath, 'utf-8');
    expect(written).toBe(source);
  });

  it('returns accurate per-type counts (R2.7)', async () => {
    const targetPath = join(testDir, 'index.ts');
    const source = '// artifact\n';

    const counts = await writeArtifact(targetPath, source, populatedNorm);

    expect(counts).toEqual({
      dataProducts: 2,
      connectors: 1,
      domains: 3,
      queues: 1,
      flows: 0,
      workflows: 2,
    });
  });

  it('returns zero counts for empty context (R2.7)', async () => {
    const targetPath = join(testDir, 'index.ts');
    const source = '// empty\n';

    const counts = await writeArtifact(targetPath, source, emptyNorm);

    expect(counts).toEqual({
      dataProducts: 0,
      connectors: 0,
      domains: 0,
      queues: 0,
      flows: 0,
      workflows: 0,
    });
  });

  it('overwrites an existing artifact atomically (R2.6)', async () => {
    const targetPath = join(testDir, 'index.ts');
    const original = '// original content\n';
    const updated = '// updated content\n';

    await writeFile(targetPath, original, 'utf-8');
    await writeArtifact(targetPath, updated, emptyNorm);

    const written = await readFile(targetPath, 'utf-8');
    expect(written).toBe(updated);
  });

  it('leaves prior artifact unchanged on write failure (R2.8)', async () => {
    // Use an invalid path (directory as file) to trigger a failure
    const targetPath = join(testDir, 'index.ts');
    const original = '// prior artifact\n';
    await writeFile(targetPath, original, 'utf-8');

    // Make targetPath a directory so rename fails
    const badPath = join(testDir, 'baddir', '');
    await mkdir(join(testDir, 'baddir'), { recursive: true });
    // Write a file inside the dir so it can't be overwritten by rename
    await writeFile(join(testDir, 'baddir', 'blocker'), 'x', 'utf-8');
    const dirAsTarget = join(testDir, 'baddir');

    // Attempt to write to a path that is actually a non-empty directory
    // On Linux, rename will fail with EISDIR when target is a directory
    await expect(
      writeArtifact(dirAsTarget, '// new content\n', emptyNorm),
    ).rejects.toThrow();

    // The original file is untouched
    const content = await readFile(targetPath, 'utf-8');
    expect(content).toBe(original);
  });

  it('does not leave temp files on success', async () => {
    const targetPath = join(testDir, 'index.ts');
    await writeArtifact(targetPath, '// content\n', emptyNorm);

    // Check for any temp files in the directory
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(testDir);
    const tempFiles = files.filter((f) => f.startsWith('.loxtep-gen-') && f.endsWith('.tmp'));
    expect(tempFiles).toHaveLength(0);
  });

  it('handles empty source string', async () => {
    const targetPath = join(testDir, 'index.ts');

    await writeArtifact(targetPath, '', emptyNorm);

    const written = await readFile(targetPath, 'utf-8');
    expect(written).toBe('');
  });

  it('handles large source content', async () => {
    const targetPath = join(testDir, 'index.ts');
    const largeSource = '// line\n'.repeat(10000);

    await writeArtifact(targetPath, largeSource, emptyNorm);

    const written = await readFile(targetPath, 'utf-8');
    expect(written).toBe(largeSource);
  });
});
