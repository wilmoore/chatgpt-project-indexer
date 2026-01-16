-- Add atomic run support for safe data management
-- Ensures projects are never lost during failed runs
--
-- Design:
-- 1. Projects remain tagged with the run_id that FIRST discovered them
-- 2. A new column tracks which run LAST confirmed the project exists
-- 3. The "current" run is tracked in a singleton row
-- 4. Cleanup only removes projects not seen in recent runs

-- Add column to track which run last confirmed this project
-- This is separate from run_id (first seen) vs last_confirmed_run_id (last seen)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_confirmed_run_id UUID REFERENCES runs(id);

-- Create a table to track the current active run (singleton pattern)
-- This replaces relying on run status alone
CREATE TABLE IF NOT EXISTS public.run_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Ensures singleton
  current_run_id UUID REFERENCES runs(id),
  last_successful_run_id UUID REFERENCES runs(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert the singleton row if it doesn't exist
INSERT INTO public.run_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Enable RLS on run_state table
ALTER TABLE public.run_state ENABLE ROW LEVEL SECURITY;

-- Allow anon to manage run_state (for local development)
CREATE POLICY "Allow anon full access to run_state"
  ON public.run_state FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for efficient lookup of projects by last_confirmed_run_id
CREATE INDEX IF NOT EXISTS idx_projects_last_confirmed_run
  ON projects(last_confirmed_run_id);

-- Function to promote a run to current (atomic operation)
-- This should only be called after ALL data is successfully flushed
CREATE OR REPLACE FUNCTION promote_run_to_current(target_run_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update run status to completed
  UPDATE runs
  SET status = 'completed', completed_at = now()
  WHERE id = target_run_id;

  -- Update the singleton state
  UPDATE run_state
  SET
    last_successful_run_id = target_run_id,
    updated_at = now()
  WHERE id = 1;
END;
$$;

-- Function to safely clean up old data
-- Only removes data from runs that are:
-- 1. Not the current run
-- 2. Not one of the N most recent successful runs
-- 3. Projects not confirmed in any of the kept runs
CREATE OR REPLACE FUNCTION safe_cleanup_old_runs(keep_count INTEGER DEFAULT 3)
RETURNS TABLE(runs_deleted INTEGER, projects_deleted INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  v_runs_deleted INTEGER := 0;
  v_projects_deleted INTEGER := 0;
  v_kept_run_ids UUID[];
BEGIN
  -- Get the run IDs we want to keep
  SELECT ARRAY_AGG(id) INTO v_kept_run_ids
  FROM (
    SELECT id FROM runs
    WHERE status = 'completed'
    ORDER BY completed_at DESC
    LIMIT keep_count
  ) recent_runs;

  -- If we don't have enough runs to delete, return early
  IF v_kept_run_ids IS NULL OR array_length(v_kept_run_ids, 1) < keep_count THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  -- Delete projects that were ONLY seen in runs we're deleting
  -- i.e., their last_confirmed_run_id is NOT in the kept runs
  DELETE FROM projects
  WHERE last_confirmed_run_id IS NOT NULL
    AND last_confirmed_run_id != ALL(v_kept_run_ids);

  GET DIAGNOSTICS v_projects_deleted = ROW_COUNT;

  -- Delete old completed runs (not in kept list)
  DELETE FROM runs
  WHERE status = 'completed'
    AND id != ALL(v_kept_run_ids);

  GET DIAGNOSTICS v_runs_deleted = ROW_COUNT;

  -- Also clean up failed runs older than 7 days
  DELETE FROM runs
  WHERE status = 'failed'
    AND started_at < now() - interval '7 days';

  RETURN QUERY SELECT v_runs_deleted, v_projects_deleted;
END;
$$;

-- Comments for documentation
COMMENT ON COLUMN projects.last_confirmed_run_id IS 'The most recent run that confirmed this project exists';
COMMENT ON TABLE run_state IS 'Singleton table tracking current and last successful run IDs';
COMMENT ON FUNCTION promote_run_to_current IS 'Atomically promotes a run to current after successful completion';
COMMENT ON FUNCTION safe_cleanup_old_runs IS 'Safely removes old data while preserving recent successful runs';
