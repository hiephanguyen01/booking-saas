import { Injectable } from '@nestjs/common';
import type { Locale } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { RecordLegalAcceptanceUseCase } from './record-legal-acceptance.use-case';

export interface RecordRegistrationConsentPayload {
  userId: string;
  acceptedVersionIds: readonly string[];
  acceptedLocale: Locale;
  ip?: string | null;
}

/**
 * The `user.registration_consent` outbox handler target (D5). `identity-access`
 * cannot call `RecordLegalAcceptanceUseCase` directly — `identity-access` sits
 * below `legal` in the module graph, and `legal` already depends on
 * `identity-access`'s guards, so a direct call would be the cycle the outbox
 * exists to avoid. The event is the sanctioned crossing.
 *
 * Must tolerate redelivery: the outbox relay is at-least-once
 * (`outbox-relay.worker.ts` `MAX_ATTEMPTS = 20`) and a duplicate acceptance row
 * is acceptable per D9 — this does not attempt de-duplication itself.
 */
@Injectable()
export class RecordRegistrationConsentUseCase {
  constructor(
    private readonly recordLegalAcceptance: RecordLegalAcceptanceUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, payload: RecordRegistrationConsentPayload): Promise<void> {
    await this.tenantDb.forTenant(tenantId, (tx) =>
      this.recordLegalAcceptance.execute(tx, {
        tenantId,
        userId: payload.userId,
        partnerId: null,
        acceptedVersionIds: payload.acceptedVersionIds,
        acceptedLocale: payload.acceptedLocale,
        ip: payload.ip ?? null,
      }),
    );
  }
}
