/** Human duration between two instants; `null` when unparseable or non-positive. */
export function describeDuration(
  startUtc: string,
  endUtc: string,
  mode: string,
  timeZone: string,
): string | null {
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
  const from = dateKey(startUtc, timeZone);
  const to = dateKey(endUtc, timeZone);
  if (!from || !to) return null;
  const days = Math.max(
    1,
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000),
  );
  return `${days} ngày`;
}

function dateKey(iso: string, timeZone: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string): string | undefined =>
    parts.find((part) => part.type === type)?.value;
  const year = get('year');
  const month = get('month');
  const day = get('day');
  return year && month && day ? `${year}-${month}-${day}` : null;
}
