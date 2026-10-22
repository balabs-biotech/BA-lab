import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";

const NOTION_VERSION = "2022-06-28";
const UUID_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

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

// Accepts a Notion ID with or without dashes. Surrounding whitespace, quotes and
// stray trailing punctuation (e.g. a final ".") are removed; anything that is
// still not a UUID is rejected instead of being sent to Notion.
function normalizeNotionId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^[\s"'`]+|[\s"'`.,;:]+$/g, "");
  if (!UUID_RE.test(cleaned)) return null;
  const hex = cleaned.replace(/-/g, "").toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Bound external requests so a stalled Notion call cannot hold a sync claim indefinitely.
async function notionFetch(input: string | URL, init: RequestInit = {}) {
  return fetch(input, { ...init, signal: AbortSignal.timeout(15_000) });
}

function richText(value: unknown) {
  const text = value == null ? "" : String(value);
  return text ? [{ type: "text", text: { content: text.slice(0, 1900) } }] : [];
}

function notionProperties(record: Record<string, any>, pageUrl?: string) {
  const cultureType = String(record.culture_type ?? "other");
  const date = record.started_at ? new Date(record.started_at).toISOString() : null;

  const properties: Record<string, any> = {
    "Culture": { title: [{ type: "text", text: { content: String(record.code ?? "Culture sans code").slice(0, 1900) } }] },
    "Culture Code": { rich_text: richText(record.code) },
    "Type": { rich_text: richText(cultureType) },
    "Organism": { rich_text: richText(record.scientific_name ?? record.common_name) },
    "Strain": { rich_text: richText(record.strain_designation ?? record.strain_code) },
    "Generation": { number: Number.isFinite(Number(record.generation)) ? Number(record.generation) : null },
    "Start Date": { date: date ? { start: date } : null },
    "Supabase Culture ID": { rich_text: richText(record.id) },
    "Supabase Material ID": { rich_text: richText(record.material_id) },
    "Protocol": { rich_text: richText(record.protocol_name ? `${record.protocol_name}${record.protocol_version ? ` — ${record.protocol_version}` : ""}` : "") },
    "Sync Status": { select: { name: "synced" } },
  };
  // Only send Record URL when it is known, so an update never wipes an existing link.
  if (pageUrl) properties["Record URL"] = { url: pageUrl };
  return properties;
}

// A stored notion_page_id is only trusted if the page lives in the cultures
// database and carries this culture's Supabase ID. The column is writable by
// organisation members, so it must not be used as a blind PATCH target.
function pageBelongsToCulture(page: Record<string, any>, databaseId: string, cultureId: string) {
  if (!page || page.archived || page.in_trash) return false;
  const parentDb = normalizeNotionId(page.parent?.database_id);
  if (parentDb !== databaseId) return false;
  const chunks = page.properties?.["Supabase Culture ID"]?.rich_text ?? [];
  const value = chunks.map((c: any) => c?.plain_text ?? "").join("");
  return value === cultureId;
}

// Reconciliation before creating: a page may already exist if a previous run
// created it but could not save notion_page_id in Supabase.
// This lookup guards against duplicates, so it must never fail open: if Notion
// cannot answer, or answers ambiguously, the sync stops instead of creating.
async function findPageByCultureId(headers: Record<string, string>, databaseId: string, cultureId: string) {
  const response = await notionFetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      filter: { property: "Supabase Culture ID", rich_text: { equals: cultureId } },
      page_size: 2,
    }),
  });
  if (!response.ok) {
    throw new Error(`Notion lookup failed (${response.status}); no page was created to avoid a duplicate.`);
  }
  const result = await response.json();
  const pages = (result.results ?? []).filter((page: Record<string, any>) => pageBelongsToCulture(page, databaseId, cultureId));
  if (pages.length > 1) {
    throw new Error("Several Notion pages already carry this Supabase Culture ID; resolve the duplicate manually.");
  }
  return pages[0] ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "Missing authorization" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const notionToken = Deno.env.get("NOTION_API_KEY");
  const rawDatabaseId = Deno.env.get("NOTION_CULTURES_DATABASE_ID");
  const databaseId = normalizeNotionId(rawDatabaseId);

  if (!supabaseUrl || !publishableKey || !serviceKey) return json({ error: "Supabase environment is incomplete." }, 500);
  if (!notionToken || !rawDatabaseId) {
    return json({ error: "Notion sync is not configured. Add NOTION_API_KEY and NOTION_CULTURES_DATABASE_ID to Supabase Edge Function secrets." }, 503);
  }
  if (!databaseId) {
    return json({ error: "NOTION_CULTURES_DATABASE_ID is not a valid Notion database ID. Check the secret for typos or extra characters." }, 503);
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
  });
  const adminClient = createClient(supabaseUrl, serviceKey);

  let cultureIdForError = "";
  let organizationIdForError = "";
  try {
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Invalid session." }, 401);

    const body = await req.json().catch(() => ({}));
    const cultureId = typeof body.culture_id === "string" ? body.culture_id : "";
    if (!cultureId) return json({ error: "culture_id is required." }, 400);

    // Authorize using the caller's RLS-scoped access before using the service role.
    const { data: allowedCulture, error: accessError } = await userClient
      .from("cultures")
      .select("id, organization_id")
      .eq("id", cultureId)
      .maybeSingle();

    if (accessError || !allowedCulture) return json({ error: "Culture not found or access denied." }, 404);
    cultureIdForError = allowedCulture.id;
    organizationIdForError = allowedCulture.organization_id;

    // Serialize sync requests across tabs, devices and external callers.
    const requestedClaimToken = crypto.randomUUID();
    const { data: claimAcquired, error: claimError } = await adminClient.rpc("claim_notion_sync", {
      p_organization_id: allowedCulture.organization_id,
      p_culture_id: allowedCulture.id,
      p_claim_token: requestedClaimToken,
    });
    if (claimError) throw new Error(`Could not acquire Notion sync claim: ${claimError.message}`);
    if (claimAcquired !== true) {
      return json({ error: "A sync for this culture is already in progress. Retry shortly." }, 409);
    }
    claimCultureId = allowedCulture.id;
    claimOrganizationId = allowedCulture.organization_id;
    claimToken = requestedClaimToken;

    const { data: culture, error: cultureError } = await adminClient
      .from("cultures")
      .select("id, organization_id, code, culture_type, started_at, material_id, protocol_version_id, notion_page_id")
      .eq("id", cultureId)
      .eq("organization_id", allowedCulture.organization_id)
      .single();
    if (cultureError || !culture) throw new Error("Could not load culture record.");

    let record: Record<string, any> = { ...culture };
    if (culture.material_id) {
      const { data: material } = await adminClient
        .from("materials")
        .select("id, material_code, generation, strain_id")
        .eq("id", culture.material_id)
        .eq("organization_id", culture.organization_id)
        .maybeSingle();
      if (material) {
        record.material_id = material.id;
        record.generation = material.generation;
        if (material.strain_id) {
          const { data: strain } = await adminClient
            .from("strains")
            .select("strain_code, designation, organism_id")
            .eq("id", material.strain_id)
            .eq("organization_id", culture.organization_id)
            .maybeSingle();
          if (strain) {
            record.strain_code = strain.strain_code;
            record.strain_designation = strain.designation;
            if (strain.organism_id) {
              // organisms is a global reference table (no organization_id column).
              const { data: organism } = await adminClient
                .from("organisms")
                .select("scientific_name, common_name")
                .eq("id", strain.organism_id)
                .maybeSingle();
              if (organism) Object.assign(record, organism);
            }
          }
        }
      }
    }
    if (culture.protocol_version_id) {
      const { data: protocolVersion } = await adminClient
        .from("protocol_versions")
        .select("version, protocol_id")
        .eq("id", culture.protocol_version_id)
        .eq("organization_id", culture.organization_id)
        .maybeSingle();
      if (protocolVersion) {
        record.protocol_version = protocolVersion.version;
        const { data: protocol } = await adminClient
          .from("protocols")
          .select("name")
          .eq("id", protocolVersion.protocol_id)
          .eq("organization_id", culture.organization_id)
          .maybeSingle();
        if (protocol) record.protocol_name = protocol.name;
      }
    }

    const notionHeaders = {
      "Authorization": `Bearer ${notionToken}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    };

    // 1) Trust the stored page id only if it really is this culture's page.
    let existing: Record<string, any> | null = null;
    if (culture.notion_page_id) {
      const response = await notionFetch(`https://api.notion.com/v1/pages/${encodeURIComponent(culture.notion_page_id)}`, {
        method: "GET",
        headers: notionHeaders,
      });
      if (response.ok) {
        const candidate = await response.json();
        if (pageBelongsToCulture(candidate, databaseId, culture.id)) existing = candidate;
      }
    }
    // 2) Otherwise look for a page created by an earlier, partially failed run.
    if (!existing) existing = await findPageByCultureId(notionHeaders, databaseId, culture.id);

    let page: Record<string, any>;
    if (existing) {
      const response = await notionFetch(`https://api.notion.com/v1/pages/${existing.id}`, {
        method: "PATCH",
        headers: notionHeaders,
        body: JSON.stringify({ properties: notionProperties(record, existing.url) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? `Notion update failed (${response.status}).`);
      page = result;
    } else {
      const response = await notionFetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: notionHeaders,
        body: JSON.stringify({
          parent: { database_id: databaseId },
          properties: notionProperties(record),
          children: [{
            object: "block",
            type: "paragraph",
            paragraph: { rich_text: richText("Fiche synchronisée depuis BA Labs BatchTracker. Supabase demeure la source de vérité opérationnelle.") },
          }],
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? `Notion create failed (${response.status}).`);
      page = result;

      // Best effort: store the page link. A failure here is harmless.
      if (page.url) {
        await notionFetch(`https://api.notion.com/v1/pages/${page.id}`, {
          method: "PATCH",
          headers: notionHeaders,
          body: JSON.stringify({ properties: { "Record URL": { url: page.url } } }),
        }).catch(() => undefined);
      }
    }

    const persist = () => adminClient
      .from("cultures")
      .update({
        notion_page_id: page.id,
        notion_sync_status: "synced",
        notion_synced_at: new Date().toISOString(),
        notion_sync_error: null,
      })
      .eq("id", culture.id)
      .eq("organization_id", culture.organization_id);

    let { error: updateError } = await persist();
    if (updateError) ({ error: updateError } = await persist());
    // If this still fails the Notion page exists; the next run finds it through
    // findPageByCultureId instead of creating a duplicate.
    if (updateError) throw new Error(`Notion page ${page.id} exists but the Supabase sync status could not be saved: ${updateError.message}`);

    return json({ ok: true, culture_id: culture.id, notion_page_id: page.id, notion_url: page.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected sync error.";
    console.error("sync-culture-to-notion:", message);
    if (cultureIdForError && organizationIdForError) {
      await adminClient.from("cultures")
        .update({ notion_sync_status: "error", notion_sync_error: message.slice(0, 1000) })
        .eq("id", cultureIdForError)
        .eq("organization_id", organizationIdForError);
    }
    return json({ error: message }, 502);
  } finally {
    if (claimCultureId && claimOrganizationId && claimToken) {
      const { error: releaseError } = await adminClient.rpc("release_notion_sync_claim", {
        p_organization_id: claimOrganizationId,
        p_culture_id: claimCultureId,
        p_claim_token: claimToken,
      });
      if (releaseError) console.error("Could not release Notion sync claim:", releaseError.message);
    }
  }
});
