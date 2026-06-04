import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parseSkillYaml, loadSkillFromFile, loadSkillsFromDirectory } from './loader';

describe('parseSkillYaml', () => {
  it('parses a valid skill YAML string', () => {
    const yaml = `
name: analytics
description: Read-only analytics skill
scope:
  data_products:
    - dp_orders
    - dp_customers
  connectors:
    - cn_shopify
permissions:
  data_products:
    - read
  connectors:
    - read
`;
    const result = parseSkillYaml(yaml);
    expect(result).toEqual({
      name: 'analytics',
      description: 'Read-only analytics skill',
      scope: {
        data_products: ['dp_orders', 'dp_customers'],
        connectors: ['cn_shopify'],
      },
      permissions: {
        data_products: ['read'],
        connectors: ['read'],
      },
    });
  });

  it('parses a minimal skill with empty scope and permissions', () => {
    const yaml = `
name: minimal
scope: {}
permissions: {}
`;
    const result = parseSkillYaml(yaml);
    expect(result).toEqual({
      name: 'minimal',
      scope: {},
      permissions: {},
    });
  });

  it('parses a skill with all resource types and operations', () => {
    const yaml = `
name: full-access
scope:
  data_products:
    - dp_1
  connectors:
    - cn_1
  workflows:
    - wf_1
  domains:
    - dm_1
  queues:
    - q_1
permissions:
  data_products:
    - read
    - write
    - create
    - delete
  connectors:
    - read
    - write
  workflows:
    - read
    - write
    - create
    - delete
  domains:
    - read
  queues:
    - read
    - write
`;
    const result = parseSkillYaml(yaml);
    expect(result.name).toBe('full-access');
    expect(result.scope.data_products).toEqual(['dp_1']);
    expect(result.permissions.data_products).toEqual(['read', 'write', 'create', 'delete']);
  });

  it('throws on invalid YAML syntax', () => {
    const badYaml = `name: test\n  bad indent: here`;
    expect(() => parseSkillYaml(badYaml, 'bad.yaml')).toThrow('bad.yaml: Invalid YAML:');
  });

  it('throws on schema violation — missing name', () => {
    const yaml = `
scope:
  data_products:
    - dp_1
permissions: {}
`;
    expect(() => parseSkillYaml(yaml, 'test.yaml')).toThrow(
      'test.yaml: Skill schema validation failed:'
    );
  });

  it('throws on schema violation — empty name', () => {
    const yaml = `
name: ""
scope: {}
permissions: {}
`;
    expect(() => parseSkillYaml(yaml, 'empty-name.yaml')).toThrow(
      'empty-name.yaml: Skill schema validation failed:'
    );
  });

  it('throws on schema violation — invalid operation', () => {
    const yaml = `
name: bad-ops
scope:
  data_products:
    - dp_1
permissions:
  data_products:
    - read
    - execute
`;
    expect(() => parseSkillYaml(yaml)).toThrow('Skill schema validation failed:');
  });

  it('throws on non-object YAML content', () => {
    expect(() => parseSkillYaml('just a string')).toThrow('Skill schema validation failed:');
  });

  it('includes filename in error message when provided', () => {
    const yaml = `name: 123\nscope: {}\npermissions: {}`;
    // name must be a string — 123 may or may not pass depending on yaml parser coercion
    // Let's use a truly invalid case
    const badYaml = `scope: not_an_object`;
    expect(() => parseSkillYaml(badYaml, 'my-skill.yaml')).toThrow('my-skill.yaml:');
  });
});

describe('loadSkillFromFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-loader-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads and parses a valid skill file', () => {
    const filePath = path.join(tmpDir, 'analytics.yaml');
    fs.writeFileSync(filePath, `
name: analytics
scope:
  data_products:
    - dp_orders
permissions:
  data_products:
    - read
`);
    const skill = loadSkillFromFile(filePath);
    expect(skill.name).toBe('analytics');
    expect(skill.scope.data_products).toEqual(['dp_orders']);
  });

  it('throws when file does not exist', () => {
    expect(() => loadSkillFromFile('/nonexistent/path.yaml')).toThrow();
  });
});

describe('loadSkillsFromDirectory', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-dir-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty map for non-existent directory', () => {
    const result = loadSkillsFromDirectory('/nonexistent/dir');
    expect(result.size).toBe(0);
  });

  it('returns empty map for directory with no yaml files', () => {
    fs.writeFileSync(path.join(tmpDir, 'readme.txt'), 'not a skill');
    const result = loadSkillsFromDirectory(tmpDir);
    expect(result.size).toBe(0);
  });

  it('loads all yaml files from directory', () => {
    fs.writeFileSync(path.join(tmpDir, 'analytics.yaml'), `
name: analytics
scope:
  data_products:
    - dp_orders
permissions:
  data_products:
    - read
`);
    fs.writeFileSync(path.join(tmpDir, 'admin.yml'), `
name: admin
scope:
  workflows:
    - wf_sync
permissions:
  workflows:
    - read
    - write
    - create
    - delete
`);
    const result = loadSkillsFromDirectory(tmpDir);
    expect(result.size).toBe(2);
    expect(result.get('analytics')).toBeDefined();
    expect(result.get('admin')).toBeDefined();
    expect(result.get('analytics')!.scope.data_products).toEqual(['dp_orders']);
    expect(result.get('admin')!.permissions.workflows).toEqual(['read', 'write', 'create', 'delete']);
  });

  it('skips non-yaml files', () => {
    fs.writeFileSync(path.join(tmpDir, 'notes.md'), '# notes');
    fs.writeFileSync(path.join(tmpDir, 'skill.yaml'), `
name: only-one
scope: {}
permissions: {}
`);
    const result = loadSkillsFromDirectory(tmpDir);
    expect(result.size).toBe(1);
    expect(result.has('only-one')).toBe(true);
  });

  it('throws on invalid yaml file in directory', () => {
    fs.writeFileSync(path.join(tmpDir, 'bad.yaml'), 'not: valid: yaml: at: all:');
    expect(() => loadSkillsFromDirectory(tmpDir)).toThrow();
  });
});
