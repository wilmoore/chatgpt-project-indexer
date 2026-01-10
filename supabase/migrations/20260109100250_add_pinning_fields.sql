-- Add pinning fields to projects table
-- Allows projects to be marked as pinned to float to top of sidebar

ALTER TABLE projects ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS icon_color TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS icon_emoji TEXT;

-- Index for efficient pinned project queries
CREATE INDEX IF NOT EXISTS idx_projects_pinned ON projects(pinned) WHERE pinned = TRUE;

-- Comment for documentation
COMMENT ON COLUMN projects.pinned IS 'Whether this project is pinned to float to top';
COMMENT ON COLUMN projects.pinned_at IS 'Timestamp when project was pinned (for ordering)';
COMMENT ON COLUMN projects.icon_color IS 'Icon color theme hex (e.g., #ff66ad) for touch restore';
COMMENT ON COLUMN projects.icon_emoji IS 'Icon emoji name (e.g., graduation-cap)';
