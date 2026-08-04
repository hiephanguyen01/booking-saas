import type {
  AuthChallengeResponse,
  AuthFlowCompleteResponse,
  AuthOtpVerifiedResponse,
  AuthSessionResponse,
  CurrentUser,
  RefreshResponse,
  SessionInfoResponse,
} from '@booking/contracts';
import { Body, Controller, Get, HttpCode, Ip, Patch, Post, Req, Res } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ChangeMyPasswordUseCase } from '../../application/use-cases/change-my-password.use-case';
import { GetSessionInfoUseCase } from '../../application/use-cases/get-session-info.use-case';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { UpdateMyProfileUseCase } from '../../application/use-cases/update-my-profile.use-case';
import { LogoutUseCase } from '../../application/use-cases/logout.use-case';
import { RefreshSessionUseCase } from '../../application/use-cases/refresh-session.use-case';
import { RegisterUseCase } from '../../application/use-cases/register.use-case';
import { UpgradeGuestUseCase } from '../../application/use-cases/upgrade-guest.use-case';
import { CompletePasswordResetUseCase } from '../../application/use-cases/complete-password-reset.use-case';
import { CompleteRegistrationUseCase } from '../../application/use-cases/complete-registration.use-case';
import { ResendPasswordResetUseCase } from '../../application/use-cases/resend-password-reset.use-case';
import { ResendRegistrationUseCase } from '../../application/use-cases/resend-registration.use-case';
import { StartPasswordResetUseCase } from '../../application/use-cases/start-password-reset.use-case';
import { StartRegistrationUseCase } from '../../application/use-cases/start-registration.use-case';
import { VerifyPasswordResetUseCase } from '../../application/use-cases/verify-password-reset.use-case';
import { VerifyRegistrationUseCase } from '../../application/use-cases/verify-registration.use-case';
import type { SessionPrincipal, SessionTokens } from '../../domain/ports/session-store.port';
import type { UserRecord } from '../../domain/ports/user-repository.port';
import { toCurrentUser } from '../../application/user-account.mapper';
import { clearSessionCookies, REFRESH_COOKIE, setSessionCookies } from './cookies';
import { AuthenticatedOnly } from './decorators/authenticated-only.decorator';
import { CurrentPrincipal } from './decorators/current-principal.decorator';
import { Public } from './decorators/public.decorator';
import {
  AuthSessionResponseDto,
  AuthChallengeDto,
  AuthChallengeResponseDto,
  AuthFlowCompleteResponseDto,
  AuthOtpVerifiedResponseDto,
  AuthOtpVerifyDto,
  AuthPasswordCompleteDto,
  ChangeMyPasswordDto,
  CurrentUserDto,
  LoginDto,
  RefreshResponseDto,
  RegisterDto,
  RegistrationStartDto,
  PasswordResetStartDto,
  SessionInfoResponseDto,
  UpdateMyProfileDto,
  UpgradeGuestDto,
} from './dto/auth.dto';

function toResponse(user: UserRecord, tokens: SessionTokens): AuthSessionResponse {
  return {
    user: toCurrentUser(user),
    accessExpiresAt: tokens.accessExpiresAt.toISOString(),
  };
}

/** The principal already carries every `CurrentUser` field, refreshed per request. */
function principalUser(principal: SessionPrincipal): CurrentUser {
  return {
    id: principal.userId,
    email: principal.email,
    fullName: principal.fullName,
    phone: principal.phone,
    avatarUrl: principal.avatarUrl,
    locale: principal.locale as CurrentUser['locale'],
    status: principal.status as CurrentUser['status'],
  };
}

@ApiTags('auth')
@Controller('auth')
export class PublicAuthController {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshUseCase: RefreshSessionUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly getSessionInfoUseCase: GetSessionInfoUseCase,
    private readonly upgradeGuestUseCase: UpgradeGuestUseCase,
    private readonly startRegistrationUseCase: StartRegistrationUseCase,
    private readonly resendRegistrationUseCase: ResendRegistrationUseCase,
    private readonly verifyRegistrationUseCase: VerifyRegistrationUseCase,
    private readonly completeRegistrationUseCase: CompleteRegistrationUseCase,
    private readonly startPasswordResetUseCase: StartPasswordResetUseCase,
    private readonly resendPasswordResetUseCase: ResendPasswordResetUseCase,
    private readonly verifyPasswordResetUseCase: VerifyPasswordResetUseCase,
    private readonly completePasswordResetUseCase: CompletePasswordResetUseCase,
    private readonly updateMyProfileUseCase: UpdateMyProfileUseCase,
    private readonly changeMyPasswordUseCase: ChangeMyPasswordUseCase,
  ) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('registration/start')
  @HttpCode(200)
  @ApiOkResponse({ type: AuthChallengeResponseDto })
  startRegistration(@Body() input: RegistrationStartDto): Promise<AuthChallengeResponse> {
    return this.startRegistrationUseCase.execute(input);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post('registration/resend')
  @HttpCode(200)
  @ApiOkResponse({ type: AuthChallengeResponseDto })
  resendRegistration(@Body() input: AuthChallengeDto): Promise<AuthChallengeResponse> {
    return this.resendRegistrationUseCase.execute(input);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('registration/verify')
  @HttpCode(200)
  @ApiOkResponse({ type: AuthOtpVerifiedResponseDto })
  verifyRegistration(@Body() input: AuthOtpVerifyDto): Promise<AuthOtpVerifiedResponse> {
    return this.verifyRegistrationUseCase.execute(input);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('registration/complete')
  @HttpCode(200)
  @ApiOkResponse({ type: AuthFlowCompleteResponseDto })
  completeRegistration(
    @Body() input: AuthPasswordCompleteDto,
    @Ip() ip: string,
  ): Promise<AuthFlowCompleteResponse> {
    return this.completeRegistrationUseCase.execute(input, { ip });
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('password-reset/start')
  @HttpCode(200)
  @ApiOkResponse({ type: AuthChallengeResponseDto })
  startPasswordReset(@Body() input: PasswordResetStartDto): Promise<AuthChallengeResponse> {
    return this.startPasswordResetUseCase.execute(input);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post('password-reset/resend')
  @HttpCode(200)
  @ApiOkResponse({ type: AuthChallengeResponseDto })
  resendPasswordReset(@Body() input: AuthChallengeDto): Promise<AuthChallengeResponse> {
    return this.resendPasswordResetUseCase.execute(input);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('password-reset/verify')
  @HttpCode(200)
  @ApiOkResponse({ type: AuthOtpVerifiedResponseDto })
  verifyPasswordReset(@Body() input: AuthOtpVerifyDto): Promise<AuthOtpVerifiedResponse> {
    return this.verifyPasswordResetUseCase.execute(input);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('password-reset/complete')
  @HttpCode(200)
  @ApiOkResponse({ type: AuthFlowCompleteResponseDto })
  completePasswordReset(@Body() input: AuthPasswordCompleteDto): Promise<AuthFlowCompleteResponse> {
    return this.completePasswordResetUseCase.execute(input);
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new account and start a session' })
  @ApiOkResponse({ type: AuthSessionResponseDto })
  async register(
    @Body() input: RegisterDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
    @Ip() ip: string,
  ): Promise<AuthSessionResponse> {
    const { user, tokens } = await this.registerUseCase.execute(input, {
      ip,
      userAgent: req.headers['user-agent'],
    });
    setSessionCookies(res, tokens);
    return toResponse(user, tokens);
  }

  /**
   * Guest upgrade-to-account (§8.6): a passwordless guest sets a password and is
   * signed in. Public (the guest isn't logged in) and throttled like login;
   * refuses an email that already owns a password account.
   */
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('upgrade-guest')
  @HttpCode(200)
  @ApiOperation({ summary: 'Set a password on a guest account and sign in' })
  @ApiOkResponse({ type: AuthSessionResponseDto })
  async upgradeGuest(
    @Body() input: UpgradeGuestDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
    @Ip() ip: string,
  ): Promise<AuthSessionResponse> {
    const { user, tokens } = await this.upgradeGuestUseCase.execute(input, {
      ip,
      userAgent: req.headers['user-agent'],
    });
    setSessionCookies(res, tokens);
    return toResponse(user, tokens);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log in with email + password' })
  @ApiOkResponse({ type: AuthSessionResponseDto })
  async login(
    @Body() input: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
    @Ip() ip: string,
  ): Promise<AuthSessionResponse> {
    const { user, tokens } = await this.loginUseCase.execute(input, {
      ip,
      userAgent: req.headers['user-agent'],
    });
    setSessionCookies(res, tokens);
    return toResponse(user, tokens);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate the session using the refresh cookie' })
  @ApiOkResponse({ type: RefreshResponseDto })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RefreshResponse> {
    const tokens = await this.refreshUseCase.execute(req.cookies?.[REFRESH_COOKIE]);
    setSessionCookies(res, tokens);
    return { accessExpiresAt: tokens.accessExpiresAt.toISOString() };
  }

  @AuthenticatedOnly()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'End the current session and clear session cookies' })
  @ApiNoContentResponse()
  async logout(
    @CurrentPrincipal() principal: SessionPrincipal,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.logoutUseCase.execute(principal.sessionId);
    clearSessionCookies(res);
  }

  @AuthenticatedOnly()
  @Get('me')
  @ApiOperation({ summary: 'Current user identity' })
  @ApiOkResponse({ type: CurrentUserDto })
  me(@CurrentPrincipal() principal: SessionPrincipal): CurrentUser {
    return principalUser(principal);
  }

  /**
   * Self-service profile edit (§8.6): name, phone and photo. Email stays out —
   * it is the login identity and would need its own verified change flow.
   */
  @AuthenticatedOnly()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Patch('me')
  @ApiOperation({ summary: 'Update the signed-in user’s own profile' })
  @ApiOkResponse({ type: CurrentUserDto })
  updateMe(
    @CurrentPrincipal() principal: SessionPrincipal,
    @Body() input: UpdateMyProfileDto,
  ): Promise<CurrentUser> {
    return this.updateMyProfileUseCase.execute(principal.userId, input);
  }

  /**
   * Password change for a signed-in user: proves the current password, then
   * signs every *other* device out. The calling session survives, so the tab
   * that made the change is not logged out of itself.
   */
  @AuthenticatedOnly()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('me/password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Change the signed-in user’s password' })
  @ApiOkResponse({ type: AuthFlowCompleteResponseDto })
  async changeMyPassword(
    @CurrentPrincipal() principal: SessionPrincipal,
    @Body() input: ChangeMyPasswordDto,
  ): Promise<AuthFlowCompleteResponse> {
    await this.changeMyPasswordUseCase.execute(
      { userId: principal.userId, sessionId: principal.sessionId },
      input,
    );
    return { success: true };
  }

  /** Identity + every scope membership with resolved permissions (dashboard shell gating). */
  @AuthenticatedOnly()
  @Get('session')
  @ApiOperation({ summary: 'Identity + every scope membership with resolved permissions' })
  @ApiOkResponse({ type: SessionInfoResponseDto })
  async session(@CurrentPrincipal() principal: SessionPrincipal): Promise<SessionInfoResponse> {
    const scopes = await this.getSessionInfoUseCase.execute(principal.userId);
    return { user: principalUser(principal), scopes };
  }
}
