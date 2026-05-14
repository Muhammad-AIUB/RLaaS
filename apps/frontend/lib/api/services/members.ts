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
  updateRole: (projectId: string, memberId: string, role: string) =>
    apiFetch<ProjectMemberRecord>(
      `${endpoints.projects.members(projectId)}/${memberId}/role`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      },
    ),
  remove: (projectId: string, memberId: string) =>
    apiFetch<{ success: boolean }>(
      `${endpoints.projects.members(projectId)}/${memberId}`,
      { method: 'DELETE' },
    ),
};
