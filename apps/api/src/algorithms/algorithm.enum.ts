export enum RateLimitAlgorithm {
  FIXED_WINDOW = 'fixed_window',
  SLIDING_WINDOW_LOG = 'sliding_window_log',
  SLIDING_WINDOW_COUNTER = 'sliding_window_counter',
  TOKEN_BUCKET = 'token_bucket',
}
