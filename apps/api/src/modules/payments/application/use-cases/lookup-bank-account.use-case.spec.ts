import { describe, expect, it, vi } from 'vitest';
import { LookupBankAccountUseCase } from './lookup-bank-account.use-case';
import type { AccountNameLookupPort } from '../../domain/ports/account-name-lookup.port';

describe('LookupBankAccountUseCase', () => {
  it('returns valid account name when lookup succeeds', async () => {
    const lookupPort: AccountNameLookupPort = {
      lookup: vi.fn().mockResolvedValue({
        status: 'matched',
        registeredName: 'NGUYEN VAN A',
      }),
    };
    const useCase = new LookupBankAccountUseCase(lookupPort);

    const result = await useCase.execute({
      bankBin: '970436',
      accountNumber: '123456789',
    });

    expect(result).toEqual({
      accountName: 'NGUYEN VAN A',
      isValid: true,
    });
  });

  it('returns invalid when lookup returns error or unsupported', async () => {
    const lookupPort: AccountNameLookupPort = {
      lookup: vi.fn().mockResolvedValue({
        status: 'error',
        retryable: false,
      }),
    };
    const useCase = new LookupBankAccountUseCase(lookupPort);

    const result = await useCase.execute({
      bankBin: '970436',
      accountNumber: '999999999',
    });

    expect(result).toEqual({
      accountName: '',
      isValid: false,
    });
  });
});
