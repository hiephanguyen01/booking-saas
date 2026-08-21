export const LOGIN_ABUSE_PROTECTION = Symbol('LOGIN_ABUSE_PROTECTION');

export type LoginRateLimitScope = 'pair' | 'ip';

export interface LoginAbuseIdentifiers {
  pairId: string;
  ipId: string;
  accountId: string;
}

export interface LoginAbusePrecheckResult {
  identifiers: LoginAbuseIdentifiers;
  limitedScope: LoginRateLimitScope | null;
}

export interface DistributedAttackSignal {
  activeFailures: number;
  distinctSources: number;
}

export interface LoginAbuseFailureResult {
  identifiers: LoginAbuseIdentifiers;
  distributedAttack: DistributedAttackSignal | null;
  observationUnavailable: boolean;
}

export interface ILoginAbuseProtection {
  precheck(input: {
    normalizedEmail: string;
    clientIp: string;
  }): Promise<LoginAbusePrecheckResult>;

  recordFailure(input: {
    normalizedEmail: string;
    clientIp: string;
  }): Promise<LoginAbuseFailureResult>;

  clearPair(input: { normalizedEmail: string; clientIp: string }): Promise<void>;
}
