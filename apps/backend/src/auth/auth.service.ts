import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserTier } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { AuthResponse } from '../common/interfaces/auth-response.interface';
import { RequestMetadata } from '../common/interfaces/request-metadata.interface';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
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
