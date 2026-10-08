import express from 'express';
import { GameError } from './modules/games/game.service.js';
import { routes } from './routes/index.js';

const  app = express();
export default app;

app.use(express.json({ limit: '10kb' }));
app.use('/api', routes);
app.use((_request, response) => {
  response.status(404).json({ error: 'Route not found.' });
});
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof GameError) {
    response.status(error.statusCode).json({ error: error.message });
    return;
  }
  response.status(500).json({ error: 'Something went wrong.' });
});
