// AgroFinca - Admin API Edge Function
// Manages users, plans, and system stats
// Requires admin role

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Validate JWT and check admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Check admin role
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "stats": {
        const { count: totalUsers } = await supabase.from("user_profiles").select("*", { count: "exact", head: true });
        const { count: premiumUsers } = await supabase.from("user_profiles").select("*", { count: "exact", head: true }).eq("plan", "paid");
        const { count: totalFincas } = await supabase.from("fincas").select("*", { count: "exact", head: true });
        const { count: totalVentas } = await supabase.from("ventas").select("*", { count: "exact", head: true });
        const { count: totalCostos } = await supabase.from("costos").select("*", { count: "exact", head: true });

        return new Response(JSON.stringify({
          totalUsers: totalUsers || 0,
          premiumUsers: premiumUsers || 0,
          totalFincas: totalFincas || 0,
          totalTransactions: (totalVentas || 0) + (totalCostos || 0)
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "list-users": {
        const { data: users } = await supabase
          .from("user_profiles")
          .select("*")
          .order("created_at", { ascending: false });

        return new Response(JSON.stringify({ users: users || [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      case "update-user": {
        const { userId, updates } = body;
        if (!userId || !updates) {
          return new Response(JSON.stringify({ error: "userId and updates required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const { error } = await supabase
          .from("user_profiles")
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq("id", userId);

        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      case "upgrade-requests": {
        const { data: requests } = await supabase
          .from("upgrade_requests")
          .select("*")
          .eq("status", "pending")
          .order("created_at", { ascending: false });

        return new Response(JSON.stringify({ requests: requests || [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      case "approve-upgrade": {
        const { userId, requestId } = body;

        // Update user plan
        await supabase
          .from("user_profiles")
          .update({ plan: "paid", updated_at: new Date().toISOString() })
          .eq("id", userId);

        // Update request status
        if (requestId) {
          await supabase
            .from("upgrade_requests")
            .update({ status: "approved", updated_at: new Date().toISOString() })
            .eq("id", requestId);
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }

  } catch (err) {
    console.error("Admin API error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
