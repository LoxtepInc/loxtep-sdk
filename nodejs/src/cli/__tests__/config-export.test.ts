/**
 * Unit tests for config export CLI command.
 *
 * Tests the pure formatting functions (formatSdkConfigAsShell, formatSdkConfigAsJson,
 * formatSdkConfigAsEnv) and the runConfigExportFromConnector function with mocked client.
 *
 * _Requirements: 5.1, 5.2, 5.3, 5.4_
 */

import { jest } from '@jest/globals';

const mockConnectorsGet = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockRequireCliClient = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../create-cli-client', () => ({
  requireCliClient: (...args: unknown[]) => mockRequireCliClient(...args),
}));

import {
  formatSdkConfigAsShell,
  formatSdkConfigAsJson,
  formatSdkConfigAsEnv,
  runConfigExportFromConnector,
  type SdkConfig,
} from '../commands/config-cmd';

beforeAll(() => {
  mockRequireCliClient.mockResolvedValue({
    client: {
      connect: {
        connectors: { get: (...args: unknown[]) => mockConnectorsGet(...args) },
      },
    },
    config: {},
  });
});

/* ------------------------------------------------------------------ */
/*  Test fixtures                                                     */
/* ------------------------------------------------------------------ */

const fullSdkConfig: SdkConfig = {
  api_url: 'https://api.loxtep.io',
  organization_id: 'org-123',
  project_id: 'proj-456',
  instance_id: 'inst-789',
  region: 'us-east-1',
};

const minimalSdkConfig: SdkConfig = {
  api_url: 'https://api.loxtep.io',
  organization_id: 'org-123',
};

const sdkConnector = {
  connector_id: 'conn-sdk-001',
  owner_user_id: 'user-1',
  organization_id: 'org-123',
  connector_type: 'sdk',
  metadata: {
    name: 'My SDK Connector',
    sdk_config: fullSdkConfig,
  },
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const stripeConnector = {
  connector_id: 'conn-stripe-001',
  owner_user_id: 'user-1',
  organization_id: 'org-123',
  connector_type: 'stripe',
  metadata: { name: 'Stripe Connector' },
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

/* ------------------------------------------------------------------ */
/*  Formatting function tests                                         */
/* ------------------------------------------------------------------ */

describe('formatSdkConfigAsShell', () => {
  it('outputs export VAR="value" lines for all fields', () => {
    const output = formatSdkConfigAsShell(fullSdkConfig);
    const lines = output.split('\n');

    expect(lines).toContain('export LOXTEP_API_URL="https://api.loxtep.io"');
    expect(lines).toContain('export LOXTEP_ORGANIZATION_ID="org-123"');
    expect(lines).toContain('export LOXTEP_PROJECT_ID="proj-456"');
    expect(lines).toContain('export LOXTEP_INSTANCE_ID="inst-789"');
    expect(lines).toContain('export LOXTEP_REGION="us-east-1"');
    expect(lines).toHaveLength(5);
  });

  it('omits optional fields when not present', () => {
    const output = formatSdkConfigAsShell(minimalSdkConfig);
    const lines = output.split('\n');

    expect(lines).toContain('export LOXTEP_API_URL="https://api.loxtep.io"');
    expect(lines).toContain('export LOXTEP_ORGANIZATION_ID="org-123"');
    expect(lines).toHaveLength(2);
    expect(output).not.toContain('LOXTEP_PROJECT_ID');
    expect(output).not.toContain('LOXTEP_INSTANCE_ID');
    expect(output).not.toContain('LOXTEP_REGION');
  });
});

describe('formatSdkConfigAsJson', () => {
  it('outputs valid JSON with all fields', () => {
    const output = formatSdkConfigAsJson(fullSdkConfig);
    const parsed = JSON.parse(output);

    expect(parsed).toEqual({
      api_url: 'https://api.loxtep.io',
      organization_id: 'org-123',
      project_id: 'proj-456',
      instance_id: 'inst-789',
      region: 'us-east-1',
    });
  });

  it('outputs valid JSON with only required fields', () => {
    const output = formatSdkConfigAsJson(minimalSdkConfig);
    const parsed = JSON.parse(output);

    expect(parsed).toEqual({
      api_url: 'https://api.loxtep.io',
      organization_id: 'org-123',
    });
    expect(parsed).not.toHaveProperty('project_id');
    expect(parsed).not.toHaveProperty('instance_id');
    expect(parsed).not.toHaveProperty('region');
  });
});

describe('formatSdkConfigAsEnv', () => {
  it('outputs VAR=value lines without export prefix', () => {
    const output = formatSdkConfigAsEnv(fullSdkConfig);
    const lines = output.split('\n');

    expect(lines).toContain('LOXTEP_API_URL=https://api.loxtep.io');
    expect(lines).toContain('LOXTEP_ORGANIZATION_ID=org-123');
    expect(lines).toContain('LOXTEP_PROJECT_ID=proj-456');
    expect(lines).toContain('LOXTEP_INSTANCE_ID=inst-789');
    expect(lines).toContain('LOXTEP_REGION=us-east-1');
    expect(lines).toHaveLength(5);
    // No line should start with "export"
    for (const line of lines) {
      expect(line).not.toMatch(/^export /);
    }
  });

  it('omits optional fields when not present', () => {
    const output = formatSdkConfigAsEnv(minimalSdkConfig);
    const lines = output.split('\n');

    expect(lines).toContain('LOXTEP_API_URL=https://api.loxtep.io');
    expect(lines).toContain('LOXTEP_ORGANIZATION_ID=org-123');
    expect(lines).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/*  runConfigExportFromConnector tests                                */
/* ------------------------------------------------------------------ */

describe('runConfigExportFromConnector', () => {
  let consoleSpy: ReturnType<typeof jest.spyOn>;
  let consoleErrorSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    jest.clearAllMocks();
    process.exitCode = undefined;
    consoleSpy = jest.spyOn(console, 'log').mockImplementation((() => {}) as (...args: unknown[]) => void);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((() => {}) as (...args: unknown[]) => void);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    process.exitCode = undefined;
  });

  it('outputs sh format (default) for an SDK connector', async () => {
    mockConnectorsGet.mockResolvedValue(sdkConnector);

    await runConfigExportFromConnector('conn-sdk-001');

    expect(mockConnectorsGet).toHaveBeenCalledWith('conn-sdk-001');
    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('export LOXTEP_API_URL="https://api.loxtep.io"');
    expect(output).toContain('export LOXTEP_ORGANIZATION_ID="org-123"');
    expect(output).toContain('export LOXTEP_PROJECT_ID="proj-456"');
    expect(output).toContain('export LOXTEP_INSTANCE_ID="inst-789"');
    expect(output).toContain('export LOXTEP_REGION="us-east-1"');
    expect(process.exitCode).toBeUndefined();
  });

  it('outputs json format for an SDK connector', async () => {
    mockConnectorsGet.mockResolvedValue(sdkConnector);

    await runConfigExportFromConnector('conn-sdk-001', { format: 'json' });

    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    const parsed = JSON.parse(output);
    expect(parsed).toEqual({
      api_url: 'https://api.loxtep.io',
      organization_id: 'org-123',
      project_id: 'proj-456',
      instance_id: 'inst-789',
      region: 'us-east-1',
    });
    expect(process.exitCode).toBeUndefined();
  });

  it('outputs env format for an SDK connector', async () => {
    mockConnectorsGet.mockResolvedValue(sdkConnector);

    await runConfigExportFromConnector('conn-sdk-001', { format: 'env' });

    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('LOXTEP_API_URL=https://api.loxtep.io');
    expect(output).toContain('LOXTEP_ORGANIZATION_ID=org-123');
    expect(output).not.toMatch(/^export /m);
    expect(process.exitCode).toBeUndefined();
  });

  it('errors when connector is not found', async () => {
    mockConnectorsGet.mockRejectedValue(new Error('Not found'));

    await runConfigExportFromConnector('conn-missing');

    expect(consoleErrorSpy).toHaveBeenCalled();
    const errorMsg = consoleErrorSpy.mock.calls[0][0] as string;
    expect(errorMsg).toContain("Connector 'conn-missing' not found");
    expect(process.exitCode).toBe(1);
  });

  it('errors when connector is not SDK type', async () => {
    mockConnectorsGet.mockResolvedValue(stripeConnector);

    await runConfigExportFromConnector('conn-stripe-001');

    expect(consoleErrorSpy).toHaveBeenCalled();
    const errorMsg = consoleErrorSpy.mock.calls[0][0] as string;
    expect(errorMsg).toContain("type 'stripe'");
    expect(errorMsg).toContain("not 'sdk'");
    expect(process.exitCode).toBe(1);
  });
});
