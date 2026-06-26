import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError, uid } from '../util.js';

export const rostersRouter = Router();

const rosterBody = z.object({
  name: z.string().min(1).max(200),
  notes: z.string().max(10000).optional(),
  isPrimary: z.boolean().optional(),
});

const rosterCreate = rosterBody.extend({ id: z.string().min(1).max(64).optional() });

const rosterPatch = rosterBody.partial();

rostersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const rosters = await prisma.roster.findMany({ where: { userId: req.userId! } });
    res.json(rosters.map(({ userId: _u, ...r }) => r));
  })
);

rostersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { id, ...data } = rosterCreate.parse(req.body);
    const created = await prisma.roster.create({
      data: { id: id ?? uid(), userId: req.userId!, ...data },
    });
    const { userId: _u, ...rest } = created;
    res.status(201).json(rest);
  })
);

rostersRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const patch = rosterPatch.parse(req.body);
    const existing = await prisma.roster.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) throw new HttpError(404, 'Roster not found');
    // A user has at most one primary roster: when marking this one primary,
    // clear the flag on the others in the same transaction.
    const updated = patch.isPrimary
      ? await prisma.$transaction(async (tx) => {
          await tx.roster.updateMany({
            where: { userId: req.userId!, id: { not: existing.id } },
            data: { isPrimary: false },
          });
          return tx.roster.update({ where: { id: existing.id }, data: patch });
        })
      : await prisma.roster.update({ where: { id: existing.id }, data: patch });
    const { userId: _u, ...rest } = updated;
    res.json(rest);
  })
);

rostersRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const count = await prisma.roster.count({ where: { userId } });
    if (count <= 1) {
      throw new HttpError(400, 'Cannot delete the last roster');
    }
    const existing = await prisma.roster.findFirst({
      where: { id: req.params.id, userId },
    });
    if (!existing) throw new HttpError(404, 'Roster not found');
    // onDelete: Cascade in the schema removes players/series/games rooted at
    // this roster, so we don't need to fan out manually here.
    await prisma.roster.delete({ where: { id: existing.id } });
    res.status(204).end();
  })
);
