import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError, uid } from '../util.js';
import { requireRosterAccess, memberRosterIds } from '../access.js';

export const seriesRouter = Router();

const seriesFormat = z.enum(['BO1', 'BO3', 'BO5']);

// The frontend Series type has several optional, deeply nested fields
// (pickBan, videos, vodReviews). We accept them as opaque JSON here — the
// client already enforces their shape via TypeScript, and the read path
// hands them back unchanged.
const seriesBody = z.object({
  rosterId: z.string().min(1),
  opponent: z.string().max(200),
  date: z.string().min(1).max(40),
  format: seriesFormat.optional(),
  pickBan: z.any().optional(),
  videos: z.any().optional(),
  vodReviews: z.any().optional(),
  notes: z.string().max(20000).optional(),
  // null clears the link; omitted leaves it unchanged on PATCH.
  scoutingReportId: z.string().max(64).nullable().optional(),
});

const seriesCreate = seriesBody.extend({ id: z.string().min(1).max(64).optional() });

const seriesPatch = seriesBody.partial();

const strip = ({ userId: _u, ...rest }: { userId: string | null }) => rest;

seriesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const rosterIds = await memberRosterIds(req.userId!);
    const series = await prisma.series.findMany({
      where: { rosterId: { in: rosterIds } },
    });
    res.json(series.map(strip));
  })
);

seriesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { id, ...data } = seriesCreate.parse(req.body);
    await requireRosterAccess(req.userId!, data.rosterId, 'editor');
    const created = await prisma.series.create({
      data: { id: id ?? uid(), userId: req.userId!, ...data },
    });
    res.status(201).json(strip(created));
  })
);

seriesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const patch = seriesPatch.parse(req.body);
    const existing = await prisma.series.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, 'Series not found');
    await requireRosterAccess(req.userId!, existing.rosterId, 'editor');
    if (patch.rosterId && patch.rosterId !== existing.rosterId) {
      await requireRosterAccess(req.userId!, patch.rosterId, 'editor');
    }
    const updated = await prisma.series.update({
      where: { id: existing.id },
      data: patch,
    });
    res.json(strip(updated));
  })
);

seriesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.series.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, 'Series not found');
    await requireRosterAccess(req.userId!, existing.rosterId, 'editor');
    await prisma.series.delete({ where: { id: existing.id } });
    res.status(204).end();
  })
);
