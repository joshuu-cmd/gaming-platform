import { Pool } from 'pg';
import type { PlatformGame } from './game.types.js';

export interface StoredGame {
  game: PlatformGame;
  revision: number;
}

export class ConcurrentGameUpdateError extends Error {
  constructor() {
    super('The game changed while this move was being processed.');
    this.name = 'ConcurrentGameUpdateError';
  }
}

let pool: Pool | undefined;

function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL must be set before using game storage.');
  pool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 3000 });
  pool.on('error', (error) => console.error('Unexpected PostgreSQL pool error:', error));
  return pool;
}

export const gameRepository = {
  async connect(): Promise<void> {
    await getPool().query('SELECT 1');
  },

  async create(game: PlatformGame): Promise<void> {
    await getPool().query(
      `INSERT INTO games (id, game_type, status, difficulty, state)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [game.id, game.gameType, game.status, game.difficulty ?? null, JSON.stringify(game)],
    );
  },

  async get(id: string): Promise<StoredGame | null> {
    const result = await getPool().query(
      'SELECT state, game_type, revision FROM games WHERE id = $1',
      [id],
    );
    const row = result.rows[0] as { state: PlatformGame; game_type: 'connect4' | 'checkers' | 'chess'; revision: number } | undefined;
    return row ? {
      game: { ...row.state, gameType: row.state.gameType ?? row.game_type } as PlatformGame,
      revision: Number(row.revision),
    } : null;
  },

  async update(game: PlatformGame, expectedRevision: number): Promise<void> {
    const result = await getPool().query(
      `UPDATE games
       SET status = $2, difficulty = $3, state = $4::jsonb,
           revision = revision + 1, updated_at = now()
       WHERE id = $1 AND revision = $5`,
      [game.id, game.status, game.difficulty ?? null, JSON.stringify(game), expectedRevision],
    );
    if (result.rowCount !== 1) throw new ConcurrentGameUpdateError();
  },
};

export async function closeGameRepository(): Promise<void> {
  if (!pool) return;
  const currentPool = pool;
  pool = undefined;
  await currentPool.end();
}
