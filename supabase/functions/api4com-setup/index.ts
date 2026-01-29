import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SetupRequest {
  company_id: string;
  api_token: string;
  bitrix_user_id?: string;
  user_name?: string;
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

    // Validate the Api4Com token by checking integrations endpoint
    console.log("Validating Api4Com token via integrations endpoint...");
    const validationResponse = await fetch("https://api.api4com.com/api/v1/integrations", {
      method: "GET",
      headers: {
        "Authorization": body.api_token,
        "Content-Type": "application/json",
      },
    });

    if (!validationResponse.ok) {
      const errorText = await validationResponse.text();
      console.error("Api4Com token validation failed:", errorText);
      return new Response(
        JSON.stringify({ 
          error: "Token Api4Com inválido. Verifique se o token está correto.", 
          details: errorText 
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validationData = await validationResponse.json();
    console.log("Api4Com token valid, current integrations:", JSON.stringify(validationData));

    // Extract domain and extension from sippulse integration
    let api4comDomain: string | null = null;
    let userExtension: string | null = null;
    
    if (Array.isArray(validationData)) {
      const sippulseIntegration = validationData.find(
        (integration: { gateway: string }) => integration.gateway === "sippulse"
      );
      
      if (sippulseIntegration?.metadata) {
        api4comDomain = sippulseIntegration.metadata.domain || null;
        userExtension = sippulseIntegration.metadata.username || null;
        console.log("Extracted from sippulse - Domain:", api4comDomain, "Extension:", userExtension);
      }
    }

    // Configure webhook on Api4Com with all event types
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
        // Subscribe to all call lifecycle events
        webhookTypes: ["channel-create", "channel-answer", "channel-hangup"],
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

    // Auto-create user mapping if we have extension and Bitrix user ID
    let userMappingCreated = false;
    if (userExtension && body.bitrix_user_id) {
      console.log("Creating auto user mapping:", userExtension, "->", body.bitrix_user_id);
      
      // Check if mapping already exists
      const { data: existingMapping } = await supabase
        .from("user_mappings")
        .select("id")
        .eq("company_id", body.company_id)
        .eq("api4com_extension", userExtension)
        .maybeSingle();
      
      if (!existingMapping) {
        const { error: mappingError } = await supabase
          .from("user_mappings")
          .insert({
            company_id: body.company_id,
            api4com_extension: userExtension,
            bitrix24_user_id: body.bitrix_user_id,
            user_name: body.user_name || null,
          });
        
        if (mappingError) {
          console.error("Error creating user mapping:", mappingError);
        } else {
          userMappingCreated = true;
          console.log("User mapping created successfully");
        }
      } else {
        console.log("User mapping already exists");
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        domain: api4comDomain,
        extension: userExtension,
        webhook_configured: webhookConfigured,
        webhook_url: webhookUrl,
        webhook_events: ["channel-create", "channel-answer", "channel-hangup"],
        user_mapping_created: userMappingCreated,
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
