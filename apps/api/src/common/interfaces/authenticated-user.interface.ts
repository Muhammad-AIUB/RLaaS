import { UserTier } from '@prisma/client';

export interface AuthenticatedUser {
  sub: string;
  email: string;
  tier: UserTier;
}
