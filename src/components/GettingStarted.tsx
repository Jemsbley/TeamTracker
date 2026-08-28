import { Link } from 'react-router-dom';
import generatorLogo from '../assets/icons/generator.png';

/**
 * Full-page guidance shown on the stats/data pages while there's nothing to
 * display yet. With no rosters it points at both roster setup and series; once
 * a roster exists it just nudges the user to add their first series.
 */
export default function GettingStarted({ hasRoster }: { hasRoster: boolean }) {
  return (
    <div className="card max-w-xl mx-auto text-center space-y-4 py-10">
      <img src={generatorLogo} alt="" className="h-12 w-12 object-contain mx-auto" />
      {hasRoster ? (
        <>
          <h2 className="text-xl font-semibold">No matches tracked yet</h2>
          <p className="text-sm text-valorant-muted">
            Stats show up here once you've tracked some matches. Add a series —
            with its maps and player stats — and this page will fill in.
          </p>
          <div className="flex justify-center">
            <Link className="btn-primary" to="/series">
              Go to Series
            </Link>
          </div>
        </>
      ) : (
        <>
          <h2 className="text-xl font-semibold">Let's get you set up</h2>
          <p className="text-sm text-valorant-muted">
            Start by creating a roster and adding your players. Then track your
            matches as series, and your stats will show up across these pages.
          </p>
          <div className="flex justify-center gap-2">
            <Link className="btn-primary" to="/roster">
              Create a roster
            </Link>
            <Link className="btn-ghost" to="/series">
              Add a series
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
