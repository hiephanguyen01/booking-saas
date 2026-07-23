/**
 * Base class for framework-free DOMAIN errors thrown by entities / value objects /
 * domain policies. The domain layer must not import Nest, so it cannot throw
 * `HttpException`; it throws a `DomainError` (carrying the HTTP status + app error
 * `code`) which {@link DomainExceptionFilter} translates into the standard error
 * envelope `{ statusCode, code, message, details? }` at the HTTP boundary.
 *
 * This is the ADR-0006-compliant way to keep business rules on entities while
 * preserving the existing wire contract — see
 * `docs/superpowers/specs/2026-07-23-api-entity-centric-refactor-design.md` §2.9.
 */
export abstract class DomainError extends Error {
  constructor(
    /** App-level error code, e.g. `REVIEW_REPLY_NOT_ACCEPTED` (mirrors the guard/pipe codes). */
    readonly code: string,
    /** HTTP status the filter should emit (e.g. 400/403/404/409). */
    readonly httpStatus: number,
    message: string,
    /** Optional structured detail, surfaced as `details` in the envelope. */
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
