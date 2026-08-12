/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      { useESM: false, tsconfig: { module: 'commonjs', moduleResolution: 'node', ignoreDeprecations: '6.0' } },
    ],
  },
  moduleNameMapper: {
    // Real leo-runtime.ts uses import.meta.url (ESM-only). Map to a CJS-safe
    // stub so suites that import the client graph never evaluate it under ts-jest.
    '[/\\\\]rstreams[/\\\\]leo-runtime(\\.js)?$':
      '<rootDir>/src/rstreams/leo-runtime.jest-stub.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Same reason as the mapper: keep import.meta out of ts-jest's CJS coverage
  // transform. No test executes the real module (mocked or stubbed).
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/rstreams/leo-runtime.ts',
    '!src/rstreams/leo-runtime.jest-stub.ts',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
};
