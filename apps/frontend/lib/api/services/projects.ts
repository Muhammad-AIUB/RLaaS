import type { CreateProjectInput, ProjectSummary } from '@/lib/types';
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
};
