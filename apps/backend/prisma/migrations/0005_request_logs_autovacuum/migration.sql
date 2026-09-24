-- Per-table autovacuum for request_logs, sized to the retention job's churn.
--
-- The retention job keeps 35 days, so each daily run deletes about 1/35 of the
-- table (~2.9%) and a day of gateway traffic inserts about the same. Defaults
-- wait for 20% dead rows (about a week of deletes) before vacuuming. 2% is
-- just under one day's churn, so autovacuum follows each retention run instead
-- of lagging several behind. Thresholds stay at their defaults (50 / 1000 / 50);
-- the scale factor carries the table once it is larger than a few thousand rows.
--
--   vacuum_scale_factor 0.02:        reclaim each run's deleted rows the same day,
--                                    so the table stays ~35 days of rows, not 35
--                                    plus a week of dead space.
--   vacuum_insert_scale_factor 0.02: append-only growth also triggers vacuum,
--                                    which summarises new BRIN block ranges.
--                                    Unsummarised ranges are always scanned, so
--                                    this keeps request_logs_created_at_brin_idx
--                                    pruning the recent tail.
--   analyze_scale_factor 0.02:       the created_at window moves every day;
--                                    fresh stats keep the planner's estimate for
--                                    `created_at < cutoff` (BRIN vs seq scan) right.
--
-- Cost throttling is left at the defaults (cost_delay 2ms, cost_limit 200).
-- SET (autovacuum_*) takes SHARE UPDATE EXCLUSIVE, which does not block reads
-- or the gateway's INSERTs.
ALTER TABLE "request_logs" SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_insert_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.02
);
