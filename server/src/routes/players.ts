import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError, uid } from '../util.js';
import { requireRosterAccess, memberRosterIds } from '../access.js';

export const playersRouter = Router();

const playerBody = z.object({
  rosterId: z.string().min(1),
  name: z.string().min(1).max(200),
  isMainRoster: z.boolean(),
});

const playerCreate = playerBody.extend({ id: z.string().min(1).max(64).optional() });

const playerPatch = playerBody.partial();

const strip = ({ userId: _u, ...rest }: { userId: string | null }) => rest;

playersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const rosterIds = await memberRosterIds(req.userId!);
    const players = await prisma.player.findMany({
      where: { rosterId: { in: rosterIds } },
    });
    res.json(players.map(strip));
  })
);

playersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { id, ...data } = playerCreate.parse(req.body);
    await requireRosterAccess(req.userId!, data.rosterId, 'editor');
    const created = await prisma.player.create({
      data: { id: id ?? uid(), userId: req.userId!, ...data },
    });
    res.status(201).json(strip(created));
  })
);

playersRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const patch = playerPatch.parse(req.body);
    const existing = await prisma.player.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, 'Player not found');
    await requireRosterAccess(req.userId!, existing.rosterId, 'editor');
    // Moving to another roster requires write access on the target too.
    if (patch.rosterId && patch.rosterId !== existing.rosterId) {
      await requireRosterAccess(req.userId!, patch.rosterId, 'editor');
    }
    const updated = await prisma.player.update({
      where: { id: existing.id },
      data: patch,
    });
    res.json(strip(updated));
  })
);

playersRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.player.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, 'Player not found');
    await requireRosterAccess(req.userId!, existing.rosterId, 'editor');

    // The frontend's removePlayer also strips this player's stats from every
    // game in the roster. Mirror that here, scoping by the roster (not the
    // creator) so teammates' games are cleaned up too.
    await prisma.$transaction(async (tx) => {
      const games = await tx.game.findMany({
        where: { series: { rosterId: existing.rosterId } },
      });
      for (const g of games) {
        const stats = Array.isArray(g.stats) ? (g.stats as { playerId: string }[]) : [];
        const filtered = stats.filter((s) => s.playerId !== existing.id);
        if (filtered.length !== stats.length) {
          await tx.game.update({ where: { id: g.id }, data: { stats: filtered } });
        }
      }
      await tx.player.delete({ where: { id: existing.id } });
    });

    res.status(204).end();
  })
);
