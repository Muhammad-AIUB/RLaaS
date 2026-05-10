import type { GatewayTesterInput, GatewayTesterResult } from '@/lib/types';
import { apiFetch } from '../client';
import { endpoints } from '../endpoints';

export const gatewayTesterApi = {
  check: (projectId: string, input: GatewayTesterInput) =>
    apiFetch<GatewayTesterResult>(
      endpoints.projects.gatewayTester.check(projectId),
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),
};
