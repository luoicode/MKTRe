alter table public.teams
  add column if not exists company_name text default 'DASNOTRI-01';

update public.teams
set company_name = 'DASNOTRI-01'
where company_name is null;
