import type { AttributeField } from '@booking/contracts';
import { formatVnd } from '~/lib/ui';
import type { RoomOption } from './listing-group-types';

/**
 * One attribute ready to render as an icon-led spec card. Resolved against the
 * listing type's attribute schema, so the label, icon and order are tenant-authored
 * rather than derived from the value's position. `list`/`multiselect` values render
 * as bullet lines; everything else is a single line. `area` keeps its own kind so
 * the unit sentence stays in the `listing` i18n namespace.
 */
export type SpecCard =
  | { kind: 'area'; key: string; icon: string | null; label: string; value: number }
  | { kind: 'text'; key: string; icon: string | null; label: string; line: string }
  | { kind: 'list'; key: string; icon: string | null; label: string; lines: string[] };

/** The lowest quoted price across the bookable rooms, formatted, or null. */
export function minimumRoomPrice(options: RoomOption[]): string | null {
  let minimum: number | null = null;
  for (const option of options) {
    const value = Number(option.price);
    if (Number.isFinite(value) && value >= 0 && (minimum === null || value < minimum))
      minimum = value;
  }
  return minimum === null ? null : formatVnd(String(minimum));
}

/**
 * The attribute keys that mean "how many people fit".
 *
 * Capacity gets its own row (see {@link roomCapacity}), so the spec cards must
 * suppress exactly these keys. The two used to be a list and a looser regex that
 * could disagree — a key the regex matched but the list did not was suppressed
 * from the cards *and* produced no capacity row, so the attribute vanished.
 */
const CAPACITY_KEYS = ['capacity', 'maxGuests', 'guestCapacity', 'sucChua'] as const;

export function roomCapacity(attributes: Record<string, unknown>): number | null {
  for (const key of CAPACITY_KEYS) {
    const value = Number(attributes[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

const isCapacityKey = (key: string): boolean =>
  CAPACITY_KEYS.some((capacityKey) => capacityKey === key);

const stringLines = (raw: unknown): string[] =>
  Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    : [];

/**
 * Resolves a listing's `attributes` against its type's `attributeSchema` into ordered
 * spec cards. Capacity is rendered on its own (see {@link roomCapacity}) so it is
 * skipped here, and boolean attributes are display-suppressed (a bare label reads as
 * noise). Attributes absent from the schema are ignored — the schema is the source
 * of what a type exposes.
 */
export function specCards(
  attributes: Record<string, unknown>,
  schema: AttributeField[],
): SpecCard[] {
  const cards: SpecCard[] = [];
  for (const field of schema) {
    const { key } = field;
    if (isCapacityKey(key)) continue;
    const raw = attributes[key];
    if (raw === null || raw === undefined || raw === '') continue;
    const icon = field.icon ?? null;
    const label = field.label || key;
    switch (field.type) {
      case 'boolean':
        break;
      case 'list':
      case 'multiselect': {
        const lines = stringLines(raw);
        if (lines.length) cards.push({ kind: 'list', key, icon, label, lines });
        break;
      }
      case 'number':
        if (typeof raw === 'number' && /area|dientich/i.test(key)) {
          cards.push({ kind: 'area', key, icon, label, value: raw });
        } else if (typeof raw === 'number') {
          cards.push({ kind: 'text', key, icon, label, line: String(raw) });
        }
        break;
      default:
        if (typeof raw === 'string' || typeof raw === 'number')
          cards.push({ kind: 'text', key, icon, label, line: String(raw) });
    }
  }
  return cards;
}
