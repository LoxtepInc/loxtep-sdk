/**
 * CLI: loxtep standards list | standards get <id>
 * Standards = policies (backend). Uses SDK standards surface (GET /governance/standards).
 */

import { requireCliClient } from '../create-cli-client.js';

export interface StandardsCmdOptions {
  configFilePath?: string;
  credentialsPath?: string;
  customerMcpPath?: string;
}

export async function runStandardsList(options: StandardsCmdOptions = {}): Promise<void> {
  const { client } = await requireCliClient(options);
  try {
    const result = await client.define.standards.list();
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

export async function runStandardsGet(
  standardId: string,
  options: StandardsCmdOptions = {}
): Promise<void> {
  const { client } = await requireCliClient(options);
  try {
    const standard = await client.define.standards.get(standardId);
    console.log(JSON.stringify(standard, null, 2));
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}
