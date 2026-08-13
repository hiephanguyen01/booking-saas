import { createZodDto } from 'nestjs-zod';
import { createTenantRoleInputSchema, updateTenantRoleInputSchema } from '@booking/contracts';

// ── Request bodies ──────────────────────────────────────────────────────────
export class CreateTenantRoleDto extends createZodDto(createTenantRoleInputSchema) {}
export class UpdateTenantRoleDto extends createZodDto(updateTenantRoleInputSchema) {}
