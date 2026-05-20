/**
 * CLI: loxtep metrics rate-limits | metrics log --id <id> --value <n>
 */

import { requireCliClient } from '../create-cli-client.js';

export interface MetricsCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
}

export async function runMetricsRateLimits(options: MetricsCmdOptions = {}): Promise<void> {
  const { client } = await requireCliClient(options);
  const rateLimit = await client.get_rate_limits();
  if (rateLimit == null) {
    console.log(
      JSON.stringify(
        {
          message:
            'No rate limit info available (call an API first or backend may not expose /rate-limits)',
        },
        null,
        2
      )
    );
    return;
  }
  console.log(JSON.stringify(rateLimit, null, 2));
}

export async function runMetricsLog(
  params: { id: string; value: number; tags?: Record<string, string> },
  options: MetricsCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  await client.metrics.log({ id: params.id, value: params.value, tags: params.tags });
  console.log(JSON.stringify({ ok: true, id: params.id, value: params.value }, null, 2));
}
