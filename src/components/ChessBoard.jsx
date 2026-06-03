// src/components/ChessBoard.jsx

import React, { useMemo, useCallback } from 'react';

export default function ChessBoard({
  theme, gameMode,
  pieces, selectedPiece, shakingPieceId, kingInCheckId, lastMove, movedPieceId,
  onPieceClick, onCellClick,
}) {
  const gridIntersections = useMemo(() => {
    const pts = [];
    for (let r = 0; r <= 9; r++) for (let c = 0; c <= 8; c++) pts.push({ row: r, col: c });
    return pts;
  }, []);

  const crosshairPoints = useMemo(() => [
    { r: 2, c: 1 }, { r: 2, c: 7 }, { r: 7, c: 1 }, { r: 7, c: 7 },
    { r: 3, c: 0 }, { r: 3, c: 2 }, { r: 3, c: 4 }, { r: 3, c: 6 }, { r: 3, c: 8 },
    { r: 6, c: 0 }, { r: 6, c: 2 }, { r: 6, c: 4 }, { r: 6, c: 6 }, { r: 6, c: 8 },
  ], []);

  const handlePiecePointer = useCallback((e, row, col, piece) => {
    e.stopPropagation();
    onPieceClick(row, col, piece);
  }, [onPieceClick]);

  const handleCellPointer = useCallback((e, row, col) => {
    onCellClick(row, col);
  }, [onCellClick]);

  return (
    <svg
      viewBox="0 0 900 1000"
      style={{ width: '100%', backgroundColor: theme.board, display: 'block', touchAction: 'none' }}
    >
      <defs>
        <filter id="piece-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="1.5" dy="3" stdDeviation="3" floodOpacity="0.25" />
        </filter>
        <radialGradient id="revealed-grad" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor={theme.pieceBg} />
        </radialGradient>
        <radialGradient id="hidden-grad" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#f7f2ea" />
          <stop offset="100%" stopColor="#d4c8b8" />
        </radialGradient>
      </defs>

      {/* Last move highlight */}
      {lastMove && (
        <>
          <rect x={lastMove.from.col * 100 + 5} y={lastMove.from.row * 100 + 5} width="90" height="90" fill="#ffeb3b" opacity="0.3" rx="8" />
          <rect x={lastMove.to.col   * 100 + 5} y={lastMove.to.row   * 100 + 5} width="90" height="90" fill="#4CAF50" opacity="0.3" rx="8" />
        </>
      )}

      {/* Board border */}
      <rect x="40" y="40" width="820" height="920" fill="none" stroke={theme.lines} strokeWidth="4" />

      {/* Horizontal lines */}
      {[...Array(10)].map((_, i) => (
        <line key={`h-${i}`} x1="50" y1={i * 100 + 50} x2="850" y2={i * 100 + 50} stroke={theme.lines} strokeWidth="2" />
      ))}

      {/* Vertical lines — bị tách giữa sông */}
      {[...Array(9)].map((_, i) => (
        <React.Fragment key={`v-${i}`}>
          <line x1={i * 100 + 50} y1="50" x2={i * 100 + 50} y2={i === 0 || i === 8 ? '950' : '450'} stroke={theme.lines} strokeWidth="2" />
          {i > 0 && i < 8 && <line x1={i * 100 + 50} y1="550" x2={i * 100 + 50} y2="950" stroke={theme.lines} strokeWidth="2" />}
        </React.Fragment>
      ))}

      {/* Cung tướng */}
      <line x1="350" y1="50"  x2="550" y2="250" stroke={theme.lines} strokeWidth="2" />
      <line x1="550" y1="50"  x2="350" y2="250" stroke={theme.lines} strokeWidth="2" />
      <line x1="350" y1="750" x2="550" y2="950" stroke={theme.lines} strokeWidth="2" />
      <line x1="550" y1="750" x2="350" y2="950" stroke={theme.lines} strokeWidth="2" />

      {/* Watermark sông */}
      <text x="450" y="505" textAnchor="middle" dominantBaseline="middle" fontSize="28" fontWeight="bold" fill={theme.lines} opacity="0.25" letterSpacing="8">
        CỜ ÚP PRO — {gameMode === 'standard' ? 'TIÊU CHUẨN' : 'CẢI TIẾN'}
      </text>

      {/* Tọa độ cột */}
      {[...Array(9)].map((_, i) => (
        <React.Fragment key={`coord-${i}`}>
          <text x={i * 100 + 50} y="32"  textAnchor="middle" fontSize="16" fontWeight="bold" fill={theme.lines} opacity="0.6">{i + 1}</text>
          <text x={i * 100 + 50} y="978" textAnchor="middle" fontSize="16" fontWeight="bold" fill={theme.lines} opacity="0.6">{9 - i}</text>
        </React.Fragment>
      ))}

      {/* Hoa thị */}
      {crosshairPoints.map((pt, idx) => {
        const cx = pt.c * 100 + 50, cy = pt.r * 100 + 50, d = 8, l = 20;
        return (
          <g key={`ch-${idx}`} stroke={theme.lines} strokeWidth="2">
            {pt.c > 0 && <path d={`M ${cx-d-l} ${cy-d} L ${cx-d} ${cy-d} L ${cx-d} ${cy-d-l} M ${cx-d-l} ${cy+d} L ${cx-d} ${cy+d} L ${cx-d} ${cy+d+l}`} fill="none" />}
            {pt.c < 8 && <path d={`M ${cx+d+l} ${cy-d} L ${cx+d} ${cy-d} L ${cx+d} ${cy-d-l} M ${cx+d+l} ${cy+d} L ${cx+d} ${cy+d} L ${cx+d} ${cy+d+l}`} fill="none" />}
          </g>
        );
      })}

      {/* Click zones cho ô trống */}
      {gridIntersections.map(pt => (
        <circle
          key={`grid-${pt.row}-${pt.col}`}
          cx={pt.col * 100 + 50} cy={pt.row * 100 + 50} r="45"
          fill="transparent"
          onPointerDown={(e) => handleCellPointer(e, pt.row, pt.col)}
          style={{ cursor: selectedPiece ? 'crosshair' : 'default', touchAction: 'none' }}
        />
      ))}

      {/* Quân cờ */}
      {pieces.map(p => {
        const cx = p.col * 100 + 50, cy = p.row * 100 + 50;
        const isSelected = selectedPiece?.id === p.id;
        const isJustMoved = movedPieceId === p.id;
        return (
          <g
            key={p.id}
            onPointerDown={(e) => handlePiecePointer(e, p.row, p.col, p)}
            className={shakingPieceId === p.id ? 'shake-error' : kingInCheckId === p.id ? 'in-check-warning' : isJustMoved ? 'piece-enter' : ''}
            filter="url(#piece-shadow)"
            style={{ cursor: 'pointer', touchAction: 'none' }}
          >
            {isSelected && <circle cx={cx} cy={cy} r="50" fill="none" stroke={theme.selectedGlow} strokeWidth="4" filter="none" />}
            <circle cx={cx} cy={cy} r="42" fill="url(#revealed-grad)" stroke="#999" strokeWidth="1.5" />
            {p.isHidden
              ? <circle cx={cx} cy={cy} r="34" fill="url(#hidden-grad)" stroke="#bba993" strokeWidth="1.5" />
              : <text x={cx} y={cy + 2} textAnchor="middle" dominantBaseline="middle" fontSize="46" fontWeight="bold" fill={p.color === 'red' ? theme.redText : theme.blackText}>{p.name}</text>
            }
          </g>
        );
      })}
    </svg>
  );
}