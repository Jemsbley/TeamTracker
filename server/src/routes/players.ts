import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError, uid } from '../util.js';

export const playersRouter = Router();

const playerBody = z.object({
  rosterId: z.string().min(1),
  name: z.string().min(1).max(200),
  isMainRoster: z.boolean(),
});

const playerCreate = playerBody.extend({ id: z.string().min(1).max(64).optional() });

const playerPatch = playerBody.partial();

async function assertRosterOwned(userId: string, rosterId: string) {
  const r = await prisma.roster.findFirst({ where: { id: rosterId, userId } });
  if (!r) throw new HttpError(400, 'Roster does not belong to this user');
}

playersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const players = await prisma.player.findMany({ where: { userId: req.userId! } });
    res.json(players.map(({ userId: _u, ...p }) => p));
  })
);

playersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { id, ...data } = playerCreate.parse(req.body);
    await assertRosterOwned(req.userId!, data.rosterId);
    const created = await prisma.player.create({
      data: { id: id ?? uid(), userId: req.userId!, ...data },
    });
    const { userId: _u, ...rest } = created;
    res.status(201).json(rest);
  })
);

playersRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const patch = playerPatch.parse(req.body);
    const existing = await prisma.player.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) throw new HttpError(404, 'Player not found');
    if (patch.rosterId) await assertRosterOwned(req.userId!, patch.rosterId);
    const updated = await prisma.player.update({
      where: { id: existing.id },
      data: patch,
    });
    const { userId: _u, ...rest } = updated;
    res.json(rest);
  })
);

playersRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.player.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) throw new HttpError(404, 'Player not found');

    // The frontend's removePlayer also strips this player's stats from every
    // game it appears in. Mirror that here so the server stays consistent.
    await prisma.$transaction(async (tx) => {
      const games = await tx.game.findMany({
        where: { userId: req.userId!, stats: { not: undefined } },
      });
      for (const g of games) {
        const stats = Array.isArray(g.stats) ? (g.stats as { playerId: string }[]) : [];
        const filtered = stats.filter((s) => s.playerId !== existing.id);
        if (filtered.length !== stats.length) {
          await tx.game.update({
            where: { id: g.id },
            data: { stats: filtered },
          });
        }
      }
      await tx.player.delete({ where: { id: existing.id } });
    });

    res.status(204).end();
  })
);
