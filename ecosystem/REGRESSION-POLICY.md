# BA Labs ecosystem — regression protection

## Source of truth

The interactive 3D universe is the canonical experience. The old HTML sphere constellation is a compatibility fallback only; it must never be shown on top of, or instead of, a successfully initialized WebGL scene.

## Protected invariants

1. Keep the eight domain IDs in the same order in the 3D registry and HTML navigation: `bio`, `myco`, `soil`, `lab`, `products`, `iot`, `work`, `learn`.
2. Preserve the organic cellular morphologies, neurites, dendrites, cross-domain anastomoses, relay routes, and moving signal particles.
3. The gateway and full universe are two camera/scale states of one 3D scene, not two independently rendered interfaces.
4. Selecting a 3D domain must call the shared domain-navigation function directly. Do not proxy-click hidden legacy controls.
5. When WebGL starts successfully, legacy HTML spheres and network overlays stay hidden.
6. When WebGL cannot start, do not silently show the legacy sphere interface as if it were the intended 3D experience. Show a clear, localized recovery state instead.
7. Every Three.js dependency must be version-pinned. Changes to the scene module require a new cache-busting query value in `ecosystem/index.html`.
8. Do not remove a visual feature or replace the network concept as part of an unrelated fix.

## Required workflow for changes

- Create a recovery point before changing the 3D engine, scene graph, navigation, or gateway.
- Make one coherent change at a time.
- Run `node scripts/test-ecosystem-regressions.mjs` and `node --check --input-type=module < ecosystem/constellation-3d.js`.
- Wait for CI and GitHub Pages deployment to finish successfully before calling a change published.
- If a regression check fails, stop. Do not stack more visual changes on top of a broken state.
- Compare the result with the last known-good recovery branch before attempting a broad rewrite.
- Never delete or replace a working scene implementation without retaining a recoverable commit/branch.

## Recovery references (2026-10-30)

- `archive/pre-protection-20261030`: exact repository state before these protections.
- `recovery/organic-network-baseline`: earlier organic 3D scene before the latest gateway rewiring. It is a recovery reference, not an assertion that every historical browser state was perfect.

These branches are intentionally kept separate from `main`; they are not deployment branches.
