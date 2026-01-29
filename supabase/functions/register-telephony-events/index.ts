import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface BitrixTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  member_id: string;
  client_endpoint: string;
}

interface BitrixApiResponse<T = unknown> {
  result?: T;
  error?: string;
  error_description?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const BITRIX_CLIENT_ID = Deno.env.get("BITRIX_CLIENT_ID");
    const BITRIX_CLIENT_SECRET = Deno.env.get("BITRIX_CLIENT_SECRET");

    if (!BITRIX_CLIENT_ID || !BITRIX_CLIENT_SECRET) {
      console.error("Missing Bitrix24 credentials");
      return new Response(
        JSON.stringify({ error: "Bitrix24 client credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { company_id, phone_line_number, phone_line_name, member_id } = await req.json();

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: "company_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("=== Register Telephony Events ===");
    console.log("Company ID:", company_id);
    console.log("Member ID:", member_id);
    console.log("Phone Line:", phone_line_number);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Get Bitrix24 credentials - with fallback by member_id
    let credentials = null;

    // First try: by company_id
    const { data: byCompany } = await supabase
      .from("bitrix24_credentials")
      .select("*")
      .eq("company_id", company_id)
      .maybeSingle();

    if (byCompany) {
      credentials = byCompany;
      console.log("Found credentials by company_id");
    } else if (member_id) {
      // Fallback: by member_id
      const { data: byMember } = await supabase
        .from("bitrix24_credentials")
        .select("*")
        .eq("member_id", member_id)
        .maybeSingle();
      
      if (byMember) {
        credentials = byMember;
        console.log("Found credentials by member_id (fallback)");
      }
    }

    if (!credentials) {
      console.error("Bitrix24 credentials not found for company or member_id");
      return new Response(
        JSON.stringify({ error: "Bitrix24 credentials not found. Please ensure the app is installed in Bitrix24." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Found credentials for domain:", credentials.domain);

    // 2. Refresh OAuth token
    console.log("Refreshing OAuth token...");
    const refreshResponse = await fetch("https://oauth.bitrix.info/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: BITRIX_CLIENT_ID,
        client_secret: BITRIX_CLIENT_SECRET,
        refresh_token: credentials.refresh_token,
      }),
    });

    if (!refreshResponse.ok) {
      const errorText = await refreshResponse.text();
      console.error("Token refresh failed:", errorText);
      return new Response(
        JSON.stringify({ 
          error: "Failed to refresh Bitrix24 token. Please reinstall the app.",
          details: errorText
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenData: BitrixTokenResponse = await refreshResponse.json();
    console.log("Token refreshed successfully");

    // 3. Update tokens in database (use credentials.company_id to ensure correct company)
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
    await supabase
      .from("bitrix24_credentials")
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt,
        client_endpoint: tokenData.client_endpoint || credentials.client_endpoint,
      })
      .eq("id", credentials.id);

    console.log("Tokens updated in database");

    const accessToken = tokenData.access_token;
    const domain = credentials.domain;
    const webhookUrl = `${SUPABASE_URL}/functions/v1/bitrix24-webhook`;

    const results = {
      tokenRefreshed: true,
      eventsRegistered: [] as string[],
      externalLineRegistered: false,
      errors: [] as string[],
    };

    // 4. Register ONEXTERNALCALLSTART event
    console.log("Registering ONEXTERNALCALLSTART event...");
    try {
      const callStartResponse = await fetch(
        `https://${domain}/rest/event.bind?auth=${accessToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "ONEXTERNALCALLSTART",
            handler: webhookUrl,
          }),
        }
      );
      const callStartResult: BitrixApiResponse = await callStartResponse.json();
      if (callStartResult.error) {
        console.error("ONEXTERNALCALLSTART registration error:", callStartResult.error);
        results.errors.push(`ONEXTERNALCALLSTART: ${callStartResult.error}`);
      } else {
        console.log("ONEXTERNALCALLSTART registered successfully");
        results.eventsRegistered.push("ONEXTERNALCALLSTART");
      }
    } catch (error) {
      console.error("ONEXTERNALCALLSTART registration exception:", error);
      results.errors.push(`ONEXTERNALCALLSTART: ${error}`);
    }

    // 5. Register ONEXTERNALCALLBACKSTART event
    console.log("Registering ONEXTERNALCALLBACKSTART event...");
    try {
      const callbackResponse = await fetch(
        `https://${domain}/rest/event.bind?auth=${accessToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "ONEXTERNALCALLBACKSTART",
            handler: webhookUrl,
          }),
        }
      );
      const callbackResult: BitrixApiResponse = await callbackResponse.json();
      if (callbackResult.error) {
        console.error("ONEXTERNALCALLBACKSTART registration error:", callbackResult.error);
        results.errors.push(`ONEXTERNALCALLBACKSTART: ${callbackResult.error}`);
      } else {
        console.log("ONEXTERNALCALLBACKSTART registered successfully");
        results.eventsRegistered.push("ONEXTERNALCALLBACKSTART");
      }
    } catch (error) {
      console.error("ONEXTERNALCALLBACKSTART registration exception:", error);
      results.errors.push(`ONEXTERNALCALLBACKSTART: ${error}`);
    }

    // 6. Register external phone line (if provided)
    if (phone_line_number) {
      console.log("Registering external line:", phone_line_number);
      try {
        const lineResponse = await fetch(
          `https://${domain}/rest/telephony.externalLine.add?auth=${accessToken}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              NUMBER: phone_line_number,
              NAME: phone_line_name || "Api4Com",
            }),
          }
        );
        const lineResult: BitrixApiResponse = await lineResponse.json();
        if (lineResult.error) {
          // Check if line already exists
          if (lineResult.error === "LINE_EXIST") {
            console.log("External line already exists");
            results.externalLineRegistered = true;
          } else {
            console.error("External line registration error:", lineResult.error);
            results.errors.push(`External line: ${lineResult.error}`);
          }
        } else {
          console.log("External line registered successfully");
          results.externalLineRegistered = true;
        }
      } catch (error) {
        console.error("External line registration exception:", error);
        results.errors.push(`External line: ${error}`);
      }
    }

    // 7. Verify registered events
    console.log("Verifying registered events...");
    try {
      const eventsResponse = await fetch(
        `https://${domain}/rest/event.get?auth=${accessToken}`,
        { method: "POST" }
      );
      const eventsResult: BitrixApiResponse<Array<{ event: string; handler: string }>> = await eventsResponse.json();
      if (eventsResult.result) {
        const ourEvents = eventsResult.result.filter(e => e.handler.includes("bitrix24-webhook"));
        console.log("Our registered events:", ourEvents);
      }
    } catch (error) {
      console.error("Event verification failed:", error);
    }

    const success = results.eventsRegistered.length > 0;

    console.log("=== Registration Complete ===");
    console.log("Results:", JSON.stringify(results, null, 2));

    return new Response(
      JSON.stringify({
        success,
        message: success 
          ? `Eventos registrados: ${results.eventsRegistered.join(", ")}` 
          : "Falha ao registrar eventos",
        ...results,
      }),
      { 
        status: success ? 200 : 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
