import { describe, expect, it, vi } from 'vitest';
import { ClientError } from 'graphql-request';
import { HydrawiseAPIError, HydrawiseAuthError, HydrawiseMutationError } from '../../src/errors.js';

vi.mock('graphql-request', async () => {
  const actual = (await vi.importActual<object>('graphql-request')) as Record<string, unknown>;
  return {
    ...actual,
    GraphQLClient: vi.fn(),
  };
});

const { GraphQLClient } = await import('graphql-request');
type AuthLike = import('../../src/hydrawise/auth.js').Auth;
const { resetClientForTesting, getClient } = await import('../../src/hydrawise/client.js');

function makeAuthStub(): AuthLike {
  return {
    getAuthHeader: async () => 'Bearer XYZ',
  } as unknown as AuthLike;
}

// client.ts does `new GraphQLClient(...)`, so the mock implementation MUST be
// constructable. An arrow function is not: vitest 4 tightened this and throws
// "... is not a constructor" (vitest 3 tolerated it). A plain `function` works
// under both — `new F()` returns F's returned object. Do not convert this back
// to an arrow function.
function mockGraphQLClient(request: () => Promise<unknown>): void {
  (GraphQLClient as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(
    function () {
      return { request };
    },
  );
}

describe('GraphQLHydrawiseClient', () => {
  it('raises HydrawiseMutationError when status is ERROR', async () => {
    resetClientForTesting();
    mockGraphQLClient(async () => ({
      startZone: { status: 'ERROR', summary: 'Zone is already running' },
    }));
    const client = getClient(makeAuthStub());
    await expect(
      client.mutate(
        'mutation StartZone { startZone(zoneId: 1) { status summary } }',
        { zoneId: 1 },
        (data) => data.startZone as { status: 'OK' | 'WARNING' | 'ERROR'; summary: string },
      ),
    ).rejects.toThrowError(HydrawiseMutationError);
  });

  it('maps a 401 ClientError to HydrawiseAuthError', async () => {
    resetClientForTesting();
    const err = new ClientError(
      { status: 401, headers: new Headers(), errors: [], data: undefined } as unknown as ConstructorParameters<typeof ClientError>[0],
      { query: 'q' },
    );
    mockGraphQLClient(async () => {
      throw err;
    });
    const client = getClient(makeAuthStub());
    await expect(client.query('query { me { id } }')).rejects.toThrowError(HydrawiseAuthError);
  });

  it('maps a generic ClientError to HydrawiseAPIError', async () => {
    resetClientForTesting();
    const err = new ClientError(
      {
        status: 500,
        headers: new Headers(),
        errors: [{ message: 'boom' }],
        data: undefined,
      } as unknown as ConstructorParameters<typeof ClientError>[0],
      { query: 'q' },
    );
    mockGraphQLClient(async () => {
      throw err;
    });
    const client = getClient(makeAuthStub());
    await expect(client.query('query { me { id } }')).rejects.toThrowError(HydrawiseAPIError);
  });
});
