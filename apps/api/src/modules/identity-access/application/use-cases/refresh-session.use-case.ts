import { Inject, Injectable } from '@nestjs/common';
import {
  InvalidRefreshToken,
  MissingRefreshToken,
} from '../../domain/errors/identity-access-errors';
import {
  SESSION_STORE,
  type ISessionStore,
  type SessionTokens,
} from '../../domain/ports/session-store.port';

@Injectable()
export class RefreshSessionUseCase {
  constructor(@Inject(SESSION_STORE) private readonly sessions: ISessionStore) {}

  async execute(refreshToken: string | undefined): Promise<SessionTokens> {
    if (!refreshToken) {
      throw new MissingRefreshToken();
    }
    const rotated = await this.sessions.rotate(refreshToken);
    if (!rotated) {
      throw new InvalidRefreshToken();
    }
    return rotated;
  }
}
