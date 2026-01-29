import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface BitrixCallEvent {
  event: string;
  data: {
    PHONE_NUMBER: string;
    USER_ID: string;
    CALL_ID?: string;
    LINE_NUMBER?: string;
  };
  auth: {
    domain: string;
    access_token: string;
  };
}

function parseBracketObject(prefix: string, entries: Array<[string, string]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (!k.startsWith(prefix + "[")) continue;
    const inner = k.slice(prefix.length + 1);
    const end = inner.indexOf("]");
    if (end <= 0) continue;
    const key = inner.slice(0, end);
    out[key] = v;
  }
  return out;
}

async function parseBitrixRequest(req: Request): Promise<BitrixCallEvent> {
  const contentType = (req.headers.get("content-type") || "").toLowerCase();

  // Bitrix typically sends POST as application/x-www-form-urlencoded.
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await req.formData();
    const entries = Array.from(formData.entries()).map(([k, v]) => [k, String(v)] as [string, string]);

    const event = (formData.get("event") as string) || "";

    // Bitrix can send either JSON strings (data/auth) or bracket notation (data[...], auth[...])
    const dataRaw = formData.get("data");
    const authRaw = formData.get("auth");

    let data: Record<string, string> = {};
    let auth: Record<string, string> = {};

    if (typeof dataRaw === "string") {
      try {
        data = JSON.parse(dataRaw || "{}");
      } catch {
        // ignore, fallback
      }
    }
    if (typeof authRaw === "string") {
      try {
        auth = JSON.parse(authRaw || "{}");
      } catch {
        // ignore, fallback
      }
    }

    if (Object.keys(data).length === 0) data = parseBracketObject("data", entries);
    if (Object.keys(auth).length === 0) auth = parseBracketObject("auth", entries);

    return {
      event,
      data: {
        PHONE_NUMBER: data.PHONE_NUMBER || "",
        USER_ID: data.USER_ID || "",
        CALL_ID: data.CALL_ID,
        LINE_NUMBER: data.LINE_NUMBER,
      },
      auth: {
        domain: auth.domain || "",
        access_token: auth.access_token || "",
      },
    };
  }

  // Fallback: try text first (some clients/proxies don't set Content-Type correctly)
  const rawText = await req.text();
  const looksUrlEncoded = rawText.includes("=") && rawText.includes("&");

  if (looksUrlEncoded) {
    const params = new URLSearchParams(rawText);
    const entries = Array.from(params.entries());
    const event = params.get("event") || "";
    const data = parseBracketObject("data", entries);
    const auth = parseBracketObject("auth", entries);

    return {
      event,
      data: {
        PHONE_NUMBER: data.PHONE_NUMBER || "",
        USER_ID: data.USER_ID || "",
        CALL_ID: data.CALL_ID ?? undefined,
        LINE_NUMBER: data.LINE_NUMBER ?? undefined,
      },
      auth: {
        domain: auth.domain || "",
        access_token: auth.access_token || "",
      },
    };
  }

  // Last resort: JSON
  return JSON.parse(rawText) as BitrixCallEvent;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Handle HEAD requests (Bitrix24 uses these for endpoint validation)
  if (req.method === "HEAD") {
    console.log("HEAD request received - returning OK for Bitrix24 validation");
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Allow basic health checks (useful to validate reachability).
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("=== Bitrix24 Webhook ===");
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  console.log("Headers:", Object.fromEntries(req.headers.entries()));

  try {
    const body = await parseBitrixRequest(req);

    console.log(
      "Bitrix24 webhook received:",
      JSON.stringify({
        event: body?.event,
        data: body?.data,
        auth: { domain: body?.auth?.domain, has_access_token: !!body?.auth?.access_token },
      })
    );

    if (!body?.event) {
      return new Response(JSON.stringify({ error: "Missing event" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!body?.auth?.domain) {
      return new Response(JSON.stringify({ error: "Missing auth.domain" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase credentials");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find company by Bitrix domain
    const { data: credentials, error: credError } = await supabase
      .from("bitrix24_credentials")
      .select("company_id, access_token")
      .eq("domain", body.auth.domain)
      .maybeSingle();

    if (credError || !credentials) {
      console.error("Company not found for domain:", body.auth.domain);
      return new Response(
        JSON.stringify({ error: "Invalid domain" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const companyId = credentials.company_id;

    // Handle OnExternalCallStart - Click-to-call from Bitrix
    if (body.event === "ONEXTERNALCALLSTART") {
      const phoneNumber = body.data.PHONE_NUMBER;
      const bitrixUserId = body.data.USER_ID;

      // Find user mapping
      const { data: userMapping } = await supabase
        .from("user_mappings")
        .select("id, api4com_extension")
        .eq("company_id", companyId)
        .eq("bitrix24_user_id", bitrixUserId)
        .maybeSingle();

      if (!userMapping) {
        console.log("No mapping found for Bitrix user:", bitrixUserId);
        return new Response(
          JSON.stringify({ error: "User not mapped" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get Api4Com credentials
      const { data: api4comCreds } = await supabase
        .from("api4com_credentials")
        .select("api_token")
        .eq("company_id", companyId)
        .maybeSingle();

      if (!api4comCreds) {
        return new Response(
          JSON.stringify({ error: "Api4Com not configured" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Originate call via Api4Com
      const api4comResponse = await originateCall({
        apiToken: api4comCreds.api_token,
        extension: userMapping.api4com_extension,
        phoneNumber: phoneNumber,
        companyId: companyId,
        bitrixUserId: bitrixUserId,
        bitrixCallId: body.data.CALL_ID,
      });

      if (!api4comResponse?.success) {
        console.error("Failed to originate call:", api4comResponse?.error);
        return new Response(
          JSON.stringify({ 
            error: "Failed to originate call", 
            details: api4comResponse?.error 
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get default phone line
      const { data: phoneLine } = await supabase
        .from("external_phone_lines")
        .select("id")
        .eq("company_id", companyId)
        .eq("is_default", true)
        .maybeSingle();

      // Create call log
      await supabase.from("call_logs").insert({
        company_id: companyId,
        user_mapping_id: userMapping.id,
        external_line_id: phoneLine?.id,
        direction: "outbound",
        phone_number: phoneNumber,
        status: "ringing",
        bitrix_call_id: body.data.CALL_ID,
        api4com_call_id: api4comResponse.call_id,
        call_started_at: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify({ success: true, call_id: api4comResponse.call_id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

async function originateCall(params: {
  apiToken: string;
  extension: string;
  phoneNumber: string;
  companyId?: string;
  bitrixUserId?: string;
  bitrixCallId?: string;
}): Promise<{ call_id: string; success: boolean; error?: string } | null> {
  console.log("=== Originating call via Api4Com ===");
  console.log("Extension:", params.extension);
  console.log("Phone number:", params.phoneNumber);
  console.log("Company ID:", params.companyId);
  
  try {
    // Format phone number (remove non-digits except leading +)
    let formattedPhone = params.phoneNumber.replace(/[^\d+]/g, "");
    if (!formattedPhone.startsWith("+")) {
      // Add Brazil country code if not present
      if (!formattedPhone.startsWith("55")) {
        formattedPhone = "+55" + formattedPhone;
      } else {
        formattedPhone = "+" + formattedPhone;
      }
    }

    const dialerPayload = {
      extension: params.extension,
      phone: formattedPhone,
      metadata: {
        gateway: "bitrix24-connector",
        companyId: params.companyId,
        bitrixUserId: params.bitrixUserId,
        bitrixCallId: params.bitrixCallId,
      },
    };

    console.log("Dialer payload:", JSON.stringify(dialerPayload));

    const response = await fetch("https://api.api4com.com/api/v1/dialer", {
      method: "POST",
      headers: {
        "Authorization": params.apiToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(dialerPayload),
    });

    const responseText = await response.text();
    console.log("Api4Com dialer response status:", response.status);
    console.log("Api4Com dialer response:", responseText);

    if (!response.ok) {
      console.error("Api4Com dialer error:", responseText);
      return { 
        call_id: "", 
        success: false, 
        error: `Api4Com error: ${response.status} - ${responseText}` 
      };
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { id: `call_${Date.now()}` };
    }

    console.log("Call originated successfully:", result);
    return { 
      call_id: result.id || result.call_id || `call_${Date.now()}`, 
      success: true 
    };
  } catch (error) {
    console.error("Error originating call:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return { call_id: "", success: false, error: message };
  }
}