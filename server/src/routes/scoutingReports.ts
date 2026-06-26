import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError, uid } from '../util.js';

export const scoutingReportsRouter = Router();

// The per-map data (records, compositions, notes) is deeply nested and already
// shape-enforced by the frontend's TypeScript types, so we accept `maps` as
// opaque JSON — the read path hands it back unchanged.
const reportBody = z.object({
  teamName: z.string().min(1).max(200),
  note: z.string().max(2000).optional(),
  // Optional owning roster. Nullable so the client can explicitly unlink.
  rosterId: z.string().max(64).nullable().optional(),
  maps: z.any().optional(),
});

const reportCreate = reportBody.extend({ id: z.string().min(1).max(64).optional() });

const reportPatch = reportBody.partial();

scoutingReportsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const reports = await prisma.scoutingReport.findMany({
      where: { userId: req.userId! },
    });
    res.json(reports.map(({ userId: _u, ...r }) => r));
  })
);

scoutingReportsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { id, ...data } = reportCreate.parse(req.body);
    const created = await prisma.scoutingReport.create({
      data: { id: id ?? uid(), userId: req.userId!, ...data },
    });
    const { userId: _u, ...rest } = created;
    res.status(201).json(rest);
  })
);

scoutingReportsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const patch = reportPatch.parse(req.body);
    const existing = await prisma.scoutingReport.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) throw new HttpError(404, 'Scouting report not found');
    const updated = await prisma.scoutingReport.update({
      where: { id: existing.id },
      data: patch,
    });
    const { userId: _u, ...rest } = updated;
    res.json(rest);
  })
);

scoutingReportsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.scoutingReport.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) throw new HttpError(404, 'Scouting report not found');
    await prisma.scoutingReport.delete({ where: { id: existing.id } });
    res.status(204).end();
  })
);
