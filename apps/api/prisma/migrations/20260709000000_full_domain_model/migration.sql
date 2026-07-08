-- Auto-generated table DDL for the full §7 data model (bookings, catalog,
-- scheduling, payments, finance, promotions, affiliate, notifications) +
-- guest-user/outbox/audit column additions. Generated via prisma migrate diff;
-- RLS policies, the GiST exclusion constraint and ledger triggers follow in
-- the next migration (Prisma cannot express them). See TONG-QUAN.md §7/§10/§13.

-- CreateEnum
CREATE TYPE "agreement_type" AS ENUM ('partner_terms', 'commission_schedule', 'promo_funding');

-- CreateEnum
CREATE TYPE "partner_type" AS ENUM ('individual', 'company');

-- CreateEnum
CREATE TYPE "partner_status" AS ENUM ('pending', 'approved', 'suspended');

-- CreateEnum
CREATE TYPE "booking_mode" AS ENUM ('hourly', 'daily', 'appointment', 'class', 'inventory');

-- CreateEnum
CREATE TYPE "publish_status" AS ENUM ('draft', 'pending_review', 'published', 'archived');

-- CreateEnum
CREATE TYPE "moderation_actor" AS ENUM ('partner', 'admin');

-- CreateEnum
CREATE TYPE "pricing_rule_type" AS ENUM ('day_of_week', 'date_range', 'time_range');

-- CreateEnum
CREATE TYPE "availability_exception_type" AS ENUM ('closed', 'custom_hours');

-- CreateEnum
CREATE TYPE "booking_status" AS ENUM ('draft', 'pending_approval', 'pending_payment', 'confirmed', 'cancelled', 'completed', 'no_show', 'rejected', 'expired', 'refunded');

-- CreateEnum
CREATE TYPE "balance_due" AS ENUM ('online_before', 'on_arrival');

-- CreateEnum
CREATE TYPE "payment_gateway" AS ENUM ('payos', 'momo', 'vnpay', 'mock');

-- CreateEnum
CREATE TYPE "payment_kind" AS ENUM ('deposit', 'balance', 'full', 'security_deposit');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('pending', 'succeeded', 'failed', 'expired');

-- CreateEnum
CREATE TYPE "refund_status" AS ENUM ('pending', 'succeeded', 'failed', 'manual_required');

-- CreateEnum
CREATE TYPE "gateway_environment" AS ENUM ('sandbox', 'production');

-- CreateEnum
CREATE TYPE "rate_type" AS ENUM ('percent', 'fixed');

-- CreateEnum
CREATE TYPE "commission_applies_to" AS ENUM ('tenant_default', 'listing_type', 'category', 'partner');

-- CreateEnum
CREATE TYPE "ledger_owner_type" AS ENUM ('platform', 'tenant', 'partner', 'affiliate');

-- CreateEnum
CREATE TYPE "ledger_entry_type" AS ENUM ('booking_revenue', 'partner_share', 'platform_fee', 'affiliate_commission', 'promo_discount', 'cancellation_fee', 'additional_charge', 'security_deposit', 'damage_deduction', 'clawback', 'refund', 'payout');

-- CreateEnum
CREATE TYPE "payout_payee_type" AS ENUM ('partner', 'affiliate');

-- CreateEnum
CREATE TYPE "payout_status" AS ENUM ('pending', 'processing', 'paid', 'failed');

-- CreateEnum
CREATE TYPE "affiliate_status" AS ENUM ('pending', 'approved', 'suspended');

-- CreateEnum
CREATE TYPE "referral_target" AS ENUM ('tenant_home', 'listing');

-- CreateEnum
CREATE TYPE "affiliate_commission_status" AS ENUM ('pending', 'confirmed', 'paid', 'reversed', 'clawed_back');

-- CreateEnum
CREATE TYPE "promotion_discount_type" AS ENUM ('percent', 'fixed');

-- CreateEnum
CREATE TYPE "promotion_funded_by" AS ENUM ('tenant', 'partner');

-- CreateEnum
CREATE TYPE "promotion_applies_to" AS ENUM ('all', 'listing_type', 'listing_group', 'category', 'listing', 'partner');

-- CreateEnum
CREATE TYPE "promotion_status" AS ENUM ('draft', 'active', 'paused', 'ended');

-- CreateEnum
CREATE TYPE "promo_redemption_status" AS ENUM ('reserved', 'applied', 'released');

-- CreateEnum
CREATE TYPE "class_session_status" AS ENUM ('scheduled', 'cancelled');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('email', 'zns', 'in_app');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('pending', 'sent', 'failed');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified_at" TIMESTAMPTZ(6),
ALTER COLUMN "password_hash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "outbox_events" ADD COLUMN     "aggregate_id" UUID,
ADD COLUMN     "aggregate_type" TEXT;

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "ip" TEXT;

-- CreateTable
CREATE TABLE "agreement_acceptances" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "partner_id" UUID,
    "agreement_type" "agreement_type" NOT NULL,
    "version" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,

    CONSTRAINT "agreement_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partners" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "partner_type" "partner_type" NOT NULL DEFAULT 'individual',
    "is_house" BOOLEAN NOT NULL DEFAULT false,
    "status" "partner_status" NOT NULL DEFAULT 'pending',
    "business_info" JSONB NOT NULL DEFAULT '{}',
    "contact_info" JSONB NOT NULL DEFAULT '{}',
    "payout_info" JSONB NOT NULL DEFAULT '{}',
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_members" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_types" (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT,
    "allowed_modes" "booking_mode"[],
    "default_modes" "booking_mode"[],
    "attribute_schema" JSONB NOT NULL DEFAULT '[]',
    "unit_label" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "listing_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_groups" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "listing_type_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT,
    "working_area" TEXT,
    "photos" JSONB NOT NULL DEFAULT '[]',
    "amenities" JSONB NOT NULL DEFAULT '[]',
    "status" "publish_status" NOT NULL DEFAULT 'draft',
    "published_by" "moderation_actor",
    "hidden_by" "moderation_actor",
    "rating_avg" DECIMAL(3,2),
    "booking_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "listing_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "listing_type_id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "group_id" UUID,
    "category_id" UUID,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "photos" JSONB NOT NULL DEFAULT '[]',
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "booking_modes" "booking_mode"[],
    "mode_config" JSONB NOT NULL DEFAULT '{}',
    "stock_quantity" INTEGER,
    "capacity" INTEGER,
    "buffer_before" INTEGER NOT NULL DEFAULT 0,
    "buffer_after" INTEGER NOT NULL DEFAULT 0,
    "approval_required" BOOLEAN NOT NULL DEFAULT false,
    "deposit_percent" INTEGER NOT NULL DEFAULT 100,
    "balance_due" "balance_due" NOT NULL DEFAULT 'online_before',
    "reschedule_allowed" BOOLEAN NOT NULL DEFAULT false,
    "reschedule_deadline_hours" INTEGER,
    "reschedule_fee" BIGINT,
    "cancellation_policy_id" UUID,
    "status" "publish_status" NOT NULL DEFAULT 'draft',
    "published_by" "moderation_actor",
    "hidden_by" "moderation_actor",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "booking_mode" "booking_mode" NOT NULL,
    "rule_type" "pricing_rule_type" NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "price" BIGINT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "open_time" TEXT NOT NULL,
    "close_time" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_exceptions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" "availability_exception_type" NOT NULL,
    "open_time" TEXT,
    "close_time" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "class_session_id" UUID,
    "code" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "booking_mode" "booking_mode" NOT NULL,
    "status" "booking_status" NOT NULL DEFAULT 'draft',
    "timeslot" tstzrange,
    "blocked_period" tstzrange,
    "guest_count" INTEGER NOT NULL DEFAULT 1,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "additional_charges" JSONB NOT NULL DEFAULT '[]',
    "total_amount" BIGINT NOT NULL,
    "discount_amount" BIGINT NOT NULL DEFAULT 0,
    "final_amount" BIGINT NOT NULL,
    "deposit_amount" BIGINT NOT NULL,
    "paid_amount" BIGINT NOT NULL DEFAULT 0,
    "promotion_id" UUID,
    "promo_code" TEXT,
    "affiliate_id" UUID,
    "referral_code" TEXT,
    "cancellation_policy_id" UUID,
    "promotion_snapshot" JSONB,
    "cancellation_policy_snapshot" JSONB,
    "pricing_snapshot" JSONB,
    "commission_snapshot" JSONB,
    "customer_note" TEXT,
    "partner_note" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_holds" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "timeslot" tstzrange,
    "session_id" TEXT,
    "customer_id" UUID,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_status_history" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "from_status" "booking_status",
    "to_status" "booking_status" NOT NULL,
    "actor_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cancellation_policies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "rules" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cancellation_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "gateway" "payment_gateway" NOT NULL,
    "kind" "payment_kind" NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" "payment_status" NOT NULL DEFAULT 'pending',
    "gateway_txn_id" TEXT,
    "gateway_payload" JSONB,
    "idempotency_key" TEXT NOT NULL,
    "paid_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" "refund_status" NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "gateway_refund_id" TEXT,
    "evidence" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_gateway_configs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "gateway" "payment_gateway" NOT NULL,
    "credentials" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "environment" "gateway_environment" NOT NULL DEFAULT 'sandbox',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenant_gateway_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "applies_to" "commission_applies_to" NOT NULL,
    "listing_type_id" UUID,
    "category_id" UUID,
    "partner_id" UUID,
    "tenant_rate_type" "rate_type" NOT NULL DEFAULT 'percent',
    "tenant_rate" BIGINT NOT NULL,
    "platform_rate" INTEGER NOT NULL DEFAULT 0,
    "affiliate_rate_type" "rate_type" NOT NULL DEFAULT 'percent',
    "affiliate_rate" BIGINT NOT NULL DEFAULT 0,
    "effective_from" TIMESTAMPTZ(6),
    "effective_to" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "owner_type" "ledger_owner_type" NOT NULL,
    "owner_id" UUID,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "journal_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "entry_type" "ledger_entry_type" NOT NULL,
    "debit" BIGINT NOT NULL DEFAULT 0,
    "credit" BIGINT NOT NULL DEFAULT 0,
    "booking_id" UUID,
    "payment_id" UUID,
    "payout_id" UUID,
    "memo" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "payee_type" "payout_payee_type" NOT NULL,
    "payee_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "period_from" TIMESTAMPTZ(6),
    "period_to" TIMESTAMPTZ(6),
    "status" "payout_status" NOT NULL DEFAULT 'pending',
    "paid_at" TIMESTAMPTZ(6),
    "evidence" JSONB,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "discount_type" "promotion_discount_type" NOT NULL,
    "discount_value" BIGINT NOT NULL,
    "max_discount" BIGINT,
    "funded_by" "promotion_funded_by" NOT NULL DEFAULT 'tenant',
    "applies_to" "promotion_applies_to" NOT NULL DEFAULT 'all',
    "applies_to_id" UUID,
    "min_order_amount" BIGINT,
    "first_booking_only" BOOLEAN NOT NULL DEFAULT false,
    "usage_limit_total" INTEGER,
    "usage_limit_per_customer" INTEGER,
    "redeemed_count" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "status" "promotion_status" NOT NULL DEFAULT 'draft',
    "created_by_partner_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_redemptions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "promotion_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "discount_amount" BIGINT NOT NULL,
    "status" "promo_redemption_status" NOT NULL DEFAULT 'reserved',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "promo_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "affiliate_status" NOT NULL DEFAULT 'pending',
    "custom_rate" BIGINT,
    "payout_info" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "affiliates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_links" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "affiliate_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "target" "referral_target" NOT NULL DEFAULT 'tenant_home',
    "listing_id" UUID,
    "clicks_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "referral_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_clicks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "referral_link_id" UUID NOT NULL,
    "visitor_id" TEXT,
    "ip_hash" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_commissions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "affiliate_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" "affiliate_commission_status" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "affiliate_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "user_id" UUID,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_availability" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "open_time" TEXT NOT NULL,
    "close_time" TEXT NOT NULL,

    CONSTRAINT "staff_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_staff" (
    "tenant_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "service_duration" INTEGER,

    CONSTRAINT "listing_staff_pkey" PRIMARY KEY ("listing_id","staff_id")
);

-- CreateTable
CREATE TABLE "class_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "booked_count" INTEGER NOT NULL DEFAULT 0,
    "status" "class_session_status" NOT NULL DEFAULT 'scheduled',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "class_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "user_id" UUID,
    "channel" "notification_channel" NOT NULL,
    "event_type" TEXT NOT NULL,
    "recipient" TEXT,
    "status" "notification_status" NOT NULL DEFAULT 'pending',
    "payload" JSONB,
    "error" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agreement_acceptances_tenant_id_idx" ON "agreement_acceptances"("tenant_id");

-- CreateIndex
CREATE INDEX "agreement_acceptances_partner_id_idx" ON "agreement_acceptances"("partner_id");

-- CreateIndex
CREATE INDEX "partners_tenant_id_idx" ON "partners"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "partners_tenant_id_slug_key" ON "partners"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "partner_members_tenant_id_idx" ON "partner_members"("tenant_id");

-- CreateIndex
CREATE INDEX "partner_members_user_id_idx" ON "partner_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "partner_members_partner_id_user_id_key" ON "partner_members"("partner_id", "user_id");

-- CreateIndex
CREATE INDEX "listing_types_tenant_id_idx" ON "listing_types"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "listing_types_tenant_id_slug_key" ON "listing_types"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "listing_groups_tenant_id_idx" ON "listing_groups"("tenant_id");

-- CreateIndex
CREATE INDEX "listing_groups_partner_id_idx" ON "listing_groups"("partner_id");

-- CreateIndex
CREATE UNIQUE INDEX "listing_groups_tenant_id_slug_key" ON "listing_groups"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "resources_tenant_id_idx" ON "resources"("tenant_id");

-- CreateIndex
CREATE INDEX "resources_partner_id_idx" ON "resources"("partner_id");

-- CreateIndex
CREATE INDEX "listings_tenant_id_idx" ON "listings"("tenant_id");

-- CreateIndex
CREATE INDEX "listings_partner_id_idx" ON "listings"("partner_id");

-- CreateIndex
CREATE INDEX "listings_resource_id_idx" ON "listings"("resource_id");

-- CreateIndex
CREATE INDEX "listings_group_id_idx" ON "listings"("group_id");

-- CreateIndex
CREATE INDEX "listings_listing_type_id_idx" ON "listings"("listing_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "listings_tenant_id_slug_key" ON "listings"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "pricing_rules_tenant_id_idx" ON "pricing_rules"("tenant_id");

-- CreateIndex
CREATE INDEX "pricing_rules_listing_id_idx" ON "pricing_rules"("listing_id");

-- CreateIndex
CREATE INDEX "categories_tenant_id_idx" ON "categories"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_tenant_id_slug_key" ON "categories"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "availability_rules_tenant_id_idx" ON "availability_rules"("tenant_id");

-- CreateIndex
CREATE INDEX "availability_rules_listing_id_idx" ON "availability_rules"("listing_id");

-- CreateIndex
CREATE INDEX "availability_exceptions_tenant_id_idx" ON "availability_exceptions"("tenant_id");

-- CreateIndex
CREATE INDEX "availability_exceptions_resource_id_date_idx" ON "availability_exceptions"("resource_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_code_key" ON "bookings"("code");

-- CreateIndex
CREATE INDEX "bookings_tenant_id_idx" ON "bookings"("tenant_id");

-- CreateIndex
CREATE INDEX "bookings_listing_id_idx" ON "bookings"("listing_id");

-- CreateIndex
CREATE INDEX "bookings_partner_id_idx" ON "bookings"("partner_id");

-- CreateIndex
CREATE INDEX "bookings_resource_id_idx" ON "bookings"("resource_id");

-- CreateIndex
CREATE INDEX "bookings_customer_id_idx" ON "bookings"("customer_id");

-- CreateIndex
CREATE INDEX "bookings_status_idx" ON "bookings"("status");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_tenant_id_idempotency_key_key" ON "bookings"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "booking_holds_tenant_id_idx" ON "booking_holds"("tenant_id");

-- CreateIndex
CREATE INDEX "booking_holds_resource_id_idx" ON "booking_holds"("resource_id");

-- CreateIndex
CREATE INDEX "booking_status_history_tenant_id_idx" ON "booking_status_history"("tenant_id");

-- CreateIndex
CREATE INDEX "booking_status_history_booking_id_idx" ON "booking_status_history"("booking_id");

-- CreateIndex
CREATE INDEX "cancellation_policies_tenant_id_idx" ON "cancellation_policies"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_tenant_id_idx" ON "payments"("tenant_id");

-- CreateIndex
CREATE INDEX "payments_booking_id_idx" ON "payments"("booking_id");

-- CreateIndex
CREATE INDEX "payments_gateway_txn_id_idx" ON "payments"("gateway_txn_id");

-- CreateIndex
CREATE INDEX "refunds_tenant_id_idx" ON "refunds"("tenant_id");

-- CreateIndex
CREATE INDEX "refunds_payment_id_idx" ON "refunds"("payment_id");

-- CreateIndex
CREATE INDEX "refunds_booking_id_idx" ON "refunds"("booking_id");

-- CreateIndex
CREATE INDEX "tenant_gateway_configs_tenant_id_idx" ON "tenant_gateway_configs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_gateway_configs_tenant_id_gateway_environment_key" ON "tenant_gateway_configs"("tenant_id", "gateway", "environment");

-- CreateIndex
CREATE INDEX "commission_rules_tenant_id_idx" ON "commission_rules"("tenant_id");

-- CreateIndex
CREATE INDEX "ledger_accounts_tenant_id_idx" ON "ledger_accounts"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_tenant_id_owner_type_owner_id_key" ON "ledger_accounts"("tenant_id", "owner_type", "owner_id");

-- CreateIndex
CREATE INDEX "ledger_entries_tenant_id_idx" ON "ledger_entries"("tenant_id");

-- CreateIndex
CREATE INDEX "ledger_entries_journal_id_idx" ON "ledger_entries"("journal_id");

-- CreateIndex
CREATE INDEX "ledger_entries_account_id_idx" ON "ledger_entries"("account_id");

-- CreateIndex
CREATE INDEX "ledger_entries_booking_id_idx" ON "ledger_entries"("booking_id");

-- CreateIndex
CREATE INDEX "payouts_tenant_id_idx" ON "payouts"("tenant_id");

-- CreateIndex
CREATE INDEX "payouts_payee_type_payee_id_idx" ON "payouts"("payee_type", "payee_id");

-- CreateIndex
CREATE INDEX "promotions_tenant_id_idx" ON "promotions"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "promotions_tenant_id_code_key" ON "promotions"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "promo_redemptions_booking_id_key" ON "promo_redemptions"("booking_id");

-- CreateIndex
CREATE INDEX "promo_redemptions_tenant_id_idx" ON "promo_redemptions"("tenant_id");

-- CreateIndex
CREATE INDEX "promo_redemptions_promotion_id_idx" ON "promo_redemptions"("promotion_id");

-- CreateIndex
CREATE INDEX "promo_redemptions_promotion_id_customer_id_idx" ON "promo_redemptions"("promotion_id", "customer_id");

-- CreateIndex
CREATE INDEX "affiliates_tenant_id_idx" ON "affiliates"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "affiliates_tenant_id_user_id_key" ON "affiliates"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "referral_links_tenant_id_idx" ON "referral_links"("tenant_id");

-- CreateIndex
CREATE INDEX "referral_links_affiliate_id_idx" ON "referral_links"("affiliate_id");

-- CreateIndex
CREATE UNIQUE INDEX "referral_links_tenant_id_code_key" ON "referral_links"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "referral_clicks_tenant_id_idx" ON "referral_clicks"("tenant_id");

-- CreateIndex
CREATE INDEX "referral_clicks_referral_link_id_idx" ON "referral_clicks"("referral_link_id");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_commissions_booking_id_key" ON "affiliate_commissions"("booking_id");

-- CreateIndex
CREATE INDEX "affiliate_commissions_tenant_id_idx" ON "affiliate_commissions"("tenant_id");

-- CreateIndex
CREATE INDEX "affiliate_commissions_affiliate_id_idx" ON "affiliate_commissions"("affiliate_id");

-- CreateIndex
CREATE INDEX "staff_tenant_id_idx" ON "staff"("tenant_id");

-- CreateIndex
CREATE INDEX "staff_partner_id_idx" ON "staff"("partner_id");

-- CreateIndex
CREATE INDEX "staff_availability_tenant_id_idx" ON "staff_availability"("tenant_id");

-- CreateIndex
CREATE INDEX "staff_availability_staff_id_idx" ON "staff_availability"("staff_id");

-- CreateIndex
CREATE INDEX "listing_staff_tenant_id_idx" ON "listing_staff"("tenant_id");

-- CreateIndex
CREATE INDEX "class_sessions_tenant_id_idx" ON "class_sessions"("tenant_id");

-- CreateIndex
CREATE INDEX "class_sessions_listing_id_idx" ON "class_sessions"("listing_id");

-- CreateIndex
CREATE INDEX "notification_logs_tenant_id_idx" ON "notification_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "notification_logs_user_id_idx" ON "notification_logs"("user_id");

-- AddForeignKey
ALTER TABLE "agreement_acceptances" ADD CONSTRAINT "agreement_acceptances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_acceptances" ADD CONSTRAINT "agreement_acceptances_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_members" ADD CONSTRAINT "partner_members_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_members" ADD CONSTRAINT "partner_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_types" ADD CONSTRAINT "listing_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_groups" ADD CONSTRAINT "listing_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_groups" ADD CONSTRAINT "listing_groups_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_groups" ADD CONSTRAINT "listing_groups_listing_type_id_fkey" FOREIGN KEY ("listing_type_id") REFERENCES "listing_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_listing_type_id_fkey" FOREIGN KEY ("listing_type_id") REFERENCES "listing_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "listing_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_cancellation_policy_id_fkey" FOREIGN KEY ("cancellation_policy_id") REFERENCES "cancellation_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_class_session_id_fkey" FOREIGN KEY ("class_session_id") REFERENCES "class_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "affiliates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancellation_policy_id_fkey" FOREIGN KEY ("cancellation_policy_id") REFERENCES "cancellation_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellation_policies" ADD CONSTRAINT "cancellation_policies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_gateway_configs" ADD CONSTRAINT "tenant_gateway_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_listing_type_id_fkey" FOREIGN KEY ("listing_type_id") REFERENCES "listing_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_created_by_partner_id_fkey" FOREIGN KEY ("created_by_partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliates" ADD CONSTRAINT "affiliates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliates" ADD CONSTRAINT "affiliates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_links" ADD CONSTRAINT "referral_links_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "affiliates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_links" ADD CONSTRAINT "referral_links_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_clicks" ADD CONSTRAINT "referral_clicks_referral_link_id_fkey" FOREIGN KEY ("referral_link_id") REFERENCES "referral_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_commissions" ADD CONSTRAINT "affiliate_commissions_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "affiliates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_commissions" ADD CONSTRAINT "affiliate_commissions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_availability" ADD CONSTRAINT "staff_availability_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_staff" ADD CONSTRAINT "listing_staff_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_staff" ADD CONSTRAINT "listing_staff_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

