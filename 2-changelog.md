# Public content layer — fixing the Palo Alto "Insufficient-Content" flag

Adds a real, crawlable public surface to `tracker.jemsbley.dev` so the domain
has describable content for URL classifiers (and for humans who land on it
without an account). This is step 1 of the Palo Alto remediation: it does not
touch the NRD timer (which expires on its own) and it does not submit the
category change request (that comes after this ships).

Version bumped `0.1.0` → `0.2.0`.

---

## The problem, concretely

Palo Alto's `Insufficient-Content` classification was accurate. Before this
change, a crawler fetching `https://tracker.jemsbley.dev/`:

1. Received `index.html`, whose entire body was `<div id="root"></div>` plus a
   module script — **zero words of text**, because the app is client-rendered
   with no prerendering.
2. If it executed JS, it hit `AuthGuard`, which redirected every route
   including `/` straight to `/login`, yielding a logo and a Google button.
3. Found no `robots.txt`, no `sitemap.xml`, no `<meta name="description">`, no
   OpenGraph tags, and no static favicon — the `public/` directory did not
   exist at all. The favicon was injected by JavaScript at runtime, so it was
   invisible to anything that didn't run the bundle.

That is a precise match for their definition: *"require authentication without
displaying any other content suggesting a different categorization."* The
`High-Risk` rating is largely downstream of this, since sites in `Unknown` /
low-content categories are rated high-risk by default.

## Decisions taken

Four choices were confirmed before implementation:

| Decision | Choice |
|---|---|
| Landing page location | `/` serves both — landing page when unauthenticated, `StatsPage` when signed in. **No existing URL changes**, so shared links and bookmarks all still work. |
| Crawler visibility | Static HTML files in `public/` for the info pages, plus a static copy of the landing page baked into `index.html`. No new build dependencies. |
| Naming / affiliation | Brand-neutral: "Generator's University Team Tracking System" only. No Northeastern or personal naming. Riot Games disclaimer included. |
| Contact address | `contact@jemsbley.dev` (inbox setup writeup at the end of this document). |

---

## Changes by file

### New: static public pages

**`public/about.html`** — What the site is, what each feature does
(round-by-round records, map/agent analytics, player breakdowns, veto
planning, VOD review, opponent scouting), how it's built, and how to get
access. This is the single densest piece of real content on the domain and the
main answer to "insufficient content."

**`public/privacy.html`** — Privacy policy, written against what the code
actually does rather than boilerplate:

- Discloses exactly what Google Sign-In yields and what is kept: the email
  address and the token's `sub` claim. Notes that profile name and picture are
  *not* stored (verified in `server/src/routes/auth.ts`).
- Describes the sign-in token in `localStorage` under `team-tracker-token` by
  name, and clarifies it is not a cookie.
- States plainly that there is no analytics, advertising, tracking pixel,
  session recording, or fingerprinting, and nothing is sold or shared.
- Notes the tracker.gg import is a **manual paste** and that the site never
  contacts tracker.gg on the user's behalf (verified in
  `TrackerImportModal.tsx`).
- Names the actual subprocessors: Vercel, Railway, Google.
- Documents roster-membership visibility (owner/editor/viewer) and that an
  admin account can access records.
- Deletion path, including the cascade behavior — deleting an account deletes
  the rosters it created — and offers ownership transfer as the alternative.

**`public/terms.html`** — Terms of use: invite-only access, acceptable use,
user retains ownership of their match data, as-is availability with no uptime
guarantee, termination, the Riot Games IP notice, warranty disclaimer, and a
liability limit framed around the service being free.

**`public/page.css`** — One small hand-written stylesheet shared by the three
pages above. Deliberately not Tailwind: these pages must render correctly with
zero JavaScript, and the Tailwind build only arrives with the JS bundle.
Colors mirror the `valorant` palette from `tailwind.config.js`.

### New: crawler plumbing

**`public/robots.txt`** — Explicitly allows `/`, `/about`, `/privacy`,
`/terms`, `/login`, and disallows the authenticated app routes (`/maps`,
`/series`, `/scouting`, `/admin`, `/invite/`, …). This matters: those routes
can only ever serve an auth redirect, so steering crawlers away from them and
toward the pages with actual content is the point. Points at the sitemap.

**`public/sitemap.xml`** — The four public URLs with `lastmod` dates.

**`public/favicon.png`**, **`public/og-image.png`** — Copies of
`src/assets/icons/generator.png` at stable static paths, so the icon resolves
without running JS.

### `index.html`

- Real `<title>` with a descriptive suffix, plus `<meta name="description">`,
  `robots`, `theme-color`, and a `canonical` link.
- Full OpenGraph and Twitter card tags.
- Static `<link rel="icon">` and `apple-touch-icon` pointing at
  `/favicon.png`.
- **A complete static copy of the landing page inside `<div id="root">`.** This
  is the no-JavaScript view of the site: headline, positioning paragraph, an
  explicit note that accounts are invite-only and there is no public database,
  a six-item feature list, an access explanation, links to the info pages, and
  the contact plus Riot disclaimer.
- A small inline `<style>` block (classes prefixed `s-`) so that markup is
  *styled* without JS, rather than rendering as unstyled text. It also means
  the first paint before the bundle loads looks like the finished page rather
  than a flash of raw HTML.

Keep this copy in sync with `LandingPage.tsx` — there is a comment in both
files saying so.

### `src/main.tsx`

- Clears `#root` immediately before mounting, so the static shell is never
  visible alongside the React tree. React 18's `createRoot` empties the
  container anyway; doing it explicitly makes the contract obvious instead of
  load-bearing on framework behavior.
- Removed the runtime favicon injection block. The static `<link>` in
  `index.html` now handles it, which works in dev and prod and — unlike the old
  approach — without JavaScript. The `generatorLogo` import here is gone.

### `src/pages/LandingPage.tsx` (new)

The React landing page shown at `/` to unauthenticated visitors. Same copy as
the static shell, styled with the app's existing `card` / `btn-primary`
classes and `valorant` palette. Links to the info pages are plain `<a>` tags
rather than router `<Link>`s, because those pages are standalone static HTML
served outside the SPA.

### `src/components/AuthGuard.tsx`

The whole routing change is three lines:

```tsx
if (status === 'unauthenticated') {
  if (location.pathname === '/') return <LandingPage />;
  return <Navigate to="/login" replace state={{ from: location }} />;
}
```

`/` now renders the landing page for visitors with no session, while every
other protected route redirects to login exactly as before. `App.tsx` and the
route table are untouched, which is why no in-app URL changed.

### `src/pages/LoginPage.tsx`

A crawler that follows the sign-in link lands here, so it got a one-line
description of what the site is ("Match tracking and analytics for competitive
Valorant teams") ahead of the existing "sign in to continue," plus a footer row
linking About / Privacy / Terms.

### `src/components/Layout.tsx`

Added the same About / Privacy / Terms links to the in-app footer. Beyond
tidiness, a privacy policy reachable from inside the app is a Google OAuth
verification expectation.

### `vercel.json`

```json
"rewrites": [
  { "source": "/about",   "destination": "/about.html" },
  { "source": "/privacy", "destination": "/privacy.html" },
  { "source": "/terms",   "destination": "/terms.html" },
  { "source": "/(.*)",    "destination": "/index.html" }
]
```

The three explicit rules sit **ahead** of the SPA catch-all so it can't swallow
them. Written as ordered rewrites rather than relying on `cleanUrls` so the
behavior doesn't depend on Vercel's filesystem-check ordering. Static assets
(`robots.txt`, `page.css`, the images, the hashed bundles) are unaffected —
Vercel resolves real files before applying rewrites, which is why the existing
setup already worked for `/assets/*`.

### `vite.config.ts`

Added a `publicPageCleanUrls()` plugin that applies the same `/about` →
`/about.html` rewrite to the dev and preview servers. Without it, those links
404 locally while working fine in production — the dev server doesn't read
`vercel.json`, and the SPA fallback grabs the request before the static file is
found. Caught this during verification.

### `package.json`

`0.1.0` → `0.2.0`. Note: there is no `src/utils/changelog.ts` or version chip
in this branch, so there was no in-app changelog entry to extend — this file
serves that purpose for now.

---

## What a crawler sees now

| Request | Before | After |
|---|---|---|
| `GET /` (no JS) | Empty `<div id="root">` | ~350 words: headline, description, feature list, access info, contact, disclaimer — styled |
| `GET /` (with JS) | 302 → `/login` | Full landing page |
| `GET /` (signed in) | StatsPage | StatsPage — unchanged |
| `GET /about` | SPA fallback, empty | Full static page, no JS needed |
| `GET /privacy` | SPA fallback, empty | Full policy, no JS needed |
| `GET /terms` | SPA fallback, empty | Full terms, no JS needed |
| `GET /robots.txt` | 404 | Allow/disallow rules + sitemap pointer |
| `GET /sitemap.xml` | 404 | Four public URLs |
| `GET /favicon.png` | 404 (JS-injected only) | Static PNG |
| `GET /maps` etc. | SPA → login | Unchanged, now `Disallow`ed |

## Verifying

`npm run build` passes (`tsc -b` clean). Verified by serving `dist/` and
checking every public path returns 200 with the right content type, and by
stripping all tags from `/` to confirm the text a JS-less crawler reads.

To check it yourself:

```bash
npm run build && npm run preview
```

Then, **signed out** (use a private window, or clear `localStorage`):

- `/` — the landing page instead of an instant bounce to login
- `/about`, `/privacy`, `/terms` — the three static pages
- `/robots.txt`, `/sitemap.xml`
- Click **Sign in** → login screen now has the description line and the three
  footer links
- **Signed in**: `/` still loads StatsPage, and every nav link and shared
  filter URL behaves as before. New About/Privacy/Terms links in the footer.

To see what a classifier sees:

```bash
curl -s https://tracker.jemsbley.dev/ | sed -e 's/<[^>]*>//g'
```

---

## Setting up the `contact@jemsbley.dev` inbox

The address is now published in `index.html`, all three static pages, and
`LandingPage.tsx`. It needs to actually receive mail — a privacy policy with a
dead contact address is worse than no address at all, and a bouncing contact
undercuts exactly the legitimacy signal this change is trying to establish.

You need **receiving** at minimum. Sending *as* that address is optional.

### Option A — Cloudflare Email Routing (recommended if DNS is on Cloudflare)

Free, receive-only forwarding into an inbox you already read. About five
minutes.

1. Cloudflare dashboard → select `jemsbley.dev` → **Email** → **Email
   Routing** → **Get started**.
2. Add a **destination address** (your personal Gmail or school address).
   Cloudflare emails it a verification link — click it.
3. Create a custom address: `contact` → forward to that destination.
4. Cloudflare offers to add the required DNS records automatically. Accept. It
   adds three `MX` records pointing at `route1.mx.cloudflare.net`,
   `route2.…`, `route3.…`, and an `SPF` `TXT` record
   (`v=spf1 include:_spf.mx.cloudflare.net ~all`).
5. Optionally enable **catch-all** so typos and any future alias
   (`privacy@`, `abuse@`) still reach you.
6. Test from an outside address. Delivery should be near-instant.

Caveat: this is receive-only. Replies go out from your personal address unless
you also set up sending (below).

### Option B — ImprovMX (if DNS is elsewhere and you want to keep it there)

Free tier does exactly this without moving DNS hosting.

1. Sign up at improvmx.com, enter `jemsbley.dev`.
2. At your current DNS host, add the two `MX` records it shows
   (`mx1.improvmx.com` priority 10, `mx2.improvmx.com` priority 20) and its
   `SPF` `TXT` record.
3. Add the alias `contact@` → your personal inbox.

Many registrars also have built-in forwarding that works the same way —
Namecheap and Porkbun both include it free. Check your registrar's control
panel before signing up for anything.

### Option C — A real mailbox you can send from

Worth it if you'd rather correspondence not come from your school address.

- **Zoho Mail** — free tier covers one domain with webmail and mobile apps
  (no IMAP/SMTP on free). Genuine mailbox, no cost.
- **Fastmail** — ~$5/month, full IMAP/SMTP, very good custom-domain support.
- **Google Workspace** — ~$7/user/month. Only worth it if you want Gmail's
  interface specifically.
- **Migadu** — ~$19/year, unlimited aliases, good for a personal domain.

Each gives you DNS records (`MX`, `SPF`, and a `DKIM` `TXT`) to add at your DNS
host.

### Sending as `contact@jemsbley.dev` from Gmail

If you take Option A or B and want replies to come from the right address:

1. Gmail → **Settings** → **Accounts and Import** → **Send mail as** → **Add
   another email address**.
2. Enter `contact@jemsbley.dev`, uncheck "Treat as an alias" if you want it
   kept separate.
3. Gmail asks for an SMTP relay. Forwarding services don't provide one, so use
   a free transactional sender — Brevo, Mailgun, or SendGrid all have a free
   tier — and enter its SMTP host, port 587, and credentials.
4. Gmail sends a verification code to `contact@jemsbley.dev`, which arrives via
   your forwarding rule. Enter it.

### While you're in the DNS panel

Two records that cost nothing and marginally help the domain-reputation half of
the Palo Alto problem, since mail authentication feeds into domain trust
scoring at several vendors:

- **DMARC** — add a `TXT` record at `_dmarc.jemsbley.dev`:
  `v=DMARC1; p=none; rua=mailto:contact@jemsbley.dev`. Start at `p=none` to
  observe without rejecting anything.
- **SPF** — whichever option above you pick will give you one. If you end up
  with multiple mail sources, merge them into a *single* SPF record; more than
  one is a misconfiguration.

---

## Deliberately not done

- **The Palo Alto category-change request.** Submit at
  `urlfiltering.paloaltonetworks.com` *after* this deploys, suggesting *Games*
  or *Computer-and-Internet-Info*. Submitting before the content is live wastes
  the request — they'd re-crawl, still see a login wall, and re-confirm the
  existing category.
- **The NRD flag.** Keyed to WHOIS creation date, expires at 32 days. Nothing
  to do.
- **A proper 1200×630 OG image.** `og-image.png` is currently the square 499×499
  logo. It works, but a real landscape card would preview better if a link is
  ever shared in Discord or Slack.
- **`/.well-known/security.txt`.** Another small legitimacy signal, outside the
  scope of what was agreed here.
- **Other vendor submissions** (Google Safe Browsing, VirusTotal, Cisco Talos,
  Fortiguard, Zscaler) — worth checking if the block is actually affecting
  people on campus networks.

## Two things to flag

- **The legal pages are plain-language drafts, not lawyer-reviewed.** They are
  accurate about what the code does, which is what matters for both the
  classifier and for Google OAuth verification. If this ever stops being a
  small free tool for one team, have them looked at properly.
- **Pre-existing, not fixed:** `LoginPage.tsx` uses
  `className="… bg-valorant-bg"`, but `valorant.bg` isn't defined in
  `tailwind.config.js` (the palette has `dark`, `panel`, `panel2`, `accent`,
  `muted`, `red`). Tailwind generates no rule for it, so the page falls through
  to the `body` background — which is `bg-valorant-dark` and looks correct, so
  the bug is invisible. Left alone as out of scope; worth a one-character fix
  to `bg-valorant-dark` next time that file is open.
