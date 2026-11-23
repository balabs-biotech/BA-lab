import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return json({ error: "service_unavailable" }, 503);
  }

  const token = new URL(req.url).searchParams.get("token") ?? "";
  // QR tokens are opaque random secrets. Never accept a hash as the bearer token.
  if (token.length < 32 || token.length > 256 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return json({ error: "passport_not_found" }, 404);
  }

  try {
    const tokenHash = await sha256Hex(token);
    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json",
    };

    const passportUrl = new URL("/rest/v1/passports", url);
    passportUrl.search = new URLSearchParams({
      select: "id,current_version",
      qr_token_hash: `eq.${tokenHash}`,
      status: "eq.published",
      limit: "1",
    }).toString();

    const passportResponse = await fetch(passportUrl, { headers });
    if (!passportResponse.ok) {
      return json({ error: "service_unavailable" }, 503);
    }
    const passports = await passportResponse.json();
    const passport = Array.isArray(passports) ? passports[0] : null;
    if (!passport || !Number.isInteger(passport.current_version) || passport.current_version < 1) {
      return json({ error: "passport_not_found" }, 404);
    }

    const versionUrl = new URL("/rest/v1/passport_versions", url);
    versionUrl.search = new URLSearchParams({
      select: "snapshot",
      passport_id: `eq.${passport.id}`,
      version: `eq.${passport.current_version}`,
      limit: "1",
    }).toString();

    const versionResponse = await fetch(versionUrl, { headers });
    if (!versionResponse.ok) {
      return json({ error: "service_unavailable" }, 503);
    }
    const versions = await versionResponse.json();
    const snapshot = Array.isArray(versions) ? versions[0]?.snapshot : null;
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      return json({ error: "passport_not_found" }, 404);
    }

    // Return only the immutable public snapshot; never expose operational tables.
    return json({ passport: snapshot });
  } catch {
    return json({ error: "service_unavailable" }, 503);
  }
});
