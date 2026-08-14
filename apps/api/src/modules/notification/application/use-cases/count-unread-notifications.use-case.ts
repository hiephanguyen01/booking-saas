import { Inject, Injectable } from '@nestjs/common';
import type { NotificationArea } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  NOTIFICATION_INBOX_REPOSITORY,
  type INotificationInboxRepository,
} from '../../domain/ports/notification-inbox-repository.port';

/** The 60s poll. Hits the partial index only — never pages a feed. */
@Injectable()
export class CountUnreadNotificationsUseCase {
  constructor(
    @Inject(NOTIFICATION_INBOX_REPOSITORY) private readonly inbox: INotificationInboxRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, userId: string, area: NotificationArea): Promise<number> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.inbox.countUnread(tx, userId, area));
  }
}
