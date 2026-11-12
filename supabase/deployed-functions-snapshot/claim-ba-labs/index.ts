import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Missing authorization" }, 401);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const publishableKey =
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
      Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SECRET_KEY") ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return json({ error: "Invalid session" }, 401);
    }

    if ((user.email ?? "").toLowerCase() !== "ba.labs.redev@gmail.com") {
      return json(
        { error: "This bootstrap is restricted to the BA Labs admin account." },
        403,
      );
    }

    const { data: org, error: orgError } = await adminClient
      .from("organizations")
      .select("id, code, name")
      .eq("code", "BA-LABS")
      .single();

    if (orgError || !org) {
      return json({ error: "BA-LABS organization not found." }, 404);
    }

    const { data: existing, error: existingError } = await adminClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", org.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingError) {
      return json({ error: existingError.message }, 500);
    }

    if (existing) {
      return json({
        ok: true,
        already_member: true,
        role: existing.role,
        organization: org,
      });
    }

    const { error: insertError } = await adminClient
      .from("organization_members")
      .insert({
        organization_id: org.id,
        user_id: user.id,
        role: "owner",
      });

    if (insertError) {
      return json({ error: insertError.message }, 500);
    }

    return json({
      ok: true,
      created: true,
      role: "owner",
      organization: org,
    });
  } catch (error) {
    console.error("claim-ba-labs error:", error);
    return json(
      { error: error instanceof Error ? error.message : "Internal error" },
      500,
    );
  }
});
