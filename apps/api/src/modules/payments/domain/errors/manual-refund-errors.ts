import { DomainError } from '../../../../shared/domain/domain-error';

export class ManualRefundOperationNotFound extends DomainError {
  constructor() {
    super('MANUAL_REFUND_OPERATION_NOT_FOUND', 404, 'Manual refund operation not found');
  }
}

export class ManualRefundBatchTenantMismatch extends DomainError {
  constructor() {
    super(
      'MANUAL_REFUND_BATCH_TENANT_MISMATCH',
      404,
      'Refund batch was not found in the current tenant',
    );
  }
}

export class ManualRefundInvalidTransition extends DomainError {
  constructor(status: string, action: string) {
    super(
      'MANUAL_REFUND_INVALID_TRANSITION',
      409,
      `Cannot ${action} a manual refund operation in ${status}`,
    );
  }
}

export class ManualRefundConcurrentUpdate extends DomainError {
  constructor() {
    super(
      'MANUAL_REFUND_CONCURRENT_UPDATE',
      409,
      'Manual refund operation was changed by another request',
    );
  }
}

export class ManualRefundAccountMismatch extends DomainError {
  constructor() {
    super(
      'MANUAL_REFUND_ACCOUNT_MISMATCH',
      409,
      'Receiving account name does not match and cannot be manually overridden',
    );
  }
}

export class ManualRefundAlreadyClaimed extends DomainError {
  constructor() {
    super('MANUAL_REFUND_ALREADY_CLAIMED', 409, 'Manual refund is claimed by another maker');
  }
}

export class ManualRefundMakerRequired extends DomainError {
  constructor() {
    super('MANUAL_REFUND_MAKER_REQUIRED', 409, 'Manual refund must be claimed before transfer');
  }
}

export class ManualRefundMakerCannotApproveOwnTransfer extends DomainError {
  constructor() {
    super(
      'MANUAL_REFUND_MAKER_CANNOT_APPROVE_OWN_TRANSFER',
      409,
      'The transfer maker cannot approve the same manual refund',
    );
  }
}

export class ManualRefundTransferReferenceAlreadyUsed extends DomainError {
  constructor() {
    super(
      'MANUAL_REFUND_TRANSFER_REFERENCE_ALREADY_USED',
      409,
      'Transfer reference has already been used for this tenant',
    );
  }
}

export class ManualRefundDestinationLocked extends DomainError {
  constructor() {
    super(
      'MANUAL_REFUND_DESTINATION_LOCKED',
      409,
      'Receiving account is locked after a maker claims the operation',
    );
  }
}

export class ManualRefundEvidenceRequired extends DomainError {
  constructor() {
    super('MANUAL_REFUND_EVIDENCE_REQUIRED', 400, 'Verified transfer evidence is required');
  }
}

export class ManualRefundDestinationRequired extends DomainError {
  constructor() {
    super('MANUAL_REFUND_DESTINATION_REQUIRED', 400, 'A verified receiving destination is required');
  }
}

export class ManualRefundActionMetadataRequired extends DomainError {
  constructor() {
    super(
      'MANUAL_REFUND_ACTION_METADATA_REQUIRED',
      400,
      'Actor, reason, and occurrence time are required for this manual refund action',
    );
  }
}

export class ManualRefundFreshAuthenticationRequired extends DomainError {
  constructor() {
    super(
      'MANUAL_REFUND_FRESH_AUTHENTICATION_REQUIRED',
      401,
      'Fresh authentication is required for break-glass access',
    );
  }
}

export class ManualRefundBatchWorkflowRequired extends DomainError {
  constructor() {
    super(
      'MANUAL_REFUND_BATCH_WORKFLOW_REQUIRED',
      409,
      'This refund must be completed through the manual refund batch workflow',
    );
  }
}

export class ManualRefundInvalidAccountNumber extends DomainError {
  constructor() {
    super('MANUAL_REFUND_INVALID_ACCOUNT_NUMBER', 400, 'Receiving account number is invalid');
  }
}
