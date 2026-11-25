import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newQrToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = req.headers.get("Authorization") ?? "";
  if (!projectUrl || !serviceKey || !anonKey || !authorization.startsWith("Bearer ")) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const authResponse = await fetch(new URL("/auth/v1/user", projectUrl), {
      headers: { apikey: anonKey, Authorization: authorization },
    });
    if (!authResponse.ok) return json({ error: "unauthorized" }, 401);
    const user = await authResponse.json();
    if (!user?.id || typeof user.id !== "string") return json({ error: "unauthorized" }, 401);

    const body = await req.json();
    const action = body?.action;
    const serviceHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const rolesUrl = new URL("/rest/v1/user_roles", projectUrl);
    rolesUrl.search = new URLSearchParams({
      select: "role",
      user_id: `eq.${user.id}`,
      revoked_at: "is.null",
    }).toString();
    const rolesResponse = await fetch(rolesUrl, { headers: serviceHeaders });
    if (!rolesResponse.ok) return json({ error: "authorization_check_failed" }, 503);
    const roles = await rolesResponse.json();
    const activeRoles = Array.isArray(roles) ? roles.map((r) => r.role) : [];

    const hasRole = (...allowed: string[]) => activeRoles.some((role) => allowed.includes(role));

    if (action === "dashboard") {
      if (!hasRole("principal_admin", "administrator", "operator", "quality", "approver")) {
        return json({ error: "forbidden" }, 403);
      }
      const readTable = async (table: string, query: Record<string, string>) => {
        const target = new URL(`/rest/v1/${table}`, projectUrl);
        target.search = new URLSearchParams(query).toString();
        const response = await fetch(target, { headers: serviceHeaders });
        if (!response.ok) throw new Error("read_failed");
        return await response.json();
      };
      const [categories, products, lots, passports, quality_checks, documents, incidents, alerts, lot_events] = await Promise.all([
        readTable("product_categories", { select: "id,code,name_fr,is_active,sort_order", is_active: "eq.true", order: "sort_order.asc" }),
        readTable("products", { select: "id,category_id,code,name_fr,lifecycle_status,created_at", order: "created_at.desc", limit: "100" }),
        readTable("lots", { select: "id,product_id,lot_code,status,manufactured_on,expires_on,quantity,quantity_unit,created_at", order: "created_at.desc", limit: "100" }),
        readTable("passports", { select: "id,lot_id,status,current_version,published_at,created_at", order: "created_at.desc", limit: "100" }),
        readTable("quality_checks", { select: "id,lot_id,check_type,result,checked_by,checked_at,reviewed_by,reviewed_at,internal_notes", order: "checked_at.desc", limit: "200" }),
        readTable("documents", { select: "id,lot_id,product_id,title,description,original_filename,mime_type,byte_size,classification,uploaded_by,created_at,archived_at", order: "created_at.desc", limit: "200" }),
        readTable("incidents", { select: "id,scope_type,lot_id,product_id,category_id,severity,status,title,internal_description,root_cause,corrective_actions,created_by,created_at,resolved_at", order: "created_at.desc", limit: "200" }),
        readTable("alerts", { select: "id,incident_id,scope_type,lot_id,product_id,category_id,status,public_title,public_summary,prepared_by,approved_by,approved_at,published_at,created_at", order: "created_at.desc", limit: "200" }),
        readTable("lot_events", { select: "id,lot_id,event_type,occurred_at,actor_id,details", order: "occurred_at.desc", limit: "1000" }),
      ]);
      return json({ categories, products, lots, passports, quality_checks, documents, incidents, alerts, lot_events, roles: activeRoles });
    }

    if (action === "create_incident") {
      if (!hasRole("principal_admin", "administrator", "operator", "quality")) return json({ error: "forbidden" }, 403);
      const scopeType = body?.scope_type;
      const lotId = typeof body?.lot_id === "string" ? body.lot_id : null;
      const productId = typeof body?.product_id === "string" ? body.product_id : null;
      const categoryId = typeof body?.category_id === "string" ? body.category_id : null;
      const severity = body?.severity;
      const title = typeof body?.title === "string" ? body.title.trim() : "";
      const description = typeof body?.internal_description === "string" ? body.internal_description.trim() : null;
      if (!["lot", "product", "family"].includes(scopeType) || title.length < 2 || title.length > 160 || !["low", "medium", "high", "critical"].includes(severity) || (description && description.length > 5000)) return json({ error: "invalid_incident_input" }, 400);
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if ((lotId && !uuid.test(lotId)) || (productId && !uuid.test(productId)) || (categoryId && !uuid.test(categoryId))) return json({ error: "invalid_incident_scope" }, 400);
      const response = await fetch(new URL("/rest/v1/rpc/create_incident_with_scope_with_audit", projectUrl), {
        method: "POST", headers: serviceHeaders,
        body: JSON.stringify({ p_scope_type: scopeType, p_lot_id: lotId, p_product_id: productId, p_category_id: categoryId, p_severity: severity, p_title: title, p_internal_description: description, p_actor_id: user.id }),
      });
      if (!response.ok) return json({ error: "incident_creation_failed" }, 422);
      return json({ incident_id: await response.json() }, 201);
    }

    if (action === "update_incident") {
      if (!hasRole("principal_admin", "administrator", "quality", "approver")) return json({ error: "forbidden" }, 403);
      const incidentId = body?.incident_id;
      const status = body?.status;
      const rootCause = typeof body?.root_cause === "string" ? body.root_cause : null;
      const correctiveActions = typeof body?.corrective_actions === "string" ? body.corrective_actions : null;
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (typeof incidentId !== "string" || !uuid.test(incidentId) || !["open", "investigating", "corrective_action", "resolved", "closed"].includes(status) || (rootCause && rootCause.length > 5000) || (correctiveActions && correctiveActions.length > 5000)) return json({ error: "invalid_incident_update" }, 400);
      const response = await fetch(new URL("/rest/v1/rpc/update_incident_with_audit", projectUrl), {
        method: "POST", headers: serviceHeaders,
        body: JSON.stringify({ p_incident_id: incidentId, p_status: status, p_root_cause: rootCause, p_corrective_actions: correctiveActions, p_actor_id: user.id }),
      });
      if (!response.ok) return json({ error: "incident_update_failed" }, 422);
      return json({ incident_id: await response.json(), status });
    }

    if (action === "create_alert_draft") {
      if (!hasRole("principal_admin", "administrator", "approver")) return json({ error: "forbidden" }, 403);
      const incidentId = body?.incident_id;
      const title = typeof body?.public_title === "string" ? body.public_title.trim() : "";
      const summary = typeof body?.public_summary === "string" ? body.public_summary.trim() : "";
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (typeof incidentId !== "string" || !uuid.test(incidentId) || title.length < 2 || title.length > 160 || summary.length < 2 || summary.length > 1200) return json({ error: "invalid_alert_input" }, 400);
      const response = await fetch(new URL("/rest/v1/rpc/create_alert_draft_with_audit", projectUrl), {
        method: "POST", headers: serviceHeaders,
        body: JSON.stringify({ p_incident_id: incidentId, p_public_title: title, p_public_summary: summary, p_actor_id: user.id }),
      });
      if (!response.ok) return json({ error: "alert_creation_failed" }, 422);
      return json({ alert_id: await response.json() }, 201);
    }

    if (action === "approve_alert" || action === "publish_alert") {
      if (!hasRole("principal_admin", "administrator", "approver")) return json({ error: "forbidden" }, 403);
      const alertId = body?.alert_id;
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (typeof alertId !== "string" || !uuid.test(alertId)) return json({ error: "invalid_alert_id" }, 400);
      const rpc = action === "approve_alert" ? "approve_alert_with_audit" : "publish_alert_with_audit";
      const response = await fetch(new URL("/rest/v1/rpc/" + rpc, projectUrl), {
        method: "POST", headers: serviceHeaders,
        body: JSON.stringify({ p_alert_id: alertId, p_actor_id: user.id }),
      });
      if (!response.ok) return json({ error: action === "approve_alert" ? "alert_approval_failed" : "alert_publication_failed" }, 422);
      return json({ alert_id: await response.json(), status: action === "approve_alert" ? "approved" : "published" });
    }

    if (action === "transition_lot") {
      if (!hasRole("principal_admin", "administrator", "operator", "quality", "approver")) return json({ error: "forbidden" }, 403);
      const lotId = body?.lot_id;
      const nextStatus = body?.new_status;
      const reason = typeof body?.reason === "string" ? body.reason : null;
      if (typeof lotId !== "string" || typeof nextStatus !== "string") return json({ error: "invalid_transition_input" }, 400);
      if (["in_production", "awaiting_checks"].includes(nextStatus) && !hasRole("principal_admin", "administrator", "operator")) return json({ error: "forbidden" }, 403);
      if (["investigation", "under_surveillance"].includes(nextStatus) && !hasRole("principal_admin", "administrator", "quality", "approver")) return json({ error: "forbidden" }, 403);
      const response = await fetch(new URL("/rest/v1/rpc/transition_lot_with_audit", projectUrl), {
        method: "POST",
        headers: serviceHeaders,
        body: JSON.stringify({ p_lot_id: lotId, p_new_status: nextStatus, p_reason: reason, p_actor_id: user.id }),
      });
      if (!response.ok) return json({ error: "lot_transition_failed" }, 422);
      return json({ lot_id: await response.json(), status: nextStatus });
    }

    if (action === "record_quality_check") {
      if (!hasRole("principal_admin", "administrator", "operator", "quality")) return json({ error: "forbidden" }, 403);
      const lotId = body?.lot_id;
      const checkType = body?.check_type;
      const result = body?.result;
      if (typeof lotId !== "string" || typeof checkType !== "string" || checkType.trim().length < 2 || !["pending", "pass", "fail", "inconclusive"].includes(result)) {
        return json({ error: "invalid_quality_check" }, 400);
      }
      const lotStatusUrl = new URL("/rest/v1/lots", projectUrl);
      lotStatusUrl.search = new URLSearchParams({ select: "status", id: `eq.${lotId}`, limit: "1" }).toString();
      const lotStatusResponse = await fetch(lotStatusUrl, { headers: serviceHeaders });
      if (!lotStatusResponse.ok) return json({ error: "quality_scope_check_failed" }, 503);
      const lotRows = await lotStatusResponse.json();
      const lotStatus = Array.isArray(lotRows) ? lotRows[0]?.status : null;
      if (!["awaiting_checks", "under_surveillance"].includes(lotStatus)) {
        return json({ error: "lot_not_ready_for_quality_check" }, 409);
      }
      const response = await fetch(new URL("/rest/v1/rpc/record_quality_check_with_audit", projectUrl), {
        method: "POST",
        headers: serviceHeaders,
        body: JSON.stringify({ p_lot_id: lotId, p_check_type: checkType, p_result: result, p_internal_notes: body?.internal_notes ?? null, p_actor_id: user.id }),
      });
      if (!response.ok) return json({ error: "quality_check_creation_failed" }, 422);
      return json({ quality_check_id: await response.json() }, 201);
    }

    if (action === "review_quality_check") {
      if (!hasRole("principal_admin", "administrator", "quality", "approver")) return json({ error: "forbidden" }, 403);
      const checkId = body?.check_id;
      if (typeof checkId !== "string") return json({ error: "invalid_quality_check_id" }, 400);
      const checkUrl = new URL("/rest/v1/quality_checks", projectUrl);
      checkUrl.search = new URLSearchParams({ select: "checked_by,reviewed_by", id: `eq.${checkId}`, limit: "1" }).toString();
      const checkResponse = await fetch(checkUrl, { headers: serviceHeaders });
      if (!checkResponse.ok) return json({ error: "quality_review_scope_check_failed" }, 503);
      const checkRows = await checkResponse.json();
      const check = Array.isArray(checkRows) ? checkRows[0] : null;
      if (!check || check.reviewed_by) return json({ error: "quality_check_not_reviewable" }, 409);
      if (check.checked_by === user.id) return json({ error: "independent_review_required" }, 403);
      const response = await fetch(new URL("/rest/v1/rpc/review_quality_check_with_audit", projectUrl), {
        method: "POST",
        headers: serviceHeaders,
        body: JSON.stringify({ p_check_id: checkId, p_actor_id: user.id }),
      });
      if (!response.ok) return json({ error: "quality_check_review_failed" }, 422);
      return json({ quality_check_id: await response.json() });
    }

    if (action === "release_lot") {
      if (!hasRole("principal_admin", "administrator", "approver")) return json({ error: "forbidden" }, 403);
      const lotId = body?.lot_id;
      if (typeof lotId !== "string") return json({ error: "invalid_lot_id" }, 400);
      const response = await fetch(new URL("/rest/v1/rpc/release_lot_with_audit", projectUrl), {
        method: "POST",
        headers: serviceHeaders,
        body: JSON.stringify({ p_lot_id: lotId, p_actor_id: user.id }),
      });
      if (!response.ok) return json({ error: "lot_release_failed" }, 422);
      return json({ lot_id: await response.json(), status: "released" });
    }

    if (action === "upload_document") {
      if (!hasRole("principal_admin", "administrator", "operator", "quality")) return json({ error: "forbidden" }, 403);
      const lotId = typeof body?.lot_id === "string" ? body.lot_id : null;
      const productId = typeof body?.product_id === "string" ? body.product_id : null;
      const title = typeof body?.title === "string" ? body.title.trim() : "";
      const filename = typeof body?.original_filename === "string" ? body.original_filename.trim() : "";
      const description = typeof body?.description === "string" ? body.description.trim() : null;
      const classification = body?.classification;
      const encoded = typeof body?.file_base64 === "string" ? body.file_base64 : "";
      if ((Number(Boolean(lotId)) + Number(Boolean(productId)) !== 1) || title.length < 1 || title.length > 160 || filename.length < 1 || filename.length > 255 || (description && description.length > 1200) || !["internal", "quality"].includes(classification) || !encoded) {
        return json({ error: "invalid_document_metadata" }, 400);
      }
      if (!/^[0-9a-f-]{36}$/i.test(lotId || productId || "")) return json({ error: "invalid_document_scope" }, 400);
      const compact = encoded.replace(/^data:application\/pdf;base64,/, "");
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || compact.length > 4_200_000) return json({ error: "invalid_document_payload" }, 413);
      const binary = atob(compact);
      if (binary.length < 5 || binary.length > 3 * 1024 * 1024 || binary.slice(0, 5) !== "%PDF-") return json({ error: "pdf_required_or_file_too_large" }, 415);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const scope = lotId ? "lots/" + lotId : "products/" + productId;
      const storagePath = scope + "/" + crypto.randomUUID() + ".pdf";
      const uploadResponse = await fetch(new URL("/storage/v1/object/ba-labs-documents/" + storagePath, projectUrl), {
        method: "POST",
        headers: { ...serviceHeaders, "Content-Type": "application/pdf", "x-upsert": "false" },
        body: bytes,
      });
      if (!uploadResponse.ok) return json({ error: "document_storage_upload_failed" }, 422);
      const registerResponse = await fetch(new URL("/rest/v1/rpc/register_document_upload_with_audit", projectUrl), {
        method: "POST",
        headers: serviceHeaders,
        body: JSON.stringify({
          p_lot_id: lotId,
          p_product_id: productId,
          p_storage_path: storagePath,
          p_original_filename: filename,
          p_mime_type: "application/pdf",
          p_byte_size: bytes.length,
          p_classification: classification,
          p_title: title,
          p_description: description || null,
          p_actor_id: user.id,
        }),
      });
      if (!registerResponse.ok) {
        await fetch(new URL("/storage/v1/object/ba-labs-documents/" + storagePath, projectUrl), {
          method: "DELETE",
          headers: serviceHeaders,
        });
        return json({ error: "document_registration_failed" }, 422);
      }
      const documentId = await registerResponse.json();
      return json({ document_id: documentId }, 201);
    }

    if (action === "signed_document_url") {
      if (!hasRole("principal_admin", "administrator", "operator", "quality", "approver")) return json({ error: "forbidden" }, 403);
      const documentId = body?.document_id;
      if (typeof documentId !== "string" || !/^[0-9a-f-]{36}$/i.test(documentId)) return json({ error: "invalid_document_id" }, 400);
      const docUrl = new URL("/rest/v1/documents", projectUrl);
      docUrl.search = new URLSearchParams({ select: "storage_path,original_filename,archived_at", id: "eq." + documentId, limit: "1" }).toString();
      const docResponse = await fetch(docUrl, { headers: serviceHeaders });
      if (!docResponse.ok) return json({ error: "document_lookup_failed" }, 503);
      const docs = await docResponse.json();
      const doc = Array.isArray(docs) ? docs[0] : null;
      if (!doc || doc.archived_at) return json({ error: "document_unavailable" }, 404);
      const signResponse = await fetch(new URL("/storage/v1/object/sign/ba-labs-documents/" + doc.storage_path, projectUrl), {
        method: "POST", headers: serviceHeaders, body: JSON.stringify({ expiresIn: 60 }),
      });
      if (!signResponse.ok) return json({ error: "document_signing_failed" }, 422);
      const signed = await signResponse.json();
      const signedPath = signed.signedURL || signed.signedUrl;
      if (typeof signedPath !== "string") return json({ error: "document_signing_failed" }, 422);
      const absolute = signedPath.startsWith("http") ? signedPath : new URL(signedPath, projectUrl).toString();
      return json({ signed_url: absolute, filename: doc.original_filename, expires_in: 60 });
    }

    if (action === "archive_document") {
      if (!hasRole("principal_admin", "administrator")) return json({ error: "forbidden" }, 403);
      const documentId = body?.document_id;
      if (typeof documentId !== "string" || !/^[0-9a-f-]{36}$/i.test(documentId)) return json({ error: "invalid_document_id" }, 400);
      const archiveResponse = await fetch(new URL("/rest/v1/rpc/archive_document_with_audit", projectUrl), {
        method: "POST",
        headers: serviceHeaders,
        body: JSON.stringify({ p_document_id: documentId, p_actor_id: user.id }),
      });
      if (!archiveResponse.ok) return json({ error: "document_archive_failed" }, 422);
      const archivedId = await archiveResponse.json();
      return json({ document_id: archivedId, archived: true });
    }

    if (action === "create_product") {
      if (!hasRole("principal_admin", "administrator", "operator")) return json({ error: "forbidden" }, 403);
      const required = ["category_id", "code", "name_fr"];
      if (required.some((key) => typeof body?.[key] !== "string" || !body[key].trim())) {
        return json({ error: "required_fields_missing" }, 400);
      }
      const rpcResponse = await fetch(new URL("/rest/v1/rpc/create_product_with_public_info_with_audit", projectUrl), {
        method: "POST",
        headers: serviceHeaders,
        body: JSON.stringify({
          p_category_id: body.category_id,
          p_code: body.code,
          p_name_fr: body.name_fr,
          p_name_en: body.name_en ?? null,
          p_name_pt: body.name_pt ?? null,
          p_name_ar: body.name_ar ?? null,
          p_internal_description: body.internal_description ?? null,
          p_public_description_fr: body.public_description_fr ?? null,
          p_public_usage_fr: body.public_usage_fr ?? null,
          p_actor_id: user.id,
        }),
      });
      if (!rpcResponse.ok) return json({ error: "product_creation_failed" }, 422);
      return json({ product_id: await rpcResponse.json() }, 201);
    }

    if (action === "create_lot") {
      if (!hasRole("principal_admin", "administrator", "operator")) return json({ error: "forbidden" }, 403);
      if (typeof body?.product_id !== "string" || typeof body?.lot_code !== "string" || !body.lot_code.trim()) {
        return json({ error: "required_fields_missing" }, 400);
      }
      const rpcResponse = await fetch(new URL("/rest/v1/rpc/create_lot_with_audit", projectUrl), {
        method: "POST",
        headers: serviceHeaders,
        body: JSON.stringify({
          p_product_id: body.product_id,
          p_lot_code: body.lot_code,
          p_manufactured_on: body.manufactured_on ?? null,
          p_expires_on: body.expires_on ?? null,
          p_quantity: body.quantity ?? null,
          p_quantity_unit: body.quantity_unit ?? null,
          p_internal_notes: body.internal_notes ?? null,
          p_actor_id: user.id,
        }),
      });
      if (!rpcResponse.ok) return json({ error: "lot_creation_failed" }, 422);
      return json({ lot_id: await rpcResponse.json() }, 201);
    }

    if (action === "create_draft") {
      if (!activeRoles.some((r) => ["operator", "administrator", "principal_admin"].includes(r))) {
        return json({ error: "forbidden" }, 403);
      }
      const lotId = body?.lot_id;
      if (typeof lotId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(lotId)) {
        return json({ error: "invalid_lot_id" }, 400);
      }

      const qrToken = newQrToken();
      const tokenHash = await sha256Hex(qrToken);
      const rpcResponse = await fetch(new URL("/rest/v1/rpc/create_passport_draft_with_audit", projectUrl), {
        method: "POST",
        headers: serviceHeaders,
        body: JSON.stringify({ p_lot_id: lotId, p_qr_token_hash: tokenHash, p_actor_id: user.id }),
      });
      if (!rpcResponse.ok) {
        return json({ error: "draft_creation_failed" }, 422);
      }
      const passportId = await rpcResponse.json();
      // The raw token is returned once only. Store it in the QR code; the database stores only its SHA-256 hash.
      return json({ passport_id: passportId, qr_token: qrToken, token_delivery: "one_time" }, 201);
    }

    if (action === "revoke_passport") {
      if (!hasRole("approver", "administrator", "principal_admin")) return json({ error: "forbidden" }, 403);
      const passportId = body?.passport_id;
      if (typeof passportId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(passportId)) {
        return json({ error: "invalid_passport_id" }, 400);
      }
      const response = await fetch(new URL("/rest/v1/rpc/revoke_passport_with_audit", projectUrl), {
        method: "POST",
        headers: serviceHeaders,
        body: JSON.stringify({ p_passport_id: passportId, p_actor_id: user.id }),
      });
      if (!response.ok) return json({ error: "passport_revocation_failed" }, 422);
      return json({ passport_id: await response.json(), status: "revoked" });
    }

    if (action === "rotate_token") {
      if (!hasRole("operator", "administrator", "principal_admin")) return json({ error: "forbidden" }, 403);
      const passportId = body?.passport_id;
      if (typeof passportId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(passportId)) {
        return json({ error: "invalid_passport_id" }, 400);
      }
      const qrToken = newQrToken();
      const tokenHash = await sha256Hex(qrToken);
      const response = await fetch(new URL("/rest/v1/rpc/rotate_passport_token_with_audit", projectUrl), {
        method: "POST",
        headers: serviceHeaders,
        body: JSON.stringify({ p_passport_id: passportId, p_qr_token_hash: tokenHash, p_actor_id: user.id }),
      });
      if (!response.ok) return json({ error: "passport_token_rotation_failed" }, 422);
      return json({ passport_id: await response.json(), qr_token: qrToken, token_delivery: "one_time", status: "draft" }, 200);
    }

    if (action === "publish") {
      if (!activeRoles.some((r) => ["approver", "administrator", "principal_admin"].includes(r))) {
        return json({ error: "forbidden" }, 403);
      }
      const passportId = body?.passport_id;
      if (typeof passportId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(passportId)) {
        return json({ error: "invalid_passport_id" }, 400);
      }
      const rpcResponse = await fetch(new URL("/rest/v1/rpc/publish_passport_with_audit", projectUrl), {
        method: "POST",
        headers: serviceHeaders,
        body: JSON.stringify({ p_passport_id: passportId, p_actor_id: user.id }),
      });
      if (!rpcResponse.ok) {
        return json({ error: "publication_failed" }, 422);
      }
      const version = await rpcResponse.json();
      return json({ passport_id: passportId, published_version: version });
    }

    return json({ error: "unsupported_action" }, 400);
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
});
