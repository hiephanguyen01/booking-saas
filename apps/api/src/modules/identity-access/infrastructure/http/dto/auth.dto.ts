import { createZodDto } from 'nestjs-zod';
import {
  authSessionResponseSchema,
  authChallengeInputSchema,
  authChallengeResponseSchema,
  authFlowCompleteResponseSchema,
  authOtpVerifiedResponseSchema,
  authOtpVerifyInputSchema,
  authPasswordCompleteInputSchema,
  currentUserSchema,
  loginInputSchema,
  passwordResetStartInputSchema,
  refreshResponseSchema,
  registerInputSchema,
  registrationStartInputSchema,
  sessionInfoResponseSchema,
  upgradeGuestInputSchema,
} from '@booking/contracts';

// Request bodies
export class RegisterDto extends createZodDto(registerInputSchema) {}
export class LoginDto extends createZodDto(loginInputSchema) {}
export class UpgradeGuestDto extends createZodDto(upgradeGuestInputSchema) {}
export class RegistrationStartDto extends createZodDto(registrationStartInputSchema) {}
export class PasswordResetStartDto extends createZodDto(passwordResetStartInputSchema) {}
export class AuthChallengeDto extends createZodDto(authChallengeInputSchema) {}
export class AuthOtpVerifyDto extends createZodDto(authOtpVerifyInputSchema) {}
export class AuthPasswordCompleteDto extends createZodDto(authPasswordCompleteInputSchema) {}

// Responses
export class AuthSessionResponseDto extends createZodDto(authSessionResponseSchema) {}
export class CurrentUserDto extends createZodDto(currentUserSchema) {}
export class SessionInfoResponseDto extends createZodDto(sessionInfoResponseSchema) {}
export class RefreshResponseDto extends createZodDto(refreshResponseSchema) {}
export class AuthChallengeResponseDto extends createZodDto(authChallengeResponseSchema) {}
export class AuthOtpVerifiedResponseDto extends createZodDto(authOtpVerifiedResponseSchema) {}
export class AuthFlowCompleteResponseDto extends createZodDto(authFlowCompleteResponseSchema) {}
