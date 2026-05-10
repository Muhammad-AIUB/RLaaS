/**
 * Centralised URL builders for the BFF proxy.
 *
 * Keeping every URL in one place means:
 *  - Pages never hand-roll path strings
 *  - Renaming an upstream route is a one-line change
 *  - It is easy to audit which endpoints the dashboard touches
 */

const PROXY = '/api/proxy';

export const endpoints = {
  projects: {
    list: () => `${PROXY}/projects`,
    detail: (projectId: string) => `${PROXY}/projects/${projectId}`,
    members: (projectId: string) => `${PROXY}/projects/${projectId}/members`,
    apiKeys: (projectId: string) => `${PROXY}/projects/${projectId}/api-keys`,
    apiKeyRevoke: (projectId: string, keyId: string) =>
      `${PROXY}/projects/${projectId}/api-keys/${keyId}/revoke`,
    gatewayTester: {
      check: (projectId: string) =>
        `${PROXY}/projects/${projectId}/gateway-tester/check`,
    },
    rules: (projectId: string) => `${PROXY}/projects/${projectId}/rules`,
    rule: (projectId: string, ruleId: string) =>
      `${PROXY}/projects/${projectId}/rules/${ruleId}`,
    webhooks: (projectId: string) => `${PROXY}/projects/${projectId}/webhooks`,
    webhook: (projectId: string, webhookId: string) =>
      `${PROXY}/projects/${projectId}/webhooks/${webhookId}`,
    auditLogs: (projectId: string) =>
      `${PROXY}/projects/${projectId}/audit-logs`,
    analytics: {
      overview: (projectId: string) =>
        `${PROXY}/projects/${projectId}/analytics/overview`,
      topIps: (projectId: string, limit: number) =>
        `${PROXY}/projects/${projectId}/analytics/top-ips?limit=${limit}`,
      topEndpoints: (projectId: string, limit: number) =>
        `${PROXY}/projects/${projectId}/analytics/top-endpoints?limit=${limit}`,
      algorithms: (projectId: string) =>
        `${PROXY}/projects/${projectId}/analytics/algorithms`,
      logs: (projectId: string, limit: number) =>
        `${PROXY}/projects/${projectId}/analytics/logs?limit=${limit}`,
      snapshots: (projectId: string, limit?: number) =>
        limit
          ? `${PROXY}/projects/${projectId}/analytics/snapshots?limit=${limit}`
          : `${PROXY}/projects/${projectId}/analytics/snapshots`,
    },
  },
} as const;
