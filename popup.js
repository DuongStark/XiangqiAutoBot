const statusEl = document.getElementById('status');
const runStateEl = document.getElementById('runState');
const autoBtn = document.getElementById('autoToggle');
const clickBtn = document.getElementById('clickToggle');
const adaptiveBtn = document.getElementById('adaptiveToggle');
const strengthEl = document.getElementById('strength');
const SERVER_BASE = 'http://127.0.0.1:8080';

function setStatus(msg, kind) {
  statusEl.textContent = msg;
  statusEl.className = `status ${kind || ''}`.trim();
}

function setRunState(enabled, side) {
  const label = enabled ? `Running ${side || ''}`.trim() : 'Idle';
  runStateEl.className = enabled ? 'pill on' : 'pill';
  runStateEl.innerHTML = `<span class="dot"></span><span>${label}</span>`;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function ensureXiangqiTab() {
  const tab = await activeTab();
  if (!tab.url || !tab.url.startsWith('https://play.xiangqi.com/')) {
    throw new Error('Open play.xiangqi.com first.');
  }
  return tab;
}

async function resolveSide(tab, raw) {
  if (raw === 'w' || raw === 'b') return raw;
  const detected = await chrome.tabs.sendMessage(tab.id, { type: 'DETECT_SIDE' }).catch(() => null);
  if (detected?.userSide) return detected.userSide;
  const st = await chrome.tabs.sendMessage(tab.id, { type: 'AUTO_STATE' }).catch(() => null);
  return st?.userSide || 'w';
}

async function serverIsHealthy() {
  try {
    const r = await fetch(`${SERVER_BASE}/health`);
    if (!r.ok) return false;
    const data = await r.json();
    return !!data.ok;
  } catch {
    return false;
  }
}

async function refreshButtons() {
  try {
    const tab = await activeTab();
    const st = await chrome.tabs.sendMessage(tab.id, { type: 'AUTO_STATE' });

    setRunState(st.enabled, st.userSide);
    autoBtn.textContent = st.enabled ? `Auto-suggest ${st.userSide || ''}`.trim() : 'Auto-suggest';
    clickBtn.textContent = st.autoClick ? `Auto-click ${st.clickDelayMs}ms` : 'Auto-click';
    adaptiveBtn.textContent = st.adaptive ? 'Adaptive timing' : 'Fixed timing';
    if (st.strength) strengthEl.value = String(st.strength);

    autoBtn.classList.toggle('active', !!st.enabled);
    clickBtn.classList.toggle('active', !!st.autoClick);
    adaptiveBtn.classList.toggle('active', !!st.adaptive);
    adaptiveBtn.classList.toggle('warn', !st.adaptive);
  } catch {
    setRunState(false);
    autoBtn.textContent = 'Auto-suggest';
    clickBtn.textContent = 'Auto-click';
    adaptiveBtn.textContent = 'Adaptive timing';
    autoBtn.classList.remove('active');
    clickBtn.classList.remove('active');
    adaptiveBtn.classList.add('active');
    adaptiveBtn.classList.remove('warn');
  }
}

document.getElementById('startBot').addEventListener('click', async () => {
  setStatus('Checking server...');
  try {
    const tab = await ensureXiangqiTab();

    if (!(await serverIsHealthy())) {
      setStatus('Server not running. Trying native host...');
      const native = await chrome.runtime.sendMessage({ type: 'NATIVE_START_SERVER' }).catch((e) => ({
        ok: false,
        error: e.message,
      }));
      if (!native?.ok && !(await serverIsHealthy())) {
        setStatus('Start server first: python server.py', 'err');
        return;
      }
    }

    const movetime = parseInt(document.getElementById('movetime').value, 10);
    const strength = parseInt(strengthEl.value, 10);
    const auto = await chrome.tabs.sendMessage(tab.id, { type: 'AUTO_START', movetime, strength });
    if (!auto.ok) {
      setStatus(`Auto error: ${auto.error}`, 'err');
      return;
    }

    const delayMs = parseInt(document.getElementById('clickDelay').value, 10);
    await chrome.tabs.sendMessage(tab.id, {
      type: 'AUTO_CLICK_TOGGLE', enabled: true, delayMs,
    });

    setStatus(`Bot started (${auto.userSide}, Elo ${auto.strength})`, 'ok');
    refreshButtons();
  } catch (e) {
    setStatus(`Error: ${e.message}`, 'err');
  }
});

document.getElementById('autoToggle').addEventListener('click', async () => {
  try {
    const tab = await ensureXiangqiTab();
    const st = await chrome.tabs.sendMessage(tab.id, { type: 'AUTO_STATE' });
    if (st.enabled) {
      await chrome.tabs.sendMessage(tab.id, { type: 'AUTO_STOP' });
      setStatus('Auto-suggest OFF', 'ok');
    } else {
      const movetime = parseInt(document.getElementById('movetime').value, 10);
      const strength = parseInt(strengthEl.value, 10);
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'AUTO_START', movetime, strength });
      if (!res.ok) {
        setStatus(`Error: ${res.error}`, 'err');
        return;
      }
      setStatus(`Auto-suggest ON, user side = ${res.userSide}, Elo ${res.strength}`, 'ok');
    }
    refreshButtons();
  } catch (e) {
    setStatus(`Error: ${e.message}`, 'err');
  }
});

strengthEl.addEventListener('change', async () => {
  try {
    const tab = await ensureXiangqiTab();
    const strength = parseInt(strengthEl.value, 10);
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'STRENGTH_SET', strength });
    setStatus(`Elo set to ${res.strength}`, 'ok');
    refreshButtons();
  } catch (e) {
    setStatus(`Error: ${e.message}`, 'err');
  }
});

document.getElementById('clickToggle').addEventListener('click', async () => {
  try {
    const tab = await ensureXiangqiTab();
    const st = await chrome.tabs.sendMessage(tab.id, { type: 'AUTO_STATE' });
    const delayMs = parseInt(document.getElementById('clickDelay').value, 10);
    const res = await chrome.tabs.sendMessage(tab.id, {
      type: 'AUTO_CLICK_TOGGLE', enabled: !st.autoClick, delayMs,
    });
    setStatus(res.autoClick ? `Auto-click ON (${res.clickDelayMs}ms)` : 'Auto-click OFF', 'ok');
    refreshButtons();
  } catch (e) {
    setStatus(`Error: ${e.message}`, 'err');
  }
});

document.getElementById('adaptiveToggle').addEventListener('click', async () => {
  try {
    const tab = await ensureXiangqiTab();
    const st = await chrome.tabs.sendMessage(tab.id, { type: 'AUTO_STATE' });
    const res = await chrome.tabs.sendMessage(tab.id, {
      type: 'ADAPTIVE_TOGGLE', enabled: !st.adaptive,
    });
    setStatus(res.adaptive ? 'Adaptive timing ON' : 'Fixed timing ON', 'ok');
    refreshButtons();
  } catch (e) {
    setStatus(`Error: ${e.message}`, 'err');
  }
});

document.getElementById('ping').addEventListener('click', async () => {
  setStatus('Pinging page...');
  try {
    const tab = await ensureXiangqiTab();
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
    setStatus(`OK: ${res.reply} @ ${res.url}`, 'ok');
  } catch (e) {
    setStatus(`Error: ${e.message}`, 'err');
  }
});

document.getElementById('testEngine').addEventListener('click', async () => {
  setStatus('Calling Pikafish with start position...');
  const startFen = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';
  try {
    const r = await fetch(`${SERVER_BASE}/bestmove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen: startFen, movetime: 500 }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    setStatus(`bestmove: ${data.bestmove} (${data.elapsed_ms}ms)`, 'ok');
  } catch (e) {
    setStatus(`Error: ${e.message}. Is server running?`, 'err');
  }
});

document.getElementById('readBoard').addEventListener('click', async () => {
  setStatus('Reading board...');
  try {
    const tab = await ensureXiangqiTab();
    const side = await resolveSide(tab, document.getElementById('side').value);
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'READ_BOARD', side });
    if (!res.ok) {
      setStatus(`Error: ${res.error}`, 'err');
      return;
    }
    setStatus(`[${side}] FEN: ${res.fen}`, 'ok');
    console.log('[popup] FEN:', res.fen);
  } catch (e) {
    setStatus(`Error: ${e.message}`, 'err');
  }
});

document.getElementById('suggest').addEventListener('click', async () => {
  setStatus('Reading board...');
  try {
    const tab = await ensureXiangqiTab();
    const side = await resolveSide(tab, document.getElementById('side').value);
    const movetime = parseInt(document.getElementById('movetime').value, 10);
    const strength = parseInt(strengthEl.value, 10);

    const board = await chrome.tabs.sendMessage(tab.id, { type: 'READ_BOARD', side });
    if (!board.ok) {
      setStatus(`Read board error: ${board.error}`, 'err');
      return;
    }

    setStatus(`Thinking ${movetime}ms, side ${side}...`);
    const r = await fetch(`${SERVER_BASE}/bestmove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen: board.fen, movetime, style: 'sparring', strength }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (!data.bestmove || data.bestmove === '(none)') {
      setStatus('Engine returned no move. Checkmate or wrong FEN?', 'err');
      return;
    }

    await chrome.tabs.sendMessage(tab.id, { type: 'HIGHLIGHT_MOVE', uci: data.bestmove });
    setStatus(`${data.bestmove} (${data.elapsed_ms}ms, side ${side})`, 'ok');
  } catch (e) {
    setStatus(`Error: ${e.message}`, 'err');
  }
});

refreshButtons();
