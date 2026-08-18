import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError, uid } from '../util.js';
import { requireRosterAccess, memberRosterIds } from '../access.js';

export const scoutingReportsRouter = Router();

// The per-map data (records, compositions, notes) is deeply nested and already
// shape-enforced by the frontend's TypeScript types, so we accept `maps` as
// opaque JSON — the read path hands it back unchanged.
const reportBody = z.object({
  teamName: z.string().min(1).max(200),
  note: z.string().max(2000).optional(),
  // ISO yyyy-mm-dd; client-supplied like Series/Game dates.
  createdAt: z.string().max(40).optional(),
  // Optional owning roster. Nullable so the client can explicitly unlink.
  rosterId: z.string().max(64).nullable().optional(),
  maps: z.any().optional(),
});

const reportCreate = reportBody.extend({ id: z.string().min(1).max(64).optional() });

const reportPatch = reportBody.partial();

const strip = ({ userId: _u, ...rest }: { userId: string | null }) => rest;

scoutingReportsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const rosterIds = await memberRosterIds(userId);
    const reports = await prisma.scoutingReport.findMany({
      // Reports attached to a roster I belong to, plus my own unattached ones.
      where: { OR: [{ rosterId: { in: rosterIds } }, { rosterId: null, userId }] },
    });
    res.json(reports.map(strip));
  })
);

scoutingReportsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { id, ...data } = reportCreate.parse(req.body);
    if (data.rosterId) {
      await requireRosterAccess(req.userId!, data.rosterId, 'editor');
    }
    const created = await prisma.scoutingReport.create({
      data: { id: id ?? uid(), userId: req.userId!, ...data },
    });
    res.status(201).json(strip(created));
  })
);

/**
 * Authorize a write to an existing report: roster-attached reports need editor
 * on that roster; unattached reports are private to their creator.
 */
async function assertCanWrite(
  userId: string,
  report: { rosterId: string | null; userId: string | null }
) {
  if (report.rosterId) {
    await requireRosterAccess(userId, report.rosterId, 'editor');
  } else if (report.userId !== userId) {
    throw new HttpError(404, 'Scouting report not found');
  }
}

scoutingReportsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const patch = reportPatch.parse(req.body);
    const existing = await prisma.scoutingReport.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) throw new HttpError(404, 'Scouting report not found');
    await assertCanWrite(req.userId!, existing);
    // Reassigning to a different roster requires write access on the target.
    if (patch.rosterId && patch.rosterId !== existing.rosterId) {
      await requireRosterAccess(req.userId!, patch.rosterId, 'editor');
    }
    const updated = await prisma.scoutingReport.update({
      where: { id: existing.id },
      data: patch,
    });
    res.json(strip(updated));
  })
);

scoutingReportsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.scoutingReport.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) throw new HttpError(404, 'Scouting report not found');
    await assertCanWrite(req.userId!, existing);
    await prisma.scoutingReport.delete({ where: { id: existing.id } });
    res.status(204).end();
  })
);
