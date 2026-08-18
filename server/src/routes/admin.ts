import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError } from '../util.js';

// All routes require admin — enforced by requireAdmin middleware at mount time.
export const adminRouter = Router();

adminRouter.get(
  '/users',
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        username: true,
        accountType: true,
        createdAt: true,
        _count: { select: { memberships: true, rosters: true } },
      },
    });
    res.json(
      users.map((u) => ({
        id: u.id,
        email: u.email,
        username: u.username,
        accountType: u.accountType,
        createdAt: u.createdAt,
        rosterCount: u._count.rosters,
        membershipCount: u._count.memberships,
      }))
    );
  })
);

const accountTypeSchema = z.object({
  accountType: z.enum(['user', 'admin', 'test']),
});

adminRouter.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const { accountType } = accountTypeSchema.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!exists) throw new HttpError(404, 'User not found');
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { accountType },
      select: { id: true, email: true, username: true, accountType: true },
    });
    res.json(updated);
  })
);

adminRouter.delete(
  '/users/:id',
  asyncHandler(async (req, res) => {
    if (req.params.id === req.userId) {
      throw new HttpError(400, 'Use account settings to delete your own account');
    }
    const exists = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!exists) throw new HttpError(404, 'User not found');
    await prisma.user.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

/**
 * Read-only snapshot of a target user's data, scoped to the rosters they are a
 * member of. Mirrors GET /me/state but for an arbitrary user (no write implied).
 */
adminRouter.get(
  '/users/:id/state',
  asyncHandler(async (req, res) => {
    const userId = req.params.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, username: true, accountType: true },
    });
    if (!user) throw new HttpError(404, 'User not found');

    const memberships = await prisma.rosterMembership.findMany({
      where: { userId },
      select: { rosterId: true, role: true, isPrimary: true },
    });
    const rosterIds = memberships.map((m) => m.rosterId);
    const byId = new Map(memberships.map((m) => [m.rosterId, m]));

    const [rosters, players, series, games, scoutingReports] = await Promise.all([
      prisma.roster.findMany({ where: { id: { in: rosterIds } } }),
      prisma.player.findMany({ where: { rosterId: { in: rosterIds } } }),
      prisma.series.findMany({ where: { rosterId: { in: rosterIds } } }),
      prisma.game.findMany({ where: { series: { rosterId: { in: rosterIds } } } }),
      prisma.scoutingReport.findMany({
        where: { OR: [{ rosterId: { in: rosterIds } }, { rosterId: null, userId }] },
      }),
    ]);

    res.json({
      user,
      state: {
        // No myRole: admin views are read-only on the frontend.
        rosters: rosters.map(({ userId: _u, ...r }) => {
          const m = byId.get(r.id);
          return { ...r, isPrimary: m?.isPrimary ?? false };
        }),
        players: players.map(({ userId: _u, ...p }) => p),
        series: series.map(({ userId: _u, ...s }) => s),
        games: games.map(({ userId: _u, ...g }) => g),
        scoutingReports: scoutingReports.map(({ userId: _u, ...sr }) => sr),
      },
    });
  })
);
