import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SessionRefreshLockTimeoutError,
  withDistributedRefreshLock,
  type RefreshLockOptions,
  type RefreshLockStore,
} from './refresh-lock.server.ts';

function deterministicTiming(overrides: RefreshLockOptions = {}): RefreshLockOptions {
  let currentTime = 0;
  return {
    ttlMs: 100,
    retryMs: 10,
    waitMs: 30,
    now: () => currentTime,
    delay: async (milliseconds) => {
      currentTime += milliseconds;
    },
    valueFactory: () => 'lock-owner',
    ...overrides,
  };
}

test('executes the callback and releases the lock owned by the request', async () => {
  let released: { key: string; value: string } | null = null;
  const store: RefreshLockStore = {
    async setIfAbsent(key, value, ttlMs) {
      assert.equal(key, 'bookify:storefront:session-refresh-lock:session-1');
      assert.equal(value, 'lock-owner');
      assert.equal(ttlMs, 100);
      return true;
    },
    async deleteIfValue(key, value) {
      released = { key, value };
    },
  };

  const result = await withDistributedRefreshLock(
    store,
    'session-1',
    async () => 'refreshed',
    undefined,
    deterministicTiming(),
  );

  assert.equal(result, 'refreshed');
  assert.deepEqual(released, {
    key: 'bookify:storefront:session-refresh-lock:session-1',
    value: 'lock-owner',
  });
});

test('returns an observed rotated session without serially acquiring the lock', async () => {
  let attempts = 0;
  let observations = 0;
  let callbackCalls = 0;
  let releaseCalls = 0;
  const store: RefreshLockStore = {
    async setIfAbsent() {
      attempts += 1;
      return false;
    },
    async deleteIfValue() {
      releaseCalls += 1;
    },
  };

  const result = await withDistributedRefreshLock(
    store,
    'session-2',
    async () => {
      callbackCalls += 1;
      return 'callback';
    },
    async () => {
      observations += 1;
      return observations === 1
        ? { resolved: false }
        : { resolved: true, value: 'rotated-session' };
    },
    deterministicTiming(),
  );

  assert.equal(result, 'rotated-session');
  assert.equal(attempts, 2);
  assert.equal(callbackCalls, 0);
  assert.equal(releaseCalls, 0);
});

test('takes over refresh work when the previous holder releases without rotating', async () => {
  const acquisitionResults = [false, true];
  let callbackCalls = 0;
  let releaseCalls = 0;
  const store: RefreshLockStore = {
    async setIfAbsent() {
      return acquisitionResults.shift() ?? false;
    },
    async deleteIfValue() {
      releaseCalls += 1;
    },
  };

  const result = await withDistributedRefreshLock(
    store,
    'session-3',
    async () => {
      callbackCalls += 1;
      return 'takeover';
    },
    async () => ({ resolved: false }),
    deterministicTiming(),
  );

  assert.equal(result, 'takeover');
  assert.equal(callbackCalls, 1);
  assert.equal(releaseCalls, 1);
});

test('accepts a rotated session observed at the wait deadline', async () => {
  let currentTime = 0;
  let callbackCalls = 0;
  const store: RefreshLockStore = {
    async setIfAbsent() {
      return false;
    },
    async deleteIfValue() {
      throw new Error('must not release an unowned lock');
    },
  };

  const result = await withDistributedRefreshLock(
    store,
    'session-4',
    async () => {
      callbackCalls += 1;
      return 'never';
    },
    async () =>
      currentTime >= 25
        ? { resolved: true, value: 'rotated-at-deadline' }
        : { resolved: false },
    {
      ttlMs: 20,
      retryMs: 5,
      now: () => currentTime,
      delay: async (milliseconds) => {
        currentTime += milliseconds;
      },
      valueFactory: () => 'lock-owner',
    },
  );

  assert.equal(result, 'rotated-at-deadline');
  assert.equal(callbackCalls, 0);
});

test('reports timeout when the lock remains held and the session never rotates', async () => {
  const store: RefreshLockStore = {
    async setIfAbsent() {
      return false;
    },
    async deleteIfValue() {
      throw new Error('must not release an unowned lock');
    },
  };

  await assert.rejects(
    () =>
      withDistributedRefreshLock(
        store,
        'session-5',
        async () => 'never',
        async () => ({ resolved: false }),
        deterministicTiming({ ttlMs: 20, retryMs: 5, waitMs: undefined }),
      ),
    SessionRefreshLockTimeoutError,
  );
});
