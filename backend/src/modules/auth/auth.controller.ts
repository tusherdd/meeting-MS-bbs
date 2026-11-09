import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AllowPendingPasswordChange } from '../../common/decorators/allow-pending-password-change.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AppRequest, AuthUser } from '../../common/types/auth-user';
import { AuthCookiesService } from './auth-cookies.service';
import { AUTH_THROTTLE, REFRESH_TOKEN_COOKIE } from './auth.constants';
import { AUTH_MESSAGES } from './auth.messages';
import { AuthService } from './auth.service';
import {
  AccessTokenResponseDto,
  ChangePasswordResponseDto,
  LoginResponseDto,
  MeResponseDto,
  MessageResponseDto,
} from './dto/auth-responses.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PasswordTokenPurpose } from './enums/password-token-purpose.enum';
import type { RequestMeta, TokenPair } from './token.service';

function requestMeta(req: AppRequest): RequestMeta {
  return { ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
}

function tokenBody(pair: TokenPair): AccessTokenResponseDto {
  return {
    accessToken: pair.accessToken,
    tokenType: 'Bearer',
    expiresIn: pair.accessExpiresIn,
  };
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: AuthCookiesService,
  ) {}

  @Public()
  @Throttle(AUTH_THROTTLE.login)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in',
    description: [
      'Sets httpOnly cookies and returns the access token. In Swagger: copy `accessToken` → "Authorize".',
      '',
      '**No account lock.** After 5 consecutive failures for an email, every further attempt is answered',
      'only after a delay: 2 s, 4 s, 8 s, 16 s, then 30 s (max). The delay applies before the password is',
      'checked (also to a correct one) and equally to emails without an account. A successful login',
      'resets the counter.',
    ].join('\n'),
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiBadRequestResponse({ description: 'Validation error' })
  @ApiUnauthorizedResponse({
    description:
      'Wrong email or password. Same message for every failure (known or unknown email), always suggesting "forgot password".',
  })
  @ApiForbiddenResponse({ description: 'Account deactivated' })
  @ApiTooManyRequestsResponse({
    description: 'Too many login requests from this IP',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const { pair, user } = await this.auth.login(dto, requestMeta(req));
    this.cookies.set(res, pair);
    return {
      ...tokenBody(pair),
      mustChangePassword: user.mustChangePassword,
      user,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate the refresh token (from the refresh_token cookie)',
    description:
      'The old refresh token becomes invalid. Re-using an old one logs the user out everywhere.',
  })
  @ApiOkResponse({ type: AccessTokenResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Missing, expired, revoked or reused refresh token',
  })
  @ApiForbiddenResponse({
    description: 'Cookie request from a non-allowed Origin',
  })
  async refresh(
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponseDto> {
    const pair = await this.auth.refresh(
      req.cookies?.[REFRESH_TOKEN_COOKIE],
      requestMeta(req),
    );
    this.cookies.set(res, pair);
    return tokenBody(pair);
  }

  @AllowPendingPasswordChange()
  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log out: revoke this refresh token and clear cookies',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  async logout(
    @CurrentUser() user: AuthUser,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MessageResponseDto> {
    await this.auth.logout(user.id, req.cookies?.[REFRESH_TOKEN_COOKIE]);
    this.cookies.clear(res);
    return { message: AUTH_MESSAGES.loggedOut };
  }

  @AllowPendingPasswordChange()
  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Current user with role, designation and priority' })
  @ApiOkResponse({ type: MeResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  me(@CurrentUser() user: AuthUser): Promise<MeResponseDto> {
    return this.auth.getMe(user.id);
  }

  @AllowPendingPasswordChange()
  @ApiBearerAuth()
  @Throttle(AUTH_THROTTLE.changePassword)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change own password (clears mustChangePassword)',
    description:
      'Ends all other sessions and returns a NEW access token — use it in "Authorize" from now on.',
  })
  @ApiOkResponse({ type: ChangePasswordResponseDto })
  @ApiBadRequestResponse({
    description: 'Wrong current password or weak new password',
  })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ChangePasswordResponseDto> {
    const pair = await this.auth.changePassword(user.id, dto, requestMeta(req));
    this.cookies.set(res, pair);
    return { ...tokenBody(pair), message: AUTH_MESSAGES.passwordChanged };
  }

  @Public()
  @Throttle(AUTH_THROTTLE.forgotPassword)
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a reset link to the notification email',
    description:
      'Always returns 200 with the same message (does not reveal if the email exists).',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiTooManyRequestsResponse({ description: 'Too many requests from this IP' })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() req: AppRequest,
  ): Promise<MessageResponseDto> {
    await this.auth.forgotPassword(dto, requestMeta(req));
    return { message: AUTH_MESSAGES.forgotPasswordSent };
  }

  @Public()
  @Throttle(AUTH_THROTTLE.resetPassword)
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set a password with the token from a mail link',
    description:
      'Accepts the token of /reset-password links ("forgot password", admin reset) and of ' +
      '/set-password links (new account). Single use.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid/expired/used token or weak password',
  })
  @ApiTooManyRequestsResponse({ description: 'Too many requests from this IP' })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() req: AppRequest,
  ): Promise<MessageResponseDto> {
    const purpose = await this.auth.resetPassword(dto, requestMeta(req));
    return {
      message:
        purpose === PasswordTokenPurpose.SET_INITIAL
          ? AUTH_MESSAGES.passwordSet
          : AUTH_MESSAGES.passwordReset,
    };
  }
}
