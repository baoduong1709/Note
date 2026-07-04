import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Module augmentation to add user property to Express Request
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
      };
    }
  }
}

/**
 * Get the JWT secret from environment variables.
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not defined in environment variables.');
  }
  return secret;
}

/**
 * Middleware that requires a valid JWT token in the Authorization header.
 * Attaches decoded user info to req.user.
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    res.status(401).json({ success: false, error: 'Access token is required.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { userId: string; email: string };
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
    };
    next();
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid or expired token.' });
  }
}

/**
 * Middleware that optionally parses a JWT token if present.
 * Does not reject requests without a token.
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (token) {
    try {
      const decoded = jwt.verify(token, getJwtSecret()) as { userId: string; email: string };
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
      };
    } catch {
      // Token is invalid, but we don't reject — just leave req.user undefined
    }
  }

  next();
}
