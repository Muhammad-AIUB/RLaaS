import type { CreateRuleInput, RuleRecord, UpdateRuleInput } from '@/lib/types';
import { apiFetch } from '../client';
import { endpoints } from '../endpoints';

export const rulesApi = {
  list: (projectId: string) =>
    apiFetch<RuleRecord[]>(endpoints.projects.rules(projectId)),
  create: (projectId: string, input: CreateRuleInput) =>
    apiFetch<RuleRecord>(endpoints.projects.rules(projectId), {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  update: (projectId: string, ruleId: string, input: UpdateRuleInput) =>
    apiFetch<RuleRecord>(endpoints.projects.rule(projectId, ruleId), {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  remove: (projectId: string, ruleId: string) =>
    apiFetch<{ success: boolean }>(endpoints.projects.rule(projectId, ruleId), {
      method: 'DELETE',
    }),
};
