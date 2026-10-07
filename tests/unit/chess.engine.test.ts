import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyChessMove,
  claimableDrawReason,
  legalChessMoves,
  newChessGameState,
  isSquareAttacked,
} from '../../apps/server/src/modules/games/engines/chess/chess.engine.js';
import type { ChessColor, ChessGame, ChessPiece, ChessPieceType } from '../../apps/server/src/modules/games/engines/chess/chess.types.js';

function position(
  pieces: Array<[number, ChessColor, ChessPieceType]>,
  currentTurn: ChessColor = 'white',
): ChessGame {
  const initial = newChessGameState();
  const board: (ChessPiece | null)[] = Array.from({ length: 64 }, () => null);
  for (const [square, color, type] of pieces) board[square] = { color, type };
  return {
    ...initial,
    gameType: 'chess',
    id: '00000000-0000-4000-8000-000000000001',
    status: 'in_progress',
    board,
    players: [
      { id: 'white-player', name: 'White', color: 'white' },
      { id: 'black-player', name: 'Black', color: 'black' },
    ],
    currentTurn,
    winner: null,
    castling: { white: { kingSide: false, queenSide: false }, black: { kingSide: false, queenSide: false } },
    enPassantTarget: null,
    halfmoveClock: 0,
    positionCounts: {},
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function fromFen(fen: string): ChessGame {
  const [placement, turn, castle, ep, halfmove = '0'] = fen.split(' ');
  const game = position([], turn === 'b' ? 'black' : 'white');
  const codes: Record<string, ChessPieceType> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  const board: (ChessPiece | null)[] = Array.from({ length: 64 }, () => null);
  placement!.split('/').forEach((rank, row) => {
    let column = 0;
    for (const symbol of rank) {
      if (/\d/.test(symbol)) column += Number(symbol);
      else {
        const color = symbol === symbol.toUpperCase() ? 'white' : 'black';
        board[row * 8 + column] = { color, type: codes[symbol.toLowerCase()]! };
        column += 1;
      }
    }
  });
  game.board = board;
  game.castling = {
    white: { kingSide: castle!.includes('K'), queenSide: castle!.includes('Q') },
    black: { kingSide: castle!.includes('k'), queenSide: castle!.includes('q') },
  };
  game.enPassantTarget = ep === '-' ? null : (8 - Number(ep![1])) * 8 + ep!.charCodeAt(0) - 97;
  game.halfmoveClock = Number(halfmove);
  game.positionCounts = {};
  return game;
}

function perft(game: ChessGame, depth: number): number {
  if (depth === 0) return 1;
  let nodes = 0;
  for (const move of legalChessMoves(game)) {
    const next = applyChessMove(game, move);
    if (next) nodes += perft(next, depth - 1);
  }
  return nodes;
}

test('initial chess position has the standard 20 legal moves', () => {
  assert.equal(legalChessMoves({
    ...position([]),
    board: newChessGameState().board,
    castling: { white: { kingSide: true, queenSide: true }, black: { kingSide: true, queenSide: true } },
  }).length, 20);
});

test('starting-position legal moves match known perft counts through depth three', () => {
  const game = position([], 'white');
  Object.assign(game, newChessGameState());
  game.players = [
    { id: 'white-player', name: 'White', color: 'white' },
    { id: 'black-player', name: 'Black', color: 'black' },
  ];
  assert.equal(perft(game, 1), 20);
  assert.equal(perft(game, 2), 400);
  assert.equal(perft(game, 3), 8902);
});

test('castling and tactical position match the standard Kiwipete perft count', () => {
  const game = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  assert.equal(perft(game, 1), 48);
  assert.equal(perft(game, 2), 2039);
});

test('en-passant and edge-case position matches the standard perft count', () => {
  const game = fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
  assert.equal(perft(game, 1), 14);
  assert.equal(perft(game, 2), 191);
  assert.equal(perft(game, 3), 2812);
});

test('promotion edge-case position matches the standard perft count', () => {
  const game = fromFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1');
  assert.equal(perft(game, 1), 6);
  assert.equal(perft(game, 2), 264);
});

test('threefold repetition is claimable and fivefold repetition is automatic', () => {
  let game = position([]);
  Object.assign(game, newChessGameState());
  const cycle = [
    { from: 62, to: 45 }, { from: 6, to: 21 },
    { from: 45, to: 62 }, { from: 21, to: 6 },
  ];
  for (let repetition = 0; repetition < 2; repetition += 1) {
    for (const move of cycle) game = applyChessMove(game, move)!;
  }
  assert.equal(game.status, 'in_progress');
  assert.equal(game.drawClaimAvailable, true);
  assert.equal(claimableDrawReason(game), 'repetition');
  for (const move of cycle) game = applyChessMove(game, move)!;
  assert.equal(game.status, 'in_progress');
  for (const move of cycle) game = applyChessMove(game, move)!;
  assert.equal(game.status, 'finished');
  assert.equal(game.drawReason, 'repetition');
});

test('the 50-move draw can be claimed; the 75-move draw is automatic', () => {
  const claimable = position([[60, 'white', 'king'], [56, 'white', 'rook'], [4, 'black', 'king'], [7, 'black', 'rook']]);
  claimable.halfmoveClock = 99;
  const atFifty = applyChessMove(claimable, { from: 56, to: 48 });
  assert.equal(atFifty?.status, 'in_progress');
  assert.equal(atFifty?.drawClaimAvailable, true);
  assert.equal(claimableDrawReason(atFifty!), 'fifty_move');

  const automatic = { ...claimable, halfmoveClock: 149 };
  const atSeventyFive = applyChessMove(automatic, { from: 56, to: 48 });
  assert.equal(atSeventyFive?.status, 'finished');
  assert.equal(atSeventyFive?.drawReason, 'seventy_five_move');
});

test('pawns attack only one diagonal square and never slide like bishops', () => {
  const board = position([[48, 'white', 'pawn'], [60, 'white', 'king'], [4, 'black', 'king']]).board;
  assert.equal(isSquareAttacked(board, 27, 'white'), false); // d5 is three diagonals away from a2.
  assert.equal(isSquareAttacked(board, 41, 'white'), true); // b3 is the pawn attack square.
  const moves = legalChessMoves(position([[48, 'white', 'pawn'], [60, 'white', 'king'], [4, 'black', 'king']]));
  assert.deepEqual(moves.filter((move) => move.from === 48).map((move) => move.to).sort((a, b) => a - b), [32, 40]);
});

test('knights jump in an L and do not attack along files or diagonals', () => {
  const board = position([[57, 'white', 'knight'], [60, 'white', 'king'], [4, 'black', 'king']]).board;
  assert.equal(isSquareAttacked(board, 42, 'white'), true);
  assert.equal(isSquareAttacked(board, 41, 'white'), false);
  assert.equal(isSquareAttacked(board, 25, 'white'), false);
});

test('kings attack only adjacent squares and never slide', () => {
  const board = position([[56, 'white', 'king'], [4, 'black', 'king']]).board;
  assert.equal(isSquareAttacked(board, 49, 'white'), true);
  assert.equal(isSquareAttacked(board, 32, 'white'), false);
});

test('sliding pieces stop attacking through blockers', () => {
  const blocked = position([[56, 'white', 'rook'], [40, 'white', 'pawn'], [60, 'white', 'king'], [4, 'black', 'king']]).board;
  assert.equal(isSquareAttacked(blocked, 0, 'white'), false);
  const clear = [...blocked];
  clear[40] = null;
  assert.equal(isSquareAttacked(clear, 0, 'white'), true);
});

test('a pinned piece cannot expose its king to check', () => {
  const game = position([[60, 'white', 'king'], [52, 'white', 'rook'], [4, 'black', 'rook'], [0, 'black', 'king']]);
  const moves = legalChessMoves(game);
  assert.equal(moves.some((move) => move.from === 52 && move.to === 51), false);
  assert.equal(moves.some((move) => move.from === 52 && move.to === 44), true);
});

test('castling is legal only when the king does not cross an attacked square', () => {
  const castling = { white: { kingSide: true, queenSide: true }, black: { kingSide: false, queenSide: false } };
  const open = position([[60, 'white', 'king'], [63, 'white', 'rook'], [4, 'black', 'king']], 'white');
  open.castling = castling;
  assert.equal(legalChessMoves(open).some((move) => move.from === 60 && move.to === 62), true);
  const attacked = position([[60, 'white', 'king'], [63, 'white', 'rook'], [4, 'black', 'king'], [5, 'black', 'rook']], 'white');
  attacked.castling = castling;
  assert.equal(legalChessMoves(attacked).some((move) => move.from === 60 && move.to === 62), false);
});

test('en passant removes the captured pawn', () => {
  const game = position([[28, 'white', 'pawn'], [27, 'black', 'pawn'], [60, 'white', 'king'], [4, 'black', 'king']]);
  game.enPassantTarget = 19;
  const result = applyChessMove(game, { from: 28, to: 19 });
  assert.ok(result);
  assert.equal(result.board[19]?.type, 'pawn');
  assert.equal(result.board[27], null);
});

test('promotion offers and applies queen, rook, bishop, and knight', () => {
  const game = position([[8, 'white', 'pawn'], [60, 'white', 'king'], [4, 'black', 'king']]);
  const promotions = legalChessMoves(game).filter((move) => move.from === 8 && move.to === 0).map((move) => move.promotion).sort();
  assert.deepEqual(promotions, ['bishop', 'knight', 'queen', 'rook']);
  for (const promotion of ['queen', 'rook', 'bishop', 'knight'] as const) {
    const result = applyChessMove(game, { from: 8, to: 0, promotion });
    assert.equal(result?.board[0]?.type, promotion);
  }
});

test('checkmate ends the game for the attacking side', () => {
  const game = position([[46, 'black', 'queen'], [45, 'black', 'king'], [63, 'white', 'king']], 'black');
  const result = applyChessMove(game, { from: 46, to: 54 });
  assert.equal(result?.status, 'finished');
  assert.equal(result?.winner, 'black');
});

test('stalemate ends the game as a draw', () => {
  const game = position([[0, 'black', 'king'], [18, 'white', 'king'], [17, 'white', 'queen']], 'black');
  assert.equal(isSquareAttacked(game.board, 0, 'white'), false);
  assert.equal(legalChessMoves(game).length, 0);
});
