import type { LudoAction } from './ludo.types.js';

export function isLudoAction(value: unknown): value is LudoAction {
  if (!value || typeof value !== 'object') return false;
  const action = value as Record<string, unknown>;
  if (action.action === 'roll') return true;
  return action.action === 'move' && Number.isInteger(action.token);
}
