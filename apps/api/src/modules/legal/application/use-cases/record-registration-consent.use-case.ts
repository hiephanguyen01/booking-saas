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
        // Requested locale; legal stores whichever rendering each version
        // actually resolved to. No `requiredDocTypes`: coverage is enforced at
        // the synchronous edge (the registration contract requires the tick when
        // a tenantId is present) because a throw here is a permanent handler
        // failure that only dead-letters the row.
        requestedLocale: payload.acceptedLocale,
        // The versions were current when the visitor ticked; this handler can
        // run up to ~40 minutes later (OTP + completion TTL) and is retried by
        // the relay. Re-applying the stale-tab check here could only throw
        // forever, burn 20 attempts and dead-letter the row — leaving a
        // registered user with no proof of consent to anything, silently. Record
        // what they actually read instead.
        acceptSupersededVersions: true,
        ip: payload.ip ?? null,
      }),
    );
  }
}
