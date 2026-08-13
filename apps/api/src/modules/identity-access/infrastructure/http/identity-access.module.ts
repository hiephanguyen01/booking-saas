import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PASSWORD_HASHER } from '../../domain/ports/password-hasher.port';
import { PERMISSION_RESOLVER } from '../../domain/ports/permission-resolver.port';
import { SESSION_INFO_READER } from '../../domain/ports/session-info-reader.port';
import { SESSION_STORE } from '../../domain/ports/session-store.port';
import { USER_REPOSITORY } from '../../domain/ports/user-repository.port';
import { TENANT_ROLE_REPOSITORY } from '../../domain/ports/tenant-role-repository.port';
import { TENANT_MEMBER_REPOSITORY } from '../../domain/ports/tenant-member-repository.port';
import { TENANT_INVITATION_REPOSITORY } from '../../domain/ports/tenant-invitation-repository.port';
import { INVITATION_TOKEN } from '../../domain/ports/invitation-token.port';
import { ChangeMyPasswordUseCase } from '../../application/use-cases/change-my-password.use-case';
import { GetSessionInfoUseCase } from '../../application/use-cases/get-session-info.use-case';
import { UpdateMyProfileUseCase } from '../../application/use-cases/update-my-profile.use-case';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { LogoutUseCase } from '../../application/use-cases/logout.use-case';
import { RefreshSessionUseCase } from '../../application/use-cases/refresh-session.use-case';
import { RegisterUseCase } from '../../application/use-cases/register.use-case';
import { FindOrCreateGuestUseCase } from '../../application/use-cases/find-or-create-guest.use-case';
import { UpgradeGuestUseCase } from '../../application/use-cases/upgrade-guest.use-case';
import { CompletePasswordResetUseCase } from '../../application/use-cases/complete-password-reset.use-case';
import { CompleteRegistrationUseCase } from '../../application/use-cases/complete-registration.use-case';
import { ResendPasswordResetUseCase } from '../../application/use-cases/resend-password-reset.use-case';
import { ResendRegistrationUseCase } from '../../application/use-cases/resend-registration.use-case';
import { StartPasswordResetUseCase } from '../../application/use-cases/start-password-reset.use-case';
import { StartRegistrationUseCase } from '../../application/use-cases/start-registration.use-case';
import { VerifyPasswordResetUseCase } from '../../application/use-cases/verify-password-reset.use-case';
import { VerifyRegistrationUseCase } from '../../application/use-cases/verify-registration.use-case';
import { ListTenantRolesUseCase } from '../../application/use-cases/list-tenant-roles.use-case';
import { ListAssignableTenantRolesUseCase } from '../../application/use-cases/list-assignable-tenant-roles.use-case';
import { CreateTenantRoleUseCase } from '../../application/use-cases/create-tenant-role.use-case';
import { UpdateTenantRoleUseCase } from '../../application/use-cases/update-tenant-role.use-case';
import { DeleteTenantRoleUseCase } from '../../application/use-cases/delete-tenant-role.use-case';
import { ListTenantMembersUseCase } from '../../application/use-cases/list-tenant-members.use-case';
import { SetTenantMemberRolesUseCase } from '../../application/use-cases/set-tenant-member-roles.use-case';
import { RemoveTenantMemberUseCase } from '../../application/use-cases/remove-tenant-member.use-case';
import { InviteTenantMemberUseCase } from '../../application/use-cases/invite-tenant-member.use-case';
import { ListTenantInvitationsUseCase } from '../../application/use-cases/list-tenant-invitations.use-case';
import { RevokeTenantInvitationUseCase } from '../../application/use-cases/revoke-tenant-invitation.use-case';
import { GetInvitationPreviewUseCase } from '../../application/use-cases/get-invitation-preview.use-case';
import { AcceptTenantInvitationUseCase } from '../../application/use-cases/accept-tenant-invitation.use-case';
import { AUTH_CHALLENGE_STORE } from '../../domain/ports/auth-challenge-store.port';
import { AUTH_EMAIL_SENDER } from '../../domain/ports/auth-email-sender.port';
import { PrismaUserRepository } from '../repositories/prisma-user.repository';
import { PrismaTenantRoleRepository } from '../repositories/prisma-tenant-role.repository';
import { PrismaTenantMemberRepository } from '../repositories/prisma-tenant-member.repository';
import { PrismaTenantInvitationRepository } from '../repositories/prisma-tenant-invitation.repository';
import { Argon2PasswordHasher } from '../services/argon2-password-hasher';
import { PermissionResolverService } from '../services/permission-resolver.service';
import { PrismaSessionInfoReader } from '../services/prisma-session-info.reader';
import { PrismaSessionStore } from '../services/prisma-session.store';
import { RedisAuthChallengeStore } from '../services/redis-auth-challenge.store';
import { SmtpAuthEmailSender } from '../services/smtp-auth-email.sender';
import { Sha256InvitationTokenService } from '../services/sha256-invitation-token.service';
import { NotificationModule } from '../../../notification/infrastructure/http/notification.module';
import { PublicAuthController } from './public-auth.controller';
import { TenantRoleController } from './tenant-role.controller';
import { TenantMemberController } from './tenant-member.controller';
import { MeInvitationController } from './me-invitation.controller';
import { PermissionsGuard } from './guards/permissions.guard';
import { SessionAuthGuard } from './guards/session-auth.guard';

@Module({
  imports: [NotificationModule],
  controllers: [
    PublicAuthController,
    TenantRoleController,
    TenantMemberController,
    MeInvitationController,
  ],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: SESSION_STORE, useClass: PrismaSessionStore },
    { provide: PERMISSION_RESOLVER, useClass: PermissionResolverService },
    { provide: SESSION_INFO_READER, useClass: PrismaSessionInfoReader },
    { provide: AUTH_CHALLENGE_STORE, useClass: RedisAuthChallengeStore },
    { provide: AUTH_EMAIL_SENDER, useClass: SmtpAuthEmailSender },
    // All three bound here even though Task 6 only wires the role + member
    // endpoints — Tasks 7-8 (invitations, accept) rely on this wiring existing.
    { provide: TENANT_ROLE_REPOSITORY, useClass: PrismaTenantRoleRepository },
    { provide: TENANT_MEMBER_REPOSITORY, useClass: PrismaTenantMemberRepository },
    { provide: TENANT_INVITATION_REPOSITORY, useClass: PrismaTenantInvitationRepository },
    { provide: INVITATION_TOKEN, useClass: Sha256InvitationTokenService },
    RegisterUseCase,
    LoginUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    GetSessionInfoUseCase,
    FindOrCreateGuestUseCase,
    UpgradeGuestUseCase,
    StartRegistrationUseCase,
    ResendRegistrationUseCase,
    VerifyRegistrationUseCase,
    CompleteRegistrationUseCase,
    StartPasswordResetUseCase,
    ResendPasswordResetUseCase,
    VerifyPasswordResetUseCase,
    CompletePasswordResetUseCase,
    UpdateMyProfileUseCase,
    ChangeMyPasswordUseCase,
    ListTenantRolesUseCase,
    ListAssignableTenantRolesUseCase,
    CreateTenantRoleUseCase,
    UpdateTenantRoleUseCase,
    DeleteTenantRoleUseCase,
    ListTenantMembersUseCase,
    SetTenantMemberRolesUseCase,
    RemoveTenantMemberUseCase,
    InviteTenantMemberUseCase,
    ListTenantInvitationsUseCase,
    RevokeTenantInvitationUseCase,
    GetInvitationPreviewUseCase,
    AcceptTenantInvitationUseCase,
    // guard order matters: authentication first, then deny-by-default authorization
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [SESSION_STORE, PERMISSION_RESOLVER, FindOrCreateGuestUseCase],
})
export class IdentityAccessModule {}
