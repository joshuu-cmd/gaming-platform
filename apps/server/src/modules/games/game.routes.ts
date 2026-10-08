import { Router } from 'express';
import * as controller from './game.controller.js';

export const gameRoutes = Router();

gameRoutes.post('/', controller.createGame);
gameRoutes.get('/:id', controller.getGame);
gameRoutes.get('/:id/legal-moves', controller.getLegalMoves);
gameRoutes.post('/:id/join', controller.joinGame);
gameRoutes.post('/:id/leave', controller.leaveGame);
gameRoutes.post('/:id/moves', controller.makeMove);
gameRoutes.post('/:id/rematch', controller.rematch);
gameRoutes.post('/:id/claim-draw', controller.claimDraw);
