import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Hardcoded call data for Deal 134 recovery
const CALL_DATA = {
  CALL_ID: "externalCall.d58222b22d4e11e3d273c9b174a08d9e.1771443560",
  USER_ID: "1",
  DURATION: 180,
  STATUS_CODE: "200",
  RECORD_URL: "https://listener.api4com.com/files/listen/a6f1f205-1232-4705-a53f-599e3241826d.mp3",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { company_id } = await req.json();
    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Fetch Bitrix24 credentials
    const { data: creds, error: credsErr } = await supabase
      .from("bitrix24_credentials")
      .select("*")
      .eq("company_id", company_id)
      .single();

    if (credsErr || !creds) {
      return new Response(JSON.stringify({ error: "Credentials not found", detail: credsErr }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Current token expires_at:", creds.expires_at);
    console.log("Refresh token available:", !!creds.refresh_token);

    // 2. Refresh OAuth token
    const clientId = Deno.env.get("BITRIX_CLIENT_ID");
    const clientSecret = Deno.env.get("BITRIX_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: "BITRIX_CLIENT_ID/SECRET not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!creds.refresh_token) {
      return new Response(JSON.stringify({ error: "No refresh_token available" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Refreshing OAuth token...");
    const tokenUrl = `https://oauth.bitrix.info/oauth/token/?grant_type=refresh_token&client_id=${clientId}&client_secret=${clientSecret}&refresh_token=${creds.refresh_token}`;
    
    const tokenResp = await fetch(tokenUrl);
    const tokenData = await tokenResp.json();
    console.log("Token refresh response:", JSON.stringify(tokenData));

    if (!tokenData.access_token) {
      return new Response(JSON.stringify({ error: "Token refresh failed", detail: tokenData }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Save new token
    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();
    const { error: updateErr } = await supabase
      .from("bitrix24_credentials")
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt,
      })
      .eq("company_id", company_id);

    if (updateErr) {
      console.error("Failed to save new token:", updateErr);
    } else {
      console.log("New token saved, expires_at:", expiresAt);
    }

    // 4. Send telephony.externalcall.finish
    const baseUrl = creds.client_endpoint || `https://${creds.domain}/rest/`;
    const endpoint = baseUrl.endsWith("/")
      ? `${baseUrl}telephony.externalcall.finish`
      : `${baseUrl}/telephony.externalcall.finish`;

    const finishBody = {
      ...CALL_DATA,
      auth: tokenData.access_token,
    };

    console.log("Calling:", endpoint);
    console.log("Body:", JSON.stringify(finishBody));

    const finishResp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(finishBody),
    });

    const finishResult = await finishResp.json();
    console.log("Finish response:", JSON.stringify(finishResult));

    return new Response(JSON.stringify({
      success: true,
      token_refreshed: true,
      finish_result: finishResult,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
