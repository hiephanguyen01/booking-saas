export const CONTENT_REPORT_TENANT_READER = Symbol('CONTENT_REPORT_TENANT_READER');

export interface IContentReportTenantReader {
  resolveTenantId(host: string): Promise<string | null>;
}
