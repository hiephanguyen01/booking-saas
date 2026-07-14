import { dehydrate } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { makeQueryClient } from './query-client';

describe('makeQueryClient', () => {
  it('creates an isolated cache for every server request', () => {
    const first = makeQueryClient();
    const second = makeQueryClient();

    first.setQueryData(['tenant', 'a'], { id: 'a' });

    expect(first).not.toBe(second);
    expect(second.getQueryData(['tenant', 'a'])).toBeUndefined();
  });

  it('does not serialize queries explicitly marked as sensitive', () => {
    const client = makeQueryClient();
    client.setQueryData(['public'], { visible: true });
    client.setQueryDefaults(['private'], { meta: { dehydrate: false } });
    client.setQueryData(['private'], { token: 'secret' });

    const state = dehydrate(client, {
      shouldDehydrateQuery: (query) =>
        query.state.status === 'success' && query.meta?.dehydrate !== false,
    });

    expect(state.queries.map((query) => query.queryKey)).toEqual([['public']]);
  });
});
