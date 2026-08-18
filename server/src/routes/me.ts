import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError } from '../util.js';

export const meRouter = Router();

meRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: {
        id: true,
        email: true,
        username: true,
        accountType: true,
        createdAt: true,
      },
    });
    if (!user) throw new HttpError(404, 'User not found');
    res.json(user);
  })
);

const patchSchema = z.object({
  username: z.string().min(1).max(40),
});

/** Update the caller's own profile (currently just the chosen username). */
meRouter.patch(
  '/',
  asyncHandler(async (req, res) => {
    const { username } = patchSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.userId! },
      data: { username: username.trim() },
      select: { id: true, email: true, username: true, accountType: true },
    });
    res.json(user);
  })
);

/** Delete the caller's own account. Cascades rosters they created. */
meRouter.delete(
  '/',
  asyncHandler(async (req, res) => {
    await prisma.user.delete({ where: { id: req.userId! } });
    res.status(204).end();
  })
);

/**
 * Full data wipe for the caller: deletes every roster they own — cascading
 * its players, series, games, and scouting reports — plus any unattached
 * (personal) scouting reports. Unlike DELETE /rosters/:id, this intentionally
 * allows wiping down to zero rosters; the app already supports that state
 * (the "getting started" flow).
 */
meRouter.delete(
  '/data',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const owned = await prisma.rosterMembership.findMany({
      where: { userId, role: 'owner' },
      select: { rosterId: true },
    });
    await prisma.$transaction([
      prisma.roster.deleteMany({
        where: { id: { in: owned.map((m) => m.rosterId) } },
      }),
      prisma.scoutingReport.deleteMany({ where: { userId, rosterId: null } }),
    ]);
    res.status(204).end();
  })
);

/**
 * One-shot bootstrap call used by the frontend right after login: returns the
 * full set of entities across every roster the caller is a member of. Rosters
 * carry the caller's per-roster role and primary flag from their membership.
 */
meRouter.get(
  '/state',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const memberships = await prisma.rosterMembership.findMany({
      where: { userId },
      select: { rosterId: true, role: true, isPrimary: true },
    });
    const rosterIds = memberships.map((m) => m.rosterId);
    const membershipByRoster = new Map(memberships.map((m) => [m.rosterId, m]));

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
      rosters: rosters.map(({ userId: _u, ...r }) => {
        const m = membershipByRoster.get(r.id);
        return { ...r, myRole: m?.role, isPrimary: m?.isPrimary ?? false };
      }),
      players: players.map(({ userId: _u, ...p }) => p),
      series: series.map(({ userId: _u, ...s }) => s),
      games: games.map(({ userId: _u, ...g }) => g),
      scoutingReports: scoutingReports.map(({ userId: _u, ...sr }) => sr),
    });
  })
);
