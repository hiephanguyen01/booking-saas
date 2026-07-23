import { AsyncLocalStorage } from 'node:async_hooks';

interface StorefrontSecurityContextState {
  cspNonce: string;
}

const storage = new AsyncLocalStorage<StorefrontSecurityContextState>();

export const runWithStorefrontSecurityContext = <T>(
  state: StorefrontSecurityContextState,
  callback: () => T,
): T => storage.run(state, callback);

export function getCurrentStorefrontCspNonce(): string {
  const nonce = storage.getStore()?.cspNonce;
  if (!nonce) {
    throw new Error('Storefront CSP nonce accessed outside the security request context');
  }
  return nonce;
}
