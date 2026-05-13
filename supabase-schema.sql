create table if not exists public.kas_settings (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.kas_settings enable row level security;

drop policy if exists "Allow public read kas settings" on public.kas_settings;
create policy "Allow public read kas settings"
on public.kas_settings
for select
using (true);

drop policy if exists "Allow public write kas settings" on public.kas_settings;
create policy "Allow public write kas settings"
on public.kas_settings
for all
using (true)
with check (true);
