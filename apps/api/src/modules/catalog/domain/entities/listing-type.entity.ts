import type {
  AttributeField,
  BookingMode,
  BookingSelection,
  ListingStructure,
  ListingTypeSearchConfig,
  TenantTaxCategory,
} from '@booking/contracts';
import {
  BookingSelectionLocked,
  InvalidDefaultModes,
  InvalidFixedPackageModes,
  ListingTypeInUse,
} from '../errors/listing-type-errors';
import { assertValidListingTypeSearchConfig } from '../listing-type-search-config';

/**
 * ListingType aggregate root (§7.3) — a tenant-defined category of listing. It owns
 * the schema every listing of that type is validated against, which booking modes it
 * permits, and how the storefront may search it.
 *
 * Owns the write rules that used to sit in the update use-case and (worse) in an
 * application-layer validator:
 *   - `defaultModes ⊆ allowedModes` and the `fixed_packages` mode restriction, both
 *     checked against MERGED state — a PATCH may send only one of the two fields, so
 *     the contract's zod refine cannot see the real outcome;
 *   - `bookingSelection` is frozen once listings exist ({@link BookingSelectionLocked});
 *   - searchConfig must stay consistent with the merged allowedModes + attributeSchema;
 *   - a type in use cannot be deleted.
 *
 * NOT owned here (deliberately):
 *   - slug uniqueness: needs a port lookup and is ultimately settled by the DB unique
 *     index — the use-case pre-checks, the index arbitrates (the pre-check is TOCTOU
 *     and that is preserved, see the plan's known-gap register);
 *   - `listingCount`: derived read data, so it is passed IN as a fact (`inUse`) rather
 *     than living in the aggregate's write-state;
 *   - attribute-value validation of individual listings (`assertValidAttributes`), which
 *     the listing module plain-imports — its path and error envelope are frozen.
 *
 * Framework-free: no Nest, no Prisma.
 */

/** The persisted write-state (the columns this aggregate owns). */
export interface ListingTypeState {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  iconImageUrl: string | null;
  allowedModes: BookingMode[];
  defaultModes: BookingMode[];
  bookingSelection: BookingSelection;
  attributeSchema: AttributeField[];
  searchConfig: ListingTypeSearchConfig;
  unitLabel: string | null;
  sortOrder: number;
  isActive: boolean;
  requiresIdentityVerification: boolean;
  structure: ListingStructure;
  itemLabel: string | null;
}

/** Validated insert payload (id/tenantId/timestamps assigned by the DB + repo). */
export interface NewListingType {
  name: string;
  slug: string;
  icon: string | null;
  iconImageUrl: string | null;
  allowedModes: BookingMode[];
  defaultModes: BookingMode[];
  bookingSelection: BookingSelection;
  attributeSchema: AttributeField[];
  searchConfig: ListingTypeSearchConfig;
  unitLabel: string | null;
  sortOrder: number;
  isActive: boolean;
  requiresIdentityVerification: boolean;
  structure: ListingStructure;
  itemLabel: string | null;
  /** VAT treatment of everything sold under this type (§VAT). */
  taxCategory: TenantTaxCategory;
}

/** The diff to persist — `undefined` on a key means "leave the stored value alone". */
export type ListingTypePatch = Partial<NewListingType>;

/** Contract-shaped create input (the fields the use-case receives). */
export interface ListingTypeCreateFields {
  name: string;
  slug: string;
  icon?: string | null;
  iconImageUrl?: string | null;
  allowedModes: BookingMode[];
  defaultModes: BookingMode[];
  bookingSelection: BookingSelection;
  attributeSchema: AttributeField[];
  searchConfig: ListingTypeSearchConfig;
  unitLabel?: string | null;
  sortOrder: number;
  isActive: boolean;
  requiresIdentityVerification: boolean;
  structure: ListingStructure;
  itemLabel?: string | null;
  taxCategory: TenantTaxCategory;
}

/** Contract-shaped PATCH input — every key optional. */
export type ListingTypeUpdateFields = Partial<ListingTypeCreateFields>;

export class ListingType {
  private constructor(private readonly state: ListingTypeState) {}

  /** Rehydrate for the update / delete paths. */
  static rehydrate(state: ListingTypeState): ListingType {
    return new ListingType(state);
  }

  /**
   * Assemble a new listing type. The mode rules are re-stated here as defensive
   * depth: the contract's zod refine already rejects them at the HTTP boundary on
   * this path (it always fires on create), so these throws are unreachable in
   * practice — they exist so a non-HTTP caller cannot bypass the rule.
   */
  static open(input: ListingTypeCreateFields): NewListingType {
    assertModeRules(input.allowedModes, input.defaultModes, input.bookingSelection);
    assertValidListingTypeSearchConfig({
      allowedModes: input.allowedModes,
      attributeSchema: input.attributeSchema,
      searchConfig: input.searchConfig,
    });
    return {
      name: input.name,
      slug: input.slug,
      icon: input.icon ?? null,
      iconImageUrl: input.iconImageUrl ?? null,
      allowedModes: input.allowedModes,
      defaultModes: input.defaultModes,
      bookingSelection: input.bookingSelection,
      attributeSchema: input.attributeSchema,
      searchConfig: input.searchConfig,
      unitLabel: input.unitLabel ?? null,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      requiresIdentityVerification: input.requiresIdentityVerification,
      structure: input.structure,
      itemLabel: input.itemLabel ?? null,
      taxCategory: input.taxCategory,
    };
  }

  get id(): string {
    return this.state.id;
  }

  get slug(): string {
    return this.state.slug;
  }

  get bookingSelection(): BookingSelection {
    return this.state.bookingSelection;
  }

  /**
   * Merge a PATCH and enforce every rule against the RESULTING state.
   * `inUse` is the live listing count, resolved by the use-case — the booking-selection
   * lock is a rule about the type's relationship to its listings, not about its own
   * columns, so the fact is supplied rather than stored.
   */
  applyUpdate(input: ListingTypeUpdateFields, inUse: number): ListingTypePatch {
    const allowed = input.allowedModes ?? this.state.allowedModes;
    const defaults = input.defaultModes ?? this.state.defaultModes;
    const bookingSelection = input.bookingSelection ?? this.state.bookingSelection;
    assertModeRules(allowed, defaults, bookingSelection);
    if (
      input.bookingSelection !== undefined &&
      input.bookingSelection !== this.state.bookingSelection &&
      inUse > 0
    ) {
      throw new BookingSelectionLocked();
    }
    assertValidListingTypeSearchConfig({
      allowedModes: allowed,
      attributeSchema: input.attributeSchema ?? this.state.attributeSchema,
      searchConfig: input.searchConfig ?? this.state.searchConfig,
    });
    return {
      name: input.name,
      slug: input.slug,
      icon: input.icon,
      iconImageUrl: input.iconImageUrl,
      allowedModes: input.allowedModes,
      defaultModes: input.defaultModes,
      bookingSelection: input.bookingSelection,
      attributeSchema: input.attributeSchema,
      searchConfig: input.searchConfig,
      unitLabel: input.unitLabel,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      requiresIdentityVerification: input.requiresIdentityVerification,
      structure: input.structure,
      itemLabel: input.itemLabel,
      taxCategory: input.taxCategory,
    };
  }

  /** A type still referenced by listings must be deactivated, never deleted. */
  assertDeletable(inUse: number): void {
    if (inUse > 0) throw new ListingTypeInUse(inUse);
  }
}

/**
 * The two mode rules, shared by create and update so they cannot drift: every default
 * mode must be allowed, and fixed-package types only make sense hourly/daily.
 */
function assertModeRules(
  allowed: BookingMode[],
  defaults: BookingMode[],
  bookingSelection: BookingSelection,
): void {
  const invalid = defaults.filter((m) => !allowed.includes(m));
  if (invalid.length > 0) throw new InvalidDefaultModes(invalid);
  if (
    bookingSelection === 'fixed_packages' &&
    allowed.some((mode) => mode !== 'hourly' && mode !== 'daily')
  ) {
    throw new InvalidFixedPackageModes();
  }
}
