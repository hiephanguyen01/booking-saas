import { Injectable } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type {
  IRegistrationCompletionRepository,
  RegistrationCompletionCreateResult,
  RegistrationCompletionInput,
  RegistrationConsentEventInput,
} from '../../domain/ports/registration-completion-repository.port';
import type { UserRecord } from '../../domain/ports/user-repository.port';

function toUserRecord(row: User): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    fullName: row.fullName,
    phone: row.phone,
    avatarUrl: row.avatarUrl,
    locale: row.locale,
    status: row.status,
    failedLoginCount: row.failedLoginCount,
    lockedUntil: row.lockedUntil,
    emailVerifiedAt: row.emailVerifiedAt,
  };
}

function isUserEmailConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.some((field) => String(field) === 'email');
  return String(target ?? '').includes('email');
}

@Injectable()
export class PrismaRegistrationCompletionRepository
  implements IRegistrationCompletionRepository
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  private emitConsentInTx(
    tx: Prisma.TransactionClient,
    input: RegistrationConsentEventInput,
  ): Promise<void> {
    return this.outbox.emit(tx, {
      tenantId: input.tenantId,
      eventType: 'user.registration_consent',
      payload: {
        userId: input.userId,
        acceptedVersionIds: [...input.acceptedVersionIds],
        acceptedLocale: input.acceptedLocale,
        ip: input.ip,
      },
    });
  }

  async create(input: RegistrationCompletionInput): Promise<RegistrationCompletionCreateResult> {
    try {
      return await this.prisma.admin.$transaction(async (tx) => {
        const row = await tx.user.create({ data: input.user });
        const user = toUserRecord(row);

        if (input.consent) {
          await this.emitConsentInTx(tx, {
            ...input.consent,
            userId: user.id,
          });
        }

        return { status: 'created', user } as const;
      });
    } catch (error) {
      if (isUserEmailConflict(error)) return { status: 'email_conflict' };
      throw error;
    }
  }

  async emitConsent(input: RegistrationConsentEventInput): Promise<void> {
    await this.prisma.admin.$transaction((tx) => this.emitConsentInTx(tx, input));
  }
}
