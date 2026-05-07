export enum RlaasAlgorithm {
  FIXED_WINDOW = 'fixed_window',
  SLIDING_WINDOW_LOG = 'sliding_window_log',
  SLIDING_WINDOW_COUNTER = 'sliding_window_counter',
  TOKEN_BUCKET = 'token_bucket',
}

export interface GatewayCheckRequest {
  apiKey: string;
  ip: string;
  endpoint: string;
  method: string;
  userTier: string;
}

export interface GatewayAllowResponse {
  allowed: true;
  limit: number;
  remaining: number;
  retryAfter: number;
  algorithm: RlaasAlgorithm;
  ruleId?: string;
  ruleName?: string;
  scope?: string;
}

export interface GatewayBlockResponse {
  allowed: false;
  reason: 'RATE_LIMIT_EXCEEDED' | 'API_KEY_INVALID' | 'API_KEY_REVOKED';
  limit: number;
  remaining: number;
  retryAfter: number;
  algorithm: RlaasAlgorithm;
  ruleId?: string;
  ruleName?: string;
  scope?: string;
}

export type GatewayCheckResponse = GatewayAllowResponse | GatewayBlockResponse;

export interface RlaasErrorResponse {
  message: string;
  statusCode?: number;
}
