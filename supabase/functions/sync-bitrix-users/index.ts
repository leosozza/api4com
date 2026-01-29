import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SyncRequest {
  company_id: string;
}

interface BitrixUser {
  ID: string;
  NAME: string;
  LAST_NAME: string;
  EMAIL: string;
  PERSONAL_PHONE?: string;
  WORK_PHONE?: string;
  UF_PHONE_INNER?: string;
  ACTIVE: boolean;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: SyncRequest = await req.json();
    console.log("=== Sync Bitrix Users Request ===");
    console.log("Company ID:", body.company_id);

    if (!body.company_id) {
      return new Response(
        JSON.stringify({ error: "Missing company_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase credentials");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Bitrix24 credentials for the company
    const { data: bitrixCreds, error: credError } = await supabase
      .from("bitrix24_credentials")
      .select("domain, access_token, client_endpoint")
      .eq("company_id", body.company_id)
      .maybeSingle();

    if (credError || !bitrixCreds) {
      console.error("Bitrix24 credentials not found:", credError);
      return new Response(
        JSON.stringify({ error: "Bitrix24 credentials not found for company" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch users from Bitrix24 using user.get
    const baseUrl = bitrixCreds.client_endpoint || `https://${bitrixCreds.domain}/rest/`;
    const endpoint = baseUrl.includes("/rest/") 
      ? `${baseUrl}user.get`
      : `${baseUrl}/user.get`;

    const requestBody: Record<string, unknown> = {
      ACTIVE: true,
      auth: bitrixCreds.access_token,
    };

    console.log("Fetching users from Bitrix24:", endpoint);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json();
    
    if (result?.error) {
      console.error("Bitrix24 error:", result.error_description || result.error);
      return new Response(
        JSON.stringify({ 
          error: "Failed to fetch users from Bitrix24", 
          details: result.error_description || result.error 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const bitrixUsers: BitrixUser[] = result?.result || [];
    console.log(`Fetched ${bitrixUsers.length} users from Bitrix24`);

    // Map users to a simpler format
    const users = bitrixUsers.map(user => ({
      id: user.ID,
      name: `${user.NAME || ""} ${user.LAST_NAME || ""}`.trim(),
      email: user.EMAIL,
      phone: user.PERSONAL_PHONE || user.WORK_PHONE || "",
      internal_phone: user.UF_PHONE_INNER || "",
      active: user.ACTIVE,
    }));

    console.log("Users mapped successfully");
    return new Response(
      JSON.stringify({ 
        success: true, 
        users,
        count: users.length 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error syncing users:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
