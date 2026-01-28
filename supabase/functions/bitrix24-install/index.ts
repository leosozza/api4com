import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BitrixInstallEvent {
  event: string;
  auth: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    domain: string;
    member_id: string;
    client_endpoint: string;
    application_token: string;
  };
  data?: {
    LANGUAGE_ID?: string;
    VERSION?: number;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    let body: BitrixInstallEvent;

    // Bitrix can send data as form-urlencoded or JSON
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      const event = formData.get("event") as string;
      const authRaw = formData.get("auth");
      const dataRaw = formData.get("data");
      
      const auth = authRaw ? JSON.parse(authRaw as string) : {};
      const data = dataRaw ? JSON.parse(dataRaw as string) : {};
      
      body = { event, auth, data };
    } else {
      body = await req.json();
    }

    console.log("Bitrix24 install event received:", JSON.stringify({
      event: body.event,
      domain: body.auth?.domain,
      member_id: body.auth?.member_id,
    }));

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase credentials");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { auth } = body;

    if (!auth?.member_id || !auth?.domain) {
      console.error("Missing required auth fields");
      return new Response(
        JSON.stringify({ error: "Missing required auth fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate token expiration
    const expiresAt = new Date(Date.now() + (auth.expires_in || 3600) * 1000).toISOString();

    // Check if company already exists
    const { data: existingCompany, error: findError } = await supabase
      .from("companies")
      .select("id")
      .eq("bitrix_member_id", auth.member_id)
      .maybeSingle();

    if (findError) {
      console.error("Error finding company:", findError);
      throw findError;
    }

    let companyId: string;

    if (existingCompany) {
      // Update existing company's credentials
      companyId = existingCompany.id;
      console.log("Updating existing company:", companyId);

      const { error: updateError } = await supabase
        .from("bitrix24_credentials")
        .upsert({
          company_id: companyId,
          domain: auth.domain,
          access_token: auth.access_token,
          refresh_token: auth.refresh_token,
          expires_at: expiresAt,
          member_id: auth.member_id,
          client_endpoint: auth.client_endpoint,
        }, {
          onConflict: 'company_id',
        });

      if (updateError) {
        console.error("Error updating credentials:", updateError);
        throw updateError;
      }
    } else {
      // Create new company
      console.log("Creating new company for member:", auth.member_id);

      const { data: newCompany, error: createError } = await supabase
        .from("companies")
        .insert({
          name: `Portal ${auth.domain}`,
          bitrix_member_id: auth.member_id,
        })
        .select("id")
        .single();

      if (createError) {
        console.error("Error creating company:", createError);
        throw createError;
      }

      companyId = newCompany.id;

      // Create credentials for the new company
      const { error: credError } = await supabase
        .from("bitrix24_credentials")
        .insert({
          company_id: companyId,
          domain: auth.domain,
          access_token: auth.access_token,
          refresh_token: auth.refresh_token,
          expires_at: expiresAt,
          member_id: auth.member_id,
          client_endpoint: auth.client_endpoint,
        });

      if (credError) {
        console.error("Error creating credentials:", credError);
        throw credError;
      }
    }

    // Register webhooks for telephony events
    const webhookBaseUrl = `${supabaseUrl}/functions/v1/bitrix24-webhook`;
    
    try {
      // Register ONEXTERNALCALLSTART event handler
      await registerBitrixEvent(auth, "ONEXTERNALCALLSTART", webhookBaseUrl);
      await registerBitrixEvent(auth, "ONEXTERNALCALLBACKSTART", webhookBaseUrl);
      console.log("Webhooks registered successfully");
    } catch (webhookError) {
      console.error("Error registering webhooks:", webhookError);
      // Don't fail the installation if webhook registration fails
    }

    console.log("Installation completed for company:", companyId);

    // Return success - Bitrix expects specific response
    return new Response(
      JSON.stringify({ 
        success: true,
        company_id: companyId,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error: unknown) {
    console.error("Installation error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function registerBitrixEvent(
  auth: BitrixInstallEvent["auth"],
  eventName: string,
  handlerUrl: string
): Promise<void> {
  const response = await fetch(`${auth.client_endpoint}event.bind`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auth: auth.access_token,
      event: eventName,
      handler: handlerUrl,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Failed to register ${eventName}:`, text);
  }
}
