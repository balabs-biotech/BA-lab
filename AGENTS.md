# BA Labs — Agent instructions

## Interface design and frontend work

Before implementing visual or interaction changes, consult the relevant local skill in `.agents/skills/`. Use `emil-design-eng` as the default design-engineering guide; use `prototype` to explore multiple materially different design directions; use `break-ui` and `mobile-native` for robustness; use `review-animations` and `learn-taste` during quality review and after user corrections.

Do not default to generic AI-generated SaaS templates. First understand the product, audience, content, and constraints. Make deliberate decisions about art direction, typography, composition, spacing, color, imagery, hierarchy, responsive behavior, and interaction.

Do not add motion unless it has a clear purpose. Respect reduced-motion settings, accessibility, keyboard and touch behavior, and performance. Do not add dependencies or replace the existing stack without a concrete reason.

Preserve project architecture and deployment choices. The public BA Labs website is hosted on GitHub Pages; do not migrate it to Vercel or another provider unless the user explicitly asks.

See `.agents/skills/README.md` for the installed Emil Kowalski skill pack, references, and BA Labs usage guidance.

For BA Labs-specific visual work, also read `.agents/skills/ba-labs-design-engineering/SKILL.md` and the central catalogue at `docs/design-toolkit/README.md`. This workflow is mandatory for design exploration, component selection, implementation and visual QA.
