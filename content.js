const PIECE_MAP = {
  king: 'k', advisor: 'a', elephant: 'b',
  horse: 'n', rook: 'r', cannon: 'c', pawn: 'p',
};

function parsePieceAlt(alt) {
  const m = alt && alt.match(/^(king|advisor|elephant|horse|rook|cannon|pawn)-(red|brown)-zh$/);
  if (!m) return null;
  const ch = PIECE_MAP[m[1]];
  return m[2] === 'red' ? ch.toUpperCase() : ch;
}

let cachedUserSide = null;

function detectUserSide() {
  const pieces = document.querySelectorAll('#game-grid .pieces-container [class*="PieceWrapper"]');
  let bestY = -Infinity, bestAlt = null;
  for (const wrap of pieces) {
    const img = wrap.querySelector('img.img-holder');
    if (!img || !img.alt || !img.alt.startsWith('king-')) continue;
    const rect = wrap.getBoundingClientRect();
    if (rect.top > bestY) { bestY = rect.top; bestAlt = img.alt; }
  }
  if (bestAlt && bestAlt.startsWith('king-red-')) return 'w';
  if (bestAlt && bestAlt.startsWith('king-brown-')) return 'b';
  return 'w';
}

function getUserSide() {
  if (cachedUserSide) return cachedUserSide;
  cachedUserSide = detectUserSide();
  return cachedUserSide;
}

function readBoard() {
  const grid = document.querySelector('#game-grid');
  if (!grid) throw new Error('#game-grid not found');

  const squares = [...grid.querySelectorAll('.square')];
  if (squares.length !== 90) throw new Error(`expected 90 squares, got ${squares.length}`);

  const squareCenters = squares.map(sq => {
    const m = sq.className.match(/(\d+)-([a-i])/);
    if (!m) return null;
    const pageR = parseInt(m[1], 10);
    const pageColIdx = m[2].charCodeAt(0) - 'a'.charCodeAt(0);
    const rect = sq.getBoundingClientRect();
    return { pageR, pageColIdx, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
  }).filter(Boolean);

  const userSide = getUserSide();
  const board = Array.from({ length: 10 }, () => Array(9).fill(null));
  const pieces = grid.querySelectorAll('.pieces-container [class*="PieceWrapper"]');

  for (const wrap of pieces) {
    const img = wrap.querySelector('img.img-holder');
    const ch = parsePieceAlt(img && img.alt);
    if (!ch) continue;
    const r = wrap.getBoundingClientRect();
    const px = r.left + r.width / 2;
    const py = r.top + r.height / 2;
    let best = null, bestD = Infinity;
    for (const sc of squareCenters) {
      const d = (sc.cx - px) ** 2 + (sc.cy - py) ** 2;
      if (d < bestD) { bestD = d; best = sc; }
    }
    if (!best) continue;
    let rank, file;
    if (userSide === 'b') {
      rank = best.pageR - 1;
      file = 8 - best.pageColIdx;
    } else {
      rank = 10 - best.pageR;
      file = best.pageColIdx;
    }
    board[rank][file] = ch;
  }
  return board;
}

function boardToFen(board) {
  return board.map(row => {
    let s = '', empty = 0;
    for (const c of row) {
      if (c === null) { empty++; }
      else { if (empty) { s += empty; empty = 0; } s += c; }
    }
    if (empty) s += empty;
    return s;
  }).join('/');
}

function readBoardToFen() {
  return boardToFen(readBoard());
}

function whoJustMoved(prev, curr) {
  let changed = 0, mover = null;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const a = prev[r][c], b = curr[r][c];
      if (a !== b) {
        changed++;
        if (b && b !== a) mover = b === b.toUpperCase() ? 'w' : 'b';
      }
    }
  }
  return { mover, changed };
}

function findSquareEl(file, uciRank) {
  const userSide = getUserSide();
  let pageR, pageCol;
  if (userSide === 'b') {
    pageR = 10 - uciRank;
    pageCol = String.fromCharCode('a'.charCodeAt(0) + (8 - file));
  } else {
    pageR = uciRank + 1;
    pageCol = String.fromCharCode('a'.charCodeAt(0) + file);
  }
  return document.querySelector(`#game-grid .square.${CSS.escape(`${pageR}-${pageCol}`)}`)
      || [...document.querySelectorAll(`#game-grid .square`)].find(s => s.className.includes(` ${pageR}-${pageCol}`));
}

function parseUciMove(uci) {
  const m = uci && uci.match(/^([a-i])(\d)([a-i])(\d)$/);
  if (!m) return null;
  return {
    from: { file: m[1].charCodeAt(0) - 97, rank: parseInt(m[2], 10) },
    to:   { file: m[3].charCodeAt(0) - 97, rank: parseInt(m[4], 10) },
  };
}

const HIGHLIGHT_ID = 'xq-bot-highlight';
let highlightTimer = null;

function clearHighlights() {
  if (highlightTimer) { clearTimeout(highlightTimer); highlightTimer = null; }
  document.getElementById(HIGHLIGHT_ID)?.remove();
}

function highlightMove(uci) {
  clearHighlights();
  const mv = parseUciMove(uci);
  if (!mv) return false;
  const fromEl = findSquareEl(mv.from.file, mv.from.rank);
  const toEl   = findSquareEl(mv.to.file,   mv.to.rank);
  if (!fromEl || !toEl) return false;

  const layer = document.createElement('div');
  layer.id = HIGHLIGHT_ID;
  Object.assign(layer.style, {
    position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: 99999,
  });

  for (const [el, color, label] of [[fromEl, '#ffd60a', 'FROM'], [toEl, '#ff453a', 'TO']]) {
    const r = el.getBoundingClientRect();
    const box = document.createElement('div');
    Object.assign(box.style, {
      position: 'absolute',
      left: `${r.left}px`, top: `${r.top}px`,
      width: `${r.width}px`, height: `${r.height}px`,
      border: `3px solid ${color}`,
      borderRadius: '4px',
      boxSizing: 'border-box',
      boxShadow: `0 0 12px ${color}`,
    });
    const tag = document.createElement('div');
    tag.textContent = label;
    Object.assign(tag.style, {
      position: 'absolute', top: '-18px', left: '0',
      fontSize: '11px', fontWeight: 'bold', color, textShadow: '0 0 4px black',
    });
    box.appendChild(tag);
    layer.appendChild(box);
  }
  document.body.appendChild(layer);
  highlightTimer = setTimeout(clearHighlights, 8000);
  return true;
}

const STARTPOS_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR';

const AUTO = {
  enabled: false,
  movetime: 1000,
  userSide: null,
  prevBoard: null,
  prevFen: null,
  pollTimer: null,
  busy: false,
};

function logStatus(extra = {}) {
  chrome.runtime.sendMessage({ type: 'AUTO_STATUS', ...AUTO, ...extra }).catch(() => {});
}

async function autoTick() {
  if (!AUTO.enabled || AUTO.busy) return;
  let curr;
  try { curr = readBoard(); } catch { return; }
  const fen = boardToFen(curr);

  const diff = AUTO.prevBoard ? whoJustMoved(AUTO.prevBoard, curr) : { mover: null, changed: 0 };

  if (fen === STARTPOS_FEN && AUTO.prevFen !== STARTPOS_FEN) {
    cachedUserSide = null;
    AUTO.userSide = getUserSide();
    AUTO.prevBoard = curr;
    AUTO.prevFen = fen;
    clearHighlights();
    console.log('[auto] new game at startpos, userSide=', AUTO.userSide);
    if (AUTO.userSide !== 'w') return;
  } else if (diff.changed > 4) {
    console.log('[auto] reset baseline (changed=', diff.changed, ')');
    cachedUserSide = null;
    AUTO.userSide = getUserSide();
    AUTO.prevBoard = null;
    AUTO.prevFen = null;
    clearHighlights();
    return;
  } else if (fen === AUTO.prevFen) {
    return;
  } else {
    AUTO.prevBoard = curr;
    AUTO.prevFen = fen;
  }

  const sideToMove = diff.mover
    ? (diff.mover === 'w' ? 'b' : 'w')
    : (fen === STARTPOS_FEN ? 'w' : AUTO.userSide);
  if (sideToMove !== AUTO.userSide) {
    console.log('[auto] đối thủ vừa đi, đợi lượt user. moved=', diff.mover);
    return;
  }
  console.log('[auto] tới lượt user, gọi engine. fen=', fen, 'side=', sideToMove);

  AUTO.busy = true;
  try {
    const r = await fetch('http://127.0.0.1:8080/bestmove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen: `${fen} ${sideToMove} - - 0 1`, movetime: AUTO.movetime }),
    });
    const data = await r.json();
    if (data.bestmove && data.bestmove !== '(none)') {
      highlightMove(data.bestmove);
      console.log('[auto] suggest:', data.bestmove, `(${data.elapsed_ms}ms)`);
    }
  } catch (e) {
    console.warn('[auto] engine error:', e.message);
  } finally {
    AUTO.busy = false;
  }
}

function startAuto({ movetime = 1000 } = {}) {
  if (AUTO.enabled) return;
  if (!document.querySelector('#game-grid')) throw new Error('#game-grid not found');

  AUTO.enabled = true;
  AUTO.movetime = movetime;
  cachedUserSide = null;
  AUTO.userSide = getUserSide();
  AUTO.prevBoard = null;
  AUTO.prevFen = null;
  AUTO.busy = false;

  AUTO.pollTimer = setInterval(autoTick, 500);

  console.log('[auto] started, userSide=', AUTO.userSide);
  autoTick();
}

function stopAuto() {
  AUTO.enabled = false;
  if (AUTO.pollTimer) { clearInterval(AUTO.pollTimer); AUTO.pollTimer = null; }
  clearHighlights();
  console.log('[auto] stopped');
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'PING') {
    sendResponse({ reply: 'pong', url: location.href });
    return;
  }
  if (msg.type === 'READ_BOARD') {
    try {
      const fenBoard = readBoardToFen();
      const sideToMove = msg.side || 'w';
      const fen = `${fenBoard} ${sideToMove} - - 0 1`;
      sendResponse({ ok: true, fen });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
    return;
  }
  if (msg.type === 'HIGHLIGHT_MOVE') {
    const ok = highlightMove(msg.uci);
    sendResponse({ ok });
    return;
  }
  if (msg.type === 'CLEAR_HIGHLIGHT') {
    clearHighlights();
    sendResponse({ ok: true });
    return;
  }
  if (msg.type === 'AUTO_START') {
    try {
      startAuto({ movetime: msg.movetime || 1000 });
      sendResponse({ ok: true, userSide: AUTO.userSide });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
    return;
  }
  if (msg.type === 'AUTO_STOP') {
    stopAuto();
    sendResponse({ ok: true });
    return;
  }
  if (msg.type === 'AUTO_STATE') {
    sendResponse({ ok: true, enabled: AUTO.enabled, userSide: AUTO.userSide });
    return;
  }
});
