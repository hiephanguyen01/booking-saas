import { describe, expect, it } from 'vitest';
import type { NotificationArea } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { INotificationInboxRepository } from '../../domain/ports/notification-inbox-repository.port';
import { CountUnreadNotificationsUseCase } from './count-unread-notifications.use-case';

describe('CountUnreadNotificationsUseCase', () => {
  it('counts the caller’s unread rows in one area', async () => {
    // The bell badge is per area, so a cross-area count would show a partner a
    // number they cannot reach from that screen.
    const seen: Array<{ userId: string; area: string }> = [];
    const tenantDb = fakeTenantDb();
    const useCase = new CountUnreadNotificationsUseCase(
      fakePort<INotificationInboxRepository>({
        countUnread: (_tx, userId, area) => {
          seen.push({ userId, area });
          return Promise.resolve(7);
        },
      }),
      tenantDb.service,
    );

    await expect(
      useCase.execute('tenant-1', 'user-1', 'tenant' as NotificationArea),
    ).resolves.toBe(7);
    expect(tenantDb.openedFor).toEqual(['tenant-1']);
    expect(seen).toEqual([{ userId: 'user-1', area: 'tenant' }]);
  });
});
