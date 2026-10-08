import { createHash, createHmac, randomBytes, randomInt, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { GameError } from '../games/game.service.js';
import { sendPasswordReset } from './auth.delivery.js';
import { authRepository } from './auth.repository.js';
import { toAuthenticatedAccount, toPublicAccount, type AccountUser, type VerificationPurpose } from './auth.types.js';

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const CHALLENGE_LIFETIME_MS = 10 * 60 * 1000;
let dummyPasswordHash: Promise<string> | undefined;

function deriveKey(password: string, salt: Buffer, length: number, options: { N: number; r: number; p: number; maxmem: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, length, options, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
}

function challengeHash(value: string): string {
  const secret = process.env.AUTH_CHALLENGE_SECRET ?? 'local-only-challenge-secret';
  return createHmac('sha256', secret).update(value).digest('hex');
}

function sessionHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await deriveKey(password, salt, 64, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$32768$8$1$${salt.toString('hex')}$${derived.toString('hex')}`;
}

async function passwordMatches(password: string, stored: string): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelism, saltHex, hashHex] = stored.split('$');
  if (algorithm !== 'scrypt' || !cost || !blockSize || !parallelism || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await deriveKey(password, Buffer.from(saltHex, 'hex'), expected.length, {
    N: Number(cost), r: Number(blockSize), p: Number(parallelism), maxmem: 64 * 1024 * 1024,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function cleanRegistration(input: { email?: unknown; phone?: unknown; displayName?: unknown; password?: unknown }) {
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const phoneE164 = typeof input.phone === 'string' ? input.phone.replace(/[\s()-]/g, '') : '';
  const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new GameError('Enter a valid email address.');
  if (!/^\+[1-9]\d{7,14}$/.test(phoneE164)) throw new GameError('Enter your phone number with country code, such as +2547… .');
  if (displayName.length < 1 || displayName.length > 24) throw new GameError('Your name must be between 1 and 24 characters.');
  if (password.length < 6 || password.length > 128) throw new GameError('Use a password between 6 and 128 characters.');
  return { email, phoneE164, displayName, password };
}

async function issueCode(user: AccountUser, purpose: VerificationPurpose): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await authRepository.createChallenge({
    id: randomUUID(),
    userId: user.id,
    purpose,
    tokenHash: challengeHash(code),
    expiresAt: new Date(Date.now() + CHALLENGE_LIFETIME_MS),
  });
  return code;
}

async function createSession(user: AccountUser): Promise<string> {
  await authRepository.deleteExpiredSessions();
  const token = randomBytes(32).toString('base64url');
  await authRepository.createSession(sessionHash(token), user.id, new Date(Date.now() + SESSION_LIFETIME_MS));
  return token;
}

export async function register(input: { email?: unknown; phone?: unknown; displayName?: unknown; password?: unknown }) {
  const values = cleanRegistration(input);
  const now = new Date().toISOString();
  const user: AccountUser = {
    id: randomUUID(),
    email: values.email,
    phoneE164: values.phoneE164,
    displayName: values.displayName,
    passwordHash: await hashPassword(values.password),
    emailVerifiedAt: now,
    phoneVerifiedAt: now,
    createdAt: now,
  };
  try {
    await authRepository.createUser(user);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      throw new GameError('That email or phone is already registered. Sign in with it and your existing password.', 409);
    }
    throw error;
  }
  return { user: toPublicAccount(user), sessionToken: await createSession(user) };
}

export async function verifyContact(input: { email?: unknown; purpose?: unknown; code?: unknown }) {
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const purpose = input.purpose;
  const code = typeof input.code === 'string' ? input.code.trim() : '';
  if (!['verify_email', 'verify_phone'].includes(String(purpose)) || !/^\d{6}$/.test(code)) {
    throw new GameError('Enter a valid verification code.');
  }
  const user = await authRepository.getUserByEmail(email);
  if (!user) throw new GameError('That verification code is invalid or expired.', 400);
  const verifiedUser = await authRepository.verifyChallenge(user.id, purpose as VerificationPurpose, challengeHash(code));
  if (!verifiedUser) throw new GameError('That verification code is invalid or expired.', 400);
  if (!verifiedUser.emailVerifiedAt || !verifiedUser.phoneVerifiedAt) {
    return { user: toPublicAccount(verifiedUser), sessionToken: null };
  }
  return { user: toPublicAccount(verifiedUser), sessionToken: await createSession(verifiedUser) };
}

export async function resendVerification(input: { email?: unknown }): Promise<void> {
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const user = await authRepository.getUserByEmail(email);
  if (!user) return;
  // Verification is no longer required for account access. Keep this endpoint
  // as a harmless compatibility response for clients from older deployments.
}

export async function requestPasswordReset(input: { email?: unknown }): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    const challengeSecret = process.env.AUTH_CHALLENGE_SECRET ?? '';
    if (challengeSecret.length < 32 || challengeSecret.includes('replace-with')
      || !process.env.RESEND_API_KEY || !process.env.AUTH_EMAIL_FROM) {
      throw new GameError('Password reset is not configured.', 503);
    }
  }
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const user = await authRepository.getUserByEmail(email);
  if (!user) return;
  const code = await issueCode(user, 'reset_password');
  await sendPasswordReset(user.email, code);
}

export async function resetPassword(input: { email?: unknown; code?: unknown; password?: unknown }): Promise<void> {
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const code = typeof input.code === 'string' ? input.code.trim() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (!/^\d{6}$/.test(code) || password.length < 6 || password.length > 128) {
    throw new GameError('Enter a valid code and a password between 6 and 128 characters.');
  }
  const user = await authRepository.getUserByEmail(email);
  if (!user) throw new GameError('That reset code is invalid or expired.', 400);
  const updated = await authRepository.verifyChallenge(user.id, 'reset_password', challengeHash(code), await hashPassword(password));
  if (!updated) throw new GameError('That reset code is invalid or expired.', 400);
}

export async function login(input: { email?: unknown; identifier?: unknown; password?: unknown }) {
  const rawIdentifier = typeof input.identifier === 'string' ? input.identifier : input.email;
  const identifier = typeof rawIdentifier === 'string' ? rawIdentifier.trim() : '';
  const email = identifier.toLowerCase();
  const phoneE164 = identifier.replace(/[\s()-]/g, '');
  const password = typeof input.password === 'string' ? input.password : '';
  const user = await authRepository.getUserByEmailOrPhone(email, phoneE164);
  dummyPasswordHash ??= hashPassword('not-a-real-account-password');
  const matches = await passwordMatches(password, user?.passwordHash ?? await dummyPasswordHash);
  if (!user || !matches) throw new GameError('Email/phone or password is incorrect.', 401);
  return { user: toAuthenticatedAccount(user), sessionToken: await createSession(user) };
}

export async function getSessionUser(token: string) {
  const user = await authRepository.getSessionUser(sessionHash(token));
  return user ? toAuthenticatedAccount(user) : null;
}

export async function logout(token: string): Promise<void> {
  await authRepository.deleteSession(sessionHash(token));
}

export function sessionLifetimeMs(): number {
  return SESSION_LIFETIME_MS;
}
