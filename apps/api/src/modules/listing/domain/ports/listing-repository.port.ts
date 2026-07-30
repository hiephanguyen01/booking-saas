import type {
  AttributeField,
  BalanceDue,
  BookingMode,
  BookingSelection,
  CancellationPolicySource,
  CancellationPolicySummary,
  ListingPartnerSummary,
  ModerationActor,
  PublishStatus,
} from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPageWithCounts } from '../../../../shared/pagination/pagination';
import type { ListingContentPatch, NewListing } from '../entities/listing.entity';

export const LISTING_REPOSITORY = Symbol('LISTING_REPOSITORY');

export interface ListingRecord {
  id: string;
  tenantId: string;
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
  bookingSelection: BookingSelection;
  /** Listing-type presentation frozen onto bookings with the attribute values. */
  attributeSchema: AttributeField[];
  modeConfig: Record<string, unknown>;
  stockQuantity: number | null;
  capacity: number | null;
  group: { title: string; slug: string } | null;
  bufferBefore: number;
  bufferAfter: number;
  approvalRequired: boolean;
  depositPercent: number;
  balanceDue: BalanceDue;
  rescheduleAllowed: boolean;
  rescheduleDeadlineHours: number | null;
  /** VND đồng digit string (the column is bigint) — never a JS number. */
  rescheduleFee: string | null;
  cancellationPolicyId: string | null;
  /** Resolved from `cancellationPolicyId` — the listing's OWN explicit choice; null when none. */
  cancellationPolicy: CancellationPolicySummary | null;
  /** The policy that actually governs the listing after fallback (own → partner → tenant default). */
  effectiveCancellationPolicy: CancellationPolicySummary | null;
  /** Origin of `effectiveCancellationPolicy`; null when no policy applies at any level. */
  effectiveCancellationPolicySource: CancellationPolicySource | null;
  /** Owning partner — display name + verification state only (§7.3). */
  partner: ListingPartnerSummary;
  ratingAvg: number | null;
  reviewCount: number;
  bookingCount: number;
  favoriteCount: number;
  status: PublishStatus;
  publishedBy: ModerationActor | null;
  hiddenBy: ModerationActor | null;
  submittedAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A published listing joined with the context a public quote/detail + trust
 * signals need. `cancellationPolicy` is inherited from `ListingRecord`.
 */
export interface PublicListingRecord extends ListingRecord {
  resourceTimezone: string;
  listingTypeSlug: string;
  partnerName: string;
  partnerSlug: string;
  partnerLogoUrl: string | null;
  partnerVerifiedAt: Date | null;
  partnerActiveSince: Date;
  completedBookings: number;
  /** Avg seconds from booking creation to approval (§16.1); null when none. */
  avgApprovalResponseSeconds: number | null;
}

/** The fields a moderation transition persists (§7.3). */
export interface ModerationUpdate {
  status: PublishStatus;
  publishedBy: ModerationActor | null;
  hiddenBy: ModerationActor | null;
  /**
   * Moderation milestones. `undefined` leaves the stored value untouched — the
   * caller (`stampModerationTimestamps`) only sets `submittedAt` on the move into
   * `pending_review` and `publishedAt` on the FIRST publish, so a later
   * hide/republish cycle never rewrites the original publication date.
   */
  submittedAt?: Date;
  publishedAt?: Date;
}

export interface ListingFilter {
  groupId?: string;
  standaloneOnly?: boolean;
  partnerId?: string;
  listingTypeId?: string;
  status?: PublishStatus;
  /** Case-insensitive search over the listing title. Applied to items + counts. */
  q?: string;
}

export interface IListingRepository {
  create(tx: PrismaTx, tenantId: string, data: NewListing): Promise<ListingRecord>;
  findById(tx: PrismaTx, id: string): Promise<ListingRecord | null>;
  /** Loads records in any database order; callers restore their requested key order. */
  findByIds(tx: PrismaTx, ids: readonly string[]): Promise<ListingRecord[]>;
  findBySlug(tx: PrismaTx, slug: string): Promise<ListingRecord | null>;
  findPublicBySlug(tx: PrismaTx, slug: string): Promise<PublicListingRecord | null>;
  list(tx: PrismaTx, filter: ListingFilter): Promise<ListingRecord[]>;
  /**
   * One page of `list`, plus the unpaginated total and per-status row counts
   * (§13 pagination shape). `counts` is computed over every filter EXCEPT
   * `status`, so each status tab shows its own total.
   */
  listPage(
    tx: PrismaTx,
    filter: ListingFilter,
    page: { page: number; pageSize: number },
  ): Promise<RepoPageWithCounts<ListingRecord>>;
  update(
    tx: PrismaTx,
    id: string,
    expectedUpdatedAt: Date,
    data: ListingContentPatch,
  ): Promise<ListingRecord | null>;
  moderate(
    tx: PrismaTx,
    id: string,
    expectedStatus: PublishStatus,
    update: ModerationUpdate,
  ): Promise<ListingRecord | null>;
  delete(tx: PrismaTx, id: string): Promise<void>;
  countBookings(tx: PrismaTx, listingId: string): Promise<number>;
}
