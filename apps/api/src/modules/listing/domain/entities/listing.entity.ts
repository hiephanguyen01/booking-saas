import type { BalanceDue, BookingMode } from '@booking/contracts';
import {
  GroupManagedListing,
  InvalidBookingModes,
  ListingNotOwned,
  ListingNotOwnedForDelete,
  ListingNotOwnedForModeration,
} from '../errors/listing-errors';

/**
 * Listing aggregate (§7.3) — a single bookable post owned by one partner. This
 * PR (#11b) gives it the invariants the create/update/delete + moderation
 * use-cases enforce inline today, split into three kinds:
 *
 *   - Access guards ({@link Listing.assertOwnedForEdit} /
 *     {@link Listing.assertOwnedForDelete} /
 *     {@link Listing.assertOwnedForModeration}): the three partner-ownership
 *     gates, one per (path × action) pair. Same predicate
 *     (`partnerId && this.partnerId !== partnerId`) but three DISTINCT errors —
 *     edit says "This listing belongs to another partner", delete drops the
 *     "This", moderation carries a different code (`NOT_OWNED`) entirely; the
 *     three are NOT interchangeable, so they stay separate methods.
 *   - The group-managed gate ({@link Listing.assertNotGroupManaged}): a listing
 *     bound to a group is moderated via its parent, never directly.
 *   - Content mapping ({@link Listing.open} / {@link Listing.applyContentUpdate}):
 *     the pure insert/patch field-maps handed to `IListingRepository.create` /
 *     `.update`.
 *
 * Plus the static, listing-type-relative modes check
 * ({@link Listing.assertBookingModesAllowed}) — validated against the INCOMING
 * modes (create input / update patch), never the stored ones, so it takes both
 * arrays as arguments and owns no state.
 *
 * NOT owned here (deliberately): the moderation status transitions
 * (draft → pending_review → published → archived, with the admin-lock rule)
 * stay in the pure `domain/moderation/listing-moderation.ts` state machine —
 * this aggregate only owns the access guards around them. Slug uniqueness,
 * booking counts, address resolution, deposit coverage, attribute validation
 * and the group binding checks all need cross-module reads or the repository,
 * so the use-case resolves them; this aggregate never touches a repository, a
 * clock, or randomness.
 *
 * Framework-free: no Nest, no Prisma.
 */

/**
 * The persisted write-state these rules need — deliberately narrow. Only
 * `partnerId` (the three ownership gates) and `groupId` (the group-managed
 * gate) are read; the fat {@link ListingRecord} is assignable to it, so the
 * use-case rehydrates straight from a repository read.
 */
export interface ListingContentState {
  partnerId: string;
  groupId: string | null;
}

/**
 * Validated insert payload for `IListingRepository.create`
 * (id/tenantId/timestamps assigned by the DB). Every value arrives already
 * resolved by the use-case — the address codes/names from the administrative
 * lookup, `resourceId` from the shared/auto-created resource, `modeConfig`
 * from `validateAndNormalizeModeConfig`, and the nullable fields already
 * coalesced with `?? null`. `open` is a pure passthrough of exactly this shape.
 */
export interface NewListing {
  partnerId: string;
  listingTypeId: string;
  resourceId: string;
  groupId: string | null;
  categoryId: string | null;
  title: string;
  slug: string;
  description: string | null;
  provinceCode: string | null;
  provinceName: string | null;
  wardCode: string | null;
  wardName: string | null;
  address: string | null;
  photos: string[];
  attributes: Record<string, unknown>;
  bookingModes: BookingMode[];
  modeConfig: Record<string, unknown>;
  stockQuantity: number | null;
  capacity: number | null;
  bufferBefore: number;
  bufferAfter: number;
  approvalRequired: boolean;
  depositPercent: number;
  balanceDue: BalanceDue;
  cancellationPolicyId: string | null;
}

/**
 * The diff handed to `IListingRepository.update` — every key optional, an
 * omitted (or `undefined`) key means "leave the stored value alone" (Prisma
 * treats `undefined` as no-op). `resourceId` is deliberately ABSENT: the
 * update path never rewrites it even though the input carries one, matching
 * `UpdateListingData` (which omits `resourceId`, `partnerId`, `listingTypeId`).
 * The `provinceCode`/`provinceName`/`wardCode`/`wardName` come from the
 * resolved administrative address (all four present together or all omitted),
 * and `modeConfig` from the re-normalized config; the rest pass through raw
 * from the update input.
 */
export interface ListingContentPatch {
  groupId?: string;
  categoryId?: string;
  title?: string;
  slug?: string;
  description?: string;
  provinceCode?: string;
  provinceName?: string;
  wardCode?: string;
  wardName?: string;
  address?: string;
  photos?: string[];
  attributes?: Record<string, unknown>;
  bookingModes?: BookingMode[];
  modeConfig?: Record<string, unknown>;
  stockQuantity?: number;
  capacity?: number;
  bufferBefore?: number;
  bufferAfter?: number;
  approvalRequired?: boolean;
  depositPercent?: number;
  balanceDue?: BalanceDue;
  cancellationPolicyId?: string;
}

export class Listing {
  private constructor(private readonly state: ListingContentState) {}

  /** Rehydrate for the update / delete / moderation paths. */
  static rehydrate(state: ListingContentState): Listing {
    return new Listing(state);
  }

  /**
   * Assemble a new listing for insert. Passthrough — the use-case resolves the
   * address/resource/mode-config and coalesces the nullable fields BEFORE
   * calling this; no cross-module read, DB call, clock or randomness here.
   */
  static open(input: NewListing): NewListing {
    return {
      partnerId: input.partnerId,
      listingTypeId: input.listingTypeId,
      resourceId: input.resourceId,
      groupId: input.groupId,
      categoryId: input.categoryId,
      title: input.title,
      slug: input.slug,
      description: input.description,
      provinceCode: input.provinceCode,
      provinceName: input.provinceName,
      wardCode: input.wardCode,
      wardName: input.wardName,
      address: input.address,
      photos: input.photos,
      attributes: input.attributes,
      bookingModes: input.bookingModes,
      modeConfig: input.modeConfig,
      stockQuantity: input.stockQuantity,
      capacity: input.capacity,
      bufferBefore: input.bufferBefore,
      bufferAfter: input.bufferAfter,
      approvalRequired: input.approvalRequired,
      depositPercent: input.depositPercent,
      balanceDue: input.balanceDue,
      cancellationPolicyId: input.cancellationPolicyId,
    };
  }

  /**
   * Modes the listing enables must all be allowed by its listing type. Static
   * because the modes being checked are the INCOMING ones (create input /
   * update patch), never `this` — an update validates `input.bookingModes`, and
   * create has no entity yet. Reproduces the `.filter(m => !allowed.includes(m))`
   * from both `create-listing.use-case.ts` and `update-listing.use-case.ts`
   * verbatim, preserving input order so the error message matches.
   */
  static assertBookingModesAllowed(candidateModes: string[], allowedModes: string[]): void {
    const invalid = candidateModes.filter((m) => !allowedModes.includes(m));
    if (invalid.length > 0) {
      throw new InvalidBookingModes(invalid);
    }
  }

  /** Update path: a partner-scoped caller may only edit their own listing. */
  assertOwnedForEdit(partnerId?: string): void {
    if (partnerId && this.state.partnerId !== partnerId) {
      throw new ListingNotOwned();
    }
  }

  /** Delete path: a partner-scoped caller may only delete their own listing. */
  assertOwnedForDelete(partnerId?: string): void {
    if (partnerId && this.state.partnerId !== partnerId) {
      throw new ListingNotOwnedForDelete();
    }
  }

  /** Moderation path (submit/hide/republish): reproduces `assertOwnership`. */
  assertOwnedForModeration(partnerId?: string): void {
    if (partnerId && this.state.partnerId !== partnerId) {
      throw new ListingNotOwnedForModeration();
    }
  }

  /**
   * A group-bound listing is moderated through its parent group, never
   * directly — reproduces the `if (listing.groupId)` guard shared by the
   * submit/publish/republish/hide use-cases (a truthiness check on `groupId`).
   */
  assertNotGroupManaged(action: 'submit' | 'publish' | 'republish' | 'hide'): void {
    if (this.state.groupId) {
      throw new GroupManagedListing(action);
    }
  }

  /**
   * Merge a PATCH, returning exactly the keys supplied — an omitted key stays
   * `undefined`, which `IListingRepository.update` treats as "leave untouched".
   * `resourceId` is intentionally never emitted (the update path never rewrites
   * it). Mirrors the object `update-listing.use-case.ts` passes to
   * `listings.update` today.
   */
  applyContentUpdate(patch: ListingContentPatch): ListingContentPatch {
    return {
      groupId: patch.groupId,
      categoryId: patch.categoryId,
      title: patch.title,
      slug: patch.slug,
      description: patch.description,
      provinceCode: patch.provinceCode,
      provinceName: patch.provinceName,
      wardCode: patch.wardCode,
      wardName: patch.wardName,
      address: patch.address,
      photos: patch.photos,
      attributes: patch.attributes,
      bookingModes: patch.bookingModes,
      modeConfig: patch.modeConfig,
      stockQuantity: patch.stockQuantity,
      capacity: patch.capacity,
      bufferBefore: patch.bufferBefore,
      bufferAfter: patch.bufferAfter,
      approvalRequired: patch.approvalRequired,
      depositPercent: patch.depositPercent,
      balanceDue: patch.balanceDue,
      cancellationPolicyId: patch.cancellationPolicyId,
    };
  }
}
