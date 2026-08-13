import { DomainError } from '../../../../shared/domain/domain-error';

/** Caller tried to grant a permission they do not themselves hold. */
export class PermissionEscalation extends DomainError {
  constructor(keys: readonly string[]) {
    super('PERMISSION_ESCALATION', 400, 'Cannot grant permissions you do not hold', { keys });
  }
}

/** A user may not change or remove their own roles. */
export class CannotEditSelf extends DomainError {
  constructor() {
    super('CANNOT_EDIT_SELF', 409, 'You cannot change your own roles');
  }
}

/** The operation would leave the tenant with nobody able to manage members. */
export class LastManagerRemoved extends DomainError {
  constructor() {
    super('LAST_MANAGER_REMOVED', 409, 'The tenant must keep at least one member manager');
  }
}

/** Pre-seeded roles (`is_system = true`) are shared across tenants and immutable. */
export class SystemRoleImmutable extends DomainError {
  constructor() {
    super('SYSTEM_ROLE_IMMUTABLE', 409, 'System roles cannot be edited or deleted');
  }
}

/** Deleting a role that people still hold would silently strip them (FK cascade). */
export class RoleInUse extends DomainError {
  constructor(memberCount: number) {
    super('ROLE_IN_USE', 409, 'Role is still assigned to members', { memberCount });
  }
}

/** A role id that is not assignable in this tenant (deleted, or another tenant's). */
export class RoleNotFound extends DomainError {
  constructor() {
    super('ROLE_NOT_FOUND', 404, 'Role not found');
  }
}

/** The target user holds no tenant-scoped assignment here. */
export class MemberNotFound extends DomainError {
  constructor() {
    super('MEMBER_NOT_FOUND', 404, 'Member not found');
  }
}

export class InvitationNotFound extends DomainError {
  constructor() {
    super('INVITATION_NOT_FOUND', 404, 'Invitation not found');
  }
}

/** Expired, revoked, or already accepted. */
export class InvitationNotPending extends DomainError {
  constructor() {
    super('INVITATION_NOT_PENDING', 409, 'Invitation is no longer valid');
  }
}

export class InvitationEmailMismatch extends DomainError {
  constructor() {
    super('INVITATION_EMAIL_MISMATCH', 403, 'Invitation was issued to a different address');
  }
}

/** Every role named by the invitation has been deleted since it was sent. */
export class InvitationRolesGone extends DomainError {
  constructor() {
    super('INVITATION_ROLES_GONE', 409, 'The roles in this invitation no longer exist');
  }
}

export class InvitationAlreadyPending extends DomainError {
  constructor() {
    super('INVITATION_ALREADY_PENDING', 409, 'This address already has a pending invitation');
  }
}
