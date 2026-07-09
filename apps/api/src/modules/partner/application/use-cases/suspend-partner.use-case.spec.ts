import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SuspendPartnerUseCase } from './suspend-partner.use-case';
import type { IPartnerRepository, PartnerRecord } from '../../domain/ports/partner-repository.port';
import type { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import type { OutboxService } from '../../../../shared/outbox/outbox.service';

const TENANT = '11111111-1111-1111-1111-111111111111';
const PARTNER = '22222222-2222-2222-2222-222222222222';

const partner: PartnerRecord = {
  id: PARTNER,
  tenantId: TENANT,
  name: 'Studio X',
  slug: 'studio-x',
  description: null,
  partnerType: 'company',
  isHouse: false,
  status: 'approved',
  verificationStatus: 'verified',
  verifiedAt: new Date(),
  dateOfBirth: null,
  payoutInfo: {},
  businessInfo: {},
  contactInfo: {},
  identityInfo: {},
  createdAt: new Date(),
};

function makeRepo(overrides: Partial<IPartnerRepository>): IPartnerRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(partner),
    findByIdForUpdate: vi.fn(),
    findBySlug: vi.fn(),
    list: vi.fn(),
    update: vi.fn().mockResolvedValue({ ...partner, status: 'suspended' }),
    addMember: vi.fn(),
    assignRole: vi.fn(),
    countActiveBookings: vi.fn().mockResolvedValue(0),
    tenantIdOfPartner: vi.fn(),
    ...overrides,
  } as IPartnerRepository;
}

// forTenant just runs the callback with a stand-in tx — no real DB in unit tests.
const tenantDb = { forTenant: (_t: string, fn: (tx: unknown) => unknown) => fn({}) } as unknown as TenantDbService;
const outbox = { emit: vi.fn() } as unknown as OutboxService;

describe('SuspendPartnerUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('blocks the suspend while FUTURE confirmed bookings remain', async () => {
    // countActiveBookings only counts future confirmed bookings (§7.3) — repo SQL.
    const repo = makeRepo({ countActiveBookings: vi.fn().mockResolvedValue(3) });
    const useCase = new SuspendPartnerUseCase(repo, tenantDb, outbox);

    await expect(useCase.execute(TENANT, PARTNER)).rejects.toBeInstanceOf(ConflictException);
    expect(repo.update).not.toHaveBeenCalled();
    expect(outbox.emit).not.toHaveBeenCalled();
  });

  it('suspends when no future confirmed bookings remain', async () => {
    const repo = makeRepo({ countActiveBookings: vi.fn().mockResolvedValue(0) });
    const useCase = new SuspendPartnerUseCase(repo, tenantDb, outbox);

    const result = await useCase.execute(TENANT, PARTNER);
    expect(result.status).toBe('suspended');
    expect(repo.update).toHaveBeenCalledWith({}, PARTNER, { status: 'suspended' });
    expect(outbox.emit).toHaveBeenCalledOnce();
  });

  it('404s an unknown partner', async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(null) });
    const useCase = new SuspendPartnerUseCase(repo, tenantDb, outbox);

    await expect(useCase.execute(TENANT, PARTNER)).rejects.toBeInstanceOf(NotFoundException);
  });
});
