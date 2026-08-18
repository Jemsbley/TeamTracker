import type { Request, Response, NextFunction } from 'express';
import { prisma } from './prisma.js';
import { HttpError } from './util.js';

export type Role = 'owner' | 'editor' | 'viewer';

const RANK: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

/**
 * Resolves the caller's role on a roster and enforces a minimum.
 * - No membership  -> 404 (don't leak roster existence to non-members)
 * - Insufficient   -> 403
 * Returns the caller's actual role for callers that need it.
 */
export async function requireRosterAccess(
  userId: string,
  rosterId: string,
  minRole: Role
): Promise<Role> {
  const m = await prisma.rosterMembership.findUnique({
    where: { rosterId_userId: { rosterId, userId } },
    select: { role: true },
  });
  if (!m) throw new HttpError(404, 'Roster not found');
  const role = m.role as Role;
  if (RANK[role] < RANK[minRole]) {
    throw new HttpError(403, 'Insufficient permissions for this roster');
  }
  return role;
}

/** For Game routes: resolve the roster behind a series, then check access. */
export async function requireSeriesAccess(
  userId: string,
  seriesId: string,
  minRole: Role
): Promise<{ role: Role; rosterId: string }> {
  const s = await prisma.series.findUnique({
    where: { id: seriesId },
    select: { rosterId: true },
  });
  if (!s) throw new HttpError(404, 'Series not found');
  const role = await requireRosterAccess(userId, s.rosterId, minRole);
  return { role, rosterId: s.rosterId };
}

/** Roster ids the user is a member of, for scoping list/read queries. */
export async function memberRosterIds(userId: string): Promise<string[]> {
  const memberships = await prisma.rosterMembership.findMany({
    where: { userId },
    select: { rosterId: true },
  });
  return memberships.map((m) => m.rosterId);
}

/** Express middleware: 403 unless the caller's accountType is 'admin'. */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { accountType: true },
    });
    if (!user || user.accountType !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    next();
  } catch (e) {
    next(e);
  }
}
