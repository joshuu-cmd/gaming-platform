import { useEffect, useRef, useState, type FormEvent } from 'react';
import ChessPieceGlyph from './ChessPieceGlyph';
import LudoBoard from './LudoBoard';
import './app.css';

type Difficulty = 'easy' | 'medium' | 'hard';
type Disc = 'red' | 'yellow';
type RoomClosure = { playerId: string; playerName: string };
type Player = { id: string; name: string; disc?: Disc; side?: 'red' | 'black' | 'blue'; color?: 'white' | 'black'; isComputer?: boolean };
type GameStatus = 'waiting' | 'in_progress' | 'finished';
type ConnectFourGame = {
  gameType: 'connect4';
  id: string;
  status: GameStatus;
  closedBy?: RoomClosure;
  difficulty?: Difficulty;
  board: (Disc | null)[];
  players: [Player, Player | null];
  currentTurn: 'red' | 'yellow';
  winner: 'red' | 'yellow' | null;
};
type CheckersGame = {
  gameType: 'checkers';
  id: string;
  status: GameStatus;
  closedBy?: RoomClosure;
  difficulty?: Difficulty;
  board: ({ side: 'red' | 'black'; king: boolean } | null)[];
  players: [Player, Player | null];
  currentTurn: 'red' | 'black';
  winner: 'red' | 'black' | null;
  forcedFrom?: number;
};
type ChessPiece = { color: 'white' | 'black'; type: 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king' };
type ChessGame = {
  gameType: 'chess';
  id: string;
  status: GameStatus;
  closedBy?: RoomClosure;
  difficulty?: Difficulty;
  board: (ChessPiece | null)[];
  players: [Player, Player | null];
  currentTurn: 'white' | 'black';
  winner: 'white' | 'black' | null;
  castling: {
    white: {
      kingSide: boolean;
      queenSide: boolean;
    };
    black: {
      kingSide: boolean;
      queenSide: boolean;
    };
  };
  enPassantTarget: number | null;
  halfmoveClock: number;
  positionCounts: Record<string, number>;
  drawClaimAvailable: boolean;
  drawReason?:
    | 'stalemate'
    | 'fifty_move'
    | 'seventy_five_move'
    | 'repetition'
    | 'insufficient_material';
};
type LudoColor = 'red' | 'blue';
type LudoGame = {
  gameType: 'ludo';
  id: string;
  status: GameStatus;
  closedBy?: RoomClosure;
  difficulty?: Difficulty;
  players: [Player, Player | null];
  tokens: Record<LudoColor, number[]>;
  currentTurn: LudoColor;
  winner: LudoColor | null;
  dice: number | null;
  lastDice: number | null;
  lastRollNoMoves: boolean;
  legalTokens: number[];
};
type Game = ConnectFourGame | CheckersGame | ChessGame | LudoGame;
type GameType = Game['gameType'];
type LastMove = { gameId: string; from: number; to: number };
type MoveSound = 'move' | 'capture' | 'roll' | 'win' | 'loss' | 'draw';
type MatchResult = 'win' | 'loss' | 'draw';
type BoardMoveHint = { from: number; to: number };
type PendingChessMove = { gameId: string; from: number; to: number; promotion: ChessPiece['type'] };

function previewChessMove(game: ChessGame, move: PendingChessMove): (ChessPiece | null)[] {
  const board = [...game.board];
  const piece = board[move.from];
  if (!piece) return board;
  board[move.from] = null;
  if (piece.type === 'pawn' && move.to === game.enPassantTarget && !board[move.to]
    && move.from % 8 !== move.to % 8) {
    board[move.to + (piece.color === 'white' ? 8 : -8)] = null;
  }
  if (piece.type === 'king' && Math.abs((move.to % 8) - (move.from % 8)) === 2) {
    const rookFrom = Math.floor(move.from / 8) * 8 + (move.to > move.from ? 7 : 0);
    const rookTo = Math.floor(move.from / 8) * 8 + (move.to > move.from ? 5 : 3);
    board[rookTo] = board[rookFrom];
    board[rookFrom] = null;
  }
  board[move.to] = piece.type === 'pawn' && (Math.floor(move.to / 8) === 0 || Math.floor(move.to / 8) === 7)
    ? { color: piece.color, type: move.promotion }
    : piece;
  return board;
}

function CrownIcon() {
  return <svg viewBox="0 0 24 20" aria-hidden="true" focusable="false">
    <path d="M2 5.5 7 10l5-8 5 8 5-4.5-2 12H4L2 5.5Z" fill="currentColor" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.5" />
    <path d="M4.2 15.2h15.6" fill="none" stroke="#fffdf6" strokeLinecap="round" strokeWidth="1.2" />
  </svg>;
}

let moveAudioContext: AudioContext | null = null;
let moveAudioUnlocked = false;

function prepareMoveAudio(): void {
  try {
    moveAudioContext ??= new window.AudioContext();
    moveAudioUnlocked = true;
    if (moveAudioContext.state === 'suspended') void moveAudioContext.resume().catch(() => undefined);
  } catch {
    // Sound is optional; unsupported browsers can still play normally.
  }
}

function playMoveSound(kind: MoveSound): void {
  try {
    prepareMoveAudio();
    const context = moveAudioContext;
    if (!context) return;
    const notes = kind === 'capture' ? [235, 175]
      : kind === 'roll' ? [520, 390]
      : kind === 'win' ? [523, 659, 784, 1047]
        : kind === 'loss' ? [330, 262, 196]
          : kind === 'draw' ? [392, 349, 392] : [360];
    const start = context.currentTime;
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const volume = context.createGain();
      const noteStart = start + index * 0.075;
      const duration = ['win', 'loss', 'draw'].includes(kind) ? 0.2 : 0.12;
      oscillator.type = kind === 'capture' || kind === 'loss' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, noteStart);
      volume.gain.setValueAtTime(0.0001, noteStart);
      volume.gain.exponentialRampToValueAtTime(
        kind === 'win' ? 0.28 : kind === 'loss' ? 0.26 : kind === 'draw' ? 0.25
          : kind === 'capture' ? 0.42 : kind === 'roll' ? 0.36 : 0.34,
        noteStart + 0.012,
      );
      volume.gain.exponentialRampToValueAtTime(0.0001, noteStart + duration);
      oscillator.connect(volume);
      volume.connect(context.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteStart + duration);
    });
  } catch {
    // Sound is optional; unsupported browsers can still play normally.
  }
}

function inferLastMove(previous: Game, current: Game): LastMove | null {
  if (previous.id !== current.id || previous.gameType !== current.gameType) return null;
  if (current.gameType === 'connect4' && previous.gameType === 'connect4') {
    const to = current.board.findIndex((piece, index) => !previous.board[index] && Boolean(piece));
    return to < 0 ? null : { gameId: current.id, from: to, to };
  }

  if (current.gameType === 'checkers' && previous.gameType === 'checkers') {
    const changedTo = current.board
      .map((piece, index) => ({ piece, index, before: previous.board[index] }))
      .filter(({ piece, before }) => piece && JSON.stringify(piece) !== JSON.stringify(before));
    const destination = changedTo.find(({ piece }) => piece?.king) ?? changedTo[0];
    if (!destination?.piece) return null;
    const source = previous.board.findIndex((piece, index) => piece?.side === destination.piece?.side && !current.board[index]);
    return source < 0 ? null : { gameId: current.id, from: source, to: destination.index };
  }

  if (current.gameType === 'chess' && previous.gameType === 'chess') {
    const changedTo = current.board
      .map((piece, index) => ({ piece, index, before: previous.board[index] }))
      .filter(({ piece, before }) => piece && JSON.stringify(piece) !== JSON.stringify(before));
    const destination = changedTo.find(({ piece }) => piece?.type === 'king') ?? changedTo[0];
    if (!destination?.piece) return null;
    const sourceCandidates = previous.board
      .map((piece, index) => ({ piece, index }))
      .filter(({ piece, index }) => piece?.color === destination.piece?.color && !current.board[index]);
    const source = (sourceCandidates.find(({ piece }) => piece?.type === destination.piece?.type)
      ?? sourceCandidates.find(({ piece }) => piece?.type === 'pawn')
      ?? sourceCandidates[0])?.index ?? -1;
    return source < 0 ? null : { gameId: current.id, from: source, to: destination.index };
  }
  return null;
}

function playerSide(player: Player | null | undefined): string | undefined {
  return player?.disc ?? player?.side ?? player?.color;
}

function gamePieceCount(game: Game): number {
  if (game.gameType === 'ludo') return game.tokens.red.filter((progress) => progress >= 0).length + game.tokens.blue.filter((progress) => progress >= 0).length;
  return game.board.filter(Boolean).length;
}

function resultSound(game: Game, currentPlayerId: string | null): Exclude<MoveSound, 'move' | 'capture'> {
  if (!game.winner) return 'draw';
  const currentPlayer = game.players.find((player) => player?.id === currentPlayerId);
  return currentPlayer && playerSide(currentPlayer) === game.winner ? 'win' : 'loss';
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  const body = await response.text();
  let result: unknown;
  if (body.trim()) {
    try {
      result = JSON.parse(body);
    } catch {
      throw new Error(`The server returned an invalid response (HTTP ${response.status}).`);
    }
  } else if (response.ok) {
    throw new Error('The server returned an empty response. Please try again.');
  }

  if (!response.ok) {
    const message = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
      ? result.error
      : `Request failed (HTTP ${response.status}).`;
    throw new Error(message);
  }
  return result as T;
}

function setGameInUrl(id: string | null): void {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('game', id);
  else url.searchParams.delete('game');
  window.history.replaceState({}, '', url);
}

export default function App() {
  const [playerName, setPlayerName] = useState('Player');
  const [selectedGame, setSelectedGame] = useState<GameType>('connect4');
  const [roomCode, setRoomCode] = useState(() => new URLSearchParams(window.location.search).get('game') ?? '');
  const [game, setGame] = useState<Game | null>(null);
  const [playerId, setPlayerId] = useState(() => {
    const id = new URLSearchParams(window.location.search).get('game');
    return id ? window.sessionStorage.getItem(`player:${id}`) : null;
  });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<number | null>(null);
  const [legalTargets, setLegalTargets] = useState<number[]>([]);
  const [availableMoves, setAvailableMoves] = useState<BoardMoveHint[]>([]);
  const [optimisticGame, setOptimisticGame] = useState<Game | null>(null);
  const [pendingChessMove, setPendingChessMove] = useState<PendingChessMove | null>(null);
  const [promotionSquare, setPromotionSquare] = useState<number | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(() => window.localStorage.getItem('move-sounds') !== 'off');
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const [dismissedResultGameId, setDismissedResultGameId] = useState<string | null>(null);
  const previousGameRef = useRef<Game | null>(null);
  const moveHintsPositionKey = game?.gameType === 'chess'
    ? `${game.board.map((piece) => piece ? `${piece.color}:${piece.type}` : '-').join('|')}:${JSON.stringify(game.castling)}:${game.enPassantTarget}`
    : game?.gameType === 'checkers'
      ? `${game.forcedFrom ?? ''}:${game.board.map((piece) => piece ? `${piece.side[0]}${piece.king ? 'k' : 'm'}` : '-').join('')}`
      : '';

  useEffect(() => {
    if (!game) {
      previousGameRef.current = null;
      setLastMove(null);
      return;
    }
    const previous = previousGameRef.current;
    if (previous?.id !== game.id) {
      setLastMove(null);
    } else if (previous) {
      const move = inferLastMove(previous, game);
      if (move) {
        setLastMove(move);
        if (soundEnabled) {
          const previousPieceCount = gamePieceCount(previous);
          const currentPieceCount = gamePieceCount(game);
          const sound: MoveSound = game.status === 'finished'
            ? resultSound(game, playerId)
            : currentPieceCount < previousPieceCount ? 'capture' : 'move';
          playMoveSound(sound);
        }
      } else if (previous.status !== 'finished' && game.status === 'finished' && soundEnabled) {
        playMoveSound(resultSound(game, playerId));
      } else if (previous.gameType === 'ludo' && game.gameType === 'ludo'
        && JSON.stringify(previous.tokens) !== JSON.stringify(game.tokens) && soundEnabled) {
        playMoveSound('move');
      }
    }
    if (game.closedBy && game.closedBy.playerId !== playerId
      && (previous?.id !== game.id || previous.closedBy?.playerId !== game.closedBy.playerId)) {
      setNotice(`${game.closedBy.playerName} left the room. The match is closed.`);
    }
    previousGameRef.current = game;
  }, [game, playerId, soundEnabled]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('game');
    if (!id) return;
    request<{ game: Game }>(`/api/games/${encodeURIComponent(id)}`)
      .then(({ game: latest }) => { setGame(latest); setSelectedGame(latest.gameType); })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  useEffect(() => {
    if (!game || game.closedBy) return;
    const timer = window.setInterval(() => {
      request<{ game: Game }>(`/api/games/${encodeURIComponent(game.id)}`)
        .then(({ game: latest }) => { if (!busy) setGame(latest); })
        .catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [game?.id, game?.closedBy?.playerId, busy]);

  useEffect(() => {
    if (!game || (game.gameType !== 'chess' && game.gameType !== 'checkers')
      || game.status !== 'in_progress' || !playerId) {
      setAvailableMoves([]);
      return;
    }
    const currentPlayer = game.players.find((player) => player?.id === playerId);
    if (playerSide(currentPlayer) !== game.currentTurn) {
      setAvailableMoves([]);
      return;
    }
    let active = true;
    request<{ moves: BoardMoveHint[] }>(
      `/api/games/${encodeURIComponent(game.id)}/legal-moves?playerId=${encodeURIComponent(playerId)}`,
    ).then(({ moves }) => {
      if (active) setAvailableMoves(moves);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [game?.id, game?.gameType, game?.status, game?.currentTurn, moveHintsPositionKey, playerId]);

  useEffect(() => {
    if (selectedSquare === null) return;
    setLegalTargets(availableMoves.filter((move) => move.from === selectedSquare).map((move) => move.to));
  }, [availableMoves, selectedSquare]);

  async function createGame(opponent: 'player' | 'computer', difficulty?: Difficulty, gameType = selectedGame) {
    prepareMoveAudio();
    setBusy(true);
    setError('');
    try {
      const result = await request<{ game: Game; playerId: string }>('/api/games', {
        method: 'POST',
        body: JSON.stringify({ playerName, opponent, gameType, ...(difficulty ? { difficulty } : {}) }),
      });
      window.sessionStorage.setItem(`player:${result.game.id}`, result.playerId);
      setPlayerId(result.playerId);
      setGame(result.game);
      setSelectedSquare(null);
      setAvailableMoves([]);
      setLegalTargets([]);
      setPromotionSquare(null);
      setDismissedResultGameId(null);
      setRoomCode(result.game.id);
      setGameInUrl(result.game.id);
      setNotice(opponent === 'computer'
        ? `Started a game against the computer on ${difficulty ?? 'medium'} difficulty.`
        : 'Room created. Share the invite code with another player.');
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function joinGame(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    prepareMoveAudio();
    setBusy(true);
    setError('');
    try {
      const result = await request<{ game: Game; playerId: string }>(
        `/api/games/${encodeURIComponent(roomCode.trim())}/join`,
        { method: 'POST', body: JSON.stringify({ playerName }) },
      );
      window.sessionStorage.setItem(`player:${result.game.id}`, result.playerId);
      setPlayerId(result.playerId);
      setGame(result.game);
      setSelectedSquare(null);
      setAvailableMoves([]);
      setLegalTargets([]);
      setPromotionSquare(null);
      setGameInUrl(result.game.id);
      setNotice('You joined the game. Red moves first.');
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function dropDisc(column: number) {
    if (!game || game.gameType !== 'connect4' || !playerId || busy) return;
    const landingIndex = Array.from({ length: 6 }, (_, row) => (5 - row) * 7 + column)
      .find((index) => game.board[index] === null);
    if (landingIndex === undefined) return;
    const previewBoard = [...game.board];
    previewBoard[landingIndex] = game.currentTurn;
    setOptimisticGame({ ...game, board: previewBoard });
    prepareMoveAudio();
    setError('');
    setBusy(true);
    try {
      const result = await request<{ game: Game }>(`/api/games/${game.id}/moves`, {
        method: 'POST',
        body: JSON.stringify({ playerId, column }),
      });
      const computerEndsGame = game.players[1]?.isComputer && result.game.status === 'finished' && result.game.winner === 'yellow';
      if (computerEndsGame) {
        await new Promise((resolve) => window.setTimeout(resolve, 750));
      }
      setGame(result.game);
      setOptimisticGame(null);
    } catch (reason) {
      setOptimisticGame(null);
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function rollLudoDice() {
    if (!game || game.gameType !== 'ludo' || !playerId || busy) return;
    prepareMoveAudio();
    setError('');
    setBusy(true);
    try {
      const result = await request<{ game: Game }>(`/api/games/${encodeURIComponent(game.id)}/moves`, {
        method: 'POST',
        body: JSON.stringify({ playerId, move: { action: 'roll' } }),
      });
      if (soundEnabled) playMoveSound('roll');
      setGame(result.game);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function moveLudoToken(token: number) {
    if (!game || game.gameType !== 'ludo' || !playerId || busy) return;
    const currentProgress = game.tokens[game.currentTurn][token];
    const progress = currentProgress === undefined ? undefined : currentProgress < 0 ? 0 : currentProgress + (game.dice ?? 0);
    if (progress === undefined) return;
    const tokens = { red: [...game.tokens.red], blue: [...game.tokens.blue] };
    tokens[game.currentTurn][token] = progress;
    setOptimisticGame({ ...game, tokens });
    setBusy(true);
    setError('');
    try {
      const result = await request<{ game: Game }>(`/api/games/${encodeURIComponent(game.id)}/moves`, {
        method: 'POST',
        body: JSON.stringify({ playerId, move: { action: 'move', token } }),
      });
      setGame(result.game);
      setOptimisticGame(null);
    } catch (reason) {
      setOptimisticGame(null);
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function selectChecker(square: number) {
    setSelectedSquare(square);
    setLegalTargets(availableMoves.filter((move) => move.from === square).map((move) => move.to));
  }

  async function moveChecker(square: number) {
    if (!game || game.gameType !== 'checkers' || !playerId || game.status !== 'in_progress' || busy) return;
    prepareMoveAudio();
    const piece = game.board[square];
    const ownSide = playerSide(game.players.find((candidate) => candidate?.id === playerId));
    if (selectedSquare === null) {
      if (piece?.side === ownSide && game.currentTurn === ownSide) selectChecker(square);
      return;
    }
    if (piece?.side === ownSide) {
      if (game.forcedFrom === undefined || square === game.forcedFrom) selectChecker(square);
      return;
    }
    if (!legalTargets.includes(square)) return;
    const from = selectedSquare;
    const previewBoard = [...game.board];
    const checker = previewBoard[from];
    if (checker) {
      previewBoard[from] = null;
      if (Math.abs(square - from) > 9) previewBoard[(from + square) / 2] = null;
      previewBoard[square] = {
        ...checker,
        king: checker.king || (checker.side === 'red' ? Math.floor(square / 8) === 0 : Math.floor(square / 8) === 7),
      };
      setOptimisticGame({ ...game, board: previewBoard });
    }
    setError('');
    setBusy(true);
    try {
      const result = await request<{ game: Game }>(`/api/games/${game.id}/moves`, {
        method: 'POST',
        body: JSON.stringify({ playerId, move: { from: selectedSquare, to: square } }),
      });
      const checkersResult = result.game.gameType === 'checkers' ? result.game : null;
      const computerEndsGame = game.players[1]?.isComputer && result.game.status === 'finished' && result.game.winner === 'black'
        && checkersResult?.forcedFrom === undefined;
      if (computerEndsGame) {
        await new Promise((resolve) => window.setTimeout(resolve, 750));
      }
      setGame(result.game);
      setOptimisticGame(null);
      setSelectedSquare(checkersResult?.forcedFrom ?? null);
      setAvailableMoves([]);
      setLegalTargets([]);
    } catch (reason) {
      setOptimisticGame(null);
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function moveChess(square: number) {
    if (!game || game.gameType !== 'chess' || !playerId || game.status !== 'in_progress' || busy) return;
    prepareMoveAudio();
    const piece = game.board[square];
    const ownColor = playerSide(game.players.find((candidate) => candidate?.id === playerId));
    if (piece?.color === ownColor) {
      setPromotionSquare(null);
      setSelectedSquare(square);
      setLegalTargets(availableMoves.filter((move) => move.from === square).map((move) => move.to));
      return;
    }
    if (selectedSquare === null || !legalTargets.includes(square)) return;
    const movingPiece = game.board[selectedSquare];
    const targetRow = Math.floor(square / 8);
    if (movingPiece?.type === 'pawn' && targetRow === (movingPiece.color === 'white' ? 0 : 7)) {
      setPromotionSquare(square);
      return;
    }
    await submitChessMove(square, 'queen');
  }

  async function submitChessMove(square: number, promotion: 'queen' | 'rook' | 'bishop' | 'knight') {
    if (!game || game.gameType !== 'chess' || !playerId || selectedSquare === null) return;
    const from = selectedSquare;
    const movingPiece = game.board[selectedSquare];
    const promotionMove = movingPiece?.type === 'pawn'
      && Math.floor(square / 8) === (movingPiece.color === 'white' ? 0 : 7);
    setPendingChessMove({ gameId: game.id, from, to: square, promotion: promotionMove ? promotion : 'queen' });
    setError('');
    setBusy(true);
    try {
      const result = await request<{ game: Game }>(`/api/games/${game.id}/moves`, {
        method: 'POST',
        body: JSON.stringify({ playerId, move: { from: selectedSquare, to: square, ...(promotionMove ? { promotion } : {}) } }),
      });
      const computerWon = game.players[1]?.isComputer && result.game.gameType === 'chess'
        && result.game.status === 'finished' && result.game.winner === 'black';
      if (computerWon) await new Promise((resolve) => window.setTimeout(resolve, 750));
      setGame(result.game);
      setPendingChessMove(null);
      setSelectedSquare(null);
      setAvailableMoves([]);
      setLegalTargets([]);
      setPromotionSquare(null);
    } catch (reason) {
      setPendingChessMove(null);
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function rematchGame() {
    if (!game || !playerId) return;
    setBusy(true);
    setError('');
    try {
      const result = await request<{ game: Game }>(`/api/games/${game.id}/rematch`, {
        method: 'POST',
        body: JSON.stringify({ playerId }),
      });
      setGame(result.game);
      setSelectedSquare(null);
      setAvailableMoves([]);
      setLegalTargets([]);
      setPromotionSquare(null);
      setDismissedResultGameId(null);
      setNotice(game.difficulty
        ? `Rematch started on ${game.difficulty} difficulty.`
        : 'Rematch started.');
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function claimDraw() {
    if (!game || game.gameType !== 'chess' || !playerId || busy) return;
    setBusy(true);
    try {
      const result = await request<{ game: Game }>(`/api/games/${encodeURIComponent(game.id)}/claim-draw`, {
        method: 'POST',
        body: JSON.stringify({ playerId }),
      });
      setGame(result.game);
      setNotice('Draw claimed.');
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite() {
    if (!game) return;
    const invite = `${window.location.origin}${window.location.pathname}?game=${encodeURIComponent(game.id)}`;
    try {
      await navigator.clipboard.writeText(invite);
      setNotice('Invite link copied.');
    } catch {
      setNotice(`Share this room code: ${game.id}`);
    }
  }

  async function leaveRoom() {
    const activeGame = game;
    const activePlayerId = playerId;
    const isComputerMatch = Boolean(activeGame?.players.some((player) => player?.isComputer));
    const shouldCloseOnlineRoom = Boolean(activeGame && activePlayerId && activeGame.status !== 'finished' && !isComputerMatch);
    const shouldDeleteComputerMatch = Boolean(activeGame && activePlayerId && isComputerMatch);
    let leaveError = '';
    let leaveNotice = '';
    if ((shouldCloseOnlineRoom || shouldDeleteComputerMatch) && activeGame && activePlayerId) {
      setBusy(true);
      try {
        await request<{ game: Game }>(`/api/games/${encodeURIComponent(activeGame.id)}/leave`, {
          method: 'POST',
          body: JSON.stringify({ playerId: activePlayerId }),
        });
        if (shouldCloseOnlineRoom) leaveNotice = 'Room closed. Your opponent has been notified.';
      } catch (reason) {
        leaveError = (reason as Error).message;
      } finally {
        setBusy(false);
      }
    }
    setGame(null);
    setSelectedSquare(null);
    setAvailableMoves([]);
    setLegalTargets([]);
    setPromotionSquare(null);
    setPlayerId(null);
    setNotice('');
    setError('');
    setRoomCode('');
    setGameInUrl(null);
    setNotice(leaveNotice);
    setError(leaveError);
  }

  function toggleMoveSounds() {
    if (soundEnabled && !moveAudioUnlocked) {
      prepareMoveAudio();
      return;
    }
    const next = !soundEnabled;
    setSoundEnabled(next);
    window.localStorage.setItem('move-sounds', next ? 'on' : 'off');
    if (next) prepareMoveAudio();
  }

  const currentPlayer = game?.players.find((player) => player?.id === playerId) ?? null;
  const renderedGame = game && optimisticGame?.id === game.id ? optimisticGame : game;
  const visibleChessBoard = game?.gameType === 'chess' && pendingChessMove?.gameId === game.id
    ? previewChessMove(game, pendingChessMove)
    : null;
  const matchResult: MatchResult | null = game?.status !== 'finished' || game.closedBy
    ? null
    : !game.winner ? 'draw'
      : currentPlayer ? (playerSide(currentPlayer) === game.winner ? 'win' : 'loss')
        : null;
  const showResultPopup = Boolean(game && matchResult && dismissedResultGameId !== game.id);
  const opponentName = game?.players.find((player) => player && player.id !== playerId)?.name ?? 'your opponent';
  const promotionDisplayColumn = promotionSquare === null
    ? null
    : (currentPlayer?.color === 'black' ? 63 - promotionSquare : promotionSquare) % 8;
  const winnerKingSquare = game?.gameType === 'chess' && game.status === 'finished' && game.winner
    ? game.board.findIndex((piece) => piece?.type === 'king' && piece.color === game.winner)
    : -1;
  const defeatedKingSquare = game?.gameType === 'chess' && game.status === 'finished' && game.winner
    ? game.board.findIndex((piece) => piece?.type === 'king' && piece.color !== game.winner)
    : -1;
  const canJoin = game?.status === 'waiting' && !currentPlayer;
  const turnPlayer = game?.players.find((player) => playerSide(player) === game.currentTurn) ?? null;
  const gameName = game?.gameType === 'checkers' ? 'CHECKERS' : game?.gameType === 'chess' ? 'CHESS' : game?.gameType === 'ludo' ? 'LUDO' : 'CONNECT FOUR';

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/" onClick={(event) => { event.preventDefault(); leaveRoom(); }}>
          <span className="brand-mark"><img src="/m-s-logo.jpg" alt="" /></span>
          <span>GAMING PLATFORM</span>
        </a>
        <span className="prototype-tag"><span /> FREE PLAY · {game ? gameName : 'FOUR GAMES'}</span>
      </header>

      <section className="hero">
        <p className="eyebrow">QUICK MATCH · {game ? gameName : 'PICK A GAME'}</p>
        <h1>{!game ? <>Choose your game.<br /><em>Make your move.</em></> : game.gameType === 'checkers' ? <>A clever move.<br /><em>A clear path.</em></> : game.gameType === 'chess' ? <>Think ahead.<br /><em>Own the board.</em></> : game.gameType === 'ludo' ? <>Roll the dice.<br /><em>Race for home.</em></> : <>Four in a row.<br /><em>Make it count.</em></>}</h1>
        <p className="hero-copy">{!game ? <>Play Connect Four, Checkers, Chess, or Ludo.<br />Challenge a friend or take on the computer.</> : game.gameType === 'checkers' ? <>Jump, capture, and crown your pieces.<br />Play a friend or challenge the computer.</> : game.gameType === 'chess' ? <>Make a plan, protect your king, and checkmate.<br />Play a friend or challenge the computer.</> : game.gameType === 'ludo' ? <>Roll a six, race your tokens, and send rivals home.<br />Play a friend or challenge the computer.</> : <>Drop a disc, line up four, and take the bragging rights.<br />Play a friend or try your luck against the computer.</>}</p>
      </section>

      {error && <div className="feedback error" role="alert">{error}</div>}
      {notice && <div className="feedback notice" role="status">{notice}</div>}

      {game ? (
        <section className="game-layout">
          <div className="game-panel">
            <div className="game-heading">
              <div>
                <p className="eyebrow">{gameName}</p>
                <h2>{game.closedBy ? 'Room closed' : game.players[1]?.isComputer ? 'You vs Computer' : game.status === 'waiting' ? 'Waiting for a friend' : 'Your match'}</h2>
              </div>
              <div className="game-heading-actions">
                <button className="sound-toggle" onClick={toggleMoveSounds} aria-pressed={soundEnabled} aria-label={`Turn move sounds ${soundEnabled ? 'off' : 'on'}`}>
                  <span aria-hidden="true">{soundEnabled ? '♫' : '♪'}</span> Sound {soundEnabled ? 'on' : 'off'}
                </button>
                <button className="quiet-button" onClick={leaveRoom}>Leave room</button>
              </div>
            </div>
            <div className="board-result-anchor">
            {game.gameType === 'connect4' ? <>
              <div className="board-toolbar">
                {Array.from({ length: 7 }, (_, column) => (
                  <button className="drop-button" key={column} onClick={() => dropDisc(column)}
                    disabled={game.status !== 'in_progress' || playerSide(currentPlayer) !== game.currentTurn}
                    aria-label={`Drop disc in column ${column + 1}`}>↓</button>
                ))}
              </div>
              <div className="board" role="grid" aria-label="Connect Four board">
                {(renderedGame?.gameType === 'connect4' ? renderedGame.board : game.board).map((cell, index) => <div className={`board-slot ${lastMove?.gameId === game.id && lastMove.to === index ? 'last-destination' : ''}`} role="gridcell" key={index}><span className={`disc ${cell ?? 'empty'}`} /></div>)}
              </div>
            </> : game.gameType === 'checkers' ? <>
            <div className="checkers-board" role="grid" aria-label="Checkers board">
              {(renderedGame?.gameType === 'checkers' ? renderedGame.board : game.board).map((piece, index) => {
                const row = Math.floor(index / 8);
                const column = index % 8;
                const dark = (row + column) % 2 === 1;
                const isHint = legalTargets.includes(index);
                const ownTurn = currentPlayer && playerSide(currentPlayer) === game.currentTurn;
                return <button key={index} role="gridcell" className={`checkers-square ${dark ? 'dark' : 'light'} ${selectedSquare === index ? 'selected' : ''} ${isHint ? 'hint' : ''} ${lastMove?.gameId === game.id && (lastMove.from === index || lastMove.to === index) ? 'last-move' : ''} ${lastMove?.gameId === game.id && lastMove.to === index ? 'last-destination' : ''}`}
                  onClick={() => void moveChecker(index)} disabled={busy || game.status !== 'in_progress' || !ownTurn}
                  aria-label={`Row ${row + 1}, column ${column + 1}${piece ? `, ${piece.side}${piece.king ? ' king' : ''}` : ''}${isHint ? ', legal destination' : ''}`}>
                  {piece && <span className={`checker-piece ${piece.side}`}>{piece.king ? '♛' : ''}</span>}
                </button>;
              })}
            </div>
            </> : game.gameType === 'ludo' ? <LudoBoard
              game={renderedGame?.gameType === 'ludo' ? renderedGame : game}
              playerColor={currentPlayer?.side === 'red' || currentPlayer?.side === 'blue' ? currentPlayer.side : undefined}
              busy={busy}
              onRoll={() => void rollLudoDice()}
              onMoveToken={(token) => void moveLudoToken(token)}
            /> : <div className="chess-board-wrap">
              <div className="chess-board" role="grid" aria-label="Chess board">
              {Array.from({ length: 64 }, (_, displayIndex) => {
                const index = currentPlayer?.color === 'black' ? 63 - displayIndex : displayIndex;
                const row = Math.floor(index / 8);
                const column = index % 8;
                const piece = visibleChessBoard ? visibleChessBoard[index] : game.board[index];
                const isHint = legalTargets.includes(index);
                const ownTurn = currentPlayer?.color === game.currentTurn;
                const displayRow = Math.floor(displayIndex / 8);
                const displayColumn = displayIndex % 8;
                const isBlackView = currentPlayer?.color === 'black';
                const fileLabel = String.fromCharCode((isBlackView ? 104 - displayColumn : 97 + displayColumn));
                const rankLabel = String(isBlackView ? displayRow + 1 : 8 - displayRow);
                const isResultKing = index === winnerKingSquare || index === defeatedKingSquare;
                const resultBadge = index === winnerKingSquare ? 'winner' : index === defeatedKingSquare ? 'defeated' : null;
                return <button key={index} role="gridcell" className={`chess-square ${(row + column) % 2 === 0 ? 'light' : 'dark'} ${selectedSquare === index ? 'selected' : ''} ${isHint ? 'hint' : ''} ${isHint && piece && piece.color !== currentPlayer?.color ? 'capture-hint' : ''} ${lastMove?.gameId === game.id && (lastMove.from === index || lastMove.to === index) ? 'last-move' : ''} ${lastMove?.gameId === game.id && lastMove.to === index ? 'last-destination' : ''} ${isResultKing ? 'chess-result-square' : ''}`}
                  onClick={() => void moveChess(index)} disabled={busy || game.status !== 'in_progress' || !ownTurn}
                  aria-label={`Row ${8 - row}, column ${String.fromCharCode(97 + column)}${piece ? `, ${piece.color} ${piece.type}` : ''}${isHint ? ', legal destination' : ''}`}>
                  {piece && <ChessPieceGlyph type={piece.type} color={piece.color} />}
                  {resultBadge && <span className={`chess-result-badge ${resultBadge}`} role="img" aria-label={resultBadge === 'winner' ? 'Winning king' : 'Defeated king'}><CrownIcon /></span>}
                  {displayColumn === 0 && <span className="chess-coordinate rank-coordinate">{rankLabel}</span>}
                  {displayRow === 7 && <span className="chess-coordinate file-coordinate">{fileLabel}</span>}
                </button>;
              })}
              </div>
              {game.gameType === 'chess' && promotionSquare !== null && promotionDisplayColumn !== null && (
                <div className="promotion-menu" role="group" aria-label="Choose a promotion piece" style={{ left: `calc(3px + ${promotionDisplayColumn * 12.5}% - ${promotionDisplayColumn * 0.75}px)` }}>
                {(['queen', 'rook', 'bishop', 'knight'] as const).map((type) => (
                  <button key={type} className="promotion-menu-choice" disabled={busy} onClick={() => void submitChessMove(promotionSquare, type)} aria-label={`Promote to ${type}`} title={`Promote to ${type}`}>
                    <ChessPieceGlyph type={type} color={game.currentTurn} />
                  </button>
                ))}
                </div>
              )}
              </div>
            }
            {showResultPopup && game && matchResult && (
              <div className="board-result-layer">
                <section className={`result-dialog ${matchResult}`} role="dialog" aria-labelledby="result-title" aria-describedby="result-copy">
                  <div className="result-dialog-mark" aria-hidden="true">{matchResult === 'win' ? <CrownIcon /> : matchResult === 'loss' ? '♟' : '＝'}</div>
                  <p className="eyebrow">{gameName} · MATCH COMPLETE</p>
                  <h2 id="result-title">{matchResult === 'win' ? 'You win!' : matchResult === 'loss' ? 'You lose' : 'It’s a draw'}</h2>
                  <p id="result-copy">{matchResult === 'win' ? `Great game. You beat ${opponentName}.` : matchResult === 'loss' ? `${opponentName} wins this time. Ready for a rematch?` : 'A close match. You both played well.'}</p>
                  <div className="result-actions">
                    <button className="result-dismiss" onClick={() => setDismissedResultGameId(game.id)}>View board</button>
                    <button className="result-rematch" onClick={() => void rematchGame()} disabled={busy}>{busy ? 'Starting…' : 'Rematch ↻'}</button>
                    <button className="result-leave" onClick={() => void leaveRoom()} disabled={busy}>Leave room</button>
                  </div>
                </section>
              </div>
            )}
            </div>
            <div className="game-status" aria-live="polite">
              {game.status === 'waiting' && <><span className="status-dot waiting" /> Waiting for a second player</>}
              {game.status === 'in_progress' && <><span className={`status-dot ${game.currentTurn}`} /> {currentPlayer && playerSide(currentPlayer) === game.currentTurn ? 'Your turn' : `${turnPlayer?.name ?? 'Player'}’s turn`}</>}
              {game.closedBy && <><span className="status-dot waiting" /> {game.closedBy.playerId === playerId ? 'You closed this room.' : `${game.closedBy.playerName} left. This match is closed.`}</>}
              {game.status === 'finished' && !game.closedBy && (game.winner ? <><span className={`status-dot ${game.winner}`} /> {game.players.find((player) => playerSide(player) === game.winner)?.name} wins!</> : game.gameType === 'chess' && game.drawReason ? `Draw · ${game.drawReason.replaceAll('_', ' ')}` : 'It’s a draw!')}
            </div>
            {game.gameType === 'chess' && game.status === 'in_progress' && game.drawClaimAvailable
              && currentPlayer && playerSide(currentPlayer) === game.currentTurn && (
                <button className="draw-claim-button" onClick={() => void claimDraw()} disabled={busy}>Claim draw</button>
              )}
            {game.status === 'finished' && !game.closedBy && currentPlayer && (
              <button className="rematch-button" onClick={() => void rematchGame()} disabled={busy}>
                Rematch{game.difficulty ? ` · ${game.difficulty.toUpperCase()}` : ''} <span>↻</span>
              </button>
            )}
          </div>

          <aside className="match-sidebar">
            <div className="side-card">
              <div className="side-card-title"><span>THE MATCH</span><span className={game.closedBy ? 'closed-label' : 'live-label'}>● {game.closedBy ? 'CLOSED' : 'LIVE'}</span></div>
              {game.players.map((player, index) => (
                <div className="player-row" key={player?.id ?? index}>
                  <span className={`avatar ${playerSide(player) ?? (index === 0 ? 'red' : game.gameType === 'connect4' ? 'yellow' : game.gameType === 'ludo' ? 'blue' : 'black')}`}>{player?.name.slice(0, 1).toUpperCase() ?? '·'}</span>
                  <span className="player-details"><strong>{player?.name ?? 'Open seat'}</strong><small>{player?.isComputer ? `COMPUTER · ${game.difficulty?.toUpperCase() ?? 'MEDIUM'}` : (playerSide(player) ?? (index === 0 ? 'red' : game.gameType === 'connect4' ? 'yellow' : game.gameType === 'ludo' ? 'blue' : 'black')).toUpperCase()}</small></span>
                  {player?.id === playerId && <span className="you-tag">YOU</span>}
                </div>
              ))}
            </div>
            {!game.players[1]?.isComputer && <div className="side-card invite-card">
              <div className="side-card-title">PLAY WITH A FRIEND</div>
              <p>{game.gameType === 'checkers' ? 'Invite someone to capture pieces and crown a winner.' : game.gameType === 'chess' ? 'Invite someone to play a thoughtful match of chess.' : game.gameType === 'ludo' ? 'Invite someone to roll, race, and send tokens home.' : 'Send someone an invite and see who gets four in a row.'}</p>
              <button className="invite-button" onClick={copyInvite}>Copy invite link <span>↗</span></button>
              <small className="room-code">ROOM CODE · {game.id}</small>
            </div>}
          </aside>
        </section>
      ) : (
        <>
        <section className="game-picker" aria-label="Choose a game">
          {([['connect4', 'Connect Four', 'Line up four discs to win.'], ['checkers', 'Checkers', 'Capture pieces and crown your kings.'], ['chess', 'Chess', 'Plan ahead and checkmate the king.'], ['ludo', 'Ludo', 'Roll a six and race home.']] as const).map(([type, title, copy]) => (
            <button key={type} className={`game-choice ${selectedGame === type ? 'active' : ''}`} onClick={() => setSelectedGame(type)} aria-pressed={selectedGame === type}>
              <span className="game-choice-name">{title}</span><span className="game-choice-copy">{copy}</span>
            </button>
          ))}
        </section>
        <section className="lobby" aria-label="Start or join a match">
          <div className="lobby-card computer-card">
            <div className="card-icon computer-icon">♟</div>
            <p className="eyebrow">SOLO PLAY</p>
            <h2>Play vs computer</h2>
            <p className="card-copy">Choose a difficulty and take on the computer.</p>
            <div className="lobby-fields">
              <label htmlFor="computer-name">YOUR NAME</label>
              <input id="computer-name" value={playerName} onChange={(event) => setPlayerName(event.target.value)} maxLength={24} />
              <div className="difficulty-buttons">
                {(['easy', 'medium', 'hard'] as const).map((difficulty) => (
                  <button type="button" key={difficulty} className="secondary-button" disabled={busy} onClick={() => void createGame('computer', difficulty)}>
                    {difficulty[0].toUpperCase() + difficulty.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lobby-card create-card">
            <div className="card-icon sun-icon">✳</div>
            <p className="eyebrow">PLAY WITH SOMEONE</p>
            <h2>Choose your opponent</h2>
            <p className="card-copy">Create a room and invite someone to play.</p>
            <form onSubmit={(event) => { event.preventDefault(); void createGame('player'); }}>
              <label htmlFor="create-name">YOUR NAME</label>
              <input id="create-name" value={playerName} onChange={(event) => setPlayerName(event.target.value)} maxLength={24} required />
              <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Starting…' : 'Play a friend'} <span>→</span></button>
            </form>
          </div>

          <div className="lobby-card join-card">
            <div className="card-icon green-icon">↗</div>
            <p className="eyebrow">GOT AN INVITE?</p>
            <h2>Join a room</h2>
            <p className="card-copy">Paste the room code your friend sent you.</p>
            <form onSubmit={joinGame}>
              <label htmlFor="join-name">YOUR NAME</label>
              <input id="join-name" value={playerName} onChange={(event) => setPlayerName(event.target.value)} maxLength={24} required />
              <label htmlFor="room-code">ROOM CODE</label>
              <input id="room-code" className="code-input" value={roomCode} onChange={(event) => setRoomCode(event.target.value)} placeholder="Paste room code" required />
              <button className="secondary-button" disabled={busy}>Join the game <span>→</span></button>
            </form>
          </div>
        </section>
        </>
      )}

      {canJoin && (
        <section className="join-banner">
          <span>A friend has opened a room for you.</span>
          <button className="secondary-button" disabled={busy} onClick={() => void joinGame()}>Join as {playerName} <span>→</span></button>
        </section>
      )}

      <footer><span>PLAYROOM · A LITTLE FRIENDLY COMPETITION</span><span>JUST FOR FUN · NO MONEY INVOLVED</span></footer>
    </main>
  );
}
