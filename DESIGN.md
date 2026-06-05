# DESIGN.md — LMAO design language

A refinement spec for **LMAO — Lethal Mayhem: Arena Online**. The job is *craft and
consistency*, not new features. Thesis: it should look like a genuinely well-made modern
game UI, yet still read as a tongue-in-cheek budget knockoff. **Premium execution, goofy
brand.** Cheap-looking only on purpose.

The UI language is a **holographic visor HUD**: angular, diegetic, restrained, glowing
cyan/amber on near-black. Halo-*inspired*; never its real assets, logos, or fonts.

---

## Audit — what was inconsistent (before this pass)

- **Color was used without rules.** `hud-amber` was the default body color *and* a near-primary
  accent; `temu-orange` meant CTA *and* reload *and* "Wartrolley"; there were **two reds**
  (`temu-red` #ff3b30 and team/`hud-red` #ff4d5e) used interchangeably; team colors were
  hardcoded hex (`#ff4d5e`, `#3aa0ff`) all over `HUD.tsx` instead of tokens.
- **No type scale.** Sizes ranged `text-[8px]`→`text-5xl` chosen per-spot; letter-spacing
  varied (`tracking-wide`, `0.2em`, `0.3em`, `widest`).
- **Motion was scattered.** Durations of 120ms / 0.25s / 0.4s / 4s with no shared easing;
  `animate-pulse` decorated four unrelated elements (low-shield, overshield, reload, CTF),
  diluting urgency.
- **Legibility risk.** HUD clusters relied only on a global text-shadow; over bright maps
  (Bargain Gulch) thin text/bars could wash out. No consistent scrim.
- **Accessibility gaps.** No `:focus-visible` styling for keyboard users.

## The system

### Type (Oswald display · JetBrains Mono data)
| Role | Class | Use |
| --- | --- | --- |
| Display | `.t-display` | hero only |
| H1 / H2 / H3 | `.t-h1` `.t-h2` `.t-h3` | page + panel headings |
| Body | `.t-body` | paragraphs (muted amber) |
| Label | `.label` | mono, uppercase, `0.18em`, the one small-caps style |
| Data | `.t-data` | mono + `tabular-nums` for any number that changes |

### Spacing & layout
4 / 8px rhythm. One container max (`max-w-6xl`) for marketing; section spacing `py-12`.
HUD clusters live in fixed corners with consistent inset (`12px`).

### Color doctrine (assign meaning; stop mixing)
| Token | Meaning |
| --- | --- |
| `hud-cyan` | system / UI chrome / **you** / interactive + focus |
| `hud-amber` | neutral body + info (the default) |
| `temu-orange` | **brand / the one primary CTA** (and the warm hero accent) |
| `hud-red` `hud-blue` | **teams** (red / blue) — always the tokens, never raw hex |
| `hud-green` | friendly / positive / health |
| `temu-gold` | reward / medals / streaks |
| `temu-red` | danger / death / destructive only |

### Surfaces & elevation
One `.panel` (lg, blur, soft border) and `.panel2` (tighter). HUD clusters add `.hud-cluster`
(a soft dark scrim behind content for legibility) and may use `.clip-notch` for the angular
visor corner. One reward/CTA shadow (`shadow-glow`).

### Motion tokens
`--ease-out` (UI), `--ease-spring` (pops), durations `--dur-1/2/3` (120/220/400ms). Reserve
motion for *events* (hits, medals, low-shield, score). Everything decorative is disabled under
`prefers-reduced-motion`.

### Accessibility
Global cyan `:focus-visible` ring; ≥44px touch targets; the colorblind radar (shapes) and
reduced-motion options already exist and are honored.

## Application order
tokens/globals → HUD (priority) → marketing/flow pages → in-world markers (`renderer.ts`),
each pass building + `npm test` green. Parody copy is preserved throughout.
