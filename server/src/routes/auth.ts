import { Router } from 'express';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../prisma.js';
import { signToken } from '../auth.js';
import { asyncHandler, HttpError, uid } from '../util.js';
import { env } from '../env.js';

export const authRouter = Router();

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

const googleSchema = z.object({
  credential: z.string().min(1),
});

/** Public-facing user shape returned to the frontend after auth. */
function publicUser(u: {
  id: string;
  email: string;
  username: string | null;
  accountType: string;
}) {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    accountType: u.accountType,
  };
}

/**
 * Google-only sign-in. The frontend obtains an ID token (credential) via Google
 * Identity Services and posts it here. We verify it, find-or-create the account
 * by email, then issue our own JWT (the rest of the API is unchanged).
 */
authRouter.post(
  '/google',
  asyncHandler(async (req, res) => {
    const { credential } = googleSchema.parse(req.body);

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.email_verified) {
      throw new HttpError(401, 'Google account email could not be verified');
    }

    const email = payload.email.toLowerCase();
    const googleId = payload.sub;
    const isSeedAdmin =
      env.SEED_ADMIN_EMAIL !== '' && email === env.SEED_ADMIN_EMAIL;

    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // New account: seed a default roster + owner membership so the UI has
      // something to show on first load (mirrors the old signup behavior).
      user = await prisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: {
            email,
            googleId,
            accountType: isSeedAdmin ? 'admin' : 'user',
          },
        });
        const rosterId = uid();
        await tx.roster.create({
          data: { id: rosterId, userId: u.id, name: 'Main' },
        });
        await tx.rosterMembership.create({
          data: { rosterId, userId: u.id, role: 'owner', isPrimary: true },
        });
        return u;
      });
    } else {
      // Existing account (incl. legacy password accounts matched by email):
      // record the Google id and apply the seed-admin promotion if applicable.
      const data: { googleId?: string; accountType?: string } = {};
      if (!user.googleId) data.googleId = googleId;
      if (isSeedAdmin && user.accountType !== 'admin') data.accountType = 'admin';
      if (Object.keys(data).length > 0) {
        user = await prisma.user.update({ where: { id: user.id }, data });
      }
    }

    const token = signToken({ userId: user.id });
    res.json({ token, user: publicUser(user) });
  })
);
