import { describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { fakePort, fakeTenantDb } from '~testing';
import type { INotificationInboxRepository } from '../../domain/ports/notification-inbox-repository.port';
import { MarkNotificationReadUseCase } from './mark-notification-read.use-case';

function harness(ok: boolean) {
  const marks: Array<{ userId: string; id: string; at: Date }> = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new MarkNotificationReadUseCase(
      fakePort<INotificationInboxRepository>({
        markRead: (_tx, userId, id, at) => {
          marks.push({ userId, id, at });
          return Promise.resolve(ok);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    marks,
  };
}

describe('MarkNotificationReadUseCase', () => {
  it("answers not-found when the row is not this user's", async () => {
    // The update is scoped by user id, so a false return means the row belongs
    // to someone else — the same answer as a row that does not exist, which
    // does not confirm it.
    const { useCase } = harness(false);

    await expect(
      useCase.execute('tenant-1', 'user-1', 'notification-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('stamps the read time on the caller’s own row', async () => {
    const { useCase, marks, tenantDb } = harness(true);
    const before = Date.now();

    await useCase.execute('tenant-1', 'user-1', 'notification-1');

    expect(tenantDb.openedFor).toEqual(['tenant-1']);
    expect(marks[0]).toMatchObject({ userId: 'user-1', id: 'notification-1' });
    expect(marks[0]?.at.getTime()).toBeGreaterThanOrEqual(before);
  });
});
