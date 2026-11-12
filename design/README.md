# CMU ZOOM V4 — HTML design prototype

Clickable HTML/CSS/vanilla-JS prototype of the CMU ZOOM portal. It started from the sketch
`CMU ZOOM V4_1817.pdf` and a screenshot of the old site (kept locally, not in the repository) and now
mirrors the production Nuxt app (`cmu-zoom-web-v4`) screen by screen — copy, rules and states — so it can
serve as the basis for the User Guide. No build step.

## Open

Images are referenced as `../images/...`, so serve the **project root** (not `design/`):

```sh
python -m http.server 8765        # from the repository root
# then open http://127.0.0.1:8765/design/index.html
```

Opening `design/index.html` directly from disk also works.

## Pages

| File | Production page | Notes |
| --- | --- | --- |
| `index.html` | `pages/index.vue` | Photo + CMU/TLIC/Zoom logos above a frosted-glass login card. "Login with CMU Account" goes straight to the profile page. `?error=` shows the sign-in failure line (see below) |
| `profile.html` | `pages/profile.vue` | Identity + one card per held license (main license, then the Add-on), Return license / Request Pro, OneDrive (Beta) switch, meeting buttons |
| `booking.html` | `pages/booking.vue` | My bookings (In use now / Upcoming / Past) + Book a license in four steps (license, day, time slot(s), details) |
| `manage-users.html` | `pages/manage-users.vue` | Quota bars, Pro expiration interval, org selector, search, multi-sort paginated user table, license modal |
| `manage-admins.html` | `pages/manage-admins.vue` | Admin Console, Global Admin only: tabs Stats, Admin Management, Booked Licenses, Action Log |

### Landing `?error=` states

Production redirects back from the OAuth callback with `?error=<reason>`; each reason has its own line
under the login button (`landing.error*` keys), anything else falls back to the generic one:

| `?error=` | Message |
| --- | --- |
| `not-provisioned` | Your CMU account is not registered for CMU Zoom yet. Please contact TLIC. |
| `blocked-account-type` | This type of CMU account cannot use CMU Zoom. |
| `inactive` | Your CMU Zoom account is inactive. Please contact TLIC. |
| `unavailable` | We could not reach the CMU Zoom service. Please try again shortly. |
| `no-email`, `login-failed`, other | Sign-in failed. Please try again. |

## Behaviour

### Shell

- **Login state:** "Login with CMU Account" (`data-login`) signs the mock user in and opens the profile;
  Logout (account menu, `data-logout`) returns to the landing page. Persists in `localStorage` (`cmuzoom.auth`).
- **Navbar links:** Booking Center, Manage Users (admins only), Admin Console (Global Admin only), Terms of
  Use (Zoom Pro Terms of Use modal), User Guide; the current page is highlighted. At 1080px and below they
  collapse into the top of the account menu.
- **Account menu:** avatar + name + email, Edit Profile, language (EN/TH), theme (light/dark), Logout. The
  navbar shows the name next to the avatar (hidden at 420px and below).
- **Demo view switcher** (bottom-left, profile + manage pages): User / Admin / Global Admin (default Admin).
  - The **X** after the last demo pill minimizes the whole bar to a small floating gear button at the
    bottom left (handy for clean screenshots); the gear brings it back. The choice is remembered in
    localStorage `cmuzoom.demoDock` (`open` / `minimized`) across pages.
  - User: no Manage Users / Admin Console links; both manage pages show the no-permission card.
  - Admin: fixed to the signed-in user's organization (Anong Srisuk, Faculty of Engineering).
  - Global Admin: organization dropdown to switch between organizations.
- **Loading:** pages show skeletons / a dimmed state for a few hundred ms to mimic production fetches;
  saving actions run behind the loading overlay (`App.withLoading`).
- **Modals:** every modal has an "x" in the header. Information-only modals close with it alone; confirm
  and form modals keep **Cancel** next to their main action.
- Theme, language and demo role persist in `localStorage` (`cmuzoom.*`). User/license/booking data is
  in-memory and resets on reload.

### Profile (`profile.html`)

- Identity (avatar, name, email, organization pill) beside the license column.
- **License cards** (built by `profile.js` into `[data-license-list]`): the main license captioned
  "License from your organization" (Basic, Pro, Temporary Pro or Emergency Pro), then the Large Meeting
  card captioned **Add-on** when held. Each non-Basic card shows its own live expiry countdown
  (`App.formatExpiry`, re-read every minute) and its own **Return license** button; the confirm modal
  names that license and returns only it (returning the main license leaves Large Meeting in place).
  Mock expiries: Pro 45 days (last used 15 days ago in a 60-day org), Emergency Pro 3 days (warning
  tone), Temporary Pro / Large Meeting the end of the current booking slot.
- **Request Pro** (Basic users): with organization Pro quota left it opens a confirm modal (link to the
  Zoom Pro Terms of Use) whose button is **Get Pro**; confirming assigns Pro at once, no admin approval.
  With the quota full the button is disabled with "No Pro licenses left in your organization's quota."
- **Save Cloud Recording to your OneDrive** switch (with a **Beta** badge) is a full-width footer row:
  an account-wide setting, not tied to a license. Switching it on simulates the Microsoft consent popup.
- **Demo pills** (next to the Demo view switcher, profile only): **User license** (Basic / Pro /
  Temporary Pro / Emergency Pro + a Large Meeting toggle) and **Org Pro quota** (Available / Full), so
  every card state can be previewed. The demo user starts as Pro + Large Meeting (same as row `eng-0`
  in Manage Users).

### ZOOM Booking Center (`booking.html`)

Book Temporary Pro or Large Meeting for one day, in one or more time slots. Anyone can book; saving
assigns the license for those slots right away (no admin approval).

- **My bookings** is grouped into **In use now** (with **Free up now**: returns the license to the
  shared pool and cancels the rest of the booking), **Upcoming** (with **Cancel**, confirm modal) and
  **Past** (hidden behind "Show past bookings", then shown 3 at a time). Each item shows license, day,
  time slots, title, note and, when booked for someone else, their email.
- **Step 1** license; **step 2** one day on a calendar from tomorrow to the end of the 6th month ahead
  (past, out-of-window, already-booked and full days are disabled; a day the user already booked for that
  license is highlighted); **step 3** one or more of the three fixed slots — 5:30–11:00, 11:00–16:30,
  16:30–22:00 (`MockData.TIME_SLOTS`), full slots disabled; **step 4** details: **Book for** Myself or
  Someone else (CMU account typed before the fixed `@cmu.ac.th` suffix), required **Title** (100 chars),
  optional **Note** (200 chars). **Save booking** opens a confirm modal; nothing is saved until
  **Confirm booking**. Changing the license or day clears the later steps.
- **Availability** per day and slot = the Shared Pool quota (Temporary Pro 3, Large Meeting 3) minus
  other people's bookings (`createOrgBookings`) minus the user's own. A day is full when all its slots
  are. **24 Sep 2026** is fully booked for Temporary Pro on purpose (screenshot of a full day).
- **MIS check (Book for someone else):** simulates production's 404 for people not in CMU Zoom yet —
  any address starting with `x` is "not in CMU Zoom yet" and offers **Check {email} from MIS**, which
  adds the account; the lookup fails ("No CMU account exists…") only for `xnobody`.

### Manage Users (`manage-users.html`)

- **Roles:** Admin sees their own organization, the organization's Pro quota bar and the Pro expiration
  interval read-only; Global Admin picks any organization, also sees the Shared Pool bars (Temporary Pro,
  Large Meeting, Reserved Pro, Emergency Pro — each opens **Pool Holders**) and can **Edit** the interval
  (presets 30 / 60 / 90 / 180 days or Never; mock 60, Medicine 90, Humanities 30). User gets the
  no-permission card.
- **Table:** Name, **Account Type** (Teacher / Employee / Student / Org), Last Hosted, License. Search
  runs on submit; when an email search finds no one, **Check {email} from MIS** provisions the account
  (Employee). **Pagination** 20 / 50 / 100 per page (`App.renderPagination`).
- **Multi-sort** (production `toggleSort` + `server/utils/userSort.ts`): each header click steps a column
  ascending → descending → off; a newly sorted column joins as the lowest priority, up to 3. Default:
  License ascending, then Last Hosted. License order: Pro, Temporary Pro, Emergency Pro, Basic. Headers
  are hidden on phones (stacked rows).
- **License modal** (click a row's license bubble): the user's meeting log for the last 30 days and one
  row per license (Pro, Temporary Pro, Emergency Pro, Large Meeting) with Assign / Revoke behind a
  confirmation. Held rows show "Expires in …"; others show "N of M left". Admin manages Pro only — shared
  pool rows read "Managed by Global Admin". Assign is disabled when the quota is used up.
  Add `?usage=error` to the URL to show the meeting log's "could not be loaded" state.

### Pool Holders modal (`pool-holders.js`)

Who holds one license, with search, pagination and (Global Admin only) **Revoke** per holder behind a
stacked confirmation. Opened from Manage Users' Shared Pool bars and from the Admin Console's stat cards
and per-organization Pro rows ("{license} holders · {org}"). Reserved Pro is read-only with a note: it is
never held directly — revoke the holder's Large Meeting to free one.

### Admin Console (`manage-admins.html`)

Global Admin only (others get the no-permission card). Four tabs (arrow keys / Home / End move between
them; the selected tab is kept in memory):

- **Stats:** Usage summary — one card per license (Pro, Temporary Pro, Large Meeting, Reserved Pro,
  Emergency Pro) with used / quota, percentage and a bar that turns red at 100%; Pro counts all
  organizations, the rest the Shared Pool. Pro License Quotas — total in the header (129 in the mock),
  one row per organization with used / quota and **Edit** (whole number up to 999, not below what is in
  use). Edits are page-local; Manage Users keeps the original numbers.
- **Admin Management:** organization filter (one at a time, CMU first), the organization's admins with
  **Revoke** (confirm modal), **Add admin** modal listing non-admin users with search and **Assign**. An
  organization may have no admins (empty state). Mock admins: CMU 1, Office of the University 2,
  Medicine 1, Engineering 2 (incl. Anong Srisuk), Humanities 1.
- **Booked Licenses** (`admin-bookings.js`, production `AdminBookingCalendar.vue`): month calendar of all
  Temporary Pro / Large Meeting bookings (one bar per start time and license, with a count), a license
  filter, and the selected day's bookings grouped by slot; **Cancel** asks for confirmation with an
  "email the user" option (on by default).
- **Action Log** (`action-logs.js`, production `AdminActionLogs.vue`): the backend action log filtered by
  exact email (applied on Enter / search button), topic (license, booking, permission, organization,
  meeting) and an inclusive From / To date range; paginated 20 / 50 / 100.

### License rules (mock)

- **Organizations:** CMU, Office of the University, Medicine, Engineering, Humanities. CMU is an
  organization like the others and also holds the Shared Pool for everyone. Every license held by CMU is a
  Shared Pool license **except Pro**.
- **Main licenses** (exactly one): Basic, **Pro**, **Temporary Pro**, **Emergency Pro** — assigning one
  replaces the other. Emergency Pro cannot be assigned over Pro or Temporary Pro ("Remove Pro or Temporary Pro first"), but Pro
  can be assigned over it. Admin can assign Pro to a Temporary Pro user; the Temporary Pro goes back to
  the pool.
- **Pro** — per-organization quota, managed by the org's Admin and by Global Admin (Global Admin also sets
  the quota). Lapses after the organization's Pro expiration interval of non-use, counted from last use
  (or the license's creation date if never used).
- **Shared Pool** (Global Admin only): **Temporary Pro** and **Large Meeting** last until the next booking
  slot boundary after assignment; **Emergency Pro** is a main license that lasts **7 days**
  (`EMERGENCY_PRO_DURATION_DAYS`).
- **Large Meeting** is an add-on, independent of the main license. A holder with no Pro / Temporary Pro /
  Emergency Pro uses a **Reserved Pro** (own quota, never assigned directly; shown as a bar and a stat
  card). With Reserved Pro used up, Large Meeting cannot go to a Basic user.
- Naming: always **Temporary Pro** (never "Temp. Pro"). The prototype key `emergencyPro` is production's
  slug `emergPro` (`PROD_LICENSE_SLUGS`).
- **Expiry text** (`App.formatExpiry`, production `useLicenseExpiry`): `'never'` → "Never expires";
  past → "Expired" (danger, `is-overdue`); under a day → "Expires in {h} h {m} min" / "{h} h" / "{m} min"
  (warn, `is-soon`, at ≤ 60 min); otherwise "Expires in 1 day" / "Expires in N days" (warn at ≤ 7 days).
  The exact date/time is the tooltip. Times count from the demo clock (`MockData.mockNow()`: the mock
  date with the real time of day).

### Known production text quirks (kept on purpose)

- No-permission cards say "… Switch the demo view to Admin or Global Admin." / "… to Global Admin." —
  that wording is in production's locale files, so it is kept verbatim.
- The Thai label of the Booked Licenses tab is "จัดการ ZOOM Booking" (production `admins.tabBookings`).

## Mock data (`mock-data.js`)

- `REFERENCE_DATE` / `MockData.TODAY` = **14 Sep 2026**, so the demo stays stable.
- **45 users per organization** (Thai names, account types weighted to Teacher / Employee).
- **Pro quotas:** CMU 28, Office of the University 30, Medicine 40, Engineering 25, Humanities 6. Every
  2nd user gets Pro while the quota allows, so **Humanities is intentionally full** (6/6).
- **Shared Pool quotas** (`SHARED_POOL_QUOTAS`, held by CMU): Temporary Pro 3, Large Meeting 3, Reserved
  Pro 2, Emergency Pro 2. Seeded loans: Temporary Pro to `ou-1`, `eng-1`; Large Meeting to `eng-0`
  (Anong Srisuk, Pro) and `ou-7` (Basic → takes a Reserved Pro); Emergency Pro to `med-3`.
- **Bookings:** `createMyBookings()` — the signed-in user's bookings (today's current slot when inside
  booking hours, plus upcoming and past ones, some with notes, one booked for someone else);
  `createOrgBookings(month)` — everyone's bookings for a month, patterned per day/slot (weekends half),
  capped by the Shared Pool quota, every 4th made on someone else's behalf, 24 Sep 2026 full for
  Temporary Pro.
- **Action log:** `createActionLogs()` — 60 entries going back from 14 Sep 2026 09:40 across the five
  topics, with production-style messages and account ids.

## i18n (`i18n.js`)

Keys mirror production's `i18n/locales/{en,th}.json` paths, flattened to dotted form
(`booking.step.date`). `PRODUCTION` is a verbatim copy of those files (resync by pasting them in again);
`PROTOTYPE_ONLY` holds the few keys production has no equivalent for (demo controls, aliases such as
`license.emergencyPro`). Production wins when both define a key. Markup opts in with `data-i18n`,
`data-i18n-placeholder`, `data-i18n-aria-label`, `data-i18n-title`.

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
assets/css/styles.css        design tokens (light/dark), components, page layouts, responsive rules;
                             mirrors production styles.css, then a "Ported from production app.css"
                             section and page-scoped ports keyed on <body data-page="…">
assets/js/i18n.js            EN/TH dictionary: PRODUCTION (verbatim locale JSON) + PROTOTYPE_ONLY
assets/js/app.js             theme, language, role, dropdown, dialogs, toasts, icon sprite, license
                             types, formatExpiry, loading overlay, renderPagination
assets/js/mock-data.js       orgs, quotas, users (45/org, account types, Thai names), admins, pool
                             holders, my/org bookings, action log, time slots, demo clock
assets/js/profile.js         profile license cards, expiry countdowns, return / request Pro, OneDrive
                             switch, demo pills
assets/js/booking.js         My bookings groups, booking calendar, slot availability, MIS check
assets/js/manage-users.js    quotas, expiration interval, search, multi-sort, pagination, license modal
assets/js/pool-holders.js    Pool Holders modal (Manage Users + Admin Console)
assets/js/manage-admins.js   Admin Console tabs, usage summary, Pro quotas, admins
assets/js/admin-bookings.js  Admin Console "Booked Licenses" tab
assets/js/action-logs.js     Admin Console "Action Log" tab
```

## Content sources

- **Zoom Pro Terms of Use** modal: from `เงื่อนไขการใช้ ZOOM Pro.txt` (kept locally) — Thai as written (typos
  "เชียง" → "เชียงใหม่", "สิทธ์" → "สิทธิ์" fixed) plus an English translation, in the `terms.*` keys of
  `i18n.js`. "-" lines are the numbered conditions; "*" lines are the Notes box. `@tliccmu` links to LINE.
  `terms.3` and `terms.note3` (the per-organization Pro expiration interval) are **not** in that source
  file — they were added to document the rule, so the mismatch is deliberate, not a transcription gap.
- **User Guide** (navbar + mobile menu): opens https://docs.tlic.cmu.ac.th/cmu-zoom in a new tab.

## Placeholders to replace

- Primary colour `--primary` in `styles.css` is an approximate CMU purple.
- Names, emails, organizations and quotas are fictional.
