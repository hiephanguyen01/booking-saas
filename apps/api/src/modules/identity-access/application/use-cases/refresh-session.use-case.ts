import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
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
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'NO_REFRESH_TOKEN',
        message: 'Missing refresh token',
      });
    }
    const rotated = await this.sessions.rotate(refreshToken);
    if (!rotated) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid or expired',
      });
    }
    return rotated;
  }
}
