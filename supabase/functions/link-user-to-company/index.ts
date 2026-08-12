import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// deno-lint-ignore no-explicit-any
type Admin = any;

/**
 * Moves credentials, lines, mappings and call logs from any manual company
 * (created outside the Bitrix install flow, i.e. bitrix_member_id IS NULL)
 * the user belongs to, into the portal company. Then removes the empty duplicate.
 */
async function consolidateManualCompanies(admin: Admin, userId: string, portalCompanyId: string) {
  const { data: memberships } = await admin
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId);

  const otherIds: string[] = (memberships || [])
    .map((m: { company_id: string }) => m.company_id)
    .filter((id: string) => id !== portalCompanyId);

  if (otherIds.length === 0) return;

  const { data: manualCompanies } = await admin
    .from("companies")
    .select("id, name")
    .in("id", otherIds)
    .is("bitrix_member_id", null);

  for (const manual of manualCompanies || []) {
    console.log("[link-user-to-company] Consolidating manual company:", manual.id, manual.name);

    // Api4Com credentials: only move if the portal company has none
    const { data: portalApi } = await admin
      .from("api4com_credentials")
      .select("id")
      .eq("company_id", portalCompanyId)
      .maybeSingle();

    if (portalApi) {
      await admin.from("api4com_credentials").delete().eq("company_id", manual.id);
    } else {
      await admin
        .from("api4com_credentials")
        .update({ company_id: portalCompanyId })
        .eq("company_id", manual.id);
    }

    // Phone lines: skip numbers already present on the portal company
    const { data: portalLines } = await admin
      .from("external_phone_lines")
      .select("line_number")
      .eq("company_id", portalCompanyId);
    const existingNumbers = new Set((portalLines || []).map((l: { line_number: string }) => l.line_number));

    const { data: manualLines } = await admin
      .from("external_phone_lines")
      .select("id, line_number")
      .eq("company_id", manual.id);

    for (const line of manualLines || []) {
      if (existingNumbers.has(line.line_number)) {
        await admin.from("external_phone_lines").delete().eq("id", line.id);
      } else {
        await admin
          .from("external_phone_lines")
          .update({ company_id: portalCompanyId })
          .eq("id", line.id);
      }
    }

    // User mappings: skip Bitrix users already mapped on the portal company
    const { data: portalMaps } = await admin
      .from("user_mappings")
      .select("bitrix24_user_id")
      .eq("company_id", portalCompanyId);
    const mappedUsers = new Set((portalMaps || []).map((m: { bitrix24_user_id: string }) => m.bitrix24_user_id));

    const { data: manualMaps } = await admin
      .from("user_mappings")
      .select("id, bitrix24_user_id")
      .eq("company_id", manual.id);

    for (const map of manualMaps || []) {
      if (mappedUsers.has(map.bitrix24_user_id)) {
        await admin.from("user_mappings").delete().eq("id", map.id);
      } else {
        await admin.from("user_mappings").update({ company_id: portalCompanyId }).eq("id", map.id);
      }
    }

    // Call history moves as-is
    await admin.from("call_logs").update({ company_id: portalCompanyId }).eq("company_id", manual.id);

    // Remove the now-empty duplicate
    await admin.from("company_members").delete().eq("company_id", manual.id);
    const { error: delErr } = await admin.from("companies").delete().eq("id", manual.id);
    if (delErr) console.error("[link-user-to-company] Could not delete manual company:", delErr);
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.log("[link-user-to-company] No auth header");
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's token to get their identity
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await userClient.auth.getClaims(token);

    if (claimsError || !claims?.claims?.sub) {
      console.log("[link-user-to-company] Invalid token:", claimsError);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claims.claims.sub;
    console.log("[link-user-to-company] User ID:", userId);

    // Parse request body
    const { member_id } = await req.json();

    if (!member_id) {
      console.log("[link-user-to-company] Missing member_id");
      return new Response(
        JSON.stringify({ success: false, error: "member_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[link-user-to-company] Looking for company with member_id:", member_id);

    // Use service role to bypass RLS
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Find company by bitrix_member_id
    const { data: company, error: companyError } = await adminClient
      .from("companies")
      .select("*")
      .eq("bitrix_member_id", member_id)
      .maybeSingle();

    if (companyError) {
      console.error("[link-user-to-company] Error finding company:", companyError);
      return new Response(
        JSON.stringify({ success: false, error: "Database error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!company) {
      console.log("[link-user-to-company] No company found for member_id:", member_id);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Company not found", 
          code: "COMPANY_NOT_FOUND" 
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[link-user-to-company] Found company:", company.id, company.name);

    // Consolidate: if this user also belongs to manual companies (no bitrix_member_id),
    // move their data into the portal company so nothing stays fragmented.
    try {
      await consolidateManualCompanies(adminClient, userId, company.id);
    } catch (e) {
      console.error("[link-user-to-company] Consolidation failed:", e);
    }



    // Check if user is already a member
    const { data: existingMember, error: memberCheckError } = await adminClient
      .from("company_members")
      .select("id, role")
      .eq("company_id", company.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (memberCheckError) {
      console.error("[link-user-to-company] Error checking membership:", memberCheckError);
      return new Response(
        JSON.stringify({ success: false, error: "Database error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (existingMember) {
      console.log("[link-user-to-company] User already member with role:", existingMember.role);
      return new Response(
        JSON.stringify({ 
          success: true, 
          company,
          role: existingMember.role,
          already_member: true 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if company has any admin - if not, make this user admin
    const { data: admins, error: adminCheckError } = await adminClient
      .from("company_members")
      .select("id")
      .eq("company_id", company.id)
      .eq("role", "admin");

    if (adminCheckError) {
      console.error("[link-user-to-company] Error checking admins:", adminCheckError);
    }

    const role = (!admins || admins.length === 0) ? "admin" : "member";
    console.log("[link-user-to-company] Assigning role:", role);

    // Add user as member
    const { error: insertError } = await adminClient
      .from("company_members")
      .insert({
        company_id: company.id,
        user_id: userId,
        role,
      });

    if (insertError) {
      console.error("[link-user-to-company] Error adding member:", insertError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to add member" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[link-user-to-company] User linked successfully");

    return new Response(
      JSON.stringify({ 
        success: true, 
        company,
        role,
        already_member: false 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[link-user-to-company] Unexpected error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
