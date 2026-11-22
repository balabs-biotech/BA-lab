# BA Labs — Design Toolkit

> Source of truth for design methods, agent instructions, component registries, visual references and QA. This is a working toolkit, not a mandate to use every library.

## Why this exists

BA Labs' current interfaces are not yet distinctive or polished enough. The goal is to stop producing generic AI-looking dashboards and landing pages. Every interface must have a clear art direction, a real information hierarchy, deliberate typography and composition, credible imagery, responsive behavior and purposeful interaction.

## Where things live

- **GitHub repository:** canonical, versioned instructions and implementation references.
- **Notion:** human-readable catalogue, inspiration library, decisions and review notes.
- **Application repositories:** only the components actually selected for that app.
- **Supabase:** not a design asset store. Use it only if a future design-review product needs structured feedback or versioned review records.

## Design workflow (mandatory)

1. **Understand the product** — audience, job-to-be-done, context, constraints, content and success criteria.
2. **Research references** — collect 5–10 relevant examples; record what is useful (layout, type, imagery, navigation, interaction), not just screenshots.
3. **Explore at least 3 distinct directions** — materially different art direction, not three recolors of one template. Compare before committing.
4. **Define the system** — typography, color roles, spacing, grid, radii, borders, elevation, iconography, image treatment, motion rules and responsive breakpoints.
5. **Build in the existing stack** — inspect the target app first. Do not add a dependency or replace a UI foundation without a concrete reason.
6. **Review in a real browser** — desktop, tablet and mobile; keyboard, touch, loading, empty, error, long-content and reduced-motion states.
7. **Critique and iterate** — explain what is weak, fix the highest-impact issues, and record durable user corrections in `DESIGN.md`.

## Emil Kowalski skill pack already present

The complete repository-local collection is installed at `.agents/skills/` and indexed in `.agents/skills/README.md`. Use:
- `emil-design-eng` as the default design-engineering guide.
- `prototype` before choosing a visual direction.
- `learn-taste` after user feedback.
- `break-ui` and `mobile-native` for responsive/edge-case review.
- `review-animations`, `find-animation-opportunities`, `animation-performance` and `remove-animations` for motion quality.

This is an agent skill pack, not a runtime package. Preserve its upstream license.

## Component and implementation resources

| Resource | Type | Best use | Adoption rule |
|---|---|---|---|
| [Bklit UI](https://ui.bklit.com/docs) | shadcn registry / React charts | Scientific dashboards, time series, gauges, heatmaps, Sankey and data visualization | Add only the chart needed; requires a compatible React + shadcn setup. Registry: `@bklit` → `https://ui.bklit.com/r/{name}.json`. |
| [Space UI](https://www.spaceui.one/docs) | open component distribution | Expressive interactive React components and motion patterns | React 19, Base UI, Tailwind v4 and Motion assumptions; check the target app before use. |
| [Arc UI](https://uiarc.dev/docs) | shadcn registry / React components and blocks | Polished controls, dialogs, navigation, app shells and blocks | Install source selectively; check free/Pro status and dependencies. Registry: `@uiarc` → `https://uiarc.dev/r/{name}.json`. |
| [ARC UI](https://arcui.dev/docs) | Lit web components + framework wrappers | Cross-framework components where Lit is appropriate | Distinct project from Arc UI at uiarc.dev; do not confuse them. |
| [React Bits](https://reactbits.dev/) | React component and animation collection | Distinctive hero elements, visual effects and interactive components | Inspiration first; adopt selectively and check accessibility/performance. |
| [Playwright](https://playwright.dev/) | browser automation and end-to-end testing | Visual QA, responsive checks, interaction regression and screenshots | Use in test/dev workflows, not as a UI component library. |

### Install examples (only after target app inspection)

```bash
# Bklit chart (requires shadcn registry setup)
npx shadcn@latest add @bklit/line-chart

# Arc UI item (requires shadcn registry setup)
npx shadcn@latest add @uiarc/button

# Playwright (only in a compatible Node project)
npm init playwright@latest
```

Do not run these commands in the public GitHub Pages root blindly. First identify which app owns the UI, its package manager, framework, React/Tailwind versions and existing component system. Keep libraries isolated per app.

## Inspiration and research references

| Resource | Category | How to use it |
|---|---|---|
| [Godly](https://godly.design/) | curated website inspiration | Study art direction, editorial composition, typography and interaction; do not clone layouts. |
| [Motionographer](https://motionographer.com/) | motion design publication | Study visual storytelling, transitions, title design and motion craft. |
| [Prompt Motion](https://prompt-motion.com/) | motion prompt/video reference library | Extract ideas for motion language; rebuild deliberately for the product and respect creator attribution. |
| [Impeccable](https://impeccable.style/) | design-engineering guidance / skill ecosystem | Use as a critique and polish reference; confirm the exact skill/package and license before copying into the agent pack. |
| [Taste](https://www.tasteskill.dev/) | design taste skill reference | Candidate for local agent workflow; verify upstream repo and license before importing. |

## Names supplied by the team — verification queue

These names were supplied but the exact product/repository is not yet confirmed. Do not invent URLs or install a similarly named package:
- Do Daddy Airo (possibly Dora AI — confirm exact name)
- Componentory
- SketcherUI
- Planes
- Eye Candy (multiple products use this name)
- PerfectQA
- “Motion Site” (confirm whether this means Motion.dev, a gallery, or another product)

Add each only after verifying its canonical domain/repository, purpose, framework compatibility, license and installation method.

## BA Labs visual principles

- Scientific credibility without institutional coldness.
- Editorial clarity with a distinctive, contemporary cultural layer.
- Real lab work, real cultures, real equipment and real data take priority over generic stock imagery.
- Use the mycelium/network metaphor with restraint; avoid literal mushroom clip-art everywhere.
- Strong type hierarchy; avoid default Inter + purple gradient + rounded-card dashboard patterns unless justified.
- Color must have roles and contrast, not merely decoration.
- Motion should explain state, reveal hierarchy or create continuity; never slow the work.
- Accessibility, keyboard/touch behavior, reduced motion and performance are part of design quality.
- Public website remains on GitHub Pages.

## Review checklist

- Can a new visitor understand the purpose and audience in 5–10 seconds?
- Is the visual direction recognizable as BA Labs rather than a generic SaaS template?
- Is the primary action obvious without shouting?
- Does the layout have a deliberate rhythm and hierarchy?
- Are imagery and diagrams specific and credible?
- Are data visualizations legible, honest and contextualized?
- Do mobile layouts feel designed, not merely squeezed?
- Are hover, focus, active, loading, empty, error and disabled states complete?
- Does motion respect reduced-motion and remain performant?
- Have we tested actual browser rendering at multiple viewport sizes?

## Decisions log

Record each approved direction, rejected direction and reason here or in the linked Notion design review. Never silently treat a proposal as an approved brand rule.
