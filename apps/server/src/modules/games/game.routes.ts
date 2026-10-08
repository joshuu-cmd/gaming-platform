import { Router } from 'express';
import { optionalAuth, requireAuth } from '../auth/auth.schema.js';
import * as controller from './game.controller.js';

export const gameRoutes = Router();

gameRoutes.post('/', requireAuth, controller.createGame);
gameRoutes.get('/:id', controller.getGame);
gameRoutes.get('/:id/legal-moves', optionalAuth, controller.getLegalMoves);
gameRoutes.post('/:id/join', optionalAuth, controller.joinGame);
gameRoutes.post('/:id/leave', optionalAuth, controller.leaveGame);
gameRoutes.post('/:id/moves', optionalAuth, controller.makeMove);
gameRoutes.post('/:id/rematch', optionalAuth, controller.rematch);
gameRoutes.post('/:id/claim-draw', optionalAuth, controller.claimDraw);
