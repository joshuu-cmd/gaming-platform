import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const root = new URL('../../../../', import.meta.url);
const envPath = fileURLToPath(new URL('.env', root));
if (existsSync(envPath)) process.loadEnvFile(envPath);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL must be set before running migrations.');

const migrationsPath = fileURLToPath(new URL('database/migrations/', root));
const migrations = readdirSync(migrationsPath)
  .filter((file) => /^\d+_.*\.sql$/.test(file))
  .sort();
const pool = new Pool({ connectionString, connectionTimeoutMillis: 3000 });

try {
  for (const file of migrations) {
    const migration = readFileSync(`${migrationsPath}/${file}`, 'utf8');
    await pool.query(migration);
    console.log(`Applied ${file}.`);
  }
} finally {
  await pool.end();
}
