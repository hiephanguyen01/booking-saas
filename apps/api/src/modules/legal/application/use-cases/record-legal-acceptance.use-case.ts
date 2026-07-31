import { Inject, Injectable } from '@nestjs/common';
import type { LegalDocumentType, Locale } from '@booking/contracts';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import { TenantDbService, type PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../../tenancy/domain/ports/tenant-repository.port';
import { LegalConsentRequired, LegalVersionStale } from '../../domain/errors/legal-errors';
import { resolveLegalLocale } from '../../domain/locale-resolution';
import {
  AGREEMENT_ACCEPTANCE_REPOSITORY,
  type IAgreementAcceptanceRepository,
} from '../../domain/ports/agreement-acceptance-repository.port';
import {
  LEGAL_DOCUMENT_REPOSITORY,
  type ILegalDocumentRepository,
} from '../../domain/ports/legal-document-repository.port';

export interface RecordLegalAcceptanceArgs {
  tenantId: string;
  userId: string;
  partnerId?: string | null;
  acceptedVersionIds: readonly string[];
  /**
   * The locale the caller ASKED for (the storefront route's `:locale`, the
   * dashboard's UI locale). It is **not** what gets stored: each row records the
   * locale actually rendered for that version, resolved here by the same
   * `resolveLegalLocale` rule the public page uses. A batch of four versions can
   * legitimately resolve to different languages when the tenant has translated
   * some documents and not others, and "they agreed to v3 in English" is only
   * defensible if English is what was on screen.
   */
  requestedLocale: Locale;
  /**
   * Document types this submission MUST cover, resolved from the gate that is
   * calling (partner application → `partner_terms`, affiliate application →
   * `affiliate_terms`). Absent one, the submission is rejected with
   * `LegalConsentRequired` instead of silently writing whatever subset the
   * client happened to send. Omit for gates the design makes optional
   * (checkout's silent re-record).
   */
  requiredDocTypes?: readonly LegalDocumentType[];
  /**
   * Accept a still-published version that has since been superseded, instead of
   * rejecting it as stale.
   *
   * The `current_version_id` check is a **stale-tab guard for a synchronous
   * submit**: someone reads v3, the tenant publishes v4, and the submit must not
   * record consent to text the user never saw. Applied to a *replayed* write it
   * has the opposite effect — the ids were captured at a real consent moment
   * minutes earlier, so a publish in between makes the check fail permanently
   * and the evidence is destroyed rather than protected. Set only on such a
   * path (`user.registration_consent`, delivered by the at-least-once outbox
   * relay up to ~40 minutes after the tick); never on a live form submit.
   */
  acceptSupersededVersions?: boolean;
  ip?: string | null;
}

/**
 * The shared writer every consent surface (partner application, affiliate
 * application, checkout, registration, and the `me/legal` self-service accept
 * screen) calls.
 *
 * Every currently-planned module caller (partner/affiliate application,
 * checkout) already holds an **existing** `tx` from its own `forTenant` and
 * must pass it — the acceptance row commits atomically with the state change
 * it authorizes, and a `requiredDocTypes` rejection rolls that state change back
 * with it. `MeLegalController`'s `POST /me/legal/accept` is a standalone
 * business operation with no wrapping transaction of its own, and a controller
 * may not open one directly (`TenantDbService` is not on the controller
 * injection allow-list) — so `tx` is `null` there, and this use-case opens its
 * own `forTenant`, mirroring `SeedTenantLegalDraftsUseCase`'s optional-tx shape.
 */
@Injectable()
export class RecordLegalAcceptanceUseCase {
  constructor(
    @Inject(LEGAL_DOCUMENT_REPOSITORY) private readonly documents: ILegalDocumentRepository,
    @Inject(AGREEMENT_ACCEPTANCE_REPOSITORY) private readonly acceptances: IAgreementAcceptanceRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tx: PrismaTx | null, args: RecordLegalAcceptanceArgs): Promise<void> {
    if (tx) {
      await this.recordWithin(tx, args);
      return;
    }
    await this.tenantDb.forTenant(args.tenantId, (innerTx) => this.recordWithin(innerTx, args));
  }

  private async recordWithin(tx: PrismaTx, args: RecordLegalAcceptanceArgs): Promise<void> {
    // Resolved lazily: only a version that lacks the requested locale needs the
    // tenant's default, so the common case costs no extra query.
    let defaultLocale: Locale | null = null;
    const covered = new Set<LegalDocumentType>();

    for (const versionId of args.acceptedVersionIds) {
      const version = await this.documents.findVersionById(tx, versionId);
      if (!version || version.publishedAt === null) throw new LegalVersionStale();
      const doc = await this.documents.findByType(tx, args.tenantId, version.docType);
      if (!doc) throw new LegalVersionStale();
      // A stale tab must not produce a signature for text nobody saw — except
      // on a replayed write, where the version WAS what was on screen and only
      // the clock has moved (see `acceptSupersededVersions`).
      if (!args.acceptSupersededVersions && doc.currentVersionId !== versionId) {
        throw new LegalVersionStale();
      }

      const available = version.translations.map((t) => t.locale);
      if (!available.includes(args.requestedLocale)) {
        defaultLocale ??= await this.defaultLocaleOf(args.tenantId);
      }
      const rendered = resolveLegalLocale(
        args.requestedLocale,
        defaultLocale ?? args.requestedLocale,
        available,
      );

      await this.acceptances.record(tx, {
        tenantId: args.tenantId,
        userId: args.userId,
        partnerId: args.partnerId ?? null,
        agreementType: version.docType,
        documentVersionId: versionId,
        acceptedLocale: rendered.locale,
        version: String(version.versionNo),
        ip: args.ip ?? null,
      });
      covered.add(version.docType);
    }

    // The browser tick is a UX affordance, never the enforcement point: a
    // scripted or replayed request must not be able to create a partner with no
    // partner_terms signature. Checked after the writes so the rollback takes
    // the whole business operation with it.
    for (const required of args.requiredDocTypes ?? []) {
      if (!covered.has(required)) throw new LegalConsentRequired();
    }
  }

  private async defaultLocaleOf(tenantId: string): Promise<Locale> {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new TenantNotFound();
    return tenant.defaultLocale as Locale;
  }
}
