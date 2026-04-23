import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-api-key'] as string;
  const expected = process.env.INTERNAL_API_KEY;

  // Use constant-time comparison to prevent timing-oracle attacks
  const keysMatch =
    expected &&
    key &&
    (() => {
      try {
        return timingSafeEqual(Buffer.from(key), Buffer.from(expected));
      } catch {
        return false;
      }
    })();

  if (!keysMatch) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
