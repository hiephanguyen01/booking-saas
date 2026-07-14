import { describe, expect, it } from 'vitest';
import { createMemoryDashboardSessionStore } from './session-store.server';
import {
  createDashboardSessionService,
  readSessionSecrets,
  type DashboardSessionData,
} from './session.server';

const data: DashboardSessionData = {
  accessToken: 'secret-access-token',
  refreshToken: 'secret-refresh-token',
  userId: 'user-1',
};

describe('Dashboard session cookie', () => {
  it('contains only an opaque id while tokens stay in server storage', async () => {
    const store = createMemoryDashboardSessionStore();
    const service = createDashboardSessionService({
      store,
      secrets: ['a'.repeat(32)],
      secure: false,
      idFactory: () => 'opaque-session-id',
    });

    const setCookie = await service.create(data);

    expect(setCookie).toContain('__dashboard_session=');
    expect(setCookie).not.toContain(data.accessToken);
    expect(setCookie).not.toContain(data.refreshToken);

    const cookieHeader = setCookie.split(';', 1)[0] ?? '';
    await expect(
      service.read(new Request('http://dashboard.test/', { headers: { Cookie: cookieHeader } })),
    ).resolves.toEqual({ id: 'opaque-session-id', data });
  });

  it('rotates the server record without changing the opaque browser id', async () => {
    const store = createMemoryDashboardSessionStore();
    const service = createDashboardSessionService({
      store,
      secrets: ['b'.repeat(32)],
      secure: false,
      idFactory: () => 'stable-session-id',
    });
    const setCookie = await service.create(data);
    const cookieHeader = setCookie.split(';', 1)[0] ?? '';
    const request = new Request('http://dashboard.test/', { headers: { Cookie: cookieHeader } });

    await service.rotate('stable-session-id', {
      ...data,
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });

    await expect(service.read(request)).resolves.toEqual({
      id: 'stable-session-id',
      data: {
        ...data,
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      },
    });
  });

  it('deletes the server record and expires the browser cookie', async () => {
    const store = createMemoryDashboardSessionStore();
    const service = createDashboardSessionService({
      store,
      secrets: ['c'.repeat(32)],
      secure: false,
      idFactory: () => 'deleted-session-id',
    });
    const setCookie = await service.create(data);
    const cookieHeader = setCookie.split(';', 1)[0] ?? '';
    const request = new Request('http://dashboard.test/', { headers: { Cookie: cookieHeader } });

    const expiredCookie = await service.destroy(request);

    expect(expiredCookie).toMatch(/Max-Age=0/i);
    await expect(service.read(request)).resolves.toBeNull();
  });
});

describe('readSessionSecrets', () => {
  it('fails closed when the current secret is missing or too short', () => {
    expect(() => readSessionSecrets({})).toThrow(/SESSION_SECRET_CURRENT/);
    expect(() => readSessionSecrets({ SESSION_SECRET_CURRENT: 'too-short' })).toThrow(
      /at least 32/,
    );
  });

  it('supports a previous secret during cookie-signing rotation', () => {
    expect(
      readSessionSecrets({
        SESSION_SECRET_CURRENT: 'x'.repeat(32),
        SESSION_SECRET_PREVIOUS: 'y'.repeat(32),
      }),
    ).toEqual(['x'.repeat(32), 'y'.repeat(32)]);
  });
});
