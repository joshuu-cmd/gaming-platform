import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const root = new URL('../../../../', import.meta.url);
const envPath = fileURLToPath(new URL('.env', root));

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL must be set before running migrations.');
}

const migrationsPath = fileURLToPath(
  new URL('database/migrations/', root),
);

const migrations = readdirSync(migrationsPath)
  .filter((file) => /^\d+_.*\.sql$/.test(file))
  .sort();

const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 5000,
});

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  for (const file of migrations) {
    const result = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE version = $1',
      [file],
    );

    if (result.rowCount && result.rowCount > 0) {
      console.log(`Skipped ${file} (already applied).`);
      continue;
    }

    const migration = readFileSync(
      `${migrationsPath}/${file}`,
      'utf8',
    );

    await pool.query('BEGIN');

    try {
      await pool.query(migration);

      await pool.query(
        'INSERT INTO schema_migrations (version) VALUES ($1)',
        [file],
      );

      await pool.query('COMMIT');

      console.log(`Applied ${file}.`);
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await pool.end();
}
