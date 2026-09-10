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
 * bcrypt work factor, chosen for the hardware this runs on.
 *
 * 8 was too low: below current guidance (10-12) and cheap to attack offline,
 * with a register DTO that asks only for MinLength(8) and no complexity.
 *
 * 12 was too high FOR THIS BOX, which is the part that is easy to miss. The
 * API runs on a Render free instance at 0.1 vCPU. Measured on the deployed
 * service:
 *
 *   login, unknown email (no hash runs)     ~250-380ms
 *   login, real account at cost 12       2,409-2,760ms
 *   register at cost 12                     2,374ms
 *
 * So one hash cost ~2.1s of CPU. bcryptjs is pure JavaScript, so that work
 * lands on the same thread that serves every other request: /health, which
 * touches nothing but Redis, went from 234ms to 727ms p50 (3.1x) while a
 * single password was being hashed. One person signing in slowed the whole
 * API down.
 *
 * It is also more CPU than the instance has. 0.1 vCPU is ~6 seconds of CPU per
 * minute; the login throttle allows 10 attempts per minute per IP, which at
 * cost 12 demands ~21 seconds. A single address could saturate the box just by
 * failing to log in.
 *
 * 10 is the low end of guidance and 4x cheaper: ~490ms of CPU per hash here,
 * and ~4.9s per minute against a 6s budget. If this ever moves to a plan with
 * a real CPU allocation, raise it back to 12 — the number is a function of the
 * hardware, not of the password policy.
 */
const BCRYPT_COST = 10;

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
      /**
       * This 409 is an email oracle, and it cannot stop being one while
       * register hands back an access token — see the note on the controller.
       * Since it has to leak, make the leaking visible: a run of these from
       * one address is somebody enumerating accounts, and without a record
       * there is nothing to notice it by.
       *
       * `actorId` is left unset on purpose. The caller proved nothing about
       * owning this address, so attributing the event to its owner would put
       * a stranger's activity on their timeline.
       */
      void this.auditService.log({
        action: 'auth.register_conflict',
        resourceType: 'user',
        resourceId: existingUser.id,
        metadata: { email: dto.email },
        request,
      });

      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await hash(dto.password, BCRYPT_COST);
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
      this.recordFailedLogin(dto.email, request);
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await compare(dto.password, user.passwordHash);

    if (!passwordMatches) {
      this.recordFailedLogin(dto.email, request, user.id);
      throw new UnauthorizedException('Invalid credentials');
    }

    // The password is in hand and already verified: the only moment an old
    // hash can be upgraded without asking the user for anything.
    void this.rehashIfOutdatedCost(user.email, user.passwordHash, dto.password);

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
   * Re-hashes a password that was stored with a weaker work factor.
   *
   * bcrypt encodes its cost in the hash string as `$2<x>$<cost>$...`, so the
   * stored value says what it was made with. Anything below BCRYPT_COST is
   * rewritten in place. Fire-and-forget: the caller is waiting on a token, and
   * a failed upgrade must not fail the login — it will simply be retried on
   * the next one.
   */
  private async rehashIfOutdatedCost(
    email: string,
    storedHash: string,
    plainPassword: string,
  ): Promise<void> {
    try {
      const cost = Number(storedHash.split('$')[2]);

      /**
       * Any cost that is not the current target gets rewritten, in EITHER
       * direction. `>= BCRYPT_COST` would have been enough while the number
       * only ever went up, but the target came back down from 12 to 10 for
       * hardware reasons, and accounts hashed at 12 during that window would
       * otherwise keep paying ~2.1s of CPU on every sign-in forever.
       */
      if (!Number.isFinite(cost) || cost === BCRYPT_COST) {
        return;
      }

      const rehashed = await hash(plainPassword, BCRYPT_COST);
      await this.usersService.updatePassword(email, rehashed);
    } catch (error) {
      this.logger.error(
        `Password rehash failed for ${email}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Records a failed sign-in attempt.
   *
   * Only successful logins were audited, so a credential-stuffing run against
   * this API produced no evidence at all: nothing to alert on, and nothing to
   * reconstruct afterwards. The throttle now makes the attack slow; this makes
   * it visible.
   *
   * The email is recorded because it is what was attempted, not because the
   * account necessarily exists — `actorId` is only set when it does, so an
   * unknown-address probe is distinguishable from a wrong password on a real
   * account. The password is never touched.
   */
  private recordFailedLogin(
    email: string,
    request?: RequestMetadata,
    userId?: string,
  ): void {
    void this.auditService.log({
      action: 'auth.login_failed',
      actorId: userId,
      resourceType: 'user',
      resourceId: userId,
      metadata: { email, accountExists: Boolean(userId) },
      request,
    });
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

    // A fresh code gets a fresh attempt budget. Without this, misses against a
    // previous code would carry over and burn the new one early — which the
    // real owner would experience as a reset that silently stopped working.
    await this.redisService
      .getClient()
      .multi()
      .setex(key, RESET_CODE_TTL, code)
      .del(`${key}:attempts`)
      .exec();

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

  /**
   * Wrong guesses burn the code.
   *
   * The code space is 900,000 (six digits) and the TTL is ten minutes, but a
   * mismatch used to throw without counting anything and without deleting the
   * key — so one issued code survived all 900,000 guesses, and re-requesting
   * simply rotated in a fresh target. A wrong guess costs one Redis GET and a
   * string compare, because bcrypt only runs after a match. That made
   * unauthenticated takeover of any known email a matter of a few hours.
   *
   * Five misses and the code is gone; the holder has to request another one,
   * which the per-IP throttle also meters. Five is enough slack for a typo or
   * a stale code from an earlier request.
   */
  private static readonly MAX_RESET_ATTEMPTS = 5;

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const key = `pwd_reset:${dto.email.toLowerCase()}`;
    const attemptsKey = `${key}:attempts`;
    const redis = this.redisService.getClient();
    const storedCode = await redis.get(key);

    if (!storedCode || storedCode !== dto.code) {
      if (storedCode) {
        // Counted only while a code is live, so a miss cannot be used to keep
        // an attempts key alive against an account with no reset in flight.
        const attempts = await redis.incr(attemptsKey);

        if (attempts === 1) {
          await redis.expire(attemptsKey, RESET_CODE_TTL);
        }

        if (attempts >= AuthService.MAX_RESET_ATTEMPTS) {
          await redis.del(key, attemptsKey);
          this.logger.warn(
            `Reset code for ${dto.email} discarded after ${attempts} failed attempts.`,
          );
        }
      }

      throw new BadRequestException('Invalid or expired reset code');
    }

    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.isActive) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    const passwordHash = await hash(dto.newPassword, BCRYPT_COST);
    await this.usersService.updatePassword(dto.email, passwordHash);

    // Invalidate the code and its attempt counter after a successful reset
    await redis.del(key, attemptsKey);

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
