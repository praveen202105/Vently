import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator.js';
import { AuthService, type IssuedTokens, type PublicUser } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';

const REFRESH_COOKIE = 'vently_refresh';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @Throttle({
    medium: {
      limit: process.env.NODE_ENV === 'production' ? 10 : 1000,
      ttl: 60_000,
    },
  })
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.auth.register(dto.email, dto.password);
    this.setRefreshCookie(res, tokens);
    return this.shapeAuthResponse(user, tokens);
  }

  @Public()
  @Post('login')
  @Throttle({
    medium: {
      limit: process.env.NODE_ENV === 'production' ? 10 : 1000,
      ttl: 60_000,
    },
  })
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.auth.login(dto.email, dto.password);
    this.setRefreshCookie(res, tokens);
    return this.shapeAuthResponse(user, tokens);
  }

  @Public()
  @Post('refresh')
  @Throttle({ medium: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (!refreshToken) throw new UnauthorizedException('Missing refresh cookie');

    const tokens = await this.auth.refresh(refreshToken);
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    await this.auth.logout(refreshToken);
    this.clearRefreshCookie(res);
  }

  // ─── helpers ──────────────────────────────────────────────────────────

  private setRefreshCookie(res: Response, tokens: IssuedTokens) {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    // In production the api lives on a different eTLD+1 than the web (e.g.
    // *.railway.app vs *.vercel.app), so the browser needs SameSite=None to
    // include the cookie on cross-site fetch from the web app. None requires
    // Secure (HTTPS), which Railway provides. Locally we stay on Lax so dev
    // works without HTTPS.
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      domain: this.config.get<string>('COOKIE_DOMAIN') || undefined,
      path: '/',
      expires: tokens.refreshExpiresAt,
    });
  }

  private clearRefreshCookie(res: Response) {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    res.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      domain: this.config.get<string>('COOKIE_DOMAIN') || undefined,
      path: '/',
    });
  }

  private shapeAuthResponse(user: PublicUser, tokens: IssuedTokens) {
    return {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      },
    };
  }
}
