import { createZodDto } from 'nestjs-zod';
import {
  createTenantRoleInputSchema,
  inviteTenantMemberInputSchema,
  setTenantMemberRolesInputSchema,
  updateTenantRoleInputSchema,
} from '@booking/contracts';

// ── Request bodies ──────────────────────────────────────────────────────────
export class CreateTenantRoleDto extends createZodDto(createTenantRoleInputSchema) {}
export class UpdateTenantRoleDto extends createZodDto(updateTenantRoleInputSchema) {}
export class SetTenantMemberRolesDto extends createZodDto(setTenantMemberRolesInputSchema) {}
export class InviteTenantMemberDto extends createZodDto(inviteTenantMemberInputSchema) {}
