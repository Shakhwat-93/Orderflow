import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"
import webpush from "https://esm.sh/web-push@3.6.4"

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')

webpush.setVapidDetails(
  'mailto:your-email@example.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
)

serve(async (req) => {
  try {
    const { notification_id, user_id, title, message, url } = await req.json()

    // 1. Initialize Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    )

    // 2. Fetch all subscriptions for the target user
    const { data: subscriptions, error: subError } = await supabase
      .from('user_push_subscriptions')
      .select('subscription')
      .eq('user_id', user_id)

    if (subError || !subscriptions) {
      return new Response(JSON.stringify({ error: 'Failed to fetch subscriptions' }), { status: 500 })
    }

    const payload = JSON.stringify({ title, message, url })

    // 3. Send push to each subscription
    const pushPromises = subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(sub.subscription, payload)
        return { status: 'success' }
      } catch (err) {
        // If subscription is expired/invalid, we should delete it
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase
            .from('user_push_subscriptions')
            .delete()
            .filter('subscription->>endpoint', 'eq', sub.subscription.endpoint)
        }
        return { status: 'failed', error: err.message }
      }
    })

    const results = await Promise.allSettled(pushPromises)

    // 4. Update the notification as 'push_sent'
    if (notification_id) {
        await supabase
          .from('notifications')
          .update({ push_sent: true })
          .eq('id', notification_id)
    }

    return new Response(JSON.stringify({ results }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    })
  }
})
