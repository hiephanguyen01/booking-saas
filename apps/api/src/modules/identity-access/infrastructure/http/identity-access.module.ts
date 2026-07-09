import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PASSWORD_HASHER } from '../../domain/ports/password-hasher.port';
import { PERMISSION_RESOLVER } from '../../domain/ports/permission-resolver.port';
import { SESSION_INFO_READER } from '../../domain/ports/session-info-reader.port';
import { SESSION_STORE } from '../../domain/ports/session-store.port';
import { USER_REPOSITORY } from '../../domain/ports/user-repository.port';
import { GetSessionInfoUseCase } from '../../application/use-cases/get-session-info.use-case';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { LogoutUseCase } from '../../application/use-cases/logout.use-case';
import { RefreshSessionUseCase } from '../../application/use-cases/refresh-session.use-case';
import { RegisterUseCase } from '../../application/use-cases/register.use-case';
import { FindOrCreateGuestUseCase } from '../../application/use-cases/find-or-create-guest.use-case';
import { UpgradeGuestUseCase } from '../../application/use-cases/upgrade-guest.use-case';
import { PrismaUserRepository } from '../repositories/prisma-user.repository';
import { Argon2PasswordHasher } from '../services/argon2-password-hasher';
import { PermissionResolverService } from '../services/permission-resolver.service';
import { PrismaSessionInfoReader } from '../services/prisma-session-info.reader';
import { PrismaSessionStore } from '../services/prisma-session.store';
import { AuthController } from './auth.controller';
import { PermissionsGuard } from './guards/permissions.guard';
import { SessionAuthGuard } from './guards/session-auth.guard';

@Module({
  controllers: [AuthController],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: SESSION_STORE, useClass: PrismaSessionStore },
    { provide: PERMISSION_RESOLVER, useClass: PermissionResolverService },
    { provide: SESSION_INFO_READER, useClass: PrismaSessionInfoReader },
    RegisterUseCase,
    LoginUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    GetSessionInfoUseCase,
    FindOrCreateGuestUseCase,
    UpgradeGuestUseCase,
    // guard order matters: authentication first, then deny-by-default authorization
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [SESSION_STORE, PERMISSION_RESOLVER, FindOrCreateGuestUseCase],
})
export class IdentityAccessModule {}
