import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export const uid = (): string => randomUUID();

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
