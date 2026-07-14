import { createZodDto } from 'nestjs-zod';
import {
  authSessionResponseSchema,
  currentUserSchema,
  loginInputSchema,
  refreshResponseSchema,
  registerInputSchema,
  sessionInfoResponseSchema,
  upgradeGuestInputSchema,
} from '@booking/contracts';

// Request bodies
export class RegisterDto extends createZodDto(registerInputSchema) {}
export class LoginDto extends createZodDto(loginInputSchema) {}
export class UpgradeGuestDto extends createZodDto(upgradeGuestInputSchema) {}

// Responses
export class AuthSessionResponseDto extends createZodDto(authSessionResponseSchema) {}
export class CurrentUserDto extends createZodDto(currentUserSchema) {}
export class SessionInfoResponseDto extends createZodDto(sessionInfoResponseSchema) {}
export class RefreshResponseDto extends createZodDto(refreshResponseSchema) {}
