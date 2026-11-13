# BA Labs — visual system

This is the active visual layer for the public BA Labs ecosystem page.

## Integration

`ecosystem/index.html` loads the stylesheets in this order:

1. `site-base.css` — foundational layout and legacy fallback styling.
2. `brand-system.css` — BA Labs brand tokens and editorial homepage styling.
3. `site-overrides.css` — final, page-specific visual corrections.

The page root (`#app`) carries the `.balabs-ui` class. The brand stylesheet is therefore part of the live page, not an opt-in or future integration.

## Brand tokens

| Token | Value | Intended use |
|---|---|---|
| Graphite | `#111B1D` | Main background |
| Forest | `#263B38` | Surfaces and cards |
| Copper | `#B96B4D` | Actions and accents |
| Mineral | `#D1D0C5` | Main body text |
| Paper | `#F2F1E9` | Headings |
| Muted | `#9BAEA4` | Secondary text |
| Line | `#40534D` | Borders and separators |

## Scope and ownership

- This stylesheet owns editorial presentation for the header, hero, featured work, eight-universe directory, method section and footer.
- It also styles selected WebGL interface surfaces, including focus and branch-navigation controls.
- It does not own 3D scene generation, graph topology, camera movement, node selection or navigation logic.
- `engine-v2.js` and `constellation-3d.js` remain the owners of the interactive 3D experience.
- The stylesheet is loaded only by the public ecosystem page; it does not style the Batch Tracker application.

## Accessibility and responsive behavior

- Visible keyboard focus states
- Touch targets sized for mobile use
- Responsive layouts for desktop, tablet and narrow mobile screens
- Reduced-motion preferences respected

## Maintenance rules

- Keep the stylesheet order documented above; `site-overrides.css` intentionally has final cascade priority.
- Do not remove engine-generated selectors merely because they are absent from static HTML.
- When changing selectors that affect the WebGL interface, run the ecosystem regression and browser smoke checks.
- Keep 3D engine behavior changes isolated from editorial CSS cleanup.
