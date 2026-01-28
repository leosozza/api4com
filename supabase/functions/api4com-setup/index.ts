import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SetupRequest {
  company_id: string;
  api_token: string;
}

interface Api4ComIntegrationResponse {
  success?: boolean;
  error?: string;
  domain?: string;
  gateway?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: SetupRequest = await req.json();
    console.log("=== Api4Com Setup Request ===");
    console.log("Company ID:", body.company_id);

    if (!body.company_id || !body.api_token) {
      return new Response(
        JSON.stringify({ error: "Missing company_id or api_token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase credentials");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // First, validate the Api4Com token by getting account info
    console.log("Validating Api4Com token...");
    const accountResponse = await fetch("https://api.api4com.com/api/v1/account", {
      method: "GET",
      headers: {
        "Authorization": body.api_token,
        "Content-Type": "application/json",
      },
    });

    if (!accountResponse.ok) {
      const errorText = await accountResponse.text();
      console.error("Api4Com account validation failed:", errorText);
      return new Response(
        JSON.stringify({ 
          error: "Token Api4Com inválido", 
          details: errorText 
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accountData = await accountResponse.json();
    console.log("Api4Com account data:", JSON.stringify(accountData));

    // Extract domain from account data
    const api4comDomain = accountData.domain || accountData.company?.domain || null;
    console.log("Api4Com domain:", api4comDomain);

    // Configure webhook on Api4Com
    const webhookUrl = `${supabaseUrl}/functions/v1/api4com-webhook`;
    console.log("Configuring webhook URL:", webhookUrl);

    const integrationPayload = {
      gateway: "bitrix24-connector",
      webhook: true,
      webhookConstraint: {
        metadata: {
          gateway: "bitrix24-connector",
          companyId: body.company_id,
        },
      },
      metadata: {
        webhookUrl: webhookUrl,
        webhookVersion: "v1.4",
        webhookTypes: ["channel-hangup"],
        companyId: body.company_id,
      },
    };

    console.log("Integration payload:", JSON.stringify(integrationPayload));

    const integrationResponse = await fetch("https://api.api4com.com/api/v1/integrations", {
      method: "PATCH",
      headers: {
        "Authorization": body.api_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(integrationPayload),
    });

    let webhookConfigured = false;
    let integrationResult: Api4ComIntegrationResponse = {};

    if (integrationResponse.ok) {
      integrationResult = await integrationResponse.json();
      console.log("Integration configured successfully:", JSON.stringify(integrationResult));
      webhookConfigured = true;
    } else {
      const errorText = await integrationResponse.text();
      console.error("Failed to configure integration:", errorText);
      // Don't fail the setup if webhook configuration fails
      // The user can still use Click-to-Call
      integrationResult = { error: errorText };
    }

    // Update api4com_credentials with domain and webhook status
    const { error: updateError } = await supabase
      .from("api4com_credentials")
      .update({
        api4com_domain: api4comDomain,
        webhook_configured: webhookConfigured,
      })
      .eq("company_id", body.company_id);

    if (updateError) {
      console.error("Error updating credentials:", updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        domain: api4comDomain,
        webhook_configured: webhookConfigured,
        webhook_url: webhookUrl,
        integration_result: integrationResult,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Setup error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
