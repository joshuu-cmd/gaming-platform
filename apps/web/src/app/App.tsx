import { useEffect, useRef, useState, type FormEvent } from 'react';
import './app.css';

type Difficulty = 'easy' | 'medium' | 'hard';
type Disc = 'red' | 'yellow';
type Player = { id: string; name: string; disc?: Disc; side?: 'red' | 'black'; color?: 'white' | 'black'; isComputer?: boolean };
type GameStatus = 'waiting' | 'in_progress' | 'finished';
type ConnectFourGame = {
  gameType: 'connect4';
  id: string;
  status: GameStatus;
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
  difficulty?: Difficulty;
  board: (ChessPiece | null)[];
  players: [Player, Player | null];
  currentTurn: 'white' | 'black';
  winner: 'white' | 'black' | null;
  drawReason?: string;
  drawClaimAvailable?: boolean;
};
type Game = ConnectFourGame | CheckersGame | ChessGame;
type GameType = Game['gameType'];
const chessGlyphs = {
  white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
  black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' },
} as const;

type LastMove = { gameId: string; from: number; to: number };
type MoveSound = 'move' | 'capture' | 'finish';

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
    const notes = kind === 'capture' ? [235, 175] : kind === 'finish' ? [392, 494, 587] : [360];
    const start = context.currentTime;
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const volume = context.createGain();
      const noteStart = start + index * 0.075;
      const duration = kind === 'finish' ? 0.18 : 0.12;
      oscillator.type = kind === 'capture' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, noteStart);
      volume.gain.setValueAtTime(0.0001, noteStart);
      volume.gain.exponentialRampToValueAtTime(kind === 'finish' ? 0.055 : 0.035, noteStart + 0.012);
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
  const [promotionSquare, setPromotionSquare] = useState<number | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(() => window.localStorage.getItem('move-sounds') !== 'off');
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const previousGameRef = useRef<Game | null>(null);

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
          const previousPieceCount = previous.board.filter(Boolean).length;
          const currentPieceCount = game.board.filter(Boolean).length;
          const sound: MoveSound = game.status === 'finished'
            ? 'finish'
            : currentPieceCount < previousPieceCount ? 'capture' : 'move';
          playMoveSound(sound);
        }
      } else if (previous.status !== 'finished' && game.status === 'finished' && soundEnabled) {
        playMoveSound('finish');
      }
    }
    previousGameRef.current = game;
  }, [game, soundEnabled]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('game');
    if (!id) return;
    request<{ game: Game }>(`/api/games/${encodeURIComponent(id)}`)
      .then(({ game: latest }) => { setGame(latest); setSelectedGame(latest.gameType); })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  useEffect(() => {
    if (!game) return;
    const timer = window.setInterval(() => {
      request<{ game: Game }>(`/api/games/${encodeURIComponent(game.id)}`)
        .then(({ game: latest }) => { if (!busy) setGame(latest); })
        .catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [game?.id, busy]);

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
      setLegalTargets([]);
      setPromotionSquare(null);
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
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function selectChecker(square: number) {
    if (!game || game.gameType !== 'checkers' || !playerId) return;
    setSelectedSquare(square);
    setLegalTargets([]);
    try {
      const result = await request<{ moves: { from: number; to: number }[] }>(
        `/api/games/${encodeURIComponent(game.id)}/legal-moves?playerId=${encodeURIComponent(playerId)}`,
      );
      setLegalTargets(result.moves.filter((move) => move.from === square).map((move) => move.to));
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function moveChecker(square: number) {
    if (!game || game.gameType !== 'checkers' || !playerId || game.status !== 'in_progress' || busy) return;
    prepareMoveAudio();
    const piece = game.board[square];
    const ownSide = playerSide(game.players.find((candidate) => candidate?.id === playerId));
    if (selectedSquare === null) {
      if (piece?.side === ownSide && game.currentTurn === ownSide) await selectChecker(square);
      return;
    }
    if (piece?.side === ownSide) {
      if (game.forcedFrom === undefined || square === game.forcedFrom) await selectChecker(square);
      return;
    }
    if (!legalTargets.includes(square)) return;
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
      setSelectedSquare(checkersResult?.forcedFrom ?? null);
      if (checkersResult?.forcedFrom !== undefined) {
        const hints = await request<{ moves: { from: number; to: number }[] }>(
          `/api/games/${encodeURIComponent(game.id)}/legal-moves?playerId=${encodeURIComponent(playerId)}`,
        );
        setLegalTargets(hints.moves.filter((move) => move.from === checkersResult.forcedFrom).map((move) => move.to));
      } else {
        setLegalTargets([]);
      }
    } catch (reason) {
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
      setLegalTargets([]);
      try {
        const hints = await request<{ moves: { from: number; to: number }[] }>(
          `/api/games/${encodeURIComponent(game.id)}/legal-moves?playerId=${encodeURIComponent(playerId)}`,
        );
        setLegalTargets(hints.moves.filter((move) => move.from === square).map((move) => move.to));
      } catch (reason) {
        setError((reason as Error).message);
      }
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
    const movingPiece = game.board[selectedSquare];
    const promotionMove = movingPiece?.type === 'pawn'
      && Math.floor(square / 8) === (movingPiece.color === 'white' ? 0 : 7);
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
      setSelectedSquare(null);
      setLegalTargets([]);
      setPromotionSquare(null);
    } catch (reason) {
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
      setLegalTargets([]);
      setPromotionSquare(null);
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

  function leaveRoom() {
    setGame(null);
    setSelectedSquare(null);
    setLegalTargets([]);
    setPromotionSquare(null);
    setPlayerId(null);
    setNotice('');
    setError('');
    setRoomCode('');
    setGameInUrl(null);
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
  const canJoin = game?.status === 'waiting' && !currentPlayer;
  const turnPlayer = game?.players.find((player) => playerSide(player) === game.currentTurn) ?? null;
  const gameName = game?.gameType === 'checkers' ? 'CHECKERS' : game?.gameType === 'chess' ? 'CHESS' : 'CONNECT FOUR';

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/" onClick={(event) => { event.preventDefault(); leaveRoom(); }}>
          <span className="brand-mark"><img src="/m-s-logo.jpg" alt="" /></span>
          <span>GAMING PLATFORM</span>
        </a>
        <span className="prototype-tag"><span /> FREE PLAY · {game ? gameName : 'THREE GAMES'}</span>
      </header>

      <section className="hero">
        <p className="eyebrow">QUICK MATCH · {game ? gameName : 'PICK A GAME'}</p>
        <h1>{!game ? <>Choose your game.<br /><em>Make your move.</em></> : game.gameType === 'checkers' ? <>A clever move.<br /><em>A clear path.</em></> : game.gameType === 'chess' ? <>Think ahead.<br /><em>Own the board.</em></> : <>Four in a row.<br /><em>Make it count.</em></>}</h1>
        <p className="hero-copy">{!game ? <>Play Connect Four, Checkers, or Chess.<br />Challenge a friend or take on the computer.</> : game.gameType === 'checkers' ? <>Jump, capture, and crown your pieces.<br />Play a friend or challenge the computer.</> : game.gameType === 'chess' ? <>Make a plan, protect your king, and checkmate.<br />Play a friend or challenge the computer.</> : <>Drop a disc, line up four, and take the bragging rights.<br />Play a friend or try your luck against the computer.</>}</p>
      </section>

      {error && <div className="feedback error" role="alert">{error}</div>}
      {notice && <div className="feedback notice" role="status">{notice}</div>}

      {game ? (
        <section className="game-layout">
          <div className="game-panel">
            <div className="game-heading">
              <div>
                <p className="eyebrow">{gameName}</p>
                <h2>{game.players[1]?.isComputer ? 'You vs Computer' : game.status === 'waiting' ? 'Waiting for a friend' : 'Your match'}</h2>
              </div>
              <div className="game-heading-actions">
                <button className="sound-toggle" onClick={toggleMoveSounds} aria-pressed={soundEnabled} aria-label={`Turn move sounds ${soundEnabled ? 'off' : 'on'}`}>
                  <span aria-hidden="true">{soundEnabled ? '♫' : '♪'}</span> Sound {soundEnabled ? 'on' : 'off'}
                </button>
                <button className="quiet-button" onClick={leaveRoom}>Leave room</button>
              </div>
            </div>
            {game.gameType === 'connect4' ? <>
              <div className="board-toolbar">
                {Array.from({ length: 7 }, (_, column) => (
                  <button className="drop-button" key={column} onClick={() => dropDisc(column)}
                    disabled={game.status !== 'in_progress' || playerSide(currentPlayer) !== game.currentTurn}
                    aria-label={`Drop disc in column ${column + 1}`}>↓</button>
                ))}
              </div>
              <div className="board" role="grid" aria-label="Connect Four board">
                {game.board.map((cell, index) => <div className={`board-slot ${lastMove?.gameId === game.id && lastMove.to === index ? 'last-destination' : ''}`} role="gridcell" key={index}><span className={`disc ${cell ?? 'empty'}`} /></div>)}
              </div>
            </> : game.gameType === 'checkers' ? <>
            <div className="checkers-board" role="grid" aria-label="Checkers board">
              {game.board.map((piece, index) => {
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
            </> : <div className="chess-board" role="grid" aria-label="Chess board">
              {Array.from({ length: 64 }, (_, displayIndex) => {
                const index = currentPlayer?.color === 'black' ? 63 - displayIndex : displayIndex;
                const row = Math.floor(index / 8);
                const column = index % 8;
                const piece = game.board[index];
                const isHint = legalTargets.includes(index);
                const ownTurn = currentPlayer?.color === game.currentTurn;
                const displayRow = Math.floor(displayIndex / 8);
                const displayColumn = displayIndex % 8;
                const isBlackView = currentPlayer?.color === 'black';
                const fileLabel = String.fromCharCode((isBlackView ? 104 - displayColumn : 97 + displayColumn));
                const rankLabel = String(isBlackView ? displayRow + 1 : 8 - displayRow);
                return <button key={index} role="gridcell" className={`chess-square ${(row + column) % 2 === 0 ? 'light' : 'dark'} ${selectedSquare === index ? 'selected' : ''} ${isHint ? 'hint' : ''} ${isHint && piece && piece.color !== currentPlayer?.color ? 'capture-hint' : ''} ${lastMove?.gameId === game.id && (lastMove.from === index || lastMove.to === index) ? 'last-move' : ''} ${lastMove?.gameId === game.id && lastMove.to === index ? 'last-destination' : ''}`}
                  onClick={() => void moveChess(index)} disabled={busy || game.status !== 'in_progress' || !ownTurn}
                  aria-label={`Row ${8 - row}, column ${String.fromCharCode(97 + column)}${piece ? `, ${piece.color} ${piece.type}` : ''}${isHint ? ', legal destination' : ''}`}>
                  {piece && <span className={`chess-piece ${piece.color}`}>{chessGlyphs[piece.color][piece.type]}</span>}
                  {displayColumn === 0 && <span className="chess-coordinate rank-coordinate">{rankLabel}</span>}
                  {displayRow === 7 && <span className="chess-coordinate file-coordinate">{fileLabel}</span>}
                </button>;
              })}
            </div>}
            {game.gameType === 'chess' && promotionSquare !== null && (
              <div className="promotion-panel" role="group" aria-label="Choose a promotion piece">
                <span>Promote pawn to</span>
                {(['queen', 'rook', 'bishop', 'knight'] as const).map((type) => (
                  <button key={type} className="promotion-choice" disabled={busy} onClick={() => void submitChessMove(promotionSquare, type)}>
                    <span className={`chess-piece ${game.currentTurn}`}>{chessGlyphs[game.currentTurn][type]}</span>
                    <span>{type[0]!.toUpperCase() + type.slice(1)}</span>
                  </button>
                ))}
                <button className="promotion-cancel" onClick={() => setPromotionSquare(null)}>Cancel</button>
              </div>
            )}
            <div className="game-status" aria-live="polite">
              {game.status === 'waiting' && <><span className="status-dot waiting" /> Waiting for a second player</>}
              {game.status === 'in_progress' && <><span className={`status-dot ${game.currentTurn}`} /> {currentPlayer && playerSide(currentPlayer) === game.currentTurn ? 'Your turn' : `${turnPlayer?.name ?? 'Player'}’s turn`}</>}
              {game.status === 'finished' && (game.winner ? <><span className={`status-dot ${game.winner}`} /> {game.players.find((player) => playerSide(player) === game.winner)?.name} wins!</> : game.gameType === 'chess' && game.drawReason ? `Draw · ${game.drawReason.replaceAll('_', ' ')}` : 'It’s a draw!')}
            </div>
            {game.gameType === 'chess' && game.status === 'in_progress' && game.drawClaimAvailable
              && currentPlayer && playerSide(currentPlayer) === game.currentTurn && (
                <button className="draw-claim-button" onClick={() => void claimDraw()} disabled={busy}>Claim draw</button>
              )}
            {game.status === 'finished' && currentPlayer && (
              <button className="rematch-button" onClick={() => void rematchGame()} disabled={busy}>
                Rematch{game.difficulty ? ` · ${game.difficulty.toUpperCase()}` : ''} <span>↻</span>
              </button>
            )}
          </div>

          <aside className="match-sidebar">
            <div className="side-card">
              <div className="side-card-title"><span>THE MATCH</span><span className="live-label">● LIVE</span></div>
              {game.players.map((player, index) => (
                <div className="player-row" key={player?.id ?? index}>
                  <span className={`avatar ${playerSide(player) ?? (index === 0 ? 'red' : game.gameType === 'connect4' ? 'yellow' : 'black')}`}>{player?.name.slice(0, 1).toUpperCase() ?? '·'}</span>
                  <span className="player-details"><strong>{player?.name ?? 'Open seat'}</strong><small>{player?.isComputer ? `COMPUTER · ${game.difficulty?.toUpperCase() ?? 'MEDIUM'}` : (playerSide(player) ?? (index === 0 ? 'red' : game.gameType === 'connect4' ? 'yellow' : 'black')).toUpperCase()}</small></span>
                  {player?.id === playerId && <span className="you-tag">YOU</span>}
                </div>
              ))}
            </div>
            {!game.players[1]?.isComputer && <div className="side-card invite-card">
              <div className="side-card-title">PLAY WITH A FRIEND</div>
              <p>{game.gameType === 'checkers' ? 'Invite someone to capture pieces and crown a winner.' : game.gameType === 'chess' ? 'Invite someone to play a thoughtful match of chess.' : 'Send someone an invite and see who gets four in a row.'}</p>
              <button className="invite-button" onClick={copyInvite}>Copy invite link <span>↗</span></button>
              <small className="room-code">ROOM CODE · {game.id}</small>
            </div>}
          </aside>
        </section>
      ) : (
        <>
        <section className="game-picker" aria-label="Choose a game">
          {([['connect4', 'Connect Four', 'Line up four discs to win.'], ['checkers', 'Checkers', 'Capture pieces and crown your kings.'], ['chess', 'Chess', 'Plan ahead and checkmate the king.']] as const).map(([type, title, copy]) => (
            <button key={type} className={`game-choice ${selectedGame === type ? 'active' : ''}`} onClick={() => setSelectedGame(type)} aria-pressed={selectedGame === type}>
              <span className="game-choice-name">{title}</span><span className="game-choice-copy">{copy}</span>
            </button>
          ))}
        </section>
        <section className="lobby">
          <div className="lobby-card create-card">
            <div className="card-icon sun-icon">✳</div>
            <p className="eyebrow">SET UP A MATCH</p>
            <h2>Choose your opponent</h2>
            <p className="card-copy">Play someone you know or take on the computer.</p>
            <form onSubmit={(event) => { event.preventDefault(); void createGame('player'); }}>
              <label htmlFor="create-name">YOUR NAME</label>
              <input id="create-name" value={playerName} onChange={(event) => setPlayerName(event.target.value)} maxLength={24} required />
              <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Starting…' : 'Play a friend'} <span>→</span></button>
              <div className="computer-levels">
                <span className="computer-levels-label">PLAY VS COMPUTER</span>
                <div className="difficulty-buttons">
                  {(['easy', 'medium', 'hard'] as const).map((difficulty) => (
                    <button type="button" key={difficulty} className="secondary-button" disabled={busy} onClick={() => void createGame('computer', difficulty)}>
                      {difficulty[0].toUpperCase() + difficulty.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </form>
          </div>

          <div className="lobby-divider"><span>OR</span></div>

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
