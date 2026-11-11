# Branding and layout

TradeTech is the product. Each client (EcoTech first) supplies its own identity. Screens never hard-code a client: they read names and logos from `apps/web/src/brand/index.ts` and colours from the brand's CSS file.

## Adding a client

1. **Assets:** put the client's files in `apps/web/public/brand/<client>/`:
   - a square **symbol**, as SVG where possible
   - a stacked **lockup** (symbol + wordmark)
   - the **wordmark** alone
   - all with transparent backgrounds
2. **Colours:** copy `apps/web/src/brand/ecotech.css` to `<client>.css` and change the primitives. Keep the variable names. Check contrast before choosing roles:
   - text needs **4.5:1** against its background
   - icons, focus rings and thin indicators need **3:1**
   - EcoTech's red is only 2.98:1 on charcoal, which is why it fills buttons but never colours text there. Text uses `--brand-red-lifted`.
3. **Names and paths:** update the `brand` object in `src/brand/index.ts` (product name, client name, asset paths, tagline).
4. **Wiring:** in `src/index.css`, import the new brand file instead of `ecotech.css`. Update `<title>`, `theme-color` and `public/favicon.svg` in `index.html`.

## Token layers

| Layer | Where | Examples |
|---|---|---|
| Brand primitives | `src/brand/<client>.css` | `--brand-red`, `--neutral-850` |
| Semantic tokens (per theme) | `src/index.css` (`:root` light, `.dark` dark) | `--background`, `--primary`, `--gain`, `--loss`, `--brand-text` |
| Component tokens and variants | `src/index.css`, `components/ui/*` | Button `buy` / `sell`, Badge `live` / `positive` / `warning`, price flashes |

Components use semantic tokens and variants only, never raw colours. Gains and losses always carry ▲/▼ and a sign, so meaning never depends on colour alone.

## Layout by device

| Width | Team screen | Host console |
|---|---|---|
| < 1024 px (phones, tablets) | Single column, bottom tabs, order ticket slides up from the bottom | Tabs across the top, stacked panels |
| ≥ 1024 px (laptops) | Trading desk: market table, docked order ticket and news column | Sidebar navigation, two-column panels from 1280 px |
| ≥ 1536 px (1080p and up) | Adds a left column with score, cash and standing | Same, wider |

Layout switches use `useMediaQuery` (`DESKTOP_QUERY`, `WIDE_DESK_QUERY`), so each element renders exactly once, not once per breakpoint behind CSS. The browser tests run every flow at both phone (Pixel 7) and 1920×1080 sizes, and include an axe accessibility audit (WCAG 2.2 AA).

Fonts: **Jost** for headings (echoing the geometric wordmark) and **IBM Plex Sans** for text and tabular figures. Dark theme is the default; the light theme is one click away in the header.

## News for participants

- **Breaking strip:** a strip in the sticky header carries each new headline, with chips for the stocks it names and Read/Dismiss. Only stories that arrive while you're signed in trigger it.
- **News tab:** on every device, a large reader with **New** markers, an "Earlier" divider, relative times, and a flag on stories about stocks you hold. Tapping a stock chip loads it into the order ticket.
- **Desk placement**, remembered per device: **Side panel** (under the ticket, collapsible), **Beside market** (from 1280 px; the market table adapts with container queries), or **Tab only**.
- **Read state** is stored per team on the device. Stories count as read after 1.5 s in the reader, or 4 s in a side placement, while the window is focused.
- **Stock mentions** come only from the public headline and body (`src/lib/mentions.ts`), never from the host's private impacts.
