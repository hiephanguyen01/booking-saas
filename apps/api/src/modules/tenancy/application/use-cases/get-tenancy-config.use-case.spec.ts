import { describe, expect, it } from 'vitest';
import type { TenancyConfig } from '../../domain/ports/tenancy-config.port';
import { GetTenancyConfigUseCase } from './get-tenancy-config.use-case';

describe('GetTenancyConfigUseCase', () => {
  it('exposes the base domain and BOTH DNS targets', async () => {
    // A tenant needs the CNAME and the A-record target to point their own
    // domain at us; hardcoding either in the frontend would break silently the
    // moment the Elastic IP changed.
    const useCase = new GetTenancyConfigUseCase({
      baseDomain: 'bookingos.vn',
      storefrontCname: 'edge.bookingos.vn',
      storefrontIpv4: '203.0.113.10',
      somethingPrivate: 'not for the wire',
    } as unknown as TenancyConfig);

    expect(useCase.execute()).toEqual({
      baseDomain: 'bookingos.vn',
      storefrontCname: 'edge.bookingos.vn',
      storefrontIpv4: '203.0.113.10',
    });
  });
});
