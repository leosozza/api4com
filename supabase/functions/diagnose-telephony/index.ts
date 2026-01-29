import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface DiagnoseRequest {
  company_id: string;
}

type BitrixApiResponse<T = unknown> = {
  result?: T;
  error?: string;
  error_description?: string;
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

    const body: DiagnoseRequest = await req.json();
    console.log("=== Diagnose Telephony ===");
    console.log("Company ID:", body.company_id);

    if (!body.company_id) {
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
      .eq("company_id", body.company_id)
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
        
        // Update tokens in database
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
      checks: {},
    };

    // Fetch our default external line (if any) to help diagnosis
    const { data: phoneLinesForCompany } = await supabase
      .from("external_phone_lines")
      .select("line_number, is_default")
      .eq("company_id", body.company_id);

    const defaultLineNumber =
      phoneLinesForCompany?.find((l) => l.is_default)?.line_number ||
      phoneLinesForCompany?.[0]?.line_number ||
      null;

    // 1. Get registered events
    console.log("Checking registered events...");
    try {
      const eventsResponse = await fetch(
        `https://${domain}/rest/event.get?auth=${accessToken}`,
        { method: "POST" }
      );
      const eventsResult = await eventsResponse.json();
      if (eventsResult.result) {
        const telephonyEvents = eventsResult.result.filter((e: { event: string; handler: string }) => 
          e.event.includes("EXTERNALCALL") || e.event.includes("TELEPHONY")
        );
        results.checks = {
          ...results.checks as object,
          registeredEvents: telephonyEvents,
          allEventsCount: eventsResult.result.length,
        };
      }
    } catch (e) {
      console.error("Error checking events:", e);
      results.checks = { ...results.checks as object, eventsError: String(e) };
    }

    // 2. Get external lines registered in Bitrix24
    console.log("Checking external lines...");
    try {
      const linesResponse = await fetch(
        `https://${domain}/rest/telephony.externalLine.get?auth=${accessToken}`,
        { method: "POST" }
      );
      const linesResult = await linesResponse.json();
      results.checks = {
        ...results.checks as object,
        externalLines: linesResult.result || [],
        externalLinesError: linesResult.error || null,
      };
    } catch (e) {
      console.error("Error checking external lines:", e);
      results.checks = { ...results.checks as object, externalLinesError: String(e) };
    }

    // 3. Get app info and permissions - CRITICAL for detecting "App is not found" issue
    console.log("Checking app info and installation status...");
    try {
      const appInfoResponse = await fetch(
        `https://${domain}/rest/app.info?auth=${accessToken}`,
        { method: "POST" }
      );
      const appInfoResult = await appInfoResponse.json();
      
      // Check if app is installed (INSTALLED field in app.info response)
      // If INSTALLED is false or missing, events won't be dispatched
      const appInfo = appInfoResult.result || null;
      const isInstalled = appInfo?.INSTALLED === true || appInfo?.INSTALLED === "Y";
      
      console.log("App info result:", JSON.stringify(appInfo));
      console.log("App INSTALLED status:", isInstalled);
      
      results.checks = {
        ...results.checks as object,
        appInfo: appInfo,
        appInfoError: appInfoResult.error || null,
        isAppInstalled: isInstalled,
        installationStatus: isInstalled ? "INSTALLED" : "NOT_INSTALLED",
      };
    } catch (e) {
      console.error("Error checking app info:", e);
      results.checks = { 
        ...results.checks as object, 
        appInfoError: String(e),
        isAppInstalled: false,
        installationStatus: "ERROR",
      };
    }

    // 4. Get current user info
    console.log("Checking current user...");
    try {
      const userResponse = await fetch(
        `https://${domain}/rest/user.current?auth=${accessToken}`,
        { method: "POST" }
      );
      const userResult = await userResponse.json();
      results.checks = {
        ...results.checks as object,
        currentUser: userResult.result ? {
          id: userResult.result.ID,
          name: `${userResult.result.NAME} ${userResult.result.LAST_NAME}`.trim(),
          isAdmin: userResult.result.ADMIN,
        } : null,
        currentUserError: userResult.error || null,
      };
    } catch (e) {
      console.error("Error checking current user:", e);
      results.checks = { ...results.checks as object, currentUserError: String(e) };
    }

    // 5. Inspect outgoing line and available lines (helps when Bitrix keeps using SIP)
    console.log("Checking voximplant outgoing line + available lines...");
    try {
      const [outgoingGetResp, linesGetResp, defaultLineIdResp] = await Promise.all([
        fetch(`https://${domain}/rest/voximplant.line.outgoing.get?auth=${accessToken}`, { method: "POST" }),
        fetch(`https://${domain}/rest/voximplant.line.get?auth=${accessToken}`, { method: "POST" }),
        fetch(`https://${domain}/rest/voximplant.user.getdefaultlineid?auth=${accessToken}`, { method: "POST" }),
      ]);

      const outgoingGet: BitrixApiResponse = await outgoingGetResp.json();
      const linesGet: BitrixApiResponse<Array<Record<string, unknown>>> = await linesGetResp.json();
      const defaultLineId: BitrixApiResponse = await defaultLineIdResp.json();

      const lines = linesGet.result || [];

      const resolvedDefaultLine = defaultLineNumber
        ? lines.find((l) => {
            const candidates = [l.NUMBER, l.LINE_NUMBER, l.PHONE_NUMBER, l.PSTN, l.OUTGOING_NUMBER].filter(Boolean);
            return candidates.some((v) => String(v) === defaultLineNumber);
          })
        : null;

      results.checks = {
        ...(results.checks as object),
        defaultLineNumber,
        voximplantOutgoingGet: outgoingGet.result || null,
        voximplantOutgoingGetError: outgoingGet.error || null,
        voximplantUserDefaultLineId: defaultLineId.result || null,
        voximplantUserDefaultLineIdError: defaultLineId.error || null,
        voximplantLines: lines,
        voximplantLinesError: linesGet.error || null,
        resolvedDefaultLine: resolvedDefaultLine || null,
      };
    } catch (e) {
      console.error("Error checking voximplant outgoing/lines:", e);
      results.checks = { ...(results.checks as object), voximplantDiagnosticsError: String(e) };
    }

    // 6. List all telephony methods available
    console.log("Checking available telephony methods...");
    try {
      const methodsResponse = await fetch(
        `https://${domain}/rest/methods?auth=${accessToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope: "telephony" }),
        }
      );
      const methodsResult = await methodsResponse.json();
      results.checks = {
        ...results.checks as object,
        telephonyMethods: methodsResult.result || [],
        telephonyMethodsError: methodsResult.error || null,
      };
    } catch (e) {
      console.error("Error checking methods:", e);
    }

    // 7. Get user mapping from our database
    const { data: userMappings } = await supabase
      .from("user_mappings")
      .select("*")
      .eq("company_id", body.company_id);

    results.userMappings = userMappings || [];

    // 8. Get phone lines from our database
    const { data: phoneLines } = await supabase
      .from("external_phone_lines")
      .select("*")
      .eq("company_id", body.company_id);

    results.phoneLines = phoneLines || [];

    console.log("=== Diagnosis Complete ===");
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
