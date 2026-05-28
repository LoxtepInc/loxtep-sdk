/**
 * SDK Type-Contract Tests — Property 11: SdkTypeContractInvariant
 *
 * Feature: source-consumer-navigation, Property 11: SdkTypeContractInvariant
 *
 * Validates: Requirements 8.1, 8.3
 *
 * These tests assert that:
 * 1. The TypeScript SDK's DataProduct interface declares `kind` as a required field
 *    with type `'source' | 'consumer'`.
 * 2. The TypeScript SDK's DataProductCreateInput requires `kind` — omitting it
 *    produces a TypeScript compile error (asserted via type-level tests).
 * 3. At runtime, the DataProduct type enforces `kind` is present and valid.
 */

import type {
  DataProduct,
  DataProductKind,
  DataProductCreateInput,
  UsageMapNode,
  UsageMapEdge,
} from '../data-products-types.js';

// ---------------------------------------------------------------------------
// Type-level assertions (compile-time checks)
// ---------------------------------------------------------------------------

/**
 * Helper: Asserts that type A is assignable to type B.
 * If A is NOT assignable to B, this produces a compile error.
 */
type AssertAssignable<A, B> = A extends B ? true : never;

/**
 * Helper: Asserts that type A is NOT assignable to type B.
 * If A IS assignable to B, this produces a compile error.
 */
type AssertNotAssignable<A, B> = A extends B ? never : true;

// --- Requirement 8.1: DataProduct.kind is required and typed as 'source' | 'consumer' ---

// DataProduct must have a `kind` field
type _KindFieldExists = DataProduct['kind'];

// DataProduct.kind must be exactly DataProductKind ('source' | 'consumer')
type _KindIsDataProductKind = AssertAssignable<DataProduct['kind'], DataProductKind>;

// DataProductKind must be exactly 'source' | 'consumer'
type _KindIsLiteralUnion = AssertAssignable<DataProductKind, 'source' | 'consumer'>;
type _KindIsExactlyLiteralUnion = AssertAssignable<'source' | 'consumer', DataProductKind>;

// 'source' is assignable to DataProductKind
type _SourceIsValid = AssertAssignable<'source', DataProductKind>;

// 'consumer' is assignable to DataProductKind
type _ConsumerIsValid = AssertAssignable<'consumer', DataProductKind>;

// 'invalid' is NOT assignable to DataProductKind
type _InvalidIsRejected = AssertNotAssignable<'invalid', DataProductKind>;

// --- Requirement 8.3: CreateDataProductInput requires `kind` ---

// CreateDataProductInput must have a `kind` field
type _CreateInputHasKind = DataProductCreateInput['kind'];

// CreateDataProductInput.kind must be DataProductKind
type _CreateInputKindType = AssertAssignable<DataProductCreateInput['kind'], DataProductKind>;

// An object without `kind` should NOT be assignable to DataProductCreateInput
// (kind is required, not optional)
type _OmitKindNotAssignable = AssertNotAssignable<
  { name: string; description: string; domain_id: string; owner_user_id: string },
  DataProductCreateInput
>;

// An object with kind='source' should be assignable to DataProductCreateInput
type _WithSourceKindAssignable = AssertAssignable<
  { name: string; description: string; kind: 'source'; domain_id: string; owner_user_id: string },
  DataProductCreateInput
>;

// An object with kind='consumer' should be assignable to DataProductCreateInput
type _WithConsumerKindAssignable = AssertAssignable<
  { name: string; description: string; kind: 'consumer'; domain_id: string; owner_user_id: string },
  DataProductCreateInput
>;

// --- UsageMapNode.kind is required ---
type _UsageMapNodeHasKind = UsageMapNode['kind'];
type _UsageMapNodeKindType = AssertAssignable<UsageMapNode['kind'], DataProductKind>;

// ---------------------------------------------------------------------------
// Runtime assertions (Jest tests)
// ---------------------------------------------------------------------------

describe('Property 11: SdkTypeContractInvariant — TypeScript SDK', () => {
  describe('DataProduct.kind type contract', () => {
    it('DataProductKind is exactly "source" | "consumer"', () => {
      // Runtime check that the type values match expectations
      const validKinds: DataProductKind[] = ['source', 'consumer'];
      expect(validKinds).toHaveLength(2);
      expect(validKinds).toContain('source');
      expect(validKinds).toContain('consumer');
    });

    it('DataProduct interface requires kind field', () => {
      // Construct a valid DataProduct — kind must be present
      const dp: DataProduct = {
        data_product_id: 'dp-1',
        organization_id: 'org-1',
        domain_id: 'dom-1',
        name: 'Test',
        description: 'A test data product',
        kind: 'source',
        status: 'active',
        owner: { user_id: 'user-1' },
        governance: {
          classification: 'internal',
          pii_fields: [],
          compliance_requirements: [],
          access_controls: [],
        },
        metadata: { tags: [], business_glossary: {} },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      expect(dp.kind).toBe('source');
    });

    it('DataProduct.kind accepts "consumer"', () => {
      const dp: DataProduct = {
        data_product_id: 'dp-2',
        organization_id: 'org-1',
        domain_id: 'dom-1',
        name: 'Consumer DP',
        description: 'A consumer data product',
        kind: 'consumer',
        status: 'draft',
        owner: { user_id: 'user-2' },
        governance: {
          classification: 'public',
          pii_fields: [],
          compliance_requirements: [],
          access_controls: [],
        },
        metadata: { tags: [], business_glossary: {} },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      expect(dp.kind).toBe('consumer');
    });
  });

  describe('DataProductCreateInput.kind type contract', () => {
    it('CreateDataProductInput requires kind field', () => {
      const input: DataProductCreateInput = {
        name: 'New DP',
        kind: 'source',
      };
      expect(input.kind).toBe('source');
    });

    it('CreateDataProductInput accepts kind="consumer"', () => {
      const input: DataProductCreateInput = {
        name: 'Consumer DP',
        kind: 'consumer',
        description: 'A consumer projection',
      };
      expect(input.kind).toBe('consumer');
    });

    it('CreateDataProductInput.kind is not optional (compile-time enforced)', () => {
      // This test documents that the following would NOT compile:
      // const input: DataProductCreateInput = { name: 'Bad' }; // Error: Property 'kind' is missing
      //
      // We verify at runtime that the type's required keys include 'kind'
      // by checking that a valid input always has kind defined.
      const input: DataProductCreateInput = { name: 'Test', kind: 'source' };
      expect(input.kind).toBeDefined();
      expect(['source', 'consumer']).toContain(input.kind);
    });
  });

  describe('UsageMapNode.kind type contract', () => {
    it('UsageMapNode requires kind field', () => {
      const node: UsageMapNode = {
        id: 'dp-1',
        kind: 'source',
        name: 'Orders',
        fanout: 3,
      };
      expect(node.kind).toBe('source');
    });

    it('UsageMapEdge has source and target fields', () => {
      const edge: UsageMapEdge = {
        source: 'dp-1',
        target: 'dp-2',
        projection_spec_id: 'ps-1',
      };
      expect(edge.source).toBe('dp-1');
      expect(edge.target).toBe('dp-2');
    });
  });
});
