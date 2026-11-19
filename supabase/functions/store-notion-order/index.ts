import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Retired legacy endpoint. Public storefront traffic must use create-store-order.
Deno.serve(() => new Response(
  JSON.stringify({ success: false, error: "endpoint_retired", replacement: "create-store-order" }),
  {
    status: 410,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  }
));
