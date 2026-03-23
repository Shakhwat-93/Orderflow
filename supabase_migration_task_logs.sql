-- Migration Script: Task Activity Logs

CREATE TABLE IF NOT EXISTS task_activity_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL, 
  task_type TEXT NOT NULL CHECK (task_type IN ('daily', 'assigned')),
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_description TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_logs_task_id ON task_activity_logs(task_id);

ALTER TABLE task_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_task_logs" ON task_activity_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_task_logs" ON task_activity_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Enable Realtime for the table so we can listen to it
ALTER PUBLICATION supabase_realtime ADD TABLE task_activity_logs;
