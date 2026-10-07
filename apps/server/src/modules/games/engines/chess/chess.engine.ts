import type { GameEngine, MoveValidation } from '../../../../../../../packages/game-engines/index.js';
import type { ChessColor, ChessDifficulty, ChessGame, ChessMove, ChessPiece, ChessPieceType } from './chess.types.js';

const SIZE = 8;
const PROMOTIONS: ChessMove['promotion'][] = ['queen', 'rook', 'bishop', 'knight'];
const VALUES: Record<ChessPieceType, number> = { pawn: 100, knight: 320, bishop: 335, rook: 500, queen: 900, king: 20_000 };
const opposite = (color: ChessColor): ChessColor => color === 'white' ? 'black' : 'white';

export function createChessBoard(): (ChessPiece | null)[] {
  const board: (ChessPiece | null)[] = Array.from({ length: 64 }, () => null);
  const back: ChessPieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
  for (let column = 0; column < 8; column += 1) {
    board[column] = { color: 'black', type: back[column]! };
    board[8 + column] = { color: 'black', type: 'pawn' };
    board[48 + column] = { color: 'white', type: 'pawn' };
    board[56 + column] = { color: 'white', type: back[column]! };
  }
  return board;
}

const rowOf = (index: number) => Math.floor(index / SIZE);
const colOf = (index: number) => index % SIZE;
const inside = (row: number, col: number) => row >= 0 && row < SIZE && col >= 0 && col < SIZE;

function findKing(board: (ChessPiece | null)[], color: ChessColor): number {
  return board.findIndex((piece) => piece?.color === color && piece.type === 'king');
}

export function isSquareAttacked(board: (ChessPiece | null)[], target: number, by: ChessColor): boolean {
  const row = rowOf(target);
  const col = colOf(target);
  for (let from = 0; from < 64; from += 1) {
    const piece = board[from];
    if (!piece || piece.color !== by) continue;
    const sourceRow = rowOf(from);
    const sourceCol = colOf(from);
    const dr = row - sourceRow;
    const dc = col - sourceCol;
    if (piece.type === 'pawn') {
      if (dr === (by === 'white' ? -1 : 1) && Math.abs(dc) === 1) return true;
      continue;
    }
    if (piece.type === 'knight') {
      if ((Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2)) return true;
      continue;
    }
    if (piece.type === 'king') {
      if (Math.max(Math.abs(dr), Math.abs(dc)) === 1) return true;
      continue;
    }
    const diagonal = Math.abs(dr) === Math.abs(dc) && dr !== 0;
    const straight = (dr === 0) !== (dc === 0);
    if (!diagonal && !straight) continue;
    if (piece.type === 'bishop' && !diagonal) continue;
    if (piece.type === 'rook' && !straight) continue;
    if (piece.type === 'queen' && !diagonal && !straight) continue;
    const rowStep = Math.sign(dr);
    const colStep = Math.sign(dc);
    let pathClear = true;
    for (let r = sourceRow + rowStep, c = sourceCol + colStep; r !== row || c !== col; r += rowStep, c += colStep) {
      if (board[r * SIZE + c]) { pathClear = false; break; }
    }
    if (pathClear) return true;
  }
  return false;
}

function pseudoMoves(game: ChessGame): ChessMove[] {
  const moves: ChessMove[] = [];
  const board = game.board;
  const color = game.currentTurn;
  const enemy = opposite(color);
  const add = (from: number, row: number, col: number) => {
    if (!inside(row, col)) return;
    const to = row * SIZE + col;
    const target = board[to];
    if (target?.color === color || target?.type === 'king') return;
    const piece = board[from]!;
    if (piece.type === 'pawn' && (row === 0 || row === 7)) {
      for (const promotion of PROMOTIONS) moves.push({ from, to, promotion });
    } else moves.push({ from, to });
  };

  for (let from = 0; from < 64; from += 1) {
    const piece = board[from];
    if (!piece || piece.color !== color) continue;
    const row = rowOf(from);
    const col = colOf(from);
    if (piece.type === 'pawn') {
      const step = color === 'white' ? -1 : 1;
      const oneRow = row + step;
      if (inside(oneRow, col) && !board[oneRow * SIZE + col]) {
        add(from, oneRow, col);
        const twoRow = row + 2 * step;
        if (row === (color === 'white' ? 6 : 1) && !board[twoRow * SIZE + col]) add(from, twoRow, col);
      }
      for (const dc of [-1, 1]) {
        const captureRow = row + step;
        const captureCol = col + dc;
        if (!inside(captureRow, captureCol)) continue;
        const target = captureRow * SIZE + captureCol;
        if (board[target]?.color === enemy || game.enPassantTarget === target) add(from, captureRow, captureCol);
      }
      continue;
    }
    if (piece.type === 'knight' || piece.type === 'king') {
      const offsets = piece.type === 'knight'
        ? [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]
        : [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
      for (const [dr, dc] of offsets) add(from, row + dr!, col + dc!);
        if (piece.type === 'king' && !isSquareAttacked(board, from, enemy)) {
        const rights = game.castling[color];
        const homeRow = color === 'white' ? 7 : 0;
        if (row === homeRow && col === 4 && rights.kingSide && !board[homeRow * 8 + 5] && !board[homeRow * 8 + 6]
          && board[homeRow * 8 + 7]?.type === 'rook' && board[homeRow * 8 + 7]?.color === color
          && !isSquareAttacked(board, homeRow * 8 + 5, enemy) && !isSquareAttacked(board, homeRow * 8 + 6, enemy)) {
          moves.push({ from, to: homeRow * 8 + 6 });
        }
        if (row === homeRow && col === 4 && rights.queenSide && !board[homeRow * 8 + 1] && !board[homeRow * 8 + 2] && !board[homeRow * 8 + 3]
          && board[homeRow * 8]?.type === 'rook' && board[homeRow * 8]?.color === color
          && !isSquareAttacked(board, homeRow * 8 + 3, enemy) && !isSquareAttacked(board, homeRow * 8 + 2, enemy)) {
          moves.push({ from, to: homeRow * 8 + 2 });
        }
      }
      continue;
    }
    const directions = piece.type === 'bishop' ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
      : piece.type === 'rook' ? [[-1, 0], [1, 0], [0, -1], [0, 1]]
        : [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of directions) {
      for (let distance = 1; distance < 8; distance += 1) {
        const nextRow = row + dr! * distance;
        const nextCol = col + dc! * distance;
        if (!inside(nextRow, nextCol)) break;
        const target = board[nextRow * SIZE + nextCol];
        if (target?.color === color) break;
        add(from, nextRow, nextCol);
        if (target) break;
      }
    }
  }
  return moves;
}

export function legalChessMoves(game: ChessGame): ChessMove[] {
  const color = game.currentTurn;
  return pseudoMoves(game).filter((move) => {
    const nextBoard = [...game.board];
    const piece = nextBoard[move.from];
    if (!piece) return false;
    nextBoard[move.from] = null;
    if (piece.type === 'pawn' && move.to === game.enPassantTarget && !nextBoard[move.to] && colOf(move.from) !== colOf(move.to)) {
      nextBoard[move.to + (color === 'white' ? 8 : -8)] = null;
    }
    if (piece.type === 'king' && Math.abs(colOf(move.to) - colOf(move.from)) === 2) {
      const row = rowOf(move.from);
      const rookFrom = row * 8 + (move.to > move.from ? 7 : 0);
      const rookTo = row * 8 + (move.to > move.from ? 5 : 3);
      nextBoard[rookTo] = nextBoard[rookFrom];
      nextBoard[rookFrom] = null;
    }
    nextBoard[move.to] = piece.type === 'pawn' && move.promotion ? { color, type: move.promotion } : piece;
    const king = findKing(nextBoard, color);
    return king >= 0 && !isSquareAttacked(nextBoard, king, opposite(color));
  });
}

function positionKey(game: Pick<ChessGame, 'board' | 'currentTurn' | 'castling' | 'enPassantTarget'>): string {
  const pieceCodes: Record<ChessPieceType, string> = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };
  const boardKey = game.board.map((piece) => piece ? `${piece.color[0]}${pieceCodes[piece.type]}` : '--').join('');
  const rights = `${game.castling.white.kingSide ? 'K' : ''}${game.castling.white.queenSide ? 'Q' : ''}${game.castling.black.kingSide ? 'k' : ''}${game.castling.black.queenSide ? 'q' : ''}`;
  const epTarget = game.enPassantTarget !== null
    && legalChessMoves(game as ChessGame).some((move) => move.to === game.enPassantTarget && game.board[move.from]?.type === 'pawn')
    ? game.enPassantTarget : '-';
  return `${boardKey}|${game.currentTurn}|${rights || '-'}|${epTarget}`;
}

function insufficientMaterial(board: (ChessPiece | null)[]): boolean {
  const pieces = board.filter((piece): piece is ChessPiece => piece !== null);
  const nonKings = pieces.filter((piece) => piece.type !== 'king');
  if (nonKings.length === 0) return true;
  if (nonKings.length === 1 && ['bishop', 'knight'].includes(nonKings[0]!.type)) return true;
  if (nonKings.every((piece) => piece.type === 'bishop')) {
    const squareColors = pieces.filter((piece) => piece.type === 'bishop').map((piece) => {
      const index = board.indexOf(piece);
      return (rowOf(index) + colOf(index)) % 2;
    });
    return squareColors.every((color) => color === squareColors[0]);
  }
  return false;
}

export function applyChessMove(game: ChessGame, move: ChessMove): ChessGame | null {
  const legal = legalChessMoves(game).find((candidate) => candidate.from === move.from && candidate.to === move.to
    && (candidate.promotion === move.promotion || (candidate.promotion === 'queen' && move.promotion === undefined)));
  if (!legal) return null;
  const board = [...game.board];
  const piece = board[move.from]!;
  const captured = board[move.to];
  board[move.from] = null;
  if (piece.type === 'pawn' && move.to === game.enPassantTarget && !captured && colOf(move.from) !== colOf(move.to)) {
    board[move.to + (piece.color === 'white' ? 8 : -8)] = null;
  }
  if (piece.type === 'king' && Math.abs(colOf(move.to) - colOf(move.from)) === 2) {
    const row = rowOf(move.from);
    const rookFrom = row * 8 + (move.to > move.from ? 7 : 0);
    const rookTo = row * 8 + (move.to > move.from ? 5 : 3);
    board[rookTo] = board[rookFrom];
    board[rookFrom] = null;
  }
  board[move.to] = piece.type === 'pawn' && rowOf(move.to) === (piece.color === 'white' ? 0 : 7)
    ? { color: piece.color, type: move.promotion ?? 'queen' }
    : piece;

  const castling = {
    white: { ...game.castling.white },
    black: { ...game.castling.black },
  };
  if (piece.type === 'king') castling[piece.color] = { kingSide: false, queenSide: false };
  if (piece.type === 'rook') {
    if (move.from === 56) castling.white.queenSide = false;
    if (move.from === 63) castling.white.kingSide = false;
    if (move.from === 0) castling.black.queenSide = false;
    if (move.from === 7) castling.black.kingSide = false;
  }
  if (captured?.type === 'rook') {
    if (move.to === 56) castling.white.queenSide = false;
    if (move.to === 63) castling.white.kingSide = false;
    if (move.to === 0) castling.black.queenSide = false;
    if (move.to === 7) castling.black.kingSide = false;
  }
  const enPassantTarget = piece.type === 'pawn' && Math.abs(rowOf(move.to) - rowOf(move.from)) === 2
    ? (move.from + move.to) / 2 : null;
  const nextTurn = opposite(game.currentTurn);
  const next: ChessGame = {
    ...game,
    board,
    currentTurn: nextTurn,
    castling,
    enPassantTarget,
    halfmoveClock: piece.type === 'pawn' || captured ? 0 : game.halfmoveClock + 1,
    updatedAt: new Date().toISOString(),
  };
  const key = positionKey(next);
  next.positionCounts = { ...game.positionCounts, [key]: (game.positionCounts[key] ?? 0) + 1 };
  const repetitions = next.positionCounts[key]!;
  const replies = legalChessMoves(next);
  if (replies.length === 0) {
    if (isSquareAttacked(board, findKing(board, nextTurn), game.currentTurn)) return { ...next, status: 'finished', winner: game.currentTurn };
    return { ...next, status: 'finished', winner: null, drawReason: 'stalemate' };
  }
  if (next.halfmoveClock >= 150) return { ...next, status: 'finished', winner: null, drawReason: 'seventy_five_move' };
  if (repetitions >= 5) return { ...next, status: 'finished', winner: null, drawReason: 'repetition' };
  if (insufficientMaterial(board)) return { ...next, status: 'finished', winner: null, drawReason: 'insufficient_material' };
  return { ...next, drawClaimAvailable: next.halfmoveClock >= 100 || repetitions >= 3 };
}

export function claimableDrawReason(game: ChessGame): 'fifty_move' | 'repetition' | null {
  if (game.halfmoveClock >= 100) return 'fifty_move';
  if ((game.positionCounts[positionKey(game)] ?? 0) >= 3) return 'repetition';
  return null;
}

export const chessEngine: GameEngine<ChessGame, ChessMove> = {
  gameType: 'chess',
  getCurrentPlayerId(game) { return game.players.find((player) => player?.color === game.currentTurn)?.id ?? null; },
  validateMove(game, playerId, move): MoveValidation {
    if (game.status !== 'in_progress') return { valid: false, code: 'game_not_active' };
    if (!game.players.some((player) => player?.id === playerId)) return { valid: false, code: 'player_not_in_game' };
    if (this.getCurrentPlayerId(game) !== playerId) return { valid: false, code: 'not_players_turn' };
    if (!Number.isInteger(move.from) || !Number.isInteger(move.to) || !legalChessMoves(game).some((candidate) => candidate.from === move.from && candidate.to === move.to
      && (candidate.promotion === move.promotion || (candidate.promotion === 'queen' && move.promotion === undefined)))) {
      return { valid: false, code: 'illegal_move' };
    }
    return { valid: true };
  },
  applyMove: applyChessMove,
  isFinished: (game) => game.status === 'finished',
};

function evaluate(game: ChessGame, perspective: ChessColor): number {
  if (game.status === 'finished') return game.winner === perspective ? 100_000 : game.winner ? -100_000 : 0;
  let score = 0;
  for (let index = 0; index < 64; index += 1) {
    const piece = game.board[index];
    if (!piece) continue;
    const advance = piece.color === 'white' ? 6 - rowOf(index) : rowOf(index) - 1;
    const positional = piece.type === 'pawn' ? advance * 7 : piece.type === 'knight' || piece.type === 'bishop' ? (3.5 - Math.abs(3.5 - colOf(index))) * 4 : 0;
    score += (piece.color === perspective ? 1 : -1) * (VALUES[piece.type] + positional);
  }
  return score;
}

function search(game: ChessGame, depth: number, perspective: ChessColor, alpha: number, beta: number): number {
  const moves = legalChessMoves(game);
  if (depth === 0 || game.status === 'finished' || moves.length === 0) return evaluate(game, perspective);
  const maximizing = game.currentTurn === perspective;
  let best = maximizing ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  for (const move of moves) {
    const next = applyChessMove(game, move);
    if (!next) continue;
    const value = search(next, depth - 1, perspective, alpha, beta);
    best = maximizing ? Math.max(best, value) : Math.min(best, value);
    if (maximizing) alpha = Math.max(alpha, best);
    else beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

export function chooseChessMove(game: ChessGame, difficulty: ChessDifficulty): ChessMove | null {
  const moves = legalChessMoves(game);
  if (moves.length === 0) return null;
  if (difficulty === 'easy') return moves[Math.floor(Math.random() * moves.length)]!;
  if (difficulty === 'medium') {
    const captures = moves.filter((move) => game.board[move.to] !== null || (game.board[move.from]?.type === 'pawn' && move.to === game.enPassantTarget));
    const promotions = moves.filter((move) => move.promotion === 'queen');
    const choices = captures.length ? captures : promotions.length ? promotions : moves;
    return choices[Math.floor(Math.random() * choices.length)]!;
  }
  let choice = moves[0]!;
  let best = Number.NEGATIVE_INFINITY;
  for (const move of moves) {
    const next = applyChessMove(game, move);
    if (!next) continue;
    const score = search(next, 2, game.currentTurn, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY);
    if (score > best) { best = score; choice = move; }
  }
  return choice;
}

export function newChessGameState(): Pick<ChessGame, 'board' | 'currentTurn' | 'castling' | 'enPassantTarget' | 'halfmoveClock' | 'positionCounts' | 'drawClaimAvailable' | 'winner' | 'status'> {
  const game = {
    board: createChessBoard(),
    currentTurn: 'white' as const,
    castling: { white: { kingSide: true, queenSide: true }, black: { kingSide: true, queenSide: true } },
    enPassantTarget: null,
    halfmoveClock: 0,
    positionCounts: {} as Record<string, number>,
    drawClaimAvailable: false,
    winner: null,
    status: 'in_progress' as const,
  };
  game.positionCounts[positionKey(game)] = 1;
  return game;
}
