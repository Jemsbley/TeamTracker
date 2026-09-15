import { Link } from 'react-router-dom';
import generatorLogo from '../assets/icons/generator.png';

/**
 * Public landing page, shown at `/` to visitors who aren't signed in.
 *
 * The root URL doubles as the app (signed-in users get StatsPage here), so
 * this exists purely to give the site real, readable content for anyone —
 * human or URL classifier — who arrives without a session. Previously `/`
 * bounced straight to the login screen, which left the domain with no
 * describable content at all.
 *
 * The copy here mirrors the static fallback markup in index.html. If the
 * pitch changes, change it in both places.
 */

const FEATURES: { title: string; body: string }[] = [
  {
    title: 'Round-by-round match records',
    body:
      'Log every round of a series, including the buy phase and economy on both sides.',
  },
  {
    title: 'Team, map, and agent analytics',
    body:
      'Win rates, attack/defense splits, and composition performance broken out by map.',
  },
  {
    title: 'Player breakdowns',
    body:
      'Per-player stats filtered by map, agent, role, and date range.',
  },
  {
    title: 'Map veto planning',
    body:
      'Build and review pick/ban sequences against a specific opponent.',
  },
  {
    title: 'VOD review',
    body:
      'Attach match videos and written review notes to the series they belong to.',
  },
  {
    title: 'Opponent scouting',
    body:
      'Keep scouting reports next to an opponent’s map and agent tendencies.',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-valorant-dark text-valorant-accent">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <header className="flex items-center gap-3 pb-6 border-b border-white/5">
          <img
            src={generatorLogo}
            alt=""
            className="h-9 w-9 object-contain shrink-0"
          />
          <span className="font-semibold tracking-wide">
            Generator&rsquo;s University Team Tracking System
          </span>
        </header>

        <h1 className="text-3xl font-semibold mt-10 leading-tight">
          Match tracking and analytics for competitive Valorant teams.
        </h1>

        <p className="mt-4 leading-relaxed">
          This is a private team tool. It records competitive Valorant matches
          round by round, then turns that history into the numbers a team
          actually uses to prepare: how each map is trending, which agent
          compositions are working, how individual players perform in specific
          roles, and what an upcoming opponent tends to do.
        </p>

        <div className="card mt-6">
          <p className="text-sm leading-relaxed">
            <span className="font-semibold text-white">
              Accounts are invite-only.
            </span>{' '}
            Every roster&rsquo;s data is visible only to the people invited to
            it, so there is no public match database to browse here.
          </p>
        </div>

        <h2 className="text-lg font-semibold mt-10">What it does</h2>
        <div className="grid gap-3 sm:grid-cols-2 mt-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card">
              <h3 className="text-sm font-bold text-white">{f.title}</h3>
              <p className="text-sm text-valorant-muted mt-1 leading-relaxed">
                {f.body}
              </p>
            </div>
          ))}
        </div>

        <h2 className="text-lg font-semibold mt-10">Getting access</h2>
        <p className="mt-2 leading-relaxed">
          Access is granted by invitation from a roster owner. If you&rsquo;re
          on a team that uses this tool, ask your roster owner for an invite
          link. If you already have an account, sign in with Google.
        </p>
        <Link to="/login" className="btn-primary mt-4 px-5 py-2.5">
          Sign in
        </Link>

        <footer className="mt-12 pt-6 border-t border-white/5 text-xs text-valorant-muted space-y-3">
          {/* Plain anchors, not <Link>: these are standalone static HTML
              pages served outside the SPA so they work without JavaScript. */}
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            <a href="/about" className="text-valorant-accent hover:text-white">
              About
            </a>
            <a href="/privacy" className="text-valorant-accent hover:text-white">
              Privacy Policy
            </a>
            <a href="/terms" className="text-valorant-accent hover:text-white">
              Terms of Use
            </a>
          </nav>
          <p className="leading-relaxed">
            Contact{' '}
            <a href="mailto:contact@jemsbley.dev" className="underline">
              contact@jemsbley.dev
            </a>
            . Not endorsed by Riot Games. Valorant and all related properties,
            agent art, and map art are trademarks or registered trademarks of
            Riot Games, Inc.
          </p>
        </footer>
      </div>
    </div>
  );
}
