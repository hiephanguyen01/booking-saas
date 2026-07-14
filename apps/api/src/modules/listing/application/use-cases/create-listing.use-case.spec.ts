import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { CreateListingInput } from '@booking/contracts';
import type { PrismaTx, TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import type { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { IListingTypeRepository } from '../../../catalog/domain/ports/listing-type-repository.port';
import type { AttributeValidatorService } from '../../../catalog/application/services/attribute-validator.service';
import type { IPartnerRepository } from '../../../partner/domain/ports/partner-repository.port';
import type { PartnerVerificationService } from '../../../partner/application/services/partner-verification.service';
import type { IListingRepository } from '../../domain/ports/listing-repository.port';
import type { IResourceRepository } from '../../domain/ports/resource-repository.port';
import type { IListingGroupRepository } from '../../domain/ports/listing-group-repository.port';
import { CreateListingUseCase } from './create-listing.use-case';

const TX = {} as PrismaTx;
const PARTNER_A = 'partner-a';
const PARTNER_B = 'partner-b';

function input(overrides: Partial<CreateListingInput> = {}): CreateListingInput {
  return {
    partnerId: PARTNER_A,
    listingTypeId: 'type-1',
    title: 'Studio A',
    slug: 'studio-a',
    photos: [],
    attributes: {},
    bookingModes: ['hourly'],
    modeConfig: { hourly: { basePrice: '300000', blocks: [], minDuration: 1, maxDuration: 8, granularity: 60, leadTimeMin: 0 } },
    bufferBefore: 0,
    bufferAfter: 0,
    approvalRequired: false,
    depositPercent: 100,
    balanceDue: 'online_before',
    ...overrides,
  } as CreateListingInput;
}

function build(opts: {
  resource?: { partnerId: string } | null;
  group?: { partnerId: string } | null;
}) {
  const listings = {
    findBySlug: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 'listing-1' }),
  } as unknown as IListingRepository;
  const resources = {
    findById: vi.fn().mockResolvedValue(opts.resource ?? null),
    create: vi.fn().mockResolvedValue({ id: 'resource-new' }),
  } as unknown as IResourceRepository;
  const groups = {
    findById: vi.fn().mockResolvedValue(opts.group ?? null),
  } as unknown as IListingGroupRepository;
  const listingTypes = {
    findById: vi.fn().mockResolvedValue({
      id: 'type-1',
      allowedModes: ['hourly', 'daily'],
      attributeSchema: [],
      requiresIdentityVerification: false,
    }),
  } as unknown as IListingTypeRepository;
  const partners = {
    findById: vi.fn().mockResolvedValue({ id: PARTNER_A, verificationStatus: 'approved' }),
  } as unknown as IPartnerRepository;
  const attributeValidator = { assertValidAttributes: vi.fn() } as unknown as AttributeValidatorService;
  const partnerVerification = { assertCanServeListingType: vi.fn() } as unknown as PartnerVerificationService;
  const tenantDb = {
    forTenant: vi.fn((_t: string, fn: (tx: PrismaTx) => Promise<unknown>) => fn(TX)),
  } as unknown as TenantDbService;
  const outbox = { emit: vi.fn().mockResolvedValue(undefined) } as unknown as OutboxService;
  const useCase = new CreateListingUseCase(
    listings,
    resources,
    groups,
    listingTypes,
    partners,
    attributeValidator,
    partnerVerification,
    tenantDb,
    outbox,
  );
  return { useCase, listings, resources };
}

describe('CreateListingUseCase cross-partner binding (§7.3)', () => {
  it('rejects binding a resource owned by another partner', async () => {
    const { useCase, listings } = build({ resource: { partnerId: PARTNER_B } });
    await expect(useCase.execute('tenant-1', input({ resourceId: 'res-b' }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(listings.create).not.toHaveBeenCalled();
  });

  it('rejects binding a group owned by another partner', async () => {
    const { useCase, listings } = build({ group: { partnerId: PARTNER_B } });
    await expect(useCase.execute('tenant-1', input({ groupId: 'group-b' }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(listings.create).not.toHaveBeenCalled();
  });

  it('allows binding a resource + group owned by the same partner', async () => {
    const { useCase, listings } = build({
      resource: { partnerId: PARTNER_A },
      group: { partnerId: PARTNER_A },
    });
    await useCase.execute('tenant-1', input({ resourceId: 'res-a', groupId: 'group-a' }));
    expect(listings.create).toHaveBeenCalledOnce();
  });
});
