import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CreateCompanyRequest {
  name: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[create-company] Missing Supabase credentials");
      throw new Error("Missing Supabase credentials");
    }

    // Get the authorization header
    const authHeader = req.headers.get("Authorization");
    
    console.log("[create-company] Auth header present:", !!authHeader);
    console.log("[create-company] Auth header length:", authHeader?.length || 0);
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("[create-company] No valid authorization header");
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    console.log("[create-company] Token length:", token.length);

    // Create admin client with SERVICE ROLE for all operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Validate the token using getUser
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError) {
      console.error("[create-company] getUser error:", userError.message);
      return new Response(
        JSON.stringify({ error: "User not authenticated", details: userError.message }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!userData?.user?.id) {
      console.error("[create-company] No user in response");
      return new Response(
        JSON.stringify({ error: "User not authenticated", details: "No user found" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = userData.user.id;
    console.log("[create-company] User verified:", userId);

    // Parse request body
    const body: CreateCompanyRequest = await req.json();
    console.log("[create-company] Creating company:", body.name);

    if (!body.name || body.name.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: "Company name must be at least 2 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create the company using service role (bypasses RLS)
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .insert({ name: body.name.trim() })
      .select()
      .single();

    if (companyError) {
      console.error("[create-company] Error creating company:", companyError);
      return new Response(
        JSON.stringify({ error: "Failed to create company", details: companyError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[create-company] Company created:", company.id);

    // Add user as admin member
    const { error: memberError } = await supabaseAdmin
      .from("company_members")
      .insert({
        company_id: company.id,
        user_id: userId,
        role: "admin",
      });

    if (memberError) {
      console.error("[create-company] Error adding member:", memberError);
      // Rollback: delete the company if member creation fails
      await supabaseAdmin.from("companies").delete().eq("id", company.id);
      return new Response(
        JSON.stringify({ error: "Failed to add member", details: memberError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[create-company] Member added successfully for user:", userId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        company: company 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[create-company] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
