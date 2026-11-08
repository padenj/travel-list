type YMD = [number, number, number];

function parseYMD(value?: string | null): YMD | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function monthDay([year, month, day]: YMD): string {
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatTripDateRange(start?: string | null, end?: string | null): string {
  const s = parseYMD(start);
  const e = parseYMD(end);
  if (!s || !e) return '';
  if (s[0] === e[0]) return `${monthDay(s)} – ${monthDay(e)}, ${e[0]}`;
  return `${monthDay(s)}, ${s[0]} – ${monthDay(e)}, ${e[0]}`;
}

export function nightsBetween(start?: string | null, end?: string | null): number | null {
  const s = parseYMD(start);
  const e = parseYMD(end);
  if (!s || !e) return null;
  const diff = Math.round((Date.UTC(e[0], e[1] - 1, e[2]) - Date.UTC(s[0], s[1] - 1, s[2])) / 86400000);
  return diff >= 0 ? diff : null;
}

export function formatNights(nights: number): string {
  return `${nights} night${nights === 1 ? '' : 's'}`;
}
