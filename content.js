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

function refreshUserSide() {
  cachedUserSide = null;
  return getUserSide();
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

const STATUS_ID = 'xq-bot-status';
const BOARD_NOT_FOUND_MESSAGE = 'Open a game board first, or refresh the page.';

function ensureStatusEl() {
  let el = document.getElementById(STATUS_ID);
  if (el) return el;
  el = document.createElement('div');
  el.id = STATUS_ID;
  Object.assign(el.style, {
    position: 'fixed', top: '16px', left: '16px', zIndex: 99999,
    minWidth: '200px', maxWidth: '280px',
    background: 'rgba(244,223,184,0.94)',
    color: '#24120b',
    font: '500 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    padding: '12px 14px', borderRadius: '8px',
    border: '1px solid rgba(74,36,23,0.24)',
    boxShadow: '0 8px 22px -8px rgba(36,18,11,0.45), inset 0 0 0 1px rgba(255,255,255,0.22)',
    backdropFilter: 'blur(10px) saturate(1.4)',
    WebkitBackdropFilter: 'blur(10px) saturate(1.4)',
    pointerEvents: 'none',
    transition: 'opacity 0.18s ease',
    letterSpacing: '0.01em',
  });
  el.innerHTML = `
    <div class="xq-bot-header" style="display:flex; align-items:center; gap:8px; margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid rgba(74,36,23,0.18);">
      <div style="width:18px; height:18px; display:grid; place-items:center; border-radius:50%; background:#a62018; color:#ffe8bd; font:800 11px/1 'Microsoft YaHei', serif;">&#24101;</div>
      <div style="font-size:11px; font-weight:800; letter-spacing:0.08em; color:#4a2417; text-transform:uppercase;">Xiangqi Analysis Helper</div>
    </div>
    <div class="xq-bot-body"></div>
  `;
  document.body.appendChild(el);
  return el;
}

function setBotStatus(html) {
  if (!html) {
    document.getElementById(STATUS_ID)?.remove();
    return;
  }
  const el = ensureStatusEl();
  const body = el.querySelector('.xq-bot-body');
  if (body) body.innerHTML = html;
}

let countdownTimer = null;

function startCountdown(label, totalMs, color = '#7dd3fc') {
  if (countdownTimer) clearInterval(countdownTimer);
  const start = performance.now();
  const tick = () => {
    const remain = Math.max(0, totalMs - (performance.now() - start));
    const sec = (remain / 1000).toFixed(1);
    const pct = Math.max(0, Math.min(100, ((totalMs - remain) / totalMs) * 100));
    setBotStatus(
      `<div style="color:${color}; font-weight:800; font-size:14px;">${label}</div>` +
      `<div style="font-size:22px; font-weight:800; font-variant-numeric:tabular-nums; color:#24120b; margin-top:2px;">${sec}<span style="font-size:13px; color:#73513a; font-weight:600;">s</span></div>` +
      `<div style="margin-top:8px; height:3px; background:rgba(74,36,23,0.16); border-radius:2px; overflow:hidden;">` +
        `<div style="width:${pct}%; height:100%; background:${color}; border-radius:2px; transition:width 0.1s linear;"></div>` +
      `</div>`
    );
    if (remain <= 0) { clearInterval(countdownTimer); countdownTimer = null; }
  };
  tick();
  countdownTimer = setInterval(tick, 100);
}

function stopCountdown() {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
}

function dispatchMouse(el, type, x, y) {
  el.dispatchEvent(new MouseEvent(type, {
    bubbles: true, cancelable: true, view: window, button: 0,
    clientX: x, clientY: y,
  }));
}

function fireDrag(el, type, x, y, dataTransfer) {
  const ev = new DragEvent(type, {
    bubbles: true, cancelable: true, composed: true, view: window,
    clientX: x, clientY: y, button: 0, dataTransfer,
  });
  try {
    Object.defineProperty(ev, 'dataTransfer', { value: dataTransfer, writable: false });
  } catch {}
  el.dispatchEvent(ev);
}

function findPieceWrapperAt(file, uciRank) {
  const userSide = getUserSide();
  let pageR, pageColIdx;
  if (userSide === 'b') { pageR = 10 - uciRank; pageColIdx = 8 - file; }
  else { pageR = uciRank + 1; pageColIdx = file; }
  const wrappers = document.querySelectorAll('#game-grid .pieces-container [class*="PieceWrapper"]');
  let best = null, bestD = Infinity;
  const sq = findSquareEl(file, uciRank);
  if (!sq) return null;
  const sr = sq.getBoundingClientRect();
  const sx = sr.left + sr.width / 2, sy = sr.top + sr.height / 2;
  for (const w of wrappers) {
    const r = w.getBoundingClientRect();
    const d = (r.left + r.width / 2 - sx) ** 2 + (r.top + r.height / 2 - sy) ** 2;
    if (d < bestD) { bestD = d; best = w; }
  }
  if (best && bestD < (sr.width * sr.width) / 4) return best;
  return null;
}

function logNormal(medianMs, sigma = 0.5) {
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return medianMs * Math.exp(sigma * z);
}

function pickProbeTime(plyCount) {
  if (plyCount < 8) return 500 + Math.random() * 400;
  if (plyCount < 40) return 700 + Math.random() * 500;
  return 900 + Math.random() * 600;
}

function parseClockMs(text) {
  const m = String(text || '').trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!m) return null;
  return (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) * 1000;
}

function readOwnClockMs() {
  const times = [];
  for (const el of document.querySelectorAll('body *')) {
    const text = el.textContent;
    if (!text || text.length > 5) continue;
    const ms = parseClockMs(text);
    if (ms === null) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    times.push({ ms, y: rect.top + rect.height / 2 });
  }
  times.sort((a, b) => b.y - a.y);
  return times[0]?.ms ?? null;
}

function totalThinkCap(plyCount, remainingMs) {
  if (remainingMs !== null && remainingMs < 30000) return 900;
  if (plyCount < 10) return 3000;
  if (plyCount < 40) return 5000;
  return 7000;
}

function pickSearchTime(gap, score, plyCount, remainingMs) {
  const phase = plyCount < 10 ? 'opening' : plyCount < 40 ? 'middle' : 'endgame';
  let median, sigma;

  if (remainingMs !== null && remainingMs < 30000) {
    median = 500; sigma = 0.3;
  } else if (phase === 'opening') {
    median = gap !== null && gap >= 400 ? 1200 : 1800;
    sigma = 0.3;
  } else if (Math.abs(score ?? 0) >= 90000) {
    median = 1800; sigma = 0.3;
  } else if (gap === null || gap === undefined) {
    median = phase === 'middle' ? 3000 : 4000;
    sigma = 0.35;
  } else if (gap >= 400) {
    median = phase === 'middle' ? 2200 : 3000;
    sigma = 0.3;
  } else if (gap >= 150) {
    median = phase === 'middle' ? 2800 : 3800;
    sigma = 0.35;
  } else {
    median = phase === 'middle' ? 3500 : 4500;
    sigma = 0.35;
  }

  let t = logNormal(median, sigma);
  const cap = remainingMs !== null && remainingMs < 30000
    ? 900
    : (phase === 'opening' ? 2500 : phase === 'middle' ? 5000 : 7000);
  return Math.max(400, Math.min(t, cap));
}

function pickReactionDelay(gap, score, plyCount) {
  const phase = plyCount < 10 ? 'opening' : plyCount < 40 ? 'middle' : 'endgame';
  let delay;

  if (Math.abs(score ?? 0) >= 90000) {
    delay = 700 + Math.random() * 900;
  } else if (gap !== null && gap !== undefined && gap >= 400) {
    delay = 650 + Math.random() * 850;
  } else if (gap !== null && gap !== undefined && gap < 150) {
    delay = 1300 + Math.random() * 1700;
  } else {
    delay = 900 + Math.random() * 1200;
  }

  if (phase === 'middle') delay *= 1.15;
  if (phase === 'endgame') delay *= 1.05;
  if (Math.random() < 0.12) delay += 900 + Math.random() * 2200;

  return Math.min(delay, 6500);
}

async function requestBestMove(fen, sideToMove, movetime, plies, record = true, style = 'best') {
  const r = await fetch('http://127.0.0.1:8080/bestmove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fen: `${fen} ${sideToMove} - - 0 1`,
      movetime,
      plies,
      record,
      style,
      skill: style === 'sparring' ? AUTO.skill : 5,
    }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function estimatePliesFromMaterial(fen) {
  const startBoard = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR';
  if (fen === startBoard) return 0;
  const startPieces = startBoard.replace(/[\d/]/g, '').length;
  const currPieces = fen.replace(/[\d/]/g, '').length;
  const captured = startPieces - currPieces;
  return Math.max(captured * 2, 1);
}

async function autoClickMove(uci) {
  const mv = parseUciMove(uci);
  if (!mv) return false;
  const fromPiece = findPieceWrapperAt(mv.from.file, mv.from.rank);
  const toSquare = findSquareEl(mv.to.file, mv.to.rank);
  if (!fromPiece || !toSquare) {
    console.warn('[auto-click] not found', { mv, fromPiece: !!fromPiece, toSquare: !!toSquare });
    return false;
  }
  const dragEl = fromPiece.querySelector('.piece-drag-container') || fromPiece;
  const fr = dragEl.getBoundingClientRect();
  const tr = toSquare.getBoundingClientRect();
  const fx = fr.left + fr.width / 2, fy = fr.top + fr.height / 2;
  const tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2;

  const dt = new DataTransfer();
  try { dt.effectAllowed = 'move'; } catch {}
  try { dt.setData('text/plain', 'piece'); } catch {}

  dispatchMouse(dragEl, 'mousedown', fx, fy);
  fireDrag(dragEl, 'dragstart', fx, fy, dt);
  await new Promise(r => setTimeout(r, 50));

  const dropTarget = document.elementFromPoint(tx, ty) || toSquare;
  try { dt.dropEffect = 'move'; } catch {}
  fireDrag(dropTarget, 'dragenter', tx, ty, dt);
  fireDrag(dropTarget, 'dragover', tx, ty, dt);
  await new Promise(r => setTimeout(r, 50));
  fireDrag(dropTarget, 'drop', tx, ty, dt);
  fireDrag(dragEl, 'dragend', tx, ty, dt);
  dispatchMouse(dropTarget, 'mouseup', tx, ty);
  return true;
}

const AUTO = {
  enabled: false,
  movetime: 1000,
  userSide: null,
  prevBoard: null,
  prevFen: null,
  pollTimer: null,
  busy: false,
  autoClick: false,
  adaptive: false,
  plyCount: 0,
  skill: 4,
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
    AUTO.plyCount = 0;
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
    AUTO.plyCount = 0;
    clearHighlights();
    return;
  } else if (fen === AUTO.prevFen) {
    return;
  } else {
    if (AUTO.prevFen === null) {
      AUTO.plyCount = estimatePliesFromMaterial(fen);
    } else {
      AUTO.plyCount += 1;
    }
    AUTO.prevBoard = curr;
    AUTO.prevFen = fen;
  }

  const sideToMove = diff.mover
    ? (diff.mover === 'w' ? 'b' : 'w')
    : (fen === STARTPOS_FEN ? 'w' : AUTO.userSide);
  if (sideToMove !== AUTO.userSide) {
    setBotStatus(
      `<div><div style="font-size:13px; font-weight:800; color:#4a2417;">Waiting</div>` +
      `<div style="font-size:11px; color:#73513a; margin-top:2px;">opponent is thinking...</div></div>`
    );
    console.log('[auto] opponent moved, waiting for user turn. moved=', diff.mover);
    return;
  }
  console.log('[auto] user turn, calling engine. fen=', fen, 'side=', sideToMove);

  AUTO.busy = true;
  try {
    const plies = AUTO.plyCount;
    let movetime = AUTO.movetime;

    setBotStatus(
      `<div><div style="font-size:13px; font-weight:800; color:#a62018;">Reading position</div>` +
      `<div style="font-size:11px; color:#73513a; margin-top:2px;">engine: ${movetime}ms</div></div>`
    );

    let data;
    if (AUTO.adaptive) {
      const remainingMs = readOwnClockMs();
      const probeTime = Math.round(pickProbeTime(plies));
      setBotStatus(
        `<div><div style="font-size:13px; font-weight:800; color:#a62018;">Position scan</div>` +
        `<div style="font-size:11px; color:#73513a; margin-top:2px;">probe: ${probeTime}ms</div></div>`
      );
      const probe = await requestBestMove(fen, sideToMove, probeTime, plies, false, 'sparring');
      movetime = Math.round(pickSearchTime(probe.gap, probe.score, plies, remainingMs));
      movetime = Math.min(movetime, Math.max(400, totalThinkCap(plies, remainingMs) - probeTime));

      if (movetime > probeTime + 500) {
        setBotStatus(
          `<div><div style="font-size:13px; font-weight:800; color:#a62018;">Human-like search</div>` +
          `<div style="font-size:11px; color:#73513a; margin-top:2px;">engine: ${movetime}ms, gap=${probe.gap ?? '?'}</div></div>`
        );
      }
      data = await requestBestMove(fen, sideToMove, movetime, plies, true, 'sparring');
    } else {
      setBotStatus(
        `<div><div style="font-size:13px; font-weight:800; color:#a62018;">Fast search</div>` +
        `<div style="font-size:11px; color:#73513a; margin-top:2px;">engine: ${movetime}ms</div></div>`
      );
      data = await requestBestMove(fen, sideToMove, movetime, plies, true, 'best');
    }
    if (data.bestmove && data.bestmove !== '(none)') {
      highlightMove(data.bestmove);
      console.log('[auto] suggest:', data.bestmove,
        `score=${data.score} gap=${data.gap} d=${data.depth} t=${movetime}ms`);

      if (AUTO.autoClick) {
        const delay = AUTO.adaptive
          ? Math.round(pickReactionDelay(data.gap, data.score, plies))
          : 0;
        const phase = plies < 10 ? 'opening' : plies < 40 ? 'middle' : 'endgame';
        const difficulty = data.gap === null ? '?' :
          data.gap >= 400 ? 'clear' :
          data.gap >= 150 ? 'normal' : 'complex';
        const scoreStr = Math.abs(data.score ?? 0) >= 90000
          ? (data.score > 0 ? 'M' : '-M')
          : ((data.score ?? 0) / 100).toFixed(2);

        if (delay > 0) {
          startCountdown(
            `${data.bestmove}  -  ${scoreStr}`,
            delay,
            difficulty === 'complex' ? '#a62018' : difficulty === 'clear' ? '#2f7d46' : '#b7791f'
          );
          setTimeout(() => {
            const el = document.getElementById(STATUS_ID);
            const body = el?.querySelector('.xq-bot-body');
            if (body) {
              body.insertAdjacentHTML('beforeend',
                `<div style="font-size:11px; color:#73513a; margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">` +
                  `<span style="background:rgba(74,36,23,0.10); padding:2px 6px; border-radius:4px;">${phase}</span>` +
                  `<span style="background:rgba(74,36,23,0.10); padding:2px 6px; border-radius:4px;">${difficulty}</span>` +
                  `<span style="background:rgba(74,36,23,0.10); padding:2px 6px; border-radius:4px;">d=${data.depth}</span>` +
                `</div>`
              );
            }
          }, 50);
        }

        console.log('[auto-click] delay=', delay, 'ms', `(phase=${phase}, ${difficulty})`);
        await new Promise(r => setTimeout(r, delay));
        if (AUTO.enabled && AUTO.autoClick) {
          const ok = await autoClickMove(data.bestmove);
          stopCountdown();
          setBotStatus(
            `<div><div style="font-size:14px; font-weight:800; color:#2f7d46;">${data.bestmove}</div>` +
            `<div style="font-size:11px; color:#73513a; margin-top:2px;">eval ${scoreStr} - ${phase}</div></div>`
          );
          console.log('[auto-click]', data.bestmove, '->', ok ? 'sent' : 'FAILED');
        }
      } else {
        const scoreStr = Math.abs(data.score ?? 0) >= 90000
          ? (data.score > 0 ? 'M' : '-M')
          : ((data.score ?? 0) / 100).toFixed(2);
        setBotStatus(
          `<div><div style="font-size:14px; font-weight:800; color:#2f7d46;">${data.bestmove}</div>` +
          `<div style="font-size:11px; color:#73513a; margin-top:2px;">eval ${scoreStr} - d=${data.depth}</div></div>`
        );
      }
    }
  } catch (e) {
    setBotStatus(
      `<div><div style="font-size:13px; font-weight:800; color:#a62018;">Engine error</div>` +
      `<div style="font-size:11px; color:#73513a; margin-top:2px;">${e.message}</div></div>`
    );
    console.warn('[auto] engine error:', e.message);
  } finally {
    AUTO.busy = false;
  }
}

function startAuto({ movetime = 1000, skill = 4 } = {}) {
  if (AUTO.enabled) return;
  if (!document.querySelector('#game-grid')) {
    setBotStatus(
      `<div><div style="font-size:13px; font-weight:800; color:#a62018;">Board not found</div>` +
      `<div style="font-size:11px; color:#73513a; margin-top:2px;">${BOARD_NOT_FOUND_MESSAGE}</div></div>`
    );
    throw new Error(BOARD_NOT_FOUND_MESSAGE);
  }

  AUTO.enabled = true;
  AUTO.movetime = movetime;
  AUTO.skill = skill;
  cachedUserSide = null;
  AUTO.userSide = getUserSide();
  AUTO.prevBoard = null;
  AUTO.prevFen = null;
  AUTO.busy = false;
  AUTO.plyCount = 0;

  AUTO.pollTimer = setInterval(autoTick, 500);

  console.log('[auto] started, userSide=', AUTO.userSide);
  autoTick();
}

function stopAuto() {
  AUTO.enabled = false;
  if (AUTO.pollTimer) { clearInterval(AUTO.pollTimer); AUTO.pollTimer = null; }
  stopCountdown();
  setBotStatus(null);
  clearHighlights();
  console.log('[auto] stopped');
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'DETECT_SIDE') {
    sendResponse({ ok: true, userSide: refreshUserSide() });
    return;
  }
  if (msg.type === 'AUTO_START') {
    try {
      startAuto({ movetime: msg.movetime || 1000, skill: msg.skill || AUTO.skill });
      sendResponse({ ok: true, userSide: AUTO.userSide, skill: AUTO.skill });
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
  if (msg.type === 'AUTO_CLICK_TOGGLE') {
    AUTO.autoClick = !!msg.enabled;
    console.log('[auto-click] enabled=', AUTO.autoClick);
    sendResponse({ ok: true, autoClick: AUTO.autoClick });
    return;
  }
  if (msg.type === 'ADAPTIVE_TOGGLE') {
    AUTO.adaptive = !!msg.enabled;
    console.log('[auto] adaptive=', AUTO.adaptive);
    sendResponse({ ok: true, adaptive: AUTO.adaptive });
    return;
  }
  if (msg.type === 'SKILL_SET') {
    AUTO.skill = msg.skill || AUTO.skill;
    sendResponse({ ok: true, skill: AUTO.skill });
    return;
  }
  if (msg.type === 'AUTO_STATE') {
    sendResponse({
      ok: true, enabled: AUTO.enabled, userSide: AUTO.userSide,
      autoClick: AUTO.autoClick,
      adaptive: AUTO.adaptive, plyCount: AUTO.plyCount, skill: AUTO.skill,
    });
    return;
  }
});
