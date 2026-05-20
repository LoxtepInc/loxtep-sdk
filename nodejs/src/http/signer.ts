import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { HttpRequest } from '@smithy/protocol-http';
import type { AwsCredentialIdentity } from '@aws-sdk/types';

const SERVICE = 'execute-api';

export interface SignRequestParams {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body?: string;
  credentials: AwsCredentialIdentity;
  region: string;
}

/**
 * Sign an HTTP request with AWS SigV4 for API Gateway (execute-api).
 * Returns headers to use for fetch (including Authorization and x-amz-*).
 */
export async function signRequest(params: SignRequestParams): Promise<Record<string, string>> {
  const { method, url, headers, body, credentials, region } = params;

  const query: Record<string, string | string[]> = {};
  url.searchParams.forEach((value, key) => {
    if (query[key]) {
      const existing = query[key];
      query[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    } else {
      query[key] = value;
    }
  });

  const requestHeaders: Record<string, string> = {
    host: url.hostname,
    accept: 'application/json',
    ...headers,
  };
  if (body !== undefined) {
    requestHeaders['content-type'] = 'application/json';
  }

  const httpRequest = new HttpRequest({
    method,
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port ? Number(url.port) : undefined,
    path: url.pathname,
    query: Object.keys(query).length ? query : undefined,
    headers: requestHeaders,
    body,
  });

  const signer = new SignatureV4({
    credentials,
    region,
    service: SERVICE,
    sha256: Sha256,
    applyChecksum: false,
  });

  const signed = await signer.sign(httpRequest);

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(signed.headers)) {
    if (value != null) {
      out[key] = Array.isArray(value) ? value.join(', ') : String(value);
    }
  }
  return out;
}
