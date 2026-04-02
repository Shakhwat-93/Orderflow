alter table if exists public.inventory
  add column if not exists supports_serial_tracking boolean not null default false;

update public.inventory
set supports_serial_tracking = true
where supports_serial_tracking = false
  and (
    upper(coalesce(category, '')) = 'TOY BOX'
    or lower(coalesce(name, '')) like '%toy box%'
  );

alter table if exists public.toy_box_inventory
  add column if not exists product_name text;

update public.toy_box_inventory
set product_name = 'TOY BOX'
where coalesce(nullif(trim(product_name), ''), '') = '';

alter table if exists public.toy_box_inventory
  alter column product_name set default 'TOY BOX';

alter table if exists public.toy_box_inventory
  alter column product_name set not null;

create unique index if not exists toy_box_inventory_product_serial_key
  on public.toy_box_inventory (product_name, toy_box_number);

create index if not exists toy_box_inventory_product_name_idx
  on public.toy_box_inventory (product_name);

alter table if exists public.orders
  add column if not exists delivery_charge numeric not null default 0;

alter table if exists public.orders
  add column if not exists order_lines_payload jsonb not null default '[]'::jsonb;

alter table if exists public.orders
  add column if not exists pricing_summary jsonb not null default '{}'::jsonb;

update public.orders
set delivery_charge = case
  when shipping_zone = 'Inside Dhaka' then 80
  when shipping_zone = 'Outside Dhaka' then 150
  else 0
end
where delivery_charge = 0;

update public.orders
set order_lines_payload = coalesce(ordered_items, '[]'::jsonb)
where order_lines_payload = '[]'::jsonb;

update public.orders
set pricing_summary = jsonb_build_object(
  'subtotal',
  greatest(coalesce(amount, 0) - coalesce(delivery_charge, 0), 0),
  'delivery_charge',
  coalesce(delivery_charge, 0),
  'payable_total',
  coalesce(amount, 0)
)
where pricing_summary = '{}'::jsonb;
