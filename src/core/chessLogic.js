// =============================================================================
// FILE: src/core/chessLogic.js
// FIXES HISTORY: B1, L1-3, L1-5, B2, B3
// SESSION FIXES:
//   C1 — B-HIDDEN-CAN-CHECK: quân úp KHÔNG được chiếu tướng (xqchess: hidden_can_check=false)
//   C2 — B-ADVISOR-ELEPHANT-OPENED: advisor/elephant đã lật KHÔNG bị giới hạn cung/sông
//        Logic: khi lật ra (isHidden=false), quân chơi theo luật cờ tướng chuẩn
//               NHƯNG trong cờ úp, khi quân được "mở" (opened=true sau lần đi đầu),
//               advisor và elephant thoát khỏi ràng buộc palace/river.
//               Ref: xqchess source — piece.opened flag
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

const getStartingRole = (row, col) => {
  if (row === 0 || row === 9) {
    if (col === 0 || col === 8) return 'chariot';
    if (col === 1 || col === 7) return 'horse';
    if (col === 2 || col === 6) return 'elephant';
    if (col === 3 || col === 5) return 'advisor';
  }
  if ((row === 2 || row === 7) && (col === 1 || col === 7)) return 'cannon';
  if ((row === 3 || row === 6) && [0, 2, 4, 6, 8].includes(col)) return 'pawn';
  console.warn(`[chessLogic] getStartingRole: unexpected position (${row}, ${col})`);
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
      // C2: opened=false khi mới sinh — set true sau lần đi đầu tiên (trong useGameState)
      opened:       false,
      isGeneral:    false,
      startingRole: getStartingRole(pos.row, pos.col),
    });
  });

  // Generals luôn lật ngửa, không úp; opened=true vì không có ràng buộc special
  finalPieces.push({
    id: idCounter++, type: 'general', name: '將', color: 'black',
    row: 0, col: 4, isHidden: false, opened: true, isGeneral: true, startingRole: 'general',
  });
  finalPieces.push({
    id: idCounter++, type: 'general', name: '帥', color: 'red',
    row: 9, col: 4, isHidden: false, opened: true, isGeneral: true, startingRole: 'general',
  });

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

// =============================================================================
// checkBasicRules
//
// C2 KEY LOGIC:
//   - piece.isHidden=true  → dùng startingRole, bị giới hạn palace/river (chưa lật)
//   - piece.isHidden=false, piece.opened=false → vừa lật ra lần đầu, VẪN bị giới hạn
//     (nước đi đầu tiên sau khi lật là nước lật chính nó, opened sẽ = true SAU đó)
//   - piece.isHidden=false, piece.opened=true  → đã từng di chuyển, KHÔNG bị giới hạn
//
// Tóm lại: advisor/elephant chỉ bị giới hạn khi !piece.opened
// =============================================================================
const checkBasicRules = (piece, targetRow, targetCol, allPieces) => {
  const targetPiece = getPieceAt(allPieces, targetRow, targetCol);
  if (targetPiece && getEffectiveColor(targetPiece) === getEffectiveColor(piece)) return false;

  const role = piece.isHidden ? piece.startingRole : piece.type;
  if (!role) {
    console.warn(`[chessLogic] checkBasicRules: piece id=${piece.id} has null role — move blocked`);
    return false;
  }

  const movingColor = getEffectiveColor(piece);
  const startRow = piece.row, startCol = piece.col;
  const dx = Math.abs(targetCol - startCol), dy = Math.abs(targetRow - startRow);

  // C2: opened flag — true khi quân đã từng di chuyển sau khi lật
  // Advisor và Elephant opened=true → thoát khỏi ràng buộc palace/river
  const isOpened = piece.opened === true;

  switch (role) {
    case 'general':
      // General luôn bị giới hạn trong cung (không có opened exception)
      if (dx + dy !== 1) return false;
      if (targetCol < 3 || targetCol > 5) return false;
      if (movingColor === 'red'   && targetRow < 7) return false;
      if (movingColor === 'black' && targetRow > 2) return false;
      return true;

    case 'advisor':
      if (dx !== 1 || dy !== 1) return false;
      // C2: nếu opened → không bị giới hạn palace
      if (!isOpened) {
        if (targetCol < 3 || targetCol > 5) return false;
        if (movingColor === 'red'   && targetRow < 7) return false;
        if (movingColor === 'black' && targetRow > 2) return false;
      }
      return true;

    case 'elephant':
      if (dx !== 2 || dy !== 2) return false;
      // C2: nếu opened → không bị giới hạn sông
      if (!isOpened) {
        if (movingColor === 'red'   && targetRow < 5) return false;
        if (movingColor === 'black' && targetRow > 4) return false;
      }
      // Bị chặn voi (象眼) vẫn áp dụng dù opened hay không
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
      const forward      = movingColor === 'red' ? -1 : 1;
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

// =============================================================================
// isKingInCheck
//
// C1 FIX — B-HIDDEN-CAN-CHECK:
//   Revert B1 — quân úp KHÔNG được chiếu tướng.
//   Lý do: xqchess source confirm hidden_can_check: false
//   Quân úp chưa biết danh tính → không thể "chiếu" một cách hợp lệ.
//   Chỉ quân đã lật ngửa (!p.isHidden) mới có thể chiếu tướng.
// =============================================================================
export const isKingInCheck = (pieces, kingColor) => {
  const king = pieces.find(p => p.type === 'general' && p.color === kingColor);
  if (!king) return false;
  for (const p of pieces) {
    if (getEffectiveColor(p) === kingColor) continue; // bỏ qua quân cùng phe
    if (p.isHidden) continue;                          // C1: quân úp không chiếu được
    if (checkBasicRules(p, king.row, king.col, pieces)) return true;
  }
  return false;
};

export const getBoardHash = (pieces, turnColor) => {
  const sorted = [...pieces].sort((a, b) => a.id - b.id);
  // C2: hash bao gồm opened flag để threefold repetition detect đúng
  return turnColor + '|' + sorted.map(p =>
    `${p.id}:${p.row}${p.col}${p.isHidden ? 'H' : 'S'}${p.opened ? 'O' : 'C'}`
  ).join('');
};

export const isValidMove = (piece, targetRow, targetCol, allPieces, historyStates = []) => {
  if (!checkBasicRules(piece, targetRow, targetCol, allPieces)) return false;

  const movingColor = getEffectiveColor(piece);

  // Simulate board sau nước đi
  // C2: khi quân di chuyển → set opened=true trong simulation
  let sim = allPieces.filter(p => !(p.row === targetRow && p.col === targetCol));
  sim = sim.map(p => p.id === piece.id
    ? { ...p, row: targetRow, col: targetCol, isHidden: false, opened: true }
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
  if (halfMoveClock >= 64) return 'draw_50'; // C3: Cờ úp dùng 64 thay vì 100 (ít quân hơn)

  // B2: chỉ tuyên bố draw_material khi TẤT CẢ quân đã lật ngửa
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

// B3: getNotation dùng effectiveRole
export const getNotation = (piece, targetRow, targetCol, allPieces) => {
  const isRed        = getEffectiveColor(piece) === 'red';
  const startFile    = isRed ? 9 - piece.col : piece.col + 1;
  const targetFile   = isRed ? 9 - targetCol : targetCol + 1;
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