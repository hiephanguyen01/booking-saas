import { Inject, Injectable } from '@nestjs/common';
import type { NotificationsQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import {
  NOTIFICATION_INBOX_REPOSITORY,
  type INotificationInboxRepository,
  type InboxRowRecord,
} from '../../domain/ports/notification-inbox-repository.port';

/** One page of the caller's own inbox for one area. */
@Injectable()
export class ListNotificationsUseCase {
  constructor(
    @Inject(NOTIFICATION_INBOX_REPOSITORY) private readonly inbox: INotificationInboxRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string, userId: string, query: NotificationsQuery,
  ): Promise<RepoPage<InboxRowRecord>> {
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.inbox.list(tx, {
        userId,
        area: query.area,
        page: query.page,
        pageSize: query.pageSize,
      }),
    );
  }
}
