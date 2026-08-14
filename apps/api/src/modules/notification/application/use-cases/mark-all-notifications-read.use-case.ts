import { Inject, Injectable } from '@nestjs/common';
import type { NotificationArea } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { utcNow } from '../../../../shared/time/time';
import {
  NOTIFICATION_INBOX_REPOSITORY,
  type INotificationInboxRepository,
} from '../../domain/ports/notification-inbox-repository.port';

@Injectable()
export class MarkAllNotificationsReadUseCase {
  constructor(
    @Inject(NOTIFICATION_INBOX_REPOSITORY) private readonly inbox: INotificationInboxRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, userId: string, area: NotificationArea): Promise<void> {
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.inbox.markAllRead(tx, userId, area, utcNow()),
    );
  }
}
