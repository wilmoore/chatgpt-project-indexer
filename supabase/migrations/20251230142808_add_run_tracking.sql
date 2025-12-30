-- Add run tracking for safe data management
-- Each enumeration run gets a unique ID, enabling:
-- - Rollback to previous runs
-- - Clear audit of which run found what
-- - Safe cleanup of stale data after successful completion

-- Create runs table to track enumeration runs
create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  projects_found integer default 0,
  projects_extracted integer default 0,
  created_at timestamptz not null default now()
);

-- Add run_id to projects table
alter table public.projects
  add column if not exists run_id uuid references public.runs(id);

-- Create index for efficient queries by run
create index if not exists idx_projects_run_id on public.projects(run_id);

-- Enable RLS on runs table
alter table public.runs enable row level security;

-- Allow anon to manage runs (for local development)
create policy "Allow anon full access to runs"
  on public.runs for all
  using (true)
  with check (true);

-- Function to clean up old runs after successful completion
-- Keeps only the latest N runs (default 3)
create or replace function cleanup_old_runs(keep_count integer default 3)
returns integer
language plpgsql
as $$
declare
  deleted_count integer;
  cutoff_run_id uuid;
begin
  -- Find the run_id that marks the cutoff
  select id into cutoff_run_id
  from public.runs
  where status = 'completed'
  order by completed_at desc
  offset keep_count
  limit 1;

  if cutoff_run_id is null then
    return 0;
  end if;

  -- Delete projects from old runs
  delete from public.projects
  where run_id in (
    select id from public.runs
    where status = 'completed'
    and completed_at < (
      select completed_at from public.runs where id = cutoff_run_id
    )
  );

  get diagnostics deleted_count = row_count;

  -- Delete old run records
  delete from public.runs
  where status = 'completed'
  and completed_at < (
    select completed_at from public.runs where id = cutoff_run_id
  );

  return deleted_count;
end;
$$;

comment on table public.runs is 'Tracks each project enumeration run';
comment on column public.projects.run_id is 'The enumeration run that discovered/confirmed this project';
comment on function cleanup_old_runs is 'Removes projects and runs older than the most recent N completed runs';
