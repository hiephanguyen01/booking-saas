const MAX_SLUG_LENGTH = 63;

/**
 * Builds a readable, collision-resistant public slug while keeping randomness
 * outside the domain helper. The slug is generated once on create and remains stable.
 */
export function buildPublicSlug(
  title: string,
  randomCode: string,
  fallbackBase = 'item',
): string {
  const suffix =
    randomCode
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 8) || 'item';
  const normalizedTitle = title
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replaceAll('đ', 'd')
    .replaceAll('Đ', 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const maxBaseLength = MAX_SLUG_LENGTH - suffix.length - 1;
  const base =
    (normalizedTitle || fallbackBase).slice(0, maxBaseLength).replace(/-+$/g, '') ||
    fallbackBase.slice(0, maxBaseLength);

  return `${base}-${suffix}`;
}
