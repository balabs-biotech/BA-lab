---
name: ba-labs-design-engineering
description: BA Labs' mandatory design workflow for distinctive, high-quality websites and product interfaces. Use for all visual design, frontend implementation, UI critique, component selection, motion, responsive QA and design-system work.
---

# BA Labs Design Engineering

## Primary objective
Produce interfaces with a distinctive BA Labs visual identity, not generic AI-generated SaaS templates. Scientific credibility, editorial clarity, cultural character and product usability must coexist.

## Before designing
1. Read the BA Labs design toolkit at `docs/design-toolkit/README.md`.
2. Read the brand identity page in Notion when available.
3. Inspect the target repository, current stack, existing components, routes, assets, deployment and constraints.
4. Identify audience, job-to-be-done, content, proof, primary action and key states.
5. Research relevant visual references and record the specific lesson from each.

## Explore before committing
- Produce at least three materially different art directions.
- Vary composition, typography, image language, density, color strategy and interaction—not only palette.
- Show the directions in a runnable preview or clearly comparable mockups.
- Explain trade-offs and recommend one direction; do not implement a template by default.

## Build
- Preserve the existing framework, package manager, architecture and deployment unless explicitly authorized to change them.
- Select components from Bklit, Space UI, Arc UI, ARC UI or React Bits only when they fit the app's stack and visual direction.
- Inspect package docs, license, peer dependencies, keyboard behavior, responsive behavior and reduced-motion support before adopting.
- Copy-first component registries create local source: review and own the resulting code.
- Do not add a whole library for one component; do not install every library into every app.
- Keep the public BA Labs website deployed on GitHub Pages.

## Motion and 3D
- Use the Animate Anything registry to research the correct motion layer; it is a discovery map, not a runtime package.
- Use Motion (`motion`) for UI state, gestures, layout and scroll-linked animation when it fits the app.
- Use Three.js only when real 3D/WebGL adds explanatory or brand value; consider existing PixiJS for 2D.
- Keep 3D optional, performant, responsive and backed by an accessible static/2D fallback.
- Respect `prefers-reduced-motion`; motion must clarify feedback, hierarchy or continuity.

## Motion
Use Emil Kowalski skills where relevant: emil-design-eng, prototype, learn-taste, find-animation-opportunities, animate, choreograph, review-animations, animation-performance, break-ui and mobile-native.
Motion must serve feedback, comprehension or continuity. Respect prefers-reduced-motion and avoid layout-thrashing animation.

## QA
Review actual browser output at desktop, tablet and mobile widths. Test keyboard, touch, focus, hover, active, loading, empty, error, long content and reduced-motion states. Use Playwright when the project has a compatible test setup. Fix visual hierarchy, spacing, typography and responsive issues before decorative polish.

## Learn from feedback
When the user rejects a design, do not defend it or make superficial changes. Identify the underlying taste correction, update the design rules, and apply that lesson to future work. Record approved and rejected directions with reasons.

## Definition of done
A design is not done because it compiles. It must be visually reviewed in a real browser, responsive, accessible, coherent with BA Labs, and demonstrably better than the previous iteration.
