import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

// Get app URL
function getAppUrl(): string {
  return Deno.env.get("APP_URL") || "https://api4com.lovable.app";
}

// Get Supabase URL
function getSupabaseUrl(): string {
  return Deno.env.get("SUPABASE_URL") || "";
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Handle HEAD requests (Bitrix24 uses these for validation)
  if (req.method === "HEAD") {
    console.log("HEAD request received - returning OK for Bitrix24 validation");
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "settings";
  
  console.log("=== Bitrix24 Handler ===");
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  console.log("Action:", action);
  console.log("Query params:", Object.fromEntries(url.searchParams.entries()));
  console.log("Headers:", Object.fromEntries(req.headers.entries()));

  try {
    // Route based on action and method
    switch (action) {
      case "install":
        // Install always requires POST (with auth data)
        if (req.method === "POST") {
          return await handleInstall(req, url);
        } else {
          // GET for install = show install page with BX24 SDK
          return await handleInstallPage(url);
        }
      
      case "settings":
      case "placement":
      default:
        // Settings can be GET or POST - both should show the app
        return await handleSettingsOrPlacement(req, url);
    }
  } catch (error: unknown) {
    console.error("Handler error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Handle GET request to install page - show page that initializes BX24 SDK
async function handleInstallPage(url: URL): Promise<Response> {
  console.log("=== Install Page (GET) - Showing BX24 SDK initialization page ===");
  
  const supabaseUrl = getSupabaseUrl();
  const domain = url.searchParams.get("DOMAIN") || "";
  
  // Return HTML page that initializes BX24 SDK and submits install data
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
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid #e5e7eb;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    h1 { 
      color: #1f2937; 
      font-size: 1.25rem; 
      margin-bottom: 10px;
    }
    p { 
      color: #6b7280; 
      font-size: 0.875rem;
    }
    .error { 
      color: #ef4444; 
      display: none;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner" id="spinner"></div>
    <h1 id="title">Iniciando instalação...</h1>
    <p id="status">Preparando o aplicativo Api4Com</p>
    <p class="error" id="error">Ocorreu um erro na instalação.</p>
  </div>
  <script>
    console.log('Install page loaded, initializing BX24 SDK...');
    
    BX24.init(function() {
      console.log('BX24 SDK initialized');
      document.getElementById('title').textContent = 'Instalando...';
      document.getElementById('status').textContent = 'Configurando eventos de telefonia';
      
      // Get auth data from BX24 SDK
      var auth = BX24.getAuth();
      console.log('Auth data received:', auth ? 'yes' : 'no');
      
      if (auth && auth.access_token) {
        // Post auth data to the install handler
        var formData = new URLSearchParams();
        formData.append('AUTH_ID', auth.access_token);
        formData.append('REFRESH_ID', auth.refresh_token || '');
        formData.append('AUTH_EXPIRES', String(auth.expires_in || 3600));
        formData.append('member_id', auth.member_id || '');
        formData.append('DOMAIN', auth.domain || '${domain}');
        formData.append('SERVER_ENDPOINT', 'https://' + (auth.domain || '${domain}') + '/rest/');
        
        fetch('${supabaseUrl}/functions/v1/bitrix24-handler?action=install&DOMAIN=' + encodeURIComponent(auth.domain || '${domain}'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString()
        })
        .then(function(response) {
          console.log('Install POST response status:', response.status);
          if (response.ok) {
            document.getElementById('title').textContent = 'Instalação Concluída!';
            document.getElementById('status').textContent = 'Finalizando...';
            
            // Call installFinish
            setTimeout(function() {
              try {
                BX24.installFinish();
                console.log('BX24.installFinish() called successfully');
              } catch (e) {
                console.error('Error calling installFinish:', e);
              }
            }, 1000);
          } else {
            throw new Error('Install failed with status ' + response.status);
          }
        })
        .catch(function(error) {
          console.error('Install error:', error);
          document.getElementById('spinner').style.display = 'none';
          document.getElementById('title').textContent = 'Erro na instalação';
          document.getElementById('error').style.display = 'block';
        });
      } else {
        console.error('No auth data available from BX24 SDK');
        document.getElementById('spinner').style.display = 'none';
        document.getElementById('title').textContent = 'Erro de autenticação';
        document.getElementById('error').style.display = 'block';
        document.getElementById('error').textContent = 'Não foi possível obter dados de autenticação. Tente reinstalar o app.';
      }
    });
    
    // Fallback timeout
    setTimeout(function() {
      if (typeof BX24 === 'undefined' || !BX24.getAuth) {
        console.error('BX24 SDK not available after timeout');
        document.getElementById('spinner').style.display = 'none';
        document.getElementById('title').textContent = 'SDK não disponível';
        document.getElementById('error').style.display = 'block';
        document.getElementById('error').textContent = 'O SDK do Bitrix24 não está disponível. Esta página deve ser aberta dentro do Bitrix24.';
      }
    }, 10000);
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
}

// Handle installation requests (POST with auth data)
async function handleInstall(req: Request, url: URL): Promise<Response> {
  console.log("=== Processing Install (POST) ===");
  
  const contentType = req.headers.get("content-type") || "";
  const bodyText = await req.text();
  
  console.log("Content-Type:", contentType);
  console.log("Raw body (first 500 chars):", bodyText.substring(0, 500));
  console.log("Body length:", bodyText.length);

  let auth: BitrixAuth | null = null;

  // Handle empty body case
  if (!bodyText || bodyText.trim() === "") {
    console.log("Empty body received, checking query params...");
    const queryAuth = url.searchParams.get("auth");
    if (queryAuth) {
      auth = safeJsonParse(queryAuth, null as unknown as BitrixAuth);
    }
  }
  // Handle form-urlencoded data
  else if (contentType.includes("application/x-www-form-urlencoded") || bodyText.includes("=")) {
    console.log("Parsing as form-urlencoded...");
    const formData = parseFormBody(bodyText);
    console.log("Form data keys:", Object.keys(formData));
    
    const authId = formData["AUTH_ID"];
    const refreshId = formData["REFRESH_ID"];
    const authExpires = formData["AUTH_EXPIRES"];
    const serverEndpoint = formData["SERVER_ENDPOINT"];
    const memberId = formData["member_id"];
    const domain = url.searchParams.get("DOMAIN") || "";
    
    console.log("AUTH_ID present:", !!authId);
    console.log("member_id:", memberId);
    console.log("DOMAIN:", domain);
    
    if (authId && memberId) {
      auth = {
        access_token: authId,
        refresh_token: refreshId || "",
        expires_in: parseInt(authExpires || "3600", 10),
        domain: domain,
        member_id: memberId,
        client_endpoint: serverEndpoint || `https://${domain}/rest/`,
        application_token: formData["application_token"] || "",
      };
    } else {
      // Fallback: try parsing as nested JSON
      const authRaw = formData["auth"];
      if (authRaw) {
        auth = safeJsonParse(authRaw, null as unknown as BitrixAuth);
      }
    }
  }
  // Handle JSON data
  else if (contentType.includes("application/json") || bodyText.startsWith("{")) {
    console.log("Parsing as JSON...");
    try {
      const parsed = JSON.parse(bodyText);
      auth = parsed.auth || null;
    } catch (e) {
      console.error("Failed to parse JSON:", e);
    }
  }

  if (!auth?.member_id || !auth?.domain) {
    console.error("Missing required auth fields");
    return new Response(
      JSON.stringify({ error: "Missing required auth fields" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log("Auth domain:", auth.domain);
  console.log("Auth member_id:", auth.member_id);
  console.log("Has access_token:", !!auth.access_token);

  const supabaseUrl = getSupabaseUrl();
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
    }
  }

  console.log("Installation completed for company:", companyId);

  const appUrl = getAppUrl();
  
  // Return HTML page that signals installation completion
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
    BX24.init(function() {
      console.log('BX24 SDK initialized in installer');
      setTimeout(function() {
        try {
          BX24.installFinish();
          console.log('BX24.installFinish() called');
        } catch (e) {
          console.error('Error calling installFinish:', e);
          showFallback();
        }
      }, 2000);
    });
    
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
}

// Handle settings/placement requests - redirect to React app
async function handleSettingsOrPlacement(req: Request, url: URL): Promise<Response> {
  console.log("=== Processing Settings/Placement ===");
  
  const appUrl = getAppUrl();
  const contentType = req.headers.get("content-type") || "";
  
  // Try to extract auth data from request
  let domain = url.searchParams.get("DOMAIN") || "";
  let memberId = "";
  
  // Try parsing body if POST
  if (req.method === "POST") {
    try {
      const bodyText = await req.text();
      console.log("Settings body (first 500 chars):", bodyText.substring(0, 500));
      
      if (contentType.includes("application/x-www-form-urlencoded") || bodyText.includes("=")) {
        const formData = parseFormBody(bodyText);
        domain = domain || formData["DOMAIN"] || "";
        memberId = formData["member_id"] || "";
        
        // Also check for individual fields
        if (!domain && formData["SERVER_ENDPOINT"]) {
          const endpoint = formData["SERVER_ENDPOINT"];
          const match = endpoint.match(/https?:\/\/([^/]+)/);
          if (match) domain = match[1];
        }
      } else if (bodyText.startsWith("{")) {
        const parsed = JSON.parse(bodyText);
        domain = domain || parsed.auth?.domain || "";
        memberId = parsed.auth?.member_id || "";
      }
    } catch (e) {
      console.error("Error parsing settings body:", e);
    }
  }
  
  console.log("Extracted domain:", domain);
  console.log("Extracted member_id:", memberId);
  
  // Build redirect URL with context parameters
  const settingsUrl = new URL(`${appUrl}/settings`);
  if (domain) settingsUrl.searchParams.set("domain", domain);
  if (memberId) settingsUrl.searchParams.set("member_id", memberId);
  
  // Return HTML page that embeds the React app
  // This ensures the Bitrix24 SDK context is maintained
  const htmlResponse = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Api4Com - Configurações</title>
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
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid #e5e7eb;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    h1 { 
      color: #1f2937; 
      font-size: 1.25rem; 
      margin-bottom: 10px;
    }
    p { 
      color: #6b7280; 
      font-size: 0.875rem;
    }
    .error { 
      color: #ef4444; 
      display: none;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner" id="spinner"></div>
    <h1>Carregando configurações...</h1>
    <p>Aguarde enquanto preparamos o aplicativo.</p>
    <p class="error" id="error">Ocorreu um erro ao carregar. <a href="${settingsUrl.toString()}">Clique aqui para tentar novamente.</a></p>
  </div>
  <script>
    BX24.init(function() {
      console.log('BX24 SDK initialized in settings handler');
      
      // Resize iframe to fit Bitrix24 layout
      BX24.fitWindow();
      
      // Redirect to React app with Bitrix24 context
      setTimeout(function() {
        window.location.href = '${settingsUrl.toString()}';
      }, 500);
    });
    
    // Fallback if BX24 doesn't initialize
    setTimeout(function() {
      if (typeof BX24 === 'undefined' || !BX24.init) {
        console.log('BX24 not available, redirecting directly');
        window.location.href = '${settingsUrl.toString()}';
      }
    }, 3000);
    
    // Show error after 10 seconds
    setTimeout(function() {
      document.getElementById('spinner').style.display = 'none';
      document.getElementById('error').style.display = 'block';
    }, 10000);
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
}

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
