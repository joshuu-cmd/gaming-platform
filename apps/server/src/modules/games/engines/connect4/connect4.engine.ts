import type { Cell, ComputerDifficulty, ConnectFourGame, Disc } from './connect4.types.js';
import type { GameEngine, MoveValidation } from '../../../../../../../packages/game-engines/index.js';

export const ROWS = 6;
export const COLUMNS = 7;

export function createEmptyBoard(): Cell[] {
  return Array.from({ length: ROWS * COLUMNS }, () => null);
}

export function findDropIndex(board: Cell[], column: number): number | null {
  if (!Number.isInteger(column) || column < 0 || column >= COLUMNS) return null;
  for (let row = ROWS - 1; row >= 0; row -= 1) {
    const index = row * COLUMNS + column;
    if (board[index] === null) return index;
  }
  return null;
}

export function hasFourInARow(board: Cell[], disc: Disc): boolean {
  const directions: Array<[number, number]> = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      if (board[row * COLUMNS + column] !== disc) continue;
      for (const [rowStep, columnStep] of directions) {
        let connected = 1;
        for (let offset = 1; offset < 4; offset += 1) {
          const nextRow = row + rowStep * offset;
          const nextColumn = column + columnStep * offset;
          if (
            nextRow < 0 || nextRow >= ROWS ||
            nextColumn < 0 || nextColumn >= COLUMNS ||
            board[nextRow * COLUMNS + nextColumn] !== disc
          ) break;
          connected += 1;
        }
        if (connected === 4) return true;
      }
    }
  }
  return false;
}

export function applyMove(game: ConnectFourGame, column: number): ConnectFourGame | null {
  const index = findDropIndex(game.board, column);
  if (index === null) return null;

  const board = [...game.board];
  board[index] = game.currentTurn;
  const won = hasFourInARow(board, game.currentTurn);
  const draw = !won && board.every((cell) => cell !== null);
  const nextDisc: Disc = game.currentTurn === 'red' ? 'yellow' : 'red';

  return {
    ...game,
    board,
    status: won || draw ? 'finished' : 'in_progress',
    winner: won ? game.currentTurn : null,
    currentTurn: won || draw ? game.currentTurn : nextDisc,
    updatedAt: new Date().toISOString(),
  };
}

export const connectFourEngine: GameEngine<ConnectFourGame, number> = {
  gameType: 'connect4',

  getCurrentPlayerId(game) {
    return game.players.find((player) => player?.disc === game.currentTurn)?.id ?? null;
  },

  validateMove(game, playerId, column): MoveValidation {
    if (game.status !== 'in_progress') return { valid: false, code: 'game_not_active' };
    if (!game.players.some((player) => player?.id === playerId)) {
      return { valid: false, code: 'player_not_in_game' };
    }
    if (this.getCurrentPlayerId(game) !== playerId) {
      return { valid: false, code: 'not_players_turn' };
    }
    if (findDropIndex(game.board, column) === null) {
      return { valid: false, code: 'illegal_move' };
    }
    return { valid: true };
  },

  applyMove,
  isFinished(game) {
    return game.status === 'finished';
  },
};

const searchOrder = [3, 2, 4, 1, 5, 0, 6];

function evaluateBoard(board: Cell[], computerDisc: Disc): number {
  const humanDisc: Disc = computerDisc === 'red' ? 'yellow' : 'red';
  let score = 0;

  for (let row = 0; row < ROWS; row += 1) {
    const center = board[row * COLUMNS + 3];
    if (center === computerDisc) score += 5;
    else if (center === humanDisc) score -= 5;
  }

  const scoreWindow = (window: Cell[]) => {
    const computerCount = window.filter((cell) => cell === computerDisc).length;
    const humanCount = window.filter((cell) => cell === humanDisc).length;
    if (computerCount > 0 && humanCount > 0) return 0;
    if (computerCount === 4) return 100_000;
    if (humanCount === 4) return -100_000;
    if (computerCount > 0) return [0, 2, 12, 60][computerCount];
    if (humanCount > 0) return -[0, 2, 14, 70][humanCount];
    return 0;
  };

  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      if (column <= COLUMNS - 4) {
        score += scoreWindow(Array.from({ length: 4 }, (_, offset) => board[row * COLUMNS + column + offset]));
      }
      if (row <= ROWS - 4) {
        score += scoreWindow(Array.from({ length: 4 }, (_, offset) => board[(row + offset) * COLUMNS + column]));
      }
      if (row <= ROWS - 4 && column <= COLUMNS - 4) {
        score += scoreWindow(Array.from({ length: 4 }, (_, offset) => board[(row + offset) * COLUMNS + column + offset]));
      }
      if (row <= ROWS - 4 && column >= 3) {
        score += scoreWindow(Array.from({ length: 4 }, (_, offset) => board[(row + offset) * COLUMNS + column - offset]));
      }
    }
  }
  return score;
}

function search(
  board: Cell[],
  depth: number,
  turn: Disc,
  computerDisc: Disc,
  lastMove: Disc | null,
  alpha: number,
  beta: number,
): number {
  if (lastMove && hasFourInARow(board, lastMove)) {
    return lastMove === computerDisc ? 100_000 + depth : -100_000 - depth;
  }
  if (depth === 0 || board.every((cell) => cell !== null)) return evaluateBoard(board, computerDisc);

  const maximizing = turn === computerDisc;
  let best = maximizing ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  for (const column of searchOrder) {
    const index = findDropIndex(board, column);
    if (index === null) continue;
    const nextBoard = [...board];
    nextBoard[index] = turn;
    const nextDisc: Disc = turn === 'red' ? 'yellow' : 'red';
    const score = search(nextBoard, depth - 1, nextDisc, computerDisc, turn, alpha, beta);
    if (maximizing) {
      best = Math.max(best, score);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, score);
      beta = Math.min(beta, best);
    }
    if (beta <= alpha) break;
  }
  return best;
}

export function chooseComputerMove(
  game: ConnectFourGame,
  computerDisc: Disc,
  difficulty: ComputerDifficulty,
): number {
  const humanDisc: Disc = computerDisc === 'red' ? 'yellow' : 'red';
  const availableColumns = searchOrder.filter((column) => findDropIndex(game.board, column) !== null);
  if (availableColumns.length === 0) return 3;

  if (difficulty === 'easy') {
    return availableColumns[Math.floor(Math.random() * availableColumns.length)];
  }

  for (const column of searchOrder) {
    const index = findDropIndex(game.board, column);
    if (index === null) continue;
    const board = [...game.board];
    board[index] = computerDisc;
    if (hasFourInARow(board, computerDisc)) return column;
  }

  for (const column of searchOrder) {
    const index = findDropIndex(game.board, column);
    if (index === null) continue;
    const board = [...game.board];
    board[index] = humanDisc;
    if (hasFourInARow(board, humanDisc)) return column;
  }

  let bestColumn = searchOrder[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  const depth = difficulty === 'medium' ? 2 : 6;
  for (const column of searchOrder) {
    const index = findDropIndex(game.board, column);
    if (index === null) continue;
    const board = [...game.board];
    board[index] = computerDisc;
    const score = search(board, depth, humanDisc, computerDisc, computerDisc, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY);
    if (score > bestScore) {
      bestScore = score;
      bestColumn = column;
    }
  }
  return bestColumn;
}
