import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import {
  UserAccount,
  type LoginLockoutIntent,
  type NewUserAccount,
} from '../../domain/entities/user-account.entity';
import type { IUserRepository, UserRecord } from '../../domain/ports/user-repository.port';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

function toUserAccount(row: User): UserAccount {
  return UserAccount.rehydrate({
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    fullName: row.fullName,
    phone: row.phone,
    locale: row.locale,
    status: row.status,
    failedLoginCount: row.failedLoginCount,
    lockedUntil: row.lockedUntil,
    emailVerifiedAt: row.emailVerifiedAt,
  });
}

function toUserRecord(row: User): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    fullName: row.fullName,
    phone: row.phone,
    locale: row.locale,
    status: row.status,
    failedLoginCount: row.failedLoginCount,
    lockedUntil: row.lockedUntil,
    emailVerifiedAt: row.emailVerifiedAt,
  };
}

/**
 * users is a global (non-tenant) table — accessed through the admin pool;
 * RLS does not apply to identity data.
 */
@Injectable()
export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<UserAccount | null> {
    const row = await this.prisma.admin.user.findUnique({ where: { email } });
    return row ? toUserAccount(row) : null;
  }

  async create(data: NewUserAccount): Promise<UserRecord> {
    return toUserRecord(await this.prisma.admin.user.create({ data }));
  }

  async setPassword(userId: string, passwordHash: string): Promise<UserRecord> {
    return toUserRecord(
      await this.prisma.admin.user.update({ where: { id: userId }, data: { passwordHash } }),
    );
  }

  async updateLockout(userId: string, intent: LoginLockoutIntent): Promise<void> {
    await this.prisma.admin.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: intent.failedLoginCount,
        lockedUntil: intent.lockedUntil,
      },
    });
  }
}
