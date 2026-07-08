import { Aperture, Camera, Package, Sparkles, Tag, UserRound, type LucideIcon } from 'lucide-react';

/** Maps a listing type slug to a lucide icon for the menu + cards. */
export function typeIcon(slug: string): LucideIcon {
  if (slug.includes('studio')) return Camera;
  if (slug.includes('model')) return UserRound;
  if (slug.includes('equipment')) return Package;
  if (slug.includes('makeup')) return Sparkles;
  if (slug.includes('photo')) return Aperture;
  return Tag;
}

/** VND đồng digit string → "1.200.000₫". */
export function formatVnd(amount: string | null | undefined): string | null {
  if (amount == null) return null;
  const n = Number(amount);
  return Number.isFinite(n) ? `${n.toLocaleString('vi-VN')}₫` : null;
}

export function attributeSummary(attributes: Record<string, unknown>, max = 3): string {
  return Object.values(attributes)
    .filter((v) => v !== null && v !== '' && typeof v !== 'boolean')
    .slice(0, max)
    .map((v) => String(v))
    .join(' · ');
}
