import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Domain errors for the ContentReport aggregate. Codes + statuses + messages are
 * byte-identical to the pre-refactor use-case behaviour (wire frozen).
 */

/** Defensive mirror of the contracts superRefines — the zod DTO pipe is the real boundary. */
export class ContentReportValidationError extends DomainError {
  constructor(field: string, message: string) {
    super('VALIDATION_ERROR', 400, message, { fieldErrors: { [field]: [message] } });
  }
}

/** The reported listing/group is not published under an approved partner. */
export class ReportTargetNotFound extends DomainError {
  constructor() {
    super('REPORT_TARGET_NOT_FOUND', 404, 'Published listing or group not found');
  }
}

/** The reporting user no longer exists. */
export class ReporterNotFound extends DomainError {
  constructor() {
    super('REPORTER_NOT_FOUND', 404, 'Reporter not found');
  }
}

/** No content report with this id in the tenant. */
export class ContentReportNotFound extends DomainError {
  constructor() {
    super('CONTENT_REPORT_NOT_FOUND', 404, 'Content report not found');
  }
}

export class ContentReportInvalidTransition extends DomainError {
  constructor(from: string, to: string) {
    super(
      'CONTENT_REPORT_INVALID_TRANSITION',
      409,
      `Content report cannot transition from ${from} to ${to}`,
    );
  }
}

export class ContentReportStateChanged extends DomainError {
  constructor() {
    super(
      'CONTENT_REPORT_STATE_CHANGED',
      409,
      'Content report state changed; reload and try again',
    );
  }
}
