import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Access-Control-Request-Headers",
};

const SHA256_RE = /^[0-9a-f]{64}$/;
const VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const DOCUMENT_PATHS: Record<string, string> = {
  terms: "legal/terms.html",
  privacy_notice: "legal/privacy.html",
  cookies_notice: "legal/cookies.html",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return false;
  return !Number.isNaN(new Date(value).getTime());
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const authorization = req.headers.get("authorization");
  if (!authorization) return json(401, { error: "authentication_required" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  const secretKey = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !publishableKey || !secretKey) return json(500, { error: "server_configuration_error" });

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json(401, { error: "invalid_session" });

    const { data: isAdmin, error: adminCheckError } = await adminClient.rpc(
      "is_platform_administrator",
      { p_user_id: authData.user.id },
    );
    if (adminCheckError) {
      console.error("[legal-document-registry] administrator check failed", adminCheckError.message);
      return json(503, { error: "administrator_check_unavailable" });
    }
    if (isAdmin !== true) return json(403, { error: "platform_administrator_required" });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "invalid_json_body" });

    if (body.action === "list") {
      const { data, error } = await adminClient.rpc("list_legal_document_versions");
      if (error) {
        console.error("[legal-document-registry] list failed", error.message);
        return json(503, { error: "document_registry_unavailable" });
      }
      return json(200, { documents: data ?? [] });
    }

    if (body.action === "publish") {
      const documentType = typeof body.document_type === "string" ? body.document_type : "";
      const version = typeof body.version === "string" ? body.version.trim() : "";
      const contentSha256 = typeof body.content_sha256 === "string" ? body.content_sha256.toLowerCase() : "";
      const documentPath = typeof body.document_path === "string" ? body.document_path : "";
      const effectiveAt = body.effective_at;

      if (!Object.hasOwn(DOCUMENT_PATHS, documentType) ||
          !VERSION_RE.test(version) ||
          !SHA256_RE.test(contentSha256) ||
          DOCUMENT_PATHS[documentType] !== documentPath ||
          !validDate(effectiveAt) ||
          Date.parse(effectiveAt) < Date.now() - 30_000) {
        return json(400, { error: "invalid_publication_payload" });
      }

      const { data, error } = await adminClient.rpc("publish_legal_document_version", {
        p_document_type: documentType,
        p_version: version,
        p_content_sha256: contentSha256,
        p_document_path: documentPath,
        p_effective_at: effectiveAt,
        p_created_by: authData.user.id,
      });
      if (error) {
        console.error("[legal-document-registry] publish failed", error.message);
        return json(409, { error: "document_publication_rejected" });
      }
      return json(201, { ok: true, document_version_id: data });
    }

    if (body.action === "retire") {
      const documentVersionId = typeof body.document_version_id === "string" ? body.document_version_id : "";
      const retiredAt = body.retired_at;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentVersionId) ||
          !validDate(retiredAt) ||
          Date.parse(retiredAt) < Date.now() - 30_000) {
        return json(400, { error: "invalid_retirement_payload" });
      }
      const { data, error } = await adminClient.rpc("retire_legal_document_version", {
        p_document_version_id: documentVersionId,
        p_retired_at: retiredAt,
      });
      if (error || data !== true) {
        console.error("[legal-document-registry] retirement rejected", error?.message ?? "no row changed");
        return json(409, { error: "document_retirement_rejected" });
      }
      return json(200, { ok: true });
    }

    return json(400, { error: "unsupported_action" });
  } catch (error) {
    console.error("[legal-document-registry] unexpected failure", error instanceof Error ? error.message : "unknown");
    return json(500, { error: "internal_error" });
  }
});
