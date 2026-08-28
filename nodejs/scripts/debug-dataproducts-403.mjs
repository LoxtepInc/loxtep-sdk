#!/usr/bin/env node
/**
 * One-shot: reproduce data-products 403 with URL/status/body (no tokens logged).
 * Usage: node scripts/debug-dataproducts-403.mjs [workdir]
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const workdir = resolve(process.argv[2] ?? process.cwd());
process.chdir(workdir);

const require = createRequire(import.meta.url);
const root = resolve(new URL('..', import.meta.url).pathname);

const { createCliClient } = await import(
  pathToFileURL(resolve(root, 'dist/cli/create-cli-client.js')).href
);
const { buildPlatformRequestUrl } = await import(
  pathToFileURL(resolve(root, 'dist/config/platform-request-url.js')).href
);

const calls = [];

const fetch_fn = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  const method = init.method ?? 'GET';
  const res = await globalThis.fetch(input, init);
  const text = await res.clone().text();
  const hdr = (name) => res.headers.get(name);
  calls.push({
    method,
    url,
    status: res.status,
    statusText: res.statusText,
    request_id: hdr('x-request-id') ?? hdr('x-amzn-requestid') ?? null,
    apigw_error: hdr('x-amzn-errortype') ?? null,
    content_type: hdr('content-type'),
    body_preview: text.slice(0, 800),
  });
  return res;
};

const created = await createCliClient({ cwd: workdir, fetch_fn });
if (!created) {
  console.error('FAIL: no client (login / api_url)');
  process.exit(2);
}

const { client, config } = created;
console.log(
  JSON.stringify(
    {
      workdir,
      client_api_url: client.api_url,
      organization_id: config.organization_id ?? client.organization_id ?? null,
      project_id: config.project_id ?? client.project_id ?? null,
      instance_id: config.instance_id ?? client.instance_id ?? null,
      expected_dataproducts_url: buildPlatformRequestUrl(client.api_url, '/dataproducts'),
    },
    null,
    2
  )
);

const probes = [
  ['whoami', () => client.session.get_current_user()],
  ['projects.list', () => client.workspace.projects.list({ page_size: 1 })],
  ['data_products.list', () => client.build.data_products.list({ page_size: 1 })],
  ['connectors.list', () => client.connect.connectors.list({ page_size: 1 })],
  ['domains.list', () => client.define.domains.list({ page_size: 1 })],
  ['workflows.list', () =>
    client.build.workflows.list({
      project_id: config.project_id ?? client.project_id,
      page_size: 1,
    }),
  ],
];

const results = [];
for (const [name, fn] of probes) {
  const before = calls.length;
  try {
    await fn();
    results.push({ name, ok: true, calls: calls.slice(before) });
  } catch (err) {
    results.push({
      name,
      ok: false,
      error_name: err?.name ?? 'Error',
      error_message: err?.message ?? String(err),
      status_code: err?.status_code ?? err?.status ?? null,
      details: err?.details ?? null,
      calls: calls.slice(before),
    });
  }
}

console.log(JSON.stringify({ results }, null, 2));
process.exit(results.some((r) => !r.ok) ? 1 : 0);
