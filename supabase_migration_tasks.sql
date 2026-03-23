-- ============================================
-- TASK MANAGEMENT MODULE — Database Migration
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Daily Tasks (recurring operational tasks)
CREATE TABLE IF NOT EXISTS daily_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  assigned_role TEXT NOT NULL DEFAULT 'Admin',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  recurrence TEXT NOT NULL DEFAULT 'daily' CHECK (recurrence IN ('daily', 'weekdays', 'custom')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Task Completions (tracks daily task completions per day)
CREATE TABLE IF NOT EXISTS task_completions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  daily_task_id UUID NOT NULL REFERENCES daily_tasks(id) ON DELETE CASCADE,
  completed_by UUID REFERENCES auth.users(id),
  completed_by_name TEXT,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  completion_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  UNIQUE(daily_task_id, completion_date)
);

-- 3. Assigned Tasks (specific tasks assigned to users)
CREATE TABLE IF NOT EXISTS assigned_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES auth.users(id),
  assigned_to_name TEXT,
  assigned_by UUID REFERENCES auth.users(id),
  assigned_by_name TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  related_order_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_task_completions_date ON task_completions(completion_date);
CREATE INDEX IF NOT EXISTS idx_task_completions_task ON task_completions(daily_task_id);
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_user ON assigned_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_status ON assigned_tasks(status);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_role ON daily_tasks(assigned_role);

-- RLS Policies
ALTER TABLE daily_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assigned_tasks ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all tasks
CREATE POLICY "Authenticated users can read daily_tasks" ON daily_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert daily_tasks" ON daily_tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update daily_tasks" ON daily_tasks FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete daily_tasks" ON daily_tasks FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read task_completions" ON task_completions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert task_completions" ON task_completions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete task_completions" ON task_completions FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read assigned_tasks" ON assigned_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert assigned_tasks" ON assigned_tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update assigned_tasks" ON assigned_tasks FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete assigned_tasks" ON assigned_tasks FOR DELETE TO authenticated USING (true);
