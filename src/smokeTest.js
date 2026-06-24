/**
 * smokeTest.js — tự chạy khi app khởi động
 * Kiểm tra các module cốt lõi hoạt động đúng, log ra console.
 * Prefix [SMOKE] ✅/❌ để dễ lọc trong DevTools.
 */

const T = '[SMOKE]';
const ok  = (n)    => console.log(`${T} \u2705 ${n}`);
const err = (n, e) => console.error(`${T} \u274c ${n}:`, e?.message ?? e);

export async function runSmokeTests() {
  console.group(`${T} === Smoke Tests ===`);

  // 1. chessLogic: load + có đủ exports cần thiết
  try {
    const logic = await import('./core/chessLogic.js');
    const need = ['generatePieces','isValidMove','hasValidMoves','isKingInCheck','checkGameStatus'];
    const miss = need.filter(fn => typeof logic[fn] !== 'function');
    if (miss.length) err('chessLogic exports', `Missing: ${miss.join(', ')}`);
    else ok(`chessLogic — ${need.length} functions present`);
  } catch (e) { err('chessLogic import', e); }

  // 2. generatePieces trả về array quân cờ hợp lệ
  try {
    const { generatePieces } = await import('./core/chessLogic.js');
    const pieces = generatePieces('standard');
    if (!Array.isArray(pieces) || pieces.length === 0)
      err('generatePieces', `Expected array, got ${typeof pieces}`);
    else {
      const hasId   = pieces.every(p => p.id !== undefined);
      const hasPos  = pieces.every(p => p.row !== undefined && p.col !== undefined);
      const hasName = pieces.every(p => p.name);
      if (!hasId || !hasPos || !hasName)
        err('generatePieces shape', 'Pieces missing id/row/col/name');
      else
        ok(`generatePieces — ${pieces.length} pieces, shape OK`);
    }
  } catch (e) { err('generatePieces run', e); }

  // 3. isValidMove không crash với input giả
  try {
    const { generatePieces, isValidMove } = await import('./core/chessLogic.js');
    const pieces = generatePieces('standard');
    const piece = pieces[0];
    // Gọi với target random — chỉ cần không crash
    const result = isValidMove(piece, piece.row, piece.col + 1, pieces);
    if (typeof result !== 'boolean' && !Array.isArray(result))
      err('isValidMove return', `Expected boolean/array, got ${typeof result}`);
    else
      ok(`isValidMove — returns ${typeof result}`);
  } catch (e) { err('isValidMove run', e); }

  // 4. THEMES object có ít nhất 1 theme
  try {
    const { THEMES } = await import('./constants/themes.js');
    const keys = THEMES ? Object.keys(THEMES) : [];
    if (keys.length === 0) err('THEMES', 'Empty or undefined');
    else ok(`THEMES — ${keys.length} theme(s): ${keys.join(', ')}`);
  } catch (e) { err('THEMES import', e); }

  // 5. supabase client có method .from()
  try {
    const { supabase } = await import('./core/supabaseClient.js');
    if (!supabase || typeof supabase.from !== 'function')
      err('supabase', 'supabase.from not a function');
    else
      ok('supabase client — OK');
  } catch (e) { err('supabase import', e); }

  // 6. DOM: root element tồn tại
  if (document.getElementById('root'))
    ok('DOM — #root element found');
  else
    err('DOM', '#root element missing — app cannot mount');

  console.groupEnd();
}
