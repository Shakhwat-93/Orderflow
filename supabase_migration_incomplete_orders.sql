-- Migration: Migrate legacy 'Pending' status orders to 'Incomplete' status
UPDATE public.orders 
SET status = 'Incomplete', 
    updated_at = NOW() 
WHERE status = 'Pending';
