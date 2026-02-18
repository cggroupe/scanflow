# Design System: ScanFlow
**Project ID:** 11488831176458522554
**Source:** Google Stitch — "Accueil CamScanner" (3 screens)

## 1. Visual Theme & Atmosphere

ScanFlow embodies a **clean, productivity-focused** aesthetic inspired by CamScanner. The interface feels **airy yet functional**, with generous whitespace and a clear visual hierarchy. The mood is **professional and trustworthy** — designed for users managing important documents daily. Cards float with whisper-soft shadows against a cool neutral backdrop. The mobile-first layout prioritizes thumb-reachable actions with a prominent floating action button (FAB) for the primary scan action.

**Key atmosphere adjectives:** Airy, clean, professional, organized, trustworthy, modern.

## 2. Color Palette & Roles

### Primary
| Name | Hex | Role |
|------|-----|------|
| **Vibrant Teal** | `#2db9ad` | Primary brand color. Buttons, active states, FAB, links, badges. |
| **Teal Tint** | `#2db9ad/10` | Light backgrounds for primary action cards, icon containers. |
| **Teal Glow** | `#2db9ad/40` | Shadow color for FAB (`shadow-primary/40`). |

### Backgrounds
| Name | Hex | Role |
|------|-----|------|
| **Mist Grey** | `#f6f8f8` | Page background (light mode). Cool, barely-there grey. |
| **Deep Forest** | `#131f1e` | Page background (dark mode). Rich dark teal-black. |
| **Pure White** | `#ffffff` | Cards, header, surfaces (light mode). |
| **Dark Card** | `#1a2b2a` | Card surfaces (dark mode). Slightly lighter than background. |

### Text
| Name | Hex | Role |
|------|-----|------|
| **Near Black** | `#121716` / slate-900 | Primary text. Headings, file names. |
| **Warm Grey** | slate-500 (`#64748b`) | Secondary text. Dates, sizes, metadata. |
| **Light Grey** | slate-400 (`#94a3b8`) | Tertiary text. Section labels, placeholders, inactive tabs. |

### Accent
| Name | Hex | Role |
|------|-----|------|
| **Alert Red** | red-500 (`#ef4444`) | PDF badges, destructive actions. |
| **Warm Orange** | orange-500 (`#f97316`) | PDF-to-Word tool icon background. |
| **Ocean Blue** | blue-500 (`#3b82f6`) | Import Images tool, JPG badges. |
| **Honey Amber** | amber-400 (`#fbbf24`) | Folder icons (filled). |

## 3. Typography Rules

- **Font Family:** Inter — modern, highly legible geometric sans-serif.
- **Font Weights:**
  - `700` (bold): Page titles (`text-xl`/`text-2xl`), file names (`text-sm`), section labels
  - `600` (semibold): Button text, quick action labels, card titles
  - `500` (medium): Navigation labels, filter chips, inline links
  - `400` (regular): Body text, descriptions, metadata
- **Font Sizes:**
  - Display: `text-2xl` (24px) — Page titles (Profile "Me")
  - Title: `text-xl` (20px) — Header titles ("CamScanner", "My Documents")
  - Section: `text-lg` (18px) — Section headers ("Recent Documents")
  - Body: `text-sm` (14px) — File names, card content
  - Caption: `text-xs` (12px) — Metadata, dates, sizes
  - Micro: `text-[11px]`/`text-[10px]` — Section labels (uppercase, tracking-widest), tab labels
  - Badge: `text-[8px]` — File type badges (PDF, JPG)
- **Letter Spacing:** Uppercase section labels use `tracking-widest`. Tab labels use `tracking-wide` or `tracking-tighter`.
- **Anti-aliasing:** `antialiased` on body.

## 4. Component Stylings

### Buttons
- **Primary (CTA):** Fully rounded corners (`rounded-lg`/`rounded-full`), `bg-primary text-white`, `font-bold`/`font-semibold`, `shadow-md shadow-primary/20` for premium CTAs.
- **Filter Chips:** Pill-shaped (`rounded-full`), active = `bg-primary text-white`, inactive = `bg-gray-100 text-gray-600`, `text-xs font-medium/semibold`.
- **Icon Buttons:** `size-10 rounded-full hover:bg-gray-100`, icon centered.
- **FAB (Floating Action Button):** `w-16 h-16 rounded-full bg-primary text-white shadow-lg shadow-primary/40 ring-4 ring-white`. Active press = `active:scale-90`/`active:scale-95`.
- **Outline Button:** `border border-primary text-primary rounded-full px-4 py-1.5 font-semibold`.

### Cards / Containers
- **Document Card:** `rounded-xl bg-white shadow-sm border border-slate-50`, padding `p-3`, flex row layout with thumbnail.
- **Folder Card:** `rounded-xl bg-gray-50 border border-gray-100 p-3`, grid layout (2 columns).
- **Feature Card:** `rounded-xl bg-primary/5 border border-primary/20 p-5` for premium/upgrade.
- **Storage Card:** `rounded-xl bg-white shadow-sm border border-slate-100 p-5`.

### Inputs / Forms
- **Search Bar:** `bg-slate-100 rounded-lg` or `bg-gray-100 rounded-xl h-12`, no visible border, `focus:ring-2 focus:ring-primary/50`, icon prefix.
- **Checkboxes:** Circular (`rounded-full`), `border-gray-300 text-primary focus:ring-primary`.

### Navigation
- **Bottom Tab Bar:** `bg-white/95 backdrop-blur-md border-t border-slate-100`, fixed bottom, safe-area padding (`pb-6`/`pb-4`).
- **Active Tab:** `text-primary` with filled icon (`FILL 1`), `font-bold`.
- **Inactive Tab:** `text-slate-400`, outline icon, `font-medium`.
- **Tab Labels:** `text-[10px] font-bold uppercase`.

### Thumbnails
- **Document Thumbnail:** `size-14 rounded-lg bg-gray-100 border border-gray-200 overflow-hidden`. Image `object-cover opacity-80`.
- **File Type Badge:** `absolute bottom-1 right-1`, small rounded rectangle, colored background (red for PDF, primary for JPG/scan), `text-[8px] text-white font-bold uppercase`.

### Progress Bars
- **Track:** `bg-slate-100 h-2 rounded-full`.
- **Fill:** `bg-primary h-full rounded-full`.

### Quick Action Grid
- **Layout:** `grid grid-cols-3 gap-3`.
- **Action Item:** `flex flex-col items-center gap-2`, icon container = `w-14 h-14 rounded-xl bg-primary/10`, label = `text-xs font-semibold`.

## 5. Layout Principles

- **Viewport:** Mobile-first, logical width 390px (designs at @2x = 780px).
- **Container:** `max-w-md mx-auto` for centering on larger screens.
- **Page Padding:** `px-4` (16px) horizontal, `py-5`/`py-6` vertical sections.
- **Card Spacing:** `space-y-3` for document lists, `gap-3` for grids.
- **Header:** Sticky (`sticky top-0 z-10`/`z-30`), `bg-white`, `px-4 pt-4/pt-6 pb-2`.
- **Main Content:** `flex-1 overflow-y-auto px-4 pb-24` (padding-bottom for bottom nav).
- **Bottom Nav Height:** ~64px + safe area (`pb-6`).
- **FAB Position:** `fixed bottom-20 left-1/2 -translate-x-1/2` (Accueil) or `fixed bottom-24 right-6` (Documents).
- **Section Labels:** `text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3`.
- **Touch Targets:** Minimum `size-10` (40px) for icon buttons, `py-4` for list items.
- **Dark Mode:** Full support via `dark:` classes. Background switches to `#131f1e`, cards to `#1a2b2a` or `slate-900`, text inverts.

## 6. Design System Notes for Stitch Generation

When creating new screens in Stitch for ScanFlow, use this language:

> "Design a mobile app screen with a clean, professional, productivity-focused look. Use Inter font throughout. The primary accent color is vibrant teal (#2db9ad). Backgrounds are a barely-visible cool grey (#f6f8f8) with white card surfaces. Use rounded-xl corners on cards with whisper-soft shadows. Section labels should be tiny uppercase grey text. The bottom navigation bar should be fixed with 4-5 tabs, active tab in teal with a filled icon. Include a prominent circular teal FAB (floating action button) for the primary action. Document thumbnails should be 56px rounded squares with a small colored file-type badge in the bottom-right corner."

### Material Symbols Configuration
- **Icon Set:** Material Symbols Outlined
- **Default Settings:** `FILL 0, wght 400, GRAD 0, opsz 24`
- **Active/Filled:** `FILL 1` for active navigation icons and special actions
- **Sizes:** `text-2xl` for nav icons, `text-3xl` for quick actions, `text-4xl` for FAB
