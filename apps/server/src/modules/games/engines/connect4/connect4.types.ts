export type Disc = 'red' | 'yellow';
export type Cell = Disc | null;
export type GameStatus = 'waiting' | 'in_progress' | 'finished';
export type ComputerDifficulty = 'easy' | 'medium' | 'hard';

export interface GamePlayer {
  id: string;
  name: string;
  disc: Disc;
  isComputer?: boolean;
}

export interface ConnectFourGame {
  gameType: 'connect4';
  id: string;
  status: GameStatus;
  difficulty?: ComputerDifficulty;
  board: Cell[];
  players: [GamePlayer, GamePlayer | null];
  currentTurn: Disc;
  winner: Disc | null;
  createdAt: string;
  updatedAt: string;
}
