import { Inject, Injectable } from '@nestjs/common';
import type { ScopeMembership } from '@booking/contracts';
import {
  SESSION_INFO_READER,
  type ISessionInfoReader,
} from '../../domain/ports/session-info-reader.port';

/**
 * Returns the scope memberships (with resolved permissions) for the logged-in
 * user, so the dashboard shell can gate areas/nav and choose a default landing.
 */
@Injectable()
export class GetSessionInfoUseCase {
  constructor(
    @Inject(SESSION_INFO_READER) private readonly reader: ISessionInfoReader,
  ) {}

  execute(userId: string): Promise<ScopeMembership[]> {
    return this.reader.listMemberships(userId);
  }
}
