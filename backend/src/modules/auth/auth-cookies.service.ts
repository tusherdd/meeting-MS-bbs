import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import { EnvVars } from '../../config/env.validation';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_COOKIE_PATH,
  REFRESH_TOKEN_COOKIE,
} from './auth.constants';
import type { TokenPair } from './token.service';

/**
 * Auth cookies (SPEC.md §9.4): httpOnly (JavaScript cannot read them), secure in production,
 * access = sameSite lax on "/", refresh = sameSite strict and only sent to /api/v1/auth.
 */
@Injectable()
export class AuthCookiesService {
  private readonly secure: boolean;

  constructor(config: ConfigService<EnvVars, true>) {
    this.secure = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  private accessOptions(): CookieOptions {
    return { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/' };
  }

  private refreshOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.secure,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
    };
  }

  set(res: Response, pair: TokenPair): void {
    res.cookie(ACCESS_TOKEN_COOKIE, pair.accessToken, {
      ...this.accessOptions(),
      maxAge: pair.accessExpiresIn * 1000,
    });
    res.cookie(REFRESH_TOKEN_COOKIE, pair.refreshToken, {
      ...this.refreshOptions(),
      maxAge: pair.refreshExpiresIn * 1000,
    });
  }

  clear(res: Response): void {
    res.clearCookie(ACCESS_TOKEN_COOKIE, this.accessOptions());
    res.clearCookie(REFRESH_TOKEN_COOKIE, this.refreshOptions());
  }
}
