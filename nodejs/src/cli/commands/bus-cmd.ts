/**
 * Placeholder for future RBAC-gated bus session issuance (platform API).
 * Today: bus access = Loxtep `streams` config + AWS principal scoped to your instance stream stack.
 */

export async function runBusLogin(): Promise<void> {
  console.log(`Loxtep stream bus access is separate from REST JWT.

What works today
- Configure LoxtepClient with \`streams\` and your instance stream env (see docs/sdk-control-vs-data-plane.md).
- Use AWS credentials for the bus account (role/user) the stream data plane needs for Dynamo/Kinesis/S3.

What is planned (RBAC)
- Short-lived bus-scoped credentials issued only when org policy allows, same RBAC plane as HTTP APIs.
- This command will wrap that flow once POST …/bus/session (or STS exchange) ships.

Until then: operators grant stack access; application code never mixes long-lived IAM with end-user JWT.
`);
}
