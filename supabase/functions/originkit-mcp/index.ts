import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ORIGINKIT_ENDPOINT = "https://mcp.originkit.dev/vellumai";
const COMPONENT_INDEX_URL =
  "https://raw.githubusercontent.com/vellum-ai/originkit/main/src/component-index.json";
const DEFAULT_ORIGIN = "https://balabs-biotech.github.io";
const ALLOWED_STACKS = new Set(["vite", "react"]);
const ALLOWED_STYLING = new Set(["css", "tailwind", "cssmodules"]);

type JsonObject = Record<string, unknown>;

// The Supabase gateway validates the JWT signature when verify_jwt is enabled.
// This additional claim check rejects publishable/anon keys and anonymous sessions.
function hasAuthenticatedUser(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return false;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(
      Math.ceil(parts[1].length / 4) * 4,
      "=",
    );
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as {
      role?: unknown;
      sub?: unknown;
      is_anonymous?: unknown;
    };
    return claims.role === "authenticated" &&
      claims.is_anonymous !== true &&
      typeof claims.sub === "string" &&
      claims.sub.length > 0;
  } catch {
    return false;
  }
}

function response(
  status: number,
  payload: JsonObject,
  origin = DEFAULT_ORIGIN,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    },
  });
}

function parseTextContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new Error("invalid_mcp_response");
  }
  const envelope = payload as {
    error?: { message?: string };
    result?: { content?: Array<{ type?: string; text?: string }> };
  };
  if (envelope.error) {
    const message = String(envelope.error.message ?? "Originkit MCP error");
    if (message.toLowerCase().includes("daily limit")) {
      throw new Error("originkit_daily_limit");
    }
    throw new Error("originkit_upstream_error");
  }
  return (envelope.result?.content ?? [])
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text as string)
    .join("\n");
}

async function readMcpResponse(upstream: Response): Promise<unknown> {
  const raw = await upstream.text();
  if (!upstream.ok) {
    if (upstream.status === 401 || upstream.status === 403) {
      throw new Error("originkit_auth_failed");
    }
    throw new Error("originkit_upstream_unavailable");
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    const data = raw
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean)
      .at(-1);
    if (!data) throw new Error("invalid_mcp_response");
    return JSON.parse(data);
  }
  return JSON.parse(raw);
}

async function getComponentCatalog(): Promise<{
  count: number;
  components: Array<{ name: string; displayName: string; category: string; description: string; tags: string[]; variants: string[]; dependencies: string[] }>;
}> {
  const upstream = await fetch(COMPONENT_INDEX_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!upstream.ok) throw new Error("originkit_catalog_unavailable");
  const index = await upstream.json();
  if (!index || !Array.isArray(index.components)) {
    throw new Error("originkit_catalog_invalid");
  }
  return index;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? DEFAULT_ORIGIN;
  if (origin !== DEFAULT_ORIGIN) {
    return new Response("origin_not_allowed", { status: 403 });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": DEFAULT_ORIGIN,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin",
      },
    });
  }
  if (req.method !== "POST") {
    return response(405, { error: "method_not_allowed" });
  }

  const bearer = req.headers.get("authorization")?.match(/^Bearer\\s+(.+)$/i)?.[1];
  if (!bearer || !hasAuthenticatedUser(bearer)) {
    return response(401, { error: "authenticated_session_required" });
  }

  let input: JsonObject;
  try {
    input = await req.json();
  } catch {
    return response(400, { error: "invalid_json" });
  }

  const action = input.action;
  if (action === "browse") {
    try {
      const catalog = await getComponentCatalog();
      const query = typeof input.query === "string" ? input.query.trim().toLowerCase().slice(0, 80) : "";
      const category = typeof input.category === "string" ? input.category.trim().toLowerCase() : "";
      const components = catalog.components.filter((component) => {
        const categoryMatches = !category || component.category === category;
        const haystack = [
          component.name,
          component.displayName,
          component.description,
          component.category,
          ...(component.tags ?? []),
        ].join(" ").toLowerCase();
        return categoryMatches && (!query || haystack.includes(query));
      });
      return response(200, { count: components.length, components });
    } catch {
      return response(502, { error: "originkit_catalog_unavailable" });
    }
  }

  if (action !== "get") {
    return response(400, { error: "unsupported_action" });
  }

  const name = typeof input.name === "string" ? input.name.trim().toLowerCase() : "";
  if (!/^[a-z0-9-]{2,48}$/.test(name)) {
    return response(400, { error: "invalid_component_name" });
  }

  const stack = typeof input.stack === "string" ? input.stack : "vite";
  const styling = typeof input.styling === "string" ? input.styling : "css";
  const typescript = input.typescript === true;
  if (!ALLOWED_STACKS.has(stack) || !ALLOWED_STYLING.has(styling)) {
    return response(400, { error: "unsupported_component_format" });
  }

  const apiKey = Deno.env.get("ORIGINKIT_API_KEY");
  if (!apiKey) {
    return response(503, { error: "originkit_not_configured" });
  }

  try {
    const catalog = await getComponentCatalog();
    if (!catalog.components.some((component) => component.name === name)) {
      return response(404, { error: "component_not_found" });
    }

    const upstream = await fetch(ORIGINKIT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: "tools/call",
        params: {
          name: "get_component",
          arguments: { name, stack, styling, typescript },
        },
      }),
      signal: AbortSignal.timeout(20000),
    });

    const payload = await readMcpResponse(upstream);
    const content = parseTextContent(payload);
    if (content.toLowerCase().includes("daily limit reached")) {
      return response(429, { error: "originkit_daily_limit" });
    }
    return response(200, { name, stack, styling, typescript, content });
  } catch (error) {
    const code = error instanceof Error ? error.message : "originkit_upstream_unavailable";
    if (code === "originkit_daily_limit") {
      return response(429, { error: code });
    }
    if (code === "originkit_auth_failed") {
      return response(502, { error: code });
    }
    if (code === "originkit_not_configured") {
      return response(503, { error: code });
    }
    return response(502, { error: "originkit_upstream_unavailable" });
  }
});
