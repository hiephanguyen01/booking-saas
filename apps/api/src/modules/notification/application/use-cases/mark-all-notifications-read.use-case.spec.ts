import { describe, expect, it } from 'vitest';
import type { NotificationArea } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { INotificationInboxRepository } from '../../domain/ports/notification-inbox-repository.port';
import { MarkAllNotificationsReadUseCase } from './mark-all-notifications-read.use-case';

describe('MarkAllNotificationsReadUseCase', () => {
  it("clears only the caller's own rows, and only in the area they are looking at", async () => {
    // A partner clearing their bell must not mark their tenant-side
    // notifications read as well.
    const marks: Array<{ userId: string; area: string; at: Date }> = [];
    const tenantDb = fakeTenantDb();
    const useCase = new MarkAllNotificationsReadUseCase(
      fakePort<INotificationInboxRepository>({
        markAllRead: (_tx, userId, area, at) => {
          marks.push({ userId, area, at });
          return Promise.resolve();
        },
      }),
      tenantDb.service,
    );
    const before = Date.now();

    await useCase.execute('tenant-1', 'user-1', 'partner' as NotificationArea);

    expect(tenantDb.openedFor).toEqual(['tenant-1']);
    expect(marks[0]).toMatchObject({ userId: 'user-1', area: 'partner' });
    expect(marks[0]?.at.getTime()).toBeGreaterThanOrEqual(before);
  });
});
