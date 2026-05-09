export type ProjectRole = 'OWNER' | 'ADMIN' | 'VIEWER';

export interface ProjectMemberRecord {
  id: string;
  role: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    tier: string;
  };
}

export interface InviteMemberInput {
  email: string;
  role: ProjectRole | string;
}
