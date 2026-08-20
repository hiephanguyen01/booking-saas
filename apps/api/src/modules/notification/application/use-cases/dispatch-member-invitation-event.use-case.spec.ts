import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import type { IEmailRenderer } from '../../domain/ports/email-renderer.port';
import type { IEmailSender } from '../../domain/ports/email-sender.port';
import type { INotificationLogRepository } from '../../domain/ports/notification-log-repository.port';
import type { INotificationReader } from '../../domain/ports/notification-reader.port';
import {
  DispatchMemberInvitationEventUseCase,
  type MemberInvitationPayload,
} from './dispatch-member-invitation-event.use-case';

const TENANT_ID = 'tenant-1';

interface Options {
  hostname?: string | null;
  partnerName?: string | null;
}

function harness(options: Options = {}) {
  const sent: Array<{ to: string }> = [];
  const rendered: Array<{ locale: string; data: Record<string, unknown> }> = [];
  const dedupeKeys: string[] = [];
  const logged: Array<Record<string, unknown>> = [];
  const tx = fakeTx({
    tenantDomain: {
      findFirst: () =>
        Promise.resolve(
          options.hostname === null ? null : { hostname: options.hostname ?? 'admin.studiohub.vn' },
        ),
    },
  });
  const tenantDb = fakeTenantDb({ tx });
  return {
    useCase: new DispatchMemberInvitationEventUseCase(
      fakePort<INotificationReader>({
        loadBrand: () => Promise.resolve({ name: 'StudioHub' } as never),
        loadPartnerContext: () =>
          Promise.resolve(
            options.partnerName === undefined
              ? null
              : ({ partnerName: options.partnerName } as never),
          ),
      }),
      fakePort<IEmailSender>({
        send: (m) => {
          sent.push(m as unknown as { to: string });
          return Promise.resolve();
        },
      }),
      fakePort<IEmailRenderer>({
        render: (_templateId, locale, _brand, data) => {
          rendered.push({ locale: locale ?? '', data: data as unknown as Record<string, unknown> });
          return Promise.resolve({ subject: 's', text: 't', html: '<p>t</p>' });
        },
      }),
      fakePort<INotificationLogRepository>({
        alreadySent: (k) => {
          dedupeKeys.push(k);
          return Promise.resolve(false);
        },
        record: (entry) => {
          logged.push(entry as unknown as Record<string, unknown>);
          return Promise.resolve();
        },
      }),
      tenantDb.service,
    ),
    sent,
    rendered,
    dedupeKeys,
    logged,
  };
}

const payload = (overrides: Partial<MemberInvitationPayload> = {}) =>
  ({
    invitationId: 'invitation-1',
    email: 'moi@studiohub.vn',
    token: 'clear-token',
    roleNames: ['Lễ tân', 'Kế toán'],
    ...overrides,
  }) as MemberInvitationPayload;

describe('DispatchMemberInvitationEventUseCase', () => {
  it('SKIPS the mail when the tenant has no verified dashboard domain', async () => {
    // The invite link would have nowhere to point, and a broken link is worse
    // than no mail.
    const { useCase, sent } = harness({ hostname: null });

    await useCase.execute(TENANT_ID, payload());

    expect(sent).toEqual([]);
  });

  it('builds the accept link on the tenant’s own console host', async () => {
    const { useCase, rendered } = harness();

    await useCase.execute(TENANT_ID, payload());

    expect(rendered[0]?.data).toMatchObject({
      ctaUrl: 'https://admin.studiohub.vn/invitations/clear-token',
    });
  });

  it('keeps the dev port on a .localhost console host', async () => {
    // Nothing proxies `.localhost` locally, so the port has to be put back.
    const { useCase, rendered } = harness({ hostname: 'admin.studiohub.localhost' });

    await useCase.execute(TENANT_ID, payload());

    expect(rendered[0]?.data.ctaUrl).toMatch(
      /^http:\/\/admin\.studiohub\.localhost:\d+\/invitations\/clear-token$/,
    );
  });

  it('lists the roles the invitee is being offered', async () => {
    const { useCase, rendered } = harness();

    await useCase.execute(TENANT_ID, payload());

    expect(rendered[0]?.data).toMatchObject({
      tenantName: 'StudioHub',
      recipientEmail: 'moi@studiohub.vn',
      roleNames: 'Lễ tân, Kế toán',
    });
  });

  it('names the PARTNER on a partner-scope invitation, and omits it otherwise', async () => {
    const partnerScope = harness({ partnerName: 'Studio Giang' });
    const tenantScope = harness();

    await partnerScope.useCase.execute(TENANT_ID, payload({ partnerId: 'partner-1' }));
    await tenantScope.useCase.execute(TENANT_ID, payload());

    expect(partnerScope.rendered[0]?.data).toMatchObject({ partnerName: 'Studio Giang' });
    // The key must be ABSENT, not present-and-undefined: the template branches on
    // whether it was supplied at all.
    expect(tenantScope.rendered[0]?.data).not.toHaveProperty('partnerName');
  });

  it('always renders in Vietnamese — the dashboard has no locale switcher', async () => {
    // And there is no account yet to carry a preferred locale.
    const { useCase, rendered } = harness();

    await useCase.execute(TENANT_ID, payload());

    expect(rendered[0]?.locale).toBe('vi');
  });

  it('logs the delivery with NO user id — the invitee has no account yet', async () => {
    const { useCase, logged } = harness();

    await useCase.execute(TENANT_ID, payload());

    expect(logged[0]).toMatchObject({ userId: null, recipient: 'moi@studiohub.vn' });
  });

  it('dedupes on the invitation and the invitee’s address', async () => {
    const { useCase, dedupeKeys } = harness();

    await useCase.execute(TENANT_ID, payload());

    expect(dedupeKeys).toEqual([
      'tenant.member_invited:invitation-1:tenant_member_invited:moi@studiohub.vn',
    ]);
  });
});
