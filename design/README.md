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
| `index.html` | 0. Landing Page | Photo + the CMU/TLIC/Zoom logos (no chip behind the TLIC logo) above a frosted-glass login card. "Login with CMU Account" goes straight to the profile page |
| `profile.html` | 1. User Profile | Cards centred vertically below the navbar (`page-centered`). Navbar (Zoom Pro terms modal, Booking Center link, user guide link, account menu), license card, meeting buttons |
| `manage-users.html` | 2. Manage Users | Quota bars, Pro expiration interval, org name/selector, search, sortable user table (Name / Last Hosted / License), license dropdown + Large Meeting toggle |
| `manage-admins.html` | — (new) | Global Admin only: organization selector, the organization's admins (name, email + Revoke), Add admin modal |
| `booking.html` | — (new) | Book Temp. Pro / Large Meeting for one day (of six months ahead) in one or more time slots; "My bookings" list with Cancel |

## Behaviour

- **Login state:** the landing page's "Login with CMU Account" button signs the mock user in and
  redirects to the profile page (`data-login`, `href="profile.html"`). Logout (in the account menu,
  `data-logout`) signs out and returns to the landing page. Persists in `localStorage` (`cmuzoom.auth`).
- **Navbar links:** Booking Center, Manage Users (admins only), Admin Console (Global Admin only, opens
  `manage-admins.html`), Terms of Use (opens the Zoom Pro Terms of Use modal), User Guide; the current page's link is highlighted. At 1080px and below they collapse into
  the top of the account menu.
- **Account button:** the navbar shows the user's name next to the avatar (hidden at 420px and below).
- **Account menu:** user name + Edit Profile, language (EN/TH), theme (light/dark), Logout.
- **Profile license card:** Pro / Temp. Pro users see **Return license** (confirm modal). Basic users see
  **Request Pro**:
  - Organization Pro quota available → opens a confirm modal (with a link to the Zoom Pro Terms of Use);
    confirming assigns Pro immediately, no admin approval.
  - Quota full → the button is disabled with the note "No Pro licenses left in your organization's quota."
  - The demo user starts as Pro, so return the license first. The profile page adds an
    **Org Pro quota (Available / Full)** pill next to the Demo view switcher to preview both states.
- **Demo view switcher** (bottom-left, profile + manage pages): User / Admin / Global Admin.
  - User: no Manage Users / Admin Console links; both manage pages show a no-access notice.
  - Admin: fixed to the signed-in user's organization (Anong Srisuk, Faculty of Engineering).
  - Global Admin: organization dropdown to switch between organizations.
- **Admin Console** (`manage-admins.html`, Global Admin only — Admin and User get the no-access notice):
  two tabs split the page (arrow keys, Home and End move between them): **Stats** (Usage summary + Pro
  License Quotas, the default; always university-wide) and **Admin Management** (Organization Admin, with
  an **Organization** filter with one organization at a time, CMU first, no "All organizations"). The
  selected tab is kept in memory only.
  - **Usage summary:** one tile per license, each with its coloured badge, how many are left, the scope
    it counts (all organizations for Pro, "Shared Pool" for Temp. Pro, Large Meeting and
    Reserved Pro for Large Meeting,
    which stay university-wide because the pool is lent across organizations), used/quota with the
    percentage used on the same row at the right, and a bar in the license colour that turns red at 100%.
  - **Pro License Quotas:** the card header shows the total Pro quota of all organizations on the right
    ("56 licenses", updated after an edit); one row per organization, with used/quota, a progress bar and
    **Edit** — a modal with a number input. A quota below the licenses already in use is rejected with an
    error toast, as is anything that is not a whole number up to 999. Edits are in memory and page-local,
    so the Manage Users page keeps the original mock numbers.
  - **Organization Admin:** the selected organization's admins (name, email) with a **Revoke** button
    (confirm modal). **Add admin** opens a modal listing that organization's non-admin users with
    search and an **Assign** button per user. An organization may be left with no admins (empty state).
    Mock admins: CMU 1, Office of the University 2, Medicine 1, Engineering 2 (incl. Anong Srisuk),
    Humanities 1.
- **License ownership:**
  - **Organizations:** CMU, Office of the University, Medicine, Engineering, Humanities. CMU is an
    organization like the others (own staff), but also holds licenses for everyone.
  - **Note:** every license held by CMU is a **Shared Pool** license, **except Pro**. CMU's Pro quota
    is its own, like any other organization's.
  - **Pro** — quota per organization (CMU 12, Office of the University 10, Medicine 20, Engineering 8,
    Humanities 6). Managed by the organization's Admin and by Global Admin; Global Admin can change the
    quota itself in the Admin Console.
  - **Shared Pool (Temp. Pro / Large Meeting)** — quotas held by CMU (Temp. Pro 3, Large Meeting 2) and
    lent to users in any organization. Only Global Admin can assign or revoke them. Mock loans: Temp. Pro
    to one Office of the University user and one Engineering user (2/3); Large Meeting to Anong Srisuk (1/2).
  - **Reserved Pro for Large Meeting** — a quota of its own (2, `reservedPro` in `mock-data.js`), also held
    by CMU. Only a Large Meeting user with no Pro / Temp. Pro of their own uses one (so it can go to a Basic
    user); a user who already has Pro or Temp. Pro does not. Revoking that Pro / Temp. Pro from a Large Meeting
    user needs a free one too. It is never assigned directly: it is shown as a bar in the Manage Users quota
    panel and as a tile in the Admin Console. When it is used up, Large Meeting cannot be assigned to a Basic user.
- **Quota panel:** Admin sees only the organization's Pro quota. Global Admin sees the selected
  organization's Pro quota plus "Shared Pool" (Temp. Pro, Large Meeting and Reserved Pro for Large
  Meeting, usage across all organizations).
- **Pro Expiration Interval panel** (under the quota card): how many days a Pro license may go unused
  before it is returned to the organization's Pro quota. Set per organization — Admin edits their own
  organization, Global Admin edits the selected one. **Edit** opens a modal with presets 30 / 60 / 90 /
  180 days or Never. Mock defaults: 60 days (Medicine 90, Humanities 30).
- **Sorting (Manage Users):** click a column header to sort ascending, click again for descending; the
  header shows an arrow icon and sets `aria-sort`. Name sorts alphabetically in the current language, Last
  Hosted by date (users who never hosted count as the oldest), License as Pro, Temp. Pro, Basic (Large
  Meeting holders first within each). Ties fall back to the name. The order is kept while searching or
  switching organization; the headers are hidden on phones (stacked rows), so sorting is not available there.
- **License bubble → modal:** each row shows the license as a clickable bubble (Large Meeting as a
  second-line bubble). Clicking opens a modal with the user's meeting log for the last 30 days
  (date & time, duration, participants) and one row per license type with an Assign/Revoke button.
  A row's note is just the quota, e.g. "1 of 3 left", shown only for licenses the user does not hold;
  the current license's row is highlighted. A held license shows "Expires in N days" (no date) beside
  its name instead. **Pro:** last use (or, if the user never used it, the license's creation date, mock `USER_LICENSE.created_at`
  = `licenseCreatedAt`) + the organization's Pro expiration interval ("Never expires" for
  0 days, orange within 7 days, red once expired), counted from the mock "today" (`MockData.TODAY`,
  14 Sep 2026) so the demo stays stable. **Temp. Pro / Large Meeting:** they last until the next
  Booking Center time slot boundary (5:30 AM, 11:00 AM, 4:30 PM, 10:00 PM) after Global Admin assigned
  them, shown as "Expires in 2 h 15 min" (orange within an hour). The slots live in `MockData.TIME_SLOTS`,
  shared with `booking.js`; the countdown uses the mock date with the real time of day. Seeded loans
  count from the start of the current slot.
  Assign and Revoke each open a confirmation modal on top of it (Revoke is red; assigning Temp. Pro / Large Meeting also states, on a new line, the time slot and
  the time it expires); the change is applied only after confirming.
  - Admin: the Temp. Pro and Large Meeting rows appear only when the user holds them, and are read-only
    ("Managed by Global Admin"); Global Admin always sees all three rows. Admin can Assign Pro to a
    Temp. Pro user: the Temp. Pro is released automatically (the confirmation says so) and goes back to the pool.
- **License rules (mock):** Basic / Pro / Temp. Pro are exclusive (assigning one replaces the other);
  Large Meeting is independent of them (it uses a Reserved Pro, see above), so any user can hold it and
  revoking Pro or Temp. Pro leaves it alone. Assign buttons are disabled when the quota is used up.
- **ZOOM Booking Center** (`booking.html`): book Temp. Pro or Large Meeting for one day, in one or
  more time slots. A booking is always a single day; only one day can be picked at a time, but
  multiple time slots on it can be. Anyone can book either license; saving assigns it right away
  (no admin approval).
  - Step 1 picks a license; step 2 picks **one** day on a calendar covering tomorrow through the end
    of the 6th month from today (past/today and out-of-window days are disabled); step 3 picks one or
    more of three fixed 5.5-hour time slots (5:30 AM, 11:00 AM, 4:30 PM); step 4 adds details: **Book for**
    Myself or Someone else (options are full width; choosing it shows an email box beside it, CMU accounts only, typed before the fixed `@cmu.ac.th` suffix; letters, numbers,
    `. _ -`, not your own address), a required **Title** (100 chars) and an optional **Note** (200 chars).
    Save is enabled once license, day, time slot(s), title and (if needed) a valid email are set. My
    bookings shows each booking's title and, when booked for someone else, their email. **Save booking** opens a confirm modal summarizing license, day, time slots and note;
    the booking is saved only after **Confirm booking** (Cancel keeps the selection). Picking a
    different day, or switching license, clears the current pick (time slots are per-day and
    availability differs per license).
  - Daily capacity mirrors the Shared Pool quotas CMU holds for everyone (Temp. Pro 3/day, Large
    Meeting 2/day, see `mock-data.js`) — one booking uses one day of that quota no matter how many
    time slots it covers. No counts are shown; a full day is simply disabled, and once a day is picked,
    any of its three time slots that are full (mocked independently per slot) are disabled the same
    way. A day the user already booked for the selected license is highlighted (not just dimmed like
    a disabled day), so it stands out on the calendar; the picked day itself is highlighted solid.
  - "My bookings" lists upcoming bookings (day + time slots) with a Cancel button (confirm modal)
    that frees the day.
- Theme, language and demo role persist in `localStorage` (`cmuzoom.*`). User/license data is in-memory and resets on reload.

- **Modals:** every modal has an "x" in the header. Information-only modals (license, Add admin) close with
  it alone, without a footer Close button. Confirm and form modals keep **Cancel** next to their main action.

## Background

Pages (and the landing page's right panel) use a soft gradient: a CMU-purple glow at the top-left, a
Zoom-blue glow at the bottom-right and faint TLIC pink/teal accents. It is one token, `--bg-gradient`
in `styles.css`, with separate light and dark values.

Panels (cards, account menu, modals, demo switcher) are frosted glass: translucent fill + `backdrop-filter`
blur, a light edge and a top highlight. Tune via the `--glass-*` tokens; browsers without
`backdrop-filter` fall back to solid panels. The navbar's blur sits on `.navbar::before`, not on `.navbar`
itself, so the account menu inside it can blur the page behind (nested backdrop filters don't).

## Typography

[Kanit](https://fonts.google.com/specimen/Kanit) (Thai + Latin) from Google Fonts, linked in each page
`<head>` with weights 400/500/600/700 and italic 400; set via `--font-sans` in `styles.css`.
Fallback: Segoe UI / Leelawadee UI / Tahoma. Requires internet access to load.

Sizes, weights, line heights and spacing are tokens in `:root`:

- **Size** (14px base, desktop and phone): `--fs-2xs` 12 · `--fs-xs` 12 · `--fs-sm` 13 ·
  `--fs-base` 14 · `--fs-md` 15 · `--fs-lg` 16 · `--fs-xl` 18 · `--fs-2xl` 20 · `--fs-3xl` 26 ·
  `--fs-display` 34–46. Nothing goes below 12px except the phone calendar "Booked" label (11px).
  Avatar initials scale with the avatar and don't use the tokens.
- **Weight** (Kanit runs heavy, so the hierarchy is kept light): `--fw-semibold` 600 for the landing title only,
  `--fw-medium` 500 for page, card and modal titles and key values, `--fw-regular` 400 for buttons,
  labels, badges, table headers and body text. `--fw-bold` 700 is defined but unused.
- **Line height:** `--lh-tight` 1.2 (buttons, calendar days), `--lh-heading` 1.35, `--lh-body` 1.55.
- Uppercase labels drop their letter-spacing when the page language is Thai (`:lang(th)`), so tone
  marks stay attached to their consonants.
- **Spacing:** `--space-2xs` 4 · `--space-xs` 8 · `--space-sm` 12 · `--space-md` 16 · `--space-lg` 20 ·
  `--space-xl` 24 · `--space-2xl` 32 · `--space-3xl` 48, used for page padding, section gaps and card padding.

## Structure

```
assets/css/styles.css      design tokens (light/dark), components, page layouts, responsive rules
assets/js/i18n.js          EN/TH dictionary; markup uses data-i18n*, attributes
assets/js/app.js           theme, language, role, dropdown, dialogs, toasts, icon sprite
assets/js/profile.js       profile license card, return license, OneDrive toggle
assets/js/mock-data.js     mock orgs, users and admins shared by both manage pages
assets/js/manage-users.js  quotas, search, license editing
assets/js/manage-admins.js Admin Console: org filter, usage summary, Pro quotas, admins
assets/js/booking.js       booking calendar, Shared Pool daily capacity, my bookings, cancel
```

## Content sources

- **Zoom Pro Terms of Use** modal: from `เงื่อนไขการใช้ ZOOM Pro.txt` (kept locally) — Thai as written (typos
  "เชียง" → "เชียงใหม่", "สิทธ์" → "สิทธิ์" fixed) plus an English translation, in the `terms.*` keys of
  `i18n.js`. "-" lines are the numbered conditions; "*" lines are the Notes box. `@tliccmu` links to LINE.
- **User Guide** (navbar + mobile menu): opens https://docs.tlic.cmu.ac.th/cmu-zoom in a new tab.

## Placeholders to replace

- Primary colour `--primary` in `styles.css` is an approximate CMU purple.
- Names, emails, organizations and quotas are fictional.
