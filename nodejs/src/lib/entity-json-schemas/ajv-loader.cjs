'use strict';

/**
 * CJS Ajv loader — keeps Jest (ts-jest CJS) and Node ESM consumers happy.
 * Do not rename to .ts; require() of ajv must stay in CommonJS.
 */

const ajvModule = require('ajv');
const formatsModule = require('ajv-formats');

const Ajv = ajvModule.Ajv || ajvModule.default || ajvModule;
const addFormats =
  typeof formatsModule === 'function'
    ? formatsModule
    : formatsModule.default || formatsModule;

module.exports = { Ajv, addFormats };
