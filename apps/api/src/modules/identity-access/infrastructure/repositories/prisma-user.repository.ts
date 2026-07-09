import { Injectable } from '@nestjs/common';
import type { LockoutState } from '../../domain/login-lockout';
import type {
  CreateGuestData,
  CreateUserData,
  IUserRepository,
  UserRecord,
} from '../../domain/ports/user-repository.port';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

/**
 * users is a global (non-tenant) table — accessed through the admin pool;
 * RLS does not apply to identity data.
 */
@Injectable()
export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.admin.user.findUnique({ where: { email } });
  }

  create(data: CreateUserData): Promise<UserRecord> {
    return this.prisma.admin.user.create({ data });
  }

  createGuest(data: CreateGuestData): Promise<UserRecord> {
    return this.prisma.admin.user.create({
      data: {
        email: data.email,
        fullName: data.fullName,
        phone: data.phone,
        passwordHash: null,
        locale: 'vi',
      },
    });
  }

  async updateLockout(userId: string, state: LockoutState): Promise<void> {
    await this.prisma.admin.user.update({
      where: { id: userId },
      data: { failedLoginCount: state.failedLoginCount, lockedUntil: state.lockedUntil },
    });
  }
}
