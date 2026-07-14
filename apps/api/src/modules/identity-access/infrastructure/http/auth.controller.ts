import { Body, Controller, Get, HttpCode, Ip, Post, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { type AuthSessionResponse, type SessionInfoResponse } from '@booking/shared';
import type { SessionPrincipal, SessionTokens } from '../../domain/ports/session-store.port';
import type { UserRecord } from '../../domain/ports/user-repository.port';
import {
  AuthSessionResponseDto,
  CurrentUserDto,
  LoginDto,
  RefreshResponseDto,
  RegisterDto,
  SessionInfoResponseDto,
  UpgradeGuestDto,
} from './dto/auth.dto';
import { GetSessionInfoUseCase } from '../../application/use-cases/get-session-info.use-case';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { LogoutUseCase } from '../../application/use-cases/logout.use-case';
import { RefreshSessionUseCase } from '../../application/use-cases/refresh-session.use-case';
import { RegisterUseCase } from '../../application/use-cases/register.use-case';
import { UpgradeGuestUseCase } from '../../application/use-cases/upgrade-guest.use-case';
import { clearSessionCookies, REFRESH_COOKIE, setSessionCookies } from './cookies';
import { AuthenticatedOnly } from './decorators/authenticated-only.decorator';
import { CurrentPrincipal } from './decorators/current-principal.decorator';
import { Public } from './decorators/public.decorator';

function toResponse(user: UserRecord, tokens: SessionTokens): AuthSessionResponse {
  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      locale: user.locale as 'vi' | 'en',
      status: user.status,
    },
    accessExpiresAt: tokens.accessExpiresAt.toISOString(),
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshUseCase: RefreshSessionUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly getSessionInfoUseCase: GetSessionInfoUseCase,
    private readonly upgradeGuestUseCase: UpgradeGuestUseCase,
  ) {}

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
  ): Promise<{ accessExpiresAt: string }> {
    const tokens = await this.refreshUseCase.execute(req.cookies?.[REFRESH_COOKIE]);
    setSessionCookies(res, tokens);
    return { accessExpiresAt: tokens.accessExpiresAt.toISOString() };
  }

  @AuthenticatedOnly()
  @Post('logout')
  @HttpCode(204)
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
  me(@CurrentPrincipal() principal: SessionPrincipal) {
    return {
      id: principal.userId,
      email: principal.email,
      fullName: principal.fullName,
      phone: principal.phone,
      locale: principal.locale,
      status: principal.status,
    };
  }

  /** Identity + every scope membership with resolved permissions (dashboard shell gating). */
  @AuthenticatedOnly()
  @Get('session')
  @ApiOperation({ summary: 'Identity + every scope membership with resolved permissions' })
  @ApiOkResponse({ type: SessionInfoResponseDto })
  async session(@CurrentPrincipal() principal: SessionPrincipal): Promise<SessionInfoResponse> {
    const scopes = await this.getSessionInfoUseCase.execute(principal.userId);
    return {
      user: {
        id: principal.userId,
        email: principal.email,
        fullName: principal.fullName,
        phone: principal.phone,
        locale: principal.locale as 'vi' | 'en',
        status: principal.status as 'active' | 'suspended',
      },
      scopes,
    };
  }
}
