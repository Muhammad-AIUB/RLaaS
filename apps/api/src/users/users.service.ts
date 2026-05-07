import { Injectable } from '@nestjs/common';
import { User, UserTier } from '@prisma/client';
import { AuthUserProfile } from '../common/interfaces/auth-response.interface';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prismaService: PrismaService) {}

  create(data: {
    email: string;
    passwordHash: string;
    fullName: string;
    tier: UserTier;
  }): Promise<User> {
    return this.prismaService.user.create({
      data,
    });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prismaService.user.findUnique({
      where: {
        email: email.toLowerCase(),
      },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.prismaService.user.findUnique({
      where: { id },
    });
  }

  async getProfile(id: string): Promise<AuthUserProfile | null> {
    const user = await this.findById(id);

    return user ? this.toProfile(user) : null;
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
