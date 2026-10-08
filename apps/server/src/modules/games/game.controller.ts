import type { Request, Response } from 'express';
import * as games from './game.service.js';

function routeId(request: Request): string {
  const id = request.params.id;
  return Array.isArray(id) ? id[0] ?? '' : id;
}

export async function createGame(request: Request, response: Response): Promise<void> {
  const result = await games.createGame(request.body?.playerName, request.body?.opponent, request.body?.difficulty, request.body?.gameType, request.account);
  response.status(201).json(result);
}

export async function getGame(request: Request, response: Response): Promise<void> {
  response.json({ game: await games.getGame(routeId(request)) });
}

export async function getLegalMoves(request: Request, response: Response): Promise<void> {
  const playerId = request.query.playerId;
  response.json({ moves: await games.getBoardLegalMoves(routeId(request), playerId, request.account?.id) });
}

export async function joinGame(request: Request, response: Response): Promise<void> {
  const result = await games.joinGame(routeId(request), request.body?.playerName, request.account);
  response.status(200).json(result);
}

export async function leaveGame(request: Request, response: Response): Promise<void> {
  const game = await games.leaveGame(routeId(request), request.body?.playerId, request.account?.id);
  response.status(200).json({ game });
}

export async function makeMove(request: Request, response: Response): Promise<void> {
  const move = request.body?.move ?? request.body?.column;
  const game = await games.makeMove(routeId(request), request.body?.playerId, move, request.account?.id);
  response.json({ game });
}

export async function rematch(request: Request, response: Response): Promise<void> {
  const game = await games.rematch(routeId(request), request.body?.playerId, request.account?.id);
  response.json({ game });
}

export async function claimDraw(request: Request, response: Response): Promise<void> {
  const game = await games.claimChessDraw(routeId(request), request.body?.playerId, request.account?.id);
  response.json({ game });
}
