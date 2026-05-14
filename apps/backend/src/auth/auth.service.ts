import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserTier } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
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

@Injectable()
export class AuthService {
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

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ resetCode: string; expiresInSeconds: number }> {
    const user = await this.usersService.findByEmail(dto.email);

    // Always return success to prevent email enumeration
    if (!user || !user.isActive) {
      return { resetCode: '------', expiresInSeconds: RESET_CODE_TTL };
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const key = `pwd_reset:${dto.email.toLowerCase()}`;

    await this.redisService.getClient().setex(key, RESET_CODE_TTL, code);

    return { resetCode: code, expiresInSeconds: RESET_CODE_TTL };
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
