import type { AttributeField } from '@booking/contracts';

/**
 * One attribute ready to render as an icon-led spec card. Labels, icons and
 * order always come from the listing type schema rather than raw JSON keys.
 */
export type SpecCard =
  | { kind: 'area'; key: string; icon: string | null; label: string; value: number }
  | { kind: 'text'; key: string; icon: string | null; label: string; line: string }
  | { kind: 'list'; key: string; icon: string | null; label: string; lines: string[] };

const stringLines = (raw: unknown): string[] =>
  Array.isArray(raw)
    ? raw.filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    : [];

export function specCards(
  attributes: Record<string, unknown>,
  schema: AttributeField[],
): SpecCard[] {
  const cards: SpecCard[] = [];
  for (const field of schema) {
    const raw = attributes[field.key];
    if (raw === null || raw === undefined || raw === '') continue;
    const icon = field.icon ?? null;
    const label = field.label || field.key;
    switch (field.type) {
      case 'boolean':
        break;
      case 'list':
      case 'multiselect': {
        const lines = stringLines(raw);
        if (lines.length) cards.push({ kind: 'list', key: field.key, icon, label, lines });
        break;
      }
      case 'number':
        if (typeof raw === 'number' && /area|dientich/i.test(field.key)) {
          cards.push({ kind: 'area', key: field.key, icon, label, value: raw });
        } else if (typeof raw === 'number') {
          cards.push({ kind: 'text', key: field.key, icon, label, line: String(raw) });
        }
        break;
      default:
        if (typeof raw === 'string' || typeof raw === 'number') {
          cards.push({ kind: 'text', key: field.key, icon, label, line: String(raw) });
        }
    }
  }
  return cards;
}

export function listingCapacity(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}
