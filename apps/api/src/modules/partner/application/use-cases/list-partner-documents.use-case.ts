import type { PartnerDocumentReadItem } from '@booking/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { STORAGE_PORT, type StoragePort } from '../../../storage/domain/ports/storage.port';
import { PartnerNotFound } from '../../domain/errors/partner-errors';
import { collectPartnerDocumentReferences } from '../../domain/partner-document-business-info';
import {
  PARTNER_REPOSITORY,
  type IPartnerRepository,
} from '../../domain/ports/partner-repository.port';

export type PartnerDocumentViewer =
  | { actorType: 'partner'; actorId: string }
  | { actorType: 'tenant'; actorId: string };

@Injectable()
export class ListPartnerDocumentsUseCase {
  constructor(
    @Inject(PARTNER_REPOSITORY) private readonly partners: IPartnerRepository,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    partnerId: string,
    viewer: PartnerDocumentViewer,
  ): Promise<PartnerDocumentReadItem[]> {
    const references = await this.tenantDb.forTenant(tenantId, async (tx) => {
      const partner = await this.partners.findById(tx, partnerId);
      if (!partner) throw new PartnerNotFound();

      const refs = collectPartnerDocumentReferences(partner.businessInfo);
      await this.audit.write(tx, {
        tenantId,
        actorUserId: viewer.actorId,
        action:
          viewer.actorType === 'partner'
            ? 'partner.private_documents.self_view_requested'
            : 'partner.private_documents.view_requested',
        entityType: 'partner',
        entityId: partnerId,
        data: {
          partnerId,
          documentCount: refs.length,
          viewerType: viewer.actorType,
        },
      });
      return refs;
    });

    return Promise.all(
      references.map(async (reference): Promise<PartnerDocumentReadItem> => {
        if (reference.storage === 'legacy_public') return reference;
        const grant = await this.storage.createPrivatePresignedDownload({ key: reference.key });
        return {
          storage: 'private',
          kind: reference.kind,
          key: reference.key,
          downloadUrl: grant.downloadUrl,
          expiresInSec: grant.expiresInSec,
        };
      }),
    );
  }
}
