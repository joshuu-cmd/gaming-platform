import { randomUUID } from 'node:crypto';
import { applyMove, chooseComputerMove, connectFourEngine, createEmptyBoard } from './engines/connect4/connect4.engine.js';
import { applyCheckersMove, checkersEngine, chooseCheckersMove, createCheckersBoard, legalMoves } from './engines/checkers/checkers.engine.js';
import { applyChessMove, chessEngine, chooseChessMove, claimableDrawReason, legalChessMoves, newChessGameState } from './engines/chess/chess.engine.js';
import { ConcurrentGameUpdateError, gameRepository } from './game.repository.js';
import type { CheckersDifficulty, CheckersGame, CheckersMove, ChessDifficulty, ChessGame, ChessMove, ChessPlayer, ComputerDifficulty, ConnectFourGame, Disc, GamePlayer, PlatformGame } from './game.types.js';

export class GameError extends Error {
  constructor(message: string, public readonly statusCode = 400) {
    super(message);
    this.name = 'GameError';
  }
}

function cleanName(value: unknown): string {
  if (typeof value !== 'string') throw new GameError('Enter a player name.');
  const name = value.trim();
  if (name.length < 1 || name.length > 24) throw new GameError('Player names must be between 1 and 24 characters.');
  return name;
}

function cleanDifficulty(value: unknown): ComputerDifficulty | CheckersDifficulty | ChessDifficulty {
  if (value === 'easy' || value === 'medium' || value === 'hard') return value;
  throw new GameError('Choose Easy, Medium, or Hard.');
}

function cleanGameType(value: unknown): 'connect4' | 'checkers' | 'chess' {
  if (value === undefined || value === 'connect4') return 'connect4';
  if (value === 'checkers') return value;
  if (value === 'chess') return value;
  throw new GameError('Choose Connect Four, Checkers, or Chess.');
}

function validId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

async function requireGame(id: string) {
  if (!validId(id)) throw new GameError('Game not found.', 404);
  const stored = await gameRepository.get(id);
  if (!stored) throw new GameError('Game not found.', 404);
  return stored;
}

async function persist(game: PlatformGame, expectedRevision: number): Promise<void> {
  try {
    await gameRepository.update(game, expectedRevision);
  } catch (error) {
    if (error instanceof ConcurrentGameUpdateError) throw new GameError('The game changed. Refresh and try again.', 409);
    throw error;
  }
}

function player(name: string, disc: Disc): GamePlayer {
  return { id: randomUUID(), name, disc };
}

export async function createGame(
  playerName: unknown,
  opponent: unknown = 'player',
  requestedDifficulty: unknown = 'medium',
  requestedGameType: unknown = 'connect4',
): Promise<{ game: PlatformGame; playerId: string }> {
  if (opponent !== 'player' && opponent !== 'computer') throw new GameError('Choose a player or computer opponent.');
  const gameType = cleanGameType(requestedGameType);
  const versusComputer = opponent === 'computer';
  const difficulty = versusComputer ? cleanDifficulty(requestedDifficulty) : undefined;
  const firstName = cleanName(playerName);
  const now = new Date().toISOString();
  const id = randomUUID();

  if (gameType === 'chess') return createChessGame(firstName, opponent, requestedDifficulty);

  if (gameType === 'connect4') {
    const first = { ...player(firstName, 'red'), disc: 'red' as const };
    const second = versusComputer ? { ...player('Computer', 'yellow'), disc: 'yellow' as const, isComputer: true } : null;
    const game: ConnectFourGame = {
      gameType, id, status: versusComputer ? 'in_progress' : 'waiting',
      ...(difficulty ? { difficulty: difficulty as ComputerDifficulty } : {}),
      board: createEmptyBoard(), players: [first, second], currentTurn: 'red', winner: null,
      createdAt: now, updatedAt: now,
    };
    await gameRepository.create(game);
    return { game, playerId: first.id };
  }

  const first = { id: randomUUID(), name: firstName, side: 'red' as const };
  const second = versusComputer ? { id: randomUUID(), name: 'Computer', side: 'black' as const, isComputer: true } : null;
  const game: CheckersGame = {
    gameType, id, status: versusComputer ? 'in_progress' : 'waiting',
    ...(difficulty ? { difficulty: difficulty as CheckersDifficulty } : {}),
    board: createCheckersBoard(), players: [first, second], currentTurn: 'red', winner: null,
    createdAt: now, updatedAt: now,
  };
  await gameRepository.create(game);
  return { game, playerId: first.id };
}

function chessPlayer(name: string, color: 'white' | 'black', isComputer = false): ChessPlayer {
  return { id: randomUUID(), name, color, ...(isComputer ? { isComputer: true } : {}) };
}

export async function createChessGame(playerName: unknown, opponent: 'player' | 'computer', difficulty: unknown): Promise<{ game: ChessGame; playerId: string }> {
  const state = newChessGameState();
  const first = chessPlayer(cleanName(playerName), 'white');
  const versusComputer = opponent === 'computer';
  const second = versusComputer ? chessPlayer('Computer', 'black', true) : null;
  const game: ChessGame = {
    ...state,
    gameType: 'chess',
    id: randomUUID(),
    ...(versusComputer ? { difficulty: cleanDifficulty(difficulty) as ChessDifficulty } : {}),
    players: [first, second],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await gameRepository.create(game);
  return { game, playerId: first.id };
}

export async function getGame(id: string): Promise<PlatformGame> {
  return (await requireGame(id)).game;
}

export async function getBoardLegalMoves(id: string, playerId: unknown): Promise<(CheckersMove | ChessMove)[]> {
  const { game } = await requireGame(id);
  if (game.gameType === 'connect4') throw new GameError('Move hints are only available for Checkers and Chess.', 400);
  if (typeof playerId !== 'string' || !game.players.some((player) => player?.id === playerId)) {
    throw new GameError('You are not a player in this game.', 403);
  }
  if (game.gameType === 'checkers') {
    if (checkersEngine.getCurrentPlayerId(game) !== playerId) throw new GameError('Wait for your turn.', 409);
    return legalMoves(game);
  }
  if (chessEngine.getCurrentPlayerId(game) !== playerId) throw new GameError('Wait for your turn.', 409);
  return legalChessMoves(game);
}

export async function claimChessDraw(id: string, playerId: unknown): Promise<ChessGame> {
  const stored = await requireGame(id);
  const game = stored.game;
  if (game.gameType !== 'chess') throw new GameError('Draw claims are only available in Chess.', 400);
  if (typeof playerId !== 'string' || !game.players.some((player) => player?.id === playerId)) {
    throw new GameError('You are not a player in this game.', 403);
  }
  if (game.status !== 'in_progress' || chessEngine.getCurrentPlayerId(game) !== playerId) {
    throw new GameError('Only the player to move can claim a draw.', 409);
  }
  const drawReason = claimableDrawReason(game);
  if (!drawReason) throw new GameError('This position does not meet a draw-claim rule.', 409);
  const updated: ChessGame = { ...game, status: 'finished', winner: null, drawReason, drawClaimAvailable: false, updatedAt: new Date().toISOString() };
  await persist(updated, stored.revision);
  return updated;
}

export async function joinGame(id: string, playerName: unknown): Promise<{ game: PlatformGame; playerId: string }> {
  const stored = await requireGame(id);
  const game = stored.game;
  if (game.status !== 'waiting' || game.players[1]) throw new GameError('This game already has two players.', 409);
  const name = cleanName(playerName);
  let updated: PlatformGame;
  let playerId: string;
  if (game.gameType === 'connect4') {
    const second = { id: randomUUID(), name, disc: 'yellow' as const };
    playerId = second.id;
    updated = { ...game, status: 'in_progress', players: [game.players[0], second], updatedAt: new Date().toISOString() };
  } else if (game.gameType === 'checkers') {
    const second = { id: randomUUID(), name, side: 'black' as const };
    playerId = second.id;
    updated = { ...game, status: 'in_progress', players: [game.players[0], second], updatedAt: new Date().toISOString() };
  } else {
    const second = chessPlayer(name, 'black');
    playerId = second.id;
    updated = { ...game, status: 'in_progress', players: [game.players[0], second], updatedAt: new Date().toISOString() };
  }
  await persist(updated, stored.revision);
  return { game: updated, playerId };
}

function validationError(code: string): GameError {
  switch (code) {
    case 'game_not_active': return new GameError('This game is not accepting moves.', 409);
    case 'player_not_in_game': return new GameError('You are not a player in this game.', 403);
    case 'not_players_turn': return new GameError('Wait for your turn.', 409);
    default: return new GameError('That is not a legal move.');
  }
}

export async function makeMove(id: string, playerId: unknown, move: unknown): Promise<PlatformGame> {
  const stored = await requireGame(id);
  const game = stored.game;
  if (typeof playerId !== 'string') throw new GameError('Choose a valid player and move.');

  let updated: PlatformGame | null;
  if (game.gameType === 'connect4') {
    const column = typeof move === 'number' ? move : (move as { column?: number } | null)?.column;
    if (typeof column !== 'number') throw new GameError('Choose a valid player and column.');
    const validation = connectFourEngine.validateMove(game, playerId, column);
    if (!validation.valid) throw validationError(validation.code);
    updated = applyMove(game, column);
  } else if (game.gameType === 'checkers') {
    const checkersMove = move as CheckersMove | null;
    if (!checkersMove || typeof checkersMove !== 'object') throw new GameError('Choose a valid player and move.');
    const validation = checkersEngine.validateMove(game, playerId, checkersMove);
    if (!validation.valid) throw validationError(validation.code);
    updated = applyCheckersMove(game, checkersMove);
  } else {
    const chessMove = move as ChessMove | null;
    if (!chessMove || typeof chessMove !== 'object') throw new GameError('Choose a valid player and move.');
    const validation = chessEngine.validateMove(game, playerId, chessMove);
    if (!validation.valid) throw validationError(validation.code);
    updated = applyChessMove(game, chessMove);
  }
  if (!updated) throw new GameError('That move is not legal.');

  if (updated.gameType === 'connect4') {
    let connectFourGame = updated;
    const computer = connectFourGame.players.find((candidate) => candidate?.isComputer && candidate.disc === connectFourGame.currentTurn);
    if (computer && connectFourGame.status === 'in_progress') {
      const column = chooseComputerMove(connectFourGame, computer.disc as Disc, connectFourGame.difficulty ?? 'medium');
      connectFourGame = applyMove(connectFourGame, column) ?? connectFourGame;
    }
    updated = connectFourGame;
  } else if (updated.gameType === 'checkers') {
    let checkersGame = updated;
    for (let turn = 0; turn < 12 && checkersGame.status === 'in_progress'; turn += 1) {
      const computer = checkersGame.players.find((candidate) => candidate?.isComputer && candidate?.side === checkersGame.currentTurn);
      if (!computer) break;
      const computerMove = chooseCheckersMove(checkersGame, checkersGame.difficulty ?? 'medium');
      if (!computerMove) break;
      checkersGame = applyCheckersMove(checkersGame, computerMove) ?? checkersGame;
      if (checkersGame.currentTurn !== computer.side) break;
    }
    updated = checkersGame;
  } else {
    let chessGame = updated;
    const computer = chessGame.players.find((candidate) => candidate?.isComputer && candidate.color === chessGame.currentTurn);
    if (computer && chessGame.status === 'in_progress') {
      const chessMove = chooseChessMove(chessGame, chessGame.difficulty ?? 'medium');
      if (chessMove) chessGame = applyChessMove(chessGame, chessMove) ?? chessGame;
    }
    updated = chessGame;
  }

  await persist(updated, stored.revision);
  return updated;
}

export async function rematch(id: string, playerId: unknown): Promise<PlatformGame> {
  const stored = await requireGame(id);
  const game = stored.game;
  const participant = game.players.find((candidate) => candidate?.id === playerId);
  if (!participant || participant.isComputer) throw new GameError('You are not a player in this game.', 403);
  if (game.status === 'in_progress') return game;
  if (game.status !== 'finished') throw new GameError('A rematch is available after the game ends.', 409);

  let updated: PlatformGame;
  if (game.gameType === 'connect4') {
    updated = { ...game, status: 'in_progress', board: createEmptyBoard(), currentTurn: 'red', winner: null, updatedAt: new Date().toISOString() };
  } else if (game.gameType === 'checkers') {
    updated = { ...game, status: 'in_progress', board: createCheckersBoard(), currentTurn: 'red', winner: null, forcedFrom: undefined, updatedAt: new Date().toISOString() };
  } else {
    updated = { ...game, ...newChessGameState(), gameType: 'chess', status: 'in_progress', updatedAt: new Date().toISOString() };
  }
  await persist(updated, stored.revision);
  return updated;
}
