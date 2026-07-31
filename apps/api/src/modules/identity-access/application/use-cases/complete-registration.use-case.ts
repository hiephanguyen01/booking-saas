import type { AuthFlowCompleteResponse, AuthPasswordCompleteInput } from '@booking/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { UserAccount } from '../../domain/entities/user-account.entity';
import {
  AUTH_CHALLENGE_STORE,
  type IAuthChallengeStore,
} from '../../domain/ports/auth-challenge-store.port';
import { PASSWORD_HASHER, type IPasswordHasher } from '../../domain/ports/password-hasher.port';
import { USER_REPOSITORY, type IUserRepository } from '../../domain/ports/user-repository.port';
import { expired } from './auth-challenge.helpers';

@Injectable()
export class CompleteRegistrationUseCase {
  constructor(
    @Inject(AUTH_CHALLENGE_STORE) private readonly challenges: IAuthChallengeStore,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    input: AuthPasswordCompleteInput,
    meta: { ip?: string } = {},
  ): Promise<AuthFlowCompleteResponse> {
    const payload = await this.challenges.consumeCompletion(input.completionToken, 'registration');
    if (!payload?.fullName) expired();
    const existing = await this.users.findByEmail(payload.email);
    UserAccount.assertEmailAvailable(existing);
    const passwordHash = await this.hasher.hash(input.password);
    const newUser = UserAccount.register({
      email: payload.email,
      fullName: payload.fullName,
      locale: payload.locale,
      passwordHash,
      emailVerifiedAt: new Date(),
    });
    const user = await this.users.create(newUser);

    // Not atomic with the user insert above: PrismaUserRepository.create writes
    // through prisma.admin (the BYPASSRLS pool) with no transaction and no tenant
    // context, by design — users is a global (non-tenant) table and RLS does not
    // apply to identity data. identity-access also cannot import legal directly:
    // legal already imports identity-access's guards/decorators, so the reverse
    // edge would close a module cycle that `pnpm check:module-cycles` forbids.
    // The outbox is the sanctioned way this write-path side effect crosses the
    // module line (AGENTS.md); legal's RecordRegistrationConsentUseCase is a
    // registered handler for `user.registration_consent` and tolerates
    // at-least-once redelivery (a duplicate acceptance row is acceptable, D9).
    const tenantId = payload.tenantId;
    const acceptedVersionIds = payload.acceptedVersionIds;
    if (tenantId && acceptedVersionIds?.length) {
      await this.tenantDb.forTenant(tenantId, (tx) =>
        this.outbox.emit(tx, {
          tenantId,
          eventType: 'user.registration_consent',
          payload: {
            userId: user.id,
            acceptedVersionIds,
            acceptedLocale: payload.acceptedLocale ?? 'vi',
            ip: meta.ip ?? null,
          },
        }),
      );
    }

    return { success: true };
  }
}
