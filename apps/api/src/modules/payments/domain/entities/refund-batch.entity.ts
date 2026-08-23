export type RefundBatchChildStatus = 'pending' | 'manual_required' | 'succeeded' | 'failed';
export type RefundBatchState = 'processing' | 'manual_required' | 'completed' | 'failed';

export interface RefundBatchChildState {
  amount: bigint;
  status: RefundBatchChildStatus;
}

/** Pure business-level state policy for one durable refund batch. */
export class RefundBatch {
  static classify(
    requestedAmount: bigint,
    children: readonly RefundBatchChildState[],
  ): RefundBatchState {
    const succeededAmount = children.reduce(
      (total, child) => total + (child.status === 'succeeded' ? child.amount : 0n),
      0n,
    );

    if (succeededAmount > requestedAmount) {
      throw new Error('Refund batch succeeded amount exceeds requested amount');
    }
    if (succeededAmount === requestedAmount) return 'completed';
    if (children.some((child) => child.status === 'manual_required')) return 'manual_required';
    if (children.some((child) => child.status === 'pending')) return 'processing';
    return 'failed';
  }
}
