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

    } else if (action === 'confirm-user') {
      if (!userId) throw new Error('Missing userId')

      const { data: existingUser } = await supabaseAdmin.auth.admin.getUserById(userId)

      const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        {
          email_confirm: true,
          user_metadata: {
            ...(existingUser?.user?.user_metadata || {}),
            email_confirmed_by_admin: caller.id,
            email_confirmed_at: new Date().toISOString()
          }
        }
      )
      if (error) throw error
      result = { success: true, user: data.user, message: 'User email confirmed successfully' }

    } else if (action === 'create-user') {
      // Logic similar to existing create-user-admin if needed
      const { name, email, password: userPass, role } = userData
      
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: userPass,
        email_confirm: true,
        user_metadata: {
          name,
          created_by_admin: caller.id
        }
      })
      if (authError) throw authError

      const { data: confirmedUser, error: confirmError } = await supabaseAdmin.auth.admin.updateUserById(
        authUser.user.id,
        {
          email_confirm: true,
          user_metadata: {
            ...(authUser.user.user_metadata || {}),
            name,
            created_by_admin: caller.id,
            email_confirmed_by_admin: caller.id,
            email_confirmed_at: new Date().toISOString()
          }
        }
      )
      if (confirmError) throw confirmError

      // Create profile
      const { error: profileError } = await supabaseAdmin.from('users').upsert({
        id: authUser.user.id,
        name,
        email,
        status: 'active'
      }, { onConflict: 'id' })
      if (profileError) throw profileError

      // Assign role
      const { error: roleError } = await supabaseAdmin.from('user_roles').upsert({
        user_id: authUser.user.id,
        role_id: role || 'Call Team'
      }, { onConflict: 'user_id,role_id' })
      if (roleError) throw roleError

      result = { success: true, user: confirmedUser.user || authUser.user }
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
