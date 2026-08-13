import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { IInvitationToken } from '../../domain/ports/invitation-token.port';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Mirrors `prisma-session.store.ts`: the DB only ever holds the SHA-256 hash,
 * so a DB leak does not leak a usable invitation link.
 */
@Injectable()
export class Sha256InvitationTokenService implements IInvitationToken {
  issue(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: sha256(token) };
  }

  hash(token: string): string {
    return sha256(token);
  }
}
