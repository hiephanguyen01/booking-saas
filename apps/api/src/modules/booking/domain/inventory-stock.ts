/**
 * Inventory stock maths (TONG-QUAN.md §9.4). Pure — the repository supplies the
 * atomically-counted `used` quantity (under an advisory lock). Stock is
 * per-listing (a shared pool across listings is backlog).
 */
export function remainingStock(stock: number, used: number): number {
  return Math.max(0, stock - used);
}
