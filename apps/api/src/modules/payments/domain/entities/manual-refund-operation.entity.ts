import {
  ManualRefundAccountMismatch,
  ManualRefundAlreadyClaimed,
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
  makerUserId: string | null;
}

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

  reassign(makerUserId: string): void {
    this.assertStatus('ready_for_transfer', 'reassign');
    if (this.state.makerUserId === makerUserId) return;
    this.state.makerUserId = makerUserId;
    this.state.version += 1;
  }

  submitTransfer(actorUserId: string): void {
    this.assertStatus('ready_for_transfer', 'submit transfer for');
    if (!this.state.makerUserId || this.state.makerUserId !== actorUserId) {
      throw new ManualRefundMakerRequired();
    }
    this.transition('transfer_submitted');
  }

  approve(checkerUserId: string): void {
    this.assertStatus('transfer_submitted', 'approve');
    if (checkerUserId === this.state.makerUserId) {
      throw new ManualRefundMakerCannotApproveOwnTransfer();
    }
    this.transition('completed');
  }

  reject(checkerUserId: string): void {
    this.assertStatus('transfer_submitted', 'reject');
    if (checkerUserId === this.state.makerUserId) {
      throw new ManualRefundMakerCannotApproveOwnTransfer();
    }
    this.transition('transfer_rejected');
  }

  reopen(): void {
    if (
      ![
        'verification_required',
        'correction_required',
        'ready_for_transfer',
        'transfer_submitted',
        'transfer_rejected',
      ].includes(this.state.status)
    ) {
      throw new ManualRefundInvalidTransition(this.state.status, 'reopen');
    }
    this.state.status = 'awaiting_details';
    this.state.makerUserId = null;
    this.state.version += 1;
  }

  completeWithBreakGlass(): void {
    if (this.state.status === 'completed') {
      throw new ManualRefundInvalidTransition(this.state.status, 'break-glass complete');
    }
    this.transition('completed');
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
