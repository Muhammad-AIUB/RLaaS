import { Injectable } from '@nestjs/common';
import { User, UserTier } from '@prisma/client';
import { AuthUserProfile } from '../common/interfaces/auth-response.interface';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const USER_PROFILE_TTL = 60;

@Injectable()
export class UsersService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  create(data: {
    email: string;
    passwordHash: string;
    fullName: string;
    tier: UserTier;
  }): Promise<User> {
    return this.prismaService.user.create({ data });
  }

  async findByEmail(email: string): Promise<User | null> {
    const key = `cache:user:email:${email.toLowerCase()}`;

    try {
      const cached = await this.redisService.getClient().get(key);
      if (cached) return JSON.parse(cached) as User;
    } catch { /* fall through */ }

    const user = await this.prismaService.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (user) {
      try {
        await this.redisService.getClient().setex(key, 60, JSON.stringify(user));
      } catch { /* non-critical */ }
    }

    return user;
  }

  findById(id: string): Promise<User | null> {
    return this.prismaService.user.findUnique({ where: { id } });
  }

  async getProfile(id: string): Promise<AuthUserProfile | null> {
    const key = `cache:user:profile:${id}`;

    try {
      const cached = await this.redisService.getClient().get(key);
      if (cached) return JSON.parse(cached) as AuthUserProfile;
    } catch {
      // Redis miss — fall through to DB
    }

    const user = await this.findById(id);
    if (!user) return null;

    const profile = this.toProfile(user);

    try {
      await this.redisService.getClient().setex(key, USER_PROFILE_TTL, JSON.stringify(profile));
    } catch {
      // Non-critical — continue without caching
    }

    return profile;
  }

  toProfile(user: Pick<User, 'id' | 'email' | 'fullName' | 'tier' | 'createdAt' | 'updatedAt'>): AuthUserProfile {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      tier: user.tier,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
