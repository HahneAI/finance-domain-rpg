# UI Design System — Authority Finance

Design token source of truth. All values confirmed against `src/index.css` `@theme` block.
**Never use raw hex for accent, green, or red. Always reference tokens.**

---

## Color Tokens (live in `src/index.css`)

| Token | Value | Role |
|-------|-------|------|
| `--color-bg-base` | `#05100c` | App shell / page background |
| `--color-bg-surface` | `#112c1f` | Card background |
| `--color-bg-raised` | `#163828` | Elevated surfaces, button hover |
| `--color-bg-gradient` | `linear-gradient(180deg, #091a11, #05100c)` | Header / container gradient |
| `--color-gold` | `#00c896` | Legacy alias → maps to `--color-accent-primary` |
| `--color-accent-primary` | `#00c896` | Flow identity: active tabs, CTAs, section bars |
| `--color-green` | `#22c55e` | Semantic positive: income values, healthy status |
| `--color-red` | `#ef4444` | Negative / spend / risk |
| `--color-warning` | `#f59e0b` | Warning / attention |
| `--color-text-primary` | `#e6f4ef` | Body text |
| `--color-text-secondary` | `#7fa39a` | Labels, sublabels |
| `--color-text-disabled` | `#4a645c` | Inactive / disabled |
| `--color-border-subtle` | `#1f3b31` | Card borders |
| `--color-border-accent` | `rgba(0,200,150,0.28)` | Accent-highlighted borders |
| `--font-display` | `'Inter'` | Metric values, headings |
| `--font-sans` | `'Inter'` | All UI body text |
| `--font-mono` | `'JetBrains Mono'` | Inputs + data table cells only |

**Note:** `index.html` still loads DM Serif Display + DM Sans via Google Fonts — dead weight, tracked for cleanup.

---

## Status Color Semantics (Global)

Applied via `status` prop on `MetricCard` and inline throughout panels:

- **green** = positive / healthy / ahead
- **gold** = neutral attention / mixed / watchlist
- **red** = negative / risk / behind

---

## Pulse Signal Tokens (Phase 2 — not yet in `index.css`)

Reserved for the intelligence overlay layer. Do not use on Flow UI elements.

| Token | Value | Role |
|-------|-------|------|
| `--color-signal-blue` | `#5B8CFF` | Trend indicators, insight labels |
| `--color-signal-purple` | `#7C5CFF` | AI-generated insight moments |
| `--color-signal-glow` | `rgba(124,92,255,0.25)` | Subtle glow on AI insight surfaces |
