export type RuleScope =
  | 'IP'
  | 'API_KEY'
  | 'USER_TIER'
  | 'ENDPOINT'
  | 'GLOBAL';

export type RuleAlgorithm =
  | 'FIXED_WINDOW'
  | 'SLIDING_WINDOW_LOG'
  | 'SLIDING_WINDOW_COUNTER'
  | 'TOKEN_BUCKET';

export interface RuleRecord {
  id: string;
  name: string;
  description?: string | null;
  priority: number;
  scope: string;
  targetValue?: string | null;
  endpointPattern?: string | null;
  method?: string | null;
  userTier?: string | null;
  algorithm: string;
  limit: number;
  windowSeconds: number;
  burstCapacity?: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRuleInput {
  name: string;
  description?: string;
  priority: number;
  scope: RuleScope | string;
  targetValue?: string;
  endpointPattern?: string;
  method?: string;
  userTier?: string;
  algorithm: RuleAlgorithm | string;
  limit: number;
  windowSeconds: number;
  burstCapacity?: number;
}
