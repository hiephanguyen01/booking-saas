import { Inject, Injectable } from '@nestjs/common';
import { LEGAL_DOCUMENT_SLUGS, type LegalDocumentType } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { normalizeLocale, type TemplateData } from '../../domain/email-template';
import {
  NotificationDelivery,
  OUTBOX_DELIVERY_POLICY,
} from '../../domain/entities/notification-delivery.entity';
import { planForLegalDocumentPublished } from '../../domain/notification-plan';
import { EMAIL_SENDER, type IEmailSender } from '../../domain/ports/email-sender.port';
import { EMAIL_RENDERER, type IEmailRenderer } from '../../domain/ports/email-renderer.port';
import {
  NOTIFICATION_INBOX_REPOSITORY,
  type INotificationInboxRepository,
} from '../../domain/ports/notification-inbox-repository.port';
import {
  NOTIFICATION_LOG_REPOSITORY,
  type INotificationLogRepository,
} from '../../domain/ports/notification-log-repository.port';
import {
  NOTIFICATION_READER,
  type INotificationReader,
} from '../../domain/ports/notification-reader.port';
import { DedupeKey } from '../../domain/value-objects/dedupe-key.value-object';
import { deliverNotification } from '../deliver-notification';
import { InboxCollector } from '../inbox-collector';

/** The outbox payload `PublishLegalDocumentUseCase` emits — see that file for the exact shape. */
export interface LegalDocumentPublishedPayload {
  docType: string;
  versionId: string;
  versionNo: number;
}

/**
 * `legal.document_published` → the tenant's active partners or affiliates (Task 20).
 * The event fires only for a *material* change (the publish use-case never emits it
 * otherwise), so every recipient here genuinely has a new re-acceptance bar to clear.
 * Audience routing lives in the pure `planForLegalDocumentPublished`:
 * `customer_terms`/`privacy_policy` resolve to an empty plan on purpose — a tenant can
 * have thousands of customers, and they are told at their next checkout instead.
 *
 * Deliberately imports nothing from `modules/legal`: `legal → identity-access →
 * notification` already exists in the module graph, so the reverse edge would close a
 * cycle (`pnpm check:module-cycles`). Everything this needs — `docType`, `versionId`,
 * `versionNo` — travels in the outbox payload; recipients are read directly off
 * `partners`/`partner_members`/`affiliates` (same style as the rest of this reader),
 * and the public document URL is built from `@booking/contracts`' `LEGAL_DOCUMENT_SLUGS`
 * — a framework-free shared contract, not the legal module itself.
 */
@Injectable()
export class DispatchLegalDocumentEventUseCase {
  constructor(
    @Inject(NOTIFICATION_READER) private readonly reader: INotificationReader,
    @Inject(EMAIL_SENDER) private readonly email: IEmailSender,
    @Inject(EMAIL_RENDERER) private readonly renderer: IEmailRenderer,
    @Inject(NOTIFICATION_LOG_REPOSITORY) private readonly logs: INotificationLogRepository,
    @Inject(NOTIFICATION_INBOX_REPOSITORY) private readonly inbox: INotificationInboxRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, payload: LegalDocumentPublishedPayload): Promise<void> {
    const plan = planForLegalDocumentPublished(payload.docType);
    if (plan.length === 0) return; // customer_terms / privacy_policy, or an unrecognised docType.

    const brand = await this.reader.loadBrand(tenantId);
    // Safe: a non-empty plan only ever comes from 'partner_terms' or 'affiliate_terms'
    // (see planForLegalDocumentPublished's switch), both keys of LEGAL_DOCUMENT_SLUGS.
    const slug = LEGAL_DOCUMENT_SLUGS[payload.docType as LegalDocumentType];

    const collector = new InboxCollector();
    for (const item of plan) {
      const recipients = await this.tenantDb.forTenant(tenantId, (tx) =>
        item.audience === 'affiliate'
          ? this.reader.loadActiveAffiliateRecipients(tx, tenantId)
          : this.reader.loadActivePartnerRecipients(tx, tenantId),
      );
      for (const recipient of recipients) {
        const data: TemplateData = {
          tenantName: brand.name,
          recipientName: recipient.name,
          legalVersionNo: payload.versionNo,
          ctaUrl: this.documentUrl(brand.storefrontUrl, recipient.locale, slug),
        };
        const delivery = NotificationDelivery.start({
          tenantId,
          userId: recipient.userId,
          recipientEmail: recipient.email,
          eventType: 'legal.document_published',
          templateId: item.templateId,
          // versionId (not docType) is the aggregate identity: each new material
          // version must reach every recipient again, even ones already mailed for a
          // prior version of the same document.
          dedupeKey: DedupeKey.forEvent(
            'legal.document_published',
            payload.versionId,
            item.templateId,
            recipient.userId,
          ),
          bookingId: null,
          policy: OUTBOX_DELIVERY_POLICY,
        });
        await deliverNotification(
          { email: this.email, logs: this.logs, renderer: this.renderer, inbox: collector },
          delivery,
          { locale: recipient.locale, brand, data },
        );
      }
    }
    if (!collector.isEmpty()) {
      await this.tenantDb.forTenant(tenantId, (tx) => this.inbox.insertMany(tx, collector.rows()));
    }
  }

  /** `{storefront}/{locale}/legal/{slug}` — the public document page. Never the body. */
  private documentUrl(storefrontUrl: string | undefined, locale: string, slug: string): string {
    const base = storefrontUrl ?? 'http://localhost:5173';
    return `${base}/${normalizeLocale(locale)}/legal/${slug}`;
  }
}
