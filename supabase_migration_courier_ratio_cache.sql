-- ============================================================
-- Persistent courier ratio cache
-- Run this in Supabase SQL Editor.
-- ============================================================

create table if not exists public.courier_ratio_cache (
  phone text primary key,
  total integer not null default 0,
  success_count integer not null default 0,
  cancelled integer not null default 0,
  ratio numeric(6,2) not null default 0,
  risk_level text not null default 'new',
  couriers jsonb not null default '{}'::jsonb,
  raw jsonb,
  fetch_status text not null default 'pending',
  source text not null default 'steadfast',
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courier_ratio_cache_phone_not_blank check (length(trim(phone)) > 0),
  constraint courier_ratio_cache_fetch_status_check check (fetch_status in ('pending', 'completed', 'failed'))
);

create index if not exists courier_ratio_cache_updated_at_idx
  on public.courier_ratio_cache (updated_at desc);

create or replace function public.set_courier_ratio_cache_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.phone = regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');
  new.phone = regexp_replace(new.phone, '^88', '');
  return new;
end;
$$;

drop trigger if exists set_courier_ratio_cache_updated_at on public.courier_ratio_cache;
create trigger set_courier_ratio_cache_updated_at
  before insert or update on public.courier_ratio_cache
  for each row
  execute function public.set_courier_ratio_cache_updated_at();

alter table public.courier_ratio_cache enable row level security;

drop policy if exists "Authenticated users can read courier ratio cache" on public.courier_ratio_cache;
create policy "Authenticated users can read courier ratio cache"
  on public.courier_ratio_cache
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can write courier ratio cache" on public.courier_ratio_cache;
create policy "Authenticated users can write courier ratio cache"
  on public.courier_ratio_cache
  for all
  to authenticated
  using (true)
  with check (true);

create or replace function public.claim_courier_ratio_lookup(phone_input text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_phone text;
  existing_status text;
  existing_updated_at timestamptz;
begin
  normalized_phone := regexp_replace(coalesce(phone_input, ''), '\D', '', 'g');
  normalized_phone := regexp_replace(normalized_phone, '^88', '');

  if normalized_phone = '' then
    return false;
  end if;

  select fetch_status, updated_at
    into existing_status, existing_updated_at
  from public.courier_ratio_cache
  where phone = normalized_phone;

  if not found then
    insert into public.courier_ratio_cache (phone, fetch_status, source)
    values (normalized_phone, 'pending', 'steadfast');
    return true;
  end if;

  if existing_status = 'completed' then
    return false;
  end if;

  if existing_status = 'pending' and existing_updated_at > now() - interval '2 minutes' then
    return false;
  end if;

  update public.courier_ratio_cache
     set fetch_status = 'pending',
         updated_at = now()
   where phone = normalized_phone;

  return true;
end;
$$;

grant execute on function public.claim_courier_ratio_lookup(text) to authenticated;
