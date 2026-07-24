import type { PublishStatus } from '@booking/contracts';
import {
  ListingGroupNotOwnedForManage,
  ListingGroupReadOnlyForOwnEdit,
  ListingTypeNotGroupable,
} from '../errors/listing-group-errors';

/**
 * ListingGroup aggregate (§7.3) — a two-tier post (album/amenities/address)
 * that holds room/package child listings, owned by one partner. This PR
 * (#11c) gives it the invariants the create/update/delete use-cases enforce
 * inline today, split into:
 *
 *   - The manage-ownership gate ({@link ListingGroup.assertOwnedForManage}):
 *     the ONE partner-ownership check shared by BOTH the update and delete
 *     paths — same predicate (`partnerId && this.partnerId !== partnerId`),
 *     same error — unlike {@link Listing}'s three distinct ownership gates,
 *     which use the same predicate but three different errors.
 *   - The own-edit-readonly gate ({@link ListingGroup.assertEditableStatus}):
 *     the partner-scoped update path's answer when the group itself isn't in
 *     an editable status (draft/archived). This is NOT the same error as the
 *     child-listing binding gates (`ListingGroupReadOnlyForEdit` /
 *     `ListingGroupReadOnlyForDelete`) — those guard binding a LISTING to a
 *     group and stay on the `Listing` side; this one guards editing the
 *     GROUP itself. The caller decides WHEN to call this (only the partner
 *     path) — this method only states the rule.
 *   - The groupable-type check ({@link ListingGroup.assertGroupableType}):
 *     static, since it validates the cross-module listing-type's `structure`
 *     BEFORE any group exists — the use-case resolves the listing type, this
 *     just states the rule.
 *   - Content mapping ({@link ListingGroup.open} /
 *     {@link ListingGroup.applyContentUpdate}): the pure insert/patch
 *     field-maps handed to `IListingGroupRepository.create` / `.update`.
 *
 * NOT owned here (deliberately): the moderation status transitions
 * (draft → pending_review → published → archived, with the admin-lock rule)
 * and the submit/publish/hide/republish cascade over child listings stay in
 * the shared `domain/moderation/listing-moderation.ts` state machine plus the
 * application-layer `run-group-moderation.ts` orchestration — this aggregate
 * only owns the access guards and content invariants around create/update/
 * delete. Slug uniqueness, administrative-address resolution and the
 * listing-type lookup all need cross-module reads or the repository, so the
 * use-case resolves them; this aggregate never touches a repository, a
 * clock, or randomness.
 *
 * Framework-free: no Nest, no Prisma.
 */

/**
 * The persisted write-state these rules need — deliberately narrow. Only
 * `partnerId` (the manage-ownership gate) and `status` (the own-edit-readonly
 * gate) are read; the fat `ListingGroupRecord` is assignable to it, so the
 * use-case rehydrates straight from a repository read.
 */
export interface ListingGroupState {
  partnerId: string;
  status: PublishStatus;
}

/**
 * Validated insert payload for `IListingGroupRepository.create`
 * (id/tenantId/timestamps assigned by the DB). Every value arrives already
 * resolved by the use-case — `provinceCode`/`provinceName`/`wardCode`/
 * `wardName` from the administrative-division lookup, and the nullable
 * `description`/`workingArea` already coalesced with `?? null`. `open` is a
 * pure passthrough of exactly this shape. Reproduces the object
 * `create-listing-group.use-case.ts` passes to `groups.create` today.
 */
export interface NewListingGroup {
  partnerId: string;
  listingTypeId: string;
  title: string;
  slug: string;
  description: string | null;
  provinceCode: string;
  provinceName: string;
  wardCode: string;
  wardName: string;
  address: string;
  workingArea: string | null;
  amenities: string[];
  photos: string[];
}

/**
 * The diff handed to `IListingGroupRepository.update` — every key optional,
 * an omitted (or `undefined`) key means "leave the stored value alone"
 * (Prisma treats `undefined` as no-op). `partnerId`/`listingTypeId` arrive
 * already decided by the use-case: forced `undefined` when the caller is
 * partner-scoped (never reassignable there), passed through when
 * tenant-scoped — that forcing logic stays in
 * `update-listing-group.use-case.ts`; this only maps whatever it's handed.
 * The `provinceCode`/`provinceName`/`wardCode`/`wardName` come from the
 * resolved administrative address (all four present together or all
 * omitted); the rest pass through raw from the update input. Reproduces the
 * object `update-listing-group.use-case.ts` passes to `groups.update` today.
 */
export interface ListingGroupContentPatch {
  partnerId?: string;
  listingTypeId?: string;
  title?: string;
  slug?: string;
  description?: string;
  provinceCode?: string;
  provinceName?: string;
  wardCode?: string;
  wardName?: string;
  address?: string;
  workingArea?: string;
  amenities?: string[];
  photos?: string[];
}

export class ListingGroup {
  private constructor(private readonly state: ListingGroupState) {}

  /** Rehydrate for the update / delete path. */
  static rehydrate(state: ListingGroupState): ListingGroup {
    return new ListingGroup(state);
  }

  /**
   * Assemble a new group for insert. Passthrough — the use-case resolves the
   * administrative address and coalesces the nullable fields BEFORE calling
   * this; no cross-module read, DB call, clock or randomness here.
   */
  static open(input: NewListingGroup): NewListingGroup {
    return {
      partnerId: input.partnerId,
      listingTypeId: input.listingTypeId,
      title: input.title,
      slug: input.slug,
      description: input.description,
      provinceCode: input.provinceCode,
      provinceName: input.provinceName,
      wardCode: input.wardCode,
      wardName: input.wardName,
      address: input.address,
      workingArea: input.workingArea,
      amenities: input.amenities,
      photos: input.photos,
    };
  }

  /**
   * A listing type whose `structure` is `'standalone'` only supports
   * unbundled listings — it can never host a group. Static because it
   * validates the cross-module listing-type resolved by the use-case, not
   * `this` (no group exists yet on the create path). Reproduces the
   * `if (listingType.structure === 'standalone')` guard from
   * `create-listing-group.use-case.ts` verbatim.
   */
  static assertGroupableType(structure: string): void {
    if (structure === 'standalone') {
      throw new ListingTypeNotGroupable();
    }
  }

  /**
   * Update/delete path: a partner-scoped caller may only manage their own
   * group. Shared by BOTH update and delete — same predicate, same error
   * (unlike `Listing`'s three distinct ownership gates).
   */
  assertOwnedForManage(partnerId?: string): void {
    if (partnerId && this.state.partnerId !== partnerId) {
      throw new ListingGroupNotOwnedForManage();
    }
  }

  /**
   * The partner-scoped update path's answer when the group itself isn't
   * editable (status not in draft/archived). Reproduces the
   * `!['draft', 'archived'].includes(existing.status)` predicate from
   * `update-listing-group.use-case.ts` verbatim — the caller decides WHEN to
   * call this (only on the partner path); this method only states the rule.
   */
  assertEditableStatus(): void {
    if (!['draft', 'archived'].includes(this.state.status)) {
      throw new ListingGroupReadOnlyForOwnEdit();
    }
  }

  /**
   * Merge a PATCH, returning exactly the keys supplied — an omitted key stays
   * `undefined`, which `IListingGroupRepository.update` treats as "leave
   * untouched". Mirrors the object `update-listing-group.use-case.ts` passes
   * to `groups.update` today (the `partnerId`/`listingTypeId` forcing is
   * already decided by the caller before this is invoked).
   */
  applyContentUpdate(patch: ListingGroupContentPatch): ListingGroupContentPatch {
    return {
      partnerId: patch.partnerId,
      listingTypeId: patch.listingTypeId,
      title: patch.title,
      slug: patch.slug,
      description: patch.description,
      provinceCode: patch.provinceCode,
      provinceName: patch.provinceName,
      wardCode: patch.wardCode,
      wardName: patch.wardName,
      address: patch.address,
      workingArea: patch.workingArea,
      amenities: patch.amenities,
      photos: patch.photos,
    };
  }
}
