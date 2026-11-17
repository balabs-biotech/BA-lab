# OriginKit integration — BA Labs CultureOps

## Scope

This integration connects CultureOps to the official OriginKit MCP service through a Supabase Edge Function. The browser never receives the OriginKit API key.

- Official MCP endpoint: `https://mcp.originkit.dev/vellumai`
- Catalog source (public metadata only): `vellum-ai/originkit/src/component-index.json`
- Source retrieval: MCP `tools/call` with tool `get_component`
- Server secret: `ORIGINKIT_API_KEY`
- Edge Function: `originkit-mcp`
- JWT verification: enabled; only authenticated Supabase sessions can fetch source.

## Why this is a bridge, not a browser plugin

OriginKit's official plugin targets Vellum Assistant. It is not a ChatGPT plugin that can be installed into this session, and its component catalogue currently advertises Framer variants. CultureOps is a static HTML/JavaScript application. The bridge requests Vite-compatible source as an intermediate artifact; imported components must be reviewed and adapted to the existing no-framework runtime before being loaded into a workspace.

## Security

1. Rotate any API key previously pasted into a chat or other shared surface.
2. Add the replacement key in Supabase Dashboard → Project Settings → Edge Functions → Secrets, under the exact name `ORIGINKIT_API_KEY`.
3. Never add the key to GitHub, a frontend `.js` file, HTML, local storage, or a public environment variable.
4. Keep Edge Function JWT verification enabled.
5. The function accepts only `browse` and `get` actions, validates component names against the official catalogue, and fixes the upstream host to OriginKit. It does not act as a general-purpose URL proxy.
6. OriginKit documents a limit of 10 source fetches per key per day, shared with website copies. Browse requests use public catalogue metadata and do not consume source-fetch quota.

## Request contract

Invoke the function with the current Supabase client:

```js
const { data, error } = await supabase.functions.invoke("originkit-mcp", {
  body: { action: "browse", query: "particle", category: "interactive-elements" }
});
```

Fetch a component only after reviewing the catalogue entry:

```js
const { data, error } = await supabase.functions.invoke("originkit-mcp", {
  body: {
    action: "get",
    name: "risinglines",
    stack: "vite",
    styling: "css",
    typescript: false
  }
});
```

The returned source is an import artifact, not automatically executable in CultureOps. Review dependencies, accessibility, canvas lifecycle, reduced-motion handling, mobile performance, and licensing attribution before integration.

## Current status

- [x] Official OriginKit endpoint and JSON-RPC contract verified from the public repository.
- [x] Public component index and MIT licence verified.
- [x] Server-side relay source prepared; API key is not embedded.
- [ ] Add a newly rotated API key as the Supabase Edge Function secret.
- [ ] Deploy the Edge Function and verify browse/get against the authenticated app.
- [ ] Fetch and adapt selected components (do not spend the 10-fetch daily quota on exploratory calls).
- [ ] Integrate and visually test each chosen animation in its target sector.

## Attribution

OriginKit components are created by Vellum. Preserve the upstream MIT copyright and licence notice with any copied or adapted source. See https://github.com/vellum-ai/originkit/blob/main/LICENSE.
