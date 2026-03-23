-- RUN THIS IN SQL EDITOR TO STOP THE CRASH IMMEDIATELY
DROP TRIGGER IF EXISTS on_notification_created_push ON public.notifications;
DROP FUNCTION IF EXISTS public.trigger_push_notification();
