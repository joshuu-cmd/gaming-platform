type LudoColor = 'red' | 'blue';
type LudoGameView = {
  status: 'waiting' | 'in_progress' | 'finished';
  tokens: Record<LudoColor, number[]>;
  currentTurn: LudoColor;
  winner: LudoColor | null;
  dice: number | null;
  lastDice: number | null;
  lastRollNoMoves: boolean;
  legalTokens: number[];
};

type Props = {
  game: LudoGameView;
  playerColor?: LudoColor;
  busy: boolean;
  onRoll: () => void;
  onMoveToken: (token: number) => void;
};

const track: [number, number][] = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], [7, 14], [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], [7, 0], [6, 0],
];
const safeSpaces = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const starts: Record<LudoColor, number> = { red: 0, blue: 26 };
const yards: Record<LudoColor, [number, number][]> = {
  red: [[10, 1], [10, 4], [13, 1], [13, 4]],
  blue: [[1, 10], [1, 13], [4, 10], [4, 13]],
};
const homeLanes: Record<LudoColor, [number, number][]> = {
  red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  blue: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
};
const dieFaces = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export default function LudoBoard({ game, playerColor, busy, onRoll, onMoveToken }: Props) {
  const tokensAt = new Map<string, { color: LudoColor; token: number; legal: boolean; finished: boolean }[]>();
  (['red', 'blue'] as const).forEach((color) => {
    game.tokens[color].forEach((progress, token) => {
      const coordinate = progress < 0
        ? yards[color][token]
        : progress < 52
          ? track[(starts[color] + progress) % track.length]
          : homeLanes[color][Math.min(progress - 52, 5)];
      if (!coordinate) return;
      const key = `${coordinate[0]}-${coordinate[1]}`;
      const tokens = tokensAt.get(key) ?? [];
      tokens.push({ color, token, legal: game.status === 'in_progress' && color === game.currentTurn && game.legalTokens.includes(token), finished: progress === 57 });
      tokensAt.set(key, tokens);
    });
  });

  const isMyTurn = game.status === 'in_progress' && playerColor === game.currentTurn;
  const diceLabel = game.dice ? `Rolled ${game.dice}. Choose a token to move.`
    : game.lastRollNoMoves ? `Rolled ${game.lastDice}; no tokens could move.`
      : game.status === 'waiting' ? 'Waiting for a friend to join.' : 'Roll the dice to play.';

  function cellClass(row: number, column: number): string {
    const classes = ['ludo-cell'];
    if (row >= 9 && column <= 5) classes.push('red-yard');
    if (row <= 5 && column >= 9) classes.push('blue-yard');
    if ((row <= 5 && column <= 5) || (row >= 9 && column >= 9)) classes.push('empty-yard');
    const trackIndex = track.findIndex(([trackRow, trackColumn]) => trackRow === row && trackColumn === column);
    if (trackIndex >= 0) {
      classes.push('ludo-track-cell');
      if (safeSpaces.has(trackIndex)) classes.push('safe');
      if (trackIndex === starts.red) classes.push('start-red');
      if (trackIndex === starts.blue) classes.push('start-blue');
    }
    if (homeLanes.red.some(([homeRow, homeColumn]) => homeRow === row && homeColumn === column)) classes.push('red-home-lane');
    if (homeLanes.blue.some(([homeRow, homeColumn]) => homeRow === row && homeColumn === column)) classes.push('blue-home-lane');
    if (row >= 6 && row <= 8 && column >= 6 && column <= 8) classes.push('ludo-center');
    if (yards.red.some(([yardRow, yardColumn]) => yardRow === row && yardColumn === column)) classes.push('red-token-yard');
    if (yards.blue.some(([yardRow, yardColumn]) => yardRow === row && yardColumn === column)) classes.push('blue-token-yard');
    return classes.join(' ');
  }

  return (
    <div className="ludo-game-board">
      <div className="ludo-controls">
        <div className={`ludo-turn-label ${game.currentTurn}`}>
          {game.status === 'waiting' ? 'Waiting for a player' : game.status === 'finished' ? `${game.winner ?? ''} wins` : `${game.currentTurn} to move`}
        </div>
        <button className="ludo-roll-button" onClick={onRoll} disabled={busy || !isMyTurn || game.dice !== null}>
          {busy ? 'Rolling…' : game.dice !== null ? 'Choose a token' : 'Roll dice'}
        </button>
        <span className={`ludo-die ${game.currentTurn}`} aria-label={game.dice ? `Dice shows ${game.dice}` : 'Dice ready'}>{game.dice ? dieFaces[game.dice] : '?'}</span>
        <span className="ludo-instruction" aria-live="polite">{diceLabel}</span>
      </div>
      <div className="ludo-board" role="grid" aria-label="Ludo board">
        {Array.from({ length: 225 }, (_, index) => {
          const row = Math.floor(index / 15);
          const column = index % 15;
          const tokens = tokensAt.get(`${row}-${column}`) ?? [];
          return <div className={cellClass(row, column)} role="gridcell" key={index}>
            {tokens.map(({ color, token, legal, finished }, stackIndex) => {
              const stackOffset = (stackIndex - (tokens.length - 1) / 2) * 5;
              return (
              <button
                key={`${color}-${token}`}
                className={`ludo-pawn ${color} ${legal ? 'movable' : ''} ${finished ? 'finished' : ''}`}
                style={{ left: `calc(50% + ${stackOffset}px)`, top: `calc(50% + ${stackOffset}px)` }}
                onClick={() => onMoveToken(token)}
                disabled={busy || !legal}
                aria-label={`${color} token ${token + 1}${legal ? ', movable' : ''}${finished ? ', home' : ''}`}
                title={`${color} token ${token + 1}`}
              />
              );
            })}
          </div>;
        })}
      </div>
      <p className="ludo-help">Roll a six to leave base. Land on an opponent to send them home, then race all four tokens to the finish.</p>
      <div className="ludo-legend"><span><i className="red" />Red</span><span><i className="blue" />Blue</span><span>Safe spaces ✦</span></div>
    </div>
  );
}
