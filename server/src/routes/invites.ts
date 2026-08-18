import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError } from '../util.js';
import { requireRosterAccess } from '../access.js';

/**
 * Roster-scoped invite management. Mounted at /rosters/:rosterId/invites.
 * Any editor (or owner) can create/list per-player invite links.
 */
export const rosterInvitesRouter = Router({ mergeParams: true });

const createSchema = z.object({
  playerId: z.string().min(1),
  role: z.enum(['editor', 'viewer']).optional(),
});

rosterInvitesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rosterId } = req.params as { rosterId: string };
    await requireRosterAccess(req.userId!, rosterId, 'editor');
    const invites = await prisma.rosterInvite.findMany({
      where: { rosterId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(invites);
  })
);

rosterInvitesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { rosterId } = req.params as { rosterId: string };
    await requireRosterAccess(req.userId!, rosterId, 'editor');
    const { playerId, role } = createSchema.parse(req.body);

    const player = await prisma.player.findFirst({ where: { id: playerId, rosterId } });
    if (!player) throw new HttpError(404, 'Player not found on this roster');

    const invite = await prisma.rosterInvite.create({
      data: {
        token: randomUUID(),
        rosterId,
        playerId,
        role: role ?? 'viewer',
        createdBy: req.userId!,
      },
    });
    res.status(201).json(invite);
  })
);

/**
 * Token-based invite acceptance. Mounted at /invites (requires auth, but any
 * signed-in user may view/accept a link they were sent).
 */
export const invitesRouter = Router();

invitesRouter.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const invite = await prisma.rosterInvite.findUnique({
      where: { token: req.params.token },
    });
    if (!invite) throw new HttpError(404, 'Invite not found or expired');
    const [roster, player] = await Promise.all([
      prisma.roster.findUnique({ where: { id: invite.rosterId }, select: { name: true } }),
      prisma.player.findUnique({ where: { id: invite.playerId }, select: { name: true } }),
    ]);
    res.json({
      rosterName: roster?.name ?? 'Unknown roster',
      playerName: player?.name ?? 'Unknown player',
      role: invite.role,
      accepted: invite.acceptedBy !== null,
    });
  })
);

invitesRouter.post(
  '/:token/accept',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const invite = await prisma.rosterInvite.findUnique({
      where: { token: req.params.token },
    });
    if (!invite) throw new HttpError(404, 'Invite not found or expired');
    if (invite.acceptedBy && invite.acceptedBy !== userId) {
      throw new HttpError(400, 'This invite has already been used');
    }

    await prisma.$transaction(async (tx) => {
      // Grant membership at the invite's role if not already a member (don't
      // downgrade an existing higher role).
      const existing = await tx.rosterMembership.findUnique({
        where: { rosterId_userId: { rosterId: invite.rosterId, userId } },
      });
      if (!existing) {
        await tx.rosterMembership.create({
          data: { rosterId: invite.rosterId, userId, role: invite.role },
        });
      }
      // Link this user to the player slot the invite was for.
      await tx.player.update({
        where: { id: invite.playerId },
        data: { linkedUserId: userId },
      });
      await tx.rosterInvite.update({
        where: { id: invite.id },
        data: { acceptedBy: userId },
      });
    });

    res.json({ rosterId: invite.rosterId });
  })
);
