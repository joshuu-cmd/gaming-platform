export type MoveValidationCode =
  | 'game_not_active'
  | 'player_not_in_game'
  | 'not_players_turn'
  | 'illegal_move';

export type MoveValidation =
  | { valid: true }
  | { valid: false; code: MoveValidationCode };

/** Common contract for game rules that can be hosted by the platform. */
export interface GameEngine<State, Move> {
  readonly gameType: string;
  getCurrentPlayerId(state: State): string | null;
  validateMove(state: State, playerId: string, move: Move): MoveValidation;
  applyMove(state: State, move: Move): State | null;
  isFinished(state: State): boolean;
}
