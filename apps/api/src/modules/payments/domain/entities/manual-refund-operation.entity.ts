import {
  ManualRefundAccountMismatch,
  ManualRefundActionMetadataRequired,
  ManualRefundAlreadyClaimed,
  ManualRefundDestinationRequired,
  ManualRefundEvidenceRequired,
  ManualRefundFreshAuthenticationRequired,
  ManualRefundInvalidTransition,
  ManualRefundMakerCannotApproveOwnTransfer,
  ManualRefundMakerRequired,
} from '../errors/manual-refund-errors';

export type ManualRefundOperationStatus =
  | 'awaiting_details'
  | 'verification_required'
  | 'correction_required'
  | 'ready_for_transfer'
  | 'transfer_submitted'
  | 'transfer_rejected'
  | 'completed';

export type AccountNameVerificationResult = 'matched' | 'mismatch' | 'unsupported' | 'error';

export interface ManualRefundOperationState {
  id: string;
  status: ManualRefundOperationStatus;
  version: number;
  destinationSubmittedAt: Date | null;
  makerUserId: string | null;
  claimedAt: Date | null;
  transferReference: string | null;
  evidenceObjectKey: string | null;
  evidenceContentType: string | null;
  evidenceSizeBytes: number | null;
  evidenceSha256: string | null;
  evidenceVerifiedAt: Date | null;
  transferSubmittedByUserId: string | null;
  transferSubmittedAt: Date | null;
  reassignedByUserId: string | null;
  reassignmentReason: string | null;
  reassignedAt: Date | null;
  reopenedByUserId: string | null;
  reopenReason: string | null;
  reopenedAt: Date | null;
  breakGlassByUserId: string | null;
  breakGlassReason: string | null;
  breakGlassAuthenticatedAt: Date | null;
  breakGlassAt: Date | null;
}

export interface ManualRefundControlInput {
  actorUserId: string;
  reason: string;
  occurredAt: Date;
}

export interface ManualRefundReassignmentInput extends ManualRefundControlInput {
  makerUserId: string;
}

export interface ManualRefundBreakGlassCompletionInput extends ManualRefundControlInput {
  freshAuthenticationAt: Date;
}

const FRESH_AUTHENTICATION_WINDOW_MS = 5 * 60 * 1000;

/** Framework-free state policy for the batch-level manual refund workflow. */
export class ManualRefundOperation {
  private constructor(private readonly state: ManualRefundOperationState) {}

  static rehydrate(state: ManualRefundOperationState): ManualRefundOperation {
    if (!Number.isInteger(state.version) || state.version < 1) {
      throw new Error('Manual refund operation version must be a positive integer');
    }
    return new ManualRefundOperation({ ...state });
  }

  snapshot(): Readonly<ManualRefundOperationState> {
    return { ...this.state };
  }

  recordDestinationVerification(result: AccountNameVerificationResult): void {
    if (!['awaiting_details', 'correction_required'].includes(this.state.status)) {
      throw new ManualRefundInvalidTransition(this.state.status, 'submit destination for');
    }
    this.transition(
      result === 'matched'
        ? 'ready_for_transfer'
        : result === 'mismatch'
          ? 'correction_required'
          : 'verification_required',
    );
  }

  verifyManually(): void {
    if (this.state.status === 'correction_required') throw new ManualRefundAccountMismatch();
    this.assertStatus('verification_required', 'verify');
    this.transition('ready_for_transfer');
  }

  claim(makerUserId: string): void {
    this.assertStatus('ready_for_transfer', 'claim');
    if (this.state.makerUserId === makerUserId) return;
    if (this.state.makerUserId) throw new ManualRefundAlreadyClaimed();
    this.state.makerUserId = makerUserId;
    this.state.version += 1;
  }

  reassign(input: ManualRefundReassignmentInput): void {
    this.assertStatus('ready_for_transfer', 'reassign');
    this.assertControlMetadata(input);
    if (!input.makerUserId.trim()) throw new ManualRefundActionMetadataRequired();
    if (!this.state.makerUserId) throw new ManualRefundMakerRequired();
    if (this.state.makerUserId === input.makerUserId) return;
    this.state.makerUserId = input.makerUserId;
    this.state.reassignedByUserId = input.actorUserId;
    this.state.reassignmentReason = input.reason.trim();
    this.state.reassignedAt = input.occurredAt;
    this.state.version += 1;
  }

  submitTransfer(actorUserId: string): void {
    this.assertStatus('ready_for_transfer', 'submit transfer for');
    this.assertDestinationAndEvidence();
    if (!this.state.makerUserId || this.state.makerUserId !== actorUserId) {
      throw new ManualRefundMakerRequired();
    }
    this.state.transferSubmittedByUserId = actorUserId;
    this.transition('transfer_submitted');
  }

  approve(checkerUserId: string): void {
    this.assertStatus('transfer_submitted', 'approve');
    this.assertCompletionPrerequisites();
    if (checkerUserId === this.state.makerUserId) {
      throw new ManualRefundMakerCannotApproveOwnTransfer();
    }
    this.transition('completed');
  }

  reject(checkerUserId: string): void {
    this.assertStatus('transfer_submitted', 'reject');
    this.assertCompletionPrerequisites();
    if (checkerUserId === this.state.makerUserId) {
      throw new ManualRefundMakerCannotApproveOwnTransfer();
    }
    this.transition('transfer_rejected');
  }

  reopen(input: ManualRefundControlInput): void {
    if (!['ready_for_transfer', 'transfer_rejected'].includes(this.state.status)) {
      throw new ManualRefundInvalidTransition(this.state.status, 'reopen');
    }
    this.assertControlMetadata(input);
    if (this.state.status === 'ready_for_transfer' && !this.state.makerUserId) {
      throw new ManualRefundMakerRequired();
    }
    this.state.status = 'awaiting_details';
    this.state.makerUserId = null;
    this.state.claimedAt = null;
    this.state.transferReference = null;
    this.state.evidenceObjectKey = null;
    this.state.evidenceContentType = null;
    this.state.evidenceSizeBytes = null;
    this.state.evidenceSha256 = null;
    this.state.evidenceVerifiedAt = null;
    this.state.transferSubmittedByUserId = null;
    this.state.transferSubmittedAt = null;
    this.state.reopenedByUserId = input.actorUserId;
    this.state.reopenReason = input.reason.trim();
    this.state.reopenedAt = input.occurredAt;
    this.state.version += 1;
  }

  completeWithBreakGlass(input: ManualRefundBreakGlassCompletionInput): void {
    this.assertStatus('transfer_submitted', 'break-glass complete');
    this.assertControlMetadata(input, 10);
    this.assertCompletionPrerequisites();
    if (input.actorUserId === this.state.makerUserId) {
      throw new ManualRefundMakerCannotApproveOwnTransfer();
    }
    const authenticationAge = input.occurredAt.getTime() - input.freshAuthenticationAt.getTime();
    if (
      !Number.isFinite(input.freshAuthenticationAt.getTime()) ||
      authenticationAge < 0 ||
      authenticationAge > FRESH_AUTHENTICATION_WINDOW_MS
    ) {
      throw new ManualRefundFreshAuthenticationRequired();
    }
    this.state.breakGlassByUserId = input.actorUserId;
    this.state.breakGlassReason = input.reason.trim();
    this.state.breakGlassAuthenticatedAt = input.freshAuthenticationAt;
    this.state.breakGlassAt = input.occurredAt;
    this.transition('completed');
  }

  private assertCompletionPrerequisites(): void {
    this.assertDestinationAndEvidence();
    if (
      !this.state.makerUserId ||
      this.state.transferSubmittedByUserId !== this.state.makerUserId
    ) {
      throw new ManualRefundMakerRequired();
    }
  }

  private assertDestinationAndEvidence(): void {
    if (!this.state.destinationSubmittedAt) throw new ManualRefundDestinationRequired();
    if (
      !this.state.transferReference ||
      !this.state.evidenceObjectKey ||
      !this.state.evidenceVerifiedAt
    ) {
      throw new ManualRefundEvidenceRequired();
    }
  }

  private assertControlMetadata(input: ManualRefundControlInput, minimumReasonLength = 3): void {
    if (
      !input.actorUserId.trim() ||
      input.reason.trim().length < minimumReasonLength ||
      !Number.isFinite(input.occurredAt.getTime())
    ) {
      throw new ManualRefundActionMetadataRequired();
    }
  }

  private assertStatus(expected: ManualRefundOperationStatus, action: string): void {
    if (this.state.status !== expected) {
      throw new ManualRefundInvalidTransition(this.state.status, action);
    }
  }

  private transition(status: ManualRefundOperationStatus): void {
    this.state.status = status;
    this.state.version += 1;
  }
}
