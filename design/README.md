# CMU ZOOM V4 — HTML design prototype

Clickable HTML/CSS/vanilla-JS prototype built from the sketch `CMU ZOOM V4_1817.pdf`
and a screenshot of the current site (source files kept locally, not in the repository). No build step.

## Open

Images are referenced as `../images/...`, so serve the **project root** (not `design/`):

```sh
python -m http.server 8765        # from the repository root
# then open http://127.0.0.1:8765/design/index.html
```

Opening `design/index.html` directly from disk also works.

## Pages

| File | Sketch screen | Notes |
| --- | --- | --- |
| `index.html` | 0. Landing Page | Photo + CMU/TLIC/Zoom logos, "Login with CMU Account" → profile |
| `profile.html` | 1. User Profile | Navbar (Zoom Pro terms modal, user guide link, account menu), license card, meeting buttons |
| `manage-users.html` | 2. Manage Users | Quota bars, org name/selector, search, license dropdown + Large Meeting toggle |

## Behaviour

- **Navbar links:** Manage Users (admins only, highlighted on its own page), Zoom Pro Terms of Use, User Guide.
  Below 860px they collapse into the top of the account menu.
- **Account menu:** user name + Edit Profile, language (EN/TH), theme (light/dark), Logout.
- **Profile license card:** Pro / Temp. Pro users see **Return license** (confirm modal). Basic users see
  **Request Pro**:
  - Organization Pro quota available → opens a confirm modal (with a link to the Zoom Pro Terms of Use);
    confirming assigns Pro immediately, no admin approval.
  - Quota full → the button is disabled with the note "No Pro licenses left in your organization's quota."
  - The demo user starts as Pro, so return the license first. The profile page adds an
    **Org Pro quota (Available / Full)** pill next to the Demo view switcher to preview both states.
- **Demo view switcher** (bottom-left, profile + manage pages): User / Admin / Global Admin.
  - User: no Manage Users link; manage page shows a no-access notice.
  - Admin: fixed to the signed-in user's organization (Anong Srisuk, Faculty of Engineering).
  - Global Admin: organization dropdown to switch between organizations.
- **License ownership:**
  - **Organizations:** CMU, Office of the University, Medicine, Engineering, Humanities. CMU is an
    organization like the others (own staff), but also holds licenses for everyone.
  - **Note:** every license held by CMU is a **Shared Pool** license, **except Pro**. CMU's Pro quota
    is its own, like any other organization's.
  - **Pro** — quota per organization (CMU 12, Office of the University 10, Medicine 20, Engineering 8,
    Humanities 6). Managed by the organization's Admin and by Global Admin.
  - **Shared Pool (Temp. Pro / Large Meeting)** — quotas held by CMU (Temp. Pro 3, Large Meeting 2) and
    lent to users in any organization. Only Global Admin can assign or revoke them. Mock loans: Temp. Pro
    to one Office of the University user and one Engineering user (2/3); Large Meeting to Anong Srisuk (1/2).
- **Quota panel:** Admin sees only the organization's Pro quota. Global Admin sees the selected
  organization's Pro quota plus "Shared Pool" (Temp. Pro and Large Meeting, usage across all
  organizations).
- **License bubble → modal:** each row shows the license as a clickable bubble (Large Meeting as a
  second-line bubble). Clicking opens a modal with the user's meeting log for the last 30 days
  (date & time, duration, participants) and one row per license type with an Assign/Revoke button.
  - Admin: Temp. Pro and Large Meeting rows are read-only ("Managed by Global Admin"). Admin also
    can't Assign Pro to a Temp. Pro user or Revoke Pro from a user with Large Meeting.
- **License rules (mock):** Basic / Pro / Temp. Pro are exclusive (assigning one replaces the other);
  Large Meeting requires Pro or Temp. Pro and is removed when that license is revoked. Assign buttons
  are disabled when the quota is used up.
- Theme, language and demo role persist in `localStorage` (`cmuzoom.*`). User/license data is in-memory and resets on reload.

## Background

Pages (and the landing page's right panel) use a soft gradient: a CMU-purple glow at the top-left, a
Zoom-blue glow at the bottom-right and faint TLIC pink/teal accents. It is one token, `--bg-gradient`
in `styles.css`, with separate light and dark values.

Panels (cards, account menu, modals, demo switcher) are frosted glass: translucent fill + `backdrop-filter`
blur, a light edge and a top highlight. Tune via the `--glass-*` tokens; browsers without
`backdrop-filter` fall back to solid panels.

## Typography

[Kanit](https://fonts.google.com/specimen/Kanit) (Thai + Latin) from Google Fonts, linked in each page
`<head>` with weights 400/500/600/700 and italic 400; set via `--font-sans` in `styles.css`.
Fallback: Segoe UI / Leelawadee UI / Tahoma. Requires internet access to load.

## Structure

```
assets/css/styles.css      design tokens (light/dark), components, page layouts, responsive rules
assets/js/i18n.js          EN/TH dictionary; markup uses data-i18n*, attributes
assets/js/app.js           theme, language, role, dropdown, dialogs, toasts, icon sprite
assets/js/profile.js       profile license card, return license, OneDrive toggle
assets/js/manage-users.js  mock orgs/users, quotas, search, license editing
```

## Content sources

- **Zoom Pro Terms of Use** modal: from `เงื่อนไขการใช้ ZOOM Pro.txt` (kept locally) — Thai as written (typos
  "เชียง" → "เชียงใหม่", "สิทธ์" → "สิทธิ์" fixed) plus an English translation, in the `terms.*` keys of
  `i18n.js`. "-" lines are the numbered conditions; "*" lines are the Notes box. `@tliccmu` links to LINE.
- **User Guide** (navbar + mobile menu): opens https://docs.tlic.cmu.ac.th/cmu-zoom in a new tab.

## Placeholders to replace

- Primary colour `--primary` in `styles.css` is an approximate CMU purple.
- Names, emails, organizations and quotas are fictional.
