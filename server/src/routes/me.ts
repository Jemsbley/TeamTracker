import { Router } from 'express';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError } from '../util.js';

export const meRouter = Router();

meRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, email: true, createdAt: true },
    });
    if (!user) throw new HttpError(404, 'User not found');
    res.json(user);
  })
);

/**
 * One-shot bootstrap call used by the frontend right after login: returns the
 * full set of entities belonging to this user. Mirrors the AppState shape
 * defined in the frontend types.ts.
 */
meRouter.get(
  '/state',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const [rosters, players, series, games, scoutingReports] = await Promise.all([
      prisma.roster.findMany({ where: { userId } }),
      prisma.player.findMany({ where: { userId } }),
      prisma.series.findMany({ where: { userId } }),
      prisma.game.findMany({ where: { userId } }),
      prisma.scoutingReport.findMany({ where: { userId } }),
    ]);
    res.json({
      rosters: rosters.map(({ userId: _u, ...r }) => r),
      players: players.map(({ userId: _u, ...p }) => p),
      series: series.map(({ userId: _u, ...s }) => s),
      games: games.map(({ userId: _u, ...g }) => g),
      scoutingReports: scoutingReports.map(({ userId: _u, ...sr }) => sr),
    });
  })
);
