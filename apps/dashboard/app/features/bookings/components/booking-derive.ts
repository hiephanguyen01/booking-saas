/** Human duration between two instants; `null` when unparseable or non-positive. */
export function describeDuration(startUtc: string, endUtc: string, mode: string): string | null {
  const start = new Date(startUtc).getTime();
  const end = new Date(endUtc).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const minutes = Math.round((end - start) / 60_000);
  if (mode === 'hourly' || mode === 'appointment' || mode === 'class') {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins} phút`;
    return mins === 0 ? `${hours} giờ` : `${hours} giờ ${mins} phút`;
  }
  const days = Math.max(1, Math.round(minutes / (60 * 24)));
  return `${days} ngày`;
}
