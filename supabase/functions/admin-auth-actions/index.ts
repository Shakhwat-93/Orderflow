import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, userId, password, userData } = await req.json()

    // Initialize Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verify Admin Status of Caller (Optional but safer)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No authorization header')

    // Performance check: Get caller's profile role
    const { data: { user: caller }, error: callerError } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (callerError || !caller) throw new Error('Invalid caller')

    const { data: rolesData } = await supabaseAdmin
      .from('user_roles')
      .select('role_id')
      .eq('user_id', caller.id)

    const isAdmin = rolesData?.some(r => r.role_id === 'Admin')
    if (!isAdmin) throw new Error('Unauthorized: Only admins can perform auth actions')

    let result;

    if (action === 'reset-password') {
      if (!userId || !password) throw new Error('Missing userId or password')
      
      const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        { password: password }
      )
      if (error) throw error
      result = { success: true, message: 'Password reset successfully' }

    } else if (action === 'create-user') {
      // Logic similar to existing create-user-admin if needed
      const { name, email, password: userPass, role } = userData
      
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: userPass,
        email_confirm: true
      })
      if (authError) throw authError

      // Create profile
      const { error: profileError } = await supabaseAdmin.from('users').insert({
        id: authUser.user.id,
        name,
        email,
        status: 'active'
      })
      if (profileError) throw profileError

      // Assign role
      const { error: roleError } = await supabaseAdmin.from('user_roles').insert({
        user_id: authUser.user.id,
        role_id: role || 'Call Team'
      })
      if (roleError) throw roleError

      result = { success: true, user: authUser.user }
    } else {
      throw new Error(`Unknown action: ${action}`)
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
