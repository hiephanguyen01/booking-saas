export function errorStatus(status: unknown, fallback = 500): number {
  return Number.isInteger(status) && Number(status) >= 400 && Number(status) <= 599
    ? Number(status)
    : fallback;
}
