import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export const uid = (): string => randomUUID();

/** Strip the internal `userId` audit column before returning a record to the client. */
export const stripUserId = <T extends { userId: string | null }>(
  x: T
): Omit<T, 'userId'> => {
  const { userId: _u, ...rest } = x;
  return rest;
};

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function asyncHandler<
  T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>
>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
