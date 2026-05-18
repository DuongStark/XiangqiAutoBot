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

function readBoardToFen() {
  const grid = document.querySelector('#game-grid');
  if (!grid) throw new Error('#game-grid not found');

  const squares = [...grid.querySelectorAll('.square')];
  if (squares.length !== 90) throw new Error(`expected 90 squares, got ${squares.length}`);

  const squareCenters = squares.map(sq => {
    const m = sq.className.match(/(\d+)-([a-i])/);
    if (!m) return null;
    const r = parseInt(m[1], 10);
    const file = m[2].charCodeAt(0) - 'a'.charCodeAt(0);
    const rank = 10 - r;
    const rect = sq.getBoundingClientRect();
    return { rank, file, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
  }).filter(Boolean);

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
    if (best) board[best.rank][best.file] = ch;
  }

  const ranks = board.map(row => {
    let s = '', empty = 0;
    for (const c of row) {
      if (c === null) { empty++; }
      else { if (empty) { s += empty; empty = 0; } s += c; }
    }
    if (empty) s += empty;
    return s;
  });

  return ranks.join('/');
}

function findSquareEl(file, uciRank) {
  const r = uciRank + 1;
  const col = String.fromCharCode('a'.charCodeAt(0) + file);
  return document.querySelector(`#game-grid .square.${CSS.escape(`${r}-${col}`)}`)
      || [...document.querySelectorAll(`#game-grid .square`)].find(s => s.className.includes(` ${r}-${col}`));
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

function clearHighlights() {
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
  setTimeout(clearHighlights, 8000);
  return true;
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
});
