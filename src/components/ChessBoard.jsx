// src/components/ChessBoard.jsx

import React, { useMemo, useCallback } from 'react';

export default function ChessBoard({
  theme, gameMode,
  pieces, selectedPiece, shakingPieceId, kingInCheckId, lastMove,
  validMoves = [], movedPieceId = null, isFlipped = false,
  flippingPieceId = null,
  onPieceClick, onCellClick,
}) {
  const validMovesSet = useMemo(() =>
    new Set(validMoves.map(m => `${m.row}-${m.col}`)),
    [validMoves]
  );

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

  const isDay = theme.board === '#f5deb3';

  return (
    <svg
      viewBox="0 0 900 1000"
      style={{ width: '100%', backgroundColor: theme.board, display: 'block', touchAction: 'none' }}
    >
      <defs>
        {/* ── FILTERS ───────────────────────────────────────────── */}
        {/* Day filters */}
        <filter id="piece-shadow-day" x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="1.5" dy="2" stdDeviation="2.5" floodColor="rgba(0,0,0,0.4)" />
        </filter>
        {/* Night filter — stronger shadow + subtle rim light */}
        <filter id="piece-shadow-night" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="2" dy="2.5" stdDeviation="3" floodColor="rgba(0,0,0,0.6)" />
        </filter>
        <filter id="piece-shadow-selected" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor={theme.selectedGlow} floodOpacity="0.9" />
        </filter>
        <filter id="check-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="0" stdDeviation="10" floodColor="rgba(220,50,50,0.95)" />
        </filter>

        {/* ── PIECE GRADIENTS (Day) ──────────────────────────────── */}
        <radialGradient id="piece-bg-day" cx="38%" cy="32%" r="62%">
          <stop offset="0%"   stopColor="#fffdf5" />
          <stop offset="55%"  stopColor="#f5edd8" />
          <stop offset="100%" stopColor="#ddd0b0" />
        </radialGradient>
        <radialGradient id="piece-bg-day-selected" cx="38%" cy="32%" r="62%">
          <stop offset="0%"   stopColor="#fffff0" />
          <stop offset="55%"  stopColor="#fdf5d8" />
          <stop offset="100%" stopColor="#e8d89a" />
        </radialGradient>
        <radialGradient id="piece-hidden-day" cx="38%" cy="32%" r="62%">
          <stop offset="0%"   stopColor="#c8a46a" />
          <stop offset="55%"  stopColor="#a07838" />
          <stop offset="100%" stopColor="#6a4a10" />
        </radialGradient>

        {/* ── PIECE GRADIENTS (Night) — sáng hơn để thấy 3D effect ── */}
        <radialGradient id="piece-bg-night" cx="38%" cy="32%" r="62%">
          <stop offset="0%"   stopColor="#8a7860" />
          <stop offset="55%"  stopColor="#5a4830" />
          <stop offset="100%" stopColor="#2e2015" />
        </radialGradient>
        <radialGradient id="piece-bg-night-selected" cx="38%" cy="32%" r="62%">
          <stop offset="0%"   stopColor="#a09070" />
          <stop offset="55%"  stopColor="#70603a" />
          <stop offset="100%" stopColor="#3c2c18" />
        </radialGradient>
        <radialGradient id="piece-hidden-night" cx="38%" cy="32%" r="62%">
          <stop offset="0%"   stopColor="#9a7848" />
          <stop offset="55%"  stopColor="#6a4a18" />
          <stop offset="100%" stopColor="#3a2808" />
        </radialGradient>

        {/* ── BOARD TEXTURE OVERLAY ─────────────────────────────── */}
        <pattern id="wood-grain" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
          <rect width="200" height="200" fill="none"/>
          <line x1="0" y1="40" x2="200" y2="50" stroke="rgba(0,0,0,0.018)" strokeWidth="2"/>
          <line x1="0" y1="80" x2="200" y2="95" stroke="rgba(0,0,0,0.012)" strokeWidth="1.5"/>
          <line x1="0" y1="130" x2="200" y2="120" stroke="rgba(0,0,0,0.015)" strokeWidth="2"/>
          <line x1="0" y1="170" x2="200" y2="165" stroke="rgba(0,0,0,0.01)" strokeWidth="1"/>
        </pattern>
              {/* Custom piece gradients */}
        <radialGradient id="piece-red" cx="38%" cy="32%" r="62%">
          <stop offset="0%"   stopColor="#9f9595" />
          <stop offset="55%"  stopColor="#000000" />
          <stop offset="100%" stopColor="#ff0000" />
        </radialGradient>
        <radialGradient id="piece-black" cx="38%" cy="32%" r="62%">
          <stop offset="0%"   stopColor="#969595" />
          <stop offset="55%"  stopColor="#000000" />
          <stop offset="100%" stopColor="#00a2ff" />
        </radialGradient>
</defs>

      {/* Board wood grain texture */}
      <rect x="0" y="0" width="900" height="1000" fill="url(#wood-grain)" />

      <g transform={isFlipped ? 'rotate(180, 450, 500)' : undefined}>

        {/* ── LAST MOVE HIGHLIGHT ────────────────────────────────── */}
        {lastMove && (
          <>
            <rect
              x={lastMove.from.col * 100 + 8} y={lastMove.from.row * 100 + 8}
              width="84" height="84" rx="6"
              fill={isDay ? 'rgba(200,170,60,0.28)' : 'rgba(200,170,60,0.2)'}
            />
            <rect
              x={lastMove.to.col * 100 + 8} y={lastMove.to.row * 100 + 8}
              width="84" height="84" rx="6"
              fill={isDay ? 'rgba(80,180,80,0.28)' : 'rgba(80,180,80,0.22)'}
            />
          </>
        )}

        {/* ── BOARD BORDER ──────────────────────────────────────── */}
        <rect x="40" y="40" width="820" height="920" fill="none"
          stroke='rgba(139,90,43,0.5)'
          strokeWidth="3" rx="2"
        />

        {/* ── HORIZONTAL LINES ──────────────────────────────────── */}
        {[...Array(10)].map((_, i) => (
          <line key={`h-${i}`}
            x1="50" y1={i * 100 + 50} x2="850" y2={i * 100 + 50}
            stroke={isDay ? 'rgba(100,70,20,0.55)' : 'rgba(150,120,60,0.4)'}
            strokeWidth="1.2"
          />
        ))}

        {/* ── VERTICAL LINES ────────────────────────────────────── */}
        {[...Array(9)].map((_, i) => (
          <React.Fragment key={`v-${i}`}>
            <line
              x1={i * 100 + 50} y1="50"
              x2={i * 100 + 50} y2={i === 0 || i === 8 ? '950' : '450'}
              stroke={isDay ? 'rgba(100,70,20,0.55)' : 'rgba(150,120,60,0.4)'}
              strokeWidth="1.2"
            />
            {i > 0 && i < 8 && (
              <line
                x1={i * 100 + 50} y1="550"
                x2={i * 100 + 50} y2="950"
                stroke={isDay ? 'rgba(100,70,20,0.55)' : 'rgba(150,120,60,0.4)'}
                strokeWidth="1.2"
              />
            )}
          </React.Fragment>
        ))}

        {/* ── PALACE DIAGONALS ──────────────────────────────────── */}
        {[
          [350,50,550,250],[550,50,350,250],
          [350,750,550,950],[550,750,350,950]
        ].map(([x1,y1,x2,y2],i) => (
          <line key={`d-${i}`} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={isDay ? 'rgba(100,70,20,0.55)' : 'rgba(150,120,60,0.4)'}
            strokeWidth="1.2"
          />
        ))}

        {/* ── RIVER LABEL — thay bằng brand + mode ─────────────── */}
        {(() => {
          const label = gameMode === 'innovative' ? 'Cải Tiến' : 'Tiêu Chuẩn';
          const labelLeft = 'Cờ Úp Pro';
          const labelRight = label;
          return (
          <>
          <text x="250" y={503} textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight="600" letterSpacing="2" fill="rgba(139,90,43,0.5)">{labelLeft}</text>
          <text x="650" y={503} textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight="600" letterSpacing="2" fill="rgba(139,90,43,0.5)">{labelRight}</text>
          </>
        );
        })()}

        {/* ── COORDINATE LABELS ─────────────────────────────────── */}
        {[...Array(9)].map((_, i) => (
          <React.Fragment key={`coord-${i}`}>
            <text x={i * 100 + 50} y="28" textAnchor="middle" fontSize="14"
              fill={isDay ? 'rgba(100,70,20,0.45)' : 'rgba(180,140,60,0.4)'}
              transform={isFlipped ? `rotate(180, ${i * 100 + 50}, 28)` : undefined}
            >{isFlipped ? 9 - i : i + 1}</text>
            <text x={i * 100 + 50} y="980" textAnchor="middle" fontSize="14"
              fill={isDay ? 'rgba(100,70,20,0.45)' : 'rgba(180,140,60,0.4)'}
              transform={isFlipped ? `rotate(180, ${i * 100 + 50}, 980)` : undefined}
            >{isFlipped ? i + 1 : 9 - i}</text>
          </React.Fragment>
        ))}

        {/* ── CROSSHAIR MARKERS ─────────────────────────────────── */}
        {crosshairPoints.map((pt, idx) => {
          const cx = pt.c * 100 + 50, cy = pt.r * 100 + 50, d = 9, l = 18;
          const s = isDay ? 'rgba(100,70,20,0.45)' : 'rgba(180,140,60,0.35)';
          return (
            <g key={`ch-${idx}`} stroke={s} strokeWidth="1.5">
              {pt.c > 0 && <path d={`M ${cx-d-l} ${cy-d} L ${cx-d} ${cy-d} L ${cx-d} ${cy-d-l} M ${cx-d-l} ${cy+d} L ${cx-d} ${cy+d} L ${cx-d} ${cy+d+l}`} fill="none"/>}
              {pt.c < 8 && <path d={`M ${cx+d+l} ${cy-d} L ${cx+d} ${cy-d} L ${cx+d} ${cy-d-l} M ${cx+d+l} ${cy+d} L ${cx+d} ${cy+d} L ${cx+d} ${cy+d+l}`} fill="none"/>}
            </g>
          );
        })}

        {/* ── VALID MOVE DOTS ───────────────────────────────────── */}
        {validMoves.map(m => (
          <circle key={`vm-${m.row}-${m.col}`}
            cx={m.col * 100 + 50} cy={m.row * 100 + 50} r="13"
            fill="rgba(146,207,44,0.82)"
            style={{ pointerEvents: 'none', filter: 'drop-shadow(0 0 4px rgba(80,150,0,0.5))' }}
          />
        ))}

        {/* ── CELL CLICK ZONES ──────────────────────────────────── */}
        {gridIntersections.map(pt => (
          <circle key={`grid-${pt.row}-${pt.col}`}
            cx={pt.col * 100 + 50} cy={pt.row * 100 + 50} r="46"
            fill="transparent"
            onPointerDown={(e) => handleCellPointer(e, pt.row, pt.col)}
            style={{ cursor: selectedPiece ? 'crosshair' : 'default', touchAction: 'none' }}
          />
        ))}

        {/* ── PIECES ────────────────────────────────────────────── */}
        {pieces.map(p => {
          const cx = p.col * 100 + 50;
          const cy = p.row * 100 + 50;
          const isSelected    = selectedPiece?.id === p.id;
          const isInCheck     = kingInCheckId === p.id;
          const isShaking     = shakingPieceId === p.id;
          const isJustMoved   = movedPieceId === p.id;
          const isFlipping    = flippingPieceId === p.id;
          const isValidTarget = validMovesSet.has(`${p.row}-${p.col}`);

          const bgGrad    = p.isHidden
          ? (isDay ? 'url(#piece-hidden-day)' : 'url(#piece-hidden-night)')
          : p.color === 'red' ? 'url(#piece-red)' : 'url(#piece-black)';
          const hiddenGrad = p.color === 'red' ? theme.rimRed : theme.rimBlack;

          const outerR     = 40;
          const innerR     = 33;
          const outerStroke = isDay
            ? (isSelected ? '#c8a020' : isValidTarget ? '#b05030' : '#8a6828')
            : (isSelected ? '#d4a030' : isValidTarget ? '#c06040' : '#9a8848');  // sáng hơn
          const innerStroke = isDay
            ? (isSelected ? '#e8c040' : '#b09050')
            : (isSelected ? '#f0c840' : '#8a7050');  // sáng hơn để thấy bevel
          const outerWidth  = isSelected ? 2.5 : 1.8;
          const innerWidth  = isSelected ? 1.8 : 1.2;

          const textColor = p.color === 'red' ? theme.redText : theme.blackText;

          const filterAttr = isInCheck
            ? 'url(#check-glow)'
            : isSelected
            ? 'url(#piece-shadow-selected)'
            : isDay ? 'url(#piece-shadow-day)' : 'url(#piece-shadow-night)';

          return (
            <g
              key={p.id}
              onPointerDown={(e) => handlePiecePointer(e, p.row, p.col, p)}
              className={isShaking ? 'shake-error' : isFlipping ? 'piece-flip' : isJustMoved ? 'piece-enter' : ''}
              filter={filterAttr}
              style={{ cursor: 'pointer', touchAction: 'none' }}
            >
              {/* Capture target ring */}
              {isValidTarget && !p.isHidden && (
                <circle cx={cx} cy={cy} r={outerR + 5}
                  fill="none"
                  stroke="rgba(220,70,50,0.7)"
                  strokeWidth="2.5"
                />
              )}

              {/* Outer ring */}
              <circle cx={cx} cy={cy} r={outerR}
                fill={bgGrad}
                  stroke={p.isHidden ? hiddenGrad : outerStroke}
                  strokeWidth={p.isHidden ? 2 : outerWidth}
                />
              {/* Bevel ring — đường viền đậm sát mép ngoài, tạo cảm giác nặng */}
              <circle cx={cx} cy={cy} r={outerR - 3}
                fill="none"
                stroke={isDay ? 'rgba(60,35,5,0.55)' : 'rgba(20,10,0,0.7)'}
                strokeWidth="2.5"
              />

              {/* Inner ring — bevel effect */}
              <circle cx={cx} cy={cy} r={innerR}
                fill="none"
                stroke={innerStroke}
                strokeWidth={innerWidth}
                opacity="0.7"
              />
              {/* Piece content */}
              {p.isHidden ? (
                <>
                  {/* A1 — Mặt lưng gỗ: vân đồng tâm, không chữ */}
              <circle
                cx={cx} cy={cy}
                r={36}
                fill={isDay ? 'rgba(100,65,15,0.18)' : 'rgba(60,35,5,0.25)'}
              />
              <circle
                cx={cx} cy={cy}
                r={26}
                fill="none"
                stroke='rgba(255,255,255,0.68)'
                strokeWidth="1.8"
              />
              <circle
                cx={cx} cy={cy}
                r={17}
                fill="none"
                stroke='rgba(255,255,255,0.68)'
                strokeWidth="1.4"
              />
              <circle
                cx={cx} cy={cy}
                r={7}
                fill={isDay ? 'rgba(90,55,10,0.4)' : 'rgba(55,32,5,0.45)'}
              />
                </>
              ) : (
                <text
                  x={cx} y={cy + 2}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize="44" fontWeight="700"
                  fill={textColor}
                  style={{
                    fontFamily: '"Noto Serif SC", "STKaiti", "KaiTi", "FZKai-Z03", serif',
                    userSelect: 'none',
                    textShadow: isInCheck ? '0 0 8px rgba(255,80,80,0.8)' : undefined,
                  }}
                  transform={isFlipped ? `rotate(180, ${cx}, ${cy + 2})` : undefined}
                >
                  {p.name}
                </text>
              )}
            </g>
          );
        })}

      </g>
    </svg>
  );
}