# UI Launch Decisions (Locked 2026-03-28)

## Final Color Palette

Final token palette is locked for first external-user launch and lives in `src/index.css` under the `@theme` block.

- Backgrounds: `--color-bg-base`, `--color-bg-surface`, `--color-bg-raised`
- Primary accent: `--color-gold`
- Positive status: `--color-green`
- Negative status: `--color-red`
- Text hierarchy: `--color-text-primary`, `--color-text-secondary`, `--color-text-disabled`
- Borders: `--color-border-subtle`, `--color-border-accent`

No token hue changes were required in this polish pass.

## Status Color Semantics (Global)

Status colors are standardized across dashboard metric cards:

- **green** = positive / healthy / ahead
- **gold** = neutral attention / mixed / watchlist
- **red** = negative / risk / behind

This mapping is the launch baseline and should be preserved unless a future design system migration explicitly changes semantics app-wide.
