import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError, uid } from '../util.js';

export const gamesRouter = Router();

const side = z.enum(['Attack', 'Defense']);

const gameStat = z.object({
  playerId: z.string(),
  agent: z.string(),
  acs: z.number(),
  hsPercent: z.number(),
  kills: z.number(),
  deaths: z.number(),
  assists: z.number(),
  damageDelta: z.number(),
  adr: z.number().optional(),
  kastPercent: z.number(),
  firstKills: z.number(),
  firstDeaths: z.number(),
  multikills: z.number(),
});

const round = z.object({
  result: z.enum(['W', 'L']).optional(),
  firstBlood: z.boolean().optional(),
  planted: z.boolean().optional(),
  category: z.enum(['gun', 'save']).optional(),
});

const gameBody = z.object({
  seriesId: z.string().min(1),
  map: z.string().min(1).max(60),
  date: z.string().min(1).max(40),
  order: z.number().int().positive().optional(),
  scoreFor: z.number().int().min(0).optional(),
  scoreAgainst: z.number().int().min(0).optional(),
  startingSide: side.optional(),
  rounds: z.array(round).optional(),
  stats: z.array(gameStat),
});

const gameCreate = gameBody.extend({ id: z.string().min(1).max(64).optional() });

const gamePatch = gameBody.partial();

async function assertSeriesOwned(userId: string, seriesId: string) {
  const s = await prisma.series.findFirst({ where: { id: seriesId, userId } });
  if (!s) throw new HttpError(400, 'Series does not belong to this user');
}

gamesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const games = await prisma.game.findMany({ where: { userId: req.userId! } });
    res.json(games.map(({ userId: _u, ...g }) => g));
  })
);

gamesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { id, ...data } = gameCreate.parse(req.body);
    await assertSeriesOwned(req.userId!, data.seriesId);

    // Replicate the frontend's auto-ordering: new game appends; siblings get
    // their order field normalized to 1..N based on (existing order, date, id).
    const created = await prisma.$transaction(async (tx) => {
      const siblings = await tx.game.findMany({
        where: { userId: req.userId!, seriesId: data.seriesId },
      });
      const sorted = [...siblings].sort((a, b) => {
        const ao = a.order ?? Infinity;
        const bo = b.order ?? Infinity;
        if (ao !== bo) return ao - bo;
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.id.localeCompare(b.id);
      });
      for (let i = 0; i < sorted.length; i++) {
        const want = i + 1;
        if (sorted[i].order !== want) {
          await tx.game.update({
            where: { id: sorted[i].id },
            data: { order: want },
          });
        }
      }
      return tx.game.create({
        data: {
          id: id ?? uid(),
          userId: req.userId!,
          ...data,
          order: data.order ?? sorted.length + 1,
        },
      });
    });

    const { userId: _u, ...rest } = created;
    res.status(201).json(rest);
  })
);

gamesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const patch = gamePatch.parse(req.body);
    const existing = await prisma.game.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) throw new HttpError(404, 'Game not found');
    if (patch.seriesId) await assertSeriesOwned(req.userId!, patch.seriesId);
    const updated = await prisma.game.update({
      where: { id: existing.id },
      data: patch,
    });
    const { userId: _u, ...rest } = updated;
    res.json(rest);
  })
);

gamesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.game.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) throw new HttpError(404, 'Game not found');
    await prisma.game.delete({ where: { id: existing.id } });
    res.status(204).end();
  })
);
