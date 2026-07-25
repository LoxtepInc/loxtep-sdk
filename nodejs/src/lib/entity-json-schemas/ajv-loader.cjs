'use strict';

/**
 * CJS Ajv loader — keeps Jest (ts-jest CJS) and Node ESM consumers happy.
 * Do not rename to .ts; require() of ajv must stay in CommonJS.
 *
 * This file is always required via a *relative* specifier from
 * `validate-entity.ts`/`.js` (its own sibling in the same directory, in both
 * `src/` and `dist/`), never located by searching `process.argv`/`process.cwd()`.
 * That means `require('ajv')` below resolves relative to *this file's own*
 * location — i.e. through `@loxtep/sdk`'s own `node_modules` — regardless of
 * whether the caller is the CLI or a consumer app importing the SDK as a
 * library, and regardless of package manager (works under pnpm's strict/
 * non-hoisted `node_modules` too, unlike a `require()` anchored at the
 * caller's `cwd`).
 */

const path = require('node:path');

const ajvModule = require('ajv');
const formatsModule = require('ajv-formats');

const Ajv = ajvModule.Ajv || ajvModule.default || ajvModule;
const addFormats =
  typeof formatsModule === 'function'
    ? formatsModule
    : formatsModule.default || formatsModule;

// This file always lives at <packageRoot>/(src|dist)/lib/entity-json-schemas/ajv-loader.cjs.
const packageRoot = path.resolve(__dirname, '..', '..', '..');

module.exports = { Ajv, addFormats, packageRoot };
