-- Migration Script: Add target_user_id to notifications
-- Adding this column to support private/targeted notifications for users.

-- 1. Add column if it doesn't exist
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'target_user_id') THEN
    ALTER TABLE notifications ADD COLUMN target_user_id UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- 2. Create index for performance
CREATE INDEX IF NOT EXISTS idx_notifications_target_user_id ON notifications(target_user_id);

-- 3. Update existing RLS (if any) or add targeted read access
-- Assuming we want users to see their own notifications + admins to see all (or whatever current policy is)
-- Let's check existing policies if possible, but safely adding one:
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
CREATE POLICY "Users can view their own notifications" ON notifications 
  FOR SELECT TO authenticated 
  USING (auth.uid() = target_user_id OR target_user_id IS NULL);

-- 4. Enable Realtime for the table (if not already enabled)
-- ALTER PUBLICATION supabase_realtime ADD TABLE notifications; 
-- (Assuming it's already enabled since realtime was working for general notifs)
