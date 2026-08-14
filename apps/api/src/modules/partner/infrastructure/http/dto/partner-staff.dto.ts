import { createZodDto } from 'nestjs-zod';
import { invitePartnerMemberInputSchema, setPartnerMemberRolesInputSchema } from '@booking/contracts';

// ── Request bodies ──────────────────────────────────────────────────────────
export class InvitePartnerMemberDto extends createZodDto(invitePartnerMemberInputSchema) {}
export class SetPartnerMemberRolesDto extends createZodDto(setPartnerMemberRolesInputSchema) {}
