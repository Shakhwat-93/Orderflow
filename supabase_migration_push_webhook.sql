-- Final Step: Create a Database Webhook to trigger Push Notifications
-- Run this in your Supabase SQL Editor

-- 1. Enable the net extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "http" WITH SCHEMA "extensions";

-- 2. Create the trigger function
CREATE OR REPLACE FUNCTION public.trigger_push_notification()
RETURNS TRIGGER AS $$
DECLARE
  payload JSONB;
BEGIN
  -- Construct the payload for the Edge Function
  payload := jsonb_build_object(
    'notification_id', NEW.id,
    'user_id', NEW.target_user_id,
    'title', NEW.title,
    'message', NEW.message,
    'url', '/'
  );

  -- Perform the HTTP POST request to your Edge Function
  PERFORM
    net.http_post(
      url := 'http://supabasekong-a5tg2fvpwj6emkewfdknamid.187.77.159.209.sslip.io/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := payload
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create the trigger on the notifications table
DROP TRIGGER IF EXISTS on_notification_created_push ON public.notifications;
CREATE TRIGGER on_notification_created_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_push_notification();
