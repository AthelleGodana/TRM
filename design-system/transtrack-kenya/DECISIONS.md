# Design decisions (read with MASTER.md)

MASTER.md was generated with the ui-ux-pro-max skill
(`nextlevelbuilder/ui-ux-pro-max-skill`, commit 3a13158) and is the source of
truth for palette, type and spacing. This file records how it was produced
and where the app deliberately differs from it.

## How MASTER.md was generated

```bash
python -I <skill>/scripts/search.py "logistics b2b saas dashboard" --design-system \
  --persist -p "Transtrack Kenya" --output-dir <repo> --density 7 --variance 3 --motion 3
```

- A first query, `"fleet management transport tracking saas"`, matched the
  right style (Minimalism & Swiss) but returned a terminal-green palette and
  a luxury serif pairing (Cinzel / Josefin Sans). That was off-topic for a
  professional SaaS, so it was not persisted.
- The retry above matches the database's **Logistics/Delivery** palette
  (tracking blue + delivery orange) and the **Friendly SaaS** type pairing
  (Plus Jakarta Sans), confirmed by separate `--domain color` and
  `--domain typography` searches.

Supporting searches: `--domain ux` (focus not obscured, error summary,
navigation, reduced motion, live badge counts), `--domain icons` (icon button
labels), `--stack react` (form labels, focus management) and
`--stack html-tailwind` (dark mode).

## Applied rules

- **Tokens:** semantic CSS variables (`--color-*`) in `client/src/index.css`,
  mapped in `tailwind.config.js`. Components never use raw hex.
- **Light by default.** MASTER lists "dark mode by default" as an
  anti-pattern, so dark mode stays opt-in through the existing theme toggle,
  with its own token set checked for 4.5:1 text contrast.
- **Icons:** Lucide (`lucide-react`, already a dependency), one family
  throughout, no emoji. Decorative icons get `aria-hidden`; icon-only buttons
  get an `aria-label`.
- **Interaction:** 44px minimum targets, visible `focus-visible` rings,
  150–250ms colour/opacity transitions, no layout-shifting hover transforms,
  `cursor-pointer` on clickable elements.
- **Forms:** visible labels, errors beside the field with `role="alert"`,
  16px inputs (no iOS zoom).
- **Navigation:** sidebar on desktop; bottom nav of at most 5 items on
  mobile; sticky bars offset with `scroll-padding` so focus is never hidden.
- **Badges:** admin counts are announced with a contextual status
  ("3 pending access requests"), not a bare number.
- **Motion:** subtle only, and disabled under `prefers-reduced-motion`
  (CSS media query and framer-motion `MotionConfig reducedMotion="user"`).

## Deliberate differences from MASTER.md

| MASTER.md | App | Why |
|---|---|---|
| `.btn-primary` is orange with black text | Primary actions are blue (`--color-primary`) | In an operations app nearly every screen has a primary action; a single calm action colour reads better. Orange (`--color-accent`) is kept for rare emphasis. |
| Cards are hoverable with `cursor:pointer` | Only clickable cards get hover and pointer | Static cards that look clickable mislead. |
| Page pattern "Hero + Features + CTA" and the GSAP scroll reveal | Not used | They describe a marketing page; the app has none. The existing framer-motion is enough. |
