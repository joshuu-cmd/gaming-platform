import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { app } from './app.js';
import { closeGameRepository, gameRepository } from './modules/games/game.repository.js';

const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

const port = Number(process.env.PORT ?? 3001);

await gameRepository.connect();

const server = app.listen(port, () => {
  console.log(`Gaming platform API listening on http://localhost:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      void closeGameRepository();
    });
  });
}
