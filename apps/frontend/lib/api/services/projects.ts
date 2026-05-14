import type { CreateProjectInput, ProjectSummary, UpdateProjectInput } from '@/lib/types';
import { apiFetch } from '../client';
import { endpoints } from '../endpoints';

export const projectsApi = {
  list: () => apiFetch<ProjectSummary[]>(endpoints.projects.list()),
  get: (id: string) => apiFetch<ProjectSummary>(endpoints.projects.detail(id)),
  create: (input: CreateProjectInput) =>
    apiFetch<ProjectSummary>(endpoints.projects.list(), {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  update: (id: string, input: UpdateProjectInput) =>
    apiFetch<ProjectSummary>(endpoints.projects.detail(id), {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  delete: (id: string) =>
    apiFetch<void>(endpoints.projects.detail(id), {
      method: 'DELETE',
    }),
};
