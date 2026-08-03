/**
 * CLI command handlers set `process.exitCode` on error paths. Under Jest's worker
 * model that sticky value becomes the worker's process exit status, so the suite
 * can report all tests passed and still fail the job with ELIFECYCLE.
 */
afterEach(() => {
  process.exitCode = undefined;
});
