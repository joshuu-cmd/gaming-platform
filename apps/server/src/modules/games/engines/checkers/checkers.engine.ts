import type { GameEngine, MoveValidation } from '../../../../../../../packages/game-engines/index.js';
import type { CheckersCell, CheckersDifficulty, CheckersGame, CheckersMove, CheckersSide } from './checkers.types.js';

export const SIZE = 8;

export function createCheckersBoard(): CheckersCell[] {
  const board: CheckersCell[] = Array.from({ length: SIZE * SIZE }, () => null);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < SIZE; column += 1) {
      if ((row + column) % 2 === 1) board[row * SIZE + column] = { side: 'black', king: false };
    }
  }
  for (let row = 5; row < SIZE; row += 1) {
    for (let column = 0; column < SIZE; column += 1) {
      if ((row + column) % 2 === 1) board[row * SIZE + column] = { side: 'red', king: false };
    }
  }
  return board;
}

function sideDirections(side: CheckersSide, king: boolean): number[] {
  return king ? [-1, 1] : side === 'red' ? [-1] : [1];
}

function movesForPiece(board: CheckersCell[], from: number, capturesOnly = false): CheckersMove[] {
  const piece = board[from];
  if (!piece) return [];
  const row = Math.floor(from / SIZE);
  const column = from % SIZE;
  const moves: CheckersMove[] = [];
  for (const rowDirection of sideDirections(piece.side, piece.king)) {
    for (const columnDirection of [-1, 1]) {
      const nextRow = row + rowDirection;
      const nextColumn = column + columnDirection;
      const next = nextRow * SIZE + nextColumn;
      if (nextRow < 0 || nextRow >= SIZE || nextColumn < 0 || nextColumn >= SIZE) continue;
      const jumped = board[next];
      if (!jumped && !capturesOnly) moves.push({ from, to: next });
      if (jumped && jumped.side !== piece.side) {
        const landingRow = row + 2 * rowDirection;
        const landingColumn = column + 2 * columnDirection;
        if (landingRow >= 0 && landingRow < SIZE && landingColumn >= 0 && landingColumn < SIZE) {
          const landing = landingRow * SIZE + landingColumn;
          if (!board[landing]) moves.push({ from, to: landing });
        }
      }
    }
  }
  return moves;
}

export function legalMoves(game: Pick<CheckersGame, 'board' | 'currentTurn' | 'forcedFrom'>): CheckersMove[] {
  const pieces = game.forcedFrom === undefined
    ? game.board.flatMap((piece, index) => piece?.side === game.currentTurn ? [index] : [])
    : [game.forcedFrom];
  const all = pieces.flatMap((index) => movesForPiece(game.board, index));
  if (game.forcedFrom !== undefined) return all.filter((move) => Math.abs(move.to - move.from) === SIZE * 2 - 2 || Math.abs(move.to - move.from) === SIZE * 2 + 2);
  return all;
}

function hasPieces(board: CheckersCell[], side: CheckersSide): boolean {
  return board.some((piece) => piece?.side === side);
}

function finishIfBlocked(game: CheckersGame): CheckersGame {
  if (!hasPieces(game.board, game.currentTurn) || legalMoves(game).length === 0) {
    const winner = game.currentTurn === 'red' ? 'black' : 'red';
    return { ...game, status: 'finished', winner, forcedFrom: undefined };
  }
  return game;
}

export function applyCheckersMove(game: CheckersGame, move: CheckersMove): CheckersGame | null {
  if (!legalMoves(game).some((candidate) => candidate.from === move.from && candidate.to === move.to)) return null;
  const board = [...game.board];
  const piece = board[move.from];
  if (!piece) return null;
  board[move.from] = null;
  const jumpedIndex = (move.from + move.to) / 2;
  const isCapture = Math.abs(move.to - move.from) > SIZE + 1;
  if (isCapture) board[jumpedIndex] = null;
  const row = Math.floor(move.to / SIZE);
  const movedPiece = { ...piece, king: piece.king || (piece.side === 'red' ? row === 0 : row === SIZE - 1) };
  board[move.to] = movedPiece;
  const next: CheckersGame = { ...game, board, updatedAt: new Date().toISOString() };
  const justCrowned = !piece.king && movedPiece.king;
  if (isCapture && !justCrowned && movesForPiece(board, move.to, true).length > 0) {
    return { ...next, forcedFrom: move.to };
  }
  const currentTurn: CheckersSide = game.currentTurn === 'red' ? 'black' : 'red';
  return finishIfBlocked({ ...next, currentTurn, forcedFrom: undefined });
}

export const checkersEngine: GameEngine<CheckersGame, CheckersMove> = {
  gameType: 'checkers',
  getCurrentPlayerId(game) {
    return game.players.find((player) => player?.side === game.currentTurn)?.id ?? null;
  },
  validateMove(game, playerId, move): MoveValidation {
    if (game.status !== 'in_progress') return { valid: false, code: 'game_not_active' };
    if (!game.players.some((player) => player?.id === playerId)) return { valid: false, code: 'player_not_in_game' };
    if (this.getCurrentPlayerId(game) !== playerId) return { valid: false, code: 'not_players_turn' };
    if (!Number.isInteger(move.from) || !Number.isInteger(move.to) || !legalMoves(game).some((candidate) => candidate.from === move.from && candidate.to === move.to)) {
      return { valid: false, code: 'illegal_move' };
    }
    return { valid: true };
  },
  applyMove: applyCheckersMove,
  isFinished: (game) => game.status === 'finished',
};

function evaluate(game: CheckersGame, side: CheckersSide): number {
  const opponent = side === 'red' ? 'black' : 'red';
  let score = 0;
  for (let i = 0; i < game.board.length; i += 1) {
    const piece = game.board[i];
    if (!piece) continue;
    const advance = piece.side === 'red' ? 7 - Math.floor(i / SIZE) : Math.floor(i / SIZE);
    const value = (piece.king ? 175 : 100 + advance * 4);
    score += piece.side === side ? value : -value;
  }
  if (game.currentTurn === side && legalMoves(game).length === 0) score -= 10_000;
  if (game.currentTurn === opponent && legalMoves(game).length === 0) score += 10_000;
  return score;
}

function search(game: CheckersGame, depth: number, maximizingSide: CheckersSide, alpha: number, beta: number): number {
  const moves = legalMoves(game);
  if (depth === 0 || game.status === 'finished' || moves.length === 0) return evaluate(game, maximizingSide);
  const maximizing = game.currentTurn === maximizingSide;
  let best = maximizing ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  for (const move of moves) {
    const next = applyCheckersMove(game, move);
    if (!next) continue;
    const value = search(next, depth - 1, maximizingSide, alpha, beta);
    best = maximizing ? Math.max(best, value) : Math.min(best, value);
    if (maximizing) alpha = Math.max(alpha, best);
    else beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

export function chooseCheckersMove(game: CheckersGame, difficulty: CheckersDifficulty): CheckersMove | null {
  const moves = legalMoves(game);
  if (!moves.length) return null;
  if (difficulty === 'easy') return moves[Math.floor(Math.random() * moves.length)]!;
  if (difficulty === 'medium') {
    const captures = moves.filter((move) => Math.abs(move.to - move.from) > SIZE + 1);
    const candidates = captures.length ? captures : moves;
    return candidates[Math.floor(Math.random() * candidates.length)]!;
  }
  let best = moves[0]!;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const move of moves) {
    const next = applyCheckersMove(game, move);
    if (!next) continue;
    const score = search(next, 5, game.currentTurn, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY);
    if (score > bestScore) { bestScore = score; best = move; }
  }
  return best;
}
