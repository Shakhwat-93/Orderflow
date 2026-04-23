-- ============================================
-- Lifetime IP blocklist for landing-page order spam
-- Run this in Supabase SQL Editor.
-- ============================================

create table if not exists public.blocked_ip_addresses (
  ip_address text primary key,
  reason text,
  is_active boolean not null default true,
  blocked_by uuid references auth.users(id) on delete set null,
  blocked_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint blocked_ip_addresses_ip_not_blank check (length(trim(ip_address)) > 0)
);

alter table public.blocked_ip_addresses
  add column if not exists reason text;

alter table public.blocked_ip_addresses
  add column if not exists is_active boolean not null default true;

alter table public.blocked_ip_addresses
  add column if not exists blocked_by uuid references auth.users(id) on delete set null;

alter table public.blocked_ip_addresses
  add column if not exists blocked_by_name text;

alter table public.blocked_ip_addresses
  add column if not exists created_at timestamptz not null default now();

alter table public.blocked_ip_addresses
  add column if not exists updated_at timestamptz not null default now();

create index if not exists blocked_ip_addresses_active_idx
  on public.blocked_ip_addresses (ip_address)
  where is_active = true;

create or replace function public.set_blocked_ip_addresses_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.ip_address = lower(trim(new.ip_address));
  return new;
end;
$$;

drop trigger if exists set_blocked_ip_addresses_updated_at on public.blocked_ip_addresses;
create trigger set_blocked_ip_addresses_updated_at
  before insert or update on public.blocked_ip_addresses
  for each row
  execute function public.set_blocked_ip_addresses_updated_at();

alter table public.blocked_ip_addresses enable row level security;

drop policy if exists "Admins can read blocked IP addresses" on public.blocked_ip_addresses;
create policy "Admins can read blocked IP addresses"
  on public.blocked_ip_addresses
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role_id = 'Admin'
    )
  );

drop policy if exists "Admins can insert blocked IP addresses" on public.blocked_ip_addresses;
create policy "Admins can insert blocked IP addresses"
  on public.blocked_ip_addresses
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role_id = 'Admin'
    )
  );

drop policy if exists "Admins can update blocked IP addresses" on public.blocked_ip_addresses;
create policy "Admins can update blocked IP addresses"
  on public.blocked_ip_addresses
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role_id = 'Admin'
    )
  )
  with check (
    exists (
      select 1
      from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role_id = 'Admin'
    )
  );

create or replace function public.is_ip_blocked(ip_value text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.blocked_ip_addresses
    where is_active = true
      and ip_address = lower(trim(coalesce(ip_value, '')))
  );
$$;

grant execute on function public.is_ip_blocked(text) to anon, authenticated;

create or replace function public.reject_blocked_ip_orders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_ip text;
begin
  normalized_ip := lower(trim(coalesce(new.ip_address::text, '')));

  if normalized_ip = '' then
    return new;
  end if;

  if public.is_ip_blocked(normalized_ip) then
    raise exception 'ORDER_BLOCKED_IP'
      using
        errcode = 'P0001',
        detail = 'This IP address is blocked from creating orders.',
        hint = 'Review the blocked_ip_addresses table in Fraud Control.';
  end if;

  return new;
end;
$$;

drop trigger if exists reject_blocked_ip_orders on public.orders;
create trigger reject_blocked_ip_orders
  before insert on public.orders
  for each row
  execute function public.reject_blocked_ip_orders();
