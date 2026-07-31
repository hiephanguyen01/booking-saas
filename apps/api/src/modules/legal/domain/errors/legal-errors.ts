import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Domain errors for the legal (tenant legal documents) aggregate. Codes + statuses
 * follow the shared `DomainError` convention — see
 * `content-reports/domain/errors/content-report-errors.ts` for the pattern this mirrors.
 */

/** No legal document of this type exists for the tenant, or a requested version is not published. */
export class LegalDocumentNotFound extends DomainError {
  constructor() {
    super('LEGAL_DOCUMENT_NOT_FOUND', 404, 'Legal document not found');
  }
}

/** Publish/withdraw attempted a state transition that requires a draft, and there is none. */
export class LegalDraftMissing extends DomainError {
  constructor() {
    super('LEGAL_DRAFT_MISSING', 409, 'No draft exists for this document');
  }
}

/** The draft cannot publish because it does not cover the tenant's default locale. */
export class LegalDefaultLocaleRequired extends DomainError {
  constructor() {
    super('LEGAL_DEFAULT_LOCALE_REQUIRED', 422, 'Draft must include the tenant default locale');
  }
}

/** The accepted version id is not (or no longer) its document's current published version. */
export class LegalVersionStale extends DomainError {
  constructor() {
    super('LEGAL_VERSION_STALE', 409, 'Accepted version is not the current published version');
  }
}

/** A published version's translation cannot be edited once it exists. */
export class LegalTranslationImmutable extends DomainError {
  constructor() {
    super('LEGAL_TRANSLATION_IMMUTABLE', 409, 'Published translation cannot be edited');
  }
}

/** The principal has at least one outstanding required document to accept. */
export class LegalConsentRequired extends DomainError {
  constructor() {
    super('LEGAL_CONSENT_REQUIRED', 422, 'Legal consent is required');
  }
}

/** A material terms change was published after the principal last accepted; they must re-accept. */
export class LegalAgreementOutdated extends DomainError {
  constructor() {
    super('LEGAL_AGREEMENT_OUTDATED', 403, 'Terms have changed and must be accepted again');
  }
}
