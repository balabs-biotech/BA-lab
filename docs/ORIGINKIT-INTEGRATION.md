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

OriginKit's official plugin targets Vellum Assistant. It is not a ChatGPT plugin that can be installed into this session. CultureOps is a static HTML/JavaScript application, while the selected OriginKit components are React/Vite source. The bridge retrieves source as an intermediate artifact; each component must be reviewed and adapted to the existing no-framework runtime before production use.

## Security

1. Rotate any API key previously pasted into a chat or other shared surface.
2. Store the replacement only in Supabase Edge Function secrets as `ORIGINKIT_API_KEY`.
3. Never add the key to GitHub, frontend JavaScript, HTML, local storage, or a public environment variable.
4. Keep Edge Function JWT verification enabled.
5. The function accepts only `browse` and `get`, validates component names against the official catalogue, and fixes the upstream host to OriginKit. It is not a general-purpose URL proxy.
6. OriginKit's source-fetch quota is limited; fetch only the selected components, not exploratory variations.

## Request contract

Use the authenticated Supabase client already signed in to CultureOps:

```js
const { data, error } = await supabase.functions.invoke("originkit-mcp", {
  body: { action: "browse", query: "particle" }
});
```

After reviewing the catalogue, fetch a component:

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

The returned source is not automatically executable in CultureOps. Review imports, dependencies, lifecycle, accessibility, reduced-motion behavior, mobile performance, and licensing before mounting it.

## Current status

- [x] Official OriginKit endpoint, JSON-RPC contract, public component index, and MIT licence reviewed.
- [x] Secure Supabase relay committed; no API key in source control.
- [x] Replacement key configured by the project owner in Supabase.
- [x] Edge Function `originkit-mcp` deployed and confirmed active (version 1, JWT verification enabled).
- [ ] Invoke `browse` and `get` from an authenticated CultureOps session to validate the secret and upstream response.
- [x] Add a spatial module navigation rail with previous/next controls, progress steps, Alt+arrow keyboard navigation, and touch-swipe support. Browser-smoke-tested on all three workspaces at desktop and mobile viewport sizes.
- [ ] Retrieve the three selected components and inspect their actual returned source/dependencies.
- [x] Adapt Rising Lines into the GreenTech hero as a lightweight canvas particle stream with a lime horizon glow.
- [x] Adapt Particle Sphere into Mycology with a Three.js particle cloud and a 2D canvas fallback when WebGL is unavailable.
- [x] Adapt Kinetic Grid into Laboratory as a native canvas mesh with cursor attraction and trail.
- [x] Preserve reduced-motion handling, resize observation, viewport-based animation pausing, and mobile sizing across the three visual adapters.
- [x] Browser-check all three sector canvases at desktop/mobile widths. The current browser environment does not expose WebGL, so the Mycology 2D fallback was verified; the Three.js WebGL path remains to be checked on a WebGL-capable client.
- [ ] Visually verify desktop/mobile layouts, interaction, and reduced-motion behavior.

## Selected component mapping

| Workspace | Component | Intended role |
|---|---|---|
| GreenTech | `risinglines` | restrained rising light/particle motion in the environmental hero |
| Mycology | `particlesphere` | copper/graphite 3D particle field; no green palette |
| Laboratory | `kineticgrid` | integrated native canvas adaptation: interactive blue mesh, pointer attraction, trail and responsive sizing |

The three adapters are based on Vellum's published motion-design component references (which include OriginKit preview configuration comments), adapted for CultureOps' static runtime. They are not the original React/Framer wrappers. The secure MCP `get` call still needs authenticated end-to-end verification, so these adaptations do not yet prove that the deployed bridge can retrieve source from the API.

## Attribution

OriginKit components are created by Vellum. Preserve the upstream MIT copyright and licence notice with copied or adapted source: https://github.com/vellum-ai/originkit/blob/main/LICENSE.
