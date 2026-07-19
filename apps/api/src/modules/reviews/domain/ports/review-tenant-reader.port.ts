export const REVIEW_TENANT_READER = Symbol('REVIEW_TENANT_READER');

export interface IReviewTenantReader {
  resolveTenantId(host: string): Promise<string | null>;
}
