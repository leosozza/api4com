import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Api4Com WebPhone v1.4 webhook format
interface Api4ComWebhookV14 {
  version: string;
  eventType: "channel-hangup" | "channel-create" | "channel-answer";
  id: string;
  domain: string;
  direction: "inbound" | "outbound";
  caller: string;
  called: string;
  startedAt: string;
  answeredAt?: string;
  endedAt: string;
  duration: number;
  hangupCause: string;
  hangupCauseCode: string;
  recordUrl?: string;
  metadata?: {
    gateway?: string;
    bitrixUserId?: string;
    companyId?: string;
    bitrixCallId?: string;
    [key: string]: unknown;
  };
}

// Determine call status based on hangup cause and answered state
function getCallStatus(event: Api4ComWebhookV14): string {
  if (!event.answeredAt) {
    if (event.hangupCause === "NO_ANSWER") return "missed";
    if (event.hangupCause === "ORIGINATOR_CANCEL") return "missed";
    if (event.hangupCause === "USER_BUSY") return "busy";
    return "missed";
  }
  if (event.duration > 0) return "completed";
  if (event.hangupCause === "NORMAL_CLEARING") return "completed";
  return "completed";
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: Api4ComWebhookV14 = await req.json();
    console.log("=== Api4Com Webhook v1.4 Received ===");
    console.log("Event Type:", body.eventType);
    console.log("Call ID:", body.id);
    console.log("Domain:", body.domain);
    console.log("Direction:", body.direction);
    console.log("Caller:", body.caller);
    console.log("Called:", body.called);
    console.log("Duration:", body.duration);
    console.log("Hangup Cause:", body.hangupCause);
    console.log("Record URL:", body.recordUrl);
    console.log("Metadata:", JSON.stringify(body.metadata));

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase credentials");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Only process channel-hangup events (call completed)
    if (body.eventType !== "channel-hangup") {
      console.log("Ignoring event type:", body.eventType);
      return new Response(
        JSON.stringify({ success: true, message: "Event type ignored" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find company by api4com_domain or by metadata.companyId
    let companyId: string | null = null;
    let api4comToken: string | null = null;

    // First try to find by metadata.companyId (most reliable)
    if (body.metadata?.companyId) {
      const { data: creds } = await supabase
        .from("api4com_credentials")
        .select("company_id, api_token")
        .eq("company_id", body.metadata.companyId)
        .maybeSingle();
      
      if (creds) {
        companyId = creds.company_id;
        api4comToken = creds.api_token;
        console.log("Found company by metadata.companyId:", companyId);
      }
    }

    // Fallback: find by api4com_domain
    if (!companyId && body.domain) {
      const { data: creds } = await supabase
        .from("api4com_credentials")
        .select("company_id, api_token")
        .eq("api4com_domain", body.domain)
        .maybeSingle();
      
      if (creds) {
        companyId = creds.company_id;
        api4comToken = creds.api_token;
        console.log("Found company by domain:", companyId);
      }
    }

    // Fallback: find by gateway in metadata
    if (!companyId && body.metadata?.gateway) {
      // If gateway contains a specific identifier, try to match
      console.log("Trying to find company by gateway:", body.metadata.gateway);
      
      // List all companies with api4com configured and find matching one
      const { data: allCreds } = await supabase
        .from("api4com_credentials")
        .select("company_id, api_token, api4com_domain")
        .eq("webhook_configured", true);
      
      if (allCreds && allCreds.length === 1) {
        // If only one company configured, use it
        companyId = allCreds[0].company_id;
        api4comToken = allCreds[0].api_token;
        console.log("Found single configured company:", companyId);
      }
    }

    if (!companyId) {
      console.error("Company not found for domain:", body.domain);
      return new Response(
        JSON.stringify({ error: "Company not found", domain: body.domain }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find user mapping by caller (extension/ramal)
    const extension = body.direction === "outbound" ? body.caller : body.called;
    console.log("Looking for extension:", extension);

    const { data: userMapping } = await supabase
      .from("user_mappings")
      .select("id, bitrix24_user_id")
      .eq("company_id", companyId)
      .eq("api4com_extension", extension)
      .maybeSingle();

    console.log("User mapping found:", userMapping);

    // Get default phone line
    const { data: phoneLine } = await supabase
      .from("external_phone_lines")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_default", true)
      .maybeSingle();

    // Determine phone number (the external party)
    const phoneNumber = body.direction === "outbound" ? body.called : body.caller;
    const callStatus = getCallStatus(body);

    console.log("Phone number:", phoneNumber);
    console.log("Call status:", callStatus);

    // Create or update call log
    const { data: existingCall } = await supabase
      .from("call_logs")
      .select("id")
      .eq("api4com_call_id", body.id)
      .maybeSingle();

    if (existingCall) {
      // Update existing call
      const { error: updateError } = await supabase
        .from("call_logs")
        .update({
          status: callStatus,
          duration_seconds: body.duration || 0,
          recording_url: body.recordUrl || null,
          call_ended_at: body.endedAt,
        })
        .eq("id", existingCall.id);

      if (updateError) {
        console.error("Error updating call log:", updateError);
      } else {
        console.log("Call log updated:", existingCall.id);
      }
    } else {
      // Insert new call log
      const { data: newCall, error: insertError } = await supabase
        .from("call_logs")
        .insert({
          api4com_call_id: body.id,
          company_id: companyId,
          user_mapping_id: userMapping?.id || null,
          external_line_id: phoneLine?.id || null,
          direction: body.direction,
          phone_number: phoneNumber,
          status: callStatus,
          duration_seconds: body.duration || 0,
          recording_url: body.recordUrl || null,
          bitrix_call_id: body.metadata?.bitrixCallId || null,
          call_started_at: body.startedAt,
          call_ended_at: body.endedAt,
        })
        .select("id")
        .single();

      if (insertError) {
        console.error("Error inserting call log:", insertError);
      } else {
        console.log("Call log created:", newCall?.id);
      }
    }

    // Notify Bitrix24 about call completion
    if (userMapping?.bitrix24_user_id) {
      await finishBitrix24Call(supabase, companyId, {
        call_id: body.metadata?.bitrixCallId || body.id,
        phone_number: phoneNumber,
        duration: body.duration || 0,
        recording_url: body.recordUrl,
        user_id: userMapping.bitrix24_user_id,
        status: callStatus,
        direction: body.direction,
      });
    }

    return new Response(
      JSON.stringify({ success: true, call_id: body.id, status: callStatus }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Webhook error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Notify Bitrix24 about call completion using telephony.externalcall.finish
// deno-lint-ignore no-explicit-any
async function finishBitrix24Call(
  supabase: any,
  companyId: string,
  data: {
    call_id: string;
    phone_number: string;
    duration: number;
    recording_url?: string;
    user_id: string;
    status: string;
    direction: string;
  }
): Promise<void> {
  console.log("Finishing Bitrix24 call:", data);

  const { data: bitrixCreds } = await supabase
    .from("bitrix24_credentials")
    .select("domain, webhook_url, access_token, client_endpoint")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!bitrixCreds) {
    console.log("No Bitrix24 credentials found for company");
    return;
  }

  // Determine the API base URL
  const baseUrl = bitrixCreds.client_endpoint || 
    (bitrixCreds.webhook_url ? bitrixCreds.webhook_url : `https://${bitrixCreds.domain}/rest/`);

  // First, register the call if it wasn't registered before
  // This is needed for calls that originated from Api4Com directly
  try {
    const registerEndpoint = baseUrl.includes("/rest/") 
      ? `${baseUrl}telephony.externalcall.register`
      : `${baseUrl}/telephony.externalcall.register`;

    const registerBody: Record<string, unknown> = {
      USER_ID: data.user_id,
      PHONE_NUMBER: data.phone_number,
      TYPE: data.direction === "inbound" ? "2" : "1",
      CALL_START_DATE: new Date().toISOString(),
      CRM_CREATE: "1",
    };

    if (bitrixCreds.access_token) {
      registerBody.auth = bitrixCreds.access_token;
    }

    console.log("Registering call in Bitrix24:", registerEndpoint);
    const registerResponse = await fetch(registerEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registerBody),
    });

    const registerResult = await registerResponse.json();
    console.log("Bitrix24 register response:", registerResult);

    // Get the CALL_ID from the register response
    const bitrixCallId = registerResult?.result?.CALL_ID || data.call_id;

    // Now finish the call
    const finishEndpoint = baseUrl.includes("/rest/")
      ? `${baseUrl}telephony.externalcall.finish`
      : `${baseUrl}/telephony.externalcall.finish`;

    const finishBody: Record<string, unknown> = {
      CALL_ID: bitrixCallId,
      USER_ID: data.user_id,
      DURATION: data.duration,
      STATUS_CODE: data.status === "completed" ? "200" : 
                   data.status === "missed" ? "304" : 
                   data.status === "busy" ? "486" : "200",
    };

    if (bitrixCreds.access_token) {
      finishBody.auth = bitrixCreds.access_token;
    }

    if (data.recording_url) {
      finishBody.RECORD_URL = data.recording_url;
    }

    console.log("Finishing call in Bitrix24:", finishEndpoint);
    const finishResponse = await fetch(finishEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(finishBody),
    });

    const finishResult = await finishResponse.json();
    console.log("Bitrix24 finish response:", finishResult);
  } catch (error) {
    console.error("Error notifying Bitrix24:", error);
  }
}
