export type VerificationPurpose = 'verify_email' | 'verify_phone' | 'reset_password';

export interface AccountUser {
  id: string;
  email: string;
  phoneE164: string;
  displayName: string;
  passwordHash: string;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  createdAt: string;
}

export interface PublicAccountUser {
  id: string;
  email: string;
  phoneE164: string;
  displayName: string;
  emailVerified: boolean;
  phoneVerified: boolean;
}

export interface AuthenticatedAccount {
  id: string;
  email: string;
  phoneE164: string;
  displayName: string;
}

export function toPublicAccount(user: AccountUser): PublicAccountUser {
  return {
    id: user.id,
    email: user.email,
    phoneE164: user.phoneE164,
    displayName: user.displayName,
    emailVerified: Boolean(user.emailVerifiedAt),
    phoneVerified: Boolean(user.phoneVerifiedAt),
  };
}

export function toAuthenticatedAccount(user: AccountUser): AuthenticatedAccount {
  return { id: user.id, email: user.email, phoneE164: user.phoneE164, displayName: user.displayName };
}

declare global {
  namespace Express {
    interface Request {
      account?: AuthenticatedAccount;
    }
  }
}
