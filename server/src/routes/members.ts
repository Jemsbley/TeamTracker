import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError } from '../util.js';
import { requireRosterAccess } from '../access.js';

// Member management for a roster. Mounted at /rosters/:rosterId/members.
// Only the owner may list or change memberships.
export const membersRouter = Router({ mergeParams: true });

const roleSchema = z.object({ role: z.enum(['editor', 'viewer']) });

membersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rosterId } = req.params as { rosterId: string };
    await requireRosterAccess(req.userId!, rosterId, 'owner');
    const memberships = await prisma.rosterMembership.findMany({
      where: { rosterId },
      include: { user: { select: { id: true, email: true, username: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(
      memberships.map((m) => ({
        userId: m.userId,
        role: m.role,
        email: m.user.email,
        username: m.user.username,
      }))
    );
  })
);

membersRouter.patch(
  '/:userId',
  asyncHandler(async (req, res) => {
    const { rosterId, userId: targetId } = req.params as {
      rosterId: string;
      userId: string;
    };
    await requireRosterAccess(req.userId!, rosterId, 'owner');
    const { role } = roleSchema.parse(req.body);

    const target = await prisma.rosterMembership.findUnique({
      where: { rosterId_userId: { rosterId, userId: targetId } },
    });
    if (!target) throw new HttpError(404, 'Member not found');
    if (target.role === 'owner') {
      throw new HttpError(400, "The owner's role cannot be changed");
    }
    const updated = await prisma.rosterMembership.update({
      where: { rosterId_userId: { rosterId, userId: targetId } },
      data: { role },
    });
    res.json({ userId: updated.userId, role: updated.role });
  })
);

membersRouter.delete(
  '/:userId',
  asyncHandler(async (req, res) => {
    const { rosterId, userId: targetId } = req.params as {
      rosterId: string;
      userId: string;
    };
    await requireRosterAccess(req.userId!, rosterId, 'owner');
    const target = await prisma.rosterMembership.findUnique({
      where: { rosterId_userId: { rosterId, userId: targetId } },
    });
    if (!target) throw new HttpError(404, 'Member not found');
    if (target.role === 'owner') {
      throw new HttpError(400, 'The owner cannot be removed');
    }
    await prisma.$transaction([
      prisma.rosterMembership.delete({
        where: { rosterId_userId: { rosterId, userId: targetId } },
      }),
      // Unlink any player slots this user occupied on the roster.
      prisma.player.updateMany({
        where: { rosterId, linkedUserId: targetId },
        data: { linkedUserId: null },
      }),
    ]);
    res.status(204).end();
  })
);
