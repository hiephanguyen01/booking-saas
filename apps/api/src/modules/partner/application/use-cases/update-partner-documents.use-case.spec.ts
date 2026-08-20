import { describe, expect, it } from 'vitest';
import type { UpdatePartnerDocumentsInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { PartnerState } from '../../domain/entities/partner.entity';
import { PartnerNotFound } from '../../domain/errors/partner-errors';
import type { IPartnerReader } from '../../domain/ports/partner-reader.port';
import type {
  IPartnerRepository,
  PartnerRecord,
} from '../../domain/ports/partner-repository.port';
import { UpdatePartnerDocumentsUseCase } from './update-partner-documents.use-case';

const PARTNER_ID = 'partner-1';

const state = (businessInfo: Record<string, unknown>): PartnerState =>
  ({ id: PARTNER_ID, tenantId: 'tenant-1', businessInfo }) as unknown as PartnerState;

interface Options {
  tenantId?: string | null;
  current?: PartnerState | null;
}

function harness(options: Options = {}) {
  const writes: unknown[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const tx = fakeTx({
    outboxEvent: {
      create: (args: { data: { eventType: string; payload: Record<string, unknown> } }) => {
        events.push({ eventType: args.data.eventType, payload: args.data.payload });
        return Promise.resolve({});
      },
    },
  });
  const tenantDb = fakeTenantDb({ tx });
  return {
    useCase: new UpdatePartnerDocumentsUseCase(
      fakePort<IPartnerReader>({
        tenantIdOfPartner: () =>
          Promise.resolve(options.tenantId === undefined ? 'tenant-1' : options.tenantId),
      }),
      fakePort<IPartnerRepository>({
        findStateById: () =>
          Promise.resolve(
            options.current === undefined
              ? state({ taxCode: '0312345678', logoUrl: 'https://cdn/old-logo.png' })
              : options.current,
          ),
        updateBusinessInfo: (_tx, id, intent) => {
          writes.push(intent);
          return Promise.resolve({ id, ...intent } as unknown as PartnerRecord);
        },
      }),
      tenantDb.service,
      new OutboxService(),
    ),
    writes,
    events,
  };
}

const input = (overrides: Partial<UpdatePartnerDocumentsInput> = {}) =>
  overrides as UpdatePartnerDocumentsInput;

describe('UpdatePartnerDocumentsUseCase', () => {
  it('answers not-found when the partner belongs to no tenant', async () => {
    const { useCase, writes } = harness({ tenantId: null });

    await expect(useCase.execute(PARTNER_ID, input({}))).rejects.toBeInstanceOf(PartnerNotFound);
    expect(writes).toEqual([]);
  });

  it('answers not-found when the row is gone by the time the tx opens', async () => {
    const { useCase, writes } = harness({ current: null });

    await expect(useCase.execute(PARTNER_ID, input({}))).rejects.toBeInstanceOf(PartnerNotFound);
    expect(writes).toEqual([]);
  });

  it('PRESERVES the existing tax and registration fields', async () => {
    // `businessInfo` is one jsonb column shared with the registration data; a
    // document upload must not blank the tax code.
    const { useCase, writes } = harness();

    await useCase.execute(PARTNER_ID, input({ logoUrl: 'https://cdn/new-logo.png' }));

    expect(writes).toEqual([
      {
        businessInfo: { taxCode: '0312345678', logoUrl: 'https://cdn/new-logo.png' },
      },
    ]);
  });

  it('leaves a key the request did not mention alone', async () => {
    const { useCase, writes } = harness();

    await useCase.execute(PARTNER_ID, input({ licenseDocs: ['https://cdn/gp.pdf'] }));

    expect(writes[0]).toMatchObject({
      businessInfo: {
        taxCode: '0312345678',
        logoUrl: 'https://cdn/old-logo.png',
        licenseDocs: ['https://cdn/gp.pdf'],
      },
    });
  });

  it('announces the upload', async () => {
    const { useCase, events } = harness();

    await useCase.execute(PARTNER_ID, input({ logoUrl: 'https://cdn/new-logo.png' }));

    expect(events).toEqual([
      { eventType: 'partner.documents_updated', payload: { partnerId: PARTNER_ID } },
    ]);
  });
});
