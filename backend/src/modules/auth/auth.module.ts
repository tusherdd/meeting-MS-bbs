import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { AuthCookiesService } from './auth-cookies.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { LoginAttemptService } from './login-attempt.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    // Secrets are passed per call (access and refresh use different secrets).
    JwtModule.register({}),
    TypeOrmModule.forFeature([User, RefreshToken, PasswordResetToken]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    LoginAttemptService,
    AuthCookiesService,
  ],
  // The global guards (registered in AppModule) need JwtService and the User repository.
  // TokenService: other modules end sessions (user deactivation, admin password reset).
  exports: [JwtModule, TypeOrmModule, TokenService],
})
export class AuthModule {}
