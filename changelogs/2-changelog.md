# Public content layer — fixing the Palo Alto "Insufficient-Content" flag

Adds a real, crawlable public surface to `tracker.jemsbley.dev` so the domain
has describable content for URL classifiers (and for humans who land on it
without an account). This is step 1 of the Palo Alto remediation: it does not
touch the NRD timer (which expires on its own) and it does not submit the
category change request (that comes after this ships).

Version `1.1.0` → `1.1.1`, with a matching entry at the top of
`src/utils/changelog.ts` so the in-app version chip shows it.

---

## Branch base

This branch started from `cc6514f`, which was **4 commits behind
`origin/main`**. `origin/main` was merged in (commit `548b916`) partway
through the work, which brought in the heatmap page, the version chip and
`src/utils/changelog.ts`, and — relevant here — **guest mode**, which was never
missing, just absent from the stale base.

Three conflicts, resolved as follows:

- **`package.json`** — took upstream's `1.1.0` over a mistaken `0.2.0` bump
  made against the stale base, then bumped properly to `1.1.1`.
- **`src/main.tsx`** — kept the static `<link rel="icon">` approach over
  upstream's JS favicon injection (see below).
- **`src/pages/LoginPage.tsx`** — kept **both** sides: upstream's guest-mode
  button and this branch's About/Privacy/Terms links.

`src/components/AuthGuard.tsx` auto-merged cleanly; upstream's guest sample
loading and guest route restrictions now sit alongside the landing-page branch
for `/`.

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

The no-JS view of `/` is now **354 words**.

## Decisions taken

| Decision | Choice |
|---|---|
| Landing page location | `/` serves both — landing page when unauthenticated, `StatsPage` when signed in. **No existing URL changes**, so shared links and bookmarks all still work. |
| Crawler visibility | Static HTML files in `public/` for the info pages, plus a static copy of the landing page baked into `index.html`. No new build dependencies. |
| Naming / affiliation | Brand-neutral: "Generator's University Team Tracking System" only. No Northeastern or personal naming. Riot Games disclaimer included. |
| Contact address | `contact@jemsbley.dev` (inbox setup writeup at the end of this document). |
| Info page depth | Minimal boilerplate, to be filled in later. |

---

## Changes by file

### New: static public pages

Written as deliberately thin boilerplate — a heading and a short paragraph per
section — so they're easy to rewrite later without unpicking prose.

**`public/about.html`** (55 lines) — What the tool is, that accounts are
invite-only, and a contact address.

**`public/privacy.html`** (70 lines) — Five stub sections: what's collected,
how it's used, who it's shared with, how to get data deleted, and contact. The
statements are accurate to what the code does (email plus Google account
identifier, a chosen display name, the data you enter; no analytics or
third-party tracking) but deliberately brief.

**`public/terms.html`** (76 lines) — Six stub sections: access, acceptable use,
your content, no warranty, intellectual property (the Riot Games notice), and
contact.

**`public/page.css`** — One small hand-written stylesheet shared by the three
pages. Deliberately not Tailwind: these pages must render correctly with zero
JavaScript, and the Tailwind build only arrives with the JS bundle. Colors
mirror the `valorant` palette from `tailwind.config.js`. Left fuller than the
pages currently need, so added sections pick up styling for free.

### New: crawler plumbing

**`public/robots.txt`** — Four lines: allow everything, point at the sitemap.

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
- **A complete static copy of the landing page inside `<div id="root">`**,
  including the sticky header and its sign-in button. This is the
  no-JavaScript view of the site.
- A small inline `<style>` block (classes prefixed `s-`) so that markup is
  *styled* without JS rather than rendering as raw text. It also means the
  first paint before the bundle loads looks like the finished page.

The guest-mode button is intentionally **not** in this static copy — it's a
store action that does nothing without JavaScript, so the no-JS view offers
sign-in only. There's a comment in the markup saying so.

Keep this copy in sync with `LandingPage.tsx` — there is a comment in both
files saying so.

### `src/pages/LandingPage.tsx` (new)

The React landing page shown at `/` to unauthenticated visitors.

- **Sticky header** — `sticky top-0 z-10` with the same border, translucent
  panel background, and backdrop blur as `AppHeader`, so it reads as the same
  component family. Holds the logo, the app name, and a **Sign in** button
  pushed right with `ml-auto`. The name gets `truncate` and the button
  `shrink-0`, so the header stays a single row at any width and the button is
  never the thing that wraps.
- **Two buttons at the bottom** of the page body, side by side: **Sign in**
  (`btn-primary`, routes to `/login`) and **I'm a guest — browse sample data**
  (`btn-ghost`, calls `enterGuestMode` from `authStore`). They sit in a
  `flex flex-wrap gap-3` row so they drop to two lines on narrow screens
  instead of overflowing.
- Six feature cards using the app's existing `card` class, now including the
  heatmap page that came in with the merge.
- Footer links to the info pages as plain `<a>` tags rather than router
  `<Link>`s, because those pages are standalone static HTML outside the SPA.

The guest button needs no navigation: it's already at `/`, so flipping the auth
status to `'guest'` makes `AuthGuard` re-render that same route into the app
with sample data loaded.

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
route table are untouched, which is why no in-app URL changed. Upstream's
`loadGuestSample` effect and its `/settings` + `/admin` guest redirects are
unaffected.

### `src/main.tsx`

- Clears `#root` immediately before mounting, so the static shell is never
  visible alongside the React tree. React 18's `createRoot` empties the
  container anyway; doing it explicitly makes the contract obvious instead of
  load-bearing on framework behavior.
- Removed the runtime favicon injection block (and the now-unused
  `generatorLogo` import). The static `<link>` in `index.html` handles it,
  which works in dev and prod and — unlike the old approach — without
  JavaScript.

### `src/pages/LoginPage.tsx`

A crawler that follows the sign-in link lands here, so it got a one-line
description of what the site is ("Match tracking and analytics for competitive
Valorant teams") ahead of the existing "sign in to continue," plus a footer row
linking About / Privacy / Terms. Upstream's guest button is kept above those
links — the landing page is now the primary home for it, but leaving it here
costs nothing and preserves the existing entry point.

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

### `src/utils/changelog.ts`, `package.json`

New `1.1.1` entry at the top of `CHANGELOG` — two lines, covering the landing
page with its info pages and the relocated guest button. `package.json` bumped
to match. The header chip reads `CHANGELOG[0].version`, so the new version
shows up in the app automatically.

---

## What a crawler sees now

| Request | Before | After |
|---|---|---|
| `GET /` (no JS) | Empty `<div id="root">` | 354 words: header, headline, description, feature list, access info, contact, disclaimer — styled |
| `GET /` (with JS) | 302 → `/login` | Full landing page |
| `GET /` (signed in) | StatsPage | StatsPage — unchanged |
| `GET /about` | SPA fallback, empty | Static page, no JS needed |
| `GET /privacy` | SPA fallback, empty | Static page, no JS needed |
| `GET /terms` | SPA fallback, empty | Static page, no JS needed |
| `GET /robots.txt` | 404 | Allow-all plus sitemap pointer |
| `GET /sitemap.xml` | 404 | Four public URLs |
| `GET /favicon.png` | 404 (JS-injected only) | Static PNG |

## Verifying

`npm run build` passes (`tsc -b` clean) on the merged tree. Verified by serving
the build and checking every public path returns 200, and by stripping all tags
from `/` to confirm the text a JS-less crawler reads.

To check it yourself:

```bash
npm run build && npm run preview
```

Then, **signed out** (use a private window, or clear `localStorage`):

- `/` — the landing page instead of an instant bounce to login
- Scroll down — the title bar stays pinned, with its **Sign in** button
- At the bottom of the page body — **Sign in** and **I'm a guest — browse
  sample data** side by side; the guest button drops straight into the app on
  sample data
- `/about`, `/privacy`, `/terms`, `/robots.txt`, `/sitemap.xml`
- The login screen keeps its own guest button and gained the three info links
- **Signed in**: `/` still loads StatsPage, every nav link and shared filter
  URL behaves as before, and the version chip reads **v1.1.1** and opens the
  changelog modal with the new entry

To see what a classifier sees:

```bash
curl -s https://tracker.jemsbley.dev/ | sed -e 's/<[^>]*>//g'
```

---

## Setting up the `contact@jemsbley.dev` inbox

The address is published in `index.html`, all three static pages, and
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

## Three things to flag

- **The thin info pages are a slight trade against the classifier.** The
  landing page carries the weight now at 354 words of real description, which
  is the page Palo Alto crawls, so this should still clear
  `Insufficient-Content`. But a two-paragraph About page contributes much less
  than a detailed one would. If the category request comes back rejected,
  fleshing these three pages out is the first thing to try.
- **The legal pages are plain-language stubs, not lawyer-reviewed.** They are
  accurate about what the code does, which is what matters for both the
  classifier and Google OAuth verification. If this ever stops being a small
  free tool for one team, have them looked at properly.
- **Pre-existing, not fixed:** `LoginPage.tsx` uses
  `className="… bg-valorant-bg"`, but `valorant.bg` isn't defined in
  `tailwind.config.js` (the palette has `dark`, `panel`, `panel2`, `accent`,
  `muted`, `red`). Tailwind generates no rule for it, so the page falls through
  to the `body` background — which is `bg-valorant-dark` and looks correct, so
  the bug is invisible. Left alone as out of scope; worth a one-character fix
  to `bg-valorant-dark` next time that file is open.
