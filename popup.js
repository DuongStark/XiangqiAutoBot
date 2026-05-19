const statusEl = document.getElementById('status');
const runStateEl = document.getElementById('runState');
const startBtn = document.getElementById('startBot');
const clickBtn = document.getElementById('clickToggle');
const adaptiveBtn = document.getElementById('adaptiveToggle');
const modeSwitch = document.getElementById('modeSwitch');
const modeTitle = document.getElementById('modeTitle');
const modeSub = document.getElementById('modeSub');
const skillEl = document.getElementById('skill');
const SERVER_BASE = 'http://127.0.0.1:8080';
const BOARD_NOT_FOUND_MESSAGE = 'Open a game board first, or refresh the page.';

function setStatus(msg, kind) {
  statusEl.textContent = msg;
  statusEl.className = `status ${kind || ''}`.trim();
}

function setRunState(enabled, side) {
  const label = enabled ? `Running ${side || ''}`.trim() : 'Idle';
  runStateEl.className = enabled ? 'pill on' : 'pill';
  runStateEl.innerHTML = `<span class="dot"></span><span>${label}</span>`;
  startBtn.textContent = enabled ? 'Stop helper' : 'Start helper';
  startBtn.classList.toggle('stop', !!enabled);
}

function setModeLabel(thinking) {
  modeTitle.textContent = thinking ? 'Human-like mode' : 'Fast mode';
  modeSub.textContent = thinking
    ? 'Adds phase-based think time before moving.'
    : 'Move as soon as engine returns.';
  modeSwitch.classList.toggle('active', !!thinking);
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
    setModeLabel(st.adaptive);
    if (st.skill) skillEl.value = String(st.skill);
    clickBtn.textContent = st.autoClick ? 'Auto move' : 'View only';

    clickBtn.classList.toggle('active', !!st.autoClick);
  } catch {
    setRunState(false);
    setModeLabel(false);
    clickBtn.textContent = 'Auto move';
    clickBtn.classList.remove('active');
  }
}

async function startBot(tab) {
  setStatus('Checking server...');

  if (!(await serverIsHealthy())) {
    setStatus('Start server first: python server.py', 'err');
    return;
  }

  const movetime = parseInt(document.getElementById('movetime').value, 10);
  const skill = parseInt(skillEl.value, 10);
  const auto = await chrome.tabs.sendMessage(tab.id, { type: 'AUTO_START', movetime, skill });
  if (!auto.ok) {
    const msg = auto.error === '#game-grid not found' ? BOARD_NOT_FOUND_MESSAGE : auto.error;
    setStatus(`Auto error: ${msg}`, 'err');
    return;
  }

  await chrome.tabs.sendMessage(tab.id, { type: 'AUTO_CLICK_TOGGLE', enabled: true });
  setStatus(`Helper started (${auto.userSide})`, 'ok');
}

startBtn.addEventListener('click', async () => {
  try {
    const tab = await ensureXiangqiTab();
    const st = await chrome.tabs.sendMessage(tab.id, { type: 'AUTO_STATE' });

    if (st.enabled) {
      await chrome.tabs.sendMessage(tab.id, { type: 'AUTO_STOP' });
      setStatus('Helper stopped.', 'ok');
    } else {
      await startBot(tab);
    }

    refreshButtons();
  } catch (e) {
    setStatus(`Error: ${e.message}`, 'err');
  }
});

clickBtn.addEventListener('click', async () => {
  try {
    const tab = await ensureXiangqiTab();
    const st = await chrome.tabs.sendMessage(tab.id, { type: 'AUTO_STATE' });
    const res = await chrome.tabs.sendMessage(tab.id, {
      type: 'AUTO_CLICK_TOGGLE', enabled: !st.autoClick,
    });
    setStatus(res.autoClick ? 'Auto move on.' : 'Auto move off.', 'ok');
    refreshButtons();
  } catch (e) {
    setStatus(`Error: ${e.message}`, 'err');
  }
});

skillEl.addEventListener('input', async () => {
  try {
    const tab = await ensureXiangqiTab();
    const skill = parseInt(skillEl.value, 10);
    await chrome.tabs.sendMessage(tab.id, { type: 'SKILL_SET', skill });
  } catch {
  }
});

async function toggleThinkingMode() {
  const tab = await ensureXiangqiTab();
  const st = await chrome.tabs.sendMessage(tab.id, { type: 'AUTO_STATE' });
  const res = await chrome.tabs.sendMessage(tab.id, {
    type: 'ADAPTIVE_TOGGLE', enabled: !st.adaptive,
  });
  setStatus(res.adaptive ? 'Human-like mode on.' : 'Fast mode on.', 'ok');
  refreshButtons();
}

adaptiveBtn.addEventListener('click', async () => {
  try {
    await toggleThinkingMode();
  } catch (e) {
    setStatus(`Error: ${e.message}`, 'err');
  }
});

adaptiveBtn.addEventListener('keydown', async (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  try {
    await toggleThinkingMode();
  } catch (e) {
    setStatus(`Error: ${e.message}`, 'err');
  }
});

refreshButtons();
