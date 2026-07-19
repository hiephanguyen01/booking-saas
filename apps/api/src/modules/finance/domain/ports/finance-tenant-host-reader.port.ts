export const FINANCE_TENANT_HOST_READER = Symbol('FINANCE_TENANT_HOST_READER');

export interface IFinanceTenantHostReader {
  resolveTenantId(host: string): Promise<string | null>;
}
