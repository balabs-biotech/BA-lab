import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const ADMIN_EMAIL = "ba.labs.redev@gmail.com";
const ORG_CODE = "BA-LABS";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization" }, 401);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publishableKey =
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
      Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SECRET_KEY") ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
      console.error("claim-ba-labs missing required Supabase environment variables");
      return json({ error: "Server configuration error" }, 500);
    }

    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Invalid session" }, 401);

    // Only the designated BA Labs administrator can bootstrap the organization
    // or add an existing account. Ordinary members cannot self-enroll others.
    if ((user.email ?? "").toLowerCase() !== ADMIN_EMAIL) {
      return json({ error: "This action is restricted to the BA Labs admin account." }, 403);
    }

    let body: { action?: string; email?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Empty body retains the original bootstrap behavior.
    }

    const { data: org, error: orgError } = await adminClient
      .from("organizations")
      .select("id, code, name")
      .eq("code", ORG_CODE)
      .single();

    if (orgError || !org) {
      return json({ error: "BA-LABS organization not found." }, 404);
    }

    if (body.action === "add_member") {
      const targetEmail = (body.email ?? "").trim().toLowerCase();
      if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
        return json({ error: "A valid member email is required." }, 400);
      }
      if (targetEmail === ADMIN_EMAIL) {
        return json({ error: "The administrator is already the bootstrap account." }, 400);
      }

      // Supabase Auth Admin does not expose a direct get-user-by-email method.
      // Paginate rather than silently assuming the target is in the first page.
      let targetUser: { id: string; email?: string } | null = null;
      for (let page = 1; page <= 20; page += 1) {
        const { data, error } = await adminClient.auth.admin.listUsers({
          page,
          perPage: 500,
        });
        if (error) {
          console.error("claim-ba-labs user lookup failed:", error.message);
          return json({ error: "Unable to look up the requested account." }, 500);
        }
        targetUser = data.users.find(
          (candidate) => (candidate.email ?? "").toLowerCase() === targetEmail,
        ) ?? null;
        if (targetUser || data.users.length < 500) break;
      }

      if (!targetUser) {
        return json({
          error: "No account found for that email. The person must create an account first.",
        }, 404);
      }

      const { data: existing, error: existingError } = await adminClient
        .from("organization_members")
        .select("role")
        .eq("organization_id", org.id)
        .eq("user_id", targetUser.id)
        .maybeSingle();

      if (existingError) {
        console.error("claim-ba-labs membership lookup failed:", existingError.message);
        return json({ error: "Unable to check existing membership." }, 500);
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
          user_id: targetUser.id,
          role: "member",
        });

      if (insertError) {
        console.error("claim-ba-labs membership insert failed:", insertError.message);
        return json({ error: "Unable to add the requested member." }, 500);
      }

      return json({ ok: true, added: true, role: "member", organization: org });
    }

    // Original bootstrap behavior: link the designated admin account to BA-LABS.
    const { data: existing, error: existingError } = await adminClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", org.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingError) return json({ error: "Unable to check administrator membership." }, 500);
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

    if (insertError) return json({ error: "Unable to link administrator account." }, 500);
    return json({ ok: true, created: true, role: "owner", organization: org });
  } catch (error) {
    console.error("claim-ba-labs error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal error" }, 500);
  }
});
