import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RegisterLineRequest {
  company_id: string;
  line_number: string;
  line_name?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: RegisterLineRequest = await req.json();
    console.log("=== Register External Line Request ===");
    console.log("Company ID:", body.company_id);
    console.log("Line Number:", body.line_number);
    console.log("Line Name:", body.line_name);

    if (!body.company_id || !body.line_number) {
      return new Response(
        JSON.stringify({ error: "Missing company_id or line_number" }),
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

    // Register line in Bitrix24 using telephony.externalLine.add
    // For OAuth apps, client_endpoint is oauth.bitrix.info which requires auth param
    // For webhook apps, we use the domain directly
    let endpoint: string;
    let requestBody: Record<string, unknown>;

    if (bitrixCreds.client_endpoint && bitrixCreds.client_endpoint.includes("oauth.bitrix.info")) {
      // OAuth app - use client_endpoint with auth parameter
      endpoint = `${bitrixCreds.client_endpoint}telephony.externalLine.add`;
      requestBody = {
        NUMBER: body.line_number,
        NAME: body.line_name || body.line_number,
        CRM_AUTO_CREATE: "Y",
        auth: bitrixCreds.access_token,
      };
    } else if (bitrixCreds.client_endpoint) {
      // Has custom client_endpoint (likely includes token in URL)
      endpoint = bitrixCreds.client_endpoint.endsWith("/")
        ? `${bitrixCreds.client_endpoint}telephony.externalLine.add`
        : `${bitrixCreds.client_endpoint}/telephony.externalLine.add`;
      requestBody = {
        NUMBER: body.line_number,
        NAME: body.line_name || body.line_number,
        CRM_AUTO_CREATE: "Y",
        auth: bitrixCreds.access_token,
      };
    } else {
      // Webhook mode - use domain directly (should not happen for marketplace apps)
      endpoint = `https://${bitrixCreds.domain}/rest/telephony.externalLine.add`;
      requestBody = {
        NUMBER: body.line_number,
        NAME: body.line_name || body.line_number,
        CRM_AUTO_CREATE: "Y",
        auth: bitrixCreds.access_token,
      };
    }

    console.log("Registering line in Bitrix24:", endpoint);
    console.log("Using OAuth mode:", bitrixCreds.client_endpoint?.includes("oauth.bitrix.info") ? "yes" : "no");
    console.log("Request body:", JSON.stringify(requestBody));

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json();
    console.log("Bitrix24 response:", JSON.stringify(result));

    if (result?.error) {
      // Check if line already exists
      if (result.error === "ERROR_ADDING_NUMBER" || result.error_description?.includes("already")) {
        console.log("Line already registered in Bitrix24");
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Line already registered in Bitrix24",
            already_exists: true 
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.error("Bitrix24 error:", result.error_description || result.error);
      return new Response(
        JSON.stringify({ 
          error: "Failed to register line in Bitrix24", 
          details: result.error_description || result.error 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Line registered successfully in Bitrix24");
    return new Response(
      JSON.stringify({ 
        success: true, 
        line_id: result?.result,
        message: "Line registered in Bitrix24" 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error registering line:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
