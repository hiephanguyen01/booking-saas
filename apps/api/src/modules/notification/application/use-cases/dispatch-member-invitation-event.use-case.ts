import { Inject, Injectable, Logger } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import type { TemplateData } from '../../domain/email-template';
import {
  NotificationDelivery,
  OUTBOX_DELIVERY_POLICY,
} from '../../domain/entities/notification-delivery.entity';
import { EMAIL_SENDER, type IEmailSender } from '../../domain/ports/email-sender.port';
import { EMAIL_RENDERER, type IEmailRenderer } from '../../domain/ports/email-renderer.port';
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

/** The outbox payload `InviteTenantMemberUseCase` emits — see that file for the exact shape. */
export interface MemberInvitationPayload {
  invitationId: string;
  email: string;
  token: string;
  roleNames: string[];
  /** Set by `InvitePartnerMemberUseCase` (Task 5) for a partner-scoped invite; omitted for a tenant one. */
  partnerId?: string;
}

/**
 * `tenant.member_invited` → the invited email address (Task 9). The invitee may not
 * have an account yet, so there is no `NotificationRecipient` to resolve via
 * `INotificationReader` — the email/token/roles travel whole in the outbox payload
 * (Task 7). Only the tenant's display name is looked up here, through
 * `reader.loadBrand(tenantId)` — the same precedent `DispatchLegalDocumentEventUseCase`
 * uses to reach a tenant name without this module importing `identity-access`'s
 * `tenancy`-shaped concerns and closing a module cycle.
 *
 * When the payload carries a `partnerId` (Task 6), the partner's name is resolved the
 * same way `DispatchPartnerEventUseCase` does — `reader.loadPartnerContext(tx, partnerId)`
 * — again without importing `partner`. That name feeds `TemplateData.partnerName`, which
 * `ReactEmailRenderer` uses to pick the partner-flavoured subject line; a tenant invite
 * leaves it undefined and the mail is byte-identical to before.
 *
 * The CTA must land on the tenant's OWN console host: since the dashboard became host
 * multi-tenant, `/invitations/:token` (Task 14) resolves only on
 * `admin.<slug>.<domain>`, never on the platform host. `loadBrand`'s `dashboardUrl`
 * always falls back to the platform default when no domain is verified — exactly the
 * wrong behaviour for a CTA — so this reads `tenant_domains` directly (mirrors
 * `PrismaSessionInfoReader:30-36`) and skips the send entirely when no verified
 * `dashboard` domain exists, matching how `NotificationModule.requireTenantId` skips
 * an unroutable event instead of mailing a broken link.
 */
@Injectable()
export class DispatchMemberInvitationEventUseCase {
  private readonly logger = new Logger(DispatchMemberInvitationEventUseCase.name);

  constructor(
    @Inject(NOTIFICATION_READER) private readonly reader: INotificationReader,
    @Inject(EMAIL_SENDER) private readonly email: IEmailSender,
    @Inject(EMAIL_RENDERER) private readonly renderer: IEmailRenderer,
    @Inject(NOTIFICATION_LOG_REPOSITORY) private readonly logs: INotificationLogRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, payload: MemberInvitationPayload): Promise<void> {
    const brand = await this.reader.loadBrand(tenantId);

    const { domain, partnerName } = await this.tenantDb.forTenant(tenantId, async (tx) => {
      const domain = await tx.tenantDomain.findFirst({
        where: { tenantId, kind: 'dashboard', isPrimary: true, verifiedAt: { not: null } },
        select: { hostname: true },
      });
      const partnerContext = payload.partnerId
        ? await this.reader.loadPartnerContext(tx, payload.partnerId)
        : null;
      return { domain, partnerName: partnerContext?.partnerName };
    });
    if (!domain) {
      this.logger.warn(
        `skipping tenant.member_invited for invitation ${payload.invitationId}: ` +
          `tenant ${tenantId} has no verified dashboard domain`,
      );
      return;
    }

    const data: TemplateData = {
      tenantName: brand.name,
      recipientName: payload.email,
      recipientEmail: payload.email,
      roleNames: payload.roleNames.join(', '),
      ctaUrl: `${dashboardOrigin(domain.hostname)}/invitations/${payload.token}`,
      ...(partnerName ? { partnerName } : {}),
    };
    const delivery = NotificationDelivery.start({
      tenantId,
      // The invitee may not be a User row yet — nothing to key notification_logs.userId to.
      userId: null,
      recipientEmail: payload.email,
      eventType: 'tenant.member_invited',
      templateId: 'tenant_member_invited',
      dedupeKey: DedupeKey.forEvent(
        'tenant.member_invited',
        payload.invitationId,
        'tenant_member_invited',
        payload.email,
      ),
      bookingId: null,
      policy: OUTBOX_DELIVERY_POLICY,
    });
    // The dashboard has no locale switcher (AGENTS.md: "dashboard is Vietnamese-hardcoded"),
    // and there is no account yet to carry a preferred locale — always vi.
    await deliverNotification(
      { email: this.email, logs: this.logs, renderer: this.renderer },
      delivery,
      { locale: 'vi', brand, data },
    );
  }
}

/**
 * `admin.<slug>.<domain>` → absolute origin. Mirrors `PrismaNotificationReader`'s
 * private `tenantOrigin` (same directory — reused for `EmailBrand.dashboardUrl`, which
 * this use-case deliberately does NOT read, see the class doc) and the dashboard's own
 * `adminHostOrigin` (`apps/dashboard/app/lib/tenant-host.server.ts`): a `.localhost`
 * hostname is dev-only and needs the dashboard's port appended back since nothing
 * proxies it locally; anything else is a real domain served over TLS.
 */
function dashboardOrigin(hostname: string): string {
  if (hostname.endsWith('.localhost')) {
    return `http://${hostname}:${process.env.DASHBOARD_PORT ?? '5174'}`;
  }
  return `https://${hostname}`;
}
