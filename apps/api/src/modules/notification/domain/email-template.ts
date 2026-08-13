export type Locale = 'vi' | 'en';

export interface EmailAttachment {
  filename: string;
  path: string;
  cid: string;
}

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
  attachments?: EmailAttachment[];
}

export interface EmailBrand {
  name: string;
  logoUrl?: string;
  primaryColor: string;
  contactEmail?: string;
  contactPhone?: string;
  contactAddress?: string;
  storefrontUrl?: string;
  dashboardUrl: string;
}

export interface BookingEmailPriceLine {
  label: string;
  amount: string;
  regularAmount?: string;
  discountPercent?: number;
}

export interface BookingEmailPolicyItem {
  text: string;
  tone: 'positive' | 'neutral';
}

export interface BookingCustomerEmailData {
  provider: {
    name: string;
    address?: string;
    phone?: string;
  };
  service: {
    title: string;
    imageUrl?: string;
    schedule: string;
    duration?: string;
    confirmationDateRange?: string;
    confirmationTimeBadge?: string;
  };
  detailStartsAt?: string;
  detailEndsAt?: string;
  pricing?: {
    lines: BookingEmailPriceLine[];
    summaryLine?: BookingEmailPriceLine;
    promotionDiscount?: string;
    total: string;
    paid?: string;
    paidLabel?: string;
    paymentMethod?: string;
    balance?: string;
    noticeLines?: string[];
  };
  refund?: {
    amount?: string;
    fee?: string;
    destination?: string;
  };
  policyItems?: BookingEmailPolicyItem[];
  policyNoticeLines?: string[];
  noticeLines?: string[];
}

/** Everything a template might interpolate — populated by the application layer. */
export interface TemplateData {
  tenantName: string;
  recipientName: string;
  bookingCode?: string;
  listingTitle?: string;
  /** Slot start, already formatted in the resource/tenant timezone. */
  startsAt?: string;
  endsAt?: string;
  /** Amounts, already formatted as VND (e.g. "600.000 ₫"). */
  amount?: string;
  totalAmount?: string;
  depositAmount?: string;
  balanceAmount?: string;
  discountAmount?: string;
  cancellationFee?: string;
  refundAmount?: string;
  partnerName?: string;
  reason?: string;
  listingAddress?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  customerNote?: string;
  policyLines?: string[];
  paymentMethod?: string;
  ctaUrl?: string;
  agreementUrl?: string;
  termsUrl?: string;
  agreementVersions?: string;
  /** Structured snapshot used by the four Figma customer booking emails. */
  bookingCustomer?: BookingCustomerEmailData;
  /** Guest-lookup OTP (§8.6) — the plaintext code and its lifetime in minutes. */
  otp?: string;
  expiresInMin?: number;
  /** The version number just published — `legal.document_published` mails only (Task 20). */
  legalVersionNo?: number;
  taxYear?: number;
  certificateNumber?: string;
  /** Comma-joined role names granted by the invite — `tenant.member_invited` only (Task 9). */
  roleNames?: string;
}

/** The recipient's locale, normalized to a supported one (`vi` is the fallback). */
export function normalizeLocale(locale: string | null | undefined): Locale {
  return locale === 'en' ? 'en' : 'vi';
}
