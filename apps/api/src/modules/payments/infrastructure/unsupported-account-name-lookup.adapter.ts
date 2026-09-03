import { Injectable } from '@nestjs/common';
import type {
  AccountNameLookupPort,
  AccountNameLookupResponse,
} from '../domain/ports/account-name-lookup.port';

/** Safe default until a bank account-name provider is configured. */
@Injectable()
export class UnsupportedAccountNameLookupAdapter implements AccountNameLookupPort {
  lookup(): Promise<AccountNameLookupResponse> {
    return Promise.resolve({ status: 'unsupported' });
  }
}
