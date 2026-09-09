import { Inject, Injectable } from '@nestjs/common';
import type {
  LookupBankAccountInput,
  LookupBankAccountResponse,
} from '@booking/contracts';
import {
  ACCOUNT_NAME_LOOKUP,
  type AccountNameLookupPort,
} from '../../domain/ports/account-name-lookup.port';

@Injectable()
export class LookupBankAccountUseCase {
  constructor(
    @Inject(ACCOUNT_NAME_LOOKUP)
    private readonly accountNameLookup: AccountNameLookupPort,
  ) {}

  async execute(input: LookupBankAccountInput): Promise<LookupBankAccountResponse> {
    const bankBin = input.bankBin.trim();
    const accountNumber = input.accountNumber.trim();

    try {
      const result = await this.accountNameLookup.lookup({
        bankCode: bankBin,
        accountNumber,
        expectedAccountName: '',
      });

      if (result.status === 'matched' || result.status === 'mismatch') {
        return {
          accountName: result.registeredName,
          isValid: true,
        };
      }

      return {
        accountName: '',
        isValid: false,
      };
    } catch {
      return {
        accountName: '',
        isValid: false,
      };
    }
  }
}
