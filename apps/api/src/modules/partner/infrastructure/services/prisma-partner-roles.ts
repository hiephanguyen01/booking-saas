import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  PERMISSION_RESOLVER,
  type IPermissionResolver,
} from '../../../identity-access/domain/ports/permission-resolver.port';
import type { IPartnerRoles } from '../../domain/ports/partner-roles.port';

/**
 * Role directory for partner onboarding: looks up the seeded `Partner Owner`
 * system role on the admin pool and evicts a user's cached permissions after a
 * new assignment.
 */
@Injectable()
export class PrismaPartnerRoles implements IPartnerRoles {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PERMISSION_RESOLVER) private readonly resolver: IPermissionResolver,
  ) {}

  async partnerOwnerRoleId(): Promise<string> {
    const role = await this.prisma.admin.role.findFirst({
      where: { name: 'Partner Owner', scopeLevel: 'partner', isSystem: true },
    });
    if (!role) {
      throw new Error('Partner Owner system role is not seeded');
    }
    return role.id;
  }

  invalidateUserPermissions(userId: string): Promise<void> {
    return this.resolver.invalidate(userId);
  }
}
