#!/usr/bin/env node
/**
 * Generate TypeScript types from API Zod schemas (LOX-970).
 * Writes src/types/generated-api.ts. Run: pnpm run generate:api-types
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { createTypeAlias, printNode, zodToTs } from 'zod-to-ts';
import {
  PaginationMetaSchema,
  DataProductSchema,
  FlowSchema,
  FlowNodeSchema,
  ConnectionSchema,
  QueueMetadataSchema,
  QueueEventSchema,
  QualityMetricSchema,
} from './api-schemas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '../src/types/generated-api.ts');

const pairs: Array<{ schema: import('zod').ZodTypeAny; name: string }> = [
  { schema: PaginationMetaSchema, name: 'PaginationMetaApi' },
  { schema: DataProductSchema, name: 'DataProductApi' },
  { schema: FlowSchema, name: 'FlowApi' },
  { schema: FlowNodeSchema, name: 'FlowNodeApi' },
  { schema: ConnectionSchema, name: 'ConnectionApi' },
  { schema: QueueMetadataSchema, name: 'QueueMetadataApi' },
  { schema: QueueEventSchema, name: 'QueueEventApi' },
  { schema: QualityMetricSchema, name: 'QualityMetricApi' },
];

const lines: string[] = [
  '/**',
  ' * Generated TypeScript types from API Zod schemas. Do not edit by hand.',
  ' * Regenerate: pnpm run generate:api-types',
  ' * Source: scripts/api-schemas.ts',
  ' */',
  '',
];

for (const { schema, name } of pairs) {
  try {
    const { node } = zodToTs(schema, name);
    const typeAlias = createTypeAlias(node, name);
    const nodeString = printNode(typeAlias);
    lines.push(nodeString.startsWith('type ') ? 'export ' + nodeString : nodeString);
    lines.push('');
  } catch (err) {
    console.error(`zod-to-ts failed for ${name}:`, err);
    lines.push(`export type ${name} = Record<string, unknown>; // fallback (zod-to-ts failed)`);
    lines.push('');
  }
}

const content = lines.join('\n').trimEnd() + '\n';
writeFileSync(outPath, content, 'utf-8');
console.log('Wrote', outPath);
