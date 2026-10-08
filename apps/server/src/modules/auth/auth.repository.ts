import { Pool } from 'pg';
import type { AccountUser, VerificationPurpose } from './auth.types.js';

let pool: Pool | undefined;

function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL must be set before using account storage.');
  pool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 3000 });
  pool.on('error', (error) => console.error('Unexpected account pool error:', error));
  return pool;
}

type UserRow = {
  id: string;
  email: string;
  phone_e164: string;
  display_name: string;
  password_hash: string;
  email_verified_at: Date | null;
  phone_verified_at: Date | null;
  created_at: Date;
};

function mapUser(row: UserRow): AccountUser {
  return {
    id: row.id,
    email: row.email,
    phoneE164: row.phone_e164,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    emailVerifiedAt: row.email_verified_at?.toISOString() ?? null,
    phoneVerifiedAt: row.phone_verified_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

export const authRepository = {
  async connect(): Promise<void> {
    await getPool().query('SELECT 1');
  },

  async createUser(user: Pick<AccountUser, 'id' | 'email' | 'phoneE164' | 'displayName' | 'passwordHash'>): Promise<void> {
    await getPool().query(
      `INSERT INTO account_users (id, email, phone_e164, display_name, password_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, user.email, user.phoneE164, user.displayName, user.passwordHash],
    );
  },

  async getUserByEmail(email: string): Promise<AccountUser | null> {
    const result = await getPool().query<UserRow>('SELECT * FROM account_users WHERE email = $1', [email]);
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  },

  async getUserByEmailOrPhone(email: string, phoneE164: string): Promise<AccountUser | null> {
    const result = await getPool().query<UserRow>(
      'SELECT * FROM account_users WHERE email = $1 OR phone_e164 = $2 LIMIT 1',
      [email, phoneE164],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  },

  async getUserById(id: string): Promise<AccountUser | null> {
    const result = await getPool().query<UserRow>('SELECT * FROM account_users WHERE id = $1', [id]);
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  },

  async createChallenge(challenge: { id: string; userId: string; purpose: VerificationPurpose; tokenHash: string; expiresAt: Date }): Promise<void> {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE auth_challenges SET consumed_at = NOW()
         WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL`,
        [challenge.userId, challenge.purpose],
      );
      await client.query(
        `INSERT INTO auth_challenges (id, user_id, purpose, token_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [challenge.id, challenge.userId, challenge.purpose, challenge.tokenHash, challenge.expiresAt],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async verifyChallenge(userId: string, purpose: VerificationPurpose, tokenHash: string, passwordHash?: string): Promise<AccountUser | null> {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const challengeResult = await client.query<{ id: string; token_hash: string; attempts: number; expires_at: Date }>(
        `SELECT id, token_hash, attempts, expires_at FROM auth_challenges
         WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL
         ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [userId, purpose],
      );
      const challenge = challengeResult.rows[0];
      if (!challenge || challenge.attempts >= 5 || challenge.expires_at <= new Date()) {
        await client.query('COMMIT');
        return null;
      }
      if (challenge.token_hash !== tokenHash) {
        await client.query('UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = $1', [challenge.id]);
        await client.query('COMMIT');
        return null;
      }
      await client.query('UPDATE auth_challenges SET consumed_at = NOW() WHERE id = $1', [challenge.id]);
      if (purpose === 'reset_password') {
        if (!passwordHash) throw new Error('A new password hash is required to complete password reset.');
        await client.query('UPDATE account_users SET password_hash = $2, updated_at = NOW() WHERE id = $1', [userId, passwordHash]);
        await client.query('DELETE FROM auth_sessions WHERE user_id = $1', [userId]);
      } else {
        const verifiedColumn = purpose === 'verify_email' ? 'email_verified_at' : 'phone_verified_at';
        await client.query(`UPDATE account_users SET ${verifiedColumn} = NOW(), updated_at = NOW() WHERE id = $1`, [userId]);
      }
      const userResult = await client.query<UserRow>('SELECT * FROM account_users WHERE id = $1', [userId]);
      await client.query('COMMIT');
      return userResult.rows[0] ? mapUser(userResult.rows[0]) : null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async createSession(tokenHash: string, userId: string, expiresAt: Date): Promise<void> {
    await getPool().query(
      'INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
      [tokenHash, userId, expiresAt],
    );
  },

  async getSessionUser(tokenHash: string): Promise<AccountUser | null> {
    const result = await getPool().query<UserRow>(
      `SELECT u.* FROM auth_sessions s
       JOIN account_users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
      [tokenHash],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  },

  async deleteSession(tokenHash: string): Promise<void> {
    await getPool().query('DELETE FROM auth_sessions WHERE token_hash = $1', [tokenHash]);
  },

  async deleteExpiredSessions(): Promise<void> {
    await getPool().query('DELETE FROM auth_sessions WHERE expires_at <= NOW()');
  },
};

export async function closeAuthRepository(): Promise<void> {
  if (!pool) return;
  const currentPool = pool;
  pool = undefined;
  await currentPool.end();
}
