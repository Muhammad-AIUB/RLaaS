import { UserTier } from '@prisma/client';

export interface AuthUserProfile {
  id: string;
  email: string;
  fullName: string;
  tier: UserTier;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUserProfile;
}
