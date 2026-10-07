import { Router } from 'express';
import { gameRoutes } from '../modules/games/game.routes.js';

export const routes = Router();

routes.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});
routes.use('/games', gameRoutes);
