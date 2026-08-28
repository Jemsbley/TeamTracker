import { Route, Routes } from 'react-router-dom';
import AuthGuard from './components/AuthGuard';
import Layout from './components/Layout';
import StatsPage from './pages/StatsPage';
import MapsPage from './pages/MapsPage';
import AgentsPage from './pages/AgentsPage';
import PlayersPage from './pages/PlayersPage';
import RosterPage from './pages/RosterPage';
import SeriesListPage from './pages/SeriesListPage';
import SeriesDetailPage from './pages/SeriesDetailPage';
import GameFormPage from './pages/GameFormPage';
import ScoutingPage from './pages/ScoutingPage';
import ScoutingReportPage from './pages/ScoutingReportPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import OnboardingPage from './pages/OnboardingPage';
import SettingsPage from './pages/SettingsPage';
import AdminPage from './pages/AdminPage';
import InvitePage from './pages/InvitePage';
import AccountInvitePage from './pages/AccountInvitePage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route path="/invite/account/:token" element={<AccountInvitePage />} />
      <Route element={<AuthGuard />}>
        <Route path="/" element={<Layout />}>
          <Route index element={<StatsPage />} />
          <Route path="maps" element={<MapsPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="players" element={<PlayersPage />} />
          <Route path="roster" element={<RosterPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="scouting" element={<ScoutingPage />} />
          <Route path="scouting/:reportId" element={<ScoutingReportPage />} />
          <Route path="series" element={<SeriesListPage />} />
          <Route path="series/:seriesId" element={<SeriesDetailPage />} />
          <Route
            path="series/:seriesId/games/new"
            element={<GameFormPage />}
          />
          <Route
            path="series/:seriesId/games/:gameId"
            element={<GameFormPage />}
          />
          <Route
            path="*"
            element={
              <div className="text-valorant-muted">Page not found.</div>
            }
          />
        </Route>
      </Route>
    </Routes>
  );
}
