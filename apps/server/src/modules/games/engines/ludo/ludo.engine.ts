import type { GameEngine, MoveValidation } from '../../../../../../../packages/game-engines/index.js';
import type { LudoAction, LudoColor, LudoDifficulty, LudoGame } from './ludo.types.js';
import { isLudoAction } from './ludo.validator.js';

export const TRACK_LENGTH = 52;
export const HOME_FINISH = 57;
const SAFE_SPACES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const oppositeSide = (side: LudoColor): LudoColor => side === 'red' ? 'blue' : 'red';
const startingSpace: Record<LudoColor, number> = { red: 0, blue: 26 };

export function newLudoGameState(): Pick<LudoGame, 'tokens' | 'currentTurn' | 'winner' | 'dice' | 'lastDice' | 'lastRollNoMoves' | 'legalTokens'> {
  return {
    tokens: { red: [-1, -1, -1, -1], blue: [-1, -1, -1, -1] },
    currentTurn: 'red',
    winner: null,
    dice: null,
    lastDice: null,
    lastRollNoMoves: false,
    legalTokens: [],
  };
}

export function trackSpace(side: LudoColor, progress: number): number | null {
  if (progress < 0 || progress >= TRACK_LENGTH) return null;
  return (startingSpace[side] + progress) % TRACK_LENGTH;
}

export function movableTokens(game: LudoGame, side: LudoColor, dice: number): number[] {
  return game.tokens[side].flatMap((progress, index) => {
    if (progress < 0) return dice === 6 ? [index] : [];
    return progress + dice <= HOME_FINISH ? [index] : [];
  });
}

export function rollLudoDice(game: LudoGame, value = Math.floor(Math.random() * 6) + 1): LudoGame | null {
  if (game.status !== 'in_progress' || game.dice !== null || !Number.isInteger(value) || value < 1 || value > 6) return null;
  const legalTokens = movableTokens(game, game.currentTurn, value);
  if (legalTokens.length === 0) {
    return {
      ...game,
      currentTurn: oppositeSide(game.currentTurn),
      dice: null,
      lastDice: value,
      lastRollNoMoves: true,
      legalTokens: [],
      updatedAt: new Date().toISOString(),
    };
  }
  return {
    ...game,
    dice: value,
    lastDice: value,
    lastRollNoMoves: false,
    legalTokens,
    updatedAt: new Date().toISOString(),
  };
}

export function moveLudoToken(game: LudoGame, token: number): LudoGame | null {
  if (game.status !== 'in_progress' || game.dice === null || !game.legalTokens.includes(token)) return null;
  const side = game.currentTurn;
  const opponent = oppositeSide(side);
  const oldProgress = game.tokens[side][token];
  if (oldProgress === undefined) return null;
  const progress = oldProgress < 0 ? 0 : oldProgress + game.dice;
  const tokens = { red: [...game.tokens.red], blue: [...game.tokens.blue] };
  tokens[side][token] = progress;

  const destination = trackSpace(side, progress);
  let captured = false;
  if (destination !== null && !SAFE_SPACES.has(destination)) {
    tokens[opponent] = tokens[opponent].map((opponentProgress) => {
      if (trackSpace(opponent, opponentProgress) !== destination) return opponentProgress;
      captured = true;
      return -1;
    });
  }

  const winner = tokens[side].every((tokenProgress) => tokenProgress === HOME_FINISH) ? side : null;
  return {
    ...game,
    tokens,
    status: winner ? 'finished' : 'in_progress',
    winner,
    currentTurn: winner || game.dice === 6 ? side : opponent,
    dice: null,
    lastRollNoMoves: false,
    legalTokens: [],
    updatedAt: new Date().toISOString(),
    ...(captured ? { lastDice: game.dice } : {}),
  };
}

export function applyLudoAction(game: LudoGame, action: LudoAction): LudoGame | null {
  return action.action === 'roll' ? rollLudoDice(game) : moveLudoToken(game, action.token);
}

function tokenValue(game: LudoGame, token: number, side: LudoColor, difficulty: LudoDifficulty): number {
  const progress = game.tokens[side][token];
  const nextProgress = progress < 0 ? 0 : progress + (game.dice ?? 0);
  if (nextProgress === HOME_FINISH) return 1000;
  let value = progress < 0 ? 18 : nextProgress * (difficulty === 'hard' ? 1.2 : 0.65);
  const destination = trackSpace(side, nextProgress);
  if (destination !== null && !SAFE_SPACES.has(destination)) {
    if (game.tokens[oppositeSide(side)].some((enemyProgress) => trackSpace(oppositeSide(side), enemyProgress) === destination)) value += 75;
  }
  if (destination !== null && SAFE_SPACES.has(destination)) value += 5;
  return value + Math.random() * (difficulty === 'hard' ? 0.1 : 8);
}

export function chooseLudoToken(game: LudoGame, difficulty: LudoDifficulty): number | null {
  if (game.legalTokens.length === 0) return null;
  if (difficulty === 'easy') return game.legalTokens[Math.floor(Math.random() * game.legalTokens.length)] ?? null;
  return game.legalTokens.reduce((best, token) => tokenValue(game, token, game.currentTurn, difficulty) > tokenValue(game, best, game.currentTurn, difficulty) ? token : best);
}

export const ludoEngine: GameEngine<LudoGame, LudoAction> = {
  gameType: 'ludo',
  getCurrentPlayerId(game) {
    return game.players.find((player) => player?.side === game.currentTurn)?.id ?? null;
  },
  validateMove(game, playerId, action): MoveValidation {
    if (game.status !== 'in_progress') return { valid: false, code: 'game_not_active' };
    if (!game.players.some((player) => player?.id === playerId)) return { valid: false, code: 'player_not_in_game' };
    if (this.getCurrentPlayerId(game) !== playerId) return { valid: false, code: 'not_players_turn' };
    if (!isLudoAction(action)) return { valid: false, code: 'illegal_move' };
    if (action.action === 'roll' && game.dice !== null) return { valid: false, code: 'illegal_move' };
    if (action.action === 'move' && (game.dice === null || !game.legalTokens.includes(action.token))) return { valid: false, code: 'illegal_move' };
    return { valid: true };
  },
  applyMove: applyLudoAction,
  isFinished: (game) => game.status === 'finished',
};
