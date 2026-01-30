import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SetOutgoingLineRequest {
  company_id: string;
  line_number?: string; // If not provided, uses default from external_phone_lines
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

    const body: SetOutgoingLineRequest = await req.json();
    console.log("=== Set Outgoing Line ===");
    console.log("Company ID:", body.company_id);
    console.log("Line Number (if provided):", body.line_number);

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

    // Get line number from request or from database
    let lineNumber = body.line_number;
    if (!lineNumber) {
      const { data: phoneLines } = await supabase
        .from("external_phone_lines")
        .select("line_number, is_default")
        .eq("company_id", body.company_id);

      const defaultLine = phoneLines?.find((l) => l.is_default) || phoneLines?.[0];
      lineNumber = defaultLine?.line_number;
    }

    if (!lineNumber) {
      return new Response(
        JSON.stringify({ error: "No phone line found. Please configure a phone line first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Using line number:", lineNumber);

    // Refresh OAuth token
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

    const tokenData = await refreshResponse.json();
    const accessToken = tokenData.access_token;

    // Update tokens in database
    await supabase
      .from("bitrix24_credentials")
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      })
      .eq("id", credentials.id);

    const domain = credentials.domain;

    // Step 1: Get available lines to find our line's ID
    console.log("Fetching available lines...");
    const linesResponse = await fetch(
      `https://${domain}/rest/voximplant.line.get?auth=${accessToken}`,
      { method: "POST" }
    );
    const linesResult: BitrixApiResponse<Array<Record<string, unknown>>> = await linesResponse.json();
    console.log("Available lines:", JSON.stringify(linesResult.result, null, 2));

    // Find our line - check multiple possible fields
    const ourLine = linesResult.result?.find((line) => {
      const candidates = [
        line.NUMBER,
        line.LINE_NUMBER,
        line.PHONE_NUMBER,
        line.PSTN,
        line.OUTGOING_NUMBER,
      ].filter(Boolean);
      return candidates.some((v) => String(v).includes(lineNumber!) || lineNumber!.includes(String(v)));
    });

    console.log("Our line found:", JSON.stringify(ourLine, null, 2));

    // Determine the LINE_ID to use
    // For external telephony connectors (REST apps), the LINE_ID is typically the phone number itself
    // or it could be a specific ID like "rest_XXX" or just the number
    let lineId: string = lineNumber;
    
    if (ourLine) {
      // Try to get the proper LINE_ID from the line object
      const possibleIds = [ourLine.LINE_ID, ourLine.ID, ourLine.NUMBER];
      for (const id of possibleIds) {
        if (id) {
          lineId = String(id);
          break;
        }
      }
    }

    console.log("Using LINE_ID:", lineId);

    // Step 2: Set global outgoing line
    console.log("Setting global outgoing line...");
    const setOutgoingResponse = await fetch(
      `https://${domain}/rest/voximplant.line.outgoing.set?auth=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ LINE_ID: lineId }),
      }
    );
    const setOutgoingResult: BitrixApiResponse = await setOutgoingResponse.json();
    console.log("voximplant.line.outgoing.set result:", JSON.stringify(setOutgoingResult, null, 2));

    // Step 3: Verify the change
    console.log("Verifying outgoing line...");
    const verifyResponse = await fetch(
      `https://${domain}/rest/voximplant.line.outgoing.get?auth=${accessToken}`,
      { method: "POST" }
    );
    const verifyResult: BitrixApiResponse = await verifyResponse.json();
    console.log("voximplant.line.outgoing.get result:", JSON.stringify(verifyResult, null, 2));

    const success = !setOutgoingResult.error;
    const currentOutgoing = verifyResult.result;

    // Check if it's actually set to our line
    const isCorrectlySet = (() => {
      if (!currentOutgoing) return false;
      const current = String(currentOutgoing);
      return current.includes(lineNumber) || current === lineId || lineNumber.includes(current);
    })();

    console.log("=== Set Outgoing Line Complete ===");
    console.log("Success:", success);
    console.log("Correctly set:", isCorrectlySet);
    console.log("Current outgoing:", currentOutgoing);

    return new Response(
      JSON.stringify({
        success: success && isCorrectlySet,
        message: success 
          ? (isCorrectlySet 
              ? `Linha de saída global configurada para: ${lineNumber}` 
              : `Comando executado, mas verificação falhou. Atual: ${currentOutgoing}`)
          : `Erro ao configurar: ${setOutgoingResult.error}`,
        lineId,
        lineNumber,
        previousOutgoing: null,
        currentOutgoing,
        isCorrectlySet,
        availableLines: linesResult.result?.length || 0,
        ourLineFound: !!ourLine,
        error: setOutgoingResult.error || null,
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
