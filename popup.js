const statusEl = document.getElementById('status');

function setStatus(msg, kind) {
  statusEl.textContent = msg;
  statusEl.className = kind || '';
}

document.getElementById('ping').addEventListener('click', async () => {
  setStatus('Đang ping content script...');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url || !tab.url.startsWith('https://play.xiangqi.com/')) {
      setStatus('Hãy mở tab play.xiangqi.com trước.', 'err');
      return;
    }
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
    setStatus(`OK: ${res.reply} @ ${res.url}`, 'ok');
  } catch (e) {
    setStatus(`Lỗi: ${e.message}`, 'err');
  }
});

document.getElementById('testEngine').addEventListener('click', async () => {
  setStatus('Đang gọi Pikafish (FEN khởi đầu, 500ms)...');
  const startFen = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';
  try {
    const r = await fetch('http://127.0.0.1:8080/bestmove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen: startFen, movetime: 500 }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    setStatus(`bestmove: ${data.bestmove} (${data.elapsed_ms}ms)`, 'ok');
  } catch (e) {
    setStatus(`Lỗi: ${e.message}. Server chạy chưa?`, 'err');
  }
});

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function resolveSide(tab, raw) {
  if (raw === 'w' || raw === 'b') return raw;
  const st = await chrome.tabs.sendMessage(tab.id, { type: 'AUTO_STATE' }).catch(() => null);
  return st?.userSide || 'w';
}

document.getElementById('readBoard').addEventListener('click', async () => {
  setStatus('Đang đọc bàn cờ...');
  try {
    const tab = await activeTab();
    const side = await resolveSide(tab, document.getElementById('side').value);
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'READ_BOARD', side });
    if (!res.ok) { setStatus(`Lỗi: ${res.error}`, 'err'); return; }
    setStatus(`[${side}] FEN: ${res.fen}`, 'ok');
    console.log('[popup] FEN:', res.fen);
  } catch (e) {
    setStatus(`Lỗi: ${e.message}`, 'err');
  }
});

document.getElementById('suggest').addEventListener('click', async () => {
  setStatus('Đang đọc bàn cờ...');
  try {
    const tab = await activeTab();
    const side = await resolveSide(tab, document.getElementById('side').value);
    const movetime = parseInt(document.getElementById('movetime').value, 10);

    const board = await chrome.tabs.sendMessage(tab.id, { type: 'READ_BOARD', side });
    if (!board.ok) { setStatus(`Đọc bàn lỗi: ${board.error}`, 'err'); return; }

    setStatus(`Đang nghĩ (${movetime}ms, lượt ${side})...`);
    const r = await fetch('http://127.0.0.1:8080/bestmove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen: board.fen, movetime }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (!data.bestmove || data.bestmove === '(none)') {
      setStatus('Engine không có nước đi (chiếu hết hoặc FEN sai?)', 'err');
      return;
    }

    await chrome.tabs.sendMessage(tab.id, { type: 'HIGHLIGHT_MOVE', uci: data.bestmove });
    setStatus(`${data.bestmove} (${data.elapsed_ms}ms, lượt ${side})`, 'ok');
  } catch (e) {
    setStatus(`Lỗi: ${e.message}`, 'err');
  }
});

const autoBtn = document.getElementById('autoToggle');
const clickBtn = document.getElementById('clickToggle');

async function refreshButtons() {
  try {
    const tab = await activeTab();
    const st = await chrome.tabs.sendMessage(tab.id, { type: 'AUTO_STATE' });
    autoBtn.textContent = st.enabled ? `Auto-suggest: ON (${st.userSide})` : 'Auto-suggest: OFF';
    clickBtn.textContent = st.autoClick ? `Auto-click: ON (${st.clickDelayMs}ms)` : 'Auto-click: OFF';
  } catch {
    autoBtn.textContent = 'Auto-suggest: OFF';
    clickBtn.textContent = 'Auto-click: OFF';
  }
}

autoBtn.addEventListener('click', async () => {
  try {
    const tab = await activeTab();
    const st = await chrome.tabs.sendMessage(tab.id, { type: 'AUTO_STATE' });
    if (st.enabled) {
      await chrome.tabs.sendMessage(tab.id, { type: 'AUTO_STOP' });
      setStatus('Auto-suggest OFF', 'ok');
    } else {
      const movetime = parseInt(document.getElementById('movetime').value, 10);
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'AUTO_START', movetime });
      if (!res.ok) { setStatus(`Lỗi: ${res.error}`, 'err'); return; }
      setStatus(`Auto-suggest ON, lượt user = ${res.userSide}`, 'ok');
    }
    refreshButtons();
  } catch (e) {
    setStatus(`Lỗi: ${e.message}`, 'err');
  }
});

clickBtn.addEventListener('click', async () => {
  try {
    const tab = await activeTab();
    const st = await chrome.tabs.sendMessage(tab.id, { type: 'AUTO_STATE' });
    const delayMs = parseInt(document.getElementById('clickDelay').value, 10);
    const res = await chrome.tabs.sendMessage(tab.id, {
      type: 'AUTO_CLICK_TOGGLE', enabled: !st.autoClick, delayMs,
    });
    setStatus(res.autoClick ? `Auto-click ON (${res.clickDelayMs}ms)` : 'Auto-click OFF', 'ok');
    refreshButtons();
  } catch (e) {
    setStatus(`Lỗi: ${e.message}`, 'err');
  }
});

refreshButtons();
