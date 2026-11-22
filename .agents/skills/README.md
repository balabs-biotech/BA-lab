# Emil Kowalski — Agent Skills for BA Labs

Complete upstream skill collection installed from [emilkowalski/skills](https://github.com/emilkowalski/skills).

## Installed skills

- [animate](./animate/SKILL.md)
- [animate-expo](./animate-expo/SKILL.md)
- [animation-performance](./animation-performance/SKILL.md)
- [animation-vocabulary](./animation-vocabulary/SKILL.md)
- [apple-design](./apple-design/SKILL.md)
- [ask-emil](./ask-emil/SKILL.md)
- [ask-sonner](./ask-sonner/SKILL.md)
- [break-ui](./break-ui/SKILL.md)
- [choreograph](./choreograph/SKILL.md)
- [emil-design-eng](./emil-design-eng/SKILL.md)
- [find-animation-opportunities](./find-animation-opportunities/SKILL.md)
- [gestures](./gestures/SKILL.md)
- [improve-animations](./improve-animations/SKILL.md)
- [learn-taste](./learn-taste/SKILL.md)
- [mobile-native](./mobile-native/SKILL.md)
- [pick-ui-library](./pick-ui-library/SKILL.md)
- [prototype](./prototype/SKILL.md)
- [remove-animations](./remove-animations/SKILL.md)
- [review-animations](./review-animations/SKILL.md)
- [write-swift](./write-swift/SKILL.md)

## Preserved supporting material

Recipes, review standards, audit templates, prototype picker guidance, UI/performance cheat sheets, and the upstream MIT license are included beside the relevant skills.

## How BA Labs agents should use this pack

For everyday frontend work, start with `emil-design-eng`. Use `prototype` to compare distinct directions before committing to one. Use `break-ui` and `mobile-native` to test responsive and edge-case behavior. Use `review-animations` to audit motion and `learn-taste` after design feedback so recurring corrections become project rules.

This is a repository-local agent skill pack, not a ChatGPT plugin and not a runtime dependency. Compatible coding agents discover the skills from `.agents/skills/<skill-name>/SKILL.md`.

## BA Labs constraints

- Preserve the existing application architecture and technology choices.
- Avoid generic template-like SaaS UI. Establish the product's audience, information hierarchy, visual direction, and constraints first.
- Motion must serve feedback, comprehension, or continuity; do not animate for decoration alone.
- Respect accessibility, reduced-motion preferences, keyboard/touch interaction, and performance.
- The public BA Labs website remains hosted on GitHub Pages. Do not switch hosting providers unless explicitly requested.
- The complete upstream license is preserved in [EMIL-KOWALSKI-LICENSE](./EMIL-KOWALSKI-LICENSE).
