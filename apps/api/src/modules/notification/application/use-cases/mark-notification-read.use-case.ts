import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { utcNow } from '../../../../shared/time/time';
import {
  NOTIFICATION_INBOX_REPOSITORY,
  type INotificationInboxRepository,
} from '../../domain/ports/notification-inbox-repository.port';

/** Ownership is enforced as an UPDATE predicate inside the repository. */
@Injectable()
export class MarkNotificationReadUseCase {
  constructor(
    @Inject(NOTIFICATION_INBOX_REPOSITORY) private readonly inbox: INotificationInboxRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, userId: string, id: string): Promise<void> {
    const ok = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.inbox.markRead(tx, userId, id, utcNow()),
    );
    if (!ok) throw new NotFoundException('Không tìm thấy thông báo.');
  }
}
