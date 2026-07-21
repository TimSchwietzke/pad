---
target: to-dos view (TodoDashboard)
total_score: 28
p0_count: 0
p1_count: 2
timestamp: 2026-07-21T18-01-08Z
slug: frontend-src-features-todo-tododashboard-tsx
---
# Critique — to-dos view (TodoDashboard)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | failed mutations roll back silently; no skeletons |
| 2 | Match System / Real World | 3 | "custom" is mild tool-jargon; otherwise natural lowercase voice |
| 3 | User Control and Freedom | 3 | no way to delete a task; no undo after the done-grace window |
| 4 | Consistency and Standards | 3 | three segmented-control dialects (seg / opt-group / pill trigger) |
| 5 | Error Prevention | 3 | Enter on empty create title is a silent no-op |
| 6 | Recognition Rather Than Recall | 3 | unset param chips reveal only on hover — invisible on touch |
| 7 | Flexibility and Efficiency | 3 | no bulk actions; drag has no keyboard alternative |
| 8 | Aesthetic and Minimalist Design | 4 | genuinely calm; accent only where it means something |
| 9 | Error Recovery | 2 | ":8080" leaks into user-facing copy; failed saves show nothing |
| 10 | Help and Documentation | 1 | inline kbd hints only |
| **Total** | | **28/40** | **Good — solid foundation, address weak areas** |

## Anti-Patterns Verdict
LLM assessment: does not read as AI-generated. Committed teal identity, lowercase voice,
triage-first composition; no gradient text, hero metrics, eyebrows, side-stripes, or card grids.

Deterministic scan (CLI): 0 findings over frontend/src/features/todo, components/ui, App.scss.

Browser overlay (injection succeeded, [Human] tab): 2 findings —
`clipped-overflow-container` (div.app clips a positioned child; the app shell intentionally
clips at the viewport — verify the sidebar card and sticky create row are unaffected, likely
benign) and `single-font`/`overused-font` (Inter 100% — a false positive for the product
register, one family is right here).

Measured contrast (canvas, both modes): secondary text 6.5–7.6:1 ✓, tags ≥6.1:1 ✓, titles
≥14.9:1 ✓. **Search placeholder FAILS AA: 3.5:1 dark / 4.18:1 light** (needs ≥4.5).

## Overall Impression
A calm, trustworthy triage tool. The control row (filter menu + tokens + combined sort)
reads like a mature product. The biggest opportunity: close the trust gaps — dead controls
(share/bell/search) and silent failure states — before adding new surface.

## What's Working
- Triage-first composition: focus band indicators are action-relevant, not vanity; accent
  carries meaning (overdue, selection) and nothing else.
- The create loop (c → type → Enter → flash at sorted position; grace-undo on done) is the
  emotional peak — fast, forgiving, satisfying.
- Token discipline: preset × mode theming holds everywhere measured; both modes pass AA on
  body text comfortably.

## Priority Issues
1. **[P1] Silent mutation failures** — a failed save/toggle optimistically applies, then
   silently reverts. User believes the task is done; it isn't. Fix: minimal toast/inline
   error on mutation onError ("couldn't save — try again"). Command: /impeccable harden.
2. **[P1] Dead controls in the shell** — share, bell, and search look functional but do
   nothing. Three broken promises on every screen. Fix: ship share (planned next), and
   visibly mark/disable or remove bell + search until real. Command: /impeccable harden.
3. **[P2] Placeholder contrast AA fail** (3.5 dark / 4.18 light) — bump
   --color-text-placeholder toward the ink end in both modes. Command: /impeccable polish.
4. **[P2] Hover-only param-chip affordance** — unset chips are invisible until hover:
   undiscoverable for first-timers, unreachable on touch. Fix: focus-within already helps;
   add a visible "+"-style affordance on the row or reveal on row tap. Command: /impeccable
   adapt (touch) or polish.
5. **[P2] No task delete + dev jargon in error copy** — deletion exists in the API but not
   the UI; ":8080" leaks to users. Command: /impeccable harden + clarify.

## Persona Red Flags
**Alex (power user):** no bulk complete/delete; filter/sort have no shortcuts; drag is the
only reorder path. The fast create/complete loop keeps them anyway.
**Sam (a11y):** drag-to-reorder has no keyboard equivalent — the custom order is unreachable
without a mouse; placeholder contrast fail; otherwise strong (global focus ring, real roles,
arrow-key menus, Escape everywhere).
**Riley (stress):** the three dead controls; silent failed PUTs; filter menu grows unbounded
with many projects (no scroll cap or search inside the menu).

## Minor Observations
- Week-ahead rail shows seven empty bars when nothing is due — could collapse to one quiet
  line ("nothing due this week").
- Empty-state copy is good; loading is text-only ("loading…") where a skeleton row would
  keep the layout stable.
- Settings OptionGroup vs density seg vs pill triggers: three dialects of the same control
  family — unify eventually.

## Questions to Consider
- When search ships, should ⌘K become a command palette (create, jump, filter) instead of
  a text search?
- Should "custom" be named "my order" to match the product voice?
- What does the to-dos view look like with 200 tasks — does the bucket spine still carry it?
