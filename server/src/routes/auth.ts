import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { signToken } from '../auth.js';
import { asyncHandler, HttpError, uid } from '../util.js';

export const authRouter = Router();

const credentialsSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
});

authRouter.post(
  '/signup',
  asyncHandler(async (req, res) => {
    const { email, password } = credentialsSchema.parse(req.body);
    const normalized = email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email: normalized } });
    if (existing) {
      throw new HttpError(409, 'An account with that email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { email: normalized, passwordHash },
      });
      // Seed every new account with one default roster so the UI has something
      // to show on first load (matches the localStorage behavior).
      await tx.roster.create({
        data: { id: uid(), userId: u.id, name: 'Main' },
      });
      return u;
    });

    const token = signToken({ userId: user.id });
    res.status(201).json({ token, user: { id: user.id, email: user.email } });
  })
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = credentialsSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user) throw new HttpError(401, 'Invalid email or password');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new HttpError(401, 'Invalid email or password');

    const token = signToken({ userId: user.id });
    res.json({ token, user: { id: user.id, email: user.email } });
  })
);
