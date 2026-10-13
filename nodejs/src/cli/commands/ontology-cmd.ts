/**
 * CLI: loxtep ontology link-class
 *
 * Writes one tenant class assertion to an existing system-pack class URI.
 * Does not copy the system class and does not bulk-apply a review set.
 */

import type { LoxtepClient } from '../../client/loxtep-client.js';
import type { CliResult } from '../project-context.js';

function argValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const USAGE =
  'Usage: loxtep ontology link-class --source-uri <uri> --predicate-uri <uri> --target-uri <uri> [--description <text>] [--organization-id <id>]';

export async function runOntologyLinkClassCommand(
  client: LoxtepClient,
  args: string[]
): Promise<CliResult> {
  const source_uri = argValue(args, '--source-uri');
  const predicate_uri = argValue(args, '--predicate-uri');
  const target_uri = argValue(args, '--target-uri');
  const description = argValue(args, '--description');
  const organization_id = argValue(args, '--organization-id');
  if (!source_uri || !predicate_uri || !target_uri) {
    return { exitCode: 1, stdout: [], stderr: [USAGE] };
  }
  try {
    const result = await client.meaning.ontology.create_relationship({
      source_uri,
      predicate_uri,
      target_uri,
      ...(description ? { description } : {}),
      ...(organization_id ? { organization_id } : {}),
    });
    return { exitCode: 0, stdout: [JSON.stringify(result, null, 2)], stderr: [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, stdout: [], stderr: [message] };
  }
}
