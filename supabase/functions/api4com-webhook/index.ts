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

// Map status to Bitrix24 status code
function getBitrixStatusCode(status: string): string {
  switch (status) {
    case "completed": return "200";
    case "missed": return "304";
    case "busy": return "486";
    default: return "200";
  }
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

    // Find company by metadata.companyId or domain
    const companyData = await findCompany(supabase, body);
    if (!companyData) {
      console.error("Company not found for domain:", body.domain);
      return new Response(
        JSON.stringify({ error: "Company not found", domain: body.domain }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { companyId } = companyData;

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
      .select("id, line_number")
      .eq("company_id", companyId)
      .eq("is_default", true)
      .maybeSingle();

    // Determine phone number (the external party)
    const phoneNumber = body.direction === "outbound" ? body.called : body.caller;

    // Handle different event types
    switch (body.eventType) {
      case "channel-create":
        // Chamada iniciada - mostrar popup no Bitrix para chamadas recebidas
        await handleCallCreate(supabase, companyId, body, userMapping, phoneLine, phoneNumber);
        break;

      case "channel-answer":
        // Chamada atendida - atualizar status
        await handleCallAnswer(supabase, companyId, body);
        break;

      case "channel-hangup":
        // Chamada finalizada - registrar no CRM
        await handleCallHangup(supabase, companyId, body, userMapping, phoneLine, phoneNumber);
        break;

      default:
        console.log("Ignoring event type:", body.eventType);
    }

    return new Response(
      JSON.stringify({ success: true, call_id: body.id, event: body.eventType }),
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

// Find company by various methods
// deno-lint-ignore no-explicit-any
async function findCompany(supabase: any, body: Api4ComWebhookV14): Promise<{ companyId: string } | null> {
  // First try to find by metadata.companyId (most reliable)
  if (body.metadata?.companyId) {
    const { data: creds } = await supabase
      .from("api4com_credentials")
      .select("company_id")
      .eq("company_id", body.metadata.companyId)
      .maybeSingle();
    
    if (creds) {
      console.log("Found company by metadata.companyId:", creds.company_id);
      return { companyId: creds.company_id };
    }
  }

  // Fallback: find by api4com_domain
  if (body.domain) {
    const { data: creds } = await supabase
      .from("api4com_credentials")
      .select("company_id")
      .eq("api4com_domain", body.domain)
      .maybeSingle();
    
    if (creds) {
      console.log("Found company by domain:", creds.company_id);
      return { companyId: creds.company_id };
    }
  }

  // Fallback: find by gateway in metadata
  if (body.metadata?.gateway) {
    console.log("Trying to find company by gateway:", body.metadata.gateway);
    
    const { data: allCreds } = await supabase
      .from("api4com_credentials")
      .select("company_id")
      .eq("webhook_configured", true);
    
    if (allCreds && allCreds.length === 1) {
      console.log("Found single configured company:", allCreds[0].company_id);
      return { companyId: allCreds[0].company_id };
    }
  }

  return null;
}

// Handle channel-create event - show popup in Bitrix for inbound calls
// deno-lint-ignore no-explicit-any
async function handleCallCreate(
  supabase: any,
  companyId: string,
  body: Api4ComWebhookV14,
  userMapping: { id: string; bitrix24_user_id: string } | null,
  phoneLine: { id: string; line_number: string } | null,
  phoneNumber: string
): Promise<void> {
  console.log("=== Handling channel-create (call started) ===");

  // Create call log with status "ringing"
  const { data: newCall, error: insertError } = await supabase
    .from("call_logs")
    .insert({
      api4com_call_id: body.id,
      company_id: companyId,
      user_mapping_id: userMapping?.id || null,
      external_line_id: phoneLine?.id || null,
      direction: body.direction,
      phone_number: phoneNumber,
      status: "ringing",
      duration_seconds: 0,
      call_started_at: body.startedAt,
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("Error inserting call log:", insertError);
  } else {
    console.log("Call log created (ringing):", newCall?.id);
  }

  // For inbound calls, show popup in Bitrix24
  if (body.direction === "inbound" && userMapping?.bitrix24_user_id) {
    console.log("Registering inbound call popup in Bitrix24...");
    const bitrixCallId = await registerBitrix24Call(supabase, companyId, {
      user_id: userMapping.bitrix24_user_id,
      phone_number: phoneNumber,
      direction: body.direction,
      line_number: phoneLine?.line_number,
      call_start_date: body.startedAt,
      show: true, // Show popup
      crm_create: true,
    });

    if (bitrixCallId && newCall?.id) {
      // Store Bitrix call ID for later use
      await supabase
        .from("call_logs")
        .update({ bitrix_call_id: bitrixCallId })
        .eq("id", newCall.id);
      console.log("Bitrix call ID stored:", bitrixCallId);
    }
  }
}

// Handle channel-answer event - update status to answered
// deno-lint-ignore no-explicit-any
async function handleCallAnswer(
  supabase: any,
  companyId: string,
  body: Api4ComWebhookV14
): Promise<void> {
  console.log("=== Handling channel-answer (call answered) ===");

  const { error: updateError } = await supabase
    .from("call_logs")
    .update({
      status: "answered",
    })
    .eq("api4com_call_id", body.id)
    .eq("company_id", companyId);

  if (updateError) {
    console.error("Error updating call log:", updateError);
  } else {
    console.log("Call log updated to answered");
  }
}

// Handle channel-hangup event - finalize call and register in CRM
// deno-lint-ignore no-explicit-any
async function handleCallHangup(
  supabase: any,
  companyId: string,
  body: Api4ComWebhookV14,
  userMapping: { id: string; bitrix24_user_id: string } | null,
  phoneLine: { id: string; line_number: string } | null,
  phoneNumber: string
): Promise<void> {
  console.log("=== Handling channel-hangup (call ended) ===");

  const callStatus = getCallStatus(body);
  console.log("Call status:", callStatus);

  // Update or create call log - try by api4com_call_id first, then by bitrix_call_id
  let existingCall: { id: string; bitrix_call_id: string | null; api4com_call_id: string | null } | null = null;
  
  const { data: callByApi4comId } = await supabase
    .from("call_logs")
    .select("id, bitrix_call_id, api4com_call_id")
    .eq("company_id", companyId)
    .eq("api4com_call_id", body.id)
    .maybeSingle();

  existingCall = callByApi4comId;

  // If not found by api4com_call_id, try by bitrix_call_id from metadata
  if (!existingCall && body.metadata?.bitrixCallId) {
    console.log("Searching by bitrix_call_id:", body.metadata.bitrixCallId);
    const { data: callByBitrixId } = await supabase
      .from("call_logs")
      .select("id, bitrix_call_id, api4com_call_id")
      .eq("company_id", companyId)
      .eq("bitrix_call_id", body.metadata.bitrixCallId)
      .maybeSingle();
    
    existingCall = callByBitrixId;
    if (existingCall) {
      console.log("Found call by bitrix_call_id:", existingCall.id);
    }
  }

  if (existingCall) {
    // Build update data
    const updateData: Record<string, unknown> = {
      status: callStatus,
      duration_seconds: body.duration || 0,
      recording_url: body.recordUrl || null,
      call_ended_at: body.endedAt,
    };
    
    // If found by bitrix_call_id but missing api4com_call_id, update it for consistency
    if (!existingCall.api4com_call_id) {
      updateData.api4com_call_id = body.id;
      console.log("Updating api4com_call_id to:", body.id);
    }

    const { error: updateError } = await supabase
      .from("call_logs")
      .update(updateData)
      .eq("id", existingCall.id);

    if (updateError) {
      console.error("Error updating call log:", updateError);
    } else {
      console.log("Call log updated:", existingCall.id);
    }

    // Finish call in Bitrix24 using the ORIGINAL bitrix_call_id (no new registration)
    if (userMapping?.bitrix24_user_id && existingCall.bitrix_call_id) {
      console.log("Finishing call with original bitrix_call_id:", existingCall.bitrix_call_id);
      await finishBitrix24Call(supabase, companyId, {
        call_id: existingCall.bitrix_call_id,
        user_id: userMapping.bitrix24_user_id,
        duration: body.duration || 0,
        status_code: getBitrixStatusCode(callStatus),
        recording_url: body.recordUrl,
      });
    }
  } else {
    // Insert new call log (for calls not captured by channel-create)
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

    // Register and finish call in Bitrix24 only if no bitrix_call_id exists
    if (userMapping?.bitrix24_user_id && !body.metadata?.bitrixCallId) {
      // For calls without a bitrix_call_id, register then finish (creates new CRM activity)
      const bitrixCallId = await registerBitrix24Call(supabase, companyId, {
        user_id: userMapping.bitrix24_user_id,
        phone_number: phoneNumber,
        direction: body.direction,
        line_number: phoneLine?.line_number,
        call_start_date: body.startedAt,
        show: false,
        crm_create: true,
      });

      if (bitrixCallId) {
        await finishBitrix24Call(supabase, companyId, {
          call_id: bitrixCallId,
          user_id: userMapping.bitrix24_user_id,
          duration: body.duration || 0,
          status_code: getBitrixStatusCode(callStatus),
          recording_url: body.recordUrl,
        });
      }
    } else if (userMapping?.bitrix24_user_id && body.metadata?.bitrixCallId) {
      // Has bitrix_call_id but no existing record - finish with the metadata call_id
      console.log("Finishing orphan call with metadata bitrix_call_id:", body.metadata.bitrixCallId);
      await finishBitrix24Call(supabase, companyId, {
        call_id: body.metadata.bitrixCallId,
        user_id: userMapping.bitrix24_user_id,
        duration: body.duration || 0,
        status_code: getBitrixStatusCode(callStatus),
        recording_url: body.recordUrl,
      });
    }
  }
}

// Register call in Bitrix24 using telephony.externalcall.register
// deno-lint-ignore no-explicit-any
async function registerBitrix24Call(
  supabase: any,
  companyId: string,
  data: {
    user_id: string;
    phone_number: string;
    direction: string;
    line_number?: string;
    call_start_date: string;
    show: boolean;
    crm_create: boolean;
  }
): Promise<string | null> {
  console.log("Registering call in Bitrix24:", data);

  const { data: bitrixCreds } = await supabase
    .from("bitrix24_credentials")
    .select("domain, webhook_url, access_token, client_endpoint")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!bitrixCreds) {
    console.log("No Bitrix24 credentials found for company");
    return null;
  }

  try {
    const baseUrl = bitrixCreds.client_endpoint || 
      (bitrixCreds.webhook_url ? bitrixCreds.webhook_url : `https://${bitrixCreds.domain}/rest/`);

    const endpoint = baseUrl.includes("/rest/") 
      ? `${baseUrl}telephony.externalcall.register`
      : `${baseUrl}/telephony.externalcall.register`;

    const requestBody: Record<string, unknown> = {
      USER_ID: data.user_id,
      PHONE_NUMBER: data.phone_number,
      TYPE: data.direction === "inbound" ? "2" : "1", // 1 = outbound, 2 = inbound
      CALL_START_DATE: data.call_start_date,
      CRM_CREATE: data.crm_create ? "1" : "0",
      SHOW: data.show ? "1" : "0",
    };

    if (data.line_number) {
      requestBody.LINE_NUMBER = data.line_number;
    }

    if (bitrixCreds.access_token) {
      requestBody.auth = bitrixCreds.access_token;
    }

    console.log("Bitrix24 register request:", endpoint);
    console.log("Request body:", JSON.stringify(requestBody));

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json();
    console.log("Bitrix24 register response:", JSON.stringify(result));

    if (result?.result?.CALL_ID) {
      return result.result.CALL_ID;
    }

    return null;
  } catch (error) {
    console.error("Error registering call in Bitrix24:", error);
    return null;
  }
}

// Finish call in Bitrix24 using telephony.externalcall.finish
// deno-lint-ignore no-explicit-any
async function finishBitrix24Call(
  supabase: any,
  companyId: string,
  data: {
    call_id: string;
    user_id: string;
    duration: number;
    status_code: string;
    recording_url?: string;
  }
): Promise<void> {
  console.log("Finishing call in Bitrix24:", data);

  const { data: bitrixCreds } = await supabase
    .from("bitrix24_credentials")
    .select("domain, webhook_url, access_token, client_endpoint")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!bitrixCreds) {
    console.log("No Bitrix24 credentials found for company");
    return;
  }

  try {
    const baseUrl = bitrixCreds.client_endpoint || 
      (bitrixCreds.webhook_url ? bitrixCreds.webhook_url : `https://${bitrixCreds.domain}/rest/`);

    const endpoint = baseUrl.includes("/rest/")
      ? `${baseUrl}telephony.externalcall.finish`
      : `${baseUrl}/telephony.externalcall.finish`;

    const requestBody: Record<string, unknown> = {
      CALL_ID: data.call_id,
      USER_ID: data.user_id,
      DURATION: data.duration,
      STATUS_CODE: data.status_code,
    };

    if (bitrixCreds.access_token) {
      requestBody.auth = bitrixCreds.access_token;
    }

    if (data.recording_url) {
      requestBody.RECORD_URL = data.recording_url;
    }

    console.log("Bitrix24 finish request:", endpoint);
    console.log("Request body:", JSON.stringify(requestBody));

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json();
    console.log("Bitrix24 finish response:", JSON.stringify(result));
  } catch (error) {
    console.error("Error finishing call in Bitrix24:", error);
  }
}
