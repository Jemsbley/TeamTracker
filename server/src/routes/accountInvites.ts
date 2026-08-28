import { Router } from 'express';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError } from '../util.js';

/**
 * Token-based acceptance for AccountInvite links (mounted at /account-invites,
 * requires auth). Unlike RosterInvite, accepting one doesn't touch any
 * roster/membership — the invitee already gets their own independent account
 * and "Main" roster on first Google sign-in (see auth.ts). This just records
 * who redeemed the link.
 */
export const accountInvitesRouter = Router();

accountInvitesRouter.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const invite = await prisma.accountInvite.findUnique({
      where: { token: req.params.token },
    });
    if (!invite) throw new HttpError(404, 'Invite not found or expired');
    res.json({ accepted: invite.acceptedBy !== null });
  })
);

accountInvitesRouter.post(
  '/:token/accept',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const invite = await prisma.accountInvite.findUnique({
      where: { token: req.params.token },
    });
    if (!invite) throw new HttpError(404, 'Invite not found or expired');
    if (invite.acceptedBy && invite.acceptedBy !== userId) {
      throw new HttpError(400, 'This invite has already been used');
    }
    if (!invite.acceptedBy) {
      await prisma.accountInvite.update({
        where: { id: invite.id },
        data: { acceptedBy: userId },
      });
    }
    res.json({ ok: true });
  })
);
