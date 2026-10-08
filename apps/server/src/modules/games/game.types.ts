export type { Cell, ComputerDifficulty, ConnectFourGame, Disc, GamePlayer, GameStatus } from './engines/connect4/connect4.types.js';
export type { CheckersCell, CheckersDifficulty, CheckersGame, CheckersMove, CheckersPlayer, CheckersSide } from './engines/checkers/checkers.types.js';
export type { ChessColor, ChessDifficulty, ChessGame, ChessMove, ChessPiece, ChessPieceType, ChessPlayer } from './engines/chess/chess.types.js';
export type { LudoAction, LudoColor, LudoDifficulty, LudoGame, LudoPlayer } from './engines/ludo/ludo.types.js';
import type { ConnectFourGame } from './engines/connect4/connect4.types.js';
import type { CheckersGame } from './engines/checkers/checkers.types.js';
import type { ChessGame } from './engines/chess/chess.types.js';
import type { LudoGame } from './engines/ludo/ludo.types.js';

export type PlatformGame = ConnectFourGame | CheckersGame | ChessGame | LudoGame;
