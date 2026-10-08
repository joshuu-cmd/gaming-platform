export type CheckersSide = 'red' | 'black';
export type CheckersStatus = 'waiting' | 'in_progress' | 'finished';
export type CheckersDifficulty = 'easy' | 'medium' | 'hard';

export interface CheckersPiece {
  side: CheckersSide;
  king: boolean;
}

export type CheckersCell = CheckersPiece | null;

export interface CheckersPlayer {
  id: string;
  userId?: string;
  name: string;
  side: CheckersSide;
  isComputer?: boolean;
}

export interface CheckersMove {
  from: number;
  to: number;
}

export interface CheckersGame {
  gameType: 'checkers';
  id: string;
  status: CheckersStatus;
  closedBy?: { playerId: string; playerName: string };
  difficulty?: CheckersDifficulty;
  board: CheckersCell[];
  players: [CheckersPlayer, CheckersPlayer | null];
  currentTurn: CheckersSide;
  winner: CheckersSide | null;
  forcedFrom?: number;
  createdAt: string;
  updatedAt: string;
}
