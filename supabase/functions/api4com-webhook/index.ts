import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Api4ComEvent {
  event: string;
  call_id: string;
  extension: string;
  phone_number: string;
  direction: "inbound" | "outbound";
  status: string;
  duration?: number;
  recording_url?: string;
  timestamp: string;
  company_token: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: Api4ComEvent = await req.json();
    console.log("Api4Com webhook received:", JSON.stringify(body));

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase credentials");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find company by Api4Com token
    const { data: credentials, error: credError } = await supabase
      .from("api4com_credentials")
      .select("company_id")
      .eq("api_token", body.company_token)
      .maybeSingle();

    if (credError || !credentials) {
      console.error("Company not found for token");
      return new Response(
        JSON.stringify({ error: "Invalid company token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const companyId = credentials.company_id;

    // Find user mapping by extension
    const { data: userMapping } = await supabase
      .from("user_mappings")
      .select("id, bitrix24_user_id")
      .eq("company_id", companyId)
      .eq("api4com_extension", body.extension)
      .maybeSingle();

    // Get default phone line
    const { data: phoneLine } = await supabase
      .from("external_phone_lines")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_default", true)
      .maybeSingle();

    // Map Api4Com status to our status
    const statusMap: Record<string, string> = {
      ringing: "ringing",
      answered: "answered",
      hangup: "completed",
      missed: "missed",
      busy: "busy",
      failed: "failed",
    };

    const callStatus = statusMap[body.status] || body.status;

    // Handle different events
    switch (body.event) {
      case "call.started":
      case "call.ringing": {
        // Create or update call log
        const { error: insertError } = await supabase
          .from("call_logs")
          .upsert({
            api4com_call_id: body.call_id,
            company_id: companyId,
            user_mapping_id: userMapping?.id,
            external_line_id: phoneLine?.id,
            direction: body.direction,
            phone_number: body.phone_number,
            status: callStatus,
            call_started_at: body.timestamp,
          }, {
            onConflict: "api4com_call_id",
          });

        if (insertError) {
          console.error("Error inserting call log:", insertError);
        }

        // If we have a user mapping, notify Bitrix24
        if (userMapping) {
          await notifyBitrix24(supabase, companyId, {
            type: body.direction === "inbound" ? "incoming" : "outgoing",
            phone_number: body.phone_number,
            user_id: userMapping.bitrix24_user_id,
            call_id: body.call_id,
          });
        }
        break;
      }

      case "call.answered": {
        await supabase
          .from("call_logs")
          .update({ status: "answered" })
          .eq("api4com_call_id", body.call_id);
        break;
      }

      case "call.ended":
      case "call.hangup": {
        await supabase
          .from("call_logs")
          .update({
            status: "completed",
            duration_seconds: body.duration || 0,
            recording_url: body.recording_url,
            call_ended_at: body.timestamp,
          })
          .eq("api4com_call_id", body.call_id);

        // Finish call in Bitrix24
        if (userMapping) {
          await finishBitrix24Call(supabase, companyId, {
            call_id: body.call_id,
            duration: body.duration || 0,
            recording_url: body.recording_url,
            user_id: userMapping.bitrix24_user_id,
          });
        }
        break;
      }

      case "call.missed": {
        await supabase
          .from("call_logs")
          .update({
            status: "missed",
            call_ended_at: body.timestamp,
          })
          .eq("api4com_call_id", body.call_id);
        break;
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
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

// deno-lint-ignore no-explicit-any
async function notifyBitrix24(
  supabase: any,
  companyId: string,
  data: {
    type: "incoming" | "outgoing";
    phone_number: string;
    user_id: string;
    call_id: string;
  }
): Promise<void> {
  const { data: bitrixCreds } = await supabase
    .from("bitrix24_credentials")
    .select("domain, webhook_url, access_token")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!bitrixCreds?.webhook_url) {
    console.log("No Bitrix24 credentials found for company");
    return;
  }

  const baseUrl = bitrixCreds.webhook_url;
  const endpoint = `${baseUrl}/telephony.externalcall.register`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        PHONE_NUMBER: data.phone_number,
        USER_ID: data.user_id,
        TYPE: data.type === "incoming" ? "2" : "1",
        CALL_START_DATE: new Date().toISOString(),
        CRM_CREATE: "1",
        SHOW: "1",
      }),
    });

    const result = await response.json();
    console.log("Bitrix24 register response:", result);
  } catch (error) {
    console.error("Error notifying Bitrix24:", error);
  }
}

// deno-lint-ignore no-explicit-any
async function finishBitrix24Call(
  supabase: any,
  companyId: string,
  data: {
    call_id: string;
    duration: number;
    recording_url?: string;
    user_id: string;
  }
): Promise<void> {
  const { data: bitrixCreds } = await supabase
    .from("bitrix24_credentials")
    .select("webhook_url")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!bitrixCreds?.webhook_url) return;

  const endpoint = `${bitrixCreds.webhook_url}/telephony.externalcall.finish`;

  try {
    const body: Record<string, unknown> = {
      CALL_ID: data.call_id,
      USER_ID: data.user_id,
      DURATION: data.duration,
      STATUS_CODE: "200",
    };

    if (data.recording_url) {
      body.RECORD_URL = data.recording_url;
    }

    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error("Error finishing Bitrix24 call:", error);
  }
}