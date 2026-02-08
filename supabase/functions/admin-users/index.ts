import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: callerUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !callerUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Check if user has admin role
    const { data: adminRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerUser.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!adminRole) {
      return new Response(JSON.stringify({ error: "Forbidden - Admin access required" }), { 
        status: 403, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // LIST all auth users
    if (req.method === "GET" && action === "list") {
      const search = url.searchParams.get("search") || "";
      const page = parseInt(url.searchParams.get("page") || "1");
      const perPage = parseInt(url.searchParams.get("per_page") || "50");

      const { data: authUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      });

      if (listError) {
        console.error("List users error:", listError);
        return new Response(JSON.stringify({ error: listError.message }), { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      // Get marketplace profiles for cross-reference
      const { data: marketplaceProfiles } = await supabaseAdmin
        .from('marketplace_user_profiles')
        .select('user_id, first_name, last_name, phone, company_name');

      const profileMap = new Map(marketplaceProfiles?.map(p => [p.user_id, p]) || []);

      // Filter and map users
      let users = authUsers.users.map(u => {
        const profile = profileMap.get(u.id);
        return {
          id: u.id,
          email: u.email,
          created_at: u.created_at,
          email_confirmed_at: u.email_confirmed_at,
          last_sign_in_at: u.last_sign_in_at,
          first_name: profile?.first_name || u.user_metadata?.first_name || null,
          last_name: profile?.last_name || u.user_metadata?.last_name || null,
          phone: profile?.phone || u.phone || null,
          company_name: profile?.company_name || null,
          has_profile: !!profile,
          account_type: u.user_metadata?.account_type || 'unknown'
        };
      });

      // Apply search filter
      if (search) {
        const searchLower = search.toLowerCase();
        users = users.filter(u => 
          u.email?.toLowerCase().includes(searchLower) ||
          u.first_name?.toLowerCase().includes(searchLower) ||
          u.last_name?.toLowerCase().includes(searchLower) ||
          u.phone?.includes(search)
        );
      }

      return new Response(JSON.stringify({ 
        users,
        total: users.length
      }), { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // DELETE a user
    if (req.method === "DELETE") {
      const { user_id } = await req.json();
      
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id is required" }), { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      // Delete from marketplace_user_profiles first (if exists)
      await supabaseAdmin
        .from('marketplace_user_profiles')
        .delete()
        .eq('user_id', user_id);

      // Delete from user_roles
      await supabaseAdmin
        .from('user_roles')
        .delete()
        .eq('user_id', user_id);

      // Delete auth user
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id);

      if (deleteError) {
        console.error("Delete user error:", deleteError);
        return new Response(JSON.stringify({ error: deleteError.message }), { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      console.log(`✅ User ${user_id} deleted by admin ${callerUser.email}`);

      return new Response(JSON.stringify({ success: true, message: "Użytkownik usunięty" }), { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // CONFIRM email manually
    if (req.method === "POST" && action === "confirm-email") {
      const { user_id } = await req.json();
      
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id is required" }), { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        email_confirm: true
      });

      if (updateError) {
        console.error("Confirm email error:", updateError);
        return new Response(JSON.stringify({ error: updateError.message }), { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      console.log(`✅ Email confirmed for user ${user_id} by admin ${callerUser.email}`);

      return new Response(JSON.stringify({ success: true, message: "Email potwierdzony" }), { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { 
      status: 400, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (error) {
    console.error("Admin users error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
