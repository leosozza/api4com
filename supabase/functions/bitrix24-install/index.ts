import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BitrixAuth {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  domain: string;
  member_id: string;
  client_endpoint: string;
  application_token: string;
}

interface BitrixInstallEvent {
  event: string;
  auth: BitrixAuth;
  data?: {
    LANGUAGE_ID?: string;
    VERSION?: number;
  };
}

// Helper to safely parse JSON
function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  if (typeof value === "object") {
    return value as T;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      console.log("Failed to parse JSON string:", value.substring(0, 100));
      return fallback;
    }
  }
  return fallback;
}

// Parse form data from URLSearchParams format
function parseFormBody(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    const url = new URL(req.url);
    
    console.log("=== Bitrix24 Install Request ===");
    console.log("Method:", req.method);
    console.log("Content-Type:", contentType);
    console.log("URL:", req.url);
    console.log("Query params:", Object.fromEntries(url.searchParams.entries()));

    // Clone the request to read body as text first for logging
    const bodyText = await req.text();
    console.log("Raw body (first 500 chars):", bodyText.substring(0, 500));
    console.log("Body length:", bodyText.length);

    let body: Partial<BitrixInstallEvent> = {};

    // Handle empty body case
    if (!bodyText || bodyText.trim() === "") {
      console.log("Empty body received, checking query params...");
      
      // Check if data is in query params (some Bitrix versions do this)
      const queryEvent = url.searchParams.get("event");
      const queryAuth = url.searchParams.get("auth");
      
      if (queryAuth) {
        body = {
          event: queryEvent || "ONAPPINSTALL",
          auth: safeJsonParse(queryAuth, {} as BitrixAuth),
        };
      } else {
        console.error("No data found in body or query params");
        return new Response(
          JSON.stringify({ error: "No installation data received" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    // Handle form-urlencoded data (Bitrix24 sends individual fields, not nested JSON)
    else if (contentType.includes("application/x-www-form-urlencoded") || bodyText.includes("=")) {
      console.log("Parsing as form-urlencoded...");
      const formData = parseFormBody(bodyText);
      console.log("Form data keys:", Object.keys(formData));
      
      // Bitrix24 sends data in individual fields, not as nested "auth" object
      // Check for individual Bitrix24 fields (uppercase format)
      const authId = formData["AUTH_ID"];
      const refreshId = formData["REFRESH_ID"];
      const authExpires = formData["AUTH_EXPIRES"];
      const serverEndpoint = formData["SERVER_ENDPOINT"];
      const memberId = formData["member_id"];
      
      // Domain comes from query params
      const domain = url.searchParams.get("DOMAIN") || "";
      
      console.log("AUTH_ID present:", !!authId);
      console.log("REFRESH_ID present:", !!refreshId);
      console.log("member_id:", memberId);
      console.log("DOMAIN from query:", domain);
      console.log("SERVER_ENDPOINT:", serverEndpoint);
      
      if (authId && memberId) {
        // Build auth object from individual fields
        body = {
          event: formData["event"] || "ONAPPINSTALL",
          auth: {
            access_token: authId,
            refresh_token: refreshId || "",
            expires_in: parseInt(authExpires || "3600", 10),
            domain: domain,
            member_id: memberId,
            client_endpoint: serverEndpoint || `https://${domain}/rest/`,
            application_token: formData["application_token"] || "",
          } as BitrixAuth,
        };
        console.log("Built auth from individual fields");
      } else {
        // Fallback: try parsing as nested JSON (old format)
        const authRaw = formData["auth"];
        const dataRaw = formData["data"];
        const eventRaw = formData["event"];
        
        console.log("Trying nested auth format...");
        console.log("auth raw type:", typeof authRaw);
        
        body = {
          event: eventRaw || "ONAPPINSTALL",
          auth: safeJsonParse(authRaw, {} as BitrixAuth),
          data: safeJsonParse(dataRaw, undefined),
        };
      }
    }
    // Handle JSON data
    else if (contentType.includes("application/json")) {
      console.log("Parsing as JSON...");
      try {
        body = JSON.parse(bodyText);
      } catch (e) {
        console.error("Failed to parse JSON body:", e);
        return new Response(
          JSON.stringify({ error: "Invalid JSON body" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    // Try to auto-detect format
    else {
      console.log("Unknown content-type, attempting auto-detection...");
      
      // Try JSON first
      if (bodyText.startsWith("{") || bodyText.startsWith("[")) {
        try {
          body = JSON.parse(bodyText);
          console.log("Auto-detected as JSON");
        } catch {
          console.log("Not valid JSON");
        }
      }
    }

    console.log("Parsed event:", body.event);
    console.log("Parsed auth domain:", body.auth?.domain);
    console.log("Parsed auth member_id:", body.auth?.member_id);
    console.log("Has access_token:", !!body.auth?.access_token);
    console.log("Has refresh_token:", !!body.auth?.refresh_token);

    const { auth } = body;

    if (!auth?.member_id || !auth?.domain) {
      console.error("Missing required auth fields");
      console.error("Auth object:", JSON.stringify(auth, null, 2));
      return new Response(
        JSON.stringify({ 
          error: "Missing required auth fields",
          received: {
            has_member_id: !!auth?.member_id,
            has_domain: !!auth?.domain,
            auth_keys: auth ? Object.keys(auth) : [],
          }
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase credentials");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calculate token expiration
    const expiresAt = new Date(Date.now() + (auth.expires_in || 3600) * 1000).toISOString();

    // Check if company already exists
    const { data: existingCompany, error: findError } = await supabase
      .from("companies")
      .select("id")
      .eq("bitrix_member_id", auth.member_id)
      .maybeSingle();

    if (findError) {
      console.error("Error finding company:", findError);
      throw findError;
    }

    let companyId: string;

    if (existingCompany) {
      // Update existing company's credentials
      companyId = existingCompany.id;
      console.log("Updating existing company:", companyId);

      const { error: updateError } = await supabase
        .from("bitrix24_credentials")
        .upsert({
          company_id: companyId,
          domain: auth.domain,
          access_token: auth.access_token,
          refresh_token: auth.refresh_token || null,
          expires_at: expiresAt,
          member_id: auth.member_id,
          client_endpoint: auth.client_endpoint || null,
        }, {
          onConflict: 'company_id',
        });

      if (updateError) {
        console.error("Error updating credentials:", updateError);
        throw updateError;
      }
    } else {
      // Create new company
      console.log("Creating new company for member:", auth.member_id);

      const { data: newCompany, error: createError } = await supabase
        .from("companies")
        .insert({
          name: `Portal ${auth.domain}`,
          bitrix_member_id: auth.member_id,
        })
        .select("id")
        .single();

      if (createError) {
        console.error("Error creating company:", createError);
        throw createError;
      }

      companyId = newCompany.id;

      // Create credentials for the new company
      const { error: credError } = await supabase
        .from("bitrix24_credentials")
        .insert({
          company_id: companyId,
          domain: auth.domain,
          access_token: auth.access_token,
          refresh_token: auth.refresh_token || null,
          expires_at: expiresAt,
          member_id: auth.member_id,
          client_endpoint: auth.client_endpoint || null,
        });

      if (credError) {
        console.error("Error creating credentials:", credError);
        throw credError;
      }
    }

    // Register webhooks for telephony events
    if (auth.client_endpoint && auth.access_token) {
      const webhookBaseUrl = `${supabaseUrl}/functions/v1/bitrix24-webhook`;
      
      try {
        await registerBitrixEvent(auth, "ONEXTERNALCALLSTART", webhookBaseUrl);
        await registerBitrixEvent(auth, "ONEXTERNALCALLBACKSTART", webhookBaseUrl);
        console.log("Webhooks registered successfully");
      } catch (webhookError) {
        console.error("Error registering webhooks:", webhookError);
        // Don't fail the installation if webhook registration fails
      }
    } else {
      console.log("Skipping webhook registration - missing client_endpoint or access_token");
    }

    console.log("Installation completed for company:", companyId);

    // Get app URL from environment or use default
    const appUrl = Deno.env.get("APP_URL") || "https://api4com.thoth24.com.br";
    
    // Return HTML page that signals installation completion to Bitrix24
    // Using BX24.installFinish() instead of redirect to maintain SDK context
    const htmlResponse = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Api4Com - Instalação</title>
  <script src="https://api.bitrix24.com/api/v1/"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      text-align: center;
      padding: 40px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      max-width: 400px;
    }
    .success-icon {
      width: 64px;
      height: 64px;
      background: #10b981;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
    }
    .success-icon svg {
      width: 32px;
      height: 32px;
      fill: white;
    }
    h1 { 
      color: #1f2937; 
      font-size: 1.5rem; 
      margin-bottom: 10px;
    }
    p { 
      color: #6b7280; 
      margin-bottom: 20px;
    }
    .spinner {
      width: 24px;
      height: 24px;
      border: 3px solid #e5e7eb;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .fallback-btn {
      display: none;
      margin-top: 20px;
      padding: 12px 24px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 1rem;
      cursor: pointer;
      transition: background 0.2s;
    }
    .fallback-btn:hover {
      background: #2563eb;
    }
    .fallback-text {
      display: none;
      color: #9ca3af;
      font-size: 0.875rem;
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-icon">
      <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
    </div>
    <h1>Instalação Concluída!</h1>
    <p id="status-text">Finalizando instalação...</p>
    <div class="spinner" id="spinner"></div>
    <button class="fallback-btn" id="fallback-btn" onclick="window.location.href='${appUrl}'">
      Abrir Aplicativo
    </button>
    <p class="fallback-text" id="fallback-text">
      Clique no botão acima para abrir o aplicativo
    </p>
  </div>
  <script>
    // Initialize BX24 SDK and signal installation completion
    BX24.init(function() {
      console.log('BX24 SDK initialized in installer');
      
      // Wait for visual feedback, then signal completion
      setTimeout(function() {
        try {
          // This is the official way to finish Bitrix24 app installation
          // It closes the installer and allows Bitrix24 to navigate to the app URL
          BX24.installFinish();
          console.log('BX24.installFinish() called');
        } catch (e) {
          console.error('Error calling installFinish:', e);
          showFallback();
        }
      }, 2000);
    });
    
    // Fallback: Show manual button after 5 seconds if auto-close doesn't work
    setTimeout(function() {
      showFallback();
    }, 5000);
    
    function showFallback() {
      document.getElementById('spinner').style.display = 'none';
      document.getElementById('status-text').textContent = 'Instalação concluída com sucesso!';
      document.getElementById('fallback-btn').style.display = 'inline-block';
      document.getElementById('fallback-text').style.display = 'block';
    }
  </script>
</body>
</html>
`;

    return new Response(htmlResponse, { 
      status: 200, 
      headers: { 
        ...corsHeaders, 
        "Content-Type": "text/html; charset=utf-8" 
      } 
    });

  } catch (error: unknown) {
    console.error("Installation error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function registerBitrixEvent(
  auth: BitrixAuth,
  eventName: string,
  handlerUrl: string
): Promise<void> {
  const response = await fetch(`${auth.client_endpoint}event.bind`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auth: auth.access_token,
      event: eventName,
      handler: handlerUrl,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Failed to register ${eventName}:`, text);
  }
}
