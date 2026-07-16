import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Reflector } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { partnerResponseSchema } from '@booking/contracts';
import { PartnerProfileController } from './partner-profile.controller';
import { GetPartnerProfileUseCase } from '../../application/use-cases/get-partner-profile.use-case';
import { SubmitIdentityUseCase } from '../../application/use-cases/submit-identity.use-case';
import { UpdatePartnerDocumentsUseCase } from '../../application/use-cases/update-partner-documents.use-case';
import { UpdatePayoutInfoUseCase } from '../../application/use-cases/update-payout-info.use-case';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { REQUIRED_PERMISSIONS } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import type { PartnerRecord } from '../../domain/ports/partner-repository.port';

const PARTNER = '22222222-2222-2222-2222-222222222222';

const record: PartnerRecord = {
  id: PARTNER,
  tenantId: '11111111-1111-1111-1111-111111111111',
  name: 'Studio X',
  slug: 'studio-x',
  description: null,
  partnerType: 'individual',
  isHouse: false,
  status: 'pending',
  verificationStatus: 'rejected',
  verifiedAt: null,
  dateOfBirth: new Date('1990-05-06T00:00:00.000Z'),
  payoutInfo: { bank: 'VCB', accountNumber: '00112233', holderName: 'Nguyen Van A' },
  businessInfo: {},
  contactInfo: { phone: '0912345678', provinceName: 'Thành phố Hà Nội' },
  identityInfo: {
    documentType: 'national_id',
    documentNumber: '001199001234',
    holderName: 'Nguyen Van B',
    reviewedBy: '33333333-3333-3333-3333-333333333333',
    reviewNote: 'NAME_MISMATCH',
  },
  owner: { email: 'owner@studio-x.test', phone: '0987654321' },
  createdAt: new Date('2026-01-02T03:04:05.000Z'),
  updatedAt: new Date('2026-02-03T04:05:06.000Z'),
};

describe('PartnerProfileController', () => {
  let app: INestApplication;
  const getProfile = { execute: vi.fn().mockResolvedValue(record) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PartnerProfileController],
      providers: [
        { provide: GetPartnerProfileUseCase, useValue: getProfile },
        { provide: UpdatePayoutInfoUseCase, useValue: { execute: vi.fn() } },
        { provide: UpdatePartnerDocumentsUseCase, useValue: { execute: vi.fn() } },
        { provide: SubmitIdentityUseCase, useValue: { execute: vi.fn() } },
        // The guard resolves the scope in production; stub the verified partner.
        { provide: TenantContextService, useValue: { partnerIdOrThrow: () => PARTNER } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('maps GET /partner/profile and returns the contract shape', async () => {
    const res = await request(app.getHttpServer()).get('/partner/profile').expect(200);

    expect(partnerResponseSchema.safeParse(res.body).success).toBe(true);
    // The partner is scoped from the verified context, never from the request.
    expect(getProfile.execute).toHaveBeenCalledWith(PARTNER);
  });

  it('lets a rejected partner read why they were rejected', async () => {
    const res = await request(app.getHttpServer()).get('/partner/profile').expect(200);

    expect(res.body.verificationStatus).toBe('rejected');
    expect(res.body.identityInfo.reviewNote).toBe('NAME_MISMATCH');
    // BE-5: the partner must be able to see their own bank account + status.
    expect(res.body.payoutInfo.accountNumber).toBe('00112233');
    expect(res.body.owner.email).toBe('owner@studio-x.test');
  });

  it('declares a partner-scope permission on every route (deny-by-default)', () => {
    const reflector = new Reflector();
    const routes = ['profile', 'payout', 'documents', 'identity'] as const;

    for (const route of routes) {
      const required = reflector.get<string[]>(
        REQUIRED_PERMISSIONS,
        PartnerProfileController.prototype[route],
      );
      // `manage`, not a `read` key: this response carries the payout account and
      // the ID document number, so the Staff role must not reach it.
      expect(required, `${route} declares no permission`).toEqual(['partner.profile.manage']);
    }
  });
});
