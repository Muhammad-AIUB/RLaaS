import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthThrottlerGuard } from './guards/auth-throttler.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

@Global()
@Module({
  imports: [
    AuditModule,
    UsersModule,
    PassportModule,
    /**
     * Per-IP budget for the unauthenticated auth routes.
     *
     * There was none. No throttler, no attempt counter, no lockout anywhere in
     * the backend, on a product whose entire purpose is rate limiting. That
     * left unlimited credential stuffing on /auth/login and, worse, unlimited
     * guesses at the 6-digit password reset code (see AuthService.resetPassword).
     *
     * 10 requests per minute per IP is generous for a human signing in and
     * useless for a brute force: it turns a 900,000-code space from hours into
     * roughly 170 years from one address. It is the outer bound; the reset flow
     * additionally burns its code after a handful of misses, so an attacker
     * spreading across many IPs still does not get unlimited guesses at one code.
     */
    ThrottlerModule.forRoot([
      { name: 'auth', ttl: 60_000, limit: 10 },
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        // No default: an unset JWT_SECRET must stop the process, not sign
        // tokens with a value published in this repository. AppModule's
        // validateEnv catches it first; this is the second line of defence.
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (configService.get<string>('JWT_EXPIRES_IN') ?? '1d') as never,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, AuthThrottlerGuard],
  exports: [AuthService, JwtAuthGuard, JwtModule, PassportModule],
})
export class AuthModule {}
