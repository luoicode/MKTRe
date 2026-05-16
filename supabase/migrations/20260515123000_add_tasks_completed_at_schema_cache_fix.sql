alter table public.tasks
add column if not exists completed_at timestamptz;

notify pgrst, 'reload schema';
