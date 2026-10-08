export type LudoColor = 'red' | 'blue';
export type LudoDifficulty = 'easy' | 'medium' | 'hard';
export type LudoStatus = 'waiting' | 'in_progress' | 'finished';

export interface LudoPlayer {
  id: string;
  userId?: string;
  name: string;
  side: LudoColor;
  isComputer?: boolean;
}

export interface LudoGame {
  gameType: 'ludo';
  id: string;
  status: LudoStatus;
  closedBy?: { playerId: string; playerName: string };
  difficulty?: LudoDifficulty;
  players: [LudoPlayer, LudoPlayer | null];
  tokens: Record<LudoColor, number[]>;
  currentTurn: LudoColor;
  winner: LudoColor | null;
  dice: number | null;
  lastDice: number | null;
  lastRollNoMoves: boolean;
  legalTokens: number[];
  createdAt: string;
  updatedAt: string;
}

export type LudoAction = { action: 'roll' } | { action: 'move'; token: number };
