import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError, uid } from '../util.js';
import { requireRosterAccess } from '../access.js';

export const rostersRouter = Router();

const rosterBody = z.object({
  name: z.string().min(1).max(200),
  notes: z.string().max(10000).optional(),
  isPrimary: z.boolean().optional(),
});

const rosterCreate = rosterBody.extend({ id: z.string().min(1).max(64).optional() });

const rosterPatch = rosterBody.partial();

/** Serialize a roster with the caller's membership info folded in. */
function withMembership(
  roster: { id: string; userId: string; name: string; notes: string | null },
  membership: { role: string; isPrimary: boolean } | undefined
) {
  const { userId: _u, ...rest } = roster;
  return { ...rest, myRole: membership?.role, isPrimary: membership?.isPrimary ?? false };
}

rostersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const memberships = await prisma.rosterMembership.findMany({
      where: { userId },
      select: { rosterId: true, role: true, isPrimary: true },
    });
    const byId = new Map(memberships.map((m) => [m.rosterId, m]));
    const rosters = await prisma.roster.findMany({
      where: { id: { in: memberships.map((m) => m.rosterId) } },
    });
    res.json(rosters.map((r) => withMembership(r, byId.get(r.id))));
  })
);

rostersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { id, isPrimary, ...data } = rosterCreate.parse(req.body);
    const userId = req.userId!;
    const rosterId = id ?? uid();
    const created = await prisma.$transaction(async (tx) => {
      const roster = await tx.roster.create({
        data: { id: rosterId, userId, ...data },
      });
      if (isPrimary) {
        await tx.rosterMembership.updateMany({
          where: { userId },
          data: { isPrimary: false },
        });
      }
      await tx.rosterMembership.create({
        data: { rosterId, userId, role: 'owner', isPrimary: isPrimary ?? false },
      });
      return roster;
    });
    res
      .status(201)
      .json(withMembership(created, { role: 'owner', isPrimary: isPrimary ?? false }));
  })
);

rostersRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { isPrimary, ...patch } = rosterPatch.parse(req.body);
    const userId = req.userId!;
    const rosterId = req.params.id;

    // Editing name/notes is shared data -> needs editor. Changing isPrimary is
    // a personal preference -> any member may do it.
    const minRole = Object.keys(patch).length > 0 ? 'editor' : 'viewer';
    await requireRosterAccess(userId, rosterId, minRole);

    await prisma.$transaction(async (tx) => {
      if (Object.keys(patch).length > 0) {
        await tx.roster.update({ where: { id: rosterId }, data: patch });
      }
      if (isPrimary !== undefined) {
        if (isPrimary) {
          await tx.rosterMembership.updateMany({
            where: { userId, rosterId: { not: rosterId } },
            data: { isPrimary: false },
          });
        }
        await tx.rosterMembership.update({
          where: { rosterId_userId: { rosterId, userId } },
          data: { isPrimary },
        });
      }
    });

    const roster = await prisma.roster.findUnique({ where: { id: rosterId } });
    const membership = await prisma.rosterMembership.findUnique({
      where: { rosterId_userId: { rosterId, userId } },
      select: { role: true, isPrimary: true },
    });
    res.json(withMembership(roster!, membership ?? undefined));
  })
);

rostersRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const rosterId = req.params.id;
    await requireRosterAccess(userId, rosterId, 'owner');

    // Don't leave the owner with no rosters of their own.
    const ownedCount = await prisma.rosterMembership.count({
      where: { userId, role: 'owner' },
    });
    if (ownedCount <= 1) {
      throw new HttpError(400, 'Cannot delete the last roster');
    }

    // onDelete: Cascade removes players/series/games and memberships rooted at
    // this roster, so we don't need to fan out manually here.
    await prisma.roster.delete({ where: { id: rosterId } });
    res.status(204).end();
  })
);
