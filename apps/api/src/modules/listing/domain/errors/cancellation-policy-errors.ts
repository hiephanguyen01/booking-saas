import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Domain errors for the CancellationPolicy aggregate. Codes + statuses +
 * messages are byte-identical to the pre-refactor use-case behaviour.
 */

export class CancellationPolicyNotFound extends DomainError {
  constructor() {
    super('CANCELLATION_POLICY_NOT_FOUND', 404, 'Cancellation policy not found');
  }
}

/** The partner-path edit endpoint's answer when the policy isn't owned by the
 *  calling partner — same code as {@link CancellationPolicyNotOwnedForDelete}
 *  but a different message (this one explains editing, that one explains
 *  deleting); the two are NOT interchangeable. */
export class CancellationPolicyNotOwnedForEdit extends DomainError {
  constructor() {
    super(
      'CANCELLATION_POLICY_NOT_OWNED',
      403,
      'You can only edit your own cancellation policies',
    );
  }
}

/** The partner-path delete endpoint's answer when the policy isn't owned by the
 *  calling partner — same code as {@link CancellationPolicyNotOwnedForEdit} but
 *  a different message (this one explains deleting, that one explains
 *  editing); the two are NOT interchangeable. */
export class CancellationPolicyNotOwnedForDelete extends DomainError {
  constructor() {
    super(
      'CANCELLATION_POLICY_NOT_OWNED',
      403,
      'You can only delete your own cancellation policies',
    );
  }
}

/** The tenant-path edit endpoint's answer when a partner-owned policy is
 *  targeted — same code as {@link CancellationPolicyNotTenantOwnedForDelete}
 *  but a different message (this one explains editing, that one explains
 *  deleting); the two are NOT interchangeable. */
export class CancellationPolicyNotTenantOwnedForEdit extends DomainError {
  constructor() {
    super(
      'CANCELLATION_POLICY_NOT_TENANT_OWNED',
      403,
      'Only tenant-owned cancellation policies can be edited here',
    );
  }
}

/** The tenant-path delete endpoint's answer when a partner-owned policy is
 *  targeted — same code as {@link CancellationPolicyNotTenantOwnedForEdit} but
 *  a different message (this one explains deleting, that one explains
 *  editing); the two are NOT interchangeable. */
export class CancellationPolicyNotTenantOwnedForDelete extends DomainError {
  constructor() {
    super(
      'CANCELLATION_POLICY_NOT_TENANT_OWNED',
      403,
      'Only tenant-owned cancellation policies can be deleted here',
    );
  }
}

export class CancellationPolicyInUse extends DomainError {
  constructor(count: number) {
    super(
      'CANCELLATION_POLICY_IN_USE',
      409,
      `Cannot delete a policy still attached to ${count} listing(s); reassign them first`,
    );
  }
}
