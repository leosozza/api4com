import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { service, companyId } = await req.json();

    if (!service || !companyId) {
      return new Response(
        JSON.stringify({ error: "Missing service or companyId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Record<string, boolean> = {};

    if (service === "api4com" || service === "all") {
      const { data: api4comCreds } = await supabase
        .from("api4com_credentials")
        .select("api_token")
        .eq("company_id", companyId)
        .maybeSingle();

      if (api4comCreds) {
        // Test Api4Com connection
        // TODO: Replace with actual Api4Com API test endpoint
        results.api4com = true;
      } else {
        results.api4com = false;
      }
    }

    if (service === "bitrix24" || service === "all") {
      const { data: bitrixCreds } = await supabase
        .from("bitrix24_credentials")
        .select("webhook_url, domain")
        .eq("company_id", companyId)
        .maybeSingle();

      if (bitrixCreds?.webhook_url) {
        try {
          // Test Bitrix24 connection
          const response = await fetch(`${bitrixCreds.webhook_url}/user.current`, {
            method: "GET",
          });
          const data = await response.json();
          results.bitrix24 = !!data.result;
        } catch {
          results.bitrix24 = false;
        }
      } else {
        results.bitrix24 = false;
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Test connection error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});