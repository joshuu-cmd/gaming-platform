import type { NextFunction, Request, Response } from 'express';
import { GameError } from '../games/game.service.js';
import * as auth from './auth.service.js';

const authAttempts = new Map<string, { count: number; resetAt: number }>();

export function sessionCookieName(): string {
  return process.env.NODE_ENV === 'production' ? '__Host-gp_session' : 'gp_session';
}

export function rateLimit(maxAttempts: number, windowMs: number) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const now = Date.now();
    if (authAttempts.size > 5_000) {
      for (const [entryKey, entry] of authAttempts) {
        if (entry.resetAt <= now) authAttempts.delete(entryKey);
      }
      if (authAttempts.size > 10_000) authAttempts.delete(authAttempts.keys().next().value as string);
    }
    const key = `${request.path}:${request.ip ?? 'unknown'}`;
    const current = authAttempts.get(key);
    if (!current || current.resetAt <= now) {
      authAttempts.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (current.count >= maxAttempts) {
      response.setHeader('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)));
      response.status(429).json({ error: 'Too many attempts. Please wait and try again.' });
      return;
    }
    current.count += 1;
    next();
  };
}

export function readSessionToken(request: Request): string | null {
  const cookie = request.headers.cookie;
  if (!cookie) return null;
  const prefix = `${sessionCookieName()}=`;
  const entry = cookie.split(';').map((value) => value.trim()).find((value) => value.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : null;
}

export async function optionalAuth(request: Request, _response: Response, next: NextFunction): Promise<void> {
  try {
    const token = readSessionToken(request);
    if (token) request.account = await auth.getSessionUser(token) ?? undefined;
    next();
  } catch (error) {
    next(error);
  }
}

export async function requireAuth(request: Request, response: Response, next: NextFunction): Promise<void> {
  await optionalAuth(request, response, (error?: unknown) => {
    if (error) {
      next(error);
      return;
    }
    if (!request.account) {
      next(new GameError('Sign in to continue.', 401));
      return;
    }
    next();
  });
}
