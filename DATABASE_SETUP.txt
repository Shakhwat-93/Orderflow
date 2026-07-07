-- ═══════════════════════════════════════════════════════════════════
--  ORDER MANAGEMENT SYSTEM — Complete Database Setup
--  Run this entire file in your Supabase SQL Editor (once, top to bottom)
--  https://supabase.com → Your Project → SQL Editor → New Query → Paste → Run
-- ═══════════════════════════════════════════════════════════════════
--
--  TABLES CREATED:
--   1.  roles
--   2.  users
--   3.  user_roles
--   4.  orders
--   5.  order_activity_logs
--   6.  inventory
--   7.  inventory_transactions
--   8.  toy_box_inventory
--   9.  notifications
--   10. system_configs
--   11. blocked_ip_addresses
--   12. retained_cancelled_ips
--   13. courier_ratio_cache
--   14. ads_reports
--   15. ads_campaigns
--   16. daily_tasks
--   17. task_completions
--   18. assigned_tasks
--   19. task_activity_logs
--   20. user_push_subscriptions
--   21. backup_logs
--   22. backup_settings
--   23. finance_plans
--   24. content_plans
--   25. content_activity_logs
-- ═══════════════════════════════════════════════════════════════════

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ────────────────────────────────────────────────────────────────
-- 1. ROLES
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.roles (
  id          text PRIMARY KEY,
  description text
);

-- Seed default roles
INSERT INTO public.roles (id, description) VALUES
  ('Admin',            'Full system access'),
  ('Moderator',        'Order moderation and management'),
  ('Call Team',        'Handles customer calls and confirmations'),
  ('Courier Team',     'Manages courier dispatching'),
  ('Factory Team',     'Manages production and packing'),
  ('Digital Marketer', 'Content planning, ads, and campaigns')
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────
-- 2. USERS  (mirrors auth.users, stores profile data)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  email      text NOT NULL UNIQUE,
  status     text DEFAULT 'active' CHECK (status IN ('active','inactive','Deactivated')),
  avatar_url text,
  last_active_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────
-- 3. USER ROLES  (many-to-many: user → role)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  role_id text REFERENCES public.roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

-- ────────────────────────────────────────────────────────────────
-- 4. INVENTORY
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  sku             text UNIQUE,
  category        text,
  current_stock   integer DEFAULT 0,
  min_stock_level integer DEFAULT 5,
  unit_price      numeric DEFAULT 0,
  making_cost     numeric DEFAULT 0,
  selling_price   numeric DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can manage inventory" ON public.inventory
  TO authenticated USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────
-- 5. INVENTORY TRANSACTIONS
-- ────────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS inventory_transactions_id_seq;
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id           bigint PRIMARY KEY DEFAULT nextval('inventory_transactions_id_seq'),
  inventory_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  order_id     text,
  type         text NOT NULL CHECK (type IN ('order_confirmed','order_cancelled','order_returned','manual_add','manual_deduct','invoice_sync')),
  quantity     integer NOT NULL,
  note         text,
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────
-- 6. ORDERS
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id                  text PRIMARY KEY,
  customer_name       text NOT NULL,
  phone               text NOT NULL,
  address             text,
  product_name        text NOT NULL,
  size                text,
  quantity            integer DEFAULT 1,
  source              text,
  status              text DEFAULT 'New',
  tracking_id         text,
  notes               text,
  created_by          uuid REFERENCES public.users(id),
  amount              numeric DEFAULT 0,
  items               integer DEFAULT 1,
  payment_status      text DEFAULT 'Unpaid',
  shipping_zone       text DEFAULT 'Outside dhaka',
  email               text,
  ordered_items       jsonb DEFAULT '[]',
  call_attempts       integer DEFAULT 0,
  last_call_status    text,
  first_call_time     timestamptz,
  pending_call_since  timestamptz DEFAULT now(),
  courier_status      text DEFAULT 'pending',
  dispatched_at       timestamptz,
  courier_name        text,
  courier_assigned_id text,
  last_call_at        timestamptz,
  ip_address          text,
  traffic_source      text,
  first_caller_name   text,
  inventory_id        uuid REFERENCES public.inventory(id),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────
-- 7. ORDER ACTIVITY LOGS
-- ────────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS order_activity_logs_id_seq;
CREATE TABLE IF NOT EXISTS public.order_activity_logs (
  id                  integer PRIMARY KEY DEFAULT nextval('order_activity_logs_id_seq'),
  order_id            text NOT NULL,
  action_type         text NOT NULL CHECK (action_type IN ('CREATE','UPDATE','STATUS_CHANGE','DELETE')),
  old_status          text,
  new_status          text,
  changed_by_user_id  uuid,
  changed_by_user_name text,
  action_description  text,
  timestamp           timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────
-- 8. TOY BOX INVENTORY
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.toy_box_inventory (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  toy_box_number integer NOT NULL UNIQUE,
  stock_quantity integer NOT NULL DEFAULT 0,
  updated_at     timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────
-- 9. NOTIFICATIONS
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type           text NOT NULL,
  title          text NOT NULL,
  message        text,
  data           jsonb DEFAULT '{}',
  is_read        boolean DEFAULT false,
  actor_name     text,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  push_sent      boolean DEFAULT false,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (target_user_id = auth.uid() OR target_user_id IS NULL);
CREATE POLICY "Auth can insert notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (target_user_id = auth.uid());

-- ────────────────────────────────────────────────────────────────
-- 10. SYSTEM CONFIGS
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_configs (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.system_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can read system_configs" ON public.system_configs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can upsert system_configs" ON public.system_configs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────
-- 11. BLOCKED IP ADDRESSES
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.blocked_ip_addresses (
  ip_address     text PRIMARY KEY CHECK (length(trim(ip_address)) > 0),
  reason         text,
  is_active      boolean NOT NULL DEFAULT true,
  blocked_by     uuid REFERENCES auth.users(id),
  blocked_by_name text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blocked_ip_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth can manage blocked_ip_addresses" ON public.blocked_ip_addresses
  TO authenticated USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────
-- 12. RETAINED CANCELLED IPS
-- ────────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS retained_cancelled_ips_id_seq;
CREATE TABLE IF NOT EXISTS public.retained_cancelled_ips (
  id           bigint PRIMARY KEY DEFAULT nextval('retained_cancelled_ips_id_seq'),
  ip_address   text NOT NULL,
  order_id     text NOT NULL,
  cancelled_at timestamptz NOT NULL,
  retained_at  timestamptz NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────
-- 13. COURIER RATIO CACHE
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.courier_ratio_cache (
  phone        text PRIMARY KEY CHECK (length(trim(phone)) > 0),
  total        integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  cancelled    integer NOT NULL DEFAULT 0,
  ratio        numeric NOT NULL DEFAULT 0,
  risk_level   text NOT NULL DEFAULT 'new',
  couriers     jsonb NOT NULL DEFAULT '{}',
  raw          jsonb,
  fetch_status text NOT NULL DEFAULT 'pending' CHECK (fetch_status IN ('pending','completed','failed')),
  source       text NOT NULL DEFAULT 'steadfast',
  fetched_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.courier_ratio_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth can manage courier_ratio_cache" ON public.courier_ratio_cache
  TO authenticated USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────
-- 14. ADS REPORTS
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ads_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date      date NOT NULL,
  submitted_by     uuid REFERENCES public.users(id),
  submitted_by_name text,
  status           text DEFAULT 'draft' CHECK (status IN ('draft','submitted')),
  total_spend      numeric DEFAULT 0,
  total_orders     integer DEFAULT 0,
  total_bdt_cost   numeric DEFAULT 0,
  notes            text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE public.ads_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth can manage ads_reports" ON public.ads_reports
  TO authenticated USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────
-- 15. ADS CAMPAIGNS
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ads_campaigns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id        uuid REFERENCES public.ads_reports(id) ON DELETE CASCADE,
  campaign_name    text NOT NULL,
  platform         text NOT NULL,
  product_name     text NOT NULL,
  inventory_id     uuid REFERENCES public.inventory(id),
  spend            numeric NOT NULL DEFAULT 0,
  orders_received  integer DEFAULT 0,
  impressions      integer DEFAULT 0,
  quantity         integer DEFAULT 0,
  bdt_per_purchase numeric DEFAULT 0,
  bdt_av_value     numeric DEFAULT 0,
  order_value_bdt  numeric DEFAULT 0,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE public.ads_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth can manage ads_campaigns" ON public.ads_campaigns
  TO authenticated USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────
-- 16. DAILY TASKS
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  description   text,
  assigned_role text NOT NULL DEFAULT 'Admin',
  priority      text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  recurrence    text NOT NULL DEFAULT 'daily' CHECK (recurrence IN ('daily','weekdays','custom')),
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.daily_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth can manage daily_tasks" ON public.daily_tasks
  TO authenticated USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────
-- 17. TASK COMPLETIONS
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_completions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_task_id     uuid NOT NULL REFERENCES public.daily_tasks(id) ON DELETE CASCADE,
  completed_by      uuid REFERENCES auth.users(id),
  completed_by_name text,
  completed_at      timestamptz DEFAULT now(),
  completion_date   date NOT NULL DEFAULT CURRENT_DATE,
  notes             text
);

ALTER TABLE public.task_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth can manage task_completions" ON public.task_completions
  TO authenticated USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────
-- 18. ASSIGNED TASKS
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assigned_tasks (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                   text NOT NULL,
  description             text,
  assigned_to             uuid REFERENCES auth.users(id),
  assigned_to_name        text,
  assigned_by             uuid REFERENCES auth.users(id),
  assigned_by_name        text,
  priority                text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  status                  text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed')),
  due_date                timestamptz,
  completed_at            timestamptz,
  related_order_id        text,
  comments                jsonb DEFAULT '[]',
  extension_requested_date     timestamptz,
  extension_request_reason     text,
  extension_request_status     text CHECK (extension_request_status IN ('pending','approved','rejected')),
  created_at              timestamptz DEFAULT now()
);

ALTER TABLE public.assigned_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth can manage assigned_tasks" ON public.assigned_tasks
  TO authenticated USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────
-- 19. TASK ACTIVITY LOGS
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_activity_logs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id            uuid NOT NULL,
  task_type          text NOT NULL CHECK (task_type IN ('daily','assigned')),
  user_id            uuid REFERENCES auth.users(id),
  user_name          text NOT NULL,
  action_type        text NOT NULL,
  action_description text NOT NULL,
  old_status         text,
  new_status         text,
  timestamp          timestamptz DEFAULT now()
);

ALTER TABLE public.task_activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth can manage task_activity_logs" ON public.task_activity_logs
  TO authenticated USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────
-- 20. USER PUSH SUBSCRIPTIONS  (PWA notifications)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription jsonb NOT NULL,
  pwa_platform text,
  last_synced_at timestamptz DEFAULT now(),
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own push subscriptions" ON public.user_push_subscriptions
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────────
-- 21. BACKUP LOGS
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.backup_logs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz,
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  type                  text NOT NULL DEFAULT 'manual' CHECK (type IN ('manual','auto','scheduled')),
  file_name             text,
  file_size_bytes       bigint DEFAULT 0,
  tables_backed_up      text[] DEFAULT '{}',
  total_records         integer DEFAULT 0,
  google_drive_file_id  text,
  google_drive_link     text,
  supabase_storage_path text,
  error_message         text,
  triggered_by_user_id  uuid,
  triggered_by_user_name text,
  backup_version        text DEFAULT '1.0'
);

ALTER TABLE public.backup_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth can manage backup_logs" ON public.backup_logs
  TO authenticated USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────
-- 22. BACKUP SETTINGS  (single-row config)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.backup_settings (
  id                      integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  auto_backup_enabled     boolean DEFAULT false,
  backup_interval_hours   integer DEFAULT 12 CHECK (backup_interval_hours BETWEEN 1 AND 168),
  next_backup_at          timestamptz,
  last_backup_at          timestamptz,
  last_backup_status      text,
  last_backup_size_bytes  bigint DEFAULT 0,
  last_backup_log_id      uuid,
  google_drive_connected  boolean DEFAULT false,
  google_drive_client_id  text,
  google_drive_folder_id  text,
  google_drive_folder_name text,
  retention_days          integer DEFAULT 30 CHECK (retention_days BETWEEN 7 AND 365),
  tables_to_backup        text[] DEFAULT ARRAY['orders','order_activity_logs','users','user_roles','inventory','notifications','ads_campaigns','ads_reports','blocked_ip_addresses','courier_ratio_cache','assigned_tasks','task_activity_logs','system_configs','roles','content_plans','finance_plans'],
  include_push_subscriptions boolean DEFAULT false,
  updated_at              timestamptz DEFAULT now()
);

ALTER TABLE public.backup_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth can manage backup_settings" ON public.backup_settings
  TO authenticated USING (true) WITH CHECK (true);

-- Insert the single default row
INSERT INTO public.backup_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────
-- 23. FINANCE PLANS
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_plans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month            text NOT NULL,
  product_id       uuid REFERENCES public.inventory(id),
  product_name     text NOT NULL,
  target_sales_qty integer NOT NULL DEFAULT 0,
  mrp              numeric NOT NULL DEFAULT 0,
  lifting_cost     numeric NOT NULL DEFAULT 0,
  packing_cost     numeric NOT NULL DEFAULT 0,
  cod_cost         numeric NOT NULL DEFAULT 0,
  ad_cost_unit_bdt numeric NOT NULL DEFAULT 0,
  ad_cost_unit_usd numeric NOT NULL DEFAULT 0,
  opex_cost_unit   numeric NOT NULL DEFAULT 0,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE public.finance_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth can manage finance_plans" ON public.finance_plans
  TO authenticated USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────
-- 24. CONTENT PLANS  (full production management)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_plans (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month                  text NOT NULL,
  strategist_name        text DEFAULT 'Admin',
  product_id             uuid REFERENCES public.inventory(id),
  product_name           text NOT NULL,
  -- Planning
  content_title          text,
  content_type           text DEFAULT 'UGC',
  campaign_name          text,
  platform               text DEFAULT 'Facebook',
  priority               text DEFAULT 'Medium',
  content_needed         integer DEFAULT 1,
  received_count         integer DEFAULT 0,
  in_progress_count      integer DEFAULT 0,
  brief                  text,
  script_content         text,
  planning_date          date,
  -- Legacy cost (kept for compatibility)
  inhouse_count          integer DEFAULT 0,
  inhouse_unit_cost      numeric DEFAULT 0,
  brand_name             text,
  brand_unit_count       integer DEFAULT 0,
  brand_unit_cost        numeric DEFAULT 0,
  other_cost             numeric DEFAULT 0,
  -- Assignment
  model_creator          text,
  videographer           text,
  photographer           text,
  editor                 text,
  assigned_to            text,
  assigned_by            text,
  assignment_date        date,
  shoot_location         text,
  shoot_date             date,
  delivery_deadline      date,
  expected_delivery_date date,
  -- Workflow
  workflow_status        text DEFAULT 'Planning',
  -- Delivery
  delivery_status        text,
  content_received       boolean DEFAULT false,
  receive_date           date,
  received_by            text,
  final_approval         boolean DEFAULT false,
  notes                  text,
  -- Drive & File Links
  drive_folder           text,
  raw_footage_link       text,
  edited_video_link      text,
  thumbnail_link         text,
  caption_document       text,
  script_document        text,
  final_export_link      text,
  -- Production Costs
  model_remuneration     numeric DEFAULT 0,
  photographer_cost      numeric DEFAULT 0,
  videographer_cost      numeric DEFAULT 0,
  editing_cost           numeric DEFAULT 0,
  payment_status         text DEFAULT 'Unpaid',
  publish_date           date,
  -- Timestamps
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

ALTER TABLE public.content_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth can manage content_plans" ON public.content_plans
  TO authenticated USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────
-- 25. CONTENT ACTIVITY LOGS
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_activity_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_plan_id   uuid REFERENCES public.content_plans(id) ON DELETE CASCADE,
  user_id           uuid,
  user_name         text NOT NULL DEFAULT 'System',
  action_type       text NOT NULL,
  action_description text NOT NULL,
  old_value         text,
  new_value         text,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE public.content_activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth can read content_activity_logs" ON public.content_activity_logs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth can insert content_activity_logs" ON public.content_activity_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════
--  INDEXES  (speeds up common queries)
-- ════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_orders_status          ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_phone           ON public.orders(phone);
CREATE INDEX IF NOT EXISTS idx_orders_created_at      ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_courier_status  ON public.orders(courier_status);
CREATE INDEX IF NOT EXISTS idx_oal_order_id           ON public.order_activity_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user     ON public.notifications(target_user_id);
CREATE INDEX IF NOT EXISTS idx_content_plans_month    ON public.content_plans(month);
CREATE INDEX IF NOT EXISTS idx_content_plans_status   ON public.content_plans(workflow_status);
CREATE INDEX IF NOT EXISTS idx_cal_plan_id            ON public.content_activity_logs(content_plan_id);
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_to      ON public.assigned_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_courier_cache_phone    ON public.courier_ratio_cache(phone);

-- ════════════════════════════════════════════════════════════════
--  DONE!
--  After running this SQL:
--  1. Go to Authentication → Users → Invite a user (or use signUp)
--  2. The first user you create should be given the 'Admin' role manually:
--
--     INSERT INTO public.users (id, name, email) 
--     VALUES ('<paste-auth-user-uuid>', 'Your Name', 'your@email.com');
--
--     INSERT INTO public.user_roles (user_id, role_id)
--     VALUES ('<paste-auth-user-uuid>', 'Admin');
--
-- ════════════════════════════════════════════════════════════════
