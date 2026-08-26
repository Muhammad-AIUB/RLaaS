import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserTier } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { randomInt } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { AuthResponse } from '../common/interfaces/auth-response.interface';
import { RequestMetadata } from '../common/interfaces/request-metadata.interface';
import { RedisService } from '../redis/redis.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UsersService } from '../users/users.service';

const RESET_CODE_TTL = 600; // 10 minutes

/**
 * Same body whether or not the email is registered, so the endpoint stays
 * non-enumerable. The code itself is never part of it.
 */
const RESET_REQUEST_ACCEPTED = {
  message:
    'If that email is registered, a reset code has been issued. It expires in 10 minutes.',
  expiresInSeconds: RESET_CODE_TTL,
} as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
    private readonly redisService: RedisService,
  ) {}

  async register(dto: RegisterDto, request?: RequestMetadata): Promise<AuthResponse> {
    const existingUser = await this.usersService.findByEmail(dto.email);

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await hash(dto.password, 8);
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      tier: dto.tier ?? UserTier.FREE,
    });

    void this.auditService.log({
      action: 'auth.registered',
      actorId: user.id,
      resourceType: 'user',
      resourceId: user.id,
      metadata: {
        email: user.email,
      },
      request,
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto, request?: RequestMetadata): Promise<AuthResponse> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await compare(dto.password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    void this.auditService.log({
      action: 'auth.logged_in',
      actorId: user.id,
      resourceType: 'user',
      resourceId: user.id,
      metadata: {
        email: user.email,
      },
      request,
    });

    return this.buildAuthResponse(user);
  }

  /**
   * Issues a password reset code.
   *
   * The code is NOT returned to the caller: this route is unauthenticated, so
   * anything in the response body is readable by whoever asked, and together
   * with `resetPassword` that is a complete account takeover by email address.
   * The code exists only in Redis under `pwd_reset:{email}`.
   *
   * There is no email transport in this codebase, so outside production the
   * code can be written to the server log to keep the flow testable — opt-in,
   * and refused in production even if the flag is set.
   */
  async forgotPassword(
    dto: ForgotPasswordDto,
  ): Promise<{ message: string; expiresInSeconds: number }> {
    const user = await this.usersService.findByEmail(dto.email);

    // Always return success to prevent email enumeration
    if (!user || !user.isActive) {
      return { ...RESET_REQUEST_ACCEPTED };
    }

    const code = this.generateResetCode();
    const key = `pwd_reset:${dto.email.toLowerCase()}`;

    await this.redisService.getClient().setex(key, RESET_CODE_TTL, code);

    if (this.resetCodeLoggingEnabled()) {
      this.logger.warn(
        `AUTH_LOG_RESET_CODE is on: reset code for ${dto.email} is ${code} (valid ${RESET_CODE_TTL}s)`,
      );
    }

    return { ...RESET_REQUEST_ACCEPTED };
  }

  /**
   * `randomInt` is the CSPRNG from node:crypto. It rejection-samples internally,
   * so the six digits are uniform; `randomBytes(3) % 900000` would not be.
   */
  private generateResetCode(): string {
    return String(randomInt(100_000, 1_000_000));
  }

  private resetCodeLoggingEnabled(): boolean {
    return (
      process.env.NODE_ENV !== 'production' &&
      process.env.AUTH_LOG_RESET_CODE === 'true'
    );
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const key = `pwd_reset:${dto.email.toLowerCase()}`;
    const storedCode = await this.redisService.getClient().get(key);

    if (!storedCode || storedCode !== dto.code) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.isActive) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    const passwordHash = await hash(dto.newPassword, 8);
    await this.usersService.updatePassword(dto.email, passwordHash);

    // Invalidate the code after successful reset
    await this.redisService.getClient().del(key);

    void this.auditService.log({
      action: 'auth.password_reset',
      actorId: user.id,
      resourceType: 'user',
      resourceId: user.id,
      metadata: { email: user.email },
    });

    return { message: 'Password reset successfully' };
  }

  private async buildAuthResponse(user: {
    id: string;
    email: string;
    fullName: string;
    passwordHash: string;
    tier: UserTier;
    createdAt: Date;
    updatedAt: Date;
  }): Promise<AuthResponse> {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      tier: user.tier,
    });

    return {
      accessToken,
      user: this.usersService.toProfile(user),
    };
  }
}
