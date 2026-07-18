-- PostgreSQL requires a newly-added enum label to be committed before another
-- migration transaction may use it in expressions or stored rows.
ALTER TYPE "settlement_status"
  ADD VALUE IF NOT EXISTS 'refund_pending' BEFORE 'released';
