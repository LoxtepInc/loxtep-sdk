/**
 * Skill YAML schema validation and loader.
 *
 * Parses `.loxtep/skills/<name>.yaml` files into validated `SkillDefinition`
 * objects using zod for schema enforcement. Invalid YAML or schema violations
 * produce descriptive errors.
 */

import { z } from 'zod/v4';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SkillDefinition } from './types.js';

/**
 * Zod schema for a skill definition YAML file.
 * Validates the structure and constraints of skill scope and permissions.
 */
const OperationSchema = z.enum(['read', 'write', 'create', 'delete']);

const SkillScopeSchema = z.object({
  data_products: z.array(z.string()).optional(),
  connectors: z.array(z.string()).optional(),
  workflows: z.array(z.string()).optional(),
  domains: z.array(z.string()).optional(),
  queues: z.array(z.string()).optional(),
});

const SkillDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  scope: SkillScopeSchema,
  permissions: z.object({
    data_products: z.array(OperationSchema).optional(),
    connectors: z.array(OperationSchema).optional(),
    workflows: z.array(OperationSchema).optional(),
    domains: z.array(OperationSchema).optional(),
    queues: z.array(OperationSchema).optional(),
  }).partial(),
});

export { SkillDefinitionSchema };

/**
 * Parse a YAML string into a validated SkillDefinition.
 *
 * @param content - Raw YAML content
 * @param filename - Source filename (for error messages)
 * @returns Validated SkillDefinition
 * @throws Error with descriptive message on invalid YAML or schema violations
 */
export function parseSkillYaml(content: string, filename?: string): SkillDefinition {
  let parsed: unknown;
  try {
    parsed = yaml.load(content);
  } catch (err) {
    const prefix = filename ? `${filename}: ` : '';
    throw new Error(
      `${prefix}Invalid YAML: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const result = SkillDefinitionSchema.safeParse(parsed);
  if (!result.success) {
    const prefix = filename ? `${filename}: ` : '';
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`${prefix}Skill schema validation failed:\n${issues}`);
  }

  return result.data as SkillDefinition;
}

/**
 * Load a single skill definition from a YAML file path.
 *
 * @param filePath - Absolute or relative path to the `.yaml` file
 * @returns Validated SkillDefinition
 * @throws Error if file cannot be read or fails validation
 */
export function loadSkillFromFile(filePath: string): SkillDefinition {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseSkillYaml(content, path.basename(filePath));
}

/**
 * Load all skill definitions from a `.loxtep/skills/` directory.
 *
 * @param skillsDir - Path to the skills directory (e.g. `.loxtep/skills/`)
 * @returns Map of skill name → SkillDefinition
 * @throws Error if any file fails to parse or validate
 */
export function loadSkillsFromDirectory(skillsDir: string): Map<string, SkillDefinition> {
  const skills = new Map<string, SkillDefinition>();

  if (!fs.existsSync(skillsDir)) {
    return skills;
  }

  const entries = fs.readdirSync(skillsDir);
  for (const entry of entries) {
    if (!entry.endsWith('.yaml') && !entry.endsWith('.yml')) {
      continue;
    }

    const filePath = path.join(skillsDir, entry);
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      continue;
    }

    const skill = loadSkillFromFile(filePath);
    skills.set(skill.name, skill);
  }

  return skills;
}
