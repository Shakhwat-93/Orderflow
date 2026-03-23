-- Create a table to store user push subscriptions
CREATE TABLE IF NOT EXISTS public.user_push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription JSONB NOT NULL,
    pwa_platform TEXT, -- 'ios', 'android', 'desktop'
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only manage their own subscriptions
CREATE POLICY "Users can manage their own push subscriptions"
    ON public.user_push_subscriptions
    FOR ALL
    USING (auth.uid() = user_id);

-- Add a column to notifications table for push target tracking if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='push_sent') THEN
        ALTER TABLE public.notifications ADD COLUMN push_sent BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Create a hook to trigger push notification (to be handled by Supabase Edge Functions)
-- Note: This is a placeholder for the logic that will invoke the edge function via HTTP or DB hook
