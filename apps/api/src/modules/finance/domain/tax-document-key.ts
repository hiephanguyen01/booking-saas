const TAX_DOCUMENT_ROOT = 'tax-documents';

export function taxDocumentKeyPrefix(tenantId: string): string {
  return `${TAX_DOCUMENT_ROOT}/${tenantId}`;
}

export function isTaxDocumentKeyForTenant(tenantId: string, key: string): boolean {
  const escapedTenantId = tenantId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `^${TAX_DOCUMENT_ROOT}/${escapedTenantId}/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.pdf$`,
    'i',
  ).test(key);
}
