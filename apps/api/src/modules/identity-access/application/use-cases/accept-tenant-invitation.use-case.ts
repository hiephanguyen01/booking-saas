import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import {
  PERMISSION_RESOLVER,
  type IPermissionResolver,
} from '../../domain/ports/permission-resolver.port';
import {
  TENANT_INVITATION_REPOSITORY,
  type ITenantInvitationRepository,
} from '../../domain/ports/tenant-invitation-repository.port';
import {
  TENANT_MEMBER_REPOSITORY,
  type ITenantMemberRepository,
} from '../../domain/ports/tenant-member-repository.port';
import {
  TENANT_ROLE_REPOSITORY,
  type ITenantRoleRepository,
} from '../../domain/ports/tenant-role-repository.port';
import { INVITATION_TOKEN, type IInvitationToken } from '../../domain/ports/invitation-token.port';
import {
  PARTNER_MEMBERSHIP_WRITER,
  type IPartnerMembershipWriter,
} from '../../domain/ports/partner-membership-writer.port';
import { invitationStateOf } from '../../domain/tenant-access-policy';
import {
  InvitationEmailMismatch,
  InvitationNotFound,
  InvitationNotPending,
  InvitationRolesGone,
} from '../../domain/errors/tenant-access-errors';

/**
 * The recipient's side of accepting an invitation — the flip side of
 * `InviteTenantMemberUseCase`. Three checks run before any write: the
 * invitation must exist, be pending (not expired/revoked/already accepted),
 * and be addressed to the caller's own signed-in email. The tenant transaction
 * is opened on `row.tenantId`, taken from the invitation itself — never from
 * the `x-tenant-id` header, which the caller (having no membership yet)
 * cannot legitimately set.
 *
 * `row.partnerId` branches what accepting materialises. Null (tenant scope):
 * acceptance ADDS the invitation's roles to whatever the caller already
 * holds in this tenant; it never replaces — re-inviting an existing member
 * must never quietly strip a role they already have. Set (partner scope):
 * `partnerMembership.materialize` owns the whole write — it creates
 * `partner_members` and the role assignments together, so identity-access
 * never reaches into that table itself.
 *
 * The two scopes disagree about what an empty role result means, so each
 * branch throws `InvitationRolesGone` on its own, un-shared condition:
 * tenant scope means it when `filterAssignable` itself comes back empty
 * (checked BEFORE deduplicating against roles the member already holds —
 * an empty result only after dedup is a legitimate no-op, not this error);
 * partner scope means it whenever `materialize` returns `[]`, full stop.
 */
@Injectable()
export class AcceptTenantInvitationUseCase {
  constructor(
    @Inject(TENANT_INVITATION_REPOSITORY)
    private readonly invitations: ITenantInvitationRepository,
    @Inject(TENANT_MEMBER_REPOSITORY) private readonly members: ITenantMemberRepository,
    @Inject(TENANT_ROLE_REPOSITORY) private readonly roles: ITenantRoleRepository,
    @Inject(PARTNER_MEMBERSHIP_WRITER)
    private readonly partnerMembership: IPartnerMembershipWriter,
    @Inject(PERMISSION_RESOLVER) private readonly resolver: IPermissionResolver,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    @Inject(INVITATION_TOKEN) private readonly tokens: IInvitationToken,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(token: string, ctx: { userId: string; email: string }): Promise<void> {
    const row = await this.invitations.findByTokenHash(this.tokens.hash(token));
    if (!row) throw new InvitationNotFound();
    if (invitationStateOf(row, new Date()) !== 'pending') throw new InvitationNotPending();
    // citext in the DB, but this comparison is in JS — normalise both sides.
    if (row.email.toLowerCase() !== ctx.email.toLowerCase()) throw new InvitationEmailMismatch();

    await this.tenantDb.forTenant(row.tenantId, async (tx) => {
      let assigned: string[];

      if (row.partnerId) {
        // Partner scope: the partner module owns partner_members and writes
        // it together with the role assignments; identity-access must never
        // reach into that table itself.
        assigned = await this.partnerMembership.materialize(tx, {
          tenantId: row.tenantId,
          partnerId: row.partnerId,
          userId: ctx.userId,
          roleIds: row.roleIds,
        });
        // materialize() returns [] only when no invited role survived — that
        // IS InvitationRolesGone for this scope, unconditionally.
        if (assigned.length === 0) throw new InvitationRolesGone();

        const won = await this.invitations.markAccepted(tx, row.id, ctx.userId);
        if (!won) throw new InvitationNotPending(); // lost the CAS race
      } else {
        // Tenant scope: a role deleted since the invite was sent is dropped
        // here rather than failing the whole accept — unless every one of
        // them is gone. This must be checked BEFORE deduplicating against
        // what the member already holds: a non-empty `roles` followed by an
        // empty add-list below is a legitimate no-op (the member already
        // holds every invited role), never InvitationRolesGone.
        const roles = await this.roles.filterAssignable(tx, row.tenantId, row.roleIds);
        if (roles.length === 0) throw new InvitationRolesGone();

        const won = await this.invitations.markAccepted(tx, row.id, ctx.userId);
        if (!won) throw new InvitationNotPending(); // lost the CAS race

        // ADD to any existing roles, never replace: re-inviting an existing
        // member grants extra roles and must never quietly remove one.
        const existing = await this.members.findOne(tx, row.tenantId, ctx.userId);
        const held = new Set(existing?.roles.map((r) => r.id) ?? []);
        assigned = roles.map((r) => r.id).filter((id) => !held.has(id));
        if (assigned.length) await this.members.addRoles(tx, row.tenantId, ctx.userId, assigned);
      }

      await this.audit.write(tx, {
        tenantId: row.tenantId,
        actorUserId: ctx.userId,
        action: 'member.invitation_accepted',
        entityType: 'tenant_invitation',
        entityId: row.id,
        data: { roleIds: assigned },
      });
    });

    // AFTER forTenant returns — invalidating mid-transaction could race a
    // concurrent read against a not-yet-committed role assignment.
    await this.resolver.invalidate(ctx.userId);
  }
}
