import { Inject, Injectable } from '@nestjs/common';
import { SESSION_STORE, type ISessionStore } from '../../domain/ports/session-store.port';

@Injectable()
export class LogoutUseCase {
  constructor(@Inject(SESSION_STORE) private readonly sessions: ISessionStore) {}

  async execute(sessionId: string): Promise<void> {
    await this.sessions.revoke(sessionId);
  }
}
