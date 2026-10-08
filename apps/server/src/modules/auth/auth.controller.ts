import type { Request, Response } from 'express';
import * as auth from './auth.service.js';
import { readSessionToken, sessionCookieName } from './auth.schema.js';

function setSession(response: Response, token: string): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${sessionCookieName()}=${encodeURIComponent(token)}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${Math.floor(auth.sessionLifetimeMs() / 1000)}`);
}

function clearSession(response: Response): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${sessionCookieName()}=; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=0`);
}

export async function register(request: Request, response: Response): Promise<void> {
  const result = await auth.register(request.body ?? {});
  setSession(response, result.sessionToken);
  response.status(201).json({ user: result.user });
}

export async function verifyContact(request: Request, response: Response): Promise<void> {
  const result = await auth.verifyContact(request.body ?? {});
  if (result.sessionToken) setSession(response, result.sessionToken);
  response.json({ user: result.user, verified: Boolean(result.sessionToken) });
}

export async function resendVerification(request: Request, response: Response): Promise<void> {
  await auth.resendVerification(request.body ?? {});
  response.json({ sent: true });
}

export async function requestPasswordReset(request: Request, response: Response): Promise<void> {
  await auth.requestPasswordReset(request.body ?? {});
  response.json({ sent: true });
}

export async function resetPassword(request: Request, response: Response): Promise<void> {
  await auth.resetPassword(request.body ?? {});
  response.json({ reset: true });
}

export async function login(request: Request, response: Response): Promise<void> {
  const result = await auth.login(request.body ?? {});
  setSession(response, result.sessionToken);
  response.json({ user: result.user });
}

export async function logout(request: Request, response: Response): Promise<void> {
  const token = readSessionToken(request);
  if (token) await auth.logout(token);
  clearSession(response);
  response.status(204).end();
}

export function me(request: Request, response: Response): void {
  response.json({ user: request.account ?? null });
}
