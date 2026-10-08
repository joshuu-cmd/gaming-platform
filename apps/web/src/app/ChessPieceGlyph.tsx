type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';
type PieceColor = 'white' | 'black';

type Props = { type: PieceType; color: PieceColor; className?: string };

const neoPieceCodes: Record<PieceType, string> = {
  king: 'k',
  queen: 'q',
  rook: 'r',
  bishop: 'b',
  knight: 'n',
  pawn: 'p',
};

export default function ChessPieceGlyph({ type, color, className = '' }: Props) {
  const sideCode = color === 'white' ? 'w' : 'b';
  const pieceCode = neoPieceCodes[type];

  return (
    <img
      className={`chess-piece-svg ${color} ${className}`}
      src={`https://images.chesscomfiles.com/chess-themes/pieces/neo/150/${sideCode}${pieceCode}.png`}
      alt=""
      draggable={false}
    />
  );
}
