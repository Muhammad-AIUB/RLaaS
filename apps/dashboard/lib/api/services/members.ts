import type { InviteMemberInput, ProjectMemberRecord } from '@/lib/types';
import { apiFetch } from '../client';
import { endpoints } from '../endpoints';

export const membersApi = {
  list: (projectId: string) =>
    apiFetch<ProjectMemberRecord[]>(endpoints.projects.members(projectId)),
  invite: (projectId: string, input: InviteMemberInput) =>
    apiFetch<ProjectMemberRecord>(endpoints.projects.members(projectId), {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};
