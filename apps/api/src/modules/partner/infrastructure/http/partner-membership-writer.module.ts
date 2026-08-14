import { Global, Module } from '@nestjs/common';
import { PARTNER_MEMBERSHIP_WRITER } from '../../../identity-access/domain/ports/partner-membership-writer.port';
import { PARTNER_STAFF_REPOSITORY } from '../../domain/ports/partner-staff-repository.port';
import { PrismaPartnerStaffRepository } from '../repositories/prisma-partner-staff.repository';
import { PartnerMembershipWriterAdapter } from '../services/partner-membership-writer.adapter';

/**
 * Exists solely to hand `PARTNER_MEMBERSHIP_WRITER` to identity-access's shared
 * accept-invitation flow without identity-access ever importing this (or any)
 * module from `partner`.
 *
 * The direct route — `IdentityAccessModule` importing `PartnerModule` to receive
 * this token — closes a cycle: `partner` already imports `identity-access`
 * directly, AND transitively via `administrative-division`, `legal` and
 * `tenancy` (all three import identity-access for guards/decorators), so one
 * `identity-access → partner` edge produces four cycles at once.
 * `pnpm check:module-cycles` is a static scan of import statements — it has no
 * notion of Nest's runtime DI graph, so wrapping the import in `forwardRef()`
 * does not remove the statement the scanner flags; its own failure text says
 * "Do not add forwardRef()".
 *
 * `@Global()` sidesteps the file-level edge entirely: once this module is
 * instantiated anywhere in the graph (it is, via `PartnerModule`'s own
 * `imports`), Nest publishes everything in `exports` to every module in the
 * application without any of them importing it. `AcceptTenantInvitationUseCase`
 * injects `PARTNER_MEMBERSHIP_WRITER` with zero import from `partner` — the
 * file-level graph keeps its single direction, partner → identity-access.
 *
 * Kept to exactly this one job — provide and export `PARTNER_MEMBERSHIP_WRITER`
 * — rather than folded into `PartnerModule` itself, so nothing else this module
 * provides leaks globally by accident. It builds its own
 * `PrismaPartnerStaffRepository` instance rather than reusing `PartnerModule`'s
 * (that class takes no constructor dependencies, so a second instance costs
 * nothing) to avoid exporting `PARTNER_STAFF_REPOSITORY` globally too.
 */
@Global()
@Module({
  providers: [
    PrismaPartnerStaffRepository,
    { provide: PARTNER_STAFF_REPOSITORY, useExisting: PrismaPartnerStaffRepository },
    { provide: PARTNER_MEMBERSHIP_WRITER, useClass: PartnerMembershipWriterAdapter },
  ],
  exports: [PARTNER_MEMBERSHIP_WRITER],
})
export class PartnerMembershipWriterModule {}
