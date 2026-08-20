import { Global, Module } from '@nestjs/common';
import { PARTNER_MEMBERSHIP_WRITER } from '../../../identity-access/domain/ports/partner-membership-writer.port';
import { PARTNER_ROLE_READER } from '../../../identity-access/domain/ports/partner-role-reader.port';
import { PARTNER_STAFF_REPOSITORY } from '../../domain/ports/partner-staff-repository.port';
import { PrismaPartnerStaffRepository } from '../repositories/prisma-partner-staff.repository';
import { PartnerMembershipWriterAdapter } from '../services/partner-membership-writer.adapter';
import { PartnerRoleReaderAdapter } from '../services/partner-role-reader.adapter';

/**
 * Exists solely to hand identity-access's shared invitation flow the two
 * partner-scope ports it needs, without identity-access ever importing this
 * (or any) module from `partner`: `PARTNER_MEMBERSHIP_WRITER` (write — used by
 * `AcceptTenantInvitationUseCase`) and `PARTNER_ROLE_READER` (read — used by
 * `GetInvitationPreviewUseCase`). Both exist for the identical cross-module
 * reason, so they are wired here together rather than duplicating this
 * module's whole doc comment a second time for one extra provider pair.
 *
 * The direct route — `IdentityAccessModule` importing `PartnerModule` to receive
 * these tokens — closes a cycle: `partner` already imports `identity-access`
 * directly, AND transitively via `administrative-division`, `legal` and
 * `tenancy` (all three import identity-access for guards/decorators), so one
 * `identity-access → partner` edge produces four cycles at once.
 * The module-cycle guard is a static scan of import statements — it has no
 * notion of Nest's runtime DI graph, so wrapping the import in `forwardRef()`
 * does not remove the statement the scanner flags; its own failure text says
 * "Do not add forwardRef()".
 *
 * `@Global()` sidesteps the file-level edge entirely: once this module is
 * instantiated anywhere in the graph (it is, via `PartnerModule`'s own
 * `imports`), Nest publishes everything in `exports` to every module in the
 * application without any of them importing it. Both use-cases inject their
 * port with zero import from `partner` — the file-level graph keeps its single
 * direction, partner → identity-access.
 *
 * Kept to exactly this job — provide and export the ports identity-access's
 * shared invitation flow needs — rather than folded into `PartnerModule`
 * itself, so nothing else this module provides leaks globally by accident. It
 * builds its own `PrismaPartnerStaffRepository` instance rather than reusing
 * `PartnerModule`'s (that class takes no constructor dependencies, so a second
 * instance costs nothing) to avoid exporting `PARTNER_STAFF_REPOSITORY`
 * globally too.
 */
@Global()
@Module({
  providers: [
    PrismaPartnerStaffRepository,
    { provide: PARTNER_STAFF_REPOSITORY, useExisting: PrismaPartnerStaffRepository },
    { provide: PARTNER_MEMBERSHIP_WRITER, useClass: PartnerMembershipWriterAdapter },
    { provide: PARTNER_ROLE_READER, useClass: PartnerRoleReaderAdapter },
  ],
  exports: [PARTNER_MEMBERSHIP_WRITER, PARTNER_ROLE_READER],
})
export class PartnerMembershipWriterModule {}
