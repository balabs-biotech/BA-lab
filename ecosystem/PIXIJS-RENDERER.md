# PixiJS 2D mycelium renderer

## Current migration slice

The 2D explorer now uses PixiJS v8 as its primary WebGL renderer. The existing graph model, eight-language tree loading, stable node IDs, hit testing, pan/zoom camera, and Notion resource links remain in the explorer controller.

- `../ecosystem-core/explorer-2d-pixi.js`: the shared PixiJS/WebGL renderer used by both the Academy and public explorer.
- `../ecosystem-core/explorer-2d-network.js`: the shared eight-anchor geometry, recursive branch placement, evidence-backed Notion relations and local anastomoses. Each explorer supplies its own Notion tree; the public explorer maps its eight root IDs onto the Academy's canonical anchor order.
- `explorer-2d.js`: data loading, deterministic graph topology, camera, gestures, selection and accessible node navigation.
- DaisyUI remains the shell/component layer; it is not used to render the biological field.
- The historical 3D engine is outside this migration and must not be modified.

## Rendering and biological direction

PixiJS owns the field rendering. The topology remains driven by the Notion tree and stable IDs. The eight universe anchors now occupy an irregular spatial field instead of an eight-spoke ring. Cross-universe links are selected by nearest-neighbour distance, with first-generation anastomoses and within-universe branch links. Main hyphae, lateral hyphae and cross-links are rendered as seeded, asymmetrically curved filaments; deeper generations fade in with camera scale. The visual language must stay asymmetric and microscopy-inspired: no planets, radial cards, tubes, starburst hubs or decorative spheres.

tsParticles is not loaded as a second independent canvas. Its useful motion concepts (noise-driven drift, trails and particle flow) should be integrated only where they can follow the graph's actual edges and node IDs. OriginKit remains a visual/technique reference for field density, ribbons, glow restraint and pointer response, not a production runtime dependency.

## Next engineering steps

1. Browser-test PixiJS initialization and verify the actual WebGL canvas on desktop and mobile.
2. Move repeated Graphics allocation to retained containers/geometry and use ParticleContainer or a custom shader for large spore/flow populations.
3. Continue refining the irregular graph-aware layout and branch density while preserving eight connected universes and all descendants.
4. Add camera-aware level-of-detail and label collision handling; labels must not grow into the viewport or obscure the hyphae.
5. Add edge-following particle advection with bounded CPU/GPU cost and reduced-motion support.
6. Measure frame time on a mid-range mobile device before increasing filament or particle density.

## Constraints

- No navigation to another page when selecting a branch; only explicit Notion resource links open externally.
- No obstructive side panel over the visualization.
- Keep language tree JSON files and Notion source links intact.
- Do not merge/deploy until browser smoke tests and visual inspection pass.
