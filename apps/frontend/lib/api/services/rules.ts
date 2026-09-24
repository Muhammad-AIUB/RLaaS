import type { CreateRuleInput, RuleRecord, UpdateRuleInput } from '@/lib/types';
import { apiFetch } from '../client';
import { endpoints } from '../endpoints';

interface RulePage {
  data: RuleRecord[];
  nextCursor: string | null;
}

/** The API's page cap; one request covers any realistic project. */
const RULES_PAGE_SIZE = 200;

export const rulesApi = {
  /**
   * Every rule in the project, in evaluation order. The API is keyset-paginated
   * (`{ data, nextCursor }`); the dashboard shows the whole list, so this
   * follows the cursor until it runs out.
   */
  list: async (projectId: string): Promise<RuleRecord[]> => {
    const rules: RuleRecord[] = [];
    let cursor: string | null = null;

    do {
      const params = new URLSearchParams({ limit: String(RULES_PAGE_SIZE) });
      if (cursor) params.set('cursor', cursor);

      const page: RulePage = await apiFetch<RulePage>(
        `${endpoints.projects.rules(projectId)}?${params.toString()}`,
      );
      rules.push(...page.data);
      cursor = page.nextCursor;
    } while (cursor);

    return rules;
  },
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
