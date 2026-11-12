# BA Labs — visual system foundation

This branch contains an **opt-in CSS foundation** for the editorial layer of the BA Labs public site.

## Files

- `ecosystem/brand-system.css`: brand tokens, accessible action styles, hierarchical navigation, resource/project cards and responsive grid primitives.

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

## Integration boundary

The stylesheet is deliberately **not imported** by `ecosystem/index.html`. No production behavior changes in this commit. Apply the `.balabs-ui` class only to the editorial shell after visual review.

## Protected scope

This stylesheet does not target or override:

- Three.js/WebGL scene, camera, labels, hit targets or branch dock
- legacy sphere fallback
- Notion manifest/navigation logic
- Batch Tracker
- existing language switching

The 3D engine must remain independently testable and unchanged by editorial CSS work.

## Accessibility and responsive behavior

- Visible focus ring with copper contrast
- Native button disabled state
- Persistent text labels for all navigation depths
- 44px minimum action target
- Reduced-motion preference respected
- One-column layout at narrow mobile widths

## Next integration step

Compare the opt-in shell against the Figma homepage concept at desktop and mobile sizes. Then integrate one page section at a time and run the existing regression suite before merging.
