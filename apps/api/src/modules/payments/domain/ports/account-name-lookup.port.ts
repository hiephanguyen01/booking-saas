export const ACCOUNT_NAME_LOOKUP = Symbol('ACCOUNT_NAME_LOOKUP');

export type AccountNameLookupResponse =
  | { status: 'matched'; registeredName: string }
  | { status: 'mismatch'; registeredName: string }
  | { status: 'unsupported' }
  | { status: 'error'; retryable: boolean };

/** Provider-neutral receiving-account name verification. Implementations must never log input. */
export interface AccountNameLookupPort {
  lookup(input: {
    bankCode: string;
    accountNumber: string;
    expectedAccountName: string;
  }): Promise<AccountNameLookupResponse>;
}
