import { Router } from 'express';
import { authRoutes } from '../modules/auth/auth.routes.js';
import { gameRoutes } from '../modules/games/game.routes.js';

export const routes = Router();

routes.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});
routes.use('/auth', authRoutes);
routes.use('/games', gameRoutes);
