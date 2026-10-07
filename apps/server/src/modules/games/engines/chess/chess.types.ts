export type ChessColor = 'white' | 'black';
export type ChessPieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';
export type ChessDifficulty = 'easy' | 'medium' | 'hard';

export interface ChessPiece {
  color: ChessColor;
  type: ChessPieceType;
}

export interface ChessMove {
  from: number;
  to: number;
  promotion?: Exclude<ChessPieceType, 'pawn' | 'king'>;
}

export interface ChessPlayer {
  id: string;
  name: string;
  color: ChessColor;
  isComputer?: boolean;
}

export interface ChessGame {
  gameType: 'chess';
  id: string;
  status: 'waiting' | 'in_progress' | 'finished';
  difficulty?: ChessDifficulty;
  board: (ChessPiece | null)[];
  players: [ChessPlayer, ChessPlayer | null];
  currentTurn: ChessColor;
  winner: ChessColor | null;
  castling: { white: { kingSide: boolean; queenSide: boolean }; black: { kingSide: boolean; queenSide: boolean } };
  enPassantTarget: number | null;
  halfmoveClock: number;
  positionCounts: Record<string, number>;
  drawClaimAvailable: boolean;
  drawReason?: 'stalemate' | 'fifty_move' | 'seventy_five_move' | 'repetition' | 'insufficient_material';
  createdAt: string;
  updatedAt: string;
}
