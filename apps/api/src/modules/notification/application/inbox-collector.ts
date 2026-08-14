import type { InboxRow } from '../domain/notification-area';

/**
 * Accumulates inbox rows in memory during a dispatcher's recipient loop. It
 * performs NO I/O on purpose: `deliverNotification` runs outside any business
 * transaction, and the hard rule forbids nesting `forTenant` or calling it per
 * query — so the dispatcher flushes the whole batch once, in one transaction,
 * after its loop finishes.
 */
export class InboxCollector {
  private readonly buffer: InboxRow[] = [];

  add(row: InboxRow): void {
    this.buffer.push(row);
  }

  rows(): InboxRow[] {
    return this.buffer;
  }

  isEmpty(): boolean {
    return this.buffer.length === 0;
  }
}
