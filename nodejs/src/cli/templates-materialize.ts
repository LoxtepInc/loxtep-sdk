/**
 * Resolve and materialize bundled CLI templates (e.g. shopify-orders).
 *
 * Templates live at `<package-root>/templates/<slug>/` and are published with
 * the npm package (see package.json `files`).
 *
 * Package-root resolution uses a small CJS helper (`resolve-package-root.cjs`)
 * so Jest/ts-jest never has to parse `import.meta` in this file. Module-dir
 * for ESM comes from `esm-module-dir.ts` (Jest-mapped stub).
 */

import { createRequire } from 'node:module';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { esmModuleDir } from './esm-module-dir.js';

type RootHelper = { resolveSdkPackageRoot: () => string };

/**
 * Candidate paths for `resolve-package-root.cjs`.
 * Exported for unit tests (npm `.bin` shim / realpath coverage).
 */
export function rootHelperCandidates(input: {
  filename?: string;
  argv1?: string;
  cwd: string;
  moduleDir?: string;
}): string[] {
  const candidates: string[] = [];

  if (input.moduleDir) {
    candidates.push(join(input.moduleDir, 'resolve-package-root.cjs'));
  }

  // ts-jest CJS: __filename is this module under src/cli or dist/cli
  if (input.filename) {
    candidates.push(join(dirname(input.filename), 'resolve-package-root.cjs'));
  }

  if (input.argv1) {
    // npm/npx/pnpm `.bin` shims are often symlinks; resolve before dirname.
    try {
      candidates.push(join(dirname(realpathSync(input.argv1)), 'resolve-package-root.cjs'));
    } catch {
      // argv path missing or unreadable — keep looking
    }
    candidates.push(join(dirname(input.argv1), 'resolve-package-root.cjs'));
  }

  // Dev / test cwd = nodejs package root
  candidates.push(
    join(input.cwd, 'src/cli/resolve-package-root.cjs'),
    join(input.cwd, 'dist/cli/resolve-package-root.cjs'),
    join(input.cwd, 'nodejs/src/cli/resolve-package-root.cjs'),
    join(input.cwd, 'nodejs/dist/cli/resolve-package-root.cjs')
  );

  return candidates;
}

function loadRootHelper(): RootHelper {
  let moduleDir: string | undefined;
  try {
    moduleDir = esmModuleDir();
  } catch {
    // Stub/runtime without a usable module dir
  }

  const candidates = rootHelperCandidates({
    moduleDir,
    filename: typeof __filename !== 'undefined' ? __filename : undefined,
    argv1: typeof process !== 'undefined' ? process.argv[1] : undefined,
    cwd: process.cwd(),
  });

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const req = createRequire(candidate);
    return req(candidate) as RootHelper;
  }

  throw new Error(
    'Could not load resolve-package-root.cjs (bundled templates unavailable).'
  );
}

/** Package root for @loxtep/sdk (contains templates/, dist/, package.json). */
export function resolveSdkPackageRoot(): string {
  if (process.env.LOXTEP_SDK_PACKAGE_ROOT) {
    const root = process.env.LOXTEP_SDK_PACKAGE_ROOT;
    if (existsSync(join(root, 'templates')) && existsSync(join(root, 'package.json'))) {
      return root;
    }
  }
  return loadRootHelper().resolveSdkPackageRoot();
}

export function resolveBundledTemplateDir(slug: string, packageRoot?: string): string | null {
  const root = packageRoot ?? resolveSdkPackageRoot();
  const dir = join(root, 'templates', slug);
  return existsSync(dir) ? dir : null;
}

export interface MaterializeTemplateResult {
  written: string[];
  templateDir: string;
}

const SKIP_NAMES = new Set(['.DS_Store', 'node_modules']);

export async function materializeBundledTemplate(
  cwd: string,
  slug: string,
  options: { packageRoot?: string; overwrite?: boolean } = {}
): Promise<MaterializeTemplateResult | null> {
  const templateDir = resolveBundledTemplateDir(slug, options.packageRoot);
  if (!templateDir) return null;

  const written: string[] = [];
  const overwrite = options.overwrite ?? false;

  async function walk(srcDir: string, relBase: string): Promise<void> {
    const entries = await readdir(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP_NAMES.has(entry.name)) continue;
      if (relBase === '' && entry.name === 'skills') {
        const skillsSrc = join(srcDir, 'skills');
        const skillFiles = await readdir(skillsSrc);
        const destSkills = join(cwd, '.loxtep', 'skills');
        await mkdir(destSkills, { recursive: true });
        for (const skillFile of skillFiles) {
          if (!skillFile.endsWith('.yaml') && !skillFile.endsWith('.yml')) continue;
          const dest = join(destSkills, skillFile);
          if (!overwrite && existsSync(dest)) continue;
          await cp(join(skillsSrc, skillFile), dest);
          written.push(join('.loxtep', 'skills', skillFile));
        }
        continue;
      }

      const srcPath = join(srcDir, entry.name);
      const relPath = relBase ? join(relBase, entry.name) : entry.name;
      const destPath = join(cwd, relPath);

      if (entry.isDirectory()) {
        await mkdir(destPath, { recursive: true });
        await walk(srcPath, relPath);
        continue;
      }

      if (!overwrite && existsSync(destPath)) continue;
      await mkdir(dirname(destPath), { recursive: true });
      await cp(srcPath, destPath);
      written.push(relPath);
    }
  }

  await walk(templateDir, '');
  return { written, templateDir };
}

export async function ensureTemplatePackageJson(
  cwd: string,
  sdkVersionRange = '^0.9.16'
): Promise<string | null> {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) return null;

  const raw = await readFile(pkgPath, 'utf-8');
  const pkg = JSON.parse(raw) as {
    type?: string;
    engines?: Record<string, string>;
    dependencies?: Record<string, string>;
  };
  pkg.type = 'module';
  pkg.engines = { ...(pkg.engines ?? {}), node: '>=22' };
  pkg.dependencies = {
    ...(pkg.dependencies ?? {}),
    '@loxtep/sdk': pkg.dependencies?.['@loxtep/sdk'] ?? sdkVersionRange,
  };
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8');
  return 'package.json';
}

export async function listBundledTemplateSlugs(packageRoot?: string): Promise<string[]> {
  const root = join(packageRoot ?? resolveSdkPackageRoot(), 'templates');
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const slugs: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const st = await stat(join(root, e.name));
    if (st.isDirectory()) slugs.push(e.name);
  }
  return slugs.sort();
}

// Keep readFileSync available for future package.json probes without unused-import noise.
void readFileSync;
