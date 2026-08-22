import { describe, expect, it } from 'vitest';
import type { NotificationsQuery } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { INotificationInboxRepository } from '../../domain/ports/notification-inbox-repository.port';
import { ListNotificationsUseCase } from './list-notifications.use-case';

const PAGE = { items: [], total: 0 } as never;

describe('ListNotificationsUseCase', () => {
  it("lists only the CALLING user's bell rows, filtered by area", async () => {
    // RLS scopes the tenant, not the user; without the user id one member would
    // read another's notifications.
    const seen: unknown[] = [];
    const tenantDb = fakeTenantDb();
    const useCase = new ListNotificationsUseCase(
      fakePort<INotificationInboxRepository>({
        list: (_tx, args) => {
          seen.push(args);
          return Promise.resolve(PAGE);
        },
      }),
      tenantDb.service,
    );

    const result = await useCase.execute('tenant-1', 'user-1', {
      area: 'partner',
      page: 2,
      pageSize: 50,
    } as NotificationsQuery);

    expect(tenantDb.openedFor).toEqual(['tenant-1']);
    expect(seen).toEqual([{ userId: 'user-1', area: 'partner', page: 2, pageSize: 50 }]);
    expect(result).toBe(PAGE);
  });
});
