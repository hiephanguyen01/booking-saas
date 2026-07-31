import { REQUIRED_LEGAL_DOCUMENT_TYPES, type LegalDocumentType } from '@booking/contracts';

export const REQUIRED_DOC_TYPES: readonly LegalDocumentType[] = REQUIRED_LEGAL_DOCUMENT_TYPES;

/** The agreement_type value recorded when this document is accepted — same names. */
export function agreementTypeFor(docType: LegalDocumentType): LegalDocumentType {
  return docType;
}
