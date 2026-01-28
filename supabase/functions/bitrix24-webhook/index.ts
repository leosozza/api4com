import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Bitrix sends form-urlencoded data
    const contentType = req.headers.get("content-type") || "";
    let body: BitrixCallEvent;

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      const event = formData.get("event") as string;
      const data = JSON.parse(formData.get("data") as string || "{}");
      const auth = JSON.parse(formData.get("auth") as string || "{}");
      body = { event, data, auth };
    } else {
      body = await req.json();
    }

    console.log("Bitrix24 webhook received:", JSON.stringify(body));

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
      // Note: Replace with actual Api4Com API endpoint
      const api4comResponse = await originateCall({
        apiToken: api4comCreds.api_token,
        extension: userMapping.api4com_extension,
        phoneNumber: phoneNumber,
      });

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
        api4com_call_id: api4comResponse?.call_id,
        call_started_at: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify({ success: true, call_id: api4comResponse?.call_id }),
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
}): Promise<{ call_id: string } | null> {
  // TODO: Implement actual Api4Com API call
  // This is a placeholder - replace with actual Api4Com API
  console.log("Originating call:", params);
  
  try {
    // Example Api4Com API call (adjust endpoint and payload as needed)
    // const response = await fetch("https://api.api4com.com/v1/calls/originate", {
    //   method: "POST",
    //   headers: {
    //     "Authorization": `Bearer ${params.apiToken}`,
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify({
    //     extension: params.extension,
    //     destination: params.phoneNumber,
    //   }),
    // });
    // return await response.json();
    
    return { call_id: `call_${Date.now()}` };
  } catch (error) {
    console.error("Error originating call:", error);
    return null;
  }
}