const DOCUMENT_FILE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp|avif|gif)$/;

export function applicantPartnerDocumentPrefix(userId: string): string {
  return `partner-documents/applicants/${userId}`;
}

export function partnerDocumentPrefix(partnerId: string): string {
  return `partner-documents/partners/${partnerId}`;
}

function belongsToPrefix(prefix: string, key: string): boolean {
  if (!key || key.includes('..') || key.startsWith('/') || key.includes('\\')) return false;
  const expected = `${prefix}/`;
  if (!key.startsWith(expected)) return false;
  return DOCUMENT_FILE.test(key.slice(expected.length));
}

export function isApplicantDocumentKeyForUser(userId: string, key: string): boolean {
  return belongsToPrefix(applicantPartnerDocumentPrefix(userId), key);
}

export function isPartnerDocumentKey(partnerId: string, key: string): boolean {
  return belongsToPrefix(partnerDocumentPrefix(partnerId), key);
}
