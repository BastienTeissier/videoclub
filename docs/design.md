# Design System — Videoclub

## Philosophy

**Cinema lobby after hours.** Dark, quiet, focused on the content. The UI stays out of the way — movie posters are the color. Restraint everywhere else.

---

## Color Palette

| Token | Value | Usage |
|---|---|---|
| `background` | `#09090b` (zinc-950) | App background |
| `card` | `#18181b` (zinc-900) | Cards, panels, input bar |
| `card-hover` | `#27272a` (zinc-800) | Hover states |
| `border` | `#27272a` (zinc-800) | Subtle borders |
| `muted` | `#a1a1aa` (zinc-400) | Secondary text, metadata |
| `foreground` | `#fafafa` (zinc-50) | Primary text |
| `accent` | `#e4e4e7` (zinc-200) | Buttons, active states |
| `destructive` | `#ef4444` (red-500) | Remove, expire, errors |
| `commitment` | `#f59e0b` (amber-500) | Super watchlist countdown/badges |
| `success` | `#22c55e` (green-500) | Watched confirmations |

No brand color competing with movie posters. The posters **are** the color.

---

## Typography

- **Font**: `Inter` or system sans-serif
- **Sizes**: Tight scale — body `14px`, headings max `20-24px`
- **Weight**: Regular for body, Medium for labels, Semibold only for page titles
- **Monospace accent**: System mono or `JetBrains Mono` for countdown timers and metadata badges

---

## Layout

```
┌─────────────────────────────────────────────┐
│  [ what do you want to watch? ]         🔍  │
├─────────────────────────────────────────────┤
│  videoclub              [watchlist] [super] [history] │
├─────────────────────────────────────────────┤
│                                             │
│           [ conversation area ]             │
│           assistant messages +              │
│           rendered UI blocks                │
│                                             │
│                                             │
└─────────────────────────────────────────────┘
```

- **Input bar top-pinned** — always visible, search-style. The entry point to everything.
- **Thin nav strip** below the input — app name left, navigation shortcuts right (watchlist, super watchlist, history). No fat nav.
- **Content area** scrolls down. Movie cards, panels, and assistant messages render inline.
- Single column layout. No sidebar.

---

## Movie Poster Display Rules

### Single movie (detail view, search with one strong match)

Prominent display. Full-width card with backdrop as a faded header image, poster overlaid at generous size. Dark gradient fade into the card body. The poster is the hero.

### Multiple movies (search results, watchlist, history)

Letterboxd-style poster grid. Posters are the primary element — title and metadata appear on hover or below the poster at small size. Tight grid spacing, let the posters breathe.

```
┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐
│     │ │     │ │     │ │     │
│ 🖼  │ │ 🖼  │ │ 🖼  │ │ 🖼  │
│     │ │     │ │     │ │     │
└─────┘ └─────┘ └─────┘ └─────┘
Arrival  Dune    Heat    Gladiator
2016     2021    1995    2000
```

Actions (add to watchlist, mark watched, etc.) appear on poster hover as an overlay with semi-transparent dark background.

---

## Key UI Blocks

### Movie detail card (single movie — prominent)

```
┌─────────────────────────────────────────────┐
│  ░░░░░░░░ backdrop image, faded ░░░░░░░░░  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│ ┌──────┐                                    │
│ │      │  Arrival                           │
│ │poster│  2016 · Denis Villeneuve · 116min  │
│ │      │  Drama, Sci-Fi                     │
│ └──────┘                                    │
│  A linguist recruited by the military to    │
│  communicate with alien lifeforms...        │
│                                             │
│  Amy Adams · Jeremy Renner · Forest Whitaker│
│                                             │
│  [+ Watchlist]  [⚡ Super]  [✓ Watched]     │
└─────────────────────────────────────────────┘
```

### Movie search results (multiple — poster grid)

Poster grid as described above. Responsive columns: 4-5 on desktop, 3 on tablet, 2 on mobile.

Below each poster: title and year only. On hover: action overlay.

### Watchlist panel

Poster grid, same as search results. Each poster shows a remove icon on hover. Optional sort by date added.

### Super watchlist panel

**3 cards in a row**, always visible. Fixed 3-slot layout.

```
┌────────────┐  ┌────────────┐  ┌────────────┐
│            │  │            │  │  - - - - -  │
│   poster   │  │   poster   │  │             │
│            │  │            │  │  slot open  │
│────────────│  │────────────│  │             │
│ Arrival    │  │ Dune       │  │  - - - - -  │
│ ⏱ 4d 12h  │  │ ⏱ 1d 3h   │  │             │
│ [watched]  │  │ [watched]  │  │             │
└────────────┘  └────────────┘  └────────────┘
```

- Empty slots: dashed border, muted "slot open" text
- Countdown badge below poster: amber when >2 days, red when <24h
- Pulsing dot when <6h remaining
- Countdown in monospace font

### Watched history

Poster grid with a small note indicator badge. Clicking opens the note. Optional timeline view later.

### Review prefill form

Modal (dialog). Movie context at top (small poster + title), large textarea with prefilled text, confirm/cancel buttons at bottom.

```
┌─────────────────────────────────┐
│  📝 Save note for Gladiator    │
│                                 │
│  ┌──────┐  Gladiator (2000)    │
│  │poster│  Ridley Scott        │
│  └──────┘                      │
│                                 │
│  ┌─────────────────────────┐   │
│  │ An incredible epic with │   │
│  │ a powerful ending...    │   │
│  │                         │   │
│  └─────────────────────────┘   │
│                                 │
│  ☐ Mark as watched             │
│                                 │
│       [Cancel]  [Save note]    │
└─────────────────────────────────┘
```

### Clarification picker

Compact poster row (3-5 candidates) with click-to-select. Simpler than full search results — just enough to disambiguate.

---

## Interaction Patterns

- **Hover on cards/posters**: Slight lift (`translate-y-[-2px]`), border brightens zinc-800 → zinc-700
- **Hover on poster grid**: Semi-transparent dark overlay with action buttons
- **Active/selected**: Thin left accent border or ring
- **Loading**: Skeleton shimmer on dark backgrounds (zinc-800 shimmer over zinc-900)
- **Transitions**: `150ms ease`. Nothing slower. Snappy.
- **Toast/confirmation**: Slide in from top, auto-dismiss. Green for success, amber for warnings, red for errors.

---

## Constraints

- No gradients on UI chrome (only on movie backdrop fades)
- `rounded-lg` consistently — no rounded-full cards
- No colored section backgrounds — zinc-950/900/800 layering only
- No sidebar — single column, content-first
- No emoji in UI (input bar placeholder is the only exception)
- Posters are always the visual anchor

---

## shadcn/ui Component Mapping

Use shadcn dark theme as base, override CSS variables to match the palette.

| shadcn component | Usage |
|---|---|
| `Button` | All actions — ghost for inline, default for primary |
| `Input` | Main top-pinned input bar |
| `Card` | Movie detail, super watchlist slots |
| `Badge` | Countdown timers, genres, status tags |
| `Dialog` | Review prefill form, confirmations |
| `ScrollArea` | Conversation area, long lists |
| `Separator` | Section dividers |
| `Textarea` | Note/review editing |
| `Skeleton` | Loading states |
| `Tooltip` | Action button hints |
| `Avatar` | Poster thumbnails in compact views |
