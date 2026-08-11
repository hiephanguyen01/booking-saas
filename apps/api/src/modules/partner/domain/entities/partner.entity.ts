import type {
  IdentityDocumentType,
  PartnerStatus,
  PartnerTaxStatus,
  PartnerType,
  PartnerVerificationStatus,
} from '@booking/contracts';
import { CURRENT_COMMISSION_SCHEDULE_VERSION } from '../agreement-versions';
import {
  CancellationPolicyNotFound,
  InvalidPartnerState,
  PartnerHasActiveBookings,
  PartnerNotVerified,
  PartnerSlugTaken,
  TenantInactive,
} from '../errors/partner-errors';
import { isAdult, nameMatches } from '../partner-verification';

export interface PartnerState {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  partnerType: PartnerType;
  isHouse: boolean;
  status: PartnerStatus;
  taxStatus: PartnerTaxStatus;
  verificationStatus: PartnerVerificationStatus;
  verifiedAt: Date | null;
  dateOfBirth: Date | null;
  payoutInfo: Record<string, unknown>;
  businessInfo: Record<string, unknown>;
  contactInfo: Record<string, unknown>;
  identityInfo: Record<string, unknown>;
  defaultCancellationPolicyId: string | null;
}

export interface NewPartner {
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  partnerType: PartnerType;
  isHouse: boolean;
  status: PartnerStatus;
  verificationStatus: 'unsubmitted';
  verifiedAt: null;
  dateOfBirth: null;
  payoutInfo: Record<string, unknown>;
  businessInfo: Record<string, unknown>;
  contactInfo: Record<string, unknown>;
  identityInfo: Record<string, unknown>;
  defaultCancellationPolicyId: null;
}

export interface PartnerStatusIntent {
  status: PartnerStatus;
}

export interface PartnerAgreementIntent {
  agreementType: 'commission_schedule';
  version: string;
}

export type PartnerApprovalOutcome =
  | { kind: 'noop' }
  | {
      kind: 'approved';
      statusIntent: PartnerStatusIntent;
      agreements: [PartnerAgreementIntent];
    };

export interface PartnerIdentitySubmissionIntent {
  verificationStatus: 'pending';
  dateOfBirth: Date;
  identityInfo: {
    documentType: IdentityDocumentType;
    documentNumber: string;
    holderName: string;
  };
}

export type PartnerIdentityRejectionReason = 'UNDER_18' | 'NAME_MISMATCH';

export interface PartnerIdentityRejectionIntent {
  verificationStatus: 'rejected';
  identityInfo: Record<string, unknown>;
}

export interface PartnerIdentityVerifiedIntent {
  verificationStatus: 'verified';
  verifiedAt: Date;
  identityInfo: Record<string, unknown>;
}

export type PartnerIdentityReviewOutcome =
  | { kind: 'no_pending' }
  | { kind: 'missing_dob' }
  | {
      kind: 'rejected';
      reason: PartnerIdentityRejectionReason;
      intent: PartnerIdentityRejectionIntent;
    }
  | { kind: 'eligible' };

export interface PartnerPayoutIntent {
  payoutInfo: {
    bank: string;
    accountNumber: string;
    holderName: string;
  };
}

export interface PartnerBusinessInfoIntent {
  businessInfo: Record<string, unknown>;
}

export interface PartnerDefaultCancellationPolicyIntent {
  defaultCancellationPolicyId: string | null;
}

/** Partner aggregate with independent account-status and identity-review lifecycles. */
export class Partner {
  private constructor(private state: PartnerState) {}

  /** Copy persisted write-state without validating or normalizing legacy values. */
  static rehydrate(state: PartnerState): Partner {
    return new Partner({ ...state });
  }

  static assertTenantAcceptingApplications(status: string): void {
    if (status !== 'active') throw new TenantInactive();
  }

  static assertSlugAvailable(slug: string, slugTaken: boolean): void {
    if (slugTaken) throw new PartnerSlugTaken(slug);
  }

  static apply(input: {
    tenantId: string;
    name: string;
    slug: string;
    description?: string | null;
    partnerType: PartnerType;
    businessInfo?: Record<string, unknown>;
    contactInfo: Record<string, unknown>;
    payoutInfo?: Record<string, unknown>;
  }): NewPartner {
    return {
      tenantId: input.tenantId,
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      partnerType: input.partnerType,
      isHouse: false,
      status: 'pending',
      verificationStatus: 'unsubmitted',
      verifiedAt: null,
      dateOfBirth: null,
      payoutInfo: input.payoutInfo ?? {},
      businessInfo: input.businessInfo ?? {},
      contactInfo: input.contactInfo,
      identityInfo: {},
      defaultCancellationPolicyId: null,
    };
  }

  static createHouse(input: {
    tenantId: string;
    name: string;
    slug: string;
    description?: string | null;
  }): NewPartner {
    return {
      tenantId: input.tenantId,
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      partnerType: 'company',
      isHouse: true,
      status: 'approved',
      verificationStatus: 'unsubmitted',
      verifiedAt: null,
      dateOfBirth: null,
      payoutInfo: {},
      businessInfo: {},
      contactInfo: {},
      identityInfo: {},
      defaultCancellationPolicyId: null,
    };
  }

  static submitIdentity(input: {
    dateOfBirth: Date;
    documentType: IdentityDocumentType;
    documentNumber: string;
    holderName: string;
  }): PartnerIdentitySubmissionIntent {
    return {
      verificationStatus: 'pending',
      dateOfBirth: input.dateOfBirth,
      identityInfo: {
        documentType: input.documentType,
        documentNumber: input.documentNumber,
        holderName: input.holderName,
      },
    };
  }

  static replacePayoutInfo(input: {
    bank: string;
    accountNumber: string;
    holderName: string;
  }): PartnerPayoutIntent {
    return {
      payoutInfo: {
        bank: input.bank,
        accountNumber: input.accountNumber,
        holderName: input.holderName,
      },
    };
  }

  static setDefaultCancellationPolicy(
    policyId: string | null,
    isUsable: boolean,
  ): PartnerDefaultCancellationPolicyIntent {
    if (policyId !== null && !isUsable) throw new CancellationPolicyNotFound();
    return { defaultCancellationPolicyId: policyId };
  }

  static assertCanServeListingType(
    partner: { verificationStatus: PartnerVerificationStatus },
    listingType: { requiresIdentityVerification: boolean },
  ): void {
    if (listingType.requiresIdentityVerification && partner.verificationStatus !== 'verified') {
      throw new PartnerNotVerified();
    }
  }

  approve(agreementVersion?: string): PartnerApprovalOutcome {
    if (this.state.status === 'approved') return { kind: 'noop' };
    if (this.state.status !== 'pending') {
      throw new InvalidPartnerState(this.state.status);
    }

    const statusIntent: PartnerStatusIntent = { status: 'approved' };
    this.state = { ...this.state, ...statusIntent };
    return {
      kind: 'approved',
      statusIntent,
      agreements: [
        {
          agreementType: 'commission_schedule',
          version: agreementVersion ?? CURRENT_COMMISSION_SCHEDULE_VERSION,
        },
      ],
    };
  }

  suspend(futureConfirmedBookingCount: number): PartnerStatusIntent {
    if (futureConfirmedBookingCount > 0) throw new PartnerHasActiveBookings();
    const intent: PartnerStatusIntent = { status: 'suspended' };
    this.state = { ...this.state, ...intent };
    return intent;
  }

  reviewIdentity(input: {
    reviewedBy: string;
    note?: string;
    now: Date;
  }): PartnerIdentityReviewOutcome {
    if (this.state.verificationStatus !== 'pending') return { kind: 'no_pending' };
    if (!this.state.dateOfBirth) return { kind: 'missing_dob' };

    const identityHolderName =
      (this.state.identityInfo as { holderName?: string }).holderName ?? '';
    const payoutHolderName = (this.state.payoutInfo as { holderName?: string }).holderName ?? '';
    const reason: PartnerIdentityRejectionReason | null = !isAdult(
      this.state.dateOfBirth,
      input.now,
    )
      ? 'UNDER_18'
      : !nameMatches(identityHolderName, payoutHolderName)
        ? 'NAME_MISMATCH'
        : null;

    if (!reason) return { kind: 'eligible' };

    const intent: PartnerIdentityRejectionIntent = {
      verificationStatus: 'rejected',
      identityInfo: {
        ...this.state.identityInfo,
        reviewedBy: input.reviewedBy,
        reviewNote: input.note ?? reason,
      },
    };
    this.state = { ...this.state, ...intent };
    return { kind: 'rejected', reason, intent };
  }

  verifyIdentity(input: {
    reviewedBy: string;
    note?: string;
    verifiedAt: Date;
  }): PartnerIdentityVerifiedIntent {
    const intent: PartnerIdentityVerifiedIntent = {
      verificationStatus: 'verified',
      verifiedAt: input.verifiedAt,
      identityInfo: {
        ...this.state.identityInfo,
        reviewedBy: input.reviewedBy,
        reviewNote: input.note ?? null,
      },
    };
    this.state = { ...this.state, ...intent };
    return intent;
  }

  mergeDocuments(input: { logoUrl?: string; licenseDocs?: string[] }): PartnerBusinessInfoIntent {
    const businessInfo: Record<string, unknown> = { ...this.state.businessInfo };
    if (input.logoUrl !== undefined) businessInfo.logoUrl = input.logoUrl;
    if (input.licenseDocs !== undefined) businessInfo.licenseDocs = input.licenseDocs;
    const intent = { businessInfo };
    this.state = { ...this.state, ...intent };
    return intent;
  }
}
