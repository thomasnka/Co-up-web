// =============================================================================
// FILE: src/core/chessLogic.js
// FIXES: B1, L1-3, L1-5, B2, B3
// =============================================================================

const HALF_ROLES = [
  ...Array(2).fill('advisor'), ...Array(2).fill('elephant'), ...Array(2).fill('horse'),
  ...Array(2).fill('chariot'), ...Array(2).fill('cannon'), ...Array(5).fill('pawn')
];

const CHARACTERS = {
  advisor:  { red: '仕', black: '士' },
  elephant: { red: '相', black: '象' },
  horse:    { red: '傌', black: '馬' },
  chariot:  { red: '俥', black: '車' },
  cannon:   { red: '炮', black: '砲' },
  pawn:     { red: '兵', black: '卒' },
};

const INITIAL_POSITIONS = [
  ...[0, 1, 2, 3, 5, 6, 7, 8].map(col => ({ row: 0, col })),
  ...[0, 1, 2, 3, 5, 6, 7, 8].map(col => ({ row: 9, col })),
  { row: 2, col: 1 }, { row: 2, col: 7 },
  { row: 7, col: 1 }, { row: 7, col: 7 },
  ...[0, 2, 4, 6, 8].map(col => ({ row: 3, col })),
  ...[0, 2, 4, 6, 8].map(col => ({ row: 6, col })),
];

// L1-5: log warning khi vị trí không map được role
const getStartingRole = (row, col) => {
  if (row === 0 || row === 9) {
    if (col === 0 || col === 8) return 'chariot';
    if (col === 1 || col === 7) return 'horse';
    if (col === 2 || col === 6) return 'elephant';
    if (col === 3 || col === 5) return 'advisor';
  }
  if ((row === 2 || row === 7) && (col === 1 || col === 7)) return 'cannon';
  if ((row === 3 || row === 6) && [0, 2, 4, 6, 8].includes(col)) return 'pawn';

  // L1-5: vị trí không trong layout chuẩn — chỉ xảy ra nếu INITIAL_POSITIONS sai
  console.warn(`[chessLogic] getStartingRole: unexpected position (${row}, ${col}) — returning null`);
  return null;
};

const shuffleArray = (array) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export const generatePieces = (mode = 'standard') => {
  let idCounter = 1;
  const finalPieces = [];
  const topRoles    = shuffleArray([...HALF_ROLES]);
  const bottomRoles = shuffleArray([...HALF_ROLES]);

  let topPool = [], bottomPool = [];
  if (mode === 'standard') {
    topPool    = topRoles.map(role => ({ role, color: 'black' }));
    bottomPool = bottomRoles.map(role => ({ role, color: 'red' }));
  } else {
    const allColors = shuffleArray([...Array(15).fill('red'), ...Array(15).fill('black')]);
    topPool    = topRoles.map((role, i) => ({ role, color: allColors[i] }));
    bottomPool = bottomRoles.map((role, i) => ({ role, color: allColors[15 + i] }));
  }

  let topIndex = 0, bottomIndex = 0;
  INITIAL_POSITIONS.forEach((pos) => {
    const pieceData = pos.row < 5 ? topPool[topIndex++] : bottomPool[bottomIndex++];
    finalPieces.push({
      id:           idCounter++,
      type:         pieceData.role,
      name:         CHARACTERS[pieceData.role][pieceData.color],
      color:        pieceData.color,
      row:          pos.row,
      col:          pos.col,
      isHidden:     true,
      isGeneral:    false,
      startingRole: getStartingRole(pos.row, pos.col),
    });
  });

  // Generals luôn lật ngửa, không úp
  finalPieces.push({ id: idCounter++, type: 'general', name: '將', color: 'black', row: 0, col: 4, isHidden: false, isGeneral: true, startingRole: 'general' });
  finalPieces.push({ id: idCounter++, type: 'general', name: '帥', color: 'red',   row: 9, col: 4, isHidden: false, isGeneral: true, startingRole: 'general' });

  return finalPieces;
};

// getEffectiveColor: quân úp thuộc phe theo hàng (row > 4 = đỏ)
export const getEffectiveColor = (piece) =>
  piece.isHidden ? (piece.row > 4 ? 'red' : 'black') : piece.color;

const getPieceAt = (pieces, row, col) =>
  pieces.find(p => p.row === row && p.col === col);

const countPiecesBetween = (pieces, startRow, startCol, endRow, endCol) => {
  let count = 0;
  if (startRow === endRow) {
    const minCol = Math.min(startCol, endCol), maxCol = Math.max(startCol, endCol);
    pieces.forEach(p => { if (p.row === startRow && p.col > minCol && p.col < maxCol) count++; });
  } else if (startCol === endCol) {
    const minRow = Math.min(startRow, endRow), maxRow = Math.max(startRow, endRow);
    pieces.forEach(p => { if (p.col === startCol && p.row > minRow && p.row < maxRow) count++; });
  }
  return count;
};

// checkBasicRules — dùng cho cả quân lật ngửa lẫn quân úp (via startingRole)
const checkBasicRules = (piece, targetRow, targetCol, allPieces) => {
  const targetPiece = getPieceAt(allPieces, targetRow, targetCol);
  if (targetPiece && getEffectiveColor(targetPiece) === getEffectiveColor(piece)) return false;

  // L1-3: guard — nếu role null/undefined (startingRole mất khi deserialize) → block nước đi
  const role = piece.isHidden ? piece.startingRole : piece.type;
  if (!role) {
    console.warn(`[chessLogic] checkBasicRules: piece id=${piece.id} has null role — move blocked`);
    return false;
  }

  const movingColor = getEffectiveColor(piece);
  const startRow = piece.row, startCol = piece.col;
  const dx = Math.abs(targetCol - startCol), dy = Math.abs(targetRow - startRow);

  switch (role) {
    case 'general':
      if (dx + dy !== 1) return false;
      if (targetCol < 3 || targetCol > 5) return false;
      if (movingColor === 'red'   && targetRow < 7) return false;
      if (movingColor === 'black' && targetRow > 2) return false;
      return true;

    case 'advisor':
      // L1-1: advisor phải ở trong cung (3–5 cột, 0–2 hoặc 7–9 hàng)
      if (dx !== 1 || dy !== 1) return false;
      if (targetCol < 3 || targetCol > 5) return false;
      if (movingColor === 'red'   && targetRow < 7) return false;
      if (movingColor === 'black' && targetRow > 2) return false;
      return true;

    case 'elephant':
      // L1-2: tượng không qua sông
      if (dx !== 2 || dy !== 2) return false;
      if (movingColor === 'red'   && targetRow < 5) return false;
      if (movingColor === 'black' && targetRow > 4) return false;
      if (getPieceAt(allPieces, (startRow + targetRow) / 2, (startCol + targetCol) / 2)) return false;
      return true;

    case 'horse':
      if (dx === 1 && dy === 2) {
        if (!getPieceAt(allPieces, startRow + (targetRow > startRow ? 1 : -1), startCol)) return true;
      } else if (dx === 2 && dy === 1) {
        if (!getPieceAt(allPieces, startRow, startCol + (targetCol > startCol ? 1 : -1))) return true;
      }
      return false;

    case 'chariot':
      if (dx !== 0 && dy !== 0) return false;
      return countPiecesBetween(allPieces, startRow, startCol, targetRow, targetCol) === 0;

    case 'cannon': {
      if (dx !== 0 && dy !== 0) return false;
      const between = countPiecesBetween(allPieces, startRow, startCol, targetRow, targetCol);
      return targetPiece ? between === 1 : between === 0;
    }

    case 'pawn': {
      const forward     = movingColor === 'red' ? -1 : 1;
      const crossedRiver = movingColor === 'red' ? startRow < 5 : startRow > 4;
      if (targetRow === startRow + forward && targetCol === startCol) return true;
      if (crossedRiver && targetRow === startRow && dx === 1) return true;
      return false;
    }

    default:
      return false;
  }
};

const isGeneralsFacing = (pieces) => {
  const redGen   = pieces.find(p => p.type === 'general' && p.color === 'red');
  const blackGen = pieces.find(p => p.type === 'general' && p.color === 'black');
  if (!redGen || !blackGen) return false;
  if (redGen.col !== blackGen.col) return false;
  return countPiecesBetween(pieces, blackGen.row, blackGen.col, redGen.row, redGen.col) === 0;
};

// B1 FIX: bỏ điều kiện !p.isHidden — quân úp ĐƯỢC phép chiếu tướng (dùng startingRole)
export const isKingInCheck = (pieces, kingColor) => {
  const king = pieces.find(p => p.type === 'general' && p.color === kingColor);
  if (!king) return false;
  for (const p of pieces) {
    if (getEffectiveColor(p) === kingColor) continue;  // bỏ qua quân cùng phe
    if (checkBasicRules(p, king.row, king.col, pieces)) return true;
  }
  return false;
};

export const getBoardHash = (pieces, turnColor) => {
  const sorted = [...pieces].sort((a, b) => a.id - b.id);
  return turnColor + '|' + sorted.map(p => `${p.id}:${p.row}${p.col}${p.isHidden ? 'H' : 'S'}`).join('');
};

export const isValidMove = (piece, targetRow, targetCol, allPieces, historyStates = []) => {
  if (!checkBasicRules(piece, targetRow, targetCol, allPieces)) return false;

  const movingColor = getEffectiveColor(piece);
  let sim = allPieces.filter(p => !(p.row === targetRow && p.col === targetCol));
  sim = sim.map(p => p.id === piece.id
    ? { ...p, row: targetRow, col: targetCol, isHidden: false }
    : p
  );

  if (isGeneralsFacing(sim)) return false;
  if (isKingInCheck(sim, movingColor)) return false;

  // Threefold repetition
  const nextTurn = movingColor === 'red' ? 'black' : 'red';
  const simHash  = getBoardHash(sim, nextTurn);
  if (historyStates.filter(h => h === simHash).length >= 2) return false;

  return true;
};

export const hasValidMoves = (pieces, color, historyStates = []) => {
  for (const piece of pieces) {
    if (getEffectiveColor(piece) !== color) continue;
    for (let r = 0; r <= 9; r++) {
      for (let c = 0; c <= 8; c++) {
        if (isValidMove(piece, r, c, pieces, historyStates)) return true;
      }
    }
  }
  return false;
};

export const checkGameStatus = (pieces, turnColor, halfMoveClock, historyStates = []) => {
  if (halfMoveClock >= 100) return 'draw_50';

  // B2 FIX: chỉ tuyên bố draw_material khi TẤT CẢ quân đã lật ngửa
  // Quân úp chưa lật có thể là xe/pháo — không thể kết luận thiếu quân tấn công
  const allRevealed = pieces.every(p => !p.isHidden);
  if (allRevealed) {
    const hasAttacker = pieces.some(p =>
      ['chariot', 'cannon', 'horse', 'pawn'].includes(p.type)
    );
    if (!hasAttacker) return 'draw_material';
  }

  if (!hasValidMoves(pieces, turnColor, historyStates)) {
    return isKingInCheck(pieces, turnColor)
      ? `checkmate_${turnColor}`
      : `stalemate_${turnColor}`;
  }

  return 'playing';
};

// B3 FIX: getNotation dùng effectiveRole để tính distance đúng khi quân vừa lật
export const getNotation = (piece, targetRow, targetCol, allPieces) => {
  const isRed        = getEffectiveColor(piece) === 'red';
  const startFile    = isRed ? 9 - piece.col : piece.col + 1;
  const targetFile   = isRed ? 9 - targetCol : targetCol + 1;

  // B3: dùng effectiveRole thay vì piece.type
  const effectiveRole = piece.isHidden ? (piece.startingRole ?? piece.type) : piece.type;

  let direction;
  if (targetRow === piece.row) {
    direction = 'bình';
  } else {
    direction = (isRed ? targetRow < piece.row : targetRow > piece.row) ? 'tiến' : 'thoái';
  }

  let distance;
  if (direction !== 'bình' && ['chariot', 'cannon', 'pawn', 'general'].includes(effectiveRole)) {
    distance = Math.abs(targetRow - piece.row);
  } else {
    distance = targetFile;
  }

  // Prefix Tiền/Hậu cho quân đã lật ngửa
  let prefix = '';
  if (!piece.isHidden && ['chariot', 'cannon', 'horse', 'pawn'].includes(effectiveRole)) {
    const sameFile = allPieces.filter(p =>
      !p.isHidden &&
      getEffectiveColor(p) === getEffectiveColor(piece) &&
      p.type === piece.type &&
      p.col  === piece.col
    );
    if (sameFile.length === 2) {
      sameFile.sort((a, b) => a.row - b.row);
      const isFront = isRed
        ? piece.id === sameFile[0].id
        : piece.id === sameFile[1].id;
      prefix = isFront ? 'Tiền ' : 'Hậu ';
    }
  }

  const moveNotation = prefix
    ? `${prefix}${piece.name} ${direction} ${distance}`
    : `${piece.name} ${startFile} ${direction} ${distance}`;

  return {
    pos:  `[${piece.row}, ${piece.col}]`,
    move: moveNotation,
  };
};