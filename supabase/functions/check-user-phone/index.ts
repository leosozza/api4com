import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const BITRIX_CLIENT_ID = Deno.env.get("BITRIX_CLIENT_ID");
    const BITRIX_CLIENT_SECRET = Deno.env.get("BITRIX_CLIENT_SECRET");

    const { company_id, user_id } = await req.json();
    console.log("=== Check User Phone Status ===");
    console.log("Company ID:", company_id);
    console.log("User ID:", user_id);

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: "company_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get Bitrix24 credentials
    const { data: credentials, error: credError } = await supabase
      .from("bitrix24_credentials")
      .select("*")
      .eq("company_id", company_id)
      .maybeSingle();

    if (credError || !credentials) {
      return new Response(
        JSON.stringify({ error: "Bitrix24 credentials not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Refresh token first
    let accessToken = credentials.access_token;
    if (BITRIX_CLIENT_ID && BITRIX_CLIENT_SECRET && credentials.refresh_token) {
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

      if (refreshResponse.ok) {
        const tokenData = await refreshResponse.json();
        accessToken = tokenData.access_token;
        
        await supabase
          .from("bitrix24_credentials")
          .update({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
          })
          .eq("id", credentials.id);
        console.log("Token refreshed successfully");
      }
    }

    const domain = credentials.domain;
    const results: Record<string, unknown> = {
      domain,
      userId: user_id || "1",
    };

    // 1. Get user info from Bitrix (includes phone settings)
    console.log("Getting user info...");
    try {
      const userResponse = await fetch(
        `https://${domain}/rest/user.get?auth=${accessToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ID: user_id || "1" }),
        }
      );
      const userResult = await userResponse.json();
      if (userResult.result && userResult.result[0]) {
        const user = userResult.result[0];
        results.userProfile = {
          ID: user.ID,
          NAME: user.NAME,
          LAST_NAME: user.LAST_NAME,
          UF_PHONE_INNER: user.UF_PHONE_INNER, // Internal phone number
          PERSONAL_PHONE: user.PERSONAL_PHONE,
          WORK_PHONE: user.WORK_PHONE,
          PERSONAL_MOBILE: user.PERSONAL_MOBILE,
        };
      }
    } catch (e) {
      console.error("Error getting user info:", e);
      results.userProfileError = String(e);
    }

    // 2. Get user's voximplant settings
    console.log("Getting voximplant user settings...");
    try {
      const voxUserResponse = await fetch(
        `https://${domain}/rest/voximplant.user.get?auth=${accessToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ USER_ID: [user_id || "1"] }),
        }
      );
      const voxUserResult = await voxUserResponse.json();
      console.log("voximplant.user.get result:", JSON.stringify(voxUserResult));
      results.voximplantUserSettings = voxUserResult.result || [];
      results.voximplantUserError = voxUserResult.error || null;
    } catch (e) {
      console.error("Error getting voximplant user:", e);
      results.voximplantUserError = String(e);
    }

    // 3. Get user's default line ID
    console.log("Getting user default line ID...");
    try {
      const defaultLineResponse = await fetch(
        `https://${domain}/rest/voximplant.user.getdefaultlineid?auth=${accessToken}`,
        { method: "POST" }
      );
      const defaultLineResult = await defaultLineResponse.json();
      results.userDefaultLineId = defaultLineResult.result || null;
      results.userDefaultLineIdError = defaultLineResult.error || null;
    } catch (e) {
      console.error("Error getting default line ID:", e);
      results.userDefaultLineIdError = String(e);
    }

    // 4. Try to get the telephony settings page info
    console.log("Checking telephony settings...");
    try {
      // Get all available lines including rented numbers
      const linesResponse = await fetch(
        `https://${domain}/rest/voximplant.line.get?auth=${accessToken}`,
        { method: "POST" }
      );
      const linesResult = await linesResponse.json();
      results.allLines = linesResult.result || [];
      results.allLinesError = linesResult.error || null;
    } catch (e) {
      console.error("Error getting lines:", e);
    }

    // 5. Check SIP status for this user
    console.log("Checking SIP registration for user...");
    try {
      const sipStatusResponse = await fetch(
        `https://${domain}/rest/voximplant.sip.status?auth=${accessToken}`,
        { method: "POST" }
      );
      const sipStatusResult = await sipStatusResponse.json();
      results.sipStatus = sipStatusResult.result || null;
      results.sipStatusError = sipStatusResult.error || null;
    } catch (e) {
      console.error("Error checking SIP status:", e);
    }

    // 6. Most importantly - check what's the CURRENT outgoing config
    console.log("Checking current outgoing configuration...");
    try {
      const outgoingGetResponse = await fetch(
        `https://${domain}/rest/voximplant.line.outgoing.get?auth=${accessToken}`,
        { method: "POST" }
      );
      const outgoingGetResult = await outgoingGetResponse.json();
      results.currentOutgoingLine = outgoingGetResult.result || null;
      results.currentOutgoingLineError = outgoingGetResult.error || null;
    } catch (e) {
      console.error("Error getting outgoing line:", e);
    }

    // 7. Check infocall.get for any additional configs
    console.log("Checking infocall settings...");
    try {
      const infocallResponse = await fetch(
        `https://${domain}/rest/voximplant.infocall.startwithtext?auth=${accessToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            FROM_LINE: "+5515996045202",
            TO_NUMBER: "+5511999999999",
            TEXT_TO_PRONOUNCE: "test"
          }),
        }
      );
      // We don't actually want to make a call, just see the error
      const infocallResult = await infocallResponse.json();
      results.infocallTest = infocallResult.error ? { error: infocallResult.error } : "would_work";
    } catch (e) {
      console.error("Error testing infocall:", e);
    }

    console.log("=== User Phone Check Complete ===");
    console.log(JSON.stringify(results, null, 2));

    return new Response(
      JSON.stringify(results),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
