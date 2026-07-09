/**
 * Inventory stock check (TONG-QUAN.md §9.4). Pure — the repository supplies the
 * atomically-counted `used` quantity (under an advisory lock); this decides
 * whether the request fits. Stock is per-listing (a shared pool across listings
 * is backlog).
 */
export function hasCapacity(stock: number, used: number, requested: number): boolean {
  return requested >= 1 && used + requested <= stock;
}

export function remainingStock(stock: number, used: number): number {
  return Math.max(0, stock - used);
}
