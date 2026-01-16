-- Touch queue for async touch operations via API
-- Allows external clients (Raycast) to request touch operations
-- which are processed by the indexer's watch mode

-- Create touch queue table
CREATE TABLE IF NOT EXISTS public.touch_queue (
  id SERIAL PRIMARY KEY,
  project_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  created_by TEXT DEFAULT 'api'
);

-- Index for efficient polling of pending requests
CREATE INDEX IF NOT EXISTS idx_touch_queue_pending
  ON touch_queue(created_at ASC)
  WHERE status = 'pending';

-- Index for status lookups by project
CREATE INDEX IF NOT EXISTS idx_touch_queue_project_status
  ON touch_queue(project_id, created_at DESC);

-- Enable RLS
ALTER TABLE touch_queue ENABLE ROW LEVEL SECURITY;

-- Allow anon to insert touch requests
CREATE POLICY "Allow anon to insert touch requests"
  ON touch_queue FOR INSERT
  WITH CHECK (true);

-- Allow anon to read touch requests
CREATE POLICY "Allow anon to read touch requests"
  ON touch_queue FOR SELECT
  USING (true);

-- Allow anon to update touch requests (for status updates from indexer)
CREATE POLICY "Allow anon to update touch requests"
  ON touch_queue FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Function to clean up old completed/failed requests (older than 1 hour)
CREATE OR REPLACE FUNCTION cleanup_old_touch_requests()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM touch_queue
  WHERE status IN ('completed', 'failed')
  AND created_at < now() - interval '1 hour';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Comments for documentation
COMMENT ON TABLE touch_queue IS 'Queue for async touch operations requested via API';
COMMENT ON COLUMN touch_queue.project_id IS 'ID of the project to touch (e.g., g-p-abc123)';
COMMENT ON COLUMN touch_queue.status IS 'Request status: pending, processing, completed, failed';
COMMENT ON COLUMN touch_queue.error_message IS 'Error details if status is failed';
COMMENT ON COLUMN touch_queue.processed_at IS 'Timestamp when the request was processed';
COMMENT ON COLUMN touch_queue.created_by IS 'Source of the request (api, cli, etc.)';
COMMENT ON FUNCTION cleanup_old_touch_requests IS 'Removes completed/failed requests older than 1 hour';
