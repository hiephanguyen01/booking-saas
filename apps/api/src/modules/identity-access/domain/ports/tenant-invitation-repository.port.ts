import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const TENANT_INVITATION_REPOSITORY = Symbol('TENANT_INVITATION_REPOSITORY');

export interface InvitationRow {
  id: string;
  tenantId: string;
  tenantName: string;
  /** Set only for a partner-scope invitation; null means tenant scope. */
  partnerId: string | null;
  partnerName: string | null;
  email: string;
  roleIds: string[];
  status: 'pending' | 'accepted' | 'revoked';
  expiresAt: Date;
  createdAt: Date;
  invitedByName: string | null;
}

export interface CreateInvitationData {
  tenantId: string;
  /** Set to invite into a partner's staff instead of the tenant itself. */
  partnerId?: string;
  email: string;
  roleIds: readonly string[];
  tokenHash: string;
  invitedByUserId: string;
  expiresAt: Date;
}

export interface ITenantInvitationRepository {
  list(tx: PrismaTx, tenantId: string): Promise<InvitationRow[]>;
  create(tx: PrismaTx, data: CreateInvitationData): Promise<string>;
  /** Sets status='revoked'. Returns false when it was not pending any more. */
  revoke(tx: PrismaTx, tenantId: string, invitationId: string): Promise<boolean>;
  /**
   * Token lookup for the accept flow. Runs on the ADMIN pool: the caller has no
   * membership in the tenant yet, so no tenant context exists to satisfy RLS.
   */
  findByTokenHash(tokenHash: string): Promise<InvitationRow | null>;
  /**
   * CAS accept: stamps accepted_at/accepted_user_id only while still pending, so
   * two concurrent accepts cannot both create assignments. Returns false if lost.
   */
  markAccepted(tx: PrismaTx, invitationId: string, userId: string): Promise<boolean>;
}
